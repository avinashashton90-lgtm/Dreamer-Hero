import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadKitPieces, kitMaterial, mergeStatic, placeMatrix } from './kits.js';

// The castle at the end of Part 1 dressed in Kenney's Castle Kit (CC0; CONFIG.desert.castle.kit):
// the curtain wall, the gatehouse towers either side of the passage, the corner towers, the
// courtyard walls, the inner towers and the keep from the kit's wall and tower pieces (its own
// sandstone and slate), banners on the wall and flags on the towers, and both pairs of gate
// leaves cut from the kit's gate (one arched door split down the middle, each half on its old
// hinge). It only swaps what loadCastleModel() marked (`userData.kitSwap`) and fills the leaves'
// hinge groups: every size, place and hinge — the passage, the courtyard, the torches, the gate
// scene's framing and its gates shutting — stays exactly as it was. If a piece fails to load,
// nothing changes (the placeholder stays).

const DS = CONFIG.desert;
const KC = DS.castle.kit;

/** The kit's height of a piece (its bounds), cached on the geometry. */
function height(g) {
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox.max.y - g.boundingBox.min.y;
}

/**
 * Cuts a (non-indexed) geometry by the plane x = 0, keeping the side `keep` (−1: x ≤ 0, +1:
 * x ≥ 0); triangles across it are clipped (position, normal and uv interpolated).
 */
export function clipX(geo, keep) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const names = ['position', 'normal', 'uv'].filter((n) => g.attributes[n]);
  const out = Object.fromEntries(names.map((n) => [n, []]));
  const vert = (i) => Object.fromEntries(names.map((n) => [n, Array.from({ length: g.attributes[n].itemSize }, (_, k) => g.attributes[n].array[i * g.attributes[n].itemSize + k])]));
  const lerpV = (a, b, t) => Object.fromEntries(names.map((n) => [n, a[n].map((v, k) => v + (b[n][k] - v) * t)]));
  const push = (v) => names.forEach((n) => out[n].push(...v[n]));
  const side = (v) => v.position[0] * keep;
  for (let i = 0; i < g.attributes.position.count; i += 3) {
    const tri = [vert(i), vert(i + 1), vert(i + 2)];
    // (Sutherland–Hodgman against one plane)
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      const da = side(a);
      const db = side(b);
      if (da >= 0) poly.push(a);
      if ((da >= 0) !== (db >= 0)) poly.push(lerpV(a, b, da / (da - db)));
    }
    for (let k = 1; k + 1 < poly.length; k++) [poly[0], poly[k], poly[k + 1]].forEach(push);
  }
  const res = new THREE.BufferGeometry();
  for (const n of names) res.setAttribute(n, new THREE.Float32BufferAttribute(out[n], g.attributes[n].itemSize));
  return res;
}

/**
 * Dress `castle` (from loadCastleModel) in the Castle Kit. Resolves true when done, false if a
 * piece failed (the placeholder stays as it was).
 */
