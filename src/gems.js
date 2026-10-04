import * as THREE from 'three';

// STUB — Part 1: collect gems during the forest ride.

/** Placeholder gem. Swap for a glTF later. */
export async function loadGemModel() {
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4),
    new THREE.MeshLambertMaterial({ color: 0x3fe0ff, emissive: 0x0a4a66 }),
  );
}

export class Gems {
  constructor(scene) {
    this.scene = scene;
    this.collected = 0;
  }
  async init() {}
  update(_dt, _heroPosition) {}
}
