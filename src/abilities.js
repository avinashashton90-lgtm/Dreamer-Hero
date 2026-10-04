// Hero super abilities. Unlocked by collecting gems (see gems.js / CONFIG.gems.abilities):
// yellow → 'batarang', blue → 'smokeBomb', pink → 'flashMode'. The abilities themselves come
// later; for now this only records what is unlocked (it persists through respawns).

export class Abilities {
  constructor(hero) {
    this.hero = hero;
    this.unlocked = new Set();
  }
  unlock(name) {
    this.unlocked.add(name);
  }
  has(name) {
    return this.unlocked.has(name);
  }
  /** New game only. */
  reset() {
    this.unlocked.clear();
  }
  update(_dt, _input) {}
}
