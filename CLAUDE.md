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
- Falling (touching the town streets or the swamp under the trees, or dropping below `CONFIG.world.killY`) → respawn at the last safe platform with a quick fade. **After the first mount**, any fall or death respawns the hero *on the horse* at the last ride checkpoint (`hero.onFall` → `Horse.respawnAtCheckpoint`). Gameover is reserved for later (e.g. the boss); gameover → tap to retry (keeps gems/unlocks/quests).
- Jump assist (phone fairness): coyote time, jump buffering, ledge assist (snap up onto ledges just above the feet while falling) and edge grace (platform edges count a little past their border). All in `CONFIG.hero`.
- Jump: ~1.94 high, ~6.0 units long on level ground, ~5.1 jumping up 1 (walk 7 × air boost 1.095, jump velocity 9.86, gravity 25 — unchanged so it isn't floaty).
- Every gap on the route is generated within reach and uses ~35–56% of it; skipping a platform (jumping straight to the one after next) is impossible. Re-run `npm run test:route` after any jump, gap or layout change.
- Controls (touch): left-half virtual joystick moves (riding: left/right steers, push goes, pull back brakes); right-half drag rotates camera; Jump button (multi-touch: move + look + jump at once).
- Controls (keyboard fallback): WASD / arrows move, Space jumps, E mounts/dismounts, Shift gallops (hold), mouse drag rotates camera.
- Horse: a Mount button (above Jump) appears within 3 units of the horse and becomes Dismount while riding; 0.5 s mount/dismount transition. Mounted, steering is **horse-relative**: stick left/right turns, any push goes, pulling back brakes. Steering is smoothed (`steerSmoothing`) and auto-straightens when the stick is centred (`straighten`) so the horse holds its line — no zig-zag. Turn rate drops with speed (2.2 → 1.0 rad/s, ×0.9 galloping) and it eases off a little at full steer. Horse and rider lean into turns. Path assist (`CONFIG.track.assist`): with the stick near centre it gently eases the heading along the trail (never takes control); a soft edge (`track.softEdge`) turns it back before the bushes. Uphill is slower, downhill a little quicker (`uphillDrag`, `hillSpeed`). Speed builds to 2.5× walk (17.5). Follows terrain, gallop bob + leg swing scale with speed, hop on Jump (~1.6 high, clears every obstacle), dust puffs on sand and the dirt track. Physics substeps keep a full gallop from tunnelling through trunks.
- Riding camera: close over-the-shoulder view behind and slightly above the rider (`CONFIG.camera.rideDistance` / `rideHeight` / `rideShoulder`); subtle FOV widening with speed (+ a little more while galloping). Drag-to-look still works; ~1.2 s after the last drag the camera swings back behind the horse (`rideFollow`, `rideFollowDelay`).
- Gallop: a Gallop button (left of Jump, only while riding) or Shift, held, boosts to ~2× horse speed (35) with faster legs, more dust and a bit more FOV. A stamina bar on the button drains while galloping (~13 s) and refills (~2 s) after a short pause. Ride time: ~90 s at normal speed, ~54 s holding Gallop.
- Obstacles (`CONFIG.obstacles`): 6 in total — 5 low logs and 1 low rock wall (0.6–0.7 high, thin) — spread along the trail (`at` fractions), each alone on a straight (`straightBefore`/`straightAfter`, `maxCurvature`) with ≥40 clear before and ≥20 after (no other obstacle, no water), none in the last 50 before the cave arena. Placed by `placeObstacles()`, which skips a spot rather than force a bad one. Hitting one without jumping makes the horse stumble and slow a little (×0.7 for 0.6 s) — no damage, no respawn, never trapped. Solid (walkable top) for the hero on foot; the horse ignores them in collision and is judged clear/stumble as it passes over.
- River: shallow everywhere (~0.45), with a shallower ford (~0.25) where the trail crosses (~50% of the ride). In water the horse quickly slows to 72%; hooves throw droplets and ripple rings each step, with a bigger splash stepping in or out, and trigger sound placeholders (`audio.js`).
- Gems: 15 each of yellow / blue / pink (45) in 9 groups of 5 along the trail's centre lane — colours cycle yellow → blue → pink group by group, so each colour is collected three times. Ground groups alternate straight rows and gentle arcs (≤1.4 off centre) and keep clear of obstacles; three groups are arcs in the air over obstacles 1, 3 and 5 following the hop (only a jump reaches them — `airLift`, `collectHeight`). All within the trail width (`gems.layoutGroups`). Collect by walking or riding through (measured from the body centre). 5 of a colour unlocks an ability (yellow → Batarang, blue → Smoke Bomb, pink → Flash Mode): the matching counter pulses and a small toast shows top-left for ~2 s — nothing mid-screen. Recorded in `Abilities` (abilities themselves come later). Gems and unlocks persist through respawns; only a new game resets them.
- HUD toasts (checkpoint, objective, unlock) are small, top-left under the quest panel.
- Portrait orientation shows a "rotate your phone" overlay and pauses the game.

## Map (≈300×740: x −150…150, z −100…640)
Town rooftops (x≈-142…-72) → giant swamp trees with walkable branches (…≈-24) → sand bank with the horse (-15, 6) → **the forest ride** (`CONFIG.track`, `track.js`): a ~12-wide dirt trail ~1480 long built from straights and wide rounded corners (radius 40) — north along the west river bank, a sweep west, a hill climb and descent up the west side, east along the north edge across the river ford (~50%), a long descent down the east side, a sweep back west, then south past the cliffs and east into the arena → monster arena (centre 104, r 20, ring of boulders opening west; no obstacles) → **giant cave**: a ~26-high mouth (10× the horse) in a cliff wall ~80–108 high at x≈128, side cliffs wrapping the arena, tall rock pillars and mist at the cliff base. The desert (x>124, z<~100) is behind the cliff, empty for now. The river (x≈0, meandering) runs the whole length of the map. Boundary hills on all edges.
- Layout is generated deterministically from `CONFIG.world.seed` in `world.js` (`generateLayout`). Terrain height is analytic: `world.heightAt(x,z)`.
- Colliders in `world.js`: `boxes` (buildings: standable tops + walls), `beams` (horizontal branches: flat walkable top that tapers base→tip, solid sides), `cylinders` (trunks, rocks, forest trees). Hero uses `world.groundAt()` and `world.collide()`.
- Tree-leaping zone: each route platform is a thick limb that grows sideways out of a bowed, root-flared trunk (an elbow) and then runs along the route, wide base facing the previous platform. Twigs angle outward off the path; leaf clusters (3 greens) stay ≥ `leafLiftMin` above the walkable top. Background giant trees frame the swamp. No floating platforms.
- Tree-zone visibility: leaf clusters (separate transparent foliage material, per-instance `instanceFade`) that block the camera→hero line or sit within `CONFIG.foliage.fadeRadius` of the hero fade smoothly to ~15% (`World.updateFoliage`). Trunks/branches stay solid. Canopy over the path is kept small, pushed to the sides and above the jump apex; crowns lean away from the walking line.
- Jump guide (`guides.js`): while airborne a ring marks the spot directly below the hero (yellow over a platform, red over the swamp/street); the next branch on the route gets a soft pulsing glow.
- Camera: in the tree zone it pulls back 20% and looks further down (blended at the zone edges). It never renders from inside trunks, rocks, buildings or leaf clusters: snaps in front of solids, eases back out; leaves merely in the way fade instead.
- Trail edges: a soft fence of bushes and boulders just outside each edge (`track.edge`, not colliders; skipped in water). Forest trees: three species (conifer, broadleaf, birch) with varied size, stretch and tint; dense in a band along both sides of the trail (kept ≥ `halfWidth` + `trailClearance` + size from it via `track.distance`) plus a sparser scatter elsewhere, chunked by `forest.chunkSize` so far chunks cull and skip the fade update. Each species is two InstancedMeshes per chunk: solid trunks + fadeable crowns. All foliage (giant-tree leaves and forest crowns) lives in `world.foliageSets` and uses the same fade and camera collision.
- Ride checkpoints (`CONFIG.checkpoints.fractions`): the horse's spot plus every 25% of the trail (moved forward off the river), flag poles at the trail's right edge; flag turns green when reached. Respawning faces along the trail.
- Repeated objects use `InstancedMesh` (buildings, roofs, giant-tree trunks/limbs/twigs/leaves, forest species, rocks, clouds). Building windows are drawn in-shader in world space.
- Quests (`quests.js`): ordered objectives with a target + completion test, HUD text with distance, a floating arrow above the hero, and a light beacon at the target. Current: "Jump across the rooftops" → "Leap through the trees" → "Mount the horse" (target follows the horse) → "Ride to the cave" (distance left along the trail; the arrow points 25 ahead on it) → done.

## Architecture (one file per system, all in `/src`)
| File | Responsibility |
|---|---|
| `config.js` | **All tunable numbers** + the `DIALOGUE` object (all text/dialogue). |
| `state.js` | Game state machine (`intro/play/cutscene/gameover/ending`) with enter/exit listeners. |
| `world.js` | Map layout, `surfaceAt`, `isHazard(x, z)`, foliage fade (`makeFadeMaterial`), terrain (`heightAt`, hills, ford), sky, river, buildings, trees, trail edges, cave rocks, colliders; `loadTerrainModel()`, `loadBuildingModels()`, `loadGiantTreeModels()`, `loadForestTreeModels()`, `loadTrackEdgeModels()`, `loadRockModel()`, `loadCaveArchModel()`, `loadObstacleModels()`, `loadMistModel()`; obstacles (`placeObstacles`). |
| `track.js` | The ride trail: `filletPolyline` (straights + arcs) → spline → arc-length samples; `at(s)`, `headingAt`, curvature, grid-indexed `nearest` (s, lateral offset), `distance`. |
| `hero.js` | Hero movement, gravity, jump assist, platform/wall collision, respawn at last safe spot, `loadHeroModel()`. |
| `camera.js` | Third-person follow camera with yaw/pitch orbit, tree-zone distance/pitch, close over-the-shoulder riding view with speed/gallop FOV, collision with trunks, rocks, buildings and leaves. |
| `input.js` | Joystick, camera drag, Jump, Mount and Gallop (hold, with stamina bar) buttons, keyboard (WASD/Space/E/Shift) & mouse; unified input state. |
| `ui.js` | DOM overlays: quest panel, gem counters (pulse on unlock), top-left toast, respawn fade, controls hint, rotate-phone message, gameover/ending screens. |
| `cutscene.js` | Slide-based cutscenes (intro, girl scene) with tap-to-advance + Skip. |
| `horse.js` | Horse + ride: mount/dismount, riding physics & animation, gallop + stamina, obstacle jump/stumble, water slow-down, dust, splashes, ride checkpoints and respawn-on-horse — `loadHorseModel()`, `loadDustModel()`, `loadSplashModels()`, `loadCheckpointModel()`. |
| `audio.js` | Sound placeholders: `sound.play(name)` counts + dispatches a `dreamer-sound` event (splashStep / splashEnter / splashExit / stumble / gallopStart); no audio yet. |
| `gems.js` | Gems along the ride: placement, spin/bob/halo, collect pop, counts, unlock events — `loadGemModel()`. |
| `abilities.js` | Records unlocked abilities (batarang / smokeBomb / flashMode); the abilities themselves are still to build. |
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
- [x] Horse & river: mount/dismount, riding, dust, checkpoints
- [x] Forest ride + gems (3 colours, unlocks recorded; abilities themselves not built yet)
- [x] Ride polish: close camera, gallop + stamina, obstacles, ford + splashes, scattered/air/side-trail gems, giant cave
- [x] Long flowing forest track: ~1480-long trail (~90 s), wide curves, hills, ford at half way, 6 fair obstacles, gem rows/arcs, smooth horse-relative steering with path assist, checkpoints every 25%
- [ ] Real sounds (placeholders fire today)
- [ ] Abilities: Batarang, Smoke Bomb, Flash Mode
- [ ] Cave + boss
- [ ] Girl/witch cutscene
- [ ] Desert ride
- [ ] "To be continued" ending (screen exists; flow not wired)

## Commands
- `npm install` · `npm run dev` (use `--host` to test on a phone on the LAN) · `npm run build` · `npm run preview`
- `npm run test:route` — headless physics test: gap fairness vs. reach, every hop (early + coyote-late jumps), no platform skippable, full autopilot run, branch collision, camera checks in the tree zone (never inside a trunk/leaf cluster, opaque leaves never block the hero), and the ride: layout checks (6 obstacles on straights with clear run-up/out, one wall, arena clear, all gems inside the trail, air gems need a jump), walk to the horse, mount, then a bot steering like a player (stick left/right only) rides the whole trail at normal speed — jumps every obstacle, all 45 gems, all 3 unlocks, all checkpoints, ford slow-down + splash sounds, no falls/stumbles/stuck points, stays on the trail, ~90 s, close camera never inside trunks/crowns; a run holding Gallop (≤60 s); a run that never jumps (6 stumbles, never trapped); a stumble (slows a little, no respawn); steering (tap then centred → straightens, holds its line); gallop (2× speed, stamina drains and refills), cave scale, dismount/remount, and a fall after riding respawning on the horse with gems kept.
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (npm ci + build → GitHub Pages).
