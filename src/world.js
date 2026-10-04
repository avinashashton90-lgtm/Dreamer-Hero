import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

export function createHeightFn(layout, track) {
  const halfW = W.width / 2;
  return function heightAt(x, z) {
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

    // Boundary hills keep the player inside the map; a ridge closes the swamp off to the north.
    const edge = Math.max(
      smoothstep(-z, -(W.zMin + 22), -W.zMin),
      smoothstep(z, W.zMax - 22, W.zMax),
      smoothstep(Math.abs(x), halfW - 10, halfW),
      smoothstep(z, W.ridge.z[0], W.ridge.z[0] + 14) * (1 - smoothstep(z, W.ridge.z[1] - 12, W.ridge.z[1])) * (1 - smoothstep(x, W.ridge.x - 6, W.ridge.x + 4)),
    );
    h += edge * W.edgeHillHeight * (0.7 + 0.3 * Math.sin(x * 0.11 + z * 0.07));

    // Flat floor in front of and inside the giant cave mouth (no dunes poking into the tunnel).
    const [ax, az] = CV.archPosition;
    const cave = smoothstep(x, ax - 6, ax) * (1 - smoothstep(Math.abs(z - az), CV.archRadius - 1, CV.archRadius + 4));
    h = lerp(h, 0, cave);
    return h;
  };
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
      if (s - O.runUp < 30 || s + O.runOut > L - CONFIG.obstacles.arenaClear) continue;
      if (list.some((o) => s > o.s - O.runUp - O.runOut && s < o.s + O.runUp + O.runOut)) continue;
      const k = track.maxCurvature(s - O.straightBefore, s + O.straightAfter);
      if (k > O.maxCurvature || wet(s - O.runUp, s + O.runOut)) continue;
      const score = k + Math.abs(s - frac * L) * 1e-5; // straightest, then closest to target
      if (!best || score < best.score) best = { s, score };
    }
    if (!best) return; // no fair spot near this fraction: skip it rather than force a bad one
    const type = i === O.wallIndex ? 'wall' : 'log';
    const p = track.at(best.s);
    list.push({ type, ...O.types[type], s: best.s, cx: p.x, cz: p.z, dx: p.tx, dz: p.tz, nx: -p.tz, nz: p.tx, halfLength: O.halfLength });
  });
  return list.sort((a, b) => a.s - b.s);
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

