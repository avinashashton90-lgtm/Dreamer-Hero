import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, DIALOGUE } from './config.js';

const EN = CONFIG.energy;

/** Placeholder energy potion (swap for a real model later): a glowing blue flask with a cork, a soft halo. */
export async function loadPotionModel() {
  const P = EN.potions;
  const group = new THREE.Group();
  const flask = new THREE.Mesh(
    mergeGeometries([new THREE.SphereGeometry(0.22, 12, 8).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.07, 0.09, 0.18, 8).translate(0, 0.46, 0)]),
    new THREE.MeshLambertMaterial({ color: P.color, emissive: P.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }),
  );
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.08, 8).translate(0, 0.58, 0), new THREE.MeshLambertMaterial({ color: P.capColor }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8).translate(0, 0.28, 0), new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(flask, cork, halo);
  return group;
}

/** Placeholder grass patch (swap later): a flat green disc with tufts on it, feet at the origin. */
export async function loadGrassModel() {
  const G = EN.grass;
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(G.radius, 20).rotateX(-Math.PI / 2).translate(0, 0.04, 0), new THREE.MeshLambertMaterial({ color: G.color }));
  const tufts = [];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = G.radius * Math.sqrt((i + 0.5) / 26) * 0.92;
    tufts.push(new THREE.ConeGeometry(0.09, 0.32 + (i % 3) * 0.08, 4).translate(Math.cos(a) * r, 0.18, Math.sin(a) * r));
  }
  group.add(disc, new THREE.Mesh(mergeGeometries(tufts), new THREE.MeshLambertMaterial({ color: G.tuftColor, flatShading: true })));
  return group;
}

/** Placeholder desert oasis (swap later): a small pond with a sandy rim and a couple of palm trees. `palms` in local x (out from the trail), z (along). */
export async function loadOasisModel(side = 1) {
  const O = EN.oases;
  const out = -side; // (local +x is the trail's left once turned along it: the palms go out, away from the trail)
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CircleGeometry(O.radius + 0.6, 24).rotateX(-Math.PI / 2).translate(0, 0.03, 0), new THREE.MeshLambertMaterial({ color: O.rimColor })));
  const water = new THREE.Mesh(new THREE.CircleGeometry(O.radius, 24).rotateX(-Math.PI / 2).translate(0, 0.06, 0), new THREE.MeshLambertMaterial({ color: O.waterColor, emissive: O.waterColor, emissiveIntensity: 0.15 }));
  group.add(water);
  for (const [x, z] of O.palms) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 4.2, 6).translate(0, 2.1, 0), new THREE.MeshLambertMaterial({ color: O.trunkColor, flatShading: true }));
    trunk.rotation.z = -out * 0.12;
    const leaves = [];
    for (let k = 0; k < 6; k++) leaves.push(new THREE.ConeGeometry(0.35, 2.2, 4).rotateZ(Math.PI / 2 - 0.35).translate(1.0, 0, 0).rotateY((k / 6) * Math.PI * 2));
    const crown = new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshLambertMaterial({ color: O.leafColor, flatShading: true }));
    crown.position.set(out * 0.5, 4.2, 0);
    palm.add(trunk, crown);
    palm.position.set(out * (x - O.lateral), 0, z);
    group.add(palm);
  }
  group.userData.water = water;
  return group;
}

