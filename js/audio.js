// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

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
  // Welk thema er klinkt, en welke de speler het laatst heeft gehad.
  thema: null,
  themaNaam: 'zee',
  ruisBuf: null,
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
  // De houten toeg zijn in het ankerscherm: een droge, korte tik die niet door
  // de muziek heen schreeuwt. Twee dicht op elkaar geeft het schip zijn
  // scheepsklok-achtige wachtritme.
  toeg() {
    toon(950, 0.05, 'triangle', 0.1);
  },
  toegHoog() {
    toon(1400, 0.06, 'triangle', 0.1);
  },
  // De wachtglas-renner slaat het glas — een tik die even rond blijft hangen.
  glas() {
    toon(1150, 0.12, 'triangle', 0.16);
    toon(2300, 0.1, 'triangle', 0.08, 0.02);
  },
  // Klaar met een bezigheid: een zonnige opgaande terts, als het afronden van
  // een zeekaart. Niet zo pompeus als de fanfare bij een stad.
  klaar() {
    toon(660, 0.13, 'triangle', 0.2);
    toon(830, 0.16, 'triangle', 0.18, 0.09);
    toon(990, 0.22, 'triangle', 0.14, 0.18);
    toon(1320, 0.26, 'triangle', 0.1, 0.27);
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
  /** De cel pakt je op: een aanzwellende vlaag met een opgaande toon erin. */
  stormRand() {
    ruis(1.4, 0.3, 900, 'bandpass');
    toon(180, 0.9, 'sine', 0.1, 0.1, 320);
  },
  /** De kernrand over: dof, laag, en niets opgaands meer. */
  stormKern() {
    ruis(1.8, 0.42, 320);
    toon(150, 1.4, 'sine', 0.2, 0, 52);
  },
  /** Het want onder spanning. Hoe hoger `nood`, hoe scherper het kraakt. */
  kraak(nood = 0) {
    ruis(0.5 + 0.3 * nood, 0.18 + 0.16 * nood, 380 + 260 * nood);
    toon(140 - 40 * nood, 0.5, 'sawtooth', 0.1 + 0.1 * nood, 0, 60);
  },
};

// --- Stormbed -------------------------------------------------------------
//
// Eén doorlopende ruislaag onder alles door, die met de storm mee zwelt. Losse
// klanken kunnen wel een grens márkeren, maar niet vertellen hóe diep je erin
// zit; daar is een aanhoudend geluid voor nodig dat met je meebeweegt. In de
// kern komt er een lage huiltoon bij, zodat gevaarlijk niet alleen hárder
// klinkt dan voordelig maar ook ánders.
const storm = { bron: null, filter: null, gain: null, huil: null, huilGain: null };

function bouwStormbed(c) {
  const len = Math.floor(c.sampleRate * 2.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  // Bruine ruis: veel meer laag dan witte ruis, en dat klinkt als wind in het
  // want in plaats van als een radio tussen twee zenders.
  let vorig = 0;
  for (let i = 0; i < len; i++) {
    vorig = (vorig + (Math.random() * 2 - 1) * 0.09) * 0.985;
    d[i] = vorig * 3.2;
  }
  // De naad glad maken, anders tikt de lus hoorbaar rond.
  const naad = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < naad; i++) {
    const t = i / naad;
    d[i] = d[i] * t + d[len - naad + i] * (1 - t);
  }
  const bron = c.createBufferSource();
  bron.buffer = buf;
  bron.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = c.createGain();
  gain.gain.value = 0;
  bron.connect(filter);
  filter.connect(gain);
  gain.connect(state.sfxGain);
  bron.start();

  const huil = c.createOscillator();
  huil.type = 'sawtooth';
  huil.frequency.value = 62;
  const huilGain = c.createGain();
  huilGain.gain.value = 0;
  const huilFilter = c.createBiquadFilter();
  huilFilter.type = 'lowpass';
  huilFilter.frequency.value = 200;
  huil.connect(huilFilter);
  huilFilter.connect(huilGain);
  huilGain.connect(state.sfxGain);
  huil.start();

  Object.assign(storm, { bron, filter, gain, huil, huilGain });
}

/**
 * Zet het stormbed op sterkte. `nabij` is hoe diep in de cel (0..1), `gevaar`
 * hoeveel daarvan de gevarenzone is. Alles glijdt met een tijdconstante, zodat
 * varen door een cel klinkt als aanzwellen en wegebben en niet als een schakelaar.
 */
