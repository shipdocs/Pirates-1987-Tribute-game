# AGENTS.md — Bunkervaart

Richtlijnen voor agenten die aan dit deelproject werken. De hoofd-`AGENTS.md`
één map hoger gaat over *Zeeroverij*; veel ervan geldt hier onverkort, en dat
staat hieronder expliciet herhaald in plaats van dat je het moet gaan zoeken.

## Project

"Bunkervaart" — je bent schipper op een bunkerboot in de ARA-regio. Zelfde motor
als Zeeroverij, volledig andere gameplay. Pure browser: vanilla HTML/CSS/
ES-modules, canvas 2D, Web Audio. **Geen buildstap, geen package.json, geen
dependencies, geen tests of linters.**

## Run

- Moet over HTTP (ES-modules falen op `file://`):
  `python3 -m http.server 8000` → `http://localhost:8000/bunkervaart/`

## Kritieke, niet-vanzelfsprekende feiten

- **Alle code, namen en commentaar staan in het Nederlands**, net als in
  Zeeroverij. Het *vakjargon* blijft onvertaald waar dat de vaktaal is: stem,
  ullage, aftoppen, bunkerbon, letter of protest, MFM.
- **Eén wereldeenheid is één meter.** Diepten in meters t.o.v. het reductievlak,
  breedtes zijn de bevaarbare geulbreedte, snelheden in m/s. Anders dan in
  Zeeroverij is er geen kunstmatige tijdschaal in de natuurkunde verwerkt: de
  klok versnelt (`TIJDSTANDEN` in `varen.js`), de meters niet.
- **De projectie corrigeert voor de breedtegraad.** Op 51,85° is een
  lengtegraad nog maar 62 % van een breedtegraad (`COS_LAT` in `vaarwater.js`).
  Zonder die factor krijgt Nederland de verhoudingen van Ierland. In de Caraïben
  viel dit weg omdat de factor daar 0,95 is — dus dit is precies het soort ding
  dat je bij het overzetten stilzwijgend fout doet.
- **De kaart is statisch, niet gezaaid.** Zeeroverij bouwde elke wereld uit een
  zaadje; hier is de ARA-regio elke keer dezelfde, want die leer je juist kennen.
  Het *zaadje* stuurt alleen de veranderlijke wereld: markt, mist, sluisdrukte,
  verkeer.
- **Water is de uitzondering, land de regel.** De tekenlaag vult het beeld met
  land en *streept* het vaarwater erin als dikke lijnen (`tekenWereld` in
  `render/kaart.js`). Een corridor is een `Path2D` die drie keer gestreept
  wordt — oever, talud, geul — en daarmee is de dwarsdoorsnede van een rivier
  klaar zonder één polygoon.
- **Ligplaatsen moeten in het vaarwater liggen.** Verschuif je een vaarweg, dan
  verschuiven de ligplaatsen eraan niet mee, en een ligplaats naast het water is
  onbereikbaar zonder dat er zichtbaar iets misgaat. `#controleerLigplaatsen()`
  waarschuwt in de console; negeer die melding niet.
- **Een havenbekken hecht halverwege aan de rivier aan, niet op een uiteinde.**
  De graaf verbindt daarom niet alleen samenvallende uiteinden maar ook elk
  uiteinde dat binnen de geul van een ándere vaarweg valt (`#ligtIn`). Zonder
  dat was de Botlek een eiland in de graaf en meldde het reisplan doodleuk dat
  er geen route bestond — terwijl je er gewoon heen kon varen.
- **`js/overslagmodel.js` is bewust headless** (geen canvas, DOM, audio of
  `Math.random`; toeval komt binnen als meegegeven rng), precies zoals
  `gevechtsmodel.js` in Zeeroverij. Hou dat zo: de volume-naar-massasom en de
  meetonzekerheid moeten buiten de browser tegen echte tabelwaarden na te
  rekenen zijn. De VCF is gecontroleerd tegen ASTM 54B (VLSFO 0,9866 bij 50 °C,
  gasolie 0,9711).
- **De speelruimte is een model, geen dobbelsteen.** `meetruis()` volgt volledig
  uit zichtbare omstandigheden — meetmethode, deining, temperatuurverschil,
  partijgrootte. Het enige toeval zit in de méting van de chief. Bouw daar niets
  bovenop: als een betrapping niet te herleiden is tot iets wat de speler kon
  zien, is de kernmechaniek kapot.
