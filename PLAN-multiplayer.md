# Plan: Zeeroverij online multiplayer

*Hoe we van een lokaal, solitair spel naar een online spel met andere kapiteins
komen — op de meest eenvoudige manier, met meerdere mogelijkheden, en met een
duidelijk aanbevolen pad. Dit plan gaat alleen over **multiplayer**; voor
"online zetten op GitHub Pages" en "betaald model" staat er al een eigen
analyse: [`ANALYSE-online-betaald-multiplayer.md`](ANALYSE-online-betaald-multiplayer.md).*

---

## TL;DR — lees dit als je haast hebt

Het spel is **nog volledig lokaal** (geen netwerkcode, alleen een `fetch()` voor
een geluidsbestand in [`audio.js`](js/audio.js:133)). Multiplayer is daardoor een
**nieuwe laag eromheen, geen herschrijving**, zolang we drie modellen mijden die
de architectuur wél zouden herschrijven:

| Model | Wat | Werk | Verdict |
|---|---|---|---|
| **A. Asynchrone gedeelde zee** | Andere spelers verschijnen als offline "schaduwkapers" bij hun laatste bekende positie | ~1–2 weken | ✅ **Begin hier** |
| **C. Live PvP duel (zwaard)** | 1-op-1, peer-to-peer (WebRTC) | ~2–4 weken | ✅ Sterke tweede stap |
| **D. Live PvP zeeslag** | Node-server hergebruikt [`gevechtsmodel.js`](js/gevechtsmodel.js:1) als scheidsrechter | ~4–8 weken | ✅ Daarna; beste demo + betaalmoment |
| **E. Volledig gedeelde live wereld (MMO)** | Eén wereld, honderden live spelers | maanden | ❌ **Niet doen** — herstructureert het spel |

**De drie kernredenen waarom dit makkelijk is:**

1. **De save is al een minimale delta, klaar om te delen.** [`bewaar()`](js/game.js:600)
   schrijft alleen *zaad + gewijzigde staat* (speler, oorlogen, stormen, steden)
   als één JSON van versie 9. Diezelfde JSON is een perfecte `POST` naar een
   server → klaar voor model A en cloud-save.
2. **De wereld is deterministisch uit een zaadje.** [`begin()`](js/main.js:468)
   kiest een willekeurig zaad, [`makeRng()`](js/util.js:35) bouwt dezelfde
   Caraïben voor iedereen. Met een **gedeeld zaad** zitten alle spelers dus in
   dezelfde wereld, zonder simulatie te synchroniseren.
