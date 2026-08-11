// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Ankersysteem: voor anker gaan, bezigheden aan de kluiverboom, reflectie op
// de verstreken weken en de uitkijk in het kraaiennest.
//
// De bezigheden spelen zich af tegen een levende klok die op speelsnelheid de
// wereldtijd laat verstrijken: 1 echte seconde ≈ 1 speeluur (DAGEN_PER_SECONDE
// uit world.js). Terwijl de klok tikt, verandert de datum, eet het scheepsvolk
// zijn rantsoenen en draaien de wereldsystemen door — precies zoals onder zeil.
//
// Hoofdloos bruikbaar voor de speltoestand (Game.speler / Game.wereld); alleen
// de klok-animatie draait op requestAnimationFrame in de DOM. `sail.js` hangt
// de toetsen en de 5-seconden-teller van de uitkijk op.
import { clamp, TAU, dist, compassName, fmtGold, fmtDate, yearOf, el } from './util.js';
import { SCHIP_INDEX, WAAR_INDEX } from './data.js';
import { WORLD_W, WORLD_H, DAGEN_PER_SECONDE } from './world.js';
import { Game, vlaggenschip, bewaar, nieuweLading } from './game.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

// Hoelang de uitkijk mag klimmen voordat hij rapporteert (seconden).
export const UITKIJK_VERTRAGING = 5;

// Hoe ver de uitkijk kijkt (wereldeenheden).
const UITKIJK_BEREIK = 720;

const PROVIAND = WAAR_INDEX.proviand;

/**
 * Hoeveel echte seconden een ankerbezigheid van `dagen` etmalen duurt. De
 * wereldtijd loopt op speelsnelheid (DAGEN_PER_SECONDE etmalen per seconde),
 * dus duur / DAGEN_PER_SECONDE is de kloktijd die de speler ziet aftellen.
 */
const echteSeconden = (dagen) => dagen / DAGEN_PER_SECONDE;

// Eén speeluur als breuk van een etmaal.
const UUR = 1 / 24;

// --- Maritieme woordenschat (17e-18e eeuw) --------------------------------

/**
 * De vier ankerbezigheden. Elke regel draagt een historisch verantwoorde naam,
 * een eigen visuele prent, en een omschrijving die het menu uitlegt zonder de
 * sfeer te breken.
 */
