import * as THREE from 'three';
import { CONFIG } from './config.js';

const ST = CONFIG.desert.storm;
const { clamp, smoothstep, lerp } = THREE.MathUtils;

/** MeshBasicMaterial with a per-instance opacity (`instanceFade`), for the sand particles. */
export function particleMaterial(params) {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = instanceFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  return mat;
}

/** A soft round alpha texture (built in code: no canvas needed, so it works headless too). */
export function softDot(size = 32) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - d) ** 1.6;
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Placeholder sandstorm: instanced wind streaks and soft dust clouds (per-instance fade), a sky
 * veil (drawn first, like a sky), a warm screen tint (in 3D in front of the camera — the HUD is
 * DOM above it and stays clean) and a warm castle glow. `userData` = { streaks, clouds, veil, tint, glow }.
 */
export async function loadSandstormModel() {
  const group = new THREE.Group();
  const streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), particleMaterial({ color: ST.streaks.color, opacity: ST.streaks.opacity }), ST.streaks.count);
  const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), particleMaterial({ color: ST.clouds.color, opacity: ST.clouds.opacity, map: softDot() }), ST.clouds.count);
  for (const m of [streaks, clouds]) {
    m.geometry.setAttribute('instanceFade', new THREE.InstancedBufferAttribute(new Float32Array(m.count).fill(0), 1).setUsage(THREE.DynamicDrawUsage));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = 5;
  }
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(ST.sky.radius, 16, 10),
    new THREE.MeshBasicMaterial({ color: ST.sky.color, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  veil.renderOrder = -1; // (first of the see-through things; anything nearer than its radius is drawn over it)
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ST.tint.color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  tint.renderOrder = 998;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ST.castleGlow.color, map: softDot(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.renderOrder = 6;
  group.add(veil, streaks, clouds, glow, tint);
  group.userData = { streaks, clouds, veil, tint, glow };
  group.visible = false;
  return group;
}

/**
 * The sandstorm (after the Lazarus Pit): `update(dt, target)` eases its strength toward
 * `target` (0..1, set by the story). Sand stays out of a clear corridor along the trail
 * (`clear`: ±halfWidth, `ahead` units ahead), so the path, its edges, the skeletons and the
 * castle glow always read; gusts thicken only the sides. The fog keeps at least `clear.ahead`
 * of visibility, the sky veils over, a light warm tint and a gentle camera shake grow with it.
 */
export class Sandstorm {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.strength = 0;
    this.time = 0;
    this.gust = 0;
    this.gustT = 0;
    this.nextGust = ST.gust.every[0];
    this.rand = mulberry(ST.seed);
  }

  async init() {
    this.model = await loadSandstormModel();
    this.scene.add(this.model);
    const r = this.rand;
    this.streaks = Array.from({ length: ST.streaks.count }, () => ({ p: new THREE.Vector3(), len: lerp(...ST.streaks.length, r()), w: lerp(...ST.streaks.width, r()), sp: lerp(0.7, 1.3, r()), seeded: false }));
    this.clouds = Array.from({ length: ST.clouds.count }, () => ({ p: new THREE.Vector3(), size: lerp(...ST.clouds.size, r()), sp: lerp(0.5, 1, r()), seeded: false, side: r() < 0.5 ? -1 : 1 }));
  }

  reset() {
    this.strength = 0;
    this.gust = 0;
    this.gustT = 0;
    for (const s of [...(this.streaks ?? []), ...(this.clouds ?? [])]) s.seeded = false;
    if (this.model) this.model.visible = false;
    this.#fog(0);
  }

  /**
   * @param {number} target  0..1
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./camera.js').FollowCamera} [cam]  (for the wind shake)
   */
  update(dt, target, camera, cam = null) {
    this.time += dt;
    this.strength += (target - this.strength) * (dt > 0 ? 1 - Math.exp(-ST.ease * dt) : 1);
    if (Math.abs(target - this.strength) < 1e-3) this.strength = target;
    const s = this.strength;
    if (cam) cam.wind = ST.shake * s * (1 + this.gust * 0.5);
    this.#fog(s);
    const m = this.model;
    if (!m) return;
    m.visible = s > 0.002;
    if (!m.visible) return;
    this.#gusts(dt);
    const frame = this.#trailFrame(camera.position);
    this.frame = frame;
    const wind = frame.normal.clone().multiplyScalar(ST.wind.across).addScaledVector(frame.tangent, ST.wind.along).normalize();
    this.wind = wind;
    this.#updateStreaks(dt, s, camera, wind, frame);
    this.#updateClouds(dt, s, camera, wind, frame);
    const u = m.userData;
    u.veil.position.copy(camera.position);
    u.veil.material.opacity = ST.sky.opacity * s;
    // Warm screen tint: a quad filling the view just in front of the camera.
    const d = camera.near * 2;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    u.tint.position.copy(camera.position).add(new THREE.Vector3(0, 0, -d).applyQuaternion(camera.quaternion));
    u.tint.quaternion.copy(camera.quaternion);
    u.tint.scale.set(h * camera.aspect * 1.05, h * 1.05, 1);
    u.tint.material.opacity = ST.tint.opacity * s;
    // The castle's warm glow reads through the storm.
    const c = this.world.castlePosition;
    if (c) {
      u.glow.position.set(c.x, c.y + ST.castleGlow.up, c.z);
      u.glow.quaternion.copy(camera.quaternion);
      u.glow.scale.setScalar(ST.castleGlow.size);
      u.glow.material.opacity = ST.castleGlow.opacity * s;
    }
  }

  /** Gusts: every few seconds the sides thicken for 1–2 s (never the trail ahead). */
  #gusts(dt) {
    const G = ST.gust;
    this.gustT -= dt;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.gustT = lerp(...G.time, this.rand());
      this.gustLen = this.gustT;
      this.nextGust = lerp(...G.every, this.rand()) + this.gustT;
    }
    const target = this.gustT > 0 ? Math.sin(Math.PI * clamp(1 - this.gustT / this.gustLen, 0, 1)) : 0;
    this.gust += (target - this.gust) * (1 - Math.exp(-6 * dt));
  }

  /** The trail near the camera as a short polyline (the clear corridor follows it). */
  #trailFrame(at) {
    const t = this.world.activeTrack ?? this.world.desertTrack;
    const n = t.nearest(at.x, at.z, ST.clear.ahead) ?? t.nearestGlobal(at.x, at.z);
    const pts = [];
    for (let ds = -ST.clear.behind; ds <= ST.clear.ahead + ST.clear.step; ds += ST.clear.step) {
      const p = t.at(clamp(n.s + ds, 0, t.length));
      pts.push(new THREE.Vector2(p.x, p.z));
    }
    const p0 = t.at(n.s);
    return { pts, tangent: new THREE.Vector3(p0.tx, 0, p0.tz), normal: new THREE.Vector3(-p0.tz, 0, p0.tx), s: n.s };
  }

  /** 0 inside the clear corridor over the trail, rising to 1 a little way outside it. */
  corridorFade(x, z, frame = this.frame) {
    if (!frame) return 1;
    const C = ST.clear;
    let best = Infinity;
    const p = new THREE.Vector2(x, z);
    for (let i = 0; i < frame.pts.length - 1; i++) {
      const a = frame.pts[i];
      const b = frame.pts[i + 1];
      const ab = b.clone().sub(a);
      const k = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      best = Math.min(best, p.distanceTo(a.clone().addScaledVector(ab, k)));
    }
    return smoothstep(best, C.halfWidth, C.halfWidth + C.soft);
  }

  /** Particles drift with the wind and wrap round the camera (no allocation, no respawn). */
  #wrap(p, cam, half) {
    for (const k of ['x', 'z']) {
      const d = p[k] - cam[k];
      if (d > half) p[k] -= half * 2;
      else if (d < -half) p[k] += half * 2;
    }
  }

  #updateStreaks(dt, s, camera, wind, frame) {
    const S = ST.streaks;
    const mesh = this.model.userData.streaks;
    const fade = mesh.geometry.attributes.instanceFade.array;
    const cp = camera.position;
    const m = new THREE.Matrix4();
    const x = wind.clone();
    const ground = (q) => this.world.heightAt(q.x, q.z);
    this.streaks.forEach((it, i) => {
      if (!it.seeded) {
        it.p.set(cp.x + (this.rand() * 2 - 1) * S.area, 0, cp.z + (this.rand() * 2 - 1) * S.area);
        it.p.y = ground(it.p) + lerp(...S.height, this.rand());
        it.seeded = true;
      }
      it.p.addScaledVector(wind, ST.wind.speed * it.sp * dt * (1 + this.gust * ST.gust.gain));
      this.#wrap(it.p, cp, S.area);
      // Facing the camera, long along the wind.
      const toCam = cp.clone().sub(it.p);
      const z = toCam.addScaledVector(x, -toCam.dot(x)).normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      m.makeBasis(x, y, z).scale(new THREE.Vector3(it.len, it.w, 1)).setPosition(it.p);
      mesh.setMatrixAt(i, m);
      fade[i] = s * this.corridorFade(it.p.x, it.p.z, frame) * Math.min(1, 0.8 + 0.4 * this.gust);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.instanceFade.needsUpdate = true;
  }

  #updateClouds(dt, s, camera, wind, frame) {
    const C = ST.clouds;
    const mesh = this.model.userData.clouds;
    const fade = mesh.geometry.attributes.instanceFade.array;
    const cp = camera.position;
    const m = new THREE.Matrix4();
    const q = camera.quaternion;
    this.clouds.forEach((it, i) => {
      if (!it.seeded) {
        // Rolling dust at the edges: either side of the trail, beyond the clear corridor.
        const along = (this.rand() * 2 - 1) * C.area;
        const lat = it.side * (ST.clear.halfWidth + ST.clear.soft + this.rand() * C.band);
        it.p.copy(cp).addScaledVector(frame.tangent, along).addScaledVector(frame.normal, lat);
        it.p.y = this.world.heightAt(it.p.x, it.p.z) + lerp(...C.height, this.rand());
        it.seeded = true;
      }
      it.p.addScaledVector(wind, C.drift * it.sp * dt * (1 + this.gust * ST.gust.gain));
      this.#wrap(it.p, cp, C.area);
      const roll = this.time * C.roll * it.sp + i;
      m.compose(it.p, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll)), new THREE.Vector3(it.size, it.size * 0.7, 1));
      mesh.setMatrixAt(i, m);
      fade[i] = s * this.corridorFade(it.p.x, it.p.z, frame) * Math.min(1, 0.7 + 0.6 * this.gust);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.instanceFade.needsUpdate = true;
  }

  /** Fog: from the world's own (sunset) fog toward the storm's, never closer than the clear view. */
  #fog(s) {
    const fog = this.scene.fog;
    if (!fog) return;
    const base = this.world.fogBase ?? fog.color;
    fog.color.copy(base).lerp(new THREE.Color(ST.fog.color), s);
    fog.near = lerp(CONFIG.world.fogNear, ST.fog.near, s);
    fog.far = lerp(CONFIG.world.fogFar, ST.fog.far, s);
    this.scene.background?.copy?.(fog.color);
  }

  /** (tests) Visible sand particles inside the clear corridor over the trail ahead. */
  particlesInCorridor() {
    if (!this.model?.visible || !this.frame) return 0;
    let n = 0;
    for (const [list, mesh] of [[this.streaks, this.model.userData.streaks], [this.clouds, this.model.userData.clouds]]) {
      const fade = mesh.geometry.attributes.instanceFade.array;
      list.forEach((it, i) => {
        if (fade[i] > 0.02 && this.corridorFade(it.p.x, it.p.z) === 0) n++;
      });
    }
    return n;
  }
}

/** Small seeded random (the storm looks the same every run). */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
