# Zeeroverij

Een browserremake in de geest van *Sid Meier's Pirates!* — de Caraïben van 1660,
volledig in de browser, zonder build-stap, zonder frameworks en zonder externe
bestanden. Alleen HTML, CSS en ES-modules; alle graphics worden op het canvas
getekend en al het geluid wordt met de Web Audio API opgewekt.

## Spelen

Het spel gebruikt ES-modules, dus het moet via een webserver geopend worden
(rechtstreeks `index.html` openen werkt niet vanwege CORS).

```bash
git clone https://github.com/shipdocs/Pirates-1987-Tribute-game.git
cd Pirates-1987-Tribute-game
python3 -m http.server 8000
# open daarna http://localhost:8000/
```

Er is niets te installeren en niets te bouwen: elke statische webserver volstaat.
Omdat de hele boel uit losse statische bestanden bestaat, kun je de repo ook
zonder aanpassingen via GitHub Pages publiceren (Settings → Pages → deploy from
branch `main`, map `/`).

Toetsenbord en muis zijn nodig; het is gemaakt voor desktop.

## Wat er in zit

**De kaart.** De Caribische Zee is opgebouwd uit echte lengte- en
breedtegraden: Cuba, Hispaniola, Jamaica, Puerto Rico, de Kleine Antillen,
Yucatán, Midden-Amerika en de Spanish Main. Daarop liggen 35 historische
havensteden, verdeeld over Spanje, Engeland, Frankrijk en Nederland.

**Zeilen.** De wind is het hart van het spel. Voor de wind vaar je snel, pal
tegen de wind kom je nauwelijks vooruit, en een sloep kan veel hoger aan de wind
liggen dan een zwaar galjoen. De wind draait en wakkert aan, dus je route is
nooit twee keer hetzelfde. Onderweg eten je mannen proviand op en zakt de
moraal — te lang wachten met de buit verdelen levert deserteurs of muiterij op.

**Zeegevechten.** Het geschut staat in rijen langs de zijkant en vuurt dus
alleen dwarsuit, nooit over de boeg of de spiegel — je richt met het roer.
De helft van je stukken staat aan elk boord, en hoe meer stukken, hoe breder
de waaier: dichtbij dekt die het hele schip af, ver weg gaat het meeste in zee.
Kogels vliegen echt door de ruimte en missen ook echt, dus je moet vóórhouden
op koers en vaart van je tegenstander. Een groot schip is daarmee vanzelf een
groter doel dan een sloep.

Tegen een zwaardere tegenstander vecht je niet zijn romp kapot maar zijn
batterij: rondkogels slaan stukken uit hun affuiten, en wie niet meer terug kan
schieten strijkt de vlag zodra je langszij komt. Kettingkogel maakt hem eerst
onbestuurbaar, schroot dunt zijn bemanning uit voor je entert — let daarbij op
de dracht, want schroot draagt nog geen kwart van een rondkogel. Schepen kunnen
zich overgeven, in brand vliegen en zinken; een prijs die nog zeewaardig is kun
je bij je vloot voegen. Geschut dat je zelf verliest blijft stuk tot de werf er
nieuwe stukken in zet.

**Duels.** Enteren en het bestormen van steden eindigt met de degen in de hand:
hoog, midden of laag pareren en meteen terugstoten. Wie de ander over de reling
drijft, wint de dag.

**Havens.** Kroeg (volk aanmonsteren, geruchten kopen, schatkaarten, de buit
verdelen), koopman (een economie die per stadssoort verschilt en reageert op
wat jij koopt en verkoopt), scheepswerf (herstellen, kanonnen, schepen kopen en
verkopen, vlaggenschip wisselen) en de gouverneur (bevorderingen, landgoed,
kaperbrieven, gratie, de dochter van de gouverneur en uiteindelijk je aftreden).

