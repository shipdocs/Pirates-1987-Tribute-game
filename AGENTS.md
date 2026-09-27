# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

"Zeeroverij" — a Sid Meier's Pirates! tribute, pure browser game: vanilla HTML/CSS/ES-modules, canvas 2D rendering, Web Audio API. **No build step or dependencies.** `package.json` only declares ESM and the built-in Node test command; there is no lint setup.

## Run

- Must be served over HTTP (ES modules fail on `file://` due to CORS): `python3 -m http.server 8000` → `http://localhost:8000/`
- Headless tests: `node --test` (or `npm test`); no install step is required.
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
- **Units**: positions/speeds are "wereldeenheden" on a lat/lon-projected map (`PPD = 350` world units per degree, in `world.js`; the old `PPD_VOORHEEN = 196` is kept only so `laad()` can rescale pre-v8 saves onto the stretched map). Angles are radians, 0 = east. Sailing time is intentionally partially decoupled from physical scale (`DAGEN_PER_SECONDE = 0.044`, exported from `world.js` and used in `sail.js`).
- **Battle terrain**: every sea battle gets deterministic local coast and rocks from the world seed, encounter position, and opponent. Terrain blocks ships and cannonballs; ship-size clearance is intentional, so small vessels can use gaps that large vessels cannot.
- **`render.js` and `town.js` are pass-through barrels**, kept only so `import * as R from './render.js'` and `import { openHaven, ... } from './town.js'` keep working unchanged. The real code lives in `js/render/*.js` (zee, land, schepen, steden, weer, hud, zeekaart, effecten, schatjacht, patronen, hulpjes) and `js/town/*.js` (haven, kroeg, handel, werf, gouverneur, bestorming, familie, opdrachten, aftreden, relatie) — edit those, not the barrel files. Below, "in `render.js`" means "reachable through the `render.js` barrel"; unexported helpers are cited by their actual submodule.
- **Animated offsets are integrated per frame, never `time × current speed`.** The latter is a position derived from the *present* speed, so any change to that speed silently rewrites the whole history: the wave field jumped thousands of pixels on a wind shift, and while the wind turned it raced away at a speed that grew with session length. See `zeeDriftBij()` in `js/render/zee.js`; the same trap applies to anything drifting with wind, current or camera.
- **A canvas `filter: blur(r)` reaches roughly `3r`, not `r`.** Blurring a layer that exactly covers the screen therefore pulls in the transparent area beyond its edge and leaves a dark border. Draw the source oversized (see `tekenMiniatuur()` in `game.js`), and put an unblurred copy underneath as a safety net.
- **Constants that two systems must agree on live in one exported helper.** The luffing dead angle is used both by the sail curve and by the fleets' tacking course; when those drifted apart, fleets steered for an angle where they stall. See `dodeHoek()` in `world.js`. The same applies to `wereldSchaal()`/`WARE_ZOOM` in `js/render/schepen.js` (ships, towns and the camera's default zoom) and to `R.HUD` in `js/render/hud.js` (every HUD colour, mirroring the CSS tokens at the top of `css/game.css`).
- **A drawn ship may never be scaled above 1.** `isVaren()` (a `Wereld` method in `world.js`) collides on `0,62·L + 3` **world** units and that radius does not scale with the draw scale, while the drawn bowsprit reaches `0,70·L·schaal`. Above scale 1 the hull visibly overhangs land the game considers solid. Size therefore comes from the camera zoom; `wereldSchaal()` only grows *below* the default zoom, so the fleet stays findable on the map overview.
- **The default zoom is capped by the storm cells, not by taste.** A cell measures 600–1240 world units across; zoom in much further than `WARE_ZOOM` and the core edge and the fast band fall outside the view — exactly the boundary the player makes the decision on.
- **A dashed stroke cannot be surf.** With `lineCap: 'round'` a dash as long as the line is wide *is* an oval, so the coast ended up in a chain of white sausages. Foam is a `CanvasPattern` used as `strokeStyle` (`maakSchuimTegel` in `js/render/patronen.js`, `schuimLangs` in `js/render/land.js`), animated by moving the *pattern* with `setTransform` — never the path, or the coastline swims.
- **The land buffer is cached, so cost scales with the rebuild, not the frame — but bound it by the view.** A pattern fill over a landmass' bounding box costs the mainland nearly the whole world map even when a strip is on screen; intersect with the visible box first. Anything drawn inside the per-landmass clip loop runs once per *visible* landmass, so combine repeated geometry into one `Path2D` (see `oeverPad` in `js/render/land.js`).
- **Deterministic scatter uses a hash, not a sequence.** `makeRng` forces you to draw the same number of values for every candidate — including the tens of thousands of sea cells inside the mainland's bounding box — or the whole pattern shifts. `ruis(ix, iy, zaad)` (`js/render/land.js`) may be skipped, so the cheap `isLand` test can go first.
- **Overlapping shapes in one `Path2D` filled once do not darken each other.** That is why mountain ridges, tree canopies and river banks each build one path per colour instead of filling per shape.
- **Anything that does not move gets baked — through `js/sprite.js`, not by hand.** `maakBakkerij()` returns a cache that draws something once at screen resolution and then blits it. Customers: hulls (`rompSprite` in `js/render/schepen.js`) and towns (`stadSprite` in `js/render/steden.js`). A baked part may contain ten times the drawing work it did before — that is the whole point — but everything in it must follow from its key. Whatever genuinely changes (the waving flag, the marker ring, the name plate that scales *against* the zoom) belongs outside the sprite.
- **A cache limit belongs in pixels, not in entries.** The same town is 67 pixels across on the map overview and 532 at maximum zoom: sixty-five times the memory for the same count. A limit of 24 towns was generous at play zoom and exactly too small at minimum zoom, where all 35 harbours are on screen at once — the cache emptied every single frame and rebaked everything. All of the cost, none of the benefit. Evict the least recently used rather than clearing the whole cache, or the image stutters after every overflow.
- **A baked drawing does not know the world's rotation.** Code that draws inside a rotated space (`tekenStadLijf` in `js/render/steden.js` turns towards the roadstead) must counter-rotate the sun direction, otherwise a south-coast harbour's shadow points the opposite way from an east-coast one. See `zonX`/`zonY` there.
- **Particles share a draw function, not a behaviour.** `tekenRook` (`js/render/effecten.js`) serves both gun smoke and the foam in the wake. Smoke should billow, foam should not: the wake trail inherited the smoke growth factor and swelled to over one and a half ship lengths wide, standing behind the ship as a white smoke triangle. Hence `p.groei` and `p.dekking` per particle.
- **Battle particles have a `soort`, and it decides the layer.** `tekenDeeltje` (`js/render/effecten.js`) draws `flits`, `plons`, `spat`, `vonk`, `splinter`, `vlam` or, without a soort, smoke via `tekenRook`. `deeltjeInDeLucht(p)` splits them: water and powder smoke go under the ships, flashes, sparks, splinters and flames over them. `p.demping` slows a particle per second; `MAX_DEELTJES` in `battle.js` caps the total.
- **Lighting follows `speler.dag % 1`, not the wall clock**, and a new game starts at `dag: 0.28` (just after dawn) so the first view is not the darkest sea of the day. The harbour print (`havenPrent`) picks its day/dusk/night palette from the same `schemerFactor()`.

