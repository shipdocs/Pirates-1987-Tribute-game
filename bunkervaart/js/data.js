// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Statische speldata: brandstoffen, bunkerboten, klantschepen, chiefs en
// verbeteringen. Net als in Zeeroverij hoort bij elke lijst een index op id;
// tankinhoud is een array op `PRODUCT_INDEX`, nooit een object met stringsleutels.

// --- Brandstoffen ----------------------------------------------------------

/**
 * De vier producten die de ARA-regio draaiende houden. `dichtheid` is de
 * dichtheid bij 15 °C in kg/m³ — dat is de waarde waarop wordt afgerekend, want
 * er wordt geleverd in kubieke meters en betaald in tonnen. `groep` bepaalt
 * welke constanten de volumecorrectie gebruikt (zie `vcf()`).
 *
 * `basis` is de richtprijs per ton in euro. Die beweegt per dag; zie de markt
 * in `wereld.js`.
 */
export const PRODUCTEN = [
  {
    id: 'vlsfo', naam: 'VLSFO', voluit: 'Very Low Sulphur Fuel Oil (0,50 % S)',
    dichtheid: 985, groep: 'stookolie', basis: 520, kleur: '#3d3226',
    verwarmd: true, omschrijving: 'De werkpaardbrandstof binnen de ECA. Dik, warm te houden, traag te pompen.',
  },
  {
    id: 'lsmgo', naam: 'LSMGO', voluit: 'Low Sulphur Marine Gas Oil (0,10 % S)',
    dichtheid: 860, groep: 'gasolie', basis: 735, kleur: '#b09a4e',
    verwarmd: false, omschrijving: 'Dun, schoon en duur. Pompt hard, maar krimpt en zet uit met de temperatuur.',
  },
  {
    id: 'hsfo', naam: 'HSFO', voluit: 'High Sulphur Fuel Oil (3,5 % S)',
    dichtheid: 991, groep: 'stookolie', basis: 430, kleur: '#22201d',
    verwarmd: true, omschrijving: 'Alleen voor schepen met een wasser. Goedkoop, en daarmee ook mager in de marge.',
  },
  {
    id: 'b30', naam: 'B30', voluit: 'Biobrandstofmengsel B30',
    dichtheid: 928, groep: 'gasolie', basis: 690, kleur: '#4e6b34',
    verwarmd: false, omschrijving: 'Gevraagd sinds FuelEU. Gevoelig voor water en niet lang houdbaar.',
  },
];

export const PRODUCT_INDEX = Object.fromEntries(PRODUCTEN.map((p, i) => [p.id, i]));
export const productVan = (id) => PRODUCTEN[PRODUCT_INDEX[id]];

/** Lege tankinhoud in m³, één getal per product. */
export const nieuweTanks = (obj = {}) => {
  const arr = new Array(PRODUCTEN.length).fill(0);
  for (const [k, v] of Object.entries(obj)) {
    const i = PRODUCT_INDEX[k];
    if (i != null) arr[i] = v;
  }
  return arr;
};

// --- Volumecorrectie -------------------------------------------------------

/**
 * Constanten uit de standaard volumecorrectietabellen, per productgroep.
 * Ze horen bij de uitzettingscoëfficiënt α = (K0 + K1·ρ15) / ρ15².
 */
const VCF_K = {
  stookolie: { k0: 103.8720, k1: 0.2701 },
  gasolie: { k0: 186.9696, k1: 0.4862 },
};

/**
 * Volumecorrectiefactor: hoeveel het gemeten volume bij temperatuur `t` waard
 * is teruggerekend naar 15 °C. Warme olie is méér kuub voor dezelfde massa, dus
 * de VCF is dan kleiner dan 1.
 *
 * Dit is de som waar het halve spel op rust — of je nu netjes levert of niet,
 * hij bepaalt wat er op de bunkerbon komt te staan. Hij staat daarom ook in het
 * headless model, zodat hij buiten de browser na te rekenen is.
 */
export function vcf(dichtheid15, temperatuur, groep = 'stookolie') {
  const k = VCF_K[groep] || VCF_K.stookolie;
  const alfa = (k.k0 + k.k1 * dichtheid15) / (dichtheid15 * dichtheid15);
  const dt = temperatuur - 15;
  return Math.exp(-alfa * dt * (1 + 0.8 * alfa * dt));
}

