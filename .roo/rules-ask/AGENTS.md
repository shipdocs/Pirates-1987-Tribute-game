# Ask Mode Rules (Non-Obvious Only)

- **Codebase language is Dutch** — identifiers, comments, JSDoc and in-game text are all Dutch (`maakZeilScene`, `werkBij`, `vijand`). Don't expect English names; the canonical "source of truth" docs ([`README.md`](../../README.md)) are also Dutch.
- **No build system exists**: no `package.json`, no `node_modules`, no tests/lint config. "Build" = serve static files; the run command is `python3 -m http.server 8000`.
- **`js/gevechtsmodel.js` is the only server-reusable module**: it must never import canvas/DOM/audio (see its header comment). Other modules freely use the DOM.
- **Two randomness regimes**: world geometry/economy is deterministic from the world `seed` via `makeRng(seed)`; everything gameplay (wind, battles, events, diplomacy) uses `Math.random`. Do not confuse the two when reasoning about reproducibility.
- **Save architecture**: `localStorage` key `zeeroverij.opslag.v1` holds seed + deltas (politics, towns, player); world is rebuilt from seed. The hall-of-fame (erelijst) is a separate key (`zeeroverij.erelijst.v1`) that deliberately survives save wipes.
- **Data files use id→index maps**: arrays like `WAREN`/`SCHEPEN` pair with `WAAR_INDEX`/`SCHIP_INDEX`; cargo is an array indexed by `WAAR_INDEX`. Any string/object-keyed cargo is a bug.
- **Canvas vs DOM split**: rendering/gameplay is canvas (`#spel`), all UI overlays are DOM (`#ui`) built exclusively through `UI.toonScherm(...)`.
- **Analysis documents**: `ANALYSE-*.md` files at repo root are the written design discussions (e.g. online/multiplayer feasibility) — reference them for project-history context.
- **Units**: positions/speeds are "wereldeenheden" (`PPD = 92` per degree lat/lon, projected); angles in radians with 0 = east (see [`world.js`](../../js/world.js:6)).
