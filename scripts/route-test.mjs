// Headless route test: runs the real hero physics against the generated map.
// Usage: npm run test:route   (exits non-zero on failure)
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { CONFIG } from '../src/config.js';
import { FollowCamera } from '../src/camera.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Abilities } from '../src/abilities.js';
const world = new World(); await world.init();
const hero = new Hero(world.scene, world); await hero.init();
let respawns = 0; hero.onRespawn = () => respawns++;
const dt = 1/60, L = world.layout, H = CONFIG.hero, Z = CONFIG.zones;
const center = (p) => p.minX !== undefined ? { x: (p.minX+p.maxX)/2, z: (p.minZ+p.maxZ)/2 } : { x: p.x, z: p.z };
const plats = [...L.roofs.map(r => world.boxes.find(b => b.minX === r.minX)), ...world.beams.filter(b => b.route)];

// 1) Measured reach: run full speed on flat ground and jump; horizontal distance until back at take-off height.
{
  const ground = { y: 0 };
  let x = 0, vy = H.jumpVelocity, vx = H.walkSpeed * H.airSpeedBoost, y = 0, t = 0;
  while (true) { vy -= H.gravity*dt; y += vy*dt; x += vx*dt; t += dt; if (y <= 0) break; }
  console.log(`jump height ${(H.jumpVelocity**2/2/H.gravity).toFixed(2)} (was 1.62), level reach ${x.toFixed(2)} (was 5.04), airtime ${t.toFixed(2)}s`);
}

// 2) Gap table vs reach for each consecutive pair.
const reach = (dh) => { const v = H.jumpVelocity, g = H.gravity; if (v*v < 2*g*dh) return 0; return (v + Math.sqrt(v*v - 2*g*dh))/g * H.walkSpeed * H.airSpeedBoost; };
const edgeGap = (a, b) => {
  if (a.minX !== undefined && b.minX !== undefined) return b.minX - a.maxX;
  const ax = a.minX !== undefined ? a.maxX : a.x1, az = a.minX !== undefined ? (a.minZ+a.maxZ)/2 : a.z1;
  return Math.hypot(b.x0 - ax, b.z0 - az);
};
let worst = 1, easiest = 0;
for (let i = 1; i < plats.length; i++) {
  const g = edgeGap(plats[i-1], plats[i]), dh = plats[i].top - plats[i-1].top, r = reach(dh), ratio = g / r;
  worst = Math.max(worst === 1 ? 0 : worst, ratio); easiest = easiest ? Math.min(easiest, ratio) : ratio;
  console.log(`${i<L.roofs.length?'roof  ':'branch'} ${String(i).padStart(2)} gap ${g.toFixed(2)} dh ${dh.toFixed(2).padStart(5)} reach ${r.toFixed(2)} use ${(ratio*100).toFixed(0)}%`);
}
console.log(`gap uses ${(easiest*100).toFixed(0)}%–${(worst*100).toFixed(0)}% of reach`);

// Autopilot helper: run toward target, jump at edge. Returns first platform landed on (≠ start) or 'fell'.
function runTo(start, target, { late = false, maxT = 6 } = {}) {
  respawns = 0;
  hero.lastSafe.set(start.x, start.y, start.z); hero.respawn(); respawns = 0;
  let t = 0, pressed = false, wasGrounded = true;
  while (t < maxT) {
    const dx = target.x - hero.position.x, dz = target.z - hero.position.z, d = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    let jump = false;
    if (!late && hero.grounded) { const a = world.groundAt(hero.position.x+dx/d*0.7, hero.position.z+dz/d*0.7, hero.position.y+0.3, 0.25); if (hero.position.y - a.y > 0.5) jump = true; }
    if (late && !hero.grounded && wasGrounded && !pressed) { jump = true; pressed = true; }
    wasGrounded = hero.grounded;
    hero.update(dt, { moveX: 0, moveY: d > 0.5 ? 1 : 0, jumpPressed: jump }, yaw); t += dt;
    if (respawns) return 'fell';
    if (hero.grounded && hero.platform && hero.platform.safe && hero.platform.safe.distanceTo(start) > 0.5) return hero.platform;
  }
  return 'timeout';
}
const startOf = (p) => p.safe.clone();
const idxOf = (pl) => pl === 'fell' || pl === 'timeout' ? pl : plats.findIndex(q => q.safe.equals(pl.safe));

