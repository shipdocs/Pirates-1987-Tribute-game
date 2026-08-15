// Tests voor tactische wind- en weerdynamiek
import '../test-support/browserglobals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { zeilEfficiëntie } from '../js/world.js';
import { spreiding, spreidingMetWind } from '../js/gevechtsmodel.js';

test('Windvlagen en stormkracht vergroten kanonsspreiding', () => {
  const basisSpreiding = spreiding(10);
  const stormSpreiding = spreidingMetWind(10, 1.4);

  assert.ok(stormSpreiding > basisSpreiding, 'Kanonsspreiding moet toenemen bij storm');
  assert.equal(Math.round(stormSpreiding * 1000), Math.round(basisSpreiding * 1.2 * 1000));
});

test('Zeilefficiëntie rekening houdend met tactische luwte en dode hoek', () => {
  const hoekWind = 0; // Oostenwind
  const schipKoersInDodeHoek = Math.PI - 0.1; // Tegenwind in dode hoek

  const effVoren = zeilEfficiëntie(schipKoersInDodeHoek, hoekWind, 0.7);
  const effRuim = zeilEfficiëntie(0.95, hoekWind, 0.7); // Ruime wind

  assert.ok(effVoren <= 0.3, 'Schip in de dode hoek moet sterk vertraagd worden (<= 0.3)');
  assert.ok(effRuim > 0.8, 'Schip voor de wind moet hoge efficiëntie hebben (> 0.8)');
});
