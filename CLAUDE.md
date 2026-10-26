# Dreamer Hero — Game Spec (core)

> **Claude: read only this file at session start.** Open a file in `docs/` only when the task needs it, and read just the relevant section (use Grep on the system name). Do not read STORY.md unless building Part 2/3 story content.

## What it is
Three.js + Vite browser game for **phones in landscape** (keyboard/mouse fallback), hosted on **GitHub Pages** (Vite `base: './'`, output `dist/`, deploy = push to `main`). AJ, a bored schoolboy, dreams he is a superhero. Part 1 (rooftops → forest ride → sealed boss arena → desert → portal) is finished. Part 2 (Gearhaven): arrival, ride and the Fire Element level with the Furnace Guardian are built; Lightning, Steam, Magnet, Time and Amy's final fight are stubs. See `PROJECT_SUMMARY.md`.

## Docs index (read on demand)
| File | Read it when |
|---|---|
| `docs/part1.md` | touching anything in Part 1: hero, combat, abilities, boss, arena, minions, horse, desert, controls, sound, map |
| `docs/part2.md` | touching Gearhaven, the ride, the Fire level, Guardian, Arsenal, items, gear rewards |
| `docs/architecture.md` | you need to know which file owns what |
| `docs/debug-and-tests.md` | running tests, `?debug` menu, debug keys |
| `docs/progress.md` | checking what is done / left |
| `STORY.md` | writing Part 2/3 story or dialogue |

## Rules that always apply
- All tunable numbers in `src/config.js` (`CONFIG`); all story/dialogue text in `DIALOGUE`. No magic numbers or hard-coded strings.
- Every model comes from an async `loadXModel()` with a code-built placeholder fallback.
- Systems are decoupled (constructor args, no globals); one file per system in `src/`; Part 2 lives in `src/part2/`, imported on demand.
- Performance: pixel ratio capped 2 and adaptive, no shadow maps, fog, instancing.
- Game states: `intro`, `play`, `cutscene`, `gameover`, `ending` (`src/state.js`).
- Change only what the user asks. Leave Part 1 and earlier levels alone in Part 2 fix rounds.
- Before pushing: `npm run build` plus the one relevant test suite (list in `docs/debug-and-tests.md`). Commit and push to `main`; no PRs unless asked; no model names in repo files.
- After a change, add a short note to the matching `docs/` file (and `docs/progress.md` if a milestone moves). Keep this core file short.

## Commands
`npm install` · `npm run dev` (`--host` for a phone) · `npm run build` · `npm run preview` · tests: `test:route|combat|boss|minions|corner|saddle|input|ending|chase|hurdles|arena|audio|part2|fire|ride|energy`, `sim:boss`. `HERO_PLACEHOLDER=1` reruns on placeholder models.
