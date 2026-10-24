import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { gearGeometry } from '../portal.js';
import { loadCheckpointModel } from '../horse.js';
import { makeDoor, makeDreamClock } from './gearhaven.js';
import { roleMaterial, roleInstances, roleMerge, lookGlow, steamMaterial, onLook } from './looks.js';
import { makeFloorMaterial } from './floor.js';
import { loadKitPieces, kitMaterial, mergeStatic, placeMatrix } from '../kits.js';
import { loadGearShapes, buildGearDecor, spinInstances, isFallbackGear, loadSparkleModel } from './props.js';

export { spinInstances };

// The Gearhaven ride's look (part2/ride.js runs it): placeholders from simple shapes, each part
// from its own swappable async loader — the brass city (street, curbs, buildings with copper
// roofs, turning cogs on their fronts), gears floating in the sky and the Dream Clock far off
// (loadGearhavenRideModel), rails (loadRailModel), steam vents (loadSteamVentModel), the floating
// gear deck (loadGearDeckModel), swinging hammers (loadHammerModel), turning cog platforms
// (loadCogPlatformModel), conveyor belts (loadConveyorModel), brass gears to collect
// (loadGearPickupModel), grind sparks and steam puffs (loadRideFxModels), the Fire Element's
// door (loadRideDoorModel). Built from the model kits where they load (kits.js: the gear props
// and Factory Kit cogs turning on the walls, floors and in the sky, Factory Kit conveyors, pipes,
// catwalks, machines and boxes, Coaster Kit Monorail (brass) and Steel (copper) rails on bronze supports),
// else the code-built placeholders. Static kit pieces are merged into a few meshes per material
// and stretch of trail; everything moving is instanced; no shadows. Every colour comes from the
// Gearhaven look (looks.js) by role; the city floor is the silver engraved floor (floor.js).

const R = CONFIG.part2.ride;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
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
 * fronts and beside the curbs, gears floating in the sky and the Dream Clock far off. `userData`
 * = { decor (buildGearDecor: { group, sets }), clock: { hour, minute } }.
 */
