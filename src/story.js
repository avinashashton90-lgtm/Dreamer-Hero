import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';
import { STATES } from './state.js';

const CI = CONFIG.cinematic;
const DS = CONFIG.desert;
const EN = CONFIG.ending;
const GL = CONFIG.boss.girl;
const EX = DS.exhaustion;
const PIT = DS.pit;
const { smoothstep } = THREE.MathUtils;

/**
 * The end of Part 1, kept free of the DOM so it runs headless in tests:
 *  - after the boss, walking up to the girl at the cave mouth plays her cutscene
 *    (with the witch hint), then she rides behind the hero into the desert;
 *  - the boss fight leaves the hero on 1 heart, exhausted (slumped, a slower horse) and more
 *    so along the desert trail, until the girl stops him at a Lazarus Pit ("Stop." scene)
 *    whose water refills his hearts — only his hearts;
 *  - near the castle the horse slows, a wide sunset shot, then the ending screens;
 *  - `resetAll()` puts every system back to a new game (Play Again).
 *
 * @param {object} sys  { world, hero, horse, boss, girl, gems, abilities, combat, lives,
 *   quests, cinematic, state, cam, pit (LazarusPit), sound?, ui? (fadeOut/fadeIn), guide? }
 */
export class Story {
  constructor(sys) {
    Object.assign(this, sys);
    this.reset();
  }

  reset() {
    this.phase = 'forest'; // forest → cutscene → desert → ending
    this.time = 0; // seconds played (play + cutscenes, not menus or pauses)
    this.girlJoined = false;
    this.endingStarted = false;
    this.exhausted = false; // since the boss: on 1 heart until the Lazarus Pit
    this.pitDone = false;
    this.recovering = false; // after drinking: the exhaustion fades away
    this.fatigue = 0; // 0..1, drives the slump, the HUD vignette and the slower horse
    this.tweens = []; // scripted movement during the pit scene
    this.actors = { hero: null, girl: null }; // { pos, yaw } while puppeted on foot
  }

  /** Per frame. `counting`: the game clock runs (play or cutscene, not paused). */
  update(dt, counting) {
    if (counting) this.time += dt;
    const { hero, boss, horse, state } = this;
    // The boss fight leaves the hero on his last heart; it stays there through the desert.
    if (boss.defeated && !this.exhausted && !this.pitDone) this.#exhaust();
    this.#updateFatigue(counting ? dt : 0);
    this.#updateScripted(counting ? dt : 0);
    this.pit?.update(counting ? dt : 0);
    if (!state.is(STATES.PLAY)) return;
    // The girl's scene: after the boss, on foot, close to her.
    if (this.phase === 'forest' && boss.defeated && !hero.riding && boss.girl.visible) {
      const g = boss.girl.position;
      if (Math.hypot(hero.position.x - g.x, hero.position.z - g.z) < CI.trigger) this.startGirlCutscene();
    }
    // The girl stops him at the Lazarus Pit (~55–60% along the desert trail).
    if (this.phase === 'desert' && !this.pitDone && horse.route === this.world.desertTrack && horse.trackS >= this.pitTriggerS) {
      this.startPitScene();
    }
    // The ending: close to the castle.
    if (this.phase === 'desert' && this.world.castlePosition) {
      const c = this.world.castlePosition;
      if (Math.hypot(horse.position.x - c.x, horse.position.z - c.z) < DS.endRange) this.startEnding();
    }
  }

  // --- The girl's cutscene ---------------------------------------------------

