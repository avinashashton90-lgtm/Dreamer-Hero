import * as THREE from 'three';
import { CONFIG } from './config.js';

const W = CONFIG.world;

/** Analytic terrain height so physics never needs a raycast. */
export function heightAt(x, z) {
  const s = W.hillScale;
  let h =
    Math.sin(x * s) * Math.cos(z * s * 0.8) +
    0.5 * Math.sin(x * s * 2.3 + 1.7) * Math.sin(z * s * 1.9 + 0.4) +
    0.25 * Math.cos(x * s * 4.1 - z * s * 3.7);
  h *= W.hillHeight;
  // Flatten around spawn so the player starts on level ground.
  const d = Math.hypot(x, z);
  const t = THREE.MathUtils.smoothstep(d, W.flatRadius * 0.5, W.flatRadius * 1.5);
  return h * t;
}

/** Placeholder terrain. Swap for a glTF later; keep heightAt() in sync or replace with raycasts. */
export async function loadTerrainModel() {
  const geo = new THREE.PlaneGeometry(W.size, W.size, W.segments, W.segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(W.groundColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    c.copy(base).offsetHSL(0, 0, (y / W.hillHeight) * 0.08);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

/** Placeholder low-poly tree, instanced. Swap for a glTF later. */
export async function loadTreeModel(count) {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
  trunkGeo.translate(0, 1, 0);
  const leafGeo = new THREE.ConeGeometry(1.6, 3.5, 7);
  leafGeo.translate(0, 3.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4b2a }), count);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x2f8a3c }), count);
  group.add(trunks, leaves);
  return { group, trunks, leaves };
}

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(W.skyColor);
    this.scene.fog = new THREE.Fog(W.skyColor, W.fogNear, W.fogFar);
    this.heightAt = heightAt;
  }

  async init() {
    const L = CONFIG.lights;
    this.scene.add(new THREE.AmbientLight(0xffffff, L.ambient));
    this.scene.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity));
    const sun = new THREE.DirectionalLight(0xffffff, L.sunIntensity);
    sun.position.set(...L.sunPosition);
    this.scene.add(sun); // no shadow maps by design (mobile perf)

    this.terrain = await loadTerrainModel();
    this.scene.add(this.terrain);

    await this.#scatterTrees();
  }

  async #scatterTrees() {
    const { group, trunks, leaves } = await loadTreeModel(W.treeCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    // Deterministic pseudo-random so the world is the same every run.
    let seed = 1337;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const half = W.size / 2 - 5;
    for (let i = 0; i < W.treeCount; i++) {
      let x, z;
      do {
        x = (rand() * 2 - 1) * half;
        z = (rand() * 2 - 1) * half;
      } while (Math.hypot(x, z) < W.treeMinDist);
      p.set(x, heightAt(x, z) - 0.1, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI * 2);
      const k = 0.8 + rand() * 0.8;
      s.set(k, k, k);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    }
    this.scene.add(group);
  }
}
