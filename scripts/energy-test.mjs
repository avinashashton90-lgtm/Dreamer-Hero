// Headless test: the horse's energy (energy.js). Drains while galloping, very slowly at a trot,
// not at a walk (it recovers); nothing in a cutscene or dismounted; at 0 no gallop, a tired walk
// (still moving), the hint once, back at recoverAt; potions (3–5 on the forest trail, never on a
// gem or a hurdle) refill 40% with a splash and a sound; grass refills only while slow (grazing
// when stopped), never at a gallop; 2 desert oases before the pit refill 60%; a bat bite drains.
// Usage: npm run test:energy   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Sound } from '../src/audio.js';
import { HorseEnergy } from '../src/energy.js';

const EN = CONFIG.energy, MAX = EN.horseEnergyMax, dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const sound = new Sound();
const horse = new Horse(scene, world, heroAssets); horse.sound = sound; await horse.init();
const gems = new Gems(scene, world); await gems.init();
const hints = [];
const energy = new HorseEnergy(scene, world, { sound, onHint: (t) => hints.push(t) });
await energy.init(gems.gems);

const mountAt = (track, s, lat = 0, speed = 0) => {
  if (horse.route !== track) horse.setRoute(track, track === world.desertTrack ? CONFIG.desert.checkpoints : CONFIG.checkpoints.fractions);
  const p = track.at(s);
  if (horse.controlsHero) { horse.mode = 'idle'; hero.riding = false; }
  horse.position.set(p.x - p.tz * lat, 0, p.z + p.tx * lat);
  horse.position.y = world.heightAt(horse.position.x, horse.position.z);
  horse.heading = Math.atan2(p.tx, p.tz); horse.trackS = s;
  horse.velocity.set(0, 0, 0); horse.mountNow(hero); horse.speed = speed; horse.stamina = 1;
};
// Ride along the current route toward lateral `lat` (gallop / stick push `push` 0..1).
const ride = (secs, { gallop = false, push = 1, lat = 0, playing = true, each } = {}) => {
  const track = horse.route;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
    const p = track.at(Math.min(track.length, n.s + 12));
    const want = Math.atan2(p.x - p.tz * lat - horse.position.x, p.z + p.tx * lat - horse.position.z);
    const moveX = THREE.MathUtils.clamp(-wrap(want - horse.heading) * 2.2, -1, 1);
    horse.update(dt, { moveX, moveY: push, jumpPressed: false, gallop }, 0, hero);
    energy.update(dt, horse, playing);
    each?.();
  }
};
const track = world.track;

// 1) Drain by gait: gallop > trot > none at a walk (it recovers).
{
  mountAt(track, 600, 0, CONFIG.horse.maxSpeed); horse.energy = 80;
  const e0 = horse.energy; ride(4, { gallop: true }); const gallopLoss = e0 - horse.energy;
  mountAt(track, 600, 0, CONFIG.horse.maxSpeed); horse.energy = 80;
  ride(4); const trotLoss = 80 - horse.energy;
  mountAt(track, 600, 0, 0); horse.energy = 50;
  let maxWalk = 0;
  ride(4, { push: 0.15, each: () => { maxWalk = Math.max(maxWalk, horse.speed); } }); const walkGain = horse.energy - 50;
  check(gallopLoss > 4 * EN.gallopDrain * 0.6 && trotLoss > 0 && trotLoss < gallopLoss / 4 && walkGain > 0 && maxWalk <= EN.walkMax,
    `galloping 4 s: −${gallopLoss.toFixed(1)}; trotting / cantering 4 s: −${trotLoss.toFixed(2)}; walking (≤ ${maxWalk.toFixed(1)}) 4 s: +${walkGain.toFixed(1)} (no drain, it recovers)`);
}

// 2) Nothing in a cutscene; dismounted it doesn't drain.
{
  mountAt(track, 600, 0, CONFIG.horse.maxSpeed); horse.energy = 60;
  ride(3, { gallop: true, playing: false });
  const inCutscene = horse.energy;
  horse.toggle(hero); for (let i = 0; i < 60; i++) { horse.update(dt, null, 0, hero); energy.update(dt, horse, true); }
  const e1 = horse.energy;
  for (let i = 0; i < 120; i++) { horse.update(dt, null, 0, hero); energy.update(dt, horse, true); }
  check(inCutscene === 60 && horse.mode === 'idle' && horse.energy >= e1, `in a cutscene: unchanged (${inCutscene}); dismounted: no drain (${e1.toFixed(1)} → ${horse.energy.toFixed(1)})`);
}

