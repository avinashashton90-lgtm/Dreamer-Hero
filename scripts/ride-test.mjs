// Headless test: the Gearhaven ride (src/part2/ride.js, rideModel.js; CONFIG.part2.ride) — the
// first playable section of Part 2, behind the courtyard's Fire door. Its layout (a trail ≥ 700
// long with side walls, rails, vents, the deck, hammers, cog platforms, conveyors, gears,
// checkpoints, the Fire Element's door) and draw budget; the walls hold at a gallop; rails
// (riding up a ramp onto one → grinding at speed with sparks and the scrape, steering hops to
// the next rail, Jump leaves it, its end hops the horse down, jumping down onto one from above,
// low rails are fences on the street); steam vents (a launch high onto the gear deck and onto
// the upper rail; missing the rail lands on the street — no harm, just slower); hazards (a
// hammer staggers and knocks the horse aside, conveyors push it sideways, cog platforms carry it
// round, a spinning saw staggers it and a jump clears it — never a heart); the kit models (Coaster
// Kit rails, Factory Kit conveyors / pipes / catwalk / decoration, the gear props, the skyline,
// the clock tower) and their placeholder fallbacks; gears (counted, a sound, a sparkle); a bot riding the whole level to the Fire
// door (every checkpoint, gears, no hearts lost, not stuck) → the Fire Element's stub; the
// courtyard's Fire door → the ride; leaving it hands the courtyard's world back.
// Usage: npm run test:ride   (exits non-zero on failure)
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
import { railHeight, trackPoint } from '../src/part2/rideModel.js';
import { RideWorld, loadRide } from '../src/part2/ride.js';

const P2 = CONFIG.part2, R = P2.ride, D2 = DIALOGUE.part2;
const dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

const world = new World(); await world.init();
const hero = new Hero(world.scene, world, heroAssets); await hero.init();
const sound = new Sound();
const horse = new Horse(world.scene, world, heroAssets); horse.sound = sound; await horse.init();
const cam = new FollowCamera(20 / 9, world);
const state = new GameState(STATES.PLAY);
const view = { lines: [], complete: false, show() {}, hide() {}, dialogue(s, t, c) { this.complete = c; }, clearDialogue() { this.complete = false; } };
const cinematic = new Cinematic(cam, view);
cinematic.bodies = characterBodies({ hero, girlModel: new THREE.Group(), horse });
const ui = { quest: null, dist: null, toasts: [], gears: null,
  toast(t) { this.toasts.push(t); }, setQuest(t, d) { this.quest = t; this.dist = d; }, fadeOut(ms, then) { then(); }, fadeIn() {},
  showGems() {}, setHorseEnergy() {}, setBossBar() {}, setGears(n, total, show) { this.gears = { n, total, show }; } };
let held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
const input = { enabled: true, setEnabled(on) { this.enabled = on; }, read: () => ({ ...held, lookDX: 0, lookDY: 0, lookSensitivity: 0 }),
  setCombatButtons(m) { this.mounted = m; }, setMountButton() {}, setDismountButton() {}, setGallopButton(on) { this.gallopShown = on; } };
const lives = { hearts: CONFIG.lives.hearts, damage() { this.hearts -= 1; } };
const part1 = { id: 'part1', scene: world.scene, enter: () => { for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o); }, exit() {} };
const levels = new LevelManager({
  part1: async () => part1,
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape: { musicPhase: null }, hero, horse, abilities: null, lives, assets: heroAssets }),
});
levels.chapters.set('part1', part1);
levels.current = part1; levels.id = 'part1';
const frame = async () => { levels.current.update(dt, dt, { paused: false }); held.jumpPressed = false; await null; };
const run = async (s) => { for (let t = 0; t < s; t += dt) await frame(); };

const p2 = await levels.load('part2', { start: 'ride' });
const ride = p2.ride;
const track = p2.rideWorld.track;
const near = () => track.nearest(horse.position.x, horse.position.z, 20);
/** Put the horse at `s`, `lat` (and `y`), riding along the trail at `speed`. */
const place = (s, lat = 0, { speed = CONFIG.horse.maxSpeed, y = 0, vy = 0 } = {}) => {
  ride.stop();
  const p = trackPoint(track, s, lat, y);
  horse.position.copy(p.pos);
  horse.heading = p.heading;
  horse.speed = speed;
  horse.velocity.set(0, vy, 0);
  horse.grounded = y <= 0.01;
  horse.stumble = horse.stumbleStop = 0;
  horse.steer = horse.yawRate = 0;
  horse.galloping = false;
  horse.mode = 'riding';
  horse.scripted = false;
  cam.snapTo?.(hero.position);
};

