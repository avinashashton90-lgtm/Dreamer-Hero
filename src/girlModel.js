import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CONFIG } from './config.js';
import { fetchBuffers, parseFBX, retargetClip, rootSpeed, boneKey } from './mixamo.js';

const GM = CONFIG.girlModel;
const { clamp } = THREE.MathUtils;

/**
 * The girl: Amy (Mixamo Ch46) from public/models/girl/girl.glb, exactly as she comes, scaled to
 * GM.height with the feet at the origin, facing +Z. Her glb is meshopt-compressed (decoder
 * enabled here) and its skeleton is in centimetres under a 0.01 root, like the animation FBX
 * files beside it, so those retarget by bone name with no rescaling. Adds only a faint purple
 * glow over each eye on the head bone (hidden; the witch hint flickers it).
 *
 * @param {{ readFile?: (url) => Promise<ArrayBuffer>, onProgress?: (f) => void, base?: string }} opts
 */
export async function loadMixamoGirl(opts = {}) {
  const base = opts.base ?? GM.path;
  const names = Object.keys(GM.clips);
  const urls = [base + GM.file, ...names.map((n) => `${base}${GM.clips[n].file}.fbx`)];
  const buffers = await fetchBuffers(urls, { readFile: opts.readFile, onProgress: opts.onProgress, weights: [1, ...names.map(() => 1)] });
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffers[0], base);
  const sources = await Promise.all(buffers.slice(1).map((b) => parseFBX(b, { textureMax: GM.textureMax })));
  const amy = gltf.scene;

  const root = new THREE.Group(); // placed by the boss / story / horse (the appear scales it)
  const inner = new THREE.Group(); // lowered while riding (hips onto the horse's back)
  const fit = new THREE.Group(); // scale to GM.height, feet at the origin
  root.add(inner);
  inner.add(fit);
  fit.add(amy);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(amy, true);
  const scale = GM.height / (box.max.y - box.min.y);
  fit.scale.setScalar(scale);
  fit.position.y = -box.min.y * scale;
  root.updateMatrixWorld(true);
  amy.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow the animation
  });

  const bone = (key) => {
    let found = null;
    amy.traverse((o) => {
      if (!found && o.isBone && boneKey(o.name) === key) found = o;
    });
    return found;
  };
  const bones = {
    hips: bone('Hips'), spine: bone('Spine1'), chest: bone('Spine2'), neck: bone('Neck'), head: bone('Head'),
    leftUpLeg: bone('LeftUpLeg'), rightUpLeg: bone('RightUpLeg'), leftLeg: bone('LeftLeg'), rightLeg: bone('RightLeg'),
  };
  if (Object.values(bones).some((b) => !b)) throw new Error('girl.glb: missing Mixamo bones');

  // Clips: the embedded idle plus every animation file (retargeted by bone name).
  const clips = { idle: retargetClip(gltf.animations[0], amy, { root: 'xz', name: 'idle' }) };
  names.forEach((n, i) => {
    const src = sources[i].animations.find((a) => a.duration > 0);
    if (src) clips[n] = retargetClip(src, amy, { root: 'xz', name: n });
  });
  // Upper-body versions for layering over the base pose (talking / pointing while riding).
  for (const n of ['talk', 'point']) {
    const src = sources[names.indexOf(n)]?.animations.find((a) => a.duration > 0);
    if (src) clips[`${n}Upper`] = retargetClip(src, amy, { root: 'xz', bones: GM.upperBones, name: `${n}Upper` });
  }
  const walkSrc = sources[names.indexOf('walk')]?.animations.find((a) => a.duration > 0);
  // Skeleton centimetres → metres in her root's space: the glb's 0.01 root times our fit scale.
  const cm = bones.hips.parent.getWorldScale(new THREE.Vector3()).y;
  const walkSpeed = walkSrc ? rootSpeed(walkSrc) * cm : 1;
  const hipsTrack = clips.ride?.tracks.find((t) => t.name === `${bones.hips.name}.position`);
  const rideHips = (hipsTrack ? hipsTrack.values[1] : bones.hips.position.y) * cm;

  const eyes = makeEyeGlow(amy, bones.head);
  root.userData = { kind: 'mixamo', amy, inner, bones, clips, eyes, walkSpeed, rideHips, scale };
  root.userData.animator = new GirlAnimator(root);
  return root;
}

/**
 * Two faint purple glows over her eyes, on the head bone (additive, shown only during the
 * witch hint). The face's front comes from the head-skinned vertices in the bind pose.
 */
