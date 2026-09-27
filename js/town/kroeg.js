// Afgesplitst van town.js: de kroeg met volk, rondjes, geruchten en de buitverdeling.
import {
  Game, vlootScheepsvolkMax, talentBonus,
} from '../game.js';
import { LEGENDE_INDEX, WAREN, KAPITEIN_NAMEN, GERUCHTEN } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, lerp, fmtGold, fmtDate, el, pick } from '../util.js';

const rng = Math.random;

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
        `<br><small>Goud in het ruim: <b>${fmtGold(s.goud)}</b> · scheepsvolk <b>${s.scheepsvolk}</b> van ${vlootScheepsvolkMax(s)}</small>`;
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
        { label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder && ouder.ververs(); } },
      ];
    },
  });
  return scherm;
}

function beschikbaarVolk(stad, s) {
  const ruimte = vlootScheepsvolkMax(s) - s.scheepsvolk;
  const aanbod = Math.round(
    stad.grootte * 14 * (0.5 + s.roem / 400) * (1 + 0.35 * talentBonus(s, 'gladde_tong')) *
      (stad.soort === 'roversnest' ? 1.8 : 1)
  );
  return clamp(Math.min(ruimte, aanbod), 0, 400);
}

function huurPrijs(stad, s) {
  return Math.round(lerp(42, 24, clamp(s.roem / 300, 0, 1)) * (talentBonus(s, 'gladde_tong') ? 0.8 : 1));
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
  s.scheepsvolk += n;
  s.geest = clamp(s.geest + 3, 0, 100);
  audio.sfx.munt();
  sch._bericht = `<b>${n} man</b> monstert aan voor ${fmtGold(n * prijs)} goudstukken.`;
  sch.ververs();
}

function rondjeGeven(stad, sch) {
  const s = Game.speler;
  s.goud -= 100;
  s.geest = clamp(s.geest + 6, 0, 100);
  audio.sfx.munt();
  const w = Game.wereld;

  // Vaart er een beruchte kapitein rond, dan gaat dát gerucht vóór op het
  // gebruikelijke kroegpraat — en het klopt: het wijst de haven aan waar hij
  // op dit moment het dichtst bij zit.
  const legendeVloot = w.legendeOpZee ? w.legendeOpZee() : null;
  if (legendeVloot && rng() < 0.6) {
    const legende = LEGENDE_INDEX[legendeVloot.legende];
    // Zonder straal: de haven waar hij op dit moment het dichtst bij zit.
    const dichtbij = w.stadOp(legendeVloot.x, legendeVloot.y, Infinity);
    if (legende && dichtbij) {
      if (!s.legendes[legende.id]) s.legendes[legende.id] = { verslagen: false, getipt: false, bij: null };
      s.legendes[legende.id].getipt = true;
      s.legendes[legende.id].bij = dichtbij.naam;
      sch._bericht =
        `De kroeg wordt stil. "<b>${legende.naam}</b>, ${legende.bijnaam} — dat zeil is ` +
        `gezien voor <b>${dichtbij.naam}</b>. Vaar erheen als u moe bent van leven, kapitein."`;
      sch.ververs();
      return;
    }
  }

  const sjabloon = pick(rng, GERUCHTEN);
  const tekst = sjabloon
    .replace('{stad}', pick(rng, w.steden).naam)
    .replace('{waar}', pick(rng, WAREN).naam.toLowerCase())
    .replace('{kapitein}', pick(rng, KAPITEIN_NAMEN));
  sch._bericht = `De kroeg juicht. Iemand mompelt: "${tekst}"`;
  sch.ververs();
}

/** Alle vier de stukken binnen: de haveloze man heeft niets meer te verkopen. */
function schatCompleet(s) {
  return !!(s.schat && s.schat.kwadranten.every(Boolean));
}

