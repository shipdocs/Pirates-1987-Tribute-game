// Overzichtsscène: varen over de Caribische Zee.
import {
  clamp, lerp, normAngle, dist, TAU, fmtDate, fmtGold, compassName, turnToward, pick, el,
} from './util.js';
import {
  WAREN, WAAR_INDEX, SCHIP_INDEX, NATIES, RANGEN, scheepsAanduiding, MOEILIJKHEDEN,
  metLidwoord, LEGENDES, LEGENDE_INDEX, ITEMS, PUNT_INDEX,
} from './data.js';
import { WORLD_W, WORLD_H, SCHAT_ZICHT, zeilEfficiëntie } from './world.js';
import {
  Game, roundRect, vlaggenschip, ruimTotaal, vlootBemanningMax, bewaar, talentBonus,
  conditieWoord, PENSIOEN_HINT,
} from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakZeeslag } from './battle.js';
import { openHaven } from './town.js';

const VOEDSEL = WAAR_INDEX.voedsel;
// De fysieke wereld is ruim tweemaal zo groot, maar de kalender loopt bewust
// niet evenredig mee. Een lange reis kost circa 28% meer dagen dan voorheen,
// niet ruim tweemaal zoveel proviand, moraal en jaren van de kapitein.
const DAGEN_PER_SECONDE = 0.12;
const STANDAARD_ZOOM = 1.28;
const MIN_ZOOM = 0.24;
const MAX_ZOOM = 2.4;

/**
 * Doodskopje op de zeekaart: waar een beruchte kapitein gezien is. Met een
 * donkere halo eronder, anders verdwijnt het wit tussen de stadsstippen.
 */
