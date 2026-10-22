// Headless corner test: the hero pinned against an arena boulder with the boss and 3 slimes
// round him always gets out — a dodge roll (bent away from the rock, through the slimes) or,
// doing nothing, the corner rescue pulse (enemies pushed back, the boss into its recovery,
// 15 s cooldown) — within 3 s. Throughout, the camera never enters a collider (it slides in
// along the hero's line and rises over the rock, which fades when it's in the way) and a swipe
// on the right half turns it on every frame: through hits, hit-stop, knockback, a lost touchend
// and a touch that outlived the controls being switched off. Slimes never stay inside 1.5 of
// the hero for more than 0.5 s.
// Usage: npm run test:corner   (exits non-zero on failure)
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
import { Boss, BOSS_STATES as S } from '../src/boss.js';
import { Minions } from '../src/minions.js';
import { FollowCamera } from '../src/camera.js';
import { TouchRouter } from '../src/input.js';
import { CornerRescue } from '../src/rescue.js';

const R = CONFIG.corner, H = CONFIG.hero, CV = CONFIG.cave, dt = 1 / 60;
const [cx, cz] = CV.center;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const secs = (s) => Math.round(s / dt);

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const horse = new Horse(scene, world, heroAssets); await horse.init();
const combat = new Combat(scene, hero, {}); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
const lives = new Lives();
const gems = new Gems(scene, world); await gems.init();
const boss = new Boss(scene, world, {}, heroAssets); await boss.init();
combat.addTarget(boss);
let seed = 4242;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Touch: the same router the game uses, a phone's 20:9 landscape; one finger swiping on the right half.
const W = 915, Hh = 412;
const router = new TouchRouter(() => [], () => W);
const live = new Set();
let hitStop = 0, hits = 0;
const onHitHero = (n, x, z, o = {}) => {
  if (hero.invincible) return false;
  hero.hurt(x, z, o.knockback !== false, o.source !== 'fire');
  router.unstick(live); // (main: input.unstick() on every hit)
  lives.damage(n);
  hits++;
  hitStop = Math.max(hitStop, CONFIG.combat.hitStop * 2); // (as if a heavy hit froze the action)
  if (lives.hearts < 1.5) lives.setHearts(lives.maxHearts); // (keep going: hits are counted)
  return true;
};
boss.events.onHitHero = onHitHero;
const cam = new FollowCamera(W / Hh, world);
const minions = new Minions(scene, world, { hero, horse, combat, abilities, gems, camera: cam.camera, onHitHero, readFile: heroAssets.readFile, placeholder: heroAssets.placeholder, random });
const rescue = new CornerRescue(scene, world, { hero, boss, minions }); await rescue.init();

