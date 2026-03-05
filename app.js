/* ===================================================
   Grid Sequencer — app.js
   Teratron-style synthesis · Web Audio API
   =================================================== */

'use strict';

// ── Config ────────────────────────────────────────────
const COLS = 16;
const ROWS = 17;

const NOTES = [
  { name: 'E5',  freq: 659.25, black: false },
  { name: 'D#5', freq: 622.25, black: true  },
  { name: 'D5',  freq: 587.33, black: false },
  { name: 'C#5', freq: 554.37, black: true  },
  { name: 'C5',  freq: 523.25, black: false },
  { name: 'B4',  freq: 493.88, black: false },
  { name: 'A#4', freq: 466.16, black: true  },
  { name: 'A4',  freq: 440.00, black: false },
  { name: 'G#4', freq: 415.30, black: true  },
  { name: 'G4',  freq: 392.00, black: false },
  { name: 'F#4', freq: 369.99, black: true  },
  { name: 'F4',  freq: 349.23, black: false },
  { name: 'E4',  freq: 329.63, black: false },
  { name: 'D#4', freq: 311.13, black: true  },
  { name: 'D4',  freq: 293.66, black: false },
  { name: 'C#4', freq: 277.18, black: true  },
  { name: 'C4',  freq: 261.63, black: false },
];

const DEMO_PATTERN = [
  // A4, E4, B4, -, A4, E4, -, C#5, -, G#4, -, B4, -, A4, E4, -
  [3,  [7]],        // C#5 (col 7)
  [5,  [2, 11]],    // B4  (col 2, 11)
  [7,  [0, 4, 13]], // A4  (col 0, 4, 13)
  [8,  [9]],        // G#4 (col 9)
  [12, [1, 5, 14]], // E4  (col 1, 5, 14)
];

const DRUM_NAMES = ['KICK', 'TOM'];

const CHORDS = [
  // ── Major ─────────────────────────────────────────
  { name: 'C',     freqs: [261.63, 329.63, 392.00] },           // C4, E4, G4
  { name: 'D',     freqs: [293.66, 369.99, 440.00] },           // D4, F#4, A4
  { name: 'E',     freqs: [329.63, 415.30, 493.88] },           // E4, G#4, B4
  { name: 'F',     freqs: [349.23, 440.00, 523.25] },           // F4, A4, C5
  { name: 'G',     freqs: [392.00, 493.88, 587.33] },           // G4, B4, D5
  { name: 'A',     freqs: [440.00, 554.37, 659.25] },           // A4, C#5, E5
  // ── Minor ─────────────────────────────────────────
  { name: 'Cm',    freqs: [261.63, 311.13, 392.00] },           // C4, Eb4, G4
  { name: 'Dm',    freqs: [293.66, 349.23, 440.00] },           // D4, F4, A4
  { name: 'Em',    freqs: [329.63, 392.00, 493.88] },           // E4, G4, B4
  { name: 'Fm',    freqs: [349.23, 415.30, 523.25] },           // F4, Ab4, C5
  { name: 'Gm',    freqs: [392.00, 466.16, 587.33] },           // G4, Bb4, D5
  { name: 'Am',    freqs: [440.00, 523.25, 659.25] },           // A4, C5, E5
  { name: 'Bm',    freqs: [293.66, 369.99, 493.88] },           // D4, F#4, B4 (1st inv)
  // ── Dominant 7th ──────────────────────────────────
  { name: 'C7',    freqs: [261.63, 329.63, 392.00, 466.16] },  // C4, E4, G4, Bb4
  { name: 'D7',    freqs: [293.66, 369.99, 440.00, 523.25] },  // D4, F#4, A4, C5
  { name: 'E7',    freqs: [329.63, 415.30, 493.88, 293.66] },  // E4, G#4, B4, D4
  { name: 'G7',    freqs: [392.00, 493.88, 587.33, 349.23] },  // G4, B4, D5, F4
  { name: 'A7',    freqs: [392.00, 440.00, 554.37, 659.25] },  // G4, A4, C#5, E5
  // ── Minor 7th ─────────────────────────────────────
  { name: 'Dm7',   freqs: [293.66, 349.23, 440.00, 523.25] },  // D4, F4, A4, C5
  { name: 'Em7',   freqs: [329.63, 392.00, 493.88, 587.33] },  // E4, G4, B4, D5
  { name: 'Am7',   freqs: [440.00, 523.25, 659.25, 392.00] },  // A4, C5, E5, G4
  // ── Major 7th ─────────────────────────────────────
  { name: 'Cmaj7', freqs: [261.63, 329.63, 392.00, 493.88] },  // C4, E4, G4, B4
  { name: 'Fmaj7', freqs: [349.23, 440.00, 523.25, 659.25] },  // F4, A4, C5, E5
  // ── Suspended ─────────────────────────────────────
  { name: 'Gsus4', freqs: [392.00, 523.25, 587.33] },           // G4, C5, D5
  { name: 'Asus2', freqs: [440.00, 493.88, 659.25] },           // A4, B4, E5
];

