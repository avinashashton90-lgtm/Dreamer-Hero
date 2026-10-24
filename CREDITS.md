# Credits

## Hero character and animations — Mixamo

The hero is **AJ**, a character from [Mixamo](https://www.mixamo.com) (Adobe), with these Mixamo animations: idle (in `hero.fbx`), run, jump, running jump, two punches, kick, roll, throw, hit reaction, death, drink, riding and flying.

Files: `public/models/hero/*.fbx`. Mixamo characters and animations are provided by Adobe and are free to use in personal, commercial and non-profit projects under the [Adobe General Terms of Use](https://www.adobe.com/legal/terms.html) (see the [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)). They are not redistributed as standalone assets; they are part of this game.

AJ is shown as he comes, with his own textures. The only code-built prop on him is the cup he drinks from in the Lazarus Pit scene (`src/heroModel.js`); an optional code-built costume (`CONFIG.heroCostume`, off) is not part of the Mixamo assets.

## Girl — Mixamo

The girl is **Amy** (`public/models/girl/girl.glb`, Mixamo character Ch46), shown as she comes; her animations (`public/models/girl/*.fbx`: walk, talk, point, kneel, scared, happy, ride, cast, magic, float, fly, dodge, hit, death…) are from [Mixamo](https://www.mixamo.com) (Adobe), under the same terms as the hero above. `girl.glb` was converted from Mixamo's `girl.fbx` (textures resized to 1024 px; see `scripts/girl-to-glb.mjs`).

## Boss — Mixamo

The cave monster is **Warrok** (`public/models/boss/boss.glb`) with his animations (`public/models/boss/*.fbx`: idle, walk, run, jump attack, swipe, punch, roar, hit, death) from [Mixamo](https://www.mixamo.com) (Adobe), under the same terms as the hero above. `boss.glb` was converted from Mixamo's `boss.fbx` (textures resized to 1024 px; see `scripts/girl-to-glb.mjs`).

## Horse — Quaternius

The horse (`public/models/horse/horse.gltf`) is from the **Ultimate Animated Animal Pack** (July 2021) by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). It is used as it comes: flat material colours, no textures, with its own clips (Idle, Idle_2, Idle_Headlow, Eating, Walk, Gallop, Gallop_Jump, Jump_toIdle, Attack_Headbutt, Attack_Kick, Idle_HitReact1/2, Death).

## Small enemies — Quaternius

The bat, skeleton and slime (`public/models/monsters/bat.fbx`, `skeleton.fbx`, `slime.fbx`) are from the **Animated Monster Pack** by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). They are used as they come (flat material colours, no textures), with their own clips: Bat_Flying / Attack / Attack2 / Hit / Death, Skeleton_Idle / Running / Attack / Spawn / Death, Slime_Idle / Walk / Attack / Death. (`dragon.fbx` from the same pack is in the folder but not used yet.)

## Tick — Quaternius

Tick, the brass guide robot (`public/models/gearhaven/tick/tick.glb`), is the **Animated Robot** by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain), with its own clips (Robot_Idle, Walking, Running, Jump, WalkJump, Punch, Wave, Yes, No, ThumbsUp, Dance, Sitting, Standing, Death). Converted from `tick.fbx` to a meshopt glb (`scripts/gearhaven-models.mjs`; the source is in `models-src/gearhaven/tick/`); in the game its yellow body is tinted a bright brass-yellow, its limbs copper, its goggles kept dark with a glowing cyan eye added.

## Gearhaven robots — Quaternius

The four mech robots **George, Leela, Mike and Stan** (`public/models/gearhaven/robots/*.glb`) are from the **Animated Mech Pack** by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain), with their own clips (Idle, Walk, Run, SwordSlash, Punch, Kick, Shoot, HitRecieve, Death and more). Converted from the pack's glTF files to meshopt glb with 1024 px textures (512 px for Leela) by `scripts/gearhaven-models.mjs` (the sources are in `models-src/gearhaven/robots/`); in the game they keep their own texture colours, with brass and copper accents added (trim, joints, the boss's plates) and glowing eyes. Leela is the scout, Mike and Stan the sword robots, George the armoured mech boss.

## Gearhaven kits — Kenney

From [Kenney](https://kenney.nl), each licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain):

- **Factory Kit** (`public/models/gearhaven/factory/glb/`): conveyors, pipes, cogs, catwalks, machines, boxes, hoppers, cranes, robot arms — the Gearhaven ride's conveyor belts, the pipes and stacks by its steam vents, the gear deck's catwalk, side decoration, turning cogs; the skyline's pipes.
- **Coaster Kit** (`public/models/gearhaven/rails/glb/`): the Monorail and Steel track pieces (straight, hill beginning / end as the slopes) and supports — the ride's grind rails. The kit has only its one palette texture, so in the game the Monorail track is tinted brass, the Steel track copper and the supports dark bronze.
- **Castle Kit** (`public/models/castle/glb/`): walls, towers, gates and flags — the castle at the end of Part 1 (its own colours; the gate leaves cut from the kit's gate) and, tinted brass, Gearhaven's distant skyline.

In the game the Factory Kit's blue / orange palette is re-tinted brass and copper in one shader (`src/kits.js`); only the pieces a level uses are loaded.

## Gear props — Quaternius, Poly Pizza

In `public/models/gearhaven/props/`:

- `gear_collectible.glb` — **Collectible Gear** by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): the brass gears collected in Gearhaven.
- `gear_01.glb` — Gear by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/0icYC-GPiro) *(the exact text of `Attribution_gear_01.txt`)*: turning in the sky and on the walls.
- `gear_cluster.glb`, `gear_spiky.glb` — via [Poly Pizza](https://poly.pizza). **No `Attribution_*.txt` file came with these two**: add the author and licence here (and to `DIALOGUE.credits` in `src/config.js`, which the in-game Credits screen shows) once known. `gear_spiky` is the spinning saw in the Gearhaven ride.

The in-game **Credits** screen (a small button on the intro and the ending screens) lists every pack above with its licence.

## Sound and music

Every sound effect, music track and voice blip is currently **synthesized in code** with the Web
Audio API (`src/sfx.js` for the effects, voice efforts and blips, `src/music.js` for the looping
music; no samples, no third-party audio). Real recordings can replace any of them by name: drop a
file into `public/audio/` as listed in `public/audio/README.md`, and add its source and licence
here.

| Sound | Source | Licence |
|---|---|---|
| All effects, music, voice blips and efforts | Synthesized in code (Dreamer Hero) | Part of this game |

## Engine

- [three.js](https://threejs.org) (MIT), including `FBXLoader`, `GLTFLoader` and the meshopt decoder.
- [Vite](https://vitejs.dev) (MIT).

Everything else (world, effects, the clock tower) is built in code.
