// Opstart: titelscherm, het maken van een kapitein en de overgang naar zee.
import { TAU, clamp, lerp, el, pick, makeRng, sierTijd } from './util.js';
import { NATIES, NATIE_IDS, TALENTEN, MOEILIJKHEDEN } from './data.js';
import { Wereld } from './world.js';
import { Game, maakSpeler, heeftOpslag, laad, wisOpslag } from './game.js';
import { maakZeilScene } from './sail.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

const canvas = document.getElementById('spel');
Game.init(canvas);
R.initPatronen(Game.ctx);

// --- Titelscherm ----------------------------------------------------------

function maakTitelScene() {
  const wereld = new Wereld(20250807);
  const cam = { x: 0, y: 0, zoom: 0.62 };
  // Camera drijft langzaam over de Antillen.
  let t = 0;
  const schepen = [];
  const r = makeRng(7);
  for (let i = 0; i < 6; i++) {
    schepen.push({
      x: r() * 2400 + 600,
      y: r() * 1200 + 500,
      koers: r() * TAU,
      type: pick(r, ['sloep', 'fregat', 'galjoen', 'brigantijn', 'koopvaarder']),
      natie: pick(r, [...NATIE_IDS, 'piraat']),
      snelheid: 20 + r() * 20,
    });
  }

  return {
    naam: 'titel',
    betreed() {
      cam.x = 1900;
      cam.y = 1000;
      toonTitelmenu();
    },
    werkBij(dt) {
      t += dt;
      wereld.windTik(dt);
      cam.x = 1900 + Math.sin(t * 0.06) * 520;
      cam.y = 1020 + Math.cos(t * 0.045) * 260;
      for (const s of schepen) {
        s.x += Math.cos(s.koers) * s.snelheid * dt;
        s.y += Math.sin(s.koers) * s.snelheid * dt;
        if (wereld.isLand(s.x + Math.cos(s.koers) * 60, s.y + Math.sin(s.koers) * 60)) s.koers += dt * 1.2;
      }
    },
    teken(c) {
      const vw = Game.breedte,
        vh = Game.hoogte;
      R.tekenZee(c, cam, vw, vh, Game.tijd, {
        richting: wereld.windRichting,
        kracht: wereld.windKracht,
      });
      c.save();
      c.translate(vw / 2, vh / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-cam.x, -cam.y);
      R.tekenKaartlijnen(c, cam, vw, vh);
      R.tekenLand(c, wereld, cam, vw, vh);
      for (const stad of wereld.steden) R.tekenStad(c, stad, cam, Game.tijd, false);
      for (const s of schepen) {
        R.tekenSchip(c, s.x, s.y, s.koers, s.type, s.natie, wereld.windRichting, {
          vaart: 0.6,
          tijd: Game.tijd,
          schaal: 1.4,
        });
      }
      c.restore();

      // Donkere sluier zodat het menu leesbaar blijft.
      const g = c.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, 'rgba(4,16,28,0.62)');
      g.addColorStop(0.42, 'rgba(4,16,28,0.14)');
      g.addColorStop(1, 'rgba(4,16,28,0.6)');
      c.fillStyle = g;
      c.fillRect(0, 0, vw, vh);

      tekenTitel(c, vw, vh, Game.tijd);
    },
  };
}

function tekenTitel(c, vw, vh, t) {
  c.save();
  c.textAlign = 'center';
  // De titel schaalt mee met het venster; op een telefoon paste hij anders
  // niet binnen het beeld.
  const k = clamp(vw / 900, 0.42, 1);
  const y = Math.round(46 + 72 * k);

  c.font = `700 ${Math.round(68 * k)}px Georgia, "Times New Roman", serif`;
  c.lineWidth = 8 * k;
  c.strokeStyle = 'rgba(6,20,32,0.85)';
  c.strokeText('ZEEROVERIJ', vw / 2, y);
  const g = c.createLinearGradient(0, y - 50 * k, 0, y + 12 * k);
  g.addColorStop(0, '#ffe9ae');
  g.addColorStop(0.5, '#d9a441');
  g.addColorStop(1, '#a9741f');
  c.fillStyle = g;
  c.fillText('ZEEROVERIJ', vw / 2, y);

  const onder =
    vw < 560
      ? 'De Caraïben, 1660'
      : 'De Caraïben, 1660 — een eerbetoon aan Sid Meier’s Pirates!';
  c.font = `italic ${Math.max(12, Math.round(19 * k))}px Georgia, serif`;
  c.lineWidth = 4 * k;
  c.strokeStyle = 'rgba(6,20,32,0.8)';
  c.strokeText(onder, vw / 2, y + 34 * k);
  c.fillStyle = 'rgba(240,228,198,0.92)';
  c.fillText(onder, vw / 2, y + 34 * k);

  // Sierlijn.
  const sy = y + 52 * k;
  const half = Math.min(230 * k, vw / 2 - 20);
  c.strokeStyle = 'rgba(217,164,65,0.5)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(vw / 2 - half, sy);
  c.lineTo(vw / 2 - 14, sy);
  c.moveTo(vw / 2 + 14, sy);
  c.lineTo(vw / 2 + half, sy);
  c.stroke();
  c.beginPath();
  c.arc(vw / 2, sy, 5 + Math.sin(sierTijd(t) * 2) * 0.8, 0, TAU);
  c.fillStyle = 'rgba(217,164,65,0.8)';
  c.fill();
  c.restore();
}

