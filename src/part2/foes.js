import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadRobotModel } from './robots.js';
import { trackPoint } from './rideModel.js';

// The Fire level's robots (Gearhaven's Animated Mech Pack): scout robots (Leela) that run at the
// horse in groups of 2 from the front and wide, as the skeletons do in Part 1 — they die in 2
// Batarang hits in a burst of brass parts — and sword robots (Mike and Stan) that patrol the road
// and, once they see the rider, alert (a flash and a chirp), sidestep, charge, wind up their sword
// (a red ring on the ground marks its reach) and swing: half a heart. A robot sometimes drops a gem.
// Targets for the Arsenal: { alive, position (feet), radius, height, takeHit(damage, source), ignite }.

const F = CONFIG.part2.fire;
const SC = F.scouts;
const SW = F.swords;
const WHITE = new THREE.Color(0xffffff);

class Foe {
  constructor(kind, model, ctx) {
    this.kind = kind; // 'scout' | 'sword'
    this.model = model;
    this.ctx = ctx;
    this.cfg = kind === 'scout' ? SC : SW;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.radius = this.cfg.radius;
    this.height = kind === 'scout' ? SC.height : SW.height;
    this.hp = this.maxHp = this.cfg.hp;
    this.alive = false;
    this.active = false;
    this.state = 'idle';
    this.t = 0;
    this.burn = null;
    this.pop = 0;
    this.grace = 0;
    this.hurt = false;
    this.flash = 0;
    this.hitMaterials = [];
    const materials = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const clone = (material) => {
        if (!materials.has(material)) materials.set(material, material.clone());
        return materials.get(material);
      };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
    for (const material of materials.values()) {
      this.hitMaterials.push({
        material,
        color: material.color?.clone(),
        emissive: material.emissive?.clone(),
        intensity: material.emissiveIntensity,
      });
    }
    model.visible = false;
    this.anim = model.userData.animator;
  }

  spawn(position, heading, state = 'idle') {
    this.position.copy(position);
    this.heading = heading;
    this.hp = this.maxHp;
    this.alive = this.active = true;
    this.state = state;
    this.t = 0;
    this.burn = null;
    this.hurt = false;
    this.flash = 0;
    this.model.visible = true;
    this.model.scale.setScalar(1);
    this.model.position.copy(position);
    this.model.rotation.y = heading;
    this.model.traverse((o) => o.isMesh && (o.visible = true));
    this.anim?.play('idle', { restart: true });
  }

  remove() {
    this.alive = this.active = false;
    this.model.visible = false;
  }

  /** Damage from the Batarang / a fire ball / a burn. Returns false if it didn't count (already dying). */
  takeHit(damage, source = 'batarang', impact = null) {
    if (!this.alive) return false;
    this.hp -= damage;
    this.pop = 0.14;
    this.flash = F.hit.robotFlash;
    if ((source === 'cog' || source === 'wheel') && impact?.direction) {
      const push = impact.direction.clone().setY(0);
      if (push.lengthSq() > 1e-5) this.position.addScaledVector(push.normalize(), F.weaponImpact.push);
      this.#walls();
    }
    if (this.hp <= 0.0001) this.#die(source);
    return true;
  }

  ignite(time, dps) {
    if (!this.alive) return;
    this.burn = { t: time, dps };
  }

