// Synthesized fallbacks for every sound name (soundCatalog.js): oscillators, filtered noise and
// envelopes, built on demand into a Web Audio graph. A real file in public/audio/ replaces any
// of them (audio.js). Each recipe schedules its nodes from time `t` into `out` and returns its
// length in seconds; `p` is a pitch multiplier. Loops come in two kinds: pulse loops repeat a
// one-shot recipe (hooves, wings, the heartbeat — see CONFIG.audio.loops) and drones are
// continuous graphs (wind, fire) with a level that can be changed while they play.

/** The building blocks shared by every recipe (one per AudioContext). */
export class SynthKit {
  /** @param {AudioContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    // Two seconds of white noise, shared by every noise burst (looped where needed).
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  /** An envelope gain: up to `v` over `a`, then down to silence over `d` (exponential). */
  env(out, t, a, d, v) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(out);
    return g;
  }

  /** A pitched tone sliding from f to f2. */
  tone(out, t, { type = 'sine', f = 440, f2 = f, a = 0.005, d = 0.2, v = 0.4, detune = 0 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f), t);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + a + d);
    if (detune) o.detune.value = detune;
    o.connect(this.env(out, t, a, d, v));
    o.start(t);
    o.stop(t + a + d + 0.02);
    return t + a + d;
  }

  /** A burst of filtered noise; the filter sweeps from f to f2. */
  noise(out, t, { filter = 'lowpass', f = 1200, f2 = f, q = 1, a = 0.005, d = 0.2, v = 0.4 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(Math.max(20, f), t);
    if (f2 !== f) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + a + d);
    src.connect(bq).connect(this.env(out, t, a, d, v));
    src.start(t, Math.random() * 1.5);
    src.stop(t + a + d + 0.02);
    return t + a + d;
  }

  /** A short "vowel": a buzzy source through two formant band-passes, with a pitch contour. */
  vowel(out, t, { f = 220, f2 = f, a = 0.01, d = 0.15, v = 0.3, formants = [700, 1200], type = 'sawtooth' }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + a + d);
    const g = this.env(out, t, a, d, v);
    for (const fq of formants) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = 'bandpass';
      bq.frequency.value = fq;
      bq.Q.value = 6;
      o.connect(bq).connect(g);
    }
    o.start(t);
    o.stop(t + a + d + 0.02);
    return t + a + d;
  }
}

const max = Math.max;

/**
 * A horse's whinny: a sawtooth whose pitch follows `peaks` ([time, Hz] pairs: up, then down),
 * with a vibrato, softened by a low-pass so it never turns piercing, and a breathy noise layer.
 */
SynthKit.prototype.whinny = function whinny(out, t, { peaks, v = 0.16, vib = 11, vibDepth = 28, cutoff = 2200, breath = 0.35 }) {
  const ctx = this.ctx;
  const end = t + peaks[peaks.length - 1][0];
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(peaks[0][1], t);
  for (const [dt, f] of peaks.slice(1)) o.frequency.linearRampToValueAtTime(f, t + dt);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = vib;
  const depth = ctx.createGain();
  depth.gain.value = vibDepth;
  lfo.connect(depth).connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.06);
  g.gain.setValueAtTime(v, end - 0.25);
  g.gain.linearRampToValueAtTime(0, end);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(end + 0.05);
  lfo.stop(end + 0.05);
  // (the breath through the nostrils)
  this.noise(out, t, { filter: 'bandpass', f: 1400, q: 0.8, a: 0.08, d: end - t, v: v * breath });
  return end;
};

