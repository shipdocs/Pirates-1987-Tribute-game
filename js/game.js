// Spelkern: toestand, scènebeheer, invoer en opslag.
import { clamp, makeRng, yearOf, pick } from './util.js';
import {
  WAREN, SCHIP_INDEX, RANGEN, NATIE_IDS, MOEILIJKHEDEN, FAMILIE_ROLLEN, LEGENDES, itemBonus,
} from './data.js';
import { Wereld } from './world.js';
import * as audio from './audio.js';
// ui.js leunt alleen op util en audio, dus dit levert geen kringetje op.
import * as UI from './ui.js';

export const OPSLAG_SLEUTEL = 'zeeroverij.opslag.v1';
export const MINIATUUR_SLEUTEL = 'zeeroverij.miniatuur.v1';

// Miniatuureffect (tilt-shift). De blur staat in beeldpixels; kern en uitloop
// zijn stralen, als fractie van de kórtste schermzijde — zo houdt de scherpe
// plek dezelfde maat op een breed en op een smal scherm. `KERN` is de cirkel
// van volle scherpte rond het schip, `UITLOOP` de ring daaromheen waarin het
// naar vervaagd overgaat. Rond, niet als balk: scherpstellen doe je op een
// plek, en dan hoort ook links en rechts van je schip af te vallen.
const MINI_BLUR = 3.2;
const MINI_KERN = 0.24;
const MINI_UITLOOP = 0.22;

/**
 * Leest de voorkeur voor het miniatuureffect uit de browser. Los van de save:
 * het is een presentatiekeuze, geen spelvoortgang. Standaard aan.
 */
export function leesMiniatuur() {
  try {
    return localStorage.getItem(MINIATUUR_SLEUTEL) !== '0';
  } catch (fout) {
    // Privémodus of oudere browser: dan maar de standaard.
    return true;
  }
}