// 3) Each hop i → i+1 must succeed (early and coyote-late jumps).
let hopFails = [];
let failed = false;
for (let i = 0; i + 1 < plats.length; i++) for (const late of [false, true]) {
  const c = plats[i+1].x0 !== undefined ? { x: plats[i+1].x, z: plats[i+1].z } : center(plats[i+1]);
  const got = idxOf(runTo(startOf(plats[i]), c, { late }));
  if (got !== i + 1) hopFails.push(`${i}->${i+1} ${late?'late':'early'} got ${got}`);
}
console.log('hops ok:', hopFails.length === 0 ? 'all' : hopFails.join('; '));
if (hopFails.length) failed = true;

// 4) Skip attempts i → i+2 (aim straight at the platform after next, both jump timings).
let skips = [];
for (let i = 0; i + 2 < plats.length; i++) for (const late of [false, true]) {
  const tp = plats[i+2]; const c = tp.x0 !== undefined ? { x: tp.x0, z: tp.z0 } : { x: tp.minX + 0.3, z: (tp.minZ+tp.maxZ)/2 };
  const got = idxOf(runTo(startOf(plats[i]), c, { late }));
  if (got === i + 2) skips.push(`${i}->${i+2} ${late?'late':'early'}`);
}
console.log('skippable:', skips.length ? skips.join('; ') : 'none');
if (skips.length) failed = true;

// 5) Full autopilot from the first roof to the sand bank.
hero.reset(); respawns = 0;
const targets = [...plats.map(p => p.x0 !== undefined ? { x: p.x, z: p.z } : center(p)), { x: L.hazardEndX + 6, z: 1 }];
let ti = 1, t = 0;
while (ti < targets.length && t < 90) {
  const tg = targets[ti]; const dx = tg.x-hero.position.x, dz = tg.z-hero.position.z, d = Math.hypot(dx,dz);
  if (d < 1.0 && hero.grounded) { ti++; continue; }
  let jump = false;
  if (hero.grounded) { const a = world.groundAt(hero.position.x+dx/d*0.7, hero.position.z+dz/d*0.7, hero.position.y+0.3, 0.25); if (hero.position.y - a.y > 0.5) jump = true; }
  hero.update(dt, { moveX: 0, moveY: 1, jumpPressed: jump }, Math.atan2(-dx,-dz)); t += dt;
}
console.log(`full route: reached ${ti}/${targets.length} in ${t.toFixed(1)}s, falls ${respawns}`);
if (ti < targets.length || respawns) failed = true;
if (worst > 0.85) { console.log('a gap is too close to max reach'); failed = true; }


// 6) Branch sides are solid at branch height; standing on top is not pushed.
for (const b of world.beams.filter((b) => b.route)) {
  const nx = b.uz, nz = -b.ux, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, hw = (b.hw0 + b.hw1) / 2;
  const pos = new THREE.Vector3(cx + nx * 0.3, b.top - 1.2, cz + nz * 0.3);
  world.collide(pos, new THREE.Vector3(), H.radius, H.height, H.stepUp);
  const lat = Math.abs((pos.x - b.x0) * b.uz - (pos.z - b.z0) * b.ux);
  const onTop = new THREE.Vector3(cx, b.top, cz);
  world.collide(onTop, new THREE.Vector3(), H.radius, H.height, H.stepUp);
  if (lat < hw + H.radius - 0.05 || onTop.distanceTo(new THREE.Vector3(cx, b.top, cz)) > 1e-6) { console.log('branch collision wrong at', cx.toFixed(1)); failed = true; }
}
// Camera check helper: is the camera inside a solid or an opaque leaf cluster, and do opaque
// leaves cross the camera→focus line? (all foliage sets: giant trees + forest crowns)
function cameraCheck(cam) {
  const c = cam.camera.position, f = cam.focus;
  let inside = 0, blocked = false;
  for (const cy of world.cylinders) if (Math.hypot(c.x - cy.x, c.z - cy.z) < cy.r && c.y > cy.bottom && c.y < cy.top) inside++;
  const sx = c.x-f.x, sy = c.y-f.y, sz = c.z-f.z, L2 = sx*sx+sy*sy+sz*sz;
  for (const set of world.foliageSets) {
    const fade = set.mesh.geometry.attributes.instanceFade.array;
    set.items.forEach((l, i) => {
      if (fade[i] < 0.5) return;
      if (Math.hypot(c.x-l.x, c.y-l.y, c.z-l.z) < l.r * 0.9) inside++;
      const dx = l.x-f.x, dy = l.y-f.y, dz = l.z-f.z;
      const u = Math.max(0, Math.min(1, (dx*sx+dy*sy+dz*sz)/L2));
      if (Math.hypot(dx-sx*u, dy-sy*u, dz-sz*u) < l.r * 0.8) blocked = true;
    });
  }
  return { inside, blocked, dist: c.distanceTo(f) };
}