export async function loadGearhavenRideModel(world, opts = {}) {
  const track = world.track;
  const group = new THREE.Group();
  group.name = 'gearhavenRide';
  const ST = R.street;
  const FL = CONFIG.part2.floor;
  // The far land in the look's ground colour; the city floor silver and engraved either side of
  // the trail; the path marked by a darker centre strip and brass (the look's) edge lines.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(...R.ground.size).rotateX(-Math.PI / 2), roleMaterial('ground'));
  const mid = trackPoint(track, track.length / 2).pos;
  ground.position.set(mid.x, -0.05, mid.z);
  const plaza = new THREE.Mesh(ribbon(track, -FL.plaza, FL.plaza, -0.01), makeFloorMaterial());
  const centre = new THREE.Mesh(ribbon(track, -FL.centre, FL.centre, 0.008), makeFloorMaterial('centre'));
  const edgeMat = new THREE.MeshLambertMaterial();
  onLook((L) => {
    edgeMat.color.set(L.path.edge);
    edgeMat.emissive.set(L.path.edge).multiplyScalar(L.path.glow); // (gold and glowing at midnight)
  });
  const edges = new THREE.Mesh(mergeGeometries([ribbon(track, FL.edge[0], FL.edge[1], 0.012), ribbon(track, -FL.edge[1], -FL.edge[0], 0.012)]), edgeMat);
  const curbs = new THREE.Mesh(mergeGeometries([curb(track, R.wall.offset + 0.2, ST.curbHeight, 0.5), curb(track, -R.wall.offset - 0.2, ST.curbHeight, 0.5)]), roleMaterial('trim'));
  group.add(ground, plaza, centre, edges, curbs);

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
        spots.push({ p, w, d, h, stone: Math.floor(rand() * 4), roof: rand() < C.patinaShare ? 0 : 1 });
      }
    }
  }
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), windowMaterial(), spots.length);
  const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), lambert(0xffffff, { flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((b, i) => {
    q.setFromAxisAngle(up, b.p.heading);
    m.compose(b.p.pos, q, new THREE.Vector3(b.w, b.h, b.d));
    body.setMatrixAt(i, m);
    m.compose(b.p.pos.clone().setY(b.h), q, new THREE.Vector3(b.w * 1.08, Math.min(b.w, b.d) * 0.55, b.d * 1.08));
    roof.setMatrixAt(i, m);
  });
  roleInstances(body, spots.map((b) => ['stone', b.stone])); // (the look's building stone and roofs)
  roleInstances(roof, spots.map((b) => ['roof', b.roof]));
  group.add(body, roof);

  // Lamp posts just outside the curbs (their heads glow; the look's point lights go to the nearest).
  const LP = R.lamps;
  const lampSpots = [];
  const busy = [...R.hammers.map((h) => h.s), ...R.checkpoints, ...R.vents.flatMap((v) => [v.s - 5, v.s, v.s + 5]), R.door.s];
  for (let s = LP.every / 2, i = 0; s < track.length - LP.every / 2; s += LP.every, i++) {
    if (busy.some((x) => Math.abs(x - s) < LP.clear) || R.rails.some((r) => r.upper && s > r.s[0] - LP.clear && s < r.s[1] + LP.clear)) continue;
    const p = trackPoint(track, s, (i % 2 ? 1 : -1) * LP.lat, LP.height);
    const other = track.nearest(p.pos.x, p.pos.z, R.wall.offset + 2);
    if (other && other.dist < R.wall.offset + 0.5) continue;
    lampSpots.push(p.pos);
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, LP.height, 6).translate(0, LP.height / 2, 0), roleMaterial('darkSteel'), Math.max(1, lampSpots.length));
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(LP.head, 8, 6), lookGlow((L) => [L.lamps.head]), Math.max(1, lampSpots.length));
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(LP.halo, 8, 6), lookGlow((L) => [L.lamps.head, L.lamps.halo], { additive: true }), Math.max(1, lampSpots.length));
  lampSpots.forEach((p, i) => {
    posts.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z));
    heads.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    halos.setMatrixAt(i, m);
  });
  for (const im of [posts, heads, halos]) {
    im.count = lampSpots.length;
    im.computeBoundingSphere();
  }
  group.add(posts, heads, halos);

  // Turning gears: on the building fronts facing the trail (the Factory Kit's cogs and the gear
  // props), lying on the ground beside the curbs, and floating in the warm gold sky.
  const CG = R.cogs;
  const gearItems = [];
  for (let s = CG.every / 2, i = 0; s < track.length; s += CG.every, i++) {
    const side = i % 2 ? 1 : -1;
    const p = trackPoint(track, s, side * CG.lat, lerp(CG.height[0], CG.height[1], rand()));
    const other = track.nearest(p.pos.x, p.pos.z, 10.5);
    if (other && other.dist < 10.5) continue;
    gearItems.push({ shape: CG.shapes[i % CG.shapes.length], metal: CG.metals[i % CG.metals.length], pos: p.pos, face: Math.atan2(side * p.tz, -side * p.tx) /* (its axis toward the street) */, r: lerp(CG.radius[0], CG.radius[1], rand()), speed: lerp(CG.speed[0], CG.speed[1], rand()) * (rand() < 0.5 ? -1 : 1), angle: rand() * TAU });
  }
  const FG = R.floorGears;
  for (let s = FG.every / 2, i = 0; s < track.length; s += FG.every, i++) {
    const side = i % 2 ? -1 : 1;
    const p = trackPoint(track, s, side * FG.lat, FG.y);
    const other = track.nearest(p.pos.x, p.pos.z, R.wall.offset + 2);
    if (other && other.dist < R.wall.offset + 1.5) continue;
    gearItems.push({ shape: FG.shapes[i % FG.shapes.length], metal: FG.metals[i % FG.metals.length], pos: p.pos, face: 0, tilt: -Math.PI / 2, r: lerp(FG.radius[0], FG.radius[1], rand()), speed: FG.speed * (i % 2 ? 1 : -1), angle: rand() * TAU });
  }
  const SG = R.skyGears;
  for (let i = 0; i < SG.count; i++) {
    gearItems.push({
      shape: SG.shapes[i % SG.shapes.length], metal: SG.metals[i % SG.metals.length],
      pos: new THREE.Vector3(mid.x + (rand() - 0.5) * 2 * SG.spread, lerp(SG.height[0], SG.height[1], rand()), mid.z + (rand() - 0.5) * 2 * SG.spread),
      face: rand() * TAU, tilt: (rand() - 0.5) * 0.8, r: lerp(SG.radius[0], SG.radius[1], rand()), speed: lerp(SG.speed[0], SG.speed[1], rand()) * (rand() < 0.5 ? -1 : 1), angle: rand() * TAU,
    });
  }
  const shapes = await loadGearShapes([...new Set(gearItems.map((g) => g.shape))], opts);
  const decor = buildGearDecor(gearItems, shapes);
  group.add(decor.group);
  // The Dream Clock far off (the look's colours; gold and glowing at midnight).
  const CL = R.clock;
  const { group: clock, hour, minute } = makeDreamClock(CL.radius);
  clock.position.set(...CL.at);
  clock.lookAt(mid.x, CL.at[1], mid.z);
  group.add(clock);
  group.userData = { decor, clock: { hour, minute }, lampSpots };
  return group;
}

