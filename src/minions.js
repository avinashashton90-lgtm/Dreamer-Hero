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
    this.flying = !!T.flying; // (the mounted Batarang auto-aims at flying targets)
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

  /** The hit body (a vertical capsule from its feet): MN.types[type].hit, else its collision size. */
  get hitRadius() {
    return MN.types[this.type].hit?.radius ?? this.radius;
  }

  get hitHeight() {
    return MN.types[this.type].hit?.height ?? this.height;
  }

  get alive() {
    return this.hp > 0 && !this.removed && this.state !== 'dying' && this.state !== 'fading';
  }

  /** The hero's hits: melee 4, Batarang 6 (MN.damage), the Flash bolt kills it. */
  takeHit({ amount = 0, source = 'melee', flash = false } = {}) {
    if (!this.alive) return 0;
    const dmg = flash || source === 'flash' ? this.hp : (MN.types[this.type].damageTaken?.[source] ?? MN.damage[source] ?? amount);
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
    else if (s === 'attack' || s === 'dive') an.set('attack', { once: true });
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
    if (this.marker) {
      // The red telegraph marker over an attacking bat (pulsing).
      this.marker.visible = s === 'telegraph';
      this.marker.position.set(0, this.height + BT.marker.up, 0);
      this.marker.scale.setScalar(1 + 0.25 * Math.sin(this.clock * 18));
      this.marker.rotation.y += dt * 5;
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
 *   scheduleBats), 1–3 fly in from the tree line ahead and wait in view ahead of the rider; only
 *   the nearest attacks (never two within attackGap): telegraphed circling, one dive, one bite,
 *   then it flees; never within caveClear of the cave or in the first seconds after a checkpoint.
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
    this.lastBatAttackAt = -Infinity; // when the last bat started its dive (attackGap)
    this.stats = { spawned: { bat: 0, skeleton: 0, slime: 0 }, defeated: { bat: 0, skeleton: 0, slime: 0 }, drops: 0, bites: 0, hits: 0, knocked: 0, horseEnergy: 0, dives: 0, screeches: 0, outOfView: 0 };
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
   * Bats only come in during these windows of riding time (seconds since the ride began);
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
    this.viewPoint = target.point;
    for (const m of this.list) {
      if (m.removed) continue;
      m.stateTime += dt;
      m.cooldown = Math.max(0, m.cooldown - dt);
      if (m.state === 'dying' || m.state === 'fading') this.#updateDeath(m, dt);
      else if (m.state === 'smoked' || m.state === 'paralyzed') this.#updateDazed(m, dt);
      else if (m.type === 'bat') this.#updateBat(m, dt, target);
      else if (m.type === 'slime') this.#updateSlime(m, dt, target, ctx);
      else this.#updateSkeleton(m, dt, target, ctx);
      m.pose(dt);
    }
    this.#separate();
    if (!target.riding) this.#clearOfHero(dt, target);
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
    if (type === 'bat') {
      m.marker = makeBatMarker();
      m.model.add(m.marker);
      m.extra.order = this.batOrder = (this.batOrder ?? 0) + 1;
    }
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
    if (ctx.riding && horse) {
      const v = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading)).multiplyScalar(horse.speed);
      return { point: hero.position.clone().setY(hero.position.y + 0.45), feet: horse.position, radius: CONFIG.horse.radius, riding: true, heading: horse.heading, velocity: v };
    }
    return { point: hero.position.clone().setY(hero.position.y + 0.9), feet: hero.position, radius: CONFIG.hero.radius, riding: false, heading: hero.facing, velocity: hero.velocity.clone().setY(0) };
  }

  /** A hit on the hero (half a heart, at most once per hitCooldown per enemy). */
  #hurtHero(m, opts = {}) {
    if (m.cooldown > 0) return false;
    m.cooldown = MN.hitCooldown;
    const landed = this.deps.onHitHero?.(MN.touchDamageHearts, m.position.x, m.position.z, { source: m.type, ...opts }) ?? false;
    if (landed) this.stats.hits++;
    return landed;
  }

  /**
   * Bats: fly in to a waiting spot ahead of and above the rider (it moves with him), wait, and
   * only the nearest attacks — no two within attackGap: it circles overhead for `telegraph` s
   * (a screech, the red marker), dives once at batDiveSpeed, bites, then flees for good. While
   * coming in, waiting and attacking it is kept inside the camera view.
   */
  #updateBat(m, dt, target) {
    const fwd = new THREE.Vector3(Math.sin(target.heading), 0, Math.cos(target.heading));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const riderV = target.velocity;
    const toward = (point, speed) => {
      const d = point.clone().sub(m.position);
      const l = d.length();
      if (l > 1e-4) m.position.addScaledVector(d, Math.min(1, (speed * dt) / l));
      return l;
    };
    const dist = m.position.distanceTo(target.point);
    if (m.state !== 'flee' && dist > BT.despawnFar) return this.#remove(m);
    switch (m.state) {
      case 'spawn':
        if (m.stateTime > 0.15) m.set('approach');
        break;
      case 'approach': {
        m.position.addScaledVector(riderV, dt); // (keeps up with the rider, then closes in)
        const l = toward(this.#clampToView(this.#holdSpot(m, target, fwd, right), m.height, BT.viewMargin + BT.spotMargin), BT.approachSpeed);
        if (l < 1) m.set('hold');
        else if (m.stateTime > BT.approachTimeout) this.#flee(m, fwd, right);
        break;
      }
      case 'hold': {
        const spot = this.#holdSpot(m, target, fwd, right);
        spot.y += Math.sin(m.clock * BT.hold.bobRate) * BT.hold.bob;
        this.#clampToView(spot, m.height, BT.viewMargin + BT.spotMargin); // (the spot is on screen too, whatever the FOV)
        m.position.lerp(spot, 1 - Math.exp(-BT.hold.follow * dt));
        if (m.stateTime >= BT.holdMin && this.#mayAttack(m, target)) {
          m.set('telegraph');
          m.extra.angle = Math.atan2(m.position.z - target.point.z, m.position.x - target.point.x);
          this.stats.screeches++;
          this.deps.onEvent?.('batScreech', m);
        }
        break;
      }
      case 'telegraph': {
        // Circling overhead, screeching, the red marker on it.
        m.extra.angle += ((Math.PI * 2) / BT.telegraph) * dt;
        const c = target.point.clone().addScaledVector(fwd, BT.circleAhead).add(new THREE.Vector3(Math.cos(m.extra.angle) * BT.circleRadius, BT.circleUp, Math.sin(m.extra.angle) * BT.circleRadius));
        m.position.lerp(c, 1 - Math.exp(-BT.circleFollow * dt));
        if (m.stateTime >= BT.telegraph) {
          m.set('dive');
          this.lastBatAttackAt = this.clock;
          this.stats.dives++;
        }
        break;
      }
      case 'dive': {
        // One dive, in the rider's frame (so it's fair at any speed).
        m.position.addScaledVector(riderV, dt);
        const l = toward(target.point, BT.batDiveSpeed);
        if (l < BT.biteReach) {
          this.stats.bites++;
          this.#hurtHero(m, { knockback: false });
          const horse = this.deps.horse;
          if (target.riding && typeof horse?.drainEnergy === 'function') {
            horse.drainEnergy(BT.horseEnergy); // (only if the horse has an energy system)
            this.stats.horseEnergy += BT.horseEnergy;
          }
          this.#flee(m, fwd, right);
        } else if (m.stateTime > BT.diveTimeout) this.#flee(m, fwd, right); // (safety)
        break;
      }
      case 'flee':
        m.position.addScaledVector(m.velocity, dt);
        if (m.stateTime > BT.flee.time) return this.#remove(m);
        break;
      default:
        m.set('hold');
    }
    if (m.state !== 'flee') {
      m.position.y = Math.max(m.position.y, this.world.heightAt(m.position.x, m.position.z) + BT.groundClear);
      this.#keepInView(m);
    }
    const look = m.state === 'flee' ? m.velocity : target.point.clone().sub(m.position);
    if (look.lengthSq() > 0.01) m.facing = Math.atan2(look.x, look.z);
  }

  /** The bat's waiting spot: ahead of and above the rider, side by side by arrival. */
  #holdSpot(m, target, fwd, right) {
    const waiting = this.list.filter((b) => b.type === 'bat' && b.alive && (b.state === 'approach' || b.state === 'hold' || b.state === 'spawn')).sort((a, b) => a.extra.order - b.extra.order);
    const k = Math.max(0, waiting.indexOf(m));
    const H = BT.hold;
    const side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
    return target.point.clone().addScaledVector(fwd, H.ahead + Math.ceil(k / 2) * 0.8).addScaledVector(right, side * H.side * 0.55 + side * H.spacing * 0.5).add(new THREE.Vector3(0, H.up + k * 0.4, 0));
  }

  /** Only the nearest waiting bat attacks, never two within attackGap, one at a time. */
  #mayAttack(m, target) {
    if (this.clock - this.lastBatAttackAt < BT.attackGap) return false;
    if (this.list.some((b) => b.type === 'bat' && b.alive && (b.state === 'telegraph' || b.state === 'dive'))) return false;
    const holding = this.list.filter((b) => b.type === 'bat' && b.alive && b.state === 'hold');
    const nearest = holding.reduce((a, b) => (!a || b.position.distanceTo(target.point) < a.position.distanceTo(target.point) ? b : a), null);
    return nearest === m;
  }

  #flee(m, fwd, right) {
    const side = this.random() < 0.5 ? -1 : 1;
    m.velocity.copy(right).multiplyScalar(side).add(new THREE.Vector3(0, BT.flee.up, 0)).addScaledVector(fwd, -0.3).normalize().multiplyScalar(BT.flee.speed);
    m.set('flee');
  }

  /** Keeps a bat inside the camera view (a margin from the screen edge, in front of the camera). */
  #keepInView(m) {
    this.#clampToView(m.position, m.height, BT.viewMargin);
  }

  /** Moves a bat's spot `p` (its feet; `height` tall) inside the camera view, in place. */
  #clampToView(p, height, margin) {
    const cam = this.deps.camera;
    if (!cam || (this.viewPoint && cam.position.distanceTo(this.viewPoint) > BT.viewFollow)) return p; // (the camera isn't on the hero yet)
    cam.updateMatrixWorld();
    const v = p.clone().setY(p.y + height * 0.5).applyMatrix4(cam.matrixWorldInverse); // view space: -z ahead
    const depth = Math.max(-v.z, BT.minDepth);
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (1 - margin);
    const tx = ty * cam.aspect;
    const nx = THREE.MathUtils.clamp(v.x / depth, -tx, tx);
    const ny = THREE.MathUtils.clamp(v.y / depth, -ty, ty);
    if (depth !== -v.z || nx !== v.x / depth || ny !== v.y / depth) {
      v.set(nx * depth, ny * depth, -depth).applyMatrix4(cam.matrixWorld);
      p.set(v.x, v.y - height * 0.5, v.z);
    }
    return p;
  }

  /** Keeps every bat that's coming in, waiting or attacking inside the camera view (after the camera moved). */
  fitView() {
    for (const m of this.list) if (m.flying && m.alive && m.state !== 'flee') {
      this.#keepInView(m);
      m.model.position.copy(m.position);
    }
  }

  /** Is the minion on screen (centre inside the view, in front of the camera)? (tests) */
  inView(m, margin = 0) {
    const cam = this.deps.camera;
    if (!cam) return true;
    cam.updateMatrixWorld();
    const c = m.position.clone().setY(m.position.y + m.height * 0.5);
    const v = c.clone().applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -0.1) return false;
    const p = c.project(cam);
    return Math.abs(p.x) <= 1 - margin && Math.abs(p.y) <= 1 - margin;
  }

  /** Debug B: a bat right in front of the rider (or the hero on foot), coming in at once. */
  debugBat() {
    const { hero, horse } = this.deps;
    const riding = !!hero.riding;
    const h = riding ? horse.heading : hero.facing;
    const p = riding ? horse.position : hero.position;
    const x = p.x + Math.sin(h) * 10;
    const z = p.z + Math.cos(h) * 10;
    return this.spawnAt('bat', { x, z, y: this.world.heightAt(x, z) + 4 });
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
      const behind = dx * Math.sin(horse.heading) + dz * Math.cos(horse.heading); // (dx, dz: from it to the horse — positive = it is behind)
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
      if (m.paralyzed <= 0) m.set(m.type === 'bat' ? 'hold' : 'move');
    } else if (m.stateTime > CONFIG.abilities.smokeBomb.smokeExposureSeconds * 4) m.set(m.type === 'bat' ? 'hold' : 'move'); // (cloud gone)
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

  /**
   * Slimes never wall the hero in: inside `exclusion` of him they are pushed out softly (shoved
   * hard by a dodge roll, which passes through them), and none stays inside longer than
   * `maxInside` — then it is put outside at once.
   */
  #clearOfHero(dt, target) {
    const X = CONFIG.corner.slimes;
    const hero = this.deps.hero;
    for (const m of this.list) {
      if (m.type !== 'slime' || !m.alive || m.removed || m.state === 'spawn') continue;
      let dx = m.position.x - target.feet.x;
      let dz = m.position.z - target.feet.z;
      let d = Math.hypot(dx, dz);
      if (d >= X.exclusion) {
        m.extra.inside = 0;
        continue;
      }
      if (d < 1e-3) {
        dx = Math.sin(m.facing + Math.PI);
        dz = Math.cos(m.facing + Math.PI);
        d = 1;
      }
      m.extra.inside = (m.extra.inside ?? 0) + dt;
      const shove = hero?.dodgeT > 0 ? X.dodgeShove : X.push;
      const step = m.extra.inside > X.maxInside ? X.exclusion - d + 0.01 : Math.min(X.exclusion - d, shove * dt);
      m.position.x += (dx / d) * step;
      m.position.z += (dz / d) * step;
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

/** The red telegraph marker over an attacking bat (an additive diamond, no lights). */
function makeBatMarker() {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(BT.marker.size, 0).scale(1, 1.4, 1),
    new THREE.MeshBasicMaterial({ color: BT.marker.color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  m.renderOrder = 9;
  m.visible = false;
  return m;
}
