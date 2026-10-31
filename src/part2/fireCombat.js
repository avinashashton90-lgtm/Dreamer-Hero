import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadBatarangModel } from '../abilities.js';
import { gearGeometry } from '../portal.js';

// Part 2's fighting (the Fire level): the cheap particle pool the fire is made of (`FireFx`: one
// additive InstancedMesh of embers, flames and sparks) and the hero's `Arsenal` — the Batarang
// (1 Batarang a throw from the blue gems, capped, flying straight the way AJ faces, out and back,
// the ammo shown as the button's badge), the Cog Shot and Gear Wheel, the Shield (found in a chest:
// raised for a moment, blocks front attacks, a perfect block staggers the Guardian) and, once the
// Fire Element is recovered, Fire Blast (a ball of fire thrown in an arc, it burns for 3 s; a
// cooldown ring instead of a count). All but the Shield work on horseback and on foot. The Arsenal also has the small
// interface the HUD's ability buttons read (`has`, `usesLeft`, `cooldownFraction`, `canAfford`,
// `visible`, `layout`), so the same buttons serve here as in Part 1. Targets (foes and the boss)
// implement { alive, position (feet), radius, height, takeHit(damage, source), ignite(time, dps) }.

const F = CONFIG.part2.fire;
const BT = F.batarang;
const FB = F.fireBlast;
const SH = F.shield;
const A = F.arena;
const CS = F.weapons.cogShot;
const GW = F.weapons.gearWheel;
const SC = F.sparkChain;
const SG = F.steamGust;
const TH = CONFIG.abilities.throw;
const MAX_FX = 220;

/** Embers, flames and sparks: one additive InstancedMesh, a pool of particles with gravity and a shrink. */
export class FireFx {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_FX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fireFx';
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FX * 3), 3);
    scene.add(this.mesh);
    this.list = [];
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    this.flashes = [];
    this.impacts = [];
  }

  /** One particle. `up` extra rise, `g` gravity (negative: it floats up). */
  emit(pos, vel, { life = 0.6, size = 0.12, color = F.accent, g = -1.5 } = {}) {
    if (this.list.length >= MAX_FX) this.list.shift();
    this.list.push({ p: pos.clone(), v: vel.clone(), life, age: 0, size, color, g });
  }

  /** A burst of `n` embers from `at`, flying out `speed`. */
  burst(at, n = 14, { speed = 5, life = 0.7, size = 0.14, color = F.accent, up = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      this.emit(at, new THREE.Vector3(Math.cos(a) * speed * e, Math.random() * up + up * 0.3, Math.sin(a) * speed * e), { life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color: Math.random() < 0.35 ? F.accent2 : color, g: 6 });
    }
  }

  impact(at, color) {
    const I = F.weaponImpact;
    const group = new THREE.Group();
    const flash = new THREE.Mesh(new THREE.SphereGeometry(I.flashRadius, 10, 8), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(I.ringInner, I.ringOuter, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    group.add(flash, ring);
    group.position.copy(at);
    this.mesh.parent.add(group);
    this.impacts.push({ group, flash, ring, age: 0 });
    for (let i = 0; i < I.sparks; i++) {
      const a = (i / I.sparks) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const start = at.clone().addScaledVector(dir, I.sparkRadius);
      this.emit(start, dir.multiplyScalar(I.sparkSpeed).add(new THREE.Vector3(0, I.sparkUp, 0)), {
        life: I.life, size: 0.1, color, g: 3,
      });
    }
  }

  /** A flame lick rising from `at` (a burning foe, the boss's furnace). */
  flame(at, spread = 0.3) {
    this.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread)), new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6), { life: 0.5 + Math.random() * 0.3, size: 0.16 + Math.random() * 0.1, color: Math.random() < 0.5 ? F.accent : F.accent2, g: -2 });
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      q.age += dt;
      if (q.age >= q.life) {
        L.splice(i, 1);
        continue;
      }
      q.v.y -= q.g * dt;
      q.p.addScaledVector(q.v, dt);
    }
    const mesh = this.mesh;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      const k = 1 - q.age / q.life;
      const s = q.size * (0.3 + k * 0.9);
      this.m.makeScale(s, s * 1.4, s).setPosition(q.p);
      mesh.setMatrixAt(i, this.m);
      mesh.setColorAt(i, this.c.setHex(q.color).multiplyScalar(0.4 + k * 0.6));
    }
    mesh.count = L.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const effect = this.impacts[i];
      effect.age += dt;
      const k = Math.max(0, 1 - effect.age / F.weaponImpact.life);
      effect.flash.material.opacity = k * 0.95;
      effect.flash.scale.setScalar(0.45 + (1 - k) * 0.8);
      effect.ring.material.opacity = k * 0.95;
      effect.ring.scale.setScalar(0.5 + (1 - k) * 2.2);
      if (k <= 0) {
        effect.group.removeFromParent();
        effect.flash.geometry.dispose();
        effect.flash.material.dispose();
        effect.ring.geometry.dispose();
        effect.ring.material.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }
}

