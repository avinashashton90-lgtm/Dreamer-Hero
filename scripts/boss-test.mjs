// Headless boss test: every boss state, slam warning + damage, charge + boulder stun, enrage,
// Smoke paralysis, Flash damage, auto-dismount at the arena, death during the fight + respawn
// (boss reset), and the defeat (girl appears, quest moves on).
// Usage: npm run test:boss   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs'; // the real Mixamo hero, read from public/
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
import { Gems } from '../src/gems.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const horse = new Horse(scene, world, heroAssets); await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
const lives = new Lives();
let heroHits = 0, defeated = 0, slams = 0;
const boss = new Boss(scene, world, {
  onHitHero: (n, x, z, opts = {}) => { if (hero.invincible) return; heroHits++; hero.hurt(x, z, opts.knockback !== false, opts.source !== 'fire'); lives.damage(n); },
  onSlam: () => slams++,
  onDefeat: () => defeated++,
}, heroAssets);
await boss.init();
combat.addTarget(boss);
const BC = CONFIG.boss, CV = CONFIG.cave, dt = 1 / 60;
const [cx, cz] = CV.center;
const MID = (BC.melee.range + BC.slam.range) / 2; // mid range: the jump-attack slam (closer: melee)
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const none = { moveX: 0, moveY: 0, jumpPressed: false };
const clipsByState = {}; // Warrok's clip seen in each boss state
const step = (n, inp = {}, opts = {}) => {
  for (let i = 0; i < n; i++) {
    const input = { ...none, ...(i === 0 ? inp : {}) };
    if (!hero.riding) hero.update(dt, input, 0);
    horse.update(dt, opts.ride ? opts.ride() : null, 0, hero);
    combat.update(dt, input, { mounted: hero.riding });
    abilities.update(dt);
    boss.update(dt, hero);
    const anim = boss.model.userData.animator;
    if (anim) (clipsByState[boss.state] ??= new Set()).add(anim.clip);
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
  const ratio = BC.height / CONFIG.heroModel.height;
  const box = new THREE.Box3().setFromObject(hero.model, true);
  const ajH = box.max.y - box.min.y;
  check(Math.abs(CONFIG.heroModel.height / CONFIG.hero.height - 1.15) < 0.01 && (heroAssets.placeholder || Math.abs(ajH - CONFIG.heroModel.height) < 0.12), `AJ drawn ${CONFIG.heroModel.height} tall (+15% over ${CONFIG.hero.height}; model measures ${ajH.toFixed(2)})`);
  check(ratio > 2.3 && ratio < 2.5 && CV.archRadius >= 9 * CONFIG.horse.height, `monster ${BC.height} tall = ${ratio.toFixed(2)}x AJ; cave mouth ${(CV.archRadius / CONFIG.horse.height).toFixed(1)}x the horse`);
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
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
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
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  const h2 = lives.hearts;
  hero.position.x -= BC.slam.radius + 3; // dodged away
  runUntil(() => boss.state === S.SLAM, 2, { each: () => { hero.position.x = cx - BC.slam.radius - 3; } });
  check(lives.hearts === h2, 'slam misses a hero outside the circle');
}

// 3b) A proper slam: both fists come down onto the warning circle (no jump, no push).
{
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  // Highest both fists get during the wind-up (raised overhead / the leap of the jump attack).
  let raised = -Infinity;
  for (let i = 0; i < secs(BC.slam.windup * 0.95); i++) { step(1); const f = boss.fistPositions(); raised = Math.max(raised, Math.min(f[0].y, f[1].y) - boss.position.y); }
  const feet0 = boss.position.clone();
  runUntil(() => boss.state === S.SLAM, 1);
  step(secs(BC.slam.smash) + 1);
  const f = boss.fistPositions();
  const onGround = f.every((p) => p.y - world.heightAt(p.x, p.z) < 0.8);
  const inCircle = f.every((p) => Math.hypot(p.x - boss.slamAt.x, p.z - boss.slamAt.z) < BC.slam.radius * 0.5);
  check(raised > BC.height && onGround && inCircle && boss.shock.visible, `slam: fists raised ${raised.toFixed(1)} high, then both on the ground inside the circle (${f.map((p) => Math.hypot(p.x - boss.slamAt.x, p.z - boss.slamAt.z).toFixed(2)).join(', ')} from its centre), shockwave shown`);
  check(boss.position.distanceTo(feet0) < 0.01, 'slam: the monster stays planted (no jump or lunge)');
  const u = boss.model.userData;
  check(u.head && u.jaw && u.arms.length === 2 && u.arms.every((a) => a.shoulder && a.elbow) && u.legs.length === 2 && u.legs.every((l) => l.hip && l.knee), 'monster model has a head, a hinged jaw, two jointed arms and two jointed legs');
  runUntil(() => boss.state === S.CHASE, 3);
}

// 3d) Close-range melee: within melee.range it swipes or punches (random) after a visible
// 0.6 s wind-up instead of slamming; one heart; 2 s recovery; a dodge roll avoids it.
{
  const kinds = new Set();
  for (const roll of [0.1, 0.9]) {
    lives.reset();
    placeHero(cx, cz, Math.PI / 2);
    freshBoss(cx + 3, cz, -Math.PI / 2, S.CHASE);
    boss.random = () => roll;
    const h0 = lives.hearts, m0 = boss.stats.meleeHits;
    const tWind = runUntil(() => boss.state === S.MELEE_WINDUP, 1);
    const anim = boss.model.userData.animator;
    step(secs(0.3));
    const clipMid = anim ? anim.clip : boss.meleeKind;
    const tBlow = runUntil(() => boss.state === S.MELEE, 2) + 0.3;
    const tRec = runUntil(() => boss.state === S.RECOVER, 2);
    const tChase = runUntil(() => boss.state === S.CHASE, 4);
    kinds.add(boss.meleeKind);
    check(tWind >= 0 && Math.abs(tBlow - BC.melee.windup) < 0.05 && clipMid === boss.meleeKind && boss.stats.meleeHits === m0 + 1 && lives.hearts === h0 - BC.melee.damage,
      `melee (${boss.meleeKind}): no slam up close, wind-up ${tBlow.toFixed(2)}s, hit for ${h0 - lives.hearts} heart`);
    check(Math.abs(tChase - BC.melee.recover) < 0.05, `melee: ${tChase.toFixed(2)}s recovery before it moves again`);
  }
  check(kinds.has('swipe') && kinds.has('punch'), `melee picks swipe or punch at random (${[...kinds].join(', ')})`);
  // A dodge roll during the wind-up avoids the blow.
  lives.reset();
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + 3, cz, -Math.PI / 2, S.CHASE);
  boss.random = Math.random;
  runUntil(() => boss.state === S.MELEE_WINDUP, 1);
  step(secs(0.35));
  hero.dodge(0, 1); // roll aside
  runUntil(() => boss.state === S.RECOVER, 2);
  check(lives.hearts === CONFIG.lives.hearts, `dodging during the melee wind-up avoids it (hearts ${lives.hearts})`);
  // Mid range is still the slam.
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
  runUntil(() => boss.state !== S.CHASE, 1);
  check(boss.state === S.SLAM_WINDUP, `at ${MID.toFixed(1)} (mid range) it still uses the jump-attack slam`);
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
  // Head back / jaw open: the placeholder's pivots, or Warrok's roar clip.
  const headBack = u.animator ? u.animator.clip === 'roar' : u.head.rotation.x < -0.3 && u.jaw.rotation.x > 0.2;
  const warn = boss.fireCone.visible && headBack && u.mouth.visible && u.mouth.material.opacity > 0.4;
  const tFire = runUntil(() => boss.state === S.FIRE, 2) + 0.6;
  const h0 = lives.hearts, hits0 = boss.stats.fireHits;
  const tEnd = runUntil(() => boss.state !== S.FIRE, 3);
  const flames = boss.fireMesh.count;
  check(warn && Math.abs(tFire - BC.fire.windup) < 0.06, `fire wind-up ${tFire.toFixed(2)}s: head back, mouth glowing, jaw open, red cone on the ground`);
  check(Math.abs(tEnd - BC.fire.duration) < 0.06 && boss.state === S.RECOVER, `fire lasts ${tEnd.toFixed(2)}s, then recover`);
  const burns = boss.stats.fireHits - hits0;
  check(burns === Math.floor((BC.fire.duration - BC.fire.firstTick) / BC.fire.tick) + 1 && lives.hearts === h0 - burns * BC.fire.flameDamageHearts,
    `standing in the fire: ${burns} burns (one every ${BC.fire.tick}s), ${BC.fire.flameDamageHearts} heart each: hearts ${h0} → ${lives.hearts}`);
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
  check(stunned && boss.stats.stuns >= 1 && dealt === boss.maxHp * BC.hitPct.melee * BC.stunnedBonus && boss.hp === hp - dealt, `charged into a boulder → stunned; hit for ${dealt} (bonus x${BC.stunnedBonus})`);
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
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
  boss.hp = Math.floor(boss.maxHp * BC.enrageAt) - 1;
  runUntil(() => boss.state === S.SLAM_WINDUP, 2);
  const tSlam = runUntil(() => boss.state === S.SLAM, 2);
  check(boss.enraged && Math.abs(tSlam - BC.slam.windup * BC.enrageTime) < 0.05, `enraged at ${boss.hp} HP: slam wind-up ${tSlam.toFixed(2)}s (was ${BC.slam.windup})`);
}

