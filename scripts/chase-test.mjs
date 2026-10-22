// Headless test: the sandstorm chase after the Lazarus Pit and the castle-gate cinematic.
// Nothing spawns before the pit scene ends; the first skeleton group rises 2 s after the ride
// resumes (also when the scene is skipped); caps; 2 Batarang hits kill a skeleton; Smoke and
// Flash from the saddle; the hero never drops below half a heart in the chase; the storm (builds,
// the trail corridor stays clear of sand, enough visibility, a gentle shake); dying in the chase
// restarts at the checkpoint after the pit (storm and skeletons reset, no pit again); a bot rides
// from the pit to the castle and the gate cinematic always completes (the skeleton line thrown
// aside, the horse never blocked, the gates open and slam shut, Amy glances back, the ending);
// Skip; Play Again resets the storm, the skeletons and the gates.
// Usage: npm run test:chase   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { GameState, STATES } from '../src/state.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Abilities } from '../src/abilities.js';
import { Combat } from '../src/combat.js';
import { Lives } from '../src/lives.js';
import { Boss } from '../src/boss.js';
import { Girl } from '../src/girl.js';
import { Quests } from '../src/quests.js';
import { FollowCamera } from '../src/camera.js';
import { Cinematic } from '../src/cinematic.js';
import { Story } from '../src/story.js';
import { Sound } from '../src/audio.js';
import { LazarusPit } from '../src/pit.js';
import { Minions } from '../src/minions.js';
import { Sandstorm } from '../src/sandstorm.js';
import { CastleGate } from '../src/gate.js';
import { characterBodies } from '../src/fade.js';

const DS = CONFIG.desert, SK = CONFIG.minions.skeletons, CH = DS.chase, ST = DS.storm, GT = DS.gate, MN = CONFIG.minions;
const dt = 1 / 60, NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const sound = new Sound();
const horse = new Horse(scene, world, heroAssets); horse.sound = sound; await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
const lives = new Lives();
abilities.lives = lives;
const gems = new Gems(scene, world, { onUnlock: (c, a) => abilities.unlock(a) }); await gems.init();
abilities.gems = gems;
const boss = new Boss(scene, world, {}, heroAssets); await boss.init();
combat.addTarget(boss);
const girl = new Girl(scene, boss.girl); await girl.init();
const ui = { toast() {}, setQuest(t) { this.text = t; } };
const quests = new Quests(scene, world, ui, horse); quests.boss = boss; await quests.init();
const cam = new FollowCamera(20 / 9, world);
const state = new GameState(STATES.PLAY);
const view = { shown: false, complete: false, show() { this.shown = true; }, hide() { this.shown = false; },
  dialogue(speaker, text, complete) { this.complete = complete; }, clearDialogue() { this.complete = false; } };
const cinematic = new Cinematic(cam, view);
cinematic.bodies = characterBodies({ hero, girlModel: boss.girl, horse });
const pit = new LazarusPit(scene, world, sound); await pit.init();
let story = null;
// Hits on the hero, as main.js: the chase rule (story.chaseHit), then hearts; out of hearts → a respawn on the horse.
let deaths = 0, minHearts = Infinity;
const hitsTaken = [];
const damageHero = (n, x, z, opts = {}) => {
  if (hero.invincible || !state.is(STATES.PLAY)) return false;
  n = story.chaseHit(n, opts.source);
  if (n <= 0) return false;
  hero.hurt(x, z, opts.knockback !== false, opts.source !== 'fire');
  hitsTaken.push({ n, source: opts.source, t: story.chaseTime });
  if (lives.damage(n)) {
    deaths++;
    lives.resolveDeath();
    abilities.clear();
    combat.reset();
    horse.respawnAtCheckpoint(hero);
    minions.clear(); // (lifeEvents.onRespawn)
    story.restartChase();
  }
  minHearts = Math.min(minHearts, lives.hearts);
  return true;
};
const minions = new Minions(scene, world, { hero, horse, combat, abilities, gems, camera: cam.camera, onHitHero: damageHero, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder });
abilities.camera = cam.camera;
const storm = new Sandstorm(scene, world); await storm.init();
const gate = new CastleGate(scene, world); await gate.init(); gate.camera = cam.camera;
story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, pit, gate, storm, minions, sound });
quests.story = story;
state.onEnter(STATES.CUTSCENE, () => minions.clear()); // (as main.js)
await minions.ready('skeleton');