export function zetStorm(nabij, gevaar) {
  const c = state.ctx;
  // Niet zelf de audiocontext wakker maken: die mag pas na een klik van de
  // speler ontstaan, anders blokkeert de browser hem alsnog.
  if (!c) return;
  if (!storm.bron) bouwStormbed(c);
  const n = state.aan ? Math.max(0, Math.min(1, nabij)) : 0;
  const g = state.aan ? Math.max(0, Math.min(1, gevaar)) : 0;
  const t = c.currentTime;
  storm.gain.gain.setTargetAtTime(0.5 * n * n, t, 0.5);
  storm.filter.frequency.setTargetAtTime(260 + 900 * n, t, 0.5);
  storm.huilGain.gain.setTargetAtTime(0.16 * g, t, 0.7);
  storm.huil.frequency.setTargetAtTime(52 + 26 * g, t, 0.7);
}// --- Muziek ---------------------------------------------------------------
//
// Twee thema's, allebei op de tresillo: het 3+3+2-ritme met Afro-Caribische
// wortels dat later de bodem werd van zowat alle eilandmuziek. De bas valt op
// één, op de tegentel van twee en op vier; de akkoorden vallen er telkens
// náást. Dat schuren van de twee tegen elkaar laat de maat wiegen zonder dat
// er iets hard hoeft te slaan.
//
//   'zee'      F-groot, 96 slagen — geplukt, warm, gewiegd door son clave en
//              lage conga's, met branding en meeuwen.
//   'gevecht'  D-klein, 143 slagen — gehamerd, met een A7 die naar bloed ruikt.
//
// Beide zijn opgebouwd uit delen van acht maten. Per deel wisselt de bezetting:
// niet elke stem speelt altijd mee. Dát is wat een korte lus lang houdt — niet
// meer noten, maar minder, op de juiste momenten.
//
// Alles wordt hier opgewekt: melodie, bas, akkoorden, slagwerk, koor, branding,
// krakend hout, de scheepsbel en de meeuw. Geen enkel geluidsbestand.

/** Middelbare toonhoogte (MIDI) naar frequentie. */
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** `null` in een melodie is een rust. */
const R = null;

// --- Akkoorden ------------------------------------------------------------
// `bas` en `vijfde` dragen de tresillo, `greep` is de ligging die op de
// tegentel wordt aangeslagen.

const Fmaj = { bas: 41, vijfde: 48, greep: [65, 69, 72, 76] };
const Dm7 = { bas: 38, vijfde: 45, greep: [62, 65, 69, 72] };
const Gm7 = { bas: 43, vijfde: 50, greep: [67, 70, 74, 77] };
const C7 = { bas: 36, vijfde: 43, greep: [60, 64, 67, 70] };
const Bbmaj = { bas: 46, vijfde: 53, greep: [58, 62, 65, 69] };
const Am7 = { bas: 45, vijfde: 52, greep: [57, 60, 64, 67] };
// Voor het gevecht, in D-klein.
const Dm = { bas: 38, vijfde: 45, greep: [62, 65, 69, 74] };
const Bb = { bas: 46, vijfde: 53, greep: [58, 62, 65, 70] };
const Cdur = { bas: 36, vijfde: 43, greep: [60, 64, 67, 72] };
const Gm = { bas: 43, vijfde: 50, greep: [67, 70, 74, 79] };
// De grote terts van A7 (de cis) hoort niet in D-klein. Juist daarom staat hij
// er: die ene vreemde noot is wat de maat naar de volgende toe laat trekken.
const A7 = { bas: 45, vijfde: 52, greep: [61, 64, 67, 69] };

// --- De delen -------------------------------------------------------------
// Elk deel is acht maten van zestien zestienden.

