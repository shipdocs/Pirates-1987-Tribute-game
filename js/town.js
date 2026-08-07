// Alles wat er in een haven gebeurt: handel, kroeg, werf, gouverneur en plundering.
import { clamp, lerp, fmtGold, fmtDate, el, pick, makeRng } from './util.js';
import {
  WAREN, SCHEPEN, SCHIP_INDEX, NATIES, NATIE_IDS, RANGEN, metLidwoord,
  GERUCHTEN, KAPITEIN_NAMEN, VOORNAMEN_V, ACHTERNAMEN, MOEILIJKHEDEN,
} from './data.js';
import {
  Game, vlaggenschip, ruimTotaal, ruimVrij, vlootBemanningMax, nieuwSchip, talentBonus, berekenScore,
} from './game.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakDuel } from './duel.js';

const rng = Math.random;

export function openHaven(stad, opVertrek) {
  const s = Game.speler;
  const vijandig = s.relatie[stad.natie] <= -50 && stad.natie !== 'piraat';

  if (vijandig) {
    UI.toonScherm({
      titel: `${stad.naam} weigert je`,
      onder: `${NATIES[stad.natie].bijv} bezit · garnizoen ${Math.round(stad.garnizoen)} man`,
      klasse: 'overlay-smal',
      bouw(body) {
        body.appendChild(UI.maakFiguur('zeeman'));
        const p = el('p', 'verhaal');
        p.innerHTML =
          `De kanonnen van het fort volgen je schip. Op de kade wappert de ${NATIES[stad.natie].bijv.toLowerCase()} vlag, ` +
          'en jouw naam staat er zwart op wit als vijand van de kroon.';
        body.appendChild(p);
      },
      knoppen: (sch) => [
        {
          label: 'De stad bestormen',
          soort: 'gevaar',
          actie: () => {
            sch.sluit();
            bestormStad(stad, opVertrek);
          },
        },
        {
          label: 'Wegvaren',
          actie: () => {
            sch.sluit();
            opVertrek();
          },
        },
      ],
    });
    return;
  }

  audio.sfx.haven();
  hoofdmenu(stad, opVertrek);
}

function hoofdmenu(stad, opVertrek) {
  const s = Game.speler;
  const natie = NATIES[stad.natie];

  const scherm = UI.toonScherm({
    titel: stad.naam,
    onder: `${natie.bijv} · ${stad.soort} · ${Math.round(stad.bevolking).toLocaleString('nl-NL')} zielen · ${fmtDate(s.dag)}`,
    klasse: 'overlay-haven',
    bouw(body) {
      body.appendChild(havenPrent(stad));
      const info = el('div', 'haven-info');
      info.innerHTML =
        `<span>Goud in het ruim</span><b>${fmtGold(s.goud)}</b>` +
        `<span>Bemanning</span><b>${s.bemanning} / ${vlootBemanningMax(s)}</b>` +
        `<span>Moraal</span><b>${Math.round(s.moraal)}%</b>` +
        `<span>Romp vlaggenschip</span><b>${Math.round(vlaggenschip(s).romp)} / ${vlaggenschip(s).maxRomp}</b>` +
        `<span>Verhouding met ${natie.naam}</span><b>${relatieWoord(s.relatie[stad.natie])}</b>`;
      body.appendChild(info);
    },
    knoppen: (sch) => [
      { label: '🍺 De kroeg', actie: () => kroeg(stad, sch) },
      { label: '⚖️ De koopman', actie: () => handel(stad, sch) },
      { label: '🔨 De scheepswerf', actie: () => werf(stad, sch) },
      { label: '🏛️ De gouverneur', actie: () => gouverneur(stad, sch) },
      {
        label: '⚔️ De stad bestormen',
        soort: 'gevaar',
        actie: () => {
          sch.sluit();
          bestormStad(stad, opVertrek);
        },
      },
      {
        label: '⛵ Uitvaren',
        actie: () => {
          sch.sluit();
          opVertrek();
        },
      },
    ],
  });
  return scherm;
}