/**
 * Massa in lucht, in ton — dat is waarop een bunkerbon wordt afgerekend. Het
 * verschil met massa in vacuüm is de opwaartse kracht van de lucht: 1,1 kg/m³,
 * en dat is op een partij van vijfhonderd ton een halve ton verschil. Precies
 * het soort getal waarover discussies ontstaan.
 */
export function massaInLucht(volumeM3, dichtheid15, temperatuur, groep) {
  const f = vcf(dichtheid15, temperatuur, groep);
  const v15 = volumeM3 * f;
  return (v15 * (dichtheid15 - 1.1)) / 1000;
}

// --- Bunkerboten -----------------------------------------------------------

/**
 * `tank` is de totale tankinhoud in m³, `pomp` het maximale debiet in m³/uur,
 * `snelheid` de vrijvarende snelheid in m/s (stilstaand water), `lengte` en
 * `breedte` in meters. `diepgangLeeg` en `diepgangVol` bepalen samen hoe diep
 * je ligt bij de huidige belading; `opbouw` is de hoogte van het stuurhuis
 * boven de waterlijn in lege toestand — die bepaalt of je onder een brug past.
 *
 * `zee` betekent dat de boot buitengaats mag: de kustroute naar Amsterdam en de
 * Maasvlakte-rede zijn dan open.
 */
export const BOTEN = [
  {
    id: 'kleine_bunkerboot', naam: 'Kleine bunkerboot', tank: 900, pomp: 220,
    snelheid: 4.6, lengte: 65, breedte: 8.2, diepgangLeeg: 1.5, diepgangVol: 3.1,
    opbouw: 7.4, zee: false, prijs: 780000, bemanning: 3,
    omschrijving: 'Wendbaar, past overal, maar je vaart twee keer voor één partij.',
  },
  {
    id: 'bunkerboot', naam: 'Bunkerboot', tank: 1800, pomp: 360,
    snelheid: 4.4, lengte: 86, breedte: 11.4, diepgangLeeg: 1.8, diepgangVol: 4.0,
    opbouw: 8.1, zee: false, prijs: 1650000, bemanning: 4,
    omschrijving: 'De standaard in de Rijnmond. Genoeg ruim voor de meeste stems.',
  },
  {
    id: 'bunkertanker', naam: 'Bunkertanker', tank: 3400, pomp: 520,
    snelheid: 4.2, lengte: 110, breedte: 13.5, diepgangLeeg: 2.2, diepgangVol: 4.8,
    opbouw: 8.6, zee: false, prijs: 3100000, bemanning: 5,
    omschrijving: 'Grote partijen in één keer. Diep geladen ben je getijgebonden.',
  },
  {
    id: 'zeegaande_bunkertanker', naam: 'Zeegaande bunkertanker', tank: 6200, pomp: 700,
    snelheid: 5.4, lengte: 128, breedte: 16.8, diepgangLeeg: 3.0, diepgangVol: 6.4,
    opbouw: 10.2, zee: true, prijs: 6400000, bemanning: 7,
    omschrijving: 'Mag buitengaats: de rede, de kustroute en Vlissingen komen erbij.',
  },
];

export const BOOT_INDEX = Object.fromEntries(BOTEN.map((b) => [b.id, b]));

/** Diepgang bij de huidige belading, in meters. */
export function diepgangVan(bootType, gevuldM3) {
  const t = BOOT_INDEX[bootType];
  const f = Math.min(1, gevuldM3 / t.tank);
  return t.diepgangLeeg + (t.diepgangVol - t.diepgangLeeg) * f;
}

/** Doorvaarthoogte die je nodig hebt: leeg steek je hóger op dan vol geladen. */
export function opbouwhoogteVan(bootType, gevuldM3) {
  const t = BOOT_INDEX[bootType];
  const f = Math.min(1, gevuldM3 / t.tank);
  return t.opbouw + (t.diepgangVol - t.diepgangLeeg) * (1 - f);
}

// --- Klantschepen ----------------------------------------------------------

/**
 * De schepen die je bunkert. `partij` is het gebruikelijke bereik van een stem
 * in ton, `manifold` de maximale werkdruk aan hun kant in bar, en `tankMax` de
 * grootste tank die ze aanbieden — daar volgt de ullage-marge uit waarmee je bij
 * het aftoppen werkt.
 */
