// Smoke test: the Lightning and Steam levels (fire.js with elementLevels.js laid over it, zaps.js, the Spark Chain and Steam Gust).
// Usage: npm run test:elements   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { GameState, STATES } from '../src/state.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { FollowCamera } from '../src/camera.js';
import { Cinematic } from '../src/cinematic.js';
import { Sound } from '../src/audio.js';
import { characterBodies } from '../src/fade.js';
import { LevelManager } from '../src/levelManager.js';
import { Lives } from '../src/lives.js';

const P2 = CONFIG.part2, F = P2.fire, D2 = DIALOGUE.part2, FD = D2.fire, CS = F.weapons.cogShot, GW = F.weapons.gearWheel;
globalThis.innerWidth = 915;
globalThis.innerHeight = 412;
const dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

const world = new World(); await world.init();
const hero = new Hero(world.scene, world, heroAssets); await hero.init();
const sound = new Sound();
const played = [];
const play0 = sound.play.bind(sound);
sound.play = (name, detail = {}) => { played.push({ name, ...detail }); return play0(name, detail); };
const horse = new Horse(world.scene, world, heroAssets); horse.sound = sound; await horse.init();
const cam = new FollowCamera(20 / 9, world);
const state = new GameState(STATES.PLAY);
const view = { lines: [], complete: false, show() {}, hide() {}, dialogue(s, t, c) { if (c && !this.complete) this.lines.push(`${s}: ${t}`); this.complete = c; }, clearDialogue() { this.complete = false; } };
const cinematic = new Cinematic(cam, view);
cinematic.bodies = characterBodies({ hero, girlModel: new THREE.Group(), horse });
const ui = {
  quest: null, dist: null, toasts: [], banners: [], numbers: [], keys: null, elements: [], boss: null, flashes: 0,
  banner(t) { this.banners.push(t); },
  damageNumber(x, y, text) { this.numbers.push({ x, y, text }); },
  toast(t) { this.toasts.push(t); }, setQuest(t, d) { this.quest = t; this.dist = d; }, fadeOut(ms, then) { return then(); }, fadeIn() {},
  showGems() {}, setHorseEnergy() {}, setGears(count, total, show, pulse, tiers, showTotal) { this.gears = { count, total, show, tiers, showTotal }; }, screenFlash() { this.flashes++; },
  setBossBar(on, frac, name, regen) { this.boss = { on, frac, name, regen }; },
  setCogKeys(n, show) { this.keys = { n, show }; },
  setElements(list, show) { this.elements = [...list]; this.elementsShown = show; },
  setLevel(t) { this.levelText = t; },
  setWand(n, icon) { this.wand = { n, icon }; },
};
let held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false, ability: null };
const input = {
  enabled: true, setEnabled(on) { this.enabled = on; }, read: () => ({ ...held, lookDX: 0, lookDY: 0, lookSensitivity: 0 }),
  setCombatButtons(m, ab, hidden) { this.combat = { mounted: m, ab, hidden }; }, setMountButton(on) { this.mountShown = on; }, setDismountButton(on, ok) { this.dismount = { shown: on, ok }; }, setGallopButton(on) { this.gallopShown = on; }, pulseAbility(n) { this.pulsed = n; },
};
const lives = new Lives();
const soundscape = { musicPhase: null };
const hurts = [];
const damageHero = (n, x, z, opts = {}) => {
  if (hero.life !== 'alive' || hero.invincible || state.is(STATES.CUTSCENE)) return false; // (as main.js's damageHero does in Part 2)
  hero.hurt(x, z, opts.knockback !== false, opts.source !== 'fire');
  const dead = lives.damage(n);
  hurts.push({ n, source: opts.source });
  if (dead) levels.current.down?.(); // (Part 2's own downed state)
  return true;
};
const part1 = { id: 'part1', scene: world.scene, enter: () => { for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o); }, exit() {} };
const levels = new LevelManager({
  part1: async () => part1,
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities: null, lives, assets: heroAssets, damageHero }),
});
levels.chapters.set('part1', part1);
levels.current = part1; levels.id = 'part1';
const frame = async () => { levels.current.update(dt, dt, { paused: false }); held.jumpPressed = false; held.ability = null; held.mountPressed = false; await null; };
const run = async (s) => { for (let t = 0; t < s; t += dt) await frame(); };