function tekenDoodskop(g, x, y) {
  g.save();
  g.fillStyle = 'rgba(20,10,14,0.6)';
  g.beginPath();
  g.arc(x, y, 10, 0, TAU);
  g.fill();

  g.fillStyle = '#f2e9d4';
  g.strokeStyle = '#140b0e';
  g.lineWidth = 1.2;
  // Schedel.
  g.beginPath();
  g.arc(x, y - 1, 5.6, 0, TAU);
  g.fill();
  g.stroke();
  // Kaak.
  g.beginPath();
  roundRect(g, x - 3.2, y + 3, 6.4, 3.4, 1.2);
  g.fill();
  g.stroke();
  // Oogkassen en neus.
  g.fillStyle = '#140b0e';
  g.beginPath();
  g.arc(x - 2.1, y - 1.4, 1.8, 0, TAU);
  g.arc(x + 2.1, y - 1.4, 1.8, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(x, y + 0.4);
  g.lineTo(x - 1.1, y + 2.2);
  g.lineTo(x + 1.1, y + 2.2);
  g.closePath();
  g.fill();
  g.restore();
}

/** Wat het scheepsvolk mompelt zodra de kapitein op leeftijd raakt. */
const OUDERDOM_MELDINGEN = [
  'De stuurman zegt dat hij een huis heeft gezien met uitzicht op de rede.',
  'Je knieën kraken bij het opgaan van de trap naar de kampanje.',
  'Het volk vraagt zich hardop af hoeveel reizen u er nog in heeft.',
  'De bottelier merkt op dat u de laatste tijd langer over de kaart gebogen zit.',
];

export function maakZeilScene() {
  const cam = { x: 0, y: 0, zoom: STANDAARD_ZOOM };
  let doelZoom = STANDAARD_ZOOM;
  let miniKaart = null;
  let ontmoetingKoeling = 0;
  let hongerKoeling = 0;
  let doelKoers = null;
  let sporen = [];
  let gebeurtenisKoeling = 40; // zeegebeurtenissen (wrak, handelspost, …)
  let stormKoeling = 0; // voorkomt dat stormschade elke seconde opnieuw tikt
  let inStormMelding = false;
  // Vertrek-animatie: het schip schuift bij het uitvaren van de kade het water
  // in (vanuit) -> (naar), in plaats van plotseling op open zee te staan.
  let vertrek = null;

  /**
   * Houdt het beeld binnen de zeekaart. Zonder deze klem vaar je zo voorbij de
   * rand van de wereld het lege niets in — en zag je bovendien de hulplijnen
   * waarmee het vasteland zichzelf sluit. Past het hele zeegebied in het beeld,
   * dan centreren we het gewoon.
   */
  function houdCameraInKaart() {
    const halfW = Game.breedte / 2 / cam.zoom;
    const halfH = Game.hoogte / 2 / cam.zoom;
    cam.x = halfW * 2 >= WORLD_W ? WORLD_W / 2 : clamp(cam.x, halfW, WORLD_W - halfW);
    cam.y = halfH * 2 >= WORLD_H ? WORLD_H / 2 : clamp(cam.y, halfH, WORLD_H - halfH);
  }

  const scene = {
    naam: 'zeilen',

    betreed() {
      const s = Game.speler;
      cam.x = s.x;
      cam.y = s.y;
      cam.zoom = STANDAARD_ZOOM;
      doelZoom = STANDAARD_ZOOM;
      houdCameraInKaart();
      if (!miniKaart) miniKaart = maakMiniKaart(Game.wereld);
      audio.startMuziek();
    },

    scroll(dy) {
      doelZoom = clamp(doelZoom * (dy > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
      houdCameraInKaart();
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
        doelZoom = clamp(doelZoom * 1.2, MIN_ZOOM, MAX_ZOOM);
        houdCameraInKaart();
      } else if (code === 'Minus' || code === 'NumpadSubtract') {
        doelZoom = clamp(doelZoom / 1.2, MIN_ZOOM, MAX_ZOOM);
        houdCameraInKaart();
      }
    },

    werkBij(dt) {
      if (UI.ietsOpen()) return;
      const w = Game.wereld;
      const s = Game.speler;
      const schip = vlaggenschip(s);
      const type = SCHIP_INDEX[schip.type];

      // Vertrek-animatie: eerst van de kade het water in, daarna pas sturen.
      if (vertrek) {
        vertrek.t += dt;
        const v = clamp(vertrek.t / vertrek.duur, 0, 1);
        const zacht = v * v * (3 - 2 * v); // ease in-out
        s.x = lerp(vertrek.vx, vertrek.tx, zacht);
        s.y = lerp(vertrek.vy, vertrek.ty, zacht);
        s.snelheid = 20 * zacht;
        if (vertrek.t >= vertrek.duur) {
          s.x = vertrek.tx;
          s.y = vertrek.ty;
          s.snelheid = 0;
          cam.x = s.x;
          cam.y = s.y;
          vertrek = null;
        } else {
          // Nog even extra schuim bij de kiel tijdens de aftocht.
          if (Math.random() < dt * 10) {
            sporen.push({ x: s.x, y: s.y, t: 0, duur: 1.6, r: 2 + Math.random() * 2 });
          }
          return;
        }
      }

      w.windTik(dt);
      w.stormTik && w.stormTik(dt);

      // Storm kán vlagen, romp lekken en volk overboord slaan. Hoe zwaarder
      // de storm en hoe hoger de moeilijkheidsgraad, hoe meer schade; een
      // weerglas (uitrusting `weer`) dempt dat.
      const stormKracht = w.stormOp ? w.stormOp(s.x, s.y) : 0;
      stormKoeling -= dt;
      if (stormKracht > 0.25 && stormKoeling <= 0) {
        stormKoeling = 3 + (1 - stormKracht) * 4;
        const moe = MOEILIJKHEDEN.find((m) => m.id === s.moeilijkheid) || MOEILIJKHEDEN[1];
        const stormMult = moe.storm || 1;
        const weer = (vlaggenschip(s).upgrades && vlaggenschip(s).upgrades.weer) || 0;
        // Verminderde schade: weerglas (1) = 40%, precisiebarometer (2) = 65%.
        const demping = [0, 0.4, 0.65][Math.min(weer, 2)] || 0;
        const risk = Math.round((16 + stormKracht * 34) * stormMult * (1 - demping));
        const schadeKans = 0.3 + stormKracht * 0.2;
        if (Math.random() < schadeKans) {
          const schip = vlaggenschip(s);
          const verloren = Math.max(0, Math.round(s.bemanning * (risk / 100)));
          s.bemanning = Math.max(6, s.bemanning - verloren);
          schip.romp = Math.max(10, schip.romp - Math.round(risk * 0.4));
          Game.melding(
            `De storm bijt in het want: ${verloren} man overboord, de romp lekt.`,
            'rood'
          );
          audio.sfx.ramp();
        } else if (!inStormMelding) {
          Game.melding('De storm giert door het want. Hou de zeilen strak!', 'goud');
        }
        inStormMelding = true;
      } else if (stormKracht <= 0.25) {
        inStormMelding = false;
      }

      // --- Sturen ---------------------------------------------------------
      const bonus = w.scheepsBonus ? w.scheepsBonus(s) : { zeil: 0, roer: 0, hoogte: 0 };
      const wend = type.wend * (0.55 + 0.45 * schip.zeilen) * (1 + bonus.roer);
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
      // Binnen een storm draait de wind van richting en wakkert hij aan; dat
      // telt hier lokaal mee, zodat je mét de storm mee sneller vaart en er
      // tegenin langzamer.
      const lokaal = w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht };
      const eff = zeilEfficiëntie(s.koers, lokaal.richting, type.hoogte + (bonus.hoogte || 0));
      const navBonus = 1 + 0.16 * talentBonus(s, 'navigatie') + bonus.zeil;
      const beschadigd = lerp(0.55, 1, clamp(schip.romp / schip.maxRomp, 0, 1));
      const zwaarBeladen = clamp(1 - (ruimTotaal(schip) / type.ruim) * 0.28, 0.7, 1);
      const doelSnelheid = type.snelheid * eff * lokaal.kracht * schip.zeilen * navBonus * beschadigd * zwaarBeladen;
      s.snelheid = lerp(s.snelheid, doelSnelheid, clamp(dt * 1.6, 0, 1));

      const nx = s.x + Math.cos(s.koers) * s.snelheid * dt;
      const ny = s.y + Math.sin(s.koers) * s.snelheid * dt;
      if (w.isVaren(nx, ny, schip.type)) {
        s.x = nx;
        s.y = ny;
      } else {
        // Zachtjes afketsen langs de kust in plaats van muurvast lopen. De
        // hele romp telt mee, zodat een groot schip niet over het land vaart.
        const langsX = s.x + Math.cos(s.koers) * s.snelheid * dt;
        const langsY = s.y;
        if (w.isVaren(langsX, langsY, schip.type)) s.x = langsX;
        else if (w.isVaren(s.x, ny, schip.type)) s.y = ny;
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
      // Zoomen glijdt rustig naar de gekozen stand. De kleinste stand toont
      // nagenoeg de hele Caraïben en is daarmee nadrukkelijk kaartoverzicht.
      cam.zoom = lerp(cam.zoom, doelZoom, clamp(dt * 7, 0, 1));
      // Minder loefruimte dan voorheen houdt het eigen schip dichter bij het
      // visuele middelpunt, zonder het zicht vóór de boeg helemaal te verliezen.
      const vooruit = 28 / cam.zoom;
      cam.x = lerp(cam.x, s.x + Math.cos(s.koers) * vooruit, clamp(dt * 3, 0, 1));
      cam.y = lerp(cam.y, s.y + Math.sin(s.koers) * vooruit, clamp(dt * 3, 0, 1));
      houdCameraInKaart();

      // --- Tijd, proviand en moraal ---------------------------------------
      const dagen = dt * DAGEN_PER_SECONDE;
      const vorigeDag = Math.floor(s.dag);
      s.dag += dagen;
      s.leeftijd = s.startLeeftijd + s.dag / 365;
      if (Math.floor(s.dag) !== vorigeDag) dagWisseling(s, w);

      w.economieTik(dagen);
      w.relatieTik(dagen, s);
      w.vlotenTik(dt, s);

      // --- Ontmoetingen & zeegebeurtenissen -------------------------------
      ontmoetingKoeling -= dt;
      hongerKoeling -= dt;
      gebeurtenisKoeling -= dt;
      if (gebeurtenisKoeling <= 0) {
        gebeurtenisKoeling = 90 + Math.random() * 120;
        laatGebeurtenisGeboren();
      }
      if (ontmoetingKoeling <= 0) {
        for (const v of w.vloten) {
          if (dist(v.x, v.y, s.x, s.y) < 46) {
            ontmoetingKoeling = 3;
            ontmoeting(v);
            break;
          }
        }
      }

      // --- De kust van de schatkaart herkennen -----------------------------
      // Met minstens twee stukken kan de stuurman de kustlijn thuisbrengen.
      // Alleen aanbieden als er geen ander scherm openstaat en je niet net
      // hebt afgezien van de tocht.
      if (
        s.schat &&
        s.schat.kwadranten.filter(Boolean).length >= 2 &&
        !s.schat.bezig &&
        (s.schat.afgezienDag == null || s.dag - s.schat.afgezienDag > 20) &&
        dist(s.x, s.y, s.schat.x, s.schat.y) < SCHAT_ZICHT &&
        !UI.ietsOpen()
      ) {
        s.schat.bezig = true;
        gaAanLand();
      }

      // --- Haven binnenlopen ----------------------------------------------
      const stad = w.stadOp(s.x, s.y, 46);
      if (stad) {
        ontmoetingKoeling = 3;
        openHaven(stad, () => {
          // Bij vertrek een eindje van de kade wegzetten, richting open zee,
          // op een plek waar de hele romp in het water past — en dat als een
          // korte uitzeil-animatie in plaats van een plotselinge sprong.
          const hoek = Math.atan2(s.y - stad.ankerY, s.x - stad.ankerX);
          const [wx, wy] = Game.wereld.dichtstbijVaren(
            stad.ankerX + Math.cos(hoek) * 80,
            stad.ankerY + Math.sin(hoek) * 80,
            schip.type
          );
          vertrek = { vx: s.x, vy: s.y, tx: wx, ty: wy, t: 0, duur: 1.1 };
          s.koers = hoek;
          // Uitvaren is het natuurlijke rustpunt: handel gedaan, werf gehad,
          // bemanning aangemonsterd. Hier bewaren scheelt de speler het verlies
          // van een hele havenronde als hij het tabblad sluit.
          if (bewaar()) Game.melding('Het logboek is bijgewerkt bij het uitvaren.');
        });
      }
    },

    teken(c) {
      const w = Game.wereld;
      const s = Game.speler;
      const vw = Game.breedte,
        vh = Game.hoogte;

      // De zee zelf volgt de lokale wind: binnen een stormcel kabbelt niets
      // meer, maar jaagt en schuimt het — zichtbaar zwaarder zeegang.
      const zeeWind = w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht };
      R.tekenZee(c, cam, vw, vh, Game.tijd, { richting: zeeWind.richting, kracht: zeeWind.kracht });

      c.save();
      c.translate(vw / 2, vh / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-cam.x, -cam.y);

      R.tekenDiepte(c, w);
      R.tekenKaartlijnen(c, cam, vw, vh);
      R.tekenLand(c, w, cam, vw, vh);
      // Stormwolken: donkere cumulus die met de wind meedrijven, óver het land
      // heen getekend zodat ze van veraf als dreiging zichtbaar zijn.
      R.tekenStormen(c, w, cam, vw, vh, Game.tijd);
      R.tekenKustEffecten(c, w, cam, vw, vh, Game.tijd);

      for (const p of sporen) R.tekenRook(c, { ...p, kleur: '#cfe9f2' });

      for (const stad of w.steden) {
        if (Math.abs(stad.x - cam.x) * cam.zoom > vw / 2 + 140) continue;
        if (Math.abs(stad.y - cam.y) * cam.zoom > vh / 2 + 140) continue;
        R.tekenStad(c, stad, cam, Game.tijd, dist(stad.ankerX, stad.ankerY, s.x, s.y) < 140);
      }

      // Verre schepen blijven herkenbaar, maar groeien minder sterk mee bij
      // uitzoomen. De eigen kapitein krijgt hieronder bewust meer gewicht.
      const scheepSchaal = clamp(0.64 / cam.zoom, 0.82, 1.8);
      const spelerSchaal = clamp(1.55 / cam.zoom, 1.08, 2.6);

      const doeLandCheck = (wx, wy) => w.isLand(wx, wy);
      for (const v of w.vloten) {
        if (Math.abs(v.x - cam.x) * cam.zoom > vw / 2 + 120) continue;
        if (Math.abs(v.y - cam.y) * cam.zoom > vh / 2 + 120) continue;
        R.tekenSchip(c, v.x, v.y, v.koers, v.type, v.natie, w.windRichting, {
          vaart: v.snelheid / 90,
          tijd: Game.tijd,
          kanonnen: v.kanonnen,
          schaal: scheepSchaal,
          isLand: doeLandCheck,
        });
      }

      const schip = vlaggenschip(s);
      // Extra schepen uit de vloot varen in kielzog mee. Pal langs de kust kan
      // de plek in kielzog voor hun eigen romp te krap zijn; dan schuiven we
      // ze een eindje verder weg tot het hele scheepje in het water past.
      for (let i = 1; i < s.schepen.length; i++) {
        const btype = s.schepen[i].type;
        const zijde = i % 2 ? 22 : -22;
        let bx = s.x - Math.cos(s.koers) * (i * 34) - Math.sin(s.koers) * zijde;
        let by = s.y - Math.sin(s.koers) * (i * 34) + Math.cos(s.koers) * zijde;
        for (let stap = 0; stap < 6 && !w.isVaren(bx, by, btype); stap++) {
          bx = s.x - Math.cos(s.koers) * (i * 34 + stap * 16) - Math.sin(s.koers) * zijde;
          by = s.y - Math.sin(s.koers) * (i * 34 + stap * 16) + Math.cos(s.koers) * zijde;
        }
        R.tekenSchip(c, bx, by, s.koers, btype, 'piraat', w.windRichting, {
          vaart: s.snelheid / 90,
          tijd: Game.tijd,
          zeilen: schip.zeilen,
          kanonnen: s.schepen[i].kanonnen,
          schaal: scheepSchaal,
          isLand: doeLandCheck,
        });
      }
      R.tekenSchip(c, s.x, s.y, s.koers, schip.type, 'piraat', w.windRichting, {
        vaart: s.snelheid / 90,
        tijd: Game.tijd,
        zeilen: schip.zeilen,
        kanonnen: schip.kanonnen,
        schaal: spelerSchaal,
        isLand: doeLandCheck,
        rompFractie: schip.romp / schip.maxRomp,
      });

      c.restore();

      // Zeeleven en storm: meeuwen cirkelen boven het water, regen jaagt bij
      // harde wind over het beeld — beide in schermruimte. Binnen een stormcel
      // waait en regent het zwaarder, ook zichtbaar op het scherm.
      R.tekenMeeuwen(c, vw, vh, Game.tijd);
      const stormLokaal = w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht };
      R.tekenRegen(c, vw, vh, stormLokaal.richting, stormLokaal.kracht, Game.tijd);

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
    // De jaren gaan tellen: het volk begint erover, lang voordat een haven het
    // hardop zegt.
    if (s.leeftijd >= PENSIOEN_HINT && Math.random() < 0.012) {
      Game.melding(pick(Math.random, OUDERDOM_MELDINGEN), 'goud');
    }
  }

  function muiterij(s) {
    const weg = Math.max(1, Math.round(s.bemanning * 0.18));
    s.bemanning = Math.max(6, s.bemanning - weg);
    s.moraal = clamp(s.moraal + 14, 0, 100);
    Game.melding(`${weg} man is gedeserteerd bij de eerste gelegenheid.`, 'rood');
    audio.sfx.fout();
  }

  // --- Zeegebeurtenissen -------------------------------------------------

  function laatGebeurtenisGeboren() {
    const s = Game.speler;
    // Niet tijdens een open dialoog beginnen.
    if (UI.ietsOpen()) return;
    const soorten = ['storm', 'wrak', 'handelspost', 'bootNood', 'dolfijnen'];
    const soort = soorten[Math.floor(Math.random() * soorten.length)];
    switch (soort) {
      case 'storm': gebeurtenisStorm(s); break;
      case 'wrak': gebeurtenisWrak(s); break;
      case 'handelspost': gebeurtenisHandelspost(s); break;
      case 'bootNood': gebeurtenisBootNood(s); break;
      case 'dolfijnen': gebeurtenisDolfijnen(s); break;
    }
  }

  async function gebeurtenisStorm(s) {
    if (UI.ietsOpen()) return;
    const wereld = Game.wereld;
    // Storm: wind springt omhoog én draait heftig. Risico op schade.
    const oudKracht = wereld.windKracht;
    wereld.windKracht = clamp(oudKracht + 0.8, 1, 2);
    const richting = Math.random() * TAU;
    wereld.windDoel = richting;
    // De weerglas/barometer uitrusting dempt ook deze storm, en de
    // moeilijkheidsgraad bepaalt hoe genadeloos hij toestaat.
    const weer = (vlaggenschip(s).upgrades && vlaggenschip(s).upgrades.weer) || 0;
    const demping = [0, 0.4, 0.65][Math.min(weer, 2)] || 0;
    const moe = MOEILIJKHEDEN.find((m) => m.id === s.moeilijkheid) || MOEILIJKHEDEN[1];
    const stormMult = moe.storm || 1;
    const risk = Math.round((20 + Math.random() * 40) * stormMult * (1 - demping));
    const schade = Math.random() < 0.35;
    await UI.vraag(
      'De hemel betrekt',
      `Een zwarte muur komt uit het oosten. De wind springt om en zwelt aan tot vlagen ` +
        `die het want laten gieren. De stuurman roept orders over het dek.`,
      [{ label: 'Alle zeilen reven', waarde: 'ok', soort: 'gevaar' }],
      { figuur: 'zeeman' }
    );
    if (schade) {
      const schip = vlaggenschip(s);
      const verloren = Math.round(s.bemanning * (risk / 100));
      s.bemanning = Math.max(8, s.bemanning - verloren);
      schip.romp = Math.max(10, schip.romp - risk * 0.5);
      Game.melding(`De storm eist ${verloren} man en slaat de romp lekken.`, 'rood');
      audio.sfx.ramp();
    } else {
      Game.melding('Je komt er zonder kleerscheuren vanaf.', 'goud');
      audio.sfx.fanfare();
    }
    // Wind zakt na de storm weer wat.
    wereld.windKracht = Math.max(0.72, oudKracht);
  }

  async function gebeurtenisWrak(s) {
    if (UI.ietsOpen()) return;
    const keuze = await UI.vraag(
      'Een wrak in de branding',
      `Door de mist zie je een gekantelde romp op een zandbank. ` +
        'Er drijft een kist tussen het wrakhout — wie weet wat erin zit.',
      [
        { label: 'Bergen (misschien gevaar)', waarde: 'berg', soort: 'gevaar' },
        { label: 'Doorvaren', waarde: 'weg' },
      ],
      { figuur: 'zeeman' }
    );
    if (keuze !== 'berg') return;
    const getal = Math.random();
    if (getal < 0.4) {
      const goud = Math.round(400 + Math.random() * 1400);
      s.goud += goud;
      s.roem += 2;
      Game.melding(`De kist bevat ${fmtGold(goud)} goudstukken. Buit!`, 'goud');
      audio.sfx.munt();
    } else if (getal < 0.7) {
      const verloren = Math.round(s.bemanning * 0.1);
      s.bemanning = Math.max(6, s.bemanning - verloren);
      s.moraal = clamp(s.moraal - 8, 0, 100);
      Game.melding('Het bleek een valstrik — piraten loerden op nieuwsgierigen.', 'rood');
      audio.sfx.fout();
    } else {
      const schat = Math.round(1500 + Math.random() * 2000);
      s.goud += schat;
      s.roem += 6;
      audio.sfx.fanfare();
      Game.melding(`In het wrak vind je een verzegelde kist met ${fmtGold(schat)} goudstukken!`);
    }
  }

  async function gebeurtenisHandelspost(s) {
    if (UI.ietsOpen()) return;
    const waarde = pick(Math.random, WAREN);
    const prijs = waarde.basis * 0.72;
    const maxKoop = Math.floor(s.goud / prijs);
    const keuze = await UI.vraag(
      'Een eenzame handelspost',
      `Aan een inham staat een paalhut met een vlag. Een nors type wenkt. ` +
        `"Ik ruil ${waarde.naam.toLowerCase()} voor een derde van de marktprijs. ` +
        `Zolang uw ruim het houdt, natuurlijk."`,
      [
        { label: `Kopen (${fmtGold(prijs)} p.e.)`, waarde: 'koop', uit: maxKoop <= 0 },
        { label: 'Geen tijd', waarde: 'weg' },
      ],
      { figuur: 'zeeman' }
    );
    if (keuze !== 'koop') return;
    const schip = vlaggenschip(s);
    const ruimVrij = SCHIP_INDEX[schip.type].ruim - schip.lading.reduce((a, b) => a + b, 0) - schip.kanonnen * 2;
    const kan = Math.min(Math.floor(ruimVrij), maxKoop);
    if (kan <= 0) {
      Game.melding('Je ruim is vol.', 'rood');
      return;
    }
    const i = WAREN.indexOf(waarde);
    s.goud -= kan * prijs;
    schip.lading[i] += kan;
    Game.melding(`Je laadt ${kan} eenheden ${waarde.naam.toLowerCase()} van de handelspost.`, 'goud');
    audio.sfx.munt();
  }

  async function gebeurtenisBootNood(s) {
    if (UI.ietsOpen()) return;
    const keuze = await UI.vraag(
      'Boot in nood',
      `Een sloep met een gescheurd zeil roept om hulp. Acht man zwaaien. ` +
        'De kapitein belooft een beloning als je hen aan land brengt.',
      [
        { label: 'Opnemen', waarde: 'op' },
        { label: 'Voorbijvaren', waarde: 'weg' },
      ],
      { figuur: 'zeeman' }
    );
    if (keuze !== 'op') return;
    // Soms zijn het juist een stel piraten.
    if (Math.random() < 0.2) {
      const verloren = Math.round(s.bemanning * 0.15);
      s.bemanning = Math.max(6, s.bemanning - verloren);
      s.goud = Math.max(0, s.goud - Math.round(s.goud * 0.1));
      s.moraal = clamp(s.moraal - 10, 0, 100);
      Game.melding('Het waren piraten! Ze sloegen toe en gingen er met een deel van de buit vandoor.', 'rood');
      audio.sfx.ramp();
    } else {
      const beloning = Math.round(300 + Math.random() * 900);
      s.goud += beloning;
      s.roem += 4;
      s.moraal = clamp(s.moraal + 4, 0, 100);
      Game.melding(`De geredde kapitein betaalt ${fmtGold(beloning)} goudstukken.`, 'goud');
      audio.sfx.munt();
    }
  }

  function gebeurtenisDolfijnen(s) {
    if (UI.ietsOpen()) return;
    s.moraal = clamp(s.moraal + 2, 0, 100);
    Game.melding('Een school dolfijnen zwemt een tijdje met je mee. Goed volk.', 'goud');
  }

  async function ontmoeting(vloot) {
    const s = Game.speler;
    const type = SCHIP_INDEX[vloot.type];
    const vijandig = vloot.natie === 'piraat' || s.relatie[vloot.natie] < -25;
    const rel = vloot.natie === 'piraat' ? -100 : s.relatie[vloot.natie];

    const legende = vloot.legende ? LEGENDE_INDEX[vloot.legende] : null;

    const beschrijving = legende
      ? `De uitkijk roept het van de mast: het is <b>${legende.naam}</b>, ${legende.bijnaam}. ` +
        `${metLidwoord(vloot.type, true)} draagt ${vloot.kanonnen} stukken geschut en ` +
        `${vloot.bemanning} koppen. ${legende.verhaal}<br><br>Ze houden recht op je aan.`
      : `Aan de horizon doemt een <b>${scheepsAanduiding(vloot.natie, vloot.type)}</b> op, ` +
        `naar schatting ${vloot.kanonnen} stukken geschut en ${vloot.bemanning} koppen aan boord.` +
        (vijandig ? ' Ze zetten koers naar jóu toe.' : '');

    const keuzes = [
      { label: 'Aanvallen', waarde: 'aanval', soort: 'gevaar' },
      { label: 'Aanroepen', waarde: 'roep' },
      { label: 'Wegvaren', waarde: 'weg' },
    ];
    const keuze = await UI.vraag(
      legende ? 'Een naam aan de horizon' : 'Zeil in zicht!',
      beschrijving,
      keuzes,
      { figuur: 'zeeman' }
    );

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
            // Even niet opnieuw jagen na een ontsnapping.
            vloot.jaagt = false;
            vloot.aggroKoeling = 18;
          }
          // Na het strijken van de vlag kabbelt de vijand door; laat hem even
          // met rust zodat je niet meteen weer in een gevecht wordt gezogen.
          if (uitslag.overgegeven) {
            vloot.jaagt = false;
            vloot.aggroKoeling = 22;
          }
          ontmoetingKoeling = 6;
        },
      })
    );
  }

  // --- De schatjacht aan land ---------------------------------------------

  /**
   * Paneel met één herkenningspunt, groot in inkt. Hetzelfde tekeningetje als
   * op het perkament, zodat je het spoor kunt volgen door te vergelijken.
   */
  function puntPaneel(id, breedte = 300, hoogte = 150) {
    const cv = document.createElement('canvas');
    cv.width = breedte;
    cv.height = hoogte;
    cv.className = 'kaart-canvas';
    const g = cv.getContext('2d');
    g.fillStyle = '#e9dcb8';
    g.fillRect(0, 0, breedte, hoogte);
    g.strokeStyle = 'rgba(120,92,50,0.4)';
    g.lineWidth = 2;
    g.strokeRect(3, 3, breedte - 6, hoogte - 6);
    R.tekenHerkenningspunt(g, id, breedte / 2, hoogte / 2 + 12, 4.2);
    return cv;
  }

  /**
   * Het spoor: van herkenningspunt naar herkenningspunt. Elk stuk perkament
   * dat je hebt maakt één stap leesbaar; voor de rest moet je gokken. Bij drie
   * missers geeft het volk het op en vaar je met lege handen terug.
   */
  async function gaAanLand() {
    const s = Game.speler;
    const schat = s.schat;
    const stukken = schat.kwadranten.filter(Boolean).length;

    const beginnen = await UI.vraag(
      'De stuurman herkent de kust',
      `Hij houdt het perkament naast de kustlijn en knikt. "Dit is het, kapitein. ` +
        `${schat.regio}." Aan wal gaan met een sloep en een paar man kost een dag of wat, ` +
        'en het volk moppert als er niets ligt.',
      [
        { label: 'Aan land gaan', waarde: true },
        { label: 'Doorvaren', waarde: false, esc: true },
      ],
      { figuur: 'zeeman' }
    );
    if (!beginnen) {
      schat.bezig = false;
      schat.afgezienDag = s.dag;
      return;
    }

    // De route loopt langs de herkenningspunten en eindigt bij het kruis.
    // Per stap kies je uit de drie punten; er is er telkens één goed.
    const route = schat.punten.map((p) => p.id);
    let missers = 0;

    for (let stap = 0; stap < route.length && missers < 3; stap++) {
      const goed = route[stap];
      // Zoveel stappen als je stukken perkament hebt, staan op de kaart; de
      // rest is gissen. Met vier stukken klopt het hele spoor.
      const leesbaar = stap < stukken - 1;
      const vorige = stap === 0 ? null : route[stap - 1];

      const keuze = await UI.vraag(
        stap === 0 ? 'Aan wal' : `Bij ${PUNT_INDEX[vorige].naam}`,
        (stap === 0
          ? 'De sloep loopt het strand op. Voor je uit ligt struikgewas, en daarachter drie plekken die eruitzien alsof iemand ze ooit heeft onthouden.'
          : `Je staat bij ${PUNT_INDEX[vorige].naam}. Vanaf hier lopen drie sporen verder.`) +
          (leesbaar
            ? `<br><br>Het perkament is hier duidelijk: <b>${PUNT_INDEX[goed].naam}</b>.`
            : '<br><br>Dit stuk van de kaart ontbreekt. De keuze is aan jou.'),
        route.map((id) => ({ label: `Naar ${PUNT_INDEX[id].naam}`, waarde: id })),
        // Het paneel ís het stuk perkament. Ontbreekt dat, dan is er ook geen
        // prent — een willekeurig plaatje zou doen alsof je iets ziet.
        { figuur: 'zeeman', paneel: leesbaar ? puntPaneel(goed) : null }
      );

      if (keuze === goed) {
        s.dag += 1;
        Game.melding(`Je staat bij ${PUNT_INDEX[goed].naam}. Het spoor klopt.`, 'goud');
      } else {
        missers++;
        s.dag += 2;
        s.moraal = clamp(s.moraal - 6, 0, 100);
        audio.sfx.fout();
        await UI.vraag(
          'Verkeerd gelopen',
          `Achter ${PUNT_INDEX[keuze].naam} loopt het spoor dood in het struikgewas. ` +
            `Twee dagen kwijt, en het volk kijkt zuur.` +
            (missers >= 3 ? ' Ze weigeren nog een stap te zetten.' : ''),
          [{ label: missers >= 3 ? 'Terug naar de sloep' : 'Opnieuw proberen', waarde: 'ok' }],
          { figuur: 'zeeman' }
        );
        stap--; // dezelfde stap opnieuw
      }
    }

    if (missers >= 3) {
      schat.bezig = false;
      schat.afgezienDag = s.dag;
      Game.melding('De tocht landinwaarts is op niets uitgelopen.', 'rood');
      return;
    }

    // Bij het kruis: graven.
    const buit = Math.round((5000 + Math.random() * 9000) * (1 + (s.schattenGevonden || 0) * 0.25));
    s.goud += buit;
    s.roem += 30;
    s.moraal = clamp(s.moraal + 12, 0, 100);
    s.schattenGevonden = (s.schattenGevonden || 0) + 1;
    s.schat = null;
    audio.sfx.fanfare();
    await UI.vraag(
      'De schop stuit op hout',
      `Onder een halve el zand ligt een kist met ijzeren banden. Er zit ` +
        `<b>${fmtGold(buit)} goudstukken</b> in, en een brief die niemand meer kan bezorgen.`,
      [{ label: 'Naar de sloep, snel', waarde: 'ok' }],
      { figuur: 'zeeman' }
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
        // Ook op hoogte begrenzen, anders steekt de kaart onder het paneel uit
        // en moet je scrollen om de Spaanse Main te zien.
        const bw = Math.min(
          960,
          Game.breedte - 140,
          Math.round(((Game.hoogte * 0.56) * WORLD_W) / WORLD_H)
        );
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
        // Waar een beruchte kapitein volgens de kroeg gezien is.
        for (const l of LEGENDES) {
          const st = s.legendes && s.legendes[l.id];
          if (!st || st.verslagen || !st.getipt || !st.bij) continue;
          const stad = Game.wereld.steden.find((x) => x.naam === st.bij);
          if (!stad) continue;
          tekenDoodskop(g, stad.x * sc, stad.y * sc - 12);
        }
        // Het zoekgebied van de schatkaart: hoe meer stukken, hoe krapper de
        // cirkel. Het kruis zelf komt er nooit op — dat moet je aan land zoeken.
        if (s.schat && s.schat.kwadranten.some(Boolean)) {
          const stukken = s.schat.kwadranten.filter(Boolean).length;
          const straal = [0, 1500, 800, 460, 300][stukken] * sc;
          g.save();
          g.strokeStyle = 'rgba(140,47,34,0.75)';
          g.setLineDash([6, 5]);
          g.lineWidth = 1.6;
          g.beginPath();
          g.arc(s.schat.x * sc, s.schat.y * sc, straal, 0, TAU);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = 'rgba(140,47,34,0.1)';
          g.fill();
          g.restore();
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
      knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
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
          const up = sh.upgrades || {};
          info.innerHTML =
            `<span>Romp</span><span>${Math.round(sh.romp)} / ${sh.maxRomp}</span>` +
            `<span>Kanonnen</span><span>${sh.kanonnen} / ${t.kanonnen}</span>` +
            `<span>Ruim</span><span>${ruimTotaal(sh)} / ${t.ruim}</span>` +
            `<span>Snelheid</span><span>${t.snelheid}</span>` +
            `<span>Wendbaarheid</span><span>${t.wend.toFixed(2)}</span>` +
            `<span>Aan de wind</span><span>${Math.round(t.hoogte * 100)}%</span>` +
            (up.zeilen || up.roer || up.romp || up.weer
              ? `<span>Uitrusting</span><span>zeil ${up.zeilen || 0} · roer ${up.roer || 0} · romp ${up.romp || 0}` +
                `${up.weer ? ` · weer ${up.weer}` : ''}</span>`
              : '');
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
      knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
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
          `<span>Leeftijd</span><span>${Math.floor(s.leeftijd)} jaar · ${conditieWoord(s)}</span>` +
          `</div>`;
        body.appendChild(d);
        body.appendChild(UI.balk(s.moraal, 100, s.moraal < 30 ? '#c65b45' : '#7bb36a', 'Moraal'));

        // Lange lijn: het vermiste familielid en de lopende opdracht.
        const lange = document.createElement('div');
        lange.className = 'schipkaart';
        lange.innerHTML = '<h3>De lange lijn</h3>';
        const famInfo = document.createElement('div');
        famInfo.className = 'schipkaart-info';
        const fam = s.familie;
        const schurk = LEGENDES.find((l) => l.schurk);
        famInfo.innerHTML = !fam
          ? `<span>Familie</span><span>—</span>`
          : fam.gevonden
            ? `<span>Familie</span><span>Je ${fam.rol} is teruggevonden ✓</span>`
            : fam.spoor
              ? `<span>Familie</span><span>Je ${fam.rol} zit aan boord bij ${schurk.naam}</span>`
              : `<span>Familie</span><span>Je ${fam.rol} is vermist${fam.zoekStad ? ` · laatst gehoord in ${fam.zoekStad}` : ' · geruchten in de kroeg'}</span>`;
        lange.appendChild(famInfo);
        if (s.opdracht) {
          const opdrachtInfo = el('div', 'schipkaart-info');
          opdrachtInfo.innerHTML =
            `<span>Opdracht</span><span>${s.opdracht.doe}${s.opdracht.klaar ? ' <b>(klaar)</b>' : ''}</span>` +
            `<span>Beloning</span><span>${fmtGold(s.opdracht.goud)} goud plus specerijen</span>`;
          lange.appendChild(opdrachtInfo);
        }
        body.appendChild(lange);

        // Het perkament, als je er stukken van hebt.
        if (s.schat && s.schat.kwadranten.some(Boolean)) {
          const kaart = el('div', 'schipkaart');
          const aantal = s.schat.kwadranten.filter(Boolean).length;
          kaart.innerHTML = `<h3>De schatkaart</h3>`;
          const cv = document.createElement('canvas');
          cv.width = 320;
          cv.height = 240;
          cv.className = 'kaart-canvas';
          R.tekenSchatkaart(cv.getContext('2d'), Game.wereld, s.schat, cv.width, cv.height, s.schat.kwadranten);
          kaart.appendChild(cv);
          const bij = el('p', 'verhaal');
          bij.innerHTML =
            `<b>${aantal}</b> van de vier stukken · ergens bij <b>${s.schat.regio}</b>.` +
            (aantal >= 2
              ? ' Zeil die streek af; je stuurman herkent de kust als je er langs komt.'
              : ' Met één stuk herkent niemand die kust — koop er meer in de kroeg.');
          kaart.appendChild(bij);
          body.appendChild(kaart);
        }

        // Beruchte kapiteins: wie er nog vaart, wie er verslagen is.
        const namen = el('div', 'schipkaart');
        namen.innerHTML = '<h3>Beruchte kapiteins</h3>';
        const naamInfo = el('div', 'schipkaart-info');
        // De schurk staat er pas bij zodra je weet dat hij bestaat.
        const zichtbaar = LEGENDES.filter((l) => !l.schurk || s.familie?.spoor);
        naamInfo.innerHTML = zichtbaar.map((l) => {
          const st = (s.legendes && s.legendes[l.id]) || {};
          const stand = st.verslagen
            ? 'verslagen ✓'
            : st.getipt && st.bij
              ? `gezien bij ${st.bij}`
              : 'nog geen spoor';
          return `<span>${l.naam}</span><span>${stand}</span>`;
        }).join('');
        namen.appendChild(naamInfo);
        body.appendChild(namen);

        // Buitstukken die je op ze veroverd hebt.
        if (s.items && s.items.length) {
          const buit = el('div', 'schipkaart');
          buit.innerHTML = '<h3>Buitstukken</h3>';
          const buitInfo = el('div', 'schipkaart-info');
          buitInfo.innerHTML = s.items
            .filter((id) => ITEMS[id])
            .map((id) => `<span>${ITEMS[id].naam}</span><span>${ITEMS[id].omschrijving}</span>`)
            .join('');
          buit.appendChild(buitInfo);
          body.appendChild(buit);
        }

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
      knoppen: (sch) => [{ label: 'Sluiten', esc: true, actie: () => sch.sluit() }],
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
        { label: 'Verder varen', esc: true, actie: () => sch.sluit() },
        {
          label: 'Spel bewaren',
          actie: () => {
            if (bewaar()) Game.melding('Het logboek is bijgewerkt.');
            else Game.melding('Bewaren mislukt.', 'rood');
            sch.sluit();
          },
        },
        {
          label: 'Bewaren en stoppen',
          actie: () => {
            if (bewaar()) {
              window.location.reload();
            } else {
              Game.melding('Bewaren mislukt — er wordt niet gestopt.', 'rood');
              sch.sluit();
            }
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
          // Apart van het geluid: wie de kanonnen wil horen maar niet de deun,
          // hoeft niet alles het zwijgen op te leggen.
          label: audio.muziekAan() ? 'Muziek uit' : 'Muziek aan',
          actie: () => {
            audio.zetMuziek(!audio.muziekAan());
            sch.ververs();
          },
        },
        {
          label: 'Stoppen zonder bewaren',
          soort: 'gevaar',
          actie: async () => {
            sch.sluit();
            // Bewaren blijft hier gewoon als uitweg staan: wie per ongeluk op
            // de rode knop drukt, hoeft zijn reis niet kwijt te raken.
            const keuze = await UI.vraag(
              'Weet je het zeker?',
              'Alles wat je sinds de laatste keer bewaren hebt gedaan, gaat verloren.',
              [
                { label: 'Toch eerst bewaren', waarde: 'bewaar' },
                { label: 'Ja, stoppen', waarde: 'stop', soort: 'gevaar' },
                { label: 'Nee, verder varen', waarde: 'nee', esc: true },
              ]
            );
            if (keuze === 'stop') window.location.reload();
            else if (keuze === 'bewaar') {
              if (bewaar()) window.location.reload();
              else Game.melding('Bewaren mislukt — er wordt niet gestopt.', 'rood');
            }
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
  // Binnen een storm wijst de HUD de lokale (aangewakkerde) wind aan.
  const lokaal = (w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht });
  const items = [
    ['datum', fmtDate(s.dag)],
    ['anker', type.naam],
    ['goud', fmtGold(s.goud)],
    ['kompas', compassName(s.koers)],
    ['wind', `${compassName(normAngle(lokaal.richting + Math.PI))}  ${(lokaal.kracht * 5).toFixed(1)}`],
    ['volk', `${s.bemanning}`],
    ['proviand', `${schip.lading[WAAR_INDEX.voedsel]}`],
  ];
  let x = 24;
  for (const [icoon, tekst] of items) {
    c.fillStyle = '#d9a441';
    R.tekenIcoon(c, icoon, x, 22, 8);
    x += 15;
    c.fillStyle = '#f0e3c4';
    c.fillText(tekst, x, 22);
    x += c.measureText(tekst).width + 24;
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
    // Stormen op de minikaart: kleine donkere vlekjes die met de wind meedrijven.
    if (w.stormen) {
      for (const st of w.stormen) {
        const sr = Math.max(4, (st.straal / WORLD_W) * mw * 0.9);
        c.fillStyle = 'rgba(40,58,80,0.6)';
        c.beginPath();
        c.arc(mx + st.x * sc, my + st.y * sc, sr, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(10,20,32,0.55)';
        c.beginPath();
        c.arc(mx + st.x * sc, my + st.y * sc, sr * 0.5, 0, TAU);
        c.fill();
      }
    }
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
  g.lineCap = 'round';
  // Ondiep water in de bankbreedte van het eiland zelf, zodat de Bahamabank
  // ook op duimnagelformaat als een plaat te herkennen is.
  g.strokeStyle = 'rgba(90,180,190,0.5)';
  for (const l of wereld.land) {
    g.lineWidth = 22 * (l.bank || 1);
    g.stroke(l.kust);
  }
  g.fillStyle = '#4a7a44';
  for (const l of wereld.land) g.fill(l.path);
  g.strokeStyle = '#d9c48a';
  g.lineWidth = 6;
  for (const l of wereld.land) g.stroke(l.kust);
  g.restore();
  return cv;
}
