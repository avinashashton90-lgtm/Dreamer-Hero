import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadDizzyModel } from './combat.js';
import { makeFadeMaterial, addFadeAttribute } from './world.js';
import { loadGirlModel } from './girl.js';

const B = CONFIG.boss;
const CV = CONFIG.cave;
const F = B.fire;
const { clamp, lerp } = THREE.MathUtils;

// ---------------------------------------------------------------------------
// Swappable placeholder models
// ---------------------------------------------------------------------------

/**
 * Placeholder cave monster (origin at the feet, facing +Z, ~3x the hero's height): a hunched
 * body, horned head with glowing eyes, long arms with huge fists (pivots for the slam) and
 * stubby legs. Pivots the animation needs are in `userData`.
 */
export async function loadMonsterModel() {
  const C = B.colors;
  const mats = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    mats.push(m);
    return m;
  };
  const skin = mat(C.skin);
  const belly = mat(C.belly);
  const horn = mat(C.horn);
  const eye = new THREE.MeshBasicMaterial({ color: C.eye });
  mats.push(eye);
  const mesh = (geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // leans / falls
  root.add(body);
  body.add(mesh(new THREE.SphereGeometry(1, 10, 8).scale(1.55, 1.45, 1.25), skin, 0, 2.9, 0));
  body.add(mesh(new THREE.SphereGeometry(1, 8, 6).scale(1.05, 1.1, 0.6), belly, 0, 2.6, 0.75));
  for (let i = 0; i < 4; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.28, 0.9, 5), horn, 0, 4.1 - i * 0.55, -0.9 - i * 0.15);
    spike.rotation.x = -0.9;
    body.add(spike);
  }
  // Head on a pivot (tips back for the fire breath, lowers for the charge): skull, brow,
  // horns, glowing eyes, upper teeth, and a hinged lower jaw with its own teeth.
  const head = new THREE.Group();
  head.position.set(0, 4.15, 0.8);
  head.add(mesh(new THREE.BoxGeometry(1.3, 0.75, 1.2), skin, 0, 0.38, 0.35)); // skull
  head.add(mesh(new THREE.BoxGeometry(1.36, 0.18, 0.4), skin, 0, 0.55, 0.85)); // brow
  head.add(mesh(new THREE.BoxGeometry(1.0, 0.22, 0.55), belly, 0, 0.05, 0.75)); // upper muzzle
  for (const side of [-1, 1]) {
    const hornM = mesh(new THREE.ConeGeometry(0.2, 1.1, 6), horn, side * 0.55, 1.0, 0.2);
    hornM.rotation.set(-0.3, 0, side * -0.5);
    head.add(hornM);
    head.add(mesh(new THREE.SphereGeometry(0.13, 6, 5), eye, side * 0.3, 0.42, 0.95));
    for (const k of [0.15, 0.32]) head.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI), horn, side * k, -0.12, 0.98));
  }
  // Glowing mouth (fire breath), deep inside.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: F.mouthColor, transparent: true, opacity: 0 }));
  mouth.position.set(0, -0.12, 0.62);
  head.add(mouth);
  const jaw = new THREE.Group(); // hinge at the back of the mouth
  jaw.position.set(0, -0.08, 0.2);
  jaw.add(mesh(new THREE.BoxGeometry(1.05, 0.3, 0.95), belly, 0, -0.16, 0.48));
  for (const side of [-1, 1]) {
    jaw.add(mesh(new THREE.ConeGeometry(0.09, 0.38, 5), horn, side * 0.36, 0.1, 0.86)); // tusks
    jaw.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 4), horn, side * 0.16, 0.04, 0.9));
  }
  head.add(jaw);
  body.add(head);
  // Arms: shoulder → elbow → huge fist.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.55, 3.7, 0.2);
    shoulder.add(mesh(new THREE.SphereGeometry(0.55, 8, 6), skin));
    shoulder.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.5, 7).translate(0, -0.75, 0), skin));
    const elbow = new THREE.Group();
    elbow.position.y = -1.5;
    elbow.add(mesh(new THREE.CylinderGeometry(0.38, 0.32, 1.3, 7).translate(0, -0.65, 0), skin));
    elbow.add(mesh(new THREE.DodecahedronGeometry(0.62, 0), belly, 0, -1.45, 0));
    shoulder.add(elbow);
    body.add(shoulder);
    arms.push({ shoulder, elbow });
  }
  // Legs: hip → thigh → knee → shin → clawed foot.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.8, 1.7, 0);
    hip.add(mesh(new THREE.CylinderGeometry(0.58, 0.46, 0.9, 7).translate(0, -0.45, 0), skin));
    const knee = new THREE.Group();
    knee.position.y = -0.9;
    knee.add(mesh(new THREE.SphereGeometry(0.42, 7, 6), skin));
    knee.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.75, 7).translate(0, -0.38, 0), skin));
    knee.add(mesh(new THREE.BoxGeometry(0.9, 0.22, 1.2), horn, 0, -0.69, 0.22));
    for (const k of [-0.3, 0, 0.3]) knee.add(mesh(new THREE.ConeGeometry(0.08, 0.3, 4).rotateX(Math.PI / 2), horn, k, -0.72, 0.9));
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee });
  }
  root.userData = { body, head, jaw, mouth, arms, legs, mats };
  return root;
}

