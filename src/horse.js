import * as THREE from 'three';
import { CONFIG } from './config.js';
import { pathZ, pathSlope, makeFadeMaterial, addFadeAttribute } from './world.js';

const HC = CONFIG.horse;
const CP = CONFIG.checkpoints;
const DUST = HC.dust;
const { clamp, lerp } = THREE.MathUtils;

// ---------------------------------------------------------------------------
// Swappable placeholder models
// ---------------------------------------------------------------------------

/**
 * Placeholder horse (origin at the hooves, facing +Z). Parts the animation needs are in
 * `userData`: `body` (bobs), `legs` (4 hip pivots, front-left/right then back-left/right),
 * `neck` (head pivot), `tail`, `seat` (rider's feet position, local).
 */
export async function loadHorseModel() {
  const coat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e1d10, flatShading: true });
  const light = new THREE.MeshLambertMaterial({ color: 0xe9dcc7, flatShading: true });
  const leather = new THREE.MeshLambertMaterial({ color: 0x5a2d1a, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Barrel (body), chest and rump.
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.3, 4, 10).rotateX(Math.PI / 2), coat);
  barrel.position.set(0, 1.5, 0);
  barrel.scale.set(0.95, 1, 1);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), coat);
  chest.position.set(0, 1.55, 0.75);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), coat);
  rump.position.set(0, 1.58, -0.75);
  body.add(barrel, chest, rump);

  // Neck and head on a pivot at the withers, so the head can dip while grazing.
  const neck = new THREE.Group();
  neck.position.set(0, 1.85, 0.85);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.1, 8), coat);
  neckMesh.position.set(0, 0.42, 0.25);
  neckMesh.rotation.x = 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.78), coat);
  head.position.set(0, 0.86, 0.62);
  head.rotation.x = 0.35;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), dark);
  muzzle.position.set(0, 0.72, 0.98);
  muzzle.rotation.x = 0.35;
  const blaze = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.5), light);
  blaze.position.set(0, 1.04, 0.66);
  blaze.rotation.x = 0.35;
  const earGeo = new THREE.ConeGeometry(0.07, 0.22, 4);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, coat);
    ear.position.set(side * 0.12, 1.12, 0.36);
    neck.add(ear);
  }
  // Mane: a row of dark tufts along the top of the neck.
  for (let i = 0; i < 6; i++) {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.2), dark);
    tuft.position.set(0, 0.22 + i * 0.15, 0.02 + i * 0.1);
    tuft.rotation.x = 0.62;
    neck.add(tuft);
  }
  neck.add(neckMesh, head, muzzle, blaze);
  body.add(neck);

  // Tail on a pivot at the croup.
  const tail = new THREE.Group();
  tail.position.set(0, 1.75, -1.25);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 6).translate(0, -0.5, 0), dark);
  tailMesh.rotation.x = 0.35;
  tail.add(tailMesh);
  body.add(tail);

  // Saddle.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.75), leather);
  saddle.position.set(0, 1.98, -0.05);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.9), new THREE.MeshLambertMaterial({ color: 0xd62828 }));
  blanket.position.set(0, 1.93, -0.05);
  body.add(blanket, saddle);

  // Legs on hip pivots: upper leg, lower leg, hoof.
  const legs = [];
  const upperGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.62, 6).translate(0, -0.31, 0);
  const lowerGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.6, 6).translate(0, -0.3, 0);
  const hoofGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.12, 6).translate(0, -0.06, 0);
  for (const [x, z] of [[-0.28, 0.75], [0.28, 0.75], [-0.28, -0.78], [0.28, -0.78]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 1.3, z);
    const upper = new THREE.Mesh(upperGeo, coat);
    const knee = new THREE.Group();
    knee.position.y = -0.62;
    const lower = new THREE.Mesh(lowerGeo, coat);
    const hoof = new THREE.Mesh(hoofGeo, dark);
    hoof.position.y = -0.6;
    knee.add(lower, hoof);
    hip.add(upper, knee);
    hip.userData.knee = knee;
    root.add(hip);
    legs.push(hip);
  }

  root.userData = { body, legs, neck, tail, seat: new THREE.Vector3(0, 1.98 + 0.07, -0.05) };
  return root;
}

/** Placeholder dust puffs: an instanced pool with per-puff opacity. */
export async function loadDustModel(max) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  addFadeAttribute(geo, max);
  const mesh = new THREE.InstancedMesh(geo, makeFadeMaterial({ color: DUST.color, flatShading: true, depthWrite: false }), max);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

