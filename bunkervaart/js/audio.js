// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Alles klinkt uit de Web Audio API; er wordt geen enkel geluidsbestand
// geladen. De klankbank is anders dan die van Zeeroverij — geen kanonnen en
// zeilen maar een dieseltje, een pomp, een marifoon en een alarm — maar de
// opbouw is dezelfde: één context, één hoofdkraan, en alles faalt zacht.

let ctx = null;
let hoofd = null;
let aan = true;
let motorKnoop = null;
let pompKnoop = null;

function zorgContext() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    hoofd = ctx.createGain();
    hoofd.gain.value = 0.5;
    hoofd.connect(ctx.destination);
  } catch (fout) {
    ctx = null;
  }
  return ctx;
}

/** Browsers openen de audio pas na een gebruikersgebaar; dit is dat haakje. */
export function ontgrendel() {
  const c = zorgContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function zetGeluid(waarde) {
  aan = !!waarde;
  if (hoofd) hoofd.gain.value = aan ? 0.5 : 0;
  try {
    localStorage.setItem('bunkervaart.geluid.v1', aan ? '1' : '0');
  } catch (fout) {
    /* Geen opslag: dan geldt de keuze alleen deze zitting. */
  }
}

export function geluidAan() {
  return aan;
}

try {
  aan = localStorage.getItem('bunkervaart.geluid.v1') !== '0';
} catch (fout) {
  /* Standaard aan. */
}

/** Korte toon met een envelope. De bouwsteen onder bijna alles hieronder. */
function toon(freq, duur, opts = {}) {
  const c = zorgContext();
  if (!c || !aan) return;
  const nu = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.vorm || 'sine';
  osc.frequency.setValueAtTime(freq, nu);
  if (opts.naar) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.naar), nu + duur);
  const vol = (opts.vol != null ? opts.vol : 0.3);
  g.gain.setValueAtTime(0.0001, nu);
  g.gain.exponentialRampToValueAtTime(vol, nu + Math.min(0.02, duur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, nu + duur);
  osc.connect(g);
  g.connect(hoofd);
  osc.start(nu);
  osc.stop(nu + duur + 0.05);
}

/** Ruisbron met een filter — water, stoom, ontluchten. */
function ruis(duur, opts = {}) {
  const c = zorgContext();
  if (!c || !aan) return;
  const nu = c.currentTime;
  const n = Math.floor(c.sampleRate * duur);
  const buf = c.createBuffer(1, Math.max(1, n), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type || 'bandpass';
  f.frequency.value = opts.freq || 700;
  f.Q.value = opts.q || 1;
  const g = c.createGain();
  const vol = opts.vol != null ? opts.vol : 0.2;
  g.gain.setValueAtTime(vol, nu);
  g.gain.exponentialRampToValueAtTime(0.0001, nu + duur);
  src.connect(f);
  f.connect(g);
  g.connect(hoofd);
  src.start(nu);
}

export const sfx = {
  klik: () => toon(520, 0.05, { vorm: 'triangle', vol: 0.12 }),
  bevestig: () => {
    toon(440, 0.09, { vorm: 'triangle', vol: 0.16 });
    setTimeout(() => toon(660, 0.12, { vorm: 'triangle', vol: 0.14 }), 70);
  },
  fout: () => toon(180, 0.22, { vorm: 'square', vol: 0.14, naar: 120 }),
  // Marifoon: kort ruisje voor en na, zoals een squelch.
  marifoon: () => {
    ruis(0.05, { freq: 1800, vol: 0.1 });
    setTimeout(() => toon(880, 0.06, { vorm: 'square', vol: 0.08 }), 60);
  },
  // Sluisdeur: laag gedreun met metaal erin.
  sluis: () => {
    toon(70, 0.9, { vorm: 'sawtooth', vol: 0.14, naar: 48 });
    ruis(0.7, { freq: 240, vol: 0.1, q: 0.7 });
  },
  // Aanleggen: fender die kraakt tegen staal.
  stoot: (kracht = 1) => {
    toon(110 - kracht * 25, 0.28, { vorm: 'sawtooth', vol: 0.1 + kracht * 0.16, naar: 55 });
    ruis(0.2, { freq: 320, vol: 0.08 + kracht * 0.1, q: 0.6 });
  },
  // Alarm bij overdruk of overloop.
  alarm: () => {
    toon(880, 0.16, { vorm: 'square', vol: 0.2 });
    setTimeout(() => toon(660, 0.2, { vorm: 'square', vol: 0.2 }), 180);
  },
  // Pen op papier: de handtekening.
  tekenen: () => ruis(0.32, { freq: 2400, vol: 0.06, type: 'highpass' }),
  geld: () => {
    toon(920, 0.08, { vorm: 'triangle', vol: 0.15 });
    setTimeout(() => toon(1240, 0.14, { vorm: 'triangle', vol: 0.12 }), 80);
  },
};

/**
 * De motor loopt continu terwijl je vaart; `stand` (0..1) stuurt toerental en
 * volume. Eén blijvende oscillator in plaats van losse tonen, want een dieseltje
 * is een toestand en geen gebeurtenis.
 */
export function zetMotor(stand) {
  const c = zorgContext();
  if (!c) return;
  if (!motorKnoop) {
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    osc.type = 'sawtooth';
    osc2.type = 'square';
    g.gain.value = 0;
    osc.connect(f);
    osc2.connect(f);
    f.connect(g);
    g.connect(hoofd);
    osc.start();
    osc2.start();
    motorKnoop = { osc, osc2, g, f };
  }
  const s = Math.max(0, Math.min(1, stand));
  const nu = c.currentTime;
  motorKnoop.osc.frequency.setTargetAtTime(38 + s * 34, nu, 0.3);
  motorKnoop.osc2.frequency.setTargetAtTime(19 + s * 17, nu, 0.3);
  motorKnoop.g.gain.setTargetAtTime(aan ? 0.02 + s * 0.05 : 0, nu, 0.3);
}

/** De pomp tijdens de overslag; `stand` (0..1) is het debiet. */
export function zetPomp(stand) {
  const c = zorgContext();
  if (!c) return;
  if (!pompKnoop) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 3;
    osc.type = 'sawtooth';
    g.gain.value = 0;
    osc.connect(f);
    f.connect(g);
    g.connect(hoofd);
    osc.start();
    pompKnoop = { osc, g, f };
  }
  const s = Math.max(0, Math.min(1, stand));
  const nu = c.currentTime;
  pompKnoop.osc.frequency.setTargetAtTime(84 + s * 62, nu, 0.2);
  pompKnoop.f.frequency.setTargetAtTime(340 + s * 520, nu, 0.2);
  pompKnoop.g.gain.setTargetAtTime(aan && s > 0.01 ? 0.03 + s * 0.06 : 0, nu, 0.2);
}

/** Alles stil: bij het verlaten van een scène. */
export function stilte() {
  zetMotor(0);
  zetPomp(0);
}
