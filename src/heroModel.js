import * as THREE from 'three';
import { CONFIG } from './config.js';
import { fetchBuffers, parseFBX, retargetClip, rootSpeed, mapTime, boneKey } from './mixamo.js';

const M = CONFIG.heroModel;
const O = CONFIG.outfit;
const { clamp, smoothstep } = THREE.MathUtils;

// ---------------------------------------------------------------------------
// Building AJ (the Mixamo character) into the hero
// ---------------------------------------------------------------------------

/**
 * The Mixamo hero: AJ from public/models/hero/ (hero.fbx, whose embedded clip is the idle,
 * plus animation-only files retargeted by bone name), scaled to the hero's height with the
 * feet at the origin, facing +Z — AJ as he comes: cap, glasses, grey hoodie, black jeans,
 * sneakers and backpack, with his own textures. The Lazarus Pit cup rides in his right hand.
 * With CONFIG.heroCostume the old code-built costume goes back on (see buildCostume): golden
 * cloak, eye mask, utility belt, chained daggers, red-jeans / brown-shoe tint, no backpack.
 *
 * @param {{ readFile?: (url) => Promise<ArrayBuffer>, onProgress?: (f) => void, base?: string }} opts
 */
export async function loadMixamoHero(opts = {}) {
  const base = opts.base ?? M.path;
  const names = Object.keys(M.clips);
  const urls = [base + M.character, ...names.map((n) => `${base}${M.clips[n].file}.fbx`)];
  // The character file is about half the download.
  const weights = [names.length, ...names.map(() => 1)];
  const buffers = await fetchBuffers(urls, { readFile: opts.readFile, onProgress: opts.onProgress, weights });
  const fbx = await parseFBX(buffers[0], { textureMax: M.textureMax });
  const sources = await Promise.all(buffers.slice(1).map((b) => parseFBX(b, { textureMax: M.textureMax })));

  const root = new THREE.Group(); // positioned / rotated by the Hero
  const inner = new THREE.Group(); // lowered while riding (hips onto the saddle)
  root.add(inner);
  inner.add(fbx);
  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx);
  const scale = M.height / (box.max.y - box.min.y);
  fbx.scale.setScalar(scale);
  fbx.position.y = -box.min.y * scale;
  root.updateMatrixWorld(true);

  const bone = (key) => {
    let found = null;
    fbx.traverse((o) => {
      if (!found && o.isBone && boneKey(o.name) === key) found = o;
    });
    return found;
  };
  const bones = {
    hips: bone('Hips'), spine: bone('Spine1'), chest: bone('Spine2'), neck: bone('Neck'), head: bone('Head'),
    rightHand: bone('RightHand'), leftHand: bone('LeftHand'), leftUpLeg: bone('LeftUpLeg'), rightUpLeg: bone('RightUpLeg'),
    leftLeg: bone('LeftLeg'), rightLeg: bone('RightLeg'),
  };
  if (Object.values(bones).some((b) => !b)) throw new Error('hero.fbx: missing Mixamo bones');

  // Meshes: no frustum culling (skinned bounds don't follow the animation); tint + trims.
  const meshes = [];
  fbx.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      meshes.push(o);
    }
  });
  const body = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
  const costume = CONFIG.heroCostume;
  let info = null;
  if (costume) {
    info = analyseBody(body);
    info.eyes = meshes.find((m) => /Eye/i.test(m.name)) ?? null;
    removeBones(body, info, M.hideBones);
    tintClothes(body, info);
  }
  const mats = [];
  for (const m of meshes) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
    if (mat.emissive && !mats.includes(mat)) mats.push(mat);
  }

  // Hip joint height while seated in the ride clip (for lowering onto the saddle).
  const restHipsY = bones.hips.position.y;
  const clips = {};
  const idle = fbx.animations.find((a) => a.duration > 0);
  clips.idle = retargetClip(idle, fbx, { root: 'xz', name: 'idle' });
  names.forEach((n, i) => {
    const C = M.clips[n];
    const src = sources[i].animations.find((a) => a.duration > 0);
    clips[n] = retargetClip(src, fbx, { root: C.root, restHipsY, faceAt: C.faceAt ?? null, name: n });
  });
  // The throw also as an arm-only layer (works over running and riding).
  clips.throwArm = retargetClip(sources[names.indexOf('throw')].animations.find((a) => a.duration > 0), fbx, {
    root: 'xz', bones: ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'], name: 'throwArm',
  });
  const runSpeed = rootSpeed(sources[names.indexOf('run')].animations[0]) * scale; // m/s at timeScale 1
  const rideHips = sampleHipsY(clips.ride, bones.hips) * scale;

  // Extras on the bones (built in the bind pose, then attached keeping their world placement):
  // always the Lazarus Pit cup; the costume only with CONFIG.heroCostume.
  const extras = buildHandProps(bones);
  if (costume) Object.assign(extras.onBone, buildCostume(info, bones, mats, extras.handGroup));
  for (const [key, obj] of Object.entries(extras.onBone)) {
    root.add(obj);
    obj.updateMatrixWorld(true);
    bones[key].attach(obj);
  }

  root.userData = {
    kind: 'mixamo',
    fbx, inner, bones, mats, clips, runSpeed, rideHips, scale,
    cloak: extras.handGroup.userData.cloak ?? null, cloakPivot: extras.handGroup.userData.cloakPivot ?? null,
    daggerHip: extras.handGroup.userData.daggerHip ?? null, daggerHand: extras.handGroup.userData.daggerHand ?? null,
    cup: extras.cup,
    handLocal: extras.handLocal,
  };
  root.userData.animator = new HeroAnimator(root);
  return root;
}