const BEZIGHEDEN = {
  schrobben: {
    naam: 'De kuil schrobben',
    omschrijving: 'Schrob de dekken en de kuil met zeewater en zand.',
    melding: 'Het dek is geschrobd met zeewater en zand — de kuil ruikt weer naar teer.',
    duur: 0.5,
    geest: 6,
    kleur: 'schrobben',
    tijdTekst: '½ etmaal',
    baatTekst: '+6 geest',
    bij: 'Het volk schrobt het dek met schuimend zeewater en scherp zand.',
    prent:
      '<svg viewBox="0 0 28 28">' +
      '<path d="M7.5 11.5h13l-1.4 9a2.2 2.2 0 0 1-2.2 1.8h-5.8a2.2 2.2 0 0 1-2.2-1.8z" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M9.5 11.5a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M14 15v3M11.5 15.8h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>' +
      '</svg>',
  },
  slapen: {
    naam: 'De kooi induiken',
    omschrijving: 'Slaap twee waken uit en laat het volk van de hangmatten genieten.',
    melding: 'Je hebt uitgeslapen als een oude zeerot. De wacht is ververst en het volk is weer monter.',
    duur: 2,
    geest: 16,
    kleur: 'slapen',
    tijdTekst: '2 etmalen',
    baatTekst: '+16 geest',
    bij: 'Het scheepsvolk slaapt twee waken uit onder de hangmatten.',
    prent:
      '<svg viewBox="0 0 28 28">' +
      '<path d="M4.5 7.5c6.3-2.6 12.7-2.6 19 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M5 7.5l2.8 4 2.4-3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>' +
      '<path d="M23 7.5l-2.8 4-2.4-3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>' +
      '<path d="M7.8 11.6c4.2-1.7 8.2-1.7 12.4 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M19.5 7a4.2 4.2 0 1 1 3.6 6.1 5 5 0 0 1-3.6-6.1z" fill="rgba(255,255,255,0.18)" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>',
  },
  kalefateren: {
    naam: 'Het want opkalefateren',
    omschrijving: 'Loop het want na, stop gescheurde zeilen en smeer teer op de naden.',
    melding: 'Het want is opgekalefaterd en de romp is weer zeewaardig.',
    duur: 1.5,
    geest: 2,
    herstelRomp: true,
    kleur: 'kalefateren',
    tijdTekst: '1½ etmaal',
    baatTekst: 'romp hersteld',
    bij: 'De timmerman slaat de naden dicht en smeert er teer over.',
    prent:
      '<svg viewBox="0 0 28 28">' +
      '<path d="M15.5 10 21.5 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M13.8 11.7 17.6 8a2.1 2.1 0 0 1 3 3l-3.8 3.6z" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M4.5 14.5h8l-.6 4a1.9 1.9 0 0 1-1.9 1.6H7a1.9 1.9 0 0 1-1.9-1.6z" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M7 14.5 6.2 11M10.5 14.5l.8-3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>' +
      '</svg>',
  },
  loeren: {
    naam: 'Op stroom liggen en loeren',
    omschrijving: 'Lig stil op de stroom en wacht op prooi die jouw kant op komt.',
    melding: '',
    duur: 1,
    geest: 3,
    kleur: 'loeren',
    tijdTekst: '1 etmaal',
    baatTekst: 'kans op prooi',
    bij: 'De uitkijk spiedt door de verrekijker naar zeilen aan de horizon.',
    prent:
      '<svg viewBox="0 0 28 28">' +
      '<circle cx="8.5" cy="15" r="3.6" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="8.5" cy="15" r="1.5" fill="rgba(255,255,255,0.5)" stroke="none"/>' +
      '<path d="M11.8 13.4 21 6.5l4 1.6-2.6 4.6-8.6 2.4z" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M21 6.5l-2 5.6" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>' +
      '</svg>',
  },
};

/** Volgorde en bijbehorende druktoets van de bezigheden in het ankerscherm. */
const BEZIGHEID_VOLGORDE = [
  ['schrobben', '1'],
  ['slapen', '2'],
  ['kalefateren', '3'],
  ['loeren', '4'],
];

/** Druktoets → bezigheid, voor de cijfertoetsen boven het toetsenbord. */
const DIGIT_TOETS = {
  Digit1: 'schrobben', Digit2: 'slapen', Digit3: 'kalefateren', Digit4: 'loeren',
  Numpad1: 'schrobben', Numpad2: 'slapen', Numpad3: 'kalefateren', Numpad4: 'loeren',
};

// --- Reflectie op de verstreken weken -------------------------------------

/**
 * Rijtje met wat er sinds de vorige ankerbeurt is gebeurd, in zeemanswoorden.
 * Het anker wordt zo een rustpunt om terug te kijken, niet een laadscherm.
 */
function reflectieRegels(s) {
  const regels = [];
  const dagen = s.ankerDag == null ? s.dag : s.dag - s.ankerDag;
  regels.push(`Er liggen <b>${fmtGold(dagen)} etmalen</b> achter de kiel`);

  const schip = vlaggenschip(s);
  const romp = Math.round((schip.romp / schip.maxRomp) * 100);
  regels.push(`De romp is voor <b>${romp}%</b> in stand`);

  regels.push(`Er liggen <b>${s.scheepsvolk}</b> koppen onder het dek`);

  if (s.roem > 0) regels.push(`Uw naam luidt <b>${Math.round(s.roem)} roem</b> over de eilanden`);
  if ((s.schattenGevonden || 0) > 0) {
    regels.push(`Van de bodem kwamen <b>${s.schattenGevonden} kist${s.schattenGevonden > 1 ? 'en' : ''} schat</b>`);
  }
  if ((s.verslagenSchepen || 0) > 0) {
    regels.push(`U bracht <b>${s.verslagenSchepen} vijand${s.verslagenSchepen > 1 ? 'en' : ''}</b> tot zinken`);
  }
  if ((s.veroverdeSteden || 0) > 0) {
    regels.push(`U veroverde <b>${s.veroverdeSteden} stad${s.veroverdeSteden > 1 ? 'en' : ''}</b>`);
  }
  if (s.familie) {
    if (s.familie.gevonden) regels.push('Uw familie is weer bij u');
    else if (s.familie.spoor) regels.push(`Het spoor van uw ${s.familie.rol} is getrokken`);
    else regels.push(`Uw ${s.familie.rol} is nog altijd vermist`);
  }
  regels.push(`Het is nu het jaar <b>${yearOf(s.dag)}</b>`);

  return regels;
}

