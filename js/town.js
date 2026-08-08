// Alles wat er in een haven gebeurt: handel, kroeg, werf, gouverneur en plundering.
import { clamp, lerp, fmtGold, fmtDate, el, pick, makeRng } from './util.js';
import {
  WAREN, SCHEPEN, SCHIP_INDEX, NATIES, NATIE_IDS, RANGEN, metLidwoord,
  GERUCHTEN, KAPITEIN_NAMEN, VOORNAMEN_V, ACHTERNAMEN, MOEILIJKHEDEN,
  OPDRACHT_SOORTEN, UPGRADES, FAMILIE_ROLLEN,
} from './data.js';
import {
  Game, vlaggenschip, ruimTotaal, ruimVrij, vlootBemanningMax, nieuwSchip, talentBonus, berekenScore,
  bewaarInErelijst, wisOpslag,
} from './game.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakDuel } from './duel.js';

const rng = Math.random;

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
          `De kanonnen van het fort volgen je schip. Op de kade wappert de ${NATIES[stad.natie].bijv.toLowerCase()} vlag, ` +
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
          label: 'Wegvaren',
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
  hoofdmenu(stad, opVertrek);
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
        `<span>Bemanning</span><b>${s.bemanning} / ${vlootBemanningMax(s)}</b>` +
        `<span>Moraal</span><b>${Math.round(s.moraal)}%</b>` +
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
      // Langs de kade vragen naar het vermiste familielid.
      ...(!s.familie?.gevonden && (s.familie?.zoekStad === stad.naam)
        ? [
            {
              label: `${UI.ikoon('familie')}Naar uw ${s.familie.rol} vragen`,
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

// Vaste hoogtelijnen van de havenprent. De stad staat op de oeverstrook, het
// water ligt daarvóór en de kade is de voorgrond — zo staan de huizen niet
// langer met hun voeten in zee.
const HP = { land: 64, strand: 82, water: 88, kade: 110 };

/** Palmboompje voor de plantagesteden. */
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
function havenPrent(stad) {
  const natie = NATIES[stad.natie];
  const r = makeRng(stad.id * 7817 + 29);
  const soort = stad.soort;

  // Gevels langs de kade.
  let gevels = '';
  let daken = '';
  let ramen = '';
  let bx = 138;
  const gevelMax = clamp(2 + stad.grootte, 3, 8);
  for (let i = 0; i < gevelMax && bx < 282; i++) {
    const bw = 18 + Math.round(r() * 10);
    const bh = (soort === 'roversnest' ? 12 : 16) + Math.round(r() * (soort === 'roversnest' ? 8 : 14));
    const by = 82 - bh;
    gevels += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
    daken += `<path d="M${bx - 2} ${by} L${bx + bw / 2} ${by - 9} L${bx + bw + 2} ${by} Z"/>`;
    ramen += `<rect x="${bx + 4}" y="${by + 5}" width="4" height="5"/>`;
    if (bw > 23) ramen += `<rect x="${bx + bw - 8}" y="${by + 5}" width="4" height="5"/>`;
    bx += bw + 3 + Math.round(r() * 5);
  }

  // Kabbelende branding op de vloedlijn, zodat het strand geen vlakke streep is.
  let branding = `M0 ${HP.water}`;
  for (let x = 0; x < 400; x += 22) {
    branding += ` q11 ${x % 44 === 0 ? -2.6 : -1.4} 22 0`;
  }

  // Rekwisieten. Wat op de oever staat gaat achter het water; wat op de rede
  // ligt eroverheen, anders verdwijnt het onder de waterstrook.
  let extra = '';
  let extraWater = '';
  if (soort === 'plantage') {
    extra += prentPalm(108, 82, 1.2) + prentPalm(124, 83, 0.85) + prentPalm(36, 82, 0.95);
    // Suikerloods met een groot schuin dak en rietstapels ervoor.
    extra += `<path d="M58 82 L58 68 L94 60 L94 82 Z" fill="#8a6a3a"/>
      <path d="M54 68 L94 58 L98 62 L62 72 Z" fill="#6b4e2e"/>
      <rect x="64" y="72" width="7" height="10" fill="#2a2a35" opacity="0.6"/>
      <g fill="#c9a24a" opacity="0.85">
        <ellipse cx="104" cy="79" rx="8" ry="3.4"/><ellipse cx="104" cy="75" rx="6" ry="3"/>
      </g>`;
  } else if (soort === 'fort' || soort === 'schatkamer') {
    // Zwaardere wal met geschut dat de rede bestrijkt.
    extra += `<rect x="30" y="68" width="92" height="14" fill="#8d8375"/>
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
      <path d="M42 64 L102 64 L98 57 L46 57 Z" fill="#6b4e2e"/>
      <g fill="#2a2a35" opacity="0.7">
        <rect x="55" y="69" width="6" height="8"/><rect x="83" y="69" width="6" height="8"/>
        <rect x="68" y="58" width="8" height="6"/>
      </g>
      <path d="M112 82 L112 58 L132 63" stroke="#4a3520" stroke-width="2.6" fill="none"/>
      <path d="M132 63 L132 71" stroke="#4a3520" stroke-width="1.2" fill="none"/>
      <rect x="128" y="71" width="9" height="8" fill="#6b4e2e"/>`;
  }

  const d = el('div', 'haven-prent');
  d.innerHTML = `<svg viewBox="0 0 400 130" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="hp-lucht" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1e3f63"/>
        <stop offset="0.45" stop-color="#4a6b8a"/>
        <stop offset="0.78" stop-color="#c98a5a"/>
        <stop offset="1" stop-color="#e0a06a"/>
      </linearGradient>
      <linearGradient id="hp-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#246080"/>
        <stop offset="1" stop-color="#153d5a"/>
      </linearGradient>
      <linearGradient id="hp-gevel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f0e3c4"/>
        <stop offset="1" stop-color="#d9c99e"/>
      </linearGradient>
      <linearGradient id="hp-dak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b3502f"/>
        <stop offset="1" stop-color="#8f3b22"/>
      </linearGradient>
      <linearGradient id="hp-oever" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a7a4e"/>
        <stop offset="0.72" stop-color="#6f8f52"/>
        <stop offset="1" stop-color="#b9a677"/>
      </linearGradient>
      <linearGradient id="hp-strand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e2cfa3"/>
        <stop offset="1" stop-color="#c9ab72"/>
      </linearGradient>
    </defs>

    <!-- Lucht -->
    <rect width="400" height="130" fill="url(#hp-lucht)"/>

    <!-- Zon -->
    <circle cx="340" cy="30" r="17" fill="#ffe6b0" opacity="0.75"/>
    <circle cx="340" cy="30" r="27" fill="#ffe6b0" opacity="0.18"/>

    <!-- Wolken -->
    <g fill="#f0e3c4" opacity="0.22">
      <ellipse cx="70" cy="26" rx="22" ry="7"/>
      <ellipse cx="85" cy="28" rx="16" ry="6"/>
      <ellipse cx="55" cy="28" rx="14" ry="5"/>
      <ellipse cx="252" cy="20" rx="26" ry="7"/>
      <ellipse cx="270" cy="22" rx="17" ry="6"/>
      <ellipse cx="234" cy="22" rx="13" ry="5"/>
    </g>

    <!-- Vogels -->
    <g stroke="#241a10" stroke-width="1" fill="none" opacity="0.55">
      <path d="M120 24 q4 -4 8 0 q-4 4 -8 0"/>
      <path d="M135 20 q3 -3 6 0 q-3 3 -6 0"/>
      <path d="M296 16 q4 -4 8 0 q-4 4 -8 0"/>
    </g>

    <!-- Verre bergen, met hun voet achter de oeverstrook -->
    <path d="M0 ${HP.land + 4} L46 34 L86 58 L128 30 L178 62 L222 42 L268 ${HP.land + 4} Z" fill="#3a5a40" opacity="0.8"/>
    <path d="M26 ${HP.land + 4} L82 40 L122 58 L168 38 L214 60 L258 46 L302 ${HP.land + 4} Z" fill="#4a7a4e" opacity="0.9"/>

    <!-- Oever waar de stad op staat, met strand aan de waterkant -->
    <rect x="0" y="${HP.land}" width="400" height="${HP.strand - HP.land}" fill="url(#hp-oever)"/>
    <rect x="0" y="${HP.strand}" width="400" height="${HP.water - HP.strand}" fill="url(#hp-strand)"/>
    <path d="${branding}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.1"/>

    <!-- Gebouwen op de oever; aantal en hoogte lopen mee met de stad -->
    <g fill="url(#hp-gevel)" stroke="#a08a5c" stroke-width="0.6">${gevels}</g>
    <g fill="url(#hp-dak)">${daken}</g>
    <g fill="#2a2a35" opacity="0.75">${ramen}</g>

    <!-- Wat deze stad tot deze stad maakt -->
    ${extra}

    <!-- Fort met de vlag van de landsheer, rechts op de kaap -->
    <rect x="292" y="52" width="44" height="30" fill="#8d8375"/>
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

    <!-- Water op de rede -->
    <rect x="0" y="${HP.water}" width="400" height="${130 - HP.water}" fill="url(#hp-water)"/>
    <g stroke="rgba(255,255,255,0.13)" stroke-width="0.8" fill="none">
      <path d="M0 92 q20 -3 40 0 t40 0"/>
      <path d="M150 94 q24 -3 48 0 t48 0"/>
      <path d="M280 91 q18 -3 36 0 t36 0"/>
      <path d="M60 102 q28 -3 56 0 t56 0"/>
      <path d="M240 105 q22 -3 44 0 t44 0"/>
    </g>

    <!-- Wat op de rede zelf drijft of ligt -->
    ${extraWater}

    <!-- Gemeerde schepen op de rede -->
    ${prentSchip(182, 96, 0.88)}
    ${prentSchip(268, 101, 1.05)}

    <!-- Sloepen op de voorgrond -->
    ${prentSloep(126, 104, 1, '#6b4e2e')}
    ${prentSloep(336, 106, 0.9, '#5a4324')}

    <!-- Kade op de voorgrond; dekt alles wat eronder uitsteekt af -->
    <rect x="0" y="${HP.kade}" width="400" height="8" fill="#5c4324"/>
    <rect x="0" y="${HP.kade + 8}" width="400" height="${130 - HP.kade - 8}" fill="#4a3520"/>
    <g stroke="#3a2a18" stroke-width="1" opacity="0.5">
      <line x1="0" y1="${HP.kade + 5}" x2="400" y2="${HP.kade + 5}"/>
      <line x1="0" y1="${HP.kade + 13}" x2="400" y2="${HP.kade + 13}"/>
      <line x1="0" y1="${HP.kade + 18}" x2="400" y2="${HP.kade + 18}"/>
    </g>
    <!-- Bolders langs de kaderand -->
    <g fill="#3a2a18">
      <rect x="30" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
      <rect x="160" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
      <rect x="300" y="${HP.kade - 4}" width="6" height="5" rx="2"/>
    </g>
  </svg>`;
  return d;
}

// --- Kroeg ----------------------------------------------------------------

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
        `<br><small>Goud in het ruim: <b>${fmtGold(s.goud)}</b> · bemanning <b>${s.bemanning}</b> van ${vlootBemanningMax(s)}</small>`;
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
        { label: 'Terug', esc: true, actie: () => sch.sluit() },
      ];
    },
  });
  return scherm;
}

