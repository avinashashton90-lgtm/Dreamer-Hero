import * as THREE from 'three';

// STUB — Part 1: horse by the river, forest ride, desert ride.

/** Placeholder horse. Swap for a glTF later (origin at hooves, facing +Z). */
export async function loadHorseModel() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2), mat);
  body.position.y = 1.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.6), mat);
  head.position.set(0, 2, 1.1);
  group.add(body, head);
  for (const [x, z] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), mat);
    leg.position.set(x, 0.5, z);
    group.add(leg);
  }
  return group;
}

export class Horse {
  constructor(scene) {
    this.scene = scene;
    this.mounted = false;
  }
  async init() {}
  update(_dt) {}
}
