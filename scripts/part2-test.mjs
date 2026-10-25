// Headless test: Part 2's start (src/part2/, loaded by levelManager.js). The level manager loads
// Part 2 as its own chapter (the hero, horse and camera borrowed into its scene and floors) and
// hands everything back to Part 1; the Gearhaven arrival (the riders drop into the courtyard, he
// gets down, the horse's brass key (its plates a gear reward), Tick floats in, the lines in order, Tick's nervous
// glance, Skip), the courtyard (the gear sky, cogs, the clock's hands and steam moving, walking
// around inside its wall, "Find the Fire Element" with its distance), walking into the Fire door
// → the Gearhaven ride (test:ride plays it), its end → the Fire Element's stub
// → its "coming soon" stub and back, every level's stub and Amy's final fight, the Part 2 ending;
// a draw budget for the courtyard; Tick's model (the Animated Robot glb: brass and copper, dark
// goggles, its idle playing, floating beside the horse in the arrival) and the four mech robots
// (sizes by role, clips by role, the brass / copper / rust tint, animating, the placeholder
// fallback), and the "Robots test" showcase.
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
import { loadRobotModel, forgetRobotTemplates } from '../src/part2/robots.js';
import { loadTickModel } from '../src/part2/tick.js';

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
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities: null, lives: null, assets: heroAssets }),
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
  check(up.parent === horse.model && up.userData.key && up.userData.plates.length >= 4 && up.userData.plates.every((p) => !p.visible), `the horse has a brass key on its back (its ${up.userData.plates.length} brass armour plates wait for the gear reward)`);
  const tick = p2.tick;
  const tu = tick.model.userData;
  // Two flat sky-blue eyes (unlit, no glow / emissive / halo), one each side of his middle, and
  // nothing additive on him but the reward glow (hidden until every gear of a level is found).
  tick.model.updateMatrixWorld(true); // (its bones' matrices, as a render would)
  const eyes = tu.eyes ?? [];
  const eyeX = eyes.map((e) => tu.body.worldToLocal(e.getWorldPosition(new THREE.Vector3())).x);
  const additive = [];
  tick.model.traverse((o) => { if ((o.isMesh || o.isSprite) && o.material.blending === THREE.AdditiveBlending && o.name !== 'tickGlow') additive.push(o.name); });
  const eyesOk = eyes.length === 2 && eyes.every((e) => e.material.isMeshBasicMaterial && !e.material.transparent && e.material.blending === THREE.NormalBlending && e.material.color.getHex() === P2.tick.eyes.color)
    && Math.sign(eyeX[0]) !== Math.sign(eyeX[1]) && additive.length === 0;
  const tickOk = eyesOk && (heroAssets.placeholder
    ? tu.placeholder && tu.prop
    : !tu.placeholder && tu.animator?.clipName && /Idle/.test(tu.animator.clipName) && tu.materials.Main.color.getHex() === P2.tick.tint.Main && tu.materials.Black.color.getHex() === P2.tick.tint.Black);
  const tickGlow = tick.model.getObjectByName('tickGlow');
  check(tickGlow && !tickGlow.visible, 'no glow round Tick before the all-gears reward');
  const tbox = new THREE.Box3().setFromObject(tu.body, true);
  check(tick.model.parent === p2.scene && tickOk && tickGlow?.isSprite && tickGlow.material.blending === THREE.AdditiveBlending && Math.abs(tbox.max.y - tbox.min.y - (heroAssets.placeholder ? tbox.max.y - tbox.min.y : P2.tick.height)) < P2.tick.height * 0.12, // (its idle pose stands a little taller than the fitted bind pose)
    `Tick: ${heroAssets.placeholder ? 'the placeholder (shapes)' : `the Animated Robot glb, ${(tbox.max.y - tbox.min.y).toFixed(2)} tall, a bright brass-yellow body / copper limbs / dark goggles, playing ${tu.animator?.clipName}`}; two flat sky-blue eyes (#6EC6FF, unlit, no glow or halo) on the goggles`);
  // Play it through.
  let dropped = false, landedOnFoot = false, nervousSeen = 0, tickNear = Infinity, tickHorse = Infinity, tickBob = [Infinity, -Infinity], glanceMax = 0, chime = sound.counts.clock_chime ?? 0;
  const gear = p2.gearhaven.userData.decor.sets.flatMap((st) => st.items).find((it) => it.sky), gearRot = gear.angle;
  const tower = p2.gearhaven.userData.tower, minute0 = tower.userData.clock.minute;
  const yawRel = () => Math.abs(wrap(tick.model.rotation.y - Math.atan2(hero.position.x - tick.position.x, hero.position.z - tick.position.z)));
  // The talk's framing: each line frames its speaker — AJ's lines AJ, Tick's lines Tick in the
  // middle — with AJ on the left, Tick on the right at head height, the horse behind them; both
  // in the shot, nobody hidden behind the horse or the dialogue box (vertical capsules); for "Am I
  // inside a clock?" the camera tilts up past AJ (looking up) to the Dream Clock and the gears.
  const fr = { frames: 0, speaker: 0, tickCentred: 0, tickFrames: 0, both: 0, order: 0, behind: 0, tickHead: 0, clock: 0, clockFrames: 0, ajUp: 0, blipsFromTick: 0 };
  const clockAt = new THREE.Vector3(...P2.gearhaven.clock.at);
  const proj = (v) => v.clone().project(cam.camera);
  const inView = (v) => { const q = proj(v); return q.z < 1 && Math.abs(q.x) <= 0.95 && q.y > -0.3 && q.y < 0.8; }; // (under the letterbox, above the dialogue box)
  const hidden = (p, self) => {
    const c = cam.camera.position;
    const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
    const R = CONFIG.cinematic.guard.radius;
    const bodies = [
      { name: 'hero', at: hero.position, r: R.hero, h: CONFIG.heroModel.height },
      ...[-0.7, 0.7].map((k) => ({ name: 'horse', at: horse.position.clone().addScaledVector(f, k), r: R.horse * 0.75, h: R.horseHeight })),
    ];
    for (let i = 1; i < 40; i++) {
      const q = c.clone().lerp(p, i / 40);
      if (self !== 'tick' && q.distanceTo(tick.position) < P2.tick.height * 0.45) return true;
      for (const b of bodies) if (b.name !== self && q.y > b.at.y && q.y < b.at.y + b.h && Math.hypot(q.x - b.at.x, q.z - b.at.z) < b.r) return true;
    }
    return false;
  };
  for (let t = 0; t < 90 && cinematic.active; t += dt) {
    await frame();
    const step = cinematic.current?.step;
    if (step?.say && cinematic.moves.length === 0) {
      const ajHead = hero.position.clone().setY(hero.position.y + CONFIG.heroModel.height * 0.9);
      const ajFeet = hero.position.clone().setY(hero.position.y + 0.05);
      const c = cam.camera.position;
      if (step.text === D2.arrival.clock) {
        // Looking up at the Dream Clock past AJ's shoulder: the clock's face in the shot, AJ's head too, his head tilted back.
        fr.clockFrames++;
        const q = proj(clockAt);
        if (q.z < 1 && Math.abs(q.x) < 0.9 && q.y > -0.2 && q.y < 0.9 && inView(ajHead) && !hidden(ajHead, 'hero')) fr.clock++;
        if (hero.facePitch < -0.2) fr.ajUp++;
      } else {
        fr.frames++;
        const ajSeen = inView(ajHead) && inView(ajFeet) && !hidden(ajHead, 'hero');
        const tickSeen = inView(tick.position) && !hidden(tick.position, 'tick');
        if (step.say === 'aj' ? ajSeen : tickSeen) fr.speaker++;
        if (step.say === 'tick') {
          fr.tickFrames++;
          if (Math.abs(proj(tick.position).x) < 0.2) fr.tickCentred++;
          if (soundscape.speakerAt?.('tick') === tick.position) fr.blipsFromTick++;
        }
        if (ajSeen && tickSeen) fr.both++;
        if (proj(hero.position).x < proj(tick.position).x) fr.order++;
        if (horse.position.distanceTo(c) > hero.position.distanceTo(c) + 0.5 && horse.position.distanceTo(c) > tick.position.distanceTo(c) + 0.5) fr.behind++;
        if (Math.abs(tick.position.y - ajHead.y) < 0.35) fr.tickHead++;
      }
    }
    if (horse.position.y < 0.05 && horse.grounded) dropped = true;
    if (dropped && !hero.riding && horse.mode === 'idle') landedOnFoot = true;
    if (landedOnFoot) {
      tickNear = Math.min(tickNear, tick.position.distanceTo(hero.position));
      tickHorse = Math.min(tickHorse, Math.hypot(tick.position.x - hero.position.x, tick.position.z - hero.position.z));
      if (tick.target && tick.position.distanceTo(tick.target) < 0.3) { const b = tick.model.position.y - tick.position.y; tickBob = [Math.min(tickBob[0], b), Math.max(tickBob[1], b)]; }
    }
    if (tick.nervousT > 0) { nervousSeen++; glanceMax = Math.max(glanceMax, yawRel()); }
    if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
  }
  for (let i = 0; i < 3; i++) await frame(); // (the scene's end settles: into play)
  const L = D2.arrival;
  const want = [`${S.aj}: ${L.where}`, `${S.tick}: ${L.welcome}`, `${S.aj}: ${L.clock}`, `${S.tick}: ${L.dreamClock}`, `${S.tick}: ${L.stops}`, `${S.tick}: ${L.took}`, `${S.aj}: ${L.amy}`, `${S.tick}: ${L.cannot}`];
  check(JSON.stringify(view.lines) === JSON.stringify(want), `the arrival's lines in order:\n       ${view.lines.join('\n       ')}`);
  check(dropped && landedOnFoot && (sound.counts.clock_chime ?? 0) > chime && sound.counts.tick_whir >= 1, 'AJ and the horse drop into the courtyard (a chime far away), he gets down, Tick whirs in');
  check(!Object.values(L).some((t) => /witch/i.test(t)), 'no "witch" anywhere in the arrival\'s lines');
  check((sound.counts.clock_stop_warning ?? 0) === 1 && soundscape.voices?.girl === 'amy2' && (sound.counts.gear_whoosh ?? 0) === 0,
    'sound: a slow dissonant warning as Tick says the clock is slowing; Amy\'s Part 2 voice (amy2) set for the chapter');
  check(fr.frames > 60 && fr.speaker === fr.frames && fr.tickCentred === fr.tickFrames && fr.both === fr.frames && fr.order === fr.frames && fr.behind === fr.frames && fr.tickHead === fr.frames && fr.blipsFromTick === fr.tickFrames,
    `the talk: each line frames its speaker (${fr.speaker}/${fr.frames}) — Tick in the middle of the screen for his (${fr.tickCentred}/${fr.tickFrames}), his blips from where he floats — both in the shot above the dialogue box and never hidden behind the horse (${fr.both}), AJ on the left, Tick on the right (${fr.order}), the horse behind them (${fr.behind}), Tick at head height (${fr.tickHead})`);
  check(fr.clockFrames > 10 && fr.clock === fr.clockFrames && fr.ajUp === fr.clockFrames,
    `"${L.clock}": AJ looks up and the camera tilts up past him to the Dream Clock's face and the turning gears (${fr.clock}/${fr.clockFrames})`);
  check(tickNear < 3.2 && tickHorse < 2.8 && tickBob[1] - tickBob[0] > P2.tick.bob && tickBob[1] - tickBob[0] < P2.tick.bob * 2.5 && nervousSeen > 20 && glanceMax > 0.8,
    `Tick floats in beside AJ (${tickHorse.toFixed(2)} across from him) with a gentle bob (${(tickBob[1] - tickBob[0]).toFixed(2)}) and says "${L.cannot}" nervously, glancing over his shoulder (${glanceMax.toFixed(2)} rad)`);
  check(state.is(STATES.PLAY) && p2.at === 'courtyard' && ui.quest === D2.objectives.fire && ui.dist > 5 && ui.toasts.includes(D2.objectives.fire),
    `then the courtyard in play: "${ui.quest}" (${ui.dist} away)`);
  check(Math.abs(gear.angle - gearRot) > 1e-3 && !ui.gemsShown && input.combatHidden, 'the gear sky turns; no gems or fighting buttons in Gearhaven');
  check(tower.userData.clock.minute !== minute0 && p2.gearhaven.userData.skyline.userData.chimneys.length >= 6 && (heroAssets.placeholder || p2.gearhaven.userData.skyline.userData.kit),
    `the clock tower's hands move; the brass skyline (Castle Kit, ${p2.gearhaven.userData.skyline.userData.chimneys.length} chimneys) round the horizon`);
}

