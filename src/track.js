import * as THREE from 'three';
import { CONFIG } from './config.js';

const TR = CONFIG.track;

/**
 * Straights between the given corner points, each corner rounded with a circular arc
 * (radius = the point's 3rd value or CONFIG.track.cornerRadius). Returns dense points.
 */
export function filletPolyline(points, defaultRadius = TR.cornerRadius, step = 2) {
  const out = [];
  const pushLine = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  let [px, pz] = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz, r = defaultRadius] = points[i];
    const [cx, cz] = points[i + 1];
    let ux = bx - ax;
    let uz = bz - az;
    let vx = cx - bx;
    let vz = cz - bz;
    const lu = Math.hypot(ux, uz);
    const lv = Math.hypot(vx, vz);
    ux /= lu;
    uz /= lu;
    vx /= lv;
    vz /= lv;
    const turn = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz); // signed turn angle
    const t = Math.min(r * Math.tan(Math.abs(turn) / 2), lu * 0.48, lv * 0.48); // tangent length
    const rr = t / Math.tan(Math.abs(turn) / 2 || 1e-6);
    // Straight up to the start of the arc, then the arc around the corner.
    const sx = bx - ux * t;
    const sz = bz - uz * t;
    pushLine(px, pz, sx, sz);
    if (Math.abs(turn) > 1e-4) {
      const side = Math.sign(turn); // +: turning toward (−uz, ux)
      const ox = sx - uz * side * rr;
      const oz = sz + ux * side * rr;
      const a0 = Math.atan2(sz - oz, sx - ox);
      const n = Math.max(2, Math.ceil((Math.abs(turn) * rr) / step));
      for (let k = 1; k <= n; k++) {
        const a = a0 + (side * Math.abs(turn) * k) / n;
        out.push([ox + Math.cos(a) * rr, oz + Math.sin(a) * rr]);
      }
    }
    [px, pz] = out[out.length - 1];
  }
  const [ex, ez] = points[points.length - 1];
  pushLine(px, pz, ex, ez);
  return out;
}

/**
 * The ride track: straights joined by rounded corners (`filletPolyline` over
 * `CONFIG.track.points`), smoothed through a centripetal Catmull-Rom spline and sampled
 * every `sampleSpacing` units of arc length. Provides arc-length sampling, curvature, and
 * fast nearest-point queries (grid index) for the terrain, forest placement, gems,
 * obstacles, the horse's path assist and soft edges.
 */
export class Track {
  constructor(points = TR.points) {
    const dense = filletPolyline(points);
    const curve = new THREE.CatmullRomCurve3(
      dense.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    this.length = curve.getLength();
    const n = Math.max(2, Math.round(this.length / TR.sampleSpacing));
    this.n = n + 1;
    this.step = this.length / n;
    this.x = new Float32Array(this.n);
    this.z = new Float32Array(this.n);
    this.tx = new Float32Array(this.n);
    this.tz = new Float32Array(this.n);
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const u = i / n;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      const l = Math.hypot(t.x, t.z) || 1;
      this.x[i] = p.x;
      this.z[i] = p.z;
      this.tx[i] = t.x / l;
      this.tz[i] = t.z / l;
    }
    // Curvature (radians of heading change per unit length), smoothed over a few samples.
    this.k = new Float32Array(this.n);
    const w = Math.max(1, Math.round(4 / this.step));
    for (let i = 0; i < this.n; i++) {
      const a = Math.max(0, i - w);
      const b = Math.min(this.n - 1, i + w);
      const h0 = Math.atan2(this.tx[a], this.tz[a]);
      const h1 = Math.atan2(this.tx[b], this.tz[b]);
      this.k[i] = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))) / ((b - a) * this.step || 1);
    }
    // Grid index of sample indices.
    this.cell = TR.gridCell;
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const key = this.#key(Math.floor(this.x[i] / this.cell), Math.floor(this.z[i] / this.cell));
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(i);
    }
  }

  #key(cx, cz) {
    return cx * 73856093 + cz * 19349663;
  }

  /** Point and unit tangent at arc length s (clamped). */
  at(s) {
    const f = THREE.MathUtils.clamp(s / this.step, 0, this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    const u = f - i;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * u;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * u;
    const l = Math.hypot(tx, tz) || 1;
    return {
      x: this.x[i] + (this.x[i + 1] - this.x[i]) * u,
      z: this.z[i] + (this.z[i + 1] - this.z[i]) * u,
      tx: tx / l,
      tz: tz / l,
    };
  }

  /** Heading (yaw, facing +Z at 0) along the track at s. */
  headingAt(s) {
    const { tx, tz } = this.at(s);
    return Math.atan2(tx, tz);
  }

  /** Max curvature over [s0, s1] (rad / unit). */
  maxCurvature(s0, s1) {
    const a = Math.max(0, Math.floor(s0 / this.step));
    const b = Math.min(this.n - 1, Math.ceil(s1 / this.step));
    let m = 0;
    for (let i = a; i <= b; i++) m = Math.max(m, this.k[i]);
    return m;
  }

  /**
   * Nearest point on the track within `maxDist` (default: a couple of grid cells), or null.
   * Returns { s, dist, lateral (signed: + = right of travel), x, z, tx, tz }.
   */
  nearest(x, z, maxDist = this.cell * 1.5) {
    const r = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best = -1;
    let bestD2 = maxDist * maxDist;
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gz = cz - r; gz <= cz + r; gz++) {
        const list = this.grid.get(this.#key(gx, gz));
        if (!list) continue;
        for (const i of list) {
          const dx = x - this.x[i];
          const dz = z - this.z[i];
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
        }
      }
    }
    return best < 0 ? null : this.#refine(x, z, best);
  }

  /** Nearest point anywhere on the track (slow path; use for far-away queries only). */
  nearestGlobal(x, z) {
    let best = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d2 = (x - this.x[i]) ** 2 + (z - this.z[i]) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return this.#refine(x, z, best);
  }

  /** Distance to the track centre line (Infinity when farther than maxDist). */
  distance(x, z, maxDist) {
    return this.nearest(x, z, maxDist)?.dist ?? Infinity;
  }

  // Project onto the segments either side of sample i for a smooth s / lateral.
  #refine(x, z, i) {
    let best = null;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= this.n - 1) continue;
      const ax = this.x[j];
      const az = this.z[j];
      const bx = this.x[j + 1] - ax;
      const bz = this.z[j + 1] - az;
      const len2 = bx * bx + bz * bz || 1;
      const u = THREE.MathUtils.clamp(((x - ax) * bx + (z - az) * bz) / len2, 0, 1);
      const px = ax + bx * u;
      const pz = az + bz * u;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.dist) best = { j, u, px, pz, d };
    }
    if (!best) best = { j: i, u: 0, px: this.x[i], pz: this.z[i], d: Math.hypot(x - this.x[i], z - this.z[i]) };
    const s = (best.j + best.u) * this.step;
    const { tx, tz } = this.at(s);
    // Right of travel for heading (tx, tz) is (-tz, tx) in this world (see camera/hero maths).
    const lateral = (x - best.px) * -tz + (z - best.pz) * tx;
    return { s, dist: best.d, lateral, x: best.px, z: best.pz, tx, tz };
  }
}
