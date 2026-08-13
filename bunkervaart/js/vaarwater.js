// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De kaart: de ARA-regio (Amsterdam–Rotterdam–Antwerpen) op echte lengte- en
// breedtegraden. Anders dan een zeekaart is dit een *net van vaarwegen*: het
// vaarwater is een reeks corridors met een breedte en een diepte, en al het
// overige is land. Dat is precies hoe binnenvaart voelt — je vaart niet over
// een zee maar door een gang, en de kant is nooit ver weg.
//
// Eenheden: één wereldeenheid is één meter. Diepten in meters t.o.v. het
// reductievlak (LAT); het getij komt er in `getij.js` bovenop. Breedtes zijn de
// bevaarbare breedte van de vaargeul, niet de oever-tot-oeverbreedte.
import { dist, distToSegment, clamp } from './util.js';

// --- Projectie -------------------------------------------------------------

// Het kaartvenster. Ruim genoeg voor IJmuiden in het noorden, Antwerpen in het
// zuiden en een stuk Noordzee in het westen.
export const LON0 = 3.2,
  LON1 = 5.15,
  LAT0 = 51.15,
  LAT1 = 52.58;

/** Meters per breedtegraad. */
export const MPG = 111320;

/**
 * Op 51,85° noorderbreedte is een lengtegraad nog maar 62 % van een
 * breedtegraad. Zonder deze factor wordt de kaart horizontaal uitgerekt en
 * krijgt Nederland de verhoudingen van Ierland — in de Caraïben viel dat weg
 * (daar is de factor 0,95), hier niet.
 */
export const COS_LAT = Math.cos((51.85 * Math.PI) / 180);

export const projX = (lon) => (lon - LON0) * MPG * COS_LAT;
export const projY = (lat) => (LAT1 - lat) * MPG;
export const ontprojX = (x) => x / (MPG * COS_LAT) + LON0;
export const ontprojY = (y) => LAT1 - y / MPG;

export const WERELD_B = projX(LON1);
export const WERELD_H = projY(LAT0);

const P = (lon, lat) => [projX(lon), projY(lat)];

// --- De kustlijn -----------------------------------------------------------

/**
 * De Noordzeekust van boven IJmuiden tot Zeebrugge, van noord naar zuid. De
 * monden van de Nieuwe Waterweg, de Westerschelde en het Noordzeekanaal zitten
 * er *niet* in: die zijn vaarwegcorridors en worden apart gestempeld, zodat ze
 * netjes op de zee aansluiten.
 */
const KUST = [
  [4.60, 52.58], [4.58, 52.47], [4.53, 52.37], [4.46, 52.26], [4.38, 52.16],
  [4.28, 52.09], [4.19, 52.02], [4.12, 51.98],
  // Maasvlakte: aangeplempt land dat de zee in steekt.
  [4.02, 51.975], [3.965, 51.958], [3.985, 51.925], [4.055, 51.898],
  // Voorne, Goeree, Schouwen, de deltawerken.
  [4.02, 51.858], [3.925, 51.832], [3.84, 51.812], [3.74, 51.762],
  [3.68, 51.700], [3.66, 51.632], [3.58, 51.588], [3.44, 51.532],
  // Walcheren naar Vlissingen; de Scheldemond blijft open.
  [3.48, 51.478], [3.565, 51.442],
  // Zeeuws-Vlaanderen en de Belgische kust.
  [3.52, 51.398], [3.40, 51.378], [3.30, 51.352], [3.20, 51.338],
];

// --- De vaarwegen ----------------------------------------------------------

/**
 * Elke vaarweg is een as met een bevaarbare breedte en een gegarandeerde
 * diepte. `stroom` is de maximale getijstroom in m/s op springtij; kanalen
 * achter een sluis staan op 0. `zee` markeert vaarwater waar een zeeschip
 * thuishoort — daar is het druk met grote vaart.
 */
