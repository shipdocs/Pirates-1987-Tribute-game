// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Alles wat je aan de wal of vanuit het stuurhuis regelt: het orderbord, het
// laden bij een terminal, het reisplan en de overzichtskaart. In Zeeroverij was
// dit `town/*`; hier is het kleiner, want je bent schipper en geen directeur.

import { clamp, dist, fmtGold, el } from './util.js';
import {
  PRODUCTEN, productVan, BOOT_INDEX, KLANTSCHIP_INDEX, CHIEF_INDEX,
  VERBETERINGEN, VAARREGIMES, MARKTPRAAT, opbouwhoogteVan, vcf,
  PRODUCT_INDEX, diepgangVan,
} from './data.js';
import { Spel, tankTotaal, tankVrij, diepgang, bewaar } from './spel.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import * as getij from './getij.js';

// --- Orderbord -------------------------------------------------------------

/**
 * Het orderbord. Alles wat straks de speelruimte bij de overslag bepaalt, staat
 * hier al: de meetmethode, de ligplaatssoort, de chief en de partijgrootte. Dat
 * is met opzet — je kiest hier niet alleen wát je vaart, maar ook hoeveel ruimte
 * je later wilt hebben.
 */
export function toonOrderbord() {
  const s = Spel.schipper;
  const w = Spel.wereld;
  const vw = w.vaarwater;

  const scherm = UI.toonScherm({
    titel: 'Orderbord',
    onder: `${w.datum()} · kas ${fmtGold(Math.round(s.geld))} · betrouwbaarheid ${s.reputatie.toFixed(0)}`,
    breed: true,
    bouw(body) {
      if (s.order) {
        const p = el('p', 'verhaal');
        const plaats = vw.ligIndex[s.order.ligplaats];
        p.innerHTML = `Je hebt een lopende order: <b>${s.order.schip}</b>, ${s.order.ton} t `
          + `${productVan(s.order.product).naam} bij ${plaats.naam}.<br>`
          + `Het venster loopt van ${w.klok(s.order.opent)} tot ${w.klok(s.order.sluit)}.`;
        body.appendChild(p);
        const knop = el('button', 'knop knop-gevaar', 'Order teruggeven (kost reputatie)');
        knop.addEventListener('click', () => {
          s.reputatie = clamp(s.reputatie - 6, 0, 100);
          s.order = null;
          s.reisplan = null;
          audio.sfx.fout();
          scherm.ververs();
        });
        body.appendChild(knop);
        return;
      }

      const beschikbaar = w.orders.filter((o) => !o.aangenomen);
      if (!beschikbaar.length) {
        body.appendChild(el('p', 'verhaal', 'Het bord is leeg. Wacht even, er komt altijd wat.'));
        return;
      }

      const rijen = beschikbaar.map((o) => {
        const plaats = vw.ligIndex[o.ligplaats];
        const afstand = dist(s.x, s.y, plaats.x, plaats.y) / 1000;
        const chief = CHIEF_INDEX[o.chief];
        const opbrengst = o.ton * o.tarief;
        // De speelruimte bij benadering, zodat je hem kunt meewegen zonder de
        // hele operatie te hoeven starten.
        const ruim = !o.mfm && (o.soort === 'rede') && !o.surveyor;
        const krap = o.mfm || o.surveyor;
        const knop = el('button', 'knop knop-klein', 'Aannemen');
        knop.addEventListener('click', () => {
          o.aangenomen = true;
          s.order = o;
          audio.sfx.bevestig();
          scherm.sluit();
          Spel.melding(`Order aangenomen: ${o.schip}.`, 'groen');
          toonReisplan();
        });
        return {
          cellen: [
            {
              html: `<b>${o.schip}</b><br><span class="zacht">${KLANTSCHIP_INDEX[o.type].naam} · ${o.rederij}</span>`,
            },
            {
              html: `${o.ton} t ${productVan(o.product).naam}<br>`
                + `<span class="zacht">${plaats.naam}${o.soort === 'rede' ? ' (rede)' : ''}</span>`,
            },
            {
              html: `${w.klok(o.opent)}–${w.klok(o.sluit)}<br><span class="zacht">${afstand.toFixed(0)} km</span>`,
              klasse: 'rechts',
            },
            {
              html: `<span class="${krap ? 'slecht' : ruim ? 'goed' : ''}">`
                + `${o.mfm ? 'MFM' : 'peilen'}${o.surveyor ? ' + surveyor' : ''}</span>`
                + `<br><span class="zacht">${chief.naam.toLowerCase()}</span>`,
            },
            { html: `<b>${fmtGold(Math.round(opbrengst))}</b><br><span class="zacht">${o.tarief.toFixed(1)} /t</span>`, klasse: 'rechts' },
            { node: knop, klasse: 'rechts' },
          ],
        };
      });

      body.appendChild(UI.tabel([
        { label: 'Schip' }, { label: 'Partij' }, { label: 'Venster', rechts: true },
        { label: 'Meting' }, { label: 'Vracht', rechts: true }, { label: '', rechts: true },
      ], rijen));

      const tip = el('p', 'zacht');
      const praat = MARKTPRAAT[Math.floor(Math.random() * MARKTPRAAT.length)]
        .replace('{bevrachter}', beschikbaar[0].bevrachter)
        .replace('{product}', productVan(beschikbaar[0].product).naam)
        .replace('{ligplaats}', vw.ligIndex[beschikbaar[0].ligplaats].naam)
        .replace('{sluis}', vw.sluizen[0].naam)
        .replace('{haven}', beschikbaar[0].haven)
        .replace('{rederij}', beschikbaar[0].rederij);
      tip.textContent = `Op de kade: “${praat}”`;
      body.appendChild(tip);
    },
    knoppen: [{ label: 'Sluiten', esc: true, actie: () => scherm.sluit() }],
  });
  return scherm;
}

