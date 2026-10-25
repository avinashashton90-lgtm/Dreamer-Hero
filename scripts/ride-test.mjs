// Headless test: the Gearhaven ride (src/part2/ride.js, rideModel.js; CONFIG.part2.ride) — the
// first playable section of Part 2, behind the courtyard's Fire door. Its layout (a trail ≥ 700
// long with side walls, rails, vents, the deck, hammers, cog platforms, conveyors, gears,
// checkpoints, the Fire Element's door) and draw budget; the belt deck after the first vent (landing
// on it riding, galloping and galloping with a jump into the steam, and staying on ≥ 2 s; the belt
// carrying the horse sideways against its railing; the landing snap; the coyote time); the walls hold at a gallop; rails
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
import { Lives } from '../src/lives.js';
import { gearTiers } from '../src/part2/gearRewards.js';

const P2 = CONFIG.part2, R = P2.ride, D2 = DIALOGUE.part2;
const dt = 1 / 60;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

const world = new World(); await world.init();
const hero = new Hero(world.scene, world, heroAssets); await hero.init();
const sound = new Sound();
// (what each sound was asked to play with: the gear streak's pitch, positions)
const played = [];
const play0 = sound.play.bind(sound);
sound.play = (name, detail = {}) => { played.push({ name, ...detail }); return play0(name, detail); };
const horse = new Horse(world.scene, world, heroAssets); horse.sound = sound; await horse.init();
const cam = new FollowCamera(20 / 9, world);
const state = new GameState(STATES.PLAY);
const view = { lines: [], complete: false, show() {}, hide() {}, dialogue(s, t, c) { this.complete = c; }, clearDialogue() { this.complete = false; } };
const cinematic = new Cinematic(cam, view);
cinematic.bodies = characterBodies({ hero, girlModel: new THREE.Group(), horse });
const ui = { quest: null, dist: null, toasts: [], gears: null, banners: [], banner(t) { this.banners.push(t); },
  toast(t) { this.toasts.push(t); }, setQuest(t, d) { this.quest = t; this.dist = d; }, fadeOut(ms, then) { then(); }, fadeIn() {},
  showGems() {}, setHorseEnergy() {}, setBossBar() {}, setGears(n, total, show, pulse, tiers = []) { this.gears = { n, total, show, tiers }; } };
let held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
const input = { enabled: true, setEnabled(on) { this.enabled = on; }, read: () => ({ ...held, lookDX: 0, lookDY: 0, lookSensitivity: 0 }),
  setCombatButtons(m) { this.mounted = m; }, setMountButton() {}, setDismountButton() {}, setGallopButton(on) { this.gallopShown = on; } };
const lives = new Lives();
const soundscape = { musicPhase: null };
const part1 = { id: 'part1', scene: world.scene, enter: () => { for (const o of [hero.model, hero.shadow, horse.model, horse.shadow]) world.scene.add(o); }, exit() {} };
const levels = new LevelManager({
  part1: async () => part1,
  part2: async () => (await import('../src/part2/index.js')).createPart2({ state, STATES, ui, input, cam, cinematic, sound, soundscape, hero, horse, abilities: null, lives, assets: heroAssets }),
});
levels.chapters.set('part1', part1);
levels.current = part1; levels.id = 'part1';
const frame = async () => { levels.current.update(dt, dt, { paused: false }); held.jumpPressed = false; await null; };
const run = async (s) => { for (let t = 0; t < s; t += dt) await frame(); };

