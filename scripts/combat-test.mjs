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
import { Gems } from '../src/gems.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world); await hero.init();
const horse = new Horse(scene, world); await horse.init();
const hits = [];
const combat = new Combat(scene, hero, { onHit: (e) => hits.push(e) }); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
// A simple 200 HP target on the river sand (stands in for any enemy).
const TARGET_HP = 200;
class TestTarget {
  constructor() {
    const x = -12, z = -9;
    this.position = new THREE.Vector3(x, world.heightAt(x, z), z);
    this.radius = 0.45; this.height = 1.9; this.maxHp = TARGET_HP; this.reset();
    world.cylinders.push({ x, z, r: this.radius, top: this.position.y + this.height, bottom: this.position.y - 1 });
  }
  reset() { this.hp = this.maxHp; this.alive = true; this.paralyzed = 0; this.smokeExposure = 0; }
  takeHit({ amount }) { if (!this.alive) return 0; const d = Math.min(this.hp, Math.round(amount)); this.hp -= d; if (this.hp <= 0) this.alive = false; return d; }
  paralyze(s) { this.paralyzed = s; }
  update(dt) { this.paralyzed = Math.max(0, this.paralyzed - dt); }
}
const dummy = new TestTarget();
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
  const dmg = TARGET_HP - dummy.hp;
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
  // Throw pose: wind back, swing forward, the Batarang leaves the hand at the release point.
  const TH = AB.throw;
  const notYet = !abilities.batarang && hero.throwAnim?.kind === 'throw';
  const arm = hero.model.userData.arms[1].shoulder.rotation;
  step(secs(TH.windup) - 1);
  const back = arm.x;
  const before = !abilities.batarang;
  let swing = 0;
  for (let i = 0; i < 30 && !abilities.batarang; i++) { step(1); swing = arm.x; } // the frame it leaves the hand
  step(1); swing = Math.min(swing, arm.x);
  const sp = abilities.lastSpawn;
  const body = hero.position.clone().setY(hero.position.y + 1.0);
  check(notYet && before && abilities.batarang && back > 0.6 && swing < -1, `throw pose: nothing thrown until release, arm wound back (${back.toFixed(2)}) then swung forward (${swing.toFixed(2)})`);
  check(sp && sp.name === 'batarang' && sp.position.distanceTo(sp.hand) < 0.01 && sp.position.distanceTo(body) > 0.3, `batarang spawned at the hand (${sp.position.distanceTo(body).toFixed(2)} from the body centre)`);
  let caughtAt = -1;
  for (let i = 0; i < secs(AB.batarang.maxTime + 1); i++) { step(1); if (!abilities.batarangOut) { caughtAt = i * dt; break; } }
  check(abilities.stats.batarangHits === s0.batarangHits + 1 && dummy.hp === TARGET_HP - AB.batarang.damage, `batarang hit the dummy (hp ${dummy.hp})`);
  check(caughtAt > 0 && caughtAt < AB.batarang.maxTime, `batarang came back and was caught after ${caughtAt.toFixed(2)}s`);
  check(hero.throwAnim?.kind === 'catch', 'catch pose when it comes back');
  step(secs(AB.throw.catchTime) + 1);
  check(!hero.throwAnim, 'catch pose ends');
  // Thrown at nothing (facing away over open sand).
  step(secs(AB.batarang.cooldown));
  hero.facing += Math.PI; combat.lockTarget = null; combat.removeTarget(dummy);
  abilities.use('batarang');
  let t = 0; while (abilities.batarangOut && t < AB.batarang.maxTime + 1) { step(1); t += dt; }
  check(!abilities.batarangOut && t < AB.batarang.maxTime, `batarang thrown at nothing returned after ${t.toFixed(2)}s`);
  // Thrown while moving fast (hero carried at gallop speed away from it).
  step(secs(AB.batarang.cooldown));
  abilities.use('batarang');
  t = 0;
  while (abilities.batarangOut && t < AB.batarang.maxTime + 1) {
    hero.position.x += 35 * dt; hero.prevPos.x = hero.position.x - 35 * dt; hero.moveSpeed = 35;
    abilities.update(dt); t += dt;
  }
  check(!abilities.batarangOut && t < AB.batarang.maxTime, `batarang caught while galloping after ${t.toFixed(2)}s`);
  combat.addTarget(dummy);
  check(abilities.stats.batarangCatches === abilities.stats.batarangThrows, `every batarang caught (${abilities.stats.batarangCatches}/${abilities.stats.batarangThrows})`);
}

