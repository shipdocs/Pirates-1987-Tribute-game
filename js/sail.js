// Overzichtsscène: varen over de Caribische Zee.
import {
  clamp, lerp, normAngle, dist, TAU, fmtDate, fmtGold, compassName, turnToward,
} from './util.js';
import { WAREN, WAAR_INDEX, SCHIP_INDEX, NATIES, RANGEN, scheepsAanduiding } from './data.js';
import { WORLD_W, WORLD_H, zeilEfficiëntie } from './world.js';
import {
  Game, roundRect, vlaggenschip, ruimTotaal, vlootBemanningMax, bewaar, talentBonus,
} from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakZeeslag } from './battle.js';
import { openHaven } from './town.js';

const VOEDSEL = WAAR_INDEX.voedsel;
const DAGEN_PER_SECONDE = 0.2; // één dag per vijf seconden varen

export function maakZeilScene() {
  const cam = { x: 0, y: 0, zoom: 1 };
  let miniKaart = null;
  let ontmoetingKoeling = 0;
  let hongerKoeling = 0;
  let doelKoers = null;
  let sporen = [];

  const scene = {
    naam: 'zeilen',

    betreed() {
      const s = Game.speler;
      cam.x = s.x;
      cam.y = s.y;
      cam.zoom = 1;
      if (!miniKaart) miniKaart = maakMiniKaart(Game.wereld);
      audio.startMuziek();
    },

    scroll(dy) {
      cam.zoom = clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.35, 2.2);
    },

    toets(code) {
      if (UI.ietsOpen()) return;
      if (code === 'KeyM') {
        toonKaart();
      } else if (code === 'KeyS') {
        toonScheepsstatus();
      } else if (code === 'KeyC') {
        toonBemanning();
      } else if (code === 'Escape') {
        toonMenu();
      } else if (code === 'Equal' || code === 'NumpadAdd') {
        cam.zoom = clamp(cam.zoom * 1.2, 0.35, 2.2);
      } else if (code === 'Minus' || code === 'NumpadSubtract') {
        cam.zoom = clamp(cam.zoom / 1.2, 0.35, 2.2);
      }
    },

    werkBij(dt) {
      if (UI.ietsOpen()) return;
      const w = Game.wereld;
      const s = Game.speler;
      const schip = vlaggenschip(s);
      const type = SCHIP_INDEX[schip.type];

      w.windTik(dt);

      // --- Sturen ---------------------------------------------------------
      const wend = type.wend * (0.55 + 0.45 * schip.zeilen);
      let draaide = false;
      if (Game.toets('ArrowLeft') || Game.toets('KeyA')) {
        s.koers = normAngle(s.koers - wend * dt);
        draaide = true;
      }
      if (Game.toets('ArrowRight') || Game.toets('KeyD')) {
        s.koers = normAngle(s.koers + wend * dt);
        draaide = true;
      }
      if (draaide) doelKoers = null;

      // Klikken op zee zet een koers uit.
      if (Game.muis.klik) {
        const wx = cam.x + (Game.muis.x - Game.breedte / 2) / cam.zoom;
        const wy = cam.y + (Game.muis.y - Game.hoogte / 2) / cam.zoom;
        doelKoers = Math.atan2(wy - s.y, wx - s.x);
      }
      if (doelKoers != null) {
        s.koers = turnToward(s.koers, doelKoers, wend * dt);
        if (Math.abs(normAngle(doelKoers - s.koers)) < 0.02) doelKoers = null;
      }

      // Zeilstand.
      if (Game.toets('ArrowUp') || Game.toets('KeyW')) schip.zeilen = clamp(schip.zeilen + dt * 0.8, 0, 1);
      if (Game.toets('ArrowDown')) schip.zeilen = clamp(schip.zeilen - dt * 0.8, 0, 1);

      // --- Voortstuwing ---------------------------------------------------
      const eff = zeilEfficiëntie(s.koers, w.windRichting, type.hoogte);
      const navBonus = 1 + 0.16 * talentBonus(s, 'navigatie');
      const beschadigd = lerp(0.55, 1, clamp(schip.romp / schip.maxRomp, 0, 1));
      const zwaarBeladen = clamp(1 - (ruimTotaal(schip) / type.ruim) * 0.28, 0.7, 1);
      const doelSnelheid = type.snelheid * eff * w.windKracht * schip.zeilen * navBonus * beschadigd * zwaarBeladen;
      s.snelheid = lerp(s.snelheid, doelSnelheid, clamp(dt * 1.6, 0, 1));

      const nx = s.x + Math.cos(s.koers) * s.snelheid * dt;
      const ny = s.y + Math.sin(s.koers) * s.snelheid * dt;
      if (!w.isLand(nx, ny)) {
        s.x = nx;
        s.y = ny;
      } else {
        // Zachtjes afketsen langs de kust in plaats van muurvast lopen.
        const langsX = s.x + Math.cos(s.koers) * s.snelheid * dt;
        const langsY = s.y;
        if (!w.isLand(langsX, langsY)) s.x = langsX;
        else if (!w.isLand(s.x, ny)) s.y = ny;
        else s.snelheid *= 0.3;
      }
      s.x = clamp(s.x, 20, WORLD_W - 20);
      s.y = clamp(s.y, 20, WORLD_H - 20);

      // Kielzogspoor.
      if (s.snelheid > 8 && Math.random() < dt * 14) {
        sporen.push({ x: s.x, y: s.y, t: 0, duur: 2.4, r: 2 + Math.random() * 2 });
      }
      for (let i = sporen.length - 1; i >= 0; i--) {
        sporen[i].t += dt;
        if (sporen[i].t > sporen[i].duur) sporen.splice(i, 1);
      }

      // --- Camera ---------------------------------------------------------
      const vooruit = 60 / cam.zoom;
      cam.x = lerp(cam.x, s.x + Math.cos(s.koers) * vooruit, clamp(dt * 3, 0, 1));
      cam.y = lerp(cam.y, s.y + Math.sin(s.koers) * vooruit, clamp(dt * 3, 0, 1));

      // --- Tijd, proviand en moraal ---------------------------------------
      const dagen = dt * DAGEN_PER_SECONDE;
      const vorigeDag = Math.floor(s.dag);
      s.dag += dagen;
      s.leeftijd = s.startLeeftijd + s.dag / 365;
      if (Math.floor(s.dag) !== vorigeDag) dagWisseling(s, w);

      w.economieTik(dagen);
      w.vlotenTik(dt, s);

      // --- Ontmoetingen ---------------------------------------------------
      ontmoetingKoeling -= dt;
      hongerKoeling -= dt;
      if (ontmoetingKoeling <= 0) {
        for (const v of w.vloten) {
          if (dist(v.x, v.y, s.x, s.y) < 46) {
            ontmoetingKoeling = 3;
            ontmoeting(v);
            break;
          }
        }
      }

      // --- Haven binnenlopen ----------------------------------------------
      const stad = w.stadOp(s.x, s.y, 46);
      if (stad) {
        ontmoetingKoeling = 3;
        openHaven(stad, () => {
          // Bij vertrek een eindje van de kade wegzetten, richting open zee.
          const hoek = Math.atan2(s.y - stad.ankerY, s.x - stad.ankerX);
          const [wx, wy] = Game.wereld.dichtstbijWater(
            stad.ankerX + Math.cos(hoek) * 80,
            stad.ankerY + Math.sin(hoek) * 80
          );
          s.x = wx;
          s.y = wy;
          s.snelheid = 0;
          cam.x = s.x;
          cam.y = s.y;
        });
      }
    },

    teken(c) {
      const w = Game.wereld;
      const s = Game.speler;
      const vw = Game.breedte,
        vh = Game.hoogte;

      R.tekenZee(c, cam, vw, vh, Game.tijd);

      c.save();
      c.translate(vw / 2, vh / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-cam.x, -cam.y);

      R.tekenKaartlijnen(c, cam, vw, vh);
      R.tekenLand(c, w, cam, vw, vh);

      for (const p of sporen) R.tekenRook(c, { ...p, kleur: '#cfe9f2' });

      for (const stad of w.steden) {
        if (Math.abs(stad.x - cam.x) * cam.zoom > vw / 2 + 140) continue;
        if (Math.abs(stad.y - cam.y) * cam.zoom > vh / 2 + 140) continue;
        R.tekenStad(c, stad, cam, Game.tijd, dist(stad.ankerX, stad.ankerY, s.x, s.y) < 140);
      }

      for (const v of w.vloten) {
        if (Math.abs(v.x - cam.x) * cam.zoom > vw / 2 + 120) continue;
        if (Math.abs(v.y - cam.y) * cam.zoom > vh / 2 + 120) continue;
        R.tekenSchip(c, v.x, v.y, v.koers, v.type, v.natie, w.windRichting, {
          vaart: v.snelheid / 90,
          tijd: Game.tijd,
        });
      }

      const schip = vlaggenschip(s);
      // Extra schepen uit de vloot varen in kielzog mee.
      for (let i = 1; i < s.schepen.length; i++) {
        const off = i * 34;
        const bx = s.x - Math.cos(s.koers) * off - Math.sin(s.koers) * (i % 2 ? 22 : -22);
        const by = s.y - Math.sin(s.koers) * off + Math.cos(s.koers) * (i % 2 ? 22 : -22);
        R.tekenSchip(c, bx, by, s.koers, s.schepen[i].type, 'piraat', w.windRichting, {
          vaart: s.snelheid / 90,
          tijd: Game.tijd,
          zeilen: schip.zeilen,
        });
      }
      R.tekenSchip(c, s.x, s.y, s.koers, schip.type, 'piraat', w.windRichting, {
        vaart: s.snelheid / 90,
        tijd: Game.tijd,
        zeilen: schip.zeilen,
      });

      c.restore();

      tekenHud(c, s, w, cam, miniKaart);
    },
  };

  // --- Gebeurtenissen -----------------------------------------------------

  function dagWisseling(s, w) {
    const schip = vlaggenschip(s);
    const nodig = Math.max(1, Math.round(s.bemanning / 22));
    if (schip.lading[VOEDSEL] >= nodig) {
      schip.lading[VOEDSEL] -= nodig;
      s.moraal = clamp(s.moraal - 0.35, 0, 100);
    } else {
      schip.lading[VOEDSEL] = 0;
      s.moraal = clamp(s.moraal - 4, 0, 100);
      if (hongerKoeling <= 0) {
        hongerKoeling = 20;
        Game.melding('De proviand is op! De bemanning mort.', 'rood');
        audio.sfx.fout();
      }
    }
    // Timmerman lapt onderweg de romp op.
    if (talentBonus(s, 'timmerman') && schip.romp < schip.maxRomp) {
      schip.romp = Math.min(schip.maxRomp, schip.romp + 0.6);
    }
    if (s.moraal < 12 && Math.random() < 0.2) muiterij(s);
  }

  function muiterij(s) {
    const weg = Math.max(1, Math.round(s.bemanning * 0.18));
    s.bemanning = Math.max(6, s.bemanning - weg);
    s.moraal = clamp(s.moraal + 14, 0, 100);
    Game.melding(`${weg} man is gedeserteerd bij de eerste gelegenheid.`, 'rood');
    audio.sfx.fout();
  }

  async function ontmoeting(vloot) {
    const s = Game.speler;
    const type = SCHIP_INDEX[vloot.type];
    const vijandig = vloot.natie === 'piraat' || s.relatie[vloot.natie] < -25;
    const rel = vloot.natie === 'piraat' ? -100 : s.relatie[vloot.natie];

    const beschrijving =
      `Aan de horizon doemt een <b>${scheepsAanduiding(vloot.natie, vloot.type)}</b> op, ` +
      `naar schatting ${vloot.kanonnen} stukken geschut en ${vloot.bemanning} koppen aan boord.` +
      (vijandig ? ' Ze zetten koers naar jóu toe.' : '');

    const keuzes = [
      { label: 'Aanvallen', waarde: 'aanval', soort: 'gevaar' },
      { label: 'Aanroepen', waarde: 'roep' },
      { label: 'Wegvaren', waarde: 'weg' },
    ];
    const keuze = await UI.vraag('Zeil in zicht!', beschrijving, keuzes, { figuur: 'zeeman' });

    if (keuze === 'aanval') {
      beginZeeslag(vloot);
    } else if (keuze === 'roep') {
      if (vijandig) {
        await UI.vraag(
          'Geen woorden meer',
          'Ze antwoorden met een waarschuwingsschot voor de boeg. Er valt niet te praten.',
          [{ label: 'Te wapen!', waarde: 'ok', soort: 'gevaar' }]
        );
        beginZeeslag(vloot);
      } else {
        const w = Game.wereld;
        const doel = vloot.doel;
        const tips = [
          `Ze varen naar ${doel.naam} en zeggen dat ${WAREN[Math.floor(Math.random() * WAREN.length)].naam.toLowerCase()} daar goed betaald wordt.`,
          `De stuurman waarschuwt voor piraten rond ${w.steden[Math.floor(Math.random() * w.steden.length)].naam}.`,
          `Ze melden dat het garnizoen van ${doel.naam} op ${Math.round(doel.garnizoen)} man wordt geschat.`,
        ];
        await UI.vraag(
          'Praaien',
          `De kapitein groet vriendelijk. ${tips[Math.floor(Math.random() * tips.length)]}`,
          [{ label: 'Goede reis!', waarde: 'ok' }],
          { figuur: 'zeeman' }
        );
        if (rel > -25) s.relatie[vloot.natie] = clamp(s.relatie[vloot.natie] + 1, -100, 100);
      }
    } else {
      // Wegvaren lukt niet altijd tegen een sneller schip.
      const mijn = SCHIP_INDEX[vlaggenschip(s).type];
      const kans = clamp(0.45 + (mijn.snelheid - type.snelheid) / 60, 0.1, 0.95);
      if (vijandig && Math.random() > kans) {
        await UI.vraag(
          'Ze halen je in',
          'Hun boegspriet is al bijna binnen schootsafstand. Ontsnappen zit er niet in.',
          [{ label: 'Klaar voor de strijd', waarde: 'ok', soort: 'gevaar' }]
        );
        beginZeeslag(vloot);
      } else {
        Game.melding('Je zeilt weg van de ontmoeting.');
        // Even doorvaren zodat we niet meteen opnieuw botsen.
        vloot.x += Math.cos(vloot.koers) * 220;
        vloot.y += Math.sin(vloot.koers) * 220;
        ontmoetingKoeling = 8;
      }
    }
  }

  function beginZeeslag(vloot) {
    Game.zetScene(
      maakZeeslag(vloot, {
        terug(uitslag) {
          Game.zetScene(scene);
          const w = Game.wereld;
          const i = w.vloten.indexOf(vloot);
          if (uitslag.vijandWeg && i >= 0) w.vloten.splice(i, 1);
          if (uitslag.ontsnapt && i >= 0) {
            vloot.x += Math.cos(vloot.koers) * 300;
            vloot.y += Math.sin(vloot.koers) * 300;
          }
          ontmoetingKoeling = 6;
        },
      })
    );
  }

  // --- Schermen -----------------------------------------------------------

  function toonKaart() {
    const s = Game.speler;
    UI.toonScherm({
      titel: 'Zeekaart van de Caraïben',
      onder: fmtDate(s.dag),
      breed: true,
      klasse: 'overlay-kaart',
      bouw(body) {
        const cv = document.createElement('canvas');
        const bw = Math.min(960, Game.breedte - 140);
        cv.width = bw;
        cv.height = Math.round((bw * WORLD_H) / WORLD_W);
        cv.className = 'kaart-canvas';
        const g = cv.getContext('2d');
        const sc = cv.width / WORLD_W;
        g.fillStyle = '#0e3552';
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(miniKaart, 0, 0, cv.width, cv.height);
        // Steden en speler.
        for (const stad of Game.wereld.steden) {
          const nk = NATIES[stad.natie].kleur;
          g.fillStyle = nk;
          g.beginPath();
          g.arc(stad.x * sc, stad.y * sc, 3 + stad.grootte * 0.5, 0, TAU);
          g.fill();
          g.font = '10px Georgia, serif';
          g.fillStyle = 'rgba(240,230,205,0.85)';
          g.fillText(stad.naam, stad.x * sc + 6, stad.y * sc + 3);
        }
        g.fillStyle = '#ffdf8a';
        g.strokeStyle = '#2b1d12';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(s.x * sc, s.y * sc, 5, 0, TAU);
        g.fill();
        g.stroke();
        body.appendChild(cv);

        const legenda = document.createElement('div');
        legenda.className = 'legenda';
        for (const [id, n] of Object.entries(NATIES)) {
          if (id === 'piraat') continue;
          const sp = document.createElement('span');
          sp.innerHTML = `<i style="background:${n.kleur}"></i>${n.naam}`;
          legenda.appendChild(sp);
        }
        body.appendChild(legenda);
      },
      knoppen: (sch) => [{ label: 'Sluiten', actie: () => sch.sluit() }],
    });
  }

  function toonScheepsstatus() {
    const s = Game.speler;
    UI.toonScherm({
      titel: 'Onze vloot',
      onder: `${s.schepen.length} schip${s.schepen.length > 1 ? 'en' : ''} onder jouw vlag`,
      bouw(body) {
        for (let i = 0; i < s.schepen.length; i++) {
          const sh = s.schepen[i];
          const t = SCHIP_INDEX[sh.type];
          const kaart = document.createElement('div');
          kaart.className = 'schipkaart';
          kaart.innerHTML = `<h3>${t.naam}${i === 0 ? ' <em>(vlaggenschip)</em>' : ''}</h3>`;
          const info = document.createElement('div');
          info.className = 'schipkaart-info';
          info.innerHTML =
            `<span>Romp</span><span>${Math.round(sh.romp)} / ${sh.maxRomp}</span>` +
            `<span>Kanonnen</span><span>${sh.kanonnen} / ${t.kanonnen}</span>` +
            `<span>Ruim</span><span>${ruimTotaal(sh)} / ${t.ruim}</span>` +
            `<span>Snelheid</span><span>${t.snelheid}</span>` +
            `<span>Wendbaarheid</span><span>${t.wend.toFixed(2)}</span>` +
            `<span>Aan de wind</span><span>${Math.round(t.hoogte * 100)}%</span>`;
          kaart.appendChild(info);
          kaart.appendChild(UI.balk(sh.romp, sh.maxRomp, '#7bb36a', 'Rompsterkte'));
          body.appendChild(kaart);
        }
        const lading = document.createElement('div');
        lading.className = 'schipkaart';
        lading.innerHTML = '<h3>Ruim van het vlaggenschip</h3>';
        const sh = vlaggenschip(s);
        lading.appendChild(
          UI.tabel(
            [{ label: 'Waar' }, { label: 'Aantal', rechts: true }],
            WAREN.map((w, i) => ({
              cellen: [{ tekst: w.naam }, { tekst: String(sh.lading[i]), klasse: 'rechts' }],
            }))
          )
        );
        body.appendChild(lading);
      },
      knoppen: (sch) => [{ label: 'Sluiten', actie: () => sch.sluit() }],
    });
  }

  function toonBemanning() {
    const s = Game.speler;
    UI.toonScherm({
      titel: 'Bemanning en buit',
      bouw(body) {
        const d = document.createElement('div');
        d.className = 'schipkaart';
        d.innerHTML =
          `<div class="schipkaart-info">` +
          `<span>Bemanning</span><span>${s.bemanning} / ${vlootBemanningMax(s)}</span>` +
          `<span>Moraal</span><span>${Math.round(s.moraal)}%</span>` +
          `<span>Buit in het ruim</span><span>${fmtGold(s.goud)} goudstukken</span>` +
          `<span>Eigen spaargeld</span><span>${fmtGold(s.gespaard)} goudstukken</span>` +
          `<span>Roem</span><span>${Math.round(s.roem)}</span>` +
          `<span>Leeftijd</span><span>${Math.floor(s.leeftijd)} jaar</span>` +
          `</div>`;
        body.appendChild(d);
        body.appendChild(UI.balk(s.moraal, 100, s.moraal < 30 ? '#c65b45' : '#7bb36a', 'Moraal'));

        const rel = document.createElement('div');
        rel.className = 'schipkaart';
        rel.innerHTML = '<h3>Betrekkingen</h3>';
        rel.appendChild(
          UI.tabel(
            [{ label: 'Natie' }, { label: 'Verhouding' }, { label: 'Rang', rechts: true }],
            Object.keys(s.relatie).map((n) => ({
              cellen: [
                { html: `<b style="color:${NATIES[n].kleur}">${NATIES[n].naam}</b>` },
                { node: UI.balk(s.relatie[n] + 100, 200, s.relatie[n] < 0 ? '#c65b45' : '#7bb36a', relatieWoord(s.relatie[n])) },
                { tekst: RANGNAAM(s, n), klasse: 'rechts' },
              ],
            }))
          )
        );
        body.appendChild(rel);
      },
      knoppen: (sch) => [{ label: 'Sluiten', actie: () => sch.sluit() }],
    });
  }

  function toonMenu() {
    UI.toonScherm({
      titel: 'Scheepsraad',
      klasse: 'overlay-smal',
      bouw(body) {
        body.appendChild(
          Object.assign(document.createElement('p'), {
            className: 'verhaal',
            textContent: 'Wat is je bevel, kapitein?',
          })
        );
      },
      knoppen: (sch) => [
        { label: 'Verder varen', actie: () => sch.sluit() },
        {
          label: 'Spel bewaren',
          actie: () => {
            if (bewaar()) Game.melding('Het logboek is bijgewerkt.');
            else Game.melding('Bewaren mislukt.', 'rood');
            sch.sluit();
          },
        },
        {
          label: audio.geluidAan() ? 'Geluid uit' : 'Geluid aan',
          actie: () => {
            audio.zetGeluid(!audio.geluidAan());
            sch.ververs();
          },
        },
        {
          label: 'Terug naar de titel',
          soort: 'gevaar',
          actie: async () => {
            sch.sluit();
            const ja = await UI.vraag(
              'Weet je het zeker?',
              'Niet-bewaarde vorderingen gaan verloren.',
              [
                { label: 'Ja, stop', waarde: true, soort: 'gevaar' },
                { label: 'Nee', waarde: false },
              ]
            );
            if (ja) window.location.reload();
          },
        },
      ],
    });
  }

  return scene;
}