// --- Reisplan --------------------------------------------------------------

/**
 * Het reisplan: route, sluizen, bruggen, getij en de vraag of je het venster
 * haalt. Dit is het scherm waarin de kaart een puzzel wordt — en het bindt je
 * ook, want wie afwijkt raakt zijn sluisplanning kwijt.
 */
export function toonReisplan() {
  const s = Spel.schipper;
  const w = Spel.wereld;
  const vw = w.vaarwater;
  if (!s.order) {
    Spel.melding('Geen lopende order om voor te plannen.');
    return null;
  }
  const doel = vw.ligIndex[s.order.ligplaats];
  const route = vw.route(s.x, s.y, doel.x, doel.y);
  const type = BOOT_INDEX[s.boot.type];
  const dg = diepgang(s.boot);
  const hoogte = opbouwhoogteVan(s.boot.type, tankTotaal(s.boot));

  const scherm = UI.toonScherm({
    titel: 'Reisplan',
    onder: `naar ${doel.naam} · venster ${w.klok(s.order.opent)}–${w.klok(s.order.sluit)}`,
    breed: true,
    bouw(body) {
      if (!route) {
        body.appendChild(el('p', 'verhaal',
          'Er loopt geen aaneengesloten vaarweg naar die plek — je zult het op zicht moeten doen.'));
        return;
      }

      const obstakels = vw.obstakelsOp(route.wegen);
      const sluizen = obstakels.filter((o) => o.soort === 'sluis');
      const bruggen = obstakels.filter((o) => o.soort === 'brug');
      const wachten = sluizen.reduce((a, sl) => a + w.wachttijd(sl.id) + sl.cyclus / sl.kolken, 0);
      const vaarUur = route.lengte / (type.snelheid * 0.85) / 3600;
      const totaal = vaarUur * 60 + wachten;
      const aankomst = w.tijd + totaal;
      const opTijd = aankomst <= s.order.sluit;
      const teVroeg = aankomst < s.order.opent;

      body.appendChild(UI.tabel([{ label: 'De reis' }, { label: '', rechts: true }], [
        { cellen: [{ tekst: 'Afstand over de vaarweg' }, { tekst: `${(route.lengte / 1000).toFixed(0)} km`, klasse: 'rechts' }] },
        { cellen: [{ tekst: 'Vaartijd' }, { tekst: `${vaarUur.toFixed(1)} u`, klasse: 'rechts' }] },
        { cellen: [{ tekst: `Schutten (${sluizen.length} sluizen)` }, { tekst: `${Math.round(wachten)} min`, klasse: 'rechts' }] },
        {
          klasse: opTijd ? 'nadruk' : 'slecht',
          cellen: [{ tekst: '<b>Verwachte aankomst</b>' },
            { tekst: `<b>${w.datum(aankomst)}</b>`, klasse: 'rechts' }],
        },
      ]));

      const oordeel = el('p', opTijd ? 'verhaal goed' : 'verhaal slecht');
      oordeel.innerHTML = !opTijd
        ? `<b>Dit haal je niet.</b> Je komt ${Math.round((aankomst - s.order.sluit) / 60)} uur na sluiting aan.`
          + ' Vertrek nu, vaar door de nacht, of geef de order terug.'
        : teVroeg
          ? `Je bent ruim op tijd — je moet zelfs ${Math.round((s.order.opent - aankomst) / 60)} uur wachten.`
            + ' Ruimte om de kentering af te wachten of eerst te laden.'
          : `<b>Dit past.</b> Je hebt ${Math.round((s.order.sluit - aankomst) / 60)} uur speling.`;
      body.appendChild(oordeel);

      // De vaarwegen op volgorde, met diepte en of jij erdoor past.
      body.appendChild(UI.tabel([
        { label: 'Vaarweg' }, { label: 'Diepte', rechts: true }, { label: 'Getij' }, { label: '' },
      ], route.wegen.map((id) => {
        const weg = vw.wegIndex[id];
        const st = getij.WEG_STATION[id] || 'gesloten';
        const tij = getij.hoogte(w.tijd, st);
        const speling = weg.diepte + tij - dg;
        return {
          klasse: speling < 0.5 ? 'slecht' : undefined,
          cellen: [
            { tekst: weg.naam },
            { tekst: `${weg.diepte.toFixed(1)} m`, klasse: 'rechts' },
            {
              html: st === 'gesloten' ? '<span class="zacht">gestremd</span>'
                : `${tij >= 0 ? '+' : ''}${tij.toFixed(2)} m`,
            },
            {
              html: speling < 0.5
                ? `<span class="slecht">krap: ${speling.toFixed(2)} m onder de kiel</span>`
                : `<span class="zacht">${speling.toFixed(2)} m onder de kiel</span>`,
            },
          ],
        };
      })));

      if (sluizen.length) {
        body.appendChild(UI.tabel([
          { label: 'Sluis' }, { label: 'Wachttijd', rechts: true }, { label: 'Diepte', rechts: true },
        ], sluizen.map((sl) => ({
          klasse: dg > sl.diepte ? 'slecht' : undefined,
          cellen: [
            { html: `${sl.naam}${sl.zeevaart ? ' <span class="zacht">(zeevaart gaat voor)</span>' : ''}` },
            { tekst: `${w.wachttijd(sl.id)} min`, klasse: 'rechts' },
            {
              html: dg > sl.diepte
                ? `<span class="slecht">te diep</span>`
                : `<span class="zacht">${sl.diepte.toFixed(1)} m</span>`,
              klasse: 'rechts',
            },
          ],
        }))));
      }

      if (bruggen.length) {
        body.appendChild(UI.tabel([
          { label: 'Brug' }, { label: 'Doorvaart', rechts: true }, { label: '' },
        ], bruggen.map((b) => ({
          klasse: !b.beweegbaar && hoogte > b.hoogte ? 'slecht' : undefined,
          cellen: [
            { html: `${b.naam}${b.beweegbaar ? ' <span class="zacht">(opent)</span>' : ''}` },
            { tekst: `${b.hoogte.toFixed(1)} m`, klasse: 'rechts' },
            {
              html: hoogte > b.hoogte
                ? (b.beweegbaar
                  ? '<span class="waarschuwing">moet open — reken op wachttijd</span>'
                  : `<span class="slecht">je steekt ${(hoogte - b.hoogte).toFixed(1)} m te hoog op</span>`)
                : '<span class="zacht">past</span>',
            },
          ],
        }))));
      }

      const tijInfo = el('p', 'zacht');
      const tot = getij.tijdTotHoogwater(w.tijd, 'rotterdam');
      tijInfo.innerHTML = `Je steekt nu <b>${dg.toFixed(2)} m</b> diep en <b>${hoogte.toFixed(1)} m</b> op.`
        + (tot != null ? ` Hoogwater Rotterdam over ${Math.floor(tot / 60)} u ${Math.round(tot % 60)} m.` : '');
      body.appendChild(tijInfo);
    },
    knoppen: [{ label: 'Aan de slag', esc: true, actie: () => scherm.sluit() }],
  });
  return scherm;
}

