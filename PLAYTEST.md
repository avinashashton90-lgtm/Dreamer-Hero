# Part 1 playtest — final bug check

Checked from the start to the ending screen with the hidden `?debug` test menu. Each section
was opened in headless Chromium (Playwright, software WebGL via swiftshader, Pixel 7 landscape
863×360, and 915×412 / 760×360 / 640×360 for the HUD). The full headless test suites ran on the
real models (`npm run test:route | combat | boss | input | ending | minions | corner | saddle |
chase | hurdles | energy | arena`). All of them pass.

## What was checked

| Section | How | Result |
|---|---|---|
| 1. Forest | Browser: "Forest start" and "Forest hurdles" (riding, HUD, console). Tests: route (full rides at normal speed and galloping with the hurdles running, every gem, every gap, no stuck points, side-wall pushes), hurdles (giant walls / thorns / stones, a full ride with bats), minions (bat swarms, fair attacks, the ride still reaches the cave), energy (potions, grass, never tired on a normal ride). | OK |
| 2. Cave and sealed arena | Browser: "Cave entrance", "Boss fight" (sealed, barrier shut, boss leashed, HUD). Tests: arena (barrier closes 2 s after the boss notices, solid; leash on every frame through chases, charges, pushes, teleports, 60 s of random fighting; revive always inside with full hearts and refilled gems; regen; Amy out of reach; the horse; barrier opens on the boss's death), boss, corner, ending (Amy's rescue cutscene). | OK |
| 3. Lazarus Pit | Browser: "Lazarus Pit scene" (dialogue box shows "Girl: Stop.", Skip ends it into the desert ride with full hearts). Test: ending (the camera never within 1.5 of any character or inside a solid on any frame, dialogue order, Skip on the first line, mid-scene and in the close-up). | OK |
| 4. Desert | Browser: "Desert chase", "Sandstorm" (skeletons up, storm at full strength, clear corridor: no sand in it, fog 30–150). Tests: chase (first group 2 s after the ride resumes, every group 30–45 ahead and always in view while charging, one lunge each for a quarter heart, one Batarang hit = a kill that breaks the skeleton apart, Smoke paralyses, Flash kills nearby ones, whirlwinds and debris off the corridor, fog ≤ 40% at 60 along the trail), saddle, ending (the new pit dialogue, the horse walking up to the pit, AJ kneeling at the water's edge, no glow on Amy). | OK |
| 5. Castle gate and ending | Browser: "Castle gate cinematic" plays through into the ending; "Ending screen" shows "To be continued... Part 2" with the summary and Play Again. Tests: chase, ending. | OK |
| 6. HUD on phone landscape | Browser: every visible HUD element against every other one at 915×412, 760×360, 640×360, with and without the TEST button; every action button ≥ 56 px, in the bottom-right; uses-left badges equal `abilities.usesLeft`; the Dismount button 44 px, 6 px under the Pink counter, centred on it. Test: input (corner layout, gaps, touch routing). | 1 bug, fixed |
| 7. Performance | Browser: draw calls and triangles per section; which objects reach the GPU. | Lightened |
| 8. Console | Browser: every console error and warning through all sections. | 2 warnings, fixed |

## What was fixed

1. **Boss health bar overlapped the HUD on narrower phones.** At 760×360 and 640×360 the bar
   ran into the quest panel and the Yellow gem counter. The same happened at 915×412 when the
   TEST button pushes the quest panel right. The bar now checks for room when it appears, on
   resize and when the quest text changes, and drops to a second row only when the top row is too
   tight (`.boss-bar.lower`).
2. **The far side of the map was always drawn.** The forest view also drew the whole desert
   terrain, and the desert view drew the forest terrain, trees, trail edges and town. Their big
   meshes can't be frustum-culled, and the fog hid them anyway. They are now in two draw zones
   that show by camera position (`CONFIG.world.zones`). The cave cliffs stay in both.
3. **The boss was drawn from the far end of the forest.** On guard and more than 100 from the
   arena (`boss.drawRange`), its skinned model is skipped.
4. **The sandstorm was heavy on fill rate.** It now has 110 wind streaks (was 150) and 18
   smaller dust clouds (was 28 at 9–18), with the same look and the same clear trail corridor.
   The fog was already the cheapest kind (linear), so it is unchanged.
5. **No safety net for slow phones.** Adaptive resolution: if the frame rate stays under 45 fps
   for 2 s, the pixel ratio steps down by 0.25 (not below 1). Above 57 fps it steps back up to the
   cap of 2 (`CONFIG.render.adaptive`).
6. **Console warning: `THREE.Clock` is deprecated.** The game loop now uses `THREE.Timer`, and
   a tab coming back from the background no longer causes a big time step.
7. **Console warning: `FBXLoader: Orthographic cameras not supported yet`.** `hero.fbx` carries
   a camera node the game never uses. That one message is filtered while Mixamo files are parsed.
8. **Build warning: one 1.1 MB chunk.** three.js now builds into its own chunk (~750 kB; the game
   code is ~370 kB), so the warning is gone and the engine stays cached between game updates.

## Measured (software WebGL, same camera spots, before → after)

| Section | Draw calls | Triangles | Frame time (swiftshader) |
|---|---|---|---|
| Forest start | 254 → 216 | 560k → 416k | 673 → 570 ms |
| Boss fight | 73 → 63 | 328k → 197k | 516 → 471 ms |
| Sandstorm | 197 → 73 | 477k → 185k | 674 → 189 ms |
| Gearhaven ride (added later) | 107 | 73k | 98 ms |

The absolute frame times are from software rendering, which is far slower than a phone GPU;
only the before/after ratio matters.

Whirlwinds and flying debris (added later): at the same spot in the sandstorm (Pixel 7 landscape,
pixel ratio 2), 402 ms per frame with them and 382 ms with them hidden (+17 draw calls, about +1k
triangles): about 5% of the frame in software rendering. The counts were kept (5 × 34 spiral
quads, 14 + 10 debris pieces); on a phone the adaptive pixel ratio still steps down if a frame
rate drop lasts.

## Not changed / notes

- "GPU stall due to ReadPixels" warnings come only from the headless driver while taking
  screenshots; they don't happen in a real browser.
- The debug jumps run at headless speed (about 2 frames a second), so the "Cave entrance"
  auto-dismount and the first skeleton group weren't reached in the few seconds the browser
  pass waited. The route, minions and chase tests cover them in game time.
- The ending summary after a debug jump shows 0 gems and 0:00, as expected (nothing was played).
