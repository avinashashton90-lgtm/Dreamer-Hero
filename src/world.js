import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

const W = CONFIG.world;
const Z = CONFIG.zones;
const R = CONFIG.rooftops;
const T = CONFIG.treeRoute;
const F = CONFIG.forest;
const CV = CONFIG.cave;
const SKY = CONFIG.sky;
const WATER = CONFIG.water;
const FOL = CONFIG.foliage;

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

/** Z of the ground route (sand bank → forest → cave) at a given X. */
export function pathZ(x) {
  return W.pathAmplitude * Math.sin(x * W.pathFrequency);
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

export function createHeightFn(layout) {
  const halfD = W.depth / 2;
  const halfW = W.width / 2;
  return function heightAt(x, z) {
    // Base height per zone, blended across boundaries.
    const forestH =
      Z.forestHillHeight *
      (0.5 + 0.5 * Math.sin(x * Z.forestHillScale) * Math.cos(z * Z.forestHillScale * 1.3));
    const desertH =
      Z.desertDuneHeight * (0.5 + 0.5 * Math.sin(x * Z.desertDuneScale + Math.sin(z * Z.desertDuneScale * 2)));
    let h = Z.sandHeight;
    h = lerp(h, forestH, smoothstep(x, Z.forestStart - 3, Z.forestStart + 3));
    h = lerp(h, 0, smoothstep(x, Z.caveStart - 4, Z.caveStart + 4));
    h = lerp(h, desertH, smoothstep(x, Z.desertStart - 4, Z.desertStart + 4));
    h = lerp(0, h, smoothstep(x, layout.hazardEndX - 0.5, layout.hazardEndX + 2));

    // River channel.
    const dr = Math.abs(x - riverCenterX(z));
    h = lerp(Z.riverBedY, h, smoothstep(dr, Z.riverHalfWidth - 2, Z.riverHalfWidth + 1));

    // Boundary hills keep the player inside the map.
    const edge = Math.max(
      smoothstep(Math.abs(z), W.edgeHillStart, halfD),
      smoothstep(Math.abs(x), halfW - 10, halfW),
    );
    h += edge * W.edgeHillHeight * (0.7 + 0.3 * Math.sin(x * 0.11 + z * 0.07));
    return h;
  };
}

// ---------------------------------------------------------------------------
// Swappable placeholder models
// ---------------------------------------------------------------------------

/** Placeholder terrain: one vertex-coloured grid. Keep heightAt() in sync if swapped. */
export async function loadTerrainModel(heightAt, layout) {
  const geo = new THREE.PlaneGeometry(W.width, W.depth, W.segmentsX, W.segmentsZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const C = Object.fromEntries(Object.entries(W.colors).map(([k, v]) => [k, new THREE.Color(v)]));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    if (x < layout.townEndX) c.copy(C.street);
    else if (x < layout.hazardEndX) c.copy(C.swamp);
    else if (x < Z.forestStart) c.copy(C.sand);
    else if (x < Z.caveStart) c.copy(C.grass);
    else if (x < Z.desertStart) c.copy(C.rock);
    else c.copy(C.desert);
    if (y < Z.riverBedY + 0.6 && x >= layout.hazardEndX) c.copy(C.riverBed);
    if (y > 3 && x < Z.desertStart) c.lerp(C.rock, smoothstep(y, 3, 12)); // boundary hills
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
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true });
  leafMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = instanceFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
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
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(plan.leaves.length).fill(1), 1);
  fade.setUsage(THREE.DynamicDrawUsage);
  leafGeo.setAttribute('instanceFade', fade);
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
 * Placeholder forest trees: three species (conifer, broadleaf, birch), each one merged,
 * vertex-coloured geometry drawn as a single InstancedMesh. Returns per-species meshes and
 * the collider radius / height at scale 1.
 */