/**
 * The buildings' material: Lambert in the instance's (the look's stone) colour with a grid of
 * windows drawn on the walls in world space (no textures), glowing amber at dusk and midnight
 * (the look's `window`, `windowGlow`; dark teal panes at sunrise).
 */
function windowMaterial() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const u = { uWindow: { value: new THREE.Color() }, uGlow: { value: 0 } };
  onLook((L) => {
    u.uWindow.value.set(L.palette.window);
    u.uGlow.value = L.palette.windowGlow;
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinW;\nvarying vec3 vWinN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWinW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;\nvWinN = normalize( mat3( modelMatrix * instanceMatrix ) * objectNormal );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWindow;\nuniform float uGlow;\nvarying vec3 vWinW;\nvarying vec3 vWinN;\nfloat winMask() {\n  if ( abs( vWinN.y ) > 0.5 || vWinW.y < 1.6 ) return 0.0;\n  float along = abs( vWinN.x ) > abs( vWinN.z ) ? vWinW.z : vWinW.x;\n  vec2 cell = fract( vec2( along / 3.0, vWinW.y / 3.4 ) );\n  return step( 0.36, cell.x ) * step( cell.x, 0.64 ) * step( 0.4, cell.y ) * step( cell.y, 0.72 );\n}')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat win = winMask();\ndiffuseColor.rgb = mix( diffuseColor.rgb, uWindow, win * 0.7 );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uWindow * win * uGlow;');
  };
  mat.customProgramCacheKey = () => 'gearhavenWindows';
  return mat;
}

/** The height of a rail at `s`: low rails rise from the street over `grind.ramp`. */
export function railHeight(rail, s) {
  if (rail.upper) return rail.h;
  const k = THREE.MathUtils.clamp((s - rail.s[0]) / R.grind.ramp, 0, 1);
  return 0.12 + (rail.h - 0.12) * THREE.MathUtils.smoothstep(k, 0, 1);
}

/**
 * The rails (`userData.rails` = one mesh per group of rails): the Coaster Kit's Monorail and
 * Steel tracks (`railKit.groups`: a style per group; Monorail brass, Steel copper) — straight
 * pieces along the trail, each low rail rising from the street on its style's slope pieces
 * (hill beginning + end) — on dark bronze supports, the upper rail hanging from gantries
 * outside the walls. If the kit fails: steel tubes on posts (placeholderRails).
 */
