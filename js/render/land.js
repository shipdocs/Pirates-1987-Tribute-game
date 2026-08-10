// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: landlagen, begroeiing, rivieren, kustsoorten,
// kusteffecten en kaartlijnen.
import { TAU, clamp, lerp, makeRng, sierTijd } from '../util.js';
import { PPD, WORLD_W, WORLD_H } from '../world.js';
import { offscreen, plaats } from '../sprite.js';
import { KAN_TRANSFORM_LEZEN, transformSchaal, ZON_X, ZON_Y } from './hulpjes.js';
import { landTegel, vlekTegel, schuimPatroon, LICHT_X, LICHT_Y, landLaag } from './patronen.js';

// --- Land -----------------------------------------------------------------

function bbox(l) {
  if (l._bb) return l._bb;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of l.pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  l._bb = { x0, y0, x1, y1 };
  return l._bb;
}

// De eilanden veranderen nooit. We tekenen ze daarom één keer op een buffer die
// wat groter is dan het scherm, en schuiven die mee; pas als de camera eruit
// loopt (of de zoom verandert) bouwen we hem opnieuw op. Dat scheelt negen
// dure tekengangen over een kustlijn van honderden punten, elk frame.
const LAND_MARGE = 160; // schermpixels speling rondom het beeld

function bouwLandLaag(wereld, cam, vw, vh, dpr) {
  const dichtheid = cam.zoom * dpr;
  const pw = Math.max(1, Math.ceil((vw + LAND_MARGE * 2) * dpr));
  const ph = Math.max(1, Math.ceil((vh + LAND_MARGE * 2) * dpr));

  if (!landLaag.canvas) landLaag.canvas = offscreen(pw, ph);
  if (landLaag.canvas.width !== pw || landLaag.canvas.height !== ph) {
    landLaag.canvas.width = pw;
    landLaag.canvas.height = ph;
  }

  landLaag.dichtheid = dichtheid;
  landLaag.pw = pw;
  landLaag.ph = ph;
  landLaag.w = pw / dichtheid;
  landLaag.h = ph / dichtheid;
  // Op hele bufferpixels uitlijnen, anders wordt het beeld onnodig zacht.
  landLaag.x0 = Math.floor((cam.x - landLaag.w / 2) * dichtheid) / dichtheid;
  landLaag.y0 = Math.floor((cam.y - landLaag.h / 2) * dichtheid) / dichtheid;
  landLaag.wereld = wereld;

  const g = landLaag.canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, pw, ph);
  g.setTransform(dichtheid, 0, 0, dichtheid, -landLaag.x0 * dichtheid, -landLaag.y0 * dichtheid);
  tekenEilanden(g, wereld, landLaag, cam.zoom);
  landLaag.geldig = true;
}

/** Begrenzingsvak van een bergrug, met wat lucht voor de breedte van de rug. */
function rugVak(rug) {
  if (rug._bb) return rug._bb;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of rug.pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const m = 40 * rug.hoog;
  rug._bb = { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  return rug._bb;
}

/**
 * Een bergrug als keten van toppen. Eén streep van gelijke dikte leest als een
 * omgevallen boomstam; een rij overlappende koppen die naar de uiteinden toe
 * uitdooft leest als gebergte. De koppen gaan in één pad, zodat de overlap bij
 * het vullen niet als donkere vlek doorschemert.
 */
function rugPaden(rug) {
  if (rug._paden) return rug._paden;
  const pts = rug.pts;
  const seg = [];
  let lengte = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    lengte += d;
  }
  const basis = 18 * rug.hoog;
  const n = Math.max(9, Math.round(lengte / (basis * 0.4)));

  // [verschuiving richting de zon, straalfactor] per laag: schaduwzijde,
  // gesteente, droge kam, en de toppen die het licht vangen.
  const lagen = [[-0.26, 1], [0, 0.9], [0.1, 0.58], [0.3, 0.26]];
  const paden = lagen.map(() => new Path2D());

  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let d = t * lengte,
      i = 0;
    while (i < seg.length - 1 && d > seg[i]) {
      d -= seg[i];
      i++;
    }
    const u = seg[i] ? clamp(d / seg[i], 0, 1) : 0;
    const x = lerp(pts[i][0], pts[i + 1][0], u);
    const y = lerp(pts[i][1], pts[i + 1][1], u);
    // Uitdovend naar de uiteinden, met een vaste rimpel zodat de kam niet als
    // een gladde worst oogt. Deterministisch: de kaart moet elke keer gelijk zijn.
    const taper = Math.sqrt(Math.sin(Math.PI * clamp(t, 0.04, 0.96)));
    const ruis = Math.abs((Math.sin(k * 12.9898 + rug.hoog * 78.233) * 43758.5453) % 1);
    const r = basis * taper * (0.68 + 0.55 * ruis);
    // Kammen kronkelen; een rechte lijn toppen verraadt de constructie.
    const zw = Math.sin(k * 2.4 + rug.hoog * 9.1) * basis * 0.22;
    const nx = i < seg.length && seg[i] ? -(pts[i + 1][1] - pts[i][1]) / seg[i] : 0;
    const ny = i < seg.length && seg[i] ? (pts[i + 1][0] - pts[i][0]) / seg[i] : 0;
    const px = x + nx * zw,
      py = y + ny * zw;
    for (let li = 0; li < lagen.length; li++) {
      const [verschuif, factor] = lagen[li];
      paden[li].moveTo(px + LICHT_X * r * verschuif + r * factor, py + LICHT_Y * r * verschuif);
      paden[li].arc(px + LICHT_X * r * verschuif, py + LICHT_Y * r * verschuif, r * factor, 0, TAU);
    }
  }
  rug._paden = paden;
  return paden;
}

