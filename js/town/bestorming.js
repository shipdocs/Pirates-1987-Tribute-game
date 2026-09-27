// Afgesplitst van town.js: de stadsbestorming, van de aanval tot de verovering.
import { Game, vlaggenschip } from '../game.js';
import { MOEILIJKHEDEN, NATIES, NATIE_IDS, KAPITEIN_NAMEN } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, lerp, fmtGold, pick } from '../util.js';
import { maakDuel } from '../duel.js';
import { verstrijkDagen } from '../anker.js';

const rng = Math.random;

/**
 * Eerste keuze bij een aanval: rechtstreeks bestormen (het oude, ongewijzigde
 * gedrag), eerst het garnizoen vanaf zee verzwakken, of belegeren. Beide
 * nieuwe wegen verzwakken alleen `stad.garnizoen` — dat voedt zowel de
 * kansworp als de duel-parameters in `voerBestorming()` toch al, dus geen
 * dubbele bedrading nodig. Geen tweede gevechtsengine: de bestaande
 * bestorming + duel blijft de kern, dit voegt er alleen keuzes vóór aan toe.
 */
async function bestormStad(stad, opVertrek) {
  const s = Game.speler;
  const garnizoen = Math.round(stad.garnizoen);
  const totaalGeschut = s.schepen.reduce((a, sc) => a + sc.geschut, 0);
  const drempel = Math.ceil(garnizoen * 0.35);

  const keuze = await UI.vraag(
    `${stad.naam} aanpakken`,
    `Het garnizoen wordt geschat op ongeveer ${garnizoen} man. Hoe wil je te werk gaan?`,
    [
      { label: 'Rechtstreeks bestormen', waarde: 'storm' },
      {
        label: `Eerst beschieten vanaf zee (minstens ${drempel} stukken)`,
        waarde: 'beschiet',
        uit: totaalGeschut < drempel,
      },
      { label: 'Belegeren (5 dagen)', waarde: 'beleg' },
      { label: 'Terug aan boord', waarde: 'terug', esc: true },
    ],
    { figuur: 'zeeman' }
  );

  if (keuze === 'beschiet') return beschietStad(stad, opVertrek, totaalGeschut);
  if (keuze === 'beleg') return belegerStad(stad, opVertrek);
  if (keuze === 'storm') return voerBestorming(stad, opVertrek);
  opVertrek();
}

/**
 * Beschieten vanaf zee: kost weinig tijd, verzwakt het garnizoen naar rato
 * van de eigen vloot-vuurkracht, met een kans op tegenvuurschade aan het
 * vlaggenschip.
 */
async function beschietStad(stad, opVertrek, totaalGeschut) {
  const s = Game.speler;
  // Vóór de tijdsprong vastleggen: economieTik (via verstrijkDagen) laat elk
  // garnizoen ondertussen ook weer aangroeien, en die aangroei mag de
  // beschieting niet tenietdoen — de reductie geldt t.o.v. het garnizoen zoals
  // het was toen de lading werd afgevuurd.
  const garnizoen = Math.round(stad.garnizoen);
  const factor = clamp(totaalGeschut / (garnizoen * 1.6), 0.15, 1);
  const nieuwGarnizoen = Math.max(6, Math.round(garnizoen * lerp(0.85, 0.5, factor)));

  verstrijkDagen(0.4);
  stad.garnizoen = nieuwGarnizoen;

  let schadeTekst = '';
  if (Math.random() < 0.4) {
    const eigen = vlaggenschip(s);
    const schade = Math.max(1, Math.round(eigen.maxRomp * (0.05 + Math.random() * 0.07)));
    eigen.romp = Math.max(10, eigen.romp - schade);
    schadeTekst = ' De wal schiet terug — je vlaggenschip loopt schade op.';
  }

  await UI.vraag(
    'Beschieting',
    `Je haalt de kust binnen dracht en geeft er een aantal lagen van langs. ` +
      `Het garnizoen is geslonken tot ongeveer <b>${Math.round(stad.garnizoen)}</b> man.${schadeTekst}`,
    [{ label: 'Aan land gaan', waarde: 'ok', soort: 'gevaar' }],
    { figuur: 'zeeman' }
  );

  return bestormStad(stad, opVertrek);
}

/**
 * Belegeren: traag maar veilig — geen scheepsschade, wel geest-tol voor de
 * verveling van een blokkade. Een verzwakt-maar-niet-veroverd garnizoen heelt
 * vanzelf via de bestaande `economieTik`-aangroei, dus een beleg dat je niet
 * afmaakt is geen verspilde moeite als je later terugkeert.
 */
