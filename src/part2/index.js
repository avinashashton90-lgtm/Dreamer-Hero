import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../config.js';
import { GearhavenWorld, loadGearhavenModel, makeDoor } from './gearhaven.js';
import { Tick, loadTickModel } from './tick.js';
import { loadGearhavenHorseUpgrade, spinHorseKey } from './horseUpgrade.js';
import { loadRobotModel } from './robots.js';
import { spinGearDecor } from './props.js';
import { loadClockTowerModel } from './clockTower.js';
import { buildPropsShowcase } from './propsTest.js';
import { buildLookRig, applyLook, nextLook, look, primeLookTints } from './looks.js';
import { makeFloorMaterial } from './floor.js';
import { RideWorld, Ride, loadRide, setRideConfig } from './ride.js';
import { trackPoint, setRideModelConfig } from './rideModel.js';
import { FireLevel } from './fire.js';
import { GearRewards, gearTiers } from './gearRewards.js';
import { Part2Sound } from './sound.js';

// Part 2 — Gearhaven (STORY.md): a chapter for levelManager.js with its own scene, floors and
// loop; it borrows the shared systems (state machine, HUD, input, camera, cutscene player,
// sound, the hero and the horse) and hands them back on exit. Today: the arrival scene (AJ and
// the horse drop out of the light into a brass courtyard; Tick), the courtyard with its five
// element doors (the first objective: "Find the Fire Element"), the Gearhaven ride behind the
// Fire door (ride.js: rails, steam vents, hazards, gears, checkpoints) to the Fire Element's
// door — its brass gears unlocking the gear rewards (gearRewards.js: +1 heart, the horse's
// armour, a bonus charge and Tick's glow; kept between sections, applied everywhere) —, a "coming soon" stub platform per element level and for Amy's final fight, the Part 2
// ending screen, and (?debug) the "Robots test" showcase of Tick and the four mech robots.
// The Fire Element's level (fire.js) follows the ride: the Fire door's ride now ends at the furnace
// city, whose boss (the Furnace Guardian) guards the Fire Element; the other four are stubs.

const P2 = CONFIG.part2;
const GH = P2.gearhaven;
const D2 = DIALOGUE.part2;
const RD = P2.ride;

/**
 * @param {object} shared  { state, STATES, ui, input, cam, cinematic, sound, soundscape, hero,
 *   horse, abilities, lives, assets? ({ readFile, placeholder }: how models load — tests) }
 */
export async function createPart2(shared) {
  const part = new Part2(shared);
  await part.init();
  return part;
}

class Part2 {
  constructor(shared) {
    Object.assign(this, shared);
    this.id = 'part2';
    this.at = null; // 'arrival' | 'courtyard' | a level id | 'final' | 'ending'
    this.tweens = [];
    this.stats = { arrivals: 0, stubs: {} };
    this.rewards = new GearRewards(); // (kept between sections; a new game resets them)
    this.banners = []; // gear-reward banners waiting to show (one after another)
    this.bannerT = 0;
    this.sounds = new Part2Sound(this); // (Part 2's music, ambience and loops: sound.js)
    this.elements = []; // the Elements recovered (ids, in order): the HUD's row, kept across Part 2
    this.extraHearts = 0; // heart containers from the Fire level's big chest (+1 max heart each)
    this.rc = RD; // the ride config in use (the first ride's, or the Fire level's)
    this.rideKey = 'ride';
    this.questOverride = null;
  }

