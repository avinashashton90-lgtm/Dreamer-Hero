// Sound placeholders. Game systems call `sound.play(name)` at the right moments; for now
// nothing is audible — each call is counted and broadcast as a `dreamer-sound` window event
// so real audio (e.g. Howler or WebAudio buffers keyed by name) can be dropped in later.
//
// Names in use: 'splashStep' (hoof in water), 'splashEnter', 'splashExit' (horse steps
// into / out of the river), 'stumble' (horse hits an obstacle), 'gallopStart', 'eerie' (witch
// hint), 'paralyze' (Smoke Bomb), 'hum' (the Lazarus Pit wakes), 'heal' (the hero drinks).

export class Sound {
  constructor() {
    this.counts = {};
    this.muted = false;
  }

  /** @param {string} name  @param {object} [detail]  e.g. { volume, position } */
  play(name, detail = {}) {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    if (this.muted || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('dreamer-sound', { detail: { name, ...detail } }));
  }
}
