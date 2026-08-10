# Plan: bezigheden voor anker

*Ontwerp voor betekenisvolle tijdsbesteding op de wereldkaart, voortbouwend op
het bestaande ankerscherm in [`js/anker.js`](js/anker.js).*

## Doel

Voor anker gaan is geen pauzeknop, maar een keuze om tijd en proviand in te
ruilen voor herstel, rust, informatie of een tactisch voordeel. Daardoor krijgt
de grote wereldkaart betekenis buiten het varen van haven naar haven: de plek
waar de kapitein het anker laat vallen en wat hij daar doet, kunnen verschil
maken.

Dit plan voegt **geen aparte bezigheden onder zeil** toe. Varen, kruisen tegen de
wind, een doel achtervolgen en onderweg ontmoetingen krijgen zijn de normale
toestand van het spel en hoeven niet als tijdelijke actie boven op het varen te
worden gezet.

## Bestaande basis

Het ankerscherm kent al vier bezigheden:

| Bezigheid | Tijd | Huidig gevolg |
|---|---:|---|
| De kuil schrobben | 0,5 etmaal | Herstelt een beetje geest |
| De kooi induiken | 2 etmalen | Herstelt veel geest |
| Het want opkalefateren | 1,5 etmaal | Herstelt geest en een deel van de romp |
| Op stroom liggen en loeren | 1 etmaal | Laat een beladen koopvaarder in de omgeving verschijnen |

Alle bezigheden gebruiken proviand naar rato van de verstreken tijd en de
grootte van het scheepsvolk. Bij gebrek aan proviand lijdt de geest eronder. De
speler kan meerdere bezigheden na elkaar uitvoeren voordat hij het anker licht.

## Ontwerprichtingen

### Opkalefateren

Opkalefateren blijft de keuze om tijd te ruilen voor zeewaardigheid. De duur mag
uiteindelijk afhangen van de schade: lichte schade is in ongeveer één etmaal te
verhelpen, een zwaar gehavend schip kan twee tot drie etmalen kosten. Het herstel
hoeft niet gelijk te staan aan een volledige werfbeurt; de werf behoudt daarmee
waarde voor grondig herstel.

Op open of onrustig water kan kalefateren minder doelmatig of riskanter zijn dan
in de lij van een eiland, een baai of een haven. Dat maakt de ankerplaats later
onderdeel van de keuze zonder nu al een nieuw vaarsysteem te introduceren.

### Op stroom liggen en loeren

Dit is de historische en sfeervolle vorm van **in hinderlaag liggen**. De actie
kost tijd en proviand en moet geen gratis buitknop worden. Het voordeel kan uit
twee delen bestaan:

- een grotere kans dat een geschikte prooi in de omgeving wordt ontdekt;
- een kans op een verrassingsaanval wanneer de kapitein die prooi tijdig
  onderschept.

De opbrengst hoort van de plek af te hangen. Bij een havenmond, kaap, nauwe
doorgang of druk vaarwater is de kans op een koopvaarder groter dan midden op
de oceaan. Daar staat tegenover dat ook een marinepatrouille of sterkere prooi
kan opduiken. Soms gebeurt er niets en zijn alleen tijd en proviand verloren.

De bestaande naam **Op stroom liggen en loeren** blijft geschikt. Het woord
**kruisen** wordt hiervoor niet gebruikt, omdat het spel dat al gebruikt voor
laveren tegen de wind.

### Rust en onderhoud

De kuil schrobben en de kooi induiken blijven de veilige, voorspelbare
bezigheden. Ze geven de speler een manier om geest te herstellen zonder een
haven binnen te lopen, maar kosten kalenderdagen en rantsoenen. Daardoor zijn
ze nuttig zonder gratis te zijn en vormen ze een rustige tegenhanger van het
risicovollere loeren.

## Tijd moet overal verstrijken

Een ankerbezigheid mag niet alleen de datum en de proviand aanpassen terwijl de
rest van de wereld stilstaat. De verstreken tijd moet via één gedeelde route de
relevante systemen bijwerken:

