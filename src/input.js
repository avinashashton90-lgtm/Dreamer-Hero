import { CONFIG } from './config.js';

const I = CONFIG.input;

/**
 * Unified input: floating joystick (left half), camera drag (right half), jump button,
 * keyboard (WASD/arrows/Space) and mouse drag. Every touch is tracked by pointerId so
 * moving, looking and jumping all work simultaneously.
 */
export class Input {
  constructor(surface, overlayRoot) {
    this.surface = surface;        // element receiving move/look touches (full screen)
    this.enabled = false;

    this.keys = new Set();
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookSensitivity = CONFIG.camera.dragSensitivity;
    this.jumpQueued = false;
    this.jumpHeld = false;
    this.mountQueued = false;
    this.gallopId = null; // pointer holding the Gallop button

    this.#buildDom(overlayRoot);
    this.#bind();
  }

  setEnabled(on) {
    this.enabled = on;
    this.controls.style.display = on ? '' : 'none';
    if (!on) this.#releaseAll();
  }

  /** Per-frame snapshot. Consumes one-shot events (jump press, look delta). */
  read() {
    let mx = 0;
    let my = 0;
    if (this.joy.id !== null) {
      mx = this.joy.x;
      my = this.joy.y;
    }
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    const out = {
      moveX: this.enabled ? mx : 0,
      moveY: this.enabled ? my : 0,
      jumpPressed: this.enabled && this.jumpQueued,
      mountPressed: this.enabled && this.mountQueued,
      gallop: this.enabled && (this.gallopId !== null || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      lookDX: this.enabled ? this.lookDX : 0,
      lookDY: this.enabled ? this.lookDY : 0,
      lookSensitivity: this.lookSensitivity,
    };
    this.jumpQueued = false;
    this.mountQueued = false;
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  #buildDom(root) {
    this.controls = document.createElement('div');
    this.controls.className = 'controls';

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyBase.style.width = this.joyBase.style.height = `${I.joystickRadius * 2}px`;
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);

    this.jumpBtn = document.createElement('button');
    this.jumpBtn.className = 'jump-btn';
    this.jumpBtn.textContent = 'JUMP';
    this.jumpBtn.style.width = this.jumpBtn.style.height = `${I.jumpButtonSize}px`;

    // Mount / Dismount: only shown when it applies (see setMountButton).
    this.mountBtn = document.createElement('button');
    this.mountBtn.className = 'mount-btn';
    this.mountBtn.style.display = 'none';
    this.mountBtn.style.bottom = `calc(max(28px, env(safe-area-inset-bottom) + 12px) + ${I.jumpButtonSize + 14}px)`;

    // Gallop (hold): left of Jump, only while riding, with a small stamina bar.
    this.gallopBtn = document.createElement('button');
    this.gallopBtn.className = 'gallop-btn';
    this.gallopBtn.style.display = 'none';
    this.gallopBtn.style.width = this.gallopBtn.style.height = `${I.gallopButtonSize}px`;
    this.gallopBtn.style.right = `calc(max(28px, env(safe-area-inset-right) + 12px) + ${I.jumpButtonSize + 16}px)`;
    this.gallopBtn.innerHTML = `<span class="gallop-label"></span><span class="stamina"><i></i></span>`;
    this.staminaFill = this.gallopBtn.querySelector('.stamina i');

    this.controls.append(this.joyBase, this.jumpBtn, this.mountBtn, this.gallopBtn);
    root.appendChild(this.controls);
    this.#hideJoystick();
  }

