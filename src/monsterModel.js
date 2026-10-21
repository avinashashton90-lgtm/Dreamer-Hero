import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CONFIG } from './config.js';
import { fetchBuffers, parseFBX, retargetClip, mapTime, boneKey } from './mixamo.js';

const B = CONFIG.boss;
const M = B.model;
const F = B.fire;
const { clamp } = THREE.MathUtils;

/**
 * The cave monster: Warrok (Mixamo) from public/models/boss/boss.glb (meshopt-compressed,
 * skeleton in centimetres under a 0.01 root) with the animation FBX files beside it,
 * retargeted by bone name. Scaled to the boss height (~2.4x AJ), feet at the origin, facing +Z.
 * `userData` keeps the placeholder's interface for the Boss: `head`, `jaw`, `arms`
 * [{shoulder, elbow}], `legs` [{hip, knee}] (bones), `mouth` (fire-breath glow on the jaw),
 * `mats` (hit flash / green tint / fade), `fists()` and the `animator`.
 *
 * @param {{ readFile?: (url) => Promise<ArrayBuffer>, onProgress?: (f) => void, base?: string }} opts
 */
export async function loadMixamoMonster(opts = {}) {
  const base = opts.base ?? M.path;
  const urls = [base + M.file, ...M.clips.map((n) => `${base}${n}.fbx`)];
  const buffers = await fetchBuffers(urls, { readFile: opts.readFile, onProgress: opts.onProgress });
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffers[0], base);
  const sources = await Promise.all(buffers.slice(1).map((b) => parseFBX(b)));
  const warrok = gltf.scene;

  const root = new THREE.Group(); // placed and turned by the Boss
  const fit = new THREE.Group();
  root.add(fit);
  fit.add(warrok);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(warrok, true);
  const scale = B.height / (box.max.y - box.min.y);
  fit.scale.setScalar(scale);
  fit.position.y = -box.min.y * scale;
  root.updateMatrixWorld(true);

  const bone = (key) => {
    let found = null;
    warrok.traverse((o) => {
      if (!found && o.isBone && boneKey(o.name) === key) found = o;
    });
    if (!found) throw new Error(`boss.glb: no ${key} bone`);
    return found;
  };
  const bones = {
    hips: bone('Hips'), chest: bone('Spine2'), head: bone('Head'), jaw: bone('Jaw'),
    leftHand: bone('LeftHand'), rightHand: bone('RightHand'),
  };
  const arms = ['Left', 'Right'].map((s) => ({ shoulder: bone(`${s}Arm`), elbow: bone(`${s}ForeArm`) }));
  const legs = ['Left', 'Right'].map((s) => ({ hip: bone(`${s}UpLeg`), knee: bone(`${s}Leg`) }));

  const mats = [];
  warrok.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // skinned bounds don't follow the animation
    for (const m of [].concat(o.material)) if (!mats.includes(m)) mats.push(m);
  });

  // Clips: every animation file, retargeted by bone name (root motion stripped; the jump
  // attack keeps its leap height, the Boss keeps the logical position).
  const clips = {};
  M.clips.forEach((name, i) => {
    const src = sources[i].animations.find((a) => a.duration > 0);
    if (src) clips[name] = retargetClip(src, warrok, { root: 'xz', name });
  });
  for (const name of M.clips) if (!clips[name]) throw new Error(`boss: missing clip ${name}`);

  const mouth = makeMouthGlow(warrok, bones.jaw);
  const fists = () => [bones.leftHand, bones.rightHand].map((b) => b.getWorldPosition(new THREE.Vector3()));
  root.userData = { kind: 'mixamo', warrok, bones, head: bones.head, jaw: bones.jaw, mouth, arms, legs, mats, clips, fists, scale };
  root.userData.animator = new MonsterAnimator(root);
  return root;
}

/**
 * The fire-breath glow inside the mouth: an additive sphere on the jaw bone, at the front of
 * the jaw-skinned vertices (bind pose). Same interface as the placeholder's `mouth`.
 */
