// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Het rekenhart van de bunkeroperatie: debiet, druk, tankvulling, temperatuur,
// volumecorrectie en — het belangrijkste — hoeveel speelruimte er zit tussen wat
// jij opgeeft en wat de chief meet.
//
// Dit bestand is met opzet **headless**: geen canvas, geen DOM, geen audio, geen
// `Math.random`. Alles wat toeval nodig heeft, krijgt een rng meegegeven. Zo is
// de balans buiten de browser na te rekenen, en zo kun je de sommen tegen echte
// tabelwaarden aanhouden — precies zoals `gevechtsmodel.js` dat in Zeeroverij
// doet.

import { clamp, lerp } from './util.js';
import { vcf, massaInLucht, productVan, BOOT_INDEX, verbeterBonus } from './data.js';

// --- Grenzen ---------------------------------------------------------------

/** Boven dit deel van de tankinhoud moet het debiet terug: aftoppen. */
export const AFTOPGRENS = 0.92;
/** Hoeveel het debiet bij het aftoppen nog mag zijn, als deel van het maximum. */
export const AFTOPDEBIET = 0.28;
/** De eerste minuten mag het debiet niet hoog: langzaam beginnen. */
export const AANLOOPMINUTEN = 12;
export const AANLOOPDEBIET = 0.35;
/** Maximale retentie die het spel toelaat, als deel van de partij. */
export const MAX_RETENTIE = 0.025;

/**
 * Harde bovengrens aan wat een chief ooit laat passeren, hoe ruw zijn meting
 * ook is. Zonder deze grens loopt de tolerantie op een kleine partij in deining
 * op tot boven `MAX_RETENTIE`, en dan is de maximale marge ineens gratis — de
 * hele afweging valt dan weg. In het echt gaat dit ook zo: bij een gat van twee
 * procent gaat niemand meer over zijn peilnauwkeurigheid praten, dan is de
 * partij gewoon kort.
 */
export const TOLERANTIE_PLAFOND = 0.020;

// --- Producteigenschappen --------------------------------------------------

/**
 * Hoe zwaar een product te pompen is, ten opzichte van dun gasolie. Zware
 * stookolie is bij 40 °C nog stroperig en kost drukverlies; verwarmen helpt.
 * Dit is geen tabelwaarde uit een norm maar een speelbare benadering.
 */
export function stroperigheid(productId, temperatuur) {
  const p = productVan(productId);
  if (p.groep === 'gasolie') return 1;
  // Stookolie wordt snel dunner met de temperatuur; onder de 35 °C loopt het vast.
  const t = clamp(temperatuur, 20, 70);
  return clamp(3.4 - (t - 20) * 0.045, 1.15, 3.4);
}

/**
 * Maximaal debiet in m³/uur, gegeven boot, verbeteringen en product. Een dikke
 * olie haalt de nominale pompcapaciteit niet.
 */
export function maxDebiet(boot, productId, temperatuur) {
  const t = BOOT_INDEX[boot.type];
  const bonus = 1 + verbeterBonus(boot, 'pomp');
  const dik = stroperigheid(productId, temperatuur);
  return (t.pomp * bonus) / (0.55 + 0.45 * dik);
}

/**
 * Werkdruk aan het manifold in bar. Loopt op met het kwadraat van het debiet en
 * met de stroperigheid — daarom is warme olie snel pompen en koude olie niet.
 */
export function manifolddruk(debiet, maxD, productId, temperatuur) {
  const f = maxD > 0 ? debiet / maxD : 0;
  const dik = stroperigheid(productId, temperatuur);
  return 1.1 + 6.2 * f * f * (0.55 + 0.35 * dik);
}

// --- Meetonzekerheid -------------------------------------------------------

/**
 * De standaardafwijking waarmee de chief jouw geleverde hoeveelheid vaststelt,
 * als deel van de partij. Dit getal is de kern van het spel: hij is de ruimte
 * waarin je kunt bewegen, en hij volgt volledig uit omstandigheden die je vóór
 * de operatie kunt zien.
 *
 * De vier posten zijn de vier plekken waar in dit vak werkelijk discussie over
 * ontstaat: de meetmethode, de rust van het schip, het temperatuurverschil en
 * de grootte van de partij.
 */