const count = (name) => played.filter((x) => x.name === name).length;
const seconds = async (t, fn) => { for (let x = 0; x < t; x += dt) { await frame(); if (fn?.()) return true; } return false; };
const { trackPoint } = await import('../src/part2/rideModel.js');
const FIRE0 = { hp: F.fireBossHealth, accent: F.accent, quest: FD.quest };
let p2, fire, track;
const place = (s, lat = 0, { speed = 0, y = 0 } = {}) => {
  fire.ride.stop();
  const pt = trackPoint(track, s, lat, y);
  horse.position.copy(pt.pos); horse.heading = pt.heading; horse.speed = speed; horse.velocity.set(0, 0, 0);
  horse.grounded = y === 0; horse.stumble = horse.stumbleStop = 0; horse.steer = horse.yawRate = 0; horse.galloping = false;
  horse.mode = 'riding'; horse.scripted = false;
};
const waitLevel = async (id, stage = 'ride') => { for (let i = 0; i < 600 && !(p2.lvId === id && p2.fire.stage === stage); i++) { await frame(); await new Promise((r) => setTimeout(r, 25)); } await frame(); };
const dummy = (x, z) => ({ position: new THREE.Vector3(x, 0, z), radius: 0.8, height: 2, alive: true, hp: 4, takeHit(d) { this.hp -= d; return true; } });

// 1) LIGHTNING: the Fire level's machinery with its settings laid over it.
p2 = await levels.load('part2', { start: 'lightning' });
await waitLevel('lightning');
fire = p2.fire; track = fire.world.track;
const FL = CONFIG.part2.fire;
check(p2.at === 'fire' && p2.lvId === 'lightning' && fire.stage === 'ride' && horse.mode === 'riding' && FL.fireBossHealth === 52 && FL.accent === 0x6f6bff && ui.quest === FD.quest && FD.quest === 'Ride to the tesla gate',
  `Lightning starts: the settings are laid over Fire's (boss ${FL.fireBossHealth} HP, accent blue-violet), "${ui.quest}"`);