- **`TOLERANTIE_PLAFOND` is geen smaakinstelling.** Zonder plafond loopt de
  tolerantie op een kleine partij in deining op tot boven `MAX_RETENTIE`, en dan
  is de maximale marge gratis en verdwijnt de hele afweging. Controleer bij elke
  balanswijziging dat de tolerantie nergens `MAX_RETENTIE` haalt.
- **Niet-geleverde lading is geen marge.** Alleen het vooraf voorgenomen deel
  telt als jouw product; de rest gaat terug naar de bevrachter. Zonder dat
  onderscheid is een gesprongen slang de winstgevendste afloop van het spel —
  dat is precies wat er gebeurde toen die regel er nog niet was.
- **Netjes varen moet een bestaan opleveren.** Dat is de belangrijkste
  balansregel. Alleen dan is de marge een keuze in plaats van een verplichting.
- **Een scène mag een toets opeisen** via `neemtF`; de spelkern pakt `F` anders
  af voor het miniatuureffect en dan doet één druk twee dingen.
- **`werkBij` stopt zodra er een scherm openstaat** (`UI.ietsOpen()`). Anders
  loopt de klok door terwijl de speler een dialoog leest — en dan mist hij zijn
  venster zonder iets fout te doen.

## Overgenomen valkuilen (uit Zeeroverij, onverkort geldig)

1. **Bewegende offsets integreer je per frame**, nooit `tijd × huidige snelheid`.
   Hier erger dan daar: de stroom kentert elke zes uur, dus zo'n positie zou bij
   elke kentering in één klap verspringen. Zie `drift` in `varen.js`.
2. **Een canvas-blur reikt ongeveer 3× zijn straal** — teken de bron ruimer, zie
   `tekenMiniatuur()` in `spel.js`.
3. **Constanten die twee systemen delen, staan in één helper.** `HUD` in
   `render/hud.js` spiegelt de CSS-tokens boven in `css/spel.css`.
4. **Een getekend schip gaat nooit boven schaal 1.** `scheepSchaal()` groeit
   alleen *onder* de standaardzoom, zodat een boot op het overzicht vindbaar
   blijft zonder dat de romp over de kade gaat hangen.
5. **Deterministische spreiding gebruikt een hash, geen reeks** — en elke
   onafhankelijke trekking krijgt een eigen zaad. Zonder dat leverden
   `ruis(x)` en `ruis(x+1)` hetzelfde getal en stond de hele havenbebouwing op
   een rij. Zie `ruis(ix, iy, zaad)` in `render/kaart.js`.
6. **Wat niet beweegt, wordt gebakken** — via `sprite.js`, niet met de hand.
   Klanten: de scheepsrompen in `render/schepen.js`.
7. **Een cachelimiet staat in pixels, niet in stuks**, en je gooit de langst
   ongebruikte eruit in plaats van de hele cache.
8. **Deeltjes delen een tekenfunctie, geen gedrag.**

## Meten in de browser

Playwright met de vastgezette Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`),
de repo over HTTP, en de spelstaat via `window.__B`. Traps die hier al tijd
hebben gekost:

- **Kijk niet naar een screenshot om te bepalen of iets getekend wordt.** De
  eigen bak was op de speelzoom dertig beeldpunten donkerbruin op donker water
  en leek te ontbreken; pixels tellen rond het schermmidden liet meteen zien dat
  hij er wél stond en het een leesbaarheidsprobleem was, geen bug.
- **Zet `Spel.miniatuur = false` voordat je pixels leest**, anders meet je het
  vervaagde beeld.
- **Teken je gecontroleerde frame en lees de pixels in dezelfde synchrone stap**;
  de spellus draait tijdens `page.evaluate` gewoon door.
- **Toets de graaf, niet je gevoel.** Alle paren ligplaatsen langs `route()`
  laten lopen kost een halve seconde en vindt elk losgeraakt havenbekken.

## Stijl

- 2 spaties, enkele aanhalingstekens, puntkomma's; regels rond ~100 tekens.
- Geëxporteerde helpers krijgen `/** Nederlandse JSDoc */`; secties met
  `// --- Naam ---`.
- Defensieve `try/catch` rond `localStorage` en Web Audio; blijf zacht falen.
- Leid waarden af met `clamp`, `lerp`, `normAngle` uit `util.js`.
