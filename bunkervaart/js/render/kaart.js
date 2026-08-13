// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De wereld tekenen: land, vaarwater, kades, kunstwerken en het zicht.
//
// Anders dan in Zeeroverij is water hier de uitzondering en land de regel. Dat
// keert het tekenwerk om: we vullen het beeld met land en *strepen* daar het
// vaarwater in. Een corridor is een dikke lijn, geen polygoon — dat scheelt niet
// alleen werk, het houdt de geul ook overal even breed, en de oever volgt er
// vanzelf uit door dezelfde lijn een paar meter breder eronder te leggen.

import { clamp, sierTijd } from '../util.js';

// --- Palet -----------------------------------------------------------------

/**
 * Alle kleuren op één plek, want de HUD en de CSS moeten dezelfde tonen
 * gebruiken. Twee sets: dag en nacht. De ARA-regio is geen Caraïbisch blauw —
 * het is grijsgroen brak water tussen beton, staal en gras.
 */
export const PALET = {
  dag: {
    land: '#5c6b4e',
    landDonker: '#4a5740',
    industrie: '#6d6a63',
    water: '#41596b',
    waterDiep: '#2e4354',
    waterOndiep: '#5b7686',
    zee: '#33506a',
    oever: '#3a3a34',
    kade: '#8d8a80',
    lucht: '#93a7b5',
    lijn: 'rgba(230,240,248,0.30)',
  },
  nacht: {
    land: '#232a26',
    landDonker: '#1b211e',
    industrie: '#2c2b29',
    water: '#16232e',
    waterDiep: '#0e1922',
    waterOndiep: '#20323f',
    zee: '#101d29',
    oever: '#15161a',
    kade: '#3b3a36',
    lucht: '#1a2530',
    lijn: 'rgba(150,190,220,0.22)',
  },
};

export function paletVan(isDag) {
  return isDag ? PALET.dag : PALET.nacht;
}

// --- Camera ----------------------------------------------------------------

/**
 * De standaardzoom. Hij is niet naar smaak gekozen maar naar de vaargeul: op
 * deze stand is de smalste geul (200 m) nog 120 beeldpunten breed en de boot
 * ruim vijftig — genoeg om te zien waar je in de geul ligt, wat de hele
 * beslissing is bij oevereffect en ondiepte. Verder uitzoomen maakt dat
 * onleesbaar, verder inzoomen haalt de bocht uit beeld.
 */
export const WARE_ZOOM = 0.6;
export const MIN_ZOOM = 0.010;
export const MAX_ZOOM = 2.2;

/**
 * Hoe groot een schip getekend wordt ten opzichte van zijn werkelijke maat.
 * Boven de standaardzoom altijd 1 — dan klopt de tekening met de botsing en
 * hangt er geen romp over de kade heen. Alleen *onder* die zoom groeit hij, want
 * anders is een boot van tachtig meter op het overzicht een halve beeldpunt en
 * niet meer te vinden.
 */
export function scheepSchaal(zoom) {
  return clamp(WARE_ZOOM / zoom, 1, 7);
}

export function naarScherm(cam, x, y, vw, vh) {
  return [(x - cam.x) * cam.zoom + vw / 2, (y - cam.y) * cam.zoom + vh / 2];
}

// --- Land en water ---------------------------------------------------------

/**
 * Tekent land, zee en alle vaargeulen binnen beeld.
 *
 * De volgorde is met opzet van grof naar fijn: land, dan zee, dan per corridor
 * eerst de oever (breder, donker), dan het ondiepe talud, dan de vaargeul zelf.
 * Zo ontstaat de dwarsdoorsnede van een rivier zonder dat we ergens een
 * polygoon hoeven uit te rekenen.
 */
