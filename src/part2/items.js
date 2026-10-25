import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { lanePull } from './magnet.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gearGeometry } from '../portal.js';

// The reusable item system (CONFIG.part2.items): every item type has a swappable async
// `loadItemModel(name)` with a code-built placeholder in brass / copper / glow colours (swap in
// real models later without touching the game logic), and `Items` places them in a scene and runs
// them — floating pickups (they bob, spin and glow softly; collected when the rider comes within
// their `reach`) and chests (a small one costs 1 cog key, a big one 2; with enough keys the chest
// opens by itself when the rider walks up to it: the lid lifts, light pours out, its item floats up
// and is collected; with too few keys it glows red for a moment and says what it needs). Opened
// chests, taken pickups and the key count can be saved at a checkpoint (`snapshot`) and put back
// after a respawn (`restore`). Types: cogKey, elixirHeal, elixirEnergy, gem, heartContainer,
// gearBundle, chest (small), chestBig, and — for later levels — runeStone and wandPiece (three wand
// pieces form Amy's wand: see STORY.md).

const IT = CONFIG.part2.items;
const { lerp, clamp } = THREE.MathUtils;

const mats = new Map();

function segmentDistanceSquared(point, start, end) {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();
  const t = lengthSq > 0 ? clamp(point.clone().sub(start).dot(delta) / lengthSq, 0, 1) : 0;
  return point.distanceToSquared(start.clone().addScaledVector(delta, t));
}

