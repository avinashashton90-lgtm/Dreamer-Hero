// Headless test: Part 2's start (src/part2/, loaded by levelManager.js). The level manager loads
// Part 2 as its own chapter (the hero, horse and camera borrowed into its scene and floors) and
// hands everything back to Part 1; the Gearhaven arrival (the riders drop into the courtyard, he
// gets down, the horse's brass key and plates, Tick floats in, the lines in order, Tick's nervous
// glance, Skip), the courtyard (the gear sky, cogs, the clock's hands and steam moving, walking
// around inside its wall, "Find the Fire Element" with its distance), walking into the Fire door
// → its "coming soon" stub and back, every level's stub and Amy's final fight, the Part 2 ending;
// and a draw budget for the courtyard.
// Usage: npm run test:part2   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { GameState, STATES } from '../src/state.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { FollowCamera } from '../src/camera.js';
import { Cinematic } from '../src/cinematic.js';
import { Sound } from '../src/audio.js';
import { characterBodies } from '../src/fade.js';
import { LevelManager } from '../src/levelManager.js';

const P2 = CONFIG.part2, D2 = DIALOGUE.part2, S = DIALOGUE.speakers;
const dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const world = new World(); await world.init();
const hero = new Hero(world.scene, world, heroAssets); await hero.init();
const sound = new Sound();
const horse = new Horse(world.scene, world, heroAssets); horse.sound = sound; await horse.init();
const cam = new FollowCamera(20 / 9, world);
const state = new GameState(STATES.PLAY);
// Stand-ins for the DOM: the dialogue box, the HUD, the input.
const view = { lines: [], complete: false, show() {}, hide() {},
  dialogue(speaker, text, complete) { if (complete && !this.complete) this.lines.push(`${speaker}: ${text}`); this.complete = complete; },
  clearDialogue() { this.complete = false; } };
const cinematic = new Cinematic(cam, view);
cinematic.bodies = characterBodies({ hero, girlModel: new THREE.Group(), horse });
const ui = { quest: null, dist: null, toasts: [], gemsShown: true,
  toast(t) { this.toasts.push(t); }, setQuest(t, d) { this.quest = t; this.dist = d; }, fadeOut(ms, then) { then(); }, fadeIn() {},
  showGems(on) { this.gemsShown = on; }, setHorseEnergy() {}, setBossBar() {} };
let held = { moveX: 0, moveY: 0, jumpPressed: false };
const input = { enabled: true, setEnabled(on) { this.enabled = on; }, read: () => ({ ...held, lookDX: 0, lookDY: 0, lookSensitivity: 0 }),
  setCombatButtons(m, a, hidden) { this.combatHidden = hidden; }, setMountButton() {}, setDismountButton() {}, setGallopButton() {} };
const soundscape = { musicPhase: null };
state.onEnter(STATES.CUTSCENE, () => input.setEnabled(false));
const part1 = { id: 'part1', scene: world.scene, enter: () => { for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o); }, exit() {} };
const levels = new LevelManager({
  part1: async () => part1,
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities: null, lives: null }),
});
levels.chapters.set('part1', part1);
levels.current = part1; levels.id = 'part1';

const frame = async () => { levels.current.update(dt, dt, { paused: false }); await null; };
let readFor = 0;
const read = async (maxS = 90) => {
  for (let t = 0; t < maxS && cinematic.active; t += dt) {
    await frame();
    if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
  }
  await frame();
};
const scale0 = horse.model.scale.x;

