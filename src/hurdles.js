import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, DIALOGUE } from './config.js';

const HU = CONFIG.hurdles;
const T = HU.types;

/** Small seeded random (the same hurdles every game). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Placeholder hurdle models (swap for real ones later), feet at the origin, across local X
 * (the trail's width), local +Z along the trail:
 *  - 'wall': `wallLayers` (4) layers of stacked stones in running bond (two greys and a light one);
 *  - 'thorns': a low clump of dark leaves with red thorns (the director slides it sideways);
 *  - 'stones': three small rocks across the trail.
 */
export async function loadObstacleModel(type) {
  const group = new THREE.Group();
  if (type === 'wall') {
    const W = T.wall;
    const rnd = seeded(11);
    const parts = W.colors.map(() => []);
    for (let layer = 0; layer < HU.wallLayers; layer++) {
      let x = -W.halfWidth + (layer % 2 ? -W.stone[0] / 2 : 0);
      while (x < W.halfWidth) {
        const w = Math.min(W.stone[0] + rnd() * (W.stone[1] - W.stone[0]), W.halfWidth - x);
        const x0 = Math.max(x, -W.halfWidth);
        const len = x + w - x0;
        if (len > 0.2) {
          const g = new THREE.BoxGeometry(len - 0.06, W.layerHeight - 0.05, W.depth * (0.92 + rnd() * 0.08));
          g.translate(x0 + len / 2, layer * W.layerHeight + W.layerHeight / 2, 0);
          parts[Math.floor(rnd() * parts.length)].push(g);
        }
        x += w;
      }
    }
    parts.forEach((geos, i) => {
      if (geos.length) group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: W.colors[i], flatShading: true })));
    });
  } else if (type === 'thorns') {
    const B = T.thorns;
    const rnd = seeded(23);
    const leaves = [];
    const thorns = [];
    for (let i = 0; i < 9; i++) {
      const x = (i / 8 - 0.5) * B.halfWidth * 1.8;
      const r = 0.38 + rnd() * 0.22;
      leaves.push(new THREE.IcosahedronGeometry(r, 0).translate(x, r * 0.8, (rnd() - 0.5) * B.depth * 0.5));
      for (let k = 0; k < 3; k++) {
        const a = rnd() * Math.PI * 2;
        thorns.push(new THREE.ConeGeometry(0.05, 0.28, 4).rotateZ(-Math.PI / 2 + (rnd() - 0.5)).rotateY(a).translate(x + Math.cos(a) * r, r * 0.8 + (rnd() - 0.3) * r, Math.sin(a) * r));
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshLambertMaterial({ color: B.color, flatShading: true })));
    group.add(new THREE.Mesh(mergeGeometries(thorns), new THREE.MeshLambertMaterial({ color: B.thornColor, flatShading: true })));
  } else {
    const S = T.stones;
    const rnd = seeded(37);
    const geos = S.lateral.map((x) => new THREE.DodecahedronGeometry(S.radius, 0).scale(1, S.height / S.radius / 1.6, 1).rotateY(rnd() * 3).translate(x, S.height * 0.45, 0));
    group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: S.color, flatShading: true })));
  }
  return group;
}

/**
 * Where the hurdles go on the forest trail (World plans them before the gems and checkpoints,
 * which keep clear of them — no gem is ever under a hurdle): from 10% in, every
 * `obstacleSpacingMin…Max` (then the first fair spot within `search`), types in `pattern`
 * order, never in the last 10%, on a bend or a slope, in the water, or near the ride's own
 * obstacles and high-wall funnels. Deterministic (world seed).
 * @returns {{ type, s, x, z, tx, tz, base }[]}
 */