function makeMouthGlow(warrok, jaw) {
  warrok.updateMatrixWorld(true);
  const jp = jaw.getWorldPosition(new THREE.Vector3());
  let front = null;
  const v = new THREE.Vector3();
  warrok.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    const jawIndex = o.skeleton.bones.indexOf(jaw);
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      let bi = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) (best = sw.getComponent(i, k)), (bi = si.getComponent(i, k));
      if (bi !== jawIndex) continue;
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); // (skinned + dequantized)
      if (!front || v.z > front.z) front = v.clone();
    }
  });
  const at = front ? new THREE.Vector3(jp.x, (jp.y + front.y) / 2, front.z - (front.z - jp.z) * 0.45) : jp; // a little inside the mouth
  const s = jaw.getWorldScale(new THREE.Vector3()).x;
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(M.mouthSize / s, 10, 8),
    new THREE.MeshBasicMaterial({ color: F.mouthColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  mouth.position.copy(jaw.worldToLocal(at.clone()));
  mouth.visible = false;
  mouth.renderOrder = 9;
  jaw.add(mouth);
  return mouth;
}

/**
 * Plays Warrok's clips from the Boss state (one primary clip, crossfaded over M.crossfade):
 * guard / recover → idle; chase → walk (speed-matched); melee wind-up + blow → swipe or
 * punch (scrubbed so the blow lands at the hit); slam wind-up + slam → jumpattack,
 * scrubbed so the fists land at the start of the slam (the damage frame); fire wind-up →
 * roar rearing back, fire → roar thrusting forward; charge wind-up → roar, charge → run;
 * stunned → hit (doubles over, holds, recovers); paralyzed → hit frozen; dying → death.
 * Procedural on top: the jaw opens (smoke inhale, fire), the chest heaves while inhaling.
 */
export class MonsterAnimator {
  constructor(model) {
    this.u = model.userData;
    this.mixer = new THREE.AnimationMixer(this.u.warrok);
    this.actions = {};
    for (const [name, clip] of Object.entries(this.u.clips)) {
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      this.actions[name] = a;
    }
    this.weights = Object.fromEntries(Object.keys(this.actions).map((n) => [n, 0]));
    this.weights.idle = 1;
    this.clip = 'idle';
    this.jawRest = this.u.jaw.quaternion.clone(); // (the clips may not animate the jaw)
  }

  /** Base pose for a fresh state (no blend in from the previous one). */
  snap() {
    for (const n of Object.keys(this.weights)) this.weights[n] = n === this.clip ? 1 : 0;
  }

  #scrub(name, t) {
    const a = this.actions[name];
    a.paused = true;
    a.time = clamp(t, 0, a.getClip().duration);
  }

  #loop(name, timeScale) {
    const a = this.actions[name];
    a.paused = false;
    a.timeScale = timeScale;
  }

  /**
   * @param {number} dt
   * @param {import('./boss.js').Boss} boss
   * @param {{ inhale: number }} fx  0..1 how far into breathing the smoke in
   */
  update(dt, boss, fx) {
    const S = boss.constructor.STATES;
    const t = boss.stateTime;
    const P = boss.pace;
    let clip = 'idle';
    let jaw = M.jawOpen.inhale * fx.inhale;
    switch (boss.state) {
      case S.CHASE:
        clip = 'walk';
        this.#loop('walk', clamp((B.walkSpeed * (boss.enraged ? B.enrageWalk : 1)) / M.walkRef, 0.6, 2.2));
        break;
      case S.SLAM_WINDUP:
        clip = 'jumpattack';
        this.#scrub(clip, mapTime(t / (B.slam.windup * P), [0, 1], M.slamWindup));
        break;
      case S.SLAM:
        clip = 'jumpattack';
        this.#scrub(clip, mapTime(t / B.slam.impact, [0, 1], M.slamImpact));
        break;
      case S.MELEE_WINDUP:
        clip = boss.meleeKind;
        this.#scrub(clip, mapTime(t / B.melee.windup, [0, 1], M[clip].windup));
        break;
      case S.MELEE:
        clip = boss.meleeKind;
        this.#scrub(clip, mapTime(t / B.melee.strike, [0, 1], M[clip].strike));
        break;
      case S.FIRE_WINDUP:
        clip = 'roar';
        this.#scrub(clip, mapTime(t / (F.windup * P), [0, 1], M.fireWindup));
        jaw = Math.max(jaw, M.jawOpen.fireWindup * Math.min(1, t / (F.windup * P)));
        break;
      case S.FIRE:
        clip = 'roar';
        this.#scrub(clip, mapTime(t / F.duration, [0, 1], M.fire));
        jaw = M.jawOpen.fire;
        break;
      case S.CHARGE_WINDUP:
        clip = 'roar';
        this.#scrub(clip, mapTime(t / (B.charge.windup * P), [0, 1], M.chargeWindup));
        break;
      case S.CHARGE:
        clip = 'run';
        this.#loop('run', clamp(B.charge.speed / M.runRef, 0.8, 2.4));
        break;
      case S.STUNNED:
        clip = 'hit';
        this.#scrub(clip, mapTime(t / B.charge.stun, M.stunned.xs, M.stunned.ts));
        break;
      case S.PARALYZED:
        clip = 'hit';
        this.#scrub(clip, M.paralyzedAt);
        break;
      case S.STAGGERED:
        clip = 'hit';
        this.#scrub(clip, mapTime(t / B.flashStagger, M.stunned.xs, M.stunned.ts));
        break;
      case S.SMOKED:
        // Coughing: flinches into the hit pose, the head bobbing, the jaw working.
        clip = 'hit';
        this.#scrub(clip, Math.min(M.smokedAt, t * 2) + Math.sin(t * 18) * B.smoke.coughBob);
        jaw = Math.max(jaw, M.jawOpen.inhale * (0.6 + 0.4 * Math.sin(t * 18)));
        break;
      case S.DYING:
      case S.DEAD: {
        const D = B.dying;
        clip = 'death';
        this.#scrub(clip, mapTime(t / (D.stumble + D.fall), [0, 1], M.dying));
        break;
      }
      default:
        this.#loop('idle', 1); // guard, recover
    }
    this.clip = clip;
    const step = dt / M.crossfade;
    this.u.jaw.quaternion.copy(this.jawRest);
    for (const [name, a] of Object.entries(this.actions)) {
      const target = name === clip ? 1 : 0;
      const w = this.weights[name];
      this.weights[name] = dt > 0 ? w + clamp(target - w, -step, step) : w;
      a.setEffectiveWeight(this.weights[name]);
    }
    this.mixer.update(dt);

    // Jaw open (on top of the clip) and the chest heaving while it breathes the smoke in.
    const { jaw: jawBone, bones } = this.u;
    if (jaw > 0) jawBone.rotateX(jaw);
    const heave = 1 + CONFIG.abilities.smokeBomb.heave * fx.inhale * (0.5 + 0.5 * Math.sin((boss.clock ?? 0) * 13));
    bones.chest.scale.set(heave, 1 + (heave - 1) * 0.5, heave);
  }
}
