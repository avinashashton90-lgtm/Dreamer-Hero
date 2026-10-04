import * as THREE from 'three';
import { CONFIG } from './config.js';

// Part 1: horse by the river, forest ride, desert ride.
// For now the horse waits on the sand bank (the "Find the horse" objective); riding comes later.

/** Placeholder horse. Swap for a glTF later (origin at hooves, facing +Z). */
export async function loadHorseModel() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3b2614 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2), mat);
  body.position.y = 1.4;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), mat);
  neck.position.set(0, 1.95, 0.85);
  neck.rotation.x = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.75), mat);
  head.position.set(0, 2.35, 1.2);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.3), dark);
  mane.position.set(0, 2.05, 0.7);
  mane.rotation.x = 0.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), dark);
  tail.position.set(0, 1.3, -1.05);
  tail.rotation.x = -0.4;
  group.add(body, neck, head, mane, tail);
  for (const [x, z] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), mat);
    leg.position.set(x, 0.5, z);
    group.add(leg);
  }
  group.userData.head = head;
  return group;
}

export class Horse {
  /** @param {THREE.Scene} scene @param {(x:number,z:number)=>number} heightAt */
  constructor(scene, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.mounted = false;
    this.time = 0;
  }

  async init() {
    const [x, z] = CONFIG.horse.position;
    this.model = await loadHorseModel();
    this.model.position.set(x, this.heightAt(x, z), z);
    this.model.rotation.y = CONFIG.horse.facing;
    this.scene.add(this.model);
  }

  update(dt) {
    // Idle: graze by bobbing the head.
    this.time += dt;
    const head = this.model.userData.head;
    head.position.y = 2.35 - Math.max(0, Math.sin(this.time * 0.8)) * 0.5;
  }
}
