// Opbouw van de Caribische wereldkaart: land, steden, economie, wind en vloten.
import { makeRng, rnd, rndInt, pick, clamp, lerp, smooth, dist, TAU, normAngle } from './util.js';
import {
  STEDEN, WAREN, WAAR_INDEX, SOORT_ECONOMIE, NATIE_IDS, SCHEPEN, SCHIP_INDEX, KAPITEIN_NAMEN,
  SCHEEP_MAAT, LEGENDES, LEGENDE_INDEX, itemBonus, HERKENNINGSPUNTEN, SCHATREGIOS,
} from './data.js';

// Kaartprojectie: rechttoe-rechtaan, met echte graden als basis. De ruime
// schaal zorgt dat een overtocht een reis is, terwijl de camera maar één
// eiland, doorgang of kuststrook tegelijk hoeft te tonen.
export const PPD = 196; // wereldeenheden per graad
export const LON0 = -98,
  LON1 = -58,
  LAT0 = 7.6,
  LAT1 = 31;
export const WORLD_W = (LON1 - LON0) * PPD;
export const WORLD_H = (LAT1 - LAT0) * PPD;
const DOEL_VLOTEN = 46;

/**
 * Hoe dicht je langs de kust moet varen voordat de stuurman het perkament
 * thuisbrengt. Dezelfde waarde begrenst waar een schat mag liggen, zodat elke
 * schat gegarandeerd te bereiken is.
 */
export const SCHAT_ZICHT = 300;

export const projX = (lon) => (lon - LON0) * PPD;
export const projY = (lat) => (LAT1 - lat) * PPD;
const P = (lon, lat) => [projX(lon), projY(lat)];

// --- Kustlijnen -----------------------------------------------------------

// Vasteland: Florida, Golfkust, Mexico, Yucatán, Midden-Amerika, Spanish Main.
// Dit is een ópen lijn: alleen echte kust. Het achterland wordt gesloten met
// VASTELAND_SLUITING, en die segmenten krijgen geen strand of branding — het
// zijn de randen van de kaart, geen oevers.
const VASTELAND = [
  [-81.5, 31], [-81.3, 30.4], [-80.9, 29.2], [-80.55, 28.5], [-80.1, 27.0],
  [-80.1, 26.0], [-80.4, 25.3], [-81.1, 25.1], [-81.7, 25.9], [-81.85, 26.6],
  [-82.6, 27.5], [-82.7, 28.4], [-83.3, 29.4], [-84.3, 29.9], [-85.4, 29.7],
  [-86.5, 30.4], [-88.0, 30.3], [-89.3, 30.2], [-89.1, 29.2], [-90.3, 29.1],
  [-91.5, 29.4], [-93.0, 29.7], [-94.7, 29.3], [-96.4, 28.4], [-97.3, 27.0],
  [-97.4, 26.0], [-97.7, 24.0], [-97.8, 22.3], [-97.1, 20.9], [-96.13, 19.35],
  [-95.0, 18.7], [-94.4, 18.15], [-93.0, 18.4], [-91.9, 18.65], [-91.0, 18.85],
  [-90.7, 19.5], [-90.5, 20.4], [-90.0, 21.1], [-89.0, 21.6], [-87.6, 21.6],
  [-86.85, 21.2], [-86.8, 20.3], [-87.4, 19.6], [-87.8, 18.6], [-88.3, 17.5],
  [-88.2, 16.5], [-88.8, 15.9], [-87.5, 15.85], [-86.0, 16.0], [-84.5, 15.9],
  [-83.4, 15.0], [-83.2, 14.0], [-83.5, 13.0], [-83.4, 11.9], [-82.9, 10.9],
  [-82.2, 9.4], [-81.0, 8.9], [-79.9, 9.3], [-79.0, 9.5], [-78.0, 9.3],
  [-77.4, 8.7], [-76.9, 8.9], [-76.2, 9.0], [-75.6, 9.4], [-75.6, 10.3],
  [-74.8, 11.1], [-73.3, 11.3], [-72.2, 11.85], [-71.35, 11.9], [-71.6, 10.9],
  [-71.0, 10.6], [-70.2, 11.5], [-69.6, 11.45], [-68.3, 10.5], [-66.9, 10.6],
  [-65.5, 10.2], [-64.7, 10.15], [-63.0, 10.6], [-62.4, 10.65], [-62.0, 10.0],
  [-61.6, 9.2], [-60.6, 8.6], [-59.2, 8.3], [-58.0, 8.0],
];

/** Sluit het vasteland buiten beeld; nadrukkelijk géén kust. */
const VASTELAND_SLUITING = [
  [-58.0, 7.2], [-98.6, 7.2], [-98.6, 31.4], [-81.5, 31.4],
];

const CUBA = [
  [-84.95, 21.9], [-84.0, 22.2], [-82.8, 22.7], [-81.8, 23.15], [-80.5, 23.2],
  [-79.3, 22.6], [-78.2, 22.4], [-77.2, 21.8], [-75.8, 21.2], [-74.9, 20.9],
  [-74.13, 20.25], [-75.2, 20.0], [-76.5, 19.9], [-77.7, 19.9], [-79.0, 20.4],
  [-80.0, 21.1], [-81.2, 21.6], [-82.5, 21.9], [-83.7, 22.0], [-84.5, 21.85],
];

const HISPANIOLA = [
  [-74.45, 20.05], [-73.4, 19.95], [-71.7, 19.9], [-70.0, 19.7], [-68.9, 19.4],
  [-68.32, 18.6], [-69.5, 18.42], [-70.7, 18.25], [-71.7, 18.3], [-72.35, 18.5],
  [-73.2, 18.2], [-74.45, 18.35], [-73.6, 18.65], [-72.6, 19.1], [-73.0, 19.6],
  [-73.9, 19.75],
];

const JAMAICA = [
  [-78.4, 18.5], [-77.2, 18.55], [-76.2, 18.42], [-76.2, 17.85], [-77.4, 17.83], [-78.35, 18.2],
];

const PUERTO_RICO = [
  [-67.3, 18.52], [-65.6, 18.48], [-65.6, 17.95], [-67.25, 17.93],
];

const BAHAMAS = [
  [[-78.35, 25.15], [-77.7, 25.05], [-77.6, 24.5], [-78.1, 24.35], [-78.4, 24.7]],
  [[-76.75, 25.55], [-76.15, 25.2], [-76.0, 24.85], [-76.2, 24.85], [-76.4, 25.2], [-76.9, 25.6]],
  [[-79.0, 26.72], [-78.2, 26.6], [-78.3, 26.42], [-79.0, 26.52]],
  [[-77.5, 26.95], [-76.9, 26.3], [-77.12, 26.2], [-77.65, 26.85]],
  [[-76.2, 24.2], [-75.1, 23.1], [-74.85, 23.02], [-75.95, 24.18]],
];

/**
 * Kleinere eilanden als middelpunt + straal in graden, met daarachter de
 * bankfactor: hoe ver het ondiepe water voor de kust uitloopt. Een koraaleiland
 * op de Bahamabank ligt in een breed turkoois veld; een vulkaan als Dominica
 * duikt binnen een kabellengte naar duizend vadem. Dát verschil is precies wat
 * een Caribische zeekaart herkenbaar maakt.
 */