export async function loadRailModel(track, opts = {}) {
  const KR = R.railKit;
  const styles = [...new Set(R.rails.map((r) => KR.groups[r.group]))];
  const names = [KR.support, KR.post, KR.beam, ...styles.flatMap((st) => [KR.styles[st].straight, ...KR.styles[st].slope])];
  const P = await loadKitPieces('rails', names, opts);
  if (Object.values(P).some((g) => !g)) return placeholderRails(track);
  const G = R.grind;
  const top = (rail, s) => railHeight(rail, s) + KR.lift; // (the track's top: just over the rail's line, where the hooves are)
  const items = Object.fromEntries(styles.map((st) => [st, []]));
  const supports = [];
  const yaw = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  for (const rail of R.rails) {
    const ST = KR.styles[KR.groups[rail.group]];
    const out = items[KR.groups[rail.group]];
    // Straight pieces along the trail (each a chord, stretched to its span).
    const s0 = rail.upper ? rail.s[0] : rail.s[0] + G.ramp;
    const n = Math.max(1, Math.round((rail.s[1] - s0) / ST.span));
    for (let k = 0; k < n; k++) {
      const a = trackPoint(track, s0 + ((rail.s[1] - s0) * k) / n, rail.lat, top(rail, rail.s[1]) + ST.drop).pos;
      const b = trackPoint(track, s0 + ((rail.s[1] - s0) * (k + 1)) / n, rail.lat, top(rail, rail.s[1]) + ST.drop).pos;
      out.push({ geometry: P[ST.straight], matrix: placeMatrix({ pos: a, yaw: yaw(a, b), scale: [1, 1, a.distanceTo(b) / ST.length] }), chunk: rail.group });
    }
    if (!rail.upper) {
      // The slope up from the street: the style's two hill pieces, re-stacked onto the ramp's own curve.
      const a = trackPoint(track, rail.s[0], rail.lat).pos;
      const b = trackPoint(track, rail.s[0] + G.ramp, rail.lat).pos;
      out.push({ geometry: rampGeometry(P[ST.slope[0]], P[ST.slope[1]], rail, ST), matrix: placeMatrix({ pos: a, yaw: yaw(a, b) }), chunk: rail.group });
      for (let s = rail.s[0] + G.ramp * 0.6; s <= rail.s[1]; s += G.postEvery) {
        const p = trackPoint(track, s, rail.lat).pos;
        supports.push({ geometry: P[KR.support], matrix: placeMatrix({ pos: p, scale: [1, Math.max(0.1, top(rail, s) - ST.depth), 1] }), chunk: rail.group });
      }
    } else {
      // Gantries: posts outside the walls, a beam across, a hanger down to the rail.
      for (let s = rail.s[0]; s <= rail.s[1]; s += G.gantryEvery) {
        const p = trackPoint(track, s);
        const h = rail.h + 0.7;
        for (const side of [-1, 1]) supports.push({ geometry: P[KR.post], matrix: placeMatrix({ pos: trackPoint(track, s, side * G.gantryHalf).pos, scale: [1.4, h, 1.4] }), chunk: rail.group });
        supports.push({ geometry: P[KR.beam], matrix: placeMatrix({ pos: p.pos.clone().setY(h - 0.3), yaw: p.heading + Math.PI / 2, scale: [1.3, 1.3, G.gantryHalf * 2] }), chunk: rail.group });
        supports.push({ geometry: P[KR.support], matrix: placeMatrix({ pos: trackPoint(track, s, rail.lat, top(rail, s) - ST.depth + 0.05).pos, scale: [0.7, h - 0.3 - (top(rail, s) - ST.depth), 0.7] }), chunk: rail.group });
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'rails';
  const tracks = styles.map((st) => mergeStatic(items[st], kitMaterial('rails', KR.styles[st].tint), `railTrack:${st}`));
  group.add(...tracks, mergeStatic(supports, kitMaterial('rails', KR.supportTint), 'railSupports'));
  // (one mesh per group of rails; `styles`: which style each group is in)
  group.userData = { rails: tracks.flatMap((t) => t.children), styles: Object.fromEntries(tracks.map((t, i) => [styles[i], t])), kit: true };
  return group;
}

/**
 * A low rail's slope: its style's hill-beginning and hill-end pieces end to end, fitted to the
 * ramp's length, every vertex moved up or down so the track's top follows railHeight (its own
 * profile and thickness kept). Local: +z along the trail from the ramp's foot.
 */
function rampGeometry(begin, end, rail, ST) {
  const G = R.grind;
  const KR = R.railKit;
  const k = G.ramp / (ST.length * 2);
  const parts = [[begin, 0], [end, ST.length]].map(([src, dz]) => {
    const g = src.clone();
    const pos = g.attributes.position;
    // (the piece's own top line along z, measured from its vertices)
    const bins = new Map();
    const bin = (z) => Math.round(z / 0.25);
    for (let i = 0; i < pos.count; i++) bins.set(bin(pos.getZ(i)), Math.max(bins.get(bin(pos.getZ(i))) ?? -Infinity, pos.getY(i)));
    for (let i = 0; i < pos.count; i++) {
      const z = (pos.getZ(i) + dz) * k;
      pos.setY(i, pos.getY(i) - bins.get(bin(pos.getZ(i))) + railHeight(rail, rail.s[0] + Math.min(G.ramp, Math.max(0, z))) + KR.lift);
      pos.setZ(i, z);
    }
    g.computeVertexNormals();
    return g;
  });
  return mergeGeometries(parts);
}

/** The old rails: a steel tube each on posts, gantries for the upper rail. */
function placeholderRails(track) {
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
  group.userData = { rails, kit: false };
  return group;
}

/**
 * The factory along the street, outside the walls (Factory Kit, tinted brass and copper; no
 * collision): machines, boxes, hoppers, cranes and robot arms as side decoration, and by each
 * steam vent a pipe run along the curb with a valve and tall pipe stacks either side that puff
 * steam (`userData.chimneys`: their tops, and `userData.ventStacks[i]`: vent i's two). Merged
 * into one mesh per stretch of trail. Nothing (an empty group) if the kit fails.
 */
export async function loadFactoryDecorModel(track, opts = {}) {
  const F = R.factory;
  const names = [...new Set([...F.decor.map((d) => d[0]), F.pipe, F.pipeLong, F.valve])];
  const P = await loadKitPieces('factory', names, opts);
  const group = new THREE.Group();
  group.name = 'factoryDecor';
  group.userData = { chimneys: [], ventStacks: [], kit: false };
  if (Object.values(P).some((g) => !g)) return group;
  const rand = rng(F.seed);
  const items = [];
  const chunk = (s) => Math.floor(s / F.chunk);
  // (a vertical pipe: the long pipe stood on end, 2 tall from its foot)
  const stand = P[F.pipeLong].clone().rotateZ(Math.PI / 2).translate(0.5, 1, 0);
  const clear = (s, d) => [...R.hammers.map((h) => h.s), ...R.checkpoints, ...R.vents.map((v) => v.s), ...R.saws.map((v) => v.s), R.door.s].every((x) => Math.abs(x - s) > d)
    && !R.rails.some((r) => r.upper && s > r.s[0] - d && s < r.s[1] + d);
  for (let s = F.decorStart, i = 0; s < track.length - F.decorEnd; s += F.decorEvery, i++) {
    if (!clear(s, F.decorClear)) continue;
    const side = i % 2 ? 1 : -1;
    const [name, size] = F.decor[Math.floor(rand() * F.decor.length)];
    const lat = side * lerp(F.decorLat[0], F.decorLat[1], rand());
    const p = trackPoint(track, s + (rand() - 0.5) * 3, lat);
    const other = track.nearest(p.pos.x, p.pos.z, R.wall.offset + 4);
    if (other && other.dist < R.wall.offset + 1.5) continue; // (never over another stretch of the street)
    items.push({ geometry: P[name], matrix: placeMatrix({ pos: p.pos, yaw: p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rand() - 0.5) * 0.5, scale: size }), chunk: chunk(s) });
  }
  // Each steam vent's pipes: a run along each curb with a valve, a stack at either end.
  R.vents.forEach((v, vi) => {
    const stacks = [];
    for (const side of [-1, 1]) {
      const lat = side * F.pipeLat;
      for (let k = 0; k < F.runSections; k++) {
        const s = v.s - (F.runSections * F.pipeScale) + k * 2 * F.pipeScale + F.pipeScale;
        const p = trackPoint(track, s, lat);
        const piece = k === Math.floor(F.runSections / 2) ? P[F.valve] : P[F.pipeLong];
        items.push({ geometry: piece, matrix: placeMatrix({ pos: p.pos, yaw: p.heading + Math.PI / 2, scale: [piece === P[F.valve] ? F.pipeScale * 2 : F.pipeScale, F.pipeScale, F.pipeScale] }), chunk: chunk(s) });
      }
      for (const end of [-1, 1]) {
        const s = v.s + end * F.runSections * F.pipeScale;
        const p = trackPoint(track, s, lat);
        const h = F.stackHeight * (end > 0 ? 1 : 0.8);
        items.push({ geometry: stand, matrix: placeMatrix({ pos: p.pos, yaw: p.heading, scale: [F.pipeScale * 1.1, h / 2, F.pipeScale * 1.1] }), chunk: chunk(s) });
        const top = p.pos.clone().setY(h);
        group.userData.chimneys.push(top);
        stacks.push(top);
      }
    }
    group.userData.ventStacks[vi] = stacks;
  });
  group.add(mergeStatic(items, kitMaterial('factory'), 'factory'));
  group.userData.kit = true;
  return group;
}

/** A steam vent: a dark ring, a brass grate and a glow that pulses. `userData.glow`. */
export async function loadSteamVentModel() {
  const V = R.vent;
  const g = new THREE.Group();
  const bars = [];
  for (let i = -3; i <= 3; i++) bars.push([new THREE.BoxGeometry(V.radius * 1.6 * Math.sqrt(1 - (i / 4) ** 2), 0.06, 0.12).translate(0, 0.18, i * V.radius * 0.24), 'brass']);
  const body = roleMerge([[new THREE.CylinderGeometry(V.radius, V.radius * 1.1, 0.16, 20).translate(0, 0.08, 0), 'darkSteel'], ...bars]); // (ring and grate: one draw)
  const glow = new THREE.Mesh(new THREE.CircleGeometry(V.radius * 0.9, 20).rotateX(-Math.PI / 2), additive(V.glow, 0.35));
  glow.position.y = 0.17;
  g.add(body, glow);
  g.userData = { glow };
  return g;
}

/**
 * The floating gear deck: Factory Kit catwalk sections end to end (railings along both edges),
 * hanging on chains from the sky; its materials can fade (`userData.fade`: the riding camera
 * passes under it — Ride.animate). If the kit fails: a brass slab with trim.
 */
export async function loadGearDeckModel(deck, opts = {}) {
  const len = deck.s[1] - deck.s[0];
  const g = new THREE.Group();
  const chains = new THREE.Mesh(
    mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.CylinderGeometry(0.05, 0.05, 30, 4).translate((sx * deck.width) / 2.2, 15, (sz * len) / 2.2)))),
    roleMaterial('darkSteel'),
  );
  g.add(chains);
  const F = R.factory;
  const { [F.catwalk]: walk } = await loadKitPieces('factory', [F.catwalk], opts);
  if (walk) {
    // (the catwalk runs along its x: turned along the trail, stretched across the deck's width)
    const n = Math.max(1, Math.round(len / F.catwalkLength));
    const items = Array.from({ length: n }, (_, i) => ({ geometry: walk, matrix: placeMatrix({ pos: new THREE.Vector3(0, 0, -len / 2 + (len * (i + 0.5)) / n), yaw: Math.PI / 2, scale: [len / n, F.catwalkHeight, deck.width / F.catwalkWidth] }) }));
    const mat = kitMaterial('factory', undefined, { transparent: true });
    g.add(mergeStatic(items, mat, 'catwalk'));
    g.userData = { fade: [mat], kit: true };
    return g;
  }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(deck.width, 0.4, len), roleMaterial('structure', { transparent: true }));
  slab.position.y = -0.2;
  const trim = new THREE.Mesh(
    mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.2, 0.25, len).translate((s * deck.width) / 2, 0.05, 0))),
    roleMaterial('trim', { transparent: true }),
  );
  g.add(slab, trim);
  g.userData = { fade: [slab.material, trim.material], kit: false };
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
  g.add(new THREE.Mesh(mergeGeometries(frame), roleMaterial('structure')));
  const pivot = new THREE.Group();
  pivot.position.y = H.pivot;
  // (arm, head and band: one draw; `head` marks the head's centre for the hit test)
  pivot.add(roleMerge([
    [new THREE.BoxGeometry(0.22, H.arm, 0.22).translate(0, -H.arm / 2, 0), 'darkSteel'],
    [new THREE.BoxGeometry(...H.head).translate(0, -H.arm, 0), 'steel'],
    [new THREE.BoxGeometry(H.head[0] * 1.04, H.head[1] * 0.25, H.head[2] * 1.04).translate(0, -H.arm, 0), 'brass'],
  ]));
  const head = new THREE.Object3D();
  head.position.y = -H.arm;
  pivot.add(head);
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
  g.add(roleMerge([
    ...parts.map((p) => [p, 'brass']),
    [new THREE.CylinderGeometry(P.radius * 0.3, P.radius * 0.3, P.height + 0.04, 16).translate(0, (P.height + 0.04) / 2, 0), 'darkSteel'],
    ...[0, 1, 2].map((i) => [new THREE.BoxGeometry(P.radius * 1.5, 0.03, 0.3).translate(0, P.height + 0.015, 0).rotateY((i / 3) * Math.PI), 'darkSteel']),
  ])); // (one draw)
  return g;
}

