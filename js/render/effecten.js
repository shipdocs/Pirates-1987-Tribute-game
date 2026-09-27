// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: rookdeeltjes (kanonrook, kielzogschuim) en de
// gevechtseffecten (mondingsvuur, inslagen, splinters, vlammen).
import { clamp, TAU } from '../util.js';
import { offscreen } from '../sprite.js';
import { rgbVan } from './hulpjes.js';

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

/**
 * Eén vervagende wolk. Kruitdamp bolt op, schuim doet dat niet.
 *
 * `p.groei` en `p.dekking` staan daarom per deeltje in te stellen. De
 * standaardwaarden zijn die van kruitdamp: een geschutswolk hoort uit te dijen
 * tot een veelvoud van zijn beginmaat. Schuim in het kielzog moet juist strak
 * blijven — dat groeide met dezelfde factor mee tot ruim anderhalve
 * scheepslengte breed, en dan ligt er geen spoor achter je maar een witte
 * driehoek van rook.
 */
export function tekenRook(ctx, p) {
  const a = clamp(1 - p.t / p.duur, 0, 1);
  const sprite = rookSprite(p.kleur || '#e8e6e0');
  const groei = p.groei == null ? 2.2 : p.groei;
  const dekking = p.dekking == null ? 0.55 : p.dekking;
  // De wolk vervaagt naar de rand, dus hij mag wat ruimer dan de oude schijf.
  const r = p.r * (1 + (1 - a) * groei) * 1.65;
  ctx.save();
  ctx.globalAlpha = a * dekking;
  ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}


// --- Gevechtseffecten -----------------------------------------------------

// Een gloed per kleur, net als de rookwolk: één keer opgebouwd en daarna
// alleen geblit. Additief getekend telt licht op tot wit in de kern.
const gloedSprites = new Map();

function gloedSprite(kleur) {
  let c = gloedSprites.get(kleur);
  if (c) return c;
  const S = 64;
  c = offscreen(S, S);
  const g = c.getContext('2d');
  const rgb = rgbVan(kleur);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,250,232,1)');
  grad.addColorStop(0.22, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.55, `rgba(${rgb},0.32)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  if (gloedSprites.size > 12) gloedSprites.clear();
  gloedSprites.set(kleur, c);
  return c;
}

/**
 * Deeltjes die in de lucht hangen (mondingsvuur, vonken, splinters, vlammen)
 * horen bóven de schepen; water en kruitdamp aan het oppervlak eronder.
 */
export function deeltjeInDeLucht(p) {
  return p.soort === 'flits' || p.soort === 'vonk' || p.soort === 'splinter' || p.soort === 'vlam';
}

/**
 * Eén gevechtsdeeltje, naar soort: `flits` (mondingsvuur of inslaglicht, langs
 * `p.hoek` uitgerekt), `plons` (uitdijende kringen waar een kogel in zee
 * valt), `spat` (een druppel of gruisje), `vonk` (een gloeiend streepje langs
 * zijn vaart), `splinter` (een tollend stuk hout), `vlam` (flakkerend vuur aan
 * dek). Zonder soort is het kruitdamp of schuim via `tekenRook`.
 */
export function tekenDeeltje(ctx, p) {
  const a = clamp(1 - p.t / p.duur, 0, 1);
  switch (p.soort) {
    case 'flits': {
      // Fel en kort: de meeste kracht in het eerste kwart.
      const k = a * a;
      const r = p.r * (0.7 + 0.5 * (1 - a));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.hoek || 0);
      ctx.drawImage(gloedSprite(p.kleur || '#ffa640'), -r * 0.6, -r * 0.55, r * 2.6, r * 1.1);
      ctx.globalAlpha = k * 0.6;
      ctx.drawImage(gloedSprite(p.kleur || '#ffa640'), -r, -r, r * 2, r * 2);
      ctx.restore();
      return;
    }
    case 'plons': {
      const q = 1 - a;
      ctx.save();
      ctx.strokeStyle = 'rgba(236,248,252,1)';
      for (let i = 0; i < 2; i++) {
        const f = clamp(q * 1.25 - i * 0.25, 0, 1);
        if (f <= 0) continue;
        ctx.globalAlpha = (1 - f) * 0.75;
        ctx.lineWidth = Math.max(0.6, p.r * 0.28 * (1 - f));
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * (0.4 + f * 2.2), p.r * (0.3 + f * 1.8), 0, 0, TAU);
        ctx.stroke();
      }
      // De opspattende kolom: wit schuim dat inzakt.
      const kolom = clamp(1 - q * 2.2, 0, 1);
      if (kolom > 0) {
        ctx.globalAlpha = kolom * 0.9;
        ctx.drawImage(rookSprite('#f4fbfd'), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.restore();
      return;
    }
    case 'spat': {
      const r = p.r * (0.4 + 0.6 * a);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.kleur || '#eef8fb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'vonk': {
      const lengte = 0.05;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.kleur || '#ffc46a';
      ctx.lineWidth = p.r * (0.5 + 0.5 * a);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.vx || 0) * lengte, p.y - (p.vy || 0) * lengte);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'splinter': {
      ctx.save();
      ctx.globalAlpha = clamp(a * 1.6, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot || 0) + (p.draai || 0) * p.t);
      ctx.fillStyle = p.kleur || '#8a5a2e';
      ctx.fillRect(-p.r, -p.r * 0.28, p.r * 2, p.r * 0.56);
      ctx.fillStyle = 'rgba(255,230,190,0.35)';
      ctx.fillRect(-p.r, -p.r * 0.28, p.r * 2, p.r * 0.18);
      ctx.restore();
      return;
    }
    case 'vlam': {
      // Opvlammen en weer inzakken, met een flakkering die per deeltje
      // verschilt zodat een brand niet in de maat pulseert.
      const op = Math.sin(Math.PI * clamp(p.t / p.duur, 0, 1));
      const flakker = 0.8 + 0.2 * Math.sin(p.t * 31 + (p.fase || 0));
      const r = p.r * (0.6 + 0.6 * op) * flakker;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = op * 0.85;
      ctx.drawImage(gloedSprite(p.kleur || '#ff7a24'), p.x - r, p.y - r, r * 2, r * 2);
      ctx.restore();
      return;
    }
    default:
      tekenRook(ctx, p);
  }
}
