# Debug Mode Rules (Non-Obvious Only)

- **Full game state is exposed as `window.__G = Game`** (set in [`js/main.js`](../../js/main.js:526)) — use the console to inspect/mutate anything: e.g. `__G.speler.goud = 50000`.
- **Battle enemy is directly mutable**: in a zeeslag, `__G.scene.debug.vijand` (wired in [`js/battle.js`](../../js/battle.js:338)) lets you set `.romp`, `.bemanning`, `.kanonnen`, etc. live. There is a `debug` handle on the scene object itself.
- **`audio.muziekStand()`** ([`js/audio.js`](../../js/audio.js:1207)) exists for testing the music position.
- **No tests, no build, no lint**: verify headless combat logic by loading `js/gevechtsmodel.js` in a plain Node context (it must not touch canvas/DOM/audio); for the rest, run the game via `python3 -m http.server 8000` and drive it in a browser.
- **Silent failures are by design**: `localStorage` (`bewaar`/`laad`) and Web Audio (`ctx()`) each fail gracefully inside `try/catch` — if saving or sound seems broken, suspect these guards rather than missing code paths.
- **The world is deterministic from its seed**: same seed → same world. If towns/geometry look wrong, check `makeRng` usage in world-gen; gameplay randomness `Math.random` never affects world layout.
- **`Game.wereld`/`Game.speler` are the single source of truth**: temporary/debug values should never be stored inside scene closures, or they vanish on `Game.zetScene()`.
- **Saves sanitize on load**: `laad()` fills missing fields with defaults and rejects retired captains (`speler.gestopt`) — a "unreadable" save is returned as `null` from `laad()`, which the title screen handles by clearing storage.