export const Game = {
  canvas: null,
  ctx: null,
  breedte: 0,
  hoogte: 0,
  dpr: 1,
  scene: null,
  wereld: null,
  speler: null,
  // Miniatuureffect (tilt-shift): de wereld krijgt een smalle scherpe band
  // rond het schip, daarboven en -onder vervaagt ze — maar de HUD blijft
  // altijd scherp. Presentatievoorkeur, geen saveveld; zie `leesMiniatuur`.
  miniatuur: leesMiniatuur(),
  // Offscreen-lagen voor dat effect, hergebruikt per frame; zie `zorgMiniatuurLagen`.
  miniatuurLagen: null,
  // Canvasfilters ontbreken op oudere Safari's. Eén keer vaststellen, want een
  // mislukte `filter`-toewijzing is stil: hij valt gewoon terug op 'none'.
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
    // De miniatuurlagen volgen de canvasgrootte vanzelf: `zorgMiniatuurLagen()`
    // vergelijkt op apparaatpixels en maakt ze opnieuw zodra die veranderen.
    if (this.scene && this.scene.maatVeranderd) this.scene.maatVeranderd();
  },

  koppelInvoer() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.toetsen.add(e.code);
      // Het miniatuureffect is overal om te zetten, ook midden in een zeeslag:
      // daar staat Esc voor vluchten, dus er is geen scheepsraad om het in te
      // doen — en juist daar wil je er misschien vanaf.
      if (e.code === 'KeyF' && !UI.ietsOpen()) this.zetMiniatuur(!this.miniatuur);
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
          // Miniatuureffect: teken de wereld op een offscreen laag, vervaag die
          // en zet er een scherpe cirkel rond het schip in terug. De HUD komt
          // daarna scherp bovenop. Een scène doet mee door een brandpunt aan te
          // wijzen (`miniatuurFocus`) én haar HUD apart te tekenen; zonder dat
          // eerste is het effect niet gewenst — in een gevecht kijk je naar het
          // hele strijdtoneel, niet naar één maquette-plek — en zonder dat
          // tweede zou het opschrift mee vervagen.
          if (this.miniatuur && this.scene.tekenHud && this.scene.miniatuurFocus) {
            const lagen = this.zorgMiniatuurLagen();
            lagen.wereldC.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            lagen.wereldC.clearRect(0, 0, this.breedte, this.hoogte);
            this.scene.teken(lagen.wereldC);
            this.tekenMiniatuur(c, lagen, this.scene);
          } else {
            c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.scene.teken(c);
            // Elke scène kan een aparte HUD-laag hebben (wereld en HUD
            // gescheiden voor het miniatuureffect). Zonder effect wordt die
            // gewoon na de wereld getekend, zodat de HUD altijd aanwezig is.
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

  /**
   * De twee offscreen-lagen voor het miniatuureffect, op apparaatresolutie:
   * `wereld` krijgt het scherpe beeld, `focus` datzelfde beeld met een
   * verticale gradient als alfamasker. Ze worden hergebruikt en alleen
   * opnieuw gemaakt als de canvasmaat of de pixelverhouding verandert.
   */
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
      wereld,
      wereldC: wereld.getContext('2d'),
      focus,
      focusC: focus.getContext('2d'),
    };
    return this.miniatuurLagen;
  },

  /**
   * Tekent de miniatuur-weergave op het hoofdcanvas: de vervaagde wereld, met
   * daarin een scherpe band op de hoogte van het schip, en daarboven de HUD.
   * Werkt op apparaatpixels; `c` krijgt aan het eind de DPR-transform terug.
   *
   * Die scherpe band is de "scherptediepte" van de maquette: alles erboven
   * (verre kust) en eronder (voorgrondzee) vervaagt, het schip blijft scherp.
   * Subtiel gehouden zodat het als speelgoed leest, niet als onscherpte-bug.
   */
  tekenMiniatuur(c, lagen, scene) {
    const W = lagen.wereld.width;
    const H = lagen.wereld.height;
    const straal = MINI_BLUR * this.dpr;
    if (this.filterSteun === null) this.filterSteun = typeof c.filter === 'string';

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // 1. Eerst de scherpe wereld één op één: schermvullend en dekkend, dus het
    //    vorige frame is meteen weg. Zonder die basis schemert het door overal
    //    waar de vervaging hieronder niet volledig dekt.
    c.drawImage(lagen.wereld, 0, 0);

    // 2. Daaroverheen dezelfde wereld, vervaagd. Het beeld wordt een paar
    //    stralen ruimer getekend: een blur reikt verder dan zijn straal, en
    //    anders zuigt hij de doorzichtige rand erbuiten naar binnen en krijgt
    //    het scherm een lichte lijst. Die overmaat verschuift het vervaagde
    //    beeld hooguit een paar pixels ten opzichte van de scherpe basis —
    //    onzichtbaar, want juist daar is alles toch al uitgesmeerd.
    if (this.filterSteun) {
      const over = straal * 3;
      c.filter = `blur(${straal.toFixed(1)}px)`;
      c.drawImage(lagen.wereld, -over, -over, W + over * 2, H + over * 2);
      c.filter = 'none';
    } else {
      // Terugval voor browsers zonder canvasfilter: vijf verschoven kopieën.
      // De alfa's zijn 1, 1/2, 1/3 … zodat elke kopie na het stapelen even
      // zwaar weegt én de eerste het beeld volledig dekt (geen nabeeld).
      const stap = Math.max(1, Math.round(straal));
      const verschuiving = [0, stap, -stap, stap * 2, -stap * 2];
      for (let i = 0; i < verschuiving.length; i++) {
        c.globalAlpha = 1 / (i + 1);
        c.drawImage(lagen.wereld, 0, verschuiving[i], W, H);
      }
      c.globalAlpha = 1;
    }

    // 3. De scherpe plek. De scène wijst aan waar hij ligt: de camera loopt
    //    vóór het schip uit en klemt tegen de wereldrand, dus het beeldmidden
    //    is lang niet altijd het schip. Een scène die zich verslikt mag het
    //    beeld niet laten vallen: een niet-eindig getal maakt de gradient stuk
    //    en daarmee de hele tekenlus.
    const kern = Math.min(W, H) * MINI_KERN;
    const uitloop = Math.min(W, H) * MINI_UITLOOP;
    const gevraagd = scene.miniatuurFocus() || {};
    const punt = (waarde, maat) => (Number.isFinite(waarde) ? waarde * this.dpr : maat / 2);
    // De cirkel gaat pal op het schip staan, waar het ook in beeld hangt — dan
    // is het altijd volledig scherp, ook in een hoek. Alleen tot het scherm
    // klemmen, voor het geval een scène een punt buiten beeld aanwijst (in een
    // gevecht ligt de camera tussen beide schepen); anders zou de scherpe plek
    // helemaal wegvallen.
    const x = clamp(punt(gevraagd.x, W), 0, W);
    const y = clamp(punt(gevraagd.y, H), 0, H);

    const f = lagen.focusC;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.globalAlpha = 1;
    f.clearRect(0, 0, W, H);
    f.drawImage(lagen.wereld, 0, 0);
    // Hetzelfde beeld, maar weggesneden buiten die cirkel: een ronde gradient
    // met een smoothstep-verloop, zodat de overgang naar vervaagd nergens een
    // rand trekt. `destination-in` houdt alleen over wat de gradient dekt.
    const g = f.createRadialGradient(x, y, kern, x, y, kern + uitloop);
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const a = (1 - u * u * (3 - 2 * u)).toFixed(3);
      g.addColorStop(u, `rgba(0,0,0,${a})`);
    }
    f.globalCompositeOperation = 'destination-in';
    f.fillStyle = g;
    f.fillRect(0, 0, W, H);
    c.drawImage(lagen.focus, 0, 0);

    // 4. De HUD bovenop, altijd scherp en in schermcoördinaten.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (scene.tekenHud) scene.tekenHud(c);
  },

  /**
   * Zet het miniatuureffect aan of uit en onthoudt de keuze in de browser.
   * Bewust niet in de save: het zegt iets over dit scherm, niet over de reis.
   */
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
    // Scheepsuitrusting: niveau 0..max per verbetering. `weer` (weerglas en
    // barometer) dempt stormschade en geldt alleen voor het vlaggenschip.
    upgrades: opts.upgrades || { zeilen: 0, romp: 0, roer: 0, weer: 0 },
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
    // Lopende schatjacht: null of het resultaat van wereld.plaatsSchat().
    schat: null,
    schattenGevonden: 0,
    veroverdeSteden: 0,
    verslagenSchepen: 0,
    gehuwd: null,
    laatsteVerdeling: 0,
    gestopt: false,
    // Wanneer een haven hem voor het laatst op zijn leeftijd wees.
    pensioenGevraagd: 0,
    // Vermist familielid: rol wordt bij het begin bepaald. `spoor` gaat aan
    // zodra je weet wie ze heeft meegevoerd; pas dan vaart die schurk rond.
    familie: { rol: pick(Math.random, FAMILIE_ROLLEN), spoor: false, gevonden: false, gevondenDag: null },
    // Actieve gouverneursopdracht (zie town.js). null als er geen loopt.
    opdracht: null,
    // Buitstukken van verslagen legendes; horen bij de kapitein, niet bij één schip.
    items: [],
    // Wat je van elke beruchte kapitein weet. `bij` is de laatste haven waar
    // hij volgens de kroeg gezien is.
    legendes: Object.fromEntries(LEGENDES.map((l) => [l.id, { verslagen: false, getipt: false, bij: null }])),
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
  const romp = speler.schepen.reduce((a, s) => a + SCHIP_INDEX[s.type].bemanning, 0);
  // Driedubbele hangmatten: er kan meer volk mee dan de werf had bedacht.
  return Math.round(romp * (1 + itemBonus(speler, 'volk')));
}