export function meetruis(omst) {
  // Een massaflowmeter meet strak; peilen met de stok veel minder.
  let s = omst.mfm ? 0.0016 : 0.0052;
  // Een schip dat beweegt, peilt slecht. Op de rede in deining is dat het
  // verschil tussen een halve en anderhalve centimeter op de peilstok.
  s += (omst.deining || 0) * 0.0060;
  // Groot temperatuurverschil tussen tank en buiten laat de omrekening zweven.
  s += clamp(Math.abs(omst.temperatuurVerschil || 0) / 40, 0, 1) * 0.0032;
  // Op een grote partij middelt de onzekerheid uit; op een kleine niet. Het
  // bereik is bewust smal: een kleine partij is lastiger te meten, maar niet
  // drie keer zo lastig, en een te brede schaal maakt kleine stems gratis geld.
  s *= clamp(Math.sqrt(420 / Math.max(60, omst.partijTon || 420)), 0.75, 1.35);
  // Een goede eigen meetopstelling maakt jouw cijfer beter onderbouwd, en
  // daarmee de marge waarbinnen hij je op je woord gelooft iets ruimer.
  s *= 1 + (omst.meetbonus || 0) * 0.55;
  return s;
}

/**
 * Het verschil dat de chief nog laat passeren, als deel van de partij. Onder
 * deze grens tekent hij zonder morren; daarboven begint hij te rekenen.
 *
 * Hij is opgebouwd uit de meetruis (want daar kán hij niets tegen inbrengen) en
 * een persoonlijke marge die kleiner wordt naarmate hij nauwkeuriger en minder
 * gehaast is. Argwaan in de markt drukt hem verder omlaag.
 */
export function tolerantie(chief, omst) {
  const ruis = meetruis(omst);
  // Anderhalve sigma van wat hij zelf niet kan uitsluiten.
  const meetbaar = ruis * 1.6;
  // Zijn eigen soepelheid: van 0,8 % bij een groentje tot 0,15 % bij een
  // wantrouwende chief die zijn eigen tabellen meeneemt.
  const persoonlijk = lerp(0.008, 0.0015, chief.nauwkeurig);
  // Haast maakt hem soepel; een surveyor aan boord maakt hem dat niet.
  const haast = 1 + chief.haast * 0.45;
  const surveyor = omst.surveyor ? 0.45 : 1;
  const argwaan = 1 - clamp(omst.argwaan || 0, 0, 1) * 0.5;
  const ruw = (meetbaar + persoonlijk) * haast * surveyor * argwaan;
  // Het plafond knijpt de bovenkant af zonder de onderkant te raken: een
  // scherpe chief blijft scherp, een soepele wordt nooit gratis. Het plafond
  // hangt zélf ook van de chief af, anders vallen alle karakters samen zodra de
  // omstandigheden ruim genoeg zijn — en juist op de rede wil je nog voelen wie
  // er tegenover je staat.
  const plafond = TOLERANTIE_PLAFOND * lerp(1, 0.72, chief.nauwkeurig) * surveyor * argwaan;
  return Math.min(ruw, plafond);
}

/**
 * De drie banden die de speler in beeld krijgt: tot `veilig` merkt hij niets,
 * tot `grens` gaat hij vragen stellen, daarboven is het een protest. Ze volgen
 * uit `tolerantie()`, zodat wat je ziet ook echt is wat er gerekend wordt.
 */
export function banden(chief, omst) {
  const t = tolerantie(chief, omst);
  return { veilig: t * 0.62, grens: t, hard: t * 1.55 };
}

// --- De operatie -----------------------------------------------------------

/**
 * Bouwt de toestand van één bunkeroperatie. `bestelling` in ton, `retentie` als
 * deel daarvan (0 = netjes leveren).
 */
