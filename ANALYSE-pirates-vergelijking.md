# Analyse: Zeeroverij vs. Pirates! Gold (1993) en Sid Meier's Pirates! (2004)

*Vergelijking van de gameplay en de grafische keuzes van de drie versies, met een
actieplan dat past bij een simpele, canvas-getekende browser-remake.*

---

## 1. Wat Zeeroverij nú al heeft

Op basis van de code in [`js/`](js/) is de kern-loop van het origineel grotendeels
aanwezig en op sommige punten zelfs dieper uitgewerkt dan Gold (1993):

| Systeem | Waar | Opmerking |
|---|---|---|
| Zeilen met wind | [`sail.js`](js/sail.js:125), [`world.js`](js/world.js:579) | Zeilefficiëntie hangt af van scheepstype; wind draait/neemt toe |
| Proviand, moraal, deserteurs, muiterij | [`sail.js`](js/sail.js:287) | Dagelijkse tik |
| Zeegevecht in realtime | [`battle.js`](js/battle.js:25), [`gevechtsmodel.js`](js/gevechtsmodel.js:1) | Breedzijden, ballistiek, voorhoudpunt, 3 munitie, brand, overgave |
| Duel (hoog/midden/laag) | [`duel.js`](js/duel.js:21) | Zelfde steen-papier-schaar als origineel |
| Handel (7 waren) | [`world.js`](js/world.js:297), [`town.js`](js/town.js:571) | Prijzen reageren op jouw kopen/verkopen |
| Haven: kroeg, werf, koopman, gouverneur | [`town.js`](js/town.js:58) | Volledig |
| Kroeg: aanmonsteren, geruchten, buit verdelen, schatkaarten | [`town.js`](js/town.js:377) | Schatkaart = 4 stukken verzamelen |
| Gouverneur: rang, land, kaperbrief, gratie, dochter, huwelijk, aftreden | [`town.js`](js/town.js:819) | Eindscore bij pense |
| Stadsbestorming met duel tegen de bevelhebber | [`town.js`](js/town.js:996) | Keuze: overdragen / houden / plunderen |
| Roem, rang bij 4 naties, relaties, veroudering | [`game.js`](js/game.js:172) | |
| Skills (5) en moeilijkheidsgraden (4) | [`data.js`](js/data.js:116) | Naar "special abilities" origineel |
| Vloten met eigen doelen, jacht, ontwijking | [`world.js`](js/world.js:429) | Zicht-blokkades door land |

Sterke punten t.o.v. 1993: het zeegevecht is *fysiek* (echte kogelbanen en
voorhoudpunt), en de economie is *dynamisch* (speler beïnvloedt prijzen). Dat is
doordachter dan het origineel.

---

## 2. Pirates! Gold (1993) — gameplay

Gold is een remake van *Sid Meier's Pirates!* (1987) met dezelfde spelregels,
maar met VGA-256-kleuren, betere muziek, en een editor. Gameplay-hoogtepunten:

- Zeilen met wind, water en de klassieke "tijdsversnelling".
- Realtime zeeslag met kanonnen; enteren eindigt in een degengevecht
  (hoog/midden/laag).
- **Losgeld voor gevangenen**: gevangen nobele offieren konden worden
  geruild voor geld of gevangenen.
- **Opdrachten van de gouverneur** (spion ophalen, schip stelen, stad
  veroveren) met rang en land als beloning.
- **Persoonlijke zoektocht naar een vermist familielid** (broer/zus/kind),
  die je in steden kunt vinden.
- Politieke verhoudingen die veranderen; je kunt onder een nieuwe natie
  dienen, gratie kopen, oorlog voeren.
- Schatjacht met kaarten en geruchten.
- Verouderen, huwelijk, pensioen met klassement.

## 3. Sid Meier's Pirates! (2004) — gameplay

Dezelfde basis, maar volledig 3D en met meer "richting":