function havenPrent(stad) {
  const natie = NATIES[stad.natie];
  const d = el('div', 'haven-prent');
  d.innerHTML = `<svg viewBox="0 0 400 130" preserveAspectRatio="none">
    <defs><linearGradient id="lucht" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f5a80"/><stop offset="1" stop-color="#e0a06a"/></linearGradient></defs>
    <rect width="400" height="130" fill="url(#lucht)"/>
    <circle cx="330" cy="34" r="16" fill="#ffe6b0" opacity="0.85"/>
    <path d="M0 78 L60 52 L110 78 Z" fill="#3f6b46"/>
    <path d="M70 82 L140 44 L210 82 Z" fill="#4a7a4e"/>
    <rect x="0" y="80" width="400" height="50" fill="#1d4763"/>
    <g fill="#e8dcc0">
      <rect x="150" y="62" width="26" height="20"/><rect x="182" y="56" width="30" height="26"/>
      <rect x="218" y="64" width="22" height="18"/><rect x="246" y="58" width="28" height="24"/></g>
    <g fill="#b3502f">
      <path d="M148 62 L163 52 L178 62 Z"/><path d="M180 56 L197 44 L214 56 Z"/>
      <path d="M216 64 L229 55 L242 64 Z"/><path d="M244 58 L260 47 L276 58 Z"/></g>
    <rect x="290" y="52" width="46" height="30" fill="#9a9184"/>
    <rect x="310" y="24" width="2.5" height="28" fill="#3a2a18"/>
    <rect x="312" y="24" width="18" height="6" fill="${natie.vlag[0]}"/>
    <rect x="312" y="30" width="18" height="6" fill="${natie.vlag[1]}"/>
    <rect x="312" y="36" width="18" height="6" fill="${natie.vlag[2]}"/>
    <g stroke="#2a1d10" stroke-width="2" fill="none">
      <path d="M40 82 L40 30 M40 30 L74 44 L40 52"/><path d="M100 82 L100 40 M100 40 L70 52 L100 58"/></g>
    <path d="M18 82 q22 -10 44 0 l-8 12 q-14 5 -28 0 Z" fill="#5c4324"/>
    <path d="M82 82 q20 -9 40 0 l-7 11 q-13 5 -26 0 Z" fill="#4a3520"/>
  </svg>`;
  return d;
}

// --- Kroeg ----------------------------------------------------------------

function kroeg(stad, ouder) {
  const s = Game.speler;
  const scherm = UI.toonScherm({
    titel: 'De kroeg',
    onder: `${stad.naam} · rokerig, luidruchtig en vol nieuws`,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('kroegbaas'));
      const p = el('p', 'verhaal');
      p.innerHTML =
        `De waard veegt een kroes af. "Wat wordt het, kapitein? Volk, drank of nieuws?"` +
        `<br><small>Goud in het ruim: <b>${fmtGold(s.goud)}</b> · bemanning <b>${s.bemanning}</b> van ${vlootBemanningMax(s)}</small>`;
      body.appendChild(p);
      if (sch._bericht) {
        const b = el('p', 'kroeg-bericht');
        b.innerHTML = sch._bericht;
        body.appendChild(b);
      }
    },
    knoppen: (sch) => {
      const beschikbaar = beschikbaarVolk(stad, s);
      const prijs = huurPrijs(stad, s);
      return [
        {
          label: `Volk aanmonsteren (${beschikbaar} man · ${fmtGold(prijs)} p.p.)`,
          uit: beschikbaar <= 0,
          actie: () => monsterAan(stad, sch, beschikbaar, prijs),
        },
        { label: 'Een rondje geven (100 goud)', uit: s.goud < 100, actie: () => rondjeGeven(stad, sch) },
        { label: 'De buit verdelen', uit: s.goud <= 0, actie: () => { sch.sluit(); verdeelBuit(stad, ouder); } },
        { label: 'Rondkijken naar vreemd volk', actie: () => vreemdeling(stad, sch) },
        { label: 'Terug', actie: () => sch.sluit() },
      ];
    },
  });
  return scherm;
}

function beschikbaarVolk(stad, s) {
  const ruimte = vlootBemanningMax(s) - s.bemanning;
  const aanbod = Math.round(
    stad.grootte * 14 * (0.5 + s.roem / 400) * (1 + 0.35 * talentBonus(s, 'charme')) *
      (stad.soort === 'roversnest' ? 1.8 : 1)
  );
  return clamp(Math.min(ruimte, aanbod), 0, 400);
}

function huurPrijs(stad, s) {
  return Math.round(lerp(42, 24, clamp(s.roem / 300, 0, 1)) * (talentBonus(s, 'charme') ? 0.8 : 1));
}

function monsterAan(stad, sch, beschikbaar, prijs) {
  const s = Game.speler;
  const betaalbaar = Math.floor(s.goud / prijs);
  const n = Math.min(beschikbaar, betaalbaar);
  if (n <= 0) {
    sch._bericht = 'Je hebt niet genoeg goud om ook maar één man te betalen.';
    audio.sfx.fout();
    sch.ververs();
    return;
  }
  s.goud -= n * prijs;
  s.bemanning += n;
  s.moraal = clamp(s.moraal + 3, 0, 100);
  audio.sfx.munt();
  sch._bericht = `<b>${n} man</b> tekent bij voor ${fmtGold(n * prijs)} goudstukken.`;
  sch.ververs();
}