/**
 * A conveyor belt across the trail (s0 … s1): Factory Kit belt sections laid across it, let into
 * the street (else a dark strip), and slats that slide sideways at the belt's speed
 * (`userData.slats`: an InstancedMesh, `userData.items`: their lateral offsets).
 */
export async function loadConveyorModel(track, conv, opts = {}) {
  const CV = R.conveyor;
  const F = R.factory;
  const g = new THREE.Group();
  const len = conv.s[1] - conv.s[0];
  const { [F.belt]: belt } = await loadKitPieces('factory', [F.belt], opts);
  if (belt) {
    // (each section runs along its x — across the trail — `beltLength` long, 1 deep)
    const across = F.beltCount; // (a few long sections: light on triangles)
    const rows = Math.max(1, Math.round(len / F.beltRow));
    const items = [];
    for (let r = 0; r < rows; r++) {
      const s = conv.s[0] + (len * (r + 0.5)) / rows;
      for (let i = 0; i < across; i++) {
        const lat = -R.wall.offset + ((i + 0.5) * R.wall.offset * 2) / across;
        const p = trackPoint(track, s, lat, F.beltSink);
        items.push({ geometry: belt, matrix: placeMatrix({ pos: p.pos, yaw: p.heading, scale: [(R.wall.offset * 2) / across / F.beltLength, 1, len / rows] }) });
      }
    }
    g.add(mergeStatic(items, kitMaterial('factory', 'conveyor'), 'conveyorBelt')); // (its own tint: brass and steel)
  } else g.add(new THREE.Mesh(ribbon(track, -R.wall.offset, R.wall.offset, 0.04, conv.s[0], conv.s[1], 1), roleMaterial('darkSteel')));
  const n = Math.ceil((R.wall.offset * 2) / CV.slat);
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.05, len * 0.96), roleMaterial('brass'), n); // (brass, never white)
  g.add(slats);
  const items = Array.from({ length: n }, (_, i) => -R.wall.offset + i * CV.slat);
  g.userData = { slats, items, mid: (conv.s[0] + conv.s[1]) / 2, kit: !!belt };
  return g;
}

