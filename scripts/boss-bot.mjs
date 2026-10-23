// The boss-fight bot shared by the simulation (boss-sim.mjs) and the minion test: a "player"
// with a reaction delay and a dodge success rate fighting the boss with the real game code.
import { CONFIG, abilityGemCost } from '../src/config.js';
import { BOSS_STATES as S } from '../src/boss.js';

const BC = CONFIG.boss, CV = CONFIG.cave, CB = CONFIG.combat, AB = CONFIG.abilities, dt = 1 / 60;
const [cx, cz] = CV.center;
const MAX_TIME = 900;

// Seeded random numbers (the boss's choices and the bot's reactions).
const mulberry = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Bot profiles. skill: chance of reacting correctly to a telegraphed attack; reaction: seconds
 * (± jitter) before it reacts; flashHearts: only Flashes with at least this many hearts;
 * abilities: uses Batarang / Smoke / Flash; greed: keeps attacking this long into a wind-up.
 */
export const PROFILES = {
  'decent (uses everything)': { skill: 0.8, reaction: 0.32, jitter: 0.12, flashHearts: 3, abilities: true },
  'decent, melee only': { skill: 0.8, reaction: 0.32, jitter: 0.12, abilities: false },
  'strong (uses everything)': { skill: 0.93, reaction: 0.24, jitter: 0.08, flashHearts: 2.5, abilities: true },
};

/**
 * A fight runner for these systems. With `minions`, the boss's slam cracks spawn slimes (as in
 * main.js), they hit the hero, a death clears them, and the boss's death melts them.
 */
