# Dreamer Hero

A Three.js + Vite browser game for **phones in landscape**. An average schoolboy dozes off in class and dreams he is a masked superhero in another world.

> Game story, rules and architecture live in [`CLAUDE.md`](CLAUDE.md).

## Play locally

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN to test on a phone)
npm run build      # production build in dist/
npm run preview    # serve the build
```

## Controls

| Action | Phone (landscape) | Desktop |
|---|---|---|
| Move | Drag on the left half (virtual joystick) | WASD / arrow keys |
| Look | Drag on the right half | Mouse drag |
| Jump | JUMP button (works while moving + looking) | Space |

Portrait mode shows a "rotate your phone" message and pauses the game.

## Project layout

```
index.html
src/
  main.js       bootstrap + game loop
  config.js     all tunable numbers + DIALOGUE text
  state.js      state machine: intro / play / cutscene / gameover / ending
  world.js      map layout, terrain, sky, river, buildings, trees, cave, colliders
  hero.js       hero movement & jumping
  camera.js     third-person follow camera
  input.js      joystick, camera drag, jump button, keyboard/mouse
  ui.js         HUD, rotate message, gameover & ending screens
  cutscene.js   slide cutscenes (intro)
  style.css     overlay/UI styles
  quests.js     objectives, objective arrow and beacon
  horse.js      the horse on the sand bank (riding comes later)
  gems.js abilities.js boss.js   (stubs for upcoming levels)
```

Placeholder models are built in `loadXModel()` functions (`loadHeroModel`, `loadTerrainModel`, `loadHorseModel`, …) so real glTF assets can be swapped in later.

Debug from the browser console: `game.state.set('ending')`, `game.hero.position`, etc.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs `npm ci` and `npm run build` on every push to `main` and publishes `dist/` to GitHub Pages. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

`vite.config.js` uses `base: './'`, so the build works from any Pages sub-path.