function beschikbaarVolk(stad, s) {
  const ruimte = vlootBemanningMax(s) - s.bemanning;
  const aanbod = Math.round(
    stad.grootte * 14 * (0.5 + s.roem / 400) * (1 + 0.35 * talentBonus(s, 'charme')) *
      (stad.soort === 'roversnest' ? 1.8 : 1)
  );
  return clamp(Math.min(ruimte, aanbod), 0, 400);
}

function huurPrijs(stad, s) {
  return Math.round(lerp(42, 24, clamp(s.roem / 300, 0, 1)) * (talentBonus(s, 'charme') ? 0.8 : 1));
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
  s.bemanning += n;
  s.moraal = clamp(s.moraal + 3, 0, 100);
  audio.sfx.munt();
  sch._bericht = `<b>${n} man</b> tekent bij voor ${fmtGold(n * prijs)} goudstukken.`;
  sch.ververs();
}

function rondjeGeven(stad, sch) {
  const s = Game.speler;
  s.goud -= 100;
  s.moraal = clamp(s.moraal + 6, 0, 100);
  audio.sfx.munt();
  const w = Game.wereld;
  const sjabloon = pick(rng, GERUCHTEN);
  const tekst = sjabloon
    .replace('{stad}', pick(rng, w.steden).naam)
    .replace('{waar}', pick(rng, WAREN).naam.toLowerCase())
    .replace('{kapitein}', pick(rng, KAPITEIN_NAMEN));
  sch._bericht = `De kroeg juicht. Iemand mompelt: "${tekst}"`;
  sch.ververs();
}