// The swipe: a finger on the right half moving `swipe` px every frame.
const swipe = 6;
let finger = { id: 1, x: W * 0.75, y: Hh * 0.4 };
const press = (id) => { finger = { id, x: W * 0.75, y: Hh * 0.4 }; live.add(id); router.sync(live); router.start(id, finger.x, finger.y); };
press(1);
let idleFrames = 0, gameT = 0, camFrames = 0, camInside = 0, swipeFrames = 0, swipeMissed = 0, hitStopFrames = 0, hitFrames = 0, adopted = 0;
// One frame as in main.js: game time stops during hit-stop, the camera keeps real time.
const step = (n = 1, { input = {}, each = null, swiping = true } = {}) => {
  for (let i = 0; i < n; i++) {
    const realDt = dt;
    const gdt = hitStop > 0 ? 0 : realDt;
    if (hitStop > 0) hitStopFrames++;
    hitStop = Math.max(0, hitStop - realDt);
    // The swipe (TouchRouter → look delta → cam.rotate), checked against the yaw it should give.
    const owned = router.owners.has(finger.id);
    if (swiping) {
      finger.x += finger.x > W - 20 ? -(W * 0.2) : swipe; // (back to the middle of the right half now and then)
      router.move(finger.id, finger.x, finger.y);
    }
    if (!owned && swiping) adopted++; // (a finger nobody owned: adopted as the drag, turning from the next move)
    const lookDX = router.look.dx;
    router.look.dx = router.look.dy = 0;
    const yaw0 = cam.yaw;
    cam.rotate(lookDX, 0, CONFIG.camera.dragSensitivity);
    const inp = { moveX: 0, moveY: 0, jumpPressed: false, ...(i === 0 ? input : {}) };
    const hits0 = hits;
    gameT += gdt;
    hero.lastDt = gdt;
    hero.update(gdt, inp, cam.yaw);
    combat.update(gdt, inp, {});
    abilities.update(gdt);
    boss.update(gdt, hero);
    minions.update(gdt, { playing: false, riding: false, route: 'forest', pitDone: false, galloping: false });
    rescue.update(gdt, { onFoot: true });
    cam.update(realDt, hero.position, {});
    hero.cameraOpacity = cam.heroOpacity; // (main.js)
    world.updateFoliage(realDt, cam.camera.position, cam.focus);
    // Checks on every frame.
    camFrames++;
    if (cam.insideSolid(cam.camera.position, 0)) camInside++;
    if (!swiping) idleFrames++;
    if (Math.abs(lookDX) > 0) {
      swipeFrames++;
      if (hits > hits0 || hitStop > 0) hitFrames++;
      if (Math.abs((yaw0 - cam.yaw) - lookDX * CONFIG.camera.dragSensitivity) > 1e-9) swipeMissed++;
    } else if (owned && swiping) swipeMissed++; // (the finger moved but nothing reached the camera)
    if (each?.() === false) break;
  }
};

// The corner: an arena boulder; the hero against it, inside the arena.
const rock = world.arenaRocks.filter((c) => c.r < 5).sort((a, b) => Math.abs(a.z - (cz - 14)) + Math.abs(a.x - cx) - (Math.abs(b.z - (cz - 14)) + Math.abs(b.x - cx)))[0];
const nx0 = cx - rock.x, nz0 = cz - rock.z, nl = Math.hypot(nx0, nz0);
const n = { x: nx0 / nl, z: nz0 / nl }; // from the rock into the arena
const side = { x: -n.z, z: n.x };
const gapToRock = () => Math.hypot(hero.position.x - rock.x, hero.position.z - rock.z) - rock.r - H.radius;
const enemiesNear = () => [boss, ...minions.list].filter((t) => t.alive && !t.removed && Math.hypot(t.position.x - hero.position.x, t.position.z - hero.position.z) - t.radius - H.radius <= R.enemyRange).length;
const freed = () => gapToRock() > 1.5 || enemiesNear() === 0;

/** Pin the hero against the rock: the boss in front of him, 3 slimes round him, the camera on the rock's side. */
async function pin() {
  minions.clear();
  rescue.reset();
  boss.reset();
  combat.reset();
  lives.reset();
  hitStop = 0;
  const x = rock.x + n.x * (rock.r + H.radius + 0.05), z = rock.z + n.z * (rock.r + H.radius + 0.05);
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
  hero.facing = Math.atan2(n.x, n.z); hero.iframes = 0; hero.hurtT = 0; hero.dodgeCooldown = 0;
  const bd = boss.radius + H.radius + 1.2;
  boss.position.set(x + n.x * bd, world.heightAt(x + n.x * bd, z + n.z * bd), z + n.z * bd);
  boss.state = S.CHASE; boss.stateTime = 0;
  const slimes = [];
  for (const a of [-1, 0, 1]) {
    const dir = { x: n.x * Math.cos(a * 1.1) + side.x * Math.sin(a * 1.1), z: n.z * Math.cos(a * 1.1) + side.z * Math.sin(a * 1.1) };
    const s = await minions.spawnAt('slime', { x: x + dir.x * 1.0, z: z + dir.z * 1.0 }); // (inside the 1.5 exclusion at first)
    s.state = 'move';
    slimes.push(s);
  }
  // Camera on the rock's side of the hero (the worst case: the rock between it and its spot).
  cam.yaw = Math.atan2(-n.x, -n.z);
  cam.pitch = CONFIG.camera.startPitch;
  cam.snapTo(hero.position);
  return slimes;
}

