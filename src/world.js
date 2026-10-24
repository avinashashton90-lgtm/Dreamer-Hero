import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planHurdles } from './hurdles.js';
import { CONFIG } from './config.js';
import { Track } from './track.js';

const W = CONFIG.world;
const Z = CONFIG.zones;
const R = CONFIG.rooftops;
const T = CONFIG.treeRoute;
const F = CONFIG.forest;
const CV = CONFIG.cave;
const SKY = CONFIG.sky;
const WATER = CONFIG.water;
const FOL = CONFIG.foliage;
const TR = CONFIG.track;
const DS = CONFIG.desert;

const { smoothstep, lerp, clamp } = THREE.MathUtils;

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  next.range = (a, b) => a + (b - a) * next();
  return next;
}

export function riverCenterX(z) {
  return Z.riverX + Z.riverMeander * Math.sin(z * Z.riverFrequency);
}

/**
 * A horizontal walkable beam from (x0,z0) to (x1,z1) whose flat top is at `top`, with a
 * half width tapering from hw0 to hw1. Used for branches (ground + wall collision).
 */
export function makeBeam(x0, z0, x1, z1, top, hw0, hw1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  return { x0, z0, x1, z1, len, ux: (x1 - x0) / len, uz: (z1 - z0) / len, top, hw0, hw1, bottom: top - 2 * hw0 };
}

// ---------------------------------------------------------------------------
// Layout: the jumpable route (rooftops then tree branches), generated so every
// gap is within the hero's jump reach (see CONFIG.rooftops / CONFIG.treeRoute).
// ---------------------------------------------------------------------------

export function generateLayout(seed = W.seed) {
  const rnd = makeRng(seed);
  const roofs = [];
  let x = R.startX;
  let h = R.startHeight;
  let z = 0;
  let gap = 0;
  for (let i = 0; i < R.count; i++) {
    const w = rnd.range(R.widthMin, R.widthMax);
    const d = rnd.range(R.depthMin, R.depthMax);
    z = clamp(z + rnd.range(-R.zWiggle, R.zWiggle), -R.zWiggle * 2, R.zWiggle * 2);
    roofs.push({ minX: x, maxX: x + w, minZ: z - d / 2, maxZ: z + d / 2, height: h, top: h + R.ledge, route: true });
    const nextH = clamp(h + rnd.range(R.stepMin, R.stepMax), R.minHeight, R.maxHeight);
    gap = rnd.range(R.gapMin, nextH > h ? R.gapUpMax : R.gapMax);
    x += w + gap;
    h = nextH;
  }
  const townEndX = x - gap / 2;

  // Tree route: each platform is a straight, horizontal, tapering limb from a wide base
  // (facing the previous platform) to a narrow tip (facing the next one).
  const branches = [];
  const startTop = Math.min(h, roofs[roofs.length - 1].top); // never jump up into the trees
  for (let i = 0; i < T.count; i++) {
    const r = rnd.range(T.halfLengthMin, T.halfLengthMax);
    z = clamp(z + rnd.range(-T.zWiggle, T.zWiggle), -T.zWiggle * 2, T.zWiggle * 2);
    const top = lerp(startTop, T.endHeight, i / (T.count - 1));
    branches.push({ x: x + r, z, r, top, side: i % 2 ? 1 : -1, route: true });
    x += 2 * r + rnd.range(T.gapMin, T.gapMax);
  }
  const lastRoof = roofs[roofs.length - 1];
  branches.forEach((b, i) => {
    const prev = branches[i - 1] ?? { x: (lastRoof.minX + lastRoof.maxX) / 2, z: (lastRoof.minZ + lastRoof.maxZ) / 2 };
    const next = branches[i + 1] ?? { x: b.x + b.r + 6, z: b.z };
    const len = Math.hypot(next.x - prev.x, next.z - prev.z);
    b.dx = (next.x - prev.x) / len;
    b.dz = (next.z - prev.z) / len;
    Object.assign(b, makeBeam(b.x - b.dx * b.r, b.z - b.dz * b.r, b.x + b.dx * b.r, b.z + b.dz * b.r, b.top, T.baseHalfWidth, T.tipHalfWidth));
    // Trunk beside the base of the limb; a short thick elbow joins them.
    b.trunkX = b.x0 - b.dz * b.side * T.trunkOffset;
    b.trunkZ = b.z0 + b.dx * b.side * T.trunkOffset;
  });
  const lastBranch = branches[branches.length - 1];
  const hazardEndX = lastBranch.x; // town streets and the swamp under the trees end here

  // Decorative filler buildings around the rooftop route (also standable).
  const fillers = [];
  for (let tries = 0; fillers.length < R.fillerCount && tries < R.fillerCount * 30; tries++) {
    const w = rnd.range(R.widthMin, R.widthMax * 1.4);
    const d = rnd.range(R.depthMin, R.depthMax * 1.3);
    const fx = rnd.range(-W.width / 2 + 2, townEndX - w);
    const fz = rnd.range(-W.depth / 2 + 4, W.depth / 2 - 4);
    if (Math.abs(fz) < R.fillerClearance + d / 2 + R.zWiggle * 2) continue;
    const b = { minX: fx, maxX: fx + w, minZ: fz - d / 2, maxZ: fz + d / 2 };
    const overlaps = fillers.some(
      (o) => b.minX < o.maxX + 1 && b.maxX > o.minX - 1 && b.minZ < o.maxZ + 1 && b.maxZ > o.minZ - 1,
    );
    if (overlaps) continue;
    const height = rnd.range(R.fillerHeightMin, R.fillerHeightMax);
    fillers.push({ ...b, height, top: height + R.ledge, route: false });
  }

  return { roofs, fillers, branches, townEndX, hazardEndX, rnd };
}

// ---------------------------------------------------------------------------
// Terrain height (analytic, so physics never needs a raycast)
// ---------------------------------------------------------------------------

/** True inside the original town / swamp region (south of the ridge). */
export function inSouthRegion(z) {
  return z < W.ridge.z[0] + 22;
}

/** Smooth 2D value noise in 0..1 (hash on the integer lattice, smoothstep blend). */
function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const hash = (a, b) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = lerp(hash(ix, iz), hash(ix + 1, iz), u);
  const b = lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u);
  return lerp(a, b, v);
}

/** Desert dune height: octaves of value noise, [[wavelength, height], ...]. */
export function duneHeight(x, z, octaves) {
  let h = 0;
  for (const [wave, height] of octaves) h += height * valueNoise(x / wave + 31.7, z / wave - 12.3);
  return h;
}

export function createHeightFn(layout, track, desertTrack) {
  // Level spots (the Lazarus Pit): { x, z, y, r0, r1 }, filled in after the layout is known.
  const flats = [];
  const heightAt = function heightAt(x, z) {
    // Base: gentle forest/meadow hills everywhere...
    let h =
      Z.forestHillHeight *
      (0.5 + 0.5 * Math.sin(x * Z.forestHillScale) * Math.cos(z * Z.forestHillScale * 1.3));
    // ...but the original map keeps its zones (sand bank, cave floor, desert behind the cliff).
    const south = 1 - smoothstep(z, W.ridge.z[0] + 17, W.ridge.z[1]);
    h = lerp(h, Z.sandHeight, (1 - smoothstep(x, Z.forestStart - 3, Z.forestStart + 3)) * south);
    h = lerp(h, 0, smoothstep(x, Z.caveStart - 4, Z.caveStart + 4) * (1 - smoothstep(z, 70, 90)));
    const desertH =
      Z.desertDuneHeight * (0.5 + 0.5 * Math.sin(x * Z.desertDuneScale + Math.sin(z * Z.desertDuneScale * 2)));
    h = lerp(h, desertH, smoothstep(x, Z.desertStart - 4, Z.desertStart + 4) * (1 - smoothstep(z, 100, 115)));
    // Town streets and swamp are flat at 0.
    h = lerp(h, 0, (1 - smoothstep(x, layout.hazardEndX - 0.5, layout.hazardEndX + 2)) * south);

    // Hills on the ride (a climb, then a long descent).
    for (const hill of TR.hills) {
      const d2 = (x - hill.x) ** 2 + (z - hill.z) ** 2;
      h += hill.height * Math.exp(-d2 / (hill.radius * hill.radius));
    }

    // River channel: shallow everywhere, shallower still at the ford where the trail crosses.
    const dr = Math.abs(x - riverCenterX(z));
    if (dr < Z.riverHalfWidth + 1) {
      const near = track.nearest(x, z, TR.fordReach + 4);
      const ford = near ? 1 - smoothstep(near.dist, TR.fordReach - 2, TR.fordReach + 2) : 0;
      h = lerp(lerp(Z.riverBedY, Z.fordBedY, ford), h, smoothstep(dr, Z.riverHalfWidth - 2, Z.riverHalfWidth + 1));
    }

    // The desert beyond the cliffs: rolling dunes, smoothed to gentle rolls along its trail.
    const desert = smoothstep(x, DS.startX - 10, DS.startX + 10);
    if (desert > 0) {
      let hD = duneHeight(x, z, DS.dunes);
      const near = desertTrack?.nearest(x, z, DS.trailBlend[1] + 2);
      if (near) hD = lerp(hD, duneHeight(x, z, DS.trailDunes), 1 - smoothstep(near.dist, DS.trailBlend[0], DS.trailBlend[1]));
      h = lerp(h, hD, desert);
    }

    // Boundary hills keep the player inside the map; a ridge closes the swamp off to the north,
    // and another runs between the forest/cliffs and the desert.
    const edge = Math.max(
      smoothstep(-z, -(W.zMin + 22), -W.zMin),
      smoothstep(z, W.zMax - 22, W.zMax),
      smoothstep(-x, -(W.xMin + 10), -W.xMin),
      smoothstep(x, W.xMax - 22, W.xMax),
      smoothstep(x, DS.ridge.from, DS.ridge.top) * (1 - smoothstep(x, DS.ridge.top, DS.ridge.to)),
      smoothstep(z, W.ridge.z[0], W.ridge.z[0] + 14) * (1 - smoothstep(z, W.ridge.z[1] - 12, W.ridge.z[1])) * (1 - smoothstep(x, W.ridge.x - 6, W.ridge.x + 4)),
    );
    h += edge * W.edgeHillHeight * (0.7 + 0.3 * Math.sin(x * 0.11 + z * 0.07));

    // Flat floor in front of and inside the giant cave mouth (no dunes poking into the tunnel).
    const [ax, az] = CV.archPosition;
    const tunnelEnd = ax + CV.tunnelDepth;
    const cave = smoothstep(x, ax - 6, ax) * (1 - smoothstep(x, tunnelEnd, tunnelEnd + 8)) * (1 - smoothstep(Math.abs(z - az), CV.archRadius - 1, CV.archRadius + 4));
    h = lerp(h, 0, cave);
    for (const f of flats) h = lerp(h, f.y, 1 - smoothstep(Math.hypot(x - f.x, z - f.z), f.r0, f.r1));
    return h;
  };
  heightAt.flats = flats;
  return heightAt;
}

// ---------------------------------------------------------------------------
// Swappable placeholder models
// ---------------------------------------------------------------------------

