import { CONFIG, DIALOGUE } from './config.js';

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
    this.attackQueued = this.dodgeQueued = false;
    this.abilityQueued = null;
    this.gallopId = null; // pointer holding the Gallop button
    this.attackQueued = false;
    this.dodgeQueued = false;
    this.abilityQueued = null; // 'batarang' | 'smokeBomb' | 'flashMode'
    this.debugQueued = { grantGems: false, damageHero: false, teleportArena: false, killBoss: false };

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
      attackPressed: this.enabled && this.attackQueued,
      dodgePressed: this.enabled && this.dodgeQueued,
      ability: this.enabled ? this.abilityQueued : null,
      debugGrantGems: this.enabled && this.debugQueued.grantGems,
      debugDamageHero: this.enabled && this.debugQueued.damageHero,
      debugTeleportArena: this.enabled && this.debugQueued.teleportArena,
      debugKillBoss: this.enabled && this.debugQueued.killBoss,
      lookDX: this.enabled ? this.lookDX : 0,
      lookDY: this.enabled ? this.lookDY : 0,
      lookSensitivity: this.lookSensitivity,
    };
    this.jumpQueued = false;
    this.mountQueued = false;
    this.attackQueued = false;
    this.dodgeQueued = false;
    this.abilityQueued = null;
    for (const k of Object.keys(this.debugQueued)) this.debugQueued[k] = false;
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

    // Right side: Attack (large), Jump, Dodge, ability buttons in an arc, Gallop, Mount.
    const place = (el, { size, right, bottom }) => {
      el.style.width = el.style.height = `${size}px`;
      el.style.right = `calc(env(safe-area-inset-right, 0px) + ${right - size / 2}px)`;
      el.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottom - size / 2}px)`;
    };
    const button = (cls, label) => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.innerHTML = `<span class="btn-label">${label}</span>`;
      return b;
    };
    this.attackBtn = button('attack-btn', DIALOGUE.attack);
    place(this.attackBtn, I.attackButton);
    this.jumpBtn = button('jump-btn', DIALOGUE.jump);
    place(this.jumpBtn, I.jumpButton);
    this.dodgeBtn = button('dodge-btn', DIALOGUE.dodge);
    place(this.dodgeBtn, I.dodgeButton);

    // Abilities: small buttons on an arc around Attack (greyed out while locked).
    this.abilityBtns = {};
    const A = I.abilityArc;
    ['batarang', 'smokeBomb', 'flashMode'].forEach((name, i) => {
      const b = button('ability-btn locked', DIALOGUE.abilityShort[name]);
      b.title = DIALOGUE.abilityNames[name];
      b.insertAdjacentHTML('beforeend', '<i class="cooldown"></i>' + (name === 'flashMode' ? '<span class="energy"><i></i></span>' : ''));
      const ang = (A.angles[i] * Math.PI) / 180;
      place(b, { size: A.size, right: I.attackButton.right + Math.cos(ang) * A.radius, bottom: I.attackButton.bottom + Math.sin(ang) * A.radius });
      this.abilityBtns[name] = b;
    });

    // Mount / Dismount: only shown when it applies (see setMountButton).
    this.mountBtn = document.createElement('button');
    this.mountBtn.className = 'mount-btn';
    this.mountBtn.style.display = 'none';
    this.mountBtn.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${I.mountButtonBottom}px)`;

    // Gallop (hold): left of Jump, only while riding, with a small stamina bar.
    this.gallopBtn = document.createElement('button');
    this.gallopBtn.className = 'gallop-btn';
    this.gallopBtn.style.display = 'none';
    place(this.gallopBtn, I.gallopButton);
    this.gallopBtn.innerHTML = `<span class="gallop-label"></span><span class="stamina"><i></i></span>`;
    this.staminaFill = this.gallopBtn.querySelector('.stamina i');

    this.controls.append(this.joyBase, this.attackBtn, this.jumpBtn, this.dodgeBtn, ...Object.values(this.abilityBtns), this.mountBtn, this.gallopBtn);
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

    const tap = (el, fn) =>
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
        el.classList.add('pressed');
        setTimeout(() => el.classList.remove('pressed'), 110);
      });
    tap(this.attackBtn, () => (this.attackQueued = true));
    tap(this.dodgeBtn, () => (this.dodgeQueued = true));
    for (const [name, b] of Object.entries(this.abilityBtns)) tap(b, () => (this.abilityQueued = name));

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
      if (!e.repeat) {
        if (e.code === 'KeyJ') this.attackQueued = true;
        if (e.code === 'KeyK') this.dodgeQueued = true;
        if (e.code === 'Digit1') this.abilityQueued = 'batarang';
        if (e.code === 'Digit2') this.abilityQueued = 'smokeBomb';
        if (e.code === 'Digit3') this.abilityQueued = 'flashMode';
        if (e.code === I.debugKeys.grantGems) this.debugQueued.grantGems = true;
        if (e.code === I.debugKeys.damageHero) this.debugQueued.damageHero = true;
        if (e.code === I.debugKeys.teleportArena) this.debugQueued.teleportArena = true;
        if (e.code === I.debugKeys.killBoss) this.debugQueued.killBoss = true;
      }
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

  /**
   * Combat buttons. While mounted only Batarang (and Jump / Gallop / Dismount) show.
   * @param {boolean} mounted
   * @param {import('./abilities.js').Abilities} ab
   */
  setCombatButtons(mounted, ab) {
    const show = (el, on) => {
      const d = on ? '' : 'none';
      if (el.style.display !== d) el.style.display = d;
    };
    // Riding: Dismount takes Dodge's (hidden) spot, clear of the gem counters.
    const mb = `calc(env(safe-area-inset-bottom, 0px) + ${mounted ? I.mountButtonBottomRiding : I.mountButtonBottom}px)`;
    if (this.mountBtn.style.bottom !== mb) this.mountBtn.style.bottom = mb;
    show(this.attackBtn, !mounted);
    show(this.dodgeBtn, !mounted);
    for (const [name, b] of Object.entries(this.abilityBtns)) {
      show(b, !mounted || name === 'batarang');
      const unlocked = ab.has(name);
      b.classList.toggle('locked', !unlocked);
      if (!unlocked) continue;
      const cd = ab.cooldownFraction(name);
      b.style.setProperty('--cd', cd.toFixed(3));
      b.classList.toggle('cooling', cd > 0);
      if (name === 'flashMode') {
        b.querySelector('.energy i').style.transform = `scaleX(${ab.energy.toFixed(3)})`;
        b.classList.toggle('ready', ab.flashReady);
        b.classList.toggle('active', ab.charging > 0 || ab.armed);
      }
    }
  }

  /** Brief pulse on an ability button (on unlock). */
  pulseAbility(name) {
    const b = this.abilityBtns[name];
    if (!b) return;
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
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
    this.attackQueued = this.dodgeQueued = false;
    this.abilityQueued = null;
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