const EILANDJES = [
  [-77.4, 25.05, 0.16, 2.2], [-73.3, 21.05, 0.42, 2.0], [-72.82, 20.08, 0.16, 1.8], [-73.05, 18.85, 0.3, 0.9],
  [-81.25, 19.32, 0.15, 0.7], [-80.05, 19.68, 0.08, 0.7], [-86.9, 20.45, 0.15, 1.1],
  [-64.75, 18.35, 0.26, 1.3], [-63.05, 18.09, 0.15, 1.5], [-63.24, 17.63, 0.08, 0.45], [-62.97, 17.49, 0.09, 0.45],
  [-62.73, 17.33, 0.13, 0.5], [-62.6, 17.15, 0.08, 0.5], [-61.79, 17.08, 0.15, 1.1], [-61.79, 17.63, 0.12, 1.7],
  [-62.19, 16.74, 0.09, 0.45], [-61.6, 16.22, 0.26, 0.8], [-61.35, 15.42, 0.18, 0.4], [-61.02, 14.65, 0.2, 0.5],
  [-60.97, 13.9, 0.14, 0.45], [-61.19, 13.25, 0.13, 0.45], [-61.68, 12.12, 0.13, 0.6], [-59.55, 13.18, 0.15, 0.6],
  [-60.7, 11.25, 0.13, 0.9], [-61.05, 10.45, 0.4, 1.3], [-63.95, 11.0, 0.24, 1.0], [-68.95, 12.15, 0.22, 0.6],
  [-70.0, 12.52, 0.15, 0.7], [-68.3, 12.2, 0.17, 0.6], [-81.37, 13.35, 0.1, 1.4], [-81.7, 12.55, 0.1, 1.4],
];

/**
 * Bergruggen, als lijnen over het land. Ze worden geklemd op de landvorm, dus
 * ze mogen ruim genomen zijn; wat buiten de kust valt wordt weggeknipt.
 * `hoog` bepaalt hoe zwaar de rug oogt (breedte en schaduw).
 */
const BERGRUGGEN = [
  // Cuba
  { pts: [[-77.5, 19.98], [-76.6, 20.05], [-75.7, 20.15]], hoog: 0.85 }, // Sierra Maestra
  { pts: [[-80.35, 21.85], [-79.85, 21.95]], hoog: 0.45 }, // Escambray
  { pts: [[-84.3, 22.4], [-83.3, 22.5]], hoog: 0.4 }, // Sierra de los Órganos
  // Hispaniola
  { pts: [[-71.9, 18.75], [-70.9, 19.0], [-70.1, 19.25]], hoog: 1.0 }, // Cordillera Central
  { pts: [[-73.9, 18.42], [-72.9, 18.45]], hoog: 0.6 }, // Massif de la Hotte
  { pts: [[-71.5, 19.75], [-70.4, 19.6]], hoog: 0.45 }, // Cordillera Septentrional
  // Jamaica en Puerto Rico
  { pts: [[-77.0, 18.15], [-76.45, 18.08]], hoog: 0.6 }, // Blue Mountains
  { pts: [[-66.8, 18.2], [-66.0, 18.2]], hoog: 0.5 }, // Cordillera Central
  // Vasteland
  { pts: [[-92.2, 15.4], [-90.5, 15.2], [-88.9, 15.3]], hoog: 0.95 }, // Guatemalteekse hooglanden
  { pts: [[-87.6, 14.6], [-86.2, 14.2], [-85.0, 13.5]], hoog: 0.8 }, // Honduras/Nicaragua
  { pts: [[-83.9, 10.4], [-82.6, 9.5], [-81.4, 8.9]], hoog: 0.7 }, // Cordillera de Talamanca
  { pts: [[-74.2, 10.95], [-73.6, 10.75]], hoog: 0.75 }, // Sierra Nevada de Santa Marta
  { pts: [[-72.6, 10.0], [-72.4, 9.0], [-72.2, 8.2]], hoog: 0.7 }, // Serranía de Perijá
  { pts: [[-71.6, 9.2], [-70.4, 9.6], [-69.6, 10.0]], hoog: 0.8 }, // Cordillera de Mérida
  { pts: [[-67.6, 10.3], [-66.2, 10.35], [-64.9, 10.05]], hoog: 0.55 }, // Cordillera de la Costa
  { pts: [[-96.3, 18.9], [-97.0, 20.2], [-97.6, 21.6]], hoog: 0.7 }, // Sierra Madre Oriental
  { pts: [[-61.8, 8.0], [-60.4, 7.9], [-59.0, 8.0]], hoog: 0.5 }, // Guyanaas hoogland
  // Vulkanen van de Kleine Antillen: korte, steile ruggen.
  { pts: [[-61.35, 15.45], [-61.32, 15.35]], hoog: 0.55 }, // Dominica
  { pts: [[-61.03, 14.75], [-61.0, 14.68]], hoog: 0.5 }, // Pelée
  { pts: [[-61.2, 13.32], [-61.18, 13.25]], hoog: 0.5 }, // Soufrière
  { pts: [[-61.66, 16.18], [-61.62, 16.1]], hoog: 0.45 }, // Basse-Terre
  { pts: [[-62.2, 16.72], [-62.18, 16.68]], hoog: 0.4 }, // Montserrat
  { pts: [[-62.75, 17.36], [-62.72, 17.3]], hoog: 0.4 }, // St. Kitts
];

/**
 * Kustlijn opdelen en licht verstoren zodat hij organisch oogt. Bij een open
 * lijn (`gesloten = false`) blijven de uiteinden staan waar ze staan.
 */
function verruw(poly, rng, kracht, rondingen = 1, gesloten = true) {
  let pts = poly;
  for (let r = 0; r < rondingen; r++) {
    const uit = [];
    const laatste = gesloten ? pts.length : pts.length - 1;
    for (let i = 0; i < laatste; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      uit.push(a);
      const mx = (a[0] + b[0]) / 2,
        my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (rng() - 0.5) * kracht * len;
      uit.push([mx - (dy / len) * off, my + (dx / len) * off]);
    }
    if (!gesloten) uit.push(pts[pts.length - 1]);
    pts = uit;
    kracht *= 0.62;
  }
  return pts;
}

function maakEilandje(lon, lat, straal, rng) {
  const n = rndInt(rng, 11, 18);
  const pts = [];
  // Niet elk eiland is een rond kiezeltje: sommige zijn lang en smal, andere
  // gelobd met een baai erin. Twee harmonischen op de straal doen dat werk.
  const rekX = rnd(rng, 0.55, 1.9);
  const rekY = rnd(rng, 0.55, 1.9);
  const draai = rnd(rng, 0, TAU);
  const lobben = rndInt(rng, 2, 4);
  const lobDiepte = rnd(rng, 0.1, 0.3);
  const lobFase = rnd(rng, 0, TAU);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(rng, -0.08, 0.08);
    const r = straal * (1 - lobDiepte + lobDiepte * Math.cos(a * lobben + lobFase)) * rnd(rng, 0.82, 1.14);
    const x = Math.cos(a) * r * rekX,
      y = Math.sin(a) * r * rekY;
    pts.push([lon + x * Math.cos(draai) - y * Math.sin(draai), lat + x * Math.sin(draai) + y * Math.cos(draai)]);
  }
  return pts;
}

// --- Wereld ---------------------------------------------------------------

// Fijn landmasker: fijn genoeg dat zelfs de kleinste eilandjes (straal ~7
// eenheden) voldoende cellen raken, robuust genoeg voor snelle botsingsstraat.
const RASTER = 4; // wereldeenheden per cel in het landmasker