// --- De levende klok ------------------------------------------------------

/**
 * De wijzerplaat van de ankerklok: een kompasroos met vierentwintig streepjes —
 * één per speeluur. De wijzer (`#anker-wijzer`) wordt vanuit JS op de
 * dagfractie van de wereldtijd gezet, zodat de klok precies met het spel
 * meeloopt en één rondgang een vol etmaal voorstelt.
 */
function klokSVG() {
  let s = '<svg viewBox="0 0 116 116" aria-hidden="true">';
  s += '<circle cx="58" cy="58" r="54" fill="rgba(255,246,214,0.16)" stroke="#8a6130" stroke-width="2"/>';
  s += '<circle cx="58" cy="58" r="49" fill="none" stroke="rgba(138,97,48,0.5)" stroke-width="1"/>';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU - Math.PI / 2;
    const lang = i % 6 === 0;
    const r1 = lang ? 44 : 47;
    const x1 = 58 + Math.cos(a) * r1;
    const y1 = 58 + Math.sin(a) * r1;
    const x2 = 58 + Math.cos(a) * 50;
    const y2 = 58 + Math.sin(a) * 50;
    s +=
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
      `stroke="${lang ? '#6d4a1c' : '#8a6130'}" stroke-width="${lang ? 2 : 1}"/>`;
  }
  s +=
    '<g font-size="9" font-family="Georgia, serif" fill="#6d4a1c" text-anchor="middle">' +
    '<text x="58" y="15">N</text><text x="105" y="61">O</text>' +
    '<text x="58" y="107">Z</text><text x="11" y="61">W</text></g>';
  s +=
    '<g id="anker-wijzer">' +
    '<line x1="58" y1="66" x2="58" y2="16" stroke="#6d4a1c" stroke-width="3.2" stroke-linecap="round"/>' +
    '<line x1="58" y1="66" x2="58" y2="52" stroke="#8a6130" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="58" cy="58" r="6" fill="#b8862f" stroke="#6d4a1c" stroke-width="1.5"/>' +
    '</g></svg>';
  return s;
}

/** Zet de klokwijzer op de dagfractie van de wereldtijd (één rondgang/etmaal). */
function zetKlok(wijzer, dag) {
  const fractie = ((dag % 1) + 1) % 1;
  wijzer.setAttribute('transform', `rotate(${(fractie * 360).toFixed(2)} 58 58)`);
}

// --- Tijdsverloop ---------------------------------------------------------

/**
 * Eén dag aan de kluiverboom passeert de revue: het scheepsvolk eet zijn
 * rantsoen en de geest zakt een tikkeltje, precies zoals een dag onder zeil.
 * Geen eigen variant hier — dit is dezelfde regel als aan het roer. Levert
 * `true` als het rantsoen tekortschoot, zodat het ankerscherm dat in zijn
 * berichtvak kan melden in plaats van het achter de modal te verliezen.
 */
function eetDag(s) {
  const schip = vlaggenschip(s);
  const nodig = Math.max(1, Math.round(s.scheepsvolk / 22));
  if (schip.lading[PROVIAND] >= nodig) {
    schip.lading[PROVIAND] -= nodig;
    s.geest = clamp(s.geest - 0.35, 0, 100);
    return false;
  }
  schip.lading[PROVIAND] = 0;
  s.geest = clamp(s.geest - 4, 0, 100);
  return true;
}

