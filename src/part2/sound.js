import { CONFIG } from '../config.js';

// Part 2's sound wiring, run once a frame by the Part 2 chapter (index.js): the music section for
// where AJ is (Gearhaven's theme, the faster one while grinding a rail — lingering a moment —,
// a stub level reusing Gearhaven's, the Part 2 ending's), the very quiet ambience loops of each
// section faded in and out between sections (the courtyard's tick-tock, gears and steam; the
// ride's factory hum), Tick's propeller hum from where he floats, the armoured horse's plates
// clinking at a trot, the horse staggering, and the robots' steps and moves in the Robots test.
// It only reads the game; the sounds play through the shared Sound / AudioManager (3D where they
// have a place). The ride's own sounds (the rails, vents, hammers, saws, belts, gears) are in
// ride.js. `loopsNow` lists the loops kept running this frame (tests).

const SND = CONFIG.part2.sound;

export class Part2Sound {
  /** @param {object} part  the Part 2 chapter (its sound, soundscape, hero, horse, tick, ride, rewards, at) */
  constructor(part) {
    this.p = part;
    this.levels = {}; // ambience name → its current level (eased toward its section's)
    this.chaseT = 0;
    this.loopsNow = new Set();
    this.stumbles = null;
    this.robots = new Map(); // showcase item → { clip, stepT }
  }

  get audio() {
    return this.p.sound?.manager ?? null;
  }

  /** Where AJ is, for the ambience: 'courtyard' / 'ride' / 'stub', or null (the ending: none). */
  get section() {
    const at = this.p.at;
    if (at === 'ride') return 'ride';
    if (at === 'fire' || at === 'fireBoss' || at === 'fireElement') return 'fire';
    if (this.p.stubs?.[at]) return 'stub';
    if (at === 'arrival' || at === 'courtyard' || at === 'robots' || at === 'props') return 'courtyard';
    return null;
  }

  /** The music for where AJ is (soundscape.musicPhase → CONFIG.audio.music.phases). */
  music(dt) {
    const { p } = this;
    if (p.ride?.grinding) this.chaseT = SND.chaseLinger;
    else this.chaseT = Math.max(0, this.chaseT - dt);
    let phase = 'gearhaven';
    if (p.at === 'ending') phase = 'part2End';
    else if (p.at === 'ride' && this.chaseT > 0) phase = 'gearhavenChase';
    else if (p.stubs?.[p.at]) phase = 'stub';
    else if (p.at === 'fire' || p.at === 'fireBoss' || p.at === 'fireElement') phase = 'elementFire';
    // the Fire theme builds once the Furnace Guardian has noticed AJ (its boss layer)
    const g = p.fire?.guardian;
    this.audio?.setMusicLayer?.('boss', p.at === 'fireBoss' && !!g && g.alive && g.state !== 'idle');
    if (p.soundscape) p.soundscape.musicPhase = phase;
    return phase;
  }

  /** Every frame (game time; 0 while paused: nothing changes). */
  update(dt, live) {
    this.loopsNow.clear();
    this.music(dt);
    if (!live || dt <= 0) return;
    const { p } = this;
    // The ambience: each section's very quiet loops, faded in / out between sections.
    const want = SND.ambience[this.section] ?? {};
    const step = dt / SND.ambienceFade; // (a full fade in or out over ambienceFade s)
    for (const name of new Set([...Object.keys(want), ...Object.keys(this.levels)])) {
      const target = want[name] ?? 0;
      const v0 = this.levels[name] ?? 0;
      this.levels[name] = v0 + Math.max(-step, Math.min(step, target - v0));
      if (this.levels[name] > 0.004) this.#loop(`amb:${name}`, name, { volume: this.levels[name] * SND.ambienceVolume });
      else delete this.levels[name];
    }
    // Tick's little propeller, from where he floats.
    const tick = p.tick;
    if (tick?.model.visible && tick.model.parent) this.#loop('tickHover', 'tick_hover', { volume: SND.tickHover, position: tick.position });
    // The armoured horse's brass plates, clinking at a trot or faster.
    const { horse } = p;
    const C = SND.clank;
    if (p.rewards?.has('armour') && horse.model.visible && horse.grounded && Math.abs(horse.speed) >= C.minSpeed) {
      this.#loop('clank', 'horse_clank', { rate: Math.min(1.8, Math.abs(horse.speed) / C.ref), volume: C.volume, position: horse.position });
    }
    // The horse staggered (a hammer, a saw).
    if (this.stumbles !== null && horse.stumbles > this.stumbles) p.sound?.play('horse_stumble', { position: horse.position });
    this.stumbles = horse.stumbles;
  }

  /**
   * The Robots test: each robot's moves as it goes through its clips — heavy steps while it walks
   * or runs (the mech boss's deeper ones), a swing as it attacks (the boss bellows first), a clank
   * when hit, a collapse as it dies, and a sword robot's alarm chirp as it starts to run (it has
   * seen AJ). All from where it stands.
   */
  robot(it, dt) {
    if (!it.model) return;
    const boss = it.model.userData.role === 'boss' || /boss/i.test(it.role ?? '');
    const sword = /sword/i.test(it.role ?? '') || /sword/i.test(it.model.userData.kind ?? '');
    const clip = (it.clips?.[it.clip % Math.max(1, it.clips.length)] ?? '').split('|').pop();
    const at = it.model.position;
    let r = this.robots.get(it);
    if (!r) this.robots.set(it, (r = { clip: null, stepT: 0 }));
    const play = (name) => this.p.sound?.play(name, { position: at });
    if (clip !== r.clip) {
      r.clip = clip;
      r.stepT = 0;
      if (/run/i.test(clip) && sword) play('robot_alert');
      if (/slash|punch|kick|shoot|attack/i.test(clip)) {
        if (boss) play('boss_mech_roar');
        play('robot_swing');
      } else if (/hit|recieve|receive/i.test(clip)) play('robot_hit');
      else if (/death|die/i.test(clip)) play(boss ? 'boss_mech_death' : 'robot_die');
    }
    if (/walk|run/i.test(clip)) {
      const every = (boss ? SND.robotStep.boss : SND.robotStep.small) * (/run/i.test(clip) ? 0.6 : 1);
      if ((r.stepT -= dt) <= 0) {
        r.stepT = every;
        play(boss ? 'boss_mech_step' : 'robot_walk');
      }
    }
  }

  /** A section left for good (Part 1 again): the music is handed back, the ambience let go. */
  stop() {
    this.levels = {};
    this.chaseT = 0;
    this.robots.clear();
  }

  #loop(key, name, o) {
    this.loopsNow.add(name);
    this.audio?.setLoop(key, name, o);
  }
}
