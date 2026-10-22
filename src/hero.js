import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadMixamoHero } from './heroModel.js';

const H = CONFIG.hero;
const O = CONFIG.outfit;
const CB = CONFIG.combat;
const O_EX = CONFIG.desert.exhaustion;
const { clamp, lerp } = THREE.MathUtils;

/**
 * The hero model (origin at the feet, facing +Z): the Mixamo character AJ with its clips
 * (heroModel.js), or — if anything fails to load — the code-built placeholder below.
 * @param {{ readFile?, onProgress?, placeholder? }} [opts]  readFile(url) → ArrayBuffer (Node
 *   tests); onProgress(0..1) for the loading bar; placeholder: skip the download.
 */
export async function loadHeroModel(opts = {}) {
  if (!opts.placeholder) {
    try {
      return await loadMixamoHero(opts);
    } catch (e) {
      console.warn('Hero model failed to load; using the placeholder hero.', e);
    }
  }
  return buildPlaceholderHero();
}

/**
 * Placeholder hero, used only if the Mixamo hero fails to load (origin at the feet, facing
 * +Z): a human-proportioned rig of primitives — head, torso, jointed arms and legs, red pants,
 * brown high boots. With CONFIG.heroCostume it also wears the old costume: a dark eye mask, a
 * utility belt with pouches, a golden cloak (animated cloth plane) and a chained dagger on the
 * hip (a second one in the right hand while attacking). The animation drives the pivots in
 * `userData`.
 */
