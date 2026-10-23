import { CONFIG, DIALOGUE } from './config.js';

// The game's sound wiring, run once a frame after every system has updated: it only reads the
// game (never changes it) and drives the AudioManager — the music section for the part of the
// story (with the boss's intense layer and the sandstorm's wind), ducking in cutscenes, the
// loops (hooves by gait and speed, the nearest bat's wings, the boss's fire, the sandstorm, the
// low-health heartbeat), and the events it can see as changes from one frame to the next (jumps
// and landings, mounting, hearts lost / gained, a death and a revive, boss states and steps,
// minions rising / dying, the castle gates, the arena barrier, grazing). Events that happen
// inside a system arrive through `on*` methods called from main.js (hits, throws, gems,
// cutscene lines).

const AU = CONFIG.audio;
const MU = AU.music;

/** "girlScene.safe"-style ids for every DIALOGUE line spoken in the cutscenes (voice files). */
function lineIds() {
  const ids = new Map();
  for (const scene of ['girlScene', 'pitScene']) {
    for (const [key, text] of Object.entries(DIALOGUE[scene] ?? {})) if (typeof text === 'string' && !/cue$/i.test(key)) ids.set(text, `${scene}_${key}`);
  }
  return ids;
}
export const LINE_IDS = lineIds();

export class Soundscape {
  /**
   * @param {import('./audio.js').AudioManager} audio
   * @param {object} game  { state, STATES, story, hero, horse, boss, minions, storm, gate, lives, abilities, arena, cam, cinematic }
   */
  constructor(audio, game) {
    this.audio = audio;
    this.g = game;
    this.prev = null;
    this.batT = 0; // bat music lingers a little after the last bat activity
    this.stepT = 0; // boss footsteps
    this.regenT = 0;
    this.eatT = 0;
    this.skelT = new Map(); // skeleton → seconds to its next rattle
    this.slimeT = 0;
    this.walkT = 0;
    this.airT = 0;
    this.horseAirT = 0;
    this.seen = new Map(); // minion → { alive }
    this.clock = 0; // seconds of sound time (for the horse's call gap)
    this.lastCall = null; // the horse's last call (never the same twice in a row)
    this.lastCallAt = -Infinity;
    this.gallopCallT = this.#nextCall(); // seconds of galloping to the next call
    this.lastSkelAt = -Infinity; // the last skeleton that rose (a new group → the horse calls)
    this.thrown = new Set(); // castle-gate skeletons already heard flying
    this.blipCount = 0;
    this.lastShown = 0;
  }

  // --- events from main.js ---

  onGem(color) {
    this.#play('gem_collect', { pitch: AU.gemPitch[color] ?? 1 });
  }

  onUnlock() {
    this.#play('ability_ready');
  }

  /** abilities.onEvent */
  onAbility(name, e) {
    const at = this.g.hero.position;
    switch (name) {
      case 'batarangThrow':
        this.#play('batarang_throw', { position: at });
        this.#play('aj_hya', { volume: 0.8 });
        break;
      case 'batarangCatch':
        this.#play('batarang_return', { position: at });
        break;
      case 'smokeThrow':
        this.#play('smoke_throw', { position: at });
        this.#play('aj_hya', { volume: 0.8 });
        break;
      case 'smokeBurst':
        this.#play('smoke_burst', { position: e?.position ?? null });
        break;
      case 'flashMode':
        this.#play('flash_charge', { position: at });
        break;
      case 'flashStrike':
        this.#play('flash_release', { position: e?.position ?? null });
        break;
      case 'abilityBlocked':
        if (e?.why === 'gems' || e?.why === 'reload' || e?.why === 'health' || e?.why === 'target') this.#play('ability_empty');
        break;
      default:
        break;
    }
  }

  /** combat.events.onSwing */
  onSwing() {
    this.#play('melee_swing', { position: this.g.hero.position });
  }

