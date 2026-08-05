/**
 * Dadu Emosi - Pedal Juara
 * Core interactive logic, 3D dice physics calculations, audio synthesis, and custom face upload persistence.
 */

// Global State
let soundEnabled = true;
let isRolling = false;
let currentRotX = -20;
let currentRotY = 30;
let diceRollHistory = [];

// IndexedDB config
const DB_NAME = 'DaduEmosiDB';
const DB_VERSION = 1;
const STORE_NAME = 'faces';
let db = null;

// Emotion Definitions (Sisi 1-6)
const EMOTIONS = {
  1: { name: 'Bahagia', emoji: '😊', color: '#ffc107' },
  2: { name: 'Sedih', emoji: '😢', color: '#0d6efd' },
  3: { name: 'Marah', emoji: '😡', color: '#dc3545' },
  4: { name: 'Takut/Gugup', emoji: '😰', color: '#6f42c1' },
  5: { name: 'Terkejut', emoji: '😲', color: '#fd7e14' },
  6: { name: 'Mual/Menjijikkan', emoji: '🤢', color: '#828a2b' }
};

// Base 3D rotation values to face the camera directly
const FACE_ROTATIONS = {
  1: { x: 0, y: 0 },       // Front
  2: { x: 0, y: 180 },     // Back
  3: { x: -90, y: 0 },     // Top
  4: { x: 90, y: 0 },      // Bottom
  5: { x: 0, y: 90 },      // Left
  6: { x: 0, y: -90 }      // Right
};

// DOM Elements
const diceCube = document.getElementById('diceCube');
const diceShadow = document.getElementById('diceShadow');
const btnRoll = document.getElementById('btnRoll');
const btnToggleSound = document.getElementById('btnToggleSound');
const soundIcon = document.getElementById('soundIcon');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const settingsModal = document.getElementById('settingsModal');
const btnResetAll = document.getElementById('btnResetAll');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const uploadForm = document.getElementById('uploadForm');

const resultCard = document.getElementById('resultCard');
const resultPlaceholder = document.getElementById('resultPlaceholder');
const resultContent = document.getElementById('resultContent');
const resultBadge = document.getElementById('resultBadge');
const resultImageWrapper = document.getElementById('resultImageWrapper');
const historyList = document.getElementById('historyList');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initIndexedDB();
  setupEventListeners();
  loadHistoryFromLocalStorage();
  
  // Make sure the dice floats on start
  diceCube.classList.add('idle-float');
});

// --- AUDIO SYNTHESIS (Web Audio API) ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Synthesize a dice bouncing sound
function playBounceSound(pitch = 1, volume = 0.4) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  // Create nodes
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  // Audio settings: short clicky tap
  const now = audioCtx.currentTime;
  osc.type = 'triangle';
  
  // Frequency sweep
  osc.frequency.setValueAtTime(450 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(80 * pitch, now + 0.08);
  
  // Volume envelope
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  osc.start(now);
  osc.stop(now + 0.09);
}

