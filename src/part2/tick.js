import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGlb, fitModel, findClip, ClipAnimator } from './robots.js';

// Tick: a small floating brass robot, AJ's guide in Gearhaven — the Quaternius Animated Robot
// (public/models/gearhaven/tick/tick.glb, CC0): a bright brass-yellow body, copper limbs, dark
// goggles with a glowing cyan eye on them, fitted to `height` and centred on its middle (it
// floats), playing its idle, a soft glow round him (an additive sprite: no light). If the file
// fails: placeholder shapes (a brass ball with a rivet band, a dark visor with one glowing eye,
// two little arms, a propeller and an antenna).

const T = CONFIG.part2.tick;

/**
 * @param {{ readFile?: Function, placeholder?: boolean }} [opts]
 * @returns {Promise<THREE.Group>}  `userData` = { body, animator?, eye?, eyeGlow?, prop?, arms?, placeholder }. Faces +Z.
 */
export async function loadTickModel(opts = {}) {
  if (!opts.placeholder) {
    try {
      return await loadTickGlb(opts);
    } catch (e) {
      console.warn('Tick model failed to load; using the placeholder Tick.', e);
    }
  }
  return buildPlaceholderTick();
}

async function loadTickGlb(opts) {
  const gltf = await loadGlb(T.file, opts);
  // Materials by name: the yellow body → brass, the grey limbs → copper, the goggles stay dark.
  const mats = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    const color = T.tint[name] ?? T.tint.Grey;
    if (!mats.has(name)) mats.set(name, new THREE.MeshLambertMaterial({ color, name }));
    o.material = mats.get(name);
  });
  const group = new THREE.Group();
  group.name = 'tick';
  const body = fitModel(gltf.scene, T.height, { centre: true });
  group.add(body);
  const roles = Object.fromEntries(Object.entries(T.clips).map(([role, names]) => [role, findClip(gltf.animations, names)]));
  const animator = new ClipAnimator(gltf.scene, gltf.animations, roles, T.crossfade);
  animator.play('idle');
  const eye = addGogglesEye(body);
  group.add(makeGlow());
  group.userData = { body, animator, eye, placeholder: false, materials: Object.fromEntries(mats) };
  return group;
}

/** A glowing cyan eye on the middle of his goggles (the `Black` parts), riding on the head bone. */
function addGogglesEye(body) {
  body.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let head = null;
  body.traverse((o) => {
    if (o.isMesh && o.material.name === 'Black') box.expandByObject(o, true);
    if (!head && o.isBone && o.name === 'Head') head = o;
  });
  if (box.isEmpty()) return null;
  const E = T.goggleEye;
  const size = E.size * T.height;
  const at = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + size * 0.3);
  const parent = head ?? body;
  const k = parent.getWorldScale(new THREE.Vector3()).x;
  const eye = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size / k, 12, 8), new THREE.MeshBasicMaterial({ color: E.color, fog: false }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry((size * E.haloSize) / k, 12, 8), new THREE.MeshBasicMaterial({ color: E.halo, transparent: true, opacity: E.haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  core.renderOrder = 10;
  halo.renderOrder = 9;
  eye.add(core, halo);
  eye.position.copy(parent.worldToLocal(at));
  parent.add(eye);
  return eye;
}

/** A soft round glow (an additive sprite with a radial fade; no light, so it costs nothing). */
function makeGlow() {
  const G = T.glow;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - r) ** 2;
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: G.color, transparent: true, opacity: G.opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(G.size * T.height);
  glow.renderOrder = 8;
  glow.name = 'tickGlow';
  return glow;
}

function buildPlaceholderTick() {
  const s = T.size;
  const group = new THREE.Group();
  group.name = 'tick';
  const brass = new THREE.MeshLambertMaterial({ color: T.color });
  const dark = new THREE.MeshLambertMaterial({ color: T.dark });
  const body = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), brass);
  const band = new THREE.Mesh(new THREE.TorusGeometry(s * 1.0, s * 0.08, 6, 24), dark);
  band.rotation.x = Math.PI / 2;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(s * 0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  visor.rotation.x = Math.PI / 2;
  visor.position.set(0, s * 0.18, s * 0.55);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.2, 12, 8), new THREE.MeshBasicMaterial({ color: T.eye }));
  eye.position.set(0, s * 0.18, s * 0.95);
  const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(s * 0.42, 12, 8), new THREE.MeshBasicMaterial({ color: T.eye, transparent: true, opacity: T.eyeGlow * 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  eyeGlow.position.copy(eye.position);
  // Propeller and antenna on top.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.05, s * 0.05, s * 0.35, 6), dark);
  mast.position.y = s * 1.12;
  const prop = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(s * 1.5, s * 0.03, s * 0.18), brass);
    blade.rotation.y = a;
    prop.add(blade);
  }
  prop.position.y = s * 1.3;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.025, s * 0.025, s * 0.5, 5), dark);
  antenna.position.set(s * 0.45, s * 0.95, -s * 0.2);
  antenna.rotation.z = -0.4;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(s * 0.08, 8, 6), new THREE.MeshBasicMaterial({ color: T.eye }));
  tip.position.set(s * 0.56, s * 1.18, -s * 0.2);
  // Little arms.
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.06, s * 0.05, s * 0.6, 6).translate(0, -s * 0.3, 0), dark);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 8, 6), brass);
    hand.position.y = -s * 0.62;
    arm.add(upper, hand);
    arm.position.set(side * s * 0.95, -s * 0.05, 0);
    arm.rotation.z = side * 0.35;
    body.add(arm);
    return arm;
  });
  // A soft blob shadow below (it floats).
  body.add(shell, band, visor, eye, eyeGlow, mast, prop, antenna, tip);
  group.add(body);
  group.add(makeGlow());
  group.userData = { body, eye, eyeGlow, prop, arms, placeholder: true };
  return group;
}

