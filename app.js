/* ===================================================
   Grid Sequencer — app.js
   Mellotron-style synthesis · Web Audio API
   =================================================== */

'use strict';

// ── Config ────────────────────────────────────────────
const COLS = 16;
const ROWS = 8;

const NOTES = [
  { name: 'E5', freq: 659.25 },
  { name: 'D5', freq: 587.33 },
  { name: 'C5', freq: 523.25 },
  { name: 'A4', freq: 440.00 },
  { name: 'G4', freq: 392.00 },
  { name: 'E4', freq: 329.63 },
  { name: 'D4', freq: 293.66 },
  { name: 'C4', freq: 261.63 },
];

const DEMO_PATTERN = [
  [7, [0, 8]],
  [6, [2, 10]],
  [5, [4, 12]],
  [4, [6, 14]],
  [3, [1, 9]],
  [2, [3, 11]],
  [1, [5, 13]],
  [0, [7, 15]],
];

// ── Sequencer state ───────────────────────────────────
let grid        = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
let isPlaying   = false;
let currentStep = 0;
let prevStep    = -1;
let bpm         = 100;
let volume      = 0.7;
let voice       = 'flute';
let intervalId  = null;

// ── Audio state ───────────────────────────────────────
let audioCtx     = null;
let masterGain   = null;
let reverbBuffer = null;
let reverbSend   = null; // shared ConvolverNode — created once
let audioReady   = false;

// ─────────────────────────────────────────────────────
// iOS / Safari Audio unlock
// AudioContext must be created AND resumed inside a
// synchronous user-gesture handler.
// ─────────────────────────────────────────────────────

async function ensureAudio() {
  if (!audioCtx) {
    const Ctx    = window.AudioContext || window.webkitAudioContext;
    audioCtx     = new Ctx();
    masterGain   = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);
    buildReverbBuffer();
  }
  // Resume is required every time on iOS if context was interrupted
  if (audioCtx.state !== 'running') {
    await audioCtx.resume();
  }
  audioReady = (audioCtx.state === 'running');
}

function buildReverbBuffer() {
  const sr  = audioCtx.sampleRate;
  const len = Math.floor(sr * 2.2);
  reverbBuffer = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = reverbBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.0);
    }
  }
  // Build the shared reverb chain: convolver → wet gain → master
  reverbSend = audioCtx.createConvolver();
  reverbSend.buffer = reverbBuffer;
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.32;
  reverbSend.connect(wetGain);
  wetGain.connect(masterGain);
}

// ── Note playback ─────────────────────────────────────

function playNote(row) {
  if (!audioCtx || !audioReady) return;
  const freq = NOTES[row].freq;
  const now  = audioCtx.currentTime;
  const dur  = getStepMs() / 1000 * 0.85;

  if      (voice === 'flute')   synthFlute  (freq, now, dur);
  else if (voice === 'strings') synthStrings(freq, now, dur);
  else                          synthChoir  (freq, now, dur);
}

// ── Mellotron Flute ───────────────────────────────────
// Sine fundamentals, soft attack, gentle filter

function synthFlute(freq, now, dur) {
  const oscs = [];

  const osc1 = makeOsc('sine',     freq,       oscs);
  const osc2 = makeOsc('sine',     freq * 2,   oscs);
  const osc3 = makeOsc('triangle', freq * 0.5, oscs);

  const g1 = withGain(osc1, 0.55);
  const g2 = withGain(osc2, 0.22);
  const g3 = withGain(osc3, 0.10);

  // Breath (slight detuned sine)
  const breath = makeOsc('sine', freq * 1.007, oscs);
  const gBreath = withGain(breath, 0.04);

  const lpf = makeLPF(1700, 0.5);
  [g1, g2, g3, gBreath].forEach(g => g.connect(lpf));

  const env = makeADSR(now, dur, { a: 0.07, d: 0.10, s: 0.62, r: 0.65, peak: 0.28 });
  lpf.connect(env);
  routeToMaster(env, 0.35, oscs, now, now + dur + 0.7);
}

// ── Mellotron Strings ─────────────────────────────────
// Sawtooth + vibrato, warm low-pass

function synthStrings(freq, now, dur) {
  const oscs = [];

  const osc1 = makeOsc('sawtooth', freq,         oscs);
  const osc2 = makeOsc('sawtooth', freq * 1.003, oscs); // slight detune
  const osc3 = makeOsc('triangle', freq * 2,     oscs);
  const osc4 = makeOsc('sine',     freq * 0.5,   oscs);

  const g1 = withGain(osc1, 0.46);
  const g2 = withGain(osc2, 0.28);
  const g3 = withGain(osc3, 0.14);
  const g4 = withGain(osc4, 0.08);

  // Vibrato LFO
  const lfo  = makeOsc('sine', 5.2, oscs);
  const lfoG = withGain(lfo, freq * 0.012);
  lfoG.connect(osc1.frequency);
  lfoG.connect(osc2.frequency);

  const lpf = makeLPF(1600, 1.1);
  [g1, g2, g3, g4].forEach(g => g.connect(lpf));

  const env = makeADSR(now, dur, { a: 0.12, d: 0.18, s: 0.55, r: 0.80, peak: 0.26 });
  lpf.connect(env);
  routeToMaster(env, 0.42, oscs, now, now + dur + 0.9);
}