// Synthesize final landing impact sound
function playLandingSound() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  
  // Main thump
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(180, now);
  osc1.frequency.linearRampToValueAtTime(40, now + 0.15);
  gain1.gain.setValueAtTime(0.6, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  
  osc1.start(now);
  osc1.stop(now + 0.16);

  // High-frequency slap
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(350, now);
  osc2.frequency.linearRampToValueAtTime(120, now + 0.05);
  gain2.gain.setValueAtTime(0.3, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  osc2.start(now);
  osc2.stop(now + 0.06);
}

// Schedule bounce sounds to match the speed profile of the roll animation
function queueRollSounds() {
  const duration = 2500; // Roll animation duration matches CSS
  const startInterval = 80;
  const maxInterval = 450;
  
  let currentDelay = 0;
  let interval = startInterval;
  
  function triggerNextBounce() {
    if (!isRolling) return;
    
    // Play bounce sound
    const progress = currentDelay / duration;
    // Lower volume and pitch as dice slows down
    const volume = 0.5 * (1 - progress * 0.5);
    const pitch = 1.2 - progress * 0.4;
    playBounceSound(pitch, volume);
    
    // Calculate next delay using exponential growth to simulate deceleration
    interval = startInterval + Math.pow(progress, 2.5) * (maxInterval - startInterval);
    currentDelay += interval;
    
    if (currentDelay < duration - 200) {
      setTimeout(triggerNextBounce, interval);
    } else {
      // Play final landing thump when roll finishes
      setTimeout(playLandingSound, duration - currentDelay);
    }
  }
  
  triggerNextBounce();
}

// --- INDEXEDDB SETUP FOR PERSISTENCE ---
function initIndexedDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  request.onupgradeneeded = (e) => {
    const dbInstance = e.target.result;
    if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
      dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  
  request.onsuccess = (e) => {
    db = e.target.result;
    loadCustomFaces();
  };
  
  request.onerror = (e) => {
    console.error('IndexedDB error:', e.target.error);
    // Fallback: check assets folder directly
    checkFallbackAssets();
  };
}

// Load custom faces from DB
function loadCustomFaces() {
  if (!db) return;
  
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();
  
  request.onsuccess = () => {
    const records = request.result;
    const loadedFaces = new Set();
    
    records.forEach(record => {
      applyCustomFace(record.id, record.dataUrl);
      loadedFaces.add(record.id);
    });
    
    // For faces not saved in DB, load local file if exists, otherwise stay placeholder
    for (let i = 1; i <= 6; i++) {
      if (!loadedFaces.has(i)) {
        checkLocalAsset(i);
      }
    }
  };
}

// Fallback: check assets folder for all faces
function checkFallbackAssets() {
  for (let i = 1; i <= 6; i++) {
    checkLocalAsset(i);
  }
}

// Check if a local asset exists (e.g. assets/face1.png) and apply it
function checkLocalAsset(faceNum) {
  const imgUrl = `./assets/face${faceNum}.png`;
  const tempImg = new Image();
  tempImg.src = imgUrl;
  
  tempImg.onload = () => {
    applyCustomFace(faceNum, imgUrl, false); // apply without saving to db
  };
  
  tempImg.onerror = () => {
    // If PNG fails, try JPEG as well
    const jpgUrl = `./assets/face${faceNum}.jpg`;
    const tempJpg = new Image();
    tempJpg.src = jpgUrl;
    tempJpg.onload = () => {
      applyCustomFace(faceNum, jpgUrl, false);
    };
  };
}

// Apply custom image to the dice face and uploader preview
function applyCustomFace(faceId, dataUrl, updatePreview = true) {
  const faceNum = parseInt(faceId);
  const faceElement = document.querySelector(`.dice-face[data-face="${faceNum}"]`);
  if (!faceElement) return;
  
  // Update Dice Face
  const content = faceElement.querySelector('.face-content');
  content.className = `face-content face-${faceNum}`;
  content.innerHTML = `
    <img src="${dataUrl}" class="face-custom-img" alt="Sisi ${faceNum} - ${EMOTIONS[faceNum].name}">
    <div class="face-number">${faceNum}</div>
  `;
  
  // Update Settings Uploader Preview
  if (updatePreview) {
    const previewDiv = document.getElementById(`preview${faceNum}`);
    if (previewDiv) {
      previewDiv.innerHTML = `<img src="${dataUrl}" alt="Preview Sisi ${faceNum}">`;
    }
  }
}

// Save image to IndexedDB
function saveCustomFaceToDB(faceNum, dataUrl) {
  if (!db) return;
  
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.put({ id: faceNum, dataUrl: dataUrl });
}

// Delete image from IndexedDB
function deleteCustomFaceFromDB(faceNum) {
  if (!db) return;
  
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.delete(faceNum);
}

// Reset face back to emoji placeholder
function resetFaceToPlaceholder(faceNum) {
  const faceElement = document.querySelector(`.dice-face[data-face="${faceNum}"]`);
  if (!faceElement) return;
  
  // Reset dice face HTML
  const emotion = EMOTIONS[faceNum];
  const content = faceElement.querySelector('.face-content');
  content.className = `face-content placeholder-face face-${faceNum}`;
  content.innerHTML = `
    <div class="face-emoji">${emotion.emoji}</div>
    <div class="face-label">${emotion.name}</div>
    <div class="face-number">${faceNum}</div>
  `;
  
  // Reset Preview
  const previewDiv = document.getElementById(`preview${faceNum}`);
  if (previewDiv) {
    previewDiv.innerHTML = `
      <i class="fa-solid fa-cloud-arrow-up"></i>
      <span>Pilih Gambar</span>
    `;
  }
  
  // Delete from DB
  deleteCustomFaceFromDB(faceNum);
}

// --- CORE ROLLING LOGIC ---
function rollDice() {
  if (isRolling) return;
  
  isRolling = true;
  btnRoll.disabled = true;
  
  // Hide previous result card with fade
  resultCard.classList.remove('card-glow');
  
  // Stop floating idle animation
  diceCube.classList.remove('idle-float');
  
  // Add rolling styles to shadow
  diceShadow.classList.add('rolling');
  
  // Generate random target face (1-6)
  const rolledFace = Math.floor(Math.random() * 6) + 1;
  const targetRotation = FACE_ROTATIONS[rolledFace];
  
  // Multi-spin rotation calculation (adds 4-7 spins so it's dynamic and organic)
  const spinsX = (Math.floor(Math.random() * 3) + 4) * 360; 
  const spinsY = (Math.floor(Math.random() * 3) + 4) * 360;
  
  // Calculate end angles
  currentRotX = currentRotX + spinsX + targetRotation.x - (currentRotX % 360);
  currentRotY = currentRotY + spinsY + targetRotation.y - (currentRotY % 360);
  
  // Apply rotation transition
  diceCube.style.transition = 'transform 2.5s cubic-bezier(0.2, 0.85, 0.4, 1.02)';
  diceCube.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;
  
  // Synthesize sound timing
  queueRollSounds();
  
  // Finish roll
  setTimeout(() => {
    // Release shadows and enable controls
    diceShadow.classList.remove('rolling');
    isRolling = false;
    btnRoll.disabled = false;
    
    // Resume floating from current orientation
    diceCube.style.transition = 'none';
    
    // Save history and update UI
    saveRollToHistory(rolledFace);
    displayResult(rolledFace);
  }, 2500);
}

// Display the rolled emotion in the result card
function displayResult(faceNum) {
  const emotion = EMOTIONS[faceNum];
  
  // Setup Badge Style
  resultBadge.textContent = emotion.name;
  resultBadge.style.backgroundColor = emotion.color;
  
  // Select Image or Emoji for result box
  const faceElement = document.querySelector(`.dice-face[data-face="${faceNum}"]`);
  const customImg = faceElement.querySelector('.face-custom-img');
  
  if (customImg) {
    resultImageWrapper.innerHTML = `<img src="${customImg.src}" alt="${emotion.name}">`;
  } else {
    resultImageWrapper.innerHTML = `<div class="result-placeholder-emoji" style="color: ${emotion.color}">${emotion.emoji}</div>`;
  }
  
  // Toggle states
  resultPlaceholder.classList.add('hidden');
  resultContent.classList.remove('hidden');
  resultCard.classList.add('card-glow');
}

// --- HISTORY LOGIC ---
function saveRollToHistory(faceNum) {
  const emotion = EMOTIONS[faceNum];
  const rollData = {
    face: faceNum,
    name: emotion.name,
    emoji: emotion.emoji,
    color: emotion.color,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  };
  
  // Prepend to list
  diceRollHistory.unshift(rollData);
  
  // Cap history at 8 items
  if (diceRollHistory.length > 8) {
    diceRollHistory.pop();
  }
  
  // Save to LocalStorage
  localStorage.setItem('diceRollHistory', JSON.stringify(diceRollHistory));
  
  // Render History
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  
  if (diceRollHistory.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Belum ada riwayat kocokan</div>';
    return;
  }
  
  diceRollHistory.forEach(item => {
    const itemDiv = document.createElement('div');
    // Map theme classes dynamically (sanitize name by replacing / with -)
    const sanitizedName = item.name.toLowerCase().replace('/', '-');
    itemDiv.className = `history-item hist-${sanitizedName}`;
    itemDiv.innerHTML = `
      <span class="history-item-emoji">${item.emoji}</span>
      <span class="history-item-name">${item.name}</span>
      <span class="uploader-number" style="font-size: 0.75rem">${item.timestamp}</span>
    `;
    historyList.appendChild(itemDiv);
  });
}

function loadHistoryFromLocalStorage() {
  const saved = localStorage.getItem('diceRollHistory');
  if (saved) {
    try {
      diceRollHistory = JSON.parse(saved);
      renderHistory();
    } catch (e) {
      diceRollHistory = [];
    }
  }
}

// --- UPLOADS AND EVENT HANDLING ---
function setupEventListeners() {
  // Roll Dice Button click
  btnRoll.addEventListener('click', rollDice);
  
  // Click on the physical cube container rolls it too!
  diceCube.addEventListener('click', rollDice);
  
  // Sound Toggle
  btnToggleSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      soundIcon.className = 'fa-solid fa-volume-high';
      initAudio();
      playBounceSound(1.2, 0.4);
    } else {
      soundIcon.className = 'fa-solid fa-volume-xmark';
    }
  });
  
  // Modal toggle actions
  btnOpenSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  
  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    // Recalculate idle animation floating
    diceCube.classList.add('idle-float');
  });
  
  btnSaveSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    diceCube.classList.add('idle-float');
  });
  
  // Close modal when clicking outside
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
      diceCube.classList.add('idle-float');
    }
  });

  // Form Reset options
  btnResetAll.addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin menghapus semua gambar custom dan kembali ke emoji?')) {
      for (let i = 1; i <= 6; i++) {
        resetFaceToPlaceholder(i);
      }
    }
  });
  
  // Handle Reset buttons on individual uploader cards
  document.querySelectorAll('.btn-reset-face').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const faceNum = parseInt(e.target.dataset.face);
      resetFaceToPlaceholder(faceNum);
    });
  });
  
  // Drag and Drop dropzone styling & file selection
  const dropzones = document.querySelectorAll('.upload-dropzone');
  
  dropzones.forEach(zone => {
    const faceNum = parseInt(zone.dataset.face);
    const input = zone.querySelector('.file-input');
    
    // Trigger input on click if not dragging
    zone.addEventListener('click', () => {
      input.click();
    });
    
    // File change handler
    input.addEventListener('change', (e) => {
      handleFiles(e.target.files, faceNum);
    });
    
    // Drag-over styling
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files, faceNum);
      }
    });
  });
}

// Convert files to Data URL and save
function handleFiles(files, faceNum) {
  if (files.length === 0) return;
  
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    alert('Format file tidak valid. Harap pilih gambar.');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    applyCustomFace(faceNum, dataUrl, true);
    saveCustomFaceToDB(faceNum, dataUrl);
  };
  reader.readAsDataURL(file);
}
