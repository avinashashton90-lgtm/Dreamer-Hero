import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadMinionTemplate, makeMinionModel, minionTemplateNow } from './minionModels.js';
import { makeDizzyModel } from './combat.js';

const MN = CONFIG.minions;
const BT = MN.bats;
const SL = MN.slimes;
const SK = MN.skeletons;
const CV = CONFIG.cave;
const TAU = Math.PI * 2;

/**
 * One small enemy (bat, skeleton or slime). A combat target like the boss: position (its feet,
 * or the bottom of a flying bat), radius, height, hp, maxHp, alive, takeHit(), paralyze(),
 * smokeTouch(), mouthPosition(), knockback(); `minion` marks it (gem drop, Flash kill radius).
 * The director (Minions) moves it; this class keeps its state, animation and looks.
 */
export class Minion {
  constructor(type, model, director) {
    const T = MN.types[type];
    this.type = type;
    this.minion = true;
    this.model = model;
    this.u = model.userData;
    this.director = director;
    this.radius = T.radius;
    this.height = T.height;
    this.maxHp = T.hp;
    this.hp = T.hp;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.state = 'spawn';
    this.stateTime = 0;
    this.paralyzed = 0;
    this.paralyzeTotal = 0;
    this.smokeExposure = 0;
    this.cooldown = 0; // until it can hurt the hero again
    this.flash = 0;
    this.flinch = 0;
    this.opacity = 1;
    this.removed = false;
    this.noDrop = false;
    this.knocked = false;
    this.clock = Math.random() * 10;
    this.extra = {}; // per-type behaviour data (side, angle, base height…)
  }

  get alive() {
    return this.hp > 0 && !this.removed && this.state !== 'dying' && this.state !== 'fading';
  }

  /** The hero's hits: melee 4, Batarang 6 (MN.damage), the Flash bolt kills it. */
  takeHit({ amount = 0, source = 'melee', flash = false } = {}) {
    if (!this.alive) return 0;
    const dmg = flash || source === 'flash' ? this.hp : (MN.damage[source] ?? amount);
    const dealt = Math.min(this.hp, dmg);
    this.hp -= dealt;
    this.flash = MN.hitFlash;
    if (this.hp <= 0) this.die();
    else {
      this.flinch = MN.flinch;
      this.director.onMinionHit(this);
    }
    return dealt;
  }

  /** Smoke Bomb: paralyzed (coughing and swaying, not frozen) for `seconds`. */
  paralyze(seconds) {
    if (!this.alive) return false;
    this.paralyzed = seconds;
    this.paralyzeTotal = seconds;
    this.set('paralyzed');
    return true;
  }

  /** Its body touched a Smoke Bomb cloud: it stops and coughs (paralysis follows). */
  smokeTouch() {
    if (!this.alive || this.state === 'paralyzed') return;
    this.set('smoked');
  }

  /** Still rising out of the ground: the smoke takes hold once it's up. */
  smokeImmune() {
    return this.state === 'spawn';
  }

  resistsParalysis() {
    return false;
  }

  mouthPosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.height * 0.8, this.position.z);
  }

  /** Pushed by the Flash shockwave. */
  knockback(ux, uz, dist) {
    this.position.x += ux * dist;
    this.position.z += uz * dist;
  }

  set(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  /** Defeated: the death clip, then it fades and drops its gem. */
  die({ noDrop = false } = {}) {
    if (this.state === 'dying' || this.state === 'fading') return;
    this.hp = 0;
    this.noDrop = this.noDrop || noDrop;
    this.paralyzed = 0;
    this.set('dying');
    this.director.onMinionDefeated(this);
  }

  /** Animation, flash, fade, sway / cough, dizzy stars. */
  pose(dt) {
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    const an = this.u.animator;
    const s = this.state;
    if (s === 'dying') an.set('death', { once: true });
    else if (s === 'fading') an.scrub('death', 1);
    else if (s === 'spawn' && this.type === 'skeleton') an.scrub('spawn', this.stateTime / SK.rise);
    else if (s === 'attack') an.set('attack', { once: true });
    else if (s === 'paralyzed' || s === 'smoked') an.set('idle', { timeScale: 0.35 });
    else if (this.flinch > 0) an.set('hit', { once: true });
    else if (s === 'idle') an.set('idle');
    else an.set('move', { timeScale: this.type === 'slime' ? SL.hopRate / 2 : 1 });
    an.update(dt);
    // Coughing and swaying while smoked / paralyzed (never a frozen pose).
    const body = this.u.body;
    const dazed = s === 'paralyzed' || s === 'smoked';
    const cough = dazed ? Math.max(0, Math.sin(this.clock * MN.cough.rate * TAU)) ** 6 : 0;
    body.rotation.z = dazed ? Math.sin(this.clock * MN.sway.rate * TAU) * MN.sway.angle : 0;
    body.rotation.x = dazed ? cough * 0.35 : 0;
    body.position.y = dazed ? -cough * MN.cough.bob : 0;
    // Hit flash and the fade.
    for (const m of this.u.mats) {
      if (m.emissive) m.emissive.setScalar(this.flash > 0 ? 0.7 : 0);
      const fading = this.opacity < 1;
      if (m.transparent !== fading) {
        m.transparent = fading;
        m.needsUpdate = true;
      }
      m.opacity = this.opacity;
    }
    if (this.dizzy) {
      this.dizzy.visible = s === 'paralyzed';
      this.dizzy.position.set(0, this.height + 0.25, 0);
      if (this.dizzy.visible) this.dizzy.rotation.y += dt * 4;
    }
    this.model.position.copy(this.position);
    this.model.rotation.set(0, this.facing, 0);
  }
}

/**
 * Spawns and runs the minions:
 * - Forest bats: every `bats.interval` seconds of riding (only inside the allowed time windows,
 *   scheduleBats), 1–3 swoop in from the tree line ahead, arc toward the rider, bite once, then
 *   retreat or circle first; never within caveClear of the cave or in the first seconds after a
 *   checkpoint; Gallop outruns them.
 * - Cave slimes: every boss slam's crack lets 2 (3 below 50% HP) emerge and hop at the hero,
 *   inside the arena; they hop away after every hit; they go when the boss dies.
 * - Desert skeletons: only after the Lazarus Pit scene, pairs rise from the sand ahead every
 *   `skeletons.interval` s and run at the horse; galloping into one knocks it aside (defeated);
 *   none near the castle.
 * Defeated minions drop a gem; a respawn clears them all; nothing spawns outside play.
 */
export class Minions {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {{ hero, horse, combat, abilities?, gems?, onHitHero?: Function, onEvent?: Function,
   *   readFile?: Function, placeholder?: boolean, random?: () => number }} deps
   */
  constructor(scene, world, deps) {
    this.scene = scene;
    this.world = world;
    this.deps = deps;
    this.random = deps.random ?? Math.random;
    this.list = [];
    this.reserved = { bat: 0, skeleton: 0, slime: 0 }; // spawns waiting on a model load
    this.epoch = 0; // bumped by clear() (spawns still loading are dropped)
    this.clock = 0;
    this.batWindows = [{ start: 0, end: Infinity }];
    this.stats = { spawned: { bat: 0, skeleton: 0, slime: 0 }, defeated: { bat: 0, skeleton: 0, slime: 0 }, drops: 0, bites: 0, hits: 0, knocked: 0, horseEnergy: 0 };
    this.resetTimers();
  }

  resetTimers() {
    this.rideTime = 0; // seconds riding the forest trail
    this.nextBat = this.#range(BT.interval);
    this.desertTime = 0; // seconds riding the desert after the Lazarus Pit
    this.nextSkeletons = SK.firstDelay;
    this.lastCheckpointAt = -Infinity;
  }

