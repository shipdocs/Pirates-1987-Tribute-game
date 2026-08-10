// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: patroontegels (golven, sprankel, wolken, schuim,
// land) en hun initialisatie.
import { TAU } from '../util.js';
import { offscreen, plaats } from '../sprite.js';
import { mod, ZON_X, ZON_Y } from './hulpjes.js';

// --- Patronen -------------------------------------------------------------

// We bewaren de tegels zelf (niet het patroon), want elk canvas heeft zijn
// eigen patroonobject nodig — de landlaag tekent op een eigen buffer.
export let landTegel = null;
export let vlekTegel = null;
let wolkTegel = null;
/** @type {{patroon:CanvasPattern, maat:number}[]} */
export let sprankelLagen = [];
/** Schuimpatroon voor de branding; hangt aan het canvas, net als de sprankels. */
export let schuimPatroon = null;

// Maat van de schuimtegel in wereldeenheden. Hij wordt onder de cameratransform
// gebruikt, dus een tegel van 128 is 128 wereldeenheden breed — ongeveer vijf
// scheepslengtes, groot genoeg om zijn eigen herhaling niet te verraden.
const SCHUIM_TEGEL = 128;

// Maat waarop de golftegel wordt gerékend. De maten waarop hij uiteindelijk in
// beeld komt staan in GOLF_LAGEN; die worden vooraf uitgebakken.
const ZEE_TEGEL = 256;

// Lichtrichting op het water, tegengesteld aan de vaste slagschaduw: de zon
// staat linksboven, dus daar vandaan lichten de golfkruinen op.
const LICHT_LEN = Math.hypot(ZON_X, ZON_Y);
export const LICHT_X = -ZON_X / LICHT_LEN;
export const LICHT_Y = -ZON_Y / LICHT_LEN;

/**
 * Zoekt de golfvector met gehele componenten die het dichtst bij `hoek` ligt.
 *
 * Waarom geheel? Alleen als een sinus een heel aantal keer in de tegel past,
 * sluit hij naadloos aan op zijn buren. Een golfveld dat we gewoon zouden
 * draaien, zou bij elke tegelnaad een breuk vertonen; door de richting te
 * kiezen uit de roosterhoeken houden we het naadloos én kunnen we het patroon
 * assenparallel blijven vullen, wat vele malen goedkoper is dan het canvas
 * draaien.
 */
function golfVector(hoek) {
  const cx = Math.cos(hoek),
    cy = Math.sin(hoek);
  let best = [3, 0],
    bestScore = -2;
  for (let nx = -6; nx <= 6; nx++) {
    for (let ny = -6; ny <= 6; ny++) {
      const len = Math.hypot(nx, ny);
      if (len < 2.6 || len > 6.2) continue;
      const score = (nx * cx + ny * cy) / len;
      if (score > bestScore) {
        bestScore = score;
        best = [nx, ny];
      }
    }
  }
  return best;
}

// [richting t.o.v. de wind, veelvoud van de grondgolf, amplitude, fase]
//
// Zwaar in de hoofdrichting, licht in de dwarsrichtingen. Dat evenwicht is het
// verschil tussen water en korrel: de harmonischen in de windrichting (2, 3, 5,
// 8) maken de kruin scherp, terwijl de schuine reeksen hem alleen mogen bréken.
// Stonden de dwarsreeksen even zwaar als de grondgolf, dan bleef er van de
// deining geen richting over en las het beeld als gehamerd metaal.
const GOLF_REEKSEN = [
  [0, 1, 0.9, 0.0],
  [0, 2, 0.62, 1.7],
  [0, 3, 0.5, 3.9],
  [0, 5, 0.34, 2.4],
  [0, 8, 0.19, 5.5],
  [0.62, 1, 0.34, 0.9],
  [0.62, 3, 0.2, 4.6],
  [0.62, 6, 0.1, 2.1],
  [-0.75, 1, 0.3, 5.9],
  [-0.75, 2, 0.24, 2.8],
  [-0.75, 4, 0.16, 1.2],
  [-0.75, 7, 0.08, 5.0],
  [1.25, 2, 0.22, 0.3],
  [1.25, 5, 0.1, 3.3],
  [-1.5, 3, 0.18, 4.4],
];

// Trage velden waarmee we het golfveld op zichzelf verschuiven, elk op twee
// schalen zodat de kruinen zowel in het groot als in het klein kronkelen.
const VERVORM_X = [[0.9, 1, 1, 0.4], [0.9, 2, 0.5, 2.2], [2.1, 4, 0.3, 5.0]];
const VERVORM_Y = [[-1.1, 1, 1, 3.1], [-1.1, 3, 0.4, 1.1], [-2.3, 5, 0.25, 0.7]];