export class Wereld {
  constructor(seed = 1337) {
    this.seed = seed;
    const rng = makeRng(seed);
    this.rng = rng;

    /**
     * `path` is de gesloten landvorm (vullen, botsen); `kust` bevat alleen de
     * échte oever, zodat strand en branding nooit op een kaartrand belanden.
     * `bank` schaalt de breedte van het ondiepe water voor de kust.
     * @type {{pts:number[][], path:Path2D, kust:Path2D, groot:boolean, bank:number}[]}
     */
    this.land = [];
    const voegToe = (graden, ruw, groot, bank = 1, sluiting = null) => {
      const open = !!sluiting;
      const kustGraden = verruw(graden, rng, ruw, groot ? 3 : 2, !open);
      const kustPts = kustGraden.map(([lon, lat]) => P(lon, lat));

      const kust = new Path2D();
      kust.moveTo(kustPts[0][0], kustPts[0][1]);
      for (let i = 1; i < kustPts.length; i++) kust.lineTo(kustPts[i][0], kustPts[i][1]);
      if (!open) kust.closePath();

      const pts = open ? kustPts.concat(sluiting.map(([lon, lat]) => P(lon, lat))) : kustPts;
      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();

      this.land.push({ pts, path, kust, groot, bank });
      return pts;
    };

    voegToe(VASTELAND, 0.085, true, 1, VASTELAND_SLUITING);
    voegToe(CUBA, 0.1, true, 1.15);
    voegToe(HISPANIOLA, 0.1, true, 0.8);
    voegToe(JAMAICA, 0.11, false, 0.9);
    voegToe(PUERTO_RICO, 0.085, false, 0.7);
    for (const b of BAHAMAS) voegToe(b, 0.13, false, 2.4);
    for (const [lon, lat, r, bank] of EILANDJES) {
      voegToe(maakEilandje(lon, lat, r, rng), 0.09, false, bank);
    }

    // Bergruggen naar wereldcoördinaten; de tekenlaag knipt ze op het land.
    this.ruggen = BERGRUGGEN.map((r) => ({
      pts: r.pts.map(([lon, lat]) => P(lon, lat)),
      hoog: r.hoog,
    }));

    this.#bouwMasker();
    this.#bouwSteden();

    // Wind: passaat uit het oosten, dus waaiend richting het westen. Dat is het
    // gemiddelde, niet de grens — zie `windTik`.
    this.windRichting = Math.PI;
    this.windDoel = Math.PI;
    // `windBasis` is de gestage wind, `windKracht` diezelfde wind met de vlagen
    // erin. Alles wat vaart of tekent leest `windKracht`.
    this.windBasis = 1;
    this.windKracht = 1;
    this.krachtDoel = 1;
    this.windTimer = 0;
    this.windTijd = 0;

    // Stormen: beweeglijke weercellen die met de wind meedrijven. Ze zijn
    // *gezaaid* uit het wereldzaadje (dus deterministisch) maar drijven daarna
    // vrij op de wind mee; hun positie is daarmee veranderlijke staat, net als
    // de politiek. Elke cel heeft een kern (x, y), een grootte en een
    // levenslijn (verjaart en sterft).
    this.stormen = [];
    const stormRng = makeRng(seed ^ 0x9e3779b9);
    // De kaart is ruim tweemaal zo breed geworden. Met 6..9 cellen blijft de
    // kans om onderweg werkelijk weer tegen te komen ongeveer gelijk.
    const aantal = 6 + Math.floor(stormRng() * 4); // 6..9 stormen per wereld
    for (let i = 0; i < aantal; i++) {
      this.stormen.push({
        x: rnd(stormRng, 60, WORLD_W - 60),
        y: rnd(stormRng, 60, WORLD_H - 60),
        straal: rnd(stormRng, 300, 620),
        // 0..1: jonge cellen groeien, oude krimpen; volwassen = stabiel.
        leeftijd: rnd(stormRng, 0, 1),
        // Draairichting van de cel: bepaalt welke flank de snelle is.
        draaiing: stormRng() < 0.5 ? -1 : 1,
        levensduur: rnd(stormRng, 250, 420), // seconden tot de cel verwaait
        kern: rnd(stormRng, 0, TAU),
      });
    }

    this.vloten = [];
    for (let i = 0; i < DOEL_VLOTEN; i++) this.spawnVloot(true);

    // Aanlooptijd voordat de eerste beruchte kapitein zich kan vertonen: een
    // kersverse kapitein in een sloep hoort niet in zijn eerste minuut tegen
    // een linieschip aan te lopen.
    this.legendeKoeling = 240;

    this.tijd = 0;
  }

