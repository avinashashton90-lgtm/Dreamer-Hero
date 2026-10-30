// Headless test: the Fire Element's level (src/part2/fire.js, items.js, foes.js, guardian.js,
// fireCombat.js). Usage: npm run test:fire   (exits non-zero on failure)
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

const { trackPoint } = await import('../src/part2/rideModel.js');
// 1) The level loads: its own ride (the furnace city), the HUD, a draw budget.
const p2 = await levels.load('part2', { start: 'fire' });
const fire = p2.fire;
const ride = fire.ride;
const track = fire.world.track;
const near = () => track.nearest(horse.position.x, horse.position.z, 20);
const lastToast = () => ui.toasts.at(-1);
/** Put the horse at `s`, `lat`, riding at `speed` along the trail. */
const place = (s, lat = 0, { speed = 0, y = 0 } = {}) => {
  ride.stop();
  const pt = trackPoint(track, s, lat, y);
  horse.position.copy(pt.pos);
  horse.heading = pt.heading;
  horse.speed = speed;
  horse.velocity.set(0, 0, 0);
  horse.grounded = true;
  horse.stumble = horse.stumbleStop = 0;
  horse.steer = horse.yawRate = 0;
  horse.galloping = false;
  horse.mode = 'riding';
  horse.scripted = false;
  cam.snapTo?.(hero.position);
};
const toastsSince = (n) => ui.toasts.slice(n);
const count = (name) => played.filter((x) => x.name === name).length;
const seconds = async (t, fn) => { for (let x = 0; x < t; x += dt) { await frame(); if (fn?.()) return true; } return false; };
await run(1);
// (teleports in these tests leave rails and belts all the time: the cog keys are only recalled when a test asks for it)
let recallOn = false;
const realLeave = fire.ride.onLeaveSurface;
fire.ride.onLeaveSurface = (kind) => { if (recallOn) realLeave?.(kind); };
{
  const D = F.debug;
  check(fire.items.keys === D.startKeys && fire.arsenal.ammo === Math.min(F.maxBatarangs, D.startGems) && fire.arsenal.gearStock === D.startGears && fire.arsenal.usesLeft('cogShot') === D.startKeys && fire.arsenal.usesLeft('gearWheel') === Math.floor(D.startGears / F.weapons.gearWheel.gears),
    `"Fire level (start)": ${fire.items.keys} cog keys, ${fire.arsenal.ammo} gems, ${fire.arsenal.gearStock} brass gears (Cog Shot ×${fire.arsenal.usesLeft('cogShot')}, Gear Wheel ×${fire.arsenal.usesLeft('gearWheel')})`);
  // (the rest of the test starts from the plain level)
  fire.items.keys = 0;
  fire.arsenal.ammo = F.startAmmo;
  fire.arsenal.gearStock = 0;
  fire.ui?.setCogKeys?.(0, true);
  ui.setCogKeys(0, true);
}
check(p2.at === 'fire' && fire.built && fire.stage === 'ride' && state.is(STATES.PLAY) && horse.mode === 'riding' && hero.riding && horse.world === fire.world && fire.parts.root.visible && !p2.gearhaven.visible,
  `the Fire level starts: AJ on the horse in the furnace city (its own ride, ${track.length.toFixed(0)} long), "${ui.quest}" (${ui.dist} to the gate)`);
{
  const near = (s0, a, b) => ride.total >= 30 && s0;
  void near;
  const R = fire.cfg;
  check(fire.parts.vents.length === R.vents.length && fire.parts.conveyors.length >= 1 && R.rails.some((r) => r.upper) && R.rails.length >= 4 && fire.parts.decks.length === 1 && R.checkpoints.length === fire.parts.flags.length + 1,
    `section 1 reuses the ride's pieces: ${fire.parts.vents.length} steam vents, the belt deck, ${fire.parts.conveyors.length} conveyors, ${R.rails.length} rails, hammers, a saw; ${ride.total} gears; ${R.checkpoints.length} checkpoints`);
  const keys = fire.items.entries.filter((e) => e.type === 'cogKey');
  const chests = fire.items.entries.filter((e) => e.chest);
  const costs = chests.map((c) => c.model.userData.cost).sort();
  check(keys.length === 7 && chests.length === 4 && JSON.stringify(costs) === '[1,1,1,1]' && costs.reduce((a, b) => a + b, 0) + F.gate.keys === 6 && keys.length - 1 >= 6,
    `${keys.length} cog keys and 4 chests (costs ${costs.join(', ')}; one holds the Shield) + the cog gate (${F.gate.keys}): six keys cover every cost, one may be missed`);
  const lat = (e) => Math.abs(track.nearest(e.pos.x, e.pos.z, 30).lateral);
  const mainKeys = keys.filter((k) => lat(k) < 0.1);
  check(mainKeys.length === 3 && keys.every((k) => lat(k) <= 4), `three keys sit on the fixed main line (one on the belt deck's top, one on the upper rail's line); the other ${keys.length - mainKeys.length} are within 4 units`);
  const keyProgress = keys.map((k) => track.nearest(k.pos.x, k.pos.z, 30).s);
  check(keyProgress.every((s, i) => i === 0 || s > keyProgress[i - 1]) && P2.items.types.cogKey.reach <= P2.items.pickupMagnetRadius && P2.items.pickupMagnetRadius === 2, 'keys are only placed ahead along the trail and use at most the 2-unit pickup radius (pickupMagnetRadius)');
  const plaza = F.plaza;
  const pk = keys.filter((k) => { const s0 = track.nearest(k.pos.x, k.pos.z, 30).s; return s0 >= plaza.from && s0 <= plaza.to; });
  const nearChest = (k) => chests.some((c) => c.pos.distanceTo(k.pos) < 6.5);
  check(pk.length === 3 && pk.every(nearChest) && chests.every((c) => { const s0 = track.nearest(c.pos.x, c.pos.z, 30).s; return s0 >= plaza.from && s0 <= plaza.to; }), 'the plaza: the 4 chests (3 with a cog key near each; the Shield chest is paid from the rest)');
  const catchupKey = fire.items.find('key0');
  const keyTrack = track.nearest(catchupKey.pos.x, catchupKey.pos.z, 30);
  const keyHeight = catchupKey.pos.y + P2.items.types.cogKey.height;
  fire.items.update(dt, { pos: trackPoint(track, keyTrack.s - 6, keyTrack.lateral).pos.setY(keyHeight) });
  fire.items.update(dt, { pos: trackPoint(track, keyTrack.s + 6, keyTrack.lateral).pos.setY(keyHeight) });
  check(catchupKey.taken && fire.items.keys === 1, 'a fast horse that passes within the key radius collects it even when neither frame ends nearby');
  fire.items.restore(null);
  const green = fire.items.entries.filter((e) => e.type === 'elixirHeal' && !e.chest), blue = fire.items.entries.filter((e) => e.type === 'elixirEnergy' && !e.chest);
  const inPlaza = (e) => { const s0 = track.nearest(e.pos.x, e.pos.z, 30).s; return s0 >= F.plaza.from && s0 <= F.plaza.to; };
  check(green.length === 5 && green.filter(inPlaza).length === 2 && blue.length === 3 && !blue.some(inPlaza), `potions: ${green.length} green (2 in the plaza) and ${blue.length} blue (all on the ride)`);
  const gemItems = fire.items.entries.filter((e) => e.type === 'gem' && !e.temp);
  check(CONFIG.part2.items.types.gem.ammo === 5 && gemItems.length >= F.fireGemCount, `blue diamond gems: ${gemItems.length} along the path, 5 Batarang ammo each`);
  await run(0.2);
  check(input.combat?.ab === fire.arsenal && !input.combat.hidden && input.combat.ab.has('batarang') && !input.combat.ab.has('fireBlast') && !input.combat.ab.has('shield') && !input.combat.ab.visible('fireBlast') && !input.combat.ab.visible('shield') && input.combat.ab.has('cogShot') && input.combat.ab.has('gearWheel') && input.combat.ab.usesLeft('batarang') === F.fireGemCount * 0 + F.startAmmo && input.combat.ab.layout === '2',
    `the buttons: the Batarang with its gems (${input.combat.ab.usesLeft('batarang')}) — no Fire Blast and no Shield button yet (the Fire Element and the Shield chest give them), Cog Shot and Gear Wheel are his for the level`);
  check(ui.keys?.show && ui.keys.n === 0 && ui.elements.length === 0 && ui.elementsShown, 'the HUD: a cog-key counter (0) and the Elements row (none yet)');
  let meshes = 0;
  p2.scene.traverseVisible((o) => { if (o.isMesh) meshes++; });
  const by = {};
  p2.scene.traverseVisible((o) => { if (!o.isMesh) return; let a = o; while (a.parent && a.parent !== p2.scene) a = a.parent; by[a.name || a.type] = (by[a.name || a.type] ?? 0) + (o.isInstancedMesh ? 1 : 1); });
  console.log(`     visible meshes in the level: ${meshes}`, JSON.stringify(by));
  const sub = {};
  fire.parts.root.traverseVisible((o) => { if (!o.isMesh) return; let a = o; while (a.parent && a.parent !== fire.parts.root) a = a.parent; sub[a.name || a.type] = (sub[a.name || a.type] ?? 0) + 1; });
  console.log('     ride root by child:', JSON.stringify(sub));
}


// 1a) The second vent's normal gallop launch reaches the lowered upper rail; its snap also accepts a landing up to 2 units above it.
{
  const upper = fire.cfg.rails.find((r) => r.upper);
  const vent = fire.cfg.vents[1];
  place(vent.s - 5, vent.lat, { speed: CONFIG.horse.maxSpeed * 2 });
  horse.galloping = true;
  held.moveY = 1;
  held.gallop = true;
  const caught = await seconds(2, () => ride.grinding && ride.grind.rail === upper);
  held.moveY = 0;
  held.gallop = false;
  check(caught && upper.s[0] - vent.s <= 5 && upper.h < 4.2, `the second steam vent catches a normal gallop on the closer, lower upper rail (s ${upper.s[0]}, height ${upper.h})`);
  ride.stop();
  place(upper.s[0] + 12, upper.lat);
  horse.position.copy(trackPoint(track, upper.s[0] + 12, upper.lat, upper.h + 1.8).pos);
  horse.velocity.set(0, -1, 0);
  horse.grounded = false;
  ride.update(dt, {});
  ride.after(dt);
  check(ride.grinding && ride.grind.rail === upper, 'the upper-rail landing assist snaps a falling horse within 2 vertical units onto the rail');
  ride.stop();
  place(430, 0);
}

