import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadDizzyModel } from './combat.js';

const D = CONFIG.dummy;

/** Placeholder training dummy: a post with a straw-sack body, a sack head and crossbar arms. */
export async function loadDummyModel() {
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5232, flatShading: true });
  const straw = new THREE.MeshLambertMaterial({ color: D.color, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group(); // tips over from its base
  root.add(body);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, D.height, 6).translate(0, D.height / 2, 0), wood);
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(D.radius * 0.85, D.radius, 0.8, 8).translate(0, 1.05, 0), straw);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), straw);
  head.position.y = 1.7;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6).rotateZ(Math.PI / 2), wood);
  bar.position.y = 1.35;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 8), wood);
  base.position.y = 0.06;
  body.add(post, sack, head, bar);
  root.add(base);
  root.userData = { body, mats: [straw, wood] };
  return root;
}

/**
 * Training dummy near the river sand: a combat target with 200 HP. It wobbles and flashes
 * when hit, can be paralyzed (dizzy stars), and when knocked down stands back up with full HP.
 */
export class TrainingDummy {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    const [x, z] = D.position;
    this.position = new THREE.Vector3(x, world.heightAt(x, z), z);
    this.radius = D.radius;
    this.height = D.height;
    this.maxHp = D.hp;
    this.hp = D.hp;
    this.alive = true;
    this.paralyzed = 0;
    this.smokeExposure = 0;
    this.flash = 0;
    this.wobble = 0;
    this.wobbleVel = 0;
    this.wobbleDir = new THREE.Vector2(0, 1);
    this.down = 0; // seconds since knocked down
    this.lastHit = null;
  }

  async init() {
    this.model = await loadDummyModel();
    this.model.position.copy(this.position);
    this.dizzy = await loadDizzyModel();
    this.dizzy.position.set(0, D.height + 0.35, 0);
    this.model.add(this.dizzy);
    this.scene.add(this.model);
    this.collider = { x: this.position.x, z: this.position.z, r: this.radius, top: this.position.y + this.height, bottom: this.position.y - 1 };
    this.world.cylinders.push(this.collider);
  }

  reset() {
    this.hp = this.maxHp;
    this.alive = true;
    this.paralyzed = 0;
    this.down = 0;
    this.wobble = this.wobbleVel = 0;
  }

  takeHit({ amount, dirX = 0, dirZ = 1, knockback = 0 }) {
    if (!this.alive) return 0;
    const dealt = Math.min(this.hp, Math.round(amount));
    this.hp -= dealt;
    this.flash = CONFIG.combat.hitFlash;
    this.wobbleDir.set(dirX, dirZ);
    this.wobbleVel += 2 + knockback * 0.6;
    this.lastHit = { amount: dealt };
    if (this.hp <= 0) {
      this.alive = false;
      this.down = 0;
      this.paralyzed = 0;
    }
    return dealt;
  }

  paralyze(seconds) {
    if (!this.alive) return;
    this.paralyzed = seconds;
  }

  update(dt) {
    this.paralyzed = Math.max(0, this.paralyzed - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (!this.alive) {
      this.down += dt;
      if (this.down >= D.respawnTime) this.reset();
    }
    // Springy wobble away from the hit.
    this.wobbleVel += (-this.wobble * 60 - this.wobbleVel * 6) * dt;
    this.wobble += this.wobbleVel * dt;
    if (!this.model) return;
    const { body, mats } = this.model.userData;
    const fall = this.alive ? 0 : Math.min(1, this.down / 0.35) * (Math.PI / 2);
    const tilt = this.alive ? THREE.MathUtils.clamp(this.wobble * 0.3, -0.6, 0.6) : fall;
    body.rotation.set(this.wobbleDir.y * tilt, 0, -this.wobbleDir.x * tilt);
    for (const m of mats) m.emissive.setScalar(this.flash > 0 ? 0.8 : 0);
    this.dizzy.visible = this.paralyzed > 0;
    if (this.dizzy.visible) this.dizzy.rotation.y += dt * 4;
  }
}
