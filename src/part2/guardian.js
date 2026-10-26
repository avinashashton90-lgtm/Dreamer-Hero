import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadRobotModel } from './robots.js';
import { makeFloorMaterial } from './floor.js';

// The Furnace Guardian (George, the big armoured mech, tinted a hot red-orange with a glowing
// chest furnace) and the sealed circular plaza he guards (CONFIG.part2.fire.arena / .boss). Four
// attacks (the Fire Ball is a longer-range projectile fired from his chest; the Shield blocks it, the Steam Burst and the Charge, never the Stomp), each telegraphed on the floor and called out by Tick:
//   Stomp         rears up and slams; a shockwave ring spreads from his feet — AJ must be in the air
//                 (jump) when it passes him, or it costs a heart.
//   Steam Burst   a cone of steam from the furnace (marked on the floor first): half a heart.
//   Furnace Charge  head down, a pause, a straight rush along a marked lane; into a pillar he stuns
//                 himself for 3 s (taking extra damage), at the wall he only recovers.
// He is leashed to the plaza, regenerates slowly once AJ stops hurting him (the Part 1 arena's
// bossRegenDelay / bossRegenPercentPerSec), and below half health he is faster.

const F = CONFIG.part2.fire;
const B = F.boss;
const A = F.arena;
const AR = CONFIG.arena;
const RG = A.bossRegenPercentPerSec / 100;
const WHITE = new THREE.Color(0xffffff);

/** The plaza: a silver floor ringed by a low brass wall, a furnace glow at its foot, pillars, the entrance arch and its steam barrier. */
export async function buildArena() {
  const group = new THREE.Group();
  group.name = 'furnaceArena';
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(A.radius, A.radius, 0.6, 56), makeFloorMaterial());
  floor.position.y = -0.3;
  // (the far land under the fog)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a1a14 }));
  ground.position.y = -0.7;
  const brass = new THREE.MeshLambertMaterial({ color: 0xb8803a, emissive: 0x2a1204 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a24 });
  const wall = new THREE.Mesh(new THREE.TorusGeometry(A.wall, 0.45, 6, 64).rotateX(Math.PI / 2), brass);
  wall.position.y = 0.55;
  const glow = new THREE.Mesh(new THREE.RingGeometry(A.wall - 1.6, A.wall - 0.2, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.04;
  group.add(ground, floor, wall, glow);
  // Pillars (the Guardian's charge stuns him on them).
  const P = A.pillars;
  const pillars = [];
  for (let i = 0; i < P.count; i++) {
    const a = (i / P.count) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(a) * P.ring;
    const z = Math.cos(a) * P.ring;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(P.radius, P.radius * 1.15, P.height, 12), dark);
    col.position.set(x, P.height / 2, z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(P.radius * 1.08, P.radius * 1.08, 0.5, 12), new THREE.MeshBasicMaterial({ color: F.accent }));
    band.position.set(x, 1.4, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(P.radius * 1.3, P.radius, 0.6, 12), brass);
    cap.position.set(x, P.height + 0.3, z);
    group.add(col, band, cap);
    pillars.push({ x, z, r: P.radius, bottom: 0, top: P.height });
  }
  // The entrance (south, +z): two posts and an arch, and the steam barrier between them.
  const g = A.gate;
  const gate = new THREE.Group();
  gate.position.set(0, 0, A.wall);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 8, 10), brass);
    post.position.set((sx * g.width) / 2, 4, 0);
    gate.add(post);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(g.width + 1.6, 0.8, 1.2), brass);
  arch.position.y = 8.2;
  gate.add(arch);
  const barrierMat = new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(g.width, 8), barrierMat);
  barrier.position.y = 4;
  gate.add(barrier);
  group.add(gate);
  group.userData = { pillars, barrier, gate };
  return group;
}

