// Alles wat op het canvas getekend wordt: zee, land, steden en schepen.
import { TAU, clamp, lerp, normAngle, sierTijd } from './util.js';
import { NATIES, SCHIP_INDEX } from './data.js';
import { WORLD_W, WORLD_H } from './world.js';

// --- Kleine hulpjes -------------------------------------------------------

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const mod = (a, n) => ((a % n) + n) % n;

/** '#rrggbb' → '232,230,224', zodat we er rgba()-stops van kunnen maken. */
function rgbVan(kleur) {
  const h = String(kleur).replace('#', '').trim();
  const vol = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(vol, 16);
  if (!Number.isFinite(n)) return '230,230,230';
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const KAN_TRANSFORM_LEZEN = typeof CanvasRenderingContext2D !== 'undefined' &&
  typeof CanvasRenderingContext2D.prototype.getTransform === 'function';

/** Totale schaal van de actieve transform: schermpixels per wereldeenheid. */
function transformSchaal(ctx) {
  if (!KAN_TRANSFORM_LEZEN) return 1;
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

// De zon staat vast boven de linkerschouder; alle slagschaduwen wijzen dezelfde
// kant op, ongeacht de koers van een schip of de plek van een eiland.
const ZON_X = 2.6;
const ZON_Y = 3.6;

// --- Patronen -------------------------------------------------------------

// We bewaren de tegels zelf (niet het patroon), want elk canvas heeft zijn
// eigen patroonobject nodig — de landlaag tekent op een eigen buffer.
let waterTegel = null;
let landTegel = null;
let waterPatroon = null;

/** Naadloos golfpatroon dat we over de zee heen schuiven. */
function maakWaterTegel() {
  const S = 256;
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.055)';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const y = (i / 46) * S;
    g.beginPath();
    for (let x = -8; x <= S + 8; x += 6) {
      const yy = y + Math.sin((x / S) * TAU * 2 + i * 1.7) * 3.2;
      if (x === -8) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // Losse schitteringen.
  g.fillStyle = 'rgba(255,255,255,0.09)';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    g.fillRect(x, y, 3 + Math.random() * 5, 1.2);
  }
  return c;
}

/** Korrelige textuur voor het land. */
function maakLandTegel() {
  const S = 128;
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const d = Math.random();
    g.fillStyle = d < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, y, 1.4, 1.4);
  }
  return c;
}

export function initPatronen(ctx) {
  waterTegel = maakWaterTegel();
  landTegel = maakLandTegel();
  waterPatroon = ctx.createPattern(waterTegel, 'repeat');
  landLaag.geldig = false;
}

// --- Zee ------------------------------------------------------------------

/**
 * Tekent de open zee. `cam` = {x, y, zoom}, `vw/vh` = grootte van het beeld,
 * `wind` = {richting, kracht} zodat de deining met de wind meeloopt.
 */
export function tekenZee(ctx, cam, vw, vh, t, wind) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#10486f');
  g.addColorStop(0.5, '#16648f');
  g.addColorStop(1, '#0e4166');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  if (!waterPatroon) return;

  // De deining loopt mee met de wind: richting én snelheid.
  const wr = wind ? wind.richting : 0;
  const wk = clamp(wind ? wind.kracht : 1, 0.25, 2);
  const st = sierTijd(t);
  const dx = Math.cos(wr) * wk;
  const dy = Math.sin(wr) * wk;

  // Twee patroonlagen die met verschillende snelheid meebewegen.
  for (const [schaal, snel, alfa] of [
    [1.0, 22, 0.85],
    [1.9, 12, 0.5],
  ]) {
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(
      mod(-(cam.x * cam.zoom) / schaal + dx * st * snel, 256),
      mod(-(cam.y * cam.zoom) / schaal + dy * st * snel, 256)
    );
    ctx.fillStyle = waterPatroon;
    ctx.fillRect(-256, -256, vw + 512, vh + 512);
    ctx.restore();
  }
}

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

const landLaag = {
  canvas: null,
  wereld: null,
  geldig: false,
  dichtheid: 0,
  pw: 0,
  ph: 0,
  x0: 0,
  y0: 0,
  w: 0,
  h: 0,
};

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

