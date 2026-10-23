// Headless sound test (no audio files, a mock Web Audio context): every sound name the game uses
// has a synthesized fallback that builds without errors; loops, drones and voice blips; every
// music section and layer schedules notes and crossfades; the AudioManager unlocks on a touch,
// plays every name with no files present, falls back when a listed file fails to load, keeps
// the voice limit (quietest dropped), throttles repeats, attenuates / pans by distance, ducks,
// survives a refusing localStorage; the old event names map to catalog names; the soundscape's
// music sections, gait loops and detected events; public/audio/README.md up to date.
// Usage: npm run test:audio   (exits non-zero on failure)
import { readFileSync } from 'node:fs';
import { CONFIG, DIALOGUE } from '../src/config.js';
import { SOUNDS, MUSIC, MUSIC_LAYERS } from '../src/soundCatalog.js';
import { SynthKit, RECIPES, DRONES, voiceBlip } from '../src/sfx.js';
import { MusicPlayer, TRACKS } from '../src/music.js';
import { buildAudioReadme } from './audio-readme-text.mjs';

const AU = CONFIG.audio;
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

// --- A mock Web Audio context: records nodes, never makes a sound. ---
const param = (v = 0) => ({ value: v, setValueAtTime(x) { this.value = x; return this; }, exponentialRampToValueAtTime(x) { this.value = x; return this; }, linearRampToValueAtTime(x) { this.value = x; return this; }, setTargetAtTime(x) { this.value = x; return this; }, cancelScheduledValues() { return this; } });
class MockCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = this.#node('destination'); this.created = 0; this.started = 0; }
  #node(kind, extra = {}) {
    const ctx = this;
    if (kind !== 'destination') ctx.created++;
    return { kind, connections: [], connect(n) { this.connections.push(n); return n; }, disconnect() { this.connections = []; }, start() { ctx.started++; }, stop() {}, ...extra };
  }
  createGain() { return this.#node('gain', { gain: param(1) }); }
  createOscillator() { return this.#node('osc', { type: 'sine', frequency: param(440), detune: param(0) }); }
  createBiquadFilter() { return this.#node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }); }
  createBufferSource() { return this.#node('source', { buffer: null, loop: false, playbackRate: param(1) }); }
  createStereoPanner() { return this.#node('panner', { pan: param(0) }); }
  createDynamicsCompressor() { return this.#node('comp', { threshold: param(-24), ratio: param(12) }); }
  createBuffer(ch, len, rate) { const d = new Float32Array(len); return { duration: len / rate, getChannelData: () => d }; }
  decodeAudioData(data, ok, fail) { fail(new Error('not audio')); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

// 1) The catalog: every name the game needs, each with a synthesized fallback.
{
  const required = ['hoof_walk', 'hoof_trot', 'hoof_gallop', 'horse_neigh', 'horse_snort', 'horse_hurt', 'horse_eat', 'river_splash', 'potion_drink',
    'aj_jump', 'aj_land', 'aj_hurt', 'aj_death', 'aj_revive', 'aj_dismount', 'aj_mount', 'batarang_throw', 'batarang_hit', 'batarang_return', 'smoke_throw',
    'smoke_burst', 'flash_charge', 'flash_release', 'melee_swing', 'melee_hit', 'gem_collect', 'potion_pickup', 'ability_ready', 'ability_empty', 'ui_tap',
    'bat_screech', 'bat_flap', 'bat_hit', 'bat_die', 'skel_rattle', 'skel_walk', 'skel_hit', 'skel_die', 'skel_thrown_aside', 'slime_squelch', 'slime_burst',
    'boss_roar', 'boss_step', 'boss_slam', 'boss_charge', 'boss_fire_breath', 'boss_hurt', 'boss_dazed', 'boss_death', 'boss_regen', 'barrier_close',
    'barrier_open', 'rock_rumble', 'pit_water_glow', 'pit_heal', 'gate_open', 'gate_slam', 'sandstorm_wind', 'thunder_soft', 'heart_lost', 'heart_gained',
    'low_health_beat', 'aj_hup', 'aj_hya', 'aj_ugh', 'amy_gasp'];
  const missing = required.filter((n) => !SOUNDS[n]);
  check(!missing.length, `all ${required.length} required sound names in the catalog${missing.length ? ` (missing ${missing})` : ''}`);
  const noRecipe = Object.keys(SOUNDS).filter((n) => !RECIPES[n]);
  check(!noRecipe.length, `every catalog sound (${Object.keys(SOUNDS).length}) has a synthesized fallback${noRecipe.length ? ` (none: ${noRecipe})` : ''}`);
  const badLoops = Object.entries(SOUNDS).filter(([n, s]) => s.loop && !AU.loops[n] && !DRONES[n]).map(([n]) => n);
  check(!badLoops.length, `every loop is a pulse loop or a drone${badLoops.length ? ` (${badLoops})` : ''}`);
  const tracks = Object.values(MUSIC).map((m) => m.track);
  check(tracks.every((t) => TRACKS[t]) && Object.keys(MUSIC_LAYERS).every((l) => Object.values(TRACKS).some((t) => t.layers?.[l])),
    `every music section has a synthesized track (${[...new Set(tracks)].join(', ')}) and every layer a part`);
}

// 2) Every recipe, drone and blip builds on a context without errors, with a sensible length.
{
  const ctx = new MockCtx();
  const kit = new SynthKit(ctx);
  const out = ctx.createGain();
  const errors = [];
  let longest = 0;
  for (const [name, r] of Object.entries(RECIPES)) {
    try {
      const n0 = ctx.created;
      const len = r(kit, out, 1, 1);
      if (!(len > 0 && len < 3) || ctx.created === n0) errors.push(`${name}: length ${len}`);
      longest = Math.max(longest, len);
      r(kit, out, 2, 1.5); // (pitched)
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  for (const [name, d] of Object.entries(DRONES)) {
    try { const h = d(kit, out, 1); h.level(0.5, 0); h.stop(1); } catch (e) { errors.push(`drone ${name}: ${e.message}`); }
  }
  for (const [id, c] of Object.entries(AU.voice.characters)) {
    try { if (!(voiceBlip(kit, out, 0, c) > 0)) errors.push(`blip ${id}`); } catch (e) { errors.push(`blip ${id}: ${e.message}`); }
  }
  check(!errors.length, `${Object.keys(RECIPES).length} recipes, ${Object.keys(DRONES).length} drones and ${Object.keys(AU.voice.characters).length} voice blips build (longest ${longest.toFixed(2)} s)${errors.length ? ` — ${errors.join('; ')}` : ''}`);
}

// 3) Music: every section schedules notes; crossfades retire the old one; layers fade in / out.
{
  const ctx = new MockCtx();
  const kit = new SynthKit(ctx);
  const bus = ctx.createGain();
  const loads = [];
  const player = new MusicPlayer(ctx, bus, kit, (name) => { loads.push(name); return null; });
  const run = (secs) => { for (let i = 0; i < secs * 60; i++) { ctx.currentTime += 1 / 60; player.update(); } };
  const notes = {};
  for (const name of Object.keys(MUSIC)) {
    const s0 = ctx.started;
    player.setSection(name);
    run(4);
    notes[name] = ctx.started - s0;
  }
  check(Object.values(notes).every((n) => n > 10), `every section plays notes: ${Object.entries(notes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  check(loads.includes('music_forest') && loads.includes('music_boss'), 'each track first looks for its file (music_<track>)');
  player.setSection('forest');
  run(0.5);
  const fading = player.old.length;
  run(CONFIG.audio.music.fade + 0.5);
  check(fading >= 1 && player.old.length === 0, `a section change crossfades (${fading} fading) and the old one is retired after ${CONFIG.audio.music.fade} s`);
  player.setSection('boss');
  player.setLayer('intense', true);
  run(1);
  const L = player.current.layers.intense;
  player.setLayer('intense', false);
  run(0.1);
  check(L && L.gain.gain.value === 0 && !L.on, 'the boss\'s intense layer fades in and out');
  player.setSection('chase');
  run(2.5);
  player.setSection('sandstorm');
  check(player.current.trackName === 'chase' && player.current.layers.wind?.on && player.old.length === 0, 'chase → sandstorm keeps the track and fades in the wind layer (no crossfade)');
  player.setSection(null);
  run(MU().fade + 0.5);
  check(!player.current && player.old.length === 0, 'silence: everything faded out and retired');
}
function MU() { return CONFIG.audio.music; }

// 4) The AudioManager in a mock browser (no files present): unlock, every name, limits, 3D, duck.
{
  const listeners = {};
  let refuseStorage = true;
  globalThis.window = {
    AudioContext: MockCtx,
    addEventListener: (e, fn) => ((listeners[e] ??= []).push(fn)),
    dispatchEvent: () => true,
    get localStorage() { if (refuseStorage) throw new Error('denied'); return { getItem: () => null, setItem: () => {} }; },
  };
  globalThis.document = { hidden: false, addEventListener: (e, fn) => ((listeners['doc:' + e] ??= []).push(fn)) };
  globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o?.detail; } };
  globalThis.fetch = async () => { throw new Error('offline'); };
  const { AudioManager, Sound, ALIASES } = await import('../src/audio.js');
  const audio = new AudioManager({ files: ['boss_roar.ogg'] }); // (listed, but it fails to load)
  check(!audio.ready && audio.playSound('ui_tap') === false, 'before the first touch: silent, no context, no errors');
  audio.setMusic('forest');
  listeners.touchend.forEach((fn) => fn());
  check(audio.ready && audio.ctx && audio.music.wanted === 'forest', 'the first touch unlocks it and starts the music asked for before');
  const ctx = audio.ctx;
  const advance = (s) => { ctx.currentTime += s; audio.update(s); };
  let played = 0;
  for (const name of Object.keys(SOUNDS)) {
    advance(0.6); // (past every throttle)
    if (audio.playSound(name)) played++;
  }
  check(played === Object.keys(SOUNDS).length && audio.stats.files === 0, `with no files every one of the ${played} names plays its synthesized sound`);
  check(audio.playSound('no_such_sound') === false, 'an unknown name: nothing, no error');
  await audio.loadFile('boss_roar');
  advance(2);
  check(audio.buffers.get('boss_roar') === null && audio.playSound('boss_roar') === true, 'a listed file that fails to load → the synthesized fallback');
  // Throttle.
  advance(1);
  const a1 = audio.playSound('melee_hit');
  const a2 = audio.playSound('melee_hit');
  check(a1 && !a2, 'a repeat inside its throttle is skipped');
  // The voice limit: the quietest goes first.
  advance(3);
  for (let i = 0; i < 40; i++) { ctx.currentTime += 0.001; audio.last = {}; audio.playSound('rock_rumble', { volume: 0.2 + i * 0.02 }); }
  const vols = audio.active.map((x) => x.eff);
  check(audio.active.length <= AU.maxVoices && audio.stats.dropped > 0 && Math.min(...vols) > 0.2 + 10 * 0.02,
    `40 at once: ${audio.active.length} kept (limit ${AU.maxVoices}), the quietest dropped (${audio.stats.dropped})`);
  audio.last = {};
  ctx.currentTime += 0.001;
  check(audio.playSound('rock_rumble', { volume: 0.05 }) === false, '...and a quieter newcomer is the one dropped');
  // 3D: quieter with distance, panned, nothing beyond max.
  audio.setListener({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } }); // at the origin, right = +x
  const near = audio.spatial({ x: 2, y: 0, z: 0 });
  const far = audio.spatial({ x: 40, y: 0, z: 0 });
  const left = audio.spatial({ x: -20, y: 0, z: 0 });
  check(near.gain === 1 && far.gain < 0.2 && far.pan > 0 && left.pan < 0 && audio.spatial({ x: AU.distance.max + 1, y: 0, z: 0 }) === null,
    `distance: 2 → ${near.gain}, 40 → ${far.gain.toFixed(2)} (pan ${far.pan.toFixed(2)}), left pans ${left.pan.toFixed(2)}, beyond ${AU.distance.max} silent`);
  // Loops: a pulse loop re-triggers; untouched it stops.
  advance(1);
  const s0 = ctx.started;
  for (let i = 0; i < 60; i++) { audio.setLoop('h', 'hoof_gallop', { rate: 1 }); advance(1 / 60); }
  const hits = ctx.started - s0;
  for (let i = 0; i < 30; i++) advance(1 / 60);
  check(hits > 4 && !audio.loops.has('h'), `the gallop loop hits ${hits} times a second; left untouched it stops`);
  audio.setLoop('w', 'sandstorm_wind', { volume: 0.5 });
  check(audio.loops.get('w')?.drone, 'the sandstorm wind is a continuous drone');
  // Duck.
  audio.duck('cutscene', true);
  const ducked = audio.duckGain.gain.value;
  audio.duck('cutscene', false);
  check(Math.abs(ducked - (1 - AU.music.duck)) < 1e-9 && audio.duckGain.gain.value === 1, `the music ducks to ${ducked} in a cutscene and comes back`);
  // Settings with a refusing localStorage.
  let ok = true;
  try { audio.setVolume('music', 0.3); audio.setMuted(true); audio.setMuted(false); } catch { ok = false; }
  refuseStorage = false;
  check(ok && audio.settings.music === 0.3, 'volume and mute work even when localStorage refuses (not saved)');
  // Voices: no file → blips; visibility pause.
  check(audio.playVoice('aj', 'girlScene_safe') === false, 'a voice line without a file → blips');
  audio.voiceBlip('amy');
  listeners['doc:visibilitychange'].forEach((fn) => { document.hidden = true; fn(); });
  check(ctx.state === 'suspended', 'a hidden tab suspends the audio');
  listeners['doc:visibilitychange'].forEach((fn) => { document.hidden = false; fn(); });
  check(ctx.state === 'running', '...and it resumes when the tab is back');
  // The facade: counts as before, old names → catalog names.
  const sound = new Sound(audio);
  sound.play('splashEnter');
  const bad = Object.entries(ALIASES).flatMap(([k, v]) => v.filter(([n]) => !SOUNDS[n]).map(([n]) => `${k}→${n}`));
  check(sound.counts.splashEnter === 1 && !bad.length, `the old event names still count and map to catalog names${bad.length ? ` (bad: ${bad})` : ''}`);

  // 5) The soundscape: music sections and loops from the game's state, events from changes.
  const { Soundscape, LINE_IDS } = await import('../src/soundscape.js');
  const calls = [];
  const fake = {
    setListener() {}, setMusic(s) { this.music = s; }, setMusicLayer(l, on) { this.layers[l] = on; }, duck() {}, update() {},
    setLoop(key, name, o) { calls.push(['loop', key, name, o]); }, playSound(name, o) { calls.push(['play', name, o]); return true; },
    playVoice() {}, voiceBlip() {}, spatial: () => ({ gain: 1, pan: 0 }), layers: {},
  };
  const V = (x = 0, y = 0, z = 0) => ({ x, y, z, distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); } });
  const STATES = { INTRO: 'intro', PLAY: 'play', CUTSCENE: 'cutscene', GAMEOVER: 'gameover', ENDING: 'ending' };
  const game = {
    STATES, state: { current: 'play' },
    story: { phase: 'forest', gateStarted: false, desertChaseActive: false, stormLevel: 0 },
    hero: { position: V(-15, 0, 6), velocity: V(), grounded: true },
    horse: { speed: 0, grounded: true, galloping: false, inWater: false, fled: false, mode: 'idle', everMounted: true, controlsHero: false, position: V(-15, 0, 6), velocity: V(), model: { visible: true } },
    boss: { state: 'guard', alive: true, active: false, hp: 100, maxHp: 100, position: V(114, 0, 0), fireOrigin: V(), defeated: false, girl: { visible: false } },
    minions: { list: [] }, storm: { strength: 0 }, gate: { opening: false, puppets: [] },
    lives: { hearts: 5, dead: false, respawns: 3 }, abilities: { energy: 1 }, arena: { sealed: false, state: 'open' },
    cam: { camera: {}, shake() {} }, cinematic: { active: false, typing: false },
  };
  const sc = new Soundscape(fake, game);
  const step = () => sc.update(1 / 60);
  const music = () => { step(); return fake.music; };
  const sections = {};
  sections.forest = music();
  game.minions.list.push({ type: 'bat', alive: true, state: 'hold', position: V(-10, 3, 6) });
  sections.bats = music();
  game.minions.list.length = 0;
  for (let i = 0; i < 300; i++) step();
  sections.backToForest = fake.music;
  game.hero.position = V(90, 0, 0);
  sections.boss = music();
  game.boss.hp = 40; game.boss.active = true;
  step();
  const intense = fake.layers.intense;
  game.boss.defeated = true; game.boss.active = false;
  game.story.phase = 'pit';
  sections.pit = music();
  game.story.phase = 'desert'; game.story.desertChaseActive = true;
  sections.chase = music();
  game.story.stormLevel = 1;
  sections.sandstorm = music();
  game.story.gateStarted = true;
  sections.gate = music();
  game.state.current = 'ending';
  sections.ending = music();
  game.state.current = 'intro';
  sections.title = music();
  check(sections.forest === 'forest' && sections.bats === 'bats' && sections.backToForest === 'forest' && sections.boss === 'boss' && intense && sections.pit === 'pit'
    && sections.chase === 'chase' && sections.sandstorm === 'sandstorm' && sections.gate === 'gate' && sections.ending === 'ending' && sections.title === null,
    `music by part of the story: ${Object.entries(sections).map(([k, v]) => `${k}→${v}`).join(', ')}; the intense layer below half health (${intense})`);
  // Gait loops by speed.
  game.state.current = 'play';
  const gait = (speed, galloping = false) => { calls.length = 0; game.horse.speed = speed; game.horse.galloping = galloping; step(); return calls.find((c) => c[1] === 'hooves')?.[2] ?? null; };
  const g = [gait(0), gait(3), gait(12), gait(17.5, true), gait(30)];
  check(g[0] === null && g[1] === 'hoof_walk' && g[2] === 'hoof_trot' && g[3] === 'hoof_gallop' && g[4] === 'hoof_gallop', `hooves follow the horse's speed: 0 → none, 3 → ${g[1]}, 12 → ${g[2]}, galloping → ${g[3]}`);
  game.horse.speed = 0;
  // Events seen as changes.
  const playedNow = (fn) => { calls.length = 0; fn(); step(); return calls.filter((c) => c[0] === 'play').map((c) => c[1]); };
  step();
  const jump = playedNow(() => { game.hero.grounded = false; game.hero.velocity.y = 9; });
  for (let i = 0; i < 30; i++) step();
  const land = playedNow(() => { game.hero.grounded = true; game.hero.velocity.y = 0; });
  const hurt = playedNow(() => { game.lives.hearts = 4.5; });
  const beat = (() => { calls.length = 0; game.lives.hearts = 1; step(); return calls.some((c) => c[2] === 'low_health_beat'); })();
  const death = playedNow(() => { game.lives.hearts = 0; game.lives.dead = true; });
  const revive = playedNow(() => { game.lives.hearts = 5; game.lives.dead = false; game.lives.respawns = 2; });
  const mount = playedNow(() => { game.horse.mode = 'mounting'; });
  game.boss.defeated = false; game.boss.state = 'guard';
  step();
  const roar = playedNow(() => { game.boss.state = 'chase'; game.boss.girl.visible = true; });
  const slam = playedNow(() => { game.boss.state = 'slam'; });
  const skel = playedNow(() => { game.minions.list.push({ type: 'skeleton', alive: true, state: 'spawn', position: V(5, 0, 5) }); });
  const skelDie = playedNow(() => { game.minions.list[0].alive = false; });
  check(jump.includes('aj_jump') && jump.includes('aj_hup') && land.includes('aj_land') && hurt.includes('heart_lost') && beat && death.includes('aj_death')
    && revive.includes('aj_revive') && mount.includes('aj_mount') && roar.includes('boss_roar') && roar.includes('amy_gasp') && slam.includes('boss_slam')
    && skel.includes('skel_rattle') && skelDie.includes('skel_die'),
    `events from changes: jump [${jump}], land [${land}], hurt [${hurt}], heartbeat ${beat}, death [${death}], revive [${revive}], mount [${mount}], roar [${roar}], slam [${slam}], skeleton [${skel}] / [${skelDie}]`);
  // Voice ids for every cutscene line.
  const lines = [...Object.entries(DIALOGUE.girlScene), ...Object.entries(DIALOGUE.pitScene)].filter(([k, v]) => typeof v === 'string' && !/cue$/i.test(k));
  check(lines.every(([, t]) => LINE_IDS.has(t)), `a voice id for each of the ${lines.length} cutscene lines (e.g. ${LINE_IDS.get(DIALOGUE.girlScene.safe)})`);
}

// 6) public/audio/README.md lists every name and is up to date.
{
  const file = readFileSync(new URL('../public/audio/README.md', import.meta.url), 'utf8');
  const listed = Object.keys(SOUNDS).every((n) => file.includes(`| ${n}`));
  check(file === buildAudioReadme() && listed, 'public/audio/README.md is up to date (npm run audio:readme) and lists every sound');
}

console.log(failed ? '\nAUDIO TEST FAILED' : '\nAUDIO TEST PASSED');
process.exit(failed ? 1 : 0);
