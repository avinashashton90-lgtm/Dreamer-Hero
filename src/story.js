import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';
import { STATES } from './state.js';

const CI = CONFIG.cinematic;
const DS = CONFIG.desert;
const EN = CONFIG.ending;
const GL = CONFIG.boss.girl;

/**
 * The end of Part 1, kept free of the DOM so it runs headless in tests:
 *  - after the boss, walking up to the girl at the cave mouth plays her cutscene
 *    (with the witch hint), then she rides behind the hero into the desert;
 *  - near the castle the horse slows, a wide sunset shot, then the ending screens;
 *  - `resetAll()` puts every system back to a new game (Play Again).
 *
 * @param {object} sys  { world, hero, horse, boss, girl, gems, abilities, combat, lives,
 *   quests, cinematic, state, cam, sound?, ui? (fadeOut/fadeIn), guide? }
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
  }

  /** Per frame. `counting`: the game clock runs (play or cutscene, not paused). */
  update(dt, counting) {
    if (counting) this.time += dt;
    const { hero, boss, horse, state } = this;
    if (!state.is(STATES.PLAY)) return;
    // The girl's scene: after the boss, on foot, close to her.
    if (this.phase === 'forest' && boss.defeated && !hero.riding && boss.girl.visible) {
      const g = boss.girl.position;
      if (Math.hypot(hero.position.x - g.x, hero.position.z - g.z) < CI.trigger) this.startGirlCutscene();
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
    this.lives.newGame();
    this.quests.reset();
    this.guide?.reset();
    this.world.activeTrack = this.world.track;
    this.world.setSunset?.(0);
    this.reset();
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

  /** Debug U: ride up to the castle → the ending. */
  async debugEnding() {
    if (this.phase !== 'desert') await this.debugDesert();
    const t = this.world.desertTrack;
    const s = t.length - DS.castle.distance * 0.35;
    const p = t.at(s);
    this.horse.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
    this.horse.heading = Math.atan2(p.tx, p.tz);
    this.horse.speed = CONFIG.horse.maxSpeed;
    this.#cameraBehindHorse();
  }
}
