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

/**
 * Placeholder smoke bomb: a small dark ball (in flight), soft green powder puffs (layered,
 * additive), glittering crystal sparks (tiny bright diamonds), the inhaled powder stream,
 * and the per-enemy head glow and timer ring geometry. No lights — all additive particles.
 */
export async function loadSmokeModels() {
  const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2e5a36 }));
  const pool = (geo, max, color, emissive = color) => {
    addFadeAttribute(geo, max);
    const mesh = new THREE.InstancedMesh(
      geo,
      makeFadeMaterial({ color, emissive, emissiveIntensity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true }),
      max,
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.count = 0;
    return mesh;
  };
  const maxPuffs = SB.puffs * SB.layers.length * SB.maxClouds;
  const puffs = pool(new THREE.IcosahedronGeometry(1, 1), maxPuffs, 0xffffff, SB.powderGlow); // tinted per instance
  const sparks = pool(new THREE.OctahedronGeometry(1, 0).scale(0.6, 1, 0.6), SB.sparks * SB.maxClouds + SB.burst.count * 2, SB.sparkColor);
  const stream = pool(new THREE.IcosahedronGeometry(1, 0), SB.stream.max, SB.stream.color);
  return { bomb, puffs, sparks, stream };
}

/** Placeholder green glow around a beast's head (additive sphere). */
export async function loadSmokeGlowModel() {
  return makeSmokeGlow();
}

function makeSmokeGlow() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: SB.glow.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.renderOrder = 9;
  m.visible = false;
  return m;
}

/** Placeholder paralysis timer ring (flat, drawn as a shrinking arc via drawRange). */
export async function loadSmokeRingModel() {
  return makeSmokeRing();
}

