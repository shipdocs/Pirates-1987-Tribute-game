// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: schepen — romp, tuigage, zeilen en deining.
import { TAU, clamp, lerp, normAngle, sierTijd, sierRustig } from '../util.js';
import { NATIES, SCHIP_INDEX, SCHEEP_MAAT } from '../data.js';
import { bandVoor, maakBakkerij, plaats } from '../sprite.js';
import { transformSchaal, ZON_X, ZON_Y } from './hulpjes.js';

// --- Schepen --------------------------------------------------------------

export function scheepMaat(typeId) {
  return SCHEEP_MAAT[typeId] || [20, 8, 2];
}

/**
 * De zoomstand waarop alles in de wereld op ware grootte wordt getekend.
 *
 * Schepen en steden moeten het hierover eens zijn, anders is een sloep groter
 * dan een haven. `sail.js` neemt dit getal ook als standaardzoom van de camera,
 * zodat de gewone speelstand precies de eerlijke stand is.
 */
export const WARE_ZOOM = 1.9;

/**
 * Schaal waarop een wereldobject getekend wordt bij een gegeven zoom.
 *
 * Op of boven `WARE_ZOOM` is dat 1: ware grootte. Dat is geen smaak maar een
 * grens — `isVaren` rekent met een botsingsstraal in wereldeenheden die niet
 * meeschaalt, dus alles boven 1 steekt verder dan waar het spel land ziet.
 * Daaronder loopt hij op, want op het kaartoverzicht moet je je vloot en de
 * havens nog kunnen vinden.
 */
