# Dreamer Hero — Game Spec

> **Claude: read this file at the start of every session before changing anything.**
> Keep it up to date when rules, architecture or progress change.

## Platform
- Three.js + Vite browser game. Target: **phones in landscape**. Desktop works via keyboard/mouse fallback.
- Hosted on **GitHub Pages** (Vite `base: './'`, output in `dist/`).
- Performance: renderer pixel ratio capped at **2** (`CONFIG.render.maxPixelRatio`), **no heavy shadows** (no shadow maps; use blob/fake shadows if needed), low-poly placeholders, fog to limit draw distance.

## Story
An average, bored schoolboy falls asleep at his desk and dreams he is a **masked superhero** in another world.

### Part 1 flow
1. **Cartoon intro** — animated picture-only slides (no captions): dull student at desk (equations appear on the chalkboard) → drowsy (head slowly nods, chalkboard fades) → dozing off (Zzz, a swirl forms) → swirl into the purple dream world where the masked hero appears. Tap to advance, dot + arrow progress indicator, Skip button. Slides may take an optional one-line `caption` (bold comic style) but pictures carry the story.
2. **Rooftops** — hero learns to run and jump across rooftops.
3. **Tree leaping** — leap between giant trees.
4. **Horse by the river** — hero finds a horse at a riverbank and mounts it.
5. **Forest ride** — ride through the forest collecting gems.
6. **Cave & monster boss** — enter a cave, fight the monster boss.
7. **Girl's cutscene** — a girl thanks the hero (she is **secretly a witch** — hint it, don't reveal it outright).
8. **Desert ride** — ride off into the desert.
9. **"To be continued"** — ending screen.