// 1) Layout, the riders on the horse in the ride's world, a draw budget.
{
  const parts = p2.rideParts;
  check(p2.at === 'ride' && state.is(STATES.PLAY) && horse.mode === 'riding' && hero.riding && horse.world === p2.rideWorld && hero.world === p2.rideWorld && cam.world === p2.rideWorld && parts.root.visible && !p2.gearhaven.visible,
    `the ride starts: AJ on the horse in the brass city (its own world: the street, walls, rails), the courtyard hidden`);
  check(track.length >= 700 && R.rails.length >= 6 && new Set(R.rails.filter((r) => !r.upper).map((r) => r.group)).size >= 2 && R.rails.some((r) => r.upper) && parts.vents.length >= 3 && parts.hammers.length >= 2 && parts.cogs.length >= 2 && parts.conveyors.length >= 2 && ride.total >= 30 && parts.flags.length === R.checkpoints.length - 1,
    `layout: a ${track.length.toFixed(0)}-long trail; ${R.rails.length} rails (groups of 3 and 2, an upper rail), ${parts.vents.length} steam vents, a gear deck, ${parts.hammers.length} hammers, ${parts.cogs.length} cog platforms, ${parts.conveyors.length} conveyors, ${ride.total} gears, ${R.checkpoints.length} checkpoints, the Fire door`);
  await frame();
  check(input.mounted && input.gallopShown && ui.quest === D2.ride.quest && ui.dist > 700 && ui.gears?.show && ui.gears.total === ride.total,
    `the HUD: the riding buttons (Jump, Gallop), "${ui.quest}" (${ui.dist} to go), the gear counter ${ui.gears?.n} / ${ui.gears?.total}`);
  let meshes = 0, tris = 0;
  parts.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
  check(meshes < 110 && tris < 165000, `draw budget: ${meshes} meshes, ${(tris / 1000).toFixed(0)}k triangles in the ride (static kit pieces merged, gears / saws / slats instanced)`);
  // The kits: every part built from its kit models (not the placeholders).
  const decorShapes = parts.city.userData.decor.sets.map((st) => st.mesh.name);
  const railMeshes = parts.rails.userData.rails;
  if (heroAssets.placeholder) console.log('     (HERO_PLACEHOLDER: the kit models are skipped — the placeholders are checked in 8)');
  else check(parts.rails.userData.kit && railMeshes.length === new Set(R.rails.map((r) => r.group)).size && parts.factory.userData.kit && parts.factory.userData.ventStacks.length === R.vents.length
    && parts.conveyors.every((c) => c.model.userData.kit) && parts.decks.every((d) => d.model.userData.kit) && parts.pickups.userData.kit
    && parts.skyline.userData.kit && parts.skyline.userData.chimneys.length >= 4 && parts.tower.userData.height > 50 && parts.saws.length === R.saws.length
    && decorShapes.some((n) => n.includes('cog')) && decorShapes.some((n) => n.includes('gear01')) && decorShapes.some((n) => n.includes('cluster')),
    `the kits: Coaster Kit rails (${R.rails.length} in ${railMeshes.length} meshes, Monorail brass / Steel copper on bronze supports), Factory Kit pipes by each vent / conveyors / the deck's catwalk / ${R.factory.decor.length} kinds of decoration, the collectible gear, gears turning (${decorShapes.join(', ')}), ${parts.saws.length} saws, the brass skyline (${parts.skyline.userData.chimneys.length} chimneys), the clock tower (${parts.tower.userData.height.toFixed(0)} tall)`);
  // The rails' styles: Monorail (brass) and Steel (copper) only — never Wood or Flume.
  if (!heroAssets.placeholder) {
    const st = parts.rails.userData.styles;
    const KR = R.railKit;
    const names = Object.values(KR.styles).flatMap((x) => [x.straight, ...x.slope]);
    check(st.monorail && st.steel && st.monorail.children[0].material.userData.tint === 'railBrass' && st.steel.children[0].material.userData.tint === 'railCopper'
      && Object.values(KR.groups).every((g) => g === 'monorail' || g === 'steel') && names.every((n) => /coaster-(monorail|steel)-/.test(n)),
      `the rails: the Coaster Kit's Monorail (brass: groups ${Object.keys(KR.groups).filter((g) => KR.groups[g] === 'monorail').join(', ')}) and Steel (copper: ${Object.keys(KR.groups).filter((g) => KR.groups[g] === 'steel').join(', ')}) tracks — no Wood or Flume`);
  }
  // Each rail's kit track runs at the grinding height (the hooves on its top).
  const box = new THREE.Box3();
  for (const m of railMeshes) box.union(new THREE.Box3().setFromObject(m)); // (the highest track: the upper rail's)
  const up = R.rails.find((r) => r.upper);
  if (!heroAssets.placeholder) check(Math.abs(box.max.y - (up.h + R.railKit.lift)) < 0.05, `the upper rail's track top at ${box.max.y.toFixed(2)} (the grind line ${up.h} + ${R.railKit.lift})`);
}

