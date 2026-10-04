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

  const horse = new Horse(world.scene, world.heightAt);
  await horse.init();

  const cam = new FollowCamera(window.innerWidth / window.innerHeight, world.heightAt);
  cam.snapTo(hero.position);

  const ui = new UI(overlay);
  const input = new Input(renderer.domElement, overlay);
  const cutscene = new Cutscene(overlay);
  const quests = new Quests(world.scene, world, ui);
  await quests.init();

  hero.onRespawn = (p) => {
    ui.flash();
    cam.snapTo(p);
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
    if (prev === STATES.GAMEOVER || prev === STATES.INTRO) {
      hero.reset();
      quests.reset();
      cam.reset();
      cam.snapTo(hero.position);
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
    if (!state.paused && state.is(STATES.PLAY)) {
      const inp = input.read();
      cam.rotate(inp.lookDX, inp.lookDY, inp.lookSensitivity);
      hero.update(dt, inp, cam.yaw);
      quests.update(dt, hero);
    }
    horse.update(dt);
    cam.update(dt, hero.position);
    world.update(dt, cam.camera.position);
    renderer.render(world.scene, cam.camera);
  });

  // Exposed for debugging in the browser console (e.g. game.state.set('ending')).
  window.game = { state, hero, cam, world, quests, horse, input, STATES };

  state.start();
}

boot();