/** Placeholder slam warning: a red disc with a rim, laid on the ground. */
export async function loadSlamWarningModel() {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: B.warningColor, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: B.warningColor, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  fill.renderOrder = rim.renderOrder = 8;
  group.add(fill, rim);
  group.userData = { fill, rim };
  group.visible = false;
  return group;
}

/** Placeholder fire-breath warning: a red cone (sector) on the ground, pointing along +Z. */
export async function loadFireConeModel() {
  const n = 18;
  const pos = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const a = -F.halfAngle + (2 * F.halfAngle * i) / n;
    pos.push(Math.sin(a), 0, Math.cos(a));
  }
  const idx = [];
  for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: F.coneColor, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  cone.renderOrder = 8;
  cone.scale.setScalar(F.range);
  cone.visible = false;
  return cone;
}

/** Placeholder fire: a pool of glowing, additive particles with per-particle fade. */
export async function loadFireModel(count) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  addFadeAttribute(geo, count);
  const mat = makeFadeMaterial({ color: 0xffffff, emissive: F.mouthColor, emissiveIntensity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.count = 0;
  return mesh;
}

/** Placeholder slam shockwave: a pale ring that expands on the ground. */
export async function loadShockwaveModel() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf2e6c9, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  ring.renderOrder = 8;
  ring.visible = false;
  return ring;
}

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

export const BOSS_STATES = Object.freeze({
  GUARD: 'guard', // waits at the cave mouth until the hero enters the arena
  CHASE: 'chase', // walks toward the hero
  SLAM_WINDUP: 'slamWindup', // arms up, red circle on the ground
  SLAM: 'slam', // fists down: damage inside the circle
  FIRE_WINDUP: 'fireWindup', // head back, glowing mouth, red cone on the ground
  FIRE: 'fire', // 2 s cone of fire, damage over time inside it
  CHARGE_WINDUP: 'chargeWindup', // head down, 1 s pause
  CHARGE: 'charge', // straight-line rush
  STUNNED: 'stunned', // hit a boulder while charging
  RECOVER: 'recover', // short pause after every attack
  PARALYZED: 'paralyzed', // Smoke Bomb
  DYING: 'dying', // stumbles, falls, fades
  DEAD: 'dead',
});
const S = BOSS_STATES;

/**
 * The cave monster: 100 HP, guards the cave until the hero steps into the arena, then
 * Chase → Slam (rears up 0.8 s over a red warning circle, then smashes both fists into the
 * ground), Fire Breath (head back with a glowing mouth over a red cone, then 2 s of fire with
 * damage over time) or Charge (head down, 1 s pause, straight rush; a boulder stuns it for
 * 2 s) → Recover. Below 40% HP it attacks faster.
 * Smoke Bomb paralysis stops everything; paralyzed or stunned it takes bonus damage.
 * A combat target (see combat.js).
 */
