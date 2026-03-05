/* ===================================================
   Grid Sequencer — app.js
   Mellotron-style synthesis via Web Audio API
   =================================================== */

'use strict';

// ── Config ────────────────────────────────────────────
const COLS = 16;
const ROWS = 8;

// C major pentatonic (top = high, bottom = low)
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

// Demo pattern (ascending phrase across 16 steps)
const DEMO_PATTERN = [
  [7, [0, 8]],   // C4
  [6, [2, 10]],  // D4
  [5, [4, 12]],  // E4
  [4, [6, 14]],  // G4
  [3, [1, 9]],   // A4
  [2, [3, 11]],  // C5
  [1, [5, 13]],  // D5
  [0, [7, 15]],  // E5
];

// ── State ─────────────────────────────────────────────
let grid       = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
let isPlaying  = false;
let currentStep = 0;
let prevStep   = -1;
let bpm        = 100;
let volume     = 0.7;
let voice      = 'flute';
let intervalId = null;

// ── Audio ─────────────────────────────────────────────
let audioCtx     = null;
let masterGain   = null;
let reverbBuffer = null;   // shared impulse-response buffer

function initAudio() {
  if (audioCtx) return;
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(audioCtx.destination);
  buildReverbBuffer();
}

function buildReverbBuffer() {
  const sr  = audioCtx.sampleRate;
  const len = Math.floor(sr * 2.8);
  reverbBuffer = audioCtx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = reverbBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
}

function playNote(row) {
  if (!audioCtx || !masterGain) return;
  const freq = NOTES[row].freq;
  const now  = audioCtx.currentTime;
  const stepMs = getStepMs();
  const noteDur = (stepMs / 1000) * 0.88;

  switch (voice) {
    case 'flute':   synthFlute  (freq, now, noteDur); break;
    case 'strings': synthStrings(freq, now, noteDur); break;
    case 'choir':   synthChoir  (freq, now, noteDur); break;
  }
}

// ── Mellotron Flute ──────────────────────────────────
// Sine fundamental + 2nd harmonic, breathy, no vibrato
function synthFlute(freq, now, dur) {
  const env = makeEnv(now, dur, { a: 0.06, d: 0.10, s: 0.65, r: 0.60, peak: 0.30 });

  const osc1 = mkOsc('sine',     freq,       0.70);
  const osc2 = mkOsc('sine',     freq * 2,   0.22);
  const osc3 = mkOsc('triangle', freq * 0.5, 0.08);

  // Subtle breath noise
  const noise  = audioCtx.createOscillator();
  const nGain  = audioCtx.createGain();
  noise.type   = 'sawtooth';
  noise.frequency.value = freq * 1.008;
  nGain.gain.value = 0.04;
  noise.connect(nGain);

  const lpf = audioCtx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 1600 + freq * 0.6;
  lpf.Q.value = 0.5;

  [osc1, osc2, osc3, nGain].forEach(n => n.connect(lpf));
  routeWithReverb(lpf, env, 0.38, now, dur);

  startStop(now, dur + 0.65, osc1, osc2, osc3, noise);
}

// ── Mellotron Strings ────────────────────────────────
// Sawtooth + vibrato, rich harmonics
function synthStrings(freq, now, dur) {
  const env = makeEnv(now, dur, { a: 0.12, d: 0.18, s: 0.60, r: 0.80, peak: 0.28 });

  const osc1 = mkOsc('sawtooth',  freq,       0.50);
  const osc2 = mkOsc('sawtooth',  freq * 1.003, 0.28); // slight detune
  const osc3 = mkOsc('triangle',  freq * 2,   0.14);
  const osc4 = mkOsc('sine',      freq * 0.5, 0.08);

  // Vibrato LFO
  const lfo     = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type      = 'sine';
  lfo.frequency.value = 5.2;
  lfoGain.gain.value  = freq * 0.012;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  const lpf = audioCtx.createBiquadFilter();
  lpf.type  = 'lowpass';
  lpf.frequency.value = 1800 + freq * 0.5;
  lpf.Q.value = 1.2;

  [osc1, osc2, osc3, osc4].forEach(n => n.connect(lpf));
  routeWithReverb(lpf, env, 0.45, now, dur);

  startStop(now, dur + 0.85, osc1, osc2, osc3, osc4, lfo);
}

