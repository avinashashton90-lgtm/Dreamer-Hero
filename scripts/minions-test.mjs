// Headless minion test: the Quaternius bat / skeleton / slime models (clip mapping, lazy loading),
// forest bats (caps, intervals, time windows, cave zone, checkpoint quiet time, bites, Gallop
// outruns them, the Batarang hits them from the saddle), damage and HP, the per-enemy hit
// cooldown, gem drops, Flash kills, Smoke paralysis (coughing and swaying), the boss's slam
// slimes (crack spawns, cap, arena bounds, fire immunity, hop away, gone with the boss), desert
// skeletons (none before the Lazarus Pit, caps, castle zone, gallop knock, hits), respawn
// clearing everything, and the boss fight still won with slimes about.
// Usage: npm run test:minions   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs'; // the real models, read from public/
import * as THREE from 'three';
import { CONFIG, abilityGemCost } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Lives } from '../src/lives.js';
import { Gems } from '../src/gems.js';
import { Boss, BOSS_STATES as S } from '../src/boss.js';
import { Minions } from '../src/minions.js';
import { FollowCamera } from '../src/camera.js';
import { loadedMinionTypes } from '../src/minionModels.js';
import { PROFILES, makeFight } from './boss-bot.mjs';

const MN = CONFIG.minions, BT = MN.bats, SL = MN.slimes, SK = MN.skeletons, CV = CONFIG.cave, BC = CONFIG.boss, dt = 1 / 60;
const [cx, cz] = CV.center;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const secs = (s) => Math.round(s / dt);

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const horse = new Horse(scene, world, heroAssets); await horse.init();
const log = [];
const combat = new Combat(scene, hero, { onHit: (e) => log.push(e) }); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
const lives = new Lives();
const gems = new Gems(scene, world); await gems.init();
const boss = new Boss(scene, world, {}, heroAssets); await boss.init();
combat.addTarget(boss);
// Seeded randomness for the spawns.
let seed = 12345;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const damage = []; // hits on the hero { t, n, source, from }
let clock = 0;
const onHitHero = (n, x, z, o = {}) => {
  if (hero.invincible) return false;
  hero.hurt(x, z, o.knockback !== false, o.source !== 'fire');
  lives.damage(n);
  damage.push({ t: clock, n, source: o.source });
  if (lives.hearts < 1.5) lives.setHearts(lives.maxHearts); // (keep riding: hits are counted)
  return true;
};
// The follow camera, as in the game (bats are kept inside its view; a phone's 20:9 landscape).
const cam = new FollowCamera(915 / 412, world);
const screeches = [];
const minions = new Minions(scene, world, { hero, horse, combat, abilities, gems, camera: cam.camera, onHitHero, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder, random,
  onEvent: (name, m) => { if (name === 'batScreech') screeches.push({ t: clock, m }); } });
abilities.camera = cam.camera;
let pitDone = false, playing = true;
const ctx = () => ({ playing, riding: horse.controlsHero, route: horse.route === world.desertTrack ? 'desert' : 'forest', pitDone, galloping: horse.galloping });
// Real game loop order (main.js), plus a riding bot.
const tApex = CONFIG.horse.hopVelocity / CONFIG.horse.gravity;
const shouldJump = () => {
  if (!horse.grounded) return false;
  for (const o of world.obstacles) {
    const rx = horse.position.x - o.cx, rz = horse.position.z - o.cz;
    const along = rx * o.dx + rz * o.dz, across = rx * o.nx + rz * o.nz;
    const lead = Math.max(1.2, horse.speed * tApex);
    if (Math.abs(across) < o.halfLength && along < 0 && -along < lead + 0.5 && -along > 0.5) return true;
  }
  return false;
};
const rideInput = ({ gallop = false, stop = false } = {}) => {
  const track = horse.route;
  const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
  const s = Math.min(track.length, n.s + 14);
  const lat = world.safeLateral(track, s);
  const p = track.at(s);
  const want = Math.atan2(p.x - p.tz * lat - horse.position.x, p.z + p.tx * lat - horse.position.z);
  return { moveX: THREE.MathUtils.clamp(-wrap(want - horse.heading) * 2.2, -1, 1), moveY: stop ? -1 : 1, jumpPressed: !stop && shouldJump(), gallop, attackPressed: false };
};
const step = (n = 1, { ride = null, input = {}, each = null } = {}) => {
  for (let i = 0; i < n; i++) {
    const inp = { moveX: 0, moveY: 0, jumpPressed: false, ...(i === 0 ? input : {}), ...(ride ? rideInput(ride) : {}) };
    if (!horse.controlsHero) hero.update(dt, inp, 0);
    horse.update(dt, horse.controlsHero ? inp : null, 0, hero);
    combat.update(dt, inp, { mounted: horse.controlsHero });
    abilities.update(dt);
    boss.update(dt, hero);
    minions.update(dt, ctx());
    gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    minions.fitView();
    clock += dt;
    if (each?.() === false) break;
  }
};
horse.onCheckpoint = () => minions.onCheckpoint();
const placeHero = (x, z, face = 0) => {
  if (horse.controlsHero || hero.riding) { horse.mode = 'idle'; hero.riding = false; }
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
  hero.facing = face; hero.iframes = 0; hero.hurtT = 0;
};
const mountAt = (track, s) => {
  if (horse.route !== track) horse.setRoute(track, track === world.desertTrack ? CONFIG.desert.checkpoints : CONFIG.checkpoints.fractions);
  const p = track.at(s);
  horse.position.set(p.x, world.heightAt(p.x, p.z), p.z);
  horse.heading = Math.atan2(p.tx, p.tz);
  horse.trackS = s;
  horse.velocity.set(0, 0, 0);
  hero.riding = false;
  horse.mountNow(hero);
  horse.stamina = 1;
};
const alive = (type) => minions.list.filter((m) => m.alive && (!type || m.type === type));
const reset = () => { minions.clear(); lives.reset(); abilities.clear(); combat.reset(); damage.length = 0; };