  async init() {
    const scene = (this.scene = new THREE.Scene());
    // The look (looks.js, `part2.gearhavenLook`): its kit tints first (before any kit material
    // is made), then the sky dome, fog, hemisphere, sun and amber point lights.
    primeLookTints();
    scene.background = new THREE.Color(look().fog);
    scene.fog = new THREE.Fog(look().fog, GH.fog.near, GH.fog.far);
    this.rig = buildLookRig(scene);
    this.world = new GearhavenWorld();
    this.world.addFloor(0, 0, GH.floor.radius, GH.floor.wall);
    this.gearhaven = await loadGearhavenModel(this.assets ?? {});
    scene.add(this.gearhaven);
    for (const p of this.gearhaven.userData.pillars) this.world.cylinders.push({ ...p, bottom: 0, top: GH.pillars.height });
    this.tick = new Tick(await loadTickModel(this.assets ?? {}));
    scene.add(this.tick.model);
    this.upgrade = await loadGearhavenHorseUpgrade();
    this.#buildStubs();
    // The Time Element's place: the clock tower on its own floating disc behind the platform.
    const CT = P2.clockTower;
    this.timeTower = await loadClockTowerModel(this.assets ?? {});
    this.timeTower.scale.setScalar(CT.time.scale);
    this.timeTower.position.set(0, 0, -CT.time.back);
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(CT.base.steps[0][0] * CT.time.scale, CT.base.steps[0][0] * CT.time.scale * 0.5, 1.6, 24), makeFloorMaterial());
    isle.position.set(0, -0.8, -CT.time.back);
    this.stubs.time.group.add(this.timeTower, isle);
    this.steam = Array.from({ length: GH.steam.puffs }, () => ({ age: Infinity }));
    this.steamT = 0;
    // The Gearhaven ride (its own world and models; hidden until it starts).
    this.rideWorld = new RideWorld();
    this.rideParts = await loadRide(scene, this.rideWorld, this.assets ?? {});
    this.ride = new Ride({ parts: this.rideParts, world: this.rideWorld, horse: this.horse, hero: this.hero, sound: this.sound, cam: this.cam, ui: this.ui });
    this.ride.onGear = (n) => {
      this.gears = (this.gears ?? 0) + 1; // (the currency, kept across rides)
      this.gearProgress(true);
    };
    this.ride.onFinish = () => this.travel(() => this.enterFire()); // (the end of the ride: the furnace city, the Fire Element's level)
    this.rides = { ride: { ride: this.ride, parts: this.rideParts, world: this.rideWorld, cfg: RD } };
    this.fire = new FireLevel(this); // (built the first time it is entered)
  }

  /** Make the ride `key` ('ride' | 'fire') the one in use: its world, models, config (ride.js and rideModel.js read it). */
  useRide(key) {
    const r = key === 'fire' ? { ride: this.fire.ride, parts: this.fire.parts, world: this.fire.world, cfg: this.fire.cfg } : this.rides.ride;
    this.rideKey = key;
    this.ride = r.ride;
    this.rideParts = r.parts;
    this.rideWorld = r.world;
    this.rc = r.cfg;
    setRideConfig(r.cfg);
    setRideModelConfig(r.cfg);
  }

  /** A platform per element level (and Amy's fight): floating far off, a crystal, a door back. */
  #buildStubs() {
    const L = P2.levels;
    this.stubs = {};
    [...L.order, 'final'].forEach((id, i) => {
      const x = (i + 1) * L.stub.gap;
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(L.stub.radius, L.stub.radius * 0.7, 1.2, 32), makeFloorMaterial());
      disc.position.y = -0.6;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(L.stub.crystal, 0), new THREE.MeshBasicMaterial({ color: L[id].accent[0] })); // (the level's accent colour)
      crystal.position.set(0, 2.2, -L.stub.radius * 0.45);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(L.stub.crystal * 2.2, 12, 8), new THREE.MeshBasicMaterial({ color: L[id].accent[1], transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(crystal.position);
      const back = makeDoor(L[id].accent[0]);
      back.position.set(0, 0, L.stub.back);
      back.rotation.y = Math.PI; // (facing the platform)
      g.add(disc, crystal, halo, back);
      g.visible = false; // (only the level you're on is drawn)
      this.scene.add(g);
      this.world.addFloor(x, 0, L.stub.radius, L.stub.radius - 0.5);
      this.stubs[id] = { group: g, crystal, x, door: new THREE.Vector3(x, 0, L.stub.back) };
    });
  }

  // --- levelManager ----------------------------------------------------------

  /** Into Gearhaven: take the hero, horse and camera over; start at `start`. */
  async enter({ start = 'arrival' } = {}) {
    const { hero, horse, cam } = this;
    // (what Part 1 lent us: kept from the first entry only — re-entering at another start keeps it)
    this.leaveRide();
    if (hero.world !== this.world) this.saved = { heroWorld: hero.world, horseWorld: horse.world, camWorld: cam.world, bodies: this.cinematic.bodies };
    hero.world = horse.world = cam.world = this.world;
    for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) this.scene.add(o);
    horse.setPassenger(null);
    horse.scripted = false;
    horse.hold = false;
    horse.speed = 0;
    horse.model.add(this.upgrade); // (a key on its back; the brass plates once earned)
    this.applyRewards();
    hero.model.visible = horse.model.visible = true;
    this.soundscape && (this.soundscape.musicPhase = P2.music);
    // (the talking blips come from where each speaker is: Tick's from Tick, AJ's from AJ; Amy's
    // voice in Part 2 is her cooler, hushed one)
    if (this.soundscape) {
      this.soundscape.speakerAt = (who) => (who === 'tick' ? this.tick.position : who === 'aj' ? this.hero.position : null);
      this.soundscape.voices = { girl: 'amy2' };
    }
    this.tweens.length = 0;
    this.tick.target = this.tick.lookAt = null;
    if (this.showcase) this.showcase.group.visible = false;
    if (this.props) this.props.group.visible = false;
    if (start === 'arrival') {
      this.playArrival(); // (not awaited: the level manager's switch is done; the scene plays on)
      return;
    }
    if (start === 'courtyard') return this.toCourtyard();
    if (start === 'ending') return this.ending();
    if (start === 'robots') return this.showRobots();
    if (start === 'props') return this.showProps();
    if (start === 'ride') return this.enterRide();
    if (start === 'fire') return this.enterFire({ debug: true }); // (?debug "Fire level (start)": with 3 cog keys, 20 gems and 30 gears)
    if (start === 'fireBoss') return this.fire.build().then(() => this.fire.debugBoss());
    if (start === 'firePlaza') return this.fire.build().then(() => this.fire.debugPlaza());
    return this.enterLevel(start);
  }

  /** Back out (to Part 1): everything borrowed is handed back. */
  exit() {
    const { hero, horse, cam } = this;
    this.leaveRide();
    this.ui.setElements?.([], false);
    this.ui.setCogKeys?.(0, false);
    if (this.saved) {
      hero.world = this.saved.heroWorld;
      horse.world = this.saved.horseWorld;
      cam.world = this.saved.camWorld;
      this.cinematic.bodies = this.saved.bodies;
      this.saved = null;
    }
    this.upgrade.removeFromParent();
    // (the gear rewards are Part 2's: Part 1 has its own hearts and an unarmoured horse)
    this.lives?.setBonusHearts?.(0);
    horse.damageScale = horse.stumbleScale = 1;
    if (this.showcase) this.showcase.group.visible = false;
    if (this.props) this.props.group.visible = false;
    if (this.soundscape) {
      this.soundscape.musicPhase = null;
      this.soundscape.speakerAt = null;
      this.soundscape.voices = null;
    }
    this.sounds.stop();
    this.tweens.length = 0;
    this.at = null;
  }

  // --- gear rewards ------------------------------------------------------------

  /** A new game (Play Again, the test menu's fresh start): no rewards, no gears. */
  newGame() {
    this.rewards.reset();
    this.gears = 0;
    this.elements = [];
    this.extraHearts = 0;
    this.fire?.newGame();
    this.banners.length = 0;
    if (this.saved) this.applyRewards();
  }

  /** The level's gears now (the ride's): the counter with its tier marks; tiers reached unlock their rewards. */
  gearProgress(pulse = false) {
    const { ride } = this;
    const total = ride.total;
    const now = this.rewards.progress(this.rideKey, ride.count, total, 'fire');
    const tiers = gearTiers(total).map((t) => ({ at: t.at, reached: ride.count >= t.count }));
    this.ui.setGears?.(ride.count, total, true, pulse, tiers, this.rideKey !== 'fire'); // (the Fire level shows only the count)
    for (const r of now) {
      this.banners.push(D2.gearReward.banner(D2.gearReward[r]));
      if (r === 'heart') {
        this.applyRewards();
        this.lives?.setHearts?.(this.lives.maxHearts); // (+1 heart and a full heal)
      }
    }
    if (now.length) this.applyRewards();
  }

  /** The rewards earned so far, on everything: the extra heart, the horse's armour, Tick's glow. */
  applyRewards() {
    const GR = P2.gearRewards;
    const rw = this.rewards;
    this.lives?.setBonusHearts?.(rw.bonusHearts + this.extraHearts);
    const armour = rw.has('armour');
    this.horse.damageScale = armour ? GR.armourDamage : 1;
    this.horse.stumbleScale = armour ? GR.armourStumble : 1;
    for (const p of this.upgrade.userData.plates) p.visible = armour; // (the brass plates appear)
    this.tick.setGlow(rw.has('charge'));
  }

  /** The waiting banners, one after another, each with the chime. */
  #showBanners(realDt) {
    this.bannerT -= realDt;
    if (this.bannerT > 0 || !this.banners.length) return;
    const text = this.banners.shift();
    this.ui.banner?.(text, P2.gearRewards.bannerMs, { small: true });
    this.sound?.play('gear_reward');
    this.stats.rewardBanners = [...(this.stats.rewardBanners ?? []), text];
    this.bannerT = P2.gearRewards.bannerMs / 1000;
  }

  /** (?debug "Give 3 cog keys") In the Fire level. */
  giveKeys(n) {
    if (!this.fire?.stage) return false;
    this.fire.giveKeys(n);
    return true;
  }

  /** (?debug "Give 14 gears") On the ride: collect the next `n` of its gears. */
  giveGears(n) {
    if (this.at !== 'ride' && this.at !== 'fire') return false;
    this.ride.giveGears(n);
    return true;
  }

  // --- placing the riders ------------------------------------------------------

  onFoot(p, yaw) {
    const { hero, horse } = this;
    if (horse.mode !== 'idle') horse.mode = 'idle';
    hero.riding = false;
    hero.velocity.set(0, 0, 0);
    hero.puppet(p, yaw, 0);
    hero.lastSafe.copy(p);
  }

  horseAt(p, heading) {
    const { horse } = this;
    horse.position.copy(p);
    horse.heading = heading;
    horse.speed = 0;
    horse.grounded = true;
  }

  behind(yaw) {
    const { cam, hero } = this;
    cam.yaw = yaw + Math.PI;
    cam.snapTo(hero.position);
  }

  // --- the arrival -------------------------------------------------------------

  /**
   * AJ and the horse drop out of the light into the courtyard (the gear sky and the clock face
   * first), he gets down; the horse has its brass key; Tick floats in. Then the talk — each line
   * framing its speaker (AJ on the left, Tick on the right, the horse behind them), AJ looking up
   * at the Dream Clock for "Am I inside a clock?", Tick's nervous "I can't say." — and the first
   * objective.
   */
  async playArrival() {
    const A = P2.arrival;
    const { hero, horse, state, STATES, cinematic, tick } = this;
    this.at = 'arrival';
    this.stats.arrivals++;
    if (!state.is(STATES.CUTSCENE)) state.set(STATES.CUTSCENE);
    const land = new THREE.Vector3(...A.start);
    this.horseAt(land.clone().setY(A.drop), A.heading);
    horse.mode = 'riding';
    horse.everMounted = true;
    hero.startRiding();
    tick.place(new THREE.Vector3(...A.tickFrom), 0);
    tick.target = new THREE.Vector3(...A.tickFrom);
    const L = D2.arrival;
    const S = A.shots;
    const v = (a) => new THREE.Vector3(...a);
    // The talk: the two-shot, then each line framing its speaker (AJ / Tick), nobody hidden.
    const shot = (who) => ({ pos: () => this.#talkShot(who).pos, look: () => this.#talkShot(who).look, duration: S[who === 'two' ? 'talk' : who].duration, wait: false });
    const steps = [
      { camera: { pos: v(S.sky.pos), look: v(S.sky.look), duration: S.sky.duration } },
      { call: () => this.sound?.play('clock_chime') },
      { wait: 1.2 },
      { camera: { pos: v(S.land.pos), look: v(S.land.look), duration: S.land.duration, wait: false } },
      { call: () => this.#drop(land) },
      { wait: A.landHold },
      { call: () => this.#getDown() },
      { call: () => { this.#ajToSpot(); return this.#tickFloatsIn(); } },
      { camera: shot('two') },
      { camera: shot('aj') },
      { say: 'aj', text: L.where },
      { camera: shot('tick') },
      { say: 'tick', text: L.welcome },
      // He looks up: the camera tilts up past his shoulder to the Dream Clock and the gears.
      { call: () => this.#lookUp(true) },
      { camera: { pos: () => this.#clockShot().pos, look: () => this.#clockShot().look, duration: S.clock.duration } }, // (the tilt up, then his line)
      { say: 'aj', text: L.clock },
      { call: () => this.#lookUp(false) },
      { camera: shot('tick') },
      { say: 'tick', text: L.dreamClock, cues: [{ at: 'slowing', call: () => this.sound?.play('clock_stop_warning') }] }, // (a slow, uneasy tone)
      { say: 'tick', text: L.stops },
      { say: 'tick', text: L.took },
      { camera: shot('aj') },
      { say: 'aj', text: L.amy },
      { camera: shot('tick') },
      { call: () => tick.nervous() }, // (nervously, looking over his shoulder)
      { say: 'tick', text: L.cannot, pace: 0.8 },
      { call: () => this.#arrived(), essential: true },
    ];
    await cinematic.play(steps);
    if (this.at === 'arrival' || this.at === 'courtyard') this.toCourtyard({ keepPlace: true });
  }

  /** Falling out of the light onto the floor (the horse lands, a thud). */
  #drop(land) {
    const { horse } = this;
    const from = horse.position.clone();
    return this.tween((t) => {
      const k = Math.min(1, t / P2.arrival.fallTime);
      horse.position.lerpVectors(from, land, k * k);
      if (k >= 1) {
        horse.grounded = true;
        this.sound?.play('aj_land');
        this.sound?.play('wallThud');
        this.cinematic.shake(0.08, 0.3);
      }
      return k >= 1;
    });
  }

  /** He slides off on its right (the horse stands). */
  #getDown() {
    const { horse, hero } = this;
    horse.toggle(hero, -1);
    return this.tween(() => horse.mode === 'idle');
  }

  /**
   * The talk's places, from where the horse stands (`arrival.stage`), in the frame of the
   * two-shot: the camera in front, `angle`° round from the horse's nose to its right (the horse
   * three-quarter on, behind them); AJ on the left, Tick on the right at head height (`mid`
   * between them); AJ turned to Tick and a little toward the camera.
   */
  #talkStage() {
    const { horse } = this;
    const ST = P2.arrival.stage;
    const h = horse.position.clone().setY(0);
    const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
    const right = new THREE.Vector3(-f.z, 0, f.x); // (its right: a side −1 dismount lands here)
    const a = THREE.MathUtils.degToRad(ST.angle);
    const toCam = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
    const screenRight = new THREE.Vector3(toCam.z, 0, -toCam.x);
    const aj = h.clone().addScaledVector(screenRight, ST.aj[0]).addScaledVector(toCam, ST.aj[1]);
    const tick = h.clone().addScaledVector(screenRight, ST.tick[0]).addScaledVector(toCam, ST.tick[1]).setY(ST.tick[2]);
    const face = tick.clone().setY(0).sub(aj).normalize().addScaledVector(toCam, 0.8);
    const mid = aj.clone().add(tick.clone().setY(0)).multiplyScalar(0.5);
    return { aj, ajYaw: Math.atan2(face.x, face.z), tick, tickLook: aj.clone().addScaledVector(toCam, 1.5).setY(ST.tick[2]), mid, toCam, screenRight };
  }

  /**
   * The talk's camera: `who` 'two' (the two-shot from in front of the group's middle), 'aj' or
   * 'tick' (eased over toward the speaker and a little closer, looking straight at them — both
   * still in the shot).
   */
  #talkShot(who) {
    const S = P2.arrival.shots;
    const st = this.#talkStage();
    const T = S.talk;
    const base = st.mid.clone().addScaledVector(st.toCam, T.dist).setY(T.up);
    if (who === 'two') return { pos: base, look: st.mid.clone().setY(T.look) };
    const C = S[who];
    const at = (who === 'tick' ? this.tick.target ?? st.tick : this.ajSpot?.pos ?? st.aj).clone().setY(0);
    const pos = base.addScaledVector(at.clone().sub(st.mid), C.toward).addScaledVector(st.toCam, -C.closer).setY(T.up);
    return { pos, look: at.setY(C.look) };
  }

  /**
   * "Am I inside a clock?": past AJ's shoulder (behind him, away from the clock, away from
   * Tick and the horse, far enough out that Tick shows clear of AJ's head) tilting up to the Dream Clock's face and the gears in the sky.
   */
  #clockShot() {
    const C = P2.arrival.shots.clock;
    const aj = (this.ajSpot?.pos ?? this.#talkStage().aj).clone().setY(0);
    const clock = new THREE.Vector3(...GH.clock.at);
    const away = aj.clone().sub(clock).setY(0).normalize();
    let side = new THREE.Vector3(-away.z, 0, away.x);
    const tick = this.tick.target ?? this.#talkStage().tick;
    if (side.dot(tick.clone().sub(aj).setY(0)) > 0) side.negate(); // (away from Tick and the horse: the clock clear, Tick off past AJ's shoulder)
    return { pos: aj.clone().addScaledVector(away, C.back).addScaledVector(side, C.side).setY(C.up), look: clock };
  }

  /** AJ looks up at the Dream Clock (turned to it, head tilted back), or back to Tick. */
  #lookUp(up) {
    const { hero } = this;
    const C = P2.arrival.shots.clock;
    if (!this.ajSpot) return;
    const clock = new THREE.Vector3(...GH.clock.at);
    this.ajSpot.yaw = up ? Math.atan2(clock.x - this.ajSpot.pos.x, clock.z - this.ajSpot.pos.z) : this.#talkStage().ajYaw;
    const from = hero.facePitch;
    const to = up ? -C.lookUp : 0;
    this.tween((t) => {
      const k = Math.min(1, t / 0.5);
      hero.facePitch = from + (to - from) * THREE.MathUtils.smoothstep(k, 0, 1);
      return k >= 1;
    });
  }

  /** AJ steps from where he got down to his place beside the horse and turns to Tick. */
  #ajToSpot() {
    const { hero } = this;
    const st = this.#talkStage();
    const from = hero.position.clone();
    const dist = Math.hypot(st.aj.x - from.x, st.aj.z - from.z);
    const walkYaw = Math.atan2(st.aj.x - from.x, st.aj.z - from.z);
    this.ajSpot = { pos: from.clone(), yaw: walkYaw };
    return this.tween((t) => {
      const k = Math.min(1, (t * P2.arrival.stage.walkSpeed) / Math.max(dist, 1e-3));
      this.ajSpot.pos.lerpVectors(from, st.aj, k).setY(from.y);
      if (k >= 1) this.ajSpot.yaw = st.ajYaw;
      return k >= 1;
    });
  }

  /** Tick floats in between AJ and the horse at head height (his idle playing, a gentle bob). */
  #tickFloatsIn() {
    const { tick } = this;
    this.sound?.play('tick_whir');
    const st = this.#talkStage();
    tick.target = st.tick;
    tick.lookAt = st.tickLook;
    return this.tween(() => tick.position.distanceTo(tick.target) < 0.4);
  }

  /** The scene is over (also on Skip): on foot in the courtyard, the first objective. */
  #arrived() {
    const { hero, horse } = this;
    this.tweens.length = 0;
    const A = P2.arrival;
    const land = new THREE.Vector3(...A.start);
    if (horse.mode !== 'idle' || hero.riding) {
      // (skipped mid-scene: the horse stands where it lands, AJ on foot beside it)
      this.horseAt(land, A.heading);
      horse.mode = 'idle';
      const st = this.#talkStage();
      this.onFoot(st.aj, st.ajYaw);
      hero.stopRiding?.(hero.position.clone(), st.ajYaw);
    }
    this.ajSpot = null;
    hero.facePitch = 0; // (skipped while he looked up at the clock)
    if (horse.position.y > 0.01) horse.position.y = 0;
    this.tick.place(this.hero.position.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), A.heading);
    this.tick.target = null;
    this.tick.lookAt = null;
    this.at = 'courtyard';
  }

  // --- the courtyard -----------------------------------------------------------

  /** On foot in the courtyard; the objective is the next element (the Fire Element first). */
  toCourtyard({ keepPlace = false, from = null } = {}) {
    this.leaveRide();
    const { hero, horse, state, STATES } = this;
    this.at = 'courtyard';
    if (!keepPlace) {
      const doorAt = from ? this.gearhaven.userData.doors[from]?.at : null;
      const p = doorAt ? doorAt.clone().multiplyScalar(0.8) : new THREE.Vector3(...P2.courtyard.spawn);
      const yaw = doorAt ? Math.atan2(-p.x, -p.z) : Math.PI;
      this.onFoot(p, yaw);
      this.horseAt(p.clone().add(new THREE.Vector3(2.4, 0, 1.5)), yaw);
      horse.mode = 'idle';
      this.tick.place(p.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), yaw);
      this.behind(yaw);
    } else this.behind(hero.facing);
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    this.objective = P2.courtyard.first;
    this.ui.toast(D2.objectives[this.objective]);
  }

  // --- the Gearhaven ride ---------------------------------------------------------

  /**
   * The ride behind the Fire door: AJ on the horse at its start in the brass city (its own
   * world: the street, walls, rails, deck), the gold sky; gears from 0; checkpoints; the Fire
   * Element's door at its end (ride.onFinish → its stub).
   */
  enterRide(which = 'ride') {
    const { hero, horse, state, STATES, ui } = this;
    this.leaveRide();
    this.useRide(which);
    const { ride, rc } = this;
    this.at = which;
    this.stats.rides = (this.stats.rides ?? 0) + 1;
    this.useWorld(this.rideWorld, rc.sky);
    this.gearhaven.visible = false;
    this.rideParts.root.visible = true;
    ride.reset();
    // (the horse's own trail, checkpoints and callbacks, handed back after the ride)
    this.horseSaved = { route: horse.route, checkpoints: horse.checkpoints, last: horse.lastCheckpoint, onCheckpoint: horse.onCheckpoint, onRespawn: horse.onRespawn };
    const track = this.rideWorld.track;
    horse.setRoute(track, rc.checkpoints.map((s) => s / track.length));
    horse.onCheckpoint = (i) => {
      this.rideParts.flags[i - 1]?.userData.flag.material.color.setHex(CONFIG.checkpoints.reachedColor);
      ui.toast(DIALOGUE.checkpoint);
      if (which === 'fire') this.fire.checkpoint(i);
    };
    horse.onRespawn = () => ride.stop();
    const start = trackPoint(track, 2);
    this.horseAt(start.pos, start.heading);
    horse.scripted = horse.hold = false;
    horse.galloping = false;
    horse.stamina = 1;
    horse.mountNow(hero);
    this.tick.place(start.pos.clone().setY(P2.tick.float), start.heading);
    this.behind(start.heading);
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    this.gearProgress();
    if (which === 'fire') this.fire.onEnterRide({ fresh: this.freshFire !== false });
    else ui.toast(D2.ride.start);
  }

  /** The Fire Element's level: the furnace city (built the first time), from its start. */
  async enterFire({ fresh = true, debug = false } = {}) {
    await this.fire.build();
    this.freshFire = fresh;
    this.enterRide('fire');
    this.freshFire = true;
    if (debug) this.fire.debugStart();
  }

  /** Out of the ride (to a stub, the courtyard, anywhere): back to Gearhaven's floors and sky. */
  leaveRide({ keepFire = false } = {}) {
    const shown = !!this.rideParts?.root.visible;
    if (!keepFire && this.fire?.stage) {
      this.fire.leave(); // (out of the Fire level: its models and tints put away)
      this.gearhaven.visible = true;
      this.useWorld(this.world, GH);
    }
    if (!shown) return;
    const { hero, horse } = this;
    this.ride.stop();
    this.rideParts.root.visible = false;
    this.gearhaven.visible = true;
    this.useWorld(this.world, GH);
    this.useRide('ride');
    if (this.horseSaved) {
      horse.route = this.horseSaved.route;
      horse.checkpoints = this.horseSaved.checkpoints;
      horse.lastCheckpoint = this.horseSaved.last;
      horse.onCheckpoint = this.horseSaved.onCheckpoint;
      horse.onRespawn = this.horseSaved.onRespawn;
      this.horseSaved = null;
    }
    horse.galloping = false;
    horse.speed = 0;
    if (horse.mode !== 'idle') {
      horse.mode = 'idle';
      hero.stopRiding?.(hero.position.clone(), horse.heading);
    }
    this.ui.setGears?.(0, 0, false);
  }

  /** The hero, horse and camera on `world`; the sky and fog of `look` ({ background, fog }). */
  useWorld(world, area) {
    this.hero.world = this.horse.world = this.cam.world = world;
    // (the colours are the look's; the fog's reach is the area's — the courtyard's or the ride's)
    this.scene.fog.near = area.fog.near;
    this.scene.fog.far = area.fog.far;
  }

  /** Switch Gearhaven's look (looks.js; `name`, or the next one): everything repainted at once. */
  setLook(name = null) {
    const L = name ? applyLook(name) : nextLook();
    return L;
  }

  /** A level: today a stub platform ("coming soon") with its crystal and the door back. */
  enterLevel(id) {
    if (id === 'fire') return this.enterFire();
    this.leaveRide();
    const { state, STATES, ui } = this;
    const s = this.stubs[id];
    if (!s) return this.toCourtyard();
    this.at = id;
    this.stats.stubs[id] = (this.stats.stubs[id] ?? 0) + 1;
    const p = new THREE.Vector3(s.x, 0, P2.levels.stub.back - 2.5);
    this.onFoot(p, Math.PI);
    this.horseAt(new THREE.Vector3(3, 0, 6), Math.PI); // (it waits in the courtyard)
    this.tick.place(p.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), Math.PI);
    this.behind(Math.PI);
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    ui.toast(D2.comingSoon(D2.levelNames[id]));
  }

  /** The Part 2 ending: "To be continued... Part 3" and the summary (main.js shows it). */
  ending() {
    this.leaveRide();
    const { state, STATES } = this;
    this.at = 'ending';
    state.set(STATES.ENDING); // (from play or a cutscene)
  }

  // --- the robots test (?debug) ------------------------------------------------

  /**
   * Tick and the four mech robots in a row in the courtyard (smallest to biggest), each going
   * through its clips (`showcase.clipTime` each), a name / role / clip label over each (in the
   * browser), the camera slowly orbiting the row (a swipe turns it). AJ stands at the end for scale.
   */
  async showRobots() {
    this.leaveRide();
    const SC = P2.showcase;
    const { state, STATES } = this;
    this.at = 'robots';
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    if (!this.showcase) {
      const group = new THREE.Group();
      const kinds = Object.keys(P2.robots.kinds);
      const robots = await Promise.all(kinds.map((k) => loadRobotModel(k, this.assets ?? {})));
      if (this.at !== 'robots') return;
      const items = [{ name: 'Tick', role: 'guide', height: P2.tick.height, tick: true, animator: this.tick.model.userData.animator ?? null }];
      robots.forEach((m) => {
        group.add(m);
        items.push({ name: m.userData.name, role: m.userData.role, height: m.userData.height, model: m, animator: m.userData.animator });
      });
      // In a row along x: each slot as wide as its label or its body (whichever is wider).
      const width = (h) => Math.max(1.2, h * 0.6, labelWidth(h));
      let x = 0;
      for (const it of items) {
        it.x = x + width(it.height) / 2;
        x += width(it.height) + SC.gap;
      }
      const shift = x / 2;
      for (const it of items) {
        it.x -= shift;
        it.model?.position.set(it.x, 0, SC.z);
        // (its role clips first — idle, walk, run, attack… — then the rest of its clips)
        const all = it.animator?.clips?.map((c) => c.name) ?? (it.model ? it.model.userData.clipNames : []);
        const roles = it.animator?.roles ?? it.model?.userData.roles ?? {};
        const first = SC.roleOrder.map((r) => roles[r]?.name).filter(Boolean);
        it.clips = [...new Set([...first, ...all])];
        it.clip = 0;
        it.t = 0;
        it.label = makeLabel(it);
        if (it.label) {
          it.label.position.set(it.x, (it.tick ? P2.tick.float + it.height / 2 : it.height) + 0.5, SC.z);
          group.add(it.label);
        }
      }
      this.scene.add(group);
      this.showcase = { group, items, angle: 0, width: x };
    }
    const S = this.showcase;
    S.group.visible = true;
    // AJ for scale at the near end; the horse by him; Tick in his slot.
    const first = S.items[0];
    this.onFoot(new THREE.Vector3(first.x - 2.4, 0, SC.z + 1.5), 0);
    this.horseAt(new THREE.Vector3(first.x - 5, 0, SC.z + 3), 0);
    this.tick.place(new THREE.Vector3(first.x, P2.tick.float, SC.z), 0);
    this.tick.target = new THREE.Vector3(first.x, P2.tick.float, SC.z);
    this.tick.lookAt = new THREE.Vector3(first.x, P2.tick.float, SC.z + 20);
    for (const it of S.items) this.#playClip(it);
    this.ui.toast(D2.robotsTest);
  }

  #playClip(it) {
    const name = it.clips[it.clip % Math.max(1, it.clips.length)];
    if (name) it.animator?.play(name, { restart: true });
    it.label?.userData.draw(`${it.name} — ${it.role}`, name?.split('|').pop() ?? ''); // (no armature prefix)
  }

  // --- the props test (?debug) -------------------------------------------------

  /**
   * Every kind of kit prop in a row on its own brass strip (propsTest.js), a label over each (in the
   * browser); the camera slides along the row and back (a swipe moves it). AJ at the near end for scale.
   */
  async showProps() {
    this.leaveRide();
    const PT = P2.propsTest;
    const { state, STATES } = this;
    this.at = 'props';
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    if (!this.props) {
      const show = await buildPropsShowcase(this.assets ?? {});
      if (this.at !== 'props') return;
      show.group.position.z = PT.z;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(show.width + 12, 0.6, PT.floor.depth), makeFloorMaterial());
      strip.position.y = -0.3;
      show.group.add(strip);
      this.world.addFloor(show.items[0].x - 4, PT.z + 2.5, 4, 3.5); // (where AJ and the horse stand)
      for (const it of show.items) {
        it.label = makeLabel({ height: Math.max(5, it.height) }); // (labels sit in the row's group: hidden with it)
        if (!it.label) continue;
        it.label.position.set(it.x, it.height + 0.9, 0);
        it.label.userData.draw(it.name, '');
        show.group.add(it.label);
      }
      this.scene.add(show.group);
      this.props = { ...show, pan: 0, dir: 1 };
    }
    const S = this.props;
    S.group.visible = true;
    const first = S.items[0];
    this.onFoot(new THREE.Vector3(first.x - 3, 0, PT.z + 2), 0);
    this.horseAt(new THREE.Vector3(first.x - 5.5, 0, PT.z + 3.5), 0);
    this.tick.place(new THREE.Vector3(first.x - 2, P2.tick.float, PT.z + 3.5), 0);
    S.pan = -S.width / 2;
    this.ui.toast(D2.propsTest);
  }

  /** The camera slides along the props row and back (a swipe moves it); they animate. */
  #updateProps(dt, realDt, inp) {
    const S = this.props;
    if (!S) return;
    const C = P2.propsTest.camera;
    S.update(dt);
    S.pan += S.dir * C.speed * realDt - (inp?.lookDX ?? 0) * C.swipe * (inp?.lookSensitivity ?? 0);
    if (S.pan > S.width / 2) (S.pan = S.width / 2), (S.dir = -1);
    if (S.pan < -S.width / 2) (S.pan = -S.width / 2), (S.dir = 1);
    const c = this.cam.camera;
    const z = P2.propsTest.z;
    c.position.set(S.pan, C.height, z + C.dist);
    c.lookAt(S.pan + S.dir * C.ahead, C.look, z);
  }

  /** Each robot to its next clip every `clipTime` s; the camera orbits the row. */
  #updateShowcase(dt, realDt, inp) {
    const SC = P2.showcase;
    const S = this.showcase;
    if (!S) return;
    for (const it of S.items) {
      if (!it.tick) it.animator?.update(dt);
      if ((it.t += dt) >= SC.clipTime) {
        it.t = 0;
        it.clip++;
        this.#playClip(it);
      }
      if (dt > 0) this.sounds.robot(it, dt); // (its steps, swings, clanks and collapse)
    }
    const O = SC.orbit;
    S.angle += O.speed * realDt - (inp?.lookDX ?? 0) * (inp?.lookSensitivity ?? 0);
    const r = Math.max(O.radius, S.width * 0.75);
    const c = this.cam.camera;
    c.position.set(Math.sin(S.angle) * r, O.height, SC.z + Math.cos(S.angle) * r);
    c.lookAt(0, O.look, SC.z);
  }

  /** The quest panel: the objective with its distance, or a level's "coming soon". */
  get questText() {
    if (this.at === 'robots') return D2.robotsTest;
    if (this.at === 'props') return D2.propsTest;
    if (this.at === 'ride') return D2.ride.quest;
    if (this.at === 'fire') return D2.fire.quest;
    if (this.at === 'fireBoss') return this.questOverride ?? D2.fire.questBoss;
    if (this.at === 'fireElement') return D2.fire.questElement;
    if (this.at === 'courtyard') return D2.objectives[this.objective];
    if (this.stubs[this.at]) return D2.comingSoon(D2.levelNames[this.at]);
    return null;
  }

  // --- the loop ----------------------------------------------------------------

  /**
   * @param {number} dt  game seconds (0 in hit-stop / paused)
   * @param {number} realDt
   * @param {{ paused: boolean }} ctx
   */
  update(dt, realDt, { paused = false } = {}) {
    const { state, STATES, hero, horse, cam, cinematic, input, ui } = this;
    const playing = !paused && state.is(STATES.PLAY);
    const live = !paused && (playing || state.is(STATES.CUTSCENE));
    for (const tw of [...this.tweens]) {
      if (!live) break;
      tw.t += dt;
      if (tw.step(tw.t, dt) === true) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    let inp = null;
    const riding = this.at === 'ride' || this.at === 'fire'; // (a ride: ride.js)
    const fireRide = this.at === 'fire';
    // (in the Fire level AJ can get down and walk: the horse then stands, and ride.js leaves him alone)
    const mounted = riding && (!fireRide || horse.controlsHero);
    const fire = this.fire;
    const fight = !!fire?.stage && (this.at === 'fire' || this.at === 'fireBoss'); // (the Fire level's fighting: the Batarang and Fire Blast)
    // After the Fire Element, Fire Blast is his everywhere (the Arsenal outside the level too).
    const armed = !fight && !!fire?.built && this.elements.includes('fire') && !fire.stage;
    if (playing) {
      if (!input.enabled) input.setEnabled(true);
      inp = input.read();
      if (this.at === 'robots' || this.at === 'props') inp.moveX = inp.moveY = 0; // (AJ stands for scale; a swipe turns the view)
      else cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      inp.attackPressed = inp.dodgePressed = false; // (no melee here: the elements bring the abilities)
      const ability = inp.ability;
      inp.ability = null;
      if (ability && (fight || armed)) fire.useAbility(ability);
      if (mounted) this.ride.update(dt, inp); // (the horse carries him: rails, conveyors, cogs)
      else {
        hero.lastDt = dt;
        hero.update(dt, inp, cam.yaw);
      }
      // The HUD: no gems (the elements replace them; the ride counts brass gears), no horse
      // energy, no boss bar; Jump (and Gallop on the ride).
      input.setCombatButtons(mounted, fight || armed ? fire.arsenal : this.abilities, !(fight || armed));
      if (fireRide) {
        // The Dismount button (hold 0.4 s, only below the horse's speed limit) and, on foot beside the horse, Mount — as in Part 1,
        // all through the ride and its plaza (in the boss plaza AJ is already on foot and the horse waits by the gate).
        const DM = CONFIG.input.dismount;
        const speed = Math.abs(horse.speed);
        input.setMountButton(!horse.controlsHero && horse.canMount(hero));
        input.setDismountButton(horse.mode === 'riding', speed < DM.maxSpeed, realDt, ui.elementsRect?.() ?? null, DM.maxSpeed / Math.max(DM.maxSpeed, speed));
        if (inp.mountPressed && (horse.mode !== 'riding' || speed < DM.maxSpeed)) horse.toggle(hero);
      } else {
        input.setMountButton(false);
        input.setDismountButton(false, false, realDt, null, 1);
      }
      input.setGallopButton(mounted, DIALOGUE.gallop, horse.stamina, horse.galloping, false);
      ui.showGems(false);
      ui.setHorseEnergy(1, false, false);
      const g = fire?.guardian;
      const bossOn = this.at === 'fireBoss' && !!g?.model?.visible && g.state !== 'idle' && g.state !== 'dead';
      ui.setBossBar(bossOn, bossOn ? g.hp / g.maxHp : 1, D2.fire.bossName, bossOn && g.regenerating);
      ui.setElements?.(this.elements, true);
      this.#checkDoors();
      const goal = this.at === 'courtyard' ? this.gearhaven.userData.doors[this.objective]?.at : null;
      const dist = riding ? Math.max(0, Math.round(this.rc.door.s - this.ride.s)) : goal ? Math.round(Math.hypot(goal.x - hero.position.x, goal.z - hero.position.z)) : null;
      ui.setQuest(this.questText, dist);
    }
    if (!playing && this.ajSpot && horse.mode === 'idle') hero.puppet(this.ajSpot.pos, this.ajSpot.yaw, live ? dt : 0); // (the arrival: AJ to his place)
    hero.lastDt = live ? dt : 0; // (the rider's status timers — invincibility, the hurt blink — tick in his pose, mounted or not)
    horse.update(live ? dt : 0, mounted && playing ? inp : null, cam.yaw, hero); // (ridden only on the ride; else it stands)
    if (mounted && playing) this.ride.after(dt);
    if (fire?.stage) fire.update(live ? dt : 0, live ? realDt : 0, playing);
    else if (armed) fire.updateIdle(live && playing ? dt : 0);
    spinHorseKey(this.upgrade, live ? dt : 0);
    this.tick.update(live ? dt : 0, { position: hero.position, facing: hero.facing }); // (beside AJ, unless sent somewhere)
    this.#showBanners(paused ? 0 : realDt);
    this.sounds.update(live ? dt : 0, live && (playing || this.at === 'arrival'));
    if (riding) this.ride.animate(live ? dt : 0);
    else this.#animate(live ? realDt : 0);
    if (this.at === 'robots') this.#updateShowcase(live ? dt : 0, live ? realDt : 0, inp);
    else if (this.at === 'props') this.#updateProps(live ? dt : 0, live ? realDt : 0, inp);
    else if (cinematic.active) cinematic.update(paused ? 0 : realDt);
    else cam.update(realDt, hero.position, { mounted: horse.mounted, speed: mounted ? horse.speedRatio : 0, gallop: mounted && horse.galloping, heading: horse.heading });
    if (!cinematic.active) hero.cameraOpacity = cam.heroOpacity;
    // (the sky dome round the camera; the amber point lights on the lamps nearest AJ)
    const spots = riding ? this.rideParts.city.userData.lampSpots : this.at === 'courtyard' || this.at === 'arrival' ? this.gearhaven.userData.lampSpots : [];
    this.rig.update(cam.camera, hero.position, spots);
  }

  /** Walking into a doorway: the objective's door opens its level; a level's back door the courtyard. */
  #checkDoors() {
    const h = this.hero.position;
    const R = GH.doors.reach;
    if (this.at === 'courtyard') {
      const d = this.gearhaven.userData.doors[this.objective];
      // (the Fire door opens onto the Gearhaven ride; the others onto their stubs)
      if (d && Math.hypot(h.x - d.at.x, h.z - d.at.z) < R) this.travel(() => (this.objective === RD.quest ? this.enterRide() : this.enterLevel(this.objective)));
    } else if (this.stubs[this.at]) {
      const s = this.stubs[this.at];
      if (Math.hypot(h.x - s.door.x, h.z - s.door.z) < R) {
        const from = this.at;
        this.travel(() => this.toCourtyard({ from: P2.levels.order.includes(from) ? from : null }));
      }
    }
  }

  /** A quick white flash between places. */
  travel(go) {
    if (this.travelling) return;
    this.travelling = true;
    this.sound?.play('portal_whoosh', { volume: 0.5 });
    this.ui.fadeOut(220, async () => {
      try {
        await go(); // (a level that builds itself the first time: the white holds until it is ready)
      } finally {
        this.ui.fadeIn(420);
        this.travelling = false;
      }
    }, '#fff');
  }

  // --- the Fire level's hooks (main.js calls these in Part 2) ------------------------------------

  /** Died (and a respawn was used): back at the last checkpoint on the ride, or revived inside the plaza. */
  respawn() {
    if (this.at === 'fire') this.fire.respawn();
    else if (this.at === 'fireBoss') this.fire.reviveInArena();
    else if (this.at === 'ride') this.horse.respawnAtCheckpoint(this.hero);
  }

  /** Game Over → Retry: the Fire level again from its start (anywhere else: the courtyard). */
  retry() {
    this.cinematic.stop?.();
    this.lives?.reset?.();
    if (this.at === 'fire' || this.at === 'fireBoss' || this.at === 'fireElement') return this.enterFire();
    return this.toCourtyard();
  }

  /** An Element recovered: the HUD row; the courtyard's next objective is the next element. */
  addElement(id) {
    if (!this.elements.includes(id)) this.elements.push(id);
    this.ui.setElements?.(this.elements, true, id);
  }

  /** The Fire level is done: on to the next Element's door (its stub for now). */
  afterFire() {
    const next = P2.levels.order[P2.levels.order.indexOf('fire') + 1];
    this.objective = next;
    this.travel(() => this.enterLevel(next));
  }

  /** The gear sky, cogs, the clock's hands, steam, the open door's shimmer, the lamps. */
  #animate(dt) {
    const u = this.gearhaven.userData;
    // (draw only where we are: the courtyard, or one level's platform under the same gear sky)
    for (const [id, s] of Object.entries(this.stubs)) s.group.visible = id === this.at;
    this.time = (this.time ?? 0) + dt;
    spinGearDecor(u.decor, dt);
    u.tower.userData.update(dt);
    u.skyline.userData.update(dt);
    if (this.timeTower?.visible) this.timeTower.userData.update(dt);
    u.clock.minute.rotation.z -= GH.clock.slow * dt;
    u.clock.hour.rotation.z -= (GH.clock.slow / 12) * dt;
    for (const [id, d] of Object.entries(u.doors)) d.portal.material.opacity = id === this.objective ? 0.45 + 0.2 * Math.sin(this.time * 3) : 0.08;
    for (const s of Object.values(this.stubs)) s.crystal.rotation.y += dt;
    this.#steam(dt);
  }

  #steam(dt) {
    const ST = GH.steam;
    const u = this.gearhaven.userData;
    this.steamT -= dt;
    if (this.steamT <= 0 && dt > 0) {
      this.steamT = ST.every / ST.vents;
      const vent = u.vents[Math.floor(Math.random() * u.vents.length)];
      for (let i = 0; i < 6; i++) {
        const p = this.steam.find((q) => q.age >= ST.life);
        if (!p) break;
        p.age = -i * 0.08;
        p.pos = vent.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4));
        p.size = ST.size[0] + Math.random() * (ST.size[1] - ST.size[0]);
      }
      if (this.at === 'courtyard' && vent.distanceTo(this.hero.position) < 14) this.sound?.play('steam_hiss', { position: vent });
    }
    const m = new THREE.Matrix4();
    let n = 0;
    for (const p of this.steam) {
      if (p.age >= ST.life) continue;
      p.age += dt;
      if (p.age < 0) continue;
      const k = p.age / ST.life;
      const s = p.size * (0.5 + k * 1.4) * Math.sin(Math.min(1, k * 1.2) * Math.PI);
      u.steam.setMatrixAt(n++, m.makeScale(s, s, s).setPosition(p.pos.x, p.pos.y + k * ST.rise * ST.life * 0.5, p.pos.z));
    }
    u.steam.count = n;
    u.steam.instanceMatrix.needsUpdate = true;
  }

  /** Runs `step(t, dt)` every frame until it returns true; resolves then. */
  tween(step) {
    return new Promise((resolve) => this.tweens.push({ t: 0, step, resolve }));
  }
}

/** A robot's label width in the Robots test (bigger robots get a slightly bigger label). */
function labelWidth(height) {
  return 2 * P2.showcase.labelScale * Math.max(1, height / 3);
}

/** A name / role / clip label over a robot (browser only: a canvas sprite; none headless). */
function makeLabel(it) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  const w = labelWidth(it.height);
  sprite.scale.set(w, w / 4, 1);
  sprite.renderOrder = 20;
  sprite.userData.draw = (title, clip) => {
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(20,14,8,0.72)';
    g.beginPath();
    g.roundRect?.(8, 8, 496, 112, 22);
    g.fill();
    // (each line's font shrinks until it fits inside the label)
    const line = (text, weight, px, y, color) => {
      let size = px;
      do g.font = `${weight} ${size}px system-ui, sans-serif`;
      while (g.measureText(text).width > 468 && --size > 14);
      g.fillStyle = color;
      g.fillText(text, 256, y);
    };
    g.textAlign = 'center';
    line(title, 700, 40, 56, '#ffd88a');
    line(clip, 500, 34, 100, '#ffffff');
    tex.needsUpdate = true;
  };
  return sprite;
}