async function vreemdeling(stad, sch) {
  const s = Game.speler;
  const rol = rng();
  if (rol < 0.32) {
    const prijs = 300 + Math.round(rng() * 700);
    const koop = await UI.vraag(
      'Een havelozen man in de hoek',
      `Hij schuift een gerafeld stuk perkament over de tafel. "De helft van een schatkaart, kapitein. ` +
        `Voor ${fmtGold(prijs)} goudstukken is-ie van u."`,
      [
        { label: `Kopen (${fmtGold(prijs)})`, waarde: true, uit: s.goud < prijs },
        { label: 'Laten liggen', waarde: false },
      ],
      { figuur: 'zeeman' }
    );
    if (koop) {
      s.goud -= prijs;
      s.schatkaarten++;
      audio.sfx.munt();
      sch._bericht = `Je bezit nu <b>${s.schatkaarten}</b> stukken van een schatkaart. Bij vier kun je gaan graven.`;
      if (s.schatkaarten >= 4) {
        s.schatkaarten -= 4;
        const buit = Math.round(4000 + rng() * 9000);
        s.goud += buit;
        audio.sfx.fanfare();
        sch._bericht = `De vier stukken passen! Op een naamloos eiland graaf je <b>${fmtGold(buit)} goudstukken</b> op.`;
        s.roem += 20;
      }
      sch.ververs();
    }
  } else if (rol < 0.6) {
    const doelStad = pick(rng, Game.wereld.steden.filter((x) => x !== stad));
    sch._bericht =
      `Een oude stuurman fluistert: "In <b>${doelStad.naam}</b> ligt ` +
      `${pick(rng, WAREN).naam.toLowerCase()} voor een schijntje. Vaar erheen voor het rondgaat."`;
    sch.ververs();
  } else if (rol < 0.68 && !s.familie?.gevonden) {
    // Vermist familielid — de lange persoonlijke lijn uit het origineel.
    const rolNaam = s.familie.rol;
    const waar = pick(rng, Game.wereld.steden.filter((x) => x !== stad));
    if (!s.familie.zoekStad) s.familie.zoekStad = waar.naam;
    sch._bericht =
      `Een bedelaar grijpt je pols: "U lijkt op iemand die ik ken. Mag ik een duit voor ` +
      `een hertaling? Men zegt dat uw <b>${rolNaam}</b> ergens in <b>${s.familie.zoekStad}</b> gevangen zit."`;
    s.familie.laatsteTip = s.dag;
    sch.ververs();
  } else if (rol < 0.78 && s.bemanning > 20) {
    const n = Math.round(s.bemanning * 0.12);
    s.bemanning -= n;
    s.moraal = clamp(s.moraal - 4, 0, 100);
    sch._bericht = `<b>${n} man</b> is aan de rum gebleven en niet meer aan boord verschenen.`;
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
  const kapiteinsdeel = clamp(0.35 + rangDeel + roemDeel + (talentBonus(s, 'charme') ? 0.05 : 0), 0.2, 0.72);
  const totaal = s.goud;
  const mijn = Math.round(totaal * kapiteinsdeel);
  const perMan = Math.max(0, Math.round((totaal - mijn) / Math.max(1, s.bemanning)));

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
            { cellen: [{ tekst: `Per bemanningslid (${s.bemanning} man)` }, { tekst: fmtGold(perMan), klasse: 'rechts' }] },
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
          s.bemanning = Math.max(12, Math.round(s.bemanning * 0.4));
          s.moraal = 85;
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

// --- Handel ---------------------------------------------------------------

function handel(stad, ouder) {
  const s = Game.speler;
  const schip = vlaggenschip(s);

  const scherm = UI.toonScherm({
    titel: 'De koopman',
    onder: `${stad.naam} · pakhuis en weegbrug`,
    breed: true,
    bouw(body, sch) {
      const kop = el('div', 'handel-kop');
      kop.innerHTML =
        `<span>Goud: <b>${fmtGold(s.goud)}</b></span>` +
        `<span>Ruim: <b>${ruimTotaal(schip)}</b> / ${SCHIP_INDEX[schip.type].ruim} ` +
        `(vrij: ${Math.max(0, ruimVrij(schip))})</span>`;
      body.appendChild(kop);

      const rijen = WAREN.map((w, i) => {
        const prijs = stad.prijzen[i];
        const knoppen = el('div', 'handel-knoppen');
        for (const n of [1, 10, 100]) {
          const b = el('button', 'mini', `+${n}`);
          b.disabled = s.goud < prijs * n || ruimVrij(schip) < n || stad.voorraad[i] < n;
          b.onclick = () => koop(i, n, sch);
          knoppen.appendChild(b);
        }
        for (const n of [1, 10, 100]) {
          const b = el('button', 'mini rood', `−${n}`);
          b.disabled = schip.lading[i] < n;
          b.onclick = () => verkoop(i, n, sch);
          knoppen.appendChild(b);
        }
        const alles = el('button', 'mini rood', 'alles');
        alles.disabled = schip.lading[i] <= 0;
        alles.onclick = () => verkoop(i, schip.lading[i], sch);
        knoppen.appendChild(alles);

        const basis = w.basis;
        const stemming = prijs < basis * 0.8 ? 'goedkoop' : prijs > basis * 1.25 ? 'duur' : '';
        return {
          cellen: [
            { html: `<span class="waar-stip" style="background:${w.kleur}"></span><b>${w.naam}</b>` },
            { html: `<span class="${stemming}">${fmtGold(prijs)}</span>`, klasse: 'rechts' },
            { tekst: String(Math.round(stad.voorraad[i])), klasse: 'rechts' },
            { tekst: String(schip.lading[i]), klasse: 'rechts' },
            { node: knoppen },
          ],
        };
      });

      body.appendChild(
        UI.tabel(
          [
            { label: 'Waar' },
            { label: 'Prijs', rechts: true },
            { label: 'Voorraad', rechts: true },
            { label: 'In ruim', rechts: true },
            { label: 'Kopen / verkopen' },
          ],
          rijen
        )
      );

      const uitleg = el('p', 'kleintje');
      uitleg.innerHTML =
        'Plantagesteden verkopen suiker, tabak en katoen goedkoop; forten en schatkamers betalen goed voor voedsel en handelswaar. ' +
        '<span class="goedkoop">Groen</span> = koopje, <span class="duur">rood</span> = hoge prijs.';
      body.appendChild(uitleg);
    },
    knoppen: (sch) => [{ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } }],
  });

  function koop(i, n, sch) {
    const prijs = stad.prijzen[i];
    const kan = Math.min(n, Math.floor(s.goud / prijs), Math.max(0, ruimVrij(schip)), Math.floor(stad.voorraad[i]));
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    s.goud -= kan * prijs;
    schip.lading[i] += kan;
    stad.voorraad[i] -= kan;
    // Kopen jaagt de prijs op.
    stad.prijzen[i] = Math.max(5, Math.round(prijs * (1 + 0.004 * kan)));
    audio.sfx.munt();
    sch.ververs();
  }

  function verkoop(i, n, sch) {
    const kan = Math.min(n, schip.lading[i]);
    if (kan <= 0) {
      audio.sfx.fout();
      return;
    }
    const prijs = Math.round(stad.prijzen[i] * 0.92);
    s.goud += kan * prijs;
    schip.lading[i] -= kan;
    stad.voorraad[i] += kan;
    stad.prijzen[i] = Math.max(5, Math.round(stad.prijzen[i] * (1 - 0.004 * kan)));
    audio.sfx.munt();
    sch.ververs();
  }

  return scherm;
}

// --- Scheepswerf ----------------------------------------------------------

function werf(stad, ouder) {
  const s = Game.speler;

  const scherm = UI.toonScherm({
    titel: 'De scheepswerf',
    onder: `${stad.naam} · teer, hennep en zaagsel`,
    breed: true,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('timmerman'));
      const p = el('p', 'verhaal');
      p.innerHTML = `De baas van de werf neemt je vloot op. "Er valt genoeg te doen, kapitein." <br><small>Goud: <b>${fmtGold(s.goud)}</b></small>`;
      body.appendChild(p);
      if (sch._bericht) {
        const b = el('p', 'kroeg-bericht');
        b.innerHTML = sch._bericht;
        body.appendChild(b);
      }

      // Eigen vloot.
      const eigen = el('div', 'werf-blok');
      eigen.innerHTML = '<h3>Jouw vloot</h3>';
      for (let i = 0; i < s.schepen.length; i++) {
        const sh = s.schepen[i];
        const t = SCHIP_INDEX[sh.type];
        const rij = el('div', 'werf-rij');
        const kosten = herstelKosten(sh);
        const up = sh.upgrades || {};
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}${i === 0 ? ' <em>(vlaggenschip)</em>' : ''}</span>` +
          `<span class="werf-stat">romp ${Math.round(sh.romp)}/${sh.maxRomp} · ${sh.kanonnen}/${t.kanonnen} kanon` +
          (up.roer || up.zeilen || up.romp
            ? ` · uitrusting z${up.zeilen || 0}/r${up.roer || 0}/h${up.romp || 0}`
            : '') +
          `</span>`;
        const acties = el('div', 'werf-acties');

        const herstel = el('button', 'mini', kosten > 0 ? `Herstellen (${fmtGold(kosten)})` : 'Gaaf');
        herstel.disabled = kosten <= 0 || s.goud < kosten;
        herstel.onclick = () => {
          s.goud -= kosten;
          sh.romp = sh.maxRomp;
          audio.sfx.munt();
          sch._bericht = `${metLidwoord(sh.type, true)} is weer helemaal zeewaardig.`;
          sch.ververs();
        };
        acties.appendChild(herstel);

        const kanonPrijs = 480;
        const kanon = el('button', 'mini', `+1 kanon (${fmtGold(kanonPrijs)})`);
        kanon.disabled = sh.kanonnen >= t.kanonnen || s.goud < kanonPrijs || (i === 0 && ruimVrij(sh) < 2);
        kanon.onclick = () => {
          s.goud -= kanonPrijs;
          sh.kanonnen++;
          audio.sfx.munt();
          sch._bericht = 'Er wordt een extra stuk geschut aan boord gehesen.';
          sch.ververs();
        };
        acties.appendChild(kanon);

        // Uitrusting: verbeter zeilen, romp of roer op de werf.
        for (const [key, upg] of Object.entries(UPGRADES)) {
          const lvl = up[key] || 0;
          const prijs = Math.round(upg.basis * Math.pow(1.6, lvl));
          const k = el('button', 'mini', `+${key === 'zeilen' ? 'zeil' : key === 'roer' ? 'roer' : 'romp'} (${fmtGold(prijs)})`);
          k.disabled = lvl >= upg.max || s.goud < prijs || (key === 'romp' && sh.romp < sh.maxRomp - 1);
          k.onclick = () => {
            s.goud -= prijs;
            up[key] = lvl + 1;
            if (key === 'romp') {
              // Versteviging vergroot de max-romp en herstelt dat verschil.
              const extra = Math.round(SCHIP_INDEX[sh.type].romp * upg.stap);
              sh.maxRomp += extra;
              sh.romp = Math.min(sh.maxRomp, sh.romp + extra);
            }
            audio.sfx.munt();
            sch._bericht = `De ${upg.naam.toLowerCase()} van ${metLidwoord(sh.type)} is verbeterd (niveau ${lvl + 1}).`;
            sch.ververs();
          };
          acties.appendChild(k);
        }

        if (i > 0) {
          const verkoop = el('button', 'mini rood', `Verkopen (${fmtGold(scheepsWaarde(sh))})`);
          verkoop.onclick = () => {
            s.goud += scheepsWaarde(sh);
            s.schepen.splice(i, 1);
            audio.sfx.munt();
            sch._bericht = `${metLidwoord(sh.type, true)} is van de hand gedaan.`;
            sch.ververs();
          };
          acties.appendChild(verkoop);

          const vlag = el('button', 'mini', 'Tot vlaggenschip maken');
          vlag.onclick = () => {
            const oud = s.schepen[0];
            s.schepen[0] = sh;
            s.schepen[i] = oud;
            // De lading verhuist mee voor zover het ruim het toelaat.
            sch._bericht = `Je hijst je vlag op ${metLidwoord(sh.type)}.`;
            sch.ververs();
          };
          acties.appendChild(vlag);
        }
        rij.appendChild(acties);
        eigen.appendChild(rij);
      }
      body.appendChild(eigen);

      // Te koop.
      const markt = el('div', 'werf-blok');
      markt.innerHTML = '<h3>Te koop op de helling</h3>';
      for (const t of teKoop(stad)) {
        const rij = el('div', 'werf-rij');
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}</span>` +
          `<span class="werf-stat">romp ${t.romp} · ${t.kanonnen} kanon · ruim ${t.ruim} · ${t.bemanning} koppen</span>`;
        const acties = el('div', 'werf-acties');
        const prijs = Math.round(t.prijs * (1.25 - stad.grootte * 0.04));
        const koop = el('button', 'mini', `Kopen (${fmtGold(prijs)})`);
        koop.disabled = s.goud < prijs || s.schepen.length >= 8;
        koop.onclick = () => {
          s.goud -= prijs;
          s.schepen.push(nieuwSchip(t.id));
          audio.sfx.fanfare();
          sch._bericht = `Een gloednieuwe ${t.naam.toLowerCase()} ligt klaar aan de kade.`;
          sch.ververs();
        };
        acties.appendChild(koop);
        rij.appendChild(acties);
        markt.appendChild(rij);
      }
      body.appendChild(markt);
    },
    knoppen: (sch) => [{ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } }],
  });
  return scherm;
}