export const VAARWEGEN = [
  {
    id: 'maasmond', naam: 'Maasmond', breedte: 900, diepte: 17.5, stroom: 1.3, zee: true,
    pts: [[4.03, 52.005], [4.075, 51.995], [4.105, 51.985]],
  },
  {
    id: 'nieuwe_waterweg', naam: 'Nieuwe Waterweg', breedte: 600, diepte: 15.0, stroom: 1.5, zee: true,
    pts: [[4.105, 51.985], [4.155, 51.970], [4.225, 51.943], [4.285, 51.920], [4.340, 51.906]],
  },
  {
    id: 'nieuwe_maas', naam: 'Nieuwe Maas', breedte: 400, diepte: 10.5, stroom: 1.2, zee: true,
    pts: [[4.340, 51.906], [4.390, 51.902], [4.440, 51.903], [4.487, 51.909],
      [4.520, 51.906], [4.545, 51.905], [4.575, 51.897], [4.610, 51.888], [4.635, 51.892]],
  },
  {
    id: 'beerkanaal', naam: 'Beerkanaal', breedte: 450, diepte: 20.0, stroom: 0.5, zee: true,
    pts: [[4.005, 51.945], [4.020, 51.955], [4.038, 51.957]],
  },
  {
    id: 'calandkanaal', naam: 'Calandkanaal', breedte: 500, diepte: 16.0, stroom: 0.4, zee: true,
    pts: [[4.038, 51.957], [4.090, 51.952], [4.150, 51.940], [4.210, 51.918], [4.255, 51.898]],
  },
  {
    id: 'europoort', naam: 'Europoort — Dintelhaven', breedte: 260, diepte: 17.0, stroom: 0.2,
    pts: [[4.150, 51.940], [4.145, 51.928], [4.140, 51.916]],
  },
  {
    id: 'rozenburgsluis', naam: 'Rozenburgse sluis', breedte: 120, diepte: 6.0, stroom: 0,
    pts: [[4.255, 51.898], [4.250, 51.885], [4.243, 51.873]],
  },
  {
    id: 'hartelkanaal', naam: 'Hartelkanaal', breedte: 200, diepte: 6.5, stroom: 0.2,
    pts: [[4.052, 51.922], [4.120, 51.903], [4.180, 51.885], [4.243, 51.873],
      [4.290, 51.862], [4.315, 51.856], [4.345, 51.852]],
  },
  {
    id: 'oude_maas', naam: 'Oude Maas', breedte: 250, diepte: 9.0, stroom: 1.0,
    pts: [[4.340, 51.906], [4.327, 51.893], [4.325, 51.878], [4.335, 51.862],
      [4.345, 51.852], [4.382, 51.840], [4.432, 51.832], [4.500, 51.822],
      [4.560, 51.812], [4.620, 51.808], [4.660, 51.815]],
  },
  {
    id: 'botlek', naam: 'Botlek', breedte: 260, diepte: 12.0, stroom: 0.2,
    pts: [[4.326, 51.886], [4.310, 51.882], [4.296, 51.876]],
  },
  {
    id: 'pernis', naam: '1e Petroleumhaven — Pernis', breedte: 220, diepte: 12.5, stroom: 0.2,
    pts: [[4.390, 51.902], [4.386, 51.890], [4.380, 51.881]],
  },
  {
    id: 'waalhaven', naam: 'Waalhaven', breedte: 320, diepte: 11.0, stroom: 0.2,
    pts: [[4.428, 51.9025], [4.420, 51.890], [4.412, 51.879]],
  },
  {
    id: 'noord', naam: 'De Noord', breedte: 180, diepte: 6.0, stroom: 0.6,
    pts: [[4.660, 51.818], [4.662, 51.845], [4.655, 51.865], [4.645, 51.880], [4.635, 51.892]],
  },
  {
    id: 'dordtsche_kil', naam: 'Dordtsche Kil', breedte: 200, diepte: 7.0, stroom: 0.8,
    pts: [[4.660, 51.815], [4.645, 51.782], [4.632, 51.755], [4.624, 51.730], [4.620, 51.703]],
  },
  {
    id: 'hollandsch_diep', naam: 'Hollandsch Diep', breedte: 900, diepte: 8.0, stroom: 0.5,
    pts: [[4.700, 51.700], [4.620, 51.703], [4.540, 51.697], [4.470, 51.689], [4.422, 51.684]],
  },
  {
    id: 'volkerak', naam: 'Volkerak', breedte: 400, diepte: 6.5, stroom: 0,
    pts: [[4.422, 51.684], [4.382, 51.665], [4.330, 51.648], [4.292, 51.628], [4.276, 51.600]],
  },
  {
    id: 'schelde_rijn', naam: 'Schelde-Rijnverbinding', breedte: 200, diepte: 6.5, stroom: 0,
    pts: [[4.276, 51.600], [4.270, 51.560], [4.264, 51.510], [4.254, 51.470],
      [4.246, 51.443], [4.240, 51.410], [4.246, 51.380], [4.262, 51.358], [4.288, 51.352]],
  },
  {
    id: 'westerschelde', naam: 'Westerschelde', breedte: 800, diepte: 14.5, stroom: 1.6, zee: true,
    pts: [[3.50, 51.448], [3.62, 51.418], [3.72, 51.388], [3.83, 51.348],
      [3.92, 51.372], [4.00, 51.412], [4.095, 51.412], [4.180, 51.395],
      [4.238, 51.372], [4.288, 51.352]],
  },
  {
    id: 'schelde_antwerpen', naam: 'Schelde — Antwerpen', breedte: 400, diepte: 13.5, stroom: 1.4, zee: true,
    pts: [[4.288, 51.352], [4.305, 51.322], [4.325, 51.295], [4.360, 51.262], [4.395, 51.238]],
  },
  {
    id: 'antwerpen_dokken', naam: 'Antwerpse dokken', breedte: 220, diepte: 15.0, stroom: 0,
    pts: [[4.288, 51.352], [4.305, 51.336], [4.322, 51.312], [4.335, 51.284]],
  },
  {
    id: 'kustroute', naam: 'Kustroute Noordzee', breedte: 1400, diepte: 22.0, stroom: 0.5, zee: true,
    pts: [[4.030, 52.005], [4.050, 52.100], [4.150, 52.250], [4.350, 52.400],
      [4.500, 52.455], [4.560, 52.462]],
  },
  {
    id: 'noordzeekanaal', naam: 'Noordzeekanaal', breedte: 270, diepte: 15.0, stroom: 0,
    pts: [[4.560, 52.462], [4.620, 52.460], [4.680, 52.457], [4.740, 52.448],
      [4.800, 52.430], [4.850, 52.412], [4.890, 52.400]],
  },
  {
    id: 'amsterdam_havens', naam: 'Petroleumhaven Amsterdam', breedte: 200, diepte: 13.0, stroom: 0,
    pts: [[4.822, 52.422], [4.812, 52.412], [4.804, 52.402]],
  },
];