const DELEN = {
  // Zee, A: de zonnige omkeer I-vi-ii-V, twee keer rond.
  A: {
    akkoorden: [Fmaj, Dm7, Gm7, C7, Fmaj, Dm7, Gm7, C7],
    melodie: [
      [R, 2], [69, 3], [72, 3], [77, 6], [R, 2],
      [R, 2], [76, 3], [74, 3], [69, 6], [R, 2],
      [R, 2], [74, 3], [72, 3], [70, 4], [67, 4],
      [72, 6], [R, 2], [67, 4], [72, 4],
      [R, 2], [69, 3], [72, 3], [77, 4], [79, 4],
      [77, 3], [76, 3], [74, 6], [R, 4],
      [R, 2], [70, 3], [72, 3], [74, 4], [72, 4],
      [72, 4], [76, 4], [74, 4], [72, 4],
    ],
  },
  // Zee, B: naar de onderdominant en langs de zesde weer terug.
  B: {
    akkoorden: [Bbmaj, Bbmaj, Am7, Dm7, Gm7, C7, Fmaj, C7],
    melodie: [
      [R, 2], [70, 3], [74, 3], [77, 8],
      [79, 4], [77, 4], [76, 4], [74, 4],
      [R, 2], [72, 3], [76, 3], [81, 8],
      [79, 4], [77, 4], [74, 8],
      [R, 2], [70, 3], [74, 3], [79, 4], [77, 4],
      [76, 4], [74, 4], [72, 6], [R, 2],
      [R, 2], [69, 3], [72, 3], [77, 4], [76, 4],
      [74, 4], [72, 4], [69, 8],
    ],
  },
  // Zee, A': hetzelfde harmonische pad als A, maar een octaaf hoger opgevat.
  A2: {
    akkoorden: [Fmaj, Dm7, Gm7, C7, Fmaj, Dm7, Gm7, C7],
    melodie: [
      [R, 2], [77, 3], [81, 3], [84, 4], [81, 4],
      [R, 2], [81, 3], [79, 3], [77, 8],
      [R, 2], [79, 3], [77, 3], [74, 4], [70, 4],
      [72, 4], [76, 4], [79, 4], [76, 4],
      [R, 2], [77, 3], [81, 3], [84, 6], [R, 2],
      [81, 3], [79, 3], [77, 6], [R, 4],
      [R, 2], [77, 3], [79, 3], [81, 4], [79, 4],
      [79, 4], [76, 4], [74, 4], [72, 4],
    ],
  },
  // Zee, C: wijde horizon. Lange noten, hoog, weinig beweging.
  C: {
    akkoorden: [Gm7, C7, Fmaj, Dm7, Bbmaj, Am7, Gm7, C7],
    melodie: [
      [R, 4], [74, 4], [77, 8],
      [76, 4], [79, 4], [76, 8],
      [R, 2], [77, 3], [81, 3], [79, 8],
      [77, 4], [76, 4], [74, 8],
      [R, 2], [74, 3], [77, 3], [82, 8],
      [81, 4], [79, 4], [76, 8],
      [R, 2], [77, 3], [74, 3], [70, 8],
      [72, 4], [70, 4], [67, 8],
    ],
  },
  // Gevecht, X: korte stoten, steeds dezelfde kop, telkens anders afgemaakt.
  X: {
    akkoorden: [Dm, Dm, Bb, Cdur, Dm, Gm, A7, Dm],
    melodie: [
      [74, 2], [74, 2], [77, 2], [R, 2], [74, 2], [R, 2], [72, 4],
      [74, 2], [74, 2], [77, 2], [R, 2], [81, 4], [79, 4],
      [77, 2], [77, 2], [74, 2], [R, 2], [70, 4], [74, 4],
      [72, 2], [72, 2], [76, 2], [R, 2], [79, 4], [76, 4],
      [74, 2], [74, 2], [77, 2], [R, 2], [74, 2], [R, 2], [81, 4],
      [79, 2], [79, 2], [74, 2], [R, 2], [77, 4], [74, 4],
      [76, 2], [76, 2], [73, 2], [R, 2], [76, 4], [69, 4],
      [74, 4], [R, 2], [74, 2], [R, 2], [74, 6],
    ],
  },
  // Gevecht, Y: het wordt menens. Hoger, en de A7 blijft twee maten hangen.
  Y: {
    akkoorden: [Gm, Gm, A7, A7, Bb, Cdur, Dm, A7],
    melodie: [
      [R, 2], [79, 2], [82, 2], [79, 2], [77, 4], [74, 4],
      [R, 2], [79, 2], [82, 2], [79, 2], [86, 4], [82, 4],
      [81, 2], [81, 2], [85, 2], [R, 2], [81, 4], [76, 4],
      [81, 2], [81, 2], [85, 2], [R, 2], [88, 4], [85, 4],
      [86, 2], [R, 2], [82, 2], [R, 2], [81, 4], [77, 4],
      [84, 2], [R, 2], [79, 2], [R, 2], [76, 4], [72, 4],
      [86, 2], [86, 2], [81, 2], [R, 2], [77, 4], [74, 4],
      [76, 4], [73, 4], [69, 8],
    ],
  },
};

/**
 * Wie er speelt, per deel van acht maten. De lijst loopt rond, en omdat hij een
 * andere lengte heeft dan de vorm schuiven de twee langs elkaar: pas na twaalf
 * delen staat dezelfde bezetting weer op hetzelfde deel. Dat is bijna vier
 * minuten voordat er iets letterlijk wordt herhaald.
 */
