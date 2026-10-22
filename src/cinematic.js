import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';

const CI = CONFIG.cinematic;
const GD = CI.guard;
const { smoothstep } = THREE.MathUtils;

/**
 * Plays scripted cutscenes: `play(steps)` runs the steps in order and resolves when they are
 * done (or skipped). Driven by `update(dt)` from the game loop; no timers, so it pauses with
 * the game and runs headless in tests.
 *
 * Steps:
 *   { camera: { pos, look, duration?, wait?, fov?, subject?, soften? } }  move the camera
 *       (pos / look: [x,y,z], THREE.Vector3, or a function returning one, evaluated when the
 *       move starts; with `follow: true` every frame, tracking a moving subject until the next
 *       camera step). With `wait: false` the next step starts at once (e.g. a push-in during a
 *       line). `fov` eases the field of view; `subject` (a body name): other characters in front
 *       of it fade (shots without one fade nobody for that); `soften` (body names) are drawn
 *       soft while on screen.
 *
 * Every frame the camera is guarded (see CONFIG.cinematic.guard and `bodies`): it keeps
 * `minDist` from every character, stays above the ground and out of solids, and characters
 * too close or in front of the subject fade.
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
    // Characters the camera keeps clear of and fades: [{ name, shape() → {feet, height, radius} | null, fade(o) }].
    this.bodies = [];
    this.opacity = new Map(); // body name → current opacity
    this.shot = { subject: null, soften: [] };
    this.guardLog = { pushes: 0 }; // (tests)
    this.shakeT = 0;
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
    this.shot = { subject: null, soften: [] };
    this.baseFov = this.cam.camera.fov;
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

  /** Screen shake on the cutscene camera: amplitude in units, decaying over `time` s. */
  shake(amp, time) {
    this.shakeAmp = amp;
    this.shakeTime = this.shakeT = time;
  }

  /** Abort without running anything (full game reset). */
  stop() {
    this.shakeT = 0;
    this.#unfade();
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
    const camera = this.cam.camera;
    for (const m of this.moves) {
      if (m.follow) {
        // (a tracking shot: its target is re-evaluated every frame)
        m.toPos = m.follow.resolve(m.follow.pos);
        m.toLook = m.follow.resolve(m.follow.look);
      }
      m.t = Math.min(m.duration, m.t + dt);
      const k = smoothstep(m.t / m.duration, 0, 1);
      camera.position.lerpVectors(m.fromPos, m.toPos, k);
      this.look.lerpVectors(m.fromLook, m.toLook, k);
      if (m.toFov !== null) {
        camera.fov = m.fromFov + (m.toFov - m.fromFov) * k;
        camera.updateProjectionMatrix();
      }
    }
    this.moves = this.moves.filter((m) => m.t < m.duration || m.follow);
    this.#guard(dt);
    if (this.shakeT > 0) {
      // (a heavy moment: the gates slamming shut)
      this.shakeT = Math.max(0, this.shakeT - dt);
      const a = this.shakeAmp * (this.shakeT / this.shakeTime);
      camera.position.x += (Math.random() - 0.5) * 2 * a;
      camera.position.y += (Math.random() - 0.5) * 2 * a;
      camera.position.z += (Math.random() - 0.5) * 2 * a;
    }
    camera.lookAt(this.look);

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
        fromFov: this.cam.camera.fov,
        toFov: C.fov ?? (C.fov === null ? this.baseFov : null), // (fov: null → back to the normal one)
        duration: Math.max(1e-3, C.duration ?? CI.defaultMove),
        t: 0,
        follow: C.follow ? { pos: C.pos, look: C.look, resolve } : null,
      };
      this.moves = this.moves.filter((m) => !m.follow); // (a new shot ends a tracking one)
      this.shot = { subject: C.subject ?? null, soften: C.soften ?? [] };
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

  /**
   * The camera's rules for every shot: keep `minDist` from every character (pushed out), stay
   * above the ground and out of solids (pulled toward the look point), and fade characters
   * that are still too close, stand in front of the subject, or are softened by the shot.
   */
  #guard(dt) {
    const p = this.cam.camera.position;
    const shapes = this.bodies.map((b) => ({ b, s: b.shape() })).filter((x) => x.s);
    for (let pass = 0; pass < GD.pushPasses; pass++) {
      let pushed = false;
      for (const { s } of shapes) {
        const { d, dx, dz } = axisOffset(p, s);
        const need = GD.minDist + s.radius;
        if (d >= need) continue;
        const h = Math.hypot(dx, dz);
        if (h > 1e-4) {
          p.x += (dx / h) * (need - d);
          p.z += (dz / h) * (need - d);
        } else p.y = Math.max(p.y, s.feet.y + s.height + need); // (right above / below it: up)
        pushed = true;
      }
      if (!pushed) break;
      this.guardLog.pushes++;
    }
    const world = this.cam.world;
    if (world?.heightAt) p.y = Math.max(p.y, world.heightAt(p.x, p.z) + GD.groundClear);
    this.cam.pullOutOfSolids?.(p, this.look);
    // Fades.
    this.cam.camera.updateMatrixWorld();
    const k = dt > 0 ? 1 - Math.exp(-GD.fadeRate * dt) : 1;
    for (const { b, s } of shapes) {
      let target = 1;
      const { d } = axisOffset(p, s);
      if (d < GD.minDist + s.radius - 1e-3) target = GD.nearOpacity;
      else if (this.shot.subject && b.name !== this.shot.subject && occludes(p, this.look, s)) target = GD.occludeOpacity; // (only shots with a subject)
      else if (this.shot.soften.includes(b.name) && this.#onScreen(s)) target = GD.softOpacity;
      const o0 = this.opacity.get(b.name) ?? 1;
      const o = Math.abs(target - o0) < 1e-3 ? target : o0 + (target - o0) * k;
      this.opacity.set(b.name, o);
      b.fade(o);
    }
  }

  /** Any of the body (feet, middle, head) inside the view? */
  #onScreen(s) {
    const cam = this.cam.camera;
    for (const f of [0.15, 0.55, 0.9]) {
      const v = new THREE.Vector3(s.feet.x, s.feet.y + s.height * f, s.feet.z).project(cam);
      if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) return true;
    }
    return false;
  }

  /** Every character back to fully opaque (the cutscene ended or was skipped). */
  #unfade() {
    for (const b of this.bodies) b.fade(1);
    this.opacity.clear();
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
    this.#unfade();
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

/** Distance from `p` to a body's vertical axis segment (feet … feet + height), and the horizontal offset. */
function axisOffset(p, s) {
  const dx = p.x - s.feet.x;
  const dz = p.z - s.feet.z;
  const y = THREE.MathUtils.clamp(p.y, s.feet.y, s.feet.y + s.height);
  return { d: Math.hypot(dx, p.y - y, dz), dx, dz };
}

/** Does the body stand between the camera `p` and the look point (the line passes through it)? */
function occludes(p, look, s) {
  const seg = look.clone().sub(p);
  const len = seg.length();
  if (len < 1e-4) return false;
  for (let i = 1; i < 12; i++) {
    const q = p.clone().addScaledVector(seg, i / 12);
    if (q.distanceTo(look) < s.radius) break; // (the subject's own spot)
    if (axisOffset(q, s).d < s.radius) return true;
  }
  return false;
}
