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
  createOscillator() { this.oscs = (this.oscs ?? 0) + 1; return this.#node('osc', { type: 'sine', frequency: param(440), detune: param(0) }); }
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
    'low_health_beat', 'aj_hup', 'aj_hya', 'aj_ugh', 'amy_gasp', 'horse_scream', 'horse_breath', 'river_flow'];
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

// 2b) No drum thumps: the water and the hooves are noise only (no pitched low oscillator); the
//     boss's steps and the heartbeat are soft; the horse's whinnies sweep up then down.
{
  const ctx = new MockCtx();
  const kit = new SynthKit(ctx);
  const out = ctx.createGain();
  const oscs = (name) => { const o0 = ctx.oscs ?? 0; RECIPES[name](kit, out, 0, 1); return (ctx.oscs ?? 0) - o0; };
  const noOsc = ['river_splash', 'hoof_walk', 'hoof_trot', 'hoof_gallop'].map((n) => [n, oscs(n)]);
  check(noOsc.every(([, n]) => n === 0), `water and hooves are soft noise, no thumping oscillator: ${noOsc.map(([n, c]) => `${n} ${c}`).join(', ')}`);
  // Peak gain of the boss's step and the heartbeat (the envelopes' top values).
  const peak = (name) => {
    let top = 0;
    const orig = kit.env.bind(kit);
    kit.env = (o, t, a, d, v) => { top = Math.max(top, v); return orig(o, t, a, d, v); };
    RECIPES[name](kit, out, 0, 1);
    kit.env = orig;
    return top;
  };
  const soft = ['boss_step', 'low_health_beat', 'horse_neigh', 'horse_scream'].map((n) => [n, peak(n)]);
  check(soft.every(([, v]) => v <= 0.45), `soft levels: ${soft.map(([n, v]) => `${n} ${v}`).join(', ')}`);
  // The whinny: a sawtooth swept up then down (the scream with two peaks), with a vibrato.
  const sweep = (name) => {
    const ramps = [];
    const o0 = ctx.createOscillator;
    ctx.createOscillator = function () { const o = o0.call(this); const f = o.frequency; const lin = f.linearRampToValueAtTime.bind(f); f.linearRampToValueAtTime = (v, tt) => { ramps.push(v); return lin(v, tt); }; const set = f.setValueAtTime.bind(f); f.setValueAtTime = (v, tt) => { if (!ramps.length) ramps.push(v); return set(v, tt); }; return o; };
    RECIPES[name](kit, out, 0, 1);
    ctx.createOscillator = o0;
    let peaks = 0;
    for (let i = 1; i < ramps.length - 1; i++) if (ramps[i] > ramps[i - 1] && ramps[i] > ramps[i + 1]) peaks++;
    return { peaks, top: Math.max(...ramps) };
  };
  const n = sweep('horse_neigh');
  const s = sweep('horse_scream');
  check(n.peaks === 1 && s.peaks === 2 && s.top > n.top, `the neigh sweeps up then down (1 peak, ${n.top} Hz); the scream is higher with 2 peaks (${s.top} Hz)`);
}

// 2c) Part 2: every Gearhaven / portal / robot / Amy / Fire-level name, soft and pleasant (low
//     peaks, the rail grind's pitch following the horse's speed), its music sections, no drum kit
//     in Gearhaven's tracks (soft ticks and tocks only), Tick's chirps and Amy's hushed blips.
const PART2_SOUNDS = ['portal_open', 'portal_pull', 'gear_whoosh', 'clock_tick', 'gear_turn', 'steam_hiss', 'factory_hum', 'rail_land', 'rail_grind', 'rail_leave',
  'steam_vent', 'steam_launch', 'hammer_swing', 'hammer_hit', 'saw_spin', 'conveyor_belt', 'gear_collect', 'gear_spin_pickup', 'horse_clank', 'horse_stumble',
  'tick_beep', 'tick_hover', 'robot_walk', 'robot_swing', 'robot_hit', 'robot_die', 'robot_alert', 'boss_mech_step', 'boss_mech_roar', 'boss_mech_death',
  'element_collect', 'element_power_up', 'amy_magic_cast', 'amy_hit_reflect', 'amy_eyes_glow', 'amy_gasp', 'clock_chime', 'clock_stop_warning',
  'chest_open', 'chest_locked', 'cog_key_collect', 'elixir_drink', 'fire_blast_cast', 'fire_blast_hit', 'burn_loop', 'furnace_guardian_stomp',
  'furnace_guardian_steam_burst', 'furnace_guardian_charge', 'furnace_guardian_roar', 'stomp_warning', 'gear_roll', 'cog_key_sparkle', 'steam_barrier_close', 'steam_barrier_open', 'element_orb_hum'];