3. **Het gevechtsmodel is headless.** [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
   raakt geen canvas/DOM/audio aan — het draait letterlijk op een Node-server
   als onomkoopbare scheidsrechter voor PvP. Dat gat is al gedicht.

**De twee harde beperkingen (lees vóór je iets bouwt):**

- Gameplay gebruikt overal [`Math.random`](js/sail.js:341) (wind, gebeurtenissen,
  gevechten in [`battle.js`](js/battle.js:358)). **Twee clients simuleren nooit
  exact dezelfde wereld.** "Lockstep" of "beide kanten rekenen zelf" is dus
  uitgesloten — realtime moet via één gezaghebbende partij (een peer of een server).
- Realtime netwerken is **input → referee → state → render**, en dat is een
  andere denkwijze dan de huidige `werkBij(dt)`-lus die direct lokale staat
  muteert. Hou dat verschil klein door de headless modellen te herbruiken.

**Aanbevolen pad (zie §6 voor details):**

> **3 stappen:** (1) publiceer op GitHub Pages en voeg een gedeeld erelijst-leaderboard
> toe via een gratis dienst; (2) bouw de asynchrone gedeelde zee met een tiental
> regels servercode; (3) voeg live PvP toe, eerst het duel (WebRTC, geen server),
> daarna de zeeslag (Node-referee op een server die jij host).

---

## Inhoud

1. [Wat de code is, en wat dat betekent](#1-wat-de-code-is-en-wat-dat-betekent)
2. [De modellen, van simpel naar complex](#2-de-modellen-van-simpel-naar-complex)
3. [Hoe de verbinding maken: alle opties naast elkaar](#3-hoe-de-verbinding-maken-alle-opties-naast-elkaar)
4. [Server of geen server: vergelijking](#4-server-of-geen-server-vergelijking)
5. [Wat je al hebt dat herbruikbaar is](#5-wat-je-al-hebt-dat-herbruikbaar-is)
6. [Aanbevolen pad — fase voor fase](#6-aanbevolen-pad--fase-voor-fase)
7. [Valkuilen en risico's](#7-valkuilen-en-risicos)
8. [Licentie: wat mag met de server](#8-licentie-wat-mag-met-de-server)
9. [Beslisvragen voor morgen](#9-beslisvragen-voor-morgen)

---

## 1. Wat de code is, en wat dat betekent

| Eigenschap | Waar | Gevolg voor multiplayer |
|---|---|---|
| Puur statisch, ES-modules, geen build, geen dependencies | [`README.md`](README.md:3) | Elke HTTP-host volstaat; een netwerklaag is een losse module erbij, geen build |
| Eén centrale `Game`-staat | [`game.js`](js/game.js:67) | Netwerkwijzigingen gaan indirect via dezelfde staat — geen refactor van 30 modules |
| Save = zaad + deltas, versie 9 | [`bewaar()`](js/game.js:600) | De "upload"-payload bestaat al, compleet en klein |
| Wereld deterministisch uit zaad | [`makeRng()`](js/util.js:35), [`Wereld`](js/world.js:250) | Gedeeld zaad = zelfde wereld voor iedereen |
| Gameplay met `Math.random` overal | [`sail.js`](js/sail.js:341), [`battle.js`](js/battle.js:358) | Geen twee clients rekenen identiek → realtime heeft één scheidsrechter nodig |
| Gevechtsmodel headless | [`gevechtsmodel.js`](js/gevechtsmodel.js:1) | Draait direct op Node als referee |
| Scèneprotocol `werkBij/teken/toets/…` | [`Game.zetScene()`](js/game.js:160) | Netwerk-input komt binnen op dezelfde `toets`-poort als toetsenbord |
| Erelijst lokaal | [`ERELIJST_SLEUTEL`](js/game.js:791) | Eenvoudig te delen naar een wereldleaderboard |
| Geen accounts, geen netwerkcode | — | Alles wat online is, is nieuw te bouwen (kan ook de enige verandering blijven) |

---

## 2. De modellen, van simpel naar complex

### Model A — Asynchrone gedeelde zee ("schaduwkapers") — *aanbevolen start*

**Idee:** De zee is gedeeld maar *niet* live. Elke speler uploadt af en toe zijn
tussenstand — naam, vlag, type schip, positie, niveau — naar een simpele
server. Wanneer jij vaart, haalt de client de laatste
tussenstanden van andere kapiteins op en tekent ze als **offline schepen op de
kaart en in beeld**. Jij vaart langs hun "geest", zij langs de jouwe zodra ze
online komen. Het spel blijft voor 90% singleplayer.

**Waarom dit past:** Het spel is nu juist eenzaamheden-vrij solitair; de wereld
is al leeg. Dit bevolkt de Caraïben met minimale kosten, en verandert de
solitaire kern niet: geen realtime, geen autoritatieve server, geen anti-cheat
nodig voor een handvol getekende scheepjes.

**Hoe (concreet):**

- **Gedeeld zaad.** De eenvoudigste variant: een *vast serverzaad* (bijv. `20250807`,
  net als de titelscène in [`main.js`](js/main.js:22)). Iedereen vaart in dezelfde
  Caraïben → de positie van een andere kapitein is direct betekenisvol.
  Alternatief (later): spelers kiezen hun eigen zaad, maar dan zien jullie
  elkaars schepen nooit op dezelfde kaart — dat haalt het doel onderuit. **Kies
  een gedeeld zaad.**
- **Nieuwe clientmodule [`js/net.js`](js/net.js)** (alles in het Nederlands,
  volgens de huisstijl):
  - `uploadTussenstand()` — stuurt een afgeslankte versie van [`bewaar()`](js/game.js:600)
    (naam, vlag, schip, `x`, `y`, dag, niveau; **niet** de hele spelerstaat).
  - `haalKapers()` — haalt de lijst op van laatst bekende tussenstanden.
  - `spookSchepen()` — zet die tussenstanden om naar een wereld-vloot die de
    bestaande tekenlaag kan gebruiken (zelfde vorm als `wereld.vloten`).
- **Upload-timing:** niet elke frame; bij `bewaar()`-momenten (uitvaren, anker,
  haven) plus maximaal elke 60 seconden zeevaren. `bewaar()` krijgt daardoor een
  optionele netwerk-gong mee.
- **Server:** zie §3/§4. Een kant-en-klare `server/index.js` van ~80 regels
  Node volstaat: `POST /kapitein` (upsert), `GET /kapiteins` (laatste per naam,
  ouder dan 30 dagen eruit), geen database nodig (bestand in het geheugen of op
  schijf in JSON).
- **Weergave:** anonymiseer (zelfgekozen kapiteinsnaam + vlag), geen live-status.

**Kostprijs:** ~1–2 weken deeltijd. Grootste risico: geen. Praktische valkuil:
clients die elkaar overspoelen → throttling en één upload per 30–60 s.

---

### Model B — Correspondentie-PvP (bijbeurten) — *overslaan*

**Idee:** PvP zonder gelijktijdig online te zijn, zoals schaken per post: speler
A speelt een slag, uploadt de stelling, B speelt verder, enz.

**Oordeel:** Voor het *duel* is elke "beurt" 5 seconden lang — dat werkt
theoretisch, maar een duel speelt juist op reflex, niet op beurten. Voor de
*zeeslag* is de toestand te groot en te continu om in beurten te puzzelen. Dit
model past bij expertschaken, niet bij Zeeroverij. **Overslaan** — model A geeft
al "spelen tegen anderen" zonder deze hoofdbrekens.

---

### Model C — Live PvP duel (zwaard) via WebRTC — *sterke tweede stap*

**Idee:** Het duel ([`duel.js`](js/duel.js:1)) is klein, 1-tegen-1 en al
realtime: drie standen, pareren, terugstoten. Precies het formaat dat peer-tot-peer
aankunnen. Via een WebRTC-datachannel sturen de twee spelers elkaar alleen hun
**input** (welke stand/parade, op welk moment); één van hen (de uitdager) is de
**scheidsrechter-peer** en stuurt 5–10× per seconde de goedgekeurde toestand
terug. De andere render gewoon wat hij ontvangt.

**Waarom WebRTC hier:** geen gameplay-server nodig → geen hosting, geen kosten,
geen latency via een omweg. Signalen (wie is wie, verbinding opzetten) gaan via
een gratis signaleringsdienst (PeerJS-cloud) of je eigen mini-signalingserver
(zie §4). NAT-problemen van de meeste thuisnetwerken worden opgelost door STUN;
alleen in zeldzame strenge NAT's is een TURN-server nodig.

**Hoe (concreet):**

- **PeerJS of handmatig WebRTC.** PeerJS (een klein script, zo'n 40 kB, in
  `vendor/` zetten zodat het spel dependency-vrij blijft) regelt signalering +
  STUN. Jij roept `peer.on('data', …)` en `peer.send(…)` aan — de rest is een
  kwestie van die datachannel aan de duel-scène hangen.
- **Scheidsrechter-peer:** de uitdager draait de duel-logica en stuurt na elke
  verandering de relevante toestand (positie, fase, levens, bericht) naar de
  gast. De gast stuurt alleen `{t: tijd, keuze: 'hoog'|'midden'|'laag', pareren: bool}`.
- **Latency:** het pareren-venster is [`lerp(0.38, 0.8, vaardigheid)`](js/duel.js:35) —
  zolang de rondetijd < ~150 ms blijft, speelt het eerlijk genoeg voor een
  vriendenpotje. Latency-weergave (ping) tonen in de lobby is verstandig.
- **Cheaten:** de scheidsrechter kan vals spelen. Voor vrienden prima; voor een
  betaalde dienst moet het naar model D.

**Kostprijs:** ~2–4 weken deeltijd, waarvan de lobby (kamercode van 6 letters,
scène "uitdagen vs. accepteren" op het titelscherm via [`UI.toonScherm`](js/ui.js))
de helft is.

---

### Model D — Live PvP zeeslag via een eigen Node-referee — *daarna, de beste demo*

**Idee:** De zeeslag ([`battle.js`](js/battle.js:1)) wordt 1-tegen-1 echt online:
jij tegen een andere kapitein op dezelfde wind. De server is **autoritatief**:
hij draait [`gevechtsmodel.js`](js/gevechtsmodel.js:1) (dat is headless!) samen
met de beweging/logica, ontvangt de input van beide clients (roer, zeilstand,
munitie, vuren), berekent de wereld en stuurt 10–20× per seconde de goedgekeurde
toestand naar beide clients. De clients renderen alleen nog maar.

**Waarom dit de *beste* stap is ondanks meer werk:** het is de sterkste demo van
het spel (andere kapitein op het scherm), het is de natuurlijke plek voor een
eventuele betaalmuur ("PvP-club"), en de anti-cheat zit ingebakken omdat de
server alles beslist. En het grote werk is al gedaan: [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
is al DOM-vrij en kan in Node draaien.

**Hoe (concreet):**

- **`server/index.js`** — WebSocket-server (bijv. `ws`-pakket, ~20 lines code).
  Verzorgt lobby, matchmaking (twee spelers in een kamer), herverbindingen.
- **`server/referee.js`** — draait de slag op 20 Hz: imports vanuit
  [`gevechtsmodel.js`](js/gevechtsmodel.js:1) (trekt 1 op 1 over), terwijl
  [`battle.js`](js/battle.js:1) én rendering (camera, schuim, rook) aan de
  clients blijven. De clients sturen hun commando's; de server stuurt de
  toestand. **Belangrijk:** deze fase vraagt wél refactoring van `battle.js` —
  de scene splitst in "bepaal toestand" (server) en "teken toestand" (client).
  Grofweg 40% van `battle.js` is nu visueel; die blijft, de rest verhuist naar
  de referee.
- **Terrein:** [`maakSlagTerrein()`](js/battle.js:46) is al deterministisch uit
  zaad + positie + tegenstandernaam — de server en beide clients kunnen
  hetzelfde terrein opbouwen zonder het te versturen.
- **Momenten:** herverbinding (server houdt de toestand bij, de client rejoint),
  tijd-out bij afhaken, vlag van het schip (de speler brengt zijn eigen vlag in).

**Kostprijs:** ~4–8 weken deeltijd. Het is de enige fase die echt in de
architectuur snijdt, maar het snijdt ónder in een al-doorgezaagde plek (het
headless model).

---

### Model E — Volledig gedeelde live wereld ("MMO") — *niet doen*

**Idee:** Eén serverwereld waar honderden spelers tegelijk varen, handel die
door iedereen schuift, vloten die elkaar jagen in realtime.

**Oordeel:** Dit botst met de kern van de code: elke scene-mutatie
([`werkBij(dt)`](js/game.js:187)) verandert direct de lokale wereldstaat. Het
zou het spel van "lokale staat" naar "server-goedgekeurde staat" moeten
ombouwen, met accounts, databases, locking, anti-cheat en een
productieserver die 24/7 draait. Voor één solo-ontwikkelaar is dat een project
op zich — en het verandert de identiteit van het spel (solitaire
schatjacht/handel/duel wordt een concurrentie-arena). **Doe dit niet voordat A,
C en D staan; beslis dan opnieuw.**

---

## 3. Hoe de verbinding maken: alle opties naast elkaar

| Optie | Waarvoor | Voorbeeld | Kosten | Latency | Werk |
|---|---|---|---|---|---|
| **WebRTC (peer-to-peer)** | Live duel (model C); geen gameplay-server nodig | PeerJS of handmatig, signalering via gratis cloud of eigen mini-server | €0 (of €0,01 voor TURN) | Laag (~50–150 ms) | Middel; lobbylogica zelf |
| **Eigen kleine Node-server** | Model A (tussenstanden), model D (referee), signalering | Node + `ws`, draait op jouw VPS/Raspberry Pi/oude laptop | €3–6/maand of thuis | Laag | Laag (A) tot middel (D) |
| **Serverless (Cloudflare Workers / Vercel)** | Erelijst, cloud-save, tussenstanden (A) — *geen* realtime | Edge functions + KV | €0 (gratis laag) | Middel (cold starts) | Laag |
| **Managed realtime (Colyseus / Supabase Realtime)** | Rooms, matchmaking, gedeelde staat | Colyseus (OSS room-engine) of Supabase | Gratis laag → betaald | Middel | Middel; sneller dan zelf bouwen |
| **BaaS (Firebase / Supabase)** | Accounts, cloud-save, leaderboard, A | Firestore, Auth | Gratis start | Hoog (geen realtime-vereiste) | Laag |

**Voor model A is de keuze onbelangrijk** (een eenvoudige `POST`+`GET`), dus die
kun je later nog verhuizen. **Voor model D is een eigen Node-server of Colyseus
de enige reële keuze** — realtime, 20 Hz, rechtstreeks [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
importeren.

---

## 4. Server of geen server: vergelijking

| | **Geen server** (WebRTC) | **Kleine eigen server** | **Managed dienst** |
|---|---|---|---|
| Hosting | PeerJS-cloud + STUN (gratis) | Jouw VPS/oude machine | Supabase/Firebase/Colyseus-cloud |
| Kosten | €0 | €3–6/maand (of thuis, €0) | Gratis laag, daarna maandelijks |
| Werkt offline voor jou? | Ja (alleen signalering) | Nee (server moet aan) | Nee |
| Anti-cheat | Geen (host gokt) | Volledig (server beslist) | Volledig |
| Controle & dataprivacy | Weinig (data via derden) | Volledig | Deels |
| Realtime kwaliteit | Goed voor duel | Beste (laagste latency zelf) | Goed, maar extra hop |
| Onderhoud | Bijna niets | Jij (updates, uptime) | Zij (jij niet) |
| Beste voor | Model C (duel) | Model D (zeeslag) + A | A + leaderboard + accounts |

**Aanbeveling:** Begin **serverless / gratis dienst** voor het leaderboard en
model A (dat scheelt hosting), zet een **eigen kleine Node-server** pas op
wanneer model D live gaat — dan heb je de server die je toch nodig hebt, en
kun je hetzelfde proces voor signalering en lobbies hergebruiken. WebRTC blijft
de slimme truc voor het duel zónder server.

---

## 5. Wat je al hebt dat herbruikbaar is

- **De hele save-als-delta.** [`bewaar()`](js/game.js:600) produceert al
  exact de payload die model A en cloud-save nodig hebben: seed + veranderde
  wereldstaat, klein en versiegeven. Er komt geen nieuw serialisatieformaat bij.
- **Deterministisch wereldzaad + terrein.** [`Wereld`](js/world.js:250),
  [`maakSlagTerrein()`](js/battle.js:46), schatjacht — alles hangt aan een zaad.
  Een gedeeld zaad geeft iedereen dezelfde Caraïben en hetzelfde slagveld,
  zonder dat je het hoeft te versturen.
- **Headless [`gevechtsmodel.js`](js/gevechtsmodel.js:1).** Kan 1-op-1 in Node
  draaien als referee. Dit is de kern van model D en het enige bestand dat
  server én client delen.
- **Scèneprotocol.** [`toets(event)`](js/game.js:124) is al de enige ingang voor
  input; een netwerk-"toets" kan dezelfde poort in — lobbyknoppen in de
  titelscene, netwerkgebeurtenissen als `UI.toonScherm`-vensters.
- **Erelijst.** [`ERELIJST_SLEUTEL`](js/game.js:791) is al gescheiden van de
  save — ombouwen naar "haalt lijst van server, valt lokaal terug" is een kluifje.

---

## 6. Aanbevolen pad — fase voor fase

### Fase 0 — Online zetten + gedeeld erelijst-leaderboard (½–1 dag)

1. Publiceer op GitHub Pages (workflow staat er al: [`pages.yml`](.github/workflows/pages.yml)).
2. **Gedeeld leaderboard** via een gratis dienst (bijv. een serverless
   endpoint of een Supabase-tabel): bij het aftreden stuurt de client naam +
   score + datum; de titelscene toont de top tien van de wereld en valt stil
   terug op de lokale lijst als de server onbereikbaar is. `try/catch` rond al
   het netwerk, net als bij localStorage — het spel moet gewoon blijven werken
   zonder verbinding.
3. *Resultaat:* online + de eerste echte "andere spelers op de lijst". Nog geen
   multiplayer, wel de infrastructuur (fetchen, POST, gracefully offline).

### Fase 1 — Asynchrone gedeelde zee / schaduwkapers (1–2 weken)

1. **Gemeenschappelijk zaad** invoeren (nieuw spel start met het serverzaad;
   bewaar oude logboeken en hun zaad gewoon).
2. **`server/index.js`** (~80 regels Node): `POST /kapitein`, `GET /kapiteins`,
   geheugen- of bestandsopslag, TTL 30 dagen. Testbaar met `curl`.
3. **`js/net.js`** (client): `uploadTussenstand()` (throttle, 30–60 s), `haalKapers()`,
   data-anonimisering (naam + vlag + scheepstype + positie + dag + niveau).
4. **Weergave:** spookschepen als extra vloot in de tekenlaag; dichtbij
   renderen, op de kaart als scheepjes met naam — hoewel het offline schepen
   zijn, leest het als "er varen anderen".
5. *Acceptatie-criterium:* twee browsers, zelfde zaad; A vaart iets, B ziet A's
   schip waar A het achterliet; na 30 dagen verdwijnt het.
6. *Waarom nu dit en niet PvP:* het kost het minste, raakt de solitaire kern
   niet, en het levert de server + net.js op die alle latere fasen hergebruiken.

### Fase 2 — Live PvP duel via WebRTC (2–4 weken)

1. **Lobby** in de titelscène: "Uitdagen" maakt een kamercode (6 letters),
   "Meedoen" zet je in andermans kamer; beiden tonen ping.
2. **`js/peer.js`** (PeerJS, gevend in `vendor/`): datachannel openen,
   handshake (welke speler, welk duel-team, wie scheidsrechter is).
3. **Scheidsrechter-duel:** de uitdager draait [`maakDuel()`](js/duel.js:25),
   stuurt goedgekeurde toestand; de gast stuurt input (`{t, keuze, pareren}`)
   en rendert ontvangen toestand.
4. *Acceptatie:* twee browsers op twee netwerken spelen een vloeiend duel;
   bij verbindingsverlies komt een nette "tegenstander weg" + herkansing.
5. *Waarom WebRTC:* nul hostingkosten, en de duel-sync is klein genoeg dat de
   host-netwerktoestand in een paar velden past.

### Fase 3 — Live PvP zeeslag via Node-referee (4–8 weken)

1. **`server/referee.js`**: 20 Hz-simulatie die [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
   en de beweging/balans uit `battle.js` draait; de scene [`battle.js`](js/battle.js:1)
   splits in "input verzenden + toestand renderen" (client) en "toestand
   berekenen" (referee). Behoud [`maakSlagTerrein()`](js/battle.js:46) aan
   beide kanten uit één zaad.
2. **Herverbinding:** de referee houdt de kamer 60 s vast; een client die
   terugkomt ontvangt de huidige toestand en vervolgt.
3. **Matchmaking / voordelen:** eerlijke koppeling via scheepsniveau; de speler
   brengt zijn eigen vlag in, schade werkt precies als in model D.
4. *Waarom de beste demo:* twee mensen vechten op één scherm met als
   scheidsrechter dezelfde code die de balans al eerlijk houdt — en dit is de
   natuurlijke plek voor een eventuele betaalmuur later.

### Fase 4 — Opties erna (pas als 0–3 staan)

- Cloud-save + accounts (Supabase Auth) → verder spelen op een ander apparaat.
- Co-op varen (jij roert, vriend vuurt kanonnen) — maakt de zeeslag-referee
  dubbel zo leuk.
- Wekelijks "oorlog": de gedeelde zee telt welke natie de meeste schaduwkapers
  in haar wateren heeft — competitie zonder realtime.

---

## 7. Valkuilen en risico's

1. **"Twee clients rekenen zelf" werkt niet.** Overal `Math.random` betekent dat
   lockstep-simulatie onmogelijk is. Realtime = één scheidsrechter. Zeg dat
   hardop tegen jezelf vóór je een architectuur kiest.
2. **Netwerk nooit in de teken- of simulatie-lus.** Bouw het als een losse laag
   (net.js) die bij binnenkomende berichten `Game`/scene staat bijwerkt — niet
   als `fetch()` midden in `werkBij(dt)`. Asynchrone berichten die een UI-
   overlay openen terwijl de speler vaart, kunnen dezelfde
   `UI.ietsOpen()`-bevriezing veroorzaken als het spel al kent (zie
   [AGENTS.md](AGENTS.md)).
3. **Meldingen/schermen alleen op de juiste plek.** Een binnenkomende
   uitdaging moet als `UI.toonScherm` binnenkomen, nooit een canvas-tekening
   onderbreken. Gebruik de bestaande `Esc`/`sluit()`-afhandeling.
4. **Schaal van de wereld.** Twee spelers in één live wereld écht zien varen
   vereist dat we de *lokale* wind voor beide hetzelfde houden — dat is waar
   model D (referee) het simpelst blijft, omdat de server de wind bezit.
5. **Anonimiteit/privacy in model A.** Upload geen volledige save — alleen
   naam, vlag en positie. De volledige [`bewaar()`](js/game.js:600) bevat
   voorraad/geld/talenten; die hoort níét op een server.
6. **Verbinding weg = niet vernielen.** Alles wat netwerk doet, in `try/catch`:
   als de server onbereikbaar is, blijft het spel speelbaar (leaderboard valt
   terug op lokaal, model A draait gewoon solo).
7. **Hack de host niet in model C.** WebRTC-protocollen zijn "wie host, kiest" —
   logische valsspelers. Prima voor vrienden; commercialiseer pas in model D.
8. **Overload door spookschepen.** Duizenden oude tussenstanden moeten de client
   niet overladen: de server retourneert alleen de ~50 dichtstbijzijnde bij je
   positie (of de server filtert per `GET ?rondX=&rondY=&straal=`).

---

## 8. Licentie: wat mag met de server

De **huidige versie** valt onder de eigen licentie: proprietary / alle rechten
voorbehouden ([`LICENSE`](LICENSE)). Eerdere, al gepubliceerde versies stonden
onder GPL v3 en behouden voor precies die versies de toen verleende rechten.
De bestaande
[`ANALYSE-online-betaald-multiplayer.md`](ANALYSE-online-betaald-multiplayer.md)
beschrijft nog die eerdere GPL-situatie en is voor de huidige code dus geen
leidende licentiebron meer.

- De rechthebbende kan de huidige client en een eigen multiplayer-server zelf
  hosten, wijzigen en commercieel aanbieden. Derden krijgen door de zichtbare
  browsercode of een bereikbare server geen gebruiks-, wijzigings- of
  distributierecht.
- Een server die het huidige [`gevechtsmodel.js`](js/gevechtsmodel.js:1)
  rechtstreeks hergebruikt, blijft onderdeel van de proprietary codebasis; dat
  hergebruik legt op zichzelf geen GPL-publicatieplicht op.
- Wordt bewust code uit een eerder onder GPL v3 gepubliceerde versie als basis
  gebruikt, dan blijven de GPL-rechten en -verplichtingen van die oude code wel
  relevant bij verspreiding van afgeleide software. Houd herkomst en versies
  daarom expliciet vast.
- Praktisch: behandel [`LICENSE`](LICENSE) als leidend voor nieuwe client- en
  servercode en laat concrete licentie- of distributieconstructies zo nodig
  juridisch toetsen voordat een dienst of serverpakket aan derden wordt
  aangeboden.

---

## 9. Beslisvragen voor morgen

Als je dit morgen leest, beslis dan deze drie dingen — de rest volgt er uit:

1. **Wil je een server hosten?**
   - *Ja, kleine Node-server:* model A nu (zelfde zaad) + later model D; alles in
     eigen hand.
   - *Nee, zo goedkoop mogelijk:* start met serverless voor leaderboard + model A,
     duel (model C) puur via WebRTC; een server komt er pas bij als de zeeslag
     live moet.
   - *Weet ik niet:* doe Fase 0 + Model C eerst — die zijn gratis én leveren al
     "echt online spelen" op zonder serverbeslissing.
2. **Gedeeld zaad of eigen zaad?** Voor multiplayer: **gedeeld zaad** (iedereen
   dezelfde Caraïben). Eigen zaad blijft bestaan voor wie solo wil.
3. **Hoeveel tijd mag het kosten?**
   - ½ dag → Fase 0 (online + leaderboard).
   - 1–2 weken → + Model A (schaduwkapers).
   - 1–2 maanden → + Model C (live duel) en/of Model D (live zeeslag).

---

*Uitgangspunt voor dit plan: de laatste commit van het project (bewaren/stoppen/
erelijst, save-versie 9). Alle verwijzingen naar bestanden en functies kloppen
met de huidige werkmap.*