async function vreemdeling(stad, sch) {
  const s = Game.speler;
  const rol = rng();
  if (rol < 0.32 && !schatCompleet(s)) {
    // Nog geen schat op de kaart? Dan legt dit stuk er een neer.
    if (!s.schat) s.schat = Game.wereld.plaatsSchat(s.schattenGevonden || 0);
    const open = s.schat.kwadranten.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
    const prijs = 300 + Math.round(rng() * 700);
    const koop = await UI.vraag(
      'Een havelozen man in de hoek',
      `Hij schuift een gerafeld stuk perkament over de tafel. "Een kwart van een schatkaart, kapitein. ` +
        `Van <b>${s.schat.regio}</b>, zweer ik u. Voor ${fmtGold(prijs)} goudstukken is-ie van u."` +
        `<br><br><small>Je hebt ${4 - open.length} van de vier stukken.</small>`,
      [
        { label: `Kopen (${fmtGold(prijs)})`, waarde: true, uit: s.goud < prijs },
        { label: 'Laten liggen', waarde: false },
      ],
      { figuur: 'zeeman' }
    );
    if (koop) {
      s.goud -= prijs;
      s.schat.kwadranten[pick(rng, open)] = true;
      const nu = s.schat.kwadranten.filter(Boolean).length;
      audio.sfx.munt();
      sch._bericht =
        nu >= 4
          ? `De vier stukken passen op elkaar. Het kruis ligt bij <b>${s.schat.regio}</b> — nu nog erheen varen.`
          : `Je hebt nu <b>${nu}</b> van de vier stukken, allemaal van ${s.schat.regio}. ` +
            'Hoe meer stukken, hoe minder je aan land hoeft te gokken.';
      sch.ververs();
    }
  } else if (rol < 0.6) {
    const doelStad = pick(rng, Game.wereld.steden.filter((x) => x !== stad));
    sch._bericht =
      `Een oude stuurman fluistert: "In <b>${doelStad.naam}</b> ligt ` +
      `${pick(rng, WAREN).naam.toLowerCase()} voor een schijntje. Vaar erheen voor het rondgaat."`;
    sch.ververs();
  } else if (rol < 0.68 && !s.familie?.gevonden && !s.familie?.spoor) {
    // Vermist familielid — de lange persoonlijke lijn uit het origineel.
    const rolNaam = s.familie.rol;
    const waar = pick(rng, Game.wereld.steden.filter((x) => x !== stad));
    if (!s.familie.zoekStad) s.familie.zoekStad = waar.naam;
    sch._bericht =
      `Een bedelaar grijpt je pols: "U lijkt op iemand die ik ken. Mag ik een duit voor ` +
      `een hertaling? Men zegt dat uw <b>${rolNaam}</b> ergens in <b>${s.familie.zoekStad}</b> gevangen zit."`;
    s.familie.laatsteTip = s.dag;
    sch.ververs();
  } else if (rol < 0.78 && s.scheepsvolk > 20) {
    const n = Math.round(s.scheepsvolk * 0.12);
    s.scheepsvolk -= n;
    s.geest = clamp(s.geest - 4, 0, 100);
    sch._bericht = `<b>${n} man</b> is na de rum gedrost.`;
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
  const kapiteinsdeel = clamp(0.35 + rangDeel + roemDeel + (talentBonus(s, 'gladde_tong') ? 0.05 : 0), 0.2, 0.72);
  const totaal = s.goud;
  const mijn = Math.round(totaal * kapiteinsdeel);
  const perMan = Math.max(0, Math.round((totaal - mijn) / Math.max(1, s.scheepsvolk)));

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
            { cellen: [{ tekst: `Per kop (${s.scheepsvolk} man)` }, { tekst: fmtGold(perMan), klasse: 'rechts' }] },
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
          s.scheepsvolk = Math.max(12, Math.round(s.scheepsvolk * 0.4));
          s.geest = 85;
          s.laatsteVerdeling = s.dag;
          s.roem += Math.round(totaal / 3000);
          audio.sfx.munt();
          Game.melding(`Je bergt ${fmtGold(mijn)} goudstukken op in je eigen kist.`);
          sch.sluit();
          ouder.ververs();
        },
      },
      { label: 'Toch maar niet', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } },
    ],
  });
}

export { kroeg, beschikbaarVolk, huurPrijs, monsterAan, rondjeGeven, schatCompleet, vreemdeling, verdeelBuit };
