// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: steden en hun gebouwen.
import { TAU, clamp, lerp, makeRng, sierTijd } from '../util.js';
import { NATIES } from '../data.js';
import { bandVoor, maakBakkerij, plaats } from '../sprite.js';
import { transformSchaal, ZON_X, ZON_Y } from './hulpjes.js';
import { LICHT_X, LICHT_Y } from './patronen.js';
import { wereldSchaal } from './schepen.js';
import { schemerFactor, nachtSterkte, tekenLichtGloed } from './zee.js';

// --- Steden ---------------------------------------------------------------

/**
 * Bouwstijl per natie. Twee parameters volstaan om vier koloniale machten uit
 * elkaar te houden: de dakkleur en wat er op de kerk staat. Spaans wit met
 * rode pan, Engels grauw met een vierkante toren, Frans zandkleurig met een
 * spits, en een Nederlandse trapgevel — genoeg om aan een haven te zien wiens
 * vlag er waait, ook als de vlag zelf achter een wolk zit.
 */
const STAD_STIJL = {
  spanje: { dak: '#b3502f', gevel: '#f2e6c8', toren: 'koepel' },
  engeland: { dak: '#6a5a4c', gevel: '#dcd1bb', toren: 'vierkant' },
  frankrijk: { dak: '#7d6b56', gevel: '#eadfc6', toren: 'spits' },
  nederland: { dak: '#8a3f2a', gevel: '#e3d4b4', toren: 'trap' },
  piraat: { dak: '#4a3a2a', gevel: '#c9bca2', toren: 'geen' },
};

/**
 * Afgeronde rechthoek als pad. `game.js` heeft er ook een, maar render.js mag
 * daar niet van afhangen — die richting van de afhankelijkheid loopt andersom.
 */
export function roundRechthoek(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Eén huisje: gevel, dak aan de schaduwzijde en een deur.
 *
 * Het dak krijgt een nok met een lichte en een donkere helft, en op de grotere
 * panden een paar panlagen. Dat kost hier niets — dit hele huis wordt één keer
 * in de stadssprite gebakken — en het is op de maat van een haven precies genoeg
 * om een dak als dak te lezen in plaats van als een driehoekje kleur.
 */
function tekenHuis(ctx, x, y, w, h, stijl, pannen = false) {
  const nok = y - h / 2 - h * 0.42;
  ctx.fillStyle = stijl.gevel;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  // Gevelschaduw aan de zijde waar de zon niet komt.
  ctx.fillStyle = 'rgba(40,28,16,0.16)';
  ctx.fillRect(x + w * 0.22, y - h / 2, w * 0.28, h);

  // Dak in twee helften om de nok, zodat er licht op valt.
  ctx.fillStyle = stijl.dak;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 0.5, y - h / 2);
  ctx.lineTo(x, nok);
  ctx.lineTo(x + w / 2 + 0.5, y - h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x, nok);
  ctx.lineTo(x + w / 2 + 0.5, y - h / 2);
  ctx.lineTo(x, y - h / 2);
  ctx.closePath();
  ctx.fill();

  if (pannen) {
    // Panlagen evenwijdig aan de nok. Drie is genoeg: meer wordt op deze maat
    // een grijze waas in plaats van een dak.
    ctx.strokeStyle = 'rgba(30,18,10,0.28)';
    ctx.lineWidth = 0.35;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const yy = lerp(nok, y - h / 2, t);
      const halfW = (w / 2 + 0.5) * t;
      ctx.beginPath();
      ctx.moveTo(x - halfW, yy);
      ctx.lineTo(x + halfW, yy);
      ctx.stroke();
    }
  }

  // Noklijn met een lichtvanger erop.
  ctx.strokeStyle = 'rgba(255,236,196,0.4)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.4, nok + h * 0.06);
  ctx.lineTo(x + w * 0.4, nok + h * 0.06);
  ctx.stroke();

  ctx.fillStyle = 'rgba(40,28,16,0.72)';
  ctx.fillRect(x - w * 0.11, y, w * 0.22, h * 0.5);
}

