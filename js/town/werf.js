// Afgesplitst van town.js: de scheepswerf — herstel, geschut, toerusting en handel in schepen.
import { Game, nieuwSchip, ruimVrij, vlootScheepsvolkMax } from '../game.js';
import { SCHEPEN, SCHIP_INDEX, UPGRADES, WAAR_INDEX, metLidwoord } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, fmtGold, el, makeRng } from '../util.js';

function werf(stad, ouder) {
  const s = Game.speler;

  const scherm = UI.toonScherm({
    titel: 'De scheepswerf',
    onder: `${stad.naam} · teer, hennep en zaagsel`,
    breed: true,
    bouw(body, sch) {
      body.appendChild(UI.maakFiguur('timmerman'));
      const p = el('p', 'verhaal');
      p.innerHTML = `De baas van de werf neemt je vloot op. "Er valt genoeg te doen, kapitein." <br><small>Goud: <b>${fmtGold(s.goud)}</b></small>`;
      body.appendChild(p);
      if (sch._bericht) {
        const b = el('p', 'kroeg-bericht');
        b.innerHTML = sch._bericht;
        body.appendChild(b);
      }

      // Eigen vloot.
      const eigen = el('div', 'werf-blok');
      eigen.innerHTML = '<h3>Jouw vloot</h3>';
      for (let i = 0; i < s.schepen.length; i++) {
        const sh = s.schepen[i];
        const t = SCHIP_INDEX[sh.type];
        const rij = el('div', 'werf-rij werf-rij-eigen');
        const kosten = herstelKosten(sh);
        const up = sh.upgrades || {};
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}${i === 0 ? ' <em>(vlaggenschip)</em>' : ''}</span>` +
          `<span class="werf-stat">romp ${Math.round(sh.romp)}/${sh.maxRomp} · ${sh.geschut}/${t.geschut} stukken` +
          (up.roer || up.zeilen || up.romp || up.weer
            ? ` · toerusting z${up.zeilen || 0}/r${up.roer || 0}/h${up.romp || 0}` +
              `${up.weer ? `/w${up.weer}` : ''}`
            : '') +
          `</span>`;
        const acties = el('div', 'werf-acties');

        const herstel = el('button', 'mini', kosten > 0 ? `Kalfateren (${fmtGold(kosten)})` : 'Gaaf');
        herstel.disabled = kosten <= 0 || s.goud < kosten;
        herstel.onclick = () => {
          s.goud -= kosten;
          sh.romp = sh.maxRomp;
          audio.sfx.munt();
          sch._bericht = `${metLidwoord(sh.type, true)} is weer helemaal zeewaardig.`;
          sch.ververs();
        };
        acties.appendChild(herstel);

        const kanonPrijs = 480;
        const kanon = el('button', 'mini', `+1 stuk geschut (${fmtGold(kanonPrijs)})`);
        // Elk stuk weegt twee eenheden ruim, op elk schip van de vloot.
        kanon.disabled = sh.geschut >= t.geschut || s.goud < kanonPrijs || ruimVrij(sh) < 2;
        if (sh.geschut < t.geschut && ruimVrij(sh) < 2) kanon.title = 'Geen plaats in het ruim: elk stuk weegt twee eenheden.';
        kanon.onclick = () => {
          s.goud -= kanonPrijs;
          sh.geschut++;
          audio.sfx.munt();
          sch._bericht = 'Er wordt een extra stuk geschut aan boord gehesen.';
          sch.ververs();
        };
        acties.appendChild(kanon);

        // Toerusting: verbeter zeilen, romp of roer op de werf. `weer` heeft
        // twee niveaus: eerst het weerglas, daarna een fijner weerglas.
        for (const [key, upg] of Object.entries(UPGRADES)) {
          const lvl = up[key] || 0;
          const prijs = Math.round(upg.basis * Math.pow(1.6, lvl));
          let label;
          if (key === 'weer') label = lvl === 0 ? 'Weerglas' : 'Fijn weerglas';
          else label = upg.naam;
          const k = el('button', 'mini', `${label} (${fmtGold(prijs)})`);
          k.disabled = lvl >= upg.max || s.goud < prijs || (key === 'romp' && sh.romp < sh.maxRomp - 1);
          if (key === 'romp' && lvl < upg.max && sh.romp < sh.maxRomp - 1) {
            k.title = 'Eerst kalfateren: op een lekke romp zet de werf geen zwaardere spanten.';
          } else if (lvl >= upg.max) {
            k.title = 'Hier valt niets meer aan te verbeteren.';
          }
          k.onclick = () => {
            s.goud -= prijs;
            up[key] = lvl + 1;
            if (key === 'romp') {
              // Versteviging vergroot de max-romp en herstelt dat verschil.
              const extra = Math.round(SCHIP_INDEX[sh.type].romp * upg.stap);
              sh.maxRomp += extra;
              sh.romp = Math.min(sh.maxRomp, sh.romp + extra);
            }
            audio.sfx.munt();
            sch._bericht = `Verbetering voltooid: ${upg.naam.toLowerCase()} op ${metLidwoord(sh.type)} (trap ${lvl + 1}).`;
            sch.ververs();
          };
          acties.appendChild(k);
        }

        if (i > 0) {
          const verkoop = el('button', 'mini rood', `Van de hand doen (${fmtGold(scheepsWaarde(sh))})`);
          verkoop.onclick = async () => {
            const waarde = scheepsWaarde(sh);
            const lading = sh.lading.reduce((a, b) => a + b, 0);
            const past = Math.min(lading, Math.max(0, ruimVrij(s.schepen[0])));
            const ja = await UI.vraag(
              `${metLidwoord(sh.type, true)} verkopen?`,
              `De werf biedt <b>${fmtGold(waarde)} goud</b>.` +
                (lading > 0
                  ? past >= lading
                    ? ` De ${lading} eenheden lading gaan over naar je vlaggenschip.`
                    : ` Van de ${lading} eenheden lading past er maar ${past} in je vlaggenschip; <b>de rest gaat verloren</b>.`
                  : ''),
              [
                { label: 'Verkopen', waarde: true, soort: 'gevaar' },
                { label: 'Houden', waarde: false, esc: true },
              ]
            );
            if (!ja) return;
            verhuisLading(sh, s.schepen[0]);
            s.goud += waarde;
            s.schepen.splice(s.schepen.indexOf(sh), 1);
            // Minder kooien: wie geen hangmat meer heeft, monstert af.
            const max = vlootScheepsvolkMax(s);
            const weg = Math.max(0, s.scheepsvolk - max);
            s.scheepsvolk -= weg;
            audio.sfx.munt();
            sch._bericht =
              `${metLidwoord(sh.type, true)} is van de hand gedaan.` +
              (weg > 0 ? ` ${weg} man monstert af: er is geen plaats meer voor ze.` : '');
            sch.ververs();
          };
          acties.appendChild(verkoop);

          const vlag = el('button', 'mini', 'Tot vlaggenschip maken');
          vlag.onclick = () => {
            const oud = s.schepen[0];
            s.schepen[0] = sh;
            s.schepen[i] = oud;
            // De lading verhuist mee voor zover het ruim het toelaat: koopman en
            // rantsoen kijken alleen naar het vlaggenschip, en achtergebleven
            // proviand liet je volk anders verhongeren met eten aan boord.
            const over = verhuisLading(oud, sh);
            sch._bericht =
              `Je hijst je vlag op ${metLidwoord(sh.type)}.` +
              (over > 0 ? ` ${over} eenheden lading passen niet en blijven op ${metLidwoord(oud.type)}.` : '');
            sch.ververs();
          };
          acties.appendChild(vlag);
        }
        rij.appendChild(acties);
        eigen.appendChild(rij);
      }
      body.appendChild(eigen);

      // Te koop.
      const markt = el('div', 'werf-blok');
      markt.innerHTML = '<h3>Te koop op de helling</h3>';
      for (const t of teKoop(stad)) {
        const rij = el('div', 'werf-rij');
        rij.innerHTML =
          `<span class="werf-naam">${t.naam}</span>` +
          `<span class="werf-stat">romp ${t.romp} · ${t.geschut} stukken · ` +
          `<span title="Laadruimte als alle stukken aan boord zijn; elk stuk weegt twee eenheden.">laadruim ${t.ruim - t.geschut * 2}</span>` +
          ` · ${t.scheepsvolk} koppen</span>`;
        const acties = el('div', 'werf-acties');
        const prijs = Math.round(t.prijs * (1.25 - stad.grootte * 0.04));
        const koop = el('button', 'mini', `Aanschaffen (${fmtGold(prijs)})`);
        koop.disabled = s.goud < prijs || s.schepen.length >= 8;
        koop.onclick = () => {
          s.goud -= prijs;
          s.schepen.push(nieuwSchip(t.id));
          audio.sfx.fanfare();
          sch._bericht = `Een gloednieuwe ${t.naam.toLowerCase()} ligt klaar aan de kade.`;
          sch.ververs();
        };
        acties.appendChild(koop);
        rij.appendChild(acties);
        markt.appendChild(rij);
      }
      body.appendChild(markt);
    },
    knoppen: (sch) => [{ label: 'Terug', esc: true, actie: () => { sch.sluit(); ouder.ververs(); } }],
  });
  return scherm;
}

/**
 * Zet de lading van `van` over naar `naar` voor zover die ruimte heeft,
 * proviand eerst. Geeft terug hoeveel er achterbleef.
 */
function verhuisLading(van, naar) {
  const p = WAAR_INDEX.proviand;
  const volgorde = [p, ...van.lading.map((_, i) => i).filter((i) => i !== p)];
  for (const i of volgorde) {
    const n = Math.min(van.lading[i], Math.max(0, ruimVrij(naar)));
    van.lading[i] -= n;
    naar.lading[i] += n;
  }
  return van.lading.reduce((a, b) => a + b, 0);
}

function herstelKosten(schip) {
  return Math.round((schip.maxRomp - schip.romp) * 26);
}

function scheepsWaarde(schip) {
  const t = SCHIP_INDEX[schip.type];
  const up = schip.upgrades || {};
  const upgradeBonus = (up.zeilen || 0) * 0.06 + (up.roer || 0) * 0.05 + (up.romp || 0) * 0.08;
  return Math.round(t.prijs * 0.45 * clamp(schip.romp / t.romp, 0.2, 1) * (1 + upgradeBonus));
}

function teKoop(stad) {
  // Grotere steden bieden zwaardere schepen aan.
  const max = stad.grootte;
  const lijst = SCHEPEN.filter((t) => {
    if (t.prijs > 3000 + max * 5000) return false;
    if (stad.soort === 'roversnest' && t.ruim > 200) return false;
    return true;
  });
  // Vaste, per stad herhaalbare selectie zodat het aanbod niet elke keer wisselt.
  const r = makeRng(stad.id * 7919 + 13);
  const uit = [];
  const kopie = [...lijst];
  const n = Math.min(kopie.length, 2 + max);
  for (let i = 0; i < n; i++) {
    uit.push(kopie.splice(Math.floor(r() * kopie.length), 1)[0]);
  }
  return uit.sort((a, b) => a.prijs - b.prijs);
}

export { werf, herstelKosten, scheepsWaarde, teKoop, verhuisLading };
