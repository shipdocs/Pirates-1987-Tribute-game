// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Schepen tekenen: de eigen bunkerboot en het verkeer om je heen.
//
// De rompen gaan door de sprite-bakkerij uit `sprite.js`: ze veranderen niet
// van vorm, alleen van plaats en richting, en dan hoort de tekening één keer
// gemaakt te worden en daarna geblit. Wat wél per frame verandert — het
// kielzog, de navigatielichten, de naamplaat die tégen de zoom in schaalt —
// staat bewust buiten de sprite.

import { clamp, TAU, sierTijd } from '../util.js';
import { maakBakkerij, plaats, bandVoor } from '../sprite.js';
import { KLANTSCHIP_INDEX, BOOT_INDEX } from '../data.js';
import { naarScherm, scheepSchaal } from './kaart.js';

const bakkerij = maakBakkerij('rompen', 1.6e6);

// --- Rompvormen ------------------------------------------------------------

/**
 * De romp van een bunkerboot: lang, laag en recht, met een stuurhuis achterin
 * en een tankdek met leidingen ervoor. Getekend in meters, met de boeg op +x.
 */
function tekenBunkerromp(g, L, B, kleur) {
  const half = B / 2;
  // Romp.
  g.beginPath();
  g.moveTo(L * 0.5, 0);
  g.lineTo(L * 0.34, -half * 0.92);
  g.lineTo(-L * 0.46, -half);
  g.lineTo(-L * 0.5, -half * 0.72);
  g.lineTo(-L * 0.5, half * 0.72);
  g.lineTo(-L * 0.46, half);
  g.lineTo(L * 0.34, half * 0.92);
  g.closePath();
  g.fillStyle = kleur;
  g.fill();
  g.strokeStyle = 'rgba(10,14,18,0.75)';
  g.lineWidth = Math.max(0.5, B * 0.05);
  g.stroke();

  // Tankdek: een lichter vlak met de tankdeksels erop.
  g.fillStyle = 'rgba(22,28,34,0.30)';
  g.fillRect(-L * 0.22, -half * 0.82, L * 0.66, B * 0.82);
  g.fillStyle = 'rgba(220,228,234,0.5)';
  for (let i = 0; i < 4; i++) {
    const x = -L * 0.16 + i * L * 0.16;
    g.beginPath();
    g.arc(x, 0, B * 0.09, 0, TAU);
    g.fill();
  }
  // Leiding over het dek, met het manifold aan bakboord.
  g.strokeStyle = 'rgba(230,180,90,0.75)';
  g.lineWidth = Math.max(0.4, B * 0.05);
  g.beginPath();
  g.moveTo(-L * 0.24, -half * 0.42);
  g.lineTo(L * 0.28, -half * 0.42);
  g.stroke();

  // Stuurhuis achterin — wit, zoals ze er in het echt uitzien.
  g.fillStyle = '#dfe4e6';
  g.fillRect(-L * 0.46, -half * 0.62, L * 0.18, B * 0.62);
  g.fillStyle = 'rgba(30,44,56,0.85)';
  g.fillRect(-L * 0.44, -half * 0.5, L * 0.14, B * 0.2);
}