export function maakOperatie(opts) {
  const p = productVan(opts.product);
  const boot = opts.boot;
  const tempBoot = opts.temperatuurBoot != null ? opts.temperatuurBoot : (p.verwarmd ? 48 : 18);
  const maxD = maxDebiet(boot, opts.product, tempBoot);
  // De partij omgerekend naar kubieke meters bij de tanktemperatuur: dat is wat
  // er daadwerkelijk door de slang moet.
  const factor = vcf(p.dichtheid, tempBoot, p.groep);
  const m3PerTon = 1000 / ((p.dichtheid - 1.1) * factor);
  return {
    product: opts.product,
    bestelling: opts.bestelling,
    retentie: clamp(opts.retentie || 0, 0, MAX_RETENTIE),
    chief: opts.chief,
    omstandigheden: opts.omstandigheden,

    temperatuurBoot: tempBoot,
    temperatuurBuiten: opts.temperatuurBuiten != null ? opts.temperatuurBuiten : 12,
    dichtheid: p.dichtheid,
    groep: p.groep,
    m3PerTon,
    maxDebiet: maxD,

    // Bediening.
    pompStand: 0,
    aftoppen: false,

    // Metingen.
    verstreken: 0, // minuten sinds openen
    geleverdM3: 0,
    debiet: 0,
    druk: 1.0,
    ontvangendeTank: opts.ontvangendeTank || opts.bestelling * m3PerTon * 1.25,
    ontvangenM3: opts.beginUllage || 0,

    // Voorvallen.
    drukpiek: 0,
    gemorst: 0,
    overloop: false,
    slangKapot: false,
    klaar: false,
    gestopt: false,
    meldingen: [],
  };
}

/** Doel in ton: wat je fysiek wilt overpompen. */
export const doelTon = (op) => op.bestelling * (1 - op.retentie);
/** Doel in m³ bij de huidige tanktemperatuur. */
export const doelM3 = (op) => doelTon(op) * op.m3PerTon;

/** Wat er tot nu toe werkelijk is geleverd, in ton massa in lucht. */
export function geleverdTon(op) {
  return massaInLucht(op.geleverdM3, op.dichtheid, op.temperatuurBoot, op.groep);
}

/** Wat je op de bon zet: de bestelde partij, ongeacht wat er door de slang ging. */
export const opgegevenTon = (op) => op.bestelling;

/**
 * Het verschil tussen wat je opgeeft en wat je werkelijk leverde, als deel van
 * de partij. Dit is het getal waar de chief overheen kijkt.
 */
export function verschilFractie(op) {
  const geleverd = geleverdTon(op);
  if (op.bestelling <= 0) return 0;
  return (op.bestelling - geleverd) / op.bestelling;
}

/** Hoeveel je overhoudt in je eigen tanks, in ton. */
export function margeTon(op) {
  return Math.max(0, op.bestelling - geleverdTon(op));
}

/**
 * Eén tijdstap. `dtMin` is de verstreken tijd in minuten; `rng` levert het
 * toeval voor de voorvallen. De functie muteert `op` en geeft een lijst
 * gebeurtenissen terug, zodat de scène er geluid en beeld aan kan hangen.
 */
export function tik(op, dtMin, rng) {
  const gebeurd = [];
  if (op.klaar || op.gestopt) return gebeurd;
  op.verstreken += dtMin;

  // Het toegestane debiet: aanloop aan het begin, aftoppen aan het eind.
  let plafond = 1;
  if (op.verstreken < AANLOOPMINUTEN) plafond = AANLOOPDEBIET;
  const vullingsgraad = op.ontvangendeTank > 0 ? op.ontvangenM3 / op.ontvangendeTank : 0;
  const moetAftoppen = vullingsgraad > AFTOPGRENS;
  if (moetAftoppen) plafond = Math.min(plafond, AFTOPDEBIET);

  const gevraagd = clamp(op.pompStand, 0, 1);
  op.debiet = gevraagd * op.maxDebiet;

  // Overschrijding van het plafond bouwt risico op in plaats van meteen te
  // straffen: je mag te hard, je moet alleen weten dat het je een keer inhaalt.
  const over = Math.max(0, gevraagd - plafond);
  op.druk = manifolddruk(op.debiet, op.maxDebiet, op.product, op.temperatuurBoot);
  const maxDruk = op.omstandigheden.manifoldMax || 7;
  if (op.druk > maxDruk) {
    op.drukpiek += (op.druk - maxDruk) * dtMin * 0.5;
  } else {
    op.drukpiek = Math.max(0, op.drukpiek - dtMin * 0.8);
  }

  // Slang bezwijkt pas na aanhoudende overdruk — twee waarschuwingen, net als
  // de tuigage in een bui.
  if (op.drukpiek > 9 && !op.slangKapot) {
    op.slangKapot = true;
    op.gemorst += 0.6 + rng() * 1.8;
    op.gestopt = true;
    gebeurd.push({ soort: 'slang', tekst: 'De slang begeeft het bij het manifold.' });
  } else if (op.drukpiek > 5 && rng() < dtMin * 0.05) {
    gebeurd.push({ soort: 'waarschuwing', tekst: 'De slang staat te bol. Neem terug.' });
  }

  // Doorpompen na de aftopgrens loopt de tank over.
  if (moetAftoppen && over > 0.25 && rng() < dtMin * 0.22 * over) {
    op.overloop = true;
    op.gemorst += 0.3 + rng() * 1.2;
    op.gestopt = true;
    gebeurd.push({ soort: 'overloop', tekst: 'Tank loopt over — noodstop.' });
  }

  // Het volume zelf.
  const m3 = (op.debiet * dtMin) / 60;
  op.geleverdM3 += m3;
  op.ontvangenM3 += m3;

  // De temperatuur van wat er nog in de tank zit, zakt langzaam naar buiten toe
  // als er geen verwarming op staat. Dat schuift de omrekening onder je handen
  // vandaan — precies waar de discussies over gaan.
  const verwarmd = productVan(op.product).verwarmd && (op.omstandigheden.verwarming || 0) > 0;
  const afkoeling = verwarmd ? 0.004 : 0.016;
  op.temperatuurBoot += (op.temperatuurBuiten - op.temperatuurBoot) * afkoeling * dtMin * 0.1;

  // Klaar zodra het fysieke doel is bereikt.
  if (geleverdTon(op) >= doelTon(op)) {
    op.klaar = true;
    op.debiet = 0;
    op.pompStand = 0;
    gebeurd.push({ soort: 'klaar', tekst: 'Partij compleet. Leiding leegblazen.' });
  }
  return gebeurd;
}

