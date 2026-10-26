import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Track } from '../track.js';
import {
  loadGearhavenRideModel, loadRailModel, loadSteamVentModel, loadGearDeckModel, loadHammerModel, loadCogPlatformModel,
  loadConveyorModel, loadGearPickupModel, loadRideFxModels, loadRideDoorModel, loadRideCheckpointModel, loadFactoryDecorModel,
  trackPoint, railHeight,
} from './rideModel.js';
import { loadSawModel, spinGearDecor } from './props.js';
import { lanePull } from './magnet.js';
import { loadClockTowerModel } from './clockTower.js';
import { loadSkylineModel, trailSpots } from './skyline.js';

// The first playable section of Gearhaven (CONFIG.part2.ride): a ride through a brass city on
// the trail / spline system. RideWorld is the world the shared Horse, Hero and FollowCamera use
// while riding it (the same small interface as Part 1's World: a flat street with invisible side
// walls, the low rails as fences in it, the belt deck hanging over it). Ride runs it: rails (land on one —
// riding up its ramp or jumping onto it — and the horse grinds along it with sparks and a steel
// scrape; steer to hop to the next rail; Jump, or its end, to leave), steam vents (launch the
// horse high — the first up onto the belt deck, a conveyor belt hanging wall to wall), swinging hammers, spinning saws, turning cog platforms and conveyor belts (a hit
// staggers the horse; never a heart), brass gears to collect, checkpoints, and the Fire
// Element's door. Its models come from the kits where they load (rideModel.js).

let R = CONFIG.part2.ride; // (the ride in use: a level with its own layout switches it with useRideConfig)
let G = R.grind;
const SND = CONFIG.part2.sound; // the ride's sounds (soundCatalog.js names; 3D where they have a place)
let DA = R.deckAssist;

/** Makes `cfg` (a copy of CONFIG.part2.ride with its own layout) the ride this module builds and runs. */
export function setRideConfig(cfg) {
  R = cfg;
  G = cfg.grind;
  DA = cfg.deckAssist;
}
const HC = CONFIG.horse;
const { clamp, lerp } = THREE.MathUtils;

/** The ride's ground and walls for the shared Horse / Hero / FollowCamera. */
export class RideWorld {
  constructor() {
    this.track = this.activeTrack = new Track(R.points);
    this.tracks = [this.track];
    this.desertTrack = null;
    this.river = null;
    this.cylinders = [];
    this.boxes = [];
    this.beams = [];
    this.foliageSets = [];
    this.cameraMeshes = [];
    this.obstacles = [];
    this.gapWalls = [];
    this.hurdles = [];
    this.layout = { townEndX: -1e9, hazardEndX: -1e9 }; // (no tree-leaping zone here)
    this.decks = R.decks;
    this.fences = R.rails.filter((r) => !r.upper);
    this.gates = []; // closed gates across the street ({ s, open }): solid until opened (the Fire level's cog gate)
    this.wallHit = null;
    this.coyote = null; // { deck, t }: just ridden off a deck's edge — it holds a moment (Ride sets it)
  }

  heightAt() {
    return 0;
  }

  /** The deck over (x, z), if any (`margin`: counting this much past its edges). */
  deckAt(x, z, margin = 0) {
    const n = this.track.nearest(x, z, R.wall.offset + 4 + margin);
    if (!n) return null;
    return this.decks.find((d) => n.s >= d.s[0] - margin && n.s <= d.s[1] + margin && Math.abs(n.lateral - d.lat) <= d.width / 2 + margin) ?? null;
  }

  /**
   * The street, or a deck's top when at or above it (or up to `deckAssist.catch` through it, so a
   * fast fall never steps through): its solid top over the deck, and the landing assist — within
   * `deckAssist.snap` of its edge, or just after riding off it (the coyote time).
   */
  groundAt(x, z, maxY = Infinity) {
    const d = this.deckAt(x, z) ?? this.deckAt(x, z, DA.snap);
    if (d && maxY >= d.top - DA.catch) return { y: d.top, platform: d };
    const c = this.coyote;
    if (c && c.t > 0 && maxY >= c.deck.top - DA.catch && this.deckAt(x, z, DA.coyoteReach) === c.deck) return { y: c.deck.top, platform: c.deck };
    return { y: 0, platform: null };
  }

  isHazard() {
    return false;
  }

  surfaceAt() {
    return 'stone';
  }

  solidsNear() {
    return [];
  }

  laneAt() {
    return { lo: -R.wall.offset, hi: R.wall.offset, k: 0, wall: null };
  }

  safeLateral() {
    return 0;
  }

  gapZone() {
    return null;
  }