function buildPlaceholderHero() {
  const O = CONFIG.outfit;
  const costume = CONFIG.heroCostume;
  const mats = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    mats.push(m);
    return m;
  };
  const skin = mat(O.skin);
  const suit = mat(O.suit);
  const pants = mat(O.pants);
  const boots = mat(O.boots);
  const belt = mat(O.belt);
  const pouch = mat(O.pouch);
  const gold = mat(O.buckle);
  const mask = mat(O.mask);
  const hair = mat(O.hair);
  const blade = mat(O.blade);
  const chain = mat(O.chain);
  const mesh = (geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  };

  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  rig.add(pelvis);

  // Legs: red pants (thighs), brown leather high boots (shins + feet), hip and knee pivots.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0, 0);
    hip.add(mesh(new THREE.CylinderGeometry(0.085, 0.072, 0.46, 7).translate(0, -0.23, 0), pants));
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    knee.add(mesh(new THREE.CylinderGeometry(0.075, 0.064, 0.42, 7).translate(0, -0.21, 0), boots));
    knee.add(mesh(new THREE.CylinderGeometry(0.088, 0.085, 0.07, 7), boots, 0, -0.03, 0)); // boot cuff
    knee.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), boots, 0, -0.45, 0.05));
    hip.add(knee);
    pelvis.add(hip);
    legs.push({ hip, knee });
  }

  // Torso (rotates for punches); costume: utility belt with pouches and a gold buckle.
  const spine = new THREE.Group();
  pelvis.add(spine);
  spine.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.19), pants, 0, 0.03, 0));
  spine.add(mesh(new THREE.BoxGeometry(0.36, 0.42, 0.21), suit, 0, 0.33, 0));
  if (costume) {
    spine.add(mesh(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.3, 0.4), gold, 0, 0.38, 0.11)); // emblem
    spine.add(mesh(new THREE.BoxGeometry(0.38, 0.07, 0.23), belt, 0, 0.12, 0));
    spine.add(mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), gold, 0, 0.12, 0.12));
    for (const [x, z] of [[-0.14, 0.1], [0.14, 0.1], [-0.19, -0.02], [0, -0.12]]) {
      spine.add(mesh(new THREE.BoxGeometry(0.07, 0.08, 0.06), pouch, x, 0.1, z));
    }
  }

  // Head: skin, hair, eyes (costume: the dark mask over them, with white eye slits).
  spine.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6), skin, 0, 0.57, 0));
  const head = new THREE.Group();
  head.position.y = 0.7;
  head.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), skin));
  head.add(mesh(new THREE.SphereGeometry(0.146, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.01, -0.005));
  if (costume) {
    head.add(mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.065, 12, 1, true), mask, 0, 0.01, 0));
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const side of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(0.045, 0.018, 0.01), eyeWhite, side * 0.05, 0.012, 0.145));
  } else {
    const eye = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const side of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), eye, side * 0.05, 0.015, 0.13));
  }
  spine.add(head);

  // Arms: shoulder and elbow pivots, fists.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.5, 0);
    shoulder.add(mesh(new THREE.SphereGeometry(0.07, 7, 6), suit));
    shoulder.add(mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.3, 7).translate(0, -0.15, 0), suit));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.add(mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.26, 7).translate(0, -0.13, 0), suit));
    elbow.add(mesh(new THREE.SphereGeometry(0.062, 7, 6), skin, 0, -0.29, 0));
    shoulder.add(elbow);
    spine.add(shoulder);
    arms.push({ shoulder, elbow });
  }

  // Dagger with a chain wrapped around the handle: one on the right hip, one in the right hand
  // (shown while the combo is running — "drawn").
  const makeDagger = () => {
    const d = new THREE.Group();
    d.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), belt));
    for (let i = 0; i < 4; i++) {
      const link = mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 8), chain, 0, -0.045 + i * 0.03, 0);
      link.rotation.x = Math.PI / 2 + (i % 2) * 0.5;
      d.add(link);
    }
    d.add(mesh(new THREE.BoxGeometry(0.08, 0.018, 0.03), gold, 0, 0.065, 0));
    d.add(mesh(new THREE.BoxGeometry(0.035, 0.2, 0.012).translate(0, 0.17, 0), blade));
    return d;
  };
  let daggerHip = null;
  let daggerHand = null;
  let cloak = null;
  let cloakPivot = null;
  if (costume) {
    daggerHip = makeDagger();
    daggerHip.position.set(0.21, 0.04, 0.03);
    daggerHip.rotation.set(0, 0, Math.PI - 0.15); // blade down
    spine.add(daggerHip);
    daggerHand = makeDagger();
    daggerHand.position.set(0, -0.3, 0.02);
    daggerHand.rotation.set(Math.PI, 0, 0); // blade continues past the fist
    daggerHand.visible = false;
    arms[1].elbow.add(daggerHand);

    // Golden cloak: a segmented double-sided plane hanging from the shoulders (animated).
    const [cw, ch] = O.cloakSegments;
    const cloakGeo = new THREE.PlaneGeometry(0.44, 0.95, cw, ch).translate(0, -0.475, 0);
    cloak = new THREE.Mesh(cloakGeo, mat(O.cloak, { side: THREE.DoubleSide }));
    cloak.userData.rest = Float32Array.from(cloakGeo.attributes.position.array);
    cloakPivot = new THREE.Group();
    cloakPivot.position.set(0, 0.54, -0.12);
    cloakPivot.add(cloak);
    spine.add(cloakPivot);
  }

  // A small cup (the Lazarus Pit): held in the right fist, shown only while drinking.
  const cup = new THREE.Group();
  // (own materials: not in `mats`, so the Flash glow leaves them alone)
  cup.add(mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.09, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide })));
  cup.add(mesh(new THREE.CircleGeometry(0.05, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: CONFIG.desert.pit.activeColor }), 0, 0.02, 0));
  cup.position.set(0, -0.33, 0.04);
  cup.visible = false;
  arms[1].elbow.add(cup);

  const handLocal = new THREE.Vector3(0, -0.29, 0); // the right fist, in the elbow's frame
  rig.scale.multiplyScalar(CONFIG.heroModel.height / CONFIG.hero.height); // drawn as tall as AJ
  root.userData = { kind: 'placeholder', rig, pelvis, spine, head, legs, arms, cloak, cloakPivot, daggerHip, daggerHand, cup, mats, handLocal };
  return root;
}

