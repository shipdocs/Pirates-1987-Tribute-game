// Afgesplitst van town.js: de haveningang, het hoofdmenu en de havenprent.
import { makeRng, clamp, fmtGold, fmtDate, el } from '../util.js';
import { NATIES } from '../data.js';
import { Game, vlaggenschip, vlootScheepsvolkMax, PENSIOEN_DRANG } from '../game.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { schemerFactor } from '../render/zee.js';
import { kroeg } from './kroeg.js';
import { handel } from './handel.js';
import { werf } from './werf.js';
import { gouverneur } from './gouverneur.js';
import { bestormStad } from './bestorming.js';
import { zoekFamilie } from './familie.js';
import { tredAf } from './aftreden.js';
import { relatieWoord } from './relatie.js';

const rng = Math.random;

/** Bedrag en voorraden van de stad. */
const HP = { land: 64, strand: 82, water: 88, kade: 110 };

export function openHaven(stad, opVertrek) {
  const s = Game.speler;
  const vijandig = s.relatie[stad.natie] <= -50 && stad.natie !== 'piraat';

  if (vijandig) {
    UI.toonScherm({
      titel: `${stad.naam} weigert je`,
      onder: `${NATIES[stad.natie].bijv} bezit · garnizoen ${Math.round(stad.garnizoen)} man`,
      klasse: 'overlay-smal',
      bouw(body) {
        body.appendChild(UI.maakFiguur('zeeman'));
        const p = el('p', 'verhaal');
        p.innerHTML =
          `Het geschut van het fort volgt je schip. Op de kade wappert de ${NATIES[stad.natie].bijv.toLowerCase()} vlag, ` +
          'en jouw naam staat er zwart op wit als vijand van de kroon.';
        body.appendChild(p);
      },
      knoppen: (sch) => [
        {
          label: 'De stad bestormen',
          soort: 'gevaar',
          actie: () => {
            sch.sluit();
            bestormStad(stad, opVertrek);
          },
        },
        {
          label: 'Afvaren',
          actie: () => {
            sch.sluit();
            opVertrek();
          },
        },
      ],
    });
    return;
  }

  audio.sfx.haven();
  if (magPensioenVragen(stad)) pensioenAanbod(stad, opVertrek);
  else hoofdmenu(stad, opVertrek);
}

// --- Op leeftijd ----------------------------------------------------------

/**
 * Een bevriende haven waar hij rang genoeg heeft, legt een oude kapitein het
 * commando neer. Hoogstens één keer per half jaar, zodat het aandringen blijft
 * en niet gaat zeuren.
 */
function magPensioenVragen(stad) {
  const s = Game.speler;
  return (
    s.leeftijd >= PENSIOEN_DRANG &&
    !s.gestopt &&
    s.rang[stad.natie] >= 2 &&
    s.relatie[stad.natie] > -25 &&
    s.dag - (s.pensioenGevraagd || 0) > 180
  );
}

function pensioenAanbod(stad, opVertrek) {
  const s = Game.speler;
  s.pensioenGevraagd = s.dag;
  UI.toonScherm({
    titel: 'De jaren tellen',
    onder: `${stad.naam} · ${Math.floor(s.leeftijd)} jaar`,
    klasse: 'overlay-smal',
    bouw(body) {
      body.appendChild(UI.maakFiguur('gouverneur'));
      const p = el('p', 'verhaal');
      p.innerHTML =
        `De gouverneur laat je naast het vuur plaatsnemen. "Kapitein, u vaart al ` +
        `<b>${Math.max(1, Math.floor(s.leeftijd - s.startLeeftijd))} jaar</b>. Er is een huis vrij ` +
        `boven de rede, en de kroon zou het u niet kwalijk nemen. Het staal wordt zwaar, ` +
        'en de zee wacht op niemand."';
      body.appendChild(p);
    },
    knoppen: (sch) => [
      {
        label: 'Het commando neerleggen',
        actie: () => {
          sch.sluit();
          tredAf(stad);
        },
      },
      {
        label: 'Nog één reis',
        esc: true,
        actie: () => {
          sch.sluit();
          hoofdmenu(stad, opVertrek);
        },
      },
    ],
  });
}

