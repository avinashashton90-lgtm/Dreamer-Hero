import { CONFIG } from './config.js';

const LV = CONFIG.lives;

/**
 * Hearts and respawns. The hero has `hearts` hearts plus `respawns` extra lives. At zero
 * hearts one respawn is used (back on the horse at the last trail checkpoint, full hearts,
 * gems and unlocks kept); with none left it's Game Over (Retry restarts the ride).
 */
export class Lives {
  /** @param {{ onChange?: Function }} [events]  onChange(lives) after any change */
  constructor(events = {}) {
    this.events = events;
    this.deaths = 0; // all deaths this game (kept through Retry; cleared by newGame)
    this.reset();
  }

  /** Play Again: hearts, respawns and the death count all back to the start. */
  newGame() {
    this.deaths = 0;
    this.reset();
  }

  /** Full hearts and all respawns (new game, or Retry after Game Over). */
  reset() {
    this.hearts = LV.hearts;
    this.respawns = LV.respawns;
    this.dead = false;
    this.events.onChange?.(this);
  }

  get maxHearts() {
    return LV.hearts;
  }

  /**
   * Take damage (in hearts). Returns true if this blow emptied the hearts (death).
   * The caller checks invincibility (dodge / just hurt) first.
   */
  damage(amount = 1) {
    if (this.dead || amount <= 0) return false;
    this.hearts = Math.max(0, this.hearts - amount);
    if (this.hearts === 0) {
      this.dead = true;
      this.deaths++;
    }
    this.events.onChange?.(this);
    return this.dead;
  }

  /**
   * After a death: use one respawn (full hearts) and return 'respawn', or return 'gameover'
   * when none are left.
   */
  resolveDeath() {
    if (!this.dead) return null;
    if (this.respawns > 0) {
      this.respawns--;
      this.hearts = LV.hearts;
      this.dead = false;
      this.events.onChange?.(this);
      return 'respawn';
    }
    return 'gameover';
  }
}