function RANGNAAM(s, n) {
  const r = RANGEN[clamp(s.rang[n], 0, RANGEN.length - 1)];
  return s.rang[n] > 0 && r ? r.naam : '—';
}

function relatieWoord(v) {
  if (v <= -60) return 'Op leven en dood';
  if (v <= -25) return 'Vijandig';
  if (v < 15) return 'Koel';
  if (v < 50) return 'Vriendelijk';
  return 'Bondgenoot';
}

// --- HUD ------------------------------------------------------------------

function tekenHud(c, s, w, cam, miniKaart) {
  const vw = Game.breedte,
    vh = Game.hoogte;
  const schip = vlaggenschip(s);
  const type = SCHIP_INDEX[schip.type];

  // Bovenbalk.
  c.save();
  c.fillStyle = 'rgba(10,28,44,0.82)';
  c.fillRect(0, 0, vw, 44);
  c.fillStyle = 'rgba(217,164,65,0.5)';
  c.fillRect(0, 43, vw, 1.4);

  c.font = '600 14px Georgia, serif';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const items = [
    ['📅', fmtDate(s.dag)],
    ['⚓', type.naam],
    ['💰', fmtGold(s.goud)],
    ['🧭', compassName(s.koers)],
    ['🌬', `${compassName(normAngle(w.windRichting + Math.PI))}  ${(w.windKracht * 5).toFixed(1)}`],
    ['👥', `${s.bemanning}`],
    ['🍖', `${schip.lading[WAAR_INDEX.voedsel]}`],
  ];
  let x = 16;
  for (const [icoon, tekst] of items) {
    c.fillStyle = '#d9a441';
    c.fillText(icoon, x, 22);
    x += 22;
    c.fillStyle = '#f0e3c4';
    c.fillText(tekst, x, 22);
    x += c.measureText(tekst).width + 26;
  }

  // Rompbalk rechtsboven.
  const bw = 130;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(c, vw - bw - 16, 13, bw, 18, 4);
  c.fill();
  const rf = clamp(schip.romp / schip.maxRomp, 0, 1);
  c.fillStyle = rf > 0.5 ? '#7bb36a' : rf > 0.25 ? '#d9a441' : '#c65b45';
  roundRect(c, vw - bw - 16, 13, bw * rf, 18, 4);
  c.fill();
  c.fillStyle = '#0d1f30';
  c.font = '600 11px Georgia, serif';
  c.textAlign = 'center';
  c.fillText('ROMP', vw - bw / 2 - 16, 22);
  c.restore();

  // Windroos.
  R.tekenWindroos(c, vw - 62, 100, 42, w.windRichting, w.windKracht, Game.tijd);

  // Zeilstand.
  c.save();
  c.fillStyle = 'rgba(10,28,44,0.72)';
  roundRect(c, 16, vh - 76, 168, 58, 8);
  c.fill();
  c.strokeStyle = 'rgba(217,164,65,0.45)';
  c.lineWidth = 1.2;
  c.stroke();
  c.font = '600 11px Georgia, serif';
  c.fillStyle = '#b9c7d4';
  c.textAlign = 'left';
  c.fillText('ZEILEN', 28, vh - 58);
  c.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(c, 28, vh - 48, 144, 12, 3);
  c.fill();
  c.fillStyle = '#e9dcb8';
  roundRect(c, 28, vh - 48, 144 * schip.zeilen, 12, 3);
  c.fill();
  c.fillStyle = '#b9c7d4';
  c.fillText(`${(s.snelheid / 8).toFixed(1)} knopen`, 28, vh - 27);
  c.restore();

  // Minikaart.
  if (miniKaart) {
    const mw = 210;
    const mh = Math.round((mw * WORLD_H) / WORLD_W);
    const mx = vw - mw - 16,
      my = vh - mh - 16;
    c.save();
    c.fillStyle = 'rgba(8,26,40,0.85)';
    roundRect(c, mx - 4, my - 4, mw + 8, mh + 8, 6);
    c.fill();
    c.strokeStyle = 'rgba(217,164,65,0.55)';
    c.lineWidth = 1.4;
    c.stroke();
    c.drawImage(miniKaart, mx, my, mw, mh);
    const sc = mw / WORLD_W;
    for (const stad of w.steden) {
      c.fillStyle = NATIES[stad.natie].kleur;
      c.fillRect(mx + stad.x * sc - 1.5, my + stad.y * sc - 1.5, 3, 3);
    }
    c.fillStyle = '#ffe28a';
    c.beginPath();
    c.arc(mx + s.x * sc, my + s.y * sc, 3.2, 0, TAU);
    c.fill();
    c.restore();
  }

  // Bedieningshulp.
  c.save();
  c.font = '11px Georgia, serif';
  c.fillStyle = 'rgba(220,208,180,0.5)';
  c.textAlign = 'left';
  c.fillText('← → sturen · ↑ ↓ zeilen · klik = koers · M kaart · S schip · C bemanning · Esc menu', 16, vh - 92);
  c.restore();
}

// --- Minikaart ------------------------------------------------------------

function maakMiniKaart(wereld) {
  const W = 640;
  const H = Math.round((W * WORLD_H) / WORLD_W);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const sc = W / WORLD_W;
  g.fillStyle = '#0d3552';
  g.fillRect(0, 0, W, H);
  g.save();
  g.scale(sc, sc);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(90,180,190,0.5)';
  g.lineWidth = 22;
  for (const l of wereld.land) g.stroke(l.path);
  g.fillStyle = '#4a7a44';
  for (const l of wereld.land) g.fill(l.path);
  g.strokeStyle = '#d9c48a';
  g.lineWidth = 6;
  for (const l of wereld.land) g.stroke(l.path);
  g.restore();
  return cv;
}
