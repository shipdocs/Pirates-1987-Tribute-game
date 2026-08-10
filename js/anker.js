// Ankersysteem: voor anker gaan, bezigheden aan de kluiverboom, reflectie op
// de verstreken weken en de uitkijk in het kraaiennest.
//
// Hoofdloos bruikbaar: geen canvas, geen DOM — alleen speltoestand
// (Game.speler / Game.wereld), de UI-belofte en de meldingen van de scène.
// `sail.js` hangt de toetsen en de 5-seconden-teller van de uitkijk op.
import { clamp, TAU, dist, compassName, fmtGold, fmtDate, yearOf, el } from './util.js';
import { SCHIP_INDEX, WAAR_INDEX } from './data.js';
import { WORLD_W, WORLD_H } from './world.js';
import { Game, vlaggenschip, bewaar, nieuweLading } from './game.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

// Hoelang de uitkijk mag klimmen voordat hij rapporteert (seconden).
export const UITKIJK_VERTRAGING = 5;

// Hoe ver de uitkijk kijkt (wereldeenheden).
const UITKIJK_BEREIK = 720;

// --- Maritieme woordenschat (17e-18e eeuw) --------------------------------

/**
 * De vier ankerbezigheden. Elke regel draagt een historisch verantwoorde naam
 * en een omschrijving die het menu uitlegt zonder de sfeer te breken.
 */
const BEZIGHEDEN = {
  schrobben: {
    naam: 'De kuil schrobben',
    omschrijving: 'Schrob de dekken en de kuil met zeewater en zand.',
    melding: 'Het dek is geschrobd met zeewater en zand — de kuil ruikt weer naar teer.',
    duur: 0.5,
    moraal: 6,
  },
  slapen: {
    naam: 'De kooi induiken',
    omschrijving: 'Slaap twee waken uit en laat het volk van de hangmatten genieten.',
    melding: 'Je hebt uitgeslapen als een oude zeerot. De wacht is ververst en het volk is weer monter.',
    duur: 2,
    moraal: 16,
  },
  kalefateren: {
    naam: 'Het want opkalefateren',
    omschrijving: 'Loop het want na, stop gescheurde zeilen en smeer teer op de naden.',
    melding: 'Het want is opgekalefaterd en de romp is weer zeewaardig.',
    duur: 1.5,
    moraal: 2,
    herstelRomp: true,
  },
  loeren: {
    naam: 'Op stroom liggen en loeren',
    omschrijving: 'Lig stil op de stroom en wacht op prooi die jouw kant op komt.',
    melding: '',
    duur: 1,
    moraal: 3,
  },
};

/** Volgorde en bijbehorende druktoets van de bezigheden in het ankerscherm. */
const BEZIGHEID_VOLGORDE = [
  ['schrobben', '1'],
  ['slapen', '2'],
  ['kalefateren', '3'],
  ['loeren', '4'],
];

const VOEDSEL = WAAR_INDEX.voedsel;

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

  regels.push(`Er liggen <b>${s.bemanning}</b> koppen onder het dek`);

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

/**
 * Laat de bezigheid zijn werk doen: tijd verstrijkt, proviand wordt gebruikt,
 * de moraal herstelt en een gekalefaterd schip krijgt de romp terug.
 */
function doeBezigheid(id) {
  const s = Game.speler;
  const bez = BEZIGHEDEN[id];
  const schip = vlaggenschip(s);
  const dagen = bez.duur;

  // Proviand, net als op zee: per etmaal kost de bemanning een rantsoen per
  // bemanningsgroep.
  const nodig = Math.max(1, Math.round(s.bemanning / 22)) * dagen;
  if (schip.lading[VOEDSEL] >= nodig) {
    schip.lading[VOEDSEL] -= Math.floor(nodig);
  } else {
    schip.lading[VOEDSEL] = 0;
    s.moraal = clamp(s.moraal - 3 * dagen, 0, 100);
  }

  s.dag += dagen;
  s.leeftijd = s.startLeeftijd + s.dag / 365;

  if (bez.moraal) s.moraal = clamp(s.moraal + bez.moraal, 0, 100);

  if (bez.herstelRomp && schip.romp < schip.maxRomp) {
    // De timmerman doet de romp terwijl het volk het want opkalefatert.
    const raaf = 0.55 + (schip.romp / schip.maxRomp) * 0.2;
    schip.romp = Math.min(schip.maxRomp, schip.romp + (schip.maxRomp - schip.romp) * raaf);
  }

  if (bez.melding) {
    Game.melding(bez.melding, 'goud');
    audio.sfx.munt();
  }

  if (id === 'loeren') loerOpProoi();

  // De reflectie telt vanaf de laatste ankerbeurt.
  s.ankerDag = s.dag;
}