export function planHurdles(world) {
  const track = world.track;
  const L = track.length;
  const rnd = seeded(CONFIG.world.seed + 101);
  const FW = CONFIG.forestWalls;
  const OB = CONFIG.obstacles;
  // The ride's own obstacles (their run-up / run-out) and high walls (approach, funnel, exit).
  const items = [
    ...(world.obstacles ?? []).map((o) => [o.s - OB.runUp - HU.itemClear, o.s + OB.runOut + HU.itemClear]),
    ...(world.gapWalls ?? []).map((w) => [w.s - FW.leadIn - FW.safeApproach - HU.itemClear, w.s + FW.leadOut + FW.safeExit + HU.itemClear]),
  ];
  const wet = (a, b) => {
    for (let s = a; s <= b; s += HU.step) {
      const p = track.at(Math.max(0, Math.min(L, s)));
      if (world.surfaceAt(p.x, p.z) === 'water') return true;
    }
    return false;
  };
  const fair = (s, type) => {
    const before = type === 'wall' ? T.wall.runUp : HU.straightBefore;
    if (s - before < L * HU.edgeClear || s > L * (1 - HU.edgeClear)) return false;
    if (track.maxCurvature(s - before, s + HU.straightAfter) > HU.maxCurvature) return false;
    const pa = track.at(s - HU.slopeSpan);
    const pb = track.at(s + HU.slopeSpan);
    if (Math.abs(world.heightAt(pb.x, pb.z) - world.heightAt(pa.x, pa.z)) / (2 * HU.slopeSpan) > HU.maxSlope) return false;
    if (items.some(([a, b]) => s - before < b && s + HU.straightAfter > a)) return false; // (its run-up / run-out overlaps one)
    return !wet(s - before, s + HU.straightAfter);
  };
  const list = [];
  let s = L * HU.edgeClear;
  let k = 0;
  while (s < L * (1 - HU.edgeClear)) {
    const want = s + HU.obstacleSpacingMin + rnd() * (HU.obstacleSpacingMax - HU.obstacleSpacingMin);
    const type = HU.pattern[k % HU.pattern.length];
    let at = null;
    for (let c = want; c <= want + HU.search; c += HU.step) {
      if (fair(c, type)) {
        at = c;
        break;
      }
    }
    if (at === null) {
      s = want + HU.search;
      continue;
    }
    const p = track.at(at);
    list.push({ type, s: at, x: p.x, z: p.z, tx: p.tx, tz: p.tz, base: world.heightAt(p.x, p.z) });
    k++;
    s = at;
  }
  return list;
}

/**
 * The forest obstacle director: giant walls (power jump: jump while galloping; else a 1 s stop
 * and stumble), sliding thorn bushes (a slow-down and a stumble, a jump clears them) and stones
 * (a jump; else a 1 s stumble). No hearts lost to any of them (`obstacleHeartDamage` 0).
 * `batWindows()` gives the trail stretches where bats may come in and attack (none within
 * `batClear` of a hurdle) for `minions.scheduleBats`, so the two never clash.
 * @param {{ onHurt?: (hearts, x, z) => void, onHint?: (text) => void, sound? }} events
 */