// --- Begroeiing, rivieren en ontginning -----------------------------------
//
// Alles hieronder wordt op de gebufferde landlaag getekend, dus het kost niets
// per beeld — alleen bij een cameraverplaatsing die buiten de marge valt. Dat
// maakt het betaalbaar om het binnenland te vullen in plaats van het als vlakke
// hoogtebanden te laten liggen.

// Wereldeenheden per kandidaat-boomgroep. Het gaat om de verhouding met de
// kroongrootte hieronder: groepen die groot zijn ten opzichte van hun onderlinge
// afstand lezen als losse broccoli, kleine en dicht opeen als bos.
const BOOM_RASTER = 21;
// Emmerzijde van de ruimtelijke index. Zonder emmers zou een landmassa als het
// vasteland al zijn duizenden groepen per herbouw langslopen.
const BOOM_EMMER = 256;
// Hoe ver de kroonlaag van de kust vandaan blijft: strand en branding moeten
// vrij blijven, anders groeit het bos tot in het schuim.
const BOOM_KUSTMARGE = 15;

const BOOM_MASSA = ['#2b4d2b', '#33582e', '#3d6434'];

/**
 * Deterministische ruis (0..1) uit twee roostercoördinaten en een zaad.
 *
 * Een hash in plaats van `makeRng`, omdat je een hash mag overslaan. Bij een
 * doorlopende reeks moet je voor élke cel evenveel getallen trekken — ook voor
 * de tienduizenden zeecellen in het begrenzingsvak van het vasteland — anders
 * verschuift de hele begroeiing. Hiermee mag de goedkope landtoets vooropgaan.
 */
