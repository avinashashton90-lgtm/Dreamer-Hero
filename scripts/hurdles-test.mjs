// Headless test: the forest hurdles (hurdles.js) and the bats. Layout (spacing, the middle 80%,
// straights, no gem under one, bat windows never overlapping a hurdle); the giant wall (4 layers)
// hit at a normal canter stops the horse ~1 s, stumbling, then it goes on (no hearts, a shake,
// the hint once) and a gallop + power jump clears it comfortably; thorn bushes slide and slow
// the horse with a stumble (no hearts) unless jumped; stones make the horse stumble for a
// second (no hearts) unless jumped; then a full forest ride
// with bats about: it reaches the cave without getting stuck, clears every hurdle, and no bat
// comes in or starts an attack within batClear of a hurdle.
// Usage: npm run test:hurdles   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Minions } from '../src/minions.js';
import { FollowCamera } from '../src/camera.js';
import { Hurdles } from '../src/hurdles.js';
import { hurdleControls } from './hurdle-bot.mjs';

const HU = CONFIG.hurdles, T = HU.types, dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const horse = new Horse(scene, world, heroAssets); await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
const gems = new Gems(scene, world); await gems.init();
const cam = new FollowCamera(20 / 9, world);
const hurts = [], hints = [];
const hurdles = new Hurdles(scene, world, { onHurt: (n) => hurts.push(n), onHint: (t) => hints.push(t) });
await hurdles.init();
let bites = 0;
const minions = new Minions(scene, world, { hero, horse, combat, abilities, gems, camera: cam.camera, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder,
  onHitHero: () => { bites++; return true; } });
minions.scheduleBats(hurdles.batWindows());
await minions.ready('bat');
const track = world.track, L = track.length, list = hurdles.list;
const zoneOf = (s) => list.find((h) => s > h.s - HU.batClear.before && s < h.s + HU.batClear.after);

// 1) Layout.
{
  const spacing = list.slice(1).map((h, i) => h.s - list[i].s);
  const types = new Set(list.map((h) => h.type));
  const forestGems = gems.gems.filter((g) => g.zone === 'forest' && g.kind !== 'air');
  const onGem = forestGems.filter((g) => list.some((h) => Math.abs(g.s - h.s) < T.wall.depth + HU.contactReach + CONFIG.gems.size)).length;
  const windows = hurdles.batWindows();
  const overlap = windows.filter((w) => list.some((h) => w.from < h.s + HU.batClear.after && w.to > h.s - HU.batClear.before)).length;
  check(list.length >= 4 && types.size === 3 && spacing.every((d) => d >= HU.obstacleSpacingMin) && list.every((h) => h.s >= L * HU.edgeClear && h.s <= L * (1 - HU.edgeClear)),
    `${list.length} hurdles (${list.map((h) => `${h.type}@${h.s.toFixed(0)}`).join(' ')}), spaced ${spacing.map((d) => d.toFixed(0)).join(', ')} (≥ ${HU.obstacleSpacingMin}), none in the first or last ${HU.edgeClear * 100}%`);
  check(list.every((h) => track.maxCurvature(h.s - HU.straightBefore, h.s + HU.straightAfter) <= HU.maxCurvature) && onGem === 0, `all on straights, no gem under one (${onGem})`);
  check(windows.length >= list.length && overlap === 0, `bat windows (${windows.length}) never overlap a hurdle's zone (−${HU.batClear.before} … +${HU.batClear.after})`);
  check(world.obstacles.length === 0 && world.gapWalls.length === 4, `the old logs / rock wall / brick walls are gone (${world.obstacles.length}); the 4 high walls stay`);
}

// Riding helpers.
const mountAt = (s, speed = CONFIG.horse.maxSpeed) => {
  const p = track.at(s);
  if (horse.controlsHero) { horse.mode = 'idle'; hero.riding = false; }
  horse.position.set(p.x, world.heightAt(p.x, p.z), p.z);
  horse.heading = Math.atan2(p.tx, p.tz);
  horse.trackS = s;
  horse.velocity.set(0, 0, 0);
  horse.mountNow(hero);
  horse.speed = speed; horse.stamina = 1;
  cam.reset(); cam.snapTo(hero.position);
};
const steer = (lat = 0) => {
  const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
  const p = track.at(Math.min(L, n.s + 14));
  const want = Math.atan2(p.x - p.tz * lat - horse.position.x, p.z + p.tx * lat - horse.position.z);
  return THREE.MathUtils.clamp(-wrap(want - horse.heading) * 2.2, -1, 1);
};
const step = (input) => {
  horse.update(dt, { moveX: steer(input.lat ?? 0), moveY: 1, jumpPressed: !!input.jump, gallop: !!input.gallop }, 0, hero);
  hurdles.update(dt, horse);
};

