import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadPropGear, loadKitGear, colorMerge } from '../kits.js';
import { bigGearGeometry } from './gearhaven.js';
import { roleMaterial } from './looks.js';

// Gearhaven's gear props (CONFIG.part2.props): the Poly Pizza / Quaternius gears and the Factory
// Kit's cogs as one regular shape each (centred, axle along +Z, radius 1 — kits.js), turning
// slowly on walls, floors and in the sky (buildGearDecor: one InstancedMesh per shape, every gear
// brass or copper through its instance colour), the spiky gear as a spinning saw (loadSawModel),
// and a pooled sparkle burst for a gear picked up (loadSparkleModel). A shape that fails to load
// → the code-built gear wheel (bigGearGeometry).

const PR = CONFIG.part2.props;
const TAU = Math.PI * 2;

let fallback = null;

/** The shapes named (keys of `props.shapes`) → { name → geometry } (the code-built wheel for any that fail). */
export async function loadGearShapes(names, opts = {}) {
  const geos = await Promise.all(names.map((n) => {
    const [kit, file] = PR.shapes[n];
    return kit === 'props' ? loadPropGear(file, opts) : loadKitGear(kit, file, opts);
  }));
  fallback ??= bigGearGeometry(1, 12, 0.3);
  return Object.fromEntries(names.map((n, i) => [n, geos[i] ?? fallback]));
}

/** Is `geometry` the code-built stand-in (its file failed)? */
export function isFallbackGear(geometry) {
  return geometry === fallback;
}

/**
 * Turning gears: `items` = [{ shape, pos, face (yaw), tilt?, r, speed, angle?, metal }] →
 * { group, sets: [{ mesh, items }] } — one InstancedMesh per shape (instance colour: the metal).
 */
export function buildGearDecor(items, shapes) {
  const group = new THREE.Group();
  group.name = 'gearDecor';
  const sets = [];
  const byShape = new Map();
  for (const it of items) {
    if (!byShape.has(it.shape)) byShape.set(it.shape, []);
    byShape.get(it.shape).push(it);
  }
  const col = new THREE.Color();
  for (const [shape, list] of byShape) {
    const mesh = new THREE.InstancedMesh(shapes[shape], new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: PR.emissive }), list.length);
    list.forEach((it, i) => {
      it.angle ??= 0;
      mesh.setColorAt(i, col.setHex(PR.metals[it.metal ?? 'brass']));
    });
    mesh.name = `gears:${shape}`;
    group.add(mesh);
    const set = { mesh, items: list };
    spinInstances(set, 0);
    mesh.computeBoundingSphere();
    sets.push(set);
  }
  return { group, sets };
}

/** Turn every gear of a decor by `dt`. */
export function spinGearDecor(decor, dt) {
  for (const set of decor.sets) spinInstances(set, dt);
}

/** Turns instanced gears about their own axis (`items`: pos, face (yaw), tilt?, r, speed, angle). */
export function spinInstances({ mesh, items }, dt) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  items.forEach((it, i) => {
    it.angle += it.speed * dt;
    e.set(it.tilt ?? 0, it.face, it.angle, 'YXZ');
    q.setFromEuler(e);
    m.compose(it.pos, q, s.set(it.r, it.r, it.r * (it.depth ?? 1)));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * A spinning saw (the spiky gear) standing upright in a slot across the street: the slot (a
 * dark groove, `travel` either side), and the blade (`userData.blade`: slides along the slot —
 * local x — and `userData.disc` spins about its axle, local z, so its face is across the trail).
 * Local: x across the trail, z along it.
 */
export async function loadSawModel(opts = {}) {
  const S = CONFIG.part2.ride.saw;
  const { spiky } = await loadGearShapes(['spiky'], opts);
  const g = new THREE.Group();
  g.name = 'saw';
  const slotLen = S.travel * 2 + S.radius * 2;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(slotLen, 0.05, S.slotWidth), roleMaterial('darkSteel'));
  slot.position.y = 0.025;
  const blade = new THREE.Group();
  // (the blade and its brass hub: one draw; its axle along local z — the blade's face across the trail)
  const disc = colorMerge([
    [spiky.clone().scale(S.radius, S.radius, S.thickness), S.color],
    [new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12).rotateX(Math.PI / 2).scale(S.radius, S.radius, S.thickness), PR.metals.brass],
  ], { emissive: S.emissive });
  blade.add(disc);
  blade.position.y = S.radius * (1 - S.sink);
  g.add(slot, blade);
  g.userData = { blade, disc };
  return g;
}

/** A pooled sparkle burst (small additive diamonds; faded through instance colour). */
export async function loadSparkleModel(max) {
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), max);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

/** Evenly spread angles (for rings of gears). */
export function ringAngles(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => (i / n) * TAU + offset);
}
