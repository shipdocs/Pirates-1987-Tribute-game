# Zeeroverij naast *Sid Meier's Pirates!* (2004)

*Een systeem-voor-systeem-vergelijking met de remake, gemeten aan de code zoals
die nu in [`js/`](js/) staat. Aanvulling op
[`ANALYSE-pirates-vergelijking.md`](ANALYSE-pirates-vergelijking.md), die vooral
over Gold (1993) ging.*

---

## 0. Even het jaartal rechtzetten

Er is geen remake uit 2003. De lijn is:

| Jaar | Titel | Wat het was |
|---|---|---|
| 1987 | *Sid Meier's Pirates!* | het origineel (C64, later DOS/Amiga) |
| 1993 | *Pirates! Gold* | dezelfde spelregels, VGA-graphics, portretten, muziek |
| **2004** | *Sid Meier's Pirates!* (Firaxis) | de echte remake: volledig 3D, nieuwe minigames, een verhaallijn |

Hieronder gaat het steeds over die van **2004** — dat is de versie die je
bedoelt.

---

## 1. De korte versie

Zeeroverij is **dieper waar 2004 arcade werd** (zeegevecht, economie, zeilen) en
**dunner waar 2004 juist vol zit** (verhaal, personages, het landgevecht, de
schatjacht als spel). 2004 is geen simulatie: het is een reeks stevige
minigames aan elkaar geregen door een wereldkaart. De remake won niet op
diepte, maar op **richting, cast en afwisseling**.

---

## 2. Zij aan zij, per systeem

| Systeem | *Pirates!* 2004 | Zeeroverij nu | Oordeel |
|---|---|---|---|
| Wereld | 3D-Caraïben, ~50 steden, 4 naties, tijdvak kiesbaar (1600–1680) | 2D-kaart op echte lengte/breedte, 35 steden, 4 naties, vast 1660 ([`data.js`](js/data.js:149)) | 2004 breder, Zeeroverij geografisch eerlijker |
| Zeilen | wind, koers, dag/nacht, storm | wind draait en wakkert aan, hoogte-aan-de-wind **per scheepstype**, proviand, moraal, deserteurs, muiterij ([`sail.js`](js/sail.js:125), [`sail.js`](js/sail.js:287)) | **Zeeroverij dieper** |
| Zeegevecht | 3D, arcade-achtig; drie kogelsoorten; enteren = korte overgang | echte ballistiek met voorhoudpunt, breedzijden alleen dwarsuit, batterij kapotschieten, brand, overgave, buitgemaakte prijzen ([`gevechtsmodel.js`](js/gevechtsmodel.js:1), [`battle.js`](js/battle.js:25)) | **Zeeroverij duidelijk dieper** |
| Degengevecht | realtime schermen, terrein duwt je over het dek, drie wapens | hoog/midden/laag pareren + riposte, uithoudingsvermogen, positie-duw, twee decors ([`duel.js`](js/duel.js:21)) | gelijkwaardig; 2004 heeft wapenkeuze |
| Landgevecht | **tactisch veldslagje** met troepensoorten, terrein en moraal | kansberekening + één duel tegen de bevelhebber ([`town.js`](js/town.js:1205)) | **2004 duidelijk rijker** |
| Handel | vaste vraag/aanbod per stadssoort, menu | prijzen bewegen mee met wat jíj koopt en verkoopt ([`world.js`](js/world.js:297)) | **Zeeroverij dieper** |
| Havens | kroeg, koopman, werf, gouverneur + 's nachts de stad in, smokkelen | kroeg, koopman, werf, gouverneur ([`town.js`](js/town.js:58)) | 2004 heeft één laag extra |
| Schatjacht | 4 kaartstukken bouwen samen een prent; varen, graven, warm/koud | 4 stukken in de kroeg kopen → goud wordt bijgeboekt ([`town.js`](js/town.js:498)) | **2004 is een spel, hier een boekhoudregel** |
| Vermist familielid | volledige wraakverhaallijn met een genoemde schurk | rol bij de start, gerucht wijst een stad aan, knop "Naar uw … vragen" ([`town.js`](js/town.js:1338)) | **2004 veel sterker** |
| Beroemde piraten | negen genoemde piraten met eigen schepen, elk een jachtdoel | naamlijst zonder eigen bestaan ([`data.js`](js/data.js:204)) | **2004 heeft een cast, Zeeroverij niet** |
| Scheepsuitrusting | gevonden als buit (koperen huid, katoenen zeilen, fijn kruit …) | te koop op de werf, drie niveaus ([`data.js`](js/data.js:257), [`town.js`](js/town.js:719)) | gelijk in effect, 2004 leuker in verwerving |
| Opdrachten | gouverneur, jezuïeten, indiaanse dorpen, barmeiden, passagiers | gouverneur (4 soorten) + geruchten in de kroeg ([`town.js`](js/town.js:1067)) | 2004 breder in bronnen |
| Gouverneursdochter | drie schoonheidsklassen, cadeaus, **dans-minigame**, tips | één gesprek met drie antwoorden, huwelijk vanaf rang 4 ([`town.js`](js/town.js:990)) | 2004 rijker; bewust niet overgenomen |
| Politiek | oorlog/vrede verschuift, machtsverhoudingen per tijdvak | relaties kruipen naar neutraal, af en toe oorlog of vrede ([`world.js`](js/world.js:429)) | gelijkwaardig |
| Verouderen | schermkunst zakt, rond je vijftigste dwingt het spel je te stoppen | leeftijd loopt op maar doet **niets** ([`sail.js`](js/sail.js:226), [`sail.js`](js/sail.js:773)) | **2004 heeft een klok, hier is het een getal** |
| Afsluiting | epiloog met een oordeel per categorie | één eindscore + erelijst van tien ([`game.js`](js/game.js:263)) | 2004 warmer, hier zakelijker |
| Weer | storm, dag/nacht | drijvende stormcellen, weerglas/barometer, schade per moeilijkheid ([`world.js`](js/world.js:477)) | **Zeeroverij dieper** |
| Presentatie | 3D, animaties, voice, cutscenes | canvas + SVG, alle geluid uit de Web Audio API opgewekt | onvergelijkbaar, bewuste keuze |