/**
 * De centrale route voor verstreken wereldtijd: precies de dagelijkse systemen
 * die onder zeil ook tikken, in één keer bijgewerkt met de totale verstreken
 * ankertijd. Zo kan geen bezigheid een onvolledige eigen versie van de wereld
 * krijgen — het resultaat is dezelfde wereld als waarin werkelijk zoveel
 * etmalen zijn verstreken.
 */
export function werkWereldTijd(dagen, seconden) {
  const w = Game.wereld;
  const s = Game.speler;
  w.windTik(seconden);
  w.economieTik(dagen);
  w.relatieTik(dagen, s);
  w.vlotenTik(seconden, s);
}

/**
 * Voor bezigheden die de datum in één klap laten opschieten (zonder de
 * levende klok van het ankerscherm) — de datum en leeftijd zelf worden hier,
 * anders dan bij `werkWereldTijd`, dus wél meegenomen. Gebruikt door
 * gevangenschap (battle.js) en de bestormingskeuzes (town/bestorming.js).
 */
export function verstrijkDagen(dagen) {
  const s = Game.speler;
  s.dag += dagen;
  s.leeftijd = s.startLeeftijd + s.dag / 365;
  werkWereldTijd(dagen, dagen / DAGEN_PER_SECONDE);
}

/**
 * Restant in zeemanswoorden: een halve bezigheid is "8 speeluren", een lange
 * "2 etmalen en 3 uur". Kleine restjes worden netjes afgerond naar boven.
 */
function fmtSpeelTijd(dagen) {
  const u = Math.max(0, dagen * 24);
  if (dagen < UUR) return 'zo goed als klaar';
  if (dagen < 1) {
    const uren = Math.max(1, Math.ceil(u));
    return `${uren} speeluur${uren > 1 ? 'en' : ''}`;
  }
  const hele = Math.floor(dagen);
  const restU = Math.round((dagen - hele) * 24);
  let t = `${hele} etmaal${hele > 1 ? 'en' : ''}`;
  if (restU) t += ` ${restU} uur`;
  return t;
}

// --- De bezigheden --------------------------------------------------------

/** Laat de bezigheid zijn vruchten afwerpen: geest, romp en de uitkomsttekst. */
function doeBezigheid(id) {
  const s = Game.speler;
  const bez = BEZIGHEDEN[id];
  const schip = vlaggenschip(s);

  if (bez.geest) s.geest = clamp(s.geest + bez.geest, 0, 100);

  if (bez.herstelRomp && schip.romp < schip.maxRomp) {
    // De timmerman doet de romp terwijl het volk het want opkalefatert.
    const raaf = 0.55 + (schip.romp / schip.maxRomp) * 0.2;
    schip.romp = Math.min(schip.maxRomp, schip.romp + (schip.maxRomp - schip.romp) * raaf);
  }

  let tekst = bez.melding;
  let klasse = 'goed';
  if (id === 'loeren') {
    const r = loerOpProoi();
    tekst = r.tekst;
    klasse = r.klasse;
  } else if (tekst) {
    audio.sfx.munt();
  }

  // De reflectie telt vanaf de laatste ankerbeurt.
  s.ankerDag = s.dag;
  return { tekst, klasse };
}

/** Neutrale naties waar een loerende koopvaarder onder kan varen. */
const LOERS_NATIES = ['spanje', 'engeland', 'frankrijk', 'nederland'];

/**
 * "Op stroom liggen en loeren": wie geduld heeft, ziet vanzelf een prooi
 * opduiken. We zetten een goed bepakte koopvaarder in de buurt van de
 * ankerplaats neer — geen gegarandeerde buit, maar een belofte die je zelf
 * moet verzilveren. De uitkomst komt in het ankerscherm zelf terug, niet in
 * een canvasmelding die achter de modal verdwijnt.
 */
