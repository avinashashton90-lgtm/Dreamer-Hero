import * as THREE from 'three';
import { CONFIG, DIALOGUE, abilityGemCost } from './config.js';
import { setObjectOpacity } from './fade.js';

// The sealed boss arena. When the boss notices AJ the entrance closes behind him with a rock
// barrier (a rumble and dust) after `barrierCloseDelay`; it stays shut until the boss is dead,
// and a respawn in the meantime puts him back inside the arena. Only AJ fights: Amy watches
// from her corner at the cave mouth (beyond the boss's leash), the horse waits inside by the
// entrance, grazing. The boss's fire can hurt the horse (a health bar shown only once it is
// hurt); at 0 it bolts and fades away, and comes back to AJ once the barrier opens again.

const AR = CONFIG.arena;
const CV = CONFIG.cave;
const F = CONFIG.boss.fire;

/** The barrier rocks (rising across the arena's west opening) and their dust. */
export async function loadBarrierModel() {
  const B = AR.barrier;
  const group = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: B.color, flatShading: true });
  const rocks = [];
  for (let i = 0; i < B.rocks; i++) {
    const rock = new THREE.Mesh(geo, mat);
    // (a little variety: each rock its own height and tilt)
    const k = 0.85 + 0.3 * (((i * 37) % 7) / 7);
    rock.userData.height = B.height * k;
    rock.scale.set(B.radius, rock.userData.height * 0.55, B.radius * (0.9 + 0.2 * ((i * 13) % 5) / 5));
    rock.rotation.set(0.15 * Math.sin(i * 2.1), i * 1.3, 0.12 * Math.cos(i * 1.7));
    group.add(rock);
    rocks.push(rock);
  }
  const D = AR.dust;
  const dust = [];
  for (let i = 0; i < D.count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: D.color, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    group.add(s);
    dust.push({ sprite: s, age: Infinity, life: D.life, v: new THREE.Vector3(), size: 1 });
  }
  group.userData = { rocks, dust };
  return group;
}

/** Amy's revive glow: a faint golden mote with a short fading trail (additive, no lights). */
export async function loadAmyGlowModel() {
  const A = AR.amyGlow;
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const motes = [];
  for (let i = 0; i < A.trail; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: A.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.setScalar(A.size * 0.25 * (1 - (0.6 * i) / A.trail));
    group.add(m);
    motes.push(m);
  }
  group.userData = { motes };
  group.visible = false;
  return group;
}

/** The horse's health bar: two billboard sprites (shown only while it is hurt). */
function makeHealthBar() {
  const HB = AR.healthBar;
  const group = new THREE.Group();
  const sprite = (color, order) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, depthWrite: false, transparent: true }));
    s.renderOrder = order;
    s.scale.set(HB.width, HB.height, 1);
    group.add(s);
    return s;
  };
  const back = sprite(HB.back, 20);
  back.scale.set(HB.width + 0.08, HB.height + 0.08, 1);
  const fill = sprite(HB.color, 21);
  group.userData = { back, fill };
  group.visible = false;
  return group;
}

const OPEN = 'open';
const ARMED = 'armed'; // the boss noticed him: the barrier closes after barrierCloseDelay
const CLOSING = 'closing';
const CLOSED = 'closed';
const OPENING = 'opening';

export class SealedArena {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {{ hero, horse, boss, cam?, sound?, onToast?: (text:string) => void }} deps
   */
  constructor(scene, world, deps) {
    this.scene = scene;
    this.world = world;
    Object.assign(this, deps);
    const [cx, cz] = CV.center;
    this.center = new THREE.Vector2(cx, cz);
    this.lineX = cx - CV.radius; // the opening (between the entrance pillars)
    const n = AR.barrier.rocks;
    this.slots = Array.from({ length: n }, (_, i) => {
      const z = cz + (n > 1 ? -AR.barrier.span + (2 * AR.barrier.span * i) / (n - 1) : 0);
      return { x: this.lineX, z, y: world.heightAt(this.lineX, z) };
    });
    this.colliders = this.slots.map((s, i) => ({ x: s.x, z: s.z, r: AR.barrier.radius * 0.95, top: s.y + AR.barrier.height * (0.85 + 0.3 * (((i * 37) % 7) / 7)), bottom: s.y - 1, barrier: true }));
    this.stats = { closes: 0, opens: 0, horseHits: 0, flees: 0, returns: 0 };
  }

  async init() {
    this.model = await loadBarrierModel();
    this.scene.add(this.model);
    this.healthBar = makeHealthBar();
    this.scene.add(this.healthBar);
    this.amyGlow = await loadAmyGlowModel();
    this.scene.add(this.amyGlow);
    this.reset();
  }