export const VAARWEG_INDEX = Object.fromEntries(VAARWEGEN.map((v) => [v.id, v]));

// --- Sluizen ---------------------------------------------------------------

/**
 * `cyclus` is de schuttijd in minuten (binnenvaren, nivelleren, uitvaren);
 * `kolken` het aantal kolken dat parallel draait. Samen bepalen ze hoe hard een
 * wachtrij oploopt. `zeevaart` betekent dat de grote vaart voorgaat — daar sta
 * je als bunkerboot achteraan.
 */
export const SLUIZEN = [
  {
    id: 'ijmuiden', naam: 'Zeesluis IJmuiden', lon: 4.565, lat: 52.462,
    vaarweg: 'noordzeekanaal', cyclus: 55, kolken: 2, zeevaart: true, diepte: 17.5,
  },
  {
    id: 'volkerak', naam: 'Volkeraksluizen', lon: 4.422, lat: 51.684,
    vaarweg: 'volkerak', cyclus: 35, kolken: 3, zeevaart: false, diepte: 6.5,
  },
  {
    id: 'kreekrak', naam: 'Kreekraksluizen', lon: 4.246, lat: 51.443,
    vaarweg: 'schelde_rijn', cyclus: 30, kolken: 2, zeevaart: false, diepte: 6.5,
  },
  {
    id: 'hartel', naam: 'Hartelsluis', lon: 4.315, lat: 51.856,
    vaarweg: 'hartelkanaal', cyclus: 22, kolken: 1, zeevaart: false, diepte: 6.0,
  },
  {
    id: 'rozenburg', naam: 'Rozenburgse sluis', lon: 4.250, lat: 51.885,
    vaarweg: 'rozenburgsluis', cyclus: 18, kolken: 1, zeevaart: false, diepte: 6.0,
  },
  {
    id: 'zandvliet', naam: 'Zandvlietsluis', lon: 4.292, lat: 51.348,
    vaarweg: 'antwerpen_dokken', cyclus: 50, kolken: 2, zeevaart: true, diepte: 15.0,
  },
];