function rondjeGeven(stad, sch) {
  const s = Game.speler;
  s.goud -= 100;
  s.moraal = clamp(s.moraal + 6, 0, 100);
  audio.sfx.munt();
  const w = Game.wereld;
  const sjabloon = pick(rng, GERUCHTEN);
  const tekst = sjabloon
    .replace('{stad}', pick(rng, w.steden).naam)
    .replace('{waar}', pick(rng, WAREN).naam.toLowerCase())
    .replace('{kapitein}', pick(rng, KAPITEIN_NAMEN));
  sch._bericht = `De kroeg juicht. Iemand mompelt: "${tekst}"`;
  sch.ververs();
}

async function vreemdeling(stad, sch) {
  const s = Game.speler;
  const rol = rng();
  if (rol < 0.32) {
    const prijs = 300 + Math.round(rng() * 700);
    const koop = await UI.vraag(
      'Een havelozen man in de hoek',
      `Hij schuift een gerafeld stuk perkament over de tafel. "De helft van een schatkaart, kapitein. ` +
        `Voor ${fmtGold(prijs)} goudstukken is-ie van u."`,
      [
        { label: `Kopen (${fmtGold(prijs)})`, waarde: true, uit: s.goud < prijs },
        { label: 'Laten liggen', waarde: false },
      ],
      { figuur: 'zeeman' }
    );
    if (koop) {
      s.goud -= prijs;
      s.schatkaarten++;
      audio.sfx.munt();
      sch._bericht = `Je bezit nu <b>${s.schatkaarten}</b> stukken van een schatkaart. Bij vier kun je gaan graven.`;
      if (s.schatkaarten >= 4) {
        s.schatkaarten -= 4;
        const buit = Math.round(4000 + rng() * 9000);
        s.goud += buit;
        audio.sfx.fanfare();
        sch._bericht = `De vier stukken passen! Op een naamloos eiland graaf je <b>${fmtGold(buit)} goudstukken</b> op.`;
        s.roem += 20;
      }
      sch.ververs();
    }
  } else if (rol < 0.6) {
    const doelStad = pick(rng, Game.wereld.steden.filter((x) => x !== stad));
    sch._bericht =
      `Een oude stuurman fluistert: "In <b>${doelStad.naam}</b> ligt ` +
      `${pick(rng, WAREN).naam.toLowerCase()} voor een schijntje. Vaar erheen voor het rondgaat."`;
    sch.ververs();
  } else if (rol < 0.78 && s.bemanning > 20) {
    const n = Math.round(s.bemanning * 0.12);
    s.bemanning -= n;
    s.moraal = clamp(s.moraal - 4, 0, 100);
    sch._bericht = `<b>${n} man</b> is aan de rum gebleven en niet meer aan boord verschenen.`;
    audio.sfx.fout();
    sch.ververs();
  } else {
    sch._bericht = 'Niemand die vandaag iets te vertellen heeft. Alleen drank en dobbelstenen.';
    sch.ververs();
  }
}

function verdeelBuit(stad, ouder) {
  const s = Game.speler;
  const rangDeel = s.rang[stad.natie] * 0.02;
  const roemDeel = clamp(s.roem / 1200, 0, 0.18);
  const kapiteinsdeel = clamp(0.35 + rangDeel + roemDeel + (talentBonus(s, 'charme') ? 0.05 : 0), 0.2, 0.72);
  const totaal = s.goud;
  const mijn = Math.round(totaal * kapiteinsdeel);
  const perMan = Math.max(0, Math.round((totaal - mijn) / Math.max(1, s.bemanning)));

  UI.toonScherm({
    titel: 'De buit verdelen',
    onder: `${stad.naam}, ${fmtDate(s.dag)}`,
    bouw(body) {
      body.appendChild(UI.maakFiguur('kroegbaas'));
      const p = el('p', 'verhaal');
      p.innerHTML =
        'Op het achterdek wordt de kist geopend. Iedere man kijkt mee terwijl de schrijver de delen afroept.';
      body.appendChild(p);
      body.appendChild(
        UI.tabel(
          [{ label: 'Post' }, { label: 'Goudstukken', rechts: true }],
          [
            { cellen: [{ tekst: 'Totale buit' }, { tekst: fmtGold(totaal), klasse: 'rechts' }] },
            {
              cellen: [
                { html: `Jouw deel (${Math.round(kapiteinsdeel * 100)}%)` },
                { html: `<b>${fmtGold(mijn)}</b>`, klasse: 'rechts' },
              ],
            },
            { cellen: [{ tekst: `Per bemanningslid (${s.bemanning} man)` }, { tekst: fmtGold(perMan), klasse: 'rechts' }] },
          ]
        )
      );
      const waarschuwing = el('p', 'waarschuwing');
      waarschuwing.innerHTML =
        'Na de verdeling gaan de meeste mannen van boord om hun deel te verbrassen. ' +
        'Je houdt een kern over en moet opnieuw aanmonsteren.';
      body.appendChild(waarschuwing);
    },
    knoppen: (sch) => [
      {
        label: 'Verdelen',
        actie: () => {
          s.gespaard += mijn;
          s.goud = 0;
          s.bemanning = Math.max(12, Math.round(s.bemanning * 0.4));
          s.moraal = 85;
          s.laatsteVerdeling = s.dag;
          s.roem += Math.round(totaal / 3000);
          audio.sfx.munt();
          Game.melding(`Je bergt ${fmtGold(mijn)} goudstukken op in je eigen kist.`);
          sch.sluit();
          ouder.ververs();
        },
      },
      { label: 'Toch maar niet', actie: () => { sch.sluit(); ouder.ververs(); } },
    ],
  });
}

