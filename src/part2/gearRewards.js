import { CONFIG } from '../config.js';

// Gearhaven's gear rewards (CONFIG.part2.gearRewardTiers / gearRewards / gearsInLevel): each
// level has `gearsInLevel` brass gears; reaching a tier's share of them (`at`, a fraction of the
// level's total, rounded up — so the tiers scale with any level) unlocks its reward for the rest
// of Part 2: `heart` (+1 max heart and a full heal), `armour` (the horse's brass plates: less
// damage, shorter stumbles) — each once —, and `charge` (every gear of a level: a bonus ability
// charge for that level's element, and a soft golden glow round Tick). Part2 keeps one of these
// across its sections and applies it in every level; missing gears never blocks anything.

const P2 = CONFIG.part2;
const GR = P2.gearRewards;

/** A level of `total` gears: its tiers [{ reward, at, count }] (count: the gears needed). */
export function gearTiers(total) {
  return P2.gearRewardTiers.map((t) => ({ ...t, count: Math.ceil(t.at * total - 1e-9) }));
}

export class GearRewards {
  constructor() {
    this.reset();
  }

  /** A new game: nothing unlocked. */
  reset() {
    this.unlocked = new Set(); // 'heart', 'armour', 'charge'
    this.charges = {}; // element → bonus ability charges
    this.best = {}; // level → the most gears collected in it in one go
  }

  has(reward) {
    return this.unlocked.has(reward);
  }

  /**
   * `count` of a level's `total` gears are collected now: the tiers reached unlock (a charge for
   * `element` once per level). Returns the rewards just unlocked (for the banner and the chime).
   */
  progress(level, count, total, element = level) {
    this.best[level] = Math.max(this.best[level] ?? 0, count);
    const now = [];
    for (const t of gearTiers(total)) {
      if (count < t.count) continue;
      if (t.reward === 'charge') {
        const key = `charge:${level}`;
        if (this.unlocked.has(key)) continue;
        this.unlocked.add(key);
        this.unlocked.add('charge');
        this.charges[element] = (this.charges[element] ?? 0) + GR.charges;
      } else if (this.unlocked.has(t.reward)) continue;
      else this.unlocked.add(t.reward);
      now.push(t.reward);
    }
    return now;
  }

  get bonusHearts() {
    return this.has('heart') ? GR.heart : 0;
  }

  /** Bonus ability charges waiting for `element`'s level. */
  bonusCharges(element) {
    return this.charges[element] ?? 0;
  }
}