- Volledig realtime 3D-wereld, dag/nacht, weer.
- Zeeslag 3D met schepen en kanonnen; enteren verkort tot een mini-duel.
- **Opdrachten en een verhaallijn**: beroemde piraten (Blackbeard enz.)
  verschijnen; er is een missie rond het vermiste familielid.
- **Scheepsverbeteringen**: je kunt schepen *uitrusten* (betere zeilen,
  snellere romp, krachtiger geschut), niet alleen kopen.
- **Dans-minigame** met de dochter van de gouverneur (in plaats van het
  tekstduel om haar gunst).
- **Mini-games** voor handel en speurwerk (herken de stad uit een schets).
- Meerdere "oeuvre"-doelen: als handelaar, kaper, patriot of piraat spelen.
- Zwakker economisch model dan Zeeroverij: veel vereenvoudigd tot minigames.

## 4. Vergelijking: wat mist Zeeroverij?

### Gameplay die het origineel had en hier nog ontbreekt

1. **Opdrachten van de gouverneur** — in Gold (en 2004) zijn er actieve missies
   met doel en beloning. Zeeroverij heeft alleen *geruchten* ("pas op voor
   piraten"). Dit is de grootste leemte: het spel heeft geen richting.
2. **Vermist familielid / persoonlijk doel** — de "lange lijn" in het origineel
   bestaat uit meer dan roem+jaren: een naam die je door de Caraïben jaagt.
3. **Losgeld / ruilen van gevangenen** — na een zeeslag met een marine- of
   admiraalsschip is er geen keuze om een officier los te laten voor geld of
   een gevangene van je eigen land terug te krijgen.
4. **Politiek tussen naties** — relaties zijn statisch geprikt (vijandigheid
   vanaf niveau -25). Er is geen oorlog/vrede die *automatisch* verschuift en
   je keuzes dwingt.
5. **Meerdere schepen in de zeeslag** — je bijschepen varen alleen cosmetisch
   in kielzog mee ([`sail.js`](js/sail.js:252)); het gevecht is altijd 1-tegen-1.
   In het origineel kon een vlootgevecht meer dan twee schepen bevatten.
6. **Willekeurige zeegebeurtenissen** — het origineel had storm, wrakken,
   Indiaanse handelsposten, boot in nood, vreemdelingen. Hier: alleen
   ontmoetingen met vloten.
7. **Scheepsuitrusting (upgrades)** — uit 2004: naast kanonnen ook betere
   zeilen/romp kopen. Zeeroverij heeft alleen kanonnen toevoegen en schepen
   kopen ([`town.js`](js/town.js:678)).

### Wat bewust NIET overnemen

- 3D-rendering, echte personagemodellen, voice-over, cutscenes (2004).
- Dans-minigame en handels-minigames (2004) — die passen niet bij een
  tekst+canvas-remake en kosten veel werk voor weinig winst.

---

## 5. Grafische ontwikkeling: Gold (1993) → 2004

### Wat Gold (1993) verbeterde t.o.v. 1987

- 256-kleuren-VGA i.p.v. 16 kleuren (EGA/C64) → zachte kleurverlopen op zee.
- **Geïllustreerde karakterportretten** (kroegbaas, gouverneur, dochter) met
  dialoogschermen → heel veel sfeer per pixel.
- Rijkere scheepssprites, geanimeerde kustlijnen, getekende stadsscènes.
- Omgevingsmuziek.

### Wat 2004 toevoegde

- Volledig 3D, dag/nachtsyclus, dynamisch weer.
- Personagemodellen met animaties en cinematische camerahoeken.
- Levendige zee met golven, schuim, branding op de kust.

### Wat hiervan de moeite waard is mét simpele graphics

De 2004-game ging vooral om *toon* en *leesbaarheid*, niet om detail op zich.
Dat is zonder 3D te halen:

1. **Portretten per natie en rol** (Gold won hier zijn sfeer). Zeeroverij heeft
   al gestileerde SVG-figuren (`UI.maakFiguur` in [`ui.js`](js/ui.js:145));
   uitbreiden naar unieke figuurtjes per natie en kleine animatie is de hoogste
   rendement-pixel die er is.
2. **Zichtbare schade op de schepen** — in de zeeslag staat nu álles in de
   balkjes ([`battle.js`](js/battle.js:846)). In het origineel zag je het schip
   zelf: gekantelde mast, gescheurde zeilen, rook. Koppel de tekenlaag aan
   `tuigage`, `romp` en `brand` (rook bestaat al); dat is goedkoop en maakt de
   slag ineens leesbaar.
3. **Dag/nacht-schemering over de zee** — 2004 had daglicht als grote sfeermaker.
   Eenvoudig: de zee- en luchtsgradient in [`tekenZee`](js/render.js:106) laten
   meelopen met de speeldatum/tijd. Geen assets nodig.
4. **Weer bij harde wind** — Zeeroverij heeft al de deining die met de wind
   meebeweegt ([`tekenZee`](js/render.js:116)); een schemering + zwaardere
   golfslag + regenpartikels bij hoge `windKracht` geven storm-gevoel.
5. **Havenprenten al goed** — de SVG-havenprent met per-stad rekwisieten
   ([`town.js`](js/town.js:156)) is precies de "getekende scène"-aanpak van Gold.
   Uitbreiden per natie is laaghangend fruit.

---

## 6. Concreet actieplan

### Gameplay (hoog rendement, laag werk)

| Prio | Feature | Herkomst | Werk |
|---|---|---|---|
| 1 | Opdrachten van de gouverneur (tekstmissies met beloning) | Gold/2004 | Klein: nieuwe dialoog in [`town.js`](js/town.js:819), hergebruikt bestaande systemen |
| 2 | Vermist familielid (naam die je in steden vindt) | Gold/2004 | Klein: gerucht dat per stad set, ene markering |
| 3 | Losgeld/ruilen van gevangen officieren | Gold | Klein: extra keuze in [`beloonOverwinning`](js/battle.js:614) |
| 4 | Zeegebeurtenissen (storm, wrak, handelspost, boot in nood) | Gold | Middel: dialoog + bestaande effecten |
| 5 | Politiek die verschuift (oorlog/vrede auto) | Gold | Middel: relatie-tik in [`vlotenTik`](js/world.js:429) |
| 6 | Scheepsuitrusting (upgrades) | 2004 | Klein: veld in [`data.js`](js/data.js:61) + werf-rij |
| 7 | Meerdere schepen in de zeeslag | Gold | Groot: architectuur [`battle.js`](js/battle.js:25) – alleen als latere fase |

### Graphics (simpel, canvas-proof)

| Prio | Feature | Herkomst | Werk |
|---|---|---|---|
| 1 | Zichtbare schade: zeilgaten + gekantelde mast bij `tuigage`, waterlijn bij `romp`, rook bij `brand` | Gold(2D) | Klein: parameters naar [`tekenSchip`](js/render.js:626) |
| 2 | Portretten uitbreiden (per natie/rol + animatie) | Gold | Klein-middel: [`maakFiguur`](js/ui.js:145) |
| 3 | Dag/nacht-schemering op zee en lucht | 2004 | Klein: gradient in [`tekenZee`](js/render.js:106) mee laten lopen |
| 4 | Storm: golfslag + regenpartikels bij harde wind | 2004 | Klein-middel: bestaande deeltjes-laag |
| 5 | Wapperen en bewoning: meeuwen, branding bij wind | 2004 | Klein |

### Bewust niet doen

- 3D, echte modellen, voice, cutscenes, dans-minigame, handels-minigames.
- Dit houdt de remaking zuiver 2D-vector/canvas, precies zoals het project
  nu al is opgezet ([`README.md`](README.md:3)).

---

## 7. Conclusie

De kern-loop van Zeeroverij is al sterker dan Gold op het punt van fysiek
zeegevecht en economie. De echte gaten zitten in **richting en verhaal**
(gouverneursopdrachten, vermist familielid) en in **leesbaarheid van het
gevecht** (zichtbare schade op het schip). De grafische les van Gold 1993 is
dat mensen-portretten en getekende scènes het meeste sfeer per pixel geven;
die van 2004 is dat daglicht, weer en zichtbare toestand het spel laten leven.
Beide zijn met de huidige canvas+SVG-opzet haalbaar zonder dure assets.

---

## 8. Uitvoering — wat is geïmplementeerd?

Alles uit het actieplan is doorgevoerd (met de dans-minigame bewust weggelaten):

### Gameplay

- **Gouverneursopdrachten** ([`town.js`](js/town.js:1051)): vier soorten — levering,
  koerierswerk, verovering en jacht. Aanvaarden bij de gouverneur ("Naar een
  opdracht vragen"), uitvoeren, rapporteren voor goud + specerijen + roem.
  - *lever*: de lading moet echt in het ruim zitten.
  - *spion*: pas rapporteren nadat er minstens 5 dagen verstreken zijn.
  - *verover*: de vlag moet zijn overgedragen (niet geplunderd).
  - *jacht*: een schip van de gevraagde natie verslaan ([`battle.js`](js/battle.js:628)).
- **Vermist familielid** ([`town.js`](js/town.js:1258), [`game.js`](js/game.js:212)):
  rol (vader/moeder/broer/zus) bij de start. Geruchten in de kroeg wijzen naar
  een stad; daar een knop "Naar uw … vragen" om te vinden. Status zichtbaar in
  het bemanningsscherm (C).
- **Losgeld/ruilen van gevangen officieren** ([`battle.js`](js/battle.js:639)):
  extra keuze na een zeeslag met een niet-piraten schip — losgeld voor een
  vreemde natie of ruil van gevangenen voor je eigen land.
- **Zeegebeurtenissen** ([`sail.js`](js/sail.js:325)): storm, wrak, handelspost,
  boot in nood (met piratenval), dolfijnen. Willekeurig op zee.
- **Politiek die verschuift** ([`world.js`](js/world.js:429)): relaties kruipen
  naar neutraal en af en toe verklaart de wereld oorlog/vrede tussen naties.
- **Scheepsuitrusting** ([`town.js`](js/town.js:719), [`data.js`](js/data.js:221)):
  zeilen/roer/romp verbeteren op de werf; telt mee in snelheid, wendbaarheid,
  gevecht en verkoopwaarde.

### Graphics (simpel, canvas-proof)

- **Zichtbare schade op schepen** ([`render.js`](js/render.js:626)): gescheurde
  zeilen en gekantelde masten bij lage `tuigage`, diepe waterlijn bij lage romp.
  Doorgegeven vanuit de zeeslag ([`battle.js`](js/battle.js:804)) en het varen.
- **Dag/nacht-schemering** ([`render.js`](js/render.js:109)): de zee-kleur en
  een goudoranje gloed op de kim lopen mee met de speeldatum (`schemerFactor`).
- **Storm en zeeleven** ([`render.js`](js/render.js:1157)): regen die met de
  wind meebuigt bij harde wind, plus cirkelende meeuwen boven het water.
  Zichtbaar in de zeil- en de zeeslag-scène.

### Bewust niet gedaan

- Dans-minigame en handels-minigames (2004), 3D, voice en cutscenes.

### Licentie

- De code staat onder de [GNU GPL v3](LICENSE): vrij te gebruiken en te wijzigen,
  maar afgeleide versies moeten ook open source en onder de GPL blijven. Zo kan
  niemand een gesloten, betaalde kloon van dit eerbetoon maken zonder de bron
  vrij te geven.
