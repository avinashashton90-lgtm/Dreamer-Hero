// Headless end-of-Part-1 test: the girl's cutscene (trigger, camera, typewriter, taps, witch
// hint, Skip mid-typewriter), the desert (layout, a bot riding the whole trail at normal speed
// and galloping, walls), the ending (horse slows, wide shot, ending state, stats) and Play
// Again resetting everything.
// Usage: npm run test:ending   (exits non-zero on failure)
import * as THREE from 'three';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { GameState, STATES } from '../src/state.js';
import { World } from '../src/world.js';
import { Hero } from '../src/hero.js';
import { Horse } from '../src/horse.js';
import { Gems } from '../src/gems.js';
import { Abilities } from '../src/abilities.js';
import { Combat } from '../src/combat.js';
import { Lives } from '../src/lives.js';
import { Boss, BOSS_STATES } from '../src/boss.js';
import { Girl } from '../src/girl.js';
import { Quests } from '../src/quests.js';
import { FollowCamera } from '../src/camera.js';
import { Cinematic } from '../src/cinematic.js';
import { Story } from '../src/story.js';
import { Sound } from '../src/audio.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world); await hero.init();
const sound = new Sound();
const horse = new Horse(scene, world); horse.sound = sound; await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
const lives = new Lives();
const gems = new Gems(scene, world, { onUnlock: (c, a) => abilities.unlock(a) }); await gems.init();
const boss = new Boss(scene, world, {}); await boss.init();
combat.addTarget(boss);
const girl = new Girl(scene, boss.girl); await girl.init();
const ui = { toast() {}, setQuest(t) { this.text = t; } };
const quests = new Quests(scene, world, ui, horse); quests.boss = boss; await quests.init();
const cam = new FollowCamera(16 / 9, world);
const state = new GameState(STATES.PLAY);
// A recording stand-in for the DOM dialogue box.
const view = { shown: false, lines: [], typed: '', complete: false,
  show() { this.shown = true; }, hide() { this.shown = false; },
  dialogue(speaker, text, complete) { this.speaker = speaker; this.typed = text; if (complete && !this.complete) this.lines.push(`${speaker}: ${text}`); this.complete = complete; },
  clearDialogue() { this.complete = false; this.typed = ''; } };
const cinematic = new Cinematic(cam, view);
const story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, sound });
quests.story = story;
const DS = CONFIG.desert, CI = CONFIG.cinematic, TRK = CONFIG.track, L = DIALOGUE.girlScene;
const dt = 1 / 60, NEUTRAL = { moveX: 0, moveY: 0, jumpPressed: false };
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// One game frame, like main.js (async so awaited story steps can settle).
async function frame(input = null) {
  const playing = state.is(STATES.PLAY);
  if (playing && input && !horse.controlsHero) hero.update(dt, input, cam.yaw);
  horse.update(dt, playing ? input : state.is(STATES.CUTSCENE) ? NEUTRAL : null, cam.yaw, hero);
  boss.update(dt, hero);
  gems.update(dt, horse.controlsHero ? horse.collectPoint : hero.position.clone().setY(hero.position.y + 0.9));
  girl.update(dt);
  story.update(dt, playing || state.is(STATES.CUTSCENE));
  if (playing) quests.update(dt, hero);
  if (cinematic.active) cinematic.update(dt);
  else cam.update(dt, hero.position, { mounted: horse.mounted, speed: horse.speedRatio, heading: horse.heading });
  world.update(dt, cam.camera.position);
  await null;
}
const run = async (secs, input) => { for (let i = 0; i < Math.round(secs / dt); i++) await frame(input); };
const until = async (pred, maxS, input) => { let t = 0; while (t < maxS) { await frame(input); t += dt; if (pred()) return t; } return -1; };
const girlPos = () => boss.girl.position;
const standNearGirl = (d) => {
  const g = girlPos(), f = CONFIG.boss.girl.facing;
  const x = g.x + Math.sin(f) * d, z = g.z + Math.cos(f) * d;
  hero.lastSafe.set(x, world.heightAt(x, z), z); hero.respawn();
};
// The boss is beaten, the girl has stepped out, the hero is on foot nearby.
const afterBoss = async () => {
  boss.debugDefeat();
  if (horse.controlsHero) horse.toggle(hero);
  horse.mode = 'idle'; hero.riding = false; horse.everMounted = horse.arrivedAtCave = true;
  quests.goTo('enterCave');
  standNearGirl(9);
  await run(0.2, NEUTRAL);
};

