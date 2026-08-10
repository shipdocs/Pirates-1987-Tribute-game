// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: stormwolken, windwolken, regen, meeuwen, windroos.
import { TAU, clamp, lerp, makeRng, sierTijd, sierRustig } from '../util.js';
// world.js leunt alleen op util en data, dus dit levert geen kringetje op.
import { STORM_KERN, stormStraalBij, WORLD_W, WORLD_H } from '../world.js';
import { offscreen } from '../sprite.js';
import { mod, rgbVan } from './hulpjes.js';
import { HUD } from './hud.js';

// --- Stormwolken -----------------------------------------------------------

// Grijstinten voor de echte stormlagen: kalme wolken hebben hun eigen witte
// tekenlaag en worden nooit meer met dit dreigende wolkenlijf vermengd.
const WOLK_DONKER = [22, 34, 50];
const WOLK_MIDDEN = [52, 68, 88];

/** Mengt twee grijstinten tot een hexkleur (zonder '#') op fractie t. */
function mengGrijs(a, b, t) {
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

// Eén zachte, bobbelige deegwolk per kleur. Vier overlappende bobbels geven
// hem een onregelmatig silhouet — en doordat het geen gladde schijf is, is het
// trage draaien van zo'n wolk ook ergens aan te zien.
const deegWolken = new Map();

function deegWolk(kleur) {
  let c = deegWolken.get(kleur);
  if (c) return c;
  const S = 96;
  c = offscreen(S, S);
  const g = c.getContext('2d');
  const rgb = rgbVan(kleur);
  const m = S / 2;
  const bobbel = (dx, dy, r) => {
    const grad = g.createRadialGradient(m + dx, m + dy, 0, m + dx, m + dy, r);
    grad.addColorStop(0, `rgba(${rgb},0.95)`);
    grad.addColorStop(0.55, `rgba(${rgb},0.45)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(m + dx, m + dy, r, 0, TAU);
    g.fill();
  };
  bobbel(-16, -6, 32);
  bobbel(16, -12, 25);
  bobbel(-3, 16, 32);
  bobbel(21, 9, 21);
  if (deegWolken.size > 60) deegWolken.clear();
  deegWolken.set(kleur, c);
  return c;
}

/** Tekent één deegwolk op (x, y) met grootte r, draaiing en transparantie. */
function tekenDeeg(ctx, x, y, r, kleur, rot, alpha) {
  const img = deegWolk(kleur);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(img, -r, -r, r * 2, r * 2);
  ctx.restore();
}

// --- Kalme windwolken ----------------------------------------------------

// Drie kleine varianten voorkomen een zichtbaar stempelpatroon. In
// tegenstelling tot de zachte deegwolken van een storm hebben deze sprites een
// helder lijf en herkenbare stapelkoppen: wolkjes, geen mistplekken.
const windWolkSprites = [];

function windWolkSprite(variant) {
  if (windWolkSprites[variant]) return windWolkSprites[variant];
  const c = offscreen(192, 128);
  const g = c.getContext('2d');
  const v = variant % 3;
  const wolkPad = new Path2D();
  const ovaal = (x, y, rx, ry, rot = 0) => {
    // Zonder moveTo verbindt Canvas twee ellipsen met een rechte lijn. In een
    // samengestelde vorm kan die lijn een wig uit de wolk snijden.
    wolkPad.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
    wolkPad.ellipse(x, y, rx, ry, rot, 0, TAU);
  };
  ovaal(96, 78, 57, 24);
  ovaal(139, 74 - v * 2, 31 + v * 2, 24, 0.06);
  ovaal(104 + v * 4, 53, 32, 30 + v, -0.08);
  ovaal(70 - v * 3, 61, 27, 24 + v * 2, 0.04);
  ovaal(39, 77 + v, 24, 16 + v, -0.08);
  ovaal(20, 82 - v, 13, 9);

  g.save();
  g.translate(0, 7);
  g.filter = 'blur(6px)';
  g.fillStyle = 'rgba(75,105,125,0.28)';
  g.fill(wolkPad);
  g.restore();

  const lijf = g.createLinearGradient(0, 38, 0, 101);
  lijf.addColorStop(0, '#ffffff');
  lijf.addColorStop(0.58, '#f7faf9');
  lijf.addColorStop(1, '#dce8ec');
  g.fillStyle = lijf;
  g.fill(wolkPad);

  windWolkSprites[variant] = c;
  return c;
}

function tekenWindWolk(ctx, x, y, r, rot, alpha, variant) {
  const img = windWolkSprite(variant);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(img, -r * 1.5, -r, r * 3, r * 2);
  ctx.restore();
}

// Een vast, gezaaid wolkenveld dat als geheel met de wind meedrijft. De
// afzonderlijke wolken veranderen nooit plotseling van vorm: alleen hun
// positie schuift geïntegreerd op, zodat een winddraai geen beeldsprong geeft.
const windWolkVeld = { wereld: null, wolken: [], driftX: 0, driftY: 0, tijd: null };

function zorgVoorWindWolken(wereld) {
  if (windWolkVeld.wereld === wereld) return windWolkVeld.wolken;
  const rng = makeRng((wereld.seed ^ 0x77c10d) >>> 0);
  const wolken = [];
  const kolommen = 14;
  const rijen = 10;
  for (let rij = 0; rij < rijen; rij++) {
    for (let kolom = 0; kolom < kolommen; kolom++) {
      wolken.push({
        x: ((kolom + 0.12 + rng() * 0.76) / kolommen) * WORLD_W,
        y: ((rij + 0.12 + rng() * 0.76) / rijen) * WORLD_H,
        r: 18 + rng() * 12,
        draai: (rng() - 0.5) * 0.22,
        alfa: 0.62 + rng() * 0.16,
        fase: rng() * TAU,
        variant: Math.floor(rng() * 3),
      });
    }
  }
  windWolkVeld.wereld = wereld;
  windWolkVeld.wolken = wolken;
  windWolkVeld.driftX = 0;
  windWolkVeld.driftY = 0;
  windWolkVeld.tijd = null;
  return wolken;
}

function werkWolkDriftBij(wereld, tijd) {
  if (windWolkVeld.tijd === null) {
    windWolkVeld.tijd = tijd;
    return;
  }
  const dt = clamp(tijd - windWolkVeld.tijd, 0, 0.25);
  windWolkVeld.tijd = tijd;
  if (sierRustig()) return;
  const snelheid = 18 * clamp(wereld.windKracht || 1, 0.35, 1.8);
  windWolkVeld.driftX = mod(
    windWolkVeld.driftX + Math.cos(wereld.windRichting) * snelheid * dt,
    WORLD_W
  );
  windWolkVeld.driftY = mod(
    windWolkVeld.driftY + Math.sin(wereld.windRichting) * snelheid * dt,
    WORLD_H
  );
}

/**
 * Rustige witte stapelwolken op de zeilkaart. Hun trekrichting en snelheid
 * volgen de gewone wind; donkere wolken worden uitsluitend door de echte
 * stormcellen getekend.
 */
export function tekenWolken(ctx, wereld, cam, vw, vh, tijd) {
  const wolken = zorgVoorWindWolken(wereld);
  werkWolkDriftBij(wereld, tijd);
  const zoom = cam.zoom || 1;
  const marge = 130;
  const x0 = cam.x - vw / 2 / zoom - marge;
  const x1 = cam.x + vw / 2 / zoom + marge;
  const y0 = cam.y - vh / 2 / zoom - marge;
  const y1 = cam.y + vh / 2 / zoom + marge;
  const wind = wereld.windRichting || 0;
  const st = sierTijd(tijd);

  for (const wolk of wolken) {
    const x = mod(wolk.x + windWolkVeld.driftX, WORLD_W);
    const y = mod(wolk.y + windWolkVeld.driftY, WORLD_H);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const zweef = Math.sin(st * 0.18 + wolk.fase) * 1.5;
    const rot = wind + wolk.draai;
    tekenWindWolk(ctx, x, y + zweef, wolk.r, rot, wolk.alfa, wolk.variant);
  }
}

/** Vult een onregelmatige, golvende klont: de natuurlijke rand van de wolk. */
function wolkSilhouet(ctx, x, y, r, fase) {
  ctx.beginPath();
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * TAU;
    const rr = r * (
      1 +
      0.13 * Math.sin(a * 3 + fase * 1.3) +
      0.085 * Math.sin(a * 7 - fase * 0.9) +
      0.05 * Math.sin(a * 13 + fase * 2.2)
    );
    const qx = x + Math.cos(a) * rr;
    const qy = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(qx, qy);
    else ctx.lineTo(qx, qy);
  }
  ctx.closePath();
}

/**
 * Levendig wolkencomplex per stormcel, in wereldruimte.
 *
 * Geen egale donkere vlek, maar een gelaagd lijf van donkere deegwolken,
 * spiraalarmen en een zwarte, rafelige kern. Gewone witte stapelwolken zitten
 * bewust in hun eigen tekenlaag. Alles volgt één deterministisch zaadje per
 * cel, zodat de vorm van een bewegende storm niet verspringt, terwijl de trage
 * draai en vervorming hem wel laten leven. De rugband en de kernrand blijven
 * leesbaar — daar neemt de speler zijn besluit.
 */
export function tekenStormen(ctx, wereld, cam, vw, vh, tijd) {
  if (!wereld.stormen || !wereld.stormen.length) return;
  const st = sierTijd(tijd);
  const zoom = cam.zoom || 1;
  const zx0 = cam.x - vw / 2 / zoom - 460,
    zx1 = cam.x + vw / 2 / zoom + 460;
  const zy0 = cam.y - vh / 2 / zoom - 460,
    zy1 = cam.y + vh / 2 / zoom + 460;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const s of wereld.stormen) {
    if (s.x < zx0 - s.straal || s.x > zx1 + s.straal) continue;
    if (s.y < zy0 - s.straal || s.y > zy1 + s.straal) continue;

    // Alleen blijvende eigenschappen horen in het zaad. De vorige versie nam
    // de bewegende x/y-positie mee; bij iedere afrondingsgrens kreeg de hele
    // storm daardoor plotseling nieuwe wolken en leek hij te stroboscopen.
    const rng = makeRng(
      (
        Math.round((s.kern || 0) * 1000003) ^
        Math.round(s.straal * 4093) ^
        Math.round((s.levensduur || 0) * 8191) ^
        ((s.draaiing || 1) > 0 ? 0x51ed270b : 0x1b873593)
      ) >>> 0
    );

    const groei = clamp(s.leeftijd < 0.5 ? s.leeftijd / 0.5 : 1 - (s.leeftijd - 0.5) / 0.5, 0.15, 1);
    const draai = s.draaiing || 1;
    // Twee tijdschalen: de trage omwenteling van heel de cel en de snellere
    // adem waarmee de losse wolken hun eigen pad volgen.
    const fase = st * 0.05 + s.kern;
    const adem = Math.sin(st * 0.13 + s.kern * 3.3) * 0.5 + 0.5;
    // De cel zwelt en krimpt heel traag, zodat hij nooit als een vaste vorm
    // boven het water ligt.
    const R = s.straal * (1 + 0.05 * Math.sin(st * 0.07 + s.kern * 5)) * groei;
    // De wind verwaait het wolkenland: hoe losser een wolk zit, hoe verder hij
    // met de wind meesleurt.
    const wdrX = Math.cos(wereld.windRichting);
    const wdrY = Math.sin(wereld.windRichting);

    // --- 1 · Het lijf: één donker silhouet dat ademt -----------------------
    // De zwarte muur is geen schijf maar een onregelmatige deegklont die traag
    // vervormt — precies daar raken wolk en lucht elkaar.
    const lijfR = R * 0.92;
    const lijf = ctx.createRadialGradient(s.x, s.y, lijfR * 0.1, s.x, s.y, lijfR);
    lijf.addColorStop(0, `rgba(${rgbVan(mengGrijs(WOLK_DONKER, WOLK_MIDDEN, 0.2))},${0.5 * groei})`);
    lijf.addColorStop(0.65, `rgba(${rgbVan(mengGrijs(WOLK_DONKER, WOLK_MIDDEN, 0.45))},${0.34 * groei})`);
    lijf.addColorStop(1, 'rgba(30,42,60,0)');
    ctx.fillStyle = lijf;
    wolkSilhouet(ctx, s.x + wdrX * R * 0.08, s.y + wdrY * R * 0.08, lijfR, fase * draai * 0.35);
    ctx.fill();

    // --- 2 · Het wolkenlijf: dichte deegwolken die draaien, zweven, vervormen
    // Variërende dichtheid, grootte en transparantie: kleine wolken dicht op
    // de kern, grote slierten eromheen die verder met de wind meesleuren.
    const nw = 17 + Math.round(groei * 8);
    for (let i = 0; i < nw; i++) {
      const a = (i / nw) * TAU + fase * draai * 0.55 + rng() * 0.5;
      const krimp = 0.5 + 0.5 * Math.sin(a * 2 + fase * 0.8 + i * 1.3);
      const afstand = R * (0.22 + 0.66 * krimp);
      const zweefX = Math.sin(fase * 1.7 + i * 2.1) * R * 0.1;
      const zweefY = Math.cos(fase * 1.3 + i * 2.9) * R * 0.1;
      const drijft = clamp((afstand - R * 0.35) / (R * 0.9), 0, 1);
      const px = s.x + Math.cos(a) * afstand + wdrX * afstand * 0.45 * drijft + zweefX;
      const py = s.y + Math.sin(a) * afstand + wdrY * afstand * 0.45 * drijft + zweefY;
      const r = (100 + rng() * 170 + s.straal * 0.07) * groei;
      const diepte = clamp(afstand / (R * 0.95), 0, 1); // 0 in de kern, 1 aan de rand
      const kleur = mengGrijs(WOLK_DONKER, WOLK_MIDDEN, diepte * 0.7 + rng() * 0.3);
      // Grote, verre wolken wat opener, zodat het donkere lijf diepte houdt.
      const alpha = clamp(0.5 - 0.18 * diepte + rng() * 0.15, 0.15, 0.75) * groei;
      tekenDeeg(ctx, px, py, r, kleur, fase * draai * 0.3 + i * 2.3, alpha);
    }

    // --- 3 · Spiraalarmen: de werveling die het oog als storm leest ---------
    for (let arm = 0; arm < 2; arm++) {
      const aStart = fase * draai * 0.65 + arm * Math.PI;
      const armKleur = mengGrijs(WOLK_DONKER, WOLK_MIDDEN, arm ? 0.22 : 0.48);
      for (let k = 0; k < 6; k++) {
        const t = k / 6;
        const a = aStart + t * 4.6 * draai;
        const ar = R * (0.08 + 0.52 * t);
        const slX = Math.sin(fase * 2.1 + k * 3) * 24;
        const slY = Math.cos(fase * 2.6 + k * 2.2) * 24;
        const px = s.x + Math.cos(a) * ar + slX;
        const py = s.y + Math.sin(a) * ar + slY;
        const r = (55 + 130 * t) * groei;
        tekenDeeg(ctx, px, py, r, armKleur, a * 0.6, 0.34 * (1 - t * 0.45) * groei);
      }
    }

    // --- 4 · De kern -------------------------------------------------------
    // Waar het gevaar begint: een bijna-zwarte, rafelige muur die traag draait
    // en ademt. Alleen volgroeide cellen hebben er een.
    const kernR = stormStraalBij(s, STORM_KERN);
    if (kernR > 30) {
      const kr = kernR * (1 + 0.05 * (adem * 2 - 1));
      const kern = ctx.createRadialGradient(s.x, s.y, kr * 0.12, s.x, s.y, kr);
      kern.addColorStop(0, `rgba(7,11,22,${0.85 * groei})`);
      kern.addColorStop(0.62, `rgba(10,16,30,${0.6 * groei})`);
      kern.addColorStop(1, 'rgba(16,24,40,0)');
      ctx.fillStyle = kern;
      wolkSilhouet(ctx, s.x, s.y, kr, fase * draai * 0.4);
      ctx.fill();
      // De spelersgrens: een dunne, dansende lijn die wél leesbaar is maar
      // niet als een getekende cirkel boven het water ligt.
      ctx.strokeStyle = `rgba(214,120,98,${0.3 + 0.12 * Math.sin(fase * 4)})`;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([9, 15]);
      ctx.lineDashOffset = -fase * 40 * draai;
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const rafel = kr * (1 + 0.08 * Math.sin(a * 5 + fase * 2.2) + 0.05 * Math.sin(a * 11 - fase * 1.4));
        const qx = s.x + Math.cos(a) * rafel;
        const qy = s.y + Math.sin(a) * rafel;
        if (i === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- 5 · De rugband ----------------------------------------------------
    // De snelle band: waar de rugwind piekt. Een lichte, meedraaiende boog die
    // laat zien wélke kant je erlangs moet — met de draaiing mee jaag je mee,
    // ertegenin val je stil.
    const rugR = stormStraalBij(s, 0.5);
    if (rugR > 40) {
      ctx.strokeStyle = `rgba(178,224,236,${0.3 * groei})`;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([26, 34]);
      ctx.lineDashOffset = -fase * 90 * draai;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rugR, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      // Pijlpunten op de band, die met de draaiing meewijzen.
      for (let i = 0; i < 3; i++) {
        const a = fase * 0.9 * draai + (i / 3) * TAU;
        const px = s.x + Math.cos(a) * rugR,
          py = s.y + Math.sin(a) * rugR;
        const t = a + (draai * Math.PI) / 2;
        ctx.fillStyle = `rgba(196,236,246,${0.5 * groei})`;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(t) * 13, py + Math.sin(t) * 13);
        ctx.lineTo(px + Math.cos(t + 2.5) * 9, py + Math.sin(t + 2.5) * 9);
        ctx.lineTo(px + Math.cos(t - 2.5) * 9, py + Math.sin(t - 2.5) * 9);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * Storm: regenbuien die meebuigen met de wind. Eenvoudige lijntjes die voorbij
 * waaien; hoe harder de wind, hoe meer en schuiner ze staan.
 */
export function tekenRegen(ctx, vw, vh, windRichting, kracht, tijd) {
  const st = sierTijd(tijd);
  const intensiteit = clamp((kracht - 1) / 0.8, 0, 1);
  if (intensiteit <= 0.05) return;
  const hoek = windRichting + Math.PI / 2; // regen valt in de windrichting mee
  const dx = Math.cos(hoek) * 1.6 * (0.6 + intensiteit),
    dy = Math.sin(hoek) * 1.6 * (0.6 + intensiteit);
  const n = Math.round(70 * intensiteit);
  ctx.save();
  ctx.strokeStyle = `rgba(190,215,235,${0.16 + 0.2 * intensiteit})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = ((i * 173 + Math.floor(st * 30)) % (vw + 120)) - 60;
    const y = ((i * 97 + Math.floor(st * 190)) % (vh + 160)) - 80;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx, y - dy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Meeuwen: kleine v-vormige vogels die boven het water cirkelen. Puur sfeer —
 * ze kosten bijna niets en doen het water meteen leven.
 */
export function tekenMeeuwen(ctx, vw, vh, tijd) {
  const st = sierTijd(tijd);
  ctx.save();
  ctx.strokeStyle = 'rgba(232,230,224,0.5)';
  ctx.lineWidth = 1.1;
  const n = 5;
  for (let i = 0; i < n; i++) {
    // Elke meeuw heeft een andere baan; de voorbeelden cirkelen over het beeld.
    const sx = vw * (0.12 + 0.24 * i) + Math.sin(st * 0.11 + i * 2.1) * vw * 0.1;
    const sy = vh * (0.16 + 0.05 * i) + Math.cos(st * 0.09 + i * 1.7) * 22;
    const flap = Math.sin(st * 5 + i * 1.3) * 3;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy);
    ctx.quadraticCurveTo(sx - 2, sy - 0.8 + flap, sx, sy + 0.6);
    ctx.quadraticCurveTo(sx + 2, sy - 0.8 + flap, sx + 4, sy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Windroos met de actuele windrichting. */
export function tekenWindroos(ctx, cx, cy, r, windRichting, kracht, tijd) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(1.5, 2.5, r, 0, TAU);
  ctx.fillStyle = 'rgba(8,16,26,0.4)';
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 0, 0, 0, r);
  g.addColorStop(0, '#f6ead0');
  g.addColorStop(1, HUD.perkamentDiep);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = HUD.goud;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // Binnenring, zoals de gegraveerde ring van een echte roos.
  ctx.strokeStyle = 'rgba(120,96,52,0.4)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, r - 5.5, 0, TAU);
  ctx.stroke();
  // Streepjesverdeling: elke tweeëndertigste streep, de hoofdstreken langer.
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const lang = i % 8 === 0;
    ctx.strokeStyle = lang ? HUD.goud : 'rgba(120,96,52,0.45)';
    ctx.lineWidth = lang ? 1.2 : 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 5.5), Math.sin(a) * (r - 5.5));
    ctx.lineTo(Math.cos(a) * (r - (lang ? 10 : 8)), Math.sin(a) * (r - (lang ? 10 : 8)));
    ctx.stroke();
  }

  ctx.font = '600 10px Georgia, serif';
  ctx.fillStyle = HUD.inktZacht;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [lbl, a] of [['N', -Math.PI / 2], ['O', 0], ['Z', Math.PI / 2], ['W', Math.PI]]) {
    ctx.fillText(lbl, Math.cos(a) * (r - 15), Math.sin(a) * (r - 15));
  }

  // Pijl wijst waarheen de wind waait. Twee helften, licht en donker, zoals de
  // naald van een kompasroos op een oude kaart.
  ctx.rotate(windRichting);
  const len = r * 0.58 * clamp(kracht, 0.5, 1.4);
  for (const [zij, kleur] of [[-1, '#7d6540'], [1, HUD.inkt]]) {
    ctx.fillStyle = kleur;
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - 8, zij * 4.5);
    ctx.lineTo(-len * 0.7, zij * 1.8);
    ctx.lineTo(-len * 0.7, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(70,54,30,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.7, 0);
  ctx.stroke();
  ctx.restore();
}

