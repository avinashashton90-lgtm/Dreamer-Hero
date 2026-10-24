import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeMinionModel } from './minionModels.js';
import { particleMaterial, softDot } from './sandstorm.js';

const GT = CONFIG.desert.gate;
const TO = CONFIG.desert.castle.torches;
const IG = CONFIG.desert.castle.innerGate;
const { clamp, lerp } = THREE.MathUtils;

/**
 * Placeholder effects for the castle-gate scene: flying bone pieces and dust puffs, each one
 * InstancedMesh with a per-instance fade. `userData` = { bones, dust }.
 */
export async function loadGateFxModels() {
  const B = GT.bones;
  const D = GT.dust;
  const nBones = GT.line.lateral.length * B.count;
  const nDust = GT.line.lateral.length * D.count * 2 + GT.slam.dust;
  const bones = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.35, 1.6, 2, 5).rotateZ(Math.PI / 2), particleMaterial({ color: B.color, fog: true }), nBones);
  const dust = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), particleMaterial({ color: D.color, opacity: D.opacity, map: softDot() }), nDust);
  for (const m of [bones, dust]) {
    m.geometry.setAttribute('instanceFade', new THREE.InstancedBufferAttribute(new Float32Array(m.count).fill(0), 1).setUsage(THREE.DynamicDrawUsage));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
  }
  bones.material.transparent = true;
  dust.renderOrder = 4;
  const group = new THREE.Group();
  group.add(bones, dust);
  group.userData = { bones, dust };
  return group;
}

/**
 * The castle gates and the gate scene's skeletons: `stage(template)` lines 4 skeletons up
 * before the gate (a clear lane in the middle), `update(dt, horse)` throws each one aside as
 * the horse passes (launch with spin, a dust burst, flying bone pieces — simple procedural
 * animation, nobody hurt, nothing in the horse's way), swings the gates open as it arrives
 * and shut on `slam()` (dust, `onSlam` for the sound and the shake).
 * The gate leaves come from the castle model (`userData.gates`: two separate swappable parts).
 */
export class CastleGate {
  constructor(scene, world, { onSlam } = {}) {
    this.scene = scene;
    this.world = world;
    this.onSlam = onSlam;
    this.puppets = [];
    this.bones = [];
    this.dust = [];
    this.open = 0; // 0 shut … 1 wide open
    this.opening = false;
    this.slamT = -1;
    this.slams = 0;
    this.inner = 1; // the inner gates (the courtyard side): 1 open … 0 shut
    this.innerClosing = false;
    this.time = 0;
  }

  async init() {
    this.fx = await loadGateFxModels();
    this.scene.add(this.fx);
  }

  /** The gate's outer opening, where the riders stop inside, and `out` (from the gate away from the castle) in world space. */
  get frame() {
    const c = this.world.castle;
    c.updateMatrixWorld(true);
    const gate = c.userData.gateLocal.clone().applyMatrix4(c.matrixWorld);
    const inside = c.userData.insideLocal.clone().applyMatrix4(c.matrixWorld);
    const out = new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
    const right = new THREE.Vector3(-out.z, 0, out.x);
    return { gate, inside, out, right, floor: c.position.y };
  }

  /** The inner gates (the courtyard side of the passage), if the castle has them. */
  get innerLeaves() {
    const g = this.world.castle?.userData.innerGates;
    return g ? [g.left, g.right] : [];
  }

  /** The inner gates swing shut behind the horse (the portal scene); `onInnerShut` at the end. */
  closeInner(onShut = null) {
    if (this.inner <= 0) return onShut?.();
    this.innerClosing = true;
    this.onInnerShut = onShut;
  }

  get innerClosed() {
    return this.inner <= 0;
  }

  get leaves() {
    const g = this.world.castle?.userData.gates;
    return g ? [g.left, g.right] : [];
  }

  /** 4 skeletons in a line before the gate, facing the horse, the lane between the middle two clear. */
  stage(template) {
    this.clearPuppets();
    const { gate, out, right } = this.frame;
    for (const lat of GT.line.lateral) {
      const model = makeMinionModel(template);
      const p = gate.clone().addScaledVector(out, GT.line.before).addScaledVector(right, lat);
      p.y = this.world.heightAt(p.x, p.z);
      model.position.copy(p);
      model.rotation.y = Math.atan2(out.x, out.z);
      model.userData.animator.set('idle');
      this.scene.add(model);
      this.puppets.push({ model, lat, along: GT.line.before, launched: false, landed: false, v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0 });
    }
  }