export const KLANTSCHEPEN = [
  { id: 'containerschip', naam: 'Containerschip', lengte: 366, partij: [800, 2600], manifold: 7.5, tankMax: 1400, mfmKans: 0.55 },
  { id: 'feeder', naam: 'Feeder', lengte: 172, partij: [180, 600], manifold: 6.0, tankMax: 420, mfmKans: 0.3 },
  { id: 'bulkcarrier', naam: 'Bulkcarrier', lengte: 229, partij: [300, 1200], manifold: 6.5, tankMax: 700, mfmKans: 0.25 },
  { id: 'producttanker', naam: 'Producttanker', lengte: 183, partij: [250, 900], manifold: 8.0, tankMax: 560, mfmKans: 0.6 },
  { id: 'roro', naam: 'Ro-ro', lengte: 199, partij: [220, 700], manifold: 6.0, tankMax: 480, mfmKans: 0.35 },
  { id: 'cruiseschip', naam: 'Cruiseschip', lengte: 294, partij: [500, 1500], manifold: 7.0, tankMax: 900, mfmKans: 0.7 },
  { id: 'autocarrier', naam: 'Autocarrier', lengte: 200, partij: [250, 800], manifold: 6.5, tankMax: 520, mfmKans: 0.3 },
];

export const KLANTSCHIP_INDEX = Object.fromEntries(KLANTSCHEPEN.map((k) => [k.id, k]));

export const SCHEEPSNAMEN = [
  'Mette Mærsk', 'Nordic Aurora', 'Stella Bergen', 'Anna Sofie', 'Kaiyo Maru',
  'Atlantic Kestrel', 'Bremer Sturm', 'Ionian Trader', 'Cap Vilano', 'Norsun',
  'Grande Ancona', 'Baltic Sprinter', 'Selandia Star', 'Vento di Mare', 'Elbe Trader',
  'Pacific Herald', 'Frisian Dawn', 'Marijke Deen', 'Sea Falcon', 'Doggersbank',
];

export const REDERIJEN = [
  'Nordwind Line', 'Vandermeer Shipping', 'Aurelia Maritime', 'Kestrel Bulk',
  'Delta Container Lines', 'Hansa Reederei', 'Stellamare BV', 'Orion Tankers',
];

export const BEVRACHTERS = [
  'Rijnmond Fuels', 'Scheldt Energy', 'Noordzee Bunkering', 'Zuidhaven Trading',
  'Meridiaan Oil', 'Kanaal Petroleum',
];

// --- De chief engineer -----------------------------------------------------

/**
 * Wie er aan de andere kant van de slang staat. Dit is de belangrijkste tabel
 * van het spel: `nauwkeurig` bepaalt hoe scherp hij meet, `haast` hoe snel hij
 * tekent, en `ervaring` hoeveel van je uitleg hij gelooft.
 *
 * Ze zijn bewust herkenbaar gemaakt aan de buitenkant — je ziet vóór de
 * overslag wie je tegenover je hebt — want de hele afweging in dit spel is dat
 * je de situatie kunt lézen. Een verborgen dobbelsteen zou dat kapotmaken.
 */
export const CHIEFS = [
  {
    id: 'groen', naam: 'Eerste reis als chief', nauwkeurig: 0.45, haast: 0.6, ervaring: 0.3,
    beeld: 'Jong, beleefd, en hij kijkt vooral of het schema klopt.',
  },
  {
    id: 'gehaast', naam: 'Gehaast', nauwkeurig: 0.55, haast: 0.9, ervaring: 0.6,
    beeld: 'Hij moet om acht uur weg en dat weet iedereen aan boord.',
  },
  {
    id: 'roetine', naam: 'Routineus', nauwkeurig: 0.7, haast: 0.5, ervaring: 0.7,
    beeld: 'Doet dit elke week. Peilt netjes, rekent netjes, zegt weinig.',
  },
  {
    id: 'kritisch', naam: 'Kritisch', nauwkeurig: 0.85, haast: 0.3, ervaring: 0.85,
    beeld: 'Heeft zijn eigen tabellen bij zich en gebruikt ze ook.',
  },
  {
    id: 'wantrouwend', naam: 'Wantrouwend', nauwkeurig: 0.95, haast: 0.15, ervaring: 0.95,
    beeld: 'Is ooit een keer flink tekortgedaan en is dat nooit vergeten.',
  },
];