check(fire.zaps.coils.length === 8 && fire.cfg.saws.length === 0 && fire.items.entries.filter((e) => e.chest).length === 1 && fire.items.entries.filter((e) => e.type === 'cogKey').length === 3,
  `${fire.zaps.coils.length} tesla coils instead of saws and hammers, 1 small chest, ${fire.items.entries.filter((e) => e.type === 'cogKey').length} cog keys`);
{
  // a coil zaps its lane on a timer: half a heart; a jump clears it
  const T = FL.tesla;
  const c = fire.zaps.coils[0];
  const inHold = () => { fire.zaps.time = T.period * 7 + (T.period - T.hold / 2) - c.phase; };
  hurts.length = 0; hero.resetStatus?.(); lives.setHearts(lives.maxHearts);
  place(c.s, c.lat, { y: 3 }); inHold(); await frame(); // (in the air: it passes over)
  const over = hurts.length;
  place(c.s, c.lat); fire.zaps.coils.forEach((q) => (q.cycle = -1)); inHold(); await frame();
  check(over === 0 && hurts.length === 1 && hurts[0].n === T.damage && hurts[0].source === 'zap' && count('saw_hit') >= 1, `a tesla coil's bolt costs half a heart on the ground (${hurts.length} hit), a jump clears it`);
  hero.resetStatus?.();
  place(c.s, c.lat + T.halfWidth + 3); fire.zaps.coils.forEach((q) => (q.cycle = -1)); inHold(); const h0 = hurts.length; await frame();
  check(hurts.length === h0, 'steering out of the lane dodges it');
}
{
  // Spark Chain: unlocked by the Lightning Element; jumps through up to 3 foes
  const ar = fire.arsenal;
  check(!ar.has('sparkChain'), 'no Spark Chain before the Lightning Element');
  p2.elements.push('lightning'); p2.syncUnlocks();
  const foes = [dummy(0, 0), dummy(0, 0), dummy(0, 0), dummy(0, 0)];
  const hp = horse.position;
  place(200, 0);
  const f = [3, 8, 13].map((d, i) => { const x = horse.position.x + Math.sin(horse.heading) * d; const z = horse.position.z + Math.cos(horse.heading) * d; foes[i].position.set(x, 0, z); return foes[i]; });
  foes[3].position.set(hp.x + 60, 0, hp.z + 60);
  const keep = fire.targets; fire.targets = () => foes;
  hero.position.copy(horse.position); hero.facing = horse.heading;
  ar.cooldowns.sparkChain = 0;
  const ok = ar.use('sparkChain');
  check(ok && f.every((q) => q.hp < 4) && foes[3].hp === 4 && ar.cooldowns.sparkChain === FL.sparkChain.cooldown && !ar.use('sparkChain') && ar.blockReason('sparkChain') === 'cooldown', `Spark Chain hits 3 foes in range (${f.map((q) => q.hp).join(', ')}), not the far one, then a ${FL.sparkChain.cooldown} s cooldown`);
  // Steam Gust
  p2.elements.push('steam'); p2.syncUnlocks();
  const near = dummy(horse.position.x + Math.sin(horse.heading) * 4, horse.position.z + Math.cos(horse.heading) * 4);
  fire.targets = () => [near];
  const d0 = near.position.distanceTo(horse.position);
  ar.cooldowns.steamGust = 0;
  const gust = ar.use('steamGust');
  await frame();
  check(gust && near.position.distanceTo(horse.position) > d0 + 4 && horse.glideT > 2 && !horse.grounded && ar.cooldowns.steamGust > 7, `Steam Gust pushes a foe back (${d0.toFixed(1)} → ${near.position.distanceTo(horse.position).toFixed(1)}) and lifts the horse into a glide (${horse.glideT.toFixed(1)} s)`);
  fire.targets = keep;
  p2.elements.length = 0; p2.syncUnlocks(); horse.glideT = 0;
}
// the Tesla Guardian's plaza
p2 = await levels.load('part2', { start: 'lightningBoss' });
await frame();
fire = p2.fire;
const G = fire.guardian;
check(p2.at === 'fireBoss' && p2.lvId === 'lightning' && G.maxHp === 52 && FD.bossName === 'Tesla Guardian' && CONFIG.part2.fire.boss.steam.angle === 0.2 && CONFIG.part2.fire.boss.fireball.min === 9999,
  `the Tesla Guardian: ${G.maxHp} HP, a lightning lane (a narrow cone), Overcharge (the charge, a pillar stuns him ${CONFIG.part2.fire.boss.charge.stun} s), no fire ball`);
