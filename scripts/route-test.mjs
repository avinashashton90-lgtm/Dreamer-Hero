// Headless route test: runs the real hero physics against the generated map.
// Usage: npm run test:route   (exits non-zero on failure)
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { CONFIG } from '../src/config.js';
import { FollowCamera } from '../src/camera.js';
const world = new World(); await world.init();
const hero = new Hero(world.scene, world); await hero.init();
let respawns = 0; hero.onRespawn = () => respawns++;
const dt = 1/60, L = world.layout, H = CONFIG.hero;
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
// 7) Camera in the tree zone: during an autopilot run the camera never sits inside a trunk
// or a leaf cluster, and leaves left opaque never block the camera→hero line for long.
{
  const cam = new FollowCamera(16 / 9, world);
  hero.reset(); respawns = 0;
  cam.reset(); cam.snapTo(hero.position);
  const fade = world.foliage.mesh.geometry.attributes.instanceFade.array;
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
    const c = cam.camera.position, f = cam.focus;
    const dist = c.distanceTo(f); minDist = Math.min(minDist, dist); maxDist = Math.max(maxDist, dist);
    for (const cy of world.cylinders) if (Math.hypot(c.x - cy.x, c.z - cy.z) < cy.r && c.y > cy.bottom && c.y < cy.top) inside++;
    world.foliage.items.forEach((l, i) => { if (fade[i] > 0.5 && Math.hypot(c.x-l.x, c.y-l.y, c.z-l.z) < l.r * 0.9) inside++; });
    // Opaque leaves crossing the camera→hero segment?
    const sx = c.x-f.x, sy = c.y-f.y, sz = c.z-f.z, L2 = sx*sx+sy*sy+sz*sz;
    const blocked = world.foliage.items.some((l, i) => {
      if (fade[i] < 0.5) return false;
      const dx = l.x-f.x, dy = l.y-f.y, dz = l.z-f.z;
      const u = Math.max(0, Math.min(1, (dx*sx+dy*sy+dz*sz)/L2));
      return Math.hypot(dx-sx*u, dy-sy*u, dz-sz*u) < l.r * 0.8;
    });
    blockedFor = blocked ? blockedFor + dt : 0; worstBlock = Math.max(worstBlock, blockedFor);
  }
  console.log(`camera in trees: ${frames} frames, distance ${minDist.toFixed(1)}–${maxDist.toFixed(1)} (base ${CONFIG.camera.distance}), inside-solid frames ${inside}, longest leaf block ${worstBlock.toFixed(2)}s`);
  if (inside > 0 || worstBlock > 0.3) failed = true;
}

console.log(failed ? 'ROUTE TEST FAILED' : 'route test passed');
process.exit(failed ? 1 : 0);
