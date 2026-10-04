import * as THREE from 'three';
import { CONFIG } from './config.js';
import { pathZ, pathDir } from './world.js';

const G = CONFIG.gems;
const COLORS = Object.keys(G.colors); // ['yellow', 'blue', 'pink']

let haloTexture = null;
/** Soft round glow texture (created once; null outside a browser, e.g. in tests). */
function getHaloTexture() {
  if (haloTexture || typeof document === 'undefined') return haloTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  haloTexture = new THREE.CanvasTexture(canvas);
  return haloTexture;
}

/**
 * Placeholder gems for one colour: an instanced emissive octahedron plus a halo (one
 * Points draw call). Swap for a glTF later; keep the returned shape.
 */
export async function loadGemModel(color, count) {
  const mesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(G.size, 0).scale(0.8, 1.2, 0.8),
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55, flatShading: true }),
    count,
  );
  mesh.frustumCulled = false;
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const halo = new THREE.Points(
    haloGeo,
    new THREE.PointsMaterial({
      color,
      size: G.haloSize,
      map: getHaloTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  halo.frustumCulled = false;
  return { mesh, halo };
}

/**
 * Gems along the ride (river → cave): yellow, blue and pink. Some weave around the path,
 * some sit at the ends of side trails, and some float above obstacles (only reachable with a
 * jump). Collected by walking or riding through them. Counts and ability unlocks persist
 * through respawns; only `reset()` (new game) clears them.
 */
export class Gems {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {{onCollect?: Function, onUnlock?: Function}} [events]
   *   onCollect(color, count, needed) · onUnlock(color, abilityId)
   */
  constructor(scene, world, events = {}) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.time = 0;
    const spots = [];
    const ground = (x, z) => Math.max(world.heightAt(x, z), CONFIG.zones.waterY) + G.height;
    // On the path, weaving left and right of the centre line.
    for (const [x, lat] of G.pathGems) {
      const [dx, dz] = pathDir(x);
      const gx = x - dz * lat;
      const gz = pathZ(x) + dx * lat;
      spots.push({ kind: 'path', order: x, position: new THREE.Vector3(gx, ground(gx, gz), gz) });
    }
    // Floating above obstacles: jump to grab them.
    for (const i of G.airGemObstacles) {
      const o = world.obstacles[i];
      spots.push({ kind: 'air', order: o.cx, obstacle: o, position: new THREE.Vector3(o.cx, o.base + G.airHeight, o.cz) });
    }
    // Along the side trails.
    world.layout.spurs.forEach((sp, si) => {
      for (const t of G.spurGemTs) {
        const x = sp.x0 + sp.ux * sp.len * t;
        const z = sp.z0 + sp.uz * sp.len * t;
        spots.push({ kind: 'spur', spur: si, order: sp.x0 + t * 0.1, position: new THREE.Vector3(x, ground(x, z), z) });
      }
    });
    spots.sort((a, b) => a.order - b.order);
    const perColor = {};
    this.gems = spots.map((sp, i) => {
      const color = COLORS[i % COLORS.length];
      perColor[color] = (perColor[color] ?? 0) + 1;
      return { ...sp, color, index: perColor[color] - 1, collected: false, pop: 0 };
    });
    this.perColor = perColor;
    this.counts = {};
    this.unlocked = new Set();
  }

  async init() {
    this.models = {};
    for (const color of COLORS) {
      const model = await loadGemModel(G.colors[color], this.perColor[color]);
      this.models[color] = model;
      this.scene.add(model.mesh, model.halo);
    }
    this.reset();
  }

  /** New game: every gem back, counters and unlocks cleared. */
  reset() {
    for (const g of this.gems) {
      g.collected = false;
      g.pop = 0;
    }
    for (const c of COLORS) this.counts[c] = 0;
    this.unlocked.clear();
    this.#render();
  }

  get remaining() {
    return this.gems.filter((g) => !g.collected).length;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} body  collector's body centre (hero chest on foot, horse+rider middle when riding)
   */
  update(dt, body) {
    this.time += dt;
    for (const g of this.gems) {
      if (g.collected) {
        if (g.pop < 1) g.pop = Math.min(1, g.pop + dt / G.popTime);
        continue;
      }
      const dx = g.position.x - body.x;
      const dz = g.position.z - body.z;
      const dy = g.position.y - body.y;
      if (dx * dx + dz * dz < G.collectRadius * G.collectRadius && Math.abs(dy) < G.collectHeight) this.#collect(g);
    }
    this.#render();
  }

  #collect(g) {
    g.collected = true;
    g.pop = 0;
    const count = ++this.counts[g.color];
    this.events.onCollect?.(g.color, count, G.needed);
    if (count === G.needed && !this.unlocked.has(g.color)) {
      this.unlocked.add(g.color);
      this.events.onUnlock?.(g.color, G.abilities[g.color]);
    }
  }

  #render() {
    if (!this.models) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = THREE.Object3D.DEFAULT_UP;
    for (const color of COLORS) {
      const { mesh, halo } = this.models[color];
      const hp = halo.geometry.attributes.position;
      for (const g of this.gems) {
        if (g.color !== color) continue;
        const bob = Math.sin(this.time * G.bobSpeed + g.position.x * 0.3) * G.bobHeight;
        let scale = 1;
        let lift = 0;
        if (g.collected) {
          // Pop: swell, rise and vanish.
          scale = g.pop < 1 ? (1 + g.pop * 0.8) * (1 - g.pop) : 0;
          lift = g.pop * 1.2;
        }
        p.copy(g.position).setY(g.position.y + bob + lift);
        q.setFromAxisAngle(up, this.time * G.spinSpeed + g.index);
        mesh.setMatrixAt(g.index, m.compose(p, q, s.setScalar(scale)));
        if (scale > 0) hp.setXYZ(g.index, p.x, p.y, p.z);
        else hp.setXYZ(g.index, 0, -1000, 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
      hp.needsUpdate = true;
    }
  }
}