/** Som van sinusgolven met gehele golfvectoren, genormaliseerd naar ±1. */
function golfVeld(S, reeksen, hoek) {
  const h = new Float32Array(S * S);
  const su = new Float32Array(S),
    cu = new Float32Array(S),
    sv = new Float32Array(S),
    cv = new Float32Array(S);

  for (const [draai, veelvoud, amp, fase] of reeksen) {
    const [bx, by] = golfVector(hoek + draai);
    const nx = bx * veelvoud,
      ny = by * veelvoud;
    // Boven Nyquist heeft een component geen betekenis meer, alleen ruis.
    if (Math.abs(nx) > S / 4 || Math.abs(ny) > S / 4) continue;
    for (let i = 0; i < S; i++) {
      const u = (TAU * nx * i) / S;
      su[i] = Math.sin(u);
      cu[i] = Math.cos(u);
      const v = (TAU * ny * i) / S + fase;
      sv[i] = Math.sin(v);
      cv[i] = Math.cos(v);
    }
    // sin(u + v) uitgeschreven, zodat we per tegel maar 4·S sinussen nodig
    // hebben in plaats van S² per component.
    for (let y = 0; y < S; y++) {
      const svy = sv[y],
        cvy = cv[y],
        rij = y * S;
      for (let x = 0; x < S; x++) h[rij + x] += amp * (su[x] * cvy + cu[x] * svy);
    }
  }

  let max = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i] < 0 ? -h[i] : h[i];
    if (a > max) max = a;
  }
  const inv = max > 0 ? 1 / max : 1;
  for (let i = 0; i < h.length; i++) h[i] *= inv;
  return h;
}

/**
 * Naadloze golftegel voor één windrichting.
 *
 * Een stapel vlakke sinussen levert altijd kaarsrechte, oneindig lange
 * kruinen op — geen zee maar geborsteld metaal. Daarom bemonsteren we het veld
 * niet op (x, y) maar op een plek die zelf door twee trage golfvelden wordt
 * verschoven: de kruinen gaan kronkelen en breken af, zoals kabbeling doet.
 * Omdat de verschuivingsvelden dezelfde periode hebben als de tegel, blijft
 * het geheel naadloos. Van het resultaat nemen we de helling naar de zon toe:
 * kruinen lichten op, dalen vallen weg.
 */