function ruis(ix, iy, zaad) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(zaad | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Kustsoorten ---------------------------------------------------------

const KUST_SOORTEN = ['strand', 'rots', 'mangrove'];

/** Kiest één kustsoort; brede banken zijn vaker zandig, steile eilanden rotsig. */
function kiesKustsoort(land, toeval) {
  let strand,
    rots;
  if (land.bank >= 1.6) {
    strand = 0.74;
    rots = 0.1;
  } else if (land.bank <= 0.75) {
    strand = 0.34;
    rots = 0.49;
  } else if (land.groot) {
    strand = 0.45;
    rots = 0.23;
  } else {
    strand = 0.48;
    rots = 0.34;
  }
  if (toeval < strand) return 'strand';
  if (toeval < strand + rots) return 'rots';
  return 'mangrove';
}

/**
 * Verdeelt één oever in lange, deterministische kustzones.
 *
 * We gebruiken een coördinaathash en niet `wereld.rng`: kustdecoratie mag de
 * volgorde van steden, vloten of andere spelinhoud nooit veranderen. Kleine
 * eilanden krijgen één gezicht; op grote eilanden wisselt het landschap pas
 * na enkele honderden wereldeenheden, dus nooit om de paar kartelige punten.
 */
function kustPadenVan(wereld, land, index) {
  if (land._kustPaden) return land._kustPaden;
  const pts = land.kustPts || land.pts;
  const segmenten = land.kustGesloten === false ? pts.length - 1 : pts.length;
  const lengtes = [];
  let totaal = 0;
  for (let i = 0; i < segmenten; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengtes.push(lengte);
    totaal += lengte;
  }

  const zoneAantal = Math.max(1, Math.round(totaal / (land.groot ? 390 : 280)));
  const zoneLengte = totaal / zoneAantal;
  const soorten = [];
  const zaad = (wereld.seed ^ 0x6d2b79f5 ^ Math.imul(index + 1, 1597334677)) >>> 0;
  for (let zone = 0; zone < zoneAantal; zone++) {
    let soort = kiesKustsoort(land, ruis(index + 17, zone + 31, zaad));
    // Twee gelijke buurvakken worden één onbedoeld reuzenvak. Geef het tweede
    // een ander karakter, maar laat de keuze nog steeds uit dezelfde hash komen.
    if (zone > 0 && soort === soorten[zone - 1] && zoneAantal > 2) {
      const stap = 1 + Math.floor(ruis(zone + 71, index + 43, zaad ^ 0x85ebca6b) * 2);
      soort = KUST_SOORTEN[(KUST_SOORTEN.indexOf(soort) + stap) % KUST_SOORTEN.length];
    }
    soorten.push(soort);
  }

  const paden = {
    strand: new Path2D(),
    rots: new Path2D(),
    mangrove: new Path2D(),
    rotsen: new Path2D(),
    soorten,
  };
  let afstand = 0,
    vorige = null;
  for (let i = 0; i < segmenten; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const midden = afstand + lengtes[i] / 2;
    const zone = Math.min(zoneAantal - 1, Math.floor(midden / zoneLengte));
    const soort = soorten[zone];
    const pad = paden[soort];
    if (soort !== vorige) pad.moveTo(a[0], a[1]);
    pad.lineTo(b[0], b[1]);

    // Los gesteente versterkt het verschil ook zonder kleur. Mangrove krijgt
    // juist géén reeks losse kronen: op afstand werd dat een kralenketting.
    // De plaatsing blijft stabiel wanneer de buffer of zoom verandert.
    const stap = 34;
    const eerste = Math.ceil(afstand / stap) * stap;
    if (soort === 'rots') {
      for (let d = eerste; d < afstand + lengtes[i]; d += stap) {
        const t = (d - afstand) / Math.max(1, lengtes[i]);
        const x = lerp(a[0], b[0], t),
          y = lerp(a[1], b[1], t);
        const dobbel = ruis(Math.round(d), index * 53 + zone, zaad);
        if (dobbel < 0.44) continue;
        const r = 2 + ruis(Math.round(d) + 19, index + zone * 7, zaad) * 2.4;
        paden.rotsen.moveTo(x + r, y);
        paden.rotsen.arc(x, y, r, 0, TAU);
      }
    }
    afstand += lengtes[i];
    vorige = soort;
  }
  land._kustPaden = paden;
  return paden;
}

/**
 * Boomgroepen van één landmassa, in emmers van BOOM_EMMER.
 *
 * Deterministisch uit het wereldzaad en de index van de landmassa: de kaart
 * moet er bij hetzelfde zaad elke keer hetzelfde uitzien, ook na herladen uit
 * een opslag die alleen het zaad bewaart.
 */
function bomenVan(wereld, l, index) {
  if (l._bomen) return l._bomen;
  const b = bbox(l);
  const zaad = ((wereld.seed ^ 0x9e3779b9) + index * 7919) >>> 0;
  const emmers = new Map();
  const nx = Math.ceil((b.x1 - b.x0) / BOOM_RASTER);
  const ny = Math.ceil((b.y1 - b.y0) / BOOM_RASTER);
  for (let iy = 0; iy < ny; iy++) {
    const cy = b.y0 + (iy + 0.5) * BOOM_RASTER;
    for (let ix = 0; ix < nx; ix++) {
      // Eerst de goedkoopste toets. Het begrenzingsvak van het vasteland beslaat
      // vrijwel de hele wereldkaart, dus verreweg de meeste cellen liggen in
      // zee; die mogen niet eerst een handvol dobbelstenen kosten. Vandaar ook
      // `ruis()` in plaats van een doorlopende reeks: een hash mag je overslaan,
      // een reeks niet zonder alles te verschuiven.
      const cx = b.x0 + (ix + 0.5) * BOOM_RASTER;
      if (!wereld.isLand(cx, cy)) continue;
      // De dichtheid varieert in het groot: dicht bos naast open savanne. Zonder
      // deze modulatie ligt er een gelijkmatig tapijt over het hele eiland, en
      // dan leest het als textuur in plaats van als landschap.
      const dicht =
        0.5 + 0.5 * Math.sin(cx * 0.0042 + cy * 0.0027) * Math.cos(cy * 0.0035 - cx * 0.0019);
      if (ruis(ix, iy, zaad + 3) < 0.1 + 0.52 * (1 - dicht)) continue;

      const x = cx + (ruis(ix, iy, zaad) - 0.5) * BOOM_RASTER * 0.76;
      const y = cy + (ruis(ix, iy, zaad + 1) - 0.5) * BOOM_RASTER * 0.76;
      if (!wereld.isLand(x, y)) continue;
      let vrij = true;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        if (!wereld.isLand(x + Math.cos(a) * BOOM_KUSTMARGE, y + Math.sin(a) * BOOM_KUSTMARGE)) {
          vrij = false;
          break;
        }
      }
      if (!vrij) continue;
      const maat = ruis(ix, iy, zaad + 4),
        tint = ruis(ix, iy, zaad + 5),
        rot = ruis(ix, iy, zaad + 6),
        plat = ruis(ix, iy, zaad + 7);
      const sleutel = `${Math.floor(x / BOOM_EMMER)},${Math.floor(y / BOOM_EMMER)}`;
      let emmer = emmers.get(sleutel);
      if (!emmer) emmers.set(sleutel, (emmer = []));
      emmer.push({
        x,
        y,
        r: 5.5 + maat * 6.5,
        tint: Math.floor(tint * BOOM_MASSA.length),
        // Draaiing en platheid maken van elke groep een eigen vorm. Zonder deze
        // twee is elke kroon dezelfde cirkel en ligt er een veld biljartballen
        // over het eiland.
        rot: rot * TAU,
        plat: 0.62 + plat * 0.3,
      });
    }
  }
  l._bomen = emmers;
  return emmers;
}

/**
 * De kroonlaag van één landmassa binnen het zichtbare vak.
 *
 * De groepen gaan per tint in één pad. Dat is niet alleen sneller (negen
 * vullingen in plaats van drieduizend), het voorkomt ook dat overlappende
 * kronen elkaar donkerder maken — precies dezelfde reden als bij `rugPaden`.
 */
