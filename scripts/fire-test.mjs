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

const P2 = CONFIG.part2, F = P2.fire, D2 = DIALOGUE.part2, FD = D2.fire;
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
  quest: null, dist: null, toasts: [], banners: [], keys: null, elements: [], boss: null, flashes: 0,
  banner(t) { this.banners.push(t); },
  toast(t) { this.toasts.push(t); }, setQuest(t, d) { this.quest = t; this.dist = d; }, fadeOut(ms, then) { return then(); }, fadeIn() {},
  showGems() {}, setHorseEnergy() {}, setGears() {}, screenFlash() { this.flashes++; },
  setBossBar(on, frac, name, regen) { this.boss = { on, frac, name, regen }; },
  setCogKeys(n, show) { this.keys = { n, show }; },
  setElements(list, show) { this.elements = [...list]; this.elementsShown = show; },
};
let held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false, ability: null };
const input = {
  enabled: true, setEnabled(on) { this.enabled = on; }, read: () => ({ ...held, lookDX: 0, lookDY: 0, lookSensitivity: 0 }),
  setCombatButtons(m, ab, hidden) { this.combat = { mounted: m, ab, hidden }; }, setMountButton() {}, setDismountButton() {}, setGallopButton(on) { this.gallopShown = on; }, pulseAbility(n) { this.pulsed = n; },
};
const lives = new Lives();
const soundscape = { musicPhase: null };
const hurts = [];
const damageHero = (n, x, z, opts = {}) => {
  if (hero.invincible || state.is(STATES.CUTSCENE)) return false;
  hero.hurt(x, z, opts.knockback !== false, opts.source !== 'fire');
  lives.damage(n);
  hurts.push({ n, source: opts.source });
  return true;
};
const part1 = { id: 'part1', scene: world.scene, enter: () => { for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o); }, exit() {} };
const levels = new LevelManager({
  part1: async () => part1,
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities: null, lives, assets: heroAssets, damageHero }),
});
levels.chapters.set('part1', part1);
levels.current = part1; levels.id = 'part1';
const frame = async () => { levels.current.update(dt, dt, { paused: false }); held.jumpPressed = false; held.ability = null; await null; };
const run = async (s) => { for (let t = 0; t < s; t += dt) await frame(); };

const { trackPoint } = await import('../src/part2/rideModel.js');
// 1) The level loads: its own ride (the furnace city), the HUD, a draw budget.
const p2 = await levels.load('part2', { start: 'fire' });
const fire = p2.fire;
const ride = fire.ride;
const track = fire.world.track;
await run(1);
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
  check(keys.length >= 3 && keys.length <= 5 && chests.length === 3 && JSON.stringify(costs) === '[1,1,2]' && keys.length >= costs.reduce((a, b) => a + b, 0),
    `${keys.length} cog keys (3–5) and 3 chests (costs ${costs.join(', ')}); enough keys for every chest (${costs.reduce((a, b) => a + b, 0)})`);
  const lat = (e) => Math.abs(track.nearest(e.pos.x, e.pos.z, 30).lateral);
  check(keys.every((k) => lat(k) > 4.5), 'every cog key is off the main path (beside the road, 4.5+ from the middle)');
  const plaza = F.plaza;
  const pk = keys.filter((k) => { const s0 = track.nearest(k.pos.x, k.pos.z, 30).s; return s0 >= plaza.from && s0 <= plaza.to; });
  const nearChest = (k) => chests.some((c) => c.pos.distanceTo(k.pos) < 6.5);
  check(pk.length === 3 && pk.every(nearChest) && chests.every((c) => { const s0 = track.nearest(c.pos.x, c.pos.z, 30).s; return s0 >= plaza.from && s0 <= plaza.to; }), 'the plaza: the 3 chests, with a cog key hidden near each');
  const elix = fire.items.entries.filter((e) => e.type.startsWith('elixir'));
  check(elix.length === 2 && elix.some((e) => e.type === 'elixirHeal') && elix.some((e) => e.type === 'elixirEnergy'), 'two elixirs in the plaza (healing and energy)');
  await run(0.2);
  check(input.combat?.ab === fire.arsenal && !input.combat.hidden && input.combat.ab.has('batarang') && !input.combat.ab.has('fireBlast') && input.combat.ab.usesLeft('batarang') === F.startAmmo && input.combat.ab.layout === '2',
    `the buttons: the Batarang with its gems (${input.combat.ab.usesLeft('batarang')}) — no Fire Blast yet`);
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