export function wereldSchaal(zoom) {
  return clamp(WARE_ZOOM / (zoom || 1), 1, 3);
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
 * De romp met alles wat er vast aan zit: houtwerk, dek, geschut, dekwerk en het
 * staande want. Hangt alleen af van het type en het aantal kanonspoorten, dus
 * we bakken hem één keer in een sprite — en juist daarom kan er detail in dat
 * per beeld onbetaalbaar zou zijn.
 */
function tekenRompDetail(ctx, L, B, poorten, masten) {
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

  // Planken: horizontale naden tussen de gangen, lichter in het middenvlak.
  ctx.strokeStyle = 'rgba(43,29,16,0.35)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) {
    const py = -B * 0.42 + i * B * 0.21;
    ctx.beginPath();
    ctx.moveTo(L * 0.38, py);
    ctx.quadraticCurveTo(L * 0.1, py + B * 0.03, -L * 0.42, py);
    ctx.stroke();
  }

  // Walen (dikke planken langs de zijkant).
  ctx.strokeStyle = 'rgba(60,42,22,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L * 0.42, -B * 0.28);
  ctx.quadraticCurveTo(0, -B * 0.48, -L * 0.44, -B * 0.3);
  ctx.moveTo(L * 0.4, B * 0.28);
  ctx.quadraticCurveTo(0, B * 0.48, -L * 0.44, B * 0.3);
  ctx.stroke();

  // Dek met een warme gloed naar de boeg.
  const dekGrad = ctx.createLinearGradient(L * 0.4, 0, -L * 0.4, 0);
  dekGrad.addColorStop(0, '#c09a62');
  dekGrad.addColorStop(1, '#a3814b');
  ctx.fillStyle = dekGrad;
  romPad(ctx, L * 0.8, B * 0.56);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,42,22,0.4)';
  ctx.lineWidth = 0.6;
  romPad(ctx, L * 0.8, B * 0.56);
  ctx.stroke();

  // Dekplanken: fijnere, gebogen naden en een donkere kielzwarte streep.
  ctx.strokeStyle = 'rgba(60,42,22,0.22)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 6; i++) {
    const py = -B * 0.22 + i * B * 0.088;
    ctx.beginPath();
    ctx.moveTo(-L * 0.36, py);
    ctx.quadraticCurveTo(0, py + B * 0.045, L * 0.36, py);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(40,26,14,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(L * 0.38, 0);
  ctx.quadraticCurveTo(0, B * 0.05, -L * 0.4, 0);
  ctx.stroke();

  // Achterkasteel.
  ctx.fillStyle = '#6b4a28';
  ctx.beginPath();
  ctx.ellipse(-L * 0.34, 0, L * 0.14, B * 0.4, 0, 0, TAU);
  ctx.fill();
  // Sierrand op het kasteel.
  ctx.strokeStyle = '#d9b98a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-L * 0.34, 0, L * 0.1, B * 0.32, 0, -2.4, 2.4);
  ctx.stroke();
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

  // Roer aan de spiegel.
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = Math.max(0.7, B * 0.07);
  ctx.beginPath();
  ctx.moveTo(-L * 0.485, 0);
  ctx.lineTo(-L * 0.53, -B * 0.16);
  ctx.stroke();

  // Boegspriet / galjoen met een vage figuurbalk eronder.
  ctx.strokeStyle = '#5c4023';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L * 0.48, 0);
  ctx.quadraticCurveTo(L * 0.62, -B * 0.08, L * 0.7, -B * 0.02);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,42,22,0.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(L * 0.48, B * 0.05);
  ctx.quadraticCurveTo(L * 0.58, B * 0.22, L * 0.63, B * 0.1);
  ctx.stroke();

  // Spil/capstan vóór op het dek.
  ctx.fillStyle = '#4a331b';
  ctx.beginPath();
  ctx.arc(L * 0.2, 0, B * 0.11, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#d9b98a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(L * 0.2, 0, B * 0.06, 0, TAU);
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
      // Koperen randje om de kanonspoort.
      ctx.strokeStyle = 'rgba(214,178,92,0.6)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px - 1.2, -B / 2 + 0.5, 2.4, 1.8);
      ctx.strokeRect(px - 1.2, B / 2 - 2.3, 2.4, 1.8);
      // De loop die uit de poort steekt. Een open poort zonder stuk erin is een
      // gat; met een loop erin zie je waar de breedzijde vandaan komt. Kort en
      // in hout gehouden: zwarte staven van anderhalve eenheid maakten van de
      // poortenrij een kam, en de koperen randjes zijn al opvallend genoeg.
      ctx.fillStyle = '#2b1f12';
      ctx.fillRect(px - 0.3, -B / 2 - 0.5, 0.6, 1.0);
      ctx.fillRect(px - 0.3, B / 2 - 0.5, 0.6, 1.0);
    }
  }

  // --- Dekwerk --------------------------------------------------------------
  // Alles hieronder hangt uitsluitend van het scheepstype af, dus het hoort in
  // de sprite en niet in de tekenlus. Dat is precies waarom het er nu ís: per
  // beeld zou dit niet te betalen zijn, één keer gebakken kost het niets.

  // Eén luik met roosterwerk, midscheeps. Twee bleken er één te veel: samen met
  // het staande want stond het dek vol ruitjes en las het als een stapel kratten.
  for (const [lx, lw] of [[-L * 0.04, L * 0.09]]) {
    const lh = B * 0.17;
    ctx.fillStyle = '#5a3f22';
    ctx.fillRect(lx - lw / 2, -lh / 2, lw, lh);
    ctx.strokeStyle = 'rgba(28,18,10,0.5)';
    ctx.lineWidth = 0.3;
    for (let i = 1; i < 3; i++) {
      const gx = lx - lw / 2 + (i * lw) / 3;
      ctx.beginPath();
      ctx.moveTo(gx, -lh / 2);
      ctx.lineTo(gx, lh / 2);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const gy = -lh / 2 + (i * lh) / 3;
      ctx.beginPath();
      ctx.moveTo(lx - lw / 2, gy);
      ctx.lineTo(lx + lw / 2, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,180,130,0.22)';
    ctx.lineWidth = 0.35;
    ctx.strokeRect(lx - lw / 2, -lh / 2, lw, lh);
  }

  // De sloep, ondersteboven op het dek gesjord tussen de masten.
  if (L > 26) {
    ctx.fillStyle = '#6d4c29';
    ctx.beginPath();
    ctx.ellipse(-L * 0.16, 0, L * 0.08, B * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(32,22,12,0.55)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-L * 0.24, 0);
    ctx.lineTo(-L * 0.08, 0);
    ctx.stroke();
  }

  // Betings vóór de mast, waar het lopend want op wordt belegd.
  ctx.fillStyle = '#3a2a18';
  for (const bx of [L * 0.26, -L * 0.3]) {
    ctx.beginPath();
    ctx.arc(bx, -B * 0.12, 0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, B * 0.12, 0.5, 0, TAU);
    ctx.fill();
  }

  // --- Staand want ----------------------------------------------------------
  // Dit stond in de tekenlus en verscheen alleen mét zeil. Staand want blijft
  // juist staan als de zeilen gegeid zijn — het houdt de mast overeind. Nu in
  // de sprite, en meteen als echt want: hoofdtouwen van de mast naar de
  // rusten, met weeflijnen ertussen.
  const mastX = [];
  for (let m = 0; m < masten; m++) {
    mastX.push(masten === 1 ? L * 0.32 : lerp(L * 0.32, -L * 0.22, m / (masten - 1)));
  }
  const rustY = B * 0.46;
  ctx.strokeStyle = 'rgba(48,36,22,0.34)';
  for (const mx of mastX) {
    for (const zij of [-1, 1]) {
      // Drie hoofdtouwen die naar achteren uitwaaieren, zoals een puttingwant.
      ctx.lineWidth = 0.26;
      for (let k = 0; k < 3; k++) {
        const sp = (k - 1) * L * 0.032;
        ctx.beginPath();
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx + sp, zij * rustY);
        ctx.stroke();
      }
      // Hier zaten weeflijnen — de sporten waarlangs het volk naar boven klimt.
      // Van bovenaf maakten ze van elk want een laddertje op het dek, en met
      // drie masten lagen er zes ladders op een schip van honderd pixels. Het
      // want is smal en de sporten zijn korter dan een pixel: dan blijft er van
      // touwwerk alleen ruis over. Alleen de hoofdtouwen dus.
    }
  }
  // Stagen tussen de masten: de lengteverstaging van het tuig.
  ctx.lineWidth = 0.3;
  for (let i = 0; i < mastX.length - 1; i++) {
    for (const zij of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mastX[i], zij * B * 0.62);
      ctx.lineTo(mastX[i + 1], zij * B * 0.62);
      ctx.stroke();
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
// bovenop de vijand ligt. De cache zelf staat in `sprite.js`; deze functie doet
// niets anders dan de maten aanleveren.
// Ruim een miljoen pixels: een linieschip op de hoogste zoomstand is in zijn
// eentje al 134 duizend, dus dit houdt een compleet eskader vast zonder dat het
// geheugen met de speelduur meegroeit.
const rompBakkerij = maakBakkerij('rompen', 1.2e6);

function rompSprite(typeId, poorten, dichtheid) {
  const [L, B, masten] = scheepMaat(typeId);
  // Ruim genoeg voor de boegspriet (tot 0,70·L) en het achterwerk.
  return rompBakkerij.haal(`${typeId}|${poorten}`, L * 0.75, B * 0.75, bandVoor(dichtheid), (g) =>
    tekenRompDetail(g, L, B, poorten, masten)
  );
}

/**
 * Eén razeil met zijn ra, gezien van boven, met de mast in de oorsprong.
 *
 * Alles hier staat vast ten opzichte van de ra. De trimhoek zit er nadrukkelijk
 * níet in: het zeil draait als geheel mee, en juist daardoor hoeft de hoek niet
 * in de cachesleutel. Zonder die eigenschap zou elke graad wind een eigen sprite
 * vragen en was bakken zinloos.
 */
function tekenZeil(ctx, zl, zb, tuigage, m) {
  // Zeil met een warme schaduw naar de ra en een lichte buik op de lij.
  const zg = ctx.createLinearGradient(0, -zb, 0, zb);
  zg.addColorStop(0, '#e8dfc4');
  zg.addColorStop(0.45, '#f7f2e0');
  zg.addColorStop(0.9, '#e3d8b8');
  zg.addColorStop(1, '#cfc3a6');
  ctx.fillStyle = zg;
  ctx.strokeStyle = 'rgba(90,75,50,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  // Bol staand zeil: de buik staat naar lij.
  ctx.moveTo(-zl * 0.25, -zb);
  ctx.quadraticCurveTo(zl * 1.25, 0, -zl * 0.25, zb);
  ctx.quadraticCurveTo(zl * 0.12, 0, -zl * 0.25, -zb);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.clip();
  // Schaduw in de holte van het zeil: het doek staat bol, dus vlak achter de ra
  // valt minder licht dan op de buik. Dit is wat een zeil van een vlak vlekje
  // onderscheidt.
  const holte = ctx.createLinearGradient(-zl * 0.25, 0, zl * 0.5, 0);
  holte.addColorStop(0, 'rgba(96,78,50,0.34)');
  holte.addColorStop(0.55, 'rgba(120,100,66,0.04)');
  holte.addColorStop(1, 'rgba(255,248,224,0.22)');
  ctx.fillStyle = holte;
  ctx.fillRect(-zl, -zb - 2, zl * 2, zb * 2 + 4);

  // Bloem-/panellijnen: verticale baanstiksels en een bonnet-zoom onderaan.
  ctx.strokeStyle = 'rgba(120,95,62,0.28)';
  ctx.lineWidth = 0.45;
  for (let p = 0; p < 3; p++) {
    const sx = -zl * 0.18 + p * zl * 0.42;
    ctx.beginPath();
    ctx.moveTo(sx, -zb + 1);
    ctx.quadraticCurveTo(sx + zl * 0.18, 0, sx, zb - 1);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,95,62,0.42)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-zl * 0.22, zb - 1);
  ctx.quadraticCurveTo(zl * 0.55, zb - 1.5, -zl * 0.05, zb - 1);
  ctx.stroke();
  // Bug: de ra-lijn met de reefpunten.
  ctx.strokeStyle = 'rgba(90,75,50,0.4)';
  ctx.lineWidth = 0.5;
  for (let r = 1; r < 5; r++) {
    const ry = -zb + r * ((zb * 2) / 5);
    ctx.beginPath();
    ctx.moveTo(-zl * 0.2, ry);
    ctx.quadraticCurveTo(zl * 0.55, ry * 0.9, -zl * 0.05, ry);
    ctx.stroke();
  }
  // Reefbanden: de dubbel genaaide stroken waar het zeil ingekort wordt.
  ctx.fillStyle = 'rgba(150,126,86,0.18)';
  for (const rb of [0.42, 0.68]) {
    ctx.fillRect(-zl * 0.25, -zb + zb * 2 * rb, zl * 0.9, zb * 0.05);
  }
  ctx.restore();

  // Gescheurde zeilen bij lage tuigage. Hoort binnen de sprite: hij hangt van de
  // tuigage af, en die staat in de sleutel.
  if (tuigage < 0.82) {
    const gatAlfa = (0.82 - tuigage) * 1.6;
    ctx.fillStyle = `rgba(4,20,36,${0.5 * gatAlfa})`;
    const gn = 2 + Math.floor((1 - tuigage) * 5);
    for (let g = 0; g < gn; g++) {
      const gx = -zl * 0.2 + (((g * 37 + m * 11) % 60) / 60) * zl * 0.7;
      const gy = -zb + (((g * 29 + m * 17) % 70) / 70) * zb * 1.6;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 1.4, 1.8, 0, 0, TAU);
      ctx.fill();
    }
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
  // Toppenanten: de lijnen van de nokken naar de masttop, die de ra ophangen.
  ctx.strokeStyle = 'rgba(48,36,22,0.5)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-zl * 0.34, -zb);
  ctx.lineTo(0, -zb * 0.16);
  ctx.moveTo(-zl * 0.34, zb);
  ctx.lineTo(0, zb * 0.16);
  ctx.stroke();
}

