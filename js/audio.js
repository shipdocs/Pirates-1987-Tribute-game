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
// Een tropische deun voor de Caraïben, op de tresillo: het 3+3+2-ritme met
// Afro-Caribische wortels dat later de bodem werd van zowat alle eilandmuziek.
// De bas valt op één, op de tweede helft van twee, en op vier; de akkoorden
// vallen er telkens náást, op de tegentel. Dat schuren van de twee tegen
// elkaar is wat de maat laat wiegen zonder dat er iets hard hoeft te slaan.
//
// F-groot, rustig tempo, en alles wordt geplukt in plaats van aangehouden —
// korte aanslagen met een boventoon die sneller uitdooft dan de grondtoon,
// waardoor het naar hout klinkt in plaats van naar een orgel.
//
// Alles wordt hier opgewekt: melodie, bas, akkoorden, schudritme en de meeuw.
// Geen enkel geluidsbestand, net als de rest van het spel.

/** Middelbare toonhoogte (MIDI) naar frequentie. */
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Duur van een zestiende. Zestien daarvan vullen een maat van vier tellen. */
const ZESTIENDE = 0.145;
const MAAT = ZESTIENDE * 16;

/**
 * De melodie als [toon, lengte-in-zestienden]; `null` is een rust. De ruimte zit
 * hier niet in de rusten maar in de aanslag: geplukte noten doven uit, dus een
 * lange noot is grotendeels stilte met een naklank. De meeste zinnen beginnen
 * bovendien op de tegentel in plaats van op de tel — dat is de syncope die het
 * geheel laat wiegen.
 */
const R = null;
const MELODIE = [
  // A-deel: I - vi - ii - V, de zonnige omkeer, twee keer rond.
  [R, 2], [69, 3], [72, 3], [77, 6], [R, 2],
  [R, 2], [76, 3], [74, 3], [69, 6], [R, 2],
  [R, 2], [74, 3], [72, 3], [70, 4], [67, 4],
  [72, 6], [R, 2], [67, 4], [72, 4],
  [R, 2], [69, 3], [72, 3], [77, 4], [79, 4],
  [77, 3], [76, 3], [74, 6], [R, 4],
  [R, 2], [70, 3], [72, 3], [74, 4], [72, 4],
  [72, 4], [76, 4], [74, 4], [72, 4],
  // B-deel: naar de onderdominant en langs de zesde weer terug.
  [R, 2], [70, 3], [74, 3], [77, 8],
  [79, 4], [77, 4], [76, 4], [74, 4],
  [R, 2], [72, 3], [76, 3], [81, 8],
  [79, 4], [77, 4], [74, 8],
  [R, 2], [70, 3], [74, 3], [79, 4], [77, 4],
  [76, 4], [74, 4], [72, 6], [R, 2],
  [R, 2], [69, 3], [72, 3], [77, 4], [76, 4],
  [74, 4], [72, 4], [69, 8],
];

/**
 * Eén akkoord per maat. `bas` en `vijfde` dragen de tresillo, `greep` is de
 * viertonige ligging die op de tegentel wordt aangeslagen.
 */
const Fmaj = { bas: 41, vijfde: 48, greep: [65, 69, 72, 76] };
const Dm7 = { bas: 38, vijfde: 45, greep: [62, 65, 69, 72] };
const Gm7 = { bas: 43, vijfde: 50, greep: [67, 70, 74, 77] };
const C7 = { bas: 36, vijfde: 43, greep: [60, 64, 67, 70] };
const Bbmaj = { bas: 46, vijfde: 53, greep: [58, 62, 65, 69] };
const Am7 = { bas: 45, vijfde: 52, greep: [57, 60, 64, 67] };
const AKKOORDEN = [
  Fmaj, Dm7, Gm7, C7, Fmaj, Dm7, Gm7, C7,
  Bbmaj, Bbmaj, Am7, Dm7, Gm7, C7, Fmaj, C7,
];