  /** combat.events.onHit: the weapon's sound plus the target's. */
  onHit(e) {
    const pos = e.position;
    if (e.source === 'batarang') this.#play('batarang_hit', { position: pos });
    else if (!e.flash) this.#play('melee_hit', { position: pos, pitch: e.heavy ? 0.85 : 1 });
    const t = e.target;
    if (t === this.g.boss) this.#play('boss_hurt', { position: pos });
    else if (t?.type === 'bat') this.#play('bat_hit', { position: pos });
    else if (t?.type === 'skeleton') this.#play('skel_hit', { position: pos });
    else if (t?.type === 'slime') this.#play('slime_squelch', { position: pos });
  }

  /** main's damageHero: AJ is hit (the heart itself is heard from the hearts changing). */
  onHeroHurt() {
    this.#play('aj_hurt');
    this.#play('aj_ugh');
  }

  /** The boss roars (noticing him, snapping out of the Smoke): Amy gasps if she is watching. */
  onBossRoar() {
    const b = this.g.boss;
    if (b.girl?.visible && !b.girlTaken) this.#play('amy_gasp', { delay: 0.25 });
    // (the horse answers if it is near: waiting in the arena)
    const h = this.g.horse;
    if (!h.fled && h.model?.visible !== false && h.position.distanceTo(b.position) < AU.horse.bossRange) this.horseCall(['horse_neigh', 'horse_scream'], 0.4);
  }

  /** A bat starts its attack (the screech): the horse shies if AJ is riding. */
  onBatAttack() {
    if (this.g.horse.controlsHero) this.horseCall(['horse_neigh', 'horse_snort'], 0.2);
  }

  /**
   * The horse's voice: one of `names`, never the one it made last time, never during dialogue,
   * at least `horse.callGap` after the last call. Returns true if it called.
   */
  horseCall(names, delay = 0) {
    const g = this.g;
    if (g.cinematic.active || g.cinematic.typing) return false;
    const now = this.clock;
    if (now - this.lastCallAt < AU.horse.callGap) return false;
    const pick = names.filter((n) => n !== this.lastCall);
    const name = (pick.length ? pick : names)[Math.floor(Math.random() * (pick.length || names.length))];
    if (!this.audio.playSound(name, { position: g.horse.position, volume: AU.horse.volume, delay })) return false;
    this.lastCall = name;
    this.lastCallAt = now;
    this.gallopCallT = this.#nextCall();
    return true;
  }