// 0) Lazy loading and the clip map: nothing loads until the first of a type spawns.
check(loadedMinionTypes().length === 0, 'no minion model loaded before the first spawn');
const maps = {};
for (const t of ['bat', 'skeleton', 'slime']) {
  const tpl = await minions.ready(t);
  maps[t] = tpl;
  const roles = ['idle', 'move', 'attack', 'hit', 'death', 'spawn'];
  check((tpl.kind === 'fbx' || heroAssets.placeholder) && (tpl.kind !== 'fbx' || roles.every((r) => tpl.mapping[r])),
    `${t}: ${tpl.kind}${tpl.kind === 'fbx' ? `, clips [${tpl.clipNames.map((n) => n.split('|').pop()).join(', ')}] → ${roles.map((r) => `${r}: ${tpl.mapping[r]}`).join(', ')}` : ''}`);
}

// 1) Forest bats on a real ride from the horse's spot to the cave: swarms of 1–3 every 20–30 s
// of riding, never more than 3 at once, none within 120 of the cave, none in the first 5 s
// after a checkpoint; each bite half a heart.
{
  reset();
  // (the lazy-load check proper: a fresh director has its first bat wait on the model)
  horse.lastCheckpoint = 0; horse.checkpoints.forEach((c, i) => (c.reached = i === 0));
  horse.respawnAtCheckpoint(hero);
  minions.resetTimers();
  const checkpoints = [];
  horse.onCheckpoint = () => { minions.onCheckpoint(); checkpoints.push(clock); };
  const seen = new Set();
  const swarms = [];
  let maxBats = 0, badZone = 0, nearCheckpoint = 0;
  const [ax, az] = CV.archPosition;
  let t = 0;
  while (t < 200 && !horse.arrivedAtCave) {
    step(1, { ride: {} });
    t += dt;
    maxBats = Math.max(maxBats, alive('bat').length);
    const fresh = minions.list.filter((m) => m.type === 'bat' && !seen.has(m));
    if (fresh.length) {
      fresh.forEach((m) => seen.add(m));
      swarms.push({ ride: minions.rideTime, n: fresh.length });
      if (Math.hypot(horse.position.x - ax, horse.position.z - az) < BT.caveClear || fresh.some((m) => Math.hypot(m.position.x - ax, m.position.z - az) < BT.caveClear)) badZone++;
      if (checkpoints.some((c) => clock - c < BT.checkpointQuiet - 1e-6)) nearCheckpoint++;
    }
    if (Math.hypot(horse.position.x - ax, horse.position.z - az) < BT.caveClear) {
      // ride on into the arena: nothing more may appear
    }
  }
  const gaps = swarms.slice(1).map((s, i) => s.ride - swarms[i].ride);
  const bites = damage.filter((d) => d.source === 'bat');
  check(swarms.length >= 3 && swarms.every((s) => s.n >= 1 && s.n <= 3) && gaps.every((g) => g >= BT.interval[0] - 0.05), `bats: ${swarms.length} swarms (${swarms.map((s) => s.n).join(', ')}) at ride times ${swarms.map((s) => s.ride.toFixed(0)).join(', ')} s (gaps ≥ ${BT.interval[0]} s)`);
  check(maxBats <= BT.max, `never more than ${BT.max} bats at once (max ${maxBats})`);
  check(badZone === 0 && nearCheckpoint === 0, `none within ${BT.caveClear} of the cave (${badZone}), none in the ${BT.checkpointQuiet} s after a checkpoint (${nearCheckpoint}; ${checkpoints.length} checkpoints)`);
  check(bites.length > 0 && bites.every((d) => d.n === MN.touchDamageHearts), `bites on the rider: ${bites.length}, half a heart each; the horse has no energy system (energy drained ${minions.stats.horseEnergy})`);
  check(horse.arrivedAtCave, `the ride reached the cave (${t.toFixed(0)} s)`);
  horse.onCheckpoint = () => minions.onCheckpoint();
}

