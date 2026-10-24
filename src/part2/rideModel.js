import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { gearGeometry } from '../portal.js';
import { loadCheckpointModel } from '../horse.js';
import { bigGearGeometry, makeDoor } from './gearhaven.js';

// The Gearhaven ride's look (part2/ride.js runs it): placeholders from simple shapes, each part
// from its own swappable async loader — the brass city (street, curbs, buildings with copper
// roofs, turning cogs on their fronts), gears floating in the sky and the Dream Clock far off
// (loadGearhavenRideModel), rails (loadRailModel), steam vents (loadSteamVentModel), the floating
// gear deck (loadGearDeckModel), swinging hammers (loadHammerModel), turning cog platforms
// (loadCogPlatformModel), conveyor belts (loadConveyorModel), brass gears to collect
// (loadGearPickupModel), grind sparks and steam puffs (loadRideFxModels), the Fire Element's
// door (loadRideDoorModel). Everything repeated is instanced; no lights, no shadows.

const R = CONFIG.part2.ride;
const TAU = Math.PI * 2;
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/** A seeded random in [0, 1) (the city is the same every time). */
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

/** A point `lat` to the right of the trail at `s`, `y` high (and the trail's tangent there). */
export function trackPoint(track, s, lat = 0, y = 0) {
  const p = track.at(s);
  return { pos: new THREE.Vector3(p.x - p.tz * lat, y, p.z + p.tx * lat), tx: p.tx, tz: p.tz, heading: Math.atan2(p.tx, p.tz) };
}

/** A strip along the trail between laterals `a` and `b` (s0 … s1) at height `y`. */
function ribbon(track, a, b, y, s0 = 0, s1 = track.length, step = 2) {
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    for (const lat of [a, b]) pos.push(...trackPoint(track, s, lat, y).pos.toArray());
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (wound either way along the trail: make it face up)
  if (g.attributes.normal.getY(0) < 0) {
    g.setIndex(idx.map((v, i) => (i % 3 === 1 ? idx[i + 1] : i % 3 === 2 ? idx[i - 1] : v)));
    g.computeVertexNormals();
  }
  return g;
}

/** A low wall strip (a curb) along the trail at `lat`: its inner face and top. */
function curb(track, lat, h, w) {
  const side = Math.sign(lat);
  return mergeGeometries([ribbon(track, lat, lat + side * w, h), wallStrip(track, lat, h)]);
}

