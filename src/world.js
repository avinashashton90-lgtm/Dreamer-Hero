import * as THREE from 'three';
import { CONFIG } from './config.js';

const W = CONFIG.world;
const Z = CONFIG.zones;
const R = CONFIG.rooftops;
const T = CONFIG.treeRoute;
const F = CONFIG.forest;
const CV = CONFIG.cave;
const SKY = CONFIG.sky;
const WATER = CONFIG.water;

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

// ---------------------------------------------------------------------------
// Layout: the jumpable route (rooftops then tree pads), generated so every
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

  const pads = [];
  const startTop = Math.min(h, roofs[roofs.length - 1].top); // never jump up into the trees
  for (let i = 0; i < T.count; i++) {
    const r = rnd.range(T.padRadiusMin, T.padRadiusMax);
    z = clamp(z + rnd.range(-T.zWiggle, T.zWiggle), -T.zWiggle * 2, T.zWiggle * 2);
    const top = lerp(startTop, T.endHeight, i / (T.count - 1));
    pads.push({ x: x + r, z, r, top, bottom: top - T.padThickness, route: true });
    x += 2 * r + rnd.range(T.gapMin, T.gapMax);
  }
  const lastPad = pads[pads.length - 1];
  const hazardEndX = lastPad.x; // town streets and the swamp under the trees end here

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

  return { roofs, fillers, pads, townEndX, hazardEndX, rnd };
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

/** Placeholder giant trees with standable pads (instanced). */
export async function loadTreeRouteModels(pads) {
  const n = pads.length;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.75, 1, 1, 8).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: T.trunkColor }),
    n,
  );
  const padMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 0.85, 1, 14).translate(0, -0.5, 0),
    new THREE.MeshLambertMaterial({ color: T.padColor }),
    n,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: T.canopyColor, flatShading: true }),
    n,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  pads.forEach((pad, i) => {
    m.makeScale(T.trunkRadius, pad.top + T.canopyLift, T.trunkRadius).setPosition(pad.x, 0, pad.z);
    trunks.setMatrixAt(i, m);
    m.makeScale(pad.r, T.padThickness, pad.r).setPosition(pad.x, pad.top, pad.z);
    padMesh.setMatrixAt(i, m);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 1.3);
    s.set(T.canopyRadius, T.canopyRadius * 0.8, T.canopyRadius);
    p.set(pad.x, pad.top + T.canopyLift, pad.z);
    canopy.setMatrixAt(i, m.compose(p, q, s));
  });
  const group = new THREE.Group();
  group.add(trunks, padMesh, canopy);
  return group;
}

/** Placeholder low-poly forest tree, instanced. Returns meshes to fill with matrices. */
export async function loadTreeModel(count) {
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(0, 1, 0);
  const leafGeo = new THREE.ConeGeometry(1.6, 3.5, 7).translate(0, 3.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4b2a }), count);
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshLambertMaterial({ color: 0x2f8a3c, flatShading: true }),
    count,
  );
  const group = new THREE.Group();
  group.add(trunks, leaves);
  return { group, trunks, leaves };
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

    // Colliders. boxes: buildings (standable tops + walls). discs: standable pads.
    // cylinders: solid round obstacles (trunks, rocks).
    this.boxes = [];
    this.discs = [];
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
    await this.#buildTreeRoute();
    await this.#buildForest(rnd);
    await this.#buildCave(rnd);
  }

  /** Per-frame cosmetic updates. */
  update(dt, cameraPosition) {
    this.time += dt;
    this.sky.position.copy(cameraPosition);
    this.river.position.y = Z.waterY + Math.sin(this.time * WATER.waveSpeed) * WATER.waveHeight;
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
    for (const d of this.discs) {
      if (d.top > maxY || d.top <= y) continue;
      const r = d.r + grace;
      if ((x - d.x) ** 2 + (z - d.z) ** 2 <= r * r) {
        y = d.top;
        platform = d;
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
    const solids = [this.cylinders, this.discs];
    for (const list of solids) {
      for (const c of list) {
        if (c.top <= feet + stepUp || c.bottom >= head) continue;
        let dx = pos.x - c.x;
        let dz = pos.z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
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

  async #buildTreeRoute() {
    const { pads } = this.layout;
    for (const p of pads) {
      this.discs.push({ ...p, safe: new THREE.Vector3(p.x, p.top, p.z) });
      this.cylinders.push({ x: p.x, z: p.z, r: T.trunkRadius, top: p.bottom, bottom: 0 });
    }
    this.scene.add(await loadTreeRouteModels(pads));
  }

  async #buildForest(rnd) {
    const total = F.count + F.edgeCount;
    const { group, trunks, leaves } = await loadTreeModel(total);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const halfD = W.depth / 2 - 4;
    let placed = 0;
    const place = (x, z, k) => {
      const y = this.heightAt(x, z);
      p.set(x, y - 0.1, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
      s.set(k, k, k);
      m.compose(p, q, s);
      trunks.setMatrixAt(placed, m);
      leaves.setMatrixAt(placed, m);
      this.cylinders.push({ x, z, r: F.trunkRadius * k, top: y + 6 * k, bottom: y - 1 });
      placed++;
    };
    const clearOfRoute = (x, z, k) =>
      Math.abs(z - pathZ(x)) > W.pathHalfWidth + 1.6 * k &&
      Math.abs(x - riverCenterX(z)) > Z.riverHalfWidth + 2 &&
      Math.hypot(x - CONFIG.horse.position[0], z - CONFIG.horse.position[1]) > 8;

    for (let tries = 0; placed < F.count && tries < F.count * 20; tries++) {
      const x = rnd.range(Z.forestStart + 2, Z.caveStart - 3);
      const z = rnd.range(-halfD, halfD);
      const k = rnd.range(F.scaleMin, F.scaleMax);
      if (clearOfRoute(x, z, k)) place(x, z, k);
    }
    // A few trees on the sand bank and desert edges so the map edges feel framed.
    for (let tries = 0; placed < total && tries < F.edgeCount * 20; tries++) {
      const x = rnd.range(this.layout.hazardEndX + 4, W.width / 2 - 6);
      const side = rnd() < 0.5 ? -1 : 1;
      const z = side * rnd.range(W.edgeHillStart - 22, W.edgeHillStart);
      const k = rnd.range(F.scaleMin, F.scaleMax);
      if (x > Z.caveStart - 2 && x < Z.desertStart + 2) continue;
      if (clearOfRoute(x, z, k)) place(x, z, k);
    }
    trunks.count = leaves.count = placed;
    this.scene.add(group);
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
