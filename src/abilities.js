import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeFadeMaterial, addFadeAttribute } from './world.js';

const AB = CONFIG.abilities;
const BT = AB.batarang;
const SB = AB.smokeBomb;
const FM = AB.flashMode;
const TH = AB.throw;
// The gem colour each ability spends (the colour that unlocks it).
const COST_COLOR = Object.fromEntries(Object.entries(CONFIG.gems.abilities).map(([color, name]) => [name, color]));

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

/** The Batarang's trail: fading additive diamonds along its path (so it can be followed). */
export async function loadBatarangTrailModel() {
  const T = BT.trail;
  const geo = new THREE.OctahedronGeometry(T.size, 0);
  addFadeAttribute(geo, T.count);
  const mesh = new THREE.InstancedMesh(geo, makeFadeMaterial({ color: T.color, emissive: T.color, emissiveIntensity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true }), T.count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.count = 0;
  return mesh;
}

/** The auto-aim bracket: four corner marks round the target (billboarded to the camera). */
export async function loadTargetBracketModel() {
  const B = BT.bracket;
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: B.color, transparent: true, opacity: B.opacity, depthWrite: false, depthTest: false, fog: false });
  const h = B.size / 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const across = new THREE.Mesh(new THREE.PlaneGeometry(B.arm, B.thickness), mat);
    across.position.set(sx * (h - B.arm / 2), sy * h, 0);
    const down = new THREE.Mesh(new THREE.PlaneGeometry(B.thickness, B.arm), mat);
    down.position.set(sx * h, sy * (h - B.arm / 2), 0);
    group.add(across, down);
  }
  group.renderOrder = 11;
  group.visible = false;
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

/**
 * Placeholder Flash lightning (all additive, no lights): crackling sparks (blue-white diamonds)
 * and energy motes (gold) for the charge-up, two glowing orbs for the hands, the bolt as
 * instanced segments (white core + blue glow), the impact flash and the ground shockwave ring.
 */
