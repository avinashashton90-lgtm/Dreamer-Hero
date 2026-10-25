import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadBatarangModel } from '../abilities.js';
import { gearGeometry } from '../portal.js';

// Part 2's fighting (the Fire level): the cheap particle pool the fire is made of (`FireFx`: one
// additive InstancedMesh of embers, flames and sparks) and the hero's `Arsenal` — the Batarang
// (1 gem a throw, auto-aimed at the nearest foe, preferring ones ahead, out and back, the
// ammo shown as the button's badge) and, once the Fire Element is recovered, Fire Blast (a ball of
// fire thrown in an arc: 3 times the Batarang's damage, and it burns for 3 s; a cooldown ring
// instead of a count). Both work on horseback and on foot. The Arsenal also has the small
// interface the HUD's ability buttons read (`has`, `usesLeft`, `cooldownFraction`, `canAfford`,
// `visible`, `layout`), so the same buttons serve here as in Part 1. Targets (foes and the boss)
// implement { alive, position (feet), radius, height, takeHit(damage, source), ignite(time, dps) }.

const F = CONFIG.part2.fire;
const BT = F.batarang;
const FB = F.fireBlast;
const CS = F.weapons.cogShot;
const GW = F.weapons.gearWheel;
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
    this.ammo = F.startAmmo;
    this.fireUnlocked = false; // (the Fire Element recovered: Fire Blast for the rest of Part 2)
    this.levelOn = false; // (in the Fire level: Fire Blast, Cog Shot and Gear Wheel are all his)
    this.keys = () => 0; // (the cog keys on hand: set by the level)
    this.spendKey = () => {};
    this.gearStock = 0; // (brass gears on hand for Gear Wheel shots; the level's gear counter, for the rewards, is separate)
    this.cooldowns = { batarang: 0, fireBlast: 0, cogShot: 0, gearWheel: 0 };
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
    this.hinted = false;
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
      this.cogMesh = new THREE.Mesh(gearGeometry(CS.size, 8, 0.25), new THREE.MeshLambertMaterial({ color: CS.color, emissive: 0x6a4a10 }));
      this.cogMesh.visible = false;
      scene.add(this.cogMesh);
      this.wheelMesh = new THREE.Group();
      this.wheelGear = new THREE.Mesh(gearGeometry(GW.radius, 12, 0.35), new THREE.MeshLambertMaterial({ color: GW.color, emissive: 0x4a3008 }));
      this.wheelMesh.add(this.wheelGear);
      this.wheelMesh.visible = false;
      scene.add(this.wheelMesh);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FB.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.ring);
    })();
  }

  // --- the HUD buttons' interface ------------------------------------------------

  has(name) {
    if (name === 'batarang') return true;
    if (name === 'fireBlast') return this.fireUnlocked || this.levelOn;
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
    if (name === 'cogShot') return this.cog ? 1 : this.cooldowns.cogShot / CS.cooldown;
    if (name === 'gearWheel') return this.wheel ? 1 : this.cooldowns.gearWheel / GW.cooldown;
    return 0;
  }

  canAfford(name) {
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
    if (this.pending || (name === 'batarang' && this.proj)) return 'busy';
    if (this.cooldowns[name] > 0) return 'cooldown';
    if (name === 'batarang' && this.ammo <= 0) return 'gems';
    if (name === 'cogShot' && this.usesLeft(name) <= 0) return 'keys';
    if (name === 'gearWheel' && this.usesLeft(name) <= 0) return 'gears';
    return null;
  }

  /** Use an ability (button / key). True if it fired. */
  use(name) {
    const why = this.blockReason(name);
    if (why) {
      this.stats.blocked++;
      if (why === 'gems' || why === 'keys' || why === 'gears') this.onEvent?.('blocked', { name, why });
      return false;
    }
    if (name === 'batarang') this.ammo--;
    else if (name === 'cogShot') this.spendKey(CS.keys);
    else if (name === 'gearWheel') this.gearStock -= GW.gears;
    this.cooldowns[name] = { batarang: BT.cooldown, fireBlast: FB.cooldown, cogShot: CS.cooldown, gearWheel: GW.cooldown }[name];
    this.pending = { name, t: 0, target: this.pick() };
    this.hero.throwAnim = { kind: 'throw', t: 0 };
    this.#face(this.pending.target);
    this.onEvent?.('use', { name });
    return true;
  }

  /** A new game or a respawn: nothing in flight, cooldowns clear (the unlock and the gems stay). */
  clear() {
    this.pending = null;
    this.proj = null;
    this.ball = null;
    this.cog = null;
    this.wheel = null;
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

  /** The nearest living foe within range in any direction, preferring ones ahead (one behind counts `prefer`× as far). */
  pick(range = BT.range) {
    const { at, fwd } = this.#origin();
    let best = null;
    let bd = Infinity;
    for (const t of this.targets()) {
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
    if (!target || this.horse.mounted) return;
    this.hero.facing = Math.atan2(target.position.x - this.hero.position.x, target.position.z - this.hero.position.z);
  }

  #centre(t) {
    return new THREE.Vector3(t.position.x, t.position.y + Math.max(0.6, t.height * 0.55), t.position.z);
  }

  /** The foe whose hit body (a vertical capsule from its feet, padded) contains `p`, other than those in `skip`. */
  #foeAt(p, skip, pad = F.hit.pad) {
    for (const t of this.targets()) {
      if (!t.alive || skip.has(t) || t.untargetable) continue;
      if (p.y < t.position.y - pad || p.y > t.position.y + t.height + pad) continue;
      if (Math.hypot(p.x - t.position.x, p.z - t.position.z) <= t.radius + pad) return t;
    }
    return null;
  }

  #robotAt(p, skip) {
    for (const t of this.targets()) {
      if (!t.alive || skip.has(t) || t.untargetable) continue;
      const centre = this.#centre(t);
      if (p.distanceToSquared(centre) <= F.hit.robotRadius ** 2) return t;
    }
    return null;
  }

  #wheelAt(p, skip) {
    const wheelRadius = GW.radius;
    const hitSphere = (t, centre, radius) => p.distanceToSquared(centre) <= (wheelRadius + radius) ** 2;
    for (const t of this.targets()) {
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
    this.fx.impact(at, source === 'cog' ? CS.color : GW.color);
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
        else if (name === 'gearWheel') this.#rollWheel(target);
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

  #throwBatarang(hand, target) {
    const t = target?.alive ? target : this.pick();
    const { fwd } = this.#origin();
    const dir = t ? this.#centre(t).sub(hand).normalize() : fwd.clone();
    this.proj = { phase: 'out', pos: hand.clone(), dir, target: t, age: 0, travelled: 0, hit: new Set(), back: new Set() };
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
      if (b.target?.alive) {
        const want = this.#centre(b.target).sub(b.pos).normalize();
        const turn = THREE.MathUtils.degToRad(BT.turn) * dt;
        const ang = Math.min(b.dir.angleTo(want), turn);
        if (ang > 1e-4) b.dir.applyAxisAngle(new THREE.Vector3().crossVectors(b.dir, want).normalize(), ang);
      }
      const step = (BT.speed + rider * 0.3) * dt;
      this.#sweep(b, step, b.hit, () => (b.phase = 'back'));
      b.travelled += step;
      if (b.phase === 'out' && (b.travelled >= BT.range || (b.target && !b.target.alive && !this.pick()))) b.phase = 'back';
      if (b.phase === 'out' && b.target && !b.target.alive) b.phase = 'back';
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
      const t = this.#foeAt(b.pos, hits);
      if (t) {
        hits.add(t);
        this.stats.hits++;
        if (t.takeHit(BT.damage, 'batarang') !== false) this.sound?.play('batarang_hit', { position: b.pos });
        this.fx.burst(b.pos, 5, { speed: 3, life: 0.35, size: 0.1, color: BT.color, up: 1 });
        if (onHit) {
          onHit();
          return;
        }
      }
    }
  }

  #throwBall(hand, target) {
    const t = target?.alive ? target : this.pick(FB.range);
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
    if (f.target?.alive) f.end.copy(this.#centre(f.target)); // (it follows its target)
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

  /** Cog Shot: a spinning golden cog thrown in an arc at the nearest foe (or ahead); 2 damage where it lands. */
  #throwCog(hand, target) {
    const t = target?.alive ? target : this.pick(CS.range);
    const { fwd } = this.#origin();
    const end = t ? this.#centre(t) : hand.clone().addScaledVector(fwd, CS.forward).setY(this.hero.position.y + 0.4);
    this.cog = { start: hand.clone(), end, dist: Math.max(2, hand.distanceTo(end)), u: 0, pos: hand.clone(), target: t };
    this.cogMesh.visible = true;
    this.cogMesh.position.copy(hand);
    this.stats.cogs = (this.stats.cogs ?? 0) + 1;
  }

  #flyCog(dt) {
    const c = this.cog;
    const rider = this.horse.mounted ? Math.abs(this.horse.speed) : 0;
    if (c.target?.alive) c.end.copy(this.#centre(c.target));
    const oldU = c.u;
    c.u = Math.min(1, c.u + ((CS.speed + rider * 0.2) * dt) / c.dist);
    const pointAt = (u) => c.start.clone().lerp(c.end, u).setY(c.start.y + (c.end.y - c.start.y) * u + CS.arc * 4 * u * (1 - u));
    const stepCount = Math.max(1, Math.ceil(c.pos.distanceTo(pointAt(c.u)) / 0.4));
    let hit = null;
    for (let i = 1; i <= stepCount; i++) {
      c.pos.copy(pointAt(oldU + ((c.u - oldU) * i) / stepCount));
      hit = this.#robotAt(c.pos, new Set());
      if (hit) break;
    }
    this.cogMesh.position.copy(c.pos);
    this.cogMesh.rotation.x += 14 * dt;
    this.cogMesh.rotation.y += 9 * dt;
    if (hit) {
      this.cog = null;
      this.cogMesh.visible = false;
      if (this.#impact(hit, c.pos.clone(), CS.damage, 'cog', c.end.clone().sub(c.start).normalize())) this.stats.hits++;
    } else if (c.u >= 1) {
      this.cog = null;
      this.cogMesh.visible = false;
    }
  }

  /**
   * Gear Wheel: a fast spinning wheel rolls along the ground (toward the nearest foe, else ahead). It spins as it rolls
   * (speed ÷ radius), hops a little and bounces off walls (`GW.wallKeep` of its speed kept, `GW.maxBounces` at most),
   * and rebounds off the first robot it hits (damage as usual, then back the way it came). Everything it touches takes
   * `GW.damage` once; the `gear_roll` loop plays while it rolls.
   */
  #rollWheel(target) {
    const t = target?.alive ? target : this.pick(GW.range);
    const { fwd } = this.#origin();
    const h = this.hero.position;
    let dir = fwd.clone().setY(0).normalize();
    if (t) dir = new THREE.Vector3(t.position.x - h.x, 0, t.position.z - h.z).normalize();
    const ground = this.horse.mounted ? this.horse.position.y : h.y;
    this.wheel = {
      pos: new THREE.Vector3(h.x + dir.x * 1.2, ground + GW.radius, h.z + dir.z * 1.2),
      dir, travelled: 0, hit: new Set(), ground, k: 1, bounces: 0, rebounded: false, hopT: 0,
    };
    this.wheelMesh.visible = true;
    this.wheelMesh.position.copy(this.wheel.pos);
    this.wheelMesh.rotation.y = -Math.atan2(dir.z, dir.x); // (its axle across its way)
    this.stats.wheels = (this.stats.wheels ?? 0) + 1;
  }

  #rollOn(dt) {
    const w = this.wheel;
    const rider = this.horse.mounted ? Math.abs(this.horse.speed) : 0;
    const speed = (GW.speed + rider * 0.5) * w.k;
    const step = speed * dt;
    const n = Math.max(1, Math.ceil(step / 0.6));
    const world = this.horse.world;
    const tmp = new THREE.Vector3();
    const vel = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      w.pos.addScaledVector(w.dir, step / n);
      // a wall (the plaza's wall, a pillar, the road's side walls and fences): bounce off it, a little slower
      if (world?.collide && w.bounces < GW.maxBounces) {
        tmp.set(w.pos.x, w.ground + GW.radius, w.pos.z);
        vel.copy(w.dir).multiplyScalar(speed);
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
          w.k *= GW.wallKeep;
          w.hopT = GW.hopTime;
          this.sound?.play('batarang_hit', { position: w.pos, pitch: 0.5, volume: 0.6 });
          this.fx.burst(w.pos, 6, { speed: 3, life: 0.3, size: 0.1, color: GW.color, up: 1 });
        }
      }
      const t = this.#wheelAt(w.pos, w.hit);
      if (t) {
        w.hit.add(t);
        if (this.#impact(t, w.pos.clone(), GW.damage, 'wheel', w.dir)) this.stats.hits++; // (the impact flash, the number popup and the shake)
        if (!w.rebounded) {
          // it reflects off the first robot it hits: back off the robot's side, with room to roll home
          let nx = w.pos.x - t.position.x;
          let nz = w.pos.z - t.position.z;
          const d = Math.hypot(nx, nz) || 1;
          nx /= d;
          nz /= d;
          const into = w.dir.x * nx + w.dir.z * nz;
          if (t.isBoss || into >= 0) w.dir.negate();
          else w.dir.set(w.dir.x - 2 * into * nx, 0, w.dir.z - 2 * into * nz).normalize();
          w.pos.addScaledVector(w.dir, GW.radius * 0.2);
          w.rebounded = true;
          w.k *= GW.reboundKeep;
          w.hopT = GW.hopTime;
          w.travelled = Math.min(w.travelled, GW.range * 0.4);
          this.stats.rebounds = (this.stats.rebounds ?? 0) + 1;
        }
      }
    }
    w.travelled += step;
    if (w.hopT > 0) w.hopT = Math.max(0, w.hopT - dt);
    const hop = w.hopT > 0 ? Math.sin(Math.PI * (1 - w.hopT / GW.hopTime)) * GW.hop : 0;
    w.pos.y = w.ground + GW.radius + hop;
    this.wheelMesh.position.copy(w.pos);
    this.wheelMesh.rotation.y = -Math.atan2(w.dir.z, w.dir.x);
    this.wheelGear.rotation.z -= (speed / GW.radius) * dt; // (rolling: the rim keeps pace with the ground)
    this.sound?.manager?.setLoop('gearRoll', GW.roll, { volume: 0.5, rate: 0.8 + 0.4 * w.k, position: w.pos });
    if (Math.random() < dt * 30) this.fx.emit(w.pos.clone().setY(w.ground + 0.1), new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2), { life: 0.3, size: 0.09, color: F.accent2, g: 6 });
    if (w.travelled >= GW.range) {
      this.wheel = null;
      this.wheelMesh.visible = false;
    }
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
    for (const t of this.targets()) {
      if (!t.alive || t.untargetable) continue;
      const d = Math.hypot(t.position.x - at.x, t.position.z - at.z) - t.radius;
      if (d > FB.splash || at.y > t.position.y + t.height + 1.5) continue;
      t.takeHit(FB.damage, 'fire');
      t.ignite?.(FB.burn.time, FB.burn.dps);
    }
    this.onEvent?.('blast', { at });
  }

  /** Fire Blast unlocked (the Fire Element recovered). */
  unlockFire() {
    this.fireUnlocked = true;
  }
}
