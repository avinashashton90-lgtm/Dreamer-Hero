import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { fetchBuffers, downsizeTextures, mapTime } from './mixamo.js';

const HM = CONFIG.horseModel;
const { clamp } = THREE.MathUtils;

/**
 * The horse model (public/models/horse/horse.gltf, flat material colours, 13 clips), scaled
 * so the top of its back is `backHeight` above the hooves (origin at the hooves, facing +Z).
 * Returns the same `userData` shape as the placeholder horse (body / legs / neck / tail /
 * seat) plus `animator` (gaits by speed) and the saddle on a back bone (`seatBone`,
 * `seatLocal`, `passengerLocal`) so the rider follows the gallop's rocking.
 *
 * @param {{ readFile?: (url) => Promise<ArrayBuffer>, onProgress?: (f) => void }} opts
 */
export async function loadGltfHorse(opts = {}) {
  const [buffer] = await fetchBuffers([HM.file], { readFile: opts.readFile, onProgress: opts.onProgress });
  const gltf = await new GLTFLoader().parseAsync(buffer, HM.file.replace(/[^/]*$/, ''));
  const scene = gltf.scene;
  downsizeTextures(scene, HM.textureMax);
  const names = gltf.animations.map((a) => a.name);
  console.info(`Horse clips: ${names.join(', ')}`);

  // Measure in the bind pose: the top of the back over the seat bone sets the scale.
  scene.updateMatrixWorld(true);
  const seatBone = scene.getObjectByName(HM.seatBone);
  if (!seatBone) throw new Error(`horse.gltf: no ${HM.seatBone} bone`);
  const seatPos = seatBone.getWorldPosition(new THREE.Vector3());
  const meshes = [];
  scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; // skinned bounds don't follow the animation
      meshes.push(o);
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  let backTop = -Infinity;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.z - seatPos.z) < 0.3 && Math.abs(v.x) < 0.3) backTop = Math.max(backTop, v.y);
    }
  }
  const scale = HM.backHeight / (backTop - box.min.y);

  const root = new THREE.Group(); // positioned / turned by the Horse
  const body = new THREE.Group(); // leans into turns and pitches on a stumble
  root.add(body);
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  inner.position.y = -box.min.y * scale;
  inner.add(scene);
  body.add(inner);
  root.updateMatrixWorld(true);

  // Saddle and passenger seat in the seat bone's frame (offsets are in metres, horse space).
  // (measured in the scene's own space above; the root sits at the origin, so world = horse space)
  const top = new THREE.Vector3(0, backTop, seatPos.z).applyMatrix4(scene.matrixWorld);
  const toBone = (offset) => seatBone.worldToLocal(top.clone().add(new THREE.Vector3(...offset)));
  const seatLocal = toBone(HM.saddleOffset);
  const passengerLocal = toBone(HM.passengerOffset);

  // Footfall points (dust, splashes, hoof prints): the four hooves in the bind pose.
  const hoof = (n) => {
    const o = scene.getObjectByName(n);
    const g = new THREE.Group();
    if (o) {
      const p = o.getWorldPosition(new THREE.Vector3());
      g.position.set(p.x, 0, p.z);
    }
    g.userData.knee = new THREE.Group();
    return g;
  };
  const legs = [hoof('FFL'), hoof('FFR'), hoof('FFBL'), hoof('FFBR')];

  root.userData = {
    kind: 'gltf',
    body, legs, neck: new THREE.Group(), tail: new THREE.Group(),
    seat: top.clone().add(new THREE.Vector3(...HM.saddleOffset)), // horse space (fallback)
    seatBone, seatLocal, passengerLocal, scale, clipNames: names,
  };
  root.userData.animator = new HorseAnimator(scene, gltf.animations);
  return root;
}

/**
 * Gaits by speed: idle (or grazing while it waits for the rider) → walk → trot → gallop,
 * crossfaded over CONFIG.horseModel.crossfade, each clip played at speed / ref; the Gallop
 * button plays the gallop clip faster still. A hop plays the jump clip, scrubbed through
 * take-off, apex and landing by the hop's vertical speed. Roles whose clip is missing fall
 * back to the nearest one listed (roles sharing a clip share one action).
 */
