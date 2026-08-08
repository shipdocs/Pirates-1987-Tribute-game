// Alles wat op het canvas getekend wordt: zee, land, steden en schepen.
import { TAU, clamp, lerp, normAngle, sierTijd } from './util.js';
import { NATIES, SCHIP_INDEX, SCHEEP_MAAT } from './data.js';
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
let wolkTegel = null;
/** @type {{patroon:CanvasPattern, maat:number}[]} */
let sprankelLagen = [];

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
// Ruim bemeten in de hogere veelvouden en in drie richtingen tegelijk: zee is
// korte golf op lange golf, en de kruinlijnen worden pas gebroken door reeksen
// die schuin binnenlopen.
const GOLF_REEKSEN = [
  [0, 1, 0.8, 0.0],
  [0, 2, 0.6, 1.7],
  [0, 3, 0.48, 3.9],
  [0, 5, 0.32, 2.4],
  [0, 8, 0.18, 5.5],
  [0.62, 1, 0.75, 0.9],
  [0.62, 3, 0.34, 4.6],
  [0.62, 6, 0.16, 2.1],
  [-0.75, 1, 0.7, 5.9],
  [-0.75, 2, 0.5, 2.8],
  [-0.75, 4, 0.28, 1.2],
  [-0.75, 7, 0.12, 5.0],
  [1.25, 2, 0.4, 0.3],
  [1.25, 5, 0.16, 3.3],
  [-1.5, 3, 0.3, 4.4],
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

  const AMPL = 28; // hoe ver we het veld op zichzelf verschuiven, in tegelpixels
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
  // Ook over de rand heen tekenen, anders zijn de naden zichtbaar.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S,
      y = Math.random() * S;
    const r = 66 + Math.random() * 162;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(2,18,34,0.5)');
      grad.addColorStop(0.6, 'rgba(2,18,34,0.24)');
      grad.addColorStop(1, 'rgba(2,18,34,0)');
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
  wolkTegel = maakWolkTegel();
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
const GOLF_LAGEN = [
  [768, 6, 0.42, true],
  [320, 17, 0.72, false],
  [141, 30, 0.28, false],
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
  const dx = Math.cos(wr),
    dy = Math.sin(wr);

  // Deining (met de wolkenschaduw erin), golfslag, en — alleen als je er dicht
  // genoeg op zit — rimpeling. Alle drie dezelfde tegel op een andere maat en
  // snelheid: het oog ziet er drie afzonderlijke zeegangen in, en het scheelt
  // twee tegelbouwen. De deining blijft bewust flauw: op die maat is één tegel
  // bijna een halve schermbreedte, en een sterke laag zou zijn eigen herhaling
  // verraden.
  const golfLagen = zorgVoorGolven(ctx, wr);
  for (let i = 0; i < golfLagen.length; i++) {
    if (i === 2 && zoom <= 0.55) break; // uitgezoomd is rimpeling toch alleen ruis
    const { patroon, maat, snel, alfa } = golfLagen[i];
    const drift = st * snel * wk;
    vulPatroon(ctx, patroon, vw, vh, maat, -camX + dx * drift, -camY + dy * drift, alfa);
  }

  // Zonnevonken op de kruinen, ademend zodat het twinkelt in plaats van staat.
  // Bij schemering doven ze uit: dan is er geen zon om in te vonken.
  const helder = clamp(1 - schemer * 1.4, 0.15, 1);
  for (let i = 0; i < sprankelLagen.length; i++) {
    const { patroon, maat } = sprankelLagen[i];
    const drift = st * 21 * wk;
    const alfa = 0.24 * helder * (0.55 + 0.45 * Math.sin(st * 1.7));
    vulPatroon(ctx, patroon, vw, vh, maat, -camX + dx * drift, -camY + dy * drift, alfa, 'lighter');
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

  const zichtbaar = [];
  for (const l of wereld.land) {
    const b = bbox(l);
    if (b.x1 < zx0 || b.x0 > zx1 || b.y1 < zy0 || b.y0 > zy1) continue;
    zichtbaar.push(l);
  }
  if (!zichtbaar.length) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Rif vlak voor de kust. De brede banken zitten in de dieptekaart; hier gaat
  // het om de scherpe rand waar het koraal in het zand overgaat. De bankfactor
  // van het eiland bepaalt hoe ver die rand uitloopt.
  for (const [w, kleur] of [
    [40, 'rgba(50,150,170,0.4)'],
    [22, 'rgba(96,196,196,0.4)'],
    [10, 'rgba(162,234,216,0.5)'],
  ]) {
    ctx.strokeStyle = kleur;
    for (const l of zichtbaar) {
      ctx.lineWidth = w * (l.bank || 1);
      ctx.stroke(l.kust);
    }
  }

  // Slagschaduw voor diepte. De offset is in schermpixels, zodat de eilanden
  // bij elke zoomstand even hoog lijken.
  ctx.save();
  ctx.translate(5 / zoom, 7 / zoom);
  ctx.fillStyle = 'rgba(3,20,34,0.45)';
  for (const l of zichtbaar) ctx.fill(l.path);
  ctx.restore();

  // Hoogtetinten: donker, vochtig binnenland dat naar de kust toe opklaart.
  // De banden lopen vanaf de échte kust naar binnen — langs een kaartrand komt
  // dus vanzelf geen kustgroen te staan.
  const korrel = landTegel ? ctx.createPattern(landTegel, 'repeat') : null;
  for (const l of zichtbaar) {
    ctx.fillStyle = '#3a5c37';
    ctx.fill(l.path);
  }
  for (const l of zichtbaar) {
    ctx.save();
    ctx.clip(l.path);
    const b = bbox(l);
    const k = l.groot ? 1.7 : 1;
    for (const [w, kleur] of [
      [380, '#41653a'],
      [220, '#4b7340'],
      [120, '#5a8548'],
      [62, '#6d9a52'],
      [26, '#84b062'],
    ]) {
      ctx.lineWidth = w * k;
      ctx.strokeStyle = kleur;
      ctx.stroke(l.kust);
    }

    // Bergruggen, geknipt op deze landmassa.
    if (wereld.ruggen) {
      for (const rug of wereld.ruggen) {
        const r = rugVak(rug);
        if (r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1) continue;
        if (r.x1 < zx0 || r.x0 > zx1 || r.y1 < zy0 || r.y0 > zy1) continue;
        tekenRug(ctx, rug);
      }
    }

    if (korrel) {
      // De korrel blijft aan de wereld verankerd — anders verspringt hij zodra
      // de buffer opnieuw wordt opgebouwd — maar hij groeit mee bij uitzoomen,
      // zodat hij nooit subpixelklein wordt en gaat ruisen.
      const kk = Math.max(1, 1 / zoom);
      ctx.save();
      ctx.scale(kk, kk);
      ctx.fillStyle = korrel;
      ctx.fillRect(b.x0 / kk, b.y0 / kk, (b.x1 - b.x0) / kk, (b.y1 - b.y0) / kk);
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
  for (const l of zichtbaar) ctx.stroke(l.kust);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(247,236,205,0.85)';
  for (const l of zichtbaar) ctx.stroke(l.kust);
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

  // Bewegende branding: drie lagen schuim die als golven tegen de kust lopen.
  for (const [w, alfa, snel, fase] of [
    [16, 0.22 + 0.1 * pulseren, 1.9, 0],
    [9, 0.5 + 0.18 * pulseren, 1.35, 2.2],
    [4, 0.72, 0.95, 4.1],
  ]) {
    ctx.save();
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(238,250,253,${alfa})`;
    ctx.setLineDash([16, 13 + 7 * Math.sin(st * snel + fase)]);
    ctx.lineDashOffset = st * 11 * snel + fase * 28;
    for (const l of zichtbaar) ctx.stroke(l.kust);
    ctx.restore();
  }

  // Zachte 'no-go'-gloed: de diepte-omtrek waar ook het grootste schip nog
  // met de hele romp kan varen, zodat bevaarbaar en ondiep elkaar kleuren.
  ctx.save();
  ctx.lineWidth = GROOTSTE_ROMPSSTRAAL * 2;
  ctx.strokeStyle = `rgba(70,196,212,${0.09 + 0.05 * pulseren})`;
  for (const l of zichtbaar) ctx.stroke(l.kust);
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
    // breder uit en deint hij sterker.
    const spat = 0.3 * w + 0.25 * w * landFactor;
    ctx.globalAlpha = spat;
    ctx.strokeStyle = '#eafbff';
    ctx.lineWidth = 1.6 + 1.4 * landFactor;
    ctx.beginPath();
    ctx.moveTo(L * 0.42, -B * (0.34 + 0.5 * landFactor * Math.sin(st * 9)));
    ctx.quadraticCurveTo(L * (0.62 + 0.1 * landFactor), -B * 0.04 * landFactor, L * 0.42, B * (0.34 + 0.5 * landFactor * Math.sin(st * 9 + 1.4)));
    ctx.stroke();
    ctx.restore();
  }

  // Schaduw op het water. De verschuiving staat in wereldruimte, zodat de zon
  // voor de hele vloot uit dezelfde hoek schijnt. Op de branding vervaagt de
  // schaduw mee, anders lijkt het schip boven het strand te zweven.
  const schaduwAlfa = 0.4 * (1 - 0.45 * landFactor);
  ctx.save();
  ctx.translate(x + ZON_X * s, y + ZON_Y * s);
  ctx.rotate(koers);
  ctx.scale(s, s);
  ctx.fillStyle = `rgba(4,22,36,${schaduwAlfa})`;
  romPad(ctx, L, B);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(koers);
  ctx.scale(s, s);

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

export function tekenStad(ctx, stad, cam, tijd, gemarkeerd) {
  const natie = NATIES[stad.natie];
  const s = clamp(1 / cam.zoom, 0.7, 2.6);
  const st = sierTijd(tijd);
  ctx.save();
  ctx.translate(stad.x, stad.y);
  ctx.scale(s, s);

  const r = 7 + stad.grootte * 2.4;
  // Alleen wat groter of van huis uit versterkt is, krijgt een bastion.
  const heeftFort = stad.soort === 'fort' || stad.soort === 'schatkamer' || stad.grootte >= 3;
  const heeftKerk = stad.grootte >= 4;

  // Grondvlak van de stad.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c9ab72';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  ctx.fill();

  // Huisjes in een ring.
  const n = 3 + stad.grootte;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + stad.id;
    const px = Math.cos(a) * r * 0.5;
    const py = Math.sin(a) * r * 0.42;
    const breed = 4 + ((stad.id * 37 + i * 13) % 3);
    const hoog = 4 + ((stad.id * 19 + i * 7) % 3);
    ctx.fillStyle = '#f0e3c4';
    ctx.fillRect(px - breed / 2, py - hoog / 2, breed, hoog);
    // Dakje.
    ctx.fillStyle = '#b3502f';
    ctx.beginPath();
    ctx.moveTo(px - breed / 2 - 0.6, py - hoog / 2);
    ctx.lineTo(px, py - hoog / 2 - 1.8);
    ctx.lineTo(px + breed / 2 + 0.6, py - hoog / 2);
    ctx.closePath();
    ctx.fill();
    // Deurtje of raampje.
    ctx.fillStyle = '#241a10';
    ctx.fillRect(px - 0.6, py, 1.2, hoog / 2);
  }

  // Grotere steden krijgen een kerktoren, naast het fort in plaats van erbovenop.
  if (heeftKerk) {
    const kx = -r * 0.66;
    ctx.fillStyle = '#9a9184';
    ctx.fillRect(kx - r * 0.16, -r * 1.2, r * 0.32, r * 0.8);
    ctx.fillStyle = '#6e6558';
    ctx.beginPath();
    ctx.moveTo(kx - r * 0.2, -r * 1.2);
    ctx.lineTo(kx, -r * 1.52);
    ctx.lineTo(kx + r * 0.2, -r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.fillRect(kx - r * 0.05, -r * 1.0, r * 0.1, r * 0.16);
    // Kruisje op de spits.
    ctx.strokeStyle = '#6e6558';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(kx, -r * 1.52);
    ctx.lineTo(kx, -r * 1.68);
    ctx.moveTo(kx - r * 0.06, -r * 1.62);
    ctx.lineTo(kx + r * 0.06, -r * 1.62);
    ctx.stroke();
  }

  // Fort met vlaggenmast — of, bij een gehucht, alleen een sobere vlaggenstok.
  let mastTop = -r * 1.6;
  if (heeftFort) {
    ctx.fillStyle = '#8d8375';
    ctx.fillRect(-r * 0.22, -r * 0.95, r * 0.44, r * 0.55);
    ctx.fillStyle = '#6e6558';
    ctx.fillRect(-r * 0.26, -r * 0.98, r * 0.52, r * 0.1);
    // Kantelen.
    ctx.fillStyle = '#8d8375';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-r * 0.26 + i * r * 0.19, -r * 1.06, r * 0.11, r * 0.09);
    }
    mastTop = -r * 2.2;
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.95);
    ctx.lineTo(0, mastTop);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(0, mastTop);
    ctx.stroke();
  }

  // Vlag.
  const wapper = Math.sin(st * 4 + stad.id) * 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = natie.vlag[i];
    ctx.beginPath();
    if (natie.vlagStaand) {
      // Verticale banen (Franse driekleur).
      const x0 = (i * 10) / 3;
      const x1 = ((i + 1) * 10) / 3;
      ctx.moveTo(x0, mastTop);
      ctx.lineTo(x1, mastTop + (wapper * (i + 1)) / 6);
      ctx.lineTo(x1, mastTop + 7.2 + (wapper * (i + 1)) / 6);
      ctx.lineTo(x0, mastTop + 7.2);
    } else {
      // Horizontale banen: rood boven, wit midden, blauw onder.
      ctx.moveTo(0, mastTop + i * 2.4);
      ctx.lineTo(10, mastTop + i * 2.4 + (wapper * (i + 1)) / 3);
      ctx.lineTo(10, mastTop + (i + 1) * 2.4 + (wapper * (i + 1)) / 3);
      ctx.lineTo(0, mastTop + (i + 1) * 2.4);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Palissade/muur rond sommige steden.
  if (stad.soort === 'fort' || stad.soort === 'schatkamer') {
    ctx.strokeStyle = '#6e6558';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.88, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
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

  // Naam.
  if (cam.zoom > 0.42) {
    ctx.font = '600 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6,24,38,0.85)';
    ctx.strokeText(stad.naam, 0, r + 15);
    ctx.fillStyle = natie.kleur;
    ctx.fillText(stad.naam, 0, r + 15);
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
  ctx.fillStyle = 'rgba(12,32,48,0.72)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,164,65,0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.font = '600 10px Georgia, serif';
  ctx.fillStyle = 'rgba(240,227,196,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [lbl, a] of [['N', -Math.PI / 2], ['O', 0], ['Z', Math.PI / 2], ['W', Math.PI]]) {
    ctx.fillText(lbl, Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
  }

  // Pijl wijst waarheen de wind waait.
  ctx.rotate(windRichting);
  const len = r * 0.62 * clamp(kracht, 0.5, 1.4);
  ctx.fillStyle = '#f0e3c4';
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(len - 8, -5);
  ctx.lineTo(-len * 0.7, -2);
  ctx.lineTo(-len * 0.7, 2);
  ctx.lineTo(len - 8, 5);
  ctx.closePath();
  ctx.fill();
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
