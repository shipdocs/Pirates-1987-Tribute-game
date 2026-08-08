// Spelkern: toestand, scènebeheer, invoer en opslag.
import { clamp, makeRng, yearOf, pick } from './util.js';
import { WAREN, SCHIP_INDEX, RANGEN, NATIE_IDS, MOEILIJKHEDEN, FAMILIE_ROLLEN } from './data.js';
import { Wereld } from './world.js';
import * as audio from './audio.js';
// ui.js leunt alleen op util en audio, dus dit levert geen kringetje op.
import * as UI from './ui.js';

export const OPSLAG_SLEUTEL = 'zeeroverij.opslag.v1';

export const Game = {
  canvas: null,
  ctx: null,
  breedte: 0,
  hoogte: 0,
  dpr: 1,
  scene: null,
  wereld: null,
  speler: null,
  tijd: 0,
  gepauzeerd: false,
  toetsen: new Set(),
  muis: { x: 0, y: 0, ingedrukt: false, klik: false },
  meldingen: [],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.koppelInvoer();
    this.pasMaatAan();
    window.addEventListener('resize', () => this.pasMaatAan());
  },

  pasMaatAan() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.breedte = w;
    this.hoogte = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.scene && this.scene.maatVeranderd) this.scene.maatVeranderd();
  },

  koppelInvoer() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.toetsen.add(e.code);
      if (this.scene && this.scene.toets) this.scene.toets(e.code, e);
      // Tab wisselt de munitie in het gevecht; laten we hem door, dan verspringt
      // de browserfocus ondertussen van het canvas af. Zodra er een scherm open
      // staat blijft Tab wél gewoon door de knoppen lopen.
      const slik = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
      if (!UI.ietsOpen()) slik.push('Tab');
      if (slik.includes(e.code)) e.preventDefault();
      audio.ontgrendel();
    });
    window.addEventListener('keyup', (e) => this.toetsen.delete(e.code));
    window.addEventListener('blur', () => this.toetsen.clear());

    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.muis.x = e.clientX - r.left;
      this.muis.y = e.clientY - r.top;
    };
    this.canvas.addEventListener('mousemove', pos);
    this.canvas.addEventListener('mousedown', (e) => {
      pos(e);
      this.muis.ingedrukt = true;
      this.muis.klik = true;
      audio.ontgrendel();
    });
    window.addEventListener('mouseup', () => (this.muis.ingedrukt = false));
    this.canvas.addEventListener('wheel', (e) => {
      if (this.scene && this.scene.scroll) this.scene.scroll(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  },

  toets(code) {
    return this.toetsen.has(code);
  },

  zetScene(scene) {
    if (this.scene && this.scene.verlaat) this.scene.verlaat();
    this.scene = scene;
    if (scene && scene.betreed) scene.betreed();
  },

  melding(tekst, kleur = 'goud') {
    // Dezelfde melding vlak achter elkaar wordt ververst in plaats van gestapeld.
    const laatste = this.meldingen[this.meldingen.length - 1];
    if (laatste && laatste.tekst === tekst) {
      laatste.t = 0;
      return;
    }
    this.meldingen.push({ tekst, kleur, t: 0, duur: 4.2 });
    if (this.meldingen.length > 5) this.meldingen.shift();
  },

  start() {
    let vorig = performance.now();
    const stap = (nu) => {
      const dt = clamp((nu - vorig) / 1000, 0, 0.05);
      vorig = nu;
      this.tijd += dt;
      for (let i = this.meldingen.length - 1; i >= 0; i--) {
        this.meldingen[i].t += dt;
        if (this.meldingen[i].t > this.meldingen[i].duur) this.meldingen.splice(i, 1);
      }
      if (this.scene) {
        if (!this.gepauzeerd && this.scene.werkBij) this.scene.werkBij(dt);
        if (this.scene.teken) {
          const c = this.ctx;
          c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          this.scene.teken(c);
        }
      }
      this.tekenMeldingen(this.ctx);
      this.muis.klik = false;
      requestAnimationFrame(stap);
    };
    requestAnimationFrame(stap);
  },

  tekenMeldingen(c) {
    if (!this.meldingen.length) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.save();
    c.font = '600 14px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let y = this.hoogte - 118;
    for (let i = this.meldingen.length - 1; i >= 0; i--) {
      const m = this.meldingen[i];
      const a = clamp(Math.min(m.t * 4, (m.duur - m.t) * 2), 0, 1);
      const w = c.measureText(m.tekst).width + 30;
      c.globalAlpha = a * 0.85;
      c.fillStyle = 'rgba(10,28,44,0.9)';
      roundRect(c, this.breedte / 2 - w / 2, y - 14, w, 28, 6);
      c.fill();
      c.strokeStyle = m.kleur === 'rood' ? 'rgba(206,86,68,0.9)' : 'rgba(217,164,65,0.75)';
      c.lineWidth = 1.4;
      c.stroke();
      c.globalAlpha = a;
      c.fillStyle = m.kleur === 'rood' ? '#f0b3a5' : '#f2e4c2';
      c.fillText(m.tekst, this.breedte / 2, y);
      y -= 34;
    }
    c.restore();
  },
};

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// --- Spelerstoestand ------------------------------------------------------

export function nieuwSchip(typeId, opts = {}) {
  const t = SCHIP_INDEX[typeId];
  // Versteviging telt de romp op en telt zo vanzelf mee in herstel en gevecht.
  const romp = opts.maxRomp != null ? opts.maxRomp : t.romp;
  return {
    type: typeId,
    maxRomp: romp,
    romp: opts.romp != null ? opts.romp : romp,
    zeilen: opts.zeilen != null ? opts.zeilen : 1,
    kanonnen: opts.kanonnen != null ? opts.kanonnen : Math.round(t.kanonnen * 0.6),
    lading: opts.lading || new Array(WAREN.length).fill(0),
    // Scheepsuitrusting: niveau 0..max per verbetering.
    upgrades: opts.upgrades || { zeilen: 0, romp: 0, roer: 0 },
  };
}

export function maakSpeler(opties) {
  const relatie = {};
  const rang = {};
  const land = {};
  for (const n of NATIE_IDS) {
    relatie[n] = n === opties.natie ? 45 : 0;
    rang[n] = n === opties.natie ? 1 : 0;
    land[n] = 0;
  }
  // De Spanjaarden zijn standaard wat vijandiger tegen kapers.
  if (opties.natie !== 'spanje') relatie.spanje = -25;

  const vlaggenschip = nieuwSchip('sloep', { lading: nieuweLading({ voedsel: 30 }) });
  return {
    naam: opties.naam,
    natie: opties.natie,
    talent: opties.talent,
    moeilijkheid: opties.moeilijkheid,
    dag: 0,
    startLeeftijd: 18,
    leeftijd: 18,
    goud: 600,
    gespaard: 0,
    bemanning: 40,
    moraal: 70,
    relatie,
    rang,
    land,
    roem: 0,
    schepen: [vlaggenschip],
    x: 0,
    y: 0,
    koers: Math.PI,
    snelheid: 0,
    schatkaarten: 0,
    veroverdeSteden: 0,
    verslagenSchepen: 0,
    gehuwd: null,
    laatsteVerdeling: 0,
    gestopt: false,
    // Vermist familielid: rol wordt bij het begin bepaald.
    familie: { rol: pick(Math.random, FAMILIE_ROLLEN), gevonden: false, gevondenDag: null },
    // Actieve gouverneursopdracht (zie town.js). null als er geen loopt.
    opdracht: null,
  };
}

export function nieuweLading(obj = {}) {
  const arr = new Array(WAREN.length).fill(0);
  for (const [k, v] of Object.entries(obj)) {
    const i = WAREN.findIndex((w) => w.id === k);
    if (i >= 0) arr[i] = v;
  }
  return arr;
}

export const vlaggenschip = (s) => s.schepen[0];

export function ruimTotaal(schip) {
  return schip.lading.reduce((a, b) => a + b, 0);
}

export function ruimVrij(schip) {
  return SCHIP_INDEX[schip.type].ruim - ruimTotaal(schip) - schip.kanonnen * 2;
}

export function vlootBemanningMax(speler) {
  return speler.schepen.reduce((a, s) => a + SCHIP_INDEX[s.type].bemanning, 0);
}

export function talentBonus(speler, id) {
  return speler.talent === id ? 1 : 0;
}

export function rangVan(speler, natie) {
  return RANGEN[clamp(speler.rang[natie], 0, RANGEN.length - 1)];
}

/** Score zoals bij het aftreden: goud, land, rang en roem samen. */
export function berekenScore(speler) {
  const moeilijk = MOEILIJKHEDEN.find((m) => m.id === speler.moeilijkheid) || MOEILIJKHEDEN[1];
  let score = speler.gespaard * 0.01;
  for (const n of NATIE_IDS) {
    score += speler.rang[n] * 220;
    score += speler.land[n] * 12;
  }
  score += speler.roem * 3;
  score += speler.veroverdeSteden * 400;
  score += speler.verslagenSchepen * 25;
  if (speler.gehuwd) score += 600;
  return Math.round(score * moeilijk.mult);
}

// --- Opslag ---------------------------------------------------------------

export function bewaar() {
  if (!Game.speler || !Game.wereld) return false;
  const w = Game.wereld;
  const data = {
    versie: 2,
    seed: w.seed,
    speler: Game.speler,
    // De wereldpolitiek staat op de wereld, niet op de speler, en volgt dus
    // niet vanzelf uit het zaadje: wie oorlog voert met wie is een gevolg van
    // wat er tijdens deze reis is gebeurd.
    oorlogen: w.oorlogen || {},
    diploTimer: w.diploTimer || 0,
    steden: w.steden.map((s) => ({
      natie: s.natie,
      welvaart: s.welvaart,
      garnizoen: s.garnizoen,
      bevolking: s.bevolking,
      prijzen: s.prijzen,
      voorraad: s.voorraad,
    })),
  };
  try {
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Opslaan mislukt', e);
    return false;
  }
}

export function heeftOpslag() {
  try {
    return !!localStorage.getItem(OPSLAG_SLEUTEL);
  } catch (e) {
    return false;
  }
}

export function laad() {
  let data;
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!ruw) return null;
    data = JSON.parse(ruw);
  } catch (e) {
    return null;
  }
  if (!data || !data.speler) return null;
  // Een kapitein die het commando heeft neergelegd, vaart niet meer uit. Bij
  // het aftreden wordt de opslag gewist, maar een save die daarvóór is gemaakt
  // kan hem nog terugbrengen; die weigeren we hier alsnog.
  if (data.speler.gestopt) return null;
  const wereld = new Wereld(data.seed);
  data.steden.forEach((s, i) => {
    if (!wereld.steden[i]) return;
    Object.assign(wereld.steden[i], s);
  });
  // Saves van vóór versie 2 kenden de wereldpolitiek nog niet; die begint dan
  // gewoon bij vrede, precies zoals een nieuw spel.
  wereld.oorlogen = data.oorlogen || {};
  wereld.diploTimer = data.diploTimer || 0;
  // Oude saves saneren: ontbrekende velden krijgen hun standaardwaarde.
  const sp = data.speler;
  if (!sp.familie) sp.familie = { rol: pick(Math.random, FAMILIE_ROLLEN), gevonden: false, gevondenDag: null };
  if (sp.opdracht === undefined) sp.opdracht = null;
  for (const schip of sp.schepen || []) {
    if (!schip.upgrades) schip.upgrades = { zeilen: 0, romp: 0, roer: 0 };
  }
  return { wereld, speler: sp };
}

