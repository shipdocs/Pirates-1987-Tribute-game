// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: de zeekaart met arcering, kompasroos en labels.
import { TAU } from '../util.js';
import { WORLD_W } from '../world.js';
import { plaats } from '../sprite.js';
import { landTegel } from './patronen.js';
import { roundRechthoek } from './steden.js';
import { natieStip } from './hud.js';

// --- Zeekaart -------------------------------------------------------------

// Waar de kompasrozen op de kaart staan, in wereldeenheden. Uit elk daarvan
// waaieren loxodromen over de hele kaart — het net waarop een zeventiende-eeuwse
// stuurman zijn koers uitzette, en meteen het middel dat een kaart tot kaart
// maakt in plaats van tot een plaatje van land en water.
const ROOS_PLEKKEN = [
  [0.5, 0.56],
  [0.19, 0.28],
  [0.83, 0.68],
];

/** Loodrechte streepjes landinwaarts: de arcering van een gegraveerde kust. */
function tekenArcering(ctx, l, sc, lengte) {
  ctx.beginPath();
  const pts = l.pts;
  // Alleen de échte oever, en niet elk punt: om de zoveel punten een streepje,
  // anders wordt het een dichte band in plaats van arcering.
  const stap = Math.max(1, Math.round(pts.length / 260));
  for (let i = 0; i < pts.length - stap; i += stap) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + stap];
    const dx = x1 - x0,
      dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Normaal naar binnen: de kustlijnen lopen met de klok mee, dus dit is de
    // landzijde. Waar dat toch andersom uitpakt, valt het streepje in zee en
    // dat leest als een zandbank — geen ramp op een oude kaart.
    const nx = dy / len,
      ny = -dx / len;
    const mx = (x0 + x1) * 0.5 * sc,
      my = (y0 + y1) * 0.5 * sc;
    const l2 = lengte * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)));
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + nx * l2, my + ny * l2);
  }
  ctx.stroke();
}

