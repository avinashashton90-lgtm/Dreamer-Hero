import * as THREE from 'three';
import { CONFIG } from './config.js';

const CB = CONFIG.combat;

/** Placeholder lock-on marker: a flat gold ring laid on the ground under the target. */
export async function loadLockRingModel() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: CB.lockRingColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.renderOrder = 8;
  return ring;
}

/** Placeholder "dizzy" marker: little stars circling above a paralyzed head. */
export async function loadDizzyModel() {
  return makeDizzyModel();
}

/** (The same, built synchronously.) */
export function makeDizzyModel() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  const geo = new THREE.OctahedronGeometry(0.12, 0);
  for (let i = 0; i < 5; i++) {
    const star = new THREE.Mesh(geo, mat);
    const a = (i / 5) * Math.PI * 2;
    star.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45);
    group.add(star);
  }
  group.visible = false;
  return group;
}

/**
 * Hero melee: a 3-hit combo (punch, punch, heavy kick). Tapping Attack within
 * CONFIG.combat.comboWindow after a hit continues the combo (a tap during a hit is buffered).
 * Hits land only on targets in reach and roughly in front; the kick knocks back and briefly
 * freezes the action. A soft lock-on picks the nearest target in front and turns the hero
 * toward it when attacking. Flash Mode's lightning bolt (abilities.js) lands through
 * `hitTarget(…, { flash: true })` for the big shake and hit-stop.
 *
 * Targets (the boss…) implement: position, radius, height, hp, maxHp, alive,
 * takeHit({ amount, dirX, dirZ, knockback, heavy, flash, source }) → damage dealt.
 * Feedback goes out through `events.onHit({ target, amount, position, heavy, flash, shake, hitStop })`;
 * `events.onDefeat(target)` when a hit finishes one off (minions — `target.minion` — drop a gem).
 */
export class Combat {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./hero.js').Hero} hero
   * @param {{ onHit?: Function }} [events]
   */
  constructor(scene, hero, events = {}) {
    this.scene = scene;
    this.hero = hero;
    this.events = events;
    this.targets = [];
    this.abilities = null; // set by main
    this.lockTarget = null;
    this.reset();
  }