export function wisOpslag() {
  try {
    localStorage.removeItem(OPSLAG_SLEUTEL);
  } catch (e) {
    /* niets te doen */
  }
}

// --- Erelijst -------------------------------------------------------------

export const ERELIJST_SLEUTEL = 'zeeroverij.erelijst.v1';

/** De tien beste loopbanen, van hoog naar laag. */
export function leesErelijst() {
  try {
    const ruw = localStorage.getItem(ERELIJST_SLEUTEL);
    const lijst = ruw ? JSON.parse(ruw) : [];
    return Array.isArray(lijst) ? lijst : [];
  } catch (e) {
    return [];
  }
}

/**
 * Schrijft een afgesloten loopbaan bij. Alleen de uitkomst wordt bewaard, niet
 * de hele spelstaat: de erelijst overleeft het wissen van een opgeslagen spel.
 */
export function bewaarInErelijst(speler, score, stad) {
  const regel = {
    naam: speler.naam,
    natie: speler.natie,
    score,
    roem: Math.round(speler.roem),
    goud: speler.gespaard,
    jaren: Math.max(1, Math.floor(speler.leeftijd - speler.startLeeftijd)),
    moeilijkheid: speler.moeilijkheid,
    stad: stad ? stad.naam : '',
    dag: speler.dag,
  };
  const lijst = leesErelijst();
  lijst.push(regel);
  lijst.sort((a, b) => b.score - a.score);
  lijst.length = Math.min(lijst.length, 10);
  try {
    localStorage.setItem(ERELIJST_SLEUTEL, JSON.stringify(lijst));
  } catch (e) {
    console.warn('Erelijst bewaren mislukt', e);
  }
  // De plaats in de lijst, of -1 als hij er net buiten viel.
  return lijst.indexOf(regel);
}

export { yearOf, makeRng };
