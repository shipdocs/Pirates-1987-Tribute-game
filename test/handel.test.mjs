// Tests voor de prijsvorming van de koopman (js/town/handel.js).
import './../test-support/browserglobals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { koopKosten, verkoopOpbrengst, prijsNa } = await import('../js/town/handel.js');

test('kopen en meteen terugverkopen levert nooit winst op', () => {
  for (const prijs of [12, 49, 118, 297, 382]) {
    for (const n of [1, 10, 30, 100, 200]) {
      const kosten = koopKosten(prijs, n);
      const opbrengst = verkoopOpbrengst(prijsNa(prijs, n), n);
      assert.ok(opbrengst < kosten, `prijs ${prijs}, ${n} stuks: ${kosten} betaald, ${opbrengst} terug`);
    }
  }
});

test('ook in losse eenheden valt er niets te verdienen', () => {
  let prijs = 75;
  let goud = 0;
  for (let i = 0; i < 100; i++) {
    goud -= koopKosten(prijs, 1);
    prijs = prijsNa(prijs, 1);
  }
  for (let i = 0; i < 100; i++) {
    goud += verkoopOpbrengst(prijs, 1);
    prijs = prijsNa(prijs, -1);
  }
  assert.ok(goud < 0, `rondje leverde ${goud} op`);
});

test('een losse eenheid verschuift ook een goedkope prijs', () => {
  let prijs = 49;
  for (let i = 0; i < 30; i++) prijs = prijsNa(prijs, 1);
  assert.ok(prijs > 53, `prijs bleef op ${prijs}`);
});

test('bij het wisselen van vlaggenschip verhuist de lading mee, proviand eerst', async () => {
  const { verhuisLading } = await import('../js/town/werf.js');
  const { nieuwSchip } = await import('../js/game.js');
  const { WAAR_INDEX } = await import('../js/data.js');
  const oud = nieuwSchip('fluit', { geschut: 0 });
  const nieuw = nieuwSchip('sloep', { geschut: 0 }); // ruim 48
  oud.lading[WAAR_INDEX.suiker] = 40;
  oud.lading[WAAR_INDEX.proviand] = 20;
  const over = verhuisLading(oud, nieuw);
  assert.equal(nieuw.lading[WAAR_INDEX.proviand], 20);
  assert.equal(nieuw.lading[WAAR_INDEX.suiker], 28);
  assert.equal(over, 12);
});
