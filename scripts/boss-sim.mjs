// Boss fight simulation: a bot "player" fights the cave monster with the real game code (hero,
// combat, abilities, lives, boss) and reports how long the fight takes, hearts lost, deaths and
// where the damage came from. Several skill profiles, several seeded fights each.
// Usage: npm run sim:boss   (HERO_PLACEHOLDER=1 by default here: same logic, faster)
//        SIM_RUNS=20 npm run sim:boss
process.env.HERO_PLACEHOLDER ??= '1';
const { heroAssets } = await import('./node-assets.mjs');
const THREE = await import('three');
const { CONFIG } = await import('../src/config.js');
const { World } = await import('../src/world.js');
const { Hero } = await import('../src/hero.js');
const { Combat } = await import('../src/combat.js');
const { Abilities } = await import('../src/abilities.js');
const { Lives } = await import('../src/lives.js');
const { Boss, BOSS_STATES: S } = await import('../src/boss.js');

// SIM_SET='{"boss":{"recover":1}}' overrides CONFIG values for a what-if run.
const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) { if (v && typeof v === 'object' && !Array.isArray(v)) merge(dst[k], v); else dst[k] = v; } };
if (process.env.SIM_SET) merge(CONFIG, JSON.parse(process.env.SIM_SET));
const BC = CONFIG.boss, CV = CONFIG.cave, CB = CONFIG.combat, AB = CONFIG.abilities, dt = 1 / 60;
const [cx, cz] = CV.center;
const RUNS = Number(process.env.SIM_RUNS ?? 10);
const MAX_TIME = 900;

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const log = [];
const combat = new Combat(scene, hero, { onHit: (e) => log.push(e) }); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
const lives = new Lives();
abilities.lives = lives;
let heroHit = null;
const boss = new Boss(scene, world, { onHitHero: (n, x, z, o) => heroHit?.(n, x, z, o) }, heroAssets);
await boss.init();
combat.addTarget(boss);

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
const PROFILES = {
  'decent (uses everything)': { skill: 0.8, reaction: 0.32, jitter: 0.12, flashHearts: 3, abilities: true },
  'decent, melee only': { skill: 0.8, reaction: 0.32, jitter: 0.12, abilities: false },
  'strong (uses everything)': { skill: 0.93, reaction: 0.24, jitter: 0.08, flashHearts: 2.5, abilities: true },
};

function fight(P, seed) {
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
    if (hero.invincible) return;
    hero.hurt(x, z, o.knockback !== false, o.source !== 'fire');
    heartsLost += Math.min(n, lives.hearts);
    lives.damage(n);
  };
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
    if (plan && !plan.done && boss.stateTime >= plan.at) {
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
    t += dt;
    if (lives.hearts <= 0) {
      // Dead: a respawn (the ride back from the checkpoint isn't counted) and the boss resets.
      deaths++;
      lives.resolveDeath();
      lives.setHearts(lives.maxHearts);
      boss.onHeroRespawn();
      abilities.clear();
      combat.reset();
      enter();
      attempt = t;
      log.length = 0;
    }
  }
  const by = {};
  for (const e of log) by[e.flash ? 'flash' : e.source] = (by[e.flash ? 'flash' : e.source] ?? 0) + e.amount;
  return { time: t, winTime: t - attempt, deaths, heartsLost, won: boss.state === S.DEAD, by, stats: Object.fromEntries(Object.entries(boss.stats).map(([k, v]) => [k, v - (stats0[k] ?? 0)])), gemsLeft: { ...gems.counts } };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log('Numbers used:');
console.log(`  AJ drawn ${CONFIG.heroModel.height} tall; boss ${BC.height} tall (${(BC.height / CONFIG.heroModel.height).toFixed(2)}x AJ), radius ${BC.radius}, ${BC.hp} HP`);
console.log(`  hero melee reach ${CB.combo.map((c) => c.reach).join(' / ')} from the boss's edge; lunge ${CB.lunge} over ${CB.lungeTime}s (stops ${CB.lungeStop} short)`);
console.log(`  damage to the boss: melee ${BC.hitPct.melee * 100}% per hit, Batarang ${BC.hitPct.batarang * 100}%, Flash ${BC.hitPct.flash * 100}% (reload ${AB.flashMode.flashReloadSeconds}s, costs ${AB.flashMode.flashHeartCostPct * 100}% hearts + ${AB.flashMode.gemCost} pink)`);
console.log(`  Smoke on the boss: ${BC.paralysis.duration}s paralysis, x${BC.paralysis.bonus} damage, then ${BC.paralysis.resist}s resistance; stunned x${BC.stunnedBonus}`);
console.log(`  boss pacing: recover ${BC.recover}s (melee ${BC.melee.recover}s); phase 2 below ${BC.enrageAt * 100}%: wind-ups x${BC.enrageTime}, recoveries x${BC.enrageRecover}, walk x${BC.enrageWalk}, up-close slam ${BC.enrageSlamChance * 100}%`);
console.log(`  bot gems at the boss: 20 of each colour; runs per profile: ${RUNS}\n`);
for (const [name, P] of Object.entries(PROFILES)) {
  const res = [];
  for (let i = 0; i < RUNS; i++) res.push(fight(P, 1000 + i * 7919));
  const times = res.map((r) => r.time).sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
  const share = {};
  for (const r of res) for (const [k, v] of Object.entries(r.by)) share[k] = (share[k] ?? 0) + v / res.length;
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  console.log(`${name}: median ${fmt(med)} (range ${fmt(times[0])}–${fmt(times.at(-1))}), won ${res.filter((r) => r.won).length}/${res.length}`);
  console.log(`  game over (more than ${CONFIG.lives.respawns} deaths) in ${res.filter((r) => r.deaths > CONFIG.lives.respawns).length}/${res.length}; deaths ${avg((r) => r.deaths).toFixed(1)}, hearts lost ${avg((r) => r.heartsLost).toFixed(1)}, last attempt ${fmt(avg((r) => r.winTime))}`);
  console.log(`  damage share (winning attempt): ${Object.entries(share).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(', ')}`);
  console.log(`  boss attacks per fight: melee ${avg((r) => r.stats.melees).toFixed(0)}, slams ${avg((r) => r.stats.slams).toFixed(0)}, fire ${avg((r) => r.stats.fires).toFixed(0)}, charges ${avg((r) => r.stats.charges).toFixed(0)}, stuns ${avg((r) => r.stats.stuns).toFixed(1)}, cracks ${avg((r) => r.stats.cracks ?? 0).toFixed(1)}\n`);
}
process.exit(0);