function wallStrip(track, lat, h, step = 2) {
  const n = Math.ceil(track.length / step);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const s = (track.length * i) / n;
    pos.push(...trackPoint(track, s, lat, 0).pos.toArray(), ...trackPoint(track, s, lat, h).pos.toArray());
    if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The city round the ride: the ground, the street (with a darker edge and brass curbs), rows of
 * buildings with copper (or green-patina) roofs outside the corridor, turning cogs on their
 * fronts, gears floating in the sky and the Dream Clock far off. `userData` = { cogs: { mesh,
 * items }, skyGears: { mesh, items }, clock: { hour, minute } }.
 */
export async function loadGearhavenRideModel(world) {
  const track = world.track;
  const group = new THREE.Group();
  group.name = 'gearhavenRide';
  const ST = R.street;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(...R.ground.size).rotateX(-Math.PI / 2), lambert(R.ground.color));
  const mid = trackPoint(track, track.length / 2).pos;
  ground.position.set(mid.x, -0.02, mid.z);
  const edge = new THREE.Mesh(ribbon(track, -R.wall.offset - 0.4, R.wall.offset + 0.4, 0.005), lambert(ST.edge));
  const street = new THREE.Mesh(ribbon(track, -R.wall.offset + 0.6, R.wall.offset - 0.6, 0.015), lambert(ST.color));
  const curbs = new THREE.Mesh(mergeGeometries([curb(track, R.wall.offset + 0.2, ST.curbHeight, 0.5), curb(track, -R.wall.offset - 0.2, ST.curbHeight, 0.5)]), lambert(ST.curb));
  group.add(ground, edge, street, curbs);

  // Buildings either side, outside the corridor (never over another stretch of the trail).
  const C = R.city;
  const rand = rng(C.seed);
  const lerp = (a, b, t) => a + (b - a) * t;
  const spots = [];
  for (let s = 4; s < track.length; s += C.step) {
    for (const side of [-1, 1]) {
      for (const [lo, hi] of C.rows) {
        const w = lerp(C.width[0], C.width[1], rand());
        const d = lerp(C.depth[0], C.depth[1], rand());
        const h = lerp(C.height[0], C.height[1], rand()) * (lo > 20 ? 1.3 : 1);
        const lat = side * (lerp(lo, hi, 0.5) + (rand() - 0.5) * 2);
        const p = trackPoint(track, s + (rand() - 0.5) * 2, lat);
        const clear = track.nearest(p.pos.x, p.pos.z, 11 + Math.max(w, d) / 2 + 1);
        if (clear && clear.dist < 11 + Math.max(w, d) / 2 + 0.5) continue;
        spots.push({ p, w, d, h, color: C.colors[Math.floor(rand() * C.colors.length)], roof: rand() < C.patinaShare ? C.patina : C.roof });
      }
    }
  }
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(0xffffff), spots.length);
  const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), lambert(0xffffff, { flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  spots.forEach((b, i) => {
    q.setFromAxisAngle(up, b.p.heading);
    m.compose(b.p.pos, q, new THREE.Vector3(b.w, b.h, b.d));
    body.setMatrixAt(i, m);
    body.setColorAt(i, col.setHex(b.color));
    m.compose(b.p.pos.clone().setY(b.h), q, new THREE.Vector3(b.w * 1.08, Math.min(b.w, b.d) * 0.55, b.d * 1.08));
    roof.setMatrixAt(i, m);
    roof.setColorAt(i, col.setHex(b.roof));
  });
  group.add(body, roof);

  // Turning cogs on the building fronts facing the trail.
  const CG = R.cogs;
  const cogItems = [];
  for (let s = CG.every / 2, i = 0; s < track.length; s += CG.every, i++) {
    const side = i % 2 ? 1 : -1;
    const p = trackPoint(track, s, side * CG.lat, lerp(CG.height[0], CG.height[1], rand()));
    const other = track.nearest(p.pos.x, p.pos.z, 10.5);
    if (other && other.dist < 10.5) continue;
    cogItems.push({ pos: p.pos, face: Math.atan2(side * p.tz, -side * p.tx) /* (its axis toward the street) */, r: lerp(CG.radius[0], CG.radius[1], rand()), speed: lerp(CG.speed[0], CG.speed[1], rand()) * (rand() < 0.5 ? -1 : 1), angle: rand() * TAU });
  }
  const cogMesh = new THREE.InstancedMesh(bigGearGeometry(1, 12, 0.35), lambert(CG.color), cogItems.length);
  group.add(cogMesh);

  // Gears floating in the warm gold sky, and the Dream Clock far off.
  const SG = R.skyGears;
  const skyItems = Array.from({ length: SG.count }, () => ({
    pos: new THREE.Vector3(mid.x + (rand() - 0.5) * 2 * SG.spread, lerp(SG.height[0], SG.height[1], rand()), mid.z + (rand() - 0.5) * 2 * SG.spread),
    face: rand() * TAU, tilt: (rand() - 0.5) * 0.8, r: lerp(SG.radius[0], SG.radius[1], rand()), speed: lerp(SG.speed[0], SG.speed[1], rand()) * (rand() < 0.5 ? -1 : 1), angle: rand() * TAU,
  }));
  const skyMesh = new THREE.InstancedMesh(bigGearGeometry(1, 18, 0.25), lambert(SG.color), SG.count);
  group.add(skyMesh);
  const CL = R.clock;
  const clock = new THREE.Group();
  clock.position.set(...CL.at);
  clock.lookAt(mid.x, CL.at[1], mid.z);
  const unfog = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(CL.radius, 48), unfog(CL.face)));
  clock.add(new THREE.Mesh(new THREE.TorusGeometry(CL.radius, CL.radius * 0.06, 6, 48), unfog(CL.rim)));
  const ticks = [];
  for (let i = 0; i < 12; i++) ticks.push(new THREE.BoxGeometry(CL.radius * 0.04, CL.radius * 0.14, 0.2).translate(0, CL.radius * 0.82, 0.3).rotateZ((i / 12) * TAU));
  clock.add(new THREE.Mesh(mergeGeometries(ticks), unfog(CL.hand)));
  const hand = (len, w) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.3).translate(0, len / 2, 0.5), unfog(CL.hand));
    clock.add(h);
    return h;
  };
  const hour = hand(CL.radius * 0.5, CL.radius * 0.06);
  const minute = hand(CL.radius * 0.78, CL.radius * 0.035);
  hour.rotation.z = -1.1;
  group.add(clock);
  group.userData = { cogs: { mesh: cogMesh, items: cogItems }, skyGears: { mesh: skyMesh, items: skyItems }, clock: { hour, minute } };
  spinInstances(group.userData.cogs, 0);
  spinInstances(group.userData.skyGears, 0);
  return group;
}

