// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// De overslagscène: de opvolger van de zeeslag. Alles draait om één spanning —
// hard pompen wint klok maar breekt dingen — en om één beslissing: hoeveel hou
// je achter, en durf je dat bij déze chief in déze omstandigheden.
//
// Het rekenwerk zit in `overslagmodel.js` en niet hier. Deze scène tekent en
// bedient; ze rekent niets uit wat je ook buiten de browser zou willen kunnen
// narekenen.

import { clamp, TAU, sierTijd } from './util.js';
import { productVan, KLANTSCHIP_INDEX, verbeterBonus, verschilWoord } from './data.js';
import { Spel } from './spel.js';
import * as M from './overslagmodel.js';
import * as H from './render/hud.js';
import * as UI from './ui.js';
import * as audio from './audio.js';

/**
 * Speelminuten per echte seconde. Een partij van 780 m³ op 360 m³/uur is ruim
 * twee uur werk; op deze stand is dat ongeveer een minuut spelen — lang genoeg
 * om aan de pomp te moeten sturen en op tijd af te toppen, kort genoeg om er
 * tien op een avond te doen. `SNEL` is voor het rustige middenstuk, niet voor
 * de aanloop of het aftoppen.
 */
const MIN_PER_SEC = 2;
const SNEL = 6;