// 2) A giant wall (`wallLayers` 4 layers): a canter into it → the horse stops and stumbles ~1 s,
//    then goes on — no hearts; a gallop + power jump clears it comfortably.
{
  const w = list.find((h) => h.type === 'wall');
  const wallH = HU.wallLayers * T.wall.layerHeight;
  check(HU.wallLayers === 4 && Math.abs(wallH - 1.52) < 1e-9, `the giant wall: ${HU.wallLayers} layers, ${wallH.toFixed(2)} high`);
  hurdles.reset(); hurts.length = 0; hints.length = 0;
  mountAt(w.s - 60);
  let t = 0;
  while (t < 8 && hurdles.stats.wallBlocks === 0) { step({}); t += dt; }
  const blocked = hurdles.stats.wallBlocks === 1;
  const after = hurdles.frame(w, horse.position).along;
  const shake = w.shake;
  // Stopped about a second (stumbling, the stick still pushed), then it goes on by itself.
  let stopped = 0, movedAt = -1;
  t = 0;
  while (t < 3) { step({}); t += dt; if (horse.speed < 0.05 && movedAt < 0) stopped += dt; else if (movedAt < 0 && horse.speed > 0.5) movedAt = t; }
  check(blocked && Math.abs(stopped - T.wall.stop) < 0.1 && movedAt > 0 && horse.speed > 2 && after < 0 && hurts.length === 0 && shake > 0,
    `a canter into the giant wall: stopped and stumbling ${stopped.toFixed(2)} s, then on again (${horse.speed.toFixed(1)}); moved back to ${after.toFixed(1)}; ${hurts.length} hearts lost (obstacleHeartDamage ${HU.obstacleHeartDamage}); the wall shakes`);
  check(hints.length === 1 && hints[0] === DIALOGUE.hurdles.wallHint, `the hint shows once: "${hints[0]}"`);
  // Gallop + jump clears it comfortably: over a wide range of take-off spots, with room to spare.
  let ok = 0, tries = 0, minClear = Infinity;
  for (let at = -16; at <= -2; at += 1) {
    hurdles.reset();
    hurdles.hintShown = true; // (the once-only hint is checked separately)
    mountAt(w.s - 50);
    horse.speed = CONFIG.horse.maxSpeed * CONFIG.horse.gallop.speedMultiplier;
    const c0 = hurdles.stats.wallsCleared, b0 = hurdles.stats.wallBlocks;
    let jumped = false, peakOver = -Infinity;
    t = 0;
    while (t < 5 && (horse.trackS ?? 0) < w.s + 6) {
      const { along } = hurdles.frame(w, horse.position);
      const jump = !jumped && horse.grounded && along >= at;
      if (jump) jumped = true;
      step({ gallop: true, jump }); t += dt;
      const a2 = hurdles.frame(w, horse.position).along;
      if (Math.abs(a2) < T.wall.depth) peakOver = Math.max(peakOver, horse.position.y - w.base - wallH);
    }
    tries++;
    if (hurdles.stats.wallsCleared > c0 && hurdles.stats.wallBlocks === b0) { ok++; minClear = Math.min(minClear, peakOver); }
  }
  hurdles.stats.wallBlocks = 1;
  check(ok >= 8 && minClear > 0.2, `gallop + jump clears it from ${ok} of ${tries} take-off spots (16 → 2 before it), at least ${minClear.toFixed(2)} over the top`);
  // Back off a little and try again with a gallop and a power jump.
  mountAt(w.s - 60, 0);
  const pj0 = horse.powerJumps, cleared0 = hurdles.stats.wallsCleared;
  t = 0;
  while (t < 8 && (horse.trackS ?? 0) < w.s + 10) {
    const hc = hurdleControls(horse, hurdles);
    step({ jump: hc.jump, gallop: hc.gallop }); t += dt;
  }
  check(hurdles.stats.wallsCleared === cleared0 + 1 && horse.powerJumps === pj0 + 1 && hurdles.stats.wallBlocks === 1 && hints.length === 1,
    `gallop + jump: a power jump (${HU.powerJump.boost}× the hop) clears it; the hint doesn't show again`);
}