// 1b) Time windows (scheduleBats): outside them no bats; and nothing spawns outside play.
{
  reset();
  minions.scheduleBats([{ start: 1e6, end: 2e6 }]);
  mountAt(world.track, 200);
  step(secs(70), { ride: {} });
  const outside = minions.stats.spawned.bat;
  minions.scheduleBats(); // anytime again
  const s0 = minions.stats.spawned.bat;
  minions.clear(); mountAt(world.track, 200); playing = false;
  step(secs(70), { ride: {} });
  playing = true;
  const notPlaying = minions.stats.spawned.bat - s0;
  check(outside === minions.stats.spawned.bat - notPlaying && minions.rideTime >= 0 && notPlaying === 0, `scheduleBats([1e6…2e6]): no bats in 70 s of riding; none while not playing (cutscenes) either (${notPlaying})`);
}

// 1c) Fair bats: they wait in view, only the nearest attacks, never two within 2 s; each
// attack is telegraphed (circling overhead 1.2 s, a screech, the red marker), then one dive at
// batDiveSpeed (60% of the gallop), one bite, and it flees. No bat leaves the camera view while
// coming in, waiting or attacking — at a gallop too.
{
  reset();
  screeches.length = 0;
  mountAt(world.track, 120);
  cam.reset(); cam.snapTo(hero.position);
  step(secs(0.5), { ride: {} });
  for (let i = 0; i < 3; i++) await minions.debugBat();
  const seq = new Map(); // bat → states in order
  const dives = [];
  let telegraphMarker = true, outOfView = 0, viewFrames = 0, maxAtOnce = 0, nonNearest = 0;
  const bitesBy = new Map();
  let t = 0;
  for (const gallop of [false, true]) {
    t = 0;
    if (gallop) { for (let i = 0; i < 3; i++) await minions.debugBat(); horse.stamina = 1; }
    while (t < 14) {
      const before = new Map(alive('bat').map((m) => [m, m.state]));
      const bites0 = minions.stats.bites;
      step(1, { ride: { gallop } });
      t += dt;
      maxAtOnce = Math.max(maxAtOnce, alive('bat').length);
      for (const m of alive('bat')) {
        const list = seq.get(m) ?? []; if (list.at(-1) !== m.state) list.push(m.state); seq.set(m, list);
        if (['approach', 'hold', 'telegraph', 'dive'].includes(m.state) && m.stateTime > 0.05) { viewFrames++; if (!minions.inView(m)) outOfView++; }
        if (m.state === 'telegraph' && !m.marker.visible) telegraphMarker = false;
        if (m.state === 'telegraph' && before.get(m) === 'hold') {
          // it was the nearest waiting bat
          const holding = [...before].filter(([b, st]) => st === 'hold' && b !== m);
          if (holding.some(([b]) => b.position.distanceTo(hero.position) < m.position.distanceTo(hero.position) - 0.5)) nonNearest++;
        }
        if (m.state === 'dive' && before.get(m) === 'telegraph') dives.push({ t: clock, m, telegraphed: (seq.get(m) ?? []).includes('telegraph') });
      }
      if (minions.stats.bites > bites0) for (const [m, st] of before) if (st === 'dive' && (m.state === 'flee' || !m.alive || m.removed)) bitesBy.set(m, (bitesBy.get(m) ?? 0) + 1);
    }
  }
  const gaps = dives.slice(1).map((d, i) => d.t - dives[i].t);
  const flowOk = [...seq.values()].filter((l) => l.includes('dive')).every((l) => l.indexOf('telegraph') >= 0 && l.indexOf('telegraph') < l.indexOf('dive') && l.indexOf('dive') < (l.indexOf('flee') < 0 ? Infinity : l.indexOf('flee')) && l.lastIndexOf('dive') === l.indexOf('dive'));
  check(dives.length >= 3 && gaps.every((g) => g >= BT.attackGap - 1e-6) && nonNearest === 0 && maxAtOnce <= BT.max, `attacks: ${dives.length}, ≥ ${BT.attackGap} s apart (gaps ${gaps.map((g) => g.toFixed(1)).join(', ')}), only the nearest waiting bat attacks, ≤ ${BT.max} at once (max ${maxAtOnce})`);
  check(flowOk && telegraphMarker && screeches.length >= dives.length && [...bitesBy.values()].every((n) => n <= 1),
    `each attack: circles overhead ${BT.telegraph} s with a screech and the red marker, dives once (${BT.batDiveSpeed} = ${Math.round((BT.batDiveSpeed / (CONFIG.horse.maxSpeed * CONFIG.horse.gallop.speedMultiplier)) * 100)}% of the gallop), at most one bite, then flees`);
  check(outOfView === 0 && viewFrames > 500, `no bat out of the camera view while coming in, waiting or attacking (${outOfView} of ${viewFrames} bat-frames), at a canter and at a gallop`);
  const tpl = await minions.ready('bat');
  if (tpl.kind === 'fbx') {
    const b = await minions.spawnAt('bat', { x: hero.position.x, z: hero.position.z + 30 });
    let span = 0;
    for (let k = 0; k < secs(1); k++) {
      step(1, { ride: { stop: true } });
      b.dizzy.visible = false; b.marker.visible = false;
      b.u.body.updateMatrixWorld(true);
      span = Math.max(span, new THREE.Box3().setFromObject(b.u.body, true).getSize(new THREE.Vector3()).x);
    }
    check(Math.abs(span - MN.types.bat.fit[1]) < 0.2, `bat wingspan ${span.toFixed(2)} (60% of the first 1.5)`);
  }
}

