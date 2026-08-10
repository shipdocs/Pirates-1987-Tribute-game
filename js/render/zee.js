// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: zee-oppervlak, golfsprankel en dieptekleuring.
import { TAU, clamp, sierTijd, sierRustig } from '../util.js';
import { WORLD_W, WORLD_H } from '../world.js';
import { offscreen, plaats } from '../sprite.js';
import { sprankelLagen, zorgVoorGolven, vulPatroon } from './patronen.js';

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
// bewerking die elk beeld terugkomt. De schaal loopt mee met de grotere
// kaart, zodat de cache niet drie keer zoveel pixels krijgt.
const DIEPTE_SCHAAL = 7;

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

