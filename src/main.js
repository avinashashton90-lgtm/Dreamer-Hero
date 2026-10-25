import * as THREE from 'three';
import './style.css';
import { CONFIG, DIALOGUE, abilityGemCost } from './config.js';
import { GameState, STATES } from './state.js';
import { World } from './world.js';
import { Hero } from './hero.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Cutscene } from './cutscene.js';
import { Quests } from './quests.js';
import { Horse } from './horse.js';
import { JumpGuide } from './guides.js';
import { Gems } from './gems.js';
import { Abilities } from './abilities.js';
import { Sound, AudioManager } from './audio.js';
import { Soundscape } from './soundscape.js';
import { AudioPanel, AudioTestPanel } from './audioPanel.js';
import audioFiles from 'virtual:audio-files'; // (the files the build found in public/audio/)
import { Combat } from './combat.js';
import { Lives } from './lives.js';
import { Boss } from './boss.js';
import { Girl } from './girl.js';
import { Cinematic } from './cinematic.js';
import { Story } from './story.js';
import { Minions } from './minions.js';
import { LazarusPit } from './pit.js';
import { CornerRescue } from './rescue.js';
import { characterBodies } from './fade.js';
import { Sandstorm } from './sandstorm.js';
import { CastleGate } from './gate.js';
import { TestMenu, testMenuWanted, saveTestMenu } from './testMenu.js';
import { Hurdles } from './hurdles.js';
import { HorseEnergy } from './energy.js';
import { SealedArena } from './arena.js';
import { LevelManager } from './levelManager.js';

