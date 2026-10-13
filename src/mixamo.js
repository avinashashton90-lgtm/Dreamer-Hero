import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Loading Mixamo FBX files: the skinned character plus animation-only files, retargeted onto
// the character's skeleton by bone name. Works in the browser (fetch with progress) and in
// Node tests (pass `readFile(url) → ArrayBuffer`).

/** Fetches `urls` as ArrayBuffers; onProgress(0..1) over all of them. */
export async function fetchBuffers(urls, { readFile = null, onProgress = null, weights = null } = {}) {
  const got = urls.map(() => 0);
  const w = weights ?? urls.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const report = () => onProgress?.(got.reduce((a, g, i) => a + g * w[i], 0) / total);
  return Promise.all(
    urls.map(async (url, i) => {
      let buf;
      if (readFile) buf = await readFile(url);
      else {
        const loader = new THREE.FileLoader().setResponseType('arraybuffer');
        buf = await loader.loadAsync(url, (e) => {
          if (e.total > 0) {
            got[i] = Math.min(0.99, e.loaded / e.total);
            report();
          }
        });
      }
      got[i] = 1;
      report();
      return buf;
    }),
  );
}

/**
 * Parses an FBX buffer and waits for its embedded textures to decode (browser). Textures
 * larger than `textureMax` are downsized on a canvas (phones).
 */
export async function parseFBX(buffer, { textureMax = 1024, timeoutMs = 15000 } = {}) {
  const manager = new THREE.LoadingManager();
  let pending = 0;
  let resolveAll;
  const allDone = new Promise((r) => (resolveAll = r));
  const start = manager.itemStart.bind(manager);
  const end = manager.itemEnd.bind(manager);
  const fail = manager.itemError.bind(manager);
  manager.itemStart = (url) => {
    pending++;
    start(url);
  };
  const finish = () => {
    if (--pending <= 0) resolveAll();
  };
  manager.itemEnd = (url) => {
    end(url);
    finish();
  };
  manager.itemError = (url) => {
    fail(url);
    finish();
  };
  const object = new FBXLoader(manager).parse(buffer, '');
  if (pending > 0) await Promise.race([allDone, new Promise((r) => setTimeout(r, timeoutMs))]);
  downsizeTextures(object, textureMax);
  return object;
}

/** Redraws any texture image larger than `max` px onto a smaller canvas (browser only). */
export function downsizeTextures(object, max) {
  if (typeof document === 'undefined') return;
  const seen = new Set();
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const key of ['map', 'normalMap', 'specularMap', 'emissiveMap', 'alphaMap']) {
        const tex = m[key];
        const img = tex?.image;
        if (!img || seen.has(tex) || !(img.width > max || img.height > max)) continue;
        seen.add(tex);
        const k = max / Math.max(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * k));
        canvas.height = Math.max(1, Math.round(img.height * k));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        tex.image = canvas;
        tex.needsUpdate = true;
      }
    }
  });
}

/** 'mixamorig:Hips' / 'mixamorig1Hips' / 'Armature|mixamorigHips' → 'Hips'. */
export const boneKey = (name) => name.replace(/^.*mixamorig\d*:?/, '');

/**
 * Retargets a Mixamo clip onto `skeletonRoot` by bone name: keeps only tracks whose bone
 * exists there (renamed to the character's bone names), and handles root motion on the hips:
 *  root 'xz'  → horizontal travel removed (the game moves the hero), height kept;
 *  root 'xyz' → hips held at `restHipsY` too (jumps: the game does the height);
 *  faceAt     → the hips' yaw at that time is undone (clips that turn the body).
 *  bones      → keep only bones whose key matches (e.g. an arm-only layer).
 */
export function retargetClip(clip, skeletonRoot, { root = 'xz', restHipsY = null, faceAt = null, bones = null, name = clip.name } = {}) {
  const byKey = new Map();
  skeletonRoot.traverse((o) => {
    if (o.isBone && !byKey.has(boneKey(o.name))) byKey.set(boneKey(o.name), o.name);
  });
  const tracks = [];
  let yawFix = null;
  if (faceAt !== null) {
    const qt = clip.tracks.find((t) => boneKey(t.name.split('.')[0]) === 'Hips' && t.name.endsWith('.quaternion'));
    if (qt) {
      // Turn of the hips at `faceAt` relative to the character's rest pose (call before playing).
      const rest = skeletonRoot.getObjectByName(byKey.get('Hips'))?.quaternion.clone() ?? new THREE.Quaternion();
      const q = sampleQuaternion(qt, faceAt).multiply(rest.invert());
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      yawFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(f.x, f.z));
    }
  }
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const key = boneKey(t.name.slice(0, dot));
    const prop = t.name.slice(dot + 1);
    const target = byKey.get(key);
    if (!target || prop === 'scale') continue;
    if (bones && !bones.some((b) => key.includes(b))) continue;
    if (key !== 'Hips' && prop === 'position') continue; // bone lengths come from the character
    const track = t.clone();
    track.name = `${target}.${prop}`;
    if (key === 'Hips' && prop === 'position') {
      const v = track.values;
      const y0 = restHipsY ?? v[1];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = 0;
        v[i + 2] = 0;
        if (root === 'xyz') v[i + 1] = y0;
      }
    }
    if (key === 'Hips' && prop === 'quaternion' && yawFix) {
      const q = new THREE.Quaternion();
      const v = track.values;
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i).premultiply(yawFix).toArray(v, i);
      }
    }
    tracks.push(track);
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

function sampleQuaternion(track, t) {
  const interp = track.createInterpolant();
  const v = interp.evaluate(t);
  return new THREE.Quaternion(v[0], v[1], v[2], v[3]).normalize();
}

/** Average horizontal speed of the hips in a clip (source units per second). */
export function rootSpeed(clip) {
  const t = clip.tracks.find((x) => boneKey(x.name.split('.')[0]) === 'Hips' && x.name.endsWith('.position'));
  if (!t || t.times.length < 2) return 0;
  const v = t.values;
  const n = v.length - 3;
  const dist = Math.hypot(v[n] - v[0], v[n + 2] - v[2]);
  return dist / (t.times[t.times.length - 1] - t.times[0]);
}

/**
 * Piecewise-linear map from game progress to clip time: `x` in [xs[0], xs.at(-1)] →
 * [ts[0], ts.at(-1)], with xs[i] ↦ ts[i] (e.g. the hit moment onto the clip's strike frame).
 */
export function mapTime(x, xs, ts) {
  if (x <= xs[0]) return ts[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ts[i - 1] + ((x - xs[i - 1]) / Math.max(1e-6, xs[i] - xs[i - 1])) * (ts[i] - ts[i - 1]);
  }
  return ts[ts.length - 1];
}