const MATEN = AKKOORDEN.length;
const ZESTIENDEN_TOTAAL = MATEN * 16;

/** De tresillo: 3+3+2, hier in zestienden dus op 0, 6 en 12. */
const TRESILLO = [0, 6, 12];
/** De tegentel waarop het akkoord wordt aangeslagen — telkens náást de bas. */
const TEGENTEL = [2, 6, 10, 14];

/** Melodie omgerekend naar: op welke zestiende begint welke noot. */
const MELODIE_OP = new Map();
{
  let pos = 0;
  for (const [toon, lengte] of MELODIE) {
    if (toon !== null) MELODIE_OP.set(pos, [toon, lengte]);
    pos += lengte;
  }
}

/**
 * Een geplukte noot. Een marimba is in de kern een sinus met een boventoon die
 * veel sneller uitdooft dan de grondtoon; dat verschil in uitdoving is wat het
 * naar hout laat klinken. `helder` regelt hoeveel boventoon er mee mag.
 */
function pluk(toon, start, duur, vol, helder = 0.3, naarGalm = false) {
  const c = state.ctx;
  const f = mf(toon);
  // Een geplukte noot klinkt uit op eigen tempo, niet op de genoteerde lengte —
  // maar nooit zo lang dat hij over de volgende heen blijft hangen.
  const uit = Math.min(duur * 1.5, 1.3);

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, start);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + uit);
  osc.connect(g);
  g.connect(state.muziekGain);
  if (naarGalm && state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + uit + 0.02);

  if (helder <= 0) return;
  const bov = c.createOscillator();
  bov.type = 'sine';
  bov.frequency.setValueAtTime(f * 4, start);
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, start);
  bg.gain.exponentialRampToValueAtTime(vol * helder, start + 0.004);
  bg.gain.exponentialRampToValueAtTime(0.0001, start + uit * 0.28);
  bov.connect(bg);
  bg.connect(state.muziekGain);
  bov.start(start);
  bov.stop(start + uit * 0.3 + 0.02);
}

