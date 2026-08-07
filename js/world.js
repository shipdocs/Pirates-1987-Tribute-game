// Opbouw van de Caribische wereldkaart: land, steden, economie, wind en vloten.
import { makeRng, rnd, rndInt, pick, clamp, lerp, pointInPoly, dist, TAU, normAngle } from './util.js';
import { STEDEN, WAREN, WAAR_INDEX, SOORT_ECONOMIE, NATIE_IDS, SCHEPEN, SCHIP_INDEX, KAPITEIN_NAMEN } from './data.js';

// Kaartprojectie: rechttoe-rechtaan, met echte graden als basis.
export const PPD = 92; // wereldeenheden per graad
export const LON0 = -98,
  LON1 = -58,
  LAT0 = 7.6,
  LAT1 = 31;
export const WORLD_W = (LON1 - LON0) * PPD;
export const WORLD_H = (LAT1 - LAT0) * PPD;

export const projX = (lon) => (lon - LON0) * PPD;
export const projY = (lat) => (LAT1 - lat) * PPD;
const P = (lon, lat) => [projX(lon), projY(lat)];

// --- Kustlijnen -----------------------------------------------------------

// Vasteland: Florida, Golfkust, Mexico, Yucatán, Midden-Amerika, Spanish Main.
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
  [-61.6, 9.2], [-60.6, 8.6], [-59.2, 8.3], [-58.0, 8.0], [-58.0, 7.4],
  [-98.4, 7.4], [-98.4, 31],
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

/** Kleinere eilanden als middelpunt + straal in graden. */
const EILANDJES = [
  [-77.4, 25.05, 0.16], [-73.3, 21.05, 0.42], [-72.82, 20.08, 0.16], [-73.05, 18.85, 0.3],
  [-81.25, 19.32, 0.15], [-80.05, 19.68, 0.08], [-86.9, 20.45, 0.15],
  [-64.75, 18.35, 0.26], [-63.05, 18.09, 0.15], [-63.24, 17.63, 0.08], [-62.97, 17.49, 0.09],
  [-62.73, 17.33, 0.13], [-62.6, 17.15, 0.08], [-61.79, 17.08, 0.15], [-61.79, 17.63, 0.12],
  [-62.19, 16.74, 0.09], [-61.6, 16.22, 0.26], [-61.35, 15.42, 0.18], [-61.02, 14.65, 0.2],
  [-60.97, 13.9, 0.14], [-61.19, 13.25, 0.13], [-61.68, 12.12, 0.13], [-59.55, 13.18, 0.15],
  [-60.7, 11.25, 0.13], [-61.05, 10.45, 0.4], [-63.95, 11.0, 0.24], [-68.95, 12.15, 0.22],
  [-70.0, 12.52, 0.15], [-68.3, 12.2, 0.17], [-81.37, 13.35, 0.1], [-81.7, 12.55, 0.1],
];

/** Kustlijn opdelen en licht verstoren zodat hij organisch oogt. */
function verruw(poly, rng, kracht, rondingen = 1) {
  let pts = poly;
  for (let r = 0; r < rondingen; r++) {
    const uit = [];
    for (let i = 0; i < pts.length; i++) {
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
    pts = uit;
    kracht *= 0.55;
  }
  return pts;
}

function maakEilandje(lon, lat, straal, rng) {
  const n = rndInt(rng, 9, 14);
  const pts = [];
  const rekX = rnd(rng, 0.7, 1.5);
  const rekY = rnd(rng, 0.7, 1.5);
  const draai = rnd(rng, 0, TAU);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(rng, -0.1, 0.1);
    const r = straal * rnd(rng, 0.62, 1.15);
    const x = Math.cos(a) * r * rekX,
      y = Math.sin(a) * r * rekY;
    pts.push([lon + x * Math.cos(draai) - y * Math.sin(draai), lat + x * Math.sin(draai) + y * Math.cos(draai)]);
  }
  return pts;
}

// --- Wereld ---------------------------------------------------------------

const RASTER = 8; // wereldeenheden per cel in het landmasker

