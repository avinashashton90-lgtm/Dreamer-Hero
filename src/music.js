import { CONFIG } from './config.js';
import { MUSIC } from './soundCatalog.js';
import { windDrone } from './sfx.js';

// Music: one section at a time (soundCatalog.js MUSIC), looping, with CONFIG.audio.music.fade
// crossfades between sections and layers faded in / out on top. A file
// public/audio/music_<track>.ogg replaces a synthesized track (and music_<track>_<layer>.ogg a
// layer); otherwise a small step sequencer plays it: a pad of chords, a bass line, an arpeggio
// and drums, scheduled `lookahead` s ahead on the audio clock (update() every frame).

const MU = CONFIG.audio.music;

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Chords as MIDI notes: root + quality.
const Q = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], sus: [0, 5, 7], dim: [0, 3, 6] };
const ch = (root, q = 'maj') => Q[q].map((i) => root + i);
/** A melody: [[step, MIDI note, length in steps?], …] over the whole loop (16 steps a bar). */
const mel = (...notes) => notes;

/**
 * Synthesized tracks. Per 16-step bar: `bass` / `arp` patterns index the chord's notes (null =
 * rest; bass an octave below the chord, arp `arpOct` above), drums are 'x' strings (Part 1's
 * kick / snare / hat / tom; Part 2's soft clockwork percussion — `tick` and `tock`, two pitched
 * wooden clicks, a soft low `boom` with a slow attack, a `shaker` — never a drum kit). `lead` is
 * a melody over the whole loop (mel: [step, MIDI, length]); `pad.formants` makes the pad a
 * choir-like "ah", `pad.detune` thickens it. Layers add parts (or a drone) on their own gain.
 */