// 3) Out of energy: no gallop, a tired walk (still moving), the hint once; back at recoverAt.
{
  hints.length = 0; energy.reset();
  mountAt(track, 600, 0, CONFIG.horse.maxSpeed * 1.5); horse.energy = 2; horse.galloping = true;
  let tiredAt = -1, t = 0, maxTiredSpeed = 0, galloped = false, minTired = Infinity;
  // Gallop held until tired, then still held for 4 s (ignored: a tired walk).
  ride(4.6, { gallop: true, each: () => {
    t += dt;
    if (horse.energyTired && tiredAt < 0) tiredAt = t;
    if (horse.energyTired && t > tiredAt + 3) { maxTiredSpeed = Math.max(maxTiredSpeed, horse.speed); minTired = Math.min(minTired, horse.speed); if (horse.galloping) galloped = true; }
  } });
  check(tiredAt > 0 && !galloped && maxTiredSpeed <= EN.tiredSpeed + 0.01 && minTired > 1 && hints.length === 1 && hints[0] === DIALOGUE.energy.tired,
    `at 0 (after ${tiredAt.toFixed(2)} s): no gallop, a tired walk (${minTired.toFixed(1)}–${maxTiredSpeed.toFixed(1)} ≤ ${EN.tiredSpeed}), still moving; the hint "${hints[0]}"`);
  // Walking on (no gallop) it recovers; then it gallops again.
  let tRec = 0;
  while (horse.energyTired && tRec < 30) { ride(0.1, { push: 0.2 }); tRec += 0.1; }
  const recovered = !horse.energyTired && horse.energy >= EN.recoverAt * MAX - 1;
  ride(1, { gallop: true });
  check(recovered && horse.galloping, `walking on, it recovers at ${EN.recoverAt * 100}% after ${tRec.toFixed(1)} s: it gallops again`);
  horse.energy = 0.5; ride(1, { gallop: true });
  check(horse.energyTired && hints.length === 1, 'tired again: the hint does not show twice');
}

// 4) Potions: 3–5 on the forest trail, never on a gem or a hurdle; riding through one refills 40%.
{
  const P = EN.potions, ps = energy.potions;
  const groundGems = gems.gems.filter((g) => g.zone === 'forest' && g.kind !== 'air');
  const onGem = ps.filter((p) => groundGems.some((g) => Math.abs(g.s - p.s) < P.gemClear)).length;
  const nearHurdle = ps.filter((p) => world.hurdles.some((h) => Math.abs(h.s - p.s) < P.hurdleClear)).length;
  const inWall = ps.filter((p) => world.gapWalls.some((w) => Math.abs(w.s - p.s) < P.wallClear)).length;
  const onTrail = ps.every((p) => Math.abs(p.lateral) <= CONFIG.gems.laneMax);
  check(ps.length >= 3 && ps.length <= 5 && onTrail && !onGem && !nearHurdle && !inWall, `${ps.length} potions (${ps.map((p) => p.s.toFixed(0)).join(', ')}) on the trail; on a gem ${onGem}, near a hurdle ${nearHurdle}, in a wall ${inWall}`);
  energy.reset();
  const p = ps[0];
  mountAt(track, p.s - 25, p.lateral, CONFIG.horse.maxSpeed); horse.energy = 20; horse.energyTired = false;
  const sounds0 = sound.counts.potion ?? 0;
  let splash = 0, gained = 0;
  ride(2.2, { lat: p.lateral, each: () => { splash = Math.max(splash, energy.drops.length); } });
  gained = horse.energy - 20;
  check(p.taken && !p.model.visible && gained > P.refill * MAX - 2 && (sound.counts.potion ?? 0) === sounds0 + 1 && splash > 0, `ridden through: +${gained.toFixed(1)} (${P.refill * 100}%), a splash (${splash} drops), the "potion" sound`);
  energy.reset({ newGame: false });
  check(!p.taken && p.model.visible, 'a respawn brings the potions back');
}

// 5) Grass: slowly over it the horse eats (grazing when stopped); galloping over it gives nothing.
{
  const G = EN.grass, g = energy.grass[0];
  check(energy.grass.length >= 2 && energy.grass.every((x) => Math.abs(x.lateral) + G.radius <= CONFIG.track.wall.offset + 0.5), `${energy.grass.length} grass patches beside the trail line, reachable`);
  mountAt(track, g.s, g.lateral, 0); horse.energy = 40;
  let ate = false;
  ride(2, { push: 0, lat: g.lateral, each: () => { if (horse.eating) ate = true; } });
  const standGain = horse.energy - 40;
  mountAt(track, g.s - 3, g.lateral, 3); horse.energy = 40;
  ride(1, { push: 0.2, lat: g.lateral });
  const walkGain = horse.energy - 40;
  mountAt(track, g.s - 8, g.lateral, CONFIG.horse.maxSpeed * 2); horse.energy = 40;
  ride(0.5, { gallop: true, lat: g.lateral });
  const gallopGain = horse.energy - 40;
  check(standGain > G.rate * 2 * 0.9 && ate && walkGain > G.rate * 0.5 && gallopGain < 0, `standing on it: +${standGain.toFixed(1)} in 2 s, grazing; walking over it +${walkGain.toFixed(1)} in 1 s; galloping over it ${gallopGain.toFixed(1)} (nothing)`);
}

