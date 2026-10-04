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
- Gallop: a Gallop button (left of Jump, only while riding) or Shift, held, boosts to ~2× horse speed (35) with faster legs, more dust and a bit more FOV. A stamina bar on the button drains while galloping (~13 s) and refills (~2 s) after a short pause. Ride time: ~94 s at normal speed, ~64 s galloping (easing off before the tighter corners).
- Obstacles (`CONFIG.obstacles`): 6 in total — 5 low logs and 1 low rock wall (0.6–0.7 high, thin, spanning the 14-wide trail) — spread along the trail (`at` fractions), each alone on a straight (`straightBefore`/`straightAfter`, `maxCurvature`) on level ground (`maxSlope`) with ≥40 clear before and ≥20 after (no other obstacle, no water). **No obstacle, hurdle, fence, barrier or rail within 120 of the cave** (`caveClear`; the route test asserts it). There are no hurdles anywhere. Placed by `placeObstacles()`, which skips a spot rather than force a bad one. Hitting one without jumping makes the horse stumble and slow a little (×0.7 for 0.6 s) — no damage, no respawn, never trapped. Solid (walkable top) for the hero on foot; the horse ignores them in collision and is judged clear/stumble as it passes over.
- River: shallow everywhere (~0.45), with a shallower ford (~0.25) where the trail crosses (~50% of the ride). In water the horse quickly slows to 72%; hooves throw droplets and ripple rings each step, with a bigger splash stepping in or out, and trigger sound placeholders (`audio.js`).
- Gems: 20 each of yellow / blue / pink (60) in 12 groups of 5, placed by sampling the trail spline's centre lane (all within `laneMax` = 4 of the centre line) — colours cycle yellow → blue → pink group by group. Six ground groups alternate straight rows and gentle arcs (≤1.5 off centre), sit on fairly straight trail and keep clear of obstacles; six are arcs in the air over every obstacle following the hop (only a jump reaches them — `airLift`, `collectHeight`). See `gems.layoutGroups`. Collect by walking or riding through (measured from the body centre). 5 of a colour unlocks an ability (yellow → Batarang, blue → Smoke Bomb, pink → Flash Mode): the matching counter pulses and a small toast shows top-left for ~2 s — nothing mid-screen. Recorded in `Abilities` (abilities themselves come later). Gems and unlocks persist through respawns; only a new game resets them.
- HUD toasts (checkpoint, objective, unlock) are small, top-left under the quest panel.
- Portrait orientation shows a "rotate your phone" overlay and pauses the game.

