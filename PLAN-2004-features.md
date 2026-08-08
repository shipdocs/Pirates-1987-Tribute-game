# Plan: de vier gaten uit de 2004-vergelijking dichten

*Uitvoeringsplan bij [`ANALYSE-pirates-2004-remake.md`](ANALYSE-pirates-2004-remake.md).
Alles binnen de bestaande opzet: geen build-stap, geen dependencies, Nederlandse
code, canvas + SVG + Web Audio.*

---

## Uitgangspunten

- **Geen nieuwe techniek.** Elk onderdeel hieronder hangt aan systemen die er al
  liggen: vloten ([`world.js`](js/world.js:558)), de zeekaart
  ([`sail.js`](js/sail.js:653)), het duel ([`duel.js`](js/duel.js:21)), de
  havenschermen ([`town.js`](js/town.js:18)) en de beloningsafhandeling
  ([`battle.js`](js/battle.js:639)).
- **Save blijft compatibel.** `bewaar()` schrijft zaadje + veranderingen; de
  hele `speler` gaat mee. Nieuwe spelerstoestand komt dus vanzelf in de save.
  Wereldtoestand die níét uit het zaadje volgt (legendes) moet expliciet mee.
  → **`versie: 4`** in [`game.js`](js/game.js:279), met migratie in `laad()`.
- **Determinisme.** Alles wat uit de wereld komt via `makeRng(seed)`; losse
  gebeurtenissen mogen `Math.random`.
- **Balans meetbaar houden.** Wat het gevecht raakt, gaat door
  [`gevechtsmodel.js`](js/gevechtsmodel.js:1) — dat bestand blijft
  canvas-, DOM- en audioloos.

---

## Fase 1 — De cast (het grootste gat)

> Doel: de zee bevolken met namen. Dit is de spil: fase 1 maakt fase 2 en 4
> mogelijk, dus het gaat eerst.

### 1.1 Data: `LEGENDES` in [`data.js`](js/data.js:204)

Een vaste lijst van zes à acht beruchte kapiteins. Geen willekeur — vaste
namen zijn juist het punt.

```js
export const LEGENDES = [
  {
    id: 'barbanegra',
    naam: 'Roderick Barbanegra',
    schip: 'oorlogsgaljoen',
    natie: 'piraat',
    thuis: 'spanje',      // waar hij het liefst rondhangt (jachtgebied)
    kracht: 1.35,         // vermenigvuldiger op kanonnen en bemanning
    buit: 'koperhuid',    // uniek uitrustingsstuk, zie 1.4
    gerucht: 'Barbanegra ligt op de loer tussen {stad} en de kust.',
  },
  // …
];

export const LEGENDE_INDEX = Object.fromEntries(LEGENDES.map((l) => [l.id, l]));
```

De bestaande `KAPITEIN_NAMEN` blijft staan voor gewone vloten en duels.

### 1.2 Toestand op de speler ([`game.js`](js/game.js:184))

```js
// in maakSpeler()
legendes: Object.fromEntries(LEGENDES.map((l) => [l.id, { verslagen: false, tip: null }])),
```

Migratie in `laad()`: ontbrekende ids bijvullen, precies zoals `familie` en
`opdracht` nu al worden gesaneerd ([`game.js`](js/game.js:344)).

### 1.3 Spawnen: [`world.js`](js/world.js:558)

- `spawnVloot()` krijgt een optionele `legendeId`. Is die gezet, dan:
  - `type` = `legende.schip`, `naam` = `legende.naam`, `natie` = `legende.natie`;
  - `kanonnen` en `bemanning` op **100 %** van het type × `kracht` (gewone
    vloten zitten nu op 45–85 %, [`world.js`](js/world.js:604));
  - `goud` ruim hoger, `legende: id` als markering.
- In `vlotenTik()` bij de aanvulregel (`while (this.vloten.length < 24)`):
  hoogstens **één** legende tegelijk op zee, en alleen als hij nog niet
  verslagen is. Kans per aanvulling ~8 %, bij voorkeur binnen het jachtgebied
  van zijn `thuis`-natie.
- `#jachtKans()` ([`world.js`](js/world.js:751)): een legende jaagt altijd —
  hij loopt niet weg voor een sterkere kapitein.
- Bij despawn in de haven (`this.vloten.splice`) een legende **niet**
  verwijderen; hij kiest een nieuw doel.

### 1.4 Buit: unieke uitrusting ([`data.js`](js/data.js:257), [`battle.js`](js/battle.js:639))

Nieuwe tabel náást `UPGRADES` — deze zijn niet te koop:

```js
export const ITEMS = {
  koperhuid:  { naam: 'Koperen huidbeslag', effect: 'snelheid', waarde: 0.06 },
  fijnkruit:  { naam: 'Fijn kruit',         effect: 'dracht',   waarde: 0.12 },
  katoenzeil: { naam: 'Katoenen zeilen',    effect: 'hoogte',   waarde: 0.04 },
  // …
};
```