/** Schudritme: een kort ruisje, hoog weggefilterd. Zacht, het is geen dansvloer. */
function schud(start, sterk) {
  const c = state.ctx;
  const duur = sterk ? 0.055 : 0.035;
  const len = Math.max(1, Math.floor(c.sampleRate * duur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6200;
  const g = c.createGain();
  g.gain.value = sterk ? 0.085 : 0.045;
  src.connect(f);
  f.connect(g);
  g.connect(state.muziekGain);
  src.start(start);
}

/**
 * Een meeuw. De roep is een nasaal "kie-auw": de toon schiet omhoog en zakt dan
 * langzamer terug, door een smalle band gehaald zodat het schril wordt in plaats
 * van muzikaal. Twee tot vier kreten achter elkaar, want één meeuw roept nooit
 * één keer. Hij gaat naar de echo, zodat hij van ver over het water lijkt te komen.
 */
function meeuw(start) {
  const c = state.ctx;
  const kreten = 2 + Math.floor(Math.random() * 3);
  const hoog = 780 + Math.random() * 260; // elke meeuw zijn eigen stem
  let t = start;
  for (let i = 0; i < kreten; i++) {
    const duur = 0.17 + Math.random() * 0.1;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    // Omhoog schieten, dan trager terugzakken: dat is de vorm van de roep.
    osc.frequency.setValueAtTime(hoog * 0.62, t);
    osc.frequency.exponentialRampToValueAtTime(hoog * 1.28, t + duur * 0.16);
    osc.frequency.exponentialRampToValueAtTime(hoog * 0.72, t + duur);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 3.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.06, t + duur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    osc.connect(band);
    band.connect(g);
    g.connect(state.muziekGain);
    if (state.galm) g.connect(state.galm);
    osc.start(t);
    osc.stop(t + duur + 0.02);
    // Steeds iets korter achter elkaar, zoals een meeuw die zich opwindt.
    t += duur + 0.16 - i * 0.02;
  }
}

/** Plant alles wat op deze zestiende begint. */
function planZestiende(index, start) {
  const inLus = ((index % ZESTIENDEN_TOTAAL) + ZESTIENDEN_TOTAAL) % ZESTIENDEN_TOTAAL;
  const maat = Math.floor(inLus / 16);
  const tel = inLus % 16;
  const akkoord = AKKOORDEN[maat];
  // Vanaf de tweede ronde komt het schudritme erbij, zodat de lus ergens
  // naartoe groeit in plaats van in zichzelf te blijven rondlopen.
  const ronde = Math.floor(index / ZESTIENDEN_TOTAAL);
  const vol = ronde > 0;

  const noot = MELODIE_OP.get(inLus);
  if (noot) {
    const [toon, lengte] = noot;
    pluk(toon, start, lengte * ZESTIENDE, 0.34, 0.34, true);
  }

  // Bas op de tresillo: grondtoon op één en op vier, de kwint op de tegentel
  // van twee. Dat middelste aanslagje is het hele geheim van de maat.
  if (tel === TRESILLO[0]) pluk(akkoord.bas, start, ZESTIENDE * 5, 0.3, 0.06);
  if (tel === TRESILLO[1]) pluk(akkoord.vijfde, start, ZESTIENDE * 4, 0.2, 0.06);
  if (tel === TRESILLO[2]) pluk(akkoord.bas, start, ZESTIENDE * 4, 0.26, 0.06);

  // Akkoord op de tegentel, kort en zacht — het tikje van een cuatro.
  if (TEGENTEL.includes(tel)) {
    akkoord.greep.forEach((t, i) => {
      pluk(t, start + i * 0.008, ZESTIENDE * 1.6, 0.05, 0.5);
    });
  }

  // Schudritme op de achtsten, met de nadruk op de tegentellen.
  if (vol && tel % 2 === 0) schud(start, tel % 4 === 2);

  // En af en toe een meeuw: hooguit één kans per vier maten, en nooit in de
  // eerste ronde — dan is de deun aan het woord. Dat komt neer op ongeveer één
  // meeuw per halve minuut, vaak genoeg om te leven, zelden genoeg om niet te
  // gaan storen. Hoger of lager? Alleen deze kans hoeft te veranderen.
  if (vol && tel === 0 && maat % 4 === 1 && Math.random() < 0.35) {
    meeuw(start + Math.random() * MAAT * 0.5);
  }
}

// De planner kijkt een stukje vooruit en zet noten op de klok van de
// audiokaart, niet op die van de browser. setTimeout loopt onder belasting
// tientallen milliseconden uit — hoorbaar als slepende maten — terwijl de
// audioklok onverstoorbaar doorloopt, ook als het tekenen even hapert.
const VOORUIT = 0.25; // seconden die we vooruit plannen
const TIK = 45; // milliseconden tussen twee controles

let volgendeZestiende = 0;
let positie = 0;

function planner() {
  if (!state.muziekAan) return;
  const c = state.ctx;
  if (!c) return;
  // Bij het hervatten na een pauze ligt de klok verder; sluit dan gewoon aan.
  if (volgendeZestiende < c.currentTime) volgendeZestiende = c.currentTime + 0.06;
  while (volgendeZestiende < c.currentTime + VOORUIT) {
    if (state.aan) planZestiende(positie, volgendeZestiende);
    volgendeZestiende += ZESTIENDE;
    positie++;
  }
}

/** De scène wil muziek. Blijft stil als de speler haar heeft uitgezet. */
export function startMuziek() {
  if (state.muziekTimer || !state.muziekGewenst) return;
  const c = ctx();
  if (!c) return;
  state.muziekAan = true;
  volgendeZestiende = c.currentTime + 0.12;
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
  volgendeZestiende = 0;
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
  return Math.floor(positie / 16) % MATEN;
}

export { MAAT as MUZIEK_MAATDUUR };