// ── Mellotron Choir ──────────────────────────────────
// Formant-shaped noise + harmonics → "aah" vowel
function synthChoir(freq, now, dur) {
  const env = makeEnv(now, dur, { a: 0.15, d: 0.20, s: 0.55, r: 1.0, peak: 0.25 });

  const osc1 = mkOsc('sawtooth', freq,        0.45);
  const osc2 = mkOsc('sawtooth', freq * 2,    0.20);
  const osc3 = mkOsc('sawtooth', freq * 0.5,  0.10);
  const osc4 = mkOsc('sine',     freq * 3,    0.08);

  // Formant filters for vowel "ah"
  const f1 = makeFormant(800,  12);
  const f2 = makeFormant(1200, 8);
  const f3 = makeFormant(2600, 6);

  const preMix = audioCtx.createGain();
  [osc1, osc2, osc3, osc4].forEach(n => n.connect(preMix));
  preMix.connect(f1); preMix.connect(f2); preMix.connect(f3);

  const fMix = audioCtx.createGain();
  fMix.gain.value = 0.33;
  [f1, f2, f3].forEach(f => f.connect(fMix));

  // Slow vibrato
  const lfo     = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 4.8;
  lfoGain.gain.value  = freq * 0.008;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);

  routeWithReverb(fMix, env, 0.50, now, dur);

  startStop(now, dur + 1.05, osc1, osc2, osc3, osc4, lfo);
}

// ── Audio helpers ─────────────────────────────────────

function mkOsc(type, freq, gainVal) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value     = gainVal;
  osc.connect(gain);
  // Return the gain node as the output (osc is internal)
  osc._out = gain;
  gain.connect = (...args) => gain.connect.call(gain, ...args); // passthrough
  // Expose start/stop on the osc
  gain._osc = osc;
  return gain;
}

function makeEnv(now, dur, { a, d, s, r, peak }) {
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak,        now + a);
  env.gain.linearRampToValueAtTime(peak * s,    now + a + d);
  env.gain.setValueAtTime(peak * s,             now + dur);
  env.gain.linearRampToValueAtTime(0,           now + dur + r);
  return env;
}