// 2) The side walls hold, galloping hard into them.
{
  let worst = 0;
  for (const side of [-1, 1]) {
    place(20, 0, { speed: 30 });
    held = { moveX: side, moveY: 1, jumpPressed: false, gallop: true };
    for (let i = 0; i < 150; i++) { await frame(); worst = Math.max(worst, Math.abs(near()?.lateral ?? 99)); }
  }
  held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
  check(worst <= R.wall.offset, `the side walls hold: galloping hard into both sides, max off-centre ${worst.toFixed(2)} ≤ ${R.wall.offset}`);
}

// 3) Rails: ride up the middle ramp → grind; hop across; jump off; ride one to its end; drop onto one.
{
  const a = R.rails.filter((r) => r.group === 'a').sort((x, y) => x.lat - y.lat);
  place(a[1].s[0] - 12, a[1].lat);
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  const land0 = sound.counts.rail_land ?? 0;
  let t = 0;
  for (; t < 3 && !ride.grinding; t += dt) await frame();
  const onMiddle = ride.grinding && ride.grind.rail === a[1];
  await run(0.3);
  const speed = horse.speed;
  const y = horse.position.y;
  const sparks = ride.sparkCount;
  check(onMiddle && speed >= R.grind.speed - 0.01 && Math.abs(y - a[1].h) < 0.05 && sparks > 5 && (sound.counts.rail_land ?? 0) > land0 && horse.scripted,
    `riding up the middle rail's ramp: it grinds along at ${speed.toFixed(1)} (faster than the street's ${CONFIG.horse.maxSpeed}), ${y.toFixed(2)} up on the rail, ${sparks} sparks, a clank`);
  held.moveX = 1; await frame(); held.moveX = 0;
  await run(R.grind.switchTime + 0.1);
  const switched = ride.grinding && ride.grind.rail === a[2] && Math.abs(near().lateral - a[2].lat) < 0.05;
  held.moveX = -1; await frame(); held.moveX = 0;
  await run(R.grind.switchTime + 0.1);
  const back = ride.grinding && ride.grind.rail === a[1];
  check(switched && back && ride.stats.switches >= 2, `steering hops across to the next rail (right, then back left)`);
  held.jumpPressed = true; await frame();
  const off = !ride.grinding && !horse.scripted && horse.velocity.y > 0;
  let landed = false, recaught = false;
  for (let i = 0; i < 120 && !landed; i++) { await frame(); if (ride.grinding) recaught = true; landed = horse.grounded && horse.position.y < 0.05; }
  check(off && landed && !recaught, `Jump leaves the rail with a hop and the horse lands on the street (not back on the rail)`);
  // Low rails are fences on the street: riding in a lane, it stays there.
  place(a[0].s[0] + R.grind.ramp + 4, (a[0].lat + a[1].lat) / 2);
  held = { moveX: -1, moveY: 1, jumpPressed: false, gallop: false };
  let crossed = false;
  for (let i = 0; i < 90; i++) { await frame(); const n = near(); if (!ride.grinding && n && n.s < a[0].s[1] && n.lateral < a[0].lat - 0.2) crossed = true; }
  check(!crossed, 'the low rails are fences on the street: steering hard into one, the horse stays in its lane');
  // To the rail's end: it hops down by itself.
  place(a[2].s[1] - 30, a[2].lat, { y: a[2].h + 0.6, vy: -1 });
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  await frame();
  const dropped = ride.grinding && ride.grind.rail === a[2];
  let ended = false, down = false;
  for (let i = 0; i < 240 && !down; i++) { await frame(); if (!ride.grinding && ride.stats.ends > 0) ended = true; down = ended && horse.grounded && horse.position.y < 0.05; }
  check(dropped && ended && down, 'coming down onto a rail from above, it grinds; at the rail\'s end the horse hops down onto the street');
}