**Muziek.** Twee thema's, allebei op de *tresillo* — het 3+3+2-ritme met
Afro-Caribische wortels dat later de bodem werd van zowat alle eilandmuziek.
De bas valt op één, op de tegentel van twee en op vier; de akkoorden vallen er
telkens náást. Dat schuren laat de maat wiegen zonder dat er iets hard hoeft te
slaan.

Op zee klinkt het in F-groot, 103 slagen per minuut, geplukt in plaats van
aangehouden: korte aanslagen met een boventoon die sneller uitdooft dan de
grondtoon, waardoor het naar hout klinkt in plaats van naar een orgel. In de
zeeslag en het duel schakelt het over naar D-klein op 143 slagen, gehamerd in
plaats van geplukt, met een A7 waarvan de ene vreemde noot de maat naar de
volgende toe trekt.

Beide zijn opgebouwd uit delen van acht maten, en per deel wisselt de
bezetting: niet elke stem speelt altijd mee. Er zijn adempauzes waarin de
melodie zwijgt en een lage tegenstem hem alleen draagt, en delen waarin alles
tegelijk klinkt. Omdat de vorm en de bezetting verschillende lengtes hebben
schuiven ze langs elkaar; op zee duurt het bijna vier minuten voordat er iets
letterlijk wordt herhaald.

Daar bovenop valt het scheepsvolk af en toe in. Een klinker is niets anders dan
een paar vaste resonanties boven op een toon, dus met drie smalle filters wordt
een zaagtand een "oh" — en door die filters naar een andere klinker te schuiven
klinkt het als een woord dat je net niet verstaat. Dat is de bedoeling: ze
zingen mee, je hoort niet wát. In het gevecht wordt het zingen schreeuwen.

En eromheen de zee: branding die aanrolt en breekt, krakend hout, een enkele
scheepsbel en af en toe een meeuw. Alles ter plekke opgewekt uit oscillatoren
en geruis — er is geen enkel geluidsbestand, ook niet voor de meeuw of de bel.
Muziek en geluid staan los van elkaar in de scheepsraad.

**Beruchte kapiteins.** Zes namen varen ergens op deze zee: Dolle Jack in zijn
brigantijn, de Weduwe van Tortuga, de Kraai met een linieschip dat niemand hem
heeft gegeven. Ze laten zich pas zien als je naam ver genoeg reikt — de zwaarste
pas na een halve loopbaan — en ze wijken voor niemand. In de kroeg hoor je waar
er een gezien is; op de zeekaart staat er dan een doodskop. Wie er een verslaat
haalt uit het ruim een uitrustingsstuk dat op geen enkele werf te koop is:
koperen huidbeslag, katoenen zeilen, fijn kruit. Die stukken horen bij jou en
varen mee naar elk volgend vlaggenschip.

**Een vermist familielid.** Ergens in de Caraïben is een broer, zus, vader of
moeder van je verdwenen. Bedelaars in de kroeg wijzen een stad aan; wie daar
langs de kade navraagt, vindt niet het familielid maar een naam — en vanaf dat
moment vaart die naam rond. Zolang hij vaart, zoek je in geen enkele haven
verder: het antwoord ligt aan boord van zijn galjoen.

**De lange lijn.** Roem, rang bij vier naties, grondbezit, huwelijk, veroverde
steden — en je wordt ouder, en dat merk je. Na je veertigste wordt het venster
waarin je een stoot kunt pareren korter en komt je adem trager terug; vanaf je
vijfenvijftigste begint het volk erover, en een bevriende haven waar je rang
hebt biedt je vanaf je tweeënzestigste een huis boven de rede aan. Wie op tijd
aftreedt telt zwaarder op de erelijst dan wie tot zijn tachtigste doorvaart.
Aftreden geeft een eindscore over de hele loopbaan en een plaats op de erelijst
van de tien grootste kapiteins.

## Bediening

Sturen kan met de pijltjestoetsen of met `W` `A` `S` `D`. Op zee is `S` het
vlootscherm, dus daar mindert alleen ↓ het zeil.

