// Headless test: the sealed boss arena (arena.js) and Flash inside it. The boss notices AJ →
// the rock barrier closes behind him after barrierCloseDelay (rumble, dust), he can't get out;
// the boss never leaves its leash (arenaRadius) — chasing a hero outside, charging at the
// barrier, pushed, teleported out, a long random fight; a respawn puts AJ back inside; Amy
// watches from her corner out of reach; the horse waits inside, the fire hurts it (a bar only
// once hurt), at 0 it bolts and fades; the boss dies → the barrier opens and the horse comes
// back to AJ. Flash in the arena on his last heart (and on half a heart): fired, hearts
// unchanged, still 40% of the boss; still limited by the pink gems and the reload bar;
// outside the arena it still costs 1.5 hearts and is blocked on low hearts.
// Usage: npm run test:arena   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import { CONFIG, abilityGemCost } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Lives } from '../src/lives.js';
import { Gems } from '../src/gems.js';
import { Sound } from '../src/audio.js';
import { Boss, BOSS_STATES as S } from '../src/boss.js';
import { SealedArena } from '../src/arena.js';

const AR = CONFIG.arena, CV = CONFIG.cave, BC = CONFIG.boss, FM = CONFIG.abilities.flashMode, dt = 1 / 60;
const [cx, cz] = CV.center;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const secs = (s) => Math.round(s / dt);

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
const gems = new Gems(scene, world); await gems.init();
abilities.gems = gems;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
let god = true; // (the boss's blows don't cost hearts while the leash is tested)
let arena = null;
const boss = new Boss(scene, world, {
  onHitHero: (n, x, z, opts = {}) => { if (god || hero.invincible) return; hero.hurt(x, z, opts.knockback !== false, opts.source !== 'fire'); lives.damage(n); },
  onNotice: () => arena.notice(),
}, heroAssets);
await boss.init();
combat.addTarget(boss);
const toasts = [];
arena = new SealedArena(scene, world, { hero, horse, boss, sound, lives, gems, abilities, onToast: (t) => toasts.push(t) });
await arena.init();

const fromCentre = (p) => Math.hypot(p.x - cx, p.z - cz);
let maxBoss = 0; // the furthest the boss's centre got from the arena's centre
const none = { moveX: 0, moveY: 0, jumpPressed: false };
const step = (n, { input = none, yaw = 0, each } = {}) => {
  for (let i = 0; i < n; i++) {
    if (!hero.riding) hero.update(dt, input, yaw);
    horse.update(dt, null, 0, hero);
    combat.update(dt, none, { mounted: hero.riding });
    abilities.inSealedArena = arena.sealed;
    abilities.update(dt);
    boss.regenEnabled = arena.sealed; // (main: the regen only in the sealed fight, in play)
    boss.update(dt, hero);
    arena.update(dt, true);
    maxBoss = Math.max(maxBoss, fromCentre(boss.position));
    if (each?.() === false) break;
  }
};
const placeHero = (x, z, face = Math.PI / 2) => {
  hero.riding = false;
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
  hero.facing = face;
};
const inside = (p, margin = 0) => fromCentre(p) < CV.radius - margin;
const barrierIn = () => arena.colliders.every((c) => world.cylinders.includes(c));
const barrierOut = () => arena.colliders.every((c) => !world.cylinders.includes(c));