async function boot() {
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  const renderer = new THREE.WebGLRenderer({ antialias: CONFIG.render.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  app.appendChild(renderer.domElement);

  const ui = new UI(overlay);
  ui.setLoading(0);

  const world = new World();
  await world.init();

  // The Mixamo hero and the glTF horse (each falls back to its placeholder if loading fails).
  // One loading bar over the downloads (shares by size): the hero, the horse, the boss, the girl.
  const SH = CONFIG.heroModel.loadShares;
  const hero = new Hero(world.scene, world, { onProgress: (f) => ui.setLoading(f * SH.hero) });
  await hero.init();

  // Sound: the AudioManager (files from public/audio/ or synthesized fallbacks; it starts on the
  // first touch) behind the `sound` facade every system holds; soundscape.js wires it up below.
  const audio = new AudioManager({ files: audioFiles });
  const sound = new Sound(audio);
  let soundscape = null; // (built once every system exists)
  const horse = new Horse(world.scene, world, { onProgress: (f) => ui.setLoading(SH.hero + f * SH.horse) });
  horse.sound = sound;
  await horse.init();

  const cam = new FollowCamera(window.innerWidth / window.innerHeight, world);
  cam.snapTo(hero.position);

  const input = new Input(renderer.domElement, overlay);
  const cutscene = new Cutscene(overlay);
  cutscene.el.appendChild(ui.creditsButton()); // (the title: the intro's first screen)
  const quests = new Quests(world.scene, world, ui, horse);
  await quests.init();
  // Combat: melee combo + lock-on, abilities, hearts/respawns, the cave monster.
  let hitStop = 0; // seconds of frozen action left (heavy hits)
  const combat = new Combat(world.scene, hero, {
    onHit: (e) => {
      const p = e.position.clone().project(cam.camera);
      if (p.z < 1) ui.damageNumber(((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight, Math.round(e.amount * 10) / 10, e.flash ? 'flash' : e.heavy ? 'heavy' : '');
      cam.shake(e.shake, CONFIG.combat.shake.time);
      hitStop = Math.max(hitStop, e.hitStop);
      soundscape?.onHit(e);
    },
    onSwing: () => soundscape?.onSwing(),
    // (a defeated minion drops its gem itself, after its death clip and fade: minions.js)
  });
  await combat.init();
  const abilities = new Abilities(hero, world.scene, world, combat);
  await abilities.init();
  combat.abilities = abilities;
  abilities.onEvent = (name, e) => {
    if (name === 'abilityBlocked') {
      // Can't use it: the button only shakes (no toast in the middle of the action).
      input.shakeAbility(e.name);
    }
    if (name === 'flashStrike') ui.screenFlash();
    if (name === 'paralyzed') sound.play('paralyze');
    if (name === 'smokeResisted') ui.toast(DIALOGUE.smokeResisted);
    soundscape?.onAbility(name, e);
  };
  let damageHero = () => false; // defined below (needs the state machine)
  let arena = null; // the sealed boss arena (built below)
  const boss = new Boss(world.scene, world, {
    onHitHero: (hearts, x, z, opts) => damageHero(hearts, x, z, opts),
    onSlam: () => cam.shake(CONFIG.boss.slam.shake, CONFIG.combat.shake.time * 1.6),
    onWake: () => {
      sound.play('bossRoar'); // (noticing him, snapping out of a Smoke Bomb paralysis)
      soundscape?.onBossRoar(); // (Amy gasps)
    },
    onNotice: () => arena.notice(), // it saw him: the arena seals behind him
    onDefeat: () => {
      ui.banner(DIALOGUE.victory);
      minions.despawnSlimes(); // (its slimes melt away)
    },
    // Every slam cracks the ground: slimes emerge (2, or 3 below 50% HP).
    onCrack: (at) => minions.slimesFromCrack(at, boss.enraged),
    onHpMark: (i) => {
      gems.revealRing(i); // below 75 / 50 / 25%: a ring of gems at the arena's edge
      ui.toast(DIALOGUE.arenaGems);
    },
  }, {
    monster: { onProgress: (f) => ui.setLoading(SH.hero + SH.horse + f * SH.boss) },
    girl: { onProgress: (f) => ui.setLoading(SH.hero + SH.horse + SH.boss + f * SH.girl) },
  });
  await boss.init(); // (loads the monster and the girl)
  ui.setLoading(null);
  combat.addTarget(boss);
  quests.boss = boss;
  const girl = new Girl(world.scene, boss.girl);
  await girl.init();
  const lives = new Lives({ onChange: (l) => ui.setLives(l.hearts, l.maxHearts, l.respawns, CONFIG.lives.respawns) });
  abilities.lives = lives; // Flash also costs 30% of the hearts (none in the sealed boss arena)

  const gems = new Gems(world.scene, world, {
    onCollect: (color) => {
      ui.setGems(gems.counts);
      soundscape?.onGem(color);
    },
    onSpend: () => ui.setGems(gems.counts),
    onUnlock: (color, ability) => {
      soundscape?.onUnlock();
      abilities.unlock(ability);
      ui.pulseGem(color);
      input.pulseAbility(ability);
      ui.toast(DIALOGUE.unlocked(DIALOGUE.abilityNames[ability]));
    },
  });
  await gems.init();
  ui.setGems(gems.counts);
  abilities.gems = gems; // every use spends gems (5 of its colour)
  const guide = new JumpGuide(world.scene, world);
  await guide.init();

  hero.onRespawn = (p) => {
    ui.flash();
    cam.snapTo(p);
  };
  horse.onRespawn = hero.onRespawn;
  horse.onCheckpoint = () => {
    ui.toast(DIALOGUE.checkpoint);
    minions.onCheckpoint(); // (no bats in the first seconds after a checkpoint)
  };
  // Once the hero has ridden, falls/deaths put him back on the horse at the last checkpoint
  // (inside the sealed arena: back in the arena on foot).
  hero.onFall = () => {
    if (arena?.sealed) {
      arena.respawnHero();
      return true;
    }
    if (!horse.everMounted) return false;
    horse.respawnAtCheckpoint(hero);
    return true;
  };
  const state = new GameState(STATES.INTRO);

  // Cinematic cutscenes and the end of Part 1 (girl's scene → desert ride → ending).
  let cinematic = null;
  cinematic = new Cinematic(cam, ui.cinematicView(() => cinematic.tap(), () => cinematic.skip()));
  // (every cutscene camera keeps its distance from AJ, Amy and the horse, and fades them when close)
  cinematic.bodies = characterBodies({ hero, girlModel: boss.girl, horse });
  const pit = new LazarusPit(world.scene, world, sound);
  await pit.init();
  // Small enemies: forest bats, cave slimes (from the boss's cracks), desert skeletons. Each
  // type's model loads the first time one spawns.
  const minions = new Minions(world.scene, world, {
    hero, horse, combat, abilities, gems,
    camera: cam.camera, // (bats stay inside the view while coming in, waiting and attacking)
    onHitHero: (hearts, x, z, opts) => damageHero(hearts, x, z, opts),
    onEvent: (name) => {
      if (name === 'skeletonShatter') cam.shake(CONFIG.minions.shatter.kick, CONFIG.combat.shake.time); // (a short screen kick)
      if (name === 'batScreech') {
        sound.play('batScreech'); // (the telegraph before a dive)
        soundscape?.onBatAttack(); // (the horse shies)
      }
    },
  });
  abilities.camera = cam.camera; // (billboards the mounted Batarang's target bracket)
  // Cornered (pinned against a rock with enemies close for 1.5 s): a pulse pushes them back.
  const rescue = new CornerRescue(world.scene, world, {
    hero, boss, minions, horse,
    onRear: () => {
      cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
      sound.play('rearUp');
    },
    onPulse: () => {
      cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
      sound.play('rescuePulse');
    },
  });
  await rescue.init();
  // The sandstorm chase after the Lazarus Pit, and the castle gates at the end of the ride.
  const storm = new Sandstorm(world.scene, world);
  await storm.init();
  const gate = new CastleGate(world.scene, world);
  await gate.init();
  gate.camera = cam.camera; // (its dust puffs face the camera)
  // Forest hurdles (giant walls, thorn bushes, stones), never where the bats attack.
  const hurdles = new Hurdles(world.scene, world, {
    sound,
    onHurt: (hearts, x, z) => damageHero(hearts, x, z, { source: 'hurdle', knockback: false }),
    onHint: (text) => ui.toast(text),
  });
  await hurdles.init();
  minions.scheduleBats(hurdles.batWindows());
  // The horse's energy: potions in the forest, grass patches, desert oases.
  const energy = new HorseEnergy(world.scene, world, { sound, onHint: (text) => ui.toast(text) });
  await energy.init(gems.gems);
  // The sealed boss arena: a rock barrier closes the entrance behind AJ until the boss is dead.
  arena = new SealedArena(world.scene, world, { hero, horse, boss, cam, sound, lives, gems, abilities, onToast: (text) => ui.toast(text) });
  await arena.init();
  const story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, pit, gate, storm, minions, hurdles, energy, arena, sound, ui, guide });
  // The sound wiring (reads the game every frame; never changes it), the cutscene voices, the
  // speaker button + panel, and a tap sound on menu buttons (not the game's own controls).
  soundscape = new Soundscape(audio, { state, STATES, story, hero, horse, boss, minions, storm, gate, lives, abilities, arena, cam, cinematic });
  cinematic.onLine = (speaker, text, voice) => soundscape.onLine(speaker, text, voice);
  cinematic.onType = (speaker, ch, voice) => soundscape.onType(speaker, ch, voice);
  // (holding the speaker button 3 s switches the hidden test menu on / off: see buildTestMenu)
  const audioPanel = new AudioPanel(overlay, audio, { onLongPress: () => toggleTestMenu() });
  overlay.addEventListener('pointerdown', (e) => {
    const b = e.target?.closest?.('button');
    if (b && !b.closest('.controls') && !b.matches('.btn, .mount-btn, .dismount-btn, .gallop-btn')) soundscape.onTap();
  }, true);
  quests.story = story;
  const NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };

  // --- Chapters: Part 1 (this loop and World) and Part 2 (Gearhaven, src/part2/, imported on demand) ---
  const part1 = {
    id: 'part1',
    scene: world.scene,
    enter: () => {
      // (back from Gearhaven: the hero and the horse return to this world)
      for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o);
      story.restoreRiders();
      hero.model.visible = horse.model.visible = true;
    },
    exit: () => {},
  };
  const levels = new LevelManager({
    part1: async () => part1,
    part2: async () => (await import('./part2/index.js')).createPart2({
      state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities, lives, combat, assets: {},
      damageHero: (...a) => damageHero(...a),
      getHeroState: () => dying ? (lives.hearts <= 0 ? 'downed' : 'respawning') : 'alive',
      debugEnabled: () => !!testMenu?.enabled || testMenuWanted(),
    }),
  });
  levels.chapters.set('part1', part1);
  levels.current = part1;
  levels.id = 'part1';
  const PO = CONFIG.part2.portal;
  /** Into Part 2 (the end of Part 1's portal scene, or the test menu): white, load, white clears. */
  async function goToPart2(start, { white = true } = {}) {
    if (white) await new Promise((r) => ui.fadeOut(PO.whiteOutMs, r, '#fff'));
    const chapter = await levels.load('part2', { start });
    story.restoreRiders();
    if (!chapter) {
      story.finish(); // (Part 2 failed to load: Part 1's ending screens instead)
      ui.fadeIn(PO.whiteInMs);
      return;
    }
    if (white) ui.fadeIn(PO.whiteInMs);
  }
  story.onPart1Complete = () => goToPart2('arrival');

  // --- Hearts, death and respawn ---
  let dying = false;
  let deathDelay = -1; // seconds of the death fall left before the fade
  let deathFade = null;
  const lifeEvents = {
    // Dying at the boss: it resets to full health (CONFIG.lives.bossResetsOnRespawn); the trail
    // gems from the checkpoint to the cave come back and the stock is topped up; the arena rings
    // go with the boss reset.
    // In the sealed arena (`inArena`) the boss is not reset: arena.reviveHero gave it back only part
    // of the damage, and the gem rings already shown stay.
    onRespawn: ({ inArena = false } = {}) => {
      minions.clear(); // every minion removed
      rescue.reset();
      if (!inArena) {
        boss.onHeroRespawn();
        if (!boss.defeated) gems.resetArena();
      }
      gems.restock(horse.checkpoints[horse.lastCheckpoint].s);
      energy.reset({ newGame: false }); // (the potions come back; the horse is rested: respawnAtCheckpoint)
      story.restartChase(); // (in the sandstorm chase: from the checkpoint after the pit, storm and skeletons afresh)
    },
  };
  /** The hero takes `n` hearts of damage from (fromX, fromZ); opts.knockback false for e.g. fire. */
  damageHero = (n, fromX, fromZ, opts = {}) => {
    if (levels.id === 'part2' && hero.life !== 'alive') return false; // (Part 2's one hero state: nothing hurts him while he is down or getting up)
    if (dying || hero.invincible || !state.is(STATES.PLAY)) return false;
    n = story.chaseHit(n, opts.source); // (the sandstorm chase: never below half a heart, a grace after each hit)
    if (n <= 0) return false;
    // (fire ticks every 0.8 s: no post-hit invincibility from a burn, so every tick counts)
    hero.hurt(fromX, fromZ, opts.knockback !== false, opts.source !== 'fire');
    soundscape?.onHeroHurt();
    input.unstick(); // (a hit never leaves a drag or a touch stuck: a live swipe keeps turning the camera)
    cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
    if (lives.damage(n)) {
      // Part 2 runs its own downed state (Part2.down: lie down, revive once, get up, a safety timeout) — this file's fade needs Part 1's loop
      if (levels.id === 'part2' && levels.current.down) {
        levels.current.down();
        return true;
      }
      // Out of hearts: fade out, then use a respawn (on the horse at the last checkpoint) or Game Over.
      dying = true;
      input.setEnabled(false);
      // The death fall plays first (on foot, Mixamo hero), then the fade.
      hero.die();
      deathDelay = hero.riding || !hero.model.userData.animator ? 0 : CONFIG.heroModel.deathAnimMs / 1000;
      deathFade = () => ui.fadeOut(CONFIG.lives.deathFadeMs, () => {
        if (lives.resolveDeath() === 'respawn') {
          abilities.clear();
          combat.reset();
          // (the sealed boss fight: revived inside the arena — full hearts, abilities refilled,
          // a few seconds' protection — not outside)
          const inArena = arena.sealed;
          if (levels.id === 'part2') levels.current.respawn?.(); // (Gearhaven's own: the checkpoint on its ride, or inside the Furnace Guardian's plaza)
          else {
            if (inArena) arena.reviveHero();
            else horse.respawnAtCheckpoint(hero);
            lifeEvents.onRespawn?.({ inArena });
          }
          ui.setGems(gems.counts);
          ui.fadeIn(CONFIG.lives.deathFadeMs);
          if (state.is(STATES.PLAY)) input.setEnabled(true);
        } else state.set(STATES.GAMEOVER);
        dying = false;
      });
    }
    return true;
  };

  // --- State wiring ---
  state.onEnter(STATES.INTRO, async () => {
    ui.showHud(false);
    input.setEnabled(false);
    if (levels.id !== 'part1') await levels.load('part1'); // (a new game starts in Part 1)
    await cutscene.play(DIALOGUE.intro);
    state.set(STATES.PLAY);
  });

  state.onEnter(STATES.PLAY, (prev) => {
    if (prev === STATES.INTRO) {
      // New game: everything back to the start.
      story.resetAll();
      levels.chapters.get('part2')?.newGame?.(); // (Gearhaven's gear rewards)
      rescue.reset();
      minions.clear();
      ui.setGems(gems.counts);
    } else if (prev === STATES.GAMEOVER && levels.id === 'part2') {
      // Retry in Gearhaven: the level again from its start (Part 1's ride is not touched).
      levels.current.retry?.();
      ui.fadeIn(CONFIG.lives.deathFadeMs);
    } else if (prev === STATES.GAMEOVER) {
      // Retry: full hearts and respawns, back on the horse at the start of the ride, with the
      // gems afresh (0 of each, every trail gem back, unlocks cleared). Quest progress is kept.
      lives.reset();
      abilities.reset();
      combat.reset();
      horse.restartRide(hero);
      boss.onHeroRespawn();
      arena.reset(); // (the entrance open again: the ride starts over)
      minions.clear();
      rescue.reset();
      gems.reset();
      energy.reset();
      ui.setGems(gems.counts);
      ui.fadeIn(CONFIG.lives.deathFadeMs);
    }
    ui.showHud(true);
    input.setEnabled(true);
  });
  state.onExit(STATES.PLAY, () => input.setEnabled(false));

  state.onEnter(STATES.GAMEOVER, () => {
    ui.showHud(false);
    ui.showGameOver(true, () => state.set(STATES.PLAY));
    ui.fadeIn(CONFIG.lives.deathFadeMs);
  });
  state.onExit(STATES.GAMEOVER, () => ui.showGameOver(false));

  // Cutscenes: no controls and no HUD buttons.
  state.onEnter(STATES.CUTSCENE, () => {
    minions.clear(); // never in a cutscene
    ui.showHud(false);
    input.setEnabled(false);
  });

  // Ending: title, then the summary. Play Again = a full reset, then the intro. (Part 2's ending:
  // "To be continued... Part 3".)
  state.onEnter(STATES.ENDING, () => {
    ui.showHud(false);
    input.setEnabled(false);
    const P2D = DIALOGUE.part2;
    const titles = levels.id === 'part2' ? { title: P2D.toBeContinued, heading: P2D.summaryTitle, next: P2D.nextPart } : undefined;
    ui.showEnding(true, story.stats(), async () => {
      if (levels.id !== 'part1') await levels.load('part1'); // (the hero and the horse back in Part 1's world first)
      story.resetAll();
      rescue.reset();
      minions.clear();
      ui.setGems(gems.counts);
      state.set(STATES.INTRO);
    }, titles);
  });
  state.onExit(STATES.ENDING, () => ui.showEnding(false));

  ui.onOrientationChange((portrait) => {
    state.paused = portrait;
    if (state.is(STATES.PLAY)) input.setEnabled(!portrait);
  });
  state.paused = ui.isPortrait();

  /** Debug T (and the test menu's "Boss fight"): on foot at the arena entrance, the horse waiting beside it. */
  function teleportArena() {
    const [cx, cz] = CONFIG.cave.center;
    const x = cx - CONFIG.cave.radius - 4;
    if (horse.controlsHero) horse.toggle(hero);
    horse.mode = 'idle';
    hero.riding = false;
    hero.shadow.visible = true;
    horse.position.set(x - 4, world.heightAt(x - 4, cz + 3), cz + 3);
    horse.everMounted = horse.arrivedAtCave = true;
    horse.lastCheckpoint = horse.checkpoints.length - 1;
    hero.lastSafe.set(x, world.heightAt(x, cz), cz);
    hero.respawn();
    hero.facing = Math.PI / 2;
    cam.yaw = -Math.PI / 2;
    cam.snapTo(hero.position);
  }

  // --- Hidden test menu (?debug): jump straight to any part of the game ---
  // The hidden test menu: built when wanted (?debug in the link, or switched on by holding the
  // HUD speaker button 3 s — remembered in localStorage until held again).
  let testMenu = null;
  function toggleTestMenu() {
    const on = !testMenu?.enabled;
    saveTestMenu(on);
    if (on) buildTestMenu();
    else testMenu?.setEnabled(false);
    ui.toast(on ? DIALOGUE.testMenu.on : DIALOGUE.testMenu.off);
    try {
      navigator.vibrate?.(CONFIG.testMenu.vibrate);
    } catch {
      /* (no vibration here) */
    }
  }
  if (testMenuWanted()) buildTestMenu();
  function buildTestMenu() {
    if (testMenu) {
      testMenu.setEnabled(true);
      return;
    }
    const TM = CONFIG.testMenu;
    const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const behindHorse = () => {
      cam.yaw = horse.heading + Math.PI;
      cam.snapTo(hero.position);
    };
    /** Out of whatever is running (intro, a cutscene, Game Over, the ending) into a fresh game in play. */
    const freshPlay = async () => {
      if (levels.id !== 'part1') await levels.load('part1'); // (out of Part 2 first)
      if (state.is(STATES.ENDING)) state.set(STATES.INTRO);
      if (state.is(STATES.INTRO)) cutscene.finish(); // (entering play from the intro resets everything)
      if (state.is(STATES.CUTSCENE)) cinematic.stop();
      if (!state.is(STATES.PLAY)) state.set(STATES.PLAY);
      while (!state.is(STATES.PLAY)) await nextFrame();
      story.resetAll(); // (the same full reset as Play Again)
      levels.chapters.get('part2')?.newGame?.();
      rescue.reset();
      minions.clear();
    };
    /** Full hearts and `abilityUses` uses of every ability (unlocked). */
    const kit = () => {
      lives.setHearts(lives.maxHearts);
      horse.restoreEnergy(); // (full horse energy at every starting point)
      for (const [color, ability] of Object.entries(CONFIG.gems.abilities)) {
        gems.counts[color] = TM.abilityUses * abilityGemCost(ability);
        gems.unlocked.add(color);
        abilities.unlock(ability);
      }
      ui.setGems(gems.counts);
    };
    /** Through the Lazarus Pit scene (Skip): the chase starts as the ride resumes. */
    const pastPit = async () => {
      await story.debugPit();
      await cinematic.skip();
      while (!state.is(STATES.PLAY)) await nextFrame();
    };
    const jumps = {
      forest: async () => {
        horse.restartRide(hero); // on the horse at the start of the forest ride
        quests.goTo('ride');
        behindHorse();
      },
      hurdles: async () => {
        // On the horse a little before the first forest hurdle.
        const t = world.track;
        const s = Math.max(0, (hurdles.list[0]?.s ?? t.length * 0.2) - TM.hurdleApproach);
        const p = t.at(s);
        horse.restartRide(hero);
        horse.position.set(p.x, world.heightAt(p.x, p.z), p.z);
        horse.heading = Math.atan2(p.tx, p.tz);
        horse.trackS = s;
        horse.mountNow(hero);
        quests.goTo('ride');
        behindHorse();
      },
      cave: async () => {
        // On the horse on the trail just short of the arena (it auto-dismounts there).
        const t = world.track;
        const [cx, cz] = CONFIG.cave.center;
        let s = t.length;
        while (s > 0 && Math.hypot(t.at(s).x - cx, t.at(s).z - cz) < TM.caveApproach) s -= 1;
        const p = t.at(s);
        horse.restartRide(hero);
        horse.checkpoints.forEach((cp) => (cp.reached = true));
        horse.lastCheckpoint = horse.checkpoints.length - 1;
        horse.position.set(p.x, world.heightAt(p.x, p.z), p.z);
        horse.heading = Math.atan2(p.tx, p.tz);
        horse.trackS = s;
        horse.mountNow(hero);
        quests.goTo('ride');
        behindHorse();
      },
      boss: async () => {
        // Straight into the sealed fight: AJ inside, the barrier shut, the horse by the entrance, Amy watching.
        teleportArena();
        arena.sealNow();
        quests.goTo('cave');
      },
      afterBoss: () => story.debugDesert(),
      pit: () => story.debugPit(),
      chase: pastPit,
      storm: async () => {
        await pastPit();
        story.chaseTime = CONFIG.desert.chase.stormDelay + CONFIG.desert.chase.stormBuild; // (the storm at full strength)
        storm.strength = 1;
      },
      gate: () => story.debugGate(),
    };
    // Part 2: the portal scene (the end of Part 1), Gearhaven, the element levels (stubs for now),
    // Amy's final fight (a stub) and the Part 2 ending.
    const part2Jumps = {
      portal: () => story.debugPortal(),
      arrival: () => goToPart2('arrival', { white: false }),
      ride: () => goToPart2('ride', { white: false }), // (the first playable section: rails, steam, hazards, gears → the Fire door)
      ...Object.fromEntries(CONFIG.part2.levels.order.map((id) => [id, () => goToPart2(id, { white: false })])),
      fireBoss: () => goToPart2('fireBoss', { white: false }),     // (the Furnace Guardian's sealed plaza)
      firePlaza: () => goToPart2('firePlaza', { white: false }),   // (the chest plaza, with 2 cog keys)
      final: () => goToPart2('final', { white: false }),
      part2Ending: () => goToPart2('ending', { white: false }),
      robots: () => goToPart2('robots', { white: false }), // (Tick and the four mech robots in a row, each playing its clips)
      props: () => goToPart2('props', { white: false }), // (every kind of kit prop in a row: gears, saw, conveyor, pipe, catwalk, rail, clock tower, castle gate)
    };
    const item = ([key, jump]) => ({
      label: DIALOGUE.testMenu[key],
      run: async () => {
        await freshPlay();
        await jump();
        kit();
      },
    });
    const audioTest = new AudioTestPanel(overlay, audio);
    testMenu = new TestMenu(overlay, [
      { info: () => DIALOGUE.testMenu.invulnerable(hero.invincible) },
      { info: () => DIALOGUE.testMenu.heroState(hero.life) },
      { header: DIALOGUE.testMenu.part1 },
      ...Object.entries(jumps).map(item),
      { header: DIALOGUE.testMenu.part2 },
      ...Object.entries(part2Jumps).map(item),
      // Gearhaven's look (verdigris / midnight / sunrise): cycles at once if Part 2 is loaded (else when it is).
      {
        label: () => DIALOGUE.testMenu.look(CONFIG.part2.looks[CONFIG.part2.gearhavenLook].name),
        keepOpen: true,
        run: () => {
          const p2 = levels.chapters.get('part2');
          if (p2?.setLook) p2.setLook();
          else {
            const order = CONFIG.part2.looks.order;
            CONFIG.part2.gearhavenLook = order[(order.indexOf(CONFIG.part2.gearhavenLook) + 1) % order.length];
          }
          ui.toast(CONFIG.part2.looks[CONFIG.part2.gearhavenLook].name);
        },
      },
      // Gear rewards: collects `giveGears` of the Gearhaven ride's gears (onto the ride first if
      // not on it — press again for the next tier).
      {
        label: DIALOGUE.testMenu.giveGears(TM.giveGears),
        run: async () => {
          if (levels.id !== 'part2' || levels.current.at !== 'ride') {
            await freshPlay();
            await part2Jumps.ride();
            kit();
          }
          levels.current.giveGears?.(TM.giveGears);
        },
      },
      // Cog keys for the chests: `giveKeys` at once (onto the Fire level first if not on it).
      {
        label: DIALOGUE.testMenu.giveKeys(TM.giveKeys),
        run: async () => {
          if (levels.id !== 'part2' || !['fire', 'fireBoss'].includes(levels.current.at)) {
            await freshPlay();
            await part2Jumps.firePlaza();
            kit();
          }
          levels.current.giveKeys?.(TM.giveKeys);
        },
      },
      ...[
        ['giveShield', 'giveShield'],
        ['giveAllElements', 'giveAllElements'],
        ['giveFireOnly', 'giveFireOnly'],
      ].map(([label, method]) => ({
        label: DIALOGUE.testMenu[label],
        keepOpen: true,
        run: async () => {
          if (levels.id !== 'part2') {
            await freshPlay();
            await goToPart2('courtyard', { white: false });
          }
          levels.current[method]?.();
        },
      })),
      { label: DIALOGUE.testMenu.audio, run: () => audioTest.open() }, // (every sound, the music sections)
    ]);
  }

  // --- Resize ---
  const onResize = () => {
    renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), window.devicePixelRatio, CONFIG.render.maxPixelRatio)); // (keeps an adapted lower ratio)
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.setAspect(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // --- Loop ---
  const timer = new THREE.Timer();
  timer.connect(document); // (no huge step after the tab was hidden)
  // Adaptive resolution: a phone that can't keep up steps the pixel ratio down (and back up).
  const AD = CONFIG.render.adaptive;
  const maxRatio = () => Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio);
  let slowT = 0, fastT = 0;
  const adaptResolution = (frameDt) => {
    if (frameDt <= 0 || frameDt >= 0.25) return; // (a hitch or a hidden tab says nothing)
    const fps = 1 / frameDt;
    slowT = fps < AD.lowFps ? slowT + frameDt : 0;
    fastT = fps > AD.highFps ? fastT + frameDt : 0;
    const now = renderer.getPixelRatio();
    let next = now;
    if (slowT > AD.window) next = Math.max(Math.min(AD.minPixelRatio, maxRatio()), now - AD.step);
    else if (fastT > AD.window) next = Math.min(maxRatio(), now + AD.step);
    if (next !== now) {
      renderer.setPixelRatio(next);
      slowT = fastT = 0;
    }
  };
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const frameDt = timer.getDelta();
    adaptResolution(frameDt);
    const realDt = Math.min(frameDt, 0.05); // clamp to avoid tunnelling after tab switches
    // Hit-stop: heavy hits freeze the action for a moment (the camera keeps going).
    const dt = hitStop > 0 ? 0 : realDt;
    hitStop = Math.max(0, hitStop - realDt);
    if (levels.id !== 'part1') {
      // Another chapter (Part 2): its own loop and scene; the shared sound, HUD and state carry on.
      levels.current.update(dt, realDt, { paused: state.paused });
      soundscape.update(state.paused ? 0 : realDt);
      audioPanel.setVisible(state.is(STATES.PLAY));
      renderer.render(levels.current.scene, cam.camera);
      return;
    }
    if (deathDelay >= 0 && !state.paused && (deathDelay -= realDt) <= 0) {
      deathDelay = -1;
      deathFade?.();
    }
    const playing = !state.paused && state.is(STATES.PLAY);
    if (playing) {
      if (!input.enabled && !dying) input.setEnabled(true); // (never left locked in play)
      const inp = input.read();
      if (story.fatigue > 0) {
        // Exhausted (last heart, until the Lazarus Pit): no attacks, dodges or abilities.
        inp.attackPressed = inp.dodgePressed = false;
        inp.ability = null;
      }
      cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      if (inp.debugGrantGems) gems.grantAll();
      if (inp.debugDamageHero) damageHero(CONFIG.lives.debugDamage, hero.position.x + Math.sin(hero.facing), hero.position.z + Math.cos(hero.facing));
      if (inp.debugKillBoss) boss.kill();
      if (inp.debugSpawnBat) minions.debugBat(); // a bat in front of the hero / rider
      if (inp.debugCutscene) story.debugCutscene();
      if (inp.debugDesert) story.debugDesert();
      if (inp.debugEnding) story.debugEnding();
      if (inp.debugPit) story.debugPit();
      if (inp.debugSkeletons) minions.skeletonGroup(); // (Alt+K)
      if (inp.debugStorm) story.stormForced = story.stormLevel > 0.5 ? 0 : 1; // (Alt+S)
      if (inp.debugGate) story.debugGate(); // (Alt+G)
      if (inp.debugTeleportArena) teleportArena();
      // (dismounting only below dismount.maxSpeed: the hold button and keyboard E alike)
      if (inp.mountPressed && (horse.mode !== 'riding' || horse.speed < CONFIG.input.dismount.maxSpeed)) horse.toggle(hero);
      hero.lastDt = dt;
      if (!horse.controlsHero) hero.update(dt, inp, cam.yaw);
      horse.update(dt, inp, cam.yaw, hero);
      hurdles.update(dt, horse);
      combat.update(dt, inp, { mounted: horse.controlsHero });
      abilities.inSealedArena = arena.sealed; // (Flash costs no hearts in the sealed fight)
      if (inp.ability) abilities.use(inp.ability);
      abilities.update(dt);
      boss.regenEnabled = arena.sealed; // (its slow regen only in the sealed fight)
      boss.update(dt, hero);
      minions.update(dt, {
        playing: true,
        riding: horse.controlsHero,
        route: horse.route === world.desertTrack ? 'desert' : 'forest',
        pitDone: story.pitDone,
        galloping: horse.galloping,
        chase: { active: story.desertChaseActive, time: story.chaseTime, over: story.chaseOver },
        drinking: energy.drinking, // (no skeletons rise while the horse drinks at an oasis)
      });
      rescue.update(dt, { onFoot: !horse.controlsHero, riding: horse.controlsHero });
      arena.update(dt, true);
      ui.setHorseEnergy(horse.energy / CONFIG.energy.horseEnergyMax, horse.everMounted, horse.energyTired);
      ui.setBossBar(boss.active, boss.hp / boss.maxHp, DIALOGUE.bossName, boss.regenerating);
      input.setCombatButtons(horse.controlsHero, abilities, story.fatigue > 0);
      // Collect from the body centre: horse + rider when riding, the hero's chest on foot.
      gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
      quests.update(dt, hero);
      guide.update(dt, hero);
      // Mount: on foot near the horse (with its pulse). Dismount: small, under the Pink counter,
      // press-and-hold, only while the horse is (nearly) stopped.
      input.setMountButton(!horse.controlsHero && horse.mode !== 'riding' && horse.canMount(hero));
      const DM = CONFIG.input.dismount;
      input.setDismountButton(horse.mode === 'riding', Math.abs(horse.speed) < DM.maxSpeed, realDt, ui.gemPillRect('pink'), DM.maxSpeed / Math.max(DM.maxSpeed, Math.abs(horse.speed)));
      input.setGallopButton(horse.mode === 'riding', DIALOGUE.gallop, horse.stamina, horse.galloping, horse.energyTired);
      ui.showGems(quests.index >= 2); // from "Mount the horse" on
    } else if (!state.paused && state.is(STATES.CUTSCENE)) {
      // Cutscene: the world keeps moving (the horse slowing at the castle, the girl trembling).
      horse.update(dt, NEUTRAL, cam.yaw, hero);
      boss.regenEnabled = false; // (no regen in a cutscene)
      boss.update(dt, hero);
      arena.update(dt, false);
    } else {
      arena.update(state.paused ? 0 : dt, false);
      horse.update(dt, null, cam.yaw, hero);
    }
    girl.update(dt, world.heightAt(CONFIG.boss.girl.shadow.x - 4, CONFIG.boss.girl.shadow.z));
    story.update(dt, !state.paused && (state.is(STATES.PLAY) || state.is(STATES.CUTSCENE)));
    if (cinematic.active) cinematic.update(state.paused ? 0 : realDt);
    // (the camera keeps going through hit-stop: real time, so a swipe always turns it)
    else cam.update(realDt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading, chase: state.is(STATES.PLAY) && minions.skeletonsCharging });
    soundscape.update(state.paused ? 0 : realDt); // (after the camera: it is the listener)
    audioPanel.setVisible(state.is(STATES.PLAY));
    if (!cinematic.active) hero.cameraOpacity = cam.heroOpacity; // (he fades if the camera is squeezed in right behind him; cutscenes fade him themselves)
    minions.fitView(); // (bats stay on screen: once more against this frame's camera)
    energy.update(state.paused ? 0 : dt, horse, playing); // (only in play: never in a cutscene)
    world.update(dt, cam.camera.position);
    storm.update(state.paused ? 0 : realDt, story.stormLevel, cam.camera, cam); // (after the sky: it blends the fog from it)
    gate.update(state.paused ? 0 : dt, story.gateStarted && !story.gateDone ? horse : null);
    world.updateFoliage(dt, cam.camera.position, cinematic.active ? cinematic.look : cam.focus); // (rocks / leaves in front of the shot's subject fade)
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { renderer, audio, soundscape, state, hero, cam, world, quests, horse, input, guide, gems, abilities, sound, combat, lives, boss, girl, pit, story, cinematic, minions, rescue, storm, gate, hurdles, energy, arena, damageHero, lifeEvents, levels, STATES };

  state.start();
}

boot();