/**
 * Brass gears to collect (an InstancedMesh: the Quaternius collectible gear, else a code-built
 * gear) with a soft additive halo each (a second one).
 */
export async function loadGearPickupModel(count, opts = {}) {
  const GR = R.gears;
  const { collectible } = await loadGearShapes(['collectible'], opts);
  // (a soft glow: the look's emissive on the gear and its halo's colour / strength)
  const gearMat = lambert(GR.color);
  onLook((L) => gearMat.emissive.set(L.gears.emissive));
  const gears = new THREE.InstancedMesh(isFallbackGear(collectible) ? gearGeometry(GR.size, 9, GR.size * 0.35) : collectible.clone().scale(GR.size * GR.fit, GR.size * GR.fit, GR.size * GR.fit), gearMat, count);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(GR.size * 1.7, 8, 6), lookGlow((L) => [L.gears.halo, L.gears.haloK], { additive: true }), count);
  const g = new THREE.Group();
  g.add(gears, halos);
  g.userData = { gears, halos, kit: !isFallbackGear(collectible) };
  return g;
}

/** Grind sparks, steam puffs and pickup sparkles (pooled InstancedMeshes, additive; faded through instance colour). */
export async function loadRideFxModels() {
  const SP = R.sparks;
  const ST = R.steam;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(SP.size, SP.size, SP.size * 3), additive(0xffffff, 1), SP.max);
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), steamMaterial(), ST.puffs); // (warm white, lit: never lost against the silver floor)
  puffs.frustumCulled = false;
  for (const mesh of [sparks]) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
    mesh.frustumCulled = false;
  }
  const sparkles = await loadSparkleModel(R.gears.sparkle.max); // (a gear picked up)
  return { sparks, puffs, sparkles };
}

/** The Fire Element's door across the end of the trail (the courtyard's door, bigger). */
export async function loadRideDoorModel() {
  const door = makeDoor(CONFIG.part2.levels.fire.accent[0]);
  door.scale.setScalar(R.door.scale);
  return door;
}

/** The checkpoint flags (Part 1's flag model). */
export async function loadRideCheckpointModel() {
  return loadCheckpointModel();
}