// --- Handel ---------------------------------------------------------------

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
            { label: 'Waar' },
            { label: 'Prijs', rechts: true },
            { label: 'Voorraad', rechts: true },
            { label: 'In ruim', rechts: true },
            { label: 'Kopen / verkopen' },
          ],
          rijen
        )
      );

      const uitleg = el('p', 'kleintje');
      uitleg.innerHTML =
        'Plantagesteden verkopen suiker, tabak en katoen goedkoop; forten en schatkamers betalen goed voor voedsel en handelswaar. ' +
        '<span class="goedkoop">Groen</span> = koopje, <span class="duur">rood</span> = hoge prijs.';
      body.appendChild(uitleg);
    },
    knoppen: (sch) => [{ label: 'Terug', actie: () => { sch.sluit(); ouder.ververs(); } }],
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

// --- Scheepswerf ----------------------------------------------------------

function werf(stad, ouder) {
  const s = Game.speler;

  const scherm = UI.toonScherm({
    titel: 'De scheepswerf',
    onder: `${stad.naam} · teer, hennep en zaagsel`,
    breed: true,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('timmerman'));
      const p = el('p', 'verhaal');
      p.innerHTML = `De baas van de werf neemt je vloot op. "Er valt genoeg te doen, kapitein." <br><small>Goud: <b>${fmtGold(s.goud)}</b></small>`;
      body.appendChild(p);
      if (sch._bericht) {
        const b = el('p', 'kroeg-bericht');
        b.innerHTML = sch._bericht;
        body.appendChild(b);
      }

      // Eigen vloot.
      const eigen = el('div', 'werf-blok');
      eigen.innerHTML = '<h3>Jouw vloot</h3>';
      for (let i = 0; i < s.schepen.length; i++) {
        const sh = s.schepen[i];
        const t = SCHIP_INDEX[sh.type];
        const rij = el('div', 'werf-rij');
        const kosten = herstelKosten(sh);
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}${i === 0 ? ' <em>(vlaggenschip)</em>' : ''}</span>` +
          `<span class="werf-stat">romp ${Math.round(sh.romp)}/${sh.maxRomp} · ${sh.kanonnen}/${t.kanonnen} kanon</span>`;
        const acties = el('div', 'werf-acties');

        const herstel = el('button', 'mini', kosten > 0 ? `Herstellen (${fmtGold(kosten)})` : 'Gaaf');
        herstel.disabled = kosten <= 0 || s.goud < kosten;
        herstel.onclick = () => {
          s.goud -= kosten;
          sh.romp = sh.maxRomp;
          audio.sfx.munt();
          sch._bericht = `${metLidwoord(sh.type, true)} is weer helemaal zeewaardig.`;
          sch.ververs();
        };
        acties.appendChild(herstel);

        const kanonPrijs = 480;
        const kanon = el('button', 'mini', `+1 kanon (${fmtGold(kanonPrijs)})`);
        kanon.disabled = sh.kanonnen >= t.kanonnen || s.goud < kanonPrijs || (i === 0 && ruimVrij(sh) < 2);
        kanon.onclick = () => {
          s.goud -= kanonPrijs;
          sh.kanonnen++;
          audio.sfx.munt();
          sch._bericht = 'Er wordt een extra stuk geschut aan boord gehesen.';
          sch.ververs();
        };
        acties.appendChild(kanon);

        if (i > 0) {
          const verkoop = el('button', 'mini rood', `Verkopen (${fmtGold(scheepsWaarde(sh))})`);
          verkoop.onclick = () => {
            s.goud += scheepsWaarde(sh);
            s.schepen.splice(i, 1);
            audio.sfx.munt();
            sch._bericht = `${metLidwoord(sh.type, true)} is van de hand gedaan.`;
            sch.ververs();
          };
          acties.appendChild(verkoop);

          const vlag = el('button', 'mini', 'Tot vlaggenschip maken');
          vlag.onclick = () => {
            const oud = s.schepen[0];
            s.schepen[0] = sh;
            s.schepen[i] = oud;
            // De lading verhuist mee voor zover het ruim het toelaat.
            sch._bericht = `Je hijst je vlag op ${metLidwoord(sh.type)}.`;
            sch.ververs();
          };
          acties.appendChild(vlag);
        }
        rij.appendChild(acties);
        eigen.appendChild(rij);
      }
      body.appendChild(eigen);

      // Te koop.
      const markt = el('div', 'werf-blok');
      markt.innerHTML = '<h3>Te koop op de helling</h3>';
      for (const t of teKoop(stad)) {
        const rij = el('div', 'werf-rij');
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}</span>` +
          `<span class="werf-stat">romp ${t.romp} · ${t.kanonnen} kanon · ruim ${t.ruim} · ${t.bemanning} koppen</span>`;
        const acties = el('div', 'werf-acties');
        const prijs = Math.round(t.prijs * (1.25 - stad.grootte * 0.04));
        const koop = el('button', 'mini', `Kopen (${fmtGold(prijs)})`);
        koop.disabled = s.goud < prijs || s.schepen.length >= 8;
        koop.onclick = () => {
          s.goud -= prijs;
          s.schepen.push(nieuwSchip(t.id));
          audio.sfx.fanfare();
          sch._bericht = `Een gloednieuwe ${t.naam.toLowerCase()} ligt klaar aan de kade.`;
          sch.ververs();
        };
        acties.appendChild(koop);
        rij.appendChild(acties);
        markt.appendChild(rij);
      }
      body.appendChild(markt);
    },
    knoppen: (sch) => [{ label: 'Terug', actie: () => { sch.sluit(); ouder.ververs(); } }],
  });
  return scherm;
}

