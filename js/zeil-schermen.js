// DOM-schermen die tijdens het zeilen geopend kunnen worden.
import { clamp, TAU, fmtDate, fmtGold, el } from './util.js';
import { WAREN, SCHIP_INDEX, NATIES, RANGEN, LEGENDES, ITEMS } from './data.js';
import { WORLD_W, WORLD_H } from './world.js';
import {
  Game, roundRect, vlaggenschip, ruimTotaal, vlootBemanningMax, bewaar, conditieWoord,
} from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

/**
 * Doodskopje op de zeekaart: waar een beruchte kapitein gezien is. Met een
 * donkere halo eronder, anders verdwijnt het wit tussen de stadsstippen.
 */
function tekenDoodskop(g, x, y) {
  g.save();
  g.fillStyle = 'rgba(20,10,14,0.6)';
  g.beginPath();
  g.arc(x, y, 10, 0, TAU);
  g.fill();

  g.fillStyle = '#f2e9d4';
  g.strokeStyle = '#140b0e';
  g.lineWidth = 1.2;
  // Schedel.
  g.beginPath();
  g.arc(x, y - 1, 5.6, 0, TAU);
  g.fill();
  g.stroke();
  // Kaak.
  g.beginPath();
  roundRect(g, x - 3.2, y + 3, 6.4, 3.4, 1.2);
  g.fill();
  g.stroke();
  // Oogkassen en neus.
  g.fillStyle = '#140b0e';
  g.beginPath();
  g.arc(x - 2.1, y - 1.4, 1.8, 0, TAU);
  g.arc(x + 2.1, y - 1.4, 1.8, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(x, y + 0.4);
  g.lineTo(x - 1.1, y + 2.2);
  g.lineTo(x + 1.1, y + 2.2);
  g.closePath();
  g.fill();
  g.restore();
}

/** Toont de volledige zeekaart en de bekende bijzondere plekken. */
export function toonKaart() {
  const s = Game.speler;
  UI.toonScherm({
    titel: 'Zeekaart van de Caraïben',
    onder: fmtDate(s.dag),
    breed: true,
    klasse: 'overlay-kaart',
    bouw(body) {
      const cv = document.createElement('canvas');
      // Ook op hoogte begrenzen, anders steekt de kaart onder het paneel uit
      // en moet je scrollen om de Spaanse Main te zien.
      const bw = Math.min(
        960,
        Game.breedte - 140,
        Math.round(((Game.hoogte * 0.56) * WORLD_W) / WORLD_H)
      );
      cv.width = bw;
      cv.height = Math.round((bw * WORLD_H) / WORLD_W);
      cv.className = 'kaart-canvas';
      const g = cv.getContext('2d');
      // Merktekens die vóór de plaatsnamen op de kaart moeten, zodat een naam
      // er nooit onder verdwijnt.
      const merken = [];
      // Het zoekgebied van de schatkaart: hoe meer stukken, hoe krapper de
      // cirkel. Het kruis zelf komt er nooit op — dat moet je aan land zoeken.
      if (s.schat && s.schat.kwadranten.some(Boolean)) {
        const stukken = s.schat.kwadranten.filter(Boolean).length;
        merken.push((c, sc) => {
          const straal = [0, 1500, 800, 460, 300][stukken] * sc;
          c.save();
          c.strokeStyle = 'rgba(140,47,34,0.75)';
          c.setLineDash([6, 5]);
          c.lineWidth = 1.6;
          c.beginPath();
          c.arc(s.schat.x * sc, s.schat.y * sc, straal, 0, TAU);
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = 'rgba(140,47,34,0.1)';
          c.fill();
          c.restore();
        });
      }
      // Waar een beruchte kapitein volgens de kroeg gezien is.
      for (const l of LEGENDES) {
        const st = s.legendes && s.legendes[l.id];
        if (!st || st.verslagen || !st.getipt || !st.bij) continue;
        const stad = Game.wereld.steden.find((x) => x.naam === st.bij);
        if (!stad) continue;
        merken.push((c, sc) => tekenDoodskop(c, stad.x * sc, stad.y * sc - 12));
      }
      R.tekenZeekaart(g, Game.wereld, cv.width, cv.height, {
        datum: fmtDate(s.dag),
        speler: { x: s.x, y: s.y },
        merken,
      });
      body.appendChild(cv);

      const legenda = document.createElement('div');
      legenda.className = 'legenda';
      for (const [id, n] of Object.entries(NATIES)) {
        if (id === 'piraat') continue;
        const sp = document.createElement('span');
        // De legenda toont hetzelfde symbool als de kaart: op een stip alleen
        // zijn vier natiekleuren niet uit elkaar te houden.
        sp.innerHTML = `<i class="merk merk-${n.merk}" style="background:${n.kleur}"></i>${n.naam}`;
        legenda.appendChild(sp);
      }
      body.appendChild(legenda);
    },
    knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
  });
}

/** Toont schepen, schade, uitrusting en lading van de vloot. */
export function toonScheepsstatus() {
  const s = Game.speler;
  UI.toonScherm({
    titel: 'Onze vloot',
    onder: `${s.schepen.length} schip${s.schepen.length > 1 ? 'en' : ''} onder jouw vlag`,
    bouw(body) {
      for (let i = 0; i < s.schepen.length; i++) {
        const sh = s.schepen[i];
        const t = SCHIP_INDEX[sh.type];
        const kaart = document.createElement('div');
        kaart.className = 'schipkaart';
        kaart.innerHTML = `<h3>${t.naam}${i === 0 ? ' <em>(vlaggenschip)</em>' : ''}</h3>`;
        const info = document.createElement('div');
        info.className = 'schipkaart-info';
        const up = sh.upgrades || {};
        info.innerHTML =
          `<span>Romp</span><span>${Math.round(sh.romp)} / ${sh.maxRomp}</span>` +
          `<span>Kanonnen</span><span>${sh.kanonnen} / ${t.kanonnen}</span>` +
          `<span>Ruim</span><span>${ruimTotaal(sh)} / ${t.ruim}</span>` +
          `<span>Snelheid</span><span>${t.snelheid}</span>` +
          `<span>Wendbaarheid</span><span>${t.wend.toFixed(2)}</span>` +
          `<span>Aan de wind</span><span>${Math.round(t.hoogte * 100)}%</span>` +
          (up.zeilen || up.roer || up.romp || up.weer
            ? `<span>Uitrusting</span><span>zeil ${up.zeilen || 0} · ` +
              `roer ${up.roer || 0} · romp ${up.romp || 0}` +
              `${up.weer ? ` · weer ${up.weer}` : ''}</span>`
            : '');
        kaart.appendChild(info);
        kaart.appendChild(UI.balk(sh.romp, sh.maxRomp, '#7bb36a', 'Rompsterkte'));
        body.appendChild(kaart);
      }
      const lading = document.createElement('div');
      lading.className = 'schipkaart';
      lading.innerHTML = '<h3>Ruim van het vlaggenschip</h3>';
      const sh = vlaggenschip(s);
      lading.appendChild(
        UI.tabel(
          [{ label: 'Waar' }, { label: 'Aantal', rechts: true }],
          WAREN.map((w, i) => ({
            cellen: [{ tekst: w.naam }, { tekst: String(sh.lading[i]), klasse: 'rechts' }],
          }))
        )
      );
      body.appendChild(lading);
    },
    knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
  });
}

/** Toont bemanning, voortgang, relaties en persoonlijke verhaallijnen. */
export function toonBemanning() {
  const s = Game.speler;
  UI.toonScherm({
    titel: 'Bemanning en buit',
    bouw(body) {
      const d = document.createElement('div');
      d.className = 'schipkaart';
      d.innerHTML =
        `<div class="schipkaart-info">` +
        `<span>Bemanning</span><span>${s.bemanning} / ${vlootBemanningMax(s)}</span>` +
        `<span>Moraal</span><span>${Math.round(s.moraal)}%</span>` +
        `<span>Buit in het ruim</span><span>${fmtGold(s.goud)} goudstukken</span>` +
        `<span>Eigen spaargeld</span><span>${fmtGold(s.gespaard)} goudstukken</span>` +
        `<span>Roem</span><span>${Math.round(s.roem)}</span>` +
        `<span>Leeftijd</span><span>${Math.floor(s.leeftijd)} jaar · ${conditieWoord(s)}</span>` +
        `</div>`;
      body.appendChild(d);
      body.appendChild(UI.balk(s.moraal, 100, s.moraal < 30 ? '#c65b45' : '#7bb36a', 'Moraal'));

      // Lange lijn: het vermiste familielid en de lopende opdracht.
      const lange = document.createElement('div');
      lange.className = 'schipkaart';
      lange.innerHTML = '<h3>De lange lijn</h3>';
      const famInfo = document.createElement('div');
      famInfo.className = 'schipkaart-info';
      const fam = s.familie;
      const schurk = LEGENDES.find((l) => l.schurk);
      famInfo.innerHTML = !fam
        ? `<span>Familie</span><span>—</span>`
        : fam.gevonden
          ? `<span>Familie</span><span>Je ${fam.rol} is teruggevonden ✓</span>`
          : fam.spoor
            ? `<span>Familie</span><span>Je ${fam.rol} zit aan boord bij ${schurk.naam}</span>`
            : `<span>Familie</span><span>Je ${fam.rol} is vermist` +
              `${fam.zoekStad ? ` · laatst gehoord in ${fam.zoekStad}` : ' · geruchten in de kroeg'}` +
              `</span>`;
      lange.appendChild(famInfo);
      if (s.opdracht) {
        const opdrachtInfo = el('div', 'schipkaart-info');
        opdrachtInfo.innerHTML =
          `<span>Opdracht</span><span>${s.opdracht.doe}${s.opdracht.klaar ? ' <b>(klaar)</b>' : ''}</span>` +
          `<span>Beloning</span><span>${fmtGold(s.opdracht.goud)} goud plus specerijen</span>`;
        lange.appendChild(opdrachtInfo);
      }
      body.appendChild(lange);

      // Het perkament, als je er stukken van hebt.
      if (s.schat && s.schat.kwadranten.some(Boolean)) {
        const kaart = el('div', 'schipkaart');
        const aantal = s.schat.kwadranten.filter(Boolean).length;
        kaart.innerHTML = '<h3>De schatkaart</h3>';
        const cv = document.createElement('canvas');
        cv.width = 320;
        cv.height = 240;
        cv.className = 'kaart-canvas';
        R.tekenSchatkaart(
          cv.getContext('2d'), Game.wereld, s.schat, cv.width, cv.height, s.schat.kwadranten
        );
        kaart.appendChild(cv);
        const bij = el('p', 'verhaal');
        bij.innerHTML =
          `<b>${aantal}</b> van de vier stukken · ergens bij <b>${s.schat.regio}</b>.` +
          (aantal >= 2
            ? ' Zeil die streek af; je stuurman herkent de kust als je er langs komt.'
            : ' Met één stuk herkent niemand die kust — koop er meer in de kroeg.');
        kaart.appendChild(bij);
        body.appendChild(kaart);
      }

      // Beruchte kapiteins: wie er nog vaart, wie er verslagen is.
      const namen = el('div', 'schipkaart');
      namen.innerHTML = '<h3>Beruchte kapiteins</h3>';
      const naamInfo = el('div', 'schipkaart-info');
      // De schurk staat er pas bij zodra je weet dat hij bestaat.
      const zichtbaar = LEGENDES.filter((l) => !l.schurk || s.familie?.spoor);
      naamInfo.innerHTML = zichtbaar.map((l) => {
        const st = (s.legendes && s.legendes[l.id]) || {};
        const stand = st.verslagen
          ? 'verslagen ✓'
          : st.getipt && st.bij
            ? `gezien bij ${st.bij}`
            : 'nog geen spoor';
        return `<span>${l.naam}</span><span>${stand}</span>`;
      }).join('');
      namen.appendChild(naamInfo);
      body.appendChild(namen);

      // Buitstukken die je op zee veroverd hebt.
      if (s.items && s.items.length) {
        const buit = el('div', 'schipkaart');
        buit.innerHTML = '<h3>Buitstukken</h3>';
        const buitInfo = el('div', 'schipkaart-info');
        buitInfo.innerHTML = s.items
          .filter((id) => ITEMS[id])
          .map((id) => `<span>${ITEMS[id].naam}</span><span>${ITEMS[id].omschrijving}</span>`)
          .join('');
        buit.appendChild(buitInfo);
        body.appendChild(buit);
      }

      const rel = document.createElement('div');
      rel.className = 'schipkaart';
      rel.innerHTML = '<h3>Betrekkingen</h3>';
      rel.appendChild(
        UI.tabel(
          [{ label: 'Natie' }, { label: 'Verhouding' }, { label: 'Rang', rechts: true }],
          Object.keys(s.relatie).map((n) => ({
            cellen: [
              { html: `<b style="color:${NATIES[n].kleur}">${NATIES[n].naam}</b>` },
              {
                node: UI.balk(
                  s.relatie[n] + 100,
                  200,
                  s.relatie[n] < 0 ? '#c65b45' : '#7bb36a',
                  relatieWoord(s.relatie[n])
                ),
              },
              { tekst: rangNaam(s, n), klasse: 'rechts' },
            ],
          }))
        )
      );
      body.appendChild(rel);
    },
    knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
  });
}

/** Toont bewaren, stoppen en de lokale presentatievoorkeuren. */
export function toonMenu() {
  UI.toonScherm({
    titel: 'Scheepsraad',
    klasse: 'overlay-smal',
    bouw(body) {
      body.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'verhaal',
          textContent: 'Wat is je bevel, kapitein?',
        })
      );
    },
    knoppen: (sch) => [
      { label: 'Verder varen', esc: true, actie: () => sch.sluit() },
      {
        label: 'Spel bewaren',
        actie: () => {
          if (bewaar()) Game.melding('Het logboek is bijgewerkt.');
          else Game.melding('Bewaren mislukt.', 'rood');
          sch.sluit();
        },
      },
      {
        label: 'Bewaren en stoppen',
        actie: () => {
          if (bewaar()) {
            window.location.reload();
          } else {
            Game.melding('Bewaren mislukt — er wordt niet gestopt.', 'rood');
            sch.sluit();
          }
        },
      },
      {
        label: audio.geluidAan() ? 'Geluid uit' : 'Geluid aan',
        actie: () => {
          audio.zetGeluid(!audio.geluidAan());
          sch.ververs();
        },
      },
      {
        // Apart van het geluid: wie de kanonnen wil horen maar niet de deun,
        // hoeft niet alles het zwijgen op te leggen.
        label: audio.muziekAan() ? 'Muziek uit' : 'Muziek aan',
        actie: () => {
          audio.zetMuziek(!audio.muziekAan());
          sch.ververs();
        },
      },
      {
        // Miniatuureffect (tilt-shift): de wereld vervaagt buiten een scherpe
        // band rond het schip. Presentatievoorkeur, los van de save; `F` doet
        // hetzelfde, ook buiten dit scherm.
        label: Game.miniatuur ? 'Miniatuureffect uit' : 'Miniatuureffect aan',
        actie: () => {
          Game.zetMiniatuur(!Game.miniatuur);
          sch.ververs();
        },
      },
      {
        // De scherpe band groter of kleiner maken. Onafhankelijk van de
        // zachtheid daarnaast: dit knoppenpaar stuurt alleen hóeveel er scherp
        // is, niet hóe zacht de overgang ernaartoe verloopt.
        label: `Scherpte groter: ${Math.round(Game.miniatuurGrootte() * 100)}%`,
        actie: () => {
          Game.zetMiniatuurKeuze(
            clamp(Game.miniatuurGrootte() + 0.04, 0.12, 0.6),
            Game.miniatuurZacht()
          );
          sch.ververs();
        },
      },
      {
        label: `Scherpte kleiner: ${Math.round(Game.miniatuurGrootte() * 100)}%`,
        actie: () => {
          Game.zetMiniatuurKeuze(
            clamp(Game.miniatuurGrootte() - 0.04, 0.12, 0.6),
            Game.miniatuurZacht()
          );
          sch.ververs();
        },
      },
      {
        // De overgang donziger of strakker. Onafhankelijk van de grootte: dit
        // knoppenpaar stuurt alleen de ring breedte van de zachte rand.
        label: `Overgang zachter: ${Math.round(Game.miniatuurZacht() * 100)}%`,
        actie: () => {
          Game.zetMiniatuurKeuze(
            Game.miniatuurGrootte(),
            clamp(Game.miniatuurZacht() + 0.04, 0.08, 0.6)
          );
          sch.ververs();
        },
      },
      {
        label: `Overgang strakker: ${Math.round(Game.miniatuurZacht() * 100)}%`,
        actie: () => {
          Game.zetMiniatuurKeuze(
            Game.miniatuurGrootte(),
            clamp(Game.miniatuurZacht() - 0.04, 0.08, 0.6)
          );
          sch.ververs();
        },
      },
      {
        label: 'Stoppen zonder bewaren',
        soort: 'gevaar',
        actie: async () => {
          sch.sluit();
          // Bewaren blijft hier gewoon als uitweg staan: wie per ongeluk op
          // de rode knop drukt, hoeft zijn reis niet kwijt te raken.
          const keuze = await UI.vraag(
            'Weet je het zeker?',
            'Alles wat je sinds de laatste keer bewaren hebt gedaan, gaat verloren.',
            [
              { label: 'Toch eerst bewaren', waarde: 'bewaar' },
              { label: 'Ja, stoppen', waarde: 'stop', soort: 'gevaar' },
              { label: 'Nee, verder varen', waarde: 'nee', esc: true },
            ]
          );
          if (keuze === 'stop') window.location.reload();
          else if (keuze === 'bewaar') {
            if (bewaar()) window.location.reload();
            else Game.melding('Bewaren mislukt — er wordt niet gestopt.', 'rood');
          }
        },
      },
    ],
  });
}

function rangNaam(s, n) {
  const r = RANGEN[clamp(s.rang[n], 0, RANGEN.length - 1)];
  return s.rang[n] > 0 && r ? r.naam : '—';
}

function relatieWoord(v) {
  if (v <= -60) return 'Op leven en dood';
  if (v <= -25) return 'Vijandig';
  if (v < 15) return 'Koel';
  if (v < 50) return 'Vriendelijk';
  return 'Bondgenoot';
}