// 1b) The cog gate at the end of section 1: shut without 2 keys ("Needs 2 cog keys", solid), open with them (they are spent).
{
  const G = F.gate;
  const items = fire.items;
  place(G.s, 0);
  await run(0.1); // (a key passed on the way is swept up in this first frame)
  fire.gateOpen = false;
  fire.gate.goal = fire.gate.k = 0;
  fire.gate.bars.position.y = 0;
  fire.world.gates[0].open = false;
  items.keys = 1;
  place(G.s, 0);
  fire.gate.hintAt = -Infinity;
  const t0 = ui.toasts.length;
  await run(0.2);
  check(near().s < G.s + 0.5 && !fire.gateOpen && ui.toasts.slice(t0).includes(FD.gate.locked(G.keys)), `the cog gate with 1 key: "${FD.gate.locked(G.keys)}", the horse stopped at it (s ${near().s.toFixed(0)} of ${G.s})`);
  items.keys = G.keys;
  await run(0.2);
  check(fire.gateOpen && items.keys === 0 && ui.keys.n === 0 && ui.toasts.includes(FD.gate.open), `with ${G.keys} keys it opens and the counter drops to 0`);
  place(G.s - 8, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  await run(2);
  held.moveY = 0;
  check(near().s > G.s + 3, `the horse rides through the open gate (s ${near().s.toFixed(0)})`);
}

// 2) Pickups and chests (the item system): keys, elixirs, "Needs 1 cog key", opening, contents, the checkpoint save.
{
  let pulsed0 = null;
  const items = fire.items;
  const key = items.find('key0');
  place(near()?.s ?? 4, 0);
  horse.position.copy(key.pos.clone());
  const c0 = count('cog_key_collect');
  await run(0.3);
  check(key.taken && items.keys === 1 && ui.keys.n === 1 && count('cog_key_collect') === c0 + 1 && ui.toasts.at(-1) === FD.got.cogKey, 'a cog key floats (bobbing, spinning) and is collected by riding up to it: the counter 1, a chime');
  const m0 = key.model.position.y;
  await run(0.4);
  check(Math.abs(items.find('key1').model.position.y - items.find('key1').pos.y - P2.items.types.cogKey.height) <= P2.items.bob + 0.01, 'pickups hover at their height and bob');
  items.restore(null);
  void m0;
  // chests: too few keys
  const small = items.find('chest0'), small2 = items.find('chest1'), big = items.find('chest2');
  const sp = track.nearest(small.pos.x, small.pos.z, 30);
  place(sp.s, -2.2);
  const t0 = ui.toasts.length;
  await run(0.3);
  check(toastsSince(t0).includes(FD.needs(1)) && small.redT > 0 && small.state === 'closed' && count('chest_locked') >= 1 && items.keys === 0, `a small chest with no key: "${FD.needs(1)}", it glows red, a dull clunk, it stays shut`);
  await run(2.2);
  // enough keys
  hero.setHearts?.(3);
  lives.setHearts(3);
  items.addKeys(1);
  const c1 = count('chest_open');
  place(sp.s, -2.2);
  await run(1.0);
  check(small.state === 'opening' || small.state === 'rising' || small.state === 'open', 'with a key the chest opens by itself as the horse comes up');
  await run(2.6);
  check(small.state === 'open' && items.keys === 0 && count('chest_open') === c1 + 1 && lives.hearts === 4 && fire.stats.chestPopups?.includes(FD.chest.elixirs) && small.model.userData.lid.rotation.x < -1.5,
    'the lid lifts, light pours out, the potions float up and are drunk: a green one +1 heart (3 → 4), a blue one for the horse, the key spent');
  // the big chest also costs one key
  const bp = track.nearest(big.pos.x, big.pos.z, 30);
  items.keys = 0;
  place(bp.s, -2.0);
  const t1 = ui.toasts.length;
  items.hintAt = -Infinity;
  await run(0.4);
  check(toastsSince(t1).includes(FD.needs(1)) && big.state === 'closed' && items.keys === 0, `the big chest with no key: "${FD.needs(1)}"`);
  items.addKeys(1);
  const hearts0 = lives.maxHearts;
  await run(3.8);
  check(big.state === 'open' && items.keys === 0 && lives.maxHearts === hearts0 + 1 && p2.extraHearts === 1 && lives.hearts === lives.maxHearts, `the big chest (1 key): a heart container, +1 max heart (${hearts0} → ${lives.maxHearts}) and a full heal`);
  // the Shield chest: a fourth chest, one key, the Shield (not there before)
  {
    const shieldChest = items.find('chest3');
    const shieldCfg = F.chests[3];
    check(shieldCfg.contents[0].type === 'shield' && shieldCfg.cost === 1 && !fire.arsenal.has('shield') && !fire.arsenal.visible('shield') && !fire.arsenal.use('shield') && fire.arsenal.blockReason('shield') === 'locked', 'before its chest there is no Shield: no button, and a tap does nothing');
    const ss = track.nearest(shieldChest.pos.x, shieldChest.pos.z, 30);
    items.keys = 0;
    place(ss.s, -2.2);
    const tS = ui.toasts.length;
    await run(0.3);
    check(toastsSince(tS).includes(FD.needs(1)) && shieldChest.state === 'closed' && !fire.arsenal.has('shield'), `the Shield chest with no key: "${FD.needs(1)}"`);
    await run(2.2);
    items.addKeys(1);
    pulsed0 = input.pulsed;
    place(ss.s, -2.2);
    await run(3.8);
    check(shieldChest.state === 'open' && items.keys === 0 && fire.arsenal.has('shield') && fire.arsenal.visible('shield') && fire.stats.chestPopups?.includes(FD.chest.shield) && input.pulsed === 'shield', `the Shield chest (1 key): the Shield is his, the popup "${FD.chest.shield}", its button lights up`);
    await run(2.2);
    check(ui.toasts.includes(FD.shieldHint), `and a hint: "${FD.shieldHint}"`);
    fire.arsenal.shieldUnlocked = false; // (the next sections start without it again)
    items.restore(null);
  }
  // gems out of the second small chest
  const gp = track.nearest(small2.pos.x, small2.pos.z, 30);
  items.addKeys(1);
  fire.arsenal.ammo = 0;
  const ammo0 = 0;
  place(gp.s, 2.2);
  await run(4);
  check(small2.state === 'open' && fire.arsenal.ammo === Math.min(F.maxBatarangs, ammo0 + 3 * CONFIG.part2.items.types.gem.ammo) && fire.stats.chestPopups?.includes(FD.chest.gems(3)), `the other small chest: 3 gems and the popup "${FD.chest.gems(3)}" (Batarang ammo ${ammo0} → ${fire.arsenal.ammo})`);
  // elixirs
  const eh = items.entries.find((e) => e.type === 'elixirHeal' && !e.chest), ee = items.entries.find((e) => e.type === 'elixirEnergy');
  lives.setHearts(2);
  horse.position.copy(eh.pos.clone().setY(0));
  await run(0.3);
  const eblue = ee;
  horse.energy = 10;
  const sp0 = fire.fx.list.length;
  horse.position.copy(eblue.pos.clone().setY(0));
  await run(0.3);
  check(eh.taken && lives.hearts === 2 + F.greenPotionHearts && ee.taken && Math.abs(horse.energy - (10 + F.bluePotionEnergy)) < 6 && fire.stats.greenPotions >= 1 && fire.stats.bluePotions >= 1 && count('river_splash') >= 1,
    `the green potion heals ${F.greenPotionHearts} heart (2 → ${lives.hearts}) with a sparkle on AJ; the blue one gives the horse ${F.bluePotionEnergy}% (10 → ${horse.energy.toFixed(0)}) with a splash`);
  void sp0;
  // the checkpoint saves opened chests; a death puts things back to that save
  items.restore(null);
  place(sp.s, -2.2);
  items.addKeys(1);
  horse.onCheckpoint(5); // (the plaza's checkpoint: saved with 1 key, nothing opened)
  const keysSaved = items.keys;
  items.addKeys(2);
  await run(4); // opens the first small chest (1 key) with the 2 extra keys
  const opened = items.entries.filter((e) => e.chest && e.state === 'open').length;
  horse.lastCheckpoint = 5;
  lives.setHearts(0.5);
  lives.damage(1);
  lives.resolveDeath();
  p2.respawn();
  check(opened >= 1 && items.entries.filter((e) => e.chest && e.state === 'open').length === 0 && items.keys === keysSaved && Math.abs(near().s - F.ride.checkpoints[5]) < 3 && lives.hearts === lives.maxHearts,
    `a death: back at the plaza's checkpoint with the chests it had opened shut again and the keys given back (${keysSaved}), full hearts`);
  items.restore(null);
}


const SC = F.scouts, SW = F.swords;
const alive = (list) => list.filter((f) => f.alive);
const fresh = () => { items0(); lives.setHearts(lives.maxHearts); hurts.length = 0; hero.resetStatus?.(); };
const items0 = () => { fire.items.restore(null); fire.arsenal.clear(); fire.arsenal.ammo = F.startAmmo; fire.foes.reset(0); fire.fx.list.length = 0; };

// 3) Section 2: scout robots in pairs, from the front and wide; the Batarang (auto-aim, 1 gem a throw, out and back); 2 hits.
{
  fresh();
  place(430, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  const f = fire.foes;
  let spawned = null;
  const groups0 = f.stats.scoutGroups;
  await seconds(4, () => { const a = alive(f.scouts); if (a.length >= 2) { spawned = a.map((x) => ({ s: track.nearest(x.position.x, x.position.z, 30).s, lat: track.nearest(x.position.x, x.position.z, 30).lateral, hs: near().s })); return true; } return false; });
  const aheadOk = spawned && spawned.every((q) => q.s - q.hs > SC.ahead[0] - 6 && q.s - q.hs < SC.ahead[1] + 6);
  const wide = spawned && spawned.length === 2 && Math.sign(spawned[0].lat) !== Math.sign(spawned[1].lat) && spawned.every((q) => Math.abs(q.lat) > SC.lat - 1.5);
  check(!!spawned && f.stats.scoutGroups === groups0 + 1 && aheadOk && wide, `a group of 2 scouts is called as the horse passes s ${SC.triggers[0]}: ${spawned ? spawned.map((q) => `${(q.s - q.hs).toFixed(0)} ahead, ${q.lat.toFixed(1)} off the middle`).join(' / ') : 'none'}`);
  held.moveY = 0;
  place(near().s, 0, { speed: 0 });
  // they run at the horse
  const sc = alive(f.scouts);
  await run(1.0); // (they rise out of the road first)
  const d0 = sc.map((x) => x.position.distanceTo(horse.position));
  await run(1);
  const d1 = sc.map((x) => x.position.distanceTo(horse.position));
  check(sc.length === 2 && d1.every((d, i) => d < d0[i] - 5) && sc.every((x) => x.state === 'run' || x.state === 'rise'), `the scouts run straight at the horse (${d0.map((d) => d.toFixed(0)).join(' / ')} → ${d1.map((d) => d.toFixed(0)).join(' / ')} away after a second)`);
  // the Batarang: auto-aimed, 1 gem a throw, out and back, caught; a scout dies in 2 hits
  const ar = fire.arsenal;
  await seconds(3, () => ar.pick() !== null); // (in range of the Batarang)
  const ammo0 = ar.ammo;
  const target = ar.pick();
  const hp0 = target.hp;
  const fx0 = count('batarang_throw');
  alive(f.scouts).forEach((x) => { x.active = false; }); // (held still: the Batarang is not aimed — it goes the way he faces)
  horse.heading = Math.atan2(target.position.x - horse.position.x, target.position.z - horse.position.z); // (the Batarang is not aimed: it goes the way he faces)
  const used = ar.use('batarang');
  const blocked = ar.use('batarang'); // (busy / cooldown)
  check(used && !blocked && ar.ammo === ammo0 - 1 && ar.pending && hero.throwAnim?.kind === 'throw' && ar.usesLeft('batarang') === ammo0 - 1, `the Batarang: a tap throws it at the nearest scout (straight ahead), 1 Batarang spent (${ammo0} → ${ar.ammo}), the throw pose first`);
  let flew = false, caught = false, maxD = 0;
  await seconds(3, () => { if (ar.proj) { flew = true; maxD = Math.max(maxD, ar.proj.pos.distanceTo(horse.position)); } if (flew && !ar.proj) { caught = true; return true; } return false; });
  check(flew && caught && ar.stats.catches === 1 && count('batarang_throw') === fx0 + 1 && (target.hp < hp0 || !target.alive) && !ar.model.visible, `it flies out, hits (${hp0} → ${target.alive ? target.hp : 0} HP), comes back and is caught (${maxD.toFixed(0)} out)`);
  // kill both with direct hits (2 hits each) and check the brass burst and the drops
  const realRandom = Math.random;
  Math.random = () => 0; // (every drop chance succeeds)
  const burst0 = fire.scrap.pieces.length, drops0 = fire.foes.stats.drops ?? 0;
  const gems0 = fire.items.entries.filter((e) => e.temp).length;
  const victims = alive(f.scouts);
  const a1 = victims.map((v) => v.takeHit(1));
  const mid = victims.map((v) => v.alive);
  victims.forEach((v) => v.takeHit(1));
  Math.random = realRandom;
  await frame();
  check(a1.every(Boolean) && victims.every((v) => !v.alive) && fire.scrap.pieces.length > burst0 && fire.items.entries.filter((e) => e.temp).length > gems0,
    `scouts have 2 HP: the second Batarang hit breaks each into brass parts (${fire.scrap.pieces.length - burst0} flying) and a gem drops where it fell`);
  Math.random = realRandom;
  // standing still: a scout that reaches the horse lunges once for a quarter heart
  items0();
  place(430, 0, { speed: 0 });
  f.reset(0);
  f.triggered.clear();
  place(452, 0, { speed: 0 });
  lives.setHearts(5);
  hurts.length = 0;
  await seconds(8);
  const scoutHits = hurts.filter((h) => h.source === 'scout');
  check(scoutHits.length >= 1 && scoutHits.every((h) => h.n === SC.damage) && scoutHits.length <= 2 && lives.hearts >= 5 - 2 * SC.damage, `scouts that reach a standing horse lunge once each for ${SC.damage} of a heart (${scoutHits.length} hits), then fall away`);
  check(alive(f.scouts).length === 0 || alive(f.scouts).every((x) => x.state === 'away' || x.state === 'run'), 'and are gone after');
}

// 3b) The cog weapons (Cog Shot: a key; Gear Wheel: 4 gears), the gems along the ride, the Dismount button.
{
  fresh();
  const ar = fire.arsenal, f = fire.foes, items = fire.items;
  // gems: about one every 40 along the ride, on the steam-jump landings, extra in the plaza
  const gems = items.entries.filter((e) => e.type === 'gem' && !e.temp && !e.chest);
  const gs = gems.map((g) => track.nearest(g.pos.x, g.pos.z, 30).s).sort((a, b) => a - b);
  const gaps = gs.slice(1).map((v, i) => v - gs[i]);
  const onLanding = F.gemLandings.every(([ls]) => gs.some((v) => Math.abs(v - ls) < 8));
  const inPlaza = gs.filter((v) => v >= F.plaza.from && v <= F.plaza.to).length;
  check(gems.length >= F.fireGemCount && onLanding && inPlaza >= 3 && Math.max(...gaps.filter((_, i) => gs[i] < 640)) <= 95, `gems for the Batarang: ${gems.length} along the ride (${F.fireGemCount} planned), on the steam-jump landings, ${inPlaza} in the plaza, the widest gap before the plaza ${Math.max(...gaps.filter((_, i) => gs[i] < 640)).toFixed(0)}`);
  // a scout to shoot at
  f.reset(0);
  place(430, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  await seconds(4, () => alive(f.scouts).length >= 1);
  held.moveY = 0;
  place(near().s, 0, { speed: 0 });
  await seconds(3, () => ar.pick() !== null);
  // Cog Shot
  items.keys = 2;
  ui.setCogKeys(2, true);
  const t1 = ar.pick(), hp1 = t1.hp;
  const numbers0 = ui.numbers.length;
  const hitSound0 = count('robot_hit');
  let impactSeen = false;
  check(ar.usesLeft('cogShot') === 2 && ar.canAfford('cogShot'), 'Cog Shot: 2 keys = 2 shots (the uses-left badge)');
  const usedCog = ar.use('cogShot');
  await seconds(3, () => {
    impactSeen ||= ar.fx.impacts.length > 0;
    return !ar.cog && items.keys < 2 && (!t1.alive || t1.hp < hp1);
  });
  check(usedCog && items.keys === 1 && ar.usesLeft('cogShot') === 1 && (!t1.alive || t1.hp <= hp1 - CS.damage), `a Cog Shot spends 1 key (2 → ${items.keys}) and does ${CS.damage} damage (${hp1} → ${t1.alive ? t1.hp : 0} HP)`);
  check(impactSeen && ui.numbers.slice(numbers0).some((n) => n.text === '-2') && count('robot_hit') > hitSound0,
    'Cog Shot impact: a visible flash/spark ring, clanging hit sound and "-2" popup');
  items.keys = 0;
  check(!ar.use('cogShot') && ar.blockReason('cogShot') != null, 'with no cog key the Cog Shot is blocked (greyed out)');
  // Gear Wheel
  f.reset(0);
  const wheelTarget = f.scouts[0];
  const wheelPoint = trackPoint(track, 500, 0);
  wheelTarget.spawn(wheelPoint.pos, wheelPoint.heading, 'idle');
  wheelTarget.active = false;
  place(492, 0);
  await frame();
  const wheelForward = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  wheelTarget.position.copy(horse.position).addScaledVector(wheelForward, 5);
  wheelTarget.position.y = 0;
  wheelTarget.model.position.copy(wheelTarget.position);
  ar.gearStock = GW.gears * 2 - 1;
  check(ar.usesLeft('gearWheel') === 1, `Gear Wheel: ${ar.gearStock} gears = ${ar.usesLeft('gearWheel')} shot (${GW.gears} gears each)`);
  ar.cooldowns.gearWheel = 0;
  const stock0 = ar.gearStock;
  const wheelHp0 = wheelTarget.hp;
  const usedGw = ar.use('gearWheel');
  let rolled = false;
  await seconds(2, () => { rolled ||= !!ar.wheel; return rolled && !ar.wheel; });
  check(usedGw && rolled && wheelTarget.hp <= wheelHp0 - GW.damage && ar.gearStock === stock0 - GW.gears && ar.usesLeft('gearWheel') === 0,
    `a Gear Wheel spends ${GW.gears} gears (${stock0} → ${ar.gearStock}), rolls along the ground and hits Leela (${wheelHp0} → ${wheelTarget.hp})`);
  ar.cooldowns.gearWheel = 0;
  await seconds(4, () => !ar.wheel);
  check(!ar.use('gearWheel'), 'with fewer than 4 gears the Gear Wheel is blocked');
  // Dismount: hold the button → AJ gets down; Mount gets him back on
  place(300, 0, { speed: 0 });
  await run(0.3);
  check(input.dismount?.shown && input.dismount.ok && horse.mode === 'riding', 'riding slowly in the Fire level: the Dismount button is shown and ready');
  held.mountPressed = true;
  await frame();
  await run(1);
  check(horse.mode === 'idle' && !horse.mounted && !hero.riding, 'Dismount (the button): AJ gets down off the horse in the Fire level and stands on the street');
  check(input.mountShown === true || horse.canMount(hero), 'beside the horse the Mount button is offered');
  held.mountPressed = true;
  await frame();
  await run(1);
  check(horse.mode === 'riding' && horse.mounted && hero.riding && input.dismount?.shown, 'Mount: back in the saddle, the Dismount button is back and the ride goes on');
  place(300, 0, { speed: CONFIG.horse.maxSpeed });
  await frame();
  check(input.dismount?.shown && !input.dismount.ok, 'at speed the Dismount button is greyed out (as in Part 1)');
  items.restore(null);
}

// 3c) The Gear Wheel's animation (spin, wall bounce, rebound off the first robot), the gear counter, the balance numbers.
{
  fresh();
  const ar = fire.arsenal, f = fire.foes, GW = F.weapons.gearWheel;
  const loops = [];
  p2.sound.manager = { setLoop: (key, name, o) => loops.push({ key, name, ...o }), playSound() {} };
  check(GW.gears === 3 && F.weapons.cogShot.keys === 1 && F.fireBlast.cooldown === 10 && F.fireBossHealth === 68 && F.maxBatarangs === 12, `the numbers: Gear Wheel ${GW.gears} gears, Cog Shot 1 key, Fire Blast ${F.fireBlast.cooldown} s, the Guardian ${F.fireBossHealth} HP`);
  // the gear counter: only the count, no fraction; ticks as marks on a bar
  await run(0.3);
  check(ui.gears && ui.gears.showTotal === false && ui.gears.total === ride.total && ui.gears.tiers.length === 3 && ride.total >= 24 && ride.total <= 40, `the gear counter shows only the count (${ui.gears?.count}); the bar scales to the level's ${ride.total} gears with ${ui.gears?.tiers.length} reward marks`);
  // a wall: aimed at the road's side wall the wheel bounces off it
  f.reset(0); f.clear();
  place(300, 0, { speed: 0 });
  horse.heading += Math.PI / 2;
  ar.gearStock = GW.gears * 3;
  ar.cooldowns.gearWheel = 0;
  const dir0 = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  ar.use('gearWheel');
  let maxBounce = 0, spun = 0, lastRot = 0, dirEnd = null, y0 = Infinity, y1 = -Infinity, upright = true, speedBefore = null, keepSeen = null, prevSpeed = null, prevBounces = 0, maxLean = 0;
  await seconds(3, () => {
    const w = ar.wheel;
    if (!w) return maxBounce > 0;
    if (w.bounces > prevBounces && prevSpeed) { keepSeen ??= w.speed / prevSpeed; dirEnd ??= w.dir.clone(); }
    prevBounces = w.bounces;
    prevSpeed = w.speed;
    maxBounce = Math.max(maxBounce, w.bounces);
    spun += Math.abs(ar.wheelGear.rotation.z - lastRot);
    lastRot = ar.wheelGear.rotation.z;
    y0 = Math.min(y0, w.pos.y); y1 = Math.max(y1, w.pos.y);
    maxLean = Math.max(maxLean, Math.abs(ar.wheelMesh.rotation.x));
    upright &&= Math.abs(ar.wheelMesh.rotation.z) < 1e-6 && ar.wheelMesh.rotation.order === 'YXZ'; // (the rim stands on its edge: its face is vertical)
    return false;
  });
  check(maxBounce >= 1 && dirEnd && dirEnd.dot(dir0) < 0.5 && keepSeen !== null && Math.abs(keepSeen - GW.wheelWallBounceKeep) < 0.08 && y1 - y0 > 0.1 && spun > 10 && upright && maxLean <= GW.lean.max + 0.01 && loops.some((l) => l.name === GW.roll),
    `the wheel stands upright and spins round its axle as it rolls (${spun.toFixed(0)} rad), is thrown in an arc (${(y1 - y0).toFixed(1)} of height), bounces gently off the wall keeping ${keepSeen?.toFixed(2)} of its speed (${GW.wheelWallBounceKeep}), the gear_roll loop plays`);
  // a robot: damage and a flash, then it keeps a quarter of its speed, pops up and rolls on the same way (never a sideways launch); once per robot
  f.reset(0);
  place(430, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  await seconds(4, () => alive(f.scouts).length >= 1);
  held.moveY = 0;
  place(near().s, 0, { speed: 0 });
  await seconds(3, () => { const t = ar.pick(); return t && Math.hypot(t.position.x - horse.position.x, t.position.z - horse.position.z) < 12; });
  ar.cooldowns.gearWheel = 0;
  const target = ar.pick();
  const hp0 = target.hp;
  const impacts0 = ar.fx.impacts.length;
  ar.use('gearWheel');
  let wdir0 = null, hitSeen = null, popped = false, sameWay = true, rolledOn = false, spPre = null, wasUpright = true;
  await seconds(3, () => {
    const w = ar.wheel;
    if (!w) return !!hitSeen;
    if (!wdir0) wdir0 = w.dir.clone();
    if (!hitSeen && w.hit.size > 0) hitSeen = { speed: w.speed, pre: spPre };
    spPre = w.speed;
    if (hitSeen) {
      popped ||= w.vy > 0 || w.pos.y > w.ground + GW.radius + 0.02;
      sameWay &&= w.dir.dot(wdir0) > 0.8;
      rolledOn ||= w.travelled > 0 && w.speed > 0;
    }
    wasUpright &&= Math.abs(ar.wheelMesh.rotation.z) < 1e-6;
    return false;
  });
  const keep = hitSeen && hitSeen.pre ? hitSeen.speed / hitSeen.pre : -1;
  check(hitSeen && (!target.alive || target.hp < hp0) && Math.abs(keep - GW.wheelSpeedKeepOnHit) < 0.06 && popped && sameWay && rolledOn && wasUpright && ar.fx.impacts.length >= impacts0 && !ar.stats.rebounds,
    `the wheel hits a robot (${hp0} → ${target.alive ? target.hp : 0} HP, ${GW.damage} damage, the impact flash), keeps ${keep.toFixed(2)} of its speed (${GW.wheelSpeedKeepOnHit}), pops up and rolls on the same way — no sideways launch, no mirror bounce`);
  p2.sound.manager = null;
}

// 3d) The big cog (Cog Shot) is an upright coin: thrown in an arc, one bounce, rolls on its edge slowing down, wobbles, falls flat, fades.
{
  fresh();
  const ar = fire.arsenal, f = fire.foes, CS = F.weapons.cogShot, R = CS.roll;
  f.reset(0); f.clear();
  place(300, 0, { speed: 0 });
  fire.items.keys = 2;
  ar.cooldowns.cogShot = 0;
  const keys0 = fire.items.keys;
  const used = ar.use('cogShot');
  const phases = [];
  let maxY0 = -Infinity, upright = true, spun = 0, lastSpin = 0, rolled0 = null, rolledMax = 0, speedStart = null, speedLate = null, bounced = false, lastY = null, risen = false, maxLeanWobble = 0, flatLean = 0, fadedOut = false;
  await seconds(8, () => {
    const c = ar.cog;
    if (!c) { if (phases.length) fadedOut = phases.includes('fall'); return phases.length > 0; } // (the throw pose first, then the cog)
    if (phases.at(-1) !== c.phase) phases.push(c.phase);
    const m = ar.cogMesh;
    if (c.phase === 'roll' || c.phase === 'fly') upright &&= Math.abs(m.rotation.x) < 1e-6 && m.rotation.order === 'YXZ';
    spun += Math.abs(m.rotation.z - lastSpin);
    lastSpin = m.rotation.z;
    if (c.phase === 'roll') {
      rolled0 ??= c.pos.clone();
      rolledMax = Math.max(rolledMax, c.pos.distanceTo(rolled0));
      speedStart ??= c.speed;
      speedLate = c.speed;
      if (lastY !== null && c.pos.y > lastY + 1e-3) risen = true;
      lastY = c.pos.y;
    }
    if (c.phase === 'wobble') maxLeanWobble = Math.max(maxLeanWobble, Math.abs(c.lean));
    if (c.phase === 'fall') flatLean = Math.max(flatLean, c.lean);
    return false;
  });
  check(used && fire.items.keys === keys0 - CS.keys, `Cog Shot: thrown (1 key spent, 2 damage as before)`);
  check(phases.join(',').startsWith('fly,roll') && phases.includes('wobble') && phases.at(-1) === 'fall' && fadedOut, `the big cog flies in an arc, lands, rolls, wobbles, falls over and fades (${phases.join(' → ')})`);
  check(upright && spun > 8 && rolledMax > 3 && speedLate < speedStart && risen && maxLeanWobble > 0.05 && flatLean > Math.PI / 2 - 0.2, `it lands upright on its edge, bounces once, rolls ${rolledMax.toFixed(1)} on its edge spinning round its axle (${spun.toFixed(0)} rad), slows (${speedStart?.toFixed(1)} → ${speedLate?.toFixed(1)}), wobbles and tips flat`);
  check(!ar.cog && !ar.cogMesh.visible, 'and it is gone');
  // aimed at the road's side wall it stops there and falls over (never through it)
  place(300, 0, { speed: 0 });
  horse.heading += Math.PI / 2;
  fire.items.keys = 1;
  ar.cooldowns.cogShot = 0;
  ar.use('cogShot');
  let maxLat = 0, wallPhases = [];
  await seconds(8, () => {
    const c = ar.cog;
    if (!c) return wallPhases.length > 0;
    if (wallPhases.at(-1) !== c.phase) wallPhases.push(c.phase);
    maxLat = Math.max(maxLat, Math.abs(track.nearest(c.pos.x, c.pos.z, 30).lateral));
    return false;
  });
  check(wallPhases.includes('fall') && maxLat < CONFIG.part2.ride.wall.offset + 1, `thrown at the wall the big cog stops at it (${maxLat.toFixed(1)} off the middle) and falls over`);
}

// 4) Section 4: sword robots patrol, alert, sidestep, charge, wind up (a red ring), swing for half a heart; 4 HP; Fire Blast burns.
{
  fresh();
  const f = fire.foes;
  const sw = f.swords[0];
  const sp = SW.spots[0];
  check(sw.alive && sw.state === 'patrol' && f.swords.length === 4 && f.swords.every((x) => x.model.userData.height === SW.height || true), `${f.swords.length} sword robots (Mike and Stan) patrol the last stretch`);
  const ar = fire.arsenal;
  for (const kind of [...new Set(SW.spots.map((spot) => spot.kind))]) {
    const target = f.swords.find((foe) => foe.spot.kind === kind);
    const spot = target.spot;
    const nearTarget = track.nearest(target.position.x, target.position.z, 30);
    for (const weapon of ['cogShot', 'gearWheel']) {
      f.scouts.forEach((foe) => foe.remove());
      f.swords.forEach((foe) => foe !== target && foe.remove());
      const point = trackPoint(track, nearTarget.s, nearTarget.lateral);
      target.spawn(point.pos, point.heading, 'idle');
      target.active = false;
      place(nearTarget.s - 8, nearTarget.lateral);
      await frame();
      ar.clear();
      fire.items.keys = weapon === 'cogShot' ? 1 : 0;
      ar.gearStock = weapon === 'gearWheel' ? GW.gears : 0;
      const hp = target.hp;
      const used = ar.use(weapon);
      let started = false, pre = null, post = null, d0 = null, same = true;
      await seconds(3, () => {
        started ||= weapon === 'cogShot' ? !!ar.cog : !!ar.wheel;
        const w = ar.wheel;
        if (w) {
          d0 ??= w.dir.clone();
          if (!post && w.hit.size) post = w.speed;
          else if (!post) pre = w.speed;
          if (post !== null) same &&= w.dir.dot(d0) > 0.8;
        }
        return started && !ar.cog && !ar.wheel && target.hp < hp;
      });
      check(used && target.hp <= hp - F.weapons[weapon].damage, `${weapon} damages ${kind} (${hp} → ${target.hp})`);
      if (weapon === 'gearWheel') check(post !== null && pre && Math.abs(post / pre - GW.wheelSpeedKeepOnHit) < 0.06 && same, `the Gear Wheel keeps ${(post / pre).toFixed(2)} of its speed after the ${kind} robot and rolls on the same way (no sideways launch)`);
    }
    target.active = true;
  }
  f.reset(0);
  // patrol: it moves about its post
  const p0 = sw.position.clone();
  const materials0 = sw.hitMaterials.map((m) => m.material.color.clone());
  const pushDirection = new THREE.Vector3(Math.sin(sw.heading), 0, Math.cos(sw.heading));
  sw.takeHit(1, 'wheel', { direction: pushDirection });
  const pushed = sw.position.distanceTo(p0) >= F.weaponImpact.push * 0.5;
  await frame();
  const flashed = sw.flash > 0 && sw.hitMaterials.some((m, i) =>
    ((m.material.color.r - materials0[i].r) ** 2 + (m.material.color.g - materials0[i].g) ** 2 + (m.material.color.b - materials0[i].b) ** 2) > 0.01);
  check(pushed && flashed, `a cog-weapon hit briefly flashes the robot white and nudges it back (push ${sw.position.distanceTo(p0).toFixed(2)}, flash ${sw.flash.toFixed(2)})`);
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'patrol');
  place(sp.s - 60, 0, { speed: 0 });
  await run(3);
  check(sw.state === 'patrol' && sw.position.distanceTo(p0) > 0.5, 'out of sight range it patrols to and fro about its post');
  // in range: the sequence
  const seen = [];
  const R = near();
  place(sp.s - 20, 1, { speed: 0 });
  await seconds(8, () => { if (seen.at(-1) !== sw.state) seen.push(sw.state); return seen.includes('recover'); });
  const order = ['alert', 'sidestep', 'charge', 'windup', 'recover'];
  const idx = order.map((o) => seen.indexOf(o));
  check(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), `it sees the rider and goes alert → sidestep → charge → wind-up → swing: ${seen.join(' → ')}`);
  void R;
  // the swing: half a heart at close range, with a visible wind-up (the ring) — and a miss if the horse isn't there
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'patrol');
  lives.setHearts(5);
  hurts.length = 0;
  place(sp.s - 12, sp.lat, { speed: 0 });
  let ringSeen = false, ringBig = 0;
  await seconds(10, () => { if (sw.ring.visible) ringSeen = true; if (sw.state === 'windup') ringBig = Math.max(ringBig, sw.ring.scale.x); return hurts.length > 0; });
  check(ringSeen && ringBig >= SW.swingRange - 0.5 && hurts.length === 1 && hurts[0].n === SW.damage && hurts[0].source === 'sword' && lives.hearts === 5 - SW.damage, `the swing costs half a heart (${lives.hearts} left); its reach was marked on the ground first (ring ${ringBig.toFixed(1)})`);
  // dodge it: ride clear during the wind-up
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'patrol');
  hero.resetStatus?.();
  lives.setHearts(5);
  hurts.length = 0;
  place(sp.s - 12, sp.lat, { speed: 0 });
  await seconds(10, () => sw.state === 'windup');
  place(near().s - 14, sp.lat, { speed: 0 }); // (the horse is somewhere else when it comes down)
  await seconds(2);
  check(hurts.length === 0 && lives.hearts === 5, 'ride clear of the wind-up and the swing hits nothing');
  // 4 HP; a fire ball finishes it and burns
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'patrol');
  check(sw.hp === SW.hp && SW.hp === 4, 'a sword robot has 4 HP');
  for (let i = 0; i < 3; i++) sw.takeHit(1);
  check(sw.alive && sw.hp === 1, 'three Batarang hits are not enough');
  sw.takeHit(1);
  await run(0.1);
  check(!sw.alive && sw.state === 'dying', 'the fourth defeats it (a death animation, then it fades)');
  await run(2.5);
  check(!sw.active, '...and it is gone');
  // fire ball: not before the Fire Element (no button, a tap does nothing); then 3 damage and a 3 s burn
  check(!fire.arsenal.fireUnlocked && !fire.arsenal.has('fireBlast') && !fire.arsenal.use('fireBlast') && fire.arsenal.blockReason('fireBlast') === 'locked', 'Fire Blast is not his yet: no button, and a tap does nothing');
  fire.arsenal.unlockFire();
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'idle');
  place(sp.s - 14, sp.lat, { speed: 0 });
  sw.state = 'patrol';
  const hpBefore = sw.hp;
  check(ar.use('fireBlast') && ar.cooldownFraction('fireBlast') > 0.95 && ar.usesLeft('fireBlast') === null, 'Fire Blast: thrown with a tap (no gems, no count: only a cooldown ring)');
  let hp1 = null;
  await seconds(2, () => { if (!ar.ball && ar.stats.blasts > 0 && ar.pending === null) { hp1 = sw.hp; return true; } return false; });
  check(hp1 !== null && hp1 <= hpBefore - F.fireBlast.damage + 0.01 && !!sw.burn || !sw.alive, `the fire ball hits for ${F.fireBlast.damage} (3× the Batarang) and sets it alight (burning ${F.fireBlast.burn.time} s)`);
  await run(F.fireBlast.burn.time + 0.5);
  check(!sw.alive, 'the burn finishes a sword robot within 3 s');
  check(ar.cooldownFraction('fireBlast') > 0 && !ar.use('fireBlast'), 'Fire Blast is on its 8 s cooldown (the second tap does nothing)');
  await run(F.fireBlast.cooldown);
  check(ar.cooldownFraction('fireBlast') === 0 && ar.blockReason('fireBlast') === null, 'and ready again after 8 s');
  ar.fireUnlocked = false;
}