  /**
   * Grof rasterlandmasker voor snelle botsingscontrole.
   *
   * Per polygoon met scanlijnen gevuld in plaats van elke cel tegen elke
   * kustlijn te toetsen: dat scheelt bij een half miljoen cellen en duizenden
   * kustpunten twee ordes van grootte, en het is precies wat ons de ruimte
   * geeft om de kust veel grilliger te maken. De even-oneven-regel is dezelfde
   * als in pointInPoly, dus masker en polygoontoets blijven het eens.
   */
  #bouwMasker() {
    this.mw = Math.ceil(WORLD_W / RASTER) + 1;
    this.mh = Math.ceil(WORLD_H / RASTER) + 1;
    this.masker = new Uint8Array(this.mw * this.mh);
    const kruisingen = [];
    for (const l of this.land) {
      const pts = l.pts;
      let y0 = Infinity,
        y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const y = pts[i][1];
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const cy0 = Math.max(0, Math.ceil(y0 / RASTER));
      const cy1 = Math.min(this.mh - 1, Math.floor(y1 / RASTER));
      for (let cy = cy0; cy <= cy1; cy++) {
        const wy = cy * RASTER;
        kruisingen.length = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const yi = pts[i][1],
            yj = pts[j][1];
          if (yi > wy === yj > wy) continue;
          const xi = pts[i][0],
            xj = pts[j][0];
          kruisingen.push(((xj - xi) * (wy - yi)) / (yj - yi) + xi);
        }
        if (kruisingen.length < 2) continue;
        kruisingen.sort((a, b) => a - b);
        const rij = cy * this.mw;
        for (let k = 0; k + 1 < kruisingen.length; k += 2) {
          let cx0 = Math.ceil(kruisingen[k] / RASTER);
          let cx1 = Math.ceil(kruisingen[k + 1] / RASTER) - 1;
          if (cx1 < 0 || cx0 > this.mw - 1) continue;
          if (cx0 < 0) cx0 = 0;
          if (cx1 > this.mw - 1) cx1 = this.mw - 1;
          for (let cx = cx0; cx <= cx1; cx++) this.masker[rij + cx] = 1;
        }
      }
    }
  }

  isLand(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true;
    const cx = Math.round(x / RASTER),
      cy = Math.round(y / RASTER);
    return this.masker[cy * this.mw + cx] === 1;
  }

  /**
   * Past een schip van `typeId` op de plek (x, y)? Controleert het hele
   * rompoppervlak — een ring van punten rond het middelpunt op boeg-afstand —
   * niet alleen het middelpunt. Zo blijft een romp nooit over de kust hangen.
   */
  isVaren(x, y, typeId) {
    if (this.isLand(x, y)) return false;
    const maat = SCHEEP_MAAT[typeId] || [24, 9, 1];
    // Omgeschreven straal van de getekende romp (tot aan de boegspriet); met
    // een klein beetje speling mag een schip nergens land binnen die afstand
    // hebben, zodat ook het uiterste houtwerk over water blijft.
    const r = maat[0] * 0.62 + 3;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (this.isLand(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
    }
    return true;
  }

  /** Zoekt het dichtstbijzijnde vrije water rond een punt. */
  dichtstbijWater(x, y, maxR = 260) {
    if (!this.isLand(x, y)) return [x, y];
    for (let r = RASTER; r <= maxR; r += RASTER) {
      const n = Math.max(8, Math.round((TAU * r) / RASTER));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = x + Math.cos(a) * r,
          py = y + Math.sin(a) * r;
        if (!this.isLand(px, py)) return [px, py];
      }
    }
    return [x, y];
  }

  /**
   * Zoekt de dichtstbijzijnde plek waar een schip van dit type daadwerkelijk
   * kan liggen (hele romp in het water). Wordt gebruikt bij uitvaren en bij
   * het plaatsen van vloten.
   */
  dichtstbijVaren(x, y, typeId, maxR = 420) {
    for (let r = RASTER; r <= maxR; r += RASTER) {
      const n = Math.max(12, Math.round((TAU * r) / (RASTER * 2)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = x + Math.cos(a) * r,
          py = y + Math.sin(a) * r;
        if (this.isVaren(px, py, typeId)) return [px, py];
      }
    }
    return [x, y];
  }

  /**
   * Kiest een koers vanaf (x, y) waarlangs het schip van `typeId` het verst
   * onbelemmerd vooruit kan — de richting van de open zee. De meegegeven
   * vertrekkoers `valkoers` krijgt de voorkeur zolang hij vrij uitloopt;
   * anders wijst de boeg de vrijste doorgang.
   */
  koersOpenZee(x, y, typeId, valkoers = null) {
    const blik = 800;
    const stap = 25;
    const stappen = Math.ceil(blik / stap);
    const vrijeLengte = (a) => {
      for (let s = 1; s <= stappen; s++) {
        const r = s * stap;
        if (!this.isVaren(x + Math.cos(a) * r, y + Math.sin(a) * r, typeId)) return r;
      }
      return blik;
    };
    let beste = valkoers;
    let besteLengte = valkoers == null ? -1 : vrijeLengte(valkoers);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const lengte = vrijeLengte(a);
      if (lengte > besteLengte) {
        besteLengte = lengte;
        beste = a;
      }
    }
    return beste;
  }

  #bouwSteden() {
    const rng = this.rng;
    this.steden = STEDEN.map((s, i) => {
      const x = projX(s.lon),
        y = projY(s.lat);
      const [dx, dy] = this.dichtstbijWater(x, y, 320);
      const stad = {
        id: i,
        naam: s.naam,
        natie: s.natie,
        oorspronkelijkeNatie: s.natie,
        soort: s.soort,
        grootte: s.grootte,
        x,
        y,
        // Aanlegplek: net buiten de kust, daar meert de speler aan.
        ankerX: dx,
        ankerY: dy,
        bevolking: 300 + s.grootte * s.grootte * 240 + rndInt(rng, 0, 400),
        garnizoen: 20 + s.grootte * (s.soort === 'fort' ? 34 : 18) + rndInt(rng, 0, 20),
        welvaart: 0.6 + s.grootte * 0.14 + rng() * 0.2,
        prijzen: new Array(WAREN.length).fill(0),
        voorraad: new Array(WAREN.length).fill(0),
        bezocht: false,
        // Aanwezige verhaalfiguren worden per bezoek opnieuw bepaald.
        laatsteBezoek: -999,
      };
      this.#hersteldeEconomie(stad, rng);
      return stad;
    });
  }

  #hersteldeEconomie(stad, rng) {
    const ec = SOORT_ECONOMIE[stad.soort] || { produceert: [], vraagt: [] };
    for (let i = 0; i < WAREN.length; i++) {
      const w = WAREN[i];
      let f = 1;
      if (ec.produceert.includes(w.id)) f *= 0.58;
      if (ec.vraagt.includes(w.id)) f *= 1.5;
      f *= lerp(1.12, 0.9, clamp((stad.grootte - 1) / 4, 0, 1));
      stad.prijzen[i] = Math.round(w.basis * f * rnd(rng, 0.86, 1.16));
      stad.voorraad[i] = Math.round(
        (ec.produceert.includes(w.id) ? 160 : 55) * stad.grootte * rnd(rng, 0.5, 1.4)
      );
    }
  }

  /** Prijzen kruipen langzaam terug naar hun natuurlijke niveau. */
  economieTik(dagen) {
    const rng = this.rng;
    for (const stad of this.steden) {
      const ec = SOORT_ECONOMIE[stad.soort] || { produceert: [], vraagt: [] };
      for (let i = 0; i < WAREN.length; i++) {
        const w = WAREN[i];
        let doel = w.basis;
        if (ec.produceert.includes(w.id)) doel *= 0.58;
        if (ec.vraagt.includes(w.id)) doel *= 1.5;
        doel *= lerp(1.12, 0.9, clamp((stad.grootte - 1) / 4, 0, 1));
        const t = clamp(dagen * 0.05, 0, 1);
        stad.prijzen[i] = Math.max(6, Math.round(lerp(stad.prijzen[i], doel * rnd(rng, 0.95, 1.05), t)));
        const groei = ec.produceert.includes(w.id) ? 9 : 3;
        stad.voorraad[i] = clamp(stad.voorraad[i] + groei * stad.grootte * dagen * rnd(rng, 0.4, 1.3), 0, 900 * stad.grootte);
      }
      stad.bevolking = Math.round(stad.bevolking * (1 + 0.0004 * dagen));
      stad.garnizoen = Math.min(stad.garnizoen + dagen * 0.35 * stad.grootte, 60 + stad.grootte * 60);
    }
  }

  windTik(dt) {
    this.windTijd += dt;
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = rnd(this.rng, 24, 58);
      // De passaat is het middelpunt waar de wind steeds naar terugkeert, niet
      // een hek waar hij binnen blijft: elke keer wordt de bestaande afwijking
      // voor een deel weggetrokken en komt er een nieuwe dwaling bij. Zo waait
      // het meestal uit het oosten, staat het nooit twee dagen hetzelfde, en
      // draait de wind een enkele keer werkelijk om — en dan is de terugreis de
      // zware. Zonder die kans op een echte draai valt er niets te bezeilen:
      // west varen was altijd snel en oost altijd traag.
      const afwijking = normAngle(this.windDoel - Math.PI);
      this.windDoel = normAngle(Math.PI + afwijking * 0.6 + rnd(this.rng, -1.3, 1.3));
      this.krachtDoel = rnd(this.rng, 0.55, 1.5);
    }
    // Richting én kracht kruipen naar hun doel. Vroeger sprong de kracht in één
    // beeld naar zijn nieuwe waarde; dat is de enige verandering aan het weer
    // die je écht zou moeten voelen, en juist die was onzichtbaar-plotseling.
    const d = normAngle(this.windDoel - this.windRichting);
    this.windRichting = normAngle(this.windRichting + clamp(d, -0.11 * dt, 0.11 * dt));
    this.windBasis = lerp(this.windBasis, this.krachtDoel, clamp(dt * 0.3, 0, 1));
    // Vlagen en luwtes: twee trage golven over elkaar, zodat de wind ademt in
    // plaats van stilstaat. Twee onverwante perioden geven geen hoorbaar ritme.
    // Allebei zonder faseverschuiving, zodat de vlaag bij t = 0 precies 1 is en
    // de wind niet in zijn eerste beeld al een sprongetje maakt.
    const vlaag = 1 + 0.09 * Math.sin(this.windTijd * 0.53) + 0.05 * Math.sin(this.windTijd * 1.27);
    this.windKracht = this.windBasis * vlaag;
  }

  /**
   * Laat de stormen met de wind meedrijven, verouderen en vergaan. Stormen
   * volgen de wind net iets sneller dan de zeegang, zodat een schip er met de
   * wind in — of er juist tegenin — al dan niet in belandt.
   */
  stormTik(dt) {
    const wind = this.windRichting;
    // Stormen drijven wat sneller dan een schip en met een kleine laterale
    // zwalk, zodat ze niet één gladde band blijven.
    this.stormTijd = (this.stormTijd || 0) + dt;
    const snelheid = 34 * this.windKracht;
    const zwalk = Math.sin(this.stormTijd * 0.07 + this.stormen.length) * 0.35;
    for (let i = this.stormen.length - 1; i >= 0; i--) {
      const s = this.stormen[i];
      s.leeftijd += dt / s.levensduur;
      // Kern drijft met de wind mee.
      s.x = (s.x + Math.cos(wind + zwalk) * snelheid * dt + WORLD_W) % WORLD_W;
      s.y = (s.y + Math.sin(wind + zwalk) * snelheid * dt + WORLD_H) % WORLD_H;
      // Groeien tot een kwart van hun leven, daarna krimpen tot ze vergaan.
      if (s.leeftijd >= 1 || s.straal <= 120) {
        this.stormen.splice(i, 1);
        this.stormen.push(this.#nieuweStorm());
      }
    }
  }

  /** Maakt een nieuwe storm op een willekeurige plek op zee. */
  #nieuweStorm() {
    const rng = this.rng;
    const x = rnd(rng, 60, WORLD_W - 60),
      y = rnd(rng, 60, WORLD_H - 60);
    // Niet over land laten ontstaan; de tekenlaag kapt hem dan al.
    return {
      x,
      y,
      straal: rnd(rng, 300, 620),
      leeftijd: 0,
      levensduur: rnd(rng, 250, 420),
      kern: rnd(rng, 0, TAU),
      draaiing: rng() < 0.5 ? -1 : 1,
    };
  }

  /**
   * Alles wat de stormcellen op één punt doen, in één doorrekening — want die
   * dingen hóren bij elkaar. De rugwind op de flank en het gevaar in de kern
   * zijn twee kanten van dezelfde cel, en de speler moet ze tegen elkaar
   * kunnen afwegen op grond van waar hij vaart, niet op grond van geluk.
   *
   *   nabij    0..1  hoe diep in de cel: 0 erbuiten, 1 in het hart
   *   rug      0..1  hoeveel extra vaart de cel meegeeft; piekt op de flank
   *   gevaar   0..1  hoe hard de cel aan schip en want trekt; nul tot de kernrand
   *   richting/kracht  de plaatselijke wind, met de draaiing van de cel erin
   *
   * De cel draait om zijn kern. Op de flank waar die draaiing met de heersende
   * wind meeloopt jaag je mee; aan de overkant werken ze tegen elkaar en zak je
   * juist terug. Dat is geen dobbelsteen maar een plek: je ziet hem liggen en
   * je kiest je kant.
   */
  stormVeld(x, y) {
    let cel = null,
      nabij = 0;
    for (const s of this.stormen) {
      const d = dist(x, y, s.x, s.y);
      if (d >= s.straal + STORM_HALO) continue;
      // Sterkst in de kern, aflopend naar de rand. Jonge cellen zijn nog zwak,
      // oude krimpen weer — een halfvolgroeide cel haalt de gevarengrens dus
      // niet eens en is louter rugwind.
      const kracht = clamp(1 - d / (s.straal + STORM_HALO), 0, 1) * stormRijpheid(s);
      if (kracht > nabij) {
        nabij = kracht;
        cel = s;
      }
    }
    if (!cel) {
      return {
        nabij: 0, rug: 0, gevaar: 0, cel: null,
        richting: this.windRichting,
        kracht: this.windKracht,
      };
    }

    const rug = Math.exp(-Math.pow((nabij - STORM_RUG_PIEK) / STORM_RUG_BREEDTE, 2));
    const gevaar = smooth(clamp((nabij - STORM_KERN) / (1 - STORM_KERN), 0, 1));

    // Cyclonale wind: tangentieel om de kern, steeds zuiverder naarmate je er
    // dichter bij komt. `draaiing` ontbreekt op stormen uit een oude save.
    const naarBuiten = Math.atan2(y - cel.y, x - cel.x);
    const tangent = naarBuiten + (cel.draaiing || 1) * (Math.PI / 2);
    const menging = clamp(nabij * 1.35, 0, 1);
    const richting = normAngle(this.windRichting + normAngle(tangent - this.windRichting) * menging);
    // De vaartwinst zit in de band, niet in het hart: daar is de wind wel hard
    // maar staat hij dwars op elke koers die je ergens brengt. De winst is
    // bewust gematigd — bovenop de gewone wind telt de cel nog eenderde extra
    // in de beste band en vrijwel niets buiten de flank.
    const kracht = this.windKracht * (1 + 0.38 * rug + 0.15 * nabij);
    return { nabij, rug, gevaar, cel, richting, kracht };
  }

  /** Genormaliseerde storm-intensiteit (0..1) op een punt. */
  stormOp(x, y) {
    return this.stormVeld(x, y).nabij;
  }

  /** De plaatselijke wind, met de draaiing en de aanwakkering van een cel erin. */
  stormWind(x, y) {
    const v = this.stormVeld(x, y);
    return { richting: v.richting, kracht: v.kracht };
  }

  stadOp(x, y, straal = 60) {
    let best = null,
      bestD = straal;
    for (const s of this.steden) {
      const d = dist(x, y, s.ankerX, s.ankerY);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  stedenVanNatie(natie) {
    return this.steden.filter((s) => s.natie === natie);
  }

  // --- Vloten op zee ------------------------------------------------------

  spawnVloot(overal = false, natie = null, legendeId = null) {
    const rng = this.rng;
    const legende = legendeId ? LEGENDE_INDEX[legendeId] : null;
    // Een legende hangt rond in de wateren van zijn jachtgebied, maar vaart
    // onder de zwarte vlag.
    natie = legende ? legende.jachtgebied : natie || pick(rng, NATIE_IDS);
    const havens = this.stedenVanNatie(natie);
    const isPiraat = legende ? true : !overal && rng() < 0.16;
    const start = havens.length ? pick(rng, havens) : pick(rng, this.steden);
    const doel = pick(rng, this.steden.filter((s) => s !== start));

    // Zwaardere schepen bij rijke naties, kleine snelle bij piraten.
    let kandidaten;
    if (isPiraat) kandidaten = ['sloep', 'pinas', 'bark', 'brigantijn', 'oorlogssloep'];
    else if (natie === 'spanje') kandidaten = ['koopvaarder', 'galjoen', 'grote_koopvaarder', 'oorlogsgaljoen', 'bark', 'fluit'];
    else kandidaten = ['sloep', 'bark', 'fluit', 'koopvaarder', 'brigantijn', 'vrachtfluit', 'fregat'];
    const type = legende ? SCHIP_INDEX[legende.schip] : SCHIP_INDEX[pick(rng, kandidaten)];

    let x = start.ankerX,
      y = start.ankerY;
    // Eerst over open zee verspreiden…
    if (overal) {
      for (let poging = 0; poging < 60; poging++) {
        const px = rnd(rng, 60, WORLD_W - 60),
          py = rnd(rng, 60, WORLD_H - 60);
        if (this.isVaren(px, py, type.id)) {
          x = px;
          y = py;
          break;
        }
      }
    } else if (!this.isVaren(x, y, type.id)) {
      // …anders zet de vloot koers vanuit de rede, waar de hele romp past.
      const [vx, vy] = this.dichtstbijVaren(x, y, type.id);
      x = vx;
      y = vy;
    }

    const marine = !isPiraat && rng() < 0.14;
    const vloot = {
      natie: isPiraat ? 'piraat' : natie,
      marine,
      type: type.id,
      naam: legende ? legende.naam : pick(rng, KAPITEIN_NAMEN),
      // Alleen gezet bij een beruchte kapitein; de rest van het spel leest
      // hieraan af dat dit geen doorsnee zeil aan de horizon is.
      legende: legendeId,
      x,
      y,
      koers: rnd(rng, 0, TAU),
      snelheid: 0,
      doel,
      romp: type.romp,
      zeilen: 1,
      // Een legende vaart vol bemand en zwaarder bewapend dan zijn scheepstype
      // op papier draagt; de romp blijft normaal, zodat de zeewaardigheid in de
      // zeeslag klopt.
      bemanning: Math.round(type.bemanning * (legende ? legende.kracht : rnd(rng, 0.45, 0.85))),
      kanonnen: Math.round(type.kanonnen * (legende ? legende.kracht : rnd(rng, 0.5, 1))),
      goud: legende
        ? Math.round(rnd(rng, 4000, 9000) * legende.kracht)
        : Math.round(rnd(rng, 200, 2600) * (marine ? 0.5 : 1) * (type.ruim / 100)),
      lading: WAREN.map((w, i) =>
        isPiraat || marine ? rndInt(rng, 0, 12) : rndInt(rng, 0, Math.round(type.ruim / 7))
      ),
      gezien: false,
      leeftijd: 0,
      // Achtervolgingstoestand: jaagt houdt de inzet vast, aggroKoeling
      // voorkomt dat een losgelaten achtervolging meteen opnieuw begint.
      jaagt: false,
      aggroKoeling: 0,
    };
    this.vloten.push(vloot);
    return vloot;
  }

  /**
   * Politieke verhoudingen verschuiven vanzelf: alles trekt langzaam naar
   * neutraal, en af en toe verklaart een willekeurige natie de ander de oorlog
   * (of sluit juist vrede). Zo dwingt de wereld je keuzes af zonder dat je er
   * iets voor hoeft te doen.
   */
  relatieTik(dagen, speler) {
    if (!speler || !speler.relatie) return;
    const rng = this.rng;
    for (const n of NATIE_IDS) {
      // Jouw relaties kruipen langzaam terug naar neutraal zodra je ze uit het
      // oog verliest; vijanden hoeven niet voor eeuwig vijand te blijven.
      const v = speler.relatie[n];
      if (v > 1) speler.relatie[n] = Math.max(1, v - 0.4 * dagen);
      else if (v < -1) speler.relatie[n] = Math.min(-1, v + 0.4 * dagen);
    }
    // Af en toe een diplomatieke ruk in de wereldpolitiek die niet aan jou ligt.
    this.diploTimer = (this.diploTimer || 0) - dagen;
    if (this.diploTimer <= 0) {
      this.diploTimer = 90 + rng() * 200;
      const a = pick(rng, NATIE_IDS);
      let b = pick(rng, NATIE_IDS);
      if (b === a) b = NATIE_IDS[(NATIE_IDS.indexOf(a) + 1) % NATIE_IDS.length];
      if (!this.oorlogen) this.oorlogen = {};
      const sleutel = [a, b].sort().join('-');
      const oorlog = this.oorlogen[sleutel];
      if (oorlog !== undefined && Math.random() < 0.35) {
        delete this.oorlogen[sleutel];
        if (speler.natie === a) {
          speler.relatie[b] = clamp(speler.relatie[b] - 5, -100, 100); // bondgenoten varen mee
        }
        if (speler.natie === b) speler.relatie[a] = clamp(speler.relatie[a] - 5, -100, 100);
        for (const v of this.vloten) {
          if (v.natie === b && v.marine) v.natie = 'piraat'; // verweesde oorlogsvloot
        }
      } else {
        this.oorlogen[sleutel] = 1;
        // Word je vijand, dan merkt jouw eigen natie dat ook.
        if (speler.natie === a) speler.relatie[b] = clamp(speler.relatie[b] - 18, -100, 100);
        if (speler.natie === b) speler.relatie[a] = clamp(speler.relatie[a] - 18, -100, 100);
      }
    }
  }

  /**
   * Bonus op snelheid, roer en hoogte aan de wind. Twee bronnen: de niveaus die
   * de werf op het schip zet (`upgrades`) en de buitstukken van verslagen
   * legendes, die bij de kapitein horen en dus elk vlaggenschip volgen.
   */
  scheepsBonus(speler) {
    const schip = speler && speler.schepen && speler.schepen[0];
    if (!schip) return { zeil: 0, roer: 0, hoogte: 0 };
    const up = schip.upgrades || {};
    return {
      zeil: (up.zeilen || 0) * 0.04 + itemBonus(speler, 'snelheid'),
      roer: (up.roer || 0) * 0.05 + itemBonus(speler, 'wend'),
      hoogte: itemBonus(speler, 'hoogte'),
    };
  }

  vlotenTik(dt, speler) {
    const rng = this.rng;
    for (let i = this.vloten.length - 1; i >= 0; i--) {
      const v = this.vloten[i];
      v.leeftijd += dt;
      const type = SCHIP_INDEX[v.type];
      const dSpeler = dist(v.x, v.y, speler.x, speler.y);
      v.aggroKoeling = Math.max(0, (v.aggroKoeling || 0) - dt);

      // Wie jaagt er? Piraten en marineschepen alleen dichtbij, en alleen als
      // het de moeite waard lijkt (relatie + sterkte). Ze haken af als je ze
      // ver genoeg wegloopt of achter een kaap/eiland uit het zicht raakt.
      const vijandig = v.natie === 'piraat' || v.marine;
      const jaagBereik = 420;
      const zichtOpen = !this.#zichtGeblokkeerd(v.x, v.y, speler.x, speler.y);
      let jaagt = false;
      if (vijandig && dSpeler < jaagBereik && v.aggroKoeling <= 0) {
        if (v.jaagt) {
          // Eenmaal ingezet blijven ze jagen, maar niet oneindig.
          if (dSpeler > jaagBereik * 1.5 || !zichtOpen) {
            v.jaagt = false;
            v.aggroKoeling = 18 + rng() * 12;
          }
          jaagt = v.jaagt;
        } else {
          v.jaagt = zichtOpen && rng() < this.#jachtKans(v, speler);
          jaagt = v.jaagt;
        }
      } else {
        v.jaagt = false;
      }

      let doelX = v.doel.ankerX,
        doelY = v.doel.ankerY;
      if (jaagt) {
        doelX = speler.x;
        doelY = speler.y;
      } else if (!vijandig && dSpeler < 820) {
        // Kooplui en neutrale schepen mijden de speler ruim van tevoren.
        doelX = v.x + (v.x - speler.x);
        doelY = v.y + (v.y - speler.y);
      }

      const recht = Math.atan2(doelY - v.y, doelX - v.x);
      const gewenst = this.#kruisKoers(v, recht, type, dt);
      const koers = this.#ontwijkLand(v, gewenst, type);
      const draai = type.wend * 0.75 * dt;
      const d = normAngle(koers - v.koers);
      v.koers = normAngle(v.koers + clamp(d, -draai, draai));

      const eff = zeilEfficiëntie(v.koers, this.windRichting, type.hoogte);
      v.snelheid = type.snelheid * eff * this.windKracht * 0.62;
      const nx = v.x + Math.cos(v.koers) * v.snelheid * dt;
      const ny = v.y + Math.sin(v.koers) * v.snelheid * dt;
      if (this.isVaren(nx, ny, v.type)) {
        v.x = nx;
        v.y = ny;
      } else {
        v.koers = normAngle(v.koers + 1.4 * dt);
      }

      // Aangekomen? Nieuw doel kiezen, of verdwijnen in de haven. Een beruchte
      // kapitein loopt nooit zomaar een haven binnen: die blijft varen tot je
      // hem verslaat.
      if (dist(v.x, v.y, v.doel.ankerX, v.doel.ankerY) < 45) {
        if (!v.legende && this.rng() < 0.4 && dSpeler > 1400) {
          this.vloten.splice(i, 1);
          this.spawnVloot(false);
          continue;
        }
        v.doel = pick(this.rng, this.steden.filter((s) => s !== v.doel));
      }
    }
    // Voorraad aanvullen zodat de zee levendig blijft maar niet overvol raakt.
    while (this.vloten.length < DOEL_VLOTEN) this.spawnVloot(true);
    this.#legendeTik(dt, speler);
  }

  /**
   * Houdt hoogstens één beruchte kapitein tegelijk op zee. Ze verschijnen niet
   * meteen: het duurt even voordat er weer een naam op de kaart staat, zodat de
   * zee niet in een parade van legendes verandert.
   */
  #legendeTik(dt, speler) {
    if (!speler || !speler.legendes) return;
    this.legendeKoeling = (this.legendeKoeling || 0) - dt;
    if (this.legendeKoeling > 0) return;
    this.legendeKoeling = 60 + this.rng() * 90;
    if (this.vloten.some((v) => v.legende)) return;
    // Ze komen op volgorde van naam: pas wie genoeg roem heeft, is het
    // opzoeken waard. Zo loop je Dolle Jack tegen het lijf lang voordat het
    // linieschip van de Kraai zich laat zien.
    const vrij = LEGENDES.filter((l) => {
      if (speler.legendes[l.id] && speler.legendes[l.id].verslagen) return false;
      // De schurk vaart niet rond zolang je niet weet dat hij bestaat.
      if (l.schurk && !(speler.familie && speler.familie.spoor)) return false;
      return (speler.roem || 0) >= l.roem;
    });
    if (!vrij.length) return;
    // Niet elke gelegenheid grijpen: een legende hoort zeldzaam te blijven.
    if (this.rng() > 0.4) return;
    this.spawnVloot(false, null, pick(this.rng, vrij).id);
  }

  /** De vloot van de beruchte kapitein die nu op zee is, of null. */
  legendeOpZee() {
    return this.vloten.find((v) => v.legende) || null;
  }

  // --- Schatten -----------------------------------------------------------
  // Zie SCHAT_ZICHT onderaan dit bestand: dat is tegelijk de eis bij het
  // plaatsen en de afstand waarop de stuurman de kust herkent.

  /**
   * Legt een schat neer: een punt op land, vlak achter de kust, met drie
   * herkenningspunten eromheen. Alles komt uit het wereldzaadje plus het
   * volgnummer, zodat dezelfde save altijd dezelfde schat oplevert en er in de
   * opslag niets meer hoeft dan dat nummer.
   */
  plaatsSchat(nummer = 0) {
    const rng = makeRng(this.seed * 7919 + nummer * 104729 + 17);
    const regio = pick(rng, SCHATREGIOS);

    // Een plek zoeken die op land ligt én waar een schip echt bij kan komen.
    // Niet "vlak bij niet-land" — een binnenmeertje of een rif telt niet: het
    // spel biedt de tocht aan land pas aan als je binnen SCHAT_ZICHT vaart, dus
    // die afstand moet hier gegarandeerd worden en niet gehoopt.
    let punt = null;
    for (let poging = 0; poging < 900 && !punt; poging++) {
      const x = projX(rnd(rng, regio.lon[0], regio.lon[1]));
      const y = projY(rnd(rng, regio.lat[0], regio.lat[1]));
      if (!this.isLand(x, y)) continue;
      const [wx, wy] = this.dichtstbijVaren(x, y, 'sloep', SCHAT_ZICHT);
      if (dist(wx, wy, x, y) <= SCHAT_ZICHT * 0.8) punt = { x, y };
    }
    // Geen bereikbaar strandje in deze streek? Dan valt de schat terug op de
    // rede van een willekeurige stad — daar kom je in elk geval altijd.
    if (!punt) {
      const stad = pick(rng, this.steden);
      punt = { x: stad.ankerX, y: stad.ankerY };
    }

    // Drie herkenningspunten in een ruwe kring om het kruis heen; ze staan op
    // vaste hoeken zodat de prent en het spoor over dezelfde plattegrond gaan.
    const soorten = HERKENNINGSPUNTEN.slice();
    const punten = [];
    const start = rnd(rng, 0, TAU);
    for (let i = 0; i < 3; i++) {
      const soort = soorten.splice(Math.floor(rng() * soorten.length), 1)[0];
      const hoek = start + (i / 3) * TAU + rnd(rng, -0.35, 0.35);
      const afstand = rnd(rng, 90, 190);
      punten.push({
        id: soort.id,
        x: punt.x + Math.cos(hoek) * afstand,
        y: punt.y + Math.sin(hoek) * afstand,
      });
    }

    return {
      nummer,
      x: punt.x,
      y: punt.y,
      regio: regio.naam,
      punten,
      // Welke kwadranten van het perkament je al hebt. Volgorde van onthullen
      // wordt bij het kopen bepaald.
      kwadranten: [false, false, false, false],
    };
  }

  /**
   * Hoe graag een vloot de speler opzoekt: piraten zijn gretig, marineschepen
   * hangen af van de relatie, en zwakkere schepen mijden een machtigere kapitein.
   */
  #jachtKans(v, speler) {
    // Een beruchte kapitein wijkt voor niemand en zoekt je altijd op.
    if (v.legende) return 1;
    const vType = SCHIP_INDEX[v.type];
    const eigen = speler.schepen && speler.schepen[0];
    const eType = SCHIP_INDEX[eigen ? eigen.type : 'sloep'];
    const sterkteV = vType.snelheid * (1 + (vType.kanonnen + vType.bemanning / 6) / 60);
    const sterkteS = eType.snelheid * (1 + ((eigen ? eigen.kanonnen : 0) + speler.bemanning / 6) / 60);

    let kans;
    if (v.natie === 'piraat') {
      // Piraten zijn gretig, maar laten sterke tegenstanders liever gaan.
      kans = 0.55;
    } else {
      // Marineschepen handelen op politieke verhoudingen.
      const rel = speler.relatie ? speler.relatie[v.natie] : 0;
      if (rel <= -25) kans = 0.45;
      else if (rel < 15) kans = 0.08;
      else kans = 0; // Vriendelijke naties laten je met rust.
    }
    // Sterkteverschil is doorslaggevend: zwakke schepen jagen zelden op een sterkere.
    if (sterkteV < sterkteS * 0.65) kans *= 0.15;
    else if (sterkteV < sterkteS * 0.95) kans *= 0.6;
    else if (sterkteV > sterkteS * 1.5) kans = Math.min(1, kans + 0.12);
    // Bekendheid trekt piraten aan, maar afschrikt kleine bendejes.
    const roem = speler.roem || 0;
    if (v.natie === 'piraat') {
      if (sterkteV < sterkteS * 0.85) {
        kans *= clamp(1.1 - roem / 800, 0.35, 1.1);
      } else {
        kans *= clamp(0.8 + roem / 800, 0.8, 1.35);
      }
    }
    return clamp(kans, 0, 1);
  }

  /** Kijkt of een rechte lijn tussen twee punten over land loopt. */
  #zichtGeblokkeerd(x1, y1, x2, y2) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const n = Math.max(3, Math.round(Math.hypot(dx, dy) / 60));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.isLand(x1 + dx * t, y1 + dy * t)) return true;
    }
    return false;
  }

  /**
   * Koers naar een doel dat te hoog aan de wind ligt. Er recht op af sturen
   * laat het schip doodlopen in de dode hoek, dus valt het af tot net buiten
   * die hoek en kruist het op: een slag over stuurboord, dan een over bakboord.
   * Zonder dit zouden vloten waarvan de haven in de wind ligt minutenlang
   * stilliggen, en dat is precies wat je van een levende zee niet wilt zien.
   */
  #kruisKoers(v, gewenst, type, dt) {
    // Iets ruimer dan de dode hoek zelf: op de rand daarvan loopt een schip nog
    // nauwelijks.
    const grens = Math.PI - dodeHoek(type.hoogte) * 1.15;
    const a = normAngle(gewenst - this.windRichting);
    // De teller loopt alleen door terwijl er gekruist wordt, en wordt hier
    // bewust niet teruggezet: een doel dat precies op de grens van de dode hoek
    // ligt zou anders elk beeld een nieuwe slag afdwingen, en dan gooit het
    // schip het roer om zonder ooit ergens te komen.
    if (Math.abs(a) <= grens) return gewenst;
    v.slagTimer = (v.slagTimer || 0) - dt;
    if (v.slagTimer <= 0) {
      v.slagTimer = rnd(this.rng, 22, 40);
      // Overstag, of — als dit de eerste slag is — de kant kiezen waar het doel
      // al ligt.
      if (v.slag) v.slag = -v.slag;
      else v.slag = a >= 0 ? 1 : -1;
    }
    return normAngle(this.windRichting + grens * v.slag);
  }

  /** Simpele koersvoorspelling: kijk vooruit en wijk uit voor land. */
  #ontwijkLand(v, gewenst, type) {
    const vooruit = 150;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2]) {
      const a = gewenst + off;
      let vrij = true;
      for (let t = 40; t <= vooruit; t += 35) {
        // Ook met de romp meegerekend, zodat een zwaar schip niet pal langs de
        // kust probeert te laveren wat voor de romp te krap is.
        const px = v.x + Math.cos(a) * t,
          py = v.y + Math.sin(a) * t;
        if (this.isLand(px, py) || (t >= vooruit && !this.isVaren(px, py, v.type))) {
          vrij = false;
          break;
        }
      }
      if (vrij) return a;
    }
    return gewenst + Math.PI;
  }
}

