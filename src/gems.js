import * as THREE from 'three';
import { CONFIG } from './config.js';

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
 * Gems along the ride (river → cave): yellow, blue and pink, in groups of 5 laid out along
 * the trail's centre lane — rows on the centre line, gentle arcs within the lane, and arcs in
 * the air over some obstacles (only a jump reaches those). Group colours cycle yellow → blue
 * → pink along the ride. Collected by walking or riding through them. Counts and ability
 * unlocks persist through respawns; only `reset()` (new game) clears them.
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
    const groups = layoutGroups(world);
    const perColor = {};
    this.gems = [];
    groups.forEach((grp, gi) => {
      const color = COLORS[gi % COLORS.length];
      for (const sp of grp.spots) {
        perColor[color] = (perColor[color] ?? 0) + 1;
        this.gems.push({ ...sp, kind: grp.kind, group: gi, color, index: perColor[color] - 1, collected: false, pop: 0 });
      }
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

/**
 * Group layout: air arcs over the chosen obstacles, ground groups (alternating rows and arcs)
 * spread evenly over the rest of the trail and kept clear of every obstacle. Sorted by
 * distance along the trail. Each spot: { s, lateral, position }.
 */
export function layoutGroups(world) {
  const { track, obstacles } = world;
  const span = (G.groupSize - 1) * G.spacing;
  const groundY = (x, z) => Math.max(world.heightAt(x, z), CONFIG.zones.waterY);
  const at = (s, lateral) => {
    const p = track.at(s);
    return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral };
  };
  const groups = [];

  // In the air over obstacles: an arc following the hop at full speed, a little above it.
  const H = CONFIG.horse;
  const air = G.airGemObstacles.map((i) => obstacles[i]).filter(Boolean);
  for (const o of air) {
    const spots = G.airOffsets.map((d) => {
      const t = d / H.maxSpeed; // time from the apex
      const hop = H.hopVelocity ** 2 / (2 * H.gravity) - 0.5 * H.gravity * t * t;
      const { x, z } = at(o.s + d, 0);
      return { s: o.s + d, lateral: 0, position: new THREE.Vector3(x, groundY(x, z) + G.riderReach + hop + G.airLift, z) };
    });
    groups.push({ kind: 'air', s: o.s, spots });
  }

  // On the ground: evenly spread, nudged off any obstacle (before it, so the run-up is clear).
  const count = G.groups - air.length;
  const s0 = G.startS;
  const s1 = track.length - G.endMargin - span;
  const clear = G.obstacleClear + span / 2;
  for (let i = 0; i < count; i++) {
    let mid = s0 + span / 2 + ((i + 0.5) / count) * (s1 - s0);
    for (const o of obstacles) if (Math.abs(mid - o.s) < clear) mid = o.s - clear;
    const arc = i % 2 === 1;
    const side = i % 4 === 1 ? 1 : -1;
    const spots = [];
    for (let k = 0; k < G.groupSize; k++) {
      const s = mid - span / 2 + k * G.spacing;
      const lateral = arc ? side * G.arcLateral[k] : 0;
      const { x, z } = at(s, lateral);
      spots.push({ s, lateral, position: new THREE.Vector3(x, groundY(x, z) + G.height, z) });
    }
    groups.push({ kind: arc ? 'arc' : 'row', s: mid, spots });
  }
  return groups.sort((a, b) => a.s - b.s);
}