  #bind() {
    const s = this.surface;
    s.addEventListener('pointerdown', (e) => this.#onDown(e));
    window.addEventListener('pointermove', (e) => this.#onMove(e));
    window.addEventListener('pointerup', (e) => this.#onUp(e));
    window.addEventListener('pointercancel', (e) => this.#onUp(e));
    s.addEventListener('contextmenu', (e) => e.preventDefault());

    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.jumpHeld) this.jumpQueued = true;
      this.jumpHeld = true;
      this.jumpBtn.classList.add('pressed');
      this.jumpId = e.pointerId;
    });
    const jumpUp = (e) => {
      if (e.pointerId !== this.jumpId) return;
      this.jumpHeld = false;
      this.jumpId = null;
      this.jumpBtn.classList.remove('pressed');
    };
    window.addEventListener('pointerup', jumpUp);
    window.addEventListener('pointercancel', jumpUp);

    this.mountBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mountQueued = true;
    });

    this.gallopBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.gallopId = e.pointerId;
      this.gallopBtn.classList.add('pressed');
    });
    const gallopUp = (e) => {
      if (e.pointerId !== this.gallopId) return;
      this.gallopId = null;
      this.gallopBtn.classList.remove('pressed');
    };
    window.addEventListener('pointerup', gallopUp);
    window.addEventListener('pointercancel', gallopUp);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) this.mountQueued = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.jumpQueued = true;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.#releaseAll());
  }

  /**
   * Gallop button: shown while riding. `stamina` 0..1 fills the bar; `active` lights it up;
   * low stamina greys it out.
   */
  setGallopButton(visible, label, stamina = 1, active = false) {
    const display = visible ? '' : 'none';
    if (this.gallopBtn.style.display !== display) this.gallopBtn.style.display = display;
    if (!visible) return;
    const lbl = this.gallopBtn.firstElementChild;
    if (lbl.textContent !== label) lbl.textContent = label;
    this.staminaFill.style.transform = `scaleX(${stamina.toFixed(3)})`;
    this.gallopBtn.classList.toggle('active', active);
    this.gallopBtn.classList.toggle('tired', !active && stamina < CONFIG.horse.gallop.minToStart);
  }

  /** Shows/hides the Mount button and sets its label (Mount / Dismount). */
  setMountButton(visible, label) {
    const display = visible ? '' : 'none';
    if (this.mountBtn.style.display !== display) this.mountBtn.style.display = display;
    if (visible && this.mountBtn.textContent !== label) this.mountBtn.textContent = label;
  }

  #onDown(e) {
    if (!this.enabled) return;
    const isMouse = e.pointerType === 'mouse';
    const leftHalf = e.clientX < window.innerWidth / 2;

    // Touch on left half → joystick. Mouse anywhere / touch on right half → camera look.
    if (!isMouse && leftHalf && this.joy.id === null) {
      this.joy.id = e.pointerId;
      this.joy.ox = e.clientX;
      this.joy.oy = e.clientY;
      this.joy.x = this.joy.y = 0;
      this.#showJoystick(e.clientX, e.clientY);
    } else if (this.look.id === null && (isMouse || !leftHalf)) {
      this.look.id = e.pointerId;
      this.look.lx = e.clientX;
      this.look.ly = e.clientY;
      this.lookSensitivity = isMouse ? CONFIG.camera.mouseSensitivity : CONFIG.camera.dragSensitivity;
    } else {
      return;
    }
    e.preventDefault();
  }

  #onMove(e) {
    if (e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.ox;
      let dy = e.clientY - this.joy.oy;
      const r = I.joystickRadius;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      let nx = dx / r;
      let ny = -dy / r; // screen up = forward
      const mag = Math.hypot(nx, ny);
      if (mag < I.joystickDeadZone) nx = ny = 0;
      this.joy.x = nx;
      this.joy.y = ny;
    } else if (e.pointerId === this.look.id) {
      this.lookDX += e.clientX - this.look.lx;
      this.lookDY += e.clientY - this.look.ly;
      this.look.lx = e.clientX;
      this.look.ly = e.clientY;
    }
  }

  #onUp(e) {
    if (e.pointerId === this.joy.id) {
      this.joy.id = null;
      this.joy.x = this.joy.y = 0;
      this.#hideJoystick();
    }
    if (e.pointerId === this.look.id) this.look.id = null;
  }

  #releaseAll() {
    this.keys.clear();
    this.joy.id = null;
    this.joy.x = this.joy.y = 0;
    this.look.id = null;
    this.lookDX = this.lookDY = 0;
    this.jumpQueued = false;
    this.jumpHeld = false;
    this.jumpId = null;
    this.mountQueued = false;
    this.gallopId = null;
    this.gallopBtn?.classList.remove('pressed');
    this.jumpBtn.classList.remove('pressed');
    this.#hideJoystick();
  }

  #showJoystick(x, y) {
    const r = I.joystickRadius;
    this.joyBase.style.left = `${x - r}px`;
    this.joyBase.style.top = `${y - r}px`;
    this.joyBase.classList.add('active');
    this.joyKnob.style.transform = 'translate(0px, 0px)';
  }

  #hideJoystick() {
    // Rest position: lower-left, faded, so players know where to touch.
    const r = I.joystickRadius;
    this.joyBase.style.left = `calc(12vw - ${r}px)`;
    this.joyBase.style.top = `calc(70vh - ${r}px)`;
    this.joyBase.classList.remove('active');
    this.joyKnob.style.transform = 'translate(0px, 0px)';
  }
}
