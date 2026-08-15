// Tests voor js/world.js (wereldschalen, deterministische RNG, steden & economie)
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { Wereld, zeilEfficiëntie, dodeHoek } from '../js/world.js';

test('Wereld is deterministisch op basis van zaad (seed)', () => {
  const seed = 123456789;
  const w1 = new Wereld(seed);
  const w2 = new Wereld(seed);

  assert.equal(w1.seed, w2.seed);
  assert.equal(w1.steden.length, w2.steden.length);

  for (let i = 0; i < w1.steden.length; i++) {
    assert.equal(w1.steden[i].id, w2.steden[i].id);
    assert.equal(w1.steden[i].x, w2.steden[i].x);
    assert.equal(w1.steden[i].natie, w2.steden[i].natie);
  }
});

test('dodeHoek en zeilEfficiëntie berekenen wind-rendement', () => {
  const sloepHoogte = 0.52; // Sloep kan hoger aan de wind liggen (hoogte stat = 0.52)
  const galjoenHoogte = 0.28; // Galjoen ligt minder hoog aan de wind (hoogte stat = 0.28)

  const dodeSloep = dodeHoek(sloepHoogte);
  const dodeGaljoen = dodeHoek(galjoenHoogte);

  assert.ok(dodeSloep < dodeGaljoen, 'Sloep (hogere hoogte-stat) moet een kleinere dode hoek hebben dan galjoen');

  // Efficiëntie testen: ruime wind vs hoog aan de wind vs dode hoek
  const windRichting = Math.PI; // Wind komt uit het westen (waait naar het oosten)
  const koersRuim = Math.PI + 0.8; // Ruime wind
  const koersDood = 0; // Pal tegen de wind in (hoofd in de wind)

  const effRuim = zeilEfficiëntie(koersRuim, windRichting, sloepHoogte);
  const effDood = zeilEfficiëntie(koersDood, windRichting, sloepHoogte);

  assert.ok(effRuim > 0.8, 'Ruime wind moet een hoge efficiëntie geven');
  assert.ok(effDood < 0.2, 'In de dode hoek moet de efficiëntie minimaal zijn');
});

test('economieTik update goederenprijzen en garnizoenen', () => {
  const w = new Wereld(42);
  const stad = w.steden[0];
  const oudePrijzen = [...stad.prijzen];

  w.economieTik(10); // 10 dagen verstrijken

  assert.equal(stad.prijzen.length, oudePrijzen.length);
  assert.ok(stad.garnizoen > 0, 'Stad moet een positief garnizoen behouden');
});