/**
 * Stormprofiel. Een cel is geen egale klodder ellende maar een ring om een
 * kern: op de flank duwt de wind je vooruit, in de kern breekt hij je. Alles
 * hieronder is een fractie van `nabij` — 0 aan de buitenrand van de cel, 1 in
 * het hart ervan.
 *
 * `HALO` is de zachte aanloop buiten de getekende wolk, `RUG_PIEK` waar de
 * rugwind het sterkst is en `KERN` waar het gevaar begint. Die laatste twee
 * liggen ver uit elkaar, want daar draait het om: de speler moet de goede band
 * kunnen kiezen zonder per ongeluk in de kern te belanden.
 */
const STORM_HALO = 150;
const STORM_RUG_PIEK = 0.5;
// De rugband is bewust smal: de vaartwinst hoort een keuze op één flank te
// zijn, geen permanente snelheidswind door de halve cel. Een brede band liet
// je vrijwel overal aangewakkerd zeilen; met deze breedte is de winstzone
// fysiek ruwweg een derde en de top flink lager.
const STORM_RUG_BREEDTE = 0.17;
export const STORM_KERN = 0.58;

/**
 * De dode hoek vanaf pal tegen de wind waarbinnen de zeilen gaan killen. Hoe
 * beter een schip aan de wind ligt, hoe smaller die is. Eén plek, want zowel de
 * zeilkromme als de kruiskoers van de vloten hangt eraan; die twee uit elkaar
 * laten lopen zou vloten laten mikken op een hoek waar ze stilvallen.
 */