const PART2_MUSIC = ['part2_portal', 'gearhaven', 'gearhaven_chase', 'element_fire', 'element_lightning', 'element_steam', 'element_magnet', 'element_time', 'amy_theme', 'final_fight', 'part2_end'];
{
  const missing = PART2_SOUNDS.filter((n) => !SOUNDS[n] || !RECIPES[n]);
  check(!missing.length, `all ${PART2_SOUNDS.length} Part 2 sound names in the catalog with a fallback${missing.length ? ` (missing ${missing})` : ''}`);
  const loops = ['gear_roll', 'clock_tick', 'gear_turn', 'steam_hiss', 'factory_hum', 'rail_grind', 'saw_spin', 'conveyor_belt', 'horse_clank', 'tick_hover', 'burn_loop', 'element_orb_hum'];
  check(loops.every((n) => SOUNDS[n].loop && (AU.loops[n] || DRONES[n])), `Part 2's loops (${loops.length}) are pulse loops or drones`);
  const ctx = new MockCtx();
  const kit = new SynthKit(ctx);
  const out = ctx.createGain();
  const peak = (name) => {
    let top = 0;
    const orig = kit.env.bind(kit);
    kit.env = (o, t, a, d, v) => { top = Math.max(top, v); return orig(o, t, a, d, v); };
    RECIPES[name](kit, out, 0, 1);
    kit.env = orig;
    return top;
  };
  const loud = PART2_SOUNDS.map((n) => [n, peak(n)]).filter(([, v]) => v > 0.4);
  const ambience = ['clock_tick', 'horse_clank', 'robot_walk', 'boss_mech_step', 'tick_beep'].map((n) => [n, peak(n)]);
  check(!loud.length && ambience.every(([, v]) => v <= 0.3), `soft: no Part 2 sound peaks above 0.4${loud.length ? ` (${loud.map(([n, v]) => `${n} ${v}`)})` : ''}; the repeating ones softer still (${ambience.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(', ')})`);
  const g = DRONES.rail_grind(kit, out, 1);
  const pitched = typeof g.pitch === 'function' && (g.pitch(1.2, 0), true);
  g.stop(0);
  check(pitched && ['gear_roll', 'gear_turn', 'factory_hum', 'saw_spin', 'conveyor_belt', 'tick_hover', 'element_orb_hum'].every((n) => typeof DRONES[n](kit, out, 1).pitch === 'function'),
    'the rail grind (and the hums) can follow the horse\'s speed in pitch');
  const kitDrums = PART2_MUSIC.filter((t) => [TRACKS[t], ...Object.values(TRACKS[t]?.layers ?? {})].some((pt) => pt?.drums && ['kick', 'snare', 'hat', 'tom'].some((d) => pt.drums[d])));
  const tracks = Object.values(MUSIC).map((m) => m.track);
  check(PART2_MUSIC.every((t) => TRACKS[t] && tracks.includes(t)) && !kitDrums.length && TRACKS.element_fire.layers?.boss,
    `Part 2's music sections (${PART2_MUSIC.join(', ')}) — no drum kit in any (soft ticks / tocks / shakers)${kitDrums.length ? ` (drums: ${kitDrums})` : ''}; the Fire level's theme builds in its boss fight (layer)`);
  check(AU.music.phases.stub === 'gearhaven' && ['part2Portal', 'gearhaven', 'gearhavenChase', 'amyTheme', 'finalFight', 'part2End'].every((k) => AU.music.phases[k]), 'the story phases map to them (a stub level reuses Gearhaven\'s theme)');
  const V = AU.voice.characters;
  check(V.tick.sound === 'tick_beep' && V.tick.charsPerBlip === 1 && V.tick.freq > V.aj.freq && V.amy2.freq < V.amy.freq && V.amy2.charsPerBlip > (V.amy.charsPerBlip ?? AU.voice.charsPerBlip) && V.amy2.volume < V.amy.volume && JSON.stringify(V.aj) === JSON.stringify(CONFIG.audio.voice.characters.aj),
    `voices: Tick a quick high chirp per letter (tick_beep), Amy in Part 2 lower, slower and hushed (${V.amy2.freq} Hz every ${V.amy2.charsPerBlip} letters vs ${V.amy.freq} / ${V.amy.charsPerBlip ?? AU.voice.charsPerBlip}), AJ unchanged`);
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
  // A speaker whose place is known (Part 2's Tick): the blip pans toward him.
  audio.voiceBlip('tick', { x: 6, y: 0, z: 0 });
  const tickPan = audio.lastBlipPan;
  audio.voiceBlip('tick', { x: -6, y: 0, z: 0 });
  check(audio.lastBlipSound === 'tick_beep', 'Tick\'s blips are his tick_beep chirps (its file if there is one)');
  check(tickPan > 0.1 && audio.lastBlipPan < -0.1, `a speaker's blips come from where they stand (Tick on the right pans ${tickPan.toFixed(2)}, on the left ${audio.lastBlipPan.toFixed(2)})`);
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
    // (the horse calls go through playSound: honour its throttle like the real one)
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
  // The horse's voice: galloping, a call every horseCallMin…horseCallMax s, never the same twice
  // in a row, never in dialogue; calls at moments; the breath loop on low energy; the river.
  {
    game.state.current = 'play';
    game.story.phase = 'forest'; game.story.gateStarted = false; game.story.desertChaseActive = false; game.story.stormLevel = 0;
    game.minions.list.length = 0;
    game.horse.controlsHero = true; game.horse.mode = 'riding'; game.horse.galloping = true; game.horse.speed = 35; game.horse.stumbles = 0;
    game.horse.energy = 100;
    for (let i = 0; i < 3; i++) step();
    calls.length = 0;
    const T = 120;
    for (let i = 0; i < T * 60; i++) step();
    const horseCalls = calls.filter((c) => c[0] === 'play' && (c[1] === 'horse_neigh' || c[1] === 'horse_scream'));
    let repeats = 0;
    for (let i = 1; i < horseCalls.length; i++) if (horseCalls[i][1] === horseCalls[i - 1][1]) repeats++;
    const lo = Math.floor(T / AU.horseCallMax), hi = Math.ceil(T / AU.horseCallMin) + 1;
    check(horseCalls.length >= lo && horseCalls.length <= hi && repeats === 0,
      `galloping 2 min: ${horseCalls.length} calls (${lo}…${hi} for every ${AU.horseCallMin}–${AU.horseCallMax} s), never the same twice in a row (${horseCalls.map((c) => c[1].replace('horse_', '')).join(' ')})`);
    calls.length = 0;
    game.cinematic.active = true; game.cinematic.typing = true;
    for (let i = 0; i < 30 * 60; i++) step();
    const inDialogue = calls.filter((c) => c[0] === 'play' && c[1].startsWith('horse_')).length;
    game.cinematic.active = false; game.cinematic.typing = false;
    check(inDialogue === 0, `no horse calls during dialogue (30 s: ${inDialogue})`);
    const moment = (fn) => { sc.lastCallAt = -Infinity; calls.length = 0; fn(); step(); return calls.filter((c) => c[0] === 'play' && c[1].startsWith('horse_')).map((c) => c[1]); };
    const bat = moment(() => sc.onBatAttack());
    const stumble = moment(() => { game.horse.stumbles++; });
    game.boss.position = V(game.horse.position.x + 10, 0, game.horse.position.z);
    const roar = moment(() => sc.onBossRoar());
    const skel = moment(() => { sc.lastSkelAt = -Infinity; game.minions.list.push({ type: 'skeleton', alive: true, state: 'spawn', position: V(3, 0, 3) }); });
    const storm = moment(() => { game.storm.strength = 1; });
    game.storm.strength = 0;
    step();
    const land = moment(() => { game.horse.grounded = false; for (let i = 0; i < 40; i++) step(); game.horse.grounded = true; });
    check(bat.length && stumble.length && roar.length && skel.length && storm.includes('horse_scream') && land.includes('horse_snort'),
      `horse calls at moments: bat attack [${bat}], stumble [${stumble}], boss roar [${roar}], skeleton group [${skel}], sandstorm [${storm}], big landing [${land}]`);
    calls.length = 0;
    game.horse.energy = 10;
    step();
    const breath = calls.some((c) => c[0] === 'loop' && c[2] === 'horse_breath');
    game.horse.energy = 100;
    calls.length = 0;
    step();
    const breathAfter = calls.some((c) => c[0] === 'loop' && c[2] === 'horse_breath');
    game.horse.inWater = true;
    calls.length = 0;
    step();
    const water = calls.find((c) => c[0] === 'loop' && c[2] === 'river_flow');
    game.horse.inWater = false;
    check(breath && !breathAfter && water && water[3].volume === AU.riverSoundVolume,
      `heavy breathing while the energy is low (stops when it recovers); a quiet river_flow loop in the water (volume ${water?.[3].volume})`);
  }
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