/** One-shot recipes: (kit, out, t, p) → length (s). */
export const RECIPES = {
  // --- Horse ---
  // Hooves: soft "clops" (a short band-passed knock and a little dirt), no low thump, each hit a
  // little different (the pulse loop also varies pitch and level) so they never beat like a drum.
  hoof_walk: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: (1100 + Math.random() * 300) * p, q: 2.5, d: 0.045, v: 0.32 });
    k.noise(o, t, { filter: 'lowpass', f: 900 * p, f2: 400, d: 0.05, v: 0.12 });
    return 0.07;
  },
  hoof_trot: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: (1200 + Math.random() * 300) * p, q: 2.5, d: 0.04, v: 0.3 });
    k.noise(o, t + 0.085 + Math.random() * 0.02, { filter: 'bandpass', f: (1000 + Math.random() * 300) * p, q: 2.5, d: 0.04, v: 0.22 });
    k.noise(o, t, { filter: 'lowpass', f: 1000 * p, f2: 450, d: 0.05, v: 0.1 });
    return 0.16;
  },
  hoof_gallop: (k, o, t, p) => {
    [0, 0.055, 0.115].forEach((dt, i) => {
      k.noise(o, t + dt + Math.random() * 0.012, { filter: 'bandpass', f: (1050 + Math.random() * 400) * p, q: 2.2, d: 0.045, v: 0.28 - i * 0.05 });
    });
    k.noise(o, t, { filter: 'lowpass', f: 900 * p, f2: 400, d: 0.12, v: 0.12 });
    return 0.2;
  },
  // A gentle whinny: up, then down, with a vibrato and breath.
  horse_neigh: (k, o, t, p) => k.whinny(o, t, { peaks: [[0, 360 * p], [0.12, 780 * p], [0.35, 680 * p], [0.8, 400 * p]], v: 0.15 }) - t,
  // A loud rearing whinny: higher and longer, two pitch peaks (still low-passed: never piercing).
  horse_scream: (k, o, t, p) => k.whinny(o, t, { peaks: [[0, 420 * p], [0.16, 1000 * p], [0.42, 720 * p], [0.62, 960 * p], [1.2, 460 * p]], v: 0.17, vib: 13, vibDepth: 38, cutoff: 2500 }) - t,
  horse_snort: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 800 * p, f2: 450 * p, q: 1.2, a: 0.03, d: 0.3, v: 0.3 }) - t,
  // Heavy panting (a pulse loop while the horse's energy is low): in, then a longer breath out.
  horse_breath: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 900 * p, q: 1, a: 0.08, d: 0.12, v: 0.14 });
    k.noise(o, t + 0.24, { filter: 'bandpass', f: 600 * p, q: 0.9, a: 0.04, d: 0.24, v: 0.18 });
    return 0.55;
  },
  horse_hurt: (k, o, t, p) => {
    k.vowel(o, t, { f: 700 * p, f2: 450 * p, a: 0.01, d: 0.3, v: 0.35, formants: [900, 1900] });
    k.noise(o, t, { filter: 'highpass', f: 2500, d: 0.12, v: 0.15 });
    return 0.32;
  },
  horse_eat: (k, o, t, p) => {
    for (let i = 0; i < 3; i++) k.noise(o, t + i * 0.16, { filter: 'bandpass', f: 1800 * p, q: 3, d: 0.07, v: 0.25 });
    return 0.45;
  },
  // --- Water ---
  // Soft water: band-passed noise with a short fade-in and a longer fade-out — no thump, no pulse.
  river_splash: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 1300 * p, f2: 900 * p, q: 0.9, a: 0.07, d: 0.6, v: 0.32 });
    k.noise(o, t + 0.03, { filter: 'highpass', f: 3500, a: 0.05, d: 0.35, v: 0.06 });
    return 0.7;
  },
  river_flow: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 900 * p, q: 0.6, a: 0.4, d: 1, v: 0.1 }) - t, // (a drone when looped)
  horse_sip: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 1600 * p, f2: 1100 * p, q: 2, a: 0.02, d: 0.12, v: 0.14 });
    k.tone(o, t + 0.05, { type: 'sine', f: 520 * p, f2: 760 * p, a: 0.01, d: 0.06, v: 0.04 });
    return 0.2;
  },
  potion_drink: (k, o, t, p) => {
    for (let i = 0; i < 3; i++) k.tone(o, t + i * 0.12, { f: 300 * p, f2: 520 * p, d: 0.08, v: 0.25 });
    return 0.4;
  },
  // --- AJ ---
  aj_jump: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 600 * p, f2: 2400 * p, q: 1, a: 0.02, d: 0.16, v: 0.35 }) - t,
  aj_land: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 700 * p, f2: 200, d: 0.1, v: 0.4 });
    k.tone(o, t, { f: 90 * p, f2: 60, a: 0.01, d: 0.06, v: 0.12 });
    return 0.12;
  },
  aj_hurt: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 1400 * p, f2: 300, d: 0.14, v: 0.5 });
    k.tone(o, t, { type: 'square', f: 220 * p, f2: 110 * p, d: 0.12, v: 0.12 });
    return 0.16;
  },
  aj_death: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 440 * p, f2: 110 * p, a: 0.02, d: 1.1, v: 0.3 });
    k.tone(o, t + 0.15, { type: 'sine', f: 330 * p, f2: 82 * p, a: 0.02, d: 1.0, v: 0.2 });
    k.noise(o, t, { filter: 'lowpass', f: 900, f2: 100, d: 0.6, v: 0.2 });
    return 1.2;
  },
  aj_revive: (k, o, t, p) => {
    [523, 659, 784, 1047].forEach((f, i) => k.tone(o, t + i * 0.09, { type: 'triangle', f: f * p, d: 0.5, v: 0.18 }));
    k.noise(o, t, { filter: 'highpass', f: 3000, f2: 6000, a: 0.2, d: 0.5, v: 0.06 });
    return 0.9;
  },
  aj_dismount: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 1200 * p, f2: 500, q: 1, a: 0.03, d: 0.15, v: 0.25 });
    k.noise(o, t + 0.22, { filter: 'lowpass', f: 600, f2: 150, d: 0.09, v: 0.4 });
    return 0.32;
  },
  aj_mount: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 500 * p, f2: 1500 * p, q: 1, a: 0.03, d: 0.18, v: 0.25 });
    k.noise(o, t + 0.3, { filter: 'lowpass', f: 500, f2: 140, d: 0.1, v: 0.4 });
    k.tone(o, t + 0.3, { f: 140, f2: 80, d: 0.08, v: 0.15 });
    return 0.42;
  },
  // --- Weapons ---
  batarang_throw: (k, o, t, p) => {
    for (let i = 0; i < 5; i++) k.noise(o, t + i * 0.05, { filter: 'bandpass', f: (1500 + i * 300) * p, q: 4, d: 0.04, v: 0.25 });
    return 0.28;
  },
  batarang_hit: (k, o, t, p) => {
    k.tone(o, t, { type: 'square', f: 1800 * p, f2: 900 * p, d: 0.06, v: 0.15 });
    k.noise(o, t, { filter: 'highpass', f: 2500, d: 0.08, v: 0.3 });
    return 0.1;
  },
  batarang_return: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 1200 * p, f2: 1600 * p, d: 0.08, v: 0.15 });
    k.noise(o, t, { filter: 'lowpass', f: 1200, f2: 300, d: 0.06, v: 0.25 });
    return 0.12;
  },
  smoke_throw: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 400 * p, f2: 1600 * p, q: 1.2, a: 0.04, d: 0.22, v: 0.3 }) - t,
  smoke_burst: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 2500 * p, f2: 300, a: 0.01, d: 0.7, v: 0.55 });
    k.tone(o, t, { f: 120 * p, f2: 50, d: 0.25, v: 0.3 });
    for (let i = 0; i < 5; i++) k.tone(o, t + 0.1 + i * 0.07, { type: 'sine', f: (2000 + i * 340) * p, d: 0.12, v: 0.04 });
    return 0.8;
  },
  flash_charge: (k, o, t, p) => {
    k.tone(o, t, { type: 'sawtooth', f: 110 * p, f2: 880 * p, a: 0.5, d: 0.15, v: 0.12 });
    k.tone(o, t, { type: 'sine', f: 220 * p, f2: 1760 * p, a: 0.5, d: 0.15, v: 0.12 });
    k.noise(o, t, { filter: 'bandpass', f: 800, f2: 5000, q: 2, a: 0.5, d: 0.1, v: 0.12 });
    return 0.66;
  },
  flash_release: (k, o, t, p) => {
    k.noise(o, t, { filter: 'highpass', f: 1500 * p, f2: 400, a: 0.002, d: 0.5, v: 0.7 });
    for (let i = 0; i < 8; i++) k.noise(o, t + Math.random() * 0.35, { filter: 'bandpass', f: 3000 + Math.random() * 3000, q: 3, d: 0.03, v: 0.3 });
    k.tone(o, t, { f: 80 * p, f2: 35, d: 0.9, v: 0.45 });
    k.noise(o, t + 0.05, { filter: 'lowpass', f: 300, f2: 60, a: 0.05, d: 1.2, v: 0.35 });
    return 1.3;
  },
  melee_swing: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 500 * p, f2: 1800 * p, q: 1.5, a: 0.03, d: 0.1, v: 0.3 }) - t,
  melee_hit: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 2200 * p, f2: 400, d: 0.08, v: 0.55 });
    k.tone(o, t, { f: 160 * p, f2: 70, d: 0.09, v: 0.4 });
    return 0.12;
  },
  // --- Gems and items ---
  gem_collect: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 988 * p, d: 0.12, v: 0.22 });
    k.tone(o, t + 0.06, { type: 'triangle', f: 1480 * p, d: 0.22, v: 0.2 });
    k.tone(o, t + 0.06, { type: 'sine', f: 2960 * p, d: 0.15, v: 0.05 });
    return 0.3;
  },
  potion_pickup: (k, o, t, p) => {
    [660, 880, 1320].forEach((f, i) => k.tone(o, t + i * 0.06, { type: 'sine', f: f * p, d: 0.25, v: 0.15 }));
    k.noise(o, t, { filter: 'bandpass', f: 1800, q: 2, d: 0.2, v: 0.1 });
    return 0.4;
  },
  ability_ready: (k, o, t, p) => {
    [784, 1175].forEach((f, i) => k.tone(o, t + i * 0.08, { type: 'triangle', f: f * p, d: 0.3, v: 0.2 }));
    return 0.4;
  },
  ability_empty: (k, o, t, p) => k.tone(o, t, { type: 'square', f: 180 * p, f2: 140 * p, d: 0.12, v: 0.12 }) - t,
  ui_tap: (k, o, t, p) => k.tone(o, t, { type: 'sine', f: 1100 * p, f2: 900 * p, d: 0.05, v: 0.15 }) - t,
  // --- Bats ---
  bat_screech: (k, o, t, p) => {
    k.tone(o, t, { type: 'sawtooth', f: 3200 * p, f2: 2200 * p, a: 0.01, d: 0.35, v: 0.12 });
    k.tone(o, t, { type: 'square', f: 2600 * p, f2: 3400 * p, a: 0.01, d: 0.3, v: 0.06 });
    return 0.38;
  },
  bat_flap: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 700 * p, q: 1.2, a: 0.01, d: 0.05, v: 0.35 }) - t,
  bat_hit: (k, o, t, p) => {
    k.tone(o, t, { type: 'square', f: 2400 * p, f2: 1600 * p, d: 0.08, v: 0.1 });
    k.noise(o, t, { filter: 'lowpass', f: 1600, d: 0.06, v: 0.3 });
    return 0.1;
  },
  bat_die: (k, o, t, p) => {
    k.tone(o, t, { type: 'sawtooth', f: 2800 * p, f2: 500 * p, d: 0.4, v: 0.1 });
    k.noise(o, t + 0.05, { filter: 'bandpass', f: 900, f2: 300, d: 0.3, v: 0.2 });
    return 0.45;
  },
  // --- Skeletons ---
  skel_rattle: (k, o, t, p) => {
    for (let i = 0; i < 7; i++) k.noise(o, t + i * 0.035 + Math.random() * 0.01, { filter: 'bandpass', f: (2200 + Math.random() * 900) * p, q: 8, d: 0.03, v: 0.3 });
    return 0.3;
  },
  skel_walk: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 1600 * p, q: 6, d: 0.035, v: 0.3 }) - t,
  skel_hit: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 2000 * p, q: 5, d: 0.06, v: 0.45 });
    k.tone(o, t, { type: 'triangle', f: 600 * p, f2: 400 * p, d: 0.06, v: 0.12 });
    return 0.1;
  },
  skel_die: (k, o, t, p) => {
    for (let i = 0; i < 10; i++) k.noise(o, t + i * 0.05 + Math.random() * 0.03, { filter: 'bandpass', f: (1200 + Math.random() * 1500) * p, q: 6, d: 0.04, v: 0.3 - i * 0.02 });
    return 0.6;
  },
  skel_thrown_aside: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 1500, f2: 300, d: 0.15, v: 0.5 });
    for (let i = 0; i < 6; i++) k.noise(o, t + 0.05 + i * 0.04, { filter: 'bandpass', f: (1800 + Math.random() * 1200) * p, q: 6, d: 0.04, v: 0.25 });
    return 0.35;
  },
  // --- Slimes ---
  slime_squelch: (k, o, t, p) => {
    k.tone(o, t, { type: 'sine', f: 260 * p, f2: 120 * p, a: 0.01, d: 0.14, v: 0.3 });
    k.noise(o, t, { filter: 'lowpass', f: 700, f2: 250, d: 0.12, v: 0.25 });
    return 0.16;
  },
  slime_burst: (k, o, t, p) => {
    k.tone(o, t, { type: 'sine', f: 180 * p, f2: 600 * p, d: 0.08, v: 0.3 });
    k.noise(o, t + 0.04, { filter: 'lowpass', f: 1200, f2: 200, d: 0.3, v: 0.4 });
    return 0.36;
  },
  // --- Boss ---
  boss_roar: (k, o, t, p) => {
    k.vowel(o, t, { f: 95 * p, f2: 70 * p, a: 0.12, d: 1.1, v: 0.55, formants: [350, 800, 1300] });
    k.noise(o, t, { filter: 'lowpass', f: 900, f2: 300, a: 0.1, d: 1.1, v: 0.35 });
    k.tone(o, t, { type: 'sawtooth', f: 48 * p, f2: 40 * p, a: 0.1, d: 1.0, v: 0.18 });
    return 1.25;
  },
  // A heavy footfall felt more than heard: a soft low rumble and a little grit (no drum thump).
  boss_step: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: (220 + Math.random() * 60) * p, f2: 70, a: 0.02, d: 0.35, v: 0.45 });
    k.tone(o, t, { f: 48 * p, f2: 36, a: 0.03, d: 0.25, v: 0.22 });
    k.noise(o, t + 0.02, { filter: 'bandpass', f: 900, q: 1.5, d: 0.08, v: 0.06 });
    return 0.4;
  },
  boss_slam: (k, o, t, p) => {
    k.tone(o, t, { f: 70 * p, f2: 28, d: 0.7, v: 0.9 });
    k.noise(o, t, { filter: 'lowpass', f: 1800, f2: 90, d: 0.8, v: 0.7 });
    for (let i = 0; i < 6; i++) k.noise(o, t + 0.1 + i * 0.07, { filter: 'bandpass', f: 600 + Math.random() * 900, q: 3, d: 0.06, v: 0.15 });
    return 0.9;
  },
  boss_charge: (k, o, t, p) => {
    k.vowel(o, t, { f: 120 * p, f2: 160 * p, a: 0.05, d: 0.5, v: 0.4, formants: [400, 900] });
    k.noise(o, t, { filter: 'lowpass', f: 400, f2: 1200, a: 0.1, d: 0.5, v: 0.3 });
    return 0.6;
  },
  boss_fire_breath: (k, o, t, p) => k.noise(o, t, { filter: 'lowpass', f: 1400 * p, q: 0.7, a: 0.05, d: 0.3, v: 0.4 }) - t, // (a drone when looped: see DRONES)
  boss_hurt: (k, o, t, p) => {
    k.vowel(o, t, { f: 140 * p, f2: 90 * p, a: 0.01, d: 0.3, v: 0.35, formants: [500, 1100] });
    k.noise(o, t, { filter: 'lowpass', f: 1500, f2: 300, d: 0.12, v: 0.35 });
    return 0.32;
  },
  boss_dazed: (k, o, t, p) => {
    for (let i = 0; i < 5; i++) k.tone(o, t + i * 0.12, { type: 'sine', f: (900 - i * 90) * p, f2: (700 - i * 70) * p, d: 0.2, v: 0.12 });
    k.vowel(o, t, { f: 110 * p, f2: 80 * p, a: 0.05, d: 0.6, v: 0.25, formants: [400, 800] });
    return 0.8;
  },
  boss_death: (k, o, t, p) => {
    k.vowel(o, t, { f: 110 * p, f2: 45 * p, a: 0.05, d: 1.8, v: 0.55, formants: [350, 750, 1200] });
    k.tone(o, t + 1.4, { f: 55, f2: 25, d: 0.8, v: 0.8 });
    k.noise(o, t + 1.4, { filter: 'lowpass', f: 900, f2: 60, d: 1.0, v: 0.6 });
    return 2.3;
  },
  boss_regen: (k, o, t, p) => {
    [523, 784, 1047].forEach((f, i) => k.tone(o, t + i * 0.1, { type: 'sine', f: f * p, a: 0.05, d: 0.4, v: 0.06 }));
    return 0.6;
  },
  // --- Arena ---
  barrier_close: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 250 * p, f2: 500, a: 0.2, d: 0.7, v: 0.6 });
    k.tone(o, t + 0.85, { f: 70, f2: 30, d: 0.5, v: 0.8 });
    k.noise(o, t + 0.85, { filter: 'lowpass', f: 1500, f2: 80, d: 0.5, v: 0.6 });
    return 1.4;
  },
  barrier_open: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 500 * p, f2: 160, a: 0.1, d: 1.1, v: 0.6 });
    k.tone(o, t, { f: 55, f2: 35, a: 0.1, d: 1.0, v: 0.4 });
    return 1.25;
  },
  rock_rumble: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 180 * p, q: 1.5, a: 0.15, d: 1.0, v: 0.7 });
    k.tone(o, t, { f: 42 * p, f2: 33, a: 0.1, d: 1.0, v: 0.4 });
    return 1.2;
  },
  // --- Scenes ---
  pit_water_glow: (k, o, t, p) => {
    [392, 587, 784, 1175].forEach((f, i) => k.tone(o, t + i * 0.18, { type: 'sine', f: f * p, a: 0.15, d: 1.4, v: 0.1 }));
    k.noise(o, t, { filter: 'bandpass', f: 1200, f2: 2600, q: 4, a: 0.4, d: 1.2, v: 0.05 });
    return 2;
  },
  pit_heal: (k, o, t, p) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => k.tone(o, t + i * 0.11, { type: 'triangle', f: f * p, a: 0.02, d: 0.9, v: 0.13 }));
    k.noise(o, t, { filter: 'highpass', f: 4000, a: 0.3, d: 0.8, v: 0.05 });
    return 1.5;
  },
  gate_open: (k, o, t, p) => {
    k.tone(o, t, { type: 'sawtooth', f: 90 * p, f2: 140 * p, a: 0.3, d: 1.0, v: 0.08 });
    k.noise(o, t, { filter: 'bandpass', f: 400, f2: 900, q: 6, a: 0.3, d: 1.0, v: 0.25 });
    return 1.3;
  },
  // --- Part 2: the portal ---
  portal_open: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 160 * p, q: 1.4, a: 0.2, d: 1.4, v: 0.36 }); // (a soft low rumble)
    k.noise(o, t + 0.05, { filter: 'bandpass', f: 400 * p, f2: 3000 * p, q: 1, a: 0.5, d: 0.7, v: 0.22 }); // (the whoosh)
    [392, 523, 659, 784, 1046].forEach((f, i) => k.tone(o, t + 0.15 + i * 0.12, { type: 'triangle', f: f * p, f2: f * 1.5 * p, a: 0.05, d: 0.8, v: 0.045 })); // (the rising shimmer)
    return 1.8;
  },
  portal_pull: (k, o, t, p) => {
    // (a swirling suck: band-passed noise sweeping up with a slow wobble, a low rising tone under it)
    for (let i = 0; i < 6; i++) k.noise(o, t + i * 0.3, { filter: 'bandpass', f: (300 + i * 260) * p, f2: (700 + i * 380) * p, q: 2.2, a: 0.15, d: 0.4, v: 0.13 + i * 0.015 });
    k.tone(o, t, { type: 'sine', f: 90 * p, f2: 420 * p, a: 0.8, d: 1.5, v: 0.08 });
    return 2.4;
  },
  gear_whoosh: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 1400 * p, f2: 3600 * p, q: 1.5, a: 0.08, d: 0.22, v: 0.12 });
    k.tone(o, t + 0.12, { type: 'triangle', f: 2200 * p, d: 0.06, v: 0.025 }); // (a tiny tick as it flies by)
    return 0.32;
  },
  portal_whoosh: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 300 * p, f2: 3200 * p, q: 1.2, a: 1.2, d: 1.2, v: 0.35 });
    k.tone(o, t, { type: 'sine', f: 110 * p, f2: 660 * p, a: 1.0, d: 1.2, v: 0.08 });
    return 2.4;
  },
  // --- Gearhaven ambience (the loops are drones: DRONES below; these are one soft hit each) ---
  // A slow two-note tick-tock: two short, soft, pitched wooden clicks (a little tone, no thump).
  clock_tick: (k, o, t, p) => {
    k.tone(o, t, { type: 'sine', f: 2350 * p, d: 0.035, v: 0.05 });
    k.noise(o, t, { filter: 'bandpass', f: 3200 * p, q: 6, d: 0.02, v: 0.05 });
    k.tone(o, t + 0.5, { type: 'sine', f: 1760 * p, d: 0.04, v: 0.045 });
    k.noise(o, t + 0.5, { filter: 'bandpass', f: 2400 * p, q: 6, d: 0.02, v: 0.045 });
    return 0.6;
  },
  gear_turn: (k, o, t, p) => k.noise(o, t, { filter: 'lowpass', f: 220 * p, q: 2, a: 0.3, d: 1.2, v: 0.1 }) - t,
  gear_roll: (k, o, t, p) => k.noise(o, t, { filter: 'lowpass', f: 700 * p, a: 0.02, d: 0.35, v: 0.07 }) - t, // (a drone when looped)
  steam_hiss: (k, o, t, p) => k.noise(o, t, { filter: 'highpass', f: 2600 * p, a: 0.06, d: 0.7, v: 0.1 }) - t,
  factory_hum: (k, o, t, p) => k.tone(o, t, { type: 'triangle', f: 55 * p, a: 0.4, d: 1.4, v: 0.06 }) - t,
  clock_chime: (k, o, t, p) => {
    [98, 196, 293.7, 392].forEach((f, i) => k.tone(o, t, { type: 'sine', f: f * p, a: 0.01, d: 2.8 - i * 0.5, v: 0.18 / (i + 1) }));
    k.tone(o, t, { type: 'triangle', f: 196 * 2.76 * p, a: 0.01, d: 1.2, v: 0.02 }); // (the bell's bright partial)
    return 2.9;
  },
  clock_stop_warning: (k, o, t, p) => {
    // (two slow, close tones beating against each other, sinking a little: unsettling, soft)
    k.tone(o, t, { type: 'sine', f: 220 * p, f2: 196 * p, a: 0.4, d: 1.8, v: 0.07 });
    k.tone(o, t, { type: 'sine', f: 233 * p, f2: 207 * p, a: 0.4, d: 1.8, v: 0.06 });
    k.tone(o, t + 0.2, { type: 'triangle', f: 110 * p, f2: 98 * p, a: 0.5, d: 1.6, v: 0.04 });
    return 2.3;
  },
  // --- Gearhaven ride ---
  rail_grind: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 2600 * p, q: 4, a: 0.05, d: 0.6, v: 0.16 }) - t, // (a drone when looped)
  rail_land: (k, o, t, p) => {
    // (a metallic clink: two bright partials, a touch of scrape)
    k.tone(o, t, { type: 'triangle', f: 1480 * p, d: 0.22, v: 0.07 });
    k.tone(o, t, { type: 'sine', f: 2210 * p, d: 0.14, v: 0.04 });
    k.noise(o, t, { filter: 'bandpass', f: 3400 * p, q: 3, d: 0.06, v: 0.08 });
    return 0.3;
  },
  rail_leave: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 3000 * p, f2: 1600 * p, q: 3, d: 0.18, v: 0.09 });
    k.tone(o, t, { type: 'triangle', f: 1320 * p, f2: 1180 * p, d: 0.3, v: 0.04 });
    return 0.35;
  },
  steam_vent: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 700 * p, f2: 300, a: 0.01, d: 0.12, v: 0.16 }); // (the puff)
    k.noise(o, t + 0.03, { filter: 'highpass', f: 2800 * p, a: 0.05, d: 0.5, v: 0.1 }); // (the hiss)
    return 0.6;
  },
  steam_launch: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 400 * p, f2: 2600 * p, q: 1.2, a: 0.08, d: 0.6, v: 0.24 });
    k.tone(o, t, { type: 'sine', f: 180 * p, f2: 520 * p, a: 0.1, d: 0.5, v: 0.05 });
    return 0.7;
  },
  hammer_swing: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 300 * p, f2: 900 * p, q: 1.4, a: 0.12, d: 0.3, v: 0.18 }) - t,
  hammer_hit: (k, o, t, p) => {
    // (a metal clang: inharmonic ringing partials over a short dull knock, no drum thump)
    [[523, 0.09], [1219, 0.06], [1874, 0.035], [2690, 0.02]].forEach(([f, v], i) => k.tone(o, t, { type: 'triangle', f: f * p, d: 0.7 - i * 0.12, v }));
    k.tone(o, t, { f: 150 * p, f2: 110, a: 0.006, d: 0.18, v: 0.16 });
    k.noise(o, t, { filter: 'bandpass', f: 2400, f2: 700, q: 1.5, d: 0.12, v: 0.2 });
    return 0.6;
  },
  saw_hit: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 3200 * p, f2: 1800, q: 4, d: 0.35, v: 0.28 });
    k.tone(o, t, { type: 'sawtooth', f: 1150 * p, f2: 700 * p, d: 0.3, v: 0.05 });
    k.tone(o, t, { f: 110 * p, f2: 70, d: 0.2, v: 0.25 });
    return 0.45;
  },
  saw_spin: (k, o, t, p) => k.tone(o, t, { type: 'sawtooth', f: 900 * p, d: 0.3, v: 0.02 }) - t, // (a drone when looped)
  conveyor_belt: (k, o, t, p) => k.noise(o, t, { filter: 'lowpass', f: 320 * p, a: 0.1, d: 0.6, v: 0.08 }) - t, // (a drone when looped)
  gear_collect: (k, o, t, p) => {
    // (a bright metallic ting with a tiny sparkle; `p` rises on a streak)
    k.tone(o, t, { type: 'triangle', f: 1760 * p, d: 0.22, v: 0.08 });
    k.tone(o, t, { type: 'sine', f: 2640 * p, d: 0.12, v: 0.035 });
    [3520, 4186].forEach((f, i) => k.tone(o, t + 0.05 + i * 0.04, { type: 'sine', f: f * p, d: 0.06, v: 0.015 }));
    return 0.3;
  },
  gear_spin_pickup: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 600 * p, f2: 1500 * p, a: 0.02, d: 0.16, v: 0.035 });
    k.noise(o, t, { filter: 'bandpass', f: 2000 * p, f2: 4000 * p, q: 3, d: 0.15, v: 0.04 });
    return 0.2;
  },
  gear_reward: (k, o, t, p) => {
    // (a short rising arpeggio of bright triangle bells over a soft low ring)
    [1046, 1318, 1568, 2093].forEach((f, i) => k.tone(o, t + i * 0.08, { type: 'triangle', f: f * p, d: 0.32, v: 0.07 }));
    k.tone(o, t, { f: 523 * p, d: 0.6, v: 0.05 });
    return 0.75;
  },
  horse_clank: (k, o, t, p) => {
    // (gentle metal clinks of the brass plates: two light, slightly different tings, soft)
    k.tone(o, t, { type: 'triangle', f: (1900 + Math.random() * 300) * p, d: 0.08, v: 0.03 });
    k.tone(o, t + 0.05 + Math.random() * 0.03, { type: 'triangle', f: (2500 + Math.random() * 300) * p, d: 0.06, v: 0.02 });
    return 0.15;
  },
  horse_stumble: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 900 * p, f2: 250, d: 0.14, v: 0.3 });
    k.tone(o, t + 0.06, { type: 'triangle', f: 1600 * p, d: 0.1, v: 0.03 });
    k.tone(o, t + 0.11, { type: 'triangle', f: 2100 * p, d: 0.08, v: 0.025 });
    return 0.25;
  },
  tick_beep: (k, o, t, p) => {
    // (a cute short chirp: a quick upward blip)
    const f = (1350 + Math.random() * 350) * p;
    k.tone(o, t, { type: 'square', f, f2: f * 1.25, a: 0.004, d: 0.045, v: 0.04 });
    return 0.06;
  },
  tick_hover: (k, o, t, p) => k.tone(o, t, { type: 'sawtooth', f: 160 * p, a: 0.1, d: 0.4, v: 0.015 }) - t, // (a drone when looped)
  // --- Robots ---
  robot_walk: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 500 * p, f2: 180, a: 0.008, d: 0.12, v: 0.2 });
    k.tone(o, t, { type: 'triangle', f: 640 * p, d: 0.08, v: 0.025 });
    return 0.16;
  },
  robot_swing: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 700 * p, f2: 2200 * p, q: 1.6, a: 0.04, d: 0.2, v: 0.16 });
    k.tone(o, t + 0.12, { type: 'triangle', f: 1400 * p, d: 0.12, v: 0.025 });
    return 0.3;
  },
  robot_hit: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 420 * p, f2: 300 * p, d: 0.25, v: 0.09 });
    k.tone(o, t, { type: 'square', f: 860 * p, d: 0.12, v: 0.025 });
    k.noise(o, t, { filter: 'bandpass', f: 1800 * p, q: 2, d: 0.08, v: 0.12 });
    return 0.3;
  },
  robot_die: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 1200 * p, f2: 200, d: 0.5, v: 0.25 });
    for (let i = 0; i < 6; i++) k.tone(o, t + 0.12 + i * 0.09 + Math.random() * 0.04, { type: 'triangle', f: (700 + Math.random() * 900) * p, d: 0.09, v: 0.035 });
    return 0.9;
  },
  robot_alert: (k, o, t, p) => {
    k.tone(o, t, { type: 'square', f: 1180 * p, d: 0.07, v: 0.035 });
    k.tone(o, t + 0.1, { type: 'square', f: 1570 * p, d: 0.09, v: 0.035 });
    return 0.22;
  },
  boss_mech_step: (k, o, t, p) => {
    // (a deep, soft, heavy thud: low, slow attack — felt, not a drum)
    k.tone(o, t, { f: 62 * p, f2: 44, a: 0.02, d: 0.28, v: 0.22 });
    k.noise(o, t, { filter: 'lowpass', f: 600 * p, f2: 150, a: 0.01, d: 0.2, v: 0.15 });
    k.tone(o, t + 0.04, { type: 'triangle', f: 380 * p, d: 0.1, v: 0.02 });
    return 0.35;
  },
  boss_mech_roar: (k, o, t, p) => {
    k.vowel(o, t, { f: 70 * p, f2: 55 * p, a: 0.2, d: 1.2, v: 0.22, formants: [500, 1300] });
    k.noise(o, t, { filter: 'bandpass', f: 900 * p, f2: 500, q: 3, a: 0.2, d: 1.1, v: 0.12 });
    k.tone(o, t, { type: 'sawtooth', f: 140 * p, f2: 110 * p, a: 0.2, d: 1.0, v: 0.03 });
    return 1.4;
  },
  boss_mech_death: (k, o, t, p) => {
    k.tone(o, t, { f: 80 * p, f2: 35, a: 0.05, d: 1.4, v: 0.25 });
    k.noise(o, t, { filter: 'lowpass', f: 1400 * p, f2: 120, a: 0.05, d: 1.6, v: 0.25 });
    for (let i = 0; i < 9; i++) k.tone(o, t + 0.3 + i * 0.13 + Math.random() * 0.05, { type: 'triangle', f: (500 + Math.random() * 1100) * p, d: 0.1, v: 0.03 });
    return 2;
  },
  // --- The elements ---
  element_collect: (k, o, t, p) => {
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => k.tone(o, t + i * 0.06, { type: 'sine', f: f * p, d: 0.6, v: 0.035 }));
    k.tone(o, t, { type: 'sine', f: 130.8 * p, a: 0.01, d: 2, v: 0.14 }); // (the deep chime)
    k.tone(o, t, { type: 'sine', f: 261.6 * p, a: 0.01, d: 1.4, v: 0.05 });
    return 2.1;
  },
  element_power_up: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 220 * p, f2: 880 * p, a: 0.6, d: 0.3, v: 0.06 });
    k.noise(o, t, { filter: 'bandpass', f: 600 * p, f2: 4000 * p, q: 1.2, a: 0.6, d: 0.3, v: 0.08 });
    [523, 659, 784, 1046].forEach((f) => k.tone(o, t + 0.85, { type: 'triangle', f: f * p, d: 1, v: 0.04 }));
    return 1.9;
  },
  // --- Amy (Part 2) ---
  amy_magic_cast: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 600 * p, f2: 2800 * p, q: 1.5, a: 0.1, d: 0.5, v: 0.16 });
    [740, 932, 1108].forEach((f, i) => k.tone(o, t + i * 0.07, { type: 'sine', f: f * p, f2: f * 1.12 * p, d: 0.5, v: 0.03 }));
    return 0.7;
  },
  amy_hit_reflect: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 1760 * p, d: 0.5, v: 0.08 });
    k.tone(o, t, { type: 'triangle', f: 2489 * p, d: 0.35, v: 0.05 });
    k.noise(o, t, { filter: 'highpass', f: 3500 * p, d: 0.15, v: 0.1 });
    return 0.55;
  },
  amy_eyes_glow: (k, o, t, p) => {
    k.tone(o, t, { type: 'sine', f: 330 * p, f2: 440 * p, a: 0.8, d: 0.8, v: 0.05 });
    k.tone(o, t, { type: 'sine', f: 349 * p, f2: 466 * p, a: 0.8, d: 0.8, v: 0.035 }); // (a little beating: eerie)
    return 1.7;
  },
  // --- The Fire Element level ---
  chest_open: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 500 * p, f2: 900 * p, q: 6, a: 0.05, d: 0.35, v: 0.12 }); // (the creak)
    [1318, 1760, 2093].forEach((f, i) => k.tone(o, t + 0.35 + i * 0.06, { type: 'sine', f: f * p, d: 0.3, v: 0.03 }));
    return 0.8;
  },
  chest_locked: (k, o, t, p) => {
    k.tone(o, t, { f: 140 * p, f2: 100, d: 0.12, v: 0.2 });
    k.noise(o, t, { filter: 'lowpass', f: 700 * p, d: 0.08, v: 0.15 });
    return 0.18;
  },
  cog_key_collect: (k, o, t, p) => {
    [0, 0.05, 0.1].forEach((dt) => k.noise(o, t + dt, { filter: 'bandpass', f: 3000 * p, q: 5, d: 0.02, v: 0.06 })); // (clockwork clicks)
    k.tone(o, t + 0.16, { type: 'sine', f: 1568 * p, d: 0.7, v: 0.06 });
    k.tone(o, t + 0.16, { type: 'sine', f: 2349 * p, d: 0.4, v: 0.025 });
    return 0.9;
  },
  cog_key_sparkle: (k, o, t, p) => {
    // a cog-icon sparkle: three quick rising twinkles over a tiny click
    k.noise(o, t, { filter: 'bandpass', f: 4200 * p, q: 6, d: 0.02, v: 0.05 });
    [2093, 2637, 3136].forEach((f, i) => k.tone(o, t + 0.03 + i * 0.07, { type: 'sine', f: f * p, d: 0.18, v: 0.045 }));
    return 0.5;
  },
  elixir_drink: (k, o, t, p) => {
    [0, 0.22, 0.44].forEach((dt) => k.noise(o, t + dt, { filter: 'bandpass', f: 600 * p, q: 3, a: 0.02, d: 0.1, v: 0.12 }));
    k.tone(o, t + 0.6, { type: 'sine', f: 660 * p, f2: 990 * p, a: 0.1, d: 0.5, v: 0.04 });
    return 1.2;
  },
  fire_blast_cast: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 300 * p, f2: 1800 * p, q: 1, a: 0.06, d: 0.4, v: 0.22 });
    k.noise(o, t + 0.05, { filter: 'lowpass', f: 1200 * p, d: 0.35, v: 0.1 });
    return 0.5;
  },
  fire_blast_hit: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 2000 * p, f2: 300, d: 0.4, v: 0.25 });
    for (let i = 0; i < 6; i++) k.noise(o, t + 0.05 + i * 0.05 + Math.random() * 0.03, { filter: 'highpass', f: 2500 * p, d: 0.015, v: 0.08 }); // (crackles)
    return 0.55;
  },
  burn_loop: (k, o, t, p) => k.noise(o, t, { filter: 'lowpass', f: 1000 * p, d: 0.3, v: 0.06 }) - t, // (a drone when looped)
  furnace_guardian_stomp: (k, o, t, p) => {
    k.tone(o, t, { f: 55 * p, f2: 38, a: 0.02, d: 0.45, v: 0.3 });
    k.noise(o, t, { filter: 'lowpass', f: 300 * p, f2: 60, a: 0.03, d: 0.9, v: 0.25 }); // (the rumble)
    return 1;
  },
  furnace_guardian_steam_burst: (k, o, t, p) => {
    k.noise(o, t, { filter: 'highpass', f: 1800 * p, a: 0.02, d: 0.9, v: 0.22 });
    k.noise(o, t, { filter: 'lowpass', f: 600 * p, a: 0.01, d: 0.2, v: 0.2 });
    return 1;
  },
  furnace_guardian_charge: (k, o, t, p) => {
    k.vowel(o, t, { f: 60 * p, f2: 110 * p, a: 0.3, d: 0.7, v: 0.2, formants: [450, 1100] });
    k.noise(o, t, { filter: 'bandpass', f: 300 * p, f2: 1400 * p, q: 1.5, a: 0.4, d: 0.6, v: 0.12 });
    return 1.1;
  },
  furnace_guardian_roar: (k, o, t, p) => {
    k.vowel(o, t, { f: 80 * p, f2: 60 * p, a: 0.15, d: 1.1, v: 0.24, formants: [550, 1000] });
    k.noise(o, t, { filter: 'lowpass', f: 900 * p, a: 0.2, d: 1, v: 0.14 }); // (the furnace's breath)
    return 1.3;
  },
  stomp_warning: (k, o, t, p) => {
    // (a low tone rising over 1.4 s with four quickening ticks: the shockwave is coming — soft, not a drum)
    k.tone(o, t, { type: 'sine', f: 70 * p, f2: 260 * p, a: 1.2, d: 0.3, v: 0.16 });
    [0.35, 0.7, 1.0, 1.25].forEach((dt) => k.tone(o, t + dt, { type: 'triangle', f: 880 * p, d: 0.06, v: 0.07 }));
    return 1.6;
  },
  steam_barrier_close: (k, o, t, p) => {
    k.noise(o, t, { filter: 'highpass', f: 1200 * p, f2: 3500 * p, a: 0.3, d: 0.4, v: 0.16 });
    k.tone(o, t + 0.65, { f: 90 * p, f2: 70, d: 0.2, v: 0.15 }); // (the seal)
    return 0.9;
  },
  steam_barrier_open: (k, o, t, p) => {
    k.tone(o, t, { f: 80 * p, f2: 100, d: 0.15, v: 0.12 });
    k.noise(o, t + 0.05, { filter: 'highpass', f: 3500 * p, f2: 1200 * p, a: 0.05, d: 0.8, v: 0.15 });
    return 0.9;
  },
  element_orb_hum: (k, o, t, p) => k.tone(o, t, { type: 'sine', f: 220 * p, a: 0.2, d: 0.8, v: 0.04 }) - t, // (a drone when looped)
  tick_whir: (k, o, t, p) => {
    k.tone(o, t, { type: 'square', f: 880 * p, f2: 1320 * p, a: 0.02, d: 0.18, v: 0.04 });
    k.noise(o, t, { filter: 'bandpass', f: 1800 * p, q: 3, a: 0.05, d: 0.35, v: 0.06 });
    return 0.45;
  },
  gate_slam: (k, o, t, p) => {
    k.tone(o, t, { f: 65 * p, f2: 30, d: 0.9, v: 0.9 });
    k.noise(o, t, { filter: 'lowpass', f: 2500, f2: 100, d: 0.6, v: 0.7 });
    k.tone(o, t, { type: 'square', f: 180 * p, f2: 120, d: 0.25, v: 0.1 });
    return 1;
  },
  sandstorm_wind: (k, o, t, p) => k.noise(o, t, { filter: 'bandpass', f: 600 * p, q: 0.8, a: 0.4, d: 1.2, v: 0.3 }) - t, // (a drone when looped)
  thunder_soft: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 400 * p, f2: 80, a: 0.08, d: 2.2, v: 0.45 });
    k.noise(o, t + 0.3, { filter: 'lowpass', f: 250, f2: 60, a: 0.2, d: 1.5, v: 0.3 });
    return 2.5;
  },
  // --- Hearts ---
  heart_lost: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 660 * p, f2: 330 * p, d: 0.2, v: 0.18 });
    return 0.22;
  },
  heart_gained: (k, o, t, p) => {
    k.tone(o, t, { type: 'triangle', f: 660 * p, d: 0.12, v: 0.16 });
    k.tone(o, t + 0.08, { type: 'triangle', f: 990 * p, d: 0.2, v: 0.16 });
    return 0.3;
  },
  // A soft, muffled lub-dub (gentle attack, low level) — felt, not a drum.
  low_health_beat: (k, o, t, p) => {
    k.tone(o, t, { f: 58 * p, f2: 46, a: 0.025, d: 0.14, v: 0.3 });
    k.tone(o, t + 0.24, { f: 52 * p, f2: 42, a: 0.025, d: 0.16, v: 0.22 });
    return 0.45;
  },
  // --- Extras ---
  rescue_pulse: (k, o, t, p) => {
    k.tone(o, t, { type: 'sine', f: 220 * p, f2: 880 * p, a: 0.01, d: 0.4, v: 0.25 });
    k.noise(o, t, { filter: 'bandpass', f: 800, f2: 3000, q: 1, d: 0.4, v: 0.25 });
    return 0.45;
  },
  stumble: (k, o, t, p) => {
    k.noise(o, t, { filter: 'lowpass', f: 900 * p, f2: 200, d: 0.12, v: 0.45 });
    k.noise(o, t + 0.1, { filter: 'lowpass', f: 700 * p, f2: 180, d: 0.1, v: 0.35 });
    return 0.25;
  },
  // --- Voice efforts ---
  aj_hup: (k, o, t, p) => k.vowel(o, t, { f: 300 * p, f2: 380 * p, a: 0.01, d: 0.12, v: 0.3, formants: [650, 1700] }) - t,
  aj_hya: (k, o, t, p) => {
    k.vowel(o, t, { f: 330 * p, f2: 260 * p, a: 0.01, d: 0.18, v: 0.32, formants: [800, 1300] });
    k.noise(o, t, { filter: 'highpass', f: 3000, d: 0.06, v: 0.06 });
    return 0.2;
  },
  aj_ugh: (k, o, t, p) => k.vowel(o, t, { f: 240 * p, f2: 170 * p, a: 0.01, d: 0.2, v: 0.32, formants: [600, 1000] }) - t,
  aj_cough: (k, o, t, p) => {
    // (two short, husky bursts: the second smaller)
    const a = k.noise(o, t, { filter: 'bandpass', f: 850 * p, q: 1.1, a: 0.006, d: 0.12, v: 0.34 });
    k.vowel(o, t, { f: 150 * p, f2: 120 * p, a: 0.006, d: 0.1, v: 0.12, formants: [500, 900] });
    const b = k.noise(o, t + 0.22, { filter: 'bandpass', f: 780 * p, q: 1.1, a: 0.006, d: 0.1, v: 0.22 });
    return Math.max(a, b) - t;
  },
  amy_gasp: (k, o, t, p) => {
    k.noise(o, t, { filter: 'bandpass', f: 1800 * p, q: 2, a: 0.03, d: 0.2, v: 0.25 });
    k.vowel(o, t + 0.02, { f: 480 * p, f2: 560 * p, a: 0.03, d: 0.15, v: 0.15, formants: [800, 2400], type: 'triangle' });
    return 0.25;
  },
};