// --- Terminal --------------------------------------------------------------

/** Laden, de achtergehouden partij verkopen, repareren en verbeteren. */
export function toonTerminal(plaats) {
  const s = Spel.schipper;
  const w = Spel.wereld;

  const scherm = UI.toonScherm({
    titel: plaats.naam,
    onder: `${w.datum()} · kas ${fmtGold(Math.round(s.geld))}`,
    breed: true,
    bouw(body) {
      const type = BOOT_INDEX[s.boot.type];
      const vrij = tankVrij(s.boot);
      const kop = el('p', 'zacht');
      kop.innerHTML = `Ruim: <b>${Math.round(tankTotaal(s.boot))}</b> van ${type.tank} m³ vol,`
        + ` <b>${Math.round(vrij)} m³</b> vrij. Diepgang ${diepgang(s.boot).toFixed(2)} m.`;
      body.appendChild(kop);

      // --- Laden ---
      //
      // Je koopt de lading niet: je bent vervoerder. De partij is van de
      // bevrachter en wordt op zijn rekening geladen; jij verdient vracht per
      // ton. Dat is hoe het in de ARA-regio werkelijk werkt — en het is meteen
      // de reden dat een achtergehouden procent geld waard is: het is product
      // dat je wél in je tanks hebt maar niet hebt betaald.
      body.appendChild(el('h3', null, 'Laden'));
      const laadUitleg = el('p', 'zacht');
      laadUitleg.textContent = 'De partij gaat op rekening van de bevrachter aan boord. '
        + 'Jij vaart hem, jij levert hem, jij wordt per ton betaald.';
      body.appendChild(laadUitleg);

      if (!s.order) {
        body.appendChild(el('p', 'verhaal', 'Je hebt geen lopende order — er is niets te laden. '
          + 'Neem eerst werk aan op het orderbord (O).'));
      } else {
        const p = productVan(s.order.product);
        const i = PRODUCT_INDEX[s.order.product];
        const nodig = benodigdM3(s.order, p);
        const alAanBoord = s.boot.tanks[i];
        const teLaden = Math.max(0, nodig - alAanBoord);
        const past = teLaden <= vrij + 0.5;
        const kn = el('button', 'knop', past
          ? `${Math.ceil(teLaden)} m³ ${p.naam} laden`
          : 'Past niet in je ruim');
        kn.disabled = !past || teLaden < 1;
        kn.addEventListener('click', () => {
          s.boot.tanks[i] += teLaden;
          s.boot.temperatuur[p.id] = p.verwarmd ? 48 : 18;
          // Laden kost tijd: aansluiten, pompen, peilen, papieren.
          const minuten = 45 + teLaden / 7;
          w.verstrijk(minuten);
          s.vaartijd -= 20;
          audio.sfx.bevestig();
          Spel.melding(`Geladen: ${Math.round(teLaden)} m³ ${p.naam}. `
            + `Dat kostte ${Math.round(minuten)} minuten.`, 'groen');
          scherm.ververs();
        });
        body.appendChild(UI.tabel([{ label: 'Voor deze order' }, { label: '', rechts: true }], [
          { cellen: [{ tekst: 'Partij' }, { tekst: `${s.order.ton} t ${p.naam}`, klasse: 'rechts' }] },
          {
            cellen: [{ tekst: 'Bij laadtemperatuur' },
              { tekst: `${Math.ceil(nodig)} m³ bij ${p.verwarmd ? 48 : 18} °C`, klasse: 'rechts' }],
          },
          { cellen: [{ tekst: 'Al aan boord' }, { tekst: `${Math.round(alAanBoord)} m³`, klasse: 'rechts' }] },
          {
            klasse: past ? 'nadruk' : 'slecht',
            cellen: [{ tekst: '<b>Nog te laden</b>' },
              { tekst: `<b>${Math.ceil(teLaden)} m³</b>`, klasse: 'rechts' }],
          },
          {
            cellen: [{ tekst: 'Diepgang daarna' },
              {
                tekst: `${diepgangVan(s.boot.type, tankTotaal(s.boot) + teLaden).toFixed(2)} m`,
                klasse: 'rechts',
              }],
          },
        ]));
        body.appendChild(kn);
      }

      // --- De achtergehouden partij kwijtraken ---
      const heeftMarge = s.marge.some((v) => v > 0.5);
      if (heeftMarge) {
        body.appendChild(el('h3', null, 'Overschot verkopen'));
        const uitleg = el('p', 'zacht');
        uitleg.textContent = 'Wat je hebt achtergehouden moet er weer uit voordat je opnieuw kunt laden. '
          + 'Niet iedereen vraagt door, maar niemand betaalt de volle prijs.';
        body.appendChild(uitleg);
        body.appendChild(UI.tabel([
          { label: 'Product' }, { label: 'Voorraad', rechts: true }, { label: 'Opbrengst', rechts: true },
          { label: '', rechts: true },
        ], PRODUCTEN.map((p, i) => {
          if (s.marge[i] <= 0.5) return null;
          const p15 = productVan(p.id);
          const ton = (s.marge[i] * (p15.dichtheid - 1.1)) / 1000;
          // Grijs verkopen levert ruwweg driekwart op; meer argwaan drukt het.
          const korting = 0.62 - clamp(s.argwaan / 100, 0, 1) * 0.14;
          const opbrengst = ton * w.prijsVan(p.id) * korting;
          const kn = el('button', 'knop knop-klein', 'Verkopen');
          kn.addEventListener('click', () => {
            s.boot.tanks[i] = Math.max(0, s.boot.tanks[i] - s.marge[i]);
            s.marge[i] = 0;
            s.geld += opbrengst;
            s.margeOpbrengst += opbrengst;
            // Het kwijtraken is zelf ook een moment waarop je opvalt.
            s.argwaan = clamp(s.argwaan + 0.8, 0, 100);
            audio.sfx.geld();
            Spel.melding(`Overschot verkocht: ${fmtGold(Math.round(opbrengst))}.`, 'groen');
            scherm.ververs();
          });
          return {
            cellen: [
              { tekst: p.naam },
              { tekst: `${ton.toFixed(1)} t`, klasse: 'rechts' },
              { tekst: fmtGold(Math.round(opbrengst)), klasse: 'rechts' },
              { node: kn, klasse: 'rechts' },
            ],
          };
        }).filter(Boolean)));
      }

      // --- Werf ---
      body.appendChild(el('h3', null, 'Werf'));
      if (s.boot.schade > 0.5) {
        const kosten = Math.round(s.boot.schade * 2200);
        const kn = el('button', 'knop knop-klein', `Schade herstellen — ${fmtGold(kosten)}`);
        kn.disabled = s.geld < kosten;
        kn.addEventListener('click', () => {
          s.geld -= kosten;
          s.boot.schade = 0;
          w.verstrijk(360);
          audio.sfx.bevestig();
          scherm.ververs();
        });
        const p = el('p', 'zacht');
        p.innerHTML = `Schade: <b>${s.boot.schade.toFixed(0)} %</b>. Herstel kost een halve dag.`;
        body.appendChild(p);
        body.appendChild(kn);
      }
      body.appendChild(UI.tabel([
        { label: 'Verbetering' }, { label: 'Niveau', rechts: true }, { label: '', rechts: true },
      ], Object.entries(VERBETERINGEN).map(([id, v]) => {
        const niveau = s.boot.verbeteringen[id] || 0;
        const kosten = Math.round(v.basis * Math.pow(1.7, niveau));
        const kn = el('button', 'knop knop-klein',
          niveau >= v.max ? 'Maximaal' : `${fmtGold(kosten)}`);
        kn.disabled = niveau >= v.max || s.geld < kosten;
        kn.addEventListener('click', () => {
          s.geld -= kosten;
          s.boot.verbeteringen[id] = niveau + 1;
          w.verstrijk(240);
          audio.sfx.bevestig();
          scherm.ververs();
        });
        return {
          cellen: [
            { html: `<b>${v.naam}</b><br><span class="zacht">${v.omschrijving}</span>` },
            { tekst: `${niveau} / ${v.max}`, klasse: 'rechts' },
            { node: kn, klasse: 'rechts' },
          ],
        };
      })));

      // --- Vaartijdregime ---
      body.appendChild(el('h3', null, 'Vaartijdregime'));
      const regimeUitleg = el('p', 'zacht');
      regimeUitleg.textContent = 'Meer bemanning betekent langer doorvaren en dus meer stems per week — '
        + 'maar de gage loopt elke dag door, ook als je stilligt.';
      body.appendChild(regimeUitleg);
      body.appendChild(UI.tabel([
        { label: 'Regime' }, { label: 'Vaartijd', rechts: true }, { label: 'Gage per dag', rechts: true },
        { label: '', rechts: true },
      ], VAARREGIMES.map((r) => {
        const kn = el('button', 'knop knop-klein', s.regime === r.id ? 'Huidig' : 'Kiezen');
        kn.disabled = s.regime === r.id;
        kn.addEventListener('click', () => {
          s.regime = r.id;
          s.vaartijd = Math.min(s.vaartijd, r.uren * 60);
          audio.sfx.klik();
          scherm.ververs();
        });
        return {
          klasse: s.regime === r.id ? 'nadruk' : undefined,
          cellen: [
            { html: `${r.naam}<br><span class="zacht">${r.bemanning} man</span>` },
            { tekst: `${r.uren} u`, klasse: 'rechts' },
            { tekst: fmtGold(r.loon), klasse: 'rechts' },
            { node: kn, klasse: 'rechts' },
          ],
        };
      })));
    },
    knoppen: [{ label: 'Losgooien', esc: true, actie: () => { bewaar(); scherm.sluit(); } }],
  });

  /**
   * Hoeveel kubieke meter er nodig is voor een order van zoveel ton. De
   * omgekeerde weg van `massaInLucht()`: van ton terug naar volume bij de
   * tanktemperatuur, want dát is wat er in je ruim moet passen. Warme olie is
   * meer kuub voor dezelfde massa — daarom staat de temperatuur erin.
   */
  function benodigdM3(order, p) {
    const temp = p.verwarmd ? 48 : 18;
    const factor = vcf(p.dichtheid, temp, p.groep);
    return (order.ton * 1000) / ((p.dichtheid - 1.1) * factor);
  }

  return scherm;
}

