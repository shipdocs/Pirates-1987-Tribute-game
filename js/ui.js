// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Perkamenten schermen die over het canvas heen liggen (havens, dialogen, menu's).
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

  const peilMeer = () =>
    body.classList.toggle('meer-onder', body.scrollTop + body.clientHeight < body.scrollHeight - 4);
  body.addEventListener('scroll', peilMeer, { passive: true });
  window.addEventListener('resize', peilMeer);

  const scherm = {
    wrap,
    body,
    voet,
    kop,
    // De knop die Escape indrukt, of null als dit scherm niet zomaar weg mag.
    escKnop: null,
    sluit() {
      window.removeEventListener('resize', peilMeer);
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
      requestAnimationFrame(peilMeer);
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
  const p = IKONEN[naam];
  if (!p) return '';
  return `<svg class="ikoon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${p}</svg>`;
}

const IKONEN = {
  kroeg:
    '<path d="M3.2 3h6.6v10H3.2z" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M9.8 5.2h2.4a1.6 1.6 0 0 1 0 3.2H9.8" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M3.2 3h6.6v2.1H3.2z" fill="currentColor"/>',
  koopman:
    '<path d="M8 2.2v10.6M4 12.8h8M2.6 5h10.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M2.6 5 .8 9h3.6zM13.4 5l-1.8 4h3.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  werf:
    '<path d="M2.4 13.2 8 7.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '<path d="M7.2 4.4 10 1.6l4.6 4.6-2.8 2.8z" fill="currentColor"/>',
  gouverneur:
    '<path d="M1.2 6.2 8 2.2l6.8 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M3.4 7.4v5.4M6.5 7.4v5.4M9.5 7.4v5.4M12.6 7.4v5.4" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M1.6 14h12.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  sabels:
    '<path d="M3 13.2 12.4 3M3.6 3 13 13.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="3" cy="13.2" r="1.4" fill="currentColor"/><circle cx="13" cy="13.2" r="1.4" fill="currentColor"/>',
  zeil:
    '<path d="M8 1.4v9.4" stroke="currentColor" stroke-width="1.2"/>' +
    '<path d="M8.7 2.6 13 10.8H8.7z" fill="currentColor"/>' +
    '<path d="M7.3 3.6 3.6 10.8h3.7z" fill="currentColor" opacity="0.72"/>' +
    '<path d="M1.4 12h13.2l-1.9 2.8H3.3z" fill="currentColor"/>',
  // Een samengerold bevelschrift (voor gouverneursopdrachten).
  opdracht:
    '<path d="M3.4 13.8V3.2L6.6 5.4 8.8 3.2l2.2 2.2 3-2.2v10.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M4.4 7.8h7M4.4 9.8h5.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  familie:
    '<circle cx="5" cy="4.6" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M1.8 8.5a3.4 3.4 0 0 1 6.4 0M8.6 4.4a1.8 1.8 0 0 1 .6 0" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
    '<circle cx="11" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M8.6 8.6a3.6 3.6 0 0 1 5.4 0" fill="none" stroke="currentColor" stroke-width="1.2"/>',
};

/** Klein gestileerd portret voor kroegbazen, gouverneurs en gasten. */
export function maakFiguur(soort) {
  const d = el('div', 'figuur figuur-' + soort);
  d.innerHTML = FIGUREN[soort] || '';
  return d;
}

const FIGUREN = {
  gouverneur: `<svg viewBox="0 0 80 80">
    <!-- Kragen en jas -->
    <path d="M18 78 Q40 52 62 78 Z" fill="#5c2530"/>
    <path d="M24 78 Q40 60 56 78 Z" fill="#7a2b3a"/>
    <!-- Witte kraag -->
    <path d="M26 54 L40 66 L54 54 L54 62 L40 74 L26 62 Z" fill="#f0e3c4"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="34" rx="18" ry="20" fill="#e8c9a0"/>
    <!-- Pruik/powdered hair -->
    <path d="M20 30 Q22 8 40 8 Q58 8 60 30 Q62 40 56 42 L56 32 Q40 18 24 32 L24 42 Q18 40 20 30" fill="#eaddcf"/>
    <path d="M24 32 Q24 42 20 46 L22 52 Q30 44 30 36" fill="#eaddcf"/>
    <path d="M56 32 Q56 42 60 46 L58 52 Q50 44 50 36" fill="#eaddcf"/>
    <!-- Gezicht -->
    <circle cx="34" cy="34" r="2" fill="#2b1d12"/>
    <circle cx="46" cy="34" r="2" fill="#2b1d12"/>
    <path d="M36 44 Q40 41 44 44" stroke="#8a5c3a" stroke-width="1.5" fill="none"/>
    <!-- Neus -->
    <path d="M40 34 L38 42 L42 42 Z" fill="#d4a87a"/>
    <!-- Medaille -->
    <circle cx="40" cy="58" r="4" fill="#d9a441"/>
    <path d="M34 52 L40 58 L46 52" stroke="#d9a441" stroke-width="2" fill="none"/>
    </svg>`,
  kroegbaas: `<svg viewBox="0 0 80 80">
    <!-- Schort/lijf -->
    <path d="M16 78 Q40 54 64 78 Z" fill="#6d5a3c"/>
    <path d="M22 78 Q40 60 58 78 Z" fill="#4a3520"/>
    <rect x="28" y="58" width="24" height="16" rx="2" fill="#8a7a5a"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="33" rx="18" ry="19" fill="#dcb185"/>
    <!-- Haar/baard -->
    <path d="M22 28 Q40 10 58 28 Q62 38 54 46 Q56 54 40 56 Q24 54 26 46 Q18 38 22 28" fill="#5a4632"/>
    <path d="M28 42 Q40 58 52 42" fill="#5a4632"/>
    <!-- Gezicht -->
    <circle cx="34" cy="32" r="2.2" fill="#2b1d12"/>
    <circle cx="46" cy="32" r="2.2" fill="#2b1d12"/>
    <circle cx="31" cy="39" r="3" fill="#c97a5a" opacity="0.4"/>
    <circle cx="49" cy="39" r="3" fill="#c97a5a" opacity="0.4"/>
    <path d="M32 47 Q40 53 48 47" stroke="#4a3524" stroke-width="2" fill="none"/>
    <!-- Bierkroes -->
    <path d="M56 62 L56 74 Q56 78 62 78 Q68 78 68 74 L68 62 Z" fill="#8a6a3a"/>
    <path d="M54 60 L70 60 L68 64 L56 64 Z" fill="#a88a5a"/>
    <path d="M60 64 L60 74" stroke="#d9a441" stroke-width="2" opacity="0.5"/>
    </svg>`,
  dame: `<svg viewBox="0 0 80 80">
    <!-- Jurk -->
    <path d="M14 78 Q40 48 66 78 Z" fill="#8d3f57"/>
    <path d="M20 78 Q40 56 60 78 Z" fill="#a8506a"/>
    <!-- Mouwen/lijf -->
    <path d="M22 50 L58 50 L62 68 L18 68 Z" fill="#8d3f57"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="35" rx="16" ry="17" fill="#f0d3b4"/>
    <!-- Haar -->
    <path d="M20 34 Q20 12 40 12 Q60 12 60 34 Q62 46 54 50 L54 38 Q40 26 26 38 L26 50 Q18 46 20 34" fill="#6b3b2a"/>
    <path d="M26 38 Q20 54 18 62 L28 56" fill="#6b3b2a"/>
    <path d="M54 38 Q60 54 62 62 L52 56" fill="#6b3b2a"/>
    <!-- Gezicht -->
    <circle cx="35" cy="34" r="2" fill="#3a2418"/>
    <circle cx="45" cy="34" r="2" fill="#3a2418"/>
    <path d="M36 42 Q40 45 44 42" stroke="#a8474a" stroke-width="1.8" fill="none"/>
    <!-- Waaier -->
    <path d="M52 56 L64 48 Q66 58 64 66 L52 60 Z" fill="#f0e3c4"/>
    <path d="M54 56 L62 52" stroke="#a8474a" stroke-width="1"/>
    <path d="M54 58 L62 56" stroke="#a8474a" stroke-width="1"/>
    <path d="M54 60 L62 62" stroke="#a8474a" stroke-width="1"/>
    <!-- Ketting -->
    <path d="M30 50 Q40 56 50 50" stroke="#d9a441" stroke-width="1.5" fill="none"/>
    </svg>`,
  zeeman: `<svg viewBox="0 0 80 80">
    <!-- Lijf -->
    <path d="M16 78 Q40 52 64 78 Z" fill="#37506b"/>
    <path d="M24 78 Q40 58 56 78 Z" fill="#2a3f54"/>
    <!-- Gestreept shirt -->
    <rect x="24" y="52" width="32" height="22" fill="#8a2f2f"/>
    <rect x="24" y="56" width="32" height="4" fill="#e8dcc0"/>
    <rect x="24" y="64" width="32" height="4" fill="#e8dcc0"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="33" rx="17" ry="18" fill="#c99a6e"/>
    <!-- Bandana -->
    <path d="M22 28 Q40 12 58 28 L60 32 Q40 20 20 32 Z" fill="#8a2f2f"/>
    <path d="M52 24 L64 18 L60 30 Z" fill="#8a2f2f"/>
    <!-- Baard -->
    <path d="M28 40 Q40 58 52 40" fill="#3a2618"/>
    <path d="M30 36 Q40 48 50 36" fill="#c99a6e"/>
    <!-- Ooglap -->
    <path d="M42 28 L52 26 L52 36 L42 34 Z" fill="#241a10"/>
    <path d="M52 31 L58 31" stroke="#241a10" stroke-width="2"/>
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/>
    <!-- Lach -->
    <path d="M32 45 Q40 50 48 45" stroke="#5a3a24" stroke-width="2" fill="none"/>
    </svg>`,
  koopman: `<svg viewBox="0 0 80 80">
    <!-- Lijf -->
    <path d="M16 78 Q40 52 64 78 Z" fill="#3f5a44"/>
    <path d="M24 78 Q40 60 56 78 Z" fill="#2f4536"/>
    <!-- Witte kraag -->
    <path d="M26 56 L40 66 L54 56 L54 62 L40 72 L26 62 Z" fill="#f0e3c4"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="33" rx="17" ry="18" fill="#e3bd93"/>
    <!-- Hoed -->
    <ellipse cx="40" cy="22" rx="22" ry="6" fill="#3a3a44"/>
    <path d="M28 22 Q28 10 40 10 Q52 10 52 22" fill="#3a3a44"/>
    <!-- Gezicht -->
    <circle cx="34" cy="33" r="2.2" fill="#2b1d12"/>
    <circle cx="46" cy="33" r="2.2" fill="#2b1d12"/>
    <!-- Brilletje -->
    <circle cx="34" cy="33" r="4" stroke="#5a4632" stroke-width="1" fill="none"/>
    <circle cx="46" cy="33" r="4" stroke="#5a4632" stroke-width="1" fill="none"/>
    <path d="M38 33 L42 33" stroke="#5a4632" stroke-width="1"/>
    <!-- Snor -->
    <path d="M33 43 Q40 46 47 43" stroke="#7a5238" stroke-width="2" fill="none"/>
    <!-- Boek/rekeningen -->
    <rect x="50" y="58" width="18" height="14" fill="#e8dcc0"/>
    <path d="M53 62 L65 62 M53 65 L65 65" stroke="#8a7a5a" stroke-width="1"/>
    </svg>`,
  timmerman: `<svg viewBox="0 0 80 80">
    <!-- Lijf -->
    <path d="M16 78 Q40 52 64 78 Z" fill="#5c6b4a"/>
    <path d="M24 78 Q40 60 56 78 Z" fill="#4a5a3a"/>
    <!-- Schort -->
    <path d="M28 56 L52 56 L56 78 L24 78 Z" fill="#7a6a4a"/>
    <rect x="30" y="54" width="20" height="6" rx="2" fill="#8a7a5a"/>
    <!-- Hoofd -->
    <ellipse cx="40" cy="33" rx="17" ry="18" fill="#d3a273"/>
    <!-- Pet -->
    <path d="M22 28 Q40 14 58 28 L56 32 Q40 22 24 32 Z" fill="#7a6a4a"/>
    <path d="M18 30 L24 28 L24 32 Z" fill="#5a4a32"/>
    <!-- Baard/snor -->
    <path d="M28 40 Q40 56 52 40" fill="#5a4a32"/>
    <path d="M30 36 Q40 44 50 36" fill="#d3a273"/>
    <!-- Gezicht -->
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/>
    <circle cx="46" cy="31" r="2.2" fill="#2b1d12"/>
    <path d="M32 44 Q40 50 48 44" stroke="#5a3a24" stroke-width="2" fill="none"/>
    <!-- Hamer -->
    <rect x="54" y="54" width="6" height="20" fill="#8a6a4a"/>
    <rect x="50" y="50" width="14" height="8" rx="2" fill="#5a5a66"/>
    </svg>`,
};

/** Tabelrij-helper voor handel en overzichten. */
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