// 7) Camera in the tree zone: during an autopilot run the camera never sits inside a trunk
// or a leaf cluster, and leaves left opaque never block the camera→hero line for long.
{
  const cam = new FollowCamera(16 / 9, world);
  hero.reset(); respawns = 0;
  cam.reset(); cam.snapTo(hero.position);
  let ti = 1, t = 0, inside = 0, blockedFor = 0, worstBlock = 0, frames = 0, minDist = Infinity, maxDist = 0;
  const treeStart = L.townEndX, treeEnd = L.hazardEndX;
  while (ti < targets.length && t < 90) {
    const tg = targets[ti]; const dx = tg.x-hero.position.x, dz = tg.z-hero.position.z, d = Math.hypot(dx,dz);
    if (d < 1.0 && hero.grounded) { ti++; continue; }
    let jump = false;
    if (hero.grounded) { const a = world.groundAt(hero.position.x+dx/d*0.7, hero.position.z+dz/d*0.7, hero.position.y+0.3, 0.25); if (hero.position.y - a.y > 0.5) jump = true; }
    // Keep the camera behind the hero like a player would (yaw follows the route).
    cam.yaw += (Math.atan2(-dx, -dz) - cam.yaw) * 0.05;
    hero.update(dt, { moveX: 0, moveY: 1, jumpPressed: jump }, cam.yaw); t += dt;
    cam.update(dt, hero.position);
    world.updateFoliage(dt, cam.camera.position, cam.focus);
    if (hero.position.x < treeStart || hero.position.x > treeEnd) continue;
    frames++;
    const chk = cameraCheck(cam);
    minDist = Math.min(minDist, chk.dist); maxDist = Math.max(maxDist, chk.dist);
    inside += chk.inside;
    blockedFor = chk.blocked ? blockedFor + dt : 0; worstBlock = Math.max(worstBlock, blockedFor);
  }
  console.log(`camera in trees: ${frames} frames, distance ${minDist.toFixed(1)}–${maxDist.toFixed(1)} (base ${CONFIG.camera.distance}), inside-solid frames ${inside}, longest leaf block ${worstBlock.toFixed(2)}s`);
  if (inside > 0 || worstBlock > 0.3) failed = true;
}

