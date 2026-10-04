// Headless boss test: every boss state, slam warning + damage, charge + boulder stun, enrage,
// Smoke paralysis, Flash damage, auto-dismount at the arena, death during the fight + respawn
// (boss reset), and the defeat (girl appears, quest moves on).
// Usage: npm run test:boss   (exits non-zero on failure)
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Lives } from '../src/lives.js';
import { Boss, BOSS_STATES as S } from '../src/boss.js';
import { Quests } from '../src/quests.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world); await hero.init();
const horse = new Horse(scene, world); await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
const lives = new Lives();
let heroHits = 0, defeated = 0, slams = 0;
const boss = new Boss(scene, world, {
  onHitHero: (n, x, z, opts = {}) => { if (hero.invincible) return; heroHits++; hero.hurt(x, z, opts.knockback !== false); lives.damage(n); },
  onSlam: () => slams++,
  onDefeat: () => defeated++,
});
await boss.init();
combat.addTarget(boss);
const BC = CONFIG.boss, CV = CONFIG.cave, dt = 1 / 60;
const [cx, cz] = CV.center;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const none = { moveX: 0, moveY: 0, jumpPressed: false };
const step = (n, inp = {}, opts = {}) => {
  for (let i = 0; i < n; i++) {
    const input = { ...none, ...(i === 0 ? inp : {}) };
    if (!hero.riding) hero.update(dt, input, 0);
    horse.update(dt, opts.ride ? opts.ride() : null, 0, hero);
    combat.update(dt, input, { mounted: hero.riding });
    abilities.update(dt);
    boss.update(dt, hero);
    if (opts.each?.() === false) break;
  }
};
const secs = (s) => Math.round(s / dt);
const placeHero = (x, z, face = 0) => {
  hero.riding = false;
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
  hero.facing = face; hero.iframes = 0; hero.hurtT = 0;
};
const freshBoss = (x, z, facing, state) => {
  boss.reset();
  boss.position.set(x, world.heightAt(x, z), z);
  boss.facing = facing;
  if (state) { boss.state = state; boss.stateTime = 0; }
};
const runUntil = (pred, maxS, opts) => { let t = 0; while (t < maxS) { step(1, {}, opts); t += dt; if (pred()) return t; } return -1; };