// 4) Steam vents: up onto the gear deck; up onto the upper rail; missing it, the street.
{
  const v0 = R.vents[0], deck = R.decks[0];
  place(v0.s - 14, v0.lat);
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  const launches = ride.stats.launches, whoosh = sound.counts.steam_launch ?? 0;
  let onDeck = 0, peak = 0;
  for (let i = 0; i < 240; i++) {
    await frame();
    peak = Math.max(peak, horse.position.y);
    if (horse.grounded && Math.abs(horse.position.y - deck.top) < 0.05) onDeck++;
  }
  check(ride.stats.launches > launches && (sound.counts.steam_launch ?? 0) > whoosh && peak > deck.top && onDeck > 10,
    `a steam vent launches the horse (${peak.toFixed(1)} high, a whoosh) up onto the gear deck (${(onDeck * dt).toFixed(1)} s on it, ${deck.top} up)`);
  // Riding along under it on the street, the deck fades out of the camera's way (and back after).
  const pd = p2.rideParts.decks[0];
  place((deck.s[0] + deck.s[1]) / 2 - 8, deck.lat, { speed: 6 });
  held = { moveX: 0, moveY: 0.4, jumpPressed: false, gallop: false };
  let faded = 1;
  for (let i = 0; i < 90; i++) { await frame(); faded = Math.min(faded, pd.opacity); }
  place(deck.s[1] + 40, 0, { speed: 0 });
  await run(1);
  check(faded < 0.4 && pd.opacity > 0.95, `riding under the gear deck it fades out of the camera's way (${faded.toFixed(2)}) and comes back after`);
  const u = R.rails.find((r) => r.upper);
  const v1 = R.vents.find((v) => v.s < u.s[0] && v.s > u.s[0] - 20);
  place(v1.s - 12, v1.lat);
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  let onUpper = false;
  for (let i = 0; i < 240 && !onUpper; i++) { await frame(); onUpper = ride.grinding && ride.grind.rail === u; }
  const grindY = horse.position.y;
  check(onUpper && Math.abs(grindY - u.h) < 0.05, `the vent before the upper rail launches the horse onto it: it grinds ${grindY.toFixed(1)} up`);
  // Missing it (launched off to the side): down on the street, no harm — and the street is slower.
  const h0 = lives.hearts;
  place(v1.s - 3, v1.lat, { y: 0 });
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  await frame(); await frame();
  // (the launch has happened: shove it sideways out from under the rail while it's in the air)
  for (let i = 0; i < 12; i++) { const n = near(); horse.position.x += -n.tz * 0.25; horse.position.z += n.tx * 0.25; await frame(); }
  let landedStreet = false, caught = false;
  for (let i = 0; i < 200 && !landedStreet; i++) { await frame(); if (ride.grinding) caught = true; landedStreet = horse.grounded && horse.position.y < 0.05; }
  await run(1);
  check(!caught && landedStreet && lives.hearts === h0 && horse.speed <= CONFIG.horse.maxSpeed + 0.01 && R.grind.speed > CONFIG.horse.maxSpeed,
    `missing the rail: the horse lands on the street below — no hearts lost, just slower (${horse.speed.toFixed(1)} vs the rail's ${R.grind.speed})`);
}

