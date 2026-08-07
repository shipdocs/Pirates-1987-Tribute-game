// Statische speldata: naties, handelswaar, scheepstypen, steden en namen.

export const NATIES = {
  spanje: {
    naam: 'Spanje',
    bijv: 'Spaans',
    kleur: '#d8a12a',
    kleur2: '#b33232',
    vlag: ['#c8102e', '#f1bf00', '#c8102e'],
  },
  engeland: {
    naam: 'Engeland',
    bijv: 'Engels',
    kleur: '#d94f4f',
    kleur2: '#f2f2f2',
    vlag: ['#f4f4f4', '#cf142b', '#f4f4f4'],
  },
  frankrijk: {
    naam: 'Frankrijk',
    bijv: 'Frans',
    kleur: '#4f7fd9',
    kleur2: '#f2f2f2',
    vlag: ['#0055a4', '#f4f4f4', '#ef4135'],
  },
  nederland: {
    naam: 'Nederland',
    bijv: 'Nederlands',
    kleur: '#e8862b',
    kleur2: '#f2f2f2',
    vlag: ['#ae1c28', '#f4f4f4', '#21468b'],
  },
  piraat: {
    naam: 'Piraten',
    bijv: 'Piraten',
    kleur: '#2b2b31',
    kleur2: '#e8e4d8',
    vlag: ['#16161a', '#16161a', '#16161a'],
  },
};

export const NATIE_IDS = ['spanje', 'engeland', 'frankrijk', 'nederland'];

/** Handelswaar. `basis` is de richtprijs per eenheid in goudstukken. */
export const WAREN = [
  { id: 'voedsel', naam: 'Voedsel', basis: 40, kleur: '#c9a24a' },
  { id: 'suiker', naam: 'Suiker', basis: 90, kleur: '#e6ddc4' },
  { id: 'tabak', naam: 'Tabak', basis: 120, kleur: '#8a6a3a' },
  { id: 'katoen', naam: 'Katoen', basis: 110, kleur: '#dfe3e6' },
  { id: 'specerijen', naam: 'Specerijen', basis: 220, kleur: '#b5502a' },
  { id: 'handelswaar', naam: 'Handelswaar', basis: 150, kleur: '#6f8fae' },
  { id: 'kanonnen', naam: 'Kanonnen', basis: 400, kleur: '#5a5f66' },
];

export const WAAR_INDEX = Object.fromEntries(WAREN.map((w, i) => [w.id, i]));

/**
 * Scheepstypen. `snelheid` is in wereldeenheden per seconde bij ideale wind,
 * `wend` in radialen per seconde, `hoogte` bepaalt hoe goed het schip aan de
 * wind kan varen (0 = alleen voor de wind, 1 = maakt niet uit).
 */
