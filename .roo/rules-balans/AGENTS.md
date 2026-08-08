# Balans Mode Rules (Non-Obvious Only)

- **Headless contract is load-bearing**: [`js/gevechtsmodel.js`](../../js/gevechtsmodel.js) imports only [`util.js`](../../js/util.js) and must stay free of canvas/DOM/audio — it is the only file meant to run in a bare Node/server context for balance maths. This mode's edit scope enforces it.
- **Balance is measurable, not guessable**: after tuning numbers, run the core standalone (e.g. `node -e "import('./js/gevechtsmodel.js').then(m => console.log(m.schootsafstand(...)))"` — works because the file is headless) to sanity-check effects. There is no test suite; this is the test.
- **Key balance invariants** (the claims these numbers exist to preserve):
  - A light ship's winning path is to silence the opponent's battery and come alongside: [`geeftOp()`](../../js/gevechtsmodel.js:187) surrenders anyone who cannot shoot back (`kanonnen <= 0`) once within [`OVERGAVE_AFSTAND`](../../js/gevechtsmodel.js:179).
  - Bigger is not easier to disarm: [`geschutVerlies()`](../../js/gevechtsmodel.js:156) scales damage *down* with starting gun count via [`TREFFERS_ONTWAPENEN`](../../js/gevechtsmodel.js:153) — a heavy ship loses guns at a lower rate than a light one.
  - Crew loss is firepower loss: [`herlaadTijd()`](../../js/gevechtsmodel.js:133) grows as crew fraction drops, so thinning a crew slows reloads.
  - Guns fire only abeam: [`SCHOOTSVELD`](../../js/gevechtsmodel.js:50) and [`TRAVERSE`](../../js/gevechtsmodel.js:47) bound what the ship can hit; ships aim with the helm ([`salvoRichting()`](../../js/gevechtsmodel.js:97)), and shots are real projectiles with travel time ([`voorhoudpunt()`](../../js/gevechtsmodel.js:81), [`KOGEL_SNELHEID`](../../js/gevechtsmodel.js:40)).
  - [`salvoStukken()`](../../js/gevechtsmodel.js:59) caps a broadside at half the guns (max 14) — never "all guns at once".
- **Determinism boundary applies here too**: if a balance computation ever needs randomness, it must take a `rng` from `makeRng(seed)` (see [`util.js`](../../js/util.js:26)) — never a bare `Math.random` — so results stay reproducible outside the browser.
- **Targeting math must stay shared**: `gevechtsmodel.js` exports the aiming/lead/salvo functions that [`battle.js`](../../js/battle.js) imports. Keep every exported function here in sync with its caller; the scene must never re-derive its own copy of these numbers.
- **Style**: Dutch identifiers/JSDoc, 2-space indent, single quotes, semicolons; prefer `clamp`/`normAngle` from [`util.js`](../../js/util.js) over inline math.
