// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: schatkaart en herkenningspunten.
import { TAU } from '../util.js';

// --- Schatjacht -----------------------------------------------------------

/**
 * Herkenningspunt aan land, in inkt. Dezelfde tekening wordt klein op het
 * perkament gezet en groot in het paneel waar je ernaast staat, zodat wat je
 * op de kaart ziet ook is wat je aan land herkent.
 */
export function tekenHerkenningspunt(ctx, id, x, y, s = 1, kleur = '#3a2a18') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = kleur;
  ctx.fillStyle = kleur;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (id) {
    case 'rots':
      // Twee brokken met een spleet ertussen.
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-1.5, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.5, 8);
      ctx.lineTo(6, -5);
      ctx.lineTo(9, 8);
      ctx.closePath();
      ctx.stroke();
      break;

    case 'palmen':
      for (const [dx, h] of [[-6, 7], [0, 10], [6, 6]]) {
        ctx.beginPath();
        ctx.moveTo(dx, 8);
        ctx.quadraticCurveTo(dx + 1.2, 8 - h * 0.6, dx + 0.4, 8 - h);
        ctx.stroke();
        for (const zij of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(dx + 0.4, 8 - h);
          ctx.quadraticCurveTo(dx + zij * 3.4, 8 - h - 2.4, dx + zij * 5.4, 8 - h + 0.6);
          ctx.stroke();
        }
      }
      break;

    case 'wrak':
      // Half in het zand gezakte romp met een gebroken mast.
      ctx.beginPath();
      ctx.moveTo(-10, 6);
      ctx.quadraticCurveTo(-7, 10.5, 6, 8.5);
      ctx.lineTo(9, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, 7.5);
      ctx.lineTo(-4, -6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(1.5, -2.5);
      ctx.stroke();
      break;

    case 'kreek':
      ctx.beginPath();
      ctx.moveTo(-10, 9);
      ctx.bezierCurveTo(-4, 4, -6, -2, 0, -7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 9.5);
      ctx.bezierCurveTo(-1, 4.5, -2.5, -1.5, 3.5, -6.5);
      ctx.stroke();
      break;

    case 'grafheuvel':
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.quadraticCurveTo(0, -6, 10, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(0, -9);
      ctx.moveTo(-3.4, -6);
      ctx.lineTo(3.4, -6);
      ctx.stroke();
      break;

    case 'bron':
      ctx.beginPath();
      ctx.ellipse(0, 6, 8, 3.2, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 4.5);
      ctx.lineTo(-5, -3);
      ctx.moveTo(5, 4.5);
      ctx.lineTo(5, -3);
      ctx.moveTo(-6.5, -3);
      ctx.lineTo(6.5, -3);
      ctx.stroke();
      break;

    default:
      ctx.beginPath();
      ctx.arc(0, 2, 5, 0, TAU);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * Het perkament: een uitsnede van de échte kustlijn rond de schat, met de
 * herkenningspunten en het kruis erop. `kwadranten` bepaalt welke kwarten al
 * ingevuld zijn; de rest blijft leeg papier met een gescheurde rand.
 *
 * `venster` is de breedte van de uitsnede in wereldeenheden.
 */
export function tekenSchatkaart(ctx, wereld, schat, w, h, kwadranten, venster = 620) {
  const sc = w / venster;
  const x0 = schat.x - venster / 2;
  const y0 = schat.y - (venster * (h / w)) / 2;

  // Perkament.
  ctx.save();
  ctx.fillStyle = '#e5d6ac';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(150,116,62,0.14)';
  for (let i = 0; i < 90; i++) {
    const vx = ((i * 97) % 313) / 313;
    const vy = ((i * 151) % 271) / 271;
    ctx.fillRect(vx * w, vy * h, 1 + (i % 3), 1 + (i % 2));
  }

  // Kustlijn in inkt. De zee krijgt een koele wassing en het land blijft kaal
  // perkament — anders zijn water en wal op dit formaat niet uit elkaar te
  // houden, en weet je dus niet aan welke kant van de lijn het kruis ligt.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = '#b9c3ad';
  ctx.fillRect(0, 0, w, h);
  // Golfstreepjes, zoals op een oude kaart.
  ctx.strokeStyle = 'rgba(90,110,95,0.35)';
  ctx.lineWidth = 1;
  for (let y = 8; y < h; y += 14) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin((x + y) * 0.11) * 1.6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.translate(-x0 * sc, -y0 * sc);
  ctx.scale(sc, sc);
  ctx.fillStyle = '#e9dcb4';
  for (const l of wereld.land) ctx.fill(l.path);
  ctx.strokeStyle = '#5a3f1e';
  ctx.lineWidth = 3 / sc;
  for (const l of wereld.land) ctx.stroke(l.kust);
  ctx.restore();

  // Herkenningspunten en het kruis.
  for (const p of schat.punten) {
    tekenHerkenningspunt(ctx, p.id, (p.x - x0) * sc, (p.y - y0) * sc, 1.15);
  }
  const kx = (schat.x - x0) * sc;
  const ky = (schat.y - y0) * sc;
  ctx.strokeStyle = '#8c2f22';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(kx - 8, ky - 8);
  ctx.lineTo(kx + 8, ky + 8);
  ctx.moveTo(kx + 8, ky - 8);
  ctx.lineTo(kx - 8, ky + 8);
  ctx.stroke();

  // Ontbrekende kwadranten afdekken met leeg papier en een gescheurde rand.
  for (let i = 0; i < 4; i++) {
    if (kwadranten[i]) continue;
    const qx = (i % 2) * (w / 2);
    const qy = Math.floor(i / 2) * (h / 2);
    ctx.fillStyle = '#efe3c2';
    ctx.fillRect(qx, qy, w / 2, h / 2);
    ctx.strokeStyle = 'rgba(120,92,50,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(qx + 1, qy + 1, w / 2 - 2, h / 2 - 2);
    ctx.setLineDash([]);
  }

  // Dezelfde kaarslicht-gloed als op de zeekaart: één lichtbron in de kajuit,
  // niet een gladde filter over het hele blad.
  const kaars = ctx.createRadialGradient(w * 0.27, h * 0.3, 0, w * 0.27, h * 0.3, Math.max(w, h) * 0.65);
  kaars.addColorStop(0, 'rgba(255,214,140,0.16)');
  kaars.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = kaars;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