/** Het eigenlijke tekenwerk, op de bufferlaag. */
function tekenEilanden(ctx, wereld, vak, zoom) {
  const zx0 = vak.x0,
    zx1 = vak.x0 + vak.w,
    zy0 = vak.y0,
    zy1 = vak.y0 + vak.h;

  const zichtbaar = [];
  for (const l of wereld.land) {
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push(l);
  }
  if (!zichtbaar.length) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ondiepten: brede, doorschijnende randen rond de kust.
  const banken = [
    [64, 'rgba(41,123,150,0.55)'],
    [40, 'rgba(58,158,172,0.5)'],
    [22, 'rgba(96,196,196,0.45)'],
    [10, 'rgba(150,228,214,0.5)'],
  ];
  for (const [w, kleur] of banken) {
    ctx.lineWidth = w;
    ctx.strokeStyle = kleur;
    for (const l of zichtbaar) ctx.stroke(l.path);
  }

  // Slagschaduw voor diepte. De offset is in schermpixels, zodat de eilanden
  // bij elke zoomstand even hoog lijken.
  ctx.save();
  ctx.translate(5 / zoom, 7 / zoom);
  ctx.fillStyle = 'rgba(3,20,34,0.45)';
  for (const l of zichtbaar) ctx.fill(l.path);
  ctx.restore();

  // Landmassa: donker binnenland, lichter naar de kust toe.
  for (const l of zichtbaar) {
    ctx.fillStyle = '#335c33';
    ctx.fill(l.path);
  }
  const korrel = landTegel ? ctx.createPattern(landTegel, 'repeat') : null;
  for (const l of zichtbaar) {
    ctx.save();
    ctx.clip(l.path);
    const b = bbox(l);
    for (const [w, kleur] of [
      [88, 'rgba(74,122,68,0.55)'],
      [46, 'rgba(96,145,78,0.6)'],
      [18, 'rgba(126,168,92,0.7)'],
    ]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = kleur;
      ctx.stroke(l.path);
    }
    if (korrel) {
      // De korrel blijft aan de wereld verankerd — anders verspringt hij zodra
      // de buffer opnieuw wordt opgebouwd — maar hij groeit mee bij uitzoomen,
      // zodat hij nooit subpixelklein wordt en gaat ruisen.
      const k = Math.max(1, 1 / zoom);
      ctx.save();
      ctx.scale(k, k);
      ctx.fillStyle = korrel;
      ctx.fillRect(b.x0 / k, b.y0 / k, (b.x1 - b.x0) / k, (b.y1 - b.y0) / k);
      ctx.restore();
    }
    ctx.restore();
  }

  // Strand en kustlijn.
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#dcc691';
  for (const l of zichtbaar) ctx.stroke(l.path);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(247,236,205,0.85)';
  for (const l of zichtbaar) ctx.stroke(l.path);
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

/** Vage lengte- en breedtelijnen, als op een oude zeekaart. */
export function tekenKaartlijnen(ctx, cam, vw, vh) {
  const stap = 92 * 2; // elke twee graden
  ctx.save();
  ctx.strokeStyle = 'rgba(220,205,160,0.075)';
  ctx.lineWidth = 1 / cam.zoom;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += stap) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
  }
  for (let y = 0; y <= WORLD_H; y += stap) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
  }
  ctx.stroke();
  ctx.restore();
}

// --- Schepen --------------------------------------------------------------

const MAAT = {
  pinas: [21, 8, 1], sloep: [24, 9, 1], oorlogssloep: [27, 10, 2],
  bark: [27, 11, 2], brigantijn: [30, 11, 2], koopvaarder: [32, 14, 3],
  grote_koopvaarder: [36, 16, 3], fluit: [32, 14.5, 3], vrachtfluit: [36, 16.5, 3],
  fregat: [38, 14, 3], galjoen: [41, 17, 3], oorlogsgaljoen: [45, 18, 3],
  linieschip: [49, 19, 3],
};

export function scheepMaat(typeId) {
  return MAAT[typeId] || [20, 8, 2];
}

function romPad(ctx, L, B) {
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.bezierCurveTo(L * 0.28, -B / 2, -L * 0.2, -B / 2, -L / 2, -B * 0.34);
  ctx.lineTo(-L / 2, B * 0.34);
  ctx.bezierCurveTo(-L * 0.2, B / 2, L * 0.28, B / 2, L / 2, 0);
  ctx.closePath();
}