// 2) The courtyard: things move; AJ walks about inside its wall; the Fire door opens its stub.
{
  const p2 = levels.current;
  const u = p2.gearhaven.userData;
  const minute = u.clock.minute.rotation.z, cogItem = u.decor.sets[0].items[0], cog = cogItem.angle;
  let steamMax = 0;
  held = { moveX: 0, moveY: 1, jumpPressed: false };
  const p0 = hero.position.clone();
  let maxR = 0, minY = Infinity, tickFrames = 0, tickSeen = 0;
  for (let i = 0; i < 60 * 8; i++) {
    await frame();
    if (i > 60 * 2) {
      // Tick beside AJ at his head height, on screen (above the HUD buttons' band, under the top bar).
      tickFrames++;
      const q = p2.tick.position.clone().project(cam.camera);
      if (q.z < 1 && Math.abs(q.x) < 0.95 && q.y > -0.3 && q.y < 0.8 && Math.abs(p2.tick.position.y - (hero.position.y + P2.tick.float)) < 0.35 && Math.hypot(p2.tick.position.x - hero.position.x, p2.tick.position.z - hero.position.z) < 2.6) tickSeen++;
    }
    steamMax = Math.max(steamMax, u.steam.count);
    maxR = Math.max(maxR, Math.hypot(hero.position.x, hero.position.z));
    minY = Math.min(minY, hero.position.y);
  }
  held = { moveX: 0, moveY: 0, jumpPressed: false };
  check(hero.position.distanceTo(p0) > 3 && maxR <= P2.gearhaven.floor.wall + 0.01 && minY > -0.05, `AJ walks about the courtyard and stays inside its wall (${maxR.toFixed(2)} ≤ ${P2.gearhaven.floor.wall}), on its floor`);
  check(tickFrames > 100 && tickSeen === tickFrames, `Tick floats beside AJ at his head height, always on screen while he walks (${tickSeen}/${tickFrames})`);
  check(u.clock.minute.rotation.z !== minute && cogItem.angle !== cog && steamMax > 0, `the clock's hands, the cogs and the steam move (${steamMax} puffs)`);
  // The courtyard's ambience: its very quiet loops (tick-tock, gears, steam) and Tick's hum.
  const SN = P2.sound, amb = SN.ambience.courtyard, lv = p2.sounds.levels;
  check(['clock_tick', 'gear_turn', 'steam_hiss', 'tick_hover'].every((n) => p2.sounds.loopsNow.has(n)) && Object.entries(amb).every(([n, v]) => Math.abs(lv[n] - v) < 1e-6) && soundscape.musicPhase === 'gearhaven',
    `the courtyard's ambience loops (${[...p2.sounds.loopsNow].join(', ')}), the Gearhaven theme`);
  // Into the Fire door.
  const door = u.doors.fire.at;
  hero.puppet(door.clone().multiplyScalar(0.97), 0, 0);
  await frame(); await frame();
  check(p2.at === 'ride' && ui.quest === D2.ride.quest && horse.mode === 'riding' && hero.world === p2.rideWorld,
    `walking into the Fire door: the Gearhaven ride ("${ui.quest}", on the horse; npm run test:ride plays it)`);
  {
    // The ambience fades between sections: the courtyard's steam out, the ride's factory hum in, over ambienceFade s.
    const SN = P2.sound, lv = p2.sounds.levels;
    for (let i = 0; i < 20; i++) await frame();
    const mid = { steam: lv.steam_hiss ?? 0, hum: lv.factory_hum ?? 0 };
    for (let t = 0; t < SN.ambienceFade + 0.3; t += dt) await frame();
    check(mid.steam > 0.05 && mid.steam < SN.ambience.courtyard.steam_hiss && mid.hum > 0.05 && mid.hum < SN.ambience.ride.factory_hum && !lv.steam_hiss && Math.abs(lv.factory_hum - SN.ambience.ride.factory_hum) < 1e-6,
      `the ambience fades between sections (a third of a second in: the courtyard's steam ${mid.steam.toFixed(2)}, the ride's factory hum ${mid.hum.toFixed(2)}; then gone / full)`);
  }
  // (its end: the door → the Fire Element's level, the furnace city: test:fire plays it)
  p2.ride.onFinish();
  for (let i = 0; i < 400 && p2.at !== 'fire'; i++) { await frame(); await new Promise((r) => setTimeout(r, 25)); } // (the level builds itself the first time: real file reads)
  await frame(); await frame();
  check(p2.at === 'fire' && ui.quest === D2.fire.quest && horse.mode === 'riding' && hero.world === p2.fire.world && p2.fire.stage === 'ride',
    `at the ride's end the Fire Element's level begins (the furnace city, on the horse): "${ui.quest}"`);
  // (a level's stub: its door back leads to the courtyard)
  await levels.load('part2', { start: 'lightning' });
  await frame();
  hero.puppet(p2.stubs.lightning.door.clone(), 0, 0);
  await frame(); await frame();
  check(p2.at === 'courtyard' && Math.hypot(hero.position.x, hero.position.z) < P2.gearhaven.floor.radius, 'a stub level\'s door back leads to the courtyard');
}

