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

// ===== PLAYER & TURN STATE =====
let allPlayers = [];        // Full list of player names entered in setup
let playedThisRound = [];   // Names of players who completed their turn in current round
let activePlayer = '';      // Player currently picked to roll the dice

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

// Setup screen elements
const setupScreen = document.getElementById('setupScreen');
const btnStartGame = document.getElementById('btnStartGame');
const setupError = document.getElementById('setupError');
const appContainer = document.getElementById('appContainer');

// Wheel elements
const wheelModal = document.getElementById('wheelModal');
const wheelCanvas = document.getElementById('wheelCanvas');
const btnSpinWheel = document.getElementById('btnSpinWheel');
const btnSkipWheel = document.getElementById('btnSkipWheel');
const wheelResultName = document.getElementById('wheelResultName');
const turnQueueEl = document.getElementById('turnQueue');

// Current player banner
const currentPlayerBanner = document.getElementById('currentPlayerBanner');
const cpbName = document.getElementById('cpbName');
const btnNextTurn = document.getElementById('btnNextTurn');

// ===== WHEEL COLORS (per segment) =====
const WHEEL_COLORS = [
  '#712cf9', '#198754', '#fd7e14', '#0d6efd',
  '#dc3545', '#20c997', '#ffc107', '#e91e8c'
];

// ===== SETUP SCREEN LOGIC =====
btnStartGame.addEventListener('click', () => {
  const inputs = document.querySelectorAll('.player-name-input');
  const names = [];
  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (val) names.push(val);
  });

  if (names.length < 2) {
    setupError.classList.remove('hidden');
    return;
  }
  setupError.classList.add('hidden');

  allPlayers = [...names];
  playedThisRound = [];
  activePlayer = '';

  setupScreen.style.display = 'none';
  openWheelModal(true);
});

// Enter key on last filled input submits
document.querySelectorAll('.player-name-input').forEach((inp, idx, arr) => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = arr[idx + 1];
      if (next) next.focus();
      else btnStartGame.click();
    }
  });
});

// ===== WHEEL OF NAMES LOGIC =====
let wheelSpinning = false;
let wheelCurrentAngle = 0;  // current rotation in degrees
let wheelNames = [];        // current pool of players on wheel

function getUnplayedPlayers() {
  return allPlayers.filter(p => !playedThisRound.includes(p));
}

function openWheelModal(forcedNewRound = false) {
  let unplayed = getUnplayedPlayers();
  let isNewRound = forcedNewRound;

  // If all players have played this round, reset round pool!
  if (unplayed.length === 0) {
    playedThisRound = [];
    unplayed = [...allPlayers];
    isNewRound = true;
  }

  wheelNames = [...unplayed];
  wheelCurrentAngle = 0;
  wheelSpinning = false;
  activePlayer = '';
  wheelResultName.textContent = '—';
  wheelResultName.classList.remove('pop-in');

  const wheelSubtitle = document.querySelector('.wheel-subtitle');
  if (wheelSubtitle) {
    if (isNewRound) {
      wheelSubtitle.textContent = `🎉 Ronde Baru! Semua pemain masuk roda kembali (${wheelNames.length} pemain)`;
    } else {
      wheelSubtitle.textContent = `Putar roda! (Sisa ${wheelNames.length} dari ${allPlayers.length} pemain di ronde ini)`;
    }
  }

  // Reset button state
  btnSpinWheel.disabled = false;
  btnSpinWheel.innerHTML = '<i class="fa-solid fa-rotate"></i> Putar Roda!';
  btnSpinWheel.onclick = () => {
    if (wheelSpinning) return;
    spinWheel();
  };

  btnSkipWheel.classList.remove('hidden');

  renderTurnPills();
  drawWheel();
  wheelModal.classList.remove('hidden');
}

