// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Afgesplitst van render.js: zee-oppervlak, golfsprankel en dieptekleuring.
import { TAU, clamp, lerp, sierTijd, sierRustig } from '../util.js';
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

function huidigeDag() {
  try {
    return (globalThis.__G && __G.speler && __G.speler.dag) || 0;
  } catch (e) {
    return null;
  }
}

/**
 * Duisternis van het etmaal (0..1): 0 = klaarlichte middag, 1 = het holst van
 * de nacht. Volgt dezelfde dagfractie (`dag % 1`) als de wijzer van de
 * ankerklok, met een lichte jaargetijde-wissel erdoorheen die de nachten in
 * het ene seizoen een tikkeltje dieper maakt dan in het andere.
 */
export function schemerFactor() {
  const dag = huidigeDag();
  if (dag == null) return 0.12;
  const fractie = ((dag % 1) + 1) % 1;
  const etmaal = 0.5 - 0.5 * Math.cos((fractie - 0.5) * TAU); // 0 op de middag, 1 om middernacht
  const seizoen = Math.sin((dag / 365) * TAU + 0.6) * 0.08;
  return clamp(etmaal * 0.92 + seizoen, 0, 1);
}

/**
 * Gouden uur (0..1): piekt kort rond zonsopgang en zonsondergang en ligt
 * zowel op klaarlichte dag als diep in de nacht nagenoeg stil. Losstaand van
 * `schemerFactor`, die juist doorloopt tot volle nachtduisternis — anders
 * bleef middernacht hangen in een permanente oranje gloed.
 */
function goudenUurFactor() {
  const dag = huidigeDag();
  if (dag == null) return 0.12;
  const fractie = ((dag % 1) + 1) % 1;
  const afstandTot = (doel) => Math.min(Math.abs(fractie - doel), 1 - Math.abs(fractie - doel));
  const dichtstbij = Math.min(afstandTot(0.25), afstandTot(0.75));
  return clamp(1 - dichtstbij / 0.1, 0, 1);
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

/**
 * Tekent de open zee. `cam` = {x, y, zoom}, `vw/vh` = grootte van het beeld,
 * `wind` = {richting, kracht} zodat de deining met de wind meeloopt.
 */
export function tekenZee(ctx, cam, vw, vh, t, wind, opts = {}) {
  const schemer = schemerFactor();
  // Middernacht mag donker aanvoelen, maar niet zo zwart dat je geen water
  // meer van land kunt onderscheiden — vandaar de kap op de menging. Wie
  // daarna `tekenNachtSluier` over de hele wereld legt (`nachtApart`), laat de
  // zee hier op daglicht: anders werd alleen het diepe water donker en lagen
  // banken, land en steden er om middernacht bij als op klaarlichte dag.
  const nachtDonker = opts.nachtApart ? 0 : Math.min(schemer, 0.78);
  // Iets rijker en zachter dan een vlak marineblauw: de middentint trekt naar
  // een dromerig turkoois, zodat het licht ook op klaarlichte dag lijkt te
  // dragen in plaats van plat te staan.
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, mengKleur('#0d3f68', nachtDonker));
  g.addColorStop(0.42, mengKleur('#1a6f94', nachtDonker * 0.8));
  g.addColorStop(0.72, mengKleur('#155b84', nachtDonker * 0.72));
  g.addColorStop(1, mengKleur('#0b3452', nachtDonker * 0.65));
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

  // Blauwige nevel: dooft nooit helemaal uit zolang het niet klaarlichte dag
  // is, en wint gestaag aan kracht tot diep in de nacht. Gaat óver het water
  // heen, anders kleurt hij alleen de lege ondergrond.
  if (schemer > 0.05 && !opts.nachtApart) {
    const nevel = ctx.createLinearGradient(0, 0, 0, vh);
    nevel.addColorStop(0, `rgba(36,34,68,${0.4 * schemer})`);
    nevel.addColorStop(1, 'rgba(10,30,52,0)');
    ctx.fillStyle = nevel;
    ctx.fillRect(0, 0, vw, vh);
  }

  // Zonsopgang/zonsondergang: een goudoranje gloed op de kim met een zachte
  // roze zoom eromheen — zoals de lucht bij zonsondergang zelf ook twee
  // kleuren tegelijk draagt. Piekt kort en is 's nachts alweer gedoofd, zodat
  // middernacht niet in een permanente oranje gloed blijft hangen.
  const goudenUur = goudenUurFactor();
  if (goudenUur > 0.05) {
    const s = goudenUur;
    const gloed = ctx.createRadialGradient(vw * 0.5, vh * 0.35, 0, vw * 0.5, vh * 0.35, vh * 0.72);
    gloed.addColorStop(0, `rgba(255,196,120,${0.22 * s})`);
    gloed.addColorStop(0.5, `rgba(255,150,148,${0.11 * s})`);
    gloed.addColorStop(1, 'rgba(255,150,148,0)');
    ctx.fillStyle = gloed;
    ctx.fillRect(0, 0, vw, vh);
  }
}