/**
 * De romp met alles wat er vast aan zit. Hangt alleen af van het type en het
 * aantal geschutspoorten, dus we bakken hem één keer in een sprite.
 */
function tekenRompDetail(ctx, L, B, poorten) {
  // Romp.
  const grad = ctx.createLinearGradient(0, -B / 2, 0, B / 2);
  grad.addColorStop(0, '#8f6840');
  grad.addColorStop(0.45, '#5c4023');
  grad.addColorStop(0.55, '#4a331b');
  grad.addColorStop(1, '#3b2715');
  ctx.fillStyle = grad;
  romPad(ctx, L, B);
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#2a1d10';
  ctx.stroke();

  // Walen (dikke planken langs de zijkant).
  ctx.strokeStyle = 'rgba(60,42,22,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L * 0.42, -B * 0.28);
  ctx.quadraticCurveTo(0, -B * 0.48, -L * 0.44, -B * 0.3);
  ctx.moveTo(L * 0.4, B * 0.28);
  ctx.quadraticCurveTo(0, B * 0.48, -L * 0.44, B * 0.3);
  ctx.stroke();

  // Dek.
  ctx.fillStyle = '#b08d58';
  romPad(ctx, L * 0.8, B * 0.56);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,42,22,0.4)';
  ctx.lineWidth = 0.6;
  romPad(ctx, L * 0.8, B * 0.56);
  ctx.stroke();

  // Dekplanken.
  ctx.strokeStyle = 'rgba(60,42,22,0.18)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const py = -B * 0.18 + i * B * 0.12;
    ctx.beginPath();
    ctx.moveTo(-L * 0.35, py);
    ctx.lineTo(L * 0.35, py);
    ctx.stroke();
  }

  // Achterkasteel.
  ctx.fillStyle = '#6b4a28';
  ctx.beginPath();
  ctx.ellipse(-L * 0.34, 0, L * 0.14, B * 0.4, 0, 0, TAU);
  ctx.fill();
  // Balkon/railing achter.
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-L * 0.47, -B * 0.28);
  ctx.lineTo(-L * 0.47, -B * 0.38);
  ctx.moveTo(-L * 0.47, B * 0.28);
  ctx.lineTo(-L * 0.47, B * 0.38);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const yy = -B * 0.33 + i * B * 0.22;
    ctx.beginPath();
    ctx.moveTo(-L * 0.47, yy);
    ctx.lineTo(-L * 0.5, yy);
    ctx.stroke();
  }

  // Boegspriet / galjoen.
  ctx.strokeStyle = '#5c4023';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L * 0.48, 0);
  ctx.quadraticCurveTo(L * 0.62, -B * 0.08, L * 0.7, -B * 0.02);
  ctx.stroke();

  // Geschutspoorten: precies zoveel als het schip stukken aan een boord voert.
  if (poorten > 0) {
    for (let i = 0; i < poorten; i++) {
      const px = poorten === 1 ? L * 0.05 : lerp(-L * 0.25, L * 0.3, i / (poorten - 1));
      ctx.fillStyle = '#1a1209';
      ctx.fillRect(px - 1.2, -B / 2 + 0.5, 2.4, 1.8);
      ctx.fillRect(px - 1.2, B / 2 - 2.3, 2.4, 1.8);
      ctx.fillStyle = '#0d0a06';
      ctx.fillRect(px - 1, -B / 2 + 2.4, 2, 1);
      ctx.fillRect(px - 1, B / 2 - 3.4, 2, 1);
    }
  }

  // Anker, plat tegen de boeg gesjord. Alle maten in rompeenheden, zodat het
  // op een pinas net zo goed binnen de romp valt als op een linieschip.
  ctx.save();
  ctx.translate(L * 0.28, B * 0.1);
  const ak = B * 0.055;
  ctx.strokeStyle = '#241a10';
  ctx.lineWidth = Math.max(0.6, ak * 0.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, ak * 2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-ak * 1.1, ak * 0.7);
  ctx.lineTo(ak * 1.1, ak * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, ak * 2.1, ak * 1.1, Math.PI, 0, true);
  ctx.stroke();
  ctx.restore();
}