/** Eén kompasroos in kaartstijl: acht stralen, een ring en een noordpijl. */
function tekenKaartRoos(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(106,86,60,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.moveTo(r * 0.62, 0);
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const punt = i % 2 === 0;
    ctx.fillStyle = punt ? 'rgba(70,54,30,0.8)' : 'rgba(120,98,64,0.6)';
    const rr = punt ? r : r * 0.7;
    const br = r * (punt ? 0.13 : 0.09);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.lineTo(Math.cos(a + Math.PI / 2) * br, Math.sin(a + Math.PI / 2) * br);
    ctx.lineTo(Math.cos(a - Math.PI / 2) * br, Math.sin(a - Math.PI / 2) * br);
    ctx.closePath();
    ctx.fill();
  }
  // Noorden krijgt een lelie-achtige punt, zoals het hoort.
  ctx.fillStyle = '#8a2f22';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.16);
  ctx.lineTo(r * 0.12, -r * 0.5);
  ctx.lineTo(-r * 0.12, -r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Greedy plaatsing van plaatsnamen: grootste stad eerst, en elk label krijgt de
 * eerste van vier plekken die nog vrij is.
 *
 * Zonder dit staat de naam altijd rechts van de stip, en dan lopen in de Kleine
 * Antillen vier namen door elkaar heen — precies daar waar de kaart het
 * drukst is. Wie geen plek meer heeft, houdt zijn stip; grote plaatsen gaan
 * voor, want die zoek je op.
 */
function plaatsLabels(ctx, steden, sc, marge) {
  const uit = [];
  const gesorteerd = steden.slice().sort((a, b) => b.grootte - a.grootte);
  // De stippen zelf zijn óók obstakels: een naam die netjes tussen twee andere
  // namen past maar pal over een symbool valt, is even onleesbaar.
  const vakken = gesorteerd.map((stad) => {
    const r = 3 + stad.grootte * 0.6 + 1.5;
    return { x: stad.x * sc - r, y: stad.y * sc - r, w: r * 2, h: r * 2 };
  });
  for (const stad of gesorteerd) {
    const x = stad.x * sc,
      y = stad.y * sc;
    const w = ctx.measureText(stad.naam).width;
    const h = 11;
    const r = 3 + stad.grootte * 0.6;
    const opties = [
      [x + r + 4, y - h / 2, 'left'],
      [x - r - 4 - w, y - h / 2, 'left'],
      [x - w / 2, y - r - 4 - h, 'left'],
      [x - w / 2, y + r + 4, 'left'],
    ];
    let gekozen = null;
    for (const [px, py] of opties) {
      if (px < 2 || py < 2 || px + w > marge.w - 2 || py + h > marge.h - 2) continue;
      const vak = { x: px - 1, y: py - 1, w: w + 2, h: h + 2 };
      const botst = vakken.some(
        (v) => vak.x < v.x + v.w && vak.x + vak.w > v.x && vak.y < v.y + v.h && vak.y + vak.h > v.y
      );
      if (botst) continue;
      vakken.push(vak);
      gekozen = [px, py + h / 2];
      break;
    }
    uit.push({ stad, x, y, r, label: gekozen });
  }
  return uit;
}

/**
 * De zeekaart zoals een stuurman hem zou hebben: perkament, een gegraveerde
 * kust, loxodromen en een cartouche.
 *
 * Dit scherm was een opgeschaalde minikaart — vlak groen op vlak blauw — en dat
 * is zonde, want alle meetkunde ligt er al. `opts`: {datum, speler, merken}.
 */
export function tekenZeekaart(ctx, wereld, W, H, opts = {}) {
  const sc = W / WORLD_W;
  ctx.save();

  // Perkament met korrel en gebrande randen.
  const grond = ctx.createLinearGradient(0, 0, W, H);
  grond.addColorStop(0, '#f2e5c4');
  grond.addColorStop(1, '#e4d2a8');
  ctx.fillStyle = grond;
  ctx.fillRect(0, 0, W, H);
  if (landTegel) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(landTegel, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // De zee is een bleke wassing, geen blauw vlak. Zo blijven de namen leesbaar
  // en leest het geheel als kaart in plaats van als luchtfoto. Wel stevig
  // genoeg dat je in één oogopslag ziet wat water is en wat land.
  ctx.fillStyle = 'rgba(132,164,176,0.34)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.scale(sc, sc);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ondiepte: twee banden om de kust, in de bankbreedte van het eiland zelf.
  // Canvas kan een pad niet verschuiven, dus we tekenen ze als brede lijnen —
  // de binnenste helft valt straks onder het land en de buitenste blijft over
  // als de zoom van ondiep water waar een stuurman voor uitkijkt.
  for (const [breedte, alfa] of [[260, 0.13], [110, 0.16]]) {
    // Blauwgrijs, niet sepia: dit is ondiep wáter. In bruin las het als een
    // veeg vuil op het perkament, vooral rond de Bahamabank.
    ctx.strokeStyle = `rgba(126,158,168,${alfa})`;
    for (const l of wereld.land) {
      ctx.lineWidth = breedte * (l.bank || 1);
      ctx.stroke(l.kust);
    }
  }

  // Land: warm en duidelijk lichter dan de zeewassing, zodat de kustlijn ook
  // zonder de arcering al leest.
  ctx.fillStyle = '#e2d1a4';
  for (const l of wereld.land) ctx.fill(l.path);
  ctx.restore();

  // Arcering landinwaarts (in schermruimte, zodat de streepjes overal even lang
  // zijn — dat is precies hoe een graveur het doet).
  ctx.strokeStyle = 'rgba(106,86,60,0.62)';
  ctx.lineWidth = 0.8;
  for (const l of wereld.land) tekenArcering(ctx, l, sc, 4.2);

  ctx.save();
  ctx.scale(sc, sc);
  ctx.strokeStyle = '#6a563c';
  ctx.lineWidth = 1.6 / sc;
  ctx.lineJoin = 'round';
  for (const l of wereld.land) ctx.stroke(l.kust);
  ctx.restore();

  // Loxodromen uit de kompasrozen.
  ctx.save();
  ctx.strokeStyle = 'rgba(106,86,60,0.14)';
  ctx.lineWidth = 0.6;
  const diag = Math.hypot(W, H);
  for (const [fx, fy] of ROOS_PLEKKEN) {
    const cx = fx * W,
      cy = fy * H;
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * diag, cy + Math.sin(a) * diag);
    }
    ctx.stroke();
  }
  ctx.restore();
  for (const [fx, fy] of ROOS_PLEKKEN) tekenKaartRoos(ctx, fx * W, fy * H, Math.min(W, H) * 0.055);

  // Extra merktekens (schatgebied, doodskoppen) vóór de steden, zodat een naam
  // er nooit onder verdwijnt.
  if (opts.merken) for (const m of opts.merken) m(ctx, sc);

  // Steden met hun natiesymbool en een naam die nergens overheen valt.
  ctx.font = '600 10px Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const p of plaatsLabels(ctx, wereld.steden, sc, { w: W, h: H })) {
    natieStip(ctx, p.x, p.y, p.stad.natie, p.r, 'rgba(58,42,24,0.85)');
    if (!p.label) continue;
    // Een lichte veeg onder de naam: op de arcering zou hij anders wegvallen.
    const tw = ctx.measureText(p.stad.naam).width;
    ctx.fillStyle = 'rgba(242,229,196,0.72)';
    ctx.fillRect(p.label[0] - 2, p.label[1] - 6, tw + 4, 12);
    ctx.fillStyle = '#37281a';
    ctx.fillText(p.stad.naam, p.label[0], p.label[1]);
  }

  // Het eigen schip.
  if (opts.speler) {
    const px = opts.speler.x * sc,
      py = opts.speler.y * sc;
    ctx.fillStyle = '#ffdf8a';
    ctx.strokeStyle = '#2b1d12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Cartouche in de lege hoek rechtsboven: titel, datum en een lijstje.
  if (opts.datum) {
    const cw = Math.min(238, W * 0.3),
      ch = 62;
    const cx = W - cw - 14,
      cy = 14;
    ctx.fillStyle = 'rgba(246,236,210,0.92)';
    ctx.strokeStyle = '#8a7244';
    ctx.lineWidth = 1.4;
    roundRechthoek(ctx, cx, cy, cw, ch, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(138,114,68,0.5)';
    ctx.lineWidth = 0.7;
    roundRechthoek(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a3418';
    ctx.font = 'italic 600 15px Georgia, serif';
    ctx.fillText('Mar del Norte', cx + cw / 2, cy + 20);
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillStyle = '#6a563c';
    ctx.fillText('naar de beste kennis van heden', cx + cw / 2, cy + 37);
    ctx.fillText(opts.datum, cx + cw / 2, cy + 51);
  }

  // Gebrande, donkere randen: het perkament ligt niet in een lijstje maar op tafel.
  const rand = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
  rand.addColorStop(0, 'rgba(120,90,45,0)');
  rand.addColorStop(1, 'rgba(96,68,32,0.42)');
  ctx.fillStyle = rand;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

