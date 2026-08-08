# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

"Zeeroverij" — a Sid Meier's Pirates! tribute, pure browser game: vanilla HTML/CSS/ES-modules, canvas 2D rendering, Web Audio API. **No build step, no package.json, no dependencies, no tests/lint.**

## Run

- Must be served over HTTP (ES modules fail on `file://` due to CORS): `python3 -m http.server 8000` → `http://localhost:8000/`
- GH Pages deploys from `main` via `.github/workflows/pages.yml` (uploads repo root as-is).

## Critical non-obvious facts

- **All code, identifiers and comments are in Dutch** (e.g. `maakZeilScene`, `werkBij`, `tekenZee`, `stad`, `vijand`). Write new code in Dutch to match.
- **`js/gevechtsmodel.js` is intentionally headless** (no canvas/DOM/audio) so combat balance can be computed outside the browser. Keep it that way; it is the only file reusable server-side.
- **World generation must stay deterministic**: use `makeRng(seed)` (mulberry32, in `util.js`) for anything derived from the world seed. Gameplay logic may use `Math.random` freely.
- **Save = seed + deltas**: `bewaar()` stores the world seed plus changed state (politics, towns) under localStorage key `zeeroverij.opslag.v1`. `laad()` rebuilds the world from the seed. Bump `versie` in the save data and migrate old saves inside `laad()` (it sanitizes missing fields with defaults).
- **Single game state source**: `Game.wereld` and `Game.speler` (globals in `js/game.js`); scene objects (from `maak…Scene()`) hold only transient/camera state.
- **Scene protocol**: scenes expose optional methods `betreed()`, `werkBij(dt)`, `teken(c)`, `toets(code)`, `scroll(dy)`, `verlaat()`, `maatVeranderd()`. `Game.zetScene()` calls enter/leave, main loop calls update/draw.
- **Keyboard input uses `e.code`** (physical keys), not `e.key` — so WASD and arrows both work. Arrow keys/Space/Tab are `preventDefault`-ed unless a UI overlay is open (`UI.ietsOpen()`).
- **UI overlays** are DOM (div `#ui`), separate from canvas `#spel`. Use `UI.toonScherm({titel, bouw(body, sch), knoppen})`; it returns a managed screen with `sluit()`, `ververs()`, `escKnop`. `UI.vraag()` returns a Promise.
- **Debugging**: full game state exposed as `window.__G = Game`; in battle, `__G.scene.debug.vijand` mutates the enemy directly. `audio.muziekStand()` exists for testing.
- **Reduced motion**: pass decorative time through `sierTijd(t)` (freezes when `prefers-reduced-motion` is set); gameplay motion must NOT go through it.
- **Data lookup**: arrays in `js/data.js` are paired with id-index maps (`WAREN`→`WAAR_INDEX`, `SCHEPEN`→`SCHIP_INDEX`). Cargo is an array indexed by `WAAR_INDEX` (use `nieuweLading()`); never use string keys.
- **Units**: positions/speeds are "wereldeenheden" on a lat/lon-projected map (`PPD = 196` world units per degree, in `world.js`). Angles are radians, 0 = east. Sailing time is intentionally partially decoupled from physical scale (`DAGEN_PER_SECONDE = 0.12` in `sail.js`).
- **Battle terrain**: every sea battle gets deterministic local coast and rocks from the world seed, encounter position, and opponent. Terrain blocks ships and cannonballs; ship-size clearance is intentional, so small vessels can use gaps that large vessels cannot.

## Style

- 2-space indent, single quotes, semicolons; lines wrap around ~100 chars.
- Imports: named imports for util/data/game, `import * as R from './render.js'`, `import * as UI from './ui.js'`, `import * as audio from './audio.js'`.
- Exported helpers get `/** Dutch JSDoc */`; sections marked with `// --- Naam ---` divider comments.
- Defensive `try/catch` around `localStorage` and Web Audio (old browsers); keep failing gracefully.
- Derive values with helpers (`clamp`, `lerp`, `normAngle`) from `util.js` rather than writing inline math.
