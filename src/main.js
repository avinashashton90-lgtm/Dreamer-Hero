import * as THREE from 'three';
import './style.css';
import { CONFIG, DIALOGUE } from './config.js';
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
import { Sound } from './audio.js';
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

  const sound = new Sound(); // placeholders: events only, no audio yet
  const horse = new Horse(world.scene, world, { onProgress: (f) => ui.setLoading(SH.hero + f * SH.horse) });
  horse.sound = sound;
  await horse.init();

  const cam = new FollowCamera(window.innerWidth / window.innerHeight, world);
  cam.snapTo(hero.position);

  const input = new Input(renderer.domElement, overlay);
  const cutscene = new Cutscene(overlay);
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
    },
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
  };
  let damageHero = () => false; // defined below (needs the state machine)
  const boss = new Boss(world.scene, world, {
    onHitHero: (hearts, x, z, opts) => damageHero(hearts, x, z, opts),
    onSlam: () => cam.shake(CONFIG.boss.slam.shake, CONFIG.combat.shake.time * 1.6),
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
  abilities.lives = lives; // Flash also costs 30% of the hearts

  const gems = new Gems(world.scene, world, {
    onCollect: () => ui.setGems(gems.counts),
    onSpend: () => ui.setGems(gems.counts),
    onUnlock: (color, ability) => {
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
  // Once the hero has ridden, falls/deaths put him back on the horse at the last checkpoint.
  hero.onFall = () => {
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
      if (name === 'batScreech') sound.play('batScreech'); // (the telegraph before a dive)
    },
  });
  abilities.camera = cam.camera; // (billboards the mounted Batarang's target bracket)
  // Cornered (pinned against a rock with enemies close for 1.5 s): a pulse pushes them back.
  const rescue = new CornerRescue(world.scene, world, {
    hero, boss, minions,
    onPulse: () => {
      cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
      sound.play('rescuePulse');
    },
  });
  await rescue.init();
  const story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, pit, sound, ui, guide });
  quests.story = story;
  const NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };

  // --- Hearts, death and respawn ---
  let dying = false;
  let deathDelay = -1; // seconds of the death fall left before the fade
  let deathFade = null;
  const lifeEvents = {
    // Dying at the boss: it resets to full health (CONFIG.lives.bossResetsOnRespawn); the trail
    // gems from the checkpoint to the cave come back and the stock is topped up; the arena rings
    // go with the boss reset.
    onRespawn: () => {
      minions.clear(); // every minion removed
      rescue.reset();
      boss.onHeroRespawn();
      if (!boss.defeated) gems.resetArena();
      gems.restock(horse.checkpoints[horse.lastCheckpoint].s);
    },
  };
  /** The hero takes `n` hearts of damage from (fromX, fromZ); opts.knockback false for e.g. fire. */
  damageHero = (n, fromX, fromZ, opts = {}) => {
    if (dying || hero.invincible || !state.is(STATES.PLAY)) return false;
    // (fire ticks every 0.8 s: no post-hit invincibility from a burn, so every tick counts)
    hero.hurt(fromX, fromZ, opts.knockback !== false, opts.source !== 'fire');
    input.unstick(); // (a hit never leaves a drag or a touch stuck: a live swipe keeps turning the camera)
    cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
    if (lives.damage(n)) {
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
          horse.respawnAtCheckpoint(hero);
          lifeEvents.onRespawn?.();
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
    await cutscene.play(DIALOGUE.intro);
    state.set(STATES.PLAY);
  });

  state.onEnter(STATES.PLAY, (prev) => {
    if (prev === STATES.INTRO) {
      // New game: everything back to the start.
      story.resetAll();
      rescue.reset();
      minions.clear();
      ui.setGems(gems.counts);
    } else if (prev === STATES.GAMEOVER) {
      // Retry: full hearts and respawns, back on the horse at the start of the ride, with the
      // gems afresh (0 of each, every trail gem back, unlocks cleared). Quest progress is kept.
      lives.reset();
      abilities.reset();
      combat.reset();
      horse.restartRide(hero);
      boss.onHeroRespawn();
      minions.clear();
      rescue.reset();
      gems.reset();
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

  // Ending: title, then the summary. Play Again = a full reset, then the intro.
  state.onEnter(STATES.ENDING, () => {
    ui.showHud(false);
    input.setEnabled(false);
    ui.showEnding(true, story.stats(), () => {
      story.resetAll();
      rescue.reset();
      minions.clear();
      ui.setGems(gems.counts);
      state.set(STATES.INTRO);
    });
  });
  state.onExit(STATES.ENDING, () => ui.showEnding(false));

  ui.onOrientationChange((portrait) => {
    state.paused = portrait;
    if (state.is(STATES.PLAY)) input.setEnabled(!portrait);
  });
  state.paused = ui.isPortrait();

  // --- Resize ---
  const onResize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.setAspect(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // --- Loop ---
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const realDt = Math.min(clock.getDelta(), 0.05); // clamp to avoid tunnelling after tab switches
    // Hit-stop: heavy hits freeze the action for a moment (the camera keeps going).
    const dt = hitStop > 0 ? 0 : realDt;
    hitStop = Math.max(0, hitStop - realDt);
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
      if (inp.debugTeleportArena) {
        // Debug: on foot at the arena entrance, the horse waiting beside it.
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
      // (dismounting only below dismount.maxSpeed: the hold button and keyboard E alike)
      if (inp.mountPressed && (horse.mode !== 'riding' || horse.speed < CONFIG.input.dismount.maxSpeed)) horse.toggle(hero);
      hero.lastDt = dt;
      if (!horse.controlsHero) hero.update(dt, inp, cam.yaw);
      horse.update(dt, inp, cam.yaw, hero);
      combat.update(dt, inp, { mounted: horse.controlsHero });
      if (inp.ability) abilities.use(inp.ability);
      abilities.update(dt);
      boss.update(dt, hero);
      minions.update(dt, {
        playing: true,
        riding: horse.controlsHero,
        route: horse.route === world.desertTrack ? 'desert' : 'forest',
        pitDone: story.pitDone,
        galloping: horse.galloping,
      });
      rescue.update(dt, { onFoot: !horse.controlsHero });
      ui.setBossBar(boss.active, boss.hp / boss.maxHp, DIALOGUE.bossName);
      input.setCombatButtons(horse.controlsHero, abilities, story.fatigue > 0);
      // Collect from the body centre: horse + rider when riding, the hero's chest on foot.
      gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
      quests.update(dt, hero);
      guide.update(dt, hero);
      // Mount: on foot near the horse (with its pulse). Dismount: small, under the Pink counter,
      // press-and-hold, only while the horse is (nearly) stopped.
      input.setMountButton(!horse.controlsHero && horse.mode !== 'riding' && horse.canMount(hero));
      input.setDismountButton(horse.mode === 'riding', Math.abs(horse.speed) < CONFIG.input.dismount.maxSpeed, realDt, ui.gemPillRect('pink'));
      input.setGallopButton(horse.mode === 'riding', DIALOGUE.gallop, horse.stamina, horse.galloping);
      ui.showGems(quests.index >= 2); // from "Mount the horse" on
    } else if (!state.paused && state.is(STATES.CUTSCENE)) {
      // Cutscene: the world keeps moving (the horse slowing at the castle, the girl trembling).
      horse.update(dt, NEUTRAL, cam.yaw, hero);
      boss.update(dt, hero);
    } else {
      horse.update(dt, null, cam.yaw, hero);
    }
    girl.update(dt, world.heightAt(CONFIG.boss.girl.shadow.x - 4, CONFIG.boss.girl.shadow.z));
    story.update(dt, !state.paused && (state.is(STATES.PLAY) || state.is(STATES.CUTSCENE)));
    if (cinematic.active) cinematic.update(state.paused ? 0 : realDt);
    // (the camera keeps going through hit-stop: real time, so a swipe always turns it)
    else cam.update(realDt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    if (!cinematic.active) hero.cameraOpacity = cam.heroOpacity; // (he fades if the camera is squeezed in right behind him; cutscenes fade him themselves)
    minions.fitView(); // (bats stay on screen: once more against this frame's camera)
    world.update(dt, cam.camera.position);
    world.updateFoliage(dt, cam.camera.position, cinematic.active ? cinematic.look : cam.focus); // (rocks / leaves in front of the shot's subject fade)
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { state, hero, cam, world, quests, horse, input, guide, gems, abilities, sound, combat, lives, boss, girl, pit, story, cinematic, minions, rescue, damageHero, lifeEvents, STATES };

  state.start();
}

boot();
