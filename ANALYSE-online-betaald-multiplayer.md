# Analyse: Zeeroverij online — hosting, betaalde game en multiplayer

*Waar het spel nu staat, wat er nodig is om het online te brengen, of en hoe je er
geld voor kunt vragen, en wat multiplayer voor deze codebase betekent. Vertrekt
vanuit de laatste commit (bewaren/stoppen/erelijst).*

---

## 0. Status van de laatste commit

De laatste commit (`a14526f`, samengevoegd in `d04591f`) bracht:

- **Bewaren** op drie plekken: automatisch bij het uitvaren, in de scheepsraad, en
  het logboek wissen vanaf het titelscherm.
- **Stoppen** dat echt afsluit: een afgetreden kapitein komt op een erelijst van
  tien en de save wordt gewist; [`laad()`](js/game.js:316) weigert een gestopte
  kapitein ook als er nog een oudere save ligt.
- **Bediening**: `Esc` sluit schermen, `Tab` wisselt munitie in de zeeslag en
  loopt erbuiten door de knoppen, `S` mindert zeil in de zeeslag.

Het spel is hiermee wat betreft de kern-loop compleet: varen, handel, gevecht,
politiek, de lange lijn, bewaren en stoppen. Er staat verder niks aan een
online-versie in de weg behalve die online-versie zelf.

---

## 1. Uitgangspunt van de code

Wat de code is — en wat dat betekent voor "online", "betaald" en "multiplayer":

| Eigenschap | Waar | Gevolg |
|---|---|---|
| Puur statisch (HTML, CSS, ES-modules; geen build-stap) | [`README.md`](README.md:3) | Elke statische host volstaat; geen serverlogica nodig voor een publieke release |
| Geen frameworks, geen dependencies | [`README.md`](README.md:20) | Klein oppervlak kwetsbaarheden, makkelijk te hosten |
| Alle staat lokaal in `localStorage`, één spel | [`bewaar()`](js/game.js:278), [`OPSLAG_SLEUTEL`](js/game.js:9) | Geen accounts, geen cloud — eerste online-stap is eenvoudig |
| Wereld wordt gemaakt uit een zaadje (deterministisch) | [`makeRng()`](js/util.js:26), [`Wereld`](js/world.js:129) | Elke speler kan dezelfde wereld hebben — belangrijk voor multiplayer |
| Gameplay wél met `Math.random` overal (wind, gevecht, gebeurtenissen, diplomatie) | [`sail.js`](js/sail.js:341), [`battle.js`](js/battle.js:358), [`world.js`](js/world.js:454) | De simulatie is **niet** deterministisch over meerdere clients — een gedeelde realtime wereld is daarmee veel werk |
| Gevechtsmodel zonder canvas, geluid of DOM | [`gevechtsmodel.js`](js/gevechtsmodel.js:1) | De zeeslag-logica is herbruikbaar op een server — groot voordeel voor PvP |
| Erelijst lokaal, gescheiden van de save | [`ERELIJST_SLEUTEL`](js/game.js:359) | Kan makkelijk naar een gedeeld leaderboard |

---

## 2. Online brengen — bijna klaar

**Het spel publiek zetten is het eenvoudigste deel.** De repo heeft al een
GitHub Pages-workflow ([`.github/workflows/pages.yml`](.github/workflows/pages.yml:1))
die bij elke push naar `main` de map `/` publiceert. Dat staat ook in de README:

- push naar `main` → het spel staat op `https://shipdocs.github.io/Pirates-1987-Tribute-game/`
- geen server, geen DNS, geen kosten.

Eventueel een eigen domein erbovenop (CNAME) als het serieuzer moet ogen. Voor
"online" in de zin van *multitenant met accounts en gedeelde wereld* is een
backend nodig — zie sectie 4. Maar het spel als zodanig is met één `git push`
live.

---

## 3. Betaalde game

Hier liggen twee knelpunten: de door jou gekozen **GPL v3** en het feit dat dit
een **eerbetoon** aan *Sid Meier's Pirates!* is.

### 3.1 GPL v3: verkopen mag, gesloten niet

De code valt onder [GNU GPL v3](LICENSE:1). Dat staat commerciële exploitatie
toe — je mag het spel verkopen — maar met twee voorwaarden die alles bepalen:

1. **De bron moet open blijven** voor iedereen die het spel krijgt.
2. **Elke afgeleide versie moet ook GPL blijven**, met naamvermelding van de
   auteur.