// 1) Load Part 2 at the arrival: the scene, the riders borrowed, the lines, Tick, the upgrade.
{
  const t0 = performance.now();
  const p2 = await levels.load('part2', { start: 'arrival' });
  const ms = performance.now() - t0;
  const borrowed = hero.model.parent === p2.scene && horse.model.parent === p2.scene && hero.world === p2.world && horse.world === p2.world && cam.world === p2.world;
  check(p2 && levels.id === 'part2' && borrowed && state.is(STATES.CUTSCENE) && soundscape.musicPhase === P2.music,
    `Part 2 loads as its own chapter (${ms.toFixed(0)} ms): the hero, horse and camera in its scene and on its floors, a cutscene, the Gearhaven music`);
  const up = p2.upgrade;
  check(up.parent === horse.model && up.userData.key && up.userData.plates.length >= 4, `the horse has a brass key on its back and ${up.userData.plates.length} brass armour plates`);
  const tick = p2.tick;
  check(tick.model.parent === p2.scene && tick.model.userData.eye && tick.model.userData.prop, 'Tick: a floating brass robot with a glowing eye and a propeller');
  // Play it through.
  let dropped = false, landedOnFoot = false, nervousSeen = 0, tickNear = Infinity, glanceMax = 0, chime = sound.counts.clock_chime ?? 0;
  const gear = p2.gearhaven.userData.skyGears[0].mesh, gearRot = gear.rotation.z;
  const yawRel = () => Math.abs(wrap(tick.model.rotation.y - Math.atan2(hero.position.x - tick.position.x, hero.position.z - tick.position.z)));
  for (let t = 0; t < 90 && cinematic.active; t += dt) {
    await frame();
    if (horse.position.y < 0.05 && horse.grounded) dropped = true;
    if (dropped && !hero.riding && horse.mode === 'idle') landedOnFoot = true;
    if (landedOnFoot) tickNear = Math.min(tickNear, tick.position.distanceTo(hero.position));
    if (tick.nervousT > 0) { nervousSeen++; glanceMax = Math.max(glanceMax, yawRel()); }
    if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
  }
  for (let i = 0; i < 3; i++) await frame(); // (the scene's end settles: into play)
  const L = D2.arrival;
  const want = [`${S.tick}: ${L.welcome}`, `${S.hero}: ${L.where}`, `${S.tick}: ${L.stops}`, `${S.tick}: ${L.witch}`, `${S.hero}: ${L.amy}`, `${S.tick}: ${L.cannot}`];
  check(JSON.stringify(view.lines) === JSON.stringify(want), `the arrival's lines in order:\n       ${view.lines.join('\n       ')}`);
  check(dropped && landedOnFoot && (sound.counts.clock_chime ?? 0) > chime && sound.counts.tick_whir >= 1, 'AJ and the horse drop into the courtyard (a chime far away), he gets down, Tick whirs in');
  check(tickNear < 2.8 && nervousSeen > 20 && glanceMax > 0.8, `Tick floats in beside him (${tickNear.toFixed(2)}) and says "${L.cannot}" nervously, glancing over his shoulder (${glanceMax.toFixed(2)} rad)`);
  check(state.is(STATES.PLAY) && p2.at === 'courtyard' && ui.quest === D2.objectives.fire && ui.dist > 5 && ui.toasts.includes(D2.objectives.fire),
    `then the courtyard in play: "${ui.quest}" (${ui.dist} away)`);
  check(Math.abs(gear.rotation.z - gearRot) > 1e-3 && !ui.gemsShown && input.combatHidden, 'the gear sky turns; no gems or fighting buttons in Gearhaven');
}

// 2) The courtyard: things move; AJ walks about inside its wall; the Fire door opens its stub.
{
  const p2 = levels.current;
  const u = p2.gearhaven.userData;
  const minute = u.clock.minute.rotation.z, cog = u.cogs[0].mesh.rotation.z;
  let steamMax = 0;
  held = { moveX: 0, moveY: 1, jumpPressed: false };
  const p0 = hero.position.clone();
  let maxR = 0, minY = Infinity;
  for (let i = 0; i < 60 * 8; i++) {
    await frame();
    steamMax = Math.max(steamMax, u.steam.count);
    maxR = Math.max(maxR, Math.hypot(hero.position.x, hero.position.z));
    minY = Math.min(minY, hero.position.y);
  }
  held = { moveX: 0, moveY: 0, jumpPressed: false };
  check(hero.position.distanceTo(p0) > 3 && maxR <= P2.gearhaven.floor.wall + 0.01 && minY > -0.05, `AJ walks about the courtyard and stays inside its wall (${maxR.toFixed(2)} ≤ ${P2.gearhaven.floor.wall}), on its floor`);
  check(u.clock.minute.rotation.z !== minute && u.cogs[0].mesh.rotation.z !== cog && steamMax > 0, `the clock's hands, the cogs and the steam move (${steamMax} puffs)`);
  // Into the Fire door.
  const door = u.doors.fire.at;
  hero.puppet(door.clone().multiplyScalar(0.97), 0, 0);
  await frame(); await frame();
  check(p2.at === 'fire' && ui.quest === D2.comingSoon(D2.levelNames.fire) && ui.toasts.at(-1) === D2.comingSoon(D2.levelNames.fire) && Math.abs(hero.position.x - p2.stubs.fire.x) < P2.levels.stub.radius,
    `walking into the Fire door: "${ui.quest}" on its own platform`);
  hero.puppet(p2.stubs.fire.door.clone(), 0, 0);
  await frame(); await frame();
  check(p2.at === 'courtyard' && Math.hypot(hero.position.x, hero.position.z) < P2.gearhaven.floor.radius, 'its door back leads to the courtyard');
}