// Zeilen per (type, zeilstand, tuigage, mast). De stappen zijn grof genoeg dat
// een schip er hooguit een handvol van vult, en fijn genoeg dat je het zeil ziet
// bijzetten in plaats van springen.
const ZEIL_STAPPEN = 12;
const TUIG_STAPPEN = 8;
const zeilBakkerij = maakBakkerij('zeilen', 1.2e6);

function zeilSprite(typeId, grootte, tuigage, m, dichtheid) {
  const [L, B] = scheepMaat(typeId);
  const gQ = Math.max(1, Math.round(grootte * ZEIL_STAPPEN)) / ZEIL_STAPPEN;
  const tQ = Math.round(tuigage * TUIG_STAPPEN) / TUIG_STAPPEN;
  const zb = B * 1.7 * gQ;
  const zl = L * 0.34 * gQ;
  // De buik reikt tot ongeveer een halve `zl` naar lij, de raar tot 0,4 naar
  // loef; het vak is symmetrisch om de mast, dus de ruimste van de twee telt.
  return zeilBakkerij.haal(
    `${typeId}|${gQ}|${tQ}|${m}`,
    zl * 0.6 + 3,
    zb + 4,
    bandVoor(dichtheid),
    (g) => tekenZeil(g, zl, zb, tQ, m)
  );
}

