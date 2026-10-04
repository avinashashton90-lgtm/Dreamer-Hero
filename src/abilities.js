import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeFadeMaterial, addFadeAttribute } from './world.js';

const AB = CONFIG.abilities;
const BT = AB.batarang;
const SB = AB.smokeBomb;
const FM = AB.flashMode;
const TH = AB.throw;

// ---------------------------------------------------------------------------
// Swappable placeholder models
// ---------------------------------------------------------------------------

/** Placeholder Batarang: a flat four-pointed star (spins about its vertical axis). */
export async function loadBatarangModel() {
  const shape = new THREE.Shape();
  const n = 4;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.32;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: BT.color, emissive: BT.color, emissiveIntensity: 0.4, flatShading: true }));
  mesh.scale.setScalar(BT.size);
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.spinner = mesh;
  return group;
}

/** Placeholder smoke bomb: a small dark ball (in flight) and a pool of soft puffs (the cloud). */
export async function loadSmokeModels(maxPuffs) {
  const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3a3550 }));
  const geo = new THREE.IcosahedronGeometry(1, 1);
  addFadeAttribute(geo, maxPuffs);
  const puffs = new THREE.InstancedMesh(geo, makeFadeMaterial({ color: SB.color, flatShading: true, depthWrite: false }), maxPuffs);
  puffs.frustumCulled = false;
  puffs.renderOrder = 9;
  puffs.count = 0;
  return { bomb, puffs };
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/**
 * Hero super abilities, unlocked by collecting gems (CONFIG.gems.abilities):
 * yellow → Batarang, blue → Smoke Bomb, pink → Flash Mode. Unlocks persist through respawns.
 *
 * - Batarang: thrown at the lock-on target (or forward), flies out on a curved path, hits the
 *   first enemy or solid object for small damage, then always comes back and is caught.
 * - Smoke Bomb: lobbed in an arc; bursts into a cloud. An enemy inside for `exposure` seconds
 *   is paralyzed for `paralyze` seconds.
 * - Flash Mode: an energy bar fills on landed hits and pink gems. When full, activating it
 *   charges a gold glow; the next landed punch takes 50% of the target's max HP.
 */
export class Abilities {
  /**
   * @param {import('./hero.js').Hero} hero
   * @param {THREE.Scene} [scene]
   * @param {import('./world.js').World} [world]
   * @param {import('./combat.js').Combat} [combat]
   */
  constructor(hero, scene = null, world = null, combat = null) {
    this.hero = hero;
    this.scene = scene;
    this.world = world;
    this.combat = combat;
    this.unlocked = new Set();
    this.batarang = null; // in-flight state
    this.pending = null; // { name, t } — a throw animation running; the item leaves the hand at TH.release
    this.lastSpawn = null; // { name, position, hand } (tests / debugging)
    this.bombs = []; // smoke bombs in flight
    this.clouds = []; // active smoke clouds
    this.cooldowns = { batarang: 0, smokeBomb: 0 };
    this.energy = 0; // Flash Mode 0..1
    this.charging = 0; // seconds left of the Flash charge-up
    this.armed = false; // next landed punch is a Flash punch
    this.stats = { batarangThrows: 0, batarangCatches: 0, batarangHits: 0, flashPunches: 0 };
    this.onEvent = null; // (name, detail) for sounds / UI
  }

  async init() {
    if (!this.scene) return;
    this.batModel = await loadBatarangModel();
    this.batModel.visible = false;
    const { bomb, puffs } = await loadSmokeModels(SB.puffs * 3);
    this.bombModel = bomb;
    this.bombModel.visible = false;
    this.puffs = puffs;
    this.scene.add(this.batModel, this.bombModel, this.puffs);
  }

  unlock(name) {
    this.unlocked.add(name);
  }

  has(name) {
    return this.unlocked.has(name);
  }

  /** New game only (unlocks are kept through respawns and Game Over). */
  reset() {
    this.unlocked.clear();
    this.clear();
    this.energy = 0;
  }