export function tekenWereld(ctx, wereld, cam, vw, vh, isDag) {
  const p = paletVan(isDag);
  const vw2 = wereld.vaarwater;

  // 1. Land als ondergrond. Alles is land tot we water tekenen.
  ctx.fillStyle = p.land;
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // 2. De Noordzee.
  ctx.fillStyle = p.zee;
  ctx.fill(vw2.zeePad);

  // 3. De corridors, in drie lagen over elkaar.
  const lagen = [
    { extra: 26, kleur: p.oever, alfa: 1 },
    { extra: 0, kleur: p.waterOndiep, alfa: 1 },
    { extra: -0.30, kleur: p.water, alfa: 1 },
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const laag of lagen) {
    ctx.strokeStyle = laag.kleur;
    for (const w of vw2.wegen) {
      const breedte = laag.extra < 0
        ? w.breedte * (1 + laag.extra)
        : w.breedte + laag.extra * 2;
      if (breedte * cam.zoom < 0.6) continue;
      ctx.lineWidth = breedte;
      ctx.stroke(w.pad);
    }
  }

  // 4. De diepste geulen krijgen nog een donkere kern: dat leest als diepte en
  //    het wijst meteen aan waar een zeeschip vaart.
  ctx.strokeStyle = p.waterDiep;
  for (const w of vw2.wegen) {
    if (w.diepte < 11) continue;
    const breedte = w.breedte * 0.42;
    if (breedte * cam.zoom < 1) continue;
    ctx.lineWidth = breedte;
    ctx.globalAlpha = 0.55;
    ctx.stroke(w.pad);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * De rimpeling op het water: fijne strepen die met de stroom meelopen. Ze
 * schuiven per frame op met de gemeten stroomsnelheid en niet met
 * `tijd × snelheid` — dat laatste is een positie die uit de *huidige* snelheid
 * volgt, dus elke kentering zou het hele patroon in één klap verspringen.
 */
export function tekenRimpeling(ctx, wereld, cam, vw, vh, drift, isDag) {
  if (cam.zoom < 0.06) return;
  const p = paletVan(isDag);
  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.globalAlpha = clamp((cam.zoom - 0.06) * 3, 0, 0.28);
  ctx.strokeStyle = p.lijn;
  ctx.lineWidth = 1.2 / cam.zoom;
  const stap = 130;
  const x0 = Math.floor((cam.x - vw / 2 / cam.zoom) / stap) * stap;
  const x1 = cam.x + vw / 2 / cam.zoom;
  const y0 = Math.floor((cam.y - vh / 2 / cam.zoom) / stap) * stap;
  const y1 = cam.y + vh / 2 / cam.zoom;
  const pad = new Path2D();
  for (let y = y0; y < y1; y += stap) {
    for (let x = x0; x < x1; x += stap) {
      const px = x + ((drift.x % stap) + stap) % stap;
      const py = y + ((drift.y % stap) + stap) % stap;
      if (!wereld.vaarwater.isWater(px, py)) continue;
      pad.moveTo(px - 26, py);
      pad.lineTo(px + 26, py);
    }
  }
  ctx.stroke(pad);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- Kunstwerken en ligplaatsen --------------------------------------------

/**
 * Sluizen, bruggen, terminals en ligplaatsen. Ze worden op schermschaal
 * getekend en niet op wereldschaal: een sluis moet op elk zoomniveau even
 * leesbaar blijven, want hij is een beslispunt en geen decor.
 */
export function tekenKunstwerken(ctx, wereld, cam, vw, vh, isDag, doel) {
  const p = paletVan(isDag);
  const vw2 = wereld.vaarwater;
  const zicht = { x0: cam.x - vw / 2 / cam.zoom, x1: cam.x + vw / 2 / cam.zoom,
    y0: cam.y - vh / 2 / cam.zoom, y1: cam.y + vh / 2 / cam.zoom };
  const inBeeld = (o, m = 2000) => o.x > zicht.x0 - m && o.x < zicht.x1 + m
    && o.y > zicht.y0 - m && o.y < zicht.y1 + m;

  ctx.save();
  ctx.font = '600 11px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Bruggen: een balk dwars over de geul.
  for (const b of vw2.bruggen) {
    if (!inBeeld(b)) continue;
    const [sx, sy] = naarScherm(cam, b.x, b.y, vw, vh);
    const w = clamp(vw2.wegIndex[b.vaarweg].breedte * cam.zoom, 14, 260);
    ctx.strokeStyle = b.beweegbaar ? '#c9a24a' : '#9aa2a8';
    ctx.lineWidth = clamp(6 * cam.zoom / WARE_ZOOM, 2.5, 8);
    ctx.beginPath();
    ctx.moveTo(sx - w / 2, sy);
    ctx.lineTo(sx + w / 2, sy);
    ctx.stroke();
    if (cam.zoom > 0.08) {
      ctx.fillStyle = 'rgba(240,246,250,0.8)';
      ctx.fillText(`${b.hoogte.toFixed(1)} m`, sx, sy - 13);
    }
  }

  // Sluizen: twee deuren met de wachttijd erbij. Die wachttijd is het hele
  // punt van een sluis in dit spel, dus hij staat er altijd bij.
  for (const s of vw2.sluizen) {
    if (!inBeeld(s)) continue;
    const [sx, sy] = naarScherm(cam, s.x, s.y, vw, vh);
    const r = clamp(60 * cam.zoom, 7, 34);
    ctx.strokeStyle = '#d8b25c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sx - r, sy - r * 0.8);
    ctx.lineTo(sx - r, sy + r * 0.8);
    ctx.moveTo(sx + r, sy - r * 0.8);
    ctx.lineTo(sx + r, sy + r * 0.8);
    ctx.stroke();
    if (cam.zoom > 0.045) {
      const w = wereld.wachttijd(s.id);
      ctx.fillStyle = 'rgba(14,20,26,0.78)';
      const tekst = `${s.naam} — ${w} min`;
      const bw = ctx.measureText(tekst).width + 12;
      ctx.fillRect(sx - bw / 2, sy - r - 22, bw, 16);
      ctx.fillStyle = w > 45 ? '#f0b48e' : '#dce9f2';
      ctx.fillText(tekst, sx, sy - r - 14);
    }
  }

  // Ligplaatsen en terminals.
  for (const l of vw2.ligplaatsen) {
    if (!inBeeld(l)) continue;
    const [sx, sy] = naarScherm(cam, l.x, l.y, vw, vh);
    const isDoel = doel && doel === l.id;
    const r = isDoel ? 10 : 6;
    ctx.beginPath();
    if (l.soort === 'terminal') {
      ctx.fillStyle = isDoel ? '#ffd27a' : '#c9a24a';
      ctx.rect(sx - r, sy - r, r * 2, r * 2);
    } else if (l.soort === 'rede') {
      ctx.fillStyle = isDoel ? '#9fe0ff' : '#6f9fbb';
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r, sy + r);
      ctx.lineTo(sx - r, sy + r);
      ctx.closePath();
    } else {
      ctx.fillStyle = isDoel ? '#9fe0ff' : '#7d95a6';
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    if (isDoel) {
      // Het doel krijgt een ademende ring, zodat je hem in een druk havenbeeld
      // meteen terugvindt.
      const puls = 1 + Math.sin(sierTijd(performance.now() / 1000) * 3) * 0.18;
      ctx.strokeStyle = 'rgba(255,220,140,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 2.2 * puls, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (cam.zoom > 0.05 || isDoel) {
      ctx.fillStyle = 'rgba(232,242,248,0.82)';
      ctx.fillText(l.naam, sx, sy + r + 11);
    }
  }
  ctx.restore();
}

/**
 * Bebouwing langs het water: tanks, loodsen en kranen rond de ligplaatsen. Het
 * land is anders een leeg vlak, en dan leest de kaart als een rivier door een
 * weiland in plaats van als de Botlek.
 *
 * De spreiding komt uit een hash van de rasterpositie en niet uit een reeks:
 * met een doorlopende generator zou elk overgeslagen vak het hele patroon
 * verschuiven, en we slaan er juist heel veel over — alles wat op water valt of
 * te ver van een kade ligt.
 */
export function tekenIndustrie(ctx, wereld, cam, vw, vh, isDag) {
  if (cam.zoom < 0.07) return;
  const p = paletVan(isDag);
  const vw2 = wereld.vaarwater;
  const stap = 95;
  const x0 = Math.floor((cam.x - vw / 2 / cam.zoom) / stap) * stap;
  const x1 = cam.x + vw / 2 / cam.zoom;
  const y0 = Math.floor((cam.y - vh / 2 / cam.zoom) / stap) * stap;
  const y1 = cam.y + vh / 2 / cam.zoom;
  // Bij ver uitzoomen kost dit duizenden vakjes en zie je er niets meer van.
  if ((x1 - x0) / stap > 200 || (y1 - y0) / stap > 200) return;

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const loodsen = new Path2D();
  const tanks = new Path2D();
  for (let y = y0; y < y1; y += stap) {
    for (let x = x0; x < x1; x += stap) {
      if (vw2.isWater(x, y)) continue;
      // Alleen de eerste strook achter de kade: een terminal ligt aan het
      // water, niet een halve kilometer landinwaarts.
      let bijWater = false;
      for (const d of [[stap, 0], [-stap, 0], [0, stap], [0, -stap],
        [stap, stap], [-stap, -stap], [stap, -stap], [-stap, stap]]) {
        if (vw2.isWater(x + d[0], y + d[1])) { bijWater = true; break; }
      }
      if (!bijWater) continue;

      const ix = Math.round(x / stap);
      const iy = Math.round(y / stap);
      // Terreinen klonteren: een heel blok van een halve kilometer is bebouwd
      // of juist niet. Zonder deze laag ligt de bebouwing als confetti over de
      // hele oever en leest het als ruis in plaats van als een havengebied.
      const wijk = ruis(Math.floor(x / 520), Math.floor(y / 520), 7717);
      if (wijk > 0.62) continue;
      const h = ruis(ix, iy, 1);
      if (h > 0.55) continue;

      const ox = (ruis(ix, iy, 2) - 0.5) * stap * 0.55;
      const oy = (ruis(ix, iy, 3) - 0.5) * stap * 0.55;
      // Een blok met een lage wijkwaarde is een tankpark, de rest zijn loodsen.
      if (wijk < 0.26) {
        const r = 13 + ruis(ix, iy, 4) * 22;
        tanks.moveTo(x + ox + r, y + oy);
        tanks.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      } else {
        const bw = 26 + ruis(ix, iy, 5) * 54;
        const bh = 20 + ruis(ix, iy, 6) * 40;
        loodsen.rect(x + ox - bw / 2, y + oy - bh / 2, bw, bh);
      }
    }
  }
  // Eén vulling per kleur: overlappende vormen in hetzelfde pad maken elkaar
  // niet donkerder, en dat is precies wat we willen.
  ctx.fillStyle = p.industrie;
  ctx.fill(loodsen);
  ctx.fillStyle = isDag ? '#8b8d86' : '#2f3336';
  ctx.fill(tanks);
  ctx.restore();
}

/**
 * Deterministische ruis uit een rasterpositie — een hash, geen reeks.
 *
 * Het `zaad` is niet decoratief: met alleen (ix, iy) leveren `ruis(x)` en
 * `ruis(x + 1)` dezelfde cel op en dus hetzelfde getal, waardoor elke
 * verschuiving gelijk liep met de bebouwingskans en alles keurig op een rij
 * kwam te staan. Elke onafhankelijke trekking hoort een eigen zaad te hebben.
 */
function ruis(ix, iy, zaad = 0) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(zaad, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Zicht en mist ---------------------------------------------------------

/**
 * Mist als een grijze sluier over het beeld. Hij wordt op schermcoördinaten
 * getekend en niet in de wereld: de dichtheid hoort bij waar de boot ís, niet
 * bij waar de camera toevallig kijkt.
 */
export function tekenZicht(ctx, zicht, vw, vh, isDag) {
  if (zicht > 0.95) return;
  const dicht = 1 - zicht;
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.12,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
  const grijs = isDag ? '210,218,224' : '96,110,124';
  g.addColorStop(0, `rgba(${grijs},${(dicht * 0.30).toFixed(3)})`);
  g.addColorStop(1, `rgba(${grijs},${(dicht * 0.92).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

/** Zachte donkere randen; houdt het oog in het midden. */
export function tekenVignet(ctx, vw, vh) {
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

/** Nachtelijke havenverlichting: warme stipjes langs de kades. */
export function tekenLichten(ctx, wereld, cam, vw, vh, tijd) {
  if (cam.zoom < 0.03) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of wereld.vaarwater.ligplaatsen) {
    const [sx, sy] = naarScherm(cam, l.x, l.y, vw, vh);
    if (sx < -80 || sx > vw + 80 || sy < -80 || sy > vh + 80) continue;
    const flikker = 0.82 + Math.sin(sierTijd(tijd) * 2.1 + l.x * 0.001) * 0.18;
    const r = clamp(90 * cam.zoom, 12, 70);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(255,205,120,${(0.30 * flikker).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,205,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}