function tekenBegroeiing(ctx, wereld, l, index, vak, zoom) {
  // Het aantal kronen in beeld groeit met het beeldóppervlak, dus met 1/zoom².
  // Twee keer uitzoomen is vier keer zoveel bomen van elk een kwart pixel: veel
  // duurder én minder te zien. Onder deze drempel nemen de hoogteband en de
  // vlekkenlaag het over.
  const zicht = clamp((zoom - 0.7) / 0.35, 0, 1);
  if (zicht <= 0.06) return;
  const emmers = bomenVan(wereld, l, index);
  if (!emmers.size) return;

  const schaduw = new Path2D();
  const massa = BOOM_MASSA.map(() => new Path2D());
  const licht = new Path2D();
  let aantal = 0;

  const e0 = Math.floor(vak.x0 / BOOM_EMMER),
    e1 = Math.floor((vak.x0 + vak.w) / BOOM_EMMER);
  const f0 = Math.floor(vak.y0 / BOOM_EMMER),
    f1 = Math.floor((vak.y0 + vak.h) / BOOM_EMMER);
  for (let f = f0; f <= f1; f++) {
    for (let e = e0; e <= e1; e++) {
      const emmer = emmers.get(`${e},${f}`);
      if (!emmer) continue;
      for (const t of emmer) {
        const r = t.r;
        schaduw.moveTo(t.x + ZON_X * 0.7 + r * 0.95, t.y + ZON_Y * 0.7);
        schaduw.ellipse(t.x + ZON_X * 0.7, t.y + ZON_Y * 0.7, r * 0.95, r * t.plat, t.rot, 0, TAU);
        // Twee overlappende ovalen per groep: de tweede breekt de gladde rand.
        // Ze zitten in hetzelfde pad, dus de overlap kleurt niet dubbel.
        const m = massa[t.tint];
        const ox = Math.cos(t.rot) * r * 0.34,
          oy = Math.sin(t.rot) * r * 0.34;
        m.moveTo(t.x + r * 0.95, t.y);
        m.ellipse(t.x, t.y, r * 0.95, r * t.plat, t.rot, 0, TAU);
        m.moveTo(t.x + ox + r * 0.6, t.y + oy);
        m.ellipse(t.x + ox, t.y + oy, r * 0.6, r * t.plat * 0.72, t.rot + 0.9, 0, TAU);
        licht.moveTo(t.x + LICHT_X * r * 0.36 + r * 0.34, t.y + LICHT_Y * r * 0.36);
        licht.ellipse(t.x + LICHT_X * r * 0.36, t.y + LICHT_Y * r * 0.36, r * 0.34, r * 0.26, t.rot, 0, TAU);
        aantal++;
      }
    }
  }
  if (!aantal) return;

  ctx.save();
  ctx.globalAlpha = zicht;
  ctx.fillStyle = 'rgba(14,30,16,0.4)';
  ctx.fill(schaduw);
  for (let i = 0; i < massa.length; i++) {
    ctx.fillStyle = BOOM_MASSA[i];
    ctx.fill(massa[i]);
  }
  ctx.fillStyle = 'rgba(150,186,110,0.2)';
  ctx.fill(licht);
  ctx.restore();
}

/**
 * Rivieren: van de bergruggen naar de dichtstbijzijnde kust.
 *
 * De richting wordt één keer gezocht door in twaalf richtingen te peilen waar
 * het water het dichtst bij ligt; daarna kronkelt de loop met een vast wiebelend
 * hoekje. Dat is genoeg om als rivier te lezen, en het kan niet dwars over een
 * eiland heen lopen omdat de loop stopt zodra hij water raakt.
 */
function rivierenVan(wereld) {
  if (wereld._rivieren) return wereld._rivieren;
  const rng = makeRng((wereld.seed ^ 0x51ee7) >>> 0);
  const uit = [];
  for (const rug of wereld.ruggen || []) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const t = rng() * (rug.pts.length - 1);
      const i = Math.min(rug.pts.length - 2, Math.floor(t));
      const u = t - i;
      const sx = lerp(rug.pts[i][0], rug.pts[i + 1][0], u);
      const sy = lerp(rug.pts[i][1], rug.pts[i + 1][1], u);
      if (!wereld.isLand(sx, sy)) continue;

      // Peil in welke richting de kust het dichtst bij ligt.
      let beste = 0,
        besteD = Infinity;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * TAU;
        for (let r = 40; r <= 900; r += 40) {
          if (!wereld.isLand(sx + Math.cos(a) * r, sy + Math.sin(a) * r)) {
            if (r < besteD) {
              besteD = r;
              beste = a;
            }
            break;
          }
        }
      }
      if (!Number.isFinite(besteD)) continue;

      const pts = [[sx, sy]];
      const slinger = 0.5 + rng() * 0.7; // eigen golflengte per rivier
      const zwaai = rng() * TAU;
      let x = sx,
        y = sy,
        a = beste;
      for (let stap = 0; stap < 46; stap++) {
        // Twee bronnen van kronkel: een trage slinger die de grote bochten
        // maakt en wat ruis voor de kleine. Alleen ruis geeft een trillende
        // rechte lijn, en dat is precies hoe het er eerst uitzag.
        a += Math.sin(stap * slinger * 0.5 + zwaai) * 0.3 + (rng() - 0.5) * 0.5;
        // Blijf naar de kust gericht: zonder deze terugkoppeling wandelt de
        // loop na twintig stappen in een cirkeltje het binnenland in. Zwak
        // genoeg dat de bochten blijven staan.
        a = a * 0.9 + beste * 0.1;
        x += Math.cos(a) * 15;
        y += Math.sin(a) * 15;
        pts.push([x, y]);
        if (!wereld.isLand(x, y)) break;
      }
      if (pts.length > 5) uit.push(pts);
    }
  }
  // Twee paden voor álle rivieren samen: een donkere oever en het water zelf.
  //
  // Dit was een lus van losse `stroke()`-aanroepen per segment, per gang, per
  // rivier — én dat alles nog eens per zichtbare landmassa, want het tekenen
  // gebeurt binnen de knip van elk eiland. Dat liep op tot ruim vijftienhonderd
  // tekenopdrachten per herbouw van de landlaag. Als gevulde omtrek zijn het er
  // twee, en omdat de breedte toch al naar de monding toe oploopt is een polygoon
  // hier sowieso de eerlijker vorm dan een lijn met dikte.
  wereld._rivierPaden = [1.9, 1].map((breedte) => oeverPad(uit, breedte));
  wereld._rivieren = uit;
  return uit;
}