  /** Drops everything in flight (respawn); unlocks and energy are kept. */
  clear() {
    this.batarang = null;
    this.pending = null;
    this.hero.throwAnim = null;
    this.bombs = [];
    this.clouds = [];
    this.cooldowns.batarang = this.cooldowns.smokeBomb = 0;
    this.charging = 0;
    this.armed = false;
    this.hero.glow = 0;
    if (this.batModel) this.batModel.visible = false;
  }

  addFlashEnergy(amount) {
    if (this.charging > 0 || this.armed) return;
    this.energy = Math.min(1, this.energy + amount);
  }

  get flashReady() {
    return this.has('flashMode') && this.energy >= 1 && this.charging <= 0 && !this.armed;
  }

  /** A Batarang is being thrown, flying, or on its way back. */
  get batarangOut() {
    return !!this.batarang || this.pending?.name === 'batarang';
  }

  /** Can this ability be used right now? */
  ready(name) {
    if (!this.has(name)) return false;
    if ((name === 'batarang' || name === 'smokeBomb') && this.pending) return false; // mid-throw
    if (name === 'batarang') return !this.batarang && this.cooldowns.batarang <= 0;
    if (name === 'smokeBomb') return this.cooldowns.smokeBomb <= 0 && !this.hero.riding;
    if (name === 'flashMode') return this.flashReady && !this.hero.riding;
    return false;
  }

  /** Cooldown fraction left (0 = ready) for the button overlay. */
  cooldownFraction(name) {
    if (name === 'batarang') return this.batarangOut ? 1 : this.cooldowns.batarang / BT.cooldown;
    if (name === 'smokeBomb') return this.cooldowns.smokeBomb / SB.cooldown;
    return 0;
  }

  /** Use an ability (button / key). Returns true if it fired. */
  use(name) {
    if (!this.ready(name)) return false;
    if (name === 'batarang' || name === 'smokeBomb') {
      // Throw pose first; the item leaves the hand at the release point (see update).
      this.pending = { name, t: 0 };
      this.hero.throwAnim = { kind: 'throw', t: 0 };
      this.cooldowns[name] = name === 'batarang' ? BT.cooldown : SB.cooldown;
      this.#faceTarget();
    } else if (name === 'flashMode') {
      this.energy = 0;
      this.charging = FM.chargeTime;
    }
    this.onEvent?.(name);
    return true;
  }

  /** Called by Combat when a melee hit lands: true if this hit is the Flash punch. */
  consumeFlash() {
    if (!this.armed) return false;
    this.armed = false;
    this.stats.flashPunches++;
    return true;
  }

  update(dt) {
    this.cooldowns.batarang = Math.max(0, this.cooldowns.batarang - dt);
    this.cooldowns.smokeBomb = Math.max(0, this.cooldowns.smokeBomb - dt);
    if (this.charging > 0) {
      this.charging = Math.max(0, this.charging - dt);
      if (this.charging === 0) this.armed = true;
    }
    this.hero.glow = this.charging > 0 ? 1 - this.charging / FM.chargeTime : this.armed ? 0.75 + 0.25 * Math.sin(performance.now() * 0.012) : 0;
    // Throw / catch poses.
    const anim = this.hero.throwAnim;
    if (anim) {
      anim.t += dt;
      if (anim.t >= (anim.kind === 'throw' ? TH.duration : TH.catchTime)) this.hero.throwAnim = null;
    }
    if (this.pending) {
      this.pending.t += dt;
      if (this.pending.t >= TH.release) {
        const hand = this.hero.handPosition();
        if (this.pending.name === 'batarang') this.#throwBatarang(hand);
        else this.#throwSmoke(hand);
        this.lastSpawn = { name: this.pending.name, position: hand.clone(), hand: this.hero.handPosition() };
        this.pending = null;
      }
    }
    this.#updateBatarang(dt);
    this.#updateSmoke(dt);
  }