async function belegerStad(stad, opVertrek) {
  const s = Game.speler;
  // Zelfde reden als bij beschietStad: reken de verzwakking uit vóór
  // verstrijkDagen() dit garnizoen ook weer laat aangroeien.
  const nieuwGarnizoen = Math.max(6, Math.round(stad.garnizoen * 0.82));

  verstrijkDagen(5);
  stad.garnizoen = nieuwGarnizoen;
  s.geest = clamp(s.geest - 10, 0, 100);

  await UI.vraag(
    'Beleg',
    `Vijf dagen voor de kust snijdt de aanvoer af. Het garnizoen is geslonken tot ` +
      `ongeveer <b>${Math.round(stad.garnizoen)}</b> man, maar het wachten hangt het scheepsvolk de keel uit.`,
    [{ label: 'Aan land gaan', waarde: 'ok', soort: 'gevaar' }],
    { figuur: 'zeeman' }
  );

  return bestormStad(stad, opVertrek);
}

/** De oorspronkelijke bestorming: kansworp, aanval, duel tegen de bevelhebber. */
async function voerBestorming(stad, opVertrek) {
  const s = Game.speler;
  const garnizoen = Math.round(stad.garnizoen);
  const kans = clamp(
    0.5 + (s.scheepsvolk - garnizoen) / Math.max(30, garnizoen * 1.8) + (s.geest - 50) / 260,
    0.05,
    0.95
  );

  const ja = await UI.vraag(
    `${stad.naam} bestormen`,
    `Je zet ${s.scheepsvolk} man aan land tegen een garnizoen van ongeveer ${garnizoen}. ` +
      `De stuurman schat de kans op ongeveer <b>${Math.round(kans * 100)}%</b>.` +
      (s.geest < 40 ? '<br><b>Het scheepsvolk is niet in de stemming voor een bestorming.</b>' : ''),
    [
      { label: 'Aanvallen!', waarde: true, soort: 'gevaar' },
      { label: 'Terug aan boord', waarde: false, esc: true },
    ],
    { figuur: 'zeeman' }
  );
  if (!ja) {
    opVertrek();
    return;
  }

  const verliezen = Math.round(s.scheepsvolk * lerp(0.32, 0.1, kans) * (0.6 + Math.random() * 0.8));
  s.scheepsvolk = Math.max(1, s.scheepsvolk - verliezen);
  stad.garnizoen = Math.max(0, stad.garnizoen - Math.round(garnizoen * (0.3 + Math.random() * 0.5)));

  if (Math.random() > kans) {
    s.geest = clamp(s.geest - 20, 0, 100);
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
      vaardigheid: clamp(0.3 + stad.grootte * 0.11, 0.2, 0.85),
      voordeel: clamp(s.scheepsvolk / Math.max(10, garnizoen), 0.5, 2.2),
      // Je staat op het binnenplein van het fort, niet op een scheepsdek.
      achtergrond: 'fort',
      terug(gewonnen) {
        Game.zetScene(zeilScene);
        if (gewonnen) veroverStad(stad, opVertrek);
        else {
          s.geest = clamp(s.geest - 25, 0, 100);
          s.scheepsvolk = Math.max(1, Math.round(s.scheepsvolk * 0.6));
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
  s.geest = clamp(s.geest + 18, 0, 100);
  s.relatie[oudeNatie] = clamp(s.relatie[oudeNatie] - 35, -100, 100);

  if (keuze === 'geef') {
    stad.natie = s.natie;
    stad.garnizoen = 30 + stad.grootte * 12;
    s.relatie[s.natie] = clamp(s.relatie[s.natie] + 30, -100, 100);
    Game.melding(`${stad.naam} vaart nu onder de vlag van ${NATIES[s.natie].naam}.`);
    // Een 'verover'-opdracht voor deze stad is nu afgerond.
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = true;
    }
  } else if (keuze === 'hou') {
    stad.natie = 'piraat';
    stad.garnizoen = 20 + stad.grootte * 8;
    Game.melding(`${stad.naam} is nu een vrijhaven.`);
    // Ook dan telt de verovering voor de opdracht (de vlag hangt niet meer van de oude kroon).
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = true;
    }
  } else {
    s.goud += Math.round(schat * 0.5);
    // Plunderen vervult de opdracht niet — de gouverneur wilde de stad, geen ruïne.
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = false;
    }
    stad.bevolking = Math.round(stad.bevolking * 0.6);
    stad.welvaart *= 0.7;
    stad.garnizoen = 10;
    for (const n of NATIE_IDS) s.relatie[n] = clamp(s.relatie[n] - 6, -100, 100);
    Game.melding(`${stad.naam} is kaalgeplukt.`, 'rood');
  }

  opVertrek();
}

export { bestormStad, veroverStad };