// 1) The boss notices him → the barrier closes behind him (after barrierCloseDelay), rumble + dust.
{
  boss.reset(); arena.reset();
  horse.mode = 'idle'; horse.everMounted = true;
  horse.position.set(cx - CV.radius - 8, world.heightAt(cx - CV.radius - 8, cz + 3), cz + 3); // waiting outside (where T leaves it)
  placeHero(cx - CV.radius - 4, cz);
  step(30);
  check(arena.state === 'open' && boss.state === S.GUARD && barrierOut(), 'outside the arena: the entrance open, the boss on guard');
  placeHero(cx - CV.radius + 3, cz);
  step(1);
  const noticed = boss.state === S.CHASE && arena.state === 'armed';
  check(noticed && boss.girlWatching && boss.girl.visible, `the boss notices him → armed; Amy watching from her corner (visible ${boss.girl.visible})`);
  let closedAt = -1, t = 0;
  step(secs(AR.barrierCloseDelay + AR.closeTime + 0.5), { each: () => { t += dt; if (closedAt < 0 && arena.state === 'closing') closedAt = t; } });
  const rocks = arena.model.userData.rocks;
  const dust = arena.model.userData.dust.some((d) => d.sprite.visible || d.age < Infinity);
  check(Math.abs(closedAt - AR.barrierCloseDelay) < 0.05 && arena.state === 'closed' && barrierIn() && rocks.every((r) => r.visible),
    `the barrier starts closing ${closedAt.toFixed(2)} s after (barrierCloseDelay ${AR.barrierCloseDelay}), shut and solid (${arena.colliders.length} rocks)`);
  check(sound.counts.barrierRumble === 1 && dust && toasts.length === 1, `a rumble (${sound.counts.barrierRumble}), dust, a toast "${toasts[0]}"`);
  const [hx, hz] = AR.horseSpot;
  check(horse.position.x > arena.lineX + 1 && Math.hypot(horse.position.x - (cx + hx), horse.position.z - (cz + hz)) < 0.5 && horse.mode === 'idle' && !horse.scripted && horse.speed === 0,
    `the horse walked in and waits inside by the entrance (${horse.position.x.toFixed(1)}, ${horse.position.z.toFixed(1)}), grazing (idle, stopped)`);
}

// 2) AJ can't get out: running west into the barrier for 4 s.
{
  god = true;
  placeHero(arena.lineX + 4, cz + 1);
  boss.position.set(cx + 10, boss.position.y, cz); // (out of his way)
  let minX = Infinity;
  step(secs(4), { input: { moveX: 0, moveY: 1, jumpPressed: false }, yaw: Math.PI / 2, each: () => { minX = Math.min(minX, hero.position.x); } });
  check(minX > arena.lineX - 1, `running into the barrier he stays inside (x ≥ ${minX.toFixed(2)}, barrier at ${arena.lineX})`);
  const yawWest = hero.facing;
  check(Math.abs(Math.sin(yawWest) + 1) < 0.2, `(he was running west: facing ${yawWest.toFixed(2)})`);
}

// 3) The boss is leashed: never further than arenaRadius from the centre.
{
  maxBoss = 0;
  // a) The hero outside the barrier (beyond it): the boss chases to the edge and stops there.
  placeHero(arena.lineX - 6, cz);
  boss.state = S.CHASE; boss.stateTime = 0;
  step(secs(10));
  const a = maxBoss;
  // b) Charges at the barrier from across the arena.
  for (let k = 0; k < 4; k++) {
    boss.position.set(cx + 8, boss.position.y, cz + (k - 1.5) * 3);
    boss.facing = -Math.PI / 2;
    boss.state = S.CHARGE_WINDUP; boss.stateTime = 0;
    placeHero(arena.lineX + 2, cz + (k - 1.5) * 2);
    step(secs(4));
  }
  const b = maxBoss;
  // c) Pushed hard (the corner rescue) and teleported right out (cave mouth, gateway, beyond the rocks).
  boss.state = S.CHASE;
  boss.rescueRecover(cx, cz, 40);
  const pushed = fromCentre(boss.position);
  let worst = 0;
  for (const [x, z] of [[cx - 30, cz], [cx + 30, cz], [cx, cz + 30], [cx - 22, cz + 1], [cx + 24, cz - 3]]) {
    boss.position.set(x, 0, z); boss.state = S.CHASE; boss.stateTime = 0;
    step(1);
    worst = Math.max(worst, fromCentre(boss.position));
  }
  // d) A long random fight: the hero darting all over (also at the barrier), the boss doing its thing.
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  boss.reset(); boss.state = S.CHASE;
  for (let k = 0; k < 60; k++) {
    const a2 = rnd() * Math.PI * 2, r = 4 + rnd() * 15;
    placeHero(cx + Math.cos(a2) * r, cz + Math.sin(a2) * r);
    step(secs(1), { input: { moveX: rnd() * 2 - 1, moveY: rnd() * 2 - 1, jumpPressed: false }, yaw: rnd() * 6 });
  }
  check(a <= BC.arenaRadius + 1e-6, `chasing a hero outside the barrier it stops at its leash (≤ ${a.toFixed(2)} of ${BC.arenaRadius})`);
  check(b <= BC.arenaRadius + 1e-6, `charging at the barrier 4 times: never past its leash (${b.toFixed(2)})`);
  check(pushed <= BC.arenaRadius + 1e-6 && worst <= BC.arenaRadius + 1e-6, `a big rescue push (${pushed.toFixed(2)}) and teleports out of the arena (${worst.toFixed(2)}) clamped back to the leash`);
  check(maxBoss <= BC.arenaRadius + 1e-6 && boss.stats.slams + boss.stats.fires + boss.stats.charges > 5,
    `60 s of random fighting (${boss.stats.slams} slams, ${boss.stats.fires} fires, ${boss.stats.charges ?? 0} charges): the boss never further than ${maxBoss.toFixed(2)} ≤ arenaRadius ${BC.arenaRadius} (barrier at ${CV.radius}, cave behind it)`);
  const girlD = fromCentre(boss.girl.position);
  check(girlD > BC.arenaRadius + boss.radius && boss.girl.visible, `Amy watches from her corner ${girlD.toFixed(1)} from the centre, beyond the boss's reach (${(BC.arenaRadius + boss.radius).toFixed(1)})`);
}

