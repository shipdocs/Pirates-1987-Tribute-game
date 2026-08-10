// Afgesplitst van town.js: de gouverneur — rang, dochter, kaperbrief en gratie.
import { Game, talentBonus } from '../game.js';
import { NATIES, RANGEN, VOORNAMEN_V, ACHTERNAMEN } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, fmtGold, el, makeRng } from '../util.js';
import { relatieWoord } from './relatie.js';

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
        `<span>Eigen kist</span><b>${fmtGold(s.gespaard)}</b>`;
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
        if (s.opdracht && s.opdracht.natie === stad.natie && s.opdracht.stad === stad.naam) {
          knoppen.push({
            label: `${UI.ikoon('opdracht')}Van de opdracht verslag doen`,
            actie: () => rapporteerOpdracht(stad, sch),
          });
        } else if (!s.opdracht) {
          knoppen.push({ label: `${UI.ikoon('opdracht')}Naar een opdracht vragen`, actie: () => vraagOpdracht(stad, sch) });
        }
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
      knoppen.push({ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } });
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
    0.2 + s.rang[stad.natie] * 0.09 + clamp(s.roem / 400, 0, 0.3) + (talentBonus(s, 'gladde_tong') ? 0.2 : 0) +
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

export { gouverneur, begroeting, verdienstePunten, bevordering, dochter, kaperbrief, gratie };