function toonTitelmenu() {
  UI.toonScherm({
    titel: 'Kies je lot',
    klasse: 'overlay-titel overlay-smal',
    bouw(body) {
      const p = el('p', 'verhaal');
      p.innerHTML =
        'Vier kronen vechten om de Spaanse Main: Spanje, Engeland, Frankrijk en Nederland. ' +
        'Jij hebt een sloep, veertig man en geen enkele reden om je aan de wet te houden.';
      body.appendChild(p);
    },
    knoppen: (sch) => {
      const k = [
        {
          label: 'Nieuw avontuur',
          actie: () => {
            sch.sluit();
            maakKapitein();
          },
        },
      ];
      if (heeftOpslag()) {
        k.push({
          label: 'Verder waar je gebleven was',
          actie: () => {
            const opgeslagen = laad();
            if (!opgeslagen) {
              Game.melding('Het logboek is onleesbaar geworden.', 'rood');
              wisOpslag();
              sch.ververs();
              return;
            }
            sch.sluit();
            Game.wereld = opgeslagen.wereld;
            Game.speler = opgeslagen.speler;
            audio.ontgrendel();
            Game.zetScene(maakZeilScene());
          },
        });
      }
      // Eerst dit menu sluiten: het hulpscherm opent het straks zelf weer, en
      // anders blijft er bij elke rondgang een titelmenu op de stapel staan.
      k.push({
        label: 'Bediening en spelregels',
        actie: () => {
          sch.sluit();
          toonHulp();
        },
      });
      return k;
    },
  });
}

function toonHulp() {
  UI.toonScherm({
    titel: 'Bediening',
    breed: true,
    bouw(body) {
      const blok = (titel, rijen) => {
        const d = el('div', 'hulp-blok');
        d.appendChild(el('h3', null, titel));
        const ul = el('ul');
        for (const [toets, wat] of rijen) {
          const li = el('li');
          li.innerHTML = `<kbd>${toets}</kbd> ${wat}`;
          ul.appendChild(li);
        }
        d.appendChild(ul);
        return d;
      };
      body.appendChild(
        blok('Op zee', [
          ['← →', 'roer bakboord / stuurboord'],
          ['↑ ↓', 'meer of minder zeil'],
          ['klik', 'koers uitzetten naar dat punt'],
          ['M', 'zeekaart'],
          ['S', 'vloot en ruim'],
          ['C', 'bemanning en betrekkingen'],
          ['Esc', 'scheepsraad (bewaren, geluid)'],
        ])
      );
      body.appendChild(
        blok('In het zeegevecht', [
          ['← →', 'sturen'],
          ['↑ ↓', 'zeil bijzetten of minderen'],
          ['spatie', 'de volle laag geven'],
          ['1 2 3', 'rondkogel · kettingkogel · schroot'],
          ['B', 'enteren (binnen 70 meter)'],
          ['Esc', 'proberen te vluchten'],
        ])
      );
      body.appendChild(
        blok('In het duel', [
          ['↑', 'hoog aanvallen of pareren'],
          ['→', 'midden aanvallen of pareren'],
          ['↓', 'laag aanvallen of pareren'],
        ])
      );
      const p = el('p', 'verhaal');
      p.innerHTML =
        '<b>De kern van het spel:</b> de wind bepaalt alles. Voor de wind vaar je snel, pal tegen de wind ' +
        'kom je nauwelijks vooruit — kleine schepen kunnen veel hoger aan de wind liggen dan zware galjoenen. ' +
        'Koop goedkoop in plantagesteden, verkoop duur in forten en schatkamers. Verdeel op tijd de buit, ' +
        'want een bemanning zonder uitzicht op goud loopt weg. En hoe langer je vaart, hoe ouder je wordt.';
      body.appendChild(p);
    },
    knoppen: (sch) => [{ label: 'Terug', actie: () => { sch.sluit(); toonTitelmenu(); } }],
  });
}

// --- Kapitein maken -------------------------------------------------------

