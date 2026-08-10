// Alles wat op het canvas getekend wordt: zee, land, steden en schepen.
import { TAU, clamp, lerp, makeRng, normAngle, sierTijd, sierRustig } from './util.js';
import { NATIES, SCHIP_INDEX, SCHEEP_MAAT } from './data.js';
// world.js leunt alleen op util en data, dus dit levert geen kringetje op.
import { STORM_KERN, stormStraalBij } from './world.js';
import { WORLD_W, WORLD_H } from './world.js';

// --- Kleine hulpjes -------------------------------------------------------

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const mod = (a, n) => ((a % n) + n) % n;

/** '#rrggbb' → '232,230,224', zodat we er rgba()-stops van kunnen maken. */
function rgbVan(kleur) {
  const h = String(kleur).replace('#', '').trim();
  const vol = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(vol, 16);
  if (!Number.isFinite(n)) return '230,230,230';
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const KAN_TRANSFORM_LEZEN = typeof CanvasRenderingContext2D !== 'undefined' &&
  typeof CanvasRenderingContext2D.prototype.getTransform === 'function';

/** Totale schaal van de actieve transform: schermpixels per wereldeenheid. */
function transformSchaal(ctx) {
  if (!KAN_TRANSFORM_LEZEN) return 1;
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

// De zon staat vast boven de linkerschouder; alle slagschaduwen wijzen dezelfde
// kant op, ongeacht de koers van een schip of de plek van een eiland.
const ZON_X = 2.6;
const ZON_Y = 3.6;

// --- Patronen -------------------------------------------------------------

// We bewaren de tegels zelf (niet het patroon), want elk canvas heeft zijn
// eigen patroonobject nodig — de landlaag tekent op een eigen buffer.
let landTegel = null;
let vlekTegel = null;
let wolkTegel = null;
/** @type {{patroon:CanvasPattern, maat:number}[]} */
let sprankelLagen = [];
/** Schuimpatroon voor de branding; hangt aan het canvas, net als de sprankels. */
let schuimPatroon = null;

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
const LICHT_X = -ZON_X / LICHT_LEN;
const LICHT_Y = -ZON_Y / LICHT_LEN;

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

function zorgVoorGolven(ctx, hoek) {
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
function vulPatroon(ctx, patroon, vw, vh, maat, offX, offY, alfa, samenstelling) {
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

// --- Zee ------------------------------------------------------------------

/**
 * Afgelegde weg van de zeegang, opgeteld per beeld in plaats van berekend als
 * tijd × snelheid.
 *
 * Dat verschil is wezenlijk. `t · v` is een positie die uit de *huidige*
 * snelheid volgt, dus zodra de wind aanwakkert of draait wordt met terugwerkende
 * kracht de hele geschiedenis herschreven: het golfveld verspringt in één beeld,
 * en tijdens het draaien raast het weg met een schijnbare snelheid die met de
 * speelduur meegroeit. Door de verplaatsing op te tellen verandert een winddraai
 * alleen nog wat er vanaf nú gebeurt — precies wat je van water verwacht.
 *
 * Eén vector volstaat voor alle lagen: hun snelheid is een vaste factor, dus
 * `laag.snel × drift` geeft elke laag zijn eigen tempo op dezelfde stroming.
 */
const zeeDrift = { x: 0, y: 0, tijd: null };

function zeeDriftBij(t, richting, kracht) {
  if (zeeDrift.tijd === null) {
    zeeDrift.tijd = t;
    return zeeDrift;
  }
  // Twee tekenbeurten binnen één beeld tellen niet dubbel (dt = 0), en een
  // sprong in de tijd — tabblad weg geweest, andere scène — mag niet in één
  // klap doorwerken.
  const dt = clamp(t - zeeDrift.tijd, 0, 0.25);
  zeeDrift.tijd = t;
  if (!sierRustig()) {
    zeeDrift.x += Math.cos(richting) * kracht * dt;
    zeeDrift.y += Math.sin(richting) * kracht * dt;
  }
  return zeeDrift;
}

/**
 * Tekent de open zee. `cam` = {x, y, zoom}, `vw/vh` = grootte van het beeld,
 * `wind` = {richting, kracht} zodat de deining met de wind meeloopt.
 */
/**
 * Schemertoestand van de dag (0..1): 0 = helder middaglicht, 1 = diepe schemer.
 * De fases lopen langzaam mee met de speeldatum — een natuurlijke
 * jaargetijde-schommeling zonder klok- of weersysteem.
 */
export function schemerFactor() {
  try {
    const dag = (globalThis.__G && __G.speler && __G.speler.dag) || 0;
    const cyclus = Math.sin((dag / 365) * TAU + 0.6);
    return clamp(cyclus * 0.32 + 0.12, 0, 1);
  } catch (e) {
    return 0.12;
  }
}

function mengKleur(hex, zwart) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const f = (c) => Math.round(c * (1 - zwart));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function tekenZee(ctx, cam, vw, vh, t, wind) {
  const schemer = schemerFactor();
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, mengKleur('#0a3a5e', schemer));
  g.addColorStop(0.42, mengKleur('#14618c', schemer * 0.8));
  g.addColorStop(0.72, mengKleur('#10527a', schemer * 0.72));
  g.addColorStop(1, mengKleur('#092f4c', schemer * 0.65));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  const wr = wind ? wind.richting : 0;
  const wk = clamp(wind ? wind.kracht : 1, 0.25, 2);
  const st = sierTijd(t);
  const zoom = cam.zoom || 1;
  // Het water beweegt met de wereld mee (het ligt eronder, niet erachter), dus
  // de patronen volgen de camera één-op-één; alleen de drift is van de wind.
  const camX = cam.x * zoom,
    camY = cam.y * zoom;
  const drift = zeeDriftBij(t, wr, wk);

  // Deining (met de wolkenschaduw erin), golfslag, en — alleen als je er dicht
  // genoeg op zit — rimpeling. Alle drie dezelfde tegel op een andere maat en
  // snelheid: het oog ziet er drie afzonderlijke zeegangen in, en het scheelt
  // twee tegelbouwen. De deining blijft bewust flauw: op die maat is één tegel
  // bijna een halve schermbreedte, en een sterke laag zou zijn eigen herhaling
  // verraden.
  const golfLagen = zorgVoorGolven(ctx, wr);
  for (let i = 0; i < golfLagen.length; i++) {
    if (i === 2 && zoom <= 0.8) break; // uitgezoomd is rimpeling toch alleen ruis
    const { patroon, maat, snel, alfa } = golfLagen[i];
    vulPatroon(ctx, patroon, vw, vh, maat, -camX + drift.x * snel, -camY + drift.y * snel, alfa);
  }

  // Zonnevonken op de kruinen, ademend zodat het twinkelt in plaats van staat.
  // Bij schemering doven ze uit: dan is er geen zon om in te vonken.
  const helder = clamp(1 - schemer * 1.4, 0.15, 1);
  for (let i = 0; i < sprankelLagen.length; i++) {
    const { patroon, maat } = sprankelLagen[i];
    const alfa = 0.24 * helder * (0.55 + 0.45 * Math.sin(st * 1.7));
    vulPatroon(ctx, patroon, vw, vh, maat, -camX + drift.x * 21, -camY + drift.y * 21, alfa, 'lighter');
  }

  // Schemering: een goudoranje gloed op de kim en een blauwige nevel. Deze
  // gaat óver het water heen, anders kleurt hij alleen de lege ondergrond.
  if (schemer > 0.05) {
    const s = schemer;
    const gloed = ctx.createRadialGradient(vw * 0.5, vh * 0.35, 0, vw * 0.5, vh * 0.35, vh * 0.7);
    gloed.addColorStop(0, `rgba(255,180,80,${0.2 * s})`);
    gloed.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = gloed;
    ctx.fillRect(0, 0, vw, vh);
    const nevel = ctx.createLinearGradient(0, 0, 0, vh);
    nevel.addColorStop(0, `rgba(24,42,70,${0.42 * s})`);
    nevel.addColorStop(1, 'rgba(10,30,52,0)');
    ctx.fillStyle = nevel;
    ctx.fillRect(0, 0, vw, vh);
  }
}

// --- Diepte ---------------------------------------------------------------

// Wereldeenheden per pixel in de dieptekaart. Grof mag — het is een zachte
// overgang — maar niet té grof: hoe kleiner de bron, hoe zwaarder de browser
// moet interpoleren bij het uitvergroten, en dat is een schermvullende
// bewerking die elk beeld terugkomt.
const DIEPTE_SCHAAL = 4;

// Van diep naar ondiep: breedte van de gordel in wereldeenheden, de kleur en
// hoe zwaar de laag meetelt. De bankfactor van elk eiland schaalt de breedte,
// zodat de Bahamabank in een breed turkoois veld ligt en Dominica in geen.
const DIEPTE_STAPPEN = [
  // De buitenste stap is geen bank meer maar de continentale aanloop: hij is
  // te breed om als kustrand te lezen en geeft de kaart op zijn eigen schaal
  // structuur — het verschil tussen de Antillenboog en de diepe Caribische kom.
  [1400, '#134f74', 0.2],
  [500, '#1b5f80', 0.26],
  [320, '#1f7290', 0.28],
  [200, '#27889c', 0.3],
  [120, '#3aa3a8', 0.32],
  [66, '#55c0b4', 0.34],
  [32, '#7ad6c2', 0.36],
];

const diepteCache = { wereld: null, canvas: null };

function bouwDiepteKaart(wereld) {
  const W = Math.max(1, Math.ceil(WORLD_W / DIEPTE_SCHAAL));
  const H = Math.max(1, Math.ceil(WORLD_H / DIEPTE_SCHAAL));
  const c = offscreen(W, H);
  const g = c.getContext('2d');
  // Elke stap eerst apart optrekken en dan als geheel met vaste dekking
  // opleggen: anders stapelen de banken van naburige eilanden op elkaar en
  // wordt de Kleine Antillen één lichtgevende sliert.
  const tmp = offscreen(W, H);
  const tg = tmp.getContext('2d');
  for (const [breedte, kleur, alfa] of DIEPTE_STAPPEN) {
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.clearRect(0, 0, W, H);
    tg.setTransform(1 / DIEPTE_SCHAAL, 0, 0, 1 / DIEPTE_SCHAAL, 0, 0);
    tg.lineJoin = 'round';
    tg.lineCap = 'round';
    tg.strokeStyle = kleur;
    tg.fillStyle = kleur;
    for (const l of wereld.land) {
      tg.lineWidth = breedte * (l.bank || 1);
      tg.stroke(l.path);
      tg.fill(l.path);
    }
    g.globalAlpha = alfa;
    g.drawImage(tmp, 0, 0);
  }
  return c;
}

/**
 * Ondiep water als veld in plaats van als randje: de banken en platen zijn
 * van ver zichtbaar, en het verschil tussen een koraalplateau en een steile
 * vulkaanhelling wordt leesbaar. Verwacht de camera-transform.
 */
export function tekenDiepte(ctx, wereld) {
  if (diepteCache.wereld !== wereld || !diepteCache.canvas) {
    diepteCache.canvas = bouwDiepteKaart(wereld);
    diepteCache.wereld = wereld;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(diepteCache.canvas, 0, 0, WORLD_W, WORLD_H);
  ctx.restore();
}

// --- Land -----------------------------------------------------------------

function bbox(l) {
  if (l._bb) return l._bb;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of l.pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  l._bb = { x0, y0, x1, y1 };
  return l._bb;
}

// De eilanden veranderen nooit. We tekenen ze daarom één keer op een buffer die
// wat groter is dan het scherm, en schuiven die mee; pas als de camera eruit
// loopt (of de zoom verandert) bouwen we hem opnieuw op. Dat scheelt negen
// dure tekengangen over een kustlijn van honderden punten, elk frame.
const LAND_MARGE = 160; // schermpixels speling rondom het beeld

const landLaag = {
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

function bouwLandLaag(wereld, cam, vw, vh, dpr) {
  const dichtheid = cam.zoom * dpr;
  const pw = Math.max(1, Math.ceil((vw + LAND_MARGE * 2) * dpr));
  const ph = Math.max(1, Math.ceil((vh + LAND_MARGE * 2) * dpr));

  if (!landLaag.canvas) landLaag.canvas = offscreen(pw, ph);
  if (landLaag.canvas.width !== pw || landLaag.canvas.height !== ph) {
    landLaag.canvas.width = pw;
    landLaag.canvas.height = ph;
  }

  landLaag.dichtheid = dichtheid;
  landLaag.pw = pw;
  landLaag.ph = ph;
  landLaag.w = pw / dichtheid;
  landLaag.h = ph / dichtheid;
  // Op hele bufferpixels uitlijnen, anders wordt het beeld onnodig zacht.
  landLaag.x0 = Math.floor((cam.x - landLaag.w / 2) * dichtheid) / dichtheid;
  landLaag.y0 = Math.floor((cam.y - landLaag.h / 2) * dichtheid) / dichtheid;
  landLaag.wereld = wereld;

  const g = landLaag.canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, pw, ph);
  g.setTransform(dichtheid, 0, 0, dichtheid, -landLaag.x0 * dichtheid, -landLaag.y0 * dichtheid);
  tekenEilanden(g, wereld, landLaag, cam.zoom);
  landLaag.geldig = true;
}

/** Begrenzingsvak van een bergrug, met wat lucht voor de breedte van de rug. */
function rugVak(rug) {
  if (rug._bb) return rug._bb;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of rug.pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const m = 40 * rug.hoog;
  rug._bb = { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  return rug._bb;
}

/**
 * Een bergrug als keten van toppen. Eén streep van gelijke dikte leest als een
 * omgevallen boomstam; een rij overlappende koppen die naar de uiteinden toe
 * uitdooft leest als gebergte. De koppen gaan in één pad, zodat de overlap bij
 * het vullen niet als donkere vlek doorschemert.
 */
function rugPaden(rug) {
  if (rug._paden) return rug._paden;
  const pts = rug.pts;
  const seg = [];
  let lengte = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    lengte += d;
  }
  const basis = 18 * rug.hoog;
  const n = Math.max(9, Math.round(lengte / (basis * 0.4)));

  // [verschuiving richting de zon, straalfactor] per laag: schaduwzijde,
  // gesteente, droge kam, en de toppen die het licht vangen.
  const lagen = [[-0.26, 1], [0, 0.9], [0.1, 0.58], [0.3, 0.26]];
  const paden = lagen.map(() => new Path2D());

  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let d = t * lengte,
      i = 0;
    while (i < seg.length - 1 && d > seg[i]) {
      d -= seg[i];
      i++;
    }
    const u = seg[i] ? clamp(d / seg[i], 0, 1) : 0;
    const x = lerp(pts[i][0], pts[i + 1][0], u);
    const y = lerp(pts[i][1], pts[i + 1][1], u);
    // Uitdovend naar de uiteinden, met een vaste rimpel zodat de kam niet als
    // een gladde worst oogt. Deterministisch: de kaart moet elke keer gelijk zijn.
    const taper = Math.sqrt(Math.sin(Math.PI * clamp(t, 0.04, 0.96)));
    const ruis = Math.abs((Math.sin(k * 12.9898 + rug.hoog * 78.233) * 43758.5453) % 1);
    const r = basis * taper * (0.68 + 0.55 * ruis);
    // Kammen kronkelen; een rechte lijn toppen verraadt de constructie.
    const zw = Math.sin(k * 2.4 + rug.hoog * 9.1) * basis * 0.22;
    const nx = i < seg.length && seg[i] ? -(pts[i + 1][1] - pts[i][1]) / seg[i] : 0;
    const ny = i < seg.length && seg[i] ? (pts[i + 1][0] - pts[i][0]) / seg[i] : 0;
    const px = x + nx * zw,
      py = y + ny * zw;
    for (let li = 0; li < lagen.length; li++) {
      const [verschuif, factor] = lagen[li];
      paden[li].moveTo(px + LICHT_X * r * verschuif + r * factor, py + LICHT_Y * r * verschuif);
      paden[li].arc(px + LICHT_X * r * verschuif, py + LICHT_Y * r * verschuif, r * factor, 0, TAU);
    }
  }
  rug._paden = paden;
  return paden;
}

// --- Begroeiing, rivieren en ontginning -----------------------------------
//
// Alles hieronder wordt op de gebufferde landlaag getekend, dus het kost niets
// per beeld — alleen bij een cameraverplaatsing die buiten de marge valt. Dat
// maakt het betaalbaar om het binnenland te vullen in plaats van het als vlakke
// hoogtebanden te laten liggen.

// Wereldeenheden per kandidaat-boomgroep. Het gaat om de verhouding met de
// kroongrootte hieronder: groepen die groot zijn ten opzichte van hun onderlinge
// afstand lezen als losse broccoli, kleine en dicht opeen als bos.
const BOOM_RASTER = 21;
// Emmerzijde van de ruimtelijke index. Zonder emmers zou een landmassa als het
// vasteland al zijn duizenden groepen per herbouw langslopen.
const BOOM_EMMER = 256;
// Hoe ver de kroonlaag van de kust vandaan blijft: strand en branding moeten
// vrij blijven, anders groeit het bos tot in het schuim.
const BOOM_KUSTMARGE = 15;

const BOOM_MASSA = ['#2b4d2b', '#33582e', '#3d6434'];

/**
 * Deterministische ruis (0..1) uit twee roostercoördinaten en een zaad.
 *
 * Een hash in plaats van `makeRng`, omdat je een hash mag overslaan. Bij een
 * doorlopende reeks moet je voor élke cel evenveel getallen trekken — ook voor
 * de tienduizenden zeecellen in het begrenzingsvak van het vasteland — anders
 * verschuift de hele begroeiing. Hiermee mag de goedkope landtoets vooropgaan.
 */
function ruis(ix, iy, zaad) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(zaad | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Boomgroepen van één landmassa, in emmers van BOOM_EMMER.
 *
 * Deterministisch uit het wereldzaad en de index van de landmassa: de kaart
 * moet er bij hetzelfde zaad elke keer hetzelfde uitzien, ook na herladen uit
 * een opslag die alleen het zaad bewaart.
 */
function bomenVan(wereld, l, index) {
  if (l._bomen) return l._bomen;
  const b = bbox(l);
  const zaad = ((wereld.seed ^ 0x9e3779b9) + index * 7919) >>> 0;
  const emmers = new Map();
  const nx = Math.ceil((b.x1 - b.x0) / BOOM_RASTER);
  const ny = Math.ceil((b.y1 - b.y0) / BOOM_RASTER);
  for (let iy = 0; iy < ny; iy++) {
    const cy = b.y0 + (iy + 0.5) * BOOM_RASTER;
    for (let ix = 0; ix < nx; ix++) {
      // Eerst de goedkoopste toets. Het begrenzingsvak van het vasteland beslaat
      // vrijwel de hele wereldkaart, dus verreweg de meeste cellen liggen in
      // zee; die mogen niet eerst een handvol dobbelstenen kosten. Vandaar ook
      // `ruis()` in plaats van een doorlopende reeks: een hash mag je overslaan,
      // een reeks niet zonder alles te verschuiven.
      const cx = b.x0 + (ix + 0.5) * BOOM_RASTER;
      if (!wereld.isLand(cx, cy)) continue;
      // De dichtheid varieert in het groot: dicht bos naast open savanne. Zonder
      // deze modulatie ligt er een gelijkmatig tapijt over het hele eiland, en
      // dan leest het als textuur in plaats van als landschap.
      const dicht =
        0.5 + 0.5 * Math.sin(cx * 0.0042 + cy * 0.0027) * Math.cos(cy * 0.0035 - cx * 0.0019);
      if (ruis(ix, iy, zaad + 3) < 0.1 + 0.52 * (1 - dicht)) continue;

      const x = cx + (ruis(ix, iy, zaad) - 0.5) * BOOM_RASTER * 0.76;
      const y = cy + (ruis(ix, iy, zaad + 1) - 0.5) * BOOM_RASTER * 0.76;
      if (!wereld.isLand(x, y)) continue;
      let vrij = true;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        if (!wereld.isLand(x + Math.cos(a) * BOOM_KUSTMARGE, y + Math.sin(a) * BOOM_KUSTMARGE)) {
          vrij = false;
          break;
        }
      }
      if (!vrij) continue;
      const maat = ruis(ix, iy, zaad + 4),
        tint = ruis(ix, iy, zaad + 5),
        rot = ruis(ix, iy, zaad + 6),
        plat = ruis(ix, iy, zaad + 7);
      const sleutel = `${Math.floor(x / BOOM_EMMER)},${Math.floor(y / BOOM_EMMER)}`;
      let emmer = emmers.get(sleutel);
      if (!emmer) emmers.set(sleutel, (emmer = []));
      emmer.push({
        x,
        y,
        r: 5.5 + maat * 6.5,
        tint: Math.floor(tint * BOOM_MASSA.length),
        // Draaiing en platheid maken van elke groep een eigen vorm. Zonder deze
        // twee is elke kroon dezelfde cirkel en ligt er een veld biljartballen
        // over het eiland.
        rot: rot * TAU,
        plat: 0.62 + plat * 0.3,
      });
    }
  }
  l._bomen = emmers;
  return emmers;
}

/**
 * De kroonlaag van één landmassa binnen het zichtbare vak.
 *
 * De groepen gaan per tint in één pad. Dat is niet alleen sneller (negen
 * vullingen in plaats van drieduizend), het voorkomt ook dat overlappende
 * kronen elkaar donkerder maken — precies dezelfde reden als bij `rugPaden`.
 */
function tekenBegroeiing(ctx, wereld, l, index, vak, zoom) {
  // Het aantal kronen in beeld groeit met het beeldóppervlak, dus met 1/zoom².
  // Twee keer uitzoomen is vier keer zoveel bomen van elk een kwart pixel: veel
  // duurder én minder te zien. Onder deze drempel nemen de hoogteband en de
  // vlekkenlaag het over.
  const zicht = clamp((zoom - 0.7) / 0.35, 0, 1);
  if (zicht <= 0.06) return;
  const emmers = bomenVan(wereld, l, index);
  if (!emmers.size) return;

  const schaduw = new Path2D();
  const massa = BOOM_MASSA.map(() => new Path2D());
  const licht = new Path2D();
  let aantal = 0;

  const e0 = Math.floor(vak.x0 / BOOM_EMMER),
    e1 = Math.floor((vak.x0 + vak.w) / BOOM_EMMER);
  const f0 = Math.floor(vak.y0 / BOOM_EMMER),
    f1 = Math.floor((vak.y0 + vak.h) / BOOM_EMMER);
  for (let f = f0; f <= f1; f++) {
    for (let e = e0; e <= e1; e++) {
      const emmer = emmers.get(`${e},${f}`);
      if (!emmer) continue;
      for (const t of emmer) {
        const r = t.r;
        schaduw.moveTo(t.x + ZON_X * 0.7 + r * 0.95, t.y + ZON_Y * 0.7);
        schaduw.ellipse(t.x + ZON_X * 0.7, t.y + ZON_Y * 0.7, r * 0.95, r * t.plat, t.rot, 0, TAU);
        // Twee overlappende ovalen per groep: de tweede breekt de gladde rand.
        // Ze zitten in hetzelfde pad, dus de overlap kleurt niet dubbel.
        const m = massa[t.tint];
        const ox = Math.cos(t.rot) * r * 0.34,
          oy = Math.sin(t.rot) * r * 0.34;
        m.moveTo(t.x + r * 0.95, t.y);
        m.ellipse(t.x, t.y, r * 0.95, r * t.plat, t.rot, 0, TAU);
        m.moveTo(t.x + ox + r * 0.6, t.y + oy);
        m.ellipse(t.x + ox, t.y + oy, r * 0.6, r * t.plat * 0.72, t.rot + 0.9, 0, TAU);
        licht.moveTo(t.x + LICHT_X * r * 0.36 + r * 0.34, t.y + LICHT_Y * r * 0.36);
        licht.ellipse(t.x + LICHT_X * r * 0.36, t.y + LICHT_Y * r * 0.36, r * 0.34, r * 0.26, t.rot, 0, TAU);
        aantal++;
      }
    }
  }
  if (!aantal) return;

  ctx.save();
  ctx.globalAlpha = zicht;
  ctx.fillStyle = 'rgba(14,30,16,0.4)';
  ctx.fill(schaduw);
  for (let i = 0; i < massa.length; i++) {
    ctx.fillStyle = BOOM_MASSA[i];
    ctx.fill(massa[i]);
  }
  ctx.fillStyle = 'rgba(150,186,110,0.2)';
  ctx.fill(licht);
  ctx.restore();
}

/**
 * Rivieren: van de bergruggen naar de dichtstbijzijnde kust.
 *
 * De richting wordt één keer gezocht door in twaalf richtingen te peilen waar
 * het water het dichtst bij ligt; daarna kronkelt de loop met een vast wiebelend
 * hoekje. Dat is genoeg om als rivier te lezen, en het kan niet dwars over een
 * eiland heen lopen omdat de loop stopt zodra hij water raakt.
 */
function rivierenVan(wereld) {
  if (wereld._rivieren) return wereld._rivieren;
  const rng = makeRng((wereld.seed ^ 0x51ee7) >>> 0);
  const uit = [];
  for (const rug of wereld.ruggen || []) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const t = rng() * (rug.pts.length - 1);
      const i = Math.min(rug.pts.length - 2, Math.floor(t));
      const u = t - i;
      const sx = lerp(rug.pts[i][0], rug.pts[i + 1][0], u);
      const sy = lerp(rug.pts[i][1], rug.pts[i + 1][1], u);
      if (!wereld.isLand(sx, sy)) continue;

      // Peil in welke richting de kust het dichtst bij ligt.
      let beste = 0,
        besteD = Infinity;
      for (let d = 0; d < 12; d++) {
        const a = (d / 12) * TAU;
        for (let r = 40; r <= 900; r += 40) {
          if (!wereld.isLand(sx + Math.cos(a) * r, sy + Math.sin(a) * r)) {
            if (r < besteD) {
              besteD = r;
              beste = a;
            }
            break;
          }
        }
      }
      if (!Number.isFinite(besteD)) continue;

      const pts = [[sx, sy]];
      const slinger = 0.5 + rng() * 0.7; // eigen golflengte per rivier
      const zwaai = rng() * TAU;
      let x = sx,
        y = sy,
        a = beste;
      for (let stap = 0; stap < 46; stap++) {
        // Twee bronnen van kronkel: een trage slinger die de grote bochten
        // maakt en wat ruis voor de kleine. Alleen ruis geeft een trillende
        // rechte lijn, en dat is precies hoe het er eerst uitzag.
        a += Math.sin(stap * slinger * 0.5 + zwaai) * 0.3 + (rng() - 0.5) * 0.5;
        // Blijf naar de kust gericht: zonder deze terugkoppeling wandelt de
        // loop na twintig stappen in een cirkeltje het binnenland in. Zwak
        // genoeg dat de bochten blijven staan.
        a = a * 0.9 + beste * 0.1;
        x += Math.cos(a) * 15;
        y += Math.sin(a) * 15;
        pts.push([x, y]);
        if (!wereld.isLand(x, y)) break;
      }
      if (pts.length > 5) uit.push(pts);
    }
  }
  // Twee paden voor álle rivieren samen: een donkere oever en het water zelf.
  //
  // Dit was een lus van losse `stroke()`-aanroepen per segment, per gang, per
  // rivier — én dat alles nog eens per zichtbare landmassa, want het tekenen
  // gebeurt binnen de knip van elk eiland. Dat liep op tot ruim vijftienhonderd
  // tekenopdrachten per herbouw van de landlaag. Als gevulde omtrek zijn het er
  // twee, en omdat de breedte toch al naar de monding toe oploopt is een polygoon
  // hier sowieso de eerlijker vorm dan een lijn met dikte.
  wereld._rivierPaden = [1.9, 1].map((breedte) => oeverPad(uit, breedte));
  wereld._rivieren = uit;
  return uit;
}

/** Omtrek van een rivier: links en rechts uitgezet, breder naar de monding. */
function oeverPad(rivieren, factor) {
  const pad = new Path2D();
  for (const pts of rivieren) {
    const links = [];
    const rechts = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const halve = ((1.6 + 4.4 * (i / (pts.length - 1))) * factor) / 2;
      const nx = (-dy / len) * halve,
        ny = (dx / len) * halve;
      links.push([pts[i][0] + nx, pts[i][1] + ny]);
      rechts.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    pad.moveTo(links[0][0], links[0][1]);
    for (let i = 1; i < links.length; i++) pad.lineTo(links[i][0], links[i][1]);
    for (let i = rechts.length - 1; i >= 0; i--) pad.lineTo(rechts[i][0], rechts[i][1]);
    pad.closePath();
  }
  return pad;
}

/** De rivieren, geknipt op de landmassa waar ze doorheen lopen. */
function tekenRivieren(ctx, wereld) {
  rivierenVan(wereld);
  const kleuren = ['rgba(28,52,40,0.5)', 'rgba(74,124,136,0.72)'];
  for (let i = 0; i < wereld._rivierPaden.length; i++) {
    ctx.fillStyle = kleuren[i];
    ctx.fill(wereld._rivierPaden[i]);
  }
}

/**
 * Ontgonnen land rond een stad: akkers in een waaier en een pad naar de rede.
 * Dit is het goedkoopste middel om een nederzetting bewoond te laten lijken —
 * zonder akkers staat er een dorp middenin ongerept oerwoud.
 */
function tekenOntginning(ctx, wereld, stad) {
  const rng = makeRng((stad.id * 2654435761) >>> 0);
  const n = 3 + stad.grootte;
  const r0 = 12 + stad.grootte * 3;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = r0 + rng() * (26 + stad.grootte * 8);
    const px = stad.x + Math.cos(a) * d;
    const py = stad.y + Math.sin(a) * d;
    if (!wereld.isLand(px, py)) continue;
    const w = 14 + rng() * 20;
    const h = 9 + rng() * 13;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + rng() * 0.6);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(158,150,86,0.5)' : 'rgba(128,142,74,0.5)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(74,62,34,0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Het pad van de stad naar de rede: waar de sloepen aanlanden.
  if (stad.ankerX != null) {
    ctx.strokeStyle = 'rgba(150,128,84,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(stad.x, stad.y);
    ctx.lineTo(lerp(stad.x, stad.ankerX, 0.75), lerp(stad.y, stad.ankerY, 0.75));
    ctx.stroke();
  }
  ctx.restore();
}

/** Eén bergrug: schaduwzijde, kaal gesteente, droge kam, zonbeschenen top. */
function tekenRug(ctx, rug) {
  const paden = rugPaden(rug);
  const kleuren = [
    'rgba(20,38,22,0.42)',
    'rgba(94,97,60,0.8)',
    'rgba(132,124,86,0.72)',
    'rgba(230,226,190,0.5)',
  ];
  for (let i = 0; i < paden.length; i++) {
    ctx.fillStyle = kleuren[i];
    ctx.fill(paden[i]);
  }
}

/** Het eigenlijke tekenwerk, op de bufferlaag. */
function tekenEilanden(ctx, wereld, vak, zoom) {
  const zx0 = vak.x0,
    zx1 = vak.x0 + vak.w,
    zy0 = vak.y0,
    zy1 = vak.y0 + vak.h;

  // De index gaat mee: de begroeiing van een landmassa wordt eruit gezaaid, en
  // die moet bij hetzelfde wereldzaad altijd dezelfde zijn.
  const zichtbaar = [];
  for (let i = 0; i < wereld.land.length; i++) {
    const l = wereld.land[i];
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push([l, i]);
  }
  if (!zichtbaar.length) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Rif vlak voor de kust. De brede banken zitten in de dieptekaart; hier gaat
  // het om de scherpe rand waar het koraal in het zand overgaat. De bankfactor
  // van het eiland bepaalt hoe ver die rand uitloopt.
  // Warmer en aanzienlijk lichter aangezet dan voorheen: samen met de
  // dieptekaart en de no-go-gloed stapelden deze drie lagen tot een fel cyaan
  // aureool om elk eiland — koraal dat oplichtte als neon.
  for (const [w, kleur] of [
    [40, 'rgba(58,150,158,0.25)'],
    [22, 'rgba(104,192,178,0.26)'],
    [10, 'rgba(170,232,200,0.32)'],
  ]) {
    ctx.strokeStyle = kleur;
    for (const [l] of zichtbaar) {
      ctx.lineWidth = w * (l.bank || 1);
      ctx.stroke(l.kust);
    }
  }

  // Slagschaduw voor diepte. De offset is in schermpixels, zodat de eilanden
  // bij elke zoomstand even hoog lijken.
  ctx.save();
  ctx.translate(5 / zoom, 7 / zoom);
  ctx.fillStyle = 'rgba(3,20,34,0.45)';
  for (const [l] of zichtbaar) ctx.fill(l.path);
  ctx.restore();

  // Hoogtetinten: donker, vochtig binnenland dat naar de kust toe opklaart.
  // De banden lopen vanaf de échte kust naar binnen — langs een kaartrand komt
  // dus vanzelf geen kustgroen te staan.
  const korrel = landTegel ? ctx.createPattern(landTegel, 'repeat') : null;
  const vlek = vlekTegel ? ctx.createPattern(vlekTegel, 'repeat') : null;
  for (const [l] of zichtbaar) {
    ctx.fillStyle = '#3a5c37';
    ctx.fill(l.path);
  }
  for (const [l, index] of zichtbaar) {
    ctx.save();
    ctx.clip(l.path);
    const b = bbox(l);
    const k = l.groot ? 1.7 : 1;
    // Minder spreiding dan voorheen (#41653a…#84b062). Die brede reeks maakte
    // van de vijf strepen vijf zichtbare terrassen; het blijft duidelijk dat de
    // kust lichter is dan het binnenland, maar het is geen hoogtekaart meer.
    for (const [w, kleur] of [
      [380, '#3f6038'],
      [220, '#476b3d'],
      [120, '#527844'],
      [62, '#5f8a4c'],
      [26, '#6f9c58'],
    ]) {
      ctx.lineWidth = w * k;
      ctx.strokeStyle = kleur;
      ctx.stroke(l.kust);
    }

    // Een patroonvulling over het begrenzingsvak van de landmassa kost het
    // vasteland bijna de hele wereldkaart, ook als er maar een strook van in
    // beeld staat. De knip laat alleen zien wat zichtbaar is; het vak begrenst
    // wat er wordt uitgerekend.
    const vx0 = Math.max(b.x0, zx0),
      vy0 = Math.max(b.y0, zy0);
    const vx1 = Math.min(b.x1, zx1),
      vy1 = Math.min(b.y1, zy1);

    // De hoogtebanden doorsnijden op een eigen schaal, zodat ze niet als
    // terrassen langs de kust blijven liggen. Vast in wereldeenheden: hij hoort
    // bij het landschap, niet bij het beeldscherm.
    if (vlek && vx1 > vx0 && vy1 > vy0) {
      const vk = 2.4;
      ctx.save();
      ctx.scale(vk, vk);
      ctx.fillStyle = vlek;
      ctx.fillRect(vx0 / vk, vy0 / vk, (vx1 - vx0) / vk, (vy1 - vy0) / vk);
      ctx.restore();
    }

    // Kroonlaag, dan de rivieren die er dwars doorheen snijden, dan de bergen
    // die er bovenuit steken, en tot slot het ontgonnen land om de steden.
    tekenBegroeiing(ctx, wereld, l, index, vak, zoom);
    tekenRivieren(ctx, wereld);

    // Bergruggen, geknipt op deze landmassa.
    if (wereld.ruggen) {
      for (const rug of wereld.ruggen) {
        const r = rugVak(rug);
        if (r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1) continue;
        if (r.x1 < zx0 || r.x0 > zx1 || r.y1 < zy0 || r.y0 > zy1) continue;
        tekenRug(ctx, rug);
      }
    }

    for (const stad of wereld.steden || []) {
      if (stad.x < b.x0 || stad.x > b.x1 || stad.y < b.y0 || stad.y > b.y1) continue;
      if (stad.x < zx0 - 220 || stad.x > zx1 + 220) continue;
      if (stad.y < zy0 - 220 || stad.y > zy1 + 220) continue;
      tekenOntginning(ctx, wereld, stad);
    }

    if (korrel && vx1 > vx0 && vy1 > vy0) {
      // De korrel blijft aan de wereld verankerd — anders verspringt hij zodra
      // de buffer opnieuw wordt opgebouwd — maar hij groeit mee bij uitzoomen,
      // zodat hij nooit subpixelklein wordt en gaat ruisen.
      const kk = Math.max(1, 1 / zoom);
      ctx.save();
      ctx.scale(kk, kk);
      ctx.fillStyle = korrel;
      ctx.fillRect(vx0 / kk, vy0 / kk, (vx1 - vx0) / kk, (vy1 - vy0) / kk);
      ctx.restore();
    }

    // Kustreliëf: de landrand vangt licht aan de zonzijde en valt weg aan de
    // andere. Dat tilt een eiland zichtbaar uit het water.
    ctx.save();
    ctx.translate(-LICHT_X * 3.2, -LICHT_Y * 3.2);
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(20,40,26,0.32)';
    ctx.stroke(l.kust);
    ctx.restore();
    ctx.save();
    ctx.translate(LICHT_X * 2.6, LICHT_Y * 2.6);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(226,232,178,0.26)';
    ctx.stroke(l.kust);
    ctx.restore();

    ctx.restore();
  }

  // Strand en kustlijn — alleen langs echte oevers.
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#dcc691';
  for (const [l] of zichtbaar) ctx.stroke(l.kust);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(247,236,205,0.85)';
  for (const [l] of zichtbaar) ctx.stroke(l.kust);
}

/**
 * Tekent alle eilanden met een ondiepe-waterzoom eromheen.
 * Verwacht dat de camera-transform al actief is.
 */
export function tekenLand(ctx, wereld, cam, vw, vh) {
  if (vw <= 0 || vh <= 0) return;
  const totaal = transformSchaal(ctx);
  const dpr = clamp(totaal / (cam.zoom || 1), 0.5, 4);

  const zx0 = cam.x - vw / 2 / cam.zoom,
    zx1 = cam.x + vw / 2 / cam.zoom,
    zy0 = cam.y - vh / 2 / cam.zoom,
    zy1 = cam.y + vh / 2 / cam.zoom;

  const past =
    landLaag.geldig &&
    landLaag.canvas &&
    landLaag.wereld === wereld &&
    Math.abs(landLaag.dichtheid - cam.zoom * dpr) < 1e-6 &&
    landLaag.pw === Math.max(1, Math.ceil((vw + LAND_MARGE * 2) * dpr)) &&
    landLaag.ph === Math.max(1, Math.ceil((vh + LAND_MARGE * 2) * dpr)) &&
    zx0 >= landLaag.x0 &&
    zx1 <= landLaag.x0 + landLaag.w &&
    zy0 >= landLaag.y0 &&
    zy1 <= landLaag.y0 + landLaag.h;

  if (!past) bouwLandLaag(wereld, cam, vw, vh, dpr);

  // De buffer heeft precies de resolutie van het scherm, maar de camera staat
  // zelden op een hele pixel. Zonder uitlijnen zou elke frame opnieuw worden
  // geïnterpoleerd en werd de kustlijn wazig; we schuiven hem daarom een
  // fractie van een pixel bij zodat de blit één-op-één valt.
  let dx = landLaag.x0,
    dy = landLaag.y0;
  if (KAN_TRANSFORM_LEZEN) {
    const T = ctx.getTransform();
    if (T.a && T.d) {
      const devX = T.a * landLaag.x0 + T.c * landLaag.y0 + T.e;
      const devY = T.b * landLaag.x0 + T.d * landLaag.y0 + T.f;
      dx += (Math.round(devX) - devX) / T.a;
      dy += (Math.round(devY) - devY) / T.d;
    }
  }
  ctx.drawImage(landLaag.canvas, dx, dy, landLaag.w, landLaag.h);
}

/**
 * Levendige kustrand, getekend ná de gebufferde landlaag zodat hij kan
 * bewegen zonder de cache ongeldig te maken. Geeft de kust een lappende
 * brandingstrook en een zachte, langzaam 'ademende' diepte-gloed die de
 * bevaarbaarheidsmarge van het grootste schip volgt.
 */
const GROOTSTE_ROMPSSTRAAL = 49 * 0.62 + 3; // linieschip: wat isVaren() toelaat

export function tekenKustEffecten(ctx, wereld, cam, vw, vh, tijd) {
  const zx0 = cam.x - vw / 2 / cam.zoom,
    zx1 = cam.x + vw / 2 / cam.zoom,
    zy0 = cam.y - vh / 2 / cam.zoom,
    zy1 = cam.y + vh / 2 / cam.zoom;
  const zichtbaar = [];
  for (const l of wereld.land) {
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push(l);
  }
  if (!zichtbaar.length) return;

  const st = sierTijd(tijd);
  const pulseren = 0.5 + 0.5 * Math.sin(st * 1.6);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Bewegende branding: twee brede banden schuimvlokken die tegen elkaar in
  // schuiven — dat kruisen is wat de kust laat kolken in plaats van stromen —
  // en daaronder één dunne lichte lijn die de oever zelf blijft markeren, ook
  // als de vlokken op afstand vervagen.
  const kanSchuiven =
    schuimPatroon &&
    typeof schuimPatroon.setTransform === 'function' &&
    typeof DOMMatrix !== 'undefined';
  if (schuimPatroon) {
    for (const [w, alfa, snel, fase] of [
      [18, 0.46 + 0.16 * pulseren, 1, 0],
      [8, 0.66 + 0.16 * pulseren, -0.62, 2.2],
    ]) {
      // Niet het canvas maar het patroon zelf verschuiven: de kustlijn mag geen
      // millimeter bewegen, alleen het schuim erover.
      if (kanSchuiven) {
        const d = st * 6 * snel;
        schuimPatroon.setTransform(new DOMMatrix().translate(d, d * 0.55 + fase * 11));
      }
      ctx.save();
      ctx.globalAlpha = alfa;
      ctx.lineWidth = w;
      ctx.strokeStyle = schuimPatroon;
      for (const l of zichtbaar) ctx.stroke(l.kust);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = `rgba(240,252,255,${0.34 + 0.16 * pulseren})`;
  for (const l of zichtbaar) ctx.stroke(l.kust);
  ctx.restore();

  // Zachte 'no-go'-gloed: de diepte-omtrek waar ook het grootste schip nog met
  // de hele romp kan varen. Dit is een navigatiehulp, geen decor — van dichtbij
  // helpt hij je door een doorgang, uitgezoomd legt hij alleen een neonrand om
  // elk eiland in de Antillen. Dus vervaagt hij mee met de zoom.
  const hulp = clamp((cam.zoom - 1.1) / 0.6, 0, 1);
  if (hulp > 0.01) {
    ctx.save();
    ctx.lineWidth = GROOTSTE_ROMPSSTRAAL * 2;
    ctx.strokeStyle = `rgba(96,206,186,${(0.07 + 0.04 * pulseren) * hulp})`;
    for (const l of zichtbaar) ctx.stroke(l.kust);
    ctx.restore();
  }
}

/**
 * Schuim langs een willekeurig pad, met dezelfde vlokken als de branding op de
 * zeekaart. Zo ziet een kust er in een zeeslag niet anders uit dan erbuiten.
 *
 * `bouwPad` moet het pad op `ctx` klaarzetten; wij strijken er het patroon
 * overheen. Wie hier een streepjeslijn voor in de plaats zet, krijgt weer de
 * ketting witte worstjes waar dit hele patroon voor bestaat.
 */
export function schuimLangs(ctx, bouwPad, breedte, alfa, tijd, snel = 1) {
  if (!schuimPatroon) return;
  const st = sierTijd(tijd);
  if (typeof schuimPatroon.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    const d = st * 6 * snel;
    schuimPatroon.setTransform(new DOMMatrix().translate(d, d * 0.55));
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = alfa;
  ctx.lineWidth = breedte;
  ctx.strokeStyle = schuimPatroon;
  bouwPad();
  ctx.stroke();
  ctx.restore();
}

/**
 * Vage lengte- en breedtelijnen, als op een oude zeekaart. De maaswijdte volgt
 * de zoom: één graad als je erop zit, vijf als je de hele Caraïben overziet.
 * Elke vijfde lijn telt als hoofdgraad en staat wat steviger aan.
 */
export function tekenKaartlijnen(ctx, cam, vw, vh) {
  const graad = 92;
  const zoom = cam.zoom || 1;
  const graden = zoom > 1.2 ? 1 : zoom > 0.5 ? 2 : 5;
  const stap = graad * graden;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  for (const [veelvoud, kleur] of [[1, 'rgba(220,205,160,0.06)'], [5, 'rgba(220,205,160,0.13)']]) {
    const s = stap * veelvoud;
    ctx.strokeStyle = kleur;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x += s) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += s) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

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
 * De romp met alles wat er vast aan zit. Hangt alleen af van het type en het
 * aantal geschutspoorten, dus we bakken hem één keer in een sprite.
 */
function tekenRompDetail(ctx, L, B, poorten) {
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
      // Koperen randje om het geschutspoort.
      ctx.strokeStyle = 'rgba(214,178,92,0.6)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px - 1.2, -B / 2 + 0.5, 2.4, 1.8);
      ctx.strokeRect(px - 1.2, B / 2 - 2.3, 2.4, 1.8);
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
// bovenop de vijand ligt.
const ROMP_BANDEN = [1, 1.5, 2, 3, 4, 6, 8];
const rompSprites = new Map();

function rompSprite(typeId, poorten, dichtheid) {
  let band = ROMP_BANDEN[ROMP_BANDEN.length - 1];
  for (const b of ROMP_BANDEN) {
    if (b >= dichtheid) {
      band = b;
      break;
    }
  }
  const sleutel = `${typeId}|${poorten}|${band}`;
  let sp = rompSprites.get(sleutel);
  if (sp) return sp;

  const [L, B] = scheepMaat(typeId);
  // Ruim genoeg voor de boegspriet (tot 0,70·L) en het achterwerk.
  const halfL = L * 0.75;
  const halfB = B * 0.75;
  const w = Math.max(1, Math.ceil(halfL * 2 * band));
  const h = Math.max(1, Math.ceil(halfB * 2 * band));
  const c = offscreen(w, h);
  const g = c.getContext('2d');
  g.setTransform(band, 0, 0, band, halfL * band, halfB * band);
  g.lineJoin = 'round';
  tekenRompDetail(g, L, B, poorten);

  sp = { canvas: c, ox: -halfL, oy: -halfB, w: halfL * 2, h: halfB * 2 };
  if (rompSprites.size > 160) rompSprites.clear();
  rompSprites.set(sleutel, sp);
  return sp;
}

/**
 * Tekent één schip. Coördinaten in wereldruimte, camera-transform actief.
 * opts: {zeilen 0..1, vaart, kanonnen, tijd, schaal}
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

  // Zoveel geschutspoorten als het schip werkelijk stukken aan een boord heeft.
  const stukken = opts.kanonnen != null ? opts.kanonnen : SCHIP_INDEX[typeId]?.kanonnen ?? 0;
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
  ctx.drawImage(sp.canvas, sp.ox, sp.oy, sp.w, sp.h);

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
      ctx.save();
      ctx.translate(px, 0);
      ctx.rotate(trim);
      // Zeil met een warme schaduw naar de ra en een lichte buik op de lij.
      const zb = B * 1.7 * grootte;
      const zl = L * 0.34 * grootte;
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
      // Bloem-/panellijnen: verticale baanstiksels en een bonnet-zoom onderaan.
      ctx.save();
      ctx.clip();
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
      ctx.restore();
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
      ctx.restore();
      // Mast met mars (het ronde platform, van bovenaf een schijfje om de mast).
      // Bij lage tuigage kantelt de mast zichtbaar — los touwwerk, schade.
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

      // Blokkade: gescheurde zeilen bij lage tuigage.
      if (tuigage < 0.82) {
        ctx.save();
        ctx.translate(px, 0);
        ctx.rotate(trim);
        const gatAlfa = (0.82 - tuigage) * 1.6;
        ctx.fillStyle = `rgba(4,20,36,${0.5 * gatAlfa})`;
        const gn = 2 + Math.floor((1 - tuigage) * 5);
        for (let g = 0; g < gn; g++) {
          const gx = -zl * 0.2 + ((g * 37 + m * 11) % 60) / 60 * zl * 0.7;
          const gy = -zb + ((g * 29 + m * 17) % 70) / 70 * zb * 1.6;
          ctx.beginPath();
          ctx.ellipse(gx, gy, 1.4, 1.8, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Wanten / tuigage tussen masten.
    if (masten > 1) {
      ctx.strokeStyle = 'rgba(60,45,30,0.35)';
      ctx.lineWidth = 0.4;
      const mastX = [];
      for (let m = 0; m < masten; m++) {
        mastX.push(lerp(L * 0.32, -L * 0.22, m / (masten - 1)));
      }
      // Tuigage staat vast aan de romp: de offset hangt niet van de zeilstand af.
      const wy = B * 0.62;
      for (let i = 0; i < mastX.length - 1; i++) {
        const x1 = mastX[i],
          x2 = mastX[i + 1];
        ctx.beginPath();
        ctx.moveTo(x1, -wy);
        ctx.lineTo(x2, -wy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, wy);
        ctx.lineTo(x2, wy);
        ctx.stroke();
      }
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
function roundRechthoek(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Eén huisje: gevel, dak aan de schaduwzijde en een deur. */
function tekenHuis(ctx, x, y, w, h, stijl) {
  ctx.fillStyle = stijl.gevel;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = stijl.dak;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 0.5, y - h / 2);
  ctx.lineTo(x, y - h / 2 - h * 0.42);
  ctx.lineTo(x + w / 2 + 0.5, y - h / 2);
  ctx.closePath();
  ctx.fill();
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
 * Een nederzetting van boven.
 *
 * De oude opzet zette de huisjes in een ring rond het middelpunt; zo ligt geen
 * enkele echte stad erbij. Hier loopt er een straat van het achterland naar het
 * water — de richting waarin de stad ook daadwerkelijk haar rede heeft — met de
 * bebouwing eraan, de kerk aan het landeinde en het bastion bij de haven. Wie
 * de kade ziet liggen, weet meteen waar hij moet aanleggen.
 */
export function tekenStad(ctx, stad, cam, tijd, gemarkeerd) {
  const natie = NATIES[stad.natie];
  const stijl = STAD_STIJL[stad.natie] || STAD_STIJL.piraat;
  // Dezelfde schaal als de schepen: een haven hoort groter te zijn dan de sloep
  // die eraan ligt, en dat blijft alleen kloppen als beide uit één formule komen.
  const s = wereldSchaal(cam.zoom);
  const st = sierTijd(tijd);
  const rng = makeRng((stad.id * 2246822519) >>> 0);

  const r = 7 + stad.grootte * 2.4;
  const heeftFort = stad.soort === 'fort' || stad.soort === 'schatkamer' || stad.grootte >= 3;
  const heeftKerk = stad.grootte >= 4;
  const ommuurd = stad.soort === 'fort' || stad.soort === 'schatkamer';
  // De straat wijst naar de rede. Alles hieronder is in die gedraaide ruimte:
  // +x is zeewaarts, -x het achterland.
  const naarZee =
    stad.ankerX == null ? 0 : Math.atan2(stad.ankerY - stad.y, stad.ankerX - stad.x);

  ctx.save();
  ctx.translate(stad.x, stad.y);
  ctx.scale(s, s);

  // Slagschaduw en het ontgonnen grondvlak, licht onregelmatig zodat het geen
  // getekende ellips is.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#cbb079';
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * TAU;
    const rr = r * (0.92 + 0.16 * Math.sin(a * 3 + stad.id));
    const x = Math.cos(a) * rr,
      y = Math.sin(a) * rr * 0.78;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.rotate(naarZee);

  // De kade: twee balken met dwarsliggers, en er ligt altijd wat aangemeerd.
  const kade = r * (1.1 + stad.grootte * 0.07);
  ctx.strokeStyle = '#7a5c34';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r * 0.5, -r * 0.16);
  ctx.lineTo(kade, -r * 0.16);
  ctx.moveTo(r * 0.5, r * 0.16);
  ctx.lineTo(kade, r * 0.16);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const px = lerp(r * 0.6, kade, i / 3);
    ctx.beginPath();
    ctx.moveTo(px, -r * 0.2);
    ctx.lineTo(px, r * 0.2);
    ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const px = lerp(r * 0.75, kade * 0.95, rng());
    const py = (i ? 1 : -1) * r * 0.34;
    ctx.fillStyle = '#5c4324';
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.16, r * 0.06, rng() * 0.6 - 0.3, 0, TAU);
    ctx.fill();
  }

  // De straat van het achterland naar de kade.
  ctx.strokeStyle = 'rgba(150,126,80,0.8)';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(-r * 0.85, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.stroke();

  // De bebouwing: twee rijen langs de straat. Kleine plaatsen krijgen een losse
  // hand vol hutten, grote een dicht opeengepakte rij.
  const n = 3 + stad.grootte * 2;
  for (let i = 0; i < n; i++) {
    const zijde = i % 2 ? 1 : -1;
    const t = Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1);
    const hx = lerp(-r * 0.72, r * 0.42, t) + (rng() - 0.5) * r * 0.12;
    const hy = zijde * (r * 0.3 + rng() * r * 0.22);
    const bw = r * (0.2 + rng() * 0.12);
    const bh = r * (0.16 + rng() * 0.1);
    tekenHuis(ctx, hx, hy, bw, bh, stijl);
  }

  // Kerk aan het landeinde van de straat, met de toren van de eigen natie.
  if (heeftKerk && stijl.toren !== 'geen') {
    const kx = -r * 0.92;
    ctx.fillStyle = stijl.gevel;
    ctx.fillRect(kx - r * 0.16, -r * 0.2, r * 0.32, r * 0.4);
    ctx.fillStyle = stijl.dak;
    if (stijl.toren === 'koepel') {
      ctx.beginPath();
      ctx.arc(kx, -r * 0.02, r * 0.15, 0, TAU);
      ctx.fill();
    } else if (stijl.toren === 'spits') {
      ctx.beginPath();
      ctx.moveTo(kx - r * 0.16, -r * 0.02);
      ctx.lineTo(kx, -r * 0.34);
      ctx.lineTo(kx + r * 0.16, -r * 0.02);
      ctx.closePath();
      ctx.fill();
    } else if (stijl.toren === 'trap') {
      // Trapgevel: drie treden, en daarmee is een Hollandse haven herkenbaar.
      for (let i = 0; i < 3; i++) {
        const w = r * (0.3 - i * 0.08);
        ctx.fillRect(kx - w / 2, -r * 0.2 - r * 0.09 * (i + 1), w, r * 0.09);
      }
    } else {
      ctx.fillRect(kx - r * 0.14, -r * 0.3, r * 0.28, r * 0.14);
    }
    ctx.strokeStyle = 'rgba(40,28,16,0.6)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(kx, -r * 0.36);
    ctx.lineTo(kx, -r * 0.5);
    ctx.moveTo(kx - r * 0.05, -r * 0.45);
    ctx.lineTo(kx + r * 0.05, -r * 0.45);
    ctx.stroke();
  }

  // Het bastion bewaakt de haveningang, dus het staat aan de zeezijde. De voet
  // van de vlaggenmast onthouden we in deze gedraaide ruimte; hij wordt straks
  // teruggerekend, want een vlag hangt rechtop in beeld en niet scheef mee met
  // de kade.
  let voetX = 0,
    voetY = -r * 0.2,
    mastHoog = r * 1.4;
  if (heeftFort) {
    voetX = r * 0.5;
    voetY = -r * 0.52;
    ctx.save();
    ctx.translate(voetX, voetY);
    const ster = bastionPad(r * 0.34, 5);
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
    mastHoog = r * 0.85;
  }

  ctx.restore(); // klaar met de draaiing naar zee

  // Mast en vlag in ongedraaide ruimte.
  const mx = Math.cos(naarZee) * voetX - Math.sin(naarZee) * voetY;
  const my = Math.sin(naarZee) * voetX + Math.cos(naarZee) * voetY;
  const mastTop = my - mastHoog;
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = heeftFort ? 1.2 : 1;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx, mastTop);
  ctx.stroke();

  const wapper = Math.sin(st * 4 + stad.id) * 1.6;
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

  // Een echte wal om de versterkte plaatsen, geen stippellijn.
  if (ommuurd) {
    ctx.strokeStyle = 'rgba(120,112,98,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.12, r * 0.86, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,54,44,0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.2, r * 0.93, 0, 0, TAU);
    ctx.stroke();
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

export function tekenRook(ctx, p) {
  const a = clamp(1 - p.t / p.duur, 0, 1);
  const sprite = rookSprite(p.kleur || '#e8e6e0');
  // De wolk vervaagt naar de rand, dus hij mag wat ruimer dan de oude schijf.
  const r = p.r * (1 + (1 - a) * 2.2) * 1.65;
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}

// --- Stormwolken -----------------------------------------------------------

// Grijstinten voor de wolkenlagen, van bijna-zwart in de kern tot helder wit
// aan de buitenrand — de zachte kleurovergang waar een natte bui om vraagt.
const WOLK_DONKER = [22, 34, 50];
const WOLK_MIDDEN = [52, 68, 88];
const WOLK_LICHT = [108, 124, 142];
const WOLK_HELDER = [164, 176, 190];
const WOLK_WIT = [232, 236, 240];

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
 * Geen egale donkere vlek meer, maar een gelaagd deeg van wolkenpartikels:
 * lichte cumulus rondom én in de mazen van de bui, een draaiend en ademend
 * lijf van donkere deegwolken, spiraalarmen die om de kern kronkelen en een
 * zwarte, rafelige kern. Alles volgt één deterministisch zaadje per cel, zodat
 * het landschap per beeld hetzelfde is, terwijl de trage draai, het zweven,
 * de vervorming en de verwaaiing met de wind de storm continu laten evolueren.
 * De rugband en de kernrand blijven leesbaar — daar neemt de speler zijn
 * besluit, dus die grenzen mogen nooit in het wolkenbrouwsel verdwijnen.
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

    // De wolkenhopen worden uit dit zaadje getrokken, niet uit Math.random —
    // zo is het landschap per beeld identiek en blijft alles deterministisch.
    const rng = makeRng(
      (Math.round(s.x * 7.31) * 31 + Math.round(s.y * 13.17) * 57 + Math.round(s.straal * 3.9)) >>> 0
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

    // --- 1 · Lichte cumulus rondom en tussen de buien ----------------------
    // Zachte, heldere stapelwolken aan de rand én in de mazen van de storm,
    // die van donkergrijs naar bijna-wit overlopen — zo krijgt het hele
    // weerbeeld afwisseling tussen zware en lichte partijen.
    const nc = 9 + Math.round(rng() * 4);
    for (let i = 0; i < nc; i++) {
      const a = rng() * TAU + fase * 0.14;
      const afstand = R * (0.55 + rng() * 1.35);
      const drijft = clamp((afstand - R * 0.8) / (R * 1.4), 0, 1);
      const px = s.x + Math.cos(a) * afstand + wdrX * afstand * 0.5 * drijft + Math.sin(st * 0.1 + i * 2.3) * 30;
      const py = s.y + Math.sin(a) * afstand + wdrY * afstand * 0.5 * drijft + Math.cos(st * 0.09 + i * 3.1) * 30;
      const r = (95 + rng() * 130) * groei;
      const helder = mengGrijs(WOLK_LICHT, rng() < 0.5 ? WOLK_HELDER : WOLK_WIT, rng());
      tekenDeeg(ctx, px, py, r, helder, fase * 0.3 + i * 1.7, (0.3 + rng() * 0.3) * groei);
    }

    // --- 2 · Het lijf: één donker silhouet dat ademt -----------------------
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

    // --- 3 · Het wolkenlijf: dichte deegwolken die draaien, zweven, vervormen
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
      // Grote, verre wolken wat opener, zodat het licht door de dunne delen
      // heen kan spelen en de storm diepte krijgt.
      const alpha = clamp(0.5 - 0.18 * diepte + rng() * 0.15, 0.15, 0.75) * groei;
      tekenDeeg(ctx, px, py, r, kleur, fase * draai * 0.3 + i * 2.3, alpha);
    }

    // --- 4 · Spiraalarmen: de werveling die het oog als storm leest ---------
    for (let arm = 0; arm < 2; arm++) {
      const aStart = fase * draai * 0.65 + arm * Math.PI;
      const armKleur = mengGrijs(arm ? WOLK_DONKER : WOLK_LICHT, WOLK_MIDDEN, arm ? 0.25 : 0.3);
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

    // --- 5 · Licht door de dunne delen -------------------------------------
    // Waar het wolkendek dun is, piept de lucht erdoorheen: heldere,
    // lichtblauwe schemerplekken middenin de bui geven het complex diepte.
    const nz = 6 + Math.round(rng() * 4);
    for (let i = 0; i < nz; i++) {
      const a = rng() * TAU + fase * 0.2;
      const afstand = R * (0.2 + rng() * 0.7);
      const drijft = clamp((afstand - R * 0.3) / (R * 0.8), 0, 1);
      const px = s.x + Math.cos(a) * afstand + wdrX * afstand * 0.4 * drijft + Math.sin(st * 0.15 + i * 4.1) * 22;
      const py = s.y + Math.sin(a) * afstand + wdrY * afstand * 0.4 * drijft + Math.cos(st * 0.12 + i * 2.7) * 22;
      const r = (70 + rng() * 120) * groei;
      const helder = mengGrijs(WOLK_HELDER, WOLK_WIT, rng() < 0.5 ? 0.5 : 0.85);
      tekenDeeg(ctx, px, py, r, helder, fase * 0.5 + i, (0.16 + rng() * 0.12) * groei);
    }

    // --- 6 · Randlicht op de zonzijde --------------------------------------
    // De zon staat vast linksboven; de bovenste flank van het wolkenlijf vangt
    // daardoor een heldere gloed, en de toppen daar krijgen een felle witte kap.
    const zonA = Math.atan2(-ZON_Y, -ZON_X);
    for (let i = 0; i < 7; i++) {
      const a = zonA + (rng() - 0.5) * 1.1;
      const afstand = R * (0.45 + rng() * 0.5);
      const px = s.x + Math.cos(a) * afstand + Math.sin(st * 0.11 + i * 1.9) * 26;
      const py = s.y + Math.sin(a) * afstand + Math.cos(st * 0.1 + i * 3.3) * 26;
      const r = (90 + rng() * 130) * groei;
      tekenDeeg(ctx, px, py, r, mengGrijs(WOLK_HELDER, WOLK_WIT, rng()), fase * 0.4 + i, (0.28 + rng() * 0.18) * groei);
    }
    // En een zachte gloed waar de zon langs het hele lijf strijkt.
    const glans = ctx.createRadialGradient(
      s.x - R * 0.55, s.y - R * 0.7, 0,
      s.x - R * 0.55, s.y - R * 0.7, R * 0.85
    );
    glans.addColorStop(0, `rgba(${rgbVan(mengGrijs(WOLK_HELDER, WOLK_WIT, 0.35))},${0.2 * groei})`);
    glans.addColorStop(1, 'rgba(160,180,200,0)');
    ctx.fillStyle = glans;
    ctx.beginPath();
    ctx.arc(s.x - R * 0.55, s.y - R * 0.7, R * 0.85, 0, TAU);
    ctx.fill();

    // --- 7 · De kern -------------------------------------------------------
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

    // --- 8 · De rugband ----------------------------------------------------
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

// --- Zeekaart -------------------------------------------------------------

// Waar de kompasrozen op de kaart staan, in wereldeenheden. Uit elk daarvan
// waaieren loxodromen over de hele kaart — het net waarop een zeventiende-eeuwse
// stuurman zijn koers uitzette, en meteen het middel dat een kaart tot kaart
// maakt in plaats van tot een plaatje van land en water.
const ROOS_PLEKKEN = [
  [0.5, 0.56],
  [0.19, 0.28],
  [0.83, 0.68],
];

/** Loodrechte streepjes landinwaarts: de arcering van een gegraveerde kust. */
function tekenArcering(ctx, l, sc, lengte) {
  ctx.beginPath();
  const pts = l.pts;
  // Alleen de échte oever, en niet elk punt: om de zoveel punten een streepje,
  // anders wordt het een dichte band in plaats van arcering.
  const stap = Math.max(1, Math.round(pts.length / 260));
  for (let i = 0; i < pts.length - stap; i += stap) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + stap];
    const dx = x1 - x0,
      dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Normaal naar binnen: de kustlijnen lopen met de klok mee, dus dit is de
    // landzijde. Waar dat toch andersom uitpakt, valt het streepje in zee en
    // dat leest als een zandbank — geen ramp op een oude kaart.
    const nx = dy / len,
      ny = -dx / len;
    const mx = (x0 + x1) * 0.5 * sc,
      my = (y0 + y1) * 0.5 * sc;
    const l2 = lengte * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)));
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + nx * l2, my + ny * l2);
  }
  ctx.stroke();
}