// 0) The arena: flat, ~40 wide, boulders round the edge, no obstacles near the cave.
{
  let mn = Infinity, mx = -Infinity;
  for (let a = 0; a < Math.PI * 2; a += 0.3) for (let r = 0; r < CV.radius - 2; r += 2) { const h = world.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  const near = world.obstacles.filter((o) => Math.hypot(o.cx - world.caveArch.x, o.cz - world.caveArch.z) < CONFIG.obstacles.caveClear).length;
  check(mx - mn < 0.5 && world.arenaRocks.length >= 14 && near === 0 && CV.radius * 2 >= 38, `arena ${CV.radius * 2} wide, height range ${(mx - mn).toFixed(2)}, ${world.arenaRocks.length} boulders (the east side is the cave mouth), obstacles within ${CONFIG.obstacles.caveClear} of the cave: ${near}`);
  check(BC.height / CONFIG.hero.height > 2.8 && CV.archRadius >= 9 * CONFIG.horse.height, `monster ${(BC.height / CONFIG.hero.height).toFixed(1)}x the hero; cave mouth ${(CV.archRadius / CONFIG.horse.height).toFixed(1)}x the horse`);
}

// 1) Riding up to the arena: the horse slows and the hero gets off within ~30; the horse waits.
{
  const p = world.track.at(world.track.length - 120);
  horse.lastCheckpoint = 0; horse.respawnAtCheckpoint(hero);
  horse.position.set(p.x, world.heightAt(p.x, p.z), p.z); horse.heading = world.track.headingAt(world.track.length - 120);
  horse.nearCave = false; horse.speed = CONFIG.horse.maxSpeed; horse.arrivedAtCave = false;
  let minDist = Infinity;
  const ride = () => {
    const n = world.track.nearest(horse.position.x, horse.position.z, 30);
    const a = world.track.at(Math.min(world.track.length, (n?.s ?? 0) + 12));
    const want = Math.atan2(a.x - horse.position.x, a.z - horse.position.z);
    return { moveX: THREE.MathUtils.clamp(-Math.atan2(Math.sin(want - horse.heading), Math.cos(want - horse.heading)) * 2, -1, 1), moveY: 1, jumpPressed: false };
  };
  const t = runUntil(() => horse.arrivedAtCave && horse.mode === 'idle', 20, { ride, each: () => { minDist = Math.min(minDist, Math.hypot(horse.position.x - cx, horse.position.z - cz)); } });
  const d = Math.hypot(hero.position.x - cx, hero.position.z - cz);
  check(t > 0 && !hero.riding && d < BC.dismountRange && d > CV.radius - 4, `auto-dismount after ${t.toFixed(1)}s, hero on foot ${d.toFixed(1)} from the arena centre; horse waiting (${horse.mode})`);
  check(boss.state === S.GUARD, `boss still guarding the cave (${boss.state})`);
}

// 2) Guard → Chase when the hero enters the arena.
{
  boss.reset();
  placeHero(cx - CV.radius - 6, cz, Math.PI / 2);
  step(secs(2));
  const guarded = boss.state === S.GUARD;
  placeHero(cx - CV.radius + 4, cz, Math.PI / 2);
  step(2);
  const d0 = Math.hypot(boss.position.x - hero.position.x, boss.position.z - hero.position.z);
  step(secs(1));
  const d1 = Math.hypot(boss.position.x - hero.position.x, boss.position.z - hero.position.z);
  check(guarded && boss.visited.has(S.CHASE) && d1 < d0 - 2, `guard until the hero enters, then chase (distance ${d0.toFixed(1)} → ${d1.toFixed(1)})`);
}

// 3) Slam: 0.8 s wind-up with the red circle, damage inside it, then Recover → Chase.
{
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3.5, cz, -Math.PI / 2, S.CHASE);
  const hearts = lives.hearts;
  const tWind = runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  const warn = boss.warning.visible;
  const tSlam = runUntil(() => boss.state === S.SLAM, 2);
  const hit = lives.hearts === hearts - BC.slam.damage;
  const tRec = runUntil(() => boss.state === S.RECOVER, 1);
  const warnAfter = boss.warning.visible;
  const tChase = runUntil(() => boss.state === S.CHASE, 3);
  check(tWind >= 0 && warn && Math.abs(tSlam - BC.slam.windup) < 0.05 && hit && tRec >= 0 && !warnAfter, `slam: warning circle shown, wind-up ${tSlam.toFixed(2)}s, hero hit (hearts ${hearts} → ${lives.hearts}), warning cleared`);
  check(Math.abs(tChase - BC.recover) < 0.05, `recover ${tChase.toFixed(2)}s, then chase again`);
  // Out of the circle when it lands: no damage.
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3.5, cz, -Math.PI / 2, S.CHASE);
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  const h2 = lives.hearts;
  hero.position.x -= BC.slam.radius + 3; // dodged away
  runUntil(() => boss.state === S.SLAM, 2, { each: () => { hero.position.x = cx - BC.slam.radius - 3; } });
  check(lives.hearts === h2, 'slam misses a hero outside the circle');
}

// 3b) A proper slam: both fists come down onto the warning circle (no jump, no push).
{
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3.5, cz, -Math.PI / 2, S.CHASE);
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  step(secs(BC.slam.windup * 0.95));
  boss.model.updateMatrixWorld(true);
  const fist = (i) => boss.model.userData.arms[i].elbow.children[1].getWorldPosition(new THREE.Vector3());
  const raised = Math.min(fist(0).y, fist(1).y) - boss.position.y;
  const feet0 = boss.position.clone();
  runUntil(() => boss.state === S.SLAM, 1);
  step(secs(BC.slam.smash) + 1);
  boss.model.updateMatrixWorld(true);
  const f = [fist(0), fist(1)];
  const onGround = f.every((p) => p.y - world.heightAt(p.x, p.z) < 0.8);
  const inCircle = f.every((p) => Math.hypot(p.x - boss.slamAt.x, p.z - boss.slamAt.z) < BC.slam.radius * 0.5);
  check(raised > BC.height && onGround && inCircle && boss.shock.visible, `slam: fists raised ${raised.toFixed(1)} high, then both on the ground inside the circle (${f.map((p) => Math.hypot(p.x - boss.slamAt.x, p.z - boss.slamAt.z).toFixed(2)).join(', ')} from its centre), shockwave shown`);
  check(boss.position.distanceTo(feet0) < 0.01, 'slam: the monster stays planted (no jump or lunge)');
  const u = boss.model.userData;
  check(u.head && u.jaw && u.arms.length === 2 && u.arms.every((a) => a.shoulder && a.elbow) && u.legs.length === 2 && u.legs.every((l) => l.hip && l.knee), 'monster model has a head, a hinged jaw, two jointed arms and two jointed legs');
  runUntil(() => boss.state === S.CHASE, 3);
}