function herstelKosten(schip) {
  return Math.round((schip.maxRomp - schip.romp) * 26);
}

function scheepsWaarde(schip) {
  const t = SCHIP_INDEX[schip.type];
  return Math.round(t.prijs * 0.45 * clamp(schip.romp / t.romp, 0.2, 1));
}

function teKoop(stad) {
  // Grotere steden bieden zwaardere schepen aan.
  const max = stad.grootte;
  const lijst = SCHEPEN.filter((t) => {
    if (t.prijs > 3000 + max * 5000) return false;
    if (stad.soort === 'roversnest' && t.ruim > 200) return false;
    return true;
  });
  // Vaste, per stad herhaalbare selectie zodat het aanbod niet elke keer wisselt.
  const r = makeRng(stad.id * 7919 + 13);
  const uit = [];
  const kopie = [...lijst];
  const n = Math.min(kopie.length, 2 + max);
  for (let i = 0; i < n; i++) {
    uit.push(kopie.splice(Math.floor(r() * kopie.length), 1)[0]);
  }
  return uit.sort((a, b) => a.prijs - b.prijs);
}

// --- Gouverneur -----------------------------------------------------------

function gouverneur(stad, ouder) {
  const s = Game.speler;
  const natie = NATIES[stad.natie];
  const rel = s.relatie[stad.natie];

  const scherm = UI.toonScherm({
    titel: `Het gouvernement van ${stad.naam}`,
    onder: `${natie.naam} · verhouding: ${relatieWoord(rel)}`,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('gouverneur'));
      const p = el('p', 'verhaal');
      p.innerHTML = sch._bericht || begroeting(stad, rel);
      body.appendChild(p);

      const st = el('div', 'haven-info');
      st.innerHTML =
        `<span>Jouw rang</span><b>${s.rang[stad.natie] > 0 ? RANGEN[clamp(s.rang[stad.natie], 0, RANGEN.length - 1)].naam : 'geen'}</b>` +
        `<span>Land van ${natie.naam}</span><b>${s.land[stad.natie]} hectare</b>` +
        `<span>Roem</span><b>${Math.round(s.roem)}</b>` +
        `<span>Eigen spaargeld</span><b>${fmtGold(s.gespaard)}</b>`;
      body.appendChild(st);
    },
    knoppen: (sch) => {
      const knoppen = [];
      const volgende = RANGEN[clamp(s.rang[stad.natie] + 1, 0, RANGEN.length - 1)];
      const verdiend = verdienstePunten(s, stad.natie);
      if (rel > -25) {
        knoppen.push({
          label: `Om bevordering vragen (${Math.round(verdiend)} / ${volgende.drempel})`,
          uit: verdiend < volgende.drempel || s.rang[stad.natie] >= RANGEN.length - 1,
          actie: () => bevordering(stad, sch),
        });
        knoppen.push({ label: 'De dochter van de gouverneur groeten', actie: () => dochter(stad, sch) });
      }
      if (s.natie !== stad.natie && rel > -10) {
        knoppen.push({ label: `In dienst treden van ${natie.naam}`, actie: () => kaperbrief(stad, sch) });
      }
      if (rel > -25 && s.rang[stad.natie] >= 2) {
        knoppen.push({ label: 'Aftreden en gaan rentenieren', soort: 'gevaar', actie: () => tredAf(stad) });
      }
      if (rel <= -25) {
        knoppen.push({ label: 'Om gratie verzoeken (5.000 goud)', uit: s.gespaard < 5000, actie: () => gratie(stad, sch) });
      }
      knoppen.push({ label: 'Terug', actie: () => { sch.sluit(); ouder.ververs(); } });
      return knoppen;
    },
  });
  return scherm;
}