export const SCHEPEN = [
  // `herlaad` is een vermenigvuldiger: lager = sneller herladen.
  { id: 'pinas', naam: 'Pinas', romp: 68, kanonnen: 4, ruim: 40, bemanning: 40, snelheid: 92, wend: 1.5, hoogte: 0.42, herlaad: 0.88, prijs: 1200, lidwoord: 'de' },
  { id: 'sloep', naam: 'Sloep', romp: 82, kanonnen: 6, ruim: 48, bemanning: 60, snelheid: 100, wend: 1.6, hoogte: 0.46, herlaad: 0.82, prijs: 1800, lidwoord: 'de' },
  { id: 'oorlogssloep', naam: 'Oorlogssloep', romp: 106, kanonnen: 10, ruim: 56, bemanning: 90, snelheid: 104, wend: 1.55, hoogte: 0.46, herlaad: 0.86, prijs: 3600, lidwoord: 'de' },
  { id: 'bark', naam: 'Bark', romp: 96, kanonnen: 6, ruim: 80, bemanning: 60, snelheid: 82, wend: 1.25, hoogte: 0.34, herlaad: 0.95, prijs: 2000, lidwoord: 'de' },
  { id: 'brigantijn', naam: 'Brigantijn', romp: 126, kanonnen: 12, ruim: 96, bemanning: 110, snelheid: 88, wend: 1.3, hoogte: 0.38, herlaad: 0.92, prijs: 4200, lidwoord: 'de' },
  { id: 'koopvaarder', naam: 'Koopvaarder', romp: 136, kanonnen: 10, ruim: 160, bemanning: 90, snelheid: 74, wend: 1.0, hoogte: 0.28, herlaad: 1.05, prijs: 4000, lidwoord: 'de' },
  { id: 'grote_koopvaarder', naam: 'Grote koopvaarder', romp: 168, kanonnen: 16, ruim: 220, bemanning: 130, snelheid: 70, wend: 0.92, hoogte: 0.26, herlaad: 1.15, prijs: 6500, lidwoord: 'de' },
  { id: 'fluit', naam: 'Fluitschip', romp: 130, kanonnen: 8, ruim: 200, bemanning: 80, snelheid: 78, wend: 1.05, hoogte: 0.3, herlaad: 1.0, prijs: 4500, lidwoord: 'het' },
  { id: 'vrachtfluit', naam: 'Vrachtfluit', romp: 158, kanonnen: 10, ruim: 280, bemanning: 100, snelheid: 72, wend: 0.95, hoogte: 0.28, herlaad: 1.12, prijs: 6800, lidwoord: 'de' },
  { id: 'fregat', naam: 'Fregat', romp: 206, kanonnen: 32, ruim: 160, bemanning: 200, snelheid: 84, wend: 1.1, hoogte: 0.32, herlaad: 1.25, prijs: 11000, lidwoord: 'het' },
  { id: 'galjoen', naam: 'Galjoen', romp: 222, kanonnen: 24, ruim: 260, bemanning: 200, snelheid: 66, wend: 0.82, hoogte: 0.22, herlaad: 1.35, prijs: 10500, lidwoord: 'het' },
  { id: 'oorlogsgaljoen', naam: 'Oorlogsgaljoen', romp: 270, kanonnen: 40, ruim: 240, bemanning: 260, snelheid: 68, wend: 0.85, hoogte: 0.24, herlaad: 1.45, prijs: 16000, lidwoord: 'het' },
  { id: 'linieschip', naam: 'Linieschip', romp: 340, kanonnen: 48, ruim: 200, bemanning: 320, snelheid: 70, wend: 0.8, hoogte: 0.26, herlaad: 1.6, prijs: 22000, lidwoord: 'het' },
];

export const SCHIP_INDEX = Object.fromEntries(SCHEPEN.map((s) => [s.id, s]));

/** Met bepaald lidwoord: "de sloep", "het fluitschip". */
export function metLidwoord(typeId, hoofdletterL = false) {
  const t = SCHIP_INDEX[typeId];
  if (!t) return 'het schip';
  const lid = hoofdletterL ? (t.lidwoord === 'het' ? 'Het' : 'De') : t.lidwoord;
  return `${lid} ${t.naam.toLowerCase()}`;
}

/**
 * Nette Nederlandse aanduiding, bijvoorbeeld "Engelse bark" of "Spaans
 * galjoen" — de buigings-e hangt af van het lidwoord van het scheepstype.
 */
export function scheepsAanduiding(natieId, typeId) {
  const t = SCHIP_INDEX[typeId];
  if (!t) return 'schip';
  const naam = t.naam.toLowerCase();
  if (natieId === 'piraat') return `piraten${naam}`;
  const n = NATIES[natieId];
  if (!n) return naam;
  return t.lidwoord === 'het' ? `${n.bijv} ${naam}` : `${n.bijv}e ${naam}`;
}

/** Startvaardigheden, zoals de "special abilities" uit het origineel. */
export const TALENTEN = [
  { id: 'schermen', naam: 'Meesterschermer', omschrijving: 'Je pareert sneller en slaat harder toe in een duel.' },
  { id: 'navigatie', naam: 'Fijn navigator', omschrijving: 'Je schepen halen meer snelheid uit elke wind.' },
  { id: 'kanonnier', naam: 'Meesterkanonnier', omschrijving: 'Je kanonnen herladen sneller en schieten zuiverder.' },
  { id: 'charme', naam: 'Gevat en charmant', omschrijving: 'Gouverneurs, kroegbazen en dames zijn je gunstiger gezind.' },
  { id: 'timmerman', naam: 'Bekwaam scheepstimmerman', omschrijving: 'Je romp houdt meer schade uit en herstelt onderweg.' },
];