function maakKapitein() {
  const keuze = {
    naam: '',
    natie: 'engeland',
    talent: 'schermen',
    moeilijkheid: 'kaperkapitein',
  };

  const scherm = UI.toonScherm({
    titel: 'Wie ben jij?',
    onder: 'De Caraïben, het jaar onzes Heren 1660',
    breed: true,
    klasse: 'overlay-maak',
    bouw(body, sch) {
      // Naam.
      const naamBlok = el('div', 'maak-blok');
      naamBlok.appendChild(el('h3', null, 'Naam van de kapitein'));
      const invoer = el('input', 'naam-invoer');
      invoer.type = 'text';
      invoer.maxLength = 24;
      invoer.placeholder = 'bijv. Willem de Zwarte';
      invoer.value = keuze.naam;
      invoer.addEventListener('input', () => {
        keuze.naam = invoer.value;
        const knop = sch.voet.querySelector('.knop-start');
        if (knop) knop.disabled = !invoer.value.trim();
      });
      naamBlok.appendChild(invoer);
      body.appendChild(naamBlok);

      // Natie.
      const natieBlok = el('div', 'maak-blok');
      natieBlok.appendChild(el('h3', null, 'In wiens dienst vaar je?'));
      const kiesNatie = el('div', 'keuzerij');
      for (const id of NATIE_IDS) {
        const n = NATIES[id];
        const k = el('button', 'keuze' + (keuze.natie === id ? ' gekozen' : ''));
        k.innerHTML =
          `<span class="vlag"><i style="background:${n.vlag[0]}"></i>` +
          `<i style="background:${n.vlag[1]}"></i><i style="background:${n.vlag[2]}"></i></span>` +
          `<b>${n.naam}</b>`;
        k.onclick = () => {
          keuze.natie = id;
          audio.sfx.klik();
          sch.ververs();
        };
        kiesNatie.appendChild(k);
      }
      natieBlok.appendChild(kiesNatie);
      body.appendChild(natieBlok);

      // Talent.
      const talentBlok = el('div', 'maak-blok');
      talentBlok.appendChild(el('h3', null, 'Waar ben je goed in?'));
      const kiesTalent = el('div', 'keuzerij keuzerij-breed');
      for (const t of TALENTEN) {
        const k = el('button', 'keuze' + (keuze.talent === t.id ? ' gekozen' : ''));
        k.innerHTML = `<b>${t.naam}</b><small>${t.omschrijving}</small>`;
        k.onclick = () => {
          keuze.talent = t.id;
          audio.sfx.klik();
          sch.ververs();
        };
        kiesTalent.appendChild(k);
      }
      talentBlok.appendChild(kiesTalent);
      body.appendChild(talentBlok);

      // Moeilijkheid.
      const moeiBlok = el('div', 'maak-blok');
      moeiBlok.appendChild(el('h3', null, 'Hoe zwaar mag het worden?'));
      const kiesMoei = el('div', 'keuzerij');
      for (const m of MOEILIJKHEDEN) {
        const k = el('button', 'keuze' + (keuze.moeilijkheid === m.id ? ' gekozen' : ''));
        k.innerHTML = `<b>${m.naam}</b><small>${m.omschrijving}</small>`;
        k.onclick = () => {
          keuze.moeilijkheid = m.id;
          audio.sfx.klik();
          sch.ververs();
        };
        kiesMoei.appendChild(k);
      }
      moeiBlok.appendChild(kiesMoei);
      body.appendChild(moeiBlok);
    },
    knoppen: (sch) => [
      {
        label: 'Uitvaren',
        soort: 'start',
        uit: !keuze.naam.trim(),
        actie: () => {
          sch.sluit();
          begin(keuze);
        },
      },
      { label: 'Terug', actie: () => { sch.sluit(); toonTitelmenu(); } },
    ],
  });

  // De startknop krijgt een eigen klasse zodat we hem live kunnen aan/uitzetten.
  const startKnop = scherm.voet.querySelector('.knop-start');
  if (startKnop) startKnop.classList.add('knop-start');
  const invoer = scherm.body.querySelector('.naam-invoer');
  if (invoer) invoer.focus();
}

function begin(keuze) {
  const wereld = new Wereld((Math.random() * 1e9) | 0);
  const speler = maakSpeler(keuze);

  // Beginnen op de rede van een haven van je eigen natie, net buiten de aanloop.
  const eigen = wereld.stedenVanNatie(keuze.natie);
  const start = eigen.length ? eigen[Math.floor(Math.random() * eigen.length)] : wereld.steden[0];
  let beste = [start.ankerX, start.ankerY];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const px = start.ankerX + Math.cos(a) * 230;
    const py = start.ankerY + Math.sin(a) * 230;
    if (!wereld.isLand(px, py)) {
      beste = [px, py];
      speler.koers = a;
      break;
    }
  }
  [speler.x, speler.y] = beste;

  Game.wereld = wereld;
  Game.speler = speler;
  audio.ontgrendel();
  audio.startMuziek();
  Game.zetScene(maakZeilScene());
  Game.melding(`${speler.naam} verlaat ${start.naam}. De wereld ligt open.`);
}

// --- Start ----------------------------------------------------------------

// Handig bij het sleutelen: de spelstaat is bereikbaar vanuit de console.
window.__G = Game;

Game.zetScene(maakTitelScene());
Game.start();

// Verbergen van het laadscherm.
const laadscherm = document.getElementById('laden');
if (laadscherm) laadscherm.remove();
