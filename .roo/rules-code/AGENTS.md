# Code Mode Rules (Non-Obvious Only)

- **Write in Dutch**: all identifiers, comments and JSDoc are Dutch (`maakZeilScene`, `werkBij`, `toonScherm`, `vijand`). Read [AGENTS.md](../../AGENTS.md) first for the full conventions.
- **Never break the headless contract** of [`js/gevechtsmodel.js`](../../js/gevechtsmodel.js): no canvas/DOM/audio imports there — it must stay runnable outside the browser (combat balance is computed server-side/headless).
- **Deterministic world**: anything derived from the world `seed` must go through `makeRng(seed)` from [`js/util.js`](../../js/util.js); never `Math.random` for world layout.
- **Save format** ([`bewaar()`/`laad()`](../../js/game.js:600)): save = seed + changed state only. When adding new player/world fields, bump `versie` and wire migration into `laad()` — it sanitizes missing fields with defaults.
- **Fleet state belongs on `Game.speler`/`Game.wereld`**, never in scene closures. Scenes (`maak…Scene()`) hold transient/camera state only and follow the optional-methods scene protocol (`betreed`/`werkBij`/`teken`/`toets`/`scroll`/`verlaat`/`maatVeranderd`).
- **Keyboard**: use `e.code` (physical keys), not `e.key`; arrow keys/Space/Tab must be `preventDefault`-ed unless `UI.ietsOpen()`.
- **UI**: build overlays with `UI.toonScherm(...)` (returns screen with `sluit()`, `ververs()`, `escKnop`), not raw DOM. `UI.vraag()` returns a Promise.
- **Cargo is an array** indexed by `WAAR_INDEX` (use `nieuweLading()` from game.js); never object/string keyed cargo.
- **Reduced motion**: decorative animation time must pass through `sierTijd(t)`; gameplay motion must not.
- **Style**: 2-space indent, single quotes, semicolons, ~100 char lines; Dutch JSDoc on exported helpers; `try/catch` around localStorage/Web Audio so old browsers fail gracefully; use `clamp`/`lerp`/`normAngle` helpers instead of inline math.