function loerOpProoi() {
  const s = Game.speler;
  const w = Game.wereld;
  const typeId = Math.random() < 0.6 ? 'koopvaarder' : 'grote_koopvaarder';
  const t = SCHIP_INDEX[typeId];

  // Een plek op open zee, een eindje uit de kust.
  let px = clamp(s.x + (Math.random() * 2 - 1) * 520, 60, WORLD_W - 60);
  let py = clamp(s.y + (Math.random() * 2 - 1) * 520, 60, WORLD_H - 60);
  if (!w.isVaren(px, py, typeId)) {
    const [vx, vy] = w.dichtstbijVaren(px, py, typeId, 300);
    px = vx;
    py = vy;
  }
  if (!w.isVaren(px, py, typeId)) {
    audio.sfx.klik();
    return {
      tekst: 'Je ligt een uur op stroom, maar er komt niets jouw kant op. Alleen tijd en proviand verloren.',
      klasse: 'risico',
    };
  }

  const zwaar = Math.random() < 0.5; // bijna of helemaal volgeladen
  const ladingRuim = Math.round(t.ruim * (zwaar ? 0.7 : 0.4));
  const waarId = ['suiker', 'tabak', 'specerijen', 'koopwaar', 'katoen'][
    Math.floor(Math.random() * 5)
  ];
  const lading = nieuweLading({ [waarId]: ladingRuim });

  const prooi = {
    natie: LOERS_NATIES[Math.floor(Math.random() * LOERS_NATIES.length)],
    marine: false,
    type: typeId,
    naam: 'Een stille koopvaarder',
    legende: null,
    x: px,
    y: py,
    koers: Math.random() * TAU,
    snelheid: 0,
    doel: w.steden[Math.floor(Math.random() * w.steden.length)],
    romp: t.romp,
    zeilen: 1,
    scheepsvolk: Math.round(t.scheepsvolk * 0.7),
    geschut: Math.round(t.geschut * 0.6),
    goud: Math.round((zwaar ? 1800 : 900) * (typeId === 'grote_koopvaarder' ? 1.6 : 1)),
    lading,
    gezien: false,
    leeftijd: 0,
    jaagt: false,
    aggroKoeling: 0,
  };
  w.vloten.push(prooi);

  audio.sfx.haven();
  return {
    tekst:
      `Loerend zie je een ${zwaar ? 'zwaarbeladen' : 'halfvolle'} ${t.naam.toLowerCase()} aan de ` +
      `horizon opdoemen — een kans om de buit te vergroten.`,
    klasse: 'goed',
  };
}

// --- De levende bezigheid -------------------------------------------------

/**
 * Start een bezigheid en draait hem in echtijd op speelsnelheid af. Terwijl de
 * klok tikt, verstrijkt de wereldtijd dag voor dag zichtbaar; bij de mijlpalen
 * klinkt de scheepsbel en na een vol etmaal de wachtglas-renner. Aan het eind
 * krijgt de bezigheid zijn vruchten en wordt de wereld met de totale
 * verstreken tijd bijgewerkt.
 */
