// Alle geluid wordt in de browser zelf opgewekt; geen externe bestanden nodig.
const state = {
  ctx: null,
  master: null,
  muziekGain: null,
  sfxGain: null,
  aan: true,
  // Twee dingen die uit elkaar gehouden moeten worden: wat de speler wil, en of
  // de deun op dít moment speelt. De zeeslag en het duel leggen de muziek stil
  // en zetten hem daarna weer aan — dat mag de wens van de speler niet
  // overschrijven.
  muziekGewenst: true,
  muziekAan: false,
  muziekTimer: null,
  golfBron: null,
  galm: null,
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
    // Een korte echo geeft de melodie ruimte, alsof ze over water draagt.
    // Terugkoppeling ver onder de helft, anders loopt het vol.
    const vertraag = state.ctx.createDelay(1);
    vertraag.delayTime.value = 0.255;
    const terug = state.ctx.createGain();
    terug.gain.value = 0.26;
    const demp = state.ctx.createBiquadFilter();
    demp.type = 'lowpass';
    demp.frequency.value = 1800;
    const echoNiveau = state.ctx.createGain();
    echoNiveau.gain.value = 0.3;
    vertraag.connect(demp);
    demp.connect(terug);
    terug.connect(vertraag);
    demp.connect(echoNiveau);
    echoNiveau.connect(state.muziekGain);
    state.galm = vertraag;
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
//
// Een eigen zeemansdeun in 6/8 — het wiegende maatsoort van de hoornpijp, twee
// tellen van drie per maat, precies het ritme waarop een gangspil rondgaat.
// D-dorisch: mineur, maar met een grote sext, waardoor het klaagt noch triomfeert.
//
// Alles wordt hier opgewekt: melodie, tegenstem, baslijn, akkoorden en een
// trommeltje van geruis. Geen enkel geluidsbestand, net als de rest van het spel.

/** Middelbare toonhoogte (MIDI) naar frequentie. */
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Duur van een achtste noot. Zes daarvan vullen een maat. */
const ACHTSTE = 0.17;
const MAAT = ACHTSTE * 6;

/**
 * De melodie als [toon, lengte-in-achtsten]. Zestien maten in twee helften: een
 * A-deel dat laag begint en terugzakt, en een B-deel dat het thema een octaaf
 * hoger opneemt en pas in de laatste maat weer thuiskomt.
 */
const MELODIE = [
  // A-deel: uitvaren.
  [62, 2], [65, 1], [69, 2], [74, 1],
  [72, 3], [69, 3],
  [71, 2], [67, 1], [71, 2], [72, 1],
  [67, 6],
  [62, 2], [65, 1], [69, 2], [72, 1],
  [74, 3], [72, 1], [69, 2],
  [71, 2], [69, 1], [67, 2], [65, 1],
  [62, 6],
  // B-deel: ruime zee.
  [69, 1], [72, 1], [77, 2], [76, 1], [74, 1],
  [76, 2], [72, 1], [67, 3],
  [74, 1], [76, 1], [77, 2], [81, 2],
  [79, 3], [77, 3],
  [76, 2], [77, 1], [76, 2], [74, 1],
  [72, 3], [71, 3],
  [69, 2], [74, 1], [72, 2], [69, 1],
  [74, 6],
];

/** Eén akkoord per maat; `bas` is de grondtoon, `vijfde` de tegenhanger erop. */
const Dm = { bas: 38, vijfde: 45, drieklank: [62, 65, 69] };
const C = { bas: 36, vijfde: 43, drieklank: [60, 64, 67] };
const F = { bas: 41, vijfde: 48, drieklank: [65, 69, 72] };
const AKKOORDEN = [Dm, Dm, C, C, Dm, Dm, C, Dm, F, C, Dm, Dm, F, C, Dm, Dm];

const MATEN = AKKOORDEN.length;
const ACHTSTEN_TOTAAL = MATEN * 6;

/** Melodie omgerekend naar: op welke achtste begint welke noot. */
const MELODIE_OP = new Map();
{
  let pos = 0;
  for (const [toon, lengte] of MELODIE) {
    MELODIE_OP.set(pos, [toon, lengte]);
    pos += lengte;
  }
}

/**
 * Een gestemde noot op de muziekbus. `stem` bepaalt het karakter: de melodie
 * klinkt als een tinnen fluit, de bas als een gestreken snaar.
 */
function muziekNoot(toon, start, duur, vorm, vol, naarGalm = false) {
  const c = state.ctx;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = vorm;
  osc.frequency.setValueAtTime(mf(toon), start);
  // Een klein aanzetje omhoog geeft de noot een aangeblazen begin.
  osc.frequency.linearRampToValueAtTime(mf(toon), start + 0.03);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.025);
  g.gain.exponentialRampToValueAtTime(vol * 0.6, start + duur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duur * 0.98);
  osc.connect(g);
  g.connect(state.muziekGain);
  if (naarGalm && state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + duur);
}