function begroeting(stad, rel) {
  const natie = NATIES[stad.natie];
  if (rel > 50) return `"Kapitein! Kom binnen, kom binnen. ${natie.naam} heeft geen trouwer dienaar op zee."`;
  if (rel > 15) return '"Uw naam is hier bekend, en niet in slechte zin. Wat kan ik voor u doen?"';
  if (rel > -25) return '"Ik ken u van naam. Zolang u de vlag niet in verlegenheid brengt, bent u welkom."';
  return '"U staat op mijn lijst, kapitein. Wees voorzichtig met wat u hier vraagt."';
}

/** Verdienste telt buit, veroveringen en roem in dienst van deze natie. */
function verdienstePunten(s, natie) {
  return s.gespaard * 0.6 + s.roem * 90 + s.veroverdeSteden * 4000 + clamp(s.relatie[natie], 0, 100) * 90;
}

async function bevordering(stad, sch) {
  const s = Game.speler;
  s.rang[stad.natie] = clamp(s.rang[stad.natie] + 1, 0, RANGEN.length - 1);
  const rang = RANGEN[s.rang[stad.natie]];
  s.land[stad.natie] += rang.land;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 10, -100, 100);
  s.roem += 15;
  audio.sfx.fanfare();
  await UI.vraag(
    'Bevordering',
    `De gouverneur laat een oorkonde halen. "Bij deze bent u <b>${rang.naam}</b> in dienst van ` +
      `${NATIES[stad.natie].naam}, met ${rang.land} hectare land rond ${stad.naam}."`,
    [{ label: 'Buigen', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  sch._bericht = `"${rang.naam}, het staat u goed."`;
  sch.ververs();
}

async function dochter(stad, sch) {
  const s = Game.speler;
  const r = makeRng(stad.id * 104729 + Math.floor(s.dag / 90));
  const naam = `${VOORNAMEN_V[Math.floor(r() * VOORNAMEN_V.length)]} ${ACHTERNAMEN[Math.floor(r() * ACHTERNAMEN.length)]}`;
  const charme = clamp(
    0.2 + s.rang[stad.natie] * 0.09 + clamp(s.roem / 400, 0, 0.3) + (talentBonus(s, 'charme') ? 0.2 : 0) +
      clamp(s.gespaard / 200000, 0, 0.15),
    0.05,
    0.95
  );

  const keuze = await UI.vraag(
    `${naam}`,
    `Aan de rand van de balzaal staat de dochter van de gouverneur. ` +
      `"Men zegt dat u de zee kent als geen ander, kapitein. Vertel eens iets waars."`,
    [
      { label: 'Een verhaal over de storm bij Kaap Tiburón', waarde: 'verhaal' },
      { label: 'Een compliment, kort en raak', waarde: 'compliment' },
      { label: 'Zwijgen en buigen', waarde: 'buigen' },
    ],
    { figuur: 'dame' }
  );

  const bonus = keuze === 'verhaal' ? 0.1 : keuze === 'compliment' ? 0.05 : -0.05;
  if (Math.random() < charme + bonus) {
    s.roem += 6;
    s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 4, -100, 100);
    if (!s.gehuwd && s.rang[stad.natie] >= 4 && Math.random() < 0.4) {
      const ja = await UI.vraag(
        'Een huwelijksaanzoek',
        `${naam} kijkt je lang aan. "Mijn vader zou het goedvinden, weet u." Vraag je haar ten huwelijk?`,
        [
          { label: 'Ja', waarde: true },
          { label: 'De zee roept', waarde: false },
        ],
        { figuur: 'dame' }
      );
      if (ja) {
        s.gehuwd = naam;
        s.roem += 40;
        audio.sfx.fanfare();
        sch._bericht = `Je bent getrouwd met <b>${naam}</b>. Half ${stad.naam} was op de bruiloft.`;
        sch.ververs();
        return;
      }
    }
    sch._bericht = `${naam} lacht. "Kom nog eens langs, kapitein."`;
  } else {
    s.roem = Math.max(0, s.roem - 2);
    sch._bericht = `${naam} verontschuldigt zich beleefd en verdwijnt tussen de gasten.`;
  }
  sch.ververs();
}

async function kaperbrief(stad, sch) {
  const s = Game.speler;
  const ja = await UI.vraag(
    'Een kaperbrief',
    `De gouverneur schuift een document naar voren. "Vaar onder onze vlag, kapitein. ` +
      `Maar weet: uw oude beschermheer zal het u niet in dank afnemen."`,
    [
      { label: `Tekenen voor ${NATIES[stad.natie].naam}`, waarde: true },
      { label: 'Nog even niet', waarde: false },
    ],
    { figuur: 'gouverneur' }
  );
  if (!ja) return;
  const oud = s.natie;
  s.natie = stad.natie;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 20, -100, 100);
  if (oud !== stad.natie) s.relatie[oud] = clamp(s.relatie[oud] - 25, -100, 100);
  if (s.rang[stad.natie] < 1) s.rang[stad.natie] = 1;
  audio.sfx.fanfare();
  sch._bericht = `Je vaart nu onder de vlag van <b>${NATIES[stad.natie].naam}</b>.`;
  sch.ververs();
}