export const SLUIS_INDEX = Object.fromEntries(SLUIZEN.map((s) => [s.id, s]));

// --- Bruggen ---------------------------------------------------------------

/**
 * `hoogte` is de doorvaarthoogte in meters bij gesloten brug en gemiddeld
 * hoogwater. `beweegbaar` betekent dat hij opent — met wachttijd. Een vaste
 * brug is een harde grens: past je opbouw er niet onder, dan vaar je om.
 */
export const BRUGGEN = [
  { id: 'botlekbrug', naam: 'Botlekbrug', lon: 4.325, lat: 51.878, vaarweg: 'oude_maas', hoogte: 6.4, beweegbaar: true },
  { id: 'spijkenisserbrug', naam: 'Spijkenisserbrug', lon: 4.345, lat: 51.852, vaarweg: 'oude_maas', hoogte: 10.6, beweegbaar: true },
  { id: 'brienenoord', naam: 'Van Brienenoordbrug', lon: 4.545, lat: 51.905, vaarweg: 'nieuwe_maas', hoogte: 24.0, beweegbaar: false },
  { id: 'erasmusbrug', naam: 'Erasmusbrug', lon: 4.487, lat: 51.909, vaarweg: 'nieuwe_maas', hoogte: 12.5, beweegbaar: true },
  { id: 'moerdijkbrug', naam: 'Moerdijkbrug', lon: 4.660, lat: 51.700, vaarweg: 'hollandsch_diep', hoogte: 12.4, beweegbaar: false },
  { id: 'alblasserdam', naam: 'Brug Alblasserdam', lon: 4.655, lat: 51.865, vaarweg: 'noord', hoogte: 12.0, beweegbaar: false },
];

// --- Ligplaatsen: terminals en bunkerplekken -------------------------------

/**
 * `soort` bepaalt wat je er kunt: `terminal` laadt jou vol, `ligplaats` is waar
 * een klantschip ligt, `rede` is een ankergebied buitengaats — daar is deining,
 * en deining is in dit spel geen decor maar een rekenpost.
 */
export const LIGPLAATSEN = [
  // Rotterdam / Rijnmond
  { id: 'vopak_europoort', naam: 'Vopak Europoort', soort: 'terminal', lon: 4.146, lat: 51.930, haven: 'Rotterdam' },
  { id: 'maasvlakte_oil', naam: 'Maasvlakte Olieterminal', soort: 'terminal', lon: 4.012, lat: 51.951, haven: 'Rotterdam' },
  { id: 'pernis_raffinaderij', naam: 'Raffinaderij Pernis', soort: 'terminal', lon: 4.385, lat: 51.888, haven: 'Rotterdam' },
  { id: 'botlek_tank', naam: 'Botlek Tankopslag', soort: 'terminal', lon: 4.310, lat: 51.882, haven: 'Rotterdam' },
  { id: 'amazonehaven', naam: 'Amazonehaven', soort: 'ligplaats', lon: 4.008, lat: 51.948, haven: 'Rotterdam' },
  { id: 'euromax', naam: 'Euromax Terminal', soort: 'ligplaats', lon: 4.030, lat: 51.957, haven: 'Rotterdam' },
  { id: 'dintelhaven', naam: 'Dintelhaven', soort: 'ligplaats', lon: 4.142, lat: 51.920, haven: 'Rotterdam' },
  { id: 'botlek_kade', naam: 'Botlek — Chemiekade', soort: 'ligplaats', lon: 4.300, lat: 51.877, haven: 'Rotterdam' },
  { id: 'waalhaven_kade', naam: 'Waalhaven Zuid', soort: 'ligplaats', lon: 4.414, lat: 51.880, haven: 'Rotterdam' },
  { id: 'vlaardingen', naam: 'Vlaardingen — Kade 12', soort: 'ligplaats', lon: 4.352, lat: 51.905, haven: 'Rotterdam' },
  { id: 'maasvlakte_rede', naam: 'Maasvlakte Rede', soort: 'rede', lon: 4.045, lat: 52.000, haven: 'Rotterdam' },
  // Amsterdam
  { id: 'amsterdam_terminal', naam: 'Petroleumhaven Amsterdam', soort: 'terminal', lon: 4.818, lat: 52.418, haven: 'Amsterdam' },
  { id: 'amsterdam_kade', naam: 'Amerikahaven', soort: 'ligplaats', lon: 4.806, lat: 52.404, haven: 'Amsterdam' },
  { id: 'ijmuiden_rede', naam: 'IJmuiden Rede', soort: 'rede', lon: 4.500, lat: 52.470, haven: 'Amsterdam' },
  // Antwerpen
  { id: 'antwerpen_terminal', naam: 'Antwerpen Tankterminal', soort: 'terminal', lon: 4.312, lat: 51.326, haven: 'Antwerpen' },
  { id: 'antwerpen_kade', naam: 'Deurganckdok', soort: 'ligplaats', lon: 4.336, lat: 51.283, haven: 'Antwerpen' },
  { id: 'antwerpen_stroom', naam: 'Antwerpen — op stroom', soort: 'rede', lon: 4.362, lat: 51.259, haven: 'Antwerpen' },
  // Zeeland
  { id: 'vlissingen_rede', naam: 'Vlissingen Rede', soort: 'rede', lon: 3.560, lat: 51.436, haven: 'Vlissingen' },
  { id: 'terneuzen_kade', naam: 'Terneuzen — Zeevaartkade', soort: 'ligplaats', lon: 3.828, lat: 51.352, haven: 'Vlissingen' },
];