// 1) Trigger: only after the boss, only within ~4 of the girl.
{
  standNearGirl(2);
  await run(0.3, NEUTRAL);
  const notBefore = !cinematic.active && state.is(STATES.PLAY);
  await afterBoss();
  const notFar = !cinematic.active;
  standNearGirl(CI.trigger - 0.5);
  await frame(NEUTRAL);
  check(notBefore && notFar && cinematic.active && state.is(STATES.CUTSCENE) && story.phase === 'cutscene', `cutscene starts after the boss within ${CI.trigger} of the girl (state ${state.current})`);
}

// 2) The scene: camera on the frightened girl, typewriter lines, push-in, witch hint, joining up.
{
  const g = girlPos();
  await until(() => view.typed.length > 0, 3);
  const dEstablish = cam.camera.position.distanceTo(g);
  const heroFacing = hero.facing;
  const typedEarly = view.typed.length;
  await run(0.15);
  const typedLater = view.typed.length;
  check(typedEarly > 0 && typedLater > typedEarly && !view.complete && view.speaker === DIALOGUE.speakers.hero, `typewriter: "${view.typed}" … (${typedLater} chars after 0.15 s), speaker ${view.speaker}`);
  check(girl.frightened && Math.abs(boss.girl.userData.arms[0].elbow.rotation.x) > 1, 'girl frightened: hands clasped, trembling');
  check(view.shown, 'dialogue view shown');
  // Taps: complete the line, then continue; record the hint as it plays.
  let readFor = 0, hintSeen = false, eyesPurple = false, shadowHat = false, hintEndedAt = -1, tHint = -1, t = 0, minDist = Infinity;
  const purple = new THREE.Color(CI.hintColor);
  while (cinematic.active && t < 60) {
    await frame();
    t += dt;
    minDist = Math.min(minDist, cam.camera.position.distanceTo(g));
    if (girl.hinting) { if (!hintSeen) tHint = t; hintSeen = true; if (boss.girl.userData.eyeMat.color.equals(purple)) eyesPurple = true; if (girl.shadow.userData.hint.visible) shadowHat = true; }
    else if (hintSeen && hintEndedAt < 0) hintEndedAt = t;
    // Tap when a line is fully shown (like a player reading it), a moment later.
    if (view.complete && (readFor = (readFor ?? 0) + dt) > 0.4) { readFor = 0; cinematic.tap(); }
  }
  const expected = [`${DIALOGUE.speakers.hero}: ${L.safe}`, `${DIALOGUE.speakers.girl}: ${L.thanks}`, `${DIALOGUE.speakers.hero}: ${L.safety}`, `${DIALOGUE.speakers.girl}: ${L.castle}`];
  check(JSON.stringify(view.lines) === JSON.stringify(expected), `dialogue in order:\n       ${view.lines.join('\n       ')}`);
  check(dEstablish < 9 && minDist < 3.2, `camera on the girl (${dEstablish.toFixed(1)} away), pushes in to ${minDist.toFixed(1)}`);
  check(hintSeen && eyesPurple && shadowHat && Math.abs(hintEndedAt - tHint - CI.hintTime) < 0.1 && sound.counts.eerie === 1,
    `witch hint: eyes flicker purple ${eyesPurple}, wall shadow shows hat and staff ${shadowHat}, lasts ${(hintEndedAt - tHint).toFixed(2)} s, eerie sound ${sound.counts.eerie}`);
  check(Math.abs(wrap(hero.facing - heroFacing)) < 1e-6 || hero.riding, 'the hero doesn\'t notice (no reaction)');
  await run(0.1);
  check(!cinematic.active && !view.shown && state.is(STATES.PLAY), `cutscene over, controls back (state ${state.current})`);
  check(story.girlJoined && story.phase === 'desert' && horse.mode === 'riding' && hero.riding && horse.passenger === boss.girl && girl.riding, 'the girl rides behind the hero');
  check(horse.route === world.desertTrack && world.activeTrack === world.desertTrack && horse.position.x > DS.startX, `on the desert trail (x ${horse.position.x.toFixed(0)})`);
  await run(0.1, NEUTRAL);
  check(quests.current?.id === 'castle' && ui.text === DIALOGUE.quests.castle, `quest: "${ui.text}"`);
  // Passenger sits behind the hero.
  const back = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  const rel = boss.girl.position.clone().sub(hero.position);
  check(rel.dot(back) < -0.3 && Math.abs(rel.y) < 0.8, `girl seated behind the hero (${rel.dot(back).toFixed(2)} along the horse)`);
}

