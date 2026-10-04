import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.camera;

/** Third-person orbit camera that follows a target. Yaw/pitch are driven by input deltas. */
export class FollowCamera {
  constructor(aspect, heightAt) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.render.fov, aspect, CONFIG.render.near, CONFIG.render.far);
    this.heightAt = heightAt;
    this.yaw = C.startYaw;
    this.pitch = C.startPitch;
    this.focus = new THREE.Vector3();
    this.#desired = new THREE.Vector3();
  }

  #desired;

  reset() {
    this.yaw = C.startYaw;
    this.pitch = C.startPitch;
  }

  rotate(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sensitivity, C.minPitch, C.maxPitch);
  }

  snapTo(target) {
    this.focus.copy(target);
    this.focus.y += C.height;
    this.#place();
  }

  update(dt, target) {
    const k = 1 - Math.exp(-C.followLerp * dt);
    this.focus.x += (target.x - this.focus.x) * k;
    this.focus.y += (target.y + C.height - this.focus.y) * k;
    this.focus.z += (target.z - this.focus.z) * k;
    this.#place();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  #place() {
    const cp = Math.cos(this.pitch);
    this.#desired.set(
      this.focus.x + Math.sin(this.yaw) * cp * C.distance,
      this.focus.y + Math.sin(this.pitch) * C.distance,
      this.focus.z + Math.cos(this.yaw) * cp * C.distance,
    );
    const minY = this.heightAt(this.#desired.x, this.#desired.z) + C.groundClearance;
    if (this.#desired.y < minY) this.#desired.y = minY;
    this.camera.position.copy(this.#desired);
    this.camera.lookAt(this.focus);
  }
}
