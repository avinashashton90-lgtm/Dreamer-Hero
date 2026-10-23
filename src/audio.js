import { CONFIG } from './config.js';
import { SOUNDS } from './soundCatalog.js';
import { SynthKit, RECIPES, DRONES, voiceBlip } from './sfx.js';
import { MusicPlayer } from './music.js';

// Sound. Game systems call `sound.play(name)` at their event points (the `Sound` facade below:
// it counts every call — the headless tests read `counts` — broadcasts a `dreamer-sound` window
// event and hands it to the AudioManager when there is one). The AudioManager (browser only)
// plays every name in soundCatalog.js through the Web Audio API: a file
// public/audio/<name>.ogg / .mp3 if the build saw one (main passes the list), else the
// synthesized fallback (sfx.js) — so the game always has sound and a missing file never
// crashes anything. Music (music.js), voices and efforts, three volume groups, 3D distance /
// pan, a voice limit, throttling, ducking, unlock on the first touch and pause when hidden.
// The per-frame wiring (loops, music sections, detected events) lives in soundscape.js.

const AU = CONFIG.audio;

/**
 * Older event names some systems still use → catalog names (with options). Each one plays every
 * listed sound.
 */
export const ALIASES = {
  // (the river: one soft splash entering it, then the quiet river_flow loop — soundscape.js)
  splashStep: [],
  splashEnter: [['river_splash', { volume: AU.riverSoundVolume }]],
  splashExit: [],
  stumble: [['stumble']], // (the horse's snort / neigh: soundscape.js horse calls)
  gallopStart: [], // (the gallop calls: soundscape.js)
  eerie: [['thunder_soft']],
  hum: [['pit_water_glow']],
  heal: [['pit_heal']],
  batScreech: [['bat_screech']],
  rescuePulse: [['rescue_pulse']],
  rearUp: [['horse_scream', { volume: AU.horse.volume }]],
  gateSlam: [['gate_slam']],
  bossRoar: [['boss_roar']],
  wallThud: [['rock_rumble', { volume: 0.6 }]],
  potion: [['potion_pickup'], ['potion_drink', { delay: 0.15 }]],
  oasisSplash: [['river_splash', { volume: AU.riverSoundVolume }], ['potion_drink', { delay: 0.3 }]],
  barrierRumble: [['rock_rumble']],
  horseHurt: [['horse_hurt']],
  horseFlee: [['horse_scream', { volume: AU.horse.volume }]],
  paralyze: [], // (soundscape.js plays boss_dazed for the boss)
};

/** The facade every system holds: counts + event + (in the browser) the AudioManager. */
export class Sound {
  /** @param {AudioManager|null} [manager] */
  constructor(manager = null) {
    this.counts = {};
    this.muted = false;
    this.manager = manager;
  }

  /** @param {string} name  @param {{ volume?, pitch?, position?, delay? }} [detail] */
  play(name, detail = {}) {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    if (this.muted || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('dreamer-sound', { detail: { name, ...detail } }));
    const m = this.manager;
    if (!m) return;
    const alias = ALIASES[name];
    if (alias) for (const [n, o] of alias) m.playSound(n, { ...o, ...detail });
    else m.playSound(name, detail);
  }
}

/** Saved settings (volumes, mute), in localStorage behind try/catch (private modes refuse it). */
function loadSettings() {
  const def = { muted: false, music: AU.volumes.music, effects: AU.volumes.effects, voices: AU.volumes.voices };
  try {
    const raw = window.localStorage?.getItem(AU.storageKey);
    if (!raw) return def;
    const s = JSON.parse(raw);
    const num = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
    return { muted: !!s.muted, music: num(s.music, def.music), effects: num(s.effects, def.effects), voices: num(s.voices, def.voices) };
  } catch {
    return def;
  }
}

export class AudioManager {
  /** @param {{ files?: string[] }} [opts]  files: paths under public/audio/ the build found (virtual:audio-files) */
  constructor({ files = [] } = {}) {
    this.available = new Set(files);
    this.settings = loadSettings();
    this.ctx = null; // created on the first touch / key (phones only allow audio after one)
    this.ready = false;
    this.buffers = new Map(); // key → AudioBuffer | null (no file / failed) | Promise (loading)
    this.active = []; // one-shots: { eff, end, out, src? }
    this.loops = new Map(); // key → loop
    this.last = {}; // name → audio time last played (throttle)
    this.duckReasons = new Set();
    this.wantMusic = null;
    this.wantLayers = new Map();
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
    this.voiceLine = null; // { file: boolean } the line being spoken
    this.stats = { played: {}, dropped: 0, throttled: 0, files: 0, synth: 0, missing: 0 };
    if (typeof window !== 'undefined') this.#installUnlock();
  }