// 3) Thorn bushes slide across the trail; touching one: a slow-down and a stumble, no hearts; a jump clears it.
{
  const b = list.find((h) => h.type === 'thorns');
  const o1 = hurdles.thornOffset(b);
  for (let i = 0; i < 60; i++) hurdles.update(dt, horse);
  const o2 = hurdles.thornOffset(b);
  hurdles.reset(); hurts.length = 0;
  mountAt(b.s - 40);
  let before = 0, slowed = Infinity, t = 0;
  const hits0 = hurdles.stats.thornHits;
  while (t < 6 && (horse.trackS ?? 0) < b.s + 5) {
    const lat = hurdles.thornOffset(b); // (steer right into it)
    if (hurdles.stats.thornHits === hits0) before = horse.speed;
    step({ lat }); t += dt;
    if (hurdles.stats.thornHits > hits0) slowed = Math.min(slowed, horse.speed);
  }
  check(Math.abs(o2 - o1) > 0.1 && hurdles.stats.thornHits === hits0 + 1 && hurts.length === 0 && slowed < before * 0.8,
    `the bush slides (${o1.toFixed(2)} → ${o2.toFixed(2)}); ridden into it: no hearts lost, slowed ${before.toFixed(1)} → ${slowed.toFixed(1)} (a stumble)`);
  hurdles.reset(); hurts.length = 0;
  mountAt(b.s - 40);
  t = 0;
  while (t < 6 && (horse.trackS ?? 0) < b.s + 5) { const hc = hurdleControls(horse, hurdles); step({ lat: hurdles.thornOffset(b), jump: hc.jump }); t += dt; }
  check(hurdles.stats.thornHits === hits0 + 1 && hurts.length === 0, 'jumped: no hit');
}

// 4) Stones: a stumble for a second, no damage; a jump clears them.
{
  const st = list.find((h) => h.type === 'stones');
  hurdles.reset(); hurts.length = 0;
  mountAt(st.s - 40);
  const s0 = horse.stumbles;
  let stumbleT = 0, t = 0;
  while (t < 6 && (horse.trackS ?? 0) < st.s + 30) { step({}); if (horse.stumble > 0) stumbleT += dt; t += dt; }
  check(horse.stumbles === s0 + 1 && Math.abs(stumbleT - T.stones.stumble) < 0.05 && hurts.length === 0, `the stones: a stumble of ${stumbleT.toFixed(2)} s, no damage`);
  hurdles.reset();
  mountAt(st.s - 40);
  t = 0;
  while (t < 6 && (horse.trackS ?? 0) < st.s + 30) { const hc = hurdleControls(horse, hurdles); step({ jump: hc.jump }); t += dt; }
  check(horse.stumbles === s0 + 1, 'jumped: no stumble');
}

// 5) A full forest ride with bats about: never stuck, every hurdle cleared, and no bat comes in
// or starts an attack within batClear of a hurdle.
{
  hurdles.reset(); hurts.length = 0; minions.clear();
  horse.lastCheckpoint = 0; horse.checkpoints.forEach((c, i) => (c.reached = i === 0));
  horse.respawnAtCheckpoint(hero); horse.stamina = 1; horse.arrivedAtCave = false;
  cam.reset(); cam.snapTo(hero.position);
  const st0 = { ...hurdles.stats };
  let t = 0, best = 0, since = 0, stuck = false, spawnsNear = 0, attacksNear = 0, attacks = 0;
  const seen = new Map();
  const spawned0 = minions.stats.spawned.bat;
  while (t < 200 && !horse.arrivedAtCave) {
    const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
    if (n.s > best + 1) { best = n.s; since = 0; } else if ((since += dt) > 5) { stuck = true; break; }
    const hc = hurdleControls(horse, hurdles);
    horse.update(dt, { moveX: steer(world.safeLateral(track, n.s + 14)), moveY: 1, jumpPressed: hc.jump, gallop: hc.gallop }, cam.yaw, hero);
    hurdles.update(dt, horse);
    const before = minions.stats.spawned.bat;
    minions.update(dt, { playing: true, riding: horse.controlsHero, route: 'forest', pitDone: false, galloping: horse.galloping });
    if (minions.stats.spawned.bat > before && zoneOf(horse.trackS)) spawnsNear++;
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    minions.fitView();
    hero.iframes = 9;
    for (const m of minions.list) {
      if (m.type !== 'bat') continue;
      if (m.state === 'telegraph' && seen.get(m) !== 'telegraph') { attacks++; if (zoneOf(horse.trackS)) attacksNear++; }
      seen.set(m, m.state);
    }
    t += dt;
  }
  const st = Object.fromEntries(Object.entries(hurdles.stats).map(([k, v]) => [k, v - st0[k]]));
  check(!stuck && horse.arrivedAtCave, `a forest ride with the hurdles and bats reaches the cave in ${t.toFixed(1)} s (stuck ${stuck})`);
  check(st.wallsCleared === list.filter((h) => h.type === 'wall').length && !st.wallBlocks && !st.thornHits && !st.stoneStumbles && hurts.length === 0, `every hurdle cleared: ${JSON.stringify(st)}`);
  check(minions.stats.spawned.bat - spawned0 > 0 && attacks > 0 && spawnsNear === 0 && attacksNear === 0,
    `bats: ${minions.stats.spawned.bat - spawned0} came in and ${attacks} attacks started, none within the hurdle zones (${spawnsNear} spawns, ${attacksNear} attacks there)`);
}

console.log(failed ? 'HURDLES TEST FAILED' : 'hurdles test passed');
process.exit(failed ? 1 : 0);