// 5) The Furnace Guardian's sealed plaza.
const G = fire.guardian;
const B = F.boss, A = F.arena;
const C = fire.centre;
const rel = (v) => new THREE.Vector3(C.x + v[0], 0, C.z + v[1]);
{
  fresh();
  fire.arsenal.ammo = 12;
  place(1290, 0, { speed: 0 });
  // (the furnace gate: ride.onFinish → the plaza)
  await ride.onFinish();
  await run(1);
  check(p2.at === 'fireBoss' && fire.stage === 'boss' && !hero.riding && horse.mode === 'idle' && hero.world === p2.world && fire.arena.visible && !fire.parts.root.visible && state.is(STATES.PLAY) && ui.quest === FD.questBoss,
    `the furnace gate leads into the plaza: AJ on foot, the horse waiting, "${ui.quest}"`);
  check(Math.abs(hero.position.x - C.x - A.spawn[0]) < 1 && Math.abs(hero.position.z - C.z - A.spawn[1]) < 1 && G.alive && G.state === 'idle' && G.hp === F.fireBossHealth && F.fireBossHealth === 68, `AJ enters at the plaza's edge; the Guardian waits in the middle with ${G.hp} HP (fireBossHealth)`);
  const gm = G.model;
  const box = new THREE.Box3().setFromObject(gm, true);
  check(Math.abs(box.max.y - box.min.y - B.height) < B.height * 0.1 && G.mats.length > 0 && G.mats.every((m) => m.emissive && m.emissive.r > m.emissive.g && m.emissive.g > m.emissive.b && m.emissiveIntensity > 0) && !!G.furnace.parent, `the Guardian: George, ${(box.max.y - box.min.y).toFixed(1)} tall, tinted hot red-orange (${G.mats.length} materials of his own) with a glowing chest furnace`);
  check(input.combat.ab === fire.arsenal && !input.combat.mounted && !input.combat.hidden && ui.boss?.on === false, 'the buttons (Jump, Batarang) on foot; the boss bar waits');
  // Tick floats near the arena edge
  await run(1);
  check(Math.hypot(p2.tick.position.x - C.x, p2.tick.position.z - C.z) > A.wall * 0.5, 'Tick floats near the arena edge');
  // the Guardian notices AJ: the gate seals behind him
  hero.puppet(rel([0, 12]), Math.PI, 0);
  const t0 = ui.toasts.length;
  await run(0.3);
  check(G.state !== 'idle' && fire.barrier.state !== 'open' && toastsSince(t0).includes(FD.gateSealed) && count('steam_barrier_close') >= 1, `the Guardian notices AJ: the steam barrier closes the entrance ("${FD.gateSealed}")`);
  await run(A.gate.close + 0.3);
  check(fire.barrier.state === 'closed' && fire.arena.userData.barrier.material.opacity > 0.3, 'the barrier is shut (steam, no way out)');
  hero.puppet(rel([0, A.wall + 3]), Math.PI, 0);
  await run(0.2);
  check(hero.position.z - C.z <= A.wall - 1.3, 'AJ cannot go out through it');
  // The plaza's steam loop: half of its old level, ducked while an effect plays so nothing is masked
  {
    const PS = CONFIG.part2.sound.plazaSteam;
    const SS = p2.sounds;
    const logs = [];
    const mgr = { setLoop: (key, name, o) => logs.push({ key, name, ...o }), playSound() {}, setMusicLayer() {} };
    const m0 = p2.sound.manager;
    p2.sound.manager = mgr;
    await run(1.5);
    const quiet = logs.filter((l) => l.key === 'plazaSteam').at(-1);
    logs.length = 0;
    p2.sound.play('batarang_hit');
    await run(0.3);
    const ducked = logs.filter((l) => l.key === 'plazaSteam').at(-1);
    await run(2);
    const back = logs.filter((l) => l.key === 'plazaSteam').at(-1);
    check(quiet && Math.abs(quiet.volume - PS.volume * PS.scale) < 0.02 && PS.scale === 0.5 && ducked && ducked.volume < quiet.volume * 0.7 && back.volume < quiet.volume,
      `the plaza's steam loop plays at half level (${quiet?.volume.toFixed(3)} = ${PS.volume} × ${PS.scale}), ducks to ${ducked?.volume.toFixed(3)} when an effect plays and never rises above it while effects keep playing (${back?.volume.toFixed(3)})`);
    p2.sound.manager = m0 ?? null;
    void SS;
  }
  // The Fire Element must wait for the Guardian: no scene, no way past him
  hero.puppet(rel([A.wall + 3, 0]), Math.PI, 0);
  await run(0.3);
  check(Math.hypot(hero.position.x - C.x, hero.position.z - C.z) <= A.wall - A.stayIn + 0.2, 'the plaza holds AJ in on every side while the Guardian stands');
  await fire.startElementScene();
  fire.pedestal = { t: 99, done: true }; // (even a pedestal that were up)
  fire.orb.group.visible = true;
  hero.puppet(rel([0, 0]), Math.PI, 0);
  await run(0.6);
  check(!fire.sceneStarted && !fire.elementReady && p2.at === 'fireBoss' && !fire.elementDone && view.lines.length === 0, 'the Fire Element scene does not start before the Furnace Guardian is defeated (even standing on the pedestal)');
  fire.pedestal = null;
  fire.orb.group.visible = false;
  // Batarang on foot: auto-aims at the Guardian, 1 gem, 1 HP (x1)
  hero.puppet(rel([0, 6]), Math.PI, 0);
  G.position.copy(rel([0, -4]));
  G.state = 'recover'; G.t = -10; // (holding still)
  const hp0 = G.hp, am0 = fire.arsenal.ammo;
  fire.arsenal.cooldowns.batarang = 0;
  const used = fire.arsenal.use('batarang');
  await seconds(3, () => !fire.arsenal.proj && !fire.arsenal.pending && fire.arsenal.stats.catches > 0);
  check(used && G.hp <= hp0 - 1 && fire.arsenal.ammo === am0 - 1 && ui.boss?.on, `the Batarang from AJ's hand hits the Guardian for 1 (${hp0} → ${G.hp}), 1 gem; the boss bar shows`);
  const ar = fire.arsenal;
  ar.gearStock = F.weapons.gearWheel.gears;
  ar.cooldowns.gearWheel = 0;
  hero.puppet(rel([0, 6]), Math.PI, 0);
  G.position.copy(rel([0, -4])); G.model.position.copy(G.position); G.heading = 0; G.state = 'recover'; G.t = -999; G.hp = 30; G.alive = true;
  const hpWheel = G.hp;
  const dodgesBefore = G.stats.wheelDodges ?? 0;
  const wheelDir = new THREE.Vector3(G.position.x - hero.position.x, 0, G.position.z - hero.position.z).normalize();
  const numbersBeforeWheel = ui.numbers.length;
  let wheelImpact = false, wheelStarted = false, wheelStopped = false, wheelBounced = false;
  const wheelUsed = ar.use('gearWheel');
  await seconds(2, () => {
    wheelStarted ||= !!ar.wheel;
    wheelStopped ||= !!ar.wheel?.stopped && ar.wheel.speed === 0;
    wheelBounced ||= !!ar.wheel && ar.wheel.dir.dot(wheelDir) < 0;
    wheelImpact ||= ar.fx.impacts.length > 0;
    return wheelStarted && !ar.wheel;
  });
  check(wheelUsed && wheelStarted && G.hp <= hpWheel - F.weapons.gearWheel.damage && wheelStopped && !wheelBounced && ar.gearStock === 0 && (G.stats.wheelDodges ?? 0) === dodgesBefore + 1,
    `the Gear Wheel hits the Guardian at its legs/body, damages it, then drops and stops (no bounce; it costs its gears in the plaza too); the Guardian makes one timely dodge`);
  check(wheelImpact && ui.numbers.slice(numbersBeforeWheel).some((n) => n.text === '-3'),
    'the boss impact shows a "-3" damage popup');
  ar.clear();
  fire.items.keys = 1;
  ar.cooldowns.cogShot = 0;
  G.position.copy(rel([0, -4])); G.model.position.copy(G.position); G.heading = 0; G.state = 'recover'; G.t = -999; G.hp = 30; G.alive = true;
  hero.puppet(rel([0, 6]), Math.PI, 0);
  const cogBossHp = G.hp;
  const cogBoss = ar.use('cogShot');
  await seconds(3, () => !ar.pending && !ar.cog && G.hp < cogBossHp);
  check(cogBoss && G.hp <= cogBossHp - F.weapons.cogShot.damage && fire.items.keys === 0,
    `Cog Shot's torso hit sphere damages the Furnace Guardian (${cogBossHp} → ${G.hp})`);
}