/**
 * Drones: continuous loops with a live level. (kit, out, p) → { level(v, t), stop(t) }.
 * Names without one loop by re-triggering their one-shot (pulse loops, audio.js).
 */
export const DRONES = {
  sandstorm_wind: (k, out, p) => windDrone(k, out, p, { f: 300, q: 0.6, lfo: 0.12, depth: 160 }), // (a soft low breeze)
  // The river while the horse is in it: a quiet, slowly moving wash.
  river_flow: (k, out, p) => windDrone(k, out, p, { f: 1000, q: 0.5, lfo: 0.3, depth: 250 }),
  // A rail grind: a bright, wobbling steel scrape with a fast sparkle (its pitch follows the speed).
  rail_grind: (k, out, p) => windDrone(k, out, p, { f: 2400, q: 3, lfo: 9, depth: 600, crackle: { rate: 27, depth: 0.25 } }),
  // Gearhaven ambience: all very quiet, slow-moving (no pulse).
  gear_turn: (k, out, p) => windDrone(k, out, p, { f: 140, q: 2.5, lfo: 0.35, depth: 40, gain: 0.8 }),
  steam_hiss: (k, out, p) => windDrone(k, out, p, { f: 4200, q: 0.7, lfo: 0.2, depth: 900, gain: 0.5 }),
  factory_hum: (k, out, p) => humDrone(k, out, p, { f: 55, partials: [1, 2, 3], wobble: 0.15, cutoff: 400, gain: 0.5 }),
  // The ride's machines.
  saw_spin: (k, out, p) => humDrone(k, out, p, { f: 820, partials: [1, 1.5], type: 'sawtooth', wobble: 6, cutoff: 2600, gain: 0.07 }),
  conveyor_belt: (k, out, p) => windDrone(k, out, p, { f: 260, q: 1.2, lfo: 3, depth: 60, gain: 0.6 }),
  tick_hover: (k, out, p) => humDrone(k, out, p, { f: 150, partials: [1, 2], type: 'sawtooth', wobble: 18, cutoff: 700, gain: 0.05 }),
  // The Fire level.
  gear_roll: (k, out, p) => windDrone(k, out, p, { f: 520, q: 1.8, lfo: 11, depth: 160, gain: 0.5, crackle: { rate: 23, depth: 0.3 } }), // (the Gear Wheel rolling: a rumbling, ticking whir)
  burn_loop: (k, out, p) => windDrone(k, out, p, { f: 900, q: 0.8, lfo: 0.5, depth: 300, gain: 0.5, crackle: { rate: 19, depth: 0.5 } }),
  element_orb_hum: (k, out, p) => humDrone(k, out, p, { f: 220, partials: [1, 1.5, 2], wobble: 0.3, cutoff: 1500, gain: 0.25, rise: 6 }),
  boss_fire_breath: (k, out, p) => {
    const ctx = k.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(out);
    const src = ctx.createBufferSource();
    src.buffer = k.noiseBuffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100 * p;
    src.connect(lp).connect(g);
    // (a crackle: fast random-ish amplitude wobble)
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain).connect(g.gain);
    src.start();
    lfo.start();
    return {
      level: (v, t) => g.gain.setTargetAtTime(v * 0.6, t, 0.08),
      stop: (t) => {
        g.gain.setTargetAtTime(0, t, 0.1);
        src.stop(t + 0.6);
        lfo.stop(t + 0.6);
      },
    };
  },
};

