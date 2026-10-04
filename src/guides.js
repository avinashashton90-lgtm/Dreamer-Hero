import * as THREE from 'three';
import { CONFIG } from './config.js';

const G = CONFIG.guides;

/** Soft-edged alpha texture (white centre fading to transparent edges), made once. */
function softTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const glowMaterial = (color, map = null) =>
  new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });

/** Placeholder landing marker: a glowing ring with a soft inner glow, lying flat. */
export async function loadLandingRingModel() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(G.ringRadius - G.ringWidth, G.ringRadius, 32).rotateX(-Math.PI / 2),
    glowMaterial(G.ringColor),
  );
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(G.ringRadius * 2.4, G.ringRadius * 2.4).rotateX(-Math.PI / 2),
    glowMaterial(G.ringColor, softTexture()),
  );
  ring.renderOrder = glow.renderOrder = 11;
  group.add(glow, ring);
  return group;
}

/** Placeholder target highlight: a soft glowing strip laid on top of a branch. */
export async function loadHighlightModel() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMaterial(G.highlightColor, softTexture()));
  mesh.renderOrder = 11;
  return mesh;
}

/**
 * Makes jumps readable: while airborne a ring marks the spot directly below the hero
 * (red over the swamp/street, where you'd fall), and the next branch on the route glows.
 */
export class JumpGuide {
  /** @param {THREE.Scene} scene @param {import('./world.js').World} world */
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.time = 0;
    this.ringAlpha = 0;
    // Route platforms in order: route roofs then route branches (keyed by their safe point).
    this.route = [...world.boxes.filter((b) => b.route), ...world.beams.filter((b) => b.route)];
    this.lastIndex = -1;
  }

  async init() {
    this.ring = await loadLandingRingModel();
    this.highlight = await loadHighlightModel();
    this.scene.add(this.ring, this.highlight);
    this.ring.visible = this.highlight.visible = false;
  }

  reset() {
    this.lastIndex = -1;
  }

  /** @param {import('./hero.js').Hero} hero */
  update(dt, hero) {
    this.time += dt;
    this.#updateRing(dt, hero);
    this.#updateHighlight(hero);
  }

  #updateRing(dt, hero) {
    const { x, z, y } = hero.position;
    const below = this.world.groundAt(x, z, y + 0.05);
    const airborne = !hero.grounded && y - below.y > 0.3;
    this.ringAlpha += ((airborne ? 1 : 0) - this.ringAlpha) * (1 - Math.exp(-G.ringFadeSpeed * dt));
    this.ring.visible = this.ringAlpha > 0.01;
    if (!this.ring.visible) return;
    const danger = !below.platform && this.world.isHazard(x);
    const color = danger ? G.ringHazardColor : G.ringColor;
    const [glow, ring] = this.ring.children;
    ring.material.color.setHex(color);
    glow.material.color.setHex(color);
    ring.material.opacity = G.ringOpacity * this.ringAlpha;
    glow.material.opacity = G.ringOpacity * 0.45 * this.ringAlpha;
    this.ring.position.set(x, below.y + 0.05, z);
    // Slightly larger when high up, tightening as he comes down.
    this.ring.scale.setScalar(1 + Math.min(y - below.y, 4) * 0.08);
  }

  #updateHighlight(hero) {
    const safe = hero.grounded && hero.platform?.safe;
    if (safe) {
      const i = this.route.findIndex((p) => p.safe.equals(safe));
      if (i >= 0) this.lastIndex = i;
    }
    const next = this.route[this.lastIndex + 1];
    const show = !!next && next.len !== undefined; // only branches get the highlight
    this.highlight.visible = show;
    if (!show) return;
    const hw = (next.hw0 + next.hw1) / 2;
    this.highlight.position.set((next.x0 + next.x1) / 2, next.top + 0.04, (next.z0 + next.z1) / 2);
    this.highlight.rotation.y = Math.atan2(-next.uz, next.ux);
    this.highlight.scale.set(next.len + hw, 1, hw * 2.2);
    this.highlight.material.opacity = G.highlightOpacity * (0.7 + 0.3 * Math.sin(this.time * G.highlightPulse));
  }
}