// ── Sequencer state ───────────────────────────────────
let grid         = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
let drumGrid     = Array.from({ length: 2 },    () => Array(COLS).fill(false));
let isPlaying    = false;
let currentStep  = 0;
let prevStep     = -1;
let bpm          = 80;
let volume       = 0.7;
let voice        = 'flute';
let intervalId   = null;
let nextTickAt   = 0; // performance.now() target for the next tick
// ── Mini keyboard state ────────────────────────────────
const KEYBOARD_NOTES = [
  { name: 'C4',  freq: 261.63, black: false },
  { name: 'C#4', freq: 277.18, black: true  },
  { name: 'D4',  freq: 293.66, black: false },
  { name: 'D#4', freq: 311.13, black: true  },
  { name: 'E4',  freq: 329.63, black: false },
  { name: 'F4',  freq: 349.23, black: false },
  { name: 'F#4', freq: 369.99, black: true  },
  { name: 'G4',  freq: 392.00, black: false },
  { name: 'G#4', freq: 415.30, black: true  },
  { name: 'A4',  freq: 440.00, black: false },
  { name: 'A#4', freq: 466.16, black: true  },
  { name: 'B4',  freq: 493.88, black: false },
  { name: 'C5',  freq: 523.25, black: false },
  { name: 'C#5', freq: 554.37, black: true  },
  { name: 'D5',  freq: 587.33, black: false },
  { name: 'D#5', freq: 622.25, black: true  },
  { name: 'E5',  freq: 659.25, black: false },
  { name: 'F5',  freq: 698.46, black: false },
  { name: 'F#5', freq: 739.99, black: true  },
  { name: 'G5',  freq: 783.99, black: false },
  { name: 'G#5', freq: 830.61, black: true  },
  { name: 'A5',  freq: 880.00, black: false },
  { name: 'A#5', freq: 932.33, black: true  },
  { name: 'B5',  freq: 987.77, black: false },
];
// Black key center positions in white-key-widths from left (2 octaves)
const KB_BLACK_OFFSETS = [0.65, 1.65, 3.65, 4.65, 5.65, 7.65, 8.65, 10.65, 11.65, 12.65];
const kbActiveNotes = new Map(); // touchId/mousedown → { oscs, envs, el }

let pendingChord   = null; // chord queued by user — takes effect at next loop start
let activeChord    = null; // chord currently sounding this loop
let previewEnvs    = []; // envelope gain nodes of the current chord preview
let previewOscs    = []; // oscillators of the current chord preview

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

// ── Drum playback ─────────────────────────────────────

function synthKick() {
  if (!audioCtx || !audioReady) return;
  const now  = audioCtx.currentTime;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(28, now + 0.08);
  gain.gain.setValueAtTime(1.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.45);
}

function synthTom() {
  if (!audioCtx || !audioReady) return;
  const now  = audioCtx.currentTime;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);
  gain.gain.setValueAtTime(0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.5);
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

// ── Teratron Flute ───────────────────────────────────
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
  routeToMaster(env, 0.35, oscs, now, now + dur + 0.75);
}

// ── Teratron Strings ─────────────────────────────────
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

