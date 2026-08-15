// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: HUD-kleurenpalet, panelen, balken en iconen.
import { TAU, clamp } from '../util.js';
import { NATIES } from '../data.js';
import { plaats } from '../sprite.js';
import { roundRechthoek } from './steden.js';

// --- HUD ------------------------------------------------------------------

/**
 * De kleuren van de HUD, gelijk aan de tokens boven in `css/game.css`.
 *
 * Ze staan hier omdat het canvas geen CSS-variabelen kan lezen, en ze staan op
 * één plek omdat er anders twee spellen achter elkaar te zien zijn: perkament
 * en goud zodra er een paneel opengaat, donkergrijze balkjes zodra het dicht
 * is. Elke HUD — zeilen, zeeslag, duel — put hieruit.
 */
export const HUD = {
  perkament: '#efe0bb',
  perkamentDiep: '#e2cfa3',
  inkt: '#37281a',
  inktZacht: '#6a563c',
  goud: '#b8862f',
  goudLicht: '#d9a441',
  groen: '#4f7a3f',
  rood: '#9c3a2c',
};

/** Perkamenten paneel met messing rand; de basis onder elk HUD-vak. */
export function hudPaneel(ctx, x, y, w, h, r = 6) {
  ctx.save();
  // Slagschaduw als eigen vorm: een canvas-shadowBlur is voor een vak dat elk
  // beeld terugkomt onnodig duur.
  roundRechthoek(ctx, x + 1.5, y + 2.5, w, h, r);
  ctx.fillStyle = 'rgba(8,16,26,0.4)';
  ctx.fill();

  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, HUD.perkament);
  g.addColorStop(1, HUD.perkamentDiep);
  roundRechthoek(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = HUD.goud;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Lichtlijn langs de bovenrand: dat maakt van een vlak een plaatje messing.
  ctx.strokeStyle = 'rgba(255,252,240,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y + 1.2);
  ctx.lineTo(x + w - r, y + 1.2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Ingesneden balk met vulling. De groef is donker en de vulling heeft een
 * lichtrand bovenaan, zodat hij in het perkament gesneden lijkt in plaats van
 * erop geplakt.
 */
export function hudBalk(ctx, x, y, w, h, fractie, kleur, label) {
  ctx.save();
  roundRechthoek(ctx, x, y, w, h, Math.min(3, h / 2));
  ctx.fillStyle = 'rgba(60,44,22,0.3)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,44,22,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const f = clamp(fractie, 0, 1);
  if (f > 0.005) {
    ctx.save();
    roundRechthoek(ctx, x, y, w, h, Math.min(3, h / 2));
    ctx.clip();
    ctx.fillStyle = kleur;
    ctx.fillRect(x, y, w * f, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w * f, Math.max(1, h * 0.3));
    ctx.restore();
  }
  if (label) {
    ctx.font = `600 ${Math.round(Math.min(11, h * 0.8))}px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = HUD.inkt;
    ctx.fillText(label, x + 5, y + h / 2 + 0.5);
  }
  ctx.restore();
}

/** Kleur van een balk die van goed naar slecht loopt (romp, geest, volk). */
export function hudStand(f) {
  return f > 0.5 ? HUD.groen : f > 0.25 ? HUD.goud : HUD.rood;
}

/**
 * Het kaartsymbool van een natie: kleur én vorm.
 *
 * Op een stip van een paar pixels zijn vier warme kleuren niet uit elkaar te
 * houden, en voor wie kleurenblind is al helemaal niet. Een cirkel, een
 * vierkant, een ruit en een driehoek wél — en het is bovendien precies hoe een
 * echte zeekaart zijn plaatsen aangeeft.
 */
export function natieStip(ctx, x, y, natieId, r, omranding) {
  const n = NATIES[natieId] || NATIES.piraat;
  ctx.save();
  ctx.beginPath();
  switch (n.merk) {
    case 'vierkant':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'ruit':
      ctx.moveTo(x, y - r * 1.28);
      ctx.lineTo(x + r * 1.28, y);
      ctx.lineTo(x, y + r * 1.28);
      ctx.lineTo(x - r * 1.28, y);
      ctx.closePath();
      break;
    case 'driehoek':
      ctx.moveTo(x, y - r * 1.3);
      ctx.lineTo(x + r * 1.16, y + r * 0.86);
      ctx.lineTo(x - r * 1.16, y + r * 0.86);
      ctx.closePath();
      break;
    case 'kruis':
      ctx.rect(x - r * 1.3, y - r * 0.42, r * 2.6, r * 0.84);
      ctx.rect(x - r * 0.42, y - r * 1.3, r * 0.84, r * 2.6);
      break;
    default:
      ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = n.kleur;
  ctx.fill();
  if (omranding) {
    ctx.strokeStyle = omranding;
    ctx.lineWidth = Math.max(0.6, r * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Het eigen schip op een kaart: een stralende achtpuntige ster in een zachte
 * gloed, met een koerspijltje eraan vast.
 *
 * Vóór dit teken was de speler een vlakke stip in dezelfde kleurfamilie als
 * Spanje — op de drukke Zeekaart ging hij straal tussen de stadssymbolen
 * verloren. Geen enkele natie of de Kapersbaai gebruikt een ster, dus dit
 * symbool is nu op het eerste gezicht "ik", niet "een plaats". `koers` is
 * optioneel (radialen); `puls` (0..1) laat de gloed ademen op kaarten die elk
 * beeld opnieuw tekenen — laat hem weg op een kaart die maar één keer
 * getekend wordt.
 */
export function spelerMerk(ctx, x, y, r, koers = null, puls = 0) {
  ctx.save();
  ctx.translate(x, y);

  const gloedR = r * (3.4 + puls * 0.6);
  const gloed = ctx.createRadialGradient(0, 0, 0, 0, 0, gloedR);
  gloed.addColorStop(0, `rgba(255,232,150,${0.55 + puls * 0.15})`);
  gloed.addColorStop(1, 'rgba(255,232,150,0)');
  ctx.fillStyle = gloed;
  ctx.beginPath();
  ctx.arc(0, 0, gloedR, 0, TAU);
  ctx.fill();

  if (koers != null) {
    ctx.save();
    ctx.rotate(koers);
    ctx.fillStyle = '#2b1d12';
    ctx.beginPath();
    ctx.moveTo(r * 2.5, 0);
    ctx.lineTo(r * 1.15, r * 0.62);
    ctx.lineTo(r * 1.15, -r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r * 1.5 : r * 0.55;
    const px = Math.cos(a) * rr,
      py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff3d6';
  ctx.fill();
  ctx.strokeStyle = '#2b1d12';
  ctx.lineWidth = Math.max(0.8, r * 0.22);
  ctx.stroke();

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

