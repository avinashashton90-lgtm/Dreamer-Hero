# Credits

## Hero character and animations — Mixamo

The hero is **AJ**, a character from [Mixamo](https://www.mixamo.com) (Adobe), with these Mixamo animations: idle (in `hero.fbx`), run, jump, running jump, two punches, kick, roll, throw, hit reaction, death, drink, riding and flying.

Files: `public/models/hero/*.fbx`. Mixamo characters and animations are provided by Adobe and are free to use in personal, commercial and non-profit projects under the [Adobe General Terms of Use](https://www.adobe.com/legal/terms.html) (see the [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)). They are not redistributed as standalone assets; they are part of this game.

AJ is shown as he comes, with his own textures. The only code-built prop on him is the cup he drinks from in the Lazarus Pit scene (`src/heroModel.js`); an optional code-built costume (`CONFIG.heroCostume`, off) is not part of the Mixamo assets.

## Girl — Mixamo

The girl (`public/models/girl/girl.glb`, Mixamo character Ch46) and her animations (`public/models/girl/*.fbx`: walk, talk, point, kneel, scared, happy, ride, cast, magic, float, fly, dodge, hit, death…) are from [Mixamo](https://www.mixamo.com) (Adobe), under the same terms as the hero above. `girl.glb` was converted from Mixamo's `girl.fbx` (textures resized to 1024 px; see `scripts/girl-to-glb.mjs`).

## Horse — Quaternius

The horse (`public/models/horse/horse.gltf`) is from the **Ultimate Animated Animal Pack** (July 2021) by [Quaternius](https://quaternius.com), licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). It is used as it comes: flat material colours, no textures, with its own clips (Idle, Idle_2, Idle_Headlow, Eating, Walk, Gallop, Gallop_Jump, Jump_toIdle, Attack_Headbutt, Attack_Kick, Idle_HitReact1/2, Death).

## Engine

- [three.js](https://threejs.org) (MIT), including `FBXLoader` and `GLTFLoader`.
- [Vite](https://vitejs.dev) (MIT).

Everything else (world, girl, monster, effects) is built in code.
