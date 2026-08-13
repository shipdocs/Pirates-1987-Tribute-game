# Bunkervaart

Een tweede spel op de motor van *Zeeroverij*, maar met volledig andere
gameplay: je bent **schipper op een bunkerboot in de ARA-regio**
(Amsterdam–Rotterdam–Antwerpen). Je krijgt orders om zeeschepen van brandstof te
voorzien, je moet er op tijd zijn, langszij komen en leveren — en je mag
proberen er een paar procent van in je eigen tanks te houden, zolang de chief
engineer maar tekent zonder moeilijk te doen.

Zie [`PLAN-BUNKERVAART.md`](../PLAN-BUNKERVAART.md) voor het ontwerp en de
fasering waar dit uit voortkomt.

## Spelen

Net als Zeeroverij: ES-modules, dus via een webserver openen.

```bash
python3 -m http.server 8000
# open http://localhost:8000/bunkervaart/
```

Geen buildstap, geen `package.json`, geen dependencies.

## Wat er in zit

**De kaart.** De ARA-driehoek op echte lengte- en breedtegraden: de Nieuwe
Waterweg, Nieuwe Maas, Oude Maas, het Caland- en Hartelkanaal, de Botlek,
Pernis, de Waalhaven, Europoort en de Maasvlakte; de Dordtsche Kil, het
Hollandsch Diep, het Volkerak en de Schelde-Rijnverbinding naar Antwerpen; de
Westerschelde langs Vlissingen en Terneuzen; het Noordzeekanaal vanaf IJmuiden;
en de kustroute over de Noordzee. Met de Volkerak-, Kreekrak-, Hartel-,
Rozenburg-, Zandvliet- en IJmuidensluis, en bruggen met een doorvaarthoogte die
er werkelijk toe doet.

Anders dan een zeekaart is dit een **net van corridors**: het vaarwater heeft
een breedte en een diepte, en al het overige is land.

**Getij en stroom.** De stroom kentert twee keer per etmaal en plant zich
landinwaarts voort — hoogwater valt bij Antwerpen anderhalf uur later dan bij
Vlissingen. Met de stroom mee win je uren, ertegenin verlies je ze. Over het
geheel loopt een springtij–doodtijgolf van bijna vijftien dagen.

**Diepgang, squat en doorvaarthoogte.** Vol geladen lig je diep en ben je
getijgebonden; hard varen in ondiep water trekt je verder omlaag. Leeg steek je
juist hóóg op en pas je niet meer onder elke brug.

**Sluizen.** Elke sluis heeft een schuttijd, een aantal kolken en een wachtrij
die met de ochtend- en avondspits meeademt. Bij de zeesluizen gaat de grote
vaart voor. Dit is de belangrijkste bron van tijdverlies in het spel.

**Het reisplan.** Vóór vertrek zie je de route, de afstand, de vaartijd, de
wachttijd per sluis, je kielspeling per vaarweg, welke bruggen open moeten, en
of je het venster haalt.

**De overslag.** Debiet, manifolddruk, de ullage van de ontvangende tank,
langzaam beginnen, aftoppen boven de 92 %, en een slang die opzwelt als je hem
te lang te hard laat staan.

**De marge.** De kern van het spel. Er wordt geleverd in kubieke meters en
afgerekend in tonnen; daartussen zitten de dichtheid bij 15 °C en de
volumecorrectie. Hoeveel speling daarin zit, volgt uit dingen die je vóóraf ziet:

| Ruimte groter | Ruimte kleiner |
|---|---|
| peilen met de stok | massaflowmeter aan boord |
| deining op de rede | vlak water aan de kade |
| grote partij | kleine partij |
| groot temperatuurverschil | alles op dezelfde temperatuur |
| gehaaste of onervaren chief | wantrouwende chief, of een surveyor erbij |

**De handtekening.** De chief peilt, rekent en legt zijn cijfer naast het jouwe.
Jij verweert je met de deining, de temperatuurcorrectie, je eigen uitdraai of de
leidinginhoud — maar een verweer dat niet op de situatie slaat, maakt het erger.
Vier uitkomsten: schoon getekend, getekend met een aantekening, een *letter of
protest*, of een surveyor die alles nameet.

**Argwaan.** Naast je openbare betrouwbaarheid loopt een verborgen teller. Hij
bepaalt hoe scherp er naar je gekeken wordt en zakt weer weg als je een tijd
netjes werkt.

**Netjes varen werkt ook.** Het levert minder op, maar wel elke keer.

## Toetsen

| Onderweg | |
|---|---|
| `W` / `S` | gas erop of eraf |
| `A` / `D` | roer bakboord of stuurboord |
| `1` `2` `3` | tijdstand ×1, ×10, ×40 |
| `E` | aanleggen, schutten of langszij gaan |
| `O` / `R` / `M` | orderbord, reisplan, overzichtskaart |
| `T` | doorliggen tot morgenochtend |
| `F` | miniatuureffect aan of uit |
| muiswiel | in- en uitzoomen |

| Bij de overslag | |
|---|---|
| spatie | openen en sluiten |
| `W` / `S` | pomp harder of zachter |
| `B` | briefing — hier zet je hoeveel je achterhoudt |
| `F` | versneld |
| `Enter` | stoppen en de bon opmaken |

## Verhouding tot Zeeroverij

Gekopieerd en vrijwel ongewijzigd: [`util.js`](js/util.js),
[`sprite.js`](js/sprite.js), het scèneprotocol en het miniatuureffect in
[`spel.js`](js/spel.js), en de overlaylaag in [`ui.js`](js/ui.js). Zie
[`AGENTS.md`](AGENTS.md) voor wat daarvan bewust hetzelfde is gebleven en waarom.

Nieuw: de kaart als vaarwegennet ([`vaarwater.js`](js/vaarwater.js)), het getij
([`getij.js`](js/getij.js)), en het headless rekenhart van de bunkeroperatie
([`overslagmodel.js`](js/overslagmodel.js)) — de tegenhanger van
`gevechtsmodel.js`, en om dezelfde reden zonder canvas of DOM.