// 4) Smoke Bomb: a target inside the cloud for 1 s is paralyzed for 10 s, then it wears off.
{
  faceDummy(5);
  check(abilities.use('smokeBomb'), 'smoke bomb thrown');
  check(!abilities.use('smokeBomb'), 'smoke bomb on cooldown');
  let parAt = -1, t = 0, maxStream = 0, glowRising = [], sparksBefore = 0, sparksAt = 0, puffColors = new Set();
  const live = (list) => list.filter((p) => p.age < p.life).length;
  while (t < 4 && parAt < 0) {
    sparksBefore = live(abilities.sparkList);
    step(1); t += dt;
    maxStream = Math.max(maxStream, live(abilities.streamList));
    const fx = abilities.fx.get(dummy);
    if (fx && dummy.smokeExposure > 0) glowRising.push(fx.level);
    for (let i = 0; i < abilities.puffs.count; i++) { const c = new THREE.Color(); abilities.puffs.getColorAt(i, c); puffColors.add(c.g > c.r && c.g > c.b ? 'green' : 'other'); }
    if (dummy.paralyzed > 0) { parAt = t; sparksAt = live(abilities.sparkList); }
  }
  const rising = glowRising.length > 10 && glowRising.every((v, i) => i === 0 || v >= glowRising[i - 1] - 1e-9) && glowRising[glowRising.length - 1] > 0.9;
  check(puffColors.has('green') && !puffColors.has('other'), 'smoke cloud is green powder (layered additive puffs)');
  check(abilities.sparkList.length >= AB.smokeBomb.sparks, `crystal sparks twinkling in the cloud (${abilities.sparkList.length})`);
  check(maxStream > 10 && rising, `inhaling: powder streams into its mouth (${maxStream} bits), green glow builds over the exposure (→ ${glowRising[glowRising.length - 1]?.toFixed(2)})`);
  check(sparksAt - sparksBefore >= AB.smokeBomb.burst.count * 0.8 && abilities.stats.bursts === 1, `burst of crystal sparks at the moment of paralysis (+${sparksAt - sparksBefore})`);
  {
    const fx = abilities.fx.get(dummy);
    const f0 = fx.ringFrac;
    step(secs(2));
    check(fx.ring.visible && f0 > 0.99 && Math.abs(fx.ringFrac - (1 - 2 / AB.smokeBomb.paralyze)) < 0.02 && fx.glow.visible, `green timer ring under it counts down (${f0.toFixed(2)} → ${fx.ringFrac.toFixed(2)} after 2 s)`);
  }
  const expect = AB.throw.release + AB.smokeBomb.flightTime + AB.smokeBomb.exposure;
  check(abilities.lastSpawn?.name === 'smokeBomb' && abilities.lastSpawn.position.distanceTo(abilities.lastSpawn.hand) < 0.01, 'smoke bomb thrown from the hand at release');
  check(parAt > 0 && Math.abs(parAt - expect) < 0.1, `paralyzed after ${parAt.toFixed(2)}s (release ${AB.throw.release} + flight ${AB.smokeBomb.flightTime} + exposure ${AB.smokeBomb.exposure})`);
  const p0 = AB.smokeBomb.paralyze; // (2 s of it already watched above)
  step(secs(AB.smokeBomb.paralyze - 2 - 0.5));
  const still = dummy.paralyzed > 0;
  let tEnd = 0;
  while (dummy.paralyzed > 0 && tEnd < 2) { step(1); tEnd += dt; }
  check(still && dummy.paralyzed === 0 && Math.abs(2 + (AB.smokeBomb.paralyze - 2 - 0.5) + tEnd - AB.smokeBomb.paralyze) < 0.05, `paralysis lasts ${AB.smokeBomb.paralyze}s then expires`);
  // The fading glow after it ends.
  const fx = abilities.fx.get(dummy);
  const glowEnd = fx.level;
  step(secs(AB.smokeBomb.glow.fade) + 2);
  check(glowEnd > 0.5 && fx.level === 0 && !fx.glow.visible && !fx.ring.visible, `glow fades softly after paralysis (${glowEnd.toFixed(2)} → ${fx.level})`);
  check(abilities.clouds.length === 0, 'smoke cloud gone after its duration');
  step(secs(AB.smokeBomb.cooldown));
  check(abilities.ready('smokeBomb'), 'smoke bomb ready after cooldown');
}