export async function applyCastleKit(castle, opts = {}) {
  if (castle.userData.kit) return true;
  const names = [...new Set([KC.wall, KC.gate, KC.banner, KC.flag, ...KC.square, ...KC.hexagon])];
  const P = await loadKitPieces('castle', names, opts);
  if (Object.values(P).some((g) => !g)) return false;
  const { H, W2, gw, depth, wallH, back, towers } = castle.userData.dims;
  const G = DS.castle.gate;
  const CY = DS.castle.courtyard;
  const items = [];
  const put = (geometry, pos, yaw, scale) => items.push({ geometry, matrix: placeMatrix({ pos, yaw, scale }) });
  const wallK = wallH / height(P[KC.wall]); // (the kit's wall, stretched to the curtain wall's height)
  // A run of wall tiles from a to b (centres along the line; `thick` deep, `h` high from `y`).
  const run = (ax, az, bx, bz, thick, h = wallH, y = 0) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / (KC.tile * wallK)));
    const yaw = Math.atan2(-(bz - az), bx - ax); // (the tile's x along the run)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      put(P[KC.wall], new THREE.Vector3(ax + (bx - ax) * t, y, az + (bz - az) * t), yaw, [len / n, h / height(P[KC.wall]), thick]);
    }
  };
  // The curtain wall either side of the passage, and over it.
  for (const side of [-1, 1]) run(side * gw, 0, side * W2, 0, depth);
  run(-gw, 0, gw, 0, depth, wallH - G.height, G.height);
  // A tower stack: base, middles, top / roof — `w` wide, its body `h` high, then the roof.
  const stack = ([base, mid, roof], x, z, w, h, d = w) => {
    const body = height(P[base]) + height(P[mid]) * KC.mids;
    const sy = h / body;
    let y = 0;
    put(P[base], new THREE.Vector3(x, y, z), 0, [w, sy, d]);
    y += height(P[base]) * sy;
    for (let i = 0; i < KC.mids; i++) {
      put(P[mid], new THREE.Vector3(x, y, z), 0, [w, sy, d]);
      y += height(P[mid]) * sy;
    }
    put(P[roof], new THREE.Vector3(x, y, z), 0, [w, w, d]);
    return y + height(P[roof]) * w;
  };
  const flags = [];
  // The gatehouse: two square towers either side of the passage, flush with the wall's faces.
  for (const side of [-1, 1]) {
    const top = stack(KC.square, side * (gw + KC.gatehouse.width / 2), 0, KC.gatehouse.width, wallH * KC.gatehouse.height, depth);
    flags.push([side * (gw + KC.gatehouse.width / 2), top, 0]);
  }
  // The corner towers, the inner towers and the keep (where the placeholder's stood).
  towers.forEach((t, i) => {
    const kind = i < 2 ? KC.hexagon : KC.square;
    const top = stack(kind, t.x, t.z, t.r * 2.2, t.h);
    flags.push([t.x, top, t.z]);
  });
  // The courtyard's walls.
  const zc0 = -depth / 2;
  for (const side of [-1, 1]) run(side * (CY.halfWidth + CY.wall / 2), zc0, side * (CY.halfWidth + CY.wall / 2), back, CY.wall);
  run(-(CY.halfWidth + CY.wall), back - CY.wall / 2, CY.halfWidth + CY.wall, back - CY.wall / 2, CY.wall);
  // Flags on the towers, banners on the wall's outer face either side of the gate.
  for (const [x, y, z] of flags) put(P[KC.flag], new THREE.Vector3(x, y - KC.flagSink, z), Math.PI / 2, KC.flagScale);
  for (const side of [-1, 1]) {
    const B = KC.banners;
    put(P[KC.banner], new THREE.Vector3(side * (gw + KC.gatehouse.width + B.x), wallH * B.top - height(P[KC.banner]) * B.scale, depth / 2 + 0.05), -Math.PI / 2, B.scale);
  }
  const mat = kitMaterial('castle', undefined, { fog: false });
  const kit = mergeStatic(items, mat, 'castleKit');
  castle.add(kit);
  // The gate leaves: the kit's arched gate, fitted to the passage's opening and cut in two —
  // each half replaces the placeholder leaf on its hinge (the gate scene swings the hinges).
  const gate = P[KC.gate].clone();
  gate.rotateY(Math.PI / 2); // (it faces ±x in the kit: turned to face the passage)
  gate.computeBoundingBox();
  const bb = gate.boundingBox;
  gate.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  gate.scale(G.width / (bb.max.x - bb.min.x), G.height / (bb.max.y - bb.min.y), (G.thickness * KC.leafThickness) / (bb.max.z - bb.min.z));
  const halves = { [-1]: clipX(gate, -1).translate(gw, 0, 0), [1]: clipX(gate, 1).translate(-gw, 0, 0) };
  for (const leaves of [castle.userData.gates, castle.userData.innerGates]) {
    for (const hinge of Object.values(leaves)) {
      const old = [...hinge.children];
      hinge.add(new THREE.Mesh(halves[hinge.userData.side], mat));
      for (const o of old) o.visible = false; // (kept: the placeholder leaf, hidden)
    }
  }
  for (const m of castle.userData.kitSwap) m.visible = false;
  castle.userData.kit = true;
  castle.userData.kitMesh = kit;
  return true;
}