let clock = 0;
// One game frame, in main.js's order.
async function frame(input = null) {
  const playing = state.is(STATES.PLAY);
  const inp = input ?? NEUTRAL;
  if (playing && !horse.controlsHero) hero.update(dt, inp, cam.yaw);
  horse.update(dt, playing ? inp : state.is(STATES.CUTSCENE) ? NEUTRAL : null, cam.yaw, hero);
  if (playing) {
    combat.update(dt, inp, { mounted: horse.controlsHero });
    if (inp.ability) abilities.use(inp.ability);
  }
  abilities.update(dt);
  if (playing) {
    minions.update(dt, { playing: true, riding: horse.controlsHero, route: horse.route === world.desertTrack ? 'desert' : 'forest', pitDone: story.pitDone, galloping: horse.galloping,
      chase: { active: story.desertChaseActive, time: story.chaseTime, over: story.chaseOver } });
  }
  gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
  girl.update(dt);
  story.update(dt, playing || state.is(STATES.CUTSCENE));
  if (cinematic.active) cinematic.update(dt);
  else cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
  world.update(dt, cam.camera.position);
  storm.update(dt, story.stormLevel, cam.camera, cam);
  gate.update(dt, story.gateStarted && !story.gateDone ? horse : null);
  clock += dt;
  await null;
}
const track = world.desertTrack;
const skeletons = () => minions.list.filter((m) => m.type === 'skeleton' && !m.removed);
const aliveSk = () => skeletons().filter((m) => m.alive);
// Riding bot: along the trail's centre line (optionally galloping), reading through cutscenes.
let readFor = 0;
const rideInput = (gallop = false, extra = {}) => {
  const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
  const p = track.at(Math.min(track.length + 40, n.s + 14));
  const want = Math.atan2(p.x - horse.position.x, p.z - horse.position.z);
  return { moveX: THREE.MathUtils.clamp(-wrap(want - horse.heading) * 2.2, -1, 1), moveY: 1, jumpPressed: false, gallop, ...extra };
};
const cutsceneFrame = async () => {
  await frame();
  if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
};
const freshGame = async () => {
  story.resetAll(); minions.clear(); state.current = STATES.PLAY;
  hitsTaken.length = 0; deaths = 0; minHearts = Infinity;
  await story.debugDesert();
};
/** To the Lazarus Pit and through its scene (read, or Skip on the first line). Returns the clock when the ride resumed. */
const throughPit = async (skip) => {
  await story.debugPit();
  let spawnedInScene = 0;
  for (let i = 0; i < 6000 && (cinematic.active || !story.pitDone); i++) {
    if (skip && view.complete) { await cinematic.skip(); await frame(); break; }
    await cutsceneFrame();
    spawnedInScene += skeletons().length;
  }
  return { resumed: clock, spawnedInScene };
};