// 6) The Guardian's three attacks, his regen, the gem rings, a revive in the plaza, his defeat.
{
  const guardAt = (v, heading = 0) => { G.position.copy(rel(v)); G.heading = heading; G.model.position.copy(G.position); };
  const heroAt = (v) => { hero.puppet(rel(v), Math.PI, 0); hero.velocity.set(0, 0, 0); hero.resetStatus?.(); };
  const prep = () => { G.marksDone.clear(); fire.arenaItems.clear(); lives.setHearts(lives.maxHearts); hurts.length = 0; G.hp = G.maxHp; G.sinceHit = 0; G.state = 'recover'; G.t = -50; G.cool = { stomp: 0, steam: 0, charge: 0 }; held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false, ability: null }; };
  const hearts0 = () => lives.hearts;
  // Stomp: a red circle (the windup, Tick calls it), the slam, a ring spreads — standing on the ground costs a heart
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  const tc0 = ui.toasts.length, beep0 = count('tick_beep'), stomps0 = G.stats.stomps;
  G.startAttack('stomp');
  await run(0.5);
  check(G.state === 'stompWind' && G.tgStomp.visible && toastsSince(tc0).includes(FD.tick.stomp) && count('tick_beep') >= beep0 + 3, `Stomp: the floor is marked red while he rears up, and Tick calls "${FD.tick.stomp}" with chirps`);
  const hStomp = lives.hearts;
  await seconds(3, () => G.state === 'recover');
  check(G.stats.stomps === stomps0 + 1 && hurts.some((h) => h.source === 'stomp' && h.n === B.stomp.damage) && lives.hearts === hStomp - B.stomp.damage && count('furnace_guardian_stomp') >= 1, `the shockwave ring catches AJ on the ground: ${B.stomp.damage} heart`);
  // jump over the ring
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  G.startAttack('stomp');
  await seconds(2, () => G.state === 'stompRing');
  await run(0.42);
  held.jumpPressed = true;
  await frame();
  held.jumpPressed = false;
  let maxY = 0;
  await seconds(3, () => { maxY = Math.max(maxY, hero.position.y); return G.state === 'recover'; });
  check(maxY > B.stomp.jumpClear && !hurts.some((h) => h.source === 'stomp'), `jumping as the ring passes (AJ rose ${maxY.toFixed(1)}) takes no damage`);
  // The Stomp telegraph is 1.5 s with a warning sound; a landed stomp is half a heart, not more
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  const sw0 = count('stomp_warning');
  G.startAttack('stomp');
  let wind = 0;
  await seconds(4, () => { if (G.state === 'stompWind') wind += dt; return G.state === 'stompRing'; });
  check(Math.abs(wind - B.stomp.windup) < 0.25 && B.stomp.windup === 1.5 && count('stomp_warning') === sw0 + 1 && B.stomp.damage === 0.5, `Stomp telegraph: the ring shows ${wind.toFixed(2)} s before the slam, with a warning sound; a landed stomp costs ${B.stomp.damage} heart`);
  await seconds(3, () => G.state === 'recover');
  // Fire Ball: a longer-range projectile, 1 heart on a hit; a jump clears it; no air-punch
  prep(); guardAt([0, -7]); heroAt([0, 11]);
  G.startAttack('fireball');
  check(G.state === 'fireWind', 'Fire Ball: he winds up and fires from his chest');
  let ball = false;
  await seconds(3, () => { if (G.balls.length) ball = true; return ball && !G.balls.length; });
  const fb = hurts.filter((h) => h.source === 'fireball');
  check(ball && fb.length === 1 && fb[0].n === B.fireball.damage, `a ball of fire flies at AJ and costs ${B.fireball.damage} heart on a hit`);
  // Steam burst: the cone is marked, then half a heart once; out of the cone nothing
  prep(); guardAt([0, -7], 0); heroAt([0, 3]); // (AJ straight in front: in the cone)
  G.startAttack('steam');
  await run(0.5);
  check(G.state === 'steamWind' && G.cone.visible, 'Steam Burst: the cone is marked on the floor first');
  await seconds(4, () => G.state === 'recover');
  const steamHits = hurts.filter((h) => h.source === 'steam');
  check(steamHits.length === 1 && steamHits[0].n === B.steam.damage && count('furnace_guardian_steam_burst') >= 1, `AJ in the cone: half a heart, once per burst (${steamHits.length} hit)`);
  prep(); guardAt([0, -7], 0); heroAt([9, 4]); // (well to the side)
  G.startAttack('steam');
  await seconds(4, () => G.state === 'recover');
  check(!hurts.some((h) => h.source === 'steam'), 'out of the cone (a step to the side) the steam does nothing');
  // Furnace charge: the lane is marked, then a straight rush; a pillar stuns him for 3 s (extra damage)
  prep();
  const pil = fire.guardian.pillars[0];
  guardAt([pil.x - 14, pil.z], Math.PI / 2); heroAt([-10, -12]);
  G.startAttack('charge');
  G.heading = Math.PI / 2;
  await run(0.4);
  check(G.state === 'chargeWind' && G.lane.visible, 'Furnace Charge: the lane he will rush along is marked on the floor');
  G.laneDir = new THREE.Vector3(1, 0, 0);
  G.heading = Math.PI / 2;
  await seconds(4, () => G.state === 'stunned');
  check(G.state === 'stunned' && G.stats.stuns === 1, 'the rush ends on a pillar: he stuns himself');
  const sh0 = G.hp;
  G.takeHit(1);
  check(Math.abs((sh0 - G.hp) - B.charge.stunDamage) < 1e-6, `stunned he takes ${B.charge.stunDamage}× damage`);
  const tStun = G.t;
  await seconds(B.charge.stun + 1, () => G.state === 'recover');
  check(G.state === 'recover' && G.t < 1.2, `and the stun lasts ${B.charge.stun} s`);
  void tStun;
  // The Guardian does not leave the plaza.
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  G.position.copy(rel([60, 60])); G.state = 'chase';
  await run(0.2);
  check(Math.hypot(G.position.x - C.x, G.position.z - C.z) <= A.wall, 'he cannot leave the plaza (leashed to it)');
  // Regeneration (only once AJ stops hitting him)
  prep(); guardAt([0, -7]); heroAt([0, 14]); G.state = 'recover'; G.t = -999;
  G.hp = 15; G.sinceHit = 0;
  const AR = A;
  await run(AR.bossRegenDelay - 0.5);
  const unchanged = G.hp === 15 && !G.regenerating;
  await run(1.5); // (a second of healing)
  const regen = G.hp - 15;
  const expect = G.maxHp * (AR.bossRegenPercentPerSec / 100) * 1;
  check(unchanged && G.regenerating && Math.abs(regen - expect) < 0.12 && ui.boss?.regen, `he regenerates only after ${AR.bossRegenDelay} s without a hit, ${AR.bossRegenPercentPerSec}% of his health a second (+${regen.toFixed(2)} in 1 s), the bar pulsing`);
  G.takeHit(1);
  check(!G.regenerating && G.sinceHit === 0, 'any hit stops it at once');
  // The arena's supply: 3 blue gems by the pillars, a new one every 12 s (max 3 on the floor), the free Gear Wheel, the stagger drops, the potion at 50%
  fire.arenaItems.clear();
  fire.stats.supplyGems = 0;
  fire.startSupply();
  await run(0.4);
  G.state = 'recover'; G.t = -9999; G.cool = { stomp: 99, steam: 99, charge: 99, fireball: 99 }; G.marksDone.clear(); G.hp = G.maxHp;
  hero.puppet(rel([0, 16]), Math.PI, 0); hero.resetStatus?.();
  const sup = () => fire.arenaItems.entries.filter((e) => e.id.startsWith('supply') && !e.taken);
  const pils = fire.guardian.pillars;
  const nearPillar = (e) => pils.some((q) => Math.hypot(e.pos.x - (C.x + q.x), e.pos.z - (C.z + q.z)) <= q.r + A.arenaGemOffset + 0.5);
  check(sup().length === A.arenaGems && A.arenaGems === 3 && sup().every((e) => e.ammo === A.arenaGemAmmo && A.arenaGemAmmo === 5 && nearPillar(e)), `the fight starts with ${sup().length} blue gems by the pillars, +${A.arenaGemAmmo} Batarangs each`);
  fire.arsenal.ammo = 4;
  const gem1 = sup()[0];
  hero.puppet(gem1.pos.clone().add(new THREE.Vector3(1.8, 0, 0)), 0, 0);
  await run(1);
  const stays = !gem1.taken;
  hero.puppet(gem1.pos.clone(), 0, 0);
  await run(0.3);
  check(stays && gem1.taken && fire.arsenal.ammo === 9, `a supply gem stays put until AJ walks into it, then +5 (4 → ${fire.arsenal.ammo})`);
  hero.puppet(rel([0, 16]), Math.PI, 0);
  check(sup().length === 2, 'two are left on the floor');
  fire.supplyT = 0;
  await run(A.arenaGemRespawn + 0.6);
  check(sup().length === 3, `${A.arenaGemRespawn} s later a new one appears at a random pillar (3 on the floor)`);
  await run(A.arenaGemRespawn * 2 + 0.6);
  check(sup().length === 3, 'never more than 3 on the floor at once');
  // the Gear Wheel costs gears in the plaza too, and recharges in 12 s
  const arA = fire.arsenal;
  arA.gearStock = F.weapons.gearWheel.gears; arA.cooldowns.gearWheel = 0; arA.clear();
  const wheelPaid = arA.canAfford('gearWheel') && arA.usesLeft('gearWheel') === 1 && arA.use('gearWheel');
  await run(0.5);
  check(wheelPaid && arA.gearStock === 0 && arA.cooldowns.gearWheel > A.arenaGearWheelCooldown - 1.5 && A.arenaGearWheelCooldown === 12 && F.weapons.gearWheel.gears === 3, `the Gear Wheel costs 3 gears in the plaza and recharges in ${A.arenaGearWheelCooldown} s (${arA.cooldowns.gearWheel.toFixed(1)} left)`);
  // resupply: brass gears every 10 s (max 4), a cog key every 25 s (max 2)
  const onFloor = (k) => fire.arenaItems.entries.filter((e) => e.id.startsWith(k) && !e.taken).length;
  fire.gearT = 0; fire.keyT = 0;
  await run(A.arenaGearRespawn * 6 + 0.6);
  check(onFloor('gear') === A.arenaGearMax && onFloor('key') === A.arenaKeyMax && A.arenaGearRespawn === 10 && A.arenaKeyRespawn === 25, `brass gears every ${A.arenaGearRespawn} s (${onFloor('gear')} on the floor, max ${A.arenaGearMax}) and cog keys every ${A.arenaKeyRespawn} s (${onFloor('key')}, max ${A.arenaKeyMax})`);
  const gEntry = fire.arenaItems.entries.find((e) => e.id.startsWith('gear') && !e.taken);
  const kEntry = fire.arenaItems.entries.find((e) => e.id.startsWith('key') && !e.taken);
  const gs0 = arA.gearStock, ks0 = fire.items.keys;
  hero.puppet(gEntry.pos.clone(), 0, 0); await run(0.3);
  hero.puppet(kEntry.pos.clone(), 0, 0); await run(0.3);
  check(gEntry.taken && kEntry.taken && arA.gearStock >= gs0 + A.arenaGearValue && fire.items.keys >= ks0 + 1, 'walking into a plaza gear adds to the Gear Wheel stock and a cog key to the Cog Shot');
  arA.clear();
  // a staggered Guardian drops a gem (up to 4 a fight)
  for (let k = 0; k < 6; k++) { G.state = 'recover'; G.stagger(2); }
  await run(0.2);
  const drops = fire.arenaItems.entries.filter((e) => e.id.startsWith('stagger'));
  check(drops.length === A.staggerDrop.max && A.staggerDrop.max === 4 && drops.every((e) => e.ammo === A.arenaGemAmmo), `a stagger drops a blue gem, up to ${A.staggerDrop.max} in a fight (${drops.length} after six)`);
  // the green potion at half health
  G.state = 'recover'; G.t = -9999;
  fire.arenaItems.entries.filter((e) => e.id === 'arenaPotion').forEach((e) => { e.taken = true; e.model.visible = false; }); // (an earlier one, if any)
  hero.puppet(rel([0, 16]), Math.PI, 0);
  lives.setHearts(3);
  G.hp = G.maxHp * A.potionMark + 0.5;
  G.takeHit(1);
  await run(0.1);
  const potion = fire.arenaItems.entries.filter((e) => e.id === 'arenaPotion').at(-1);
  check(!!potion && !potion.taken && nearPillar(potion), 'a green potion appears by a pillar when he drops to half health');
  for (let k = 0; k < 20 && !potion.taken; k++) { hero.puppet(potion.pos.clone(), 0, 0); await frame(); }
  check(potion.taken && lives.hearts === 3 + F.greenPotionHearts, `...and heals ${F.greenPotionHearts} heart (3 → ${lives.hearts})`);
  G.hp = G.maxHp; G.marksDone.clear();
}