| | |
|---|---|
| **Op zee** | ← → of `A` `D` sturen · ↑ ↓ zeil bij- of minderen · klik = koers uitzetten |
| | `M` zeekaart · `S` vloot en ruim · `C` bemanning · `Esc` scheepsraad |
| | scrollen of `+` `-` = in- en uitzoomen |
| **Zeegevecht** | ← → of `A` `D` sturen — hiermee richt je · ↑ ↓ of `W` `S` zeil |
| | `spatie` vuren · `1` `2` `3` rondkogel, kettingkogel, schroot · `Tab` volgende soort |
| | `B` enteren (binnen 95 m) · `Esc` proberen te vluchten |
| **Duel** | ↑ hoog · → midden · ↓ laag — pareer op de hoogte waarop hij uithaalt |
| **In een scherm** | `Esc` sluiten · `Tab` langs de knoppen · `Enter` indrukken |

## Bewaren en stoppen

Er is één opgeslagen spel, in `localStorage`. Het wordt **automatisch bewaard
zodra je een haven uitvaart** — het natuurlijke rustpunt, na de handel, de werf
en het aanmonsteren. Daarnaast kun je in de scheepsraad (`Esc` op zee) op elk
moment zelf bewaren, of bewaren en meteen stoppen.

Stoppen kan op twee manieren. Wie via de scheepsraad afsluit, kan later verder
waar hij gebleven was. Wie bij de gouverneur **aftreedt**, sluit zijn loopbaan
definitief af: de eindscore gaat naar de erelijst en het opgeslagen spel wordt
gewist. Een afgetreden kapitein vaart niet meer uit.

De erelijst staat los van het opgeslagen spel en blijft dus staan wanneer je het
logboek wist (titelscherm → *Het logboek wissen*).

## Opbouw van de code

```
index.html            startpunt
css/game.css          perkament-, goud- en zeethema
js/
  main.js             opstart, titelscherm, kapitein maken
  game.js             spelkern: toestand, scènes, invoer, opslag
  world.js            kaartgeometrie, steden, economie, wind, vloten
  data.js             naties, waren, scheepstypen, steden, rangen
  render.js           zee, kustlijnen, schepen, steden, windroos
  sail.js             overzichtsscène (varen)
  battle.js           zeeslag
  gevechtsmodel.js    ballistiek, schade en overgave — zonder canvas of DOM
  duel.js             degengevecht
  town.js             havenschermen
  ui.js               perkamentpanelen en dialogen
  util.js             wiskunde- en opmaakhulpjes
  audio.js            geluid en muziek uit de Web Audio API (zelf gespeeld)
```

`gevechtsmodel.js` raakt bewust geen canvas, geluid of DOM aan. Daardoor is het
gevecht ook buiten de browser door te rekenen, wat nodig is om de balans eerlijk
te houden: hoe lang doet een sloep erover om de batterij van een linieschip stil
te leggen, en hoe lang doet dat linieschip erover om de sloep te zinken. Wie aan
de getallen sleutelt, kan dat verschil meten in plaats van schatten.

Het spel wordt in `localStorage` bewaard onder de sleutel
`zeeroverij.opslag.v1`; opgeslagen wordt het wereldzaadje plus de
veranderingen daarop, zodat een save klein blijft.

Tijdens het sleutelen is de hele spelstaat bereikbaar via `__G` in de console,
bijvoorbeeld `__G.speler.goud = 50000` of `__G.scene.debug.vijand.romp = 1`.

## Verantwoording

Dit is een eerbetoon, geen kopie: alle code, vormgeving, geluid en tekst zijn
voor dit project geschreven. *Sid Meier's Pirates!* is eigendom van zijn
rechthebbenden; er is geen materiaal uit het origineel overgenomen.

De code is beschikbaar onder de [GNU GPL v3](LICENSE) (© 2026 Martin Splinter,
Bargeflow / Shipdocs). Dat betekent: gebruik en wijzig het vrij, maar elke
afgeleide versie moet ook onder de GPL open source blijven en de naam van de
oorspronkelijke auteur erin vermelden.