export function talentBonus(speler, id) {
  return speler.talent === id ? 1 : 0;
}

export function rangVan(speler, natie) {
  return RANGEN[clamp(speler.rang[natie], 0, RANGEN.length - 1)];
}

// --- Verouderen -----------------------------------------------------------

/** Vanaf deze leeftijd begint de kapitein te slijten. */
export const FIT_TOT = 40;
/** Vanaf hier dringt de bemanning aan op rust. */
export const PENSIOEN_HINT = 55;
/** Vanaf hier legt een bevriende haven hem het commando neer. */
export const PENSIOEN_DRANG = 62;

/**
 * Hoe fit de kapitein nog is, van 1 tot 0,6. Tot zijn veertigste verandert er
 * niets; daarna zakt het langzaam. Op de laagste moeilijkheidsgraad slijt het
 * half zo snel — daar is het leren zeilen al zwaar genoeg.
 */
export function leeftijdFactor(speler) {
  if (!speler || speler.leeftijd == null) return 1;
  const moeilijk = MOEILIJKHEDEN.find((m) => m.id === speler.moeilijkheid) || MOEILIJKHEDEN[1];
  const slijtage = 0.011 * clamp(moeilijk.mult, 0.5, 1.2);
  return clamp(1 - Math.max(0, speler.leeftijd - FIT_TOT) * slijtage, 0.6, 1);
}