export class Wereld {
  constructor(seed = 1337) {
    this.seed = seed;
    const rng = makeRng(seed);
    this.rng = rng;

    /** @type {{pts:number[][], path:Path2D, groot:boolean}[]} */
    this.land = [];
    const voegToe = (graden, ruw, groot) => {
      const verfijnd = verruw(graden, rng, ruw, groot ? 2 : 1);
      const pts = verfijnd.map(([lon, lat]) => P(lon, lat));
      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
      this.land.push({ pts, path, groot });
      return pts;
    };

    voegToe(VASTELAND, 0.06, true);
    voegToe(CUBA, 0.09, true);
    voegToe(HISPANIOLA, 0.09, true);
    voegToe(JAMAICA, 0.1, false);
    voegToe(PUERTO_RICO, 0.08, false);
    for (const b of BAHAMAS) voegToe(b, 0.12, false);
    for (const [lon, lat, r] of EILANDJES) voegToe(maakEilandje(lon, lat, r, rng), 0.08, false);

    this.#bouwMasker();
    this.#bouwSteden();

    // Wind: passaat uit het oosten, dus waaiend richting het westen.
    this.windRichting = Math.PI;
    this.windDoel = Math.PI;
    this.windKracht = 1;
    this.windTimer = 0;

    this.vloten = [];
    for (let i = 0; i < 34; i++) this.spawnVloot(true);

    this.tijd = 0;
  }