function drawWheel() {
  const canvas = wheelCanvas;
  const ctx = canvas.getContext('2d');
  const N = wheelNames.length;
  const R = canvas.width / 2;
  const cx = R, cy = R;
  const arc = (2 * Math.PI) / N;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((wheelCurrentAngle * Math.PI) / 180);
  ctx.translate(-cx, -cy);

  for (let i = 0; i < N; i++) {
    const startAngle = i * arc - Math.PI / 2;
    const endAngle = startAngle + arc;

    // Draw slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R - 2, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(14, Math.floor(R / Math.max(N, 2) * 1.5))}px Fredoka, Outfit, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;

    const maxChars = Math.max(6, Math.floor(R / 10));
    const label = wheelNames[i].length > maxChars
      ? wheelNames[i].slice(0, maxChars) + '…'
      : wheelNames[i];
    ctx.fillText(label, R - 14, 5);
    ctx.restore();
  }

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
  ctx.fillStyle = '#11251c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center icon
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillText('🎲', cx, cy);

  ctx.restore();
}

btnSpinWheel.addEventListener('click', () => {
  if (wheelSpinning) return;
  spinWheel();
});

btnSkipWheel.addEventListener('click', () => {
  if (wheelNames.length === 0) return;
  const winnerIdx = Math.floor(Math.random() * wheelNames.length);
  const winner = wheelNames[winnerIdx];
  showWheelResult(winner, winnerIdx);
});

function spinWheel() {
  if (wheelNames.length === 0) return;

  wheelSpinning = true;
  btnSpinWheel.disabled = true;
  btnSkipWheel.classList.add('hidden');

  const N = wheelNames.length;
  const arc = 360 / N;
  const winnerIdx = Math.floor(Math.random() * N);

  // Calculate exact angle to align winnerIdx slice center with top pointer (270° / -90°)
  const desiredMod = (360 - (winnerIdx * arc + arc / 2)) % 360;
  const currentMod = ((wheelCurrentAngle % 360) + 360) % 360;
  let delta = (desiredMod - currentMod) % 360;
  if (delta < 0) delta += 360;

  const totalSpins = (5 + Math.floor(Math.random() * 4)) * 360; // 5-8 full spins
  const rotationAmount = totalSpins + delta;

  const startAngle = wheelCurrentAngle;
  const finalAngle = startAngle + rotationAmount;

  const duration = 4000 + Math.random() * 1200; // 4-5.2s
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    wheelCurrentAngle = startAngle + rotationAmount * eased;

    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      wheelCurrentAngle = finalAngle;
      drawWheel();
      wheelSpinning = false;

      const winner = wheelNames[winnerIdx];
      showWheelResult(winner, winnerIdx);
    }
  }

  requestAnimationFrame(animate);
}

function showWheelResult(winnerName, winnerIdx) {
  activePlayer = winnerName;

  // Pop-in animation on name
  wheelResultName.classList.remove('pop-in');
  void wheelResultName.offsetWidth;
  wheelResultName.textContent = winnerName;
  wheelResultName.classList.add('pop-in');

  playSlotLandSound();
  renderTurnPills();

  // Change button to proceed to dice roll
  btnSpinWheel.disabled = false;
  btnSpinWheel.innerHTML = `<i class="fa-solid fa-dice"></i> Kocok Dadu untuk ${winnerName}!`;
  btnSpinWheel.onclick = () => {
    startTurnForActivePlayer();
  };
}

function renderTurnPills() {
  turnQueueEl.innerHTML = '';
  allPlayers.forEach(name => {
    const pill = document.createElement('div');
    const isCurrent = name === activePlayer;
    const isPlayed = playedThisRound.includes(name);

    if (isCurrent) {
      pill.className = 'turn-pill pill-active';
      pill.innerHTML = `<i class="fa-solid fa-star"></i> ${name}`;
    } else if (isPlayed) {
      pill.className = 'turn-pill pill-done';
      pill.innerHTML = `<i class="fa-solid fa-check"></i> ${name}`;
    } else {
      pill.className = 'turn-pill';
      pill.innerHTML = `<i class="fa-solid fa-user"></i> ${name}`;
    }
    turnQueueEl.appendChild(pill);
  });
}