  /**
   * The side walls (the horse slides along them: `wallHit`) and the low rails as fences on the
   * street (below their top the horse stays in its lane between them).
   */
  collide(pos, vel, radius) {
    this.wallHit = null;
    const n = this.track.nearest(pos.x, pos.z, R.wall.offset + 6);
    if (!n) return;
    const right = { x: -n.tz, z: n.tx };
    const push = (by) => {
      pos.x += right.x * by;
      pos.z += right.z * by;
      const into = (vel.x * right.x + vel.z * right.z) * Math.sign(by);
      if (into < 0) (vel.x -= right.x * into * Math.sign(by)), (vel.z -= right.z * into * Math.sign(by));
    };
    for (const f of this.fences) {
      if (n.s < f.s[0] + G.ramp || n.s > f.s[1] || pos.y >= f.h - 0.05) continue;
      const d = n.lateral - f.lat;
      const min = radius * 0.7 + G.radius;
      if (Math.abs(d) < min) {
        push((d >= 0 ? 1 : -1) * min - d);
        this.wallHit = { x: right.x * Math.sign(d || 1), z: right.z * Math.sign(d || 1), tx: n.tx, tz: n.tz }; // (it slides along, like a side wall)
      }
    }
    // (end caps: the horse can't ride off either end of the trail)
    for (const [s, back] of [[0, 1], [this.track.length, -1]]) {
      if (Math.abs(n.s - s) > 6) continue;
      const p = this.track.at(s);
      const along = ((pos.x - p.x) * p.tx + (pos.z - p.z) * p.tz) * back;
      if (along >= 0.5) continue;
      pos.x += p.tx * back * (0.5 - along);
      pos.z += p.tz * back * (0.5 - along);
      const into = (vel.x * p.tx + vel.z * p.tz) * back;
      if (into < 0) (vel.x -= p.tx * back * into), (vel.z -= p.tz * back * into);
    }
    for (const g of this.gates) {
      if (g.open || Math.abs(n.s - g.s) > 6) continue;
      const p = this.track.at(g.s);
      const ahead = (pos.x - p.x) * p.tx + (pos.z - p.z) * p.tz; // (past the gate: positive)
      if (ahead <= -0.8) continue; // (still on this side)
      pos.x -= p.tx * (ahead + 0.8);
      pos.z -= p.tz * (ahead + 0.8);
      const into = vel.x * p.tx + vel.z * p.tz;
      if (into > 0) (vel.x -= p.tx * into), (vel.z -= p.tz * into);
    }
    if (pos.y > this.heightAt() + R.wall.height) return;
    const lat = n.lateral;
    const max = R.wall.offset - radius;
    if (Math.abs(lat) > max && !this.wallHit) {
      push(Math.sign(lat) * max - lat);
      this.wallHit = { x: -right.x * Math.sign(lat), z: -right.z * Math.sign(lat), tx: n.tx, tz: n.tz };
    }
  }

  /** Is the point inside the side walls (the camera never goes beyond them)? */
  insideTrailWalls(x, z, y) {
    const n = this.track.nearest(x, z, R.wall.offset + 6);
    if (!n) return true;
    return Math.abs(n.lateral) <= R.wall.offset || y > R.wall.height;
  }
}

/** Builds the ride's models into `scene` (hidden until the ride starts); `opts` = how files load ({ readFile, placeholder }). */
export async function loadRide(scene, world, opts = {}) {
  const track = world.track;
  const root = new THREE.Group();
  root.name = 'ride';
  root.visible = false;
  const CT = CONFIG.part2.clockTower;
  const [city, rails, factory, skyline, tower] = await Promise.all([
    loadGearhavenRideModel(world, opts), loadRailModel(track, opts), loadFactoryDecorModel(track, opts),
    loadSkylineModel(trailSpots(track, CONFIG.part2.skyline.ride), opts), loadClockTowerModel(opts),
  ]);
  tower.position.set(...CT.ride.at);
  tower.scale.setScalar(CT.ride.scale);
  root.add(city, rails, factory, skyline, tower);
  const place = (obj, s, lat = 0, y = 0) => {
    const p = trackPoint(track, s, lat, y);
    obj.position.copy(p.pos);
    obj.rotation.y = p.heading;
    root.add(obj);
    return p;
  };
  const vents = [];
  for (const v of R.vents) {
    const model = await loadSteamVentModel();
    const p = place(model, v.s, v.lat);
    vents.push({ ...v, model, at: p.pos, wait: 0 });
  }
  const decks = [];
  for (const d of R.decks) {
    const model = await loadGearDeckModel(d, opts);
    place(model, (d.s[0] + d.s[1]) / 2, d.lat, d.top);
    decks.push({ ...d, model, opacity: 1 });
  }
  const hammers = [];
  for (const h of R.hammers) {
    const model = await loadHammerModel();
    place(model, h.s);
    hammers.push({ ...h, model, wait: 0 });
  }
  const cogs = [];
  for (const c of R.cogPlatforms) {
    const model = await loadCogPlatformModel();
    const p = place(model, c.s, c.lat);
    cogs.push({ ...c, model, at: p.pos });
  }
  const conveyors = [];
  for (const c of R.conveyors) {
    const model = await loadConveyorModel(track, c, opts);
    root.add(model);
    conveyors.push({ ...c, model, offset: 0 });
  }
  const saws = [];
  for (const sw of R.saws) {
    const model = await loadSawModel(opts);
    const p = place(model, sw.s);
    saws.push({ ...sw, model, at: p, wait: 0 });
  }
  const door = await loadRideDoorModel();
  const dp = place(door, R.door.s);
  door.rotation.y = dp.heading + Math.PI; // (facing the horse coming up the trail)
  const flags = [];
  for (const s of R.checkpoints.slice(1)) {
    const flag = await loadRideCheckpointModel();
    place(flag, s, R.checkpointSide);
    flags.push(flag);
  }
  const gearSpots = gearPositions(track);
  const pickups = await loadGearPickupModel(gearSpots.length, opts);
  const fx = await loadRideFxModels();
  root.add(pickups, fx.sparks, fx.puffs, fx.sparkles);
  scene.add(root);
  return { root, city, rails, factory, skyline, tower, vents, decks, hammers, saws, cogs, conveyors, door, flags, gearSpots, pickups, fx };
}