  #die(source) {
    this.alive = false;
    this.burn = null;
    this.ctx.onDeath?.(this, source);
    if (this.kind === 'scout') {
      // (it breaks apart into brass parts at once)
      this.model.visible = false;
      this.active = false;
      this.ctx.scrap?.burst(this.position.clone().setY(this.position.y + 0.8), null);
    } else {
      this.state = 'dying';
      this.t = 0;
      this.anim?.play('death', { once: true, restart: true });
    }
    if (Math.random() < this.cfg.gemChance) this.ctx.onDrop?.(this.position.clone());
  }

  /** Face `heading` smoothly and walk at `speed` toward `dest`; stays inside the walls. */
  stepToward(dest, speed, dt, turn = 9) {
    const dx = dest.x - this.position.x;
    const dz = dest.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return d;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
    const step = Math.min(d, speed * dt);
    this.position.x += Math.sin(this.heading) * step;
    this.position.z += Math.cos(this.heading) * step;
    this.#walls();
    return d;
  }

  #walls() {
    const world = this.ctx.world;
    const v = this.ctx.scratch.set(0, 0, 0);
    world.collide(this.position, v, this.radius);
  }

  update(dt) {
    if (!this.active) return;
    // Burning: flames on it and a damage per second.
    if (this.burn && this.alive) {
      this.burn.t -= dt;
      this.ctx.fx.flame(this.position.clone().setY(this.position.y + this.height * 0.5), this.radius);
      this.takeHit(this.burn.dps * dt, 'burn');
      if (this.burn && this.burn.t <= 0) this.burn = null;
    }
    this.t += dt;
    this.grace = Math.max(0, this.grace - dt);
    this.pop = Math.max(0, this.pop - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.kind === 'scout' ? this.#scout(dt) : this.#sword(dt);
    this.model.position.copy(this.position);
    this.model.rotation.y = this.heading;
    if (this.state !== 'rise') this.model.scale.setScalar(1 + this.pop * 0.5);
    this.anim?.update(dt);
    const flash = this.flash > 0 ? this.flash / F.hit.robotFlash : 0;
    for (const entry of this.hitMaterials) {
      if (entry.color && entry.material.color) entry.material.color.copy(entry.color).lerp(WHITE, flash);
      if (entry.emissive && entry.material.emissive) {
        entry.material.emissive.copy(entry.emissive).lerp(WHITE, flash);
        entry.material.emissiveIntensity = entry.intensity + flash * 1.5;
      }
    }
  }

  // --- scouts ---------------------------------------------------------------------

  #scout(dt) {
    const horse = this.ctx.horse;
    const target = this.ctx.targetPos(); // (the horse, or AJ on foot)
    const away = new THREE.Vector3(this.position.x - target.x, 0, this.position.z - target.z);
    if (this.state === 'rise') {
      const k = Math.min(1, this.t / SC.rise);
      this.model.scale.set(1, 0.2 + 0.8 * k, 1);
      this.position.y = 0;
      if (k >= 1) {
        this.state = 'run';
        this.anim?.play('run');
      }
      return;
    }
    if (this.state === 'run') {
      const lead = horse.mounted && horse.velocity ? new THREE.Vector3(horse.velocity.x, 0, horse.velocity.z).multiplyScalar(0.25) : new THREE.Vector3();
      const d = this.stepToward(target.clone().add(lead), SC.speed, dt);
      if (d < SC.reach && this.grace <= 0) {
        this.state = 'lunge';
        this.t = 0;
        this.struck = false;
        this.anim?.play('attack', { restart: true });
      }
    } else if (this.state === 'lunge') {
      this.position.x += Math.sin(this.heading) * SC.speed * 0.5 * dt;
      this.position.z += Math.cos(this.heading) * SC.speed * 0.5 * dt;
      if (!this.struck && this.t >= SC.lunge * 0.4) {
        this.struck = true;
        if (away.length() < SC.reach * 1.5) this.ctx.hitHero?.(SC.damage, this.position, 'scout');
      }
      if (this.t >= SC.lunge) {
        this.state = 'away';
        this.t = 0;
        this.anim?.play('run');
      }
    } else if (this.state === 'away') {
      // (it tumbles on past, falling away behind)
      this.position.x += Math.sin(this.heading) * SC.speed * 0.4 * dt;
      this.position.z += Math.cos(this.heading) * SC.speed * 0.4 * dt;
      this.model.scale.setScalar(Math.max(0.01, 1 - this.t / 1.2));
      if (this.t >= 1.2) this.remove();
    }
    // (left far behind: gone)
    if (this.state === 'run' && this.ctx.behind(this.position) > SC.despawnBehind) this.remove();
  }

  // --- sword robots -----------------------------------------------------------------

  #sword(dt) {
    const hp = this.ctx.targetPos();
    const dx = hp.x - this.position.x;
    const dz = hp.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const ring = this.ring;
    if (ring) ring.visible = this.state === 'windup' || this.state === 'alert';
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        this.state = 'patrol';
        const t = this.ctx.time;
        const P = SW.patrol;
        const p = trackPoint(this.ctx.track, this.spot.s + Math.sin(t * 0.45 + this.phase) * P.along, THREE.MathUtils.clamp(this.spot.lat + Math.cos(t * 0.6 + this.phase) * P.range, -5.8, 5.8));
        const d = this.stepToward(p.pos, P.speed, dt, 4);
        this.anim?.play(d > 0.3 ? 'walk' : 'idle');
        if (dist < SW.aggro && this.ctx.playing) {
          this.state = 'alert';
          this.t = 0;
          this.anim?.play('idle');
          this.ctx.sound?.play('robot_alert', { position: this.position });
        }
        break;
      }
      case 'alert': {
        // (it turns to the rider; its eyes flare: a short, plain warning)
        this.heading += (Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 8);
        this.#eye(1 + 0.6 * Math.sin(this.t * 24));
        if (ring) ring.scale.setScalar(SW.swingRange * 0.45 * (1 + this.t));
        if (this.t >= SW.alert) this.#toSidestep(dx, dz);
        break;
      }
      case 'sidestep': {
        // (it dodges sideways before it charges)
        this.position.x += this.side.x * (SW.sidestepDist / SW.sidestep) * dt;
        this.position.z += this.side.z * (SW.sidestepDist / SW.sidestep) * dt;
        this.#walls();
        if (this.t >= SW.sidestep) {
          this.state = 'charge';
          this.t = 0;
          this.anim?.play('run');
        }
        break;
      }
      case 'charge': {
        const d = this.stepToward(hp, SW.chargeSpeed, dt);
        if (d < SW.swingRange * 0.8 || this.t >= SW.chargeMax) {
          this.state = 'windup';
          this.t = 0;
          this.anim?.play('attack', { restart: true });
          this.ctx.sound?.play('robot_swing', { position: this.position });
        }
        break;
      }
      case 'windup': {
        this.heading += (Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 3); // (it aims, but slowly)
        if (ring) ring.scale.setScalar(SW.swingRange);
        this.#eye(1.4);
        if (this.t >= SW.windup) {
          this.state = 'recover';
          this.t = 0;
          if (dist <= SW.swingRange + 0.8 && hp.y < 3.2) this.ctx.hitHero?.(SW.damage, this.position, 'sword');
          this.ctx.fx.burst(this.position.clone().setY(this.position.y + 1.2).addScaledVector(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), 1.8), 8, { speed: 4, life: 0.4, size: 0.12, up: 1 });
        }
        break;
      }
      case 'recover': {
        this.#eye(1);
        if (this.t >= SW.recover) {
          if (dist < SW.aggro * 1.4) this.#toSidestep(dx, dz);
          else {
            this.state = 'patrol';
            this.anim?.play('walk');
          }
        }
        break;
      }
      case 'dying': {
        const fade = Math.max(0, 1 - Math.max(0, this.t - 0.9) / SW.fade);
        this.model.scale.setScalar(Math.max(0.01, fade));
        if (this.t >= 0.9 + SW.fade) this.remove();
        return;
      }
      default:
        break;
    }
    if (this.ctx.behind(this.position) > SW.despawnBehind && this.state !== 'dying') this.state = this.state === 'charge' ? 'patrol' : this.state;
  }

  #toSidestep(dx, dz) {
    const d = Math.hypot(dx, dz) || 1;
    const sign = Math.random() < 0.5 ? 1 : -1;
    // (sideways to the line toward the rider; toward the road's middle if that is the wall side)
    let side = new THREE.Vector3((-dz / d) * sign, 0, (dx / d) * sign);
    const n = this.ctx.track.nearest(this.position.x + side.x * SW.sidestepDist, this.position.z + side.z * SW.sidestepDist, 14);
    if (n && Math.abs(n.lateral) > 6.2) side = side.negate();
    this.side = side;
    this.state = 'sidestep';
    this.t = 0;
    this.heading = Math.atan2(side.x, side.z);
    this.anim?.play('run');
  }

  #eye(k) {
    const eye = this.model.userData.eye;
    if (eye) eye.scale.setScalar(k);
  }
}

