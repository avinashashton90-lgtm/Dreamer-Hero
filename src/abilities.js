// STUB — hero super abilities (e.g. super leap, dash, power punch for the boss fight).
// Tunables go in CONFIG.abilities once implemented.

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
  update(_dt, _input) {}
}