export class Guardian {
  /**
   * @param {{ scene, world, hero, horse?, fx, sound, hitHero(n, from, opts), call(kind), assets }} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.radius = B.radius * 0.8; // (the Batarang's hit body; the collision radius is B.radius)
    this.height = B.height;
    this.hp = this.maxHp = F.fireBossHealth;
    this.alive = false;
    this.active = false;
    this.isBoss = true;
    this.state = 'idle';
    this.t = 0;
    this.cool = { stomp: 0, steam: 0, charge: 0, fireball: 0 };
    this.balls = []; // fire balls in flight { mesh, pos, vel, age }
    this.sinceHit = 0;
    this.regenerating = false;
    this.burn = null;
    this.flash = 0;
    this.whiteFlash = 0;
    this.evadeCooldown = 0;
    this.evadeT = 0;
    this.getWheelThreat = null;
    this.marksDone = new Set();
    this.centre = new THREE.Vector3();
    this.pillars = [];
    this.stats = { stomps: 0, steams: 0, charges: 0, stuns: 0, hits: 0 };
  }

  get enraged() {
    return this.hp / this.maxHp < B.enrageAt;
  }

  async build() {
    const model = await loadRobotModel('boss', this.assets ?? {});
    // The hot red-orange glow: its own copies of the materials (the Robots test's George stays green).
    this.mats = [];
    this.hitMaterials = [];
    model.traverse((o) => {
      if (!o.isMesh || !o.material.isMeshLambertMaterial) return; // (his body; not the glowing eye)
      const src = o.material;
      const m = src.clone();
      m.onBeforeCompile = src.onBeforeCompile;
      m.customProgramCacheKey = () => 'guardian';
      m.color.lerp(new THREE.Color(B.glow.color), 0.35);
      if (m.emissive) m.emissive.setHex(B.glow.color);
      m.emissiveIntensity = B.glow.tint * 0.5;
      o.material = m;
      this.mats.push(m);
      this.hitMaterials.push({ material: m, color: m.color.clone(), emissive: m.emissive?.clone(), intensity: m.emissiveIntensity });
    });
    // The furnace in his chest.
    const fu = B.glow.furnace;
    this.furnace = new THREE.Group();
    this.furnace.add(
      new THREE.Mesh(new THREE.SphereGeometry(B.height * fu.size * 0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
      new THREE.Mesh(new THREE.SphereGeometry(B.height * fu.size * 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    this.furnace.position.set(0, B.height * fu.up, B.height * fu.out * 0.3);
    model.add(this.furnace);
    this.model = model;
    this.anim = model.userData.animator;
    model.visible = false;
    this.group = new THREE.Group();
    this.group.add(model);
    // Telegraphs on the floor.
    const red = (op) => new THREE.MeshBasicMaterial({ color: 0xff2a1c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.tgStomp = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), red(0.8));
    this.tgStompFill = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), red(0.18));
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: F.accent2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cone = new THREE.Mesh(new THREE.CircleGeometry(1, 24, -B.steam.angle / 2 + Math.PI / 2, B.steam.angle).rotateX(-Math.PI / 2), red(0.28));
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), red(0.28));
    for (const m of [this.tgStomp, this.tgStompFill, this.wave, this.cone, this.lane]) {
      m.visible = false;
      m.position.y = 0.07;
      this.group.add(m);
    }
  }

  /** Put him in the plaza at `centre` (a Vector3), AJ-side spawn given by the arena config. */
  place(centre) {
    this.centre.copy(centre);
    this.position.set(centre.x + A.boss[0], 0, centre.z + A.boss[1]);
    this.heading = 0;
  }

  /** A fresh fight: full health, waiting for AJ. */
  reset() {
    this.hp = this.maxHp = F.fireBossHealth;
    this.alive = this.active = true;
    this.state = 'idle';
    this.t = 0;
    this.cool = { stomp: 0, steam: 0, charge: 1, fireball: 2 };
    for (const b of this.balls ?? []) b.mesh.visible = false;
    this.balls = [];
    this.sinceHit = 0;
    this.regenerating = false;
    this.burn = null;
    this.flash = 0;
    this.whiteFlash = 0;
    this.evadeCooldown = 0;
    this.evadeT = 0;
    this.marksDone.clear();
    this.place(this.centre);
    this.model.visible = true;
    this.model.scale.setScalar(1);
    this.anim?.play('idle', { restart: true });
    this.#hideTelegraphs();
  }

  hide() {
    this.alive = this.active = false;
    for (const b of this.balls ?? []) b.mesh.visible = false;
    this.balls = [];
    if (this.model) this.model.visible = false;
    this.#hideTelegraphs();
  }