// 3) Every level's stub, Amy's final fight and the Part 2 ending (the test menu's jumps).
{
  const got = [];
  for (const id of [...P2.levels.order.filter((l) => l !== 'fire'), 'final']) {
    await levels.load('part2', { start: id });
    await frame();
    got.push(levels.current.at === id && ui.quest === D2.comingSoon(D2.levelNames[id]) && state.is(STATES.PLAY));
  }
  check(got.every(Boolean), `each other level (Lightning, Steam, Magnet, Time) and Amy's final fight load as a "coming soon" stub (${got.filter(Boolean).length}/${got.length})`);
  check(soundscape.musicPhase === 'stub' && CONFIG.audio.music.phases.stub === 'gearhaven', 'a stub reuses the Gearhaven theme until its level exists');
  await levels.load('part2', { start: 'ending' });
  await frame();
  check(state.is(STATES.ENDING) && levels.current.at === 'ending', 'the Part 2 ending (the ending screens: "To be continued... Part 3")');
  check(soundscape.musicPhase === 'part2End' && !levels.current.sounds.loopsNow.size, 'its gentle, hopeful music, and no ambience');
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

// 6) The robots: Leela the scout (smallest), Mike and Stan the sword robots, George the mech boss.
{
  const RB = P2.robots;
  const models = {};
  for (const kind of Object.keys(RB.kinds)) models[kind] = await loadRobotModel(kind, heroAssets);
  const rows = [];
  let ok = true;
  for (const [kind, m] of Object.entries(models)) {
    const u = m.userData;
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m, true);
    const h = box.max.y - box.min.y;
    const want = RB.kinds[kind].height;
    // Animating: a pose changes after the walk clip runs a moment.
    u.animator.play('walk');
    const snap = () => { const v = []; m.traverse((o) => { if (o.isBone || o.isMesh) v.push(o.position.y, o.rotation.x, o.rotation.z); }); return v.join(','); };
    const a = snap();
    for (let i = 0; i < 12; i++) { u.animator.update(1 / 30); m.updateMatrixWorld(true); }
    const moved = snap() !== a;
    const roles = ['idle', 'walk', 'attack'].every((r) => u.roles[r]);
    // Its own texture colours with brass / copper accents; a glowing eye (Mike, Stan: orange; George: red; Leela: none).
    let tinted = u.placeholder;
    m.traverse((o) => { if (o.isMesh && o.material.map && o.material.userData?.accents === RB.kinds[kind].accents) tinted = true; });
    const E = RB.kinds[kind].eye;
    const eyeOk = u.placeholder || (E ? u.eye?.children[0]?.material.color.getHex() === E.color && !!u.eye.parent?.isBone : !u.eye);
    const fine = Math.abs(h - want) < want * 0.06 && roles && moved && tinted && eyeOk && (heroAssets.placeholder || !u.placeholder);
    ok &&= fine;
    rows.push(`${u.name} (${kind}) ${h.toFixed(2)} tall, idle ${u.roles.idle?.name} / walk ${u.roles.walk?.name} / attack ${u.roles.attack?.name}${u.placeholder ? ' [placeholder]' : ''}${fine ? '' : ' ✗'}`);
  }
  const H = (k) => RB.kinds[k].height;
  check(ok && H('scout') < H('swordA') && H('swordA') === H('swordB') && H('swordB') < H('boss') && (heroAssets.placeholder || models.swordA.userData.roles.attack?.name.includes('SwordSlash')),
    `the robots by size and role, in their own colours with brass / copper accents, glowing eyes on the head bone (Mike and Stan orange, George red), animating:\n       ${rows.join('\n       ')}`);
  // A file that fails → the placeholder robot (and Tick's placeholder).
  forgetRobotTemplates();
  const warn = console.warn; console.warn = () => {};
  const fail = { readFile: async () => { throw new Error('missing'); } };
  const ph = await loadRobotModel('boss', fail);
  const tph = await loadTickModel(fail);
  console.warn = warn;
  forgetRobotTemplates();
  check(ph.userData.placeholder && ph.userData.animator.play('attack') && tph.userData.placeholder, 'a robot or Tick file that fails to load → the placeholder model');
}

