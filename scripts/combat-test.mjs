// Headless combat test: combo timing, Batarang return, smoke paralysis expiry, Flash damage,
// dodge invincibility, and the death → respawn → Game Over flow.
// Usage: npm run test:combat   (exits non-zero on failure)
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Lives } from '../src/lives.js';
import { TrainingDummy } from '../src/dummy.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world); await hero.init();
const horse = new Horse(scene, world); await horse.init();
const hits = [];
const combat = new Combat(scene, hero, { onHit: (e) => hits.push(e) }); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
const dummy = new TrainingDummy(scene, world); await dummy.init();
combat.addTarget(dummy);
const CB = CONFIG.combat, AB = CONFIG.abilities, dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const none = { moveX: 0, moveY: 0, jumpPressed: false };
const step = (n, inp = {}) => {
  for (let i = 0; i < n; i++) {
    const input = { ...none, ...(i === 0 ? inp : {}) };
    hero.update(dt, input, 0);
    combat.update(dt, input, {});
    abilities.update(dt);
    dummy.update(dt);
  }
};
const secs = (s) => Math.round(s / dt);
// Stand the hero `d` in front of the dummy, facing it.
const faceDummy = (d = 1.5, angle = 0) => {
  const p = dummy.position;
  const x = p.x + Math.sin(angle) * d, z = p.z + Math.cos(angle) * d;
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
  hero.facing = Math.atan2(p.x - x, p.z - z);
  combat.reset(); abilities.clear(); dummy.reset(); hits.length = 0;
  step(2);
};

// 1) Combo: punch, punch, kick — each tap within the window continues it; the third is heavy.
{
  faceDummy(1.5);
  const steps = [];
  step(1, { attackPressed: true }); steps.push(combat.step);
  step(secs(CB.combo[0].duration) + 2);
  step(1, { attackPressed: true }); steps.push(combat.step); // within 0.5 s → second hit
  step(secs(CB.combo[1].duration) + 2);
  step(secs(0.3));
  step(1, { attackPressed: true }); steps.push(combat.step); // still within the window → kick
  step(secs(CB.combo[2].duration) + 2);
  const dmg = CONFIG.dummy.hp - dummy.hp;
  const expected = CB.combo.reduce((a, s) => a + s.damage, 0);
  check(steps.join(',') === '0,1,2' && hits.length === 3, `combo steps ${steps.join(',')} with ${hits.length} hits`);
  check(dmg === expected && hits[2].heavy && !hits[0].heavy && hits[2].hitStop === CB.hitStop, `combo damage ${dmg} (expected ${expected}), third hit heavy with hit-stop ${hits[2].hitStop}`);
  // A late tap (after the window) starts over.
  step(1, { attackPressed: true }); step(secs(CB.combo[0].duration) + 2);
  step(secs(CB.comboWindow + 0.1));
  step(1, { attackPressed: true });
  check(combat.step === 0, `tap after ${CB.comboWindow + 0.1}s restarts the combo (step ${combat.step})`);
  step(secs(0.5));
  // Buffered tap during a hit chains straight into the next one.
  step(secs(1));
  step(1, { attackPressed: true }); step(3, { attackPressed: true });
  step(secs(CB.combo[0].duration));
  check(combat.step === 1, `tap during a hit is buffered (step ${combat.step})`);
  step(secs(1));
  // Out of range / behind: no hit.
  faceDummy(CB.combo[0].reach + dummy.radius + 1.5);
  step(1, { attackPressed: true }); step(secs(0.4));
  const outOfRange = hits.length === 0;
  faceDummy(1.4); hero.facing += Math.PI; combat.lockTarget = null;
  step(1, { attackPressed: true }); step(secs(0.4));
  // (soft lock turns the hero toward a locked target; with the target behind there's no lock)
  check(outOfRange && hits.length === 0, `no hit out of range or behind (hits ${hits.length})`);
}