export const MOEILIJKHEDEN = [
  { id: 'scheepsjongen', naam: 'Scheepsjongen', mult: 0.5, omschrijving: 'Rustig leren zeilen.' },
  { id: 'kaperkapitein', naam: 'Kaperkapitein', mult: 1.0, omschrijving: 'De eerlijke uitdaging.' },
  { id: 'zwaardvechter', naam: 'Zwaardvechter', mult: 1.5, omschrijving: 'Zware tegenstand, meer buit.' },
  { id: 'legende', naam: 'Legende', mult: 2.2, omschrijving: 'Alleen voor doorgewinterde zeerovers.' },
];

/** Rangen per natie, van laag naar hoog. */
export const RANGEN = [
  { naam: 'Zeerover', drempel: 0, land: 0 },
  { naam: 'Kaperbrief', drempel: 6000, land: 4 },
  { naam: 'Kapitein', drempel: 18000, land: 8 },
  { naam: 'Majoor', drempel: 40000, land: 16 },
  { naam: 'Kolonel', drempel: 80000, land: 28 },
  { naam: 'Admiraal', drempel: 150000, land: 48 },
  { naam: 'Baron', drempel: 260000, land: 80 },
  { naam: 'Markies', drempel: 420000, land: 120 },
];

/**
 * Steden. Posities zijn echte lengte-/breedtegraden; de wereldmodule zet ze
 * om naar kaartcoördinaten. `soort` stuurt de lokale economie.
 */
export const STEDEN = [
  // Spanje — de rijke Spanish Main
  { naam: 'Havana', natie: 'spanje', lon: -82.35, lat: 23.15, grootte: 5, soort: 'haven' },
  { naam: 'Santiago', natie: 'spanje', lon: -75.85, lat: 20.05, grootte: 3, soort: 'plantage' },
  { naam: 'Santo Domingo', natie: 'spanje', lon: -69.9, lat: 18.5, grootte: 4, soort: 'haven' },
  { naam: 'San Juan', natie: 'spanje', lon: -66.1, lat: 18.48, grootte: 3, soort: 'fort' },
  { naam: 'Cartagena', natie: 'spanje', lon: -75.5, lat: 10.42, grootte: 5, soort: 'schatkamer' },
  { naam: 'Santa Marta', natie: 'spanje', lon: -74.2, lat: 11.26, grootte: 2, soort: 'plantage' },
  { naam: 'Rio de la Hacha', natie: 'spanje', lon: -72.9, lat: 11.56, grootte: 2, soort: 'plantage' },
  { naam: 'Maracaibo', natie: 'spanje', lon: -71.62, lat: 10.68, grootte: 3, soort: 'haven' },
  { naam: 'Coro', natie: 'spanje', lon: -69.68, lat: 11.42, grootte: 2, soort: 'plantage' },
  { naam: 'Caracas', natie: 'spanje', lon: -66.95, lat: 10.62, grootte: 3, soort: 'haven' },
  { naam: 'Cumaná', natie: 'spanje', lon: -64.2, lat: 10.48, grootte: 2, soort: 'plantage' },
  { naam: 'Margarita', natie: 'spanje', lon: -63.9, lat: 11.02, grootte: 2, soort: 'parels' },
  { naam: 'Porto Bello', natie: 'spanje', lon: -79.65, lat: 9.56, grootte: 4, soort: 'schatkamer' },
  { naam: 'Panamá', natie: 'spanje', lon: -79.5, lat: 8.9, grootte: 4, soort: 'schatkamer' },
  { naam: 'Campeche', natie: 'spanje', lon: -90.55, lat: 19.85, grootte: 3, soort: 'haven' },
  { naam: 'Vera Cruz', natie: 'spanje', lon: -96.13, lat: 19.2, grootte: 4, soort: 'schatkamer' },
  { naam: 'Villa Hermosa', natie: 'spanje', lon: -92.5, lat: 18.42, grootte: 2, soort: 'plantage' },
  { naam: 'San Agustín', natie: 'spanje', lon: -81.31, lat: 29.9, grootte: 2, soort: 'fort' },

  // Engeland
  { naam: 'Port Royale', natie: 'engeland', lon: -76.84, lat: 17.94, grootte: 4, soort: 'haven' },
  { naam: 'Nassau', natie: 'engeland', lon: -77.35, lat: 25.06, grootte: 2, soort: 'haven' },
  { naam: 'Eleuthera', natie: 'engeland', lon: -76.2, lat: 25.2, grootte: 1, soort: 'plantage' },
  { naam: 'Antigua', natie: 'engeland', lon: -61.85, lat: 17.12, grootte: 2, soort: 'plantage' },
  { naam: 'Barbados', natie: 'engeland', lon: -59.62, lat: 13.1, grootte: 3, soort: 'plantage' },
  { naam: 'St. Kitts', natie: 'engeland', lon: -62.72, lat: 17.3, grootte: 2, soort: 'plantage' },
  { naam: 'Belize', natie: 'engeland', lon: -88.2, lat: 17.5, grootte: 2, soort: 'haven' },

  // Frankrijk
  { naam: 'Tortuga', natie: 'frankrijk', lon: -72.82, lat: 20.08, grootte: 2, soort: 'roversnest' },
  { naam: 'Petit Goave', natie: 'frankrijk', lon: -72.87, lat: 18.45, grootte: 2, soort: 'roversnest' },
  { naam: 'Martinique', natie: 'frankrijk', lon: -61.07, lat: 14.6, grootte: 3, soort: 'plantage' },
  { naam: 'Guadeloupe', natie: 'frankrijk', lon: -61.73, lat: 16.24, grootte: 2, soort: 'plantage' },
  { naam: 'Nouvelle Orléans', natie: 'frankrijk', lon: -90.07, lat: 29.95, grootte: 3, soort: 'haven' },
  { naam: 'Biloxi', natie: 'frankrijk', lon: -88.9, lat: 30.4, grootte: 1, soort: 'plantage' },

  // Nederland
  { naam: 'Willemstad', natie: 'nederland', lon: -68.93, lat: 12.12, grootte: 3, soort: 'haven' },
  { naam: 'Oranjestad', natie: 'nederland', lon: -62.98, lat: 17.49, grootte: 2, soort: 'haven' },
  { naam: 'Sint Maarten', natie: 'nederland', lon: -63.05, lat: 18.05, grootte: 2, soort: 'plantage' },
  { naam: 'Bonaire', natie: 'nederland', lon: -68.28, lat: 12.18, grootte: 1, soort: 'plantage' },
];

