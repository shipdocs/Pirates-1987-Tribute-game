# Zeeroverij

Een browserremake in de geest van *Sid Meier's Pirates!* — de Caraïben van 1660,
volledig in de browser, zonder build-stap, zonder frameworks en zonder externe
bestanden. Alleen HTML, CSS en ES-modules; alle graphics worden op het canvas
getekend en al het geluid wordt met de Web Audio API opgewekt.

## Spelen

Het spel gebruikt ES-modules, dus het moet via een webserver geopend worden
(rechtstreeks `index.html` openen werkt niet vanwege CORS).

```bash
git clone https://github.com/shipdocs/pirates.git
cd pirates
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

**De lange lijn.** Roem, rang bij vier naties, grondbezit, huwelijk, veroverde
steden — en je wordt ouder. Wie aftreedt krijgt een eindscore over zijn hele
loopbaan.

## Bediening

| | |
|---|---|
| **Op zee** | ← → sturen · ↑ ↓ zeil bij- of minderen · klik = koers uitzetten |
| | `M` zeekaart · `S` vloot en ruim · `C` bemanning · `Esc` scheepsraad |
| | scrollen of `+` `-` = in- en uitzoomen |
| **Zeegevecht** | ← → sturen — hiermee richt je · ↑ ↓ zeil · `spatie` vuren |
| | `1` `2` `3` rondkogel, kettingkogel, schroot |
| | `B` enteren (binnen 95 m) · `Esc` proberen te vluchten |
| **Duel** | ↑ hoog · → midden · ↓ laag — pareer op de hoogte waarop hij uithaalt |

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
  audio.js            geluid en muziek uit de Web Audio API
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
