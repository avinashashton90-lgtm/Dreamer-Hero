import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadKitPieces, kitMaterial, mergeStatic, placeMatrix } from '../kits.js';
import { loadGearShapes, buildGearDecor, spinGearDecor, loadSawModel } from './props.js';
import { loadClockTowerModel } from './clockTower.js';
import { loadCastleModel } from '../world.js';
import { applyCastleKit } from '../castleKit.js';

// The "Props test" (?debug; CONFIG.part2.propsTest): every kind of kit prop in a row, so they can
// be looked at — the turning gears (gear_01, the gear cluster, a Factory Kit cog, the collectible
// gear), the spinning saw, a Factory Kit conveyor with moving slats, a pipe stack puffing steam,
// a catwalk, a Coaster Kit rail on its supports, the clock tower and the Castle Kit gate (its
// leaves opening and shutting). Each `item` = { name, x, width, height }; `update(dt)` animates.

const PT = CONFIG.part2.propsTest;
const R = CONFIG.part2.ride;

export async function buildPropsShowcase(opts = {}) {
  const group = new THREE.Group();
  group.name = 'propsTest';
  const items = [];
  const updates = [];
  let x = 0;
  const slot = (name, width, height, obj) => {
    const it = { name, width, height, x: x + width / 2 };
    x += width + PT.gap;
    if (obj) {
      obj.position.x += it.x;
      group.add(obj);
    }
    items.push(it);
    return it;
  };
  // Gears: each standing on edge, turning (brass / copper).
  const shapes = await loadGearShapes(['gear01', 'cluster', 'cogA', 'collectible'], opts);
  for (const [name, shape, r, metal] of PT.gears) {
    const it = slot(name, r * 2.2, r * 2.4, null);
    const decor = buildGearDecor([{ shape, metal, pos: new THREE.Vector3(it.x, r * 1.15, 0), face: 0, r, speed: PT.spin }], shapes);
    group.add(decor.group);
    updates.push((dt) => spinGearDecor(decor, dt));
  }
  // The saw: its blade sliding along the slot, spinning.
  const S = R.saw;
  const saw = await loadSawModel(opts);
  saw.scale.setScalar(PT.sawScale);
  slot('Saw (spiky gear)', (S.travel * 2 + S.radius * 2) * PT.sawScale, S.radius * 2 * PT.sawScale, saw);
  let t = 0;
  updates.push((dt) => {
    t += dt;
    saw.userData.blade.position.x = S.travel * Math.sin((t / S.period) * Math.PI * 2);
    saw.userData.disc.rotation.z -= S.spin * dt;
  });
  // Factory Kit pieces.
  const F = R.factory;
  const K = await loadKitPieces('factory', [F.belt, F.pipeLong, F.valve, F.catwalk], opts);
  const mat = kitMaterial('factory');
  const piece = (geo, pos, scale, yaw = 0) => ({ geometry: geo, matrix: placeMatrix({ pos, yaw, scale }) });
  // A conveyor: three belt sections side by side, slats sliding across them.
  {
    const g = new THREE.Group();
    if (K[F.belt]) g.add(mergeStatic([-1, 0, 1].map((i) => piece(K[F.belt], new THREE.Vector3(0, 0, i), [1, 1, 1])), mat));
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.04, 2.9), new THREE.MeshLambertMaterial({ color: R.conveyor.slatColor }), PT.slats);
    g.add(slats);
    let off = 0;
    const m = new THREE.Matrix4();
    updates.push((dt) => {
      off = (off + R.conveyor.speed * 0.3 * dt) % (2 / PT.slats);
      for (let i = 0; i < PT.slats; i++) slats.setMatrixAt(i, m.makeTranslation(-1 + ((i * 2) / PT.slats + off) % 2, 0.42, 0));
      slats.instanceMatrix.needsUpdate = true;
    });
    g.scale.setScalar(PT.kitScale);
    slot('Conveyor (Factory Kit)', 2 * PT.kitScale, 0.4 * PT.kitScale, g);
  }
  // A pipe stack with a valve, puffing steam.
  {
    const g = new THREE.Group();
    const items2 = [];
    if (K[F.pipeLong]) {
      const stand = K[F.pipeLong].clone().rotateZ(Math.PI / 2).translate(0.5, 1, 0);
      items2.push(piece(stand, new THREE.Vector3(0, 0, 0), [1, 1.5, 1]));
      if (K[F.valve]) items2.push(piece(K[F.valve], new THREE.Vector3(1.2, 0, 0), 1));
    }
    if (items2.length) g.add(mergeStatic(items2, mat));
    const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: R.steam.color, transparent: true, opacity: R.steam.opacity * 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), PT.puffs);
    puffs.frustumCulled = false;
    g.add(puffs);
    let pt = 0;
    const m = new THREE.Matrix4();
    updates.push((dt) => {
      pt += dt;
      for (let i = 0; i < PT.puffs; i++) {
        const k = ((pt + (i * R.steam.life) / PT.puffs) % R.steam.life) / R.steam.life;
        const s = 0.35 + k * 0.9;
        puffs.setMatrixAt(i, m.makeScale(s, s, s).setPosition(Math.sin(i * 2.1) * 0.2, 3 + k * R.steam.rise, Math.cos(i * 1.3) * 0.2));
      }
      puffs.instanceMatrix.needsUpdate = true;
    });
    g.scale.setScalar(PT.kitScale);
    slot('Pipe + steam (Factory Kit)', 2.4 * PT.kitScale, 4 * PT.kitScale, g);
  }
  // A catwalk: two sections end to end.
  {
    const g = new THREE.Group();
    if (K[F.catwalk]) g.add(mergeStatic([-0.5, 0.5].map((i) => piece(K[F.catwalk], new THREE.Vector3(i, 1.2, 0), 1)), mat));
    g.scale.setScalar(PT.kitScale);
    slot('Catwalk (Factory Kit)', 2 * PT.kitScale, 2 * PT.kitScale, g);
  }
  // A rail: the Coaster Kit's monorail track in gold on copper supports, its slope rising onto it.
  {
    const KR = R.railKit;
    const P = await loadKitPieces('rails', [KR.straight, KR.slope[0], KR.support], opts);
    const g = new THREE.Group();
    const h = R.rails[0].h;
    if (P[KR.straight]) {
      g.add(mergeStatic([0, 1].map((i) => piece(P[KR.straight], new THREE.Vector3(0, h + KR.lift + KR.drop, -4 + i * 4), 1)), kitMaterial('rails')));
      g.add(mergeStatic([-3, 0, 3].map((z) => piece(P[KR.support], new THREE.Vector3(0, 0, z), [1, h + KR.lift - KR.depth, 1])), kitMaterial('rails', KR.supportTint)));
    }
    g.rotation.y = Math.PI / 2; // (along the row)
    slot('Rail (Coaster Kit)', 8, h + 0.5, g);
  }
  // The clock tower.
  {
    const tower = await loadClockTowerModel(opts);
    tower.scale.setScalar(PT.towerScale);
    updates.push((dt) => tower.userData.update(dt));
    slot('Clock tower', 16 * PT.towerScale, tower.userData.height * PT.towerScale, tower);
  }
  // The castle gate (Part 1's castle in the Castle Kit), its leaves opening and shutting.
  {
    const castle = await loadCastleModel();
    const kit = await applyCastleKit(castle, opts);
    castle.scale.setScalar(PT.castleScale);
    const { W2 } = castle.userData.dims;
    let ct = 0;
    updates.push((dt) => {
      ct += dt;
      const open = Math.max(0, Math.sin((ct / PT.gatePeriod) * Math.PI * 2)) * 1.3;
      for (const hinge of Object.values(castle.userData.gates)) hinge.rotation.y = -hinge.userData.side * open;
    });
    slot(kit ? 'Castle gate (Castle Kit)' : 'Castle gate (placeholder)', W2 * 2 * PT.castleScale, castle.userData.dims.H * PT.castleScale, castle);
  }
  // Centre the row on the origin.
  const shift = (x - PT.gap) / 2;
  for (const it of items) it.x -= shift;
  for (const c of group.children) c.position.x -= shift;
  return { group, items, width: x - PT.gap, update: (dt) => updates.forEach((u) => u(dt)) };
}