// Sprites per (type, poorten, resolutie). De resolutiebanden zorgen dat we
// nooit vergroten en hooguit anderhalf keer verkleinen — dus geen wazige of
// gerafelde rompen, of je nu uitgezoomd over de kaart kijkt of in een zeeslag
// bovenop de vijand ligt.
const ROMP_BANDEN = [1, 1.5, 2, 3, 4, 6, 8];
const rompSprites = new Map();

function rompSprite(typeId, poorten, dichtheid) {
  let band = ROMP_BANDEN[ROMP_BANDEN.length - 1];
  for (const b of ROMP_BANDEN) {
    if (b >= dichtheid) {
      band = b;
      break;
    }
  }
  const sleutel = `${typeId}|${poorten}|${band}`;
  let sp = rompSprites.get(sleutel);
  if (sp) return sp;

  const [L, B] = scheepMaat(typeId);
  // Ruim genoeg voor de boegspriet (tot 0,70·L) en het achterwerk.
  const halfL = L * 0.75;
  const halfB = B * 0.75;
  const w = Math.max(1, Math.ceil(halfL * 2 * band));
  const h = Math.max(1, Math.ceil(halfB * 2 * band));
  const c = offscreen(w, h);
  const g = c.getContext('2d');
  g.setTransform(band, 0, 0, band, halfL * band, halfB * band);
  g.lineJoin = 'round';
  tekenRompDetail(g, L, B, poorten);

  sp = { canvas: c, ox: -halfL, oy: -halfB, w: halfL * 2, h: halfB * 2 };
  if (rompSprites.size > 160) rompSprites.clear();
  rompSprites.set(sleutel, sp);
  return sp;
}

/**
 * Tekent één schip. Coördinaten in wereldruimte, camera-transform actief.
 * opts: {zeilen 0..1, vaart, kanonnen, tijd, schaal}
 */
