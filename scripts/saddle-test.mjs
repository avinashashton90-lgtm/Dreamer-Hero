// Headless test: fighting skeletons from the saddle. The Batarang auto-aims at any enemy in any
// direction (preferring ones in front; the bracket shows it), hits a skeleton's generous hit body
// (also while it rises from the sand, also on its way back), whose hit body sits on the model;
// galloping knocks skeletons aside; the press-and-hold dismount works within 1 s with skeletons
// beside the horse (a hit doesn't interrupt it) and only below the speed limit; surrounded,
// the horse rears up with a shockwave that defeats them (10 s cooldown).
// Usage: npm run test:saddle   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs';
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Combat } from '../src/combat.js';
import { Abilities } from '../src/abilities.js';
import { Lives } from '../src/lives.js';
import { Gems } from '../src/gems.js';
import { Minions } from '../src/minions.js';
import { FollowCamera } from '../src/camera.js';
import { HoldTimer } from '../src/input.js';
import { CornerRescue } from '../src/rescue.js';

const MN = CONFIG.minions, SK = MN.skeletons, BT = CONFIG.abilities.batarang, DM = CONFIG.input.dismount, MR = CONFIG.corner.mounted, dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const secs = (s) => Math.round(s / dt);

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const horse = new Horse(scene, world, heroAssets); await horse.init();
const log = [];
const combat = new Combat(scene, hero, { onHit: (e) => log.push({ ...e, state: e.target.state }) }); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
['batarang', 'smokeBomb', 'flashMode'].forEach((a) => abilities.unlock(a));
const lives = new Lives();
const gems = new Gems(scene, world); await gems.init();
abilities.gems = gems;
let seed = 777;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let hits = 0;
const onHitHero = (n, x, z, o = {}) => {
  if (hero.invincible) return false;
  hero.hurt(x, z, o.knockback !== false, true);
  lives.damage(n);
  hits++;
  if (lives.hearts < 1.5) lives.setHearts(lives.maxHearts);
  return true;
};
const cam = new FollowCamera(915 / 412, world);
const minions = new Minions(scene, world, { hero, horse, combat, abilities, gems, camera: cam.camera, onHitHero, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder, random });
abilities.camera = cam.camera;
const rescue = new CornerRescue(scene, world, { hero, horse, minions }); await rescue.init();

const track = world.desertTrack;
const rideInput = ({ gallop = false, stop = false } = {}) => {
  const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
  const p = track.at(Math.min(track.length, n.s + 14));
  const want = Math.atan2(p.x - horse.position.x, p.z - horse.position.z);
  const turn = Math.atan2(Math.sin(want - horse.heading), Math.cos(want - horse.heading));
  return { moveX: THREE.MathUtils.clamp(-turn * 2.2, -1, 1), moveY: stop ? -1 : 1, jumpPressed: false, gallop, attackPressed: false };
};
const NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };
const step = (n = 1, { ride = null, each = null } = {}) => {
  for (let i = 0; i < n; i++) {
    const inp = ride ? rideInput(ride) : NEUTRAL;
    if (!horse.controlsHero) hero.update(dt, inp, 0);
    horse.update(dt, horse.controlsHero ? inp : null, 0, hero);
    combat.update(dt, inp, { mounted: horse.controlsHero });
    abilities.update(dt);
    minions.update(dt, { playing: false, riding: horse.controlsHero, route: 'desert', pitDone: true, galloping: horse.galloping });
    rescue.update(dt, { onFoot: !horse.controlsHero, riding: horse.controlsHero });
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
    if (each?.() === false) break;
  }
};
const mountAt = (s) => {
  if (horse.route !== track) horse.setRoute(track, CONFIG.desert.checkpoints);
  const p = track.at(s);
  if (horse.controlsHero || hero.riding) { horse.mode = 'idle'; hero.riding = false; }
  horse.position.set(p.x, world.heightAt(p.x, p.z), p.z);
  horse.heading = Math.atan2(p.tx, p.tz);
  horse.trackS = s;
  horse.velocity.set(0, 0, 0);
  horse.speed = 0;
  horse.mountNow(hero);
  horse.stamina = 1;
  cam.reset(); cam.snapTo(hero.position);
};
const fwd = () => new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
const right = () => new THREE.Vector3(-Math.cos(horse.heading), 0, Math.sin(horse.heading));
const at = (ahead, side) => { const p = horse.position.clone().addScaledVector(fwd(), ahead).addScaledVector(right(), side); return { x: p.x, z: p.z }; };
const skeleton = async (ahead, side, state = 'move') => {
  const m = await minions.spawnAt('skeleton', at(ahead, side));
  if (state) { m.state = state; m.stateTime = 0; m.position.y = world.heightAt(m.position.x, m.position.z); }
  m.cooldown = 99; // (not attacking unless the test wants it)
  return m;
};
const reset = () => { minions.clear(); abilities.clear(); combat.reset(); rescue.reset(); lives.reset(); log.length = 0; gems.counts.yellow = 50; };
const throwAndFly = (maxS = 3) => { abilities.cooldowns.batarang = 0; const ok = abilities.use('batarang'); let t = 0; while (t < maxS && abilities.batarangOut) { step(1, { ride: { stop: true } }); t += dt; } return ok; };