// 6) Desert oases: 2, before the Lazarus Pit (off the chase and the sandstorm), refill 60%.
{
  const O = EN.oases, os = energy.oases, dt2 = world.desertTrack;
  const pitS = dt2.length * CONFIG.desert.pit.at;
  check(os.length === 2 && os.every((o) => o.s < pitS - 50) && os.every((o) => Math.abs(o.lateral) + O.radius <= CONFIG.track.wall.offset), `2 oases (${os.map((o) => o.s.toFixed(0)).join(', ')}) before the pit (${pitS.toFixed(0)}: no chase, no sandstorm), the pond within the trail`);
  // Its palms stand outside the trail (beyond the side walls), the pond on it.
  const palmsOut = os.every((o) => o.model.children.slice(2).every((palm) => {
    const w = palm.getWorldPosition(new THREE.Vector3());
    const n = dt2.nearest(w.x, w.z, 30);
    return n && Math.abs(n.lateral) > CONFIG.track.wall.offset && Math.sign(n.lateral) === Math.sign(o.lateral);
  }));
  check(palmsOut, 'the palms stand beside the trail (outside its side walls, on the pond side)');
  const o = os[0];
  mountAt(dt2, o.s - 20, o.lateral, CONFIG.horse.maxSpeed * 0.6); horse.energy = 10;
  const s0 = sound.counts.oasisSplash ?? 0, sip0 = sound.counts.horse_sip ?? 0;
  // Riding in: it drinks — a slow walk (still steering), head down, sipping, the energy back gradually.
  let drinkT = 0, maxV = 0, half = null, after = 0;
  ride(6, { lat: o.lateral, each: () => {
    if (horse.drinking) {
      drinkT += dt;
      maxV = Math.max(maxV, horse.speed);
      if (half === null && drinkT >= EN.oasisDrinkTime / 2) half = horse.energy;
    } else if (drinkT > 0) after = Math.max(after, horse.speed);
  } });
  const gained = horse.energy - 10;
  check(Math.abs(drinkT - EN.oasisDrinkTime) < 0.1 && maxV <= EN.oasisDrinkSpeed + 0.01 && after > EN.oasisDrinkSpeed * 2,
    `riding into the pond it drinks ${drinkT.toFixed(2)} s (oasisDrinkTime ${EN.oasisDrinkTime}) at a walk (≤ ${maxV.toFixed(2)}), head down, then speeds up again (${after.toFixed(1)})`);
  check(half > 10 + O.refill * MAX * 0.3 && half < 10 + O.refill * MAX * 0.7 && gained >= O.refill * MAX - 1 && gained <= O.refill * MAX + EN.regenRate * 6 && // (+ the walk's own slow recovery) (sound.counts.oasisSplash ?? 0) === s0 + 1 && (sound.counts.horse_sip ?? 0) >= sip0 + 2 && energy.stats.oases === 1,
    `the energy refills gradually (half way ${half?.toFixed(0)}, then ${horse.energy.toFixed(0)}: +${O.refill * 100}%), once, a splash and ${(sound.counts.horse_sip ?? 0) - sip0} sips`);
  // A gallop leaves early.
  mountAt(dt2, os[1].s - 20, os[1].lateral, CONFIG.horse.maxSpeed * 0.6); horse.energy = 60;
  let started = false, left = false;
  ride(4, { lat: os[1].lateral, gallop: true, each: () => { if (horse.drinking) started = true; } });
  left = !horse.drinking;
  check(left && !energy.drinking, `a gallop through the pond doesn't stop to drink (drank: ${started})`);
  horse.setRoute(world.track, CONFIG.checkpoints.fractions);
}

// 7) A bat bite drains the horse (minions call horse.drainEnergy); a respawn rests it.
{
  horse.energy = 50; horse.drainEnergy(CONFIG.minions.bats.horseEnergy);
  const bitten = horse.energy;
  horse.lastCheckpoint = 0; horse.respawnAtCheckpoint(hero);
  check(bitten === 50 - CONFIG.minions.bats.horseEnergy && horse.energy === MAX && !horse.energyTired, `a bite: 50 → ${bitten}; a respawn: full (${horse.energy})`);
}

console.log(failed ? 'ENERGY TEST FAILED' : 'energy test passed');
process.exit(failed ? 1 : 0);