  async init() {
    this.ring = await loadLockRingModel();
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  reset() {
    this.step = -1; // current combo step (-1 = none)
    this.stepT = 0;
    this.lastStep = -1; // last finished step
    this.sinceStep = Infinity; // seconds since the last step finished
    this.queued = false;
    this.hitDone = false;
    this.hits = 0; // landed hits (stats / tests)
    this.lunge = null; // { x, z, left, speed }: the attack's step toward the lock-on target
    if (this.hero) {
      this.hero.attack = null;
      this.hero.moveScale = 1;
      this.hero.daggerDrawn = false;
    }
  }

  addTarget(t) {
    if (!this.targets.includes(t)) this.targets.push(t);
  }

  removeTarget(t) {
    this.targets = this.targets.filter((x) => x !== t);
    if (this.lockTarget === t) this.lockTarget = null;
  }

  get attacking() {
    return this.step >= 0;
  }

  /**
   * @param {number} dt
   * @param {{ attackPressed?: boolean }} input
   * @param {{ mounted?: boolean }} [ctx]
   */
  update(dt, input, ctx = {}) {
    const hero = this.hero;
    this.#updateLock();

    if (ctx.mounted || hero.riding || hero.dodgeT > 0) {
      if (this.step >= 0) this.#endStep();
      this.queued = false;
    } else if (input.attackPressed) {
      if (this.step >= 0) this.queued = true;
      else this.#startStep(this.lastStep >= 0 && this.lastStep < CB.combo.length - 1 && this.sinceStep <= CB.comboWindow ? this.lastStep + 1 : 0);
    }

    if (this.step >= 0) {
      const S = CB.combo[this.step];
      // The lunge (done before the hit frame).
      const L = this.lunge;
      if (L) {
        const m = Math.min(L.left, L.speed * dt);
        hero.position.x += L.x * m;
        hero.position.z += L.z * m;
        L.left -= m;
        if (L.left <= 1e-4) this.lunge = null;
      }
      this.stepT += dt;
      if (!this.hitDone && this.stepT >= S.hitAt) {
        this.hitDone = true;
        this.#strike(S);
      }
      hero.attack = { kind: S.kind, step: this.step, t: Math.min(1, this.stepT / S.duration) };
      if (this.stepT >= S.duration) {
        const next = this.step + 1;
        const chain = this.queued && next < CB.combo.length;
        this.#endStep();
        if (chain) this.#startStep(next);
      }
    } else {
      this.sinceStep += dt;
      if (this.sinceStep > CB.comboWindow) {
        this.lastStep = -1;
        hero.daggerDrawn = false;
      }
    }

    // Lock-on ring under the target.
    const t = this.lockTarget;
    this.ring.visible = !!t && !ctx.mounted;
    if (t) {
      this.ring.position.set(t.position.x, t.position.y + 0.06, t.position.z);
      this.ring.scale.setScalar(t.radius + 0.6);
    }
  }

  /**
   * Deals damage to a target with all the feedback (used by melee and abilities).
   * Returns the damage dealt.
   */
  hitTarget(target, { amount, dirX = 0, dirZ = 0, knockback = 0, heavy = false, flash = false, source = 'melee' }) {
    if (!target.alive) return 0;
    const dealt = target.takeHit({ amount, dirX, dirZ, knockback, heavy, flash, source });
    if (!dealt) return 0;
    if (!target.alive) this.events.onDefeat?.(target); // (minions drop a gem)
    this.hits++;
    const shake = flash ? CB.shake.flash : heavy ? CB.shake.heavy : CB.shake.light;
    const hitStop = flash ? CB.flashHitStop : heavy ? CB.hitStop : 0;
    const position = target.position.clone();
    position.y += target.height;
    this.events.onHit?.({ target, amount: dealt, position, heavy, flash, shake, hitStop, source });
    return dealt;
  }

  #startStep(i) {
    const hero = this.hero;
    this.events.onSwing?.(i); // (the swing's sound)
    this.step = i;
    this.stepT = 0;
    this.hitDone = false;
    this.queued = false;
    if (CONFIG.heroCostume) hero.daggerDrawn = true; // the costume's dagger is drawn for the combo
    hero.moveScale = CB.attackMoveScale;
    // Soft lock: turn toward the locked target and lunge up to CB.lunge toward it (stopping
    // CB.lungeStop short of its edge), so a hit thrown from a step or two away still lands.
    const t = this.lockTarget;
    this.lunge = null;
    if (t) {
      const dx = t.position.x - hero.position.x;
      const dz = t.position.z - hero.position.z;
      const d = Math.hypot(dx, dz);
      const edge = d - t.radius;
      if (edge < CB.combo[i].reach + CB.lunge + 1 && d > 1e-3) {
        hero.facing = Math.atan2(dx, dz);
        const left = Math.min(CB.lunge, Math.max(0, edge - CB.lungeStop));
        if (left > 0) this.lunge = { x: dx / d, z: dz / d, left, speed: left / CB.lungeTime };
      }
    }
  }

  #endStep() {
    this.lastStep = this.step;
    this.step = -1;
    this.lunge = null;
    this.sinceStep = 0;
    this.hero.attack = null;
    this.hero.moveScale = 1;
    if (this.lastStep >= CB.combo.length - 1) this.lastStep = -1; // combo finished
  }

  #strike(S) {
    const hero = this.hero;
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dx = t.position.x - hero.position.x;
      const dz = t.position.z - hero.position.z;
      const d = Math.hypot(dx, dz);
      if (d - t.radius > S.reach) continue;
      const dot = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (dot < CB.frontDot && d > t.radius + 0.3) continue; // not in front
      if (Math.abs(t.position.y - hero.position.y) > t.height + 0.5) continue;
      this.hitTarget(t, {
        amount: S.damage,
        dirX: d > 1e-3 ? dx / d : fx,
        dirZ: d > 1e-3 ? dz / d : fz,
        knockback: S.knockback,
        heavy: !!S.heavy,
      });
    }
  }

  /** Soft lock-on: the nearest living target within range that isn't behind the hero. */
  #updateLock() {
    const hero = this.hero;
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    let best = null;
    let bestD = CB.lockRange;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dx = t.position.x - hero.position.x;
      const dz = t.position.z - hero.position.z;
      const d = Math.hypot(dx, dz);
      if (d > CB.lockRange) continue;
      const dot = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      // Keep the current lock a little more readily (no flicker between targets).
      const score = d - (t === this.lockTarget ? 2 : 0);
      if (dot < CB.lockDot && t !== this.lockTarget) continue;
      if (score < bestD) {
        bestD = score;
        best = t;
      }
    }
    this.lockTarget = best;
  }
}