## Map (≈300×780: x −150…150, z −100…680)
Town rooftops (x≈-142…-72) → giant swamp trees with walkable branches (…≈-24) → sand bank with the horse (-15, 6) → **the forest ride** (`CONFIG.track`, `track.js`): one trail spline drives everything — a 14-wide dirt trail ~1544 long (must be ≥ `CONFIG.trailLength` = 1500; the route test fails otherwise) built from straights and wide rounded corners (radius 40) — north along the west river bank, a sweep west, a hill climb and descent up the west side, east along the north edge across the river ford (~50%), a long descent down the east side, a sweep back west, then south past the cliffs and east into the arena → monster arena (centre 104, r 20, ring of boulders opening west; no obstacles) → **giant cave**: a ~26-high mouth (10× the horse) in a cliff wall ~80–108 high at x≈128, side cliffs wrapping the arena, tall rock pillars and mist at the cliff base. The desert (x>124, z<~100) is behind the cliff, empty for now. The river (x≈0, meandering) runs the whole length of the map. Boundary hills on all edges.
- Layout is generated deterministically from `CONFIG.world.seed` in `world.js` (`generateLayout`). Terrain height is analytic: `world.heightAt(x,z)`.
- Colliders in `world.js`: `boxes` (buildings: standable tops + walls), `beams` (horizontal branches: flat walkable top that tapers base→tip, solid sides), `cylinders` (trunks, rocks, forest trees). Hero uses `world.groundAt()` and `world.collide()`.
- Tree-leaping zone: each route platform is a thick limb that grows sideways out of a bowed, root-flared trunk (an elbow) and then runs along the route, wide base facing the previous platform. Twigs angle outward off the path; leaf clusters (3 greens) stay ≥ `leafLiftMin` above the walkable top. Background giant trees frame the swamp. No floating platforms.
- Tree-zone visibility: leaf clusters (separate transparent foliage material, per-instance `instanceFade`) that block the camera→hero line or sit within `CONFIG.foliage.fadeRadius` of the hero fade smoothly to ~15% (`World.updateFoliage`). Trunks/branches stay solid. Canopy over the path is kept small, pushed to the sides and above the jump apex; crowns lean away from the walking line.
- Jump guide (`guides.js`): while airborne a ring marks the spot directly below the hero (yellow over a platform, red over the swamp/street); the next branch on the route gets a soft pulsing glow.
- Camera: in the tree zone it pulls back 20% and looks further down (blended at the zone edges). It never renders from inside trunks, rocks, buildings or leaf clusters: snaps in front of solids, eases back out; leaves merely in the way fade instead.
- Trail corridor: a tree-free corridor 22 wide (`track.corridorHalfWidth` = 11) along the whole spline. Invisible walls (`track.wall`, offset 7.3 from the centre line) keep the hero and horse on the 14-wide trail: `World.collide` pushes back and removes only the outward velocity, the horse rails along them (turns to run with the trail, loses a little speed), and the camera never goes beyond them. Walls start 10 into the trail (the horse's spot) and end 25 before the arena. A continuous dense line of bushes and boulders (`track.edge`, not colliders, skipped in the river) runs along both corridor edges, wholly outside it. Forest trees are placed only by sampling the spline — rows in a dense band just outside the corridor plus a sparser outer band (`forest.near*`, `farBand`), each tree (crown included) wholly outside the corridor; three species (conifer, broadleaf, birch) with varied size, stretch and tint, chunked by `forest.chunkSize` so far chunks cull and skip the fade update. Each species is two InstancedMeshes per chunk: solid trunks + fadeable crowns. All foliage (giant-tree leaves and forest crowns) lives in `world.foliageSets` and uses the same fade and camera collision.
- Ride checkpoints (`CONFIG.checkpoints.fractions`): the horse's spot plus every 25% of the trail (moved forward off the river and past any obstacle run-up), flag poles at the trail's right edge; flag turns green when reached. Respawning faces along the trail.
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
- [x] Trail spline rebuild: 14-wide trail ≥1500 long, 22-wide tree-free corridor, invisible side walls, continuous bush/boulder edge, spline-sampled trees/gems/obstacles, 60 gems, no hurdles near the cave
- [x] Long flowing forest track: ~1480-long trail (~90 s), wide curves, hills, ford at half way, 6 fair obstacles, gem rows/arcs, smooth horse-relative steering with path assist, checkpoints every 25%
- [ ] Real sounds (placeholders fire today)
- [ ] Abilities: Batarang, Smoke Bomb, Flash Mode
- [ ] Cave + boss
- [ ] Girl/witch cutscene
- [ ] Desert ride
- [ ] "To be continued" ending (screen exists; flow not wired)

## Commands
- `npm install` · `npm run dev` (use `--host` to test on a phone on the LAN) · `npm run build` · `npm run preview`
- `npm run test:route` — headless physics test: gap fairness vs. reach, every hop (early + coyote-late jumps), no platform skippable, full autopilot run, branch collision, camera checks in the tree zone (never inside a trunk/leaf cluster, opaque leaves never block the hero), and the ride: layout checks (trail spline ≥ `trailLength`; 6 obstacles on straights with clear run-up/out, all within the trail width, one wall, logs/walls only, none within 120 of the cave; no tree, crown or edge bush inside the 22-wide corridor and the edge line continuous; every gem within 4 of the centre line; air gems need a jump), walk to the horse, mount, then a bot steering like a player (stick left/right only) rides the whole trail at normal speed — jumps every obstacle, all 60 gems, all 3 unlocks, all checkpoints, ford slow-down + splash sounds, no falls/stumbles/stuck points, stays on the trail, ~90 s, close camera never inside trunks/crowns; a run holding Gallop (≤65 s, also all gems and every jump); hard pushes into the side walls on horseback (normal + gallop) and on foot stay on the trail and keep sliding; a run that never jumps (6 stumbles, never trapped); a stumble (slows a little, no respawn); steering (tap then centred → straightens, holds its line); gallop (2× speed, stamina drains and refills), cave scale, dismount/remount, and a fall after riding respawning on the horse with gems kept.
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (npm ci + build → GitHub Pages).
