// Afgesplitst van town.js: de koopman — kopen en verkopen van lading.
import { Game, vlaggenschip, ruimTotaal, ruimVrij } from '../game.js';
import { WAREN, SCHIP_INDEX } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { el, fmtGold } from '../util.js';

function handel(stad, ouder) {
  const s = Game.speler;
  const schip = vlaggenschip(s);

  const scherm = UI.toonScherm({
    titel: 'De koopman',
    onder: `${stad.naam} · pakhuis en weegbrug`,
    breed: true,
    bouw(body, sch) {
      const kop = el('div', 'handel-kop');
      kop.innerHTML =
        `<span>Goud: <b>${fmtGold(s.goud)}</b></span>` +
        `<span>Ruim: <b>${ruimTotaal(schip)}</b> / ${SCHIP_INDEX[schip.type].ruim} ` +
        `(vrij: ${Math.max(0, ruimVrij(schip))})</span>`;
      body.appendChild(kop);

      const rijen = WAREN.map((w, i) => {
        const prijs = stad.prijzen[i];
        const knoppen = el('div', 'handel-knoppen');
        for (const n of [1, 10, 100]) {
          const b = el('button', 'mini', `+${n}`);
          b.disabled = s.goud < prijs * n || ruimVrij(schip) < n || stad.voorraad[i] < n;
          b.onclick = () => koop(i, n, sch);
          knoppen.appendChild(b);
        }
        for (const n of [1, 10, 100]) {
          const b = el('button', 'mini rood', `−${n}`);
          b.disabled = schip.lading[i] < n;
          b.onclick = () => verkoop(i, n, sch);
          knoppen.appendChild(b);
        }
        const alles = el('button', 'mini rood', 'alles');
        alles.disabled = schip.lading[i] <= 0;
        alles.onclick = () => verkoop(i, schip.lading[i], sch);
        knoppen.appendChild(alles);

        const basis = w.basis;
        const stemming = prijs < basis * 0.8 ? 'goedkoop' : prijs > basis * 1.25 ? 'duur' : '';
        return {
          cellen: [
            { html: `<span class="waar-stip" style="background:${w.kleur}"></span><b>${w.naam}</b>` },
            { html: `<span class="${stemming}">${fmtGold(prijs)}</span>`, klasse: 'rechts' },
            { tekst: String(Math.round(stad.voorraad[i])), klasse: 'rechts' },
            { tekst: String(schip.lading[i]), klasse: 'rechts' },
            { node: knoppen },
          ],
        };
      });

      body.appendChild(
        UI.tabel(
          [
            { label: 'Goed' },
            { label: 'Prijs', rechts: true },
            { label: 'In pakhuis', rechts: true },
            { label: 'In ruim', rechts: true },
            { label: 'Inkopen / verkopen' },
          ],
          rijen
        )
      );

      const uitleg = el('p', 'kleintje');
      uitleg.innerHTML =
        'Plantagesteden verkopen suiker, tabak en katoen goedkoop; forten en schatkamers betalen goed voor proviand en koopwaar. ' +
        '<span class="goedkoop">Groen</span> = koopje, <span class="duur">rood</span> = hoge prijs.';
      body.appendChild(uitleg);
    },
    knoppen: (sch) => [{ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } }],
  });

  function koop(i, n, sch) {
    const prijs = stad.prijzen[i];
    const kan = Math.min(n, Math.floor(s.goud / prijs), Math.max(0, ruimVrij(schip)), Math.floor(stad.voorraad[i]));
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    s.goud -= kan * prijs;
    schip.lading[i] += kan;
    stad.voorraad[i] -= kan;
    // Kopen jaagt de prijs op.
    stad.prijzen[i] = Math.max(5, Math.round(prijs * (1 + 0.004 * kan)));
    audio.sfx.munt();
    sch.ververs();
  }

  function verkoop(i, n, sch) {
    const kan = Math.min(n, schip.lading[i]);
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    const prijs = Math.round(stad.prijzen[i] * 0.92);
    s.goud += kan * prijs;
    schip.lading[i] -= kan;
    stad.voorraad[i] += kan;
    stad.prijzen[i] = Math.max(5, Math.round(stad.prijzen[i] * (1 - 0.004 * kan)));
    audio.sfx.munt();
    sch.ververs();
  }

  return scherm;
}

export { handel };