// ── Teratron Choir ───────────────────────────────────
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
  env.gain.setValueAtTime(0, now);

  // Attack — clamp to note length so we never overshoot
  const attackEnd = now + Math.min(a, dur);
  env.gain.linearRampToValueAtTime(peak, attackEnd);

  if (dur > a) {
    // Decay — only as long as the note allows
    const decayDur   = Math.min(d, dur - a);
    const decayRatio = decayDur / d;
    // Interpolate where in the decay curve we actually land at note-off
    const valAtDur   = peak - (peak - peak * s) * decayRatio;
    env.gain.linearRampToValueAtTime(valAtDur, now + a + decayDur);

    // Sustain hold — only if the full decay fits inside the note
    if (dur >= a + d) {
      env.gain.setValueAtTime(peak * s, now + dur);
    }
    // When dur < a+d: ramp above already ends exactly at now+dur with valAtDur,
    // so the exponential release below starts from there — no step, no click.
  }

  // Release: exponential to near-zero, then a short linear fade to exact 0
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur + r);
  env.gain.linearRampToValueAtTime(0,            now + dur + r + 0.05);
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

// ── Chord pad synth ───────────────────────────────────
// Warm triangle/saw pad, slow attack, sustains for full loop

// ── Electric Piano synth (Rhodes-style tine) ──────────

function synthEPiano(freq, now) {
  const oscs = [];

  // Main tine — sine, long decay
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = freq;
  oscs.push(osc1);

  // 2nd harmonic — sine, fast decay (brightness)
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;
  oscs.push(osc2);

  // Attack transient — brief high partial (tine "click")
  const osc3 = audioCtx.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.value = freq * 5.0;
  oscs.push(osc3);

  const env1 = audioCtx.createGain();
  env1.gain.setValueAtTime(0, now);
  env1.gain.linearRampToValueAtTime(0.28, now + 0.008);
  env1.gain.exponentialRampToValueAtTime(0.10, now + 0.9);
  env1.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

  const env2 = audioCtx.createGain();
  env2.gain.setValueAtTime(0, now);
  env2.gain.linearRampToValueAtTime(0.10, now + 0.008);
  env2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  const env3 = audioCtx.createGain();
  env3.gain.setValueAtTime(0, now);
  env3.gain.linearRampToValueAtTime(0.13, now + 0.004);
  env3.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc1.connect(env1);
  osc2.connect(env2);
  osc3.connect(env3);

  [env1, env2, env3].forEach(env => {
    env.connect(masterGain);
    if (reverbSend) {
      const send = audioCtx.createGain();
      send.gain.value = 0.20;
      env.connect(send);
      send.connect(reverbSend);
    }
  });

  const stopAt = now + 4.5;
  osc1.start(now); osc1.stop(stopAt);
  osc2.start(now); osc2.stop(now + 1.0);
  osc3.start(now); osc3.stop(now + 0.15);

  return { oscs, envs: [env1, env2, env3] };
}

function releaseKbNote(note) {
  if (!note || !audioCtx) return;
  const now = audioCtx.currentTime;
  note.envs.forEach(env => {
    try {
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } catch (_) {}
  });
  note.oscs.forEach(osc => {
    try { osc.stop(now + 0.22); } catch (_) {}
  });
}

// ── Keyboard DOM + event handling ─────────────────────

function repositionBlackKeys() {
  const container = document.getElementById('miniKeyboard');
  if (!container) return;
  const firstWhite = container.querySelector('.kb-white');
  if (!firstWhite) return;
  const W  = firstWhite.offsetWidth;
  const bw = Math.max(10, Math.round(W * 0.58));
  container.querySelectorAll('.kb-black').forEach((key, i) => {
    key.style.left  = Math.round(KB_BLACK_OFFSETS[i] * W) + 'px';
    key.style.width = bw + 'px';
  });
}