function herstelKosten(schip) {
  return Math.round((schip.maxRomp - schip.romp) * 26);
}

function scheepsWaarde(schip) {
  const t = SCHIP_INDEX[schip.type];
  const up = schip.upgrades || {};
  const upgradeBonus = (up.zeilen || 0) * 0.06 + (up.roer || 0) * 0.05 + (up.romp || 0) * 0.08;
  return Math.round(t.prijs * 0.45 * clamp(schip.romp / t.romp, 0.2, 1) * (1 + upgradeBonus));
}

function teKoop(stad) {
  // Grotere steden bieden zwaardere schepen aan.
  const max = stad.grootte;
  const lijst = SCHEPEN.filter((t) => {
    if (t.prijs > 3000 + max * 5000) return false;
    if (stad.soort === 'roversnest' && t.ruim > 200) return false;
    return true;
  });
  // Vaste, per stad herhaalbare selectie zodat het aanbod niet elke keer wisselt.
  const r = makeRng(stad.id * 7919 + 13);
  const uit = [];
  const kopie = [...lijst];
  const n = Math.min(kopie.length, 2 + max);
  for (let i = 0; i < n; i++) {
    uit.push(kopie.splice(Math.floor(r() * kopie.length), 1)[0]);
  }
  return uit.sort((a, b) => a.prijs - b.prijs);
}