export class Hurdles {
  constructor(scene, world, events = {}) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.list = [];
    this.time = 0;
    this.hintShown = false;
    this.stats = { wallBlocks: 0, wallsCleared: 0, thornHits: 0, stoneStumbles: 0 };
  }

  async init() {
    this.list = this.world.hurdles ?? [];
    for (const h of this.list) {
      h.model = await loadObstacleModel(h.type);
      h.model.position.set(h.x, h.base, h.z);
      h.model.rotation.y = Math.atan2(h.tx, h.tz);
      this.scene.add(h.model);
      h.prevAlong = -Infinity;
      h.shake = 0;
      h.phase = this.list.indexOf(h) * 1.7;
      h.hit = new Set();
    }
  }

  /** Trail stretches (forest `s`) where bats may come in and attack: away from every hurdle. */
  batWindows() {
    const B = HU.batClear;
    const zones = this.list.map((h) => [h.s - B.before, h.s + B.after]);
    const windows = [];
    let from = -Infinity;
    for (const [a, b] of zones) {
      if (a > from) windows.push({ from, to: a });
      from = Math.max(from, b);
    }
    windows.push({ from, to: Infinity });
    return windows;
  }

  reset() {
    this.hintShown = false;
    this.time = 0;
    for (const h of this.list) {
      h.prevAlong = -Infinity;
      h.shake = 0;
      h.hit.clear();
    }
  }

  /** The sliding thorn bush's lateral offset now. */
  thornOffset(h) {
    return T.thorns.travel * Math.sin((this.time * Math.PI * 2) / T.thorns.period + h.phase);
  }

  /** The horse's position in a hurdle's frame: `along` the trail (+ = past it) and `across` (+ = right). */
  frame(h, p) {
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    return { along: dx * h.tx + dz * h.tz, across: dx * -h.tz + dz * h.tx };
  }

  update(dt, horse) {
    this.time += dt;
    for (const h of this.list) {
      // Thorns slide; a wall shakes after a hit.
      let off = h.type === 'thorns' ? this.thornOffset(h) : 0;
      if (h.shake > 0) {
        const S = T.wall.shake;
        h.shake = Math.max(0, h.shake - dt);
        off += Math.sin(h.shake * S.rate) * S.amp * (h.shake / S.time);
      }
      h.model.position.set(h.x - h.tz * off, h.base, h.z + h.tx * off);
    }
    horse.powerJumpZone = false;
    if (horse.route !== this.world.track || horse.mode !== 'riding' || horse.scripted) return;
    for (const h of this.list) {
      // Only near it along the trail (its plane crosses the winding trail elsewhere too).
      const ds = (horse.trackS ?? 0) - h.s;
      if (ds < -HU.near || ds > HU.near) {
        h.prevAlong = -Infinity;
        continue;
      }
      const { along, across } = this.frame(h, horse.position);
      const height = horse.position.y - h.base;
      if (h.type === 'wall') this.#wall(h, along, height, horse, ds);
      else if (h.type === 'thorns') this.#thorns(h, along, across, height, horse);
      else this.#stones(h, along, across, height, horse);
      h.prevAlong = along;
    }
  }

  #wall(h, along, height, horse, ds) {
    const W = T.wall;
    if (ds < 0 && ds > -HU.powerJump.zone) horse.powerJumpZone = true;
    if (!this.hintShown && ds < 0 && ds > -HU.hintRange) {
      this.hintShown = true;
      this.events.onHint?.(DIALOGUE.hurdles.wallHint);
    }
    const plane = -(W.depth / 2 + W.contact);
    if (!(h.prevAlong < plane && along >= plane && along < W.depth)) return;
    if (height >= HU.wallLayers * W.layerHeight - W.clearMargin) {
      this.stats.wallsCleared++;
      return;
    }
    // Stopped: moved back off the wall, a ~1 s stumble standing still, then it goes on; the wall
    // shakes. No hearts (obstacleHeartDamage 0).
    const back = plane - W.recoil - along;
    horse.position.x += h.tx * back;
    horse.position.z += h.tz * back;
    horse.position.y = this.world.heightAt(horse.position.x, horse.position.z);
    horse.galloping = false;
    horse.velocity.set(0, 0, 0);
    horse.grounded = true;
    horse.stumbleFor(W.stop, { stop: true });
    h.shake = W.shake.time;
    this.stats.wallBlocks++;
    this.events.sound?.play('wallThud');
    this.#hurt(h.x, h.z);
  }

  #thorns(h, along, across, height, horse) {
    const B = T.thorns;
    const near = Math.abs(along) < B.depth / 2 + HU.contactReach;
    if (!near) {
      h.hit.clear();
      return;
    }
    if (h.hit.size || height >= B.height - B.clearMargin) return;
    if (Math.abs(across - this.thornOffset(h)) > B.halfWidth + CONFIG.horse.radius * 0.6) return;
    h.hit.add('thorns');
    horse.stumbleFor(B.stumble);
    horse.speed *= B.slow;
    this.stats.thornHits++;
    this.#hurt(horse.position.x, horse.position.z);
  }

  /** Hearts for AJ from an obstacle: `obstacleHeartDamage` (0 by default: none). */
  #hurt(x, z) {
    if (HU.obstacleHeartDamage > 0) this.events.onHurt?.(HU.obstacleHeartDamage, x, z);
  }

  #stones(h, along, across, height, horse) {
    const S = T.stones;
    if (Math.abs(along) > S.radius + HU.contactReach + 1) {
      h.hit.clear();
      return;
    }
    if (Math.abs(along) > S.radius + HU.contactReach || height >= S.height - S.clearMargin) return;
    for (const lat of S.lateral) {
      if (h.hit.has(lat) || Math.abs(across - lat) > S.radius + CONFIG.horse.radius * 0.5) continue;
      h.hit.add(lat);
      horse.stumbleFor(S.stumble);
      this.stats.stoneStumbles++;
      this.#hurt(horse.position.x, horse.position.z);
    }
  }
}