/** Wat een stadssoort veel produceert (goedkoop) en wat ze juist nodig heeft (duur). */
export const SOORT_ECONOMIE = {
  haven: { produceert: ['handelswaar'], vraagt: ['voedsel', 'specerijen'] },
  plantage: { produceert: ['suiker', 'tabak', 'katoen'], vraagt: ['handelswaar', 'kanonnen'] },
  fort: { produceert: [], vraagt: ['voedsel', 'kanonnen', 'handelswaar'] },
  schatkamer: { produceert: ['specerijen'], vraagt: ['voedsel', 'handelswaar', 'katoen'] },
  parels: { produceert: ['specerijen'], vraagt: ['voedsel', 'handelswaar'] },
  roversnest: { produceert: ['kanonnen'], vraagt: ['voedsel', 'suiker'] },
};

export const KAPITEIN_NAMEN = [
  'Roderick Barbanegra', 'Jean le Vasseur', 'Diego de Almagro', 'Hendrik van Roon',
  'Silas Crowe', 'Anne de Ferrand', 'Bartolomé Ruiz', 'Willem Stuyver',
  'Mad Jack Hollis', 'Esteban Mora', 'Pierre Lafitte', 'Cornelis Klaassen',
  'Grace Rackham', 'Alonso Peralta', 'Thomas Ashby', 'Marten de Bruin',
];

export const GERUCHTEN = [
  'Een Spaanse schatvloot vaart komende maand langs {stad}.',
  'De gouverneur van {stad} betaalt goed voor {waar}.',
  'Er ligt een zwaarbeladen koopvaarder voor de kust van {stad}.',
  'Het garnizoen van {stad} is uitgedund; de muren zijn zwak.',
  'Men zegt dat {kapitein} zijn buit begraven heeft bij {stad}.',
  'De prijs van {waar} is ingestort in {stad}.',
  '{kapitein} zoekt bemanning en betaalt vorstelijk.',
];

export const VOORNAMEN_M = ['Roderick', 'Willem', 'Diego', 'Jean', 'Thomas', 'Cornelis', 'Alonso', 'Pieter'];
export const VOORNAMEN_V = ['Isabella', 'Marieke', 'Anne', 'Lucia', 'Catharina', 'Elena', 'Margriet'];
export const ACHTERNAMEN = ['van Dijck', 'Morgan', 'de la Vega', 'Bonnet', 'Sterling', 'van Heemskerck', 'Rojas'];
