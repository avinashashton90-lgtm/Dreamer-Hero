// Headless end-of-Part-1 test: the girl's cutscene (trigger, camera, typewriter, taps, witch
// hint, Skip mid-typewriter), exhaustion on 1 heart and the Lazarus Pit scene, the desert (layout, a bot riding the whole trail at normal speed
// and galloping, walls), the castle-gate cinematic, then Amy and the portal (the end of Part 1:
// she gets down, walks ahead, turns to AJ — no glow on her, nothing revealed —, the lines, a portal tears open mid-line
// beside AJ and pulls him and the horse in, the camera following; Skip), the ending state
// (without Part 2 loaded), and Play Again resetting everything.
// Usage: npm run test:ending   (exits non-zero on failure)
import { heroAssets } from './node-assets.mjs'; // the real Mixamo hero, read from public/
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
import { LazarusPit } from '../src/pit.js';
import { characterBodies } from '../src/fade.js';
import { CastleGate } from '../src/gate.js';

const world = new World(); await world.init();
const scene = world.scene;
const hero = new Hero(scene, world, heroAssets); await hero.init();
const sound = new Sound();
const horse = new Horse(scene, world, heroAssets); horse.sound = sound; await horse.init();
const combat = new Combat(scene, hero); await combat.init();
const abilities = new Abilities(hero, scene, world, combat); await abilities.init();
combat.abilities = abilities;
const lives = new Lives();
const gems = new Gems(scene, world, { onUnlock: (c, a) => abilities.unlock(a) }); await gems.init();
const boss = new Boss(scene, world, {}, heroAssets); await boss.init();
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
cinematic.bodies = characterBodies({ hero, girlModel: boss.girl, horse }); // (as in main.js)
const pit = new LazarusPit(scene, world, sound); await pit.init();
const gate = new CastleGate(scene, world); await gate.init(); gate.camera = cam.camera;
const story = new Story({ world, hero, horse, boss, girl, gems, abilities, combat, lives, quests, cinematic, state, cam, pit, gate, sound });
quests.story = story;
const DS = CONFIG.desert, CI = CONFIG.cinematic, TRK = CONFIG.track, L = DIALOGUE.girlScene, PL = DIALOGUE.pitScene, EX = DS.exhaustion;
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
  gate.update(dt, story.gateStarted && !story.gateDone ? horse : null);
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
  // (Amy plays her scared clip; the placeholder clasps its hands)
  const posed = boss.girl.userData.animator ? boss.girl.userData.animator.primary === 'scared' : Math.abs(boss.girl.userData.arms[0].elbow.rotation.x) > 1;
  check(girl.frightened && girl.pose === 'scared' && posed, `girl frightened (pose ${girl.pose}, ${boss.girl.userData.kind} model)`);
  check(view.shown, 'dialogue view shown');
  // Taps: complete the line, then continue; record the hint as it plays.
  let readFor = 0, hintSeen = false, eyesPurple = false, shadowHat = false, hintEndedAt = -1, tHint = -1, t = 0, minDist = Infinity;
  const purple = new THREE.Color(CI.hintColor);
  while (cinematic.active && t < 60) {
    await frame();
    t += dt;
    minDist = Math.min(minDist, cam.camera.position.distanceTo(g));
    if (girl.hinting) { if (!hintSeen) tHint = t; hintSeen = true; if (girl.eyesGlowing && (boss.girl.userData.eyes?.visible ?? boss.girl.userData.eyeMat.color.equals(purple))) eyesPurple = true; if (girl.shadow.userData.hint.visible) shadowHat = true; }
    else if (hintSeen && hintEndedAt < 0) hintEndedAt = t;
    // Tap when a line is fully shown (like a player reading it), a moment later.
    if (view.complete && (readFor = (readFor ?? 0) + dt) > 0.4) { readFor = 0; cinematic.tap(); }
  }
  const expected = [`${DIALOGUE.speakers.hero}: ${L.safe}`, `${DIALOGUE.speakers.girl}: ${L.thanks}`, `${DIALOGUE.speakers.hero}: ${L.safety}`, `${DIALOGUE.speakers.girl}: ${L.castle}`];
  check(JSON.stringify(view.lines) === JSON.stringify(expected), `dialogue in order:\n       ${view.lines.join('\n       ')}`);
  check(dEstablish < 9 && minDist < 3.2, `camera on the girl (${dEstablish.toFixed(1)} away), pushes in to ${minDist.toFixed(1)}`);
  check(hintSeen && !eyesPurple && shadowHat && Math.abs(hintEndedAt - tHint - CI.hintTime) < 0.1 && sound.counts.eerie === 1,
    `witch hint: no glow on her eyes (${eyesPurple ? 'GLOWING' : 'none'}), wall shadow shows hat and staff ${shadowHat}, lasts ${(hintEndedAt - tHint).toFixed(2)} s, eerie sound ${sound.counts.eerie}`);
  check(Math.abs(wrap(hero.facing - heroFacing)) < 1e-6 || hero.riding, 'the hero doesn\'t notice (no reaction)');
  await run(0.1);
  check(!cinematic.active && !view.shown && state.is(STATES.PLAY), `cutscene over, controls back (state ${state.current})`);
  check(story.girlJoined && story.phase === 'desert' && horse.mode === 'riding' && hero.riding && horse.passenger === boss.girl && girl.riding && girl.pose === 'ride', 'the girl rides behind the hero');
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