/** Turns instanced gears about their own axis (`items`: pos, face (yaw), tilt?, r, speed, angle). */
export function spinInstances({ mesh, items }, dt) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  items.forEach((it, i) => {
    it.angle += it.speed * dt;
    e.set(it.tilt ?? 0, it.face, it.angle, 'YXZ');
    q.setFromEuler(e);
    m.compose(it.pos, q, new THREE.Vector3(it.r, it.r, it.r));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/** The height of a rail at `s`: low rails rise from the street over `grind.ramp`. */
export function railHeight(rail, s) {
  if (rail.upper) return rail.h;
  const k = THREE.MathUtils.clamp((s - rail.s[0]) / R.grind.ramp, 0, 1);
  return 0.12 + (rail.h - 0.12) * THREE.MathUtils.smoothstep(k, 0, 1);
}

/**
 * The rails: a steel tube each (low rails rising from the street on a ramp), posts under the
 * low rails, gantries holding the upper rail (posts outside the walls). `userData.rails` = the
 * tube meshes in R.rails order.
 */
export async function loadRailModel(track) {
  const G = R.grind;
  const group = new THREE.Group();
  group.name = 'rails';
  const steel = lambert(G.color);
  const rails = [];
  const posts = [];
  const gantry = [];
  for (const rail of R.rails) {
    const pts = [];
    for (let s = rail.s[0]; s <= rail.s[1] + 1e-6; s += 1) pts.push(trackPoint(track, s, rail.lat, railHeight(rail, s)).pos);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, G.radius, 6), steel);
    group.add(tube);
    rails.push(tube);
    if (!rail.upper) {
      for (let s = rail.s[0] + G.ramp; s <= rail.s[1]; s += G.postEvery) {
        const p = trackPoint(track, s, rail.lat).pos;
        posts.push(new THREE.CylinderGeometry(0.07, 0.1, rail.h, 6).translate(p.x, rail.h / 2, p.z));
      }
    } else {
      for (let s = rail.s[0]; s <= rail.s[1]; s += G.gantryEvery) {
        const p = trackPoint(track, s);
        const top = rail.h + 0.7;
        for (const side of [-1, 1]) {
          const q = trackPoint(track, s, side * G.gantryHalf).pos;
          gantry.push(new THREE.BoxGeometry(0.35, top, 0.35).translate(q.x, top / 2, q.z));
        }
        gantry.push(new THREE.BoxGeometry(G.gantryHalf * 2, 0.3, 0.3).rotateY(p.heading).translate(p.pos.x, top, p.pos.z));
        const r = trackPoint(track, s, rail.lat).pos;
        gantry.push(new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(r.x, rail.h + 0.35, r.z));
      }
    }
  }
  if (posts.length) group.add(new THREE.Mesh(mergeGeometries(posts), lambert(G.post)));
  if (gantry.length) group.add(new THREE.Mesh(mergeGeometries(gantry), lambert(G.post)));
  group.userData = { rails };
  return group;
}

/** A steam vent: a dark ring, a brass grate and a glow that pulses. `userData.glow`. */
export async function loadSteamVentModel() {
  const V = R.vent;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(V.radius, V.radius * 1.1, 0.16, 20), lambert(V.color));
  ring.position.y = 0.08;
  const bars = [];
  for (let i = -3; i <= 3; i++) bars.push(new THREE.BoxGeometry(V.radius * 1.6 * Math.sqrt(1 - (i / 4) ** 2), 0.06, 0.12).translate(0, 0.18, i * V.radius * 0.24));
  const grate = new THREE.Mesh(mergeGeometries(bars), lambert(V.grate));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(V.radius * 0.9, 20).rotateX(-Math.PI / 2), additive(V.glow, 0.35));
  glow.position.y = 0.17;
  g.add(ring, grate, glow);
  g.userData = { glow };
  return g;
}

/** The floating gear deck (a brass platform with trim, hanging on chains from the sky). */
export async function loadGearDeckModel(deck) {
  const len = deck.s[1] - deck.s[0];
  const g = new THREE.Group();
  // (its materials can fade: the riding camera passes under it — Ride.animate)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(deck.width, 0.4, len), lambert(deck.color, { transparent: true }));
  slab.position.y = -0.2;
  const trim = new THREE.Mesh(
    mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.2, 0.25, len).translate((s * deck.width) / 2, 0.05, 0))),
    lambert(deck.trim, { transparent: true }),
  );
  const chains = new THREE.Mesh(
    mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.CylinderGeometry(0.05, 0.05, 30, 4).translate((sx * deck.width) / 2.2, 15, (sz * len) / 2.2)))),
    lambert(R.grind.post),
  );
  g.add(slab, trim, chains);
  g.userData = { fade: [slab.material, trim.material] };
  return g;
}

/**
 * A swinging hammer on a gantry over the trail: posts outside the walls, a beam, and a pivot
 * (`userData.pivot`, swung about the trail's direction) carrying the arm and the head
 * (`userData.head`).
 */