// 5) Flash Mode: the bar starts full and costs 5 pink gems + 30% of the hearts (never lethal);
// using it empties the bar, which reloads over flashReloadSeconds; full again on respawn.
// A 1 s charge-up, then the next punch takes 50% of the target's max HP.
{
  const FM = AB.flashMode;
  const lives = new Lives();
  const gems = new Gems(scene, world); gems.reset();
  abilities.lives = lives; abilities.gems = gems;
  faceDummy(1.5);
  abilities.clear();
  const blocked = [];
  abilities.onEvent = (name, why) => { if (name === 'flashBlocked') blocked.push(why); };
  check(abilities.energy === 1, 'Flash bar starts full');
  // Not enough pink gems.
  gems.counts.pink = FM.gemCost - 1;
  check(!abilities.use('flashMode') && blocked.at(-1) === 'gems', 'blocked without 5 pink gems');
  gems.counts.pink = FM.gemCost + 2;
  // Low hearts: never lethal — needs more hearts than the cost (1.5 of 5).
  const cost = lives.maxHearts * FM.flashHeartCostPct;
  for (const h of [1, 1.5]) {
    lives.setHearts(h);
    check(!abilities.use('flashMode') && blocked.at(-1) === 'health' && lives.hearts === h && abilities.flashBlockReason() === 'health', `blocked at ${h} hearts (cost ${cost}): "Not enough health", hearts unchanged`);
  }
  // Enough: pay 1.5 hearts and 5 pink gems; red flicker; bar empties.
  lives.setHearts(5);
  dummy.reset();
  const pink0 = gems.counts.pink;
  check(abilities.use('flashMode'), 'flash activated with 5 hearts and 7 pink gems');
  check(lives.hearts === 5 - cost && gems.counts.pink === pink0 - FM.gemCost && hero.redFlicker > 0 && abilities.energy === 0,
    `cost paid: hearts 5 → ${lives.hearts}, pink gems ${pink0} → ${gems.counts.pink}, red flicker, bar emptied`);
  check(!abilities.use('flashMode'), 'flash cannot be used twice');
  step(secs(FM.chargeTime * 0.5));
  const midGlow = hero.glow;
  step(secs(FM.chargeTime * 0.5) + 2);
  check(abilities.armed && midGlow > 0.3, `charged after ${FM.chargeTime}s (glow ${midGlow.toFixed(2)} mid-charge)`);
  hits.length = 0;
  step(1, { attackPressed: true }); step(secs(0.4));
  const dmg = hits[0]?.amount;
  check(dmg === TARGET_HP * FM.damageFraction && hits[0].flash && hits[0].hitStop === CB.flashHitStop && !abilities.armed,
    `flash punch dealt ${dmg} (50% of ${TARGET_HP}) with hit-stop ${hits[0]?.hitStop}`);
  // Landing hits and pink gems no longer fill the bar; it reloads only with time.
  const e0 = abilities.energy;
  for (let i = 0; i < 6; i++) { dummy.reset(); step(1, { attackPressed: true }); step(secs(0.35)); }
  const perSec = 1 / FM.flashReloadSeconds;
  const elapsed = abilities.energy - e0;
  check(elapsed < perSec * 3 + 0.01, `hits don't fill the bar (only time: +${elapsed.toFixed(3)})`);
  // Reload: still not full a moment before flashReloadSeconds, full after it.
  const usedAt = abilities.energy / perSec; // seconds since use
  step(secs(FM.flashReloadSeconds - usedAt - 1));
  const before = abilities.energy;
  gems.counts.pink += FM.gemCost * 2; // (enough gems for the checks below)
  check(before < 1 && !abilities.use('flashMode') && blocked.at(-1) === 'reload', `reloading: bar ${before.toFixed(2)} 1 s before ${FM.flashReloadSeconds} s — blocked`);
  step(secs(1.2));
  check(abilities.energy === 1 && abilities.flashReady, `bar full again after ${FM.flashReloadSeconds} s`);
  // Full on respawn.
  abilities.use('flashMode'); step(secs(2));
  const mid = abilities.energy;
  abilities.clear(); // (respawn)
  check(mid < 0.1 && abilities.energy === 1, `bar full again on respawn (${mid.toFixed(2)} → ${abilities.energy})`);
  abilities.lives = abilities.gems = null;
  abilities.onEvent = null;
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
