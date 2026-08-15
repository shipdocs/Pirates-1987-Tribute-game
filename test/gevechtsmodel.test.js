// Tests voor js/gevechtsmodel.js (headless gevechtsmodel)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MUNITIE,
  salvoStukken,
  spreiding,
  schootsafstand,
  voorhoudpunt,
  salvoRichting,
  inSchootsveld,
  raaktRomp,
  herlaadTijd,
  schadePerTreffer,
  geschutVerlies,
  strijdlust,
  geeftOp,
  ENTERAFSTAND,
  OVERGAVE_AFSTAND,
} from '../js/gevechtsmodel.js';

import { SCHIP_INDEX } from '../js/data.js';

test('salvoStukken berekent de helft van het geschut geklemd tot 14', () => {
  assert.equal(salvoStukken(0), 0);
  assert.equal(salvoStukken(8), 4);
  assert.equal(salvoStukken(16), 8);
  assert.equal(salvoStukken(32), 14); // Max 14 per boord
});

test('spreiding groeit met het aantal stukken geschut', () => {
  assert.equal(spreiding(0), 0.055);
  assert.ok(spreiding(8) > spreiding(4));
});

test('schootsafstand verschilt per munitiesoort', () => {
  const type = SCHIP_INDEX.sloep;
  const rond = MUNITIE.find((m) => m.id === 'rond');
  const ketting = MUNITIE.find((m) => m.id === 'ketting');
  const schroot = MUNITIE.find((m) => m.id === 'schroot');

  const afstRond = schootsafstand(type, rond);
  const afstKetting = schootsafstand(type, ketting);
  const afstSchroot = schootsafstand(type, schroot);

  assert.ok(afstRond > afstKetting, 'Rondkogel draagt verder dan kettingkogel');
  assert.ok(afstKetting > afstSchroot, 'Kettingkogel draagt verder dan schroot');
});

test('voorhoudpunt berekent een toekomstige positie op basis van koers en snelheid', () => {
  const schutter = { x: 0, y: 0 };
  const doel = { x: 200, y: 0, koers: 0, snelheid: 50 };
  const resultaat = voorhoudpunt(schutter.x, schutter.y, doel, 265);

  assert.ok(resultaat.x > doel.x, 'Voorhoudpunt moet vooruit liggen op het doel');
  assert.ok(resultaat.t > 0, 'Vliegtijd moet positief zijn');
});

test('inSchootsveld detecteert of een doel dwars op het boord ligt', () => {
  const schutter = { x: 0, y: 0, koers: 0 }; // Wijst naar het oosten
  const doelNoord = { x: 0, y: 100 }; // Ligt loodrecht op stuurboord
  const doelOost = { x: 100, y: 0 }; // Ligt recht voor de boeg

  const resNoord = inSchootsveld(schutter, doelNoord);
  const resOost = inSchootsveld(schutter, doelOost);

  assert.equal(resNoord.binnen, true, 'Doel aan stuurboord moet in schootsveld zijn');
  assert.equal(resOost.binnen, false, 'Doel voor de boeg is niet in dwars schootsveld');
});

test('raaktRomp controleert ellipsbotsing rond schip', () => {
  const schip = { x: 100, y: 100, koers: 0 };
  assert.equal(raaktRomp(100, 100, schip, 30, 10), true, 'Centrum van schip is raak');
  assert.equal(raaktRomp(200, 200, schip, 30, 10), false, 'Punt ver buiten schip is mis');
});

test('herlaadTijd vertraagt bij uitgedund scheepsvolk', () => {
  const type = SCHIP_INDEX.fregat;
  const volTijd = herlaadTijd(type, 1.0, 0); // 100% volk
  const halfTijd = herlaadTijd(type, 0.3, 0); // 30% volk

  assert.ok(halfTijd > volTijd, 'Herladen moet langer duren met minder bemanning');
});

test('strijdlust en geeftOp bepalen overgave', () => {
  const onbeschadigd = {
    romp: 100, maxRomp: 100,
    scheepsvolk: 50, startScheepsvolk: 50,
    geschut: 12, startGeschut: 12,
  };
  assert.equal(strijdlust(onbeschadigd), 100);
  assert.equal(geeftOp(onbeschadigd, 100), false);

  const ontwapend = {
    romp: 80, maxRomp: 100,
    scheepsvolk: 30, startScheepsvolk: 50,
    geschut: 0, startGeschut: 12,
  };
  assert.equal(geeftOp(ontwapend, OVERGAVE_AFSTAND - 10), true, 'Ontwapend schip strijkt de vlag langszij');
  assert.equal(geeftOp(ontwapend, OVERGAVE_AFSTAND + 50), false, 'Ontwapend schip geeft niet op op grote afstand');
});