function buildKeyboard() {
  const container = document.getElementById('miniKeyboard');
  if (!container) return;

  // White keys first (flex children)
  KEYBOARD_NOTES.filter(n => !n.black).forEach(note => {
    const key = document.createElement('div');
    key.className = 'kb-key kb-white';
    key.dataset.freq = note.freq;
    if (note.name.startsWith('C') && !note.name.includes('#')) {
      const lbl = document.createElement('span');
      lbl.className = 'kb-label';
      lbl.textContent = note.name;
      key.appendChild(lbl);
    }
    container.appendChild(key);
  });

  // Black keys after layout (need white key width)
  requestAnimationFrame(() => {
    KEYBOARD_NOTES.filter(n => n.black).forEach(note => {
      const key = document.createElement('div');
      key.className = 'kb-key kb-black';
      key.dataset.freq = note.freq;
      container.appendChild(key);
    });
    repositionBlackKeys();
  });

  // Touch handling — container-level for slide-between-keys support
  container.addEventListener('touchstart', kbTouchStart, { passive: false });
  container.addEventListener('touchmove',  kbTouchMove,  { passive: false });
  container.addEventListener('touchend',   kbTouchEnd,   { passive: false });
  container.addEventListener('touchcancel',kbTouchEnd,   { passive: false });

  // Mouse handling for desktop
  container.addEventListener('mousedown', kbMouseDown);
  document.addEventListener('mouseup',    kbMouseUp);

  container.addEventListener('contextmenu', e => e.preventDefault());
}

function kbNoteFromPoint(x, y) {
  // Prefer black keys (higher z-index) via elementFromPoint
  const el = document.elementFromPoint(x, y);
  if (el && el.dataset && el.dataset.freq) return el;
  return null;
}

async function kbTouchStart(e) {
  e.preventDefault();
  await ensureAudio();
  for (const touch of e.changedTouches) {
    const el = kbNoteFromPoint(touch.clientX, touch.clientY);
    if (!el || !audioReady) continue;
    const freq = parseFloat(el.dataset.freq);
    const note = synthEPiano(freq, audioCtx.currentTime);
    el.classList.add('kb-pressed');
    kbActiveNotes.set(touch.identifier, { note, el });
  }
}

function kbTouchMove(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const active = kbActiveNotes.get(touch.identifier);
    if (!active) continue;
    const el = kbNoteFromPoint(touch.clientX, touch.clientY);
    if (!el || el === active.el) continue;
    const freq = parseFloat(el.dataset.freq);
    if (!freq) continue;
    // Moved to a different key — retrigger
    releaseKbNote(active.note);
    active.el.classList.remove('kb-pressed');
    const note = synthEPiano(freq, audioCtx.currentTime);
    el.classList.add('kb-pressed');
    kbActiveNotes.set(touch.identifier, { note, el });
  }
}

function kbTouchEnd(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const active = kbActiveNotes.get(touch.identifier);
    if (!active) continue;
    releaseKbNote(active.note);
    active.el.classList.remove('kb-pressed');
    kbActiveNotes.delete(touch.identifier);
  }
}

async function kbMouseDown(e) {
  if (e.button !== 0) return;
  await ensureAudio();
  const el = kbNoteFromPoint(e.clientX, e.clientY);
  if (!el || !audioReady) return;
  const freq = parseFloat(el.dataset.freq);
  const note = synthEPiano(freq, audioCtx.currentTime);
  el.classList.add('kb-pressed');
  kbActiveNotes.set('mouse', { note, el });
}

function kbMouseUp() {
  const active = kbActiveNotes.get('mouse');
  if (!active) return;
  releaseKbNote(active.note);
  active.el.classList.remove('kb-pressed');
  kbActiveNotes.delete('mouse');
}

function synthChordNote(freq, now, dur, trackEnvs, trackOscs) {
  const oscs = [];

  const osc1 = makeOsc('triangle', freq,         oscs);
  const osc2 = makeOsc('sawtooth', freq * 1.004, oscs);
  const osc3 = makeOsc('sine',     freq * 0.5,   oscs);

  const g1 = withGain(osc1, 0.40);
  const g2 = withGain(osc2, 0.18);
  const g3 = withGain(osc3, 0.10);

  const lfo  = makeOsc('sine', 3.8, oscs);
  const lfoG = withGain(lfo, freq * 0.007);
  lfoG.connect(osc1.frequency);
  lfoG.connect(osc2.frequency);

  const lpf = makeLPF(1200, 0.7);
  [g1, g2, g3].forEach(g => g.connect(lpf));

  // low gain per note: multiple notes play together
  const env = makeADSR(now, dur, { a: 0.20, d: 0.40, s: 0.70, r: 1.5, peak: 0.11 });
  lpf.connect(env);
  routeToMaster(env, 0.55, oscs, now, now + dur + 1.8);

  if (trackEnvs) trackEnvs.push(env);
  if (trackOscs) oscs.forEach(o => trackOscs.push(o));
}

