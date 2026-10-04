import * as THREE from 'three';

// STUB — Part 1: cave monster boss.

/** Placeholder boss. Swap for a glTF later. */
export async function loadBossModel() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0x4b2a5c }),
  );
  body.position.y = 2;
  group.add(body);
  return group;
}

export class Boss {
  constructor(scene) {
    this.scene = scene;
    this.health = 0;
  }
  async init() {}
  update(_dt, _hero) {}
}