export function dodeHoek(hoogte) {
  return lerp(0.78, 0.44, clamp(hoogte, 0, 1));
}

/** Hoe volgroeid een cel is (0..1): jong groeit nog, oud verlept alweer. */
export function stormRijpheid(cel) {
  return cel.leeftijd < 0.5
    ? lerp(0.3, 1, cel.leeftijd / 0.5)
    : lerp(1, 0.35, (cel.leeftijd - 0.5) / 0.5);
}

/**
 * Straal in wereldeenheden waarop een cel een gegeven diepte bereikt, of 0 als
 * hij daar niet aan toekomt. Hiermee tekent de kaartlaag exact de grenzen waar
 * het spel op rekent — een gevarenzone die ergens anders ligt dan hij eruitziet
 * is precies het soort oneerlijkheid dat we hier niet willen.
 */
export function stormStraalBij(cel, diepte) {
  const rijp = stormRijpheid(cel);
  if (rijp <= diepte) return 0;
  return (cel.straal + STORM_HALO) * (1 - diepte / rijp);
}

/**
 * Hoe goed een schip vaart ten opzichte van de wind.
 * `hoogte` is hoe dicht het schip aan de wind kan liggen (0..1).
 *
 * De kromme heeft drie kenmerken, en elk daarvan is er om iets te kunnen
 * stúren: een optimum op ruime wind (er valt een hoek te zoeken), een lichte
 * inzinking pal voor de wind (de voorste zeilen nemen de achterste de wind af)
 * en een dode hoek pal tegen de wind, waar de zeilen killen. Een vierkant
 * getuigd schip kan niet hoog aan de wind liggen; wie naar loef moet, kruist.
 */