function maakGolfTegel(hoek) {
  const S = ZEE_TEGEL;
  const ruw = golfVeld(S, GOLF_REEKSEN, hoek);
  const vx = golfVeld(S, VERVORM_X, hoek);
  const vy = golfVeld(S, VERVORM_Y, hoek);

  // Hoe ver we het veld op zichzelf verschuiven, in tegelpixels. Dit is de knop
  // tussen "geborsteld metaal" (0) en "korrel" (te hoog): op 28 werd de kruin
  // zó fijn vermalen dat er geen kruinlijn overbleef.
  const AMPL = 16;
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const rij = y * S;
    for (let x = 0; x < S; x++) {
      const i = rij + x;
      const sx = x + vx[i] * AMPL,
        sy = y + vy[i] * AMPL;
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const fx = sx - x0,
        fy = sy - y0;
      // Rondom de tegel heen bemonsteren, anders scheurt het veld aan de naad.
      const xa = ((x0 % S) + S) % S,
        xb = (xa + 1) % S;
      const ya = ((y0 % S) + S) % S,
        yb = (ya + 1) % S;
      const boven = ruw[ya * S + xa] * (1 - fx) + ruw[ya * S + xb] * fx;
      const onder = ruw[yb * S + xa] * (1 - fx) + ruw[yb * S + xb] * fx;
      h[i] = boven * (1 - fy) + onder * fy;
    }
  }

  const c = offscreen(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const rij = y * S,
      boven = ((y - 1 + S) % S) * S,
      onder = ((y + 1) % S) * S;
    for (let x = 0; x < S; x++) {
      const links = (x - 1 + S) % S,
        rechts = (x + 1) % S;
      const gx = h[rij + rechts] - h[rij + links];
      const gy = h[onder + x] - h[boven + x];
      const helling = -(gx * LICHT_X + gy * LICHT_Y) * 2.1;
      const i4 = (rij + x) * 4;
      if (helling > 0) {
        // De hoogste kruinen krijgen een schuimkop bovenop het glanslicht.
        const kruin = h[rij + x];
        const schuim = kruin > 0.72 ? (kruin - 0.72) * 2.6 : 0;
        d[i4] = 234;
        d[i4 + 1] = 249;
        d[i4 + 2] = 255;
        d[i4 + 3] = Math.min(255, helling * 74 + schuim * 130);
      } else {
        d[i4] = 5;
        d[i4 + 1] = 38;
        d[i4 + 2] = 64;
        d[i4 + 3] = Math.min(255, -helling * 92);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Losse lichtvonken die over de kruinen twinkelen. */
function maakSprankelTegel(S = 256) {
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const r = 0.9 + Math.random() * 2.2;
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
    grad.addColorStop(0, 'rgba(255,255,248,0.95)');
    grad.addColorStop(0.4, 'rgba(220,244,255,0.35)');
    grad.addColorStop(1, 'rgba(220,244,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r * 2.4, 0, TAU);
    g.fill();
  }
  return c;
}

/**
 * Zachte donkere vlekken. Uitvergroot en traag drijvend lezen ze als de
 * schaduw van passerende stapelwolken — het goedkoopste middel om een vlak
 * blauw canvas de schaal van een oceaan te geven.
 */
function maakWolkTegel() {
  // Meteen op eindmaat gemaakt: een tegel die we bij het vullen nog moeten
  // opschalen dwingt het canvas hem elk beeld opnieuw te bemonsteren.
  const S = 768;
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  // Weinig en groot, niet veel en klein. Twaalf vlekken van bijna een halve
  // tegel lezen als het schaduwveld van een wolkenveld; zesentwintig kleintjes
  // lazen als vlekkerigheid, en dan doet de laag precies wat hij niet moet
  // doen — het beeld bevuilen in plaats van het ordenen.
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const r = 150 + Math.random() * 230;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(2,18,34,0.6)');
      grad.addColorStop(0.55, 'rgba(2,18,34,0.28)');
      grad.addColorStop(1, 'rgba(2,18,34,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, TAU);
      g.fill();
    }
  }
  return c;
}

/**
 * Schuimvlokken op transparant, naadloos herhaalbaar.
 *
 * Deze tegel wordt als `strokeStyle` over de kustlijn gehaald, en dát is het
 * hele punt: branding als streepjeslijn kán niet werken. Een streepje van
 * zestien lang bij zestien breed met ronde koppen ís een ovaal, dus de kust lag
 * jarenlang in een ketting witte worstjes. Een patroon breekt de lijn op de
 * schaal van de vlokken zelf in plaats van op de schaal van de streepjes.
 */
function maakSchuimTegel(S = SCHUIM_TEGEL) {
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 170; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const r = 1.1 + Math.random() * 3.2;
    const a = 0.3 + Math.random() * 0.62;
    // Ook over de randen heen tekenen, anders valt de naad op zodra het
    // patroon zich herhaalt langs een lange kust.
    for (const [ox, oy] of [
      [0, 0], [S, 0], [-S, 0], [0, S], [0, -S],
      [S, S], [-S, -S], [S, -S], [-S, S],
    ]) {
      const px = x + ox,
        py = y + oy;
      const rand = r * 2.2;
      if (px < -rand || px > S + rand || py < -rand || py > S + rand) continue;
      const grad = g.createRadialGradient(px, py, 0, px, py, rand);
      grad.addColorStop(0, `rgba(246,253,255,${a})`);
      grad.addColorStop(0.5, `rgba(232,248,253,${a * 0.48})`);
      grad.addColorStop(1, 'rgba(226,246,252,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(px, py, rand, 0, TAU);
      g.fill();
    }
  }
  return c;
}

/**
 * Zachte licht- en donkervlekken die de hoogtebanden breken.
 *
 * De vijf hoogtetinten van een eiland worden als concentrische strepen langs de
 * kust gezet, en dus zijn ze perfect evenwijdig aan de oever — dat leest als de
 * terrassen van een reliëfkaart, niet als landschap. Deze laag legt er een
 * onregelmatig patroon overheen dat de banden op een andere schaal doorsnijdt.
 */
function maakVlekTegel() {
  const S = 256;
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const r = 34 + Math.random() * 62;
    const licht = i % 2 === 0;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, licht ? 'rgba(228,240,172,0.2)' : 'rgba(22,46,26,0.22)');
      grad.addColorStop(1, licht ? 'rgba(226,240,168,0)' : 'rgba(22,46,26,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, TAU);
      g.fill();
    }
  }
  return c;
}

/** Korrelige textuur voor het land. */
function maakLandTegel() {
  const S = 128;
  const c = offscreen(S, S);
  const g = c.getContext('2d');
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const d = Math.random();
    g.fillStyle = d < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, y, 1.4, 1.4);
  }
  return c;
}