/** Placeholder checkpoint marker: a pole with a pennant (flag colour shows reached/not). */
export async function loadCheckpointModel() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, CP.poleHeight, 6).translate(0, CP.poleHeight / 2, 0),
    new THREE.MeshLambertMaterial({ color: 0xdedede }),
  );
  const flagGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, CP.poleHeight, 0),
    new THREE.Vector3(0, CP.poleHeight - 0.7, 0),
    new THREE.Vector3(0, CP.poleHeight - 0.35, 1.0),
  ]);
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: CP.flagColor, side: THREE.DoubleSide }));
  group.add(pole, flag);
  group.userData.flag = flag;
  return group;
}

// ---------------------------------------------------------------------------
// Horse + ride
// ---------------------------------------------------------------------------

const MODES = { IDLE: 'idle', MOUNTING: 'mounting', RIDING: 'riding', DISMOUNTING: 'dismounting' };

/**
 * The horse: waits (grazing) until mounted, then carries the hero. While mounted the
 * joystick steers (camera-relative), speed builds smoothly to HC.maxSpeed and turns are
 * gradual. Owns the ride checkpoints: after the first mount, any fall respawns the hero on
 * the horse at the last checkpoint reached.
 */
export class Horse {
  /** @param {THREE.Scene} scene @param {import('./world.js').World} world */
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = HC.facing;
    this.speed = 0;
    this.grounded = true;
    this.mode = MODES.IDLE;
    this.t = 0; // transition progress
    this.phase = 0; // gallop cycle
    this.time = 0;
    this.everMounted = false;
    this.lastCheckpoint = 0;
    this.onRespawn = null; // (position) => void
    this.onCheckpoint = null; // (index) => void
    this.#from = new THREE.Vector3();
    this.#to = new THREE.Vector3();
    this.#seat = new THREE.Vector3();
    this.checkpoints = CP.xs.map((x, i) => {
      const [hx, hz] = HC.position;
      const z = i === 0 ? hz : pathZ(x);
      const px = i === 0 ? hx : x;
      return { position: new THREE.Vector3(px, world.heightAt(px, z), z), reached: i === 0 };
    });
    this.dust = [];
  }

  #from;
  #to;
  #seat;

  get mounted() {
    return this.mode === MODES.RIDING || this.mode === MODES.MOUNTING;
  }

  /** True while the horse (not the hero's own physics) controls the hero. */
  get controlsHero() {
    return this.mode !== MODES.IDLE;
  }

  get speedRatio() {
    return this.speed / HC.maxSpeed;
  }

  async init() {
    this.model = await loadHorseModel();
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(HC.shadowSize / 2, 16).scale(0.6, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.dustMesh = await loadDustModel(DUST.max);
    this.scene.add(this.model, this.shadow, this.dustMesh);
    this.markers = [];
    for (const cp of this.checkpoints.slice(1)) {
      const marker = await loadCheckpointModel();
      marker.position.copy(cp.position).add(new THREE.Vector3(0, 0, CONFIG.world.pathHalfWidth - 0.8));
      this.scene.add(marker);
      this.markers.push(marker);
    }
    this.reset();
  }

  /** New game: horse back by the river, nothing reached, nobody on it. */
  reset() {
    const [x, z] = HC.position;
    this.position.set(x, this.world.heightAt(x, z), z);
    this.heading = HC.facing;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.mode = MODES.IDLE;
    this.everMounted = false;
    this.lastCheckpoint = 0;
    this.checkpoints.forEach((cp, i) => (cp.reached = i === 0));
    this.markers?.forEach((m) => m.userData.flag.material.color.setHex(CP.flagColor));
    for (const d of this.dust) d.age = d.life;
    this.#syncModel(0);
  }

  /** Distance check for the Mount button. */
  canMount(hero) {
    return (
      this.mode === MODES.IDLE &&
      hero.grounded &&
      Math.hypot(hero.position.x - this.position.x, hero.position.z - this.position.z) < HC.mountRange
    );
  }

  /** Mount / dismount (button or E). */
  toggle(hero) {
    if (this.canMount(hero)) {
      this.mode = MODES.MOUNTING;
      this.t = 0;
      this.everMounted = true;
      this.#from.copy(hero.position);
      hero.startRiding();
    } else if (this.mode === MODES.RIDING && this.grounded) {
      this.mode = MODES.DISMOUNTING;
      this.t = 0;
      this.speed = 0;
      this.#from.copy(hero.position);
      // Land beside the horse (its left), on the ground there.
      const lx = this.position.x + Math.cos(this.heading) * HC.dismountSide;
      const lz = this.position.z - Math.sin(this.heading) * HC.dismountSide;
      this.#to.set(lx, this.world.groundAt(lx, lz, this.position.y + 2).y, lz);
    }
  }

  /**
   * @param {number} dt
   * @param {object|null} input  null when not playing (idle animation only)
   * @param {number} cameraYaw
   * @param {import('./hero.js').Hero} hero
   */
  update(dt, input, cameraYaw, hero) {
    this.time += dt;
    if (input && this.mode === MODES.RIDING) this.#ride(dt, input, cameraYaw, hero);
    else if (this.mode !== MODES.RIDING) this.speed = Math.max(0, this.speed - HC.braking * dt);

    const seat = this.#syncModel(dt);
    if (this.mode === MODES.MOUNTING || this.mode === MODES.DISMOUNTING) {
      this.t = Math.min(1, this.t + dt / HC.mountTime);
      const to = this.mode === MODES.MOUNTING ? seat : this.#to;
      const p = this.#from.clone().lerp(to, this.t);
      p.y += Math.sin(Math.PI * this.t) * HC.mountArc;
      hero.setRidingPose(p, this.heading);
      if (this.t >= 1) {
        if (this.mode === MODES.MOUNTING) this.mode = MODES.RIDING;
        else {
          this.mode = MODES.IDLE;
          hero.stopRiding(this.#to, this.heading);
        }
      }
    } else if (this.mode === MODES.RIDING) {
      hero.setRidingPose(seat, this.heading);
      hero.grounded = this.grounded;
    }
    this.#updateDust(dt);
  }

  /** After a fall: back on the horse at the last checkpoint reached. */
  respawnAtCheckpoint(hero) {
    const cp = this.checkpoints[this.lastCheckpoint].position;
    this.position.copy(cp);
    this.position.y = this.world.heightAt(cp.x, cp.z);
    this.heading = Math.atan2(1, pathSlope(cp.x)); // face along the path
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.mode = MODES.RIDING;
    this.everMounted = true;
    hero.startRiding();
    const seat = this.#syncModel(0);
    hero.setRidingPose(seat, this.heading);
    this.onRespawn?.(hero.position);
  }

  #ride(dt, input, cameraYaw, hero) {
    // Joystick → desired direction (camera-relative, like the hero on foot).
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dirX = -sin * input.moveY + cos * input.moveX;
    const dirZ = -cos * input.moveY - sin * input.moveX;
    const mag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    let target = 0;
    if (mag > 0.05) {
      let diff = Math.atan2(dirX, dirZ) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const rate = lerp(HC.turnRateSlow, HC.turnRateFast, this.speedRatio);
      this.heading += clamp(diff, -rate * dt, rate * dt);
      // Ease off while turning hard, so sharp turns don't throw you into the trees.
      target = HC.maxSpeed * mag * clamp(Math.cos(diff), 0.25, 1);
    }
    const rate = target > this.speed ? HC.acceleration : HC.braking;
    this.speed += clamp(target - this.speed, -rate * dt, rate * dt);

    if (input.jumpPressed && this.grounded) {
      this.velocity.y = HC.hopVelocity;
      this.grounded = false;
    }
    this.velocity.x = Math.sin(this.heading) * this.speed;
    this.velocity.z = Math.cos(this.heading) * this.speed;
    this.velocity.y -= HC.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    const hw = CONFIG.world.width / 2 - 2;
    const hd = CONFIG.world.depth / 2 - 2;
    this.position.x = clamp(this.position.x, -hw, hw);
    this.position.z = clamp(this.position.z, -hd, hd);

    // Follow the terrain: stick to it while galloping, land after a hop.
    const reach = this.grounded ? HC.stepUp : 0;
    const ground = this.world.groundAt(this.position.x, this.position.z, this.position.y + reach);
    const gap = this.position.y - ground.y;
    if (this.velocity.y <= 0 && (gap <= 0 || (this.grounded && gap < 1.0))) {
      this.position.y = ground.y;
      this.velocity.y = 0;
      this.grounded = true;
    } else this.grounded = false;

    this.world.collide(this.position, this.velocity, HC.radius, HC.height, HC.stepUp);
    // Bumping into something takes the speed off along the heading.
    this.speed = clamp(this.velocity.x * Math.sin(this.heading) + this.velocity.z * Math.cos(this.heading), 0, HC.maxSpeed);

    // Falls: the swamp, or off the world.
    if ((this.grounded && !ground.platform && this.world.isHazard(this.position.x)) || this.position.y < CONFIG.world.killY) {
      this.respawnAtCheckpoint(hero);
      return;
    }

    // Checkpoints along the ride.
    this.checkpoints.forEach((cp, i) => {
      if (cp.reached || i <= this.lastCheckpoint) return;
      if (Math.hypot(cp.position.x - this.position.x, cp.position.z - this.position.z) < CP.radius) {
        cp.reached = true;
        this.lastCheckpoint = i;
        this.markers[i - 1]?.userData.flag.material.color.setHex(CP.reachedColor);
        this.onCheckpoint?.(i);
      }
    });

    // Dust on sand and the dirt track.
    const surface = this.world.surfaceAt(this.position.x, this.position.z);
    if (this.grounded && this.speed > DUST.minSpeed && (surface === 'sand' || surface === 'dirt')) {
      this.dustDebt = (this.dustDebt ?? 0) + DUST.perSecond * this.speedRatio * dt;
      while (this.dustDebt >= 1) {
        this.dustDebt -= 1;
        this.#spawnDust();
      }
    }
  }

  /** Places the model (with gallop / idle animation); returns the rider's seat (world). */
  #syncModel(dt) {
    const { body, legs, neck, tail, seat } = this.model.userData;
    const s = this.speedRatio;
    this.phase += dt * this.speed * HC.gallopStride * Math.PI * 2;
    const ph = this.phase;
    const airborne = !this.grounded;

    // Gallop: legs swing in pairs (front/back out of phase), body bobs, neck pumps.
    legs.forEach((hip, i) => {
      const front = i < 2;
      const off = (front ? 0 : Math.PI) + (i % 2) * 0.5;
      const swing = airborne ? (front ? -0.6 : 0.5) : Math.sin(ph + off) * HC.legSwing * s;
      hip.rotation.x = swing;
      hip.userData.knee.rotation.x = airborne ? 0.9 : Math.max(0, -Math.sin(ph + off + 0.8)) * 1.1 * s;
    });
    body.position.y = Math.abs(Math.sin(ph)) * HC.bobHeight * s;
    body.rotation.x = Math.sin(ph) * 0.05 * s;
    const graze = this.mode === MODES.IDLE ? Math.max(0, Math.sin(this.time * 0.8)) : 0;
    neck.rotation.x = graze * 0.9 + Math.sin(ph) * 0.12 * s;
    tail.rotation.x = -0.2 - s * 0.6 + Math.sin(this.time * 3) * 0.08;

    this.model.position.copy(this.position);
    this.model.rotation.y = this.heading;
    const g = this.world.groundAt(this.position.x, this.position.z, this.position.y + 0.05).y;
    this.shadow.position.set(this.position.x, g + 0.04, this.position.z);
    this.shadow.rotation.z = this.heading;

    this.model.updateMatrixWorld();
    return this.#seat.copy(seat).add(new THREE.Vector3(0, body.position.y, 0)).applyMatrix4(this.model.matrixWorld);
  }

  #spawnDust() {
    let d = this.dust.find((p) => p.age >= p.life);
    if (!d) {
      if (this.dust.length >= DUST.max) return;
      d = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 0, size: 0 };
      this.dust.push(d);
    }
    const back = -0.9 + (Math.random() - 0.5) * 0.6;
    const side = (Math.random() - 0.5) * 0.9;
    d.pos.set(
      this.position.x + Math.sin(this.heading) * back + Math.cos(this.heading) * side,
      this.position.y + 0.15,
      this.position.z + Math.cos(this.heading) * back - Math.sin(this.heading) * side,
    );
    d.vel.set((Math.random() - 0.5) * 1.2 - Math.sin(this.heading) * 1.5, DUST.rise, (Math.random() - 0.5) * 1.2 - Math.cos(this.heading) * 1.5);
    d.age = 0;
    d.life = DUST.life * (0.7 + Math.random() * 0.6);
    d.size = lerp(DUST.sizeMin, DUST.sizeMax, Math.random());
  }

  #updateDust(dt) {
    const mesh = this.dustMesh;
    const fade = mesh.geometry.attributes.instanceFade;
    const m = new THREE.Matrix4();
    let n = 0;
    for (const d of this.dust) {
      if (d.age >= d.life) continue;
      d.age += dt;
      d.pos.addScaledVector(d.vel, dt);
      const t = Math.min(1, d.age / d.life);
      const size = d.size * (0.4 + t * 0.9);
      m.makeScale(size, size * 0.7, size).setPosition(d.pos);
      mesh.setMatrixAt(n, m);
      fade.array[n] = DUST.opacity * (1 - t);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }
}