// --- Het oordeel van de chief ----------------------------------------------

/**
 * Trekt een normaal verdeeld getal uit `rng` (Box–Muller). Nodig omdat de
 * meting van de chief een échte meting is met een échte spreiding, niet een
 * platte worp.
 */
function normaal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * De chief meet, rekent en velt zijn oordeel. Geeft terug wat hij vaststelde,
 * hoe ver dat van jouw opgave lag, en welke uitkomst dat wordt.
 *
 * De uitkomst is *niet* een dobbelsteen bovenop het verschil: hij volgt uit zijn
 * meting tegen zijn tolerantie. Het toeval zit uitsluitend in de meting zelf, en
 * dat is precies waar het in het echt ook zit.
 */
export function beoordeel(op, rng) {
  const omst = op.omstandigheden;
  const ruis = meetruis(omst);
  const werkelijk = geleverdTon(op);
  const opgegeven = opgegevenTon(op);

  // Zijn meting van wat hij ontving: het werkelijke getal plus zijn eigen ruis.
  const gemeten = werkelijk * (1 + normaal(rng) * ruis);
  const gat = (opgegeven - gemeten) / opgegeven;
  const t = tolerantie(op.chief, omst);

  let uitkomst;
  if (op.gemorst > 0) uitkomst = 'incident';
  else if (gat <= t * 0.62) uitkomst = 'schoon';
  else if (gat <= t) uitkomst = 'aantekening';
  else if (gat <= t * 1.55 && !omst.surveyor) uitkomst = 'protest';
  else uitkomst = 'surveyor';

  return {
    uitkomst,
    werkelijk,
    opgegeven,
    gemeten,
    gat,
    tolerantie: t,
    ruis,
    marge: margeTon(op),
  };
}

/**
 * Hoeveel een gegeven uitkomst kost of oplevert. Vracht is per ton opgegeven;
 * de achtergehouden partij is pas geld waard als je hem kwijt kunt, dus die
 * wordt hier niet meegeteld — die komt in je tanks terecht.
 */
export function afrekening(oordeel, order, moeilijk = 1) {
  const vracht = order.tarief * oordeel.opgegeven;
  let boete = 0;
  let argwaan = 0;
  let reputatie = 0;
  switch (oordeel.uitkomst) {
    case 'schoon':
      reputatie = 1.4;
      argwaan = -0.6;
      break;
    case 'aantekening':
      reputatie = 0.2;
      argwaan = 1.6;
      break;
    case 'protest':
      boete = vracht * 0.35;
      reputatie = -2.4;
      argwaan = 4.5;
      break;
    case 'surveyor':
      boete = vracht * 0.9 + oordeel.marge * 900;
      reputatie = -5.5;
      argwaan = 9;
      break;
    case 'incident':
      boete = 32000 * moeilijk;
      reputatie = -7;
      argwaan = 5;
      break;
    default:
      break;
  }
  return { vracht, boete: boete * moeilijk, argwaan: argwaan * moeilijk, reputatie };
}