/** Een zeeschip: containerschip, tanker of bulker, grof maar herkenbaar. */
function tekenZeeschip(g, L, B, typeId, kleur) {
  const half = B / 2;
  g.beginPath();
  g.moveTo(L * 0.5, 0);
  g.lineTo(L * 0.3, -half);
  g.lineTo(-L * 0.48, -half);
  g.lineTo(-L * 0.5, -half * 0.6);
  g.lineTo(-L * 0.5, half * 0.6);
  g.lineTo(-L * 0.48, half);
  g.lineTo(L * 0.3, half);
  g.closePath();
  g.fillStyle = kleur;
  g.fill();
  g.strokeStyle = 'rgba(8,12,16,0.7)';
  g.lineWidth = Math.max(0.6, B * 0.04);
  g.stroke();

  if (typeId === 'containerschip' || typeId === 'feeder') {
    // Containerstapels: rijen blokjes in wisselende tinten.
    const kleuren = ['#8d4a3c', '#3f6b7d', '#6d6a4a', '#7a5a72', '#4a6d55'];
    const rijen = Math.max(4, Math.round(L / 26));
    for (let i = 0; i < rijen; i++) {
      const x = -L * 0.4 + (i / rijen) * L * 0.76;
      g.fillStyle = kleuren[i % kleuren.length];
      g.fillRect(x, -half * 0.78, L * 0.055, B * 0.78);
    }
    g.fillStyle = '#e2e6e8';
    g.fillRect(-L * 0.47, -half * 0.6, L * 0.06, B * 0.6);
  } else if (typeId === 'producttanker') {
    g.fillStyle = 'rgba(20,26,32,0.28)';
    g.fillRect(-L * 0.3, -half * 0.8, L * 0.7, B * 0.8);
    g.strokeStyle = 'rgba(220,180,90,0.6)';
    g.lineWidth = Math.max(0.5, B * 0.035);
    g.beginPath();
    g.moveTo(-L * 0.3, 0);
    g.lineTo(L * 0.36, 0);
    g.stroke();
    g.fillStyle = '#e2e6e8';
    g.fillRect(-L * 0.47, -half * 0.62, L * 0.09, B * 0.62);
  } else if (typeId === 'cruiseschip') {
    g.fillStyle = '#f0f2f3';
    g.fillRect(-L * 0.42, -half * 0.76, L * 0.84, B * 0.76);
    g.fillStyle = 'rgba(40,60,80,0.6)';
    for (let i = 0; i < 8; i++) {
      g.fillRect(-L * 0.4 + i * L * 0.1, -half * 0.2, L * 0.06, B * 0.14);
    }
  } else {
    // Bulker / ro-ro / autocarrier: luiken of een dicht dek.
    g.fillStyle = 'rgba(24,30,36,0.32)';
    for (let i = 0; i < 5; i++) {
      g.fillRect(-L * 0.34 + i * L * 0.15, -half * 0.62, L * 0.1, B * 0.62);
    }
    g.fillStyle = '#e2e6e8';
    g.fillRect(-L * 0.47, -half * 0.62, L * 0.08, B * 0.62);
  }
}

// --- Tekenen ---------------------------------------------------------------

/**
 * Zet een schip op het scherm. `schaal` is de tekenschaal uit
 * `scheepSchaal(zoom)` — boven de standaardzoom altijd 1, zodat de romp die je
 * ziet ook de ruimte is die het schip inneemt.
 */
export function tekenSchip(ctx, cam, vw, vh, opts) {
  const { x, y, koers, lengte, breedte } = opts;
  const [sx, sy] = naarScherm(cam, x, y, vw, vh);
  const schaal = scheepSchaal(cam.zoom);
  const pix = lengte * cam.zoom * schaal;
  if (pix < 1.2) return;
  if (sx < -pix || sx > vw + pix || sy < -pix || sy > vh + pix) return;

  const band = bandVoor(clamp(cam.zoom * schaal, 0.25, 8));
  const sleutel = `${opts.soort}|${Math.round(lengte)}|${Math.round(breedte)}|${opts.kleur}|${opts.type || ''}`;
  const sprite = bakkerij.haal(sleutel, lengte * 0.56, Math.max(breedte, lengte * 0.12) * 0.62, band, (g) => {
    if (opts.soort === 'bunker') tekenBunkerromp(g, lengte, breedte, opts.kleur);
    else tekenZeeschip(g, lengte, breedte, opts.type, opts.kleur);
  });

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(koers);
  ctx.scale(cam.zoom * schaal, cam.zoom * schaal);
  plaats(ctx, sprite);
  ctx.restore();

  // Navigatielichten en naam liggen buiten de sprite: het eerste knippert, het
  // tweede moet leesbaar blijven en schaalt dus tégen de zoom in.
  if (opts.lichten) {
    const puls = 0.55 + Math.sin(sierTijd(opts.tijd || 0) * 2.4 + x * 0.01) * 0.45;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = clamp(pix * 0.16, 2, 10);
    for (const [dx, dy, kleur] of [[0.3, -0.42, '#3fe08a'], [0.3, 0.42, '#ff6a5a']]) {
      const ox = Math.cos(koers) * lengte * dx - Math.sin(koers) * breedte * dy;
      const oy = Math.sin(koers) * lengte * dx + Math.cos(koers) * breedte * dy;
      const px = sx + ox * cam.zoom * schaal;
      const py = sy + oy * cam.zoom * schaal;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
      g.addColorStop(0, kleur);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = puls;
      ctx.fillStyle = g;
      ctx.fillRect(px - r * 2, py - r * 2, r * 4, r * 4);
    }
    ctx.restore();
  }

  if (opts.naam && pix > 26) {
    ctx.save();
    ctx.font = '600 10px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,238,246,0.72)';
    ctx.fillText(opts.naam, sx, sy - pix * 0.42 - 6);
    ctx.restore();
  }
}

