// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De HUD: panelen, balken en meters in de stijl van een scheepsinstrument.
// Alle kleuren staan hier, en ze spiegelen de tokens boven in `css/spel.css` —
// twee systemen die dezelfde kleur moeten kennen, horen die op één plek te
// halen, anders lopen ze uit elkaar zodra iemand er één aanpast.

import { clamp } from '../util.js';
import { roundRect } from '../spel.js';

export const HUD = {
  paneel: 'rgba(13,19,25,0.86)',
  paneelRand: 'rgba(126,163,190,0.30)',
  tekst: '#dbe8f2',
  tekstZacht: 'rgba(219,232,242,0.62)',
  goed: '#5fbf8a',
  let: '#e0b45c',
  slecht: '#d9694f',
  accent: '#6fb0d8',
  balkLeeg: 'rgba(255,255,255,0.10)',
};

export function paneel(ctx, x, y, w, h, r = 6) {
  ctx.fillStyle = HUD.paneel;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = HUD.paneelRand;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Horizontale balk met een label; de standaardbouwsteen van de HUD. */
export function balk(ctx, x, y, w, h, fractie, kleur, label) {
  ctx.fillStyle = HUD.balkLeeg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const f = clamp(fractie, 0, 1);
  if (f > 0.001) {
    ctx.fillStyle = kleur;
    roundRect(ctx, x, y, Math.max(h, w * f), h, h / 2);
    ctx.fill();
  }
  if (label) {
    ctx.fillStyle = HUD.tekst;
    ctx.font = '600 10px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 7);
  }
}

/**
 * Een balk met drie zones: veilig, oplettend en gevaarlijk. Dit is de vorm die
 * Zeeroverij gebruikte voor de spanning in het want, en hier doet hij dienst
 * voor de squat onderweg en voor het verschil bij de overslag — twee plekken
 * waar je precies wilt weten hoe dicht je bij de rand zit.
 */
export function zoneBalk(ctx, x, y, w, h, waarde, zones, label) {
  ctx.fillStyle = HUD.balkLeeg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  // De zones als achtergrondkleur, zodat je de grenzen ziet vóór je ze raakt.
  const grenzen = [
    { tot: zones.veilig, kleur: 'rgba(95,191,138,0.30)' },
    { tot: zones.grens, kleur: 'rgba(224,180,92,0.30)' },
    { tot: zones.hard, kleur: 'rgba(217,105,79,0.30)' },
  ];
  let vorig = 0;
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.clip();
  for (const g of grenzen) {
    const a = clamp(vorig / zones.hard, 0, 1) * w;
    const b = clamp(g.tot / zones.hard, 0, 1) * w;
    ctx.fillStyle = g.kleur;
    ctx.fillRect(x + a, y, b - a, h);
    vorig = g.tot;
  }
  ctx.restore();

  const f = clamp(waarde / zones.hard, 0, 1);
  const kleur = waarde <= zones.veilig ? HUD.goed : waarde <= zones.grens ? HUD.let : HUD.slecht;
  ctx.fillStyle = kleur;
  const bx = x + f * w;
  ctx.fillRect(bx - 1.5, y - 2, 3, h + 4);

  if (label) {
    ctx.fillStyle = HUD.tekst;
    ctx.font = '600 10px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 7);
  }
}

/** Ronde meter, voor debiet en druk. */
export function meter(ctx, cx, cy, r, fractie, kleur, label, waarde) {
  const start = Math.PI * 0.75;
  const eind = Math.PI * 2.25;
  ctx.lineCap = 'round';
  ctx.strokeStyle = HUD.balkLeeg;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, eind);
  ctx.stroke();

  ctx.strokeStyle = kleur;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + (eind - start) * clamp(fractie, 0, 1));
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = HUD.tekst;
  ctx.font = `700 ${Math.round(r * 0.44)}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(waarde, cx, cy - r * 0.05);
  ctx.fillStyle = HUD.tekstZacht;
  ctx.font = '600 9px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(label, cx, cy + r * 0.42);
}

/** Regeltje tekst in de HUD: label links, waarde rechts. */
export function regel(ctx, x, y, w, label, waarde, kleur) {
  ctx.font = '500 11px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = HUD.tekstZacht;
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = kleur || HUD.tekst;
  ctx.font = '600 11px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(waarde, x + w, y);
}

/** Kompasroos die de koers en de stroomrichting samen laat zien. */
export function kompas(ctx, cx, cy, r, koers, stroomHoek, stroomKracht) {
  ctx.save();
  ctx.strokeStyle = HUD.paneelRand;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = HUD.tekstZacht;
  ctx.font = '600 9px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [t, a] of [['N', -Math.PI / 2], ['O', 0], ['Z', Math.PI / 2], ['W', Math.PI]]) {
    ctx.fillText(t, cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
  }

  // De stroompijl: waar het water heen loopt, en hoe hard.
  if (stroomKracht > 0.02) {
    ctx.strokeStyle = HUD.accent;
    ctx.lineWidth = 2 + clamp(stroomKracht, 0, 2);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(stroomHoek) * r * 0.6, cy - Math.sin(stroomHoek) * r * 0.6);
    ctx.lineTo(cx + Math.cos(stroomHoek) * r * 0.6, cy + Math.sin(stroomHoek) * r * 0.6);
    ctx.stroke();
    ctx.fillStyle = HUD.accent;
    ctx.beginPath();
    const hx = cx + Math.cos(stroomHoek) * r * 0.6;
    const hy = cy + Math.sin(stroomHoek) * r * 0.6;
    ctx.moveTo(hx + Math.cos(stroomHoek) * 6, hy + Math.sin(stroomHoek) * 6);
    ctx.lineTo(hx + Math.cos(stroomHoek + 2.5) * 6, hy + Math.sin(stroomHoek + 2.5) * 6);
    ctx.lineTo(hx + Math.cos(stroomHoek - 2.5) * 6, hy + Math.sin(stroomHoek - 2.5) * 6);
    ctx.closePath();
    ctx.fill();
  }

  // De eigen boot als driehoekje.
  ctx.fillStyle = '#f0c078';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(koers) * r * 0.42, cy + Math.sin(koers) * r * 0.42);
  ctx.lineTo(cx + Math.cos(koers + 2.6) * r * 0.28, cy + Math.sin(koers + 2.6) * r * 0.28);
  ctx.lineTo(cx + Math.cos(koers - 2.6) * r * 0.28, cy + Math.sin(koers - 2.6) * r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Het overzichtskaartje rechtsonder: de hele ARA-regio in één vakje, met de
 * vaarwegen, je eigen positie en je bestemming. Het wordt één keer gebakken —
 * de vaarwegen bewegen niet — en per frame alleen aangevuld met de stipjes.
 */
let kaartCache = null;

export function tekenMiniKaart(ctx, wereld, schipper, x, y, w, h, doel) {
  const vw = wereld.vaarwater;
  const marge = 6;
  const sw = w - marge * 2;
  const sh = h - marge * 2;
  const wx = (px) => x + marge + (px / vw.wereldB) * sw;
  const wy = (py) => y + marge + (py / vw.wereldH) * sh;

  paneel(ctx, x, y, w, h, 5);

  if (!kaartCache || kaartCache.w !== w || kaartCache.h !== h) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * 2);
    cv.height = Math.ceil(h * 2);
    const g = cv.getContext('2d');
    g.scale(2, 2);
    g.translate(marge, marge);
    g.scale(sw / vw.wereldB, sh / vw.wereldH);
    g.strokeStyle = 'rgba(120,175,210,0.55)';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const weg of vw.wegen) {
      g.lineWidth = Math.max(vw.wereldB / sw * 1.1, weg.breedte * 0.9);
      g.stroke(weg.pad);
    }
    g.fillStyle = 'rgba(60,110,150,0.35)';
    g.fill(vw.zeePad);
    kaartCache = { w, h, canvas: cv };
  }
  ctx.drawImage(kaartCache.canvas, x, y, w, h);

  if (doel) {
    const l = vw.ligIndex[doel];
    if (l) {
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(wx(l.x), wy(l.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#f08a5a';
  ctx.beginPath();
  ctx.arc(wx(schipper.x), wy(schipper.y), 3, 0, Math.PI * 2);
  ctx.fill();
}

export { clamp };