// 8) Horse and forest ride: walk to the horse, mount, ride the winding path — jumping the
// obstacles, detouring down the side trails, grabbing the gems floating over jumps — through
// the ford to the giant cave. No falls, stumbles or stuck points; every gem; all unlocks.
{
  const { pathZ } = await import('../src/world.js');
  const { Sound } = await import('../src/audio.js');
  const horse = new Horse(world.scene, world); await horse.init();
  const sound = new Sound(); horse.sound = sound;
  const abilities = new Abilities(hero);
  const gems = new Gems(world.scene, world, { onUnlock: (c, a) => abilities.unlock(a) });
  await gems.init();
  const cam = new FollowCamera(16 / 9, world);
  let rideFalls = 0, checkpoints = 0;
  horse.onRespawn = () => rideFalls++;
  horse.onCheckpoint = () => checkpoints++;
  hero.onFall = () => { if (!horse.everMounted) return false; horse.respawnAtCheckpoint(hero); return true; };
  const none = { moveX: 0, moveY: 0, jumpPressed: false };
  const HC = CONFIG.horse, tApex = HC.hopVelocity / HC.gravity;
  const collectPoint = () => horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9);

  // Autopilot jump: take off so the apex lands over the obstacle.
  const shouldJump = () => {
    if (!horse.grounded) return false;
    for (const o of world.obstacles) {
      const rx = horse.position.x - o.cx, rz = horse.position.z - o.cz;
      const along = rx * o.dx + rz * o.dz, across = rx * o.nx + rz * o.nz;
      const lead = Math.max(1.2, horse.speed * tApex);
      if (Math.abs(across) < o.halfLength && along < 0 && -along < lead + 0.5 && -along > 0.5) return true;
    }
    return false;
  };

  // On foot from the sand bank landing to the horse.
  hero.reset();
  hero.lastSafe.set(L.hazardEndX + 6, world.heightAt(L.hazardEndX + 6, 1), 1); hero.respawn(); respawns = 0;
  let t = 0;
  while (!horse.canMount(hero) && t < 20) {
    const dx = horse.position.x - hero.position.x, dz = horse.position.z - hero.position.z;
    hero.update(dt, { moveX: 0, moveY: 1, jumpPressed: false }, Math.atan2(-dx, -dz));
    horse.update(dt, none, 0, hero); t += dt;
  }
  const walkOk = horse.canMount(hero);
  horse.toggle(hero);
  for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
  console.log(`walk to horse: ${walkOk ? 'ok' : 'FAILED'} (${t.toFixed(1)}s), mounted: ${horse.mode}`);
  if (!walkOk || horse.mode !== 'riding') failed = true;

  // Route: path samples + path/air gems in order, with side-trail detours, then the cave.
  const route = [];
  for (let x = -10; x <= 84; x += 5) route.push({ key: x, x, z: pathZ(x), passX: true });
  for (const g of gems.gems) if (g.kind !== 'spur') route.push({ key: g.position.x, x: g.position.x, z: g.position.z, gem: g, passX: g.kind === 'air' });
  L.spurs.forEach((sp, si) => {
    const seq = [{ x: sp.x0, z: sp.z0 }, ...gems.gems.filter((g) => g.spur === si).map((g) => ({ x: g.position.x, z: g.position.z, gem: g })), { x: sp.x0 + sp.ux * 2, z: sp.z0 + sp.uz * 2 }];
    seq.forEach((w, k) => route.push({ key: sp.x0 + k * 0.001, ...w }));
  });
  route.push({ key: 95, x: 95, z: 0, passX: true }, { key: 108, x: 108, z: 0, passX: true });
  route.sort((a, b) => a.key - b.key);
  const arch = world.caveArch;
  route.push({ x: arch.x - 12, z: arch.z, final: true });

  cam.reset(); cam.snapTo(hero.position);
  let wi = 0, best = Infinity, sinceProgress = 0, stuck = false, topSpeed = 0, stuckAt = '';
  let frames = 0, inside = 0, blockedFor = 0, worstBlock = 0, rideDists = [];
  let waterTime = 0, waterMaxSpeed = 0, minSeatAboveWater = Infinity;
  t = 0;
  while (t < 150 && wi < route.length) {
    const w = route[wi];
    const dx = w.x - horse.position.x, dz = w.z - horse.position.z, d = Math.hypot(dx, dz);
    const done = w.gem ? w.gem.collected : (d < 2.2 || (w.passX && horse.position.x > w.x + 0.5));
    if (done || (w.gem && w.passX && horse.position.x > w.x + 2)) { wi++; best = Infinity; sinceProgress = 0; continue; }
    if (d < best - 0.05) { best = d; sinceProgress = 0; } else if ((sinceProgress += dt) > 4) { stuck = true; stuckAt = `${w.x.toFixed(1)},${w.z.toFixed(1)}`; break; }
    const yaw = Math.atan2(-dx, -dz);
    cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * 0.1;
    const throttle = w.gem && d < 8 ? 0.6 : 1;
    horse.update(dt, { moveX: 0, moveY: throttle, jumpPressed: shouldJump() }, yaw, hero);
    gems.update(dt, collectPoint());
    cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping });
    world.updateFoliage(dt, cam.camera.position, cam.focus);
    topSpeed = Math.max(topSpeed, horse.speed);
    if (horse.inWater) {
      waterTime += dt;
      waterMaxSpeed = Math.max(waterMaxSpeed, horse.speed);
      minSeatAboveWater = Math.min(minSeatAboveWater, hero.position.y - CONFIG.zones.waterY);
    }
    t += dt;
    if (horse.grounded && Math.abs(hero.position.x - 40) < 40) rideDists.push(cam.camera.position.distanceTo(cam.pivot));
    if (hero.position.x > Z.forestStart && hero.position.x < Z.caveStart) {
      frames++;
      const chk = cameraCheck(cam);
      inside += chk.inside;
      blockedFor = chk.blocked ? blockedFor + dt : 0; worstBlock = Math.max(worstBlock, blockedFor);
    }
  }
  const atCave = Math.hypot(hero.position.x - arch.x, hero.position.z - arch.z) < CONFIG.cave.reach;
  rideDists.sort((a, b) => a - b);
  const medianDist = rideDists[Math.floor(rideDists.length / 2)];
  console.log(`ride: ${t.toFixed(1)}s, top speed ${topSpeed.toFixed(1)}, gems ${gems.gems.length - gems.remaining}/${gems.gems.length} (${gems.gems.filter((g) => !g.collected).map((g) => g.kind + '@' + g.position.x.toFixed(0)).join(' ') || 'all'}), counts ${JSON.stringify(gems.counts)}, unlocks [${[...abilities.unlocked]}], checkpoints ${checkpoints}/${CONFIG.checkpoints.xs.length - 1}, falls ${rideFalls}, stumbles ${horse.stumbles}, jumps cleared ${horse.obstaclesCleared}/${world.obstacles.length}, stuck ${stuck}${stuck ? ' at ' + stuckAt : ''}, reached cave ${atCave}`);
  console.log(`ford: ${waterTime.toFixed(1)}s in water, max speed there ${waterMaxSpeed.toFixed(1)} (cap ${(HC.maxSpeed * HC.waterSpeed).toFixed(1)}), rider seat ≥ ${minSeatAboveWater.toFixed(2)} above water, sounds ${JSON.stringify(sound.counts)}`);
  console.log(`camera riding: median distance ${medianDist.toFixed(2)} (target ${CONFIG.camera.rideDistance}); forest frames ${frames}, inside-solid ${inside}, longest leaf block ${worstBlock.toFixed(2)}s`);
  if (stuck || rideFalls || gems.remaining || abilities.unlocked.size !== 3 || !atCave || checkpoints !== CONFIG.checkpoints.xs.length - 1) failed = true;
  if (horse.stumbles || horse.obstaclesCleared < world.obstacles.length) failed = true;
  if (!(waterTime > 0.3) || waterMaxSpeed > HC.maxSpeed * HC.waterSpeed + 0.5 || minSeatAboveWater < 0.5) failed = true;
  if (!sound.counts.splashEnter || !sound.counts.splashExit || !sound.counts.splashStep) failed = true;
  if (!(medianDist < CONFIG.camera.rideDistance * 1.25)) failed = true;
  if (inside > 0 || worstBlock > 0.3) failed = true;

  // Giant cave: entrance ~10x the horse's height, cliffs tower over the arena.
  const archHeight = CONFIG.cave.archRadius;
  const cliffTop = Math.max(...world.cylinders.filter((c) => c.x > CONFIG.cave.cliff.faceX - 1).map((c) => c.top));
  console.log(`cave: entrance height ${archHeight} (= ${(archHeight / HC.height).toFixed(1)}x horse), cliff top ~${cliffTop.toFixed(0)}`);
  if (archHeight < 9 * HC.height || cliffTop < 40) failed = true;

  // Stumble: ride into the first obstacle without jumping → slowed briefly, no respawn, carries on.
  horse.lastCheckpoint = 1; horse.respawnAtCheckpoint(hero); rideFalls = 0;
  const o0 = world.obstacles[0];
  const s0 = horse.stumbles;
  let slowest = Infinity;
  for (let i = 0; i < 60 * 4 && horse.position.x < o0.cx + 4; i++) {
    const dx = o0.cx + o0.dx * 6 - horse.position.x, dz = o0.cz + o0.dz * 6 - horse.position.z;
    horse.update(dt, { moveX: 0, moveY: 1, jumpPressed: false }, Math.atan2(-dx, -dz), hero);
    if (horse.stumble > 0) slowest = Math.min(slowest, horse.speed);
  }
  const stumbled = horse.stumbles === s0 + 1;
  console.log(`stumble: ${stumbled ? 'ok' : 'FAILED'} (slowed to ${slowest.toFixed(1)}), respawned: ${rideFalls > 0}, carried on past it: ${horse.position.x > o0.cx}`);
  if (!stumbled || rideFalls || horse.position.x <= o0.cx) failed = true;

  // Gallop: hold → ~2x speed while stamina lasts, then it refills.
  // Along the long, straight sand bank (north–south, beside the river) at cruising speed,
  // then hold Gallop; then keep galloping (circling the arena) until stamina runs out.
  horse.position.set(-15, world.heightAt(-15, -45), -45); horse.heading = 0; horse.speed = HC.maxSpeed; horse.stamina = 1;
  let gTop = 0, steps = 0;
  while (horse.position.z < 50 && horse.stamina > 0.05 && steps++ < 600) {
    horse.update(dt, { moveX: 0, moveY: 1, jumpPressed: false, gallop: true }, Math.PI, hero);
    gTop = Math.max(gTop, horse.speed);
  }
  horse.position.set(CONFIG.cave.center[0], 0, 8); horse.heading = Math.PI / 2;
  const pursue = (gallop) => {
    // Circle the arena so the run never ends at a wall.
    const [cx, cz] = CONFIG.cave.center, a = Math.atan2(horse.position.z - cz, horse.position.x - cx) + 0.5;
    const dx = cx + Math.cos(a) * 12 - horse.position.x, dz = cz + Math.sin(a) * 12 - horse.position.z;
    horse.update(dt, { moveX: 0, moveY: 1, jumpPressed: shouldJump(), gallop }, Math.atan2(-dx, -dz), hero);
  };
  while (horse.stamina > 0 && steps++ < 60 * 8) pursue(true);
  pursue(true);
  const drained = horse.stamina === 0 && !horse.galloping;
  const before = horse.stamina;
  for (let i = 0; i < 60 * 3; i++) pursue(false);
  const refilled = horse.stamina > before;
  console.log(`gallop: top speed ${gTop.toFixed(1)} (normal ${HC.maxSpeed}, x${(gTop / HC.maxSpeed).toFixed(2)}), lasted ${(steps * dt).toFixed(1)}s, drained ${drained}, refills ${refilled} (to ${horse.stamina.toFixed(2)} after 3 s)`);
  if (gTop < HC.maxSpeed * 1.9 || !drained || !refilled) failed = true;

  // Dismount, remount.
  horse.toggle(hero);
  for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
  const onFoot = !hero.riding && horse.mode === 'idle';
  for (let i = 0; i < 10; i++) { hero.update(dt, none, 0); horse.update(dt, none, 0, hero); }
  const canRemount = horse.canMount(hero);
  horse.toggle(hero);
  for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
  console.log(`dismount: ${onFoot ? 'ok' : 'FAILED'}, remount: ${canRemount && horse.mode === 'riding' ? 'ok' : 'FAILED'}`);
  if (!onFoot || !canRemount || horse.mode !== 'riding') failed = true;

  // A fall on foot after riding → back on the horse at the last checkpoint; gems kept.
  horse.toggle(hero);
  for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
  const gemsBefore = JSON.stringify(gems.counts);
  rideFalls = 0;
  hero.position.set(L.hazardEndX - 6, 0.3, 0); hero.velocity.set(0, 0, 0); hero.grounded = false;
  for (let i = 0; i < 30 && !hero.riding; i++) hero.update(dt, none, 0);
  const cp = horse.checkpoints[horse.lastCheckpoint].position;
  const backOnHorse = horse.mode === 'riding' && hero.riding && Math.hypot(horse.position.x - cp.x, horse.position.z - cp.z) < 0.01;
  console.log(`fall → respawn on horse at checkpoint ${horse.lastCheckpoint}: ${backOnHorse && rideFalls === 1 ? 'ok' : 'FAILED'}, gems kept: ${JSON.stringify(gems.counts) === gemsBefore}`);
  if (!backOnHorse || rideFalls !== 1 || JSON.stringify(gems.counts) !== gemsBefore) failed = true;
}

console.log(failed ? 'ROUTE TEST FAILED' : 'route test passed');
process.exit(failed ? 1 : 0);