function sampleHipsY(clip, hips) {
  const t = clip.tracks.find((x) => x.name === `${hips.name}.position`);
  return t ? t.values[1] : hips.position.y;
}

/**
 * Bind-pose vertex data of the body mesh (world = model space, metres): positions, the
 * dominant bone of each vertex, and a few measurements for the extras.
 */
function analyseBody(body) {
  const g = body.geometry;
  const pos = g.attributes.position;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const boneNames = body.skeleton.bones.map((b) => boneKey(b.name));
  const n = pos.count;
  const world = new Float32Array(n * 3);
  const dom = new Array(n);
  const v = new THREE.Vector3();
  body.updateMatrixWorld(true);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
    v.toArray(world, i * 3);
    let best = 0;
    let bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > best) {
        best = w;
        bi = si.getComponent(i, k);
      }
    }
    dom[i] = boneNames[bi] ?? '';
  }
  return { world, dom, count: n };
}

/**
 * Removes whole pieces of the mesh (connected shells, welded by position) that are mostly
 * skinned to these bones — AJ's backpack, its straps and pins.
 */
function removeBones(body, info, keys) {
  const g = body.geometry;
  const pos = g.attributes.position;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const names = body.skeleton.bones.map((b) => boneKey(b.name));
  const tri = g.index ? Array.from(g.index.array) : Array.from({ length: info.count }, (_, i) => i);
  // Weld by position, then union-find over triangles.
  const ids = new Map();
  const vid = new Int32Array(info.count);
  for (let i = 0; i < info.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    vid[i] = ids.get(k);
  }
  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let t = 0; t < tri.length; t += 3) {
    const a = find(vid[tri[t]]);
    parent[find(vid[tri[t + 1]])] = a;
    parent[find(vid[tri[t + 2]])] = a;
  }
  const touched = (i) => {
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0.01 && keys.some((key) => names[si.getComponent(i, k)]?.includes(key))) return true;
    return false;
  };
  const stats = new Map(); // component → [vertices, touched]
  for (let i = 0; i < info.count; i++) {
    const c = find(vid[i]);
    const st = stats.get(c) ?? [0, 0];
    st[0]++;
    if (touched(i)) st[1]++;
    stats.set(c, st);
  }
  const drop = new Set([...stats].filter(([, [n, hit]]) => hit / n > 0.3).map(([c]) => c));
  const kept = [];
  for (let t = 0; t < tri.length; t += 3) if (!drop.has(find(vid[tri[t]]))) kept.push(tri[t], tri[t + 1], tri[t + 2]);
  g.setIndex(kept);
  info.hidden = (i) => drop.has(find(vid[i]));
}

