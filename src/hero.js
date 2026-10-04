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
  constructor(scene, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.position = new THREE.Vector3(...H.spawn);
    this.velocity = new THREE.Vector3();
    this.facing = 0; // yaw radians
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffered = 0;
  }

  async init() {
    this.model = await loadHeroModel();
    this.shadow = makeBlobShadow();
    this.scene.add(this.model, this.shadow);
    this.reset();
  }

  reset() {
    this.position.set(...H.spawn);
    this.position.y = this.heightAt(this.position.x, this.position.z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.facing = 0;
    this.#sync();
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
    const targetX = dirX * H.walkSpeed;
    const targetZ = dirZ * H.walkSpeed;

    const accel = H.acceleration * (this.grounded ? 1 : H.airControl);
    const k = 1 - Math.exp(-accel * dt / H.walkSpeed);
    this.velocity.x += (targetX - this.velocity.x) * k;
    this.velocity.z += (targetZ - this.velocity.z) * k;

    if (mag > 0.05) {
      const targetYaw = Math.atan2(dirX, dirZ);
      let diff = targetYaw - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, H.turnSpeed * dt);
    }

    // Jump with coyote time + input buffering.
    if (input.jumpPressed) this.jumpBuffered = H.jumpBuffer;
    else this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyote = this.grounded ? H.coyoteTime : Math.max(0, this.coyote - dt);

    if (this.jumpBuffered > 0 && this.coyote > 0) {
      this.velocity.y = H.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffered = 0;
    }

    this.velocity.y = Math.max(this.velocity.y - H.gravity * dt, -H.maxFallSpeed);
    this.position.addScaledVector(this.velocity, dt);

    // Keep inside the world bounds.
    const half = CONFIG.world.size / 2 - 1;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -half, half);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -half, half);

    const ground = this.heightAt(this.position.x, this.position.z);
    if (this.position.y <= ground && this.velocity.y <= 0) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.position.y - ground < 0.3 && this.velocity.y <= 0) {
      // Stick to downhill slopes instead of bouncing off them.
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }

    this.#sync();
  }

  #sync() {
    this.model.position.copy(this.position);
    this.model.rotation.y = this.facing;
    const g = this.heightAt(this.position.x, this.position.z);
    this.shadow.position.set(this.position.x, g + 0.03, this.position.z);
    const lift = Math.max(0, this.position.y - g);
    const s = 1 / (1 + lift * 0.25);
    this.shadow.scale.setScalar(s);
  }
}