Praktisch betekent dat: zodra je het spel voor geld aanbiedt, mag elke koper het
ook gratis doorgeven, verbouwen en opnieuw uitgeven. Een gesloten, betaalde
"premium"-versie met kopieerbeveiliging is dus **niet** mogelijk onder de huidige
licentie — en dat was precies de bedoeling, zoals de eigen analyse noteert
(["zo kan niemand een gesloten, betaalde kloon maken"](ANALYSE-pirates-vergelijking.md:237)).

Je kunt de licentie wél wisselen naar een verboden-clausule-model, of naar
commercieel (e.g. "het spel is gratis, de dienst is betaald", zie 3.3). Omdat alle
rechten bij één auteur liggen, is zo'n wijziging juridisch haalbaar — maar hij
zou de filosofie van het project (vrij eerbetoon) omdraaien.

### 3.2 Eerbetoon: de grootste juridische voetangel

Het spel is onmiskenbaar een eerbetoon aan *Sid Meier's Pirates!* (zie ook
[`ANALYSE-pirates-vergelijking.md`](ANALYSE-pirates-vergelijking.md:1)): de
Caraïben, de vier naties, gouverneursopdrachten, zeeslag met rond/ketting/schroot,
duel hoog/midden/laag, het vermiste familielid, de erelijst.

- **Gameplay-mechanieken zelf** zijn in het auteursrecht meestal niet
  beschermd — alleen de *expressie* (naam, teksten, beeld, geluid).
- **Maar** zodra je geld vraagt, krijg je een commercieel product dat opvalt
  bij de rechthebbenden van en merken rond "Pirates!" en "Sid Meier".
  Een gratis open-source-hommage is een stuk veiliger dan een betaalde versie.

Voor een **betaalde** release is aan te raden (minimaal): geen gebruik van de
naam "Pirates!", geen overgenomen teksten/sprites/geluiden, een eigen titel en
eigen vormgeving, en een jurist (IE-recht) naar de look-and-feel laten kijken.

### 3.3 Wat wél kan: geld verdienen zonder gesloten bron

Het spel zelf gratis houden en geld vragen voor de **dienst eromheen** is onder
GPL het minst wrijving. De GPL bindt de *client-code*; een aparte server- of
platformlaag (accounts, leaderboards, matchmaking, opslag) kun je gewoon als
gesloten product aanbieden, zolang je die serverlogica niet van de GPL-client
afleidt. Concrete verdienmodellen:

- **Donaties / ko-fi / Patreon** — minste werk, past bij het project.
- **Betaalde accounts** voor online-functies (zie sectie 4): cloud-save,
  gedeelde wereld, PvP, wereldleaderboard.