/** Placeholder terrain: one vertex-coloured grid. Keep heightAt() in sync if swapped. */
export async function loadTerrainModel(heightAt, layout, track) {
  const depth = W.zMax - W.zMin;
  const geo = new THREE.PlaneGeometry(W.width, depth, W.segmentsX, W.segmentsZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (W.zMin + W.zMax) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const C = Object.fromEntries(Object.entries(W.colors).map(([k, v]) => [k, new THREE.Color(v)]));
  const dirt = new THREE.Color(TR.dirtColor);
  const rim = new THREE.Color(TR.rimColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const south = inSouthRegion(z);
    const swampOrTown = south && x < layout.hazardEndX;
    if (south && x < layout.townEndX) c.copy(C.street);
    else if (swampOrTown) c.copy(C.swamp);
    else if (south && x < Z.forestStart) c.copy(C.sand);
    else if (x >= Z.caveStart && z < 75 && x < Z.desertStart) c.copy(C.rock);
    else if (x >= Z.desertStart && z < 110) c.copy(C.desert);
    else c.copy(C.grass);
    // Sandy banks along the whole river.
    if (!swampOrTown) c.lerp(C.sand, 1 - smoothstep(Math.abs(x - riverCenterX(z)), Z.riverHalfWidth + 3, Z.riverHalfWidth + 7));
    if (y > 3 && !swampOrTown) c.lerp(C.rock, smoothstep(y, south ? 3 : 10, south ? 12 : 17)); // boundary hills
    // The ride trail: dirt with a slightly darker rim.
    const near = track.nearest(x, z, TR.halfWidth + 3);
    if (near) {
      c.lerp(rim, 1 - smoothstep(near.dist, TR.halfWidth + 0.5, TR.halfWidth + 2.5));
      c.lerp(dirt, 1 - smoothstep(near.dist, TR.halfWidth - 1.5, TR.halfWidth + 0.5));
    }
    if (y < Z.riverBedY + 0.6 && !swampOrTown) c.copy(C.riverBed);
    c.offsetHSL(0, 0, Math.sin(x * 1.7 + z * 2.3) * 0.015);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Placeholder desert terrain (east of the main grid): vertex-coloured dunes and the trail. */
export async function loadDesertTerrainModel(heightAt, desertTrack) {
  const x0 = W.width / 2;
  const width = W.xMax - x0;
  const depth = W.zMax - W.zMin;
  const geo = new THREE.PlaneGeometry(width, depth, Math.round(width / DS.terrainStep), Math.round(depth / DS.terrainStep));
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + width / 2, 0, (W.zMin + W.zMax) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const C = Object.fromEntries(Object.entries(DS.colors).map(([k, v]) => [k, new THREE.Color(v)]));
  const grass = new THREE.Color(W.colors.grass);
  const rock = new THREE.Color(W.colors.rock);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    // Dune crests lighter, hollows darker; grass fading out over the ridge.
    c.copy(C.shade).lerp(C.sand, smoothstep(y, 1, 6)).lerp(C.dune, 0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.05) * 0.4);
    c.lerp(grass, 1 - smoothstep(x, DS.ridge.from + 4, DS.startX));
    if (y > 9) c.lerp(rock, smoothstep(y, 9, 16));
    const near = desertTrack.nearest(x, z, TR.halfWidth + 3);
    if (near) {
      c.lerp(C.rim, 1 - smoothstep(near.dist, TR.halfWidth + 0.5, TR.halfWidth + 2.5));
      c.lerp(C.trail, 1 - smoothstep(near.dist, TR.halfWidth - 1.5, TR.halfWidth + 0.5));
    }
    c.offsetHSL(0, 0, Math.sin(x * 1.3 + z * 2.1) * 0.012);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Placeholder desert scenery (instanced): saguaro cacti, sandstone rocks, trail-edge pebbles and dry tufts. */
export async function loadDesertSceneryModels(counts) {
  const cactusGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.28, 0.32, 3, 7).translate(0, 1.5, 0),
    new THREE.SphereGeometry(0.28, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 3, 0),
    new THREE.CylinderGeometry(0.17, 0.17, 0.8, 6).rotateZ(Math.PI / 2).translate(0.5, 1.4, 0),
    new THREE.CylinderGeometry(0.17, 0.17, 1.1, 6).translate(0.85, 1.9, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.6, 6).rotateZ(Math.PI / 2).translate(-0.42, 1.9, 0),
    new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6).translate(-0.68, 2.25, 0),
  ]);
  const mk = (geo, color, n) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }), Math.max(1, n));
    m.count = n;
    return m;
  };
  return {
    cacti: mk(cactusGeo, DS.cacti.color, counts.cacti),
    rocks: mk(new THREE.DodecahedronGeometry(1, 0), DS.rocks.color, counts.rocks),
    pebbles: mk(new THREE.DodecahedronGeometry(1, 0), DS.edge.rockColor, counts.pebbles),
    tufts: mk(new THREE.ConeGeometry(1, 1.2, 5).translate(0, 0.6, 0), DS.edge.tuftColor, counts.tufts),
  };
}

/**
 * Placeholder castle on the horizon (swap for a glTF later): a dark silhouette of walls,
 * towers with pointed roofs and lit windows. Unfogged so it reads from across the desert.
 */
export async function loadCastleModel() {
  const H = DS.castle.height;
  const dark = new THREE.MeshBasicMaterial({ color: DS.castle.color, fog: false });
  const glow = new THREE.MeshBasicMaterial({ color: DS.castle.glow, fog: false });
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  // Curtain wall with a gate passage through it (the horse rides in at the castle-gate scene).
  const G = DS.castle.gate;
  const W2 = H * 0.45;
  const gw = G.width / 2;
  const depth = H * 0.25;
  const wallH = H * 0.32;
  add(new THREE.BoxGeometry(W2 - gw, wallH, depth), dark, -(gw + (W2 - gw) / 2), wallH / 2, 0);
  add(new THREE.BoxGeometry(W2 - gw, wallH, depth), dark, gw + (W2 - gw) / 2, wallH / 2, 0);
  add(new THREE.BoxGeometry(G.width, wallH - G.height, depth), dark, 0, G.height + (wallH - G.height) / 2, 0); // over the passage
  // The dark passage (its sides and roof; it opens into the courtyard behind the wall).
  const tunnel = new THREE.MeshBasicMaterial({ color: G.passageColor, fog: false, side: THREE.DoubleSide });
  for (const side of [-1, 1]) add(new THREE.PlaneGeometry(depth * 0.98, G.height).rotateY(Math.PI / 2), tunnel, side * G.width * 0.49, G.height / 2, 0);
  add(new THREE.PlaneGeometry(G.width, depth * 0.98).rotateX(Math.PI / 2), tunnel, 0, G.height * 0.99, 0);
  for (let i = 0; i < 13; i++) add(new THREE.BoxGeometry(H * 0.04, H * 0.05, H * 0.26), dark, -H * 0.42 + i * H * 0.07, H * 0.345, 0); // battlements
  // The courtyard behind it: a stone floor, walls round it (lit, so it reads up close).
  const CY = DS.castle.courtyard;
  const back = -depth / 2 - CY.depth;
  const sand = new THREE.MeshLambertMaterial({ color: CY.floorColor });
  const inner = new THREE.MeshLambertMaterial({ color: CY.wallColor });
  add(new THREE.BoxGeometry(CY.halfWidth * 2, 0.4, CY.depth), sand, 0, -0.18, -depth / 2 - CY.depth / 2);
  // Desert ground: low sand drifts along its side and back walls (the middle and the gate stay clear).
  const D = CY.drifts;
  const drift = new THREE.MeshLambertMaterial({ color: D.color });
  const mound = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < D.count; i++) {
    const r = THREE.MathUtils.lerp(D.size[0], D.size[1], (i * 0.618) % 1);
    const h = THREE.MathUtils.lerp(D.height[0], D.height[1], (i * 0.382) % 1);
    // (spread round the left side, the back and the right side: never in the gate's half)
    const u = i / (D.count - 1);
    const z = (k) => -depth / 2 - CY.depth * k;
    const [x, zz] = u < 0.3 ? [-CY.halfWidth + r * 0.6, z(0.55 + u * 1.4)]
      : u > 0.7 ? [CY.halfWidth - r * 0.6, z(0.55 + (1 - u) * 1.4)]
      : [(u - 0.5) * CY.halfWidth * 4, back + r * 0.6];
    const m = add(mound, drift, x, 0, zz);
    m.scale.set(r, h, r * 0.7);
  }
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(CY.wall, wallH, CY.depth), inner, side * (CY.halfWidth + CY.wall / 2), wallH / 2, -depth / 2 - CY.depth / 2);
  add(new THREE.BoxGeometry(CY.halfWidth * 2 + CY.wall * 2, wallH, CY.wall), inner, 0, wallH / 2, back - CY.wall / 2);
  const zIn = back / H; // (the inner towers and the keep stand behind the courtyard)
  for (const [x, z, k] of [[-0.45, 0, 0.55], [0.45, 0, 0.55], [-0.4, zIn, 0.75], [0.4, zIn, 0.7], [0, zIn - 0.13, 1]]) {
    const r = H * 0.07 * (0.8 + k * 0.4);
    const h = H * k;
    add(new THREE.CylinderGeometry(r, r * 1.1, h, 10), dark, x * H, h / 2, z * H);
    add(new THREE.ConeGeometry(r * 1.35, H * 0.22, 10), dark, x * H, h + H * 0.11, z * H);
    add(new THREE.BoxGeometry(r * 0.35, r * 0.6, 0.2), glow, x * H, h * 0.8, z * H + r * 1.02);
  }
  // The curtain wall's inner face round the passage: lit stone, an arch frame, so the closed
  // inner gates read as the backdrop of the last scene (from the courtyard).
  const face = new THREE.MeshLambertMaterial({ color: CY.innerFace });
  const trim = new THREE.MeshLambertMaterial({ color: CY.trim });
  const zi = -depth / 2 - 0.06;
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(W2 - gw, wallH, 0.12), face, side * (gw + (W2 - gw) / 2), wallH / 2, zi);
  add(new THREE.BoxGeometry(G.width, wallH - G.height, 0.12), face, 0, G.height + (wallH - G.height) / 2, zi);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.7, G.height + 0.7, 0.5), trim, side * (gw + 0.35), (G.height + 0.7) / 2, zi - 0.2);
  add(new THREE.BoxGeometry(G.width + 1.4, 0.7, 0.5), trim, 0, G.height + 0.35, zi - 0.2);
  // Torches either side of the passage on both faces (additive flames and halos; flickered by
  // CastleGate.update through userData.torches).
  const T = DS.castle.torches;
  const iron = new THREE.MeshLambertMaterial({ color: T.iron });
  const bowl = new THREE.MeshLambertMaterial({ color: T.bowl });
  const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flameMat = glowMat(T.flame, 0.85);
  const coreMat = glowMat(T.core, 0.9);
  const haloMat = glowMat(T.halo, T.haloOpacity);
  const haloOuter = glowMat(T.halo, T.haloOpacity * 0.35);
  const torches = [];
  for (const facing of [1, -1]) {
    for (const side of [-1, 1]) {
      const torch = new THREE.Group();
      torch.position.set(side * T.x, T.y, facing * (depth / 2 + T.out));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, T.out + 0.1), iron);
      arm.position.set(0, -0.35, -facing * T.out / 2);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.7, 6), iron);
      post.position.y = -0.35;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.12, 0.26, 8), bowl);
      cup.position.y = 0.02;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 8).translate(0, 0.375, 0), flameMat);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 6).translate(0, 0.21, 0), coreMat);
      flame.position.y = core.position.y = 0.12;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(T.haloSize * 0.45, 10, 8), haloMat);
      const haloBig = new THREE.Mesh(new THREE.SphereGeometry(T.haloSize, 10, 8), haloOuter);
      halo.position.y = haloBig.position.y = 0.45;
      torch.add(arm, post, cup, flame, core, halo, haloBig);
      group.add(torch);
      torches.push({ torch, flame, core, halo, phase: torches.length * 1.7 });
    }
  }
  group.userData.torches = torches;
  // The inner gate leaves (the courtyard side of the passage): open while the horse rides in,
  // they swing shut behind it (story: the portal scene) — swappable like the outer ones.
  const IG = DS.castle.innerGate;
  const innerLeaf = (side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * gw, 0, -depth / 2 - 0.3);
    const mat = new THREE.MeshLambertMaterial({ color: IG.color });
    const band = new THREE.MeshLambertMaterial({ color: IG.bandColor });
    hinge.add(new THREE.Mesh(new THREE.BoxGeometry(gw, G.height, G.thickness).translate(-side * gw / 2, G.height / 2, 0), mat));
    for (const k of [0.22, 0.5, 0.78]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.96, G.height * 0.05, G.thickness * 1.4).translate(-side * gw / 2, G.height * k, 0), band);
      hinge.add(b);
    }
    for (const k of [0.3, 0.7]) { // (studs)
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), band);
      stud.position.set(-side * gw * 0.15, G.height * k, -G.thickness * 0.6);
      hinge.add(stud);
    }
    hinge.userData.side = side;
    hinge.rotation.y = -side * IG.open; // (open: into the courtyard)
    group.add(hinge);
    return hinge;
  };
  group.userData.innerGates = { left: innerLeaf(-1), right: innerLeaf(1) };
  group.userData.innerGateLocal = new THREE.Vector3(0, 0, -depth / 2); // the passage's inner opening (castle-local)
  // The gates: two separate leaves hinged at the passage's sides on its outer face (swappable
  // parts: a real castle model can hand its own leaves to the gate scene through userData.gates).
  const leaf = (side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * gw, 0, depth / 2 + 0.05);
    const door = new THREE.Mesh(new THREE.BoxGeometry(gw, G.height, G.thickness).translate(-side * gw / 2, G.height / 2, 0), new THREE.MeshBasicMaterial({ color: G.color, fog: false }));
    const bands = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.96, G.height * 0.06, G.thickness * 1.4).translate(-side * gw / 2, 0, 0), new THREE.MeshBasicMaterial({ color: G.bandColor, fog: false }));
    for (const k of [0.25, 0.7]) {
      const b = bands.clone();
      b.position.y = G.height * k;
      hinge.add(b);
    }
    hinge.add(door);
    hinge.userData.side = side; // −1 left, +1 right; opens inward by rotating −side × openAngle
    group.add(hinge);
    return hinge;
  };
  group.userData.gates = { left: leaf(-1), right: leaf(1) };
  group.userData.gateLocal = new THREE.Vector3(0, 0, depth / 2); // the passage's outer opening (castle-local)
  group.userData.insideLocal = new THREE.Vector3(0, 0, -depth / 2 + G.insideStop); // where the riders stop inside
  group.userData.courtyardLocal = new THREE.Vector3(0, 0, -depth / 2 - CY.depth / 2); // the courtyard's centre (Part 1's last scene)
  // A warm glow over the gate (seen through the sandstorm).
  add(new THREE.BoxGeometry(G.width * 1.2, H * 0.03, 0.3), glow, 0, G.height + H * 0.02, depth / 2 + 0.1);
  return group;
}