// 5) Hazards: a hammer staggers and knocks the horse aside; a conveyor pushes it; a cog carries it.
{
  const h = p2.rideParts.hammers[0];
  const h0 = lives.hearts, stumbles = horse.stumbles, hits = ride.stats.hits, clang = sound.counts.hammer_hit ?? 0;
  // Stand where its head swings through, still, until it comes.
  place(h.s, 0, { speed: 0 });
  held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
  const lat0 = near().lateral;
  let hit = false, knocked = 0;
  for (let i = 0; i < 60 * R.hammer.period && !hit; i++) { await frame(); hit = ride.stats.hits > hits; }
  await run(0.4);
  knocked = Math.abs(near().lateral - lat0);
  check(hit && horse.stumbles > stumbles && (sound.counts.hammer_hit ?? 0) > clang && knocked > 0.5 && lives.hearts === h0,
    `a swinging hammer hits: the horse staggers (slower) and is knocked ${knocked.toFixed(1)} aside, a clang — no hearts lost`);
  const c = R.conveyors[0];
  place((c.s[0] + c.s[1]) / 2, 0, { speed: 0 });
  const before = near().lateral;
  await run(0.5);
  const moved = (near().lateral - before) * c.dir;
  check(moved > R.conveyor.speed * 0.5 * 0.85 && moved < R.conveyor.speed * 0.5 * 1.15 && ride.stats.conveyed > 0, `a conveyor belt pushes the standing horse sideways at its speed (${moved.toFixed(1)} in 0.5 s ≈ ${R.conveyor.speed} × 0.5)`);
  const g = p2.rideParts.cogs[0];
  place(g.s, g.lat + 2, { speed: 0 });
  const p0 = horse.position.clone(), yaw0 = horse.heading;
  await run(1);
  const turned = Math.abs(Math.atan2(Math.sin(horse.heading - yaw0), Math.cos(horse.heading - yaw0)));
  check(horse.position.distanceTo(p0) > 1 && turned > R.cogPlatform.speed * 0.8 && ride.stats.carried > 0.9,
    `a turning cog platform carries the horse round (${horse.position.distanceTo(p0).toFixed(1)} moved, turned ${turned.toFixed(2)} rad)`);
  // A spinning saw: standing in its lane, the blade comes and staggers the horse (no hearts), knocked clear.
  const sw = p2.rideParts.saws[0];
  {
    const h1 = lives.hearts, st = horse.stumbles, sh = ride.stats.sawHits, snd = sound.counts.saw_hit ?? 0;
    place(sw.s, 0, { speed: 0 });
    let hit = false;
    for (let i = 0; i < 60 * R.saw.period && !hit; i++) { await frame(); hit = ride.stats.sawHits > sh; }
    const lat0 = near().lateral;
    await run(0.35);
    const thrown = Math.abs(near().lateral - lat0);
    check(hit && horse.stumbles > st && (sound.counts.saw_hit ?? 0) > snd && thrown > 0.4 && lives.hearts === h1,
      `a spinning saw catches the standing horse: it staggers, a screech, thrown ${thrown.toFixed(1)} clear — no hearts lost`);
  }
  {
    // Jumping over it as the blade passes under: no hit.
    await run(R.hitCooldown + 0.1);
    const sh = ride.stats.sawHits;
    place(sw.s - 3, 0, { speed: 9, y: 2.6, vy: 6 });
    held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
    let maxY = 0;
    for (let i = 0; i < 30; i++) { await frame(); maxY = Math.max(maxY, horse.position.y); }
    held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
    check(ride.stats.sawHits === sh && maxY > R.saw.radius * (2 - R.saw.sink), `a jump clears the saw (up to ${maxY.toFixed(1)} over a ${(R.saw.radius * (2 - R.saw.sink)).toFixed(1)}-high blade): no hit`);
  }
}