export const TRACKS = {
  forest: {
    bpm: 96, v: 0.55,
    chords: [ch(62), ch(57), ch(59, 'min'), ch(55)],
    pad: { type: 'triangle', v: 0.05, cutoff: 1400 },
    bass: [0, null, null, null, 0, null, 2, null, 0, null, null, null, 1, null, 2, null], bassType: 'triangle', bassV: 0.22,
    arp: [0, null, 1, null, 2, null, 1, null, 0, null, 2, null, 3, null, 1, null], arpOct: 12, arpType: 'triangle', arpV: 0.06,
    drums: { kick: 'x.......x.......', snare: '........x.......', hat: '..x...x...x...x.' }, drumV: 0.5,
  },
  bats: {
    bpm: 138, v: 0.55,
    chords: [ch(57, 'min'), ch(57, 'min'), ch(53), ch(52)],
    pad: { type: 'sawtooth', v: 0.035, cutoff: 900 },
    bass: [0, null, 0, null, 0, null, 0, 1, 0, null, 0, null, 0, null, 2, null], bassType: 'sawtooth', bassV: 0.16,
    arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2], arpOct: 24, arpType: 'square', arpV: 0.03,
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' }, drumV: 0.5,
  },
  boss: {
    bpm: 84, v: 0.65,
    chords: [ch(50, 'min'), ch(46), ch(43, 'min'), ch(45)],
    pad: { type: 'sawtooth', v: 0.045, cutoff: 700 },
    bass: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 2, null, 1], bassType: 'sawtooth', bassV: 0.28, bassOct: -24,
    arp: [null, null, null, null, 2, null, null, null, null, null, null, null, 1, null, 0, null], arpOct: 12, arpType: 'square', arpV: 0.04,
    drums: { kick: 'x.....x...x.....', snare: '........x.......', tom: '............x.x.' }, drumV: 0.7,
    layers: {
      intense: {
        drums: { kick: 'x.x.x.x.x.x.x.x.', hat: 'x.xxx.xxx.xxx.xx', tom: '....x..x....x.xx' }, drumV: 0.5,
        bass: [0, 0, null, 0, 0, null, 0, 0, 0, 0, null, 0, 0, null, 2, 1], bassType: 'square', bassV: 0.12, bassOct: -12,
      },
    },
  },
  pit: {
    bpm: 70, v: 0.5,
    chords: [ch(60, 'maj7'), ch(57, 'min7'), ch(53, 'maj7'), ch(55, 'sus')],
    pad: { type: 'sine', v: 0.06, cutoff: 2500 },
    bass: [0, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.2,
    arp: [0, null, 2, null, 3, null, 1, null, 2, null, 3, null, 1, null, 2, null], arpOct: 24, arpType: 'sine', arpV: 0.05,
  },
  chase: {
    bpm: 152, v: 0.55,
    chords: [ch(52, 'min'), ch(48), ch(50), ch(47)],
    pad: { type: 'sawtooth', v: 0.03, cutoff: 1100 },
    bass: [0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1, 2, 1], bassType: 'sawtooth', bassV: 0.15,
    arp: [0, null, 1, 2, null, 1, 0, null, 2, null, 1, 2, null, 1, 3, null], arpOct: 12, arpType: 'square', arpV: 0.03,
    drums: { kick: 'x...x...x...x...', snare: '....x..x....x...', hat: 'x.x.x.x.x.x.x.x.' }, drumV: 0.55,
    layers: { wind: { drone: { f: 450, q: 0.6, lfo: 0.12, depth: 300, v: 0.45 } } },
  },
  gate: {
    bpm: 112, v: 0.6,
    chords: [ch(60), ch(55), ch(57, 'min'), ch(53)],
    pad: { type: 'sawtooth', v: 0.05, cutoff: 1800 },
    bass: [0, null, 0, null, 2, null, 0, null, 0, null, 0, null, 1, null, 2, null], bassType: 'triangle', bassV: 0.24,
    arp: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 2, 3, 2, 1], arpOct: 12, arpType: 'triangle', arpV: 0.05,
    drums: { kick: 'x.......x.......', snare: '....x.x.....xxxx', hat: '..x...x...x...x.' }, drumV: 0.5,
  },
  // --- Part 2 ---
  // The portal: short, mysterious and rising (chords climbing, a shimmering arpeggio, a shaker).
  part2_portal: {
    bpm: 72, v: 0.45,
    chords: [ch(57, 'min'), ch(58), ch(60, 'sus'), ch(62, 'min7')],
    pad: { type: 'sine', v: 0.06, cutoff: 2200, detune: 9 },
    bass: [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.16,
    arp: [0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 0, 1, 2, 3, 2], arpOct: 24, arpType: 'sine', arpV: 0.035,
    drums: { shaker: '..x...x...x...x.' }, drumV: 0.3,
  },
  // Gearhaven: a gentle clockwork theme — a soft tick-tock, a music-box melody, a warm pad.
  gearhaven: {
    bpm: 96, v: 0.5,
    chords: [ch(60, 'maj7'), ch(57, 'min7'), ch(53, 'maj7'), ch(55, 'sus')],
    pad: { type: 'triangle', v: 0.045, cutoff: 1300, detune: 6 },
    bass: [0, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.18,
    arp: [0, null, 2, null, 1, null, 3, null, 0, null, 2, null, 1, null, null, null], arpOct: 12, arpType: 'triangle', arpV: 0.025,
    lead: mel([0, 84, 3], [4, 88, 2], [6, 86, 2], [8, 84, 6], [16, 81, 3], [20, 84, 2], [22, 83, 2], [24, 81, 6], [32, 77, 3], [36, 81, 2], [38, 84, 2], [40, 86, 6], [48, 84, 4], [52, 83, 2], [54, 81, 2], [56, 79, 8]),
    leadType: 'sine', leadV: 0.05, // (a music box: short bright plucks)
    drums: { tick: 'x.......x.......', tock: '....x.......x...' }, drumV: 0.4,
  },
  // The same theme, faster and tenser: the rail rides, any chase.
  gearhaven_chase: {
    bpm: 132, v: 0.5,
    chords: [ch(57, 'min7'), ch(53, 'maj7'), ch(55), ch(52, 'min')],
    pad: { type: 'triangle', v: 0.035, cutoff: 1500 },
    bass: [0, null, 0, null, 2, null, 0, null, 0, null, 0, null, 1, null, 2, null], bassType: 'triangle', bassV: 0.17,
    arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 3, 1], arpOct: 24, arpType: 'square', arpV: 0.018,
    lead: mel([0, 81, 2], [2, 84, 2], [4, 88, 4], [16, 77, 2], [18, 81, 2], [20, 84, 4], [32, 79, 2], [34, 83, 2], [36, 86, 4], [48, 76, 2], [50, 79, 2], [52, 83, 4]),
    leadType: 'sine', leadV: 0.04,
    drums: { tick: 'x.x.x.x.x.x.x.x.', tock: '....x.......x...', shaker: '.x.x.x.x.x.x.x.x' }, drumV: 0.35,
  },
  // The Fire Element: slow, warm, glowing clockwork; the "boss" layer builds it for the boss fight.
  element_fire: {
    bpm: 84, v: 0.5,
    chords: [ch(53, 'maj7'), ch(50, 'min7'), ch(46, 'maj7'), ch(48, 'sus')],
    pad: { type: 'triangle', v: 0.05, cutoff: 1100, detune: 7 },
    bass: [0, null, null, null, null, null, 2, null, 0, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.2,
    lead: mel([0, 77, 4], [6, 81, 2], [8, 79, 8], [16, 74, 4], [22, 77, 2], [24, 76, 8], [32, 70, 4], [38, 74, 2], [40, 77, 8], [48, 72, 4], [54, 74, 2], [56, 72, 8]),
    leadType: 'triangle', leadV: 0.04,
    drums: { tock: 'x.......x.......' }, drumV: 0.3,
    layers: {
      boss: {
        drums: { boom: 'x.......x...x...', tick: 'x.x.x.x.x.x.x.x.' }, drumV: 0.45,
        bass: [0, null, 0, null, 0, null, 2, null, 0, null, 0, null, 1, null, 2, null], bassType: 'sawtooth', bassV: 0.08, bassOct: -12,
        arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1], arpOct: 24, arpType: 'triangle', arpV: 0.025,
      },
    },
  },
  element_lightning: {
    bpm: 120, v: 0.45,
    chords: [ch(64), ch(59), ch(61, 'min'), ch(57)],
    pad: { type: 'triangle', v: 0.035, cutoff: 2400 },
    bass: [0, null, null, 0, null, null, 2, null, 0, null, null, 0, null, null, 1, null], bassType: 'triangle', bassV: 0.16,
    arp: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 3], arpOct: 24, arpType: 'square', arpV: 0.016,
    drums: { tick: 'x.x.x.x.x.x.x.x.', shaker: '...x...x...x...x' }, drumV: 0.3,
  },
  element_steam: {
    bpm: 78, v: 0.45,
    chords: [ch(62, 'sus'), ch(60, 'maj7'), ch(57, 'min7'), ch(59, 'sus')],
    pad: { type: 'sine', v: 0.06, cutoff: 2600, detune: 12 },
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.15,
    arp: [0, null, null, 2, null, null, 3, null, null, 1, null, null, 2, null, null, null], arpOct: 24, arpType: 'sine', arpV: 0.035,
    drums: { shaker: 'x...x...x...x...' }, drumV: 0.25,
  },
  element_magnet: {
    bpm: 100, v: 0.5,
    chords: [ch(45, 'min'), ch(41), ch(43), ch(40, 'min')],
    pad: { type: 'sawtooth', v: 0.028, cutoff: 800 },
    bass: [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null], bassType: 'triangle', bassV: 0.16,
    arp: [null, null, 2, null, null, null, 1, null, null, null, 2, null, null, 3, null, null], arpOct: 12, arpType: 'triangle', arpV: 0.035,
    drums: { boom: 'x.......x.......', tock: '....x.......x...' }, drumV: 0.35,
  },
  element_time: {
    bpm: 88, v: 0.5,
    chords: [ch(55), ch(52, 'min'), ch(48), ch(50)],
    pad: { type: 'triangle', v: 0.045, cutoff: 1500 },
    bass: [0, null, null, null, 1, null, null, null, 2, null, null, null, 1, null, null, null], bassType: 'sine', bassV: 0.18,
    lead: mel([0, 79, 4], [4, 83, 4], [8, 86, 8], [16, 83, 4], [20, 79, 4], [24, 76, 8], [32, 72, 4], [36, 76, 4], [40, 79, 8], [48, 81, 4], [52, 78, 4], [56, 74, 8]),
    leadType: 'sine', leadV: 0.045,
    drums: { tick: 'x...x...x...x...', tock: '..x...x...x...x.' }, drumV: 0.3,
  },
  // Amy: quiet, sad, slightly eerie (a lone melody with a flattened note, a cold pad; no percussion).
  amy_theme: {
    bpm: 62, v: 0.45,
    chords: [ch(57, 'min'), ch(53, 'maj7'), ch(50, 'min'), ch(52, 'sus')],
    pad: { type: 'sine', v: 0.05, cutoff: 1800, detune: 14 },
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.13,
    lead: mel([0, 76, 6], [8, 77, 4], [12, 76, 4], [16, 72, 8], [26, 71, 6], [32, 74, 6], [40, 75, 4], [44, 74, 4], [48, 72, 6], [56, 69, 8]),
    leadType: 'triangle', leadV: 0.05,
  },
  // The final fight with Amy: heavy and dramatic, a choir-like pad over a deep pulse.
  final_fight: {
    bpm: 88, v: 0.55,
    chords: [ch(50, 'min'), ch(46), ch(48), ch(45)],
    pad: { type: 'sawtooth', v: 0.05, cutoff: 1600, formants: [700, 1150], detune: 10 }, // (a choir's "ah")
    bass: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 2, null, 1], bassType: 'sawtooth', bassV: 0.16, bassOct: -24,
    arp: [null, null, null, null, 2, null, null, null, null, null, null, null, 1, null, 0, null], arpOct: 12, arpType: 'triangle', arpV: 0.04,
    drums: { boom: 'x.....x...x.....', tock: '....x.......x...' }, drumV: 0.5,
  },
  // The Part 2 ending: gentle and hopeful.
  part2_end: {
    bpm: 76, v: 0.5,
    chords: [ch(60), ch(55), ch(57, 'min'), ch(53)],
    pad: { type: 'triangle', v: 0.05, cutoff: 1600, detune: 6 },
    bass: [0, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.18,
    lead: mel([0, 76, 4], [4, 79, 4], [8, 84, 8], [16, 83, 4], [20, 79, 4], [24, 74, 8], [32, 76, 4], [36, 81, 4], [40, 84, 8], [48, 81, 4], [52, 79, 4], [56, 77, 8]),
    leadType: 'sine', leadV: 0.045,
    drums: { tick: 'x.......x.......' }, drumV: 0.25,
  },
  ending: {
    bpm: 72, v: 0.5,
    chords: [ch(53), ch(48), ch(50, 'min'), ch(46)],
    pad: { type: 'triangle', v: 0.06, cutoff: 1600 },
    bass: [0, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null], bassType: 'sine', bassV: 0.2,
    arp: [0, null, null, 1, null, null, 2, null, null, 1, null, null, 3, null, null, null], arpOct: 12, arpType: 'sine', arpV: 0.06,
  },
};

