import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGlb, fitModel, findClip, ClipAnimator } from './robots.js';

// Tick: a small floating brass robot, AJ's guide in Gearhaven — the Quaternius Animated Robot
// (public/models/gearhaven/tick/tick.glb, CC0): a bright brass-yellow body, copper limbs, dark
// goggles with two flat sky-blue eyes on the lenses (unlit colour: no glow, no halo), fitted to
// `height` and centred on its middle (it floats), playing its idle. A soft golden glow round him
// (an additive sprite: no light) shows only once every gear of a level is found (`setGlow`, the
// gear rewards). If the file fails: placeholder shapes (a brass ball with a rivet band, a dark
// visor with the same two eyes, two little arms, a propeller and an antenna).

const T = CONFIG.part2.tick;

/**
 * @param {{ readFile?: Function, placeholder?: boolean }} [opts]
 * @returns {Promise<THREE.Group>}  `userData` = { body, animator?, eyes, glow, prop?, arms?, placeholder }. Faces +Z.
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
  const eyes = addGogglesEyes(body);
  const glow = makeGlow();
  group.add(glow);
  group.userData = { body, animator, eyes, glow, placeholder: false, materials: Object.fromEntries(mats) };
  return group;
}

/** Two flat sky-blue eyes (`eyes`), one on the front of each goggle lens (the `Black` parts, split left / right), on the head bone. */
function addGogglesEyes(body) {
  body.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let head = null;
  const blacks = [];
  body.traverse((o) => {
    if (o.isMesh && o.material.name === 'Black') {
      box.expandByObject(o, true);
      blacks.push(o);
    }
    if (!head && o.isBone && o.name === 'Head') head = o;
  });
  if (box.isEmpty()) return [];
  // (each lens: the front half of the goggles' vertices on its side → its centre, its front)
  const midX = (box.min.x + box.max.x) / 2;
  const front = (box.min.z + box.max.z) / 2;
  const lens = [-1, 1].map(() => ({ sum: new THREE.Vector3(), n: 0, z: -Infinity }));
  const v = new THREE.Vector3();
  for (const o of blacks) {
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      if (v.z < front) continue;
      const L = lens[v.x < midX ? 0 : 1];
      L.sum.add(v);
      L.n++;
      L.z = Math.max(L.z, v.z);
    }
  }
  const parent = head ?? body;
  const k = parent.getWorldScale(new THREE.Vector3()).x;
  const E = T.eyes;
  const size = E.size * T.height;
  const mat = flatEyeMaterial();
  return lens.filter((L) => L.n).map((L) => {
    const at = L.sum.multiplyScalar(1 / L.n).setZ(L.z + E.out * T.height);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size / k, 14, 10).scale(1, 1, E.depth), mat);
    eye.name = 'tickEye';
    eye.position.copy(parent.worldToLocal(at));
    parent.add(eye);
    return eye;
  });
}

/** The eyes' material: a flat sky-blue (unlit — no emissive, no glow, no halo). */
function flatEyeMaterial() {
  return new THREE.MeshBasicMaterial({ color: T.eyes.color });
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
  glow.visible = false; // (a gear reward: Tick.setGlow)
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
  const eyeMat = flatEyeMaterial();
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 12, 8).scale(1, 1, T.eyes.depth), eyeMat);
    eye.name = 'tickEye';
    eye.position.set(side * s * 0.26, s * 0.22, s * 1.0);
    return eye;
  });
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
  body.add(shell, band, visor, ...eyes, mast, prop, antenna, tip);
  group.add(body);
  const glow = makeGlow();
  group.add(glow);
  group.userData = { body, eyes, glow, prop, arms, placeholder: true };
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
    this.hitT = 0; // (knocked down: tumbling)
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

  /** Knocked down by Amy's blast: he tumbles for `seconds` and stays dim until `setDim(false)`. */
  hit(seconds = 1.6) {
    this.hitT = seconds;
    this.setDim(true);
  }

  /** Dimmed (hurt) or back to his colours. */
  setDim(on) {
    this.model.traverse((m) => {
      const c = m.material?.color;
      if (!c) return;
      m.material.userData.base ??= c.clone();
      c.copy(m.material.userData.base).multiplyScalar(on ? 0.45 : 1);
    });
  }

  /** The soft golden glow round him (the all-gears reward). */
  setGlow(on) {
    if (this.model.userData.glow) this.model.userData.glow.visible = !!on;
  }

  /**
   * @param {number} dt
   * @param {{ position: THREE.Vector3, facing: number }} [follow]  AJ: float beside his shoulder
   */
  update(dt, follow = null) {
    this.time += dt;
    this.nervousT = Math.max(0, this.nervousT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
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
    if (this.hitT > 0) {
      const h = Math.min(1, this.hitT);
      this.model.rotation.x += h * Math.sin(this.time * 14) * 1.2;
      this.model.rotation.z += h * Math.cos(this.time * 11) * 1.4;
      this.model.position.y -= h * 0.5;
    }
    u.animator?.update(dt); // (the robot's idle)
    if (u.prop) u.prop.rotation.y += T.prop * dt;
    u.arms?.forEach((a, i) => (a.rotation.x = Math.sin(this.time * 2 + i) * 0.25 - n * 0.6));
  }
}