/** Het bastion van een fort: een stervorm, geen blokje met kantelen. */
function bastionPad(r, punten) {
  const pad = new Path2D();
  for (let i = 0; i <= punten * 2; i++) {
    const a = (i / (punten * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    const x = Math.cos(a) * rr,
      y = Math.sin(a) * rr * 0.82;
    if (i === 0) pad.moveTo(x, y);
    else pad.lineTo(x, y);
  }
  pad.closePath();
  return pad;
}

/**
 * Vaste maten van een nederzetting.
 *
 * Het gebakken lijf en de wapperende vlag moeten het eens zijn over de plek van
 * de mast, en die volgt uit het bastion. Eén helper dus, in plaats van dezelfde
 * som op twee plekken.
 */
function stadMaten(stad) {
  const r = 7 + stad.grootte * 2.4;
  const heeftFort = stad.soort === 'fort' || stad.soort === 'schatkamer' || stad.grootte >= 3;
  const heeftKerk = stad.grootte >= 4;
  const ommuurd = stad.soort === 'fort' || stad.soort === 'schatkamer';
  // De straat wijst naar de rede. Alles in het lijf staat in die gedraaide
  // ruimte: +x is zeewaarts, -x het achterland.
  const naarZee =
    stad.ankerX == null ? 0 : Math.atan2(stad.ankerY - stad.y, stad.ankerX - stad.x);
  const voetX = heeftFort ? r * 0.5 : 0;
  const voetY = heeftFort ? -r * 0.52 : -r * 0.2;
  const mastHoog = heeftFort ? r * 0.85 : r * 1.4;
  // De vlag hangt rechtop in beeld en niet scheef mee met de kade, dus de voet
  // van de mast wordt teruggerekend naar de ongedraaide ruimte.
  const mx = Math.cos(naarZee) * voetX - Math.sin(naarZee) * voetY;
  const my = Math.sin(naarZee) * voetX + Math.cos(naarZee) * voetY;
  return { r, heeftFort, heeftKerk, ommuurd, naarZee, mx, my, mastTop: my - mastHoog };
}

/**
 * De bebouwing, in de ruimte waarin +x zeewaarts wijst.
 *
 * Deterministisch uit de stad-id, want een opslag bewaart alleen het zaad: na
 * herladen moet dezelfde haven er tot de laatste hut hetzelfde bij liggen.
 */
function stadGebouwen(stad, r) {
  const rng = makeRng((stad.id * 2246822519) >>> 0);
  const uit = [];

  // Hoofdstraat: twee rijen, van het achterland tot vlak voor de kade.
  const n = 3 + stad.grootte * 2;
  for (let i = 0; i < n; i++) {
    const zijde = i % 2 ? 1 : -1;
    const t = Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1);
    uit.push({
      x: lerp(-r * 0.72, r * 0.42, t) + (rng() - 0.5) * r * 0.12,
      y: zijde * (r * 0.3 + rng() * r * 0.22),
      w: r * (0.2 + rng() * 0.12),
      h: r * (0.16 + rng() * 0.1),
      pannen: false,
    });
  }

  // Achterstraatje. Pas vanaf een plaats van formaat, en landinwaarts: een
  // haven groeit van het water af, niet het water in.
  if (stad.grootte >= 3) {
    const m = stad.grootte - 1;
    for (let i = 0; i < m; i++) {
      const zijde = i % 2 ? 1 : -1;
      uit.push({
        x: lerp(-r * 0.6, r * 0.02, m === 1 ? 0.5 : i / (m - 1)) + (rng() - 0.5) * r * 0.1,
        y: zijde * (r * 0.64 + rng() * r * 0.14),
        w: r * (0.17 + rng() * 0.09),
        h: r * (0.14 + rng() * 0.07),
        pannen: false,
      });
    }
  }

  // Pakhuizen aan de kade: breder dan de woonhuizen, en groot genoeg om er
  // panlagen op te zetten.
  if (stad.grootte >= 2) {
    for (let i = 0; i < 2; i++) {
      uit.push({
        x: r * (0.46 + rng() * 0.14),
        y: (i ? 1 : -1) * (r * 0.36 + rng() * r * 0.1),
        w: r * (0.27 + rng() * 0.1),
        h: r * (0.19 + rng() * 0.05),
        pannen: true,
      });
    }
  }

  return uit;
}

/** Afgeronde rechthoek als deelpad. */
function rondInPad(pad, x, y, w, h, straal) {
  const rr = Math.min(straal, w / 2, h / 2);
  pad.moveTo(x + rr, y);
  pad.arcTo(x + w, y, x + w, y + h, rr);
  pad.arcTo(x + w, y + h, x, y + h, rr);
  pad.arcTo(x, y + h, x, y, rr);
  pad.arcTo(x, y, x + w, y, rr);
  pad.closePath();
}

/**
 * Het ontgonnen grondvlak van een nederzetting.
 *
 * Dit was een wiebelende ellips, en daarmee lag elke plaats van Havana tot het
 * kleinste roversnest er als hetzelfde ronde vlekje bij. De omtrek volgt nu de
 * bebouwing zélf.
 *
 * Niet als losse erven om ieder pand: dat werd een tros zeepbellen met schulpen
 * op elke naad. In plaats daarvan meten we per richting hoe ver de verste
 * bebouwing reikt — de steunfunctie van de panden — en leggen daar een gladde
 * rand omheen. Het resultaat is één samenhangende vorm die vanzelf langgerekt
 * is waar de straat loopt en breed waar de huizen staan: voor elke haven een
 * ander silhouet, en telkens een silhouet dat klopt.
 *
 * De vloeigangen zijn nodig omdat de hoeken van rechthoekige panden anders als
 * knikken in de rand blijven staan; de golf erna zorgt dat de omtrek er
 * gegroeid uitziet in plaats van uitgesneden.
 */
function stadOmtrekPad(gebouwen, extra, r, marge, wiebel) {
  const N = 48;
  const straal = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    let m = r * 0.3; // de kern is altijd geruimd, ook zonder pand in die hoek
    for (const g of gebouwen) {
      const steun = g.x * ca + g.y * sa + Math.abs((g.w / 2) * ca) + Math.abs((g.h / 2) * sa);
      if (steun > m) m = steun;
    }
    for (const g of extra) {
      const steun = g.x * ca + g.y * sa + Math.abs((g.w / 2) * ca) + Math.abs((g.h / 2) * sa);
      if (steun > m) m = steun;
    }
    straal[i] = m + marge;
  }
  for (let gang = 0; gang < 2; gang++) {
    const kopie = Float64Array.from(straal);
    for (let i = 0; i < N; i++) {
      straal[i] = (kopie[(i - 1 + N) % N] + 2 * kopie[i] + kopie[(i + 1) % N]) / 4;
    }
  }

  const px = new Float64Array(N),
    py = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const rr =
      straal[i] * (1 + 0.055 * Math.sin(a * 3 + wiebel) + 0.032 * Math.sin(a * 7 - wiebel * 1.7));
    px[i] = Math.cos(a) * rr;
    py[i] = Math.sin(a) * rr;
  }
  // Door de middens van de zijden, met de hoekpunten als stuurpunt: dat maakt
  // van een hoekige veelhoek een vloeiende rand zonder extra bemonstering.
  const pad = new Path2D();
  pad.moveTo((px[N - 1] + px[0]) / 2, (py[N - 1] + py[0]) / 2);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    pad.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
  }
  pad.closePath();
  return pad;
}

