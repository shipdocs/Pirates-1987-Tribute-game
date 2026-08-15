// Tests voor Kapersnest- & Investeringsmechaniek
import '../test-support/browserglobals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { Wereld, WORLD_W, WORLD_H } from '../js/world.js';
import { Game, laad, bewaar, maakSpeler } from '../js/game.js';
import { werkWereldTijd } from '../js/anker.js';
import { maakZeilScene } from '../js/sail.js';
import { toonKapersnest } from '../js/zeil-schermen.js';
import { investeer } from '../js/town/gouverneur.js';
import * as UI from '../js/ui.js';

function nieuweTestSpeler() {
  return maakSpeler({
    naam: 'Jan van Gent',
    natie: 'nederland',
    talent: 'stuurmanskunst',
    moeilijkheid: 'bootsgezel',
  });
}

test('Wereld genereert een deterministisch Kapersnest', () => {
  const w1 = new Wereld(12345);
  const w2 = new Wereld(12345);

  assert.ok(w1.kapersnest, 'Kapersnest moet bestaan op de wereld');
  assert.equal(w1.kapersnest.naam, 'Kapersbaai');
  assert.equal(w1.kapersnest.x, w2.kapersnest.x);
  assert.equal(w1.kapersnest.y, w2.kapersnest.y);
});

test('Kapersnest ligt voor uiteenlopende zaden bevaarbaar en buiten havens', () => {
  for (let seed = 0; seed < 64; seed++) {
    const wereld = new Wereld(seed);
    const nest = wereld.kapersnest;
    assert.equal(wereld.isVaren(nest.x, nest.y, 'sloep'), true, `zaad ${seed}`);
    assert.equal(wereld.stadOp(nest.x, nest.y, 100), null, `zaad ${seed}`);
  }
});

test('Kapersnest bedient de echte kist, herstelt de vloot en vertrekt bij sluiten', () => {
  UI.sluitAlles();
  const w = new Wereld(55555);
  const speler = nieuweTestSpeler();
  speler.goud = 10000;
  speler.schepen[0].romp = 10;

  Game.wereld = w;
  Game.speler = speler;

  let vertrokken = 0;
  const scherm = toonKapersnest(() => { vertrokken += 1; });
  assert.equal(UI.ietsOpen(), true);

  scherm.voet.children[0].click();
  assert.equal(speler.goud, 5000);
  assert.equal(speler.kapersnest.goud, 5000);

  scherm.voet.children[1].click();
  assert.equal(speler.goud, 10000);
  assert.equal(speler.kapersnest.goud, 0);

  scherm.voet.children[2].click();
  assert.equal(speler.schepen[0].romp, speler.schepen[0].maxRomp);
  assert.match(scherm.body.children[2].innerHTML, /Vlootconditie<\/span><b>100%/);

  scherm.voet.children[3].click();
  assert.equal(UI.ietsOpen(), false);
  assert.equal(vertrokken, 1);

  speler.kapersnest.goud = 2500;
  bewaar();
  const geladen = laad();
  assert.equal(geladen.speler.kapersnest.goud, 2500);
});

test('Gouverneur koopt via de echte actie een aandeel', async () => {
  const speler = nieuweTestSpeler();
  speler.goud = 6000;
  Game.speler = speler;
  let ververst = 0;

  await investeer({ id: 3, naam: 'Testhaven' }, { ververs: () => { ververst += 1; } });

  assert.equal(speler.goud, 1000);
  assert.equal(speler.investeringen[3], 1);
  assert.equal(ververst, 1);
});

test('Dividend is onafhankelijk van de grootte van tijdstappen', () => {
  const klein = nieuweTestSpeler();
  const groot = nieuweTestSpeler();
  klein.investeringen = { 0: 1 };
  groot.investeringen = { 0: 1 };
  const wKlein = new Wereld(777);
  const wGroot = new Wereld(777);

  for (let i = 0; i < 1000; i++) wKlein.economieTik(0.001, klein);
  wGroot.economieTik(1, groot);

  assert.equal(klein.gespaard, 12);
  assert.equal(klein.gespaard, groot.gespaard);
  assert.ok(klein.dividendRest < 1e-8);
});

test('Ankertijd geeft de speler door aan de dividendberekening', () => {
  const w = new Wereld(778);
  const speler = nieuweTestSpeler();
  speler.investeringen = { 0: 2 };

  Game.wereld = w;
  Game.speler = speler;
  w.relatieTik = () => {};
  w.vlotenTik = () => {};

  werkWereldTijd(1, 0);

  assert.equal(speler.gespaard, 24);
});

test('Zeiltijd geeft de speler door aan de dividendberekening', () => {
  UI.sluitAlles();
  const w = new Wereld(779);
  const speler = nieuweTestSpeler();
  speler.investeringen = { 0: 1 };
  speler.schepen[0].zeilen = 0;
  w.vloten = [];
  w.vlotenTik = () => {};

  let veiligePlek = null;
  for (let y = 400; y < WORLD_H - 400 && !veiligePlek; y += 400) {
    for (let x = 400; x < WORLD_W - 400; x += 400) {
      const verVanSteden = w.steden.every((stad) => Math.hypot(x - stad.x, y - stad.y) > 400);
      const verVanNest = Math.hypot(x - w.kapersnest.x, y - w.kapersnest.y) > 200;
      if (verVanSteden && verVanNest && w.isVaren(x, y, 'sloep')) {
        veiligePlek = [x, y];
        break;
      }
    }
  }
  assert.ok(veiligePlek, 'Er moet open vaarwater voor de integratietest bestaan');
  [speler.x, speler.y] = veiligePlek;

  Game.wereld = w;
  Game.speler = speler;
  Game.breedte = 1280;
  Game.hoogte = 800;
  const scene = maakZeilScene();
  for (let i = 0; i < 455; i++) scene.werkBij(0.05);

  assert.equal(speler.gespaard, 12);
  assert.ok(speler.dividendRest > 0 && speler.dividendRest < 0.02);
});