// 1) Doing nothing: slimes are pushed out of 1.5 within 0.5 s; the rescue pulse frees him.
{
  const slimes = await pin();
  const hp0 = boss.hp;
  const g0 = gameT;
  let heroOpAtMin = 1, lastDist = Infinity, worstInside = 0, cleared = -1, t = 0, freedAt = -1, pulseAt = -1, bossState = null, effect = false, raiseMax = 0, distMin = Infinity;
  while (t < 3) {
    step(1);
    t += dt;
    for (const s of slimes) if (s.alive) worstInside = Math.max(worstInside, s.extra.inside ?? 0);
    if (cleared < 0 && slimes.every((s) => Math.hypot(s.position.x - hero.position.x, s.position.z - hero.position.z) >= R.slimes.exclusion - 1e-6)) cleared = t;
    raiseMax = Math.max(raiseMax, cam.raise);
    if (lastDist < CONFIG.camera.blocked.heroFade.near) heroOpAtMin = Math.min(heroOpAtMin, hero.model.userData.mats[0].opacity); // (a frame behind)
    distMin = Math.min(distMin, cam.distance);
    lastDist = cam.distance;
    if (rescue.pulses > 0 && pulseAt < 0) { pulseAt = gameT - g0; bossState = boss.state; effect = rescue.model.visible; }
    if (freedAt < 0 && freed()) freedAt = t;
  }
  check(cleared >= 0 && cleared <= R.slimes.maxInside + dt * 2 && worstInside <= R.slimes.maxInside + dt * 1.5, `slimes inside 1.0 of him are out of the ${R.slimes.exclusion} exclusion in ${cleared.toFixed(2)} s (none inside longer than ${worstInside.toFixed(2)} s; max ${R.slimes.maxInside})`);
  check(pulseAt >= R.pinTime - dt && pulseAt <= R.pinTime + 0.1 && bossState === S.RECOVER && effect && boss.hp === hp0,
    `pinned ${R.pinTime} s with enemies within ${R.enemyRange}: the rescue pulse fires (${pulseAt.toFixed(2)} s of game time, visible ring), the boss pushed back into its recovery (${bossState}), its HP untouched`);
  check(freedAt >= 0 && freedAt <= 3, `doing nothing he is free within 3 s (${freedAt.toFixed(2)} s: no enemy within ${R.enemyRange} or clear of the rock)`);
  check(raiseMax > 0.05 && distMin < CONFIG.camera.camOnFootDistance, `the camera slid in (down to ${distMin.toFixed(2)}) and rose over the rock (+${raiseMax.toFixed(2)} rad) instead of staying behind it`);
  check(heroOpAtMin < 0.5, `squeezed in that close (swiping into the rock), AJ fades so he doesn't fill the view (opacity ${heroOpAtMin.toFixed(2)})`);
  // Not swiping: boxed in against the tall rock, the camera swings round to open space.
  await pin();
  rescue.cooldown = 99;
  step(secs(2), { swiping: false });
  check(cam.distance > CONFIG.camera.blocked.swingBelow && !cam.insideSolid(cam.camera.position, 0), `left alone, the camera swings round the rock to open space (distance ${cam.distance.toFixed(2)})`);
  // The cooldown: pinned again at once → no second pulse for 15 s.
  const p0 = rescue.pulses;
  await pin();
  rescue.cooldown = R.cornerRescueCooldown - 2;
  step(secs(1.9));
  check(rescue.pulses === p0, `cooldown: no second pulse within ${R.cornerRescueCooldown} s`);
}