function startBezigheid(id, scherm, refs, rafId) {
  const bez = BEZIGHEDEN[id];
  const totaal = echteSeconden(bez.duur);
  let rest = totaal;
  let vorig = performance.now();
  const s = Game.speler;
  let vorigeDag = Math.floor(s.dag);
  let vorigUur = Math.floor(s.dag * 24);
  // Of het rantsoen onderweg tekortschoot; dat hoort in het berichtvak.
  let hongerGemeld = false;

  // De eigen werkkaart: prent, afteltimer, voortgangsbalk en een uitkomstvak.
  const bezig = el('div', 'anker-bezig');
  const kop = el('div', 'anker-bezig-kop');
  kop.appendChild(el('h3', null, bez.naam));
  const timer = el('div', 'anker-bezig-timer');
  const timerGroot = el('span');
  const timerKlein = el('small', null, 'resterende wacht');
  timer.appendChild(timerGroot);
  timer.appendChild(timerKlein);
  kop.appendChild(timer);
  bezig.appendChild(kop);

  const prent = el('div', 'anker-bezig-prent');
  prent.innerHTML = bez.prent;
  bezig.appendChild(prent);

  const balk = el('div', 'anker-bezig-balk');
  const vul = el('div', 'anker-bezig-vul');
  balk.appendChild(vul);
  const label = el('div', 'anker-bezig-balk-label', '0%');
  balk.appendChild(label);
  bezig.appendChild(balk);

  bezig.appendChild(el('p', 'anker-bezig-bij', bez.bij));

  const klaarVak = el('div', 'anker-bezig-klaar');
  klaarVak.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M5 13l4 4 10-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  bezig.appendChild(klaarVak);

  // De rust weghalen: alleen het werk blijft over, en de knoppen worden
  // gesloten tot de bezigheid klaar is.
  for (const k of [refs.verhaal, refs.refl, refs.hulp, refs.bezigheden]) k.style.display = 'none';
  refs.bericht.style.display = 'none';
  refs.body.appendChild(bezig);
  for (const b of scherm.voet.querySelectorAll('button')) b.disabled = true;

  function voltooi() {
    cancelAnimationFrame(rafId.waarde);
    vul.style.width = '100%';
    label.textContent = '100%';
    balk.classList.add('vol');
    bezig.classList.add('klaar');
    klaarVak.style.display = 'grid';
    timerGroot.textContent = 'Klaar!';
    timerKlein.textContent = '';
    audio.sfx.glas();
    audio.sfx.klaar();

    // De vruchten van de bezigheid, en de wereld met de hele verstreken tijd.
    const uitkomst = doeBezigheid(id);
    if (hongerGemeld) {
      uitkomst.tekst += ' De proviand is tussentijds opgeraakt — het volk heeft honger geleden.';
      uitkomst.klasse = uitkomst.klasse === 'risico' ? 'risico' : 'goed';
    }
    werkWereldTijd(bez.duur, totaal);

    setTimeout(() => {
      // Terug naar het rustscherm: het berichtvak toont de uitkomst, de datum
      // en de toestand zijn ververst en de knoppen zijn weer open.
      refs.bezigLopend = false;
      refs.laatste = uitkomst;
      scherm.ververs();
      scherm.zetOnder(`${fmtDate(s.dag)} · dag ${Math.floor(s.dag)}`);
    }, 1600);
  }

  function stap(nu) {
    const dt = clamp((nu - vorig) / 1000, 0, 0.05);
    vorig = nu;
    rest -= dt;

    // Wereldtijd verstrijkt op speelsnelheid; het volk eet op elke dagwissel.
    s.dag += dt * DAGEN_PER_SECONDE;
    s.leeftijd = s.startLeeftijd + s.dag / 365;
    const dag = Math.floor(s.dag);
    if (dag !== vorigeDag) {
      vorigeDag = dag;
      if (eetDag(s)) hongerGemeld = true;
    }
    // Scheepsbel per wacht (om de acht speeluren), toeg op de uren daartussen.
    const uur = Math.floor(s.dag * 24);
    if (uur !== vorigUur) {
      vorigUur = uur;
      if (uur % 8 === 0) audio.sfx.glas();
      else audio.sfx[uur % 2 ? 'toegHoog' : 'toeg']();
    }

    // De voortgang zichtbaar maken: balk, percentage, timer en de wijzer die
    // met de wereldtijd meedraait.
    const v = 1 - clamp(rest / totaal, 0, 1);
    vul.style.width = `${(v * 100).toFixed(1)}%`;
    label.textContent = `${Math.round(v * 100)}%`;
    timerGroot.textContent = fmtSpeelTijd(bez.duur - v * bez.duur);
    timerKlein.textContent = `nog ${Math.max(1, Math.ceil(rest))} seconden`;
    zetKlok(refs.wijzer, s.dag);
    scherm.zetOnder(`${fmtDate(s.dag)} · dag ${Math.floor(s.dag)}`);

    if (rest <= 0) {
      voltooi();
      return;
    }
    rafId.waarde = requestAnimationFrame(stap);
  }

  zetKlok(refs.wijzer, s.dag);
  timerGroot.textContent = fmtSpeelTijd(bez.duur);
  rafId.waarde = requestAnimationFrame(stap);
}

// --- De ankerdialoog ------------------------------------------------------

/**
 * Toont het ankerscherm. Voor anker gaan is geen pauze maar een keuze: vier
 * historische bezigheden op een levende klok, een reflectie op de verstreken
 * weken en de gelegenheid het logboek bij te werken. Het scherm blijft staan
 * na een bezigheid, zodat je meerdere dingen kunt doen en pas daarna het anker
 * licht — en elke uitkomst verschijnt in een eigen berichtvak, niet achter de
 * modal.
 */