function makeBlobShadow() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(H.shadowSize / 2, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: H.shadowOpacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export class Hero {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world  provides groundAt / collide / isHazard
   */
  /** @param {object} [modelOptions]  passed to loadHeroModel (readFile, onProgress, placeholder) */
  constructor(scene, world, modelOptions = {}) {
    this.scene = scene;
    this.world = world;
    this.modelOptions = modelOptions;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0; // yaw radians
    this.grounded = false;
    this.platform = null; // what we are standing on (null = terrain)
    this.coyote = 0;
    this.jumpBuffered = 0;
    this.lastSafe = new THREE.Vector3();
    this.onRespawn = null; // callback(position)
    this.onFall = null; // () => true if the fall was handled elsewhere (e.g. respawn on the horse)
    this.riding = false; // while true the horse drives position (see Horse)
    // Combat (see combat.js): the Combat system sets `attack`; dodge and hurt live here.
    this.attack = null; // { kind, step, t: 0..1 } while a combo hit plays
    this.daggerDrawn = false;
    this.moveScale = 1; // movement multiplier (slowed while attacking)
    this.dodgeT = 0; // seconds left in a dodge roll
    this.dodgeCooldown = 0;
    this.dodgeDir = new THREE.Vector2();
    this.iframes = 0; // invincible while > 0 (dodge or just hurt)
    this.hurtT = 0; // blink after being hurt
    this.hurtRed = 0; // red flash after being hurt
    this.riderFlinch = 0; // the jolt of a hit while mounted
    this.glow = 0; // 0..1 gold glow (Flash Mode)
    this.redFlicker = 0; // seconds of red flicker (paying hearts for Flash)
    this.throwAnim = null; // { kind: 'throw' | 'catch', t } (driven by Abilities)
    this.exhaustion = 0; // 0..1: slumped in the saddle, breathing heavily (desert, on 1 heart)
    this.drink = null; // { t } scoop from the pit with a cup and sip (Lazarus Pit scene)
    this.facePitch = 0; // scripted: look up / down (radians)
    this.hitT = 0; // seconds left of the hit reaction (taking damage)
    this.deathT = -1; // seconds into the death fall (≥ 0 after the last heart is lost)
    this.appliedSlump = 0; // how far the exhaustion slump bends the spine this frame (radians)
    this.phase = 0; // walk cycle
    this.time = 0;
    this.moveSpeed = 0; // measured horizontal speed (smoothed; riding included): run speed, cloak
    this.prevPos = new THREE.Vector3();
  }

  /** Invincible: mid-dodge or just hurt. */
  get invincible() {
    return this.iframes > 0 || !!this.superArmor; // (dodge / after a hit, or Flash's super-armor)
  }

  async init() {
    this.model = await loadHeroModel(this.modelOptions);
    this.shadow = makeBlobShadow();
    this.scene.add(this.model, this.shadow);
    this.reset();
  }

  /** Back to the start of the level (first rooftop). */
  reset() {
    this.riding = false;
    this.shadow.visible = true;
    this.attack = null;
    this.throwAnim = null;
    this.dodgeT = this.dodgeCooldown = this.iframes = this.hurtT = this.glow = this.redFlicker = this.hitT = 0;
    this.exhaustion = this.facePitch = 0;
    this.deathT = -1;
    this.drink = null;
    const first = this.world.boxes[0];
    this.lastSafe.copy(first.safe);
    this.facing = Math.PI / 2; // face along the route (+X)
    this.#placeAt(this.lastSafe);
  }

  // --- Riding (the Horse drives these) ---

  startRiding() {
    this.riding = true;
    this.deathT = -1;
    this.velocity.set(0, 0, 0);
    this.platform = null;
    this.shadow.visible = false;
    this.attack = null;
    this.dodgeT = 0;
  }

  /** Places the rider (feet at `p`, facing `yaw`); also used during mount transitions. */
  setRidingPose(p, yaw, lean = 0) {
    this.position.copy(p);
    this.facing = yaw;
    this.model.position.copy(p);
    // Leans into the horse's turns; a hit jolts him back a little (seated).
    const F = CB.riderFlinch;
    const jolt = this.riderFlinch > 0 ? -F.pitch * Math.sin((this.riderFlinch / F.time) * Math.PI) : 0;
    this.model.rotation.set(jolt, yaw, lean, 'YXZ');
    this.#animate(this.lastDt ?? 0);
  }

  /** Back on foot at `p` (end of a dismount). */
  stopRiding(p, yaw) {
    this.riding = false;
    this.shadow.visible = true;
    this.model.rotation.set(0, yaw, 0);
    this.facing = yaw;
    this.lastSafe.copy(p);
    this.#placeAt(p);
  }

  /**
   * Dodge roll in the given world direction (x, z), or backward if none. Invincible for
   * CONFIG.combat.dodge.invincible; returns false while on cooldown or riding.
   */
  dodge(dirX = 0, dirZ = 0) {
    const D = CB.dodge;
    if (this.riding || this.dodgeCooldown > 0 || this.dodgeT > 0) return false;
    let len = Math.hypot(dirX, dirZ);
    if (len < 0.05) {
      dirX = -Math.sin(this.facing);
      dirZ = -Math.cos(this.facing);
      len = 1;
    }
    dirX /= len;
    dirZ /= len;
    // Against a rock or wall: never roll into it, and get a short push away from it.
    const K = CONFIG.corner.dodge;
    const walls = this.world.solidsNear?.(this.position, H.radius, K.wallReach, H.height) ?? [];
    this.dodgePush = null;
    if (walls.length) {
      let ax = 0;
      let az = 0;
      for (const w of walls) {
        const into = dirX * w.nx + dirZ * w.nz;
        if (into < 0) {
          dirX -= w.nx * into;
          dirZ -= w.nz * into;
        }
        ax += w.nx;
        az += w.nz;
      }
      const al = Math.hypot(ax, az) || 1;
      dirX += (ax / al) * K.wallPush;
      dirZ += (az / al) * K.wallPush;
      const l = Math.hypot(dirX, dirZ) || 1;
      dirX /= l;
      dirZ /= l;
      this.dodgePush = { x: ax / al, z: az / al, t: K.pushTime };
    }
    this.dodgeDir.set(dirX, dirZ);
    this.dodgeT = D.duration;
    this.dodgeCooldown = D.cooldown;
    this.iframes = Math.max(this.iframes, D.invincible);
    this.attack = null;
    return true;
  }

  /**
   * Knocked back after taking damage (Lives decides the hearts). No knockback for e.g. fire;
   * `invincible` false (fire ticks): no post-hit invincibility.
   */
  hurt(fromX, fromZ, knockback = true, invincible = true) {
    if (invincible) this.iframes = Math.max(this.iframes, CB.hurtInvincible);
    this.hurtT = CB.hurtInvincible;
    this.hurtRed = CB.hurtRed.time;
    if (this.riding) {
      // Mounted: a small jolt, staying seated — no hit clip, no knockback, no position change.
      this.riderFlinch = CB.riderFlinch.time;
      return;
    }
    this.hitT = CONFIG.heroModel.clips.hit.time; // hit reaction (Mixamo model)
    if (!knockback) return;
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.velocity.x = (dx / d) * CB.hurtKnockback;
    this.velocity.z = (dz / d) * CB.hurtKnockback;
    this.velocity.y = Math.max(this.velocity.y, 3);
    this.grounded = false;
  }

  /**
   * Scripted on foot (cutscenes): stand at `p` facing `yaw`; the walk cycle plays from the
   * measured speed, so moving `p` a little each frame walks.
   */
  puppet(p, yaw, dt) {
    this.riding = false;
    this.grounded = true;
    this.velocity.set(0, 0, 0);
    this.shadow.visible = true;
    this.position.copy(p);
    this.facing = yaw;
    this.lastDt = dt;
    if (this.drink) this.drink.t += dt;
    this.#sync();
  }

  /** Out of hearts: the death fall plays (until the respawn puts him back on the horse). */
  die() {
    if (this.deathT < 0) this.deathT = 0;
    this.hurtT = this.riderFlinch = 0; // (no blink on the way down)
    this.attack = null;
    this.throwAnim = null;
    this.dodgeT = 0;
  }

  /** The Lazarus Pit cup is in his hand. */
  get cupVisible() {
    return !!this.model.userData.cup?.visible;
  }

  /** World position of the right hand (where thrown items leave and are caught), or the left. */
  handPosition(out = new THREE.Vector3(), left = false) {
    const u = this.model.userData;
    const handBone = left ? u.bones?.leftHand ?? u.arms?.[0].elbow : u.bones?.rightHand ?? u.arms?.[1].elbow;
    if (!handBone) return out.set(this.position.x, this.position.y + 1.2, this.position.z);
    this.model.updateMatrixWorld(true);
    const local = left && u.kind !== 'placeholder' ? null : u.handLocal; // (the placeholder's arms end at the elbow)
    if (local) out.copy(local).applyMatrix4(handBone.matrixWorld);
    else out.setFromMatrixPosition(handBone.matrixWorld);
    // If the model lags the physics position this frame, carry the hand along with the body.
    out.x += this.position.x - this.model.position.x;
    out.y += this.position.y - this.model.position.y;
    out.z += this.position.z - this.model.position.z;
    return out;
  }

  /** World-space point in front of the hero (for hits and throws). */
  forward(dist = 1) {
    return new THREE.Vector3(this.position.x + Math.sin(this.facing) * dist, this.position.y, this.position.z + Math.cos(this.facing) * dist);
  }

  #fall() {
    if (this.onFall?.()) return;
    this.respawn();
  }

  /** Back to the last safe platform after a fall. */
  respawn() {
    this.deathT = -1;
    this.resetStatus();
    this.#placeAt(this.lastSafe);
    this.onRespawn?.(this.position);
  }

  /**
   * @param {number} dt
   * @param {{moveX:number, moveY:number, jumpPressed:boolean}} input  moveY>0 = forward
   * @param {number} cameraYaw
   */
  update(dt, input, cameraYaw) {
    this.lastDt = dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    // (invincibility, blink, red flash and flinch tick in #animate: on foot and riding alike)
    // Camera-relative desired velocity on XZ.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // Forward is away from the camera: camera sits at +sin/+cos of yaw relative to hero.
    const dirX = -sin * input.moveY + cos * input.moveX;
    const dirZ = -cos * input.moveY - sin * input.moveX;
    const mag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    if (input.dodgePressed) this.dodge(dirX * mag, dirZ * mag);

    const speed = H.walkSpeed * (this.grounded ? 1 : H.airSpeedBoost) * this.moveScale;
    const accel = H.acceleration * (this.grounded ? 1 : H.airControl);
    const k = 1 - Math.exp((-accel * dt) / H.walkSpeed);
    if (this.dodgeT > 0) {
      // Rolling: fixed speed in the dodge direction.
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      const v = CB.dodge.distance / CB.dodge.duration;
      this.velocity.x = this.dodgeDir.x * v;
      this.velocity.z = this.dodgeDir.y * v;
      const P = this.dodgePush;
      if (P && P.t > 0) {
        // (a short push away from the rock / wall it started against)
        P.t -= dt;
        this.velocity.x += P.x * CONFIG.corner.dodge.pushSpeed;
        this.velocity.z += P.z * CONFIG.corner.dodge.pushSpeed;
      }
    } else if (this.hurtT > CB.hurtInvincible - 0.25 && !this.grounded) {
      // Knocked back: keep the knockback for a moment.
    } else {
      this.velocity.x += (dirX * speed - this.velocity.x) * k;
      this.velocity.z += (dirZ * speed - this.velocity.z) * k;
    }

    if (this.dodgeT > 0) this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.y);
    else if (mag > 0.05 && !this.attack) {
      const targetYaw = Math.atan2(dirX, dirZ);
      let diff = targetYaw - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, H.turnSpeed * dt);
    }

    // Jump assist: coyote time + input buffering.
    if (input.jumpPressed) this.jumpBuffered = H.jumpBuffer;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyote = this.grounded ? H.coyoteTime : Math.max(0, this.coyote - dt);

    if (this.jumpBuffered > 0 && this.coyote > 0) {
      this.velocity.y = H.jumpVelocity;
      this.velocity.x *= H.airSpeedBoost;
      this.velocity.z *= H.airSpeedBoost;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffered = 0;
    }

    this.velocity.y = Math.max(this.velocity.y - H.gravity * dt, -H.maxFallSpeed);
    this.position.addScaledVector(this.velocity, dt);

    // Keep inside the map.
    this.position.x = THREE.MathUtils.clamp(this.position.x, CONFIG.world.xMin + 1, CONFIG.world.xMax - 1);
    this.position.z = THREE.MathUtils.clamp(this.position.z, CONFIG.world.zMin + 1, CONFIG.world.zMax - 1);

    // Ground: walking steps up small ledges; falling also snaps onto ledges just above the feet.
    const falling = this.velocity.y <= 0;
    const reach = falling ? (this.grounded ? H.stepUp : H.ledgeAssist) : 0;
    const ground = this.world.groundAt(this.position.x, this.position.z, this.position.y + reach, H.edgeGrace);
    const gap = this.position.y - ground.y;
    if (falling && (gap <= 0 || (this.grounded && gap < H.stepUp))) {
      // Landed, or stuck to a slope/step while walking.
      this.position.y = ground.y;
      this.velocity.y = 0;
      this.grounded = true;
      this.platform = ground.platform;
    } else {
      this.grounded = false;
    }

    this.world.collide(this.position, this.velocity, H.radius, H.height, H.stepUp);

    if (this.grounded) {
      if (this.platform?.safe) this.lastSafe.copy(this.platform.safe);
      else if (!this.platform && this.world.isHazard(this.position.x, this.position.z)) return this.#fall();
      else if (!this.platform) this.lastSafe.copy(this.position);
    }
    if (this.position.y < CONFIG.world.killY) return this.#fall();

    this.#sync();
  }

  #placeAt(p) {
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.platform = null;
    this.coyote = 0;
    this.jumpBuffered = 0;
    this.#sync();
  }

  #sync() {
    this.model.position.copy(this.position);
    this.model.rotation.set(0, this.facing, 0);
    this.#animate(this.lastDt ?? 0);
    const g = this.world.groundAt(this.position.x, this.position.z, this.position.y + 0.05).y;
    this.shadow.position.set(this.position.x, g + 0.03, this.position.z);
    const lift = Math.max(0, this.position.y - g);
    this.shadow.scale.setScalar(1 / (1 + lift * 0.25));
  }

  /** Pose the hero (Mixamo clips or the placeholder rig), then the costume extras and the glow. */
  #animate(dt) {
    const u = this.model.userData;
    this.time += dt;
    // Measured speed (works while the horse carries us too) drives the run and the cloak.
    if (dt > 0) {
      const v = Math.hypot(this.position.x - this.prevPos.x, this.position.z - this.prevPos.z) / dt;
      this.moveSpeed += (Math.min(v, 40) - this.moveSpeed) * (1 - Math.exp(-8 * dt));
    }
    this.prevPos.copy(this.position);
    this.hitT = Math.max(0, this.hitT - dt);
    // Status timers tick here, every frame, mounted or not (main skips hero.update while riding).
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hurtRed = Math.max(0, (this.hurtRed ?? 0) - dt);
    this.riderFlinch = Math.max(0, (this.riderFlinch ?? 0) - dt);
    if (this.deathT >= 0) this.deathT += dt;
    if (u.animator) {
      u.animator.update(dt, this);
      this.appliedSlump = u.animator.slump;
    } else if (u.rig) this.#posePlaceholder(dt, u);
    else return;
    const { cloak, cloakPivot, daggerHip, daggerHand, mats } = u;
    const th = this.throwAnim;
    u.cup.visible = !!this.drink;
    // Costume only (CONFIG.heroCostume): the drawn dagger and the cloak's cloth animation.
    if (daggerHand) {
      daggerHand.visible = this.daggerDrawn && !this.riding && !th;
      daggerHip.visible = !daggerHand.visible;
    }
    if (cloak) this.#flutterCloak(dt, cloak, cloakPivot);
    this.#glow(dt, mats);
  }

  /** The cloak swings back and ripples more the faster we move. */
  #flutterCloak(dt, cloak, cloakPivot) {
    const flow = clamp(this.moveSpeed / (CONFIG.horse.maxSpeed * 0.8), 0, 1);
    cloakPivot.rotation.x = 0.1 + O.cloakLift * flow + (this.grounded || this.riding ? 0 : 0.35);
    const pos = cloak.geometry.attributes.position;
    const rest = cloak.userData.rest;
    const amp = 0.02 + O.cloakFlutter * flow;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1]; // 0 at the shoulders … -1.05 at the hem
      pos.setZ(i, rest[i * 3 + 2] + Math.sin(this.time * (5 + 7 * flow) + y * 5 + x * 4) * amp * -y);
    }
    pos.needsUpdate = true;
  }

  /**
   * Flash Mode glow, the red flicker when paying hearts for it, the red flash of a hit, and the
   * hurt blink — a soft opacity pulse while invincible. The model is never hidden, and every
   * effect returns to normal on its own (or at once with resetStatus).
   */
  #glow(dt, mats) {
    this.redFlicker = Math.max(0, this.redFlicker - dt);
    const flicker = this.redFlicker > 0 && Math.sin(this.redFlicker * 40) > 0;
    const hitRed = this.hurtRed > 0 ? this.hurtRed / CB.hurtRed.time : 0;
    const g = this.glow;
    // (cameraOpacity: the camera squeezed in right behind him by a rock — see FollowCamera.heroOpacity)
    const camFade = Math.min(1, this.cameraOpacity ?? 1);
    const blinking = (this.hurtT > 0 && this.deathT < 0) || camFade < 1;
    const opacity = (this.hurtT > 0 && this.deathT < 0 ? 1 - CB.hurtBlink.depth * (0.5 - 0.5 * Math.cos(this.hurtT * CB.hurtBlink.rate * Math.PI * 2)) : 1) * camFade;
    for (const m of mats) {
      const red = flicker || hitRed > 0;
      m.emissive.setHex(red ? CB.hurtRed.color : CONFIG.abilities.flashMode.glowColor);
      m.emissiveIntensity = flicker ? 0.9 : hitRed > 0 ? CB.hurtRed.intensity * hitRed : g * 0.8;
      if (m.transparent !== blinking) {
        m.transparent = blinking;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
    }
    this.model.visible = true;
  }

  /** Invincibility, blink, red flashes and flinch back to normal at once (a death, a respawn). */
  resetStatus() {
    this.iframes = this.hurtT = this.hurtRed = this.riderFlinch = this.hitT = this.redFlicker = 0;
    this.model.visible = true;
    for (const m of this.model.userData.mats ?? []) {
      m.opacity = 1;
      if (m.transparent) {
        m.transparent = false;
        m.needsUpdate = true;
      }
      m.emissiveIntensity = 0;
    }
  }

  /** The placeholder rig: walk/run cycle, jump tuck, combo, roll, riding, throw, drink. */
  #posePlaceholder(dt, u) {
    const run = clamp(this.moveSpeed / H.walkSpeed, 0, 1.5);
    const { rig, spine, head, legs, arms } = u;
    // Reset to neutral, then layer poses.
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    spine.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    for (const l of legs) {
      l.hip.rotation.set(0, 0, 0);
      l.knee.rotation.set(0, 0, 0);
    }
    for (const a of arms) {
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
    }

    if (this.riding) {
      // Seated: thighs forward and apart, shins down, hands on the reins.
      rig.position.y = -O.ridingDrop;
      legs.forEach((l, i) => {
        l.hip.rotation.set(-1.35, 0, (i ? -1 : 1) * 0.42);
        l.knee.rotation.x = 1.45;
      });
      arms.forEach((a) => {
        a.shoulder.rotation.x = -0.75;
        a.elbow.rotation.x = -0.7;
      });
      spine.rotation.x = 0.12 * clamp(run / 2.5, 0, 1);
    } else if (this.drink) {
      // Kneel, scoop from the pit with the cup, then raise it and sip.
      const DR = CONFIG.desert.pit.drink;
      const t = this.drink.t;
      const scoop = Math.min(1, t / DR.scoop);
      const sip = clamp((t - DR.scoop) / DR.raise, 0, 1);
      const bend = Math.sin(scoop * Math.PI) * (1 - sip);
      rig.position.y = -0.35 * (1 - sip * 0.6);
      legs.forEach((l, i) => {
        l.hip.rotation.x = i ? -1.4 : -0.3;
        l.knee.rotation.x = i ? 1.5 : 1.9;
      });
      spine.rotation.x = 0.7 * bend + 0.1;
      const a = arms[1];
      a.shoulder.rotation.set(lerp(-1.1 * scoop, -1.45, sip), 0, lerp(0, 0.35, sip));
      a.elbow.rotation.x = lerp(-0.2, -2.0, sip);
      head.rotation.x = -0.35 * sip;
    } else if (this.dodgeT > 0) {
      // Roll: tuck and spin forward once over the dodge.
      const p = 1 - this.dodgeT / CB.dodge.duration;
      rig.position.y = 0.45;
      rig.rotation.x = p * Math.PI * 2;
      rig.position.y -= 0.45 * Math.cos(p * Math.PI * 2);
      legs.forEach((l) => {
        l.hip.rotation.x = -1.6;
        l.knee.rotation.x = 2.2;
      });
      arms.forEach((a) => (a.shoulder.rotation.x = -1.2));
    } else if (!this.grounded) {
      legs.forEach((l, i) => {
        l.hip.rotation.x = i ? -0.7 : 0.2;
        l.knee.rotation.x = i ? 1.1 : 0.5;
      });
      arms.forEach((a, i) => (a.shoulder.rotation.set(-0.5, 0, (i ? -1 : 1) * 0.5)));
    } else {
      // Walk / run cycle.
      this.phase += dt * O.walkCycle * Math.PI * 2 * Math.min(run, 1.2);
      const sw = Math.min(run, 1);
      legs.forEach((l, i) => {
        const ph = this.phase + i * Math.PI;
        l.hip.rotation.x = Math.sin(ph) * O.legSwing * sw;
        l.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 1.0 * sw;
      });
      arms.forEach((a, i) => {
        a.shoulder.rotation.x = -Math.sin(this.phase + i * Math.PI) * O.armSwing * sw;
        a.elbow.rotation.x = -0.3 * sw;
      });
    }

    // Exhaustion: slumped forward, head low, heavy breathing (a slow bob of the shoulders).
    const ex = this.exhaustion;
    if (ex > 0) {
      const breath = Math.sin(this.time * Math.PI * 2 * O_EX.breathe);
      spine.rotation.x += O_EX.slump * ex + breath * 0.05 * ex;
      head.rotation.x = 0.35 * ex;
      rig.position.y += breath * O_EX.breatheBob * ex;
      arms.forEach((a) => (a.shoulder.rotation.x += 0.35 * ex));
    }
    head.rotation.x += this.facePitch;
    this.appliedSlump = spine.rotation.x;

    // Combo: punches alternate arms (right first), the third hit is a heavy kick.
    const atk = this.attack;
    if (atk && !this.riding) {
      const p = Math.sin(Math.min(1, atk.t * 1.6) * Math.PI); // out and back
      if (atk.kind === 'kick') {
        const l = legs[1];
        l.hip.rotation.x = -1.5 * p;
        l.knee.rotation.x = 0.4 * (1 - p);
        legs[0].knee.rotation.x = 0.3 * p;
        spine.rotation.x = 0.25 * p;
        arms.forEach((a, i) => a.shoulder.rotation.set(-0.4 * p, 0, (i ? -1 : 1) * 0.9 * p));
      } else {
        const right = atk.step % 2 === 0;
        const a = arms[right ? 1 : 0];
        a.shoulder.rotation.x = -Math.PI / 2 * p - 0.2;
        a.elbow.rotation.x = -0.9 * (1 - p);
        const other = arms[right ? 0 : 1];
        other.shoulder.rotation.x = -0.9;
        other.elbow.rotation.x = -1.8;
        spine.rotation.y = (right ? -1 : 1) * 0.45 * p;
      }
    }
    // Throw: wind the right arm back, swing it over and forward (release), follow through.
    // Catch: the right arm reaches up and forward and gives a little.
    const th = this.throwAnim;
    if (th) {
      const TH = CONFIG.abilities.throw;
      const a = arms[1];
      if (th.kind === 'throw') {
        const t = th.t;
        if (t < TH.windup) {
          const p = t / TH.windup;
          a.shoulder.rotation.set(1.1 * p, 0, -0.35 * p);
          a.elbow.rotation.x = -1.3 * p;
          spine.rotation.y = 0.45 * p;
        } else if (t < TH.release) {
          const p = (t - TH.windup) / (TH.release - TH.windup);
          a.shoulder.rotation.set(lerp(1.1, -1.75, p), 0, lerp(-0.35, 0, p));
          a.elbow.rotation.x = lerp(-1.3, -0.15, p);
          spine.rotation.y = lerp(0.45, -0.35, p);
        } else {
          const p = Math.min(1, (t - TH.release) / (TH.duration - TH.release));
          a.shoulder.rotation.set(lerp(-1.75, -0.9, p), 0, 0);
          a.elbow.rotation.x = lerp(-0.15, -0.5, p);
          spine.rotation.y = lerp(-0.35, 0, p);
        }
      } else {
        const p = Math.min(1, th.t / TH.catchTime);
        const give = Math.sin(p * Math.PI) * 0.35;
        a.shoulder.rotation.set(-2.1 + give, 0, -0.25);
        a.elbow.rotation.x = -0.5 - give;
      }
    }
  }
}