/** Neutrale naties waar een loerende koopvaarder onder kan varen. */
const LOERS_NATIES = ['spanje', 'engeland', 'frankrijk', 'nederland'];

/**
 * "Op stroom liggen en loeren": wie geduld heeft, ziet vanzelf een prooi
 * opduiken. We zetten een goed bepakte koopvaarder in de buurt van de
 * ankerplaats neer — geen gegarandeerde buit, maar een belofte die je zelf
 * moet verzilveren.
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
    Game.melding('Je ligt een uur op stroom, maar er komt niets jouw kant op.', 'goud');
    return;
  }

  const zwaar = Math.random() < 0.5; // bijna of helemaal volgeladen
  const ladingRuim = Math.round(t.ruim * (zwaar ? 0.7 : 0.4));
  const waarId = ['suiker', 'tabak', 'specerijen', 'handelswaar', 'katoen'][
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
    bemanning: Math.round(t.bemanning * 0.7),
    kanonnen: Math.round(t.kanonnen * 0.6),
    goud: Math.round((zwaar ? 1800 : 900) * (typeId === 'grote_koopvaarder' ? 1.6 : 1)),
    lading,
    gezien: false,
    leeftijd: 0,
    jaagt: false,
    aggroKoeling: 0,
  };
  w.vloten.push(prooi);

  Game.melding(
    `Loerend zie je een ${zwaar ? 'zwaarbeladen' : 'halfvolle'} ${t.naam.toLowerCase()} aan de ` +
      `horizon opdoemen — een kans om de buit te vergroten.`,
    'goud'
  );
  audio.sfx.haven && audio.sfx.haven();
}

// --- De ankerdialoog ------------------------------------------------------

/**
 * Toont het ankerscherm. Voor anker gaan is geen pauze maar een keuze: vier
 * historische bezigheden, een reflectie op de verstreken weken en de
 * gelegenheid het logboek bij te werken. Het scherm blijft staan na een
 * bezigheid, zodat je meerdere dingen kunt doen en pas daarna het anker licht.
 */
export function ankerDialoog() {
  const s = Game.speler;
  if (s.ankerDag == null) s.ankerDag = s.dag;

  const scherm = UI.toonScherm({
    titel: 'Voor anker',
    onder: `${fmtDate(s.dag)} · dag ${Math.floor(s.dag)}`,
    klasse: 'overlay-smal',
    bouw(body) {
      const p = el('p', 'verhaal');
      p.innerHTML =
        `De kabels lopen uit en het anker bijt zich vast in de grond. Stilte, ` +
        `op het gekrijs van de meeuwen na. Wat is je bevel, kapitein?`;
      body.appendChild(p);

      // Reflectie op de verstreken weken.
      const refl = el('div', 'schipkaart');
      refl.innerHTML = '<h3>De afgelopen weken</h3>';
      const info = el('div', 'schipkaart-info');
      info.innerHTML = reflectieRegels(s).map((r) => `<span>${r}</span>`).join('');
      refl.appendChild(info);
      body.appendChild(refl);

      const hulp = el('p', 'anker-hulp');
      hulp.innerHTML =
        '<small>Elke bezigheid kost tijd en proviand: schrobben een halve dag, ' +
        'slapen twee etmalen, kalefateren anderhalf, loeren een vol etmaal.</small>';
      body.appendChild(hulp);
    },
    knoppen: (sch) => [
      ...BEZIGHEID_VOLGORDE.map(([id, sleutel]) => ({
        label: BEZIGHEDEN[id].naam,
        sleutel,
        actie: () => {
          doeBezigheid(id);
          // Na een bezigheid blijf je voor anker liggen: het scherm ververst
          // zodat de reflectie en de toestand mee veranderen.
          sch.zetOnder(`${fmtDate(s.dag)} · dag ${Math.floor(s.dag)}`);
          sch.ververs();
        },
      })),
      {
        label: 'Het logboek bijwerken',
        actie: () => {
          if (bewaar()) Game.melding('Het logboek is bijgewerkt bij het anker.');
          else Game.melding('Bewaren mislukt.', 'rood');
        },
      },
      {
        label: 'Anker lichten',
        esc: true,
        actie: () => {
          sch.sluit();
          Game.melding('De kabels worden ingehaald. Vooruit met de gans!');
          audio.sfx.klik();
        },
      },
    ],
  });
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
      `${v.kanonnen} stukken en ${v.bemanning} koppen — ${rijp}.`
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
