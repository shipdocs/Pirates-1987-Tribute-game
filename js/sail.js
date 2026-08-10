// Overzichtsscène: varen over de Caribische Zee.
import {
  clamp, lerp, normAngle, dist, TAU, fmtDate, fmtGold, compassName, pick,
} from './util.js';
import {
  WAREN, WAAR_INDEX, SCHIP_INDEX, scheepsAanduiding, MOEILIJKHEDEN,
  metLidwoord, LEGENDE_INDEX, PUNT_INDEX,
} from './data.js';
import { WORLD_W, WORLD_H, SCHAT_ZICHT, zeilEfficiëntie, DAGEN_PER_SECONDE } from './world.js';
import {
  Game, vlaggenschip, ruimTotaal, bewaar, talentBonus, PENSIOEN_HINT,
} from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakZeeslag } from './battle.js';
import { openHaven } from './town.js';
import { toonKaart, toonScheepsstatus, toonScheepsvolk, toonMenu } from './zeil-schermen.js';
import { ankerDialoog, uitkijkRapport, startUitkijk, UITKIJK_VERTRAGING } from './anker.js';

const PROVIAND = WAAR_INDEX.proviand;
// De kalendersnelheid is gedeeld met het ankersysteem (`world.js`): onder zeil
// én aan het anker verstrijkt de tijd in hetzelfde tempo, anders zou een
// ankerbezigheid een snellere wereld hebben dan varen.

// Stormbelasting per seconde: hoe snel de spanning in romp en want oploopt bij
// volle last, en hoeveel het schip er vanzelf van herstelt. Met deze twee is de
// kern op volle zeilen ruim tien seconden te dragen en laat gereefd varen de
// spanning juist zakken — de gevarenzone is daarmee uitdagend én te keren.
const STORM_OPBOUW = 0.14;
const STORM_HERSTEL = 0.045;

const LEEG_STORMVELD = { nabij: 0, rug: 0, gevaar: 0, cel: null, richting: 0, kracht: 1 };
// Zoomstanden. De standaardstand is de maat waarop de schepen op ware grootte
// worden getekend (zie `scheepSchaal` hieronder); hij is bewust niet hoger
// gezet, want een stormcel meet zeshonderd tot twaalfhonderd wereldeenheden en
// bij een nauwere stand valt de kernrand buiten beeld — precies de grens waarop
// je in een bui je besluit neemt.
// De standaardstand is de zoom waarop de wereld op ware grootte staat, dus die
// halen we uit render.js in plaats van hem hier nog eens op te schrijven —
// anders zouden schepen en steden op de gewone speelstand niet meer kloppen.
// Hoger zetten kan niet zomaar: een stormcel meet zeshonderd tot twaalfhonderd
// wereldeenheden, en bij een nauwere stand valt de kernrand buiten beeld —
// precies de grens waarop je in een bui je besluit neemt.
const STANDAARD_ZOOM = R.WARE_ZOOM;
// De kleinste stand toont nagenoeg de hele Caraïben als kaartoverzicht. De
// kaart is groter geworden, dus de overzichtsstand zoomt mee uit om evenveel
// water in beeld te blijven tonen.
const MIN_ZOOM = 0.24 * (196 / 350);
const MAX_ZOOM = 4;

// Hoeveel de boeg nog doordraait nadat je het roer loslaat, in radialen. Voor
// elk schip gelijk: een roer moet aanvoelen als een roer en niet als de remweg
// van een vrachtschip. Het komt in de praktijk uit op een graad of negen — de
// demping werkt per beeld, dus bij een lagere beeldsnelheid valt de draai iets
// eerder stil. Genoeg om de draai zacht te laten uitlopen, weinig genoeg om
// niet te hoeven mikken.
const STUUR_UITZWAAI = 0.19;

/** Wat het scheepsvolk mompelt zodra de kapitein op leeftijd raakt. */
const OUDERDOM_MELDINGEN = [
  'De stuurman zegt dat hij een huis heeft gezien met uitzicht op de rede.',
  'Je knieën kraken bij het opgaan van de trap naar de kampanje.',
  'Het volk vraagt zich hardop af hoeveel reizen u er nog in heeft.',
  'De bottelier merkt op dat u de laatste tijd langer over de kaart gebogen zit.',
];

/**
 * Eén schuimvlok in het kielzog.
 *
 * Deze vlokken deelden hun tekenfunctie met de kruitdamp van het geschut, en
 * dus ook diens uitdijing: een vlok groeide uit tot ruim anderhalve
 * scheepslengte breed. Achter het schip stond daardoor geen spoor maar een
 * witte rookdriehoek, breder dan het schip zelf en los van het eigenlijke
 * kielzog dat `tekenSchip` al tekent. Schuim blijft strak en dooft snel; de
 * damp van een breedzijde mag bollen.
 */
function nieuwSpoor(x, y) {
  return {
    x,
    y,
    t: 0,
    duur: 1.7,
    r: 1.6 + Math.random() * 1.4,
    kleur: '#cfe9f2',
    groei: 0.55,
    dekking: 0.34,
  };
}