export class Arsenal {
  /**
   * @param {{ scene, hero, horse, fx: FireFx, sound, cam?, ui?, targets: () => object[], assets? }} o
   * `targets()` lists the live foes (and the boss) a throw can aim at.
   */
  constructor({ scene, hero, horse, fx, sound, cam, ui, targets, onEvent }) {
    Object.assign(this, { scene, hero, horse, fx, sound, cam, ui, targets, onEvent });
    this.layout = '2'; // (the HUD's button set for the fighting levels: input.js layout foot2 / ride2)
    this._ammo = 0;
    this.ammo = F.startAmmo;
    this.fireUnlocked = false; // (the Fire Element recovered: Fire Blast for the rest of Part 2 — not before)
    this.shieldUnlocked = false; // (the Shield chest opened)
    this.sparkUnlocked = false; // (the Lightning Element: Spark Chain)
    this.steamUnlocked = false; // (the Steam Element: Steam Gust)
    this.shieldRemaining = 0; // s of the raised shield left
    this.shieldAge = 0; // s since it was raised (the perfect-block window)
    this.capBonus = 0; // (level-up: Batarangs carried above `maxBatarangs`)
    this.damageScale = 1; // (level-up: Batarang and Gear Wheel damage ×)
    this.levelOn = false; // (in the Fire level: Cog Shot and Gear Wheel are his)
    this.arenaMode = false; // (in the Guardian's plaza: the Gear Wheel is free and recharges on a long cooldown)
    this.keys = () => 0; // (the cog keys on hand: set by the level)
    this.spendKey = () => {};
    this.gearStock = 0; // (brass gears on hand for Gear Wheel shots; the level's gear counter, for the rewards, is separate)
    this.cooldowns = { batarang: 0, fireBlast: 0, shield: 0, cogShot: 0, gearWheel: 0, sparkChain: 0, steamGust: 0 };
    this.cog = null; // the Cog Shot in flight
    this.wheel = null; // the Gear Wheel rolling
    this.pending = null; // { name, t, target } — the throw pose running; it leaves the hand at TH.release
    this.proj = null; // the Batarang in flight
    this.ball = null; // the fire ball in flight
    this.energy = 1; // (the buttons read these as Part 1's Abilities has them)
    this.charging = 0;
    this.strike = null;
    this.aimTarget = null;
    this.stats = { throws: 0, hits: 0, blasts: 0, catches: 0, blocked: 0 };
    this.ready = (async () => {
      this.model = await loadBatarangModel();
      this.model.visible = false;
      scene.add(this.model);
      this.ballMesh = new THREE.Group();
      this.ballMesh.add(
        new THREE.Mesh(new THREE.SphereGeometry(FB.size * 0.55, 10, 8), new THREE.MeshBasicMaterial({ color: FB.core })),
        new THREE.Mesh(new THREE.SphereGeometry(FB.size, 10, 8), new THREE.MeshBasicMaterial({ color: FB.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      this.ballMesh.visible = false;
      scene.add(this.ballMesh);
      this.cogMesh = new THREE.Mesh(gearGeometry(CS.size, 8, 0.25), new THREE.MeshLambertMaterial({ color: CS.color, emissive: 0x6a4a10, transparent: true }));
      this.cogMesh.visible = false;
      scene.add(this.cogMesh);
      this.wheelMesh = new THREE.Group();
      this.wheelGear = new THREE.Mesh(gearGeometry(GW.radius, 12, 0.35), new THREE.MeshLambertMaterial({ color: GW.color, emissive: 0x4a3008, transparent: true }));
      this.wheelMesh.add(this.wheelGear);
      this.wheelMesh.visible = false;
      scene.add(this.wheelMesh);
      const D = SH.disc;
      this.shieldMesh = new THREE.Mesh(new THREE.CircleGeometry(D.radius, 24), new THREE.MeshBasicMaterial({ color: SH.color, transparent: true, opacity: D.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.shieldMesh.visible = false;
      scene.add(this.shieldMesh);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FB.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.ring);
    })();
  }

  // --- the HUD buttons' interface ------------------------------------------------

  has(name) {
    if (name === 'batarang') return true;
    if (name === 'fireBlast') return this.fireUnlocked;
    if (name === 'shield') return this.shieldUnlocked;
    if (name === 'sparkChain') return this.sparkUnlocked;
    if (name === 'steamGust') return this.steamUnlocked;
    return (name === 'cogShot' || name === 'gearWheel') && this.levelOn;
  }

  /** Which buttons show: the Batarang always, Fire Blast once the Fire Element is recovered. */
  visible(name) {
    return this.has(name);
  }

  /** Batarang: the gems on hand (1 gem = 1 throw). Fire Blast has no count (null: only its cooldown ring). */
  usesLeft(name) {
    if (name === 'batarang') return this.ammo;
    if (name === 'cogShot') return Math.floor(this.keys() / CS.keys);
    if (name === 'gearWheel') return Math.floor(this.gearStock / GW.gears);
    return null;
  }

  cooldownFraction(name) {
    if (name === 'batarang') return this.proj ? 1 : this.cooldowns.batarang / BT.cooldown;
    if (name === 'fireBlast') return this.cooldowns.fireBlast / FB.cooldown;
    if (name === 'shield') return this.shieldRemaining > 0 ? 0 : this.cooldowns.shield / SH.cooldown;
    if (name === 'sparkChain') return this.cooldowns.sparkChain / SC.cooldown;
    if (name === 'steamGust') return this.cooldowns.steamGust / SG.cooldown;
    if (name === 'cogShot') return this.cog?.phase === 'fly' ? 1 : this.cooldowns.cogShot / CS.cooldown;
    if (name === 'gearWheel') return this.wheel ? 1 : this.cooldowns.gearWheel / this.#wheelCooldown();
    return 0;
  }

  canAfford(name) {
    if (this.hero.life && this.hero.life !== 'alive') return false;
    if (name === 'batarang') return this.ammo > 0;
    if (name === 'cogShot' || name === 'gearWheel') return this.usesLeft(name) > 0;
    return this.has(name);
  }

  flashBlockReason() {
    return null;
  }

  get busy() {
    return !!this.pending;
  }

  /** Why `name` can't be used now (null: it can). */
  blockReason(name) {
    if (!this.has(name)) return 'locked';
    if (this.hero.life && this.hero.life !== 'alive') return 'down'; // (lying down, or getting up: nothing can be thrown)
    if (name === 'shield' && this.shieldRemaining > 0) return 'busy';
    if (this.pending || (name === 'batarang' && this.proj)) return 'busy';
    if (this.cooldowns[name] > 0) return 'cooldown';
    if (name === 'batarang' && this.ammo <= 0) return 'gems';
    if (name === 'cogShot' && this.usesLeft(name) <= 0) return 'keys';
    if (name === 'gearWheel' && this.usesLeft(name) <= 0) return 'gears';
    return null;
  }

  /** The Batarangs carried: never more than `maxBatarangs`, never fewer than none (only blue gems add to them, and only up to the cap). */
  get ammo() {
    return this._ammo;
  }

  /** How many Batarangs can be carried: `maxBatarangs` plus the level-up bonus (`capBonus`), never above the table's cap. */
  get ammoCap() {
    return Math.min(CONFIG.part2.levelUpCaps.batarangCap, F.maxBatarangs + (this.capBonus ?? 0));
  }

  set ammo(v) {
    this._ammo = Math.max(0, Math.min(this.ammoCap, Math.floor(v)));
  }

  /** Use an ability (button / key). True if it fired. */
  use(name) {
    const why = this.blockReason(name);
    if (why) {
      this.stats.blocked++;
      if (why === 'gems' || why === 'keys' || why === 'gears') this.onEvent?.('blocked', { name, why });
      return false;
    }
    if (name === 'shield') {
      this.shieldRemaining = SH.duration;
      this.shieldAge = 0;
      this.sound?.play('shield_up', { position: this.hero.position });
      this.onEvent?.('use', { name });
      return true;
    }
    if (name === 'sparkChain' || name === 'steamGust') {
      // (Spark Chain with nobody in range does nothing: no cooldown, a "No target" hint)
      if (!(name === 'sparkChain' ? this.#spark() : this.#gust())) {
        this.onEvent?.('blocked', { name, why: 'target' });
        return false;
      }
      this.cooldowns[name] = name === 'sparkChain' ? SC.cooldown : SG.cooldown;
      this.onEvent?.('use', { name });
      return true;
    }
    if (name === 'batarang') this.ammo--;
    else if (name === 'cogShot') this.spendKey(CS.keys);
    else if (name === 'gearWheel') this.gearStock -= GW.gears;
    this.cooldowns[name] = { batarang: BT.cooldown, fireBlast: FB.cooldown, cogShot: CS.cooldown, gearWheel: this.#wheelCooldown() }[name];
    // (the Batarang is not aimed: it flies straight the way AJ faces; the rest still lock on to the nearest foe)
    this.pending = { name, t: 0, target: name === 'batarang' ? null : this.pick() };
    this.hero.throwAnim = { kind: 'throw', t: 0 };
    this.#face(this.pending.target);
    this.onEvent?.('use', { name });
    return true;
  }

  /** Spark Chain (the Lightning Element): lightning from his hand to the nearest foe, then on to the next within `hop`, up to `targets` of them. */
  #spark() {
    let from = this.hero.handPosition();
    const done = new Set();
    let t = this.#nearestFoe(SC.range);
    if (!t) return false;
    for (let i = 0; i < SC.targets && t; i++) {
      done.add(t);
      const at = new THREE.Vector3(t.position.x, (t.position.y ?? 0) + (t.height ?? 1.5) * 0.5, t.position.z);
      // (a jagged blue-white arc: bright motes along a wobbly line, doubled so it reads)
      for (let k = 0; k <= 14; k++) {
        const q = from.clone().lerp(at, k / 14);
        const w = k === 0 || k === 14 ? 0 : 0.35;
        this.fx.emit(q.add(new THREE.Vector3((Math.random() - 0.5) * w, (Math.random() - 0.5) * w, (Math.random() - 0.5) * w)), new THREE.Vector3(), { life: SC.time, size: 0.26, color: k % 2 ? SC.color : SC.core, g: 0 });
      }
      t.stun?.(SC.stun);
      this.#impact(t, at, SC.damage * this.damageScale, 'spark', at.clone().sub(from).normalize());
      const next = this.#live().filter((q) => this.#valid(q) && !done.has(q) && Math.hypot(q.position.x - t.position.x, q.position.z - t.position.z) - q.radius < SC.hop)
        .sort((a, b) => a.position.distanceTo(t.position) - b.position.distanceTo(t.position))[0];
      from = at;
      t = next;
    }
    this.sound?.play('spark_zap', { position: this.hero.position });
    this.stats.sparks = (this.stats.sparks ?? 0) + done.size;
    return true;
  }

  /** The nearest living foe within `range` of its edge, in any direction (null: none). */
  #nearestFoe(range) {
    const at = this.hero.position;
    let best = null;
    let bd = Infinity;
    for (const t of this.#live()) {
      if (!this.#valid(t)) continue;
      const d = Math.max(0, Math.hypot(t.position.x - at.x, t.position.z - at.z) - (t.radius ?? 0));
      if (d <= range && d < bd) (bd = d), (best = t);
    }
    return best;
  }

  /** Steam Gust (the Steam Element): a cone of steam pushes foes back and, from the saddle, lifts the horse into a short glide. */
  #gust() {
    const { at, fwd } = this.#origin();
    const cos = Math.cos((SG.coneDeg * Math.PI) / 360);
    let pushed = 0;
    for (const t of this.#live()) {
      if (!this.#valid(t) || (t.radius ?? 0) > 2) continue;
      const dx = t.position.x - at.x;
      const dz = t.position.z - at.z;
      const flat = Math.hypot(dx, dz) || 1;
      if (flat - (t.radius ?? 0) > SG.range || (dx * fwd.x + dz * fwd.z) / flat < cos) continue;
      t.position.x += (dx / flat) * SG.push;
      t.position.z += (dz / flat) * SG.push;
      pushed++;
    }
    for (let i = 0; i < 18; i++) {
      const a = (Math.random() - 0.5) * 1.2;
      const v = new THREE.Vector3(fwd.x * Math.cos(a) - fwd.z * Math.sin(a), 0.3, fwd.z * Math.cos(a) + fwd.x * Math.sin(a)).multiplyScalar(7 + Math.random() * 4);
      this.fx.emit(at.clone().setY(at.y + 1.1), v, { life: 0.7, size: 0.5, color: SG.color, g: -0.2 });
    }
    if (this.horse.mounted) {
      this.horse.glideT = SG.glide;
      this.horse.glideGravity = SG.glideGravity;
      this.horse.velocity.y = Math.max(this.horse.velocity.y, SG.lift);
      this.horse.grounded = false;
    }
    this.sound?.play('steam_launch', { position: at });
    this.stats.gusts = (this.stats.gusts ?? 0) + 1;
    this.stats.pushed = (this.stats.pushed ?? 0) + pushed;
    return true;
  }

  /** The Gear Wheel's cooldown: short on the ride (it costs gears), long in the Guardian's plaza (it costs nothing there). */
  #wheelCooldown() {
    return this.arenaMode ? A.arenaGearWheelCooldown : GW.cooldown;
  }

  /** A new game or a respawn: nothing in flight, cooldowns clear (the unlock and the gems stay). */
  clear() {
    this.pending = null;
    this.proj = null;
    this.ball = null;
    this.cog = null;
    this.wheel = null;
    this.shieldRemaining = 0;
    if (this.shieldMesh) this.shieldMesh.visible = false;
    if (this.cogMesh) this.cogMesh.visible = this.wheelMesh.visible = false;
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = 0;
    this.hero.throwAnim = null;
    if (this.model) this.model.visible = false;
    if (this.ballMesh) this.ballMesh.visible = false;
    this.aimTarget = null;
  }

  // --- aiming ---------------------------------------------------------------------

  /** Where the hero's chest is, and which way he is facing (riding: the horse's heading). */
  #origin() {
    const h = this.hero;
    const heading = this.horse.mounted ? this.horse.heading : h.facing;
    return { at: h.position.clone().setY(h.position.y + 1.3), heading, fwd: new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)) };
  }

  /** A target a weapon may still aim at: it exists, is alive and has a position (a foe can be removed mid-flight). */
  #valid(t) {
    return !!(t && t.alive && t.position && !t.untargetable);
  }

  /** The foes a weapon can touch right now (a missing or half-removed entry is skipped, never thrown on). */
  #live() {
    const list = this.targets?.() ?? [];
    return list.filter((t) => t && t.position);
  }

  /**
   * The Batarang's auto-aim: the nearest living foe (or the Guardian) inside a forward cone of `coneDeg` degrees within `range` of its
   * edge — null when nothing is in the cone (the throw then flies straight).
   */
  #coneTarget() {
    const { at, fwd } = this.#origin();
    const half = (BT.coneDeg * Math.PI) / 360;
    const cos = Math.cos(half);
    let best = null;
    let bd = Infinity;
    for (const t of this.#live()) {
      if (!this.#valid(t)) continue;
      const dx = t.position.x - at.x;
      const dz = t.position.z - at.z;
      const flat = Math.hypot(dx, dz);
      if (flat < 1e-3) continue;
      if ((dx * fwd.x + dz * fwd.z) / flat < cos) continue;
      const d = Math.max(0, flat - t.radius);
      if (d <= BT.range && d < bd) (bd = d), (best = t);
    }
    return best;
  }

  /** The nearest living foe within range in any direction, preferring ones ahead (one behind counts `prefer`× as far). */
  pick(range = BT.range) {
    const { at, fwd } = this.#origin();
    let best = null;
    let bd = Infinity;
    for (const t of this.#live()) {
      if (!t.alive || t.untargetable) continue;
      const dx = t.position.x - at.x;
      const dz = t.position.z - at.z;
      const d = Math.max(0, Math.hypot(dx, dz) - t.radius);
      if (d > range) continue;
      const score = d * (dx * fwd.x + dz * fwd.z < 0 ? BT.prefer : 1);
      if (score < bd) (bd = score), (best = t);
    }
    return best;
  }

  #face(target) {
    if (!this.#valid(target) || this.horse.mounted) return;
    this.hero.facing = Math.atan2(target.position.x - this.hero.position.x, target.position.z - this.hero.position.z);
  }

  #centre(t) {
    return new THREE.Vector3(t.position.x, t.position.y + Math.max(0.6, t.height * 0.55), t.position.z);
  }