// 6b) The Shield in the plaza: jumps beat the Stomp (the Shield doesn't stop it), blocks stop the rest, a perfect block staggers him.
{
  const SH = F.shield;
  const guardAt = (v, heading = 0) => { G.position.copy(rel(v)); G.heading = heading; G.model.position.copy(G.position); };
  const heroAt = (v) => { hero.puppet(rel(v), Math.PI, 0); hero.velocity.set(0, 0, 0); hero.resetStatus?.(); };
  const prep = () => { G.marksDone.clear(); fire.arenaItems.clear(); lives.setHearts(lives.maxHearts); hurts.length = 0; G.hp = G.maxHp; G.alive = true; G.sinceHit = 0; G.state = 'recover'; G.t = -50; G.cool = { stomp: 0, steam: 0, charge: 0 }; held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false, ability: null }; };
  const ar12 = fire.arsenal;
  const tap = () => { ar12.cooldowns.shield = 0; return ar12.use('shield'); };
  // no Shield yet: the steam burst lands
  ar12.shieldUnlocked = false;
  prep(); guardAt([0, -7], 0); heroAt([0, 3]);
  G.startAttack('steam');
  await seconds(4, () => G.state === 'recover');
  check(hurts.filter((h) => h.source === 'steam').length === 1 && !ar12.use('shield'), 'without the Shield the Steam Burst lands (half a heart) and the button does nothing');
  ar12.shieldUnlocked = true;
  check(ar12.has('shield') && ar12.visible('shield') && ar12.usesLeft('shield') === null, 'with the Shield the button is there (no count)');
  // a plain block: raised for a while before the burst lands
  prep(); guardAt([0, -7], 0); heroAt([0, 3]);
  G.startAttack('steam');
  await seconds(2, () => G.state === 'steamWind');
  await run(SH.perfectWindow + 0.2);
  const b0 = ar12.stats.blocks ?? 0, p0 = ar12.stats.perfects ?? 0;
  const raised = tap();
  await seconds(4, () => G.state === 'recover');
  check(raised && (ar12.stats.blocks ?? 0) >= b0 + 1 && hurts.filter((h) => h.source === 'steam').length === 0 && (ar12.stats.perfects ?? 0) === p0 && G.state === 'recover', `a raised Shield blocks the Steam Burst (no damage, ${(ar12.stats.blocks ?? 0) - b0} block), a plain block does not stagger him`);
  // the Shield is up for a moment, then a cooldown
  await run(SH.duration);
  check(ar12.shieldRemaining === 0 && ar12.cooldowns.shield > 0 && !ar12.use('shield') && ar12.blockReason('shield') === 'cooldown', `it drops after ${SH.duration} s and has a ${SH.cooldown} s cooldown`);
  // the Stomp is not blocked: a raised Shield still costs the heart; a jump clears it
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  G.startAttack('stomp');
  await seconds(3, () => G.state === 'stompWind');
  await run(B.stomp.windup - 0.5);
  tap();
  await seconds(4, () => G.state === 'recover');
  check(hurts.filter((h) => h.source === 'stomp').length === 1 && B.stomp.damage === 0.5, 'the Shield does not stop the Stomp (a heart is lost): it has to be jumped');
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  G.startAttack('stomp');
  await seconds(2, () => G.state === 'stompRing');
  await run(0.42);
  held.jumpPressed = true;
  await frame();
  held.jumpPressed = false;
  await seconds(4, () => G.state === 'recover');
  check(!hurts.some((h) => h.source === 'stomp'), 'a jump over the ring clears the Stomp');
  // the fire ball and the charge are blocked too
  prep(); guardAt([0, -7]); heroAt([0, 11]);
  G.startAttack('fireball');
  await seconds(3, () => G.balls.length > 0);
  tap();
  await seconds(3, () => !G.balls.length);
  check(!hurts.some((h) => h.source === 'fireball'), 'a raised Shield stops the Fire Ball');
  // PILLARS: a Fire Ball bursts on a pillar and a pillar shields AJ standing behind it (also from the steam)
  const PL = fire.guardian.pillars[0]; // (9.2, 9.2) from the middle
  prep(); guardAt([PL.x, -3], 0); heroAt([PL.x, PL.z + 4]);
  const burst0 = G.stats.pillarBursts ?? 0;
  G.startAttack('fireball');
  await seconds(4, () => G.state === 'recover');
  await run(1.5);
  check((G.stats.pillarBursts ?? 0) === burst0 + 1 && !hurts.some((h) => h.source === 'fireball') && G.balls.length === 0, 'a Fire Ball aimed at AJ behind a pillar bursts on the pillar and never touches him');
  prep(); guardAt([PL.x, 3.5], 0); heroAt([PL.x, PL.z + 3.5]);
  G.startAttack('steam');
  await seconds(4, () => G.state === 'recover');
  check(!hurts.some((h) => h.source === 'steam'), 'the Steam Burst does not reach AJ behind a pillar either');
  prep(); guardAt([PL.x, 3.5], 0); heroAt([PL.x + 4, PL.z + 3.5]); // (the same, but out from behind it: in the cone and clear)
  G.startAttack('steam');
  await seconds(4, () => G.state === 'recover');
  check(hurts.filter((h) => h.source === 'steam').length === 1, '...and with a clear line it does');
  // REFLECT: a perfect block sends the Fire Ball back — 8% of his health and a stagger; a plain block just stops it
  prep(); guardAt([0, -7], 0); heroAt([0, 11]);
  G.startAttack('fireball');
  await seconds(4, () => G.balls.length > 0);
  tap(); // (raised as it leaves him: a plain block by the time it lands)
  const refl0 = G.stats.reflected ?? 0;
  await seconds(3, () => !G.balls.length);
  check((G.stats.reflected ?? 0) === refl0 && !hurts.some((h) => h.source === 'fireball') && G.state !== 'staggered', 'a plain block just negates the Fire Ball (no reflect, no stagger)');
  prep(); guardAt([0, -7], 0); heroAt([0, 11]); ar12.shieldRemaining = 0; ar12.cooldowns.shield = 0;
  G.startAttack('fireball');
  await seconds(4, () => G.balls.length > 0);
  const ball0 = G.balls[0];
  await seconds(3, () => Math.hypot(ball0.pos.x - hero.position.x, ball0.pos.z - hero.position.z) < 3.2);
  const hpR = G.hp;
  tap();
  await seconds(3, () => ball0.reflected);
  check(ball0.reflected && !hurts.some((h) => h.source === 'fireball'), 'a perfect block (raised within 0.3 s of the hit) sends the Fire Ball back at the Guardian: AJ takes nothing');
  await seconds(3, () => (G.stats.reflected ?? 0) === refl0 + 1);
  check((G.stats.reflected ?? 0) === refl0 + 1 && G.state === 'staggered' && Math.abs((hpR - G.hp) - G.maxHp * B.fireball.shieldReflectDamage) < 0.05 && B.fireball.shieldReflectDamage === 0.08, `it hits him for ${(B.fireball.shieldReflectDamage * 100).toFixed(0)}% of his health (${(hpR - G.hp).toFixed(1)} of ${G.maxHp}) and staggers him (×${B.staggerDamage} for ${F.shield.staggerTime} s)`);
  // a PERFECT block: tapped just as it lands → he is staggered and takes extra
  prep(); guardAt([0, -7], 0); heroAt([0, 3]);
  G.startAttack('steam');
  await seconds(4, () => G.state === 'steamWind');
  await seconds(4, () => G.state === 'steamBurst' || G.state === 'steam' || (G.t >= 0 && G.state !== 'steamWind'));
  const pp0 = ar12.stats.perfects ?? 0;
  ar12.cooldowns.shield = 0; ar12.shieldRemaining = 0;
  tap(); // (raised right before the burst's first hit lands: inside the perfect window)
  await seconds(4, () => G.state === 'staggered');
  check((ar12.stats.perfects ?? 0) === pp0 + 1 && G.state === 'staggered' && !hurts.some((h) => h.source === 'steam'), `a perfect block (tapped within ${SH.perfectWindow} s of the hit): no damage, and the Guardian is staggered`);
  // the Shield now blocks the Stomp wave (on the ground, facing it); a perfect block staggers him
  prep(); guardAt([0, -7], 0); heroAt([0, 3]);
  G.startAttack('stomp');
  await seconds(4, () => G.state === 'stompRing' && G.waveR >= 8);
  const sp0 = ar12.stats.perfects ?? 0;
  ar12.cooldowns.shield = 0; ar12.shieldRemaining = 0;
  tap();
  await seconds(4, () => G.state === 'staggered' || G.state === 'recover');
  check((ar12.stats.perfects ?? 0) === sp0 + 1 && G.state === 'staggered' && !hurts.some((h) => h.source === 'stomp') && SH.blocks.includes('stomp'), 'a perfect block of the Stomp wave: no damage, the Guardian staggered');
  const hpS = G.hp;
  G.takeHit(1, 'batarang');
  check(Math.abs((hpS - G.hp) - B.staggerDamage) < 0.01, `while staggered he takes ×${B.staggerDamage} (1 → ${(hpS - G.hp).toFixed(2)})`);
  await seconds(SH.staggerTime + 1, () => G.state !== 'staggered');
  check(G.state !== 'staggered', `...and the stagger ends after ${SH.staggerTime} s`);
  // a blow from behind is not blocked
  prep(); guardAt([0, 8], Math.PI); heroAt([0, 3]); // (he is behind AJ, who faces -z)
  tap();
  const behind = ar12.shieldBlock(rel([0, 8]), 'charge');
  check(behind === null, 'a hit from behind is not blocked');
  ar12.shieldRemaining = 0;
  prep();
}

