// De rekenkern van het zeegevecht: breedzijden, kogelbanen en schade.
//
// Dit bestand raakt bewust geen canvas, geluid of DOM aan. Daardoor kan het
// gevecht ook buiten de browser worden doorgerekend, wat nodig is om de balans
// eerlijk te houden: hoe lang doet een sloep over een linieschip, en andersom.
//
// Het model volgt de regels van het origineel: het geschut staat in rijen langs
// de zijkant, dus een schip kan niet naar voren of naar achteren vuren, en niet
// meer dan de helft van zijn stukken in één breedzij. Kogels vliegen echt door
// de ruimte en missen ook echt — je richt met het roer, niet met een dradenkruis.
import { clamp, normAngle, TAU } from './util.js';

// --- Munitie --------------------------------------------------------------

/**
 * `bereik` is de fractie van de rondkogelafstand: kettingkogel haalt ruim de
 * helft, schroot nog geen kwart. Zwaarder schroot vliegt bovendien trager.
 */
export const MUNITIE = [
  {
    id: 'rond', naam: 'Rondkogel', kort: 'ROND', doel: 'romp',
    omschrijving: 'Beukt de romp aan splinters en slaat geschut van het dek.',
    bereik: 1, snelheid: 1,
  },
  {
    id: 'ketting', naam: 'Kettingkogel', kort: 'KETTING', doel: 'zeilen',
    omschrijving: 'Scheurt zeilen en tuigage. Halveert het bereik.',
    bereik: 0.62, snelheid: 0.82,
  },
  {
    id: 'schroot', naam: 'Schroot', kort: 'SCHROOT', doel: 'bemanning',
    omschrijving: 'Maait het dek schoon, maar draagt nauwelijks.',
    bereik: 0.38, snelheid: 0.92,
  },
];

// --- Ballistiek -----------------------------------------------------------

/** Vliegsnelheid van een rondkogel, in wereldeenheden per seconde. */
export const KOGEL_SNELHEID = 265;

/**
 * Hoever de stukken mogen meedraaien met het doel. De affuiten staan vast
 * dwars op de kiel; een goede bediening haalt er hooguit een streek of tien
 * graden uit. Alles daarbuiten moet je met het roer oplossen.
 */
export const TRAVERSE = 0.19;

/** Hoe ver van dwars je nog een zinnige breedzij kunt geven (ongeveer 30°). */
export const SCHOOTSVELD = 0.52;

/** Enteren kan pas als je echt langszij ligt. */
export const ENTERAFSTAND = 95;

/**
 * Een schip voert de helft van zijn geschut aan elk boord. De bovengrens houdt
 * het scherm en de rekentijd binnen de perken bij de zwaarste linieschepen.
 */
export function salvoStukken(kanonnen) {
  return clamp(Math.round(kanonnen / 2), 0, 14);
}

/**
 * Halve openingshoek van de waaier. Meer stukken betekent een bredere spreiding:
 * dichtbij dekt dat het hele doel af, ver weg gaat het meeste in zee.
 */
export function spreiding(stukken) {
  return 0.055 + 0.0055 * stukken;
}

/** Maximale dracht, per schipstype en munitiesoort. */
export function schootsafstand(type, munitie) {
  return (360 + type.kanonnen * 2) * (munitie ? munitie.bereik : 1);
}

/**
 * Waar moet je heen mikken om een varend schip te raken? De vliegtijd hangt af
 * van de afstand, en die verandert weer doordat het doel wegvaart — vandaar een
 * paar rondjes naderen.
 */
export function voorhoudpunt(bx, by, doel, kogelSnelheid) {
  let t = Math.hypot(doel.x - bx, doel.y - by) / kogelSnelheid;
  let px = doel.x,
    py = doel.y;
  for (let i = 0; i < 3; i++) {
    px = doel.x + Math.cos(doel.koers) * doel.snelheid * t;
    py = doel.y + Math.sin(doel.koers) * doel.snelheid * t;
    t = Math.hypot(px - bx, py - by) / kogelSnelheid;
  }
  return { x: px, y: py, t };
}

/**
 * De richting waarin een breedzij vertrekt: loodrecht op de kiel, hooguit
 * `TRAVERSE` bijgedraaid richting het voorhoudpunt.
 */
export function salvoRichting(schutter, kant, mikX, mikY) {
  const dwarsHoek = normAngle(schutter.koers + (kant * Math.PI) / 2);
  const naarDoel = Math.atan2(mikY - schutter.y, mikX - schutter.x);
  const afwijking = clamp(normAngle(naarDoel - dwarsHoek), -TRAVERSE, TRAVERSE);
  return normAngle(dwarsHoek + afwijking);
}

