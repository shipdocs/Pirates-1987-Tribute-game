// Alle geluid wordt in de browser zelf opgewekt; geen externe bestanden nodig.
const state = {
  ctx: null,
  master: null,
  muziekGain: null,
  sfxGain: null,
  aan: true,
  muziekAan: true,
  muziekTimer: null,
  golfBron: null,
};

function ctx() {
  if (!state.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    state.ctx = new AC();
    state.master = state.ctx.createGain();
    state.master.gain.value = 0.9;
    state.master.connect(state.ctx.destination);
    state.sfxGain = state.ctx.createGain();
    state.sfxGain.gain.value = 0.55;
    state.sfxGain.connect(state.master);
    state.muziekGain = state.ctx.createGain();
    state.muziekGain.gain.value = 0.22;
    state.muziekGain.connect(state.master);
  }
  return state.ctx;
}

export function ontgrendel() {
  const c = ctx();
  if (c && c.state === 'suspended') c.resume();
}

export function zetGeluid(aan) {
  state.aan = aan;
  if (state.master) state.master.gain.value = aan ? 0.9 : 0;
}

export function geluidAan() {
  return state.aan;
}

function toon(freq, duur, type = 'sine', vol = 0.3, start = 0, glijNaar = null) {
  if (!state.aan) return;
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glijNaar) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glijNaar), t0 + duur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duur);
  osc.connect(g);
  g.connect(state.sfxGain);
  osc.start(t0);
  osc.stop(t0 + duur + 0.05);
}

function ruis(duur, vol, filterFreq, type = 'lowpass', start = 0) {
  if (!state.aan) return;
  const c = ctx();
  if (!c) return;
  const len = Math.max(1, Math.floor(c.sampleRate * duur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(state.sfxGain);
  src.start(c.currentTime + start);
}

export const sfx = {
  kanon() {
    ruis(0.5, 0.7, 900);
    toon(70, 0.4, 'sine', 0.5, 0, 32);
  },
  treffer() {
    ruis(0.3, 0.5, 500);
    toon(120, 0.2, 'square', 0.18, 0, 50);
  },
  plons() {
    ruis(0.35, 0.3, 2600, 'bandpass');
  },
  kling() {
    toon(1400, 0.12, 'triangle', 0.3, 0, 900);
    toon(2100, 0.09, 'square', 0.12, 0.01, 1500);
    ruis(0.09, 0.16, 4000, 'highpass');
  },
  pareer() {
    toon(900, 0.16, 'triangle', 0.24, 0, 1600);
    ruis(0.12, 0.12, 3000, 'highpass');
  },
  raak() {
    toon(220, 0.22, 'sawtooth', 0.28, 0, 90);
    ruis(0.22, 0.3, 700);
  },
  munt() {
    toon(1180, 0.1, 'triangle', 0.22);
    toon(1560, 0.14, 'triangle', 0.18, 0.06);
    toon(2100, 0.16, 'triangle', 0.12, 0.12);
  },
  klik() {
    toon(620, 0.06, 'triangle', 0.14);
  },
  fout() {
    toon(180, 0.18, 'square', 0.16, 0, 110);
  },
  fanfare() {
    const n = [523, 659, 784, 1047];
    n.forEach((f, i) => toon(f, 0.32, 'triangle', 0.24, i * 0.11));
  },
  ramp() {
    ruis(1.2, 0.5, 380);
    toon(90, 1.0, 'sine', 0.3, 0, 30);
  },
  haven() {
    toon(392, 0.3, 'triangle', 0.18);
    toon(523, 0.4, 'triangle', 0.16, 0.14);
  },
};

// --- Muziek ---------------------------------------------------------------

// Eenvoudige zeemansdeun in mineur, eindeloos herhaald.
const DEUNTJE = [
  [440, 1], [523, 1], [587, 1], [659, 2], [587, 1], [523, 2], [440, 2],
  [392, 1], [440, 1], [523, 2], [494, 2], [440, 4],
  [523, 1], [587, 1], [659, 2], [698, 1], [659, 1], [587, 2], [523, 2],
  [494, 1], [523, 1], [587, 2], [523, 2], [440, 4],
];
const BAS = [220, 220, 293, 293, 262, 262, 220, 220];

let muziekIndex = 0;
let basIndex = 0;

function speelNoot() {
  if (!state.muziekAan || !state.aan) return;
  const c = ctx();
  if (!c) return;
  const [freq, lengte] = DEUNTJE[muziekIndex % DEUNTJE.length];
  const duur = lengte * 0.21;
  const t0 = c.currentTime;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duur * 0.95);
  osc.connect(g);
  g.connect(state.muziekGain);
  osc.start(t0);
  osc.stop(t0 + duur);

  // Baslijn eronder.
  const b = c.createOscillator();
  const bg = c.createGain();
  b.type = 'sine';
  b.frequency.value = BAS[basIndex % BAS.length];
  bg.gain.setValueAtTime(0.0001, t0);
  bg.gain.exponentialRampToValueAtTime(0.32, t0 + 0.04);
  bg.gain.exponentialRampToValueAtTime(0.0001, t0 + duur * 0.9);
  b.connect(bg);
  bg.connect(state.muziekGain);
  b.start(t0);
  b.stop(t0 + duur);

  muziekIndex++;
  if (muziekIndex % 2 === 0) basIndex++;
  state.muziekTimer = setTimeout(speelNoot, duur * 1000);
}

export function startMuziek() {
  if (state.muziekTimer) return;
  state.muziekAan = true;
  ctx();
  speelNoot();
}

export function stopMuziek() {
  state.muziekAan = false;
  if (state.muziekTimer) {
    clearTimeout(state.muziekTimer);
    state.muziekTimer = null;
  }
}

export function muziekAan() {
  return state.muziekAan;
}