  #nextCall() {
    return AU.horseCallMin + Math.random() * (AU.horseCallMax - AU.horseCallMin);
  }

  /** A cutscene line starts (cinematic.onLine); `voice`: another voice of the speaker (AJ weak: ajWeak). */
  onLine(speaker, text, voice) {
    const id = AU.voice.speakers[speaker] ?? speaker;
    this.blipCount = 0;
    this.audio.playVoice(id, LINE_IDS.get(text) ?? 'line'); // (the file is the speaker's own: voice/aj_…)
  }

  /** The typewriter showed one more letter (cinematic.onType): a blip every few letters. */
  onType(speaker, ch, voice) {
    if (!/[\p{L}\p{N}]/u.test(ch)) return;
    const id = voice ?? AU.voice.speakers[speaker] ?? speaker;
    if (this.blipCount++ % (AU.voice.characters[id]?.charsPerBlip ?? AU.voice.charsPerBlip)) return;
    this.audio.voiceBlip(id);
  }

  /** A menu / panel button tapped. */
  onTap() {
    this.#play('ui_tap');
  }

  #play(name, o) {
    this.audio.playSound(name, o);
  }

  // --- every frame ---

  /** @param {number} dt  real seconds (0 while paused) */
  update(dt) {
    const g = this.g;
    const A = this.audio;
    this.clock += dt;
    A.setListener(g.cam.camera);
    const S = g.STATES;
    const st = g.state.current;
    const playing = st === S.PLAY;
    const inScene = st === S.CUTSCENE;
    const live = playing || inScene;

    // Music for the part of the story, ducked in cutscenes and while a line is spoken.
    A.setMusic(MU.phases[this.#phase(dt)] ?? null);
    const b = g.boss;
    A.setMusicLayer('intense', b.alive && b.active && b.hp / b.maxHp < MU.bossIntenseBelow);
    A.duck('cutscene', inScene || g.cinematic.active);
    A.duck('voice', !!g.cinematic.typing);

    if (live && dt > 0) {
      this.#loops(dt);
      this.#transitions(dt);
    }
    A.update(dt);
  }

  /** Which part of the story we are in (CONFIG.audio.music.phases picks the section). */
  #phase(dt) {
    const g = this.g;
    const S = g.STATES;
    const st = g.state.current;
    if (st === S.INTRO) return 'title';
    if (st === S.GAMEOVER) return 'gameover';
    if (st === S.ENDING) return 'ending';
    const story = g.story;
    if (story.gateStarted) return 'gate';
    if (story.phase === 'pit') return 'pit';
    if (story.phase === 'cutscene') return 'girlScene';
    if (story.phase === 'desert') {
      if (!story.desertChaseActive) return 'desertTired';
      return story.stormLevel >= MU.sandstormAt ? 'sandstorm' : 'chase';
    }
    if (story.phase === 'done') return 'ending';
    const boss = g.boss;
    const hero = g.hero.position;
    if (boss.defeated) return 'afterBoss';
    const [cx, cz] = CONFIG.cave.center;
    if (g.arena?.sealed || boss.active || Math.hypot(hero.x - cx, hero.z - cz) < MU.bossRange) return 'boss';
    // Bats coming in, waiting or attacking near him → the tense music (lingering a few seconds).
    const bat = g.minions.list.some((m) => m.type === 'bat' && m.alive && m.state !== 'flee' && m.position.distanceTo(hero) < MU.batRange);
    this.batT = bat ? 3 : Math.max(0, this.batT - dt);
    if (this.batT > 0) return 'bats';
    return g.horse.everMounted ? 'forest' : 'town';
  }

  #loops() {
    const g = this.g;
    const A = this.audio;
    const horse = g.horse;
    const GA = AU.gait;
    // Hooves: the gait loop follows the horse's real speed.
    const v = Math.abs(horse.speed);
    if (v > 0.6 && horse.grounded && !horse.inWater && !horse.fled && horse.model?.visible !== false) {
      const gait = horse.galloping || v >= GA.gallopMin ? 'hoof_gallop' : v <= GA.walkMax ? 'hoof_walk' : 'hoof_trot';
      const rate = Math.max(GA.rateClamp[0], Math.min(GA.rateClamp[1], v / GA.rateRef[gait]));
      A.setLoop('hooves', gait, { rate, position: horse.position });
    }
    // In the river: a very quiet wash while the horse stays in it (a soft splash entering: ALIASES).
    if (horse.inWater && !horse.fled) A.setLoop('water', 'river_flow', { volume: AU.riverSoundVolume, position: horse.position });
    // Heavy breathing while the horse's energy is low.
    const lowEnergy = horse.energyTired || (horse.energy ?? Infinity) < CONFIG.energy.horseEnergyMax * AU.horse.lowEnergy;
    if (lowEnergy && horse.everMounted && !horse.fled && horse.model?.visible !== false) A.setLoop('breath', 'horse_breath', { position: horse.position });
    // The nearest bat's wings.
    let bat = null;
    let bd = Infinity;
    for (const m of g.minions.list) {
      if (m.type !== 'bat' || !m.alive) continue;
      const d = m.position.distanceTo(g.hero.position);
      if (d < bd) {
        bd = d;
        bat = m;
      }
    }
    if (bat) A.setLoop('batflap', 'bat_flap', { position: bat.position });
    // The boss's fire.
    const boss = g.boss;
    if (boss.state === 'fire') A.setLoop('fire', 'boss_fire_breath', { position: boss.fireOrigin });
    // The sandstorm's wind (its strength).
    const ss = g.storm?.strength ?? 0;
    if (ss > 0.02) A.setLoop('wind', 'sandstorm_wind', { volume: ss * AU.sandstormVolume }); // (a soft low breeze)
    // A slow heartbeat on the last heart.
    const L = g.lives;
    if (L.hearts > 0 && L.hearts <= 1) A.setLoop('heart', 'low_health_beat');
  }

  #transitions(dt) {
    const g = this.g;
    const { hero, horse, boss, lives } = g;
    const now = {
      grounded: hero.grounded,
      riding: horse.controlsHero,
      horseGrounded: horse.grounded,
      mode: horse.mode,
      hearts: lives.hearts,
      dead: lives.dead,
      respawns: lives.respawns,
      boss: boss.state,
      energy: g.abilities.energy,
      gateOpening: !!g.gate?.opening,
      storm: g.storm?.strength ?? 0,
      stumbles: horse.stumbles ?? 0,
      arena: g.arena?.state,
    };
    const p = this.prev ?? now;
    this.prev = now;

    // AJ on foot: jumps and landings.
    if (!now.riding) {
      if (!hero.grounded) this.airT += dt;
      if (p.grounded && !now.grounded && hero.velocity.y > 2 && !p.riding) {
        this.#play('aj_jump', { position: hero.position });
        this.#play('aj_hup');
      }
      if (!p.grounded && now.grounded && this.airT > 0.3) this.#play('aj_land', { position: hero.position });
      if (now.grounded) this.airT = 0;
    }
    // The horse's hop and landing, mounting and getting off.
    if (now.riding) {
      if (!horse.grounded) this.horseAirT += dt;
      if (p.horseGrounded && !now.horseGrounded && horse.velocity.y > 2) this.#play('aj_hup');
      if (!p.horseGrounded && now.horseGrounded && this.horseAirT > 0.25) {
        this.#play('hoof_gallop', { position: horse.position, volume: 1.2 });
        if (this.horseAirT > AU.horse.bigLanding) this.horseCall(['horse_snort'], 0.15); // (a big jump)
      }
      if (now.horseGrounded) this.horseAirT = 0;
      // Galloping: a call now and then.
      if (horse.galloping && (this.gallopCallT -= dt) <= 0) {
        if (!this.horseCall(['horse_neigh', 'horse_scream'])) this.gallopCallT = 1;
      }
      // Riding into the sandstorm.
      const ss = g.storm?.strength ?? 0;
      if (ss >= AU.horse.stormAt && (p.storm ?? 0) < AU.horse.stormAt) this.horseCall(['horse_scream']);
    }
    // A stumble on an obstacle.
    if (now.stumbles > p.stumbles && now.riding) this.horseCall(['horse_snort', 'horse_neigh']);
    if (now.mode !== p.mode) {
      if (now.mode === 'mounting') {
        this.#play('aj_mount');
        this.#play('horse_snort', { delay: 0.35, position: horse.position });
      } else if (now.mode === 'dismounting') this.#play('aj_dismount');
    }
    // Hearts.
    if (now.hearts < p.hearts) this.#play('heart_lost');
    else if (now.hearts > p.hearts && !now.dead) this.#play('heart_gained');
    if (now.dead && !p.dead) this.#play('aj_death');
    if (now.respawns < p.respawns) this.#play('aj_revive');
    // The Flash bar full again.
    if (p.energy < 1 && now.energy >= 1) this.#play('ability_ready', { volume: 0.6 });

    // The boss.
    if (now.boss !== p.boss) {
      const at = { position: boss.position };
      if (p.boss === 'guard' && now.boss === 'chase') {
        this.#play('boss_roar', at);
        this.onBossRoar();
      } else if (now.boss === 'fireWindup') this.#play('boss_roar', { ...at, volume: 0.7, pitch: 1.1 });
      else if (now.boss === 'charge') this.#play('boss_charge', at);
      else if (now.boss === 'slam') this.#play('boss_slam', at);
      else if (now.boss === 'paralyzed') this.#play('boss_dazed', at);
      else if (now.boss === 'dying') this.#play('boss_death', at);
    }
    // Heavy steps while it walks (a small camera shake when close), faster in the charge.
    const walking = boss.state === 'chase' || boss.state === 'charge' || (boss.state === 'recover' && boss.retreating);
    if (walking && boss.model?.visible !== false) {
      this.stepT += dt * (boss.state === 'charge' ? 2.2 : boss.enraged ? CONFIG.boss.enrageWalk : 1);
      if (this.stepT >= AU.bossStepEvery) {
        this.stepT = 0;
        this.#play('boss_step', { position: boss.position });
        const near = this.audio.spatial(boss.position);
        if (near && near.gain > 0.3) g.cam.shake(AU.bossStepShake * near.gain, 0.12);
      }
    } else this.stepT = AU.bossStepEvery * 0.6;
    if (boss.regenerating) {
      this.regenT += dt;
      if (this.regenT >= AU.regenEvery) {
        this.regenT = 0;
        this.#play('boss_regen', { position: boss.position });
      }
    } else this.regenT = AU.regenEvery * 0.8;

    // Minions: rising, dying, footsteps.
    this.#minions(dt);

    // The castle gates swing open; skeletons thrown aside at the gate.
    if (now.gateOpening && !p.gateOpening) this.#play('gate_open');
    for (const pup of g.gate?.puppets ?? []) {
      if (pup.launched && !this.thrown.has(pup)) {
        this.thrown.add(pup);
        this.#play('skel_thrown_aside', { position: pup.model.position });
      } else if (!pup.launched) this.thrown.delete(pup);
    }
    // The arena barrier.
    if (now.arena !== p.arena) {
      if (now.arena === 'closing') this.#play('barrier_close');
      else if (now.arena === 'opening') this.#play('barrier_open');
    }
    // Grazing (on a grass patch, or waiting for him).
    const grazing = horse.eating || (horse.mode === 'idle' && Math.abs(horse.speed) < 0.1 && !horse.fled && !horse.scripted);
    if (grazing) {
      this.eatT += dt;
      if (this.eatT >= AU.eatEvery) {
        this.eatT = 0;
        this.#play('horse_eat', { position: horse.position });
      }
    }
  }

  #minions(dt) {
    const g = this.g;
    const hero = g.hero.position;
    const list = g.minions.list;
    let walker = null;
    let wd = Infinity;
    let hopper = null;
    let hd = Infinity;
    for (const m of list) {
      const s = this.seen.get(m);
      if (!s) {
        this.seen.set(m, { alive: m.alive });
        if (m.type === 'skeleton') {
          this.#play('skel_rattle', { position: m.position });
          // (a new group rising round the horse: it calls out)
          if (this.clock - this.lastSkelAt > AU.horse.groupGap && g.horse.controlsHero) this.horseCall(['horse_neigh', 'horse_scream'], 0.3);
          this.lastSkelAt = this.clock;
        }
        else if (m.type === 'slime') this.#play('slime_squelch', { position: m.position });
        continue;
      }
      if (s.alive && !m.alive) {
        s.alive = false;
        const at = { position: m.position };
        if (m.type === 'bat') this.#play('bat_die', at);
        else if (m.type === 'skeleton') this.#play(m.knocked ? 'skel_thrown_aside' : 'skel_die', at);
        else if (m.type === 'slime') this.#play('slime_burst', at);
      }
      if (!m.alive) continue;
      const d = m.position.distanceTo(hero);
      if (m.type === 'skeleton' && m.state === 'move' && d < wd) {
        wd = d;
        walker = m;
      }
      if (m.type === 'slime' && (m.state === 'move' || m.state === 'attack') && d < hd) {
        hd = d;
        hopper = m;
      }
      if (m.type === 'skeleton') {
        // (now and then a running skeleton rattles)
        const [a, b] = AU.skelRattleEvery;
        const left = (this.skelT.get(m) ?? a + Math.random() * (b - a)) - dt;
        if (left <= 0) {
          this.#play('skel_rattle', { position: m.position, volume: 0.6 });
          this.skelT.set(m, a + Math.random() * (b - a));
        } else this.skelT.set(m, left);
      }
    }
    // Forget removed ones.
    if (this.seen.size > list.length + 8) for (const m of this.seen.keys()) if (!list.includes(m)) this.seen.delete(m);
    if (walker) {
      this.walkT += dt;
      if (this.walkT >= AU.throttle.skel_walk * 2) {
        this.walkT = 0;
        this.#play('skel_walk', { position: walker.position });
      }
    }
    if (hopper) {
      this.slimeT += dt;
      if (this.slimeT >= AU.slimeEvery) {
        this.slimeT = 0;
        this.#play('slime_squelch', { position: hopper.position, volume: 0.6 });
      }
    }
  }
}