export function ankerDialoog() {
  const s = Game.speler;
  if (s.ankerDag == null) s.ankerDag = s.dag;

  // Gedeelde verwijzingen naar de elementen die de levende bezigheid bijwerkt.
  // `bezigLopend` woont hier ook: de bezigheid zelf (modulefunctie `startBezigheid`)
  // zet hem terug zodra hij klaar is, zodat de knoppen weer opengaan.
  const refs = {
    verhaal: null, refl: null, hulp: null, bezigheden: null,
    wijzer: null, bericht: null, body: null, laatste: null,
    bezigLopend: false,
  };
  const rafId = { waarde: 0 };

  const maakKaart = (id, scherm) => {
    const bez = BEZIGHEDEN[id];
    const b = el('button', 'anker-bezigheid');
    b.type = 'button';
    b.title = bez.omschrijving;
    const kleur = el('span', `anker-bezigheid-kleur ${bez.kleur}`);
    kleur.innerHTML = bez.prent;
    b.appendChild(kleur);
    b.appendChild(el('span', 'anker-bezigheid-naam', bez.naam));
    b.appendChild(el('span', 'anker-bezigheid-tijd', bez.tijdTekst));
    b.appendChild(el('span', 'anker-bezigheid-baat', bez.baatTekst));
    b.addEventListener('click', () => {
      if (refs.bezigLopend) return;
      refs.bezigLopend = true;
      startBezigheid(id, scherm, refs, rafId);
    });
    return b;
  };

  const scherm = UI.toonScherm({
    titel: 'Voor anker',
    onder: `${fmtDate(s.dag)} · dag ${Math.floor(s.dag)}`,
    klasse: 'overlay-smal',
    opSluiten() {
      cancelAnimationFrame(rafId.waarde);
      window.removeEventListener('keydown', toetsBezigheid);
    },
    bouw(body, sch) {
      refs.body = body;

      // De levende klok.
      const klok = el('div', 'anker-klok');
      klok.innerHTML = klokSVG();
      body.appendChild(klok);
      refs.wijzer = klok.querySelector('#anker-wijzer');
      zetKlok(refs.wijzer, s.dag);

      const p = el('p', 'verhaal');
      p.innerHTML =
        `De kabels lopen uit en het anker bijt zich vast in de grond. Stilte, ` +
        `op het gekrijs van de meeuwen na. Wat is je bevel, kapitein?`;
      body.appendChild(p);
      refs.verhaal = p;

      // Reflectie op de verstreken weken.
      const refl = el('div', 'schipkaart');
      refl.innerHTML = '<h3>De afgelopen weken <em>— de klok hierboven telt de wachten</em></h3>';
      const info = el('div', 'schipkaart-info');
      info.innerHTML = reflectieRegels(s).map((r) => `<span>${r}</span>`).join('');
      refl.appendChild(info);
      body.appendChild(refl);
      refs.refl = refl;

      // Het berichtvak: hier komt de uitkomst van elke bezigheid, ook die van
      // het loeren. Live gemarkeerd, zodat hij ook voorgelezen wordt.
      const bericht = el('div', 'anker-bericht');
      bericht.setAttribute('aria-live', 'polite');
      bericht.setAttribute('role', 'status');
      if (refs.laatste) {
        bericht.textContent = refs.laatste.tekst;
        bericht.classList.add(refs.laatste.klasse);
      }
      body.appendChild(bericht);
      refs.bericht = bericht;

      // De vier bezigheden als eigen kaarten. `sch` is dit scherm zelf; het
      // bestaat al voordat `bouw` draait, dus de kaarten kunnen ernaar verwijzen.
      const bezigheden = el('div', 'anker-bezigheden');
      for (const [id] of BEZIGHEID_VOLGORDE) bezigheden.appendChild(maakKaart(id, sch));
      body.appendChild(bezigheden);
      refs.bezigheden = bezigheden;

      const hulp = el('p', 'anker-hulp');
      hulp.innerHTML =
        '<small>Elke bezigheid kost tijd en proviand — de klok tikt op speelsnelheid, ' +
        'één seconde per speeluur. Druk de cijfertoetsen 1-4 om een bezigheid te kiezen.</small>';
      body.appendChild(hulp);
      refs.hulp = hulp;
    },
    knoppen: (sch) => [
      {
        label: 'Het logboek bijwerken',
        actie: () => {
          if (refs.bezigLopend) return;
          if (bewaar()) Game.melding('Het logboek is bijgewerkt bij het anker.');
          else Game.melding('Bewaren mislukt.', 'rood');
        },
      },
      {
        label: 'Anker lichten',
        esc: true,
        actie: () => {
          if (refs.bezigLopend) return;
          sch.sluit();
          Game.melding('De kabels worden ingehaald. Vooruit met de gans!');
          audio.sfx.klik();
        },
      },
    ],
  });

  function toetsBezigheid(e) {
    if (refs.bezigLopend) return;
    const id = DIGIT_TOETS[e.code];
    if (!id) return;
    e.preventDefault();
    refs.bezigLopend = true;
    startBezigheid(id, scherm, refs, rafId);
  }
  window.addEventListener('keydown', toetsBezigheid);

  return scherm;
}

