// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De levende wereld om de kaart heen: de klok, de markt, het orderbord, het
// verkeer, de sluiswachtrijen en het zicht. De kaart zelf (`vaarwater.js`) is
// statisch — dit is alles wat er beweegt.
//
// Net als in Zeeroverij is alles wat uit het zaadje volgt deterministisch
// (`makeRng`), en mag lopende spellogica gewoon `Math.random` gebruiken.

import { makeRng, rnd, pick, clamp, dist, TAU, normAngle } from './util.js';
import {
  PRODUCTEN, PRODUCT_INDEX, KLANTSCHEPEN, SCHEEPSNAMEN, REDERIJEN, BEVRACHTERS,
  CHIEFS, KLANTSCHIP_INDEX,
} from './data.js';
import { Vaarwater, WERELD_B, WERELD_H } from './vaarwater.js';
import * as getij from './getij.js';

/** Hoeveel orders er hooguit tegelijk op het bord staan. */
const MAX_ORDERS = 7;
/** Hoeveel schepen er als verkeer rondvaren. */
const DOEL_VERKEER = 26;

export class Wereld {
  constructor(seed = 20260813) {
    this.seed = seed;
    const rng = makeRng(seed);
    this.rng = rng;

    this.vaarwater = new Vaarwater();

    // De klok loopt in minuten sinds het begin van het spel. Dag 0 om 08:00:
    // een bunkerdag begint vroeg, maar niet in het donker — het eerste beeld
    // van het spel hoort bij daglicht te zijn.
    this.tijd = 8 * 60;

    // Marktprijzen per product, als afwijking van de basisprijs.
    this.markt = PRODUCTEN.map((p) => ({
      id: p.id,
      prijs: p.basis * rnd(rng, 0.94, 1.06),
      trend: rnd(rng, -0.4, 0.4),
    }));

    this.orders = [];
    this.orderKoeling = 0;

    // Sluiswachtrijen: `druk` is het aantal schepen dat voor je ligt. Hij
    // ademt met de dag mee — 's nachts is het rustig, in de ochtendspits niet.
    this.sluisDruk = {};
    for (const s of this.vaarwater.sluizen) this.sluisDruk[s.id] = rnd(rng, 0, 3);

    // Zicht: mistbanken die met de wind meedrijven. Dezelfde vorm als de
    // stormcellen in Zeeroverij, maar de straf is een gemiste afspraak in
    // plaats van gebroken tuigage.
    this.wind = { richting: rnd(rng, 0, TAU), kracht: rnd(rng, 3, 7) };
    this.mist = [];
    const mistRng = makeRng(seed ^ 0x5bf03635);
    for (let i = 0; i < 4; i++) {
      this.mist.push({
        x: rnd(mistRng, 0, WERELD_B),
        y: rnd(mistRng, 0, WERELD_H),
        straal: rnd(mistRng, 4000, 11000),
        dichtheid: rnd(mistRng, 0.3, 1),
        leven: rnd(mistRng, 0, 1),
      });
    }

    this.verkeer = [];
    for (let i = 0; i < DOEL_VERKEER; i++) this.spawnVerkeer(true);

    for (let i = 0; i < 4; i++) this.nieuweOrder();
  }

  // --- Klok ----------------------------------------------------------------

  get dag() {
    return Math.floor(this.tijd / 1440);
  }