/** Kort woord voor de conditie, voor het bemanningsscherm. */
export function conditieWoord(speler) {
  const f = leeftijdFactor(speler);
  if (f > 0.97) return 'in de kracht van de jaren';
  if (f > 0.9) return 'nog vast ter been';
  if (f > 0.8) return 'op leeftijd';
  if (f > 0.7) return 'stram in de ochtend';
  return 'te oud voor het staal';
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
  if (speler.familie && speler.familie.gevonden) score += 800;
  // Wie op tijd stopt, houdt zijn naam hoog. Na zijn vijftigste levert elk jaar
  // op zee minder op dan het kost — zo wordt aftreden een keuze en niet alleen
  // het einde van het spel.
  const rust = clamp(1.2 - Math.max(0, (speler.leeftijd || 18) - 50) * 0.012, 0.85, 1.2);
  return Math.round(score * moeilijk.mult * rust);
}

// --- Opslag ---------------------------------------------------------------

export function bewaar() {
  if (!Game.speler || !Game.wereld) return false;
  const w = Game.wereld;
  const data = {
    versie: 6,
    seed: w.seed,
    speler: Game.speler,
    // De wereldpolitiek staat op de wereld, niet op de speler, en volgt dus
    // niet vanzelf uit het zaadje: wie oorlog voert met wie is een gevolg van
    // wat er tijdens deze reis is gebeurd.
    oorlogen: w.oorlogen || {},
    diploTimer: w.diploTimer || 0,
    // Stormen zijn eveneens veranderlijke staat: ze drijven mee met de wind en
    // worden dus niet door het zaadje opnieuw gezaaid.
    stormen: (w.stormen || []).slice(),
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
  // Saves van vóór versie 3 kenden de stormen nog niet; die worden uit het
  // zaadje gezaaid.
  if (data.stormen && data.stormen.length) wereld.stormen = data.stormen;
  // Oude saves saneren: ontbrekende velden krijgen hun standaardwaarde.
  const sp = data.speler;
  if (!sp.familie) sp.familie = { rol: pick(Math.random, FAMILIE_ROLLEN), spoor: false, gevonden: false, gevondenDag: null };
  // Saves van vóór de schurk: wie zijn familielid al gevonden had, houdt dat;
  // wie nog zocht, begint bij het spoor.
  if (sp.familie.spoor == null) sp.familie.spoor = !!sp.familie.gevonden;
  if (sp.opdracht === undefined) sp.opdracht = null;
  // Saves van vóór versie 4 kenden het verouderen nog niet. De leeftijd volgt
  // uit de verstreken dagen, dus die is altijd terug te rekenen.
  if (sp.startLeeftijd == null) sp.startLeeftijd = 18;
  if (sp.leeftijd == null) sp.leeftijd = sp.startLeeftijd + (sp.dag || 0) / 365;
  if (sp.pensioenGevraagd == null) sp.pensioenGevraagd = 0;
  // Saves van vóór versie 5 kenden de beruchte kapiteins nog niet. Nieuwe
  // legendes die later worden toegevoegd komen er langs deze weg ook bij.
  if (!Array.isArray(sp.items)) sp.items = [];
  // Saves van vóór de schatjacht hadden alleen een teller `schatkaarten`. Die
  // wordt omgezet: er komt een echte schat op de kaart met evenveel kwadranten
  // al ingevuld als er stukken gekocht waren.
  if (sp.schattenGevonden == null) sp.schattenGevonden = 0;
  if (sp.schat === undefined) sp.schat = null;
  if (!sp.schat && sp.schatkaarten > 0) {
    sp.schat = wereld.plaatsSchat(sp.schattenGevonden);
    for (let i = 0; i < Math.min(4, sp.schatkaarten); i++) sp.schat.kwadranten[i] = true;
  }
  delete sp.schatkaarten;
  if (!sp.legendes) sp.legendes = {};
  for (const l of LEGENDES) {
    if (!sp.legendes[l.id]) sp.legendes[l.id] = { verslagen: false, getipt: false, bij: null };
  }
  for (const schip of sp.schepen || []) {
    if (!schip.upgrades) schip.upgrades = { zeilen: 0, romp: 0, roer: 0 };
    if (schip.upgrades.weer === undefined) schip.upgrades.weer = 0;
  }
  // De wereld wordt uit het zaadje herbouwd, en de kustlijnen zijn sinds
  // oudere saves fijner getekend. Een schip dat daardoor net op het droge
  // uitkomt, zetten we terug in het dichtstbijzijnde vaarwater.
  const vlag = sp.schepen && sp.schepen[0];
  if (vlag && !wereld.isVaren(sp.x, sp.y, vlag.type)) {
    const [vx, vy] = wereld.dichtstbijVaren(sp.x, sp.y, vlag.type, 1200);
    sp.x = vx;
    sp.y = vy;
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