function startTurnForActivePlayer() {
  wheelModal.classList.add('hidden');
  appContainer.style.display = '';

  // Show current player banner
  currentPlayerBanner.classList.remove('hidden');
  cpbName.textContent = activePlayer;
}

btnNextTurn.addEventListener('click', () => {
  openWheelModal();
});



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

  // Fix: Reset transition to 'none' first and flush pending styles with a
  // forced reflow. Then apply the real transition inside requestAnimationFrame
  // so the browser always sees a transition change before the transform changes.
  // Without this, the browser batches the style changes into one frame and
  // skips the animation entirely.
  diceCube.style.transition = 'none';
  void diceCube.offsetHeight; // force reflow / flush pending styles

  requestAnimationFrame(() => {
    diceCube.style.transition = 'transform 2.5s cubic-bezier(0.2, 0.85, 0.4, 1.02)';
    diceCube.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;
  });
  
  // Synthesize sound timing
  queueRollSounds();
  
  // Finish roll
  setTimeout(() => {
    // Release shadows and enable controls
    diceShadow.classList.remove('rolling');
    isRolling = false;
    btnRoll.disabled = false;
    
    // Freeze at landed position (no transition)
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

  // Show the question popup after the result card has settled
  setTimeout(() => showQuestionPopup(faceNum), 1200);
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

  // Fullscreen Proyektor / Classroom Mode Toggle
  const btnFullscreen = document.getElementById('btnFullscreen');
  const fullscreenIcon = document.getElementById('fullscreenIcon');

  function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) docEl.requestFullscreen();
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }

  function updateFullscreenUI() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    if (isFS) {
      document.body.classList.add('fullscreen-mode');
      if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-compress';
    } else {
      document.body.classList.remove('fullscreen-mode');
      if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-expand';
    }
  }

  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', toggleFullscreen);
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  document.addEventListener('MSFullscreenChange', updateFullscreenUI);
  
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

// =============================================================
//  QUESTION POPUP — SLOT MACHINE
// =============================================================

// Bank of questions per face number (matches EMOTIONS 1-6)
const QUESTION_BANK = {
  1: [
    "Momen apa yang paling bikin kamu bahagia pas jualan di bazar kemarin?",
    "Kekuatan diri apa yang paling kamu banggain dari diri kamu selama ikut program Pedal Juara ini?",
    "Siapa kawan di kelompok yang paling jago bikin suasana jadi seru pas kita lagi capek ngolah sampah?",
    "Pujian atau ucapan apa dari orang lain yang paling nempel di hati kamu selama ikut program ini?",
    "Kalau inget-inget lagi, bagian mana dari proses bikin aksesoris yang paling kamu nikmatin?"
  ],
  2: [
    "Ada gak momen yang bikin kamu sedih atau kecewa pas produk yang kamu buat susah payah ternyata gak laku atau rusak?",
    "Apa yang paling bakal kamu kangenin kalau nanti program Pedal Juara ini udah selesai?",
    "Pernah gak ngerasa sedih waktu udah kerja keras di program ini tapi hasilnya belum sesuai harapan? Gimana kamu bangkit lagi?",
    "Ada gak momen kamu ngerasa sendirian pas lagi ngerjain tugas kelompok?",
    "Kapan terakhir kali kamu ngerasa pengen nyerah aja pas ikut kegiatan ini, terus apa yang bikin kamu lanjut lagi?"
  ],
  3: [
    "Jujur deh, momen apa yang paling bikin kamu darah tinggi pas lagi kerja kelompok atau pas bazar?",
    "Gimana cara kamu nahan diri biar gak marah-marah pas pembeli nawar harga terlalu murah atau temen gak mau bantu?",
    "Apa yang paling bikin kamu geram pas liat orang buang sampah sembarangan di sekolah kita?",
    "Pernah gak kamu ngerasa kesel sama diri sendiri karena ngerasa kerjaanmu belum maksimal?",
    "Kalau ada temen yang gak adil bagi tugas di kelompok, apa yang biasanya kamu lakuin?"
  ],
  4: [
    "Pas pertama kali mau nawarin aksesoris ke orang asing di bazar, apa sih ketakutan terbesar kamu?",
    "Ada gak rasa takut pas mikirin impian kamu ke depan? Ceritain dikit dong.",
    "Apa ketakutan kamu kalau sampah plastik di dunia ini makin banyak dan gak ada yang peduli lagi?",
    "Pernah gak takut kalau usaha yang udah kamu bangun bareng kelompok ternyata gagal?",
    "Ketakutan apa yang paling sering muncul pas kamu harus tampil atau ngomong di depan orang banyak?"
  ],
  5: [
    "Momen apa yang paling bikin kamu kaget selama ikut program Pedal Juara ini?",
    "Pernah gak nemu bakat atau kemampuan diri sendiri yang ternyata gak kamu sangka-sangka?",
    "Reaksi pembeli seperti apa yang paling bikin kamu kaget pas lagi jualan di bazar?",
    "Ada gak hal tentang sampah atau daur ulang yang bikin kamu kaget waktu pertama kali tau?",
    "Kejutan apa dari temen kelompok kamu yang paling nempel di ingatan, entah itu kejutan baik atau bikin geleng-geleng kepala?"
  ],
  6: [
    "Pas pertama kali pegang tutup botol kotor atau sampah plastik, ada rasa risih gak? Gimana cara kamu ngalahin rasa itu?",
    "Sifat temen atau sikap pembeli kayak gimana yang paling bikin kamu gak nyaman selama kegiatan?",
    "Kebiasaan apa dari diri sendiri yang paling pengen kamu ubah biar kerja kelompok makin lancar?",
    "Ada gak momen kamu ngerasa gak sreg sama cara kerja atau keputusan kelompok, tapi kamu diemin aja?",
    "Hal kecil apa yang sering bikin kamu males duluan pas mulai kerja kelompok?"
  ]
};