// 1) Nothing before the pit scene ends; the first group 2 s after the ride resumes.
for (const skip of [false, true]) {
  await freshGame();
  const s0 = minions.stats.spawned.skeleton;
  for (let i = 0; i < 60 * 20; i++) await frame(rideInput());
  const beforePit = minions.stats.spawned.skeleton - s0;
  const level0 = story.stormLevel;
  const { resumed, spawnedInScene } = await throughPit(skip);
  const active = story.desertChaseActive && story.pitDone && state.is(STATES.PLAY);
  let firstAt = -1, stormAt = -1;
  const s1 = minions.stats.spawned.skeleton;
  for (let i = 0; i < 60 * 4 && firstAt < 0; i++) {
    await frame(rideInput());
    if (stormAt < 0 && story.stormLevel > 0) stormAt = clock - resumed;
    if (minions.stats.spawned.skeleton > s1) firstAt = clock - resumed;
  }
  check(beforePit === 0 && spawnedInScene === 0 && level0 === 0, `${skip ? 'pit skipped' : 'pit played'}: nothing spawns before the pit scene ends (${beforePit} in 20 s of desert, ${spawnedInScene} in the scene), no storm`);
  check(active && Math.abs(firstAt - SK.firstDelay) < 0.05, `${skip ? 'pit skipped' : 'pit played'}: desertChaseActive set, the first group rises ${firstAt.toFixed(2)} s after the ride resumes`);
  check(Math.abs(stormAt - CH.stormDelay) < 0.05, `the storm begins to build ${stormAt.toFixed(2)} s after the ride resumes`);
  const cp = horse.checkpoints[horse.lastCheckpoint];
  check(cp?.here && Math.abs(cp.s - story.pitTriggerS) < 10, `a checkpoint right after the pit (s ${cp?.s.toFixed(0)}, the pit at ${story.pitTriggerS.toFixed(0)})`);
}

// 2) The storm: builds over 3 s, the trail corridor stays clear of sand, visibility, a gentle shake.
{
  let full = -1, inCorridor = 0, frames = 0, shake = 0;
  const t0 = story.chaseTime;
  for (let i = 0; i < 60 * 8; i++) {
    await frame(rideInput());
    if (full < 0 && story.stormLevel >= 1) full = story.chaseTime;
    if (storm.strength > 0.3) { inCorridor += storm.particlesInCorridor(); frames++; }
    shake = Math.max(shake, cam.wind);
  }
  const fog = scene.fog;
  const at60 = (60 - fog.near) / (fog.far - fog.near);
  check(Math.abs(full - (CH.stormDelay + CH.stormBuild)) < 0.05 && storm.strength > 0.95 && storm.model.visible, `the storm is at full strength ${full.toFixed(2)} s after the ride resumes (strength ${storm.strength.toFixed(2)}; from ${t0.toFixed(1)} s)`);
  check(frames > 100 && inCorridor === 0, `no sand inside the clear corridor over the trail (±${ST.clear.halfWidth}, ${ST.clear.ahead} ahead): ${inCorridor} particle-frames in ${frames} frames`);
  const vis = storm.model.userData.streaks.geometry.attributes.instanceFade.array;
  const shown = [...vis].filter((f) => f > 0.05).length;
  check(at60 < 0.4 && fog.far >= 120 && shown > ST.streaks.count * 0.2, `visibility along the trail: fog ${(at60 * 100).toFixed(0)}% at 60 (near ${fog.near.toFixed(0)}, far ${fog.far.toFixed(0)}); ${shown} wind streaks at the sides`);
  check(shake > 0 && shake <= ST.shake * 1.6, `a gentle camera shake with the wind (${shake.toFixed(3)})`);
}