/**
 * Tick floating: a gentle bob, the propeller spinning, beside AJ's shoulder (`follow`), facing
 * him or a point; `nervous(seconds)` — he glances over his shoulder, jittery ("I cannot say.").
 */
export class Tick {
  constructor(model) {
    this.model = model;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.time = 0;
    this.nervousT = 0;
    this.target = null; // a point to float to (else beside `follow`)
    this.lookAt = null; // a point to face
  }

  place(p, yaw = this.yaw) {
    this.position.copy(p);
    this.yaw = yaw;
    this.#sync(0);
  }

  nervous(seconds = T.nervous.time) {
    this.nervousT = seconds;
  }

  /**
   * @param {number} dt
   * @param {{ position: THREE.Vector3, facing: number }} [follow]  AJ: float beside his shoulder
   */
  update(dt, follow = null) {
    this.time += dt;
    this.nervousT = Math.max(0, this.nervousT - dt);
    let want = this.target;
    if (!want && follow) {
      const f = new THREE.Vector3(Math.sin(follow.facing), 0, Math.cos(follow.facing));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      want = follow.position.clone().addScaledVector(r, -T.follow.side).addScaledVector(f, T.follow.back).setY(follow.position.y + T.float);
    }
    if (want) this.position.lerp(want, 1 - Math.exp(-T.follow.rate * dt));
    const look = this.lookAt ?? follow?.position;
    if (look) {
      const yaw = Math.atan2(look.x - this.position.x, look.z - this.position.z);
      this.yaw += Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw)) * (1 - Math.exp(-6 * dt));
    }
    this.#sync(dt);
  }

  #sync(dt) {
    const u = this.model.userData;
    const N = T.nervous;
    const n = this.nervousT > 0 ? Math.min(1, this.nervousT * 3) : 0;
    this.model.position.copy(this.position);
    this.model.position.y += Math.sin(this.time * T.bobRate * Math.PI * 2) * T.bob + (n ? Math.sin(this.time * 41) * 0.02 : 0);
    // (nervous: a look back over his shoulder, then back, a little shiver)
    const glance = n * Math.sin(Math.min(1, (N.time - this.nervousT) / N.time) * Math.PI) * N.yaw;
    this.model.rotation.set(0, this.yaw + glance + Math.sin(this.time * N.rate) * 0.08 * n, Math.sin(this.time * 1.3) * 0.06);
    u.animator?.update(dt); // (the robot's idle)
    if (u.prop) u.prop.rotation.y += T.prop * dt;
    if (u.eyeGlow) u.eyeGlow.material.opacity = T.eyeGlow * (0.35 + 0.1 * Math.sin(this.time * 3));
    u.arms?.forEach((a, i) => (a.rotation.x = Math.sin(this.time * 2 + i) * 0.25 - n * 0.6));
  }
}