/** Red jeans and brown shoes: a per-vertex tint blended over the texture's brightness. */
function tintClothes(body, info) {
  const T = M.tint;
  const pants = new THREE.Color(T.pants);
  const shoes = new THREE.Color(T.shoes);
  const tint = new Float32Array(info.count * 4);
  let hipY = Infinity;
  for (let i = 0; i < info.count; i++) if (info.dom[i] === 'Hips') hipY = Math.min(hipY, info.world[i * 3 + 1]);
  for (let i = 0; i < info.count; i++) {
    const d = info.dom[i];
    const y = info.world[i * 3 + 1];
    let c = null;
    if (/Foot|Toe/.test(d)) c = shoes;
    else if (/UpLeg$|Leg$/.test(d) || (d === 'Hips' && y < hipY + 0.06)) c = pants;
    if (c) {
      tint[i * 4] = c.r;
      tint[i * 4 + 1] = c.g;
      tint[i * 4 + 2] = c.b;
      tint[i * 4 + 3] = T.amount;
    }
  }
  body.geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
  for (const mat of Array.isArray(body.material) ? body.material : [body.material]) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 tint;\nvarying vec4 vTint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = tint;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vTint;')
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb * (0.45 + 1.4 * lum), vTint.a);',
        );
    };
    mat.customProgramCacheKey = () => 'hero-tint';
    mat.needsUpdate = true;
  }
}

/** Points of the body (bind pose) matching `pred(x, y, z, bone)`, as {min, max} boxes. */
function measure(info, pred) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const w = info.world;
  for (let i = 0; i < info.count; i++) {
    if (info.hidden?.(i)) continue;
    const x = w[i * 3], y = w[i * 3 + 1], z = w[i * 3 + 2];
    if (!pred(x, y, z, info.dom[i])) continue;
    min.min(new THREE.Vector3(x, y, z));
    max.max(new THREE.Vector3(x, y, z));
  }
  return { min, max };
}

/** In the right hand: the Lazarus Pit cup (and, with the costume, the drawn dagger). */
function buildHandProps(bones) {
  const hand = bones.rightHand.getWorldPosition(new THREE.Vector3());
  const handGroup = new THREE.Group();
  const palm = new THREE.Vector3(hand.x - 0.07, hand.y - 0.02, hand.z); // AJ's bind pose: arms out along X
  handGroup.userData.palm = palm;
  const cup = new THREE.Group();
  cup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.034, 0.08, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide })));
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.041, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: CONFIG.desert.pit.activeColor }));
  water.position.y = 0.02;
  cup.add(water);
  cup.position.set(palm.x, palm.y - 0.03, palm.z + 0.03);
  cup.visible = false;
  handGroup.add(cup);
  // The fist, in the hand bone's frame (thrown items leave from here).
  const handLocal = bones.rightHand.worldToLocal(palm.clone());
  return { onBone: { rightHand: handGroup }, handGroup, cup, handLocal };
}

/**
 * The code-built costume (CONFIG.heroCostume only): golden cloak, eye mask, utility belt with
 * pouches and buckle, the chained dagger on the hip and its twin for the hand (added to
 * `handGroup`), placed against AJ's bind pose. Returns { boneKey: group } to attach; the
 * cloak / dagger handles go in handGroup.userData.
 */