// 2) Dodge: invincible for 0.4 s, 1 s cooldown, moves away.
{
  faceDummy(3);
  const from = hero.position.clone();
  const ok1 = hero.dodge(0, 0); // no direction → backward
  const inv = hero.invincible;
  const again = hero.dodge(1, 0);
  step(secs(CB.dodge.invincible) + 1);
  const after = hero.invincible;
  step(secs(CB.dodge.cooldown));
  const ok2 = hero.dodge(1, 0);
  step(secs(0.5));
  check(ok1 && inv && !again && !after && ok2, `dodge: rolls ${ok1}, invincible ${inv} then ${after}, blocked during cooldown ${!again}, ready after ${ok2}`);
  check(from.distanceTo(hero.position) > CB.dodge.distance * 0.6, `dodge moved ${from.distanceTo(hero.position).toFixed(1)}`);
}

// 3) Batarang: hits the target, always returns and is caught (also when it hits nothing,
// and while the hero gallops away); cooldown respected; locked until unlocked.
{
  faceDummy(6);
  check(!abilities.use('batarang'), 'batarang locked before its gems');
  ['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
  const s0 = { ...abilities.stats };
  step(2);
  check(abilities.use('batarang'), 'batarang thrown');
  check(!abilities.use('batarang'), 'no second batarang while one is out');
  let caughtAt = -1;
  for (let i = 0; i < secs(AB.batarang.maxTime + 1); i++) { step(1); if (!abilities.batarang) { caughtAt = i * dt; break; } }
  check(abilities.stats.batarangHits === s0.batarangHits + 1 && dummy.hp === CONFIG.dummy.hp - AB.batarang.damage, `batarang hit the dummy (hp ${dummy.hp})`);
  check(caughtAt > 0 && caughtAt < AB.batarang.maxTime, `batarang came back and was caught after ${caughtAt.toFixed(2)}s`);
  // Thrown at nothing (facing away over open sand).
  step(secs(AB.batarang.cooldown));
  hero.facing += Math.PI; combat.lockTarget = null; combat.removeTarget(dummy);
  abilities.use('batarang');
  let t = 0; while (abilities.batarang && t < AB.batarang.maxTime + 1) { step(1); t += dt; }
  check(!abilities.batarang && t < AB.batarang.maxTime, `batarang thrown at nothing returned after ${t.toFixed(2)}s`);
  // Thrown while moving fast (hero carried at gallop speed away from it).
  step(secs(AB.batarang.cooldown));
  abilities.use('batarang');
  t = 0;
  while (abilities.batarang && t < AB.batarang.maxTime + 1) {
    hero.position.x += 35 * dt; hero.prevPos.x = hero.position.x - 35 * dt; hero.moveSpeed = 35;
    abilities.update(dt); t += dt;
  }
  check(!abilities.batarang && t < AB.batarang.maxTime, `batarang caught while galloping after ${t.toFixed(2)}s`);
  combat.addTarget(dummy);
  check(abilities.stats.batarangCatches === abilities.stats.batarangThrows, `every batarang caught (${abilities.stats.batarangCatches}/${abilities.stats.batarangThrows})`);
}

// 4) Smoke Bomb: a target inside the cloud for 1 s is paralyzed for 10 s, then it wears off.
{
  faceDummy(5);
  check(abilities.use('smokeBomb'), 'smoke bomb thrown');
  check(!abilities.use('smokeBomb'), 'smoke bomb on cooldown');
  let parAt = -1, t = 0;
  while (t < 4 && parAt < 0) { step(1); t += dt; if (dummy.paralyzed > 0) parAt = t; }
  const expect = AB.smokeBomb.flightTime + AB.smokeBomb.exposure;
  check(parAt > 0 && Math.abs(parAt - expect) < 0.1, `paralyzed after ${parAt.toFixed(2)}s (flight ${AB.smokeBomb.flightTime} + exposure ${AB.smokeBomb.exposure})`);
  const p0 = dummy.paralyzed;
  step(secs(AB.smokeBomb.paralyze - 0.5));
  const still = dummy.paralyzed > 0;
  step(secs(1));
  check(p0 > AB.smokeBomb.paralyze - 0.1 && still && dummy.paralyzed === 0, `paralysis lasts ${AB.smokeBomb.paralyze}s then expires (now ${dummy.paralyzed})`);
  check(abilities.clouds.length === 0, 'smoke cloud gone after its duration');
  step(secs(AB.smokeBomb.cooldown));
  check(abilities.ready('smokeBomb'), 'smoke bomb ready after cooldown');
}

// 5) Flash Mode: the bar fills from hits (and pink gems); when full, a 1 s charge-up, then the
// next punch takes 50% of the target's max HP; can't be used twice or while not full.
{
  faceDummy(1.5);
  abilities.energy = 0;
  check(!abilities.use('flashMode'), 'flash unusable with an empty bar');
  let n = 0;
  while (abilities.energy < 1 && n < 40) { step(1, { attackPressed: true }); step(secs(CB.combo[0].duration) + 2); n++; if (!dummy.alive) dummy.reset(); }
  abilities.addFlashEnergy(AB.flashMode.perPinkGem);
  check(abilities.energy >= 1 && abilities.flashReady, `bar full after ${n} hit taps (+ a pink gem)`);
  step(secs(1));
  dummy.reset();
  check(abilities.use('flashMode'), 'flash activated');
  check(!abilities.use('flashMode') && abilities.energy === 0, 'flash cannot be used twice (bar emptied)');
  step(secs(AB.flashMode.chargeTime * 0.5));
  const midGlow = hero.glow;
  step(secs(AB.flashMode.chargeTime * 0.5) + 2);
  check(abilities.armed && midGlow > 0.3, `charged after ${AB.flashMode.chargeTime}s (glow ${midGlow.toFixed(2)} mid-charge)`);
  hits.length = 0;
  step(1, { attackPressed: true }); step(secs(0.4));
  const dmg = hits[0]?.amount;
  check(dmg === CONFIG.dummy.hp * AB.flashMode.damageFraction && hits[0].flash && hits[0].hitStop === CB.flashHitStop && !abilities.armed && abilities.energy < 0.2,
    `flash punch dealt ${dmg} (50% of ${CONFIG.dummy.hp}) with hit-stop ${hits[0]?.hitStop}; disarmed, bar ${abilities.energy.toFixed(2)}`);
}

// 6) Lives: 5 hearts, 3 respawns. Zero hearts → respawn on the horse at the last checkpoint with
// full hearts (gems/unlocks kept); after 3 respawns → Game Over; Retry restarts the ride.
{
  const lives = new Lives();
  horse.lastCheckpoint = 2; horse.checkpoints.forEach((c, i) => (c.reached = i <= 2));
  const unlocked = abilities.unlocked.size;
  const results = [];
  for (let life = 0; life < 4; life++) {
    for (let h = 0; h < CONFIG.lives.hearts - 1; h++) lives.damage(1);
    const died = lives.damage(1);
    const r = lives.resolveDeath();
    results.push(`${died ? 'dead' : 'alive'}→${r}`);
    if (r === 'respawn') {
      horse.respawnAtCheckpoint(hero);
      const cp = horse.checkpoints[horse.lastCheckpoint].position;
      if (!(hero.riding && horse.mode === 'riding' && lives.hearts === CONFIG.lives.hearts && Math.hypot(horse.position.x - cp.x, horse.position.z - cp.z) < 0.01)) results.push('BAD-RESPAWN');
    }
  }
  check(results.join(' ') === 'dead→respawn dead→respawn dead→respawn dead→gameover', `deaths: ${results.join(' ')}`);
  check(abilities.unlocked.size === unlocked, 'unlocks kept through respawns');
  lives.reset(); horse.restartRide(hero);
  const start = horse.checkpoints[0].position;
  check(lives.hearts === CONFIG.lives.hearts && lives.respawns === CONFIG.lives.respawns && horse.lastCheckpoint === 0 && Math.hypot(horse.position.x - start.x, horse.position.z - start.z) < 0.01 && hero.riding,
    'retry: full hearts and respawns, riding from the start of the ride');
  check(CONFIG.lives.bossResetsOnRespawn === true, 'bossResetsOnRespawn defaults to true');
}

console.log(failed ? 'COMBAT TEST FAILED' : 'combat test passed');
process.exit(failed ? 1 : 0);
