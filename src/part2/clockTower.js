import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { loadGearShapes, buildGearDecor, spinGearDecor, ringAngles } from './props.js';
import { roleMerge, lookGlow } from './looks.js';

// The clock tower (CONFIG.part2.clockTower): built in code, no model file — a stepped plinth, a
// tall square shaft with brass corner pilasters and bands, a clock stage with a big face on each
// side (cream dial, brass rim, hour marks) and moving hands, a pointed brass roof with a spire
// and finial, and big gears turning round its base. On the skyline (the courtyard and the ride)
// and at the Time Element's place. Static parts are merged (2 draws: the body, the dials); the hands are
// two InstancedMeshes (one instance per face); the gears are instanced (props.js).

const CT = CONFIG.part2.clockTower;
const TAU = Math.PI * 2;

/**
 * `opts.fog` false: unfogged (a landmark that reads from far off). Returns a Group (feet at the
 * origin, faces toward ±x / ±z) with `userData.update(dt)` turning its hands and gears, and
 * `userData.height`.
 */
export async function loadClockTowerModel(opts = {}) {
  const fog = opts.fog ?? true;
  const parts = { stone: [], brass: [], dark: [], face: [] };
  const box = (to, w, h, d, x, y, z) => parts[to].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const B = CT.base;
  const S = CT.shaft;
  const K = CT.stage;
  // The plinth: steps.
  B.steps.forEach(([w, h], i) => box(i % 2 ? 'brass' : 'stone', w, h, w, 0, B.steps.slice(0, i).reduce((a, s) => a + s[1], 0) + h / 2, 0));
  const y0 = B.steps.reduce((a, s) => a + s[1], 0);
  // The shaft, its corner pilasters and brass bands.
  box('stone', S.width, S.height, S.width, 0, y0 + S.height / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('brass', S.pilaster, S.height, S.pilaster, (sx * S.width) / 2, y0 + S.height / 2, (sz * S.width) / 2);
  for (let i = 1; i <= S.bands; i++) box('brass', S.width + 0.4, 0.5, S.width + 0.4, 0, y0 + (S.height * i) / (S.bands + 1), 0);
  // Narrow windows up the shaft (dark slits on each side).
  for (let i = 0; i < S.windows; i++) {
    const y = y0 + S.height * (0.12 + (0.7 * i) / Math.max(1, S.windows - 1));
    for (let a = 0; a < 4; a++) parts.dark.push(new THREE.BoxGeometry(1, 2.4, 0.3).translate(0, y, S.width / 2 + 0.05).rotateY((a * Math.PI) / 2));
  }
  // The clock stage: wider than the shaft, a cornice above and below.
  const ys = y0 + S.height;
  box('stone', K.width, K.height, K.width, 0, ys + K.height / 2, 0);
  box('brass', K.width + 1, 0.8, K.width + 1, 0, ys + 0.4, 0);
  box('brass', K.width + 1.2, 0.9, K.width + 1.2, 0, ys + K.height - 0.45, 0);
  const faceY = ys + K.height / 2;
  const faces = [];
  for (let a = 0; a < 4; a++) {
    const rot = (a * Math.PI) / 2;
    const out = K.width / 2 + 0.05;
    parts.face.push(new THREE.CircleGeometry(K.face, 40).translate(0, faceY, out).rotateY(rot));
    parts.brass.push(new THREE.TorusGeometry(K.face, K.face * 0.07, 6, 40).translate(0, faceY, out + 0.1).rotateY(rot));
    for (let i = 0; i < 12; i++) parts.dark.push(new THREE.BoxGeometry(K.face * 0.06, K.face * (i % 3 ? 0.12 : 0.2), 0.12).translate(0, K.face * 0.8, 0).rotateZ((i / 12) * TAU).translate(0, faceY, out + 0.08).rotateY(rot));
    parts.brass.push(new THREE.CylinderGeometry(K.face * 0.07, K.face * 0.07, 0.4, 12).rotateX(Math.PI / 2).translate(0, faceY, out + 0.3).rotateY(rot));
    faces.push({ pos: new THREE.Vector3(0, faceY, out + 0.22).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot), rot });
  }
  // The pointed brass roof, a spire and a finial.
  const yr = ys + K.height;
  parts.brass.push(new THREE.ConeGeometry((K.width / 2) * Math.SQRT2 * 1.02, CT.roof.height, 4).rotateY(Math.PI / 4).translate(0, yr + CT.roof.height / 2, 0));
  parts.brass.push(new THREE.CylinderGeometry(0.15, 0.4, CT.roof.spire, 6).translate(0, yr + CT.roof.height + CT.roof.spire / 2 - 0.5, 0));
  parts.brass.push(new THREE.SphereGeometry(0.9, 10, 8).translate(0, yr + CT.roof.height + CT.roof.spire - 0.5, 0));
  const group = new THREE.Group();
  group.name = 'clockTower';
  // (stone, brass and dark parts: one vertex-coloured mesh; the dials unlit)
  const role = { stone: 'towerStone', brass: 'brass', dark: 'darkSteel' }; // (the look's colours)
  const body = roleMerge(['stone', 'brass', 'dark'].flatMap((k) => parts[k].map((g) => [g, role[k]])), { fog });
  body.name = 'clockTower:body';
  const dials = new THREE.Mesh(mergeGeometries(parts.face.map((g) => (g.index ? g.toNonIndexed() : g))), lookGlow((L) => [L.clock.face], { fog }));
  dials.name = 'clockTower:face';
  group.add(body, dials);
  // The hands: one instance per face (hour and minute), turned each frame.
  const handGeo = (len, w) => new THREE.BoxGeometry(w, len, 0.2).translate(0, len / 2 - len * 0.12, 0);
  const handMat = lookGlow((L) => [L.clock.hand], { fog });
  const hour = new THREE.InstancedMesh(handGeo(K.face * 0.55, K.face * 0.09), handMat, faces.length);
  const minute = new THREE.InstancedMesh(handGeo(K.face * 0.82, K.face * 0.055), handMat, faces.length);
  hour.name = 'clockTower:hour';
  minute.name = 'clockTower:minute';
  group.add(hour, minute);
  // Big gears turning round the base (props.js shapes; the code-built wheel if they fail).
  const G = CT.gears;
  const items = ringAngles(G.count, Math.PI / 4).map((a, i) => ({
    shape: G.shapes[i % G.shapes.length], metal: G.metals[i % G.metals.length],
    pos: new THREE.Vector3(Math.sin(a) * G.ring, G.radius * G.up, Math.cos(a) * G.ring), face: a, r: G.radius * (i % 2 ? 0.75 : 1), speed: G.speed * (i % 2 ? 1 : -1),
  }));
  const decor = buildGearDecor(items, await loadGearShapes([...new Set(items.map((it) => it.shape))], opts));
  for (const set of decor.sets) set.mesh.material.fog = fog;
  group.add(decor.group);
  const clock = { minute: CT.startMinute, faces, hour, minute };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const update = (dt) => {
    clock.minute = (clock.minute + dt * CT.minutesPerSecond) % 720;
    const mAngle = -(clock.minute / 60) * TAU;
    const hAngle = -(clock.minute / 720) * TAU;
    faces.forEach((f, i) => {
      for (const [mesh, ang, lift] of [[hour, hAngle, 0], [minute, mAngle, 0.12]]) {
        e.set(0, f.rot, ang, 'YXZ');
        q.setFromEuler(e);
        const p = f.pos.clone().add(new THREE.Vector3(0, 0, lift).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.rot));
        mesh.setMatrixAt(i, m.compose(p, q, one));
      }
    });
    hour.instanceMatrix.needsUpdate = minute.instanceMatrix.needsUpdate = true;
    spinGearDecor(decor, dt);
  };
  update(0);
  hour.computeBoundingSphere();
  minute.computeBoundingSphere();
  group.userData = { update, clock, decor, height: yr + CT.roof.height + CT.roof.spire };
  return group;
}