/** Where the gears are: street rows, along the rails, on the deck, along each vent's launch arc. */
function gearPositions(track) {
  const GR = R.gears;
  const reach = CONFIG.gems.riderReach;
  const out = [];
  const row = (s0, s1, count, at) => {
    for (let i = 0; i < count; i++) out.push(at(count > 1 ? lerp(s0, s1, i / (count - 1)) : (s0 + s1) / 2));
  };
  for (const [s0, s1, lat, count] of GR.rows) row(s0, s1, count, (s) => trackPoint(track, s, lat, reach).pos);
  for (const [group, index, s0, s1, count] of GR.railRows) {
    const rail = railsOf(group)[index];
    row(s0, s1, count, (s) => trackPoint(track, s, rail.lat, railHeight(rail, s) + reach).pos);
  }
  for (const [d, s0, s1, count] of GR.deckRows) {
    const deck = R.decks[d];
    row(s0, s1, count, (s) => trackPoint(track, s, deck.lat, deck.top + reach).pos);
  }
  // Above the vents: along the launch arc (at the horse's normal top speed).
  for (const v of R.vents) {
    for (const d of GR.ventArc) {
      const t = d / HC.maxSpeed;
      const y = R.vent.launch * t - 0.5 * HC.gravity * t * t;
      out.push(trackPoint(track, v.s + d, v.lat, y + reach).pos);
    }
  }
  return out;
}

/** A group's rails, left to right. */
function railsOf(group) {
  return R.rails.filter((r) => r.group === group).sort((a, b) => a.lat - b.lat);
}

/**
 * The ride while it is played: call `update(dt, input)` before the horse's own update (rails
 * drive the horse while it grinds; conveyors and cogs carry it) and `after(dt)` after it
 * (landing on a rail, the vents, the hammers, gears, the door), `animate(dt)` every frame.
 */
export class Ride {
  /** @param {{ parts, world, horse, hero, sound, cam?, ui? }} o */
  constructor({ parts, world, horse, hero, sound, cam = null, ui = null }) {
    Object.assign(this, { parts, world, horse, hero, sound, cam, ui });
    this.track = world.track;
    this.onFinish = null; // () => void at the Fire Element's door
    this.onGear = null; // (count) => void
    this.reset();
  }

  /** A fresh ride: gears back, flags down, nothing grinding. */
  reset() {
    this.time = 0;
    this.grind = null;
    this.leftAt = -Infinity;
    this.lastRail = null;
    this.push = null;
    this.hzPrev = null; // where the horse was last frame (the hazards' swept test)
    this.finished = false;
    this.alignRail = null;
    this.#surfacePrev = null;
    this.count = 0;
    this.stickHeld = false;
    this.sparks = [];
    this.puffs = [];
    this.sparkles = [];
    this.puffT = 0;
    this.stats = { grinds: 0, switches: 0, launches: 0, hits: 0, sawHits: 0, carried: 0, conveyed: 0, belted: 0, snaps: 0, hopsOff: 0, ends: 0, maxY: 0 };
    this.airborne = false;
    this.world.coyote = null;
    this.streak = { n: 0, at: -Infinity }; // gears picked up in a quick row: each a little higher
    this.loopsNow = new Set(); // (the loops kept running this frame: tests)
    this.gears = this.parts.gearSpots.map((p) => ({ pos: p.clone(), home: p.clone(), taken: false, pop: 0 }));
    for (const v of this.parts.vents) v.wait = 0;
    for (const h of this.parts.hammers) h.wait = 0;
    for (const sw of this.parts.saws) sw.wait = 0;
    for (const f of this.parts.flags) f.userData.flag?.material.color.setHex(CONFIG.checkpoints.flagColor);
    this.#drawGears();
  }

  /** Where the horse is along the trail. */
  get s() {
    return this.track.nearest(this.horse.position.x, this.horse.position.z, R.wall.offset + 8)?.s ?? this.horse.trackS ?? 0;
  }

  get grinding() {
    return !!this.grind;
  }

  /** Before the horse's update: grinding drives it; conveyors, cog platforms and a hammer's knock carry it. */
  update(dt, input) {
    this.time += dt;
    const { horse } = this;
    this.loopsNow.clear();
    this.airborne = !horse.grounded;
    if (this.world.coyote) this.world.coyote.t -= dt;
    this.#surfaceNote = null;
    if (this.grind) this.#grindStep(dt, input);
    else if (horse.mode === 'riding' && dt > 0) {
      const onStreet = horse.grounded && horse.position.y < 0.5;
      const n = this.track.nearest(horse.position.x, horse.position.z, R.wall.offset + 4);
      if (onStreet && n) {
        for (const c of this.parts.conveyors) {
          if (n.s < c.s[0] || n.s > c.s[1]) continue;
          horse.position.x += -n.tz * c.dir * R.conveyor.speed * dt;
          horse.position.z += n.tx * c.dir * R.conveyor.speed * dt;
          this.stats.conveyed += dt;
          this.#surfaceNote = 'belt';
        }
        for (const c of this.parts.cogs) {
          // (cog platforms: on the street)
          const dx = horse.position.x - c.at.x;
          const dz = horse.position.z - c.at.z;
          if (Math.hypot(dx, dz) > R.cogPlatform.radius) continue;
          const a = R.cogPlatform.speed * c.dir * dt;
          horse.position.x = c.at.x + dx * Math.cos(a) + dz * Math.sin(a);
          horse.position.z = c.at.z - dx * Math.sin(a) + dz * Math.cos(a);
          horse.heading += a;
          this.stats.carried += dt;
        }
      }
      // On a belt deck: its belt carries the horse sideways (up against the wall and the railing).
      const d = horse.grounded ? this.#deckUnder() : null;
      if (d?.belt && n) {
        horse.position.x += -n.tz * d.belt * R.conveyor.speed * dt;
        horse.position.z += n.tx * d.belt * R.conveyor.speed * dt;
        this.stats.belted += dt;
        this.#surfaceNote = 'belt';
      }
      if (this.push) {
        const k = this.push.t / this.push.time;
        horse.position.x += this.push.x * k * dt;
        horse.position.z += this.push.z * k * dt;
        if ((this.push.t -= dt) <= 0) this.push = null;
      }
    }
  }

