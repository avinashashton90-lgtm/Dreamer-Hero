import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadKitPieces, kitMaterial, mergeStatic, placeMatrix } from '../kits.js';

// A distant brass city on the horizon (CONFIG.part2.skyline): Castle Kit towers and walls tinted
// brass, with factory pipes and tall chimneys puffing slow steam — low detail, no collision,
// merged into a few meshes (one per quarter of the ring), the steam one additive InstancedMesh.
// If the Castle Kit fails, plain brass blocks and cones stand in.

const SK = CONFIG.part2.skyline;

/** A seeded random in [0, 1). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The skyline at `spots` ([{ x, z, face }]: each a cluster — a tower or two, a wall, a chimney —
 * facing `face` (yaw)). Returns a Group with `userData.update(dt)` (the steam) and `chimneys`.
 */
export async function loadSkylineModel(spots, opts = {}) {
  const T = SK.towers;
  const C = await loadKitPieces('castle', [...new Set([...T.square, ...T.hexagon, SK.wall])], opts);
  const F = await loadKitPieces('factory', [SK.pipe], opts);
  const kit = Object.values(C).every(Boolean);
  const rand = rng(SK.seed);
  const items = [];
  const chimneys = [];
  const fallback = [];
  const lerp = (a, b, t) => a + (b - a) * t;
  // (merged by quarter round the middle of the spots, so the far side culls)
  const mx = spots.reduce((a, p) => a + p.x, 0) / Math.max(1, spots.length);
  const mz = spots.reduce((a, p) => a + p.z, 0) / Math.max(1, spots.length);
  const chunk = (x, z) => (x > mx ? 1 : 0) + (z > mz ? 2 : 0);
  // (a stack of kit pieces: each sits on the one below — their heights in the kit's units)
  const stack = (names, x, z, yaw, s) => {
    let y = 0;
    for (const n of names) {
      const g = C[n];
      if (!g.boundingBox) g.computeBoundingBox();
      items.push({ geometry: g, matrix: placeMatrix({ pos: new THREE.Vector3(x, y, z), yaw, scale: s }), chunk: chunk(x, z) });
      y += (g.boundingBox.max.y - g.boundingBox.min.y) * s;
    }
    return y;
  };
  for (const spot of spots) {
    const s = lerp(SK.scale[0], SK.scale[1], rand());
    const side = new THREE.Vector3(Math.cos(spot.face), 0, -Math.sin(spot.face)); // (across the cluster)
    const tower = (off, k) => {
      const x = spot.x + side.x * off;
      const z = spot.z + side.z * off;
      const hex = rand() < SK.hexShare;
      const mids = Math.floor(lerp(T.mids[0], T.mids[1] + 1, rand()));
      if (!kit) {
        const h = (mids + 2) * s * k;
        fallback.push({ x, z, w: s * k, h });
        return h;
      }
      const set = hex ? T.hexagon : T.square;
      return stack([set[0], ...Array(mids).fill(set[1]), set[2]], x, z, spot.face, s * k);
    };
    tower(-s * 1.2, 1);
    if (rand() < SK.twinShare) tower(s * 1.4, 0.8);
    // A wall between them, a chimney beside, a pipe from it to the wall.
    if (kit) items.push({ geometry: C[SK.wall], matrix: placeMatrix({ pos: new THREE.Vector3(spot.x, 0, spot.z), yaw: spot.face, scale: [s * 1.6, s * 0.8, s * 0.6] }), chunk: chunk(spot.x, spot.z) });
    const ch = SK.chimney;
    const cx = spot.x + side.x * s * (2.6 + rand());
    const cz = spot.z + side.z * s * (2.6 + rand());
    const ch_h = lerp(ch.height[0], ch.height[1], rand()) * s;
    chimneys.push({ pos: new THREE.Vector3(cx, ch_h, cz), r: ch.radius * s, t: rand() * SK.steam.every });
    if (F[SK.pipe]) items.push({ geometry: F[SK.pipe], matrix: placeMatrix({ pos: new THREE.Vector3((cx + spot.x) / 2, s * 0.3, (cz + spot.z) / 2), yaw: spot.face, scale: [s * 0.8, s * 0.4, s * 0.4] }), chunk: chunk(spot.x, spot.z) });
  }
  const group = new THREE.Group();
  group.name = 'skyline';
  const fog = opts.fog ?? true;
  if (kit) {
    const merged = mergeStatic(items, kitMaterial('castle', 'skyline'), 'skylineKit');
    group.add(merged);
  } else if (fallback.length) {
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: SK.fallback, fog }), fallback.length);
    fallback.forEach((b, i) => blocks.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.w))));
    blocks.computeBoundingSphere();
    group.add(blocks);
  }
  // The chimneys (tapered brick-copper cylinders, one InstancedMesh) and their slow steam.
  const chim = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 1, 1, 8).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: SK.chimney.color, fog }), chimneys.length);
  chimneys.forEach((c, i) => chim.setMatrixAt(i, new THREE.Matrix4().compose(c.pos.clone().setY(0), new THREE.Quaternion(), new THREE.Vector3(c.r, c.pos.y, c.r))));
  chim.computeBoundingSphere();
  group.add(chim);
  const ST = SK.steam;
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ST.color, transparent: true, opacity: ST.opacity, depthWrite: false, fog }), chimneys.length * ST.perChimney);
  puffs.frustumCulled = false;
  group.add(puffs);
  const m = new THREE.Matrix4();
  const update = (dt) => {
    let n = 0;
    for (const c of chimneys) {
      c.t += dt;
      for (let k = 0; k < ST.perChimney; k++) {
        const age = ((c.t + (k * ST.life) / ST.perChimney) % ST.life) / ST.life;
        const size = c.r * (1 + age * ST.grow) * Math.sin(Math.PI * Math.min(1, age * 1.2));
        puffs.setMatrixAt(n++, m.makeScale(size, size, size).setPosition(c.pos.x + age * ST.drift[0], c.pos.y + age * ST.rise * c.r, c.pos.z + age * ST.drift[1]));
      }
    }
    puffs.count = n;
    puffs.instanceMatrix.needsUpdate = true;
  };
  update(0);
  group.userData = { update, chimneys, kit };
  return group;
}

/** Spots beside a trail: every `every` along it, alternating sides `lat` out, never within `minClear` of the trail. */
export function trailSpots(track, { every, lat, minClear }, seed = SK.seed) {
  const rand = rng(seed + 2);
  const out = [];
  for (let s = every / 2, i = 0; s < track.length; s += every, i++) {
    const side = i % 2 ? 1 : -1;
    const p = track.at(s);
    const l = side * (lat[0] + rand() * (lat[1] - lat[0]));
    const x = p.x - p.tz * l;
    const z = p.z + p.tx * l;
    const n = track.nearest(x, z, minClear);
    if (n && n.dist < minClear) continue;
    out.push({ x, z, face: Math.atan2(p.x - x, p.z - z) });
  }
  return out;
}

/** Spots in a ring round (cx, cz): `count` clusters `radius` [min, max] out, each facing the centre. */
export function ringSpots(cx, cz, count, radius, seed = SK.seed) {
  const rand = rng(seed + 1);
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3;
    const r = radius[0] + rand() * (radius[1] - radius[0]);
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    return { x, z, face: Math.atan2(cx - x, cz - z) };
  });
}