export function tekenSchip(ctx, x, y, koers, typeId, natieId, windRichting, opts = {}) {
  const [L, B, masten] = scheepMaat(typeId);
  const s = opts.schaal || 1;
  const zeilen = opts.zeilen == null ? 1 : clamp(opts.zeilen, 0, 1);
  const natie = NATIES[natieId] || NATIES.piraat;
  const vaart = clamp(opts.vaart || 0, 0, 1);
  const dichtheid = transformSchaal(ctx) * s;
  const st = sierTijd(opts.tijd || 0);

  // Zoveel geschutspoorten als het schip werkelijk stukken aan een boord heeft.
  const stukken = opts.kanonnen != null ? opts.kanonnen : SCHIP_INDEX[typeId]?.kanonnen ?? 0;
  const poorten = clamp(Math.round(stukken / 2), 0, Math.max(1, Math.floor(L / 4.6)));

  // Kielzog: uitwaaierend schuim dat naar achteren vervaagt.
  if (vaart > 0.05) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(koers);
    ctx.scale(s, s);
    const w = vaart;
    const len = L * 2.4 * w;
    const wake = ctx.createLinearGradient(-L * 0.5, 0, -L * 0.5 - len, 0);
    wake.addColorStop(0, `rgba(230,248,252,${0.34 * w})`);
    wake.addColorStop(1, 'rgba(230,248,252,0)');
    ctx.fillStyle = wake;
    ctx.beginPath();
    ctx.moveTo(-L * 0.46, -B * 0.3);
    ctx.quadraticCurveTo(-L * 0.5 - len * 0.5, -B * 0.62, -L * 0.5 - len, -B * 0.9);
    ctx.lineTo(-L * 0.5 - len, B * 0.9);
    ctx.quadraticCurveTo(-L * 0.5 - len * 0.5, B * 0.62, -L * 0.46, B * 0.3);
    ctx.closePath();
    ctx.fill();
    // Boeggolf.
    ctx.globalAlpha = 0.3 * w;
    ctx.strokeStyle = '#eafbff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(L * 0.42, -B * 0.34);
    ctx.quadraticCurveTo(L * 0.62, 0, L * 0.42, B * 0.34);
    ctx.stroke();
    ctx.restore();
  }

  // Schaduw op het water. De verschuiving staat in wereldruimte, zodat de zon
  // voor de hele vloot uit dezelfde hoek schijnt.
  ctx.save();
  ctx.translate(x + ZON_X * s, y + ZON_Y * s);
  ctx.rotate(koers);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(4,22,36,0.4)';
  romPad(ctx, L, B);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(koers);
  ctx.scale(s, s);

  // Romp met al het vaste houtwerk, uit de sprite.
  const sp = rompSprite(typeId, poorten, dichtheid);
  ctx.drawImage(sp.canvas, sp.ox, sp.oy, sp.w, sp.h);

  // Zeilen: staan dwars op de wind, dus draaien mee met de relatieve windhoek.
  // Halveringsregel voor een razeil: bij wind pal van achteren staan de ra's
  // vierkant, dwars in de wind hangen ze op ongeveer 45 graden.
  if (zeilen > 0.02) {
    const rel = normAngle(windRichting - koers);
    const trim = clamp(rel * 0.5, -1.4, 1.4);
    for (let m = 0; m < masten; m++) {
      const px = lerp(L * 0.32, -L * 0.22, masten === 1 ? 0 : m / (masten - 1));
      const grootte = (m === 1 || masten === 1 ? 1 : 0.82) * zeilen;
      ctx.save();
      ctx.translate(px, 0);
      ctx.rotate(trim);
      // Zeil.
      const zg = ctx.createLinearGradient(0, -B, 0, B);
      zg.addColorStop(0, '#fffdf4');
      zg.addColorStop(0.5, '#eee5cf');
      zg.addColorStop(1, '#cfc3a6');
      ctx.fillStyle = zg;
      ctx.strokeStyle = 'rgba(90,75,50,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const zb = B * 1.7 * grootte;
      const zl = L * 0.34 * grootte;
      // Bol staand zeil: de buik staat naar lij.
      ctx.moveTo(-zl * 0.25, -zb);
      ctx.quadraticCurveTo(zl * 1.25, 0, -zl * 0.25, zb);
      ctx.quadraticCurveTo(zl * 0.12, 0, -zl * 0.25, -zb);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Reeflijnen / naden.
      ctx.strokeStyle = 'rgba(90,75,50,0.35)';
      ctx.lineWidth = 0.5;
      for (let r = 1; r < 4; r++) {
        const ry = -zb + r * ((zb * 2) / 4);
        ctx.beginPath();
        ctx.moveTo(-zl * 0.15, ry);
        ctx.quadraticCurveTo(zl * 0.55, ry * 0.9, -zl * 0.05, ry);
        ctx.stroke();
      }
      // Ra.
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -zb - 2);
      ctx.lineTo(0, zb + 2);
      ctx.stroke();
      // Raar (dwars).
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-zl * 0.4, -zb);
      ctx.lineTo(zl * 0.15, -zb);
      ctx.moveTo(-zl * 0.4, zb);
      ctx.lineTo(zl * 0.15, zb);
      ctx.stroke();
      ctx.restore();
      // Mast met mars (het ronde platform, van bovenaf een schijfje om de mast).
      ctx.fillStyle = 'rgba(58,42,24,0.5)';
      ctx.beginPath();
      ctx.arc(px, 0, 3.4 * grootte, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2a18';
      ctx.beginPath();
      ctx.ellipse(px, 0, 1.8, 2.2, 0, 0, TAU);
      ctx.fill();
    }

    // Wanten / tuigage tussen masten.
    if (masten > 1) {
      ctx.strokeStyle = 'rgba(60,45,30,0.35)';
      ctx.lineWidth = 0.4;
      const mastX = [];
      for (let m = 0; m < masten; m++) {
        mastX.push(lerp(L * 0.32, -L * 0.22, m / (masten - 1)));
      }
      // Tuigage staat vast aan de romp: de offset hangt niet van de zeilstand af.
      const wy = B * 0.62;
      for (let i = 0; i < mastX.length - 1; i++) {
        const x1 = mastX[i],
          x2 = mastX[i + 1];
        ctx.beginPath();
        ctx.moveTo(x1, -wy);
        ctx.lineTo(x2, -wy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, wy);
        ctx.lineTo(x2, wy);
        ctx.stroke();
      }
    }
  }

  // Vlag aan de achtersteven. Hij staat in de schijnbare wind — de ware wind
  // min de eigen vaart — en is daarmee een echte windwijzer.
  const awx = Math.cos(windRichting) - Math.cos(koers) * vaart * 0.75;
  const awy = Math.sin(windRichting) - Math.sin(koers) * vaart * 0.75;
  const awKracht = clamp(Math.hypot(awx, awy), 0.2, 1.7);
  const awRel = normAngle(Math.atan2(awy, awx) - koers);

  ctx.save();
  ctx.translate(-L * 0.5, 0);
  ctx.rotate(normAngle(awRel + Math.PI));
  const fl = 10 * clamp(awKracht, 0.5, 1.25);
  const fh = 6.5;
  const wapper = Math.sin(st * 6 + x * 0.05) * 1.1 * awKracht;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    ctx.moveTo(0, -fh / 2 + (i * fh) / 3);
    ctx.lineTo(-fl, -fh / 2 + (i * fh) / 3 + (wapper * (i + 1)) / 3);
    ctx.lineTo(-fl, -fh / 2 + ((i + 1) * fh) / 3 + (wapper * (i + 1)) / 3);
    ctx.lineTo(0, -fh / 2 + ((i + 1) * fh) / 3);
    ctx.closePath();
    ctx.fill();
  }
  if (natieId === 'piraat') {
    // Doodskop en gekruiste knekels op de zwarte vlag.
    ctx.fillStyle = '#e9e4d6';
    ctx.beginPath();
    ctx.arc(-fl * 0.55, wapper * 0.3, 1.7, 0, TAU);
    ctx.fill();
    ctx.fillRect(-fl * 0.68, wapper * 0.3 + 1.2, 2.8, 1.2);
    ctx.strokeStyle = '#e9e4d6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-fl * 0.72, wapper * 0.3 - 0.5);
    ctx.lineTo(-fl * 0.38, wapper * 0.3 + 2);
    ctx.moveTo(-fl * 0.38, wapper * 0.3 - 0.5);
    ctx.lineTo(-fl * 0.72, wapper * 0.3 + 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// --- Steden ---------------------------------------------------------------

export function tekenStad(ctx, stad, cam, tijd, gemarkeerd) {
  const natie = NATIES[stad.natie];
  const s = clamp(1 / cam.zoom, 0.7, 2.6);
  const st = sierTijd(tijd);
  ctx.save();
  ctx.translate(stad.x, stad.y);
  ctx.scale(s, s);

  const r = 7 + stad.grootte * 2.4;
  // Alleen wat groter of van huis uit versterkt is, krijgt een bastion.
  const heeftFort = stad.soort === 'fort' || stad.soort === 'schatkamer' || stad.grootte >= 3;
  const heeftKerk = stad.grootte >= 4;

  // Grondvlak van de stad.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c9ab72';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  ctx.fill();

  // Huisjes in een ring.
  const n = 3 + stad.grootte;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + stad.id;
    const px = Math.cos(a) * r * 0.5;
    const py = Math.sin(a) * r * 0.42;
    const breed = 4 + ((stad.id * 37 + i * 13) % 3);
    const hoog = 4 + ((stad.id * 19 + i * 7) % 3);
    ctx.fillStyle = '#f0e3c4';
    ctx.fillRect(px - breed / 2, py - hoog / 2, breed, hoog);
    // Dakje.
    ctx.fillStyle = '#b3502f';
    ctx.beginPath();
    ctx.moveTo(px - breed / 2 - 0.6, py - hoog / 2);
    ctx.lineTo(px, py - hoog / 2 - 1.8);
    ctx.lineTo(px + breed / 2 + 0.6, py - hoog / 2);
    ctx.closePath();
    ctx.fill();
    // Deurtje of raampje.
    ctx.fillStyle = '#241a10';
    ctx.fillRect(px - 0.6, py, 1.2, hoog / 2);
  }

  // Grotere steden krijgen een kerktoren, naast het fort in plaats van erbovenop.
  if (heeftKerk) {
    const kx = -r * 0.66;
    ctx.fillStyle = '#9a9184';
    ctx.fillRect(kx - r * 0.16, -r * 1.2, r * 0.32, r * 0.8);
    ctx.fillStyle = '#6e6558';
    ctx.beginPath();
    ctx.moveTo(kx - r * 0.2, -r * 1.2);
    ctx.lineTo(kx, -r * 1.52);
    ctx.lineTo(kx + r * 0.2, -r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.fillRect(kx - r * 0.05, -r * 1.0, r * 0.1, r * 0.16);
    // Kruisje op de spits.
    ctx.strokeStyle = '#6e6558';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(kx, -r * 1.52);
    ctx.lineTo(kx, -r * 1.68);
    ctx.moveTo(kx - r * 0.06, -r * 1.62);
    ctx.lineTo(kx + r * 0.06, -r * 1.62);
    ctx.stroke();
  }

  // Fort met vlaggenmast — of, bij een gehucht, alleen een sobere vlaggenstok.
  let mastTop = -r * 1.6;
  if (heeftFort) {
    ctx.fillStyle = '#8d8375';
    ctx.fillRect(-r * 0.22, -r * 0.95, r * 0.44, r * 0.55);
    ctx.fillStyle = '#6e6558';
    ctx.fillRect(-r * 0.26, -r * 0.98, r * 0.52, r * 0.1);
    // Kantelen.
    ctx.fillStyle = '#8d8375';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-r * 0.26 + i * r * 0.19, -r * 1.06, r * 0.11, r * 0.09);
    }
    mastTop = -r * 2.2;
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.95);
    ctx.lineTo(0, mastTop);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(0, mastTop);
    ctx.stroke();
  }

  // Vlag.
  const wapper = Math.sin(st * 4 + stad.id) * 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    ctx.moveTo(0, mastTop + i * 2.4);
    ctx.lineTo(10, mastTop + i * 2.4 + (wapper * (i + 1)) / 3);
    ctx.lineTo(10, mastTop + (i + 1) * 2.4 + (wapper * (i + 1)) / 3);
    ctx.lineTo(0, mastTop + (i + 1) * 2.4);
    ctx.closePath();
    ctx.fill();
  }

  // Palissade/muur rond sommige steden.
  if (stad.soort === 'fort' || stad.soort === 'schatkamer') {
    ctx.strokeStyle = '#6e6558';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.88, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (gemarkeerd) {
    ctx.strokeStyle = 'rgba(255,225,150,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 10 + Math.sin(st * 3) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Naam.
  if (cam.zoom > 0.42) {
    ctx.font = '600 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6,24,38,0.85)';
    ctx.strokeText(stad.naam, 0, r + 15);
    ctx.fillStyle = natie.kleur;
    ctx.fillText(stad.naam, 0, r + 15);
  }
  ctx.restore();
}

// --- Losse effecten -------------------------------------------------------

// Eén zachte wolk per kleur, zodat rook en schuim niet als harde schijfjes
// over het water schuiven.
const rookSprites = new Map();

function rookSprite(kleur) {
  let c = rookSprites.get(kleur);
  if (c) return c;
  const S = 64;
  c = offscreen(S, S);
  const g = c.getContext('2d');
  const rgb = rgbVan(kleur);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.72)`);
  grad.addColorStop(0.78, `rgba(${rgb},0.22)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  if (rookSprites.size > 24) rookSprites.clear();
  rookSprites.set(kleur, c);
  return c;
}

