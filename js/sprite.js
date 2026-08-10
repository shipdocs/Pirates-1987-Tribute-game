// Eén bakkerij voor alles wat niet elk beeld opnieuw getekend hoeft te worden.
//
// Het spel tekende zijn vaste onderdelen tot nu toe op drie plekken met de hand
// in een cache: de romp, de deegwolk en de windwolk. Drie keer hetzelfde
// patroon, drie keer een eigen sleutel en een eigen limiet. Hier staat het één
// keer, zodat er ook een vierde en vijfde klant bij kan — steden, de windroos —
// zonder dat het weer overgeschreven wordt.
//
// De bakkerij gaat over het *wereldeenheden*-patroon: een tekening met een
// vaste maat in wereldeenheden, die op de resolutie van het scherm wordt
// uitgebakken en daarna op ware grootte wordt neergezet. De deegwolken van een
// storm horen daar niet bij — dat is het andere patroon, één sprite die bij het
// tekenen vrij wordt opgeschaald — en die blijven dus waar ze zijn.

/** Een leeg canvas van w × h apparaatpixels. */
export function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Resolutiebanden. We kiezen altijd de eerste band die fijn genoeg is, dus we
// vergroten nooit en verkleinen hooguit anderhalf keer — geen wazige en geen
// gerafelde sprites, of je nu uitgezoomd over de kaart kijkt of er bovenop zit.
export const BANDEN = [1, 1.5, 2, 3, 4, 6, 8];

/** De eerste band die minstens zo fijn is als de gevraagde dichtheid. */
export function bandVoor(dichtheid, banden = BANDEN) {
  for (const b of banden) if (b >= dichtheid) return b;
  return banden[banden.length - 1];
}

/**
 * Maakt een bakkerij met een eigen cache.
 *
 * De begroting staat in **pixels, niet in aantallen**. Een aantal zegt niets
 * over wat een cache kost: dezelfde stad meet 67 pixels in het kaartoverzicht
 * en 532 op de hoogste zoomstand, een verschil van vijfenzestig keer zoveel
 * geheugen. Een cache van vierentwintig steden is op de speelstand royaal en op
 * het kaartoverzicht — waar alle vijfendertig havens tegelijk in beeld staan —
 * precies te klein, met als gevolg dat hij élk beeld leegliep en alles opnieuw
 * werd gebakken. Dat is de slechtst denkbare uitkomst: alle kosten van het
 * bakken, geen van de baten.
 *
 * Bij overschrijding gaat de langst ongebruikte eruit, niet de hele cache. Een
 * cache die in één klap leegloopt, laat het beeld daarna schokken terwijl alles
 * opnieuw gebakken wordt.
 */
export function maakBakkerij(naam, maxPixels = 1.2e6) {
  const cache = new Map();
  let pixels = 0;

  return {
    naam,

    /**
     * Haalt een gebakken sprite op, of bakt hem als hij er nog niet is.
     *
     * `halfB`/`halfH` zijn de halve breedte en hoogte in wereldeenheden, gemeten
     * vanaf het middelpunt van de tekening — ruim genoeg nemen, want wat buiten
     * het vak valt wordt afgesneden. `teken(g)` krijgt een context waarin (0,0)
     * het middelpunt is en één eenheid één wereldeenheid: dezelfde ruimte
     * waarin je hem anders rechtstreeks op het scherm zou zetten.
     */
    haal(sleutel, halfB, halfH, band, teken) {
      const volleSleutel = `${sleutel}|${band}`;
      let sp = cache.get(volleSleutel);
      if (sp) {
        // Opnieuw achteraan zetten: een Map bewaart invoegvolgorde, dus dit is
        // alles wat er nodig is om 'langst ongebruikt' te weten.
        cache.delete(volleSleutel);
        cache.set(volleSleutel, sp);
        return sp;
      }

      const w = Math.max(1, Math.ceil(halfB * 2 * band));
      const h = Math.max(1, Math.ceil(halfH * 2 * band));
      const c = offscreen(w, h);
      const g = c.getContext('2d');
      // Alleen `lineJoin`: elke andere stand blijft op de standaardwaarde, zodat
      // een tekening die naar de bakkerij verhuist er precies hetzelfde uitziet
      // als toen hij nog rechtstreeks op het scherm ging. Wie ronde uiteinden
      // wil, zet `lineCap` zelf in zijn tekenfunctie.
      g.setTransform(band, 0, 0, band, halfB * band, halfH * band);
      g.lineJoin = 'round';
      teken(g);

      sp = { canvas: c, ox: -halfB, oy: -halfH, w: halfB * 2, h: halfH * 2 };
      cache.set(volleSleutel, sp);
      pixels += w * h;
      // Nooit de laatste weggooien: wat we net gebakken hebben, gaan we tekenen.
      while (pixels > maxPixels && cache.size > 1) {
        const oudste = cache.keys().next().value;
        const weg = cache.get(oudste);
        pixels -= weg.canvas.width * weg.canvas.height;
        cache.delete(oudste);
      }
      return sp;
    },

    /** Aantal sprites en hun gezamenlijke pixels — voor metingen en de console. */
    stand() {
      return { aantal: cache.size, pixels };
    },

    leeg() {
      cache.clear();
      pixels = 0;
    },
  };
}

/**
 * Zet een gebakken sprite neer met zijn middelpunt op de oorsprong van de
 * huidige transform. Wie hem elders wil hebben, verschuift eerst de context.
 */
export function plaats(ctx, sprite) {
  ctx.drawImage(sprite.canvas, sprite.ox, sprite.oy, sprite.w, sprite.h);
}
