import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../config.js';
import { GearhavenWorld, loadGearhavenModel, makeDoor } from './gearhaven.js';
import { Tick, loadTickModel } from './tick.js';
import { loadGearhavenHorseUpgrade, spinHorseKey } from './horseUpgrade.js';
import { loadRobotModel } from './robots.js';
import { RideWorld, Ride, loadRide } from './ride.js';
import { trackPoint } from './rideModel.js';

// Part 2 — Gearhaven (STORY.md): a chapter for levelManager.js with its own scene, floors and
// loop; it borrows the shared systems (state machine, HUD, input, camera, cutscene player,
// sound, the hero and the horse) and hands them back on exit. Today: the arrival scene (AJ and
// the horse drop out of the light into a brass courtyard; Tick), the courtyard with its five
// element doors (the first objective: "Find the Fire Element"), the Gearhaven ride behind the
// Fire door (ride.js: rails, steam vents, hazards, gears, checkpoints) to the Fire Element's
// door, a "coming soon" stub platform per element level and for Amy's final fight, the Part 2
// ending screen, and (?debug) the "Robots test" showcase of Tick and the four mech robots.

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
  }

  async init() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(GH.background);
    scene.fog = new THREE.Fog(GH.fog.color, GH.fog.near, GH.fog.far);
    scene.add(new THREE.HemisphereLight(GH.hemi.sky, GH.hemi.ground, GH.hemi.intensity));
    const sun = new THREE.DirectionalLight(GH.sun.color, GH.sun.intensity);
    sun.position.set(...GH.sun.dir).multiplyScalar(50);
    scene.add(sun);
    this.world = new GearhavenWorld();
    this.world.addFloor(0, 0, GH.floor.radius, GH.floor.wall);
    this.gearhaven = await loadGearhavenModel();
    scene.add(this.gearhaven);
    for (const p of this.gearhaven.userData.pillars) this.world.cylinders.push({ ...p, bottom: 0, top: GH.pillars.height });
    this.tick = new Tick(await loadTickModel(this.assets ?? {}));
    scene.add(this.tick.model);
    this.upgrade = await loadGearhavenHorseUpgrade();
    this.#buildStubs();
    this.steam = Array.from({ length: GH.steam.puffs }, () => ({ age: Infinity }));
    this.steamT = 0;
    // The Gearhaven ride (its own world and models; hidden until it starts).
    this.rideWorld = new RideWorld();
    this.rideParts = await loadRide(scene, this.rideWorld);
    this.ride = new Ride({ parts: this.rideParts, world: this.rideWorld, horse: this.horse, hero: this.hero, sound: this.sound, cam: this.cam, ui: this.ui });
    this.ride.onGear = (n) => {
      this.gears = (this.gears ?? 0) + 1; // (the currency, kept across rides)
      this.ui.setGears?.(n, this.ride.total, true, true);
    };
    this.ride.onFinish = () => this.#travel(() => this.enterLevel(RD.quest)); // (the Fire Element's door: its stub)
  }

  /** A platform per element level (and Amy's fight): floating far off, a crystal, a door back. */
  #buildStubs() {
    const L = P2.levels;
    this.stubs = {};
    [...L.order, 'final'].forEach((id, i) => {
      const x = (i + 1) * L.stub.gap;
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(L.stub.radius, L.stub.radius * 0.7, 1.2, 32), new THREE.MeshLambertMaterial({ color: GH.floor.color }));
      disc.position.y = -0.6;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(L.stub.crystal, 0), new THREE.MeshBasicMaterial({ color: L[id].color }));
      crystal.position.set(0, 2.2, -L.stub.radius * 0.45);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(L.stub.crystal * 2.2, 12, 8), new THREE.MeshBasicMaterial({ color: L[id].color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(crystal.position);
      const back = makeDoor(GH.floor.color);
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
    this.#leaveRide();
    if (hero.world !== this.world) this.saved = { heroWorld: hero.world, horseWorld: horse.world, camWorld: cam.world, bodies: this.cinematic.bodies };
    hero.world = horse.world = cam.world = this.world;
    for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) this.scene.add(o);
    horse.setPassenger(null);
    horse.scripted = false;
    horse.hold = false;
    horse.speed = 0;
    horse.model.add(this.upgrade); // (brass plates and a key on its back)
    hero.model.visible = horse.model.visible = true;
    this.soundscape && (this.soundscape.musicPhase = P2.music);
    this.tweens.length = 0;
    this.tick.target = this.tick.lookAt = null;
    if (this.showcase) this.showcase.group.visible = false;
    if (start === 'arrival') {
      this.playArrival(); // (not awaited: the level manager's switch is done; the scene plays on)
      return;
    }
    if (start === 'courtyard') return this.toCourtyard();
    if (start === 'ending') return this.ending();
    if (start === 'robots') return this.showRobots();
    if (start === 'ride') return this.enterRide();
    return this.enterLevel(start);
  }

  /** Back out (to Part 1): everything borrowed is handed back. */
  exit() {
    const { hero, horse, cam } = this;
    this.#leaveRide();
    if (this.saved) {
      hero.world = this.saved.heroWorld;
      horse.world = this.saved.horseWorld;
      cam.world = this.saved.camWorld;
      this.cinematic.bodies = this.saved.bodies;
      this.saved = null;
    }
    this.upgrade.removeFromParent();
    if (this.showcase) this.showcase.group.visible = false;
    if (this.soundscape) this.soundscape.musicPhase = null;
    this.tweens.length = 0;
    this.at = null;
  }

  // --- placing the riders ------------------------------------------------------

  #onFoot(p, yaw) {
    const { hero, horse } = this;
    if (horse.mode !== 'idle') horse.mode = 'idle';
    hero.riding = false;
    hero.velocity.set(0, 0, 0);
    hero.puppet(p, yaw, 0);
    hero.lastSafe.copy(p);
  }

  #horseAt(p, heading) {
    const { horse } = this;
    horse.position.copy(p);
    horse.heading = heading;
    horse.speed = 0;
    horse.grounded = true;
  }

  #behind(yaw) {
    const { cam, hero } = this;
    cam.yaw = yaw + Math.PI;
    cam.snapTo(hero.position);
  }

  // --- the arrival -------------------------------------------------------------

  /**
   * AJ and the horse drop out of the light into the courtyard (the gear sky and the clock face
   * first), he gets down; the horse has its brass key and plates; Tick floats in. Then the lines,
   * Tick's nervous "I cannot say.", and the first objective.
   */
  async playArrival() {
    const A = P2.arrival;
    const { hero, horse, state, STATES, cinematic, tick } = this;
    this.at = 'arrival';
    this.stats.arrivals++;
    if (!state.is(STATES.CUTSCENE)) state.set(STATES.CUTSCENE);
    const land = new THREE.Vector3(...A.start);
    this.#horseAt(land.clone().setY(A.drop), A.heading);
    horse.mode = 'riding';
    horse.everMounted = true;
    hero.startRiding();
    tick.place(new THREE.Vector3(...A.tickFrom), 0);
    tick.target = new THREE.Vector3(...A.tickFrom);
    const L = D2.arrival;
    const S = A.shots;
    const v = (a) => new THREE.Vector3(...a);
    // AJ, Tick and the horse talking: from in front of all three, nobody hidden.
    const talk = () => this.#talkStage().camera;
    const steps = [
      { camera: { pos: v(S.sky.pos), look: v(S.sky.look), duration: S.sky.duration } },
      { call: () => this.sound?.play('clock_chime') },
      { wait: 1.2 },
      { camera: { pos: v(S.land.pos), look: v(S.land.look), duration: S.land.duration, wait: false } },
      { call: () => this.#drop(land) },
      { wait: A.landHold },
      { call: () => this.#getDown() },
      { call: () => { this.#ajToSpot(); return this.#tickFloatsIn(); } },
      { camera: { pos: () => talk().pos, look: () => talk().look, duration: S.talk.duration, wait: false } },
      { say: 'tick', text: L.welcome },
      { say: 'aj', text: L.where },
      { say: 'tick', text: L.stops },
      { say: 'tick', text: L.witch },
      { say: 'aj', text: L.amy },
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
    return this.#tween((t) => {
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
    return this.#tween(() => horse.mode === 'idle');
  }

  /**
   * The talk's places, from where the horse stands (`arrival.stage`): the camera in front,
   * `angle`° round from the horse's nose to its right; AJ left of the horse on screen, Tick
   * between them at head height; AJ turned to Tick and a little toward the camera.
   */
  #talkStage() {
    const { horse } = this;
    const ST = P2.arrival.stage;
    const T = P2.arrival.shots.talk;
    const h = horse.position.clone().setY(0);
    const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
    const right = new THREE.Vector3(-f.z, 0, f.x); // (its right: a side −1 dismount lands here)
    const a = THREE.MathUtils.degToRad(ST.angle);
    const toCam = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
    const screenRight = new THREE.Vector3(toCam.z, 0, -toCam.x);
    const aj = h.clone().addScaledVector(screenRight, -ST.aj[0]).addScaledVector(toCam, ST.aj[1]);
    const tick = h.clone().addScaledVector(screenRight, -ST.tick[0]).addScaledVector(toCam, ST.tick[1]).setY(ST.tick[2]);
    const face = tick.clone().setY(0).sub(aj).normalize().addScaledVector(toCam, 0.8);
    const mid = h.clone().addScaledVector(screenRight, -ST.mid);
    return {
      aj, ajYaw: Math.atan2(face.x, face.z), tick, tickLook: aj.clone().addScaledVector(toCam, 1.5),
      camera: { pos: mid.clone().addScaledVector(toCam, T.dist).setY(T.up), look: mid.clone().setY(T.look) },
    };
  }

  /** AJ steps from where he got down to his place beside the horse and turns to Tick. */
  #ajToSpot() {
    const { hero } = this;
    const st = this.#talkStage();
    const from = hero.position.clone();
    const dist = Math.hypot(st.aj.x - from.x, st.aj.z - from.z);
    const walkYaw = Math.atan2(st.aj.x - from.x, st.aj.z - from.z);
    this.ajSpot = { pos: from.clone(), yaw: walkYaw };
    return this.#tween((t) => {
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
    return this.#tween(() => tick.position.distanceTo(tick.target) < 0.4);
  }

  /** The scene is over (also on Skip): on foot in the courtyard, the first objective. */
  #arrived() {
    const { hero, horse } = this;
    this.tweens.length = 0;
    const A = P2.arrival;
    const land = new THREE.Vector3(...A.start);
    if (horse.mode !== 'idle' || hero.riding) {
      // (skipped mid-scene: the horse stands where it lands, AJ on foot beside it)
      this.#horseAt(land, A.heading);
      horse.mode = 'idle';
      const st = this.#talkStage();
      this.#onFoot(st.aj, st.ajYaw);
      hero.stopRiding?.(hero.position.clone(), st.ajYaw);
    }
    this.ajSpot = null;
    if (horse.position.y > 0.01) horse.position.y = 0;
    this.tick.place(this.hero.position.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), A.heading);
    this.tick.target = null;
    this.tick.lookAt = null;
    this.at = 'courtyard';
  }

  // --- the courtyard -----------------------------------------------------------

  /** On foot in the courtyard; the objective is the next element (the Fire Element first). */
  toCourtyard({ keepPlace = false, from = null } = {}) {
    this.#leaveRide();
    const { hero, horse, state, STATES } = this;
    this.at = 'courtyard';
    if (!keepPlace) {
      const doorAt = from ? this.gearhaven.userData.doors[from]?.at : null;
      const p = doorAt ? doorAt.clone().multiplyScalar(0.8) : new THREE.Vector3(...P2.courtyard.spawn);
      const yaw = doorAt ? Math.atan2(-p.x, -p.z) : Math.PI;
      this.#onFoot(p, yaw);
      this.#horseAt(p.clone().add(new THREE.Vector3(2.4, 0, 1.5)), yaw);
      horse.mode = 'idle';
      this.tick.place(p.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), yaw);
      this.#behind(yaw);
    } else this.#behind(hero.facing);
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
  enterRide() {
    const { hero, horse, state, STATES, ui, ride } = this;
    this.#leaveRide();
    this.at = 'ride';
    this.stats.rides = (this.stats.rides ?? 0) + 1;
    this.#useWorld(this.rideWorld, RD.sky);
    this.gearhaven.visible = false;
    this.rideParts.root.visible = true;
    ride.reset();
    // (the horse's own trail, checkpoints and callbacks, handed back after the ride)
    this.horseSaved = { route: horse.route, checkpoints: horse.checkpoints, last: horse.lastCheckpoint, onCheckpoint: horse.onCheckpoint, onRespawn: horse.onRespawn };
    const track = this.rideWorld.track;
    horse.setRoute(track, RD.checkpoints.map((s) => s / track.length));
    horse.onCheckpoint = (i) => {
      this.rideParts.flags[i - 1]?.userData.flag.material.color.setHex(CONFIG.checkpoints.reachedColor);
      ui.toast(DIALOGUE.checkpoint);
    };
    horse.onRespawn = () => ride.stop();
    const start = trackPoint(track, 2);
    this.#horseAt(start.pos, start.heading);
    horse.scripted = horse.hold = false;
    horse.galloping = false;
    horse.stamina = 1;
    horse.mountNow(hero);
    this.tick.place(start.pos.clone().setY(P2.tick.float), start.heading);
    this.#behind(start.heading);
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    ui.setGears?.(0, ride.total, true);
    ui.toast(D2.ride.start);
  }

  /** Out of the ride (to a stub, the courtyard, anywhere): back to Gearhaven's floors and sky. */
  #leaveRide() {
    if (!this.rideParts?.root.visible) return;
    const { hero, horse } = this;
    this.ride.stop();
    this.rideParts.root.visible = false;
    this.gearhaven.visible = true;
    this.#useWorld(this.world, GH);
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
  #useWorld(world, look) {
    this.hero.world = this.horse.world = this.cam.world = world;
    this.scene.background.set(look.background);
    this.scene.fog.color.set(look.fog.color);
    this.scene.fog.near = look.fog.near;
    this.scene.fog.far = look.fog.far;
  }

  /** A level: today a stub platform ("coming soon") with its crystal and the door back. */
  enterLevel(id) {
    this.#leaveRide();
    const { state, STATES, ui } = this;
    const s = this.stubs[id];
    if (!s) return this.toCourtyard();
    this.at = id;
    this.stats.stubs[id] = (this.stats.stubs[id] ?? 0) + 1;
    const p = new THREE.Vector3(s.x, 0, P2.levels.stub.back - 2.5);
    this.#onFoot(p, Math.PI);
    this.#horseAt(new THREE.Vector3(3, 0, 6), Math.PI); // (it waits in the courtyard)
    this.tick.place(p.clone().add(new THREE.Vector3(-1.3, P2.tick.float, 0)), Math.PI);
    this.#behind(Math.PI);
    if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
    ui.toast(D2.comingSoon(D2.levelNames[id]));
  }

  /** The Part 2 ending: "To be continued... Part 3" and the summary (main.js shows it). */
  ending() {
    this.#leaveRide();
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
    this.#leaveRide();
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
    this.#onFoot(new THREE.Vector3(first.x - 2.4, 0, SC.z + 1.5), 0);
    this.#horseAt(new THREE.Vector3(first.x - 5, 0, SC.z + 3), 0);
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
    if (this.at === 'ride') return D2.ride.quest;
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
    const riding = this.at === 'ride'; // (the Gearhaven ride: on the horse, ride.js)
    if (playing) {
      if (!input.enabled) input.setEnabled(true);
      inp = input.read();
      if (this.at === 'robots') inp.moveX = inp.moveY = 0; // (AJ stands for scale; a swipe turns the view)
      else cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      inp.attackPressed = inp.dodgePressed = false; // (no fighting here yet: the elements will bring abilities)
      inp.ability = null;
      if (riding) this.ride.update(dt, inp); // (the horse carries him: rails, conveyors, cogs)
      else {
        hero.lastDt = dt;
        hero.update(dt, inp, cam.yaw);
      }
      // The HUD: no gems (the elements replace them; the ride counts brass gears), no horse
      // energy, no boss bar; Jump (and Gallop on the ride).
      input.setCombatButtons(riding, this.abilities, true);
      input.setMountButton(false);
      input.setDismountButton(false, false, realDt, null, 1);
      input.setGallopButton(riding, DIALOGUE.gallop, horse.stamina, horse.galloping, false);
      ui.showGems(false);
      ui.setHorseEnergy(1, false, false);
      ui.setBossBar(false, 1, '', false);
      this.#checkDoors();
      const goal = this.at === 'courtyard' ? this.gearhaven.userData.doors[this.objective]?.at : null;
      const dist = riding ? Math.max(0, Math.round(RD.door.s - this.ride.s)) : goal ? Math.round(Math.hypot(goal.x - hero.position.x, goal.z - hero.position.z)) : null;
      ui.setQuest(this.questText, dist);
    }
    if (!playing && this.ajSpot && horse.mode === 'idle') hero.puppet(this.ajSpot.pos, this.ajSpot.yaw, live ? dt : 0); // (the arrival: AJ to his place)
    horse.update(live ? dt : 0, riding && playing ? inp : null, cam.yaw, hero); // (ridden only on the ride; else it stands)
    if (riding && playing) this.ride.after(dt);
    spinHorseKey(this.upgrade, live ? dt : 0);
    this.tick.update(live ? dt : 0, { position: hero.position, facing: hero.facing }); // (beside AJ, unless sent somewhere)
    if (riding) this.ride.animate(live ? dt : 0);
    else this.#animate(live ? realDt : 0);
    if (this.at === 'robots') this.#updateShowcase(live ? dt : 0, live ? realDt : 0, inp);
    else if (cinematic.active) cinematic.update(paused ? 0 : realDt);
    else cam.update(realDt, hero.position, { mounted: horse.mounted, speed: riding ? horse.speedRatio : 0, gallop: riding && horse.galloping, heading: horse.heading });
    if (!cinematic.active) hero.cameraOpacity = cam.heroOpacity;
  }

  /** Walking into a doorway: the objective's door opens its level; a level's back door the courtyard. */
  #checkDoors() {
    const h = this.hero.position;
    const R = GH.doors.reach;
    if (this.at === 'courtyard') {
      const d = this.gearhaven.userData.doors[this.objective];
      // (the Fire door opens onto the Gearhaven ride; the others onto their stubs)
      if (d && Math.hypot(h.x - d.at.x, h.z - d.at.z) < R) this.#travel(() => (this.objective === RD.quest ? this.enterRide() : this.enterLevel(this.objective)));
    } else if (this.stubs[this.at]) {
      const s = this.stubs[this.at];
      if (Math.hypot(h.x - s.door.x, h.z - s.door.z) < R) {
        const from = this.at;
        this.#travel(() => this.toCourtyard({ from: P2.levels.order.includes(from) ? from : null }));
      }
    }
  }

  /** A quick white flash between places. */
  #travel(go) {
    if (this.travelling) return;
    this.travelling = true;
    this.sound?.play('portal_whoosh', { volume: 0.5 });
    this.ui.fadeOut(220, () => {
      go();
      this.ui.fadeIn(420);
      this.travelling = false;
    }, '#fff');
  }

  /** The gear sky, cogs, the clock's hands, steam, the open door's shimmer, the lamps. */
  #animate(dt) {
    const u = this.gearhaven.userData;
    // (draw only where we are: the courtyard, or one level's platform under the same gear sky)
    for (const [id, s] of Object.entries(this.stubs)) s.group.visible = id === this.at;
    this.time = (this.time ?? 0) + dt;
    for (const g of u.skyGears) g.mesh.rotation.z += g.speed * dt;
    for (const c of u.cogs) c.mesh.rotation.z += c.speed * dt;
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
  #tween(step) {
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