/** Ligt het doel binnen het schootsveld van een van beide boorden? */
export function inSchootsveld(schutter, doel) {
  const peiling = normAngle(Math.atan2(doel.y - schutter.y, doel.x - schutter.x) - schutter.koers);
  const dwars = Math.abs(Math.abs(peiling) - Math.PI / 2);
  return { binnen: dwars <= SCHOOTSVELD, dwars, kant: peiling > 0 ? 1 : -1 };
}

/**
 * Zit het punt (kx, ky) in de romp van schip `s`? De romp wordt benaderd door
 * een ellips van `halveL` bij `halveB`. Een groot schip is daarmee vanzelf een
 * groter doel — precies zoals het hoort.
 */
export function raaktRomp(kx, ky, s, halveL, halveB) {
  const dx = kx - s.x;
  const dy = ky - s.y;
  const c = Math.cos(-s.koers);
  const sn = Math.sin(-s.koers);
  const lx = dx * c - dy * sn;
  const ly = dx * sn + dy * c;
  return (lx * lx) / (halveL * halveL) + (ly * ly) / (halveB * halveB) <= 1;
}

// --- Herladen en schade ---------------------------------------------------

/**
 * Herlaadtijd. Grote stukken zijn traag, en een uitgedunde bemanning krijgt ze
 * nog langzamer terug in batterij — verlies aan volk is dus echt verlies aan
 * vuurkracht.
 */
export function herlaadTijd(type, bemanningDeel, kanonnierBonus = 0) {
  const basis = 2.9 * type.herlaad - 0.5 * kanonnierBonus;
  return Math.max(0.7, basis * clamp(1.45 - bemanningDeel, 0.8, 1.6));
}

/** Zwaarder geschut slaat harder in, maar lang niet evenredig met het aantal. */
export function schadePerTreffer(schutterKanonnen) {
  return 0.85 + Math.sqrt(Math.max(0, schutterKanonnen)) * 0.095;
}

/** Welk deel van de rondkogeltreffers op het geschutsdek belandt in plaats van in de romp. */
export const KANS_GESCHUT = 0.3;

/**
 * Zoveel treffers op het geschutsdek leggen een batterij volledig stil,
 * ongeacht hoe groot die batterij is: één kogel die tussen de stukken inslaat
 * richt op een volgepakt dek nu eenmaal meer ravage aan dan op een sloep met
 * drie stukken aan een boord. Zonder die schaling zou een zwaar schip juist
 * makkelijker te ontwapenen zijn dan een licht, wat nergens op slaat.
 */
export const TREFFERS_ONTWAPENEN = 34;

/** Hoeveel stukken één treffer op het geschutsdek uitschakelt (mag gebroken zijn). */
export function geschutVerlies(startKanonnen) {
  return startKanonnen / TREFFERS_ONTWAPENEN;
}

/** Aantal koppen dat een lading schroot velt. */
export const SCHROOT_KOPPEN = 3.2;

/** Hoeveel tuigage een kettingkogel wegscheurt. */
export const KETTING_TUIGAGE = 0.04;

/**
 * De strijdlust van de vijand. Naast een lekke romp en gevallen kameraden telt
 * ook zwijgend geschut zwaar: een schip dat niet meer terug kan schieten geeft
 * zich over, ook al drijft het nog.
 */
export function strijdlust(s) {
  const romp = clamp(s.romp / s.maxRomp, 0, 1);
  const volk = clamp(s.bemanning / Math.max(1, s.startBemanning), 0, 1);
  const geschut = clamp(s.kanonnen / Math.max(1, s.startKanonnen), 0, 1);
  return clamp(romp * 45 + volk * 30 + geschut * 25, 0, 100);
}

/** Binnen deze afstand is de vijand dichtbij genoeg om de vlag te strijken. */
export const OVERGAVE_AFSTAND = 340;

/**
 * Geeft deze kapitein zich over? Naast een gebroken wil geldt de regel uit het
 * origineel: wie niet meer terug kán schieten, strijkt de vlag zodra je
 * langszij komt. Dat is precies de opening die een licht schip nodig heeft
 * tegen een zwaardere tegenstander — schiet zijn batterij stil en kom binnen.
 */
export function geeftOp(s, afstand, drempel = 22) {
  if (s.bemanning <= 0) return true;
  if (afstand >= OVERGAVE_AFSTAND) return false;
  if (s.kanonnen <= 0) return true;
  return strijdlust(s) < drempel;
}