## Rules
- Game states: `intro`, `play`, `cutscene`, `gameover`, `ending` (see `src/state.js`). Only valid transitions are allowed.
- Falling (touching the town streets or the swamp under the trees, or dropping below `CONFIG.world.killY`) → respawn at the last safe platform with a quick fade. Gameover is reserved for later (e.g. the boss); gameover → tap to retry.
- Jump assist (phone fairness): coyote time, jump buffering, ledge assist (snap up onto ledges just above the feet while falling) and edge grace (platform edges count a little past their border). All in `CONFIG.hero`.
- Jump: ~1.94 high, ~6.0 units long on level ground, ~5.1 jumping up 1 (walk 7 × air boost 1.095, jump velocity 9.86, gravity 25 — unchanged so it isn't floaty).
- Every gap on the route is generated within reach and uses ~35–56% of it; skipping a platform (jumping straight to the one after next) is impossible. Re-run `npm run test:route` after any jump, gap or layout change.
- Controls (touch): left-half virtual joystick moves; right-half drag rotates camera; Jump button (multi-touch: move + look + jump at once).
- Controls (keyboard fallback): WASD / arrows move, Space jumps, mouse drag rotates camera.
- Portrait orientation shows a "rotate your phone" overlay and pauses the game.

## Map (≈300×200, linear route along +X)
Town rooftops (x≈-142…-72) → giant swamp trees with walkable branches (…≈-24) → sand bank with the horse → river (x≈0, meandering) → forest (8…84, trees keep clear of the wiggly ground path `pathZ(x)`) → cave arena (84…124, rock ring opening west) → desert (124…150, empty for now). Boundary hills on all edges.
- Layout is generated deterministically from `CONFIG.world.seed` in `world.js` (`generateLayout`). Terrain height is analytic: `world.heightAt(x,z)`.
- Colliders in `world.js`: `boxes` (buildings: standable tops + walls), `beams` (horizontal branches: flat walkable top that tapers base→tip, solid sides), `cylinders` (trunks, rocks, forest trees). Hero uses `world.groundAt()` and `world.collide()`.
- Tree-leaping zone: each route platform is a thick limb that grows sideways out of a bowed, root-flared trunk (an elbow) and then runs along the route, wide base facing the previous platform. Twigs angle outward off the path; leaf clusters (3 greens) stay ≥ `leafLiftMin` above the walkable top. Background giant trees frame the swamp. No floating platforms.
- Tree-zone visibility: leaf clusters (separate transparent foliage material, per-instance `instanceFade`) that block the camera→hero line or sit within `CONFIG.foliage.fadeRadius` of the hero fade smoothly to ~15% (`World.updateFoliage`). Trunks/branches stay solid. Canopy over the path is kept small, pushed to the sides and above the jump apex; crowns lean away from the walking line.
- Jump guide (`guides.js`): while airborne a ring marks the spot directly below the hero (yellow over a platform, red over the swamp/street); the next branch on the route gets a soft pulsing glow.
- Camera: in the tree zone it pulls back 20% and looks further down (blended at the zone edges). It never renders from inside trunks, rocks, buildings or leaf clusters: snaps in front of solids, eases back out; leaves merely in the way fade instead.
- Forest/edge trees: three species (conifer, broadleaf, birch) with varied size, stretch and tint, one InstancedMesh each.
- Repeated objects use `InstancedMesh` (buildings, roofs, giant-tree trunks/limbs/twigs/leaves, forest species, rocks, clouds). Building windows are drawn in-shader in world space.
- Quests (`quests.js`): ordered objectives with a target + completion test, HUD text with distance, a floating arrow above the hero, and a light beacon at the target. Current: "Jump across the rooftops" → "Leap through the trees" → "Find the horse".

## Architecture (one file per system, all in `/src`)
| File | Responsibility |
|---|---|
| `config.js` | **All tunable numbers** + the `DIALOGUE` object (all text/dialogue). |
| `state.js` | Game state machine (`intro/play/cutscene/gameover/ending`) with enter/exit listeners. |
| `world.js` | Map layout, terrain (`heightAt`), sky, river, buildings, trees, cave rocks, colliders; `loadTerrainModel()`, `loadBuildingModels()`, `loadGiantTreeModels()`, `loadForestTreeModels()`, `loadRockModel()`. |
| `hero.js` | Hero movement, gravity, jump assist, platform/wall collision, respawn at last safe spot, `loadHeroModel()`. |
| `camera.js` | Third-person follow camera with yaw/pitch orbit, tree-zone distance/pitch, collision with trunks, rocks, buildings and leaves. |
| `input.js` | Joystick, camera drag, jump button, keyboard & mouse; unified input state. |
| `ui.js` | DOM overlays: quest panel, toast, respawn fade, controls hint, rotate-phone message, gameover/ending screens. |
| `cutscene.js` | Slide-based cutscenes (intro, girl scene) with tap-to-advance + Skip. |
| `horse.js` | Horse waiting on the sand bank (idle grazing) — `loadHorseModel()`. Riding not yet. |
| `gems.js` | Collectible gems — `loadGemModel()`. *(stub)* |
| `abilities.js` | Hero super abilities. *(stub)* |
| `boss.js` | Cave monster boss — `loadBossModel()`. *(stub)* |
| `guides.js` | Jump readability: landing ring under the airborne hero, glow on the next branch — `loadLandingRingModel()`, `loadHighlightModel()`. |
| `quests.js` | Objectives, objective arrow + beacon — `loadArrowModel()`, `loadBeaconModel()`. |
| `main.js` | Bootstraps systems and runs the game loop. |

### Conventions
- **No magic numbers** in systems — add them to `CONFIG` in `config.js`.
- **No hard-coded strings** for story/dialogue — add them to `DIALOGUE` in `config.js`.
- Every placeholder model is created by an async `loadXModel()` function returning a `THREE.Object3D`, so a real glTF can be swapped in later without touching game logic.
- Keep systems decoupled: they receive what they need via `init(...)`/constructor args, not globals.

## Progress
- [x] Foundation: state machine, capsule hero on terrain, follow camera, joystick, jump, rotate message, keyboard fallback, intro slides.
- [x] Map: terrain, sky, river, town, tree canopy, forest, cave arena, empty desert
- [x] Rooftops level
- [x] Tree leaping
- [x] Quest text + objective arrow (rooftops → trees → find the horse)
- [ ] Horse & river (horse placed; mounting/riding not yet)
- [ ] Forest ride + gems
- [ ] Cave + boss
- [ ] Girl/witch cutscene
- [ ] Desert ride
- [ ] "To be continued" ending (screen exists; flow not wired)

## Commands
- `npm install` · `npm run dev` (use `--host` to test on a phone on the LAN) · `npm run build` · `npm run preview`
- `npm run test:route` — headless physics test: gap fairness vs. reach, every hop (early + coyote-late jumps), no platform skippable, full autopilot run, branch collision, and camera checks in the tree zone (never inside a trunk/leaf cluster, opaque leaves never block the hero).
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (npm ci + build → GitHub Pages).
