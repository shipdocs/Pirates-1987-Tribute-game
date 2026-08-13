// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De vaarscène. Hier vervangt het getij de wind: stroom die kentert, diepgang
// die met je lading meeloopt, squat die je omlaag trekt naarmate je harder
// vaart, en sluizen die je tijd kosten. De klok is de tegenstander.

import { clamp, dist, normAngle, fmtGold } from './util.js';
import { BOOT_INDEX, VAARREGIMES, productVan, opbouwhoogteVan } from './data.js';
import { Spel, diepgang, tankTotaal, moeilijkVan, bewaar } from './spel.js';
import * as R from './render/kaart.js';
import * as S from './render/schepen.js';
import * as H from './render/hud.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

// De drie tijdstanden. Manoeuvreren op ×1, varen op ×40; daar tussenin een
// stand voor druk vaarwater. Zichtbaar in de HUD, want een klok die ongemerkt
// van snelheid wisselt maakt elke inschatting onbetrouwbaar.
const TIJDSTANDEN = [1, 10, 40];
/** Boven deze stand stuurt de boot trager mee dan de klok loopt; anders is hij
 *  op de hoogste stand niet meer te sturen binnen een geul van 200 meter. */
const STUUR_PLAFOND = 12;
/** Binnen deze afstand van een beslispunt valt de tijd vanzelf terug naar ×1. */
const REMAFSTAND = 500;

const DUW = 0.45; // versnelling in m/s²
const WEND = 0.030; // radialen per seconde bij volle vaart