// --- Gouverneur -----------------------------------------------------------

function gouverneur(stad, ouder) {
  const s = Game.speler;
  const natie = NATIES[stad.natie];
  const rel = s.relatie[stad.natie];

  const scherm = UI.toonScherm({
    titel: `Het gouvernement van ${stad.naam}`,
    onder: `${natie.naam} · verhouding: ${relatieWoord(rel)}`,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('gouverneur'));
      const p = el('p', 'verhaal');
      p.innerHTML = sch._bericht || begroeting(stad, rel);
      body.appendChild(p);

      const st = el('div', 'haven-info');
      st.innerHTML =
        `<span>Jouw rang</span><b>${s.rang[stad.natie] > 0 ? RANGEN[clamp(s.rang[stad.natie], 0, RANGEN.length - 1)].naam : 'geen'}</b>` +
        `<span>Land van ${natie.naam}</span><b>${s.land[stad.natie]} hectare</b>` +
        `<span>Roem</span><b>${Math.round(s.roem)}</b>` +
        `<span>Eigen spaargeld</span><b>${fmtGold(s.gespaard)}</b>`;
      body.appendChild(st);
    },
    knoppen: (sch) => {
      const knoppen = [];
      const volgende = RANGEN[clamp(s.rang[stad.natie] + 1, 0, RANGEN.length - 1)];
      const verdiend = verdienstePunten(s, stad.natie);
      if (rel > -25) {
        knoppen.push({
          label: `Om bevordering vragen (${Math.round(verdiend)} / ${volgende.drempel})`,
          uit: verdiend < volgende.drempel || s.rang[stad.natie] >= RANGEN.length - 1,
          actie: () => bevordering(stad, sch),
        });
        knoppen.push({ label: 'De dochter van de gouverneur groeten', actie: () => dochter(stad, sch) });
        if (s.opdracht && s.opdracht.natie === stad.natie && s.opdracht.stad === stad.naam) {
          knoppen.push({
            label: `${UI.ikoon('opdracht')}Van de opdracht verslag doen`,
            actie: () => rapporteerOpdracht(stad, sch),
          });
        } else if (!s.opdracht) {
          knoppen.push({ label: `${UI.ikoon('opdracht')}Naar een opdracht vragen`, actie: () => vraagOpdracht(stad, sch) });
        }
      }
      if (s.natie !== stad.natie && rel > -10) {
        knoppen.push({ label: `In dienst treden van ${natie.naam}`, actie: () => kaperbrief(stad, sch) });
      }
      if (rel > -25 && s.rang[stad.natie] >= 2) {
        knoppen.push({ label: 'Aftreden en gaan rentenieren', soort: 'gevaar', actie: () => tredAf(stad) });
      }
      if (rel <= -25) {
        knoppen.push({ label: 'Om gratie verzoeken (5.000 goud)', uit: s.gespaard < 5000, actie: () => gratie(stad, sch) });
      }
      knoppen.push({ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } });
      return knoppen;
    },
  });
  return scherm;
}

function begroeting(stad, rel) {
  const natie = NATIES[stad.natie];
  if (rel > 50) return `"Kapitein! Kom binnen, kom binnen. ${natie.naam} heeft geen trouwer dienaar op zee."`;
  if (rel > 15) return '"Uw naam is hier bekend, en niet in slechte zin. Wat kan ik voor u doen?"';
  if (rel > -25) return '"Ik ken u van naam. Zolang u de vlag niet in verlegenheid brengt, bent u welkom."';
  return '"U staat op mijn lijst, kapitein. Wees voorzichtig met wat u hier vraagt."';
}

/** Verdienste telt buit, veroveringen en roem in dienst van deze natie. */
function verdienstePunten(s, natie) {
  return s.gespaard * 0.6 + s.roem * 90 + s.veroverdeSteden * 4000 + clamp(s.relatie[natie], 0, 100) * 90;
}

