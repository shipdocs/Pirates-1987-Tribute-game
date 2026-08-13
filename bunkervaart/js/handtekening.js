// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De handtekening: de opvolger van het duel. Dezelfde vorm — zet, tegenzet, en
// een winnaar — maar met papieren in plaats van staal. De chief peilt, rekent en
// legt zijn cijfer naast het jouwe. Wat jij daartegen inbrengt, hangt af van wat
// er werkelijk aan de hand was: een verweer dat niet op de situatie slaat, maakt
// het erger.

import { clamp, fmtGold } from './util.js';
import { productVan, PRODUCT_INDEX } from './data.js';
import { Spel, moeilijkVan, bewaar } from './spel.js';
import * as M from './overslagmodel.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

/**
 * De verweren. `slaatAan` bepaalt of het verweer op déze situatie van toepassing
 * is; alleen dan helpt het. Een verweer dat nergens op slaat kost geloofwaardigheid
 * — dat is wat het een keuze maakt in plaats van een lijstje om af te werken.
 */
const VERWEREN = [
  {
    id: 'deining',
    label: 'Wijzen op de deining tijdens het peilen',
    slaatAan: (o) => (o.omstandigheden.deining || 0) > 0.3,
    raak: 'Hij knikt. Het schip lag inderdaad te werken; op die peilingen zit speling.',
    mis: 'Hij kijkt naar het spiegelgladde water en zegt niets terug.',
  },
  {
    id: 'temperatuur',
    label: 'De temperatuur en de volumecorrectie naast elkaar leggen',
    slaatAan: (o) => (o.omstandigheden.temperatuurVerschil || 0) > 20,
    raak: 'Jullie rekenen het samen na. Op dit temperatuurverschil scheelt de correctie meer dan hij dacht.',
    mis: 'Alles lag op dezelfde temperatuur. Hij haalt zijn schouders op.',
  },
  {
    id: 'uitdraai',
    label: 'Je eigen meetuitdraai overleggen',
    slaatAan: (o, s) => (s.boot.verbeteringen.meting || 0) > 0,
    raak: 'Hij bekijkt de uitdraai aandachtig en legt hem bij de bon.',
    mis: 'Je hebt niets liggen wat zijn cijfer weerspreekt.',
  },
  {
    id: 'leiding',
    label: 'De leidinginhoud ter sprake brengen',
    slaatAan: (o) => true,
    raak: 'Over de inhoud van de slang valt altijd te praten. Hij gaat mee in een deel ervan.',
    mis: 'Hij heeft de leiding zelf zien leegblazen. Dit argument gaat niet op.',
    // Slaat altijd aan, maar pakt maar de helft van de tijd echt uit: iedereen
    // kent dit argument, dus iedereen heeft er een antwoord op.
    kans: 0.5,
  },
  {
    id: 'napeilen',
    label: 'Aanbieden om samen na te peilen',
    slaatAan: (o) => M.verschilFractie(o) < M.banden(o.chief, o.omstandigheden).veilig * 1.4,
    raak: 'Jullie peilen samen. Het komt uit binnen de speling, en daarmee is het klaar.',
    mis: 'Jullie peilen samen — en nu staat het gat zwart op wit.',
    // Napeilen is het enige verweer dat het écht erger maakt als je bluft.
    straf: true,
  },
  {
    id: 'zwijgen',
    label: 'Niets zeggen en het aan hem laten',
    slaatAan: () => false,
    mis: 'Je laat het lopen. Hij pakt zijn pen.',
    stil: true,
  },
];

