import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { fetchBuffers } from '../mixamo.js';

// Gearhaven's robots (Quaternius Animated Mech Pack, CC0): the scout (Leela), the two sword
// robots (Mike, Stan) and the armoured mech boss (George) — meshopt glb files fitted to their
// height, tinted brass / copper / rust in a cheap Lambert material that keeps each texture's
// detail, with an AnimationMixer playing clips by role (idle, walk, run, attack, hit, death).
// Each kind's file loads once (cached); every loadRobotModel() is a SkeletonUtils clone with its
// own mixer. If a file fails: a code-built placeholder robot.

const RB = CONFIG.part2.robots;

/** Parse a glb (fetched in the browser, or `opts.readFile` in Node). */
export async function loadGlb(url, opts = {}) {
  const [buffer] = await fetchBuffers([url], { readFile: opts.readFile, onProgress: opts.onProgress });
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, base);
}

/**
 * A Lambert material showing `src`'s texture through a luminance ramp: dark → `palette[0]`, mid →
 * `palette[1]`, light → `palette[2]`, with `keep` of the original colour mixed back in.
 */
export function rampMaterial(src, palette, keep) {
  const mat = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: 0xffffff, transparent: src.transparent, alphaTest: src.alphaTest });
  const [d, m, l] = palette.map((c) => new THREE.Color(c));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uDark: { value: d }, uMid: { value: m }, uLight: { value: l }, uKeep: { value: keep } });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDark;\nuniform vec3 uMid;\nuniform vec3 uLight;\nuniform float uKeep;')
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  float lum = pow( clamp( dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 1.0 ), 0.4545 );
  vec3 ramp = lum < 0.5 ? mix( uDark, uMid, lum * 2.0 ) : mix( uMid, uLight, lum * 2.0 - 1.0 );
  diffuseColor.rgb *= mix( ramp, texel.rgb, uKeep );
  diffuseColor.a *= texel.a;
#endif`);
  };
  mat.customProgramCacheKey = () => 'gearhavenRamp';
  mat.userData.ramp = { palette, keep };
  return mat;
}

/** Fit a loaded scene to `height`: feet at the origin (or `centre`d), facing +Z. Returns the wrapper. */
export function fitModel(scene, height, { centre = false } = {}) {
  const fit = new THREE.Group();
  fit.add(scene);
  fit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const k = height / Math.max(1e-6, box.max.y - box.min.y);
  scene.scale.multiplyScalar(k);
  scene.position.y -= (centre ? (box.min.y + box.max.y) / 2 : box.min.y) * k;
  scene.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // (skinned bounds don't follow the animation)
  });
  return fit;
}

/** The clip of the first name found (a role's list), or null. */
export function findClip(clips, names) {
  for (const n of names) {
    const c = clips.find((a) => a.name === n || a.name.endsWith(`|${n}`));
    if (c) return c;
  }
  return null;
}

/**
 * Plays one clip at a time by role (crossfaded); `once` clips hold their last frame.
 * `update(dt)` steps the mixer. `roles` maps a role to its clip (null: missing).
 */
export class ClipAnimator {
  constructor(root, clips, roles, crossfade = RB.crossfade) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
    this.roles = roles;
    this.crossfade = crossfade;
    this.current = null;
    this.role = null;
    this.clipName = null;
  }

  /** Play `role` (or a clip by its own name); returns false if there is no such clip. */
  play(role, { once = false, restart = false } = {}) {
    const clip = this.roles[role] ?? this.clips.find((c) => c.name === role) ?? null;
    if (!clip) return false;
    if (this.clipName === clip.name && !restart) return true;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, this.crossfade, false);
    this.current = next;
    this.role = role;
    this.clipName = clip.name;
    return true;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

// --- the robots --------------------------------------------------------------

const templates = new Map(); // kind → Promise<{ scene, clips } | null>

/** Forget the loaded templates (tests: load again, e.g. after a simulated failure). */
export function forgetRobotTemplates() {
  templates.clear();
}

