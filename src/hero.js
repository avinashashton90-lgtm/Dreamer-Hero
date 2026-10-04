import * as THREE from 'three';
import { CONFIG } from './config.js';

const H = CONFIG.hero;

/** Placeholder hero: capsule body + mask band + cape. Swap for a glTF later (origin at feet, facing +Z). */
export async function loadHeroModel() {
  const group = new THREE.Group();
  const bodyLen = H.height - H.radius * 2;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(H.radius, bodyLen, 4, 10),
    new THREE.MeshLambertMaterial({ color: H.color }),
  );
  body.position.y = H.height / 2;
  group.add(body);

  const mask = new THREE.Mesh(
    new THREE.CylinderGeometry(H.radius * 1.02, H.radius * 1.02, 0.14, 12, 1, true),
    new THREE.MeshLambertMaterial({ color: H.maskColor, side: THREE.DoubleSide }),
  );
  mask.position.y = H.height - H.radius * 0.9;
  group.add(mask);

  // Eye holes so you can tell which way he faces.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
    eye.position.set(side * 0.13, mask.position.y, H.radius * 0.97);
    group.add(eye);
  }

  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(H.radius * 1.8, H.height * 0.6),
    new THREE.MeshLambertMaterial({ color: H.capeColor, side: THREE.DoubleSide }),
  );
  cape.position.set(0, H.height * 0.55, -H.radius - 0.02);
  cape.rotation.x = 0.12;
  group.add(cape);

  return group;
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
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
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
  }

  async init() {
    this.model = await loadHeroModel();
    this.shadow = makeBlobShadow();
    this.scene.add(this.model, this.shadow);
    this.reset();
  }

  /** Back to the start of the level (first rooftop). */
  reset() {
    this.riding = false;
    this.shadow.visible = true;
    this.model.scale.set(1, 1, 1);
    const first = this.world.boxes[0];
    this.lastSafe.copy(first.safe);
    this.facing = Math.PI / 2; // face along the route (+X)
    this.#placeAt(this.lastSafe);
  }

  // --- Riding (the Horse drives these) ---

  startRiding() {
    this.riding = true;
    this.velocity.set(0, 0, 0);
    this.platform = null;
    this.shadow.visible = false;
    this.model.scale.set(1, CONFIG.horse.riderSquash, 1); // reads as seated
  }

  /** Places the rider (feet at `p`, facing `yaw`); also used during mount transitions. */
  setRidingPose(p, yaw, lean = 0) {
    this.position.copy(p);
    this.facing = yaw;
    this.model.position.copy(p);
    this.model.rotation.set(0, yaw, lean, 'YXZ'); // leans into the horse's turns
  }

  /** Back on foot at `p` (end of a dismount). */
  stopRiding(p, yaw) {
    this.riding = false;
    this.shadow.visible = true;
    this.model.scale.set(1, 1, 1);
    this.model.rotation.set(0, yaw, 0);
    this.facing = yaw;
    this.lastSafe.copy(p);
    this.#placeAt(p);
  }

  #fall() {
    if (this.onFall?.()) return;
    this.respawn();
  }

  /** Back to the last safe platform after a fall. */
  respawn() {
    this.#placeAt(this.lastSafe);
    this.onRespawn?.(this.position);
  }

  /**
   * @param {number} dt
   * @param {{moveX:number, moveY:number, jumpPressed:boolean}} input  moveY>0 = forward
   * @param {number} cameraYaw
   */
  update(dt, input, cameraYaw) {
    // Camera-relative desired velocity on XZ.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // Forward is away from the camera: camera sits at +sin/+cos of yaw relative to hero.
    const dirX = -sin * input.moveY + cos * input.moveX;
    const dirZ = -cos * input.moveY - sin * input.moveX;
    const mag = Math.min(1, Math.hypot(input.moveX, input.moveY));

    const speed = H.walkSpeed * (this.grounded ? 1 : H.airSpeedBoost);
    const accel = H.acceleration * (this.grounded ? 1 : H.airControl);
    const k = 1 - Math.exp((-accel * dt) / H.walkSpeed);
    this.velocity.x += (dirX * speed - this.velocity.x) * k;
    this.velocity.z += (dirZ * speed - this.velocity.z) * k;

    if (mag > 0.05) {
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
    const hw = CONFIG.world.width / 2 - 1;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -hw, hw);
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
    this.model.rotation.y = this.facing;
    const g = this.world.groundAt(this.position.x, this.position.z, this.position.y + 0.05).y;
    this.shadow.position.set(this.position.x, g + 0.03, this.position.z);
    const lift = Math.max(0, this.position.y - g);
    this.shadow.scale.setScalar(1 / (1 + lift * 0.25));
  }
}