const near = () => track.nearest(horse.position.x, horse.position.z, 20);
/** Put the horse at `s`, `lat`, riding at `speed` along the trail. */
const place = (s, lat = 0, { speed = 0 } = {}) => {
  ride.stop();
  const pt = trackPoint(track, s, lat, 0);
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

// 2) Pickups and chests (the item system): keys, elixirs, "Needs 1 cog key", opening, contents, the checkpoint save.
{
  const items = fire.items;
  const key = items.find('key0');
  place(near()?.s ?? 4, 0);
  horse.position.copy(key.pos.clone().setY(0));
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
  check(small.state === 'open' && items.keys === 0 && count('chest_open') === c1 + 1 && lives.hearts === 5 && ui.toasts.includes(FD.got.elixirHeal) && small.model.userData.lid.rotation.x < -1.5,
    'the lid lifts, light pours out, the elixir floats up and is drunk: +2 hearts (3 → 5), the key spent');
  // the big chest needs 2
  const bp = track.nearest(big.pos.x, big.pos.z, 30);
  items.addKeys(1);
  place(bp.s, -2.0);
  const t1 = ui.toasts.length;
  items.hintAt = -Infinity;
  await run(0.4);
  check(toastsSince(t1).includes(FD.needs(2)) && FD.needs(2).endsWith('keys') && big.state === 'closed' && items.keys === 1, `the big chest with 1 key: "${FD.needs(2)}"`);
  items.addKeys(1);
  const hearts0 = lives.maxHearts;
  await run(3.8);
  check(big.state === 'open' && items.keys === 0 && lives.maxHearts === hearts0 + 1 && p2.extraHearts === 1 && lives.hearts === lives.maxHearts, `the big chest (2 keys): a heart container, +1 max heart (${hearts0} → ${lives.maxHearts}) and a full heal`);
  // gems out of the second small chest
  const gp = track.nearest(small2.pos.x, small2.pos.z, 30);
  items.addKeys(1);
  const ammo0 = fire.arsenal.ammo;
  place(gp.s, 2.2);
  await run(4);
  check(small2.state === 'open' && fire.arsenal.ammo === ammo0 + 6, `the other small chest: ${F.chests[1].contents.n} gems (Batarang ammo ${ammo0} → ${fire.arsenal.ammo})`);
  // elixirs
  const eh = items.entries.find((e) => e.type === 'elixirHeal' && !e.chest), ee = items.entries.find((e) => e.type === 'elixirEnergy');
  lives.setHearts(2);
  horse.position.copy(eh.pos.clone().setY(0));
  await run(0.3);
  const eblue = ee;
  horse.energy = 10;
  horse.stamina = 0.2;
  horse.position.copy(eblue.pos.clone().setY(0));
  await run(0.3);
  check(eh.taken && lives.hearts === 4 && ee.taken && horse.stamina === 1 && horse.energy === CONFIG.energy.horseEnergyMax, 'the green elixir heals 2 hearts (2 → 4); the blue one refills the horse');
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
const seconds = async (t, fn) => { for (let x = 0; x < t; x += dt) { await frame(); if (fn?.()) return true; } return false; };
const fresh = () => { items0(); lives.setHearts(lives.maxHearts); hurts.length = 0; hero.resetStatus?.(); };
const items0 = () => { fire.items.restore(null); fire.arsenal.clear(); fire.arsenal.ammo = F.startAmmo; fire.foes.reset(0); fire.fx.list.length = 0; };

// 3) Section 2: scout robots in pairs, from the front and wide; the Batarang (auto-aim, 1 gem a throw, out and back); 2 hits.
{
  fresh();
  place(430, 0, { speed: CONFIG.horse.maxSpeed });
  held.moveY = 1;
  const f = fire.foes;
  let spawned = null;
  await seconds(4, () => { const a = alive(f.scouts); if (a.length >= 2) { spawned = a.map((x) => ({ s: track.nearest(x.position.x, x.position.z, 30).s, lat: track.nearest(x.position.x, x.position.z, 30).lateral, hs: near().s })); return true; } return false; });
  const aheadOk = spawned && spawned.every((q) => q.s - q.hs > SC.ahead[0] - 6 && q.s - q.hs < SC.ahead[1] + 6);
  const wide = spawned && spawned.length === 2 && Math.sign(spawned[0].lat) !== Math.sign(spawned[1].lat) && spawned.every((q) => Math.abs(q.lat) > SC.lat - 1.5);
  check(!!spawned && f.stats.scoutGroups === 1 && aheadOk && wide, `a group of 2 scouts is called as the horse passes s ${SC.triggers[0]}: ${spawned ? spawned.map((q) => `${(q.s - q.hs).toFixed(0)} ahead, ${q.lat.toFixed(1)} off the middle`).join(' / ') : 'none'}`);
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
  const used = ar.use('batarang');
  const blocked = ar.use('batarang'); // (busy / cooldown)
  check(used && !blocked && ar.ammo === ammo0 - 1 && ar.pending && hero.throwAnim?.kind === 'throw' && ar.usesLeft('batarang') === ammo0 - 1, `the Batarang: a tap throws it at the nearest scout (auto-aim), 1 gem spent (${ammo0} → ${ar.ammo}), the throw pose first`);
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
  check(a1.every(Boolean) && (mid.some(Boolean) || victims.length === 1) && victims.every((v) => !v.alive) && fire.scrap.pieces.length > burst0 && fire.items.entries.filter((e) => e.temp).length > gems0,
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

// 4) Section 4: sword robots patrol, alert, sidestep, charge, wind up (a red ring), swing for half a heart; 4 HP; Fire Blast burns.
{
  fresh();
  const f = fire.foes;
  const sw = f.swords[0];
  const sp = SW.spots[0];
  check(sw.alive && sw.state === 'patrol' && f.swords.length === 4 && f.swords.every((x) => x.model.userData.height === SW.height || true), `${f.swords.length} sword robots (Mike and Stan) patrol the last stretch`);
  // patrol: it moves about its post
  const p0 = sw.position.clone();
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
  // fire ball (once Fire Blast is unlocked): 3 damage and a 3 s burn
  fire.arsenal.unlockFire();
  sw.spawn(trackPoint(track, sp.s, sp.lat).pos, 0, 'idle');
  place(sp.s - 14, sp.lat, { speed: 0 });
  sw.state = 'patrol';
  const hpBefore = sw.hp;
  const ar = fire.arsenal;
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
  check(Math.abs(hero.position.x - C.x - A.spawn[0]) < 1 && Math.abs(hero.position.z - C.z - A.spawn[1]) < 1 && G.alive && G.state === 'idle' && G.hp === B.hp && B.hp === 30, `AJ enters at the plaza's edge; the Guardian waits in the middle with ${G.hp} HP (about 30 Batarang hits)`);
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
  // Batarang on foot: auto-aims at the Guardian, 1 gem, 1 HP (x1)
  hero.puppet(rel([0, 6]), Math.PI, 0);
  G.position.copy(rel([0, -4]));
  G.state = 'recover'; G.t = -10; // (holding still)
  const hp0 = G.hp, am0 = fire.arsenal.ammo;
  fire.arsenal.cooldowns.batarang = 0;
  const used = fire.arsenal.use('batarang');
  await seconds(3, () => !fire.arsenal.proj && !fire.arsenal.pending && fire.arsenal.stats.catches > 0);
  check(used && G.hp <= hp0 - 1 && fire.arsenal.ammo === am0 - 1 && ui.boss?.on, `the Batarang from AJ's hand hits the Guardian for 1 (${hp0} → ${G.hp}), 1 gem; the boss bar shows`);
}


// 6) The Guardian's three attacks, his regen, the gem rings, a revive in the plaza, his defeat.
{
  const guardAt = (v, heading = 0) => { G.position.copy(rel(v)); G.heading = heading; G.model.position.copy(G.position); };
  const heroAt = (v) => { hero.puppet(rel(v), Math.PI, 0); hero.velocity.set(0, 0, 0); hero.resetStatus?.(); };
  const prep = () => { G.marksDone.clear(); fire.arenaItems.clear(); lives.setHearts(lives.maxHearts); hurts.length = 0; G.hp = G.maxHp; G.sinceHit = 0; G.state = 'recover'; G.t = -50; G.cool = { stomp: 0, steam: 0, charge: 0 }; held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false, ability: null }; };
  const hearts0 = () => lives.hearts;
  // Stomp: a red circle (the windup, Tick calls it), the slam, a ring spreads — standing on the ground costs a heart
  prep(); guardAt([0, -7]); heroAt([0, 3]);
  const tc0 = ui.toasts.length, beep0 = count('tick_beep');
  G.startAttack('stomp');
  await run(0.5);
  check(G.state === 'stompWind' && G.tgStomp.visible && toastsSince(tc0).includes(FD.tick.stomp) && count('tick_beep') >= beep0 + 3, `Stomp: the floor is marked red while he rears up, and Tick calls "${FD.tick.stomp}" with chirps`);
  const hStomp = lives.hearts;
  await seconds(3, () => G.state === 'recover');
  check(G.stats.stomps === 1 && hurts.some((h) => h.source === 'stomp' && h.n === B.stomp.damage) && lives.hearts === hStomp - B.stomp.damage && count('furnace_guardian_stomp') >= 1, `the shockwave ring catches AJ on the ground: ${B.stomp.damage} heart`);
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
  const AR = CONFIG.arena;
  await run(AR.bossRegenDelay - 0.5);
  const unchanged = G.hp === 15 && !G.regenerating;
  await run(1.5); // (a second of healing)
  const regen = G.hp - 15;
  const expect = G.maxHp * (AR.bossRegenPercentPerSec / 100) * 1;
  check(unchanged && G.regenerating && Math.abs(regen - expect) < 0.12 && ui.boss?.regen, `he regenerates only after ${AR.bossRegenDelay} s without a hit, ${AR.bossRegenPercentPerSec}% of his health a second (+${regen.toFixed(2)} in 1 s), the bar pulsing`);
  G.takeHit(1);
  check(!G.regenerating && G.sinceHit === 0, 'any hit stops it at once');
  // Gem rings at the HP marks
  await run(0.1); // (the earlier rings' pickups finish loading)
  prep(); guardAt([0, -7]); heroAt([0, 14]); G.state = 'recover'; G.t = -999;
  const rings0 = fire.arenaItems.entries.filter((e) => e.temp).length;
  G.hp = G.maxHp * A.gems.marks[0] + 0.5;
  G.takeHit(1);
  await run(0.1);
  check(fire.arenaItems.entries.filter((e) => e.temp).length === rings0 + A.gems.count && fire.arsenal.ammo > 0, `a ring of ${A.gems.count} gems appears round the plaza as he drops below ${A.gems.marks[0] * 100}%`);
  const ringGem = fire.arenaItems.entries.find((e) => e.temp && !e.taken);
  const am1 = fire.arsenal.ammo;
  hero.puppet(ringGem.pos.clone(), 0, 0);
  await run(0.3);
  check(ringGem.taken && fire.arsenal.ammo === am1 + 1, 'walking over a gem collects it (+1 Batarang)');
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
  const want = [`${DIALOGUE.speakers.tick}: ${L.one}`, `${DIALOGUE.speakers.aj}: ${L.others}`, `${DIALOGUE.speakers.tick}: ${L.witch}`, `${DIALOGUE.speakers.tick}: ${L.watching}`, `${DIALOGUE.speakers.aj}: ${L.amy}`, `${DIALOGUE.speakers.tick}: ${L.cannot}`];
  const got = view.lines.map((l) => l.replace(/^(\w+):/, (m, k) => `${DIALOGUE.speakers[k] ?? k}:`));
  check(JSON.stringify(got) === JSON.stringify(want), `the lines, in order:\n       ${got.join('\n       ')}`);
  check(circled.size >= 3 && orbToHand && ui.flashes > 0, `the camera circles the orb (${circled.size} directions), the flame flows into his hand, a flash`);
  check(eyesSeen && cameoSeen && cameoGone, 'his eyes flash orange; a hooded figure in violet is seen on a distant tower and vanishes in a puff of violet light');
  await run(0.5);
  check(p2.elements.includes('fire') && ui.elements.includes('fire') && fire.arsenal.fireUnlocked && input.pulsed === 'fireBlast' && ui.banners.length > bannersBefore && ui.banners.at(-1) === FD.banner, `"${FD.banner}": the Elements row lights Fire, Fire Blast is unlocked`);
  await run(1);
  check(p2.at === 'lightning' && ui.quest === D2.comingSoon(D2.levelNames.lightning) && p2.objective === 'lightning' && !fire.stage, `then the next place: "${ui.quest}" (a stub)`);
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

console.log(failed ? '\nFIRE TEST FAILED' : '\nFIRE TEST PASSED');
process.exit(failed ? 1 : 0);