  // Grof rasterlandmasker voor snelle botsingscontrole.
  #bouwMasker() {
    this.mw = Math.ceil(WORLD_W / RASTER) + 1;
    this.mh = Math.ceil(WORLD_H / RASTER) + 1;
    this.masker = new Uint8Array(this.mw * this.mh);
    // Begrenzingsvak per polygoon zodat we niet alles hoeven te testen.
    const vakken = this.land.map((l) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of l.pts) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
      return { x0, y0, x1, y1 };
    });
    for (let cy = 0; cy < this.mh; cy++) {
      const wy = cy * RASTER;
      for (let cx = 0; cx < this.mw; cx++) {
        const wx = cx * RASTER;
        let land = 0;
        for (let i = 0; i < this.land.length; i++) {
          const v = vakken[i];
          if (wx < v.x0 || wx > v.x1 || wy < v.y0 || wy > v.y1) continue;
          if (pointInPoly(wx, wy, this.land[i].pts)) {
            land = 1;
            break;
          }
        }
        this.masker[cy * this.mw + cx] = land;
      }
    }
  }

  isLand(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true;
    const cx = Math.round(x / RASTER),
      cy = Math.round(y / RASTER);
    return this.masker[cy * this.mw + cx] === 1;
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
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = rnd(this.rng, 14, 40);
      // Passaatwind waait overwegend naar het westen, met flinke uitschieters.
      this.windDoel = Math.PI + rnd(this.rng, -0.75, 0.75);
      this.windKracht = rnd(this.rng, 0.72, 1.25);
    }
    const d = normAngle(this.windDoel - this.windRichting);
    this.windRichting = normAngle(this.windRichting + clamp(d, -0.25 * dt, 0.25 * dt));
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

  spawnVloot(overal = false, natie = null) {
    const rng = this.rng;
    natie = natie || pick(rng, NATIE_IDS);
    const havens = this.stedenVanNatie(natie);
    const isPiraat = !overal && rng() < 0.16;
    const start = havens.length ? pick(rng, havens) : pick(rng, this.steden);
    const doel = pick(rng, this.steden.filter((s) => s !== start));

    // Zwaardere schepen bij rijke naties, kleine snelle bij piraten.
    let kandidaten;
    if (isPiraat) kandidaten = ['sloep', 'pinas', 'bark', 'brigantijn', 'oorlogssloep'];
    else if (natie === 'spanje') kandidaten = ['koopvaarder', 'galjoen', 'grote_koopvaarder', 'oorlogsgaljoen', 'bark', 'fluit'];
    else kandidaten = ['sloep', 'bark', 'fluit', 'koopvaarder', 'brigantijn', 'vrachtfluit', 'fregat'];
    const type = SCHIP_INDEX[pick(rng, kandidaten)];

    let x = start.ankerX,
      y = start.ankerY;
    if (overal) {
      // Verspreid de beginvloot over open zee.
      for (let poging = 0; poging < 60; poging++) {
        const px = rnd(rng, 60, WORLD_W - 60),
          py = rnd(rng, 60, WORLD_H - 60);
        if (!this.isLand(px, py)) {
          x = px;
          y = py;
          break;
        }
      }
    }

    const marine = !isPiraat && rng() < 0.28;
    const vloot = {
      natie: isPiraat ? 'piraat' : natie,
      marine,
      type: type.id,
      naam: pick(rng, KAPITEIN_NAMEN),
      x,
      y,
      koers: rnd(rng, 0, TAU),
      snelheid: 0,
      doel,
      romp: type.romp,
      zeilen: 1,
      bemanning: Math.round(type.bemanning * rnd(rng, 0.45, 0.85)),
      kanonnen: Math.round(type.kanonnen * rnd(rng, 0.5, 1)),
      goud: Math.round(rnd(rng, 200, 2600) * (marine ? 0.5 : 1) * (type.ruim / 100)),
      lading: WAREN.map((w, i) =>
        isPiraat || marine ? rndInt(rng, 0, 12) : rndInt(rng, 0, Math.round(type.ruim / 7))
      ),
      gezien: false,
      leeftijd: 0,
    };
    this.vloten.push(vloot);
    return vloot;
  }

  vlotenTik(dt, speler) {
    for (let i = this.vloten.length - 1; i >= 0; i--) {
      const v = this.vloten[i];
      v.leeftijd += dt;
      const type = SCHIP_INDEX[v.type];

      // Piraten en marineschepen jagen; kooplui vluchten.
      let doelX = v.doel.ankerX,
        doelY = v.doel.ankerY;
      const dSpeler = dist(v.x, v.y, speler.x, speler.y);
      const jaagt = (v.natie === 'piraat' || v.marine) && dSpeler < 900;
      const vlucht = !jaagt && dSpeler < 520 && !v.marine;
      if (jaagt) {
        doelX = speler.x;
        doelY = speler.y;
      } else if (vlucht) {
        doelX = v.x + (v.x - speler.x);
        doelY = v.y + (v.y - speler.y);
      }

      const gewenst = Math.atan2(doelY - v.y, doelX - v.x);
      const koers = this.#ontwijkLand(v, gewenst);
      const draai = type.wend * 0.75 * dt;
      const d = normAngle(koers - v.koers);
      v.koers = normAngle(v.koers + clamp(d, -draai, draai));

      const eff = zeilEfficiëntie(v.koers, this.windRichting, type.hoogte);
      v.snelheid = type.snelheid * eff * this.windKracht * 0.62;
      const nx = v.x + Math.cos(v.koers) * v.snelheid * dt;
      const ny = v.y + Math.sin(v.koers) * v.snelheid * dt;
      if (!this.isLand(nx, ny)) {
        v.x = nx;
        v.y = ny;
      } else {
        v.koers = normAngle(v.koers + 1.4 * dt);
      }

      // Aangekomen? Nieuw doel kiezen, of verdwijnen in de haven.
      if (dist(v.x, v.y, v.doel.ankerX, v.doel.ankerY) < 45) {
        if (this.rng() < 0.4 && dSpeler > 1400) {
          this.vloten.splice(i, 1);
          this.spawnVloot(false);
          continue;
        }
        v.doel = pick(this.rng, this.steden.filter((s) => s !== v.doel));
      }
    }
    // Voorraad aanvullen zodat de zee nooit leeg raakt.
    while (this.vloten.length < 34) this.spawnVloot(true);
  }

  /** Simpele koersvoorspelling: kijk vooruit en wijk uit voor land. */
  #ontwijkLand(v, gewenst) {
    const vooruit = 150;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2]) {
      const a = gewenst + off;
      let vrij = true;
      for (let t = 40; t <= vooruit; t += 35) {
        if (this.isLand(v.x + Math.cos(a) * t, v.y + Math.sin(a) * t)) {
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
 * Hoe goed een schip vaart ten opzichte van de wind.
 * `hoogte` is hoe dicht het schip aan de wind kan liggen (0..1).
 */
export function zeilEfficiëntie(koers, windRichting, hoogte) {
  // Hoek tussen de vaarrichting en de richting waarheen de wind waait.
  const a = Math.abs(normAngle(koers - windRichting));
  // 0 = vlak voor de wind (snelst), PI = pal tegen de wind (traagst).
  const t = 0.5 + 0.5 * Math.cos(a);
  // Ruime wind is in de praktijk het snelst; een klein bultje halverwege.
  const bult = 1 + 0.12 * Math.sin(a) * Math.sin(a);
  return clamp((hoogte + (1 - hoogte) * t) * bult, 0.06, 1.15);
}

export { SCHEPEN, SCHIP_INDEX };
