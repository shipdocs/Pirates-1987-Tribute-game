// Tests voor js/game.js (opslag, laden, migraties & erelijst)
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { Game, bewaar, laad, OPSLAG_SLEUTEL, leesErelijst, bewaarInErelijst } from '../js/game.js';
import { Wereld } from '../js/world.js';

test('bewaar en laad herstellen speler- en wereldtoestand', () => {
  localStorage.clear();
  const seed = 987654;
  const wereld = new Wereld(seed);
  const speler = {
    naam: 'Kapitein Test',
    natie: 'nederland',
    x: 1000,
    y: 1000,
    goud: 5000,
    gespaard: 1200,
    roem: 350,
    scheepsvolk: 45,
    geest: 80,
    dag: 120,
    startLeeftijd: 20,
    leeftijd: 20.3,
    schepen: [{ type: 'sloep', romp: 100, geschut: 8, upgrades: { zeilen: 1 } }],
    relatie: { nederland: 50, engeland: 0, frankrijk: -20, spanje: -60 },
  };

  Game.wereld = wereld;
  Game.speler = speler;

  const bewaard = bewaar();
  assert.equal(bewaard, true, 'bewaar() moet true retourneren bij succes');

  const geladen = laad();
  assert.ok(geladen !== null, 'Laden mag niet null retourneren');
  assert.equal(geladen.speler.naam, 'Kapitein Test');
  assert.equal(geladen.speler.goud, 5000);
  assert.equal(geladen.speler.scheepsvolk, 45);
  assert.equal(geladen.speler.geest, 80);
  assert.equal(geladen.wereld.seed, seed);
});

test('laad migreert v8 saves naar v9 formaat', () => {
  localStorage.clear();
  const oudeSave = {
    versie: 8,
    seed: 12345,
    steden: [],
    speler: {
      naam: 'Oude Zeerob',
      bemanning: 60, // Oud veld
      moraal: 85, // Oud veld
      talent: 'kanonnier', // Oud veld
      moeilijkheid: 'zwaardvechter', // Oud veld
      items: ['koperhuid'], // Oud veld
      schepen: [{ type: 'fregat', kanonnen: 18 }], // Oud veld kanonnen
    },
  };
  localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(oudeSave));

  const geladen = laad();
  assert.ok(geladen !== null);
  assert.equal(geladen.speler.scheepsvolk, 60, 'bemanning moet gemigreerd worden naar scheepsvolk');
  assert.equal(geladen.speler.geest, 85, 'moraal moet gemigreerd worden naar geest');
  assert.equal(geladen.speler.talent, 'opperkonstabel', 'kanonnier moet gemigreerd worden naar opperkonstabel');
  assert.equal(geladen.speler.moeilijkheid, 'bevaren_kapitein');
  assert.equal(geladen.speler.items[0], 'gekalktehuid');
  assert.equal(geladen.speler.schepen[0].geschut, 18);
});

test('erelijst bewaart en sorteert topscores', () => {
  localStorage.clear();
  const speler = {
    naam: 'Piet Hein',
    natie: 'nederland',
    roem: 1200,
    gespaard: 50000,
    leeftijd: 35,
    startLeeftijd: 20,
    moeilijkheid: 'oude_zeerob',
    dag: 1500,
  };

  const rang = bewaarInErelijst(speler, 8500, { naam: 'Willemstad' });
  assert.equal(rang, 0, 'Eerste topscore moet op rang 0 komen');

  const lijst = leesErelijst();
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0].naam, 'Piet Hein');
  assert.equal(lijst[0].score, 8500);
});
