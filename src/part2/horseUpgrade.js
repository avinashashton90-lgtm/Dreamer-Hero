import * as THREE from 'three';
import { CONFIG } from '../config.js';

// The horse in Gearhaven: brass armour plates (chest, neck, flanks, rump) and a small brass
// wind-up key on its back, turning slowly. A placeholder (swap loadGearhavenHorseUpgrade() for a
// real model later); it rides on the horse's model (horse-local: +Z forward, feet at 0).

const HU = CONFIG.part2.horseUpgrade;

/** `userData` = { key, plates }. */
export async function loadGearhavenHorseUpgrade() {
  const group = new THREE.Group();
  group.name = 'gearhavenUpgrade';
  const brass = new THREE.MeshLambertMaterial({ color: HU.brass });
  const copper = new THREE.MeshLambertMaterial({ color: HU.copper });
  const back = CONFIG.horseModel.backHeight;
  const plate = (w, h, d, x, y, z, rx = 0, ry = 0, mat = brass) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    group.add(m);
    return m;
  };
  const plates = [
    plate(0.62, 0.5, 0.08, 0, back * 0.72, 0.92, -0.25), // chest
    plate(0.26, 0.36, 0.06, 0, back * 1.0, 1.02, -0.6), // neck
    plate(0.08, 0.42, 0.9, 0.33, back * 0.78, 0.1, 0, 0, copper), // flanks
    plate(0.08, 0.42, 0.9, -0.33, back * 0.78, 0.1, 0, 0, copper),
    plate(0.62, 0.08, 0.5, 0, back * 0.99, -0.62), // rump
  ];
  // The wind-up key: a shaft into its back, a round bow of two loops.
  const K = HU.key;
  const key = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(K.size * 0.07, K.size * 0.07, K.size * 0.7, 8), brass);
  shaft.position.y = K.size * 0.35;
  key.add(shaft);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(K.size * 0.28, K.size * 0.07, 6, 14), brass);
    loop.position.set(s * K.size * 0.3, K.size * 0.85, 0);
    key.add(loop);
  }
  key.position.set(K.at[0], K.at[1] * (back / 1.65), K.at[2]);
  group.add(key);
  group.userData = { key, plates };
  return group;
}

/** Turns the key slowly (call every frame while it's on the horse). */
export function spinHorseKey(upgrade, dt) {
  upgrade.userData.key.rotation.y += HU.key.spin * dt;
}