/** Trommeltje: een doffe slag of een licht tikje, allebei uit geruis. */
function muziekSlag(start, laag) {
  const c = state.ctx;
  const duur = laag ? 0.16 : 0.05;
  const len = Math.max(1, Math.floor(c.sampleRate * duur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, laag ? 2 : 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = laag ? 'lowpass' : 'bandpass';
  f.frequency.value = laag ? 190 : 5200;
  const g = c.createGain();
  g.gain.value = laag ? 0.5 : 0.1;
  src.connect(f);
  f.connect(g);
  g.connect(state.muziekGain);
  src.start(start);
}

/** Plant alles wat op deze achtste noot begint. */
function planAchtste(index, start) {
  const inLus = ((index % ACHTSTEN_TOTAAL) + ACHTSTEN_TOTAAL) % ACHTSTEN_TOTAAL;
  const maat = Math.floor(inLus / 6);
  const tel = inLus % 6;
  const akkoord = AKKOORDEN[maat];
  // Vanaf de tweede ronde komt de tegenstem erbij, zodat de lus niet in
  // zichzelf blijft rondlopen maar ergens naartoe groeit.
  const ronde = Math.floor(index / ACHTSTEN_TOTAAL);
  const vol = ronde > 0;

  const noot = MELODIE_OP.get(inLus);
  if (noot) {
    const [toon, lengte] = noot;
    const duur = lengte * ACHTSTE;
    muziekNoot(toon, start, duur, 'triangle', 0.42, true);
    // Tegenstem een octaaf lager: vult de klank zonder ooit vals te staan.
    if (vol) muziekNoot(toon - 12, start, duur, 'sine', 0.16);
  }

  // Bas: grondtoon op de eerste tel, de kwint op de vierde — het wiegen van 6/8.
  if (tel === 0) muziekNoot(akkoord.bas, start, ACHTSTE * 2.8, 'sine', 0.34);
  if (tel === 3) muziekNoot(akkoord.vijfde, start, ACHTSTE * 2.6, 'sine', 0.28);

  // Akkoord eronder, zacht aangetokkeld zodat het niet met de melodie vecht.
  if (tel === 0 || tel === 3) {
    akkoord.drieklank.forEach((t, i) => {
      muziekNoot(t - 12, start + i * 0.012, ACHTSTE * 2.4, 'triangle', 0.07);
    });
  }

  // Trommel: slag op de twee hoofdtellen, tikje op de opmaat ernaartoe.
  if (tel === 0 || tel === 3) muziekSlag(start, true);
  if (vol && (tel === 2 || tel === 5)) muziekSlag(start, false);
}

// De planner kijkt een stukje vooruit en zet noten op de klok van de
// audiokaart, niet op die van de browser. setTimeout loopt onder belasting
// tientallen milliseconden uit — hoorbaar als slepende maten — terwijl de
// audioklok onverstoorbaar doorloopt, ook als het tekenen even hapert.
const VOORUIT = 0.25; // seconden die we vooruit plannen
const TIK = 45; // milliseconden tussen twee controles

let volgendeAchtste = 0;
let positie = 0;

function planner() {
  if (!state.muziekAan) return;
  const c = state.ctx;
  if (!c) return;
  // Bij het hervatten na een pauze ligt de klok verder; sluit dan gewoon aan.
  if (volgendeAchtste < c.currentTime) volgendeAchtste = c.currentTime + 0.06;
  while (volgendeAchtste < c.currentTime + VOORUIT) {
    if (state.aan) planAchtste(positie, volgendeAchtste);
    volgendeAchtste += ACHTSTE;
    positie++;
  }
}

/** De scène wil muziek. Blijft stil als de speler haar heeft uitgezet. */
export function startMuziek() {
  if (state.muziekTimer || !state.muziekGewenst) return;
  const c = ctx();
  if (!c) return;
  state.muziekAan = true;
  volgendeAchtste = c.currentTime + 0.12;
  state.muziekTimer = setInterval(planner, TIK);
  planner();
}

/** De scène legt de muziek stil (zeeslag, duel). Verandert de wens niet. */
export function stopMuziek() {
  state.muziekAan = false;
  if (state.muziekTimer) {
    clearInterval(state.muziekTimer);
    state.muziekTimer = null;
  }
  // De melodie hervat waar hij was; alleen de lus telt door, niet de maat.
  volgendeAchtste = 0;
}

/** De speler zet de muziek aan of uit. Dit ís de wens. */
export function zetMuziek(aan) {
  state.muziekGewenst = aan;
  if (aan) startMuziek();
  else stopMuziek();
}

/** Wat de speler wil — niet of er op dit moment geluid uit de luidspreker komt. */
export function muziekAan() {
  return state.muziekGewenst;
}

/** Hoe ver de deun is, in maten. Alleen voor de zekerheid bij het testen. */
export function muziekMaat() {
  return Math.floor(positie / 6) % MATEN;
}

export { MAAT as MUZIEK_MAATDUUR };
