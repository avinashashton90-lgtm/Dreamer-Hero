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
1. **Cartoon intro** — slides: dull student at desk → drowsy → dozing off → the dream begins. Tap to advance, Skip button.
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
- Hero falls below `CONFIG.world.killY` → gameover. Gameover → tap to retry (back to play).
- Controls (touch): left-half virtual joystick moves; right-half drag rotates camera; Jump button (multi-touch: move + look + jump at once).
- Controls (keyboard fallback): WASD / arrows move, Space jumps, mouse drag rotates camera.
- Portrait orientation shows a "rotate your phone" overlay and pauses the game.

## Architecture (one file per system, all in `/src`)
| File | Responsibility |
|---|---|
| `config.js` | **All tunable numbers** + the `DIALOGUE` object (all text/dialogue). |
| `state.js` | Game state machine (`intro/play/cutscene/gameover/ending`) with enter/exit listeners. |
| `world.js` | Scene, lights, fog, terrain (`heightAt(x,z)`), `loadTerrainModel()`. |
| `hero.js` | Hero movement, gravity, jump, terrain collision, `loadHeroModel()`. |
| `camera.js` | Third-person follow camera with yaw/pitch orbit. |
| `input.js` | Joystick, camera drag, jump button, keyboard & mouse; unified input state. |
| `ui.js` | DOM overlays: HUD, rotate-phone message, gameover/ending screens. |
| `cutscene.js` | Slide-based cutscenes (intro, girl scene) with tap-to-advance + Skip. |
| `horse.js` | Horse (mount/ride) — `loadHorseModel()`. *(stub)* |
| `gems.js` | Collectible gems — `loadGemModel()`. *(stub)* |
| `abilities.js` | Hero super abilities. *(stub)* |
| `boss.js` | Cave monster boss — `loadBossModel()`. *(stub)* |
| `quests.js` | Level/quest progression through Part 1 flow. *(stub)* |
| `main.js` | Bootstraps systems and runs the game loop. |

### Conventions
- **No magic numbers** in systems — add them to `CONFIG` in `config.js`.
- **No hard-coded strings** for story/dialogue — add them to `DIALOGUE` in `config.js`.
- Every placeholder model is created by an async `loadXModel()` function returning a `THREE.Object3D`, so a real glTF can be swapped in later without touching game logic.
- Keep systems decoupled: they receive what they need via `init(...)`/constructor args, not globals.

## Progress
- [x] Foundation: state machine, capsule hero on terrain, follow camera, joystick, jump, rotate message, keyboard fallback, intro slides.
- [ ] Rooftops level
- [ ] Tree leaping
- [ ] Horse & river
- [ ] Forest ride + gems
- [ ] Cave + boss
- [ ] Girl/witch cutscene
- [ ] Desert ride
- [ ] "To be continued" ending (screen exists; flow not wired)

## Commands
- `npm install` · `npm run dev` (use `--host` to test on a phone on the LAN) · `npm run build` · `npm run preview`