// 4) The fire burns the horse: a health bar only once hurt; at 0 it bolts and fades.
const burnHorse = () => {
  const toCentre = { x: cx - horse.position.x, z: cz - horse.position.z };
  const l = Math.hypot(toCentre.x, toCentre.z);
  const ux = toCentre.x / l, uz = toCentre.z / l;
  placeHero(horse.position.x + ux * 1.2, horse.position.z + uz * 1.2);
  boss.position.set(horse.position.x + ux * 7.5, 0, horse.position.z + uz * 7.5);
  boss.facing = Math.atan2(-ux, -uz);
  boss.state = S.FIRE_WINDUP; boss.stateTime = 0;
  step(secs(BC.fire.windup + BC.fire.duration + 0.1), { each: () => { if (boss.state !== S.FIRE_WINDUP && boss.state !== S.FIRE) return false; } });
};
{
  boss.reset(); boss.state = S.RECOVER;
  check(!arena.healthBar.visible && arena.horseHealth === AR.horseMaxHealth, 'the horse unhurt: no health bar');
  burnHorse();
  const after = arena.horseHealth;
  check(after < AR.horseMaxHealth && after > 0 && (AR.horseMaxHealth - after) % AR.horseFireDamage === 0 && arena.healthBar.visible,
    `the fire burns the horse: ${AR.horseMaxHealth} → ${after} (${AR.horseFireDamage} per tick), the health bar shown`);
  let n = 0;
  while (!horse.fled && n++ < 6) { burnHorse(); step(secs(AR.flee.time + 0.2)); }
  check(horse.fled && !horse.model.visible && !arena.healthBar.visible && !horse.canMount(hero) && sound.counts.horseFlee === 1,
    `at 0 it bolts and fades out of sight (fled, hidden, no bar, can't be mounted)`);
}