// 1d) The Batarang from the saddle: auto-aims at the nearest bat (a bracket shows which while it's
// ready), homes in, kills it (8 against a bat's 8 HP), always comes back; a galloping bot that
// taps it whenever a bracket shows kills at least 70% of the bats.
{
  reset();
  mountAt(world.track, 120);
  cam.reset(); cam.snapTo(hero.position);
  const gemsBack = { ...gems.counts };
  abilities.gems = gems; gems.counts.yellow = 500;
  step(secs(0.3), { ride: {} });
  await minions.debugBat();
  let bracketOn = false;
  for (let k = 0; k < secs(3) && alive('bat')[0]?.state !== 'hold'; k++) step(1, { ride: {}, each: () => { if (abilities.bracket.visible && abilities.aimTarget) bracketOn = true; } });
  const bat = alive('bat')[0];
  const hp0 = bat.hp;
  const y0 = gems.counts.yellow;
  check(bracketOn && abilities.aimTarget === bat && abilities.use('batarang') && gems.counts.yellow === y0 - abilityGemCost('batarang'), `a bracket marks the nearest bat while the Batarang is ready; a tap throws it (${abilityGemCost('batarang')} yellow)`);
  let killedAt = -1, back = -1, tt = 0, maxD = 0;
  const trailSeen = { n: 0 };
  while (tt < 4) {
    step(1, { ride: {} }); tt += dt;
    if (abilities.batarang) { maxD = Math.max(maxD, abilities.batarang.pos.distanceTo(hero.handPosition())); trailSeen.n = Math.max(trailSeen.n, abilities.trailMesh.count); }
    if (!bat.alive && killedAt < 0) killedAt = tt;
    if (!abilities.batarangOut && back < 0 && tt > 0.3) back = tt;
  }
  check(killedAt > 0 && hp0 === 8 && back > 0 && trailSeen.n > 5 && maxD <= CONFIG.abilities.batarang.mounted.maxRange + 1, `it homes in and kills the bat (${killedAt.toFixed(2)} s; 8 HP, Batarang 8), leaves a trail (${trailSeen.n}), comes back on a curve and is caught (${back.toFixed(2)} s, never beyond ${maxD.toFixed(1)} of the rider)`);
  // No bat: straight ahead along the heading and back.
  abilities.cooldowns.batarang = 0;
  step(secs(2), { ride: {} });
  const hd = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  abilities.use('batarang');
  step(secs(0.45), { ride: {} });
  const v = abilities.batarang ? abilities.batarang.pos.clone().sub(hero.handPosition()).setY(0).normalize() : null;
  let back2 = -1; tt = 0;
  while (tt < 4) { step(1, { ride: {} }); tt += dt; if (!abilities.batarangOut) { back2 = tt; break; } }
  check(v && v.dot(hd) > 0.9 && back2 > 0, `no bat about: it flies straight ahead along the heading and comes back (${back2.toFixed(2)} s)`);
  // The galloping bot (swarms coming every 4–6 s for the test).
  const iv = BT.interval, gr = BT.group;
  BT.interval = [4, 6]; BT.group = [1, 2];
  minions.clear();
  mountAt(world.track, 100);
  horse.stamina = 1;
  const killed = new Set();
  const throws0 = abilities.stats.batarangThrows, catches0 = abilities.stats.batarangCatches;
  const spawned0 = minions.stats.spawned.bat;
  let longest = 0, flight = 0, lastThrows = abilities.stats.batarangThrows, offScreen = 0, offLongest = 0;
  const drops0 = minions.stats.drops;
  const onScreen = (p) => { const v = p.clone().project(cam.camera); return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; };
  const logLen = log.length;
  step(secs(60), { ride: { gallop: true }, each: () => {
    if (horse.stamina < 0.05) horse.stamina = 1; // (galloping the whole minute)
    if (abilities.aimTarget && abilities.ready('batarang')) abilities.use('batarang');
    if (abilities.stats.batarangThrows !== lastThrows) { lastThrows = abilities.stats.batarangThrows; flight = 0; }
    flight = abilities.batarangOut ? flight + dt : 0;
    longest = Math.max(longest, flight);
    offScreen = abilities.batarang && !onScreen(abilities.batarang.pos) ? offScreen + dt : 0;
    offLongest = Math.max(offLongest, offScreen);
    for (const e of log.slice(logLen)) if (e.source === 'batarang' && e.target.type === 'bat' && !e.target.alive) killed.add(e.target);
  } });
  step(secs(4), { ride: {} });
  for (const e of log.slice(logLen)) if (e.source === 'batarang' && e.target.type === 'bat' && !e.target.alive) killed.add(e.target);
  const spawned = minions.stats.spawned.bat - spawned0 - alive('bat').length; // (the ones still about at the end don't count)
  BT.interval = iv; BT.group = gr;
  const throws = abilities.stats.batarangThrows - throws0, catches = abilities.stats.batarangCatches - catches0;
  check(spawned >= 8 && killed.size / spawned >= 0.7, `galloping bot with the Batarang: killed ${killed.size} of ${spawned} bats (${Math.round((killed.size / spawned) * 100)}%, needs 70%)`);
  check(throws > 0 && throws === catches && longest < CONFIG.abilities.batarang.maxTime && offLongest < 0.5, `the Batarang always came back: ${catches}/${throws} caught, longest flight ${longest.toFixed(2)} s, never off screen for more than ${offLongest.toFixed(2)} s`);
  check(minions.stats.drops - drops0 === killed.size, `every bat killed dropped one gem (${minions.stats.drops - drops0})`);
  abilities.gems = null; Object.assign(gems.counts, gemsBack);
}

