import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { fetchBuffers } from '../mixamo.js';

// Gearhaven's robots (Quaternius Animated Mech Pack, CC0): the scout (Leela), the two sword
// robots (Mike, Stan) and the armoured mech boss (George) — meshopt glb files fitted to their
// height, keeping their own texture colours with brass / copper accents (accentMaterial: the
// orange paint becomes trim, the dark joints metal, the boss's light panels brass plates) and a
// soft rim light in a cheap Lambert material, a glowing eye on the head bone, and an
// AnimationMixer playing clips by role (idle, walk, run, attack, hit, death).
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
 * A Lambert material showing `src`'s texture in its own colours, with Gearhaven metal added:
 * its saturated orange paint → `trim` (a [colour, amount]), its dark joints → `joints`, its light
 * panels → `plates` (or null), shaded by the texture's brightness; × `boost`, plus a soft `rim`
 * light at grazing angles so the robot stands out from the brown courtyard.
 */
export function accentMaterial(src, A) {
  const mat = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: 0xffffff, transparent: src.transparent, alphaTest: src.alphaTest });
  const pair = (p) => (p ? { c: new THREE.Color(p[0]), k: p[1] } : { c: new THREE.Color(0), k: 0 });
  const [trim, joints, plates, rim] = [A.trim, A.joints, A.plates, A.rim].map(pair);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTrim: { value: trim.c }, uTrimK: { value: trim.k }, uJoint: { value: joints.c }, uJointK: { value: joints.k },
      uPlate: { value: plates.c }, uPlateK: { value: plates.k }, uRim: { value: rim.c.clone().multiplyScalar(rim.k) }, uBoost: { value: A.boost ?? 1 },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTrim;\nuniform float uTrimK;\nuniform vec3 uJoint;\nuniform float uJointK;\nuniform vec3 uPlate;\nuniform float uPlateK;\nuniform vec3 uRim;\nuniform float uBoost;')
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  vec3 c = texel.rgb;
  float mx = max( c.r, max( c.g, c.b ) );
  float mn = min( c.r, min( c.g, c.b ) );
  float sat = mx > 1e-4 ? ( mx - mn ) / mx : 0.0;
  float hue = 0.0;
  if ( mx > mn ) {
    float d = mx - mn;
    hue = mx == c.r ? mod( ( c.g - c.b ) / d, 6.0 ) : mx == c.g ? ( c.b - c.r ) / d + 2.0 : ( c.r - c.g ) / d + 4.0;
    hue /= 6.0;
  }
  // orange paint (and rust) → trim; dark grey joints → metal; light grey panels → plates
  float wTrim = smoothstep( 0.02, 0.045, hue ) * ( 1.0 - smoothstep( 0.12, 0.15, hue ) ) * smoothstep( 0.45, 0.65, sat ) * smoothstep( 0.04, 0.1, mx );
  float wJoint = ( 1.0 - smoothstep( 0.035, 0.08, mx ) ) * ( 1.0 - smoothstep( 0.2, 0.35, sat ) );
  float wPlate = smoothstep( 0.3, 0.5, mn ) * ( 1.0 - smoothstep( 0.08, 0.18, sat ) );
  c = mix( c, uTrim * clamp( mx * 1.5 + 0.3, 0.35, 1.25 ), wTrim * uTrimK );
  c = mix( c, uJoint * clamp( mx * 6.0 + 0.45, 0.45, 1.0 ), wJoint * uJointK );
  c = mix( c, uPlate * clamp( mx * 0.9 + 0.35, 0.5, 1.2 ), wPlate * uPlateK );
  diffuseColor.rgb *= c * uBoost;
  diffuseColor.a *= texel.a;
#endif`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 2.5 );\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'gearhavenAccent';
  mat.userData.accents = A;
  return mat;
}

/**
 * A glowing eye on `head` (a bone): a core sphere and an additive halo, at the front of the
 * head-skinned vertices (the face), `size` × `height` big. Returns the group (on the bone; its
 * children: the core, then the halo).
 */
export function addGlowEye(root, head, height, eye, E = RB.eye) {
  root.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  const v = new THREE.Vector3();
  const pts = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const hi = o.skeleton.bones.indexOf(head);
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      let best = 0;
      let bi = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) (best = sw.getComponent(i, k)), (bi = si.getComponent(i, k));
      if (bi === hi) pts.push(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).clone());
    }
  });
  const size = eye.size * height;
  const at = hp.clone();
  if (pts.length) {
    // (the face: the front-most of the head's vertices; the eye at their middle)
    const zmax = Math.max(...pts.map((p) => p.z));
    const front = pts.filter((p) => p.z > zmax - size);
    at.set(front.reduce((a, p) => a + p.x, 0) / front.length, front.reduce((a, p) => a + p.y, 0) / front.length, zmax + size * E.out);
  }
  const k = head.getWorldScale(new THREE.Vector3()).x;
  const group = new THREE.Group();
  group.name = 'glowEye';
  const core = new THREE.Mesh(new THREE.SphereGeometry(size / k, 10, 8), new THREE.MeshBasicMaterial({ color: eye.color, transparent: true, opacity: E.coreOpacity, depthWrite: false, fog: false }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry((size * (eye.haloSize ?? E.halo)) / k, 10, 8), new THREE.MeshBasicMaterial({ color: eye.halo, transparent: true, opacity: eye.haloOpacity ?? E.haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  core.renderOrder = 10;
  halo.renderOrder = 9;
  group.add(core, halo);
  group.position.copy(head.worldToLocal(at));
  head.add(group); // (its children: the core, then the halo)
  return group;
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
        if (!tinted.has(src)) tinted.set(src, accentMaterial(src, K.accents));
        o.material = tinted.get(src);
      });
      const scene = fitModel(gltf.scene, K.height);
      let head = null;
      scene.traverse((o) => {
        if (!head && o.isBone && o.name === 'Head') head = o;
      });
      if (K.eye && head) addGlowEye(scene, head, K.height, K.eye);
      return { scene, clips: gltf.animations };
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
 * clipNames, roles, eye (its glowing eye, if any), placeholder }. The animator starts on its idle.
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
  let eye = null;
  body.traverse((o) => {
    if (o.name === 'glowEye') eye = o;
  });
  root.userData = { kind, name: K.name, role: K.role, height: K.height, animator, clipNames: t.clips.map((c) => c.name), roles, eye, placeholder: false };
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
  const visor = new THREE.Mesh(new THREE.BoxGeometry(h * 0.16, h * 0.04, 0.02), new THREE.MeshBasicMaterial({ color: K.eye?.color ?? P.eye }));
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
