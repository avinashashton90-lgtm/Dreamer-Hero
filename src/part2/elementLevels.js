import { CONFIG, DIALOGUE } from '../config.js';

// The Lightning and Steam levels reuse the Fire level's machinery (fire.js): their settings (CONFIG.part2.elementLevels.<id>.fire and
// DIALOGUE.part2.elementLevels.<id>) are deep-merged IN PLACE over CONFIG.part2.fire / DIALOGUE.part2.fire while the level is active, so every
// system that reads those objects follows; `off()` puts the originals back (Fire is untouched whenever it is the one in use).


function merge(target, src, undo) {
  for (const [k, v] of Object.entries(src)) {
    const old = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && old && typeof old === 'object' && !Array.isArray(old)) merge(old, v, undo);
    else {
      undo.push(() => (target[k] = old));
      target[k] = v;
    }
  }
}

export class LevelOverlay {
  constructor(id) {
    this.id = id;
    this.undo = null;
  }

  get def() {
    return CONFIG.part2.elementLevels[this.id] ?? null;
  }

  on() {
    if (this.undo || !this.def) return;
    this.undo = [];
    merge(CONFIG.part2.fire, this.def.fire, this.undo);
    merge(DIALOGUE.part2.fire, DIALOGUE.part2.elementLevels[this.id] ?? {}, this.undo);
  }

  off() {
    if (!this.undo) return;
    for (const f of this.undo.reverse()) f();
    this.undo = null;
  }
}