// 1e) Bites on the mounted hero: 20 in a row — he stays visible and in the saddle, only a small
// flinch and a red flash (no hit clip, no knockback), a soft blink that always ends visible.
{
  reset();
  mountAt(world.track, 300);
  const seatGap = () => hero.position.distanceTo(hero.model.position);
  let hidden = 0, offSaddle = 0, minOpacity = 1, flinched = 0, hitClip = 0, landed = 0;
  for (let i = 0; i < 20; i++) {
    const b = await minions.debugBat();
    b.state = 'dive'; b.stateTime = 0;
    b.position.copy(hero.position).setY(hero.position.y + 1.2);
    const h0 = lives.hearts;
    step(1, { ride: { stop: true } });
    if (lives.hearts < h0 || damage.at(-1)?.t >= clock - dt * 1.5) landed++;
    for (let k = 0; k < secs(1.15); k++) {
      step(1, { ride: { stop: true } });
      if (!hero.model.visible) hidden++;
      if (!hero.riding || horse.mode !== 'riding' || seatGap() > 1e-6) offSaddle++;
      if (hero.riderFlinch > 0) flinched++;
      if (hero.model.userData.animator?.primary === 'hit') hitClip++;
      for (const m of hero.model.userData.mats) minOpacity = Math.min(minOpacity, m.opacity);
    }
    minions.clear();
  }
  const mats = hero.model.userData.mats;
  const restored = mats.every((m) => m.opacity === 1 && !m.transparent) && hero.iframes === 0 && hero.hurtT === 0 && hero.model.visible;
  check(landed === 20 && hidden === 0 && offSaddle === 0 && hitClip === 0 && flinched > 0, `20 bites on the mounted hero: all landed (${landed}), never hidden (${hidden} frames), never off the saddle (${offSaddle}), a flinch but no hit clip (${hitClip})`);
  check(minOpacity < 0.8 && minOpacity > 0.3 && restored, `a soft blink while invincible (opacity down to ${minOpacity.toFixed(2)}), then fully back: opacity 1, invincibility and blink over, visible`);
  // Death and respawn reset it all too, even mid-blink.
  hero.hurt(0, 0, false); hero.resetStatus();
  hero.hurt(0, 0, false);
  horse.respawnAtCheckpoint(hero);
  check(hero.iframes === 0 && hero.hurtT === 0 && hero.model.visible && mats.every((m) => m.opacity === 1), 'a respawn mid-blink resets invincibility, blink and flash');
}


// 2) HP and the hero's damage: melee 4 per hit, Batarang 6, Flash kills; bat 8, skeleton 14, slime 10.
{
  reset();
  placeHero(cx - 14, cz + 8, Math.PI / 2);
  const out = [];
  for (const type of ['bat', 'skeleton', 'slime']) {
    const m = await minions.spawnAt(type, { x: cx - 10, z: cz + 8 });
    let hits = 0;
    while (m.alive && hits < 10) { combat.hitTarget(m, { amount: 10 }); hits++; }
    out.push(`${type} ${MN.types[type].hp} HP → ${hits} melee hits`);
    check(m.maxHp === MN.types[type].hp && hits === Math.ceil(MN.types[type].hp / MN.damage.melee), out.at(-1));
  }
  const s2 = await minions.spawnAt('skeleton', { x: cx - 10, z: cz + 10 });
  combat.hitTarget(s2, { amount: 1, source: 'batarang' });
  const f = await minions.spawnAt('skeleton', { x: cx - 10, z: cz + 12 });
  combat.hitTarget(f, { amount: 1, source: 'flash', flash: true });
  check(s2.hp === s2.maxHp - MN.damage.batarang && !f.alive, `Batarang ${MN.damage.batarang} (${s2.hp}/${s2.maxHp} left), the Flash bolt kills`);
}

// 3) A minion hits the hero for half a heart at most once a second (per enemy).
{
  reset();
  boss.reset();
  placeHero(cx - 8, cz + 6, Math.PI / 2);
  const slime = await minions.spawnAt('slime', { x: cx - 7, z: cz + 6 });
  slime.state = 'move';
  step(secs(6), { each: () => { hero.iframes = 0; } }); // (no post-hit invincibility: the enemy's own cooldown)
  const hits = damage.filter((d) => d.source === 'slime');
  const gaps = hits.slice(1).map((h, i) => h.t - hits[i].t);
  check(hits.length >= 3 && hits.every((h) => h.n === 0.5) && gaps.every((g) => g >= MN.hitCooldown - 1e-6), `a slime beside the hero: ${hits.length} hits in 6 s, half a heart each, ≥ ${MN.hitCooldown} s apart (gaps ${gaps.map((g) => g.toFixed(2)).join(', ')})`);
}