  /** Thrown aside, away from the lane, spinning, with a dust burst and bone pieces. */
  #launch(p, horse) {
    const L = GT.launch;
    const { out, right } = this.frame;
    const side = Math.sign(p.lat) || 1;
    const k = 1 + Math.max(0, horse.speed - GT.speed * 0.5) / GT.speed;
    p.launched = true;
    p.v.copy(right).multiplyScalar(side * L.out * k).addScaledVector(out, -L.back).setY(L.up * k);
    p.spin.set((Math.random() - 0.5) * L.spin, (Math.random() - 0.5) * L.spin, side * L.spin);
    p.model.userData.animator.set('hit');
    this.#dustBurst(p.model.position, GT.dust.count);
    for (let i = 0; i < GT.bones.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(GT.bones.speed * (0.4 + Math.random() * 0.6)).addScaledVector(right, side * GT.bones.speed * 0.5);
      v.y = GT.bones.up * (0.5 + Math.random() * 0.5);
      this.bones.push({ p: p.model.position.clone().setY(p.model.position.y + 0.6 + Math.random()), v, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: (Math.random() - 0.5) * 20, age: 0 });
    }
  }

  #dustBurst(at, n, spread = 1) {
    const D = GT.dust;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.push({
        p: at.clone().add(new THREE.Vector3(Math.cos(a) * spread, 0.3 + Math.random() * 0.6, Math.sin(a) * spread)),
        v: new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)).multiplyScalar(D.speed * (0.5 + Math.random() * 0.5)),
        size: lerp(D.size[0], D.size[1], Math.random()),
        age: 0,
      });
    }
  }

  startOpening() {
    this.opening = true;
  }

  /** The gates slam shut (over `slam.time`; at the end dust, the sound and the shake). */
  slam() {
    if (this.slamT >= 0) return;
    this.opening = false;
    this.slamT = 0;
    this.slamFrom = this.open;
  }

  get closed() {
    return this.open <= 1e-3 && this.slamT < 0;
  }

  update(dt, horse = null) {
    // Thrown aside as the horse comes level with them.
    if (horse) {
      const { gate, out } = this.frame;
      const along = horse.position.clone().sub(gate).dot(out);
      for (const p of this.puppets) if (!p.launched && along <= p.along + GT.launch.reach) this.#launch(p, horse);
    }
    for (const p of this.puppets) {
      if (!p.launched) {
        p.model.userData.animator.update(dt);
        continue;
      }
      const m = p.model;
      const ground = this.world.heightAt(m.position.x, m.position.z);
      if (!p.landed) {
        p.t += dt;
        p.v.y -= GT.launch.gravity * dt;
        m.position.addScaledVector(p.v, dt);
        m.rotation.x += p.spin.x * dt;
        m.rotation.y += p.spin.y * dt;
        m.rotation.z += p.spin.z * dt;
        if (m.position.y <= ground && p.v.y < 0) {
          // Down in a heap (it stays outside the gates).
          m.position.y = ground;
          p.landed = true;
          m.rotation.set(Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), m.rotation.y, 0);
          this.#dustBurst(m.position, Math.ceil(GT.dust.count / 2), 0.6);
        }
      }
      m.userData.animator.update(dt);
    }
    // The gates.
    const O = GT.open;
    if (this.slamT >= 0) {
      this.slamT += dt;
      const k = clamp(this.slamT / GT.slam.time, 0, 1);
      this.open = this.slamFrom * (1 - k * k); // (accelerating shut)
      if (k >= 1) {
        this.slamT = -1;
        this.open = 0;
        this.slams++;
        const { gate, out } = this.frame;
        this.#dustBurst(gate.clone().addScaledVector(out, 1), GT.slam.dust, 2.5);
        this.onSlam?.();
      }
    } else if (this.opening) this.open = Math.min(1, this.open + dt / O.time);
    const e = this.open * this.open * (3 - 2 * this.open);
    for (const leaf of this.leaves) leaf.rotation.y = -leaf.userData.side * O.angle * e;
    // The inner gates: shut behind the horse in the courtyard (a slow swing, then a thud).
    if (this.innerClosing) {
      this.inner = Math.max(0, this.inner - dt / GT.innerShut.time);
      if (this.inner <= 0) {
        this.innerClosing = false;
        const c = this.world.castle;
        const at = c.userData.innerGateLocal.clone().applyMatrix4(c.matrixWorld);
        this.#dustBurst(at.addScaledVector(this.frame.out, -1), GT.innerShut.dust, 2);
        this.onInnerShut?.();
        this.onInnerShut = null;
      }
    }
    const ei = this.inner * this.inner * (3 - 2 * this.inner);
    for (const leaf of this.innerLeaves) leaf.rotation.y = -leaf.userData.side * IG.open * ei;
    this.#flicker(dt);
    this.#updateFx(dt);
  }

  #updateFx(dt) {
    const { bones, dust } = this.fx.userData;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const B = GT.bones;
    const bf = bones.geometry.attributes.instanceFade.array;
    this.bones = this.bones.filter((b) => b.age < B.life);
    for (let i = 0; i < bones.count; i++) {
      const b = this.bones[i];
      if (!b) {
        bf[i] = 0;
        bones.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      b.age += dt;
      b.v.y -= B.gravity * dt;
      b.p.addScaledVector(b.v, dt);
      const g = this.world.heightAt(b.p.x, b.p.z);
      if (b.p.y < g) {
        b.p.y = g;
        b.v.multiplyScalar(0.3);
        b.v.y = Math.abs(b.v.y);
      }
      b.r.x += b.w * dt;
      b.r.y += b.w * 0.6 * dt;
      bones.setMatrixAt(i, m.compose(b.p, q.setFromEuler(b.r), s.setScalar(B.size)));
      bf[i] = 1 - clamp((b.age - B.life * 0.7) / (B.life * 0.3), 0, 1);
    }
    const D = GT.dust;
    const df = dust.geometry.attributes.instanceFade.array;
    this.dust = this.dust.filter((d) => d.age < D.life);
    const cam = this.camera;
    for (let i = 0; i < dust.count; i++) {
      const d = this.dust[i];
      if (!d || !cam) {
        df[i] = 0;
        dust.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      d.age += dt;
      d.p.addScaledVector(d.v, dt);
      d.v.multiplyScalar(Math.exp(-2 * dt));
      const f = d.age / D.life;
      dust.setMatrixAt(i, m.compose(d.p, cam.quaternion, s.setScalar(d.size * (1 + f * 1.5))));
      df[i] = Math.sin(Math.PI * Math.min(1, f * 1.5 + 0.1)) * (1 - f);
    }
    for (const x of [bones, dust]) {
      x.instanceMatrix.needsUpdate = true;
      x.geometry.attributes.instanceFade.needsUpdate = true;
    }
  }

  /** The castle's torches flicker (each its own rate and phase). */
  #flicker(dt) {
    this.time += dt;
    const F = TO.flicker;
    for (const t of this.world.castle?.userData.torches ?? []) {
      const rate = lerp(F.rate[0], F.rate[1], (t.phase * 0.37) % 1);
      const n = Math.sin(this.time * rate + t.phase) * 0.6 + Math.sin(this.time * rate * 2.3 + t.phase * 3) * 0.4;
      t.flame.scale.set(1 - n * F.amount * 0.4, 1 + n * F.amount, 1 - n * F.amount * 0.4);
      t.core.scale.y = 1 + n * F.amount * 0.6;
      t.halo.scale.setScalar(1 + n * F.amount * 0.5);
    }
  }

  clearPuppets() {
    for (const p of this.puppets) this.scene.remove(p.model);
    this.puppets = [];
  }

  /** Play Again: gates shut, no skeletons, no effects. */
  reset() {
    this.clearPuppets();
    this.bones = [];
    this.dust = [];
    this.open = 0;
    this.opening = false;
    this.slamT = -1;
    this.slams = 0;
    for (const leaf of this.leaves) leaf.rotation.y = 0;
    this.inner = 1;
    this.innerClosing = false;
    this.onInnerShut = null;
    for (const leaf of this.innerLeaves) leaf.rotation.y = -leaf.userData.side * IG.open;
    if (this.fx) this.#updateFx(0);
  }
}