## Measuring in the browser

Visual and feel changes are verified by driving the real game headless (Playwright + the cached Chromium in `~/.cache/ms-playwright`), serving the repo over HTTP and importing the modules in the page — the ES-module cache makes them the same instances the game uses. Traps that have cost time:

- **`werkBij` returns early while a UI overlay is open** (`UI.ietsOpen()`). A test that parks the ship somewhere is frozen the moment a random sea event or an enemy encounter opens a screen, and every later phase then silently "passes". Call `UI.sluitAlles()` every frame in the test loop, and clear `wereld.vloten` plus stub `vlotenTik` when measuring something else.
- **A test that starts at a random position makes two screenshots incomparable.** Pin the position, the world seed and the wind before measuring anything, or you are measuring noise.
- **Headless numbers are software-rendered.** They say something about draw calls, pixel maths and correctness; nothing about frame rate on real hardware.
- **Measure the quantity you actually care about.** A pixel bounding box is quantised to whole pixels and hides a few degrees of rotation; image moments give the angle directly. Sample the same value over a long enough window that you catch the extremes of every period involved.
- **For visual bugs, give each suspect a signal colour and render once.** Three minutes per round, but it excludes definitively where guessing does not.
- **The pattern tiles are built with `Math.random()`, so every page load has a different sea.** Two screenshots of the same scene then differ in half their pixels and you are comparing noise, not your change. Replace `Math.random` through `page.addInitScript` *before* `goto` — the tiles are built at module load, so patching afterwards is too late.
- **The game loop keeps running during `page.evaluate`.** Draw your controlled frame and grab `canvas.toDataURL()` inside the *same* synchronous step; a `locator.screenshot()` afterwards catches whatever the title scene painted over it in the meantime.
- **Draw one frame before you start counting.** The land buffer, the depth map and every sprite are built on their first draw, so a first measured frame reports the one-time cache construction on top of the steady-state cost — it overstated the world's per-frame work by a factor of four here, and it flatters every later "improvement" that merely moves work into a cache. Warm up, then count.
- **Count draw calls, not milliseconds.** Wrapping the methods on `CanvasRenderingContext2D.prototype` (and `Path2D.prototype`) with counters gives a hardware-independent number that is exactly what baking reduces. It also found what timing never would: `tekenKaartlijnen` was 594 calls per frame because its grid step was a hardcoded 92 that had never been tied to `PPD`.

## Style

- 2-space indent, single quotes, semicolons; lines wrap around ~100 chars.
- Imports: named imports for util/data/game, `import * as R from './render.js'`, `import * as UI from './ui.js'`, `import * as audio from './audio.js'`.
- Exported helpers get `/** Dutch JSDoc */`; sections marked with `// --- Naam ---` divider comments.
- Defensive `try/catch` around `localStorage` and Web Audio (old browsers); keep failing gracefully.
- Derive values with helpers (`clamp`, `lerp`, `normAngle`) from `util.js` rather than writing inline math.
