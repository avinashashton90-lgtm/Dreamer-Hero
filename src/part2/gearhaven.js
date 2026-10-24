import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { loadGearShapes, buildGearDecor } from './props.js';
import { loadClockTowerModel } from './clockTower.js';
import { loadSkylineModel, ringSpots } from './skyline.js';

// Gearhaven (Part 2): a brass courtyard under a sky of huge slow-turning gears, cogs and steam
// vents round it, the Dream Clock's face far away, warm lamps, the clock tower and a brass city
// on the horizon — its gears from the gear props (props.js), the rest simple shapes (swap
// loadGearhavenModel() for real models later). And GearhavenWorld: the few floors
// the hero, horse and camera stand on here, with the same small interface Part 1's World gives
// them (heightAt, groundAt, collide, solidsNear, cylinders, boxes…), so the shared Hero, Horse
// and FollowCamera work unchanged in Part 2.

const GH = CONFIG.part2.gearhaven;
const TAU = Math.PI * 2;
const VOID = -40; // (no floor: far below)

/** The floors of Part 2: circles (the courtyard, each level's platform), walled at `wall`. */
export class GearhavenWorld {
  constructor() {
    this.floors = []; // { x, z, r, wall, y }
    this.cylinders = []; // { x, z, r, bottom, top } pillars
    this.boxes = [];
    this.beams = [];
    this.foliageSets = [];
    this.cameraMeshes = [];
    this.obstacles = [];
    this.layout = { townEndX: -1e9, hazardEndX: -1e9 }; // (no tree-leaping zone here)
    this.track = this.activeTrack = this.desertTrack = null;
    this.river = null;
  }

  addFloor(x, z, r, wall = r - 0.5, y = 0) {
    const f = { x, z, r, wall, y };
    this.floors.push(f);
    return f;
  }

  floorAt(x, z) {
    let best = null;
    let bd = Infinity;
    for (const f of this.floors) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d <= f.r && d < bd) (best = f), (bd = d);
    }
    return best;
  }

  heightAt(x, z) {
    return this.floorAt(x, z)?.y ?? VOID;
  }

  groundAt(x, z) {
    return { y: this.heightAt(x, z), platform: null };
  }

  isHazard() {
    return false;
  }

  surfaceAt() {
    return 'stone';
  }

  /** Pillars near a body (outward normals and gaps), as Part 1's World.solidsNear. */
  solidsNear(pos, radius, reach, height) {
    const out = [];
    for (const c of this.cylinders) {
      if (c.top <= pos.y + 0.3 || c.bottom >= pos.y + height) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + radius + reach && d > 1e-4) out.push({ nx: dx / d, nz: dz / d, gap: d - c.r - radius });
    }
    return out;
  }

  /** Out of the pillars; inside the nearest floor's wall (only the outward velocity is removed). */
  collide(pos, vel, radius) {
    for (const c of this.cylinders) {
      if (c.top <= pos.y + 0.3) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-6) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
        const vn = vel.x * (dx / d) + vel.z * (dz / d);
        if (vn < 0) (vel.x -= vn * (dx / d)), (vel.z -= vn * (dz / d));
      }
    }
    let f = null;
    let fd = Infinity;
    for (const g of this.floors) {
      const d = Math.hypot(pos.x - g.x, pos.z - g.z) - g.wall;
      if (d < fd) (fd = d), (f = g);
    }
    if (!f) return;
    const dx = pos.x - f.x;
    const dz = pos.z - f.z;
    const d = Math.hypot(dx, dz);
    const max = f.wall - radius;
    if (d > max && d > 1e-6) {
      pos.x = f.x + (dx / d) * max;
      pos.z = f.z + (dz / d) * max;
      const vn = vel.x * (dx / d) + vel.z * (dz / d);
      if (vn > 0) (vel.x -= vn * (dx / d)), (vel.z -= vn * (dz / d));
    }
  }
}

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glowMat = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/** A brass gear wheel (rim, spokes, hub and teeth) for the sky; `r` its radius. */
export function bigGearGeometry(r, teeth, depth) {
  const parts = [new THREE.TorusGeometry(r * 0.86, r * 0.1, 4, Math.max(16, teeth * 2))];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    parts.push(new THREE.BoxGeometry(r * 0.12, r * 0.16, depth).translate(0, r, 0).rotateZ(a));
  }
  for (let i = 0; i < 6; i++) parts.push(new THREE.BoxGeometry(r * 0.08, r * 1.7, depth * 0.6).rotateZ((i / 6) * Math.PI));
  parts.push(new THREE.CylinderGeometry(r * 0.16, r * 0.16, depth * 1.4, 12).rotateX(Math.PI / 2));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/**
 * The courtyard and its sky. `userData` = { decor (the turning gears: buildGearDecor), tower (the
 * clock tower), skyline, clock: { hour, minute, face }, vents: [Vector3], steam (InstancedMesh),
 * doors: { id → { group, portal, at, angle } }, lamps, pillars: [{ x, z, r }] }. `opts`: how
 * files load ({ readFile, placeholder }).
 */