/** Omtrek van een rivier: links en rechts uitgezet, breder naar de monding. */
function oeverPad(rivieren, factor) {
  const pad = new Path2D();
  for (const pts of rivieren) {
    const links = [];
    const rechts = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const halve = ((1.6 + 4.4 * (i / (pts.length - 1))) * factor) / 2;
      const nx = (-dy / len) * halve,
        ny = (dx / len) * halve;
      links.push([pts[i][0] + nx, pts[i][1] + ny]);
      rechts.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    pad.moveTo(links[0][0], links[0][1]);
    for (let i = 1; i < links.length; i++) pad.lineTo(links[i][0], links[i][1]);
    for (let i = rechts.length - 1; i >= 0; i--) pad.lineTo(rechts[i][0], rechts[i][1]);
    pad.closePath();
  }
  return pad;
}

/** De rivieren, geknipt op de landmassa waar ze doorheen lopen. */
function tekenRivieren(ctx, wereld) {
  rivierenVan(wereld);
  const kleuren = ['rgba(28,52,40,0.5)', 'rgba(74,124,136,0.72)'];
  for (let i = 0; i < wereld._rivierPaden.length; i++) {
    ctx.fillStyle = kleuren[i];
    ctx.fill(wereld._rivierPaden[i]);
  }
}

/**
 * Ontgonnen land rond een stad: akkers in een waaier en een pad naar de rede.
 * Dit is het goedkoopste middel om een nederzetting bewoond te laten lijken —
 * zonder akkers staat er een dorp middenin ongerept oerwoud.
 */
function tekenOntginning(ctx, wereld, stad) {
  const rng = makeRng((stad.id * 2654435761) >>> 0);
  const n = 3 + stad.grootte;
  const r0 = 12 + stad.grootte * 3;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = r0 + rng() * (26 + stad.grootte * 8);
    const px = stad.x + Math.cos(a) * d;
    const py = stad.y + Math.sin(a) * d;
    if (!wereld.isLand(px, py)) continue;
    const w = 14 + rng() * 20;
    const h = 9 + rng() * 13;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + rng() * 0.6);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(158,150,86,0.5)' : 'rgba(128,142,74,0.5)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(74,62,34,0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Het pad van de stad naar de rede: waar de sloepen aanlanden.
  if (stad.ankerX != null) {
    ctx.strokeStyle = 'rgba(150,128,84,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(stad.x, stad.y);
    ctx.lineTo(lerp(stad.x, stad.ankerX, 0.75), lerp(stad.y, stad.ankerY, 0.75));
    ctx.stroke();
  }
  ctx.restore();
}

/** Eén bergrug: schaduwzijde, kaal gesteente, droge kam, zonbeschenen top. */
function tekenRug(ctx, rug) {
  const paden = rugPaden(rug);
  const kleuren = [
    'rgba(20,38,22,0.42)',
    'rgba(94,97,60,0.8)',
    'rgba(132,124,86,0.72)',
    'rgba(230,226,190,0.5)',
  ];
  for (let i = 0; i < paden.length; i++) {
    ctx.fillStyle = kleuren[i];
    ctx.fill(paden[i]);
  }
}