/** Where the forest potions go: every `every` along the trail from `start` to `end`, on the safe line, clear of gems, hurdles and the high walls. */
export function planPotions(world, gems) {
  const P = EN.potions;
  const track = world.track;
  const L = track.length;
  const gemS = gems.filter((g) => g.zone === 'forest' && g.kind !== 'air').map((g) => g.s);
  const fair = (s) =>
    !gemS.some((g) => Math.abs(g - s) < P.gemClear) &&
    !(world.hurdles ?? []).some((h) => Math.abs(h.s - s) < P.hurdleClear) &&
    !(world.gapWalls ?? []).some((w) => Math.abs(w.s - s) < P.wallClear);
  const list = [];
  for (let s0 = L * P.start; s0 <= L * P.end; s0 += P.every) {
    let at = null;
    for (let s = s0; s <= Math.min(L * P.end, s0 + P.search); s += 2) {
      if (fair(s)) {
        at = s;
        break;
      }
    }
    if (at === null) continue;
    const lat = world.safeLateral(track, at);
    const p = track.at(at);
    const x = p.x - p.tz * lat;
    const z = p.z + p.tx * lat;
    list.push({ s: at, lateral: lat, x, z, y: Math.max(world.heightAt(x, z), CONFIG.zones.waterY) + P.height });
  }
  return list;
}

/** Grass patches beside the trail line (alternating sides), clear of hurdles and the high walls' funnels. */
export function planGrass(world) {
  const G = EN.grass;
  const track = world.track;
  const L = track.length;
  const fair = (s) =>
    !(world.hurdles ?? []).some((h) => Math.abs(h.s - s) < G.hurdleClear) &&
    !(world.gapWalls ?? []).some((w) => Math.abs(w.s - s) < G.wallClear) &&
    world.surfaceAt(track.at(s).x, track.at(s).z) !== 'water';
  const list = [];
  G.at.forEach((f, i) => {
    let at = null;
    for (let d = 0; d <= G.search && at === null; d += 2) for (const s of [f * L + d, f * L - d]) if (at === null && fair(s)) at = s;
    if (at === null) return;
    const lat = (i % 2 ? -1 : 1) * G.lateral;
    const p = track.at(at);
    const x = p.x - p.tz * lat;
    const z = p.z + p.tx * lat;
    list.push({ s: at, lateral: lat, x, z, y: world.heightAt(x, z) });
  });
  return list;
}

/** The desert oases: before the Lazarus Pit (no chase, no sandstorm there), a pond at the trail's edge. */
export function planOases(world) {
  const O = EN.oases;
  const track = world.desertTrack;
  if (!track) return [];
  return O.at.map((f, i) => {
    const s = f * track.length;
    const side = i % 2 ? -1 : 1;
    const lat = side * O.lateral;
    const p = track.at(s);
    const x = p.x - p.tz * lat;
    const z = p.z + p.tx * lat;
    return { s, lateral: lat, side, x, z, y: world.heightAt(x, z), tx: p.tx, tz: p.tz };
  });
}

/**
 * The horse's energy (separate from AJ's hearts; the value lives on the horse): galloping drains
 * it (`gallopDrain`), anything above a walk drains it very slowly (`trotDrain`), walking,
 * standing or waiting dismounted lets it recover (`regenRate`). Only in play — nothing changes
 * in a cutscene. At 0 the horse is tired (`horse.energyTired`): no gallop, a tired walk, until
 * `recoverAt`; a short hint the first time. Refills: forest potions (`refill` 40%, a splash and
 * a sound), grass patches (eaten while slow, `rate` per second; nothing at a gallop) and the
 * desert oases (60% riding through the pond).
 * @param {{ onHint?: (text) => void, onRefill?: (kind, x, z) => void, sound? }} events
 */
