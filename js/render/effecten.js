// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: rookdeeltjes (kanonrook, kielzogschuim).
import { clamp } from '../util.js';
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

