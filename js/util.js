// Kleine hulpfuncties die overal gebruikt worden.
export const TAU = Math.PI * 2;

/**
 * Wil de bezoeker zo min mogelijk beweging? Het spel zelf blijft bewegen —
 * varen ís het spel — maar sierlijke animaties (golfdrift, wapperende vlaggen,
 * pulserende markeringen) zetten we dan stil.
 */
let _rustig = false;
try {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  _rustig = mq.matches;
  mq.addEventListener?.('change', (e) => (_rustig = e.matches));
} catch (e) {
  /* oude browser: gewoon alles laten bewegen */
}

/** Tijd voor sieranimaties: bevroren wanneer de bezoeker rust wil. */
export const sierTijd = (t) => (_rustig ? 0 : t);

/**
 * Staat de sierbeweging stil? Voor animaties die niet uit een tijdstip volgen
 * maar per beeld optellen — die kunnen `sierTijd` niet gebruiken.
 */
export const sierRustig = () => _rustig;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** Deterministische RNG (mulberry32) zodat een zaadje altijd dezelfde wereld geeft. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rnd = (rng, a, b) => a + rng() * (b - a);
export const rndInt = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Hoek normaliseren naar (-PI, PI]. */
export function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/** Kortste verschil tussen twee hoeken. */
export const angleDiff = (a, b) => normAngle(a - b);

/** Draai `from` maximaal `max` radialen richting `to`. */
export function turnToward(from, to, max) {
  const d = angleDiff(to, from);
  return from + clamp(d, -max, max);
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Ray-casting punt-in-polygoon. poly = [[x,y], ...] */
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1],
      xj = poly[j][0],
      yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Kortste afstand van punt tot lijnstuk. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + t * dx, ay + t * dy);
}

export function fmtGold(n) {
  return Math.round(n).toLocaleString('nl-NL');
}

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** Dagteller sinds 1 januari 1660 omzetten naar leesbare datum. */
export function fmtDate(day) {
  const d = new Date(Date.UTC(1660, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(day));
  return `${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function yearOf(day) {
  const d = new Date(Date.UTC(1660, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(day));
  return d.getUTCFullYear();
}

/** Kompasrichting als tekst. Hoek 0 = oost, met de klok mee. */
export function compassName(a) {
  const names = ['O', 'ZO', 'Z', 'ZW', 'W', 'NW', 'N', 'NO'];
  const i = Math.round(normAngle(a) / (TAU / 8) + 8) % 8;
  return names[i];
}

/** Element maken met classes, tekst en attributen in één keer. */
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