// 4) Exhaustion on the last heart, and the Lazarus Pit ("Stop." scene).
{
  story.resetAll(); state.current = STATES.PLAY;
  await afterBoss();
  await run(0.1, NEUTRAL);
  check(lives.hearts === DS.desertArrivalHearts && story.fatigue >= EX.start, `boss beaten: hearts drop to ${lives.hearts}, exhausted (${story.fatigue.toFixed(2)})`);
  await story.debugDesert();
  await run(0.1, NEUTRAL);
  check(lives.hearts === 1 && story.phase === 'desert', `hearts on entering the desert: ${lives.hearts}`);
  // Flash bar and gems before the pit (the pit must not touch them).
  gems.grantAll();
  abilities.energy = 0.4;
  const gemsBefore = JSON.stringify(gems.counts), energyBefore = abilities.energy;
  const t = world.desertTrack, Lt = t.length;
  const steerOn = () => { const n = t.nearest(horse.position.x, horse.position.z, 30) ?? t.nearestGlobal(horse.position.x, horse.position.z); const p = t.at(n.s + 14); return THREE.MathUtils.clamp(-wrap(Math.atan2(p.x - horse.position.x, p.z - horse.position.z) - horse.heading) * 2.2, -1, 1); };
  let fEarly = -1, vEarly = 0, fLate = 0, vLate = 0, staminaCap = 1, pitHiddenBefore = true, triggerAt = -1, slump = 0, gallopDrain = 0;
  let tt = 0;
  while (tt < 120 && !cinematic.active) {
    const gallop = horse.trackS > Lt * 0.3 && horse.trackS < Lt * 0.33;
    const st0 = horse.stamina;
    await frame({ moveX: steerOn(), moveY: 1, jumpPressed: false, gallop });
    if (gallop && horse.galloping) gallopDrain = Math.max(gallopDrain, (st0 - horse.stamina) / dt);
    tt += dt;
    const s = horse.trackS / Lt;
    if (s > 0.08 && s < 0.12) { fEarly = story.fatigue; vEarly = Math.max(vEarly, horse.speed); }
    if (s > 0.45 && s < 0.55) { fLate = Math.max(fLate, story.fatigue); vLate = Math.max(vLate, horse.speed); staminaCap = Math.min(staminaCap, 1 - EX.staminaLoss * (EX.horseFloor + (1 - EX.horseFloor) * story.fatigue)); slump = Math.max(slump, hero.appliedSlump); }
    if (pit.model.visible) pitHiddenBefore = false;
  }
  triggerAt = horse.trackS / Lt;
  check(fEarly >= EX.start && fLate > fEarly + 0.2, `tiredness grows along the trail: ${fEarly.toFixed(2)} → ${fLate.toFixed(2)} (worst before the pit)`);
  check(vEarly < CONFIG.horse.maxSpeed * (1 - EX.speedLoss * EX.horseFloor) + 0.3 && vLate <= vEarly + 0.05 && vLate < CONFIG.horse.maxSpeed * 0.78, `horse slower while exhausted: top ${vEarly.toFixed(1)} → ${vLate.toFixed(1)} (normal ${CONFIG.horse.maxSpeed})`);
  check(horse.stamina <= staminaCap + 1e-6 + EX.staminaLoss * 0.05 && gallopDrain > CONFIG.horse.gallop.staminaDrain * 1.05, `gallop stamina capped (${horse.stamina.toFixed(2)}) and drains faster (${gallopDrain.toFixed(3)}/s vs ${CONFIG.horse.gallop.staminaDrain})`);
  check(slump > EX.slump * 0.6, `hero slumped in the saddle (spine ${slump.toFixed(2)} rad)`);
  check(cinematic.active && story.phase === 'pit' && triggerAt >= 0.55 && triggerAt <= 0.6 && state.is(STATES.CUTSCENE), `"Stop." scene starts at ${(triggerAt * 100).toFixed(1)}% of the trail`);
  check(pitHiddenBefore && !pit.model.visible, 'the pit is hidden until the scene reveals it');
  check(lives.hearts === 1, 'still on 1 heart at the pit (no healing on the way)');
  // Play the scene, reading each line and tapping on.
  view.lines = [];
  let readFor = 0, lookedAtHero = false, pointed = false, revealedOnLook = false, stopped = false, kneeled = false, cup = false, pulse = false, smile = false, heartsSeq = [lives.hearts], camSide = false, t2 = 0;
  const amy = boss.girl.userData.animator; // Amy's clips (absent with the placeholder girl)
  // The camera on every frame: ≥ 1.5 from every character's body (or that character faded),
  // never in a solid or below the ground; the drink and close-up framings.
  const GD = CI.guard, SHT = DS.pit.shots;
  const surf = (b) => { const sh = b.shape(); if (!sh) return Infinity; const p = cam.camera.position; const y = THREE.MathUtils.clamp(p.y, sh.feet.y, sh.feet.y + sh.height); return Math.hypot(p.x - sh.feet.x, p.y - y, p.z - sh.feet.z) - sh.radius; };
  const onScreen = (v) => { const q = v.clone().project(cam.camera); return q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 ? q : null; };
  let camFrames = 0, tooClose = 0, closest = Infinity, inSolid = 0, underGround = 0;
  const drinkShot = { frames: 0, angle: [], up: [], heroIn: 0, pitIn: 0, hidden: 0 };
  const kneel = { rim: Infinity, hand: Infinity, handY: Infinity, frames: 0 };
  let eyeGlowFrames = 0, horseAtDismount = null, horseFrom = null, coughBeforeOk = -1;
  const okStep = story.pitSteps().find((st) => st.text === PL.ok);
  const eyeGlowShown = () => girl.eyesGlowing || !!boss.girl.userData.eyes?.visible || (boss.girl.userData.eyeMat && !boss.girl.userData.eyeMat.color.equals(new THREE.Color(0x222222)));
  // (a character between the camera and someone's chest hides them)
  const hides = (p, target, other) => {
    const sh = other.shape();
    if (!sh) return false;
    for (let k = 0.15; k < 0.95; k += 0.1) {
      const q = p.clone().lerp(target, k);
      if (q.y >= sh.feet.y && q.y <= sh.feet.y + sh.height && Math.hypot(q.x - sh.feet.x, q.z - sh.feet.z) < sh.radius * 0.8) return true;
    }
    return false;
  };
  const closeShot = { frames: 0, front: [], below: 0, eyesCentred: 0, heroSoft: 0, glow: 0, heroDist: Infinity, fov: Infinity };
  let readyDrink = false;
  const clipsSeen = new Set(), layers = new Set();
  while (cinematic.active && t2 < 90) {
    await frame();
    t2 += dt;
    if (amy) {
      clipsSeen.add(amy.primary);
      if (amy.weights.talkUpper > 0.5) layers.add('talk');
      if (amy.weights.pointUpper > 0.5) layers.add('point');
    }
    if (girl.lookAtHero) lookedAtHero = true;
    if (girl.pointing) pointed = true;
    if (view.lines.length >= 5 && pit.model.visible) revealedOnLook = true;
    if (!horseFrom && view.lines.length >= 5) horseFrom = horse.position.clone();
    if (!horseAtDismount && horseFrom && horse.mode !== 'riding') horseAtDismount = { p: horse.position.clone(), heading: horse.heading };
    if (coughBeforeOk < 0 && view.lines.at(-1)?.endsWith(PL.ok)) coughBeforeOk = sound.counts.aj_cough ?? 0;
    if (eyeGlowShown()) eyeGlowFrames++;
    if (hero.drink) {
      // AJ kneels right at the water's edge; his hand reaches into the water.
      kneel.frames++;
      kneel.rim = Math.min(kneel.rim, Math.hypot(hero.position.x - pit.position.x, hero.position.z - pit.position.z) - DS.pit.radius);
      const hp = hero.handPosition();
      const hd = Math.hypot(hp.x - pit.position.x, hp.z - pit.position.z);
      if (hp.y - pit.position.y < kneel.handY) { kneel.handY = hp.y - pit.position.y; kneel.hand = hd; }
    }
    if (view.lines.length <= 2 && horse.speed < 0.2) stopped = true;
    if (girl.kneeling && pit.active) kneeled = true;
    if (hero.cupVisible) cup = true;
    if (pit.model.userData.pulse.visible) pulse = true;
    if (girl.smiling) smile = true;
    if (lives.hearts !== heartsSeq.at(-1)) heartsSeq.push(lives.hearts);
    // Camera rules (after the first move has settled).
    if (cinematic.active && t2 > 0.2) {
      camFrames++;
      const p = cam.camera.position;
      for (const b of cinematic.bodies) {
        const d = surf(b);
        closest = Math.min(closest, d);
        if (d < GD.minDist - 1e-3 && (cinematic.opacity.get(b.name) ?? 1) > GD.nearOpacity + 0.05) tooClose++;
      }
      if (cam.insideSolid(p, 0)) inSolid++;
      if (p.y < world.heightAt(p.x, p.z)) underGround++;
      const settled = cinematic.moves.length === 0;
      // The drink: a clean wide side shot from the group, low, looking at the pit, AJ and Amy in frame, nobody hidden.
      if (hero.drink && settled) {
        drinkShot.frames++;
        const mid = hero.position.clone().add(boss.girl.position).add(pit.position).divideScalar(3);
        drinkShot.angle.push(Math.hypot(p.x - mid.x, p.z - mid.z));
        drinkShot.up.push(p.y - world.heightAt(p.x, p.z));
        const body = (o) => [0.3, 1.0].every((k) => onScreen(o.clone().setY(o.y + k)));
        if (body(hero.position) && body(boss.girl.position)) drinkShot.heroIn++;
        const q = onScreen(pit.position);
        if (q && Math.abs(q.x) < 0.25 && Math.abs(q.y) < 0.35) drinkShot.pitIn++;
        const chest = (o) => o.clone().setY(o.y + 0.7);
        const [bh, bg, bhorse] = ['hero', 'girl', 'horse'].map((n) => cinematic.bodies.find((b) => b.name === n));
        // (the pit's rim never hides AJ kneeling at it, nor Amy)
        const rimHides = (target) => {
          for (let k = 0.02; k < 1; k += 0.02) {
            const q = p.clone().lerp(target, k);
            const d = Math.hypot(q.x - pit.position.x, q.z - pit.position.z);
            if (q.distanceTo(target) > 0.45 && d > DS.pit.radius - 0.1 && d < DS.pit.radius + 0.6 && q.y < pit.position.y + 0.27) return true;
          }
          return false;
        };
        if ([0.35, 0.6].some((k) => rimHides(hero.position.clone().setY(hero.position.y + k)) || rimHides(boss.girl.position.clone().setY(boss.girl.position.y + k)))) drinkShot.hidden++;
        if (hides(p, chest(hero.position), bg) || hides(p, chest(hero.position), bhorse) || hides(p, chest(boss.girl.position), bh) || hides(p, chest(boss.girl.position), bhorse)) drinkShot.hidden++;
      }
      // The close-up: Amy's face from the front, slightly below eye level; AJ out of frame or soft.
      if (girl.smiling && settled) {
        closeShot.frames++;
        const g = boss.girl.position, yaw = boss.girl.rotation.y;
        const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const c = p.clone().sub(g).setY(0).normalize();
        closeShot.front.push(THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(f.dot(c), -1, 1))));
        const eye = g.y + SHT.closeUp.eye * CONFIG.girlModel.height; // (a fraction of her height)
        if (p.y < eye && p.y > eye - 0.35) closeShot.below++;
        const q = onScreen(new THREE.Vector3(g.x, eye, g.z));
        if (q && Math.abs(q.x) < 0.3 && Math.abs(q.y) < 0.35) closeShot.eyesCentred++;
        const aj = cinematic.bodies.find((b) => b.name === 'hero');
        const ajIn = [0.4, 1.2, 1.9].some((k) => onScreen(hero.position.clone().setY(hero.position.y + k)));
        if (!ajIn || (cinematic.opacity.get('hero') ?? 1) <= GD.softOpacity + 0.05) closeShot.heroSoft++;
        if (girl.eyesGlowing) closeShot.glow++;
        closeShot.heroDist = Math.min(closeShot.heroDist, surf(aj));
        closeShot.fov = Math.min(closeShot.fov, cam.camera.fov);
      }
    }
    if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
  }
  const range = (a) => a.length ? `${Math.min(...a).toFixed(0)}–${Math.max(...a).toFixed(0)}` : 'none';
  check(camFrames > 300 && tooClose === 0 && inSolid === 0 && underGround === 0, `pit scene camera, every frame (${camFrames}): ≥ ${GD.minDist} from every character's body or that one faded (closest ${closest.toFixed(2)}, ${tooClose} unfaded closer), never in a solid (${inSolid}) or below the ground (${underGround})`);
  check(drinkShot.frames > 30 && drinkShot.angle.every((d) => Math.abs(d - SHT.drink.dist) < 0.4) && drinkShot.up.every((u) => Math.abs(u - SHT.drink.up) < 0.15) && drinkShot.heroIn === drinkShot.frames && drinkShot.pitIn === drinkShot.frames && drinkShot.hidden === 0,
    `the drink: a clean wide side shot ${drinkShot.angle.length ? Math.min(...drinkShot.angle).toFixed(1) : '?'} from AJ, Amy and the pit (${range(drinkShot.up.map((u) => u * 100))} cm up), looking at the pit (centred ${drinkShot.pitIn}/${drinkShot.frames}), AJ and Amy both in frame (${drinkShot.heroIn}/${drinkShot.frames}), nobody hidden (${drinkShot.hidden})`);
  check(kneel.frames > 30 && kneel.rim <= DS.pit.standOff[0] + 0.25 && (heroAssets.placeholder || (kneel.hand < DS.pit.radius && kneel.handY < 0.4)),
    `AJ kneels right at the water's edge (${kneel.rim.toFixed(2)} from the rim) and his hand reaches the water (${kneel.hand.toFixed(2)} from the centre, inside ${DS.pit.radius}; ${kneel.handY.toFixed(2)} above it)`);
  const hp = horseAtDismount;
  const right = hp && new THREE.Vector3(-Math.cos(hp.heading), 0, Math.sin(hp.heading));
  const toPit = hp && pit.position.clone().sub(hp.p).setY(0).normalize();
  check(hp && horseFrom.distanceTo(pit.position) > 20 && hp.p.distanceTo(pit.position) < 9 && right.dot(toPit) > 0.8,
    `after "Look." the horse goes up to the pit (${horseFrom ? horseFrom.distanceTo(pit.position).toFixed(1) : '?'} → ${hp ? hp.p.distanceTo(pit.position).toFixed(1) : '?'} from it), its right side to the water (${right ? right.dot(toPit).toFixed(2) : '?'}), then they get down`);
  check(eyeGlowFrames === 0, `no glow on Amy anywhere in the pit scene (${eyeGlowFrames} frames)`);
  check(okStep?.voice === 'ajWeak' && okStep.pace < 1 && coughBeforeOk === 1 && CONFIG.audio.voice.characters.ajWeak.freq < CONFIG.audio.voice.characters.aj.freq && CONFIG.audio.voice.characters.ajWeak.length > CONFIG.audio.voice.characters.aj.length,
    `AJ's "${PL.ok}": a small cough first (${coughBeforeOk}), then his weak voice (lower, slower blips; typed at ${okStep?.pace}×)`);
  check(closeShot.frames > 30 && closeShot.front.every((a) => a < 30) && closeShot.below === closeShot.frames && closeShot.eyesCentred === closeShot.frames && closeShot.heroSoft === closeShot.frames && closeShot.glow === 0 && closeShot.heroDist >= GD.minDist - 1e-3 && closeShot.fov < CONFIG.render.fov,
    `the close-up: Amy's face from the front (${range(closeShot.front)}° off her facing), just below eye level, her eyes centred (${closeShot.eyesCentred}/${closeShot.frames}), no glow (${closeShot.glow} frames), AJ out of frame or soft (${closeShot.heroSoft}/${closeShot.frames}), ${closeShot.heroDist.toFixed(2)} from his body, fov ${closeShot.fov.toFixed(0)}`);
  const S = DIALOGUE.speakers;
  const expected = [`${S.girl}: ${PL.stop}`, `${S.hero}: ${PL.keepGoing}`, `${S.girl}: ${PL.notWell}`, `${S.hero}: ${PL.ok}`, `${S.girl}: ${PL.water}`, `${S.girl}: ${PL.drink}`, `${S.hero}: ${PL.who}`];
  check(JSON.stringify(view.lines) === JSON.stringify(expected), `pit dialogue in order:\n       ${view.lines.join('\n       ')}`);
  check(lookedAtHero && pointed && stopped && revealedOnLook, `girl looks at him ${lookedAtHero}, horse halts ${stopped}, she points ${pointed}, pit revealed ${revealedOnLook}`);
  if (amy) check(['ride', 'walk', 'kneel', 'happy'].every((c) => clipsSeen.has(c)) && layers.has('talk') && layers.has('point'),
    `Amy's clips in the pit scene: ${[...clipsSeen].join(', ')}; layers ${[...layers].join(', ')}`);
  check(kneeled && sound.counts.hum >= 1 && cup && pulse && smile, `she kneels and the water wakes (hum ${sound.counts.hum}), cup ${cup}, heal pulse ${pulse}, silent smile ${smile}`);
  check(JSON.stringify(heartsSeq) === JSON.stringify([1, 2, 3, 4, 5]), `hearts refill one by one: ${heartsSeq.join(' → ')}`);
  await run(0.1);
  check(!cinematic.active && state.is(STATES.PLAY) && lives.hearts === lives.maxHearts && story.pitDone && story.phase === 'desert', `after the scene: hearts ${lives.hearts}/${lives.maxHearts}, state ${state.current}`);
  check(JSON.stringify(gems.counts) === gemsBefore && abilities.energy === energyBefore, `only hearts restored: gems ${gemsBefore === JSON.stringify(gems.counts) ? 'unchanged' : 'CHANGED'}, Flash bar ${abilities.energy} (was ${energyBefore})`);
  check(horse.mode === 'riding' && hero.riding && horse.passenger === boss.girl && girl.riding && !horse.hold && !pit.active, 'they remount, she rides behind him, the pit dims');
  await run(0.2, NEUTRAL);
  check(quests.current?.id === 'castle' && ui.text === DIALOGUE.quests.castle, `quest still "${ui.text}"`);
  await run(EX.recover + 0.3, { moveX: 0, moveY: 1, jumpPressed: false });
  check(story.fatigue === 0 && horse.fatigue === 0 && hero.exhaustion === 0, 'exhaustion gone: slump, vignette and horse speed back to normal');
  const vNow = horse.speed;
  await run(2, { moveX: steerOn(), moveY: 1, jumpPressed: false });
  check(horse.speed > vLate + 1, `horse speed back up: ${horse.speed.toFixed(1)} (was ${vLate.toFixed(1)} exhausted, ${vNow.toFixed(1)} just after)`);

  // Debug L jumps straight to "Stop."; Skip mid-scene still restores the hearts.
  for (const when of ['walking to the pit', 'first line', 'close-up']) {
    story.resetAll(); state.current = STATES.PLAY;
    await story.debugPit();
    const started = cinematic.active && story.phase === 'pit' && lives.hearts === 1;
    if (when === 'close-up') await until(() => { if (view.complete) cinematic.tap(); return girl.smiling; }, 60);
    else if (when === 'first line') await until(() => view.typed.length > 1, 3);
    else await until(() => { if (view.complete) cinematic.tap(); return !!story.actors.hero; }, 30);
    const midScene = cinematic.active;
    await cinematic.skip();
    await run(0.1);
    const opaque = hero.cameraOpacity === 1 && (boss.girl.userData.fadeOpacity ?? 1) === 1 && (horse.model.userData.fadeOpacity ?? 1) === 1;
    check(started && midScene && lives.hearts === lives.maxHearts && story.pitDone && horse.mode === 'riding' && horse.passenger === boss.girl && state.is(STATES.PLAY) && !hero.drink && opaque,
      `debug L → "Stop."; Skip (${when}) → hearts ${lives.hearts}, back on the horse with her, state ${state.current}, every character opaque again`);
  }
}

