// Zeeslag: laveren, de wind uitbuiten en de volle laag geven.
import { clamp, lerp, normAngle, dist, TAU, turnToward, fmtGold } from './util.js';
import { WAREN, SCHIP_INDEX, scheepsAanduiding, metLidwoord, MOEILIJKHEDEN } from './data.js';
import { zeilEfficiëntie } from './world.js';
import { Game, roundRect, vlaggenschip, nieuwSchip, talentBonus } from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakDuel } from './duel.js';

const ARENA_X = 1150;
const ARENA_Y = 820;

const MUNITIE = [
  { id: 'rond', naam: 'Rondkogel', kort: 'ROND', doel: 'romp', omschrijving: 'Beukt de romp aan splinters.' },
  { id: 'ketting', naam: 'Kettingkogel', kort: 'KETTING', doel: 'zeilen', omschrijving: 'Scheurt zeilen en tuigage.' },
  { id: 'schroot', naam: 'Schroot', kort: 'SCHROOT', doel: 'bemanning', omschrijving: 'Maait het dek schoon.' },
];

export function maakZeeslag(vloot, opts) {
  const wereld = Game.wereld;
  const speler = Game.speler;
  const eigenSchip = vlaggenschip(speler);

  // Moeilijkheid schaalt alleen de vijand (niet de eigen romp), zodat een
  // hogere stand meer tegenstand betekent zonder dat de speler fragieler is.
  const moe = MOEILIJKHEDEN.find((m) => m.id === speler.moeilijkheid) || MOEILIJKHEDEN[1];
  const vijandKracht = moe ? moe.mult : 1;

  const mij = maakStrijder({
    type: eigenSchip.type,
    natie: 'piraat',
    romp: eigenSchip.romp,
    maxRomp: eigenSchip.maxRomp,
    kanonnen: eigenSchip.kanonnen,
    bemanning: speler.bemanning,
    x: -230,
    y: 70,
    koers: 0,
    speler: true,
  });

  const type = SCHIP_INDEX[vloot.type];
  const startBemanning = Math.round(vloot.bemanning);
  const startKanonnen = Math.round(vloot.kanonnen);
  const vijand = maakStrijder({
    type: vloot.type,
    natie: vloot.natie,
    romp: vloot.romp,
    maxRomp: type.romp,
    kanonnen: startKanonnen,
    // Moeilijkheid geeft de vijand meer (of minder) bemanning.
    bemanning: Math.round(startBemanning * Math.sqrt(vijandKracht)),
    x: 250,
    y: -110,
    koers: Math.PI,
  });
  // Streepjes voor overgave: hoe zwaarder de vijand, hoe meer je moet slopen.
  vijand.startBemanning = Math.round(startBemanning * Math.sqrt(vijandKracht));
  vijand.startKanonnen = startKanonnen;
  mij.startKanonnen = mij.kanonnen;

  let kogels = [];
  let deeltjes = [];
  let munitie = 0;
  let tijd = 0;
  let afgelopen = false;
  let vijandMoraal = 100;
  const cam = { x: 0, y: 0, zoom: 0.85 };

  const scene = {
    naam: 'zeeslag',
    // Handvat voor de console: __G.scene.debug.vijand.romp = 1, enzovoort.
    debug: { mij, vijand },

    betreed() {
      cam.x = (mij.x + vijand.x) / 2;
      cam.y = (mij.y + vijand.y) / 2;
      audio.stopMuziek();
      Game.melding(`Gevecht met een ${scheepsAanduiding(vloot.natie, vloot.type)}!`, 'rood');
    },

    verlaat() {
      audio.startMuziek();
    },

    toets(code) {
      if (UI.ietsOpen() || afgelopen) return;
      if (code === 'Digit1') munitie = 0;
      if (code === 'Digit2') munitie = 1;
      if (code === 'Digit3') munitie = 2;
      if (code === 'Tab') munitie = (munitie + 1) % MUNITIE.length;
      if (code === 'Space') vuur(mij, vijand);
      if (code === 'KeyB') probeerEnteren();
      if (code === 'Escape') probeerVluchten();
    },

    werkBij(dt) {
      if (UI.ietsOpen() || afgelopen) return;
      tijd += dt;
      wereld.windTik(dt * 0.4);

      stuurSpeler(dt);
      stuurVijand(dt);
      beweeg(mij, dt);
      beweeg(vijand, dt);

      // Kogels.
      for (let i = kogels.length - 1; i >= 0; i--) {
        const k = kogels[i];
        k.t += dt;
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        if (k.t >= k.vlucht) {
          const doel = k.doel;
          if (k.raak) {
            treffer(doel, k);
            audio.sfx.treffer();
            spatDeeltjes(k.x, k.y, '#ffb45a', 7);
          } else {
            audio.sfx.plons();
            deeltjes.push({ x: k.x, y: k.y, t: 0, duur: 0.6, r: 4, kleur: '#cfe9f2', vx: 0, vy: 0 });
          }
          kogels.splice(i, 1);
        }
      }

      for (let i = deeltjes.length - 1; i >= 0; i--) {
        const p = deeltjes[i];
        p.t += dt;
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        if (p.t > p.duur) deeltjes.splice(i, 1);
      }

      mij.herlaad = Math.max(0, mij.herlaad - dt);
      vijand.herlaad = Math.max(0, vijand.herlaad - dt);

      // Brand vreet langzaam door.
      for (const s of [mij, vijand]) {
        if (s.brand > 0) {
          s.romp -= s.brand * dt * 1.4;
          s.brand = Math.max(0, s.brand - dt * 0.12);
          if (Math.random() < dt * 8) {
            deeltjes.push({
              x: s.x + (Math.random() - 0.5) * 20, y: s.y + (Math.random() - 0.5) * 12,
              t: 0, duur: 1.1, r: 5, kleur: '#4a4a4a', vx: 0, vy: -18,
            });
          }
        }
      }

      // Camera houdt beide schepen in beeld.
      const mx = (mij.x + vijand.x) / 2,
        my = (mij.y + vijand.y) / 2;
      cam.x = lerp(cam.x, mx, clamp(dt * 2.2, 0, 1));
      cam.y = lerp(cam.y, my, clamp(dt * 2.2, 0, 1));
      const spreiding = dist(mij.x, mij.y, vijand.x, vijand.y);
      const gewenst = clamp(Math.min(Game.breedte, Game.hoogte * 1.5) / (spreiding + 420), 0.42, 1.05);
      cam.zoom = lerp(cam.zoom, gewenst, clamp(dt * 1.5, 0, 1));

      // Vijandelijke moraal: minder bemanning en een lekke romp breken de wil.
      const rompDeel = vijand.romp / vijand.maxRomp;
      const volkDeel = vijand.bemanning / Math.max(1, vijand.startBemanning);
      vijandMoraal = clamp(rompDeel * 60 + volkDeel * 40, 0, 100);

      controleerEinde();
    },

    teken(c) {
      const vw = Game.breedte,
        vh = Game.hoogte;
      R.tekenZee(c, cam, vw, vh, Game.tijd);

      c.save();
      c.translate(vw / 2, vh / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-cam.x, -cam.y);

      // Rand van het strijdtoneel.
      c.strokeStyle = 'rgba(217,164,65,0.16)';
      c.lineWidth = 3 / cam.zoom;
      c.setLineDash([18, 14]);
      c.strokeRect(-ARENA_X, -ARENA_Y, ARENA_X * 2, ARENA_Y * 2);
      c.setLineDash([]);

      for (const p of deeltjes) R.tekenRook(c, p);

      for (const s of [vijand, mij]) tekenStrijder(c, s, wereld.windRichting);

      // Kogels.
      c.fillStyle = '#1a1a1a';
      for (const k of kogels) {
        const p = k.t / k.vlucht;
        const hoogte = Math.sin(p * Math.PI) * 10;
        c.beginPath();
        c.arc(k.x, k.y - hoogte, 2.4, 0, TAU);
        c.fill();
      }
      c.restore();

      tekenGevechtHud(c);
    },
  };

  // --- Besturing ----------------------------------------------------------

  function stuurSpeler(dt) {
    const t = SCHIP_INDEX[mij.type];
    const wend = t.wend * (0.5 + 0.5 * mij.zeilstand) * mij.tuigage;
    if (Game.toets('ArrowLeft') || Game.toets('KeyA')) mij.koers = normAngle(mij.koers - wend * dt);
    if (Game.toets('ArrowRight') || Game.toets('KeyD')) mij.koers = normAngle(mij.koers + wend * dt);
    if (Game.toets('ArrowUp') || Game.toets('KeyW')) mij.zeilstand = clamp(mij.zeilstand + dt, 0, 1);
    if (Game.toets('ArrowDown')) mij.zeilstand = clamp(mij.zeilstand - dt, 0, 1);
  }

  function stuurVijand(dt) {
    const t = SCHIP_INDEX[vijand.type];
    const wend = t.wend * (0.5 + 0.5 * vijand.zeilstand) * vijand.tuigage * 0.9;
    const naarMij = Math.atan2(mij.y - vijand.y, mij.x - vijand.x);
    const afstand = dist(mij.x, mij.y, vijand.x, vijand.y);

    let doelKoers;
    if (vijandMoraal < 30 && vijand.bemanning < mij.bemanning * 0.7) {
      // Vluchten: pal voor de wind weg van de speler.
      doelKoers = naarMij + Math.PI;
      vijand.zeilstand = 1;
    } else if (afstand > 300) {
      doelKoers = naarMij;
      vijand.zeilstand = 1;
    } else {
      // Breedzij zoeken: dwars op de speler gaan liggen.
      const kant = normAngle(naarMij - vijand.koers) > 0 ? -1 : 1;
      doelKoers = naarMij + (kant * Math.PI) / 2;
      vijand.zeilstand = afstand < 150 ? 0.55 : 0.85;
    }
    vijand.koers = turnToward(vijand.koers, doelKoers, wend * dt);

    // Vuren zodra de speler in het schootsveld ligt.
    if (vijand.herlaad <= 0 && afstand < schootsafstand(vijand)) {
      const peiling = Math.abs(normAngle(Math.atan2(mij.y - vijand.y, mij.x - vijand.x) - vijand.koers));
      const dwars = Math.abs(peiling - Math.PI / 2);
      if (dwars < 0.65) {
        vijand.munitie = mij.bemanning > vijand.bemanning * 1.4 ? 2 : afstand > 260 ? 1 : 0;
        vuur(vijand, mij);
      }
    }
  }

  function beweeg(s, dt) {
    const t = SCHIP_INDEX[s.type];
    const eff = zeilEfficiëntie(s.koers, wereld.windRichting, t.hoogte);
    const romp = lerp(0.5, 1, clamp(s.romp / s.maxRomp, 0, 1));
    const doel = t.snelheid * eff * wereld.windKracht * s.zeilstand * s.tuigage * romp * 1.15;
    s.snelheid = lerp(s.snelheid, doel, clamp(dt * 1.4, 0, 1));
    s.x += Math.cos(s.koers) * s.snelheid * dt;
    s.y += Math.sin(s.koers) * s.snelheid * dt;
  }

  function schootsafstand(s) {
    return 300 + SCHIP_INDEX[s.type].kanonnen * 6;
  }

  // --- Vuren --------------------------------------------------------------

  function vuur(schutter, doel) {
    if (schutter.herlaad > 0) return;
    const afstand = dist(schutter.x, schutter.y, doel.x, doel.y);
    const bereik = schootsafstand(schutter);
    const peiling = normAngle(Math.atan2(doel.y - schutter.y, doel.x - schutter.x) - schutter.koers);
    const dwars = Math.abs(Math.abs(peiling) - Math.PI / 2);

    if (schutter.speler) {
      if (afstand > bereik) {
        Game.melding('Te ver weg — de kogels vallen in zee.', 'rood');
        audio.sfx.fout();
        return;
      }
      if (dwars > 0.8) {
        Game.melding('Geen schootsveld! Draai je breedzij naar ze toe.', 'rood');
        audio.sfx.fout();
        return;
      }
    }

    const soort = MUNITIE[schutter.speler ? munitie : schutter.munitie || 0];
    // Een breedzij schiet hooguit een redelijk aantal kogels — anders zou een
    // groot schip de speler in één salvo naar de kelder jagen.
    const stukken = Math.min(Math.max(1, Math.round(schutter.kanonnen / 2)), 8);
    const kanonnierBonus = schutter.speler ? 0.12 * talentBonus(speler, 'kanonnier') : 0;
    let herlaadTijd = (3.4 - (schutter.speler ? 0.6 * talentBonus(speler, 'kanonnier') : 0)) *
      clamp(1.4 - schutter.bemanning / Math.max(1, schutter.startBemanning), 0.85, 1.5);
    // Moeilijkheid: vijandelijke kanonniers laden sneller op hogere standen.
    if (!schutter.speler) herlaadTijd *= clamp(1.55 - vijandKracht * 0.42, 0.95, 1.6);
    schutter.herlaad = herlaadTijd;

    const kant = peiling > 0 ? 1 : -1;
    audio.sfx.kanon();

    for (let i = 0; i < stukken; i++) {
      const spreid = (i / Math.max(1, stukken - 1) - 0.5) * 1.4;
      const bron = {
        x: schutter.x + Math.cos(schutter.koers) * spreid * 16 + Math.cos(schutter.koers + (kant * Math.PI) / 2) * 8,
        y: schutter.y + Math.sin(schutter.koers) * spreid * 16 + Math.sin(schutter.koers + (kant * Math.PI) / 2) * 8,
      };
      deeltjes.push({
        x: bron.x, y: bron.y, t: 0, duur: 0.9, r: 6, kleur: '#dcd8cf',
        vx: Math.cos(schutter.koers + (kant * Math.PI) / 2) * 40,
        vy: Math.sin(schutter.koers + (kant * Math.PI) / 2) * 40,
      });

      const nauwkeurig = clamp(
        0.72 - (afstand / bereik) * 0.42 - dwars * 0.25 + kanonnierBonus +
          (schutter.bemanning / Math.max(1, schutter.startBemanning)) * 0.12,
        0.06,
        0.95
      );
      const raak = Math.random() < nauwkeurig;
      const mik = {
        x: doel.x + (raak ? 0 : (Math.random() - 0.5) * 90),
        y: doel.y + (raak ? 0 : (Math.random() - 0.5) * 90),
      };
      const vlucht = clamp(afstand / 620, 0.18, 1.2);
      kogels.push({
        x: bron.x,
        y: bron.y,
        vx: (mik.x - bron.x) / vlucht,
        vy: (mik.y - bron.y) / vlucht,
        t: 0,
        vlucht,
        raak,
        doel,
        soort,
        kracht: 1,
        schutterKanonnen: schutter.kanonnen,
        vijandelijk: !schutter.speler,
      });
    }
  }

  function treffer(s, k) {
    const zwaar = 1 + Math.random() * 0.8;
    // Kaliber van de schutter = wat zwaarder treft dan een klein kanon.
    const kaliber = 0.9 + (k.schutterKanonnen || 0) * 0.012;
    // Moeilijkheidsschaling op vijandelijk vuur (niet op dat van de speler).
    const kracht = k.vijandelijk ? 0.7 + 0.3 * vijandKracht : 1;
    if (k.soort.doel === 'romp') {
      s.romp -= (0.55 + kaliber * 0.35) * zwaar * kracht;
      if (Math.random() < 0.05) s.brand += 0.4;
    } else if (k.soort.doel === 'zeilen') {
      s.tuigage = clamp(s.tuigage - 0.035 * zwaar, 0.15, 1);
    } else {
      const dood = Math.max(1, Math.round(1.1 * zwaar * kracht));
      s.bemanning = Math.max(0, s.bemanning - dood);
    }
    if (s.speler) Game.melding(`Treffer! ${k.soort.naam.toLowerCase()} in de ${k.soort.doel}.`, 'rood');
  }

  function spatDeeltjes(x, y, kleur, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      deeltjes.push({
        x, y, t: 0, duur: 0.5 + Math.random() * 0.4, r: 2.5, kleur,
        vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
      });
    }
  }

  // --- Enteren en vluchten ------------------------------------------------

  async function probeerEnteren() {
    const afstand = dist(mij.x, mij.y, vijand.x, vijand.y);
    if (afstand > 95) {
      Game.melding('Te ver om te enteren — vaar langszij!', 'rood');
      audio.sfx.fout();
      return;
    }
    afgelopen = true;
    const ja = await UI.vraag(
      'Enteren!',
      `De dreggen liggen klaar. Jouw ${mij.bemanning} man tegen hun ${vijand.bemanning}. ` +
        'Wie het eerst het dek van de kapitein bereikt, wint de dag.',
      [
        { label: 'Aan boord!', waarde: true, soort: 'gevaar' },
        { label: 'Nog even wachten', waarde: false },
      ],
      { figuur: 'zeeman' }
    );
    if (!ja) {
      afgelopen = false;
      return;
    }
    startDuel();
  }

  function startDuel() {
    const overmacht = clamp(mij.bemanning / Math.max(1, vijand.bemanning), 0.4, 2.5);
    Game.zetScene(
      maakDuel({
        tegenstander: vloot.naam,
        natie: vloot.natie,
        vaardigheid: clamp(0.45 + (SCHIP_INDEX[vloot.type].kanonnen / 60) - (overmacht - 1) * 0.18, 0.15, 0.95),
        voordeel: overmacht,
        achtergrond: 'dek',
        terug(gewonnen) {
          Game.zetScene(scene);
          afgelopen = true;
          if (gewonnen) beloonOverwinning('enteren');
          else nederlaag('Je bent teruggeslagen en zwaargewond aan boord gesleept.');
        },
      })
    );
  }

  async function probeerVluchten() {
    const mijnType = SCHIP_INDEX[mij.type];
    const hunType = SCHIP_INDEX[vijand.type];
    // Positioneel: hoe verder je al weg bent en hoe sneller je schip, hoe beter.
    const afstand = dist(mij.x, mij.y, vijand.x, vijand.y);
    const snelheidV = mijnType.snelheid * mij.tuigage;
    const snelheidVijand = hunType.snelheid * vijand.tuigage;
    const kans = clamp(
      0.3 + (afstand / 500) * 0.35 + (snelheidV - snelheidVijand) / 90,
      0.12,
      0.95
    );
    afgelopen = true;
    const ja = await UI.vraag(
      'Het gevecht opgeven?',
      `Je stuurman schat de kans om weg te komen op ongeveer ${Math.round(kans * 100)}%.` +
        (mij.bemanning < mij.startBemanning * 0.4 || mij.romp < mij.maxRomp * 0.3
          ? ' (Je schip is er slecht aan toe — strijken is veiliger.)'
          : ''),
      [
        { label: 'Alle zeilen bij!', waarde: 'weg' },
        { label: 'Doorvechten', waarde: false, soort: 'gevaar' },
        ...(mij.bemanning < mij.startBemanning * 0.45 || mij.romp < mij.maxRomp * 0.35
          ? [{ label: 'De vlag strijken', waarde: 'strijk', soort: 'gevaar' }]
          : []),
      ]
    );
    if (!ja) {
      afgelopen = false;
      return;
    }
    if (ja === 'strijk') {
      // Proactieve overgave: zachter dan een nederlaag, maar je verliest je lading en wat roem.
      afgelopen = true;
      await UI.vraag(
        'Je strijkt de vlag',
        'Je geeft je over. De vijand neemt je lading en laat je met je schip gaan.',
        [{ label: 'De dag overleefd', waarde: 'ok' }],
        { figuur: 'zeeman' }
      );
      speler.moraal = clamp(speler.moraal - 12, 0, 100);
      speler.roem = Math.max(0, speler.roem - 4);
      for (const n of Object.keys(speler.relatie)) {
        if (n === vloot.natie && vloot.natie !== 'piraat') {
          speler.relatie[n] = clamp(speler.relatie[n] - 6, -100, 100);
        }
      }
      beëindig({ verloren: true, overgegeven: true });
      return;
    }
    if (Math.random() < kans) {
      speler.moraal = clamp(speler.moraal - 6, 0, 100);
      Game.melding('Je bent ze kwijtgeraakt in de schemering.');
      beëindig({ ontsnapt: true });
    } else {
      Game.melding('Ze zitten je op de hielen!', 'rood');
      vijand.x = mij.x + Math.cos(mij.koers + Math.PI) * 140;
      vijand.y = mij.y + Math.sin(mij.koers + Math.PI) * 140;
      afgelopen = false;
    }
  }

  // --- Afloop -------------------------------------------------------------

  function controleerEinde() {
    if (afgelopen) return;
    // Je schip is verloren als de romp óf de bemanning op is — maar
    // voordat de romp nul bereikt krijg je de kans om je over te geven,
    // precies zoals de kapiteins in het origineel doen.
    if (mij.bemanning <= 0) {
      afgelopen = true;
      audio.sfx.ramp();
      nederlaag('Je bemanning is gedund tot de laatste man.');
      return;
    }
    if (mij.romp <= 0) {
      afgelopen = true;
      audio.sfx.ramp();
      nederlaag('Je schip zinkt onder je voeten weg.');
      return;
    }
    // Vijand zinkt pas echt als de romp nul is; eerder geeft hij zich over.
    if (vijand.romp <= 0) {
      afgelopen = true;
      audio.sfx.ramp();
      gezonken();
      return;
    }
    // Overgave: wil gebroken én bemanning gedund, ruim vóór de romp op is.
    const afstand = dist(mij.x, mij.y, vijand.x, vijand.y);
    if (vijand.bemanning <= 0 ||
        (vijandMoraal < (vijandKracht > 1.4 ? 16 : 22) && afstand < 340)) {
      afgelopen = true;
      strijkVlag();
      return;
    }
    // Buiten het strijdtoneel varen betekent ontkomen.
    if (Math.abs(mij.x) > ARENA_X || Math.abs(mij.y) > ARENA_Y) {
      afgelopen = true;
      Game.melding('Je bent uit het zicht verdwenen.');
      beëindig({ ontsnapt: true });
    }
    if (Math.abs(vijand.x) > ARENA_X || Math.abs(vijand.y) > ARENA_Y) {
      afgelopen = true;
      Game.melding('De vijand is ontkomen.');
      beëindig({ ontsnapt: true });
    }
  }

  async function gezonken() {
    slaSchadeOp();
    speler.verslagenSchepen++;
    speler.roem += 8;
    await UI.vraag(
      'Naar de kelder',
      `${hoofdletter(scheepsAanduiding(vloot.natie, vloot.type))} verdwijnt onder de golven. ` +
          'Van de lading is niets meer te redden, maar je naam gaat rond in elke haven.',
      [{ label: 'Verder', waarde: 'ok' }]
    );
    verslechterRelatie();
    beëindig({ vijandWeg: true, gewonnen: true });
  }

  async function strijkVlag() {
    audio.sfx.fanfare();
    await UI.vraag(
      'Ze strijken de vlag!',
      'De vijand geeft zich over. Het schip is van jou — als je het wilt hebben.',
      [{ label: 'Aan boord gaan', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
    beloonOverwinning('overgave');
  }

  async function beloonOverwinning(hoe) {
    slaSchadeOp();
    speler.verslagenSchepen++;
    speler.roem += hoe === 'enteren' ? 14 : 10;
    speler.moraal = clamp(speler.moraal + 10, 0, 100);

    const buitGoud = Math.round(vloot.goud * (hoe === 'enteren' ? 1 : 0.8));
    speler.goud += buitGoud;

    const eigenSchip = vlaggenschip(speler);
    const type = SCHIP_INDEX[eigenSchip.type];
    let ruimte = type.ruim - eigenSchip.lading.reduce((a, b) => a + b, 0) - eigenSchip.kanonnen * 2;
    let genomen = 0;
    for (let i = 0; i < WAREN.length && ruimte > 0; i++) {
      const n = Math.min(vloot.lading[i], ruimte);
      eigenSchip.lading[i] += n;
      ruimte -= n;
      genomen += n;
    }
    audio.sfx.munt();

    const vijandType = SCHIP_INDEX[vloot.type];
    const kanNemen = vijand.romp > vijandType.romp * 0.25;
    const keuzes = [{ label: 'Alleen de buit, laat het wrak', waarde: 'laat' }];
    if (kanNemen) {
      keuzes.unshift({ label: `Het schip inlijven (${vijandType.naam})`, waarde: 'neem' });
      keuzes.push({ label: 'Het schip tot zinken brengen', waarde: 'zink', soort: 'gevaar' });
    }

    const keuze = await UI.vraag(
      'Buit',
      `Je vindt <b>${fmtGold(buitGoud)} goudstukken</b> en ${genomen} eenheden lading. ` +
        `${metLidwoord(vloot.type, true)} is ${Math.round((vijand.romp / vijandType.romp) * 100)}% zeewaardig.`,
      keuzes,
      { figuur: 'zeeman' }
    );

    if (keuze === 'neem') {
      if (speler.schepen.length >= 8) {
        Game.melding('Je vloot is vol — het schip wordt losgelaten.', 'rood');
      } else {
        speler.schepen.push(
          nieuwSchip(vloot.type, {
            romp: Math.max(10, Math.round(vijand.romp)),
            kanonnen: vijand.kanonnen,
          })
        );
        Game.melding(`${metLidwoord(vloot.type, true)} vaart nu onder jouw vlag.`);
      }
    } else if (keuze === 'zink') {
      speler.roem += 3;
    }

    // Overlevenden kunnen zich aansluiten.
    if (hoe === 'enteren' && vijand.bemanning > 3) {
      const bij = Math.round(vijand.bemanning * 0.35);
      speler.bemanning += bij;
      Game.melding(`${bij} overlevenden tekenen bij de bemanning.`);
    }

    verslechterRelatie();
    beëindig({ vijandWeg: true, gewonnen: true });
  }

  function verslechterRelatie() {
    if (vloot.natie === 'piraat') {
      // Piraten opruimen valt overal goed.
      for (const n of Object.keys(speler.relatie)) {
        speler.relatie[n] = clamp(speler.relatie[n] + 2, -100, 100);
      }
      return;
    }
    speler.relatie[vloot.natie] = clamp(speler.relatie[vloot.natie] - 12, -100, 100);
    // Vijanden van je slachtoffer waarderen het.
    for (const n of Object.keys(speler.relatie)) {
      if (n !== vloot.natie) speler.relatie[n] = clamp(speler.relatie[n] + 3, -100, 100);
    }
  }

  async function nederlaag(tekst) {
    slaSchadeOp();
    // Zachtere nederlaag dan voorheen: je houdt je vlaggenschip (als wrak),
    // en je verliest een deel van goud en bemanning — maar lang niet alles.
    const verloren = Math.round(speler.goud * 0.45);
    speler.goud -= verloren;
    speler.bemanning = Math.max(8, Math.round(speler.bemanning * (mij.bemanning > 0 ? mij.bemanning / mij.startBemanning : 0.4)));
    speler.moraal = clamp(speler.moraal - 18, 0, 100);
    const eigen = vlaggenschip(speler);
    eigen.romp = Math.max(10, Math.round(eigen.maxRomp * 0.45));
    // Bijschepen gaan verloren.
    speler.schepen.length = 1;

    await UI.vraag(
      'Verslagen',
      `${tekst} Je wordt met een handjevol getrouwen aan land gezet. ` +
        `<b>${fmtGold(verloren)} goudstukken</b> zijn verloren.`,
      [{ label: 'Het is nog niet voorbij', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
    beëindig({ verloren: true });
  }

  function slaSchadeOp() {
    const eigen = vlaggenschip(speler);
    eigen.romp = clamp(mij.romp, 1, eigen.maxRomp);
    speler.bemanning = Math.max(1, Math.round(mij.bemanning));
  }

  function beëindig(uitslag) {
    // Bij vrijwillige overgave blijf je met je schip (en je bemanning) zitten;
    // alleen bij een echte nederlaag of een gewonnen gevecht wordt de schade
    // opgeslagen. Ontsnappen zonder schade = ook geen wijzigingen.
    if (uitslag.overgegeven) {
      const eigen = vlaggenschip(speler);
      eigen.romp = clamp(mij.romp, 8, eigen.maxRomp);
    } else if (!uitslag.verloren && !uitslag.gewonnen && !uitslag.ontsnapt) {
      slaSchadeOp();
    }
    opts.terug(uitslag);
  }

  // --- Tekenen ------------------------------------------------------------

  function tekenStrijder(c, s, wind) {
    R.tekenSchip(c, s.x, s.y, s.koers, s.type, s.natie, wind, {
      vaart: s.snelheid / 90,
      tijd: Game.tijd,
      zeilen: s.zeilstand * s.tuigage,
      schaal: 2,
    });
    // Statusbalkje boven het schip.
    const [L] = R.scheepMaat(s.type);
    const bx = s.x - 34,
      by = s.y - L * 1.5 * 0.5 - 26;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(c, bx, by, 68, 6, 2);
    c.fill();
    const f = clamp(s.romp / s.maxRomp, 0, 1);
    c.fillStyle = s.speler ? '#7bb36a' : '#c65b45';
    roundRect(c, bx, by, 68 * f, 6, 2);
    c.fill();
    c.font = '600 10px Georgia, serif';
    c.fillStyle = 'rgba(240,230,205,0.9)';
    c.textAlign = 'center';
    c.fillText(`${s.bemanning}`, s.x, by - 4);
    c.restore();
  }

  function tekenGevechtHud(c) {
    const vw = Game.breedte,
      vh = Game.hoogte;
    c.save();

    // Munitiekeuze.
    const bw = 132,
      bh = 34;
    let x = 16,
      y = vh - 16 - bh;
    for (let i = MUNITIE.length - 1; i >= 0; i--) {
      const m = MUNITIE[i];
      const gekozen = i === munitie;
      const px = x,
        py = y - (MUNITIE.length - 1 - i) * (bh + 6);
      c.fillStyle = gekozen ? 'rgba(217,164,65,0.92)' : 'rgba(10,28,44,0.8)';
      roundRect(c, px, py, bw, bh, 6);
      c.fill();
      c.strokeStyle = gekozen ? '#f5e2b0' : 'rgba(217,164,65,0.4)';
      c.lineWidth = 1.3;
      c.stroke();
      c.font = '600 12px Georgia, serif';
      c.fillStyle = gekozen ? '#22160a' : '#e6d9b8';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(`${i + 1}  ${m.naam}`, px + 10, py + bh / 2);
    }

    // Herlaadbalk.
    const hw = 200;
    c.fillStyle = 'rgba(10,28,44,0.8)';
    roundRect(c, vw / 2 - hw / 2, vh - 52, hw, 22, 6);
    c.fill();
    const klaar = mij.herlaad <= 0;
    const f = klaar ? 1 : 1 - mij.herlaad / 3.4;
    c.fillStyle = klaar ? '#7bb36a' : '#8a6a3a';
    roundRect(c, vw / 2 - hw / 2 + 2, vh - 50, (hw - 4) * clamp(f, 0, 1), 18, 5);
    c.fill();
    c.font = '600 12px Georgia, serif';
    c.fillStyle = klaar ? '#0d1f30' : '#e6d9b8';
    c.textAlign = 'center';
    c.fillText(klaar ? 'VUUR! (spatie)' : 'herladen…', vw / 2, vh - 41);

    // Eigen toestand.
    c.fillStyle = 'rgba(10,28,44,0.82)';
    roundRect(c, 16, 16, 236, 84, 8);
    c.fill();
    c.strokeStyle = 'rgba(217,164,65,0.4)';
    c.lineWidth = 1.2;
    c.stroke();
    c.textAlign = 'left';
    c.font = '600 13px Georgia, serif';
    c.fillStyle = '#f0e3c4';
    c.fillText(SCHIP_INDEX[mij.type].naam, 28, 34);
    balkje(c, 28, 44, 212, 12, mij.romp / mij.maxRomp, '#7bb36a', 'romp');
    balkje(c, 28, 62, 212, 12, mij.tuigage, '#cfc3a6', 'tuig');
    balkje(c, 28, 80, 212, 12, mij.bemanning / mij.startBemanning, '#d98a41', 'volk');

    // Vijandtoestand.
    c.fillStyle = 'rgba(10,28,44,0.82)';
    roundRect(c, vw - 252, 16, 236, 84, 8);
    c.fill();
    c.strokeStyle = 'rgba(198,91,69,0.5)';
    c.stroke();
    c.fillStyle = '#f0e3c4';
    c.fillText(scheepsAanduiding(vijand.natie, vijand.type), vw - 240, 34);
    balkje(c, vw - 240, 44, 212, 12, vijand.romp / vijand.maxRomp, '#c65b45', 'romp');
    balkje(c, vw - 240, 62, 212, 12, vijand.tuigage, '#cfc3a6', 'tuig');
    balkje(c, vw - 240, 80, 212, 12, vijandMoraal / 100, '#d98a41', 'moed');

    R.tekenWindroos(c, vw - 62, 132, 38, wereld.windRichting, wereld.windKracht, Game.tijd);

    const afstand = Math.round(dist(mij.x, mij.y, vijand.x, vijand.y));
    c.textAlign = 'center';
    c.font = '11px Georgia, serif';
    c.fillStyle = 'rgba(220,208,180,0.6)';
    c.fillText(
      `afstand ${afstand}m · B = enteren (< 95m) · 1-3 munitie · Esc = vluchten`,
      vw / 2,
      vh - 66
    );
    c.restore();
  }

  // Balkje met het label ervoor, zodat de tekst nooit over de vulling valt.
  function balkje(c, x, y, w, h, f, kleur, label) {
    const lb = 34;
    c.font = '600 10px Georgia, serif';
    c.fillStyle = 'rgba(226,214,184,0.8)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + h / 2);
    c.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(c, x + lb, y, w - lb, h, 3);
    c.fill();
    c.fillStyle = kleur;
    roundRect(c, x + lb, y, (w - lb) * clamp(f, 0, 1), h, 3);
    c.fill();
  }

  return scene;
}

/** Eerste letter van een zin een hoofdletter geven. */
function hoofdletter(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function maakStrijder(o) {
  return {
    type: o.type,
    natie: o.natie,
    romp: o.romp,
    maxRomp: o.maxRomp,
    kanonnen: o.kanonnen,
    startKanonnen: Math.max(1, o.kanonnen),
    bemanning: o.bemanning,
    startBemanning: Math.max(1, o.bemanning),
    x: o.x,
    y: o.y,
    koers: o.koers,
    snelheid: 30,
    zeilstand: 0.8,
    tuigage: 1,
    herlaad: 1.2,
    brand: 0,
    speler: !!o.speler,
    munitie: 0,
  };
}