const p2 = await levels.load('part2', { start: 'ride' });
const ride = p2.ride;
const track = p2.rideWorld.track;
const near = () => track.nearest(horse.position.x, horse.position.z, 20);
/** The stick a player would push to ride along the line `lat` off the centre (the bot's steering; none while grinding). */
const steerTo = (lat) => {
  const n = near();
  if (!n || ride.grinding) return 0;
  const want = track.headingAt(n.s + 3) - THREE.MathUtils.clamp(Math.atan((lat - n.lateral) * 0.3), -0.4, 0.4);
  return THREE.MathUtils.clamp(Math.atan2(Math.sin(horse.heading - want), Math.cos(horse.heading - want)) * 3, -1, 1);
};
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
    `layout: a ${track.length.toFixed(0)}-long trail; ${R.rails.length} rails (groups of 3 and 2, an upper rail), ${parts.vents.length} steam vents, the belt deck, ${parts.hammers.length} hammers, ${parts.cogs.length} cog platforms, ${parts.conveyors.length} conveyors, ${ride.total} gears, ${R.checkpoints.length} checkpoints, the Fire door`);
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
  // The grind's steel scrape: louder and higher the faster it grinds (the loop's volume and pitch).
  {
    const calls = [];
    sound.manager = { setLoop: (key, name, o) => name === 'rail_grind' && calls.push(o), playSound() {} };
    ride.grind.speed = R.grind.speed;
    await frame();
    const slow = calls.at(-1);
    ride.grind.speed = R.grind.maxSpeed;
    await frame();
    const fast = calls.at(-1);
    sound.manager = null;
    ride.grind.speed = R.grind.speed;
    check(slow && fast && fast.volume > slow.volume && fast.pitch > slow.pitch && slow.position,
      `the grind's scrape rises with speed: volume ${slow?.volume.toFixed(2)} → ${fast?.volume.toFixed(2)}, pitch ${slow?.pitch.toFixed(2)} → ${fast?.pitch.toFixed(2)} (from the horse)`);
  }
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