function makeEyeGlow(amy, head) {
  const E = GM.eyes;
  amy.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  let front = -Infinity;
  const v = new THREE.Vector3();
  amy.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    const headIndex = o.skeleton.bones.indexOf(head);
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      let bi = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) (best = sw.getComponent(i, k)), (bi = si.getComponent(i, k));
      if (bi !== headIndex) continue;
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); // (skinned + dequantized)
      if (Math.abs(v.x - hp.x) < 0.03 && v.y > hp.y + E.up - 0.03 && v.y < hp.y + E.up + 0.03) front = Math.max(front, v.z);
    }
  });
  if (!Number.isFinite(front)) front = hp.z + 0.09;
  const mat = new THREE.MeshBasicMaterial({ color: E.color, transparent: true, opacity: E.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  // On the head bone: positions from world (metres) into its frame, sizes by its scale.
  const group = new THREE.Group();
  const k = head.getWorldScale(new THREE.Vector3()).x;
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(E.size / k, 10, 8), mat);
    glow.position.copy(head.worldToLocal(new THREE.Vector3(hp.x + side * E.apart, hp.y + E.up, front - E.back)));
    glow.renderOrder = 9;
    group.add(glow);
  }
  group.visible = false;
  head.add(group);
  return group;
}

/**
 * Drives Amy's mixer from the Girl's state, one base clip at a time (crossfaded over
 * GM.crossfade): ride (behind AJ, legs down the horse's sides) → kneel → happy (the smile) →
 * walk (speed-matched) → scared (the cave) → idle. Talking and pointing are upper-body layers
 * on top (so they work standing or riding); pointing holds the arm out. Looking round at AJ
 * while riding turns the head and upper spine.
 */
export class GirlAnimator {
  constructor(model) {
    this.model = model;
    this.u = model.userData;
    this.mixer = new THREE.AnimationMixer(this.u.amy);
    this.actions = {};
    for (const name of ['idle', 'scared', 'walk', 'kneel', 'happy', 'ride', 'talkUpper', 'pointUpper']) {
      const clip = this.u.clips[name];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      this.actions[name] = a;
    }
    this.weights = Object.fromEntries(Object.keys(this.actions).map((n) => [n, 0]));
    this.weights.idle = 1;
    this.primary = 'idle';
    this.pointT = 0;
    this.prev = new THREE.Vector3();
    this.speed = 0;
  }

  /** @param {number} dt  @param {import('./girl.js').Girl} girl */
  update(dt, girl) {
    // Measured speed (the story moves her root while she walks).
    const p = this.model.getWorldPosition(new THREE.Vector3());
    if (dt > 0) this.speed += (p.distanceTo(this.prev) / dt - this.speed) * (1 - Math.exp(-8 * dt));
    this.prev.copy(p);
    const primary = this.actions[girl.pose] ? girl.pose : 'idle';
    this.primary = primary;
    const step = dt / GM.crossfade;
    const ease = (name, target) => {
      const w = this.weights[name];
      this.weights[name] = dt > 0 ? w + clamp(target - w, -step, step) : w;
    };
    for (const name of Object.keys(this.actions)) if (!name.endsWith('Upper')) ease(name, name === primary ? 1 : 0);
    // Upper-body layers: talking (her lines), pointing (arm out, held).
    this.pointT = girl.pointing ? this.pointT + dt : 0;
    ease('talkUpper', girl.talking && !girl.pointing && !girl.kneeling ? 1 : 0);
    ease('pointUpper', girl.pointing ? 1 : 0);
    if (this.actions.pointUpper) {
      this.actions.pointUpper.paused = true;
      this.actions.pointUpper.time = Math.min(this.pointT, GM.clips.point.hold);
    }
    for (const [name, a] of Object.entries(this.actions)) {
      a.setEffectiveWeight(name.endsWith('Upper') ? this.weights[name] * GM.layerWeight : this.weights[name]);
    }
    if (this.actions.walk) this.actions.walk.timeScale = clamp(this.speed / Math.max(0.1, this.u.walkSpeed), 0.6, 2);
    this.mixer.update(dt);

    // Seated: hips onto the horse's back (the horse puts her origin at the seat point).
    const R = GM.ride;
    const wr = this.weights.ride ?? 0;
    this.u.inner.position.y = (R.lift - this.u.rideHips) * wr;
    const root = this.model;
    root.updateMatrixWorld(true);
    const axis = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const b = this.u.bones;
    if (wr > 0) {
      // Astride: thighs down and apart round the horse's rump, shins hanging.
      for (const [thigh, shin, side] of [[b.leftUpLeg, b.leftLeg, 1], [b.rightUpLeg, b.rightLeg, -1]]) {
        rotateBone(thigh, axis(1, 0, 0), R.thighPitch * wr);
        rotateBone(thigh, axis(0, 0, 1), side * R.spread * wr);
        rotateBone(shin, axis(1, 0, 0), R.knee * wr);
      }
    }
    // Looking round at him (riding behind): upper spine and head turn.
    this.look = (this.look ?? 0) + ((girl.lookAtHero ? 1 : 0) - (this.look ?? 0)) * (1 - Math.exp(-6 * dt));
    if (this.look > 0.001) {
      const L = GM.lookAtHero;
      rotateBone(b.chest, axis(0, 1, 0), L.yaw * 0.4 * this.look);
      rotateBone(b.head, axis(0, 1, 0), L.yaw * 0.6 * this.look);
      rotateBone(b.head, axis(1, 0, 0), L.pitch * this.look);
    }
    // Witch hint: the eye glow (flickering while hinting; steady in her witch form).
    this.u.eyes.visible = girl.eyesGlowing;
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