// 5) The desert: layout, then a bot rides the whole trail (normal and galloping).
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
    let prints = 0;
    let tt = 0, best = 0, since = 0, stuck = false, maxLat = 0, gemsGot = 0, readFor = 0, pitScene = false;
    const c0 = Object.values(gems.counts).reduce((a, b) => a + b, 0);
    while (tt < 200 && (story.phase === 'desert' || story.phase === 'pit')) {
      if (cinematic.active) {
        // The Lazarus Pit scene on the way: read each line, then tap on.
        pitScene = true;
        await frame();
        if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
        continue;
      }
      const n = t.nearest(horse.position.x, horse.position.z, 30) ?? t.nearestGlobal(horse.position.x, horse.position.z);
      if (n.s > best + 1) { best = n.s; since = 0; } else if ((since += dt) > 4) { stuck = true; break; }
      maxLat = Math.max(maxLat, Math.abs(n.lateral));
      const next = gems.gems.find((g) => g.zone === 'desert' && !g.collected && g.s > n.s + 2 && g.s < n.s + 30);
      const lat = next ? next.lateral : 0;
      const p = t.at(Math.min(t.length + 40, n.s + 14));
      const tight = t.maxCurvature(n.s, n.s + 30) > 0.018;
      await frame({ moveX: steerTo(p.x - p.tz * lat, p.z + p.tx * lat), moveY: 1, jumpPressed: false, gallop: gallop && !tight });
      prints = Math.max(prints, horse.prints.filter((q) => q.age < q.life).length);
      tt += dt;
    }
    gemsGot = Object.values(gems.counts).reduce((a, b) => a + b, 0) - c0;
    return { tt, stuck, maxLat, prints, dust: horse.dust.length, gemsGot, wallContacts: horse.wallContacts, pitScene };
  };
  const rn = await ride(false);
  check(rn.pitScene && story.pitDone, 'the ride stops at the Lazarus Pit on the way');
  check(!rn.stuck && story.phase === 'gate' && rn.maxLat <= TRK.halfWidth, `bot rides the desert at normal speed in ${rn.tt.toFixed(1)} s to the castle; stuck ${rn.stuck}, max off-centre ${rn.maxLat.toFixed(1)}`);
  check(rn.prints > 20 && rn.dust > 0 && rn.gemsGot > 0, `hoof prints ${rn.prints}, dust puffs, optional gems picked up ${rn.gemsGot}`);
  // 6) The ending: the castle-gate cinematic (the horse rides in, the gates shut), then Amy and
  // the portal, then (no Part 2 loaded here) the ending state.
  const PO = CONFIG.part2.portal, PL2 = DIALOGUE.part2.portal, S2 = DIALOGUE.speakers;
  // The castle in Kenney's Castle Kit (as the browser loads it on reaching the desert): the same
  // passage, hinges and courtyard, so every framing check below runs on it.
  const hinges0 = Object.values(world.castle.userData.gates).map((h) => h.position.clone());
  const dressed = await world.upgradeCastle(heroAssets);
  const C = world.castle.userData;
  const kitLeaves = [...Object.values(C.gates), ...Object.values(C.innerGates)].every((h) => h.children.some((c) => c.visible && c.material === C.kitMesh?.children[0]?.material));
  if (heroAssets.placeholder) check(!dressed && !C.kit, 'the castle stays the placeholder (HERO_PLACEHOLDER)');
  else check(dressed && C.kit && kitLeaves && C.kitSwap.every((m) => !m.visible) && Object.values(C.gates).every((h, i) => h.position.equals(hinges0[i])),
    `the castle in the Castle Kit (walls, ${C.dims.towers.length + 2} towers, flags, banners; the gate leaves cut from the kit's gate on the same hinges)`);
  const camBefore = cam.camera.position.clone();
  const scale0 = { horse: horse.model.scale.x, hero: hero.model.scale.x };
  view.lines = [];
  const pr = { shut: false, innerShut: false, down: false, ahead: -Infinity, side: 0, faces: Infinity, glowColor: true, opened: false, portalSide: Infinity, reach: false, pulledTo: Infinity, minScale: 1,
    camToCore: Infinity, wideIn: 0, wideFrames: 0, gateIn: 0, bigFrames: 0, big: 0, span: [Infinity, 0], closeFrames: 0, closeGood: 0, closeDist: [Infinity, 0], amySeen: 0, amyFrames: 0, glowFrames: 0,
    openAt: null, whoaDoneAt: null, happeningAt: null, happeningFrames: 0, pulling: 0, goneInNo: false, noFrames: 0, noStill: 0, noReach: 0, noFrom: null };
  // (any glow on Amy: the awakening / witch flags, the eye overlay on her model, the placeholder's eyes)
  const amyGlows = () => girl.eyesGlowing || !!boss.girl.userData.eyes?.visible || (boss.girl.userData.eyeMat && !boss.girl.userData.eyeMat.color.equals(new THREE.Color(0x222222)));
  const onScreen = (v) => { const q = v.clone().project(cam.camera); return q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; };
  // Inside the frame a phone shows: under the letterbox (top ~9%) and above the dialogue box (the bottom ~33%).
  const BOX = -0.3, LETTERBOX = 0.8;
  const clear = (v) => { const q = v.clone().project(cam.camera); return q.z < 1 && Math.abs(q.x) <= 0.97 && q.y > BOX && q.y < LETTERBOX; };
  // Is the line from the camera to `p` blocked by AJ or the horse (vertical capsules; the horse as two, nose and tail)?
  const blocked = (p) => {
    const c = cam.camera.position;
    const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
    const R = CONFIG.cinematic.guard.radius;
    const s = horse.model.scale.x / (story.riderScale?.horse.x ?? horse.model.scale.x);
    const bodies = [];
    if (hero.model.visible) bodies.push({ at: hero.position, r: R.hero * s, h: CONFIG.heroModel.height * s });
    if (horse.model.visible) for (const k of [-0.7, 0.7]) bodies.push({ at: horse.position.clone().addScaledVector(f, k * s), r: R.horse * 0.75 * s, h: R.horseHeight * s });
    for (let i = 1; i < 40; i++) {
      const q = c.clone().lerp(p, i / 40);
      for (const b of bodies) if (q.y > b.at.y && q.y < b.at.y + b.h && Math.hypot(q.x - b.at.x, q.z - b.at.z) < b.r) return true;
    }
    return false;
  };
  const amyEyes = () => boss.girl.position.clone().setY(boss.girl.position.y + CONFIG.girlModel.height * 0.93);
  let tEnd = -1, readFor = 0;
  for (let t = 0; t < 60; t += dt) {
    await frame();
    if (gate.closed) pr.shut = true;
    if (story.portalStage?.walked && gate.innerClosed) pr.innerShut = true;
    if (story.portalStarted && !horse.passenger && story.actors.girl) {
      pr.down = true;
      const g = story.actors.girl;
      const f = new THREE.Vector3(Math.sin(horse.heading), 0, Math.cos(horse.heading));
      if (!g.moving && story.portalStage?.walked && !story.pull) {
        const d = g.pos.clone().sub(horse.position);
        pr.ahead = Math.max(pr.ahead, d.dot(f));
        pr.side = Math.max(pr.side, -d.dot(new THREE.Vector3(-f.z, 0, f.x))); // (to its left)
        if (!story.portalCloseUp) pr.faces = Math.min(pr.faces, Math.abs(wrap(g.yaw - Math.atan2(hero.position.x - g.pos.x, hero.position.z - g.pos.z))));
      }
      // Amy is never hidden behind AJ or the horse (until they are gone into the light).
      if (!story.pull?.done && cinematic.moves.length === 0) {
        pr.amyFrames++;
        if (onScreen(amyEyes()) && !blocked(amyEyes()) && !blocked(boss.girl.position.clone().setY(boss.girl.position.y + 1))) pr.amySeen++;
      }
    }
    if (story.portalStarted && amyGlows()) pr.glowFrames++;
    // The timing: the portal tears open mid-line in AJ's "Whoa...", his "What's happening?!"
    // follows at once while it already pulls him in, and Amy's "No......" as they vanish.
    const st0 = cinematic.current?.step;
    if (story.portal.open > 0 && pr.openAt === null) pr.openAt = { line: st0?.text, typed: view.typed?.length ?? 0, complete: view.complete };
    if (st0?.text === PL2.whoa && view.complete && pr.whoaDoneAt === null) pr.whoaDoneAt = t;
    if (st0?.text === PL2.happening) {
      if (pr.happeningAt === null) pr.happeningAt = t;
      pr.happeningFrames++;
      if (story.pull && !story.pull.done) pr.pulling++;
    }
    if (st0?.text === PL2.no && story.actors.girl) {
      pr.noFrames++;
      pr.noFrom ??= story.actors.girl.pos.clone();
      if (story.actors.girl.pos.distanceTo(pr.noFrom) < 1e-6 && !story.actors.girl.moving) pr.noStill++;
      if (girl.pointing && girl.frightened) pr.noReach++;
      if (story.pull?.done) pr.goneInNo = true;
    }
    if (story.portal.open >= 1 && !pr.opened) {
      pr.opened = true;
      pr.portalSide = story.portal.center.distanceTo(horse.position.clone().setY(story.portal.center.y));
    }
    if (story.pull && girl.pointing) pr.reach = true;
    if (story.pull) {
      pr.pulledTo = Math.min(pr.pulledTo, horse.position.distanceTo(story.portal.center));
      pr.minScale = Math.min(pr.minScale, horse.model.scale.x / (story.riderScale?.horse.x ?? horse.model.scale.x));
    }
    if (story.portalStarted && story.portal.model?.visible) pr.camToCore = Math.min(pr.camToCore, cam.camera.position.distanceTo(story.portal.center));
    const step = cinematic.current?.step;
    if (story.portalStarted && cinematic.moves.length === 0 && !story.pull?.done && story.portalStage) {
      if (step?.text === PL2.thanks) {
        // The close-up: her face in the middle of the frame (she looks normal: no glow).
        pr.closeFrames++;
        const q = amyEyes().project(cam.camera);
        const d = cam.camera.position.distanceTo(amyEyes());
        pr.closeDist = [Math.min(pr.closeDist[0], d), Math.max(pr.closeDist[1], d)];
        if (q.z < 1 && Math.abs(q.x) < 0.3 && q.y > 0.1 && q.y < 0.65 && d < 2.6 && d > 1.4) pr.closeGood++; // (her face in the upper half, clear of the dialogue box)
      } else {
        // The wide shots: AJ, Amy and the horse (feet to heads) clear of the letterbox and the
        // dialogue box, the closed inner gates and the wall top with the sky over it behind them.
        pr.wideFrames++;
        const body = (p, h) => clear(p.clone().setY(p.y + 0.05)) && clear(p.clone().setY(p.y + h));
        if (body(hero.position, story.pull ? 0.5 : 1.5) && body(boss.girl.position, CONFIG.girlModel.height) && (story.pull || body(horse.position, 1.6))) pr.wideIn++;
        const st = story.portalStage;
        if (clear(st.gate.clone().setY(st.floor + CONFIG.desert.castle.gate.height * 0.5))) pr.gateIn++;
        // (big in the frame: from the horse's hooves to AJ's head, and Amy, before the pull)
        if (!story.pull && story.portalStage.walked) {
          const y = (p, h) => p.clone().setY(p.y + h).project(cam.camera).y;
          const span = y(hero.position, 1.5) - y(horse.position, 0);
          pr.span = [Math.min(pr.span[0], span), Math.max(pr.span[1], span)];
          pr.bigFrames++;
          if (span > 0.45 && y(boss.girl.position, CONFIG.girlModel.height) - y(boss.girl.position, 0) > 0.28) pr.big++;
        }
      }
    }
    if (view.complete && (readFor += dt) > 0.3) { readFor = 0; cinematic.tap(); }
    if (state.is(STATES.ENDING)) { tEnd = t; break; }
  }
  const stats = story.stats();
  check(tEnd > 0 && pr.shut && story.gateRide?.done, `the gate cinematic: the horse rides into the castle, the gates shut (${tEnd.toFixed(1)} s to the end)`);
  check(JSON.stringify(view.lines) === JSON.stringify([`${S2.girl}: ${PL2.thanks}`, `${S2.aj}: ${PL2.whoa}`, `${S2.aj}: ${PL2.happening}`, `${S2.girl}: ${PL2.no}`]) && S2.aj === 'AJ', `the portal scene's lines in order (AJ named "AJ"):\n       ${view.lines.join('\n       ')}`);
  check(pr.openAt?.line === PL2.whoa && !pr.openAt.complete && pr.openAt.typed > 0 && pr.whoaDoneAt !== null && pr.happeningAt !== null && pr.happeningAt - pr.whoaDoneAt <= 2 * dt + 1e-9,
    `the portal tears open mid-line (${pr.openAt?.typed} of "${PL2.whoa}" typed) and "${PL2.happening}" follows with no pause (${pr.happeningAt !== null && pr.whoaDoneAt !== null ? (pr.happeningAt - pr.whoaDoneAt).toFixed(3) : '?'} s)`);
  check(pr.happeningFrames > 5 && pr.pulling >= pr.happeningFrames - 1, `"${PL2.happening}" plays while the portal already pulls AJ and the horse in (${pr.pulling}/${pr.happeningFrames} frames)`);
  check(pr.goneInNo && pr.noFrames > 10 && pr.noStill === pr.noFrames && pr.noReach === pr.noFrames, `Amy's "${PL2.no}" as they vanish into the light: she stands still, her hand held out to him all through it (${pr.noStill}/${pr.noFrames})`);
  check(pr.innerShut && sound.counts.gateSlam >= 2 && world.castle.userData.torches.length === 4, `the horse walks into the courtyard; the inner gates swing shut behind it (a thud); torches either side of the gate`);
  check(pr.down && pr.side >= PO.dismount.side - 0.5 && pr.ahead >= PO.dismount.ahead - 0.5 && pr.faces < 0.35,
    `Amy gets down beside the horse (${pr.side.toFixed(1)} to its left, ${pr.ahead.toFixed(1)} ahead) and turns to face AJ (${pr.faces.toFixed(2)} rad off)`);
  check(pr.wideFrames > 60 && pr.wideIn === pr.wideFrames && pr.gateIn === pr.wideFrames && pr.bigFrames > 20 && pr.big === pr.bigFrames,
    `the wide shots: AJ, Amy and the horse in frame between the letterbox and the dialogue box (${pr.wideIn}/${pr.wideFrames}), big (hooves to AJ's head ${pr.span[0].toFixed(2)}–${pr.span[1].toFixed(2)} of the screen's half-height, ${pr.big}/${pr.bigFrames}), the closed gates behind them (${pr.gateIn})`);
  check(pr.closeFrames > 10 && pr.closeGood === pr.closeFrames && pr.glowFrames === 0 && !girl.eyesGlowing,
    `"${PL2.thanks}": a close-up on her face (eyes centred ${pr.closeGood}/${pr.closeFrames}, ${pr.closeDist[0].toFixed(2)}–${pr.closeDist[1].toFixed(2)} from them); no glow on her anywhere in the scene (${pr.glowFrames} frames) — she looks normal`);
  check(pr.amyFrames > 60 && pr.amySeen === pr.amyFrames, `Amy is never hidden behind AJ or the horse (${pr.amySeen}/${pr.amyFrames} frames)`);
  check(pr.opened && Math.abs(pr.portalSide - PO.side) < 0.6 && sound.counts.portal_open === 1 && sound.counts.portal_pull === 1 && sound.counts.gear_whoosh === PO.gearWhooshes && story.portal.model.userData.gears.count === PO.gears.count,
    `a portal opens in the air beside AJ (${pr.portalSide.toFixed(1)} to his side), gears flying in, a rising shimmer, small gears whooshing past and a swirling pull`);
  check(pr.reach && pr.pulledTo < 1.6 && pr.minScale < 0.6 && pr.camToCore < PO.radius, `Amy reaches for him; AJ and the horse are pulled into the portal (${pr.pulledTo.toFixed(2)} from its core, shrinking to ${pr.minScale.toFixed(2)}); the camera flies on into its light (${pr.camToCore.toFixed(2)})`);
  check(!story.riderScale && Math.abs(horse.model.scale.x - scale0.horse) < 1e-6 && Math.abs(hero.model.scale.x - scale0.hero) < 1e-6 && story.part1Done, 'Part 1 is over (no Part 2 here: the ending screens); AJ and the horse back to full size');
  check(tEnd >= 0 && story.phase === 'done' && stats.time > rn.tt && stats.gems >= rn.gemsGot && stats.deaths === 0 && stats.gemsTotal === gems.gems.filter((g) => g.zone !== 'drop').length,
    `ending state; summary: gems ${stats.gems}/${stats.gemsTotal}, time ${stats.time.toFixed(1)} s, deaths ${stats.deaths}`);
  check(camBefore.distanceTo(cam.camera.position) > 1, 'the camera moved for the gate cinematic');
  const rg = await ride(true);
  check(!rg.stuck && story.phase === 'gate' && rg.maxLat <= TRK.halfWidth && rg.tt < rn.tt, `galloping: ${rg.tt.toFixed(1)} s, max off-centre ${rg.maxLat.toFixed(1)}`);
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