function stopChordPreview() {
  if (!audioCtx || (previewEnvs.length === 0 && previewOscs.length === 0)) return;
  const now = audioCtx.currentTime;
  previewEnvs.forEach(env => {
    try {
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.linearRampToValueAtTime(0, now + 0.08);
    } catch (_) {}
  });
  previewOscs.forEach(o => {
    try { o.stop(now + 0.1); } catch (_) {}
  });
  previewEnvs = [];
  previewOscs = [];
}

function playChord(chord, isPreview = false) {
  if (!audioCtx || !audioReady || !chord) return;
  const now = audioCtx.currentTime;
  const dur = getStepMs() * COLS / 1000; // full loop duration
  if (isPreview) {
    chord.freqs.forEach(freq => synthChordNote(freq, now, dur, previewEnvs, previewOscs));
  } else {
    chord.freqs.forEach(freq => synthChordNote(freq, now, dur));
  }
}

// ── Sequencer ─────────────────────────────────────────

function getStepMs() {
  return 60000 / (bpm * 4); // 16th note in ms
}

function tick() {
  // iOS may silently suspend the AudioContext between ticks — keep it alive
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // At loop start: apply pending chord and trigger it
  if (currentStep === 0) {
    activeChord = pendingChord;
    updateChordUI();
    if (activeChord) playChord(activeChord);
  }

  updatePlayhead(currentStep);
  for (let row = 0; row < ROWS; row++) {
    if (grid[row][currentStep]) playNote(row);
  }
  if (drumGrid[0][currentStep]) synthKick();
  if (drumGrid[1][currentStep]) synthTom();
  currentStep = (currentStep + 1) % COLS;
}

function scheduleTick() {
  const delay = Math.max(0, nextTickAt - performance.now());
  intervalId = setTimeout(() => {
    tick();
    nextTickAt += getStepMs();
    if (isPlaying) scheduleTick();
  }, delay);
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
  nextTickAt = performance.now() + getStepMs();
  scheduleTick();
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;
  clearTimeout(intervalId);
  intervalId = null;
  updatePlayhead(-1);
  prevStep    = -1;
  currentStep = 0;
  activeChord = null;
  updateChordUI();
  setStatus('STOPPED');
  setPlayBtn(false);
}

function restartIfPlaying() {
  if (!isPlaying) return;
  clearTimeout(intervalId);
  nextTickAt = performance.now() + getStepMs();
  scheduleTick();
}

// ── UI ────────────────────────────────────────────────

function buildDrumGrid() {
  const drumEl   = document.getElementById('drumGrid');
  const labelsEl = document.getElementById('drumLabels');
  drumEl.innerHTML = labelsEl.innerHTML = '';

  for (let row = 0; row < 2; row++) {
    const lbl = document.createElement('div');
    lbl.className   = 'note-label';
    lbl.textContent = DRUM_NAMES[row];
    labelsEl.appendChild(lbl);
  }

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('div');
      cell.className   = 'drum-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.addEventListener('pointerdown', e => {
        e.preventDefault();
        onDrumCellTap(row, col);
      });
      drumEl.appendChild(cell);
    }
  }
}

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
    lbl.className   = 'note-label' + (NOTES[row].black ? ' black-key' : '');
    lbl.textContent = NOTES[row].name;
    labelsEl.appendChild(lbl);
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('div');
      cell.className   = 'cell' + (NOTES[row].black ? ' black-key' : '');
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

function getDrumCell(row, col) {
  return document.querySelector(`.drum-cell[data-row="${row}"][data-col="${col}"]`);
}
function refreshDrumCell(row, col) {
  getDrumCell(row, col)?.classList.toggle('active', drumGrid[row][col]);
}

