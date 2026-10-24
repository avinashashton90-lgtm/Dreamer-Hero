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

- [three.js](https://threejs.org) (MIT), including `FBXLoader` and `GLTFLoader`.
- [Vite](https://vitejs.dev) (MIT).

Everything else (world, effects) is built in code.