// 1) Auto-aim: any enemy type, any direction, preferring ones in front; the bracket on it.
{
  reset(); mountAt(500);
  step(2, { ride: { stop: true } });
  const behind = await skeleton(-8, 1.5);
  step(2, { ride: { stop: true } });
  const onlyBehind = abilities.mountedTarget() === behind && abilities.aimTarget === behind && abilities.bracket.visible;
  const front = await skeleton(10, -2);
  step(2, { ride: { stop: true } });
  const prefersFront = abilities.mountedTarget() === front;
  const slime = await minions.spawnAt('slime', at(-4, 0)); slime.state = 'move';
  const wantSlime = abilities.mountedTarget() === slime; // (much nearer, even behind)
  const far = await skeleton(30, 0); minions.clear(); step(1, { ride: { stop: true } });
  const none = abilities.mountedTarget() === null;
  check(onlyBehind && prefersFront && wantSlime && none, `auto-aim: a skeleton behind (bracket on it), one in front preferred over a nearer one behind, a slime too (any type), nothing beyond ${BT.mounted.autoAimRange}`);
}

// 2) Hit bodies: generous (1.2 wide, the whole skeleton) and on the model, not offset.
{
  reset(); mountAt(520);
  const m = await skeleton(12, 0);
  step(10, { ride: { stop: true } });
  m.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.u.body, true);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const off = Math.hypot(c.x - m.position.x, c.z - m.position.z);
  check(m.hitRadius * 2 >= 1.2 - 1e-6 && m.hitHeight >= size.y && off < 0.3 && Math.abs(box.min.y - m.position.y) < 0.3,
    `skeleton hit body ${(m.hitRadius * 2).toFixed(1)} wide × ${m.hitHeight.toFixed(2)} tall (model ${Math.max(size.x, size.z).toFixed(2)} × ${size.y.toFixed(2)}), centred on the model (offset ${off.toFixed(2)}, feet ${(box.min.y - m.position.y).toFixed(2)})`);
}

// 3) The Batarang hits a skeleton while it is still rising from the sand, and on its way back.
{
  reset(); mountAt(540);
  const m = await skeleton(9, 2.5, null); // (rising: state 'spawn')
  step(1, { ride: { stop: true } });
  const rising = m.state === 'spawn' && abilities.mountedTarget() === m;
  const hp0 = m.hp;
  throwAndFly();
  const hitRising = log.find((e) => e.target === m && e.source === 'batarang');
  check(rising && hitRising && m.hp === 0 && m.shattered, `a skeleton rising from the sand is targeted and killed by one hit (${hp0} → ${m.hp} HP, shattered ${m.shattered})`);
  // Return path: a second skeleton steps into its way back.
  reset();
  const a = await skeleton(12, 0);
  const b2 = await skeleton(40, 0);
  abilities.cooldowns.batarang = 0;
  abilities.use('batarang');
  let moved = false, t = 0;
  while (t < 3 && abilities.batarangOut) {
    step(1, { ride: { stop: true } }); t += dt;
    const bb = abilities.batarang;
    if (bb && bb.phase === 'back' && !moved) {
      const p = at(2.5, 0); // (just ahead of the horse, in the way of its final approach to the hand)
      b2.position.set(p.x, world.heightAt(p.x, p.z), p.z);
      moved = true;
    }
  }
  const backHit = log.find((e) => e.target === b2 && e.source === 'batarang');
  check(moved && log.some((e) => e.target === a) && backHit && b2.hp === 0 && (abilities.stats.batarangReturnHits ?? 0) >= 1,
    `on its way back it strikes a skeleton in its path too (${MN.types.skeleton.hp} → ${b2.hp} HP)`);
  // One throw kills a skeleton outright: it breaks apart (bones flying, a gem at once), the bones gone after `life` s.
  reset();
  const c = await skeleton(10, 0);
  const drops0 = minions.stats.drops, bursts0 = minions.shatter.stats.bursts;
  throwAndFly();
  const bones = minions.shatter.active;
  step(secs(MN.shatter.life + 0.3), { ride: { stop: true } });
  check(c.hp === 0 && c.shattered && minions.shatter.stats.bursts === bursts0 + 1 && bones >= MN.shatter.bones && minions.shatter.active === 0 && minions.stats.drops === drops0 + 1 && c.removed,
    `one Batarang throw kills a skeleton (${MN.types.skeleton.hp} → ${c.hp} HP): it shatters (${bones} bones, gone after ${MN.shatter.life} s), its gem drops, the skeleton is removed`);
}

