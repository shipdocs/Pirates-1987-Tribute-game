// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Schermen die over het canvas heen liggen (orderbord, terminal, dialogen).
// Overgenomen uit Zeeroverij: dezelfde API, ander uiterlijk via de CSS.
import { el } from './util.js';
import * as audio from './audio.js';

const laag = () => document.getElementById('ui');

let stapel = [];

function maakKnop(k) {
  const b = el('button', 'knop' + (k.soort ? ' knop-' + k.soort : ''));
  b.innerHTML = k.label;
  if (k.uit) b.disabled = true;
  if (k.sleutel) {
    const s = el('span', 'knop-sleutel', k.sleutel);
    b.prepend(s);
  }
  b.addEventListener('click', () => {
    if (b.disabled) return;
    audio.sfx.klik();
    k.actie && k.actie();
  });
  return b;
}

/**
 * Toont een perkamentpaneel.
 * opts: {titel, onder, bouw(body, scherm), knoppen[], breed, klasse, opAchtergrondKlik}
 */
export function toonScherm(opts) {
  const wrap = el('div', 'overlay' + (opts.klasse ? ' ' + opts.klasse : ''));
  const paneel = el('div', 'paneel' + (opts.breed ? ' paneel-breed' : ''));

  const kop = el('div', 'paneel-kop');
  kop.appendChild(el('h2', null, opts.titel || ''));
  if (opts.onder) kop.appendChild(el('div', 'paneel-sub', opts.onder));
  paneel.appendChild(kop);

  const body = el('div', 'paneel-body');
  paneel.appendChild(body);

  const voet = el('div', 'paneel-voet');
  paneel.appendChild(voet);

  wrap.appendChild(paneel);
  laag().appendChild(wrap);

  const scherm = {
    wrap,
    body,
    voet,
    kop,
    // De knop die Escape indrukt, of null als dit scherm niet zomaar weg mag.
    escKnop: null,
    sluit() {
      wrap.remove();
      stapel = stapel.filter((s) => s !== scherm);
      opts.opSluiten && opts.opSluiten();
    },
    zetOnder(tekst) {
      let sub = kop.querySelector('.paneel-sub');
      if (!sub) {
        sub = el('div', 'paneel-sub');
        kop.appendChild(sub);
      }
      sub.textContent = tekst;
    },
    ververs() {
      body.innerHTML = '';
      voet.innerHTML = '';
      opts.bouw && opts.bouw(body, scherm);
      const lijst = typeof opts.knoppen === 'function' ? opts.knoppen(scherm) : opts.knoppen || [];
      scherm.escKnop = null;
      for (const k of lijst) {
        voet.appendChild(maakKnop(k));
        if (k.esc && !k.uit) scherm.escKnop = k;
      }
      // Eén enkele knop is een mededeling, geen keuze: Escape bevestigt hem.
      // Bij 'gevaar' niet, want dat is altijd een onomkeerbaar besluit.
      if (!scherm.escKnop && lijst.length === 1 && !lijst[0].uit && lijst[0].soort !== 'gevaar') {
        scherm.escKnop = lijst[0];
      }
    },
  };

  scherm.ververs();
  stapel.push(scherm);
  requestAnimationFrame(() => wrap.classList.add('zichtbaar'));
  return scherm;
}

/** Eenvoudige ja/nee- of meerkeuzevraag. Levert de gekozen waarde. */
export function vraag(titel, tekst, keuzes, opts = {}) {
  return new Promise((resolve) => {
    const scherm = toonScherm({
      titel,
      klasse: 'overlay-smal ' + (opts.klasse || ''),
      bouw(body) {
        if (opts.figuur) {
          body.appendChild(maakFiguur(opts.figuur));
        }
        const p = el('p', 'verhaal');
        p.innerHTML = tekst;
        body.appendChild(p);
        // Optioneel beeld onder de tekst, bijvoorbeeld het herkenningspunt
        // waar je op de schatjacht naast staat.
        if (opts.paneel) body.appendChild(opts.paneel);
      },
      knoppen: keuzes.map((k) => ({
        label: k.label,
        soort: k.soort,
        uit: k.uit,
        esc: k.esc,
        actie: () => {
          scherm.sluit();
          resolve(k.waarde);
        },
      })),
    });
  });
}

/**
 * Gegraveerd icoontje voor op een knop. Het neemt de tekstkleur over, zodat het
 * bij de rest van het perkament past — in tegenstelling tot emoji, die hun eigen
 * kleuren meebrengen en er op elk besturingssysteem anders uitzien.
 */