  /** The foe whose hit body (a vertical capsule from its feet, padded) contains `p`, other than those in `skip`. */
  #foeAt(p, skip, pad = F.hit.pad, up = 0) {
    for (const t of this.#live()) {
      if (!t.alive || skip.has(t) || t.untargetable) continue;
      if (p.y < t.position.y - pad || p.y > t.position.y + t.height + pad + up) continue;
      if (Math.hypot(p.x - t.position.x, p.z - t.position.z) <= t.radius + pad) return t;
    }
    return null;
  }

  #robotAt(p, skip) {
    for (const t of this.#live()) {
      if (!t.alive || skip.has(t) || t.untargetable) continue;
      const centre = this.#centre(t);
      if (p.distanceToSquared(centre) <= F.hit.robotRadius ** 2) return t;
    }
    return null;
  }

  #wheelAt(p, skip) {
    const wheelRadius = GW.radius;
    const hitSphere = (t, centre, radius) => p.distanceToSquared(centre) <= (wheelRadius + radius) ** 2;
    for (const t of this.#live()) {
      if (!t.alive || skip.has(t) || t.untargetable) continue;
      if (t.isBoss) {
        const L = F.hit.guardianLegs;
        const sideX = Math.cos(t.heading) * L.side;
        const sideZ = -Math.sin(t.heading) * L.side;
        for (const sign of [-1, 1]) {
          const leg = new THREE.Vector3(t.position.x + sideX * sign, t.position.y + L.height, t.position.z + sideZ * sign);
          if (hitSphere(t, leg, L.radius)) return t;
        }
      }
      if (hitSphere(t, this.#centre(t), F.hit.robotRadius)) return t;
    }
    return null;
  }

  #impact(t, at, damage, source, direction) {
    if (t.takeHit(damage, source, { direction, point: at }) === false) return false;
    this.fx.impact(at, source === 'cog' ? CS.color : source === 'spark' ? SC.color : GW.color);
    this.sound?.play('robot_hit', { position: at, pitch: source === 'cog' ? 0.9 : 0.7 });
    this.cam?.shake?.(F.weaponImpact.shake, F.weaponImpact.shakeTime);
    const camera = this.cam?.camera;
    if (camera && this.ui?.damageNumber) {
      const screen = at.clone().project(camera);
      const width = globalThis.innerWidth ?? 0;
      const height = globalThis.innerHeight ?? 0;
      const x = (screen.x + 1) * width / 2;
      const y = (1 - screen.y) * height / 2;
      const margin = F.weaponImpact.popupMargin;
      this.ui.damageNumber(
        width ? THREE.MathUtils.clamp(x, margin, width - margin) : 0,
        height ? THREE.MathUtils.clamp(y, margin, height - margin) : 0,
        `-${damage}`,
      );
    }
    return true;
  }

  // --- the loop -------------------------------------------------------------------

  update(dt) {
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.#updateShield(dt);
    const anim = this.hero.throwAnim;
    if (anim) {
      anim.t += dt;
      if (anim.t >= (anim.kind === 'throw' ? TH.duration : TH.catchTime)) this.hero.throwAnim = null;
    }
    if (this.pending) {
      this.pending.t += dt;
      if (this.pending.t >= BT.release) {
        const hand = this.hero.handPosition();
        const { name, target } = this.pending;
        this.pending = null;
        if (name === 'batarang') this.#throwBatarang(hand, target);
        else if (name === 'cogShot') this.#throwCog(hand, target);
        else if (name === 'gearWheel') this.#rollWheel(hand, target);
        else this.#throwBall(hand, target);
        this.sound?.play({ batarang: 'batarang_throw', cogShot: 'batarang_throw', gearWheel: 'gear_whoosh' }[name] ?? 'fire_blast_cast', { position: hand, pitch: name === 'cogShot' ? 0.7 : 1 });
      }
    }
    if (this.proj) this.#flyBatarang(dt);
    if (this.ball) this.#flyBall(dt);
    if (this.cog) this.#flyCog(dt);
    if (this.wheel) this.#rollOn(dt);
    if (this.ring) {
      this.ring.material.opacity = Math.max(0, this.ring.material.opacity - dt * 2.4);
      const s = this.ring.scale.x + dt * 9;
      this.ring.scale.setScalar(s);
    }
  }

  /** The Batarang: straight out the way AJ faces (the horse's heading when riding), no auto-aim, no homing: a throw that misses is wasted. */
  #throwBatarang(hand) {
    const { fwd } = this.#origin();
    const dir = fwd.clone();
    this.proj = { phase: 'out', pos: hand.clone(), dir, target: this.#coneTarget(), age: 0, travelled: 0, hit: new Set(), back: new Set() };
    this.stats.throws++;
    if (this.model) {
      this.model.visible = true;
      this.model.position.copy(hand);
    }
  }

  #flyBatarang(dt) {
    const b = this.proj;
    const hand = this.hero.handPosition();
    b.age += dt;
    const rider = this.horse.mounted ? Math.abs(this.horse.speed) : this.hero.moveSpeed ?? 0;
    if (b.phase === 'out') {
      const step = (BT.speed + rider * 0.3) * dt;
      // (auto-aim: it curves a little toward the foe it picked at the throw; with none it flies straight on)
      if (this.#valid(b.target)) {
        const want = this.#centre(b.target).sub(b.pos);
        if (want.lengthSq() > 1e-4) {
          want.normalize();
          const turn = Math.min(1, (BT.homeTurn * dt) / Math.max(1e-3, Math.acos(Math.min(1, Math.max(-1, b.dir.dot(want))))));
          b.dir.lerp(want, turn).normalize();
        }
      }
      this.#sweep(b, step, b.hit, () => (b.phase = 'back'));
      b.travelled += step;
      if (b.phase === 'out' && b.travelled >= BT.range) b.phase = 'back';
    } else {
      const to = hand.clone().sub(b.pos);
      const d = to.length();
      const speed = BT.returnSpeed + rider * 1.4;
      if (d <= Math.max(1.2, speed * dt)) {
        this.proj = null;
        this.stats.catches++;
        if (!this.pending) this.hero.throwAnim = { kind: 'catch', t: 0 };
        this.model.visible = false;
        return;
      }
      b.dir.copy(to).normalize();
      this.#sweep(b, speed * dt, b.back, null);
    }
    if (b.age > 4) {
      this.proj = null;
      this.model.visible = false;
      return;
    }
    this.model.position.copy(b.pos);
    this.model.userData.spinner.rotation.y += 22 * dt;
  }

  /** Move `b` along its direction by `step`, in small sub-steps so it never tunnels; the first foe hit (once each) takes the Batarang's damage. */
  #sweep(b, step, hits, onHit) {
    const n = Math.max(1, Math.ceil(step / 0.5));
    for (let i = 0; i < n; i++) {
      b.pos.addScaledVector(b.dir, step / n);
      const t = this.#foeAt(b.pos, hits, F.hit.pad, BT.above); // (thrown from the saddle it flies above a small robot's head: it counts down to the ground)
      if (t) {
        hits.add(t);
        this.stats.hits++;
        if (t.takeHit(BT.damage * this.damageScale, 'batarang') !== false) this.sound?.play('batarang_hit', { position: b.pos });
        this.fx.burst(b.pos, 5, { speed: 3, life: 0.35, size: 0.1, color: BT.color, up: 1 });
        if (onHit) {
          onHit();
          return;
        }
      }
    }
  }

  #throwBall(hand, target) {
    const t = this.#valid(target) ? target : this.pick(FB.range);
    const { fwd } = this.#origin();
    const end = t ? this.#centre(t) : hand.clone().addScaledVector(fwd, FB.forward).setY(this.hero.position.y + 0.3);
    const dist = hand.distanceTo(end);
    this.ball = { start: hand.clone(), end, dist: Math.max(2, dist), u: 0, pos: hand.clone(), target: t, hit: new Set() };
    this.ballMesh.visible = true;
    this.ballMesh.position.copy(hand);
    this.stats.blasts++;
  }

  #flyBall(dt) {
    const f = this.ball;
    const rider = this.horse.mounted ? Math.abs(this.horse.speed) : 0;
    if (this.#valid(f.target)) f.end.copy(this.#centre(f.target)); // (it follows its target)
    f.u = Math.min(1, f.u + ((FB.speed + rider * 0.2) * dt) / f.dist);
    const u = f.u;
    f.pos.lerpVectors(f.start, f.end, u);
    f.pos.y += FB.arc * 4 * u * (1 - u);
    this.ballMesh.position.copy(f.pos);
    this.ballMesh.rotation.y += 9 * dt;
    for (let i = 0; i < 2; i++) this.fx.flame(f.pos, 0.35);
    const hit = u < 1 ? this.#foeAt(f.pos, new Set(), 0.15) : null;
    if (u >= 1 || hit) this.#explode(f.pos.clone());
  }

  /**
   * Cog Shot: the big golden cog is thrown from the hand in a small arc at the nearest foe (or ahead), upright like a coin on its edge
   * (its axle sideways to its way). A robot in its path takes `CS.damage` and it drops there. Landing: a little bounce, then it rolls on its
   * edge, spinning round its axle and slowing down, wobbles and falls over flat at the end (a wall stops it the same way), then fades.
   */
  #throwCog(hand, target) {
    const t = this.#valid(target) ? target : this.pick(CS.range);
    const { fwd } = this.#origin();
    const end = t ? this.#centre(t) : hand.clone().addScaledVector(fwd, CS.forward).setY(this.hero.position.y + CS.size);
    const dir = new THREE.Vector3(end.x - hand.x, 0, end.z - hand.z);
    if (dir.lengthSq() < 1e-4) dir.copy(fwd);
    dir.setY(0).normalize();
    const ground = this.horse.mounted ? this.horse.position.y : this.hero.position.y;
    this.cog = {
      start: hand.clone(), end, dist: Math.max(2, hand.distanceTo(end)), u: 0, pos: hand.clone(), target: t,
      phase: 'fly', dir, speed: 0, ground, vy: 0, landed: false, t: 0, spin: 0, lean: 0, hit: false,
    };
    this.cogMesh.material.opacity = 1;
    this.cogMesh.visible = true;
    this.cogMesh.position.copy(hand);
    this.cogMesh.rotation.set(0, -Math.atan2(dir.z, dir.x), 0, 'YXZ');
    this.stats.cogs = (this.stats.cogs ?? 0) + 1;
  }

  #flyCog(dt) {
    const c = this.cog;
    const R = CS.roll;
    const rest = c.ground + CS.size;
    if (c.phase === 'fly') {
      const rider = this.horse.mounted ? Math.abs(this.horse.speed) : 0;
      if (this.#valid(c.target)) c.end.copy(this.#centre(c.target));
      const oldU = c.u;
      c.u = Math.min(1, c.u + ((CS.speed + rider * 0.2) * dt) / c.dist);
      const pointAt = (u) => c.start.clone().lerp(c.end, u).setY(c.start.y + (c.end.y - c.start.y) * u + CS.arc * 4 * u * (1 - u));
      const stepCount = Math.max(1, Math.ceil(c.pos.distanceTo(pointAt(c.u)) / 0.4));
      let hit = null;
      for (let i = 1; i <= stepCount; i++) {
        c.pos.copy(pointAt(oldU + ((c.u - oldU) * i) / stepCount));
        hit = this.#robotAt(c.pos, new Set());
        if (hit) break;
        // (a wall or a pillar in its way: it drops there)
        const world = this.horse.world;
        if (world?.collide) {
          const tmp = c.pos.clone();
          world.collide(tmp, new THREE.Vector3(), CS.size);
          if (Math.hypot(tmp.x - c.pos.x, tmp.z - c.pos.z) > 0.01) {
            c.pos.x = tmp.x;
            c.pos.z = tmp.z;
            c.phase = 'fall';
            c.t = 0;
            c.speed = 0;
            break;
          }
        }
      }
      c.spin += (CS.speed / CS.size) * dt * R.flySpin;
      if (c.phase !== 'fly') {
        /* (dropped at a wall) */
      } else if (hit) {
        // damage and the impact flash; it drops where it struck and falls over
        if (this.#impact(hit, c.pos.clone(), CS.damage, 'cog', c.end.clone().sub(c.start).normalize())) this.stats.hits++;
        c.hit = true;
        c.phase = 'fall';
        c.t = 0;
        c.speed = 0;
      } else if (c.u >= 1) {
        // landed: a little bounce, then it rolls on along the way it was thrown
        c.phase = 'roll';
        c.speed = R.speed;
        c.vy = c.pos.y > rest + 0.2 ? 0 : R.landBounce;
      }
    }
    if (c.phase === 'roll' || c.phase === 'wobble') {
      const step = c.speed * dt;
      c.pos.addScaledVector(c.dir, step);
      c.spin += (c.speed / CS.size) * dt;
      // a wall (the plaza's wall, a pillar, the road's side walls): it stops there and falls over
      const world = this.horse.world;
      if (world?.collide) {
        const tmp = new THREE.Vector3(c.pos.x, rest, c.pos.z);
        const vel = c.dir.clone().multiplyScalar(c.speed);
        world.collide(tmp, vel, CS.size);
        if (Math.hypot(tmp.x - c.pos.x, tmp.z - c.pos.z) > 0.01) {
          c.pos.x = tmp.x;
          c.pos.z = tmp.z;
          c.speed = 0;
        }
      }
      if (c.phase === 'roll') {
        c.speed = Math.max(0, c.speed - R.decel * dt);
        const t = this.#robotAt(new THREE.Vector3(c.pos.x, c.ground + CS.size, c.pos.z), c.struck ??= new Set()); // (a robot it rolls into, once each)
        if (t) {
          c.struck.add(t);
          if (this.#impact(t, c.pos.clone(), CS.damage, 'cog', c.dir.clone())) this.stats.hits++;
          c.speed = 0;
        }
        if (c.speed < R.fallSpeed) {
          c.phase = 'wobble';
          c.t = 0;
        }
      } else {
        c.speed = Math.max(0, c.speed - R.decel * dt);
        c.t += dt;
        // the wobble: it sways more and more, then tips over and lies flat
        const k = Math.min(1, c.t / R.wobble);
        c.lean = Math.sin(c.t * R.wobbleRate) * R.wobbleAmp * k;
        if (c.t >= R.wobble) {
          c.phase = 'fall';
          c.t = 0;
          c.leanFrom = c.lean;
        }
      }
    }
    // height: falling to the ground, the landing bounce, rolling along it
    if (c.phase !== 'fly') {
      if (c.phase === 'fall') {
        c.t += dt;
        const k = Math.min(1, c.t / R.fall);
        c.lean = (c.leanFrom ?? 0) + (Math.PI / 2 - (c.leanFrom ?? 0)) * k * k; // (tips over onto its face)
        const floor = c.ground + CS.size * Math.cos(c.lean) + 0.06;
        c.vy -= R.gravity * dt; // (dropping from where it struck, then settling on the ground)
        c.pos.y = Math.max(floor, c.pos.y + c.vy * dt);
        if (c.pos.y <= floor) c.vy = 0;
        c.speed = 0;
        if (c.t >= R.fall + R.fade) {
          this.cog = null;
          this.cogMesh.visible = false;
          this.cogMesh.material.opacity = 1;
          return;
        }
        this.cogMesh.material.opacity = c.t > R.fall ? Math.max(0, 1 - (c.t - R.fall) / R.fade) : 1;
      } else {
        c.vy -= R.gravity * dt;
        c.pos.y += c.vy * dt;
        if (c.pos.y <= rest) {
          c.pos.y = rest;
          if (!c.landed && c.vy < -1) {
            c.landed = true;
            c.vy = R.landBounce; // (the one bounce)
            this.fx.burst(new THREE.Vector3(c.pos.x, c.ground + 0.1, c.pos.z), 5, { speed: 2, life: 0.3, size: 0.09, color: CS.color, up: 0.8 });
          } else c.vy = 0;
        }
      }
    }
    this.cogMesh.position.copy(c.pos);
    // upright on its edge, facing its way; spinning round its axle; leaning (the wobble, the fall)
    this.cogMesh.rotation.set(c.lean, -Math.atan2(c.dir.z, c.dir.x), -c.spin, 'YXZ');
  }

  /**
   * Gear Wheel: a real wheel — it stands upright like a coin on its edge, thrown forward from AJ's hand in a small arc, a little bounce on
   * landing, then it rolls along the ground (toward the nearest foe, else ahead), spinning round its axle as fast as it travels
   * (speed ÷ radius), leaning a little into turns. Hitting a small or medium robot: damage, the impact flash, then it keeps
   * `wheelSpeedKeepOnHit` of its speed, pops up and rolls on the same way (each robot once per throw). A wall: a gentle bounce keeping
   * `wheelWallBounceKeep` of its speed. The Guardian: damage, then it drops and stops. It fades out at the end of its range.
   */
  #rollWheel(hand, target) {
    const t = this.#valid(target) ? target : this.pick(GW.range);
    const { fwd } = this.#origin();
    const h = this.hero.position;
    let dir = fwd.clone().setY(0).normalize();
    if (t) dir = new THREE.Vector3(t.position.x - h.x, 0, t.position.z - h.z).normalize();
    const ground = this.horse.mounted ? this.horse.position.y : h.y;
    this.wheel = {
      pos: new THREE.Vector3(hand.x + dir.x * 0.4, hand.y, hand.z + dir.z * 0.4),
      dir, speed: GW.speed + (this.horse.mounted ? Math.abs(this.horse.speed) * 0.5 : 0), travelled: 0, hit: new Set(), ground,
      phase: 'air', air: 0, y0: hand.y, vy: 0, bounces: 0, fade: 0, stopped: false, lean: 0, turn: 0,
    };
    this.wheelGear.material.opacity = 1;
    this.wheelMesh.visible = true;
    this.wheelMesh.position.copy(this.wheel.pos);
    this.wheelMesh.rotation.set(0, -Math.atan2(dir.z, dir.x), 0);
    this.stats.wheels = (this.stats.wheels ?? 0) + 1;
  }

  #rollOn(dt) {
    const w = this.wheel;
    const rest = w.ground + GW.radius; // (the axle's height when it rolls)
    const world = this.horse.world;
    const step = w.speed * dt;
    const n = Math.max(1, Math.ceil(step / 0.6));
    const tmp = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const prevDir = w.dir.clone();
    for (let i = 0; i < n && !w.stopped; i++) {
      w.pos.addScaledVector(w.dir, step / n);
      // a wall (the plaza's wall, a pillar, the road's side walls and fences): a gentle bounce
      if (world?.collide && w.bounces < GW.maxBounces && w.phase === 'roll') {
        tmp.set(w.pos.x, rest, w.pos.z);
        vel.copy(w.dir).multiplyScalar(w.speed);
        world.collide(tmp, vel, GW.radius * 0.5);
        const dx = tmp.x - w.pos.x;
        const dz = tmp.z - w.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          const nx = dx / d;
          const nz = dz / d;
          const into = w.dir.x * nx + w.dir.z * nz;
          if (into < 0) w.dir.set(w.dir.x - 2 * into * nx, 0, w.dir.z - 2 * into * nz).normalize();
          w.pos.x = tmp.x;
          w.pos.z = tmp.z;
          w.bounces++;
          w.speed *= GW.wheelWallBounceKeep;
          w.vy = GW.wallPop;
          this.sound?.play('batarang_hit', { position: w.pos, pitch: 0.5, volume: 0.5 });
          this.fx.burst(w.pos, 5, { speed: 2.5, life: 0.3, size: 0.09, color: GW.color, up: 1 });
        }
      }
      const t = this.#wheelAt(w.pos, w.hit);
      if (t) {
        w.hit.add(t); // (once per robot per throw)
        if (this.#impact(t, w.pos.clone(), GW.damage * this.damageScale, 'wheel', w.dir)) this.stats.hits++; // (the impact flash, the number popup and the shake)
        if (t.isBoss) {
          w.speed = 0; // (the Guardian: it drops and stops)
          w.stopped = true;
          w.vy = 0;
          w.phase = 'roll';
          w.fade = GW.fade;
          this.stats.wheelStops = (this.stats.wheelStops ?? 0) + 1;
        } else {
          w.speed *= GW.wheelSpeedKeepOnHit; // (it loses most of its speed, pops up and rolls on the same way)
          w.vy = GW.hitPop;
          this.stats.wheelHits = (this.stats.wheelHits ?? 0) + 1;
        }
      }
    }
    w.travelled += step;
    // height: thrown in an arc from the hand, a small bounce where it lands, then rolling on the ground (pops from hits and walls fall back)
    if (w.phase === 'air') {
      w.air = Math.min(1, w.air + dt / GW.throwArc.time);
      const u = w.air;
      w.pos.y = w.y0 + (rest - w.y0) * u + GW.throwArc.height * 4 * u * (1 - u);
      if (u >= 1) {
        w.phase = 'roll';
        w.vy = GW.throwArc.landBounce;
        this.fx.burst(new THREE.Vector3(w.pos.x, w.ground + 0.1, w.pos.z), 5, { speed: 2, life: 0.3, size: 0.09, color: GW.color, up: 0.8 });
      }
    } else {
      w.vy -= GW.gravity * dt;
      w.pos.y += w.vy * dt;
      if (w.pos.y <= rest) {
        w.pos.y = rest;
        w.vy = 0;
      }
    }
    // the end: out of range, or too slow to roll on — it fades away
    if (!w.fade && (w.travelled >= GW.range || w.speed < GW.stopSpeed)) w.fade = GW.fade;
    if (w.fade) {
      w.fade = Math.max(0, w.fade - dt);
      this.wheelGear.material.opacity = Math.max(0, w.fade / GW.fade);
      w.speed *= Math.max(0, 1 - dt * 3);
      if (w.fade <= 0) {
        this.wheel = null;
        this.wheelMesh.visible = false;
        this.wheelGear.material.opacity = 1;
        return;
      }
    }
    // upright, facing its way; spinning round its axle with the ground; a little lean into turns
    const turn = Math.atan2(prevDir.x * w.dir.z - prevDir.z * w.dir.x, prevDir.x * w.dir.x + prevDir.z * w.dir.z);
    w.lean += ((GW.lean.max * Math.max(-1, Math.min(1, turn / Math.max(dt, 1e-3) / GW.lean.rate))) - w.lean) * Math.min(1, dt * GW.lean.ease);
    this.wheelMesh.position.copy(w.pos);
    this.wheelMesh.rotation.set(w.lean, -Math.atan2(w.dir.z, w.dir.x), 0, 'YXZ');
    this.wheelGear.rotation.z -= (w.speed / GW.radius) * dt;
    this.sound?.manager?.setLoop('gearRoll', GW.roll, { volume: 0.5 * Math.min(1, w.speed / GW.speed), rate: 0.8 + 0.4 * Math.min(1, w.speed / GW.speed), position: w.pos });
    if (w.phase === 'roll' && w.pos.y <= rest + 0.05 && Math.random() < dt * 30 * Math.min(1, w.speed / GW.speed)) this.fx.emit(w.pos.clone().setY(w.ground + 0.1), new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), { life: 0.3, size: 0.09, color: F.accent2, g: 6 });
  }

  /** The ball bursts: everyone within the splash takes the damage and catches fire. */
  #explode(at) {
    this.ball = null;
    this.ballMesh.visible = false;
    this.fx.burst(at, 26, { speed: 6.5, life: 0.9, size: 0.2, up: 3 });
    this.ring.position.set(at.x, Math.max(0.05, at.y - 0.4), at.z);
    this.ring.position.y = Math.max(0.06, this.ring.position.y);
    this.ring.scale.setScalar(1);
    this.ring.material.opacity = 0.9;
    this.sound?.play('fire_blast_hit', { position: at });
    for (const t of this.#live()) {
      if (!t.alive || t.untargetable) continue;
      const d = Math.hypot(t.position.x - at.x, t.position.z - at.z) - t.radius;
      if (d > FB.splash || at.y > t.position.y + t.height + 1.5) continue;
      t.takeHit(FB.damage, 'fire');
      t.ignite?.(FB.burn.time, FB.burn.dps);
    }
    this.onEvent?.('blast', { at });
  }

  // --- the Shield ----------------------------------------------------------------

  #updateShield(dt) {
    const m = this.shieldMesh;
    if (this.shieldRemaining > 0) {
      this.shieldAge += dt;
      this.shieldRemaining -= dt;
      if (this.shieldRemaining <= 0) {
        this.shieldRemaining = 0;
        this.cooldowns.shield = SH.cooldown;
      }
    }
    if (!m) return;
    m.visible = this.shieldRemaining > 0;
    if (!m.visible) return;
    const D = SH.disc;
    const { at, heading, fwd } = this.#origin();
    m.position.set(at.x + fwd.x * D.ahead, this.hero.position.y + D.height, at.z + fwd.z * D.ahead);
    m.rotation.y = heading;
    const perfect = this.shieldAge <= SH.perfectWindow;
    m.material.color.setHex(perfect ? D.perfect : SH.color);
    m.scale.setScalar(1 + D.pulse * (perfect ? 1 - this.shieldAge / SH.perfectWindow : 0));
  }

  /**
   * An attack from `source` at `from` is about to land: the Shield stops it when it is up, the attack is one it blocks and it comes from the front.
   * 'perfect' inside the first `perfectWindow` s after the raise, else 'block'; null: it lands.
   */
  shieldBlock(from, source) {
    if (this.shieldRemaining <= 0 || !SH.blocks.includes(source)) return null;
    const { at, fwd } = this.#origin();
    const dx = from.x - at.x;
    const dz = from.z - at.z;
    const len = Math.hypot(dx, dz) || 1;
    if ((dx * fwd.x + dz * fwd.z) / len < SH.frontDot) return null;
    const kind = this.shieldAge <= SH.perfectWindow ? 'perfect' : 'block';
    this.stats.blocks = (this.stats.blocks ?? 0) + 1;
    if (kind === 'perfect') this.stats.perfects = (this.stats.perfects ?? 0) + 1;
    this.sound?.play(kind === 'perfect' ? 'shield_perfect' : 'shield_block', { position: at });
    this.fx.impact(new THREE.Vector3(at.x + fwd.x * SH.disc.ahead, at.y, at.z + fwd.z * SH.disc.ahead), kind === 'perfect' ? SH.disc.perfect : SH.color);
    this.cam?.shake?.(F.weaponImpact.shake, F.weaponImpact.shakeTime);
    return kind;
  }

  /** Fire Blast unlocked (the Fire Element recovered). */
  unlockFire() {
    this.fireUnlocked = true;
  }
}