export const LIGPLAATS_INDEX = Object.fromEntries(LIGPLAATSEN.map((l) => [l.id, l]));

// --- Het vaarwater als object ----------------------------------------------

const RASTER = 3000; // meters per cel van het zoekrooster

/**
 * Alles wat met de kaartmeetkunde te maken heeft: waar is water, hoe diep,
 * welke kant staat de stroom op, en waar ligt de as van de vaargeul.
 *
 * De kaart is *statisch* — hij volgt niet uit een wereldzaadje maar uit echte
 * coördinaten. Dat is het grote verschil met Zeeroverij: daar was elke wereld
 * anders, hier is de ARA-regio elke keer dezelfde, want dat is nu juist wat je
 * leert kennen.
 */
export class Vaarwater {
  constructor() {
    // De kaartmaat als eigenschap, zodat wie het object heeft niet ook nog de
    // module hoeft te importeren om een verhouding uit te rekenen.
    this.wereldB = WERELD_B;
    this.wereldH = WERELD_H;
    this.kustPts = KUST.map(([lon, lat]) => P(lon, lat));

    // De Noordzee: de kustlijn, westwaarts afgesloten langs de kaartrand.
    this.zeePts = this.kustPts.concat([
      [projX(LON0), projY(LAT0)],
      [projX(LON0), projY(LAT1)],
    ]);
    this.zeePad = new Path2D();
    this.zeePad.moveTo(this.zeePts[0][0], this.zeePts[0][1]);
    for (let i = 1; i < this.zeePts.length; i++) {
      this.zeePad.lineTo(this.zeePts[i][0], this.zeePts[i][1]);
    }
    this.zeePad.closePath();

    // Elke vaarweg als lijst wereldpunten, met een Path2D om te strepen: een
    // corridor tekenen is een dikke lijn, geen polygoon. Dat scheelt niet
    // alleen werk, het houdt de geul ook overal even breed.
    this.wegen = VAARWEGEN.map((v) => {
      const pts = v.pts.map(([lon, lat]) => P(lon, lat));
      const pad = new Path2D();
      pad.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) pad.lineTo(pts[i][0], pts[i][1]);
      let lengte = 0;
      for (let i = 1; i < pts.length; i++) lengte += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      return { ...v, pts, pad, lengte, half: v.breedte / 2 };
    });
    this.wegIndex = Object.fromEntries(this.wegen.map((w) => [w.id, w]));

    this.sluizen = SLUIZEN.map((s) => ({ ...s, x: projX(s.lon), y: projY(s.lat) }));
    this.bruggen = BRUGGEN.map((b) => ({ ...b, x: projX(b.lon), y: projY(b.lat) }));
    this.ligplaatsen = LIGPLAATSEN.map((l) => ({ ...l, x: projX(l.lon), y: projY(l.lat) }));
    this.ligIndex = Object.fromEntries(this.ligplaatsen.map((l) => [l.id, l]));