/** Lambert material that paints a window grid on vertical faces, in world space, so
 *  differently sized instances share one material without stretched windows. */
function makeBuildingMaterial() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const windowColor = new THREE.Color(R.windowColor);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.windowColor = { value: windowColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBWorld;\nvarying vec3 vBNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 bw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          bw = instanceMatrix * bw;
        #endif
        vBWorld = (modelMatrix * bw).xyz;
        vBNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 windowColor;\nvarying vec3 vBWorld;\nvarying vec3 vBNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (abs(vBNormal.y) < 0.5 && vBWorld.y > 1.2) {
          float along = abs(vBNormal.x) > 0.5 ? vBWorld.z : vBWorld.x;
          vec2 cell = fract(vec2(along / 2.2, vBWorld.y / 2.6));
          float win = step(0.3, cell.x) * step(cell.x, 0.75) * step(0.35, cell.y) * step(cell.y, 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb, windowColor, win * 0.85);
        }`,
      );
  };
  return mat;
}

/** Placeholder buildings (instanced). Each entry: {minX,maxX,minZ,maxZ,height}. */
export async function loadBuildingModels(buildings) {
  const n = buildings.length;
  const body = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(body, makeBuildingMaterial(), n);
  const roofs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), // tinted per instance
    n,
  );
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  buildings.forEach((b, i) => {
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    m.makeScale(w, b.height, d).setPosition(cx, 0, cz);
    walls.setMatrixAt(i, m);
    walls.setColorAt(i, col.setHex(R.colors[i % R.colors.length]));
    m.makeScale(w + 0.3, R.ledge, d + 0.3).setPosition(cx, b.height, cz);
    roofs.setMatrixAt(i, m);
    // Route roofs get a brighter cap so the path reads at a glance.
    roofs.setColorAt(i, col.setHex(b.route ? R.routeRoofColor : R.roofColor));
  });
  const group = new THREE.Group();
  group.add(walls, roofs);
  return group;
}

// --- Trees -------------------------------------------------------------------

/**
 * Lambert material with a per-instance opacity (`instanceFade` attribute, 0..1) — used for
 * foliage that fades out of the camera's way, and for dust puffs.
 */
export function makeFadeMaterial(params = {}) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = instanceFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  return mat;
}

/** Adds an all-ones `instanceFade` attribute for `count` instances; returns it. */
export function addFadeAttribute(geometry, count) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceFade', attr);
  return attr;
}

/** Converts to non-indexed and fills a vertex colour attribute (fn(x,y,z) → THREE.Color). */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (typeof color === 'function') color(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    else c.set(color);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Unit giant-tree trunk: height 1, radius ≈1 around branch level, base at y=0. Tapers
 * upward, bows along +X (T.trunkBend radii at mid height), flares into five root
 * buttresses at the base, with bark streaks in vertex colours.
 */
function makeTrunkGeometry() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 14, true).translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const bark = new THREE.Color(T.barkColor);
  const dark = new THREE.Color(T.barkDark);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.pow(pos.getY(i), 1.7); // more rings near the roots
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const low = 1 - h;
    let r = lerp(1.25, 0.7, h) * (1 + 1.3 * low ** 8) + 0.9 * low ** 7 * Math.max(0, Math.cos(a * 5));
    r *= 1 + 0.05 * Math.sin(a * 3 + h * 9);
    pos.setXYZ(i, Math.cos(a) * r + trunkBendAt(h), h, Math.sin(a) * r);
    const streak = 0.5 + 0.5 * Math.sin(a * 9 + Math.sin(h * 23) * 1.5);
    c.copy(bark).lerp(dark, streak * 0.5 + low ** 5 * 0.4);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Sideways bow of the unit trunk axis at normalised height h (in trunk radii, along +X). */
export function trunkBendAt(h) {
  return T.trunkBend * Math.sin(Math.PI * h);
}

const barkPaint = (x, y, z, c) =>
  c.set(T.barkColor).lerp(new THREE.Color(T.barkDark), 0.25 + 0.25 * Math.sin(y * 7 + Math.atan2(z, x) * 5));

/**
 * Placeholder giant trees for the tree-leaping zone (all instanced). `plan` lists parts:
 *  trunks:  {x, y, z, radius, height, rotY}
 *  beams:   {from, to, radius, kind: 'limb'|'elbow'|'twig'}  (from = thick end)
 *  knots:   {p, radius}
 *  leaves:  {p, scale: Vector3, shade}
 */
export async function loadGiantTreeModels(plan) {
  const barkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Foliage gets its own transparent material with a per-instance fade (see World.updateFoliage).
  const leafMat = makeFadeMaterial({ flatShading: true });
  const geos = {
    limb: paint(new THREE.CylinderGeometry(T.tipHalfWidth / T.baseHalfWidth, 1, 1, 10, 1).translate(0, 0.5, 0), barkPaint),
    elbow: paint(new THREE.CylinderGeometry(0.85, 1, 1, 10, 1).translate(0, 0.5, 0), barkPaint),
    twig: paint(new THREE.CylinderGeometry(0.25, 1, 1, 6, 1).translate(0, 0.5, 0), barkPaint),
  };
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const trunks = new THREE.InstancedMesh(makeTrunkGeometry(), barkMat, plan.trunks.length);
  const tint = new THREE.Color();
  plan.trunks.forEach((t, i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rotY);
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, t.y, t.z), q, s.set(t.radius, t.height, t.radius)));
    trunks.setColorAt(i, tint.setScalar(0.9 + 0.2 * ((i * 0.618) % 1)));
  });
  group.add(trunks);

  for (const kind of ['limb', 'elbow', 'twig']) {
    const list = plan.beams.filter((b) => b.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geos[kind], barkMat, list.length);
    list.forEach((b, i) => {
      dir.subVectors(b.to, b.from);
      const len = dir.length();
      q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir.divideScalar(len));
      mesh.setMatrixAt(i, m.compose(b.from, q, s.set(b.radius, len, b.radius)));
    });
    group.add(mesh);
  }

  const knots = new THREE.InstancedMesh(paint(new THREE.IcosahedronGeometry(1, 1), barkPaint), barkMat, plan.knots.length);
  plan.knots.forEach((k, i) => knots.setMatrixAt(i, m.compose(k.p, q.identity(), s.setScalar(k.radius))));
  group.add(knots);

  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  addFadeAttribute(leafGeo, plan.leaves.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, plan.leaves.length);
  leaves.renderOrder = 10; // after other transparent things, so faded leaves never hide them
  const col = new THREE.Color();
  plan.leaves.forEach((l, i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 2.4);
    leaves.setMatrixAt(i, m.compose(l.p, q, l.scale));
    leaves.setColorAt(i, col.setHex(T.leafColors[l.shade % T.leafColors.length]));
  });
  group.add(leaves);
  group.userData.leaves = leaves;
  return group;
}

/**
 * Placeholder forest trees: three species (conifer, broadleaf, birch). Each species is a
 * merged, vertex-coloured trunk + crown; `instance(n)` makes a fresh pair of InstancedMeshes
 * (solid trunks, fadeable crowns) sharing the geometry — one pair per forest chunk. Also
 * returns the collider radius / height at scale 1 and the crown's local bounding sphere.
 */
export async function loadForestTreeModels() {
  const trunkBrown = 0x5e3d24;
  const species = [
    {
      // Conifer: three stacked cones.
      parts: [
        paint(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6).translate(0, 0.9, 0), trunkBrown),
        paint(new THREE.ConeGeometry(1.8, 2.4, 8).translate(0, 2.3, 0), 0x2b6a38),
        paint(new THREE.ConeGeometry(1.4, 2.1, 8).translate(0, 3.5, 0), 0x2f7840),
        paint(new THREE.ConeGeometry(0.95, 1.7, 8).translate(0, 4.6, 0), 0x378647),
      ],
      trunkRadius: 0.3,
      height: 5.4,
    },
    {
      // Broadleaf: thick trunk under a lumpy round crown.
      parts: [
        paint(new THREE.CylinderGeometry(0.22, 0.42, 2.6, 7).translate(0, 1.3, 0), 0x6b4a2f),
        paint(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.7, 0), 0x3f8f3a),
        paint(new THREE.IcosahedronGeometry(1.3, 0).translate(1.15, 3.1, 0.4), 0x4d9e42),
        paint(new THREE.IcosahedronGeometry(1.25, 0).translate(-0.95, 3.3, -0.6), 0x36803a),
        paint(new THREE.IcosahedronGeometry(1.05, 0).translate(0.2, 4.7, 0.5), 0x57a84a),
      ],
      trunkRadius: 0.42,
      height: 5.3,
    },
    {
      // Birch: tall thin white trunk with dark bands, narrow light-green crown.
      parts: [
        paint(new THREE.CylinderGeometry(0.11, 0.17, 4.4, 6, 6).translate(0, 2.2, 0), (x, y, z, c) =>
          c.set(Math.sin(y * 6.3 + Math.atan2(z, x) * 2) > 0.75 ? 0x3a3530 : 0xe9e5da),
        ),
        paint(new THREE.IcosahedronGeometry(1, 0).scale(1, 1.7, 1).translate(0, 4.8, 0), 0x86c25a),
        paint(new THREE.IcosahedronGeometry(0.75, 0).scale(1, 1.4, 1).translate(0.55, 3.7, 0.2), 0x9bd066),
        paint(new THREE.IcosahedronGeometry(0.6, 0).scale(1, 1.3, 1).translate(-0.45, 3.5, -0.3), 0x7db851),
      ],
      trunkRadius: 0.18,
      height: 6.4,
    },
  ];
  // Trunks stay solid; crowns use the fade material so they can get out of the camera's way.
  const trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const crownMat = makeFadeMaterial({ vertexColors: true, flatShading: true });
  return species.map((sp) => {
    const trunkGeo = sp.parts[0];
    const crownGeo = mergeGeometries(sp.parts.slice(1));
    crownGeo.computeBoundingSphere();
    return {
      crownSphere: crownGeo.boundingSphere, // local bounds, for fade + camera collision
      trunkRadius: sp.trunkRadius,
      height: sp.height,
      instance(n) {
        const geo = crownGeo.clone(); // own per-instance fade attribute
        addFadeAttribute(geo, n);
        const crowns = new THREE.InstancedMesh(geo, crownMat, n);
        crowns.renderOrder = 10;
        return { trunks: new THREE.InstancedMesh(trunkGeo, trunkMat, n), crowns };
      },
    };
  });
}

/** Placeholder trail edge: round bushes and low boulders (instanced, tinted per instance). */
export async function loadTrackEdgeModels(bushCount, boulderCount) {
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    Math.max(1, bushCount),
  );
  const boulders = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0x8f8a82, flatShading: true }),
    Math.max(1, boulderCount),
  );
  bushes.count = bushCount;
  boulders.count = boulderCount;
  return { bushes, boulders };
}

/**
 * Obstacles along the track: for each target fraction, the straightest nearby spot with a
 * dry, straight run-up and run-out and no other obstacle within reach. Each spans the trail.
 */
export function placeObstacles(track, heightAt) {
  const O = CONFIG.obstacles;
  const L = track.length;
  const list = [];
  const wet = (s0, s1) => {
    for (let s = s0; s <= s1; s += 2) {
      const p = track.at(s);
      if (heightAt(p.x, p.z) < Z.waterY + 0.3) return true;
    }
    return false;
  };
  O.at.forEach((frac, i) => {
    let best = null;
    for (let s = (frac - O.search) * L; s <= (frac + O.search) * L; s += 2) {
      if (s - O.runUp < 30 || s + O.runOut > L) continue;
      const at = track.at(s);
      if (Math.hypot(at.x - CV.archPosition[0], at.z - CV.archPosition[1]) < O.caveClear) continue;
      if (list.some((o) => s > o.s - O.runUp - O.runOut && s < o.s + O.runUp + O.runOut)) continue;
      const k = track.maxCurvature(s - O.straightBefore, s + O.straightAfter);
      if (k > O.maxCurvature || wet(s - O.runUp, s + O.runOut)) continue;
      const pa = track.at(s - O.slopeSpan);
      const pb = track.at(s + O.slopeSpan);
      if (Math.abs(heightAt(pb.x, pb.z) - heightAt(pa.x, pa.z)) / (2 * O.slopeSpan) > O.maxSlope) continue; // not on a hill
      const score = k + Math.abs(s - frac * L) * 1e-5; // straightest, then closest to target
      if (!best || score < best.score) best = { s, score };
    }
    if (!best) return; // no fair spot near this fraction: skip it rather than force a bad one
    const type = i === O.wallIndex ? 'wall' : 'log';
    const p = track.at(best.s);
    list.push({ type, ...O.types[type], s: best.s, cx: p.x, cz: p.z, dx: p.tx, dz: p.tz, nx: -p.tz, nz: p.tx, halfLength: O.halfLength });
  });

  // The forest wall sets (CONFIG.forestWalls): each on a straight with a straight, dry, clear
  // run-up; other items keep runUp + runOut away. Low brick walls are obstacles like the logs
  // (type 'brick'); high stone walls (type 'gapWall') get a gap and the funnel in World.
  const FW = CONFIG.forestWalls;
  const keep = FW.runUp + FW.runOut;
  for (const set of FW.sets) {
    let best = null;
    for (let s = (set.at - FW.search) * L; s <= (set.at + FW.search) * L; s += 1) {
      if (s - FW.runUp < 30 || s + FW.runOut > L) continue;
      const at = track.at(s);
      if (Math.hypot(at.x - CV.archPosition[0], at.z - CV.archPosition[1]) < O.caveClear) continue;
      if (list.some((o) => Math.abs(s - o.s) < keep)) continue;
      if (track.maxCurvature(s - FW.runUp, s + FW.straightAfter) > O.maxCurvature || wet(s - FW.runUp, s + FW.runOut)) continue;
      const pa = track.at(s - O.slopeSpan);
      const pb = track.at(s + O.slopeSpan);
      const steep = Math.abs(heightAt(pb.x, pb.z) - heightAt(pa.x, pa.z)) / (2 * O.slopeSpan) > O.maxSlope;
      if (steep && set.kind === 'low') continue; // jumps only on level ground (a high wall is steered through)
      const score = Math.abs(s - set.at * L);
      if (!best || score < best.score) best = { s, score };
    }
    if (!best) continue; // no fair spot near this fraction: skip it
    const p = track.at(best.s);
    const frame = { s: best.s, cx: p.x, cz: p.z, dx: p.tx, dz: p.tz, nx: -p.tz, nz: p.tx };
    if (set.kind === 'low') {
      list.push({ type: 'brick', ...frame, height: FW.low.height, depth: FW.low.depth, color: FW.low.color, halfLength: FW.low.halfLength });
    } else {
      const c = FW.gapOffsets[set.gap];
      list.push({ type: 'gapWall', ...frame, gap: set.gap, height: FW.high.height, depth: FW.high.depth, gapCenter: c, gapLo: c - FW.gapWidth / 2, gapHi: c + FW.gapWidth / 2 });
    }
  }
  return list.sort((a, b) => a.s - b.s);
}

/**
 * Placeholder forest walls (instanced): low walls of light bricks in courses with mortar
 * lines, high walls of big dark stone blocks out to the corridor edges with a gap (stone
 * pillars either side of it, a lantern on each), and a short row of warning lanterns along
 * both trail edges before every set. `low` / `high` are the placed items; `heightAt` for bases.
 */
export async function loadForestWallModels(low, high, heightAt) {
  const FW = CONFIG.forestWalls;
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  const X = new THREE.Vector3(1, 0, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const place = (o, lateral, along = 0) => ({ x: o.cx + o.nx * lateral + o.dx * along, z: o.cz + o.nz * lateral + o.dz * along });
  const items = [];
  // Low brick walls: running-bond courses.
  const LB = FW.low;
  for (const o of low) {
    const courses = Math.round(LB.height / LB.brick[1]);
    const n = Math.ceil((LB.halfLength * 2) / LB.brick[0]);
    for (let r = 0; r < courses; r++) {
      for (let j = 0; j < n + (r % 2); j++) {
        const t0 = -LB.halfLength + (j - (r % 2) * 0.5) * LB.brick[0];
        const a = Math.max(-LB.halfLength, t0);
        const b = Math.min(LB.halfLength, t0 + LB.brick[0]);
        if (b - a < 0.05) continue;
        items.push({ kind: 'brick', o, lat: (a + b) / 2, w: b - a - LB.mortar, y: o.base + r * LB.brick[1] + LB.brick[1] / 2, h: LB.brick[1] - LB.mortar, d: o.depth, tint: ((j * 7 + r * 13) % 9) * 0.018 - 0.07 });
      }
    }
  }
  // High stone walls: blocks from the corridor edge to the gap, both sides; pillars at the gap.
  const HB = FW.high;
  for (const o of high) {
    const rows = Math.round(o.height / HB.block[1]);
    for (const [from, to] of [[-HB.span, o.gapLo], [o.gapHi, HB.span]]) {
      if (to - from < 0.2) continue;
      const n = Math.max(1, Math.round((to - from) / HB.block[0]));
      const bw = (to - from) / n;
      for (let r = 0; r < rows; r++) {
        for (let j = 0; j < n + (r % 2); j++) {
          const a = Math.max(from, from + (j - (r % 2) * 0.5) * bw);
          const b = Math.min(to, from + (j + 1 - (r % 2) * 0.5) * bw);
          if (b - a < 0.08) continue;
          const lat = (a + b) / 2;
          const p = place(o, lat);
          // Courses level from the wall's base; the bottom course reaches down to the ground.
          const bottom = r === 0 ? Math.min(heightAt(p.x, p.z), o.base) - 0.3 : o.base + r * HB.block[1];
          const top = o.base + (r + 1) * HB.block[1] - 0.05;
          items.push({ kind: 'stone', o, lat, w: b - a - 0.06, y: (bottom + top) / 2, h: top - bottom, d: o.depth * (0.92 + ((j + r) % 3) * 0.04), tint: ((j * 11 + r * 5) % 7) * 0.012 - 0.036 });
        }
      }
      // A cap course, slightly proud.
      const lat = (from + to) / 2;
      items.push({ kind: 'stone', o, lat, w: to - from + 0.1, y: o.base + rows * HB.block[1] + 0.12, h: 0.24, d: o.depth + 0.25, tint: 0.03 });
    }
    for (const edge of [o.gapLo, o.gapHi]) {
      const side = edge === o.gapLo ? -1 : 1;
      items.push({ kind: 'stone', o, lat: edge + side * 0.35, w: 0.75, y: o.base + (o.height + 0.5) / 2 - 0.1, h: o.height + 0.5, d: o.depth + 0.4, tint: 0.05 });
    }
  }
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const mesh = new THREE.InstancedMesh(box, stoneMat, Math.max(1, items.length));
  items.forEach((it, i) => {
    const p = place(it.o, it.lat);
    q.setFromUnitVectors(X, new THREE.Vector3(it.o.nx, 0, it.o.nz));
    mesh.setMatrixAt(i, m.compose(pos.set(p.x, it.y, p.z), q, sc.set(it.w, it.h, it.d)));
    mesh.setColorAt(i, col.set(it.kind === 'brick' ? LB.color : HB.color).offsetHSL(0, 0, it.tint));
  });
  mesh.count = items.length;
  group.add(mesh);

  // Lanterns: a row along both trail edges before every set, and one on each gap pillar.
  const LN = FW.lanterns;
  const lamps = [];
  for (const o of [...low, ...high]) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < LN.perSide; k++) {
        const along = -LN.from + (k * (LN.from - LN.to)) / Math.max(1, LN.perSide - 1);
        const p = place(o, side * LN.lateral, along);
        lamps.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z), post: LN.post });
      }
    }
  }
  for (const o of high) {
    for (const edge of [o.gapLo - 0.35, o.gapHi + 0.35]) {
      const p = place(o, edge);
      lamps.push({ x: p.x, z: p.z, y: o.base + o.height + 0.4, post: 0.25 });
    }
  }
  const posts = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: LN.postColor, flatShading: true }), Math.max(1, lamps.length));
  const heads = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: LN.color }), Math.max(1, lamps.length));
  const glows = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color: LN.glow, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
    Math.max(1, lamps.length),
  );
  glows.renderOrder = 9;
  q.identity();
  lamps.forEach((l, i) => {
    posts.setMatrixAt(i, m.compose(pos.set(l.x, l.y + l.post / 2, l.z), q, sc.set(0.12, l.post, 0.12)));
    heads.setMatrixAt(i, m.compose(pos.set(l.x, l.y + l.post + 0.15, l.z), q, sc.set(1, 1.3, 1)));
    glows.setMatrixAt(i, m.compose(pos.set(l.x, l.y + l.post + 0.15, l.z), q, sc.setScalar(LN.glowSize)));
  });
  for (const im of [posts, heads, glows]) im.count = lamps.length;
  group.add(posts, heads, glows);
  group.userData = { stones: mesh, lamps };
  return group;
}

/**
 * Placeholder giant cave (swap for a glTF later): the towering cliff wall, side cliffs,
 * pillars and arena boulders (one instanced rock mesh from the placed transforms `parts`)
 * plus the cave mouth arch at `mouth` (~10x the horse's height). Colliders stay in World.
 */
export async function loadCaveModel(parts, mouth) {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const solid = parts.filter((pt) => !pt.fade);
  const fading = parts.filter((pt) => pt.fade);
  const rocks = await loadRockModel(solid.length);
  rocks.material.color.set(CV.cliff.color);
  // The rocks the hero can be pinned against: same look, per-instance fade (World.updateFoliage).
  const fadeRocks = new THREE.InstancedMesh(rocks.geometry.clone(), makeFadeMaterial({ color: CV.cliff.color, flatShading: true }), Math.max(1, fading.length));
  addFadeAttribute(fadeRocks.geometry, Math.max(1, fading.length));
  const col = new THREE.Color();
  const shade = (i) => col.setScalar(0.85 + ((i * 0.618) % 1) * 0.3);
  solid.forEach((pt, i) => {
    rocks.setMatrixAt(i, m.compose(pt.p, pt.q, pt.s));
    rocks.setColorAt(i, shade(i));
  });
  fading.forEach((pt, i) => {
    fadeRocks.setMatrixAt(i, m.compose(pt.p, pt.q, pt.s));
    fadeRocks.setColorAt(i, shade(i + solid.length));
  });
  rocks.count = solid.length;
  fadeRocks.count = fading.length;
  const arch = await loadCaveArchModel();
  arch.position.copy(mouth);
  group.add(rocks, fadeRocks, arch);
  group.userData.fadeRocks = {
    mesh: fadeRocks,
    items: fading.map((pt) => ({ x: pt.p.x, y: pt.p.y, z: pt.p.z, r: Math.max(pt.s.x, pt.s.z) * CV.fade.radiusScale, h: pt.s.y * CV.fade.heightScale })),
    near: false, // (only when it's between the camera and the hero)
    opacity: CV.fade.opacity,
    blockScale: CV.fade.blockScale,
  };
  return group;
}

/** Placeholder cave mouth: a dark half-round opening framed by a rough stone arch, facing -X. */
export async function loadCaveArchModel() {
  const group = new THREE.Group();
  const R = CV.archRadius;
  const stone = new THREE.MeshLambertMaterial({ color: CV.archColor, flatShading: true });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(R, CV.archTube, 7, 18, Math.PI), stone);
  arch.rotation.y = Math.PI / 2;
  const dark = new THREE.MeshBasicMaterial({ color: 0x050407, side: THREE.DoubleSide });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(R - CV.archTube * 0.2, 24, 0, Math.PI), dark);
  mouth.rotation.y = -Math.PI / 2;
  mouth.position.x = CV.tunnelDepth;
  // Half-round tunnel behind the mouth (axis along X), fading into darkness.
  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.97, R * 0.97, CV.tunnelDepth, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(CV.tunnelDepth / 2, 0, 0),
    new THREE.MeshLambertMaterial({ color: 0x1a1714, side: THREE.BackSide }),
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CV.tunnelDepth, R * 2).rotateX(-Math.PI / 2).translate(CV.tunnelDepth / 2, 0.05, 0), dark);
  group.add(arch, tunnel, mouth, floor);
  // Fallen stones at the foot of the arch.
  const rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
  for (const [x, z, k] of [[-2, -R - 4, 3], [-3, R + 4.5, 2.4], [-4.5, R + 1, 1.5], [-1.5, -R + 1, 1.2]]) {
    const r = new THREE.Mesh(rubbleGeo, stone);
    r.position.set(x, 0.4 * k, z);
    r.scale.setScalar(k);
    group.add(r);
  }
  return group;
}

/** Placeholder ride obstacles (instanced per kind): low logs and low stone walls. */
export async function loadObstacleModels(obstacles) {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const across = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const logs = obstacles.filter((o) => o.type === 'log');
  const walls = obstacles.filter((o) => o.type === 'wall');
  const T = CONFIG.obstacles.types;

  if (logs.length) {
    const mesh = new THREE.InstancedMesh(
      paint(new THREE.CylinderGeometry(1, 1, 1, 9, 1).rotateZ(Math.PI / 2), (x, y, z, c) =>
        c.set(T.log.color).offsetHSL(0, 0, Math.sin(Math.atan2(z, y) * 7) * 0.04 + (Math.abs(x) > 0.49 ? 0.15 : 0)),
      ),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      logs.length,
    );
    logs.forEach((o, i) => {
      const r = o.height / 2;
      q.setFromUnitVectors(X, across.set(o.nx, 0, o.nz));
      mesh.setMatrixAt(i, m.compose(p.set(o.cx, o.base + r, o.cz), q, s.set(o.halfLength * 2, r, r)));
    });
    group.add(mesh);
  }
  if (walls.length) {
    const per = Math.ceil((CONFIG.obstacles.halfLength * 2) / 0.8);
    const mesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: T.wall.color, flatShading: true }),
      walls.length * per * 2,
    );
    const col = new THREE.Color();
    let k = 0;
    walls.forEach((o) => {
      for (let row = 0; row < 2; row++) {
        for (let j = 0; j < per; j++) {
          const t = -o.halfLength + (j + 0.5 + row * 0.5) * ((o.halfLength * 2) / (per + 0.5));
          const size = row ? 0.38 : 0.48;
          p.set(o.cx + o.nx * t, o.base + (row ? o.height - size * 0.7 : size * 0.8), o.cz + o.nz * t);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, j * 1.7 + row);
          mesh.setMatrixAt(k, m.compose(p, q, s.set(size * 1.2, size, o.depth * 0.5)));
          mesh.setColorAt(k++, col.set(T.wall.color).offsetHSL(0, 0, ((j * 37 + row * 11) % 10) * 0.012 - 0.05));
        }
      }
    });
    mesh.count = k;
    group.add(mesh);
  }
  return group;
}

/** Placeholder boulders, instanced. */
export async function loadRockModel(count) {
  return new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: W.colors.rock, flatShading: true }),
    count,
  );
}

function makeSky() {
  const geo = new THREE.SphereGeometry(SKY.radius, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY.top) },
      horizon: { value: new THREE.Color(SKY.horizon) },
      sunColor: { value: new THREE.Color(SKY.sunColor) },
      sunDir: { value: new THREE.Vector3(...SKY.sunDirection).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y * 1.6, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(t, 0.7));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

function makeClouds(rnd) {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b8, flatShading: true, fog: false }),
    SKY.cloudCount * 3,
  );
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < SKY.cloudCount; i++) {
    const cx = rnd.range(W.xMin - 40, W.xMax + 40);
    const cz = rnd.range(W.zMin - 40, W.zMax + 40);
    const cy = rnd.range(SKY.cloudHeight[0], SKY.cloudHeight[1]);
    for (let j = 0; j < 3; j++) {
      const s = rnd.range(4, 8);
      m.makeScale(s * 1.6, s * 0.55, s).setPosition(cx + (j - 1) * s * 1.2, cy + rnd.range(-1, 1), cz + rnd.range(-2, 2));
      mesh.setMatrixAt(k++, m);
    }
  }
  return mesh;
}

function makeWater(color, opacity) {
  return new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/** Placeholder mist: big soft points hugging the base of the cliffs. */
export async function loadMistModel(rnd, ax, az) {
  const M = CV.mist;
  const pos = new Float32Array(M.count * 3);
  for (let i = 0; i < M.count; i++) {
    const t = rnd();
    let x;
    let z;
    if (i % 3 === 0) {
      // along a side cliff
      x = lerp(CV.center[0] - CV.radius, CV.cliff.faceX, t);
      z = (rnd() < 0.5 ? -1 : 1) * (CV.cliff.sideZ - 6);
    } else {
      // along the main wall either side of the cave mouth (never in front of it)
      x = CV.cliff.faceX - rnd.range(2, 10);
      const side = rnd() < 0.5 ? -1 : 1;
      z = az + side * (CV.archRadius + CV.archTube + 4 + t * (i % 3 === 1 ? 25 : 60));
    }
    pos.set([x, rnd.range(1.5, 6), z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    map = new THREE.CanvasTexture(c);
  }
  const mist = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: M.color, size: M.size, map, transparent: true, opacity: M.opacity, depthWrite: false, sizeAttenuation: true }),
  );
  mist.renderOrder = 8;
  return mist;
}

/** Pushes pos out to distance `min` along (dx,dz) and removes velocity into the obstacle. */
function pushOut(pos, vel, dx, dz, min) {
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-8) return;
  const d = Math.sqrt(d2);
  dx /= d;
  dz /= d;
  pos.x += dx * (min - d);
  pos.z += dz * (min - d);
  const into = vel.x * dx + vel.z * dz;
  if (into < 0) {
    vel.x -= dx * into;
    vel.z -= dz * into;
  }
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY.horizon);
    this.scene.fog = new THREE.Fog(SKY.horizon, W.fogNear, W.fogFar);
    this.layout = generateLayout();
    this.track = new Track(); // the forest ride
    this.desertTrack = new Track(DS.points); // the desert ride to the castle
    this.tracks = [this.track, this.desertTrack];
    this.activeTrack = this.track; // what the horse's path assist follows
    this.heightAt = createHeightFn(this.layout, this.track, this.desertTrack);
    // The Lazarus Pit: just off the desert trail's right edge, on a little level patch.
    const PIT = DS.pit;
    const pp = this.desertTrack.at(this.desertTrack.length * PIT.at + PIT.ahead);
    const px = pp.x - pp.tz * PIT.lateral;
    const pz = pp.z + pp.tx * PIT.lateral;
    this.pitPosition = new THREE.Vector3(px, this.heightAt(px, pz), pz);
    this.heightAt.flats.push({ x: px, z: pz, y: this.pitPosition.y, r0: PIT.radius + 0.5, r1: PIT.radius + PIT.flat });
    // The castle, past the end of the trail, facing back along it; its courtyard levelled.
    const end = this.desertTrack.at(this.desertTrack.length);
    const cx = end.x + end.tx * DS.castle.distance;
    const cz = end.z + end.tz * DS.castle.distance;
    this.castleAt = { x: cx, y: this.heightAt(cx, cz) - 1, z: cz, rot: Math.atan2(-end.tx, -end.tz) };
    const CY = DS.castle.courtyard;
    const back = DS.castle.height * 0.125 + CY.depth / 2; // (the courtyard centre behind the gate: half the wall depth + half its own)
    this.courtyardAt = { x: cx - Math.sin(this.castleAt.rot) * back, z: cz - Math.cos(this.castleAt.rot) * back };
    this.heightAt.flats.push({ x: this.courtyardAt.x, z: this.courtyardAt.z, y: this.castleAt.y, r0: CY.flat[0], r1: CY.flat[1] });

    // Colliders. boxes: buildings (standable tops + walls). beams: horizontal branches
    // (standable flat top + sides). cylinders: solid round obstacles (trunks, rocks).
    this.boxes = [];
    this.beams = [];
    this.cylinders = [];
    this.trees = []; // forest trees {x, z, reach} (for checks)
    // Fadeable foliage: [{ mesh (InstancedMesh with instanceFade), items: [{x,y,z,r}] }].
    this.foliageSets = [];
    // Other fadeable instanced sets (not leaves, no camera collision): [{ mesh, items, near: false, opacity, blockScale }].
    this.fadeSets = [];
    // Meshes the camera raycasts against (besides the colliders): the boulders you can be pinned against.
    this.cameraMeshes = [];
    this.time = 0;
  }

  async init() {
    const L = CONFIG.lights;
    this.scene.add(new THREE.AmbientLight(0xffffff, L.ambient));
    const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, L.sunIntensity);
    sun.position.set(...L.sunPosition);
    this.scene.add(sun); // no shadow maps by design (mobile perf)
    this.lights = { hemi, sun };
    this.sunset = 0; // 0 day … 1 desert sunset

    const { layout } = this;
    const rnd = layout.rnd;

    this.sky = makeSky();
    this.scene.add(this.sky, makeClouds(rnd));

    // Draw zones: the forest side (terrain grid, town, trees, trail edges, river, walls) and the
    // desert side (dunes, scenery, castle) are only drawn while the camera is on their side
    // (update): their big meshes are never frustum-culled, and fog hides them anyway. The cave
    // and its cliffs stay in both.
    this.zones = { forest: new THREE.Group(), desert: new THREE.Group() };
    this.zones.forest.name = 'forestZone';
    this.zones.desert.name = 'desertZone';
    this.scene.add(this.zones.forest, this.zones.desert);

    this.terrain = await loadTerrainModel(this.heightAt, layout, this.track);
    this.desertTerrain = await loadDesertTerrainModel(this.heightAt, this.desertTrack);
    this.zones.forest.add(this.terrain);
    this.zones.desert.add(this.desertTerrain);

    this.#buildWater();
    await this.#buildTown();
    await this.#buildGiantTrees(rnd);
    await this.#buildForest(rnd);
    await this.#buildTrackEdges(rnd);
    await this.#buildObstacles();
    await this.#buildCave(rnd);
    await this.#buildDesert(rnd);
  }

  /** Per-frame cosmetic updates. */
  update(dt, cameraPosition) {
    this.time += dt;
    const ZN = CONFIG.world.zones;
    this.zones.forest.visible = cameraPosition.x < ZN.forestMaxX;
    this.zones.desert.visible = cameraPosition.x > ZN.desertMinX;
    this.sky.position.copy(cameraPosition);
    this.setSunset(smoothstep(cameraPosition.x, DS.sunset.blend[0], DS.sunset.blend[1]));
    this.river.position.y = Z.waterY + Math.sin(this.time * WATER.waveSpeed) * WATER.waveHeight;
    if (this.mist) {
      this.mist.position.x = Math.sin(this.time * 0.13) * CV.mist.drift * 3;
      this.mist.position.z = Math.cos(this.time * 0.09) * CV.mist.drift * 4;
    }
  }

  /** Blends sky, fog and light colours from day (0) to the desert sunset (1). */
  setSunset(f) {
    if (Math.abs(f - this.sunset) < 1e-3 && this.sunsetSet) return;
    this.sunset = f;
    this.sunsetSet = true;
    const SS = DS.sunset;
    const L = CONFIG.lights;
    const u = this.sky.material.uniforms;
    const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), f);
    u.top.value.copy(mix(SKY.top, SS.top));
    u.horizon.value.copy(mix(SKY.horizon, SS.horizon));
    u.sunColor.value.copy(mix(SKY.sunColor, SS.sunColor));
    u.sunDir.value.set(...SKY.sunDirection).normalize().lerp(new THREE.Vector3(...SS.sunDirection).normalize(), f).normalize();
    this.fogBase = mix(SKY.horizon, SS.fog); // (the sandstorm blends its own fog from this)
    this.scene.fog.color.copy(this.fogBase);
    this.scene.background.copy(this.scene.fog.color);
    this.lights.hemi.color.copy(mix(L.hemiSky, SS.hemiSky));
    this.lights.hemi.groundColor.copy(mix(L.hemiGround, SS.hemiGround));
    this.lights.sun.color.copy(mix(0xffffff, SS.sunLight));
    this.lights.sun.intensity = lerp(L.sunIntensity, SS.sunIntensity, f);
  }

  /**
   * Fades leaf clusters that block the camera→hero line or sit close to the hero, so
   * jumps stay readable. Cheap: one segment/sphere test per nearby cluster.
   */
  updateFoliage(dt, cameraPos, focus) {
    for (const set of this.foliageSets) this.#fadeSet(set, dt, cameraPos, focus);
    for (const set of this.fadeSets) this.#fadeSet(set, dt, cameraPos, focus); // (rocks between the camera and the hero)
  }

  #fadeSet({ mesh, items, bounds, near = true, opacity = FOL.fadeOpacity, blockScale = FOL.blockScale }, dt, cameraPos, focus) {
    const attr = mesh.geometry.attributes.instanceFade;
    // Whole chunk far away (and nothing in it faded): nothing to do.
    if (bounds && !mesh.userData.anyFaded && bounds.center.distanceTo(focus) > bounds.radius + FOL.activeRange) return;
    const fade = attr.array;
    const k = 1 - Math.exp(-FOL.fadeSpeed * dt);
    const sx = cameraPos.x - focus.x;
    const sy = cameraPos.y - focus.y;
    const sz = cameraPos.z - focus.z;
    const segLen2 = sx * sx + sy * sy + sz * sz;
    const range2 = FOL.activeRange * FOL.activeRange;
    const near2 = FOL.fadeRadius * FOL.fadeRadius;
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = it.x - focus.x;
      const dy = it.y - focus.y;
      const dz = it.z - focus.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      let target = 1;
      if (d2 < range2) {
        if (near && d2 < near2) target = opacity;
        else {
          const t = clamp((dx * sx + dy * sy + dz * sz) / segLen2, 0, 1);
          const ex = dx - sx * t;
          const ey = it.h ? Math.max(0, Math.abs(dy - sy * t) - it.h) : dy - sy * t; // (tall items: a vertical capsule)
          const ez = dz - sz * t;
          const rr = it.r * blockScale;
          if (ex * ex + ey * ey + ez * ez < rr * rr) target = opacity;
        }
      }
      // A cluster the camera is inside is invisible anyway, so drop it at once (no pop seen).
      if (target < 1) {
        const cx = it.x - cameraPos.x;
        const cy = it.y - cameraPos.y;
        const cz = it.z - cameraPos.z;
        if (cx * cx + cy * cy + cz * cz < it.r * it.r && fade[i] > target) {
          fade[i] = target;
          changed = true;
          continue;
        }
      }
      const f = fade[i] + (target - fade[i]) * k;
      if (Math.abs(f - fade[i]) > 1e-3) {
        fade[i] = f;
        changed = true;
      } else if (fade[i] !== target && Math.abs(f - target) <= 1e-3) {
        fade[i] = target;
        changed = true;
      }
    }
    if (changed) attr.needsUpdate = true;
    if (bounds) mesh.userData.anyFaded = changed || items.some((_, i) => attr.array[i] < 1);
  }

  // --- Queries used by the hero ---

  /** Ground type at (x,z): 'swamp' | 'water' | 'sand' | 'dirt' | 'grass' | 'rock'. */
  surfaceAt(x, z) {
    if (this.isHazard(x, z)) return 'swamp';
    if (this.heightAt(x, z) < Z.waterY) return 'water';
    if (x > DS.startX - 6) return this.desertTrack.distance(x, z, TR.halfWidth + 1) < TR.halfWidth ? 'dirt' : 'sand';
    if (this.track.distance(x, z, TR.halfWidth + 1) < TR.halfWidth) return 'dirt';
    if (Math.abs(x - riverCenterX(z)) < Z.riverHalfWidth + 5) return 'sand';
    if (inSouthRegion(z) && x < Z.forestStart) return 'sand';
    if (x >= Z.desertStart && z < 110) return 'sand';
    return x >= Z.caveStart && z < 75 ? 'rock' : 'grass';
  }

  /** True where touching the terrain means a fall (town streets, swamp under the trees). */
  isHazard(x, z) {
    return x < this.layout.hazardEndX && inSouthRegion(z);
  }

  /**
   * Highest standable surface under (x,z) whose top is at or below maxY.
   * `grace` widens platforms so standing half over an edge still counts.
   * `ignoreObstacles` skips the ride obstacles (logs, walls).
   * @returns {{y:number, platform:object|null}}
   */
  groundAt(x, z, maxY, grace = 0, ignoreObstacles = false) {
    let y = this.heightAt(x, z);
    let platform = null;
    for (const b of this.boxes) {
      if (b.top > maxY || b.top <= y) continue;
      if (x >= b.minX - grace && x <= b.maxX + grace && z >= b.minZ - grace && z <= b.maxZ + grace) {
        y = b.top;
        platform = b;
      }
    }
    for (const b of this.beams) {
      if (b.top > maxY || b.top <= y || (ignoreObstacles && b.obstacle)) continue;
      const px = x - b.x0;
      const pz = z - b.z0;
      const along = px * b.ux + pz * b.uz;
      if (along < -grace || along > b.len + grace) continue;
      const hw = lerp(b.hw0, b.hw1, clamp(along / b.len, 0, 1));
      if (Math.abs(px * b.uz - pz * b.ux) <= hw + grace) {
        y = b.top;
        platform = b;
      }
    }
    return { y, platform };
  }

  /**
   * Solids (rocks, trunks, cliff bases, buildings) whose surface is within `reach` of a body of
   * `radius` at `pos` (feet; `height` tall): [{ nx, nz, gap }] — the outward normal and the gap.
   * Used to roll away from walls and to tell when the hero is pinned against one.
   */
  solidsNear(pos, radius, reach, height) {
    const out = [];
    const feet = pos.y;
    const head = pos.y + height;
    for (const c of this.cylinders) {
      if (c.top <= feet + 0.3 || c.bottom >= head) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const lim = c.r + radius + reach;
      if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
      const d = Math.hypot(dx, dz);
      if (d < lim && d > 1e-4) out.push({ nx: dx / d, nz: dz / d, gap: d - c.r - radius });
    }
    for (const b of this.boxes) {
      if (b.top <= feet + 0.3 || b.bottom >= head) continue;
      const dx = pos.x - clamp(pos.x, b.minX, b.maxX);
      const dz = pos.z - clamp(pos.z, b.minZ, b.maxZ);
      const d = Math.hypot(dx, dz);
      if (d < radius + reach && d > 1e-4) out.push({ nx: dx / d, nz: dz / d, gap: d - radius });
    }
    return out;
  }

  /**
   * Pushes a vertical capsule (feet at pos.y) out of walls and solid cylinders.
   * Obstacles whose top is within `stepUp` of the feet are ignored (they are floor).
   * `ignoreObstacles` skips the ride obstacles (the horse jumps / stumbles over them instead).
   * Velocity components into a wall are removed.
   */
  collide(pos, vel, radius, height, stepUp, ignoreObstacles = false, ignoreWalls = false) {
    const feet = pos.y;
    const head = pos.y + height;
    for (const b of this.boxes) {
      if (b.top <= feet + stepUp || b.bottom >= head) continue;
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d;
        dz /= d;
        pos.x += dx * (radius - d);
        pos.z += dz * (radius - d);
      } else {
        // Centre is inside the box: leave by the nearest face.
        const pens = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
        const i = pens.indexOf(Math.min(...pens));
        dx = i === 0 ? -1 : i === 1 ? 1 : 0;
        dz = i === 2 ? -1 : i === 3 ? 1 : 0;
        pos.x += dx * (pens[i] + radius);
        pos.z += dz * (pens[i] + radius);
      }
      const into = vel.x * dx + vel.z * dz;
      if (into < 0) {
        vel.x -= dx * into;
        vel.z -= dz * into;
      }
    }
    for (const c of this.cylinders) {
      if (c.top <= feet + stepUp || c.bottom >= head) continue;
      pushOut(pos, vel, pos.x - c.x, pos.z - c.z, c.r + radius);
    }
    for (const b of this.beams) {
      if (b.top <= feet + stepUp || b.bottom >= head || (ignoreObstacles && b.obstacle)) continue;
      const t = clamp(((pos.x - b.x0) * b.ux + (pos.z - b.z0) * b.uz) / b.len, 0, 1);
      const cx = b.x0 + b.ux * b.len * t;
      const cz = b.z0 + b.uz * b.len * t;
      pushOut(pos, vel, pos.x - cx, pos.z - cz, lerp(b.hw0, b.hw1, t) + radius);
    }
    this.wallHit = ignoreWalls ? null : this.#trailWalls(pos, vel, radius);
  }

  /**
   * Invisible walls just outside both trail edges: anything within `wall.band` beyond the
   * wall line is pushed back onto the trail and loses only its outward velocity (it slides).
   * Returns the inward normal {x, z, tx, tz} on contact (tangent = trail direction), else null.
   */
  #trailWalls(pos, vel, radius) {
    const WL = TR.wall;
    let n = null;
    let side = 0;
    let over = 0;
    for (const track of this.tracks) {
      const m = track.nearest(pos.x, pos.z, WL.offset + WL.band);
      if (!m || m.s < WL.startS || m.s > track.length - WL.endMargin) continue;
      if (Math.abs(m.lateral) > WL.offset + WL.band) continue;
      // (narrowed into the gap before a high wall)
      const lane = this.laneAt(track, m.s);
      if (m.lateral > lane.hi - radius) (side = 1), (over = m.lateral - (lane.hi - radius));
      else if (m.lateral < lane.lo + radius) (side = -1), (over = lane.lo + radius - m.lateral);
      else continue;
      n = m;
      break;
    }
    if (!n) return null;
    if (pos.y > this.heightAt(pos.x, pos.z) + WL.height) return null;
    // Right of travel is (-tz, tx); inward is away from the limit that was crossed.
    const ix = n.tz * side;
    const iz = -n.tx * side;
    pos.x += ix * over;
    pos.z += iz * over;
    const into = vel.x * ix + vel.z * iz;
    if (into < 0) {
      vel.x -= ix * into;
      vel.z -= iz * into;
    }
    return { x: ix, z: iz, tx: n.tx, tz: n.tz };
  }

  /** Is the point inside the trail walls (for the camera)? */
  insideTrailWalls(x, z, y) {
    const WL = TR.wall;
    for (const track of this.tracks) {
      const n = track.nearest(x, z, WL.offset + WL.band);
      if (!n || n.s < WL.startS || n.s > track.length - WL.endMargin) continue;
      const lane = this.laneAt(track, n.s);
      if ((n.lateral <= lane.hi && n.lateral >= lane.lo) || Math.abs(n.lateral) > WL.offset + WL.band) continue;
      if (y <= this.heightAt(x, z) + WL.height) return false;
    }
    return true;
  }

  // --- Builders ---

  #buildWater() {
    const geo = new THREE.PlaneGeometry(Z.riverHalfWidth * 2 + 4, W.zMax - W.zMin, 6, 200);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (W.zMin + W.zMax) / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + riverCenterX(pos.getZ(i)));
    geo.computeVertexNormals();
    this.river = new THREE.Mesh(geo, makeWater(WATER.color, WATER.opacity));
    this.river.position.y = Z.waterY;
    this.zones.forest.add(this.river);

    const { townEndX, hazardEndX } = this.layout;
    const swampW = hazardEndX - townEndX;
    const swamp = new THREE.Mesh(
      new THREE.PlaneGeometry(swampW, W.ridge.z[0] + 10 - W.zMin).rotateX(-Math.PI / 2),
      makeWater(WATER.swampColor, WATER.swampOpacity),
    );
    swamp.position.set(townEndX + swampW / 2, 0.05, (W.ridge.z[0] + 10 + W.zMin) / 2);
    this.zones.forest.add(swamp);
  }

  async #buildTown() {
    const buildings = [...this.layout.roofs, ...this.layout.fillers];
    for (const b of buildings) {
      this.boxes.push({
        ...b,
        bottom: 0,
        // Respawn point: centre of the roof.
        safe: new THREE.Vector3((b.minX + b.maxX) / 2, b.top, (b.minZ + b.maxZ) / 2),
      });
    }
    this.zones.forest.add(await loadBuildingModels(buildings));
  }

  /** Giant swamp trees: route trees carry the walkable branches; background ones frame it. */
  async #buildGiantTrees(rnd) {
    const { branches, townEndX, hazardEndX } = this.layout;
    const plan = { trunks: [], beams: [], knots: [], leaves: [] };
    const v = (x, y, z) => new THREE.Vector3(x, y, z);

    // Adds a trunk; returns a function giving the (bowed) trunk axis point at a world height.
    const addTrunk = (x, z, radius, topY, bowX, bowZ) => {
      const y = this.heightAt(x, z) - 0.3;
      const height = topY - y;
      plan.trunks.push({ x, y, z, radius, height, rotY: Math.atan2(-bowZ, bowX) });
      this.cylinders.push({ x, z, r: radius * 1.05, top: topY, bottom: y - 1 });
      return (wy) => {
        const off = trunkBendAt(clamp((wy - y) / height, 0, 1)) * radius;
        return v(x + bowX * off, wy, z + bowZ * off);
      };
    };
    const addLeaves = (p, radius) =>
      plan.leaves.push({ p, scale: v(radius, radius * 0.75, radius), shade: Math.floor(rnd() * 3) });
    const addTwig = (from, dir, len, radius, leafRadius) => {
      const to = from.clone().addScaledVector(dir.normalize(), len);
      plan.beams.push({ from, to, radius, kind: 'twig' });
      if (leafRadius) addLeaves(to, leafRadius);
    };
    // Crown around the trunk top, optionally leaning away (shiftX/Z) from the walking line.
    const addCrown = (axisAt, topY, shiftX = 0, shiftZ = 0) => {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rnd();
        const c = axisAt(topY - 0.6).add(v(Math.cos(a) * 1.6 + shiftX, rnd.range(-0.4, 0.8), Math.sin(a) * 1.6 + shiftZ));
        addLeaves(c, rnd.range(...T.crownRadius));
      }
    };
    // Two decorative upper branches pointing away from `awayX/Z`, above head height.
    const addUpperBranches = (axisAt, fromY, awayX, awayZ) => {
      for (let k = 0; k < 2; k++) {
        const a = Math.atan2(awayZ, awayX) + (k ? 1 : -1) * rnd.range(0.4, 0.9);
        const from = axisAt(fromY + k * rnd.range(1.2, 2.2));
        addTwig(from, v(Math.cos(a), 0.35, Math.sin(a)), rnd.range(2.5, 3.5), 0.38, rnd.range(1.5, 1.9));
      }
    };

    for (const b of branches) {
      const nx = -b.dz;
      const nz = b.dx;
      const trunkTop = b.top + T.trunkAbove;
      const axisAt = addTrunk(b.trunkX, b.trunkZ, T.trunkRadius, trunkTop, b.dx, b.dz);

      // Walkable limb: flat top at b.top, from the wide base to the narrow tip.
      const base = v(b.x0, b.top - b.hw0, b.z0);
      const tip = v(b.x1, b.top - b.hw1, b.z1);
      plan.beams.push({ from: base, to: tip, radius: b.hw0, kind: 'limb' });
      plan.knots.push({ p: tip.clone(), radius: b.hw1 * 0.97 });
      // Elbow: the limb grows sideways out of the trunk before turning along the route.
      const elbowR = b.hw0 * 1.12;
      const trunkPoint = axisAt(b.top - elbowR);
      plan.beams.push({ from: trunkPoint, to: v(b.x0, b.top - elbowR, b.z0), radius: elbowR, kind: 'elbow' });
      plan.knots.push({ p: v(b.x0, b.top - elbowR, b.z0), radius: elbowR });

      const safe = v(b.x, b.top, b.z);
      this.beams.push({ ...b, safe });
      this.beams.push({ ...makeBeam(trunkPoint.x, trunkPoint.z, b.x0, b.z0, b.top, b.hw0 * 1.05, b.hw0 * 1.05), safe });

      // Twigs off the sides of the limb, angled outward so they stay off the path.
      for (let k = 0; k < T.twigsPerBranch; k++) {
        const t = 0.3 + (0.55 * k) / Math.max(1, T.twigsPerBranch - 1);
        const side = k % 2 ? 1 : -1;
        const hw = lerp(b.hw0, b.hw1, t);
        const from = v(b.x0 + b.dx * b.len * t + nx * side * hw * 0.7, b.top - hw * 0.5, b.z0 + b.dz * b.len * t + nz * side * hw * 0.7);
        const dir = v(nx * side * 0.9 + b.dx * rnd.range(-0.2, 0.3), 0.5, nz * side * 0.9 + b.dz * rnd.range(-0.2, 0.3));
        addTwig(from, dir, rnd.range(1.5, 2.1), 0.13, rnd.range(0.55, 0.8));
      }
      // Leaf clusters around and above the limb (never lower than leafLiftMin above it).
      for (let k = 0; k < T.leafBlobs; k++) {
        const t = rnd();
        const r = rnd.range(...T.pathLeafRadius);
        const lat = (k % 2 ? 1 : -1) * rnd.range(...T.pathLeafLateral);
        addLeaves(
          v(b.x0 + b.dx * b.len * t + nx * lat, b.top + T.leafLiftMin + r * 0.75 + rnd.range(0, 2.5), b.z0 + b.dz * b.len * t + nz * lat),
          r,
        );
      }
      addUpperBranches(axisAt, b.top + 2.6, b.trunkX - b.x0, b.trunkZ - b.z0);
      // Lean the crown away from the limb so it doesn't hang over the path.
      addCrown(axisAt, trunkTop, (b.trunkX - b.x0) / T.trunkOffset * T.crownShift, (b.trunkZ - b.z0) / T.trunkOffset * T.crownShift);
    }

    // Background giant trees in the swamp, clear of the route.
    const placed = [];
    for (let tries = 0; placed.length < T.backgroundCount && tries < T.backgroundCount * 40; tries++) {
      const x = rnd.range(townEndX + 4, hazardEndX - 2);
      const z = (rnd() < 0.5 ? -1 : 1) * rnd.range(12, 48);
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
      placed.push({ x, z });
      const radius = rnd.range(0.8, 1.15);
      const branchY = rnd.range(4.5, 9);
      const topY = branchY + rnd.range(5, 7.5);
      const bow = rnd() * Math.PI * 2;
      const axisAt = addTrunk(x, z, radius, topY, Math.cos(bow), Math.sin(bow));
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI * 2;
        const len = rnd.range(3, 4.5);
        const hw = rnd.range(0.55, 0.75);
        const from = axisAt(branchY + k * 1.5);
        const to = from.clone().add(v(Math.cos(a) * len, rnd.range(-0.3, 0.6), Math.sin(a) * len));
        plan.beams.push({ from, to, radius: hw, kind: 'limb' });
        plan.knots.push({ p: to, radius: hw * (T.tipHalfWidth / T.baseHalfWidth) });
        addTwig(to.clone(), v(Math.cos(a), 0.8, Math.sin(a)), rnd.range(1, 1.6), 0.12, rnd.range(1.1, 1.5));
        for (let j = 0; j < 3; j++) {
          addLeaves(from.clone().lerp(to, rnd()).add(v(rnd.range(-1.5, 1.5), rnd.range(1.6, 3), rnd.range(-1.5, 1.5))), rnd.range(1.4, 2.1));
        }
      }
      addUpperBranches(axisAt, branchY + 3, Math.cos(bow + 2), Math.sin(bow + 2));
      addCrown(axisAt, topY);
    }

    const trees = await loadGiantTreeModels(plan);
    this.zones.forest.add(trees);
    // Cluster bounds for the foliage fade and camera collision (index = instance index).
    this.foliageSets.push({
      mesh: trees.userData.leaves,
      items: plan.leaves.map((l) => ({ x: l.p.x, y: l.p.y, z: l.p.z, r: Math.max(l.scale.x, l.scale.y, l.scale.z) })),
    });
  }

  /**
   * May a tree (scale k, horizontal reach `reach` at scale 1) stand here? Wholly outside the
   * trail corridor; off the river, arena, cliffs, swamp and town.
   */
  #treeSpot(x, z, k, reach) {
    const hw = W.width / 2 - 6;
    if (x < -hw || x > hw || z < W.zMin + 8 || z > W.zMax - 8) return false;
    if (inSouthRegion(z) && x < this.layout.hazardEndX + 3) return false;
    if (Math.abs(x - riverCenterX(z)) < Z.riverHalfWidth + 2.5) return false;
    const [cx, cz] = CV.center;
    if (Math.hypot(x - cx, z - cz) < CV.radius + 6) return false;
    if (x > CV.cliff.faceX - 8 && z < 120) return false;
    if (Math.hypot(x - CONFIG.horse.position[0], z - CONFIG.horse.position[1]) < 8) return false;
    const keep = TR.corridorHalfWidth + F.corridorMargin + reach * k;
    return this.track.distance(x, z, keep + 1) > keep;
  }

  /**
   * Forest placed only by sampling the trail spline: a dense band of rows either side just
   * outside the tree-free corridor, and a sparser outer band. Never on or near the trail.
   */
  async #buildForest(rnd) {
    const species = await loadForestTreeModels();
    // Horizontal reach (trunk axis → crown edge) at scale 1, crown stretch included.
    const reach = species.map((sp) => Math.hypot(sp.crownSphere.center.x, sp.crownSphere.center.z) + sp.crownSphere.radius * F.maxStretch);
    const picks = [];
    const taken = new Set();
    const weights = F.speciesWeights;
    const pickSpecies = () => {
      let r = rnd() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
      return 0;
    };
    const { track } = this;
    const place = (sAlong, lat) => {
      const p = track.at(sAlong);
      const x = p.x - p.tz * lat;
      const z = p.z + p.tx * lat;
      const k = rnd.range(F.scaleMin, F.scaleMax);
      const species = pickSpecies();
      const cell = `${Math.round(x / 1.8)},${Math.round(z / 1.8)}`; // trunks never overlap
      if (taken.has(cell) || !this.#treeSpot(x, z, k, reach[species])) return;
      taken.add(cell);
      picks.push({ x, z, k, species });
    };
    const inner = TR.corridorHalfWidth + F.corridorMargin;
    for (const side of [-1, 1]) {
      // Dense rows just outside the corridor (the first row hugs the bush line)...
      for (let row = 0; row < F.nearRows; row++) {
        for (let s = row * F.nearStep * 0.5; s < track.length; s += F.nearStep) {
          const lat = inner + reach[0] * F.scaleMin + (row + rnd()) * (F.nearBand / F.nearRows);
          place(s + rnd.range(-F.jitter, F.jitter), side * lat);
        }
      }
      // ...and a sparser outer band.
      for (let s = 0; s < track.length; s += F.farStep) {
        place(s + rnd.range(-F.jitter * 3, F.jitter * 3), side * (inner + rnd.range(...F.farBand)));
      }
    }

    // Instanced per chunk (so off-screen chunks are frustum-culled) and per species.
    const chunks = new Map();
    for (const t of picks) {
      const key = `${Math.floor(t.x / F.chunkSize)},${Math.floor(t.z / F.chunkSize)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(t);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const list of chunks.values()) {
      species.forEach((sp, si) => {
        const trees = list.filter((t) => t.species === si);
        if (!trees.length) return;
        const { trunks, crowns } = sp.instance(trees.length);
        const items = [];
        trees.forEach((t, i) => {
          const y = this.heightAt(t.x, t.z);
          const stretch = rnd.range(0.85, F.maxStretch);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
          m.compose(p.set(t.x, y - 0.1, t.z), q, s.set(t.k, t.k * stretch, t.k));
          trunks.setMatrixAt(i, m);
          crowns.setMatrixAt(i, m);
          const b = 1 + rnd.range(-F.tintVariation, F.tintVariation);
          tint.setRGB(b * rnd.range(0.94, 1.04), b, b * rnd.range(0.92, 1.02));
          trunks.setColorAt(i, tint);
          crowns.setColorAt(i, tint);
          c.copy(sp.crownSphere.center).applyMatrix4(m);
          items.push({ x: c.x, y: c.y, z: c.z, r: sp.crownSphere.radius * t.k * Math.max(1, stretch) });
          this.cylinders.push({ x: t.x, z: t.z, r: sp.trunkRadius * t.k, top: y + sp.height * t.k * stretch, bottom: y - 1, tree: true });
          this.trees.push({ x: t.x, z: t.z, reach: reach[si] * t.k });
        });
        trunks.computeBoundingSphere();
        crowns.computeBoundingSphere();
        this.zones.forest.add(trunks, crowns);
        this.foliageSets.push({ mesh: crowns, items, bounds: crowns.boundingSphere });
      });
    }
    this.treeCount = picks.length;
  }

  /**
   * A continuous, dense line of bushes and boulders along both edges of the tree-free
   * corridor, sampled along the spline (wholly outside the corridor; none in the river).
   */
  async #buildTrackEdges(rnd) {
    const E = TR.edge;
    const { track } = this;
    const spots = [];
    for (let sAlong = 0; sAlong < track.length; sAlong += E.spacing) {
      for (const side of [-1, 1]) {
        const boulder = rnd() < E.boulderShare;
        const r = boulder ? E.boulderRadius : E.bushRadius; // max horizontal radius
        const p = track.at(sAlong + rnd.range(-E.jitter, E.jitter));
        const lat = side * (TR.corridorHalfWidth + r + rnd.range(0, E.jitter));
        const x = p.x - p.tz * lat;
        const z = p.z + p.tx * lat;
        if (this.heightAt(x, z) < Z.waterY + 0.15) continue; // not in the river
        if (track.distance(x, z, TR.corridorHalfWidth + r + 1) < TR.corridorHalfWidth + r) continue; // inside of bends
        spots.push({ x, z, r, boulder });
      }
    }
    const { bushes, boulders } = await loadTrackEdgeModels(spots.filter((t) => !t.boulder).length, spots.filter((t) => t.boulder).length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let nb = 0;
    let nr = 0;
    for (const t of spots) {
      const y = this.heightAt(t.x, t.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
      if (t.boulder) {
        const k = rnd.range(...E.boulderSize);
        boulders.setMatrixAt(nr, m.compose(p.set(t.x, y + k * 0.35, t.z), q, s.set(k * 1.25, k, k * 1.1)));
        boulders.setColorAt(nr++, col.setScalar(0.85 + rnd() * 0.3));
      } else {
        const k = rnd.range(...E.bushSize);
        bushes.setMatrixAt(nb, m.compose(p.set(t.x, y + k * 0.45, t.z), q, s.set(k * 1.2, k * 0.85, k * 1.2)));
        bushes.setColorAt(nb++, col.setHex([0x3d8a3a, 0x4e9d43, 0x356f33][Math.floor(rnd() * 3)]));
      }
    }
    bushes.computeBoundingSphere();
    boulders.computeBoundingSphere();
    this.zones.forest.add(bushes, boulders);
    this.edgeCount = spots.length;
    this.edgeItems = spots;
  }

  /**
   * Ride obstacles: solid (walkable top) for the hero on foot; the horse jumps them. Plus the
   * high stone walls (`gapWalls`): their gap and funnel are trail-wall limits (`laneAt`).
   */
  async #buildObstacles() {
    const placed = placeObstacles(this.track, this.heightAt);
    this.obstacles = placed.filter((o) => o.type !== 'gapWall');
    this.gapWalls = placed.filter((o) => o.type === 'gapWall');
    for (const w of this.gapWalls) w.base = this.heightAt(w.cx, w.cz);
    for (const o of this.obstacles) {
      o.base = Math.min(this.heightAt(o.cx - o.nx * 2, o.cz - o.nz * 2), this.heightAt(o.cx, o.cz), this.heightAt(o.cx + o.nx * 2, o.cz + o.nz * 2));
      o.top = o.base + o.height;
      const hw = o.depth / 2;
      const beam = makeBeam(o.cx - o.nx * o.halfLength, o.cz - o.nz * o.halfLength, o.cx + o.nx * o.halfLength, o.cz + o.nz * o.halfLength, o.top, hw, hw);
      this.beams.push({ ...beam, bottom: o.base - 0.1, obstacle: o });
    }
    this.zones.forest.add(await loadObstacleModels(this.obstacles.filter((o) => o.type !== 'brick')));
    this.zones.forest.add(await loadForestWallModels(this.obstacles.filter((o) => o.type === 'brick'), this.gapWalls, this.heightAt));
    // The forest hurdles' spots (hurdles.js draws and runs them); gems and checkpoints keep clear.
    this.hurdles = planHurdles(this);
  }

  /** 0..1: how far the trail's side walls have closed in toward a high wall's gap at `s`. */
  #funnel(w, s) {
    const FW = CONFIG.forestWalls;
    const a = w.s - FW.leadIn;
    const b = w.s - w.depth / 2 - 0.5;
    const c = w.s + w.depth / 2;
    if (s <= a || s >= c + FW.leadOut) return 0;
    if (s < b) return smoothstep(s, a, b);
    if (s <= c) return 1;
    return 1 - (s - c) / FW.leadOut;
  }

  /**
   * The trail's lateral limits at `s` (signed, + = right of travel): the invisible side walls,
   * narrowed smoothly into the gap of a high wall. { lo, hi, k (0..1 funnel), wall }.
   */
  laneAt(track, s) {
    const off = TR.wall.offset;
    if (track === this.track) {
      for (const w of this.gapWalls ?? []) {
        const k = this.#funnel(w, s);
        if (k > 0) return { lo: lerp(-off, w.gapLo, k), hi: lerp(off, w.gapHi, k), k, wall: w };
      }
    }
    return { lo: -off, hi: off, k: 0, wall: null };
  }

  /** The safe line's lateral offset at `s`: the centre line, moving over to each high wall's gap. */
  safeLateral(track, s) {
    if (track !== this.track) return 0;
    const FW = CONFIG.forestWalls;
    for (const w of this.gapWalls ?? []) {
      const start = w.s - FW.leadIn - FW.safeApproach;
      const full = w.s - FW.leadIn * 0.5;
      const end = w.s + w.depth / 2 + 2;
      if (s <= start || s >= end + FW.safeExit) continue;
      const k = s < full ? smoothstep(s, start, full) : s <= end ? 1 : 1 - smoothstep(s, end, end + FW.safeExit);
      return w.gapCenter * k;
    }
    return 0;
  }

  /** The high wall whose approach (safe line or funnel) `s` is in, if any. */
  gapZone(track, s) {
    if (track !== this.track) return null;
    const FW = CONFIG.forestWalls;
    return (this.gapWalls ?? []).find((w) => s > w.s - FW.leadIn - FW.safeApproach && s < w.s + w.depth / 2 + FW.leadOut + FW.safeExit) ?? null;
  }

  /**
   * The giant cave: a ring of boulders around the monster arena (opening west), a towering
   * cliff wall with a huge cave mouth on the east side, side cliffs, rock pillars and mist.
   */
  async #buildCave(rnd) {
    this.arenaRocks = [];
    const [cx, cz] = CV.center;
    const C = CV.cliff;
    const [ax, az] = CV.archPosition;
    const ay = this.heightAt(ax, az);
    const R = CV.archRadius;
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const parts = []; // {p, q, s} transforms for one instanced rock mesh
    // (rocks with a collider — the ones the hero can be pinned against — fade out of the camera's way)
    const addRock = (x, y, z, sx, sy, sz, collider) => {
      parts.push({ p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion().setFromEuler(e.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5)), s: new THREE.Vector3(sx, sy, sz), fade: !!collider });
      if (collider) this.cylinders.push(collider);
    };

    // Arena ring of boulders (opening west toward the forest, open east toward the cave).
    for (let i = 0; i < CV.rockCount; i++) {
      const a = (i / CV.rockCount) * Math.PI * 2;
      const fromWest = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
      if (fromWest < CV.openingHalfAngle) continue;
      const x = cx + Math.cos(a) * CV.radius;
      const z = cz + Math.sin(a) * CV.radius;
      if (Math.cos(a) > 0 && Math.abs(z - az) < R + CV.archTube + 3) continue; // keep the cave mouth clear
      const size = rnd.range(CV.rockSizeMin, CV.rockSizeMax);
      const y = this.heightAt(x, z);
      const collider = { x, z, r: size * CV.colliderScale, top: y + size * 2.3, bottom: y - 1, arena: true };
      addRock(x, y + size * 0.6, z, size, size * 1.7, size, collider);
      this.arenaRocks.push(collider); // the boss is stunned by charging into these
    }
    // Arena entrance: two pillars and a lintel over the west opening.
    const ox = cx - CV.radius;
    const gapHalf = Math.sin(CV.openingHalfAngle) * CV.radius;
    for (const side of [-1, 1]) {
      const z = cz + side * gapHalf;
      const y = this.heightAt(ox, z);
      parts.push({ p: new THREE.Vector3(ox, y + 6, z), q: new THREE.Quaternion(), s: new THREE.Vector3(3.2, 7.5, 3.2) });
      const pillar = { x: ox, z, r: 3, top: y + 13, bottom: y - 1, arena: true };
      this.cylinders.push(pillar);
      this.arenaRocks.push(pillar);
    }
    parts.push({ p: new THREE.Vector3(ox, this.heightAt(ox, cz) + 14, cz), q: new THREE.Quaternion().setFromEuler(e.set(0, Math.PI / 2, 0)), s: new THREE.Vector3(gapHalf + 3.5, 2.6, 3.2) });

    // Main cliff wall (north–south) behind the arena; set back around the cave mouth.
    const tunnelEnd = ax + CV.tunnelDepth;
    for (let i = 0; i < C.count; i++) {
      const z = lerp(-W.depth / 2, W.depth / 2, i / (C.count - 1)) + rnd.range(-2, 2);
      const top = rnd.range(C.height[0], C.height[1]);
      let y = this.heightAt(C.faceX, z) - 2;
      let first = true;
      while (y < top) {
        const size = rnd.range(C.rockSize[0], C.rockSize[1]);
        const nearMouth = Math.abs(z - az) < R + CV.archTube + size * 0.6 && y - size * 0.7 < R + CV.archTube;
        const x = (nearMouth ? tunnelEnd : C.faceX) + size * 0.8 + rnd.range(0, 3);
        addRock(x, y + size * 0.6, z, size, size * 1.3, size, first && !nearMouth ? { x, z, r: size * 0.85, top: top + 5, bottom: y - 3 } : null);
        y += size * 1.4;
        first = false;
      }
    }
    // Above the cave mouth: the cliff continues down to the arch.
    for (let k = -1; k <= 1; k++) {
      const size = C.rockSize[1];
      addRock(ax + size * 0.7, ay + R + CV.archTube + size * 0.9, az + k * size * 1.2, size, size, size, null);
    }
    // Side cliffs wrapping the arena (north and south).
    for (const side of [-1, 1]) {
      for (let i = 0; i < C.sideCount / 2; i++) {
        const x = lerp(cx - CV.radius + 4, C.faceX + 4, i / (C.sideCount / 2 - 1));
        const z = side * (C.sideZ + rnd.range(-3, 5));
        const top = rnd.range(C.height[0] * 0.55, C.height[1] * 0.75);
        let y = this.heightAt(x, z) - 2;
        let first = true;
        while (y < top) {
          const size = rnd.range(C.rockSize[0] * 0.8, C.rockSize[1] * 0.9);
          addRock(x, y + size * 0.6, z + side * size * 0.5, size, size * 1.3, size, first ? { x, z: z + side * size * 0.5, r: size * 0.85, top: top + 5, bottom: y - 3 } : null);
          y += size * 1.4;
          first = false;
        }
      }
    }
    // Tall rock pillars around the arena.
    for (const [x, z, h] of CV.pillars) {
      const y = this.heightAt(x, z);
      const r = CV.pillarRadius;
      for (let yy = 0; yy < h; yy += r * 2.6) {
        const k = 1 - (yy / h) * 0.35;
        addRock(x + rnd.range(-0.5, 0.5), y + yy + r * 1.3, z + rnd.range(-0.5, 0.5), r * k * 1.15, r * 1.6, r * k * 1.15, null);
      }
      this.cylinders.push({ x, z, r: r * 1.1, top: y + h, bottom: y - 1 });
    }

    // The giant cave: cliffs, arena boulders and the cave mouth (one swappable model).
    this.cave = await loadCaveModel(parts, new THREE.Vector3(ax, ay, az));
    this.scene.add(this.cave);
    if (this.cave.userData.fadeRocks) {
      this.fadeSets.push(this.cave.userData.fadeRocks);
      // The camera keeps out of the boulders' real shape too (they stick out past their colliders).
      const mesh = this.cave.userData.fadeRocks.mesh;
      this.cave.updateMatrixWorld(true);
      mesh.computeBoundingSphere();
      this.cameraMeshes.push(mesh);
    }
    this.caveArch = new THREE.Vector3(ax, ay, az);
    for (const side of [-1, 1]) {
      this.cylinders.push({ x: ax, z: az + side * R, r: CV.archTube, top: ay + R + CV.archTube, bottom: ay - 1 });
    }
    // The mouth is solid for now (the cave interior comes with the boss).
    this.boxes.push({ minX: ax + 0.4, maxX: tunnelEnd, minZ: az - R, maxZ: az + R, top: ay + R * 1.05, bottom: ay - 1, route: false });

    // Mist drifting at the base of the cliffs.
    this.mist = await loadMistModel(rnd, ax, az);
    this.scene.add(this.mist);
  }

  /**
   * The desert beyond the cave: cacti and rocks off the trail and a soft edge of pebbles and
   * dry tufts, all placed by sampling the desert spline (never inside the trail corridor),
   * and the castle on the horizon past the trail's end.
   */
  async #buildDesert(rnd) {
    const track = this.desertTrack;
    const corridor = TR.corridorHalfWidth;
    const items = [];
    const pit = this.pitPosition;
    const ok = (x, z, r) =>
      Math.hypot(x - pit.x, z - pit.z) > DS.pit.radius + DS.pit.clearance + r &&
      x > DS.startX + 4 &&
      x < W.xMax - 26 &&
      z > W.zMin + 26 &&
      z < W.zMax - 26 &&
      Math.hypot(x - this.courtyardAt.x, z - this.courtyardAt.z) > DS.castle.courtyard.flat[1] + r && // (nothing growing in the castle courtyard)
      track.distance(x, z, corridor + r + 1) > corridor + r;
    const along = (step, band, kind, r0, scale) => {
      for (let s = rnd() * step; s < track.length; s += step) {
        for (const side of [-1, 1]) {
          const p = track.at(s + rnd.range(-step * 0.4, step * 0.4));
          const k = rnd.range(...scale);
          const r = r0 * k;
          const lat = side * (corridor + r + rnd.range(...band));
          const x = p.x - p.tz * lat;
          const z = p.z + p.tx * lat;
          if (ok(x, z, r)) items.push({ kind, x, z, k, r });
        }
      }
    };
    along(DS.cacti.step, DS.cacti.band, 'cactus', 0.9, DS.cacti.scale);
    along(DS.rocks.step, DS.rocks.band, 'rock', 1.1, DS.rocks.scale);
    // Soft edge: a broken line of pebbles and dry tufts along both corridor edges.
    for (let s = 0; s < track.length; s += DS.edge.step) {
      for (const side of [-1, 1]) {
        const p = track.at(s + rnd.range(-1, 1));
        const k = rnd.range(...DS.edge.scale);
        const lat = side * (corridor + k + rnd.range(0, 0.8));
        const x = p.x - p.tz * lat;
        const z = p.z + p.tx * lat;
        if (ok(x, z, k)) items.push({ kind: rnd() < DS.edge.tuftShare ? 'tuft' : 'pebble', x, z, k, r: k });
      }
    }
    const count = (kind) => items.filter((t) => t.kind === kind).length;
    const meshes = await loadDesertSceneryModels({ cacti: count('cactus'), rocks: count('rock'), pebbles: count('pebble'), tufts: count('tuft') });
    const idx = { cactus: 0, rock: 0, pebble: 0, tuft: 0 };
    const target = { cactus: meshes.cacti, rock: meshes.rocks, pebble: meshes.pebbles, tuft: meshes.tufts };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    for (const t of items) {
      const y = this.heightAt(t.x, t.z);
      q.setFromEuler(e.set(t.kind === 'cactus' ? 0 : rnd() * 0.4, rnd() * Math.PI * 2, 0));
      if (t.kind === 'cactus') sc.setScalar(t.k);
      else if (t.kind === 'rock') sc.set(t.k * 1.3, t.k * 0.8, t.k);
      else if (t.kind === 'pebble') sc.set(t.k, t.k * 0.6, t.k * 0.9);
      else sc.set(t.k * 0.9, t.k, t.k * 0.9);
      const mesh = target[t.kind];
      mesh.setMatrixAt(idx[t.kind], m.compose(p.set(t.x, y - (t.kind === 'rock' ? t.k * 0.25 : 0), t.z), q, sc));
      mesh.setColorAt(idx[t.kind]++, col.setScalar(0.85 + rnd() * 0.3));
    }
    for (const mesh of Object.values(meshes)) {
      mesh.computeBoundingSphere();
      this.zones.desert.add(mesh);
    }
    this.desertItems = items;

    // The castle, past the end of the trail, facing back along it (placed in the constructor).
    const C = this.castleAt;
    this.castle = await loadCastleModel();
    this.castle.position.set(C.x, C.y, C.z);
    this.castle.rotation.y = C.rot;
    this.zones.desert.add(this.castle);
    this.castlePosition = this.castle.position.clone();
  }
}