// 6) Smoke Bomb on the boss: paralyzed (stops everything) for only 4 s, takes +20% damage,
// then resists paralysis for 20 s (the powder does nothing), after which it works again.
{
  const P = BC.paralysis;
  lives.reset();
  const resisted = [];
  abilities.onEvent = (name) => { if (name === 'smokeResisted') resisted.push(name); };
  const throwSmoke = () => {
    placeHero(cx - 6, cz, Math.PI / 2);
    abilities.cooldowns.smokeBomb = 0;
    step(2, {}, { each: () => { boss.position.set(cx, 0, cz); if (boss.state !== S.PARALYZED) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
    return abilities.use('smokeBomb');
  };
  placeHero(cx - 6, cz, Math.PI / 2);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  const thrown = throwSmoke();
  const tPar = runUntil(() => boss.state === S.PARALYZED, 4, { each: () => { boss.position.set(cx, 0, cz); } });
  const pos = boss.position.clone();
  const hearts = lives.hearts;
  placeHero(cx - 2.5, cz, Math.PI / 2); // right in front of it
  step(secs(2));
  const frozen = boss.state === S.PARALYZED && boss.position.distanceTo(pos) < 0.01 && lives.hearts === hearts;
  const hp = boss.hp;
  const dealt = combat.hitTarget(boss, { amount: 10 });
  const ringFrac = abilities.fx.get(boss)?.ringFrac;
  placeHero(cx - 8, cz, Math.PI / 2);
  const tEnd = runUntil(() => boss.state !== S.PARALYZED, 8);
  const base = boss.maxHp * BC.hitPct.melee;
  check(thrown && tPar > 0 && frozen, `smoke: paralyzed after ${tPar.toFixed(2)}s; no moving or attacking while paralyzed`);
  check(Math.abs(dealt - base * P.bonus) < 1e-6 && Math.abs(boss.hp - (hp - dealt)) < 1e-6, `paralyzed: a ${base} hit does ${dealt} (+${Math.round((P.bonus - 1) * 100)}%)`);
  check(tEnd > 0 && Math.abs(2 + tEnd - P.duration) < 0.1 && boss.state === S.RECOVER && Math.abs(ringFrac - (1 - 2 / P.duration)) < 0.03, `boss paralysis lasts ${(2 + tEnd).toFixed(1)}s (${P.duration} s; timer ring counts down from ${P.duration} s; other monsters ${CONFIG.abilities.smokeBomb.paralyze} s) → ${boss.state}`);
  // Resistant for 20 s: a second bomb straight away does nothing.
  check(boss.resistsParalysis() && Math.abs(boss.paralysisResist - P.resist) < 0.1, `resists paralysis for ${P.resist} s afterwards`);
  step(secs(CONFIG.abilities.smokeBomb.cooldown) - 2, {}, { each: () => { boss.position.set(cx, 0, cz); boss.state = S.RECOVER; boss.stateTime = 0; } });
  throwSmoke();
  const t2 = runUntil(() => boss.state === S.PARALYZED, 3, { each: () => { boss.position.set(cx, 0, cz); if (boss.state !== S.PARALYZED) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  check(t2 < 0 && resisted.length >= 1, `smoke within the ${P.resist} s: no paralysis ("${DIALOGUE.smokeResisted}")`);
  // After the resistance wears off it works again.
  runUntil(() => !boss.resistsParalysis(), P.resist, { each: () => { boss.position.set(cx, 0, cz); boss.state = S.RECOVER; boss.stateTime = 0; } });
  abilities.clear();
  throwSmoke();
  const t3 = runUntil(() => boss.state === S.PARALYZED, 4, { each: () => { boss.position.set(cx, 0, cz); if (boss.state !== S.PARALYZED) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  check(t3 > 0, `after ${P.resist} s the smoke paralyzes it again`);
  runUntil(() => boss.state !== S.PARALYZED, 6);
  abilities.onEvent = null;
  abilities.clear();
}

// 6b) Smoke on the boss: it lands on the lock-on target; the moment its body touches the cloud
// it's interrupted (any wind-up cancelled) and coughs; inside it moves at 15% and can't walk out
// before the 0.5 s exposure completes, then paralysis. Never mid slam landing or charge rush —
// the frame after those end, it applies.
{
  const SBc = CONFIG.abilities.smokeBomb;
  lives.reset(); abilities.clear();
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  placeHero(cx - 9, cz, Math.PI / 2);
  step(2, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  combat.lockTarget = boss;
  abilities.cooldowns.smokeBomb = 0;
  check(abilities.use('smokeBomb'), 'smoke bomb thrown at the boss');
  // Just before it lands the boss starts winding up a charge.
  runUntil(() => abilities.bombs.length && abilities.bombs[0].t > 0.9, 2, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  const landAt = abilities.bombs[0].end.clone();
  boss.state = S.CHARGE_WINDUP; boss.stateTime = 0;
  const tTouch = runUntil(() => boss.state === S.SMOKED, 1);
  check(Math.hypot(landAt.x - cx, landAt.z - cz) < 1 && SBc.radius === 6 && SBc.duration === 8, `lands on the boss (${Math.hypot(landAt.x - cx, landAt.z - cz).toFixed(2)} from it), cloud radius ${SBc.radius}, ${SBc.duration} s`);
  check(tTouch >= 0 && tTouch < 0.15, `the moment the cloud touches it the charge wind-up is cancelled: coughing (${boss.state}) after ${tTouch.toFixed(2)} s`);
  // The hero runs off: it can't follow out of the cloud before paralysis.
  const cloud = abilities.clouds[0];
  placeHero(cx - 16, cz, -Math.PI / 2);
  const p0 = boss.position.clone();
  let maxOut = 0, moved = 0, t = 0;
  while (boss.state === S.SMOKED && t < 2) {
    const before = boss.position.clone();
    step(1);
    t += dt;
    moved = Math.max(moved, before.distanceTo(boss.position) / dt);
    maxOut = Math.max(maxOut, Math.hypot(boss.position.x - cloud.x, boss.position.z - cloud.z));
  }
  const total = tTouch + t;
  check(boss.state === S.PARALYZED && Math.abs(total - SBc.smokeExposureSeconds) < 0.1, `paralyzed ${total.toFixed(2)} s after first touching the cloud (smokeExposureSeconds ${SBc.smokeExposureSeconds})`);
  check(moved <= BC.walkSpeed * (1 - BC.smoke.slow) + 0.05 && maxOut <= SBc.radius + boss.radius * 0.5 + 1e-6, `inside it creeps at ≤ ${moved.toFixed(2)}/s (walk ${BC.walkSpeed}, −${BC.smoke.slow * 100}%) and never leaves the cloud (≤ ${maxOut.toFixed(2)} from its centre)`);
  check(Math.abs(boss.paralyzed - BC.paralysis.duration) < 0.05 + dt, `then paralysis for the full ${BC.paralysis.duration} s`);
  runUntil(() => boss.state !== S.PARALYZED, 6);
  // Immune mid slam landing and mid charge rush: the frame after, it takes hold.
  for (const st of [S.SLAM, S.CHARGE]) {
    abilities.clear(); boss.paralysisResist = 0;
    freshBoss(cx, cz, -Math.PI / 2, st);
    if (st === S.SLAM) boss.slamAt.set(cx - 2, world.heightAt(cx - 2, cz), cz);
    else boss.chargeDir.set(0, 0); // (rushing on the spot: stays in the cloud)
    abilities.clouds.push({ x: cx, y: world.heightAt(cx, cz), z: cz, age: 0, seed: 0 });
    placeHero(cx - 14, cz, Math.PI / 2);
    let during = false, frames = 0, wasState = true;
    while (boss.state === st && frames < 200) { step(1); frames++; if (boss.state === S.SMOKED) during = true; }
    const ended = boss.state;
    step(1);
    check(!during && ended !== S.SMOKED && boss.state === S.SMOKED, `in the cloud during a ${st === S.SLAM ? 'slam landing' : 'charge rush'}: no effect until it ends (→ ${ended}), the next frame it coughs (${boss.state})`);
  }
  abilities.clear(); boss.paralysisResist = 0;
}

// 6c) Flash against the boss: auto-locks onto it up to 15 away; the hero has super-armor
// through the 0.6 s charge and the strike (no damage, no knockback, no interruption, a lightning
// shield shows it); the bolt staggers the boss 1.5 s and its shockwave pushes minions back.
{
  const FMc = CONFIG.abilities.flashMode;
  lives.reset(); abilities.clear(); combat.reset();
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  // 14.5 from its edge, facing away (no lock-on): it still locks onto the boss.
  placeHero(cx - boss.radius - 14.5, cz, -Math.PI / 2);
  step(1, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  const far = abilities.use('flashMode');
  check(far && abilities.flashTarget === boss && combat.lockTarget !== boss, `Flash from ${(14.5).toFixed(1)} off the boss's edge, facing away: auto-locked onto it`);
  abilities.clear(); lives.reset();
  // Up close while it attacks: a swipe lands mid-charge, fire burns, a slam — none of it counts.
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  placeHero(cx - boss.radius - 1, cz, Math.PI / 2);
  step(1, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  // Stand-in minions: one within minions.flashKillRadius (dies), one just beyond it (pushed back).
  const mk = (x, z) => ({ minion: true, position: new THREE.Vector3(x, world.heightAt(x, z), z), radius: 0.5, height: 1.5, hp: 50, maxHp: 50, alive: true,
    takeHit({ amount }) { const d = Math.min(this.hp, amount); this.hp -= d; if (this.hp <= 0) this.alive = false; return d; } });
  const minion = mk(cx + 2, cz + 6.5);
  const doomed = mk(cx + 2, cz + 2);
  combat.addTarget(minion); combat.addTarget(doomed);
  const hits0 = heroHits, hp0 = boss.hp;
  boss.meleeKind = 'swipe'; boss.facing = Math.atan2(hero.position.x - cx, hero.position.z - cz);
  check(abilities.use('flashMode'), 'Flash used up close');
  const hearts = lives.hearts; // (after its own 30% cost)
  const pos0 = hero.position.clone();
  boss.state = S.MELEE_WINDUP; boss.stateTime = BC.melee.windup - 0.05; // the swipe lands in 0.05 s
  let shield = false, armorAll = true, slamDone = false, burnt = false;
  let tt = 0;
  const minionD0 = minion.position.distanceTo(boss.position);
  while (tt < FMc.chargeTime + FMc.bolt.time - dt) {
    step(1, {}, { each: () => {
      if (boss.state === S.RECOVER && !slamDone) { slamDone = true; boss.state = S.SLAM_WINDUP; boss.stateTime = BC.slam.windup - dt; boss.slamAt.copy(hero.position); }
    } });
    tt += dt;
    if (abilities.lightning.userData.shell.visible) shield = true;
    if (!hero.superArmor) armorAll = false;
  }
  // and a fire tick right inside the cone while armoured
  check(heroHits === hits0 && lives.hearts === hearts && hero.position.distanceTo(pos0) < 0.05 && hero.hurtT === 0, `super-armor: the swipe and the slam during the charge did nothing (hits ${heroHits - hits0}, hearts ${hearts} → ${lives.hearts}, knocked back ${hero.position.distanceTo(pos0).toFixed(2)})`);
  check(armorAll && shield && abilities.stats.flashStrikes >= 1 && FMc.chargeTime === 0.6, `armour held through the ${FMc.chargeTime} s charge and the strike (not interrupted), gold-white lightning shield shown`);
  check(Math.abs(hp0 - boss.hp - boss.maxHp * BC.hitPct.flash) < 1e-6 && boss.state === S.STAGGERED, `the bolt took ${hp0 - boss.hp} and staggered it (${boss.state})`);
  check(minion.alive && minion.position.distanceTo(boss.position) > minionD0 + 1 && !doomed.alive, `the minion ${Math.hypot(2, 2).toFixed(1)} from the bolt died (kill radius ${CONFIG.minions.flashKillRadius}); the shockwave pushed the one ${minionD0.toFixed(1)} away back (→ ${minion.position.distanceTo(boss.position).toFixed(1)})`);
  combat.removeTarget(minion); combat.removeTarget(doomed);
  const tSt = runUntil(() => boss.state !== S.STAGGERED, 3) + (tt - FMc.chargeTime); // (+ the strike time already run)
  check(Math.abs(tSt - BC.flashStagger) < 0.15 && boss.state === S.RECOVER, `staggered ~${tSt.toFixed(2)} s (flashStagger ${BC.flashStagger}) → ${boss.state}`);
  check(!hero.superArmor && !hero.invincible, 'super-armor ends with the strike');
  abilities.clear(); lives.reset();
}

// 7) Flash Mode's bolt removes damageFraction of its max HP; Batarang hits it too.
{
  lives.reset();
  placeHero(cx - 3.2, cz, Math.PI / 2);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  abilities.clear(); abilities.energy = 1;
  const hp = boss.hp, strikes0 = abilities.stats.flashStrikes;
  check(abilities.use('flashMode'), 'flash activated');
  step(secs(CONFIG.abilities.flashMode.chargeTime) + 2, {}, { each: () => { if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
  check(hp - boss.hp === boss.maxHp * CONFIG.abilities.flashMode.damageFraction && abilities.stats.flashStrikes === strikes0 + 1, `flash bolt took ${hp - boss.hp} (${CONFIG.abilities.flashMode.damageFraction * 100}% of ${boss.maxHp})`);
  const hb = boss.hp;
  abilities.cooldowns.batarang = 0;
  placeHero(cx - 9, cz, Math.PI / 2);
  step(2, {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  abilities.use('batarang');
  runUntil(() => !abilities.batarangOut, 4, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  check(Math.abs(hb - boss.hp - boss.maxHp * BC.hitPct.batarang) < 1e-6, `batarang hit the boss for ${(hb - boss.hp).toFixed(2)} (${BC.hitPct.batarang * 100}% of max HP) and came back`);
}

// 7b) Reach: all three combo hits land on a stationary boss from normal standing distance
// (walked up against it), from a step back (lunge), and each takes 3% of its max HP.
{
  lives.reset();
  const hold = { each: () => { if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; } } };
  const combo = () => {
    const before = boss.hp, hits0 = combat.hits, from = hero.position.clone();
    step(1, { attackPressed: true }, hold);
    step(secs(CONFIG.combat.lungeTime) + 1, {}, hold);
    const lunged = from.distanceTo(hero.position); // the first hit's lunge
    for (let k = 1; k < 3; k++) { step(secs(0.2), {}, hold); step(1, { attackPressed: true }, hold); step(secs(0.25), {}, hold); }
    step(secs(0.6), {}, hold);
    return { hits: combat.hits - hits0, dmg: before - boss.hp, lunged };
  };
  // Walk up to it until its body stops him.
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  placeHero(cx - 7, cz, Math.PI / 2);
  step(secs(2), { moveX: 0, moveY: 1 }, { ...hold, each: () => { hold.each(); hero.update(0, { ...none, moveX: 0, moveY: 1 }, -Math.PI / 2); } });
  step(secs(1.2), { moveX: 0, moveY: 1 }, hold);
  for (let i = 0; i < secs(1.5); i++) { hero.update(dt, { ...none, moveX: 0, moveY: 1 }, Math.PI / 2 + Math.PI); boss.update(dt, hero); hold.each(); }
  combat.reset();
  const edge0 = Math.hypot(hero.position.x - boss.position.x, hero.position.z - boss.position.z) - boss.radius;
  const r0 = combo();
  const per = boss.maxHp * BC.hitPct.melee;
  check(r0.hits === 3 && Math.abs(r0.dmg - 3 * per) < 1e-6, `standing against it (${edge0.toFixed(2)} from its edge): ${r0.hits}/3 combo hits land, ${r0.dmg} damage (${BC.hitPct.melee * 100}% each)`);
  // From further back: the lunge carries him in (up to 1.5) and every hit lands.
  for (const back of [CONFIG.combat.combo[0].reach, CONFIG.combat.combo[0].reach + CONFIG.combat.lunge * 0.9]) {
    freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
    placeHero(cx - boss.radius - back, cz, Math.PI / 2);
    combat.reset(); step(2, {}, hold);
    const r = combo();
    check(r.hits === 3 && r.lunged <= CONFIG.combat.lunge + 0.01 && r.lunged > 0.5, `${back.toFixed(1)} from its edge: ${r.hits}/3 hits land (first lunge ${r.lunged.toFixed(2)}, max ${CONFIG.combat.lunge})`);
  }
  // No lunge past the stopping point (never into its body).
  const edge = Math.hypot(hero.position.x - boss.position.x, hero.position.z - boss.position.z) - boss.radius;
  check(edge >= CONFIG.hero.radius - 0.01, `lunge stops short of its body (${edge.toFixed(2)} from its edge)`);
}

// 7c) Phase 2 (below 50% HP): shorter recoveries and up-close slams that crack the ground.
{
  lives.reset();
  const cracks = [];
  boss.events.onCrack = (p) => cracks.push(p);
  freshBoss(cx, cz, -Math.PI / 2, S.CHASE);
  placeHero(cx - 2.6, cz, Math.PI / 2);
  boss.random = () => 0.1; // (below enrageSlamChance)
  step(1);
  const phase1 = boss.state;
  freshBoss(cx, cz, -Math.PI / 2, S.CHASE);
  boss.hp = boss.maxHp * BC.enrageAt - 1;
  placeHero(cx - 2.6, cz, Math.PI / 2);
  step(1);
  const phase2 = boss.state;
  runUntil(() => boss.state === S.SLAM, 2);
  const crackShown = boss.cracks.some((c) => c.model.visible);
  runUntil(() => boss.state === S.RECOVER, 2);
  const rec2 = boss.recoverFor;
  boss.random = () => 0.9;
  check(phase1 === S.MELEE_WINDUP && phase2 === S.SLAM_WINDUP, `up close: phase 1 → ${phase1}, phase 2 (below ${BC.enrageAt * 100}%) → ${phase2} (${BC.enrageSlamChance * 100}% of the time)`);
  check(cracks.length === 1 && crackShown, `phase-2 slam cracks the ground open (onCrack, ${cracks.length} crack shown)`);
  check(Math.abs(rec2 - BC.recover * BC.enrageRecover) < 1e-6, `phase-2 recovery ${rec2.toFixed(2)} s (phase 1: ${BC.recover} s)`);
  step(secs(BC.crack.life + 0.1), {}, { each: () => { boss.state = S.RECOVER; boss.stateTime = 0; } });
  check(!boss.cracks.some((c) => c.model.visible), `cracks fade after ${BC.crack.life} s`);
  boss.events.onCrack = null;
  boss.random = Math.random;
}

// 8) Dying during the fight: a respawn puts the hero on the horse at the last checkpoint and
// (bossResetsOnRespawn) the boss back to full health on guard.
{
  lives.reset();
  horse.lastCheckpoint = 3; horse.checkpoints.forEach((c, i) => (c.reached = i <= 3));
  placeHero(cx, cz, Math.PI / 2);
  freshBoss(cx + MID, cz, -Math.PI / 2, S.CHASE);
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

// 8b) Gem supply: ~30 of each colour on the ride; a respawn brings back the trail gems from the
// checkpoint to the cave and tops the stock up to respawnMinGems; Retry starts from 0; rings of
// arena gems at 75 / 50 / 25% HP (walked over to collect); minions drop a gem; one fight's
// supply covers at least 2 Flash, 3 Smoke and 6 Batarang uses.
{
  const G = CONFIG.gems, AB = CONFIG.abilities;
  const gems = new Gems(scene, world); await gems.init();
  const forest = gems.gems.filter((g) => g.zone === 'forest');
  const per = {};
  for (const g of forest) per[g.color] = (per[g.color] ?? 0) + 1;
  check(Object.values(per).every((n) => n >= 28 && n <= 32), `forest ride: ${JSON.stringify(per)} gems (~30 of each)`);
  // Respawn: trail gems from the checkpoint on come back; the stock is topped up to 10.
  for (const g of forest) { g.collected = true; }
  gems.counts.yellow = 3; gems.counts.blue = 25; gems.counts.pink = 0;
  horse.lastCheckpoint = 2;
  const cpS = horse.checkpoints[2].s;
  gems.restock(cpS); // (main's lifeEvents.onRespawn)
  const back = forest.filter((g) => !g.collected);
  check(back.length > 0 && back.every((g) => g.s >= cpS) && forest.filter((g) => g.s >= cpS).every((g) => !g.collected), `respawn at checkpoint 2 (s ${cpS.toFixed(0)}): the ${back.length} trail gems from there to the cave are back, the ones before stay collected`);
  check(gems.counts.yellow === G.respawnMinGems && gems.counts.pink === G.respawnMinGems && gems.counts.blue === 25 && gems.unlocked.size === 3,
    `stock topped up to at least ${G.respawnMinGems}: ${JSON.stringify(gems.counts)} (more is kept), every ability unlocked`);
  gems.reset(); // (Retry after Game Over)
  check(Object.values(gems.counts).every((n) => n === 0) && gems.unlocked.size === 0 && gems.remaining === gems.trailGems.length, 'Retry after Game Over: a fresh start with 0 gems, every trail gem back');
  // Arena rings at 75 / 50 / 25%.
  boss.events.onHpMark = (i) => gems.revealRing(i);
  freshBoss(cx, cz, -Math.PI / 2, S.RECOVER);
  const shown = () => gems.gems.filter((g) => g.zone === 'arena' && !g.hidden);
  const before = shown().length;
  const rings = [];
  const pct = [];
  while (boss.hp > 10) {
    combat.hitTarget(boss, { amount: 10 });
    boss.state = S.RECOVER;
    if (shown().length !== (rings.at(-1) ?? 0)) { rings.push(shown().length); pct.push(Math.round((boss.hp / boss.maxHp) * 100)); }
  }
  const ring0 = gems.gems.filter((g) => g.zone === 'arena' && g.ring === 0);
  const edge = ring0.map((g) => Math.hypot(g.position.x - cx, g.position.z - cz));
  const colors = {};
  for (const g of ring0) colors[g.color] = (colors[g.color] ?? 0) + 1;
  check(before === 0 && rings.join(',') === '6,12,18' && pct[0] < 75 && pct[0] >= 72 && pct[1] < 50 && pct[2] < 25,
    `arena rings: none at first, 6 more gems at ${pct.map((p) => p + '%').join(', ')} HP (${rings.join(' → ')} shown)`);
  check(Object.values(colors).every((n) => n === G.arena.perColor) && edge.every((d) => Math.abs(d - (CV.radius - G.arena.inset)) < 0.01), `each ring: ${JSON.stringify(colors)}, at the arena's edge (${edge[0].toFixed(1)} from the centre)`);
  // Walk over one.
  const g0 = ring0[0];
  const c0 = gems.counts[g0.color];
  placeHero(g0.position.x - 3, g0.position.z, Math.PI / 2);
  for (let i = 0; i < secs(1); i++) {
    hero.update(dt, { moveX: 0, moveY: 0, jumpPressed: false }, 0);
    hero.position.x += 3 * dt;
    gems.update(dt, hero.position.clone().setY(hero.position.y + 0.9));
  }
  check(g0.collected && gems.counts[g0.color] === c0 + 1, `walking over an arena gem collects it (${g0.color} ${c0} → ${gems.counts[g0.color]})`);
  boss.reset(); gems.resetArena(); // (respawn: the boss resets, so do its rings)
  check(shown().length === 0, 'rings hidden again when the boss resets');
  // A minion drops one gem of a random colour where it falls.
  const minion = { minion: true, position: new THREE.Vector3(cx - 5, world.heightAt(cx - 5, cz + 3), cz + 3), radius: 0.5, height: 1.5, hp: 5, maxHp: 5, alive: true,
    takeHit({ amount }) { const d = Math.min(this.hp, amount); this.hp -= d; if (this.hp <= 0) this.alive = false; return d; } };
  const drops = [];
  combat.events.onDefeat = (t) => { if (t.minion) drops.push(gems.drop(t.position)); };
  combat.hitTarget(minion, { amount: 10 });
  combat.events.onDefeat = undefined;
  check(drops.length === 1 && drops[0] && !drops[0].hidden && drops[0].position.distanceTo(minion.position) < 1.5, `a defeated minion drops 1 ${drops[0]?.color} gem where it fell`);
  // One fight's supply: arriving with the ride's gems plus the three arena rings.
  const arena = CONFIG.boss.hpMarks.length * G.arena.perColor;
  const supply = Object.fromEntries(Object.entries(per).map(([c, n]) => [c, n + arena]));
  const uses = { batarang: Math.floor(supply.yellow / AB.batarang.gemCost), smokeBomb: Math.floor(supply.blue / AB.smokeBomb.gemCost), flashMode: Math.floor(supply.pink / AB.flashMode.gemCost) };
  check(uses.flashMode >= 2 && uses.smokeBomb >= 3 && uses.batarang >= 6, `one fight's supply ${JSON.stringify(supply)} (ride + ${arena} per colour in the arena): Flash ${uses.flashMode}x, Smoke ${uses.smokeBomb}x, Batarang ${uses.batarang}x (needs 2 / 3 / 6)`);
  // After a respawn at the last checkpoint: the top-up, the trail gems from there, the rings.
  const last = horse.checkpoints.length - 1;
  const ahead = {};
  for (const g of forest) if (g.s >= horse.checkpoints[last].s) ahead[g.color] = (ahead[g.color] ?? 0) + 1;
  const retry = Object.fromEntries(Object.keys(per).map((c) => [c, G.respawnMinGems + (ahead[c] ?? 0) + arena]));
  console.log(`     (after a respawn at the last checkpoint: at least ${JSON.stringify(retry)} for the fight — Flash ${Math.floor(retry.pink / 5)}x, Smoke ${Math.floor(retry.blue / 5)}x, Batarang ${Math.floor(retry.yellow / 5)}x)`);
  check(Math.floor(retry.pink / 5) >= 2 && Math.floor(retry.blue / 5) >= 3, 'even after a respawn at the last checkpoint: at least 2 Flash and 3 Smoke');
  boss.events.onHpMark = undefined;
  boss.reset();
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

// Warrok: each state plays its clip.
if (boss.model.userData.animator) {
  const want = { meleeWindup: 'swipe/punch', melee: 'swipe/punch', chase: 'walk', recover: 'idle', slamWindup: 'jumpattack', slam: 'jumpattack', fireWindup: 'roar', fire: 'roar', chargeWindup: 'roar', charge: 'run', stunned: 'hit', paralyzed: 'hit', dying: 'death' };
  const wrong = Object.entries(want).filter(([st, c]) => { const ok = c.split('/'); const seen = [...(clipsByState[st] ?? [])]; return !seen.length || seen.some((x) => !ok.includes(x)); });
  check(wrong.length === 0, `Warrok's clips by state: ${Object.entries(want).map(([st]) => `${st}=${[...(clipsByState[st] ?? [])].join('/')}`).join(', ')}${wrong.length ? ' — WRONG: ' + wrong.map(([st]) => st).join(', ') : ''}`);
}

const all = Object.values(S).filter((s) => !boss.visited.has(s) && s !== S.GUARD);
// (guard is the starting state; checked in step 2)
check(all.length === 0, `every boss state reached (${Object.values(S).join(', ')})${all.length ? ' — missing ' + all.join(', ') : ''}`);
console.log(failed ? 'BOSS TEST FAILED' : 'boss test passed');
process.exit(failed ? 1 : 0);