/** The kind's template (loaded once): its glb fitted, tinted; null if it failed. */
export function loadRobotTemplate(kind, opts = {}) {
  if (opts.placeholder) return Promise.resolve(null);
  if (!templates.has(kind)) {
    const K = RB.kinds[kind];
    templates.set(kind, loadGlb(RB.path + K.file, opts).then((gltf) => {
      const tinted = new Map();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const src = o.material;
        if (!tinted.has(src)) tinted.set(src, rampMaterial(src, K.palette, K.keep));
        o.material = tinted.get(src);
      });
      return { scene: fitModel(gltf.scene, K.height), clips: gltf.animations };
    }).catch((e) => {
      console.warn(`Robot "${kind}" (${K.file}) failed to load; using the placeholder robot.`, e);
      return null;
    }));
  }
  return templates.get(kind);
}

/**
 * A robot: `kind` is scout / swordA / swordB / boss (CONFIG.part2.robots.kinds). Returns a
 * Group, feet at the origin, facing +Z; `userData` = { kind, animator (play(role), update(dt)),
 * clipNames, roles, placeholder }. The animator starts on its idle.
 */
export async function loadRobotModel(kind, opts = {}) {
  const K = RB.kinds[kind];
  const t = await loadRobotTemplate(kind, opts);
  if (!t) return buildPlaceholderRobot(kind);
  const root = new THREE.Group();
  root.name = `robot:${kind}`;
  const body = cloneSkinned(t.scene);
  root.add(body);
  const roles = {};
  for (const [role, names] of Object.entries(RB.clips)) roles[role] = findClip(t.clips, role === 'attack' ? RB.attackFor[kind] ?? names : names);
  const animator = new ClipAnimator(body, t.clips, roles);
  animator.play('idle');
  root.userData = { kind, name: K.name, role: K.role, height: K.height, animator, clipNames: t.clips.map((c) => c.name), roles, placeholder: false };
  return root;
}

/** The fallback robot: a brass box body on copper legs, a glowing visor; it bobs and swings. */
export function buildPlaceholderRobot(kind) {
  const K = RB.kinds[kind];
  const P = RB.placeholder;
  const h = K.height;
  const root = new THREE.Group();
  root.name = `robot:${kind}`;
  const brass = new THREE.MeshLambertMaterial({ color: P.brass });
  const copper = new THREE.MeshLambertMaterial({ color: P.copper });
  const rust = new THREE.MeshLambertMaterial({ color: P.rust });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(h * 0.36, h * 0.34, h * 0.26), brass);
  torso.position.y = h * 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(h * 0.2, h * 0.16, h * 0.18), copper);
  head.position.y = h * 0.92;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(h * 0.16, h * 0.04, 0.02), new THREE.MeshBasicMaterial({ color: P.eye }));
  visor.position.set(0, h * 0.94, h * 0.09 + 0.01);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(h * 0.1, h * 0.45, h * 0.12).translate(0, -h * 0.225, 0), rust);
    leg.position.set(s * h * 0.1, h * 0.45, 0);
    return leg;
  });
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(h * 0.08, h * 0.34, h * 0.08).translate(0, -h * 0.17, 0), copper);
    arm.position.set(s * h * 0.23, h * 0.76, 0);
    return arm;
  });
  body.add(torso, head, visor, ...legs, ...arms);
  root.add(body);
  // (a tiny animator with the same interface: a bob, legs and arms swinging by role)
  let t = 0;
  const animator = {
    role: 'idle',
    clipName: 'idle',
    play(role) {
      this.role = this.clipName = role;
      return true;
    },
    update(dt) {
      t += dt;
      const walk = this.role === 'walk' || this.role === 'run' ? 1 : 0;
      const atk = this.role === 'attack' ? 1 : 0;
      body.position.y = Math.abs(Math.sin(t * 6)) * 0.05 * h * walk + Math.sin(t * 2) * 0.01 * h;
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 8 + i * Math.PI) * 0.5 * walk));
      arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 8 + i * Math.PI + Math.PI) * 0.5 * walk - atk * Math.max(0, Math.sin(t * 7)) * 1.6 * (i ? 1 : 0)));
    },
  };
  const clipNames = ['idle', 'walk', 'run', 'attack', 'hit', 'death'];
  root.userData = { kind, name: K.name, role: K.role, height: h, animator, clipNames, roles: Object.fromEntries(clipNames.map((c) => [c, { name: c }])), placeholder: true };
  return root;
}
