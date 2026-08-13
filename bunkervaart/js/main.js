// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Opstarten: titelscherm, nieuw spel, opgeslagen spel hervatten.

import { el, sierTijd } from './util.js';
import { MOEILIJKHEDEN, BOTEN } from './data.js';
import {
  Spel, maakSchipper, laad, heeftOpslag, wisOpslag, bewaar,
} from './spel.js';
import { Wereld } from './wereld.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

const canvas = document.getElementById('spel');
Spel.init(canvas);

// --- Titelscherm -----------------------------------------------------------

function maakTitelScene() {
  const golven = [];
  for (let i = 0; i < 60; i++) {
    golven.push({ x: Math.random(), y: Math.random(), s: 0.2 + Math.random() * 0.8 });
  }
  return {
    teken(c) {
      const vw = Spel.breedte;
      const vh = Spel.hoogte;
      const t = sierTijd(Spel.tijd);

      // Nachtelijke haven: donker water, silhouetten van kranen, en de lichten
      // van een terminal aan de overkant.
      const g = c.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, '#0a121a');
      g.addColorStop(0.5, '#132430');
      g.addColorStop(1, '#081016');
      c.fillStyle = g;
      c.fillRect(0, 0, vw, vh);

      // Kranen aan de horizon.
      const hor = vh * 0.56;
      c.strokeStyle = '#1c2b36';
      c.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * vw + 40;
        const h = 70 + ((i * 37) % 50);
        c.beginPath();
        c.moveTo(x, hor);
        c.lineTo(x, hor - h);
        c.lineTo(x + 52, hor - h + 14);
        c.stroke();
      }

      // Weerspiegelde lichten op het water.
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const x = ((i * 97) % vw);
        const flik = 0.5 + Math.sin(t * 1.6 + i) * 0.5;
        const gr = c.createLinearGradient(x, hor, x, vh);
        gr.addColorStop(0, `rgba(255,196,110,${(0.24 * flik).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(255,196,110,0)');
        c.fillStyle = gr;
        c.fillRect(x - 4, hor, 8, vh - hor);
      }
      c.restore();

      // Rimpeling.
      c.strokeStyle = 'rgba(150,190,215,0.10)';
      c.lineWidth = 1;
      for (const w of golven) {
        const y = hor + w.y * (vh - hor);
        const x = ((w.x * vw + t * 12 * w.s) % (vw + 60)) - 30;
        c.beginPath();
        c.moveTo(x - 22 * w.s, y);
        c.lineTo(x + 22 * w.s, y);
        c.stroke();
      }

      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, 0, vw, vh);

      c.textAlign = 'center';
      c.fillStyle = '#f2e3c8';
      c.font = '700 62px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillText('BUNKERVAART', vw / 2, vh * 0.34);
      c.font = '500 16px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillStyle = 'rgba(210,226,238,0.7)';
      c.fillText('Amsterdam · Rotterdam · Antwerpen', vw / 2, vh * 0.34 + 32);
      c.font = '500 13px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillStyle = 'rgba(190,208,222,0.5)';
      c.fillText('Haal de klok. Haal de handtekening. Hou over wat je durft.', vw / 2, vh * 0.34 + 58);
    },
  };
}

// --- Menu ------------------------------------------------------------------

function toonTitelmenu() {
  const knoppen = [];
  if (heeftOpslag()) {
    knoppen.push({
      label: 'Verder varen',
      actie: () => {
        const g = laad();
        if (!g) {
          Spel.melding('Het opgeslagen spel kon niet gelezen worden.', 'rood');
          return;
        }
        scherm.sluit();
        begin(g.wereld, g.schipper);
      },
    });
  }
  knoppen.push({ label: 'Nieuwe loopbaan', actie: () => { scherm.sluit(); maakSchipperScherm(); } });
  knoppen.push({ label: 'Hoe het werkt', actie: () => toonHulp() });

  const scherm = UI.toonScherm({
    titel: 'Bunkervaart',
    onder: 'Een bunkerboot in de ARA-regio',
    bouw(body) {
      const p = el('p', 'verhaal');
      p.innerHTML = 'Je bent schipper op een bunkerboot. Je krijgt orders om zeeschepen '
        + 'van brandstof te voorzien — aan de kade, op de rede, bij de sluis. Je moet er '
        + 'op tijd zijn, langszij komen en leveren.<br><br>'
        + 'En je mag proberen er een paar procent van in je eigen tanks te houden, '
        + 'zolang de chief maar tekent zonder moeilijk te doen.';
      body.appendChild(p);
    },
    knoppen,
  });
  return scherm;
}

function toonHulp() {
  UI.toonScherm({
    titel: 'Hoe het werkt',
    breed: true,
    bouw(body) {
      body.appendChild(UI.tabel([{ label: 'Onderweg' }, { label: '' }], [
        { cellen: [{ tekst: 'W / S' }, { tekst: 'gas erop of eraf' }] },
        { cellen: [{ tekst: 'A / D' }, { tekst: 'roer bakboord of stuurboord' }] },
        { cellen: [{ tekst: '1 / 2 / 3' }, { tekst: 'tijdstand ×1, ×10, ×40' }] },
        { cellen: [{ tekst: 'E' }, { tekst: 'aanleggen, schutten of langszij gaan' }] },
        { cellen: [{ tekst: 'O' }, { tekst: 'orderbord' }] },
        { cellen: [{ tekst: 'R' }, { tekst: 'reisplan' }] },
        { cellen: [{ tekst: 'M' }, { tekst: 'overzichtskaart' }] },
        { cellen: [{ tekst: 'T' }, { tekst: 'doorliggen tot morgenochtend' }] },
        { cellen: [{ tekst: 'F' }, { tekst: 'miniatuureffect aan of uit' }] },
        { cellen: [{ tekst: 'muiswiel' }, { tekst: 'in- en uitzoomen' }] },
      ]));
      body.appendChild(UI.tabel([{ label: 'Bij de overslag' }, { label: '' }], [
        { cellen: [{ tekst: 'spatie' }, { tekst: 'openen en sluiten' }] },
        { cellen: [{ tekst: 'W / S' }, { tekst: 'pomp harder of zachter' }] },
        { cellen: [{ tekst: 'B' }, { tekst: 'briefing — hier zet je hoeveel je achterhoudt' }] },
        { cellen: [{ tekst: 'Enter' }, { tekst: 'stoppen en de bon opmaken' }] },
      ]));
      const p = el('p', 'verhaal');
      p.innerHTML = '<b>Waar het om draait.</b> Er wordt geleverd in kubieke meters en '
        + 'afgerekend in tonnen. Daartussen zitten de dichtheid en de temperatuur, en '
        + 'daar zit speling in. Hoeveel speling hangt af van dingen die je vooraf kunt '
        + 'zien: meet het schip met een massaflowmeter of met de peilstok, ligt het vlak '
        + 'of werkt het in de deining, hoe groot is de partij, en wat voor vlees heb je '
        + 'in de kuip met deze chief.<br><br>'
        + '<b>Netjes varen werkt ook.</b> Het levert minder op, maar het levert wel elke keer op.';
      body.appendChild(p);
    },
    knoppen: [{ label: 'Terug', esc: true, actie: () => UI.sluitAlles() || toonTitelmenu() }],
  });
}

function maakSchipperScherm() {
  let naam = 'Martin';
  let bootnaam = 'Nooitgedacht';
  let moeilijk = 'stuurman';

  const scherm = UI.toonScherm({
    titel: 'Nieuwe loopbaan',
    breed: true,
    bouw(body) {
      const groep = el('div', 'veldgroep');
      const mk = (label, waarde, opSchrijf) => {
        const r = el('label', 'veld');
        r.appendChild(el('span', null, label));
        const i = el('input');
        i.type = 'text';
        i.value = waarde;
        i.maxLength = 22;
        i.addEventListener('input', () => opSchrijf(i.value));
        r.appendChild(i);
        return r;
      };
      groep.appendChild(mk('Jouw naam', naam, (v) => { naam = v; }));
      groep.appendChild(mk('Naam van de boot', bootnaam, (v) => { bootnaam = v; }));
      body.appendChild(groep);

      body.appendChild(el('h3', null, 'Hoe zwaar wil je het hebben?'));
      const lijst = el('div', 'keuzelijst');
      for (const m of MOEILIJKHEDEN) {
        const k = el('button', 'keuze' + (m.id === moeilijk ? ' gekozen' : ''));
        k.innerHTML = `<b>${m.naam}</b><span class="zacht">${m.omschrijving}</span>`;
        k.addEventListener('click', () => {
          moeilijk = m.id;
          audio.sfx.klik();
          scherm.ververs();
        });
        lijst.appendChild(k);
      }
      body.appendChild(lijst);

      const b = BOTEN[1];
      const p = el('p', 'zacht');
      p.innerHTML = `Je begint met een gecharterde <b>${b.naam.toLowerCase()}</b> `
        + `(${b.tank} m³, pomp ${b.pomp} m³/uur) in de Botlek, en met 85.000 euro werkkapitaal.`;
      body.appendChild(p);
    },
    knoppen: [
      {
        label: 'Losgooien',
        actie: () => {
          scherm.sluit();
          const wereld = new Wereld(Math.floor(Math.random() * 1e9));
          const schipper = maakSchipper({ naam, bootnaam, moeilijkheid: moeilijk });
          // Startpositie: de Botlek, waar het gros van de Rijnmondse
          // bunkerboten ook werkelijk ligt.
          const start = wereld.vaarwater.ligIndex.botlek_tank;
          schipper.x = start.x;
          schipper.y = start.y;
          schipper.koers = Math.PI / 2;
          schipper.laatsteDag = Math.floor(wereld.tijd / 1440);
          wisOpslag();
          begin(wereld, schipper);
        },
      },
      { label: 'Terug', esc: true, actie: () => { scherm.sluit(); toonTitelmenu(); } },
    ],
  });
  return scherm;
}

// --- Beginnen --------------------------------------------------------------

function begin(wereld, schipper) {
  Spel.wereld = wereld;
  Spel.schipper = schipper;
  window.__B = Spel;
  import('./varen.js').then((m) => {
    Spel.zetScene(m.maakVaarScene());
    bewaar();
    Spel.melding(`Welkom aan boord, ${schipper.naam}. Druk op O voor het orderbord.`);
  });
}

// --- Opstarten -------------------------------------------------------------

const laadscherm = document.getElementById('laden');
if (laadscherm) laadscherm.remove();

Spel.zetScene(maakTitelScene());
Spel.start();
toonTitelmenu();

