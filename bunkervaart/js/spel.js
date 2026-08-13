// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Spelkern: toestand, scènebeheer, invoer en opslag. Overgenomen uit Zeeroverij
// — het scèneprotocol en het miniatuureffect zijn spelonafhankelijk — met een
// eigen spelerstructuur en een eigen opslagsleutel.

import { clamp, smooth } from './util.js';
import {
  BOTEN, BOOT_INDEX, nieuweTanks, MOEILIJKHEDEN, VAARREGIMES, diepgangVan,
} from './data.js';
import { Wereld } from './wereld.js';
import * as audio from './audio.js';
import * as UI from './ui.js';

export const OPSLAG_SLEUTEL = 'bunkervaart.opslag.v1';
export const MINIATUUR_SLEUTEL = 'bunkervaart.miniatuur.v1';

// Miniatuureffect (tilt-shift): de wereld krijgt een scherpe cirkel rond de
// boot, daarbuiten vervaagt ze. Op een havengebied werkt dat nog beter dan op
// de Caraïben — de Maasvlakte op tilt-shift leest als een modelbaan.
const MINI_BLUR = 3.2;
const MINI_GROOTTE = 0.32;
const MINI_ZACHT = 0.26;

export function leesMiniatuur() {
  try {
    return localStorage.getItem(MINIATUUR_SLEUTEL) !== '0';
  } catch (fout) {
    return true;
  }
}

