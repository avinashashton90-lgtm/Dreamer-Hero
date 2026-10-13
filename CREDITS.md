# Credits

## Hero character and animations — Mixamo

The hero is **AJ**, a character from [Mixamo](https://www.mixamo.com) (Adobe), with these Mixamo animations: idle (in `hero.fbx`), run, jump, running jump, two punches, kick, roll, throw, hit reaction, death, drink, riding and flying.

Files: `public/models/hero/*.fbx`. Mixamo characters and animations are provided by Adobe and are free to use in personal, commercial and non-profit projects under the [Adobe General Terms of Use](https://www.adobe.com/legal/terms.html) (see the [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)). They are not redistributed as standalone assets; they are part of this game.

AJ is shown as he comes, with his own textures. The only code-built prop on him is the cup he drinks from in the Lazarus Pit scene (`src/heroModel.js`); an optional code-built costume (`CONFIG.heroCostume`, off) is not part of the Mixamo assets.

## Engine

- [three.js](https://threejs.org) (MIT), including `FBXLoader`.
- [Vite](https://vitejs.dev) (MIT).

Everything else (world, horse, girl, monster, effects) is built in code.