  /** The surface he is on this frame ('rail' | 'belt' | null); when it ends `onLeaveSurface(kind)` fires (the Fire level recalls missed cog keys). */
  #surfaceNote = null;
  #surfacePrev = null;

  #noteSurface() {
    const now = this.grind ? 'rail' : this.#surfaceNote;
    if (this.#surfacePrev && !now) {
      this.stats.surfaceLeaves = (this.stats.surfaceLeaves ?? 0) + 1;
      this.onLeaveSurface?.(this.#surfacePrev);
    }
    this.#surfacePrev = now;
  }

  /** After the horse's update: rails to land on, vents, hammers, gears, the door. */
  after(dt) {
    const { horse } = this;
    this.#noteSurface();
    if (horse.mode !== 'riding') {
      this.hzPrev = null;
      return;
    }
    this.stats.maxY = Math.max(this.stats.maxY, horse.position.y);
    if (!this.grind) this.#deckLanding();
    if (!this.grind) this.#tryRail();
    if (!this.grind) {
      this.#vents(dt);
      this.#alignFlight(dt);
    }
    this.#hammers(dt);
    this.#saws(dt);
    this.hzPrev = horse.position.clone();
    this.#gears(dt);
    this.#machineLoops();
    if (!this.finished && this.s >= R.door.s - R.door.reach) {
      this.finished = true;
      this.onFinish?.();
    }
  }

  // --- decks --------------------------------------------------------------------