export const CHIEF_INDEX = Object.fromEntries(CHIEFS.map((c) => [c.id, c]));

// --- Verbeteringen aan de boot ---------------------------------------------

/**
 * Wat de werf op je boot kan zetten. Anders dan in Zeeroverij gaat het hier
 * zelden om snelheid: het gaat om hoe geloofwaardig je papieren zijn en hoeveel
 * tijd een operatie kost.
 */
export const VERBETERINGEN = {
  pomp: {
    naam: 'Zwaardere pomp', omschrijving: 'meer m³ per uur, dus eerder klaar',
    basis: 62000, max: 3, stap: 0.12,
  },
  meting: {
    naam: 'Meetopstelling', omschrijving: 'nauwkeuriger peilen en een eigen uitdraai',
    basis: 88000, max: 3, stap: 0.14,
  },
  verwarming: {
    naam: 'Tankverwarming', omschrijving: 'houdt zware olie op temperatuur',
    basis: 54000, max: 2, stap: 0.1,
  },
  fenders: {
    naam: 'Zware fenders', omschrijving: 'schadevrij langszij, ook in deining',
    basis: 31000, max: 2, stap: 0.2,
  },
  roer: {
    naam: 'Boegschroef', omschrijving: 'draait korter en houdt je op stroom op je plek',
    basis: 47000, max: 2, stap: 0.18,
  },
};

export function verbeterBonus(boot, id) {
  const v = VERBETERINGEN[id];
  if (!v || !boot.verbeteringen) return 0;
  return (boot.verbeteringen[id] || 0) * v.stap;
}

// --- Moeilijkheid ----------------------------------------------------------

export const MOEILIJKHEDEN = [
  { id: 'matroos', naam: 'Matroos', mult: 0.6, streng: 0.6, omschrijving: 'Rustig leren varen; een fout kost weinig.' },
  { id: 'stuurman', naam: 'Stuurman', mult: 1.0, streng: 1.0, omschrijving: 'De eerlijke uitdaging.' },
  { id: 'schipper', naam: 'Schipper', mult: 1.5, streng: 1.4, omschrijving: 'Scherpere chiefs, krappere vensters.' },
  { id: 'eigenaar', naam: 'Eigen schipper', mult: 2.1, streng: 1.9, omschrijving: 'Je vaart op eigen rekening. Je papieren kun je kwijtraken.' },
];

// --- Vaartijdregime --------------------------------------------------------

/**
 * Hoeveel uur per etmaal je mag varen en hoeveel bemanning dat kost. Dit is de
 * plaats van de proviand uit Zeeroverij: een klok die je dwingt te stoppen, en
 * die je met geld kunt oprekken.
 */
export const VAARREGIMES = [
  { id: 'a1', naam: 'Dagvaart (A1)', uren: 14, bemanning: 3, loon: 1150 },
  { id: 'a2', naam: 'Halfcontinu (A2)', uren: 18, bemanning: 4, loon: 1720 },
  { id: 'b', naam: 'Continuvaart (B)', uren: 24, bemanning: 6, loon: 2640 },
];

export const REGIME_INDEX = Object.fromEntries(VAARREGIMES.map((r) => [r.id, r]));

// --- Teksten ---------------------------------------------------------------

export const MARKTPRAAT = [
  'Ze zeggen dat {bevrachter} volgende week meer {product} nodig heeft dan ze kwijt kunnen.',
  'Bij {ligplaats} liggen ze al twee dagen te wachten op een stem.',
  'De {sluis} draait maar met één kolk; reken op oponthoud.',
  'Er loopt een surveyor rond bij de {haven}-terminals. Werk netjes deze week.',
  'De prijs van {product} is gezakt; wie nu laadt, laadt goed.',
  'Een collega heeft vorige maand een protest gehad bij {rederij}. Ze kijken er scherper.',
];

/** Kort woord bij een verschil, voor de HUD tijdens de overslag. */
export function verschilWoord(fractie) {
  if (fractie < 0.004) return 'binnen de meetruis';
  if (fractie < 0.010) return 'verklaarbaar';
  if (fractie < 0.018) return 'hij gaat ernaar vragen';
  if (fractie < 0.028) return 'dit valt op';
  return 'niet meer uit te leggen';
}
