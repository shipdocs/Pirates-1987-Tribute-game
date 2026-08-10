// Afgesplitst van town.js: gouverneursopdrachten — aannemen en rapporteren.
import { Game, vlaggenschip } from '../game.js';
import { NATIES, WAREN, SCHIP_INDEX, OPDRACHT_SOORTEN } from '../data.js';
import * as UI from '../ui.js';
import * as audio from '../audio.js';
import { clamp, fmtGold } from '../util.js';

/** Maakt een nieuwe opdracht voor deze natie, bij deze gouverneur. */
function maakOpdracht(stad) {
  const s = Game.speler;
  const w = Game.wereld;
  const soorten = ['lever', 'spion', 'verover', 'jacht'];
  const soort = soorten[Math.floor(Math.random() * soorten.length)];
  const andere = w.steden.filter((x) => x !== stad && x.natie === stad.natie);
  const bestemming = andere.length ? andere[Math.floor(Math.random() * andere.length)] : stad;

  const opdracht = {
    soort,
    natie: stad.natie,
    stad: stad.naam,
    goud: 1200 + Math.floor(Math.random() * 2600),
    // Of de opdracht al is volbracht (verover / jacht). Lading-opdrachten
    // worden bij het rapporteren zelf gecontroleerd.
    klaar: false,
  };

  if (soort === 'lever') {
    const waar = WAREN[Math.floor(Math.random() * WAREN.length)];
    opdracht.waar = waar.id;
    opdracht.naam = waar.naam;
    opdracht.aantal = 14 + Math.floor(Math.random() * 26);
    opdracht.bestemming = bestemming.naam;
    opdracht.doe = `breng ${opdracht.aantal} eenheden ${opdracht.naam.toLowerCase()} naar ${bestemming.naam}`;
  } else if (soort === 'spion') {
    const heen = w.steden[Math.floor(Math.random() * w.steden.length)];
    opdracht.van = heen.naam;
    opdracht.bestemming = bestemming.naam;
    opdracht.doe = `haal het pakket op in ${heen.naam} en lever het af in ${bestemming.naam}`;
  } else if (soort === 'verover') {
    opdracht.stadV = bestemming.naam;
    opdracht.doe = `neem ${bestemming.naam} in voor de kroon`;
  } else {
    const vijand = w.steden.find((x) => x.natie !== stad.natie);
    opdracht.natieV = vijand ? vijand.natie : 'spanje';
    opdracht.doe = `breng een ${NATIES[opdracht.natieV].bijv} oorlogsschip tot zinken`;
  }
  return opdracht;
}

async function vraagOpdracht(stad, sch) {
  const s = Game.speler;
  s.opdracht = maakOpdracht(stad);
  const o = s.opdracht;
  const sjabloon = OPDRACHT_SOORTEN[o.soort];
  let tekst = sjabloon.omschrijving
    .replace('{aantal}', o.aantal)
    .replace('{waar}', (o.waar || '').toLowerCase())
    .replace('{bestemming}', o.bestemming)
    .replace('{van}', o.van)
    .replace('{naar}', o.bestemming)
    .replace('{stad}', o.stadV)
    .replace('{natie}', o.natieV ? NATIES[o.natieV].bijv.toLowerCase() : '');
  await UI.vraag(
    sjabloon.titel,
    `"Een opdracht voor een betrouwbaar kapitein.", zegt de gouverneur. ${tekst} ` +
      `"Breng het af en er wacht <b>${fmtGold(o.goud)} goudstukken</b> plus een specerijenvoorraad."`,
    [{ label: 'Ik neem de opdracht aan', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  o.aangenomenDag = s.dag;
  sch._bericht = `Je hebt een opdracht aangenomen: ${o.doe}. Zoek de gouverneur van ${o.stad} op voor je beloning.`;
  sch.ververs();
}

async function rapporteerOpdracht(stad, sch) {
  const s = Game.speler;
  const o = s.opdracht;
  // Verover- en jacht-opdrachten hebben een `klaar`-vlag van de gebeurtenis zelf.
  if ((o.soort === 'verover' || o.soort === 'jacht') && !o.klaar) {
    await UI.vraag(
      'Nog niet af',
      `De gouverneur schudt het hoofd. "U heeft de opdracht nog niet volbracht: ${o.doe}."`,
      [{ label: 'Weer aan het werk', waarde: 'ok' }],
      { figuur: 'gouverneur' }
    );
    sch._bericht = 'De opdracht is nog niet afgerond.';
    sch.ververs();
    return;
  }
  // Spion: je moet de tocht echt hebben gemaakt — minstens een paar dagen
  // (1 week) na het aannemen om te rapporteren.
  if (o.soort === 'spion' && s.dag - (o.aangenomenDag || 0) < 5) {
    await UI.vraag(
      'Nog onderweg?',
      `De gouverneur kijkt op. "U was net nog hier. Het pakket moet in ${o.bestemming} zijn ` +
        'afgegeven — geef het tijd, kapitein."',
      [{ label: 'Terug op zee', waarde: 'ok' }],
      { figuur: 'gouverneur' }
    );
    sch._bericht = 'Rapporteer pas nadat je de reis hebt gemaakt.';
    sch.ververs();
    return;
  }
  // Voor 'lever' moet de lading ook echt in het ruim zitten.
  if (o.soort === 'lever') {
    const schip = vlaggenschip(s);
    const idx = WAREN.findIndex((x) => x.id === o.waar);
    if (idx >= 0 && schip.lading[idx] < o.aantal) {
      await UI.vraag(
        'Nog niet klaar',
        `De gouverneur telt de lading. "U heeft nog niet genoeg ${o.waar.toLowerCase()} in uw ruim.` +
          ` Kom terug wanneer u er ${o.aantal} heeft."`,
        [{ label: 'Voorlopig weer verder', waarde: 'ok' }],
        { figuur: 'gouverneur' }
      );
      sch._bericht = `Opdracht nog niet afgerond. Je mist nog ${Math.max(0, o.aantal - (idx >= 0 ? schip.lading[idx] : 0))} eenheden.`;
      sch.ververs();
      return;
    }
    if (idx >= 0) schip.lading[idx] -= o.aantal;
  }
  // Beloning: goud + specerijen + roem.
  s.goud += o.goud;
  s.gespaard = (s.gespaard || 0) + Math.round(o.goud * 0.4);
  s.roem += o.soort === 'verover' ? 40 : o.soort === 'jacht' ? 30 : 20;
  s.relatie[stad.natie] = clamp(s.relatie[stad.natie] + 12, -100, 100);
  // Extra lading als beloning (specerijen), als er ruim is.
  const schip = vlaggenschip(s);
  const spIdx = WAREN.findIndex((x) => x.id === 'specerijen');
  if (spIdx >= 0 && schip.lading[spIdx] + 10 <= SCHIP_INDEX[schip.type].ruim - schip.geschut * 2) {
    schip.lading[spIdx] += 10;
  }
  audio.sfx.fanfare();
  await UI.vraag(
    'Opdracht volbracht',
    `De gouverneur glundert. "Magnifiek! De kroon vergeet dit niet." Je ontvangt ` +
      `<b>${fmtGold(o.goud)} goudstukken</b> en een voorraad specerijen in uw ruim.`,
    [{ label: 'Met genoegen', waarde: 'ok' }],
    { figuur: 'gouverneur' }
  );
  s.opdracht = null;
  sch._bericht = 'De opdracht is afgerond.';
  sch.ververs();
}

export { maakOpdracht, vraagOpdracht, rapporteerOpdracht };
