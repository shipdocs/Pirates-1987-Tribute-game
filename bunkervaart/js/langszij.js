// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Langszij komen: de korte manoeuvre tussen varen en pompen. Geen eigen scène
// maar één scherpe beslissing, want de uitkomst is wat telt — hij gaat als
// beginstand mee de overslag in: het humeur van de chief, de staat van je
// fenders en hoeveel klok je nog over hebt.

import { clamp } from './util.js';
import { CHIEF_INDEX, KLANTSCHIP_INDEX, verbeterBonus, productVan } from './data.js';
import { Spel, moeilijkVan } from './spel.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

/**
 * De drie manieren om aan te leggen. Snel scheelt klok maar kost kans op
 * schade en op een chagrijnige chief — en een chagrijnige chief peilt
 * nauwkeuriger, dus deze keuze werkt door tot in de handtekening.
 */
const AANPAKKEN = [
  { id: 'voorzichtig', naam: 'Voorzichtig, met de stroom mee', minuten: 45, risico: 0.04, humeur: +0.10 },
  { id: 'normaal', naam: 'Normaal aanleggen', minuten: 28, risico: 0.13, humeur: 0 },
  { id: 'kort', naam: 'Kort langszij draaien', minuten: 14, risico: 0.34, humeur: -0.12 },
];

export function startLangszij() {
  const s = Spel.schipper;
  const w = Spel.wereld;
  const order = s.order;
  if (!order) {
    Spel.melding('Je hebt geen lopende order.');
    return;
  }
  const plaats = w.vaarwater.ligIndex[order.ligplaats];
  const deining = w.deiningBij(s.x, s.y);
  const stroom = w.stroomBij(s.x, s.y);
  const stroomKracht = Math.hypot(stroom.vx, stroom.vy);
  const fenders = verbeterBonus(s.boot, 'fenders');
  const streng = moeilijkVan(s).streng;

  const teLaat = w.tijd > order.sluit;
  const teVroeg = w.tijd < order.opent;

  const omschrijving = [
    `<b>${order.schip}</b> — ${KLANTSCHIP_INDEX[order.type].naam}, ${order.ton} t ${productVan(order.product).naam}.`,
    `Ligplaats: ${plaats.naam}.`,
    `Deining: <b>${deining < 0.1 ? 'vlak water' : deining < 0.4 ? 'licht' : 'flink'}</b>.`
    + ` Stroom: <b>${stroomKracht.toFixed(2)} m/s</b>.`,
    order.mfm
      ? 'Het schip heeft een <b>massaflowmeter</b> aan boord: er wordt strak gemeten.'
      : 'Er wordt <b>gepeild</b> aan boord — met de stok, zoals altijd.',
    order.surveyor ? '<b>Er staat een surveyor op de kade.</b>' : '',
    teLaat ? '<b class="waarschuwing">Je bent buiten het venster.</b> Reken op wachtgeld en een kort humeur.' : '',
    teVroeg ? `Je bent vroeg; het venster opent om ${w.klok(order.opent)}. Je wacht tot ze klaar zijn.` : '',
  ].filter(Boolean).join('<br>');

  UI.vraag('Langszij komen', omschrijving,
    AANPAKKEN.map((a) => ({
      label: `${a.naam} — ${a.minuten} min`,
      waarde: a.id,
    })).concat([{ label: 'Toch nog even wachten', waarde: null, esc: true }]),
    { figuur: 'boot' }).then((keuze) => {
    if (!keuze) return;
    const aanpak = AANPAKKEN.find((a) => a.id === keuze);

    // Wachten tot het venster opent kost gewoon tijd.
    if (teVroeg) w.verstrijk(order.opent - w.tijd);
    w.verstrijk(aanpak.minuten);
    s.vaartijd -= aanpak.minuten;

    // De kans dat het misgaat: de aanpak, de deining en de stroom tegen je
    // fenders en je boegschroef in.
    const kans = clamp(
      aanpak.risico * (1 + deining * 1.4 + stroomKracht * 0.5) * streng
      - fenders * 0.5 - verbeterBonus(s.boot, 'roer') * 0.25,
      0, 0.85,
    );
    let humeur = aanpak.humeur;
    let schade = 0;
    if (Math.random() < kans) {
      schade = 1 + Math.random() * 4 * (1 + deining);
      s.boot.schade = Math.min(100, (s.boot.schade || 0) + schade);
      humeur -= 0.18;
      audio.sfx.stoot(1);
      Spel.melding('Je raakt de scheepshuid. Dat gaat niemand vergeten.', 'rood');
    } else {
      audio.sfx.stoot(0.25);
    }

    // Te laat komen bederft het humeur het hardst — en het humeur van de chief
    // is in dit spel geen sfeer maar een getal in de tolerantie.
    if (teLaat) humeur -= 0.3;

    const chief = CHIEF_INDEX[order.chief];
    // Een gehaaste chief die al chagrijnig is, wordt nauwkeuriger; een tevreden
    // chief laat het eerder lopen. `humeur` schuift beide kanten op.
    const chiefNu = {
      ...chief,
      nauwkeurig: clamp(chief.nauwkeurig - humeur * 0.5, 0.2, 1),
      haast: clamp(chief.haast + humeur * 0.25, 0, 1),
    };

    import('./overslag.js').then((m) => {
      Spel.zetScene(m.maakOverslagScene({
        order,
        chief: chiefNu,
        deining,
        schade,
        teLaat,
      }));
    });
  });
}

export { AANPAKKEN };