// 5) Dying in the sealed fight: a respawn is used and AJ revives inside the arena — full hearts,
//    every ability refilled, protected for a few seconds with a golden glow while the boss backs
//    off to the far side; the boss regains only half the damage dealt; Amy's glow drifts to him.
{
  check(arena.sealed, 'the fight is sealed');
  boss.reset(); boss.state = S.CHASE; boss.stateTime = 0;
  boss.hp = boss.maxHp * 0.4; // (AJ has dealt 60%)
  const hpBefore = boss.hp;
  gems.counts.yellow = gems.counts.blue = gems.counts.pink = 0;
  abilities.energy = 0.2; // (the Flash bar mid-reload)
  placeHero(arena.lineX + 3, cz); // (wherever he fell)
  const respawns = lives.respawns;
  god = false;
  lives.damage(lives.hearts); // dead
  const r = lives.resolveDeath();
  abilities.clear(); combat.reset(); // (main, before the revive)
  arena.reviveHero();
  const girl0 = boss.girl.position.clone();
  check(r === 'respawn' && lives.respawns === respawns - 1, `a respawn is used as before (${respawns} → ${lives.respawns})`);
  check(lives.hearts === lives.maxHearts, `revived with full hearts (${lives.hearts} of ${lives.maxHearts}), not the last heart`);
  const want = boss.maxHp - (boss.maxHp - hpBefore) * (1 - AR.bossReviveRecoverFraction);
  check(boss.hp > hpBefore && boss.hp < boss.maxHp && Math.abs(boss.hp - want) < 0.01,
    `the boss's health above where it was but below full: ${hpBefore} → ${boss.hp} of ${boss.maxHp} (regains ${AR.bossReviveRecoverFraction * 100}% of the damage dealt)`);
  const uses = ['batarang', 'smokeBomb', 'flashMode'].map((a) => abilities.usesLeft(a));
  check(uses.every((u) => u === AR.reviveUses) && gems.counts.yellow === 5 && gems.counts.blue === 25 && gems.counts.pink === 25 && abilities.energy === 1 && abilities.blockReason('flashMode') !== 'reload',
    `gems full: Batarang ${uses[0]}, Smoke ${uses[1]}, Flash ${uses[2]} uses (yellow ${gems.counts.yellow}, blue ${gems.counts.blue}, pink ${gems.counts.pink}); the reload bar full`);
  check(inside(hero.position, 3) && !hero.riding && arena.state === 'closed' && barrierIn(),
    `revived inside the arena at (${hero.position.x.toFixed(1)}, ${hero.position.z.toFixed(1)}), on foot; the barrier still shut`);
  check(!horse.fled && horse.model.visible && arena.horseHealth === AR.horseMaxHealth && horse.position.x > arena.lineX, 'the horse back at its spot inside, whole');
  // Protected for arenaReviveProtection: no hurt, a golden glow; the boss backs away, then resumes.
  const P = AR.arenaReviveProtection;
  const hero0 = hero.position.clone();
  let hurt = 0, attacked = false, minGap = Infinity, glowOn = true, glowSeen = false, glowAtEnd = Infinity;
  let t = 0;
  step(secs(P - 0.05), { each: () => {
    t += dt;
    // (every kind of blow tried on him while protected)
    if (Math.round(t / dt) % 20 === 0) boss.events.onHitHero(1, boss.position.x, boss.position.z);
    if (hero.invincible !== true) hurt++;
    if (![S.RECOVER].includes(boss.state)) attacked = true;
    minGap = Math.min(minGap, Math.hypot(boss.position.x - hero.position.x, boss.position.z - hero.position.z));
    const em = (hero.model.userData.mats ?? []).some((m) => m.emissiveIntensity > 0.05);
    if (!em && hero.reviveShield > AR.reviveGlow.fadeOut) glowOn = false; // (it fades out over the last fadeOut s)
    if (arena.amyGlow.visible) glowSeen = true;
    if (t > AR.amyGlow.time - 0.05 && t < AR.amyGlow.time + 0.05) {
      const m0 = arena.amyGlow.userData.motes[0].position;
      glowAtEnd = Math.hypot(m0.x - hero.position.x, m0.z - hero.position.z);
    }
  } });
  const farX = cx - ((hero0.x - cx) / Math.hypot(hero0.x - cx, hero0.z - cz)) * BC.arenaRadius * AR.farSide;
  const farZ = cz - ((hero0.z - cz) / Math.hypot(hero0.x - cx, hero0.z - cz)) * BC.arenaRadius * AR.farSide;
  const toFar = Math.hypot(boss.position.x - farX, boss.position.z - farZ);
  check(hurt === 0 && lives.hearts === lives.maxHearts, `protected for ${P} s: blows land on nothing (hearts ${lives.hearts})`);
  check(glowOn, 'a soft golden glow on him the whole time (fading out at the end)');
  check(!attacked && toFar < 1.5 && minGap > 10, `the boss backs away to the far side (${toFar.toFixed(1)} from it, never nearer than ${minGap.toFixed(1)} to him), no attacks`);
  check(glowSeen && glowAtEnd < 1 && boss.girl.position.distanceTo(girl0) < 1e-6,
    `Amy's golden glow drifts from her corner to him in ~${AR.amyGlow.time} s (${glowAtEnd.toFixed(2)} from him then); she stays put`);
  step(secs(0.3));
  const wasInv = hero.invincible;
  step(secs(1.5));
  check(!wasInv && !hero.reviveShield && boss.state !== S.RECOVER && boss.state !== S.GUARD && arena.sealed,
    `after ${P} s: protection over (glow gone), the boss fights on (${boss.state})`);
  god = true;
}