export function ikoon(naam) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ikoon');
  s.setAttribute('aria-hidden', 'true');
  const pad = (d, vul) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', vul ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return p;
  };
  switch (naam) {
    case 'druppel': // brandstof
      pad('M12 3c3.5 4.4 5.5 7.2 5.5 9.8A5.5 5.5 0 0 1 12 18.3a5.5 5.5 0 0 1-5.5-5.5C6.5 10.2 8.5 7.4 12 3z');
      break;
    case 'boot':
      pad('M3 16.5h18l-2 4H5z');
      pad('M6 16.5V10h12v6.5');
      pad('M9 10V6.5h4V10');
      break;
    case 'sluis':
      pad('M4 4v16M20 4v16');
      pad('M4 12h6M14 12h6');
      pad('M10 8v8M14 8v8');
      break;
    case 'klok':
      pad('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z');
      pad('M12 8v4.4l3 1.8');
      break;
    case 'euro':
      pad('M16.5 6.4A6.2 6.2 0 0 0 7.5 12a6.2 6.2 0 0 0 9 5.6');
      pad('M4.8 10.4h7M4.8 13.6h7');
      break;
    case 'papier':
      pad('M6 3h8l4 4v14H6z');
      pad('M14 3v4h4');
      pad('M9 12h6M9 16h6');
      break;
    case 'golf':
      pad('M3 9c2.2 0 2.2 2 4.4 2S9.6 9 11.8 9s2.2 2 4.4 2 2.2-2 4.4-2');
      pad('M3 15c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2');
      break;
    case 'anker':
      pad('M12 7v13');
      pad('M12 4.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z');
      pad('M7.5 11h9');
      pad('M4.5 15c0 3.2 3.4 5 7.5 5s7.5-1.8 7.5-5');
      break;
    case 'waarschuwing':
      pad('M12 3.6 21.2 20H2.8z');
      pad('M12 9.6v4.6M12 17.1h.01');
      break;
    default:
      pad('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z');
  }
  return s;
}

/**
 * Groot beeldmerk boven een dialoog: geen tekening van een persoon maar een
 * gegraveerd symbool dat de situatie benoemt. Zeeroverij zette hier een
 * gouverneur of een waard neer; hier is de tegenspeler meestal een meting, een
 * sluis of een stuk papier, en dat tekent beter als symbool dan als portret.
 */
export function maakFiguur(soort) {
  const d = el('div', 'figuur figuur-' + soort);
  const i = ikoon(
    soort === 'chief' ? 'papier'
      : soort === 'sluis' ? 'sluis'
      : soort === 'order' ? 'euro'
      : soort === 'overslag' ? 'druppel'
      : soort === 'weer' ? 'golf'
      : soort === 'gevaar' ? 'waarschuwing'
      : 'boot',
  );
  i.setAttribute('class', 'ikoon ikoon-groot');
  d.appendChild(i);
  return d;
}

export function tabel(kolommen, rijen) {
  const t = el('table', 'tabel');
  const thead = el('thead');
  const tr = el('tr');
  for (const k of kolommen) {
    const th = el('th', k.rechts ? 'rechts' : null, k.label);
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  t.appendChild(thead);
  const tb = el('tbody');
  for (const r of rijen) {
    const rij = el('tr', r.klasse);
    for (const c of r.cellen) {
      const td = el('td', c.klasse);
      if (c.node) td.appendChild(c.node);
      else td.innerHTML = c.html != null ? c.html : c.tekst || '';
      rij.appendChild(td);
    }
    tb.appendChild(rij);
  }
  t.appendChild(tb);
  return t;
}

export function balk(waarde, max, kleur, label) {
  const d = el('div', 'balk');
  const v = el('div', 'balk-vul');
  v.style.width = Math.max(0, Math.min(100, (waarde / max) * 100)) + '%';
  v.style.background = kleur;
  d.appendChild(v);
  if (label) {
    const l = el('span', 'balk-label', label);
    d.appendChild(l);
  }
  return d;
}

export function sluitAlles() {
  for (const s of [...stapel]) s.sluit();
  stapel = [];
}

export function ietsOpen() {
  return stapel.length > 0;
}

/**
 * Escape sluit het bovenste scherm. Welke knop dat is, bepaalt het scherm zelf
 * met `esc: true` — anders zou Escape een keuze voor de speler maken die hij
 * niet heeft gemaakt, en bij een dialoog uit `vraag()` zou de belofte nooit
 * worden ingelost en het spel stilvallen.
 *
 * `stopImmediatePropagation` is nodig omdat `game.js` op hetzelfde venster naar
 * Escape luistert: zonder dat zou het sluiten van dit scherm meteen de
 * scheepsraad eronder openen.
 */
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || !stapel.length) return;
  const boven = stapel[stapel.length - 1];
  if (!boven.escKnop) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  audio.sfx.klik();
  boven.escKnop.actie && boven.escKnop.actie();
});