    this.#bouwRooster();
    this.#bouwNet();
    this.#controleerLigplaatsen();
  }

  /**
   * Elke ligplaats moet in het vaarwater liggen. Ligt er één naast, dan is hij
   * onbereikbaar en loopt een order daarheen stil zonder dat er iets misgaat wat
   * je kunt zien — de vervelendste soort fout. Het is puur kaartgegeven, dus we
   * melden het bij het bouwen in plaats van er in de spellogica op te toetsen.
   */
  #controleerLigplaatsen() {
    const droog = this.ligplaatsen.filter((l) => !this.isWater(l.x, l.y));
    if (droog.length) {
      console.warn('Ligplaatsen buiten het vaarwater:', droog.map((l) => l.id).join(', '));
    }
  }

  /**
   * Grof zoekrooster: welke segmenten liggen in of vlak bij welke cel. Zonder
   * dit toetst elke dieptevraag alle ~150 segmenten; met dit rooster zijn het
   * er een handvol. Dezelfde afweging als het landmasker in Zeeroverij, maar
   * dan voor lijnen in plaats van vlakken.
   */
  #bouwRooster() {
    this.rw = Math.ceil(WERELD_B / RASTER) + 1;
    this.rh = Math.ceil(WERELD_H / RASTER) + 1;
    this.rooster = new Array(this.rw * this.rh);
    for (let wi = 0; wi < this.wegen.length; wi++) {
      const w = this.wegen[wi];
      for (let i = 1; i < w.pts.length; i++) {
        const [ax, ay] = w.pts[i - 1];
        const [bx, by] = w.pts[i];
        const marge = w.half + RASTER;
        const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - marge) / RASTER));
        const cx1 = Math.min(this.rw - 1, Math.floor((Math.max(ax, bx) + marge) / RASTER));
        const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - marge) / RASTER));
        const cy1 = Math.min(this.rh - 1, Math.floor((Math.max(ay, by) + marge) / RASTER));
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const k = cy * this.rw + cx;
            (this.rooster[k] || (this.rooster[k] = [])).push([wi, i]);
          }
        }
      }
    }
  }

  /**
   * Het vaarwegennet als graaf: knopen waar vaarwegen elkaar raken, plus de
   * sluizen en ligplaatsen. Het reisplan loopt hierover, en het verkeer ook.
   * Twee vaarwegen heten verbonden als een uiteinde van de een binnen een
   * halve geulbreedte van de ander ligt — dat is precies hoe de geometrie
   * hierboven bedoeld is.
   */
  #bouwNet() {
    this.knopen = [];
    const voegKnoop = (x, y, soort, ref) => {
      for (const k of this.knopen) {
        if (dist(k.x, k.y, x, y) < 400 && k.soort === soort) return k;
      }
      const k = { id: this.knopen.length, x, y, soort, ref, buren: [] };
      this.knopen.push(k);
      return k;
    };

    // Uiteinden en kruisingen.
    for (const w of this.wegen) {
      w.knoopA = voegKnoop(w.pts[0][0], w.pts[0][1], 'kruising', w.id);
      w.knoopB = voegKnoop(w.pts[w.pts.length - 1][0], w.pts[w.pts.length - 1][1], 'kruising', w.id);
      const kosten = w.lengte;
      w.knoopA.buren.push({ naar: w.knoopB.id, weg: w.id, kosten });
      w.knoopB.buren.push({ naar: w.knoopA.id, weg: w.id, kosten });
    }

    // Aftakkingen aanhechten. Een havenbekken als de Botlek of de Waalhaven
    // eindigt niet op het uiteinde van de rivier maar loopt er ergens halverwege
    // op uit — en met alleen uiteinde-op-uiteinde was zo'n bekken een eiland in
    // de graaf. Dat is precies wat het reisplan liet zeggen dat er geen route
    // was. Een uiteinde dat binnen de geul van een ándere vaarweg valt, is een
    // kruising, en zo hechten we hem hier ook aan.
    for (const w of this.wegen) {
      for (const eind of [w.knoopA, w.knoopB]) {
        for (const ander of this.wegen) {
          if (ander === w) continue;
          if (!this.#ligtIn(eind.x, eind.y, ander)) continue;
          for (const k of [ander.knoopA, ander.knoopB]) {
            if (!k || k.id === eind.id) continue;
            const d = dist(eind.x, eind.y, k.x, k.y);
            if (eind.buren.some((b) => b.naar === k.id)) continue;
            eind.buren.push({ naar: k.id, weg: ander.id, kosten: d });
            k.buren.push({ naar: eind.id, weg: ander.id, kosten: d });
          }
        }
      }
    }
  }

  /** Valt dit punt binnen de vaargeul van deze vaarweg? */
  #ligtIn(x, y, weg) {
    for (let i = 1; i < weg.pts.length; i++) {
      const [ax, ay] = weg.pts[i - 1];
      const [bx, by] = weg.pts[i];
      if (distToSegment(x, y, ax, ay, bx, by) <= weg.half) return true;
    }
    return false;
  }

  // --- Meetkunde -----------------------------------------------------------

  /** Ligt dit punt binnen de kaart? */
  binnen(x, y) {
    return x >= 0 && y >= 0 && x < WERELD_B && y < WERELD_H;
  }

  /**
   * De dichtstbijzijnde vaargeul-as: welke weg, hoe ver van de as, en welke
   * kant die as op wijst. Retourneert `null` buiten elk vaarwater.
   *
   * De richting is de raaklijn van het segment; daar volgt zowel de stroom uit
   * als het oevereffect, want beide werken langs de geul en niet in het wilde
   * weg.
   */
  as(x, y) {
    const cx = Math.floor(x / RASTER);
    const cy = Math.floor(y / RASTER);
    if (cx < 0 || cy < 0 || cx >= this.rw || cy >= this.rh) return null;
    const lijst = this.rooster[cy * this.rw + cx];
    if (!lijst) return null;
    let best = null;
    for (const [wi, i] of lijst) {
      const w = this.wegen[wi];
      const [ax, ay] = w.pts[i - 1];
      const [bx, by] = w.pts[i];
      const d = distToSegment(x, y, ax, ay, bx, by);
      if (d > w.half) continue;
      if (!best || d < best.afstand) {
        // `zijde` is +1 als het punt links van de vaarrichting ligt (de kant
        // waar `richting + π/2` heen wijst) en −1 rechts ervan. Het oevereffect
        // heeft dat nodig: zuiging trekt naar de *dichtstbijzijnde* kant, en
        // zonder teken weet je niet welke dat is.
        const kruis = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        best = {
          weg: w,
          afstand: d,
          richting: Math.atan2(by - ay, bx - ax),
          fractie: d / w.half,
          zijde: kruis >= 0 ? 1 : -1,
        };
      }
    }
    return best;
  }

  /** Ligt dit punt op de Noordzee? */
  isZee(x, y) {
    if (!this.binnen(x, y)) return false;
    const pts = this.zeePts;
    let in1 = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) in1 = !in1;
    }
    return in1;
  }

  /**
   * Waterdiepte op deze plek, in meters t.o.v. het reductievlak. `null` betekent
   * land. Naar de kant loopt de geul op: de laatste 30 % van de halve breedte
   * is talud, en daar zit precies het verschil tussen "ruim" en "aan de grond".
   */
  diepte(x, y) {
    const a = this.as(x, y);
    if (a) {
      const t = a.fractie;
      const talud = t < 0.7 ? 1 : 1 - ((t - 0.7) / 0.3) * 0.85;
      return a.weg.diepte * talud;
    }
    if (this.isZee(x, y)) {
      // Buitengaats loopt het snel dieper; vlak onder de kust een strandbank.
      const kust = this.afstandTotKust(x, y);
      return clamp(4 + kust / 900, 4, 32);
    }
    return null;
  }

  /** Ruwe afstand tot de kustlijn — genoeg voor het dieptebeloop op zee. */
  afstandTotKust(x, y) {
    let best = Infinity;
    const pts = this.kustPts;
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (d < best) best = d;
    }
    return best;
  }

  /** Is hier water — vaargeul of zee? */
  isWater(x, y) {
    return this.diepte(x, y) !== null;
  }

  /**
   * Kan een schip met deze diepgang hier liggen? Kielspeling telt mee: onder een
   * halve meter water onder de kiel wil je niet varen, en onder nul zit je vast.
   */
  kanVaren(x, y, diepgang, getijhoogte = 0) {
    const d = this.diepte(x, y);
    if (d === null) return false;
    return d + getijhoogte - diepgang > 0.3;
  }

  /** De dichtstbijzijnde sluis binnen `straal`, of null. */
  sluisOp(x, y, straal = 1200) {
    let best = null;
    for (const s of this.sluizen) {
      const d = dist(x, y, s.x, s.y);
      if (d < straal && (!best || d < best.afstand)) best = { sluis: s, afstand: d };
    }
    return best;
  }

  /** De dichtstbijzijnde ligplaats binnen `straal`, of null. */
  ligplaatsOp(x, y, straal = 700) {
    let best = null;
    for (const l of this.ligplaatsen) {
      const d = dist(x, y, l.x, l.y);
      if (d < straal && (!best || d < best.afstand)) best = { plaats: l, afstand: d };
    }
    return best;
  }

  /** De dichtstbijzijnde brug binnen `straal`, of null. */
  brugOp(x, y, straal = 900) {
    let best = null;
    for (const b of this.bruggen) {
      const d = dist(x, y, b.x, b.y);
      if (d < straal && (!best || d < best.afstand)) best = { brug: b, afstand: d };
    }
    return best;
  }

  /**
   * Zoekt vaarwater terug als iets buiten de geul is beland — bij het laden van
   * een oude save, of als een berekening ontspoort. Spiraalsgewijs, zodat het
   * dichtstbijzijnde water wint.
   */
  dichtstbijWater(x, y, maxR = 4000) {
    if (this.isWater(x, y)) return [x, y];
    for (let r = 200; r <= maxR; r += 200) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this.isWater(px, py)) return [px, py];
      }
    }
    // Als laatste redmiddel de Botlek: daar begint het spel ook.
    const l = this.ligIndex.botlek_tank;
    return [l.x, l.y];
  }

  /**
   * Kortste route over het vaarwegennet, als lijst van vaarweg-id's. Dijkstra
   * over de knopen; de lengte van een vaarweg is de kostprijs. Het reisplan
   * gebruikt dit om reistijd, sluizen en bruggen op te sommen.
   */
  route(vanX, vanY, naarX, naarY) {
    const start = this.#dichtsteKnoop(vanX, vanY);
    const eind = this.#dichtsteKnoop(naarX, naarY);
    if (!start || !eind) return null;
    const kosten = new Array(this.knopen.length).fill(Infinity);
    const via = new Array(this.knopen.length).fill(null);
    kosten[start.id] = 0;
    const open = new Set(this.knopen.map((k) => k.id));
    while (open.size) {
      let u = null;
      for (const id of open) if (u === null || kosten[id] < kosten[u]) u = id;
      if (u === null || kosten[u] === Infinity) break;
      open.delete(u);
      if (u === eind.id) break;
      for (const b of this.knopen[u].buren) {
        const nieuw = kosten[u] + b.kosten;
        if (nieuw < kosten[b.naar]) {
          kosten[b.naar] = nieuw;
          via[b.naar] = { van: u, weg: b.weg };
        }
      }
    }
    if (kosten[eind.id] === Infinity) return null;
    const wegen = [];
    let cur = eind.id;
    while (via[cur]) {
      wegen.unshift(via[cur].weg);
      cur = via[cur].van;
    }
    return { wegen, lengte: kosten[eind.id] };
  }

  #dichtsteKnoop(x, y) {
    let best = null;
    for (const k of this.knopen) {
      const d = dist(k.x, k.y, x, y);
      if (!best || d < best.d) best = { ...k, d };
    }
    return best;
  }

  /**
   * De sluizen en bruggen die op een route liggen, op volgorde. Het reisplan
   * telt hiermee zijn wachttijden op; zonder deze lijst is een reisplan een
   * belofte zonder dekking.
   */
  obstakelsOp(wegen) {
    const set = new Set(wegen);
    const uit = [];
    for (const s of this.sluizen) if (set.has(s.vaarweg)) uit.push({ soort: 'sluis', ...s });
    for (const b of this.bruggen) if (set.has(b.vaarweg)) uit.push({ soort: 'brug', ...b });
    return uit;
  }
}