// 2) A dodge roll gets him out: even pushed straight into the rock it bends away from it, and it
// passes through the slimes in the way.
for (const [name, dir] of [['into the rock', { x: -n.x, z: -n.z }], ['along the rock', side], ['out through the slimes', n]]) {
  const slimes = await pin();
  rescue.cooldown = 99; // (no pulse: the dodge alone)
  const p0 = hero.position.clone();
  const rolled = hero.dodge(dir.x, dir.z);
  let t = 0, freedAt = -1, minGap = Infinity;
  while (t < 3) {
    step(1);
    t += dt;
    minGap = Math.min(minGap, gapToRock());
    if (freedAt < 0 && freed()) freedAt = t;
  }
  const moved = hero.position.distanceTo(p0);
  check(rolled && freedAt >= 0 && freedAt <= 3 && minGap > -0.05, `dodge ${name}: rolls away from the rock (never into it, gap ≥ ${minGap.toFixed(2)}), free in ${freedAt.toFixed(2)} s, ${moved.toFixed(1)} from the corner`);
  if (name === 'out through the slimes') {
    const ahead = slimes.filter((s) => s.alive).every((s) => (s.position.x - p0.x) * n.x + (s.position.z - p0.z) * n.z < (hero.position.x - p0.x) * n.x + (hero.position.z - p0.z) * n.z);
    check(ahead && moved > CONFIG.combat.dodge.distance * 0.8, 'the roll passes through the slimes (he ends up beyond them)');
  }
}

// 3) The rock in the way fades (the camera put behind it by hand).
{
  await pin();
  const set = world.fadeSets[0];
  const i = set.items.reduce((b, it, k) => (Math.hypot(it.x - rock.x, it.z - rock.z) < Math.hypot(set.items[b].x - rock.x, set.items[b].z - rock.z) ? k : b), 0);
  const behind = new THREE.Vector3(rock.x - n.x * (rock.r + 3), world.heightAt(rock.x, rock.z) + 2, rock.z - n.z * (rock.r + 3));
  for (let k = 0; k < 30; k++) world.updateFoliage(dt, behind, hero.position.clone().setY(hero.position.y + 1));
  const faded = set.mesh.geometry.attributes.instanceFade.array[i];
  for (let k = 0; k < 60; k++) world.updateFoliage(dt, cam.camera.position, cam.focus);
  const back = set.mesh.geometry.attributes.instanceFade.array[i];
  check(faded < 0.5 && back > 0.95, `a boulder between the camera and the hero fades (${faded.toFixed(2)}), and comes back when it isn't (${back.toFixed(2)})`);
}

// 4) Swipes through everything: a lost touchend (a new finger takes the drag), and a finger that
// was down while the controls were switched off (death fade) taking the drag again on its own.
{
  await pin();
  rescue.cooldown = 99;
  press(2); // (finger 1's end never arrived: finger 2 must still turn the camera)
  live.delete(1);
  step(secs(0.5));
  router.endAll(); // (input.setEnabled(false) drops every touch; the finger stays down)
  step(secs(0.5));
  boss.state = S.MELEE_WINDUP; boss.stateTime = 0; // (a hit lands while swiping)
  step(secs(1.5));
}
check(camInside === 0 && camFrames > 600, `the camera never entered a collider or a boulder's real shape (${camInside} of ${camFrames} frames)`);
check(swipeMissed === 0 && swipeFrames === camFrames - adopted - idleFrames && adopted === 1 && hits > 0 && hitStopFrames > 0, `a swipe turned the camera on every frame (${swipeFrames}/${camFrames}; the one finger dropped with the controls was adopted again on its next move), through ${hits} hits, ${hitStopFrames} hit-stop frames, knockback and a lost touchend`);

console.log(failed ? 'CORNER TEST FAILED' : 'corner test passed');
process.exit(failed ? 1 : 0);
