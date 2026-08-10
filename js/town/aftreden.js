// Afgesplitst van town.js: aftreden — de eindscore en de erelijst.
import { Game, berekenScore, bewaarInErelijst, wisOpslag } from '../game.js';
import { NATIES, NATIE_IDS, RANGEN } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, fmtGold, fmtDate, el } from '../util.js';

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
  // De loopbaan gaat naar de erelijst en het opgeslagen spel wordt gewist: deze
  // kapitein is klaar, en de titel mag hem niet meer terug op zee zetten.
  const plaats = bewaarInErelijst(s, score, stad);
  wisOpslag();
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
            {
              cellen: [
                { tekst: 'Familie' },
                {
                  tekst: s.familie && s.familie.gevonden
                    ? `uw ${s.familie.rol} teruggehaald`
                    : s.familie
                      ? `uw ${s.familie.rol} nooit teruggezien`
                      : '—',
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
      const nb = el('p', 'verhaal');
      nb.innerHTML =
        plaats >= 0
          ? `Deze loopbaan staat op <b>plaats ${plaats + 1}</b> van de erelijst.`
          : 'Deze loopbaan haalde de erelijst niet — er zijn tien grotere namen.';
      body.appendChild(nb);
    },
    knoppen: () => [{ label: 'Een nieuwe reis beginnen', actie: () => window.location.reload() }],
  });
  audio.sfx.fanfare();
}