const BEZETTING_ZEE = [
  // Rustige delen: alleen de bas, de clave en af en toe een conga-tik houden
  // het fundament. De clave klinkt er hoe dan ook: hij is het anker van de
  // warmte, dus alleen in de adempauze valt hij éven stil.
  { melodie: 1, tegen: 0, akkoord: 0, schud: 0, clave: 1, conga: 0, koor: 0, meeuw: 0, zee: 1, versier: 0 },
  { melodie: 1, tegen: 0, akkoord: 1, schud: 1, clave: 1, conga: 1, koor: 0, meeuw: 1, zee: 1, versier: 0 },
  { melodie: 1, tegen: 1, akkoord: 1, schud: 1, clave: 1, conga: 1, koor: 1, meeuw: 1, zee: 1, versier: 0 },
  // Adempauze: de melodie zwijgt en de tegenstem draagt hem in haar eentje.
  // De clave valt stil, zodat het ademen ook echt lucht is.
  { melodie: 0, tegen: 1, akkoord: 1, schud: 1, clave: 0, conga: 1, koor: 0, meeuw: 1, zee: 1, versier: 0 },
  { melodie: 1, tegen: 1, akkoord: 1, schud: 1, clave: 1, conga: 1, koor: 1, meeuw: 0, zee: 1, versier: 1 },
  { melodie: 1, tegen: 0, akkoord: 0, schud: 1, clave: 1, conga: 1, koor: 0, meeuw: 1, zee: 1, versier: 0 },
];

// Vijf bezettingen tegen een vorm van vier delen: daardoor valt niet elke ronde
// dezelfde bezetting op hetzelfde deel, en duurt het twintig delen voordat er
// iets letterlijk wordt herhaald. Bij vier zou dat al na één ronde zijn.
const BEZETTING_GEVECHT = [
  { melodie: 0, tegen: 0, akkoord: 1, schud: 0, trom: 1, roep: 0, versier: 0 },
  { melodie: 1, tegen: 0, akkoord: 1, schud: 1, trom: 1, roep: 0, versier: 0 },
  { melodie: 1, tegen: 1, akkoord: 1, schud: 1, trom: 1, roep: 1, versier: 0 },
  // Stilte voor de storm: geen slagwerk, alleen de bas en een lage tegenstem.
  // Dat het even wegvalt is wat de klap erna hard maakt.
  { melodie: 0, tegen: 1, akkoord: 1, schud: 0, trom: 0, roep: 0, versier: 0 },
  { melodie: 1, tegen: 0, akkoord: 1, schud: 1, trom: 1, roep: 1, versier: 1 },
];

const THEMAS = {
  zee: {
    // Iets trager dan voorheen (ruim onder de honderd): de caravan wiegt meer.
    eenheid: 0.156,
    vorm: ['A', 'B', 'A2', 'C'],
    bezetting: BEZETTING_ZEE,
    stem: 'pluk',
  },
  gevecht: {
    eenheid: 0.105,
    vorm: ['X', 'Y', 'X', 'X'],
    bezetting: BEZETTING_GEVECHT,
    stem: 'hamer',
  },
};

const MATEN_PER_DEEL = 8;
const EENHEDEN_PER_DEEL = MATEN_PER_DEEL * 16;

/** De tresillo: 3+3+2, in zestienden dus op 0, 6 en 12. */
const TRESILLO = [0, 6, 12];
/** De tegentel waarop het akkoord wordt aangeslagen — telkens náást de bas. */
const TEGENTEL = [2, 6, 10, 14];
/** Son clave 2-3, in zestienden: de vaste houten handtekening van de tropen. */
const SON_CLAVE = [0, 3, 6, 10, 12];

/** Per deel: op welke zestiende begint welke noot. Eén keer uitgerekend. */
for (const deel of Object.values(DELEN)) {
  deel.op = new Map();
  let pos = 0;
  for (const [toon, lengte] of deel.melodie) {
    if (toon !== null) deel.op.set(pos, [toon, lengte]);
    pos += lengte;
  }
  deel.lengte = pos;
}

// --- Instrumenten ---------------------------------------------------------

/**
 * Eén gedeelde ruisbuffer voor alles wat ruist. Ruis is ruis; hem elke keer
 * opnieuw uitrekenen kost geheugen zonder dat iemand het hoort.
 */
function ruisBuffer() {
  if (!state.ruisBuf) {
    const c = state.ctx;
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    state.ruisBuf = buf;
  }
  return state.ruisBuf;
}