export class HorseAnimator {
  constructor(scene, clips) {
    this.mixer = new THREE.AnimationMixer(scene);
    const byName = new Map(clips.map((c) => [c.name.toLowerCase(), c]));
    this.roleClip = {};
    this.actions = new Map(); // clip name → action
    for (const [role, list] of Object.entries(HM.roles)) {
      const clip = list.map((n) => byName.get(n.toLowerCase())).find(Boolean) ?? clips[0];
      this.roleClip[role] = clip.name;
      if (!this.actions.has(clip.name)) {
        const c = role === 'jump' ? holdRoot(clip) : clip;
        const a = this.mixer.clipAction(c);
        a.play();
        a.setEffectiveWeight(0);
        this.actions.set(clip.name, a);
      }
    }
    this.weights = new Map([...this.actions.keys()].map((k) => [k, 0]));
    this.weights.set(this.roleClip.graze, 1);
  }

  /**
   * @param {number} dt
   * @param {{ speed, galloping, grounded, ridden, eating?, drinking?, hopVelocity, vy }} s  eating: on a grass patch; drinking: at an oasis
   */
  update(dt, s) {
    const targets = new Map([...this.actions.keys()].map((k) => [k, 0]));
    const rates = new Map();
    const add = (role, w, rate = 1) => {
      const name = this.roleClip[role];
      const before = targets.get(name);
      targets.set(name, before + w);
      // Roles sharing a clip blend their playback rates by weight.
      rates.set(name, (rates.get(name) ?? 0) + rate * w);
    };
    if (!s.grounded) {
      add('jump', 1);
      const a = this.actions.get(this.roleClip.jump);
      a.paused = true;
      a.time = mapTime(clamp((s.hopVelocity - s.vy) / (2 * s.hopVelocity), 0, 1), [0, 0.5, 1], HM.jumpWindow);
    } else {
      // Between the two gait anchors around the current speed.
      const G = HM.gaits;
      const speed = Math.max(0, s.speed);
      let i = 0;
      while (i < G.length - 1 && speed > G[i + 1].speed) i++;
      const a = G[i];
      const b = G[Math.min(i + 1, G.length - 1)];
      const k = b === a ? 0 : clamp((speed - a.speed) / (b.speed - a.speed), 0, 1);
      const rate = (g) => (g.ref ? clamp(speed / g.ref, g.min, g.max) * (g.role === 'gallop' && s.galloping ? HM.gallopRate : 1) : 1);
      const idleRole = (g) => (g.role === 'idle' && (!s.ridden || s.eating) ? 'graze' : g.role);
      add(idleRole(a), 1 - k, rate(a));
      if (k > 0) add(idleRole(b), k, rate(b));
      // Drinking at an oasis: head down (the graze clip) over the slow walk.
      if (s.drinking) {
        for (const [name, w] of targets) targets.set(name, w * (1 - HM.drinkBlend));
        add('graze', HM.drinkBlend, 1);
      }
    }
    const step = dt / HM.crossfade;
    for (const [name, a] of this.actions) {
      const target = targets.get(name);
      const w = this.weights.get(name);
      const nw = dt > 0 ? w + clamp(target - w, -step, step) : w;
      this.weights.set(name, nw);
      a.setEffectiveWeight(nw);
      if (target > 0 && rates.has(name)) a.timeScale = rates.get(name) / target;
      if (name !== this.roleClip.jump || s.grounded) a.paused = false;
    }
    this.mixer.update(dt);
  }

  /** The clip each role plays (after fallbacks), e.g. { trot: 'Gallop' }. */
  get mapping() {
    return { ...this.roleClip };
  }
}

/** The jump clip with its root bone held at the first frame's height (the hop lifts the horse). */
function holdRoot(clip) {
  const c = clip.clone();
  for (const t of c.tracks) {
    if (t.name === `${HM.rootBone}.position`) {
      const y0 = t.values[1];
      for (let i = 1; i < t.values.length; i += 3) t.values[i] = y0;
    }
  }
  return c;
}