  /** A new game / Retry: the entrance open, the horse whole, Amy hidden until the boss is beaten. */
  reset() {
    this.state = OPEN;
    this.timer = 0;
    this.rise = 0; // 0 (sunk) … 1 (shut)
    this.#setColliders(false);
    this.glowT = -1; // Amy's revive glow: seconds into its drift (−1: none)
    if (this.amyGlow) this.amyGlow.visible = false;
    if (this.horseTask) this.horse.scripted = false;
    this.horseTask = null;
    this.horseHealth = AR.horseMaxHealth;
    this.horseFireAcc = 0;
    this.#unflee();
    if (this.boss) this.boss.girlWatching = false;
    for (const d of this.model?.userData.dust ?? []) {
      d.age = Infinity;
      d.sprite.visible = false;
    }
    this.#placeRocks();
    if (this.healthBar) this.healthBar.visible = false;
  }

  /** The sealed fight is on (from the boss noticing him until it is dead): respawns stay inside. */
  get sealed() {
    return (this.state === ARMED || this.state === CLOSING || this.state === CLOSED) && !this.boss.defeated;
  }

  /** The barrier blocks the opening (closing, shut, or still sinking). */
  get barrierUp() {
    return this.rise > 0;
  }

  /** Boss.events.onNotice: it saw him — the arena seals behind him (barrierCloseDelay later). */
  notice() {
    if (this.state !== OPEN || this.boss.defeated) return;
    this.state = ARMED;
    this.timer = 0;
    this.boss.girlWatching = true; // Amy watches from her corner (never in reach, never a target)
    this.#leadHorseIn();
  }

  /** Debug / test menu "Boss fight": straight into the sealed arena (AJ inside, barrier shut). */
  sealNow() {
    this.reset();
    this.state = CLOSED;
    this.rise = 1;
    this.#setColliders(true);
    this.#placeRocks();
    this.boss.girlWatching = true;
    this.#horseToSpot();
    this.respawnHero();
  }

  /** A respawn during the sealed fight: AJ revives inside the arena (on foot), the horse at its spot. */
  respawnHero() {
    const { hero, horse } = this;
    const [ox, oz] = AR.respawn;
    const x = this.center.x + ox;
    const z = this.center.y + oz;
    const p = new THREE.Vector3(x, this.world.heightAt(x, z), z);
    if (hero.riding) {
      horse.mode = 'idle';
      hero.stopRiding(p, Math.PI / 2);
    }
    hero.lastSafe.copy(p);
    hero.respawn(); // (full status reset; onRespawn snaps the camera)
    hero.facing = Math.atan2(this.center.x - x, this.center.y - z); // toward the cave
    if (this.cam) {
      this.cam.yaw = hero.facing + Math.PI;
      this.cam.snapTo(hero.position);
    }
    this.horseHealth = AR.horseMaxHealth;
    this.#unflee();
    this.#horseToSpot();
    horse.restoreEnergy();
    horse.everMounted = true;
  }

  /**
   * A death in the sealed fight (a respawn is used as usual): AJ revives inside the arena with
   * full hearts and every ability refilled (`reviveUses` uses each, more on hand kept; the Flash
   * bar full), protected for `arenaReviveProtection` s with a soft golden glow while the boss
   * backs off to the far side; the boss regains only `bossReviveRecoverFraction` of the damage
   * dealt so far (no full reset). A faint golden glow drifts from Amy to him — she stays put.
   */
  reviveHero() {
    const { hero, boss, lives, gems, abilities } = this;
    this.respawnHero();
    lives?.setHearts(lives.maxHearts);
    if (gems) {
      for (const [color, ability] of Object.entries(CONFIG.gems.abilities)) {
        gems.counts[color] = Math.max(gems.counts[color] ?? 0, AR.reviveUses * abilityGemCost(ability));
        gems.unlocked.add(color);
        abilities?.unlock(ability);
      }
    }
    if (abilities) {
      abilities.energy = 1; // (the Flash bar reloaded)
      for (const k of Object.keys(abilities.cooldowns)) abilities.cooldowns[k] = 0;
    }
    const protect = AR.arenaReviveProtection;
    hero.protectFor(protect);
    // The far side of the arena, opposite him.
    const ux = hero.position.x - this.center.x;
    const uz = hero.position.z - this.center.y;
    const ul = Math.hypot(ux, uz) || 1;
    const far = CONFIG.boss.arenaRadius * AR.farSide;
    boss.reviveRecover(AR.bossReviveRecoverFraction, this.center.x - (ux / ul) * far, this.center.y - (uz / ul) * far, protect);
    this.glowT = 0;
    this.stats.revives = (this.stats.revives ?? 0) + 1;
  }

