import * as THREE from 'three';
import { CONFIG } from './config.js';

// A skeleton killed by the Batarang or the Flash breaks apart: its bones burst out in all
// directions (a small physics burst: gravity, a bounce on the sand, spinning, shrinking away
// after CONFIG.minions.shatter.life s), a white-yellow hit flash and a few sparks. Cheap: one
// InstancedMesh for the bones, one for the sparks, a small pool of flash spheres (additive).

const SH = CONFIG.minions.shatter;

/** The placeholder pieces (swap later): bone sticks and skull bits, sparks, flash spheres. */
export async function loadBoneShatterModel() {
  const group = new THREE.Group();
  group.name = 'boneShatter';
  const maxBones = SH.bones * SH.maxBursts;
  const bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.04, 1, 5), new THREE.MeshLambertMaterial({ color: SH.color, flatShading: true }), maxBones);
  bones.count = 0;
  bones.frustumCulled = false;
  const sparkMat = new THREE.MeshBasicMaterial({ color: SH.sparks.color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), sparkMat, SH.sparks.count * SH.maxBursts);
  sparks.count = 0;
  sparks.frustumCulled = false;
  const flashes = [];
  for (let i = 0; i < SH.maxBursts; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: SH.flash.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.visible = false;
    group.add(f);
    flashes.push(f);
  }
  group.add(bones, sparks);
  group.userData = { bones, sparks, flashes };
  return group;
}

export class BoneShatter {
  /**
   * @param {THREE.Scene} scene
   * @param {{ heightAt: (x, z) => number }} world
   */
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pieces = []; // { p, v, rot, spin, size, age }
    this.sparks = []; // { p, v, age }
    this.flashes = []; // { mesh, age }
    this.stats = { bursts: 0 };
    this.model = null;
    this.ready = loadBoneShatterModel().then((m) => {
      this.model = m;
      scene.add(m);
    });
  }

  /** Break a skeleton apart at `at` (its middle); `away` (optional) tilts the burst. */
  burst(at, away = null) {
    this.stats.bursts++;
    const r = (a, b) => a + Math.random() * (b - a);
    // (the oldest burst's pieces make room)
    const maxPieces = SH.bones * SH.maxBursts;
    if (this.pieces.length + SH.bones > maxPieces) this.pieces.splice(0, this.pieces.length + SH.bones - maxPieces);
    for (let i = 0; i < SH.bones; i++) {
      const a = (i / SH.bones) * Math.PI * 2 + Math.random() * 0.6;
      const sp = r(...SH.speed);
      const v = new THREE.Vector3(Math.cos(a) * sp, r(...SH.up), Math.sin(a) * sp);
      if (away) v.addScaledVector(away, sp * 0.4);
      this.pieces.push({
        p: at.clone().add(new THREE.Vector3(r(-0.2, 0.2), r(-0.5, 0.5), r(-0.2, 0.2))),
        v,
        rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        spin: new THREE.Vector3(r(-1, 1), r(-1, 1), r(-1, 1)).multiplyScalar(SH.spin),
        size: r(...SH.size),
        age: 0,
      });
    }
    const S = SH.sparks;
    const maxSparks = S.count * SH.maxBursts;
    if (this.sparks.length + S.count > maxSparks) this.sparks.splice(0, this.sparks.length + S.count - maxSparks);
    for (let i = 0; i < S.count; i++) {
      const v = new THREE.Vector3(r(-1, 1), r(-0.2, 1), r(-1, 1)).normalize().multiplyScalar(S.speed * r(0.5, 1));
      this.sparks.push({ p: at.clone(), v, age: 0 });
    }
    if (this.model) {
      const f = this.model.userData.flashes.find((m) => !m.visible) ?? this.model.userData.flashes[0];
      f.visible = true;
      f.position.copy(at);
      this.flashes = this.flashes.filter((x) => x.mesh !== f);
      this.flashes.push({ mesh: f, age: 0 });
    }
  }

  /** Pieces still flying / lying (tests). */
  get active() {
    return this.pieces.length;
  }

  clear() {
    this.pieces.length = 0;
    this.sparks.length = 0;
    for (const f of this.flashes) f.mesh.visible = false;
    this.flashes.length = 0;
    this.#draw();
  }

  update(dt) {
    if (!dt) return;
    const g = SH.gravity;
    this.pieces = this.pieces.filter((b) => (b.age += dt) < SH.life);
    for (const b of this.pieces) {
      b.v.y -= g * dt;
      b.p.addScaledVector(b.v, dt);
      const ground = this.world.heightAt(b.p.x, b.p.z) + 0.03;
      if (b.p.y < ground) {
        b.p.y = ground;
        b.v.y = Math.abs(b.v.y) * SH.bounce;
        b.v.x *= 0.6;
        b.v.z *= 0.6;
        b.spin.multiplyScalar(0.6);
      }
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
    }
    const S = SH.sparks;
    this.sparks = this.sparks.filter((s) => (s.age += dt) < S.life);
    for (const s of this.sparks) {
      s.v.y -= g * 0.5 * dt;
      s.p.addScaledVector(s.v, dt);
    }
    const F = SH.flash;
    this.flashes = this.flashes.filter((f) => {
      f.age += dt;
      const k = f.age / F.time;
      if (k >= 1) {
        f.mesh.visible = false;
        return false;
      }
      f.mesh.scale.setScalar(F.size[0] + (F.size[1] - F.size[0]) * k);
      f.mesh.material.opacity = F.opacity * (1 - k);
      return true;
    });
    this.#draw();
  }

  #draw() {
    if (!this.model) return;
    const { bones, sparks } = this.model.userData;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let n = 0;
    for (const b of this.pieces) {
      // (shrinks away over its last `shrink` s)
      const k = Math.min(1, (SH.life - b.age) / SH.shrink);
      s.set(b.size * 0.9 * k, b.size * k, b.size * 0.9 * k);
      bones.setMatrixAt(n++, m.compose(b.p, q.setFromEuler(b.rot), s));
    }
    bones.count = n;
    bones.instanceMatrix.needsUpdate = true;
    n = 0;
    const S = SH.sparks;
    for (const sp of this.sparks) {
      const k = S.size * (1 - sp.age / S.life);
      sparks.setMatrixAt(n++, m.compose(sp.p, q.identity(), s.set(k, k, k)));
    }
    sparks.count = n;
    sparks.instanceMatrix.needsUpdate = true;
  }
}
