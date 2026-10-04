import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';

const CI = CONFIG.cinematic;
const { smoothstep } = THREE.MathUtils;

/**
 * Plays scripted cutscenes: `play(steps)` runs the steps in order and resolves when they are
 * done (or skipped). Driven by `update(dt)` from the game loop; no timers, so it pauses with
 * the game and runs headless in tests.
 *
 * Steps:
 *   { camera: { pos, look, duration?, wait? } }  move the camera (pos / look: [x,y,z],
 *       THREE.Vector3, or a function returning one, evaluated when the move starts). With
 *       `wait: false` the next step starts at once (e.g. a push-in during a line).
 *   { say: speakerKey, text, cues? }  dialogue box with a typewriter; tap completes the line,
 *       tap again continues. cues: [{ at: 'substring', call }] fire as the typewriter reaches
 *       the substring (or when the line is completed by a tap).
 *   { wait: seconds }
 *   { call: fn, essential? }  callback (may return a Promise, which is awaited). Essential
 *       callbacks also run when the cutscene is skipped (they carry the story forward).
 *
 * The view (DOM in ui.js, a stub in tests) gets: show(), hide(),
 * dialogue(speaker, typedText, complete), clearDialogue().
 */
export class Cinematic {
  /** @param {import('./camera.js').FollowCamera} cam */
  constructor(cam, view = null) {
    this.cam = cam;
    this.view = view;
    this.active = false;
    this.look = new THREE.Vector3();
    this.moves = [];
    this.log = []; // what happened (tests / debugging)
  }

  /** @returns {Promise<{skipped: boolean}>} */
  play(steps) {
    if (this.active) this.stop();
    this.steps = steps;
    this.index = -1;
    this.current = null;
    this.moves = [];
    this.blocked = false;
    this.active = true;
    this.skipped = false;
    this.log = [];
    // Start looking where the camera already looks.
    const dir = new THREE.Vector3();
    this.cam.camera.getWorldDirection(dir);
    this.look.copy(this.cam.camera.position).addScaledVector(dir, 10);
    this.view?.show();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.#next();
    });
  }

  /** Tap / click: finish the line being typed, or continue after it. */
  tap() {
    const c = this.current;
    if (!this.active || !c || !c.step.say) return;
    if (c.shown < c.step.text.length) {
      c.shown = c.step.text.length;
      this.#fireCues(c);
      this.#showLine(c);
    } else this.#next();
  }

  /** Skip the rest: only essential callbacks still run (in order); then it ends. */
  async skip() {
    if (!this.active || this.skipping) return;
    this.skipping = true;
    this.skipped = true;
    this.log.push('skip');
    const rest = this.steps.slice(this.index + (this.current?.ran ? 1 : 0));
    this.current = null;
    this.moves = [];
    for (const step of rest) {
      if (step.call && step.essential) {
        this.log.push('call');
        await step.call();
      }
    }
    this.skipping = false;
    this.#finish();
  }

  /** Abort without running anything (full game reset). */
  stop() {
    this.active = false;
    this.current = null;
    this.moves = [];
    this.skipping = false;
    this.view?.hide();
    this.resolve = null;
  }

  update(dt) {
    if (!this.active) return;
    // Camera moves (several may overlap; the latest wins where they overlap).
    for (const m of this.moves) {
      m.t = Math.min(m.duration, m.t + dt);
      const k = smoothstep(m.t / m.duration, 0, 1);
      this.cam.camera.position.lerpVectors(m.fromPos, m.toPos, k);
      this.look.lerpVectors(m.fromLook, m.toLook, k);
    }
    this.cam.camera.lookAt(this.look);
    this.moves = this.moves.filter((m) => m.t < m.duration);

    const c = this.current;
    if (!c || this.blocked || this.skipping) return;
    const step = c.step;
    if (step.say) {
      if (c.shown < step.text.length) {
        c.shown = Math.min(step.text.length, c.shown + CI.charsPerSecond * dt);
        this.#fireCues(c);
        this.#showLine(c);
      }
    } else if (step.wait !== undefined && !step.camera) {
      c.t += dt;
      if (c.t >= step.wait) this.#next();
    } else if (step.camera) {
      if (!c.move || c.move.t >= c.move.duration) this.#next();
    }
  }

  get typing() {
    const c = this.current;
    return !!(c && c.step.say && c.shown < c.step.text.length);
  }

  #next() {
    if (!this.active) return;
    this.index++;
    if (this.index >= this.steps.length) {
      this.#finish();
      return;
    }
    const step = this.steps[this.index];
    const c = { step, t: 0, shown: 0, cuesFired: new Set(), ran: false };
    this.current = c;
    if (step.camera) {
      const C = step.camera;
      const resolve = (v) => {
        const r = typeof v === 'function' ? v() : v;
        return r instanceof THREE.Vector3 ? r.clone() : new THREE.Vector3(...r);
      };
      const move = {
        fromPos: this.cam.camera.position.clone(),
        fromLook: this.look.clone(),
        toPos: resolve(C.pos),
        toLook: resolve(C.look),
        duration: Math.max(1e-3, C.duration ?? CI.defaultMove),
        t: 0,
      };
      this.moves.push(move);
      this.log.push('camera');
      c.ran = true;
      if (C.wait === false) this.#next();
      else c.move = move;
    } else if (step.say) {
      this.log.push(`say:${step.say}`);
      c.ran = true;
      this.#showLine(c);
    } else if (step.call) {
      this.log.push('call');
      c.ran = true;
      const r = step.call();
      if (r && typeof r.then === 'function') {
        this.blocked = true;
        r.then(() => {
          this.blocked = false;
          if (this.current === c) this.#next();
        });
      } else this.#next();
    } else if (step.wait !== undefined) {
      this.log.push('wait');
      c.ran = true;
    } else this.#next();
  }

  #fireCues(c) {
    for (const cue of c.step.cues ?? []) {
      const at = c.step.text.indexOf(cue.at);
      if (at >= 0 && c.shown >= at && !c.cuesFired.has(cue)) {
        c.cuesFired.add(cue);
        this.log.push('cue');
        cue.call();
      }
    }
  }

  #showLine(c) {
    const speaker = DIALOGUE.speakers[c.step.say] ?? c.step.say;
    this.view?.dialogue(speaker, c.step.text.slice(0, Math.floor(c.shown)), c.shown >= c.step.text.length);
  }

  #finish() {
    this.active = false;
    this.current = null;
    this.view?.clearDialogue();
    this.view?.hide();
    this.log.push('end');
    const r = this.resolve;
    this.resolve = null;
    r?.({ skipped: this.skipped });
  }
}