function makeFormant(freq, q) {
  const f = audioCtx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function routeWithReverb(source, env, wetAmt, now, dur) {
  // Dry path
  const dry = audioCtx.createGain();
  dry.gain.value = 1 - wetAmt * 0.5;
  source.connect(env);
  env.connect(dry);
  dry.connect(masterGain);

  // Reverb path
  if (reverbBuffer) {
    const conv    = audioCtx.createConvolver();
    conv.buffer   = reverbBuffer;
    const wet     = audioCtx.createGain();
    wet.gain.value = wetAmt;
    env.connect(conv);
    conv.connect(wet);
    wet.connect(masterGain);
  }
}

function startStop(now, stopAt, ...gainNodes) {
  gainNodes.forEach(n => {
    // gainNodes may be GainNode wrappers around OscillatorNodes
    const osc = n._osc || n;
    if (osc && typeof osc.start === 'function') {
      try { osc.start(now);    } catch (_) {}
      try { osc.stop(stopAt);  } catch (_) {}
    }
  });
}

// ── Sequencer ─────────────────────────────────────────

function getStepMs() {
  // Each step = 1 sixteenth note
  return 60000 / (bpm * 4);
}

function tick() {
  // Visual
  updatePlayhead(currentStep);

  // Sound
  for (let row = 0; row < ROWS; row++) {
    if (grid[row][currentStep]) playNote(row);
  }

  currentStep = (currentStep + 1) % COLS;
}

function play() {
  if (isPlaying) return;
  isPlaying = true;

  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  currentStep = 0;
  setStatus('PLAYING');

  const ms = getStepMs();
  tick(); // fire immediately at step 0
  intervalId = setInterval(tick, ms);

  document.getElementById('playBtn').classList.add('playing');
  document.getElementById('playIcon').textContent  = '■';
  document.getElementById('playLabel').textContent = 'STOP';
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;
  clearInterval(intervalId);
  intervalId = null;

  // Clear playhead
  updatePlayhead(-1);
  prevStep    = -1;
  currentStep = 0;

  setStatus('STOPPED');

  document.getElementById('playBtn').classList.remove('playing');
  document.getElementById('playIcon').textContent  = '▶';
  document.getElementById('playLabel').textContent = 'PLAY';
}

function restartIfPlaying() {
  if (!isPlaying) return;
  clearInterval(intervalId);
  intervalId = setInterval(tick, getStepMs());
}

// ── UI Rendering ──────────────────────────────────────

function buildGrid() {
  const gridEl   = document.getElementById('grid');
  const labelsEl = document.getElementById('noteLabels');
  const indsEl   = document.getElementById('stepIndicators');

  gridEl.innerHTML   = '';
  labelsEl.innerHTML = '';
  indsEl.innerHTML   = '';

  // Step indicators
  for (let col = 0; col < COLS; col++) {
    const ind = document.createElement('div');
    ind.className = 'step-ind' + (col % 4 === 0 ? ' beat' : '');
    ind.id = `ind-${col}`;
    indsEl.appendChild(ind);
  }

  // Note labels
  for (let row = 0; row < ROWS; row++) {
    const lbl = document.createElement('div');
    lbl.className   = 'note-label';
    lbl.textContent = NOTES[row].name;
    labelsEl.appendChild(lbl);
  }

  // Cells
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('div');
      cell.className      = 'cell';
      cell.dataset.row    = row;
      cell.dataset.col    = col;
      cell.addEventListener('pointerdown', e => {
        e.preventDefault();
        toggleCell(row, col);
      });
      gridEl.appendChild(cell);
    }
  }
}

function toggleCell(row, col) {
  grid[row][col] = !grid[row][col];
  refreshCell(row, col);

  if (grid[row][col]) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playNote(row);
  }
  setStatus(grid[row][col] ? `${NOTES[row].name} ON` : `${NOTES[row].name} OFF`);
}

function getCell(row, col) {
  return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function refreshCell(row, col) {
  const cell = getCell(row, col);
  if (!cell) return;
  cell.classList.toggle('active', grid[row][col]);
}

function updatePlayhead(step) {
  // Clear old
  if (prevStep >= 0) {
    for (let row = 0; row < ROWS; row++) {
      getCell(row, prevStep)?.classList.remove('playhead');
    }
    const prevInd = document.getElementById(`ind-${prevStep}`);
    if (prevInd) prevInd.classList.remove('active');
  }

  // Set new
  if (step >= 0) {
    for (let row = 0; row < ROWS; row++) {
      getCell(row, step)?.classList.add('playhead');
    }
    const ind = document.getElementById(`ind-${step}`);
    if (ind) ind.classList.add('active');
  }

  prevStep = step;
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg.toUpperCase();
}

// ── Demo pattern ──────────────────────────────────────

function loadDemo() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (const [row, cols] of DEMO_PATTERN) {
    for (const col of cols) {
      grid[row][col] = true;
    }
  }
  // Refresh all cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      refreshCell(r, c);
    }
  }
}

// ── Event wiring ──────────────────────────────────────

document.getElementById('playBtn').addEventListener('click', () => {
  if (isPlaying) stop(); else play();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  stop();
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) refreshCell(r, c);
  }
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

// Prevent context menu on long-press mobile
document.getElementById('grid').addEventListener('contextmenu', e => e.preventDefault());

// ── Init ──────────────────────────────────────────────

buildGrid();
loadDemo();
setStatus('TAP A CELL OR PRESS PLAY');