// 5b) The boss's slow regen in the sealed fight: after bossRegenDelay s with no hit it heals
//     bossRegenPercentPerSec % of its max a second; any hit stops it at once; paused while
//     paralysed; never above max; none outside the sealed fight.
{
  god = true;
  const calm = () => { boss.state = S.RECOVER; boss.stateTime = 0; boss.recoverFor = 1e9; boss.retreat = null; };
  boss.reset(); calm();
  placeHero(cx - 12, cz);
  boss.hp = 60;
  boss.takeHit({ amount: 1, source: 'batarang' });
  const hit0 = boss.hp;
  step(secs(AR.bossRegenDelay - 0.1));
  const waited = boss.hp;
  check(arena.sealed && waited === hit0 && !boss.regenerating, `no regen during the ${AR.bossRegenDelay} s wait after a hit (${hit0} → ${waited})`);
  step(secs(0.2));
  const startedAt = boss.hp;
  step(secs(2));
  const rate = ((boss.hp - startedAt) / 2 / boss.maxHp) * 100;
  check(boss.regenerating && Math.abs(rate - AR.bossRegenPercentPerSec) < 0.05,
    `then it regenerates at ${rate.toFixed(2)}% of its max health a second (bossRegenPercentPerSec ${AR.bossRegenPercentPerSec}; ~${Math.round(100 / AR.bossRegenPercentPerSec)} s empty to full), the bar flagged (regenerating)`);
  const beforeHit = boss.hp;
  boss.takeHit({ amount: 1, flash: false, source: 'melee' });
  const afterHit = boss.hp;
  check(!boss.regenerating && afterHit < beforeHit, `a hit stops it instantly (${beforeHit.toFixed(2)} → ${afterHit.toFixed(2)}, not regenerating)`);
  step(secs(AR.bossRegenDelay - 0.1));
  check(boss.hp === afterHit, `...and restarts the wait: unchanged for the next ${AR.bossRegenDelay - 0.1} s (${boss.hp.toFixed(2)})`);
  step(secs(1));
  check(boss.hp > afterHit && boss.regenerating, `then it heals again (${boss.hp.toFixed(2)})`);
  // Paused while paralysed by the Smoke.
  boss.paralyze(4);
  const para0 = boss.hp;
  step(secs(2));
  check(boss.state === S.PARALYZED && boss.hp === para0 && !boss.regenerating, `paused while paralysed (${para0.toFixed(2)} → ${boss.hp.toFixed(2)})`);
  step(secs(2.5)); calm();
  step(secs(1));
  check(boss.hp > para0, `resumes after the paralysis (${boss.hp.toFixed(2)})`);
  // Never above max.
  boss.hp = boss.maxHp - 0.5;
  step(secs(3));
  check(boss.hp === boss.maxHp && !boss.regenerating, `never above max (${boss.hp} of ${boss.maxHp}, regen stopped)`);
  // None outside the sealed fight (forest arena before the barrier, desert, cutscenes: regenEnabled off).
  const saved = arena.state;
  arena.state = 'open';
  boss.hp = 50; boss.sinceHit = 99;
  step(secs(2));
  check(!arena.sealed && boss.hp === 50 && !boss.regenerating, `outside the sealed fight: no regen (${boss.hp})`);
  arena.state = saved;
  boss.reset();
}

