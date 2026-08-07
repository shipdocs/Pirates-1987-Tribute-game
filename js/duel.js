// Degengevecht: hoog, midden of laag — pareren en meteen terugstoten.
import { clamp, lerp, TAU } from './util.js';
import { NATIES } from './data.js';
import { Game, roundRect, talentBonus } from './game.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

const HOOG = 0,
  MIDDEN = 1,
  LAAG = 2;
const HOOGTES = ['hoog', 'midden', 'laag'];
const TOETS_HOOGTE = {
  ArrowUp: HOOG, KeyW: HOOG,
  ArrowRight: MIDDEN, Space: MIDDEN, KeyD: MIDDEN,
  ArrowDown: LAAG, KeyS: LAAG,
};

/**
 * opts: {tegenstander, natie, vaardigheid 0..1, voordeel, achtergrond, terug(gewonnen)}
 */
export function maakDuel(opts) {
  const speler = Game.speler;
  const schermer = talentBonus(speler, 'schermen');

  const vaardigheid = clamp(opts.vaardigheid, 0.1, 0.95);
  const windupTijd = lerp(0.8, 0.38, vaardigheid) + schermer * 0.12;
  const pareerKans = clamp(lerp(0.22, 0.72, vaardigheid) - schermer * 0.12, 0.05, 0.85);
  const aanvalPauze = lerp(1.7, 0.8, vaardigheid);

  let positie = 0; // -1 = speler in het nauw, +1 = tegenstander in het nauw
  let fase = 'start';
  let faseT = 0;
  let vijandHoogte = MIDDEN;
  let spelerHoogte = MIDDEN;
  let volgendeAanval = 1.2;
  let uithoudingSpeler = 1;
  let bericht = 'Verdedig je!';
  let berichtT = 0;
  let klaar = false;
  let schud = 0;
  let vonken = [];
  let tijd = 0;

  // Bemanningsvoordeel duwt langzaam in jouw voordeel.
  const drift = clamp((opts.voordeel || 1) - 1, -0.5, 0.7) * 0.028;

  // Beeldopbouw: de schermers staan groot in beeld, vlak boven de onderrand.
  const schaalNu = () => clamp(Math.min(Game.breedte / 1000, Game.hoogte / 640), 0.75, 1.9) * 2;
  const grondNu = () => Game.hoogte * 0.79;
  const middenNu = () => Game.breedte / 2 + positie * Game.breedte * 0.2;
  /** Punt waar de klingen elkaar raken — daar spatten de vonken. */
  const botsPunt = () => ({ x: middenNu(), y: grondNu() - 62 * schaalNu() });

  function zeg(t, kleur) {
    bericht = t;
    berichtT = 0;
    bericht_kleur = kleur || '#f0e3c4';
  }
  let bericht_kleur = '#f0e3c4';

  function vonk(x, y, kleur) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      vonken.push({
        x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 40,
        t: 0, duur: 0.35 + Math.random() * 0.3, kleur,
      });
    }
  }

  function duw(hoeveel, opWie) {
    // opWie: 'vijand' = de tegenstander wijkt (positief), 'speler' = jij wijkt.
    const d = hoeveel * (opWie === 'vijand' ? 1 : -1);
    positie = clamp(positie + d, -1.05, 1.05);
    schud = 0.25;
  }

  const scene = {
    naam: 'duel',

    betreed() {
      audio.stopMuziek();
    },

    verlaat() {
      audio.startMuziek();
    },

    toets(code) {
      if (klaar || UI.ietsOpen()) return;
      const h = TOETS_HOOGTE[code];
      if (h === undefined) return;

      if (fase === 'vijandWindup') {
        // Pareren: de juiste hoogte kiezen.
        if (h === vijandHoogte) {
          audio.sfx.pareer();
          zeg('Gepareerd! Steek nu toe!', '#9fe0a0');
          fase = 'riposte';
          faseT = 0;
          spelerHoogte = h;
          const bp = botsPunt();
          vonk(bp.x, bp.y, '#ffe9a8');
        } else {
          audio.sfx.raak();
          zeg('Mis gepareerd!', '#e8998a');
          spelerHoogte = h;
          raakSpeler();
        }
        return;
      }

      if (fase === 'riposte') {
        // Vrije treffer.
        audio.sfx.kling();
        spelerHoogte = h;
        raakVijand(0.2 + schermer * 0.05);
        zeg('Rake stoot!', '#9fe0a0');
        fase = 'herstelVijand';
        faseT = 0;
        return;
      }

      if (fase === 'rust') {
        if (uithoudingSpeler < 0.22) {
          zeg('Je bent buiten adem…', '#e8c07a');
          audio.sfx.fout();
          return;
        }
        spelerHoogte = h;
        uithoudingSpeler = clamp(uithoudingSpeler - 0.26, 0, 1);
        fase = 'spelerSlag';
        faseT = 0;
      }
    },

    werkBij(dt) {
      if (UI.ietsOpen()) return;
      tijd += dt;
      faseT += dt;
      berichtT += dt;
      schud = Math.max(0, schud - dt);
      uithoudingSpeler = clamp(uithoudingSpeler + dt * 0.3, 0, 1);
      positie = clamp(positie + drift * dt, -1.05, 1.05);

      for (let i = vonken.length - 1; i >= 0; i--) {
        const v = vonken[i];
        v.t += dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        v.vy += 420 * dt;
        if (v.t > v.duur) vonken.splice(i, 1);
      }

      if (klaar) return;

      switch (fase) {
        case 'start':
          if (faseT > 1.1) {
            fase = 'rust';
            faseT = 0;
          }
          break;

        case 'rust':
          volgendeAanval -= dt;
          if (volgendeAanval <= 0) {
            vijandHoogte = Math.floor(Math.random() * 3);
            fase = 'vijandWindup';
            faseT = 0;
            audio.sfx.kling();
            zeg(`Hij haalt uit — ${HOOGTES[vijandHoogte]}!`, '#e8c07a');
          }
          break;

        case 'vijandWindup':
          if (faseT >= windupTijd) {
            // Niet gepareerd.
            audio.sfx.raak();
            zeg('Je bent geraakt!', '#e8998a');
            raakSpeler();
          }
          break;

        case 'riposte':
          if (faseT > 0.75) {
            zeg('Te traag — hij herstelt zich.', '#e8c07a');
            fase = 'rust';
            faseT = 0;
            volgendeAanval = aanvalPauze * 0.6;
          }
          break;

        case 'spelerSlag':
          if (faseT > 0.28) {
            if (Math.random() < pareerKans) {
              audio.sfx.pareer();
              const bp2 = botsPunt();
              vonk(bp2.x + 20, bp2.y, '#cfe4ff');
              zeg('Hij pareert en zet door!', '#e8998a');
              fase = 'vijandWindup';
              faseT = 0;
              vijandHoogte = Math.floor(Math.random() * 3);
            } else {
              audio.sfx.kling();
              raakVijand(0.15 + schermer * 0.04);
              zeg('Raak!', '#9fe0a0');
              fase = 'herstelVijand';
              faseT = 0;
            }
          }
          break;

        case 'herstelVijand':
          if (faseT > 0.55) {
            fase = 'rust';
            faseT = 0;
            volgendeAanval = aanvalPauze * (0.7 + Math.random() * 0.6);
          }
          break;

        case 'herstelSpeler':
          if (faseT > 0.6) {
            fase = 'rust';
            faseT = 0;
            volgendeAanval = aanvalPauze * (0.8 + Math.random() * 0.6);
          }
          break;
      }

      if (positie >= 1 && !klaar) einde(true);
      else if (positie <= -1 && !klaar) einde(false);
    },

    teken(c) {
      const vw = Game.breedte,
        vh = Game.hoogte;
      c.save();
      if (schud > 0) c.translate((Math.random() - 0.5) * schud * 14, (Math.random() - 0.5) * schud * 10);

      tekenAchtergrond(c, vw, vh, tijd);

      const S = schaalNu();
      const midden = middenNu();
      const grond = grondNu();
      const spelerX = midden - 72 * S;
      const vijandX = midden + 72 * S;

      // Schaduwen.
      c.fillStyle = 'rgba(0,0,0,0.3)';
      for (const x of [spelerX, vijandX]) {
        c.beginPath();
        c.ellipse(x, grond + 3 * S, 30 * S, 7 * S, 0, 0, TAU);
        c.fill();
      }

      const spelerLunge = fase === 'spelerSlag' || fase === 'riposte' ? 1 : 0;
      const vijandLunge = fase === 'vijandWindup' ? clamp(faseT / windupTijd, 0, 1) : 0;

      tekenSchermer(c, spelerX, grond, 1, S, {
        hoogte: spelerHoogte,
        lunge: spelerLunge * (fase === 'riposte' ? clamp(1 - faseT / 0.75, 0, 1) : clamp(faseT / 0.28, 0, 1)),
        kleding: '#8a3b3b',
        hoed: '#2b2b31',
        naam: speler.naam,
        tijd,
      });
      tekenSchermer(c, vijandX, grond, -1, S, {
        hoogte: vijandHoogte,
        lunge: vijandLunge,
        kleding: NATIES[opts.natie]?.kleur || '#3f5a8a',
        hoed: '#1f1f26',
        naam: opts.tegenstander,
        waarschuwing: fase === 'vijandWindup',
        tijd,
      });

      for (const v of vonken) {
        const a = clamp(1 - v.t / v.duur, 0, 1);
        c.globalAlpha = a;
        c.fillStyle = v.kleur;
        c.fillRect(v.x, v.y, 2.6, 2.6);
      }
      c.globalAlpha = 1;
      c.restore();

      tekenDuelHud(c, vw, vh);
    },
  };

  function raakSpeler() {
    duw(0.16, 'speler');
    Game.speler.moraal = clamp(Game.speler.moraal - 0.4, 0, 100);
    fase = 'herstelSpeler';
    faseT = 0;
    const bp = botsPunt();
    vonk(bp.x - 30, bp.y + 10, '#d05a4a');
  }

  function raakVijand(kracht) {
    duw(kracht, 'vijand');
    const bp = botsPunt();
    vonk(bp.x + 30, bp.y + 10, '#ffd27a');
  }

  async function einde(gewonnen) {
    klaar = true;
    fase = 'klaar';
    if (gewonnen) audio.sfx.fanfare();
    else audio.sfx.ramp();
    await UI.vraag(
      gewonnen ? 'Overwonnen!' : 'Verslagen',
      gewonnen
        ? `Met een laatste uitval drijf je <b>${opts.tegenstander}</b> over de reling. Zijn mannen laten de wapens vallen.`
        : `<b>${opts.tegenstander}</b> zet je het staal op de keel. Je hebt geen keus dan je over te geven.`,
      [{ label: gewonnen ? 'De buit opeisen' : 'Zuchten en buigen', waarde: 'ok', soort: gewonnen ? null : 'gevaar' }],
      { figuur: 'zeeman' }
    );
    opts.terug(gewonnen);
  }

  // --- Tekenwerk ----------------------------------------------------------

  function tekenAchtergrond(c, vw, vh, t) {
    const horizon = vh * 0.34;
    const dekLijn = vh * 0.46;

    // Lucht.
    const lucht = c.createLinearGradient(0, 0, 0, horizon);
    lucht.addColorStop(0, '#1e3f63');
    lucht.addColorStop(0.55, '#71889a');
    lucht.addColorStop(1, '#d9a06a');
    c.fillStyle = lucht;
    c.fillRect(0, 0, vw, horizon);

    // Zon laag boven de kim.
    c.fillStyle = 'rgba(255,226,168,0.5)';
    c.beginPath();
    c.arc(vw * 0.74, horizon - 26, 34, 0, TAU);
    c.fill();

    // Zee.
    const zee = c.createLinearGradient(0, horizon, 0, dekLijn);
    zee.addColorStop(0, '#215877');
    zee.addColorStop(1, '#123c5a');
    c.fillStyle = zee;
    c.fillRect(0, horizon, vw, dekLijn - horizon);
    c.strokeStyle = 'rgba(255,255,255,0.09)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const y = horizon + 6 + i * ((dekLijn - horizon) / 9);
      c.beginPath();
      for (let x = 0; x <= vw; x += 24) c.lineTo(x, y + Math.sin(x * 0.018 + t * 1.2 + i) * 2.2);
      c.stroke();
    }

    // Touwwerk tegen de lucht.
    c.strokeStyle = 'rgba(30,22,12,0.4)';
    c.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = vw * (0.06 + i * 0.15);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 80, dekLijn);
      c.stroke();
    }

    // Mast met ra en opgegeid zeil, links in beeld.
    const mx = vw * 0.2;
    const raB = vw * 0.28;
    const raY = horizon * 0.4;
    c.fillStyle = '#4b3720';
    c.fillRect(mx - 11, 0, 22, dekLijn + 40);
    c.fillStyle = '#5c4526';
    c.fillRect(mx - 11, 0, 6, dekLijn + 40);
    // Opgegeid zeil in bollen, netjes onder de ra.
    c.fillStyle = '#ded3b8';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const bx = mx - raB / 2 + (raB * (i + 0.5)) / n;
      c.beginPath();
      c.ellipse(bx, raY + 18, raB / n / 1.9, 14, 0, 0, TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(90,74,44,0.3)';
    c.fillRect(mx - raB / 2, raY + 26, raB, 5);
    // Ra erboven.
    c.fillStyle = '#3d2c17';
    c.fillRect(mx - raB / 2 - 10, raY, raB + 20, 9);

    // Reling.
    c.fillStyle = '#4a3520';
    c.fillRect(0, dekLijn - 12, vw, 14);
    c.fillStyle = '#3a2917';
    for (let i = 0; i * 46 < vw; i++) c.fillRect(i * 46, dekLijn - 30, 7, 20);

    // Dek.
    const dek = c.createLinearGradient(0, dekLijn, 0, vh);
    dek.addColorStop(0, '#a8834f');
    dek.addColorStop(0.5, '#8c6c3f');
    dek.addColorStop(1, '#5a4123');
    c.fillStyle = dek;
    c.fillRect(0, dekLijn, vw, vh - dekLijn);
    c.strokeStyle = 'rgba(56,38,18,0.45)';
    c.lineWidth = 2;
    for (let i = 1; i < 16; i++) {
      // Planken lopen iets uiteen richting de kijker.
      const p = i / 16;
      const y = dekLijn + Math.pow(p, 1.6) * (vh - dekLijn);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(vw, y);
      c.stroke();
    }

    // Vechtende bemanning achter de hoofdrolspelers.
    c.fillStyle = 'rgba(26,20,14,0.42)';
    for (let i = 0; i < 8; i++) {
      const x = ((i * 191 + 60) % (vw + 120)) - 60 + Math.sin(t * 1.4 + i) * 7;
      const y = dekLijn + 46 + (i % 3) * 16;
      c.save();
      c.translate(x, y);
      c.scale(0.85, 0.85);
      c.fillRect(-7, -50, 14, 32);
      c.beginPath();
      c.arc(0, -57, 8, 0, TAU);
      c.fill();
      c.fillRect(-7, -19, 6, 19);
      c.fillRect(2, -19, 6, 19);
      c.save();
      c.rotate(Math.sin(t * 4 + i) * 0.7);
      c.fillRect(5, -50, 30, 3);
      c.restore();
      c.restore();
    }

    // Vaten en een luik als rekwisieten.
    c.fillStyle = 'rgba(70,48,24,0.75)';
    c.fillRect(vw * 0.06, vh * 0.62, 44, 52);
    c.fillRect(vw * 0.11, vh * 0.64, 40, 46);
    c.fillStyle = 'rgba(50,34,16,0.7)';
    c.fillRect(vw * 0.84, vh * 0.66, 96, 40);

    // Vignette.
    const vig = c.createRadialGradient(vw / 2, vh * 0.6, vh * 0.24, vw / 2, vh * 0.6, vh * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = vig;
    c.fillRect(0, 0, vw, vh);
  }

  function tekenSchermer(c, x, grond, richting, S, o) {
    const lunge = o.lunge || 0;
    c.save();
    c.translate(x + richting * lunge * 26 * S, grond);
    c.scale(richting * S, S);

    // Benen: iets meer dynamisch bij een uitval.
    const beenVoor = lunge > 0.3 ? -20 - lunge * 22 : -14 - lunge * 10;
    const beenAchter = lunge > 0.3 ? 10 + lunge * 8 : 6 + lunge * 12;
    c.fillStyle = '#3a2c1c';
    c.fillRect(beenVoor, -34, 11, 34);
    c.fillRect(beenAchter, -34, 11, 34);

    // Laarzen.
    c.fillStyle = '#241a10';
    c.fillRect(beenVoor - 4, -8, 17, 9);
    c.fillRect(beenAchter - 2, -8, 18, 9);

    // Romp/jas met vorm.
    c.fillStyle = o.kleding;
    c.beginPath();
    c.moveTo(-15, -34);
    c.quadraticCurveTo(-14, -54, -12, -76);
    c.lineTo(14, -76);
    c.quadraticCurveTo(16, -54, 15, -34);
    c.closePath();
    c.fill();
    // Jas-open/kraag.
    c.fillStyle = '#e8e0cc';
    c.beginPath();
    c.moveTo(-2, -76);
    c.lineTo(2, -76);
    c.lineTo(4, -50);
    c.lineTo(-4, -50);
    c.closePath();
    c.fill();
    // Sjerp.
    c.fillStyle = '#d9a441';
    c.fillRect(-15, -54, 30, 7);
    // Gordel.
    c.fillStyle = '#4a3520';
    c.fillRect(-14, -42, 28, 4);
    // Gesp.
    c.fillStyle = '#d9a441';
    c.fillRect(-3, -43, 6, 6);

    // Hoofd.
    c.fillStyle = '#e0b489';
    c.beginPath();
    c.ellipse(2, -86, 12, 13, 0, 0, TAU);
    c.fill();
    // Neus.
    c.fillStyle = '#c99a70';
    c.beginPath();
    c.moveTo(2, -84);
    c.lineTo(0, -78);
    c.lineTo(5, -78);
    c.closePath();
    c.fill();
    // Ogen.
    c.fillStyle = '#2b1d12';
    c.beginPath();
    c.arc(6, -87, 1.8, 0, TAU);
    c.fill();
    // Snor.
    c.strokeStyle = '#5a3a24';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-1, -80);
    c.quadraticCurveTo(2, -78, 8, -80);
    c.stroke();

    // Hoed (tricorn-achtig).
    c.fillStyle = o.hoed;
    c.beginPath();
    c.ellipse(2, -96, 22, 7, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(-10, -96);
    c.quadraticCurveTo(2, -116, 14, -96);
    c.quadraticCurveTo(2, -106, -10, -96);
    c.fill();
    // Hoedband.
    c.strokeStyle = '#d9a441';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-10, -98);
    c.quadraticCurveTo(2, -104, 14, -98);
    c.stroke();

    // Vrije arm (links) op de rug / zij.
    c.strokeStyle = o.kleding;
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-12, -72);
    c.quadraticCurveTo(-22, -60, -18, -46);
    c.stroke();
    c.fillStyle = '#e0b489';
    c.beginPath();
    c.arc(-18, -44, 3.5, 0, TAU);
    c.fill();

    // Arm en degen op de gekozen hoogte.
    const doelY = o.hoogte === HOOG ? -104 : o.hoogte === MIDDEN ? -64 : -30;
    const schouderX = 12,
      schouderY = -72;
    const handX = 30 + lunge * 24,
      handY = doelY + (o.hoogte === HOOG ? 6 : 0);
    c.strokeStyle = o.kleding;
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(schouderX, schouderY);
    c.lineTo(handX, handY);
    c.stroke();

    // Hand.
    c.fillStyle = '#e0b489';
    c.beginPath();
    c.arc(handX, handY, 4, 0, TAU);
    c.fill();

    // Kling en gevest.
    const hoek = Math.atan2(doelY - handY - 6, 46);
    c.save();
    c.translate(handX, handY);
    c.rotate(hoek + (o.hoogte === HOOG ? -0.55 : o.hoogte === LAAG ? 0.5 : 0));
    // Gevest.
    c.fillStyle = '#3a2a18';
    c.fillRect(-7, -4, 12, 8);
    c.fillStyle = '#d9a441';
    c.fillRect(-2, -6, 6, 12);
    // Kling.
    const kling = c.createLinearGradient(0, 0, 56, 0);
    kling.addColorStop(0, '#e9edf2');
    kling.addColorStop(0.5, '#ffffff');
    kling.addColorStop(1, '#7a8796');
    c.fillStyle = kling;
    c.beginPath();
    c.moveTo(3, -2.4);
    c.lineTo(56, -1);
    c.lineTo(60, 0);
    c.lineTo(56, 1);
    c.lineTo(3, 2.4);
    c.closePath();
    c.fill();
    // Middengroef in kling.
    c.strokeStyle = 'rgba(120,140,160,0.4)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(54, 0);
    c.stroke();
    c.restore();

    c.restore();

    // Naam boven het hoofd.
    c.save();
    c.font = '600 14px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineWidth = 3.5;
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    const ny = grond - 118 * S;
    c.strokeText(o.naam, x, ny);
    c.fillStyle = o.waarschuwing ? '#ffcf6a' : '#f0e3c4';
    c.fillText(o.naam, x, ny);
    c.restore();
  }

  function tekenDuelHud(c, vw, vh) {
    // Voortgangsbalk: wie drijft wie terug.
    const bw = Math.min(560, vw - 80);
    const bx = vw / 2 - bw / 2,
      by = 26;
    c.save();
    c.fillStyle = 'rgba(10,28,44,0.85)';
    roundRect(c, bx, by, bw, 26, 8);
    c.fill();
    c.strokeStyle = 'rgba(217,164,65,0.5)';
    c.lineWidth = 1.4;
    c.stroke();

    const f = (positie + 1) / 2;
    c.fillStyle = '#8a3b3b';
    roundRect(c, bx + 3, by + 3, (bw - 6) * clamp(f, 0, 1), 20, 6);
    c.fill();
    c.strokeStyle = 'rgba(240,227,196,0.6)';
    c.beginPath();
    c.moveTo(bx + bw / 2, by);
    c.lineTo(bx + bw / 2, by + 26);
    c.stroke();

    c.font = '600 12px Georgia, serif';
    c.textBaseline = 'middle';
    c.fillStyle = '#f0e3c4';
    c.textAlign = 'left';
    c.fillText(Game.speler.naam, bx + 10, by + 13);
    c.textAlign = 'right';
    c.fillText(opts.tegenstander, bx + bw - 10, by + 13);

    // Melding.
    if (berichtT < 2.2) {
      c.textAlign = 'center';
      c.font = '600 20px Georgia, serif';
      c.globalAlpha = clamp(2.2 - berichtT, 0, 1);
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.65)';
      c.strokeText(bericht, vw / 2, by + 62);
      c.fillStyle = bericht_kleur;
      c.fillText(bericht, vw / 2, by + 62);
      c.globalAlpha = 1;
    }

    // Uithoudingsvermogen.
    c.fillStyle = 'rgba(10,28,44,0.8)';
    roundRect(c, 20, vh - 46, 180, 16, 5);
    c.fill();
    c.fillStyle = uithoudingSpeler > 0.3 ? '#7bb36a' : '#c65b45';
    roundRect(c, 22, vh - 44, 176 * uithoudingSpeler, 12, 4);
    c.fill();
    c.font = '10px Georgia, serif';
    c.fillStyle = '#dcd0b4';
    c.textAlign = 'left';
    c.fillText('adem', 26, vh - 52);

    // Bediening.
    c.textAlign = 'center';
    c.font = '12px Georgia, serif';
    c.fillStyle = 'rgba(230,217,184,0.75)';
    c.fillText('↑ hoog · → midden · ↓ laag — pareer op de juiste hoogte, sla dan meteen toe', vw / 2, vh - 22);
    c.restore();
  }

  return scene;
}