// 3c) Fire Breath: 1 s warning (head back, glowing mouth, red cone), then 2 s of fire;
// damage over time inside the cone; a sideways dodge gets out of it.
{
  lives.reset();
  placeHero(cx - 7, cz, Math.PI / 2);
  freshBoss(cx + 1, cz, -Math.PI / 2, S.CHASE);
  boss.stateTime = BC.fire.chaseBefore;
  runUntil(() => boss.state === S.FIRE_WINDUP, 2);
  step(secs(0.6));
  const u = boss.model.userData;
  const warn = boss.fireCone.visible && u.head.rotation.x < -0.3 && u.mouth.visible && u.mouth.material.opacity > 0.4 && u.jaw.rotation.x > 0.2;
  const tFire = runUntil(() => boss.state === S.FIRE, 2) + 0.6;
  const h0 = lives.hearts, hits0 = boss.stats.fireHits;
  const tEnd = runUntil(() => boss.state !== S.FIRE, 3);
  const flames = boss.fireMesh.count;
  check(warn && Math.abs(tFire - BC.fire.windup) < 0.06, `fire wind-up ${tFire.toFixed(2)}s: head back, mouth glowing, jaw open, red cone on the ground`);
  check(Math.abs(tEnd - BC.fire.duration) < 0.06 && boss.state === S.RECOVER, `fire lasts ${tEnd.toFixed(2)}s, then recover`);
  check(boss.stats.fireHits - hits0 >= 2 && lives.hearts <= h0 - 2, `standing in the fire: ${boss.stats.fireHits - hits0} burns, hearts ${h0} → ${lives.hearts}`);
  check(flames > 20 || boss.flames.length > 20, `fire particles (${boss.flames.length} spawned)`);
  // Dodge sideways out of the cone as the fire starts: no damage.
  lives.reset();
  placeHero(cx - 7, cz, Math.PI / 2);
  freshBoss(cx + 1, cz, -Math.PI / 2, S.CHASE);
  boss.stateTime = BC.fire.chaseBefore;
  runUntil(() => boss.state === S.FIRE, 3);
  const inBefore = boss.inFireCone(hero.position.x, hero.position.z);
  hero.dodge(0, 1); // roll sideways (+Z, across the cone)
  step(secs(CONFIG.combat.dodge.duration + 0.1));
  const outAfter = !boss.inFireCone(hero.position.x, hero.position.z);
  const h1 = lives.hearts;
  runUntil(() => boss.state !== S.FIRE, 3);
  check(inBefore && outAfter && lives.hearts === CONFIG.lives.hearts && h1 === CONFIG.lives.hearts, `sideways dodge clears the cone (in ${inBefore} → out ${outAfter}), hearts kept ${lives.hearts}`);
  check(boss.fireCooldown > 0, 'fire breath has a cooldown before it can be used again');
}