Opslag: `schip.items = []` in `nieuwSchip()`. De effecten worden opgeteld waar
de bestaande upgrades al worden gelezen — `scheepsBonus()`
([`world.js`](js/world.js:664)) en het gevechtsmodel. Items blijven bij het
**vlaggenschip** en verhuizen mee bij het wisselen van vlaggenschip op de werf.

In `beloonOverwinning()` een tak erbij: is `vloot.legende` gezet, dan
`s.legendes[id].verslagen = true`, roem +80, het item naar het vlaggenschip, en
een eigen dialoog met fanfare.

### 1.5 Zichtbaar maken

- **Kroeg** ([`town.js`](js/town.js:395)): geruchten over legendes krijgen
  voorrang boven de generieke `GERUCHTEN`; ze zetten `s.legendes[id].tip` met
  een stad, precies zoals de familie-tip nu werkt
  ([`town.js`](js/town.js:513)).
- **Zeekaart** ([`sail.js`](js/sail.js:653)): een doodskopmarkering bij de
  getipte stad zolang de tip vers is.
- **Ontmoeting op zee** ([`sail.js`](js/sail.js:559)): eigen tekst met zijn
  naam in plaats van "een piratenschip".
- **Bemanningsscherm** ([`sail.js`](js/sail.js:759)): lijstje verslagen
  legendes — dat is het trofeeënkabinet.

**Werk:** middel. Raakt `data.js`, `game.js`, `world.js`, `battle.js`,
`town.js`, `sail.js`, maar overal in kleine stukken.

---

## Fase 2 — De schurk en het familielid

> Bouwt direct op fase 1: de schurk *is* een legende, met een eigen staart.

- `FAMILIE_ROLLEN` blijft; erbij komt één vaste antagonist in `LEGENDES` met
  `schurk: true`, bijvoorbeeld de man die je familielid vasthoudt.
- `zoekFamilie()` ([`town.js`](js/town.js:1338)) verandert van
  *eindpunt* in *scharnier*: je vindt niet je familielid maar het spoor —
  "hij is meegevoerd door …". Vanaf dat moment mag de schurk spawnen.
- Het familielid komt vrij bij het verslaan van de schurk, afgehandeld in
  `beloonOverwinning()`: `s.familie.gevonden = true`, roem +120, en een slot in
  de epiloog.
- De schurk is **zwaarder dan de rest** (`kracht` ~1.6) en verschijnt pas na de
  eerste tip — anders loop je hem op dag drie tegen het lijf.

**Werk:** klein-middel, mits fase 1 er ligt.

---

## Fase 3 — Verouderen met gevolgen ✔ uitgevoerd

> Losstaand en goedkoop; kan parallel aan fase 1.
>
> **Stand:** doorgevoerd. `leeftijdFactor()` en `conditieWoord()` staan in
> [`game.js`](js/game.js:254), het duel leest ze
> ([`duel.js`](js/duel.js:21)), het volk mort vanaf 55
> ([`sail.js`](js/sail.js:371)) en een bevriende haven biedt vanaf 62 het
> pensioen aan ([`town.js`](js/town.js:57)). Save-versie staat op 4, met
> migratie voor `startLeeftijd`, `leeftijd` en `pensioenGevraagd`.
> Eén afwijking van het plan hieronder: het meesterschermer-talent blijkt
> ruwweg de héle verouderingsspanne waard, niet tien jaar — zie de noot bij
> punt 2.

`s.leeftijd` bestaat al ([`sail.js`](js/sail.js:226)) maar wordt nergens
gelezen. Toevoegen:

1. **Helper** in [`game.js`](js/game.js:254), naast `talentBonus`:
   ```js
   /** 1.0 tot ~40 jaar, daarna zakkend naar 0.6 rond de 65. */
   export function leeftijdFactor(s) {
     return clamp(1 - Math.max(0, s.leeftijd - 40) * 0.011, 0.6, 1);
   }
   ```
2. **Duel** ([`duel.js`](js/duel.js:21)): `windupTijd` — het venster waarin je
   kunt pareren — wordt vermenigvuldigd met `0,5 + 0,5 × fit`, en de adem komt
   trager terug (`dt * 0.3 * fit`). Op zijn oudst is het pareervenster dus een
   vijfde korter.
   *Noot na uitvoering:* het meesterschermer-talent zet `+0.12` op een
   windup van ruwweg een halve seconde en is daarmee ongeveer de hele
   verouderingsspanne waard, niet tien jaar zoals hierboven eerst stond.
   Aging zó steil maken dat één talent precies tien jaar dekt, zou het spel
   na je vijftigste onspeelbaar hard maken; de talentkeuze wordt er ook zo al
   interessanter op de lange baan.