/**
 * Tekent één schip. Coördinaten in wereldruimte, camera-transform actief.
 * opts: {zeilen 0..1, vaart, geschut, tijd, schaal}
 */
/**
 * Hoe een schip in de zeegang werkt, recht van boven gezien.
 *
 * Rollen en stampen draaien om een horizontale as; van bovenaf zie je die
 * kanteling niet, maar wél de verkorting die erbij hoort — een overhellend
 * schip laat minder breedte zien, een stampend schip minder lengte. Samen met
 * een paar graden gieren en wat op-en-neer is dat genoeg om een romp te lezen
 * die dóór de golven gaat in plaats van eroverheen te schuiven.
 *
 * De golven lopen met de wind mee (zo tekent `tekenZee` ze ook), dus de hoek
 * tussen koers en wind bepaalt wát het schip doet: kop op zee stampt het,
 * dwars in de golven rolt het. Puur tekenwerk — de koers en de romp waarmee
 * gerekend en gebotst wordt blijven onaangeroerd, anders zou mikken in een
 * gevecht van geluk afhangen.
 */
function deining(x, y, koers, L, st, zeegang) {
  const stil = { gier: 0, langs: 1, dwars: 1, hef: 1, spat: 0 };
  if (!zeegang || sierRustig()) return stil;
  const kracht = clamp(zeegang.kracht == null ? 1 : zeegang.kracht, 0, 2.4);
  if (kracht < 0.05) return stil;
  // Dezelfde golf pakt een sloep veel harder aan dan een linieschip. De klem
  // erboven houdt ook het kleinste scheepje in het zwaarste weer leesbaar.
  const amp = clamp(kracht * clamp(26 / L, 0.45, 1.5), 0, 2);
  // Elk schip zijn eigen fase, uit zijn plek afgeleid: een vloot die synchroon
  // deint verraadt zich onmiddellijk als tekenwerk.
  const fase = x * 0.031 + y * 0.047;
  const rel = normAngle(koers - zeegang.richting);
  // Stampen volgt de golfhelling in de lengte, en kop op zee zwaarder dan met
  // de golven mee. Rollen volgt diezelfde helling dwarsscheeps.
  const kopOp = clamp(-Math.cos(rel), 0, 1);
  const stampAmp = Math.abs(Math.cos(rel)) * (0.55 + 0.45 * kopOp);
  const stamp = Math.sin(st * 1.9 + fase) * stampAmp * amp;
  const rol = Math.sin(st * 1.25 + fase * 1.7) * Math.abs(Math.sin(rel)) * amp;
  const hef = Math.sin(st * 1.55 + fase * 0.6) * amp;
  return {
    // Gieren: het schip zoekt een paar graden om zijn koers heen. Dit is het
    // zwaarste gewicht van de vier, want een draaiing lees je op elke maat —
    // en op de zeekaart is het eigen schip maar een pixel of dertig lang, dus
    // van verkorting alleen zou je niets merken.
    gier: rol * 0.08 + stamp * 0.04,
    langs: 1 - Math.abs(stamp) * 0.07,
    dwars: 1 - Math.abs(rol) * 0.14,
    hef: 1 + hef * 0.03,
    // Kop op zee slaat de boeg water op.
    spat: clamp(kopOp * kracht * 0.55, 0, 1),
  };
}