export class HorseEnergy {
  constructor(scene, world, events = {}) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.potions = [];
    this.grass = [];
    this.oases = [];
    this.drops = [];
    this.time = 0;
    this.hintShown = false;
    this.stats = { potions: 0, grass: 0, oases: 0, tired: 0 };
  }

  async init(gems) {
    this.potions = planPotions(this.world, gems);
    this.grass = planGrass(this.world);
    this.oases = planOases(this.world);
    for (const p of this.potions) {
      p.model = await loadPotionModel();
      p.model.position.set(p.x, p.y, p.z);
      this.scene.add(p.model);
    }
    for (const g of this.grass) {
      g.model = await loadGrassModel();
      g.model.position.set(g.x, g.y, g.z);
      this.scene.add(g.model);
    }
    for (const o of this.oases) {
      o.model = await loadOasisModel(o.side);
      o.model.position.set(o.x, o.y, o.z);
      o.model.rotation.y = Math.atan2(o.tx, o.tz);
      this.scene.add(o.model);
    }
    // Splash drops (potions, ponds): a small pool of instanced spheres.
    const S = EN.splash;
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: S.color, transparent: true, opacity: 0.85 }), S.count * 3);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.scene.add(this.dropMesh);
    this.reset();
  }

  /** A new game or a respawn: every potion back, the hint may show again only in a new game. */
  reset({ newGame = true } = {}) {
    for (const p of this.potions) {
      p.taken = false;
      p.model.visible = true;
    }
    for (const o of this.oases) o.inside = false;
    this.drink = null;
    if (newGame) this.hintShown = false;
  }

  #splash(x, y, z) {
    const S = EN.splash;
    for (let i = 0; i < S.count; i++) {
      const a = (i / S.count) * Math.PI * 2;
      this.drops.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(Math.cos(a) * S.speed, S.up * (0.6 + Math.random() * 0.4), Math.sin(a) * S.speed), age: 0 });
    }
  }

  #refill(horse, share, kind, x, y, z) {
    horse.energy = Math.min(EN.horseEnergyMax, horse.energy + share * EN.horseEnergyMax);
    this.#splash(x, y, z);
    this.events.sound?.play(kind === 'potion' ? 'potion' : 'oasisSplash');
    this.events.onRefill?.(kind, x, z);
  }

  /**
   * @param {number} dt
   * @param {import('./horse.js').Horse} horse
   * @param {boolean} playing  in play (not a cutscene, a menu or paused): only then does energy change
   */
  update(dt, horse, playing) {
    this.time += dt;
    for (const p of this.potions) {
      if (p.taken) continue;
      p.model.rotation.y = this.time * 2;
      p.model.position.y = p.y + Math.sin(this.time * 2.5 + p.s) * 0.08;
    }
    this.#updateDrops(dt);
    horse.eating = false;
    if (!playing || horse.scripted) {
      this.#endDrink(horse);
      return;
    }
    const riding = horse.mode === 'riding';
    const resting = horse.mode === 'idle';
    if (!riding && !resting) return; // (mounting / dismounting)
    // Drain or recover.
    let rate = EN.regenRate;
    if (riding && horse.galloping) rate = -EN.gallopDrain;
    else if (riding && horse.speed > EN.walkMax) rate = -EN.trotDrain;
    horse.energy = THREE.MathUtils.clamp(horse.energy + rate * dt, 0, EN.horseEnergyMax);
    if (riding) {
      const c = horse.collectPoint;
      // Potions: ridden through, 40% back.
      for (const p of this.potions) {
        if (p.taken || Math.hypot(c.x - p.x, c.z - p.z) > EN.potions.reach || Math.abs(c.y - p.y) > EN.potions.reach) continue;
        p.taken = true;
        p.model.visible = false;
        this.stats.potions++;
        this.#refill(horse, EN.potions.refill, 'potion', p.x, p.y, p.z);
      }
      // Grass: eaten while slow (a trot or a walk), grazing when (nearly) stopped.
      const G = EN.grass;
      const onGrass = this.grass.some((g) => Math.hypot(horse.position.x - g.x, horse.position.z - g.z) < G.radius);
      if (onGrass && !horse.galloping) {
        horse.energy = Math.min(EN.horseEnergyMax, horse.energy + G.rate * dt);
        horse.eating = Math.abs(horse.speed) < G.eatSpeed;
        this.stats.grass += dt;
      }
      // Oases: riding into the pond the horse drinks (once per visit): a slow walk, head down,
      // sipping, its energy refilling gradually by `refill` over oasisDrinkTime.
      for (const o of this.oases) {
        const d = Math.hypot(horse.position.x - o.x, horse.position.z - o.z);
        const inside = d < EN.oases.radius;
        if (inside && !o.inside && !this.drink) {
          this.stats.oases++;
          this.drink = { oasis: o, t: 0, given: 0, sip: 0, ripple: 0 };
          horse.speed = Math.min(horse.speed, EN.oasisDrinkSpeed); // (it slows to a walk)
          this.#splash(horse.position.x, o.y + 0.3, horse.position.z);
          this.events.sound?.play('oasisSplash');
          this.events.onRefill?.('oasis', horse.position.x, horse.position.z);
        }
        o.inside = inside;
      }
      this.#drink(dt, horse);
    } else this.#endDrink(horse);
    // Tired at 0: no gallop, a tired walk, until recoverAt; the hint the first time.
    if (horse.energy <= 0 && !horse.energyTired) {
      horse.energyTired = true;
      horse.galloping = false;
      this.stats.tired++;
      if (!this.hintShown) {
        this.hintShown = true;
        this.events.onHint?.(DIALOGUE.energy.tired);
      }
    } else if (horse.energyTired && horse.energy >= EN.recoverAt * EN.horseEnergyMax) horse.energyTired = false;
  }

  /** Drinking at an oasis (see update): ends after oasisDrinkTime, leaving the pond, or a gallop. */
  #drink(dt, horse) {
    const D = this.drink;
    if (!D) return;
    const OD = EN.oasisDrink;
    const o = D.oasis;
    const away = Math.hypot(horse.position.x - o.x, horse.position.z - o.z) > EN.oases.radius + OD.leave;
    if (D.t >= EN.oasisDrinkTime || away || horse.galloping) {
      this.#endDrink(horse);
      return;
    }
    D.t += dt;
    horse.drinking = true;
    // The energy back gradually: `refill` of the maximum over the drink.
    const share = Math.min(EN.oases.refill * EN.horseEnergyMax - D.given, (EN.oases.refill * EN.horseEnergyMax * dt) / EN.oasisDrinkTime);
    horse.energy = Math.min(EN.horseEnergyMax, horse.energy + share);
    D.given += share;
    // Sips and little ripples at its mouth.
    const mouth = horse.position.clone().add(new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading)).multiplyScalar(OD.mouth));
    if ((D.sip -= dt) <= 0) {
      D.sip = OD.sipEvery;
      this.events.sound?.play('horse_sip', { position: mouth });
    }
    if ((D.ripple -= dt) <= 0) {
      D.ripple = OD.rippleEvery;
      const S = EN.splash;
      for (let i = 0; i < OD.ripples; i++) {
        const a = (i / OD.ripples) * Math.PI * 2 + D.t;
        this.drops.push({ p: new THREE.Vector3(mouth.x, o.y + 0.25, mouth.z), v: new THREE.Vector3(Math.cos(a) * S.speed * 0.25, S.up * 0.15, Math.sin(a) * S.speed * 0.25), age: S.life * 0.3 });
      }
    }
  }

  #endDrink(horse) {
    if (!this.drink) return;
    this.drink = null;
    horse.drinking = false;
  }

  /** Drinking at an oasis now (the horse's head down; no skeletons rise near it). */
  get drinking() {
    return !!this.drink;
  }

  #updateDrops(dt) {
    if (!this.dropMesh) return;
    const S = EN.splash;
    this.drops = this.drops.filter((d) => (d.age += dt) < S.life);
    const m = new THREE.Matrix4();
    const n = Math.min(this.drops.length, this.dropMesh.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d.v.y -= 12 * dt;
      d.p.addScaledVector(d.v, dt);
      const s = S.size * (1 - d.age / S.life);
      this.dropMesh.setMatrixAt(i, m.makeScale(s, s, s).setPosition(d.p));
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }
}