// 7) Play Again: everything back to a brand new game.
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
    gems: gems.remaining === gems.trailGems.length && gems.gems.every((g) => g.zone === 'forest' || g.zone === 'desert' || g.hidden) && Object.values(gems.counts).every((n) => n === 0) && gems.unlocked.size === 0,
    lives: lives.hearts === CONFIG.lives.hearts && lives.respawns === CONFIG.lives.respawns && lives.deaths === 0 && !lives.dead,
    boss: boss.hp === boss.maxHp && boss.state === BOSS_STATES.GUARD && !boss.defeated && !boss.girlTaken && !boss.girl.visible,
    girl: girl.frightened && !girl.riding && !girl.hinting,
    abilities: abilities.unlocked.size === 0 && abilities.energy === 1 && !abilities.batarangOut && !abilities.strike && abilities.charging === 0,
    combat: combat.step === -1,
    quests: quests.index === 0,
    horse: horse.mode === 'idle' && !horse.everMounted && !horse.passenger && !horse.hold && horse.route === world.track && Math.hypot(horse.position.x - hx, horse.position.z - hz) < 0.01,
    route: world.activeTrack === world.track && horse.checkpoints === horse.forestCheckpoints && horse.lastCheckpoint === 0,
    hero: !hero.riding && hero.position.distanceTo(start) < 0.01,
    story: story.phase === 'forest' && story.time === 0 && !story.girlJoined && !story.endingStarted,
    timers: story.time === 0 && abilities.cooldowns.batarang === 0 && abilities.cooldowns.smokeBomb === 0,
    cinematic: !cinematic.active && !view.shown,
    sunset: world.sunset === 0,
    pit: !pit.model.visible && !pit.active && !story.pitDone && story.fatigue === 0 && horse.fatigue === 0,
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
