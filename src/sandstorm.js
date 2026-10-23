import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

const ST = CONFIG.desert.storm;
const WW = ST.whirlwinds;
const DB = ST.debris;
const TAU = Math.PI * 2;
const { clamp, smoothstep, lerp } = THREE.MathUtils;
const DEBRIS_KINDS = ['rocks', 'pebbles', 'tufts'];

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

/** Debris pieces (placeholders): a small rock, a pebble, a dry grass tuft (a few crossed straws). */
function debrisGeometry(kind) {
  if (kind === 'rocks') return new THREE.DodecahedronGeometry(1, 0).scale(1, 0.75, 0.9);
  if (kind === 'pebbles') return new THREE.IcosahedronGeometry(1, 0).scale(1, 0.7, 0.85);
  const straws = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(0.07, 1, 0.07).translate(0, 0.35, 0);
    g.rotateZ(0.5 + (i % 2) * 0.25).rotateY((i / 5) * TAU);
    straws.push(g);
  }
  return mergeGeometries(straws);
}

/**
 * Placeholder sandstorm: instanced wind streaks and soft dust clouds (per-instance fade), a sky
 * veil (drawn first, like a sky), a warm screen tint (in 3D in front of the camera — the HUD is
 * DOM above it and stays clean), a warm castle glow, the whirlwinds' sand spirals (one instanced
 * soft-dot mesh) and the flying debris (one small InstancedMesh per kind).
 * `userData` = { streaks, clouds, veil, tint, glow, whirl, debris: { rocks, pebbles, tufts } }.
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
  const whirl = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), particleMaterial({ color: WW.color, opacity: WW.opacity, map: softDot() }), (WW.count[1] + 1) * WW.particles);
  whirl.geometry.setAttribute('instanceFade', new THREE.InstancedBufferAttribute(new Float32Array(whirl.count).fill(0), 1).setUsage(THREE.DynamicDrawUsage));
  whirl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  whirl.frustumCulled = false;
  whirl.renderOrder = 5;
  const debris = {};
  const inWhirls = (WW.count[1] + 1) * WW.debris; // (pebbles and tufts circling in the whirlwinds)
  for (const kind of DEBRIS_KINDS) {
    const n = DB[kind] + (kind === 'rocks' ? 0 : Math.ceil(inWhirls / 2));
    const color = DB[`${kind.slice(0, -1)}Color`];
    const mesh = new THREE.InstancedMesh(debrisGeometry(kind), new THREE.MeshLambertMaterial({ color, flatShading: true }), n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    debris[kind] = mesh;
  }
  group.add(veil, streaks, clouds, whirl, ...Object.values(debris), glow, tint);
  group.userData = { streaks, clouds, veil, tint, glow, whirl, debris };
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
    // Whirlwinds: slots of spiral particles (+ a couple of pieces of debris each).
    this.whirls = Array.from({ length: WW.count[1] + 1 }, (_, i) => ({ // (+1: a new one starts while an old one fades out)
      active: false, wait: lerp(...WW.gap, r()) * i, c: new THREE.Vector3(), age: 0, life: 0, h: 0, alpha: 0,
      parts: Array.from({ length: WW.particles }, (__, k) => ({ u: (k + r()) / WW.particles, a: r() * TAU, size: lerp(...WW.size, r()) })),
      debris: Array.from({ length: WW.debris }, (__, k) => ({ kind: k % 2 ? 'tufts' : 'pebbles', u: lerp(0.25, 0.6, r()), a: r() * TAU, size: lerp(...DB[k % 2 ? 'tuftSize' : 'pebbleSize'], r()), rot: new THREE.Euler(), spin: new THREE.Vector3(r(), r(), r()).multiplyScalar(DB.spin) })),
    }));
    this.whirlCount = this.#pickWhirlCount();
    // Free debris tumbling with the wind.
    this.debris = DEBRIS_KINDS.flatMap((kind) => Array.from({ length: DB[kind] }, () => ({
      kind, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(r() * 3, r() * 3, r() * 3),
      spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(2 * DB.spin), size: lerp(...DB[`${kind.slice(0, -1)}Size`], r()),
      sp: lerp(...DB.speed, r()), seeded: false, scale: 0,
    })));
  }

  #pickWhirlCount() {
    return Math.round(lerp(WW.count[0], WW.count[1], this.rand()));
  }

  reset() {
    this.strength = 0;
    this.gust = 0;
    this.gustT = 0;
    for (const s of [...(this.streaks ?? []), ...(this.clouds ?? []), ...(this.debris ?? [])]) s.seeded = false;
    for (const w of this.whirls ?? []) {
      w.active = false;
      w.alpha = 0;
    }
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
    this.#updateWhirls(dt, s, camera, wind, frame);
    this.#updateDebris(dt, s, camera, wind, frame);
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
    return { pts, tangent: new THREE.Vector3(p0.tx, 0, p0.tz), normal: new THREE.Vector3(-p0.tz, 0, p0.tx), s: n.s, track: t };
  }

  /** 0 inside the clear corridor over the trail, rising to 1 a little way outside it. */
  corridorFade(x, z, frame = this.frame) {
    if (!frame) return 1;
    const C = ST.clear;
    return smoothstep(this.#trailDistance(x, z, frame), C.halfWidth, C.halfWidth + C.soft);
  }

  /** Distance from the trail's centre line near the camera (the corridor's polyline). */
  #trailDistance(x, z, frame) {
    let best = Infinity;
    const p = new THREE.Vector2(x, z);
    for (let i = 0; i < frame.pts.length - 1; i++) {
      const a = frame.pts[i];
      const b = frame.pts[i + 1];
      const ab = b.clone().sub(a);
      const k = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      best = Math.min(best, p.distanceTo(a.clone().addScaledVector(ab, k)));
    }
    return best;
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

  /**
   * Whirlwinds: `whirlCount` (2–4) at a time beside the path ahead, each a tight spiral of sand
   * circling up a cone, drifting with the wind and fading in / out; one that drifts toward the
   * clear corridor or the camera fades out early. A gap, then the slot starts a new one.
   */
  #updateWhirls(dt, s, camera, wind, frame) {
    const mesh = this.model.userData.whirl;
    const fade = mesh.geometry.attributes.instanceFade.array;
    const cp = camera.position;
    const q = camera.quaternion;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const C = ST.clear;
    let active = this.whirls.filter((w) => w.active && w.life - w.age > WW.fade * 0.3).length; // (not counting ones nearly faded out)
    this.whirlDebris = [];
    this.whirls.forEach((w, i) => {
      if (!w.active && active < this.whirlCount && (w.wait -= dt) <= 0) {
        this.#startWhirl(w, frame);
        active++;
      }
      if (w.active) {
        w.age += dt;
        w.c.addScaledVector(wind, WW.drift * dt);
        w.c.y = this.world.heightAt(w.c.x, w.c.z);
        // (off the corridor, away from the camera: else it fades out now)
        const off = this.#trailDistance(w.c.x, w.c.z, frame) - C.halfWidth - C.soft - WW.radius[1];
        const camD = Math.hypot(w.c.x - cp.x, w.c.z - cp.z);
        if ((off < 1 || camD < WW.minCam + 2 || camD > C.ahead + 30) && w.life > w.age + WW.fade) w.life = w.age + WW.fade;
        w.alpha = Math.max(0, Math.min(1, w.age / WW.fade, (w.life - w.age) / WW.fade)) * clamp(off, 0, 1) * clamp((camD - WW.minCam) / 2, 0, 1);
        if (w.age >= w.life) {
          w.active = false;
          w.alpha = 0;
          w.wait = lerp(...WW.gap, this.rand());
          this.whirlCount = this.#pickWhirlCount();
        }
      }
      w.parts.forEach((pt, k) => {
        const n = i * WW.particles + k;
        if (!w.active || w.alpha <= 0) {
          fade[n] = 0;
          mesh.setMatrixAt(n, m.makeScale(0, 0, 0));
          return;
        }
        pt.u = (pt.u + (WW.rise / w.h) * dt) % 1;
        pt.a += WW.spin * (1.5 - pt.u * 0.7) * dt; // (faster near the foot)
        const r = lerp(WW.radius[0], WW.radius[1], pt.u);
        p.set(w.c.x + Math.cos(pt.a) * r, w.c.y + 0.1 + pt.u * w.h, w.c.z + Math.sin(pt.a) * r);
        const sz = pt.size * (0.7 + pt.u * 0.6);
        mesh.setMatrixAt(n, m.compose(p, q, new THREE.Vector3(sz, sz, 1)));
        fade[n] = s * w.alpha * Math.sqrt(Math.sin(Math.PI * pt.u)) * this.corridorFade(p.x, p.z, frame);
      });
      // (a couple of pebbles / tufts circling in it)
      for (const d of w.debris) {
        if (!w.active || w.alpha <= 0) continue;
        d.a += WW.spin * 0.8 * dt;
        d.rot.x += d.spin.x * dt;
        d.rot.y += d.spin.y * dt;
        d.rot.z += d.spin.z * dt;
        const r = lerp(WW.radius[0], WW.radius[1], d.u) * 1.1;
        const at = new THREE.Vector3(w.c.x + Math.cos(d.a) * r, w.c.y + d.u * w.h + Math.sin(this.time * 2 + d.a) * 0.2, w.c.z + Math.sin(d.a) * r);
        this.whirlDebris.push({ kind: d.kind, p: at, rot: d.rot, scale: d.size * w.alpha * s });
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.instanceFade.needsUpdate = true;
  }

  /** A new whirlwind beside the trail ahead — mostly on the downwind side, so it drifts away from the path. */
  #startWhirl(w, frame) {
    const t = frame.track;
    const s = clamp(frame.s + lerp(...WW.ahead, this.rand()), 0, t.length);
    const a = t.at(s);
    const downwind = Math.sign(ST.wind.across) || 1;
    const side = this.rand() < 0.7 ? downwind : -downwind;
    const off = ST.clear.halfWidth + ST.clear.soft + WW.radius[1] + lerp(...WW.offTrail, this.rand()) + (side === downwind ? 0 : WW.drift * WW.life[1]);
    // (the trail's normal at s: (−tz, tx), the same side as the frame's)
    w.c.set(a.x - a.tz * side * off, 0, a.z + a.tx * side * off);
    w.c.y = this.world.heightAt(w.c.x, w.c.z);
    w.h = lerp(...WW.height, this.rand());
    w.age = 0;
    w.life = lerp(...WW.life, this.rand());
    w.alpha = 0;
    w.active = true;
  }

  /**
   * Debris: small rocks, pebbles and dry tufts tumbling sideways with the wind (bouncing along the
   * sand, spinning), wrapped round the camera on the upwind side; each shrinks away inside the clear
   * corridor and near the camera, so nothing hits it or blocks the path.
   */
  #updateDebris(dt, s, camera, wind, frame) {
    const meshes = this.model.userData.debris;
    const cp = camera.position;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const n = { rocks: 0, pebbles: 0, tufts: 0 };
    const put = (kind, p, rot, scale) => {
      if (scale <= 0.002) return;
      meshes[kind].setMatrixAt(n[kind]++, m.compose(p, q.setFromEuler(rot), sc.set(scale, scale, scale)));
    };
    for (const d of this.debris) {
      if (!d.seeded || Math.hypot(d.p.x - cp.x, d.p.z - cp.z) > DB.area) this.#seedDebris(d, cp, wind, frame);
      d.v.x = wind.x * d.sp * (1 + this.gust * 0.5);
      d.v.z = wind.z * d.sp * (1 + this.gust * 0.5);
      d.v.y -= DB.gravity * dt;
      d.p.addScaledVector(d.v, dt);
      const ground = this.world.heightAt(d.p.x, d.p.z) + d.size * 0.5;
      if (d.p.y < ground) {
        d.p.y = ground;
        d.v.y = lerp(...DB.hop, this.rand()) * DB.bounce * 2; // (tumbling: a new little hop)
      }
      d.rot.x += d.spin.x * dt;
      d.rot.y += d.spin.y * dt;
      d.rot.z += d.spin.z * dt;
      const camD = d.p.distanceTo(cp);
      d.scale = d.size * s * this.corridorFade(d.p.x, d.p.z, frame) * clamp((camD - DB.minCam) / 2, 0, 1);
      put(d.kind, d.p, d.rot, d.scale);
    }
    for (const d of this.whirlDebris ?? []) {
      d.scale *= this.corridorFade(d.p.x, d.p.z, frame) * clamp((d.p.distanceTo(cp) - DB.minCam) / 2, 0, 1);
      put(d.kind, d.p, d.rot, d.scale);
    }
    for (const kind of DEBRIS_KINDS) {
      meshes[kind].count = n[kind];
      meshes[kind].instanceMatrix.needsUpdate = true;
    }
  }

  /** A piece of debris starts upwind of the camera, outside the clear corridor. */
  #seedDebris(d, cp, wind, frame) {
    for (let tries = 0; tries < 8; tries++) {
      const along = (this.rand() * 2 - 1) * DB.area * 0.8;
      const lat = (this.rand() * 0.6 + 0.2) * DB.area;
      d.p.copy(cp).addScaledVector(frame.tangent, along).addScaledVector(wind, -lat);
      if (this.corridorFade(d.p.x, d.p.z, frame) >= 1 && Math.hypot(d.p.x - cp.x, d.p.z - cp.z) > DB.minCam * 2) break;
    }
    d.p.y = this.world.heightAt(d.p.x, d.p.z) + lerp(...DB.height, this.rand());
    d.v.set(0, lerp(...DB.hop, this.rand()), 0);
    d.seeded = true;
  }

  /** (tests) Whirlwinds showing now: { count, heights, nearestToCorridor, nearestToCamera }. */
  whirlwindStats(camera) {
    const on = (this.whirls ?? []).filter((w) => w.active && w.alpha > 0.2);
    const C = ST.clear;
    return {
      count: on.length,
      heights: on.map((w) => w.h),
      offCorridor: Math.min(Infinity, ...on.map((w) => this.#trailDistance(w.c.x, w.c.z, this.frame) - C.halfWidth)),
      fromCamera: Math.min(Infinity, ...on.map((w) => Math.hypot(w.c.x - camera.position.x, w.c.z - camera.position.z))),
    };
  }

  /** (tests) Debris pieces shown now and the nearest one's distance from the camera. */
  debrisStats(camera) {
    const shown = [...(this.debris ?? []), ...(this.whirlDebris ?? [])].filter((d) => d.scale > 0.002);
    return { shown: shown.length, nearest: Math.min(Infinity, ...shown.map((d) => d.p.distanceTo(camera.position))), inWhirls: (this.whirlDebris ?? []).filter((d) => d.scale > 0.002).length };
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
    // The whirlwinds' sand and the debris too.
    const wf = this.model.userData.whirl.geometry.attributes.instanceFade.array;
    const wm = this.model.userData.whirl;
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < wm.count; i++) {
      if (wf[i] <= 0.02) continue;
      wm.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      if (this.corridorFade(p.x, p.z) === 0) n++;
    }
    for (const d of [...(this.debris ?? []), ...(this.whirlDebris ?? [])]) if (d.scale > 0.002 && this.corridorFade(d.p.x, d.p.z) === 0) n++;
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