async function onDrumCellTap(row, col) {
  await ensureAudio();
  drumGrid[row][col] = !drumGrid[row][col];
  refreshDrumCell(row, col);
  if (drumGrid[row][col] && audioReady) {
    if (row === 0) synthKick(); else synthTom();
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
    for (let r = 0; r < 2; r++) getDrumCell(r, prevStep)?.classList.remove('playhead');
    document.getElementById(`ind-${prevStep}`)?.classList.remove('active');
  }
  if (step >= 0) {
    for (let r = 0; r < ROWS; r++) getCell(r, step)?.classList.add('playhead');
    for (let r = 0; r < 2; r++) getDrumCell(r, step)?.classList.add('playhead');
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

// ── Chord selector UI ─────────────────────────────────

function buildChordSelector() {
  const container = document.getElementById('chordButtons');
  if (!container) return;
  CHORDS.forEach((chord, i) => {
    const btn = document.createElement('button');
    btn.className   = 'chord-btn';
    btn.textContent = chord.name;
    btn.id          = `chord-btn-${i}`;
    btn.addEventListener('pointerdown', async e => {
      e.preventDefault();
      await ensureAudio();
      onChordSelect(i);
    });
    container.appendChild(btn);
  });
}

function onChordSelect(index) {
  const chord  = CHORDS[index];
  pendingChord = (pendingChord === chord) ? null : chord;
  updateChordUI();
  // Preview only when stopped; during playback the chord fires at step 0
  if (!isPlaying && audioReady) {
    stopChordPreview();
    if (pendingChord) playChord(pendingChord, true);
  }
}

function updateChordUI() {
  CHORDS.forEach((chord, i) => {
    const btn = document.getElementById(`chord-btn-${i}`);
    if (!btn) return;
    btn.classList.toggle('active',  chord === activeChord);
    btn.classList.toggle('pending', chord === pendingChord && chord !== activeChord);
  });
}

// ── Dynamic grid sizing ───────────────────────────────
// Measures available space after layout, then sets CSS vars
// so the grid always fits the screen with the largest
// possible cells.

function resizeGrid() {
  const area      = document.getElementById('gridArea');
  const inds      = document.getElementById('stepIndicators');
  const status    = document.querySelector('.status-bar');
  const chordArea = document.getElementById('chordArea');
  if (!area) return;

  // Available height for grid-wrapper = gridArea height
  // minus step-indicators, chord-area, status-bar, and inner gaps (6px * 4)
  const indsH   = inds      ? inds.offsetHeight      : 0;
  const statusH = status    ? status.offsetHeight    : 0;
  const kbArea  = document.getElementById('miniKeyboard');
  const chordH  = chordArea ? chordArea.offsetHeight : 0;
  const kbH     = kbArea    ? kbArea.offsetHeight    : 0;
  const gapH    = 6 * 5; // 5 gaps: indicators↔melody, melody↔drums, drums↔chord, chord↔kb, kb↔status
  const availH  = area.clientHeight - indsH - statusH - chordH - kbH - gapH - 8;

  // Available width = gridArea width minus note labels (26px) and gap (6px)
  const labelW  = 30;
  const availW  = area.clientWidth - labelW - 6;

  // Cell size that fits all columns / all rows
  const GAPS_X    = COLS - 1 + 3; // 3 extra px for beat-group margins
  const totalRows = ROWS + 2;     // 17 melody + 2 drum rows
  const GAPS_Y    = totalRows - 1;
  const minGap    = 3;

  const fromW   = Math.floor((availW - GAPS_X * minGap) / COLS);
  const fromH   = Math.floor((availH - GAPS_Y * minGap) / totalRows);
  const size    = Math.min(48, Math.max(14, Math.min(fromW, fromH)));
  const gap     = Math.max(2, Math.min(6, Math.round(size / 9)));

  document.documentElement.style.setProperty('--cell-size', size + 'px');
  document.documentElement.style.setProperty('--cell-gap',  gap  + 'px');
  repositionBlackKeys();
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

  // Default drum pattern: kick on each beat
  drumGrid = Array.from({ length: 2 }, () => Array(COLS).fill(false));
  drumGrid[0][0] = drumGrid[0][4] = drumGrid[0][8] = drumGrid[0][12] = true;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < COLS; c++) refreshDrumCell(r, c);
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
  drumGrid = Array.from({ length: 2 }, () => Array(COLS).fill(false));
  for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) refreshDrumCell(r, c);
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
document.getElementById('drumGrid').addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('chordArea').addEventListener('contextmenu', e => e.preventDefault());

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
buildDrumGrid();
buildChordSelector();
buildKeyboard();
loadDemo();
setStatus('TAP OVERLAY TO ENABLE AUDIO');

// Wait for fonts + layout, then size the grid
document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(resizeGrid);
  });
});
