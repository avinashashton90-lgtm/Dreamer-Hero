// Headless route test: runs the real hero physics against the generated map.
// Usage: npm run test:route   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs'; // the real Mixamo hero, read from public/
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { CONFIG } from '../src/config.js';
import { FollowCamera } from '../src/camera.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Abilities } from '../src/abilities.js';
import { Hurdles } from '../src/hurdles.js';
import { hurdleControls } from './hurdle-bot.mjs';
const world = new World(); await world.init();
const hero = new Hero(world.scene, world, heroAssets); await hero.init();
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
  console.log(`camera in trees: ${frames} frames, distance ${minDist.toFixed(1)}–${maxDist.toFixed(1)} (base ${CONFIG.camera.camOnFootDistance}), inside-solid frames ${inside}, longest leaf block ${worstBlock.toFixed(2)}s`);
  if (inside > 0 || worstBlock > 0.3) failed = true;
}

// 8) Horse and the long forest ride: walk to the horse, mount, ride the whole trail at normal
// speed (steering like a player: stick left/right only, path assist on), jumping every
// obstacle and collecting every gem, through the ford to the giant cave. Then a galloping
// run, a run that never jumps (stumbles only, never trapped), stamina, dismount/remount and
// a fall after riding (respawn on the horse).
{
  const { Sound } = await import('../src/audio.js');
  const track = world.track, TRK = CONFIG.track, OB = CONFIG.obstacles, GC = CONFIG.gems;
  const horse = new Horse(world.scene, world, heroAssets); await horse.init();
  const sound = new Sound(); horse.sound = sound;
  const abilities = new Abilities(hero);
  const gems = new Gems(world.scene, world, { onUnlock: (c, a) => abilities.unlock(a) });
  await gems.init();
  // The forest ride's gems (the desert has a few optional ones of its own).
  const forestGems = gems.gems.filter((g) => g.zone === 'forest');
  const forestLeft = () => forestGems.filter((g) => !g.collected).length;
  const forestPerColor = {};
  for (const g of forestGems) forestPerColor[g.color] = (forestPerColor[g.color] ?? 0) + 1;
  const cam = new FollowCamera(16 / 9, world);
  let rideFalls = 0, checkpoints = 0;
  horse.onRespawn = () => rideFalls++;
  horse.onCheckpoint = () => checkpoints++;
  let hurdleHurt = 0;
  const hurdles = new Hurdles(world.scene, world, { onHurt: (n) => (hurdleHurt += n) });
  await hurdles.init();
  hero.onFall = () => { if (!horse.everMounted) return false; horse.respawnAtCheckpoint(hero); return true; };
  const none = { moveX: 0, moveY: 0, jumpPressed: false };
  const HC = CONFIG.horse, tApex = HC.hopVelocity / HC.gravity;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const arch = world.caveArch;

  // Layout checks: obstacle count/spacing/straightness, the arena clear, gems inside the trail.
  const obs = world.obstacles; // (none now: the forest hurdles replaced the logs, the rock wall and the brick walls)
  const FW = CONFIG.forestWalls;
  const gapWalls = world.gapWalls;
  const allItems = [...obs, ...gapWalls].sort((a, b) => a.s - b.s);
  let layoutOk = obs.length === 0;
  // The forest hurdles (hurdles.js): spaced, in the middle 80% of the trail, on straights, none near the cave.
  const HU = CONFIG.hurdles;
  const hl = world.hurdles;
  {
    const types = new Set(hl.map((h) => h.type));
    const spacing = hl.slice(1).map((h, i) => h.s - hl[i].s);
    const inside = hl.every((h) => h.s >= track.length * HU.edgeClear && h.s <= track.length * (1 - HU.edgeClear));
    const straight = hl.every((h) => track.maxCurvature(h.s - (h.type === 'wall' ? HU.types.wall.runUp : HU.straightBefore), h.s + HU.straightAfter) <= HU.maxCurvature);
    const nearCaveH = hl.filter((h) => Math.hypot(h.x - arch.x, h.z - arch.z) < OB.caveClear).length;
    const groundGemOn = forestGems.filter((g) => g.kind !== 'air' && hl.some((h) => Math.abs(g.s - h.s) < HU.types.wall.depth + HU.contactReach + GC.size)).length;
    const clearOfWalls = hl.every((h) => gapWalls.every((w) => h.s < w.s - FW.leadIn - FW.safeApproach || h.s > w.s + FW.leadOut + FW.safeExit));
    console.log(`forest hurdles: ${hl.map((h) => `${h.type}@${h.s.toFixed(0)}`).join(' ')}; spacing ${spacing.map((d) => d.toFixed(0)).join(', ')} (≥ ${HU.obstacleSpacingMin}); inside the middle 80% ${inside}; on straights ${straight}; near the cave ${nearCaveH}; ground gems on a hurdle ${groundGemOn}; clear of the high walls ${clearOfWalls}`);
    if (hl.length < 4 || !types.has('wall') || !types.has('thorns') || !types.has('stones') || spacing.some((d) => d < HU.obstacleSpacingMin) || !inside || !straight || nearCaveH || groundGemOn || !clearOfWalls) layoutOk = false;
  }
  const obsInfo = allItems.map((o, i) => {
    const gapBefore = i ? o.s - allItems[i - 1].s : o.s;
    const set = o.type === 'brick' || o.type === 'gapWall';
    const k = set ? track.maxCurvature(o.s - FW.runUp, o.s + FW.straightAfter) : track.maxCurvature(o.s - OB.straightBefore, o.s + OB.straightAfter);
    const caveD = Math.hypot(o.cx - arch.x, o.cz - arch.z);
    const n = track.nearest(o.cx, o.cz, 20);
    const inTrail = n && Math.abs(n.lateral) < 0.5 && (o.type === 'gapWall' || o.halfLength <= TRK.halfWidth);
    if (gapBefore < FW.runUp + FW.runOut || k > OB.maxCurvature || caveD < OB.caveClear || (o.type !== 'gapWall' && o.height > 0.75) || !inTrail) layoutOk = false;
    return `${o.type}${o.gap ? '(' + o.gap + ')' : ''}@${o.s.toFixed(0)}`;
  });

  // Forest walls: the 4 high stone walls (dark, taller than horse + riders; the low brick walls
  // were replaced by the hurdles) with a 6-wide gap left / centre / right that fits the horse;
  // on straights with a 40 run-up, none within caveClear of the cave.
  {
    const bricks = obs.filter((o) => o.type === 'brick');
    const lum = (c) => new THREE.Color(c).getHSL({}).l;
    const riderTop = CONFIG.horseModel.backHeight + CONFIG.heroModel.height * 0.6; // seated AJ's head
    const sides = new Set(gapWalls.map((w) => w.gap));
    const fits = gapWalls.every((w) => w.gapHi - w.gapLo >= FW.gapWidth - 1e-6 && w.gapHi - w.gapLo - 2 * HC.radius > 2.5);
    const atWall = gapWalls.every((w) => { const l = world.laneAt(track, w.s); return Math.abs(l.lo - w.gapLo) < 1e-6 && Math.abs(l.hi - w.gapHi) < 1e-6; });
    const funnelSmooth = gapWalls.every((w) => { let prev = world.laneAt(track, w.s - FW.leadIn - 2); for (let s = w.s - FW.leadIn; s <= w.s; s += 0.5) { const l = world.laneAt(track, s); if (Math.abs(l.lo - prev.lo) > 0.5 || Math.abs(l.hi - prev.hi) > 0.5) return false; prev = l; } return true; });
    const straight = [...bricks, ...gapWalls].every((o) => track.maxCurvature(o.s - FW.runUp, o.s + FW.straightAfter) <= OB.maxCurvature);
    const near = [...bricks, ...gapWalls].filter((o) => Math.hypot(o.cx - arch.x, o.cz - arch.z) < OB.caveClear).length;
    const lowOk = bricks.every((o) => o.height >= 0.45 && o.height <= 0.65) && lum(FW.low.color) > lum(FW.high.color) + 0.2;
    const highOk = gapWalls.every((w) => w.height > riderTop + 0.5);
    const sets = bricks.length + gapWalls.length;
    console.log(`forest walls: ${sets} sets — ${bricks.length} low brick (${FW.low.height} high, lightness ${lum(FW.low.color).toFixed(2)}) and ${gapWalls.length} high stone (${FW.high.height} high > horse + rider ${riderTop.toFixed(2)}, lightness ${lum(FW.high.color).toFixed(2)}), gaps ${gapWalls.map((w) => w.gap).join(' / ')} (${FW.gapWidth} wide, fits the horse ${fits}, funnel smooth ${funnelSmooth}, limits = gap at the wall ${atWall}), all on straights ${straight}, within ${OB.caveClear} of the cave ${near}`);
    if (sets !== FW.sets.length || bricks.length || gapWalls.length < 3 || sides.size < 3 || !fits || !atWall || !funnelSmooth || !straight || near || !lowOk || !highOk) layoutOk = false;
  }
  // Nothing hurdle/barrier-like near the cave: no obstacle (or obstacle collider) within caveClear.
  const nearCave = [...obs, ...world.beams.filter((b) => b.obstacle).map((b) => ({ cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 }))]
    .filter((o) => Math.hypot(o.cx - arch.x, o.cz - arch.z) < OB.caveClear).length;
  console.log(`trail spline length ${track.length.toFixed(0)} (minimum ${CONFIG.trailLength}); obstacles within ${OB.caveClear} of the cave: ${nearCave}`);
  if (track.length < CONFIG.trailLength || nearCave) failed = true;
  // The tree-free corridor: no tree (crown included) or edge bush/boulder inside it.
  const CH = TRK.corridorHalfWidth;
  const treesIn = world.trees.filter((t) => track.distance(t.x, t.z, CH + t.reach + 1) < CH + t.reach - 1e-3).length;
  const crownsIn = world.foliageSets.filter((f) => f.bounds).reduce((n, f) => n + f.items.filter((l) => track.distance(l.x, l.z, CH + l.r + 1) < CH + l.r - 1e-3).length, 0);
  const edgeIn = world.edgeItems.filter((e) => track.distance(e.x, e.z, CH + e.r + 1) < CH + e.r - 1e-3).length;
  console.log(`corridor (${CH * 2} wide): trees ${world.trees.length} (inside ${treesIn}, crowns inside ${crownsIn}), edge bushes/boulders ${world.edgeItems.length} (inside ${edgeIn})`);
  // Continuous edge: at least 85% of the slots along both sides are filled (the rest are the ford).
  const edgeSlots = (2 * track.length) / TRK.edge.spacing;
  console.log(`edge line: ${world.edgeItems.length}/${edgeSlots.toFixed(0)} slots filled`);
  if (treesIn || crownsIn || edgeIn || world.edgeItems.length < edgeSlots * 0.85) failed = true;
  let gemsOut = 0, airLow = 0, gemsInWall = 0;
  for (const g of forestGems) {
    // Never inside a wall: through a high wall only within its gap; at a low wall only above it.
    for (const w of gapWalls) if (Math.abs(g.s - w.s) < w.depth / 2 + GC.size && (g.lateral < w.gapLo + 0.5 || g.lateral > w.gapHi - 0.5)) gemsInWall++;
    for (const o of obs) if (Math.abs(g.s - o.s) < o.depth / 2 + GC.size && g.position.y - GC.size < o.top + 0.2) gemsInWall++;
    const n = track.nearest(g.position.x, g.position.z, 20);
    if (!n || n.dist > GC.laneMax || n.dist > TRK.halfWidth) gemsOut++;
    if (g.kind === 'air') {
      const ground = world.heightAt(g.position.x, g.position.z) + GC.riderReach;
      if (g.position.y - ground < GC.collectHeight + 0.1) airLow++; // reachable without a jump
    }
  }
  const perColor = JSON.stringify(forestPerColor);
  console.log(`track: length ${track.length.toFixed(0)}, obstacles ${obs.length} [${obsInfo.join(' ')}], gems ${forestGems.length} ${perColor}, outside trail ${gemsOut}, inside a wall ${gemsInWall}, on the safe line through the gaps ${forestGems.filter((g) => g.kind === 'gap').length}, air gems reachable without jump ${airLow}, checkpoints at ${horse.checkpoints.map((c) => (c.s / track.length * 100).toFixed(0) + '%').join(' ')}`);
  if (!layoutOk || gemsOut || gemsInWall || airLow || Object.values(forestPerColor).some((n) => n < 28 || n > 32)) failed = true;

  // Autopilot jump: take off so the apex lands over the obstacle.
  const shouldJump = () => {
    if (!horse.grounded) return false;
    for (const o of obs) {
      const rx = horse.position.x - o.cx, rz = horse.position.z - o.cz;
      const along = rx * o.dx + rz * o.dz, across = rx * o.nx + rz * o.nz;
      const lead = Math.max(1.2, horse.speed * tApex);
      if (Math.abs(across) < o.halfLength && along < 0 && -along < lead + 0.5 && -along > 0.5) return true;
    }
    return false;
  };
  // Horse-relative steering toward a point (stick right = turn right = heading down).
  const steerTo = (x, z, gain = 2.2) => {
    const want = Math.atan2(x - horse.position.x, z - horse.position.z);
    return THREE.MathUtils.clamp(-wrap(want - horse.heading) * gain, -1, 1);
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

  // One full ride from the start of the trail to the cave. The bot looks ~14 ahead on the
  // trail, lined up with the next uncollected gem's lane offset (gems are all in the lane).
  const ride = ({ gallop = false, jump = true, check = false } = {}) => {
    horse.lastCheckpoint = 0; horse.checkpoints.forEach((c, i) => (c.reached = i === 0));
    horse.respawnAtCheckpoint(hero); horse.stamina = 1; rideFalls = 0; checkpoints = 0;
    gems.reset(); abilities.reset?.(); horse.arrivedAtCave = false;
    hurdles.reset(); hurdleHurt = 0;
    const hs0 = { ...hurdles.stats };
    const stumbles0 = horse.stumbles, cleared0 = horse.obstaclesCleared;
    cam.reset(); cam.snapTo(hero.position);
    let t = 0, bestS = 0, since = 0, stuck = false, stuckAt = '', topSpeed = 0, maxLat = 0, wobble = 0, prevSteer = 0;
    let frames = 0, inside = 0, blockedFor = 0, worstBlock = 0, rideDists = [], waterTime = 0, waterMaxSpeed = 0, minSeat = Infinity;
    let atCave = false, wetFor = 0, gapsMissed = 0;
    const gapsPassed = new Set();
    while (t < 200) {
      const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
      if (n.s > bestS + 1) { bestS = n.s; since = 0; } else if ((since += dt) > 4 && n.s < track.length - 3) { stuck = true; stuckAt = `s ${n.s.toFixed(0)} (${horse.position.x.toFixed(0)},${horse.position.z.toFixed(0)})`; break; }
      atCave = horse.arrivedAtCave || Math.hypot(hero.position.x - arch.x, hero.position.z - arch.z) < CONFIG.cave.reach;
      if (atCave) break;
      let tx, tz;
      if (n.s > track.length - 6) { tx = arch.x - 4; tz = arch.z; }
      else {
        // On the safe line (through the gaps of the high walls), lined up with the next gem.
        const next = forestGems.find((g) => !g.collected && g.s > n.s + 2 && g.s < n.s + 30);
        const lat = world.safeLateral(track, n.s + 14) + (next ? next.lateral - world.safeLateral(track, next.s) : 0);
        const p = track.at(n.s + 14);
        tx = p.x - p.tz * lat; tz = p.z + p.tx * lat;
      }
      const moveX = steerTo(tx, tz);
      // Like a player: ease off the gallop just before the tighter corners.
      const tight = track.maxCurvature(n.s, n.s + 30) > 0.018;
      const hc = hurdleControls(horse, hurdles, { jumpSmall: jump }); // (giant walls: always a gallop + power jump)
      horse.update(dt, { moveX, moveY: 1, jumpPressed: (jump && shouldJump()) || hc.jump, gallop: (gallop && !tight) || hc.gallop }, cam.yaw, hero);
      hurdles.update(dt, horse);
      gems.update(dt, horse.collectPoint);
      cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, gallop: horse.galloping, heading: horse.heading });
      if (check) world.updateFoliage(dt, cam.camera.position, cam.focus);
      t += dt;
      // Through each high wall: crossing its line inside the gap.
      for (const w of gapWalls) {
        if (gapsPassed.has(w) || n.s < w.s) continue;
        const m = track.nearest(horse.position.x, horse.position.z, 30);
        if (m && m.s >= w.s && m.s < w.s + 3) { gapsPassed.add(w); if (m.lateral < w.gapLo || m.lateral > w.gapHi) gapsMissed++; }
      }
      topSpeed = Math.max(topSpeed, horse.speed);
      if (n.s > 5 && n.s < track.length - 5) maxLat = Math.max(maxLat, Math.abs(n.lateral));
      if (Math.sign(moveX) !== Math.sign(prevSteer) && Math.abs(moveX - prevSteer) > 0.5) wobble++;
      prevSteer = moveX;
      if (horse.inWater) { waterTime += dt; wetFor += dt; if (wetFor > 0.3) waterMaxSpeed = Math.max(waterMaxSpeed, horse.speed); minSeat = Math.min(minSeat, hero.position.y - CONFIG.zones.waterY); }
      if (!horse.inWater) wetFor = 0;
      if (check) {
        if (horse.grounded && horse.speed > 5) rideDists.push(cam.camera.position.distanceTo(cam.pivot));
        if (Math.floor(t / dt) % 3 === 0) {
          frames++;
          const chk = cameraCheck(cam);
          inside += chk.inside;
          blockedFor = chk.blocked ? blockedFor + dt * 3 : 0; worstBlock = Math.max(worstBlock, blockedFor);
        }
      }
    }
    rideDists.sort((a, b) => a - b);
    return { gemsLeft: forestLeft(), missed: forestGems.filter((g) => !g.collected).map((g) => g.kind + '@' + g.s.toFixed(0)).join(' '), t, stuck, stuckAt, atCave, topSpeed, maxLat, wobble, frames, inside, worstBlock, medianDist: rideDists[Math.floor(rideDists.length / 2)],
      waterTime, waterMaxSpeed, minSeat, stumbles: horse.stumbles - stumbles0, cleared: horse.obstaclesCleared - cleared0, falls: rideFalls, checkpoints, gaps: gapsPassed.size - gapsMissed,
      hu: Object.fromEntries(Object.entries(hurdles.stats).map(([k, v]) => [k, v - hs0[k]])), hurt: hurdleHurt };
  };

  // a) Normal speed, jumping and collecting.
  const r = ride({ check: true });
  const nCp = CONFIG.checkpoints.fractions.length - 1;
  console.log(`ride (normal): ${r.t.toFixed(1)}s, top speed ${r.topSpeed.toFixed(1)}, gems ${forestGems.length - forestLeft()}/${forestGems.length} (${forestGems.filter((g) => !g.collected).map((g) => g.kind + '@' + g.s.toFixed(0)).join(' ') || 'all'}), counts ${JSON.stringify(gems.counts)}, unlocks [${[...abilities.unlocked]}], checkpoints ${r.checkpoints}/${nCp}, falls ${r.falls}, stumbles ${r.stumbles}, jumps cleared ${r.cleared}/${obs.length}, high-wall gaps ${r.gaps}/${gapWalls.length}, max off-centre ${r.maxLat.toFixed(1)}, stuck ${r.stuck}${r.stuck ? ' at ' + r.stuckAt : ''}, reached cave ${r.atCave}`);
  console.log(`ford: ${r.waterTime.toFixed(1)}s in water, max speed there ${r.waterMaxSpeed.toFixed(1)} (cap ${(HC.maxSpeed * HC.waterSpeed).toFixed(1)}), rider seat ≥ ${r.minSeat.toFixed(2)} above water, sounds ${JSON.stringify(sound.counts)}`);
  console.log(`camera riding: median distance ${r.medianDist.toFixed(2)} (target ${CONFIG.camera.camRideDistance}); checked frames ${r.frames}, inside-solid ${r.inside}, longest leaf block ${r.worstBlock.toFixed(2)}s`);
  if (r.stuck || r.falls || forestLeft() || abilities.unlocked.size !== 3 || !r.atCave || r.checkpoints !== nCp) failed = true;
  const nWalls = hl.filter((h) => h.type === 'wall').length;
  const nStones = hl.filter((h) => h.type === 'stones').length;
  console.log(`hurdles (normal): ${JSON.stringify(r.hu)}, hearts lost ${r.hurt}`);
  if (r.stumbles || r.cleared < obs.length || r.gaps < gapWalls.length || r.maxLat > TRK.halfWidth) failed = true;
  if (r.hu.wallsCleared !== nWalls || r.hu.wallBlocks || r.hu.thornHits || r.hu.stoneStumbles || r.hurt) failed = true;
  if (r.t < 75 || r.t > 105) { console.log('normal ride time out of the ~90 s target'); failed = true; }
  if (!(r.waterTime > 0.3) || r.waterMaxSpeed > HC.maxSpeed * HC.waterSpeed + 0.5 || r.minSeat < 0.5) failed = true;
  if (!sound.counts.splashEnter || !sound.counts.splashExit || !sound.counts.splashStep) failed = true;
  if (!(r.medianDist < CONFIG.camera.camRideDistance * 1.25)) failed = true;
  if (r.inside > 0 || r.worstBlock > 0.3) failed = true;

  // b) Holding Gallop the whole way (stamina permitting), easing off before tight corners.
  const rg = ride({ gallop: true });
  console.log(`ride (gallop held): ${rg.t.toFixed(1)}s, top speed ${rg.topSpeed.toFixed(1)}, gems missed ${rg.gemsLeft} ${rg.missed}, stumbles ${rg.stumbles}, jumps cleared ${rg.cleared}/${obs.length}, gaps ${rg.gaps}/${gapWalls.length}, max off-centre ${rg.maxLat.toFixed(1)}, stuck ${rg.stuck}, falls ${rg.falls}, reached cave ${rg.atCave}`);
  console.log(`hurdles (gallop): ${JSON.stringify(rg.hu)}, hearts lost ${rg.hurt}`);
  if (rg.stuck || rg.falls || !rg.atCave || rg.maxLat > TRK.halfWidth || rg.t > 65 || rg.t < 40 || rg.gemsLeft || rg.stumbles || rg.cleared < obs.length || rg.gaps < gapWalls.length) failed = true;
  if (rg.hu.wallsCleared !== nWalls || rg.hu.wallBlocks || rg.hu.thornHits || rg.hu.stoneStumbles || rg.hurt) failed = true;

  // c) Never jumping the small hurdles (the giant walls still need their power jump): the stones
  // are stumbles (slows a little), the thorns a hit at most — never a trap or a respawn.
  const rn = ride({ jump: false });
  console.log(`ride (no small jumps): ${rn.t.toFixed(1)}s, stumbles ${rn.stumbles} (stone rows ${nStones}), hurdles ${JSON.stringify(rn.hu)}, gaps ${rn.gaps}/${gapWalls.length}, stuck ${rn.stuck}${rn.stuck ? ' at ' + rn.stuckAt : ''}, falls ${rn.falls}, reached cave ${rn.atCave}`);
  if (rn.stuck || rn.falls || !rn.atCave || rn.stumbles < nStones || rn.hu.stoneStumbles < nStones || rn.hu.wallBlocks || rn.gaps < gapWalls.length) failed = true;

  // Stumble: slowed a little, carries on.
  {
    // (a row of stones: a hurdle the horse is meant to jump)
    const o = hl.find((h) => h.type === 'stones');
    horse.lastCheckpoint = Math.max(0, horse.checkpoints.findLastIndex((c) => c.s < o.s - 30)); horse.respawnAtCheckpoint(hero); rideFalls = 0;
    hurdles.reset();
    const s0 = horse.stumbles;
    let before = 0, slowest = Infinity, n = null;
    for (let i = 0; i < 60 * 30; i++) {
      n = track.nearest(horse.position.x, horse.position.z, 30);
      if (n.s > o.s + 15) break;
      const p = track.at(n.s + 14);
      const hc = hurdleControls(horse, hurdles, { jumpSmall: false });
      horse.update(dt, { moveX: steerTo(p.x, p.z), moveY: 1, jumpPressed: hc.jump, gallop: hc.gallop }, cam.yaw, hero);
      hurdles.update(dt, horse);
      if (horse.stumbles === s0) before = horse.speed;
      if (horse.stumble > 0) slowest = Math.min(slowest, horse.speed);
    }
    const stumbled = horse.stumbles === s0 + 1;
    console.log(`stumble: ${stumbled ? 'ok' : 'FAILED'} [${horse.stumbles - s0} at the stones s ${o.s.toFixed(0)}, start ${horse.checkpoints[horse.lastCheckpoint].s.toFixed(0)}] (${before.toFixed(1)} → ${slowest.toFixed(1)}), respawned: ${rideFalls > 0}, carried on past it: ${n.s > o.s}`);
    if (!stumbled || rideFalls || n.s <= o.s || slowest < before * 0.5) failed = true;
  }

  // Steering: stick centred → holds its line (no drift off a straight); a tap of steer then
  // centred → straightens out instead of swinging.
  {
    horse.lastCheckpoint = 0; horse.respawnAtCheckpoint(hero);
    for (let i = 0; i < 60 * 3; i++) horse.update(dt, { moveX: 0, moveY: 1, jumpPressed: false }, cam.yaw, hero);
    const h0 = horse.heading;
    for (let i = 0; i < 12; i++) horse.update(dt, { moveX: 1, moveY: 1, jumpPressed: false }, cam.yaw, hero);
    const hTurned = horse.heading;
    for (let i = 0; i < 60; i++) horse.update(dt, { moveX: 0, moveY: 1, jumpPressed: false }, cam.yaw, hero);
    const settle = horse.steer;
    const n = track.nearest(horse.position.x, horse.position.z, 30);
    console.log(`steering: tap turned ${(wrap(h0 - hTurned) * 57.3).toFixed(1)}°, residual steer after 1 s ${settle.toFixed(3)}, still on trail (off-centre ${n ? n.lateral.toFixed(1) : '?'})`);
    if (Math.abs(settle) > 0.01 || !n || Math.abs(n.lateral) > TRK.halfWidth) failed = true;
  }

  // Gallop: hold → ~2x speed while stamina lasts, then it refills (on the first straight).
  {
    horse.lastCheckpoint = 0; horse.respawnAtCheckpoint(hero);
    horse.speed = HC.maxSpeed; horse.stamina = 1;
    let gTop = 0, steps = 0;
    const drive = (gallop) => {
      const n = track.nearest(horse.position.x, horse.position.z, 30) ?? track.nearestGlobal(horse.position.x, horse.position.z);
      const p = track.at(n.s + 14);
      horse.update(dt, { moveX: steerTo(p.x, p.z), moveY: 1, jumpPressed: shouldJump(), gallop }, cam.yaw, hero);
    };
    while (horse.stamina > 0 && steps++ < 60 * 20) { drive(true); gTop = Math.max(gTop, horse.speed); }
    drive(true);
    const drained = horse.stamina === 0 && !horse.galloping;
    const before = horse.stamina;
    for (let i = 0; i < 60 * 3; i++) drive(false);
    const refilled = horse.stamina > before;
    console.log(`gallop: top speed ${gTop.toFixed(1)} (normal ${HC.maxSpeed}, x${(gTop / HC.maxSpeed).toFixed(2)}), lasted ${(steps * dt).toFixed(1)}s, drained ${drained}, refills ${refilled} (to ${horse.stamina.toFixed(2)} after 3 s)`);
    if (gTop < HC.maxSpeed * 1.9 || !drained || !refilled) failed = true;
  }

  // Side walls: steer hard into them (normal speed and galloping, both sides, at several
  // places) — the horse stays on the trail and slides along instead of stopping dead.
  {
    let worst = 0, slowest = Infinity, tests = 0;
    for (const f of [0.15, 0.33, 0.55, 0.7, 0.9]) for (const side of [-1, 1]) for (const gallop of [false, true]) {
      const s0 = f * track.length, p = track.at(s0);
      horse.position.set(p.x, world.heightAt(p.x, p.z), p.z); horse.heading = Math.atan2(p.tx, p.tz);
      horse.speed = HC.maxSpeed * (gallop ? 2 : 1); horse.stamina = 1; horse.steer = 0; horse.velocity.set(0, 0, 0); horse.grounded = true;
      for (let i = 0; i < 60 * 3; i++) {
        horse.update(dt, { moveX: side, moveY: 1, jumpPressed: false, gallop }, cam.yaw, hero);
        const n = track.nearest(horse.position.x, horse.position.z, 30);
        worst = Math.max(worst, n ? Math.abs(n.lateral) : Infinity);
        if (i > 60) slowest = Math.min(slowest, horse.speed);
      }
      tests++;
    }
    // On foot, too.
    horse.toggle(hero); for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
    let footWorst = 0;
    for (const side of [-1, 1]) {
      const p = track.at(track.length * 0.3);
      hero.lastSafe.set(p.x, world.heightAt(p.x, p.z), p.z); hero.respawn();
      const yaw = Math.atan2(p.tx, p.tz) + Math.PI; // camera behind, looking along the trail
      for (let i = 0; i < 60 * 3; i++) {
        hero.update(dt, { moveX: side, moveY: 0.3, jumpPressed: false }, yaw);
        const n = track.nearest(hero.position.x, hero.position.z, 30);
        footWorst = Math.max(footWorst, n ? Math.abs(n.lateral) : Infinity);
      }
    }
    horse.position.copy(hero.position); horse.mode = 'idle';
    const mx = hero.position.x - Math.cos(horse.heading) * 1.5, mz = hero.position.z + Math.sin(horse.heading) * 1.5;
    horse.position.set(mx, world.heightAt(mx, mz), mz);
    horse.toggle(hero); for (let i = 0; i < 40; i++) horse.update(dt, none, 0, hero);
    console.log(`side walls: ${tests} hard pushes on horseback — max off-centre ${worst.toFixed(2)} (trail half-width ${TRK.halfWidth}), slowest while sliding ${slowest.toFixed(1)}; on foot max off-centre ${footWorst.toFixed(2)}; remounted ${horse.mode === 'riding'}`);
    if (worst > TRK.halfWidth || footWorst > TRK.halfWidth || slowest < 3 || horse.mode !== 'riding') failed = true;
  }

  // High stone walls: ride at each one from the far side of the trail with the stick held hard
  // away from the gap (normal and galloping) — the funnel rails the horse into the gap; it
  // never stops dead or gets caught, and comes out through the gap.
  {
    let worstSlow = Infinity, through = 0, tests = 0, caught = '';
    for (const w of gapWalls) for (const gallop of [false, true]) {
      const away = w.gapCenter >= 0 ? -1 : 1; // the far side of the trail
      const s0 = w.s - FW.leadIn - 20, p = track.at(s0), lat = away * 5;
      horse.position.set(p.x - p.tz * lat, 0, p.z + p.tx * lat); horse.position.y = world.heightAt(horse.position.x, horse.position.z);
      horse.heading = Math.atan2(p.tx, p.tz); horse.speed = HC.maxSpeed * (gallop ? 2 : 1); horse.stamina = 1; horse.steer = 0;
      horse.velocity.set(0, 0, 0); horse.grounded = true;
      let crossed = null, t = 0;
      while (t < 8 && !crossed) {
        // stick right = turn right (+lateral): hold it toward the far side
        horse.update(dt, { moveX: away, moveY: 1, jumpPressed: false, gallop }, cam.yaw, hero); t += dt;
        const m = track.nearest(horse.position.x, horse.position.z, 30);
        if (t > 1 && m && m.s < w.s + 2) worstSlow = Math.min(worstSlow, horse.speed);
        if (m && m.s >= w.s + w.depth / 2) crossed = m;
      }
      tests++;
      if (crossed && crossed.lateral >= w.gapLo - 0.01 && crossed.lateral <= w.gapHi + 0.01) through++;
      else caught += ` ${w.gap}@${w.s.toFixed(0)}${gallop ? ' galloping' : ''}`;
    }
    console.log(`high walls: ${through}/${tests} hard pushes away from the gap came through it (funnel), slowest ${worstSlow.toFixed(1)}${caught ? ', caught at' + caught : ''}`);
    if (through < tests || worstSlow < 3) failed = true;
  }

  // Giant cave: entrance ~10x the horse's height, cliffs tower over the arena.
  const archHeight = CONFIG.cave.archRadius;
  const cliffTop = Math.max(...world.cylinders.filter((c) => c.x > CONFIG.cave.cliff.faceX - 1).map((c) => c.top));
  console.log(`cave: entrance height ${archHeight} (= ${(archHeight / HC.height).toFixed(1)}x horse), cliff top ~${cliffTop.toFixed(0)}`);
  if (archHeight < 9 * HC.height || cliffTop < 40) failed = true;

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
