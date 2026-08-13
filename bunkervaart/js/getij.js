// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Getij en stroom. Waar in Zeeroverij de wind het hart van het spel was, is dat
// hier het getij: hij is voorspelbaar, hij keert twee keer per etmaal, en hij
// bepaalt of je op tijd komt en of je überhaupt door de ondiepe stukken past.
//
// Het model is bewust eenvoudig — één halfdaagse component per station, met een
// eigen amplitude en faseverschuiving — maar de *vorm* klopt: hoogwater plant
// zich voort van de Scheldemond landinwaarts, en de stroom staat het hardst
// halverwege tussen hoog- en laagwater, niet op de kentering.

import { TAU, clamp } from './util.js';

/** Halfdaagse periode in minuten: 12 uur en 25 minuten. */
export const PERIODE = 745;

/**
 * De getijstations. `amplitude` is de halve verticale slag in meters,
 * `fase` het aantal minuten dat hoogwater later valt dan bij Vlissingen.
 *
 * De cijfers volgen de werkelijkheid in grote lijnen: de Schelde trechtert het
 * tij op tot ruim vijf meter verval bij Antwerpen, terwijl IJmuiden nauwelijks
 * anderhalve meter ziet, en de voortplanting landinwaarts kost anderhalf uur.
 */
export const STATIONS = {
  vlissingen: { naam: 'Vlissingen', amplitude: 1.90, fase: 0 },
  antwerpen: { naam: 'Antwerpen', amplitude: 2.55, fase: 88 },
  hoek: { naam: 'Hoek van Holland', amplitude: 0.92, fase: 44 },
  rotterdam: { naam: 'Rotterdam', amplitude: 0.86, fase: 78 },
  dordrecht: { naam: 'Dordrecht', amplitude: 0.62, fase: 112 },
  ijmuiden: { naam: 'IJmuiden', amplitude: 0.88, fase: 96 },
  gesloten: { naam: 'Boezem', amplitude: 0, fase: 0 },
};

/** Welk station bij welke vaarweg hoort. Kanalen achter een sluis staan stil. */
export const WEG_STATION = {
  kustroute: 'hoek',
  maasmond: 'hoek',
  nieuwe_waterweg: 'hoek',
  nieuwe_maas: 'rotterdam',
  beerkanaal: 'hoek',
  calandkanaal: 'hoek',
  europoort: 'hoek',
  rozenburgsluis: 'gesloten',
  hartelkanaal: 'gesloten',
  oude_maas: 'rotterdam',
  botlek: 'rotterdam',
  pernis: 'rotterdam',
  waalhaven: 'rotterdam',
  noord: 'dordrecht',
  dordtsche_kil: 'dordrecht',
  hollandsch_diep: 'dordrecht',
  volkerak: 'gesloten',
  schelde_rijn: 'gesloten',
  westerschelde: 'vlissingen',
  schelde_antwerpen: 'antwerpen',
  antwerpen_dokken: 'gesloten',
  noordzeekanaal: 'gesloten',
  amsterdam_havens: 'gesloten',
};

/**
 * De fasehoek van het getij op tijdstip `minuten` voor een station. 0 is
 * hoogwater, π is laagwater.
 */
export function fase(minuten, stationId) {
  const st = STATIONS[stationId] || STATIONS.gesloten;
  return (TAU * (minuten - st.fase)) / PERIODE;
}

/**
 * Getijhoogte in meters ten opzichte van het gemiddelde, op dit tijdstip. Er zit
 * een langzame springtij–doodtij-golf overheen: die duurt bijna vijftien dagen
 * en maakt dat dezelfde reis de ene week wél en de andere week níét past.
 */
export function hoogte(minuten, stationId) {
  const st = STATIONS[stationId] || STATIONS.gesloten;
  if (!st.amplitude) return 0;
  const springDoodtij = 0.82 + 0.18 * Math.cos((TAU * minuten) / (14.77 * 24 * 60));
  return st.amplitude * springDoodtij * Math.cos(fase(minuten, stationId));
}

/**
 * De stroomfractie: −1 tot +1, waarbij positief betekent dat het water naar zee
 * loopt (eb). Hij is nul op de kentering — bij hoog- en laagwater — en maximaal
 * halverwege. Dat is het hele plangegeven van het spel: wie op de kentering
 * vertrekt, heeft zes uur stroom mee.
 */
export function stroomFractie(minuten, stationId) {
  const st = STATIONS[stationId] || STATIONS.gesloten;
  if (!st.amplitude) return 0;
  const springDoodtij = 0.82 + 0.18 * Math.cos((TAU * minuten) / (14.77 * 24 * 60));
  // Eb duurt langer dan vloed op een rivier, en de rivierafvoer schuift het
  // geheel naar zee toe. Vandaar de asymmetrie: de nul ligt niet in het midden.
  return (Math.sin(fase(minuten, stationId)) * springDoodtij) * 1.0 + 0.12;
}

/**
 * Hoe lang het nog duurt tot het eerstvolgende hoogwater, in minuten. Het
 * reisplan gebruikt dit om een getijvenster voor te stellen.
 */
export function tijdTotHoogwater(minuten, stationId) {
  const st = STATIONS[stationId] || STATIONS.gesloten;
  if (!st.amplitude) return null;
  const sinds = ((minuten - st.fase) % PERIODE + PERIODE) % PERIODE;
  return sinds === 0 ? 0 : PERIODE - sinds;
}

/** Kort woord voor de stand van het tij, voor de HUD. */
export function getijWoord(minuten, stationId) {
  const st = STATIONS[stationId] || STATIONS.gesloten;
  if (!st.amplitude) return 'gestremd water';
  const f = stroomFractie(minuten, stationId);
  const h = hoogte(minuten, stationId);
  if (Math.abs(f) < 0.18) return h > 0 ? 'kentering bij hoogwater' : 'kentering bij laagwater';
  return f > 0 ? 'eb — stroom naar zee' : 'vloed — stroom landinwaarts';
}

/**
 * De stroomsnelheid in m/s op een plek in een vaarweg. `maxStroom` komt uit de
 * vaarweggegevens; midden in de geul staat hij het hardst, langs de kant remt
 * de oever hem af.
 */
export function stroomSnelheid(minuten, weg, fractieVanAs) {
  const station = WEG_STATION[weg.id] || 'gesloten';
  const f = stroomFractie(minuten, station);
  // Langs de oever staat minder stroom — dat is precies waarom je tegen de
  // stroom in langs de kant vaart en met de stroom mee in het midden.
  const dwars = 1 - clamp(fractieVanAs, 0, 1) * 0.45;
  return f * (weg.stroom || 0) * dwars;
}