// 7) The "Robots test" (?debug): all five in a row, each going through its clips.
{
  await levels.load('part2', { start: 'robots' });
  for (let i = 0; i < 30; i++) await frame();
  const S = levels.current.showcase;
  const first = S.items.map((it) => it.clip);
  for (let t = 0; t < P2.showcase.clipTime + 0.2; t += dt) await frame();
  const xs = S.items.map((it) => it.x);
  const advanced = S.items.every((it, i) => it.clip > first[i] && it.clips.length >= (heroAssets.placeholder ? 0 : 5));
  check(levels.current.at === 'robots' && S.items.length === 5 && xs.every((x, i) => i === 0 || x > xs[i - 1]) && advanced && ui.quest === D2.robotsTest && S.group.visible,
    `the Robots test: ${S.items.map((it) => `${it.name} (${it.clips.length} clips)`).join(', ')} in a row, each on to its next clip`);
  for (let t = 0; t < P2.showcase.clipTime * 6; t += dt) await frame();
  const heard = ['robot_walk', 'boss_mech_step', 'robot_swing', 'robot_alert', 'boss_mech_roar', 'robot_hit'].filter((n) => (sound.counts[n] ?? 0) > 0);
  check(heard.length >= (heroAssets.placeholder ? 2 : 5), `the robots' sounds as they go through their clips (from where each stands): ${heard.join(', ')}`);
  await levels.load('part2', { start: 'courtyard' });
  check(!S.group.visible, 'and gone again elsewhere');
}