// 7) Died in the plaza: revived inside with full hearts, 3 s of protection; he keeps half of the damage and backs off. Then his defeat.
{
  const guardAt = (v) => { G.position.copy(rel(v)); G.model.position.copy(G.position); };
  hurts.length = 0;
  G.hp = 12; G.state = 'chase'; G.t = 0;
  guardAt([0, -3]);
  hero.puppet(rel([0, 3]), Math.PI, 0);
  hero.resetStatus?.();
  lives.setHearts(0.5);
  const respawns0 = lives.respawns;
  lives.damage(1);
  lives.resolveDeath();
  p2.respawn();
  const hpAfter = G.hp;
  check(lives.hearts === lives.maxHearts && lives.respawns === respawns0 - 1 && p2.at === 'fireBoss' && hero.invincible && hero.reviveShield > 2.5, 'dying in the plaza uses a respawn and revives AJ inside it with full hearts and 3 s of protection');
  check(Math.abs(hpAfter - (12 + (G.maxHp - 12) * A.reviveRecover)) < 0.01 && hpAfter < G.maxHp && G.state === 'retreat' && fire.arsenal.ammo >= A.reviveAmmo, `the Guardian regains only half of what he lost (12 → ${hpAfter}) and backs off; gems topped up (${fire.arsenal.ammo})`);
  const d0 = Math.hypot(G.position.x - hero.position.x, G.position.z - hero.position.z);
  await run(2.5);
  const d1 = Math.hypot(G.position.x - hero.position.x, G.position.z - hero.position.z);
  check(d1 > d0 + 3 && !hurts.length && fire.barrier.state === 'closed', `he backs away to the far side (${d0.toFixed(0)} → ${d1.toFixed(0)}) without attacking while AJ is protected; the gate stays shut`);
  await run(1.5);
  check(G.state === 'chase' || G.state === 'recover' || G.state.endsWith('Wind'), 'then the fight goes on');
  // defeat
  G.state = 'recover'; G.t = -999;
  G.hp = 1;
  G.takeHit(1);
  check(G.state === 'dying' && !G.alive && count('boss_mech_death') >= 1, 'the last hit: the Guardian falls (a death animation, flames)');
  const t0 = ui.toasts.length;
  await seconds(B.deathTime + 0.5, () => !G.model.visible);
  await run(0.3);
  check(!G.model.visible && fire.barrier.state === 'opening' || fire.barrier.state === 'open', 'he falls apart and the steam barrier opens');
  check(toastsSince(t0).includes(FD.gateOpen) && count('steam_barrier_open') >= 1, `"${FD.gateOpen}"`);
  await seconds(A.pedestalTime + 0.5);
  check(fire.pedestal?.done && fire.orb.group.visible && fire.elementReady, 'a pedestal rises with the Fire Element: a swirling orb of red-orange flame');
}


