import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.camera;
const { clamp, smoothstep } = THREE.MathUtils;

/**
 * Third-person orbit camera that follows a target. Yaw/pitch are driven by input deltas.
 * In the tree-leaping zone it pulls back and looks further down. It never ends up inside
 * trunks, rocks, buildings or leaf clusters: it snaps in front of them and eases back out
 * (slowly) once the way is clear.
 */
export class FollowCamera {
  /** @param {number} aspect @param {import('./world.js').World} world */
  constructor(aspect, world) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.render.fov, aspect, CONFIG.render.near, CONFIG.render.far);
    this.world = world;
    this.yaw = C.startYaw;
    this.pitch = C.startPitch;
    this.focus = new THREE.Vector3();
    this.distance = C.distance; // current (collision-smoothed) distance
    this.#dir = new THREE.Vector3();
  }

  #dir;

  reset() {
    this.yaw = C.startYaw;
    this.pitch = C.startPitch;
  }

  rotate(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch + dy * sensitivity, C.minPitch, C.maxPitch);
  }

  snapTo(target) {
    this.focus.copy(target);
    this.focus.y += C.height;
    this.#place(0);
  }

  update(dt, target) {
    const k = 1 - Math.exp(-C.followLerp * dt);
    this.focus.x += (target.x - this.focus.x) * k;
    this.focus.y += (target.y + C.height - this.focus.y) * k;
    this.focus.z += (target.z - this.focus.z) * k;
    this.#place(dt);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 0 outside the tree-leaping zone, 1 inside, smooth across its edges. */
  treeZoneFactor(x) {
    const { townEndX, hazardEndX } = this.world.layout;
    return smoothstep(x, townEndX - C.treeZoneBlend, townEndX) * (1 - smoothstep(x, hazardEndX, hazardEndX + C.treeZoneBlend));
  }

  /** @param {number} dt  0 = snap (no smoothing) */
  #place(dt) {
    const zone = this.treeZoneFactor(this.focus.x);
    const pitch = this.pitch + zone * C.treeZonePitchBoost;
    const maxDist = C.distance * (1 + zone * (C.treeZoneDistanceScale - 1));
    const cp = Math.cos(pitch);
    const dir = this.#dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);

    const free = Math.max(C.minDistance, this.#freeDistance(dir, maxDist));
    // Snap in front of anything in the way (never render from inside a trunk), ease back out.
    if (dt === 0 || free < this.distance) this.distance = free;
    else this.distance += (free - this.distance) * (1 - Math.exp(-C.releaseLerp * dt));

    const p = this.camera.position.copy(this.focus).addScaledVector(dir, this.distance);
    const minY = this.world.heightAt(p.x, p.z) + C.groundClearance;
    if (p.y < minY) p.y = minY;
    this.camera.lookAt(this.focus);
  }

  /** Distance along `dir` from the focus before hitting a solid or a leaf cluster. */
  #freeDistance(dir, maxDist) {
    const o = this.focus;
    const pad = C.collisionPadding;
    let hit = maxDist;
    const reach = maxDist + pad;

    // Vertical cylinders (trunks, forest trees, rocks): circle test in XZ + height check.
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > 1e-6) {
      for (const c of this.world.cylinders) {
        const ox = o.x - c.x;
        const oz = o.z - c.z;
        if (Math.abs(ox) > reach + c.r + pad || Math.abs(oz) > reach + c.r + pad) continue;
        // Use the padded radius unless the hero is already inside the padding (hugging it).
        const d2 = ox * ox + oz * oz;
        const r = d2 > (c.r + pad) ** 2 ? c.r + pad : c.r + 0.05;
        const cc = d2 - r * r;
        if (cc <= 0) continue;
        const b = 2 * (ox * dir.x + oz * dir.z);
        const disc = b * b - 4 * a * cc;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t <= 0 || t >= hit) continue;
        const y = o.y + dir.y * t;
        if (y >= c.bottom && y <= c.top + pad) hit = t;
      }
    }

    // Buildings: slab test against the padded box.
    for (const bx of this.world.boxes) {
      const t = rayBox(o, dir, bx.minX - pad, bx.bottom - pad, bx.minZ - pad, bx.maxX + pad, bx.top + pad, bx.maxZ + pad);
      if (t > 0 && t < hit) hit = t;
    }

    // Leaf clusters: clusters merely between camera and hero fade out (World.updateFoliage);
    // only when the camera itself would end up inside one is it moved in front of it.
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const l of this.world.foliage.items) {
        const dx = l.x - o.x;
        const dy = l.y - o.y;
        const dz = l.z - o.z;
        const r = l.r * 0.95 + pad;
        if (dx * dx + dy * dy + dz * dz > (reach + r) * (reach + r)) continue;
        const tc = dx * dir.x + dy * dir.y + dz * dir.z;
        const e2 = dx * dx + dy * dy + dz * dz - tc * tc;
        if (e2 >= r * r) continue;
        const half = Math.sqrt(r * r - e2);
        const tIn = tc - half;
        if (tIn < hit && tc + half > hit && tIn > C.leafMinDistance) {
          hit = tIn;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }
}

/** Ray/AABB entry distance (or -1). */
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [oc, dc, lo, hi] of [
    [o.x, d.x, x0, x1],
    [o.y, d.y, y0, y1],
    [o.z, d.z, z0, z1],
  ]) {
    if (Math.abs(dc) < 1e-8) {
      if (oc < lo || oc > hi) return -1;
      continue;
    }
    let t1 = (lo - oc) / dc;
    let t2 = (hi - oc) / dc;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin > 0 ? tmin : -1; // starting inside (hero on a roof) never blocks
}