/** Het eigenlijke tekenwerk, op de bufferlaag. */
function tekenEilanden(ctx, wereld, vak, zoom) {
  const zx0 = vak.x0,
    zx1 = vak.x0 + vak.w,
    zy0 = vak.y0,
    zy1 = vak.y0 + vak.h;

  // De index gaat mee: de begroeiing van een landmassa wordt eruit gezaaid, en
  // die moet bij hetzelfde wereldzaad altijd dezelfde zijn.
  const zichtbaar = [];
  for (let i = 0; i < wereld.land.length; i++) {
    const l = wereld.land[i];
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push([l, i]);
  }
  if (!zichtbaar.length) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Rif vlak voor de kust. De brede banken zitten in de dieptekaart; hier gaat
  // het om de scherpe rand waar het koraal in het zand overgaat. De bankfactor
  // van het eiland bepaalt hoe ver die rand uitloopt.
  // Warmer en aanzienlijk lichter aangezet dan voorheen: samen met de
  // dieptekaart en de no-go-gloed stapelden deze drie lagen tot een fel cyaan
  // aureool om elk eiland — koraal dat oplichtte als neon.
  for (const [w, kleur] of [
    [40, 'rgba(58,150,158,0.25)'],
    [22, 'rgba(104,192,178,0.26)'],
    [10, 'rgba(170,232,200,0.32)'],
  ]) {
    ctx.strokeStyle = kleur;
    for (const [l] of zichtbaar) {
      ctx.lineWidth = w * (l.bank || 1);
      ctx.stroke(l.kust);
    }
  }

  // Slagschaduw voor diepte. De offset is in schermpixels, zodat de eilanden
  // bij elke zoomstand even hoog lijken.
  ctx.save();
  ctx.translate(5 / zoom, 7 / zoom);
  ctx.fillStyle = 'rgba(3,20,34,0.45)';
  for (const [l] of zichtbaar) ctx.fill(l.path);
  ctx.restore();

  // Hoogtetinten: donker, vochtig binnenland dat naar de kust toe opklaart.
  // De banden lopen vanaf de échte kust naar binnen — langs een kaartrand komt
  // dus vanzelf geen kustgroen te staan.
  const korrel = landTegel ? ctx.createPattern(landTegel, 'repeat') : null;
  const vlek = vlekTegel ? ctx.createPattern(vlekTegel, 'repeat') : null;
  for (const [l] of zichtbaar) {
    ctx.fillStyle = '#3a5c37';
    ctx.fill(l.path);
  }
  for (const [l, index] of zichtbaar) {
    ctx.save();
    ctx.clip(l.path);
    const b = bbox(l);
    const k = l.groot ? 1.7 : 1;
    // Minder spreiding dan voorheen (#41653a…#84b062). Die brede reeks maakte
    // van de vijf strepen vijf zichtbare terrassen; het blijft duidelijk dat de
    // kust lichter is dan het binnenland, maar het is geen hoogtekaart meer.
    for (const [w, kleur] of [
      [380, '#3f6038'],
      [220, '#476b3d'],
      [120, '#527844'],
      [62, '#5f8a4c'],
      [26, '#6f9c58'],
    ]) {
      ctx.lineWidth = w * k;
      ctx.strokeStyle = kleur;
      ctx.stroke(l.kust);
    }

    // Een patroonvulling over het begrenzingsvak van de landmassa kost het
    // vasteland bijna de hele wereldkaart, ook als er maar een strook van in
    // beeld staat. De knip laat alleen zien wat zichtbaar is; het vak begrenst
    // wat er wordt uitgerekend.
    const vx0 = Math.max(b.x0, zx0),
      vy0 = Math.max(b.y0, zy0);
    const vx1 = Math.min(b.x1, zx1),
      vy1 = Math.min(b.y1, zy1);

    // De hoogtebanden doorsnijden op een eigen schaal, zodat ze niet als
    // terrassen langs de kust blijven liggen. Vast in wereldeenheden: hij hoort
    // bij het landschap, niet bij het beeldscherm.
    if (vlek && vx1 > vx0 && vy1 > vy0) {
      const vk = 2.4;
      ctx.save();
      ctx.scale(vk, vk);
      ctx.fillStyle = vlek;
      ctx.fillRect(vx0 / vk, vy0 / vk, (vx1 - vx0) / vk, (vy1 - vy0) / vk);
      ctx.restore();
    }

    // Kroonlaag, dan de rivieren die er dwars doorheen snijden, dan de bergen
    // die er bovenuit steken, en tot slot het ontgonnen land om de steden.
    tekenBegroeiing(ctx, wereld, l, index, vak, zoom);
    tekenRivieren(ctx, wereld);

    // Bergruggen, geknipt op deze landmassa.
    if (wereld.ruggen) {
      for (const rug of wereld.ruggen) {
        const r = rugVak(rug);
        if (r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1) continue;
        if (r.x1 < zx0 || r.x0 > zx1 || r.y1 < zy0 || r.y0 > zy1) continue;
        tekenRug(ctx, rug);
      }
    }

    for (const stad of wereld.steden || []) {
      if (stad.x < b.x0 || stad.x > b.x1 || stad.y < b.y0 || stad.y > b.y1) continue;
      if (stad.x < zx0 - 220 || stad.x > zx1 + 220) continue;
      if (stad.y < zy0 - 220 || stad.y > zy1 + 220) continue;
      tekenOntginning(ctx, wereld, stad);
    }

    if (korrel && vx1 > vx0 && vy1 > vy0) {
      // De korrel blijft aan de wereld verankerd — anders verspringt hij zodra
      // de buffer opnieuw wordt opgebouwd — maar hij groeit mee bij uitzoomen,
      // zodat hij nooit subpixelklein wordt en gaat ruisen.
      const kk = Math.max(1, 1 / zoom);
      ctx.save();
      ctx.scale(kk, kk);
      ctx.fillStyle = korrel;
      ctx.fillRect(vx0 / kk, vy0 / kk, (vx1 - vx0) / kk, (vy1 - vy0) / kk);
      ctx.restore();
    }

    // Kustreliëf: de landrand vangt licht aan de zonzijde en valt weg aan de
    // andere. Dat tilt een eiland zichtbaar uit het water.
    ctx.save();
    ctx.translate(-LICHT_X * 3.2, -LICHT_Y * 3.2);
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(20,40,26,0.32)';
    ctx.stroke(l.kust);
    ctx.restore();
    ctx.save();
    ctx.translate(LICHT_X * 2.6, LICHT_Y * 2.6);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(226,232,178,0.26)';
    ctx.stroke(l.kust);
    ctx.restore();

    ctx.restore();
  }

  // Niet iedere oever is hetzelfde lint van zand. Lange zones geven grote
  // eilanden afwisselend strand, rotskust en mangrove; kleine eilandjes houden
  // één duidelijk karakter. Een donkere grondlijn voorkomt spleetjes op de
  // afgeronde overgangen tussen twee typen.
  ctx.lineWidth = 11;
  ctx.strokeStyle = 'rgba(31,43,32,0.62)';
  for (const [l] of zichtbaar) ctx.stroke(l.kust);
  ctx.lineCap = 'butt';
  for (const [soort, breedte, kleur] of [
    ['strand', 10, '#d6bd7d'],
    ['rots', 10.5, '#4b4d43'],
    ['mangrove', 10, '#244a31'],
  ]) {
    ctx.lineWidth = breedte;
    ctx.strokeStyle = kleur;
    for (const [l, index] of zichtbaar) ctx.stroke(kustPadenVan(wereld, l, index)[soort]);
  }
  for (const [soort, breedte, kleur] of [
    ['strand', 2.1, 'rgba(247,226,174,0.92)'],
    ['rots', 2.8, 'rgba(145,139,116,0.82)'],
    ['mangrove', 2.2, 'rgba(77,116,67,0.9)'],
  ]) {
    ctx.lineWidth = breedte;
    ctx.strokeStyle = kleur;
    for (const [l, index] of zichtbaar) ctx.stroke(kustPadenVan(wereld, l, index)[soort]);
  }

  // Losse stenen breken het rotssilhouet subtiel op. Het is één gevuld pad in
  // plaats van duizenden afzonderlijke tekenaanroepen.
  ctx.fillStyle = '#343a35';
  for (const [l, index] of zichtbaar) ctx.fill(kustPadenVan(wereld, l, index).rotsen);
  ctx.save();
  ctx.translate(LICHT_X * 1.2, LICHT_Y * 1.2);
  ctx.fillStyle = 'rgba(136,143,111,0.62)';
  for (const [l, index] of zichtbaar) ctx.fill(kustPadenVan(wereld, l, index).rotsen);
  ctx.restore();
}