export const Spel = {
  canvas: null,
  ctx: null,
  breedte: 0,
  hoogte: 0,
  dpr: 1,
  scene: null,
  wereld: null,
  schipper: null,
  miniatuur: leesMiniatuur(),
  miniatuurLagen: null,
  filterSteun: null,
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
      // Het miniatuureffect zit op F, maar een scène mag die toets opeisen —
      // in de overslag betekent F 'versneld', en dan hoort de spelkern hem niet
      // ook nog af te vangen. Zonder dit deed één druk op F twee dingen.
      const scèneNeemtF = this.scene && this.scene.neemtF;
      if (e.code === 'KeyF' && !UI.ietsOpen() && !scèneNeemtF) this.zetMiniatuur(!this.miniatuur);
      if (this.scene && this.scene.toets) this.scene.toets(e.code, e);
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

  melding(tekst, kleur = 'blauw') {
    const laatste = this.meldingen[this.meldingen.length - 1];
    if (laatste && laatste.tekst === tekst) {
      laatste.t = 0;
      return;
    }
    this.meldingen.push({ tekst, kleur, t: 0, duur: 4.4 });
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
          if (this.miniatuur && this.scene.tekenHud && this.scene.miniatuurFocus) {
            const lagen = this.zorgMiniatuurLagen();
            lagen.wereldC.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            lagen.wereldC.clearRect(0, 0, this.breedte, this.hoogte);
            this.scene.teken(lagen.wereldC);
            this.tekenMiniatuur(c, lagen, this.scene);
          } else {
            c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.scene.teken(c);
            if (this.scene.tekenHud) this.scene.tekenHud(c);
          }
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
    c.font = '600 13px "Inter", "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let y = this.hoogte - 128;
    for (let i = this.meldingen.length - 1; i >= 0; i--) {
      const m = this.meldingen[i];
      const a = clamp(Math.min(m.t * 4, (m.duur - m.t) * 2), 0, 1);
      const w = c.measureText(m.tekst).width + 32;
      c.globalAlpha = a * 0.95;
      const x = this.breedte / 2 - w / 2;
      c.fillStyle = 'rgba(16,22,28,0.92)';
      roundRect(c, x, y - 15, w, 30, 5);
      c.fill();
      c.strokeStyle = m.kleur === 'rood' ? 'rgba(206,84,64,0.95)'
        : m.kleur === 'groen' ? 'rgba(96,176,124,0.9)' : 'rgba(120,160,190,0.5)';
      c.lineWidth = 1.2;
      c.stroke();
      c.globalAlpha = a;
      c.fillStyle = m.kleur === 'rood' ? '#f0a08e' : m.kleur === 'groen' ? '#a9e0bf' : '#d6e6f2';
      c.fillText(m.tekst, this.breedte / 2, y);
      y -= 36;
    }
    c.restore();
  },

  zorgMiniatuurLagen() {
    const w = Math.round(this.breedte * this.dpr);
    const h = Math.round(this.hoogte * this.dpr);
    const oud = this.miniatuurLagen;
    if (oud && oud.wereld.width === w && oud.wereld.height === h) return oud;
    const maak = () => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      return cv;
    };
    const wereld = maak();
    const focus = maak();
    this.miniatuurLagen = {
      wereld, wereldC: wereld.getContext('2d'),
      focus, focusC: focus.getContext('2d'),
    };
    return this.miniatuurLagen;
  },

  /**
   * Tekent de miniatuurweergave: de vervaagde wereld met een scherpe cirkel om
   * de boot, en daarboven de scherpe HUD.
   *
   * Let op de overmaat bij het vervagen: een canvas-blur reikt ongeveer drie
   * keer zijn straal, dus een laag die het scherm precies vult trekt de
   * doorzichtige rand erbuiten naar binnen en zet er een donkere lijst omheen.
   */
  tekenMiniatuur(c, lagen, scene) {
    const W = lagen.wereld.width;
    const H = lagen.wereld.height;
    const straal = MINI_BLUR * this.dpr;
    if (this.filterSteun === null) this.filterSteun = typeof c.filter === 'string';

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(lagen.wereld, 0, 0);

    if (this.filterSteun) {
      const over = straal * 3;
      c.filter = `blur(${straal.toFixed(1)}px)`;
      c.drawImage(lagen.wereld, -over, -over, W + over * 2, H + over * 2);
      c.filter = 'none';
    } else {
      const stap = Math.max(1, Math.round(straal));
      const verschuiving = [0, stap, -stap, stap * 2, -stap * 2];
      for (let i = 0; i < verschuiving.length; i++) {
        c.globalAlpha = 1 / (i + 1);
        c.drawImage(lagen.wereld, 0, verschuiving[i], W, H);
      }
      c.globalAlpha = 1;
    }

    const kort = Math.min(W, H);
    const kern = kort * MINI_GROOTTE;
    const uitloop = kort * MINI_ZACHT;
    const gevraagd = scene.miniatuurFocus() || {};
    const punt = (waarde, maat) => (Number.isFinite(waarde) ? waarde * this.dpr : maat / 2);
    const x = clamp(punt(gevraagd.x, W), 0, W);
    const y = clamp(punt(gevraagd.y, H), 0, H);

    const f = lagen.focusC;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.clearRect(0, 0, W, H);
    f.drawImage(lagen.wereld, 0, 0);
    const g = f.createRadialGradient(x, y, kern, x, y, kern + uitloop);
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const daar = smooth(clamp(1 - u, 0, 1));
      g.addColorStop(u, `rgba(0,0,0,${daar.toFixed(3)})`);
    }
    f.globalCompositeOperation = 'destination-in';
    f.fillStyle = g;
    f.fillRect(0, 0, W, H);
    c.drawImage(lagen.focus, 0, 0);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (scene.tekenHud) scene.tekenHud(c);
  },

  zetMiniatuur(aan) {
    this.miniatuur = !!aan;
    try {
      localStorage.setItem(MINIATUUR_SLEUTEL, this.miniatuur ? '1' : '0');
    } catch (fout) {
      /* Geen opslag: de keuze geldt dan alleen deze zitting. */
    }
    this.melding(this.miniatuur ? 'Miniatuureffect aan.' : 'Miniatuureffect uit.');
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

// --- De schipper -----------------------------------------------------------

export function nieuweBoot(typeId, opts = {}) {
  return {
    type: typeId,
    naam: opts.naam || 'Nooitgedacht',
    tanks: opts.tanks || nieuweTanks(),
    // Temperatuur per product in de tank; zware olie wordt warm geladen.
    temperatuur: opts.temperatuur || {},
    verbeteringen: opts.verbeteringen || { pomp: 0, meting: 0, verwarming: 0, fenders: 0, roer: 0 },
    schade: opts.schade || 0,
  };
}

export function maakSchipper(opties) {
  const boot = nieuweBoot('bunkerboot', { naam: opties.bootnaam });
  return {
    naam: opties.naam,
    moeilijkheid: opties.moeilijkheid,
    geld: 85000,
    // Openbaar: bepaalt welke orders je krijgt aangeboden.
    reputatie: 50,
    // Verborgen: bepaalt hoe scherp er naar je gekeken wordt.
    argwaan: 0,
    boot,
    regime: 'a1',
    // Resterende vaaruren vandaag, in minuten.
    vaartijd: VAARREGIMES[0].uren * 60,
    laatsteDag: 0,
    order: null,
    reisplan: null,
    // De partij die je hebt achtergehouden en nog moet verkopen, in m³.
    marge: nieuweTanks(),
    // Statistiek voor de eindafrekening.
    stems: 0,
    schoon: 0,
    aantekeningen: 0,
    protesten: 0,
    incidenten: 0,
    verdiend: 0,
    margeOpbrengst: 0,
    x: 0,
    y: 0,
    koers: 0,
    snelheid: 0,
    roer: 0,
    gas: 0,
  };
}

/** Totaal aan product in de tanks, in m³. */
export const tankTotaal = (boot) => boot.tanks.reduce((a, b) => a + b, 0);

/** Vrije tankruimte in m³. */
export function tankVrij(boot) {
  return BOOT_INDEX[boot.type].tank - tankTotaal(boot);
}

/** Huidige diepgang van de boot, in meters. */
export function diepgang(boot) {
  return diepgangVan(boot.type, tankTotaal(boot));
}

export function moeilijkVan(schipper) {
  return MOEILIJKHEDEN.find((m) => m.id === schipper.moeilijkheid) || MOEILIJKHEDEN[1];
}

/**
 * De eindafrekening: één getal dat de hele loopbaan samenvat. Anders dan in
 * Zeeroverij telt schoon werken hier expliciet mee — wie alles bij elkaar heeft
 * geknepen, houdt geld over maar geen naam.
 */
export function berekenScore(schipper) {
  const m = moeilijkVan(schipper);
  let score = schipper.geld * 0.01;
  score += schipper.verdiend * 0.006;
  score += schipper.margeOpbrengst * 0.010;
  score += schipper.reputatie * 26;
  score += schipper.schoon * 90;
  score -= schipper.protesten * 320;
  score -= schipper.incidenten * 900;
  // Wie nooit betrapt is én nooit geknepen heeft, krijgt de vlekkeloze bonus.
  if (schipper.stems > 12 && schipper.protesten === 0 && schipper.incidenten === 0) score += 2200;
  return Math.round(score * m.mult);
}

// --- Opslag ----------------------------------------------------------------

export function bewaar() {
  if (!Spel.schipper || !Spel.wereld) return false;
  const w = Spel.wereld;
  const data = {
    versie: 1,
    seed: w.seed,
    tijd: w.tijd,
    schipper: Spel.schipper,
    markt: w.markt,
    orders: w.orders,
    sluisDruk: w.sluisDruk,
    mist: w.mist,
    wind: w.wind,
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
  if (!data || !data.schipper) return null;
  const wereld = new Wereld(data.seed);
  wereld.tijd = data.tijd || wereld.tijd;
  if (Array.isArray(data.markt) && data.markt.length === wereld.markt.length) wereld.markt = data.markt;
  if (Array.isArray(data.orders)) wereld.orders = data.orders;
  if (data.sluisDruk) Object.assign(wereld.sluisDruk, data.sluisDruk);
  if (Array.isArray(data.mist) && data.mist.length) wereld.mist = data.mist;
  if (data.wind) wereld.wind = data.wind;

  // Oude saves saneren: ontbrekende velden krijgen hun standaardwaarde, precies
  // zoals `laad()` in Zeeroverij dat doet.
  const s = data.schipper;
  if (!s.boot) s.boot = nieuweBoot('bunkerboot');
  if (!Array.isArray(s.boot.tanks)) s.boot.tanks = nieuweTanks();
  if (!s.boot.verbeteringen) s.boot.verbeteringen = { pomp: 0, meting: 0, verwarming: 0, fenders: 0, roer: 0 };
  if (!s.boot.temperatuur) s.boot.temperatuur = {};
  if (!Array.isArray(s.marge)) s.marge = nieuweTanks();
  if (s.argwaan == null) s.argwaan = 0;
  if (s.regime == null) s.regime = 'a1';
  if (s.roer == null) s.roer = 0;
  if (s.gas == null) s.gas = 0;
  // Het roer ligt bij het hervatten altijd midscheeps: wie tijdens een draai
  // bewaart, zou anders terugkomen met de helmstok hard over.
  s.roer = 0;

  // De boot kan door een gewijzigde kaart net buiten het vaarwater liggen.
  if (!wereld.vaarwater.isWater(s.x, s.y)) {
    const [vx, vy] = wereld.vaarwater.dichtstbijWater(s.x, s.y);
    s.x = vx;
    s.y = vy;
  }
  return { wereld, schipper: s };
}

export function wisOpslag() {
  try {
    localStorage.removeItem(OPSLAG_SLEUTEL);
  } catch (e) {
    /* niets te doen */
  }
}

export { BOTEN, BOOT_INDEX };