/**
 * A howling wind: band-passed noise whose centre sweeps slowly (also the music's wind layer).
 * `gain` scales it; `crackle` adds a fast amplitude flutter (sparks, a fire). `pitch(p, t)` moves
 * its centre live (a rail grind's speed).
 */
export function windDrone(k, out, p, { f, q, lfo, depth, gain = 1, crackle = null }) {
  const ctx = k.ctx;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(out);
  const src = ctx.createBufferSource();
  src.buffer = k.noiseBuffer;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * p;
  bp.Q.value = q;
  const osc = ctx.createOscillator();
  osc.frequency.value = lfo;
  const depthGain = ctx.createGain();
  depthGain.gain.value = depth;
  osc.connect(depthGain).connect(bp.frequency);
  const shaped = ctx.createGain();
  shaped.gain.value = 1;
  src.connect(bp).connect(shaped).connect(g);
  let flutter = null;
  if (crackle) {
    flutter = ctx.createOscillator();
    flutter.type = 'square';
    flutter.frequency.value = crackle.rate;
    const fd = ctx.createGain();
    fd.gain.value = crackle.depth;
    flutter.connect(fd).connect(shaped.gain);
    flutter.start();
  }
  src.start();
  osc.start();
  return {
    level: (v, t) => g.gain.setTargetAtTime(max(0, v) * gain, t, 0.3),
    pitch: (q2, t) => bp.frequency.setTargetAtTime(f * max(0.05, q2), t, 0.1),
    stop: (t) => {
      g.gain.setTargetAtTime(0, t, 0.3);
      src.stop(t + 2);
      osc.stop(t + 2);
      flutter?.stop(t + 2);
    },
  };
}