  /** On foot, turn to the lock-on target before throwing. */
  #faceTarget() {
    const t = this.combat?.lockTarget;
    const hero = this.hero;
    if (!t || !t.alive || hero.riding) return;
    hero.facing = Math.atan2(t.position.x - hero.position.x, t.position.z - hero.position.z);
  }

  // --- Batarang ---

  #aimPoint(range) {
    const hero = this.hero;
    const t = this.combat?.lockTarget;
    if (t && t.alive && Math.hypot(t.position.x - hero.position.x, t.position.z - hero.position.z) <= range + t.radius) {
      return new THREE.Vector3(t.position.x, t.position.y + t.height * 0.5, t.position.z);
    }
    const f = hero.forward(range);
    f.y = hero.position.y + BT.height;
    return f;
  }

  #throwBatarang(hand) {
    const start = hand.clone();
    const end = this.#aimPoint(BT.range);
    // Curve out to one side: control point off the straight line.
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const len = Math.hypot(dx, dz) || 1;
    const ctrl = new THREE.Vector3((start.x + end.x) / 2 - (dz / len) * BT.arc, (start.y + end.y) / 2 + 0.4, (start.z + end.z) / 2 + (dx / len) * BT.arc);
    this.batarang = { phase: 'out', u: 0, len: len + BT.arc, start, ctrl, end, pos: start.clone(), age: 0, hit: null };
    this.stats.batarangThrows++;
    if (this.batModel) {
      this.batModel.visible = true;
      this.batModel.position.copy(start);
    }
  }

  #updateBatarang(dt) {
    const b = this.batarang;
    if (!b) return;
    const hero = this.hero;
    b.age += dt;
    const hand = hero.handPosition(); // it comes back to the hand
    if (b.phase === 'out') {
      b.u = Math.min(1, b.u + (BT.speed * dt) / b.len);
      const u = b.u;
      const p = new THREE.Vector3()
        .addScaledVector(b.start, (1 - u) * (1 - u))
        .addScaledVector(b.ctrl, 2 * u * (1 - u))
        .addScaledVector(b.end, u * u);
      b.pos.copy(p);
      const hit = this.#batarangHit(p);
      if (hit || u >= 1) b.phase = 'back';
    } else {
      // Homing back to the hand, always faster than the hero (even at a gallop).
      const speed = Math.max(BT.returnSpeed, hero.moveSpeed * BT.chaseFactor + BT.returnSpeed * 0.5);
      const to = hand.clone().sub(b.pos);
      const d = to.length();
      if (d <= Math.max(BT.catchRadius, speed * dt)) {
        this.#catchBatarang();
        return;
      }
      b.pos.addScaledVector(to, (speed * dt) / d);
    }
    // Safety net: it always returns.
    if (b.age > BT.maxTime) {
      this.#catchBatarang();
      return;
    }
    if (this.batModel) {
      this.batModel.position.copy(b.pos);
      this.batModel.userData.spinner.rotation.y += BT.spin * dt;
    }
  }

  #catchBatarang() {
    this.batarang = null;
    this.stats.batarangCatches++;
    if (!this.pending) this.hero.throwAnim = { kind: 'catch', t: 0 };
    if (this.batModel) this.batModel.visible = false;
    this.onEvent?.('batarangCatch');
  }

  /** First enemy or solid object at p → hits it (enemies take damage). */
  #batarangHit(p) {
    const b = this.batarang;
    for (const t of this.combat?.targets ?? []) {
      if (!t.alive) continue;
      const d = Math.hypot(p.x - t.position.x, p.z - t.position.z);
      if (d < t.radius + BT.radius && p.y > t.position.y - 0.2 && p.y < t.position.y + t.height + 0.3) {
        const dx = p.x - this.hero.position.x;
        const dz = p.z - this.hero.position.z;
        const l = Math.hypot(dx, dz) || 1;
        this.combat.hitTarget(t, { amount: BT.damage, dirX: dx / l, dirZ: dz / l, knockback: 0.5, source: 'batarang' });
        this.stats.batarangHits++;
        b.hit = t;
        return true;
      }
    }
    const w = this.world;
    if (!w) return false;
    if (p.y < w.heightAt(p.x, p.z)) return (b.hit = 'ground');
    for (const c of w.cylinders) {
      if (Math.abs(p.x - c.x) > c.r + BT.radius || Math.abs(p.z - c.z) > c.r + BT.radius) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + BT.radius && p.y > c.bottom && p.y < c.top) return (b.hit = 'object');
    }
    for (const bx of w.boxes) {
      if (p.x > bx.minX && p.x < bx.maxX && p.z > bx.minZ && p.z < bx.maxZ && p.y > bx.bottom && p.y < bx.top) return (b.hit = 'object');
    }
    return false;
  }

  // --- Smoke Bomb ---

  #throwSmoke(hand) {
    const hero = this.hero;
    const start = hand.clone();
    const aim = this.#aimPoint(SB.throwRange);
    const end = new THREE.Vector3(aim.x, this.world ? this.world.groundAt(aim.x, aim.z, aim.y + 2).y : hero.position.y, aim.z);
    this.bombs.push({ start, end, t: 0 });
  }

  #updateSmoke(dt) {
    for (const b of this.bombs) {
      b.t += dt / SB.flightTime;
      if (b.t >= 1) {
        this.clouds.push({ x: b.end.x, y: b.end.y, z: b.end.z, age: 0, seed: Math.random() * 10 });
        this.onEvent?.('smokeBurst');
      }
    }
    this.bombs = this.bombs.filter((b) => b.t < 1);
    for (const c of this.clouds) c.age += dt;
    this.clouds = this.clouds.filter((c) => c.age < SB.duration);

    // Paralysis: an enemy that stays inside a cloud for `exposure` seconds.
    for (const t of this.combat?.targets ?? []) {
      if (!t.alive) continue;
      const inside = this.clouds.some((c) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < SB.radius + t.radius * 0.5);
      if (inside && !(t.paralyzed > 0)) {
        t.smokeExposure = (t.smokeExposure ?? 0) + dt;
        if (t.smokeExposure >= SB.exposure) {
          t.paralyze(SB.paralyze);
          t.smokeExposure = 0;
        }
      } else if (!inside) t.smokeExposure = 0;
    }

    // Visuals.
    if (this.bombModel) {
      const b = this.bombs[0];
      this.bombModel.visible = !!b;
      if (b) {
        this.bombModel.position.lerpVectors(b.start, b.end, b.t);
        this.bombModel.position.y += Math.sin(Math.PI * b.t) * SB.arcHeight;
      }
    }
    if (this.puffs) {
      const m = new THREE.Matrix4();
      const fade = this.puffs.geometry.attributes.instanceFade;
      let n = 0;
      for (const c of this.clouds) {
        const grow = Math.min(1, c.age / 0.4);
        const life = c.age / SB.duration;
        const alpha = SB.opacity * Math.min(1, (1 - life) * 4) * grow;
        for (let i = 0; i < SB.puffs && n < this.puffs.instanceMatrix.count; i++) {
          const a = (i / SB.puffs) * Math.PI * 2 + c.seed;
          const r = SB.radius * (0.25 + 0.55 * ((i * 37) % 10) / 10) * grow;
          const wob = Math.sin(c.age * 1.5 + i) * 0.3;
          const size = (1.1 + ((i * 13) % 7) * 0.12) * grow * (1 + life * 0.3);
          m.makeScale(size, size * 0.8, size).setPosition(c.x + Math.cos(a) * r + wob, c.y + 0.6 + ((i * 7) % 5) * 0.25 + life * 0.6, c.z + Math.sin(a) * r);
          this.puffs.setMatrixAt(n, m);
          fade.array[n++] = alpha;
        }
      }
      this.puffs.count = n;
      this.puffs.instanceMatrix.needsUpdate = true;
      fade.needsUpdate = true;
    }
  }
}