// 4) Defeated: the death clip, a fade, then one gem of a random colour, collected on touch.
{
  reset();
  placeHero(cx - 12, cz - 6, Math.PI / 2);
  const slime = await minions.spawnAt('slime', { x: cx - 8, z: cz - 6 });
  slime.state = 'move';
  const pos = slime.position.clone();
  while (slime.alive) combat.hitTarget(slime, { amount: 10 });
  const drops0 = minions.stats.drops;
  let fadedAt = -1, t = 0;
  const states = new Set();
  while (!slime.removed && t < 5) { step(1, { each: () => { hero.position.set(cx - 12, hero.position.y, cz - 6); } }); t += dt; states.add(slime.state); if (slime.opacity < 1 && fadedAt < 0) fadedAt = t; }
  const drop = gems.gems.filter((g) => g.zone === 'drop' && !g.hidden && !g.collected).sort((a, b) => a.position.distanceTo(slime.position) - b.position.distanceTo(slime.position))[0];
  check(states.has('dying') && states.has('fading') && fadedAt > 0 && slime.removed && minions.stats.drops === drops0 + 1 && drop && Math.hypot(drop.position.x - slime.position.x, drop.position.z - slime.position.z) < 2,
    `defeated: death clip (${slime.u.animator.duration('death').toFixed(2)} s), fade from ${fadedAt.toFixed(2)} s, then a ${drop?.color} gem where it fell`);
  const c0 = gems.counts[drop.color];
  placeHero(drop.position.x - 2, drop.position.z, Math.PI / 2);
  step(secs(0.8), { input: {}, each: () => { hero.position.x += 3 * dt; } });
  check(drop.collected && gems.counts[drop.color] === c0 + 1, `walking over it collects it (${drop.color} ${c0} → ${gems.counts[drop.color]})`);
}