export function toonHandtekening(operatie, order, opts) {
  const s = Spel.schipper;
  const streng = moeilijkVan(s).streng;
  const product = productVan(order.product);

  // De meting wordt één keer gedaan — daarna is het een gesprek, geen nieuwe
  // worp. Zo blijft de uitkomst een gevolg van wat er is gebeurd.
  let oordeel = M.beoordeel(operatie, Math.random);
  let tolerantie = oordeel.tolerantie;
  let verweerGebruikt = false;

  audio.sfx.tekenen();

  // Meteen klaar: hij ziet niets bijzonders.
  if (oordeel.uitkomst === 'schoon' || oordeel.uitkomst === 'incident') {
    return sluitAf(oordeel);
  }

  vraagVerweer();

  function vraagVerweer() {
    const gat = oordeel.gat;
    const tekst = [
      `Hij peilt, rekent en kijkt nog eens.`,
      ``,
      `<b>Zijn cijfer:</b> ${oordeel.gemeten.toFixed(1)} ton ontvangen.`,
      `<b>Jouw bon:</b> ${oordeel.opgegeven.toFixed(1)} ton geleverd.`,
      `<b>Verschil:</b> ${(oordeel.opgegeven - oordeel.gemeten).toFixed(1)} ton — ${(gat * 100).toFixed(2)} %.`,
      ``,
      `"Dit klopt niet met wat ik hier zie, schipper."`,
    ].join('<br>');

    const keuzes = VERWEREN.map((v) => ({
      label: v.label,
      waarde: v.id,
      soort: v.id === 'napeilen' ? 'gevaar' : undefined,
    }));

    UI.vraag('De chief tekent niet meteen', tekst, keuzes, { figuur: 'chief' })
      .then((keuze) => {
        const v = VERWEREN.find((x) => x.id === keuze) || VERWEREN[VERWEREN.length - 1];
        verweerGebruikt = true;
        pasVerweerToe(v);
      });
  }

  function pasVerweerToe(v) {
    if (v.stil) {
      return herbeoordeel(v.mis, 1);
    }
    const slaat = v.slaatAan(operatie, s);
    const kans = v.kans != null ? v.kans : 1;
    const raak = slaat && Math.random() < kans;

    if (raak) {
      // Een raak verweer verruimt wat hij nog laat passeren. Niet oneindig:
      // boven het plafond gelooft niemand het meer, hoe goed je verhaal ook is.
      const winst = v.id === 'napeilen' ? 1.9 : 1.38;
      return herbeoordeel(v.raak, winst);
    }
    // Mis. Napeilen is het enige verweer dat je positie echt verslechtert.
    const verlies = v.straf ? 0.42 : 0.86;
    return herbeoordeel(v.mis, verlies);
  }

  function herbeoordeel(tekst, factor) {
    tolerantie = Math.min(tolerantie * factor, M.TOLERANTIE_PLAFOND * 2);
    const gat = oordeel.gat;
    let uitkomst;
    if (gat <= tolerantie * 0.62) uitkomst = 'schoon';
    else if (gat <= tolerantie) uitkomst = 'aantekening';
    else if (gat <= tolerantie * 1.55 && !operatie.omstandigheden.surveyor) uitkomst = 'protest';
    else uitkomst = 'surveyor';
    oordeel = { ...oordeel, uitkomst, tolerantie };

    UI.vraag('...', tekst, [{ label: 'Verder', waarde: 'ok', esc: true }], { figuur: 'chief' })
      .then(() => sluitAf(oordeel));
  }

  /** De afrekening: geld, reputatie, argwaan en wat er in je tanks achterblijft. */
  function sluitAf(eind) {
    const geld = M.afrekening(eind, order, streng);
    const idx = PRODUCT_INDEX[order.product];

    // Tankboekhouding: wat er werkelijk door de slang ging, gaat uit je tanks.
    //
    // Wat er overblijft is niet zomaar allemaal van jou. Alleen het deel dat je
    // je hád voorgenomen achter te houden telt als marge; de rest is lading die
    // je gewoon niet hebt afgeleverd — bij een gesprongen slang of een overloop
    // kan dat honderden kuub zijn. Zonder dit onderscheid zou een incident je
    // de hele partij cadeau doen, en dan is het bezwijken van de slang de meest
    // winstgevende afloop van het spel.
    s.boot.tanks[idx] = Math.max(0, s.boot.tanks[idx] - operatie.geleverdM3);
    const gepland = operatie.bestelling * operatie.retentie;
    const vanJou = Math.min(eind.marge, gepland);
    const margeM3 = Math.max(0, vanJou * operatie.m3PerTon);
    if (margeM3 > 0.01) s.marge[idx] += margeM3;
    // Niet-geleverde lading boven je voorgenomen marge gaat terug naar de
    // bevrachter: hij verlaat je tanks en levert je niets op.
    const terug = Math.max(0, eind.marge - vanJou) * operatie.m3PerTon;
    if (terug > 0.01) {
      s.boot.tanks[idx] = Math.max(0, s.boot.tanks[idx] - terug);
      Spel.melding(`${Math.round(terug)} m³ onbestelde lading terug naar de bevrachter.`, 'rood');
    }

    s.geld += geld.vracht - geld.boete;
    s.verdiend += geld.vracht;
    s.argwaan = clamp(s.argwaan + geld.argwaan, 0, 100);
    s.reputatie = clamp(s.reputatie + geld.reputatie, 0, 100);
    s.stems += 1;
    if (eind.uitkomst === 'schoon') s.schoon += 1;
    if (eind.uitkomst === 'aantekening') s.aantekeningen += 1;
    if (eind.uitkomst === 'protest' || eind.uitkomst === 'surveyor') s.protesten += 1;
    if (eind.uitkomst === 'incident') s.incidenten += 1;
    s.order = null;
    s.reisplan = null;

    const kop = {
      schoon: 'Getekend',
      aantekening: 'Getekend, met een aantekening',
      protest: 'Letter of protest',
      surveyor: 'De surveyor komt aan boord',
      incident: 'Incident gemeld',
    }[eind.uitkomst];

    const verhaal = {
      schoon: '"Prima, schipper." Hij zet zijn handtekening en gaat naar binnen.',
      aantekening: 'Hij tekent, maar schrijft er iets bij. Dat komt in het systeem terecht.',
      protest: 'Hij tekent "for quantity only under protest" en houdt een kopie.',
      surveyor: 'Hij belt. Er komt iemand kijken, en die meet alles opnieuw na.',
      incident: 'Er is product buiten boord gekomen. Dat gaat verder dan deze bon.',
    }[eind.uitkomst];

    UI.toonScherm({
      titel: kop,
      onder: `${order.schip} · ${order.ton} t ${product.naam}`,
      breed: true,
      bouw(body) {
        const p = document.createElement('p');
        p.className = 'verhaal';
        p.innerHTML = verhaal;
        body.appendChild(p);

        body.appendChild(UI.tabel(
          [{ label: 'Bunkerbon' }, { label: '', rechts: true }],
          [
            { cellen: [{ tekst: 'Opgegeven' }, { tekst: `${eind.opgegeven.toFixed(1)} t`, klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Werkelijk geleverd' }, { tekst: `${eind.werkelijk.toFixed(1)} t`, klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Zijn meting' }, { tekst: `${eind.gemeten.toFixed(1)} t`, klasse: 'rechts' }] },
            {
              klasse: 'nadruk',
              cellen: [{ tekst: '<b>Achtergehouden</b>' },
                { tekst: `<b>${eind.marge.toFixed(1)} t</b>`, klasse: 'rechts' }],
            },
          ],
        ));

        const rijen = [
          { cellen: [{ tekst: 'Vracht' }, { tekst: fmtGold(Math.round(geld.vracht)), klasse: 'rechts' }] },
        ];
        if (geld.boete > 0) {
          rijen.push({
            klasse: 'slecht',
            cellen: [{ tekst: 'Boete en schaderegeling' },
              { tekst: `− ${fmtGold(Math.round(geld.boete))}`, klasse: 'rechts' }],
          });
        }
        rijen.push({
          klasse: 'nadruk',
          cellen: [{ tekst: '<b>Netto</b>' },
            { tekst: `<b>${fmtGold(Math.round(geld.vracht - geld.boete))}</b>`, klasse: 'rechts' }],
        });
        const geplandT = operatie.bestelling * operatie.retentie;
        const vanJouT = Math.min(eind.marge, geplandT);
        if (vanJouT > 0.05) {
          rijen.push({
            cellen: [{ tekst: 'Voor eigen rekening in je tanks' },
              { tekst: `${vanJouT.toFixed(1)} t ${product.naam}`, klasse: 'rechts' }],
          });
        }
        if (eind.marge - vanJouT > 0.05) {
          rijen.push({
            klasse: 'slecht',
            cellen: [{ tekst: 'Niet geleverd — terug naar de bevrachter' },
              { tekst: `${(eind.marge - vanJouT).toFixed(1)} t`, klasse: 'rechts' }],
          });
        }
        body.appendChild(UI.tabel([{ label: 'Afrekening' }, { label: '', rechts: true }], rijen));

        const na = document.createElement('p');
        na.className = 'zacht';
        na.innerHTML = `Betrouwbaarheid ${s.reputatie.toFixed(0)}`
          + (geld.argwaan > 0
            ? ` &nbsp;·&nbsp; <span class="waarschuwing">er wordt scherper naar je gekeken</span>`
            : geld.argwaan < 0 ? ' &nbsp;·&nbsp; de aandacht zakt weg' : '');
        body.appendChild(na);
      },
      knoppen: [{
        label: 'Losgooien',
        esc: true,
        actie: () => {
          UI.sluitAlles();
          audio.sfx.geld();
          bewaar();
          import('./varen.js').then((m) => {
            Spel.zetScene(m.maakVaarScene());
            Spel.melding(eind.uitkomst === 'schoon'
              ? 'Stem afgerond. Op naar de volgende.'
              : 'Losgegooid. Dat had beter gekund.',
            eind.uitkomst === 'schoon' ? 'groen' : 'rood');
          });
        },
      }],
    });
    return null;
  }
}
