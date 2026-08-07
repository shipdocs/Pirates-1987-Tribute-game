// Alles wat op het canvas getekend wordt: zee, land, steden en schepen.
import { TAU, clamp, lerp, normAngle } from './util.js';
import { NATIES, SCHIP_INDEX } from './data.js';
import { WORLD_W, WORLD_H } from './world.js';

// --- Patronen -------------------------------------------------------------

let waterPatroon = null;
let landPatroon = null;

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Naadloos golfpatroon dat we over de zee heen schuiven. */
function maakWaterPatroon(ctx) {
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
  return ctx.createPattern(c, 'repeat');
}

/** Korrelige textuur voor het land. */
function maakLandPatroon(ctx) {
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
  return ctx.createPattern(c, 'repeat');
}

export function initPatronen(ctx) {
  waterPatroon = maakWaterPatroon(ctx);
  landPatroon = maakLandPatroon(ctx);
}

// --- Zee ------------------------------------------------------------------

/**
 * Tekent de open zee. `cam` = {x, y, zoom}, `vw/vh` = grootte van het beeld.
 */
export function tekenZee(ctx, cam, vw, vh, t) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#10486f');
  g.addColorStop(0.5, '#16648f');
  g.addColorStop(1, '#0e4166');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  if (!waterPatroon) return;
  // Twee patroonlagen die met verschillende snelheid meebewegen.
  for (const [schaal, snel, alfa] of [
    [1.0, 6, 0.85],
    [1.9, -3, 0.5],
  ]) {
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(
      -((cam.x * cam.zoom) / schaal) % 256 + ((t * snel) % 256),
      -((cam.y * cam.zoom) / schaal) % 256 + ((t * snel * 0.35) % 256)
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

/**
 * Tekent alle eilanden met een ondiepe-waterzoom eromheen.
 * Verwacht dat de camera-transform al actief is.
 */
export function tekenLand(ctx, wereld, cam, vw, vh) {
  const marge = 120;
  const zx0 = cam.x - vw / 2 / cam.zoom - marge;
  const zx1 = cam.x + vw / 2 / cam.zoom + marge;
  const zy0 = cam.y - vh / 2 / cam.zoom - marge;
  const zy1 = cam.y + vh / 2 / cam.zoom + marge;

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

  // Slagschaduw voor diepte.
  ctx.save();
  ctx.translate(5, 7);
  ctx.fillStyle = 'rgba(3,20,34,0.45)';
  for (const l of zichtbaar) ctx.fill(l.path);
  ctx.restore();

  // Landmassa: donker binnenland, lichter naar de kust toe.
  for (const l of zichtbaar) {
    ctx.fillStyle = '#335c33';
    ctx.fill(l.path);
  }
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
    if (landPatroon) {
      ctx.fillStyle = landPatroon;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
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

/**
 * Tekent één schip. Coördinaten in wereldruimte, camera-transform actief.
 * opts: {zeilen 0..1, natie, gehesenVlag, selectie, schaal}
 */
export function tekenSchip(ctx, x, y, koers, typeId, natieId, windRichting, opts = {}) {
  const [L, B, masten] = scheepMaat(typeId);
  const s = opts.schaal || 1;
  const zeilen = opts.zeilen == null ? 1 : clamp(opts.zeilen, 0, 1);
  const natie = NATIES[natieId] || NATIES.piraat;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(koers);
  ctx.scale(s, s);

  // Kielzog: uitwaaierend schuim dat naar achteren vervaagt.
  if (opts.vaart > 0.05) {
    const w = clamp(opts.vaart, 0, 1);
    const len = L * 2.4 * w;
    ctx.save();
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

  // Schaduw op het water.
  ctx.save();
  ctx.translate(2.5, 3.5);
  ctx.fillStyle = 'rgba(4,22,36,0.4)';
  romPad(ctx, L, B);
  ctx.fill();
  ctx.restore();

  // Romp.
  const grad = ctx.createLinearGradient(0, -B / 2, 0, B / 2);
  grad.addColorStop(0, '#7d5a33');
  grad.addColorStop(0.5, '#5c4023');
  grad.addColorStop(1, '#42301b');
  ctx.fillStyle = grad;
  romPad(ctx, L, B);
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#2a1d10';
  ctx.stroke();

  // Dek.
  ctx.fillStyle = '#a2814f';
  romPad(ctx, L * 0.78, B * 0.56);
  ctx.fill();

  // Achterkasteel.
  ctx.fillStyle = '#6b4a28';
  ctx.beginPath();
  ctx.ellipse(-L * 0.34, 0, L * 0.13, B * 0.38, 0, 0, TAU);
  ctx.fill();

  // Kanonspoorten.
  if (opts.kanonnen !== 0) {
    ctx.fillStyle = '#241809';
    const n = Math.min(6, Math.max(2, Math.round(L / 6)));
    for (let i = 0; i < n; i++) {
      const px = lerp(-L * 0.3, L * 0.32, i / Math.max(1, n - 1));
      ctx.fillRect(px - 1, -B / 2 + 0.4, 2, 1.6);
      ctx.fillRect(px - 1, B / 2 - 2, 2, 1.6);
    }
  }

  // Zeilen: staan dwars op de wind, dus draaien mee met de relatieve windhoek.
  if (zeilen > 0.02) {
    const rel = normAngle(windRichting - koers);
    const trim = clamp(rel * 0.42, -0.95, 0.95);
    for (let m = 0; m < masten; m++) {
      const px = lerp(L * 0.3, -L * 0.24, masten === 1 ? 0 : m / (masten - 1));
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
      const zb = B * 1.6 * grootte;
      const zl = L * 0.3 * grootte;
      // Bol staand zeil: de buik staat naar lij.
      ctx.moveTo(-zl * 0.3, -zb);
      ctx.quadraticCurveTo(zl * 1.15, 0, -zl * 0.3, zb);
      ctx.quadraticCurveTo(zl * 0.1, 0, -zl * 0.3, -zb);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Ra.
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -zb);
      ctx.lineTo(0, zb);
      ctx.stroke();
      ctx.restore();
      // Mast.
      ctx.fillStyle = '#3a2a18';
      ctx.beginPath();
      ctx.arc(px, 0, 1.5, 0, TAU);
      ctx.fill();
    }
  }

  // Vlag aan de achtersteven.
  ctx.save();
  ctx.translate(-L * 0.48, 0);
  const fl = 9,
    fh = 6;
  const wapper = Math.sin((opts.tijd || 0) * 6 + x * 0.05) * 0.9;
  ctx.rotate(normAngle(windRichting - koers) * 0.25);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    ctx.moveTo(0, -fh / 2 + (i * fh) / 3);
    ctx.lineTo(-fl, -fh / 2 + (i * fh) / 3 + wapper);
    ctx.lineTo(-fl, -fh / 2 + ((i + 1) * fh) / 3 + wapper);
    ctx.lineTo(0, -fh / 2 + ((i + 1) * fh) / 3);
    ctx.closePath();
    ctx.fill();
  }
  if (natieId === 'piraat') {
    // Doodskop op de zwarte vlag.
    ctx.fillStyle = '#e9e4d6';
    ctx.beginPath();
    ctx.arc(-fl * 0.55, wapper * 0.5, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

function romPad(ctx, L, B) {
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.bezierCurveTo(L * 0.28, -B / 2, -L * 0.2, -B / 2, -L / 2, -B * 0.34);
  ctx.lineTo(-L / 2, B * 0.34);
  ctx.bezierCurveTo(-L * 0.2, B / 2, L * 0.28, B / 2, L / 2, 0);
  ctx.closePath();
}

// --- Steden ---------------------------------------------------------------

export function tekenStad(ctx, stad, cam, tijd, gemarkeerd) {
  const natie = NATIES[stad.natie];
  const s = clamp(1 / cam.zoom, 0.7, 2.6);
  ctx.save();
  ctx.translate(stad.x, stad.y);
  ctx.scale(s, s);

  const r = 7 + stad.grootte * 2.2;

  // Grondvlak van de stad.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c9ab72';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  ctx.fill();

  // Huisjes.
  ctx.fillStyle = '#f0e3c4';
  const n = 3 + stad.grootte;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + stad.id;
    const px = Math.cos(a) * r * 0.5,
      py = Math.sin(a) * r * 0.42;
    ctx.fillRect(px - 2.2, py - 2.2, 4.4, 4);
    ctx.fillStyle = '#b3502f';
    ctx.fillRect(px - 2.8, py - 3.2, 5.6, 1.6);
    ctx.fillStyle = '#f0e3c4';
  }

  // Fort met vlaggenmast.
  ctx.fillStyle = '#8d8375';
  ctx.fillRect(-r * 0.25, -r * 0.95, r * 0.5, r * 0.55);
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.lineTo(0, -r * 2.1);
  ctx.stroke();
  const wapper = Math.sin(tijd * 4 + stad.id) * 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    ctx.moveTo(0, -r * 2.1 + i * 2.2);
    ctx.lineTo(9, -r * 2.1 + i * 2.2 + wapper);
    ctx.lineTo(9, -r * 2.1 + (i + 1) * 2.2 + wapper);
    ctx.lineTo(0, -r * 2.1 + (i + 1) * 2.2);
    ctx.closePath();
    ctx.fill();
  }

  if (gemarkeerd) {
    ctx.strokeStyle = 'rgba(255,225,150,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 8 + Math.sin(tijd * 3) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Naam.
  if (cam.zoom > 0.42) {
    ctx.font = '600 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6,24,38,0.85)';
    ctx.strokeText(stad.naam, 0, r + 14);
    ctx.fillStyle = natie.kleur;
    ctx.fillText(stad.naam, 0, r + 14);
  }
  ctx.restore();
}

// --- Losse effecten -------------------------------------------------------

export function tekenRook(ctx, p) {
  const a = clamp(1 - p.t / p.duur, 0, 1);
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.fillStyle = p.kleur || '#e8e6e0';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 2.2), 0, TAU);
  ctx.fill();
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
