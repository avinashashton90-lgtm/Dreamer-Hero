import * as THREE from 'three';
import { CONFIG } from './config.js';

const R = CONFIG.corner;

/**
 * Placeholder rescue pulse: an expanding ring on the ground and a bright shell round the hero
 * (additive, no lights). Unit size at its origin; `userData` = { ring, shell }.
 */
export async function loadRescuePulseModel() {
  const group = new THREE.Group();
  const add = (geo, color, order) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.renderOrder = order;
    group.add(m);
    return m;
  };
  const ring = add(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), R.pulse.color, 8);
  ring.position.y = R.pulse.lift;
  const shell = add(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), R.pulse.glow, 9);
  group.userData = { ring, shell };
  group.visible = false;
  return group;
}

/**
 * Corner rescue: when the hero on foot is pinned against a rock or wall with enemies close by
 * for `pinTime` s, a pulse pushes the enemies back (minions `minionPush`; the boss `bossPush` and
 * into its recovery) with a visible ring, then rests for `cornerRescueCooldown` s.
 * Enemies: the boss (`rescueRecover`) and the minions (`knockback`; slimes hop away).
 */
export class CornerRescue {
  /** @param {{ hero, boss?, minions?, onPulse? }} deps */
  constructor(scene, world, deps) {
    this.scene = scene;
    this.world = world;
    this.deps = deps;
    this.pinnedT = 0; // seconds pinned so far
    this.cooldown = 0;
    this.effectT = -1; // seconds since the last pulse (-1: none showing)
    this.pulses = 0;
    this.pinned = false;
    this.mountedCooldown = 0;
    this.surroundT = 0; // seconds surrounded on horseback
    this.rears = 0;
    this.rearKills = 0;
  }

  async init() {
    this.model = await loadRescuePulseModel();
    this.scene.add(this.model);
  }

  reset() {
    this.pinnedT = 0;
    this.cooldown = 0;
    this.effectT = -1;
    this.pinned = false;
    this.mountedCooldown = 0;
    this.surroundT = 0;
    if (this.model) this.model.visible = false;
  }

  /** Living ground enemies whose body is within `range` of a body of `radius` at `at` (default: the hero). */
  #enemies(range, at = this.deps.hero.position, radius = CONFIG.hero.radius) {
    const out = [];
    const add = (t) => {
      const d = Math.hypot(t.position.x - at.x, t.position.z - at.z) - (t.radius ?? 0) - radius;
      if (d <= range) out.push(t);
    };
    const boss = this.deps.boss;
    if (boss?.alive && boss.state !== 'guard') add(boss);
    for (const m of this.deps.minions?.list ?? []) if (m.alive && !m.removed && !m.flying) add(m);
    return out;
  }

  /** @param {{ onFoot: boolean, riding?: boolean }} ctx */
  update(dt, ctx) {
    const hero = this.deps.hero;
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Riding and surrounded: the horse rears up with a shockwave (its own cooldown).
    const MR = R.mounted;
    const horse = this.deps.horse;
    this.mountedCooldown = Math.max(0, this.mountedCooldown - dt);
    const ringed = ctx.riding && horse ? this.#enemies(MR.range, horse.position, CONFIG.horse.radius).length >= MR.count : false;
    this.surroundT = ringed ? this.surroundT + dt : 0;
    if (this.surroundT > MR.time && this.mountedCooldown <= 0) this.rearUp();
    const H = CONFIG.hero;
    this.pinned = !!ctx.onFoot && !hero.riding && !(hero.deathT >= 0) &&
      this.world.solidsNear(hero.position, H.radius, R.pinGap, H.height).length > 0 &&
      this.#enemies(R.enemyRange).length > 0;
    this.pinnedT = this.pinned ? this.pinnedT + dt : 0;
    if (this.pinnedT >= R.pinTime && this.cooldown <= 0) this.pulse();
    this.#animate(dt);
  }

  /**
   * Surrounded on horseback: the horse rears up and a shockwave knocks every ground enemy within
   * `mounted.knockRadius` back (`knock`) and defeats the skeletons within `defeatRadius` (each
   * drops its gem); then `mountedRescueCooldown` s.
   */
  rearUp() {
    const horse = this.deps.horse;
    const MR = R.mounted;
    const { x, z } = horse.position;
    for (const t of this.#enemies(MR.knockRadius, horse.position, CONFIG.horse.radius)) {
      if (t === this.deps.boss) continue;
      const dx = t.position.x - x;
      const dz = t.position.z - z;
      const l = Math.hypot(dx, dz) || 1;
      if (t.type === 'skeleton' && l - t.radius - CONFIG.horse.radius <= MR.defeatRadius) {
        t.die?.();
        this.rearKills++;
      } else t.knockback?.(dx / l, dz / l, MR.knock);
    }
    horse.rearUp?.();
    this.mountedCooldown = MR.mountedRescueCooldown;
    this.surroundT = 0;
    this.rears++;
    this.effectT = 0;
    this.model.position.set(x, this.world.heightAt(x, z), z);
    this.deps.onRear?.();
  }

  /** The rescue pulse: enemies near the hero pushed back, the boss into its recovery. */
  pulse() {
    const hero = this.deps.hero;
    const hx = hero.position.x;
    const hz = hero.position.z;
    for (const t of this.#enemies(R.pushRadius)) {
      if (t === this.deps.boss) {
        t.rescueRecover(hx, hz, R.bossPush);
        continue;
      }
      const dx = t.position.x - hx;
      const dz = t.position.z - hz;
      const l = Math.hypot(dx, dz) || 1;
      t.knockback?.(dx / l, dz / l, R.minionPush);
      if (t.type === 'slime') t.set('hopAway');
    }
    this.cooldown = R.cornerRescueCooldown;
    this.pinnedT = 0;
    this.pulses++;
    this.effectT = 0;
    this.model.position.set(hx, this.world.heightAt(hx, hz), hz);
    this.deps.onPulse?.();
  }

  #animate(dt) {
    const m = this.model;
    if (!m || this.effectT < 0) return;
    this.effectT += dt;
    const f = this.effectT / R.pulse.time;
    if (f >= 1) {
      this.effectT = -1;
      m.visible = false;
      return;
    }
    m.visible = true;
    const { ring, shell } = m.userData;
    const ease = 1 - (1 - f) * (1 - f);
    const P = R.pulse;
    ring.scale.setScalar(P.ringStart + ease * P.radius);
    ring.material.opacity = P.opacity * (1 - f);
    shell.scale.set(P.shell[0] + ease * P.shell[1], P.shell[2] + ease * P.shell[3], P.shell[0] + ease * P.shell[1]);
    shell.material.opacity = P.opacity * P.shellOpacity * (1 - f) * (1 - f);
  }
}