  /** Tijd van de dag als "14:35". */
  klok(minuten = this.tijd) {
    const m = ((minuten % 1440) + 1440) % 1440;
    const u = Math.floor(m / 60);
    return `${String(u).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  }

  /** "dag 3, 14:35" — voor schermen waar de datum ertoe doet. */
  datum(minuten = this.tijd) {
    return `dag ${Math.floor(minuten / 1440) + 1}, ${this.klok(minuten)}`;
  }

  /** Is het licht? Bepaalt de kleuren op zee en hoe goed je ziet. */
  isDag(minuten = this.tijd) {
    const u = ((minuten % 1440) + 1440) % 1440 / 60;
    return u > 6.5 && u < 20.5;
  }

  // --- Getij en stroom -----------------------------------------------------

  /** Getijhoogte op een plek, in meters. */
  getijBij(x, y) {
    const as = this.vaarwater.as(x, y);
    if (!as) return getij.hoogte(this.tijd, 'hoek');
    return getij.hoogte(this.tijd, getij.WEG_STATION[as.weg.id] || 'gesloten');
  }

  /**
   * De stroom op een plek, als vector in m/s. Loopt langs de as van de vaargeul:
   * eb naar zee toe, vloed landinwaarts. Buiten de vaargeul (op zee) staat een
   * zwakke kuststroom.
   */
  stroomBij(x, y) {
    const as = this.vaarwater.as(x, y);
    if (!as) {
      const f = getij.stroomFractie(this.tijd, 'hoek');
      return { vx: f * 0.35, vy: f * 0.15 };
    }
    const v = getij.stroomSnelheid(this.tijd, as.weg, as.fractie);
    // De as van elke vaarweg loopt van zee naar binnen, dus eb (positief) gaat
    // tégen de as in. Zie de puntenlijsten in `vaarwater.js`.
    return { vx: -Math.cos(as.richting) * v, vy: -Math.sin(as.richting) * v };
  }

  /** Kort woord voor de HUD. */
  getijWoordBij(x, y) {
    const as = this.vaarwater.as(x, y);
    const st = as ? getij.WEG_STATION[as.weg.id] || 'gesloten' : 'hoek';
    return getij.getijWoord(this.tijd, st);
  }

  // --- Zicht ---------------------------------------------------------------

  /**
   * Het zicht op een plek, van 0 (dicht) tot 1 (helder). Onder de 0,35 legt de
   * verkeerspost het verkeer stil en verlies je je venster.
   */
  zichtBij(x, y) {
    let z = 1;
    for (const m of this.mist) {
      const d = dist(x, y, m.x, m.y);
      if (d > m.straal) continue;
      const kern = 1 - d / m.straal;
      const rijp = Math.sin(clamp(m.leven, 0, 1) * Math.PI);
      z = Math.min(z, 1 - kern * m.dichtheid * rijp * 0.95);
    }
    // 's Nachts is het zicht sowieso minder.
    if (!this.isDag()) z *= 0.78;
    return clamp(z, 0.05, 1);
  }

  /** Ligt het verkeer stil door mist? */
  isGestremd(x, y) {
    return this.zichtBij(x, y) < 0.35;
  }

  // --- Markt ---------------------------------------------------------------

  prijsVan(productId) {
    const m = this.markt[PRODUCT_INDEX[productId]];
    return m ? m.prijs : 0;
  }

  /**
   * De prijs beweegt als een dronkemanswandeling rond de basisprijs, met een
   * trend die langzaam omslaat. Voorraad aanhouden is daardoor een echte gok:
   * goedkoop laden en later leveren kan een halve reis opleveren, of kosten.
   */
  marktTik(dagen) {
    for (let i = 0; i < this.markt.length; i++) {
      const m = this.markt[i];
      const basis = PRODUCTEN[i].basis;
      m.trend += (Math.random() - 0.5) * 0.55 * dagen;
      m.trend *= Math.pow(0.86, dagen);
      // Terugtrekkende veer naar de basisprijs, zodat hij niet wegloopt.
      const terug = (basis - m.prijs) * 0.055 * dagen;
      m.prijs = clamp(m.prijs + m.trend * basis * 0.012 * dagen + terug, basis * 0.72, basis * 1.34);
    }
  }

  // --- Orderbord -----------------------------------------------------------

  /**
   * Bouwt één nominatie. De opbouw is met opzet zo dat álles wat de moeilijkheid
   * van de retentiebeslissing bepaalt — meetmethode, ligplaatssoort, chief,
   * partijgrootte — vóóraf op het orderbord te zien is. De speler kiest dus niet
   * alleen werk, hij kiest ook hoeveel ruimte hij later wil hebben.
   */
  nieuweOrder() {
    if (this.orders.length >= MAX_ORDERS) return null;
    const vw = this.vaarwater;
    const plekken = vw.ligplaatsen.filter((l) => l.soort !== 'terminal');
    const plaats = pick(Math.random, plekken);
    const type = pick(Math.random, KLANTSCHEPEN);
    const product = pick(Math.random, PRODUCTEN);
    const ton = Math.round(rnd(Math.random, type.partij[0], type.partij[1]) / 10) * 10;

    // Hoe verder weg en hoe krapper, hoe beter het tarief.
    const afstand = 0; // wordt bij het aannemen tegen je eigen positie gerekend
    const rede = plaats.soort === 'rede';
    const mfm = Math.random() < type.mfmKans;
    const surveyor = Math.random() < 0.07;
    const chief = pick(Math.random, CHIEFS);

    // Het venster: opent over 3–20 uur en duurt 3–9 uur.
    const opent = this.tijd + rnd(Math.random, 180, 1200);
    const duur = rnd(Math.random, 180, 540);

    // Basisvracht per ton, met toeslagen voor lastige omstandigheden.
    let tarief = rnd(Math.random, 9.5, 15);
    if (rede) tarief *= 1.35;
    if (duur < 260) tarief *= 1.2;
    if (ton < 300) tarief *= 1.25;
    if (plaats.haven !== 'Rotterdam') tarief *= 1.18;

    const order = {
      id: 'o' + Math.floor(Math.random() * 1e9).toString(36),
      schip: pick(Math.random, SCHEEPSNAMEN),
      rederij: pick(Math.random, REDERIJEN),
      bevrachter: pick(Math.random, BEVRACHTERS),
      type: type.id,
      product: product.id,
      ton,
      ligplaats: plaats.id,
      haven: plaats.haven,
      soort: plaats.soort,
      opent,
      sluit: opent + duur,
      tarief: Math.round(tarief * 10) / 10,
      chief: chief.id,
      mfm,
      surveyor,
      afstand,
      aangenomen: false,
    };
    this.orders.push(order);
    return order;
  }

  /** Verlopen orders vallen van het bord; er komen nieuwe voor terug. */
  orderTik(minuten) {
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      if (!o.aangenomen && o.sluit < this.tijd) this.orders.splice(i, 1);
    }
    this.orderKoeling -= minuten;
    if (this.orderKoeling <= 0 && this.orders.length < MAX_ORDERS) {
      this.nieuweOrder();
      this.orderKoeling = rnd(Math.random, 90, 260);
    }
  }

  // --- Sluizen -------------------------------------------------------------

  /**
   * De wachttijd bij een sluis in minuten. Hij volgt uit de drukte, het aantal
   * kolken en de schuttijd — en uit het feit dat de grote vaart voorgaat.
   * Bewust zichtbaar te maken vóór vertrek: een wachttijd waar je niet op kunt
   * plannen is pech, en pech is geen spel.
   */
  wachttijd(sluisId) {
    const s = this.vaarwater.sluizen.find((x) => x.id === sluisId);
    if (!s) return 0;
    const druk = this.sluisDruk[sluisId] || 0;
    const perSchutting = s.cyclus / s.kolken;
    // Voorrang voor zeeschepen kost een halve extra schutting.
    const voorrang = s.zeevaart ? perSchutting * 0.6 : 0;
    return Math.round(perSchutting * (0.5 + druk) + voorrang);
  }

  /**
   * De drukte ademt met de klok mee: een piek in de ochtend en aan het eind van
   * de middag, rustig 's nachts.
   */
  sluisTik(minuten) {
    const uur = ((this.tijd % 1440) + 1440) % 1440 / 60;
    const spits = Math.exp(-((uur - 8) ** 2) / 8) + Math.exp(-((uur - 17) ** 2) / 10);
    for (const s of this.vaarwater.sluizen) {
      const doel = (s.zeevaart ? 2.2 : 1.4) * (0.35 + spits * 1.5);
      const nu = this.sluisDruk[s.id] || 0;
      this.sluisDruk[s.id] = clamp(nu + (doel - nu) * clamp(minuten / 240, 0, 1)
        + (Math.random() - 0.5) * 0.3, 0, 9);
    }
  }

  // --- Verkeer -------------------------------------------------------------

  /**
   * Zet een schip op een vaarweg. Anders dan de vloten in Zeeroverij jagen deze
   * schepen niet op je — ze varen hun eigen route en negeren je volledig. Dat is
   * precies waarom ze gevaarlijk zijn.
   */
  spawnVerkeer(overal = false) {
    const wegen = this.vaarwater.wegen;
    const weg = pick(Math.random, wegen);
    const type = pick(Math.random, KLANTSCHEPEN);
    // Alleen op zeevaartwater komen de grote jongens.
    const lengte = weg.zee ? type.lengte : rnd(Math.random, 80, 135);
    const richting = Math.random() < 0.5 ? 1 : -1;
    const t = overal ? Math.random() : (richting > 0 ? 0.02 : 0.98);
    const v = {
      weg: weg.id,
      t,
      richting,
      lengte,
      breedte: lengte * rnd(Math.random, 0.13, 0.17),
      snelheid: rnd(Math.random, 2.6, 5.4) * (weg.zee ? 1.2 : 1),
      type: type.id,
      naam: pick(Math.random, SCHEEPSNAMEN),
      x: 0,
      y: 0,
      koers: 0,
    };
    this.plaatsVerkeer(v);
    this.verkeer.push(v);
    return v;
  }

  /** Zet een verkeersschip op zijn plek langs de as van zijn vaarweg. */
  plaatsVerkeer(v) {
    const weg = this.vaarwater.wegIndex[v.weg];
    if (!weg) return;
    const pts = weg.pts;
    const totaal = weg.lengte;
    let doel = clamp(v.t, 0, 1) * totaal;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const seg = dist(ax, ay, bx, by);
      if (doel <= seg || i === pts.length - 1) {
        const f = seg > 0 ? clamp(doel / seg, 0, 1) : 0;
        const hoek = Math.atan2(by - ay, bx - ax);
        // Schepen houden stuurboordwal, dus ze liggen iets uit de as.
        const uit = (weg.half * 0.42) * v.richting;
        v.x = ax + (bx - ax) * f + Math.cos(hoek + Math.PI / 2) * uit;
        v.y = ay + (by - ay) * f + Math.sin(hoek + Math.PI / 2) * uit;
        v.koers = v.richting > 0 ? hoek : normAngle(hoek + Math.PI);
        return;
      }
      doel -= seg;
    }
  }

  verkeerTik(seconden) {
    for (let i = this.verkeer.length - 1; i >= 0; i--) {
      const v = this.verkeer[i];
      const weg = this.vaarwater.wegIndex[v.weg];
      if (!weg || weg.lengte <= 0) {
        this.verkeer.splice(i, 1);
        continue;
      }
      v.t += (v.snelheid * seconden * v.richting) / weg.lengte;
      if (v.t < -0.02 || v.t > 1.02) {
        this.verkeer.splice(i, 1);
        continue;
      }
      this.plaatsVerkeer(v);
    }
    while (this.verkeer.length < DOEL_VERKEER) this.spawnVerkeer(false);
  }

  /** Het dichtstbijzijnde verkeersschip binnen `straal`, of null. */
  verkeerOp(x, y, straal = 900) {
    let best = null;
    for (const v of this.verkeer) {
      const d = dist(x, y, v.x, v.y);
      if (d < straal && (!best || d < best.afstand)) best = { schip: v, afstand: d };
    }
    return best;
  }

  // --- Weer ----------------------------------------------------------------

  mistTik(minuten) {
    const w = this.wind;
    w.richting += (Math.random() - 0.5) * 0.02 * minuten;
    w.kracht = clamp(w.kracht + (Math.random() - 0.5) * 0.08 * minuten, 1, 11);
    for (const m of this.mist) {
      // Mist drijft met de wind mee, maar veel trager dan de wind zelf.
      const v = 0.6 + w.kracht * 0.25; // meters per minuut
      m.x += Math.cos(w.richting) * v * minuten;
      m.y += Math.sin(w.richting) * v * minuten;
      m.leven += minuten / rnd(Math.random, 900, 2200);
      if (m.leven > 1 || m.x < -20000 || m.x > WERELD_B + 20000
        || m.y < -20000 || m.y > WERELD_H + 20000) {
        m.x = rnd(Math.random, 0, WERELD_B);
        m.y = rnd(Math.random, 0, WERELD_H);
        m.straal = rnd(Math.random, 4000, 11000);
        m.dichtheid = rnd(Math.random, 0.25, 1);
        m.leven = 0;
      }
    }
  }

  /**
   * Deining op een plek, van 0 (vlak) tot 1 (flink). Alleen buitengaats en op de
   * rede; achter een sluis staat het water stil. Dit getal gaat rechtstreeks de
   * meetonzekerheid in — deining is in dit spel geen decor.
   */
  deiningBij(x, y) {
    const as = this.vaarwater.as(x, y);
    if (!as) return clamp(0.35 + this.wind.kracht * 0.07, 0, 1);
    const st = getij.WEG_STATION[as.weg.id];
    if (!st || st === 'gesloten') return 0;
    if (!as.weg.zee) return clamp(this.wind.kracht * 0.018, 0, 0.25);
    return clamp(this.wind.kracht * 0.055, 0, 0.75);
  }

  // --- De grote tik --------------------------------------------------------

  /**
   * Laat de wereld `minuten` speeltijd verstrijken. Alles wat met de klok
   * meeloopt hangt hieronder, zodat doorspoelen bij een sluis exact hetzelfde
   * doet als varen — alleen sneller.
   */
  verstrijk(minuten) {
    if (!(minuten > 0)) return;
    this.tijd += minuten;
    this.marktTik(minuten / 1440);
    this.orderTik(minuten);
    this.sluisTik(minuten);
    this.mistTik(minuten);
    this.verkeerTik(minuten * 60);
  }
}

export { WERELD_B, WERELD_H };
