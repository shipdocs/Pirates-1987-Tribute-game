// © 2026 Martin Splinter (Bargeflow / Shipdocs). Proprietair — alle rechten
// voorbehouden. Proprietary — all rights reserved. Zie/see LICENSE.

// Doorgeefmodule: het tekenwerk staat in js/render/*.js, hier komen alle
// publieke namen bij elkaar zodat verbruikers `import * as R from './render.js'`
// ongewijzigd kunnen blijven gebruiken. De oorspronkelijke monolithische
// render.js is opgesplitst in js/render/ (zee, land, schepen, steden, weer,
// HUD, zeekaart, effecten en schatjacht).
export * from './render/hulpjes.js';
export * from './render/patronen.js';
export * from './render/zee.js';
export * from './render/land.js';
export * from './render/schepen.js';
export * from './render/steden.js';
export * from './render/weer.js';
export * from './render/effecten.js';
export * from './render/zeekaart.js';
export * from './render/hud.js';
export * from './render/schatjacht.js';