// 3) Skeletons from the saddle: 2 Batarang hits kill one; Smoke paralyzes one; Flash kills those near its target.
{
  minions.clear();
  gems.counts.yellow = 20; gems.counts.blue = 10; gems.counts.pink = 10;
  ['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
  horse.speed = 0;
  const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  const at = (ahead, side = 0) => { const p = horse.position.clone().addScaledVector(f, ahead).add(new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(side)); return { x: p.x, z: p.z }; };
  const stand = { moveX: 0, moveY: -1, jumpPressed: false };
  const sk = await minions.spawnAt('skeleton', at(-9, 2)); sk.state = 'move'; sk.cooldown = 99; // (behind: any direction)
  let throws = 0;
  for (let i = 0; i < 60 * 6 && sk.alive; i++) {
    sk.cooldown = 99; sk.state = sk.state === 'move' ? 'move' : sk.state;
    const ready = !abilities.batarangOut && abilities.cooldowns.batarang <= 0;
    if (ready) throws++;
    await frame({ ...stand, ability: ready ? 'batarang' : null });
  }
  check(!sk.alive && throws === 2 && MN.types.skeleton.hp === 2 * MN.damage.batarang, `2 Batarang throws kill a skeleton behind the horse (${MN.types.skeleton.hp} HP, ${MN.damage.batarang} each; ${throws} throws)`);
  minions.clear();
  const sm = await minions.spawnAt('skeleton', at(8, 1)); sm.state = 'move';
  const smokeOk = abilities.use('smokeBomb');
  let paralyzedFor = 0;
  for (let i = 0; i < 60 * 3; i++) { sm.cooldown = 99; await frame(stand); if (sm.state === 'paralyzed') paralyzedFor += dt; }
  check(smokeOk && paralyzedFor > 1.5, `Smoke Bomb from the saddle paralyzes a skeleton (${paralyzedFor.toFixed(1)} s so far)`);
  minions.clear();
  const near = await minions.spawnAt('skeleton', at(10, 2));
  const near2 = await minions.spawnAt('skeleton', at(12, -2));
  const far = await minions.spawnAt('skeleton', at(-12, 0));
  for (const m of [near, near2, far]) m.state = 'move';
  lives.setHearts(lives.maxHearts);
  const flashOk = abilities.use('flashMode');
  for (let i = 0; i < 60 * 1.5; i++) { for (const m of [near, near2, far]) m.cooldown = 99; await frame(stand); }
  check(flashOk && !near.alive && !near2.alive && far.alive, `Flash from the saddle auto-locks onto the nearest skeleton and kills those within ${MN.flashKillRadius} of it (the one behind lives)`);
  minions.clear();
  lives.setHearts(lives.maxHearts);
}

// 4) Dying in the chase: back at the checkpoint after the pit, storm and skeletons from scratch, no pit again.
{
  for (let i = 0; i < 60 * 3; i++) await frame(rideInput());
  const cp = horse.checkpoints.find((c) => c.here);
  const before = { deaths, cinematics: 0 };
  hero.iframes = 0;
  lives.setHearts(1);
  damageHero(1, horse.position.x, horse.position.z, { source: 'debug' });
  // (the checkpoint after the pit, or a later desert one if he has reached it)
  const last = horse.checkpoints[horse.lastCheckpoint];
  const back = deaths === before.deaths + 1 && last.s >= cp.s && Math.hypot(horse.position.x - last.position.x, horse.position.z - last.position.z) < 0.5;
  const reset = story.chaseTime === 0 && storm.strength === 0 && skeletons().length === 0;
  let pitAgain = false, firstAt = -1;
  const s1 = minions.stats.spawned.skeleton;
  for (let i = 0; i < 60 * 3; i++) {
    await frame(rideInput());
    if (cinematic.active) pitAgain = true;
    if (firstAt < 0 && minions.stats.spawned.skeleton > s1) firstAt = story.chaseTime;
  }
  check(back && reset && !pitAgain && story.pitDone && Math.abs(firstAt - SK.firstDelay) < 0.05, `dying in the chase restarts at the checkpoint after the pit (${last.here ? 'the pit one' : 'a later one'}; storm ${storm.strength.toFixed(2)} → rebuilding, skeletons cleared, first group again at ${firstAt.toFixed(2)} s, pit not replayed)`);
}

// 4b) Stopped in the chase with skeletons all round for 20 s: they hit, but never below half a heart.
{
  minions.clear();
  lives.setHearts(lives.maxHearts);
  hitsTaken.length = 0;
  const d0 = deaths;
  let low = Infinity, grace = Infinity, last = -Infinity;
  for (let i = 0; i < 60 * 20; i++) {
    if (aliveSk().length < SK.max && i % 60 === 0) minions.skeletonGroup();
    await frame({ moveX: 0, moveY: -1, jumpPressed: false });
    low = Math.min(low, lives.hearts);
  }
  const sk = hitsTaken.filter((h) => h.source === 'skeleton');
  for (const h of sk) { grace = Math.min(grace, h.t - last); last = h.t; }
  check(sk.length >= 4 && low === CH.minHearts && deaths === d0 && grace >= CH.grace - 1e-6, `stopped among ${SK.max} skeletons for 20 s: ${sk.length} hits, hearts down to ${low} and no lower, no death, ≥ ${CH.grace} s between hits (${grace.toFixed(2)})`);
  minions.clear();
  lives.setHearts(lives.maxHearts);
}

// 5) A bot rides from the pit to the castle (passive: it never fights) and the gate cinematic completes.
const rideToEnd = async (gallop) => {
  await freshGame();
  await throughPit(true);
  const r = { maxAlive: 0, groups: 0, minHearts: Infinity, overAt: -1, sunk: -1, gateAt: -1, stormClear: -1, puppetsStaged: 0, blocked: 0, launched: 0, openAtGate: -1,
    inside: false, slammedAt: -1, glance: false, ending: -1, stuck: false, hits: 0, lastD: 0, standsInPath: 0 };
  let best = 0, since = 0, t = 0;
  hitsTaken.length = 0;
  while (t < 200 && !state.is(STATES.ENDING)) {
    t += dt;
    if (story.gateStarted) {
      if (r.gateAt < 0) {
        r.gateAt = t;
        const g = gate.frame.gate;
        r.gateDist = Math.hypot(horse.position.x - g.x, horse.position.z - g.z);
      }
      await frame();
      if (r.stormClear < 0 && story.stormLevel === 0) r.stormClear = story.gateTime;
      r.puppetsStaged = Math.max(r.puppetsStaged, gate.puppets.length);
      for (const p of gate.puppets) {
        // A skeleton still standing is never in the horse's way.
        if (!p.launched && p.model.position.distanceTo(horse.position) < CONFIG.horse.radius + 0.5) r.standsInPath++;
      }
      r.launched = gate.puppets.filter((p) => p.launched).length;
      if (story.gateRide) {
        if (story.gateRide.d < r.lastD - 1e-6) r.blocked++;
        r.lastD = story.gateRide.d;
        const { gate: gp, out } = gate.frame;
        const along = horse.position.clone().sub(gp).dot(out);
        if (r.openAtGate < 0 && along < 0.5) r.openAtGate = gate.open;
        r.inside = story.gateRide.done;
      }
      if (girl.glanceBack) r.glance = true;
      if (r.slammedAt < 0 && gate.slams > 0) r.slammedAt = t;
      continue;
    }
    if (cinematic.active) { await cutsceneFrame(); continue; }
    const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
    if (n.s > best + 1) { best = n.s; since = 0; } else if ((since += dt) > 5) { r.stuck = true; break; }
    await frame(rideInput(gallop));
    r.maxAlive = Math.max(r.maxAlive, aliveSk().length);
    if (story.desertChaseActive) r.minHearts = Math.min(r.minHearts, lives.hearts);
    if (story.chaseOver && r.overAt < 0) r.overAt = t;
    if (r.overAt >= 0 && r.sunk < 0 && t > r.overAt + SK.sink + 0.2) r.sunk = skeletons().filter((m) => m.state !== 'dying' && m.state !== 'fading').length;
  }
  r.ending = state.is(STATES.ENDING) ? t : -1;
  r.groups = minions.stats.skeletonGroups ?? 0;
  r.hits = hitsTaken.filter((h) => h.source === 'skeleton').length;
  r.t = t;
  return r;
};
for (const gallop of [false, true]) {
  const g0 = minions.stats.skeletonGroups ?? 0;
  const r = await rideToEnd(gallop);
  const label = gallop ? 'galloping' : 'normal speed';
  check(!r.stuck && r.ending > 0, `${label}: a bot rides from the pit to the castle (${r.t.toFixed(1)} s) and reaches the ending`);
  check(r.groups - g0 >= (gallop ? 2 : 3) && r.maxAlive <= SK.max, `${label}: ${r.groups - g0} skeleton groups on the way, at most ${r.maxAlive} alive (cap ${SK.max})`);
  check(r.minHearts >= CH.minHearts && deaths === 0, `${label}: ${r.hits} skeleton hits, the hero never below half a heart in the chase (lowest ${r.minHearts}), no deaths`);
  check(r.overAt > 0 && r.sunk === 0, `${label}: the chase ends ${SK.castleClear} from the castle, the rest sink into the sand (${r.sunk} left)`);
  check(r.gateAt > 0 && r.gateDist <= GT.trigger + 0.5 && r.gateDist > GT.trigger - 3 && r.stormClear > 0 && r.stormClear <= GT.stormClear + 0.05,
    `${label}: the gate cinematic starts ${r.gateDist.toFixed(1)} from the gate; the storm clears in ${r.stormClear.toFixed(2)} s`);
  check(r.puppetsStaged === 4 && r.launched === 4 && r.standsInPath === 0 && r.blocked === 0, `${label}: 4 skeletons in a line, each thrown aside as the horse passes (${r.launched}), never in its way (${r.standsInPath}), the horse never held back`);
  check(r.openAtGate > 0.9 && r.inside && r.slammedAt > 0 && gate.closed && r.glance && sound.counts.gateSlam >= 1, `${label}: the gates open as the horse arrives (${r.openAtGate.toFixed(2)}), it rides in, they slam shut behind it (sound), Amy glances back`);
  check(story.phase === 'done' && gate.puppets.every((p) => p.landed) && (gate.puppets.every((p) => { const { gate: gp, out } = gate.frame; return p.model.position.clone().sub(gp).dot(out) > 0.5; })), `${label}: the ending screens; the skeletons stay outside`);
}

// 6) Skip in the gate cinematic: inside, gates shut, the ending.
{
  await freshGame();
  await story.debugGate();
  for (let i = 0; i < 120 && !cinematic.active; i++) await frame(rideInput());
  const started = cinematic.active && story.gateStarted;
  for (let i = 0; i < 30; i++) await frame();
  await cinematic.skip();
  await frame();
  const { inside } = gate.frame;
  check(started && gate.closed && horse.position.distanceTo(inside) < 1.5 && state.is(STATES.ENDING), `debug gate (Alt+G) → the cinematic; Skip: inside (${horse.position.distanceTo(inside).toFixed(2)} from the stop), gates shut, the ending`);
}

// 7) Play Again: the storm, the skeletons and the gates are reset.
{
  gate.open = 1; for (const l of gate.leaves) l.rotation.y = 1;
  story.resetAll(); minions.clear(); state.current = STATES.PLAY;
  for (let i = 0; i < 3; i++) await frame();
  const ok = {
    storm: storm.strength === 0 && !storm.model.visible && story.stormLevel === 0 && cam.wind === 0,
    chase: !story.desertChaseActive && story.chaseTime === 0 && !story.chaseOver && !story.gateStarted,
    skeletons: skeletons().length === 0 && gate.puppets.length === 0,
    gates: gate.closed && gate.leaves.every((l) => l.rotation.y === 0) && gate.slams === 0,
    horse: !horse.scripted && !horse.hold && horse.checkpoints === horse.forestCheckpoints,
    fog: scene.fog.near === CONFIG.world.fogNear && scene.fog.far === CONFIG.world.fogFar,
  };
  const bad = Object.entries(ok).filter(([, v]) => !v).map(([k]) => k);
  check(bad.length === 0, `Play Again resets the storm, the chase, the skeletons and the gates${bad.length ? ' — NOT reset: ' + bad.join(', ') : ''}`);
}

console.log(failed ? 'CHASE TEST FAILED' : 'chase test passed');
process.exit(failed ? 1 : 0);