  // --- setup ---

  #installUnlock() {
    // (kept for good: a phone may interrupt the audio later — the next touch resumes it)
    const unlock = () => {
      if (!this.ready || (this.ctx && this.ctx.state !== 'running' && !document.hidden)) this.#unlock();
    };
    // (touchend / pointerup / click / keydown are what browsers count as a user gesture)
    for (const e of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'mousedown']) window.addEventListener(e, unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  /** Create / resume the AudioContext inside a user gesture. */
  #unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          this.ready = true; // (no Web Audio: stay silent, stop asking — every call is a no-op)
          return;
        }
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.#build();
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      // (iOS: a silent buffer played inside the gesture unlocks output)
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start();
      if (!this.ready) {
        this.ready = true;
        if (this.wantMusic && this.music) this.music.setSection(this.wantMusic);
        for (const [l, on] of this.wantLayers) this.music.setLayer(l, on);
        this.#preload();
      }
    } catch (e) {
      console.warn('[audio] could not start', e);
      this.ready = true;
    }
  }

  #build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // (keeps many sounds at once from clipping)
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.groups = { music: ctx.createGain(), effects: ctx.createGain(), voices: ctx.createGain() };
    this.duckGain = ctx.createGain();
    this.groups.music.connect(this.duckGain).connect(this.master);
    this.groups.effects.connect(this.master);
    this.groups.voices.connect(this.master);
    this.kit = new SynthKit(ctx);
    this.music = new MusicPlayer(ctx, this.groups.music, this.kit, (name) => this.loadFile(name));
    this.#applyVolumes();
  }

  /** After unlocking: fetch the files the build found, one at a time in the background. */
  #preload() {
    const names = [...new Set([...this.available].map((f) => f.replace(/\.[a-z0-9]+$/i, '')))];
    const next = () => {
      const n = names.shift();
      if (!n) return;
      const p = this.loadFile(n);
      (p ?? Promise.resolve()).finally(() => setTimeout(next, 30));
    };
    setTimeout(next, 200);
  }

  // --- settings ---

  #applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : AU.volumes.master, t, 0.03);
    for (const g of ['music', 'effects', 'voices']) this.groups[g].gain.setTargetAtTime(s[g], t, 0.03);
  }

  #save() {
    try {
      window.localStorage?.setItem(AU.storageKey, JSON.stringify(this.settings));
    } catch {
      /* (storage refused: the settings just aren't remembered) */
    }
  }

  setVolume(group, v) {
    this.settings[group] = Math.max(0, Math.min(1, v));
    this.#applyVolumes();
    this.#save();
  }

  setMuted(on) {
    this.settings.muted = !!on;
    this.#applyVolumes();
    this.#save();
  }

  // --- files ---

  /**
   * The file for `key` (a sound name, music_<track>, voice/<id>): a Promise of its AudioBuffer
   * (null if it fails to load or decode), or null when the build saw no such file.
   */
  loadFile(key) {
    if (this.buffers.has(key)) {
      const v = this.buffers.get(key);
      return v instanceof Promise ? v : Promise.resolve(v);
    }
    const paths = AU.extensions.map((e) => `${key}.${e}`).filter((p) => this.available.has(p));
    if (!paths.length || !this.ctx) return null;
    const p = (async () => {
      for (const path of paths) {
        try {
          const res = await fetch(`audio/${path}`);
          if (!res.ok) continue;
          const data = await res.arrayBuffer();
          const buf = await new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
          if (buf) return buf;
        } catch {
          /* (a broken or unsupported file: try the next extension, else the synthesized sound) */
        }
      }
      this.stats.missing++;
      return null;
    })().then((buf) => {
      this.buffers.set(key, buf);
      return buf;
    });
    this.buffers.set(key, p);
    return p;
  }

  /** A loaded buffer for `key` right now, or null (none, still loading, failed). Starts loading. */
  #buffer(key) {
    const v = this.buffers.get(key);
    if (v instanceof Promise) return null;
    if (v !== undefined) return v;
    this.loadFile(key);
    return null;
  }

  hasFile(key) {
    return AU.extensions.some((e) => this.available.has(`${key}.${e}`));
  }

  // --- 3D ---

  /** The camera is the listener: position and its right-hand direction (for the pan). */
  setListener(camera) {
    const e = camera.matrixWorld.elements;
    const L = this.listener;
    L.x = e[12];
    L.y = e[13];
    L.z = e[14];
    L.rx = e[0];
    L.ry = e[1];
    L.rz = e[2];
  }

  /** Distance gain and pan for a world position, or null when it is too far to hear. */
  spatial(p) {
    const L = this.listener;
    const D = AU.distance;
    const dx = p.x - L.x;
    const dy = p.y - L.y;
    const dz = p.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > D.max) return null;
    const gain = d <= D.ref ? 1 : D.ref / (D.ref + D.rolloff * (d - D.ref));
    const pan = d < 0.01 ? 0 : Math.max(-1, Math.min(1, ((dx * L.rx + dy * L.ry + dz * L.rz) / d) * D.pan));
    return { gain, pan };
  }

  #route(group, gain, pan) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = gain;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p).connect(this.groups[group]);
      out.panner = p;
    } else out.connect(this.groups[group]);
    return out;
  }

  // --- one-shots ---

  /**
   * Play a sound by name. Missing names / files never throw: no file → the synthesized fallback;
   * no fallback either → nothing. Returns true if it plays.
   * @param {string} name
   * @param {{ volume?: number, pitch?: number, position?: {x,y,z}, delay?: number, group?: string }} [o]
   */
  playSound(name, { volume = 1, pitch = 1, position = null, delay = 0, group = null } = {}) {
    if (!this.ready || !this.ctx) return false;
    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const minGap = AU.throttle[name] ?? AU.throttle.default;
      if (this.last[name] !== undefined && now - this.last[name] < minGap) {
        this.stats.throttled++;
        return false;
      }
      let gain = volume;
      let pan = 0;
      if (position) {
        const s = this.spatial(position);
        if (!s) return false;
        gain *= s.gain;
        pan = s.pan;
      }
      if (gain < 0.004) return false;
      // The voice limit: when full, the quietest goes (or this one, if it's the quietest).
      this.#purge(now);
      if (this.active.length >= AU.maxVoices) {
        let q = this.active[0];
        for (const a of this.active) if (a.eff < q.eff) q = a;
        if (gain <= q.eff) {
          this.stats.dropped++;
          return false;
        }
        this.#steal(q, now);
      }
      const buf = this.#buffer(name);
      const recipe = RECIPES[name];
      if (!buf && !recipe) return false;
      this.last[name] = now;
      const out = this.#route(group ?? SOUNDS[name]?.group ?? 'effects', gain, pan);
      const t = now + delay;
      const entry = { eff: gain, out, end: 0, src: null };
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = pitch;
        src.connect(out);
        src.start(t);
        entry.src = src;
        entry.end = t + buf.duration / pitch + 0.05;
        this.stats.files++;
      } else {
        entry.end = t + recipe(this.kit, out, t, pitch) + 0.15;
        this.stats.synth++;
      }
      this.active.push(entry);
      this.stats.played[name] = (this.stats.played[name] ?? 0) + 1;
      return true;
    } catch (e) {
      console.warn('[audio]', name, e);
      return false;
    }
  }

  #purge(now) {
    if (!this.active.length) return;
    this.active = this.active.filter((a) => {
      if (a.end > now) return true;
      a.out.disconnect();
      return false;
    });
  }

  /** Drop a one-shot for a louder newcomer: a quick fade, out of the count at once. */
  #steal(a, now) {
    a.out.gain.setTargetAtTime(0, now, AU.voiceStealFade / 3);
    this.active.splice(this.active.indexOf(a), 1);
    const out = a.out;
    setTimeout(() => out.disconnect(), AU.voiceStealFade * 4000);
    this.stats.dropped++;
  }

  // --- loops ---

  /**
   * Keep a loop running (call every frame while it should play; untouched for a moment it fades
   * out by itself). `key` names this loop (one sound may loop at several keys).
   * @param {{ volume?: number, rate?: number, pitch?: number, position?: {x,y,z} }} [o]
   */
  setLoop(key, name, { volume = 1, rate = 1, pitch = 1, position = null } = {}) {
    if (!this.ready || !this.ctx) return;
    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      let gain = volume * (AU.loops[name]?.volume ?? 1);
      let pan = 0;
      if (position) {
        const s = this.spatial(position);
        gain = s ? gain * s.gain : 0;
        pan = s?.pan ?? 0;
      }
      let L = this.loops.get(key);
      if (L && L.name !== name) {
        this.#stopLoop(L, now);
        L = null;
      }
      if (!L) {
        L = this.#startLoop(key, name, pitch);
        if (!L) return;
      }
      L.touched = now;
      L.rate = rate;
      L.out.gain.setTargetAtTime(gain, now, 0.08);
      if (L.out.panner) L.out.panner.pan.setTargetAtTime(pan, now, 0.08);
      if (L.src) L.src.playbackRate.setTargetAtTime(pitch * (L.pulse ? rate : 1), now, 0.1);
    } catch (e) {
      console.warn('[audio] loop', name, e);
    }
  }

  stopLoop(key) {
    const L = this.loops.get(key);
    if (L && this.ctx) this.#stopLoop(L, this.ctx.currentTime);
  }

  #startLoop(key, name, pitch) {
    const ctx = this.ctx;
    const buf = this.#buffer(name);
    const out = ctx.createGain();
    out.gain.value = 0;
    if (ctx.createStereoPanner) {
      out.panner = ctx.createStereoPanner();
      out.connect(out.panner).connect(this.groups[SOUNDS[name]?.group ?? 'effects']);
    } else out.connect(this.groups[SOUNDS[name]?.group ?? 'effects']);
    const L = { key, name, out, touched: ctx.currentTime, rate: 1, pitch, acc: 0, pulse: !!AU.loops[name] };
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = pitch;
      src.connect(out);
      src.start();
      L.src = src;
    } else if (DRONES[name]) {
      L.drone = DRONES[name](this.kit, out, pitch);
      L.drone.level(1, ctx.currentTime);
    } else if (RECIPES[name] && AU.loops[name]) {
      L.acc = AU.loops[name].period; // (the first hit at once)
    } else return null;
    this.loops.set(key, L);
    return L;
  }

  #stopLoop(L, now) {
    L.out.gain.setTargetAtTime(0, now, 0.08);
    L.drone?.stop(now);
    try {
      L.src?.stop(now + 0.4);
    } catch {
      /* (already stopped) */
    }
    const out = L.out;
    setTimeout(() => out.disconnect(), 700);
    this.loops.delete(L.key);
  }

  // --- music ---

  /** The music section (soundCatalog MUSIC key) or null; crossfades. Remembered until unlocked. */
  setMusic(section) {
    this.wantMusic = section;
    if (this.music) this.music.setSection(section);
  }

  setMusicLayer(layer, on) {
    this.wantLayers.set(layer, on);
    if (this.music) this.music.setLayer(layer, on);
  }

  get musicSection() {
    return this.wantMusic;
  }

  /** Music ducked (by CONFIG.audio.music.duck) while any reason holds: voice lines, cutscenes. */
  duck(reason, on) {
    const had = this.duckReasons.size > 0;
    if (on) this.duckReasons.add(reason);
    else this.duckReasons.delete(reason);
    const has = this.duckReasons.size > 0;
    if (had === has || !this.ctx) return;
    const t = this.ctx.currentTime;
    const M = AU.music;
    this.duckGain.gain.setTargetAtTime(has ? 1 - M.duck : 1, t, (has ? M.duckIn : M.duckOut) / 3);
  }

  // --- voices ---

  /**
   * A dialogue line starts: its file voice/<characterId>_<lineId> if there is one (then no
   * blips), else the typewriter's blips (voiceBlip). True if a file plays.
   */
  playVoice(characterId, lineId) {
    const key = `voice/${characterId}_${lineId}`;
    const buf = this.ready && this.hasFile(key) ? this.#buffer(key) : null;
    this.voiceLine = { characterId, lineId, file: !!buf };
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.#route('voices', 1, 0));
      src.start();
      return true;
    }
    return false;
  }

  /** One synthesized "talking" blip for a character (unless a voice file is speaking the line). */
  voiceBlip(characterId) {
    if (!this.ready || !this.ctx || this.voiceLine?.file) return;
    const c = AU.voice.characters[characterId];
    if (!c) return;
    try {
      this.#purge(this.ctx.currentTime);
      if (this.active.length >= AU.maxVoices) return;
      const out = this.#route('voices', 1, 0);
      const t = this.ctx.currentTime;
      this.active.push({ eff: c.volume, out, end: t + voiceBlip(this.kit, out, t, c) + 0.1 });
    } catch {
      /* (never let a blip break the cutscene) */
    }
  }

  // --- per frame ---

  /** Every frame (real time): pulse loops, stale loops, music scheduling. */
  update(dt) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (const L of [...this.loops.values()]) {
      if (now - L.touched > 0.3) {
        this.#stopLoop(L, now);
        continue;
      }
      if (L.pulse && !L.src) {
        const period = AU.loops[L.name].period;
        L.acc += dt * L.rate;
        if (L.acc >= period) {
          L.acc = Math.min(L.acc - period, period);
          try {
            // (each hit a little different in pitch and level: never a drum machine)
            const hit = this.ctx.createGain();
            hit.gain.value = 0.72 + Math.random() * 0.28;
            hit.connect(L.out);
            RECIPES[L.name](this.kit, hit, now + 0.01 + Math.random() * 0.012, L.pitch * (0.94 + Math.random() * 0.12));
          } catch {
            /* (a broken recipe never stops the loop updates) */
          }
        }
      }
    }
    this.music.update();
  }
}