export async function loadHammerModel() {
  const H = R.hammer;
  const g = new THREE.Group();
  const frame = [];
  for (const side of [-1, 1]) frame.push(new THREE.BoxGeometry(0.45, H.pivot + 0.5, 0.45).translate(side * H.gantryHalf, (H.pivot + 0.5) / 2, 0));
  frame.push(new THREE.BoxGeometry(H.gantryHalf * 2 + 0.5, 0.45, 0.6).translate(0, H.pivot + 0.4, 0));
  g.add(new THREE.Mesh(mergeGeometries(frame), lambert(H.color)));
  const pivot = new THREE.Group();
  pivot.position.y = H.pivot;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, H.arm, 0.22).translate(0, -H.arm / 2, 0), lambert(H.color));
  const head = new THREE.Mesh(new THREE.BoxGeometry(...H.head), lambert(H.headColor));
  head.position.y = -H.arm;
  const band = new THREE.Mesh(new THREE.BoxGeometry(H.head[0] * 1.04, H.head[1] * 0.25, H.head[2] * 1.04), lambert(H.band));
  band.position.y = -H.arm;
  pivot.add(arm, head, band);
  g.add(pivot);
  g.userData = { pivot, head };
  return g;
}

/** A turning cog platform let into the street (a brass gear disc with a darker hub). */
export async function loadCogPlatformModel() {
  const P = R.cogPlatform;
  const parts = [new THREE.CylinderGeometry(P.radius * 0.9, P.radius * 0.9, P.height, 32).translate(0, P.height / 2, 0)];
  for (let i = 0; i < P.teeth; i++) parts.push(new THREE.BoxGeometry(P.radius * 0.18, P.height, P.radius * 0.22).translate(0, P.height / 2, P.radius * 0.93).rotateY((i / P.teeth) * TAU));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts), lambert(P.color)));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(P.radius * 0.3, P.radius * 0.3, P.height + 0.04, 16).translate(0, (P.height + 0.04) / 2, 0), lambert(P.hub));
  const spokes = new THREE.Mesh(mergeGeometries([0, 1, 2].map((i) => new THREE.BoxGeometry(P.radius * 1.5, 0.03, 0.3).translate(0, P.height + 0.015, 0).rotateY((i / 3) * Math.PI))), lambert(P.hub));
  g.add(hub, spokes);
  return g;
}

/**
 * A conveyor belt across the trail (s0 … s1): a dark belt and slats that slide sideways
 * (`userData.slats`: an InstancedMesh, `userData.items`: their lateral offsets).
 */
export async function loadConveyorModel(track, conv) {
  const CV = R.conveyor;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ribbon(track, -R.wall.offset, R.wall.offset, 0.04, conv.s[0], conv.s[1], 1), lambert(CV.color)));
  const n = Math.ceil((R.wall.offset * 2) / CV.slat);
  const len = conv.s[1] - conv.s[0];
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.05, len * 0.96), lambert(CV.slatColor), n);
  g.add(slats);
  const items = Array.from({ length: n }, (_, i) => -R.wall.offset + i * CV.slat);
  g.userData = { slats, items, mid: (conv.s[0] + conv.s[1]) / 2 };
  return g;
}

/** Brass gears to collect (an InstancedMesh) with a soft additive halo each (a second one). */
export async function loadGearPickupModel(count) {
  const GR = R.gears;
  const gears = new THREE.InstancedMesh(gearGeometry(GR.size, 9, GR.size * 0.35), lambert(GR.color, { emissive: 0x3a2400 }), count);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(GR.size * 1.7, 10, 8), additive(GR.halo, 0.22), count);
  const g = new THREE.Group();
  g.add(gears, halos);
  g.userData = { gears, halos };
  return g;
}

/** Grind sparks and steam puffs (pooled InstancedMeshes, additive; faded through instance colour). */
export async function loadRideFxModels() {
  const SP = R.sparks;
  const ST = R.steam;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(SP.size, SP.size, SP.size * 3), additive(0xffffff, 1), SP.max);
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), additive(0xffffff, ST.opacity), ST.puffs);
  for (const mesh of [sparks, puffs]) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
    mesh.frustumCulled = false;
  }
  return { sparks, puffs };
}

/** The Fire Element's door across the end of the trail (the courtyard's door, bigger). */
export async function loadRideDoorModel() {
  const door = makeDoor(CONFIG.part2.levels.fire.color);
  door.scale.setScalar(R.door.scale);
  return door;
}

/** The checkpoint flags (Part 1's flag model). */
export async function loadRideCheckpointModel() {
  return loadCheckpointModel();
}