function hoofdmenu(stad, opVertrek) {
  const s = Game.speler;
  const natie = NATIES[stad.natie];

  const scherm = UI.toonScherm({
    titel: stad.naam,
    onder: `${natie.bijv} · ${stad.soort} · ${Math.round(stad.bevolking).toLocaleString('nl-NL')} zielen · ${fmtDate(s.dag)}`,
    klasse: 'overlay-haven',
    bouw(body) {
      body.appendChild(havenPrent(stad));
      const info = el('div', 'haven-info');
      info.innerHTML =
        `<span>Goud in het ruim</span><b>${fmtGold(s.goud)}</b>` +
        `<span>Scheepsvolk</span><b>${s.scheepsvolk} / ${vlootScheepsvolkMax(s)}</b>` +
        `<span>Geest aan boord</span><b>${Math.round(s.geest)}%</b>` +
        `<span>Romp vlaggenschip</span><b>${Math.round(vlaggenschip(s).romp)} / ${vlaggenschip(s).maxRomp}</b>` +
        `<span>Verhouding met ${natie.naam}</span><b>${relatieWoord(s.relatie[stad.natie])}</b>`;
      body.appendChild(info);
    },
    knoppen: (sch) => [
      { label: `${UI.ikoon('kroeg')}De kroeg`, actie: () => kroeg(stad, sch) },
      { label: `${UI.ikoon('koopman')}De koopman`, actie: () => handel(stad, sch) },
      { label: `${UI.ikoon('werf')}De scheepswerf`, actie: () => werf(stad, sch) },
      { label: `${UI.ikoon('gouverneur')}De gouverneur`, actie: () => gouverneur(stad, sch) },
      {
        label: `${UI.ikoon('sabels')}De stad bestormen`,
        soort: 'gevaar',
        actie: () => {
          sch.sluit();
          bestormStad(stad, opVertrek);
        },
      },
      // Langs de kade vragen naar het vermiste familielid. Zodra het spoor
      // gevonden is heeft navragen geen zin meer: dan vaart het antwoord rond.
      ...(!s.familie?.gevonden && !s.familie?.spoor && s.familie?.zoekStad === stad.naam
        ? [
            {
              label: `${UI.ikoon('familie')}Naar je ${s.familie.rol} vragen`,
              actie: () => zoekFamilie(stad, sch),
            },
          ]
        : []),
      {
        label: `${UI.ikoon('zeil')}Uitvaren`,
        esc: true,
        actie: () => {
          sch.sluit();
          opVertrek();
        },
      },
    ],
  });
  return scherm;
}

// --- Havenprent ------------------------------------------------------------

// Vaste hoogtelijnen van de havenprent. De stad staat op de oeverstrook, het
// water ligt daarvóór en de kade is de voorgrond — zo staan de huizen niet
// langer met hun voeten in zee.
function prentPalm(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0 Q3 -12 7 -23" stroke="#5b4527" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M7 -23 Q-4 -29 -12 -25 Q-2 -33 7 -26 Z" fill="#3c6d38"/>
    <path d="M7 -23 Q18 -30 26 -26 Q16 -33 7 -26 Z" fill="#2f5a30"/>
    <path d="M7 -23 Q2 -34 -5 -37 Q6 -36 8 -27 Z" fill="#3c6d38"/>
    <path d="M7 -23 Q14 -34 21 -36 Q11 -36 8 -27 Z" fill="#2f5a30"/>
    <circle cx="6" cy="-21" r="1.6" fill="#4a3a22"/>
  </g>`;
}

/**
 * Gemeerd schip met opgegeide zeilen; (x, y) is de waterlijn. Romp, kasteel en
 * boegspriet moeten er zijn, anders leest een mast met een ra als een kruis.
 */
function prentSchip(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-26 0 Q-22 9 -2 9 Q20 9 26 0 Z" fill="#5c4324"/>
    <path d="M-26 0 L26 0" stroke="#2f2213" stroke-width="1.4"/>
    <path d="M-18 -2 L18 -2" stroke="#8a6a3a" stroke-width="1.1" opacity="0.65"/>
    <path d="M-26 0 L-26 -7 L-13 -7 L-13 0 Z" fill="#6b4e2e"/>
    <path d="M23 -1 L34 -6" stroke="#3a2a18" stroke-width="1.6"/>
    <path d="M-6 -7 L-6 -30" stroke="#3a2a18" stroke-width="2"/>
    <path d="M10 -3 L10 -23" stroke="#3a2a18" stroke-width="1.7"/>
    <path d="M-16 -24 L4 -24" stroke="#3a2a18" stroke-width="1.6"/>
    <path d="M-15 -23.2 Q-6 -15.4 3 -23.2 Q-6 -19.2 -15 -23.2 Z" fill="#efe4c8"/>
    <path d="M-14 -14 L2 -14" stroke="#3a2a18" stroke-width="1.4"/>
    <path d="M-13 -13.2 Q-6 -6.4 1 -13.2 Q-6 -9.8 -13 -13.2 Z" fill="#efe4c8"/>
    <path d="M2 -18 L18 -18" stroke="#3a2a18" stroke-width="1.4"/>
    <path d="M3 -17.2 Q10 -11 17 -17.2 Q10 -13.8 3 -17.2 Z" fill="#efe4c8"/>
    <path d="M-6 -30 L-14 -28 L-6 -26 Z" fill="#b3502f"/>
  </g>`;
}