// ── Mellotron Choir ───────────────────────────────────
// Formant band-pass filters → "aah" vowel

function synthChoir(freq, now, dur) {
  const oscs = [];

  const osc1 = makeOsc('sawtooth', freq,         oscs);
  const osc2 = makeOsc('sawtooth', freq * 1.002, oscs);
  const osc3 = makeOsc('sawtooth', freq * 0.998, oscs);

  const g1 = withGain(osc1, 0.50);
  const g2 = withGain(osc2, 0.28);
  const g3 = withGain(osc3, 0.18);

  // Slow vibrato
  const lfo  = makeOsc('sine', 4.5, oscs);
  const lfoG = withGain(lfo, freq * 0.008);
  lfoG.connect(osc1.frequency);
  lfoG.connect(osc2.frequency);
  lfoG.connect(osc3.frequency);

  // Feed oscillator mix into formant bank
  const preMix = audioCtx.createGain();
  preMix.gain.value = 0.35;
  [g1, g2, g3].forEach(g => g.connect(preMix));

  // Formant filters (vowel "ah")
  const formants = [[750, 12], [1200, 8], [2600, 5]];
  const fmix = audioCtx.createGain();
  fmix.gain.value = 1;
  formants.forEach(([f, q]) => {
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    preMix.connect(bp);
    bp.connect(fmix);
  });

  const env = makeADSR(now, dur, { a: 0.15, d: 0.20, s: 0.55, r: 1.0, peak: 0.25 });
  fmix.connect(env);
  routeToMaster(env, 0.48, oscs, now, now + dur + 1.1);
}

// ── Audio helpers ─────────────────────────────────────

/** Create an OscillatorNode, register it, return it */
function makeOsc(type, freq, oscList) {
  const osc = audioCtx.createOscillator();
  osc.type  = type;
  osc.frequency.value = freq;
  oscList.push(osc);
  return osc;
}

/** Wrap a node in a GainNode */
function withGain(node, gainVal) {
  const g = audioCtx.createGain();
  g.gain.value = gainVal;
  node.connect(g);
  return g;
}

function makeLPF(freq, q) {
  const f = audioCtx.createBiquadFilter();
  f.type  = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function makeADSR(now, dur, { a, d, s, r, peak }) {
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0,        now);
  env.gain.linearRampToValueAtTime(peak,     now + a);
  env.gain.linearRampToValueAtTime(peak * s, now + a + d);
  env.gain.setValueAtTime(peak * s, now + dur);
  env.gain.linearRampToValueAtTime(0,        now + dur + r);
  return env;
}

/** Connect env → dry master + shared reverb send, then start all oscillators */
function routeToMaster(env, wetAmt, oscs, now, stopAt) {
  // Dry
  env.connect(masterGain);

  // Wet — route into the single shared ConvolverNode (no new Convolver per note)
  if (reverbSend) {
    const sendGain = audioCtx.createGain();
    sendGain.gain.value = wetAmt;
    env.connect(sendGain);
    sendGain.connect(reverbSend);
  }

  // Start / schedule stop for all oscillators
  oscs.forEach(o => {
    try { o.start(now);    } catch (_) {}
    try { o.stop(stopAt);  } catch (_) {}
  });
}

// ── Sequencer ─────────────────────────────────────────

function getStepMs() {
  return 60000 / (bpm * 4); // 16th note in ms
}

function tick() {
  // iOS may silently suspend the AudioContext between ticks — keep it alive
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  updatePlayhead(currentStep);
  for (let row = 0; row < ROWS; row++) {
    if (grid[row][currentStep]) playNote(row);
  }
  currentStep = (currentStep + 1) % COLS;
}

async function play() {
  if (isPlaying) return;
  await ensureAudio();
  if (!audioReady) { setStatus('AUDIO NOT READY — TAP OVERLAY'); return; }

  isPlaying = true;
  currentStep = 0;
  setStatus('PLAYING');
  setPlayBtn(true);

  tick();
  intervalId = setInterval(tick, getStepMs());
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;
  clearInterval(intervalId);
  intervalId = null;
  updatePlayhead(-1);
  prevStep    = -1;
  currentStep = 0;
  setStatus('STOPPED');
  setPlayBtn(false);
}

function restartIfPlaying() {
  if (!isPlaying) return;
  clearInterval(intervalId);
  intervalId = setInterval(tick, getStepMs());
}

// ── UI ────────────────────────────────────────────────