async function bevordering(stad, sch) {
  const s = Game.speler;
  s.rang[stad.natie] = clamp(s.rang[stad.natie] + 1, 0, RANGEN.length - 1);
  const rang = RANGEN[s.rang[stad.natie]];
  s.land[stad.natie] += rang.land;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 10, -100, 100);
  s.roem += 15;
  audio.sfx.fanfare();
  await UI.vraag(
    'Bevordering',
    `De gouverneur laat een oorkonde halen. "Bij deze bent u <b>${rang.naam}</b> in dienst van ` +
      `${NATIES[stad.natie].naam}, met ${rang.land} hectare land rond ${stad.naam}."`,
    [{ label: 'Buigen', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  sch._bericht = `"${rang.naam}, het staat u goed."`;
  sch.ververs();
}

async function dochter(stad, sch) {
  const s = Game.speler;
  const r = makeRng(stad.id * 104729 + Math.floor(s.dag / 90));
  const naam = `${VOORNAMEN_V[Math.floor(r() * VOORNAMEN_V.length)]} ${ACHTERNAMEN[Math.floor(r() * ACHTERNAMEN.length)]}`;
  const charme = clamp(
    0.2 + s.rang[stad.natie] * 0.09 + clamp(s.roem / 400, 0, 0.3) + (talentBonus(s, 'charme') ? 0.2 : 0) +
      clamp(s.gespaard / 200000, 0, 0.15),
    0.05,
    0.95
  );

  const keuze = await UI.vraag(
    `${naam}`,
    `Aan de rand van de balzaal staat de dochter van de gouverneur. ` +
      `"Men zegt dat u de zee kent als geen ander, kapitein. Vertel eens iets waars."`,
    [
      { label: 'Een verhaal over de storm bij Kaap Tiburón', waarde: 'verhaal' },
      { label: 'Een compliment, kort en raak', waarde: 'compliment' },
      { label: 'Zwijgen en buigen', waarde: 'buigen' },
    ],
    { figuur: 'dame' }
  );

  const bonus = keuze === 'verhaal' ? 0.1 : keuze === 'compliment' ? 0.05 : -0.05;
  if (Math.random() < charme + bonus) {
    s.roem += 6;
    s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 4, -100, 100);
    if (!s.gehuwd && s.rang[stad.natie] >= 4 && Math.random() < 0.4) {
      const ja = await UI.vraag(
        'Een huwelijksaanzoek',
        `${naam} kijkt je lang aan. "Mijn vader zou het goedvinden, weet u." Vraag je haar ten huwelijk?`,
        [
          { label: 'Ja', waarde: true },
          { label: 'De zee roept', waarde: false },
        ],
        { figuur: 'dame' }
      );
      if (ja) {
        s.gehuwd = naam;
        s.roem += 40;
        audio.sfx.fanfare();
        sch._bericht = `Je bent getrouwd met <b>${naam}</b>. Half ${stad.naam} was op de bruiloft.`;
        sch.ververs();
        return;
      }
    }
    sch._bericht = `${naam} lacht. "Kom nog eens langs, kapitein."`;
  } else {
    s.roem = Math.max(0, s.roem - 2);
    sch._bericht = `${naam} verontschuldigt zich beleefd en verdwijnt tussen de gasten.`;
  }
  sch.ververs();
}

async function kaperbrief(stad, sch) {
  const s = Game.speler;
  const ja = await UI.vraag(
    'Een kaperbrief',
    `De gouverneur schuift een document naar voren. "Vaar onder onze vlag, kapitein. ` +
      `Maar weet: uw oude beschermheer zal het u niet in dank afnemen."`,
    [
      { label: `Tekenen voor ${NATIES[stad.natie].naam}`, waarde: true },
      { label: 'Nog even niet', waarde: false },
    ],
    { figuur: 'gouverneur' }
  );
  if (!ja) return;
  const oud = s.natie;
  s.natie = stad.natie;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 20, -100, 100);
  if (oud !== stad.natie) s.relatie[oud] = clamp(s.relatie[oud] - 25, -100, 100);
  if (s.rang[stad.natie] < 1) s.rang[stad.natie] = 1;
  audio.sfx.fanfare();
  sch._bericht = `Je vaart nu onder de vlag van <b>${NATIES[stad.natie].naam}</b>.`;
  sch.ververs();
}