// 6) Flash in the sealed arena: no hearts spent, usable on his last heart and below 2 hearts.
{
  const fire = (hearts, label) => {
    boss.reset(); boss.state = S.RECOVER; boss.stateTime = 0;
    placeHero(cx - 6, cz); hero.facing = Math.PI / 2;
    boss.position.set(cx + 1, boss.position.y, cz);
    lives.setHearts(hearts);
    abilities.clear(); abilities.energy = 1;
    gems.counts.pink = abilityGemCost('flashMode');
    step(1);
    const why = abilities.blockReason('flashMode');
    const hp = boss.hp;
    const used = abilities.use('flashMode');
    let minHearts = lives.hearts;
    step(secs(FM.chargeTime) + 30, { each: () => { minHearts = Math.min(minHearts, lives.hearts); if (boss.state !== S.DYING) { boss.state = S.RECOVER; boss.stateTime = 0; } } });
    check(why === null && used && lives.hearts === hearts && minHearts === hearts && hero.redFlicker <= 0 && Math.abs(hp - boss.hp - boss.maxHp * FM.damageFraction) < 1e-6 && gems.counts.pink === 0,
      `${label}: Flash fires (blocked: ${why}), hearts stay ${hearts} (lowest ${minHearts}), no red flicker, the bolt still ${hp - boss.hp} (${FM.damageFraction * 100}%), 5 pink spent`);
  };
  god = true;
  check(arena.sealed && FM.flashHeartCostInArena === 0 && FM.flashMinHeartsInArena === 0, `arena settings: flashHeartCostInArena ${FM.flashHeartCostInArena}, flashMinHeartsInArena ${FM.flashMinHeartsInArena}`);
  fire(1, 'last heart');
  fire(0.5, 'half a heart');
  fire(1.5, '1.5 hearts');
  // Still limited by the pink gems and the reload bar.
  lives.setHearts(1);
  abilities.clear(); // (the last strike over)
  gems.counts.pink = 0; abilities.energy = 1;
  const noGems = abilities.blockReason('flashMode');
  gems.counts.pink = 5; abilities.energy = 0.5;
  const reloading = abilities.blockReason('flashMode');
  check(noGems === 'gems' && reloading === 'reload' && abilities.usesLeft('flashMode') === 1, `in the arena still blocked by no pink gems (${noGems}) and the reload bar (${reloading})`);
  // Outside the arena: exactly as before.
  abilities.inSealedArena = false;
  abilities.energy = 1;
  const low = abilities.blockReason('flashMode');
  lives.setHearts(5);
  const cost = abilities.flashHeartCost;
  check(low === 'health' && cost === lives.maxHearts * FM.flashHeartCostPct, `outside the arena unchanged: blocked on 1 heart (${low}), costs ${cost} hearts`);
  abilities.inSealedArena = arena.sealed;
}

// 7) The boss dies → the barrier opens (rumble) → the fled horse comes back to AJ.
{
  boss.reset(); boss.state = S.RECOVER;
  let n = 0;
  while (!horse.fled && n++ < 6) { burnHorse(); step(secs(AR.flee.time + 0.2)); }
  check(horse.fled, 'the horse bolted again');
  placeHero(cx - 8, cz + 2);
  boss.kill();
  const D = BC.dying;
  let openedAt = -1, t = 0;
  step(secs(D.stumble + D.fall + D.fade + AR.openTime + 0.3), { each: () => { t += dt; if (openedAt < 0 && arena.state === 'open') openedAt = t; } });
  check(boss.defeated && arena.state === 'open' && barrierOut() && arena.model.userData.rocks.every((r) => !r.visible) && sound.counts.barrierRumble === 2 && !arena.sealed,
    `the boss dead → the barrier sinks (rumble ${sound.counts.barrierRumble}) and the way out is open after ${openedAt.toFixed(1)} s`);
  check(boss.girl.visible && boss.girl.scale.x === 1, 'Amy is still there (no re-appearing)');
  let near = -1; t = 0;
  step(secs(AR.comeBack.maxTime), { each: () => { t += dt; if (near < 0 && !arena.horseTask && Math.hypot(horse.position.x - hero.position.x, horse.position.z - hero.position.z) < AR.comeBack.stop + 0.5) near = t; } });
  check(!horse.fled && horse.model.visible && near > 0 && horse.canMount(hero) && arena.horseHealth === AR.horseMaxHealth,
    `the horse came back to him by itself in ${near.toFixed(1)} s (mountable, health full)`);
}

// 8) Reset and the debug "Boss fight" jump.
{
  arena.reset(); boss.reset();
  check(arena.state === 'open' && barrierOut() && !boss.girlWatching, 'reset: the entrance open, Amy hidden until the boss is beaten');
  arena.sealNow();
  check(arena.state === 'closed' && barrierIn() && inside(hero.position, 3) && horse.position.x > arena.lineX && arena.sealed && boss.girlWatching,
    'sealNow (test menu "Boss fight"): AJ inside, the barrier shut, the horse by the entrance, Amy watching');
  arena.reset();
}

console.log(failed ? '\nARENA TEST FAILED' : '\nARENA TEST PASSED');
process.exit(failed ? 1 : 0);
