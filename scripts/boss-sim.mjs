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
const { Boss } = await import('../src/boss.js');
const { Minions } = await import('../src/minions.js');
const { PROFILES, makeFight } = await import('./boss-bot.mjs');

// SIM_SET='{"boss":{"recover":1}}' overrides CONFIG values for a what-if run.
const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) { if (v && typeof v === 'object' && !Array.isArray(v)) merge(dst[k], v); else dst[k] = v; } };
if (process.env.SIM_SET) merge(CONFIG, JSON.parse(process.env.SIM_SET));
const BC = CONFIG.boss, CV = CONFIG.cave, CB = CONFIG.combat, AB = CONFIG.abilities, dt = 1 / 60;
const RUNS = Number(process.env.SIM_RUNS ?? 10);

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
const boss = new Boss(scene, world, {}, heroAssets);
await boss.init();
combat.addTarget(boss);
const fight = makeFight({ world, hero, combat, abilities, lives, boss, log });
// The same fight with the boss's slimes (2 per slam crack, 3 below 50% HP).
const minions = new Minions(scene, world, { hero, horse: null, combat, abilities, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder });
await minions.ready('slime');
const fightSlimes = makeFight({ world, hero, combat, abilities, lives, boss, log, minions });
const fights = { ...Object.fromEntries(Object.keys(PROFILES).map((k) => [k, fight])), 'decent, with slimes': fightSlimes };
PROFILES['decent, with slimes'] = PROFILES['decent (uses everything)'];

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
  for (let i = 0; i < RUNS; i++) res.push(fights[name](P, 1000 + i * 7919));
  const times = res.map((r) => r.time).sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
  const share = {};
  for (const r of res) for (const [k, v] of Object.entries(r.by)) share[k] = (share[k] ?? 0) + v / res.length;
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  console.log(`${name}: median ${fmt(med)} (range ${fmt(times[0])}–${fmt(times.at(-1))}), won ${res.filter((r) => r.won).length}/${res.length}`);
  console.log(`  game over (more than ${CONFIG.lives.respawns} deaths) in ${res.filter((r) => r.deaths > CONFIG.lives.respawns).length}/${res.length}; deaths ${avg((r) => r.deaths).toFixed(1)}, hearts lost ${avg((r) => r.heartsLost).toFixed(1)}, last attempt ${fmt(avg((r) => r.winTime))}`);
  console.log(`  damage share (winning attempt): ${Object.entries(share).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(', ')}`);
  console.log(`  boss attacks per fight: melee ${avg((r) => r.stats.melees).toFixed(0)}, slams ${avg((r) => r.stats.slams).toFixed(0)}, fire ${avg((r) => r.stats.fires).toFixed(0)}, charges ${avg((r) => r.stats.charges).toFixed(0)}, stuns ${avg((r) => r.stats.stuns).toFixed(1)}, cracks ${avg((r) => r.stats.cracks ?? 0).toFixed(1)}, slimes ${avg((r) => r.slimes).toFixed(1)}\n`);
}
process.exit(0);
