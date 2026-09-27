// Afgesplitst van town.js: de koopman — kopen en verkopen van lading.
import { Game, vlaggenschip, ruimTotaal, ruimVrij } from '../game.js';
import { WAREN, SCHIP_INDEX } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { el, fmtGold } from '../util.js';

// --- Prijsvorming --------------------------------------------------------

/** Hoeveel één verhandelde eenheid de prijs verschuift. */
const PRIJS_STAP = 0.004;
/** Wat de koopman van zijn eigen vraagprijs betaalt als jij verkoopt. */
const VERKOOP_DEEL = 0.92;

/**
 * Wat `n` eenheden kosten bij een vraagprijs `prijs`. Elke eenheid kost wat
 * de prijs op dat moment is, en elke eenheid jaagt hem op. Voorheen ging de
 * hele partij tegen de oude prijs weg en steeg de prijs pas daarna — dan
 * leverde terugverkopen tegen die opgedreven prijs winst op, eindeloos.
 */
export function koopKosten(prijs, n) {
  if (n <= 0) return 0;
  return Math.round((prijs * ((1 + PRIJS_STAP) ** n - 1)) / PRIJS_STAP);
}

/** Wat `n` eenheden opbrengen; elke verkochte eenheid drukt de prijs. */
export function verkoopOpbrengst(prijs, n) {
  if (n <= 0) return 0;
  return Math.round((VERKOOP_DEEL * prijs * (1 - (1 - PRIJS_STAP) ** n)) / PRIJS_STAP);
}

/** De vraagprijs na het kopen (positief) of verkopen (negatief) van `n` eenheden. */
export function prijsNa(prijs, n) {
  // Geen afronding: bij goedkope waren slikte `Math.round` het effect van
  // losse eenheden, en bleef "+1" dertig keer achter elkaar op 49 staan.
  return Math.max(5, n >= 0 ? prijs * (1 + PRIJS_STAP) ** n : prijs * (1 - PRIJS_STAP) ** -n);
}

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
          b.disabled = s.goud < koopKosten(prijs, n) || ruimVrij(schip) < n || stad.voorraad[i] < n;
          b.title = `${n} kopen voor ${fmtGold(koopKosten(prijs, n))} goud`;
          b.onclick = () => koop(i, n, sch);
          knoppen.appendChild(b);
        }
        for (const n of [1, 10, 100]) {
          const b = el('button', 'mini rood', `−${n}`);
          b.disabled = schip.lading[i] < n;
          b.title = `${n} verkopen voor ${fmtGold(verkoopOpbrengst(prijs, n))} goud`;
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
            { tekst: fmtGold(prijs * VERKOOP_DEEL), klasse: 'rechts zacht' },
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
            { label: 'Hij betaalt', rechts: true },
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
    let kan = Math.min(n, Math.max(0, ruimVrij(schip)), Math.floor(stad.voorraad[i]));
    while (kan > 0 && koopKosten(prijs, kan) > s.goud) kan--;
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    s.goud -= koopKosten(prijs, kan);
    schip.lading[i] += kan;
    stad.voorraad[i] -= kan;
    stad.prijzen[i] = prijsNa(prijs, kan);
    audio.sfx.munt();
    sch.ververs();
  }

  function verkoop(i, n, sch) {
    const kan = Math.min(n, schip.lading[i]);
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    s.goud += verkoopOpbrengst(stad.prijzen[i], kan);
    schip.lading[i] -= kan;
    stad.voorraad[i] += kan;
    stad.prijzen[i] = prijsNa(stad.prijzen[i], -kan);
    audio.sfx.munt();
    sch.ververs();
  }

  return scherm;
}

export { handel };