// 3) Every level's stub, Amy's final fight and the Part 2 ending (the test menu's jumps).
{
  const got = [];
  for (const id of [...P2.levels.order, 'final']) {
    await levels.load('part2', { start: id });
    await frame();
    got.push(levels.current.at === id && ui.quest === D2.comingSoon(D2.levelNames[id]) && state.is(STATES.PLAY));
  }
  check(got.every(Boolean), `each level (Fire, Lightning, Steam, Magnet, Time) and Amy's final fight load as a "coming soon" stub (${got.filter(Boolean).length}/${got.length})`);
  await levels.load('part2', { start: 'ending' });
  check(state.is(STATES.ENDING) && levels.current.at === 'ending', 'the Part 2 ending (the ending screens: "To be continued... Part 3")');
  state.current = STATES.PLAY;
}

// 4) Skip the arrival on its first line: on foot in the courtyard, the objective.
{
  view.lines = [];
  await levels.load('part2', { start: 'arrival' });
  for (let i = 0; i < 600 && !view.complete; i++) await frame();
  await cinematic.skip();
  await frame(); await frame();
  const p2 = levels.current;
  check(!cinematic.active && state.is(STATES.PLAY) && !hero.riding && horse.mode === 'idle' && Math.abs(horse.position.y) < 0.01 && p2.at === 'courtyard' && ui.quest === D2.objectives.fire,
    'Skip on the first line: on foot in the courtyard, the horse standing, the objective');
}

// 5) A draw budget for the courtyard (phones), and back to Part 1: everything handed back.
{
  const p2 = levels.current;
  let meshes = 0, tris = 0, riders = 0;
  for (const m of [hero.model, horse.model]) m.traverseVisible((o) => o.isMesh && riders++);
  p2.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  check(meshes - riders < 80 && tris < 400000, `Gearhaven's draw budget: ${meshes - riders} visible meshes of its own (+ ${riders} for AJ and the horse), ${Math.round(tris / 1000)}k triangles in all`);
  await levels.load('part1');
  const back = hero.model.parent === world.scene && horse.model.parent === world.scene && hero.world === world && horse.world === world && cam.world === world && !p2.upgrade.parent && soundscape.musicPhase === null;
  check(back && levels.id === 'part1' && Math.abs(horse.model.scale.x - scale0) < 1e-9, 'back to Part 1: the hero, horse and camera back in its world, the upgrade off the horse, the music handed back');
}

// 6) A chapter that fails to load leaves the game where it is.
{
  const bad = new LevelManager({ part1: async () => part1, broken: async () => { throw new Error('boom'); } });
  bad.chapters.set('part1', part1); bad.current = part1; bad.id = 'part1';
  const errs = console.error; console.error = () => {};
  const r = await bad.load('broken');
  console.error = errs;
  check(r === null && bad.id === 'part1', 'a chapter that fails to load: null, still in Part 1');
}

console.log(failed ? 'PART 2 TEST FAILED' : 'part 2 test passed');
process.exit(failed ? 1 : 0);