// 7b) The "Props test" (?debug): every kind of kit prop in a row, animating; the Time Element's
// clock tower; the Credits list.
{
  await levels.load('part2', { start: 'props' });
  for (let i = 0; i < 30; i++) await frame();
  const S = levels.current.props;
  const names = S.items.map((it) => it.name);
  const want = ['gear_01', 'cluster', 'Cog', 'Collectible', 'Saw', 'Conveyor', 'Pipe', 'Catwalk', 'Rail', 'Clock tower', 'Castle gate', 'Item: cog key', 'Item: healing elixir', 'Item: energy elixir', 'Item: gem', 'Item: heart container', 'Item: gear bundle', 'Item: rune stone', 'Item: wand piece', 'Item: chest (small)', 'Item: chest (big)'];
  const xs = S.items.map((it) => it.x);
  const sawX = S.group.getObjectByName('saw').userData.blade.position.x;
  for (let i = 0; i < 40; i++) await frame();
  const moving = S.group.getObjectByName('saw').userData.blade.position.x !== sawX;
  const pan = S.pan;
  await frame();
  check(levels.current.at === 'props' && want.every((w) => names.some((n) => n.includes(w))) && xs.every((x, i) => i === 0 || x > xs[i - 1]) && moving && S.pan !== pan && ui.quest === D2.propsTest && S.group.visible && hero.position.y > -1,
    `the Props test: ${names.join(', ')} in a row, animating, the camera sliding along it; AJ stands for scale`);
  const castle = S.group.children.find((c) => c.userData.gates);
  check(!!castle && (heroAssets.placeholder || castle.userData.kit), `the castle gate there ${castle?.userData.kit ? 'in the Castle Kit' : '(placeholder)'}`);
  await levels.load('part2', { start: 'courtyard' });
  check(!S.group.visible, 'and gone again elsewhere');
  await levels.load('part2', { start: 'time' });
  const tower = levels.current.timeTower;
  const m0 = tower.userData.clock.minute;
  for (let i = 0; i < 30; i++) await frame();
  check(levels.current.stubs.time.group.visible && tower.visible && tower.userData.clock.minute !== m0, 'the Time Element\'s place: the clock tower behind its platform, its hands moving');
  const C = DIALOGUE.credits;
  const all = C.entries.map((e) => `${e.what} ${e.who ?? ''} ${e.licence ?? ''} ${e.text ?? ''}`).join(' | ');
  check(['Animated Robot', 'Animated Mech Pack', 'Collectible Gear', 'Factory Kit', 'Coaster Kit', 'Castle Kit', 'Poly by Google [CC-BY]', 'poly.pizza/m/0icYC-GPiro'].every((w) => all.includes(w)) && /Quaternius/.test(all) && /Kenney/.test(all),
    `the Credits list: ${C.entries.length} entries (Quaternius, Kenney — CC0; the Poly by Google gear's exact attribution)`);
}