  /** Camera pose from the girl's point of view: offset [side, up, forward] in her frame. */
  #girlShot(name) {
    const S = CI.shots[name];
    const g = this.boss.girl.position;
    const f = new THREE.Vector3(Math.sin(GL.facing), 0, Math.cos(GL.facing));
    const r = new THREE.Vector3(Math.cos(GL.facing), 0, -Math.sin(GL.facing));
    const [side, up, fwd] = S.offset;
    return {
      pos: g.clone().addScaledVector(f, fwd).addScaledVector(r, side).setY(g.y + up),
      look: g.clone().setY(g.y + S.look),
      duration: S.duration,
    };
  }

  girlSteps() {
    const L = DIALOGUE.girlScene;
    return [
      { call: () => this.#stageGirlScene() },
      { camera: { ...this.#girlShot('establish') } },
      { say: 'hero', text: L.safe },
      { camera: { ...this.#girlShot('pushIn'), wait: false } },
      { say: 'girl', text: L.thanks, cues: [{ at: L.hintCue, call: () => this.witchHint() }] },
      { camera: { ...this.#girlShot('twoShot'), wait: false } },
      { say: 'hero', text: L.safety },
      { say: 'girl', text: L.castle },
      { call: () => this.joinAndRide(), essential: true },
    ];
  }

  async startGirlCutscene() {
    if (this.phase !== 'forest') return;
    this.phase = 'cutscene';
    this.state.set(STATES.CUTSCENE);
    await this.cinematic.play(this.girlSteps());
    if (this.state.is(STATES.CUTSCENE)) this.state.set(STATES.PLAY);
    this.#cameraBehindHorse();
  }

  /** The hero stands in front of her, facing her; she is frightened, hands clasped. */
  #stageGirlScene() {
    const { hero, horse, boss } = this;
    if (hero.riding) horse.toggle(hero);
    const g = boss.girl.position;
    const x = g.x + Math.sin(GL.facing) * CI.heroStand;
    const z = g.z + Math.cos(GL.facing) * CI.heroStand;
    hero.lastSafe.set(x, this.world.heightAt(x, z), z);
    hero.respawn();
    hero.facing = Math.atan2(g.x - x, g.z - z);
    hero.attack = null;
    hero.throwAnim = null;
    this.girl.frightened = true;
  }

  /** Eyes flicker purple, her wall shadow shows a hat and staff, an eerie sound. The hero doesn't notice. */
  witchHint() {
    this.girl.hint(CI.hintTime);
    this.sound?.play('eerie');
  }

  /**
   * She climbs on behind the hero (short fade); they come out of the cave on the desert side
   * and the ride to her castle starts. Essential: also runs when the cutscene is skipped.
   */
  async joinAndRide() {
    if (this.girlJoined) return;
    await this.ui?.fadeOutAsync?.(CI.mountFadeMs);
    const { hero, horse, boss, girl, world } = this;
    girl.frightened = false;
    girl.hintT = 0;
    boss.girlTaken = true;
    boss.girl.visible = true;
    boss.girl.scale.setScalar(1);
    horse.arrivedAtCave = true;
    horse.everMounted = true;
    horse.setRoute(world.desertTrack, DS.checkpoints);
    horse.respawnAtCheckpoint(hero); // on the horse at the desert trail's start
    horse.setPassenger(boss.girl);
    if (!this.pitDone) this.#exhaust();
    this.girlJoined = true;
    this.phase = 'desert';
    this.#cameraBehindHorse();
    this.ui?.fadeIn?.(CI.mountFadeMs);
  }

  #cameraBehindHorse() {
    if (!this.cam) return;
    this.cam.yaw = this.horse.heading + Math.PI;
    this.cam.snapTo(this.hero.position);
  }

  // --- Exhaustion and the Lazarus Pit ---------------------------------------

  get pitTriggerS() {
    return this.world.desertTrack.length * PIT.at;
  }

  /** Down to `desertArrivalHearts` (1) and exhausted. No healing until the pit. */
  #exhaust() {
    this.exhausted = true;
    this.recovering = false;
    this.lives.setHearts(DS.desertArrivalHearts);
  }

  /**
   * Fatigue: `start` once exhausted, rising along the desert trail to 1 at the pit; after
   * drinking it fades to 0 over `recover` seconds. Feeds the horse, the hero's slump and the HUD.
   */
  #updateFatigue(dt) {
    let f = 0;
    if (this.recovering) f = Math.max(0, this.fatigue - dt / EX.recover);
    else if (this.exhausted) {
      f = EX.start;
      if (this.phase === 'desert' || this.phase === 'pit') {
        const s = this.horse.route === this.world.desertTrack ? this.horse.trackS : 0;
        f = EX.start + (1 - EX.start) * smoothstep(s / this.pitTriggerS, 0, 1);
        if (this.phase === 'pit') f = Math.max(f, this.fatigue);
      }
    }
    if (this.recovering && f <= 0) this.recovering = false;
    this.fatigue = f;
    this.horse.fatigue = f;
    this.hero.exhaustion = f;
    this.ui?.setExhaustion?.(f);
  }

  /** Tweens (walking to the pit, the drink, the heal) and puppeted actors on foot. */
  #updateScripted(dt) {
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const done = tw.step(tw.t, dt) === true;
      if (done) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    const { hero, girl, actors } = this;
    if (actors.hero) hero.puppet(actors.hero.pos, actors.hero.yaw, dt);
    if (actors.girl) {
      const g = this.boss.girl;
      g.position.copy(actors.girl.pos);
      g.rotation.set(0, actors.girl.yaw, 0);
    }
    girl.walking = !!actors.girl?.moving;
  }

  /** Runs `step(t, dt)` every frame until it returns true; resolves then. */
  #tween(step) {
    return new Promise((resolve) => this.tweens.push({ t: 0, step, resolve }));
  }

  /** Horse frame: forward f, right r (trail convention: right = (-tz, tx)). */
  #frame() {
    const h = this.horse.heading;
    return { f: new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), r: new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)) };
  }

  /** Where each of them stands at the pit: on the trail side of the rim, facing the water. */
  #pitSpots() {
    const pit = this.pit.position;
    const toTrail = this.horse.position.clone().sub(pit).setY(0).normalize();
    const along = new THREE.Vector3(-toTrail.z, 0, toTrail.x);
    const spot = (dist, side) => {
      const p = pit.clone().addScaledVector(toTrail, PIT.radius + dist).addScaledVector(along, side);
      p.y = this.world.heightAt(p.x, p.z);
      return p;
    };
    const yawTo = (p) => Math.atan2(pit.x - p.x, pit.z - p.z);
    const hero = spot(PIT.standOff[0], 0.9);
    const girl = spot(PIT.standOff[1], -0.9);
    return { hero, girl, heroYaw: yawTo(hero), girlYaw: yawTo(girl), toTrail };
  }

  pitSteps() {
    const L = DIALOGUE.pitScene;
    const SH = PIT.shots;
    const { horse, girl, pit } = this;
    const behind = () => {
      // Framed on where the horse will come to a stop.
      const { f } = this.#frame();
      const p = horse.position.clone().addScaledVector(f, (horse.speed * horse.speed) / (2 * CONFIG.ending.brake));
      return {
        pos: p.clone().addScaledVector(f, -SH.behind.back).setY(p.y + SH.behind.up),
        look: p.clone().addScaledVector(f, SH.behind.ahead).setY(p.y + 1.6),
      };
    };
    const reveal = () => {
      const { f, r } = this.#frame();
      const p = horse.position;
      return {
        pos: p.clone().addScaledVector(r, SH.reveal.side).addScaledVector(f, -SH.reveal.back).setY(p.y + SH.reveal.up),
        look: pit.position.clone().setY(pit.position.y + 0.8),
      };
    };
    const sideOn = () => {
      const spots = this.#pitSpots();
      const mid = spots.hero.clone().lerp(pit.position, 0.4);
      const side = new THREE.Vector3(-spots.toTrail.z, 0, spots.toTrail.x);
      return { pos: mid.clone().addScaledVector(side, SH.sideOn.dist).setY(mid.y + SH.sideOn.up), look: mid.clone().setY(mid.y + 0.9) };
    };
    const closeUp = () => {
      const g = this.boss.girl.position;
      const h = this.hero.position;
      const dir = h.clone().sub(g).setY(0).normalize();
      return { pos: g.clone().addScaledVector(dir, SH.closeUp.dist).setY(g.y + SH.closeUp.up), look: g.clone().setY(g.y + 1.4) };
    };
    const pullBack = () => {
      const g = this.boss.girl.position;
      const mid = g.clone().lerp(this.hero.position, 0.5);
      const { toTrail } = this.#pitSpots();
      const side = new THREE.Vector3(-toTrail.z, 0, toTrail.x);
      return { pos: mid.clone().addScaledVector(side, SH.pullBack.dist * 0.8).addScaledVector(toTrail, SH.pullBack.dist * 0.6).setY(mid.y + SH.pullBack.up), look: mid.clone().setY(mid.y + 1) };
    };
    return [
      { camera: { pos: () => behind().pos, look: () => behind().look, duration: SH.behind.duration, wait: false } },
      { call: () => { girl.lookAtHero = true; } },
      { say: 'girl', text: L.stop },
      { say: 'hero', text: L.fine },
      { call: () => { girl.lookAtHero = false; girl.pointing = true; } },
      { say: 'girl', text: L.look },
      { call: () => pit.reveal() },
      { camera: { pos: () => reveal().pos, look: () => reveal().look, duration: SH.reveal.duration } },
      { camera: { pos: () => sideOn().pos, look: () => sideOn().look, duration: SH.sideOn.duration, wait: false } },
      { call: () => this.#walkToPit() },
      { call: () => this.#touchWater() },
      { say: 'girl', text: L.drink },
      { call: () => this.#drink() },
      { call: () => this.#heal() },
      { call: () => this.#faceEachOther() },
      { say: 'hero', text: L.who },
      { call: () => { girl.smiling = true; } },
      { camera: { pos: () => closeUp().pos, look: () => closeUp().look, duration: SH.closeUp.duration } },
      { wait: PIT.smileHold },
      { camera: { pos: () => pullBack().pos, look: () => pullBack().look, duration: SH.pullBack.duration } },
      { call: () => this.finishPit(), essential: true },
    ];
  }

  async startPitScene() {
    if (this.phase !== 'desert' || this.pitDone) return;
    this.phase = 'pit';
    this.horse.hold = true; // "Stop." — the horse halts, the player loses control
    this.state.set(STATES.CUTSCENE);
    await this.cinematic.play(this.pitSteps());
    if (this.state.is(STATES.CUTSCENE)) this.state.set(STATES.PLAY);
    this.#cameraBehindHorse();
  }

  /** Both get down (he on the pit side) and walk to the rim; the horse waits. */
  async #walkToPit() {
    const { hero, horse, girl, boss } = this;
    girl.pointing = false;
    horse.toggle(hero, -1); // dismount on the right (the pit side)
    // She slides down behind him.
    const seat = boss.girl.position.clone();
    horse.setPassenger(null);
    const { r } = this.#frame();
    const foot = seat.clone().addScaledVector(r, CONFIG.horse.dismountSide);
    foot.y = this.world.heightAt(foot.x, foot.z);
    this.actors.girl = { pos: seat.clone(), yaw: boss.girl.rotation.y, moving: false };
    await this.#tween((t) => {
      const k = Math.min(1, t / CONFIG.horse.mountTime);
      this.actors.girl.pos.lerpVectors(seat, foot, k);
      this.actors.girl.pos.y += Math.sin(Math.PI * k) * CONFIG.horse.mountArc;
      return k >= 1 && horse.mode === 'idle';
    });
    // Walk to the rim.
    const spots = this.#pitSpots();
    this.actors.hero = { pos: hero.position.clone(), yaw: hero.facing };
    const walk = (actor, to, yaw) => {
      const from = actor.pos.clone();
      const dist = from.distanceTo(to);
      actor.yaw = Math.atan2(to.x - from.x, to.z - from.z);
      actor.moving = true;
      return this.#tween((t) => {
        const k = Math.min(1, (t * PIT.walkSpeed) / Math.max(dist, 1e-3));
        actor.pos.lerpVectors(from, to, k);
        actor.pos.y = this.world.heightAt(actor.pos.x, actor.pos.z);
        if (k >= 1) {
          actor.yaw = yaw;
          actor.moving = false;
        }
        return k >= 1;
      });
    };
    await Promise.all([walk(this.actors.hero, spots.hero, spots.heroYaw), walk(this.actors.girl, spots.girl, spots.girlYaw)]);
  }

  /** She kneels and touches the water: it turns blue and glows, a ripple, an aura, a hum. */
  async #touchWater() {
    this.girl.kneeling = true;
    const pit = this.pit.position;
    const g = this.boss.girl.position;
    const hand = pit.clone().lerp(g, PIT.radius * 0.85 / Math.max(1e-3, g.distanceTo(pit)));
    let touched = false;
    await this.#tween((t) => {
      if (!touched && t >= PIT.kneelTime) {
        touched = true;
        this.pit.activate(hand);
      }
      return t >= PIT.kneelTime + PIT.hum;
    });
  }

  /** A cup in his hand: he scoops from the pit and sips; a blue-white pulse wraps him. */
  async #drink() {
    const D = PIT.drink;
    this.hero.drink = { t: 0 };
    let pulsed = false;
    await this.#tween((t) => {
      if (!pulsed && t >= D.scoop + D.raise) {
        pulsed = true;
        this.pit.pulse(this.hero.position);
        this.sound?.play('heal');
      }
      return t >= D.scoop + D.raise + D.sip;
    });
    this.hero.drink = null;
  }

  /** Hearts refill one by one to full; the exhaustion fades (only hearts are restored). */
  async #heal() {
    const lives = this.lives;
    this.recovering = true;
    let next = PIT.healStep;
    await this.#tween((t) => {
      if (t >= next && lives.hearts < lives.maxHearts) {
        next += PIT.healStep;
        lives.setHearts(Math.min(lives.maxHearts, Math.floor(lives.hearts) + 1));
      }
      return lives.hearts >= lives.maxHearts;
    });
  }

  /** She stands; they turn to each other. */
  #faceEachOther() {
    this.girl.kneeling = false;
    const h = this.actors.hero;
    const g = this.actors.girl;
    if (!h || !g) return;
    h.yaw = Math.atan2(g.pos.x - h.pos.x, g.pos.z - h.pos.z);
    g.yaw = Math.atan2(h.pos.x - g.pos.x, h.pos.z - g.pos.z);
  }

  /**
   * Back in the saddle with her behind him; the pit dims and the ride goes on. Essential: also
   * runs when the scene is skipped, so the hearts are always restored.
   */
  finishPit() {
    if (this.pitDone) return;
    const { hero, horse, girl, boss, lives } = this;
    this.tweens.length = 0;
    this.actors.hero = this.actors.girl = null;
    hero.drink = null;
    lives.setHearts(lives.maxHearts);
    this.exhausted = false;
    this.recovering = true;
    girl.lookAtHero = girl.pointing = girl.kneeling = girl.walking = girl.smiling = false;
    this.pit.reveal();
    this.pit.dim();
    horse.mountNow(hero);
    horse.setPassenger(boss.girl);
    horse.hold = false;
    this.pitDone = true;
    this.phase = 'desert';
    this.#cameraBehindHorse();
  }

  // --- The ending ------------------------------------------------------------

  /** The horse slows near the castle; a wide sunset shot from behind; then the ending screens. */
  async startEnding() {
    if (this.endingStarted) return;
    this.endingStarted = true;
    this.phase = 'ending';
    this.horse.hold = true;
    this.state.set(STATES.CUTSCENE);
    const horse = this.horse;
    const shot = () => {
      const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
      return {
        pos: horse.position.clone().addScaledVector(f, -EN.shot.back).setY(horse.position.y + EN.shot.height),
        look: horse.position.clone().addScaledVector(f, EN.shot.lookAhead).setY(horse.position.y + EN.shot.lookUp),
      };
    };
    await this.cinematic.play([
      { camera: { pos: () => shot().pos, look: () => shot().look, duration: EN.shot.duration } },
      { wait: EN.holdTime },
      { call: () => this.finish(), essential: true },
    ]);
  }

  finish() {
    this.phase = 'done';
    if (!this.state.is(STATES.ENDING)) this.state.set(STATES.ENDING);
  }

  /** Summary numbers for the ending screen. */
  stats() {
    const collected = Object.values(this.gems.counts).reduce((a, b) => a + b, 0);
    return { gems: collected, gemsTotal: this.gems.gems.length, time: this.time, deaths: this.lives.deaths };
  }

  // --- Play Again: everything back to a new game -----------------------------

  resetAll() {
    this.cinematic.stop();
    this.horse.setPassenger(null);
    this.hero.reset();
    this.horse.reset();
    this.gems.reset();
    this.abilities.reset();
    this.combat.reset();
    this.boss.reset();
    this.girl.reset();
    this.pit?.reset();
    this.lives.newGame();
    this.quests.reset();
    this.guide?.reset();
    this.world.activeTrack = this.world.track;
    this.world.setSunset?.(0);
    this.reset();
    this.#updateFatigue(0);
    if (this.cam) {
      this.cam.reset();
      this.cam.snapTo(this.hero.position);
    }
  }

  // --- Debug jumps -----------------------------------------------------------

  /** Boss beaten (instantly) and the girl standing at the cave mouth. */
  #bossBeaten() {
    const boss = this.boss;
    if (!boss.defeated) boss.debugDefeat();
    if (this.horse.controlsHero) this.horse.toggle(this.hero);
    this.horse.mode = 'idle';
    this.hero.riding = false;
    this.horse.everMounted = this.horse.arrivedAtCave = true;
  }

  /** Debug P: straight to the girl's cutscene. */
  debugCutscene() {
    if (this.phase !== 'forest') return;
    this.#bossBeaten();
    this.quests.goTo('enterCave');
    const g = this.boss.girl.position;
    const x = g.x + Math.sin(GL.facing) * (CI.trigger - 1);
    const z = g.z + Math.cos(GL.facing) * (CI.trigger - 1);
    this.hero.lastSafe.set(x, this.world.heightAt(x, z), z);
    this.hero.respawn();
    this.startGirlCutscene();
  }

  /** Debug O: straight to the desert ride (girl behind the hero). */
  async debugDesert() {
    if (this.phase === 'desert' || this.phase === 'ending' || this.phase === 'done') return;
    this.cinematic.stop();
    this.#bossBeaten();
    this.boss.girlTime = GL.appearTime;
    await this.joinAndRide();
    this.quests.goTo('castle');
    if (!this.state.is(STATES.PLAY)) this.state.set(STATES.PLAY);
  }

  /** Debug L: on the desert trail just before the Lazarus Pit → the "Stop." scene. */
  async debugPit() {
    if (this.phase !== 'desert') await this.debugDesert();
    if (this.phase !== 'desert' || this.pitDone) return;
    const s = this.pitTriggerS;
    const p = this.world.desertTrack.at(s);
    this.horse.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
    this.horse.heading = Math.atan2(p.tx, p.tz);
    this.horse.trackS = s;
    this.horse.mountNow(this.hero); // carry the rider (and the camera) along
    this.horse.speed = CONFIG.horse.maxSpeed * 0.5;
    this.#cameraBehindHorse();
    this.startPitScene();
  }

  /** Debug U: ride up to the castle → the ending. */
  async debugEnding() {
    if (this.phase !== 'desert') await this.debugDesert();
    if (!this.pitDone) this.finishPit(); // past the pit: healed
    const t = this.world.desertTrack;
    const s = t.length - DS.castle.distance * 0.35;
    const p = t.at(s);
    this.horse.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
    this.horse.heading = Math.atan2(p.tx, p.tz);
    this.horse.mountNow(this.hero);
    this.horse.speed = CONFIG.horse.maxSpeed;
    this.#cameraBehindHorse();
  }
}