3. **Aandringen op pensioen**: vanaf 55 jaar af en toe een melding via de
   bemanning; vanaf 62 een dialoog bij binnenkomst in een bevriende haven met
   `tredAf()` als eerste knop.
4. **Score** ([`game.js`](js/game.js:263)): een bonus voor wie op tijd stopt,
   zodat aftreden een *keuze* wordt en niet alleen een afsluiting.

**Let op:** de moeilijkheidsgraad `scheepsjongen` moet zachter verouderen —
anders straft het leer-niveau juist het hardst.

**Werk:** klein. Vier plekken, geen nieuwe schermen.

---

## Fase 4 — De schatjacht als jacht

> De duurste van de vier, en het meest zichtbare stuk 2004.

Nu leveren vier kaartstukken direct goud op ([`town.js`](js/town.js:498)).
Voorstel: de stukken **narrowen een gebied** op de zeekaart die er al is.

1. **Bij het eerste stuk** wordt een schat geplaatst: een punt op land, dicht
   bij de kust, via `makeRng` uit het zaadje + het aantal gevonden schatten (dus
   reproduceerbaar). Op de speler: `s.schat = { x, y, stukken: 1 }`.
2. **Elk stuk verkleint de zoekcirkel**: 1 stuk ≈ een kwart van de kaart,
   4 stukken ≈ 200 wereldeenheden. De cirkel wordt op de zeekaart getekend
   (`toonKaart`, [`sail.js`](js/sail.js:653)) — geen nieuw scherm.
3. **Graven**: vaar de cirkel in en er verschijnt een knop *Aan land gaan en
   graven*. Een klein dialoogje met vier windrichtingen en warm/koud-terugkoppeling
   ("de bodem wordt zanderiger"), maximaal zes pogingen; daarna is de bemanning
   het zat. Puur `UI.vraag()`-werk, geen nieuwe scène.
4. **Vondst**: goud zoals nu, plus kans op een `ITEM` uit fase 1.4. Daarna
   `s.schat = null` en de teller loopt door voor de volgende kaart.

**Waarom geen aparte graafscène:** een eigen canvas-scène met een schop kost
een veelvoud en voegt weinig toe boven de zeekaart die er al staat en al mooi
is.

**Werk:** middel. Raakt `town.js`, `sail.js`, `render.js` (cirkel op de
minikaart) en `game.js` (save-veld).

---

## Later, als het bovenstaande staat

| Wat | Waarom later | Werk |
|---|---|---|
| **Bestorming met keuzes** — beschieten vanaf zee, belegeren of stormlopen vóór het duel ([`town.js`](js/town.js:1205)) | goede toevoeging, maar raakt de balans van de hele landkant | middel |
| **Smokkelen bij vijandige steden** ([`town.js`](js/town.js:18)) — 's nachts bij de kade handelen met opslag op de prijs en pakkans | maakt een dichte deur tot een keuze; kan pas als de politiek stabiel voelt | klein-middel |
| **Tijdvak kiezen** (1600 / 1640 / 1680) | vooral data, maar raakt wereldopbouw én save-versie; niet mengen met fase 1 | klein-middel |

**Blijft buiten beeld:** 3D, voice, cutscenes, de dans-minigame, handels-minigames,
een tweede gevechtsengine voor het land.

---

## Volgorde en oplevering

```
fase 1  cast              ─┐
fase 3  verouderen        ─┼─ kunnen parallel
fase 2  schurk + familie  ─┘  (2 heeft 1 nodig)
fase 4  schatjacht
```

Per fase één commit-reeks op een eigen tak, en per fase:

1. `data.js` eerst (de tabellen zijn het contract),
2. dan de logica, dan pas de UI en het tekenwerk,
3. save-versie ophogen zodra er spelerstoestand bijkomt, met migratie in
   `laad()` — een bestaande save moet blijven laden.

**Testen** gebeurt met de hand in de browser (er is geen testframework, en dat
blijft zo). Voor de balans van fase 1 is `gevechtsmodel.js` buiten de browser
door te rekenen: hoe lang doet een fregat over een legende met `kracht: 1.35`,
en overleeft een sloep dat überhaupt. Tijdens het spelen is `window.__G` de
snelste weg: `__G.speler.legendes`, `__G.speler.schat`, `__G.speler.leeftijd = 58`.

---

## Wat dit oplevert

Na fase 1–4 heeft het spel wat de remake van 2004 wél had en dit spel niet:
**namen die ergens varen, een schurk om te haten, een schat om op te graven en
een klok die tikt** — zonder één regel 3D, zonder extern bestand en zonder dat
het zeegevecht, de economie of het weer, waar dit spel juist dieper gaat dan
2004, er iets van merkt.