export class Foes {
  /**
   * @param {{ scene, world, horse, hero, fx, sound, track, scrap, hitHero(n, from, source), onDrop(pos), assets }} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.scouts = [];
    this.swords = [];
    this.time = 0;
    this.playing = false;
    this.triggered = new Set();
    this.group = new THREE.Group();
    this.group.name = 'foes';
    o.scene.add(this.group);
    this.scratch = new THREE.Vector3();
    this.stats = { scoutGroups: 0, killed: 0, swings: 0 };
  }

  /** Build the pools (robots are cloned once; scouts are reused). */
  async build() {
    const ctx = {
      world: this.world, horse: this.horse, fx: this.fx, scrap: this.scrap, sound: this.sound, track: this.track, scratch: this.scratch,
      hitHero: (n, from, source) => this.hitHero?.(n, from, source),
      onDrop: (p) => this.onDrop?.(p),
      onDeath: (f) => {
        this.stats.killed++;
        this.onKill?.(f);
      },
      behind: (p) => this.#behind(p),
      targetPos: () => (this.targetPos ? this.targetPos() : this.horse.position),
      get time() { return ctx.t; },
      t: 0,
      playing: false,
    };
    this.ctx = ctx;
    const opts = this.assets ?? {};
    for (let i = 0; i < 6; i++) {
      const m = await loadRobotModel('scout', opts);
      this.group.add(m);
      this.scouts.push(new Foe('scout', m, ctx));
    }
    for (const spot of SW.spots) {
      const m = await loadRobotModel(spot.kind, opts);
      this.group.add(m);
      const f = new Foe('sword', m, ctx);
      f.spot = spot;
      f.phase = Math.random() * 6;
      f.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SW.ringColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      f.ring.position.y = 0.06;
      f.ring.visible = false;
      m.add(f.ring);
      f.ring.rotation.y = 0;
      this.swords.push(f);
    }
  }