async function gratie(stad, sch) {
  const s = Game.speler;
  s.gespaard -= 5000;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 45, -100, 100);
  audio.sfx.munt();
  await UI.vraag(
    'Gratie',
    'Er wordt een som gestort, een handtekening gezet en een register bijgewerkt. ' +
      'Officieel is er nooit iets gebeurd.',
    [{ label: 'Zo hoort het', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  sch._bericht = 'Je naam is van de lijst geschrapt.';
  sch.ververs();
}

// --- Stadsbestorming ------------------------------------------------------

async function bestormStad(stad, opVertrek) {
  const s = Game.speler;
  const garnizoen = Math.round(stad.garnizoen);
  const kans = clamp(
    0.5 + (s.bemanning - garnizoen) / Math.max(30, garnizoen * 1.8) + (s.moraal - 50) / 260,
    0.05,
    0.95
  );

  const ja = await UI.vraag(
    `${stad.naam} bestormen`,
    `Je zet ${s.bemanning} man aan land tegen een garnizoen van ongeveer ${garnizoen}. ` +
      `De stuurman schat de kans op ongeveer <b>${Math.round(kans * 100)}%</b>.` +
      (s.moraal < 40 ? '<br><b>De bemanning is niet in de stemming voor een bestorming.</b>' : ''),
    [
      { label: 'Aanvallen!', waarde: true, soort: 'gevaar' },
      { label: 'Terug aan boord', waarde: false },
    ],
    { figuur: 'zeeman' }
  );
  if (!ja) {
    opVertrek();
    return;
  }

  const verliezen = Math.round(s.bemanning * lerp(0.32, 0.1, kans) * (0.6 + Math.random() * 0.8));
  s.bemanning = Math.max(1, s.bemanning - verliezen);
  stad.garnizoen = Math.max(0, stad.garnizoen - Math.round(garnizoen * (0.3 + Math.random() * 0.5)));

  if (Math.random() > kans) {
    s.moraal = clamp(s.moraal - 20, 0, 100);
    await UI.vraag(
      'Teruggeslagen',
      `Het musketvuur vanaf de wallen is te zwaar. Je verliest <b>${verliezen} man</b> en trekt je terug naar de sloepen.`,
      [{ label: 'Terug aan boord', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
    s.relatie[stad.natie] = clamp(s.relatie[stad.natie] - 20, -100, 100);
    opVertrek();
    return;
  }

  await UI.vraag(
    'Door de poort',
    `Je stormt over de wal — <b>${verliezen} man</b> blijft achter. In het gouvernementshuis ` +
      'wacht de bevelhebber van het garnizoen met getrokken degen.',
    [{ label: 'Op hem af', waarde: 'ok', soort: 'gevaar' }],
    { figuur: 'zeeman' }
  );

  const zeilScene = Game.scene;
  Game.zetScene(
    maakDuel({
      tegenstander: pick(rng, KAPITEIN_NAMEN),
      natie: stad.natie,
      vaardigheid: clamp(0.3 + stad.grootte * 0.11, 0.2, 0.92),
      voordeel: clamp(s.bemanning / Math.max(10, garnizoen), 0.5, 2.2),
      terug(gewonnen) {
        Game.zetScene(zeilScene);
        if (gewonnen) veroverStad(stad, opVertrek);
        else {
          s.moraal = clamp(s.moraal - 25, 0, 100);
          s.bemanning = Math.max(1, Math.round(s.bemanning * 0.6));
          s.relatie[stad.natie] = clamp(s.relatie[stad.natie] - 20, -100, 100);
          Game.melding('De bestorming is stukgelopen op de bevelhebber.', 'rood');
          opVertrek();
        }
      },
    })
  );
}

async function veroverStad(stad, opVertrek) {
  const s = Game.speler;
  const moeilijk = MOEILIJKHEDEN.find((m) => m.id === s.moeilijkheid) || MOEILIJKHEDEN[1];
  const schat = Math.round(
    (stad.bevolking * 0.9 + stad.grootte * 2200) * stad.welvaart * (1 / clamp(moeilijk.mult, 0.5, 2.2)) *
      (stad.soort === 'schatkamer' ? 2.2 : 1)
  );
  const oudeNatie = stad.natie;

  audio.sfx.fanfare();
  const keuze = await UI.vraag(
    `${stad.naam} is gevallen`,
    `De kist van de schatkamer levert <b>${fmtGold(schat)} goudstukken</b> op. ` +
      'Wat doe je met de stad zelf?',
    [
      { label: `Overdragen aan ${NATIES[s.natie].naam}`, waarde: 'geef' },
      { label: 'Onder eigen vlag houden', waarde: 'hou' },
      { label: 'Plunderen en verlaten', waarde: 'plunder', soort: 'gevaar' },
    ],
    { figuur: 'zeeman' }
  );

  s.goud += schat;
  s.veroverdeSteden++;
  s.roem += 45;
  s.moraal = clamp(s.moraal + 18, 0, 100);
  s.relatie[oudeNatie] = clamp(s.relatie[oudeNatie] - 35, -100, 100);

  if (keuze === 'geef') {
    stad.natie = s.natie;
    stad.garnizoen = 30 + stad.grootte * 12;
    s.relatie[s.natie] = clamp(s.relatie[s.natie] + 30, -100, 100);
    Game.melding(`${stad.naam} vaart nu onder de vlag van ${NATIES[s.natie].naam}.`);
  } else if (keuze === 'hou') {
    stad.natie = 'piraat';
    stad.garnizoen = 20 + stad.grootte * 8;
    Game.melding(`${stad.naam} is nu een vrijhaven.`);
  } else {
    s.goud += Math.round(schat * 0.5);
    stad.bevolking = Math.round(stad.bevolking * 0.6);
    stad.welvaart *= 0.7;
    stad.garnizoen = 10;
    for (const n of NATIE_IDS) s.relatie[n] = clamp(s.relatie[n] - 6, -100, 100);
    Game.melding(`${stad.naam} is kaalgeplukt.`, 'rood');
  }

  opVertrek();
}

// --- Aftreden -------------------------------------------------------------

export async function tredAf(stad) {
  const s = Game.speler;
  const zeker = await UI.vraag(
    'Het commando neerleggen?',
    'Wie aftreedt, vaart niet meer uit. Je vermogen, je land en je rang worden geteld — ' +
      'en dat wordt je eindscore.',
    [
      { label: 'Ja, ik heb genoeg gezien', waarde: true, soort: 'gevaar' },
      { label: 'Nog één reis', waarde: false },
    ],
    { figuur: 'gouverneur' }
  );
  if (!zeker) return;

  const score = berekenScore(s);
  s.gestopt = true;
  const jaren = Math.max(1, Math.floor(s.leeftijd - s.startLeeftijd));
  const hectare = Object.values(s.land).reduce((a, b) => a + b, 0);
  const hoogsteRang = Object.keys(s.rang).reduce((a, b) => (s.rang[b] > s.rang[a] ? b : a), NATIE_IDS[0]);

  UI.sluitAlles();
  UI.toonScherm({
    titel: 'Het einde van een loopbaan',
    onder: `${stad.naam}, ${fmtDate(s.dag)}`,
    bouw(body) {
      body.appendChild(UI.maakFiguur('gouverneur'));
      const p = el('p', 'verhaal');
      p.innerHTML =
        `Na <b>${jaren} jaar</b> op zee legt kapitein <b>${s.naam}</b> het commando neer ` +
        `en betrekt ${s.gehuwd ? `samen met ${s.gehuwd} ` : ''}een huis met uitzicht ` +
        `op de rede van ${stad.naam}.`;
      body.appendChild(p);
      body.appendChild(
        UI.tabel(
          [{ label: 'Nalatenschap' }, { label: '', rechts: true }],
          [
            { cellen: [{ tekst: 'Vermogen' }, { tekst: fmtGold(s.gespaard) + ' goudstukken', klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Grondbezit' }, { tekst: hectare + ' hectare', klasse: 'rechts' }] },
            {
              cellen: [
                { tekst: 'Hoogste rang' },
                {
                  tekst: `${RANGEN[clamp(s.rang[hoogsteRang], 0, RANGEN.length - 1)].naam} (${NATIES[hoogsteRang].naam})`,
                  klasse: 'rechts',
                },
              ],
            },
            { cellen: [{ tekst: 'Veroverde steden' }, { tekst: String(s.veroverdeSteden), klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Verslagen schepen' }, { tekst: String(s.verslagenSchepen), klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Roem' }, { tekst: String(Math.round(s.roem)), klasse: 'rechts' }] },
            { cellen: [{ html: '<b>Eindscore</b>' }, { html: `<b>${score}</b>`, klasse: 'rechts' }] },
          ]
        )
      );
    },
    knoppen: () => [{ label: 'Een nieuw avontuur beginnen', actie: () => window.location.reload() }],
  });
  audio.sfx.fanfare();
}

function relatieWoord(v) {
  if (v <= -60) return 'op leven en dood';
  if (v <= -25) return 'vijandig';
  if (v < 15) return 'koel';
  if (v < 50) return 'vriendelijk';
  return 'bondgenoot';
}

export { relatieWoord };