export async function loadLightningModels() {
  const group = new THREE.Group();
  const pool = (geo, max, color) => {
    addFadeAttribute(geo, max);
    const mesh = new THREE.InstancedMesh(
      geo,
      makeFadeMaterial({ color, emissive: color, emissiveIntensity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true }),
      max,
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.count = 0;
    return mesh;
  };
  const diamond = () => new THREE.OctahedronGeometry(1, 0).scale(0.55, 1, 0.55);
  const sparks = pool(diamond(), FM.maxParticles, FM.feetSparks.color);
  const motes = pool(diamond(), FM.maxParticles, FM.channel.color);
  const additive = (color, opacity = 1) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const orbs = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), additive(FM.channel.orbColor, 0));
    m.visible = false;
    m.renderOrder = 9;
    return m;
  });
  // Bolt segments: a unit cylinder along +Z (placed / stretched per segment).
  const segGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const maxSeg = FM.bolt.segments + FM.bolt.armSegments * 2 + 16;
  const seg = (color, opacity) => {
    const m = new THREE.InstancedMesh(segGeo, additive(color, opacity), maxSeg);
    m.frustumCulled = false;
    m.renderOrder = 10;
    m.count = 0;
    return m;
  };
  const core = seg(FM.bolt.color, 1);
  const glow = seg(FM.bolt.glowColor, FM.bolt.glowOpacity);
  const impact = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), additive(FM.impact.color, 0));
  impact.visible = false;
  impact.renderOrder = 10;
  const W = FM.shockwave;
  const shock = new THREE.Mesh(new THREE.RingGeometry(1 - W.width / W.radius, 1, 56, 1).rotateX(-Math.PI / 2), additive(W.color, 0));
  shock.visible = false;
  shock.renderOrder = 8;
  // The super-armor shield: a gold-white shell round him with little crackling arcs on it.
  const SH = FM.shield;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), additive(SH.color, 0));
  shell.renderOrder = 9;
  shell.visible = false;
  const shieldArcs = new THREE.InstancedMesh(segGeo, additive(SH.arcColor, 0.9), SH.arcs * SH.arcSegments);
  shieldArcs.frustumCulled = false;
  shieldArcs.renderOrder = 10;
  shieldArcs.count = 0;
  group.add(sparks, motes, ...orbs, core, glow, impact, shock, shell, shieldArcs);
  group.userData = { sparks, motes, orbs, core, glow, impact, shock, shell, shieldArcs };
  return group;
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
 * - Smoke Bomb: lobbed in an arc onto the lock-on target; bursts into a cloud. An enemy whose
 *   body touches it is interrupted and, after `smokeExposureSeconds`, paralyzed for `paralyze`
 *   seconds (the boss caps it).
 * - Flash Mode: a lightning blast. The bar starts full; using Flash costs 5 pink gems and 30%
 *   of the hero's hearts (only if he has more than that — never lethal) and needs a target in
 *   range; it empties the bar (it reloads over flashReloadSeconds), charges up for a second
 *   (sparks from his feet, energy into his hands), then a bolt strikes the target for
 *   damageFraction of its max HP (the boss: hitPct.flash).
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
    this.camera = null; // set by main: billboards the auto-aim bracket
    this.trail = []; // recent Batarang positions { pos, age }
    this.aimTarget = null; // mounted: what a tap would throw the Batarang at (bracketed)
    this.gems = null; // set by main: pink gems pay for Flash
    this.fx = new Map(); // per-enemy smoke visuals { glow, ring, level, wasParalyzed }
    this.sparkList = []; // twinkling sparks + paralysis bursts
    this.streamList = []; // powder inhaled toward a beast's mouth
    this.charging = 0; // seconds left of the Flash charge-up
    this.flashTarget = null; // what the charging bolt will strike
    this.strike = null; // the bolt in progress { t, target, at: Vector3, seed }
    this.boltParticles = []; // feet sparks + energy into the hands
    this.stats = { batarangThrows: 0, batarangCatches: 0, batarangHits: 0, flashStrikes: 0 };
    this.onEvent = null; // (name, detail) for sounds / UI
  }

  async init() {
    if (!this.scene) return;
    this.batModel = await loadBatarangModel();
    this.batModel.visible = false;
    this.trailMesh = await loadBatarangTrailModel();
    this.bracket = await loadTargetBracketModel();
    this.scene.add(this.trailMesh, this.bracket);
    const { bomb, puffs, sparks, stream } = await loadSmokeModels();
    this.bombModel = bomb;
    this.bombModel.visible = false;
    this.puffs = puffs;
    this.sparkMesh = sparks;
    this.streamMesh = stream;
    this.scene.add(this.batModel, this.bombModel, this.puffs, this.sparkMesh, this.streamMesh);
    this.lightning = await loadLightningModels();
    this.scene.add(this.lightning);
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
    this.flashTarget = null;
    this.strike = null;
    this.hero.superArmor = false;
    this.boltParticles = [];
    this.energy = 1;
    this.hero.glow = 0;
    this.sparkList = [];
    this.streamList = [];
    for (const f of this.fx.values()) {
      f.level = 0;
      f.glow.visible = f.ring.visible = false;
    }
    if (this.batModel) this.batModel.visible = false;
    this.trail = [];
    this.aimTarget = null;
    if (this.bracket) this.bracket.visible = false;
  }

  /** A target is gone for good (a minion removed): drop its smoke glow and ring. */
  forget(t) {
    const fx = this.fx.get(t);
    if (!fx) return;
    this.scene?.remove(fx.glow, fx.ring);
    fx.glow.geometry.dispose();
    fx.ring.geometry.dispose();
    this.fx.delete(t);
    if (this.flashTarget === t) this.flashTarget = null;
  }

  /** Hearts Flash costs (30% of max). */
  get flashHeartCost() {
    return (this.lives?.maxHearts ?? CONFIG.lives.hearts) * FM.flashHeartCostPct;
  }

  /** Gems one use of an ability costs: { color, n }. */
  gemCost(name) {
    return { color: COST_COLOR[name], n: AB[name].gemCost };
  }

  /** Enough gems (and, for Flash, hearts) to pay for one use? (No gem store attached = free.) */
  canAfford(name) {
    if (name === 'flashMode' && this.lives && !(this.lives.hearts > this.flashHeartCost)) return false;
    const { color, n } = this.gemCost(name);
    return !this.gems || (this.gems.counts[color] ?? 0) >= n;
  }

  /**
   * Why an ability can't be used right now, or null:
   * 'locked' | 'busy' (mid-throw, Batarang out, charging, wrong for riding) | 'health' (Flash)
   * | 'gems' | 'cooldown' | 'reload' (Flash bar) | 'target' (Flash: nothing in range).
   */
  blockReason(name) {
    if (!this.has(name)) return 'locked';
    const hero = this.hero;
    if (name === 'flashMode') {
      if (this.charging > 0 || this.strike || hero.riding) return 'busy';
      if (this.lives && !(this.lives.hearts > this.flashHeartCost)) return 'health';
      if (!this.canAfford(name)) return 'gems';
      if (this.energy < 1) return 'reload';
      if (this.combat && !this.#flashTarget()) return 'target';
      return null;
    }
    if (this.pending || (name === 'batarang' && this.batarang) || (name === 'smokeBomb' && hero.riding)) return 'busy';
    if (!this.canAfford(name)) return 'gems';
    if (this.cooldowns[name] > 0) return 'cooldown';
    return null;
  }

  flashBlockReason() {
    return this.blockReason('flashMode');
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
    return this.blockReason(name) === null;
  }

  /** Cooldown fraction left (0 = ready) for the button overlay. */
  cooldownFraction(name) {
    if (name === 'batarang') return this.batarangOut ? 1 : this.cooldowns.batarang / BT.cooldown;
    if (name === 'smokeBomb') return this.cooldowns.smokeBomb / SB.cooldown;
    return 0;
  }

  /**
   * Use an ability (button / key). Returns true if it fired. Each use spends its gems; a
   * blocked use reports why through onEvent('abilityBlocked', { name, why, color, n }).
   */
  use(name) {
    const why = this.blockReason(name);
    if (why) {
      if (why !== 'locked' && why !== 'busy' && why !== 'cooldown') this.onEvent?.('abilityBlocked', { name, why, ...this.gemCost(name) });
      return false;
    }
    const { color, n } = this.gemCost(name);
    this.gems?.spend(color, n);
    if (name === 'batarang' || name === 'smokeBomb') {
      // Throw pose first; the item leaves the hand at the release point (see update).
      // (mounted, the bracketed bat is the target: kept from the tap to the release)
      this.pending = { name, t: 0, target: name === 'batarang' && this.hero.riding ? this.mountedTarget() : null };
      this.hero.throwAnim = { kind: 'throw', t: 0 };
      this.cooldowns[name] = name === 'batarang' ? BT.cooldown : SB.cooldown;
      this.#faceTarget();
    } else if (name === 'flashMode') {
      // Pay 30% of the hearts too (he flickers red, the hearts drop); the bar empties; charge up.
      this.lives?.spend(this.flashHeartCost);
      this.hero.redFlicker = FM.hurtFlicker;
      this.energy = 0;
      this.charging = FM.chargeTime;
      this.flashTarget = this.#flashTarget();
      this.#faceTarget(this.flashTarget);
    }
    this.onEvent?.(name);
    return true;
  }

  /** The Flash bolt's target: the boss if it's in range (auto-lock), else the lock-on target, else the nearest. */
  #flashTarget() {
    const hero = this.hero;
    const dist = (t) => Math.hypot(t.position.x - hero.position.x, t.position.z - hero.position.z) - t.radius;
    const boss = this.combat?.targets.find((t) => t.isBoss && t.alive && dist(t) <= FM.range);
    if (boss) return boss;
    const lock = this.combat?.lockTarget;
    if (lock?.alive && dist(lock) <= FM.range) return lock;
    let best = null;
    for (const t of this.combat?.targets ?? []) if (t.alive && dist(t) <= FM.range && (!best || dist(t) < dist(best))) best = t;
    return best;
  }

  update(dt) {
    this.cooldowns.batarang = Math.max(0, this.cooldowns.batarang - dt);
    this.cooldowns.smokeBomb = Math.max(0, this.cooldowns.smokeBomb - dt);
    // The Flash bar reloads smoothly after use.
    if (this.energy < 1) this.energy = Math.min(1, this.energy + dt / FM.flashReloadSeconds);
    // Flash: charge up (sparks from the feet, energy into the hands, gold glow), then the bolt.
    if (this.charging > 0) {
      this.charging = Math.max(0, this.charging - dt);
      this.#chargeParticles(dt);
      if (this.charging === 0) this.#strikeBolt();
    }
    if (this.strike) {
      this.strike.t += dt;
      if (this.strike.t >= Math.max(FM.bolt.time, FM.shockwave.time)) this.strike = null;
    }
    this.hero.glow = this.charging > 0 ? 1 - this.charging / FM.chargeTime : this.strike ? Math.max(0, 1 - this.strike.t / FM.bolt.time) : 0;
    // Super-armor through the charge and the strike: no damage, no knockback, no interruption.
    this.hero.superArmor = this.charging > 0 || (!!this.strike && this.strike.t < FM.bolt.time);
    this.#drawLightning(dt);
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
    this.#drawTrail(dt);
    this.#updateBracket();
    this.#updateSmoke(dt);
  }

  /** The trail: the Batarang's recent positions, fading out. */
  #drawTrail(dt) {
    const T = BT.trail;
    for (const p of this.trail) p.age += dt;
    if (this.batarang) this.trail.push({ pos: this.batarang.pos.clone(), age: 0 });
    this.trail = this.trail.filter((p) => p.age < T.life).slice(-T.count);
    const mesh = this.trailMesh;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const fade = mesh.geometry.attributes.instanceFade;
    this.trail.forEach((p, i) => {
      const k = 1 - p.age / T.life;
      mesh.setMatrixAt(i, m.makeScale(k, k, k).setPosition(p.pos));
      fade.array[i] = T.opacity * k;
    });
    mesh.count = this.trail.length;
    mesh.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }

  /** Mounted, with the Batarang ready: a bracket on what a tap would hit. */
  #updateBracket() {
    const hero = this.hero;
    this.aimTarget = hero.riding && this.ready('batarang') ? this.mountedTarget() : null;
    const br = this.bracket;
    if (!br) return;
    const t = this.aimTarget;
    br.visible = !!t;
    if (!t) return;
    br.position.copy(this.#centre(t));
    if (this.camera) br.quaternion.copy(this.camera.quaternion);
    else br.lookAt(hero.position);
    br.scale.setScalar(Math.max(1, (t.radius * 2) / BT.bracket.size) * (1 + BT.bracket.pulse * Math.sin(performance.now() * BT.bracket.pulseRate)));
  }

  /** On foot, turn to the lock-on target (or the given one) before throwing / blasting. */
  #faceTarget(target = null) {
    const t = target ?? this.combat?.lockTarget;
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

  /**
   * Mounted auto-aim: the nearest living flying target (a bat) within autoAimRange that is in
   * front of or beside the horse, or null (then the Batarang flies straight ahead).
   */
  mountedTarget() {
    const hero = this.hero;
    const M = BT.mounted;
    const fx = Math.sin(hero.facing);
    const fz = Math.cos(hero.facing);
    let best = null;
    let bestD = M.autoAimRange;
    for (const t of this.combat?.targets ?? []) {
      if (!t.alive || !t.flying) continue;
      const dx = t.position.x - hero.position.x;
      const dz = t.position.z - hero.position.z;
      const d = Math.hypot(dx, dz, t.position.y + t.height * 0.5 - hero.position.y);
      if (d > bestD) continue;
      const flat = Math.hypot(dx, dz);
      if (flat > M.overhead && (dx * fx + dz * fz) / flat < M.sideDot) continue; // behind the horse (not overhead)
      best = t;
      bestD = d;
    }
    return best;
  }

  /** Outside the camera view (with a small margin)? */
  #offScreen(p) {
    if (!this.camera) return false;
    const v = p.clone().project(this.camera);
    const lim = 1 - BT.mounted.screenMargin;
    return v.z >= 1 || Math.abs(v.x) > lim || Math.abs(v.y) > lim;
  }

  /** Mounted throw: homing at the auto-aim target (or straight ahead), never beyond maxRange. */
  #throwHoming(hand) {
    const kept = this.pending?.target;
    const t = kept?.alive ? kept : this.mountedTarget();
    const dir = t ? this.#centre(t).sub(hand).normalize() : new THREE.Vector3(Math.sin(this.hero.facing), 0, Math.cos(this.hero.facing));
    this.batarang = { mode: 'homing', phase: 'out', target: t, start: hand.clone(), pos: hand.clone(), dir, age: 0, travelled: 0, hit: null, rider: this.hero.moveSpeed, lastHand: null };
    this.stats.batarangThrows++;
    this.trail = [];
    if (this.batModel) {
      this.batModel.visible = true;
      this.batModel.position.copy(hand);
    }
  }

  #centre(t) {
    return new THREE.Vector3(t.position.x, t.position.y + t.height * 0.5, t.position.z);
  }

  /** Turn `dir` toward `want` by at most `maxAngle` radians. */
  #turnToward(dir, want, maxAngle) {
    const w = want.clone().normalize();
    const angle = dir.angleTo(w);
    if (angle <= maxAngle || angle < 1e-5) return dir.copy(w);
    const axis = new THREE.Vector3().crossVectors(dir, w);
    if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
    return dir.applyAxisAngle(axis.normalize(), maxAngle).normalize();
  }

  #updateHoming(dt) {
    const b = this.batarang;
    const hero = this.hero;
    const M = BT.mounted;
    const hand = hero.handPosition();
    // The rider's own speed, measured from the hand (the horse carries him; hero.update doesn't run).
    if (b.lastHand && dt > 0) b.rider += (Math.hypot(hand.x - b.lastHand.x, hand.z - b.lastHand.z) / dt - b.rider) * (1 - Math.exp(-BT.mounted.riderSmoothing * dt));
    b.lastHand = hand.clone();
    const rider = Math.max(b.rider, hero.moveSpeed);
    const rate = THREE.MathUtils.degToRad(M.turnRate);
    const turn = rate * dt;
    // Inside its own turning circle it would only orbit, and off screen the player loses it:
    // then it flies straight at the point (the bat or the hand, both on screen).
    const steer = (want, speed) => {
      if (want.length() < Math.max(M.directHoming, (speed / rate) * M.orbitGuard) || this.#offScreen(b.pos)) b.dir.copy(want).normalize();
      else this.#turnToward(b.dir, want, turn);
    };
    if (b.phase === 'out') {
      if (b.target && !b.target.alive) b.phase = 'back'; // its target died: straight back
      else {
        const want = b.target ? this.#centre(b.target).sub(b.pos) : new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
        if (b.target) steer(want, M.homingSpeed + rider);
        else this.#turnToward(b.dir, want, turn);
        const step = (M.homingSpeed + rider) * dt;
        b.pos.addScaledVector(b.dir, step);
        b.travelled += step;
        if (this.#batarangHit(b.pos)) b.phase = 'back';
        else if (b.pos.distanceTo(hand) > M.maxRange || (!b.target && b.pos.distanceTo(hand) >= M.forwardRange)) b.phase = 'back';
      }
    } else {
      // Back to the rider on a tight curve (turn-limited), straight to the hand at the end.
      const speed = Math.max(BT.returnSpeed, rider * BT.chaseFactor + BT.returnSpeed * 0.5);
      const to = hand.clone().sub(b.pos);
      const d = to.length();
      if (d <= Math.max(BT.catchRadius, speed * dt)) return this.#catchBatarang();
      steer(to, speed);
      b.pos.addScaledVector(b.dir, speed * dt);
    }
    if (b.age > BT.maxTime) return this.#catchBatarang(); // (safety net: it always returns)
    if (this.batModel) {
      this.batModel.position.copy(b.pos);
      this.batModel.userData.spinner.rotation.y += BT.spin * dt;
    }
  }

  #throwBatarang(hand) {
    if (this.hero.riding) return this.#throwHoming(hand);
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
    if (b.mode === 'homing') return this.#updateHoming(dt);
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

    // Paralysis: an enemy whose body touches a cloud is interrupted (`smokeTouch`: the boss
    // coughs and can't leave) and is paralyzed after `smokeExposureSeconds` in it — never while
    // `smokeImmune()` (the boss mid slam landing or charge rush; it applies the frame after). While it breathes
    // the powder in: a stream into its mouth, its chest heaves, a green glow builds; at the
    // moment of paralysis a burst of crystal sparks; then a green tint, dizzy stars, swaying and
    // a timer ring under it; at the end the glow fades softly.
    for (const t of this.combat?.targets ?? []) {
      const fx = this.#fxFor(t);
      const cloud = t.alive ? this.clouds.find((c) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < SB.radius + t.radius) : null;
      const inside = !!cloud; // (its body touches the cloud)
      const paralyzed = t.paralyzed > 0;
      // Some beasts shrug the powder off for a while after a paralysis (the boss: 20 s).
      const resists = !!t.resistsParalysis?.();
      if (inside && resists && !paralyzed && !t.smokeResistShown) this.onEvent?.('smokeResisted', t);
      t.smokeResistShown = inside && resists;
      const immune = !!t.smokeImmune?.();
      if (t.alive && inside && !paralyzed && !resists && !immune) {
        if (!(t.smokeExposure > 0)) t.smokeTouch?.(cloud, SB.radius); // interrupted: coughs, held in the cloud
        t.smokeExposure = (t.smokeExposure ?? 0) + dt;
        this.#inhale(t, dt);
        if (t.smokeExposure >= SB.smokeExposureSeconds) {
          t.paralyze(SB.paralyze); // (the target may cap it: the boss is paralyzed for less)
          t.smokeExposure = 0;
          this.#burst(t);
          this.onEvent?.('paralyzed');
        }
      } else if (!inside || !t.alive || resists) t.smokeExposure = 0;
      if (!fx) continue;
      const nowParalyzed = t.paralyzed > 0;
      const target = nowParalyzed ? 1 : t.smokeExposure > 0 ? t.smokeExposure / SB.smokeExposureSeconds : 0;
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
        const frac = Math.min(1, t.paralyzed / (t.paralyzeTotal ?? SB.paralyze));
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
    const cloud = this.clouds.find((c) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < SB.radius + t.radius);
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

  // --- Flash: lightning blast ---

  /** Charge-up: sparks crackle up round his feet, energy streams into both hands. */
  #chargeParticles(dt) {
    const hero = this.hero;
    const S = FM.feetSparks;
    const C = FM.channel;
    this.sparkDebt = (this.sparkDebt ?? 0) + S.rate * dt;
    this.moteDebt = (this.moteDebt ?? 0) + C.rate * dt;
    const free = (kind) => {
      let p = this.boltParticles.find((q) => q.age >= q.life);
      if (!p && this.boltParticles.length < FM.maxParticles * 2) {
        p = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), from: new THREE.Vector3(), age: 0, life: 1, hand: 0, kind };
        this.boltParticles.push(p);
      }
      if (p) (p.kind = kind), (p.age = 0);
      return p;
    };
    for (; this.sparkDebt >= 1; this.sparkDebt--) {
      const p = free('spark');
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const r = S.radius * (0.4 + Math.random() * 0.6);
      p.pos.set(hero.position.x + Math.cos(a) * r, hero.position.y + 0.05, hero.position.z + Math.sin(a) * r);
      p.vel.set(0, S.rise * (0.6 + Math.random() * 0.6), 0);
      p.life = S.life * (0.6 + Math.random() * 0.8);
    }
    for (; this.moteDebt >= 1; this.moteDebt--) {
      const p = free('mote');
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 0.6;
      p.from.set(hero.position.x + Math.cos(a) * C.radius, hero.position.y + 1.1 + up, hero.position.z + Math.sin(a) * C.radius);
      p.pos.copy(p.from);
      p.hand = Math.random() < 0.5 ? 0 : 1;
      p.life = C.life * (0.7 + Math.random() * 0.6);
    }
  }

  /** End of the charge: the bolt strikes the target (half its max HP, flash, shockwave, shake). */
  #strikeBolt() {
    const hero = this.hero;
    let t = this.flashTarget;
    if (!t?.alive) t = this.#flashTarget();
    this.flashTarget = null;
    let at;
    let ground;
    if (t) {
      at = new THREE.Vector3(t.position.x, t.position.y + t.height * 0.6, t.position.z);
      ground = t.position.y;
      const dx = t.position.x - hero.position.x;
      const dz = t.position.z - hero.position.z;
      const d = Math.hypot(dx, dz) || 1;
      this.combat?.hitTarget(t, { amount: t.maxHp * FM.damageFraction, dirX: dx / d, dirZ: dz / d, knockback: FM.knockback, heavy: true, flash: true, source: 'flash' });
    } else {
      at = hero.forward(FM.range * 0.5); // (the target died during the charge: it hits the ground)
      ground = this.world?.heightAt?.(at.x, at.z) ?? hero.position.y;
      at.y = ground;
    }
    // Minions close to the bolt die; the shockwave pushes the rest back from the impact.
    for (const m of [...(this.combat?.targets ?? [])]) {
      if (!m.minion || !m.alive) continue;
      const mx = m.position.x - at.x;
      const mz = m.position.z - at.z;
      const d = Math.hypot(mx, mz);
      if (d <= CONFIG.minions.flashKillRadius) {
        this.combat.hitTarget(m, { amount: m.hp, dirX: d > 1e-3 ? mx / d : 1, dirZ: d > 1e-3 ? mz / d : 0, heavy: true, source: 'flash' });
        continue;
      }
      if (d > FM.shockwave.radius) continue;
      const push = FM.minionPush * (0.5 + 0.5 * (1 - d / FM.shockwave.radius)); // (at least half, even at the edge)
      const ux = d > 1e-3 ? mx / d : 1;
      const uz = d > 1e-3 ? mz / d : 0;
      if (m.knockback) m.knockback(ux, uz, push);
      else m.position.set(m.position.x + ux * push, m.position.y, m.position.z + uz * push);
    }
    this.strike = { t: 0, target: t, at, ground, flicker: 0, bolts: null };
    this.stats.flashStrikes++;
    this.onEvent?.('flashStrike', { position: at.clone(), target: t });
  }

  /** Jagged points from a to b (sideways jitter, largest mid-way). */
  #jagged(a, b, n, jitter) {
    const pts = [a.clone()];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const j = jitter * Math.sin(Math.PI * k);
      pts.push(new THREE.Vector3().lerpVectors(a, b, k).add(new THREE.Vector3((Math.random() - 0.5) * 2 * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * 2 * j)));
    }
    pts.push(b.clone());
    return pts;
  }

  #newBolts(st) {
    const B = FM.bolt;
    const top = st.at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, B.height, (Math.random() - 0.5) * 6));
    const main = this.#jagged(top, st.at, B.segments, B.jitter * 2.2);
    const lines = [{ pts: main, w: 1 }];
    // Two short forks off the main bolt.
    for (let f = 0; f < 2; f++) {
      const i = 2 + Math.floor(Math.random() * (B.segments - 5));
      const from = main[i];
      const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -2 - Math.random() * 3, (Math.random() - 0.5) * 6));
      lines.push({ pts: this.#jagged(from, to, 4, B.jitter), w: 0.5 });
    }
    // The arc from his hands to the target.
    const hand = this.hero.handPosition(new THREE.Vector3()).lerp(this.hero.handPosition(new THREE.Vector3(), true), 0.5);
    lines.push({ pts: this.#jagged(hand, st.at, B.armSegments, B.armJitter * Math.max(1, hand.distanceTo(st.at) * 0.25)), w: B.armScale });
    st.bolts = lines;
  }

  #drawLightning(dt) {
    const L = this.lightning?.userData;
    const hero = this.hero;
    const active = this.charging > 0 || !!this.strike || this.boltParticles.some((p) => p.age < p.life);
    if (!active) {
      if (L && this.lightning.visible) {
        this.lightning.visible = false;
        for (const p of this.boltParticles) p.age = p.life;
      }
      return;
    }
    if (L) this.lightning.visible = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const hands = [hero.handPosition(new THREE.Vector3()), hero.handPosition(new THREE.Vector3(), true)];
    // Charge particles.
    let ns = 0;
    let nm = 0;
    for (const p of this.boltParticles) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      if (p.kind === 'spark') {
        // Crackling: the sideways drift jumps about (a jagged climb).
        if (Math.random() < FM.feetSparks.jitter * dt * 4) {
          const a = Math.random() * Math.PI * 2;
          p.vel.x = Math.cos(a) * 1.6;
          p.vel.z = Math.sin(a) * 1.6;
        }
        p.pos.addScaledVector(p.vel, dt);
      } else {
        p.pos.lerpVectors(p.from, hands[p.hand], k * k); // pulled in faster and faster
      }
      if (!L) continue;
      const spark = p.kind === 'spark';
      const size = spark ? FM.feetSparks.size * (0.6 + Math.random() * 0.8) : FM.channel.size * (1 - k * 0.6);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.age * 9);
      m.compose(p.pos, q, sc.set(size, size * (spark ? 2.6 : 1.4), size));
      const mesh = spark ? L.sparks : L.motes;
      const n = spark ? ns++ : nm++;
      mesh.setMatrixAt(n, m);
      mesh.geometry.attributes.instanceFade.array[n] = spark ? (1 - k) * (0.4 + 0.6 * Math.random()) : Math.min(1, k * 3);
    }
    if (!L) return;
    for (const [mesh, n] of [[L.sparks, ns], [L.motes, nm]]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.instanceFade.needsUpdate = true;
    }
    // Glowing hands: brighter through the charge, a last flare as the bolt leaves.
    const charge = this.charging > 0 ? 1 - this.charging / FM.chargeTime : this.strike ? Math.max(0, 1 - this.strike.t / FM.bolt.time) : 0;
    L.orbs.forEach((o, i) => {
      o.visible = charge > 0.01;
      if (!o.visible) return;
      o.position.copy(hands[i]);
      o.scale.setScalar(FM.channel.orb * (0.4 + 0.8 * charge) * (0.85 + 0.3 * Math.random()));
      o.material.opacity = 0.35 + 0.55 * charge;
    });
    // The super-armor shield (charge + strike): a flickering shell and arcs crawling over it.
    const SH = FM.shield;
    const armored = !!hero.superArmor;
    L.shell.visible = armored;
    let na = 0;
    if (armored) {
      const c = new THREE.Vector3(hero.position.x, hero.position.y + SH.height, hero.position.z);
      L.shell.position.copy(c);
      L.shell.scale.set(SH.radius, SH.radius * 1.35, SH.radius);
      L.shell.material.opacity = SH.opacity * (0.75 + 0.25 * Math.sin(performance.now() * 0.001 * SH.flicker));
      this.shieldFlicker = (this.shieldFlicker ?? 0) - dt;
      if (!this.shieldPts || this.shieldFlicker <= 0) {
        this.shieldFlicker = 1 / SH.flicker;
        // Arcs: short jagged walks over the shell (local, round the centre).
        this.shieldPts = [];
        for (let a = 0; a < SH.arcs; a++) {
          let th = Math.random() * Math.PI * 2;
          let ph = 0.3 + Math.random() * 2.5;
          const pts = [];
          for (let k = 0; k <= SH.arcSegments; k++) {
            pts.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th) * SH.radius, Math.cos(ph) * SH.radius * 1.35, Math.sin(ph) * Math.sin(th) * SH.radius));
            th += (Math.random() - 0.5) * 0.7;
            ph += (Math.random() - 0.5) * 0.5;
          }
          this.shieldPts.push(pts);
        }
      }
      const dir = new THREE.Vector3();
      const a = new THREE.Vector3();
      for (const pts of this.shieldPts) {
        for (let k = 0; k < pts.length - 1; k++) {
          a.copy(pts[k]).add(c);
          dir.subVectors(pts[k + 1], pts[k]);
          const len = dir.length();
          q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.divideScalar(len || 1));
          L.shieldArcs.setMatrixAt(na++, m.compose(a, q, sc.set(SH.arcWidth, SH.arcWidth, len)));
        }
      }
    }
    L.shieldArcs.count = na;
    L.shieldArcs.instanceMatrix.needsUpdate = true;

    // The bolt (flickering: re-drawn FM.bolt.flicker times a second), impact flash, shockwave.
    const st = this.strike;
    let nseg = 0;
    if (st && st.t < FM.bolt.time) {
      st.flicker -= dt;
      if (!st.bolts || st.flicker <= 0) {
        this.#newBolts(st);
        st.flicker = 1 / FM.bolt.flicker;
      }
      const dir = new THREE.Vector3();
      for (const line of st.bolts) {
        for (let i = 0; i < line.pts.length - 1 && nseg < L.core.instanceMatrix.count; i++) {
          const a = line.pts[i];
          dir.subVectors(line.pts[i + 1], a);
          const len = dir.length();
          q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.divideScalar(len || 1));
          L.core.setMatrixAt(nseg, m.compose(a, q, sc.set(FM.bolt.core * line.w, FM.bolt.core * line.w, len)));
          L.glow.setMatrixAt(nseg, m.compose(a, q, sc.set(FM.bolt.glow * line.w, FM.bolt.glow * line.w, len)));
          nseg++;
        }
      }
      const k = st.t / FM.bolt.time;
      const flick = 0.55 + 0.45 * Math.random();
      L.core.material.opacity = Math.sqrt(1 - k) * flick;
      L.glow.material.opacity = FM.bolt.glowOpacity * Math.sqrt(1 - k) * flick;
    }
    for (const mesh of [L.core, L.glow]) {
      mesh.count = nseg;
      mesh.instanceMatrix.needsUpdate = true;
    }
    const ik = st ? st.t / FM.impact.time : 1;
    L.impact.visible = ik < 1;
    if (L.impact.visible) {
      L.impact.position.copy(st.at);
      L.impact.scale.setScalar(FM.impact.size * (0.35 + 0.65 * Math.sqrt(ik)));
      L.impact.material.opacity = FM.impact.opacity * (1 - ik);
    }
    const wk = st ? st.t / FM.shockwave.time : 1;
    L.shock.visible = wk < 1;
    if (L.shock.visible) {
      L.shock.position.set(st.at.x, st.ground + 0.08, st.at.z);
      L.shock.scale.setScalar(FM.shockwave.radius * (1 - (1 - wk) * (1 - wk)) + 0.3);
      L.shock.material.opacity = FM.shockwave.opacity * (1 - wk);
    }
  }
}