// DOM references for question popup
const questionModal   = document.getElementById('questionModal');
const questionModalBox = document.getElementById('questionModalBox');
const qmodalEmoji     = document.getElementById('qmodalEmoji');
const qmodalBadge     = document.getElementById('qmodalBadge');
const slotDrum        = document.getElementById('slotDrum');
const slotText        = document.getElementById('slotText');
const starBurst       = document.getElementById('starBurst');
const btnCloseQuestion = document.getElementById('btnCloseQuestion');

// Slot machine timer handle (so we can cancel if needed)
let slotTimer = null;

// Open popup and run slot machine for a given face number
function showQuestionPopup(faceNum) {
  const emotion   = EMOTIONS[faceNum];
  const questions = QUESTION_BANK[faceNum];

  // Pick the final question randomly from the bank
  const finalQuestion = questions[Math.floor(Math.random() * questions.length)];

  // Apply emotion colour via CSS custom property on the modal box
  questionModalBox.style.setProperty('--qmodal-color', emotion.color);

  // Set header content
  qmodalEmoji.textContent = emotion.emoji;
  qmodalBadge.textContent = emotion.name.toUpperCase();
  qmodalBadge.style.background = emotion.color;

  // Set personalized label if active player is loaded
  const qmodalLabel = document.querySelector('.qmodal-label');
  if (qmodalLabel) {
    if (activePlayer) {
      qmodalLabel.innerHTML = `Pertanyaan untuk <strong style="color:#fff;">${activePlayer}</strong>...`;
    } else {
      qmodalLabel.textContent = 'Pertanyaan untukmu hari ini...';
    }
  }

  // Reset drum state
  slotDrum.classList.remove('slot-landed');
  slotText.classList.remove('slot-final');
  slotText.textContent = '...';
  starBurst.innerHTML = '';
  btnCloseQuestion.classList.add('hidden');

  // Show the overlay
  questionModal.classList.remove('hidden');

  // Run the slot machine animation after a tiny settle delay
  setTimeout(() => runSlotMachine(faceNum, finalQuestion), 300);
}