// 6) A bot rides the whole level from the start: checkpoints, gears, no hearts lost, the Fire door.
{
  await levels.load('part2', { start: 'ride' });
  check(ride.count === 0 && ride.gears.every((g) => !g.taken) && p2.rideParts.flags.every((f) => f.userData.flag.material.color.getHex() === CONFIG.checkpoints.flagColor), 'a fresh ride: gears back, flags down');
  const h0 = lives.hearts, pick0 = sound.counts.gear_pickup ?? 0;
  const reached = new Set();
  let t = 0, stuck = 0, maxLat = 0, sparkleMax = 0;
  const reachedGrinds = ride.stats.grinds;
  // The bot: forward (galloping on the straights), steering by heading toward its line — onto
  // the first vent (→ the deck), the middle rail, the vent under the upper rail, the last vent,
  // a rail of the last pair; on a rail it leaves the stick alone.
  const line = (s) => (s > 30 && s < 58 ? R.vents[0].lat : s > 560 && s < 584 ? R.vents[2].lat : s > 610 && s < 650 ? R.rails.find((r) => r.group === 'b' && r.lat > 0).lat : 0);
  for (; t < 150 && p2.at === 'ride'; t += dt) {
    const n = near();
    let steer = 0;
    if (n && !ride.grinding) {
      const want = track.headingAt(n.s + 3) - THREE.MathUtils.clamp(Math.atan((line(n.s) - n.lateral) * 0.3), -0.4, 0.4);
      steer = THREE.MathUtils.clamp(Math.atan2(Math.sin(horse.heading - want), Math.cos(horse.heading - want)) * 3, -1, 1);
    }
    held = { moveX: steer, moveY: 1, jumpPressed: false, gallop: n ? track.maxCurvature(n.s, n.s + 30) < 0.004 : false };
    await frame();
    if (horse.lastCheckpoint > 0) reached.add(horse.lastCheckpoint);
    if (n) maxLat = Math.max(maxLat, Math.abs(n.lateral));
    sparkleMax = Math.max(sparkleMax, ride.sparkleCount);
    if (horse.speed < 1 && !ride.grinding && p2.at === 'ride') stuck += dt; else stuck = 0;
    if (stuck > 3) break;
  }
  check(p2.at === R.quest && t < 120 && stuck <= 3, `a bot rides the whole level in ${t.toFixed(1)} s and reaches the Fire Element's door (never stuck)`);
  check(reached.size === R.checkpoints.length - 1 && p2.rideParts.flags.every((f) => f.userData.flag.material.color.getHex() === CONFIG.checkpoints.reachedColor) && ui.toasts.filter((x) => x === DIALOGUE.checkpoint).length >= R.checkpoints.length - 1,
    `every checkpoint reached (${reached.size}), its flag green, a toast`);
  check(ride.count > 5 && sparkleMax >= R.gears.sparkle.count && (sound.counts.gear_pickup ?? 0) - pick0 === ride.count && ride.stats.grinds > reachedGrinds && lives.hearts === h0 && maxLat <= R.wall.offset,
    `on the way: ${ride.count} gears collected (a chime each, ${sparkleMax} sparkles at most), ${ride.stats.grinds - reachedGrinds} grinds, ${ride.stats.launches} launches, ${ride.stats.hits} hits (hammers ${ride.stats.hits - ride.stats.sawHits}, saws ${ride.stats.sawHits}) — hearts never lost, always inside the walls`);
  check(p2.at === 'fire' && ui.toasts.includes(D2.comingSoon(D2.levelNames.fire)) && !p2.rideParts.root.visible && p2.gearhaven.visible && horse.world === p2.world && hero.world === p2.world && !hero.riding && !ui.gears.show,
    `the Fire Element's door → its stub ("${D2.comingSoon(D2.levelNames.fire)}"): the ride put away, AJ on foot, the courtyard's world back`);
}

// 7) The courtyard's Fire door opens onto the ride; the ?debug menu has "Gearhaven ride".
{
  await levels.load('part2', { start: 'courtyard' });
  const d = p2.gearhaven.userData.doors.fire;
  hero.position.copy(d.at).setY(0);
  hero.position.z += 0.01;
  await frame();
  check(p2.at === 'ride' && horse.mode === 'riding', 'walking into the courtyard\'s Fire door starts the Gearhaven ride');
  check(DIALOGUE.testMenu.ride === 'Gearhaven ride', '?debug menu: "Gearhaven ride"');
  await levels.load('part1');
  check(horse.world === world && hero.world === world && cam.world === world && !p2.rideParts.root.visible, 'back in Part 1: the hero, horse and camera handed back');
}

// 8) If the kit files fail, the ride is built from the placeholders (and still plays the same).
{
  const { forgetKits } = await import('../src/kits.js');
  forgetKits();
  const warn = console.warn;
  console.warn = () => {};
  const parts = await loadRide(new THREE.Scene(), new RideWorld(), { readFile: async () => { throw new Error('missing'); } });
  console.warn = warn;
  check(!parts.rails.userData.kit && parts.rails.userData.rails.length === R.rails.length && !parts.factory.userData.kit && parts.conveyors.every((c) => !c.model.userData.kit) && parts.decks.every((d) => !d.model.userData.kit) && !parts.pickups.userData.kit && !parts.skyline.userData.kit && parts.saws.length === R.saws.length,
    'the kit files failing: the placeholder rails (tubes), conveyors, deck, gears and skyline blocks instead — nothing missing');
  forgetKits();
}

console.log(failed ? 'RIDE TEST FAILED' : 'ride test passed');
process.exit(failed ? 1 : 0);
