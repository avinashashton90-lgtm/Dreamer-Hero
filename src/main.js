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
import { TrainingDummy } from './dummy.js';

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
  // Combat: melee combo + lock-on, abilities, hearts/respawns, training dummy.
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
  const dummy = new TrainingDummy(world.scene, world);
  await dummy.init();
  combat.addTarget(dummy);
  const lives = new Lives({ onChange: (l) => ui.setLives(l.hearts, l.maxHearts, l.respawns, CONFIG.lives.respawns) });

  const gems = new Gems(world.scene, world, {
    onCollect: (color) => {
      ui.setGems(gems.counts, CONFIG.gems.needed);
      if (color === 'pink') abilities.addFlashEnergy(CONFIG.abilities.flashMode.perPinkGem);
    },
    onUnlock: (color, ability) => {
      abilities.unlock(ability);
      ui.pulseGem(color);
      input.pulseAbility(ability);
      ui.toast(DIALOGUE.unlocked(DIALOGUE.abilityNames[ability]));
    },
  });
  await gems.init();
  ui.setGems(gems.counts, CONFIG.gems.needed);
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

  // --- Hearts, death and respawn ---
  let dying = false;
  const lifeEvents = { onRespawn: null }; // e.g. the boss resets (CONFIG.lives.bossResetsOnRespawn)
  /** The hero takes `n` hearts of damage from (fromX, fromZ). */
  const damageHero = (n, fromX, fromZ) => {
    if (dying || hero.invincible || !state.is(STATES.PLAY)) return false;
    hero.hurt(fromX, fromZ);
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
      hero.reset();
      horse.reset();
      gems.reset();
      abilities.reset();
      combat.reset();
      dummy.reset();
      lives.reset();
      ui.setGems(gems.counts, CONFIG.gems.needed);
      quests.reset();
      guide.reset();
      cam.reset();
      cam.snapTo(hero.position);
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

  state.onEnter(STATES.ENDING, () => {
    ui.showHud(false);
    ui.showEnding(true, () => state.set(STATES.INTRO));
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
      if (inp.mountPressed) horse.toggle(hero);
      hero.lastDt = dt;
      if (!horse.controlsHero) hero.update(dt, inp, cam.yaw);
      horse.update(dt, inp, cam.yaw, hero);
      combat.update(dt, inp, { mounted: horse.controlsHero });
      if (inp.ability) abilities.use(inp.ability);
      abilities.update(dt);
      dummy.update(dt);
      input.setCombatButtons(horse.controlsHero, abilities);
      // Collect from the body centre: horse + rider when riding, the hero's chest on foot.
      gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
      quests.update(dt, hero);
      guide.update(dt, hero);
      const canMount = horse.canMount(hero);
      input.setMountButton(canMount || horse.mode === 'riding', canMount ? DIALOGUE.mount : DIALOGUE.dismount);
      input.setGallopButton(horse.mode === 'riding', DIALOGUE.gallop, horse.stamina, horse.galloping);
      ui.showGems(quests.index >= 2); // from "Mount the horse" on
    } else {
      horse.update(dt, null, cam.yaw, hero);
      dummy.update(dt);
    }
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    world.update(dt, cam.camera.position);
    world.updateFoliage(dt, cam.camera.position, cam.focus);
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { state, hero, cam, world, quests, horse, input, guide, gems, abilities, sound, combat, lives, dummy, damageHero, lifeEvents, STATES };

  state.start();
}

boot();