function makeSmokeRing() {
  const R = SB.ring;
  const geo = new THREE.RingGeometry(R.radius - R.width, R.radius, 48, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: R.color, transparent: true, opacity: R.opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.renderOrder = 8;
  m.visible = false;
  m.userData.indexCount = geo.index.count;
  return m;
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
 * - Flash Mode: a one-shot charge. The bar starts full; using Flash costs 5 pink gems and 30%
 *   of the hero's hearts (only if he has more than that — never lethal), empties the bar
 *   (it reloads over flashReloadSeconds), charges a gold glow, and the next landed punch takes
 *   50% of the target's max HP.
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
    this.energy = 1; // Flash Mode bar 0..1 (full = ready; reloads after use)
    this.lives = null; // set by main: hearts pay for Flash
    this.gems = null; // set by main: pink gems pay for Flash
    this.fx = new Map(); // per-enemy smoke visuals { glow, ring, level, wasParalyzed }
    this.sparkList = []; // twinkling sparks + paralysis bursts
    this.streamList = []; // powder inhaled toward a beast's mouth
    this.charging = 0; // seconds left of the Flash charge-up
    this.armed = false; // next landed punch is a Flash punch
    this.stats = { batarangThrows: 0, batarangCatches: 0, batarangHits: 0, flashPunches: 0 };
    this.onEvent = null; // (name, detail) for sounds / UI
  }

  async init() {
    if (!this.scene) return;
    this.batModel = await loadBatarangModel();
    this.batModel.visible = false;
    const { bomb, puffs, sparks, stream } = await loadSmokeModels();
    this.bombModel = bomb;
    this.bombModel.visible = false;
    this.puffs = puffs;
    this.sparkMesh = sparks;
    this.streamMesh = stream;
    this.scene.add(this.batModel, this.bombModel, this.puffs, this.sparkMesh, this.streamMesh);
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
  }

  /** Drops everything in flight (respawn); unlocks are kept and the Flash bar is full again. */
  clear() {
    this.batarang = null;
    this.pending = null;
    this.hero.throwAnim = null;
    this.bombs = [];
    this.clouds = [];
    this.cooldowns.batarang = this.cooldowns.smokeBomb = 0;
    this.charging = 0;
    this.armed = false;
    this.energy = 1;
    this.hero.glow = 0;
    this.sparkList = [];
    this.streamList = [];
    for (const f of this.fx.values()) {
      f.level = 0;
      f.glow.visible = f.ring.visible = false;
    }
    if (this.batModel) this.batModel.visible = false;
  }

  /** Hearts Flash costs (30% of max). */
  get flashHeartCost() {
    return (this.lives?.maxHearts ?? CONFIG.lives.hearts) * FM.flashHeartCostPct;
  }

  /** Why Flash can't be used right now: 'locked' | 'busy' | 'reload' | 'health' | 'gems' | null. */
  flashBlockReason() {
    if (!this.has('flashMode')) return 'locked';
    if (this.charging > 0 || this.armed || this.hero.riding) return 'busy';
    if (this.energy < 1) return 'reload';
    if (this.lives && !(this.lives.hearts > this.flashHeartCost)) return 'health';
    if (this.gems && (this.gems.counts.pink ?? 0) < FM.gemCost) return 'gems';
    return null;
  }

  get flashReady() {
    return this.flashBlockReason() === null;
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
    if (name === 'flashMode') return this.flashReady;
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
    if (!this.ready(name)) {
      if (name === 'flashMode') {
        const why = this.flashBlockReason();
        if (why === 'health' || why === 'gems' || why === 'reload') this.onEvent?.('flashBlocked', why);
      }
      return false;
    }
    if (name === 'batarang' || name === 'smokeBomb') {
      // Throw pose first; the item leaves the hand at the release point (see update).
      this.pending = { name, t: 0 };
      this.hero.throwAnim = { kind: 'throw', t: 0 };
      this.cooldowns[name] = name === 'batarang' ? BT.cooldown : SB.cooldown;
      this.#faceTarget();
    } else if (name === 'flashMode') {
      // Pay: 5 pink gems and 30% of the hearts (he flickers red, the hearts drop); the bar empties.
      this.lives?.spend(this.flashHeartCost);
      this.gems?.spend('pink', FM.gemCost);
      this.hero.redFlicker = FM.hurtFlicker;
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
    // The Flash bar reloads smoothly after use.
    if (this.energy < 1) this.energy = Math.min(1, this.energy + dt / FM.flashReloadSeconds);
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
        if (this.clouds.length > SB.maxClouds) this.clouds.shift();
        this.onEvent?.('smokeBurst');
        // Crystal sparks drifting inside the new cloud.
        for (let i = 0; i < SB.sparks; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * SB.radius * 0.85;
          this.#spark(b.end.x + Math.cos(a) * r, b.end.y + 0.3 + Math.random() * 2.2, b.end.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.25, (Math.random() - 0.5) * 0.4, SB.duration * (0.7 + Math.random() * 0.3));
        }
      }
    }
    this.bombs = this.bombs.filter((b) => b.t < 1);
    for (const c of this.clouds) c.age += dt;
    this.clouds = this.clouds.filter((c) => c.age < SB.duration);

    // Paralysis: an enemy that stays inside a cloud for `exposure` seconds. While it breathes
    // the powder in: a stream into its mouth, its chest heaves, a green glow builds; at the
    // moment of paralysis a burst of crystal sparks; then a green tint, dizzy stars, swaying and
    // a timer ring under it; at the end the glow fades softly.
    for (const t of this.combat?.targets ?? []) {
      const fx = this.#fxFor(t);
      const inside = t.alive && this.clouds.some((c) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < SB.radius + t.radius * 0.5);
      const paralyzed = t.paralyzed > 0;
      if (t.alive && inside && !paralyzed) {
        t.smokeExposure = (t.smokeExposure ?? 0) + dt;
        this.#inhale(t, dt);
        if (t.smokeExposure >= SB.exposure) {
          t.paralyze(SB.paralyze);
          t.smokeExposure = 0;
          this.#burst(t);
          this.onEvent?.('paralyzed');
        }
      } else if (!inside || !t.alive) t.smokeExposure = 0;
      if (!fx) continue;
      const nowParalyzed = t.paralyzed > 0;
      const target = nowParalyzed ? 1 : t.smokeExposure > 0 ? t.smokeExposure / SB.exposure : 0;
      if (target >= fx.level) fx.level = target;
      else fx.level = Math.max(target, fx.level - dt / SB.glow.fade); // soft fade
      fx.wasParalyzed = nowParalyzed;
      // Glow round the head.
      const head = this.#headOf(t);
      fx.glow.visible = fx.level > 0.01;
      if (fx.glow.visible) {
        const pulse = nowParalyzed ? 0.85 + 0.15 * Math.sin(performance.now() * 0.006) : 1;
        fx.glow.position.copy(head);
        fx.glow.scale.setScalar(SB.glow.size * (0.5 + 0.5 * fx.level) * Math.max(1, t.radius * 0.8));
        fx.glow.material.opacity = SB.glow.opacity * fx.level * pulse;
      }
      // Timer ring under it, shrinking with the time left.
      fx.ring.visible = nowParalyzed;
      if (nowParalyzed) {
        const frac = Math.min(1, t.paralyzed / SB.paralyze);
        fx.ring.position.set(t.position.x, t.position.y + 0.06, t.position.z);
        fx.ring.scale.setScalar(Math.max(1, t.radius + 0.6));
        const n = fx.ring.userData.indexCount;
        fx.ring.geometry.setDrawRange(0, Math.max(6, Math.floor((n * frac) / 6) * 6));
        fx.ringFrac = frac;
      }
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
    this.#drawPowder();
    this.#drawSparks(dt);
    this.#drawStream(dt);
  }

  /** Mouth / head of an enemy (falls back to near the top of its body). */
  #headOf(t) {
    return t.mouthPosition?.() ?? new THREE.Vector3(t.position.x, t.position.y + t.height * 0.85, t.position.z);
  }

  #fxFor(t) {
    if (!this.scene) return null;
    let fx = this.fx.get(t);
    if (!fx) {
      fx = { glow: makeSmokeGlow(), ring: makeSmokeRing(), level: 0, wasParalyzed: false };
      this.scene.add(fx.glow, fx.ring);
      this.fx.set(t, fx);
    }
    return fx;
  }

  /** Powder and sparks stream from the cloud into the beast's mouth. */
  #inhale(t, dt) {
    const S = SB.stream;
    t.inhaleDebt = (t.inhaleDebt ?? 0) + S.rate * dt;
    const mouth = this.#headOf(t);
    const cloud = this.clouds.find((c) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < SB.radius + t.radius * 0.5);
    while (t.inhaleDebt >= 1 && cloud) {
      t.inhaleDebt -= 1;
      let p = this.streamList.find((q) => q.age >= q.life);
      if (!p) {
        if (this.streamList.length >= S.max) break;
        p = { from: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), age: 0, life: 1, size: 1, spark: false };
        this.streamList.push(p);
      }
      const a = Math.random() * Math.PI * 2;
      const r = SB.radius * (0.3 + Math.random() * 0.7);
      p.from.set(cloud.x + Math.cos(a) * r, cloud.y + 0.4 + Math.random() * 2, cloud.z + Math.sin(a) * r);
      p.to.copy(mouth);
      p.age = 0;
      p.life = S.life * (0.7 + Math.random() * 0.6);
      p.spark = Math.random() < 0.25;
      p.size = S.size * (p.spark ? 0.7 : 0.8 + Math.random() * 0.8);
    }
  }

  /** At the moment of paralysis: crystal sparks pop off the beast. */
  #burst(t) {
    const B = SB.burst;
    const c = this.#headOf(t);
    for (let i = 0; i < B.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8 + 0.2;
      const v = B.speed * (0.6 + Math.random() * 0.6);
      this.#spark(c.x, c.y - Math.random() * t.height * 0.5, c.z, Math.cos(a) * v, up * v, Math.sin(a) * v, B.life * (0.7 + Math.random() * 0.6), true);
    }
    this.stats.bursts = (this.stats.bursts ?? 0) + 1;
  }

  #spark(x, y, z, vx, vy, vz, life, burst = false) {
    let s = this.sparkList.find((q) => q.age >= q.life);
    if (!s) {
      if (this.sparkList.length >= (this.sparkMesh?.instanceMatrix.count ?? 200)) return;
      s = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, phase: 0, burst: false };
      this.sparkList.push(s);
    }
    s.pos.set(x, y, z);
    s.vel.set(vx, vy, vz);
    s.age = 0;
    s.life = life;
    s.phase = Math.random() * 10;
    s.burst = burst;
  }

  #drawPowder() {
    if (!this.puffs) return;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const fade = this.puffs.geometry.attributes.instanceFade;
    let n = 0;
    for (const c of this.clouds) {
      const grow = Math.min(1, c.age / 0.45);
      const life = c.age / SB.duration;
      const out = Math.min(1, (1 - life) * 4); // fade out at the end
      SB.layers.forEach(([rk, size, opacity, color], li) => {
        for (let i = 0; i < SB.puffs; i++) {
          const a = (i / SB.puffs) * Math.PI * 2 + c.seed + li * 0.7 + c.age * (0.15 + li * 0.05);
          const r = SB.radius * rk * (0.35 + 0.65 * (((i * 37 + li * 11) % 10) / 10)) * grow;
          const s2 = size * (0.8 + ((i * 13) % 7) * 0.08) * grow * (1 + life * 0.35);
          const y = c.y + 0.5 + (((i * 7 + li * 3) % 6) / 6) * 2.2 * rk + Math.sin(c.age * 1.3 + i) * 0.15 + life * 0.5;
          m.makeScale(s2, s2 * 0.85, s2).setPosition(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
          this.puffs.setMatrixAt(n, m);
          this.puffs.setColorAt(n, col.setHex(color));
          fade.array[n++] = opacity * out * grow;
        }
      });
    }
    this.puffs.count = n;
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
    fade.needsUpdate = true;
  }

  #drawSparks(dt) {
    const mesh = this.sparkMesh;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    let n = 0;
    const fade = mesh?.geometry.attributes.instanceFade;
    for (const s of this.sparkList) {
      if (s.age >= s.life) continue;
      s.age += dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.burst) s.vel.multiplyScalar(1 - 2.5 * dt);
      if (!mesh) continue;
      const k = s.age / s.life;
      const tw = 0.5 + 0.5 * Math.sin((s.age + s.phase) * SB.sparkTwinkle); // twinkle
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (s.age + s.phase) * 3);
      const size = SB.sparkSize * (s.burst ? 1.6 : 1) * (0.5 + tw);
      mesh.setMatrixAt(n, m.compose(s.pos, q, sc.setScalar(size)));
      fade.array[n++] = (s.burst ? 1 - k : Math.min(1, (1 - k) * 4)) * (0.35 + 0.65 * tw);
    }
    if (!mesh) return;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }

  #drawStream(dt) {
    const mesh = this.streamMesh;
    const m = new THREE.Matrix4();
    let n = 0;
    const fade = mesh?.geometry.attributes.instanceFade;
    for (const p of this.streamList) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      p.pos.lerpVectors(p.from, p.to, k * k); // sucked in faster and faster
      if (!mesh) continue;
      const size = p.size * (1 - k * 0.7);
      mesh.setMatrixAt(n, m.makeScale(size, size, size).setPosition(p.pos));
      fade.array[n++] = (p.spark ? 1 : 0.6) * Math.min(1, k * 4) * (1 - k * 0.5);
    }
    if (!mesh) return;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }
}