/**
 * Tekent alle eilanden met een ondiepe-waterzoom eromheen.
 * Verwacht dat de camera-transform al actief is.
 */
export function tekenLand(ctx, wereld, cam, vw, vh) {
  if (vw <= 0 || vh <= 0) return;
  const totaal = transformSchaal(ctx);
  const dpr = clamp(totaal / (cam.zoom || 1), 0.5, 4);

  const zx0 = cam.x - vw / 2 / cam.zoom,
    zx1 = cam.x + vw / 2 / cam.zoom,
    zy0 = cam.y - vh / 2 / cam.zoom,
    zy1 = cam.y + vh / 2 / cam.zoom;

  const past =
    landLaag.geldig &&
    landLaag.canvas &&
    landLaag.wereld === wereld &&
    Math.abs(landLaag.dichtheid - cam.zoom * dpr) < 1e-6 &&
    landLaag.pw === Math.max(1, Math.ceil((vw + LAND_MARGE * 2) * dpr)) &&
    landLaag.ph === Math.max(1, Math.ceil((vh + LAND_MARGE * 2) * dpr)) &&
    zx0 >= landLaag.x0 &&
    zx1 <= landLaag.x0 + landLaag.w &&
    zy0 >= landLaag.y0 &&
    zy1 <= landLaag.y0 + landLaag.h;

  if (!past) bouwLandLaag(wereld, cam, vw, vh, dpr);

  // De buffer heeft precies de resolutie van het scherm, maar de camera staat
  // zelden op een hele pixel. Zonder uitlijnen zou elke frame opnieuw worden
  // geïnterpoleerd en werd de kustlijn wazig; we schuiven hem daarom een
  // fractie van een pixel bij zodat de blit één-op-één valt.
  let dx = landLaag.x0,
    dy = landLaag.y0;
  if (KAN_TRANSFORM_LEZEN) {
    const T = ctx.getTransform();
    if (T.a && T.d) {
      const devX = T.a * landLaag.x0 + T.c * landLaag.y0 + T.e;
      const devY = T.b * landLaag.x0 + T.d * landLaag.y0 + T.f;
      dx += (Math.round(devX) - devX) / T.a;
      dy += (Math.round(devY) - devY) / T.d;
    }
  }
  ctx.drawImage(landLaag.canvas, dx, dy, landLaag.w, landLaag.h);
}

/**
 * Levendige kustrand, getekend ná de gebufferde landlaag zodat hij kan
 * bewegen zonder de cache ongeldig te maken. Geeft de kust een lappende
 * brandingstrook en een zachte, langzaam 'ademende' diepte-gloed die de
 * bevaarbaarheidsmarge van het grootste schip volgt.
 */
const GROOTSTE_ROMPSSTRAAL = 49 * 0.62 + 3; // linieschip: wat isVaren() toelaat