/** Ruis met een eigen filter en omhullende. De werkpaard-bouwsteen. */
function ruisje(start, duur, opts) {
  const c = state.ctx;
  const src = c.createBufferSource();
  src.buffer = ruisBuffer();
  src.loop = true;
  // Elke keer ergens anders in de buffer beginnen, anders hoor je het patroon.
  const bron = Math.random() * 1.5;
  const f = c.createBiquadFilter();
  f.type = opts.type || 'lowpass';
  f.frequency.setValueAtTime(opts.van, start);
  if (opts.naar) {
    f.frequency.linearRampToValueAtTime(opts.top || opts.naar, start + duur * (opts.topOp || 0.35));
    f.frequency.linearRampToValueAtTime(opts.naar, start + duur);
  }
  if (opts.q) f.Q.value = opts.q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(opts.vol, start + duur * (opts.aan || 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, start + duur);
  src.connect(f);
  f.connect(g);
  g.connect(state.muziekGain);
  if (opts.galm && state.galm) g.connect(state.galm);
  src.start(start, bron);
  src.stop(start + duur + 0.02);
}

/**
 * Een geplukte noot. Een marimba is in de kern een sinus met een boventoon die
 * veel sneller uitdooft dan de grondtoon; dat verschil in uitdoving is wat het
 * naar hout laat klinken in plaats van naar een orgel.
 */
function pluk(toon, start, duur, vol, helder = 0.3, naarGalm = false) {
  const c = state.ctx;
  const f = mf(toon);
  // De noot krijgt iets meer tijd om uit te klinken; dat slijt de scherpte af.
  const uit = Math.min(duur * 1.6, 1.4);

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
  // De boventoon op 2,8× (niet 4×) houdt de klank rond en houtachtig in plaats
  // van naaldig; hoe lager de boventoon, hoe warmer de aanslag klinkt.
  const bov = c.createOscillator();
  bov.type = 'sine';
  bov.frequency.setValueAtTime(f * 2.8, start);
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, start);
  bg.gain.exponentialRampToValueAtTime(vol * helder * 0.85, start + 0.004);
  bg.gain.exponentialRampToValueAtTime(0.0001, start + uit * 0.3);
  bov.connect(bg);
  bg.connect(state.muziekGain);
  bov.start(start);
  bov.stop(start + uit * 0.32 + 0.02);
}

/**
 * De gevechtsstem: dezelfde noot, maar met een zaagtand door een filter dat
 * dichtklapt. Dat geeft de aanslag een randje, alsof er hard op wordt geslagen
 * in plaats van zacht geplukt.
 */
function hamer(toon, start, duur, vol, helder = 0.3, naarGalm = false) {
  const c = state.ctx;
  const f = mf(toon);
  const uit = Math.min(duur * 1.2, 0.7);
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f, start);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * 7, start);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.6), start + uit * 0.8);
  lp.Q.value = 3;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + uit);
  osc.connect(lp);
  lp.connect(g);
  g.connect(state.muziekGain);
  if (naarGalm && state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + uit + 0.02);
}

/** Schudritme: kort en hoog. Zacht, het is geen dansvloer. */
function schud(start, sterk) {
  ruisje(start, sterk ? 0.055 : 0.035, {
    type: 'highpass', van: 6200, vol: sterk ? 0.085 : 0.045, aan: 0.15,
  });
}

/** Trom voor het gevecht: een klap met een toon die er meteen onderuit zakt. */
function trom(start, zwaar) {
  const c = state.ctx;
  ruisje(start, zwaar ? 0.11 : 0.06, {
    type: 'lowpass', van: zwaar ? 420 : 1400, vol: zwaar ? 0.16 : 0.07, aan: 0.05,
  });
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(zwaar ? 132 : 196, start);
  osc.frequency.exponentialRampToValueAtTime(zwaar ? 46 : 92, start + 0.14);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(zwaar ? 0.3 : 0.15, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
  osc.connect(g);
  g.connect(state.muziekGain);
  osc.start(start);
  osc.stop(start + 0.22);
}

/**
 * Lage conga ('doem'): een ronde, toonloze klap die de tresillo-bas een
 * lichamelijkheid geeft. De frequentie zakt in één beweging, anders klinkt het
 * als een trommel die niet durft; en hij gaat een beetje door de galm, zodat de
 * warmte over het water draagt zonder hard te worden.
 */
function conga(start, zwaar = true) {
  const c = state.ctx;
  ruisje(start, zwaar ? 0.09 : 0.055, {
    type: 'lowpass', van: zwaar ? 460 : 1600, vol: zwaar ? 0.13 : 0.07, aan: 0.04,
  });
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(zwaar ? 118 : 178, start);
  osc.frequency.exponentialRampToValueAtTime(zwaar ? 52 : 96, start + 0.13);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(zwaar ? 0.22 : 0.12, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
  osc.connect(g);
  g.connect(state.muziekGain);
  if (state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + 0.28);
}

/**
 * De son clave: het vaste houten hamerpatroon dat onder de hele Caribische
 * muziek ligt. Het is een kort, droog tikje op nauwkeurig hoge frequentie — het
 * hoort juist níét door de galm, anders verliest het zijn ankerende rol. De
 * toonloze klap wordt door een piepkleine offset aangeslagen, zoals een echt
 * houtblok dat tussen twee maten doorklopt.
 */
function clave(start) {
  ruisje(start, 0.028, {
    type: 'highpass', van: 3800, vol: 0.055, aan: 0.05,
  });
}

/**
 * Een zingende stem. Een klinker is niets anders dan een paar vaste
 * resonanties boven op een toon: zet drie smalle banden op de juiste
 * frequenties en een zaagtand wordt een "oh". Schuif die banden van de ene
 * klinker naar de andere en het klinkt als een woord — alleen niet als een
 * woord dat je verstaat. Dat is precies de bedoeling: het scheepsvolk zingt
 * mee, maar je hoort niet wát.
 */
const KLINKERS = {
  o: [570, 840, 2410],
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  u: [300, 870, 2240],
};

function zangStem(toon, start, duur, van, naar, vol) {
  const c = state.ctx;
  // Geen twee kelen staan precies gelijk; die kleine verstemming maakt van een
  // stapel stemmen een koor in plaats van een orgelpijp.
  const f = mf(toon) * (1 + (Math.random() - 0.5) * 0.012);

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 0.93, start);
  osc.frequency.exponentialRampToValueAtTime(f, start + 0.1);
  // Vibrato: een zanger houdt een lange noot nooit stil.
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 4.4 + Math.random() * 1.4;
  const lfoDiep = c.createGain();
  lfoDiep.gain.value = f * 0.011;
  lfo.connect(lfoDiep);
  lfoDiep.connect(osc.frequency);
  lfo.start(start);
  lfo.stop(start + duur + 0.1);

  const bus = c.createGain();
  bus.gain.value = 1;
  for (let i = 0; i < 3; i++) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(van[i], start);
    bp.frequency.linearRampToValueAtTime(naar[i], start + duur * 0.7);
    bp.Q.value = 7 - i * 1.6;
    const fg = c.createGain();
    fg.gain.value = [1, 0.6, 0.28][i];
    osc.connect(bp);
    bp.connect(fg);
    fg.connect(bus);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.09);
  g.gain.setValueAtTime(vol, start + duur * 0.68);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duur);
  bus.connect(g);
  g.connect(state.muziekGain);
  if (state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + duur + 0.05);
}

