import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CONFIG } from './config.js';
import { fetchBuffers, parseFBX } from './mixamo.js';

const MN = CONFIG.minions;
const { clamp } = THREE.MathUtils;
const ROLES = ['idle', 'move', 'attack', 'hit', 'death', 'spawn'];

/**
 * Minion models: Quaternius Animated Monster Pack FBX files (public/models/monsters/), one
 * template per type, loaded lazily on the first spawn of that type and cached. Each spawn gets
 * its own clone (skeleton, materials and mixer). If a file fails to load, a code-built
 * placeholder is used for that type.
 */
const templates = new Map(); // type → Promise<template>
const loaded = new Map(); // type → template, once loaded (spawns are immediate from then on)

/**
 * @param {'bat' | 'skeleton' | 'slime'} type
 * @param {{ readFile?: Function, placeholder?: boolean, base?: string }} [opts]
 */
export function loadMinionTemplate(type, opts = {}) {
  if (!templates.has(type)) {
    templates.set(
      type,
      (async () => {
        if (!opts.placeholder) {
          try {
            return await loadFbxTemplate(type, opts);
          } catch (e) {
            console.warn(`Minion model "${type}" failed to load; using the placeholder.`, e);
          }
        }
        return { type, kind: 'placeholder', clipNames: [], mapping: {} };
      })().then((t) => {
        loaded.set(type, t);
        return t;
      }),
    );
  }
  return templates.get(type);
}

/** The type's template if it has finished loading, else null. */
export function minionTemplateNow(type) {
  return loaded.get(type) ?? null;
}

/** Which types have started loading (tests: lazy loading). */
export function loadedMinionTypes() {
  return [...templates.keys()];
}

/** Forget the cached templates (tests). */
export function resetMinionTemplates() {
  templates.clear();
  loaded.clear();
}

async function loadFbxTemplate(type, opts) {
  const T = MN.types[type];
  const [buf] = await fetchBuffers([(opts.base ?? MN.path) + T.file], { readFile: opts.readFile });
  const fbx = await parseFBX(buf, { textureMax: MN.textureMax });
  const clipNames = fbx.animations.map((a) => a.name);
  console.info(`Minion ${type} clips: ${clipNames.join(', ')}`);
  // Fit to the configured size along one axis, feet at the origin, facing +Z.
  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx, true);
  const size = box.getSize(new THREE.Vector3());
  const [axis, value] = T.fit;
  const scale = value / size[axis];
  const fit = new THREE.Group();
  fbx.scale.multiplyScalar(scale);
  fbx.position.y -= box.min.y * scale;
  fit.add(fbx);
  fbx.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // (skinned bounds don't follow the animation)
  });
  // Clips by role (by the part after "Armature|"); missing roles fall back (T.fallback).
  const byShort = new Map(fbx.animations.map((a) => [a.name.split('|').pop(), a]));
  const rootBone = (() => {
    let r = null;
    fbx.traverse((o) => {
      if (!r && o.isBone) r = o;
    });
    return r;
  })();
  const clips = {};
  const mapping = {};
  for (const role of ROLES) {
    const name = (T.roles[role] ?? []).find((n) => byShort.has(n));
    if (name) {
      clips[role] = holdRootXZ(byShort.get(name), rootBone?.name);
      mapping[role] = name;
    }
  }
  for (const role of ROLES) {
    let r = role;
    for (let k = 0; k < 3 && !clips[r]; k++) r = T.fallback[r] ?? 'idle';
    if (!clips[role] && clips[r]) {
      clips[role] = clips[r];
      mapping[role] = `${mapping[r]} (fallback)`;
    }
  }
  if (!clips.death || !clips.move) throw new Error(`${type}: no ${!clips.death ? 'death' : 'move'} clip`);
  return { type, kind: 'fbx', object: fit, clips, clipNames, mapping };
}

/** The clip with its root bone's sideways travel held at the first frame (the game moves it). */
function holdRootXZ(clip, rootName) {
  const c = clip.clone();
  for (const t of c.tracks) {
    if (!rootName || t.name !== `${rootName}.position`) continue;
    const x0 = t.values[0];
    const z0 = t.values[2];
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] = x0;
      t.values[i + 2] = z0;
    }
  }
  return c;
}

/**
 * A new model for one minion of the template's type: { root (placed by the Minion), body (sways,
 * coughs, flinches), mats, animator }.
 */