/** One playing section: a track (synthesized or a file) and its layers, on its own gain. */
class Section {
  constructor(player, name) {
    const { ctx } = player;
    this.player = player;
    this.name = name;
    this.def = MUSIC[name];
    this.trackName = this.def.track;
    this.track = TRACKS[this.trackName];
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(player.bus);
    this.step = 0;
    this.next = ctx.currentTime + 0.05;
    this.sources = []; // file loops
    this.layers = {}; // name → { gain, drone?, file? }
    this.file = null; // AudioBuffer when the track is a file
    this.stopped = false;
  }
}

export class MusicPlayer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} bus  the music group (ducked by the manager)
   * @param {import('./sfx.js').SynthKit} kit
   * @param {(name: string) => Promise<AudioBuffer|null>|null} loadFile  a file for `name` (music_forest…) or null
   */
  constructor(ctx, bus, kit, loadFile) {
    this.ctx = ctx;
    this.bus = bus;
    this.kit = kit;
    this.loadFile = loadFile;
    this.current = null; // Section
    this.old = []; // fading out
    this.wanted = null; // section name
    this.layersOn = new Set();
  }

  /** Switch to `name` (a MUSIC key) or null for silence, crossfading over CONFIG.audio.music.fade. */
  setSection(name) {
    if (name === this.wanted) return;
    this.wanted = name;
    const t = this.ctx.currentTime;
    // Same track, only other layers (the chase → the sandstorm): keep it, just fade layers.
    if (name && this.current && MUSIC[name].track === this.current.trackName) {
      this.current.name = name;
      this.current.def = MUSIC[name];
      this.#applyLayers();
      return;
    }
    if (this.current) this.#fadeOut(this.current, t);
    this.current = null;
    if (!name) return;
    const s = new Section(this, name);
    this.current = s;
    const file = this.loadFile(`music_${s.trackName}`);
    if (file) {
      // (a file: start it once loaded — if it fails, the synthesized track plays instead)
      s.pending = true;
      file.then((buf) => {
        s.pending = false;
        if (s.stopped) return;
        if (buf) {
          s.file = buf;
          s.sources.push(this.#loopBuffer(buf, s.gain));
        }
        this.#applyLayers();
      });
    }
    s.gain.gain.setValueAtTime(0.0001, t);
    s.gain.gain.linearRampToValueAtTime(s.track.v, t + MU.fade);
    this.#applyLayers();
  }

  /** A layer (soundCatalog MUSIC_LAYERS) on or off: faded in / out over the crossfade time. */
  setLayer(layer, on) {
    if (on === this.layersOn.has(layer)) return;
    if (on) this.layersOn.add(layer);
    else this.layersOn.delete(layer);
    this.#applyLayers();
  }

  /** Every frame: schedule the synthesized notes ahead, retire faded sections. */
  update() {
    const now = this.ctx.currentTime;
    this.old = this.old.filter((s) => {
      if (now < s.endAt) {
        this.#schedule(s, now);
        return true;
      }
      this.#dispose(s);
      return false;
    });
    if (this.current) this.#schedule(this.current, now);
  }

  stopAll() {
    this.setSection(null);
  }

  // --- internals ---

  #applyLayers() {
    const s = this.current;
    if (!s || s.pending) return;
    const t = this.ctx.currentTime;
    const wanted = new Set([...(s.def.layers ?? []), ...this.layersOn]);
    // Only layers this track knows (a synthesized part, a drone, or a layer file).
    const known = (l) => !!s.track.layers?.[l];
    for (const l of new Set([...wanted, ...Object.keys(s.layers)])) {
      const on = wanted.has(l) && known(l);
      let L = s.layers[l];
      if (on && !L) {
        L = s.layers[l] = { gain: this.ctx.createGain(), def: s.track.layers[l] };
        L.gain.gain.value = 0;
        L.gain.connect(s.gain);
        if (L.def.drone) {
          L.drone = windDrone(this.kit, L.gain, 1, L.def.drone);
          L.drone.level(L.def.drone.v, t);
        }
        // A layer file over a file track (music_<track>_<layer>.ogg).
        const f = s.file ? this.loadFile(`music_${s.trackName}_${l}`) : null;
        if (f) f.then((buf) => buf && !s.stopped && s.layers[l] === L && s.sources.push(this.#loopBuffer(buf, L.gain)));
      }
      if (!L) continue;
      L.on = on;
      L.gain.gain.cancelScheduledValues(t);
      L.gain.gain.setValueAtTime(L.gain.gain.value, t);
      L.gain.gain.linearRampToValueAtTime(on ? 1 : 0, t + MU.fade);
    }
  }

  #loopBuffer(buf, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    src.start();
    return src;
  }

  #fadeOut(s, t) {
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    s.gain.gain.linearRampToValueAtTime(0.0001, t + MU.fade);
    s.endAt = t + MU.fade + 0.1;
    this.old.push(s);
  }

  #dispose(s) {
    s.stopped = true;
    const t = this.ctx.currentTime;
    for (const src of s.sources) {
      try {
        src.stop();
      } catch {
        /* (already stopped) */
      }
    }
    for (const L of Object.values(s.layers)) L.drone?.stop(t);
    s.gain.disconnect();
  }

  /** Schedule this section's synthesized steps up to `lookahead` ahead (nothing for a file track). */
  #schedule(s, now) {
    if (s.file || s.pending) return;
    const tr = s.track;
    const stepDur = 60 / tr.bpm / 4;
    if (s.next < now - 0.5) s.next = now + 0.02; // (after a suspend: don't rush to catch up)
    while (s.next < now + MU.lookahead) {
      this.#playStep(s, tr, s.step, s.next, stepDur, s.gain);
      for (const L of Object.values(s.layers)) if (L.on || L.gain.gain.value > 0.001) this.#playStep(s, L.def, s.step, s.next, stepDur, L.gain, tr);
      s.step = (s.step + 1) % (16 * tr.chords.length);
      s.next += stepDur;
    }
  }

  /** One sixteenth: the parts of `part` (a track, or a layer using its track's chords). */
  #playStep(s, part, step, t, stepDur, out, base = part) {
    const k = this.kit;
    const i = step % 16;
    const chord = base.chords[Math.floor(step / 16) % base.chords.length];
    if (part.pad && i === 0) {
      const dur = stepDur * 16;
      for (const m of chord) this.#padNote(out, t, NOTE(m), dur, part.pad);
    }
    const b = part.bass?.[i];
    if (b != null) this.#pluck(out, t, NOTE(chord[b % chord.length] + (part.bassOct ?? -12)), stepDur * 1.8, part.bassType, part.bassV, 700);
    const a = part.arp?.[i];
    if (a != null) this.#pluck(out, t, NOTE(chord[a % chord.length] + (part.arpOct ?? 12)), stepDur * 1.5, part.arpType, part.arpV, 3000);
    // (the melody: its notes on this step of the loop)
    if (part.lead) {
      const at = step % (16 * base.chords.length);
      for (const [st, m, len = 2] of part.lead) if (st === at) this.#pluck(out, t, NOTE(m), stepDur * (len + 1), part.leadType ?? 'sine', part.leadV ?? 0.05, 4000);
    }
    const D = part.drums;
    if (D) {
      const v = part.drumV ?? 0.5;
      if (D.kick?.[i] === 'x') {
        k.tone(out, t, { f: 120, f2: 40, d: 0.18, v: 0.9 * v });
      }
      if (D.snare?.[i] === 'x') {
        k.noise(out, t, { filter: 'bandpass', f: 1800, q: 0.8, d: 0.12, v: 0.45 * v });
        k.tone(out, t, { type: 'triangle', f: 220, f2: 160, d: 0.06, v: 0.2 * v });
      }
      if (D.hat?.[i] === 'x') k.noise(out, t, { filter: 'highpass', f: 7000, d: 0.03, v: 0.15 * v });
      if (D.tom?.[i] === 'x') k.tone(out, t, { f: 160, f2: 90, d: 0.16, v: 0.5 * v });
      // (Part 2's clockwork: soft pitched clicks, a slow-attack low boom, a shaker — no drum kit)
      if (D.tick?.[i] === 'x') {
        k.tone(out, t, { type: 'sine', f: 2350, d: 0.03, v: 0.1 * v });
        k.noise(out, t, { filter: 'bandpass', f: 3200, q: 6, d: 0.02, v: 0.07 * v });
      }
      if (D.tock?.[i] === 'x') {
        k.tone(out, t, { type: 'sine', f: 1700, d: 0.04, v: 0.1 * v });
        k.noise(out, t, { filter: 'bandpass', f: 2300, q: 6, d: 0.02, v: 0.06 * v });
      }
      if (D.boom?.[i] === 'x') k.tone(out, t, { f: 70, f2: 50, a: 0.03, d: 0.35, v: 0.45 * v });
      if (D.shaker?.[i] === 'x') k.noise(out, t, { filter: 'highpass', f: 6000, a: 0.01, d: 0.05, v: 0.06 * v });
    }
  }

  #padNote(out, t, f, dur, P) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = P.cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(P.v, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(P.v, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    // (a choir-like "ah": through two formant band-passes, louder to make up for them)
    let into = lp;
    if (P.formants) {
      into = ctx.createGain();
      into.gain.value = 1;
      for (const fq of P.formants) {
        const bq = ctx.createBiquadFilter();
        bq.type = 'bandpass';
        bq.frequency.value = fq;
        bq.Q.value = 4;
        const mk = ctx.createGain();
        mk.gain.value = 2.5;
        into.connect(bq).connect(mk).connect(lp);
      }
    }
    lp.connect(g).connect(out);
    // (one oscillator; a second, detuned, with `detune`)
    for (const d of P.detune ? [-P.detune, P.detune] : [0]) {
      const o = ctx.createOscillator();
      o.type = P.type;
      o.frequency.value = f;
      o.detune.value = d + (Math.random() - 0.5) * 8;
      o.connect(into);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  #pluck(out, t, f, dur, type, v, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.25), t + dur);
    o.connect(lp).connect(this.kit.env(out, t, 0.005, dur, v));
    o.start(t);
    o.stop(t + dur + 0.03);
  }
}