export function maakVaarScene() {
  const cam = { x: 0, y: 0, zoom: R.WARE_ZOOM };
  const sporen = [];
  let drift = { x: 0, y: 0 };
  let tijdStand = 2;
  let autoRem = false;
  let grondTimer = 0;
  let laatsteAanroep = 0;

  const scene = {
    cam,

    betreed() {
      const s = Spel.schipper;
      cam.x = s.x;
      cam.y = s.y;
      audio.zetPomp(0);
    },

    verlaat() {
      audio.stilte();
    },

    /** De scherpe plek van het miniatuureffect zit pal op de boot. */
    miniatuurFocus() {
      const [x, y] = R.naarScherm(cam, Spel.schipper.x, Spel.schipper.y, Spel.breedte, Spel.hoogte);
      return { x, y };
    },

    werkBij(dt) {
      // Zodra er een scherm open staat, staat de wereld stil. Zonder dit loopt
      // de klok door terwijl de speler een dialoog leest — en dat is precies hoe
      // je een venster misloopt zonder dat je iets fout deed.
      if (UI.ietsOpen()) return;
      const s = Spel.schipper;
      const w = Spel.wereld;
      const vw = w.vaarwater;
      const type = BOOT_INDEX[s.boot.type];

      // --- Tijdschaal ---
      const doelPlaats = s.order ? vw.ligIndex[s.order.ligplaats] : null;
      const dichtbijSluis = vw.sluisOp(s.x, s.y, REMAFSTAND * 2);
      const dichtbijDoel = doelPlaats && dist(s.x, s.y, doelPlaats.x, doelPlaats.y) < REMAFSTAND * 2;
      const verkeerNabij = w.verkeerOp(s.x, s.y, 400);
      autoRem = !!(dichtbijSluis || dichtbijDoel || verkeerNabij);
      const stand = autoRem ? 1 : TIJDSTANDEN[tijdStand];
      const dtSpel = dt * stand; // speelseconden
      const dtStuur = dt * Math.min(stand, STUUR_PLAFOND);

      // --- Besturing ---
      const gasOp = Spel.toets('KeyW') || Spel.toets('ArrowUp');
      const gasAf = Spel.toets('KeyS') || Spel.toets('ArrowDown');
      if (gasOp) s.gas = clamp(s.gas + dt * 0.8, -0.35, 1);
      if (gasAf) s.gas = clamp(s.gas - dt * 0.8, -0.35, 1);
      const bb = Spel.toets('KeyA') || Spel.toets('ArrowLeft');
      const sb = Spel.toets('KeyD') || Spel.toets('ArrowRight');
      const roerDoel = (bb ? -1 : 0) + (sb ? 1 : 0);
      s.roer += (roerDoel - s.roer) * clamp(dt * 4, 0, 1);

      // --- Diepte, getij en squat ---
      const gevuld = tankTotaal(s.boot);
      const dg = diepgang(s.boot);
      const bodem = vw.diepte(s.x, s.y);
      const tij = w.getijBij(s.x, s.y);
      const snelheid = Math.abs(s.snelheid);
      // Squat: het schip zakt dieper naarmate het harder vaart in ondiep water.
      // Dit is de squatbalk, de directe opvolger van de spanning in het want:
      // hij loopt op met gas en zakt zodra je terugneemt.
      const ondiepte = bodem ? clamp(dg / Math.max(0.5, bodem + tij), 0.15, 1.4) : 0.2;
      const squat = 0.030 * snelheid * snelheid * ondiepte;
      const kielspeling = bodem === null ? -1 : bodem + tij - dg - squat;
      scene.kielspeling = kielspeling;
      scene.squat = squat;

      // --- Voortstuwing ---
      const maxV = type.snelheid * (1 - clamp(gevuld / type.tank, 0, 1) * 0.12);
      // Ondiep water remt: minder water onder de kiel kost vaart.
      const remOndiep = kielspeling > 0 && kielspeling < 1.2 ? 0.72 + kielspeling * 0.23 : 1;
      const doelV = maxV * s.gas * remOndiep;
      s.snelheid += clamp(doelV - s.snelheid, -DUW * dtSpel, DUW * dtSpel);

      // Draaien: een geladen bak draait trager, en zonder vaart draait hij niet.
      const wend = WEND * (1 + (s.boot.verbeteringen.roer || 0) * 0.18)
        * clamp(Math.abs(s.snelheid) / 2.2, 0.15, 1.2)
        * (1 - clamp(gevuld / type.tank, 0, 1) * 0.22);
      s.koers = normAngle(s.koers + s.roer * wend * dtStuur * (s.snelheid < 0 ? -1 : 1));

      // --- Stroom en oevereffect ---
      const stroom = w.stroomBij(s.x, s.y);
      scene.stroom = stroom;
      const as = vw.as(s.x, s.y);
      let zuigX = 0;
      let zuigY = 0;
      if (as && as.fractie > 0.55) {
        // Oevereffect: te dicht langs de kant zuigt het schip naar de wal, en
        // dat wordt sterker met het kwadraat van de vaart. Dezelfde vorm als de
        // squat, maar dan zijwaarts. `as.zijde` zegt aan wélke kant we zitten;
        // de zuiging wijst naar díe kant, want je wordt naar de dichtstbijzijnde
        // oever getrokken en niet naar een willekeurige.
        const kracht = ((as.fractie - 0.55) / 0.45) * snelheid * snelheid * 0.010;
        const dwars = as.richting + (Math.PI / 2) * as.zijde;
        zuigX = Math.cos(dwars) * kracht;
        zuigY = Math.sin(dwars) * kracht;
        scene.zuiging = kracht;
      } else {
        scene.zuiging = 0;
      }

      const nx = s.x + (Math.cos(s.koers) * s.snelheid + stroom.vx + zuigX) * dtSpel;
      const ny = s.y + (Math.sin(s.koers) * s.snelheid + stroom.vy + zuigY) * dtSpel;

      // --- Aan de grond ---
      const nieuweDiepte = vw.diepte(nx, ny);
      const nieuwTij = w.getijBij(nx, ny);
      const kanDaar = nieuweDiepte !== null && nieuweDiepte + nieuwTij - dg - squat > 0;
      if (kanDaar) {
        s.x = nx;
        s.y = ny;
      } else {
        grondTimer -= dt;
        if (grondTimer <= 0) {
          grondTimer = 3;
          audio.sfx.stoot(0.8);
          Spel.melding(nieuweDiepte === null ? 'Je zit tegen de wal.' : 'Te weinig water — je raakt de bodem.', 'rood');
          s.boot.schade = Math.min(100, (s.boot.schade || 0) + 1.5 * moeilijkVan(s).streng);
        }
        s.snelheid *= 0.3;
        // Terugduwen naar dieper water zodat je niet vast blijft zitten.
        const [vx, vy] = vw.dichtstbijWater(s.x, s.y, 900);
        const hoek = Math.atan2(vy - s.y, vx - s.x);
        s.x += Math.cos(hoek) * 6 * dt * 60;
        s.y += Math.sin(hoek) * 6 * dt * 60;
      }

      // --- De klok en de wereld ---
      w.verstrijk(dtSpel / 60);
      // Vaartijd loopt alleen terug terwijl je werkelijk vaart.
      if (Math.abs(s.snelheid) > 0.4) s.vaartijd -= dtSpel / 60;
      const dagNu = Math.floor(w.tijd / 1440);
      if (dagNu !== s.laatsteDag) {
        s.laatsteDag = dagNu;
        const regime = VAARREGIMES.find((r) => r.id === s.regime) || VAARREGIMES[0];
        s.vaartijd = regime.uren * 60;
        s.geld -= regime.loon;
        Spel.melding(`Nieuwe dag. Gage betaald: ${fmtGold(regime.loon)}.`);
      }
      if (s.vaartijd <= 0 && Math.abs(s.snelheid) > 0.4) {
        s.gas = 0;
        s.snelheid *= 0.9;
        if (Spel.tijd - laatsteAanroep > 6) {
          laatsteAanroep = Spel.tijd;
          Spel.melding('Vaartijd op. Je moet de nacht doorliggen (T).', 'rood');
        }
      }

      // --- Mist ---
      if (w.isGestremd(s.x, s.y) && Math.abs(s.snelheid) > 1.2) {
        s.snelheid *= 0.985;
        if (Spel.tijd - laatsteAanroep > 8) {
          laatsteAanroep = Spel.tijd;
          Spel.melding('Verkeerspost: zicht te slecht, verkeer gestremd.', 'rood');
          audio.sfx.marifoon();
        }
      }

      // --- Camera en beeld ---
      // Kijk een stukje vooruit; op hogere vaart verder, zodat je bochten en
      // kunstwerken op tijd ziet aankomen.
      const vooruit = clamp(s.snelheid * 26, 0, 700);
      const doelX = s.x + Math.cos(s.koers) * vooruit;
      const doelY = s.y + Math.sin(s.koers) * vooruit;
      cam.x += (doelX - cam.x) * clamp(dt * 2.4, 0, 1);
      cam.y += (doelY - cam.y) * clamp(dt * 2.4, 0, 1);

      // De rimpeling schuift op met de gemeten stroom, per frame geïntegreerd.
      // Nooit `tijd × snelheid`: dat is een positie die uit de hùidige stroom
      // volgt, dus elke kentering zou het hele patroon laten verspringen.
      drift.x += stroom.vx * dtSpel * 0.35;
      drift.y += stroom.vy * dtSpel * 0.35;

      S.werkKielzogBij(sporen, s, dt, Math.abs(s.snelheid));
      audio.zetMotor(Math.abs(s.gas));
    },

    scroll(dy) {
      cam.zoom = clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), R.MIN_ZOOM, R.MAX_ZOOM);
    },

    toets(code) {
      if (UI.ietsOpen()) return;
      const s = Spel.schipper;
      if (code === 'Digit1') tijdStand = 0;
      if (code === 'Digit2') tijdStand = 1;
      if (code === 'Digit3') tijdStand = 2;
      if (code === 'KeyE') scene.handel();
      if (code === 'KeyT') scene.overnachten();
      if (code === 'KeyM') scene.toonKaart();
      if (code === 'KeyO') import('./wal.js').then((m) => m.toonOrderbord());
      if (code === 'Escape') scene.menu();
      if (code === 'KeyR' && s.order) {
        import('./wal.js').then((m) => m.toonReisplan());
      }
    },

    /**
     * De contextknop. Eén toets die doet wat op deze plek logisch is: schutten
     * bij een sluis, laden bij een terminal, langszij bij je klant. Zo hoeft de
     * speler geen menu te leren voor iets wat uit de plek al volgt.
     */
    handel() {
      const s = Spel.schipper;
      const w = Spel.wereld;
      const vw = w.vaarwater;

      const sluis = vw.sluisOp(s.x, s.y, 900);
      if (sluis) return scene.schutten(sluis.sluis);

      const lig = vw.ligplaatsOp(s.x, s.y, 450);
      if (lig && lig.plaats.soort === 'terminal') {
        return import('./wal.js').then((m) => m.toonTerminal(lig.plaats));
      }
      if (lig && s.order && lig.plaats.id === s.order.ligplaats) {
        if (Math.abs(s.snelheid) > 1.6) {
          Spel.melding('Te veel vaart om langszij te gaan. Neem gas terug.', 'rood');
          return null;
        }
        return import('./langszij.js').then((m) => m.startLangszij());
      }
      if (lig) {
        Spel.melding(`${lig.plaats.naam} — hier heb je nu niets te doen.`);
        return null;
      }
      Spel.melding('Niets in de buurt om aan te leggen.');
      return null;
    },

    /** Schutten: wachten tot je aan de beurt bent, en dan door. */
    schutten(sluis) {
      const s = Spel.schipper;
      const w = Spel.wereld;
      const wacht = w.wachttijd(sluis.id);
      const dg = diepgang(s.boot);
      if (dg > sluis.diepte) {
        UI.vraag(sluis.naam, `Je ligt ${dg.toFixed(2)} m diep; de sluis laat ${sluis.diepte.toFixed(1)} m toe. Zo kom je er niet door.`,
          [{ label: 'Terug', waarde: null, esc: true }], { figuur: 'sluis' });
        return;
      }
      UI.vraag(sluis.naam,
        `Er liggen schepen voor je. De verwachte wachttijd is <b>${wacht} minuten</b>.`
        + (sluis.zeevaart ? '<br><br>De grote vaart gaat voor; reken op uitloop.' : '')
        + `<br><br>Het is nu ${w.klok()}. Je bent er dan omstreeks <b>${w.klok(w.tijd + wacht)}</b>.`,
        [
          { label: `Aanmelden en schutten (${wacht} min)`, waarde: 'schut' },
          { label: 'Omvaren', waarde: null, esc: true },
        ], { figuur: 'sluis' }).then((keuze) => {
        if (keuze !== 'schut') return;
        audio.sfx.sluis();
        w.verstrijk(wacht + sluis.cyclus / sluis.kolken);
        s.vaartijd -= 10;
        Spel.melding(`Geschut. Het is nu ${w.klok()}.`);
        // Aan de andere kant van de sluis zetten: een stukje verder langs de
        // vaarweg waar de sluis in ligt.
        const weg = w.vaarwater.wegIndex[sluis.vaarweg];
        if (weg) {
          const eind = weg.pts[weg.pts.length - 1];
          const begin = weg.pts[0];
          const naarEind = dist(s.x, s.y, begin[0], begin[1]) < dist(s.x, s.y, eind[0], eind[1]);
          const doel = naarEind ? eind : begin;
          const hoek = Math.atan2(doel[1] - s.y, doel[0] - s.x);
          s.x += Math.cos(hoek) * 900;
          s.y += Math.sin(hoek) * 900;
          s.koers = hoek;
        }
      });
    },

    /** Doorliggen tot de volgende ochtend: de vaartijd loopt weer vol. */
    overnachten() {
      const s = Spel.schipper;
      const w = Spel.wereld;
      if (Math.abs(s.snelheid) > 0.5) {
        Spel.melding('Eerst stilliggen.');
        return;
      }
      const nu = w.tijd % 1440;
      const tot = nu < 6 * 60 ? 6 * 60 - nu : 1440 - nu + 6 * 60;
      UI.vraag('Doorliggen', `Afmeren en doorliggen tot morgenochtend 06:00 — dat is ${Math.round(tot / 60)} uur.`
        + '<br><br>De wereld draait door: de markt beweegt, orders komen en gaan, en het tij loopt zijn rondje.',
        [
          { label: 'Doorliggen', waarde: 'ja' },
          { label: 'Toch niet', waarde: null, esc: true },
        ], { figuur: 'boot' }).then((k) => {
        if (k !== 'ja') return;
        w.verstrijk(tot);
        const regime = VAARREGIMES.find((r) => r.id === s.regime) || VAARREGIMES[0];
        s.vaartijd = regime.uren * 60;
        s.laatsteDag = Math.floor(w.tijd / 1440);
        bewaar();
        Spel.melding('Uitgerust. Nieuwe dag, volle vaartijd.', 'groen');
      });
    },

    toonKaart() {
      import('./wal.js').then((m) => m.toonOverzicht());
    },

    menu() {
      UI.vraag('Aan boord', 'Wat wil je doen?', [
        { label: 'Orderbord (O)', waarde: 'order' },
        { label: 'Overzichtskaart (M)', waarde: 'kaart' },
        { label: 'Opslaan', waarde: 'bewaar' },
        { label: 'Verder varen', waarde: null, esc: true },
      ], { figuur: 'boot' }).then((k) => {
        if (k === 'order') import('./wal.js').then((m) => m.toonOrderbord());
        if (k === 'kaart') scene.toonKaart();
        if (k === 'bewaar') {
          const gelukt = bewaar();
          Spel.melding(gelukt ? 'Opgeslagen.' : 'Opslaan mislukt.', gelukt ? 'groen' : 'rood');
        }
      });
    },

    teken(c) {
      const s = Spel.schipper;
      const w = Spel.wereld;
      const vw = Spel.breedte;
      const vh = Spel.hoogte;
      const isDag = w.isDag();

      R.tekenWereld(c, w, cam, vw, vh, isDag);
      R.tekenIndustrie(c, w, cam, vw, vh, isDag);
      R.tekenRimpeling(c, w, cam, vw, vh, drift, isDag);
      if (!isDag) R.tekenLichten(c, w, cam, vw, vh, Spel.tijd);
      R.tekenKunstwerken(c, w, cam, vw, vh, isDag, s.order ? s.order.ligplaats : null);
      S.tekenKielzog(c, sporen, cam, vw, vh);
      S.tekenVerkeer(c, w, cam, vw, vh, Spel.tijd);
      S.tekenEigenBoot(c, w, s, cam, vw, vh, Spel.tijd);
      R.tekenZicht(c, w.zichtBij(s.x, s.y), vw, vh, isDag);
      R.tekenVignet(c, vw, vh);
    },

    tekenHud(c) {
      const s = Spel.schipper;
      const w = Spel.wereld;
      const vw = Spel.breedte;
      const vh = Spel.hoogte;
      const type = BOOT_INDEX[s.boot.type];
      const stand = autoRem ? 1 : TIJDSTANDEN[tijdStand];

      // --- Linksboven: klok, geld, order ---
      H.paneel(c, 14, 14, 268, s.order ? 128 : 86);
      c.textBaseline = 'middle';
      H.regel(c, 26, 32, 244, w.datum(), `×${stand}${autoRem ? ' (rem)' : ''}`,
        autoRem ? H.HUD.let : H.HUD.tekstZacht);
      H.regel(c, 26, 50, 244, 'Kas', fmtGold(Math.round(s.geld)),
        s.geld < 0 ? H.HUD.slecht : H.HUD.tekst);
      const uren = Math.max(0, s.vaartijd) / 60;
      H.regel(c, 26, 68, 244, 'Vaartijd over', `${uren.toFixed(1)} u`,
        uren < 2 ? H.HUD.slecht : uren < 4 ? H.HUD.let : H.HUD.tekst);
      if (s.order) {
        const o = s.order;
        const rest = o.sluit - w.tijd;
        c.font = '600 11px "Inter", "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillStyle = H.HUD.accent;
        c.fillText(`${o.schip} — ${o.ton} t ${productVan(o.product).naam}`, 26, 92);
        c.fillStyle = H.HUD.tekstZacht;
        c.font = '500 10px "Inter", "Segoe UI", system-ui, sans-serif';
        c.fillText(w.vaarwater.ligIndex[o.ligplaats].naam, 26, 108);
        H.regel(c, 26, 126, 244, 'Venster sluit',
          rest > 0 ? `${Math.floor(rest / 60)} u ${Math.round(rest % 60)} m` : 'VERLOPEN',
          rest < 0 ? H.HUD.slecht : rest < 120 ? H.HUD.let : H.HUD.goed);
      }

      // --- Onderbalk: vaartgegevens ---
      const bx = 14;
      const by = vh - 104;
      H.paneel(c, bx, by, 430, 90);
      const knopen = Math.abs(s.snelheid) * 1.94384;
      H.meter(c, bx + 46, by + 45, 30, Math.abs(s.gas), H.HUD.accent,
        'vaart', `${knopen.toFixed(1)}`);
      c.textAlign = 'center';
      c.fillStyle = H.HUD.tekstZacht;
      c.font = '500 9px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillText('knopen', bx + 46, by + 80);

      // Kielspeling: het getal waar het in de binnenvaart om draait.
      const ks = scene.kielspeling != null ? scene.kielspeling : 0;
      H.regel(c, bx + 92, by + 20, 150, 'Kielspeling',
        ks < 0 ? 'GEEN' : `${ks.toFixed(2)} m`,
        ks < 0.3 ? H.HUD.slecht : ks < 0.8 ? H.HUD.let : H.HUD.goed);
      H.regel(c, bx + 92, by + 38, 150, 'Diepgang', `${diepgang(s.boot).toFixed(2)} m`);
      H.regel(c, bx + 92, by + 56, 150, 'Getij',
        `${w.getijBij(s.x, s.y) >= 0 ? '+' : ''}${w.getijBij(s.x, s.y).toFixed(2)} m`);
      H.regel(c, bx + 92, by + 74, 150, 'Doorvaart',
        `${opbouwhoogteVan(s.boot.type, tankTotaal(s.boot)).toFixed(1)} m`);

      // De squatbalk: loopt op met de vaart en zakt zodra je terugneemt.
      const squat = scene.squat || 0;
      H.zoneBalk(c, bx + 256, by + 26, 160, 8, squat,
        { veilig: 0.25, grens: 0.5, hard: 0.9 }, 'Squat');
      const zuiging = scene.zuiging || 0;
      H.zoneBalk(c, bx + 256, by + 56, 160, 8, zuiging,
        { veilig: 0.05, grens: 0.14, hard: 0.28 }, 'Oeverzuiging');

      // --- Rechtsonder: kompas, tij en minikaart ---
      const stroom = scene.stroom || { vx: 0, vy: 0 };
      const kracht = Math.hypot(stroom.vx, stroom.vy);
      const rb = 250; // paneelbreedte: ruim genoeg voor het langste getijwoord
      const rx = vw - rb - 14;
      H.paneel(c, rx, vh - 104, rb, 90);
      H.kompas(c, rx + 42, vh - 59, 34, s.koers, Math.atan2(stroom.vy, stroom.vx), kracht);
      const tx = rx + 86;
      const tb = rb - 100;
      H.regel(c, tx, vh - 84, tb, 'Stroom', `${kracht.toFixed(2)} m/s`);
      const zicht = w.zichtBij(s.x, s.y);
      H.regel(c, tx, vh - 66, tb, 'Zicht',
        zicht > 0.8 ? 'goed' : zicht > 0.5 ? 'matig' : zicht > 0.35 ? 'slecht' : 'gestremd',
        zicht < 0.35 ? H.HUD.slecht : zicht < 0.6 ? H.HUD.let : H.HUD.goed);
      H.regel(c, tx, vh - 48, tb, 'Ruim',
        `${Math.round(tankTotaal(s.boot))} / ${type.tank} m³`);
      c.font = '500 10px "Inter", "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = H.HUD.tekstZacht;
      c.fillText(w.getijWoordBij(s.x, s.y), tx, vh - 28);

      H.tekenMiniKaart(c, w, s, rx, vh - 104 - 156, rb, 150,
        s.order ? s.order.ligplaats : null);

      // --- Contexthint ---
      const hint = scene.hintTekst();
      if (hint) {
        c.font = '600 12px "Inter", "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'center';
        const bw = c.measureText(hint).width + 28;
        // Boven de meldingenrij (die op vh−128 begint), anders tekenen ze
        // over elkaar heen op precies het moment dat je ze allebei nodig hebt.
        H.paneel(c, vw / 2 - bw / 2, vh - 186, bw, 28, 14);
        c.fillStyle = H.HUD.tekst;
        c.textBaseline = 'middle';
        c.fillText(hint, vw / 2, vh - 172);
      }
    },

    /** Wat de contextknop nú zou doen — of niets, als er niets te doen is. */
    hintTekst() {
      const s = Spel.schipper;
      const vw = Spel.wereld.vaarwater;
      const sluis = vw.sluisOp(s.x, s.y, 900);
      if (sluis) return `E — aanmelden bij ${sluis.sluis.naam}`;
      const lig = vw.ligplaatsOp(s.x, s.y, 450);
      if (lig && lig.plaats.soort === 'terminal') return `E — laden bij ${lig.plaats.naam}`;
      if (lig && s.order && lig.plaats.id === s.order.ligplaats) {
        return Math.abs(s.snelheid) > 1.6 ? 'Neem gas terug om langszij te gaan' : `E — langszij ${s.order.schip}`;
      }
      if (s.vaartijd <= 0) return 'T — doorliggen tot morgenochtend';
      return null;
    },
  };
  return scene;
}

export { TIJDSTANDEN };