export async function loadForestTreeModels(counts) {
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
        paint(new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.7, 0), 0x3f8f3a),
        paint(new THREE.IcosahedronGeometry(1.3, 1).translate(1.15, 3.1, 0.4), 0x4d9e42),
        paint(new THREE.IcosahedronGeometry(1.25, 1).translate(-0.95, 3.3, -0.6), 0x36803a),
        paint(new THREE.IcosahedronGeometry(1.05, 1).translate(0.2, 4.7, 0.5), 0x57a84a),
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
        paint(new THREE.IcosahedronGeometry(1, 1).scale(1, 1.7, 1).translate(0, 4.8, 0), 0x86c25a),
        paint(new THREE.IcosahedronGeometry(0.75, 1).scale(1, 1.4, 1).translate(0.55, 3.7, 0.2), 0x9bd066),
        paint(new THREE.IcosahedronGeometry(0.6, 1).scale(1, 1.3, 1).translate(-0.45, 3.5, -0.3), 0x7db851),
      ],
      trunkRadius: 0.18,
      height: 6.4,
    },
  ];
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return species.map((sp, i) => ({
    mesh: new THREE.InstancedMesh(mergeGeometries(sp.parts), material, Math.max(1, counts[i])),
    trunkRadius: sp.trunkRadius,
    height: sp.height,
  }));
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
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < SKY.cloudCount; i++) {
    const cx = rnd.range(-W.width * 0.7, W.width * 0.7);
    const cz = rnd.range(-W.depth * 0.8, W.depth * 0.8);
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
    this.heightAt = createHeightFn(this.layout);

    // Colliders. boxes: buildings (standable tops + walls). beams: horizontal branches
    // (standable flat top + sides). cylinders: solid round obstacles (trunks, rocks).
    this.boxes = [];
    this.beams = [];
    this.cylinders = [];
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

    this.terrain = await loadTerrainModel(this.heightAt, layout);
    this.scene.add(this.terrain);

    this.#buildWater();
    await this.#buildTown();
    await this.#buildGiantTrees(rnd);
    await this.#buildForest(rnd);
    await this.#buildCave(rnd);
  }

  /** Per-frame cosmetic updates. */
  update(dt, cameraPosition) {
    this.time += dt;
    this.sky.position.copy(cameraPosition);
    this.river.position.y = Z.waterY + Math.sin(this.time * WATER.waveSpeed) * WATER.waveHeight;
  }

  /**
   * Fades leaf clusters that block the camera→hero line or sit close to the hero, so
   * jumps stay readable. Cheap: one segment/sphere test per nearby cluster.
   */
  updateFoliage(dt, cameraPos, focus) {
    const { mesh, items } = this.foliage;
    const attr = mesh.geometry.attributes.instanceFade;
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
  }

  // --- Queries used by the hero ---

  /** True where touching the terrain means a fall (town streets, swamp under the trees). */
  isHazard(x) {
    return x < this.layout.hazardEndX;
  }

  /**
   * Highest standable surface under (x,z) whose top is at or below maxY.
   * `grace` widens platforms so standing half over an edge still counts.
   * @returns {{y:number, platform:object|null}}
   */
  groundAt(x, z, maxY, grace = 0) {
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
      if (b.top > maxY || b.top <= y) continue;
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
   * Velocity components into a wall are removed.
   */
  collide(pos, vel, radius, height, stepUp) {
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
      if (b.top <= feet + stepUp || b.bottom >= head) continue;
      const t = clamp(((pos.x - b.x0) * b.ux + (pos.z - b.z0) * b.uz) / b.len, 0, 1);
      const cx = b.x0 + b.ux * b.len * t;
      const cz = b.z0 + b.uz * b.len * t;
      pushOut(pos, vel, pos.x - cx, pos.z - cz, lerp(b.hw0, b.hw1, t) + radius);
    }
  }

  // --- Builders ---

  #buildWater() {
    const geo = new THREE.PlaneGeometry(Z.riverHalfWidth * 2 + 4, W.depth, 6, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + riverCenterX(pos.getZ(i)));
    geo.computeVertexNormals();
    this.river = new THREE.Mesh(geo, makeWater(WATER.color, WATER.opacity));
    this.river.position.y = Z.waterY;
    this.scene.add(this.river);

    const { townEndX, hazardEndX } = this.layout;
    const swampW = hazardEndX - townEndX;
    const swamp = new THREE.Mesh(
      new THREE.PlaneGeometry(swampW, W.depth).rotateX(-Math.PI / 2),
      makeWater(WATER.swampColor, WATER.swampOpacity),
    );
    swamp.position.set(townEndX + swampW / 2, 0.05, 0);
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
    this.foliage = {
      mesh: trees.userData.leaves,
      items: plan.leaves.map((l) => ({ x: l.p.x, y: l.p.y, z: l.p.z, r: Math.max(l.scale.x, l.scale.y, l.scale.z) })),
    };
  }

  /** Forest and edge trees: three species, varied size, shape and tint. */
  async #buildForest(rnd) {
    const halfD = W.depth / 2 - 4;
    const picks = [];
    const weights = F.speciesWeights;
    const pickSpecies = () => {
      let r = rnd() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
      return 0;
    };
    const clearOfRoute = (x, z, k) =>
      Math.abs(z - pathZ(x)) > W.pathHalfWidth + 1.6 * k &&
      Math.abs(x - riverCenterX(z)) > Z.riverHalfWidth + 2 &&
      Math.hypot(x - CONFIG.horse.position[0], z - CONFIG.horse.position[1]) > 8;
    const tryPlace = (x, z) => {
      const k = rnd.range(F.scaleMin, F.scaleMax);
      if (clearOfRoute(x, z, k)) picks.push({ x, z, k, species: pickSpecies() });
    };

    for (let tries = 0; picks.length < F.count && tries < F.count * 20; tries++) {
      tryPlace(rnd.range(Z.forestStart + 2, Z.caveStart - 3), rnd.range(-halfD, halfD));
    }
    // Trees along the sand bank and desert edges frame the map.
    const total = F.count + F.edgeCount;
    for (let tries = 0; picks.length < total && tries < F.edgeCount * 20; tries++) {
      const x = rnd.range(this.layout.hazardEndX + 4, W.width / 2 - 6);
      if (x > Z.caveStart - 2 && x < Z.desertStart + 2) continue;
      tryPlace(x, (rnd() < 0.5 ? -1 : 1) * rnd.range(W.edgeHillStart - 22, W.edgeHillStart));
    }

    const counts = [0, 1, 2].map((i) => picks.filter((p) => p.species === i).length);
    const species = await loadForestTreeModels(counts);
    const used = [0, 0, 0];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const t of picks) {
      const sp = species[t.species];
      const y = this.heightAt(t.x, t.z);
      const stretch = rnd.range(0.85, 1.2);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
      m.compose(p.set(t.x, y - 0.1, t.z), q, s.set(t.k, t.k * stretch, t.k));
      const i = used[t.species]++;
      sp.mesh.setMatrixAt(i, m);
      const b = 1 + rnd.range(-F.tintVariation, F.tintVariation);
      sp.mesh.setColorAt(i, tint.setRGB(b * rnd.range(0.94, 1.04), b, b * rnd.range(0.92, 1.02)));
      this.cylinders.push({ x: t.x, z: t.z, r: sp.trunkRadius * t.k, top: y + sp.height * t.k * stretch, bottom: y - 1 });
    }
    species.forEach((sp, i) => {
      sp.mesh.count = used[i];
      this.scene.add(sp.mesh);
    });
  }

  async #buildCave(rnd) {
    const [cx, cz] = CV.center;
    const rocks = await loadRockModel(CV.rockCount + 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    let k = 0;
    for (let i = 0; i < CV.rockCount; i++) {
      const a = (i / CV.rockCount) * Math.PI * 2;
      const fromWest = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
      if (fromWest < CV.openingHalfAngle) continue; // the arena opening faces the forest
      const size = rnd.range(CV.rockSizeMin, CV.rockSizeMax);
      const x = cx + Math.cos(a) * CV.radius;
      const z = cz + Math.sin(a) * CV.radius;
      const y = this.heightAt(x, z);
      p.set(x, y + size * 0.6, z);
      q.setFromEuler(e.set(rnd() * 0.6, rnd() * Math.PI * 2, rnd() * 0.6));
      s.set(size, size * 1.7, size);
      rocks.setMatrixAt(k++, m.compose(p, q, s));
      this.cylinders.push({ x, z, r: size * CV.colliderScale, top: y + size * 2.3, bottom: y - 1 });
    }
    // Arch over the opening: two pillars and a lintel.
    const ox = cx - CV.radius;
    const gapHalf = Math.sin(CV.openingHalfAngle) * CV.radius;
    for (const side of [-1, 1]) {
      const z = cz + side * gapHalf;
      const y = this.heightAt(ox, z);
      p.set(ox, y + 4, z);
      q.identity();
      s.set(2.2, 5, 2.2);
      rocks.setMatrixAt(k++, m.compose(p, q, s));
      this.cylinders.push({ x: ox, z, r: 2, top: y + 9, bottom: y - 1 });
    }
    p.set(ox, this.heightAt(ox, cz) + 9.5, cz);
    q.setFromEuler(e.set(0, Math.PI / 2, 0));
    s.set(gapHalf + 2.5, 2, 2.4);
    rocks.setMatrixAt(k++, m.compose(p, q, s));
    rocks.count = k;
    this.scene.add(rocks);
  }
}