function buildGrid() {
  const gridEl   = document.getElementById('grid');
  const labelsEl = document.getElementById('noteLabels');
  const indsEl   = document.getElementById('stepIndicators');
  gridEl.innerHTML = labelsEl.innerHTML = indsEl.innerHTML = '';

  for (let col = 0; col < COLS; col++) {
    const ind = document.createElement('div');
    ind.className = 'step-ind' + (col % 4 === 0 ? ' beat' : '');
    ind.id = `ind-${col}`;
    indsEl.appendChild(ind);
  }

  for (let row = 0; row < ROWS; row++) {
    const lbl = document.createElement('div');
    lbl.className   = 'note-label';
    lbl.textContent = NOTES[row].name;
    labelsEl.appendChild(lbl);
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('div');
      cell.className   = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.addEventListener('pointerdown', e => {
        e.preventDefault();
        onCellTap(row, col);
      });
      gridEl.appendChild(cell);
    }
  }
}

async function onCellTap(row, col) {
  await ensureAudio();


  grid[row][col] = !grid[row][col];
  refreshCell(row, col);

  if (grid[row][col] && audioReady) playNote(row);
  setStatus(grid[row][col] ? `${NOTES[row].name}` : '');
}

function getCell(row, col) {
  return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}
function refreshCell(row, col) {
  getCell(row, col)?.classList.toggle('active', grid[row][col]);
}

function updatePlayhead(step) {
  if (prevStep >= 0) {
    for (let r = 0; r < ROWS; r++) getCell(r, prevStep)?.classList.remove('playhead');
    document.getElementById(`ind-${prevStep}`)?.classList.remove('active');
  }
  if (step >= 0) {
    for (let r = 0; r < ROWS; r++) getCell(r, step)?.classList.add('playhead');
    document.getElementById(`ind-${step}`)?.classList.add('active');
  }
  prevStep = step;
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg.toUpperCase();
}

function setPlayBtn(playing) {
  document.getElementById('playBtn').classList.toggle('playing', playing);
  document.getElementById('playIcon').textContent  = playing ? '■' : '▶';
  document.getElementById('playLabel').textContent = playing ? 'STOP' : 'PLAY';
}

// ── Dynamic grid sizing ───────────────────────────────
// Measures available space after layout, then sets CSS vars
// so the grid always fits the screen with the largest
// possible cells.

function resizeGrid() {
  const area   = document.getElementById('gridArea');
  const inds   = document.getElementById('stepIndicators');
  const status = document.querySelector('.status-bar');
  if (!area) return;

  // Available height for grid-wrapper = gridArea height
  // minus step-indicators, status-bar, and inner gaps (6px * 2)
  const indsH   = inds   ? inds.offsetHeight   : 0;
  const statusH = status ? status.offsetHeight : 0;
  const gapH    = 6 * 2;
  const availH  = area.clientHeight - indsH - statusH - gapH - 8;

  // Available width = gridArea width minus note labels (26px) and gap (6px)
  const labelW  = 30;
  const availW  = area.clientWidth - labelW - 6;

  // Cell size that fits all columns / all rows
  const GAPS_X  = COLS - 1 + 3; // 3 extra px for beat-group margins (3 groups × 3px)
  const GAPS_Y  = ROWS - 1;
  const minGap  = 3;

  const fromW   = Math.floor((availW - GAPS_X * minGap) / COLS);
  const fromH   = Math.floor((availH - GAPS_Y * minGap) / ROWS);
  const size    = Math.min(48, Math.max(14, Math.min(fromW, fromH)));
  const gap     = Math.max(2, Math.min(6, Math.round(size / 9)));

  document.documentElement.style.setProperty('--cell-size', size + 'px');
  document.documentElement.style.setProperty('--cell-gap',  gap  + 'px');
}

// ── Demo pattern ──────────────────────────────────────

function loadDemo() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (const [row, cols] of DEMO_PATTERN) {
    for (const col of cols) grid[row][col] = true;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) refreshCell(r, c);
  }
}

// ── Event wiring ──────────────────────────────────────

document.getElementById('playBtn').addEventListener('click', async () => {
  await ensureAudio(); // iOS requires AudioContext resume inside a user gesture
  if (isPlaying) stop(); else play();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  stop();
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) refreshCell(r, c);
  setStatus('CLEARED');
});

document.getElementById('bpmSlider').addEventListener('input', e => {
  bpm = +e.target.value;
  document.getElementById('bpmValue').textContent = bpm;
  restartIfPlaying();
});

document.getElementById('volSlider').addEventListener('input', e => {
  volume = e.target.value / 100;
  if (masterGain) masterGain.gain.value = volume;
});

document.getElementById('voiceSelect').addEventListener('change', e => {
  voice = e.target.value;
});

// Prevent context menu on long-press
document.getElementById('grid').addEventListener('contextmenu', e => e.preventDefault());

// Resize on orientation change / window resize
window.addEventListener('resize', () => {
  resizeGrid();
});
window.addEventListener('orientationchange', () => {
  // Small delay for iOS to settle new dimensions
  setTimeout(resizeGrid, 120);
});

// Resume audio when page becomes visible again (iOS interruption)
document.addEventListener('visibilitychange', () => {
  if (!audioCtx) return;
  if (document.visibilityState === 'visible' && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => { audioReady = true; });
  }
});

// ── Init ──────────────────────────────────────────────

buildGrid();
loadDemo();
setStatus('TAP OVERLAY TO ENABLE AUDIO');

// Wait for fonts + layout, then size the grid
document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(resizeGrid);
  });
});