---

## 3. Waar Zeeroverij het wint

1. **Het zeegevecht is echt natuurkunde.** In 2004 klik je een breedzijde en
   het schip gaat kapot. Hier vliegen kogels door de ruimte, moet je vóórhouden
   op koers en vaart, dekt de waaier van je batterij dichtbij het hele schip en
   ver weg vooral zee, en is het tegen een zwaardere tegenstander de juiste
   tactiek om zijn *batterij* stuk te schieten in plaats van zijn romp
   ([`gevechtsmodel.js`](js/gevechtsmodel.js:1)). Dat is een laag die de remake
   bewust heeft weggehaald.
2. **De economie reageert op de speler.** Verkoop je driehonderd vaten suiker in
   één haven, dan zakt de prijs daar ([`world.js`](js/world.js:297)). In 2004
   blijft de prijstabel staan waar hij staat.
3. **Zeilen is een keuze, geen animatie.** Elk scheepstype heeft een eigen
   `hoogte` aan de wind ([`data.js`](js/data.js:63)), dus een sloep kruist waar
   een galjoen moet omvaren. Samen met proviand, moraal en muiterij maakt dat
   een reis tot iets waar je over nadenkt.
4. **Weer als systeem.** Drijvende stormcellen met een levensduur, een barometer
   die ze aankondigt en schade die met de moeilijkheidsgraad meeloopt — 2004
   heeft storm vooral als decor.

---

## 4. Waar 2004 het wint — de vier echte gaten

### 1. Er is geen cast (grootste gat)

2004 draait op namen: negen beroemde piraten die je kunt opjagen, elk met een
eigen schip en een eigen beloning, en een schurk die je familie heeft
weggevoerd. Daardoor heeft elke vaart een *wie*, niet alleen een *wat*.

Zeeroverij heeft `KAPITEIN_NAMEN` ([`data.js`](js/data.js:204)), maar die namen
bestaan niet in de wereld: ze worden alleen in geruchten en als duelnaam
ingevuld. Een berucht schip dat écht ergens vaart, dat sterker is dan normaal,
dat een gerucht over zich heen krijgt en waarvan het verslaan iets oplevert dat
je nergens kunt kopen — dat ontbreekt volledig.

### 2. De schatjacht is geen jacht

Nu: vier stukken kopen in de kroeg, en bij het vierde stuk komt er geld bij
([`town.js`](js/town.js:498)). Er wordt niet gevaren, niet gezocht, niet
gegraven. In 2004 vormen de stukken samen een prent van een kustlijn, vaar je
er naartoe en graaf je met een warm/koud-aanwijzing. Dat is precies het soort
minigame dat op een canvas met bestaande middelen te bouwen is.

### 3. Het landgevecht is één worp en één duel

`bestormStad` ([`town.js`](js/town.js:1205)) rekent een kans uit, trekt
verliezen af, en zet dan een duel neer. Alles daartussen — het garnizoen dat je
kunt uitdunnen, de keuze tussen bestormen en belegeren, buccaneers versus
musketiers — bestaat niet. 2004 maakt hier een van zijn drie grote minigames
van.