export function maakOverslagScene(opts) {
  const s = Spel.schipper;
  const w = Spel.wereld;
  const order = opts.order;
  const product = productVan(order.product);
  const klantType = KLANTSCHIP_INDEX[order.type];

  // De omstandigheden waarin straks gemeten wordt. Ze staan hier één keer vast
  // en worden ook één op één aan de speler getoond — dat is de kern van het
  // ontwerp: de speelruimte moet te lézen zijn, niet te raden.
  const omstandigheden = {
    mfm: order.mfm,
    deining: opts.deining || 0,
    temperatuurVerschil: Math.abs((product.verwarmd ? 48 : 18) - 12),
    partijTon: order.ton,
    surveyor: order.surveyor,
    argwaan: clamp(s.argwaan / 60, 0, 1),
    meetbonus: verbeterBonus(s.boot, 'meting'),
    manifoldMax: klantType.manifold,
    verwarming: s.boot.verbeteringen.verwarming || 0,
  };

  const operatie = M.maakOperatie({
    product: order.product,
    bestelling: order.ton,
    retentie: 0,
    chief: opts.chief,
    omstandigheden,
    boot: s.boot,
    temperatuurBoot: s.boot.temperatuur[order.product] || (product.verwarmd ? 48 : 18),
    temperatuurBuiten: 12,
    ontvangendeTank: Math.max(order.ton * 1.05, klantType.tankMax) * 1.02,
    beginUllage: klantType.tankMax * 0.18,
  });

  const banden = M.banden(opts.chief, omstandigheden);
  let snel = false;
  let gestart = false;
  let afgerond = false;
  let schudden = 0;
  const meldingen = [];
  const deeltjes = [];

  function meld(tekst, kleur = 'let') {
    meldingen.push({ tekst, kleur, t: 0 });
    if (meldingen.length > 4) meldingen.shift();
  }

  const scene = {
    operatie,
    banden,
    // F betekent hier 'versneld'; zie `koppelInvoer` in spel.js.
    neemtF: true,

    betreed() {
      audio.zetMotor(0.12);
      toonBriefing();
    },

    verlaat() {
      audio.zetPomp(0);
      audio.stilte();
    },

    /**
     * De briefing vóór het openen. Hier staat alles wat de speelruimte bepaalt
     * bij elkaar, en hier zet je je retentiedoel. Bewust vóóraf: het is een
     * plan, geen impuls — en een plan kun je verantwoorden als het misgaat.
     */
    toonBriefing() {
      toonBriefing();
    },

    werkBij(dt) {
      if (UI.ietsOpen() || afgerond) {
        audio.zetPomp(0);
        return;
      }
      for (const m of meldingen) m.t += dt;
      schudden = Math.max(0, schudden - dt * 2);

      for (let i = deeltjes.length - 1; i >= 0; i--) {
        const p = deeltjes[i];
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 40 * dt;
        if (p.t > p.duur) deeltjes.splice(i, 1);
      }

      if (!gestart) return;

      const op = operatie;
      // Pompbediening.
      if (Spel.toets('KeyW') || Spel.toets('ArrowUp')) op.pompStand = clamp(op.pompStand + dt * 0.55, 0, 1);
      if (Spel.toets('KeyS') || Spel.toets('ArrowDown')) op.pompStand = clamp(op.pompStand - dt * 0.75, 0, 1);

      const dtMin = dt * MIN_PER_SEC * (snel ? SNEL : 1);
      const gebeurd = M.tik(op, dtMin, Math.random);
      w.verstrijk(dtMin);

      for (const g of gebeurd) {
        if (g.soort === 'slang' || g.soort === 'overloop') {
          audio.sfx.alarm();
          schudden = 1;
          for (let i = 0; i < 26; i++) {
            deeltjes.push({
              x: 0, y: 0, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 90,
              t: 0, duur: 1.4 + Math.random(), maat: 2 + Math.random() * 4,
            });
          }
          meld(g.tekst, 'slecht');
          scene.afronden();
        } else if (g.soort === 'klaar') {
          audio.sfx.bevestig();
          meld(g.tekst, 'goed');
          scene.afronden();
        } else {
          audio.sfx.marifoon();
          meld(g.tekst, 'let');
        }
      }

      audio.zetPomp(op.pompStand);
    },

    toets(code) {
      if (UI.ietsOpen() || afgerond) return;
      if (code === 'Space') {
        gestart = !gestart;
        if (gestart) meld('Openen. Langzaam beginnen.', 'goed');
        else operatie.pompStand = 0;
      }
      if (code === 'KeyF') snel = !snel;
      if (code === 'Enter' && gestart) scene.afronden();
      if (code === 'KeyB') toonBriefing();
    },

    /** Stoppen en naar de handtekening. */
    afronden() {
      if (afgerond) return;
      afgerond = true;
      operatie.pompStand = 0;
      operatie.gestopt = true;
      audio.zetPomp(0);
      setTimeout(() => {
        import('./handtekening.js').then((m) => m.toonHandtekening(operatie, order, opts));
      }, 700);
    },

    teken(c) {
      const vw = Spel.breedte;
      const vh = Spel.hoogte;
      const op = operatie;

      // Achtergrond: nachtelijk havenwater, want bunkeren gebeurt op alle uren.
      const g = c.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, '#0d1620');
      g.addColorStop(0.55, '#16232e');
      g.addColorStop(1, '#0a1218');
      c.fillStyle = g;
      c.fillRect(0, 0, vw, vh);

      c.save();
      if (schudden > 0) {
        c.translate((Math.random() - 0.5) * schudden * 8, (Math.random() - 0.5) * schudden * 8);
      }

      // --- Het klantschip boven, de bak onder, de slang ertussen ---
      const midY = vh * 0.44;
      const schipH = Math.min(190, vh * 0.24);
      // Romp van het zeeschip: een grote stalen wand die het beeld afsluit.
      c.fillStyle = '#2b3742';
      c.fillRect(-40, midY - schipH - 60, vw + 80, schipH);
      c.fillStyle = '#39485466';
      for (let i = 0; i < 26; i++) {
        c.fillRect(i * (vw / 26), midY - schipH - 60, 2, schipH);
      }
      // Waterlijn en roest.
      c.fillStyle = '#5a3a30';
      c.fillRect(-40, midY - 66, vw + 80, 8);
      c.fillStyle = 'rgba(230,240,248,0.85)';
      c.font = '700 20px "Inter", "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(order.schip.toUpperCase(), 40, midY - schipH - 18);
      c.font = '500 12px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillStyle = 'rgba(200,218,232,0.6)';
      c.fillText(`${KLANTSCHIP_INDEX[order.type].naam} — ${order.rederij}`, 40, midY - schipH + 2);

      // Het water tussen het zeeschip en de bak. Zonder deze strook staat er
      // een gat van driehonderd beeldpunten tussen twee rompen en zweeft de
      // slang door het niets.
      const bootY = vh * 0.72;
      const wg = c.createLinearGradient(0, midY - 58, 0, bootY + 20);
      wg.addColorStop(0, '#12222e');
      wg.addColorStop(0.6, '#0f1d27');
      wg.addColorStop(1, '#0c1720');
      c.fillStyle = wg;
      c.fillRect(0, midY - 58, vw, bootY + 20 - (midY - 58));
      // Rimpeling: langzame horizontale streepjes, per frame verschoven met een
      // vaste driftsnelheid — nooit tijd × snelheid, zie AGENTS.md.
      c.strokeStyle = 'rgba(140,180,205,0.10)';
      c.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const y = midY - 40 + i * ((bootY - midY + 50) / 16);
        const fase = sierTijd(Spel.tijd) * (12 + i * 2.5) + i * 37;
        const x = ((fase % (vw + 200)) - 100);
        c.beginPath();
        c.moveTo(x - 70, y);
        c.lineTo(x + 70, y);
        c.stroke();
      }
      // Spiegeling van de scheepshuid op het water, direct onder de waterlijn.
      const sp = c.createLinearGradient(0, midY - 58, 0, midY + 40);
      sp.addColorStop(0, 'rgba(43,55,66,0.55)');
      sp.addColorStop(1, 'rgba(43,55,66,0)');
      c.fillStyle = sp;
      c.fillRect(0, midY - 58, vw, 98);

      // De bunkerboot onderaan.
      c.fillStyle = '#7a4f28';
      c.fillRect(60, bootY, vw - 120, 74);
      c.fillStyle = '#8f5f30';
      c.fillRect(60, bootY, vw - 120, 12);
      c.fillStyle = '#dfe4e6';
      c.fillRect(vw - 190, bootY - 34, 110, 40);
      c.fillStyle = 'rgba(30,44,56,0.85)';
      c.fillRect(vw - 180, bootY - 26, 90, 16);
      // Tankdeksels.
      c.fillStyle = 'rgba(220,228,234,0.5)';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(150 + i * ((vw - 340) / 4), bootY + 34, 11, 0, TAU);
        c.fill();
      }

      // De slang: een boog van het manifold van de bak naar dat van het schip.
      // Hij zwelt zichtbaar op met de druk — dat is de waarschuwing die je twee
      // seconden geeft voordat hij het begeeft.
      const drukF = clamp((op.druk - 1) / (omstandigheden.manifoldMax + 2), 0, 1.3);
      const x0 = vw * 0.34;
      const x1 = vw * 0.5;
      c.strokeStyle = op.drukpiek > 5 ? '#d9694f' : '#2f3a3f';
      c.lineWidth = 12 + drukF * 9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, bootY + 4);
      c.bezierCurveTo(x0, bootY - 70, x1, midY - 30, x1, midY - 58);
      c.stroke();
      // De stroom erin: stipjes die met het debiet meelopen.
      if (op.debiet > 1) {
        const stroomF = op.debiet / op.maxDebiet;
        c.strokeStyle = product.kleur;
        c.lineWidth = 6 + drukF * 5;
        c.setLineDash([10, 26]);
        c.lineDashOffset = -((sierTijd(Spel.tijd) * 220 * stroomF) % 36);
        c.beginPath();
        c.moveTo(x0, bootY + 4);
        c.bezierCurveTo(x0, bootY - 70, x1, midY - 30, x1, midY - 58);
        c.stroke();
        c.setLineDash([]);
      }

      // Gemorst product.
      for (const p of deeltjes) {
        c.globalAlpha = clamp(1 - p.t / p.duur, 0, 1);
        c.fillStyle = product.kleur;
        c.beginPath();
        c.arc(x1 + p.x, midY - 40 + p.y, p.maat, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
      c.restore();
    },

    tekenHud(c) {
      const vw = Spel.breedte;
      const vh = Spel.hoogte;
      const op = operatie;
      const geleverd = M.geleverdTon(op);
      const doel = M.doelTon(op);

      // --- Linksboven: de order en de klok ---
      H.paneel(c, 14, 14, 300, 108);
      c.textBaseline = 'middle';
      H.regel(c, 26, 32, 276, `${order.ton} t ${product.naam}`, w.klok());
      H.regel(c, 26, 52, 276, 'Geleverd', `${geleverd.toFixed(1)} t`,
        geleverd >= doel * 0.999 ? H.HUD.goed : H.HUD.tekst);
      H.regel(c, 26, 72, 276, 'Fysiek doel', `${doel.toFixed(1)} t`);
      H.regel(c, 26, 92, 276, 'Op de bon', `${op.bestelling.toFixed(1)} t`,
        op.retentie > 0 ? H.HUD.let : H.HUD.tekst);
      H.balk(c, 26, 112, 276, 6, geleverd / doel, H.HUD.accent, null);

      // --- Rechtsboven: wie er tegenover je staat ---
      H.paneel(c, vw - 314, 14, 300, 106);
      c.textAlign = 'left';
      c.font = '700 12px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillStyle = H.HUD.tekst;
      c.fillText(`Chief: ${opts.chief.naam}`, vw - 300, 32);
      H.regel(c, vw - 300, 52, 276, 'Meting', omstandigheden.mfm ? 'massaflowmeter' : 'peilen met de stok',
        omstandigheden.mfm ? H.HUD.slecht : H.HUD.goed);
      H.regel(c, vw - 300, 70, 276, 'Deining',
        omstandigheden.deining < 0.1 ? 'vlak' : omstandigheden.deining < 0.4 ? 'licht' : 'flink',
        omstandigheden.deining > 0.4 ? H.HUD.goed : H.HUD.tekst);
      H.regel(c, vw - 300, 88, 276, 'Surveyor', omstandigheden.surveyor ? 'AAN BOORD' : 'geen',
        omstandigheden.surveyor ? H.HUD.slecht : H.HUD.goed);
      H.regel(c, vw - 300, 106, 276, 'Zijn tolerantie',
        `± ${(banden.grens * 100).toFixed(2)} %`, H.HUD.tekstZacht);

      // --- Onderbalk: de bediening ---
      const by = vh - 122;
      H.paneel(c, 14, by, vw - 28, 108);

      H.meter(c, 78, by + 54, 38, op.pompStand, op.pompStand > 0.9 ? H.HUD.let : H.HUD.accent,
        'm³/uur', `${Math.round(op.debiet)}`);
      const drukF = op.druk / (omstandigheden.manifoldMax + 2);
      H.meter(c, 178, by + 54, 38, drukF,
        op.druk > omstandigheden.manifoldMax ? H.HUD.slecht : H.HUD.goed,
        'bar', op.druk.toFixed(1));

      // Ullage van de ontvangende tank, met de aftopgrens erin.
      const vulling = op.ontvangenM3 / op.ontvangendeTank;
      H.zoneBalk(c, 240, by + 34, 240, 10, vulling,
        { veilig: M.AFTOPGRENS * 0.86, grens: M.AFTOPGRENS, hard: 1 },
        `Ontvangende tank — ${(vulling * 100).toFixed(0)} %`);
      if (vulling > M.AFTOPGRENS) {
        c.fillStyle = H.HUD.let;
        c.font = '700 11px "Inter", "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillText('AFTOPPEN — debiet terug', 240, by + 62);
      } else if (op.verstreken < M.AANLOOPMINUTEN && gestart) {
        c.fillStyle = H.HUD.let;
        c.font = '700 11px "Inter", "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillText(`AANLOOP — nog ${Math.ceil(M.AANLOOPMINUTEN - op.verstreken)} min laag`, 240, by + 62);
      }

      // Drukopbouw in de slang: de opvolger van de spanningsbalk in het want.
      H.zoneBalk(c, 240, by + 80, 240, 10, op.drukpiek,
        { veilig: 2, grens: 5, hard: 9 }, 'Spanning in de slang');

      // De verschilbalk: het hart van het spel. Wat je achterhoudt, afgezet
      // tegen wat déze chief in déze omstandigheden nog laat passeren.
      //
      // Zolang er nog nauwelijks iets door de slang is, is het wérkelijke
      // tekort honderd procent en zegt de balk niets — hij zou de hele operatie
      // op rood staan. Tot halverwege tonen we daarom het plan, daarna het echte
      // tekort. Dat is ook precies wanneer het ertoe doet: vanaf dat punt maakt
      // eerder stoppen het gat groter, en dát moet je kunnen zien.
      const echt = M.verschilFractie(op);
      const vroeg = geleverd < doel * 0.5;
      const verschil = vroeg ? op.retentie : echt;
      H.zoneBalk(c, 520, by + 34, 260, 12, Math.max(0, verschil), banden,
        `${vroeg ? 'Voorgenomen tekort' : 'Tekort op de bon'} — ${(Math.max(0, verschil) * 100).toFixed(2)} %`);
      c.font = '600 11px "Inter", "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillStyle = verschil <= banden.veilig ? H.HUD.goed
        : verschil <= banden.grens ? H.HUD.let : H.HUD.slecht;
      c.fillText(verschilWoord(Math.max(0, verschil)), 520, by + 62);
      H.regel(c, 520, by + 84, 260, 'Doel achterhouden',
        `${(op.retentie * 100).toFixed(2)} % — ${(op.bestelling * op.retentie).toFixed(1)} t`,
        op.retentie > 0 ? H.HUD.let : H.HUD.tekstZacht);

      // Bediening rechtsonder.
      c.textAlign = 'right';
      c.font = '500 10px "Inter", "Segoe UI", system-ui, sans-serif';
      c.fillStyle = H.HUD.tekstZacht;
      const regels = gestart
        ? ['W / S — pomp harder of zachter', 'Enter — stoppen en de bon opmaken',
          `F — versneld (${snel ? 'aan' : 'uit'})`, 'B — briefing en retentiedoel']
        : ['Spatie — openen', 'B — briefing en retentiedoel'];
      regels.forEach((r, i) => c.fillText(r, vw - 26, by + 26 + i * 15));

      // --- Meldingen ---
      c.textAlign = 'center';
      c.font = '600 13px "Inter", "Segoe UI", system-ui, sans-serif';
      meldingen.forEach((m, i) => {
        const a = clamp(4 - m.t, 0, 1);
        if (a <= 0) return;
        c.globalAlpha = a;
        c.fillStyle = m.kleur === 'slecht' ? H.HUD.slecht : m.kleur === 'goed' ? H.HUD.goed : H.HUD.let;
        c.fillText(m.tekst, vw / 2, 150 + i * 20);
      });
      c.globalAlpha = 1;

      if (!gestart && !afgerond) {
        c.font = '700 16px "Inter", "Segoe UI", system-ui, sans-serif';
        c.fillStyle = H.HUD.tekst;
        c.fillText('Druk op spatie om te openen', vw / 2, vh * 0.36);
      }
    },
  };

  /** De briefing: alles wat de speelruimte bepaalt, plus de retentieknop. */
  function toonBriefing() {
    let keuze = operatie.retentie;
    const scherm = UI.toonScherm({
      titel: `Voorbespreking — ${order.schip}`,
      onder: `${order.ton} t ${product.naam} · ${Spel.wereld.vaarwater.ligIndex[order.ligplaats].naam}`,
      breed: true,
      bouw(body) {
        const p = document.createElement('p');
        p.className = 'verhaal';
        p.innerHTML = `De chief komt aan dek. <b>${opts.chief.naam}.</b> ${opts.chief.beeld || ''}`
          + `<br><br>Er wordt ${omstandigheden.mfm
            ? '<b>met een massaflowmeter</b> gemeten — daar valt weinig aan te schuiven'
            : '<b>gepeild met de stok</b>'}`
          + `, ${omstandigheden.deining > 0.4 ? 'en het schip ligt <b>flink te werken</b> in de deining'
            : omstandigheden.deining > 0.1 ? 'bij lichte deining' : 'in <b>vlak water</b>'}.`
          + (omstandigheden.surveyor ? ' <b class="waarschuwing">Er staat een surveyor bij.</b>' : '')
          + (opts.teLaat ? ' Je bent te laat, en dat weet hij.' : '');
        body.appendChild(p);

        const tabel = UI.tabel(
          [{ label: 'Wat het bepaalt' }, { label: 'Nu', rechts: true }],
          [
            { cellen: [{ tekst: 'Meetmethode' }, { tekst: omstandigheden.mfm ? 'massaflowmeter' : 'peilen', klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Deining' }, { tekst: omstandigheden.deining.toFixed(2), klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Partijgrootte' }, { tekst: `${order.ton} t`, klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Temperatuurverschil' }, { tekst: `${omstandigheden.temperatuurVerschil.toFixed(0)} °C`, klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Jouw meetopstelling' }, { tekst: `+${(omstandigheden.meetbonus * 100).toFixed(0)} %`, klasse: 'rechts' }] },
            { cellen: [{ tekst: 'Argwaan in de markt' }, { tekst: `${Spel.schipper.argwaan.toFixed(0)}`, klasse: 'rechts' }] },
            {
              klasse: 'nadruk',
              cellen: [{ tekst: '<b>Wat hij laat passeren</b>' },
                { tekst: `<b>± ${(banden.grens * 100).toFixed(2)} %</b>`, klasse: 'rechts' }],
            },
          ],
        );
        body.appendChild(tabel);

        const wrap = document.createElement('div');
        wrap.className = 'schuifgroep';
        const label = document.createElement('label');
        label.innerHTML = 'Hoeveel hou je achter?';
        const schuif = document.createElement('input');
        schuif.type = 'range';
        schuif.min = '0';
        schuif.max = String(Math.round(M.MAX_RETENTIE * 10000));
        schuif.step = '5';
        schuif.value = String(Math.round(keuze * 10000));
        const uit = document.createElement('div');
        uit.className = 'schuifwaarde';
        const werkBij = () => {
          keuze = Number(schuif.value) / 10000;
          const ton = order.ton * keuze;
          const oordeel = keuze <= banden.veilig ? ['veilig', 'goed']
            : keuze <= banden.grens ? ['hij gaat vragen stellen', 'let']
              : ['dit wordt een protest', 'slecht'];
          uit.innerHTML = `<b>${(keuze * 100).toFixed(2)} %</b> — ${ton.toFixed(1)} ton`
            + ` &nbsp;·&nbsp; <span class="${oordeel[1]}">${oordeel[0]}</span>`
            + `<br><span class="zacht">Ruwe waarde: ${Math.round(ton * Spel.wereld.prijsVan(order.product) * 0.72).toLocaleString('nl-NL')} euro,`
            + ` als je het kwijt kunt.</span>`;
        };
        schuif.addEventListener('input', werkBij);
        werkBij();
        wrap.appendChild(label);
        wrap.appendChild(schuif);
        wrap.appendChild(uit);
        body.appendChild(wrap);
      },
      knoppen: [
        {
          label: 'Aan het werk',
          actie: () => {
            operatie.retentie = clamp(keuze, 0, M.MAX_RETENTIE);
            scherm.sluit();
          },
          esc: true,
        },
      ],
    });
  }

  return scene;
}