export class Boss {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {{ onHitHero?: (hearts:number, x:number, z:number, opts?:{knockback?:boolean, source?:string}) => void, onSlam?: Function, onDefeat?: Function, onWake?: Function }} [events]
   */
  constructor(scene, world, events = {}) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.position = new THREE.Vector3();
    this.radius = B.radius;
    this.height = B.height;
    this.maxHp = B.hp;
    this.center = new THREE.Vector3(CV.center[0], 0, CV.center[1]);
    this.slamAt = new THREE.Vector3();
    this.chargeDir = new THREE.Vector2();
    this.fireDir = new THREE.Vector2(0, 1);
    this.fireOrigin = new THREE.Vector3();
    this.flames = []; // fire particles
    this.stats = { slams: 0, slamHits: 0, charges: 0, chargeHits: 0, stuns: 0, fires: 0, fireHits: 0 };
    this.visited = new Set(); // states entered (tests)
    this.reset();
  }

  async init() {
    this.model = await loadMonsterModel();
    this.warning = await loadSlamWarningModel();
    this.dizzy = await loadDizzyModel();
    this.dizzy.scale.setScalar(2.2);
    this.model.add(this.dizzy);
    this.girl = await loadGirlModel();
    this.fireCone = await loadFireConeModel();
    this.fireMesh = await loadFireModel(F.particles);
    this.shock = await loadShockwaveModel();
    this.scene.add(this.model, this.warning, this.girl, this.fireCone, this.fireMesh, this.shock);
    this.reset();
  }

  /** Full health, back on guard at the cave mouth (new game / respawn with bossResetsOnRespawn). */
  reset() {
    const [x, z] = B.guard;
    this.position.set(x, this.world.heightAt(x, z), z);
    this.facing = -Math.PI / 2; // facing west, toward the arena entrance
    this.hp = B.hp;
    this.state = S.GUARD;
    this.timer = 0;
    this.stateTime = 0;
    this.paralyzed = 0;
    this.smokeExposure = 0;
    this.flash = 0;
    this.chargeHit = false;
    this.fireCooldown = 0;
    this.fireAcc = 0;
    this.fireSpawn = 0;
    for (const f of this.flames) f.age = f.life;
    this.defeated = false;
    this.girlTime = -1;
    this.girlTaken = false; // she has left with the hero (Story)
    this.phase = 0;
    if (this.model) {
      this.model.visible = true;
      for (const m of this.model.userData.mats) {
        m.transparent = false;
        m.opacity = 1;
      }
      this.warning.visible = false;
      this.fireCone.visible = false;
      this.shock.visible = false;
      this.girl.visible = false;
      this.#pose(0);
    }
  }

  get alive() {
    return this.hp > 0 && this.state !== S.DYING && this.state !== S.DEAD;
  }

  /** Fight in progress (for the health bar). */
  get active() {
    return this.state !== S.GUARD && this.state !== S.DEAD;
  }

  get enraged() {
    return this.hp <= this.maxHp * B.enrageAt;
  }

  /** Timing multiplier: attacks come faster below 40% HP. */
  get pace() {
    return this.enraged ? B.enrageTime : 1;
  }

  takeHit({ amount, flash = false }) {
    if (!this.alive) return 0;
    if (this.state === S.GUARD) this.#set(S.CHASE);
    let dmg = amount;
    // Flash Mode removes exactly 50% of max HP; other hits do bonus damage while it's helpless.
    if (!flash && this.state === S.PARALYZED) dmg *= B.paralyzedBonus;
    else if (!flash && this.state === S.STUNNED) dmg *= B.stunnedBonus;
    dmg = Math.min(this.hp, Math.round(dmg));
    this.hp -= dmg;
    this.flash = CONFIG.combat.hitFlash;
    if (this.hp <= 0) {
      this.warning.visible = false;
      this.#set(S.DYING);
    }
    return dmg;
  }

  /** Smoke Bomb: stops all actions for `seconds`. */
  paralyze(seconds) {
    if (!this.alive) return;
    this.paralyzed = seconds;
    if (this.warning) this.warning.visible = false;
    this.#set(S.PARALYZED);
  }

  /** World position of the mouth (the smoke is breathed in here). */
  mouthPosition(out = new THREE.Vector3()) {
    if (!this.model) return out.set(this.position.x, this.position.y + this.height * 0.85, this.position.z);
    this.model.updateMatrixWorld(true);
    return this.model.userData.mouth.getWorldPosition(out);
  }

  /** The hero used a respawn: back to full health on guard (CONFIG.lives.bossResetsOnRespawn). */
  onHeroRespawn() {
    if (CONFIG.lives.bossResetsOnRespawn && !this.defeated) this.reset();
  }

  /** Debug: defeated already (no dying animation); the girl is at the cave mouth. */
  debugDefeat() {
    this.hp = 0;
    this.defeated = true;
    this.state = S.DEAD;
    this.visited.add(S.DEAD);
    if (this.model) this.model.visible = false;
    if (this.warning) this.warning.visible = false;
    if (this.fireCone) this.fireCone.visible = false;
    this.girlTime = B.girl.appearTime;
    this.placeGirl();
  }

  /** Put the girl at the cave mouth now (normally done each frame by update). */
  placeGirl() {
    if (!this.girl || this.girlTaken) return;
    const [gx, gz] = B.girl.position;
    const k = Math.min(1, Math.max(0, this.girlTime) / B.girl.appearTime);
    this.girl.visible = this.girlTime >= 0;
    this.girl.position.set(gx + (1 - k) * 4, this.world.heightAt(gx, gz), gz);
    this.girl.rotation.set(0, B.girl.facing, 0);
    this.girl.scale.setScalar(0.3 + 0.7 * k);
  }

  /** Debug: defeat it now. */
  kill() {
    if (!this.alive) return;
    this.hp = 0;
    if (this.warning) this.warning.visible = false;
    this.#set(S.DYING);
  }

  /**
   * @param {number} dt
   * @param {import('./hero.js').Hero} hero
   */
  update(dt, hero) {
    this.stateTime += dt;
    this.clock = (this.clock ?? 0) + dt;
    this.flash = Math.max(0, this.flash - dt);
    const onFoot = !hero.riding;
    const dx = hero.position.x - this.position.x;
    const dz = hero.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const heroInArena = onFoot && Math.hypot(hero.position.x - this.center.x, hero.position.z - this.center.z) < CV.radius;
    const P = this.pace;

    switch (this.state) {
      case S.GUARD:
        if (heroInArena) {
          this.#set(S.CHASE);
          this.events.onWake?.();
        }
        break;
      case S.CHASE: {
        if (!onFoot) break; // hero left on the horse: wait
        this.#turnTo(dx, dz, dt);
        if (dist <= B.slam.range) {
          this.#startSlam();
        } else if (this.fireCooldown <= 0 && dist >= F.minRange && dist <= F.maxRange && this.stateTime >= F.chaseBefore * P && this.#facingWithin(dx, dz, 0.5)) {
          this.#set(S.FIRE_WINDUP);
          this.#aimFire(dx, dz);
        } else if (dist >= B.charge.minRange && this.stateTime >= B.charge.chaseBefore * P && this.#facingWithin(dx, dz, 0.35)) {
          this.#set(S.CHARGE_WINDUP);
        } else {
          const v = B.walkSpeed * (this.enraged ? B.enrageWalk : 1);
          this.#move(Math.sin(this.facing) * v * dt, Math.cos(this.facing) * v * dt);
        }
        break;
      }
      case S.SLAM_WINDUP:
        if (this.stateTime >= B.slam.windup * P) {
          this.#set(S.SLAM);
          this.stats.slams++;
          this.events.onSlam?.(this.slamAt);
          if (onFoot && Math.hypot(hero.position.x - this.slamAt.x, hero.position.z - this.slamAt.z) < B.slam.radius) {
            this.stats.slamHits++;
            this.events.onHitHero?.(B.slam.damage, this.slamAt.x, this.slamAt.z);
          }
        }
        break;
      case S.SLAM:
        if (this.stateTime >= B.slam.impact) this.#set(S.RECOVER);
        break;
      case S.FIRE_WINDUP:
        // Rears its head back, mouth glowing; the cone on the ground follows the hero slowly.
        this.#turnTo(dx, dz, dt * (F.trackRate / B.turnRate));
        this.#aimFire(Math.sin(this.facing), Math.cos(this.facing));
        if (this.stateTime >= F.windup * P) {
          this.#set(S.FIRE);
          this.stats.fires++;
          this.fireAcc = F.tick - F.firstTick;
        }
        break;
      case S.FIRE:
        // The cone is locked now: stay out of it (dodge sideways) or burn.
        if (onFoot && this.inFireCone(hero.position.x, hero.position.z)) {
          this.fireAcc += dt;
          if (this.fireAcc >= F.tick) {
            this.fireAcc -= F.tick;
            this.stats.fireHits++;
            this.events.onHitHero?.(F.damage, this.fireOrigin.x, this.fireOrigin.z, { knockback: false, source: 'fire' });
          }
        }
        if (this.stateTime >= F.duration) {
          this.fireCooldown = F.cooldown;
          this.#set(S.RECOVER);
        }
        break;
      case S.CHARGE_WINDUP:
        this.#turnTo(dx, dz, dt);
        if (this.stateTime >= B.charge.windup * P) {
          this.chargeDir.set(Math.sin(this.facing), Math.cos(this.facing));
          this.chargeHit = false;
          this.stats.charges++;
          this.#set(S.CHARGE);
        }
        break;
      case S.CHARGE: {
        const step = B.charge.speed * dt;
        this.position.x += this.chargeDir.x * step;
        this.position.z += this.chargeDir.y * step;
        if (!this.chargeHit && onFoot && dist < this.radius + B.charge.hitPad + CONFIG.hero.radius) {
          this.chargeHit = true;
          this.stats.chargeHits++;
          this.events.onHitHero?.(B.charge.damage, this.position.x, this.position.z);
        }
        // A boulder: stunned (and open to bonus damage).
        const rock = this.world.arenaRocks?.find((r) => Math.hypot(this.position.x - r.x, this.position.z - r.z) < r.r + this.radius);
        if (rock) {
          const d = Math.hypot(this.position.x - rock.x, this.position.z - rock.z) || 1;
          const push = rock.r + this.radius - d;
          this.position.x += ((this.position.x - rock.x) / d) * push;
          this.position.z += ((this.position.z - rock.z) / d) * push;
          this.stats.stuns++;
          this.#set(S.STUNNED);
        } else if (this.#keepInArena() || this.stateTime >= B.charge.maxTime) {
          this.#set(S.RECOVER); // ran out of room (the open entrance) or out of steam
        }
        break;
      }
      case S.STUNNED:
        if (this.stateTime >= B.charge.stun) this.#set(S.RECOVER);
        break;
      case S.RECOVER:
        if (this.stateTime >= B.recover * P) this.#set(S.CHASE);
        break;
      case S.PARALYZED:
        this.paralyzed = Math.max(0, this.paralyzed - dt);
        if (this.paralyzed <= 0) this.#set(S.RECOVER);
        break;
      case S.DYING: {
        const D = B.dying;
        if (this.stateTime >= D.stumble + D.fall + D.fade) {
          this.#set(S.DEAD);
          this.defeated = true;
          if (this.model) this.model.visible = false;
          this.girlTime = 0;
          this.events.onDefeat?.();
        }
        break;
      }
      default:
        break;
    }
    if (this.state !== S.PARALYZED) this.paralyzed = 0;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.position.y = this.world.heightAt(this.position.x, this.position.z);

    // Solid body: the hero is pushed out of it (not while dying).
    if (onFoot && this.state !== S.DYING && this.state !== S.DEAD) {
      const min = this.radius + CONFIG.hero.radius;
      if (dist < min && dist > 1e-4) {
        hero.position.x = this.position.x + (dx / dist) * min;
        hero.position.z = this.position.z + (dz / dist) * min;
      }
    }

    if (this.girlTime >= 0) this.girlTime += dt;
    this.#pose(dt);
  }

  #set(state) {
    this.state = state;
    this.stateTime = 0;
    this.visited.add(state);
    if (this.warning && state !== S.SLAM_WINDUP) this.warning.visible = false;
    if (this.fireCone) this.fireCone.visible = state === S.FIRE_WINDUP || state === S.FIRE;
    if (state === S.SLAM && this.shock) {
      this.shock.position.copy(this.slamAt).setY(this.slamAt.y + 0.08);
      this.shock.visible = true;
    }
  }

  /** Fire breath points along (dx, dz) from just in front of the monster. */
  #aimFire(dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    this.fireDir.set(dx / l, dz / l);
    this.fireOrigin.set(this.position.x + this.fireDir.x * this.radius * 0.8, this.position.y, this.position.z + this.fireDir.y * this.radius * 0.8);
  }

  /** Is (x, z) inside the fire cone (the hero's body counts, not just its centre)? */
  inFireCone(x, z) {
    const vx = x - this.fireOrigin.x;
    const vz = z - this.fireOrigin.z;
    const d = Math.hypot(vx, vz);
    const pad = CONFIG.hero.radius;
    if (d > F.range + pad) return false;
    if (d < 0.5) return true;
    const cos = (vx * this.fireDir.x + vz * this.fireDir.y) / d;
    const angle = Math.acos(clamp(cos, -1, 1));
    return angle <= F.halfAngle + Math.atan(pad / d);
  }

  #startSlam() {
    this.#set(S.SLAM_WINDUP);
    this.slamAt.set(
      this.position.x + Math.sin(this.facing) * B.slam.reach,
      0,
      this.position.z + Math.cos(this.facing) * B.slam.reach,
    );
    this.slamAt.y = this.world.heightAt(this.slamAt.x, this.slamAt.z);
    if (this.warning) {
      this.warning.position.copy(this.slamAt).setY(this.slamAt.y + 0.07);
      this.warning.visible = true;
    }
  }

  #turnTo(dx, dz, dt) {
    const want = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    this.facing += clamp(diff, -B.turnRate * dt, B.turnRate * dt);
  }

  #facingWithin(dx, dz, angle) {
    const want = Math.atan2(dx, dz);
    return Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing))) < angle;
  }

  #move(mx, mz) {
    this.position.x += mx;
    this.position.z += mz;
    // Walking: slide around the arena boulders and stay inside.
    for (const r of this.world.arenaRocks ?? []) {
      const ddx = this.position.x - r.x;
      const ddz = this.position.z - r.z;
      const d = Math.hypot(ddx, ddz);
      const min = r.r + this.radius;
      if (d < min && d > 1e-4) {
        this.position.x = r.x + (ddx / d) * min;
        this.position.z = r.z + (ddz / d) * min;
      }
    }
    this.#keepInArena();
  }

  /** Clamp inside the arena; true if it had to. */
  #keepInArena() {
    const ddx = this.position.x - this.center.x;
    const ddz = this.position.z - this.center.z;
    const d = Math.hypot(ddx, ddz);
    const max = CV.radius - B.keepInside;
    if (d <= max) return false;
    this.position.x = this.center.x + (ddx / d) * max;
    this.position.z = this.center.z + (ddz / d) * max;
    return true;
  }

  /** Fire particles: spawned at the glowing mouth while breathing fire, flying along the cone. */
  #updateFlames(dt) {
    const mesh = this.fireMesh;
    if (!mesh) return;
    if (this.state === S.FIRE && dt > 0) {
      this.fireSpawn += F.rate * dt;
      const { mouth } = this.model.userData;
      const from = mouth.getWorldPosition(new THREE.Vector3());
      while (this.fireSpawn >= 1) {
        this.fireSpawn -= 1;
        let f = this.flames.find((p) => p.age >= p.life);
        if (!f) {
          if (this.flames.length >= F.particles) break;
          f = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size: 1, color: 0 };
          this.flames.push(f);
        }
        const a = Math.atan2(this.fireDir.x, this.fireDir.y) + (Math.random() - 0.5) * 2 * F.halfAngle * 0.8;
        const sp = F.speed * (0.8 + Math.random() * 0.4);
        f.pos.copy(from);
        // Down toward the ground so the flames wash over the cone.
        const drop = (from.y - this.position.y - 0.6) / (F.range / sp);
        f.vel.set(Math.sin(a) * sp, -drop * (0.7 + Math.random() * 0.5), Math.cos(a) * sp);
        f.age = 0;
        f.life = F.life * (0.75 + Math.random() * 0.5);
        f.size = lerp(F.size[0], F.size[1], Math.random());
        f.color = Math.floor(Math.random() * F.colors.length);
      }
    }
    const m = new THREE.Matrix4();
    const fade = mesh.geometry.attributes.instanceFade;
    const col = new THREE.Color();
    let n = 0;
    for (const f of this.flames) {
      if (f.age >= f.life) continue;
      f.age += dt;
      f.pos.addScaledVector(f.vel, dt);
      const ground = this.world.heightAt(f.pos.x, f.pos.z) + 0.3;
      if (f.pos.y < ground) {
        f.pos.y = ground;
        f.vel.y = 0;
      }
      const k = Math.min(1, f.age / f.life);
      const size = f.size * (0.5 + k * 1.6);
      m.makeScale(size, size, size).setPosition(f.pos);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, col.setHex(F.colors[Math.min(F.colors.length - 1, f.color + (k > 0.6 ? 1 : 0))]));
      fade.array[n++] = (1 - k) * 0.9;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    fade.needsUpdate = true;
  }

  /** Animation for the current state. */
  #pose(dt) {
    if (!this.model) return;
    const { body, head, jaw, mouth, arms, legs, mats } = this.model.userData;
    // Breathing the smoke in: the chest heaves, the jaw hangs open.
    const inhale = this.state !== S.PARALYZED && this.smokeExposure > 0 ? Math.min(1, this.smokeExposure / CONFIG.abilities.smokeBomb.exposure) : 0;
    const heave = 1 + CONFIG.abilities.smokeBomb.heave * inhale * (0.5 + 0.5 * Math.sin((this.clock ?? 0) * 13));
    body.scale.set(heave, 1 + (heave - 1) * 0.5, heave);
    const t = this.stateTime;
    const P = this.pace;
    const SL = B.slam;
    this.model.position.copy(this.position);
    this.model.rotation.set(0, this.facing, 0);
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    jaw.rotation.set(inhale * 0.35, 0, 0);
    for (const a of arms) {
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
    }
    for (const l of legs) {
      l.hip.rotation.set(0, 0, 0);
      l.knee.rotation.set(0, 0, 0);
    }
    let glow = 0;

    const walking = this.state === S.CHASE || this.state === S.CHARGE;
    if (walking) {
      const fast = this.state === S.CHARGE;
      this.phase += dt * (fast ? 9 : 4.5);
      legs.forEach((l, i) => {
        const ph = this.phase + i * Math.PI;
        l.hip.rotation.x = Math.sin(ph) * (fast ? 0.8 : 0.45);
        l.knee.rotation.x = Math.max(0, -Math.cos(ph)) * (fast ? 0.9 : 0.6);
      });
      body.position.y = Math.abs(Math.sin(this.phase)) * 0.12;
      arms.forEach((a, i) => (a.shoulder.rotation.x = -Math.sin(this.phase + i * Math.PI) * 0.35));
    }
    switch (this.state) {
      case S.GUARD:
      case S.RECOVER:
        body.position.y = Math.sin(this.stateTime * 2) * 0.06; // breathing
        arms.forEach((a, i) => (a.shoulder.rotation.z = (i ? -1 : 1) * 0.15));
        if (this.state === S.RECOVER) {
          body.rotation.x = 0.15; // panting, head low
          jaw.rotation.x = 0.15 + Math.sin(this.stateTime * 6) * 0.08;
        }
        break;
      case S.SLAM_WINDUP: {
        // Rears up on its legs, both fists high overhead, roaring.
        const p = Math.min(1, t / (SL.windup * P));
        body.position.y = 0.45 * p;
        body.rotation.x = -0.25 * p;
        head.rotation.x = -0.3 * p;
        jaw.rotation.x = 0.45 * p;
        arms.forEach((a, i) => {
          a.shoulder.rotation.set(-3.0 * p, 0, (i ? 1 : -1) * 0.15 * p);
          a.elbow.rotation.x = -0.45 * p;
        });
        this.warning.userData.fill.scale.setScalar(SL.radius * (0.2 + 0.8 * p));
        this.warning.userData.rim.scale.setScalar(SL.radius);
        this.warning.userData.fill.material.opacity = 0.2 + 0.3 * p;
        break;
      }
      case S.SLAM: {
        // Both fists smash down into the ground in front; it crouches into the blow.
        const p = Math.min(1, t / SL.smash);
        const e = p * p; // accelerating swing
        body.position.y = lerp(0.45, -SL.crouch, e);
        body.rotation.x = lerp(-0.25, 0.55, e);
        head.rotation.x = lerp(-0.3, 0.25, e);
        jaw.rotation.x = 0.45;
        arms.forEach((a, i) => {
          // Fists swing together and land side by side on the warning circle.
          a.shoulder.rotation.set(lerp(-3.0, SL.impactShoulder, e), 0, (i ? 1 : -1) * lerp(0.15, -SL.impactInward, e));
          a.elbow.rotation.x = lerp(-0.45, 0, e);
        });
        legs.forEach((l) => {
          l.hip.rotation.x = -0.45 * e;
          l.knee.rotation.x = 0.8 * e;
        });
        break;
      }
      case S.FIRE_WINDUP: {
        // Head thrown back, jaw opening, mouth glowing brighter; arms spread.
        const p = Math.min(1, t / (F.windup * P));
        body.rotation.x = -0.18 * p;
        head.rotation.x = -0.7 * p;
        jaw.rotation.x = 0.55 * p;
        arms.forEach((a, i) => a.shoulder.rotation.set(-0.4 * p, 0, (i ? -1 : 1) * 0.7 * p));
        glow = 0.3 + 0.7 * p * (0.8 + 0.2 * Math.sin(t * 30));
        this.fireCone.material.opacity = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 14));
        break;
      }
      case S.FIRE:
        // Head forward, jaw wide: breathing fire along the cone.
        body.rotation.x = 0.12;
        head.rotation.x = 0.2 + Math.sin(t * 9) * 0.04;
        jaw.rotation.x = 0.75;
        arms.forEach((a, i) => a.shoulder.rotation.set(-0.2, 0, (i ? -1 : 1) * 0.35));
        legs.forEach((l, i) => (l.hip.rotation.x = i ? 0.25 : -0.25)); // braced
        glow = 1;
        this.fireCone.material.opacity = 0.14;
        break;
      case S.CHARGE_WINDUP: {
        const p = Math.min(1, t / 0.3);
        body.rotation.x = 0.45 * p;
        head.rotation.x = 0.5 * p;
        legs[1].hip.rotation.x = Math.sin(t * 14) * 0.3; // pawing the ground
        break;
      }
      case S.CHARGE:
        body.rotation.x = 0.5;
        head.rotation.x = 0.5;
        break;
      case S.STUNNED:
        body.rotation.z = Math.sin(t * 6) * 0.12;
        body.rotation.x = -0.1;
        jaw.rotation.x = 0.3;
        break;
      case S.PARALYZED:
        body.rotation.z = Math.sin(this.paralyzed * 3) * 0.04;
        jaw.rotation.x = 0.2;
        break;
      case S.DYING: {
        const D = B.dying;
        jaw.rotation.x = 0.5;
        if (t < D.stumble) {
          body.rotation.z = Math.sin(t * 14) * 0.15;
          body.rotation.x = 0.2 * (t / D.stumble);
        } else {
          const p = Math.min(1, (t - D.stumble) / D.fall);
          body.rotation.x = 0.2 + p * (Math.PI / 2 - 0.2);
          legs.forEach((l) => (l.hip.rotation.x = -p * 0.8));
          const fade = clamp((t - D.stumble - D.fall) / D.fade, 0, 1);
          for (const m of mats) {
            m.transparent = fade > 0;
            m.opacity = 1 - fade;
          }
        }
        break;
      }
      default:
        break;
    }
    mouth.material.opacity = glow;
    mouth.scale.setScalar(0.6 + 0.6 * glow);
    mouth.visible = glow > 0.01;

    // Slam shockwave: expands and fades on the ground.
    if (this.shock.visible) {
      const p = this.state === S.SLAM ? Math.min(1, t / SL.shockTime) : 1;
      this.shock.scale.setScalar(0.5 + p * SL.radius * 1.1);
      this.shock.material.opacity = 0.8 * (1 - p);
      if (p >= 1) this.shock.visible = false;
    }
    if (this.fireCone.visible) {
      this.fireCone.position.copy(this.fireOrigin).setY(this.world.heightAt(this.fireOrigin.x, this.fireOrigin.z) + 0.06);
      this.fireCone.rotation.y = Math.atan2(this.fireDir.x, this.fireDir.y);
    }
    this.#updateFlames(dt);

    // Hit flash; paralyzed tint.
    for (const m of mats) {
      if (!m.emissive) continue;
      if (this.flash > 0) m.emissive.setScalar(0.85);
      else if (this.state === S.PARALYZED) m.emissive.setRGB(...CONFIG.abilities.smokeBomb.tint); // green from the powder
      else m.emissive.setScalar(0);
    }
    this.dizzy.visible = this.state === S.PARALYZED || this.state === S.STUNNED;
    this.dizzy.position.set(0, B.height + 0.4, 0.6);
    if (this.dizzy.visible) this.dizzy.rotation.y += dt * 4;

    // The girl steps out at the cave mouth after the victory (until she leaves with the hero).
    this.placeGirl();
  }
}