// --- De uitkijk -----------------------------------------------------------

/** Geeft het geschatte type van een vloot in de woorden van de uitkijk. */
function typeWoord(v) {
  if (v.marine) return 'een oorlogsschip';
  if (v.type === 'koopvaarder' || v.type === 'grote_koopvaarder') return 'een logge koopvaarder';
  // Fregatten krijgen hun eigen naam; de rest een korte omschrijving.
  if (v.type === 'fregat') return 'een fregat';
  const t = SCHIP_INDEX[v.type];
  return t ? `een ${t.naam.toLowerCase()}` : 'een zeil';
}

/**
 * De uitkijk in het kraaiennest is klaar met klimmen en rapporteert wat hij
 * in de verte ziet: schepen met hun geschatte type, richting en of ze als
 * bedreiging of als buit te boek staan.
 */
export function uitkijkRapport() {
  const s = Game.speler;
  const w = Game.wereld;
  const vreemd = w.vloten.filter((v) => dist(v.x, v.y, s.x, s.y) < UITKIJK_BEREIK);

  if (!vreemd.length) {
    Game.melding('Uitkijk meldt: niets dan zee en horizon, kapitein. Geen zeil te zien.');
    return;
  }

  // Van dichtbij naar veraf; de meest bedreigende eerst.
  vreemd.sort((a, b) => dist(a.x, a.y, s.x, s.y) - dist(b.x, b.y, s.x, s.y));

  // Hoogstens drie rapporten, anders wordt het een almanak.
  const deel = vreemd.slice(0, 3);
  const zinnen = deel.map((v) => {
    const kant = compassName(Math.atan2(v.y - s.y, v.x - s.x));
    // "Aan loefzijde" is de kleurrijkste kant; kompasrichtingen krijgen "in het".
    const ligging = kant === 'O' ? 'aan loefzijde' : kant === 'W' ? 'aan lijzijde' : `in het ${kant.toLowerCase()}`;
    const rijp = v.marine || v.natie === 'piraat' ? 'houdt een oog in het zeil' : 'rijp voor de plundering';
    return (
      `<b>${typeWoord(v)}</b> ${ligging}, zeilen vol in de wind, naar schatting ` +
      `${v.geschut} stukken geschut en ${v.scheepsvolk} koppen — ${rijp}.`
    );
  });

  Game.melding(`Uitkijk meldt: ${zinnen.join(' ')}`, 'goud');
  audio.sfx.munt();
}

/**
 * Zet de uitkijk in gang: de man klimt naar het kraaiennest, en pas na
 * `UITKIJK_VERTRAGING` seconden (afgeteld in `sail.js`) volgt het rapport.
 */
export function startUitkijk() {
  Game.melding('De uitkijk klimt naar het kraaiennest…', 'goud');
  audio.sfx.klik();
}