// 8) The Fire Element: AJ reaches the orb → the scene (the camera circles, the flame flows into his hand, his eyes flash
//    orange, Tick and AJ talk, the hooded figure on the far tower, Amy?) → Fire Blast, the Elements row, the banner, the next stub.
{
  const L = FD.scene;
  hero.puppet(rel([0, 3.2]), Math.PI, 0);
  const bannersBefore = ui.banners.length;
  view.lines = [];
  let eyesSeen = false, cameoSeen = false, cameoGone = false, circled = new Set(), orbToHand = false, scenePlayed = false;
  await frame();
  check(state.is(STATES.CUTSCENE) && p2.at === 'fireElement' && fire.sceneStarted, 'walking up to the orb starts the scene (controls off)');
  const C0 = new THREE.Vector3(C.x, 0, C.z);
  let guard = 0;
  while (cinematic.active && guard++ < 60 * 90) {
    await frame();
    if (fire.eyes?.visible) eyesSeen = true;
    if (fire.cameo && fire.cameo.head && fire.cameo) { /* (the figure's group is in the scene) */ }
    const cg = p2.scene.getObjectByName('cameo');
    if (cg?.visible) cameoSeen = true;
    if (cameoSeen && cg && !cg.visible) cameoGone = true;
    const a = Math.round(Math.atan2(cam.camera.position.x - C0.x, cam.camera.position.z - C0.z) * 4);
    circled.add(a);
    if (fire.orb.taken) orbToHand = true;
    if (view.complete) { view.complete = false; cinematic.tap(); cinematic.tap(); }
  }
  void scenePlayed;
  const want = [`${DIALOGUE.speakers.tick}: ${L.one}`, `${DIALOGUE.speakers.aj}: ${L.others}`, `${DIALOGUE.speakers.tick}: ${L.taken}`, `${DIALOGUE.speakers.tick}: ${L.watching}`, `${DIALOGUE.speakers.aj}: ${L.amy}`, `${DIALOGUE.speakers.tick}: ${L.cannot}`];
  const got = view.lines.map((l) => l.replace(/^(\w+):/, (m, k) => `${DIALOGUE.speakers[k] ?? k}:`));
  check(JSON.stringify(got) === JSON.stringify(want), `the lines, in order:\n       ${got.join('\n       ')}`);
  check(circled.size >= 3 && orbToHand && ui.flashes > 0, `the camera circles the orb (${circled.size} directions), the flame flows into his hand, a flash`);
  check(eyesSeen && cameoSeen && cameoGone, 'his eyes flash orange; a hooded figure in violet is seen on a distant tower and vanishes in a puff of violet light');
  await run(0.5);
  check(p2.elements.includes('fire') && ui.elements.includes('fire') && fire.arsenal.fireUnlocked && input.pulsed === 'fireBlast' && ui.banners.length > bannersBefore && ui.banners.at(-1) === 'Fire Element recovered', `"Fire Element recovered": the Elements row lights Fire, Fire Blast is unlocked`);
  for (let i = 0; i < 400 && !(p2.lvId === 'lightning' && p2.fire.stage === 'ride'); i++) { await frame(); await new Promise((r) => setTimeout(r, 25)); } // (the next level builds itself: real file reads)
  await frame();
  check(p2.at === 'fire' && p2.lvId === 'lightning' && p2.objective === 'lightning' && !fire.stage, `then the next place: the Lightning level begins ("${ui.quest}")`);
  check(input.combat.ab === fire.arsenal && input.combat.ab.visible('fireBlast') && !input.combat.hidden && ui.elements.length === 1 && ui.elementsShown, 'Fire Blast stays on the buttons in the rest of Part 2; the Elements row stays');
  // the blast works on foot anywhere: a cooldown ring, no count
  const ar = fire.arsenal;
  ar.cooldowns.fireBlast = 0;
  held.ability = 'fireBlast';
  await frame();
  check(ar.cooldownFraction('fireBlast') > 0.9 && ar.stats.blasts >= 1, 'Fire Blast on foot: a tap throws it (a fire ball, even with nothing to hit)');
  await run(F.fireBlast.cooldown + 0.5);
}

// 9) Fire Blast on the Guardian (3 + a 3 s burn) and on horseback; the courtyard after the level.
{
  await levels.load('part2', { start: 'fireBoss' });
  await run(1);
  const g = fire.guardian;
  hero.puppet(rel([0, 6]), Math.PI, 0);
  g.position.copy(rel([0, -3])); g.state = 'recover'; g.t = -999; g.hp = 30;
  const ar = fire.arsenal;
  ar.cooldowns.fireBlast = 0;
  ar.use('fireBlast');
  await run(1.6);
  const afterHit = g.hp;
  check(ar.fireUnlocked && afterHit <= 30 - F.fireBlast.damage + 0.3 && !!g.burn, `Fire Blast on the Guardian: ${F.fireBlast.damage} damage (30 → ${afterHit.toFixed(1)}) and he burns`);
  await run(F.fireBlast.burn.time + 0.3);
  check(g.hp <= 30 - F.fireBlast.damage - F.fireBlast.burn.dps * F.fireBlast.burn.time + 0.6, `the burn takes ${F.fireBlast.burn.dps} a second for ${F.fireBlast.burn.time} s (→ ${g.hp.toFixed(1)}): 6 in all`);
  // on horseback (the ride): auto-aim at a scout
  await levels.load('part2', { start: 'fire' });
  await run(0.5);
  fire.foes.reset(0);
  place(430, 0, { speed: 0 });
  fire.foes.triggered.clear();
  place(452, 0, { speed: 0 });
  await seconds(3, () => alive(fire.foes.scouts).length >= 2 && ar.pick() !== null);
  const tg = ar.pick();
  const hp0 = tg.hp;
  ar.cooldowns.fireBlast = 0;
  ar.use('fireBlast');
  await seconds(3, () => !tg.alive || tg.hp < hp0);
  check(horse.mounted && (!tg.alive || tg.hp < hp0), 'Fire Blast works from the saddle too');
  // Retry / Game Over hook: the level starts again
  lives.setHearts(0.5); lives.damage(1);
  p2.retry();
  await run(1);
  check(p2.at === 'fire' && lives.hearts === lives.maxHearts && fire.stage === 'ride', 'Game Over → Retry restarts the Fire level from its start');
  // leaving the level puts its tints and models away
  await levels.load('part2', { start: 'courtyard' });
  check(!fire.parts.root.visible && ui.keys?.show === false && p2.scene.fog.color.getHex() === p2.scene.background.getHex(), 'out of the level: its models hidden, the cog-key counter gone, the look restored');
}

// 10) The one hero state (alive / downed / respawning): no invulnerability left over from the ride, and dying again and again always ends alive.
{
  const P2c = CONFIG.part2.down;
  const D = CONFIG.testMenu;
  check(DIALOGUE.testMenu.invulnerable(true) === 'Invulnerable: yes' && DIALOGUE.testMenu.invulnerable(false) === 'Invulnerable: no' && DIALOGUE.testMenu.heroState('downed') === 'Hero state: downed', 'the ?debug menu lines read "Invulnerable: yes / no" and "Hero state: …"');
  void D;
  await levels.load('part2', { start: 'fire' });
  await run(0.5);
  const f2 = p2.fire;
  const ar2 = f2.arsenal;
  lives.reset?.();
  lives.setHearts(lives.maxHearts);
  // a hit on the ride leaves protection; entering the plaza clears every flag, then protects at most `entryProtection` s
  hero.iframes = 50; hero.reviveShield = 50; hero.superArmor = true; // (worst case: stuck flags)
  place(1290, 0, { speed: 0 });
  await f2.ride.onFinish();
  await run(0.3);
  check(p2.at === 'fireBoss' && hero.life === 'alive' && !hero.superArmor && hero.iframes === 0 && hero.reviveShield <= F.arena.entryProtection && hero.reviveShield > 0, `entering the plaza clears every protection flag (a stuck 50 s one too), then at most ${F.arena.entryProtection} s of protection (${hero.reviveShield.toFixed(2)} left)`);
  await run(F.arena.entryProtection + 0.3);
  check(!hero.invincible && hero.life === 'alive', 'it expires on its own: AJ is vulnerable (Invulnerable: no)');
  const g2 = f2.guardian;
  const hearts0 = lives.hearts;
  const hurts0 = hurts.length;
  g2.hitHero(F.boss.stomp.damage, g2.position, { source: 'stomp' });
  await run(1.2);
  g2.hitHero(F.boss.fireball.damage, g2.position, { source: 'fireball' });
  await run(1.2);
  g2.hitHero(F.boss.steam.damage, g2.position, { source: 'steam', knockback: false });
  check(hurts.length === hurts0 + 3 && lives.hearts < hearts0 - 1.9, `stomp, fireball and steam all reach AJ right after the plaza ride (${hearts0} → ${lives.hearts} hearts)`);
  // dying, four times in a row: down, locked, revived once, up, alive, controls back
  for (let i = 1; i <= 4; i++) {
    await run(1.2); // (past the last hit's invincibility)
    if (i === 4) { // (the fourth time: from the saddle on the ride)
      await levels.load('part2', { start: 'fire' });
      await run(0.5);
      place(300, 0, { speed: CONFIG.horse.maxSpeed * 0.3 });
      await run(0.3);
    }
    lives.setHearts(0.5);
    const respawns0 = lives.respawns;
    const ok = damageHero(1, hero.position.x, hero.position.z, { source: 'stomp' });
    const lockedAfter = p2.fire.arsenal.blockReason('batarang') === 'down' && !p2.fire.arsenal.use('batarang') && !p2.fire.arsenal.use('gearWheel') && !p2.fire.arsenal.use('fireBlast');
    const noHit = damageHero(1, hero.position.x, hero.position.z, { source: 'stomp' }) === false;
    await run(0.5);
    check(ok && hero.life === 'downed' && hero.deathT > 0 && !input.enabled && lockedAfter && noHit && input.combat.hidden === true, `death ${i}${i === 4 ? ' (on the ride)' : ''}: AJ is downed, the fall plays, controls and ability buttons are locked, nothing can hurt him`);
    await run(P2c.time + 0.2);
    check(hero.life === 'respawning' && lives.respawns === respawns0 - 1 && lives.hearts === lives.maxHearts, `…after ${P2c.time} s the revive runs once: hearts full, a respawn used, getting up`);
    await run(P2c.getUp + 0.3);
    check(hero.life === 'alive' && hero.deathT < 0 && hero.getUpT < 0 && input.enabled && hero.reviveShield > 0 && hero.reviveShield <= P2c.protection && p2.downPhase === null, `…up again: alive, the lying-down animation cleared, controls back, ${hero.reviveShield.toFixed(1)} s of protection that ends on its own`);
    lives.respawns = Math.max(lives.respawns, 2); // (more lives for the next round)
    await run(P2c.protection + 0.2);
    check(!hero.invincible, '…and the protection has expired');
  }
  // the safety timeout: a get-up that never finishes is forced alive
  hero.die(); p2.downPhase = 'getup'; p2.downT = P2c.safety - 0.1; hero.life = 'respawning'; hero.getUpT = 0; lives.hearts = lives.maxHearts;
  await seconds(0.5, () => { if (hero.life !== 'alive') hero.getUpT = 0; return hero.life === 'alive'; });
  check(hero.life === 'alive' && p2.downPhase === null && (p2.stats.downSafety ?? 0) >= 1, `the ${P2c.safety} s safety timeout forces a stuck get-up back to alive`);
  // the watchdog: a protection flag that never ticks down is wiped
  hero.reviveShield = 1e6;
  await seconds(CONFIG.part2.down.invincibleMax + 0.5, () => hero.reviveShield < 1e5);
  check(hero.reviveShield < 1e5 && !hero.invincible, `a stuck protection flag is wiped by the watchdog after ${CONFIG.part2.down.invincibleMax} s`);
  // Game Over after the last respawn
  lives.respawns = 0;
  lives.setHearts(0.5);
  await run(1.2);
  damageHero(1, hero.position.x, hero.position.z, { source: 'stomp' });
  await run(P2c.time + 0.3);
  check(state.is(STATES.GAMEOVER) && p2.downPhase === 'over', 'with no respawn left, the fall ends in Game Over (once)');
  state.set(STATES.PLAY);
  p2.retry();
  await run(0.5);
  check(hero.life === 'alive' && input.enabled, 'Retry: alive, controls on');
}