/**
 * Alles aan een nederzetting dat vastligt: grondvlak, kade, straat, plein,
 * bebouwing, kerk, bastion en wal.
 *
 * Wordt één keer per (stad, natie, resolutie) in een sprite gebakken, dus alles
 * hier is gratis in het beeld. Dat is precies waarom er panlagen, erfschaduwen
 * en een havenhoofd in passen die per beeld niet te betalen zouden zijn.
 */
function tekenStadLijf(ctx, stad, stijl) {
  const { r, heeftFort, heeftKerk, ommuurd, naarZee } = stadMaten(stad);
  const rng = makeRng((stad.id * 1274126177) >>> 0);
  const kade = r * (1.1 + stad.grootte * 0.07);
  const gebouwen = stadGebouwen(stad, r);
  // De kerk staat buiten de rooilijn en moet het grondvlak meetrekken, anders
  // steekt hij aan het landeinde het groen in.
  const extra = heeftKerk ? [{ x: -r * 0.94, y: 0, w: r * 0.5, h: r * 0.36 }] : [];
  const grond = stadOmtrekPad(gebouwen, extra, r, r * 0.2, stad.id * 1.7);

  // De zon staat vast boven de wereld, niet boven de stad. Binnen deze gedraaide
  // ruimte moet zijn richting dus terugdraaien, anders wijst de schaduw van een
  // haven op een zuidkust de andere kant op dan die van een haven op een oostkust.
  const cz = Math.cos(-naarZee),
    sz = Math.sin(-naarZee);
  const zonX = ZON_X * cz - ZON_Y * sz;
  const zonY = ZON_X * sz + ZON_Y * cz;

  ctx.save();
  ctx.rotate(naarZee);

  // Slagschaduw van het hele stadsvlak, en daaronder het geruimde land.
  ctx.save();
  ctx.translate(zonX * 0.55, zonY * 0.55);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill(grond);
  ctx.restore();
  ctx.fillStyle = '#cbb079';
  ctx.fill(grond);
  ctx.strokeStyle = 'rgba(116,92,52,0.45)';
  ctx.lineWidth = 0.7;
  ctx.stroke(grond);

  // Havenhoofd: een gemetselde arm die de rede uit de zeegang houdt. Alleen
  // waar genoeg schepen liggen om hem te rechtvaardigen. Als gevulde vorm, want
  // een lijn met ronde koppen leest op deze maat als een handvat.
  // Hier stond een havenhoofd. Het is er weer uit: in elke variant — als lijn,
  // als gevulde arm, aan weerszijden van de kade — bleef het lezen als een
  // grijze staart aan het bastion of aan de steiger. Een detail dat op de
  // speelmaat onzichtbaar is en op de maximale maat verwarring sticht, verdient
  // geen plek, hoe goedkoop het gebakken ook is.

  // De kade: een houten dek op palen, met wat aangemeerd. Twee rails met
  // dwarsliggers werd op deze maat een ladder; een dek leest meteen als steiger.
  const kadeVoet = r * 0.86;
  ctx.fillStyle = '#8a6839';
  ctx.beginPath();
  ctx.rect(kadeVoet, -r * 0.17, kade - kadeVoet, r * 0.34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(48,34,16,0.55)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  // Plankennaden in de lengte, en de koppen van de palen langs de rand.
  ctx.strokeStyle = 'rgba(58,42,22,0.3)';
  ctx.lineWidth = 0.3;
  for (const zij of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(kadeVoet + r * 0.03, zij * r * 0.06);
    ctx.lineTo(kade - r * 0.02, zij * r * 0.06);
    ctx.stroke();
  }
  ctx.fillStyle = '#5c4324';
  for (let i = 0; i < 3; i++) {
    const px = lerp(kadeVoet + r * 0.08, kade - r * 0.05, i / 2);
    for (const zij of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(px, zij * r * 0.155, r * 0.026, 0, TAU);
      ctx.fill();
    }
  }
  // Twee sloepen langszij.
  for (let i = 0; i < 2; i++) {
    const px = lerp(kadeVoet + r * 0.1, kade * 0.94, rng());
    const py = (i ? 1 : -1) * r * 0.29;
    ctx.fillStyle = '#5c4324';
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.13, r * 0.05, rng() * 0.4 - 0.2, 0, TAU);
    ctx.fill();
  }

  // De straat van het achterland naar de kade: aangestampte aarde, dus donkerder
  // dan het geruimde land eromheen en niet lichter — als lichte baan las hij als
  // een plank die over de stad heen lag.
  // Taps en met een flauwe bocht: een rechte balk van gelijke dikte leest als
  // een plank die over de stad heen ligt, niet als een weg die naar de kade
  // loopt. Breed bij het water, smal het achterland in.
  const weg = new Path2D();
  weg.moveTo(-r * 0.72, -r * 0.028);
  weg.quadraticCurveTo(-r * 0.1, -r * 0.075, kadeVoet, -r * 0.062);
  weg.lineTo(kadeVoet, r * 0.062);
  weg.quadraticCurveTo(-r * 0.1, r * 0.03, -r * 0.72, r * 0.028);
  weg.closePath();
  ctx.fillStyle = 'rgba(126,99,55,0.5)';
  ctx.fill(weg);

  // Erfschaduwen van alle panden in één pad: overlappende schaduwen mogen
  // elkaar niet donkerder maken.
  const schaduw = new Path2D();
  for (const g of gebouwen) {
    rondInPad(
      schaduw,
      g.x - g.w / 2 + zonX * 0.32,
      g.y - g.h / 2 + zonY * 0.32,
      g.w * 1.04,
      g.h * 1.12,
      r * 0.04
    );
  }
  ctx.fillStyle = 'rgba(46,32,14,0.22)';
  ctx.fill(schaduw);

  for (const g of gebouwen) tekenHuis(ctx, g.x, g.y, g.w, g.h, stijl, g.pannen);

  // Kerk aan het landeinde van de straat: een schip met een toren erbovenop, en
  // de bekroning van de eigen natie op die toren. De oude opzet was één gevel
  // met een koepel erop, en dat las van boven als een wit vlakje met een rode
  // stip — geen kerk maar een knoop.
  if (heeftKerk && stijl.toren !== 'geen') {
    const kx = -r * 0.86;
    tekenHuis(ctx, kx, 0, r * 0.3, r * 0.26, stijl, true);

    const tx = kx - r * 0.2;
    ctx.fillStyle = stijl.gevel;
    ctx.fillRect(tx - r * 0.085, -r * 0.105, r * 0.17, r * 0.21);
    ctx.strokeStyle = 'rgba(40,28,16,0.45)';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(tx - r * 0.085, -r * 0.105, r * 0.17, r * 0.21);
    ctx.fillStyle = stijl.dak;
    if (stijl.toren === 'koepel') {
      // Een platte schijf leest als stip; met een lichtvanger aan de zonzijde
      // en een donkere rand wordt het een koepel.
      ctx.beginPath();
      ctx.arc(tx, 0, r * 0.085, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,232,190,0.45)';
      ctx.beginPath();
      ctx.arc(tx + LICHT_X * r * 0.03, LICHT_Y * r * 0.03, r * 0.04, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,40,22,0.5)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.arc(tx, 0, r * 0.085, 0, TAU);
      ctx.stroke();
    } else if (stijl.toren === 'spits') {
      ctx.beginPath();
      ctx.moveTo(tx - r * 0.095, r * 0.05);
      ctx.lineTo(tx, -r * 0.15);
      ctx.lineTo(tx + r * 0.095, r * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (stijl.toren === 'trap') {
      // Trapgevel: drie treden, en daarmee is een Hollandse haven herkenbaar.
      for (let i = 0; i < 3; i++) {
        const w = r * (0.18 - i * 0.048);
        ctx.fillRect(tx - w / 2, -r * 0.105 - r * 0.052 * (i + 1), w, r * 0.052);
      }
    } else {
      ctx.fillRect(tx - r * 0.075, -r * 0.075, r * 0.15, r * 0.15);
    }
    // Kruis op de toren, niet erboven in de lucht.
    ctx.strokeStyle = 'rgba(40,28,16,0.7)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(tx, -r * 0.15);
    ctx.lineTo(tx, -r * 0.25);
    ctx.moveTo(tx - r * 0.038, -r * 0.215);
    ctx.lineTo(tx + r * 0.038, -r * 0.215);
    ctx.stroke();
  }

  // Het bastion bewaakt de haveningang, dus het staat aan de zeezijde.
  if (heeftFort) {
    ctx.save();
    ctx.translate(r * 0.5, -r * 0.52);
    const ster = bastionPad(r * 0.34, 5);
    // Slagschaduw onder de wal: een bastion is het hoogste van de hele plaats.
    ctx.save();
    ctx.translate(zonX * 0.5, zonY * 0.5);
    ctx.fillStyle = 'rgba(30,22,10,0.34)';
    ctx.fill(ster);
    ctx.restore();
    ctx.fillStyle = '#8d8375';
    ctx.fill(ster);
    ctx.strokeStyle = '#5f574a';
    ctx.lineWidth = 0.7;
    ctx.stroke(ster);
    // Geschut op de wal, richting zee.
    ctx.fillStyle = '#3b352c';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(r * 0.1 + i * r * 0.09, -r * 0.05, r * 0.05, r * 0.05);
    }
    ctx.restore();
  }

  // Een echte wal om de versterkte plaatsen. Hij volgt de omtrek van de stad in
  // plaats van er als ellips omheen te liggen: een ronde muur om een langgerekte
  // haven verraadt onmiddellijk dat de vorm getekend is en niet gegroeid.
  if (ommuurd) {
    ctx.strokeStyle = 'rgba(120,112,98,0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke(stadOmtrekPad(gebouwen, extra, r, r * 0.31, stad.id * 1.7));
    ctx.strokeStyle = 'rgba(60,54,44,0.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke(stadOmtrekPad(gebouwen, extra, r, r * 0.38, stad.id * 1.7));
  }

  ctx.restore(); // klaar met de draaiing naar zee
}

/**
 * Vensters die bij schemer aangaan: een paar willekeurige ramen per pand, warm
 * puntlicht met een zachte gloed erover. Apart gebakken van het stadslijf —
 * dat nooit verandert — zodat alleen de dekking van déze laag per beeld hoeft
 * te schuiven met de schemerstand, net zoals de vlag en het naamplaatje al
 * buiten de sprite staan omdat die wél veranderen.
 */
function tekenStadVensters(ctx, stad) {
  const { r, naarZee } = stadMaten(stad);
  const gebouwen = stadGebouwen(stad, r);
  const rng = makeRng((stad.id * 950213) >>> 0);
  ctx.save();
  ctx.rotate(naarZee);
  for (const g of gebouwen) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      // Niet elk venster brandt — dat oogt als een bakstenen blok met stippen
      // in plaats van een bewoond dorp.
      if (rng() < 0.4) continue;
      const wx = g.x + (rng() - 0.5) * g.w * 0.6;
      const wy = g.y + (rng() - 0.5) * g.h * 0.5;
      const rr = Math.min(g.w, g.h) * 0.16;
      const gloed = ctx.createRadialGradient(wx, wy, 0, wx, wy, rr * 2.6);
      gloed.addColorStop(0, 'rgba(255,214,140,0.95)');
      gloed.addColorStop(0.4, 'rgba(255,190,110,0.5)');
      gloed.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = gloed;
      ctx.beginPath();
      ctx.arc(wx, wy, rr * 2.6, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

const stadVensterBakkerij = maakBakkerij('stad-vensters', 0.6e6);

function stadVensterSprite(stad, dichtheid) {
  const { r } = stadMaten(stad);
  const half = r * 1.75;
  return stadVensterBakkerij.haal(`${stad.id}`, half, half, bandVoor(dichtheid), (g) =>
    tekenStadVensters(g, stad)
  );
}

// Sprites per (stad, natie, resolutie). De natie zit in de sleutel, dus een
// verovering vervangt de sprite vanzelf — daar is geen aparte opruiming voor
// nodig.
//
// De begroting is gekozen op de zwaarste stand die werkelijk voorkomt: alle
// vijfendertig havens tegelijk in het kaartoverzicht kost samen ruim honderdvijftig
// duizend pixels, en de vier havens van een speelbeeld op de hoogste zoomstand
// ongeveer driehonderdduizend. Anderhalf miljoen laat beide naast elkaar staan,
// zodat heen en weer zoomen niets opnieuw hoeft te bakken.
const stadBakkerij = maakBakkerij('steden', 1.5e6);

function stadSprite(stad, dichtheid) {
  const stijl = STAD_STIJL[stad.natie] || STAD_STIJL.piraat;
  const { r } = stadMaten(stad);
  // Ruim genoeg voor de kade, het havenhoofd en de buitenste wal.
  const half = r * 1.75;
  return stadBakkerij.haal(`${stad.id}|${stad.natie}`, half, half, bandVoor(dichtheid), (g) =>
    tekenStadLijf(g, stad, stijl)
  );
}

/**
 * Een nederzetting van boven.
 *
 * De oude opzet zette de huisjes in een ring rond het middelpunt; zo ligt geen
 * enkele echte stad erbij. Hier loopt er een straat van het achterland naar het
 * water — de richting waarin de stad ook daadwerkelijk haar rede heeft — met de
 * bebouwing eraan, de kerk aan het landeinde en het bastion bij de haven. Wie
 * de kade ziet liggen, weet meteen waar hij moet aanleggen.
 *
 * Van dat alles beweegt niets, dus het wordt gebakken. Wat hier overblijft is
 * wat wél leeft: de vlag in de wind, de markeerring als je in de buurt komt, en
 * het naamplaatje — dat laatste omdat het tégen de zoom in schaalt en dus per
 * definitie niet in een sprite past.
 */
/**
 * `deel`: 'alles', of los 'lijf' (gebouwen, mast, vlag) en 'bovenop' (ramen,
 * lichtgloed, markering, naambordje). Het vaarscherm legt tussen die twee de
 * nachtsluier: het lijf wordt donker, maar ramen en naam moeten erbovenuit
 * blijven stralen en leesbaar zijn.
 */
export function tekenStad(ctx, stad, cam, tijd, gemarkeerd, deel = 'alles') {
  const natie = NATIES[stad.natie];
  // Dezelfde schaal als de schepen: een haven hoort groter te zijn dan de sloep
  // die eraan ligt, en dat blijft alleen kloppen als beide uit één formule komen.
  const s = wereldSchaal(cam.zoom);
  const st = sierTijd(tijd);
  const { r, heeftFort, mx, my, mastTop } = stadMaten(stad);

  const lijf = deel !== 'bovenop';
  const bovenop = deel !== 'lijf';

  ctx.save();
  ctx.translate(stad.x, stad.y);
  ctx.scale(s, s);

  if (lijf) plaats(ctx, stadSprite(stad, transformSchaal(ctx)));

  // Bij schemer gaan de ramen aan. Onder klaarlichte dag blijft de dekking op
  // nul, dus dan wordt er niets extra's getekend.
  const raamGloed = clamp((schemerFactor() - 0.12) / 0.25, 0, 1);
  if (bovenop && raamGloed > 0.02) {
    // Eerst een warme gloed over de hele stad: van ver zie je een haven 's
    // nachts aan zijn licht, niet aan zijn daken.
    const nacht = nachtSterkte();
    if (nacht > 0.02) tekenLichtGloed(ctx, 0, 0, r * 2.1, '#ffb862', 0.5 * nacht);
    ctx.save();
    ctx.globalAlpha = raamGloed;
    plaats(ctx, stadVensterSprite(stad, transformSchaal(ctx)));
    ctx.restore();
  }

  if (lijf) tekenMastEnVlag(ctx, natie, heeftFort, mx, my, mastTop, st, stad.id);
  if (!bovenop) {
    ctx.restore();
    return;
  }

  if (gemarkeerd) {
    ctx.strokeStyle = 'rgba(255,225,150,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 10 + Math.sin(st * 3) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Naam op een perkamenten plaatje. Een dikke omranding om losse letters is
  // op elke ondergrond een noodgreep; een plaatje is op groen én op zand
  // leesbaar en past bij de rest van de schermen.
  if (cam.zoom > 0.42) {
    // De stad groeit met de wereld mee, de naam niet: die hoort op elke
    // zoomstand even groot in beeld te staan. `px` is één schermpixel, gemeten
    // in de eenheden van deze geschaalde ruimte.
    const px = 1 / (s * (cam.zoom || 1));
    ctx.font = `600 ${(12 * px).toFixed(2)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(stad.naam).width;
    const py = r + 10 * px;
    roundRechthoek(ctx, -tw / 2 - 5 * px, py - 8.5 * px, tw + 10 * px, 17 * px, 3 * px);
    ctx.fillStyle = 'rgba(239,224,187,0.93)';
    ctx.fill();
    ctx.strokeStyle = natie.kleur;
    ctx.lineWidth = 1.2 * px;
    ctx.stroke();
    ctx.fillStyle = '#37281a';
    ctx.fillText(stad.naam, 0, py);
  }
  ctx.restore();
}

/** Vlaggenmast met wapperende vlag, in de ongedraaide ruimte van de stad. */
function tekenMastEnVlag(ctx, natie, heeftFort, mx, my, mastTop, st, id) {
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = heeftFort ? 1.2 : 1;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx, mastTop);
  ctx.stroke();

  const wapper = Math.sin(st * 4 + id) * 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    if (natie.vlagStaand) {
      const x0 = mx + (i * 10) / 3;
      const x1 = mx + ((i + 1) * 10) / 3;
      ctx.moveTo(x0, mastTop);
      ctx.lineTo(x1, mastTop + (wapper * (i + 1)) / 6);
      ctx.lineTo(x1, mastTop + 7.2 + (wapper * (i + 1)) / 6);
      ctx.lineTo(x0, mastTop + 7.2);
    } else {
      ctx.moveTo(mx, mastTop + i * 2.4);
      ctx.lineTo(mx + 10, mastTop + i * 2.4 + (wapper * (i + 1)) / 3);
      ctx.lineTo(mx + 10, mastTop + (i + 1) * 2.4 + (wapper * (i + 1)) / 3);
      ctx.lineTo(mx, mastTop + (i + 1) * 2.4);
    }
    ctx.closePath();
    ctx.fill();
  }
}