export function tekenRook(ctx, p) {
  const a = clamp(1 - p.t / p.duur, 0, 1);
  const sprite = rookSprite(p.kleur || '#e8e6e0');
  // De wolk vervaagt naar de rand, dus hij mag wat ruimer dan de oude schijf.
  const r = p.r * (1 + (1 - a) * 2.2) * 1.65;
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}

/** Windroos met de actuele windrichting. */
export function tekenWindroos(ctx, cx, cy, r, windRichting, kracht, tijd) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(12,32,48,0.72)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,164,65,0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.font = '600 10px Georgia, serif';
  ctx.fillStyle = 'rgba(240,227,196,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [lbl, a] of [['N', -Math.PI / 2], ['O', 0], ['Z', Math.PI / 2], ['W', Math.PI]]) {
    ctx.fillText(lbl, Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
  }

  // Pijl wijst waarheen de wind waait.
  ctx.rotate(windRichting);
  const len = r * 0.62 * clamp(kracht, 0.5, 1.4);
  ctx.fillStyle = '#f0e3c4';
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(len - 8, -5);
  ctx.lineTo(-len * 0.7, -2);
  ctx.lineTo(-len * 0.7, 2);
  ctx.lineTo(len - 8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- Iconen ---------------------------------------------------------------

/**
 * Kleine gegraveerde iconen voor de HUD, getekend in een vak van 16 bij 16
 * rond (x, y). Ze volgen de ingestelde `fillStyle`/`strokeStyle`, zodat ze bij
 * het goud-op-blauw van de rest passen — anders dan emoji, die hun eigen
 * kleuren meebrengen en per besturingssysteem anders uitvallen.
 */
export function tekenIcoon(ctx, naam, x, y, r = 8) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 8, r / 8);
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.fillStyle;

  switch (naam) {
    case 'datum': {
      ctx.strokeRect(-6, -5, 12, 11);
      ctx.beginPath();
      ctx.moveTo(-6, -1.5);
      ctx.lineTo(6, -1.5);
      ctx.moveTo(-3, -7.5);
      ctx.lineTo(-3, -3.5);
      ctx.moveTo(3, -7.5);
      ctx.lineTo(3, -3.5);
      ctx.stroke();
      ctx.fillRect(-4, 0.5, 2, 2);
      ctx.fillRect(-0.5, 0.5, 2, 2);
      ctx.fillRect(3, 0.5, 2, 2);
      break;
    }
    case 'anker': {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -5.4, 1.9, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(0, 5.8);
      ctx.moveTo(-4.2, -1.8);
      ctx.lineTo(4.2, -1.8);
      ctx.stroke();
      // Armen met weerhaken, anders leest het icoon als een kruisje.
      ctx.beginPath();
      ctx.moveTo(-5.4, 1.4);
      ctx.quadraticCurveTo(-4.8, 5.8, 0, 6);
      ctx.quadraticCurveTo(4.8, 5.8, 5.4, 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5.4, 1.4);
      ctx.lineTo(-7, 2.4);
      ctx.moveTo(5.4, 1.4);
      ctx.lineTo(7, 2.4);
      ctx.stroke();
      break;
    }
    case 'goud': {
      // Een dichtgebonden geldbuidel. Een muntstapel leest op deze maat te veel
      // als het proviandvat ernaast.
      ctx.beginPath();
      ctx.moveTo(-2.4, -2.6);
      ctx.bezierCurveTo(-7.2, 0.4, -6.2, 6.4, 0, 6.4);
      ctx.bezierCurveTo(6.2, 6.4, 7.2, 0.4, 2.4, -2.6);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-3.2, -3);
      ctx.lineTo(3.2, -3);
      ctx.moveTo(-2.4, -6.4);
      ctx.lineTo(-1.4, -3.2);
      ctx.moveTo(2.4, -6.4);
      ctx.lineTo(1.4, -3.2);
      ctx.stroke();
      break;
    }
    case 'kompas': {
      ctx.beginPath();
      ctx.arc(0, 0, 6.4, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -4.6);
      ctx.lineTo(2.4, 0);
      ctx.lineTo(0, 4.6);
      ctx.lineTo(-2.4, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wind': {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const yy = -4 + i * 4;
        const len = i === 1 ? 6.5 : 4.5;
        ctx.moveTo(-6.5, yy);
        ctx.lineTo(len - 2, yy);
        ctx.quadraticCurveTo(len + 2.4, yy, len + 0.6, yy - 2.2);
      }
      ctx.stroke();
      break;
    }
    case 'volk': {
      for (const [cx, cy, rr] of [[-2.6, -1.5, 2.1], [2.8, -0.6, 2.4]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy + rr + 3.4, rr + 1.5, Math.PI, 0);
        ctx.fill();
      }
      break;
    }
    case 'proviand': {
      // Een proviandvat; de buik moet flink bol staan, anders leest het als
      // een velletje papier met lijnen.
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-3.4, -5.4);
      ctx.quadraticCurveTo(-7.2, 0, -3.4, 5.4);
      ctx.lineTo(3.4, 5.4);
      ctx.quadraticCurveTo(7.2, 0, 3.4, -5.4);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-6.2, -2.1);
      ctx.lineTo(6.2, -2.1);
      ctx.moveTo(-6.2, 2.1);
      ctx.lineTo(6.2, 2.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -5.4, 3.4, 1.1, 0, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'romp': {
      ctx.beginPath();
      ctx.moveTo(-6, -2.5);
      ctx.lineTo(6, -2.5);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -2.5);
      ctx.lineTo(0, -7);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