export function makeFight({ world, hero, combat, abilities, lives, boss, log, minions = null }) {
  let heroHit = null;
  return function fight(P, seed) {
    // (hooks set per fight: several runners can share the same boss)
    boss.events.onHitHero = (n, x, z, o) => heroHit?.(n, x, z, o);
    boss.events.onCrack = minions ? (at) => minions.slimesFromCrack(at, boss.enraged) : undefined;
    boss.events.onDefeat = minions ? () => minions.despawnSlimes() : undefined;
    if (minions) minions.deps.onHitHero = (n, x, z, o) => heroHit?.(n, x, z, o);
  const rng = mulberry(seed);
  boss.random = rng;
  boss.reset();
  lives.reset();
  abilities.clear();
  combat.reset();
  const gems = { counts: { yellow: 20, blue: 20, pink: 20 }, spend(c, n) { if (this.counts[c] < n) return false; this.counts[c] -= n; return true; } };
  abilities.gems = P.abilities ? gems : { counts: { yellow: 0, blue: 0, pink: 0 }, spend: () => false };
  const enter = () => {
    const x = cx - CV.radius + 3, z = cz;
    hero.riding = false;
    hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
    hero.facing = Math.PI / 2; hero.iframes = 0; hero.hurtT = 0;
  };
  enter();
  log.length = 0;
  const stats0 = { ...boss.stats };
  let t = 0, deaths = 0, heartsLost = 0, attempt = 0, plan = null, lastState = null, lastId = 0;
  const stateCount = {};
  heroHit = (n, x, z, o = {}) => {
    if (hero.invincible) return false;
    hero.hurt(x, z, o.knockback !== false, o.source !== 'fire');
    heartsLost += Math.min(n, lives.hearts);
    lives.damage(n);
    return true;
  };
  minions?.clear();
  const slimes0 = minions ? minions.stats.spawned.slime : 0;
  while (t < MAX_TIME && boss.state !== S.DEAD) {
    const st = boss.state;
    if (st !== lastState || boss.stats.melees + boss.stats.slams + boss.stats.fires + boss.stats.charges !== lastId) {
      lastId = boss.stats.melees + boss.stats.slams + boss.stats.fires + boss.stats.charges;
      if (st !== lastState) stateCount[st] = (stateCount[st] ?? 0) + 1;
      lastState = st;
      // A telegraphed attack: plan a reaction (or a miss).
      const P2 = boss.pace;
      const at = {
        [S.MELEE_WINDUP]: 0, [S.SLAM_WINDUP]: 0,
        [S.FIRE_WINDUP]: CONFIG.boss.fire.windup * P2 - 0.45, // read the cone, roll as it locks
        [S.CHARGE_WINDUP]: BC.charge.windup * P2 - 0.45,
      }[st];
      plan = at === undefined ? null : { at: Math.max(0, at) + P.reaction + (rng() * 2 - 1) * P.jitter, ok: rng() < P.skill, done: false };
    }
    const dx = boss.position.x - hero.position.x;
    const dz = boss.position.z - hero.position.z;
    const dist = Math.hypot(dx, dz);
    const edge = dist - boss.radius;
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    const input = { moveX: 0, moveY: 0, jumpPressed: false, attackPressed: false, dodgePressed: false };
    const go = (x, z) => { input.moveX = x; input.moveY = -z; }; // (camera yaw 0)
    // Slimes (if any): a decent player rolls away from a slime's lunge and clears the ones that
    // get close while the boss isn't attacking.
    const slimes = minions ? minions.list.filter((m) => m.alive && m.type === 'slime') : [];
    const near = slimes.map((m) => ({ m, d: Math.hypot(m.position.x - hero.position.x, m.position.z - hero.position.z) - m.radius })).sort((a, b) => a.d - b.d)[0];
    if (near && near.m.state === 'attack' && near.d < 1.6 && !near.m.botSeen) {
      near.m.botSeen = { at: P.reaction + (rng() * 2 - 1) * P.jitter, ok: rng() < P.skill };
    }
    const lunge = slimes.find((m) => m.botSeen && m.state === 'attack' && m.stateTime >= m.botSeen.at && !m.botSeen.done);
    if (lunge) {
      lunge.botSeen.done = true;
      if (lunge.botSeen.ok && (!plan || plan.done)) {
        const sx = hero.position.x - lunge.position.x, sz = hero.position.z - lunge.position.z, sl = Math.hypot(sx, sz) || 1;
        go(sx / sl, sz / sl);
        input.dodgePressed = true;
      }
    } else if (near && near.m.state !== 'attack' && near.m.botSeen) near.m.botSeen = null;
    const bossBusy = plan && !plan.done;
    if (!input.dodgePressed && near && near.d < 2.2 && !bossBusy && combat.step < 0) {
      hero.facing = Math.atan2(near.m.position.x - hero.position.x, near.m.position.z - hero.position.z); // (lock-on picks it)
      input.attackPressed = true;
    } else if (input.dodgePressed) {
      // (rolled away from a slime)
    } else if (plan && !plan.done && boss.stateTime >= plan.at) {
      plan.done = true;
      if (plan.ok) {
        // Roll out: away from melee / slam, sideways across fire and charges.
        const side = rng() < 0.5 ? 1 : -1;
        if (st === S.MELEE_WINDUP || st === S.SLAM_WINDUP) go(-ux * 0.8 + -uz * side * 0.6, -uz * 0.8 + ux * side * 0.6);
        else go(-uz * side, ux * side);
        input.dodgePressed = true;
      }
    } else if (!plan || plan.done) {
      const open = st === S.RECOVER || st === S.STUNNED || st === S.PARALYZED || st === S.CHASE || st === S.GUARD;
      const used = (n) => abilities.use(n);
      if (P.abilities && open && st !== S.GUARD) {
        // Flash whenever it's ready and he can afford the hearts with a margin.
        if (abilities.flashReady && lives.hearts >= P.flashHearts) used('flashMode');
        // Smoke while it's recovering and close enough to lob it on.
        else if (st === S.RECOVER && dist < AB.smokeBomb.throwRange && !boss.resistsParalysis() && abilities.ready('smokeBomb')) used('smokeBomb');
        // Batarang from range.
        else if (edge > 3 && abilities.ready('batarang')) used('batarang');
      }
      if (open) {
        if (edge > CB.combo[0].reach * 0.7) go(ux, uz);
        else if (st !== S.GUARD && combat.step < 0) input.attackPressed = true; // keep the combo going
      }
    }
    hero.update(dt, input, 0);
    combat.update(dt, input, {});
    abilities.update(dt);
    boss.update(dt, hero);
    minions?.update(dt, { playing: true, riding: false, route: 'forest', pitDone: false, galloping: false });
    t += dt;
    if (lives.hearts <= 0) {
      // Dead: a respawn inside the sealed arena (arena.reviveHero): full hearts, every ability
      // refilled, a few seconds' protection while the boss backs off and regains only part of
      // the damage dealt.
      const AR = CONFIG.arena;
      deaths++;
      lives.resolveDeath();
      lives.setHearts(lives.maxHearts);
      minions?.clear();
      abilities.clear();
      combat.reset();
      enter();
      for (const [color, ability] of Object.entries(CONFIG.gems.abilities)) gems.counts[color] = Math.max(gems.counts[color] ?? 0, AR.reviveUses * abilityGemCost(ability));
      hero.protectFor(AR.arenaReviveProtection);
      const ux = hero.position.x - CV.center[0], uz = hero.position.z - CV.center[1], ul = Math.hypot(ux, uz) || 1;
      const far = BC.arenaRadius * AR.farSide;
      boss.reviveRecover(AR.bossReviveRecoverFraction, CV.center[0] - (ux / ul) * far, CV.center[1] - (uz / ul) * far, AR.arenaReviveProtection);
      attempt = t;
      log.length = 0;
    }
  }
  const by = {};
  for (const e of log) by[e.flash ? 'flash' : e.source] = (by[e.flash ? 'flash' : e.source] ?? 0) + e.amount;
  return { time: t, winTime: t - attempt, deaths, heartsLost, won: boss.state === S.DEAD, by, stats: Object.fromEntries(Object.entries(boss.stats).map(([k, v]) => [k, v - (stats0[k] ?? 0)])), gemsLeft: { ...gems.counts }, slimes: minions ? minions.stats.spawned.slime - slimes0 : 0 };
  };
}

