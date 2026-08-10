// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Doorgeefmodule: alles wat er in een haven gebeurt (handel, kroeg, werf,
// gouverneur en plundering) staat in js/town/*.js; hier komen de publieke
// namen bij elkaar zodat verbruikers `import { openHaven, ... } from './town.js'`
// ongewijzigd kunnen blijven gebruiken.
export * from './town/haven.js';
export * from './town/kroeg.js';
export * from './town/handel.js';
export * from './town/werf.js';
export * from './town/gouverneur.js';
export * from './town/opdrachten.js';
export * from './town/bestorming.js';
export * from './town/familie.js';
export * from './town/aftreden.js';
export * from './town/relatie.js';
