# Plan: *Bunkervaart* — Zeeroverij's motor, moderne tijd, ARA-regio

*Hoe we van dit spel — de Caraïben van 1660, zeilen en zeeslagen — een tweede
spel maken dat dezelfde motor gebruikt maar een **volledig ander spel** is.*

**Je bent schipper op een bunkerboot in de ARA-regio.** Je krijgt orders om
zeeschepen te bunkeren op wisselende plekken: aan de kade, op de rede, bij de
sluis. Je moet er **op tijd** zijn, **langszij** komen, de partij **leveren** —
en onderweg probeer je **één tot een paar procent in je eigen tanks te houden**,
zonder dat de chief engineer moeilijk doet over zijn handtekening. Daartussen
liggen sluizen met wachttijden, een reisplan dat je vooraf indient, getij en
stroom die je meenemen of tegenwerken, en verkeer dat voorrang heeft.

*Dit plan gaat over **ontwerp en fasering**. Het bevat geen code; het wijst per
bestand aan wat meeverhuist, wat wordt vervangen en in welke volgorde je bouwt.*

> **Stand van zaken.** Fase 0 tot en met 4 staan er, in [`bunkervaart/`](bunkervaart/) —
> zie [`bunkervaart/README.md`](bunkervaart/README.md). Speelbaar van orderbord
> tot handtekening. Afwijking van §5.1: het staat als zelfstandige map in deze
> repo in plaats van in een eigen repository, zodat de twee spellen samen te
> bekijken zijn; de map is verder volledig op zichzelf staand en zonder
> aanpassing los te trekken. Fase 5 (vetting, inspecties, incidentafhandeling,
> de fraudeverhaallijn) en fase 6 (concurrenten, contracten, brandstoftransitie,
> afmonsteren) staan nog open.

---

## TL;DR — lees dit als je haast hebt

**Het spel in één zin:** haal de klok, haal de handtekening, en hou zoveel over
als je durft.

Er zijn drie spanningsbogen die op elkaar ingrijpen:

| Boog | Vraag | Tegenkracht |
|---|---|---|
| **De klok** | Haal ik het venster? | Sluiswachttijd, getijvenster, stroom, mist, verkeer |
| **De handtekening** | Tekent de chief zonder protest? | Zijn peilingen, de MFM, zijn humeur, jouw papieren |
| **De marge** | Hoeveel hou ik achter? | Precies dat: hoe meer, hoe groter de kans dat hij het ziet |

De derde boog is wat dit spel eigen maakt. Het is dezelfde vorm als de stormcel
in Zeeroverij — *de snelste route loopt door het gevaarlijkste stuk* — maar dan
met een chief engineer met een peilstok in plaats van een gebroken ra.

De motor is **grotendeels herbruikbaar**, de inhoud vrijwel **volledig nieuw**:

| Laag | Regels nu | Verdict |
|---|---|---|
| **Motor** — `util`, `sprite`, `game`, `ui`, `audio`-kern | ~2.400 | ✅ **Kopiëren, nauwelijks aanpassen** |
| **Tekenlaag** — `render/*` | ~3.500 | ✅ **Machinerie houden, palet + vormen nieuw** |
| **Wereld** — `world.js` | ~1.200 | 🟡 **Structuur houden, geometrie + vaarwegennet nieuw** |
| **Zeilen** — `sail.js` | ~1.400 | 🔴 **Vervangen** door `varen.js` (stroom, sluizen, verkeer) |
| **Zeeslag** — `battle.js` | ~1.500 | 🔴 **Vervangen** door `overslag.js` (de bunkeroperatie) |
| **Duel** — `duel.js` | ~1.000 | 🔴 **Vervangen** door `handtekening.js` (het dispuut) |
| **Stad** — `town/*` | ~1.700 | 🔴 **Vervangen** door `wal/*` (orders, reisplan, kade) |
| **Data** — `data.js` | ~440 | 🔴 **Volledig nieuw** |

**Drie redenen waarom dit technisch werkt:**

1. **Het scèneprotocol is spelonafhankelijk.** [`Game.zetScene()`](js/game.js:160)
   kent alleen `betreed/werkBij/teken/toets/scroll/verlaat`. Een bunkeroperatie
   is net zo goed een scène als een zeeslag.
2. **De save is al zaad + delta.** [`bewaar()`](js/game.js:600) schrijft het
   wereldzaadje plus wat er veranderd is. Datzelfde patroon past precies: de
   vaarwegen volgen uit het zaadje, je orderportefeuille en je tankinhoud zijn
   de delta.
