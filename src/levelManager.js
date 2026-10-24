// The level manager: the game's chapters — "part1" (the forest, the cave, the desert: main.js's
// own loop and World) and "part2" (Gearhaven: src/part2/, its own scene and loop). Each chapter is
// { id, scene, enter(opts), exit(), update?(dt, realDt, ctx) }; a loader builds it the first time
// it is asked for (Part 2's code is imported only then, into its own chunk, so nothing in it can
// break Part 1's start). Switching runs the old chapter's exit() and the new one's enter(opts).

export class LevelManager {
  /** @param {Record<string, () => Promise<object>>} loaders  chapter id → builds the chapter */
  constructor(loaders) {
    this.loaders = loaders;
    this.chapters = new Map();
    this.current = null;
    this.id = null;
    this.switching = null; // the load in progress (a Promise)
  }

  /** The chapter `id`, built on first use (null if it failed to load: the game stays where it is). */
  async get(id) {
    if (this.chapters.has(id)) return this.chapters.get(id);
    try {
      const chapter = await this.loaders[id]();
      this.chapters.set(id, chapter);
      return chapter;
    } catch (err) {
      console.error(`Chapter "${id}" failed to load`, err);
      return null;
    }
  }

  /** Switch to chapter `id` (or restart it at `opts.start`). Resolves with the chapter, or null. */
  async load(id, opts = {}) {
    const run = async () => {
      const next = await this.get(id);
      if (!next) return null;
      if (this.current && this.current !== next) this.current.exit?.(id);
      this.current = next;
      this.id = id;
      await next.enter?.(opts);
      return next;
    };
    // (one switch at a time)
    this.switching = (this.switching ?? Promise.resolve()).then(run, run);
    return this.switching;
  }

  get scene() {
    return this.current?.scene ?? null;
  }
}