- datum en leeftijd;
- proviand en geest;
- economie en politieke verhoudingen;
- wereldvloten en aflopende toestanden;
- overige dagelijkse gevolgen die tijdens gewoon varen ook gelden.

De precieze simulatie hoeft niet beeld voor beeld te worden afgespeeld, maar het
resultaat moet overeenkomen met een wereld waarin werkelijk één of meer etmalen
zijn verstreken. Een centrale helper voor tijdsverloop voorkomt dat iedere
ankerbezigheid een onvolledige eigen versie hiervan krijgt.

## Ankerscherm en terugkoppeling

Het ankerscherm is een modaal scherm en blijft na een gekozen bezigheid bewust
open. De speler moet de bijgewerkte datum en toestand kunnen bekijken, eventueel
nog een bezigheid kiezen en zelf afsluiten met **Anker lichten**.

Daar zit in de huidige uitvoering een zichtbaarheidsfout: de bezigheid roept
`Game.melding()` aan, maar die melding wordt op het canvas getekend. Het modale
DOM-scherm blijft ervoor staan, waardoor de bevestiging en soms zelfs de
uitkomst van de actie achter het perkament verschijnt en voor de speler
onzichtbaar is.

De oplossing is niet om het ankerscherm na iedere keuze te sluiten. In plaats
daarvan krijgt het scherm een eigen resultaatregel of berichtvak:

- na iedere bezigheid verschijnt de uitkomst in het ankerscherm zelf;
- datum, reflectie, romp, geest en proviand worden meteen ververst;
- het bericht blijft zichtbaar tot de volgende keuze of tot het anker wordt
  gelicht;
- ook de uitkomst van loeren -- prooi, gevaar of niets gezien -- verschijnt
  daar;
- belangrijke informatie mag niet uitsluitend in een verborgen canvasmelding
  staan;
- na **Anker lichten** is een gewone `Game.melding()` wel zichtbaar en dus
  geschikt voor de vertrekbevestiging.

Het berichtvak kan als live status worden gemarkeerd (`aria-live="polite"`),
zodat dezelfde terugkoppeling ook zonder alleen op visuele verandering te
vertrouwen beschikbaar is.

## Gewenste spelstroom

1. De speler laat het anker vallen en opent het ankerscherm.
2. Het scherm toont datum, verstreken tijd, toestand en de beschikbare
   bezigheden met hun tijdskosten.
3. De speler kiest een bezigheid.
4. De volledige wereldtijd verstrijkt en kosten, opbrengst en risico worden
   afgehandeld.
5. De concrete uitkomst verschijnt bovenop het nog geopende ankerscherm; alle
   getoonde waarden worden ververst.
6. De speler kiest nog een bezigheid of licht het anker.

## Afbakening

- Geen los menu met bezigheden onder zeil.
- Geen hernoeming van het bestaande zeilbegrip *kruisen*.
- Geen gegarandeerde winst door herhaaldelijk te loeren.
- Geen automatische sluiting van het ankerscherm na een bezigheid.
- Geen essentiële terugkoppeling via een melding die achter de modal staat.

## Acceptatiecriteria voor uitvoering

- Iedere ankerbezigheid toont kosten en uitkomst terwijl het ankerscherm open
  blijft.
- De speler kan meerdere bezigheden achter elkaar uitvoeren en daarna zelf het
  anker lichten.
- Datum, leeftijd, proviand, geest en scheepstoestand kloppen na iedere keuze.
- Andere tijdsafhankelijke wereldsystemen zijn niet stilgezet tijdens de
  verstreken ankertijd.
- Loeren kan voordeel, gevaar of geen ontmoeting opleveren en communiceert die
  uitkomst in het scherm.
- Er verschijnt geen noodzakelijke toast onzichtbaar achter de modal.
- Gewoon varen blijft de standaardactiviteit onder zeil en krijgt geen extra
  actielaag.