export function tekenKustEffecten(ctx, wereld, cam, vw, vh, tijd) {
  const zx0 = cam.x - vw / 2 / cam.zoom,
    zx1 = cam.x + vw / 2 / cam.zoom,
    zy0 = cam.y - vh / 2 / cam.zoom,
    zy1 = cam.y + vh / 2 / cam.zoom;
  const zichtbaar = [];
  for (let i = 0; i < wereld.land.length; i++) {
    const l = wereld.land[i];
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push([l, i]);
  }
  if (!zichtbaar.length) return;

  const st = sierTijd(tijd);
  const pulseren = 0.5 + 0.5 * Math.sin(st * 1.6);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Bewegende branding: op een zandstrand loopt zij breed uit, op rots spat zij
  // smaller en feller uiteen en voor mangrove blijft slechts wat gebroken
  // kabbeling over. Zo verandert niet alleen de kleur, maar ook het gedrag van
  // de waterkant.
  const kanSchuiven =
    schuimPatroon &&
    typeof schuimPatroon.setTransform === 'function' &&
    typeof DOMMatrix !== 'undefined';
  if (schuimPatroon) {
    const lagen = {
      strand: [
        [18, 0.48 + 0.16 * pulseren, 1, 0],
        [8, 0.68 + 0.15 * pulseren, -0.62, 2.2],
      ],
      rots: [
        [8, 0.4 + 0.14 * pulseren, 1.18, 1.1],
        [3.2, 0.56 + 0.12 * pulseren, -0.78, 3.4],
      ],
      mangrove: [[3, 0.1 + 0.05 * pulseren, 0.42, 4.6]],
    };
    for (const soort of KUST_SOORTEN) {
      for (const [w, alfa, snel, fase] of lagen[soort]) {
        // Niet het canvas maar het patroon zelf verschuiven: de kustlijn mag
        // geen millimeter bewegen, alleen het schuim erover.
        if (kanSchuiven) {
          const d = st * 6 * snel;
          schuimPatroon.setTransform(new DOMMatrix().translate(d, d * 0.55 + fase * 11));
        }
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = alfa;
        ctx.lineWidth = w;
        ctx.strokeStyle = schuimPatroon;
        for (const [l, index] of zichtbaar) {
          ctx.stroke(kustPadenVan(wereld, l, index)[soort]);
        }
        ctx.restore();
      }
    }
  }
  for (const [soort, breedte, alfa] of [
    ['strand', 2.2, 0.36 + 0.16 * pulseren],
    ['rots', 1.8, 0.29 + 0.13 * pulseren],
    ['mangrove', 1, 0.07 + 0.04 * pulseren],
  ]) {
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineWidth = breedte;
    ctx.strokeStyle = `rgba(240,252,255,${alfa})`;
    for (const [l, index] of zichtbaar) {
      ctx.stroke(kustPadenVan(wereld, l, index)[soort]);
    }
    ctx.restore();
  }

  // Zachte 'no-go'-gloed: de diepte-omtrek waar ook het grootste schip nog met
  // de hele romp kan varen. Dit is een navigatiehulp, geen decor — van dichtbij
  // helpt hij je door een doorgang, uitgezoomd legt hij alleen een neonrand om
  // elk eiland in de Antillen. Dus vervaagt hij mee met de zoom.
  const hulp = clamp((cam.zoom - 1.1) / 0.6, 0, 1);
  if (hulp > 0.01) {
    ctx.save();
    ctx.lineWidth = GROOTSTE_ROMPSSTRAAL * 2;
    ctx.strokeStyle = `rgba(96,206,186,${(0.07 + 0.04 * pulseren) * hulp})`;
    for (const [l] of zichtbaar) ctx.stroke(l.kust);
    ctx.restore();
  }
}

/**
 * Schuim langs een willekeurig pad, met dezelfde vlokken als de branding op de
 * zeekaart. Zo ziet een kust er in een zeeslag niet anders uit dan erbuiten.
 *
 * `bouwPad` moet het pad op `ctx` klaarzetten; wij strijken er het patroon
 * overheen. Wie hier een streepjeslijn voor in de plaats zet, krijgt weer de
 * ketting witte worstjes waar dit hele patroon voor bestaat.
 */
export function schuimLangs(ctx, bouwPad, breedte, alfa, tijd, snel = 1) {
  if (!schuimPatroon) return;
  const st = sierTijd(tijd);
  if (typeof schuimPatroon.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    const d = st * 6 * snel;
    schuimPatroon.setTransform(new DOMMatrix().translate(d, d * 0.55));
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = alfa;
  ctx.lineWidth = breedte;
  ctx.strokeStyle = schuimPatroon;
  bouwPad();
  ctx.stroke();
  ctx.restore();
}

/**
 * Vage lengte- en breedtelijnen, als op een oude zeekaart. De maaswijdte volgt
 * de zoom: één graad als je erop zit, vijf als je de hele Caraïben overziet.
 * Elke vijfde lijn telt als hoofdgraad en staat wat steviger aan.
 */
/**
 * Het lat/lon-raster van de kaart.
 *
 * De stap komt uit `PPD` en nergens anders vandaan. Hij stond hier jarenlang als
 * los getal (92), en toen de wereld groter werd — 92 → 196 → 350 eenheden per
 * graad — bleef dat getal staan. Het raster gaf daardoor niet langer graden aan
 * maar een kwart graad, bijna vier keer zo dicht als bedoeld.
 *
 * En het liep over de hele wereld: veertienduizend bij achtduizend eenheden aan
 * lijnen, elk beeld opnieuw, terwijl er hooguit een schermbreedte van in beeld
 * staat. Alleen de lijnen tekenen die het beeld raken scheelt het leeuwendeel.
 */
export function tekenKaartlijnen(ctx, cam, vw, vh) {
  const zoom = cam.zoom || 1;
  const graden = zoom > 1.2 ? 1 : zoom > 0.5 ? 2 : 5;
  const stap = PPD * graden;

  // Het zichtbare vak, met een halve stap speling zodat een lijn die net buiten
  // beeld begint niet halverwege ophoudt.
  const zx0 = Math.max(0, cam.x - vw / 2 / zoom - stap);
  const zx1 = Math.min(WORLD_W, cam.x + vw / 2 / zoom + stap);
  const zy0 = Math.max(0, cam.y - vh / 2 / zoom - stap);
  const zy1 = Math.min(WORLD_H, cam.y + vh / 2 / zoom + stap);
  if (zx1 <= zx0 || zy1 <= zy0) return;

  ctx.save();
  ctx.lineWidth = 1 / zoom;
  for (const [veelvoud, kleur] of [[1, 'rgba(220,205,160,0.06)'], [5, 'rgba(220,205,160,0.13)']]) {
    const s = stap * veelvoud;
    ctx.strokeStyle = kleur;
    ctx.beginPath();
    for (let x = Math.ceil(zx0 / s) * s; x <= zx1; x += s) {
      ctx.moveTo(x, zy0);
      ctx.lineTo(x, zy1);
    }
    for (let y = Math.ceil(zy0 / s) * s; y <= zy1; y += s) {
      ctx.moveTo(zx0, y);
      ctx.lineTo(zx1, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