// 7c) Gearhaven's looks: each one repaints the sky, fog, lights, floor, path and kit tints; the
// floor stays silver (never pure white) and the conveyors brass / steel in every look.
{
  await levels.load('part2', { start: 'courtyard' });
  const p2 = levels.current;
  const LK = P2.looks;
  const start = P2.gearhavenLook;
  const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const inBox = (c) => { const [r, g, b] = hex(c); return r >= 0xc9 && g >= 0xd1 && b >= 0xd6 && r <= 0xe3 && g <= 0xe8 && b <= 0xeb; };
  const floorMat = p2.gearhaven.userData.floor.material;
  const seen = [];
  for (const name of LK.order) {
    p2.setLook(name);
    await frame();
    const L = LK[name];
    const conv = CONFIG.kits.tints.conveyor;
    const greyOk = Math.max(...hex(conv.grey)) < 0xb0 && Math.max(...hex(conv.cool)) < 0xc0; // (dark enough: the belt never renders white)
    seen.push(`${L.name}: fog #${p2.scene.fog.color.getHexString()}, floor #${floorMat.color.getHexString()}, edge #${L.path.edge.toString(16)}`);
    check(P2.gearhavenLook === name && p2.scene.fog.color.getHex() === L.fog && p2.rig.hemi.color.getHex() === L.hemi.sky && floorMat.color.getHex() === L.floor.base && inBox(L.floor.base) && L.floor.base !== 0xffffff
      && CONFIG.kits.tints.factory.cool === L.tints.factory.cool && greyOk && p2.rig.points.length === LK.lights,
      `the "${L.name}" look: sky, fog, lights, the silver floor (#${L.floor.base.toString(16)}, in #c9d1d6–#e3e8eb), kit tints, the conveyors brass / steel`);
  }
  p2.setLook(); // (cycles)
  check(P2.gearhavenLook !== LK.order[LK.order.length - 1] && typeof DIALOGUE.testMenu.look('x') === 'string', `the ?debug "Look" button cycles them (${seen.length} looks)`);
  p2.setLook(start);
  check(P2.levels.order.every((id) => P2.levels[id].accent?.length === 2) && P2.levels.final.accent, 'a pair of accent colours per level (Fire, Lightning, Steam, Magnet, Time, the final fight)');
}

// 8) A chapter that fails to load leaves the game where it is.
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