/** Het scheepsvolk valt in. Twee kelen per partij, net niet gelijk. */
function koor(tonen, start, duur, van, naar, vol = 0.075) {
  for (const t of tonen) {
    zangStem(t, start, duur, van, naar, vol);
    zangStem(t, start + 0.02 + Math.random() * 0.04, duur * 0.94, van, naar, vol * 0.65);
  }
}

/** Een korte schreeuw voor in het gevecht — geen woord, alleen lucht en lef. */
function roep(tonen, start) {
  for (const t of tonen) {
    zangStem(t, start, 0.22 + Math.random() * 0.08, KLINKERS.a, KLINKERS.o, 0.075);
  }
}

/**
 * Branding. Een golf komt aanrollen, breekt, en trekt terug: het filter gaat
 * open op het moment dat hij breekt en zakt daarna weer dicht.
 */
function golfslag(start) {
  const duur = 2.4 + Math.random() * 1.6;
  ruisje(start, duur, {
    type: 'lowpass', van: 320, top: 1500, naar: 260, topOp: 0.38, vol: 0.075, aan: 0.38,
  });
}

/** Werkend hout: een lage toon die onregelmatig van hoogte schiet. */
function kraak(start) {
  const c = state.ctx;
  const duur = 0.45 + Math.random() * 0.5;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const basis = 52 + Math.random() * 44;
  osc.frequency.setValueAtTime(basis, start);
  // Het schokkerige is wat kraken hoorbaar maakt; een vloeiende glijder klinkt
  // als een dier, een reeks sprongetjes klinkt als een schip.
  const stappen = 5 + Math.floor(Math.random() * 6);
  for (let i = 1; i <= stappen; i++) {
    osc.frequency.setValueAtTime(basis * (0.82 + Math.random() * 0.55), start + (i / stappen) * duur);
  }
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 300 + Math.random() * 240;
  bp.Q.value = 2.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.05, start + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duur);
  osc.connect(bp);
  bp.connect(g);
  g.connect(state.muziekGain);
  if (state.galm) g.connect(state.galm);
  osc.start(start);
  osc.stop(start + duur + 0.03);
}

/**
 * De scheepsbel. Een klok klinkt naar metaal doordat zijn boventonen scheef
 * liggen: geen hele veelvouden, maar 2,76 en 5,40 keer de grondtoon. Precies
 * dat scheve is het verschil tussen een klok en een fluit.
 */
function scheepsbel(start) {
  const c = state.ctx;
  const grond = 560 + Math.random() * 90;
  for (const slag of [0, 0.42]) {
    [1, 2.76, 5.4, 8.9].forEach((verhouding, i) => {
      const osc = c.createOscillator();
      // Driehoek in plaats van sinus: een klok heeft een randje, geen fluittoon.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(grond * verhouding, start + slag);
      const g = c.createGain();
      const uit = 2.2 / (1 + i * 0.9);
      g.gain.setValueAtTime(0.0001, start + slag);
      g.gain.exponentialRampToValueAtTime(0.05 / (i + 1), start + slag + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, start + slag + uit);
      osc.connect(g);
      g.connect(state.muziekGain);
      if (state.galm) g.connect(state.galm);
      osc.start(start + slag);
      osc.stop(start + slag + uit + 0.02);
    });
  }
}