### 4. Ouder worden heeft geen gevolgen

`s.leeftijd` loopt op ([`sail.js`](js/sail.js:226)) en staat in het
bemanningsscherm, maar geen enkel systeem leest hem. In 2004 is verouderen de
klok van het hele spel: je schermt langzamer, en op een gegeven moment houdt het
op. Dat is wat "de lange lijn" spanning geeft — nu kun je in beginsel eeuwig
doorvaren.

---

## 5. Wat ik zou overnemen, op volgorde

| Prio | Wat | Waarom | Werk | Waar |
|---|---|---|---|---|
| 1 | **Beruchte kapiteins als echte vloten** — een handvol genoemde piraten die rondvaren, zwaarder bewapend zijn, in geruchten opduiken en bij verslaan een uniek uitrustingsstuk geven | vult het grootste gat: richting en tegenstanders met een naam; hergebruikt het complete vlotensysteem | middel | [`world.js`](js/world.js:429), [`data.js`](js/data.js:204) |
| 2 | **Verouderen met tanden** — schermsnelheid en uithoudingsvermogen zakken vanaf ~40 jaar, boven ~55 dringt de bemanning op pensioen aan | maakt de erelijst pas echt een loopbaan; twee regels in het duel, één in het menu | klein | [`duel.js`](js/duel.js:21), [`game.js`](js/game.js:263) |
| 3 | **Schatjacht als scène** — vier stukken vormen een kustsilhouet, je vaart erheen en graaft met warm/koud | zet dood goud om in de leukste minigame van 2004; de kaart en de kustlijnen bestaan al | middel | [`town.js`](js/town.js:498), [`render.js`](js/render.js:106) |
| 4 | **De schurk achter je familie** — een genoemde tegenstander die de vermiste vasthoudt, met een eindconfrontatie | zonder antagonist blijft het familielid een knop; met één naam wordt het een verhaal | klein-middel | [`town.js`](js/town.js:1338) |
| 5 | **Uitrusting als buit, niet alleen als koopwaar** — de bestaande `UPGRADES` ook laten vallen bij beruchte kapiteins en wrakken | zelfde systeem, veel betere beloningslus; sluit aan op prio 1 | klein | [`data.js`](js/data.js:257), [`battle.js`](js/battle.js:639) |
| 6 | **Bestorming met keuzes** — belegeren of stormlopen, garnizoen eerst uitdunnen met scheepsgeschut, buccaneers versus musketiers als tekstkeuze met echte gevolgen | haalt een deel van het 2004-landgevecht binnen zónder een tweede gevechtsengine | middel | [`town.js`](js/town.js:1205) |
| 7 | **Tijdvak kiezen bij de start** (1600 / 1640 / 1680) | verandert wie de sterke natie is en dus het hele machtsspel; is voornamelijk data | klein | [`main.js`](js/main.js:282), [`world.js`](js/world.js:1) |
| 8 | **Smokkelen bij vijandige steden** — 's nachts bij de kade handelen in plaats van alleen bestormen of wegvaren | nu is een vijandige stad een dichte deur ([`town.js`](js/town.js:18)); dit geeft de politiek gevolgen die je kunt omzeilen | klein-middel | [`town.js`](js/town.js:18) |

---

## 6. Wat bewust níét

- **3D, modellen, voice, cutscenes.** Het hele project is canvas + SVG + Web
  Audio zonder één extern bestand; dat is de vorm, niet een beperking.
- **De dans-minigame.** Veel werk, en de charme ervan zit in animatie en muziek
  die hier niet passen. Het gesprek met de dochter mag een gesprek blijven.
- **Handels-minigames.** De economie hier is al beter dan wat 2004 ervan maakte;
  een minigame eroverheen zou hem juist platslaan.
- **Een tweede gevechtsengine voor het land.** Prio 6 haalt de keuzes binnen
  zonder de kosten.

---

## 7. Conclusie

Tegenover de remake van 2004 staat Zeeroverij er niet slecht voor: op zee,
in de economie en in het weer is het het diepere spel, en dat zijn precies de
onderdelen die Firaxis in 2004 heeft vereenvoudigd om er een vlot spel van te
maken.

Wat de remake wél heeft en dit spel niet, is **bevolking**: namen die ergens
varen, een schurk om te haten, een schat om op te graven, en een klok die
tikt. Alle vier zijn te bouwen met systemen die er al liggen — vloten,
geruchten, de kaart, het duel. Geen enkel punt uit paragraaf 5 vraagt om nieuwe
techniek; ze vragen om invulling.