function buildCostume(info, bones, mats, handGroup) {
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    mats.push(m);
    return m;
  };
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const hips = wp(bones.hips), neck = wp(bones.neck), head = wp(bones.head);
  const onBone = {};

  // Golden cloak: hangs from just below the neck, behind the back (and the hood).
  const C = M.cloak;
  const back = measure(info, (x, y, z, d) => Math.abs(x) < 0.14 && y > neck.y - 0.25 && y < neck.y && !/Arm|Hand/.test(d));
  const [cw, ch] = O.cloakSegments;
  const cloakGeo = new THREE.PlaneGeometry(C.width, C.length, cw, ch).translate(0, -C.length / 2, 0);
  const cloak = new THREE.Mesh(cloakGeo, mat(O.cloak, { side: THREE.DoubleSide }));
  cloak.userData.rest = Float32Array.from(cloakGeo.attributes.position.array);
  const cloakPivot = new THREE.Group();
  cloakPivot.add(cloak);
  const cloakAnchor = new THREE.Group();
  cloakAnchor.position.set(0, neck.y - C.drop, back.min.z - C.gap);
  cloakAnchor.add(cloakPivot);
  onBone.chest = cloakAnchor;

  // Mask: a dark band round the head at eye level with two eye holes.
  const K = M.mask;
  const eyesBox = new THREE.Box3();
  const eyes = info.eyes;
  if (eyes) eyesBox.setFromObject(eyes);
  const face = measure(info, (x, y, z, d) => d.startsWith('Head') && Math.abs(x) < 0.03 && y > head.y && y < head.y + 0.12);
  const eyeY = eyes ? (eyesBox.min.y + eyesBox.max.y) / 2 : head.y + 0.07;
  const eyeX = eyes ? (eyesBox.max.x - eyesBox.min.x) / 4 : 0.035;
  const frontZ = face.max.z;
  const headSide = measure(info, (x, y, z, d) => d.startsWith('Head') && Math.abs(y - eyeY) < 0.01);
  const R = Math.max(0.06, (headSide.max.x - headSide.min.x) / 2 + K.gap);
  const centerZ = frontZ + K.gap - R;
  const mask = new THREE.Mesh(makeMaskGeometry(R, K, eyeX), mat(O.mask, { side: THREE.DoubleSide }));
  mask.position.set(0, eyeY + K.lift, centerZ);
  const maskAnchor = new THREE.Group();
  maskAnchor.add(mask);
  onBone.head = maskAnchor;

  // Utility belt round the hips, pouches and a gold buckle; the chained dagger on the right hip.
  const B = M.belt;
  const beltY = hips.y + B.above;
  const waist = measure(info, (x, y, z, d) => Math.abs(y - beltY) < 0.02 && !/Arm|Hand/.test(d));
  const rx = (waist.max.x - waist.min.x) / 2 + B.tube * 0.5;
  const rz = (waist.max.z - waist.min.z) / 2 + B.tube * 0.5;
  const cz = (waist.max.z + waist.min.z) / 2;
  const beltGroup = new THREE.Group();
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, B.height, 24, 1, true), mat(O.belt, { side: THREE.DoubleSide }));
  belt.scale.set(rx, 1, rz);
  belt.position.set(0, beltY, cz);
  beltGroup.add(belt);
  const gold = mat(O.buckle);
  const pouchMat = mat(O.pouch);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), gold);
  buckle.position.set(0, beltY, cz + rz + 0.004);
  beltGroup.add(buckle);
  for (const a of [0.55, 2.6, Math.PI, -0.55 - Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.045), pouchMat);
    p.position.set(Math.sin(a) * (rx + 0.015), beltY - 0.01, cz + Math.cos(a) * (rz + 0.015));
    p.rotation.y = a;
    beltGroup.add(p);
  }
  const daggerHip = makeDagger(mat);
  daggerHip.position.set(-(rx + 0.03), beltY - 0.04, cz); // AJ's right is -X
  daggerHip.rotation.set(0, 0, Math.PI + 0.15); // blade down
  beltGroup.add(daggerHip);
  onBone.hips = beltGroup;

  // The dagger drawn into the right hand for the combo.
  const daggerHand = makeDagger(mat);
  daggerHand.position.copy(handGroup.userData.palm);
  daggerHand.rotation.set(Math.PI / 2, 0, 0); // blade out of the fist, forward
  daggerHand.visible = false;
  handGroup.add(daggerHand);
  Object.assign(handGroup.userData, { cloak, cloakPivot, daggerHip, daggerHand });

  return onBone;
}

