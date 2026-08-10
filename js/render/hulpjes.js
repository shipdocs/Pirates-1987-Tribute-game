// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: kleine gedeelde hulpjes en de zon-constanten.

// --- Kleine hulpjes -------------------------------------------------------

export const mod = (a, n) => ((a % n) + n) % n;

/** '#rrggbb' → '232,230,224', zodat we er rgba()-stops van kunnen maken. */
export function rgbVan(kleur) {
  const h = String(kleur).replace('#', '').trim();
  const vol = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(vol, 16);
  if (!Number.isFinite(n)) return '230,230,230';
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export const KAN_TRANSFORM_LEZEN = typeof CanvasRenderingContext2D !== 'undefined' &&
  typeof CanvasRenderingContext2D.prototype.getTransform === 'function';

/** Totale schaal van de actieve transform: schermpixels per wereldeenheid. */
export function transformSchaal(ctx) {
  if (!KAN_TRANSFORM_LEZEN) return 1;
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

// De zon staat vast boven de linkerschouder; alle slagschaduwen wijzen dezelfde
// kant op, ongeacht de koers van een schip of de plek van een eiland.
export const ZON_X = 2.6;
export const ZON_Y = 3.6;