/**
 * Een meeuw. De roep is een nasaal "kie-auw": de toon schiet omhoog en zakt
 * trager terug, door een smalle band gehaald zodat het schril wordt in plaats
 * van muzikaal. Twee tot vier kreten achter elkaar, want één meeuw roept nooit
 * één keer. Hij gaat door de echo, zodat hij van ver lijkt te komen.
 */
function meeuw(start) {
  const c = state.ctx;
  const kreten = 2 + Math.floor(Math.random() * 3);
  const hoog = 780 + Math.random() * 260;
  let t = start;
  for (let i = 0; i < kreten; i++) {
    const duur = 0.17 + Math.random() * 0.1;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hoog * 0.62, t);
    osc.frequency.exponentialRampToValueAtTime(hoog * 1.28, t + duur * 0.16);
    osc.frequency.exponentialRampToValueAtTime(hoog * 0.72, t + duur);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 3.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.05, t + duur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    osc.connect(band);
    band.connect(g);
    g.connect(state.muziekGain);
    if (state.galm) g.connect(state.galm);
    osc.start(t);
    osc.stop(t + duur + 0.02);
    t += duur + 0.16 - i * 0.02;
  }
}

// --- De planner -----------------------------------------------------------

/** Plant alles wat op deze zestiende begint. */
function planEenheid(index, start) {
  const thema = state.thema;
  const eenheid = thema.eenheid;
  const deelNr = Math.floor(index / EENHEDEN_PER_DEEL);
  const inDeel = index % EENHEDEN_PER_DEEL;
  const deel = DELEN[thema.vorm[deelNr % thema.vorm.length]];
  const bez = thema.bezetting[deelNr % thema.bezetting.length];
  const maat = Math.floor(inDeel / 16);
  const tel = inDeel % 16;
  const akkoord = deel.akkoorden[maat];
  const stem = thema.stem === 'hamer' ? hamer : pluk;

  // --- Melodie en tegenstem ---
  const noot = deel.op.get(inDeel);
  if (noot) {
    const [toon, lengte] = noot;
    const duur = lengte * eenheid;
    if (bez.melodie) stem(toon, start, duur, 0.34, 0.34, true);
    // De tegenstem loopt een octaaf lager mee: hij kan nooit vals staan, en in
    // de adempauze draagt hij de melodie in zijn eentje.
    if (bez.tegen) stem(toon - 12, start, duur, bez.melodie ? 0.12 : 0.24, 0.15);
    // Versiering: halverwege een lange noot een tweede aanslag op een toon uit
    // hetzelfde akkoord. Uit het akkoord, dus hij kan niet verkeerd vallen.
    if (bez.versier && lengte >= 6) {
      const extra = akkoord.greep[1 + Math.floor(Math.random() * (akkoord.greep.length - 1))];
      stem(extra, start + (lengte / 2) * eenheid, (lengte / 2) * eenheid, 0.13, 0.4);
    }
  }

  // --- Bas op de tresillo ---
  if (tel === TRESILLO[0]) stem(akkoord.bas, start, eenheid * 5, 0.3, 0.06);
  if (tel === TRESILLO[1]) stem(akkoord.vijfde, start, eenheid * 4, 0.2, 0.06);
  if (tel === TRESILLO[2]) stem(akkoord.bas, start, eenheid * 4, 0.26, 0.06);

  // --- Akkoord op de tegentel: het tikje van een cuatro ---
  if (bez.akkoord && TEGENTEL.includes(tel)) {
    akkoord.greep.forEach((t, i) => {
      stem(t, start + i * 0.008, eenheid * 1.6, 0.05, 0.5);
    });
  }

  // --- Slagwerk ---
  if (bez.schud && tel % 2 === 0) schud(start, tel % 4 === 2);
  if (bez.trom) {
    if (TRESILLO.includes(tel)) trom(start, tel === 0 || tel === 12);
    if (tel === 8) trom(start, false);
  }

  // --- Son clave: het houten anker van de warmte ---
  if (bez.clave && SON_CLAVE.includes(tel)) clave(start);

  // --- Lage conga's vullen de tresillo-bas aan ---
  if (bez.conga) {
    if (TRESILLO.includes(tel)) conga(start, tel === 0 || tel === 12);
    if (tel === 8) conga(start, false);
  }

  // --- Koor: het volk valt in op het eind van een zin ---
  if (bez.koor && tel === 10 && (maat === 3 || maat === 7)) {
    koor([akkoord.greep[0] - 12, akkoord.greep[2] - 12, akkoord.greep[0]],
      start, eenheid * 6, KLINKERS.o, KLINKERS.a);
  }
  // --- Roep: kort en hard, tegen de tresillo in ---
  if (bez.roep && tel === 12 && maat % 2 === 1) {
    roep([akkoord.greep[0] - 12, akkoord.greep[2] - 12], start);
  }

  // --- De zee eromheen ---
  if (bez.zee) {
    // Branding rolt door: elke twee maten een nieuwe golf, die over de vorige
    // heen loopt. Zo is er altijd water te horen zonder dat het een lus wordt.
    if (tel === 0 && maat % 2 === 0) golfslag(start + Math.random() * MAAT_ZEE * 0.4);
    if (tel === 0 && maat === 5 && Math.random() < 0.4) kraak(start + Math.random() * MAAT_ZEE);
    if (tel === 0 && maat === 1 && Math.random() < 0.35) meeuw(start + Math.random() * MAAT_ZEE * 0.5);
    // De scheepsbel luidt zelden. Juist daarom is het leuk als hij komt.
    if (tel === 0 && maat === 0 && deelNr > 0 && Math.random() < 0.12) scheepsbel(start);
  }
}