/** A soft hum: a few harmonics through a low-pass, wobbling a little (machines, a propeller, an orb; `rise` s to swell in). */
export function humDrone(k, out, p, { f, partials = [1], type = 'sine', wobble = 0.2, cutoff = 800, gain = 1, rise = 0 }) {
  const ctx = k.ctx;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.connect(g);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = wobble;
  const oscs = partials.map((m, i) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * m * p;
    const pg = ctx.createGain();
    pg.gain.value = 1 / (i + 1);
    const wd = ctx.createGain();
    wd.gain.value = f * m * 0.01; // (a gentle wobble of the pitch)
    lfo.connect(wd).connect(o.frequency);
    o.connect(pg).connect(lp);
    o.start();
    return { o, m };
  });
  lfo.start();
  return {
    level: (v, t) => g.gain.setTargetAtTime(max(0, v) * gain, t, rise ? rise / 3 : 0.3),
    pitch: (q2, t) => oscs.forEach(({ o, m }) => o.frequency.setTargetAtTime(f * m * max(0.05, q2), t, 0.1)),
    stop: (t) => {
      g.gain.setTargetAtTime(0, t, 0.3);
      for (const { o } of oscs) o.stop(t + 2);
      lfo.stop(t + 2);
    },
  };
}

/** A synthesized "talking" blip for one character (CONFIG.audio.voice.characters). */
export function voiceBlip(k, out, t, c) {
  const f = c.freq * (1 + (Math.random() * 2 - 1) * c.jitter);
  const o = k.ctx.createOscillator();
  o.type = c.type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.92, t + c.length);
  const bp = k.ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = c.formant;
  o.connect(bp).connect(k.env(out, t, 0.006, c.length, c.volume));
  o.start(t);
  o.stop(t + c.length + 0.03);
  return c.length;
}