async function gratie(stad, sch) {
  const s = Game.speler;
  s.gespaard -= 5000;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 45, -100, 100);
  audio.sfx.munt();
  await UI.vraag(
    'Gratie',
    'Er wordt een som gestort, een handtekening gezet en een register bijgewerkt. ' +
      'Officieel is er nooit iets gebeurd.',
    [{ label: 'Zo hoort het', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  sch._bericht = 'Je naam is van de lijst geschrapt.';
  sch.ververs();
}

// --- Gouverneursopdrachten ------------------------------------------------

/** Maakt een nieuwe opdracht voor deze natie, bij deze gouverneur. */
function maakOpdracht(stad) {
  const s = Game.speler;
  const w = Game.wereld;
  const soorten = ['lever', 'spion', 'verover', 'jacht'];
  const soort = soorten[Math.floor(Math.random() * soorten.length)];
  const andere = w.steden.filter((x) => x !== stad && x.natie === stad.natie);
  const bestemming = andere.length ? andere[Math.floor(Math.random() * andere.length)] : stad;

  const opdracht = {
    soort,
    natie: stad.natie,
    stad: stad.naam,
    goud: 1200 + Math.floor(Math.random() * 2600),
    // Of de opdracht al is volbracht (verover / jacht). Lading-opdrachten
    // worden bij het rapporteren zelf gecontroleerd.
    klaar: false,
  };

  if (soort === 'lever') {
    const waar = WAREN[Math.floor(Math.random() * WAREN.length)];
    opdracht.waar = waar.id;
    opdracht.naam = waar.naam;
    opdracht.aantal = 14 + Math.floor(Math.random() * 26);
    opdracht.bestemming = bestemming.naam;
    opdracht.doe = `breng ${opdracht.aantal} eenheden ${opdracht.naam.toLowerCase()} naar ${bestemming.naam}`;
  } else if (soort === 'spion') {
    const heen = w.steden[Math.floor(Math.random() * w.steden.length)];
    opdracht.van = heen.naam;
    opdracht.bestemming = bestemming.naam;
    opdracht.doe = `haal het pakket op in ${heen.naam} en lever het af in ${bestemming.naam}`;
  } else if (soort === 'verover') {
    opdracht.stadV = bestemming.naam;
    opdracht.doe = `neem ${bestemming.naam} in voor de kroon`;
  } else {
    const vijand = w.steden.find((x) => x.natie !== stad.natie);
    opdracht.natieV = vijand ? vijand.natie : 'spanje';
    opdracht.doe = `breng een ${NATIES[opdracht.natieV].bijv} oorlogsschip tot zinken`;
  }
  return opdracht;
}

async function vraagOpdracht(stad, sch) {
  const s = Game.speler;
  s.opdracht = maakOpdracht(stad);
  const o = s.opdracht;
  const sjabloon = OPDRACHT_SOORTEN[o.soort];
  let tekst = sjabloon.omschrijving
    .replace('{aantal}', o.aantal)
    .replace('{waar}', (o.waar || '').toLowerCase())
    .replace('{bestemming}', o.bestemming)
    .replace('{van}', o.van)
    .replace('{naar}', o.bestemming)
    .replace('{stad}', o.stadV)
    .replace('{natie}', o.natieV ? NATIES[o.natieV].bijv.toLowerCase() : '');
  await UI.vraag(
    sjabloon.titel,
    `"Een opdracht voor een betrouwbaar kapitein.", zegt de gouverneur. ${tekst} ` +
      `"Breng het af en er wacht <b>${fmtGold(o.goud)} goudstukken</b> plus een specerijenvoorraad."`,
    [{ label: 'Ik neem de opdracht aan', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  o.aangenomenDag = s.dag;
  sch._bericht = `Je hebt een opdracht aangenomen: ${o.doe}. Zoek de gouverneur van ${o.stad} op voor je beloning.`;
  sch.ververs();
}

async function rapporteerOpdracht(stad, sch) {
  const s = Game.speler;
  const o = s.opdracht;
  // Verover- en jacht-opdrachten hebben een `klaar`-vlag van de gebeurtenis zelf.
  if ((o.soort === 'verover' || o.soort === 'jacht') && !o.klaar) {
    await UI.vraag(
      'Nog niet af',
      `De gouverneur schudt het hoofd. "U heeft de opdracht nog niet volbracht: ${o.doe}."`,
      [{ label: 'Weer aan het werk', waarde: 'ok' }],
      { figuur: 'gouverneur' }
    );
    sch._bericht = 'De opdracht is nog niet afgerond.';
    sch.ververs();
    return;
  }
  // Spion: je moet de tocht echt hebben gemaakt — minstens een paar dagen
  // (1 week) na het aannemen om te rapporteren.
  if (o.soort === 'spion' && s.dag - (o.aangenomenDag || 0) < 5) {
    await UI.vraag(
      'Nog onderweg?',
      `De gouverneur kijkt op. "U was net nog hier. Het pakket moet in ${o.bestemming} zijn ` +
        'afgegeven — geef het tijd, kapitein."',
      [{ label: 'Terug op zee', waarde: 'ok' }],
      { figuur: 'gouverneur' }
    );
    sch._bericht = 'Rapporteer pas nadat je de reis hebt gemaakt.';
    sch.ververs();
    return;
  }
  // Voor 'lever' moet de lading ook echt in het ruim zitten.
  if (o.soort === 'lever') {
    const schip = vlaggenschip(s);
    const idx = WAREN.findIndex((x) => x.id === o.waar);
    if (idx >= 0 && schip.lading[idx] < o.aantal) {
      await UI.vraag(
        'Nog niet klaar',
        `De gouverneur telt de lading. "U heeft nog niet genoeg ${o.waar.toLowerCase()} in uw ruim.` +
          ` Kom terug wanneer u er ${o.aantal} heeft."`,
        [{ label: 'Voorlopig weer verder', waarde: 'ok' }],
        { figuur: 'gouverneur' }
      );
      sch._bericht = `Opdracht nog niet afgerond. Je mist nog ${Math.max(0, o.aantal - (idx >= 0 ? schip.lading[idx] : 0))} eenheden.`;
      sch.ververs();
      return;
    }
    if (idx >= 0) schip.lading[idx] -= o.aantal;
  }
  // Beloning: goud + specerijen + roem.
  s.goud += o.goud;
  s.gespaard = (s.gespaard || 0) + Math.round(o.goud * 0.4);
  s.roem += o.soort === 'verover' ? 40 : o.soort === 'jacht' ? 30 : 20;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 12, -100, 100);
  // Extra lading als beloning (specerijen), als er ruim is.
  const schip = vlaggenschip(s);
  const spIdx = WAREN.findIndex((x) => x.id === 'specerijen');
  if (spIdx >= 0 && schip.lading[spIdx] + 10 <= SCHIP_INDEX[schip.type].ruim - schip.kanonnen * 2) {
    schip.lading[spIdx] += 10;
  }
  audio.sfx.fanfare();
  await UI.vraag(
    'Opdracht volbracht',
    `De gouverneur glundert. "Magnifiek! De kroon vergeet dit niet." Je ontvangt ` +
      `<b>${fmtGold(o.goud)} goudstukken</b> en een voorraad specerijen in uw ruim.`,
    [{ label: 'Met genoegen', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  s.opdracht = null;
  sch._bericht = 'De opdracht is afgerond.';
  sch.ververs();
}

// --- Stadsbestorming ------------------------------------------------------

async function bestormStad(stad, opVertrek) {
  const s = Game.speler;
  const garnizoen = Math.round(stad.garnizoen);
  const kans = clamp(
    0.5 + (s.bemanning - garnizoen) / Math.max(30, garnizoen * 1.8) + (s.moraal - 50) / 260,
    0.05,
    0.95
  );

  const ja = await UI.vraag(
    `${stad.naam} bestormen`,
    `Je zet ${s.bemanning} man aan land tegen een garnizoen van ongeveer ${garnizoen}. ` +
      `De stuurman schat de kans op ongeveer <b>${Math.round(kans * 100)}%</b>.` +
      (s.moraal < 40 ? '<br><b>De bemanning is niet in de stemming voor een bestorming.</b>' : ''),
    [
      { label: 'Aanvallen!', waarde: true, soort: 'gevaar' },
      { label: 'Terug aan boord', waarde: false, esc: true },
    ],
    { figuur: 'zeeman' }
  );
  if (!ja) {
    opVertrek();
    return;
  }

  const verliezen = Math.round(s.bemanning * lerp(0.32, 0.1, kans) * (0.6 + Math.random() * 0.8));
  s.bemanning = Math.max(1, s.bemanning - verliezen);
  stad.garnizoen = Math.max(0, stad.garnizoen - Math.round(garnizoen * (0.3 + Math.random() * 0.5)));

  if (Math.random() > kans) {
    s.moraal = clamp(s.moraal - 20, 0, 100);
    await UI.vraag(
      'Teruggeslagen',
      `Het musketvuur vanaf de wallen is te zwaar. Je verliest <b>${verliezen} man</b> en trekt je terug naar de sloepen.`,
      [{ label: 'Terug aan boord', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
    s.relatie[stad.natie] = clamp(s.relatie[stad.natie] - 20, -100, 100);
    opVertrek();
    return;
  }

  await UI.vraag(
    'Door de poort',
    `Je stormt over de wal — <b>${verliezen} man</b> blijft achter. In het gouvernementshuis ` +
      'wacht de bevelhebber van het garnizoen met getrokken degen.',
    [{ label: 'Op hem af', waarde: 'ok', soort: 'gevaar' }],
    { figuur: 'zeeman' }
  );

  const zeilScene = Game.scene;
  Game.zetScene(
    maakDuel({
      tegenstander: pick(rng, KAPITEIN_NAMEN),
      natie: stad.natie,
      vaardigheid: clamp(0.3 + stad.grootte * 0.11, 0.2, 0.92),
      voordeel: clamp(s.bemanning / Math.max(10, garnizoen), 0.5, 2.2),
      // Je staat op het binnenplein van het fort, niet op een scheepsdek.
      achtergrond: 'fort',
      terug(gewonnen) {
        Game.zetScene(zeilScene);
        if (gewonnen) veroverStad(stad, opVertrek);
        else {
          s.moraal = clamp(s.moraal - 25, 0, 100);
          s.bemanning = Math.max(1, Math.round(s.bemanning * 0.6));
          s.relatie[stad.natie] = clamp(s.relatie[stad.natie] - 20, -100, 100);
          Game.melding('De bestorming is stukgelopen op de bevelhebber.', 'rood');
          opVertrek();
        }
      },
    })
  );
}

async function veroverStad(stad, opVertrek) {
  const s = Game.speler;
  const moeilijk = MOEILIJKHEDEN.find((m) => m.id === s.moeilijkheid) || MOEILIJKHEDEN[1];
  const schat = Math.round(
    (stad.bevolking * 0.9 + stad.grootte * 2200) * stad.welvaart * (1 / clamp(moeilijk.mult, 0.5, 2.2)) *
      (stad.soort === 'schatkamer' ? 2.2 : 1)
  );
  const oudeNatie = stad.natie;

  audio.sfx.fanfare();
  const keuze = await UI.vraag(
    `${stad.naam} is gevallen`,
    `De kist van de schatkamer levert <b>${fmtGold(schat)} goudstukken</b> op. ` +
      'Wat doe je met de stad zelf?',
    [
      { label: `Overdragen aan ${NATIES[s.natie].naam}`, waarde: 'geef' },
      { label: 'Onder eigen vlag houden', waarde: 'hou' },
      { label: 'Plunderen en verlaten', waarde: 'plunder', soort: 'gevaar' },
    ],
    { figuur: 'zeeman' }
  );

  s.goud += schat;
  s.veroverdeSteden++;
  s.roem += 45;
  s.moraal = clamp(s.moraal + 18, 0, 100);
  s.relatie[oudeNatie] = clamp(s.relatie[oudeNatie] - 35, -100, 100);

  if (keuze === 'geef') {
    stad.natie = s.natie;
    stad.garnizoen = 30 + stad.grootte * 12;
    s.relatie[s.natie] = clamp(s.relatie[s.natie] + 30, -100, 100);
    Game.melding(`${stad.naam} vaart nu onder de vlag van ${NATIES[s.natie].naam}.`);
    // Een 'verover'-opdracht voor deze stad is nu afgerond.
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = true;
    }
  } else if (keuze === 'hou') {
    stad.natie = 'piraat';
    stad.garnizoen = 20 + stad.grootte * 8;
    Game.melding(`${stad.naam} is nu een vrijhaven.`);
    // Ook dan telt de verovering voor de opdracht (de vlag hangt niet meer van de oude kroon).
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = true;
    }
  } else {
    s.goud += Math.round(schat * 0.5);
    // Plunderen vervult de opdracht niet — de gouverneur wilde de stad, geen ruïne.
    if (s.opdracht && s.opdracht.soort === 'verover' && s.opdracht.stadV === stad.naam) {
      s.opdracht.klaar = false;
    }
    stad.bevolking = Math.round(stad.bevolking * 0.6);
    stad.welvaart *= 0.7;
    stad.garnizoen = 10;
    for (const n of NATIE_IDS) s.relatie[n] = clamp(s.relatie[n] - 6, -100, 100);
    Game.melding(`${stad.naam} is kaalgeplukt.`, 'rood');
  }

  opVertrek();
}

// --- Vermist familielid ---------------------------------------------------

/** Vraag langs de kade naar de vermiste vader/moeder/broer/zus. */
async function zoekFamilie(stad, sch) {
  const s = Game.speler;
  const rol = s.familie ? s.familie.rol : 'familielid';
  // Hogere roem en charme helpen; anders een loos spoor.
  const kans = clamp(0.45 + s.roem / 900 + (talentBonus(s, 'charme') ? 0.15 : 0), 0.2, 0.95);
  if (Math.random() < kans) {
    s.familie.gevonden = true;
    s.familie.gevondenDag = s.dag;
    s.roem += 60;
    s.moraal = clamp(s.moraal + 20, 0, 100);
    audio.sfx.fanfare();
    await UI.vraag(
      `Uw ${rol} is gevonden!`,
      `In een stoffige steeg vind je ten slotte je ${rol}. Na jaren van scheiding is de familie ` +
        `weer herenigd. De hele Caraïben spreekt erover. "U bent een van ons, kapitein."`,
      [{ label: 'Een traan wegpinken', waarde: 'ok' }],
      { figuur: 'gouverneur' }
    );
    sch._bericht = `Je ${rol} is veilig. De familie is weer bij elkaar.`;
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

// --- Aftreden -------------------------------------------------------------

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
    knoppen: () => [{ label: 'Een nieuw avontuur beginnen', actie: () => window.location.reload() }],
  });
  audio.sfx.fanfare();
}

function relatieWoord(v) {
  if (v <= -60) return 'op leven en dood';
  if (v <= -25) return 'vijandig';
  if (v < 15) return 'koel';
  if (v < 50) return 'vriendelijk';
  return 'bondgenoot';
}

export { relatieWoord };