// 4) Galloping into skeletons knocks them aside and defeats them.
{
  reset(); mountAt(560);
  const onTrail = async (ds) => { const p = track.at(horse.trackS + ds); const m = await minions.spawnAt('skeleton', { x: p.x, z: p.z }); m.state = 'move'; m.cooldown = 99; return m; };
  const pair = [await onTrail(18), await onTrail(30)]; // (on the trail ahead, where the horse rides)
  let t = 0;
  while (t < 4 && pair.some((m) => m.alive)) { step(1, { ride: { gallop: true } }); t += dt; }
  check(pair.every((m) => !m.alive), `galloping through 2 skeletons on the trail defeats both (${t.toFixed(1)} s)`);
}

// 5) Dismount: press-and-hold with 2 skeletons beside the horse hitting him; done within 1 s of
// the press once the horse is under the speed limit; greyed (never fires) above it.
{
  reset(); mountAt(600);
  step(secs(2), { ride: {} }); // (riding at speed)
  const fast = Math.abs(horse.speed) >= DM.maxSpeed;
  const hold = new HoldTimer(DM.holdSeconds);
  let firedFast = false;
  // Holding while still too fast: nothing.
  for (let k = 0; k < secs(0.3); k++) { step(1, { ride: {} }); if (hold.update(dt, true, Math.abs(horse.speed) < DM.maxSpeed) && fast) firedFast = true; }
  // Brake below the limit (still holding), then count from there.
  let t = 0;
  while (Math.abs(horse.speed) >= DM.maxSpeed && t < 5) { step(1, { ride: { stop: true } }); hold.update(dt, true, false); t += dt; }
  hold.reset();
  const pair = [await skeleton(0.8, 2.0), await skeleton(-0.4, -2.0)]; // (beside it, hitting him)
  for (const m of pair) m.cooldown = 0;
  hero.iframes = 0;
  const hits0 = hits;
  let tDown = -1, el = 0;
  while (el < 2) {
    step(1, { ride: { stop: true } }); el += dt;
    if (hold.update(dt, true, Math.abs(horse.speed) < DM.maxSpeed) && horse.mode === 'riding') horse.toggle(hero); // (main.js)
    if (horse.mode === 'idle' && !hero.riding && tDown < 0) tDown = el;
    if (tDown >= 0) break;
  }
  check(fast && !firedFast && tDown > 0 && tDown <= 1 && hits > hits0, `dismount: greyed while galloping (nothing fires); under ${DM.maxSpeed} a ${DM.holdSeconds} s hold gets him down in ${tDown.toFixed(2)} s with 2 skeletons hitting him (${hits - hits0} hits during it)`);
}

// 6) Surrounded on horseback: 2 skeletons within 3 for > 2 s → the horse rears up, the shockwave
// defeats them (gems drop); not again for 10 s.
{
  reset(); mountAt(650);
  step(2, { ride: { stop: true } });
  const pair = [await skeleton(0.5, 1.9), await skeleton(-0.5, -1.9)];
  const drops0 = minions.stats.drops;
  let t = 0, rearAt = -1, pitch = 0;
  while (t < 4) {
    step(1, { ride: { stop: true } }); t += dt;
    for (const m of pair) if (m.alive && m.state !== 'dying') { const p = at(m === pair[0] ? 0.5 : -0.5, m === pair[0] ? 1.9 : -1.9); m.position.x = p.x; m.position.z = p.z; m.set('move'); } // (they stay beside it: held from their one lunge)
    if (rescue.rears > 0 && rearAt < 0) rearAt = t;
    pitch = Math.min(pitch, horse.model.userData.body.rotation.x);
  }
  step(secs(3), { ride: { stop: true } });
  const killed = pair.every((m) => !m.alive);
  const more = [await skeleton(0.5, 1.9), await skeleton(-0.5, -1.9)];
  for (let k = 0; k < secs(3); k++) { step(1, { ride: { stop: true } }); for (const [i, m] of more.entries()) if (m.alive) { const p = at(i ? -0.5 : 0.5, i ? -1.9 : 1.9); m.position.x = p.x; m.position.z = p.z; m.set('move'); } }
  check(rearAt > MR.time && rearAt < MR.time + 0.2 && killed && minions.stats.drops >= drops0 + 2 && pitch < -0.2 && rescue.rears === 1,
    `surrounded by 2 for ${rearAt.toFixed(2)} s: the horse rears up (pitch ${pitch.toFixed(2)}), the shockwave defeats both (gems ${minions.stats.drops - drops0}); no second one within ${MR.mountedRescueCooldown} s (${rescue.rears})`);
}

console.log(failed ? 'SADDLE TEST FAILED' : 'saddle test passed');
process.exit(failed ? 1 : 0);