export function tekenSchip(ctx, x, y, koers, typeId, natieId, windRichting, opts = {}) {
  const [L, B, masten] = scheepMaat(typeId);
  const s = opts.schaal || 1;
  const zeilen = opts.zeilen == null ? 1 : clamp(opts.zeilen, 0, 1);
  const natie = NATIES[natieId] || NATIES.piraat;
  const vaart = clamp(opts.vaart || 0, 0, 1);
  // Zichtbare staat: `tuigage` (0..1) en `romp`/`maxRomp` (fractie 0..1)
  // sturen gaten in de zeilen, gekantelde masten en een diepe waterlijn.
  const tuigage = opts.tuigage == null ? 1 : clamp(opts.tuigage, 0.15, 1);
  const rompFractie = opts.rompFractie == null ? 1 : clamp(opts.rompFractie, 0, 1);
  const dichtheid = transformSchaal(ctx) * s;
  const st = sierTijd(opts.tijd || 0);
  // Optioneel van de scène meegegeven: aanwezig = het schip vaart langs echte
  // kust, zodat we kielzog, schaduw en boegspat kunnen laten reageren.
  const isLand = opts.isLand || (() => false);

  // Hoe dicht is het schip bij land? 0 = open zee, 1 = pal langs de kust.
  let landFactor = 0;
  if (opts.isLand) {
    let raak = 0;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      if (isLand(x + Math.cos(a) * L, y + Math.sin(a) * L)) raak++;
    }
    landFactor = raak / 6;
  }

  // Zoveel kanonspoorten als het schip werkelijk stukken aan een boord heeft.
  const stukken = opts.geschut != null ? opts.geschut : SCHIP_INDEX[typeId]?.geschut ?? 0;
  const poorten = clamp(Math.round(stukken / 2), 0, Math.max(1, Math.floor(L / 4.6)));

  // Werken van het schip in de zeegang.
  const zee = deining(x, y, koers, L, st, opts.zeegang);

  // Kielzog: uitwaaierend schuim dat naar achteren vervaagt.
  if (vaart > 0.05) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(koers);
    ctx.scale(s, s);
    const w = vaart;
    // Vlak langs de kust wordt het kielzog korter en ijler: het schuim kan
    // niet door het strand lopen.
    const len = L * 2.4 * w * (1 - 0.45 * landFactor);
    const wake = ctx.createLinearGradient(-L * 0.5, 0, -L * 0.5 - len, 0);
    wake.addColorStop(0, `rgba(230,248,252,${0.34 * w * (1 - 0.3 * landFactor)})`);
    wake.addColorStop(1, 'rgba(230,248,252,0)');
    ctx.fillStyle = wake;
    ctx.beginPath();
    ctx.moveTo(-L * 0.46, -B * 0.3);
    ctx.quadraticCurveTo(-L * 0.5 - len * 0.5, -B * 0.62, -L * 0.5 - len, -B * 0.9);
    ctx.lineTo(-L * 0.5 - len, B * 0.9);
    ctx.quadraticCurveTo(-L * 0.5 - len * 0.5, B * 0.62, -L * 0.46, B * 0.3);
    ctx.closePath();
    ctx.fill();
    // Boeggolf: op open zee een strakke krul; dichter bij de kust schuimt-ie
    // breder uit en deint hij sterker. Kop op zee slaat de boeg er water bij
    // op — dat is de zichtbare prijs van tegen de golven in varen.
    const spat = 0.3 * w + 0.25 * w * landFactor + 0.28 * w * zee.spat;
    const breed = landFactor + 0.7 * zee.spat;
    ctx.globalAlpha = spat;
    ctx.strokeStyle = '#eafbff';
    ctx.lineWidth = 1.6 + 1.4 * breed;
    ctx.beginPath();
    ctx.moveTo(L * 0.42, -B * (0.34 + 0.5 * breed * Math.sin(st * 9)));
    ctx.quadraticCurveTo(L * (0.62 + 0.1 * breed), -B * 0.04 * breed, L * 0.42, B * (0.34 + 0.5 * breed * Math.sin(st * 9 + 1.4)));
    ctx.stroke();
    ctx.restore();
  }

  // Schaduw op het water. De verschuiving staat in wereldruimte, zodat de zon
  // voor de hele vloot uit dezelfde hoek schijnt. Op de branding vervaagt de
  // schaduw mee, anders lijkt het schip boven het strand te zweven.
  const schaduwAlfa = 0.4 * (1 - 0.45 * landFactor);
  ctx.save();
  ctx.translate(x + ZON_X * s, y + ZON_Y * s);
  // De schaduw werkt mee met de romp, anders laat hij bij elke golf los.
  ctx.rotate(koers + zee.gier);
  ctx.scale(s * zee.langs * zee.hef, s * zee.dwars * zee.hef);
  ctx.fillStyle = `rgba(4,22,36,${schaduwAlfa})`;
  romPad(ctx, L, B);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(koers + zee.gier);
  ctx.scale(s * zee.langs * zee.hef, s * zee.dwars * zee.hef);

  // Romp met al het vaste houtwerk, uit de sprite.
  const sp = rompSprite(typeId, poorten, dichtheid);
  plaats(ctx, sp);

  // Onderwater-silhouet: een vage donkere romp die onder het vlak steekt en
  // het water een beetje 'diep' maakt. Dichter bij de kust wordt hij lichter,
  // alsof de kiel naar de ondiepte omhoog komt.
  ctx.save();
  ctx.translate(0, 1.6 * (1 + landFactor));
  ctx.globalAlpha = 0.35 * (1 - 0.6 * landFactor);
  ctx.fillStyle = 'rgba(8,38,58,0.85)';
  romPad(ctx, L * 0.94, B * 0.7);
  ctx.fill();
  ctx.restore();

  // Zeilen: staan dwars op de wind, dus draaien mee met de relatieve windhoek.
  // Halveringsregel voor een razeil: bij wind pal van achteren staan de ra's
  // vierkant, dwars in de wind hangen ze op ongeveer 45 graden.
  if (zeilen > 0.02) {
    const rel = normAngle(windRichting - koers);
    const trim = clamp(rel * 0.5, -1.4, 1.4);
    for (let m = 0; m < masten; m++) {
      const px = lerp(L * 0.32, -L * 0.22, masten === 1 ? 0 : m / (masten - 1));
      const grootte = (m === 1 || masten === 1 ? 1 : 0.82) * zeilen;
      if (grootte > 0.02) {
        // Het zeil is een star geheel dat als eenheid met de ra meedraait — de
        // vorm hangt niet van de trimhoek af, alleen de draaiing. Daarom kan het
        // gebakken worden zonder de trim in de sleutel op te nemen; dat scheelt
        // een cache met tientallen hoekstanden per scheepstype.
        ctx.save();
        ctx.translate(px, 0);
        ctx.rotate(trim);
        plaats(ctx, zeilSprite(typeId, grootte, tuigage, m, dichtheid));
        ctx.restore();
      }

      // Mast met mars (het ronde platform, van bovenaf een schijfje om de mast).
      // Blijft levend: bij lage tuigage kantelt de mast zichtbaar, en die hoek
      // loopt door met de schade.
      const kantel = (1 - tuigage) * 0.18 * (m % 2 ? -1 : 1);
      ctx.save();
      ctx.translate(px, 0);
      ctx.rotate(kantel);
      ctx.fillStyle = 'rgba(58,42,24,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4 * grootte, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2a18';
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.8, 2.2, 0, 0, TAU);
      ctx.fill();
      // Hookje waar de ra ooit zat, achtergelaten als het touwwerk knapte.
      if (tuigage < 0.7) {
        ctx.strokeStyle = 'rgba(58,42,44,0.7)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -2.4 * grootte);
        ctx.stroke();
      }
      ctx.restore();
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
    if (natie.vlagStaand) {
      // Verticale banen (Franse driekleur).
      const x0 = -(i * fl) / 3;
      const x1 = -((i + 1) * fl) / 3;
      ctx.moveTo(x0, -fh / 2);
      ctx.lineTo(x1, -fh / 2 + (wapper * (i + 1)) / 6);
      ctx.lineTo(x1, fh / 2 + (wapper * (i + 1)) / 6);
      ctx.lineTo(x0, fh / 2);
    } else {
      // Horizontale banen: rood boven, wit midden, blauw onder.
      ctx.moveTo(0, -fh / 2 + (i * fh) / 3);
      ctx.lineTo(-fl, -fh / 2 + (i * fh) / 3 + (wapper * (i + 1)) / 3);
      ctx.lineTo(-fl, -fh / 2 + ((i + 1) * fh) / 3 + (wapper * (i + 1)) / 3);
      ctx.lineTo(0, -fh / 2 + ((i + 1) * fh) / 3);
    }
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

  // Diepe waterlijn: een zwaar geteisterde romp zakt zichtbaar in het water.
  // Een donkere 'waterstreep' schuift over het onderste deel van de romp.
  if (rompFractie < 0.85) {
    const diepte = (1 - rompFractie) * B * 0.5; // in rompeenheden, onder de kiel
    ctx.save();
    ctx.translate(x, y + diepte * 0.35);
    ctx.rotate(koers);
    ctx.scale(s, s);
    ctx.fillStyle = `rgba(8,38,58,${0.22 + 0.3 * (1 - rompFractie)})`;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, -B * 0.05);
    ctx.quadraticCurveTo(0, B * 0.4, -L * 0.5, -B * 0.05);
    ctx.lineTo(-L * 0.5, B * 0.5);
    ctx.quadraticCurveTo(0, B * 0.85, L * 0.5, B * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

