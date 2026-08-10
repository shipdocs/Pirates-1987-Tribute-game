// Zeeslag: laveren, de wind uitbuiten en de volle laag geven.
import {
  clamp, lerp, normAngle, dist, TAU, turnToward, fmtGold, makeRng, rnd, rndInt,
} from './util.js';
import {
  WAREN, SCHIP_INDEX, scheepsAanduiding, metLidwoord, MOEILIJKHEDEN, NATIES,
  LEGENDE_INDEX, ITEMS, itemBonus,
} from './data.js';
import { zeilEfficiëntie } from './world.js';
import { Game, roundRect, vlaggenschip, nieuwSchip, talentBonus, vlootBemanningMax } from './game.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as audio from './audio.js';
import { maakDuel } from './duel.js';
import {
  MUNITIE, KOGEL_SNELHEID, ENTERAFSTAND, KANS_GESCHUT, SCHROOT_KOPPEN, KETTING_TUIGAGE,
  salvoStukken, spreiding, schootsafstand, voorhoudpunt, salvoRichting, inSchootsveld,
  raaktRomp, herlaadTijd, schadePerTreffer, strijdlust, geschutVerlies, geeftOp,
} from './gevechtsmodel.js';

const ARENA_X = 1150;
const ARENA_Y = 820;

// --- Slagterrein ---------------------------------------------------------