export function makeMinionModel(template) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // (procedural sway / cough / squash on top of the clips)
  root.add(body);
  const mats = [];
  let animator;
  if (template.kind === 'fbx') {
    const obj = cloneSkinned(template.object);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map((m) => {
        const c = m.clone();
        mats.push(c);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    body.add(obj);
    animator = new ClipAnimator(obj, template.clips);
  } else {
    const ph = buildPlaceholder(template.type, mats);
    body.add(ph.group);
    animator = new PlaceholderAnimator(template.type, ph);
  }
  root.userData = { kind: template.kind, type: template.type, body, mats, animator };
  return root;
}

/**
 * Clips by role, crossfaded over MN.crossfade. `set(role, { once, timeScale })` switches the
 * primary clip; `scrub(role, t)` holds a timed clip at t (spawn rising, death fall).
 */
class ClipAnimator {
  constructor(obj, clips) {
    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = {};
    this.clips = clips;
    const seen = new Map();
    for (const [role, clip] of Object.entries(clips)) {
      const a = seen.get(clip) ?? this.mixer.clipAction(clip);
      seen.set(clip, a);
      this.actions[role] = a;
    }
    this.weights = new Map([...new Set(Object.values(this.actions))].map((a) => [a, 0]));
    for (const a of this.weights.keys()) {
      a.play();
      a.setEffectiveWeight(0);
    }
    this.role = null;
    this.set('idle');
    this.weights.set(this.actions.idle, 1);
  }

  /** Switch to a role's clip (from the start if it changed). */
  set(role, { once = false, timeScale = 1 } = {}) {
    const a = this.actions[role] ?? this.actions.idle;
    if (this.role !== role) {
      a.reset();
      a.play();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      this.role = role;
    }
    a.paused = false;
    a.timeScale = timeScale;
    this.primary = a;
  }

  /** Hold a role's clip at a fraction 0..1 of its length. */
  scrub(role, f) {
    this.set(role);
    const a = this.primary;
    a.paused = true;
    a.time = clamp(f, 0, 1) * a.getClip().duration * 0.999;
  }

  duration(role) {
    return (this.actions[role] ?? this.actions.idle).getClip().duration;
  }

  update(dt) {
    const step = dt / MN.crossfade;
    for (const [a, w] of this.weights) {
      const target = a === this.primary ? 1 : 0;
      const nw = dt > 0 ? w + clamp(target - w, -step, step) : target;
      this.weights.set(a, nw);
      a.setEffectiveWeight(nw);
    }
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Placeholders (only if a file fails to load)
// ---------------------------------------------------------------------------

function buildPlaceholder(type, mats) {
  const T = MN.types[type];
  const mat = (color) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    mats.push(m);
    return m;
  };
  const group = new THREE.Group();
  const parts = {};
  if (type === 'bat') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(T.color));
    body.position.y = T.height * 0.5;
    group.add(body);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, T.height * 0.5, 0);
      const wing = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(side * 0.6, 0.05, -0.05), new THREE.Vector3(0, 0, -0.25)]), mat(T.color));
      wing.material.side = THREE.DoubleSide;
      pivot.add(wing);
      group.add(pivot);
      parts[side < 0 ? 'wingL' : 'wingR'] = pivot;
    }
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    eyes.position.set(0, T.height * 0.58, 0.2);
    group.add(eyes);
  } else if (type === 'skeleton') {
    const bone = mat(T.color);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 3, 6), bone);
    torso.position.y = T.height * 0.62;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), bone);
    skull.position.y = T.height * 0.9;
    group.add(torso, skull);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, T.height * 0.45, 0);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, T.height * 0.38, 2, 5), bone);
      shin.position.y = -T.height * 0.22;
      leg.add(shin);
      group.add(leg);
      parts[side < 0 ? 'legL' : 'legR'] = leg;
      const arm = new THREE.Group();
      arm.position.set(side * 0.28, T.height * 0.78, 0);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, T.height * 0.3, 2, 5), bone);
      fore.position.y = -T.height * 0.18;
      arm.add(fore);
      group.add(arm);
      parts[side < 0 ? 'armL' : 'armR'] = arm;
    }
  } else {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8).scale(1, 0.8, 1).translate(0, 0.44, 0), mat(T.color));
    blob.material.transparent = true;
    blob.material.opacity = 0.9;
    group.add(blob);
    parts.blob = blob;
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(side * 0.18, 0.6, 0.45);
      group.add(eye);
    }
  }
  return { group, parts };
}

/** The placeholder's procedural pose by role (same interface as ClipAnimator). */
class PlaceholderAnimator {
  constructor(type, ph) {
    this.type = type;
    this.p = ph.parts;
    this.group = ph.group;
    this.role = 'idle';
    this.t = 0;
    this.f = null;
  }

  set(role) {
    if (role !== this.role) this.t = 0;
    this.role = role;
    this.f = null;
  }

  scrub(role, f) {
    this.role = role;
    this.f = clamp(f, 0, 1);
  }

  duration(role) {
    return role === 'death' ? 0.8 : role === 'spawn' ? 1.2 : role === 'attack' ? 0.6 : 1;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const p = this.p;
    const dead = this.role === 'death' ? (this.f ?? Math.min(1, t / 0.8)) : 0;
    this.group.rotation.z = dead * 1.4;
    if (this.type === 'bat') {
      const flap = Math.sin(t * (this.role === 'attack' ? 26 : 16)) * 0.8 * (1 - dead);
      p.wingL.rotation.z = flap;
      p.wingR.rotation.z = -flap;
    } else if (this.type === 'skeleton') {
      const run = this.role === 'move' ? Math.sin(t * 11) * 0.7 : 0;
      p.legL.rotation.x = run;
      p.legR.rotation.x = -run;
      p.armL.rotation.x = -run + (this.role === 'attack' ? -1.6 : 0);
      p.armR.rotation.x = run + (this.role === 'attack' ? -1.6 : 0);
    } else {
      const sq = 1 + Math.sin(t * (this.role === 'move' ? 9 : 3)) * 0.12;
      p.blob.scale.set(1 / Math.sqrt(sq), sq * (1 - dead * 0.7), 1 / Math.sqrt(sq));
    }
  }
}