export function zeilEfficiëntie(koers, windRichting, hoogte) {
  // Hoek tussen de vaarrichting en de richting waarheen de wind waait.
  // 0 = pal voor de wind, PI = pal tegen de wind in.
  const a = Math.abs(normAngle(koers - windRichting));
  const t = 0.5 + 0.5 * Math.cos(a);
  const basis = hoogte + (1 - hoogte) * t;
  // Ruime wind (ruim een halve radiaal van pal achter): de zeilen staan
  // gunstig schuin op de wind en het schip loopt op zijn best.
  const ruim = 1 + 0.18 * Math.exp(-Math.pow((a - 0.95) / 0.75, 2));
  // Pal voor de wind vallen de achterste zeilen in de luwte van de voorste.
  const luwte = 1 - 0.1 * Math.exp(-Math.pow(a / 0.5, 2));
  const kil = smooth(clamp((Math.PI - a) / dodeHoek(hoogte), 0, 1));
  // Kruisen moet lonen, maar pal tegen de wind mag geen stilstand zijn: wie zijn
  // haven in de wind ziet liggen en het niet doorheeft, moet nog wél vooruit
  // komen. Zes keer trager dan op zijn best is streng genoeg om je te laten
  // afvallen, zonder dat het spel op slot gaat.
  return clamp(basis * ruim * luwte * lerp(0.34, 1, kil), 0.15, 1.2);
}

export { SCHEPEN, SCHIP_INDEX };
