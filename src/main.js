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

  const horse = new Horse(world.scene, world);
  await horse.init();

  const cam = new FollowCamera(window.innerWidth / window.innerHeight, world);
  cam.snapTo(hero.position);

  const ui = new UI(overlay);
  const input = new Input(renderer.domElement, overlay);
  const cutscene = new Cutscene(overlay);
  const quests = new Quests(world.scene, world, ui, horse);
  await quests.init();
  const abilities = new Abilities(hero);
  const gems = new Gems(world.scene, world, {
    onCollect: () => ui.setGems(gems.counts, CONFIG.gems.needed),
    onUnlock: (_color, ability) => {
      abilities.unlock(ability); // recorded now; the ability itself comes later
      ui.banner(DIALOGUE.unlocked(DIALOGUE.abilityNames[ability]));
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
      ui.setGems(gems.counts, CONFIG.gems.needed);
      quests.reset();
      guide.reset();
      cam.reset();
      cam.snapTo(hero.position);
    } else if (prev === STATES.GAMEOVER) {
      // Died: keep gems, unlocks and quest progress; back to the last checkpoint/platform.
      if (horse.everMounted) horse.respawnAtCheckpoint(hero);
      else hero.respawn();
    }
    ui.showHud(true);
    input.setEnabled(true);
  });
  state.onExit(STATES.PLAY, () => input.setEnabled(false));

  state.onEnter(STATES.GAMEOVER, () => {
    ui.showHud(false);
    ui.showGameOver(true, () => state.set(STATES.PLAY));
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
    const dt = Math.min(clock.getDelta(), 0.05); // clamp to avoid tunnelling after tab switches
    const playing = !state.paused && state.is(STATES.PLAY);
    if (playing) {
      const inp = input.read();
      cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      if (inp.mountPressed) horse.toggle(hero);
      if (!horse.controlsHero) hero.update(dt, inp, cam.yaw);
      horse.update(dt, inp, cam.yaw, hero);
      gems.update(dt, hero.position);
      quests.update(dt, hero);
      guide.update(dt, hero);
      const canMount = horse.canMount(hero);
      input.setMountButton(canMount || horse.mode === 'riding', canMount ? DIALOGUE.mount : DIALOGUE.dismount);
      ui.showGems(quests.index >= 2); // from "Mount the horse" on
    } else {
      horse.update(dt, null, cam.yaw, hero);
    }
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio });
    world.update(dt, cam.camera.position);
    world.updateFoliage(dt, cam.camera.position, cam.focus);
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { state, hero, cam, world, quests, horse, input, guide, gems, abilities, STATES };

  state.start();
}

boot();