/** A shared Lambert material in `color`, with a soft self-glow (`glow` 0..1 of the colour). */
function lambert(color, glow = 0.18, extra = {}) {
  const key = `${color}:${glow}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow, ...extra }));
  return mats.get(key);
}

const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2410 });
/**
 * Flat-coloured parts as ONE mesh (vertex colours; one draw call): `parts` = [[geometry, colour], …]
 * with each geometry already placed. `glow` lifts the self-light.
 */
function merged(parts, glow = 1) {
  const geos = parts.map(([g, c]) => {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    ng.deleteAttribute('uv');
    const col = new THREE.Color(c);
    const n = ng.attributes.position.count;
    ng.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => col.toArray()).flat(), 3));
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), glow === 1 ? vcMat : vcMat.clone());
  if (glow !== 1) m.material.emissive.setHex(0x3a2410).multiplyScalar(glow);
  return m;
}

/** A soft additive halo sphere (radius `size`). */
function halo(color, size, opacity = IT.halo.opacity) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.name = 'halo';
  return m;
}

/** The GREEN potion: a round flask (a ball of green glass on a short neck) with a green cork. */
function greenPotion(T) {
  const g = new THREE.Group();
  const r = T.size;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 14, 10), lambert(T.color, 0.55, { transparent: true, opacity: 0.85 }));
  glass.position.y = -r * 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.38, r * 0.6, 10), lambert(T.color, 0.5, { transparent: true, opacity: 0.85 }));
  neck.position.y = r * 0.85;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.34, r * 0.28, r * 0.4, 10), lambert(T.cork, 0.15));
  cork.position.y = r * 1.3;
  g.add(glass, neck, cork);
  return g;
}

/** The BLUE potion: a tall slender flask with a blue crystal stopper. */
function bluePotion(T) {
  const g = new THREE.Group();
  const r = T.size * 0.7;
  const profile = [[0, 0], [r * 0.85, 0], [r * 0.9, r * 0.4], [r * 0.7, r * 2.6], [r * 0.4, r * 3.1], [r * 0.38, r * 3.5], [0, r * 3.5]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), lambert(T.color, 0.55, { transparent: true, opacity: 0.85 }));
  glass.position.y = -r * 1.75;
  const stopper = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.55, 0), lambert(T.crystal, 0.7, { flatShading: true }));
  stopper.scale.set(0.8, 1.3, 0.8);
  stopper.position.y = r * 2.05;
  g.add(glass, stopper);
  return g;
}

function crystal(T) {
  // a two-tone crystal: blue below, yellow above (vertex colours)
  const geo = new THREE.OctahedronGeometry(T.size, 0).scale(0.75, 1.35, 0.75);
  const c1 = new THREE.Color(T.color);
  const c2 = new THREE.Color(T.color2);
  const col = [];
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) col.push(...(p.getY(i) >= 0 ? c2 : c1).toArray());
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x444444, flatShading: true }));
}

function heart(T) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.7).bezierCurveTo(-1.3, 0.1, -0.7, 1, 0, 0.45).bezierCurveTo(0.7, 1, 1.3, 0.1, 0, -0.7);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, -0.17).scale(T.size, T.size, T.size);
  return new THREE.Mesh(geo, lambert(T.color, 0.45));
}

function cog(T, teeth = 8, depth = 0.22) {
  const g = new THREE.Group();
  g.add(merged([
    [gearGeometry(T.size, teeth, depth), T.color],
    [new THREE.CylinderGeometry(T.size * 0.28, T.size * 0.28, depth * 1.6, 10).rotateX(Math.PI / 2), IT.colors.copper],
    [new THREE.CircleGeometry(T.size * 0.14, 8).translate(0, 0, depth * 0.82), IT.colors.dark],
  ], 1.4));
  return g;
}

function rune(T) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(T.size * 1.1, T.size * 1.7, T.size * 0.3), lambert(T.color, 0.1, { flatShading: true })));
  const sym = new THREE.MeshBasicMaterial({ color: T.glow, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(T.size * 0.32, T.size * 0.05, 6, 16), sym);
  ring.position.z = T.size * 0.17;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(T.size * 0.08, T.size * 0.9, T.size * 0.05), sym);
  bar.position.z = T.size * 0.17;
  g.add(ring, bar);
  return g;
}

function wand(T) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(T.size * 0.1, T.size * 0.14, T.size * 1.6, 8), lambert(IT.colors.copper, 0.1));
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(T.size * 0.4, 0), lambert(T.color, 0.6, { flatShading: true }));
  tip.position.y = T.size * 1.0;
  g.add(shaft, tip);
  g.rotation.z = 0.5;
  return g;
}

function shieldItem(T) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(T.size, T.size, 0.12, 20).rotateX(Math.PI / 2), lambert(T.color, 0.4));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(T.size, T.size * 0.1, 6, 20), lambert(T.rim, 0.2));
  const boss = new THREE.Mesh(new THREE.SphereGeometry(T.size * 0.28, 10, 8), lambert(T.rim, 0.3));
  boss.position.z = 0.1;
  g.add(face, rim, boss);
  return g;
}

const BUILDERS = {
  shield: shieldItem,
  cogKey: (T) => cog(T),
  elixirHeal: greenPotion,
  elixirEnergy: bluePotion,
  gem: crystal,
  heartContainer: heart,
  gearBundle: (T) => {
    const g = new THREE.Group();
    [[0, 0.05, 0, 1], [-0.7, -0.25, 0.1, 0.6], [0.7, -0.2, -0.1, 0.65]].forEach(([x, y, z, k], i) => {
      const c = cog({ ...T, size: T.size * k }, 8);
      c.position.set(x * T.size, y * T.size, z * T.size);
      c.rotation.z = i * 0.4;
      g.add(c);
    });
    return g;
  },
  runeStone: rune,
  wandPiece: wand,
};

/**
 * An item's model: a pickup (`cogKey`, `elixirHeal`, `elixirEnergy`, `gem`, `heartContainer`,
 * `gearBundle`, `runeStone`, `wandPiece`) as a Group centred on itself (+ a soft halo), or a
 * chest (`chest` = small, `chestBig`) standing on the ground with its lid on a pivot at the back.
 * `userData`: pickup → { type, spin (the part that turns), halo }; chest → { size, lid, glow, beam,
 * lock (the lock plate) }. Swap the body of this for real models later.
 */
export async function loadItemModel(name) {
  if (name === 'chest' || name === 'chestBig') return buildChest(name === 'chestBig' ? 'big' : 'small');
  const T = IT.types[name];
  if (!T || !BUILDERS[name]) throw new Error(`Unknown item "${name}"`);
  const group = new THREE.Group();
  group.name = `item:${name}`;
  const body = BUILDERS[name](T);
  const B = IT.cogKeyBeacon;
  const h = halo(T.glow, T.size * IT.halo.size * (name === 'cogKey' ? B.haloScale / IT.halo.size : 1));
  group.add(body, h);
  group.userData = { type: name, spin: body, halo: h };
  if (name === 'cogKey') {
    // the beacon: a thin beam straight up and a ring pulsing out along the ground — unfogged and additive, so it is seen from far away
    const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(B.beamRadius, B.beamRadius * 1.6, B.beamHeight, 8, 1, true), mat(B.beamColor, B.beamOpacity));
    beam.position.y = B.beamHeight / 2 - T.height;
    const ring = new THREE.Mesh(new THREE.RingGeometry(B.ringInner, B.ringOuter, 32).rotateX(-Math.PI / 2), mat(B.ringColor, 0.8));
    ring.position.y = -T.height + 0.08;
    group.add(beam, ring);
    group.userData.beam = beam;
    group.userData.ring = ring;
  }
  return group;
}

function buildChest(size) {
  const C = IT.chests[size];
  const [w, h, d] = C.size;
  const col = IT.colors;
  const group = new THREE.Group();
  group.name = `item:chest:${size}`;
  // The body (box, two brass straps, a copper trim, the lock plate) is one mesh; the lid (half a
  // cylinder along x with two straps) another, on a pivot hinged at the back top edge.
  const box = (bw, bh, bd, x, y, z, c) => [new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z), c];
  const body = merged([
    box(w, h * 0.6, d, 0, h * 0.3, 0, col.dark),
    box(w * 0.1, h * 0.62, d * 1.04, -0.36 * w, h * 0.3, 0, col.brass),
    box(w * 0.1, h * 0.62, d * 1.04, 0.36 * w, h * 0.3, 0, col.brass),
    box(w * 1.04, h * 0.08, d * 1.04, 0, h * 0.6, 0, col.copper),
    box(w * 0.16, h * 0.2, d * 0.08, 0, h * 0.58, d / 2 + d * 0.03, col.gold),
  ]);
  group.add(body);
  const lid = new THREE.Group();
  lid.position.set(0, h * 0.6, -d / 2);
  const half = (len, r, x, c) => [new THREE.CylinderGeometry(r, r, len, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, (h * 0.4) / (d / 2), 1).translate(x, 0, d / 2), c];
  lid.add(merged([half(w, d / 2, 0, col.dark), half(w * 0.1, (d / 2) * 1.04, -0.36 * w, col.brass), half(w * 0.1, (d / 2) * 1.04, 0.36 * w, col.brass)]));
  group.add(lid);
  const lock = body; // (the lock plate is part of the body mesh)
  // The light that pours out when it opens, and a red glow for "not enough keys".
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.06, d * 0.8), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = h * 0.62;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.4, w * 0.18, IT.chest.beam.height, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: IT.chest.beam.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = h * 0.62 + IT.chest.beam.height / 2;
  const red = halo(IT.chest.redColor, Math.max(w, d) * 0.95, 0);
  red.position.y = h * 0.5;
  group.add(glow, beam, red);
  group.userData = { size, cost: C.cost, lid, glow, beam, lock, red, height: h };
  return group;
}

/**
 * The items placed in a scene. `ctx`: { sound, onCollect(type, entry), onChest(entry), onNeedKeys(cost, entry) }.
 * `entries` each { id, type, chest, pos, model, taken, state ('closed' | 'opening' | 'rising' | 'open'), t, content }.
 */
export class Items {
  constructor(scene, ctx = {}) {
    this.scene = scene;
    this.ctx = ctx;
    this.maxReach = ctx.maxReach ?? IT.pickupMagnetRadius; // (no pickup is taken from further than this: nothing is pulled in)
    this.group = new THREE.Group();
    this.group.name = 'items';
    scene.add(this.group);
    this.entries = [];
    this.keys = 0;
    this.time = 0;
    this.hintAt = -Infinity;
    this.lastRiderPos = null;
    this.stats = { collected: {}, opened: 0, refused: 0 };
  }

  /** Remove everything (a new level). */
  clear() {
    for (const e of this.entries) {
      for (const m of e.contentList ?? []) m.removeFromParent();
      e.model.removeFromParent();
    }
    this.entries.length = 0;
    this.keys = 0;
    this.lastRiderPos = null;
  }

  /**
   * Place an item. `type` a pickup type, or 'chest' / 'chestBig' (`contents`: { type, n } inside it).
   * `lift`: extra height. Returns the entry.
   */
  async add(type, position, { id = `${type}${this.entries.length}`, contents = null, lift = 0, temp = false, popup = null, cost = null, ammo = null } = {}) {
    const model = await loadItemModel(type);
    const chest = type === 'chest' || type === 'chestBig';
    if (chest && cost !== null) model.userData.cost = cost;
    const e = { id, type, chest, contents, temp, popup, ammo, pos: position.clone(), home: position.clone(), model, taken: false, state: 'closed', t: 0, redT: 0, content: null, lift, phase: Math.random() * 6.28 };
    model.position.copy(position);
    if (!chest) model.position.y += IT.types[type].height + lift;
    this.group.add(model);
    this.entries.push(e);
    return e;
  }

  /** The cog keys picked up so far (the HUD's counter reads this). */
  addKeys(n) {
    this.keys += n;
  }

  /** Face a chest toward `yaw` (its front). */
  face(entry, yaw) {
    entry.model.rotation.y = yaw;
  }

  find(id) {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /**
   * Every frame. `rider`: { pos: Vector3 (the collect point) } or null (nothing collects while it
   * isn't in play); dt in game seconds.
   */
  update(dt, rider) {
    this.time += dt;
    if (!rider || dt <= 0) this.lastRiderPos = null;
    for (const e of this.entries) {
      if (!e.model.visible && !e.chest) continue;
      if (e.chest) {
        this.#chest(e, dt, rider);
        continue;
      }
      if (e.taken) continue;
      const T = IT.types[e.type];
      const u = e.model.userData;
      u.spin.rotation.y += (T.spin ?? IT.spin) * dt;
      e.model.position.y = e.pos.y + T.height + e.lift + Math.sin(this.time * IT.bobRate + e.phase) * IT.bob;
      u.halo.material.opacity = IT.halo.opacity * (0.8 + 0.2 * Math.sin(this.time * 3 + e.phase));
      if (u.ring) {
        // (the beacon's ring: out along the ground, fading as it grows, over and over; the beam breathes)
        const B = IT.cogKeyBeacon;
        const k = (this.time / B.pulse + e.phase) % 1;
        u.ring.scale.setScalar(1 + k * B.ringGrow);
        u.ring.material.opacity = 0.85 * (1 - k);
        u.beam.material.opacity = B.beamOpacity * (0.75 + 0.25 * Math.sin(this.time * 3.1 + e.phase));
      }
      if (rider && dt > 0) {
        // (on the ride, pickups in the rider's lane drift toward it and are collected within `rideMagnetRadius`; on foot: the plain radius)
        if (rider.ride && rider.heading !== undefined && e.model.position.distanceTo(rider.pos) < rider.ride.rideMagnetRadius * 3) {
          const before = e.model.position.clone();
          lanePull(e.model.position, rider.pos, rider.heading, rider.ride, dt);
          e.pos.x += e.model.position.x - before.x;
          e.pos.z += e.model.position.z - before.z;
        }
        const reach = rider.ride ? Math.max(Math.min(T.reach, this.maxReach), rider.ride.rideMagnetRadius) : Math.min(T.reach, this.maxReach);
        const direct = rider.pos.distanceTo(e.model.position) <= reach;
        const swept = e.type === 'cogKey' && this.lastRiderPos
          && segmentDistanceSquared(e.model.position, this.lastRiderPos, rider.pos) <= reach * reach;
        if (direct || swept) this.#take(e, e.model.position);
      }
    }
    if (rider && dt > 0) this.lastRiderPos = rider.pos.clone();
  }

  #take(e, at) {
    e.taken = true;
    e.model.visible = false;
    this.stats.collected[e.type] = (this.stats.collected[e.type] ?? 0) + 1;
    this.ctx.sound?.play(IT.types[e.type].sound, { position: at });
    this.ctx.onCollect?.(e.type, e, 1);
  }

  #chest(e, dt, rider) {
    const CH = IT.chest;
    const u = e.model.userData;
    // The red glow for too few keys fades out.
    e.redT = Math.max(0, e.redT - dt);
    u.red.material.opacity = 0.55 * clamp(e.redT / CH.redTime, 0, 1);
    if (e.state === 'closed') {
      if (!rider || dt <= 0) return;
      const d = Math.hypot(rider.pos.x - e.pos.x, rider.pos.z - e.pos.z);
      if (d > CH.reach || rider.pos.y - e.pos.y > 3.5) return;
      if (this.keys >= u.cost) {
        this.keys -= u.cost;
        e.state = 'opening';
        e.t = 0;
        this.stats.opened++;
        this.ctx.sound?.play('chest_open', { position: e.pos });
        this.ctx.onKeys?.(this.keys);
      } else if (this.time - this.hintAt >= CH.hintGap) {
        this.hintAt = this.time;
        e.redT = CH.redTime;
        this.stats.refused++;
        this.ctx.sound?.play('chest_locked', { position: e.pos });
        this.ctx.onNeedKeys?.(u.cost, e);
      }
      return;
    }
    if (e.state === 'opening') {
      e.t += dt;
      const k = clamp(e.t / CH.openTime, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      u.lid.rotation.x = -CH.lidAngle * ease;
      u.glow.material.opacity = 0.85 * ease;
      u.beam.material.opacity = CH.beam.opacity * ease;
      if (k >= 1) {
        e.state = 'rising';
        e.t = 0;
        this.#spawnContent(e);
      }
      return;
    }
    if (e.state === 'rising') {
      e.t += dt;
      const k = clamp(e.t / CH.riseTime, 0, 1);
      // (every item of the reward floats up side by side)
      (e.contentList ?? []).forEach((m, i, all) => {
        m.position.set(e.pos.x + (i - (all.length - 1) / 2) * 1.1, e.pos.y + u.height * 0.7 + CH.riseHeight * k, e.pos.z);
        m.userData.spin.rotation.y += 3 * dt;
        m.scale.setScalar(lerp(0.3, 1, k));
      });
      if (e.t >= CH.riseTime + CH.hold) {
        e.state = 'open'; // (and it stays open)
        for (const m of e.contentList ?? []) m.removeFromParent();
        e.contentList = null;
        for (const c of e.contents instanceof Array ? e.contents : [e.contents]) {
          this.ctx.sound?.play(IT.types[c.type].sound, { position: e.pos });
          this.ctx.onCollect?.(c.type, e, c.n ?? 1);
        }
        this.ctx.onChest?.(e);
      }
      return;
    }
    // open: the light dies down
    u.glow.material.opacity = Math.max(0, u.glow.material.opacity - dt * 1.5);
    u.beam.material.opacity = Math.max(0, u.beam.material.opacity - dt * 0.8);
  }

  async #spawnContent(e) {
    if (!e.contents) return;
    const list = [];
    for (const c of e.contents instanceof Array ? e.contents : [e.contents]) {
      const m = await loadItemModel(c.type);
      if (e.state !== 'rising') return; // (restored meanwhile)
      m.position.copy(e.pos);
      m.scale.setScalar(0.3);
      this.group.add(m);
      list.push(m);
    }
    e.contentList = list;
  }

  /** What to save at a checkpoint: the keys, the taken pickups, the opened chests. */
  snapshot() {
    return { keys: this.keys, taken: this.entries.filter((e) => !e.chest && e.taken).map((e) => e.id), opened: this.entries.filter((e) => e.chest && (e.state === 'open' || e.state === 'rising')).map((e) => e.id) };
  }

  /** Put a snapshot back (a respawn): the pickups taken after it are there again, chests opened after it are closed. */
  restore(snap) {
    this.keys = snap?.keys ?? 0;
    this.lastRiderPos = null;
    // (pickups that were dropped on the way — a robot's gem — are gone)
    for (const e of this.entries.filter((x) => x.temp)) e.model.removeFromParent();
    this.entries = this.entries.filter((x) => !x.temp);
    for (const e of this.entries) {
      for (const m of e.contentList ?? []) m.removeFromParent();
      e.contentList = null;
      if (!e.chest && e.home) {
        // (a pickup the ride's magnet had drawn sideways goes back to where it lay)
        e.pos.x = e.home.x;
        e.pos.z = e.home.z;
        e.model.position.x = e.home.x;
        e.model.position.z = e.home.z;
      }
      if (e.chest) {
        const u = e.model.userData;
        const open = !!snap?.opened.includes(e.id);
        e.state = open ? 'open' : 'closed';
        u.lid.rotation.x = open ? -IT.chest.lidAngle : 0;
        u.glow.material.opacity = u.beam.material.opacity = 0;
        e.redT = 0;
      } else {
        e.taken = !!snap?.taken.includes(e.id);
        e.model.visible = !e.taken;
      }
    }
  }
}