/** Het verkeer om je heen. */
export function tekenVerkeer(ctx, wereld, cam, vw, vh, tijd) {
  const isNacht = !wereld.isDag();
  for (const v of wereld.verkeer) {
    tekenSchip(ctx, cam, vw, vh, {
      x: v.x, y: v.y, koers: v.koers, lengte: v.lengte, breedte: v.breedte,
      soort: 'zee', type: v.type, kleur: kleurVoor(v.type),
      naam: cam.zoom > 0.25 ? v.naam : null, lichten: isNacht, tijd,
    });
  }
}

function kleurVoor(typeId) {
  switch (typeId) {
    case 'containerschip': return '#3d5f75';
    case 'feeder': return '#4a6b52';
    case 'producttanker': return '#6d4a44';
    case 'cruiseschip': return '#c8ccce';
    case 'bulkcarrier': return '#5a5348';
    case 'roro': return '#4f4a63';
    default: return '#55605f';
  }
}

/** De eigen boot. */
export function tekenEigenBoot(ctx, wereld, schipper, cam, vw, vh, tijd) {
  const t = BOOT_INDEX[schipper.boot.type];
  tekenSchip(ctx, cam, vw, vh, {
    x: schipper.x, y: schipper.y, koers: schipper.koers,
    lengte: t.lengte, breedte: t.breedte,
    soort: 'bunker', kleur: '#8a5a2c', lichten: !wereld.isDag(), tijd,
  });
}

/**
 * Kielzog: schuimdeeltjes achter de boot. Ze krijgen bewust geen groeifactor —
 * schuim hoort plat te blijven liggen. Rook uit de schoorsteen zou dat wél
 * doen, en dat is precies de valkuil waar Zeeroverij op is gestrand: één
 * tekenfunctie delen is prima, één gedrag delen niet.
 */
export function werkKielzogBij(sporen, schipper, dt, snelheid) {
  for (let i = sporen.length - 1; i >= 0; i--) {
    const p = sporen[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    if (p.t > p.duur) sporen.splice(i, 1);
  }
  if (snelheid > 0.6 && sporen.length < 90) {
    const t = BOOT_INDEX[schipper.boot.type];
    const achter = -t.lengte * 0.48;
    for (const kant of [-1, 1]) {
      const dx = Math.cos(schipper.koers) * achter - Math.sin(schipper.koers) * kant * t.breedte * 0.4;
      const dy = Math.sin(schipper.koers) * achter + Math.cos(schipper.koers) * kant * t.breedte * 0.4;
      sporen.push({
        x: schipper.x + dx, y: schipper.y + dy,
        vx: -Math.cos(schipper.koers) * snelheid * 0.25 - Math.sin(schipper.koers) * kant * 1.2,
        vy: -Math.sin(schipper.koers) * snelheid * 0.25 + Math.cos(schipper.koers) * kant * 1.2,
        t: 0, duur: 2.4 + Math.random() * 1.8, maat: 2 + Math.random() * 3,
      });
    }
  }
}

export function tekenKielzog(ctx, sporen, cam, vw, vh) {
  if (cam.zoom < 0.05) return;
  ctx.save();
  for (const p of sporen) {
    const [sx, sy] = naarScherm(cam, p.x, p.y, vw, vh);
    const leven = 1 - p.t / p.duur;
    ctx.globalAlpha = leven * 0.4;
    ctx.fillStyle = '#e8f2f6';
    const r = Math.max(0.8, p.maat * cam.zoom * scheepSchaal(cam.zoom));
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export { bakkerij };