  /**
   * Bats only swoop in during these windows of riding time (seconds since the ride began);
   * the default is "anytime". (For an obstacle director to restrict them later.)
   * @param {{ start: number, end: number }[]} windows
   */
  scheduleBats(windows = [{ start: 0, end: Infinity }]) {
    this.batWindows = windows;
  }

  onCheckpoint() {
    this.lastCheckpointAt = this.clock;
  }

  /** Alive minions of a type (plus spawns still loading). */
  count(type) {
    return this.list.filter((m) => m.type === type && m.alive).length + this.reserved[type];
  }

  /** Remove every minion at once (a respawn, Retry, a new game, a cutscene). */
  clear() {
    this.epoch++;
    for (const m of this.list) this.#remove(m);
    this.list = [];
    this.reserved = { bat: 0, skeleton: 0, slime: 0 };
    this.resetTimers();
  }

  /** The boss is dead: its slimes melt away (no gems). */
  despawnSlimes() {
    for (const m of this.list) if (m.type === 'slime' && m.alive) m.die({ noDrop: true });
  }

  /** A boss slam cracked the ground at `at`: slimes emerge (2, or 3 below 50% HP; 3 alive at most). */
  slimesFromCrack(at, enraged = false) {
    const n = Math.min(enraged ? SL.perSlamEnraged : SL.perSlam, SL.max - this.count('slime'));
    const a0 = this.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / Math.max(1, n)) * TAU;
      const p = this.#inArena(at.x + Math.cos(a) * SL.spread, at.z + Math.sin(a) * SL.spread, MN.types.slime.radius);
      this.#spawn('slime', (m) => {
        m.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
        m.extra.groundY = m.position.y;
      });
    }
    return n;
  }

  /** Spawn one at a spot (tests, screenshots, the debug tools). Resolves to the minion. */
  spawnAt(type, position) {
    return this.#spawn(type, (m) => {
      m.position.set(position.x, position.y ?? this.world.heightAt(position.x, position.z), position.z);
      m.extra.groundY = this.world.heightAt(position.x, position.z);
      m.extra.side = 1;
    });
  }

  /** Make sure a type's model is loaded (tests; spawns load it themselves). */
  ready(type) {
    return loadMinionTemplate(type, this.#modelOpts());
  }

  /**
   * @param {number} dt
   * @param {{ playing: boolean, riding: boolean, route: 'forest' | 'desert' | null, pitDone: boolean, galloping: boolean }} ctx
   */
  update(dt, ctx) {
    this.clock += dt;
    if (ctx.playing) {
      this.#spawnBats(dt, ctx);
      this.#spawnSkeletons(dt, ctx);
    }
    const target = this.#target(ctx);
    for (const m of this.list) {
      if (m.removed) continue;
      m.stateTime += dt;
      m.cooldown = Math.max(0, m.cooldown - dt);
      if (m.state === 'dying' || m.state === 'fading') this.#updateDeath(m, dt);
      else if (m.state === 'smoked' || m.state === 'paralyzed') this.#updateDazed(m, dt);
      else if (m.type === 'bat') this.#updateBat(m, dt, target, ctx);
      else if (m.type === 'slime') this.#updateSlime(m, dt, target, ctx);
      else this.#updateSkeleton(m, dt, target, ctx);
      m.pose(dt);
    }
    this.#separate();
    for (const m of this.list) {
      if (m.type !== 'slime' || m.removed) continue;
      const p = this.#inArena(m.position.x, m.position.z, m.radius); // (still inside after the separation)
      m.position.x = p.x;
      m.position.z = p.z;
      m.model.position.copy(m.position);
    }
    this.list = this.list.filter((m) => !m.removed);
  }

  // --- spawning -------------------------------------------------------------

  #range([a, b]) {
    return a + this.random() * (b - a);
  }

  #modelOpts() {
    return { readFile: this.deps.readFile, placeholder: this.deps.placeholder };
  }

  /**
   * Spawn one; `setup(m)` places it. Immediate once its type is loaded; the first of a type
   * loads the model first (the spawn holds a place in the cap meanwhile). Resolves to it.
   */
  #spawn(type, setup) {
    const now = minionTemplateNow(type);
    if (now) return Promise.resolve(this.#create(type, now, setup));
    const epoch = this.epoch;
    this.reserved[type]++;
    return loadMinionTemplate(type, this.#modelOpts()).then((template) => {
      if (epoch !== this.epoch) return null; // cleared while it loaded
      this.reserved[type]--;
      return this.#create(type, template, setup);
    });
  }

  #create(type, template, setup) {
    const m = new Minion(type, makeMinionModel(template), this);
    m.dizzy = makeDizzyModel();
    m.model.add(m.dizzy);
    setup(m);
    this.list.push(m);
    this.scene.add(m.model);
    this.deps.combat?.addTarget(m);
    this.stats.spawned[type]++;
    m.pose(0);
    return m;
  }

  #batsAllowed(ctx) {
    const h = this.deps.horse;
    const [ax, az] = CV.archPosition;
    const inWindow = this.batWindows.some((w) => this.rideTime >= w.start && this.rideTime <= w.end);
    return inWindow && this.clock - this.lastCheckpointAt >= BT.checkpointQuiet && Math.hypot(h.position.x - ax, h.position.z - az) >= BT.caveClear && ctx.route === 'forest';
  }

  #spawnBats(dt, ctx) {
    if (!(ctx.riding && ctx.route === 'forest')) return;
    this.rideTime += dt;
    if (this.rideTime < this.nextBat || !this.#batsAllowed(ctx)) return;
    this.nextBat = this.rideTime + this.#range(BT.interval);
    const free = BT.max - this.count('bat');
    const n = Math.min(free, Math.round(this.#range([BT.group[0], BT.group[1] + 0.99]) - 0.49));
    const h = this.deps.horse;
    const track = this.world.track;
    const [ax, az] = CV.archPosition;
    for (let i = 0; i < n; i++) {
      const s = Math.min(track.length, (h.trackS ?? 0) + this.#range(BT.spawnAhead));
      const side = this.random() < 0.5 ? -1 : 1;
      const p = track.at(s);
      const x = p.x - p.tz * side * BT.spawnSide;
      const z = p.z + p.tx * side * BT.spawnSide;
      if (Math.hypot(x - ax, z - az) < BT.caveClear) continue;
      const y = this.world.heightAt(x, z) + this.#range(BT.spawnHeight);
      this.#spawn('bat', (m) => {
        m.position.set(x, y, z);
        m.extra.side = -side; // swings back across the trail
        m.facing = Math.atan2(h.position.x - x, h.position.z - z);
      });
    }
  }

  #spawnSkeletons(dt, ctx) {
    if (!(ctx.route === 'desert' && ctx.pitDone && ctx.riding)) return;
    this.desertTime += dt;
    if (this.desertTime < this.nextSkeletons) return;
    this.nextSkeletons = this.desertTime + this.#range(SK.interval);
    const h = this.deps.horse;
    const track = this.world.desertTrack;
    const castle = this.world.castlePosition;
    const n = Math.min(SK.group, SK.max - this.count('skeleton'));
    for (let i = 0; i < n; i++) {
      const s = (h.trackS ?? 0) + this.#range(SK.ahead);
      if (s > track.length) continue;
      const p = track.at(s);
      const lat = (i % 2 ? 1 : -1) * this.#range(SK.lateral);
      const x = p.x - p.tz * lat;
      const z = p.z + p.tx * lat;
      if (castle && (Math.hypot(x - castle.x, z - castle.z) < SK.castleClear || Math.hypot(h.position.x - castle.x, h.position.z - castle.z) < SK.castleClear)) continue;
      this.#spawn('skeleton', (m) => {
        m.position.set(x, this.world.heightAt(x, z), z);
        m.extra.groundY = m.position.y;
        m.facing = Math.atan2(h.position.x - x, h.position.z - z);
      });
    }
  }

  // --- behaviour ------------------------------------------------------------

  /** Where they aim: the rider's body (mounted) or the hero's chest. */
  #target(ctx) {
    const { hero, horse } = this.deps;
    if (ctx.riding && horse) return { point: horse.collectPoint.clone(), feet: horse.position, radius: CONFIG.horse.radius, riding: true };
    return { point: hero.position.clone().setY(hero.position.y + 0.9), feet: hero.position, radius: CONFIG.hero.radius, riding: false };
  }

  /** A hit on the hero (half a heart, at most once per hitCooldown per enemy). */
  #hurtHero(m, opts = {}) {
    if (m.cooldown > 0) return false;
    m.cooldown = MN.hitCooldown;
    const landed = this.deps.onHitHero?.(MN.touchDamageHearts, m.position.x, m.position.z, { source: m.type, ...opts }) ?? false;
    if (landed) this.stats.hits++;
    return landed;
  }

  #updateBat(m, dt, target, ctx) {
    const flyTo = (point, speed, turn) => {
      const want = point.clone().sub(m.position);
      const d = want.length() || 1;
      want.multiplyScalar(speed / d);
      m.velocity.lerp(want, 1 - Math.exp(-turn * dt));
    };
    const toRider = target.point.clone().sub(m.position.clone().setY(m.position.y + m.height * 0.5));
    const dist = toRider.length();
    if (m.state !== 'spawn' && m.state !== 'retreat' && dist > BT.despawnFar) return this.#remove(m); // outrun (Gallop)
    switch (m.state) {
      case 'spawn':
        if (m.stateTime > 0.2) m.set('swoop');
        break;
      case 'swoop': {
        // An arc in: a sideways swing that straightens out as it closes in.
        const side = new THREE.Vector3(-toRider.z, 0, toRider.x).normalize().multiplyScalar(m.extra.side * BT.arc * Math.max(0, 1 - m.stateTime / 1.5));
        flyTo(target.point.clone().add(side), BT.speed, BT.turn);
        if (dist < BT.biteReach) {
          this.stats.bites++;
          this.#hurtHero(m, { knockback: false });
          const horse = this.deps.horse;
          if (target.riding && typeof horse?.drainEnergy === 'function') {
            horse.drainEnergy(BT.horseEnergy); // (only if the horse has an energy system)
            this.stats.horseEnergy += BT.horseEnergy;
          }
          m.set('attack');
          m.extra.after = this.random() < BT.retreatChance ? 'retreat' : 'circle';
          m.extra.angle = Math.atan2(m.position.z - target.point.z, m.position.x - target.point.x);
        }
        break;
      }
      case 'attack':
        flyTo(target.point.clone().add(new THREE.Vector3(0, BT.circleHeight, 0)), BT.speed * 0.6, BT.turn);
        if (m.stateTime > 0.35) m.set(m.extra.after);
        break;
      case 'circle': {
        m.extra.angle += (BT.speed / BT.circleRadius) * 0.5 * dt;
        const p = target.point.clone().add(new THREE.Vector3(Math.cos(m.extra.angle) * BT.circleRadius, BT.circleHeight, Math.sin(m.extra.angle) * BT.circleRadius));
        flyTo(p, BT.speed, BT.turn * 1.5);
        if (m.stateTime > BT.circleTime) m.set('retreat');
        break;
      }
      case 'retreat': {
        const away = m.position.clone().sub(target.point).setY(0).normalize().multiplyScalar(20);
        flyTo(m.position.clone().add(away).setY(target.point.y + 8), BT.speed, BT.turn);
        if (m.stateTime > BT.retreatTime || dist > BT.despawnFar) return this.#remove(m);
        break;
      }
      default:
        m.set('swoop');
    }
    m.position.addScaledVector(m.velocity, dt);
    m.position.y = Math.max(m.position.y, this.world.heightAt(m.position.x, m.position.z) + 0.4);
    if (m.velocity.lengthSq() > 0.01) m.facing = Math.atan2(m.velocity.x, m.velocity.z);
  }

  #updateSlime(m, dt, target) {
    const ground = this.world.heightAt(m.position.x, m.position.z);
    const dx = target.feet.x - m.position.x;
    const dz = target.feet.z - m.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const edge = d - target.radius - m.radius;
    let hop = 0;
    switch (m.state) {
      case 'spawn': {
        // Rising out of the crack.
        const f = Math.min(1, m.stateTime / SL.emerge);
        m.position.y = ground - m.height * (1 - f);
        if (f >= 1) m.set('move');
        break;
      }
      case 'move':
        m.facing = Math.atan2(dx, dz);
        if (edge <= SL.attackReach && m.cooldown <= 0) {
          m.set('attack');
          break;
        }
        if (edge > SL.attackReach * 0.6) {
          m.position.x += (dx / d) * SL.speed * dt;
          m.position.z += (dz / d) * SL.speed * dt;
        }
        hop = Math.abs(Math.sin(m.stateTime * SL.hopRate * Math.PI)) * SL.hop;
        break;
      case 'attack':
        m.facing = Math.atan2(dx, dz);
        if (m.stateTime >= SL.windup) {
          if (edge <= SL.attackReach + 0.4) this.#hurtHero(m);
          else m.cooldown = MN.hitCooldown * 0.5;
          m.set('move');
        }
        break;
      case 'hopAway':
        // Just hit: hops clear of the hero (never in the way of the boss).
        m.position.x -= (dx / d) * SL.hopAway.speed * dt;
        m.position.z -= (dz / d) * SL.hopAway.speed * dt;
        hop = Math.sin(Math.min(1, m.stateTime / SL.hopAway.time) * Math.PI) * SL.hop * 1.5;
        if (m.stateTime >= SL.hopAway.time) m.set('move');
        break;
      default:
        m.set('move');
    }
    const p = this.#inArena(m.position.x, m.position.z, m.radius);
    m.position.x = p.x;
    m.position.z = p.z;
    if (m.state !== 'spawn') m.position.y = this.world.heightAt(m.position.x, m.position.z) + hop;
  }

  #updateSkeleton(m, dt, target, ctx) {
    const horse = this.deps.horse;
    const dx = target.feet.x - m.position.x;
    const dz = target.feet.z - m.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const edge = d - target.radius - m.radius;
    const ground = this.world.heightAt(m.position.x, m.position.z);
    // Left far behind the horse: gone.
    if (target.riding && m.state !== 'spawn') {
      const behind = -(dx * Math.sin(horse.heading) + dz * Math.cos(horse.heading));
      if (behind > SK.despawnBehind) return this.#remove(m);
    }
    // Galloping straight into it: knocked aside, defeated, no harm to the rider.
    if (target.riding && ctx.galloping && m.state !== 'spawn' && d < target.radius + m.radius + SK.gallopKnock) {
      const side = Math.sign(-dx * Math.cos(horse.heading) + dz * Math.sin(horse.heading)) || 1;
      m.velocity.set(Math.cos(horse.heading) * side * SK.knockSpeed, SK.knockSpeed * 0.5, -Math.sin(horse.heading) * side * SK.knockSpeed);
      m.knocked = true;
      this.stats.knocked++;
      m.die();
      return;
    }
    switch (m.state) {
      case 'spawn': {
        const f = Math.min(1, m.stateTime / SK.rise);
        m.position.y = ground - m.height * 0.6 * (1 - f); // rising out of the sand
        m.facing = Math.atan2(dx, dz);
        if (f >= 1) m.set('move');
        break;
      }
      case 'move':
        m.facing = Math.atan2(dx, dz);
        if (edge <= SK.attackReach && m.cooldown <= 0) {
          m.set('attack');
          break;
        }
        if (edge > SK.attackReach * 0.5) {
          m.position.x += (dx / d) * SK.speed * dt;
          m.position.z += (dz / d) * SK.speed * dt;
        }
        m.position.y = ground;
        break;
      case 'attack':
        m.facing = Math.atan2(dx, dz);
        if (m.stateTime >= SK.windup) {
          if (edge <= SK.attackReach + 0.3) this.#hurtHero(m, { knockback: !target.riding });
          else m.cooldown = MN.hitCooldown * 0.5;
          m.set('move');
        }
        m.position.y = ground;
        break;
      default:
        m.set('move');
    }
  }

  /** Smoked (coughing, held still) or paralyzed (coughing and swaying). */
  #updateDazed(m, dt) {
    if (m.state === 'paralyzed') {
      m.paralyzed = Math.max(0, m.paralyzed - dt);
      if (m.paralyzed <= 0) m.set(m.type === 'bat' ? 'swoop' : 'move');
    } else if (m.stateTime > CONFIG.abilities.smokeBomb.smokeExposureSeconds * 4) m.set(m.type === 'bat' ? 'swoop' : 'move'); // (cloud gone)
    m.velocity.multiplyScalar(Math.exp(-6 * dt));
    if (m.type === 'bat') {
      // Sinks to a low, wobbly hover.
      const low = this.world.heightAt(m.position.x, m.position.z) + 0.9;
      m.position.y += (low - m.position.y) * (1 - Math.exp(-2 * dt));
    } else m.position.y = this.world.heightAt(m.position.x, m.position.z);
  }

  /** The death clip, then the fade, then its gem (unless it melted away with the boss). */
  #updateDeath(m, dt) {
    const ground = this.world.heightAt(m.position.x, m.position.z);
    if (m.knocked || m.type === 'bat') {
      // Knocked aside / falling out of the air.
      m.velocity.y -= 20 * dt;
      m.position.addScaledVector(m.velocity, dt);
      if (m.position.y <= ground) {
        m.position.y = ground;
        m.velocity.set(0, 0, 0);
      }
    }
    if (m.state === 'dying' && m.stateTime >= m.u.animator.duration('death')) m.set('fading');
    if (m.state === 'fading') {
      m.opacity = Math.max(0, 1 - m.stateTime / MN.fade);
      if (m.opacity <= 0) {
        if (!m.noDrop && this.deps.gems) {
          if (this.deps.gems.drop(m.position)) this.stats.drops++;
        }
        this.#remove(m);
      }
    }
  }

  onMinionHit(m) {
    if (m.type === 'slime' && (m.state === 'move' || m.state === 'attack')) m.set('hopAway');
  }

  onMinionDefeated(m) {
    this.stats.defeated[m.type]++;
    this.deps.onEvent?.('minionDefeated', m);
  }

  /** Slimes stay inside the arena (never into the cave). */
  #inArena(x, z, r) {
    const [cx, cz] = CV.center;
    const max = CV.radius - SL.edge - r;
    const d = Math.hypot(x - cx, z - cz);
    if (d <= max) return { x, z };
    return { x: cx + ((x - cx) / d) * max, z: cz + ((z - cz) / d) * max };
  }

  #separate() {
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive || a.type !== b.type) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius + MN.separation * 0.5;
        if (d > 1e-4 && d < min) {
          const push = (min - d) / 2;
          a.position.x -= (dx / d) * push;
          a.position.z -= (dz / d) * push;
          b.position.x += (dx / d) * push;
          b.position.z += (dz / d) * push;
        }
      }
    }
  }

  #remove(m) {
    if (m.removed) return;
    m.removed = true;
    this.scene.remove(m.model);
    this.deps.combat?.removeTarget(m);
    this.deps.abilities?.forget?.(m);
  }
}