/** De maatduur van het zeethema, voor het uitsmeren van de zeegeluiden. */
const MAAT_ZEE = THEMAS.zee.eenheid * 16;

// De planner kijkt een stukje vooruit en zet noten op de klok van de
// audiokaart, niet op die van de browser. setTimeout loopt onder belasting
// tientallen milliseconden uit — hoorbaar als slepende maten — terwijl de
// audioklok onverstoorbaar doorloopt, ook als het tekenen even hapert.
const VOORUIT = 0.25; // seconden die we vooruit plannen
const TIK = 45; // milliseconden tussen twee controles

let volgendeEenheid = 0;
let positie = 0;

function planner() {
  if (!state.muziekAan || !state.thema) return;
  const c = state.ctx;
  if (!c) return;
  if (volgendeEenheid < c.currentTime) volgendeEenheid = c.currentTime + 0.06;
  while (volgendeEenheid < c.currentTime + VOORUIT) {
    if (state.aan) planEenheid(positie, volgendeEenheid);
    volgendeEenheid += state.thema.eenheid;
    positie++;
  }
}

/**
 * De scène wil muziek, en welke. `zee` op de kaart en in de haven, `gevecht`
 * in de zeeslag en het duel. Speelt het gevraagde thema al, dan gebeurt er
 * niets — zo loopt de deun gewoon door als je van de zeeslag in een enterduel
 * rolt. Blijft stil als de speler de muziek heeft uitgezet.
 */
export function startMuziek(naam = 'zee') {
  const thema = THEMAS[naam] || THEMAS.zee;
  state.themaNaam = THEMAS[naam] ? naam : 'zee';
  if (!state.muziekGewenst) return;
  const c = ctx();
  if (!c) return;
  if (state.muziekTimer && state.thema === thema) return;
  if (state.muziekTimer) {
    clearInterval(state.muziekTimer);
    state.muziekTimer = null;
  }
  state.thema = thema;
  state.muziekAan = true;
  // Een nieuw thema begint bij zijn eigen begin, anders val je middenin een
  // deel binnen met een bezetting die nergens op slaat.
  positie = 0;
  volgendeEenheid = c.currentTime + 0.1;
  state.muziekTimer = setInterval(planner, TIK);
  planner();
}

/** Alles stil. Verandert de wens van de speler niet. */
export function stopMuziek() {
  state.muziekAan = false;
  if (state.muziekTimer) {
    clearInterval(state.muziekTimer);
    state.muziekTimer = null;
  }
  volgendeEenheid = 0;
}

/** De speler zet de muziek aan of uit. Dit ís de wens. */
export function zetMuziek(aan) {
  state.muziekGewenst = aan;
  if (aan) startMuziek(state.themaNaam || 'zee');
  else stopMuziek();
}

/** Welk thema er nu aan de beurt is. Voor scènes die het straks moeten teruggeven. */
export function huidigThema() {
  return state.themaNaam || 'zee';
}

/** Wat de speler wil — niet of er op dit moment geluid uit de luidspreker komt. */
export function muziekAan() {
  return state.muziekGewenst;
}

/** Waar de deun staat. Alleen voor het testen. */
export function muziekStand() {
  const thema = state.thema || THEMAS.zee;
  const deelNr = Math.floor(positie / EENHEDEN_PER_DEEL);
  return {
    thema: state.themaNaam || 'zee',
    deel: thema.vorm[deelNr % thema.vorm.length],
    bezetting: deelNr % thema.bezetting.length,
    maat: Math.floor((positie % EENHEDEN_PER_DEEL) / 16),
  };
}