// 4) Charge: head down 1 s, rush; into a boulder → stunned 2 s (bonus damage), then Recover.
{
  lives.reset();
  // Hero north of the boss, near the boulders; it charges north, the hero sidesteps.
  placeHero(cx, cz + 13, 0);
  freshBoss(cx, cz - 2, 0, S.CHASE);
  boss.stateTime = BC.charge.chaseBefore; // has been chasing a while
  const tWind = runUntil(() => boss.state === S.CHARGE_WINDUP, 2);
  const tCharge = runUntil(() => boss.state === S.CHARGE, 2);
  hero.position.x += 6; // sidestep
  const tStun = runUntil(() => boss.state !== S.CHARGE, 3, { each: () => { hero.position.set(cx + 6, hero.position.y, cz + 13); } });
  const stunned = boss.state === S.STUNNED;
  const hp = boss.hp;
  const dealt = combat.hitTarget(boss, { amount: 10 });
  const tRec = runUntil(() => boss.state === S.RECOVER, 3);
  check(tWind >= 0 && Math.abs(tCharge - BC.charge.windup) < 0.05, `charge wind-up ${tCharge.toFixed(2)}s (head down)`);
  check(stunned && boss.stats.stuns >= 1 && dealt === 10 * BC.stunnedBonus && boss.hp === hp - dealt, `charged into a boulder → stunned; hit for ${dealt} (bonus x${BC.stunnedBonus})`);
  check(Math.abs(tRec - BC.charge.stun) < 0.06, `stunned ${tRec.toFixed(2)}s, then recover`);
  // Standing in its path: the charge hits the hero.
  lives.reset();
  placeHero(cx - 8, cz, Math.PI / 2);
  freshBoss(cx + 4, cz, -Math.PI / 2, S.CHASE);
  boss.stateTime = BC.charge.chaseBefore;
  const h0 = heroHits;
  runUntil(() => boss.state === S.RECOVER || boss.state === S.STUNNED, 4);
  check(heroHits === h0 + 1 && lives.hearts === CONFIG.lives.hearts - BC.charge.damage, `charge hits a hero in its path (hearts ${lives.hearts})`);
}

// 5) Below 40% HP it attacks faster.
{
  lives.reset();
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3.5, cz, -Math.PI / 2, S.CHASE);
  boss.hp = Math.floor(boss.maxHp * BC.enrageAt) - 1;
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  const tSlam = runUntil(() => boss.state === S.SLAM, 2);
  check(boss.enraged && Math.abs(tSlam - BC.slam.windup * BC.enrageTime) < 0.05, `enraged at ${boss.hp} HP: slam wind-up ${tSlam.toFixed(2)}s (was ${BC.slam.windup})`);
}

// 6) Smoke Bomb: paralyzed (stops everything) for 10 s, takes bonus damage, then recovers.
{
  lives.reset();
  placeHero(cx - 6, cz, Math.PI / 2);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  abilities.cooldowns.smokeBomb = 0;
  step(2);
  const thrown = abilities.use('smokeBomb');
  const tPar = runUntil(() => boss.state === S.PARALYZED, 4, { each: () => { boss.position.set(cx, 0, cz); } });
  const pos = boss.position.clone();
  const hearts = lives.hearts;
  placeHero(cx - 2.5, cz, Math.PI / 2); // right in front of it
  step(secs(4));
  const frozen = boss.state === S.PARALYZED && boss.position.distanceTo(pos) < 0.01 && lives.hearts === hearts;
  const hp = boss.hp;
  const dealt = combat.hitTarget(boss, { amount: 10 });
  placeHero(cx - 8, cz, Math.PI / 2);
  const tEnd = runUntil(() => boss.state !== S.PARALYZED, 8);
  check(thrown && tPar > 0 && frozen, `smoke: paralyzed after ${tPar.toFixed(2)}s; no moving or attacking while paralyzed`);
  check(dealt === 10 * BC.paralyzedBonus && boss.hp === hp - dealt, `paralyzed bonus damage ${dealt} (x${BC.paralyzedBonus})`);
  check(tEnd > 0 && Math.abs(4 + tEnd - CONFIG.abilities.smokeBomb.paralyze) < 0.2 && boss.state === S.RECOVER, `paralysis wore off after ~${(4 + tEnd).toFixed(1)}s → ${boss.state}`);
}