/** A band of `arc` radians round a head of radius R, with two eye holes. */
function makeMaskGeometry(R, K, eyeX) {
  const segU = 48;
  const segV = 10;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const th = (i / segU - 0.5) * K.arc;
      const v = (j / segV - 0.5) * K.height;
      // Tapers to points at the sides.
      const taper = 1 - 0.55 * Math.pow(Math.abs(i / segU - 0.5) * 2, 2);
      pos.push(R * Math.sin(th), v * taper, R * Math.cos(th));
    }
  }
  const inHole = (i, j) => {
    const u = (i / segU - 0.5) * K.arc * R;
    const v = (j / segV - 0.5) * K.height;
    return [-eyeX, eyeX].some((ex) => ((u - ex) / K.eyeWidth) ** 2 + (v / K.eyeHeight) ** 2 < 1);
  };
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      if (inHole(i + 0.5, j + 0.5)) continue;
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dagger with a chain wrapped round the handle (blade along +Y). */
function makeDagger(mat) {
  const d = new THREE.Group();
  const m = (geo, material, y = 0) => {
    const o = new THREE.Mesh(geo, material);
    o.position.y = y;
    d.add(o);
    return o;
  };
  const handle = mat(O.belt);
  const chain = mat(O.chain);
  const gold = mat(O.buckle);
  const blade = mat(O.blade);
  m(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 6), handle);
  for (let i = 0; i < 4; i++) {
    const link = m(new THREE.TorusGeometry(0.024, 0.0055, 4, 8), chain, -0.04 + i * 0.027);
    link.rotation.x = Math.PI / 2 + (i % 2) * 0.5;
  }
  m(new THREE.BoxGeometry(0.075, 0.016, 0.028), gold, 0.06);
  m(new THREE.BoxGeometry(0.032, 0.18, 0.011).translate(0, 0.155, 0), blade);
  return d;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * Drives AJ's AnimationMixer from the hero's state each frame. One primary clip at a time
 * (blended over CONFIG.heroModel.crossfade): death → ride → drink → roll → combo hit → hit
 * reaction → jump / running jump → idle↔run (run speed-matched). Timed clips are scrubbed
 * from the game's own timers so combat, dodge, throw and jump timings are unchanged. The
 * throw (and catch) is an arm-only layer on top of whatever the body does. Procedural
 * touches after the mixer: thighs spread on the horse, the exhausted slump and breathing.
 */
