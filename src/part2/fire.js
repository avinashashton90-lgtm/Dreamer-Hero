import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../config.js';
import { RideWorld, Ride, loadRide, setRideConfig } from './ride.js';
import { setRideModelConfig, trackPoint } from './rideModel.js';
import { Items } from './items.js';
import { gearGeometry } from '../portal.js';
import { Foes } from './foes.js';
import { Arsenal, FireFx } from './fireCombat.js';
import { Guardian, buildArena } from './guardian.js';
import { BoneShatter } from '../shatter.js';
import { applyLook } from './looks.js';

// The Fire Element's level (STORY.md; CONFIG.part2.fire): the furnace city. The first stretch is the
// Gearhaven ride's own machinery on a new layout (conveyors, steam vents, rails, the belt deck, a
// saw and hammers, brass gears, seven cog keys); then scout robots run at the horse in
// pairs, a plaza has four chests (two small, a big one and the Shield chest, a cog key each, two elixirs), and sword
// robots patrol the last stretch; the furnace gate leads into a sealed circular plaza with the
// Furnace Guardian (George); when he falls, the Fire Element rises on a pedestal: AJ takes it (the
// flame flows into his hand, his eyes flash orange), a hooded figure watches from a far tower and
// vanishes in violet light, and Fire Blast is his (it is not before that; the Shield comes from a plaza chest). This class owns the level's things and runs them
// each frame; the Part2 chapter (index.js) hands it the shared systems and calls it.

const P2 = CONFIG.part2;
const F = P2.fire;
const FD = DIALOGUE.part2.fire;
const A = F.arena;
const E = F.element;

/** The Fire ride's config: the Gearhaven ride's with this level's layout on top. */
export function fireRideConfig() {
  const base = P2.ride;
  return {
    ...base,
    ...F.ride,
    gears: { ...base.gears, ...F.ride.gears },
    grind: { ...base.grind, ...F.ride.grind },
  };
}

export class FireLevel {
  /** @param {object} part  the Part 2 chapter */
  constructor(part) {
    this.p = part;
    this.built = false;
    this.cfg = fireRideConfig();
    this.stage = null; // 'ride' | 'boss' | 'element' | null
    this.save = null; // the checkpoint's saved items { keys, taken, opened } and the ammo then
    this.stats = { respawns: 0, chests: 0, keysFound: 0, drops: 0, revives: 0, gemsFound: 0 };
    this.time = 0;
  }

  get centre() {
    return new THREE.Vector3(...A.at);
  }

  /** Everything the level is made of (once; the first time it is entered). */
  async build() {
    if (this.built) return;
    if (this.building) return this.building;
    this.building = this.#build();
    await this.building;
    this.built = true;
    this.building = null;
  }

