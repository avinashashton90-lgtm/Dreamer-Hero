# Dreamer Hero

A Three.js + Vite browser game for **phones in landscape**. An average schoolboy dozes off in class and dreams he is a masked superhero in another world.

> Game story, rules and architecture live in [`CLAUDE.md`](CLAUDE.md).

## Play locally

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN to test on a phone)
npm run build      # production build in dist/
npm run preview    # serve the build
npm run test:route # headless check: jump route fair + completable, and the full horse ride (jumps, all gems, ford, walls, cave)
npm run test:combat # headless check: combo, dodge, Batarang, Smoke Bomb, Flash Mode, hearts/respawns/Game Over
npm run test:boss   # headless check: every boss state (slam, fire breath, charge…), boulder stun, paralysis, Flash, death + respawn, defeat
npm run test:input  # headless check: multi-touch routing (joystick + camera + buttons at once)
```

## Controls

| Action | Phone (landscape) | Desktop |
|---|---|---|
| Move | Drag on the left half (virtual joystick) | WASD / arrow keys |
| Ride | Joystick left/right steers, push to go, pull back to brake | A/D steer, W go, S brake |
| Look | Drag on the right half | Mouse drag |
| Jump | Jump button (works while moving + looking) | Space |
| Attack (3-hit combo) | Attack button (large, bottom-right) | J |
| Dodge roll | Dodge button | K |
| Batarang / Smoke Bomb / Flash Mode | Small ability buttons around Attack (unlock with 5 gems of a colour) | 1 / 2 / 3 |
| Debug: all gems / hurt the hero / teleport to the arena / kill the boss | — | G / H / T / B |
| Mount / dismount the horse | Mount button (appears near the horse) | E |
| Gallop (hold, uses stamina) | Gallop button (while riding) | Shift |

Portrait mode shows a "rotate your phone" message and pauses the game.

## Project layout

```
index.html
src/
  main.js       bootstrap + game loop
  config.js     all tunable numbers + DIALOGUE text
  state.js      state machine: intro / play / cutscene / gameover / ending
  world.js      map layout, terrain, sky, river, buildings, trees, trail edges, obstacles, cave, colliders
  track.js      the forest ride trail: curve, sampling, nearest-point queries
  hero.js       hero movement & jumping
  camera.js     third-person follow camera with collision
  input.js      joystick, camera drag, Jump/Mount/Gallop buttons, keyboard/mouse
  ui.js         HUD, rotate message, gameover & ending screens
  cutscene.js   slide cutscenes (intro)
  style.css     overlay/UI styles
  quests.js     objectives, objective arrow and beacon
  guides.js     landing ring and next-branch glow while jumping
  horse.js      the horse: mount/dismount, riding, gallop, obstacles, dust & splashes, checkpoints
  audio.js      sound placeholders (events only for now)
  gems.js       collectible gems (yellow/blue/pink) and ability unlocks
  abilities.js  Batarang, Smoke Bomb, Flash Mode (unlocked by gems)
  combat.js     melee combo, lock-on, hit feedback
  lives.js      hearts and respawns
  boss.js       the cave monster fight (and the girl at the cave mouth)
```

Placeholder models are built in `loadXModel()` functions (`loadHeroModel`, `loadTerrainModel`, `loadHorseModel`, …) so real glTF assets can be swapped in later.

The forest ride follows one trail spline: a 14-wide, ~1544-long dirt trail (at least `CONFIG.trailLength` = 1500; about 94 s at normal speed, ~64 s galloping) from the river to the cave, with wide curves, a hill climb and descent, a river ford half way, 6 jumpable logs/walls on straights, and 60 gems in rows and arcs along the centre lane. Trees stay outside a 22-wide corridor behind a continuous line of bushes and boulders, and invisible side walls keep the horse on the trail (it slides along them).

The hero has 5 hearts and 3 respawns: losing all hearts puts you back on the horse at the last checkpoint; after the third respawn it's Game Over (Retry restarts the ride). At the end of the ride the hero gets off at the cave arena and fights the cave monster (fist slam, fire breath, charge into boulders, faster below 40% HP); defeat it and a girl appears at the cave mouth.

Debug from the browser console: `game.state.set('ending')`, `game.hero.position`, etc.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs `npm ci` and `npm run build` on every push to `main` and publishes `dist/` to GitHub Pages. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

`vite.config.js` uses `base: './'`, so the build works from any Pages sub-path.