  /** Amy's golden glow drifting from her corner to AJ (an arc, over `amyGlow.time`). */
  #updateAmyGlow(dt) {
    const g = this.amyGlow;
    if (!g) return;
    const A = AR.amyGlow;
    if (this.glowT < 0 || !this.boss.girl) {
      g.visible = false;
      return;
    }
    this.glowT += dt;
    const k = this.glowT / A.time;
    if (k >= 1 + 0.3) {
      this.glowT = -1;
      g.visible = false;
      return;
    }
    g.visible = true;
    const from = this.boss.girl.position;
    const to = this.hero.position;
    g.userData.motes.forEach((m, i) => {
      const t = Math.min(1, Math.max(0, k - i * 0.05));
      const e = t * t * (3 - 2 * t);
      m.position.set(
        from.x + (to.x - from.x) * e,
        from.y + A.from + (to.y + A.to - from.y - A.from) * e + Math.sin(Math.PI * e) * A.arc,
        from.z + (to.z - from.z) * e,
      );
      // (fades in, travels, then melts into him)
      const fade = Math.min(1, k * 4) * Math.max(0, Math.min(1, (1.3 - k) / 0.3));
      m.material.opacity = A.opacity * fade * (1 - i / A.trail);
    });
  }

  /**
   * @param {number} dt
   * @param {boolean} playing  in play (not a cutscene, menu or pause)
   */
  update(dt, playing) {
    const { hero, horse, boss } = this;
    this.#updateAmyGlow(dt);
    if (!playing) {
      // Out of play the story owns the horse (the girl's scene): let go of it, whole and in sight.
      if (this.horseTask) {
        this.horseTask = null;
        horse.scripted = false;
        horse.speed = 0;
      }
      if (horse.fled && boss.defeated) this.#unflee();
      this.#updateBarrier(dt);
      this.#updateBar();
      return;
    }
    this.timer += dt;
    switch (this.state) {
      case ARMED: {
        if (boss.defeated) {
          this.state = OPEN;
          break;
        }
        const inside = Math.hypot(hero.position.x - this.center.x, hero.position.z - this.center.y) < CV.radius - 1;
        if (this.timer >= AR.barrierCloseDelay && inside) this.#startClose();
        break;
      }
      case CLOSING:
      case CLOSED:
        if (boss.defeated) this.#startOpen();
        break;
      default:
        break;
    }
    // The boss's fire can hurt the horse (only while the fight is sealed).
    if (this.sealed && !horse.fled && horse.mode === 'idle' && boss.state === 'fire' && boss.inFireCone(horse.position.x, horse.position.z)) {
      this.horseFireAcc += dt;
      if (this.horseFireAcc >= F.tick) {
        this.horseFireAcc -= F.tick;
        this.#hurtHorse(AR.horseFireDamage);
      }
    } else this.horseFireAcc = F.tick - F.firstTick; // (the first burn comes as quickly as AJ's)
    this.#updateHorse(dt);
    this.#updateBarrier(dt);
    this.#updateBar();
  }

  #startClose() {
    this.state = CLOSING;
    this.timer = 0;
    this.stats.closes++;
    this.#setColliders(true);
    // Nothing is caught in the gateway: AJ and the horse are moved inside.
    const { hero, horse } = this;
    if (this.#inGateway(hero.position, CONFIG.hero.radius)) hero.position.x = this.lineX + AR.clearIn;
    if (horse.position.x < this.lineX + AR.clearIn) this.#horseToSpot(); // (still outside: it's inside now)
    this.#rumble();
    this.onToast?.(DIALOGUE.arena.sealed);
  }

  #startOpen() {
    this.state = OPENING;
    this.timer = 0;
    this.stats.opens++;
    this.#setColliders(false);
    this.#rumble();
    this.onToast?.(DIALOGUE.arena.open);
  }

  #rumble() {
    this.sound?.play('barrierRumble');
    this.cam?.shake(AR.shake.amp, AR.shake.time);
    const D = AR.dust;
    this.model.userData.dust.forEach((d, i) => {
      const slot = this.slots[i % this.slots.length];
      const a = (i * 2.399) % (Math.PI * 2);
      d.age = 0;
      d.life = D.life * (0.7 + 0.6 * ((i * 7) % 5) / 5);
      d.size = D.size[0] + (D.size[1] - D.size[0]) * (((i * 11) % 9) / 9);
      d.sprite.position.set(slot.x + Math.cos(a) * 0.8, slot.y + 0.3, slot.z + Math.sin(a) * 1.2);
      d.v.set(Math.cos(a) * D.speed, D.speed * 0.4, Math.sin(a) * D.speed * 0.6);
      d.sprite.visible = true;
    });
  }

  #inGateway(p, r) {
    return Math.abs(p.x - this.lineX) < AR.barrier.radius + r && Math.abs(p.z - this.center.y) < AR.barrier.span + AR.barrier.radius + r;
  }

  #setColliders(on) {
    const list = this.world.cylinders;
    for (const c of this.colliders) {
      const i = list.indexOf(c);
      if (on && i < 0) list.push(c);
      else if (!on && i >= 0) list.splice(i, 1);
    }
  }

  #updateBarrier(dt) {
    if (this.state === CLOSING) {
      this.rise = Math.min(1, this.rise + dt / AR.closeTime);
      if (this.rise >= 1) this.state = CLOSED;
    } else if (this.state === OPENING) {
      this.rise = Math.max(0, this.rise - dt / AR.openTime);
      if (this.rise <= 0) {
        this.state = OPEN;
        this.#horseComesBack();
      }
    }
    this.#placeRocks();
    for (const d of this.model.userData.dust) {
      if (d.age >= d.life) continue;
      d.age += dt;
      const k = d.age / d.life;
      d.sprite.position.addScaledVector(d.v, dt);
      d.v.multiplyScalar(Math.exp(-2 * dt));
      d.sprite.scale.setScalar(d.size * (0.6 + k));
      d.sprite.material.opacity = AR.dust.opacity * Math.sin(Math.PI * Math.min(1, k));
      if (d.age >= d.life) d.sprite.visible = false;
    }
  }

  #placeRocks() {
    if (!this.model) return;
    const e = this.rise * this.rise * (3 - 2 * this.rise); // (smoothstep: a heavy start and stop)
    this.model.userData.rocks.forEach((rock, i) => {
      const s = this.slots[i];
      const h = rock.userData.height;
      rock.visible = this.rise > 0;
      rock.position.set(s.x, s.y + h * (0.45 - 1.05 * (1 - e)), s.z);
    });
  }

  // --- The horse ---

  #spot() {
    const [ox, oz] = AR.horseSpot;
    return { x: this.center.x + ox, z: this.center.y + oz };
  }

  /** It walks in from wherever it waits (through the opening) to its spot inside. */
  #leadHorseIn() {
    const { horse, hero } = this;
    if (horse.controlsHero || horse.fled || hero.riding) return;
    const s = this.#spot();
    const path = [];
    if (horse.position.x < this.lineX + 1) path.push({ x: this.lineX + 1.5, z: this.center.y + Math.max(-3, Math.min(3, s.z - this.center.y)) });
    path.push(s);
    this.horseTask = { kind: 'walk', path, speed: AR.horseWalk, then: 'graze' };
    horse.scripted = true;
  }

  /** Straight to its spot (respawn, debug, a horse still outside when the barrier comes down). */
  #horseToSpot() {
    const { horse } = this;
    if (horse.controlsHero) return;
    const s = this.#spot();
    horse.mode = 'idle';
    horse.scripted = false;
    horse.speed = 0;
    horse.position.set(s.x, this.world.heightAt(s.x, s.z), s.z);
    horse.heading = AR.horseFacing;
    this.horseTask = null;
  }

  #hurtHorse(n) {
    this.horseHealth = Math.max(0, this.horseHealth - (this.horse.damageTaken?.(n) ?? n));
    this.stats.horseHits++;
    this.sound?.play('horseHurt');
    if (this.horseHealth > 0) return;
    // Out of health: it bolts along the arena's edge and fades out of sight. AJ fights on foot.
    const { horse } = this;
    const a = Math.atan2(horse.position.z - this.center.y, horse.position.x - this.center.x);
    const r = Math.hypot(horse.position.x - this.center.x, horse.position.z - this.center.y);
    this.horseTask = { kind: 'flee', a, r, dir: horse.position.z < this.center.y ? 1 : -1, t: 0 };
    horse.scripted = true;
    this.stats.flees++;
    this.sound?.play('horseFlee');
    this.onToast?.(DIALOGUE.arena.horseFled);
  }

  /** The barrier is open again after the fight: the horse comes back to AJ by itself. */
  #horseComesBack() {
    const { horse, hero } = this;
    if (!this.boss.defeated || horse.controlsHero) return;
    const s = this.#spot();
    const path = [];
    if (horse.fled) {
      this.#unflee();
      const x = this.center.x + AR.comeBack.from;
      horse.position.set(x, this.world.heightAt(x, this.center.y), this.center.y);
      path.push({ x: this.lineX + 1.5, z: this.center.y });
      this.stats.returns++;
      this.onToast?.(DIALOGUE.arena.horseBack);
    } else if (Math.hypot(horse.position.x - s.x, horse.position.z - s.z) > 1) return; // (somewhere else already)
    this.horseHealth = AR.horseMaxHealth;
    path.push({ hero: true });
    this.horseTask = { kind: 'walk', path, speed: AR.horseWalk, then: 'graze', t: 0 };
    horse.mode = 'idle';
    horse.scripted = true;
  }

  #updateHorse(dt) {
    const task = this.horseTask;
    const { horse, hero } = this;
    if (!task) return;
    if (horse.controlsHero || horse.mode !== 'idle') {
      // (AJ got on: he rides it now)
      this.horseTask = null;
      horse.scripted = false;
      return;
    }
    if (task.kind === 'flee') {
      task.t += dt;
      task.a += (task.dir * AR.flee.speed * dt) / task.r;
      const x = this.center.x + Math.cos(task.a) * task.r;
      const z = this.center.y + Math.sin(task.a) * task.r;
      horse.heading = Math.atan2(x - horse.position.x, z - horse.position.z);
      horse.position.set(x, this.world.heightAt(x, z), z);
      horse.speed = AR.flee.speed;
      horse.galloping = true;
      const fade = Math.min(1, Math.max(0, (AR.flee.time - task.t) / AR.flee.fade));
      setObjectOpacity(horse.model, fade);
      if (horse.shadow) horse.shadow.visible = fade > 0.5;
      if (task.t >= AR.flee.time) {
        horse.fled = true;
        horse.model.visible = false;
        if (horse.shadow) horse.shadow.visible = false;
        horse.galloping = false;
        horse.speed = 0;
        horse.scripted = false;
        this.horseTask = null;
      }
      return;
    }
    // Walking a path (the last point may be AJ himself).
    task.t = (task.t ?? 0) + dt;
    const goal = task.path[0];
    const gx = goal.hero ? hero.position.x : goal.x;
    const gz = goal.hero ? hero.position.z : goal.z;
    const dx = gx - horse.position.x;
    const dz = gz - horse.position.z;
    const d = Math.hypot(dx, dz);
    const stop = goal.hero ? AR.comeBack.stop : 0.15;
    if (d <= stop + 0.01 || task.t > AR.comeBack.maxTime) {
      task.path.shift();
      if (!task.path.length || task.t > AR.comeBack.maxTime) {
        if (!goal.hero) horse.heading = AR.horseFacing;
        horse.speed = 0;
        horse.scripted = false;
        this.horseTask = null;
      }
      return;
    }
    const step = Math.min(d - stop, task.speed * dt);
    const want = Math.atan2(dx, dz);
    let diff = want - horse.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    horse.heading += diff * Math.min(1, dt * 6);
    horse.position.x += (dx / d) * step;
    horse.position.z += (dz / d) * step;
    horse.position.y = this.world.heightAt(horse.position.x, horse.position.z);
    horse.speed = task.speed;
  }

  #unflee() {
    const { horse } = this;
    if (!horse) return;
    if (horse.fled || horse.model?.userData.fadeOpacity < 1) {
      horse.fled = false;
      horse.model.visible = true;
      setObjectOpacity(horse.model, 1);
      if (horse.shadow) horse.shadow.visible = true;
      if (this.horseTask?.kind === 'flee') {
        this.horseTask = null;
        horse.scripted = false;
      }
    }
  }

  #updateBar() {
    const bar = this.healthBar;
    if (!bar) return;
    const { horse } = this;
    const frac = this.horseHealth / AR.horseMaxHealth;
    bar.visible = frac < 1 && frac > 0 && !horse.fled && horse.model.visible;
    if (!bar.visible) return;
    const HB = AR.healthBar;
    bar.position.set(horse.position.x, horse.position.y + HB.up, horse.position.z);
    const { fill } = bar.userData;
    const f = Math.max(0.001, frac);
    fill.scale.set(HB.width * f, HB.height, 1);
    fill.center.set(0.5 / f, 0.5); // (left-aligned with the back of the bar)
    fill.material.color.setHex(frac < 0.35 ? HB.low : HB.color);
  }
}
