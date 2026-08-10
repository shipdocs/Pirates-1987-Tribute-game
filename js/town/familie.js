// Afgesplitst van town.js: navragen naar het vermiste familielid.
import { Game, talentBonus } from '../game.js';
import { LEGENDES } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp } from '../util.js';

/** Vraag langs de kade naar de vermiste vader/moeder/broer/zus. */
async function zoekFamilie(stad, sch) {
  const s = Game.speler;
  const rol = s.familie ? s.familie.rol : 'familielid';
  // Hogere roem en charme helpen; anders een loos spoor.
  const kans = clamp(0.45 + s.roem / 900 + (talentBonus(s, 'gladde_tong') ? 0.15 : 0), 0.2, 0.95);
  if (Math.random() < kans) {
    // Niet het familielid zelf, maar het spoor: een naam om achterna te varen.
    const schurk = LEGENDES.find((l) => l.schurk);
    s.familie.spoor = true;
    s.familie.zoekStad = null;
    s.roem += 25;
    s.geest = clamp(s.geest + 8, 0, 100);
    audio.sfx.fout();
    await UI.vraag(
      'Een naam, eindelijk',
      `Achter in een pakhuis vind je iemand die het zich herinnert. "Uw ${rol}? Die is hier geweest, ja. ` +
        `Meegevoerd, met de rest van de vracht." Hij kijkt naar de deur voordat hij verder praat. ` +
        `"<b>${schurk.naam}</b>, ${schurk.bijnaam}. ${schurk.verhaal} Zolang hij vaart, ` +
        `vindt u uw ${rol} in geen enkele haven — die zit aan boord."`,
      [{ label: 'Dan zoek ik hém', waarde: 'ok', soort: 'gevaar' }],
      { figuur: 'zeeman' }
    );
    sch._bericht =
      `Je ${rol} is aan boord bij <b>${schurk.naam}</b>. Er is maar één manier om ze terug te krijgen.`;
  } else {
    await UI.vraag(
      'Een dood spoor',
      `Niemand hier herkent de beschrijving. "Uw ${rol}? Weet u het zeker?"`,
      [{ label: 'Verder zoeken', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
    s.roem = Math.max(0, s.roem - 2);
    sch._bericht = 'Geen spoor van je familielid in deze stad.';
  }
  sch.ververs();
}

export { zoekFamilie };