- **Cosmetica of uitbreidingspakketten** bovenop het gratis kernspel
  (bijv. extra naties, scenario's, figuring) — als de client daarvoor niet
  gekopieerd mag worden, moet dat deel apart gelicenseerd worden.
- **Pay-what-you-want (itch.io)** — éénmalig, makkelijk, met de bron erbij
  publiceren om aan de GPL te voldoen.

### 3.4 Economisch

Een tekst+vector-canvas eerbetoon heeft een klein maar trouw publiek
(retro-fans, Pirates!-fans). Een betaalde prijskaartje zal de community
schrikken en de opbrengst is bescheiden. De marktwaarde zit eerder in
**naamsbekendheid, portfolio en de liefde voor het project** dan in directe
omzet. Realistisch: gratis hosten + donaties, en een betaalde
multiplayer-dienst als het spel een publiek krijgt.

---

## 4. Multiplayer — de architecturale kloof

Multiplayer is **geen feature maar een herstructurering**: het spel is volledig
lokaal en realtime, alle modules muteren rechtstreeks één [`Game`](js/game.js:11)-object.
`Math.random` zit overal in de gameplay, dus twee clients draaien nooit dezelfde
simulatie. Dat sluit een "gedeelde autoritatieve wereld" direct uit zonder grote
ingreep.

De haalbare modellen, van klein naar groot:

### A. Asynchrone gedeelde zee (dagen werk) — aanbevolen start

De zee is leeg; andere spelers zijn offline NPC-schepen op basis van hun save
(naam, vlag, vaart). Jij ziet hun schepen, zij zien de jouwe wanneer ze online
komen. Perfect passend bij een spel dat 90% singleplayer is.

- Technisch eenvoudig: `bewaar()` schrijft nu een JSON naar `localStorage`
  ([`bewaar()`](js/game.js:278)); diezelfde JSON wordt een `POST` naar een
  simpele backend (Supabase/Firebase/kleine Node-server). De server deelt het uit
  als "schepen van andere kapiteins".
- Verandert de solitaire kern niet: geen realtime, geen autoritatieve server,
  geen anti-cheat nodig voor de scheepjes.
- Wapen: de wereld wordt per speler uit een zaadje opgebouwd
  ([`begin()`](js/main.js:453), [`Wereld`](js/world.js:129)) — je kunt
  spelers dezelfde of een eigen Caraïben laten delen zonder simulatie-sync.

### B. PvP: de zeeslag en het duel (weken tot maanden werk)

De zeeslag en het duel zijn al realtime, 1-tegen-1, klein en dicht bij de speler:
dat is precies wat een PvP-avond aantrekkelijk maakt. Wat erbij komt:

- **Netwerklaag**: WebRTC (peer-to-peer, gratis bandbreedte) of een
  WebSocket-server (makkelijk te valideren, maar kost server).
- **Autoritatieve server**: in een betaald product wil je niet dat de host
  vals kan spelen. Het gevechtsmodel is gelukkig al DOM-vrij
  ([`gevechtsmodel.js`](js/gevechtsmodel.js:1)) — het kan direct op een
  Node-server draaien als de refereesimulatie, terwijl de clients alleen
  renderen. Dat is een groot gat dat al gedicht is.
- **Matchmaking, lobby, verbindingen** (STUN/TURN voor WebRTC), herverbindingen,
  afhakers — allemaal nieuw.

### C. Volledig gedeelde live Caraïben ("ZMO") (maanden tot jaar)

Eén wereld met honderden live spelers, handel die door iedereen schuift,
realtime vloten, jacht op elkaar. Dit botst met de kern van de code: elke
scene-mutatie (`werkBij(dt)` in [`sail.js`](js/sail.js:64), [`battle.js`](js/battle.js:25))
verandert direct de lokale staat. Om dit te doen moet het spel van "lokale staat"
naar "server-goedgekeurde staat", met accounts, databases, locking en anti-cheat.
Voor één solo-ontwikkelaar is dit een project op zich — en het verandert de
identiteit van het spel.

---

## 5. Aanbevolen pad (concreet)

1. **Publiceer nu op GitHub Pages** — de workflow staat er al; één push en het
   is live, gratis, en de link kan overal gedeeld worden.
2. **Laat het spel gratis + GPL.** De licentie is de identiteit van het project;
   een gesloten betaalde versie is niet alleen lastig maar ondergraaft het
   eerbetoon.
3. **Geld op de dienst, niet op de bron**: cloud-save, gedeeld leaderboard en
   later een PvP-"club" als betaalde laag bovenop de gratis client (gerechtvaardigd
   onder GPL zolang de serverlogica eigen werk blijft).
4. **Begin multiplayer met model A** (asynchrone gedeelde zee): weken werk,
   geen risico voor de solitaire spelvorm, en het is de snelste manier om de zee
   ineens bevolkt ogen met andere kapers.
5. **Daarna B** (PvP zeeslag/duel) via een WebSocket+Node-referee die
   [`gevechtsmodel.js`](js/gevechtsmodel.js:1) hergebruikt; dit is de sterkste
   demo en de natuurlijke plek voor een betaalmuur.
6. **Vóór een betaalde release**: naam en vormgeving ontdoen van "Pirates!”-merken
   en een jurist (IE) de hommage laten toetsen.

---

## 6. Verdict

- **Online**: ✅ **Klaar**. Statische site + bestaande GitHub Pages-workflow; één
  push publiceert het spel.
- **Betaald**: ⚠️ **Mogelijk, maar alleen open-source of als betaalde dienst.**
  GPL v3 laat verkoop toe maar met open bron; een gesloten premium-versie vereist
  een licentiewijziging en een jurist voor het eerbetoon-aspect. Meest kansrijk:
  gratis spel + donaties, daarna betaalde accounts/leaderboards/PvP.
- **Multiplayer**: ⚠️ **Haalbaar, maar kies een model.** Het asynchrone model
  (gedeelde zee met andere kapers) is weken werk en past perfect; PvP zeeslag/duel
  is weken tot maanden en profiteert van het al DOM-vrije gevechtsmodel; een
  volwaardige gedeelde live-wereld is een groot project dat de architectuur zou
  herstructureren en niet bij dit solitaire eerbetoon past.