// --- Overzichtskaart -------------------------------------------------------

/** De hele ARA-regio in één scherm, met je positie, je doel en de sluizen. */
export function toonOverzicht() {
  const s = Spel.schipper;
  const w = Spel.wereld;
  const vw = w.vaarwater;

  const scherm = UI.toonScherm({
    titel: 'Overzichtskaart',
    onder: 'Amsterdam — Rotterdam — Antwerpen',
    breed: true,
    bouw(body) {
      const breedte = 780;
      const hoogte = Math.round(breedte * (vw.wereldH / vw.wereldB));
      const cv = document.createElement('canvas');
      cv.width = breedte * 2;
      cv.height = hoogte * 2;
      cv.style.width = '100%';
      cv.style.height = 'auto';
      cv.className = 'kaartvlak';
      const g = cv.getContext('2d');
      g.scale((breedte * 2) / vw.wereldB, (hoogte * 2) / vw.wereldH);

      g.fillStyle = '#3c4a3b';
      g.fillRect(0, 0, vw.wereldB, vw.wereldH);
      g.fillStyle = '#22394d';
      g.fill(vw.zeePad);

      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const weg of vw.wegen) {
        g.strokeStyle = weg.zee ? '#4c7994' : '#3d5f77';
        g.lineWidth = Math.max(vw.wereldB / breedte, weg.breedte);
        g.stroke(weg.pad);
      }

      const punt = (x, y, r, kleur) => {
        g.fillStyle = kleur;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const schaalTerug = vw.wereldB / breedte;
      for (const sl of vw.sluizen) punt(sl.x, sl.y, 5 * schaalTerug, '#d8b25c');
      for (const l of vw.ligplaatsen) {
        punt(l.x, l.y, 3.4 * schaalTerug, l.soort === 'terminal' ? '#c9a24a' : '#8fb0c4');
      }
      if (s.order) {
        const d = vw.ligIndex[s.order.ligplaats];
        punt(d.x, d.y, 8 * schaalTerug, '#ffd27a');
      }
      punt(s.x, s.y, 7 * schaalTerug, '#f08a5a');

      body.appendChild(cv);

      const legenda = el('p', 'zacht');
      legenda.innerHTML = '<span style="color:#f08a5a">●</span> jij &nbsp; '
        + '<span style="color:#ffd27a">●</span> je bestemming &nbsp; '
        + '<span style="color:#d8b25c">●</span> sluis &nbsp; '
        + '<span style="color:#c9a24a">●</span> terminal &nbsp; '
        + '<span style="color:#8fb0c4">●</span> ligplaats';
      body.appendChild(legenda);

      body.appendChild(UI.tabel([
        { label: 'Sluis' }, { label: 'Wachttijd nu', rechts: true },
      ], vw.sluizen.map((sl) => ({
        cellen: [
          { tekst: sl.naam },
          {
            html: `<span class="${w.wachttijd(sl.id) > 45 ? 'slecht' : 'zacht'}">${w.wachttijd(sl.id)} min</span>`,
            klasse: 'rechts',
          },
        ],
      }))));
    },
    knoppen: [{ label: 'Sluiten', esc: true, actie: () => scherm.sluit() }],
  });
  return scherm;
}