  #hideTelegraphs() {
    for (const m of [this.tgStomp, this.tgStompFill, this.wave, this.cone, this.lane]) if (m) m.visible = false;
  }

  /** Hits: weapons. A charge-stunned or perfect-blocked (staggered) Guardian takes extra damage. */
  takeHit(damage, source = 'batarang', impact = null) {
    if (!this.alive || this.state === 'dying') return false;
    if (this.state === 'idle') this.#notice();
    const multiplier = this.state === 'staggered' ? B.staggerDamage : this.state === 'stunned' ? B.charge.stunDamage : 1;
    const dmg = damage * multiplier;
    this.hp = Math.max(0, this.hp - dmg);
    this.sinceHit = 0;
    this.regenerating = false;
    this.flash = B.hurtFlash;
    if (source === 'cog' || source === 'wheel') {
      this.whiteFlash = F.hit.robotFlash;
      if (impact?.direction) {
        const push = impact.direction.clone().setY(0);
        if (push.lengthSq() > 1e-5) {
          push.normalize();
          this.#move(push.x, push.z, F.weaponImpact.push);
        }
      }
    }
    this.stats.hits++;
    if (!this.marksDone.has(0) && this.hp / this.maxHp <= A.potionMark) {
      this.marksDone.add(0);
      this.onMark?.(0); // (the green potion at the half-way mark)
    }
    if (this.hp <= 0) this.#die();
    return dmg;
  }

  stagger(duration = B.staggerDuration) {
    if (!this.alive || this.state === 'dying' || this.state === 'dead') return false;
    this.state = 'staggered';
    this.staggerDuration = duration;
    this.t = 0;
    this.#hideTelegraphs();
    this.lane.visible = false;
    this.anim?.play('hit', { once: true, restart: true });
    this.stats.parries = (this.stats.parries ?? 0) + 1;
    this.onStagger?.();
    return true;
  }

  ignite(time, dps) {
    if (this.alive) this.burn = { t: time, dps };
  }

  #notice() {
    this.state = 'chase';
    this.t = 0;
    this.anim?.play('walk');
    this.onNotice?.();
  }

  #die() {
    this.alive = false;
    this.state = 'dying';
    this.t = 0;
    this.burn = null;
    this.#hideTelegraphs();
    this.anim?.play('death', { once: true, restart: true });
    this.sound?.play('boss_mech_death', { position: this.position });
    this.onDying?.();
  }

  /** AJ was revived in the plaza: he gets back half the damage dealt and backs off to the far side for the protection time. */
  reviveRecover(fraction = A.reviveRecover) {
    if (!this.model.visible || this.state === 'dying' || this.state === 'dead') return;
    this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - this.hp) * fraction);
    this.state = 'retreat';
    this.t = 0;
    this.#hideTelegraphs();
    this.anim?.play('walk', { restart: true });
  }

  // --- the loop --------------------------------------------------------------------

  update(dt, playing = true) {
    if (!this.model?.visible) return;
    const hero = this.hero;
    // AJ is down (or getting up): whatever he was doing stops, and nothing new starts until he is alive again
    if (hero.life && hero.life !== 'alive' && this.alive && ['stompWind', 'stompRing', 'steamWind', 'steam', 'chargeWind', 'charge', 'fireWind'].includes(this.state)) {
      this.#hideTelegraphs();
      this.#toRecover();
    }
    this.t += dt;
    for (const k of Object.keys(this.cool)) this.cool[k] = Math.max(0, this.cool[k] - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt);
    if (playing) {
      this.evadeCooldown = Math.max(0, this.evadeCooldown - dt);
      this.evadeT = Math.max(0, this.evadeT - dt);
    }
    const hot = 0.45 + 0.1 * Math.sin(performance.now() / 260);
    const white = this.whiteFlash > 0 ? this.whiteFlash / F.hit.robotFlash : 0;
    for (const entry of this.hitMaterials) {
      entry.material.color.copy(entry.color).lerp(WHITE, white);
      if (entry.emissive) entry.material.emissive.copy(white > 0 ? WHITE : entry.emissive);
      entry.material.emissiveIntensity = B.glow.tint * (hot + (this.flash > 0 ? 0.9 : 0) + (this.state === 'steamWind' || this.state === 'stompWind' ? 0.5 : 0)) + white * 1.5;
    }
    this.furnace.scale.setScalar(1 + 0.12 * Math.sin(performance.now() / 120));
    if (!playing) {
      this.anim?.update(0);
      return;
    }
    if (this.burn && this.alive) {
      this.burn.t -= dt;
      this.fx.flame(this.position.clone().setY(B.height * 0.6), 1.4);
      this.takeHit(this.burn.dps * dt, 'burn');
      if (this.burn && this.burn.t <= 0) this.burn = null;
    }
    // Regeneration: once nothing has hurt him for a while, a slow heal (any hit stops it at once).
    if (this.alive && this.state !== 'idle') {
      this.sinceHit += dt;
      this.regenerating = this.sinceHit >= A.bossRegenDelay && this.hp < this.maxHp;
      if (this.regenerating) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * RG * dt);
    }
    this.#updateBalls(dt);
    this.#considerWheelJump();
    const to = hero.position;
    const dx = to.x - this.position.x;
    const dz = to.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const rate = this.enraged ? B.recoverEnraged / B.recover : 1;
    switch (this.state) {
      case 'idle':
        this.#face(dx, dz, dt);
        if (dist < A.notice) this.#notice();
        break;
      case 'chase': {
        this.#face(dx, dz, dt);
        const speed = this.enraged ? B.walkEnraged : B.walk;
        if (dist > 5) this.#move(Math.sin(this.heading), Math.cos(this.heading), speed * dt);
        this.#choose(dist);
        break;
      }
      case 'recover':
        if (this.t >= (this.enraged ? B.recoverEnraged : B.recover)) {
          this.state = 'chase';
          this.t = 0;
          this.anim?.play('walk');
        }
        break;
      case 'stompWind': {
        // A clear 1.5 s telegraph (not shortened when enraged): the whole danger ring marked on the floor at
        // once (its outline pulsing) and a red fill spreading to it — a rising warning sound; he crouches
        // (the Jump clip timed to land exactly on the slam).
        const W = B.stomp.windup;
        const k = Math.min(1, this.t / W);
        this.#face(dx, dz, dt * 0.3);
        this.tgStomp.visible = this.tgStompFill.visible = true;
        this.tgStomp.scale.setScalar(B.stomp.fireWaveMaxRadius);
        this.tgStomp.material.opacity = 0.5 + 0.4 * Math.sin(this.t * 12);
        this.tgStompFill.scale.setScalar(Math.max(0.5, B.stomp.fireWaveMaxRadius * k));
        if (!this.stompClip && this.t >= W - this.#clipLength('Jump', 1.0)) {
          this.stompClip = true;
          this.anim?.play('Jump', { once: true, restart: true });
        }
        if (k >= 1) this.#stompSlam();
        break;
      }
      case 'fireWind': {
        // He turns to AJ and, arms forward (the Shoot clip), fires a ball of fire from the furnace.
        this.#face(dx, dz, dt);
        if (this.t >= B.fireball.windup) {
          this.#fireBall();
          this.#toRecover();
        }
        break;
      }
      case 'stompRing': {
        this.waveR += B.stomp.speed * dt;
        this.wave.scale.setScalar(this.waveR);
        this.wave.material.opacity = Math.max(0, 0.9 * (1 - this.waveR / B.stomp.fireWaveMaxRadius));
        const d = Math.hypot(hero.position.x - this.position.x, hero.position.z - this.position.z);
        if (!this.waveHit && d < B.stomp.fireWaveMaxRadius - F.arena.pillars.radius && Math.abs(d - this.waveR) < B.stomp.width / 2 + 0.35 && hero.position.y < B.stomp.jumpClear + this.groundY()) {
          this.waveHit = true;
          this.hitHero?.(B.stomp.damage, this.position, { source: 'stomp' });
        }
        if (this.waveR >= B.stomp.fireWaveMaxRadius) {
          this.wave.visible = false;
          this.#toRecover();
        }
        break;
      }
      case 'steamWind': {
        const S = B.steam;
        this.#face(dx, dz, dt * (this.t < S.windup * 0.6 ? 1 : 0)); // (it aims, then the cone is locked)
        this.cone.visible = true;
        this.cone.position.set(this.position.x, 0.07, this.position.z);
        this.cone.rotation.y = this.heading;
        this.cone.scale.setScalar(S.length);
        this.cone.material.opacity = 0.12 + 0.3 * Math.min(1, this.t / (S.windup * rate));
        if (!this.shootClip) {
          this.shootClip = true;
          this.anim?.play('Shoot', { once: true, restart: true }); // (arms forward: the steam comes from his chest)
        }
        if (this.t >= S.windup * rate) {
          this.state = 'steam';
          this.t = 0;
          this.steamHit = false;
          this.cone.material.opacity = 0.5;
          this.sound?.play('furnace_guardian_steam_burst', { position: this.position });
        }
        break;
      }
      case 'steam': {
        const S = B.steam;
        // steam streams from the furnace along the cone
        for (let i = 0; i < 3; i++) {
          const a = this.heading + (Math.random() - 0.5) * S.angle;
          const sp = 7 + Math.random() * 5;
          this.fx.emit(this.position.clone().setY(B.height * 0.62).addScaledVector(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), 1.5), new THREE.Vector3(Math.sin(a) * sp, 0.4 + Math.random(), Math.cos(a) * sp), { life: 0.9, size: 0.55, color: 0xffe2c4, g: -0.5 });
        }
        if (!this.steamHit && this.#inCone(hero.position) && !this.#blockedByPillar(this.position, hero.position)) { // (a pillar between them stops the steam)
          this.steamHit = true;
          this.hitHero?.(S.damage, this.position, { source: 'steam', knockback: false });
        }
        if (this.t >= S.duration) {
          this.cone.visible = false;
          this.#toRecover();
        }
        break;
      }
      case 'chargeWind': {
        const C = B.charge;
        if (this.t < C.windup * rate * 0.7) this.#face(dx, dz, dt);
        else this.laneDir = this.laneDir ?? new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.lane.visible = true;
        this.lane.position.set(this.position.x, 0.07, this.position.z);
        this.lane.rotation.y = this.heading;
        this.lane.scale.set(C.hitRadius * 2, 1, 26);
        this.lane.material.opacity = 0.14 + 0.28 * Math.min(1, this.t / (C.windup * rate));
        if (this.t >= C.windup * rate) {
          this.state = 'charge';
          this.t = 0;
          this.chargeHit = false;
          this.travelled = 0;
          this.anim?.play('run');
          this.sound?.play('furnace_guardian_charge', { position: this.position });
        }
        break;
      }
      case 'charge': {
        const C = B.charge;
        const step = C.speed * dt;
        this.#move(this.laneDir.x, this.laneDir.z, step, true);
        this.travelled += step;
        this.lane.position.set(this.position.x, 0.07, this.position.z);
        this.lane.scale.set(C.hitRadius * 2, 1, Math.max(0.1, 26 - this.travelled));
        if (!this.chargeHit && dist < C.hitRadius + 0.5 && hero.position.y < 3.5) {
          this.chargeHit = true;
          this.hitHero?.(C.damage, this.position, { source: 'charge' });
        }
        const hitPillar = this.pillars.find((p) => Math.hypot(this.position.x - (this.centre.x + p.x), this.position.z - (this.centre.z + p.z)) < B.radius + p.r + 0.1);
        const wall = Math.hypot(this.position.x - this.centre.x, this.position.z - this.centre.z) >= A.wall - B.radius - 0.3;
        if (hitPillar) this.#stun();
        else if (wall || this.travelled >= C.max) {
          this.lane.visible = false;
          this.#toRecover();
        }
        break;
      }
      case 'stunned': {
        if (Math.random() < 0.5) this.fx.emit(this.position.clone().setY(B.height + 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 0, (Math.random() - 0.5) * 2.2)), new THREE.Vector3(0, 0.6, 0), { life: 0.6, size: 0.2, color: 0xffe08a, g: 0 });
        if (this.t >= B.charge.stun) this.#toRecover();
        break;
      }
      case 'staggered':
        if (this.t >= this.staggerDuration) this.#toRecover();
        break;
      case 'retreat': {
        // backs away to the far side of the plaza, facing AJ, while he is protected
        const far = new THREE.Vector3(this.centre.x - (to.x - this.centre.x), 0, this.centre.z - (to.z - this.centre.z));
        const dir = far.sub(this.centre).setY(0);
        if (dir.length() < 1) dir.set(0, 0, -1);
        dir.normalize().multiplyScalar((A.wall - B.radius - 1) * A.retreat.far);
        const goal = this.centre.clone().add(dir);
        const gx = goal.x - this.position.x;
        const gz = goal.z - this.position.z;
        const gd = Math.hypot(gx, gz);
        this.#face(gx, gz, dt);
        if (gd > 1) this.#move(gx / gd, gz / gd, A.retreat.speed * dt);
        if (this.t >= A.protection + 0.5) {
          this.state = 'chase';
          this.t = 0;
          this.anim?.play('walk');
        }
        break;
      }
      case 'dying':
        if (Math.random() < 0.6) this.fx.flame(this.position.clone().setY(1 + Math.random() * 4), 2);
        if (this.t >= B.deathTime) {
          this.state = 'dead';
          this.model.visible = false;
          this.fx.burst(this.position.clone().setY(3), 40, { speed: 9, life: 1.2, size: 0.3, up: 6 });
          this.onDefeat?.();
        }
        break;
      default:
        break;
    }
    // leashed to the plaza
    const lx = this.position.x - this.centre.x;
    const lz = this.position.z - this.centre.z;
    const ld = Math.hypot(lx, lz);
    const max = A.wall - B.radius - 0.3;
    if (ld > max) {
      this.position.x = this.centre.x + (lx / ld) * max;
      this.position.z = this.centre.z + (lz / ld) * max;
    }
    this.model.position.copy(this.position);
    if (this.evadeT > 0) {
      const k = 1 - this.evadeT / B.wheelAvoid.duration;
      this.model.position.y += Math.sin(Math.PI * k) * B.wheelAvoid.height;
    }
    this.model.rotation.y = this.heading;
    this.anim?.update(dt);
    // keep the telegraphs on his feet where they belong
    this.tgStomp.position.set(this.position.x, 0.07, this.position.z);
    this.tgStompFill.position.copy(this.tgStomp.position);
  }

  groundY() {
    return 0;
  }

  #face(dx, dz, dt) {
    if (dt <= 0) return;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.max(-B.turn * dt, Math.min(B.turn * dt, diff));
  }

  #considerWheelJump() {
    const wheel = this.getWheelThreat?.();
    if (!wheel || this.evadeCooldown > 0) return;
    const dx = this.position.x - wheel.pos.x;
    const dz = this.position.z - wheel.pos.z;
    const along = dx * wheel.dir.x + dz * wheel.dir.z;
    const lateral = Math.abs(dx * wheel.dir.z - dz * wheel.dir.x);
    if (along <= 0 || along > B.wheelAvoid.range || lateral > B.wheelAvoid.lateral) return;
    this.evadeCooldown = B.wheelAvoid.cooldown;
    this.evadeT = B.wheelAvoid.duration;
    this.stats.wheelDodges = (this.stats.wheelDodges ?? 0) + 1;
  }

  /** Walk / rush by `d` along (dx, dz), out of the pillars. */
  #move(dx, dz, d, rush = false) {
    this.position.x += dx * d;
    this.position.z += dz * d;
    if (rush) return; // (the charge checks the pillars itself: he stuns on them)
    for (const p of this.pillars) {
      const px = this.centre.x + p.x;
      const pz = this.centre.z + p.z;
      const ex = this.position.x - px;
      const ez = this.position.z - pz;
      const e = Math.hypot(ex, ez);
      const min = B.radius + p.r;
      if (e < min && e > 1e-4) {
        this.position.x = px + (ex / e) * min;
        this.position.z = pz + (ez / e) * min;
      }
    }
  }

  /** What to do next (while chasing): a random pick among the attacks that can be used from here. */
  #choose(dist) {
    if (this.hero.life && this.hero.life !== 'alive') return;
    const opts = [];
    if (this.cool.charge <= 0 && dist > B.charge.min) opts.push('charge');
    if (this.cool.steam <= 0 && dist > B.steam.min && dist < B.steam.max) opts.push('steam');
    if (this.cool.stomp <= 0 && dist < B.stomp.range) opts.push('stomp');
    if (this.cool.fireball <= 0 && dist > B.fireball.min && dist < B.fireball.max) opts.push('fireball');
    if (!opts.length) return;
    this.startAttack(opts[Math.floor(Math.random() * opts.length)]);
  }

  /** Begin an attack ('stomp' | 'steam' | 'charge' | 'fireball'): its windup, the floor marking, Tick's call. */
  startAttack(pick) {
    this.t = 0;
    this.#hideTelegraphs();
    if (pick === 'stomp') {
      this.state = 'stompWind';
      this.stompClip = false;
      this.anim?.play('idle', { restart: true });
      this.stats.stomps++;
      this.sound?.play('stomp_warning', { position: this.position });
      this.call?.('stomp');
    } else if (pick === 'steam') {
      this.state = 'steamWind';
      this.shootClip = false;
      this.anim?.play('idle', { restart: true });
      this.stats.steams++;
      this.call?.('steam');
    } else if (pick === 'fireball') {
      this.state = 'fireWind';
      this.anim?.play('Shoot', { once: true, restart: true });
      this.stats.fireballs = (this.stats.fireballs ?? 0) + 1;
      this.cool.fireball = B.fireball.cooldown;
      this.call?.('fireball');
    } else {
      this.state = 'chargeWind';
      this.laneDir = null;
      this.anim?.play('idle');
      this.stats.charges++;
      this.call?.('charge');
    }
    this.sound?.play('furnace_guardian_roar', { position: this.position });
  }

  /** A clip's length in seconds (by name), or `fallback`. */
  #clipLength(name, fallback) {
    const c = this.anim?.clips?.find((x) => x.name.endsWith(name));
    return c ? Math.min(c.duration, B.stomp.windup) : fallback;
  }

  /** Fire the ball: from the furnace, at where AJ stands now (low enough that a jump clears it). */
  #fireBall() {
    const F2 = B.fireball;
    if (!this.ballMesh) {
      this.ballMesh = [];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(F2.size * 0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })), new THREE.Mesh(new THREE.SphereGeometry(F2.size, 10, 8), new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
        g.visible = false;
        this.group.add(g);
        this.ballMesh.push(g);
      }
    }
    const mesh = this.ballMesh.find((m) => !m.visible);
    if (!mesh) return;
    const from = new THREE.Vector3(this.position.x + Math.sin(this.heading) * 1.6, B.height * B.glow.furnace.up, this.position.z + Math.cos(this.heading) * 1.6);
    const to = this.hero.position.clone().setY(this.hero.position.y + 0.9);
    const vel = to.sub(from).normalize().multiplyScalar(F2.speed);
    mesh.visible = true;
    mesh.position.copy(from);
    this.balls.push({ mesh, pos: from, vel, age: 0 });
    this.sound?.play('fire_blast_cast', { position: from });
  }

  /** The first pillar between `a` and `b` (a 2D line of sight; the pillars are tall), or null. */
  #blockedByPillar(a, b, pad = 0) {
    for (const p of this.pillars) {
      const cx = this.centre.x + p.x;
      const cz = this.centre.z + p.z;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cz - a.z) * dz) / len2)) : 0;
      if (Math.hypot(a.x + dx * t - cx, a.z + dz * t - cz) < p.r + pad && Math.min(a.y, b.y) < p.top) return { x: cx, z: cz, r: p.r };
    }
    return null;
  }

  /** A fire ball bursts: sparks, a sound and — when `splash` — a small blast that hurts AJ only with a clear line to him. */
  #burstBall(b, at, splash = true) {
    const F2 = B.fireball;
    this.fx.burst(at, 14, { speed: 4, life: 0.5, size: 0.16, up: 1.5 });
    this.sound?.play('fire_blast_hit', { position: at });
    b.mesh.visible = false;
    if (!splash || b.reflected) return;
    const hero = this.hero;
    const chest = hero.position.clone().setY(hero.position.y + 0.9);
    const clear = !this.#blockedByPillar(at, chest);
    if (clear && Math.hypot(at.x - hero.position.x, at.z - hero.position.z) < F2.splashRadius && hero.position.y < F2.clearHeight + 0.2) {
      this.hitHero?.(F2.damage, at, { source: 'fireball' });
    }
  }

  /**
   * The fire balls in flight: they hit AJ at ground level (a jump clears them) when nothing stands between; burst on a pillar, the wall or
   * the floor; a perfectly blocked one flies back (`reflected`) and hits the Guardian.
   */
  #updateBalls(dt) {
    const F2 = B.fireball;
    const hero = this.hero;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const prev = b.pos.clone();
      b.age += dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      this.fx.flame(b.pos, 0.5);
      const out = b.age > F2.life || b.pos.y < 0.05 || Math.hypot(b.pos.x - this.centre.x, b.pos.z - this.centre.z) > A.wall;
      // a pillar on the way (swept, so a fast ball never skips it): it bursts against it
      const pillar = this.#blockedByPillar(prev, b.pos, F2.size * 0.5 + F2.pillarPad);
      if (pillar) {
        const away = new THREE.Vector3(prev.x - pillar.x, 0, prev.z - pillar.z).normalize();
        const at = new THREE.Vector3(pillar.x + away.x * (pillar.r + F2.pillarPad), Math.min(b.pos.y, B.height), pillar.z + away.z * (pillar.r + F2.pillarPad));
        this.stats.pillarBursts = (this.stats.pillarBursts ?? 0) + 1;
        this.#burstBall(b, at);
        this.balls.splice(i, 1);
        continue;
      }
      if (b.reflected) {
        // back at the Guardian: his body is the target
        const d = Math.hypot(b.pos.x - this.position.x, b.pos.z - this.position.z);
        if (d < B.radius + F2.size && b.pos.y < B.height) {
          this.stats.reflected = (this.stats.reflected ?? 0) + 1;
          this.takeHit(this.maxHp * F2.shieldReflectDamage, 'reflect');
          this.stagger(CONFIG.part2.fire.shield.staggerTime);
          this.#burstBall(b, b.pos.clone(), false);
          this.balls.splice(i, 1);
          continue;
        }
        if (out) {
          this.#burstBall(b, b.pos.clone(), false);
          this.balls.splice(i, 1);
        }
        continue;
      }
      const chest = hero.position.y + 0.9;
      const near = Math.hypot(b.pos.x - hero.position.x, b.pos.z - hero.position.z) < F2.radius;
      const hit = near && Math.abs(b.pos.y - chest) < F2.clearHeight && hero.position.y < F2.clearHeight + 0.2
        && !this.#blockedByPillar(b.pos, new THREE.Vector3(hero.position.x, chest, hero.position.z));
      if (hit) {
        const res = this.hitHero?.(F2.damage, b.pos, { source: 'fireball' });
        this.sound?.play('fire_blast_hit', { position: b.pos });
        if (res === 'perfect') {
          // a perfect block: it flies straight back at the Guardian's chest
          b.reflected = true;
          b.age = 0;
          const to = new THREE.Vector3(this.position.x, B.height * B.glow.furnace.up, this.position.z).sub(b.pos).normalize();
          b.vel = to.multiplyScalar(F2.speed * F2.reflectSpeed);
          this.fx.burst(b.pos, 22, { speed: 6, life: 0.4, size: 0.2, color: 0xfff2c0, up: 1 }); // (the clash flash)
          continue;
        }
      }
      if (hit || out) {
        this.#burstBall(b, b.pos.clone(), false);
        this.balls.splice(i, 1);
      }
    }
  }

  #stompSlam() {
    this.state = 'stompRing';
    this.t = 0;
    this.waveR = 1;
    this.waveHit = false;
    this.tgStomp.visible = this.tgStompFill.visible = false;
    this.wave.visible = true;
    this.wave.position.set(this.position.x, 0.1, this.position.z);
    this.wave.scale.setScalar(1);
    this.wave.material.opacity = 0.9;
    this.cool.stomp = B.stomp.fireWaveInterval;
    this.sound?.play('furnace_guardian_stomp', { position: this.position });
    this.fx.burst(this.position.clone().setY(0.3), 24, { speed: 8, life: 0.7, size: 0.22, up: 2 });
    this.onShake?.(B.stomp.shake);
  }

  #inCone(p) {
    const S = B.steam;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > S.length || d < 0.5) return d < 0.5;
    const cos = (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / d;
    return cos >= Math.cos(S.angle / 2);
  }

  #toRecover() {
    this.state = 'recover';
    this.t = 0;
    this.anim?.play('idle');
    this.cool.steam = Math.max(this.cool.steam, B.steam.cooldown * 0.5);
    this.cool.charge = Math.max(this.cool.charge, B.charge.cooldown);
    this.laneDir = null;
    this.#hideTelegraphs();
  }

  #stun() {
    this.state = 'stunned';
    this.t = 0;
    this.stats.stuns++;
    this.lane.visible = false;
    this.cool.charge = B.charge.cooldown;
    this.anim?.play('hit', { once: true, restart: true });
    this.sound?.play('furnace_guardian_stomp', { position: this.position, volume: 0.8 });
    this.fx.burst(this.position.clone().setY(2), 22, { speed: 6, life: 0.8, size: 0.2, up: 4 });
    this.onShake?.(B.stomp.shake * 0.8);
  }
}
