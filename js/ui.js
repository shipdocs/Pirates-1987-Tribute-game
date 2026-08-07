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

  const scherm = {
    wrap,
    body,
    voet,
    kop,
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
      for (const k of typeof opts.knoppen === 'function' ? opts.knoppen(scherm) : opts.knoppen || []) {
        voet.appendChild(maakKnop(k));
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
      },
      knoppen: keuzes.map((k) => ({
        label: k.label,
        soort: k.soort,
        uit: k.uit,
        actie: () => {
          scherm.sluit();
          resolve(k.waarde);
        },
      })),
    });
  });
}

/** Klein gestileerd portret voor kroegbazen, gouverneurs en gasten. */
export function maakFiguur(soort) {
  const d = el('div', 'figuur figuur-' + soort);
  d.innerHTML = FIGUREN[soort] || '';
  return d;
}

const FIGUREN = {
  gouverneur: `<svg viewBox="0 0 80 80"><circle cx="40" cy="30" r="17" fill="#e8c9a0"/>
    <path d="M12 26 Q40 4 68 26 L64 30 Q40 14 16 30 Z" fill="#2f2a44"/>
    <path d="M18 78 Q40 52 62 78 Z" fill="#7a2b3a"/>
    <path d="M34 52 L40 66 L46 52 Z" fill="#f0e3c4"/>
    <circle cx="34" cy="30" r="2.2" fill="#2b1d12"/><circle cx="46" cy="30" r="2.2" fill="#2b1d12"/>
    <path d="M34 40 Q40 44 46 40" stroke="#8a5c3a" stroke-width="2" fill="none"/></svg>`,
  kroegbaas: `<svg viewBox="0 0 80 80"><circle cx="40" cy="32" r="17" fill="#dcb185"/>
    <path d="M20 24 Q40 10 60 24 L58 28 Q40 18 22 28 Z" fill="#5a4632"/>
    <path d="M16 78 Q40 54 64 78 Z" fill="#6d5a3c"/>
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/><circle cx="46" cy="31" r="2.2" fill="#2b1d12"/>
    <path d="M30 42 Q40 50 50 42 L50 46 Q40 54 30 46 Z" fill="#4a3524"/></svg>`,
  dame: `<svg viewBox="0 0 80 80"><path d="M18 34 Q18 8 40 8 Q62 8 62 34 L62 46 Q40 40 18 46 Z" fill="#6b3b2a"/>
    <circle cx="40" cy="34" r="15" fill="#f0d3b4"/>
    <circle cx="35" cy="33" r="2" fill="#3a2418"/><circle cx="45" cy="33" r="2" fill="#3a2418"/>
    <path d="M36 42 Q40 45 44 42" stroke="#a8474a" stroke-width="2" fill="none"/>
    <path d="M14 78 Q40 50 66 78 Z" fill="#8d3f57"/></svg>`,
  zeeman: `<svg viewBox="0 0 80 80"><circle cx="40" cy="32" r="17" fill="#c99a6e"/>
    <path d="M18 26 Q40 12 62 26 L62 30 L18 30 Z" fill="#8a2f2f"/>
    <path d="M16 78 Q40 52 64 78 Z" fill="#37506b"/>
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/>
    <path d="M42 27 L52 33 L42 35 Z" fill="#2b1d12"/>
    <path d="M32 43 Q40 48 48 43" stroke="#5a3a24" stroke-width="2" fill="none"/></svg>`,
  koopman: `<svg viewBox="0 0 80 80"><circle cx="40" cy="32" r="16" fill="#e3bd93"/>
    <path d="M22 28 Q40 14 58 28 L56 32 Q40 22 24 32 Z" fill="#3a3a44"/>
    <path d="M16 78 Q40 52 64 78 Z" fill="#3f5a44"/>
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/><circle cx="46" cy="31" r="2.2" fill="#2b1d12"/>
    <path d="M33 43 L47 43" stroke="#7a5238" stroke-width="2"/></svg>`,
  timmerman: `<svg viewBox="0 0 80 80"><circle cx="40" cy="32" r="17" fill="#d3a273"/>
    <path d="M20 27 Q40 13 60 27 L58 31 Q40 21 22 31 Z" fill="#7a6a4a"/>
    <path d="M16 78 Q40 52 64 78 Z" fill="#5c6b4a"/>
    <circle cx="34" cy="31" r="2.2" fill="#2b1d12"/><circle cx="46" cy="31" r="2.2" fill="#2b1d12"/>
    <path d="M30 44 Q40 50 50 44" stroke="#5a3a24" stroke-width="2" fill="none"/></svg>`,
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