export async function loadGearhavenModel(opts = {}) {
  const group = new THREE.Group();
  group.name = 'gearhaven';
  const F = GH.floor;
  const brass = lambert(F.color);
  // The floor: a brass disc with darker inlay rings and spokes.
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(F.radius, F.radius, 0.6, 48), brass);
  floor.position.y = -0.3;
  group.add(floor);
  for (const [r, w] of [[F.radius * 0.35, 0.35], [F.radius * 0.7, 0.45]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 48).rotateX(-Math.PI / 2), lambert(F.inlay));
    ring.position.y = 0.01;
    group.add(ring);
  }
  const spokes = new THREE.Mesh(
    mergeGeometries(Array.from({ length: 8 }, (_, i) => new THREE.PlaneGeometry(0.3, F.radius * 0.66).rotateX(-Math.PI / 2).translate(0, 0, F.radius * 0.36).rotateY((i / 8) * TAU))),
    lambert(F.inlay),
  );
  spokes.position.y = 0.012;
  group.add(spokes);
  // A low wall round it and pillars with warm lamps.
  const W = GH.wallRing;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(F.radius + 0.6, F.radius + 0.6, W.height, 48, 1, true), lambert(W.color, { side: THREE.DoubleSide }));
  wall.position.y = W.height / 2;
  group.add(wall);
  // (instanced: one draw each for the pillars, the lamps and their halos)
  const P = GH.pillars;
  const pillars = [];
  const pillarMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(P.radius, P.radius * 1.15, P.height, 10), lambert(P.color), P.count);
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(P.radius * 0.7, 10, 8), new THREE.MeshBasicMaterial({ color: P.lampColor }), P.count);
  const haloMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(P.radius * 1.8, 10, 8), glowMat(P.lampColor, 0.25), P.count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < P.count; i++) {
    const a = (i / P.count) * TAU + TAU / P.count / 2;
    const x = Math.sin(a) * (F.radius - 0.2);
    const z = Math.cos(a) * (F.radius - 0.2);
    pillarMesh.setMatrixAt(i, m.makeTranslation(x, P.height / 2, z));
    lampMesh.setMatrixAt(i, m.makeTranslation(x, P.height + 0.3, z));
    haloMesh.setMatrixAt(i, m.makeTranslation(x, P.height + 0.3, z));
    pillars.push({ x, z, r: P.radius });
  }
  for (const im of [pillarMesh, lampMesh, haloMesh]) im.computeBoundingSphere();
  group.add(pillarMesh, lampMesh, haloMesh);
  const lamps = [haloMesh];
  // Cogs half sunk in the floor at the edge, and huge wheels in the sky overhead, all turning
  // slowly (the gear props and the Factory Kit's cogs, instanced: brass and copper).
  const C = GH.cogs;
  const gearItems = [];
  for (let i = 0; i < C.count; i++) {
    const a = (i / C.count) * TAU;
    const r = C.radius[0] + ((i * 7) % C.count) / C.count * (C.radius[1] - C.radius[0]);
    const R = F.radius - 2.2 - r * 0.2;
    gearItems.push({ shape: C.shapes[i % C.shapes.length], metal: C.metals[i % C.metals.length], pos: new THREE.Vector3(Math.sin(a) * R, r * 0.45, Math.cos(a) * R), face: a + Math.PI / 2, r, speed: C.speed * (i % 2 ? 1 : -1) / r });
  }
  const S = GH.skyGears;
  for (let i = 0; i < S.count; i++) {
    const k = i / Math.max(1, S.count - 1);
    const r = S.radius[0] + ((i * 3) % S.count) / S.count * (S.radius[1] - S.radius[0]);
    const a = k * TAU * 0.9;
    gearItems.push({
      shape: S.shapes[i % S.shapes.length], metal: i % 2 ? 'darkBrass' : 'brass', sky: true,
      pos: new THREE.Vector3(Math.sin(a) * S.spread * (0.4 + (i % 3) * 0.25), S.height[0] + (i % 3) / 2 * (S.height[1] - S.height[0]), -Math.abs(Math.cos(a)) * S.spread * 0.6 - 10),
      face: a * 0.3, tilt: -Math.PI / 2 + 0.35 * (i % 2 ? 1 : -1), r, depth: S.depth, speed: (S.speed[0] + (i % 3) / 2 * (S.speed[1] - S.speed[0])) * (i % 2 ? 1 : -1),
    });
  }
  const decor = buildGearDecor(gearItems, await loadGearShapes([...new Set(gearItems.map((g) => g.shape))], opts));
  group.add(decor.group);
  // The clock tower on the skyline toward the Time door, and the brass city round the horizon
  // (never toward the level platforms, which float off to +x).
  const CT = CONFIG.part2.clockTower;
  const SKY = CONFIG.part2.skyline.courtyard;
  const ta = Math.PI + CONFIG.part2.levels.time.angle;
  const [tower, skyline] = await Promise.all([
    loadClockTowerModel(opts),
    loadSkylineModel(ringSpots(0, 0, SKY.count, SKY.radius).filter((p) => Math.abs(Math.atan2(p.x, p.z) - Math.PI / 2) > SKY.clearOfLevels && Math.hypot(p.x - Math.sin(ta) * CT.courtyard.dist, p.z - Math.cos(ta) * CT.courtyard.dist) > SKY.clearOfTower), opts),
  ]);
  tower.position.set(Math.sin(ta) * CT.courtyard.dist, 0, Math.cos(ta) * CT.courtyard.dist);
  tower.rotation.y = ta + Math.PI / 4; // (two faces toward the courtyard)
  tower.scale.setScalar(CT.courtyard.scale);
  group.add(tower, skyline);
  // The Dream Clock's face, far away and glowing faintly.
  const K = GH.clock;
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(K.radius, 48), new THREE.MeshBasicMaterial({ color: K.face, fog: false }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(K.radius, K.radius * 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: K.rim, fog: false }));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(K.radius * 1.35, 48), glowMat(K.glow, 0.22));
  glow.position.z = -0.5;
  glow.material.fog = false;
  const marks = new THREE.Mesh(
    mergeGeometries(Array.from({ length: 12 }, (_, i) => new THREE.PlaneGeometry(K.radius * 0.05, K.radius * 0.16).translate(0, K.radius * 0.82, 0.05).rotateZ((i / 12) * TAU))),
    new THREE.MeshBasicMaterial({ color: K.hand, fog: false }),
  );
  const handMat = new THREE.MeshBasicMaterial({ color: K.hand, fog: false });
  const hour = new THREE.Mesh(new THREE.PlaneGeometry(K.radius * 0.07, K.radius * 0.5).translate(0, K.radius * 0.22, 0.1), handMat);
  const minute = new THREE.Mesh(new THREE.PlaneGeometry(K.radius * 0.045, K.radius * 0.75).translate(0, K.radius * 0.34, 0.12), handMat);
  clock.add(glow, face, rim, marks, hour, minute);
  clock.position.set(...K.at);
  group.add(clock);
  // Steam vents at the edge: soft rising puffs (one additive InstancedMesh).
  const ST = GH.steam;
  const vents = Array.from({ length: ST.vents }, (_, i) => {
    const a = (i / ST.vents) * TAU + 0.4;
    return new THREE.Vector3(Math.sin(a) * (F.radius - 1.2), 0.2, Math.cos(a) * (F.radius - 1.2));
  });
  const grates = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 10), lambert(F.ring), vents.length);
  vents.forEach((v, i) => grates.setMatrixAt(i, new THREE.Matrix4().makeTranslation(v.x, v.y, v.z)));
  grates.computeBoundingSphere();
  group.add(grates);
  const steam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), glowMat(ST.color, ST.opacity), ST.puffs);
  steam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  steam.frustumCulled = false;
  steam.count = 0;
  group.add(steam);
  // The element doors round the far side of the courtyard (each opens onto a level).
  const D = GH.doors;
  const doors = {};
  for (const id of CONFIG.part2.levels.order) {
    const L = CONFIG.part2.levels[id];
    const door = makeDoor(L.color);
    const a = Math.PI + L.angle; // (on the far side, -z)
    const at = new THREE.Vector3(Math.sin(a) * D.radius, 0, Math.cos(a) * D.radius);
    door.position.copy(at);
    door.rotation.y = a + Math.PI; // (facing the centre)
    group.add(door);
    doors[id] = { group: door, portal: door.userData.portal, at, angle: a };
  }
  group.userData = { decor, tower, skyline, clock: { hour, minute, face }, vents, steam, doors, lamps, pillars };
  return group;
}

/** An element door: two brass posts, an arch, and a glowing doorway in the element's colour. */
export function makeDoor(color) {
  const D = GH.doors;
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.28, 0.32, D.height, 8);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(post, lambert(GH.pillars.color));
    p.position.set((s * D.width) / 2, D.height / 2, 0);
    g.add(p);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(D.width / 2, 0.24, 6, 16, Math.PI), lambert(GH.floor.color));
  arch.position.y = D.height;
  g.add(arch);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(D.width - 0.3, D.height + D.width / 2 - 0.3), glowMat(color, 0.5));
  portal.material.side = THREE.DoubleSide;
  portal.position.y = (D.height + D.width / 2) / 2;
  g.add(portal);
  g.userData.portal = portal;
  return g;
}