  /** The deck the horse stands on (on its top, over it or in its landing margin), if any. */
  #deckUnder() {
    const { horse } = this;
    const d = this.world.deckAt(horse.position.x, horse.position.z, DA.snap);
    return d && Math.abs(horse.position.y - d.top) < 0.05 ? d : null;
  }

  /**
   * The landing assist: coming down in a deck's edge margin it is snapped onto the deck (pulled
   * `inset` inside); standing on it keeps the coyote time topped up, so riding off its edge it
   * holds `coyote` s before it drops.
   */
  #deckLanding() {
    const { horse, world } = this;
    if (!horse.grounded) return;
    const d = this.#deckUnder();
    if (!d) return;
    if (world.deckAt(horse.position.x, horse.position.z) === d) {
      world.coyote = { deck: d, t: DA.coyote };
      return;
    }
    if (!this.airborne) return; // (riding off its edge: the coyote time / margin hold it a moment)
    const n = this.track.nearest(horse.position.x, horse.position.z, R.wall.offset + 4 + DA.snap);
    const s = clamp(n.s, d.s[0] + DA.inset, d.s[1] - DA.inset);
    const lat = clamp(n.lateral, d.lat - d.width / 2 + DA.inset, d.lat + d.width / 2 - DA.inset);
    horse.position.copy(trackPoint(this.track, s, lat, d.top).pos);
    world.coyote = { deck: d, t: DA.coyote };
    this.stats.snaps++;
  }

  // --- rails --------------------------------------------------------------------

  /** Landing on a rail: riding up a low rail's ramp, or coming down onto any rail from above. */
  #tryRail() {
    const { horse } = this;
    if (horse.scripted) return;
    const n = this.track.nearest(horse.position.x, horse.position.z, R.wall.offset + 4);
    if (!n) return;
    for (const rail of R.rails) {
      if (n.s < rail.s[0] || n.s > rail.s[1] - 2) continue;
      if (rail === this.lastRail && this.time - this.leftAt < 0.8) continue;
      if (Math.abs(n.lateral - rail.lat) > G.capture) continue;
      const y = railHeight(rail, n.s);
      const onRamp = !rail.upper && n.s < rail.s[0] + G.ramp;
      const dy = horse.position.y - y;
      const snap = rail.upper ? (G.upperSnap ?? G.above) : G.above;
      const ok = onRamp ? dy <= G.above && dy >= -0.6 : horse.velocity.y <= 0 && !horse.grounded && dy <= snap && dy >= -0.4;
      if (ok) return this.#startGrind(rail, n.s);
    }
  }

  #startGrind(rail, s) {
    const { horse } = this;
    this.grind = { rail, s, lat: rail.lat, speed: clamp(Math.max(horse.speed, G.speed), 0, G.maxSpeed), hop: null };
    horse.scripted = true;
    horse.galloping = false;
    horse.velocity.set(0, 0, 0);
    horse.grounded = true;
    this.stats.grinds++;
    this.sound?.play('rail_land');
    this.#placeOnRail(0);
  }

  #grindStep(dt, input) {
    const g = this.grind;
    const { horse } = this;
    // Steering hops across to the next rail of the group (one hop per push of the stick).
    const x = input?.moveX ?? 0;
    if (!g.hop && Math.abs(x) > G.switchStick && !this.stickHeld) {
      const next = railsOf(g.rail.group).filter((r) => Math.sign(r.lat - g.rail.lat) === Math.sign(x) && g.s >= r.s[0] && g.s < r.s[1] - 2).sort((a, b) => Math.abs(a.lat - g.rail.lat) - Math.abs(b.lat - g.rail.lat))[0];
      if (next) {
        g.hop = { from: g.lat, to: next, t: 0 };
        this.stats.switches++;
      }
    }
    this.stickHeld = Math.abs(x) > 0.3;
    if (input?.jumpPressed && !g.hop) return this.#leaveRail(true);
    g.s += g.speed * dt;
    let arc = 0;
    if (g.hop) {
      g.hop.t = Math.min(1, g.hop.t + dt / G.switchTime);
      g.lat = lerp(g.hop.from, g.hop.to.lat, THREE.MathUtils.smoothstep(g.hop.t, 0, 1));
      arc = Math.sin(Math.PI * g.hop.t) * G.switchArc;
      if (g.hop.t >= 1) {
        g.rail = g.hop.to;
        g.lat = g.rail.lat;
        g.hop = null;
        this.sound?.play('rail_land');
      }
    }
    if (g.s >= g.rail.s[1]) {
      this.stats.ends++;
      return this.#leaveRail(false);
    }
    this.#placeOnRail(arc);
    horse.speed = g.speed;
    if (dt > 0) {
      this.#emitSparks(dt);
      // (the steel scrape and its sparks: louder and higher the faster it grinds)
      const k = clamp((g.speed - G.speed) / Math.max(1e-3, G.maxSpeed - G.speed), 0, 1);
      this.#loop('railGrind', 'rail_grind', { volume: lerp(SND.grind.volume[0], SND.grind.volume[1], k), pitch: lerp(SND.grind.pitch[0], SND.grind.pitch[1], k), position: horse.position });
    }
  }

  #placeOnRail(arc) {
    const g = this.grind;
    const p = trackPoint(this.track, g.s, g.lat, railHeight(g.rail, g.s) + arc);
    this.horse.position.copy(p.pos);
    this.horse.heading = p.heading;
    this.horse.trackS = g.s;
  }

  /** Off the rail with a hop (Jump, or its end): the horse's own riding takes over again. */
  #leaveRail(jumped) {
    const { horse } = this;
    const g = this.grind;
    this.grind = null;
    this.lastRail = g.rail;
    this.leftAt = this.time;
    horse.scripted = false;
    horse.speed = g.speed;
    horse.heading = this.track.headingAt(g.s);
    horse.velocity.set(Math.sin(horse.heading) * g.speed, G.hopOff, Math.cos(horse.heading) * g.speed);
    horse.grounded = false;
    if (jumped) this.stats.hopsOff++;
    this.sound?.play('rail_leave', { position: horse.position });
  }

  // --- vents, hammers -----------------------------------------------------------

  #vents(dt) {
    const { horse } = this;
    for (const v of this.parts.vents) {
      v.wait = Math.max(0, v.wait - dt);
      // (a horse hopping over it, up to `catchHeight`, is launched too)
      if (v.wait > 0 || horse.position.y > R.vent.catchHeight || horse.velocity.y > R.vent.launch * 0.5) continue;
      if (Math.hypot(horse.position.x - v.at.x, horse.position.z - v.at.z) > R.vent.radius) continue;
      v.wait = R.vent.cooldown;
      horse.velocity.y = R.vent.launch;
      horse.grounded = false;
      this.stats.launches++;
      this.#pickRailToAlign();
      this.sound?.play('steam_vent', { position: v.at });
      this.sound?.play('steam_launch', { position: v.at });
      this.#puff(v.at, R.vent.puff, 1.6);
      for (const top of this.parts.factory.userData.ventStacks[this.parts.vents.indexOf(v)] ?? []) this.#puff(top, R.vent.stackPuff, 0.4);
    }
  }

  /** After a launch: the upper rail ahead (if there is one within `vent.align.look`) that the flight is gently steered toward. */
  #pickRailToAlign() {
    const n = this.track.nearest(this.horse.position.x, this.horse.position.z, R.wall.offset + 4);
    this.alignRail = null;
    if (!n) return;
    const AL = R.vent.align;
    this.alignRail = R.rails.find((r) => r.upper && r.s[0] - n.s > -2 && r.s[0] - n.s <= AL.look) ?? null;
  }

  /** In the air after a steam launch: a soft sideways pull toward the upper rail's line (within `align.range` of it), so a roughly aligned approach lands on it. */
  #alignFlight(dt) {
    const { horse } = this;
    const rail = this.alignRail;
    if (!rail) return;
    if (horse.grounded || horse.mode !== 'riding' || dt <= 0) {
      if (horse.grounded && horse.position.y < 0.5) this.alignRail = null;
      return;
    }
    const n = this.track.nearest(horse.position.x, horse.position.z, R.wall.offset + 4);
    if (!n || n.s > rail.s[1]) {
      this.alignRail = null;
      return;
    }
    const AL = R.vent.align;
    const d = rail.lat - n.lateral;
    if (Math.abs(d) > AL.range || n.s < rail.s[0] - AL.look) return;
    const move = Math.sign(d) * Math.min(Math.abs(d), AL.rate * dt);
    horse.position.x += -n.tz * move; // (the trail's lateral axis: + = to the left of its direction)
    horse.position.z += n.tx * move;
    this.stats.aligned = (this.stats.aligned ?? 0) + dt;
  }

  /**
   * The horse's path this frame (where it was → where it is) as points along the way, so a fast horse or a fast hazard never skips through
   * the other between two frames. A teleport (a respawn) longer than `hazard.maxSweep` is not swept.
   */
  #bodyPath() {
    const Z = R.hazard;
    const now = this.horse.position;
    const prev = this.hzPrev;
    const d = prev ? prev.distanceTo(now) : 0;
    const n = prev && d < Z.maxSweep ? Math.max(1, Math.ceil(d / Z.step)) : 1;
    const out = [];
    for (let i = 1; i <= n; i++) out.push({ k: i / n, pos: prev && d < Z.maxSweep ? prev.clone().lerp(now, i / n) : now.clone() });
    return out;
  }

  /** A hazard hit: the horse flinches (staggered and slower, the rider jolted), sparks, a sound, a short screen shake — never a heart, and only the hazard's own cooldown holds the next hit off. */
  #hazardHit(h, at, sound, push) {
    h.wait = R.hitCooldown;
    this.stats.hits++;
    this.horse.stumbleFor(R.stagger);
    if (this.hero) this.hero.riderFlinch = CONFIG.combat.riderFlinch.time;
    if (push) this.push = push;
    this.sound?.play(sound, { position: at });
    this.#sparkBurst(at, 14);
    this.cam?.shake?.(0.25, 0.3);
  }

  #hammers(dt) {
    const { horse } = this;
    const H = R.hammer;
    const Z = R.hazard;
    const heading = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
    const path = this.#bodyPath();
    for (const h of this.parts.hammers) {
      h.wait = Math.max(0, h.wait - dt);
      const swing = this.#swing(h);
      // (a heavy whoosh each time it sweeps through the bottom of its swing, from where it is)
      if (h.lastSwing !== undefined && Math.sign(swing) !== Math.sign(h.lastSwing) && horse.position.distanceTo(h.model.position) < SND.hammerRange) {
        h.model.userData.pivot.rotation.z = swing;
        h.model.updateMatrixWorld(true);
        this.sound?.play('hammer_swing', { position: h.model.userData.head.getWorldPosition(new THREE.Vector3()) });
      }
      h.lastSwing = swing;
      if (h.wait > 0 || this.grind) {
        h.model.userData.pivot.rotation.z = swing;
        continue;
      }
      // (the head's whole swept path against the horse's whole body: back, middle and front, along its way this frame)
      let hit = null;
      if (horse.position.distanceTo(h.model.position) < H.arm + H.reach + 6) {
        for (const p of path) {
          h.model.userData.pivot.rotation.z = H.amp * Math.sin(((this.time - dt * (1 - p.k)) / H.period) * Math.PI * 2 + h.phase);
          h.model.updateMatrixWorld(true);
          const head = h.model.userData.head.getWorldPosition(new THREE.Vector3());
          for (const along of [-Z.bodyHalfLength, 0, Z.bodyHalfLength]) {
            const body = p.pos.clone().addScaledVector(heading, along).setY(p.pos.y + 1.3);
            if (head.distanceTo(body) <= H.reach + 0.9) { hit = head; break; }
          }
          if (hit) break;
        }
      }
      h.model.userData.pivot.rotation.z = swing;
      if (!hit) continue;
      // Knocked aside the way the head is swinging.
      const n = this.track.nearest(horse.position.x, horse.position.z, R.wall.offset + 4);
      const dir = Math.sign(Math.cos(this.#phase(h))) * -1 || 1;
      this.#hazardHit(h, hit, 'hammer_hit', n ? { x: -n.tz * dir * H.push, z: n.tx * dir * H.push, t: 0.35, time: 0.35 } : null);
    }
  }

  #phase(h) {
    return (this.time / R.hammer.period) * Math.PI * 2 + h.phase;
  }

  /** Where a saw's blade is now: its lateral offset across the street. */
  #sawLat(sw) {
    return R.saw.travel * Math.sin((this.time / R.saw.period) * Math.PI * 2 + sw.phase);
  }

  /** Spinning saws: touching a blade staggers the horse and knocks it aside (never a heart); a jump clears it. The whole body is tested along the swept path against where the blade was and is. */
  #saws(dt) {
    const { horse } = this;
    const S = R.saw;
    const Z = R.hazard;
    const path = this.#bodyPath();
    const top = S.radius * (2 - S.sink);
    for (const sw of this.parts.saws) {
      sw.wait = Math.max(0, sw.wait - dt);
      if (sw.wait > 0) continue;
      for (const p of path) {
        if (p.pos.y > top - 0.25) continue; // (jumped over it)
        const n = this.track.nearest(p.pos.x, p.pos.z, R.wall.offset + 4);
        if (!n || Math.abs(n.s - sw.s) > S.reach + Z.bodyHalfLength) continue;
        const lat = S.travel * Math.sin(((this.time - dt * (1 - p.k)) / S.period) * Math.PI * 2 + sw.phase); // (where the blade was at this moment)
        if (Math.abs(n.lateral - lat) > S.radius * 0.85 + HC.radius) continue;
        this.stats.sawHits++;
        const dir = Math.sign(n.lateral - lat) || 1; // (thrown clear of the blade)
        this.#hazardHit(sw, trackPoint(this.track, sw.s, lat, S.radius).pos, 'saw_hit', { x: -n.tz * dir * S.push, z: n.tx * dir * S.push, t: 0.3, time: 0.3 });
        break;
      }
    }
  }

  /** The hammer's swing angle now (about the trail's direction). */
  #swing(h) {
    return R.hammer.amp * Math.sin(this.#phase(h));
  }

  // --- gears ---------------------------------------------------------------------

  #gears(dt) {
    const p = this.horse.collectPoint;
    const riding = this.horse.mode === 'riding' && dt > 0;
    // (on the ride a gear in the rider's lane drifts toward it; he picks it up within `rideMagnetRadius`)
    const reach = riding ? Math.max(R.gears.reach, R.rideMagnetRadius) : R.gears.reach;
    for (const g of this.gears) {
      if (g.taken) continue;
      if (riding && g.pos.distanceTo(p) < R.rideMagnetRadius * 3) lanePull(g.pos, p, this.horse.heading, R, dt);
      if (g.pos.distanceTo(p) <= reach) this.#take(g);
    }
  }

  #take(g) {
    g.taken = true;
    g.pop = R.gears.pop;
    this.#sparkle(g.pos);
    this.count++;
    // (a bright ting — a semitone higher for each gear picked up in a quick row — and the spin-up)
    const ST = SND.streak;
    this.streak.n = this.time - this.streak.at < ST.gap ? Math.min(ST.max, this.streak.n + 1) : 0;
    this.streak.at = this.time;
    this.sound?.play('gear_collect', { position: g.pos, pitch: Math.pow(2, (this.streak.n * ST.step) / 12) });
    this.sound?.play('gear_spin_pickup', { position: g.pos, volume: ST.spinVolume });
    this.onGear?.(this.count);
  }

  /** A loop kept running this frame (the AudioManager's, if there is one; noted for the tests). */
  #loop(key, name, o) {
    this.loopsNow.add(name);
    this.sound?.manager?.setLoop(key, name, o);
  }

  /** The machines' loops, from where they are: the nearest spinning saw, the nearest conveyor belt. */
  #machineLoops() {
    const { horse } = this;
    const near = (list, at, range) => {
      let best = null;
      let bd = range;
      for (const it of list) {
        const p = at(it);
        const d = p.distanceTo(horse.position);
        if (d < bd) [best, bd] = [p, d];
      }
      return best;
    };
    const saw = near(this.parts.saws, (sw) => sw.model.userData.blade.getWorldPosition(new THREE.Vector3()), SND.sawRange);
    if (saw) this.#loop('saw', 'saw_spin', { volume: SND.sawVolume, position: saw });
    const belts = [...this.parts.conveyors.map((c) => trackPoint(this.track, c.model.userData.mid, 0, 0).pos), ...this.parts.decks.filter((d) => d.belt).map((d) => trackPoint(this.track, (d.s[0] + d.s[1]) / 2, d.lat, d.top).pos)];
    const belt = near(belts, (p) => p, SND.conveyorRange);
    if (belt) this.#loop('conveyor', 'conveyor_belt', { volume: SND.conveyorVolume, position: belt });
  }

  /** (?debug "Give 14 gears") Collects the next `n` gears not yet taken, as if ridden through. */
  giveGears(n) {
    for (const g of this.gears) {
      if (n <= 0) break;
      if (g.taken) continue;
      this.#take(g);
      n--;
    }
  }

  get total() {
    return this.gears.length;
  }

  #drawGears() {
    const { gears, halos } = this.parts.pickups.userData;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const GR = R.gears;
    const spin = this.time * GR.spin;
    this.gears.forEach((g, i) => {
      let k = 1;
      if (g.taken) k = g.pop > 0 ? 1 + (1 - g.pop / GR.pop) * 0.8 : 0; // (a quick pop, then gone)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin + i);
      const pos = g.pos.clone();
      pos.y += Math.sin(this.time * 2 + i) * GR.bob;
      m.compose(pos, q, new THREE.Vector3(k, k, k));
      gears.setMatrixAt(i, m);
      halos.setMatrixAt(i, m);
    });
    gears.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
  }

  // --- effects ---------------------------------------------------------------------

  #emitSparks(dt) {
    const SP = R.sparks;
    this.sparkDebt = (this.sparkDebt ?? 0) + SP.perSecond * dt;
    const f = new THREE.Vector3(Math.sin(this.horse.heading), 0, Math.cos(this.horse.heading));
    while (this.sparkDebt >= 1) {
      this.sparkDebt -= 1;
      if (this.sparks.length >= SP.max) this.sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const at = this.horse.position.clone().addScaledVector(f, (Math.random() - 0.5) * 1.6);
      at.y += 0.05;
      this.sparks.push({
        p: at,
        v: new THREE.Vector3(Math.cos(a) * SP.speed * 0.6, SP.speed * (0.4 + Math.random() * 0.6), Math.sin(a) * SP.speed * 0.6).addScaledVector(f, -SP.speed),
        age: 0,
      });
    }
  }

  /** A gear picked up: a little burst of sparkles. */
  #sparkle(at) {
    const SK = R.gears.sparkle;
    for (let i = 0; i < SK.count; i++) {
      if (this.sparkles.length >= SK.max) this.sparkles.shift();
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(SK.speed * (0.6 + Math.random() * 0.6));
      this.sparkles.push({ p: at.clone(), v, age: 0, spin: Math.random() * Math.PI });
    }
  }

  /** Sparks off a saw blade. */
  #sparkBurst(at, n) {
    const SP = R.sparks;
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= SP.max) this.sparks.shift();
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({ p: at.clone(), v: new THREE.Vector3(Math.cos(a) * SP.speed, SP.speed * (0.3 + Math.random()), Math.sin(a) * SP.speed), age: 0 });
    }
  }

  #puff(at, n, spread) {
    const ST = R.steam;
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= ST.puffs) this.puffs.shift();
      const a = Math.random() * Math.PI * 2;
      this.puffs.push({ p: at.clone().add(new THREE.Vector3(Math.cos(a) * spread * Math.random(), 0.3, Math.sin(a) * spread * Math.random())), size: lerp(ST.size[0], ST.size[1], Math.random()), age: -i * 0.02 });
    }
  }

  /** Every frame (also in cutscenes): hammers, cogs, conveyors, the sky, the clock, vents, effects. */
  animate(dt) {
    const P = this.parts;
    const u = P.city.userData;
    spinGearDecor(u.decor, dt);
    P.skyline.userData.update(dt);
    P.tower.userData.update(dt);
    for (const sw of P.saws) {
      const { blade, disc } = sw.model.userData;
      blade.position.x = this.#sawLat(sw);
      disc.rotation.z -= R.saw.spin * dt;
    }
    u.clock.minute.rotation.z -= R.clock.slow * dt;
    u.clock.hour.rotation.z -= (R.clock.slow / 12) * dt;
    for (const h of P.hammers) h.model.userData.pivot.rotation.z = this.#swing(h);
    for (const c of P.cogs) c.model.rotation.y += R.cogPlatform.speed * c.dir * dt;
    const m = new THREE.Matrix4();
    for (const c of P.conveyors) {
      const { slats, items, mid } = c.model.userData;
      c.offset = (c.offset + c.dir * R.conveyor.speed * dt) % R.conveyor.slat;
      items.forEach((lat0, i) => {
        let lat = lat0 + c.offset;
        if (lat > R.wall.offset) lat -= R.wall.offset * 2;
        if (lat < -R.wall.offset) lat += R.wall.offset * 2;
        const p = trackPoint(this.track, mid, lat, 0.07);
        m.makeRotationY(p.heading).setPosition(p.pos);
        slats.setMatrixAt(i, m);
      });
      slats.instanceMatrix.needsUpdate = true;
    }
    // Vents glow and breathe out a little steam now and then.
    this.puffT -= dt;
    for (const v of P.vents) v.model.userData.glow.material.opacity = 0.25 + 0.12 * Math.sin(this.time * 4 + v.s);
    if (this.puffT <= 0 && dt > 0) {
      this.puffT = R.steam.idleEvery;
      for (const v of P.vents) this.#puff(v.at, 2, 0.6);
      // (the nearest vent's soft idle puff: a quiet hiss from where it is)
      const hp = this.horse.position;
      const v0 = P.vents.reduce((a, v) => (!a || v.at.distanceTo(hp) < a.at.distanceTo(hp) ? v : a), null);
      if (v0 && this.horse.mode === 'riding') this.sound?.play('steam_vent', { position: v0.at, volume: SND.ventIdleVolume });
      const tops = P.factory.userData.chimneys;
      if (tops.length) this.#puff(tops[Math.floor(Math.random() * tops.length)], 2, 0.3);
    }
    // The gear deck fades while the camera is under it or in it (riding past below).
    const eye = this.cam?.camera.position;
    for (const d of P.decks) {
      const n = eye ? this.track.nearest(eye.x, eye.z, R.wall.offset + 4) : null;
      const under = n && n.s > d.s[0] - 2 && n.s < d.s[1] + 2 && Math.abs(n.lateral - d.lat) < d.width / 2 + 1.5 && eye.y < d.top + R.deckFade.above;
      d.opacity += ((under ? R.deckFade.opacity : 1) - d.opacity) * Math.min(1, R.deckFade.rate * dt);
      for (const m of d.model.userData.fade) {
        m.opacity = d.opacity;
        m.depthWrite = d.opacity > 0.99;
      }
      // A belt deck's slats slide across it (lateral + is the deck's local −x).
      const bu = d.model.userData;
      if (bu.belt) {
        bu.offset = (bu.offset - d.belt * R.conveyor.speed * dt) % R.conveyor.slat;
        bu.items.forEach((x0, i) => {
          let x = x0 + bu.offset;
          if (x > d.width / 2) x -= d.width;
          if (x < -d.width / 2) x += d.width;
          bu.slats.setMatrixAt(i, m.makeTranslation(x, 0.03, 0));
        });
        bu.slats.instanceMatrix.needsUpdate = true;
      }
    }
    for (const g of this.gears) if (g.taken && g.pop > 0) g.pop = Math.max(0, g.pop - dt);
    this.#drawGears();
    this.#drawFx(dt);
  }

  #drawFx(dt) {
    const { sparks, puffs } = this.parts.fx;
    const SP = R.sparks;
    const ST = R.steam;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const hot = new THREE.Color(SP.hot);
    const warm = new THREE.Color(SP.color);
    this.sparks = this.sparks.filter((s) => s.age < SP.life);
    for (let i = 0; i < sparks.count; i++) {
      const s = this.sparks[i];
      if (!s) {
        m.makeScale(0, 0, 0);
        sparks.setMatrixAt(i, m);
        continue;
      }
      s.age += dt;
      s.v.y -= 18 * dt;
      s.p.addScaledVector(s.v, dt);
      const k = 1 - s.age / SP.life;
      m.lookAt(s.p, s.p.clone().add(s.v), new THREE.Vector3(0, 1, 0)).setPosition(s.p);
      sparks.setMatrixAt(i, m);
      sparks.setColorAt(i, col.copy(warm).lerp(hot, k).multiplyScalar(Math.max(0, k)));
    }
    this.puffs = this.puffs.filter((p) => p.age < ST.life);
    for (let i = 0; i < puffs.count; i++) {
      const p = this.puffs[i];
      if (!p || p.age < 0) {
        if (p) p.age += dt;
        m.makeScale(0, 0, 0);
        puffs.setMatrixAt(i, m);
        continue;
      }
      p.age += dt;
      const k = p.age / ST.life;
      // (normal-blended, lit: it swells and shrinks away instead of fading by colour)
      const s = p.size * (0.5 + k) * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1));
      m.makeScale(s, s, s).setPosition(p.p.x, p.p.y + ST.rise * k, p.p.z);
      puffs.setMatrixAt(i, m);
    }
    // Pickup sparkles: out and up, twinkling, fading.
    const { sparkles } = this.parts.fx;
    const SK = R.gears.sparkle;
    this.sparkles = this.sparkles.filter((s) => s.age < SK.life);
    this.sparkles.forEach((s, i) => {
      s.age += dt;
      s.v.y -= 4 * dt;
      s.p.addScaledVector(s.v, dt);
      s.spin += dt * 8;
      const k = 1 - s.age / SK.life;
      const size = SK.size * (0.6 + 0.6 * Math.abs(Math.sin(s.spin)));
      m.makeRotationY(s.spin).scale(new THREE.Vector3(size, size * 1.6, size)).setPosition(s.p);
      sparkles.setMatrixAt(i, m);
      sparkles.setColorAt(i, col.setHex(SK.color).multiplyScalar(Math.max(0, k)));
    });
    sparkles.count = this.sparkles.length;
    for (const mesh of [sparks, puffs, sparkles]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The pickup sparkles alive now (tests). */
  get sparkleCount() {
    return this.sparkles.length;
  }

  /** The sparks alive now (tests). */
  get sparkCount() {
    return this.sparks.length;
  }

  /** Stop grinding at once (leaving the ride, a respawn). */
  stop() {
    if (this.grind) this.horse.scripted = false;
    this.grind = null;
    this.push = null;
  }
}