G.hp = 1; G.state = 'recover'; G.t = -999; G.takeHit(1);
await seconds(CONFIG.part2.fire.boss.deathTime + 0.5, () => !G.model.visible);
await seconds(CONFIG.part2.fire.arena.pedestalTime + 0.8);
{
  const C = fire.centre;
  check(fire.elementReady, 'the Lightning orb rises');
  hero.puppet(new THREE.Vector3(C.x, 0, C.z + 3.2), Math.PI, 0);
  view.lines = [];
  let amySeen = false, tickHit = false;
  await frame();
  let guard = 0;
  while (cinematic.active && guard++ < 60 * 90) {
    await frame();
    if (p2.scene.getObjectByName('cameo')?.visible) amySeen = true;
    if (p2.tick.hitT > 0) tickHit = true;
    if (view.complete) { view.complete = false; cinematic.tap(); cinematic.tap(); }
  }
  const hurt = 'She... took it.', why = 'Why would she do this?';
  const want = [`${DIALOGUE.speakers.tick}: ${hurt}`, `${DIALOGUE.speakers.aj}: ${why}`];
  const got = view.lines.map((l) => l.replace(/^(\w+):/, (m, k) => `${DIALOGUE.speakers[k] ?? k}:`));
  check(amySeen && tickHit && JSON.stringify(got) === JSON.stringify(want), `Amy appears at the orb, blasts it and knocks Tick down; Tick: "${hurt}" AJ: "${why}" (${got.length} lines)`);
  await run(0.5);
  check(p2.elements.includes('lightning') && fire.arsenal.sparkUnlocked && ui.elements.includes('lightning') && input.pulsed === 'sparkChain' && ui.banners.at(-1) === 'Lightning Element recovered', 'a shard is his: Lightning in the Elements row, Spark Chain unlocked, the banner');
}
// 2) STEAM
await waitLevel('steam');
fire = p2.fire; track = fire.world.track;
{
  const FS = CONFIG.part2.fire;
  check(p2.lvId === 'steam' && fire.stage === 'ride' && FS.fireBossHealth === 68 && FS.greenPotionHearts === 2 && ui.quest === 'Ride the sky rails' && fire.cfg.rails.filter((r) => r.upper).length === 5,
    `Steam starts: "${ui.quest}", ${fire.cfg.rails.filter((r) => r.upper).length} high rails with steam vents between, green potions heal 2 hearts`);
  // Amy's violet bolts from the sky
  place(300, 0);
  hurts.length = 0; hero.resetStatus?.();
  fire.zaps.next = 0;
  await seconds(1.5, () => fire.zaps.bolts.some((b) => b.t >= 0));
  const b = fire.zaps.bolts.find((q) => q.t >= 0);
  const spawned = !!b;
  if (b) { b.at.copy(horse.position); }
  await seconds(2, () => hurts.some((h) => h.source === 'zap'));
  check(spawned && hurts.some((h) => h.source === 'zap' && h.n === 0.5), `Amy's violet bolts: one is marked ahead and strikes (half a heart if the horse stays in it; ${fire.zaps.stats.strikes} strike${fire.zaps.stats.strikes === 1 ? '' : 's'})`);
  // the wand piece chest
  const chest = fire.items.entries.find((e) => e.chest);
  fire.items.keys = 1;
  place(880, -4.2);
  await seconds(5, () => (p2.wandPieces ?? 0) >= 1);
  check(p2.wandPieces === 1 && ui.wand?.n === 1 && ui.banners.some((t) => /wand/i.test(t)), `the cog chest holds Wand piece 1/3 (the HUD shows "${DIALOGUE.part2.elementLevels.steam.wand(1)}")`);
  // the gliding finale
  place(FS.ride.door.s - 6, 0, { speed: 17 });
  fire.ride.finished = true;
  fire.ride.onFinish();
  await seconds(1, () => fire.glide);
  const gliding = !!fire.glide;
  const y0 = horse.position.y;
  await run(F.glide.time * 0.5);
  const high = horse.position.y;
  check(gliding && high > y0 + 2 && horse.scripted, `through the wind current the horse glides (${y0.toFixed(1)} → ${high.toFixed(1)} up)`);
  await seconds(F.glide.time + 2, () => p2.at === 'fireBoss');
  await run(0.5);
  check(p2.at === 'fireBoss' && fire.bossDown && !fire.guardian.alive && fire.orb.group.visible, 'the glide ends at the plaza: no Guardian, the Steam orb is waiting');
  await seconds(CONFIG.part2.fire.arena.pedestalTime + 0.8);
  const C = fire.centre;
  hero.puppet(new THREE.Vector3(C.x, 0, C.z + 3.2), Math.PI, 0);
  view.lines = [];
  await frame();
  let guard = 0;
  while (cinematic.active && guard++ < 60 * 90) {
    await frame();
    if (view.complete) { view.complete = false; cinematic.tap(); cinematic.tap(); }
  }
  await run(0.5);
  check(p2.elements.includes('steam') && fire.arsenal.steamUnlocked && input.pulsed === 'steamGust' && ui.banners.at(-1) === 'Steam Element recovered' && p2.tick.hitT === 0, 'the Steam Element is his: Steam Gust unlocked, the Elements row, the banner, Tick recovers');
  await run(3);
  check(p2.objective === 'magnet' && p2.at === 'magnet', `then the next place: ${ui.quest}`);
}
// Fire is untouched
check(CONFIG.part2.fire.fireBossHealth === FIRE0.hp && CONFIG.part2.fire.accent === FIRE0.accent && DIALOGUE.part2.fire.quest === FIRE0.quest && CONFIG.part2.fire.tesla.coils.length === 0, "Fire's own settings are back once the levels are left");
console.log(failed ? 'ELEMENTS TEST FAILED' : 'ELEMENTS TEST PASSED');
process.exit(failed ? 1 : 0);
