import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

// The portal at the end of Part 1 (the castle courtyard): a swirling ring of light that opens in
// the air beside AJ, sparks spiralling into its bright core and brass gears flying in from all
// round it; then it pulls AJ and the horse in (story.js drives that). All additive / unlit, no
// lights. Placeholder: swap loadPortalModel() for a real effect later.

const P = CONFIG.part2.portal;
const TAU = Math.PI * 2;

/** A small flat gear (a disc with teeth), the brass pieces the portal sucks in. */
export function gearGeometry(radius = 1, teeth = 8, depth = 0.25) {
  const parts = [new THREE.CylinderGeometry(radius, radius, depth, Math.max(10, teeth * 2), 1).rotateX(Math.PI / 2)];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const tooth = new THREE.BoxGeometry(radius * 0.32, radius * 0.3, depth).translate(0, radius * 1.08, 0).rotateZ(a);
    parts.push(tooth);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

const additive = (color, opacity, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, ...extra });

/** `userData` = { ring, ring2, core, halo, swirl, gears }. Faces +Z (rotate the group to aim it). */
export async function loadPortalModel() {
  const group = new THREE.Group();
  group.name = 'portal';
  const R = P.radius;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, P.ring.tube, 8, 48), additive(P.ring.color, P.ring.opacity));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.78, P.ring.tube * 0.6, 6, 40), additive(P.core.glow, 0.7));
  const core = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 40), additive(P.core.color, P.core.opacity));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(R * 1.7, 40), additive(P.core.glow, 0.35));
  halo.position.z = -0.02;
  const swirl = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), additive(P.swirl.color, P.swirl.opacity), P.swirl.count);
  swirl.frustumCulled = false;
  const gears = new THREE.InstancedMesh(gearGeometry(1, 8, 0.3), new THREE.MeshLambertMaterial({ color: P.gears.color }), P.gears.count);
  gears.frustumCulled = false;
  for (const m of [ring, ring2, core, halo, swirl]) m.renderOrder = 9;
  group.add(halo, core, ring2, ring, swirl, gears);
  group.userData = { ring, ring2, core, halo, swirl, gears };
  group.visible = false;
  return group;
}

export class Portal {
  constructor(scene) {
    this.scene = scene;
    this.open = 0; // 0..1 how far open
    this.opening = false;
    this.time = 0;
    this.rand = Math.random;
    this.ready = loadPortalModel().then((m) => {
      this.model = m;
      scene.add(m);
      const r = this.rand;
      this.motes = Array.from({ length: P.swirl.count }, () => ({ a: r() * TAU, d: r(), sp: 0.6 + r() * 0.8, size: P.swirl.size[0] + r() * (P.swirl.size[1] - P.swirl.size[0]) }));
      this.cogs = Array.from({ length: P.gears.count }, () => this.#newGear({ t: r() }));
    });
  }

  #newGear(g = {}) {
    const r = this.rand;
    const lerp = (a, b) => a + r() * (b - a);
    const a = r() * TAU;
    const up = lerp(-0.6, 0.6);
    return Object.assign(g, {
      dir: new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up) + 0.15, Math.sin(a) * Math.cos(up)).normalize(),
      from: lerp(...P.gears.from),
      life: lerp(...P.gears.time),
      t: g.t ?? 0,
      size: lerp(...P.gears.size),
      spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(P.gears.spin),
    });
  }

  /** Open in the air at `at`, facing `facing` (a world direction the disc looks along). */
  openAt(at, facing) {
    if (!this.model) return;
    this.model.position.copy(at);
    this.model.lookAt(at.clone().add(facing));
    this.model.visible = true;
    this.opening = true;
    this.open = 0;
    this.time = 0;
  }

  /** The world point at its core (where AJ and the horse are pulled to). */
  get center() {
    return this.model ? this.model.position : new THREE.Vector3();
  }

  close() {
    this.opening = false;
    this.open = 0;
    if (this.model) this.model.visible = false;
  }

  reset() {
    this.close();
  }

  update(dt) {
    const m = this.model;
    if (!m || !m.visible) return;
    this.time += dt;
    if (this.opening) this.open = Math.min(1, this.open + dt / P.openTime);
    const k = THREE.MathUtils.smoothstep(this.open, 0, 1);
    const u = m.userData;
    m.scale.setScalar(Math.max(0.001, k));
    u.ring.rotation.z += P.spin * dt;
    u.ring2.rotation.z -= P.spin * 1.6 * dt;
    u.core.material.opacity = P.core.opacity * (0.85 + 0.15 * Math.sin(this.time * 9));
    u.halo.material.opacity = 0.35 * k * (0.8 + 0.2 * Math.sin(this.time * 5));
    // Sparks spiralling in to the core.
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const R = P.radius;
    this.motes.forEach((mo, i) => {
      mo.d -= dt * P.swirl.speed * mo.sp * 0.35;
      if (mo.d <= 0.05) mo.d += 1;
      mo.a += dt * P.swirl.speed * (1.5 / Math.max(0.2, mo.d));
      const rr = R * (0.15 + mo.d * 1.25);
      const sz = mo.size * Math.min(1, mo.d * 3);
      u.swirl.setMatrixAt(i, mat.compose(new THREE.Vector3(Math.cos(mo.a) * rr, Math.sin(mo.a) * rr, 0.05), q, s.set(sz, sz, sz)));
    });
    u.swirl.instanceMatrix.needsUpdate = true;
    // Gears flying in from round it (in its local frame; it is scaled with the opening).
    const e = new THREE.Euler();
    this.cogs.forEach((g, i) => {
      g.t += dt / g.life;
      if (g.t >= 1) this.#newGear(g).t = 0;
      const f = g.t * g.t; // (accelerating in)
      const d = g.from * (1 - f);
      e.set(g.spin.x * this.time, g.spin.y * this.time, g.spin.z * this.time);
      const sz = g.size * (1 - f * 0.8) / Math.max(0.2, k);
      u.gears.setMatrixAt(i, mat.compose(g.dir.clone().multiplyScalar(d / Math.max(0.2, k)), q.setFromEuler(e), s.set(sz, sz, sz)));
    });
    u.gears.instanceMatrix.needsUpdate = true;
  }
}
