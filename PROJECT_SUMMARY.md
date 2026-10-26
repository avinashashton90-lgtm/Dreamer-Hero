# Dreamer Hero — Project Summary (handoff)

Use this as the starting brief for a project folder. `CLAUDE.md` is now a short core file; detailed rules are split into `docs/` (part1, part2, architecture, debug-and-tests, progress) and are read only when needed. Story is in `STORY.md`.

## What it is
A Three.js + Vite browser game for **phones in landscape** (keyboard/mouse fallback on desktop), hosted on **GitHub Pages** (`base: './'`, output `dist/`, deployed by pushing to `main`). A bored schoolboy, **AJ** (cap, hoodie, Mixamo model), falls asleep and dreams he is a superhero. Repo: `avinashashton90-lgtm/dreamer-hero`.

## Working agreements
- `CLAUDE.md` is the source of truth. Update it whenever rules, architecture or progress change.
- All tunable numbers go in `src/config.js` (`CONFIG`); all story text in `DIALOGUE`. No magic numbers, no hard-coded strings.
- Every model comes from an async `loadXModel()` with a code-built placeholder fallback.
- Systems are decoupled (constructor args, no globals). One file per system in `src/`; Part 2 lives in `src/part2/` and is imported on demand.
- Performance: pixel ratio capped at 2 and adaptive, no shadow maps, fog, instancing, draw zones in Part 1.
- Git: no PR unless asked; no model identifiers in repo files; commit trailers as in recent commits.

## Part 1 (done)
Intro slides → rooftops → tree leaping → horse by the river → forest ride (hurdles, bats, gems, energy) → cave and **sealed-arena boss (Warrok)** → Amy's cutscene (hinted witch) → desert ride, exhaustion, **Lazarus Pit** → sandstorm chase with skeletons → castle gate cinematic → **portal scene** that carries AJ into Part 2.
- Hero: 3-hit combo, dodge roll, lock-on, Batarang / Smoke Bomb / Flash (gem economy, uses-left badges), 5 hearts + 3 respawns, Game Over → Retry.
- Boss: slam, fire breath, charge, stun, enrage, smoke paralysis, regen, slimes, corner rescue, leash, revive with protection.
- Sound: Web Audio manager with synthesized fallbacks for every sound/music section; drop-in files in `public/audio/`.
- Hidden `?debug` test menu (or hold the speaker button 3 s) jumps to every section.

## Part 2 — Gearhaven (in progress)
- Arrival in a brass courtyard under the Dream Clock; guide robot **Tick**; five element doors.
- **Gearhaven ride**: rails to grind, steam vents, belt deck, hammers, saws, cog platforms, conveyors, 42 gears, gear rewards (+heart, horse armour, bonus charge). Three switchable looks, silver engraved floor, Kenney Factory/Coaster/Castle kits.
- **Fire Element level (built)**: furnace-city ride, cog keys and chests, scouts and sword robots, Batarang (blue-gem ammo, auto-aim cone), Fire Blast (after the Element), Cog Shot, Gear Wheel, Shield (from a chest), **Furnace Guardian** boss in a sealed plaza, the Element scene with Amy's cameo, level-up system.
- Latest passes (P2-F11/F12): Stomp wave limited to the pillar ring and slower; Batarang ×1.5; Gear Wheel 3 gears (also in the plaza); plaza resupply of gears (10 s, max 4) and cog keys (25 s, max 2); Shield blocks the Stomp, a perfect block staggers; Guardian 68 HP, regen after 8 s at 1%/s; +1 heart on arena entry.

## Still to do
- Lightning, Steam, Magnet and Time element levels and Amy's final fight (all stubs now; see `STORY.md`).
- Part 3.
- Recorded music/sound files (synthesized fallbacks play today).
- A real play-test of the Guardian fight length (the 90–120 s target is estimated, not timed).

## Commands
`npm install`, `npm run dev` (`--host` for a phone), `npm run build`, `npm run preview`.
Headless tests: `test:route`, `test:combat`, `test:boss`, `test:minions`, `test:corner`, `test:saddle`, `test:input`, `test:ending`, `test:chase`, `test:hurdles`, `test:arena`, `test:audio`, `test:part2`, `test:fire`, `test:ride`, `test:energy`; `sim:boss`. `HERO_PLACEHOLDER=1` reruns them on placeholder models. Run the relevant suite plus a build before every push.

## Key files
`src/config.js` (all numbers and text), `main.js` (loop, test-menu jumps), `levelManager.js`, `story.js`, `boss.js`, `arena.js`, `hero.js`, `horse.js`, `abilities.js`, `minions.js`, `audio.js`/`soundscape.js`; Part 2: `part2/index.js`, `ride.js`, `fire.js`, `guardian.js`, `fireCombat.js`, `items.js`, `foes.js`, `looks.js`, `robots.js`, `tick.js`. Credits and licences are in `CREDITS.md`.