// 7) Flash Mode removes 50% of its max HP; Batarang hits it too.
{
  lives.reset();
  placeHero(cx - 3.2, cz, Math.PI / 2);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  abilities.clear(); abilities.energy = 1;
  check(abilities.use('flashMode'), 'flash activated');
  step(secs(CONFIG.abilities.flashMode.chargeTime) + 2, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  const hp = boss.hp;
  step(1, { attackPressed: true }, { each: () => { if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  step(secs(0.4), {}, { each: () => { if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  check(hp - boss.hp === boss.maxHp * CONFIG.abilities.flashMode.damageFraction, `flash punch took ${hp - boss.hp} (50% of ${boss.maxHp})`);
  const hb = boss.hp;
  abilities.cooldowns.batarang = 0;
  placeHero(cx - 9, cz, Math.PI / 2);
  step(2, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  abilities.use('batarang');
  runUntil(() => !abilities.batarangOut, 4, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  check(hb - boss.hp === CONFIG.abilities.batarang.damage, `batarang hit the boss for ${hb - boss.hp} and came back`);
}

// 8) Dying during the fight: a respawn puts the hero on the horse at the last checkpoint and
// (bossResetsOnRespawn) the boss back to full health on guard.
{
  lives.reset();
  horse.lastCheckpoint = 3; horse.checkpoints.forEach((c, i) => (c.reached = i <= 3));
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3.5, cz, -Math.PI / 2, S.CHASE);
  boss.hp = 30;
  let t = 0;
  while (!lives.dead && t < 60) { step(1); t += dt; }
  const r = lives.resolveDeath();
  if (r === 'respawn') { horse.respawnAtCheckpoint(hero); boss.onHeroRespawn(); }
  const cp = horse.checkpoints[3].position;
  check(lives.hearts === CONFIG.lives.hearts && r === 'respawn' && lives.respawns === CONFIG.lives.respawns - 1 && hero.riding && Math.hypot(horse.position.x - cp.x, horse.position.z - cp.z) < 0.01,
    `killed by the boss in ${t.toFixed(1)}s → respawn on the horse at checkpoint 3 (respawns left ${lives.respawns})`);
  check(boss.hp === boss.maxHp && boss.state === S.GUARD, `boss reset to ${boss.hp} HP on guard (bossResetsOnRespawn = ${CONFIG.lives.bossResetsOnRespawn})`);
}

// 9) Defeat: stumbles, falls, fades; "Victory!"; the girl appears; the quest moves on.
{
  const ui = { toast() {}, setQuest(t) { this.text = t; } };
  const quests = new Quests(scene, world, ui, horse); quests.boss = boss; await quests.init();
  quests.index = 3; horse.arrivedAtCave = true;
  quests.update(dt, hero);
  const fightText = ui.text;
  placeHero(cx - 3.2, cz, Math.PI / 2);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  let n = 0;
  while (boss.alive && n++ < 200) { combat.hitTarget(boss, { amount: 20 }); }
  const dying = boss.state === S.DYING && !boss.alive;
  const tDead = runUntil(() => boss.state === S.DEAD, 6);
  const D = BC.dying;
  step(secs(BC.girl.appearTime) + 2);
  quests.update(dt, hero); quests.update(dt, hero);
  check(dying && Math.abs(tDead - (D.stumble + D.fall + D.fade)) < 0.05 && defeated === 1 && boss.defeated && !boss.model.visible, `defeat: dying → dead after ${tDead.toFixed(2)}s (stumble, fall, fade), onDefeat fired`);
  check(boss.girl.visible && boss.girl.scale.x > 0.99, 'the girl appears at the cave mouth');
  check(fightText === DIALOGUE.quests.boss && ui.text === DIALOGUE.quests.enterCave, `quest: "${fightText}" → "${ui.text}"`);
  boss.onHeroRespawn();
  check(boss.defeated && boss.state === S.DEAD, 'a defeated boss stays defeated after a respawn');
}

const all = Object.values(S).filter((s) => !boss.visited.has(s) && s !== S.GUARD);
// (guard is the starting state; checked in step 2)
check(all.length === 0, `every boss state reached (${Object.values(S).join(', ')})${all.length ? ' — missing ' + all.join(', ') : ''}`);
console.log(failed ? 'BOSS TEST FAILED' : 'boss test passed');
process.exit(failed ? 1 : 0);