// 5) Flash kills every minion within ~6 of its target; the shockwave pushes the next ones back.
{
  reset();
  boss.reset(); boss.position.set(cx, world.heightAt(cx, cz), cz); boss.state = S.RECOVER;
  placeHero(cx - 12, cz, Math.PI / 2);
  const gemsBack = { ...gems.counts };
  gems.counts.pink = 10; abilities.gems = gems;
  const near = await minions.spawnAt('skeleton', { x: cx + 3, z: cz });
  const mid = await minions.spawnAt('skeleton', { x: cx, z: cz + 7 });
  const far = await minions.spawnAt('skeleton', { x: cx - 5, z: cz - 14 });
  for (const m of [near, mid, far]) m.state = 'move';
  const midD0 = Math.hypot(mid.position.x - cx, mid.position.z - cz);
  check(abilities.use('flashMode'), 'Flash on the boss with skeletons about');
  step(secs(CONFIG.abilities.flashMode.chargeTime) + 2, { each: () => { for (const m of [near, mid, far]) if (m.alive) { m.state = 'move'; m.cooldown = 9; } if (boss.state !== S.DYING && boss.state !== S.STAGGERED) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  const midD = Math.hypot(mid.position.x - cx, mid.position.z - cz);
  check(!near.alive && mid.alive && far.alive && midD > midD0 + 0.5, `Flash: the skeleton 3 from the bolt dies, the one 7 away is pushed back (${midD0.toFixed(1)} → ${midD.toFixed(1)}), the one 14 away is untouched`);
  abilities.gems = null; Object.assign(gems.counts, gemsBack);
}

// 6) Smoke Bomb: paralyzed for 10 s like the boss — coughing and swaying, not frozen.
{
  reset();
  combat.removeTarget(boss);
  placeHero(cx - 14, cz + 2, Math.PI / 2);
  const sk = await minions.spawnAt('skeleton', { x: cx - 7, z: cz + 2 });
  sk.state = 'move'; sk.cooldown = 99;
  step(2, { each: () => { sk.position.set(cx - 7, sk.position.y, cz + 2); } });
  abilities.cooldowns.smokeBomb = 0;
  combat.lockTarget = sk;
  const thrown = abilities.use('smokeBomb');
  let smoked = false, parAt = -1, t = 0;
  const sways = [];
  while (t < 14) {
    step(1, { each: () => { if (sk.state !== 'paralyzed') sk.position.set(cx - 7, sk.position.y, cz + 2); } });
    t += dt;
    if (sk.state === 'smoked') smoked = true;
    if (sk.state === 'paralyzed' && parAt < 0) parAt = t;
    if (sk.state === 'paralyzed') sways.push(sk.u.body.rotation.z);
  }
  const range = Math.max(...sways) - Math.min(...sways);
  check(thrown && smoked && parAt > 0 && Math.abs(sways.length * dt - CONFIG.abilities.smokeBomb.paralyze) < 0.1 && range > MN.sway.angle && sk.state !== 'paralyzed',
    `Smoke Bomb on a skeleton: coughs at the cloud's touch, paralyzed ${(sways.length * dt).toFixed(1)} s (${CONFIG.abilities.smokeBomb.paralyze}), swaying ±${(range / 2).toFixed(2)} rad the whole time (not frozen), dizzy stars, then back on its feet (${sk.state})`);
  combat.addTarget(boss);
}

// 7) The boss's slams: a crack and 2 slimes (3 below 50% HP), 3 alive at most; they stay in the
// arena; its fire never hurts them; they hop away when hit; they melt when the boss dies.
{
  reset();
  boss.reset();
  boss.events.onCrack = (at) => minions.slimesFromCrack(at, boss.enraged);
  boss.events.onDefeat = () => minions.despawnSlimes();
  boss.events.onHitHero = onHitHero;
  const slam = () => {
    boss.position.set(cx, world.heightAt(cx, cz), cz); boss.facing = -Math.PI / 2;
    boss.state = S.SLAM_WINDUP; boss.stateTime = BC.slam.windup * boss.pace;
    boss.slamAt.set(cx - BC.slam.reach, world.heightAt(cx - BC.slam.reach, cz), cz);
    step(1);
  };
  placeHero(cx - 12, cz + 8, Math.PI / 2);
  slam();
  const first = alive('slime');
  const crack = boss.cracks.find((c) => c.model.visible);
  check(first.length === SL.perSlam && crack && first.every((m) => Math.hypot(m.position.x - crack.model.position.x, m.position.z - crack.model.position.z) < SL.spread + 0.5),
    `a slam opens a crack and ${first.length} slimes emerge from it`);
  step(secs(1.5));
  slam();
  check(alive('slime').length === SL.max, `the next slam adds only up to the cap (${alive('slime').length} alive, max ${SL.max})`);
  minions.clear();
  boss.hp = boss.maxHp * BC.enrageAt - 1;
  slam();
  check(alive('slime').length === SL.perSlamEnraged, `below ${BC.enrageAt * 100}% HP a slam brings ${alive('slime').length}`);
  // Inside the arena, whatever the hero does; fire passes over them harmlessly.
  let maxR = 0;
  step(secs(8), { each: () => {
    hero.position.set(cx - CV.radius - 6, hero.position.y, cz); // (lured toward the entrance)
    for (const m of alive('slime')) maxR = Math.max(maxR, Math.hypot(m.position.x - cx, m.position.z - cz) + m.radius);
    if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; }
  } });
  check(maxR <= CV.radius - SL.edge + 1e-6, `slimes stay inside the arena (furthest edge ${maxR.toFixed(2)} of radius ${CV.radius})`);
  const s0 = alive('slime')[0];
  s0.cooldown = 99;
  const hp0 = s0.hp;
  const pin = () => s0.position.set(boss.position.x - 5, s0.position.y, boss.position.z); // (5 in front of it)
  pin();
  boss.facing = -Math.PI / 2;
  boss.state = S.FIRE; boss.stateTime = 0;
  boss.fireOrigin.set(boss.position.x, boss.position.y, boss.position.z);
  boss.fireDir.set(-1, 0);
  let inCone = 0;
  step(secs(1.9), { each: () => { pin(); if (boss.inFireCone(s0.position.x, s0.position.z)) inCone++; s0.cooldown = 99; } });
  check(inCone > 30 && s0.hp === hp0, `the boss's fire washed over a slime for ${(inCone * dt).toFixed(1)} s: no damage (${s0.hp}/${s0.maxHp})`);
  // Hop away after a hit (never in the way).
  placeHero(s0.position.x - 1.6, s0.position.z, Math.PI / 2);
  s0.state = 'move';
  const d0 = Math.hypot(s0.position.x - hero.position.x, s0.position.z - hero.position.z);
  combat.hitTarget(s0, { amount: 4 });
  const st = s0.state;
  step(secs(SL.hopAway.time), { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  const d1 = Math.hypot(s0.position.x - hero.position.x, s0.position.z - hero.position.z);
  check(st === 'hopAway' && d1 > d0 + 2, `hit, it hops away (${d0.toFixed(1)} → ${d1.toFixed(1)} from the hero)`);
  // The boss dies: the slimes melt (no gems) and are gone.
  const drops0 = minions.stats.drops;
  boss.kill();
  step(secs(BC.dying.stumble + BC.dying.fall + BC.dying.fade + 3));
  check(minions.list.filter((m) => m.type === 'slime').length === 0 && minions.stats.drops === drops0, `when the boss dies its slimes melt away (no drops)`);
  boss.reset();
}

// 8) Desert skeletons: none before the Lazarus Pit scene; afterwards pairs rise from the sand
// ahead every 25–35 s (4 at most), none within 120 of the castle; galloping into one knocks it
// aside (defeated, no harm); standing still they hit for half a heart.
{
  reset();
  const track = world.desertTrack;
  pitDone = false;
  mountAt(track, 40);
  const b0 = minions.stats.spawned.skeleton + minions.stats.spawned.bat + minions.stats.spawned.slime;
  step(secs(60), { ride: {} });
  const before = minions.stats.spawned.skeleton + minions.stats.spawned.bat + minions.stats.spawned.slime - b0;
  check(before === 0, `desert before the Lazarus Pit: no enemies at all in 60 s of riding (${before})`);
  pitDone = true;
  minions.clear();
  // From the Lazarus Pit (57.5% of the trail) to the castle, as in the game.
  mountAt(track, track.length * CONFIG.desert.pit.at + CONFIG.desert.pit.ahead);
  const castle = world.castlePosition;
  const seen = new Set();
  let maxSk = 0, nearCastle = 0, pairs = [];
  let t = 0;
  while (t < 150 && horse.trackS < track.length - 5) {
    step(1, { ride: {} });
    t += dt;
    maxSk = Math.max(maxSk, alive('skeleton').length);
    const fresh = minions.list.filter((m) => m.type === 'skeleton' && !seen.has(m));
    if (fresh.length) {
      fresh.forEach((m) => seen.add(m));
      pairs.push(fresh.length);
      if (fresh.some((m) => Math.hypot(m.position.x - castle.x, m.position.z - castle.z) < SK.castleClear)) nearCastle++;
    }
  }
  check(before === 0 && pairs.length >= 1 && pairs.every((n) => n <= SK.group), `after the pit (the ${(track.length * (1 - CONFIG.desert.pit.at)).toFixed(0)} units to the castle): ${pairs.length} group(s) (${pairs.join(', ')}) rising from the sand ahead, the first ${SK.firstDelay} s after the pit`);
  check(nearCastle === 0, `none within ${SK.castleClear} of the castle (${nearCastle})`);
  // The cap, with pairs coming every 2–3 s.
  const iv = SK.interval;
  SK.interval = [2, 3];
  minions.clear();
  mountAt(track, 100);
  maxSk = 0;
  step(secs(25), { ride: { stop: true }, each: () => { hero.iframes = 9; maxSk = Math.max(maxSk, alive('skeleton').length); } });
  SK.interval = iv;
  check(maxSk === SK.max, `with pairs every 2–3 s: never more than ${SK.max} at once (max ${maxSk})`);
  // Galloping into one: defeated, knocked aside, no harm.
  minions.clear(); damage.length = 0;
  mountAt(track, 300);
  horse.speed = CONFIG.horse.maxSpeed * 2;
  const p = track.at(318);
  const sk = await minions.spawnAt('skeleton', { x: p.x, z: p.z });
  sk.state = 'move';
  step(secs(2), { ride: { gallop: true } });
  check(!sk.alive && sk.knocked && damage.length === 0 && minions.stats.knocked >= 1, `galloping into a skeleton knocks it aside and defeats it, no damage to the rider (${damage.length} hits)`);
  // Standing still: they hit.
  minions.clear(); damage.length = 0;
  mountAt(track, 320);
  const q = track.at(324);
  const sk2 = await minions.spawnAt('skeleton', { x: q.x, z: q.z });
  sk2.state = 'move';
  step(secs(4), { ride: { stop: true }, each: () => { hero.iframes = 0; } });
  const hits = damage.filter((d) => d.source === 'skeleton');
  check(hits.length >= 1 && hits.every((h) => h.n === 0.5), `standing still a skeleton hits for half a heart (${hits.length} hits in 4 s)`);
  pitDone = false;
}

// 9) A respawn clears every minion (and their smoke effects and combat targets).
{
  reset();
  boss.reset();
  placeHero(cx - 14, cz, Math.PI / 2);
  await minions.spawnAt('bat', { x: cx - 10, z: cz, y: world.heightAt(cx - 10, cz) + 2 });
  await minions.spawnAt('skeleton', { x: cx - 8, z: cz + 2 });
  minions.slimesFromCrack(new THREE.Vector3(cx - 4, 0, cz), true);
  abilities.clouds.push({ x: cx - 6, y: world.heightAt(cx - 6, cz), z: cz, age: 0, seed: 0 });
  step(secs(0.6));
  const had = minions.list.length;
  minions.clear(); // (main: lifeEvents.onRespawn, Retry, a new game, a cutscene)
  const minionTargets = combat.targets.filter((t) => t.minion).length;
  const fxLeft = [...abilities.fx.keys()].filter((t) => t.minion).length;
  check(had >= 5 && minions.list.length === 0 && minionTargets === 0 && fxLeft === 0 && Object.values(minions.reserved).every((n) => n === 0), `respawn: all ${had} minions removed (combat targets ${minionTargets}, smoke effects ${fxLeft})`);
  abilities.clear();
}

// 10) The boss fight is still winnable with its slimes about (the sim's "decent" bot).
{
  reset();
  boss.events = {};
  const fightSlimes = makeFight({ world, hero, combat, abilities, lives, boss, log, minions });
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(fightSlimes(PROFILES['decent (uses everything)'], 2000 + i * 7919));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  check(runs.every((r) => r.won) && runs.reduce((a, r) => a + r.slimes, 0) >= 5, `boss fights with slimes: won ${runs.filter((r) => r.won).length}/5 in ${runs.map((r) => fmt(r.time)).join(', ')} (slimes per fight ${runs.map((r) => r.slimes).join(', ')}, deaths ${runs.map((r) => r.deaths).join(', ')})`);
}

console.log(failed ? 'MINIONS TEST FAILED' : 'minions test passed');
process.exit(failed ? 1 : 0);