/**
 * Gouden-uurwas over de hele opgebouwde scène: bij zonsopgang/-ondergang
 * kreeg alleen het water in `tekenZee` een warme ondertoon, terwijl land,
 * wolken en schepen daar bovenop getekend worden en dus fletsig blauw bleven
 * staan. Zachte `soft-light`-menging houdt het een sfeerwas in plaats van een
 * platte kleurvlek: donkere partijen (rompen, bos) trekken iets warmer, felle
 * lichtpartijen (zeildoek, schuim) blijven bijna ongemoeid. Volgt hetzelfde
 * korte piekje als de gloed in `tekenZee`, niet de volle nachtduisternis.
 */
// --- Nacht ----------------------------------------------------------------

/** Hoe zwaar de nacht op de wereld drukt (0..1); nul tot ver in de schemer. */
export function nachtSterkte() {
  return clamp((schemerFactor() - 0.28) / 0.62, 0, 1);
}

/**
 * Maanlicht over de hele wereld in één keer: vermenigvuldigen met een koel
 * blauw dooft zee, banken, land, steden en schepen gelijk, zodat hun
 * onderlinge verhouding blijft staan. Tekent in schermruimte, ook als de
 * aanroeper midden in een wereldtransform zit. Alles wat zelf licht geeft
 * (ramen, lantaarns, vuur) hoort erna te komen.
 */
export function tekenNachtSluier(ctx, vw, vh, dpr = 1) {
  const n = nachtSterkte();
  if (n <= 0.01) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  const r = Math.round(lerp(255, 60, n)),
    g = Math.round(lerp(255, 82, n)),
    b = Math.round(lerp(255, 132, n));
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = 'source-over';
  const nevel = ctx.createLinearGradient(0, 0, 0, vh);
  nevel.addColorStop(0, `rgba(30,34,72,${0.22 * n})`);
  nevel.addColorStop(1, 'rgba(10,24,48,0)');
  ctx.fillStyle = nevel;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

const gloedCache = new Map();

/** Een zachte, additieve lichtvlek: straatlicht, lantaarn of vuur in het donker. */
export function tekenLichtGloed(ctx, x, y, r, kleur, sterkte = 1) {
  if (sterkte <= 0.01 || r <= 0) return;
  let spr = gloedCache.get(kleur);
  if (!spr) {
    const S = 64;
    spr = offscreen(S, S);
    const g = spr.getContext('2d');
    const h = kleur.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, `rgba(${rgb},0.9)`);
    grad.addColorStop(0.3, `rgba(${rgb},0.42)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    gloedCache.set(kleur, spr);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(sterkte, 0, 1);
  ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export function tekenGoudenUur(ctx, vw, vh) {
  const goudenUur = goudenUurFactor();
  if (goudenUur <= 0.05) return;
  const s = goudenUur;
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, `rgba(255,196,132,${0.5 * s})`);
  g.addColorStop(0.55, `rgba(255,160,150,${0.28 * s})`);
  g.addColorStop(1, `rgba(60,56,110,${0.34 * s})`);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

/**
 * Zachte vignet over het hele beeld: een lichte, altijd aanwezige donkerrand
 * die het tafereel omlijst als een schilderij in plaats van een uitsnede.
 * Wordt als laatste, in schermruimte, over de volledig opgebouwde scène gelegd
 * — vóór de HUD, die zelf scherp en ongedimd moet blijven.
 */
export function tekenVignet(ctx, vw, vh) {
  const schemer = schemerFactor();
  const kort = Math.min(vw, vh);
  const v = ctx.createRadialGradient(
    vw * 0.5, vh * 0.47, kort * 0.38,
    vw * 0.5, vh * 0.47, Math.max(vw, vh) * 0.75
  );
  v.addColorStop(0, 'rgba(3,10,20,0)');
  v.addColorStop(1, `rgba(2,8,18,${0.15 + schemer * 0.1})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, vw, vh);
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

