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

async function boot() {
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  const renderer = new THREE.WebGLRenderer({ antialias: CONFIG.render.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  app.appendChild(renderer.domElement);

  const world = new World();
  await world.init();

  const hero = new Hero(world.scene, world);
  await hero.init();

  const sound = new Sound(); // placeholders: events only, no audio yet
  const horse = new Horse(world.scene, world);
  horse.sound = sound;
  await horse.init();

  const cam = new FollowCamera(window.innerWidth / window.innerHeight, world);
  cam.snapTo(hero.position);

  const ui = new UI(overlay);
  const input = new Input(renderer.domElement, overlay);
  const cutscene = new Cutscene(overlay);
  const quests = new Quests(world.scene, world, ui, horse);
  await quests.init();
  // Combat: melee combo + lock-on, abilities, hearts/respawns, the cave monster.
  let hitStop = 0; // seconds of frozen action left (heavy hits)
  const combat = new Combat(world.scene, hero, {
    onHit: (e) => {
      const p = e.position.clone().project(cam.camera);
      if (p.z < 1) ui.damageNumber(((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight, Math.round(e.amount), e.flash ? 'flash' : e.heavy ? 'heavy' : '');
      cam.shake(e.shake, CONFIG.combat.shake.time);
      hitStop = Math.max(hitStop, e.hitStop);
    },
  });
  await combat.init();
  const abilities = new Abilities(hero, world.scene, world, combat);
  await abilities.init();
  combat.abilities = abilities;
  abilities.onEvent = (name, why) => {
    if (name === 'flashBlocked') ui.toast(why === 'health' ? DIALOGUE.notEnoughHealth : why === 'gems' ? DIALOGUE.notEnoughGems : DIALOGUE.flashReloading);
    if (name === 'paralyzed') sound.play('paralyze');
  };
  let damageHero = () => false; // defined below (needs the state machine)
  const boss = new Boss(world.scene, world, {
    onHitHero: (hearts, x, z, opts) => damageHero(hearts, x, z, opts),
    onSlam: () => cam.shake(CONFIG.boss.slam.shake, CONFIG.combat.shake.time * 1.6),
    onDefeat: () => ui.banner(DIALOGUE.victory),
  });
  await boss.init();
  combat.addTarget(boss);
  quests.boss = boss;
  const girl = new Girl(world.scene, boss.girl);
  await girl.init();
  const lives = new Lives({ onChange: (l) => ui.setLives(l.hearts, l.maxHearts, l.respawns, CONFIG.lives.respawns) });
  abilities.lives = lives; // ...and 30% of the hearts

  const gems = new Gems(world.scene, world, {
    onCollect: () => ui.setGems(gems.counts, CONFIG.gems.needed),
    onSpend: () => ui.setGems(gems.counts, CONFIG.gems.needed),
    onUnlock: (color, ability) => {
      abilities.unlock(ability);
      ui.pulseGem(color);
      input.pulseAbility(ability);
      ui.toast(DIALOGUE.unlocked(DIALOGUE.abilityNames[ability]));
    },
  });
  await gems.init();
  ui.setGems(gems.counts, CONFIG.gems.needed);
  abilities.gems = gems; // Flash Mode costs 5 pink gems...
  const guide = new JumpGuide(world.scene, world);
  await guide.init();

  hero.onRespawn = (p) => {
    ui.flash();
    cam.snapTo(p);
  };
  horse.onRespawn = hero.onRespawn;
  horse.onCheckpoint = () => ui.toast(DIALOGUE.checkpoint);
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
  const story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, sound, ui, guide });
  quests.story = story;
  const NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };

  // --- Hearts, death and respawn ---
  let dying = false;
  const lifeEvents = {
    // Dying at the boss: it resets to full health (CONFIG.lives.bossResetsOnRespawn).
    onRespawn: () => boss.onHeroRespawn(),
  };
  /** The hero takes `n` hearts of damage from (fromX, fromZ); opts.knockback false for e.g. fire. */
  damageHero = (n, fromX, fromZ, opts = {}) => {
    if (dying || hero.invincible || !state.is(STATES.PLAY)) return false;
    hero.hurt(fromX, fromZ, opts.knockback !== false);
    cam.shake(CONFIG.combat.shake.heavy, CONFIG.combat.shake.time);
    if (lives.damage(n)) {
      // Out of hearts: fade out, then use a respawn (on the horse at the last checkpoint) or Game Over.
      dying = true;
      input.setEnabled(false);
      ui.fadeOut(CONFIG.lives.deathFadeMs, () => {
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
      ui.setGems(gems.counts, CONFIG.gems.needed);
    } else if (prev === STATES.GAMEOVER) {
      // Retry: full hearts and respawns, back on the horse at the start of the ride.
      // Gems, unlocks and quest progress are kept.
      lives.reset();
      abilities.clear();
      combat.reset();
      horse.restartRide(hero);
      lifeEvents.onRespawn?.();
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
    ui.showHud(false);
    input.setEnabled(false);
    quests.setVisible(false); // no quest arrow or beacon in the shot
  });
  state.onExit(STATES.CUTSCENE, () => quests.setVisible(true));

  // Ending: title, then the summary. Play Again = a full reset, then the intro.
  state.onEnter(STATES.ENDING, () => {
    ui.showHud(false);
    input.setEnabled(false);
    quests.setVisible(false);
    ui.showEnding(true, story.stats(), () => {
      story.resetAll();
      ui.setGems(gems.counts, CONFIG.gems.needed);
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
    const playing = !state.paused && state.is(STATES.PLAY);
    if (playing) {
      const inp = input.read();
      cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      if (inp.debugGrantGems) gems.grantAll();
      if (inp.debugDamageHero) damageHero(CONFIG.lives.debugDamage, hero.position.x + Math.sin(hero.facing), hero.position.z + Math.cos(hero.facing));
      if (inp.debugKillBoss) boss.kill();
      if (inp.debugCutscene) story.debugCutscene();
      if (inp.debugDesert) story.debugDesert();
      if (inp.debugEnding) story.debugEnding();
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
      if (inp.mountPressed) horse.toggle(hero);
      hero.lastDt = dt;
      if (!horse.controlsHero) hero.update(dt, inp, cam.yaw);
      horse.update(dt, inp, cam.yaw, hero);
      combat.update(dt, inp, { mounted: horse.controlsHero });
      if (inp.ability) abilities.use(inp.ability);
      abilities.update(dt);
      boss.update(dt, hero);
      ui.setBossBar(boss.active, boss.hp / boss.maxHp, DIALOGUE.bossName);
      input.setCombatButtons(horse.controlsHero, abilities);
      // Collect from the body centre: horse + rider when riding, the hero's chest on foot.
      gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
      quests.update(dt, hero);
      guide.update(dt, hero);
      const canMount = horse.canMount(hero);
      input.setMountButton(canMount || horse.mode === 'riding', canMount ? DIALOGUE.mount : DIALOGUE.dismount);
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
    else cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    world.update(dt, cam.camera.position);
    world.updateFoliage(dt, cam.camera.position, cam.focus);
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { state, hero, cam, world, quests, horse, input, guide, gems, abilities, sound, combat, lives, boss, girl, story, cinematic, damageHero, lifeEvents, STATES };

  state.start();
}

boot();
