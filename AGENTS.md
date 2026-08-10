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
- **Animated offsets are integrated per frame, never `time × current speed`.** The latter is a position derived from the *present* speed, so any change to that speed silently rewrites the whole history: the wave field jumped thousands of pixels on a wind shift, and while the wind turned it raced away at a speed that grew with session length. See `zeeDriftBij()` in `render.js`; the same trap applies to anything drifting with wind, current or camera.
- **A canvas `filter: blur(r)` reaches roughly `3r`, not `r`.** Blurring a layer that exactly covers the screen therefore pulls in the transparent area beyond its edge and leaves a dark border. Draw the source oversized (see `tekenMiniatuur()` in `game.js`), and put an unblurred copy underneath as a safety net.
- **Constants that two systems must agree on live in one exported helper.** The luffing dead angle is used both by the sail curve and by the fleets' tacking course; when those drifted apart, fleets steered for an angle where they stall. See `dodeHoek()` in `world.js`.

## Measuring in the browser

Visual and feel changes are verified by driving the real game headless (Playwright + the cached Chromium in `~/.cache/ms-playwright`), serving the repo over HTTP and importing the modules in the page — the ES-module cache makes them the same instances the game uses. Traps that have cost time:

- **`werkBij` returns early while a UI overlay is open** (`UI.ietsOpen()`). A test that parks the ship somewhere is frozen the moment a random sea event or an enemy encounter opens a screen, and every later phase then silently "passes". Call `UI.sluitAlles()` every frame in the test loop, and clear `wereld.vloten` plus stub `vlotenTik` when measuring something else.
- **A test that starts at a random position makes two screenshots incomparable.** Pin the position, the world seed and the wind before measuring anything, or you are measuring noise.
- **Headless numbers are software-rendered.** They say something about draw calls, pixel maths and correctness; nothing about frame rate on real hardware.
- **Measure the quantity you actually care about.** A pixel bounding box is quantised to whole pixels and hides a few degrees of rotation; image moments give the angle directly. Sample the same value over a long enough window that you catch the extremes of every period involved.
- **For visual bugs, give each suspect a signal colour and render once.** Three minutes per round, but it excludes definitively where guessing does not.

## Style

- 2-space indent, single quotes, semicolons; lines wrap around ~100 chars.
- Imports: named imports for util/data/game, `import * as R from './render.js'`, `import * as UI from './ui.js'`, `import * as audio from './audio.js'`.
- Exported helpers get `/** Dutch JSDoc */`; sections marked with `// --- Naam ---` divider comments.
- Defensive `try/catch` around `localStorage` and Web Audio (old browsers); keep failing gracefully.
- Derive values with helpers (`clamp`, `lerp`, `normAngle`) from `util.js` rather than writing inline math.