// De buffercache van de landlaag staat hier en niet in land.js: initPatronen()
// moet hem ongeldig kunnen maken en anders ontstond een invoerkring.
export const landLaag = {
  canvas: null,
  wereld: null,
  geldig: false,
  dichtheid: 0,
  pw: 0,
  ph: 0,
  x0: 0,
  y0: 0,
  w: 0,
  h: 0,
};

export function initPatronen(ctx) {
  landTegel = maakLandTegel();
  vlekTegel = maakVlekTegel();
  wolkTegel = maakWolkTegel();
  schuimPatroon = ctx.createPattern(maakSchuimTegel(), 'repeat');
  // Eén vonkenlaag. Twee zag er iets levendiger uit, maar 'lighter' is de
  // duurste menging die we gebruiken en dit is een schermvullende laag.
  sprankelLagen = [maakSprankelTegel(256)].map((t) => ({
    patroon: ctx.createPattern(t, 'repeat'),
    maat: t.width,
  }));
  golfStand.lagen = null;
  landLaag.geldig = false;
}

// Golftegels voor de huidige windrichting. De richting kwantiseren we in
// stapjes van ruim zeven graden: de wind draait traag, dus we bouwen de tegels
// hooguit een paar keer per minuut opnieuw.
const GOLF_STAP = 0.13;

// [maat in beeldpixels, driftsnelheid, dekking, wolkenschaduw meebakken] —
// deining, golfslag, rimpeling. De maat staat vast in plaats van mee te schalen
// met de zoom: zo hoeft het canvas de tegel nooit te herbemonsteren, en dat
// scheelt bij een schermvullende laag meer dan alle andere winst bij elkaar.
//
// De deining staat op de maat van de wolkentegel, want daar bakken we de
// wolkenschaduw in mee. Beide drijven traag en groot met de wind; ze in één
// laag doen scheelt een hele schermvullende vulling per beeld.
//
// De maten staan niet los van de schepen. Een golfslag hoort een paar
// scheepslengtes te meten; op 320 pixels naast een schip van veertig was elke
// golf zeven schepen lang en las de zee als behang in plaats van als water.
// Voor de dekking geldt hetzelfde evenwicht als bij de golfreeksen: de
// middenlaag draagt het beeld, de rimpel is kruiding en niet meer dan dat.
const GOLF_LAGEN = [
  [768, 6, 0.5, true],
  [210, 17, 0.44, false],
  [96, 30, 0.16, false],
];

const golfStand = { stap: null, lagen: null, ctx: null };

export function zorgVoorGolven(ctx, hoek) {
  const stap = Math.round(hoek / GOLF_STAP);
  if (golfStand.stap === stap && golfStand.lagen && golfStand.ctx === ctx) return golfStand.lagen;
  const bron = maakGolfTegel(stap * GOLF_STAP);
  golfStand.lagen = GOLF_LAGEN.map(([maat, snel, alfa, metWolken]) => {
    const c = offscreen(maat, maat);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (metWolken && wolkTegel) {
      g.drawImage(wolkTegel, 0, 0, maat, maat);
      // De golven wegen binnen deze laag lichter dan de wolken; het verschil
      // zat vroeger in de twee afzonderlijke dekkingen (0,30 om 0,42).
      g.globalAlpha = 0.71;
    }
    g.drawImage(bron, 0, 0, maat, maat);
    return { patroon: ctx.createPattern(c, 'repeat'), maat, snel, alfa };
  });
  golfStand.stap = stap;
  golfStand.ctx = ctx;
  return golfStand.lagen;
}

/**
 * Vult het beeld met een herhalend patroon, verschoven over (offX, offY).
 *
 * Het patroon ligt vast aan de oorsprong van de gebruikersruimte, dus door het
 * canvas te verschuiven en het gat terug te compenseren dekken we precies het
 * beeld — geen overdruk, geen patroontransform, geen herbemonstering.
 */
export function vulPatroon(ctx, patroon, vw, vh, maat, offX, offY, alfa, samenstelling) {
  if (!patroon || alfa <= 0.002) return;
  const tx = mod(offX, maat),
    ty = mod(offY, maat);
  ctx.save();
  ctx.globalAlpha = alfa;
  if (samenstelling) ctx.globalCompositeOperation = samenstelling;
  ctx.translate(tx, ty);
  ctx.fillStyle = patroon;
  ctx.fillRect(-tx, -ty, vw, vh);
  ctx.restore();
}