  get all() {
    return [...this.scouts, ...this.swords];
  }

  /** The live foes (the Arsenal's targets). */
  get targets() {
    return this.all.filter((f) => f.alive);
  }

  #behind(p) {
    // how far behind the horse along the trail (positive: behind)
    const a = this.track.nearest(p.x, p.z, 30);
    const tp = this.ctx.targetPos();
    const h = this.track.nearest(tp.x, tp.z, 30);
    return a && h ? h.s - a.s : 0;
  }

  /** A fresh pass: everyone removed, the sword robots back at their posts, triggers re-armed. */
  reset(fromS = 0) {
    this.triggered.clear();
    for (const f of this.scouts) f.remove();
    for (const f of this.swords) {
      f.remove();
      if (f.spot.s < fromS) continue; // (behind a checkpoint we have passed: gone for good)
      const p = trackPoint(this.track, f.spot.s, f.spot.lat);
      f.spawn(p.pos, p.heading + Math.PI, 'patrol');
      f.anim?.play('idle');
    }
    for (const t of SC.triggers) if (t < fromS) this.triggered.add(t);
  }

  /** The scout groups: one is called as the horse passes each trigger. */
  #callScouts(s) {
    for (const trig of SC.triggers) {
      if (this.triggered.has(trig) || s < trig) continue;
      this.triggered.add(trig);
      if (s > trig + 40) continue; // (skipped over: not called)
      this.stats.scoutGroups++;
      const free = this.scouts.filter((f) => !f.active);
      for (let i = 0; i < 2 && free[i]; i++) {
        const ahead = SC.ahead[0] + Math.random() * (SC.ahead[1] - SC.ahead[0]);
        const lat = (i === 0 ? -1 : 1) * SC.lat;
        const p = trackPoint(this.track, s + ahead, lat);
        const f = free[i];
        f.spawn(p.pos, p.heading + Math.PI, 'rise');
        f.grace = SC.grace;
        f.anim?.play('idle');
        this.sound?.play('robot_alert', { position: p.pos });
        this.fx.burst(p.pos.clone().setY(0.4), 8, { speed: 3, life: 0.5, size: 0.14, up: 1.5 });
      }
    }
  }

  update(dt, { playing = true } = {}) {
    this.time += dt;
    this.ctx.t = this.time;
    this.ctx.playing = playing;
    if (playing) {
      const tp = this.ctx.targetPos();
      const n = this.track.nearest(tp.x, tp.z, 30);
      if (n) this.#callScouts(n.s);
    }
    for (const f of this.all) f.update(playing ? dt : 0);
  }

  /** Everything gone (leaving the level). */
  clear() {
    for (const f of this.all) f.remove();
  }
}