// 3) Skip works mid-typewriter (and at the first line): the story still moves on.
for (const at of ['second line, mid-typewriter', 'first line']) {
  story.resetAll(); state.current = STATES.PLAY;
  await afterBoss();
  standNearGirl(CI.trigger - 0.5);
  await frame(NEUTRAL);
  if (at.startsWith('second')) {
    await until(() => view.speaker === DIALOGUE.speakers.hero && view.complete, 10);
    cinematic.tap();
    await until(() => view.speaker === DIALOGUE.speakers.girl && view.typed.length > 5, 10);
  } else await until(() => view.typed.length > 3, 5);
  const midType = cinematic.typing;
  await cinematic.skip();
  await run(0.1);
  check(midType && !cinematic.active && !view.shown && story.girlJoined && story.phase === 'desert' && horse.passenger === boss.girl && state.is(STATES.PLAY),
    `Skip (${at}): typing ${midType} → cutscene ends, girl joins, desert ride, state ${state.current}`);
}

// 4) The desert: layout, then a bot rides the whole trail (normal and galloping).
{
  const t = world.desertTrack;
  const CH = TRK.corridorHalfWidth;
  const inside = world.desertItems.filter((it) => t.distance(it.x, it.z, CH + it.r + 1) < CH + it.r - 1e-3).length;
  const obstaclesNear = world.obstacles.filter((o) => t.distance(o.cx, o.cz, 30) < 30).length;
  let hMin = Infinity, hMax = -Infinity, maxSlope = 0;
  for (let x = DS.startX + 30; x < CONFIG.world.xMax - 40; x += 11) for (let z = -60; z < 640; z += 11) { const h = world.heightAt(x, z); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
  for (let s = 2; s < t.length; s += 2) { const a = t.at(s - 2), b = t.at(s); maxSlope = Math.max(maxSlope, Math.abs(world.heightAt(b.x, b.z) - world.heightAt(a.x, a.z)) / 2); }
  const kinds = {}; for (const it of world.desertItems) kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
  check(t.length >= DS.minLength, `desert trail ${t.length.toFixed(0)} long (≥ ${DS.minLength})`);
  check(inside === 0 && obstaclesNear === 0, `nothing on the trail: scenery inside the corridor ${inside}, obstacles near it ${obstaclesNear} (${JSON.stringify(kinds)})`);
  check(hMax - hMin > 4 && maxSlope < 0.12, `dunes roll ${hMin.toFixed(1)}–${hMax.toFixed(1)} off the trail; trail slope ≤ ${maxSlope.toFixed(3)}`);
  cam.camera.position.set(400, 10, 0); world.update(0, cam.camera.position);
  check(world.sunset > 0.99 && world.castle && world.castlePosition, `sunset sky in the desert (${world.sunset.toFixed(2)}); castle at ${world.castlePosition.toArray().map((v) => v.toFixed(0))}`);

  const steerTo = (x, z) => THREE.MathUtils.clamp(-wrap(Math.atan2(x - horse.position.x, z - horse.position.z) - horse.heading) * 2.2, -1, 1);
  const ride = async (gallop) => {
    story.resetAll(); state.current = STATES.PLAY;
    await story.debugDesert();
    const prints0 = horse.prints.length;
    let tt = 0, best = 0, since = 0, stuck = false, maxLat = 0, gemsGot = 0;
    const c0 = Object.values(gems.counts).reduce((a, b) => a + b, 0);
    while (tt < 200 && story.phase === 'desert') {
      const n = t.nearest(horse.position.x, horse.position.z, 30) ?? t.nearestGlobal(horse.position.x, horse.position.z);
      if (n.s > best + 1) { best = n.s; since = 0; } else if ((since += dt) > 4) { stuck = true; break; }
      maxLat = Math.max(maxLat, Math.abs(n.lateral));
      const next = gems.gems.find((g) => g.zone === 'desert' && !g.collected && g.s > n.s + 2 && g.s < n.s + 30);
      const lat = next ? next.lateral : 0;
      const p = t.at(Math.min(t.length + 40, n.s + 14));
      const tight = t.maxCurvature(n.s, n.s + 30) > 0.018;
      await frame({ moveX: steerTo(p.x - p.tz * lat, p.z + p.tx * lat), moveY: 1, jumpPressed: false, gallop: gallop && !tight });
      tt += dt;
    }
    gemsGot = Object.values(gems.counts).reduce((a, b) => a + b, 0) - c0;
    return { tt, stuck, maxLat, prints: horse.prints.length - prints0, dust: horse.dust.length, gemsGot, wallContacts: horse.wallContacts };
  };
  const rn = await ride(false);
  check(!rn.stuck && story.phase === 'ending' && rn.maxLat <= TRK.halfWidth, `bot rides the desert at normal speed in ${rn.tt.toFixed(1)} s to the castle; stuck ${rn.stuck}, max off-centre ${rn.maxLat.toFixed(1)}`);
  check(rn.prints > 20 && rn.dust > 0 && rn.gemsGot > 0, `hoof prints ${rn.prints}, dust puffs, optional gems picked up ${rn.gemsGot}`);
  // 5) The ending: horse slows to a stop, a wide shot from behind, then the ending state.
  const camBefore = cam.camera.position.clone();
  const tStop = await until(() => horse.speed < 0.1, 6);
  const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
  await until(() => !cinematic.moves?.length, 6);
  const behind = cam.camera.position.clone().sub(horse.position);
  const tEnd = await until(() => state.is(STATES.ENDING), 10);
  const stats = story.stats();
  check(tStop > 0 && horse.hold && horse.mode === 'riding', `the horse slows to a stop near the castle in ${tStop.toFixed(1)} s`);
  check(behind.dot(f) < -CONFIG.ending.shot.back * 0.8 && behind.y > CONFIG.ending.shot.height * 0.8, `wide shot from behind (${(-behind.dot(f)).toFixed(1)} back, ${behind.y.toFixed(1)} up)`);
  check(tEnd >= 0 && story.phase === 'done' && stats.time > rn.tt && stats.gems >= rn.gemsGot && stats.deaths === 0 && stats.gemsTotal === gems.gems.length,
    `ending state; summary: gems ${stats.gems}/${stats.gemsTotal}, time ${stats.time.toFixed(1)} s, deaths ${stats.deaths}`);
  check(camBefore.distanceTo(cam.camera.position) > 1, 'the camera moved for the ending shot');
  const rg = await ride(true);
  check(!rg.stuck && story.phase === 'ending' && rg.maxLat <= TRK.halfWidth && rg.tt < rn.tt, `galloping: ${rg.tt.toFixed(1)} s, max off-centre ${rg.maxLat.toFixed(1)}`);
  // Walls: steering hard into the side keeps the horse on the desert trail.
  story.resetAll(); state.current = STATES.PLAY;
  await story.debugDesert();
  let worst = 0;
  for (const side of [-1, 1]) {
    const p = t.at(t.length * 0.4);
    horse.position.set(p.x, world.heightAt(p.x, p.z), p.z); horse.heading = Math.atan2(p.tx, p.tz); horse.speed = 30;
    for (let i = 0; i < 120; i++) {
      await frame({ moveX: side, moveY: 1, jumpPressed: false, gallop: true });
      const n = t.nearest(horse.position.x, horse.position.z, 30);
      worst = Math.max(worst, n ? Math.abs(n.lateral) : Infinity);
    }
  }
  check(worst <= TRK.halfWidth, `desert walls: pushing hard into both sides, max off-centre ${worst.toFixed(2)}`);
}

// 6) Play Again: everything back to a brand new game.
{
  // Make a mess first.
  await story.debugDesert();
  gems.grantAll();
  abilities.energy = 0.7;
  lives.damage(CONFIG.lives.hearts); lives.resolveDeath();
  const listeners = (s) => { const b = state.listeners.get(s); return b ? b.enter.length + b.exit.length : 0; };
  const before = Object.values(STATES).map(listeners).join(',');
  story.time = 123;
  const msgs = [];
  story.resetAll();
  const start = world.boxes[0].safe;
  const [hx, hz] = CONFIG.horse.position;
  const checks = {
    gems: gems.remaining === gems.gems.length && Object.values(gems.counts).every((n) => n === 0) && gems.unlocked.size === 0,
    lives: lives.hearts === CONFIG.lives.hearts && lives.respawns === CONFIG.lives.respawns && lives.deaths === 0 && !lives.dead,
    boss: boss.hp === boss.maxHp && boss.state === BOSS_STATES.GUARD && !boss.defeated && !boss.girlTaken && !boss.girl.visible,
    girl: girl.frightened && !girl.riding && !girl.hinting,
    abilities: abilities.unlocked.size === 0 && abilities.energy === 0 && !abilities.batarangOut && !abilities.armed,
    combat: combat.step === -1,
    quests: quests.index === 0,
    horse: horse.mode === 'idle' && !horse.everMounted && !horse.passenger && !horse.hold && horse.route === world.track && Math.hypot(horse.position.x - hx, horse.position.z - hz) < 0.01,
    route: world.activeTrack === world.track && horse.checkpoints === horse.forestCheckpoints && horse.lastCheckpoint === 0,
    hero: !hero.riding && hero.position.distanceTo(start) < 0.01,
    story: story.phase === 'forest' && story.time === 0 && !story.girlJoined && !story.endingStarted,
    timers: story.time === 0 && abilities.cooldowns.batarang === 0 && abilities.cooldowns.smokeBomb === 0,
    cinematic: !cinematic.active && !view.shown,
    sunset: world.sunset === 0,
    listeners: Object.values(STATES).map(listeners).join(',') === before,
  };
  for (const [k, v] of Object.entries(checks)) if (!v) msgs.push(k);
  check(msgs.length === 0, `Play Again resets everything${msgs.length ? ' — NOT reset: ' + msgs.join(', ') : ' (gems, lives, boss, girl, abilities, combat, quests, horse, route, hero, story, timers, cinematic, sky, listeners)'}`);
  // And the new game plays through again.
  await afterBoss();
  standNearGirl(CI.trigger - 0.5);
  await frame(NEUTRAL);
  const again = cinematic.active;
  await cinematic.skip();
  await run(0.1);
  check(again && story.phase === 'desert', 'after Play Again the story runs again (cutscene → desert)');
}

console.log(failed ? 'ENDING TEST FAILED' : 'ending test passed');
process.exit(failed ? 1 : 0);