/** Vast, door het wereldzaad bepaalde kust en rotsen voor één zeeslag. */
function maakSlagTerrein(wereld, speler, vloot) {
  let naamZaad = 0;
  for (const teken of vloot.naam || vloot.type) {
    naamZaad = Math.imul(naamZaad ^ teken.charCodeAt(0), 16777619);
  }
  const zaad = (wereld.seed ^ Math.round(speler.x * 31) ^ Math.round(speler.y * 131) ^ naamZaad) >>> 0;
  const rng = makeRng(zaad);
  const sy = rng() < 0.5 ? -1 : 1;
  const kust = {
    x: rnd(rng, -180, 180),
    y: sy * rnd(rng, 500, 560),
    rx: rnd(rng, 520, 700),
    ry: rnd(rng, 230, 300),
    draai: rnd(rng, -0.12, 0.12),
    rand: [],
    groei: [],
  };

  const punten = 42;
  const fase = rnd(rng, 0, TAU);
  for (let i = 0; i < punten; i++) {
    const a = (i / punten) * TAU;
    const rafel = 1 + Math.sin(a * 3 + fase) * 0.055 + Math.sin(a * 7 - fase) * 0.025 + rnd(rng, -0.025, 0.025);
    kust.rand.push([Math.cos(a) * kust.rx * rafel, Math.sin(a) * kust.ry * rafel]);
  }
  for (let i = 0; i < 28; i++) {
    const a = rnd(rng, 0, TAU);
    const d = Math.sqrt(rng()) * 0.72;
    kust.groei.push({
      x: Math.cos(a) * kust.rx * d,
      y: Math.sin(a) * kust.ry * d,
      r: rnd(rng, 3, 7),
      licht: rng() < 0.28,
    });
  }

  const rotsen = [];
  for (let poging = 0; poging < 120 && rotsen.length < 4; poging++) {
    const r = rnd(rng, 22, 46);
    const x = rnd(rng, -690, 690);
    const y = rnd(rng, -440, 440);
    if (Math.abs(x) < 320 && Math.abs(y) < 210) continue;
    if (dist(x, y, -230, 70) < r + 150 || dist(x, y, 250, -110) < r + 150) continue;
    if (raaktSlagTerrein({ kust, rotsen: [] }, x, y, r + 45)) continue;
    if (rotsen.some((rots) => dist(x, y, rots.x, rots.y) < r + rots.r + 80)) continue;
    const hoeken = rndInt(rng, 7, 11);
    const rand = [];
    for (let i = 0; i < hoeken; i++) {
      const a = (i / hoeken) * TAU;
      const rr = r * rnd(rng, 0.72, 1.15);
      rand.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    rotsen.push({ x, y, r, draai: rnd(rng, 0, TAU), rand });
  }
  return { kust, rotsen };
}

/** Raakt een middelpunt met veiligheidsmarge de kust of een rotspunt? */
function raaktSlagTerrein(terrein, x, y, marge = 0) {
  const kust = terrein.kust;
  const dx = x - kust.x,
    dy = y - kust.y;
  const cos = Math.cos(-kust.draai),
    sin = Math.sin(-kust.draai);
  const lx = dx * cos - dy * sin,
    ly = dx * sin + dy * cos;
  if ((lx * lx) / ((kust.rx + marge) ** 2) + (ly * ly) / ((kust.ry + marge) ** 2) <= 1) {
    return true;
  }
  return terrein.rotsen.some((rots) => dist(x, y, rots.x, rots.y) <= rots.r + marge);
}

function padVanRand(c, rand, schaal = 1) {
  c.beginPath();
  c.moveTo(rand[0][0] * schaal, rand[0][1] * schaal);
  for (let i = 1; i < rand.length; i++) c.lineTo(rand[i][0] * schaal, rand[i][1] * schaal);
  c.closePath();
}

/** Tekent ondiepte, strand, begroeiing en rotsen onder de strijdende schepen. */
function tekenSlagTerrein(c, terrein) {
  const kust = terrein.kust;
  c.save();
  c.translate(kust.x, kust.y);
  c.rotate(kust.draai);

  c.fillStyle = 'rgba(67,190,190,0.18)';
  padVanRand(c, kust.rand, 1.3);
  c.fill();
  c.fillStyle = 'rgba(82,207,194,0.28)';
  padVanRand(c, kust.rand, 1.16);
  c.fill();
  c.fillStyle = '#d7c48e';
  padVanRand(c, kust.rand, 1.035);
  c.fill();

  const land = c.createLinearGradient(-kust.rx, -kust.ry, kust.rx, kust.ry);
  land.addColorStop(0, '#557a3d');
  land.addColorStop(0.55, '#315d36');
  land.addColorStop(1, '#173f2d');
  c.fillStyle = land;
  padVanRand(c, kust.rand);
  c.fill();
  c.strokeStyle = 'rgba(239,220,163,0.82)';
  c.lineWidth = 3;
  c.stroke();

  // Branding met dezelfde schuimvlokken als op de zeekaart.
  R.schuimLangs(c, () => padVanRand(c, kust.rand, 1.02), 16, 0.55, Game.tijd);
  R.schuimLangs(c, () => padVanRand(c, kust.rand, 1.005), 7, 0.7, Game.tijd, -0.6);

  for (const plant of kust.groei) {
    c.fillStyle = plant.licht ? '#5f8848' : '#234d32';
    c.beginPath();
    c.arc(plant.x, plant.y, plant.r, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(8,31,27,0.25)';
    c.beginPath();
    c.ellipse(plant.x + 3, plant.y + 4, plant.r * 1.1, plant.r * 0.65, 0.5, 0, TAU);
    c.fill();
  }
  c.restore();

  for (const rots of terrein.rotsen) {
    c.save();
    c.translate(rots.x, rots.y);
    c.rotate(rots.draai);
    c.fillStyle = 'rgba(72,203,196,0.2)';
    c.beginPath();
    c.arc(0, 0, rots.r + 22, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(8,31,42,0.32)';
    c.beginPath();
    c.ellipse(6, 8, rots.r * 1.08, rots.r * 0.75, 0.25, 0, TAU);
    c.fill();
    const steen = c.createLinearGradient(-rots.r, -rots.r, rots.r, rots.r);
    steen.addColorStop(0, '#b4aa91');
    steen.addColorStop(0.45, '#756f62');
    steen.addColorStop(1, '#3d4544');
    c.fillStyle = steen;
    padVanRand(c, rots.rand);
    c.fill();
    c.strokeStyle = 'rgba(225,218,194,0.42)';
    c.lineWidth = 1.5;
    c.stroke();
    // Ook een rots breekt water.
    R.schuimLangs(c, () => padVanRand(c, rots.rand, 1.05), 8, 0.5, Game.tijd, 0.8);
    c.restore();
  }
}

/** Halve lengte en breedte van een romp, op de schaal waarop we in de slag tekenen. */
function rompMaat(typeId) {
  const [L, B] = R.scheepMaat(typeId);
  return [L * 0.95, B * 0.95];
}

export function maakZeeslag(vloot, opts) {
  const wereld = Game.wereld;
  const speler = Game.speler;
  const eigenSchip = vlaggenschip(speler);

  // Moeilijkheid schaalt alleen de vijand (niet de eigen romp), zodat een
  // hogere stand meer tegenstand betekent zonder dat de speler fragieler is.
  const moe = MOEILIJKHEDEN.find((m) => m.id === speler.moeilijkheid) || MOEILIJKHEDEN[1];
  const vijandKracht = moe ? moe.mult : 1;

  const eigenUp = eigenSchip.upgrades || {};
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
    // Uitrusting van de werf én buitstukken van verslagen legendes tellen mee.
    upgradeZeil: (eigenUp.zeilen || 0) * 0.04 + itemBonus(speler, 'snelheid'),
    upgradeRoer: (eigenUp.roer || 0) * 0.05 + itemBonus(speler, 'wend'),
    upgradeHoogte: itemBonus(speler, 'hoogte'),
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

  const terrein = maakSlagTerrein(wereld, speler, vloot);
  let kogels = [];
  let deeltjes = [];
  let munitie = 0;
  let tijd = 0;
  let afgelopen = false;
  let vijandMoraal = 100;
  let terreinBotsKoeling = 0;
  // De schepen worden hier op dubbele schaal getekend (zie `tekenStrijder`) en
  // het terrein rekent met diezelfde maat, dus die verhouding blijft staan;
  // alleen de camera stond te ver weg. Een fregat mat vijfenzestig schermpixels
  // in een gevecht waarin je op de romp van je tegenstander moet mikken.
  const cam = { x: 0, y: 0, zoom: 1.35 };
  // Welk muziekthema er speelde toen we hier binnenkwamen.
  let vorigThema = 'zee';

  const scene = {
    naam: 'zeeslag',
    // Handvat voor de console: __G.scene.debug.vijand.romp = 1, enzovoort.
    debug: {
      mij,
      vijand,
      terrein,
      kogels,
      raaktTerrein: (x, y, marge = 0) => raaktSlagTerrein(terrein, x, y, marge),
    },

    betreed() {
      cam.x = (mij.x + vijand.x) / 2;
      cam.y = (mij.y + vijand.y) / 2;
      // Onthouden wat er speelde: een enterduel begint middenin een zeeslag,
      // en dan moet daarna de zeeslag weer klinken en niet de open zee.
      vorigThema = audio.huidigThema();
      audio.startMuziek('gevecht');
      Game.melding(`Gevecht met een ${scheepsAanduiding(vloot.natie, vloot.type)}!`, 'rood');
    },

    verlaat() {
      audio.startMuziek(vorigThema);
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
      terreinBotsKoeling = Math.max(0, terreinBotsKoeling - dt);
      wereld.windTik(dt * 0.4);

      stuurSpeler(dt);
      stuurVijand(dt);
      beweeg(mij, dt);
      beweeg(vijand, dt);

      // Kogels vliegen echt: ze raken wat ze onderweg tegenkomen, en anders
      // vallen ze aan het eind van hun dracht in zee.
      for (let i = kogels.length - 1; i >= 0; i--) {
        const k = kogels[i];
        const vx = k.vx * dt;
        const vy = k.vy * dt;
        const lengte = Math.hypot(vx, vy);
        const [hl, hb] = rompMaat(k.doel.type);

        // In stappen langslopen, anders schiet een snelle kogel dwars door een
        // smalle sloep heen zonder hem te raken.
        let geraakt = false;
        let raakteTerrein = false;
        const stappen = Math.max(1, Math.ceil(lengte / 5));
        for (let n = 1; n <= stappen && !geraakt; n++) {
          const px = k.x + (vx * n) / stappen;
          const py = k.y + (vy * n) / stappen;
          if (raaktSlagTerrein(terrein, px, py, 2)) {
            k.x = px;
            k.y = py;
            raakteTerrein = true;
            geraakt = true;
          } else if (raaktRomp(px, py, k.doel, hl, hb)) {
            k.x = px;
            k.y = py;
            geraakt = true;
          }
        }

        if (geraakt) {
          if (raakteTerrein) {
            audio.sfx.plons();
            spatDeeltjes(k.x, k.y, '#b6aa91', 5);
          } else {
            treffer(k.doel, k);
            audio.sfx.treffer();
            spatDeeltjes(k.x, k.y, '#ffb45a', 7);
          }
          kogels.splice(i, 1);
          continue;
        }

        k.x += vx;
        k.y += vy;
        k.afgelegd += lengte;
        if (k.afgelegd >= k.bereik) {
          audio.sfx.plons();
          deeltjes.push({ x: k.x, y: k.y, t: 0, duur: 0.6, r: 4, kleur: '#cfe9f2', vx: 0, vy: 0 });
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
      // Ruimer bereik dan voorheen (0,42–1,05). Op de oude bovengrens mat een
      // fregat een pixel of vijfenzestig, terwijl je in dit gevecht juist op
      // romp of tuig van je tegenstander moet mikken; de ondergrens gaat mee
      // omhoog omdat de hele arena maar 2300 bij 1640 groot is en je dus nooit
      // zó ver uit elkaar ligt dat er verder uitgezoomd hoeft te worden.
      const gewenst = clamp(Math.min(Game.breedte, Game.hoogte * 1.5) / (spreiding + 300), 0.5, 1.7);
      cam.zoom = lerp(cam.zoom, gewenst, clamp(dt * 1.5, 0, 1));

      // Vijandelijke moraal: een lekke romp, gevallen kameraden en vooral
      // zwijgend geschut breken de wil om door te vechten.
      vijandMoraal = strijdlust(vijand);

      controleerEinde();
    },

    teken(c) {
      const vw = Game.breedte,
        vh = Game.hoogte;
      // Stormen beïnvloeden ook de slag: zwaarder zeegang, meer regen.
      const storm = wereld.stormWind ? wereld.stormWind(mij.x, mij.y) : { richting: wereld.windRichting, kracht: wereld.windKracht };
      R.tekenZee(c, cam, vw, vh, Game.tijd, {
        richting: storm.richting,
        kracht: storm.kracht,
      });

      c.save();
      c.translate(vw / 2, vh / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-cam.x, -cam.y);

      tekenSlagTerrein(c, terrein);
      for (const s of [vijand, mij]) tekenKielzog(c, s);
      for (const p of deeltjes) R.tekenRook(c, p);

      for (const s of [vijand, mij]) tekenStrijder(c, s, wereld.windRichting, storm);

      // Kogels, met hun schaduw op het water zodat de boog leesbaar wordt.
      for (const k of kogels) {
        const p = clamp(k.afgelegd / k.bereik, 0, 1);
        const hoogte = Math.sin(p * Math.PI) * 10;
        c.fillStyle = 'rgba(6,28,44,0.32)';
        c.beginPath();
        c.ellipse(k.x + hoogte * 0.26, k.y + hoogte * 0.36, 2.4, 1.5, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#1a1a1a';
        c.beginPath();
        c.arc(k.x, k.y - hoogte, 2.4, 0, TAU);
        c.fill();
      }

      tekenMistrand(c);
      c.restore();

      // Zeeleven en stormflair, net als op de overzichtskaart: meeuwen cirkelen
      // boven het strijdtoneel, regen waait mee met de wind — binnen een storm
      // harder.
      R.tekenMeeuwen(c, vw, vh, Game.tijd);
      R.tekenRegen(c, Game.breedte, Game.hoogte, storm.richting, storm.kracht, Game.tijd);
    },

    /**
     * Gevechts-HUD in schermcoördinaten, los van de wereld. Apart gehouden
     * zodat een eventueel miniatuureffect (tilt-shift) alleen de wereld
     * vervaagt en de HUD altijd scherp blijft.
     */
    tekenHud(c) {
      tekenGevechtHud(c);
    },

    // Bewust géén `miniatuurFocus`: hier doet de scène niet mee aan het
    // miniatuureffect. In een gevecht lees je het hele strijdtoneel — waar de
    // ander vaart, waar zijn kogels vallen, waar de rotsen liggen — en dan
    // werkt een scherpe plek rond je eigen romp tegen je in plaats van mee.
  };

  // --- Besturing ----------------------------------------------------------

  function stuurSpeler(dt) {
    const t = SCHIP_INDEX[mij.type];
    // Het schipstype bepaalt het grootste deel van de wendbaarheid;
    // zeilstand heeft nog wel invloed, maar minder dominant.
    const wend = t.wend * (0.30 + 0.70 * mij.zeilstand) * mij.tuigage * (1 + (mij.upgradeRoer || 0));
    if (Game.toets('ArrowLeft') || Game.toets('KeyA')) mij.koers = normAngle(mij.koers - wend * dt);
    if (Game.toets('ArrowRight') || Game.toets('KeyD')) mij.koers = normAngle(mij.koers + wend * dt);
    if (Game.toets('ArrowUp') || Game.toets('KeyW')) mij.zeilstand = clamp(mij.zeilstand + dt, 0, 1);
    // In de slag is KeyS vrij (op zee opent die de vloot), dus WASD is hier wél
    // compleet: wie met de linkerhand stuurt kan ook minderen.
    if (Game.toets('ArrowDown') || Game.toets('KeyS')) mij.zeilstand = clamp(mij.zeilstand - dt, 0, 1);
  }

  function stuurVijand(dt) {
    const t = SCHIP_INDEX[vijand.type];
    const wend = t.wend * (0.30 + 0.70 * vijand.zeilstand) * vijand.tuigage * 0.85;
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

    // Munitie kiezen op wat binnen dracht ligt en wat het meeste pijn doet.
    const kettingBereik = bereikVan(vijand, MUNITIE[1]);
    const schrootBereik = bereikVan(vijand, MUNITIE[2]);
    if (afstand < schrootBereik && mij.bemanning > vijand.bemanning * 1.1) vijand.munitie = 2;
    else if (afstand < kettingBereik && mij.tuigage > 0.55 && (tijd | 0) % 3 === 0) vijand.munitie = 1;
    else vijand.munitie = 0;

    // Vuren zodra de speler goed dwars ligt; te schuin is zonde van het kruit.
    const veld = inSchootsveld(vijand, mij);
    if (
      vijand.herlaad <= 0 &&
      vijand.kanonnen > 0 &&
      afstand < bereikVan(vijand, munitieVan(vijand)) &&
      veld.dwars < 0.3
    ) {
      vuur(vijand, mij);
    }
  }

  function beweeg(s, dt) {
    const t = SCHIP_INDEX[s.type];
    const storm = wereld.stormWind ? wereld.stormWind(s.x, s.y) : { richting: wereld.windRichting, kracht: wereld.windKracht };
    const eff = zeilEfficiëntie(s.koers, storm.richting, t.hoogte + (s.upgradeHoogte || 0));
    const romp = lerp(0.5, 1, clamp(s.romp / s.maxRomp, 0, 1));
    const upgrade = s.speler ? 1 + (mij.upgradeZeil || 0) : 1;
    const doel = t.snelheid * eff * storm.kracht * s.zeilstand * s.tuigage * romp * 1.15 * upgrade;
    s.snelheid = lerp(s.snelheid, doel, clamp(dt * 1.4, 0, 1));
    const nx = s.x + Math.cos(s.koers) * s.snelheid * dt;
    const ny = s.y + Math.sin(s.koers) * s.snelheid * dt;
    const [rompL] = rompMaat(s.type);
    if (!raaktSlagTerrein(terrein, nx, ny, rompL + 7)) {
      s.x = nx;
      s.y = ny;
    } else {
      s.snelheid *= 0.24;
      if (!s.speler) s.koers = normAngle(s.koers + dt * 1.1);
      if (s.speler && terreinBotsKoeling <= 0) {
        terreinBotsKoeling = 2.5;
        Game.melding('Branding aan de boeg — afvallen, voor je op de rotsen loopt!', 'rood');
        audio.sfx.fout();
      }
    }
    werkKielzogBij(s, dt);
  }

  /** Legt twee vaste schuimsporen achter het hek, zodat camerabeweging leesbaar blijft. */
  function werkKielzogBij(s, dt) {
    for (let i = s.kielzog.length - 1; i >= 0; i--) {
      s.kielzog[i].tijd += dt;
      if (s.kielzog[i].tijd > 4.2) s.kielzog.splice(i, 1);
    }
    if (s.snelheid < 5) return;
    const [L, B] = R.scheepMaat(s.type);
    const hx = s.x - Math.cos(s.koers) * L;
    const hy = s.y - Math.sin(s.koers) * L;
    const laatste = s.kielzog[s.kielzog.length - 1];
    if (laatste && dist(hx, hy, laatste.x, laatste.y) < 11) return;
    const nx = -Math.sin(s.koers) * B * 0.72;
    const ny = Math.cos(s.koers) * B * 0.72;
    s.kielzog.push({
      x: hx,
      y: hy,
      lx: hx + nx,
      ly: hy + ny,
      rx: hx - nx,
      ry: hy - ny,
      tijd: 0,
      kracht: clamp(s.snelheid / 80, 0.18, 1),
    });
  }

  /** Dracht van dit schip met de munitie die er nu in zit. */
  function bereikVan(s, soort) {
    // Fijn kruit brandt sneller af en draagt daardoor verder.
    const kruit = s.speler ? 1 + itemBonus(speler, 'dracht') : 1;
    return schootsafstand(SCHIP_INDEX[s.type], soort) * kruit;
  }

  function munitieVan(s) {
    return MUNITIE[s.speler ? munitie : s.munitie || 0];
  }

  // --- Vuren --------------------------------------------------------------

  function vuur(schutter, doel) {
    if (schutter.herlaad > 0) return;
    const soort = munitieVan(schutter);
    const t = SCHIP_INDEX[schutter.type];
    const stukken = salvoStukken(schutter.kanonnen);

    if (stukken <= 0) {
      if (schutter.speler) {
        Game.melding('Al je geschut is uit de affuiten geslagen.', 'rood');
        audio.sfx.fout();
      }
      return;
    }

    const afstand = dist(schutter.x, schutter.y, doel.x, doel.y);
    const bereik = bereikVan(schutter, soort);
    const veld = inSchootsveld(schutter, doel);

    if (schutter.speler) {
      if (afstand > bereik) {
        Game.melding(`Te ver voor ${soort.naam.toLowerCase()} — de kogels vallen in zee.`, 'rood');
        audio.sfx.fout();
        return;
      }
      if (!veld.binnen) {
        Game.melding('Geen schootsveld! Draai je breedzij naar ze toe.', 'rood');
        audio.sfx.fout();
        return;
      }
    }

    const volkDeel = clamp(schutter.bemanning / Math.max(1, schutter.startBemanning), 0, 1);
    const kanonnier = schutter.speler ? talentBonus(speler, 'kanonnier') : 0;
    schutter.herlaadVol = herlaadTijd(t, volkDeel, kanonnier) *
      (schutter.speler
        ? 1 - itemBonus(speler, 'herlaad') // dubbele affuiten lopen sneller terug in batterij
        : clamp(1.55 - vijandKracht * 0.42, 0.95, 1.6));
    schutter.herlaad = schutter.herlaadVol;

    // Waar het doel straks zal zijn. De stukken staan dwars vast en mogen maar
    // een streek meedraaien, dus de rest moet je met het roer goedmaken.
    const snelheid = KOGEL_SNELHEID * soort.snelheid;
    const mik = voorhoudpunt(schutter.x, schutter.y, doel, snelheid);
    const richtfout = (Math.random() - 0.5) * 2 * (0.045 + 0.075 * (1 - volkDeel)) *
      (schutter.speler ? 1 - 0.4 * kanonnier : clamp(1.5 - 0.4 * vijandKracht, 0.6, 1.5));
    const richting = salvoRichting(schutter, veld.kant, mik.x, mik.y) + richtfout;

    const sp = spreiding(stukken);
    const [hl, hb] = rompMaat(schutter.type);
    const dwarsHoek = schutter.koers + (veld.kant * Math.PI) / 2;
    audio.sfx.kanon();

    for (let i = 0; i < stukken; i++) {
      // De stukken staan verdeeld over de lengte van het boord.
      const langs = (stukken === 1 ? 0 : i / (stukken - 1) - 0.5) * hl * 1.1;
      const bx = schutter.x + Math.cos(schutter.koers) * langs + Math.cos(dwarsHoek) * hb;
      const by = schutter.y + Math.sin(schutter.koers) * langs + Math.sin(dwarsHoek) * hb;

      deeltjes.push({
        x: bx, y: by, t: 0, duur: 0.9, r: 6, kleur: '#dcd8cf',
        vx: Math.cos(dwarsHoek) * 40,
        vy: Math.sin(dwarsHoek) * 40,
      });

      // Waaier: dichtbij dekt hij het hele doel af, ver weg gaat het meeste
      // in zee. Meer stukken betekent een bredere waaier.
      const f = stukken === 1 ? 0 : (i / (stukken - 1)) * 2 - 1;
      const hoek = richting + f * sp + (Math.random() - 0.5) * sp * 0.6;
      kogels.push({
        x: bx,
        y: by,
        vx: Math.cos(hoek) * snelheid,
        vy: Math.sin(hoek) * snelheid,
        afgelegd: 0,
        bereik,
        doel,
        soort,
        schutterKanonnen: schutter.kanonnen,
        vijandelijk: !schutter.speler,
      });
    }
  }

  function treffer(s, k) {
    const zwaar = 1 + Math.random() * 0.6;
    // Moeilijkheidsschaling op vijandelijk vuur (niet op dat van de speler).
    const kracht = k.vijandelijk ? 0.7 + 0.3 * vijandKracht : 1;
    if (k.soort.doel === 'romp') {
      // Een deel van de rondkogels slaat tussen de stukken in plaats van in de
      // romp. Zo snoert een licht schip een zwaardere tegenstander de mond:
      // schiet zijn batterij stil en hij strijkt de vlag zodra je langszij komt.
      if (s.kanonnen > 0 && Math.random() < KANS_GESCHUT) {
        s.geschutSchade += geschutVerlies(s.startKanonnen);
        const kwijt = Math.floor(s.geschutSchade);
        if (kwijt >= 1) {
          s.geschutSchade -= kwijt;
          s.kanonnen = Math.max(0, s.kanonnen - kwijt);
          if (s.speler) Game.melding('Geschut uit de affuiten geslagen!', 'rood');
          else if (s.kanonnen <= 0) Game.melding('Hun batterij zwijgt — kom langszij!');
          else Game.melding(`Raak op het geschutsdek — nog ${s.kanonnen} stukken.`);
        }
      } else {
        s.romp -= schadePerTreffer(k.schutterKanonnen) * zwaar * kracht;
        if (Math.random() < 0.05) s.brand += 0.4;
      }
    } else if (k.soort.doel === 'zeilen') {
      s.tuigage = clamp(s.tuigage - KETTING_TUIGAGE * zwaar, 0.15, 1);
    } else {
      const dood = Math.max(1, Math.round(SCHROOT_KOPPEN * zwaar * kracht));
      s.bemanning = Math.max(0, s.bemanning - dood);
    }
    if (s.speler && k.soort.doel !== 'romp') {
      Game.melding(`Treffer! ${k.soort.naam.toLowerCase()} in de ${k.soort.doel}.`, 'rood');
    } else if (s.speler) {
      Game.melding('Treffer in de romp!', 'rood');
    }
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
    if (afstand > ENTERAFSTAND) {
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
    // Overgave: wil gebroken, óf geen stuk geschut meer over en jij ligt
    // langszij. Dat laatste is de beloning voor het stilleggen van zijn batterij.
    const afstand = dist(mij.x, mij.y, vijand.x, vijand.y);
    if (geeftOp(vijand, afstand, vijandKracht > 1.4 ? 16 : 22)) {
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

  /** Afrekening met een beruchte kapitein: roem, een naam minder op zee, en zijn buitstuk. */
  async function beloonLegende(id) {
    const legende = LEGENDE_INDEX[id];
    if (!legende) return;
    if (!speler.legendes) speler.legendes = {};
    if (!speler.legendes[id]) speler.legendes[id] = { verslagen: false, getipt: false, bij: null };
    speler.legendes[id].verslagen = true;
    speler.legendes[id].getipt = false;
    speler.legendes[id].bij = null;
    speler.roem += 80;
    speler.moraal = clamp(speler.moraal + 15, 0, 100);

    // De schurk voert geen buit maar mensen: onder het dek zit het familielid
    // waar je de halve Caraïben voor hebt afgezocht.
    if (legende.schurk) {
      const rol = (speler.familie && speler.familie.rol) || 'familielid';
      if (speler.familie) {
        speler.familie.gevonden = true;
        speler.familie.gevondenDag = speler.dag;
      }
      speler.roem += 120;
      speler.moraal = clamp(speler.moraal + 20, 0, 100);
      const kist = Math.round(6000 + Math.random() * 6000);
      speler.goud += kist;
      audio.sfx.fanfare();
      await UI.vraag(
        `Uw ${rol} is terecht`,
        `Achter een grendel in het ruim staan ze te knipperen tegen het licht. Tussen hen in ` +
          `staat uw <b>${rol}</b>. Na al die jaren is de familie weer bij elkaar, en de hele ` +
          `Caraïben zal het horen.<br><br>In de kajuit van ${legende.naam} staat bovendien een ` +
          `kist met <b>${fmtGold(kist)} goudstukken</b> — betaald voor mensen die hij nooit had mogen verkopen.`,
        [{ label: 'Ze aan dek brengen', waarde: 'ok' }],
        // Het portret volgt de rol: een zus of moeder is geen zeeman.
        { figuur: rol === 'zus' || rol === 'moeder' ? 'dame' : 'zeeman' }
      );
      return;
    }

    if (!Array.isArray(speler.items)) speler.items = [];
    const item = ITEMS[legende.buit];
    const nieuw = item && !speler.items.includes(legende.buit);
    if (nieuw) speler.items.push(legende.buit);

    audio.sfx.fanfare();
    await UI.vraag(
      `${legende.naam} is verslagen`,
      `De zwarte vlag gaat neer. <b>${legende.naam}</b>, ${legende.bijnaam}, vaart niet meer. ` +
        'Die naam gaat over de hele Caraïben — en die van jou erachteraan.' +
        (nieuw
          ? `<br><br>Uit het ruim haal je <b>${item.naam}</b>: ${item.omschrijving}`
          : '<br><br>Van die uitrusting valt niets meer te halen dat je niet al hebt.'),
      [{ label: 'Een naam erbij', waarde: 'ok' }],
      { figuur: 'zeeman' }
    );
  }

  async function beloonOverwinning(hoe) {
    slaSchadeOp();
    speler.verslagenSchepen++;
    speler.roem += hoe === 'enteren' ? 14 : 10;
    speler.moraal = clamp(speler.moraal + 10, 0, 100);

    // Een beruchte kapitein afrekenen is geen doorsnee prijs: het levert roem
    // op én een uitrustingsstuk dat nergens te koop is.
    if (vloot.legende) await beloonLegende(vloot.legende);

    // Jacht-opdracht: een vijandelijk schip van de gevraagde natie bewust tot
    // zinken brengen of strijken, vervult de opdracht.
    if (speler.opdracht && speler.opdracht.soort === 'jacht' && vloot.natie === speler.opdracht.natieV) {
      speler.opdracht.klaar = true;
      Game.melding('Het gevraagde oorlogsschip is verslagen — meld je bij de gouverneur.', 'goud');
    }

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

    // Losgeld voor een gevangen officier van een van de vier naties: officieren
    // van je eigen natie ruil je terug voor gevangenen, vreemden voor goud.
    const officier = !vloot.marine && vloot.natie !== 'piraat' && vloot.bemanning > 0;
    // Het bedrag wordt één keer bepaald: wat op de knop staat, is wat je krijgt.
    const losgeld = officier ? Math.round(1200 + Math.random() * 2600) : 0;
    if (officier) {
      keuzes.push({
        label: speler.natie === vloot.natie
          ? `Gevangenen ruilen (${vloot.natie})`
          : `Losgeld voor de kapitein (${fmtGold(losgeld)})`,
        waarde: 'los',
      });
    }

    const keuze = await UI.vraag(
      'Buit',
      `Je vindt <b>${fmtGold(buitGoud)} goudstukken</b> en ${genomen} eenheden lading. ` +
        `${metLidwoord(vloot.type, true)} is ${Math.round((vijand.romp / vijandType.romp) * 100)}% zeewaardig.` +
        (officier
          ? `<br><br>In de kajuit zit een <b>${vloot.naam}</b>, een officier van ${NATIES[vloot.natie].naam}. ` +
            'Hij heeft het losgeld dat zijn familie voor hem biedt.'
          : ''),
      keuzes,
      { figuur: 'zeeman' }
    );

    if (keuze === 'los') {
      if (speler.natie === vloot.natie) {
        // Ruil: jouw gevangen landgenoten komen vrij.
        speler.bemanning = clamp(speler.bemanning + 8, 0, vlootBemanningMax(speler));
        speler.relatie[vloot.natie] = clamp(speler.relatie[vloot.natie] + 8, -100, 100);
        speler.roem += 5;
        Game.melding('De gevangenen zijn geruild — je landgenoten varen weer vrij.');
      } else {
        speler.goud += losgeld;
        speler.relatie[vloot.natie] = clamp(speler.relatie[vloot.natie] + 6, -100, 100);
        speler.roem += 4;
        Game.melding(`Losgeld ontvangen voor de officier: ${fmtGold(losgeld)} goudstukken.`);
      }
      // Geen schip, geen lading meer — de officier gaat vrij.
      verslechterRelatie();
      beëindig({ vijandWeg: true, gewonnen: true });
      return;
    }

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
    // Stukgeschoten geschut blijft stuk; de werf zet er nieuwe stukken in.
    // Eén kanon houd je altijd over, anders sta je machteloos op zee.
    eigen.kanonnen = clamp(mij.kanonnen, 1, SCHIP_INDEX[eigen.type].kanonnen);
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

  /**
   * De grens van het strijdtoneel als een optrekkende mistbank in plaats van
   * een gestippelde rechthoek — even duidelijk, maar het blijft een zeekaart.
   */
  function tekenMistrand(c) {
    const F = 320; // diepte waarover de mist dichttrekt
    const O = 3000; // ruim buiten beeld doorvullen
    const mist = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(171,199,214,0)');
      g.addColorStop(1, 'rgba(171,199,214,0.62)');
      c.fillStyle = g;
      c.fillRect(rx, ry, rw, rh);
    };
    mist(-ARENA_X + F, 0, -ARENA_X, 0, -ARENA_X - O, -ARENA_Y - O, O + F, (ARENA_Y + O) * 2);
    mist(ARENA_X - F, 0, ARENA_X, 0, ARENA_X - F, -ARENA_Y - O, O + F, (ARENA_Y + O) * 2);
    mist(0, -ARENA_Y + F, 0, -ARENA_Y, -ARENA_X - O, -ARENA_Y - O, (ARENA_X + O) * 2, O + F);
    mist(0, ARENA_Y - F, 0, ARENA_Y, -ARENA_X - O, ARENA_Y - F, (ARENA_X + O) * 2, O + F);
  }

  function tekenStrijder(c, s, wind, zeegang) {
    // Heldere V aan de boeg: de zee kan van richting veranderen, deze golf
    // hoort altijd zichtbaar bij de vaarrichting van het schip zelf.
    const [schipL, schipB] = R.scheepMaat(s.type);
    const golf = clamp(s.snelheid / 70, 0, 1);
    if (golf > 0.08) {
      c.save();
      c.translate(s.x, s.y);
      c.rotate(s.koers);
      c.scale(2, 2);
      c.strokeStyle = `rgba(232,249,250,${0.28 + golf * 0.42})`;
      c.lineWidth = 1.15;
      c.beginPath();
      c.moveTo(schipL * 0.5, 0);
      c.quadraticCurveTo(schipL * 0.7, -schipB * 0.25, schipL * 0.46, -schipB * 1.2);
      c.moveTo(schipL * 0.5, 0);
      c.quadraticCurveTo(schipL * 0.7, schipB * 0.25, schipL * 0.46, schipB * 1.2);
      c.stroke();
      c.restore();
    }

    R.tekenSchip(c, s.x, s.y, s.koers, s.type, s.natie, wind, {
      vaart: s.snelheid / 90,
      tijd: Game.tijd,
      zeilen: s.zeilstand * s.tuigage,
      kanonnen: s.kanonnen,
      schaal: 2,
      // Zichtbare schade: gescheurde zeilen + diepe waterlijn bij beschadiging.
      tuigage: s.tuigage,
      rompFractie: s.romp / s.maxRomp,
      zeegang,
    });
    // Statusbalkje boven het schip; het schip is op dubbele schaal getekend,
    // dus de halve lengte is L.
    const [L] = R.scheepMaat(s.type);
    const bx = s.x - 34,
      by = s.y - L - 26;
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

  /** Tekent het historische hekgolfspoor in vaste wereldcoördinaten. */
  function tekenKielzog(c, s) {
    if (s.kielzog.length < 2) return;
    c.save();
    c.lineCap = 'round';
    for (let i = 1; i < s.kielzog.length; i++) {
      const a = s.kielzog[i - 1],
        b = s.kielzog[i];
      const leven = clamp(1 - Math.max(a.tijd, b.tijd) / 4.2, 0, 1);
      const alfa = leven * 0.46 * Math.min(a.kracht, b.kracht);
      if (alfa <= 0.015) continue;
      c.strokeStyle = `rgba(221,245,248,${alfa})`;
      c.lineWidth = 1.2 + leven * 2.2;
      c.beginPath();
      c.moveTo(a.lx, a.ly);
      c.lineTo(b.lx, b.ly);
      c.moveTo(a.rx, a.ry);
      c.lineTo(b.rx, b.ry);
      c.stroke();
    }
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
      R.hudPaneel(c, px, py, bw, bh, 6);
      if (gekozen) {
        // De gekozen soort krijgt een messing lijst in plaats van een andere
        // ondergrond: zo blijft de tekst op elk kaartje even leesbaar.
        c.strokeStyle = R.HUD.goudLicht;
        c.lineWidth = 2.4;
        roundRect(c, px + 1, py + 1, bw - 2, bh - 2, 5);
        c.stroke();
      }
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = '600 12px Georgia, serif';
      c.fillStyle = R.HUD.inkt;
      c.fillText(`${i + 1}  ${m.naam}`, px + 10, py + bh / 2 - 5);
      // De dracht erbij, want die verschilt sterk per soort.
      c.font = '10px Georgia, serif';
      c.fillStyle = R.HUD.inktZacht;
      c.fillText(`dracht ${Math.round(bereikVan(mij, m))} m`, px + 10, py + bh / 2 + 8);
    }

    // Herlaadbalk.
    const hw = 200;
    const klaar = mij.herlaad <= 0;
    const f = klaar ? 1 : 1 - mij.herlaad / Math.max(0.1, mij.herlaadVol);
    R.hudPaneel(c, vw / 2 - hw / 2, vh - 52, hw, 22, 6);
    R.hudBalk(c, vw / 2 - hw / 2 + 3, vh - 49, hw - 6, 16, f, klaar ? R.HUD.groen : R.HUD.goud);
    c.font = '600 12px Georgia, serif';
    c.fillStyle = R.HUD.inkt;
    c.textAlign = 'center';
    c.fillText(klaar ? 'VUUR! (spatie)' : 'herladen…', vw / 2, vh - 41);

    // Eigen toestand.
    R.hudPaneel(c, 16, 16, 236, 102, 8);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '600 13px Georgia, serif';
    c.fillStyle = R.HUD.inkt;
    c.fillText(SCHIP_INDEX[mij.type].naam, 28, 34);
    balkje(c, 28, 44, 212, 12, mij.romp / mij.maxRomp, R.hudStand(mij.romp / mij.maxRomp), 'romp');
    balkje(c, 28, 62, 212, 12, mij.tuigage, '#7d6a44', 'tuig');
    balkje(c, 28, 80, 212, 12, mij.bemanning / mij.startBemanning, '#a8681f', 'volk');
    balkje(c, 28, 98, 212, 12, mij.kanonnen / mij.startKanonnen, '#6f6a5c', 'stuk');

    // Vijandtoestand.
    R.hudPaneel(c, vw - 252, 16, 236, 102, 8);
    c.font = '600 13px Georgia, serif';
    c.fillStyle = R.HUD.inkt;
    c.fillText(scheepsAanduiding(vijand.natie, vijand.type), vw - 240, 34);
    balkje(c, vw - 240, 44, 212, 12, vijand.romp / vijand.maxRomp, R.HUD.rood, 'romp');
    balkje(c, vw - 240, 62, 212, 12, vijand.tuigage, '#7d6a44', 'tuig');
    balkje(c, vw - 240, 80, 212, 12, vijandMoraal / 100, '#a8681f', 'moed');
    balkje(c, vw - 240, 98, 212, 12, vijand.kanonnen / vijand.startKanonnen, '#6f6a5c', 'stuk');

    R.tekenWindroos(c, vw - 62, 152, 38, wereld.windRichting, wereld.windKracht, Game.tijd);

    const afstand = Math.round(dist(mij.x, mij.y, vijand.x, vijand.y));
    const dracht = Math.round(bereikVan(mij, MUNITIE[munitie]));
    const veld = inSchootsveld(mij, vijand);
    c.textAlign = 'center';
    c.font = '11px Georgia, serif';
    // Rood zodra je buiten dracht ligt of te schuin staat om te vuren.
    const kanVuren = afstand <= dracht && veld.binnen;
    const regel =
      `afstand ${afstand} m · dracht ${dracht} m · ` +
      (veld.binnen ? 'breedzij vrij' : 'geen schootsveld') +
      ` · B = enteren (< ${ENTERAFSTAND} m) · 1-3 munitie · Esc = vluchten`;
    // Op een strookje perkament: als losse letters over de zee viel deze regel
    // weg tegen het schuim, en juist hier staat wat je moet weten om te vuren.
    c.font = '11px Georgia, serif';
    const rw = c.measureText(regel).width + 24;
    R.hudPaneel(c, vw / 2 - rw / 2, vh - 78, rw, 20, 4);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = kanVuren ? R.HUD.inktZacht : R.HUD.rood;
    c.fillText(regel, vw / 2, vh - 67.5);
    c.restore();
  }

  // Balkje met het label ervoor, zodat de tekst nooit over de vulling valt.
  function balkje(c, x, y, w, h, f, kleur, label) {
    const lb = 34;
    c.font = '600 10px Georgia, serif';
    c.fillStyle = R.HUD.inktZacht;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + h / 2);
    R.hudBalk(c, x + lb, y, w - lb, h, f, kleur);
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
    herlaadVol: 3.4,
    geschutSchade: 0,
    brand: 0,
    speler: !!o.speler,
    munitie: 0,
    upgradeZeil: o.upgradeZeil || 0,
    upgradeRoer: o.upgradeRoer || 0,
    upgradeHoogte: o.upgradeHoogte || 0,
    kielzog: [],
  };
}