/** Roeisloep op de voorgrond. */
function prentSloep(x, y, s, kleur) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-22 0 Q-18 7 0 7 Q18 7 22 0 Z" fill="${kleur}"/>
    <path d="M-22 0 L22 0" stroke="#2f2213" stroke-width="1.1"/>
    <path d="M-12 0 L-19 -6 M12 0 L19 -6" stroke="#3a2a18" stroke-width="1.1"/>
  </g>`;
}

/**
 * De prent boven het havenmenu. Het aantal gevels loopt mee met de grootte van
 * de stad, en elke stadssoort krijgt zijn eigen rekwisieten — anders ziet een
 * gehucht op een plantage-eiland er precies zo uit als Cartagena.
 */
// Elke prent krijgt eigen id's: onder de kroeg of de werf staat de haven
// zelf nog open, en twee <svg>'s met dezelfde verloop-id's lenen elkaars
// kleuren zodra het uur tussendoor verschuift.
let prentTeller = 0;

/**
 * Het palet van de prent volgt hetzelfde etmaal als de zee buiten: een haven
 * die je om middernacht binnenloopt, hoort geen middagzon te hebben.
 */
function prentPalet() {
  const schemer = schemerFactor();
  if (schemer > 0.68) {
    return {
      soort: 'nacht',
      lucht: ['#060d20', '#122449', '#2b3f63'],
      hemellicht: { x: 70, y: 26, r: 9, kleur: '#f3eedb' },
      water: ['#1d3150', '#0a1628'],
      bergen: ['#1f2d42', '#19293a', '#132a2c'],
      wolk: '#56688a',
      tint: ['#0b1838', 0.5],
    };
  }
  if (schemer > 0.3) {
    return {
      soort: 'schemer',
      lucht: ['#2c3d6a', '#b0707a', '#f2aa62'],
      hemellicht: { x: 330, y: 60, r: 16, kleur: '#ffd28e' },
      water: ['#6c5f78', '#1e3d5a'],
      bergen: ['#8a6a7c', '#5a5a5a', '#3c5a40'],
      wolk: '#f2b48a',
      tint: ['#6a3a3a', 0.16],
    };
  }
  return {
    soort: 'dag',
    lucht: ['#3f86bf', '#8cc0dc', '#efe2c2'],
    hemellicht: { x: 340, y: 28, r: 15, kleur: '#fff5d8' },
    water: ['#3b93ae', '#1b5876'],
    bergen: ['#9dbcb8', '#6a957a', '#46724a'],
    wolk: '#ffffff',
    tint: ['#000000', 0],
  };
}

function havenPrent(stad) {
  const natie = NATIES[stad.natie];
  const r = makeRng(stad.id * 7817 + 29);
  const soort = stad.soort;
  const pal = prentPalet();
  const nacht = pal.soort === 'nacht';
  const id = `hp${++prentTeller}`;

  // Gevels langs de kade, met een schaduwzijde van het licht af en 's nachts
  // hier en daar een verlicht raam.
  let gevels = '';
  let schaduw = '';
  let daken = '';
  let ramen = '';
  let lichten = '';
  let rook = '';
  let bx = 138;
  const gevelMax = clamp(2 + stad.grootte, 3, 8);
  for (let i = 0; i < gevelMax && bx < 282; i++) {
    const bw = 18 + Math.round(r() * 10);
    const bh = (soort === 'roversnest' ? 12 : 16) + Math.round(r() * (soort === 'roversnest' ? 8 : 14));
    const by = 82 - bh;
    gevels += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
    schaduw += `<rect x="${bx + bw * 0.62}" y="${by}" width="${bw * 0.38}" height="${bh}"/>`;
    daken += `<path d="M${bx - 2} ${by} L${bx + bw / 2} ${by - 9} L${bx + bw + 2} ${by} Z"/>`;
    const raamPlekken = [[bx + 4, by + 5]];
    if (bw > 23) raamPlekken.push([bx + bw - 8, by + 5]);
    if (bh > 24) raamPlekken.push([bx + 4, by + 15]);
    for (const [rx, ry] of raamPlekken) {
      if (nacht && r() < 0.55) {
        lichten += `<rect x="${rx}" y="${ry}" width="4" height="5" fill="#ffd27a"/>
          <circle cx="${rx + 2}" cy="${ry + 2.5}" r="6" fill="url(#${id}-lamp)"/>`;
      } else {
        ramen += `<rect x="${rx}" y="${ry}" width="4" height="5"/>`;
      }
    }
    // Een enkele schoorsteen rookt: dat maakt van gevels een stad waar gewoond wordt.
    if (r() < 0.4) {
      const sx = bx + bw * 0.7;
      daken += `<rect x="${sx}" y="${by - 11}" width="3" height="7" fill="#6e4a32"/>`;
      rook += `<path d="M${sx + 1.5} ${by - 12} q-4 -6 1 -12 q5 -6 -1 -13" />`;
    }
    bx += bw + 3 + Math.round(r() * 5);
  }

  // Kabbelende branding op de vloedlijn, zodat het strand geen vlakke streep is.
  let branding = `M0 ${HP.water}`;
  for (let x = 0; x < 400; x += 22) {
    branding += ` q11 ${x % 44 === 0 ? -2.6 : -1.4} 22 0`;
  }

  // Het lichtspoor van zon of maan op het water: korte streepjes die naar de
  // voorgrond breder en schaarser worden.
  const hl = pal.hemellicht;
  let glinster = '';
  for (let y = HP.water + 1.5, i = 0; y < HP.kade; y += 2.2 + i * 0.35, i++) {
    const spreid = 4 + i * 2.4;
    for (let n = 0; n < 2; n++) {
      const w = 3 + r() * (6 + i * 1.5);
      const x = hl.x + (r() - 0.5) * spreid * 2 - w / 2;
      glinster += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="0.9" opacity="${(0.85 - i * 0.07).toFixed(2)}"/>`;
    }
  }

  // Sterren, alleen 's nachts.
  let sterren = '';
  if (nacht) {
    for (let i = 0; i < 46; i++) {
      const x = r() * 400;
      const y = r() * 52;
      sterren += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.3 + r() * 0.7).toFixed(2)}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
    }
  }

  // Bomen op de voorste heuvelrug: een rij donkere kruinen breekt de vlakke
  // silhouetlijn en geeft de heuvel maat.
  let heuvelBos = '';
  for (let x = 6; x < 300; x += 7 + r() * 9) {
    const y = HP.land + 1 - r() * 5;
    heuvelBos += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(3 + r() * 3).toFixed(1)}" ry="${(2.4 + r() * 2).toFixed(1)}"/>`;
  }

  // Rekwisieten. Wat op de oever staat gaat achter het water; wat op de rede
  // ligt eroverheen, anders verdwijnt het onder de waterstrook.
  let extra = '';
  let extraWater = '';
  if (soort === 'plantage') {
    extra += prentPalm(108, 82, 1.2) + prentPalm(124, 83, 0.85) + prentPalm(36, 82, 0.95);
    // Suikerloods met een groot schuin dak en rietstapels ervoor.
    extra += `<path d="M58 82 L58 68 L94 60 L94 82 Z" fill="#8a6a3a"/>
      <path d="M80 63.5 L94 60 L94 82 L80 82 Z" fill="#000" opacity="0.18"/>
      <path d="M54 68 L94 58 L98 62 L62 72 Z" fill="#6b4e2e"/>
      <rect x="64" y="72" width="7" height="10" fill="#2a2a35" opacity="0.6"/>
      <g fill="#c9a24a" opacity="0.85">
        <ellipse cx="104" cy="79" rx="8" ry="3.4"/><ellipse cx="104" cy="75" rx="6" ry="3"/>
      </g>`;
  } else if (soort === 'fort' || soort === 'schatkamer') {
    // Zwaardere wal met geschut dat de rede bestrijkt.
    extra += `<rect x="30" y="68" width="92" height="14" fill="#8d8375"/>
      <rect x="30" y="68" width="92" height="3" fill="#fff" opacity="0.12"/>
      <g fill="#6e6558">
        <rect x="30" y="63" width="15" height="6"/><rect x="53" y="63" width="15" height="6"/>
        <rect x="76" y="63" width="15" height="6"/><rect x="99" y="63" width="15" height="6"/>
      </g>
      <g fill="#2f2f36">
        <rect x="44" y="72" width="14" height="4" rx="2"/>
        <rect x="72" y="72" width="14" height="4" rx="2"/>
        <rect x="100" y="72" width="14" height="4" rx="2"/>
      </g>
      <g stroke="#5f5750" stroke-width="0.7" opacity="0.6">
        <path d="M30 75 L122 75"/><path d="M52 68 L52 82"/><path d="M84 68 L84 82"/>
      </g>`;
  } else if (soort === 'roversnest') {
    // Afdakjes van zeildoek aan wal, en een gekielhaald wrak op de plaat.
    extra += `<path d="M112 82 L112 72 L134 68 L134 82 Z" fill="#8a7a5a"/>
      <path d="M108 72 L138 66 L134 62 L112 68 Z" fill="#6b5a3a"/>`;
    if (nacht) extra += `<circle cx="100" cy="80" r="2.2" fill="#ffb35a"/><circle cx="100" cy="80" r="9" fill="url(#${id}-lamp)"/>`;
    extraWater += `<path d="M40 84 Q70 72 102 82 L95 93 Q68 99 47 91 Z" fill="#7a5c34"/>
      <path d="M40 84 Q70 72 102 82" fill="none" stroke="#3a2a18" stroke-width="1.6"/>
      <g stroke="#4a3520" stroke-width="1.2" opacity="0.75">
        <path d="M52 81 L56 91"/><path d="M67 77 L70 89"/><path d="M82 77 L84 88"/>
      </g>
      <path d="M78 77 L100 56" stroke="#3a2a18" stroke-width="2.6" fill="none"/>
      <path d="M100 56 L100 72 L85 69 Z" fill="#cfc3a6" opacity="0.6"/>`;
  } else if (soort === 'parels') {
    extra += prentPalm(40, 82, 1.05) + prentPalm(112, 83, 0.9);
    // Duikersboot met boeien op de banken.
    extraWater += prentSloep(84, 98, 0.9, '#6b4e2e');
    extraWater += `<g fill="#e8dcc0" opacity="0.8">
        <circle cx="118" cy="96" r="2.6"/><circle cx="130" cy="100" r="2"/><circle cx="108" cy="102" r="2.2"/>
      </g>`;
  } else {
    // Gewone haven: pakhuis met laadluik en een kraanbalk aan de kade.
    extra += `<rect x="46" y="64" width="52" height="18" fill="#8a7a5a"/>
      <rect x="78" y="64" width="20" height="18" fill="#000" opacity="0.16"/>
      <path d="M42 64 L102 64 L98 57 L46 57 Z" fill="#6b4e2e"/>
      <g fill="#2a2a35" opacity="0.7">
        <rect x="55" y="69" width="6" height="8"/><rect x="83" y="69" width="6" height="8"/>
        <rect x="68" y="58" width="8" height="6"/>
      </g>
      <path d="M112 82 L112 58 L132 63" stroke="#4a3520" stroke-width="2.6" fill="none"/>
      <path d="M132 63 L132 71" stroke="#4a3520" stroke-width="1.2" fill="none"/>
      <rect x="128" y="71" width="9" height="8" fill="#6b4e2e"/>`;
  }

  // Schepen op de rede, elk met een vage spiegeling onder zich.
  const schepen = [
    [182, 96, 0.88],
    [268, 101, 1.05],
  ];
  const spiegel = (x, y, inhoud) =>
    `<g transform="translate(0 ${2 * y}) scale(1 -1)" opacity="0.26" filter="url(#${id}-zacht)">${inhoud}</g>`;
  let rede = '';
  for (const [x, y, sch] of schepen) rede += spiegel(x, y, prentSchip(x, y, sch));
  for (const [x, y, sch] of schepen) rede += prentSchip(x, y, sch);
  if (nacht) {
    // Een lantaarn op de hek van elk schip.
    for (const [x, y, sch] of schepen) {
      const lx = x - 24 * sch,
        ly = y - 8 * sch;
      rede += `<circle cx="${lx}" cy="${ly}" r="1.6" fill="#ffcf73"/><circle cx="${lx}" cy="${ly}" r="7" fill="url(#${id}-lamp)"/>`;
    }
  }

  const [l0, l1, l2] = pal.lucht;
  const [b0, b1, b2] = pal.bergen;
  const d = el('div', 'haven-prent');
  d.innerHTML = `<svg viewBox="0 0 400 130" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="${id}-lucht" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${l0}"/>
        <stop offset="0.55" stop-color="${l1}"/>
        <stop offset="1" stop-color="${l2}"/>
      </linearGradient>
      <linearGradient id="${id}-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${pal.water[0]}"/>
        <stop offset="1" stop-color="${pal.water[1]}"/>
      </linearGradient>
      <linearGradient id="${id}-gevel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4e8cc"/>
        <stop offset="1" stop-color="#d4c294"/>
      </linearGradient>
      <linearGradient id="${id}-dak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c05a35"/>
        <stop offset="1" stop-color="#8a3820"/>
      </linearGradient>
      <linearGradient id="${id}-oever" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#46744a"/>
        <stop offset="0.72" stop-color="#6f8f52"/>
        <stop offset="1" stop-color="#b9a677"/>
      </linearGradient>
      <linearGradient id="${id}-strand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ead7aa"/>
        <stop offset="1" stop-color="#c9ab72"/>
      </linearGradient>
      <linearGradient id="${id}-nevel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${l2}" stop-opacity="0"/>
        <stop offset="1" stop-color="${l2}" stop-opacity="0.55"/>
      </linearGradient>
      <radialGradient id="${id}-gloed">
        <stop offset="0" stop-color="${hl.kleur}" stop-opacity="0.55"/>
        <stop offset="1" stop-color="${hl.kleur}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}-lamp">
        <stop offset="0" stop-color="#ffc766" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#ffc766" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}-vignet" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.6" stop-color="#1a0f05" stop-opacity="0"/>
        <stop offset="1" stop-color="#1a0f05" stop-opacity="0.38"/>
      </radialGradient>
      <filter id="${id}-zacht" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0.8"/>
      </filter>
      <filter id="${id}-wolk" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="2.2"/>
      </filter>
      <filter id="${id}-korrel" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${stad.id + 3}" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>

    <!-- Lucht, met sterren en zon of maan -->
    <rect width="400" height="130" fill="url(#${id}-lucht)"/>
    <g fill="#fff">${sterren}</g>
    <circle cx="${hl.x}" cy="${hl.y}" r="${hl.r * 3.2}" fill="url(#${id}-gloed)"/>
    <circle cx="${hl.x}" cy="${hl.y}" r="${hl.r}" fill="${hl.kleur}" opacity="0.92"/>
    ${nacht ? `<circle cx="${hl.x + 3.5}" cy="${hl.y - 2}" r="${hl.r * 0.85}" fill="${l0}" opacity="0.55"/>` : ''}

    <!-- Wolken: zacht, met een lichtere bovenkant -->
    <g filter="url(#${id}-wolk)" fill="${pal.wolk}">
      <g opacity="${nacht ? 0.25 : 0.55}">
        <ellipse cx="70" cy="30" rx="30" ry="6"/><ellipse cx="88" cy="26" rx="16" ry="6"/>
        <ellipse cx="252" cy="22" rx="34" ry="6"/><ellipse cx="238" cy="19" rx="14" ry="5"/>
        <ellipse cx="170" cy="44" rx="22" ry="3.5"/>
      </g>
    </g>

    <!-- Vogels -->
    <g stroke="#241a10" stroke-width="1" fill="none" opacity="${nacht ? 0 : 0.5}">
      <path d="M120 24 q4 -4 8 0 q-4 4 -8 0"/>
      <path d="M135 20 q3 -3 6 0 q-3 3 -6 0"/>
      <path d="M296 16 q4 -4 8 0 q-4 4 -8 0"/>
    </g>

    <!-- Drie bergketens: hoe verder weg, hoe meer ze in de lucht opgaan -->
    <path d="M60 ${HP.land + 4} L110 36 L140 46 L190 28 L236 44 L276 34 L330 ${HP.land + 4} Z" fill="${b0}"/>
    <rect x="0" y="26" width="400" height="${HP.land - 22}" fill="url(#${id}-nevel)"/>
    <path d="M0 ${HP.land + 4} L46 38 L86 58 L128 34 L178 62 L222 44 L268 ${HP.land + 4} Z" fill="${b1}"/>
    <path d="M0 ${HP.land + 4} L0 52 L30 46 L82 44 L122 58 L168 42 L214 60 L258 48 L302 ${HP.land + 4} Z" fill="${b2}"/>
    <g fill="${b2}" opacity="0.9">${heuvelBos}</g>
    <g fill="#000" opacity="0.14">${heuvelBos}</g>

    <!-- Oever waar de stad op staat, met strand aan de waterkant -->
    <rect x="0" y="${HP.land}" width="400" height="${HP.strand - HP.land}" fill="url(#${id}-oever)"/>
    <rect x="0" y="${HP.strand}" width="400" height="${HP.water - HP.strand}" fill="url(#${id}-strand)"/>

    <!-- Gebouwen op de oever; aantal en hoogte lopen mee met de stad -->
    <g fill="url(#${id}-gevel)" stroke="#a08a5c" stroke-width="0.6">${gevels}</g>
    <g fill="#5a3a1a" opacity="0.2">${schaduw}</g>
    <g fill="url(#${id}-dak)">${daken}</g>
    <g fill="#2a2a35" opacity="0.75">${ramen}</g>
    <g fill="none" stroke="#e6e0d4" stroke-width="2.2" stroke-linecap="round" opacity="0.35" filter="url(#${id}-wolk)">${rook}</g>

    <!-- Wat deze stad tot deze stad maakt -->
    ${extra}

    <!-- Fort met de vlag van de landsheer, rechts op de kaap -->
    <rect x="292" y="52" width="44" height="30" fill="#8d8375"/>
    <rect x="320" y="52" width="16" height="30" fill="#000" opacity="0.15"/>
    <rect x="288" y="47" width="52" height="6" fill="#6e6558"/>
    <g fill="#6e6558">
      <rect x="288" y="42" width="12" height="6"/><rect x="308" y="42" width="12" height="6"/>
      <rect x="328" y="42" width="12" height="6"/>
    </g>
    <g stroke="#5f5750" stroke-width="0.6" opacity="0.45">
      <path d="M292 63 L336 63"/><path d="M292 73 L336 73"/>
    </g>
    <g fill="#2f2f36">
      <rect x="297" y="67" width="8" height="4" rx="2"/>
      <rect x="310" y="67" width="8" height="4" rx="2"/>
      <rect x="323" y="67" width="8" height="4" rx="2"/>
    </g>
    <rect x="313" y="18" width="2.5" height="24" fill="#3a2a18"/>
    ${
      natie.vlagStaand
        ? `<rect x="315.5" y="20" width="5.7" height="15" fill="${natie.vlag[0]}"/>
           <rect x="321.2" y="20" width="5.7" height="15" fill="${natie.vlag[1]}"/>
           <rect x="326.9" y="20" width="5.7" height="15" fill="${natie.vlag[2]}"/>`
        : `<rect x="315.5" y="20" width="17" height="5" fill="${natie.vlag[0]}"/>
           <rect x="315.5" y="25" width="17" height="5" fill="${natie.vlag[1]}"/>
           <rect x="315.5" y="30" width="17" height="5" fill="${natie.vlag[2]}"/>`
    }

    <!-- Water op de rede, met het licht aan de kim -->
    <rect x="0" y="${HP.water}" width="400" height="${130 - HP.water}" fill="url(#${id}-water)"/>
    <rect x="0" y="${HP.water}" width="400" height="2.4" fill="${l2}" opacity="0.35"/>
    <path d="${branding}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.1"/>
    <g stroke="rgba(255,255,255,0.16)" stroke-width="0.8" fill="none">
      <path d="M0 92 q20 -3 40 0 t40 0"/>
      <path d="M150 94 q24 -3 48 0 t48 0"/>
      <path d="M280 91 q18 -3 36 0 t36 0"/>
      <path d="M60 102 q28 -3 56 0 t56 0"/>
      <path d="M240 105 q22 -3 44 0 t44 0"/>
    </g>
    <g fill="${hl.kleur}">${glinster}</g>

    <!-- Wat op de rede zelf drijft of ligt -->
    ${extraWater}

    <!-- Gemeerde schepen op de rede -->
    ${rede}

    <!-- Sloepen op de voorgrond -->
    ${prentSloep(126, 104, 1, '#6b4e2e')}
    ${prentSloep(336, 106, 0.9, '#5a4324')}

    <!-- Kade op de voorgrond; dekt alles wat eronder uitsteekt af -->
    <rect x="0" y="${HP.kade}" width="400" height="8" fill="#5c4324"/>
    <rect x="0" y="${HP.kade}" width="400" height="1.4" fill="#b08a5a" opacity="0.6"/>
    <rect x="0" y="${HP.kade + 8}" width="400" height="${130 - HP.kade - 8}" fill="#4a3520"/>
    <g stroke="#3a2a18" stroke-width="1" opacity="0.5">
      <line x1="0" y1="${HP.kade + 5}" x2="400" y2="${HP.kade + 5}"/>
      <line x1="0" y1="${HP.kade + 13}" x2="400" y2="${HP.kade + 13}"/>
      <line x1="0" y1="${HP.kade + 18}" x2="400" y2="${HP.kade + 18}"/>
    </g>
    <!-- Bolders langs de kaderand, met een tros naar de dichtstbijzijnde sloep -->
    <g fill="#3a2a18">
      <rect x="30" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
      <rect x="160" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
      <rect x="300" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
    </g>
    <path d="M163 ${HP.kade - 2} Q150 ${HP.kade + 1} 146 ${HP.kade - 6}" stroke="#2a1d10" stroke-width="0.7" fill="none"/>

    <!-- Het licht van het uur over de hele oever, dan wat er zelf licht geeft -->
    <rect x="0" y="${HP.land - 2}" width="400" height="${132 - HP.land}" fill="${pal.tint[0]}" opacity="${pal.tint[1]}"/>
    <g>${lichten}</g>

    <!-- Afwerking: een vignet en papierkorrel, als een gedrukte prent -->
    <rect width="400" height="130" fill="url(#${id}-vignet)"/>
    <rect width="400" height="130" filter="url(#${id}-korrel)" opacity="0.07" style="mix-blend-mode:multiply"/>
  </svg>`;
  return d;
}

export { havenPrent };
