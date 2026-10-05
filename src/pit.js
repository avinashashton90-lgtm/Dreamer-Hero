import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeFadeMaterial, addFadeAttribute } from './world.js';

const P = CONFIG.desert.pit;
const { smoothstep, lerp } = THREE.MathUtils;

const additive = (color, opacity, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...extra });
// (fog off: additive glows would otherwise pick up the bright sunset fog colour)

/**
 * Placeholder Lazarus Pit: a ring of dark stones round a still pool, a faint blue-green glow
 * on the water, plus the effects used when the girl wakes it (ripple, rising aura, the heal
 * pulse) and a pool of rising vapor wisps (instanced, additive). All parts are in userData.
 */
export async function loadLazarusPitModel() {
  const R = P.radius;
  const group = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.25, 0.35, 5, 20).rotateX(Math.PI / 2).scale(1, 0.55, 1),
    new THREE.MeshLambertMaterial({ color: P.rimColor, flatShading: true }),
  );
  rim.position.y = 0.08;
  const water = new THREE.Mesh(new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.waterColor }));
  water.position.y = 0.04;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 28).rotateX(-Math.PI / 2), additive(P.faintGlow, P.faintOpacity));
  glow.position.y = 0.06;
  glow.renderOrder = 7;
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), additive(P.ripple.color, 0, { side: THREE.DoubleSide }));
  ripple.position.y = 0.08;
  ripple.renderOrder = 8;
  ripple.visible = false;
  // Aura: an open column of light rising off the water (fades towards the top).
  const auraGeo = new THREE.CylinderGeometry(R * 0.8, R, 1, 24, 1, true).translate(0, 0.5, 0);
  const aura = new THREE.Mesh(auraGeo, additive(P.aura.color, 0, { side: THREE.DoubleSide }));
  aura.renderOrder = 8;
  aura.visible = false;
  // Heal pulse: a blue-white shell wrapping the hero (placed in world space by LazarusPit).
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), additive(P.pulse.color, 0));
  pulse.renderOrder = 9;
  pulse.visible = false;
  // Vapor wisps.
  const vaporGeo = new THREE.IcosahedronGeometry(1, 0);
  const vaporFade = addFadeAttribute(vaporGeo, P.vapor.max);
  const vapor = new THREE.InstancedMesh(
    vaporGeo,
    makeFadeMaterial({ color: 0x000000, emissive: P.vapor.color, opacity: P.vapor.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    P.vapor.max,
  );
  vapor.userData.fade = vaporFade;
  vapor.count = 0;
  vapor.frustumCulled = false;
  vapor.renderOrder = 8;
  group.add(rim, water, glow, ripple, aura, vapor);
  group.userData = { rim, water, glow, ripple, aura, pulse, vapor };
  return group;
}

/**
 * The Lazarus Pit off the desert trail. Hidden until the "Stop." cutscene reveals it (not on
 * the HUD before). `activate()` when the girl touches the water: it turns blue and glows, a
 * ripple spreads from her hand, an aura rises, a hum plays. `pulse()` wraps the hero in light
 * as he drinks; `dim()` after they ride on.
 */
export class LazarusPit {
  constructor(scene, world, sound = null) {
    this.scene = scene;
    this.world = world;
    this.sound = sound;
    this.wisps = [];
    this.rippleAt = new THREE.Vector3();
    this.pulseTarget = null;
  }

  async init() {
    this.model = await loadLazarusPitModel();
    this.model.position.copy(this.world.pitPosition);
    this.scene.add(this.model, this.model.userData.pulse);
    this.reset();
  }

  get position() {
    return this.model.position;
  }

  reset() {
    this.revealed = false;
    this.active = false;
    this.level = 0; // 0 faint … 1 awake (blue, glowing)
    this.dimming = false;
    this.rippleT = this.auraT = this.pulseT = -1;
    this.vaporDebt = 0;
    this.wisps.length = 0;
    this.model.visible = false;
    const u = this.model.userData;
    u.ripple.visible = u.aura.visible = u.pulse.visible = false;
    u.vapor.count = 0;
    this.#paint();
  }

  /** Shown for the first time (the cutscene's camera swing). */
  reveal() {
    this.revealed = true;
    this.model.visible = true;
  }

  /** The girl's hand touches the water at `hand` (world). */
  activate(hand) {
    this.reveal();
    this.active = true;
    this.dimming = false;
    this.rippleT = 0;
    this.auraT = 0;
    this.rippleAt.copy(hand ?? this.position);
    this.sound?.play('hum');
  }

  /** Blue-white pulse wrapping `target` (a Vector3 that is followed, e.g. hero.position). */
  pulse(target) {
    this.pulseTarget = target;
    this.pulseT = 0;
  }

  /** Back to a faint glow (they ride on). */
  dim() {
    this.active = false;
    this.dimming = true;
  }

  update(dt) {
    if (!this.model.visible) return;
    const u = this.model.userData;
    const goal = this.active ? 1 : 0;
    const rate = this.dimming ? 1 / P.dimTime : 1 / P.ripple.time;
    this.level += Math.sign(goal - this.level) * Math.min(Math.abs(goal - this.level), rate * dt);
    this.#paint();

    // Ripple from the hand out to the rim.
    if (this.rippleT >= 0) {
      this.rippleT += dt;
      const k = this.rippleT / P.ripple.time;
      u.ripple.visible = k < 1;
      if (k >= 1) this.rippleT = -1;
      else {
        const local = this.rippleAt.clone().sub(this.position);
        u.ripple.position.set(lerp(local.x, 0, k), 0.08, lerp(local.z, 0, k));
        u.ripple.scale.setScalar(0.15 + (P.radius + 0.1) * k);
        u.ripple.material.opacity = 0.9 * (1 - k);
      }
    }
    // Aura: rises while the pit is awake, sinks back as it dims.
    if (this.auraT >= 0) {
      this.auraT += dt;
      const up = smoothstep(this.auraT, 0, P.aura.time);
      const h = P.aura.height * up * Math.max(this.level, 0.001);
      u.aura.visible = h > 0.05;
      u.aura.scale.set(1, Math.max(0.01, h), 1);
      u.aura.material.opacity = P.aura.opacity * this.level * (0.85 + 0.15 * Math.sin(this.auraT * 3));
      if (!this.active && this.level <= 0) this.auraT = -1;
    } else u.aura.visible = false;
    // Heal pulse round the hero.
    if (this.pulseT >= 0 && this.pulseTarget) {
      this.pulseT += dt;
      const k = this.pulseT / P.pulse.time;
      u.pulse.visible = k < 1;
      if (k >= 1) this.pulseT = -1;
      else {
        u.pulse.position.copy(this.pulseTarget).setY(this.pulseTarget.y + 0.9);
        u.pulse.scale.set(0.4 + P.pulse.size * k, (0.4 + P.pulse.size * k) * 1.3, 0.4 + P.pulse.size * k);
        u.pulse.material.opacity = P.pulse.opacity * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.5);
      }
    }
    this.#updateVapor(dt);
  }

  /** Water and glow colours from the activation level. */
  #paint() {
    const u = this.model.userData;
    const c = new THREE.Color(P.waterColor).lerp(new THREE.Color(P.activeColor), this.level * 0.75);
    u.water.material.color.copy(c);
    u.glow.material.color.set(P.faintGlow).lerp(new THREE.Color(P.activeColor), this.level);
    u.glow.material.opacity = lerp(P.faintOpacity, P.activeOpacity, this.level);
  }

  /** Wisps of vapor drift up off the water (more of them while it is awake). */
  #updateVapor(dt) {
    const V = P.vapor;
    const vapor = this.model.userData.vapor;
    this.vaporDebt += V.rate * (1 + this.level) * dt;
    while (this.vaporDebt >= 1) {
      this.vaporDebt -= 1;
      let w = this.wisps.find((q) => q.age >= q.life);
      if (!w) {
        if (this.wisps.length >= V.max) break;
        w = {};
        this.wisps.push(w);
      }
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * P.radius * 0.9;
      Object.assign(w, { x: Math.cos(a) * r, z: Math.sin(a) * r, age: 0, life: V.life * (0.7 + Math.random() * 0.6), size: lerp(V.size[0], V.size[1], Math.random()), drift: Math.random() * Math.PI * 2 });
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let n = 0;
    for (const w of this.wisps) {
      if (w.age >= w.life) continue;
      w.age += dt;
      const k = Math.min(1, w.age / w.life);
      p.set(w.x + Math.sin(w.drift + w.age) * 0.2, 0.1 + V.rise * k * (1 + this.level), w.z + Math.cos(w.drift + w.age) * 0.2);
      s.setScalar(w.size * (0.6 + k));
      vapor.setMatrixAt(n, m.compose(p, q, s));
      vapor.userData.fade.setX(n++, Math.sin(Math.PI * k) * (0.6 + 0.4 * this.level));
    }
    vapor.count = n;
    vapor.instanceMatrix.needsUpdate = true;
    vapor.userData.fade.needsUpdate = true;
  }
}