export function maakZeilScene() {
  const cam = { x: 0, y: 0, zoom: STANDAARD_ZOOM };
  let doelZoom = STANDAARD_ZOOM;
  let miniKaart = null;
  let ontmoetingKoeling = 0;
  let hongerKoeling = 0;
  let doelKoers = null;
  let sporen = [];
  let gebeurtenisKoeling = 40; // zeegebeurtenissen (wrak, handelspost, …)
  // Stormtoestand. `stormBelasting` is de spanning die zich in romp en want
  // opbouwt zolang je in de kern vaart: hij loopt zichtbaar op, is met minder
  // zeil of een andere koers te keren, en pas als hij vol is bezwijkt er iets.
  // Nooit een dobbelsteen achter de rug van de speler om.
  let stormVeld = LEEG_STORMVELD;
  let stormBelasting = 0;
  let stormFase = 'buiten'; // buiten · band · kern — voor de overgangsmelding
  let stormWaarschuwing = 0; // welke drempel al gemeld is (0, 1 of 2)
  // Laatst gemelde weerbeeld. Zonder deze twee draait de wind ongemerkt: hij
  // kruipt te traag om te zien en het enige spoor is een cijfer in de balk.
  let gemeldeWindhoek = null;
  let gemeldeWindkracht = null;
  let windMeldKoeling = 0;
  // Vertrek-animatie: het schip schuift bij het uitvaren van de kade het water
  // in (vanuit) -> (naar), in plaats van plotseling op open zee te staan.
  let vertrek = null;
  // De uitkijk in het kraaiennest: na `UITKIJK_VERTRAGING` seconden rapporteert
  // hij wat er in de verte vaart. 0 = er loopt geen uitkijk.
  let uitkijkTimer = 0;

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

    verlaat() {
      // Het stormbed loopt door zolang niemand het bijstelt; bij een zeeslag of
      // een haven hoort de bui niet mee naar binnen.
      audio.zetStorm(0, 0);
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
        toonScheepsvolk();
      } else if (code === 'KeyU') {
        // De uitkijk klimt naar het kraaiennest en rapporteert na een korte
        // vertraging wat er aan de horizon te zien is.
        if (uitkijkTimer <= 0) {
          uitkijkTimer = UITKIJK_VERTRAGING;
          startUitkijk();
        }
      } else if (code === 'KeyK') {
        // "Kabel vieren": voor anker gaan opent het ankerscherm.
        ankerDialoog();
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
          if (Math.random() < dt * 8) sporen.push(nieuwSpoor(s.x, s.y));
          return;
        }
      }

      // De uitkijk in het kraaiennest telt af zolang er geen scherm open is;
      // zodra hij rapporteert, wordt een volgend bezoek weer opnieuw geteld.
      if (uitkijkTimer > 0) {
        uitkijkTimer -= dt;
        if (uitkijkTimer <= 0) {
          uitkijkTimer = 0;
          uitkijkRapport();
        }
      }

      w.windTik(dt);
      w.stormTik && w.stormTik(dt);
      meldWeer(w, dt);

      stormVeld = w.stormVeld ? w.stormVeld(s.x, s.y) : LEEG_STORMVELD;
      werkStormBij(s, stormVeld, dt);

      // --- Sturen ---------------------------------------------------------
      // Het roer hakt de koers niet meteen om, maar draait de hoeksnelheid
      // `s.hoekSnelheid` geleidelijk bij: zolang het roer staat, loopt hij op
      // naar de maximale draaisnelheid `wend`, en zodra het roer wordt
      // losgelaten dooft hij uit. De topdraai blijft even snel als voorheen, en
      // de boeg komt op gang en valt stil zonder te verspringen.
      const bonus = w.scheepsBonus ? w.scheepsBonus(s) : { zeil: 0, roer: 0, hoogte: 0 };
      const wend = type.wend * (0.55 + 0.45 * schip.zeilen) * (1 + bonus.roer);
      // Hoeksnelheid naar z'n doel dirigeren. Hoe hoger de ratio, des te
      // korter de aanloop en hoe pittiger het sturen; lager voelt zeileriger.
      const stuurBijregel = 6;
      // Het uitdooftempo hangt aan de wendbaarheid, zodat de uitzwaai voor elk
      // schip even groot is. Met een vast tempo zwierde juist de handigste sloep
      // het verst door — die haalt de hoogste draaisnelheid en had er dus de
      // langste nasleep van, precies omgekeerd aan wat je van hem verwacht.
      const stuurRust = wend / STUUR_UITZWAAI;
      const links = Game.toets('ArrowLeft') || Game.toets('KeyA');
      const rechts = Game.toets('ArrowRight') || Game.toets('KeyD');
      const stuur = (rechts ? 1 : 0) - (links ? 1 : 0);
      // Met het roer vast draait de boeg soepel naar volle wendbaarheid.
      if (stuur) {
        s.hoekSnelheid = lerp(s.hoekSnelheid, stuur * wend, clamp(stuurBijregel * dt, 0, 1));
        doelKoers = null;
      }

      // Klikken op zee zet een koers uit.
      if (Game.muis.klik) {
        const wx = cam.x + (Game.muis.x - Game.breedte / 2) / cam.zoom;
        const wy = cam.y + (Game.muis.y - Game.hoogte / 2) / cam.zoom;
        doelKoers = Math.atan2(wy - s.y, wx - s.x);
      }

      // Zonder roer (of met een uitgezette koers) zachtjes bijsturen of
      // afremmen. Een gewone koers remt zodra hij dichtbij is, zodat de boeg
      // zonder oversteken op de doelhoek komt te liggen.
      if (doelKoers != null && !stuur) {
        const verschil = normAngle(doelKoers - s.koers);
        const drempel = 0.018;
        if (Math.abs(verschil) < drempel) {
          s.koers = doelKoers;
          s.hoekSnelheid = 0;
          doelKoers = null;
        } else {
          // Evenredig sturen: veraf op volle draai, dichterbij trager.
          s.hoekSnelheid = lerp(
            s.hoekSnelheid,
            clamp(verschil * 2.4, -wend, wend),
            clamp(stuurBijregel * dt, 0, 1)
          );
        }
      } else if (!stuur) {
        s.hoekSnelheid = lerp(s.hoekSnelheid, 0, clamp(stuurRust * dt, 0, 1));
      }
      s.koers = normAngle(s.koers + s.hoekSnelheid * dt);

      // Zeilstand.
      if (Game.toets('ArrowUp') || Game.toets('KeyW')) schip.zeilen = clamp(schip.zeilen + dt * 0.8, 0, 1);
      if (Game.toets('ArrowDown')) schip.zeilen = clamp(schip.zeilen - dt * 0.8, 0, 1);

      // --- Voortstuwing ---------------------------------------------------
      // Binnen een storm draait de wind van richting en wakkert hij aan; dat
      // telt hier lokaal mee, zodat je mét de storm mee sneller vaart en er
      // tegenin langzamer.
      const lokaal = w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht };
      const eff = zeilEfficiëntie(s.koers, lokaal.richting, type.hoogte + (bonus.hoogte || 0));
      const navBonus = 1 + 0.16 * talentBonus(s, 'stuurmanskunst') + bonus.zeil;
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
      if (s.snelheid > 8 && Math.random() < dt * 10) sporen.push(nieuwSpoor(s.x, s.y));
      for (let i = sporen.length - 1; i >= 0; i--) {
        sporen[i].t += dt;
        if (sporen[i].t > sporen[i].duur) sporen.splice(i, 1);
      }

      // --- Camera ---------------------------------------------------------
      // Zoomen glijdt rustig naar de gekozen stand. De kleinste stand toont
      // nagenoeg de hele Caraïben en is daarmee nadrukkelijk kaartoverzicht.
      cam.zoom = lerp(cam.zoom, doelZoom, clamp(dt * 7, 0, 1));
      // Vaste loefruimte in schermpixels (de deling door de zoom rekent hem naar
      // wereldeenheden). Achtentwintig pixels was minder dan een halve
      // scheepslengte en dus niet te zien; honderdtien geeft zicht vóór de boeg
      // zonder het schip uit het midden te duwen.
      const vooruit = 110 / cam.zoom;
      cam.x = lerp(cam.x, s.x + Math.cos(s.koers) * vooruit, clamp(dt * 3, 0, 1));
      cam.y = lerp(cam.y, s.y + Math.sin(s.koers) * vooruit, clamp(dt * 3, 0, 1));
      houdCameraInKaart();

      // --- Tijd, proviand en geest ---------------------------------------
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
          // De boeg wijst bij vertrek uit de haven altijd richting open zee,
          // ook als de dichtstbijzijnde vaarplek in een smalle geul ligt.
          s.koers = Game.wereld.koersOpenZee(wx, wy, schip.type, hoek);
          // Na het losgooien ligt het roer recht: de boeg vaart de haven uit
          // zonder een overgebleven draaiing mee te nemen.
          s.hoekSnelheid = 0;
          // Uitvaren is het natuurlijke rustpunt: handel gedaan, werf gehad,
          // scheepsvolk aangemonsterd. Hier bewaren scheelt de speler het verlies
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
      // Rustige witte wolken maken richting en snelheid van de gewone wind
      // zichtbaar; de donkere wolken hieronder horen alleen bij stormcellen.
      R.tekenWolken(c, w, cam, vw, vh, Game.tijd);
      // Stormwolken: donkere cumulus die met de wind meedrijven, óver het land
      // heen getekend zodat ze van veraf als dreiging zichtbaar zijn.
      R.tekenStormen(c, w, cam, vw, vh, Game.tijd);
      R.tekenKustEffecten(c, w, cam, vw, vh, Game.tijd);

      for (const p of sporen) R.tekenRook(c, p);

      for (const stad of w.steden) {
        if (Math.abs(stad.x - cam.x) * cam.zoom > vw / 2 + 140) continue;
        if (Math.abs(stad.y - cam.y) * cam.zoom > vh / 2 + 140) continue;
        R.tekenStad(c, stad, cam, Game.tijd, dist(stad.ankerX, stad.ankerY, s.x, s.y) < 140);
      }

      // Eén schaal voor élk schip, het eigene incluis, en dezelfde die de steden
      // gebruiken. Omdat `tekenSchip` L × schaal × zoom aan schermpixels
      // oplevert, was de oude factor 0,64 precies "schermpixels per rompeenheid":
      // een vreemde sloep werd vijftien pixels lang en het eigen schip
      // zevenendertig — stipjes, met al het houtwerk in de romp onzichtbaar, en
      // de kapitein twee en een half keer zo groot als de rest zonder dat daar
      // iets voor te zeggen viel.
      const scheepSchaal = R.wereldSchaal(cam.zoom);
      const spelerSchaal = scheepSchaal;

      const doeLandCheck = (wx, wy) => w.isLand(wx, wy);
      for (const v of w.vloten) {
        // Ruimer dan voorheen: een linieschip meet nu ruim honderd schermpixels
        // met zeilen en al, dus op 120 marge zou hij aan de rand wegknippen.
        if (Math.abs(v.x - cam.x) * cam.zoom > vw / 2 + 180) continue;
        if (Math.abs(v.y - cam.y) * cam.zoom > vh / 2 + 180) continue;
        R.tekenSchip(c, v.x, v.y, v.koers, v.type, v.natie, w.windRichting, {
          vaart: v.snelheid / 90,
          tijd: Game.tijd,
          geschut: v.geschut,
          schaal: scheepSchaal,
          isLand: doeLandCheck,
          zeegang: zeeWind,
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
          geschut: s.schepen[i].geschut,
          schaal: scheepSchaal,
          isLand: doeLandCheck,
          zeegang: zeeWind,
        });
      }
      R.tekenSchip(c, s.x, s.y, s.koers, schip.type, 'piraat', w.windRichting, {
        vaart: s.snelheid / 90,
        tijd: Game.tijd,
        zeilen: schip.zeilen,
        geschut: schip.geschut,
        schaal: spelerSchaal,
        isLand: doeLandCheck,
        rompFractie: schip.romp / schip.maxRomp,
        zeegang: zeeWind,
      });

      c.restore();

      // Zeeleven en storm: meeuwen cirkelen boven het water, regen jaagt bij
      // harde wind over het beeld — beide in schermruimte. Binnen een stormcel
      // waait en regent het zwaarder, ook zichtbaar op het scherm.
      R.tekenMeeuwen(c, vw, vh, Game.tijd);
      const stormLokaal = w.stormWind ? w.stormWind(s.x, s.y) : { richting: w.windRichting, kracht: w.windKracht };
      R.tekenRegen(c, vw, vh, stormLokaal.richting, stormLokaal.kracht, Game.tijd);
    },

    /**
     * HUD in schermcoördinaten, los van de wereld. Apart gehouden zodat een
     * eventueel miniatuureffect (tilt-shift) alleen de wereld vervaagt en de
     * HUD altijd scherp blijft.
     */
    tekenHud(c) {
      tekenHud(c, Game.speler, Game.wereld, cam, miniKaart, stormVeld, stormBelasting);
    },

    /**
     * De plek in het beeld waar het miniatuureffect scherp moet stellen. De
     * camera loopt vóór het schip uit en wordt tegen de wereldrand geklemd,
     * dus het schip staat lang niet altijd midden in beeld.
     */
    miniatuurFocus() {
      return {
        x: Game.breedte / 2 + (Game.speler.x - cam.x) * cam.zoom,
        y: Game.hoogte / 2 + (Game.speler.y - cam.y) * cam.zoom,
      };
    },
  };

  // --- Storm ---------------------------------------------------------------

  /**
   * De stormcel als spelmechanisme in plaats van als pech.
   *
   * Op de flank is een bui winst: de wind wakkert aan en draait met de cel mee,
   * dus wie zijn kant goed kiest vliegt eromheen. Pas binnen de kernrand keert
   * het — en dan niet met een worp achter je rug om, maar met een spanning die
   * zichtbaar oploopt. Je ziet hem komen, je kunt hem keren door zeil te
   * minderen of eruit te lopen, en pas als je hem helemaal laat vollopen breekt
   * er iets. Wie schade oploopt heeft dat zelf zien aankomen.
   */
  function werkStormBij(s, veld, dt) {
    const schip = vlaggenschip(s);
    const moe = MOEILIJKHEDEN.find((m) => m.id === s.moeilijkheid) || MOEILIJKHEDEN[1];
    // Weerglas (1) en fijn weerglas (2): de stuurman ziet de vlagen aankomen
    // en laat op tijd vieren.
    const weer = (schip.upgrades && schip.upgrades.weer) || 0;
    const demping = [0, 0.4, 0.65][Math.min(weer, 2)] || 0;

    // Wat de cel van het schip vraagt: dieper in de kern is zwaarder, en volle
    // zeilen vangen elke vlaag. Reven is daarmee een échte uitweg en niet enkel
    // uitstel — dat is de keuze die we de speler in handen willen geven.
    const last = clamp(
      veld.gevaar * (0.28 + 0.72 * schip.zeilen) * (moe.storm || 1) * (1 - demping),
      0,
      1.8
    );
    stormBelasting = clamp(stormBelasting + (last * STORM_OPBOUW - STORM_HERSTEL) * dt, 0, 1);
    audio.zetStorm(veld.nabij, veld.gevaar);

    // De overgang van voordelig naar gevaarlijk is het hele punt, dus die wordt
    // uitgesproken — in woord én in geluid.
    const fase = veld.gevaar > 0.02 ? 'kern' : veld.rug > 0.35 ? 'band' : 'buiten';
    if (fase !== stormFase) {
      if (fase === 'band' && stormFase === 'buiten') {
        Game.melding('Je pakt de rand van de bui — de wind valt vol in je zeilen!', 'goud');
        audio.sfx.stormRand();
      } else if (fase === 'kern') {
        Game.melding('Je loopt de kern in. Hier breekt het want.', 'rood');
        audio.sfx.stormKern();
      } else if (fase === 'buiten') {
        Game.melding('De bui laat je los.');
      }
      stormFase = fase;
    }

    // Twee waarschuwingen voordat er iets breekt, allebei met een uitweg erin.
    if (stormBelasting > 0.75 && stormWaarschuwing < 2) {
      stormWaarschuwing = 2;
      Game.melding('De stengen buigen door — reef, of je raakt ze kwijt!', 'rood');
      audio.sfx.kraak(1);
    } else if (stormBelasting > 0.42 && stormWaarschuwing < 1) {
      stormWaarschuwing = 1;
      Game.melding('Het want kraakt onder de vlagen. Minder zeil.', 'goud');
      audio.sfx.kraak(0);
    } else if (stormBelasting < 0.3) {
      stormWaarschuwing = 0;
    }

    if (stormBelasting >= 1) {
      // Het begeeft het. De schade volgt uit hoe lang je bent blijven staan, en
      // daarna is de spanning half weg: ruimte om eruit te lopen in plaats van
      // een maalstroom die je in één keer uitkleedt.
      stormBelasting = 0.5;
      stormWaarschuwing = 1;
      const verloren = Math.max(1, Math.round(s.scheepsvolk * 0.09));
      s.scheepsvolk = Math.max(6, s.scheepsvolk - verloren);
      // Naar rato van het schip: een vaste klap zou een sloep meteen halveren
      // en een linieschip nauwelijks raken.
      schip.romp = Math.max(10, schip.romp - Math.round(schip.maxRomp * (0.09 + veld.gevaar * 0.06)));
      // Het schip reeft zichzelf: de zeilen zíjn eraf gescheurd.
      schip.zeilen = Math.min(schip.zeilen, 0.45);
      Game.melding(`Een ra breekt: ${verloren} man overboord en de romp lekt.`, 'rood');
      audio.sfx.ramp();
    }
  }

  // --- Weer ----------------------------------------------------------------

  /**
   * Zegt het wanneer het weer omslaat. De wind draait met hooguit 0,11 radiaal
   * per seconde: te traag om te zien, en het enige spoor was een cijfer in de
   * balk dat niemand met zijn vaart in verband brengt. Nu meldt de uitkijk het,
   * en dan kijk je naar de windroos.
   *
   * Alleen bij een echte omslag — een ander kompaspunt, een andere windkracht —
   * en met een koeling ertussen, anders staat het scherm vol zodra de wind
   * precies op een grens hangt. De kracht wordt aan de gestage wind (`windBasis`)
   * afgemeten en niet aan de vlagen, want die ademen om elke grens heen.
   */
  function meldWeer(w, dt) {
    windMeldKoeling -= dt;
    const hoek = compassName(normAngle(w.windRichting + Math.PI));
    const band = windBand(w.windBasis != null ? w.windBasis : w.windKracht);
    if (gemeldeWindhoek === null) {
      gemeldeWindhoek = hoek;
      gemeldeWindkracht = band;
      return;
    }
    if (windMeldKoeling > 0) return;
    if (band !== gemeldeWindkracht) {
      const woord = WIND_BANDEN[band][1];
      Game.melding(
        band > gemeldeWindkracht ? `De wind wakkert aan tot ${woord}.` : `De wind zakt naar ${woord}.`,
        band >= 3 ? 'rood' : 'goud'
      );
      gemeldeWindkracht = band;
      gemeldeWindhoek = hoek;
      windMeldKoeling = 18;
      return;
    }
    if (hoek !== gemeldeWindhoek) {
      Game.melding(`De wind loopt naar het ${hoek}.`);
      gemeldeWindhoek = hoek;
      windMeldKoeling = 18;
    }
  }

  // --- Gebeurtenissen -----------------------------------------------------

  function dagWisseling(s, w) {
    const schip = vlaggenschip(s);
    const nodig = Math.max(1, Math.round(s.scheepsvolk / 22));
    if (schip.lading[PROVIAND] >= nodig) {
      schip.lading[PROVIAND] -= nodig;
      s.geest = clamp(s.geest - 0.35, 0, 100);
    } else {
      schip.lading[PROVIAND] = 0;
      s.geest = clamp(s.geest - 4, 0, 100);
      if (hongerKoeling <= 0) {
        hongerKoeling = 20;
        Game.melding('De proviand is op! Het scheepsvolk mort.', 'rood');
        audio.sfx.fout();
      }
    }
    // De scheepstimmerman lapt onderweg de romp op.
    if (talentBonus(s, 'scheepstimmerman') && schip.romp < schip.maxRomp) {
      schip.romp = Math.min(schip.maxRomp, schip.romp + 0.6);
    }
    if (s.geest < 12 && Math.random() < 0.2) muiterij(s);
    // De jaren gaan tellen: het volk begint erover, lang voordat een haven het
    // hardop zegt.
    if (s.leeftijd >= PENSIOEN_HINT && Math.random() < 0.012) {
      Game.melding(pick(Math.random, OUDERDOM_MELDINGEN), 'goud');
    }
  }

  function muiterij(s) {
    const weg = Math.max(1, Math.round(s.scheepsvolk * 0.18));
    s.scheepsvolk = Math.max(6, s.scheepsvolk - weg);
    s.geest = clamp(s.geest + 14, 0, 100);
    Game.melding(`${weg} man is bij de eerste gelegenheid gedrost.`, 'rood');
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

  /**
   * De uitkijk ziet weer aankomen. Dit was een gok met de romp van de speler —
   * een derde kans op zware schade waar niets aan te doen viel. Nu is het een
   * vooruitzicht: de wind draait en wakkert aan, en er drijft een cel jouw kant
   * op. Wat die cel je kost of oplevert bepaal je zelf, door hoe je erlangs
   * vaart. Een weerglas aan boord vertelt er meteen bij welke kant de goede is.
   */
  async function gebeurtenisStorm(s) {
    if (UI.ietsOpen()) return;
    const wereld = Game.wereld;
    // Dit moet op de *doelen* werken en niet op `windKracht` zelf: die wordt
    // elke tik opnieuw uit basis en vlagen samengesteld, dus een rechtstreekse
    // waarde was binnen één beeld weer weg — en zolang dit scherm openstaat
    // staat de wereld stil, dus je zou die harde wind nooit hebben gevaren.
    wereld.krachtDoel = clamp(wereld.windBasis + 0.8, 1.2, 2);
    wereld.windDoel = Math.random() * TAU;
    // De opsteker mag even blijven staan; pas daarna zoekt het weer zijn gang.
    wereld.windTimer = Math.max(wereld.windTimer, 45);

    // De dichtstbijzijnde cel opzoeken, zodat de uitkijk kan zeggen waar hij
    // ligt in plaats van dat er zomaar iets gebeurt.
    let dichtst = null,
      dichtstD = Infinity;
    for (const cel of wereld.stormen || []) {
      const d = dist(cel.x, cel.y, s.x, s.y);
      if (d < dichtstD) {
        dichtstD = d;
        dichtst = cel;
      }
    }
    const weer = (vlaggenschip(s).upgrades && vlaggenschip(s).upgrades.weer) || 0;
    let waar = 'Ergens voor de boeg pakt zich iets samen.';
    if (dichtst) {
      const kant = compassName(Math.atan2(dichtst.y - s.y, dichtst.x - s.x));
      // De geografische mijl volgt de kaartschaal: met de grotere PPD is de
      //zelfde afstand in wereldeenheden nu meer zeemijlen.
      const mijl = Math.round(dichtstD / 8 / 1.786);
      waar = `Een zwarte muur in het ${kant}, een mijl of ${mijl}.`;
      if (weer > 0) {
        waar += (dichtst.draaiing || 1) > 0
          ? ' Het weerglas zegt: hij draait met de klok mee — houd hem aan bakboord en hij duwt je vooruit.'
          : ' Het weerglas zegt: hij draait tegen de klok in — houd hem aan stuurboord en hij duwt je vooruit.';
      }
    }
    await UI.vraag(
      'De hemel betrekt',
      `${waar} De wind springt om en zwelt aan. Langs de rand van zo'n bui loop je ` +
        `harder dan je ooit op open zee komt — maar wie de kern in vaart, breekt zijn want.`,
      [{ label: 'Begrepen', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
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
      const verloren = Math.round(s.scheepsvolk * 0.1);
      s.scheepsvolk = Math.max(6, s.scheepsvolk - verloren);
      s.geest = clamp(s.geest - 8, 0, 100);
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
        { label: `Inkopen (${fmtGold(prijs)} p.e.)`, waarde: 'koop', uit: maxKoop <= 0 },
        { label: 'Doorzeilen', waarde: 'weg' },
      ],
      { figuur: 'zeeman' }
    );
    if (keuze !== 'koop') return;
    const schip = vlaggenschip(s);
    const ruimVrij = SCHIP_INDEX[schip.type].ruim - schip.lading.reduce((a, b) => a + b, 0) - schip.geschut * 2;
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
      'Sloep in nood',
      `Een sloep met een gescheurd zeil roept om hulp. Acht man zwaaien. ` +
        'De kapitein belooft een beloning als je hen aan land brengt.',
      [
        { label: 'Langszij komen', waarde: 'op' },
        { label: 'Doorzeilen', waarde: 'weg' },
      ],
      { figuur: 'zeeman' }
    );
    if (keuze !== 'op') return;
    // Soms zijn het juist een stel piraten.
    if (Math.random() < 0.2) {
      const verloren = Math.round(s.scheepsvolk * 0.15);
      s.scheepsvolk = Math.max(6, s.scheepsvolk - verloren);
      s.goud = Math.max(0, s.goud - Math.round(s.goud * 0.1));
      s.geest = clamp(s.geest - 10, 0, 100);
      Game.melding('Het waren piraten! Ze sloegen toe en gingen er met een deel van de buit vandoor.', 'rood');
      audio.sfx.ramp();
    } else {
      const beloning = Math.round(300 + Math.random() * 900);
      s.goud += beloning;
      s.roem += 4;
      s.geest = clamp(s.geest + 4, 0, 100);
      Game.melding(`De geredde kapitein betaalt ${fmtGold(beloning)} goudstukken.`, 'goud');
      audio.sfx.munt();
    }
  }

  function gebeurtenisDolfijnen(s) {
    if (UI.ietsOpen()) return;
    s.geest = clamp(s.geest + 2, 0, 100);
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
        `${metLidwoord(vloot.type, true)} draagt ${vloot.geschut} stukken geschut en ` +
        `${vloot.scheepsvolk} koppen. ${legende.verhaal}<br><br>Ze houden recht op je aan.`
      : `Aan de horizon doemt een <b>${scheepsAanduiding(vloot.natie, vloot.type)}</b> op, ` +
        `naar schatting ${vloot.geschut} stukken geschut en ${vloot.scheepsvolk} koppen aan boord.` +
        (vijandig ? ' Ze zetten koers naar jóu toe.' : '');

    const keuzes = [
      { label: 'De jacht openen', waarde: 'aanval', soort: 'gevaar' },
      { label: 'Praaien', waarde: 'roep' },
      { label: 'Doorzeilen', waarde: 'weg' },
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
      // Wegvaren lukt niet altijd tegen een sneller schip. De deler volgt de
      // kleinere snelheidsspreiding van de herschaalde schepen.
      const mijn = SCHIP_INDEX[vlaggenschip(s).type];
      const kans = clamp(0.45 + (mijn.snelheid - type.snelheid) / 39, 0.1, 0.95);
      if (vijandig && Math.random() > kans) {
        await UI.vraag(
          'Ze halen je in',
          'Hun boegspriet is al bijna binnen schootsafstand. Ontsnappen zit er niet in.',
          [{ label: 'Klaar voor de volle laag', waarde: 'ok', soort: 'gevaar' }]
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
        s.geest = clamp(s.geest - 6, 0, 100);
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
    s.geest = clamp(s.geest + 12, 0, 100);
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

  return scene;
}

// --- Wind in woorden ------------------------------------------------------

/**
 * De windkracht in zeemanstaal. De grenzen doen dubbel dienst: ze benoemen het
 * weer in de HUD én ze zijn de drempels waarop de scène meldt dat het omslaat.
 */
const WIND_BANDEN = [
  [0.72, 'flauwe koelte'],
  [0.98, 'kalme bries'],
  [1.24, 'stevige bries'],
  [1.55, 'stijve bries'],
  [Infinity, 'stormweer'],
];

export function windBand(kracht) {
  for (let i = 0; i < WIND_BANDEN.length; i++) if (kracht < WIND_BANDEN[i][0]) return i;
  return WIND_BANDEN.length - 1;
}

export const windWoord = (kracht) => WIND_BANDEN[windBand(kracht)][1];

/**
 * Hoe je ten opzichte van de wind vaart, met de kleur die daarbij hoort.
 * `a` is de hoek tussen de koers en de richting waarheen de wind waait:
 * 0 = pal voor de wind, PI = er pal tegenin.
 */
// De kleuren zijn donker: ze staan op perkament, niet meer op donkerblauw.
// Lichte tinten waren op de oude HUD leesbaar en zijn dat op de nieuwe niet.
export function zeilWoord(koers, windRichting) {
  const a = Math.abs(normAngle(koers - windRichting));
  if (a < 0.38) return { woord: 'pal voor de wind', kleur: '#4a6b3c' };
  if (a < 1.2) return { woord: 'ruime wind', kleur: '#3f7a35' };
  if (a < 1.95) return { woord: 'halve wind', kleur: '#7a6a3a' };
  if (a < 2.62) return { woord: 'bij de wind', kleur: '#a06a1c' };
  return { woord: 'de zeilen killen', kleur: '#9c3a2c' };
}

// --- HUD ------------------------------------------------------------------

function tekenHud(c, s, w, cam, miniKaart, storm, belasting) {
  const vw = Game.breedte,
    vh = Game.hoogte;
  const schip = vlaggenschip(s);
  const type = SCHIP_INDEX[schip.type];

  // Bovenbalk: een strook perkament met een messing lijst eronder. Alles in
  // deze HUD put uit `R.HUD`, dezelfde kleuren als de perkamentpanelen — anders
  // zie je twee verschillende spellen achter elkaar zodra er een scherm opengaat.
  c.save();
  const strook = c.createLinearGradient(0, 0, 0, 44);
  strook.addColorStop(0, R.HUD.perkament);
  strook.addColorStop(1, R.HUD.perkamentDiep);
  c.fillStyle = strook;
  c.fillRect(0, 0, vw, 44);
  c.fillStyle = 'rgba(255,252,240,0.4)';
  c.fillRect(0, 0, vw, 1);
  c.fillStyle = R.HUD.goud;
  c.fillRect(0, 42.6, vw, 2);
  c.fillStyle = 'rgba(60,44,22,0.25)';
  c.fillRect(0, 44.6, vw, 1);

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
    ['volk', `${s.scheepsvolk}`],
    ['proviand', `${schip.lading[WAAR_INDEX.proviand]}`],
  ];
  let x = 24;
  for (const [icoon, tekst] of items) {
    c.fillStyle = R.HUD.inktZacht;
    R.tekenIcoon(c, icoon, x, 22, 8);
    x += 15;
    c.fillStyle = R.HUD.inkt;
    c.fillText(tekst, x, 22);
    x += c.measureText(tekst).width + 24;
  }

  // Rompbalk rechtsboven.
  const bw = 130;
  const rf = clamp(schip.romp / schip.maxRomp, 0, 1);
  R.hudBalk(c, vw - bw - 16, 13, bw, 18, rf, R.hudStand(rf), null);
  c.font = '600 11px Georgia, serif';
  c.textAlign = 'center';
  c.fillStyle = R.HUD.inkt;
  c.fillText('ROMP', vw - bw / 2 - 16, 22.5);
  c.restore();

  // Windroos.
  R.tekenWindroos(c, vw - 62, 104, 42, w.windRichting, w.windKracht, Game.tijd);

  // Stormvak: alleen zichtbaar zolang je in een cel zit, en dan meteen het
  // belangrijkste — waar je bent en hoeveel spanning erop staat. Zonder deze
  // balk zou de kern alsnog als willekeur voelen.
  if (storm && storm.nabij > 0.04) {
    const sh = storm.gevaar > 0.02;
    c.save();
    R.hudPaneel(c, 16, vh - 172, 168, 54, 8);
    c.font = '600 11px Georgia, serif';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = R.HUD.inktZacht;
    c.fillText('BUI', 28, vh - 154);
    c.textAlign = 'right';
    c.fillStyle = sh ? R.HUD.rood : R.HUD.inkt;
    c.fillText(sh ? 'in de kern' : storm.rug > 0.35 ? 'rugwind' : 'buitenrand', 172, vh - 154);
    // De belastingbalk. Hij loopt alleen op in de kern en zakt zodra je reeft
    // of eruit loopt, dus wat je ziet is precies wat er gaat gebeuren.
    const b = clamp(belasting || 0, 0, 1);
    R.hudBalk(c, 28, vh - 142, 144, 10, b, b > 0.75 ? R.HUD.rood : b > 0.42 ? R.HUD.goud : R.HUD.groen);
    c.textAlign = 'left';
    c.fillStyle = R.HUD.inktZacht;
    c.fillText(b > 0.42 ? 'want onder spanning' : 'want houdt het', 28, vh - 126);
    c.restore();
  }

  // Zeilstand.
  c.save();
  R.hudPaneel(c, 16, vh - 76, 168, 58, 8);
  c.font = '600 11px Georgia, serif';
  c.textBaseline = 'middle';
  c.fillStyle = R.HUD.inktZacht;
  c.textAlign = 'left';
  c.fillText('ZEILVOERING', 28, vh - 58);
  // Hoe je ten opzichte van de wind ligt, in woord en kleur. Eén blik leert je
  // dat afvallen loont — daar is geen getal voor nodig.
  const trim = zeilWoord(s.koers, lokaal.richting);
  c.textAlign = 'right';
  c.fillStyle = trim.kleur;
  c.fillText(trim.woord, 172, vh - 58);
  R.hudBalk(c, 28, vh - 48, 144, 12, schip.zeilen, trim.kleur);
  c.textAlign = 'left';
  c.fillStyle = R.HUD.inkt;
  c.fillText(`${(s.snelheid / 8).toFixed(1)} knopen`, 28, vh - 27);
  c.textAlign = 'right';
  c.fillStyle = R.HUD.inktZacht;
  c.fillText(windWoord(lokaal.kracht), 172, vh - 27);
  c.restore();

  // Minikaart in een messing lijst.
  if (miniKaart) {
    const mw = 210;
    const mh = Math.round((mw * WORLD_H) / WORLD_W);
    const mx = vw - mw - 16,
      my = vh - mh - 16;
    c.save();
    R.hudPaneel(c, mx - 6, my - 6, mw + 12, mh + 12, 6);
    c.drawImage(miniKaart, mx, my, mw, mh);
    c.strokeStyle = 'rgba(60,44,22,0.55)';
    c.lineWidth = 1;
    c.strokeRect(mx - 0.5, my - 0.5, mw + 1, mh + 1);
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
      R.natieStip(c, mx + stad.x * sc, my + stad.y * sc, stad.natie, 2.4);
    }
    c.fillStyle = '#ffe28a';
    c.strokeStyle = '#3a2a18';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(mx + s.x * sc, my + s.y * sc, 3.4, 0, TAU);
    c.fill();
    c.stroke();
    c.restore();
  }

  // Bedieningshulp, op een eigen strookje zodat hij op elke ondergrond leesbaar
  // blijft; als losse lichte letters verdween hij in het schuim langs de kust.
  c.save();
  c.font = '11px Georgia, serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const hulp = '← → roer · ↑ ↓ zeil · klik = koers · U uitkijk · K anker · M kaart · S schip · C scheepsvolk · Esc raad';
  const hw = c.measureText(hulp).width;
  R.hudPaneel(c, 16, vh - 104, hw + 24, 20, 4);
  c.fillStyle = R.HUD.inktZacht;
  c.fillText(hulp, 28, vh - 93.5);
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