3. **Er ligt al een headless model.** [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
   raakt bewust geen canvas aan. Datzelfde principe geeft ons
   `overslagmodel.js`: debiet, ullage, dichtheid bij 15 °C, VCF en massa in
   lucht — precies het rekenwerk waar de hele retentiemechaniek op rust, en dat
   je buiten de browser moet kunnen narekenen.

**De twee harde beperkingen:**

- **De wereld wordt een netwerk, geen open zee.** In de Caraïben kun je overal
  heen; op de Oude Maas niet. Dat vraagt een echte **vaarwegengraaf** naast het
  landmasker — nieuw werk, geen aanpassing (zie §5.3).
- **Realisme is hier het spel, niet de garnering.** De hele retentieboog staat of
  valt bij een kloppende volume-naar-massa-som. Als dat getal niet deugt, ziet de
  doelgroep dat meteen en is het spel ongeloofwaardig.

**Aanbevolen pad:** nieuwe repository, motorbestanden **gekopieerd** (niet
gedeeld — er is geen buildstap, zie §5.1), daarna zes fasen waarvan fase 1 al
speelbaar is: één rivier, één bak, één sluis.

---

## Inhoud

1. [Wat het spel is](#1-wat-het-spel-is)
2. [De kernlus](#2-de-kernlus)
3. [De marge — het hart van het spel](#3-de-marge--het-hart-van-het-spel)
4. [De andere pijlers](#4-de-andere-pijlers)
5. [Architectuur](#5-architectuur)
6. [Wat verhuist er mee, bestand voor bestand](#6-wat-verhuist-er-mee-bestand-voor-bestand)
7. [Mechaniekvertaling: Zeeroverij → Bunkervaart](#7-mechaniekvertaling-zeeroverij--bunkervaart)
8. [Fasering](#8-fasering)
9. [Valkuilen die we al kennen](#9-valkuilen-die-we-al-kennen)
10. [Wat we bewust niet doen](#10-wat-we-bewust-niet-doen)
11. [Openstaande keuzes](#11-openstaande-keuzes)

---

## 1. Wat het spel is

**Naam (werktitel): *Bunkervaart*.** Nederlands, één woord, in dezelfde geest als
*Zeeroverij*. Alternatieven: *Ullage*, *Stookolie*, *De Stem* — "stem" is het
vakwoord voor een bunkerpartij.

**Rol:** schipper. Eén boot, jouw boot, van begin tot eind. Je bent geen
directeur die vanachter een bureau een vloot verdeelt; je staat zelf in het
stuurhuis en zelf bij het manifold. Dat is de belangrijkste ontwerpkeuze van het
hele plan: alles wat je doet, doe je zelf, en elke beslissing kost je zelf tijd.

**Jaar:** nu — 2026. Dat is geen decor: de ECA voor zwavel, EU ETS, FuelEU
Maritime en de opkomst van bio-blends veranderen de brandstofmix onder je voeten
terwijl je speelt, en veranderen daarmee wie je klanten zijn.

**Gebied:** de ARA-driehoek, op echte coördinaten, net zoals de Caraïben nu op
echte lengte- en breedtegraden liggen ([`STEDEN`](js/data.js:170)):

- **Rotterdam** — Nieuwe Waterweg, Calandkanaal, Beerkanaal, Hartelkanaal,
  Botlek, Pernis, Vlaardingen, Europoort, Maasvlakte 1 en 2, en de rede erbuiten.
- **Amsterdam** — via de zeesluis bij IJmuiden het Noordzeekanaal op.
- **Antwerpen** — over de Westerschelde langs Vlissingen en Terneuzen, of
  binnendoor via het Schelde-Rijnkanaal en de Kreekraksluizen.
- **De Noordzee ertussen** — de kustroute, alleen als je bak zeewaardig genoeg
  is en het weer meewerkt.

Het gebied is **kleiner en dichter** dan de Caraïben. Dat is precies goed: waar
de huidige kaart veertig breedtegraden beslaat op `PPD = 350`
([`world.js`](js/world.js:14)), zoomen we ver in — een wereldeenheid wordt
tientallen meters, geen zeemijl.

---

## 2. De kernlus

Eén *stem* — één bunkerpartij — is de eenheid van spel, zoals één kaping dat nu
is. De lus is langer dan die van Zeeroverij en dat is de bedoeling: de spanning
wordt opgebouwd voordat het beslissende moment komt.

```
 1. ORDER        Kies een nominatie: schip, product, hoeveelheid, plek, venster.
       ↓
 2. REISPLAN     Kies route, sluizen, getijvenster, vertrektijd. Dien hem in.
       ↓
 3. LADEN        Laad bij de terminal. Peil, noteer temperatuur en dichtheid.
       ↓
 4. VAREN        Stroom, sluiswachttijd, bruggen, verkeer, mist. De klok loopt.
       ↓
 5. LANGSZIJ     Kom langszij: stroom, wind, deining, fenders, lijnen.
       ↓
 6. OVERSLAG     Pomp de partij over — en beslis hoeveel je achterhoudt.
       ↓
 7. HANDTEKENING De chief peilt, rekent, en tekent. Of niet.
       ↓
 8. AFREKENING   Vracht betaald. De achtergehouden partij is jouw marge.
```

Elke stap maakt de volgende makkelijker of moeilijker, en dat is wat de lus
samenbindt:

- Een **krap reisplan** haalt de order binnen maar laat geen speling voor een
  sluis die tegenzit.
- **Te laat aankomen** maakt de chief chagrijnig — en een chagrijnige chief
  peilt nauwkeuriger.
- **Ruw langszij komen** kost fenders en goodwill, en een boot die aan de lijnen
  werkt geeft onrustige peilingen: dat werkt in stap 6 juist wél in je voordeel.
- **Wat je achterhoudt** in stap 6 bepaalt of stap 7 een formaliteit is of een
  confrontatie.

---

## 3. De marge — het hart van het spel

Dit is de mechaniek die *Bunkervaart* zijn eigen karakter geeft, en het is de
directe vervanger van de zeeslag: hetzelfde moment van "hoe ver ga ik", met
dezelfde soort oplopende inzet.

### 3.1 Het idee

Je levert een partij van bijvoorbeeld 480 ton. Je kunt precies 480 ton leveren en
netjes je vracht verdienen. Of je kunt **482 leveren op papier en 476 in het
ruim** — en wat je overhoudt is van jou. Dat verkoop je later apart, tegen een
lagere prijs en met eigen risico.

De hele vraag van het spel is: **hoeveel durf je?** Eén procent merkt niemand.
Vijf procent op een gladde zomerdag bij een chief die er twintig jaar bij zit,
merkt hij wél.

### 3.2 Waarom hij het wel of niet ziet

De chief rekent net zo goed als jij. Hij vergelijkt **wat hij ontvangt** met
**wat jij zegt te hebben geleverd**, en er zijn precies drie plekken waar die
twee getallen mogen verschillen zonder dat het opvalt:

1. **Meetonzekerheid.** Peilen op een boot die beweegt is minder nauwkeurig dan
   peilen aan de kade in vlak water. Een boot met trim of slagzij vraagt een
   correctie; die correctie is een schatting.
2. **Temperatuur.** Er wordt afgerekend op massa, maar gemeten in volume. Tussen
   die twee zit de dichtheid bij 15 °C en de volumecorrectiefactor. Warme olie
   is meer volume voor dezelfde massa. De omrekening is exact — maar de
   *gemeten* temperatuur is dat niet.
3. **Wat in de leiding blijft.** Slang en leiding houden product vast. Hoeveel
   precies, daarover kun je van mening verschillen.

Dat zijn geen trucs die het spel je leert; het zijn de drie bekende plekken waar
in dit vak de discussies over gaan. Het spel maakt ze **zichtbaar als
speelruimte** en laat de chief ze controleren. Jij speelt de marge, hij speelt de
controle.

### 3.3 Het systeem

Voor de overslag zet je een **retentiedoel**: 0 % tot maximaal wat je aandurft.
Tijdens de operatie zie je een **verschilbalk** — vergelijkbaar met de
spanningsbalk in de storm ([`stormVeld()`](js/world.js:650)) — die aangeeft hoe
ver je afwijkt van wat de chief zou verwachten. Groen: binnen de
meetonzekerheid. Oranje: verklaarbaar, maar hij zal ernaar vragen. Rood: dit is
niet meer uit te leggen.

Waar die grenzen liggen, hangt af van omstandigheden die je vóóraf kunt lezen:

| Factor | Ruimte groter | Ruimte kleiner |
|---|---|---|
| **Meetmethode** | Peilen met de stok | Massaflowmeter aan boord |
| **Zeegang** | Op de rede met deining | Aan de kade in vlak water |
| **De chief** | Jong, gehaast, eerste reis | Ervaren, wantrouwend, met een surveyor |
| **Temperatuurverschil** | Groot verschil tank ↔ buiten | Alles op dezelfde temperatuur |
| **Partijgrootte** | Grote partij, kleine procenten vallen weg | Kleine partij, alles valt op |
| **Tijdsdruk** | Hij moet weg, hij tekent snel | Hij heeft alle tijd |
| **Jouw staat van dienst** | Nooit een klacht gehad | Al eens een protest gekregen |

**Dat is het echte spel:** vóór je begint de situatie lezen en beslissen of dít
de stem is waarop je iets pakt. Een schip met een MFM, een surveyor aan boord en
vlak water bij de kade is een stem waarop je *netjes* levert. Een grote partij op
de rede met deining, bij een chief die om acht uur weg moet — daar zit ruimte.

### 3.4 De handtekening

Als de operatie klaar is, komt de confrontatie. Dit is de scène die
[`duel.js`](js/duel.js:25) vervangt: hetzelfde ritme van zet en tegenzet, maar met
papieren.

De chief doet zijn controles — peilen, narekenen, de temperatuur controleren,
vergelijken met wat hij verwachtte. Elke controle die aanslaat, brengt hem dichter
bij een protest. Jij hebt daar antwoorden op: je eigen peilstaat, je MFM-uitdraai,
je verzegelde monsters, de trimcorrectie, de vaststelling dat het schip zelf lag
te rollen. Sommige antwoorden houden stand, andere maken het erger.

Vier uitkomsten:

| Uitkomst | Gevolg |
|---|---|
| **Tekent schoon** | Vracht betaald, marge veilig, reputatie omhoog |
| **Tekent met aantekening** | Vracht betaald, marge veilig, maar het staat genoteerd |
| ***Letter of protest*** | Vracht betaald, claim volgt, argwaan flink omhoog |
| **Surveyor erbij** | Alles wordt nagemeten. Marge kwijt, boete, en je staat op de lijst |

### 3.5 Argwaan — de verborgen teller

Je hebt twee reputaties. **Betrouwbaarheid** is openbaar en bepaalt welke orders
je krijgt. **Argwaan** is verborgen en bepaalt hoe scherp er naar je gekeken
wordt: hoe vaak er een surveyor meekomt, hoe vaak je een MFM-schip krijgt
toegewezen, hoe streng de chiefs zijn.

Argwaan loopt op bij elke aantekening en elk protest, en zakt langzaam bij
schone leveringen. Zo krijgt het spel een natuurlijk ritme: een periode waarin
je pakt, gevolgd door een periode waarin je netjes werkt om de aandacht te laten
wegzakken. Precies zoals de relatie met een natie nu op en neer beweegt
([`relatieTik()`](js/world.js:802)).

### 3.6 De eerlijke route moet werken

**Belangrijkste balansregel van het hele spel:** je moet netjes kunnen varen en
er een goed bestaan mee hebben. Alleen dan is de marge een *keuze* en geen
verplichting, en alleen dan doet het er iets toe dat je hem neemt.

Concreet: schoon varen levert een gestage, voorspelbare winst; de marge levert
sprongen met een staart van risico. Wie nooit iets pakt, komt er ook. Wie het
elke stem doet, komt vroeg of laat een surveyor tegen die zijn hele boekjaar
opeet. Dat is dezelfde afweging als tussen een rustige handelsreis en het
enteren van een zwaarbewapend galjoen.

### 3.7 Wat er met de buit gebeurt

Achtergehouden product staat in je tanks en moet er weer uit. Verkopen kan bij
kleinere afnemers die niet te veel vragen, tegen een lagere prijs. Dat is een
eigen beslismoment met een eigen risico — en het is meteen de reden dat je niet
eindeloos kunt blijven pakken: je tanks lopen vol met product waar je vanaf moet
voordat je de volgende partij kunt laden.

---

## 4. De andere pijlers

### 4.1 Het reisplan

Nieuw ten opzichte van Zeeroverij, en meteen een van de leukste schermen: vóór
vertrek stel je je reis samen en dien je hem in.

Je kiest de route, de sluizen die je passeert, en je vertrektijd. Het scherm
rekent voor: aankomsttijd, verwachte sluiswachttijd, of je het getijvenster
haalt, of je onder de bruggen door kunt en hoeveel brandstof het kost. Je ziet
speling — of het gebrek daaraan.

Twee redenen waarom dit werkt als spelmechaniek:

1. **Het is een echte keuze met echte informatie.** Kortste route, minste
   sluizen en beste getij vallen zelden samen.
2. **Het plan bindt je.** Wijk je af, dan verlies je je sluisplanning en sluit je
   achteraan aan. Dus je plant met speling, of je gokt en houdt je eraan.

| Van → naar | Route A | Route B |
|---|---|---|
| Botlek → Maasvlakte | Calandkanaal — kort, druk verkeer | Hartelkanaal — om, maar rustig |
| Rotterdam → Antwerpen | Westerschelde — snel, getijgebonden, weergevoelig | Schelde-Rijn + Kreekrak — sluiswachttijd, maar weervrij |
| Rotterdam → Amsterdam | Over zee langs de kust — snel bij mooi weer | Binnendoor — altijd mogelijk, traag |

Dat is exact de vorm van "welke kant van de stormcel neem je" uit Zeeroverij: een
kaartbeslissing met zichtbare informatie en een echte afweging.

### 4.2 Varen — stroom en sluizen vervangen de wind

De wind is nu het hart van het spel ([`zeilEfficiëntie()`](js/world.js:1192),
[`dodeHoek()`](js/world.js:1159)). Die plaats wordt ingenomen door vier
gekoppelde beperkingen.

**a. Stroom en getij.** De stroom kentert. Met de stroom mee win je uren, tegen
de stroom in verlies je ze — en de kentering is voorspelbaar, dus planbaar. Dat
is dezelfde spelvorm als kruisen tegen de wind: wachten kost tijd maar levert
snelheid op. Bij het langszij komen zet de stroom je bovendien zijwaarts, en
*dat* is waar hij gevaarlijk wordt.

**b. Sluizen en wachttijden.** Elke sluis heeft een schuttingscyclus, een
wachtrij en een planning. Je kunt je aanmelden en een plek krijgen, of gokken op
een gaatje. Grote zeeschepen gaan voor. De wachtrij is zichtbaar, dus je kunt
besluiten om te varen. **Dit is de belangrijkste bron van tijdverlies in het
spel** en daarmee de belangrijkste reden dat de klok spannend is.

**c. Diepgang, squat en doorvaarthoogte.** Vol geladen zit je diep en ben je
getijgebonden op de ondiepe stukken. Hard varen in ondiep water trekt je verder
omlaag — de squatbalk loopt op met je snelheid en zakt zodra je gas terugneemt,
precies zoals de spanningsbalk in het want nu werkt. Leeg steek je juist hoog op
en pas je niet meer onder elke brug.

**d. Verkeer, marifoon en mist.** Zeeschepen hebben voorrang; de verkeerspost
geeft aanwijzingen. De bestaande vlotenlogica ([`vlotenTik()`](js/world.js:856))
is hiervoor het startpunt — schepen die op koersen door de wereld bewegen bestaan
al; ze jagen alleen niet meer op je, ze negeren je juist, en dat is het gevaar.
De stormcel wordt een **mistbank**: hij drijft, heeft een kern en een rand, en
binnenin zakt het zicht. Bij te weinig zicht legt de verkeerspost het verkeer
stil en verlies je je venster. De hele stormcelmachinerie
([`stormTik()`](js/world.js:596), [`tekenStormen()`](js/render/weer.js:231))
verhuist mee met een ander uiterlijk en een andere straf: geen gebroken ra, maar
een gemiste afspraak.

**e. Het miniatuureffect blijft.** [`tekenMiniatuur()`](js/game.js:288) — de
tilt-shift — past op een havengebied nóg beter dan op de Caraïben: de Maasvlakte
op tilt-shift leest als een modelspoorbaan. Ongewijzigd meenemen.

### 4.3 Langszij komen

Een korte, scherpe manoeuvrescène tussen het varen en de overslag. Je moet met
een geladen bak langszij een schip dat vele malen groter is, met stroom die je
zet en wind die op je hoge boordvrij duwt.

- **Aan de kade** is het rustig: het schip ligt stil, het water is vlak.
- **Op stroom** duwt de stroom je continu; je moet er tegenin sturen en met de
  stroom mee aanleggen.
- **Op de rede** is er deining. Je bak beweegt op en neer langs een stalen wand,
  fenders werken, en de peilingen worden er onrustig van — wat later in de
  overslag jouw kant op werkt.

Te hard aankomen kost fenders, schade en goodwill. Te voorzichtig kost tijd. De
uitkomst gaat als beginstand mee de overslagscène in: het humeur van de chief,
de staat van je fenders, en hoeveel je klok nog over heeft.

### 4.4 De overslag zelf

De pomphandeling waarbinnen de retentiebeslissing uit §3 valt. Alles draait om
één spanning: **snel pompen wint tijd, snel pompen breekt dingen.**

**Wat je ziet:** je eigen tanks met product, dichtheid en temperatuur; de tanks
van de klant met hun ullage en het tankplan dat de chief wil; debiet in m³/uur;
de tellerstand; de druk bij het manifold; en de omgerekende massa in lucht — want
daarop wordt afgerekend, en die som beweegt mee met de temperatuur.

**Wat je bedient:** pomptoerental, welke tank je leegt, de klepstand, en het
moment waarop je naar *topping-off* gaat.

**De regels die het spannend maken:**
- **Langzaam beginnen.** De eerste minuten mag het debiet niet hoog. Wie meteen
  opendraait, neemt een risico dat je nergens goedmaakt.
- **Topping-off.** Boven een bepaald tankniveau moet het debiet terug. Te laat
  terugnemen is een overloop — de zwaarste fout in het spel.
- **Drukvenster.** Het manifold van de klant heeft een maximum. Debiet omhoog
  duwt de druk omhoog; een lange slang en koude zware olie ook.
- **De klok.** Het schip vaart om 18:00. Te laat klaar is wachtgeld tegen jou.

**Wat er misgaat:** een drukpiek in de slang met twee seconden om te reageren; de
wacht die niet meteen antwoordt op de marifoon; golfslag van een passerend schip;
een aangekondigde noodstoptest; een windvlaag op de rede.

**Wat het kost:**

| Uitkomst | Gevolg |
|---|---|
| Op tijd, schone lijn, op cijfer | Volle vracht, marge veilig, reputatie omhoog |
| Te lang doorgepompt | Je geeft product weg — precies het omgekeerde van §3 |
| Te laat klaar | Wachtgeld, en een chief in een slecht humeur bij de handtekening |
| Overloop of morsing | Boete, onderzoek, boot aan de ketting, reputatie zwaar omlaag |
| Slang gebroken | Reparatie, dagen uit de vaart |

**Headless model.** Net als [`gevechtsmodel.js`](js/gevechtsmodel.js:1) krijgt dit
een `js/overslagmodel.js` **zonder canvas, DOM of audio**: tankvullingen, debiet,
drukverloop, dichtheid bij 15 °C, volumecorrectiefactor en de omrekening naar
massa. Zo is de balans buiten de browser na te rekenen — en zo klopt het getal
waar de hele retentiemechaniek op leunt.

### 4.5 De wal

[`town/*`](js/town/haven.js:21) wordt `wal/*`. De schermen mappen netjes, maar
blijven **klein**: je bent schipper, geen directeur.

| Nu | Straks |
|---|---|
| [`haven.js`](js/town/haven.js:21) — havenmenu | `wal.js` — wat je aan de kade kunt doen |
| [`opdrachten.js`](js/town/opdrachten.js:1) — lopende opdracht | `orders.js` — het orderbord, nominaties kiezen |
| [`handel.js`](js/town/handel.js:1) — kopen en verkopen | `laden.js` — laden bij de terminal, peilstaat, papieren |
| [`werf.js`](js/town/werf.js:1) — herstellen, upgraden | `werf.js` — dokbeurt, pomp, meetapparatuur, fenders |
| [`kroeg.js`](js/town/kroeg.js:1) — volk en geruchten | `kantine.js` — bemanning, rusturen, marktpraat en tips |
| [`gouverneur.js`](js/town/gouverneur.js:1) — opdrachten, rang | `bevrachter.js` — vaste klanten, contracten, reputatie |
| [`aftreden.js`](js/town/aftreden.js:1) — eindscore | `afmonsteren.js` — de eindafrekening van je loopbaan |

**Bemanning en vaartijd.** Waar nu proviand opraakt en de moraal zakt
([`sail.js`](js/sail.js:24)), raken hier de **vaaruren** op. Het regime waaronder
je vaart bepaalt hoeveel uur per etmaal je mag varen en hoeveel bemanning je
daarvoor aan boord moet hebben. Meer bemanning betekent langer doorvaren en meer
stems per week, maar ook hogere kosten. Overtreden kan — en dat is een tweede,
kleinere versie van dezelfde gok als de marge.

**Verbeteringen aan de boot.** Rechtstreeks de plaats van
[`UPGRADES`](js/data.js:278): een sterkere pomp (sneller klaar), betere
meetapparatuur (nauwkeuriger, en dus geloofwaardiger papieren), betere fenders,
een grotere tank, en verwarming voor zware olie.

---

## 5. Architectuur

### 5.1 Nieuwe repository, motor gekopieerd

**Aanbeveling: een aparte repository**, met de motorbestanden erin gekopieerd.

Waarom niet delen? Er is bewust **geen buildstap, geen `package.json`, geen
dependencies** ([`AGENTS.md`](AGENTS.md:7)). Een gedeelde kern vraagt een
pakketbeheerder of een submodule — precies de complexiteit die dit project heeft
geweigerd. Waarom geen submap in deze repo? Omdat álle inhoudsbestanden
divergeren en de twee spellen los van elkaar gepubliceerd worden.

Wel meenemen: een `KERN.md` in de nieuwe repo die opsomt welke bestanden
*kopieën* zijn, zodat een bugfix in `sprite.js` bewust naar beide kanten gaat.

### 5.2 Bestandsindeling

```
bunkervaart/
  index.html
  css/spel.css
  js/
    util.js          ← kopie
    sprite.js        ← kopie
    game.js          ← kopie, andere opslagsleutel + spelerstructuur
    ui.js            ← kopie, ander uiterlijk
    audio.js         ← motor kopie, klankbank nieuw
    data.js          ← NIEUW: brandstoffen, baktypen, terminals, klanten, chiefs
    wereld.js        ← geometrie, vaarwegennet, getij, stroom, verkeer, weer
    vaarweg.js       ← NIEUW: de graaf, routekeuze, sluizen, bruggen
    getij.js         ← NIEUW: getijkromme per station, stroom eruit afgeleid
    reisplan.js      ← NIEUW: scène, het plan samenstellen en indienen
    varen.js         ← scène: navigeren
    langszij.js      ← scène: aanleggen bij het klantschip
    overslag.js      ← scène: pompen, en de retentiebeslissing
    overslagmodel.js ← NIEUW headless: debiet, ullage, VCF, massa, verschil
    handtekening.js  ← scène: de chief controleert en tekent (of niet)
    afgemeerd.js     ← scène: liggen, rusten, onderhoud, opslaan
    wal/             ← wal, orders, laden, werf, kantine, bevrachter, afmonsteren
    render/          ← water, land, kades, schepen, weer, hud, kaart, effecten
  PLAN-*.md
  AGENTS.md          ← met §9 hieronder erin overgenomen
```

### 5.3 De wereld: masker + graaf

`wereld.js` houdt de opbouw van [`Wereld`](js/world.js:250): deterministisch uit
een zaadje, een rasterlandmasker voor snelle botsing
([`#bouwMasker()`](js/world.js:361)), en `Path2D`-vormen om te tekenen. Nieuw
komt daarnaast:

- **Een dieptekaart** in plaats van alleen land/water. Elke cel krijgt een
  gebaggerde diepte; [`isVaren(x, y, type)`](js/world.js:415) wordt
  `kanVaren(x, y, diepgang, getij)`.
- **Een vaarwegengraaf**: knopen (kruisingen, sluizen, bruggen, ligplaatsen,
  terminals) en takken met lengte, breedte, diepte, doorvaarthoogte en een
  maximumsnelheid. De graaf voedt het reisplan, de sluisplanning en het verkeer;
  jij vaart nog steeds vrij binnen het vaarwater.
- **Getij en stroom** als functie van tijd en station.

### 5.4 Save

Zelfde vorm als nu ([`bewaar()`](js/game.js:600)): zaad plus delta. De delta
wordt: schipper (geld, betrouwbaarheid, **argwaan**, certificaten, vaaruren), de
boot (positie, tankinhoud per product inclusief de achtergehouden partij, staat,
verbeteringen), het orderbord, het lopende reisplan, en de marktprijzen.
Versienummer en migratie in `laad()`, precies zoals hier al gebeurt.

---

## 6. Wat verhuist er mee, bestand voor bestand

| Bestand | Nu | Straks | Werk |
|---|---|---|---|
| [`js/util.js`](js/util.js:1) | wiskunde, RNG, formattering | ongewijzigd | ✅ kopiëren |
| [`js/sprite.js`](js/sprite.js:53) | bak-en-blit-cache | ongewijzigd | ✅ kopiëren |
| [`js/game.js`](js/game.js:67) | lus, scènes, invoer, save, miniatuureffect | opslagsleutel + spelerstructuur | ✅ ~85 % |
| [`js/ui.js`](js/ui.js:32) | overlays, tabellen, balken | zelfde API, ander uiterlijk | ✅ ~90 % |
| [`js/audio.js`](js/audio.js:1) | Web Audio-synth | motor blijft, klankbank nieuw | 🟡 motor ✅, inhoud 🔴 |
| [`js/render/hulpjes.js`](js/render/hulpjes.js:1) | zonrichting, transforms | ongewijzigd | ✅ kopiëren |
| [`js/render/patronen.js`](js/render/patronen.js:369) | getegelde patronen, schuim | zelfde techniek, ander palet | ✅ ~80 % |
| [`js/render/zee.js`](js/render/zee.js:74) | zeevlak, diepte, vignet | rivierwater i.p.v. Caribisch blauw | ✅ ~70 % |
| [`js/render/land.js`](js/render/land.js:768) | gebufferd land, branding | kades, tankparken, kranen | 🟡 ~50 % |
| [`js/render/weer.js`](js/render/weer.js:180) | wolken, storm, regen | mist wordt hoofdrolspeler | 🟡 ~55 % |
| [`js/render/hud.js`](js/render/hud.js:20) | perkament-HUD | scheeps-HMI-look | 🟡 ~60 % |
| [`js/render/schepen.js`](js/render/schepen.js:538) | zeilschepen | bakken, coasters, containerreuzen | 🔴 vormen nieuw, techniek ✅ |
| [`js/render/steden.js`](js/render/steden.js:574) | koloniale stadjes | terminals, steigers, dukdalven | 🔴 nieuw |
| [`js/render/zeekaart.js`](js/render/zeekaart.js:141) | overzichtskaart | vaarwegkaart met sluizen en getij | 🟡 ~50 % |
| [`js/world.js`](js/world.js:250) | kaart, wind, stormen, vloten | geometrie, graaf, getij, verkeer | 🟡 structuur ✅, inhoud 🔴 |
| [`js/gevechtsmodel.js`](js/gevechtsmodel.js:1) | headless gevecht | → `overslagmodel.js` | 🔴 nieuw, zelfde discipline |
| [`js/sail.js`](js/sail.js:102) | zeilscène | → `varen.js` | 🔴 vervangen |
| [`js/battle.js`](js/battle.js:266) | zeeslag | → `overslag.js` | 🔴 vervangen |
| [`js/duel.js`](js/duel.js:25) | zwaardduel | → `handtekening.js` | 🔴 vervangen |
| [`js/anker.js`](js/anker.js:531) | voor anker, tijdverloop | → `afgemeerd.js` | 🟡 tijdmotor ✅, inhoud 🔴 |
| [`js/town/*`](js/town/haven.js:21) | haven, kroeg, werf, gouverneur | → `wal/*` | 🔴 vervangen |
| [`js/data.js`](js/data.js:1) | naties, waren, schepen, steden | brandstoffen, bakken, terminals | 🔴 nieuw |
| [`css/game.css`](css/game.css:1) | perkament en goud | staal, oranje, nachtverlichting | 🟡 tokens vervangen |

**Ruwe verhouding:** van de ~17.300 regels verhuist ongeveer **35 % ongewijzigd
of licht aangepast**, is **25 % herbruikbaar met nieuwe inhoud**, en is **40 %
nieuw**. De ~6.000 regels die je *niet* opnieuw hoeft te bedenken zijn precies de
regels waar het meeste debugwerk in zit.

---

## 7. Mechaniekvertaling: Zeeroverij → Bunkervaart

| Zeeroverij | Bunkervaart | Waarom het werkt |
|---|---|---|
| Windrichting en -kracht | Stroom en kentering | Een natuurkracht waar je omheen plant |
| Kruisen tegen de wind | Wachten op de kentering, of doorvaren | Twee slagen tegen één rechte lijn |
| Hoog aan de wind / killen | Diepgang, squat, doorvaarthoogte | Een grens die je bijna kunt raken |
| Spanningsbalk in het want | Squatbalk onderweg, verschilbalk bij de overslag | Loopt op met durf, zakt met terugnemen |
| Stormcel: snelle band naast gevaarlijke kern | Mistbank, en de rede bij slecht weer | Zelfde vorm: het risico ligt naast de beloning |
| Proviand raakt op | Vaaruren raken op | Een klok die je dwingt te stoppen |
| Moraal van het volk | Vermoeidheid en verloop | Hard doorwerken heeft een prijs |
| **Zeeslag** | **De overslag met retentie** | De skill-test: hoe ver ga je? |
| **Enteren en duel** | **De handtekening van de chief** | De persoonlijke confrontatie, zet om zet |
| Buit, en het verdelen ervan | De achtergehouden partij, en hem kwijtraken | Winst die je nog moet verzilveren |
| Relatie met vier naties | Betrouwbaarheid bij bevrachters en reders | Meerdere partijen met eigen belangen |
| Berucht worden als piraat | **Argwaan** — de verborgen teller | Je verleden bepaalt hoe scherp men kijkt |
| Kaperbrief en rang | Certificaten en goedkeuringen | Papier dat deuren opent |
| Gouverneursopdrachten | Nominaties en contractverplichtingen | Werk met een deadline en een beloning |
| Schatjacht met kaartstukken | Het reisplan: informatie verzamelen vóór vertrek | Vooraf puzzelen, daarna varen |
| Beruchte kapiteins | Concurrerende schippers met een reputatie | Terugkerende tegenspelers |
| Veroudering en aftreden | Loopbaan en afmonsteren | Een klok over het hele spel |
| Eindscore: goud, land, rang, roem | Eindafrekening: vermogen, staat van dienst, of je schoon bent gebleven | Eén getal dat de hele run samenvat |

---

## 8. Fasering

Elke fase eindigt op iets **speelbaars**. Zo is dit project ook gegroeid.

### Fase 0 — Fundament
Nieuwe repo, motorbestanden kopiëren, `index.html` en CSS-tokens omzetten,
`AGENTS.md` overnemen met §9 erin. Resultaat: een leeg canvas dat draait, met de
scèneloop en de UI-overlays werkend.

### Fase 1 — Één rivier, één bak, één sluis *(eerste speelbare versie)*
De Nieuwe Maas van Maasvlakte tot Botlek. Dieptekaart, stroom die kentert, één
bak die je bestuurt, squat en oevereffect, één sluis met een wachtrij, en de
camera met het miniatuureffect. Nog geen lading, nog geen economie. Doel:
**varen en schutten moeten al leuk zijn** voordat er iets omheen staat.

### Fase 2 — De overslag en de handtekening *(het hart)*
`overslagmodel.js` eerst, headless en narekenbaar: debiet, ullage, temperatuur,
VCF, massa, en het verschil tussen wat jij zegt en wat hij meet. Daarna de twee
scènes: pompen met de retentiekeuze, en de chief die controleert en tekent. Eén
terminal om te laden, één klantschip om te lossen.

Dit is de fase waarin blijkt of het spel werkt. **Bouw hem vroeg.** Als de
afweging tussen marge en handtekening niet spannend is, klopt het ontwerp niet en
kun je beter dáár aan sleutelen dan aan een economie eromheen.

### Fase 3 — De lus rond
Orderbord, reisplan, laden bij de terminal, vracht en betaling, argwaan, de
achtergehouden partij verkopen, en save/laad. Doel: een run van een paar dagen
die ergens naartoe werkt.

### Fase 4 — Het net
Uitbreiden naar de hele ARA-driehoek: alle sluizen en bruggen, getijvensters, de
routekeuzes uit §4.1, verkeer en marifoon, mist. Doel: de kaart wordt een puzzel
en het reisplan gaat er echt toe doen.

### Fase 5 — Risico en regels
Certificaten, vetting, inspecties, vaartijdregime, incidenten en claims,
surveyors, en de verschillende chiefs met hun eigen gedrag. Doel: er staat iets
op het spel.

### Fase 6 — De lange lijn en de afwerking
Concurrenten, vaste klanten en contracten, de brandstoftransitie over de jaren
heen, afmonsteren met eindscore, en dan de afwerking: klankbank, tekenwerk,
`prefers-reduced-motion`, en de tekencalls tellen zoals
[`AGENTS.md`](AGENTS.md:56) voorschrijft.

---

## 9. Valkuilen die we al kennen

Deze staan in [`AGENTS.md`](AGENTS.md:30) en zijn duur betaald. Ze gelden
onverkort in het nieuwe spel; neem ze **letterlijk** over in de nieuwe
`AGENTS.md`:

1. **Bewegende offsets integreer je per frame**, nooit `tijd × huidige snelheid`.
   Geldt hier voor het waterpatroon dat met de stroom meedrijft — en de stroom
   kentert elke zes uur, dus deze fout slaat hier nog harder toe dan bij wind.
2. **Een canvas-blur reikt ongeveer 3× zijn straal.** Teken de bron ruimer.
3. **Constanten die twee systemen moeten delen, staan in één helper.** Hier: de
   dieptedrempel die zowel de botsing als de waarschuwing gebruikt, en de
   HUD-kleuren tegenover de CSS-tokens.
4. **Een getekend schip mag nooit boven schaal 1.** De botsing schaalt niet mee.
5. **Deterministische spreiding gebruikt een hash, geen reeks.**
6. **Wat niet beweegt, wordt gebakken** — via [`sprite.js`](js/sprite.js:53), niet
   met de hand. Kades, kranen, tankparken en dukdalven zijn hier de klanten.
7. **Een cachelimiet staat in pixels, niet in stuks**, en je gooit de oudste eruit
   in plaats van de hele cache leeg.
8. **Een gebakken tekening kent de rotatie van de wereld niet**: draai de
   zonrichting terug.
9. **Deeltjes delen een tekenfunctie, geen gedrag.** Hier: rook uit de
   schoorsteen, schuim in het kielzog en damp bij het manifold zijn drie dingen.
10. **Meten doe je in de echte browser**, met de valkuilen uit
    [`AGENTS.md`](AGENTS.md:44): eerst een frame warmdraaien, `Math.random`
    vervangen vóór `goto`, en tekencalls tellen in plaats van milliseconden.

Twee nieuwe, specifiek voor dit spel:

11. **De volume-naar-massa-som hoort in het headless model** en moet buiten de
    browser tegen echte tabelwaarden na te rekenen zijn. Op dat getal rust de
    hele retentiemechaniek: klopt het niet, dan is het spel ongeloofwaardig voor
    precies de mensen voor wie het gemaakt is.
12. **De onzekerheid is een model, geen willekeur.** De speelruimte in §3.2 moet
    volgen uit zichtbare omstandigheden — meetmethode, deining, temperatuur,
    partijgrootte — en niet uit een verborgen dobbelsteen. Anders leert de speler
    niets en voelt elke betrapping oneerlijk.

---

## 10. Wat we bewust niet doen

- **Geen buildstap, geen dependencies, geen framework.** Dezelfde belofte als
  hier: kloon, serveer statisch, klaar.
- **Geen 3D.** Canvas 2D met tilt-shift is de eigen stijl; die geven we niet op.
- **Geen vlootbeheer.** Je bent schipper, niet directeur. Eén boot, van begin tot
  eind. Wie een tweede boot wil, moet dat als latere uitbreiding bewijzen.
- **Geen echte kaartdata (ENC/S-57).** Te zwaar, licentiegevoelig, en het spel
  heeft leesbaarheid nodig, geen kaartnauwkeurigheid. Wel echte coördinaten voor
  de grote lijnen, net als de huidige [`STEDEN`](js/data.js:170).
- **Geen handleiding voor fraude.** De retentiemechaniek werkt op het niveau van
  spelknoppen en op de bekende, in het vak openlijk besproken discussiepunten
  (meetonzekerheid, temperatuur, leidinginhoud). Het spel gaat over de *controle*
  erop, niet over hoe je het in het echt zou doen.
- **Geen echte bedrijfsnamen zonder toestemming.** Terminals, reders en
  bevrachters krijgen herkenbare maar verzonnen namen.
- **Geen multiplayer in de eerste versie.** Het [multiplayerplan](PLAN-multiplayer.md)
  blijft later toepasbaar — een gedeeld orderbord is zelfs een natuurlijker vorm
  dan een gedeelde zee — maar niet nu.
- **Geen mobiel.** Toetsenbord en muis, net als nu.

---

## 11. Openstaande keuzes

De rolkeuze staat vast: **één schipper, één boot**. Wat nog open is:

1. **Hoe snel loopt de klok?** Nu is dat `DAGEN_PER_SECONDE = 0.044`
   ([`world.js`](js/world.js:34)). Hier moet een overslag van vier uur binnen een
   paar minuten spelen, maar een reis van Rotterdam naar Antwerpen ook niet te
   lang duren. **Voorstel:** twee snelheden — reistijd flink versneld, met de
   mogelijkheid om door te spoelen tot het volgende beslismoment; operatietijd
   bijna echt, want daar zit het spel.
2. **Wat gebeurt er tijdens een sluiswachttijd?** Doorspoelen is het eerlijkst,
   maar het is ook een natuurlijk moment voor papierwerk, marifoonverkeer en de
   tips die nu in de kroeg zitten. **Voorstel:** doorspoelen als standaard, met
   optionele bezigheden — precies zoals het anker nu werkt
   ([`ankerDialoog()`](js/anker.js:531)).
3. **Hoeveel brandstofsoorten?** Vier is speelbaar (VLSFO, LSMGO, HSFO, B30),
   zeven wordt boekhouden. LNG en methanol als late uitbreiding, gekoppeld aan de
   transitieverhaallijn.
4. **Hoe groot mag de marge worden?** Het bereik bepaalt de toon. Tot ~2 % blijft
   het een vakmatige grijze zone; boven ~5 % wordt het een misdaadspel.
   **Voorstel:** het bereik loopt op met je uitrusting en ervaring, maar de bovenkant
   blijft laag genoeg dat het geloofwaardig blijft.
5. **Hoe streng is het spel?** Een morsing of een surveyor kan een run beëindigen
   of alleen pijn doen. **Voorstel:** een moeilijkheidsschaal zoals
   [`MOEILIJKHEDEN`](js/data.js:147), waarbij de zwaarste graad kent dat je je
   papieren echt kwijt kunt raken.
6. **Welke taal?** Alles staat nu in het Nederlands
   ([`AGENTS.md`](AGENTS.md:16)) en de ARA-regio is Nederlandstalig, dus dat ligt
   voor de hand — maar het vakjargon is Engels (*stem*, *ullage*, *topping-off*,
   *BDN*, *letter of protest*). **Voorstel:** Nederlandse code en teksten, met het
   echte vakjargon onvertaald waar dat de vaktaal is.

---

*Volgende stap: keuze 1 tot en met 6 vastleggen, dan fase 0 en 1 bouwen — één
rivier, één bak, één sluis — en meteen daarna fase 2, want daar blijkt of het
spel werkt.*