  async #build() {
    const p = this.p;
    const assets = p.assets ?? {};
    const cfg = this.cfg;
    const keep = p.rc;
    setRideConfig(cfg);
    setRideModelConfig(cfg);
    this.world = new RideWorld();
    this.parts = await loadRide(p.scene, this.world, assets);
    this.ride = new Ride({ parts: this.parts, world: this.world, horse: p.horse, hero: p.hero, sound: p.sound, cam: p.cam, ui: p.ui });
    setRideConfig(keep);
    setRideModelConfig(keep);
    const track = this.world.track;
    const root = this.parts.root;
    this.fx = new FireFx(p.scene);
    this.scrap = new BoneShatter(p.scene, this.world);
    await this.scrap.ready;
    this.scrap.model.userData.bones.material.color.setHex(0xc89040); // (brass parts)
    this.scrap.model.userData.bones.material.emissive?.setHex(0x2a1404);
    this.#decor(root, track);
    // Items: cog keys, chests, elixirs along the road.
    this.items = new Items(root, {
      sound: p.sound,
      onCollect: (type, e, n) => this.#gain(type, n, e),
      onNeedKeys: (cost) => p.ui.toast(FD.needs(cost)),
      onKeys: () => this.#hud(true),
      onChest: (e) => this.#chestPopup(e),
    });
    let n = 0;
    for (const [s, lat, y] of F.keys) await this.items.add('cogKey', trackPoint(track, s, lat, y).pos, { id: `key${n++}` });
    n = 0;
    for (const c of F.chests) {
      const tp = trackPoint(track, c.s, c.lat);
      const e = await this.items.add(c.size === 'big' ? 'chestBig' : 'chest', tp.pos, { id: `chest${n++}`, contents: c.contents, popup: c.popup, cost: c.cost });
      this.items.face(e, tp.heading + (c.lat < 0 ? -Math.PI / 2 : Math.PI / 2)); // (its front toward the road)
    }
    n = 0;
    for (const x of F.elixirs) await this.items.add(x.type, trackPoint(track, x.s, x.lat).pos, { id: `elixir${n++}` });
    // Gems for the Batarang: `fireGemCount` spread along the whole road (about 1 every 40, on the safe line), on the
    // steam-jump landings (the belt deck, the upper rail) and in the plaza — so it never runs dry.
    n = 0;
    const g0 = 30;
    const g1 = this.cfg.door.s - 40;
    for (let i = 0; i < F.fireGemCount; i++) {
      const s0 = g0 + ((g1 - g0) * i) / (F.fireGemCount - 1);
      if (Math.abs(s0 - F.gate.s) < 6) continue;
      await this.items.add('gem', trackPoint(track, s0, i % 2 ? 1.6 : -1.6).pos, { id: `gem${n++}` });
    }
    for (const [s0, lat, y] of F.gemLandings) await this.items.add('gem', trackPoint(track, s0, lat, y).pos, { id: `gem${n++}` });
    for (const [s0, lat] of F.plazaGems) await this.items.add('gem', trackPoint(track, s0, lat).pos, { id: `gem${n++}` });
    this.#gate(root, track);
    // The robots.
    this.foes = new Foes({
      scene: root, world: this.world, horse: p.horse, hero: p.hero, fx: this.fx, sound: p.sound, track, scrap: this.scrap, assets,
      hitHero: (dmg, from, source) => this.#hitHero(dmg, from, { source, knockback: false }),
      onDrop: (pos) => this.#drop(pos),
      targetPos: () => this.#targetPos(),
    });
    await this.foes.build();
    // The plaza of the Furnace Guardian (far from the road), its guardian and the Fire Element.
    const C = this.centre;
    this.arena = await buildArena();
    this.arena.position.copy(C);
    this.arena.visible = false;
    p.scene.add(this.arena);
    this.arenaItems = new Items(p.scene, {
      sound: p.sound,
      maxReach: CONFIG.part2.items.walkPickupRadius, // (on foot in the plaza: a pickup is taken only by walking into it)
      onCollect: (type, e, k) => this.#gain(type, k, e),
    });
    p.world.addFloor(C.x, C.z, A.radius, A.wall);
    for (const q of this.arena.userData.pillars) p.world.cylinders.push({ x: C.x + q.x, z: C.z + q.z, r: q.r, bottom: q.bottom, top: q.top });
    this.guardian = new Guardian({
      scene: p.scene, world: p.world, hero: p.hero, fx: this.fx, sound: p.sound, assets,
      hitHero: (dmg, from, opts) => this.#hitHero(dmg, from, opts, true),
      call: (kind) => this.#tickCall(kind),
    });
    await this.guardian.build();
    this.guardian.group.visible = false;
    p.scene.add(this.guardian.group);
    this.guardian.centre.copy(C);
    this.guardian.pillars = this.arena.userData.pillars;
    this.guardian.onNotice = () => this.#sealArena();
    this.guardian.onMark = (i) => this.#gemRing(i);
    this.guardian.onShake = (k) => p.cam.shake?.(k, 0.3);
    this.guardian.onDefeat = () => this.#defeated();
    this.#element();
    // The hero's arsenal: the Batarang (gems) and, with the Fire Element, Fire Blast.
    this.arsenal = new Arsenal({
      scene: p.scene, hero: p.hero, horse: p.horse, fx: this.fx, sound: p.sound, cam: p.cam, ui: p.ui,
      targets: () => this.targets(),
      onEvent: (name, d) => {
        if (name === 'blocked' && d.why === 'gems') p.ui.toast(FD.ammoOut);
        if (name === 'blocked' && d.why === 'keys') p.ui.toast(FD.weapons.needKey);
        if (name === 'blocked' && d.why === 'gears') p.ui.toast(FD.weapons.needGears(CONFIG.part2.fire.weapons.gearWheel.gears));
      },
    });
    await this.arsenal.ready;
    this.guardian.getWheelThreat = () => this.arsenal?.wheel ?? null;
    this.arsenal.fireUnlocked = p.elements.includes('fire');
    this.arsenal.keys = () => this.items.keys;
    this.arsenal.spendKey = (k) => {
      this.items.keys = Math.max(0, this.items.keys - k);
      this.#hud(true);
    };
    this.ride.onGear = () => {
      p.gears = (p.gears ?? 0) + 1;
      this.arsenal.gearStock++; // (each brass gear also feeds the Gear Wheel)
      p.gearProgress(true);
    };
    this.ride.onFinish = () => p.travel(() => this.enterBoss());
  }

  /** Live foes and the Guardian: what a throw can aim at. */
  targets() {
    const out = this.foes?.targets ?? [];
    if (this.guardian?.alive && this.guardian.model?.visible && this.guardian.position) return [...out, this.guardian];
    return out;
  }

  // --- the furnace city's look ---------------------------------------------------------

  /** Glowing furnace windows, chimneys with orange smoke, lava-orange trim along the road. */
  #decor(root, track) {
    const group = new THREE.Group();
    group.name = 'furnaceDecor';
    const end = this.cfg.door.s;
    const glowMat = new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const windows = [];
    const chimneys = [];
    for (let s = 24, i = 0; s < end - 10; s += 22, i++) {
      const side = i % 2 ? 1 : -1;
      windows.push({ p: trackPoint(track, s, side * 11.5, 1.8 + (i % 3) * 1.1), side });
      if (i % 2 === 0) chimneys.push(trackPoint(track, s + 11, -side * 12.5, 0));
    }
    const wm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.5), glowMat, windows.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    windows.forEach((w, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.p.heading + (w.side > 0 ? -Math.PI / 2 : Math.PI / 2));
      m.compose(w.p.pos, q, new THREE.Vector3(1, 1, 1));
      wm.setMatrixAt(i, m);
    });
    wm.frustumCulled = false;
    group.add(wm);
    // Chimneys: dark stacks with a glowing rim, and smoke rising from them.
    const stackMat = new THREE.MeshLambertMaterial({ color: 0x2c211c });
    const rimMat = new THREE.MeshBasicMaterial({ color: F.accent2 });
    const stacks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.25, 12, 8), stackMat, chimneys.length);
    const rims = new THREE.InstancedMesh(new THREE.TorusGeometry(0.95, 0.14, 5, 10).rotateX(Math.PI / 2), rimMat, chimneys.length);
    chimneys.forEach((c, i) => {
      stacks.setMatrixAt(i, m.makeTranslation(c.pos.x, 6, c.pos.z));
      rims.setMatrixAt(i, m.makeTranslation(c.pos.x, 12, c.pos.z));
    });
    stacks.frustumCulled = rims.frustumCulled = false;
    group.add(stacks, rims);
    const SM = 5;
    this.smoke = { mesh: new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x6a4a3c, transparent: true, opacity: 0.3, depthWrite: false }), chimneys.length * SM), chimneys, per: SM };
    this.smoke.mesh.frustumCulled = false;
    group.add(this.smoke.mesh);
    // Lava-orange trim along both edges of the road.
    const strip = (lat) => {
      const pos = [];
      const idx = [];
      const n = Math.ceil(end / 3);
      for (let i = 0; i <= n; i++) {
        const s = (end * i) / n;
        for (const l of [lat, lat + Math.sign(lat) * 0.38]) pos.push(...trackPoint(track, s, l, 0.05).pos.toArray());
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    };
    this.trimMat = new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(strip(this.cfg.wall.offset - 0.9), this.trimMat), new THREE.Mesh(strip(-this.cfg.wall.offset + 0.9), this.trimMat));
    // Braziers in the plaza (two instanced meshes).
    this.braziers = [];
    const pl = F.plaza;
    const bowls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.4, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x5a3a24 }), pl.braziers);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 0.9, 6), stackMat, pl.braziers);
    bowls.frustumCulled = posts.frustumCulled = false;
    for (let i = 0; i < pl.braziers; i++) {
      const s = pl.from + ((pl.to - pl.from) * (i + 0.5)) / pl.braziers;
      const tp = trackPoint(track, s, i % 2 ? 6.4 : -6.4);
      bowls.setMatrixAt(i, m.makeTranslation(tp.pos.x, 0.9, tp.pos.z));
      posts.setMatrixAt(i, m.makeTranslation(tp.pos.x, 0.45, tp.pos.z));
      this.braziers.push(tp.pos.clone().setY(1.3));
    }
    group.add(bowls, posts);
    root.add(group);
    this.decor = { group, glowMat };
  }

  #animateDecor(dt) {
    this.time += dt;
    const t = this.time;
    this.decor.glowMat.opacity = 0.7 + 0.15 * Math.sin(t * 5.3) + 0.08 * Math.sin(t * 11.1);
    this.trimMat.opacity = 0.55 + 0.15 * Math.sin(t * 2.3);
    const sm = this.smoke;
    const m = new THREE.Matrix4();
    let n = 0;
    sm.chimneys.forEach((c, ci) => {
      for (let k = 0; k < sm.per; k++) {
        const age = ((t * 0.22 + k / sm.per + ci * 0.37) % 1);
        const s = 0.9 + age * 2.6;
        m.makeScale(s, s, s).setPosition(c.pos.x + age * 4, 12.5 + age * 11, c.pos.z + age * 1.5 + Math.sin(t + ci) * 0.4);
        sm.mesh.setMatrixAt(n++, m);
      }
    });
    sm.mesh.instanceMatrix.needsUpdate = true;
    if (Math.random() < dt * 8) for (const b of this.braziers) if (Math.random() < 0.4) this.fx.flame(b, 0.5);
  }

  // --- going in and out ----------------------------------------------------------------

  /** Called by the chapter when the Fire ride starts (`fresh`: from the beginning). */
  onEnterRide({ fresh = true } = {}) {
    const p = this.p;
    this.stage = 'ride';
    this.arena.visible = false;
    this.guardian.group.visible = false;
    this.guardian.hide();
    this.cinematicDone = false;
    this.arsenal.levelOn = true; // (Cog Shot and Gear Wheel are his for the level; Fire Blast and the Shield are not until he earns them)
    if (fresh) {
      this.arsenal.shieldUnlocked = false; // (the chests are shut again)
      this.items.restore(null);
      this.items.keys = 0;
      this.arsenal.ammo = Math.max(this.arsenal.ammo, F.startAmmo);
      this.arsenal.gearStock = 0;
      this.#setGate(false, true);
      this.foes.reset(0);
      this.save = { items: this.items.snapshot(), s: 0, gate: false };
    }
    this.arsenal.clear();
    this.#tint(true);
    p.ui.setCogKeys?.(this.items.keys, true);
    p.ui.toast(FD.start);
  }

  /** The Shield found (or taken away again by the debug menu). */
  setShieldUnlocked(on) {
    if (this.arsenal) this.arsenal.shieldUnlocked = !!on;
  }

  /** The Fire Element his (or not): Fire Blast. */
  setFireUnlocked(on) {
    if (this.arsenal) this.arsenal.fireUnlocked = !!on;
  }

  /** AJ is down: whatever he had in flight stops. */
  onHeroDown() {
    if (!this.arsenal) return;
    this.arsenal.clear();
    this.arsenal.pending = null;
  }

  /** The fog and the lamps warm toward the furnace's red-orange. */
  #tint(on) {
    const p = this.p;
    if (on) {
      const ember = new THREE.Color(F.ember);
      p.scene.fog.color.lerp(ember, F.fogMix);
      if (p.scene.background?.isColor) p.scene.background.copy(p.scene.fog.color);
      for (const l of p.rig.points) l.color.setHex(F.lightColor);
    } else applyLook(); // (the look's own colours back)
  }

  /** Out of the level (to the courtyard, Part 1, a stub): its models and tints put away. */
  leave() {
    if (!this.built) return;
    this.stage = null;
    this.arsenal.levelOn = false;
    this.ride.stop();
    this.parts.root.visible = false;
    this.arena.visible = false;
    this.guardian.group.visible = false;
    this.guardian.hide();
    this.arsenal.clear();
    this.foes.clear();
    this.arenaItems.clear();
    this.#tint(false);
    this.p.ui.setCogKeys?.(0, false);
  }

  /** A new game: nothing carried over. */
  newGame() {
    if (!this.built) return;
    this.arsenal.ammo = F.startAmmo;
    this.arsenal.fireUnlocked = false;
    this.arsenal.shieldUnlocked = false;
    this.items.restore(null);
    this.items.keys = 0;
    this.save = null;
  }

  // --- what the player gets --------------------------------------------------------------

  /** An item taken (pickup or out of a chest): its effect and its message. */
  #gain(type, n = 1, entry = null) {
    const p = this.p;
    const T = CONFIG.part2.items.types[type];
    const got = FD.got[type];
    let msg = typeof got === 'function' ? got(n) : got;
    if (type === 'cogKey') {
      this.items.addKeys(n);
      this.stats.keysFound++;
      p.ui.setCogKeys?.(this.items.keys, true, true);
      // (a little golden cog sparkle, with its own twinkle)
      this.#sparkle(entry ? entry.model.position : p.hero.position, 0xffe58a, 0);
      p.sound?.play('cog_key_sparkle', { position: entry ? entry.model.position : p.hero.position });
    } else if (type === 'elixirHeal') {
      // the GREEN potion: +greenPotionHearts hearts, a chime and a green sparkle on AJ
      p.lives?.setHearts?.(Math.min(p.lives.maxHearts, p.lives.hearts + F.greenPotionHearts));
      msg = got(F.greenPotionHearts);
      this.#sparkle(p.hero.position, 0x6dff8a, 1.0);
      p.sound?.play('gear_reward', { position: p.hero.position, volume: 0.5, pitch: 1.3 });
      this.stats.greenPotions = (this.stats.greenPotions ?? 0) + 1;
    } else if (type === 'elixirEnergy') {
      // the BLUE potion: +bluePotionEnergy of the horse's energy (and its health, if it has one and was hurt), a splash and a blue sparkle on it
      const horse = p.horse;
      const max = CONFIG.energy.horseEnergyMax;
      horse.energy = Math.min(max, (horse.energy ?? max) + F.bluePotionEnergy);
      if (horse.health != null && horse.maxHealth != null) horse.health = horse.maxHealth;
      this.#sparkle(horse.position, 0x6ec6ff, 1.0);
      p.sound?.play('river_splash', { position: horse.position, volume: 0.7 });
      this.stats.bluePotions = (this.stats.bluePotions ?? 0) + 1;
    } else if (type === 'gem') {
      this.arsenal.ammo += n * (entry?.ammo ?? T.ammo); // (capped at `maxBatarangs`; the plaza's three gems give +3 each)
      this.stats.gemsFound += n;
    } else if (type === 'shield') {
      this.arsenal.shieldUnlocked = true;
      this.stats.shieldFound = true;
      p.input.pulseAbility?.('shield');
      p.sound?.play('gear_reward', { position: p.hero.position, volume: 0.6 });
      p.ui.toast(FD.shieldHint);
    } else if (type === 'heartContainer') {
      p.extraHearts = (p.extraHearts ?? 0) + 1;
      p.applyRewards();
      p.lives?.setHearts?.(p.lives.maxHearts);
    } else if (type === 'gearBundle') {
      this.#addGears(T.gears);
    }
    if (entry?.chest) this.stats.chests++;
    if (msg) p.ui.toast(msg);
  }

  /**
   * A foe's blow on AJ: the Shield stops it when it is up and the attack is one it blocks (a perfect block also staggers the
   * Guardian); otherwise it goes to the chapter's damage.
   */
  #hitHero(dmg, from, opts, fromGuardian = false) {
    const p = this.p;
    const kind = this.arsenal?.shieldBlock(from, opts?.source);
    if (kind) {
      if (kind === 'perfect' && fromGuardian && this.guardian?.alive) this.guardian.stagger(F.shield.staggerTime);
      return false;
    }
    return p.damageHero?.(dmg, from.x, from.z, opts);
  }

  /** A small coloured sparkle on a body (AJ or the horse): motes rising round it. */
  #sparkle(at, color, up) {
    const S = F.sparkle;
    this.fx.burst(new THREE.Vector3(at.x, at.y + up, at.z), S.count, { speed: S.speed, life: S.life, size: S.size, color, up: 2.2 });
  }

  /** A gear bundle: gears at once on the level's counter (capped at its total) and in the Gear Wheel's stock. */
  #addGears(n) {
    const p = this.p;
    const r = this.ride;
    const add = Math.min(n, Math.max(0, r.total - r.count));
    r.count += add;
    p.gears = (p.gears ?? 0) + add;
    this.arsenal.gearStock += n;
    p.gearProgress(true);
  }

  /** The reward's text, as a popup (a small banner) when a chest has opened. */
  #chestPopup(e) {
    const T = FD.chest;
    const c = (e.contents instanceof Array ? e.contents : [e.contents])[0];
    const text = e.popup === 'elixirs' ? T.elixirs : e.popup === 'gems' ? T.gems(c.n) : e.popup === 'heart' ? T.heart : e.popup === 'shield' ? T.shield : T.gears(CONFIG.part2.items.types.gearBundle.gears);
    this.p.ui.banner?.(text, 2600, { small: true });
    this.stats.chestPopups = [...(this.stats.chestPopups ?? []), text];
  }

  /** Where the rider is (the horse, or AJ on foot): what the robots go for and the pickups are measured from. */
  #targetPos() {
    const p = this.p;
    return p.horse.mounted ? p.horse.position : p.hero.position;
  }

  #riderPoint() {
    const p = this.p;
    return p.horse.mounted ? p.horse.collectPoint : p.hero.position.clone().setY(p.hero.position.y + 0.9);
  }

  // --- the cog gate (the end of section 1: 2 cog keys) ------------------------------------------------

  #gate(root, track) {
    const G = F.gate;
    const group = new THREE.Group();
    group.name = 'cogGate';
    const tp = trackPoint(track, G.s, 0);
    group.position.copy(tp.pos);
    group.rotation.y = tp.heading;
    const brass = new THREE.MeshLambertMaterial({ color: G.color, emissive: 0x2a1204 });
    const barMat = new THREE.MeshLambertMaterial({ color: G.color, emissive: 0x2a1204 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, G.height + 1, 10), brass);
      post.position.set(sx * (G.width / 2), (G.height + 1) / 2, 0);
      group.add(post);
    }
    const bars = new THREE.Group();
    const count = 11;
    for (let i = 0; i < count; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, G.height, 0.35), barMat);
      bar.position.set(-G.width / 2 + 0.8 + ((G.width - 1.6) * i) / (count - 1), G.height / 2, 0);
      bars.add(bar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(G.width, 0.5, 0.5), brass);
    beam.position.y = G.height * 0.55;
    bars.add(beam);
    group.add(bars);
    const cog = new THREE.Mesh(gearGeometry(2.4, 12, 0.5), new THREE.MeshLambertMaterial({ color: 0xf0c048, emissive: 0x6a4a10 }));
    cog.position.y = G.height + 2.6;
    group.add(cog);
    root.add(group);
    this.world.gates = [{ s: G.s, open: false }];
    this.gate = { group, bars, cog, barMat, k: 0, goal: 0, red: 0, hintAt: -Infinity };
  }

  /** Open or shut the cog gate (instantly, or sliding its bars into the ground). */
  #setGate(open, instant = false) {
    const g = this.gate;
    if (!g) return;
    this.world.gates[0].open = open;
    g.goal = open ? 1 : 0;
    if (instant) g.k = g.goal;
    this.gateOpen = open;
  }

  #updateGate(dt) {
    const g = this.gate;
    const G = F.gate;
    if (!g) return;
    g.k += Math.sign(g.goal - g.k) * Math.min(Math.abs(g.goal - g.k), dt / G.openTime);
    g.bars.position.y = -(G.height + 0.6) * g.k;
    g.cog.rotation.z += (g.goal ? 3 : 0.4) * dt;
    g.red = Math.max(0, g.red - dt);
    g.barMat.emissive.setHex(g.red > 0 ? G.red : 0x2a1204).multiplyScalar(g.red > 0 ? Math.min(1, g.red) : 1);
  }

  /** The rider at the gate: with the keys it opens (and takes them); without, it says what it needs. */
  #gateReach(dt) {
    const G = F.gate;
    const g = this.gate;
    if (!g || this.gateOpen) return;
    const pt = this.#targetPos();
    const n = this.world.track.nearest(pt.x, pt.z, 20);
    if (!n || Math.abs(n.s - G.s) > G.reach || n.s > G.s + 1) return;
    const p = this.p;
    if (this.items.keys >= G.keys) {
      this.items.keys -= G.keys;
      this.#setGate(true);
      this.#hud(true);
      p.ui.toast(FD.gate.open);
      p.sound?.play('gate_open', { position: g.group.position });
    } else if (this.time - g.hintAt > 2) {
      g.hintAt = this.time;
      g.red = 1;
      p.ui.toast(FD.gate.locked(G.keys));
      p.sound?.play('chest_locked', { position: g.group.position });
    }
    void dt;
  }

  #hud(pulse = false) {
    this.p.ui.setCogKeys?.(this.items.keys, true, pulse);
  }

  /** A foe drops a gem where it fell. */
  #drop(pos) {
    this.stats.drops++;
    const items = this.stage === 'boss' ? this.arenaItems : this.items;
    items.add('gem', pos.clone().setY(0), { id: `drop${this.stats.drops}`, temp: true });
  }

  /** A ring of gems round the plaza when the Guardian drops below one of the marks. */
  #gemRing(i) {
    const G = A.gems;
    const C = this.centre;
    for (let k = 0; k < G.count; k++) {
      const a = (k / G.count) * Math.PI * 2 + i * 0.4;
      this.arenaItems.add('gem', new THREE.Vector3(C.x + Math.sin(a) * G.ring, 0, C.z + Math.cos(a) * G.ring), { id: `ring${i}_${k}`, temp: true, ammo: G.ammo });
    }
    this.p.ui.toast(FD.got.gem(G.count));
  }

  // --- ?debug ---------------------------------------------------------------------------------

  giveKeys(n) {
    this.items.addKeys(n);
    this.p.ui.setCogKeys?.(this.items.keys, true, true);
  }

  /** "Fire plaza chests": on the horse at the plaza's checkpoint with a couple of cog keys. */
  debugPlaza() {
    const p = this.p;
    this.enterRide({ fresh: true });
    const D = F.debug;
    p.horse.lastCheckpoint = D.plazaCheckpoint;
    p.horse.checkpoints.forEach((cp, i) => (cp.reached = i <= D.plazaCheckpoint));
    p.horse.respawnAtCheckpoint(p.hero);
    this.foes.reset(this.cfg.checkpoints[D.plazaCheckpoint]);
    this.items.keys = D.plazaKeys;
    this.#setGate(true, true);
    this.#debugKit();
    this.save = { items: this.items.snapshot(), s: this.cfg.checkpoints[D.plazaCheckpoint], gate: true };
    p.behind(p.horse.heading);
    p.ui.setCogKeys?.(this.items.keys, true);
  }

  /** "Fire boss": straight into the plaza with gems for the Batarang. */
  debugBoss() {
    this.enterBoss({ debug: true });
    this.#debugKit();
    this.arsenal.shieldUnlocked = true; // (the boss is fought with the Shield: the debug jump skips its chest)
  }

  /** The ?debug kits: gems for the Batarang and brass gears for the Gear Wheel (counted on the level's counter too). */
  #debugKit() {
    const D = F.debug;
    this.arsenal.ammo = Math.max(this.arsenal.ammo, D.bossAmmo);
    this.arsenal.gearStock = Math.max(this.arsenal.gearStock, D.startGears);
  }

  /** "Fire level (start)": the start with 3 cog keys, 20 gems and 30 brass gears. */
  debugStart() {
    const D = F.debug;
    this.items.keys = D.startKeys;
    this.arsenal.ammo = Math.max(this.arsenal.ammo, D.startGems);
    const stock = this.arsenal.gearStock;
    this.#addGears(D.startGears);
    this.arsenal.gearStock = stock + D.startGears;
    this.#hud(true);
  }

  // --- the checkpoint and the respawn ------------------------------------------------------

  /** A checkpoint reached: the opened chests, keys and taken pickups are saved with it. */
  checkpoint(i) {
    this.save = { items: this.items.snapshot(), s: this.cfg.checkpoints[i] ?? 0, gate: !!this.gateOpen };
  }

  /** Died in the ride: back at the last checkpoint with what it had saved (chests closed again, keys refunded). */
  respawn() {
    const p = this.p;
    this.stats.respawns++;
    p.horse.respawnAtCheckpoint(p.hero);
    this.items.restore(this.save?.items ?? null);
    this.#setGate(!!this.save?.gate, true);
    this.foes.reset(this.save?.s ?? 0);
    this.arsenal.clear();
    this.arsenal.ammo = Math.max(this.arsenal.ammo, F.startAmmo);
    this.fx.list.length = 0;
    this.#hud();
  }

  // --- the Furnace Guardian --------------------------------------------------------------

  /** The level's start (the chapter's enterRide('fire') has put the horse there). */
  enterRide(opts) {
    this.p.enterRide('fire');
    void opts;
  }

  /** The furnace gate: into the sealed plaza, on foot, the horse waiting by the entrance. */
  enterBoss({ debug = false } = {}) {
    const p = this.p;
    const { hero, horse } = p;
    if (!debug) this.ride.stop();
    this.stage = 'boss';
    this.arsenal.levelOn = true; // (also when "Fire boss" jumps straight in)
    // every protection flag cleared (a leftover from the ride, a respawn, a hit), then at most `entryProtection` s of it
    hero.resetStatus();
    hero.protectFor(A.entryProtection);
    // a fresh fight: the Guardian is up, so no pedestal and no Fire Element scene until he falls
    this.bossDown = false;
    this.pedestal = null;
    this.sceneStarted = false;
    this.orb.taken = false;
    this.orb.group.visible = false;
    p.leaveRide({ keepFire: true });
    this.parts.root.visible = false;
    this.foes.clear();
    p.gearhaven.visible = false;
    this.arena.visible = true;
    this.guardian.group.visible = true;
    p.at = 'fireBoss';
    horse.scripted = false;
    horse.hold = false;
    const C = this.centre;
    const spawn = new THREE.Vector3(C.x + A.spawn[0], 0, C.z + A.spawn[1]);
    p.onFoot(spawn, Math.PI);
    p.horseAt(new THREE.Vector3(C.x + A.horse[0], 0, C.z + A.horse[1]), Math.PI);
    horse.mode = 'idle';
    horse.speed = 0;
    this.arenaItems.clear();
    this.guardian.centre.copy(C);
    this.guardian.reset();
    this.barrier = { state: 'open', k: 0 };
    this.arena.userData.barrier.material.opacity = 0;
    this.arsenal.clear();
    // the Batarangs kept from the ride, topped up to at least `ammoMin` and held to at most `ammoMax`
    this.arsenal.ammo = Math.min(A.ammoMax, Math.max(A.ammoMin, this.arsenal.ammo));
    this.fx.list.length = 0;
    p.tick.place(new THREE.Vector3(C.x - A.wall * 0.62, 5.5, C.z + A.wall * 0.55), 0);
    p.tick.target = new THREE.Vector3(C.x - A.wall * 0.62, 5.5, C.z + A.wall * 0.55);
    p.tick.lookAt = null;
    p.behind(Math.PI);
    if (!p.state.is(p.STATES.PLAY)) p.state.set(p.STATES.PLAY);
    p.ui.setCogKeys?.(this.items.keys, true);
    p.ui.setGears?.(0, 0, false);
    p.ui.toast(FD.questBoss);
    this.save = { ...(this.save ?? { items: this.items.snapshot(), s: 0 }), boss: true };
  }

  /** The Guardian notices AJ: the steam barrier closes the entrance behind him. */
  #sealArena() {
    this.barrier = { state: 'closing', k: 0 };
    this.p.ui.toast(FD.gateSealed);
    this.p.sound?.play('steam_barrier_close');
  }

  #defeated() {
    this.bossDown = true;
    this.barrier = { state: 'opening', k: 0 };
    this.p.ui.toast(FD.gateOpen);
    this.p.sound?.play('steam_barrier_open');
    this.pedestal = { t: 0 };
    this.orb.group.visible = true;
    this.orb.group.position.set(this.centre.x, -A.radius * 0.0 - 1.4, this.centre.z);
    this.p.sound?.play('element_power_up');
  }

  /** Died in the plaza: revived inside — full hearts (the respawn gave them), 3 s of protection, the Guardian backs off and keeps half of what he lost. */
  reviveInArena() {
    const p = this.p;
    this.stats.revives++;
    const C = this.centre;
    p.onFoot(new THREE.Vector3(C.x + A.spawn[0] * 0.7, 0, C.z + A.spawn[1] * 0.7), Math.PI);
    p.hero.resetStatus?.();
    p.hero.protectFor?.(A.protection);
    this.arsenal.clear();
    this.arsenal.ammo = Math.max(this.arsenal.ammo, A.reviveAmmo);
    this.guardian.reviveRecover(A.reviveRecover);
    p.behind(Math.PI);
  }

  /** The Guardian's warnings: Tick calls out the attack with small chirps. */
  #tickCall(kind) {
    const p = this.p;
    p.ui.toast(FD.tick[kind]);
    for (let i = 0; i < 3; i++) p.sound?.play('tick_beep', { position: p.tick.position, delay: i * 0.12, pitch: 1.1 + i * 0.15 });
    p.tick.nervous?.();
  }

  // --- the Fire Element --------------------------------------------------------------------

  #element() {
    const O = E.orb;
    const group = new THREE.Group();
    group.name = 'fireElement';
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(E.pedestal.radius, E.pedestal.radius * 1.3, E.pedestal.height, 14), new THREE.MeshLambertMaterial({ color: 0x5a3a28, emissive: 0x240c04 }));
    ped.position.y = E.pedestal.height / 2;
    const orbHolder = new THREE.Group();
    orbHolder.position.y = E.pedestal.height + O.height;
    const core = new THREE.Mesh(new THREE.SphereGeometry(O.radius * 0.7, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    const body = new THREE.Mesh(new THREE.SphereGeometry(O.radius, 14, 10), new THREE.MeshBasicMaterial({ color: F.accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(O.radius * O.glow, 14, 10), new THREE.MeshBasicMaterial({ color: F.accent2, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    // The swirling flame: embers circling the orb (one InstancedMesh).
    const swirl = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: F.accent2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), O.particles);
    swirl.frustumCulled = false;
    orbHolder.add(core, body, halo, swirl);
    group.add(ped, orbHolder);
    group.visible = false;
    this.p.scene.add(group);
    this.orb = { group, ped, holder: orbHolder, core, body, halo, swirl, t: 0, taken: false };
  }

  #animateOrb(dt) {
    const o = this.orb;
    if (!o.group.visible) return;
    o.t += dt;
    const O = E.orb;
    const m = new THREE.Matrix4();
    for (let i = 0; i < O.particles; i++) {
      const a = o.t * O.swirl + (i / O.particles) * Math.PI * 2 * 3;
      const k = i / O.particles;
      const r = O.radius * (1.1 + 0.5 * Math.sin(o.t * 2 + i));
      const y = (k - 0.5) * O.radius * 2.6 + Math.sin(o.t * 3 + i) * 0.1;
      const s = 0.5 + 0.6 * (1 - Math.abs(k - 0.5) * 1.4);
      m.makeScale(s, s * 1.5, s).setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
      o.swirl.setMatrixAt(i, m);
    }
    o.swirl.instanceMatrix.needsUpdate = true;
    o.halo.scale.setScalar(1 + 0.08 * Math.sin(o.t * 4));
    if (this.pedestal) {
      // (rising out of the floor)
      this.pedestal.t += dt;
      const k = Math.min(1, this.pedestal.t / A.pedestalTime);
      o.group.position.y = -E.pedestal.height * 1.6 * (1 - k * k * (3 - 2 * k)) + 0;
      if (k >= 1) this.pedestal.done = true;
    }
  }

  /** The Fire Element is ready to be taken: the pedestal is up and AJ is within reach of it. */
  get elementReady() {
    return this.bossDown && !!this.pedestal?.done && !this.orb.taken;
  }

  elementReach() {
    const C = this.centre;
    return Math.hypot(this.p.hero.position.x - C.x, this.p.hero.position.z - C.z) < E.pedestal.radius + 2.2;
  }

  // --- per frame ----------------------------------------------------------------------------

  /** Outside the level (the courtyard, a stub) once Fire Blast is his: just the Arsenal and its flames. */
  updateIdle(dt) {
    if (!this.built) return;
    this.fx.update(dt);
    this.scrap.update(dt);
    this.arsenal.update(dt);
  }

  /** Ability keys / buttons: the Batarang, the Shield, Fire Blast (once the Fire Element is his) and the cog weapons. */
  useAbility(name) {
    if (!name || !this.arsenal) return;
    this.arsenal.use(name);
  }

  /**
   * Every frame of the level. `playing`: in play (not a cutscene). The chapter has already run the
   * ride (`ride.update` / `after`) or the hero; this runs everything else.
   */
  update(dt, realDt, playing) {
    const p = this.p;
    if (!this.built || !this.stage) return;
    const live = dt > 0;
    this.fx.update(live ? dt : 0);
    this.scrap.update(live ? dt : 0);
    this.arsenal.update(live && playing ? dt : 0);
    this.#animateOrb(live ? dt : 0);
    if (this.stage === 'ride') {
      this.#animateDecor(live ? dt : 0);
      this.items.update(live && playing ? dt : 0, playing ? { pos: this.#riderPoint() } : null);
      this.foes.update(live ? dt : 0, { playing });
      this.#updateGate(live ? dt : 0);
      if (playing && live) {
        this.#gateReach(dt);
        // (on foot at the furnace gate: it opens just the same)
        const door = this.cfg.door;
        if (!p.horse.mounted && !this.ride.finished && this.ride.s >= door.s - door.reach) {
          this.ride.finished = true;
          this.ride.onFinish?.();
        }
      }
    } else if (this.stage === 'boss') {
      this.#boss(dt, playing);
    }
    p.ui.setCogKeys?.(this.items.keys, true);
  }

  #boss(dt, playing) {
    const p = this.p;
    const g = this.guardian;
    this.arenaItems.update(dt > 0 && playing ? dt : 0, playing ? { pos: p.hero.position.clone().setY(p.hero.position.y + 0.9) } : null);
    this.foes.update(0, { playing: false });
    g.update(dt > 0 ? dt : 0, playing);
    // the steam barrier
    const b = this.barrier;
    const bar = this.arena.userData.barrier;
    if (b) {
      if (b.state === 'closing') {
        b.k = Math.min(1, b.k + dt / A.gate.close);
        bar.material.opacity = 0.5 * b.k;
        bar.scale.y = b.k;
        bar.position.y = 4 * b.k;
        if (b.k >= 1) b.state = 'closed';
      } else if (b.state === 'closed') {
        bar.material.opacity = 0.42 + 0.08 * Math.sin(this.time * 9);
        this.time += dt;
        const gp = this.arena.userData.gate.position;
        if (Math.random() < dt * 40) this.fx.emit(new THREE.Vector3(this.centre.x + (Math.random() - 0.5) * A.gate.width, 0.3, this.centre.z + gp.z), new THREE.Vector3(0, 3 + Math.random() * 2, 0), { life: 1.1, size: 0.6, color: 0xffe2c4, g: -0.3 });
        // (the entrance is shut: nobody gets out)
        const C = this.centre;
        const z = p.hero.position.z - C.z;
        if (z > A.wall - 1.4) p.hero.position.z = C.z + A.wall - 1.4;
      } else if (b.state === 'opening') {
        b.k = Math.min(1, b.k + dt / A.openTime);
        bar.material.opacity = 0.5 * (1 - b.k);
        if (b.k >= 1) b.state = 'open';
      }
    }
    // The plaza is the way on: nobody leaves it (or reaches the pedestal) past the Guardian while he stands.
    if (!this.bossDown && playing) {
      const C = this.centre;
      const dx = p.hero.position.x - C.x;
      const dz = p.hero.position.z - C.z;
      const d = Math.hypot(dx, dz);
      const max = A.wall - A.stayIn;
      if (d > max) (p.hero.position.x = C.x + (dx / d) * max), (p.hero.position.z = C.z + (dz / d) * max);
    }
    // Tick keeps to the arena edge and watches.
    if (playing && p.tick.target) p.tick.lookAt = p.hero.position.clone();
    // the Fire Element: reach it → the scene
    if (playing && this.elementReady && this.elementReach() && !this.sceneStarted) this.startElementScene();
    if (this.elementReady && this.stage === 'boss') p.questOverride = FD.questElement;
  }

  // --- the element scene ----------------------------------------------------------------------

  /** AJ takes the Fire Element (also the "Fire boss" debug's shortcut once the Guardian is down). */
  async startElementScene() {
    if (this.sceneStarted || !this.bossDown) return; // (never before the Furnace Guardian is defeated)
    this.sceneStarted = true;
    const p = this.p;
    const { hero, cinematic, state, STATES } = p;
    const C = this.centre;
    const SH = E.shots;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    this.stage = 'element';
    p.at = 'fireElement';
    if (!state.is(STATES.CUTSCENE)) state.set(STATES.CUTSCENE);
    const orbAt = () => this.orb.group.position.clone().setY(this.orb.group.position.y + E.pedestal.height + E.orb.height);
    const spot = v(C.x, 0, C.z + 3.0);
    const hold = { pos: hero.position.clone(), yaw: Math.PI };
    p.ajSpot = hold;
    let a0 = 0;
    this.sceneT = 0;
    const L = FD.scene;
    const cameo = this.#cameo();
    const steps = [
      { camera: { pos: v(C.x - 3.4, 1.7, C.z + 5.6), look: orbAt(), duration: SH.orb.duration, fov: 55 } },
      { call: () => p.tween((t) => { hold.pos.lerpVectors(hold.from ?? (hold.from = hold.pos.clone()), spot, Math.min(1, t / 1.2)); hold.yaw = Math.PI; return t >= 1.2; }) },
      // the camera circles while the flame flows into his hand
      { call: () => { a0 = Math.atan2(-3.4, 5.6); this.sceneT = 0; this.sound('element_collect'); } },
      { camera: { follow: true, pos: () => { const a = a0 + (this.sceneT / SH.circle.duration) * Math.PI * 2 * SH.circle.turns; return v(C.x + Math.sin(a) * SH.circle.dist, SH.circle.up, C.z + Math.cos(a) * SH.circle.dist); }, look: () => orbAt().setY(SH.circle.look), duration: 0.1, wait: false } },
      { call: () => this.#absorb(SH.circle.duration) },
      { wait: SH.circle.duration },
      { say: 'tick', text: L.one },
      { say: 'aj', text: L.others },
      { say: 'tick', text: L.taken },
      // the hooded figure on the distant tower
      { call: () => { cameo.show(); this.sound('eerie'); } },
      { camera: { pos: v(C.x - 5, SH.tower.up + 0.6, C.z + 7), look: () => cameo.head(), duration: SH.tower.duration, fov: 34 } },
      { say: 'tick', text: L.watching },
      { say: 'aj', text: L.amy },
      { say: 'tick', text: L.cannot },
      { call: () => cameo.vanish() },
      { wait: 1.1 },
      { camera: { pos: v(C.x + 2, 2.2, C.z + 6.5), look: v(C.x, 1.5, C.z), duration: 1.0, fov: null } },
      { call: () => this.#finishElement(), essential: true },
    ];
    await cinematic.play(steps);
    this.#finishElement();
  }

  sound(name) {
    this.p.sound?.play(name);
  }

  /** The flame flows from the orb into his hand; his eyes flash orange. */
  #absorb(duration) {
    const p = this.p;
    const { hero } = p;
    const o = this.orb;
    const from = o.holder.position.clone();
    const base = o.group.position.clone();
    const flash = E.scene;
    this.eyes ??= this.#makeEyes();
    p.tween((t, dt) => {
      this.sceneT = t;
      const k = Math.min(1, t / flash.pull);
      const hand = hero.handPosition();
      const world = base.clone().add(from);
      const at = world.lerp(hand, k * k * (3 - 2 * k));
      o.group.position.copy(at.clone().sub(from)); // (the whole orb moves to his hand)
      o.holder.scale.setScalar(1 - k * 0.85);
      o.ped.visible = true;
      if (Math.random() < 0.7) this.fx.flame(at, 0.4);
      // eyes
      const e = Math.max(0, (t - flash.pull) / flash.eyes);
      this.eyes.visible = e > 0 && e < 1.2;
      if (this.eyes.visible) this.#placeEyes(1 - Math.abs(e - 0.5) * 2);
      if (k >= 1 && !o.taken) {
        o.taken = true;
        o.holder.visible = false;
        this.fx.burst(hand, 30, { speed: 5, life: 0.8, size: 0.2, up: 3 });
        p.ui.screenFlash?.(0.5);
        hero.glow = 1;
        this.sound('element_power_up');
      }
      void dt;
      return t >= duration;
    });
  }

  #makeEyes() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat));
    g.visible = false;
    this.p.scene.add(g);
    return g;
  }

  #placeEyes(k) {
    const { hero } = this.p;
    const f = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
    const side = new THREE.Vector3(f.z, 0, -f.x);
    const head = hero.position.clone().setY(hero.position.y + CONFIG.heroModel.height * 0.9);
    this.eyes.children.forEach((e, i) => {
      e.position.copy(head).addScaledVector(f, 0.13).addScaledVector(side, (i ? 1 : -1) * 0.045);
      e.scale.setScalar(0.6 + k * 1.8);
    });
    this.eyes.children[0].material.opacity = 0.4 + 0.6 * k;
  }

  /** The hooded figure on the far tower: small, in violet; vanishes in a puff of violet light. */
  #cameo() {
    const C = this.centre;
    const T = E.scene.tower;
    const g = new THREE.Group();
    g.name = 'cameo';
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, T.at[1], 8), new THREE.MeshLambertMaterial({ color: 0x3a2a2c }));
    tower.position.y = T.at[1] / 2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.5, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0x6a4a30 }));
    top.position.y = T.at[1] + 0.3;
    const violet = new THREE.MeshLambertMaterial({ color: 0x6a3fc8, emissive: 0x2a1060 });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), violet);
    robe.position.y = T.at[1] + 0.65 + 0.75;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), violet);
    hood.position.y = T.at[1] + 0.65 + 1.6;
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9a6bff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.y = T.at[1] + 1.8;
    g.add(tower, top, robe, hood, aura);
    g.scale.setScalar(T.scale / 2.4);
    g.position.set(C.x + T.at[0], 0, C.z + T.at[2]);
    g.visible = false;
    this.p.scene.add(g);
    const head = () => new THREE.Vector3(g.position.x, (T.at[1] + 1.2) * g.scale.x, g.position.z);
    const api = {
      show: () => (g.visible = true),
      head,
      vanish: () => {
        const at = head();
        for (let i = 0; i < 40; i++) {
          this.fx.emit(at.clone(), new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), { life: 1.0, size: 0.5, color: i % 2 ? 0x9a6bff : 0xd8c4ff, g: 0 });
        }
        g.visible = false;
        this.cameoGone = true;
      },
      hide: () => (g.visible = false),
    };
    this.cameo = api;
    return api;
  }

  /** The scene is over (also on Skip): the Fire Element is his, Fire Blast unlocked, the banner, then the next place. */
  #finishElement() {
    if (this.elementDone) return;
    this.elementDone = true;
    const p = this.p;
    this.cameo?.hide();
    if (this.eyes) this.eyes.visible = false;
    this.orb.taken = true;
    this.orb.group.visible = false;
    p.hero.glow = 0;
    p.addElement('fire');
    this.arsenal.unlockFire();
    p.ajSpot = null;
    p.ui.banner?.(FD.banner, E.bannerMs, { small: true });
    p.ui.toast(FD.blastUnlocked);
    setTimeout?.(() => p.ui.toast(FD.blastHint), 2400);
    p.sound?.play('gear_reward');
    p.input.pulseAbility?.('fireBlast');
    p.afterFire();
  }
}