// Slot machine engine — progressively slows then lands on the target
function runSlotMachine(faceNum, finalQuestion) {
  // Gather all questions across ALL faces for the "spinning" phase
  const allQuestions = Object.values(QUESTION_BANK).flat();

  // Timing profile: starts fast, slows exponentially
  // Each entry = [intervalMs, count] — how many frames at that speed
  const stages = [
    [60,  8],   // Blazing fast
    [100, 6],   // Fast
    [160, 5],   // Medium
    [240, 4],   // Slowing
    [350, 3],   // Slow
    [480, 2],   // Very slow
    [620, 2],   // Crawling
  ];

  let stageIdx = 0;
  let frameCount = 0;
  let totalFrames = 0;

  // Count total spin frames
  stages.forEach(([, count]) => { totalFrames += count; });

  function spinFrame() {
    if (stageIdx >= stages.length) {
      // === LAND ===
      slotText.textContent = finalQuestion;
      slotText.classList.add('slot-final');
      slotDrum.classList.add('slot-landed');
      playSlotLandSound();
      spawnStars(faceNum);

      // Show close button after a beat
      setTimeout(() => {
        btnCloseQuestion.classList.remove('hidden');
      }, 600);
      return;
    }

    const [intervalMs, stageFrames] = stages[stageIdx];

    // Show a random question from the full pool during spinning
    const randomQ = allQuestions[Math.floor(Math.random() * allQuestions.length)];
    slotText.textContent = randomQ;

    frameCount++;
    if (frameCount >= stageFrames) {
      stageIdx++;
      frameCount = 0;
    }

    slotTimer = setTimeout(spinFrame, intervalMs);
  }

  spinFrame();
}

// Confetti star burst when slot lands
function spawnStars(faceNum) {
  const emotion = EMOTIONS[faceNum];
  const starEmojis = ['⭐', '✨', '🌟', '💫', '⚡', '🎉', '🎊'];
  starBurst.innerHTML = '';

  const count = 14;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = starEmojis[Math.floor(Math.random() * starEmojis.length)];

    // Random launch direction
    const angle = (360 / count) * i + (Math.random() * 30 - 15);
    const dist  = 60 + Math.random() * 80;
    const tx    = Math.round(Math.cos((angle * Math.PI) / 180) * dist);
    const ty    = Math.round(Math.sin((angle * Math.PI) / 180) * dist);
    const rot   = Math.round(Math.random() * 360);
    const dur   = (0.6 + Math.random() * 0.5).toFixed(2);
    const delay = (Math.random() * 0.2).toFixed(2);

    // Origin: centre of the modal box
    star.style.cssText = `
      left: 50%; top: 50%;
      --tx: ${tx}px; --ty: ${ty}px;
      --rot: ${rot}deg;
      --dur: ${dur}s;
      --delay: ${delay}s;
      font-size: ${0.9 + Math.random() * 0.8}rem;
    `;
    starBurst.appendChild(star);
  }
}

// Short "ding" sound when slot lands
function playSlotLandSound() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1100, now + 0.08);
  osc.frequency.setValueAtTime(880, now + 0.16);
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.start(now);
  osc.stop(now + 0.41);
}

// Helper: Fisher-Yates Shuffle
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Close the question popup and clean up
function closeQuestionModal() {
  if (slotTimer) { clearTimeout(slotTimer); slotTimer = null; }
  questionModal.classList.add('hidden');
  slotDrum.classList.remove('slot-landed');
  slotText.classList.remove('slot-final');
  starBurst.innerHTML = '';

  // Resume dice idle float after closing popup
  diceCube.classList.add('idle-float');

  // Mark current player as played AFTER their question turn completes
  if (activePlayer && !playedThisRound.includes(activePlayer)) {
    playedThisRound.push(activePlayer);
  }

  // Immediately open Roulette Wheel for the next turn!
  if (allPlayers.length > 0) {
    setTimeout(() => {
      openWheelModal();
    }, 450);
  }
}

// Close button listener
btnCloseQuestion.addEventListener('click', closeQuestionModal);

// Also close on overlay click
questionModal.addEventListener('click', (e) => {
  if (e.target === questionModal) closeQuestionModal();
});



