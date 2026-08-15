// Tests voor Kapersnest- & Investeringsmechaniek
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { Wereld } from '../js/world.js';
import { Game, laad, bewaar } from '../js/game.js';
import { WAREN } from '../js/data.js';

test('Wereld genereert een deterministisch Kapersnest', () => {
  const w1 = new Wereld(12345);
  const w2 = new Wereld(12345);

  assert.ok(w1.kapersnest, 'Kapersnest moet bestaan op de wereld');
  assert.equal(w1.kapersnest.naam, 'Kapersbaai');
  assert.equal(w1.kapersnest.x, w2.kapersnest.x);
  assert.equal(w1.kapersnest.y, w2.kapersnest.y);
});

test('Speler kan goud storten en opnemen in de kaperskist', () => {
  const w = new Wereld(55555);
  const speler = {
    naam: 'Jan van Gent',
    goud: 10000,
    kapersnest: { goud: 0, vracht: new Array(WAREN.length).fill(0), schepen: [] },
    investeringen: {},
    schepen: [{ type: 'sloep' }],
  };

  Game.wereld = w;
  Game.speler = speler;

  // Stort 4000 goud
  speler.goud -= 4000;
  speler.kapersnest.goud += 4000;

  assert.equal(speler.goud, 6000);
  assert.equal(speler.kapersnest.goud, 4000);

  // Neem 1500 goud op
  speler.goud += 1500;
  speler.kapersnest.goud -= 1500;

  assert.equal(speler.goud, 7500);
  assert.equal(speler.kapersnest.goud, 2500);

  // Valideer opslag & herstel
  bewaar();
  const geladen = laad();
  assert.equal(geladen.speler.kapersnest.goud, 2500);
});

test('Plantage-investeringen genereren dividend in economieTik', () => {
  const w = new Wereld(777);
  const speler = {
    naam: 'Investeerder Piet',
    goud: 2000,
    gespaard: 0,
    investeringen: { 0: 2 }, // 2 aandelen in stad 0
    kapersnest: { goud: 0, vracht: [], schepen: [] },
  };

  Game.wereld = w;
  Game.speler = speler;

  w.economieTik(30, speler); // 30 dagen verstrijken

  assert.ok(speler.gespaard > 0, 'Investeringen moeten dividend opleveren in gespaard goud');
});