/** Placeholder ride obstacles (instanced per kind): logs, low stone walls, hurdles. */
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
  const hurdles = obstacles.filter((o) => o.type === 'hurdle');
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
  if (hurdles.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      hurdles.length * 6,
    );
    const white = new THREE.Color(T.hurdle.color);
    const red = new THREE.Color(0xd62828);
    let k = 0;
    hurdles.forEach((o) => {
      q.setFromUnitVectors(X, across.set(o.nx, 0, o.nz));
      for (const t of [-o.halfLength, 0, o.halfLength]) {
        mesh.setMatrixAt(k, m.compose(p.set(o.cx + o.nx * t, o.base + o.height / 2, o.cz + o.nz * t), q, s.set(0.16, o.height, 0.16)));
        mesh.setColorAt(k++, white);
      }
      for (const [y, c] of [[o.height - 0.08, red], [o.height * 0.55, white]]) {
        mesh.setMatrixAt(k, m.compose(p.set(o.cx, o.base + y, o.cz), q, s.set(o.halfLength * 2, 0.1, 0.1)));
        mesh.setColorAt(k++, c);
      }
      // Third slot: a striped middle rail segment for readability.
      mesh.setMatrixAt(k, m.compose(p.set(o.cx, o.base + o.height - 0.08, o.cz), q, s.set(1.4, 0.12, 0.12)));
      mesh.setColorAt(k++, white);
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
    const cx = rnd.range(-W.width * 0.7, W.width * 0.7);
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
    this.track = new Track();
    this.heightAt = createHeightFn(this.layout, this.track);

    // Colliders. boxes: buildings (standable tops + walls). beams: horizontal branches
    // (standable flat top + sides). cylinders: solid round obstacles (trunks, rocks).
    this.boxes = [];
    this.beams = [];
    this.cylinders = [];
    // Fadeable foliage: [{ mesh (InstancedMesh with instanceFade), items: [{x,y,z,r}] }].
    this.foliageSets = [];
    this.time = 0;
  }

  async init() {
    const L = CONFIG.lights;
    this.scene.add(new THREE.AmbientLight(0xffffff, L.ambient));
    this.scene.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity));
    const sun = new THREE.DirectionalLight(0xffffff, L.sunIntensity);
    sun.position.set(...L.sunPosition);
    this.scene.add(sun); // no shadow maps by design (mobile perf)

    const { layout } = this;
    const rnd = layout.rnd;

    this.sky = makeSky();
    this.scene.add(this.sky, makeClouds(rnd));

    this.terrain = await loadTerrainModel(this.heightAt, layout, this.track);
    this.scene.add(this.terrain);

    this.#buildWater();
    await this.#buildTown();
    await this.#buildGiantTrees(rnd);
    await this.#buildForest(rnd);
    await this.#buildTrackEdges(rnd);
    await this.#buildObstacles();
    await this.#buildCave(rnd);
  }

  /** Per-frame cosmetic updates. */
  update(dt, cameraPosition) {
    this.time += dt;
    this.sky.position.copy(cameraPosition);
    this.river.position.y = Z.waterY + Math.sin(this.time * WATER.waveSpeed) * WATER.waveHeight;
    if (this.mist) {
      this.mist.position.x = Math.sin(this.time * 0.13) * CV.mist.drift * 3;
      this.mist.position.z = Math.cos(this.time * 0.09) * CV.mist.drift * 4;
    }
  }

  /**
   * Fades leaf clusters that block the camera→hero line or sit close to the hero, so
   * jumps stay readable. Cheap: one segment/sphere test per nearby cluster.
   */
  updateFoliage(dt, cameraPos, focus) {
    for (const set of this.foliageSets) this.#fadeSet(set, dt, cameraPos, focus);
  }

  #fadeSet({ mesh, items, bounds }, dt, cameraPos, focus) {
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
        if (d2 < near2) target = FOL.fadeOpacity;
        else {
          const t = clamp((dx * sx + dy * sy + dz * sz) / segLen2, 0, 1);
          const ex = dx - sx * t;
          const ey = dy - sy * t;
          const ez = dz - sz * t;
          const rr = it.r * FOL.blockScale;
          if (ex * ex + ey * ey + ez * ez < rr * rr) target = FOL.fadeOpacity;
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
   * `ignoreObstacles` skips the ride obstacles (logs, walls, hurdles).
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
   * Pushes a vertical capsule (feet at pos.y) out of walls and solid cylinders.
   * Obstacles whose top is within `stepUp` of the feet are ignored (they are floor).
   * `ignoreObstacles` skips the ride obstacles (the horse jumps / stumbles over them instead).
   * Velocity components into a wall are removed.
   */
  collide(pos, vel, radius, height, stepUp, ignoreObstacles = false) {
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
    this.scene.add(this.river);

    const { townEndX, hazardEndX } = this.layout;
    const swampW = hazardEndX - townEndX;
    const swamp = new THREE.Mesh(
      new THREE.PlaneGeometry(swampW, W.ridge.z[0] + 10 - W.zMin).rotateX(-Math.PI / 2),
      makeWater(WATER.swampColor, WATER.swampOpacity),
    );
    swamp.position.set(townEndX + swampW / 2, 0.05, (W.ridge.z[0] + 10 + W.zMin) / 2);
    this.scene.add(swamp);
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
    this.scene.add(await loadBuildingModels(buildings));
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
    this.scene.add(trees);
    // Cluster bounds for the foliage fade and camera collision (index = instance index).
    this.foliageSets.push({
      mesh: trees.userData.leaves,
      items: plan.leaves.map((l) => ({ x: l.p.x, y: l.p.y, z: l.p.z, r: Math.max(l.scale.x, l.scale.y, l.scale.z) })),
    });
  }

  /** May a tree (scale k) stand here? Off the trail, river, arena, cliffs, swamp and town. */
  #treeSpot(x, z, k) {
    const hw = W.width / 2 - 6;
    if (x < -hw || x > hw || z < W.zMin + 8 || z > W.zMax - 8) return false;
    if (inSouthRegion(z) && x < this.layout.hazardEndX + 3) return false;
    if (Math.abs(x - riverCenterX(z)) < Z.riverHalfWidth + 2.5) return false;
    const [cx, cz] = CV.center;
    if (Math.hypot(x - cx, z - cz) < CV.radius + 6) return false;
    if (x > CV.cliff.faceX - 8 && z < 120) return false;
    if (Math.hypot(x - CONFIG.horse.position[0], z - CONFIG.horse.position[1]) < 8) return false;
    const keep = TR.halfWidth + TR.edge.offset + F.trailClearance + 1.2 * k;
    return this.track.distance(x, z, keep + 1) > keep;
  }

  /** Dense forest along both sides of the trail plus a scattering everywhere else. */
  async #buildForest(rnd) {
    const picks = [];
    const taken = new Set();
    const weights = F.speciesWeights;
    const pickSpecies = () => {
      let r = rnd() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
      return 0;
    };
    const tryPlace = (x, z) => {
      const k = rnd.range(F.scaleMin, F.scaleMax);
      const cell = `${Math.round(x / 1.8)},${Math.round(z / 1.8)}`; // trunks never overlap
      if (taken.has(cell) || !this.#treeSpot(x, z, k)) return;
      taken.add(cell);
      picks.push({ x, z, k, species: pickSpecies() });
    };
    const { track } = this;
    const edge = TR.halfWidth + TR.edge.offset + F.trailClearance;
    // A dense band either side of the trail...
    for (let tries = 0; picks.length < F.count && tries < F.count * 12; tries++) {
      const p = track.at(rnd() * track.length);
      const lat = (rnd() < 0.5 ? -1 : 1) * (edge + 1.5 + rnd() ** 1.5 * F.nearPathBand);
      tryPlace(p.x - p.tz * lat, p.z + p.tx * lat);
    }
    // ...and a scattering everywhere else.
    const total = picks.length + F.farCount;
    for (let tries = 0; picks.length < total && tries < F.farCount * 20; tries++) {
      tryPlace(rnd.range(-W.width / 2, W.width / 2), rnd.range(W.zMin, W.zMax));
    }

    // Instanced per chunk (so off-screen chunks are frustum-culled) and per species.
    const chunks = new Map();
    for (const t of picks) {
      const key = `${Math.floor(t.x / F.chunkSize)},${Math.floor(t.z / F.chunkSize)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(t);
    }
    const species = await loadForestTreeModels();
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
          const stretch = rnd.range(0.85, 1.2);
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
          this.cylinders.push({ x: t.x, z: t.z, r: sp.trunkRadius * t.k, top: y + sp.height * t.k * stretch, bottom: y - 1 });
        });
        trunks.computeBoundingSphere();
        crowns.computeBoundingSphere();
        this.scene.add(trunks, crowns);
        this.foliageSets.push({ mesh: crowns, items, bounds: crowns.boundingSphere });
      });
    }
    this.treeCount = picks.length;
  }

  /** A soft fence of bushes and boulders just outside both trail edges (no colliders). */
  async #buildTrackEdges(rnd) {
    const E = TR.edge;
    const { track } = this;
    const spots = [];
    for (let sAlong = 3; sAlong < track.length - 6; sAlong += E.spacing) {
      for (const side of [-1, 1]) {
        if (rnd() < E.gapChance) continue;
        const sj = sAlong + rnd.range(-1, 1);
        const p = track.at(sj);
        const lat = side * (TR.halfWidth + E.offset + rnd.range(-0.3, 0.5));
        const x = p.x - p.tz * lat;
        const z = p.z + p.tx * lat;
        if (this.heightAt(x, z) < Z.waterY + 0.15) continue; // not in the ford
        if (track.distance(x, z, TR.halfWidth + 1) < TR.halfWidth + 0.8) continue; // inside of bends
        spots.push({ x, z, boulder: rnd() < E.boulderShare });
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
        boulders.setMatrixAt(nr, m.compose(p.set(t.x, y + k * 0.35, t.z), q, s.set(k * 1.3, k, k * 1.1)));
        boulders.setColorAt(nr++, col.setScalar(0.85 + rnd() * 0.3));
      } else {
        const k = rnd.range(...E.bushSize);
        bushes.setMatrixAt(nb, m.compose(p.set(t.x, y + k * 0.45, t.z), q, s.set(k * 1.2, k * 0.85, k * 1.2)));
        bushes.setColorAt(nb++, col.setHex([0x3d8a3a, 0x4e9d43, 0x356f33][Math.floor(rnd() * 3)]));
      }
    }
    bushes.computeBoundingSphere();
    boulders.computeBoundingSphere();
    this.scene.add(bushes, boulders);
    this.edgeCount = spots.length;
  }

  /** Ride obstacles: solid (walkable top) for the hero on foot; the horse jumps them. */
  async #buildObstacles() {
    this.obstacles = placeObstacles(this.track, this.heightAt);
    for (const o of this.obstacles) {
      o.base = Math.min(this.heightAt(o.cx - o.nx * 2, o.cz - o.nz * 2), this.heightAt(o.cx, o.cz), this.heightAt(o.cx + o.nx * 2, o.cz + o.nz * 2));
      o.top = o.base + o.height;
      const hw = o.depth / 2;
      const beam = makeBeam(o.cx - o.nx * o.halfLength, o.cz - o.nz * o.halfLength, o.cx + o.nx * o.halfLength, o.cz + o.nz * o.halfLength, o.top, hw, hw);
      this.beams.push({ ...beam, bottom: o.base - 0.1, obstacle: o });
    }
    this.scene.add(await loadObstacleModels(this.obstacles));
  }

  /**
   * The giant cave: a ring of boulders around the monster arena (opening west), a towering
   * cliff wall with a huge cave mouth on the east side, side cliffs, rock pillars and mist.
   */
  async #buildCave(rnd) {
    const [cx, cz] = CV.center;
    const C = CV.cliff;
    const [ax, az] = CV.archPosition;
    const ay = this.heightAt(ax, az);
    const R = CV.archRadius;
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const parts = []; // {p, q, s} transforms for one instanced rock mesh
    const addRock = (x, y, z, sx, sy, sz, collider) => {
      parts.push({ p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion().setFromEuler(e.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5)), s: new THREE.Vector3(sx, sy, sz) });
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
      addRock(x, y + size * 0.6, z, size, size * 1.7, size, { x, z, r: size * CV.colliderScale, top: y + size * 2.3, bottom: y - 1 });
    }
    // Arena entrance: two pillars and a lintel over the west opening.
    const ox = cx - CV.radius;
    const gapHalf = Math.sin(CV.openingHalfAngle) * CV.radius;
    for (const side of [-1, 1]) {
      const z = cz + side * gapHalf;
      const y = this.heightAt(ox, z);
      parts.push({ p: new THREE.Vector3(ox, y + 6, z), q: new THREE.Quaternion(), s: new THREE.Vector3(3.2, 7.5, 3.2) });
      this.cylinders.push({ x: ox, z, r: 3, top: y + 13, bottom: y - 1 });
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

    const rocks = await loadRockModel(parts.length);
    rocks.material.color.set(C.color);
    const col = new THREE.Color();
    parts.forEach((pt, i) => {
      rocks.setMatrixAt(i, m.compose(pt.p, pt.q, pt.s));
      rocks.setColorAt(i, col.setScalar(0.85 + ((i * 0.618) % 1) * 0.3));
    });
    rocks.count = parts.length;
    this.scene.add(rocks);

    // Giant cave mouth.
    const arch = await loadCaveArchModel();
    arch.position.set(ax, ay, az);
    this.scene.add(arch);
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
}