/** Eén kompasroos in kaartstijl: acht stralen, een ring en een noordpijl. */
function tekenKaartRoos(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(106,86,60,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.moveTo(r * 0.62, 0);
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const punt = i % 2 === 0;
    ctx.fillStyle = punt ? 'rgba(70,54,30,0.8)' : 'rgba(120,98,64,0.6)';
    const rr = punt ? r : r * 0.7;
    const br = r * (punt ? 0.13 : 0.09);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.lineTo(Math.cos(a + Math.PI / 2) * br, Math.sin(a + Math.PI / 2) * br);
    ctx.lineTo(Math.cos(a - Math.PI / 2) * br, Math.sin(a - Math.PI / 2) * br);
    ctx.closePath();
    ctx.fill();
  }
  // Noorden krijgt een lelie-achtige punt, zoals het hoort.
  ctx.fillStyle = '#8a2f22';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.16);
  ctx.lineTo(r * 0.12, -r * 0.5);
  ctx.lineTo(-r * 0.12, -r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Greedy plaatsing van plaatsnamen: grootste stad eerst, en elk label krijgt de
 * eerste van vier plekken die nog vrij is.
 *
 * Zonder dit staat de naam altijd rechts van de stip, en dan lopen in de Kleine
 * Antillen vier namen door elkaar heen — precies daar waar de kaart het
 * drukst is. Wie geen plek meer heeft, houdt zijn stip; grote plaatsen gaan
 * voor, want die zoek je op.
 */
function plaatsLabels(ctx, steden, sc, marge) {
  const uit = [];
  const gesorteerd = steden.slice().sort((a, b) => b.grootte - a.grootte);
  // De stippen zelf zijn óók obstakels: een naam die netjes tussen twee andere
  // namen past maar pal over een symbool valt, is even onleesbaar.
  const vakken = gesorteerd.map((stad) => {
    const r = 3 + stad.grootte * 0.6 + 1.5;
    return { x: stad.x * sc - r, y: stad.y * sc - r, w: r * 2, h: r * 2 };
  });
  for (const stad of gesorteerd) {
    const x = stad.x * sc,
      y = stad.y * sc;
    const w = ctx.measureText(stad.naam).width;
    const h = 11;
    const r = 3 + stad.grootte * 0.6;
    const opties = [
      [x + r + 4, y - h / 2, 'left'],
      [x - r - 4 - w, y - h / 2, 'left'],
      [x - w / 2, y - r - 4 - h, 'left'],
      [x - w / 2, y + r + 4, 'left'],
    ];
    let gekozen = null;
    for (const [px, py] of opties) {
      if (px < 2 || py < 2 || px + w > marge.w - 2 || py + h > marge.h - 2) continue;
      const vak = { x: px - 1, y: py - 1, w: w + 2, h: h + 2 };
      const botst = vakken.some(
        (v) => vak.x < v.x + v.w && vak.x + vak.w > v.x && vak.y < v.y + v.h && vak.y + vak.h > v.y
      );
      if (botst) continue;
      vakken.push(vak);
      gekozen = [px, py + h / 2];
      break;
    }
    uit.push({ stad, x, y, r, label: gekozen });
  }
  return uit;
}

/**
 * De zeekaart zoals een stuurman hem zou hebben: perkament, een gegraveerde
 * kust, loxodromen en een cartouche.
 *
 * Dit scherm was een opgeschaalde minikaart — vlak groen op vlak blauw — en dat
 * is zonde, want alle meetkunde ligt er al. `opts`: {datum, speler, merken}.
 */
export function tekenZeekaart(ctx, wereld, W, H, opts = {}) {
  const sc = W / WORLD_W;
  ctx.save();

  // Perkament met korrel en gebrande randen.
  const grond = ctx.createLinearGradient(0, 0, W, H);
  grond.addColorStop(0, '#f2e5c4');
  grond.addColorStop(1, '#e4d2a8');
  ctx.fillStyle = grond;
  ctx.fillRect(0, 0, W, H);
  if (landTegel) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(landTegel, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // De zee is een bleke wassing, geen blauw vlak. Zo blijven de namen leesbaar
  // en leest het geheel als kaart in plaats van als luchtfoto. Wel stevig
  // genoeg dat je in één oogopslag ziet wat water is en wat land.
  ctx.fillStyle = 'rgba(132,164,176,0.34)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.scale(sc, sc);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ondiepte: twee banden om de kust, in de bankbreedte van het eiland zelf.
  // Canvas kan een pad niet verschuiven, dus we tekenen ze als brede lijnen —
  // de binnenste helft valt straks onder het land en de buitenste blijft over
  // als de zoom van ondiep water waar een stuurman voor uitkijkt.
  for (const [breedte, alfa] of [[260, 0.13], [110, 0.16]]) {
    // Blauwgrijs, niet sepia: dit is ondiep wáter. In bruin las het als een
    // veeg vuil op het perkament, vooral rond de Bahamabank.
    ctx.strokeStyle = `rgba(126,158,168,${alfa})`;
    for (const l of wereld.land) {
      ctx.lineWidth = breedte * (l.bank || 1);
      ctx.stroke(l.kust);
    }
  }

  // Land: warm en duidelijk lichter dan de zeewassing, zodat de kustlijn ook
  // zonder de arcering al leest.
  ctx.fillStyle = '#e2d1a4';
  for (const l of wereld.land) ctx.fill(l.path);
  ctx.restore();

  // Arcering landinwaarts (in schermruimte, zodat de streepjes overal even lang
  // zijn — dat is precies hoe een graveur het doet).
  ctx.strokeStyle = 'rgba(106,86,60,0.62)';
  ctx.lineWidth = 0.8;
  for (const l of wereld.land) tekenArcering(ctx, l, sc, 4.2);

  ctx.save();
  ctx.scale(sc, sc);
  ctx.strokeStyle = '#6a563c';
  ctx.lineWidth = 1.6 / sc;
  ctx.lineJoin = 'round';
  for (const l of wereld.land) ctx.stroke(l.kust);
  ctx.restore();

  // Loxodromen uit de kompasrozen.
  ctx.save();
  ctx.strokeStyle = 'rgba(106,86,60,0.14)';
  ctx.lineWidth = 0.6;
  const diag = Math.hypot(W, H);
  for (const [fx, fy] of ROOS_PLEKKEN) {
    const cx = fx * W,
      cy = fy * H;
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * diag, cy + Math.sin(a) * diag);
    }
    ctx.stroke();
  }
  ctx.restore();
  for (const [fx, fy] of ROOS_PLEKKEN) tekenKaartRoos(ctx, fx * W, fy * H, Math.min(W, H) * 0.055);

  // Extra merktekens (schatgebied, doodskoppen) vóór de steden, zodat een naam
  // er nooit onder verdwijnt.
  if (opts.merken) for (const m of opts.merken) m(ctx, sc);

  // Steden met hun natiesymbool en een naam die nergens overheen valt.
  ctx.font = '600 10px Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const p of plaatsLabels(ctx, wereld.steden, sc, { w: W, h: H })) {
    natieStip(ctx, p.x, p.y, p.stad.natie, p.r, 'rgba(58,42,24,0.85)');
    if (!p.label) continue;
    // Een lichte veeg onder de naam: op de arcering zou hij anders wegvallen.
    const tw = ctx.measureText(p.stad.naam).width;
    ctx.fillStyle = 'rgba(242,229,196,0.72)';
    ctx.fillRect(p.label[0] - 2, p.label[1] - 6, tw + 4, 12);
    ctx.fillStyle = '#37281a';
    ctx.fillText(p.stad.naam, p.label[0], p.label[1]);
  }

  // Het eigen schip.
  if (opts.speler) {
    const px = opts.speler.x * sc,
      py = opts.speler.y * sc;
    ctx.fillStyle = '#ffdf8a';
    ctx.strokeStyle = '#2b1d12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Cartouche in de lege hoek rechtsboven: titel, datum en een lijstje.
  if (opts.datum) {
    const cw = Math.min(238, W * 0.3),
      ch = 62;
    const cx = W - cw - 14,
      cy = 14;
    ctx.fillStyle = 'rgba(246,236,210,0.92)';
    ctx.strokeStyle = '#8a7244';
    ctx.lineWidth = 1.4;
    roundRechthoek(ctx, cx, cy, cw, ch, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(138,114,68,0.5)';
    ctx.lineWidth = 0.7;
    roundRechthoek(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a3418';
    ctx.font = 'italic 600 15px Georgia, serif';
    ctx.fillText('Mar del Norte', cx + cw / 2, cy + 20);
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillStyle = '#6a563c';
    ctx.fillText('naar de beste kennis van heden', cx + cw / 2, cy + 37);
    ctx.fillText(opts.datum, cx + cw / 2, cy + 51);
  }

  // Gebrande, donkere randen: het perkament ligt niet in een lijstje maar op tafel.
  const rand = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
  rand.addColorStop(0, 'rgba(120,90,45,0)');
  rand.addColorStop(1, 'rgba(96,68,32,0.42)');
  ctx.fillStyle = rand;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

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

/** Kleur van een balk die van goed naar slecht loopt (romp, moraal, volk). */
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

// --- Schatjacht -----------------------------------------------------------

/**
 * Herkenningspunt aan land, in inkt. Dezelfde tekening wordt klein op het
 * perkament gezet en groot in het paneel waar je ernaast staat, zodat wat je
 * op de kaart ziet ook is wat je aan land herkent.
 */
export function tekenHerkenningspunt(ctx, id, x, y, s = 1, kleur = '#3a2a18') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = kleur;
  ctx.fillStyle = kleur;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (id) {
    case 'rots':
      // Twee brokken met een spleet ertussen.
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-1.5, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.5, 8);
      ctx.lineTo(6, -5);
      ctx.lineTo(9, 8);
      ctx.closePath();
      ctx.stroke();
      break;

    case 'palmen':
      for (const [dx, h] of [[-6, 7], [0, 10], [6, 6]]) {
        ctx.beginPath();
        ctx.moveTo(dx, 8);
        ctx.quadraticCurveTo(dx + 1.2, 8 - h * 0.6, dx + 0.4, 8 - h);
        ctx.stroke();
        for (const zij of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(dx + 0.4, 8 - h);
          ctx.quadraticCurveTo(dx + zij * 3.4, 8 - h - 2.4, dx + zij * 5.4, 8 - h + 0.6);
          ctx.stroke();
        }
      }
      break;

    case 'wrak':
      // Half in het zand gezakte romp met een gebroken mast.
      ctx.beginPath();
      ctx.moveTo(-10, 6);
      ctx.quadraticCurveTo(-7, 10.5, 6, 8.5);
      ctx.lineTo(9, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, 7.5);
      ctx.lineTo(-4, -6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(1.5, -2.5);
      ctx.stroke();
      break;

    case 'kreek':
      ctx.beginPath();
      ctx.moveTo(-10, 9);
      ctx.bezierCurveTo(-4, 4, -6, -2, 0, -7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 9.5);
      ctx.bezierCurveTo(-1, 4.5, -2.5, -1.5, 3.5, -6.5);
      ctx.stroke();
      break;

    case 'grafheuvel':
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.quadraticCurveTo(0, -6, 10, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.lineTo(0, -9);
      ctx.moveTo(-3.4, -6);
      ctx.lineTo(3.4, -6);
      ctx.stroke();
      break;

    case 'bron':
      ctx.beginPath();
      ctx.ellipse(0, 6, 8, 3.2, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 4.5);
      ctx.lineTo(-5, -3);
      ctx.moveTo(5, 4.5);
      ctx.lineTo(5, -3);
      ctx.moveTo(-6.5, -3);
      ctx.lineTo(6.5, -3);
      ctx.stroke();
      break;

    default:
      ctx.beginPath();
      ctx.arc(0, 2, 5, 0, TAU);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * Het perkament: een uitsnede van de échte kustlijn rond de schat, met de
 * herkenningspunten en het kruis erop. `kwadranten` bepaalt welke kwarten al
 * ingevuld zijn; de rest blijft leeg papier met een gescheurde rand.
 *
 * `venster` is de breedte van de uitsnede in wereldeenheden.
 */
export function tekenSchatkaart(ctx, wereld, schat, w, h, kwadranten, venster = 620) {
  const sc = w / venster;
  const x0 = schat.x - venster / 2;
  const y0 = schat.y - (venster * (h / w)) / 2;

  // Perkament.
  ctx.save();
  ctx.fillStyle = '#e5d6ac';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(150,116,62,0.14)';
  for (let i = 0; i < 90; i++) {
    const vx = ((i * 97) % 313) / 313;
    const vy = ((i * 151) % 271) / 271;
    ctx.fillRect(vx * w, vy * h, 1 + (i % 3), 1 + (i % 2));
  }

  // Kustlijn in inkt. De zee krijgt een koele wassing en het land blijft kaal
  // perkament — anders zijn water en wal op dit formaat niet uit elkaar te
  // houden, en weet je dus niet aan welke kant van de lijn het kruis ligt.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = '#b9c3ad';
  ctx.fillRect(0, 0, w, h);
  // Golfstreepjes, zoals op een oude kaart.
  ctx.strokeStyle = 'rgba(90,110,95,0.35)';
  ctx.lineWidth = 1;
  for (let y = 8; y < h; y += 14) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin((x + y) * 0.11) * 1.6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.translate(-x0 * sc, -y0 * sc);
  ctx.scale(sc, sc);
  ctx.fillStyle = '#e9dcb4';
  for (const l of wereld.land) ctx.fill(l.path);
  ctx.strokeStyle = '#5a3f1e';
  ctx.lineWidth = 3 / sc;
  for (const l of wereld.land) ctx.stroke(l.kust);
  ctx.restore();

  // Herkenningspunten en het kruis.
  for (const p of schat.punten) {
    tekenHerkenningspunt(ctx, p.id, (p.x - x0) * sc, (p.y - y0) * sc, 1.15);
  }
  const kx = (schat.x - x0) * sc;
  const ky = (schat.y - y0) * sc;
  ctx.strokeStyle = '#8c2f22';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(kx - 8, ky - 8);
  ctx.lineTo(kx + 8, ky + 8);
  ctx.moveTo(kx + 8, ky - 8);
  ctx.lineTo(kx - 8, ky + 8);
  ctx.stroke();

  // Ontbrekende kwadranten afdekken met leeg papier en een gescheurde rand.
  for (let i = 0; i < 4; i++) {
    if (kwadranten[i]) continue;
    const qx = (i % 2) * (w / 2);
    const qy = Math.floor(i / 2) * (h / 2);
    ctx.fillStyle = '#efe3c2';
    ctx.fillRect(qx, qy, w / 2, h / 2);
    ctx.strokeStyle = 'rgba(120,92,50,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(qx + 1, qy + 1, w / 2 - 2, h / 2 - 2);
    ctx.setLineDash([]);
  }
  ctx.restore();
}