// 11) Batarangs are limited (a cap, a clamp on entering the plaza, aimed straight, short range), the cog key is a beacon, the spike gears always hit.
{
  await levels.load('part2', { start: 'fire' });
  await run(0.5);
  const f3 = p2.fire;
  const ar = f3.arsenal, fo = f3.foes, rd = f3.ride;
  const P = CONFIG.part2;
  // the cap: gems (and a heap of them) never carry more than maxBatarangs; no other ability gives any back
  ar.ammo = 100;
  check(ar.ammo === ar.ammoCap && ar.ammoCap === Math.min(P.levelUpCaps.batarangCap, F.maxBatarangs + p2.levelBonus().batarangCap) && F.maxBatarangs === 12, `Batarangs are capped at maxBatarangs + the level-up bonus (${ar.ammo}; Lv ${p2.level})`);
  ar.ammo = 10;
  f3.items.keys = 3; ar.gearStock = F.weapons.gearWheel.gears * 2; ar.unlockFire?.();
  for (const n of ['fireBlast', 'cogShot', 'gearWheel']) { ar.cooldowns[n] = 0; ar.use(n); await run(0.4); }
  await run(3);
  check(ar.ammo === 10, 'Fire Blast, Cog Shot and Gear Wheel never give a Batarang back (still 10)');
  // blue gems add ammo only up to the cap
  const gemE = f3.items.entries.find((e) => e.type === 'gem' && !e.taken);
  place(track.nearest(gemE.pos.x, gemE.pos.z, 30).s, 0);
  horse.position.copy(gemE.pos.clone().setY(0));
  await run(0.3);
  check(gemE.taken && ar.ammo === ar.ammoCap, `a blue gem tops it up to the cap (10 → ${ar.ammo}), no further`);
  // auto-aim inside a 70° forward cone, straight otherwise; a miss is wasted; short range
  fo.reset(0); fo.clear();
  place(430, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  await seconds(4, () => alive(fo.scouts).length >= 1);
  held.moveY = 0;
  place(near().s, 0, { speed: 0 });
  await seconds(3, () => { const t = ar.pick(); return t && Math.hypot(t.position.x - horse.position.x, t.position.z - horse.position.z) < 10; });
  const tg = alive(fo.scouts)[0];
  alive(fo.scouts).forEach((x) => { x.active = false; }); // (held still)
  alive(fo.scouts).filter((x) => x !== tg).forEach((x) => x.position.add(new THREE.Vector3(400, 0, 400))); // (any partner far away: it must be the one aimed at)
  const toT = Math.atan2(tg.position.x - horse.position.x, tg.position.z - horse.position.z);
  horse.heading = toT + Math.PI * 0.75; // facing away: the throw goes away from it
  ar.ammo = 8; ar.cooldowns.batarang = 0;
  const hpT = tg.hp;
  const c00 = ar.stats.catches;
  ar.use('batarang');
  await seconds(4, () => ar.stats.catches > c00 && !ar.proj);
  check(ar.ammo === 7 && tg.hp === hpT, 'thrown the wrong way (nothing in the cone) the Batarang flies straight and misses: a Batarang wasted, the robot untouched');
  // AUTO-AIM: a foe 25° off the line is inside the 70° cone — the Batarang curves to it and hits; 50° off is outside the cone — a miss
  ar.ammo = 8; ar.cooldowns.batarang = 0;
  horse.heading = toT + (25 * Math.PI) / 180;
  const hpA = tg.hp;
  const cA = ar.stats.catches;
  ar.use('batarang');
  await seconds(4, () => ar.stats.catches > cA && !ar.proj);
  check(tg.hp < hpA && ar.ammo === 7, `auto-aim: a foe 25° off to the side (inside the ${P.fire.batarang.coneDeg}° cone) is hit — the Batarang curves to it (${hpA} → ${tg.hp})`);
  ar.cooldowns.batarang = 0;
  horse.heading = toT + (50 * Math.PI) / 180;
  const hpB = tg.hp;
  const cB = ar.stats.catches;
  ar.use('batarang');
  await seconds(4, () => ar.stats.catches > cB && !ar.proj);
  check(tg.hp === hpB && ar.ammo === 6, '50° off (outside the cone) it flies straight and misses: a Batarang wasted');
  ar.ammo = 6;
  horse.heading = toT;
  ar.cooldowns.batarang = 0;
  const catches0 = ar.stats.catches;
  let maxOut = 0;
  ar.use('batarang');
  await seconds(3, () => { if (ar.proj) maxOut = Math.max(maxOut, ar.proj.travelled); return ar.stats.catches > catches0 && !ar.proj; });
  check(tg.hp < hpT && ar.ammo === 5 && maxOut <= P.fire.batarang.range + 2, `facing it, it hits (${hpT} → ${tg.hp}); it never flies further than ${P.fire.batarang.range} (${maxOut.toFixed(0)}), ammo ${ar.ammo}`);
  // the button shows the count
  check(input.combat.ab.usesLeft('batarang') === ar.ammo, `the Batarang button's badge shows the ammo (${ar.ammo})`);
  // entering the plaza: the kept ammo, at least 6 and at most 10
  for (const [have, want] of [[1, 6], [8, 8], [12, 10]]) {
    ar.ammo = have;
    place(1290, 0, { speed: 0 });
    f3.ride.finished = false;
    await f3.ride.onFinish();
    await run(0.3);
    check(f3.stage === 'boss' && ar.ammo === want, `into the plaza with ${have} Batarangs: ${ar.ammo} (kept, min ${F.arena.ammoMin}, max ${F.arena.ammoMax})`);
    await levels.load('part2', { start: 'fire' });
    await run(0.3);
  }
  // the plaza holds exactly three gem pickups (one at each mark, +3 each); the Guardian's batarang damage is 1
  check(F.arena.arenaGems === 3 && F.arena.arenaGemAmmo === 5 && F.arena.arenaGemRespawn === 12 && F.batarang.damage === 1.5, 'the plaza supplies 3 blue gems (+5 each, a new one every 12 s); a Batarang that hits the Guardian does 1.5');
  // a cog key is a beacon, bigger than a gear, spinning slowly; collected with a sparkle sound
  const key0 = f3.items.find('key0');
  const U = key0.model.userData;
  const gearR = P.ride.gears.size * P.ride.gears.fit;
  check(!!U.beam && !!U.ring && U.beam.material.fog === false && P.items.types.cogKey.size >= gearR * 1.45 && P.items.types.cogKey.spin > 0 && P.items.cogKeyBeacon.beamHeight >= 12,
    `a cog key has a pulsing ring and a ${P.items.cogKeyBeacon.beamHeight}-high beam (unfogged), its cog ${(P.items.types.cogKey.size / gearR).toFixed(1)}× a gear, turning and bobbing`);
  const sp0 = count('cog_key_sparkle');
  place(track.nearest(key0.pos.x, key0.pos.z, 30).s, 0);
  horse.position.copy(key0.pos.clone());
  await run(0.3);
  check(key0.taken && count('cog_key_sparkle') === sp0 + 1, 'collecting it plays the little cog-sparkle sound');
  // every spike gear hits, every time: the whole body along its swept path, even crossing in a single frame
  const saws = rd.parts.saws;
  const S = P.ride.saw;
  let allHit = true;
  for (const sw of saws) {
    for (const k of [0, 1, 3]) {
      rd.time = (k * S.period) / 2 - (sw.phase * S.period) / (Math.PI * 2); // (the blade is at the middle of the road)
      rd.hzPrev = null;
      sw.wait = 0;
      place(sw.s - 3, 0, { speed: 0 });
      horse.mode = 'riding';
      rd.after(1 / 30);
      const hits0 = rd.stats.sawHits;
      place(sw.s + 3, 0, { speed: 0 }); // (6 in one frame: past the old 1.0 window)
      horse.mode = 'riding';
      rd.after(1 / 30);
      if (rd.stats.sawHits !== hits0 + 1) { allHit = false; }
      sw.wait = 0;
    }
  }
  check(allHit, `a horse crossing each spike gear in one big step is hit every time (${saws.length} saws × 3 blade phases)`);
  // a hit: the horse flinches, sparks, a sound, a shake; the same blade waits 1 s, nothing else holds it off
  const sw0 = saws[0];
  rd.time = -(sw0.phase * S.period) / (Math.PI * 2);
  sw0.wait = 0; hero.iframes = 50; hero.reviveShield = 50; // (leftover protection timers change nothing)
  place(sw0.s, 0, { speed: 8 });
  horse.mode = 'riding';
  const st0 = horse.stumbles, fl0 = count('saw_hit');
  rd.hzPrev = null;
  rd.after(1 / 60);
  check(horse.stumbles === st0 + 1 && count('saw_hit') === fl0 + 1 && hero.riderFlinch > 0 && sw0.wait === P.ride.hitCooldown && P.ride.hitCooldown === 1, `a saw hit: the horse flinches (stagger + a jolt), sparks and a clang, a 1 s cooldown for that blade — protection timers on AJ change nothing`);
  hero.resetStatus();
}

// 12) Pickup assist on the fire ride: gems / potions / keys within 3 of the lane are drawn in; further ones are left alone.
{
  await levels.load('part2', { start: 'fire' });
  await run(0.5);
  const f4 = p2.fire;
  const RM = f4.cfg;
  const gem = f4.items.entries.find((e) => e.type === 'gem' && !e.taken && !e.temp);
  const gs = track.nearest(gem.pos.x, gem.pos.z, 30);
  const x0 = gem.model.position.x, z0 = gem.model.position.z;
  place(gs.s - 14, gs.lateral + 2.6);
  held.moveY = 1;
  let pulled = 0;
  for (let i = 0; i < 200 && !gem.taken; i++) { await frame(); pulled = Math.max(pulled, Math.hypot(gem.model.position.x - x0, gem.model.position.z - z0)); }
  held.moveY = 0;
  check(gem.taken && RM.rideMagnetRadius === 3 && pulled > 0.3, `a gem 2.6 to the side of the lane (the plain reach is ${CONFIG.part2.items.pickupMagnetRadius}) is drawn in (${pulled.toFixed(1)}) and collected on the ride`);
  const gem2 = f4.items.entries.find((e) => e.type === 'gem' && !e.taken && !e.temp && e !== gem && Math.abs(track.nearest(e.pos.x, e.pos.z, 30).s - gs.s) > 60);
  const g2s = track.nearest(gem2.pos.x, gem2.pos.z, 30);
  const px = gem2.model.position.x, pz = gem2.model.position.z;
  place(g2s.s - 14, g2s.lateral + 3.9);
  held.moveY = 1;
  await run(2.5);
  held.moveY = 0;
  check(!gem2.taken && Math.hypot(gem2.model.position.x - px, gem2.model.position.z - pz) < 0.01, 'a gem 3.9 away from the lane is left alone');
  // the plaza at a normal ride (no gallop, the stick straight up, no turning back): every plaza gem and potion is collected
  f4.items.restore(null);
  const plazaItems = f4.items.entries.filter((e) => !e.chest && e.type !== 'cogKey' && !e.temp && track.nearest(e.pos.x, e.pos.z, 30).s >= F.plaza.from && track.nearest(e.pos.x, e.pos.z, 30).s <= F.plaza.to + 2);
  place(F.plaza.from - 10, 0, { speed: CONFIG.horse.maxSpeed });
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  for (let i = 0; i < 60 * 14 && near().s < F.plaza.to + 6; i++) await frame();
  held.moveY = 0;
  const got = plazaItems.filter((e) => e.taken).length;
  check(plazaItems.length >= 10 && got === plazaItems.length, `riding the plaza at a normal pace with the stick straight up: ${got} of ${plazaItems.length} gems and potions collected (the side ones drawn in), none missed`);
}

// 13) Cog keys: none under a rail or the belt deck; the ones missed there fly to AJ when he leaves it (25 units, cog keys only).
{
  await levels.load('part2', { start: 'fire' });
  await run(0.5);
  const f5 = p2.fire;
  const R5 = f5.cfg;
  const keys5 = f5.items.entries.filter((e) => e.type === 'cogKey');
  const under = keys5.filter((k) => {
    const n = track.nearest(k.pos.x, k.pos.z, 30);
    const deck = R5.decks.some((d) => n.s >= d.s[0] && n.s <= d.s[1] && Math.abs(n.lateral - d.lat) <= d.width / 2 && k.pos.y < d.top - 0.01);
    const rail = R5.rails.some((r) => n.s >= r.s[0] && n.s <= r.s[1] && Math.abs(n.lateral - r.lat) <= R5.grind.capture + 0.5 && k.pos.y < r.h - 0.01);
    const belt = f5.parts.conveyors.some((c) => n.s >= c.s[0] && n.s <= c.s[1]);
    return deck || rail || belt;
  });
  check(keys5.length === 7 && under.length === 0, `no cog key lies under a rail, the belt deck or a conveyor belt (${under.length} of ${keys5.length}); two are lifted onto the deck's top and the upper rail's line`);
  // leaving the deck: the key left there flies to him
  f5.items.restore(null);
  recallOn = true;
  const key0b = f5.items.find('key0'), farKey = f5.items.find('key1');
  place(100, 0, { speed: 0, y: R5.decks[0].top });
  await run(0.6);
  check(f5.ride.stats.belted > 0, 'AJ stands on the belt deck (it carries him)');
  const r0 = f5.items.stats.recalled ?? 0;
  const got0 = f5.items.keys;
  place(139, 0, { speed: 0 }); // (off its end, onto the street)
  await run(0.1);
  check((f5.items.stats.recalled ?? 0) === r0 + 1 && !!key0b.recall, `leaving the deck calls the missed cog key (within ${F.cogKeyRecallRadius}) — and only that one`);
  await run(1.5);
  check(key0b.taken && f5.items.keys === got0 + 1 && !farKey.taken && !farKey.recall, 'it flies to him and is collected; the cog key 70 away stays where it is (only cog keys are recalled)');
  recallOn = false;
  f5.items.restore(null);
}

// 14) AJ levels up with the Fire Element (a config table, cumulative, capped), shown beside the hearts; reset on a fresh game.
{
  const L5 = DIALOGUE.part2.levelUp;
  p2.elements = [];
  p2.stats.level = 1;
  p2.banners.length = 0;
  p2.applyRewards();
  check(p2.level === 1 && ui.levelText === L5.tag(1) && fire.arsenal.capBonus === 0 && fire.arsenal.damageScale === 1 && p2.horseEnergyMax() === CONFIG.energy.horseEnergyMax, `Lv 1 at the start of Part 2 ("${ui.levelText}" beside the hearts), no bonuses`);
  const hearts1 = lives.maxHearts;
  const ups = P2.levelUpBonuses[2];
  p2.addElement('fire');
  await run(P2.levelUp.bannerDelay + 1);
  const lvBanner = ui.banners.find((b) => b.startsWith('LEVEL UP'));
  check(p2.level === 2 && ui.levelText === L5.tag(2) && !!lvBanner && lvBanner.includes('Lv 2') && p2.stats.levelUps >= 1, `the Fire Element gives Lv 2: banner "${lvBanner}"`);
  check(lives.maxHearts === hearts1 + ups.hearts && fire.arsenal.ammoCap === F.maxBatarangs + ups.batarangCap && Math.abs(fire.arsenal.damageScale - (1 + ups.damagePct / 100)) < 1e-9 && Math.abs(p2.horseEnergyMax() - CONFIG.energy.horseEnergyMax * 1.1) < 1e-9,
    `Lv 2: +${ups.hearts} max heart (${hearts1} → ${lives.maxHearts}), +${ups.horseEnergyPct}% horse energy (${p2.horseEnergyMax()}), +${ups.batarangCap} Batarang carried (${fire.arsenal.ammoCap}), +${ups.damagePct}% damage (×${fire.arsenal.damageScale})`);
  fire.arsenal.ammo = 99;
  check(fire.arsenal.ammo === F.maxBatarangs + ups.batarangCap, `the Batarang cap really is ${fire.arsenal.ammo}`);
  // the caps: hearts 10 in all, Batarangs 16 — and later levels read the same table
  const top = p2.levelBonus(99);
  check(CONFIG.lives.hearts + top.hearts <= P2.levelUpCaps.hearts && F.maxBatarangs + top.batarangCap <= P2.levelUpCaps.batarangCap && top.hearts === 5 && top.batarangCap === 4 && P2.levelUpCaps.hearts === 10 && P2.levelUpCaps.batarangCap === 16, `the table is cumulative and capped: at the last level ${CONFIG.lives.hearts + top.hearts} hearts and ${F.maxBatarangs + top.batarangCap} Batarangs at most`);
  p2.addElement('lightning');
  check(p2.level === 3 && p2.levelBonus().damagePct === 20, 'a second Element: Lv 3, +20% damage in all');
  p2.newGame();
  check(p2.level === 1 && ui.levelText === L5.tag(1) && fire.arsenal.capBonus === 0 && fire.arsenal.damageScale === 1 && p2.banners.length === 0, 'a fresh game starts at Lv 1 again');
}

console.log(failed ? '\nFIRE TEST FAILED' : '\nFIRE TEST PASSED');
process.exit(failed ? 1 : 0);