export class HeroAnimator {
  constructor(model) {
    this.model = model;
    const u = model.userData;
    this.u = u;
    this.mixer = new THREE.AnimationMixer(u.fbx);
    this.actions = {};
    for (const [name, clip] of Object.entries(u.clips)) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions[name] = a;
    }
    this.weights = Object.fromEntries(Object.keys(this.actions).map((n) => [n, 0]));
    this.weights.idle = 1;
    this.primary = 'idle';
    this.wasGrounded = true;
    this.jumpKind = 'jump';
    this.slump = 0;
  }

  /** Clip time for a timed clip: `x` (game) mapped through the clip's window. */
  #scrub(name, x, xs) {
    const W = M.clips[name].window;
    const a = this.actions[name];
    a.paused = true;
    a.time = mapTime(x, xs, W);
  }

  /**
   * @param {number} dt
   * @param {import('./hero.js').Hero} hero
   */
  update(dt, hero) {
    const C = M.clips;
    const CB = CONFIG.combat;
    const H = CONFIG.hero;
    let primary;
    // Airborne: pick the standing or running jump at take-off.
    if (this.wasGrounded && !hero.grounded && !hero.riding) this.jumpKind = hero.moveSpeed > M.runJumpSpeed ? 'runjump' : 'jump';
    this.wasGrounded = hero.grounded || hero.riding;

    if (hero.deathT >= 0 && !hero.riding) {
      primary = 'death';
      this.#scrub('death', hero.deathT, [0, C.death.time]);
    } else if (hero.riding) {
      primary = 'ride';
    } else if (hero.drink) {
      primary = 'drink';
      const D = CONFIG.desert.pit.drink;
      this.#scrub('drink', hero.drink.t, [0, D.scoop + D.raise + D.sip]);
    } else if (hero.dodgeT > 0) {
      primary = 'roll';
      this.#scrub('roll', 1 - hero.dodgeT / CB.dodge.duration, [0, 1]);
    } else if (hero.attack) {
      const atk = hero.attack;
      const S = CB.combo[atk.step] ?? CB.combo[0];
      primary = atk.kind === 'kick' ? 'kick' : atk.step % 2 === 0 ? 'punch1' : 'punch2';
      this.#scrub(primary, atk.t, [0, S.hitAt / S.duration, 1]);
    } else if (hero.hitT > 0 && hero.grounded) {
      primary = 'hit';
      this.#scrub('hit', C.hit.time - hero.hitT, [0, C.hit.time]);
    } else if (!hero.grounded) {
      primary = this.jumpKind;
      const v0 = H.jumpVelocity;
      this.#scrub(primary, clamp((v0 - hero.velocity.y) / (2 * v0), 0, 1), [0, 0.5, 1]);
    } else {
      primary = 'loco';
    }
    this.primary = primary;

    // Weights: the primary fades in over the crossfade, the rest fade out.
    const step = dt / M.crossfade;
    const run = smoothstep(hero.moveSpeed, M.runBlend[0], M.runBlend[1]);
    for (const name of Object.keys(this.weights)) {
      if (name === 'throwArm') continue;
      const target = primary === 'loco' ? (name === 'idle' ? 1 - run : name === 'run' ? run : 0) : name === primary ? 1 : 0;
      const w = this.weights[name];
      this.weights[name] = dt > 0 ? w + clamp(target - w, -step, step) : w;
    }
    // Throw / catch: right-arm layer.
    const th = hero.throwAnim;
    let arm = 0;
    if (th) {
      const TH = CONFIG.abilities.throw;
      const a = this.actions.throwArm;
      a.paused = true;
      if (th.kind === 'throw') {
        a.time = mapTime(th.t, [0, TH.windup, TH.release, TH.duration], C.throw.window);
        arm = Math.min(1, th.t / M.crossfade, (TH.duration - th.t) / M.crossfade + 0.2);
      } else {
        const p = Math.min(1, th.t / TH.catchTime);
        a.time = M.catchAt - 0.1 * Math.sin(p * Math.PI);
        arm = Math.sin(p * Math.PI);
      }
    }
    this.weights.throwArm = clamp(arm, 0, 1) * M.armLayerWeight;
    for (const [name, a] of Object.entries(this.actions)) a.setEffectiveWeight(this.weights[name]);
    this.actions.run.timeScale = clamp(hero.moveSpeed / Math.max(0.1, this.u.runSpeed), 0.5, 3);
    this.mixer.update(dt);

    // Seated: hips onto the saddle (the Horse puts the model's origin at the hip joint).
    const R = M.ride;
    this.u.inner.position.y = (R.lift - this.u.rideHips) * this.weights.ride;
    const root = this.model;
    root.updateMatrixWorld(true);
    const axis = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(root.quaternion);
    // Astride: thighs down and apart round the horse's body, shins hanging.
    const wr = this.weights.ride;
    if (wr > 0) {
      const b = this.u.bones;
      for (const [thigh, shin, side] of [[b.leftUpLeg, b.leftLeg, 1], [b.rightUpLeg, b.rightLeg, -1]]) {
        rotateBone(thigh, axis(1, 0, 0), R.thighPitch * wr);
        rotateBone(thigh, axis(0, 0, 1), side * R.spread * wr);
        rotateBone(shin, axis(1, 0, 0), R.knee * wr);
      }
    }
    // Exhausted: slumped forward, head low, heavy breathing.
    const ex = hero.exhaustion;
    this.slump = 0;
    if (ex > 0) {
      const EX = CONFIG.desert.exhaustion;
      const breath = Math.sin(hero.time * Math.PI * 2 * EX.breathe);
      this.slump = EX.slump * ex + breath * 0.05 * ex;
      rotateBone(this.u.bones.spine, axis(1, 0, 0), this.slump);
      rotateBone(this.u.bones.head, axis(1, 0, 0), 0.3 * ex);
      this.u.inner.position.y += breath * EX.breatheBob * ex;
    }
    if (hero.facePitch) rotateBone(this.u.bones.head, axis(1, 0, 0), hero.facePitch);
  }
}

/** Rotates a bone by `angle` round a world-space axis (on top of the animated pose). */
function rotateBone(bone, axisWorld, angle) {
  bone.parent.updateWorldMatrix(true, false);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const local = axisWorld.clone().applyQuaternion(pq).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local, angle));
  bone.updateMatrixWorld(true);
}