// 4) Steam vents: up onto the belt deck (at a ride, galloping, galloping with a jump into the
//    steam — it lands on it and stays on, the belt carrying it sideways; the landing snap and the
//    coyote time at its edges); up onto the upper rail; missing it, the street.
{
  const v0 = R.vents[0], deck = R.decks[0], DA = R.deckAssist;
  const rw = p2.rideWorld;
  const onBelt = () => horse.grounded && Math.abs(horse.position.y - deck.top) < 0.05 && rw.deckAt(horse.position.x, horse.position.z, DA.snap) === deck;
  // Ride at the first vent (galloping or not, jumping `jumpAt` before it or not) and on (the stick
  // forward; a gallop let go once it lands): where it lands, how long it stays on the belt.
  const beltRun = async ({ gallop = false, jumpAt = null } = {}) => {
    place(v0.s - 40, v0.lat, { speed: gallop ? 34 : CONFIG.horse.maxSpeed });
    held = { moveX: 0, moveY: 1, jumpPressed: false, gallop };
    const launches = ride.stats.launches, whoosh = sound.counts.steam_launch ?? 0, belted = ride.stats.belted;
    let peak = 0, land = null, on = 0, jumped = false, maxLat = 0, top = 0;
    for (let i = 0; i < 60 * 10; i++) {
      const n = near();
      if (jumpAt != null && !jumped && n.s >= v0.s - jumpAt) { held.jumpPressed = true; jumped = true; }
      held.moveX = land ? 0 : steerTo(v0.lat); // (lined up on the vent; on the belt the stick only forward)
      await frame();
      peak = Math.max(peak, horse.position.y);
      top = Math.max(top, horse.speed);
      maxLat = Math.max(maxLat, Math.abs(near().lateral));
      if (onBelt()) {
        if (!land) { land = { s: near().s, lat: near().lateral, speed: horse.speed }; held.gallop = false; }
        on += dt;
      } else if (land) break;
    }
    return { launched: ride.stats.launches > launches, whoosh: (sound.counts.steam_launch ?? 0) > whoosh, peak, land, on, belted: ride.stats.belted - belted, maxLat, jumped, top };
  };
  const mid = (deck.s[0] + deck.s[1]) / 2;
  for (const [name, o] of [['riding', {}], ['galloping', { gallop: true }], ['galloping with a jump into the steam', { gallop: true, jumpAt: 4 }]]) {
    const r = await beltRun(o);
    const room = r.land ? Math.min(r.land.s - deck.s[0], deck.s[1] - r.land.s) : 0;
    check(r.launched && r.whoosh && r.land && room > (o.gallop ? 15 : 5) && r.on >= 2 && r.belted > 1 && r.maxLat <= R.wall.offset && (!o.jumpAt || r.jumped),
      `${name} (${r.top.toFixed(0)}) onto the first vent: launched ${r.peak.toFixed(1)} high (a whoosh) onto the belt deck ${deck.top} up — landing at s ${r.land?.s.toFixed(0)} (${room.toFixed(0)} in from its nearer end; its middle is ${mid}), on it ${r.on.toFixed(1)} s (≥ 2), carried sideways ${r.belted.toFixed(1)} s, inside the walls`);
  }
  // The belt: a standing horse is carried sideways at the belt's speed, up against the wall and
  // its railing — and stays on (the top is solid at its height).
  {
    place(mid, 0, { speed: 0, y: deck.top });
    held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
    await frame();
    const lat0 = near().lateral;
    await run(1);
    const moved = (near().lateral - lat0) * deck.belt;
    await run(3);
    const stayed = onBelt() && Math.abs(near().lateral) <= R.wall.offset && Math.abs(near().lateral) > deck.width / 2 - 1.5;
    check(moved > R.conveyor.speed * 0.85 && moved < R.conveyor.speed * 1.15 && stayed,
      `on the belt a standing horse is carried sideways at its speed (${moved.toFixed(1)} in 1 s ≈ ${R.conveyor.speed}), then held against the wall by its railing — still on it after 4 s (${near().lateral.toFixed(1)} off-centre, ${horse.position.y.toFixed(2)} up)`);
  }
  // The landing snap: coming down within `snap` of its start edge, it lands on it (pulled in);
  // further out it drops past.
  {
    const snaps = ride.stats.snaps;
    place(deck.s[0] - DA.snap + 0.4, 0, { speed: 2, y: deck.top + 0.5, vy: -2 });
    held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
    let landed = false;
    for (let i = 0; i < 60 && !landed; i++) { await frame(); landed = onBelt(); }
    const inside = near().s >= deck.s[0];
    place(deck.s[0] - DA.snap - 1.2, 0, { speed: 0, y: deck.top + 0.5, vy: -2 });
    let streetY = 9;
    for (let i = 0; i < 90; i++) { await frame(); streetY = horse.position.y; }
    check(landed && inside && ride.stats.snaps > snaps && streetY < 0.05,
      `the landing assist: coming down ${(DA.snap - 0.4).toFixed(1)} short of the belt deck it snaps onto it (pulled inside), ${(DA.snap + 1.2).toFixed(1)} short it drops past to the street`);
  }
  // The coyote time: riding off its end, the horse holds at its height a moment, then drops.
  {
    place(deck.s[1] - 6, 0, { speed: CONFIG.horse.maxSpeed, y: deck.top });
    held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
    let leftAt = null, dropAt = null, t = 0;
    for (let i = 0; i < 120 && dropAt == null; i++) {
      await frame();
      t += dt;
      const n = near();
      if (leftAt == null && n.s > deck.s[1] + DA.snap) leftAt = t;
      if (horse.position.y < deck.top - 0.05) dropAt = t;
    }
    const held_ = leftAt != null && dropAt != null ? dropAt - leftAt : 0;
    check(held_ >= DA.coyote - 2 * dt && held_ <= DA.coyote + 4 * dt,
      `the coyote time: riding off the belt deck's end (past its ${DA.snap} margin) the horse holds at its height ${held_.toFixed(2)} s (≈ ${DA.coyote}) before dropping`);
  }
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
  for (const [name, gallop, jumpAt] of [['galloping', true, null], ['galloping with a jump into the steam', true, 4], ['riding with a jump into the steam', false, 4]]) {
    place(v1.s - 30, v1.lat, { speed: gallop ? 34 : CONFIG.horse.maxSpeed });
    held = { moveX: 0, moveY: 1, jumpPressed: false, gallop };
    let caught = false, jumped = false;
    for (let i = 0; i < 300 && !caught; i++) {
      if (jumpAt != null && !jumped && near().s >= v1.s - jumpAt) { held.jumpPressed = true; jumped = true; }
      held.moveX = steerTo(v1.lat);
      await frame();
      caught = ride.grinding && ride.grind.rail === u;
    }
    check(caught, `${name} into the vent before the upper rail: it lands on the rail and grinds`);
    ride.stop();
  }
  // Soft alignment: a roughly aligned approach (2.4 off the vent's line, inside its widened catch zone) is eased onto the rail in the air
  {
    ride.stop();
    ride.stats.aligned = 0;
    place(v1.s - 12, v1.lat + 2.4);
    held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
    let caught = false;
    for (let i = 0; i < 300 && !caught; i++) { await frame(); caught = ride.grinding && ride.grind.rail === u; }
    check(caught && R.vent.radius >= 2.5 && R.grind.capture >= 2 && (ride.stats.aligned ?? 0) > 0, `steam push-ups: 2.4 off the vent's line (catch zone ${R.vent.radius}, rail capture ${R.grind.capture}) it still lands on the rail — eased across in the air for ${(ride.stats.aligned ?? 0).toFixed(2)} s`);
    ride.stop();
  }
  // Missing it (launched off to the side): down on the street, no harm — and the street is slower.
  const h0 = lives.hearts;
  place(v1.s - 3, v1.lat, { y: 0 });
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  await frame(); await frame();
  // (the launch has happened: shove it sideways out from under the rail while it's in the air)
  for (let i = 0; i < 16; i++) { const n = near(); horse.position.x += -n.tz * 0.4; horse.position.z += n.tx * 0.4; await frame(); } // (well past the soft alignment's reach)
  let landedStreet = false, caught = false;
  for (let i = 0; i < 200 && !landedStreet; i++) { await frame(); if (ride.grinding) caught = true; landedStreet = horse.grounded && horse.position.y < 0.05; }
  await run(1);
  check(!caught && landedStreet && lives.hearts >= h0 && horse.speed <= CONFIG.horse.maxSpeed + 0.01 && R.grind.speed > CONFIG.horse.maxSpeed,
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
  check(hit && horse.stumbles > stumbles && (sound.counts.hammer_hit ?? 0) > clang && knocked > 0.5 && lives.hearts >= h0,
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
    check(hit && horse.stumbles > st && (sound.counts.saw_hit ?? 0) > snd && thrown > 0.4 && lives.hearts >= h1,
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
  const h0 = lives.hearts, pick0 = sound.counts.gear_collect ?? 0;
  const reached = new Set();
  let t = 0, stuck = 0, maxLat = 0, sparkleMax = 0;
  const loopsSeen = new Set(), phases = new Set(), p0 = played.length;
  let grindChase = 0, grindFrames = 0, ambRide = 0;
  const reachedGrinds = ride.stats.grinds;
  // The bot: forward (galloping on the straights), steering by heading toward its line — onto
  // the first vent (→ the deck), the middle rail, the vent under the upper rail, the last vent,
  // a rail of the last pair; on a rail it leaves the stick alone.
  const line = (s) => (s > 30 && s < 58 ? R.vents[0].lat : s > 560 && s < 584 ? R.vents[2].lat : s > 610 && s < 650 ? R.rails.find((r) => r.group === 'b' && r.lat > 0).lat : 0);
  for (; t < 150 && p2.at === 'ride' && !ride.finished; t += dt) {
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
    for (const n of [...ride.loopsNow, ...p2.sounds.loopsNow]) loopsSeen.add(n);
    phases.add(soundscape.musicPhase);
    if (ride.grinding) { grindFrames++; if (soundscape.musicPhase === 'gearhavenChase') grindChase++; }
    if (p2.sounds.loopsNow.has('factory_hum')) ambRide++;
    if (horse.speed < 1 && !ride.grinding && p2.at === 'ride') stuck += dt; else stuck = 0;
    if (stuck > 3) break;
  }
  check(ride.finished && t < 120 && stuck <= 3, `a bot rides the whole level in ${t.toFixed(1)} s and reaches the Fire Element's door (never stuck)`);
  check(reached.size === R.checkpoints.length - 1 && p2.rideParts.flags.every((f) => f.userData.flag.material.color.getHex() === CONFIG.checkpoints.reachedColor) && ui.toasts.filter((x) => x === DIALOGUE.checkpoint).length >= R.checkpoints.length - 1,
    `every checkpoint reached (${reached.size}), its flag green, a toast`);
  check(ride.count > 5 && sparkleMax >= R.gears.sparkle.count && (sound.counts.gear_collect ?? 0) - pick0 === ride.count && ride.stats.grinds > reachedGrinds && lives.hearts >= h0 && maxLat <= R.wall.offset,
    `on the way: ${ride.count} gears collected (a chime each, ${sparkleMax} sparkles at most), ${ride.stats.grinds - reachedGrinds} grinds, ${ride.stats.launches} launches, ${ride.stats.hits} hits (hammers ${ride.stats.hits - ride.stats.sawHits}, saws ${ride.stats.sawHits}) — hearts never lost, always inside the walls`);
  {
    const names = played.slice(p0).map((x) => x.name);
    const has = (n) => names.includes(n);
    const gearPitches = played.slice(p0).filter((x) => x.name === 'gear_collect').map((x) => x.pitch);
    const rose = gearPitches.some((v, i) => i > 0 && v > gearPitches[i - 1]);
    const positioned = played.slice(p0).filter((x) => ['hammer_swing', 'hammer_hit', 'saw_hit', 'steam_vent', 'gear_collect'].includes(x.name)).every((x) => x.position);
    check(['rail_land', 'rail_leave', 'steam_vent', 'steam_launch', 'hammer_swing', 'gear_collect', 'gear_spin_pickup'].every(has) && rose && positioned,
      `the ride's sounds on the way: rails (land, leave), steam (vent + launch), hammers swinging past, gears (a ting each, rising on a streak: ${gearPitches.slice(0, 6).map((v) => v.toFixed(2)).join(' → ')}…, a spin-up), all from where they happen`);
    check(['rail_grind', 'saw_spin', 'conveyor_belt', 'factory_hum', 'gear_turn', 'clock_tick', 'tick_hover'].every((n) => loopsSeen.has(n)) && grindFrames > 0 && grindChase === grindFrames && phases.has('gearhaven') && phases.has('gearhavenChase') && ambRide > 100,
      `its loops: the rail grind, the nearest saw and conveyor, the ride's ambience (factory hum, gears, a soft tick-tock), Tick's hover; the music Gearhaven's theme, the faster one while grinding (${grindChase}/${grindFrames} frames)`);
  }
  // (the door leads on into the Fire Element's level — the furnace city, which builds itself the first time: real file reads)
  for (let i = 0; i < 400 && p2.at === 'ride'; i++) { await frame(); await new Promise((r) => setTimeout(r, 25)); }
  await frame();
  check(p2.at === 'fire' && p2.fire.stage === 'ride' && !p2.rides.ride.parts.root.visible && p2.fire.parts.root.visible && horse.mode === 'riding' && hero.world === p2.fire.world && ui.quest === D2.fire.quest,
    `the Fire door → the Fire Element's level ("${D2.fire.quest}"): the first ride put away, AJ on the horse in the furnace city (test:fire plays it)`);
}

// 7) Gear rewards: a third of the ride's gears → +1 max heart and a full heal; two thirds → the
//    horse's armour (its brass plates; 30% less damage, stumbles half as long); all → a bonus
//    charge for the Fire Element and a golden glow round Tick. Each a banner and a chime, tick
//    marks on the counter; kept between sections and applied in every Part 2 level; Part 1 untouched.
{
  await levels.load('part2', { start: 'ride' });
  p2.newGame();
  await frame();
  const GRW = P2.gearRewards;
  const plates = p2.upgrade.userData.plates;
  const glow = p2.tick.model.getObjectByName('tickGlow');
  const tiers = gearTiers(ride.total);
  check(P2.gearsInLevel.ride === ride.total && tiers.map((t) => t.count).join() === '14,28,42' && P2.gearRewardTiers.map((t) => t.reward).join() === 'heart,armour,charge',
    `the tiers scale with the level: ${P2.gearRewardTiers.map((t) => t.at.toFixed(2)).join(' / ')} of its ${P2.gearsInLevel.ride} gears = ${tiers.map((t) => t.count).join(' / ')}`);
  check(ui.gears.tiers.length === 3 && ui.gears.tiers.every((t) => !t.reached) && plates.every((p) => !p.visible) && !glow.visible && lives.maxHearts === CONFIG.lives.hearts && horse.stumbleScale === 1,
    'before any reward: the counter shows 3 tick marks (none lit), no plates on the horse, no glow round Tick, 5 hearts');
  const chime0 = sound.counts.gear_reward ?? 0, banners0 = ui.banners.length;
  lives.damage(2);
  ride.giveGears(13);
  await run(0.2);
  const noneYet = ui.banners.length === banners0 && lives.maxHearts === CONFIG.lives.hearts;
  ride.giveGears(1);
  await run(0.2);
  check(noneYet && ride.count === 14 && ui.banners.at(-1) === D2.gearReward.banner(D2.gearReward.heart) && ui.banners.at(-1) === 'Gear reward unlocked: +1 heart!' && (sound.counts.gear_reward ?? 0) === chime0 + 1
    && lives.maxHearts === CONFIG.lives.hearts + GRW.heart && lives.hearts === lives.maxHearts && ui.gears.tiers[0].reached && !ui.gears.tiers[1].reached,
    `13 gears: nothing yet; the 14th: "${ui.banners.at(-1)}" with a chime, ${lives.maxHearts} max hearts and a full heal (${lives.hearts}), the first tick mark lit`);
  ride.giveGears(14);
  await run(GRW.bannerMs / 1000 + 0.2);
  horse.stumbleFor(1);
  const stumble = horse.stumble;
  horse.stumble = 0;
  check(ui.banners.at(-1) === D2.gearReward.banner(D2.gearReward.armour) && plates.every((p) => p.visible) && Math.abs(stumble - GRW.armourStumble) < 1e-9 && Math.abs(horse.damageTaken(10) - 10 * GRW.armourDamage) < 1e-9 && (sound.counts.gear_reward ?? 0) === chime0 + 2,
    `28 gears: "${ui.banners.at(-1)}" — the brass plates on the horse, a 1 s stumble now ${stumble.toFixed(2)} s, 10 damage now ${horse.damageTaken(10).toFixed(1)}`);
  // The armoured horse: its plates clink at a trot; a stagger sounds.
  {
    place(30, 0, { speed: 14 });
    held = { moveX: 0, moveY: 0.8, jumpPressed: false, gallop: false };
    let clank = 0;
    for (let i = 0; i < 30; i++) { await frame(); if (p2.sounds.loopsNow.has('horse_clank')) clank++; }
    const st0 = sound.counts.horse_stumble ?? 0;
    horse.stumbleFor(0.5);
    await frame();
    held = { moveX: 0, moveY: 0, jumpPressed: false, gallop: false };
    check(clank > 20 && (sound.counts.horse_stumble ?? 0) > st0, `the armoured horse's brass plates clink while it trots (${clank}/30 frames); a stagger: horse_stumble`);
  }
  ride.giveGears(20);
  await run(GRW.bannerMs / 1000 + 0.2);
  check(ride.count === ride.total && ui.banners.at(-1) === D2.gearReward.banner(D2.gearReward.charge) && glow.visible && p2.rewards.bonusCharges(R.quest) === GRW.charges && ui.gears.tiers.every((t) => t.reached) && (sound.counts.gear_reward ?? 0) === chime0 + 3,
    `all ${ride.total}: "${ui.banners.at(-1)}" — ${p2.rewards.bonusCharges(R.quest)} bonus charge for the ${R.quest} level, a soft golden glow round Tick, every tick mark lit`);
  // Several at once: the banners queue (each shown in turn, each with its chime).
  p2.newGame();
  p2.enterRide();
  const b0 = ui.banners.length, c0 = sound.counts.gear_reward ?? 0;
  ride.giveGears(ride.total);
  await run(3 * GRW.bannerMs / 1000 + 0.5);
  check(ui.banners.length - b0 === 3 && (sound.counts.gear_reward ?? 0) - c0 === 3, 'every gear at once: the three banners one after another, a chime each');
  // Kept between sections, applied in every Part 2 level.
  p2.toCourtyard();
  await frame();
  const court = lives.maxHearts === CONFIG.lives.hearts + GRW.heart && plates.every((p) => p.visible) && glow.visible;
  await p2.enterLevel('lightning');
  await frame();
  const fire = lives.maxHearts === CONFIG.lives.hearts + GRW.heart && glow.visible && horse.stumbleScale === GRW.armourStumble;
  p2.enterRide();
  const b1 = ui.banners.length;
  ride.giveGears(ride.total);
  await run(1);
  const again = ui.banners.length === b1 && ride.count === ride.total;
  await levels.load('part1');
  const part1 = lives.maxHearts === CONFIG.lives.hearts && horse.stumbleScale === 1 && horse.damageScale === 1;
  await levels.load('part2', { start: 'courtyard' });
  const back = lives.maxHearts === CONFIG.lives.hearts + GRW.heart && plates.every((p) => p.visible) && glow.visible;
  check(court && fire && again && part1 && back,
    'the rewards are kept between sections — the courtyard, a stub, the ride again (no second banner) — and back in Part 1 the hearts and the horse are as they were; into Part 2 again, the rewards return');
  p2.newGame();
  check(lives.maxHearts === CONFIG.lives.hearts && plates.every((p) => !p.visible) && !glow.visible && p2.rewards.unlocked.size === 0, 'a new game: no rewards');
  check(DIALOGUE.testMenu.giveGears(CONFIG.testMenu.giveGears) === 'Give 14 gears' && CONFIG.testMenu.giveGears === tiers[0].count, '?debug menu: "Give 14 gears" (the first tier)');
}

// 8) The courtyard's Fire door opens onto the ride; the ?debug menu has "Gearhaven ride".
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

// 9) If the kit files fail, the ride is built from the placeholders (and still plays the same).
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

// The ride's steering feel and pickup assist (the horse's `steering` override, rideMagnet*): both only on the ride.
{
  await levels.load('part2', { start: 'ride' });
  await run(0.5);
  check(horse.steering === R.steering && R.steering.steerDeadzone === 0.15, 'on the ride the horse steers with the ride\'s own feel (dead zone 0.15, low gain, straightens back)');
  // a thumb drifting sideways while pushing up never steers: no wobble
  place(8, 0);
  let maxSteer = 0;
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: true };
  for (let i = 0; i < 120; i++) { held.moveX = 0.12 * Math.sin(i / 7) + 0.18 * (i % 40 < 20 ? 1 : -1); await frame(); maxSteer = Math.max(maxSteer, Math.abs(horse.steer)); }
  check(maxSteer < 0.01, `a gallop with the thumb wobbling sideways (up to 0.3) never steers (${maxSteer.toFixed(3)})`);
  // a real push steers, softly (gain), and letting go straightens it back to the track
  place(8, 0);
  held = { moveX: 1, moveY: 0.3, jumpPressed: false, gallop: false };
  let peak = 0;
  for (let i = 0; i < 40; i++) { await frame(); peak = Math.max(peak, horse.steer); }
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  let settled = Infinity;
  for (let i = 0; i < 90; i++) { await frame(); if (Math.abs(horse.steer) < 0.05) { settled = i * dt; break; } }
  check(peak > 0.3 && peak <= R.steering.turnGain + 0.01 && settled < 0.8, `a real push steers (peak ${peak.toFixed(2)} ≤ gain ${R.steering.turnGain}) and with the stick centred it straightens within ${settled.toFixed(2)} s`);
  // pickups: collected within rideMagnetRadius of the lane, and drawn toward it
  ride.reset();
  const lane = (g) => track.nearest(g.pos.x, g.pos.z, 20);
  const row = ride.gears.filter((g) => lane(g).s >= R.gears.rows[0][0] - 1 && lane(g).s <= R.gears.rows[0][1] + 1 && Math.abs(lane(g).lateral) < 0.5);
  const g1 = row[0], g2 = row[row.length - 1];
  const n1 = lane(g1);
  place(n1.s - 14, 2.6);
  held = { moveX: 0, moveY: 1, jumpPressed: false, gallop: false };
  const x0 = g1.pos.x, z0 = g1.pos.z;
  let drawn = 0;
  for (let i = 0; i < 160 && !g1.taken; i++) { await frame(); drawn = Math.max(drawn, Math.hypot(g1.pos.x - x0, g1.pos.z - z0)); }
  check(g1.taken && R.rideMagnetRadius === 3 && R.gears.reach < 3, `a gear 2.6 to the side of the rider's lane (beyond its old ${R.gears.reach} reach) is drawn toward it (${drawn.toFixed(1)}) and collected`);
  const n2 = lane(g2);
  place(n2.s - 14, 3.9);
  const x2 = g2.pos.x, z2 = g2.pos.z;
  for (let i = 0; i < 80; i++) await frame();
  check(!g2.taken && Math.hypot(g2.pos.x - x2, g2.pos.z - z2) < 0.01, 'one 3.9 away from his lane (outside the 3 unit radius) is left alone');
}

console.log(failed ? 'RIDE TEST FAILED' : 'ride test passed');
process.exit(failed ? 1 : 0);
