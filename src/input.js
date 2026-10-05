import { CONFIG, DIALOGUE } from './config.js';

const I = CONFIG.input;

/**
 * Routes touches by their `Touch.identifier` (no DOM; unit-tested in scripts/input-test.mjs).
 * A new touch goes to the nearest button whose (enlarged) hit circle contains it, else the
 * joystick (left half) or the camera drag (right half). Once a touch belongs to something it
 * stays there until that same identifier ends or is cancelled, so the joystick, camera drag
 * and buttons never steal each other's touches. Every tap on a button is a new press (there
 * is no "held" flag that can get stuck); `sync(activeIds)` drops touches whose end event was lost.
 */
export class TouchRouter {
  /**
   * @param {() => Array<{name:string, x:number, y:number, r:number, hold?:boolean}>} getButtons
   *   visible buttons (screen px centres and radii)
   * @param {() => number} getWidth  screen width (left half = joystick)
   */
  constructor(getButtons, getWidth) {
    this.getButtons = getButtons;
    this.getWidth = getWidth;
    this.owners = new Map(); // touch id → 'joy' | 'look' | 'button:<name>'
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0, dx: 0, dy: 0 };
    this.pressed = new Set(); // button names tapped since the last consume()
    this.held = new Map(); // button name → touch id (hold buttons, e.g. Gallop)
    this.onButton = null; // (name, down) for visuals
  }

  /** @returns {string|null} what the touch was given to */
  start(id, x, y) {
    if (this.owners.has(id)) this.end(id); // identifier reused without an end: start over
    let best = null;
    let bestD = Infinity;
    for (const b of this.getButtons()) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r * I.buttonHitScale && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    let role = null;
    if (best) {
      role = `button:${best.name}`;
      this.pressed.add(best.name);
      if (best.hold) this.held.set(best.name, id);
      this.onButton?.(best.name, true);
    } else if (x < this.getWidth() / 2) {
      if (this.joy.id === null) {
        role = 'joy';
        Object.assign(this.joy, { id, ox: x, oy: y, x: 0, y: 0 });
      }
    } else if (this.look.id === null) {
      role = 'look';
      Object.assign(this.look, { id, lx: x, ly: y });
    }
    if (role) this.owners.set(id, role);
    return role;
  }

  move(id, x, y) {
    const role = this.owners.get(id);
    if (role === 'joy') {
      let dx = x - this.joy.ox;
      let dy = y - this.joy.oy;
      const r = I.joystickRadius;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      let nx = dx / r;
      let ny = -dy / r; // screen up = forward
      if (Math.hypot(nx, ny) < I.joystickDeadZone) nx = ny = 0;
      this.joy.x = nx;
      this.joy.y = ny;
      this.joy.kx = dx;
      this.joy.ky = dy;
    } else if (role === 'look') {
      this.look.dx += x - this.look.lx;
      this.look.dy += y - this.look.ly;
      this.look.lx = x;
      this.look.ly = y;
    }
  }

  /** Touch ended or was cancelled. */
  end(id) {
    const role = this.owners.get(id);
    if (!role) return;
    this.owners.delete(id);
    if (role === 'joy') Object.assign(this.joy, { id: null, x: 0, y: 0 });
    else if (role === 'look') this.look.id = null;
    else {
      const name = role.slice(7);
      if (this.held.get(name) === id) this.held.delete(name);
      this.onButton?.(name, false);
    }
  }

  /** Drop touches that are no longer on the screen (their end event never arrived). */
  sync(activeIds) {
    for (const id of [...this.owners.keys()]) if (!activeIds.has(id)) this.end(id);
  }

  endAll() {
    for (const id of [...this.owners.keys()]) this.end(id);
    this.look.dx = this.look.dy = 0;
    this.pressed.clear();
  }

  /** Taps since the last call (and clears them). */
  consume() {
    const out = new Set(this.pressed);
    this.pressed.clear();
    return out;
  }
}

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
    // Touch: every finger is tracked by its Touch.identifier (see TouchRouter).
    this.touch = new TouchRouter(() => this.#buttonCircles(), () => window.innerWidth);
    this.touch.onButton = (name, down) => this.#buttonEl(name)?.classList.toggle('pressed', down);
    this.mouseLook = null; // { lx, ly } while the mouse drags to look
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookSensitivity = CONFIG.camera.dragSensitivity;
    this.jumpQueued = false;
    this.mountQueued = false;
    this.mouseGallop = false;
    this.attackQueued = false;
    this.dodgeQueued = false;
    this.abilityQueued = null; // 'batarang' | 'smokeBomb' | 'flashMode'
    this.debugQueued = { grantGems: false, damageHero: false, teleportArena: false, killBoss: false, cutscene: false, desert: false, ending: false, pit: false };

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
    const T = this.touch;
    if (T.joy.id !== null) {
      mx = T.joy.x;
      my = T.joy.y;
      this.joyKnob.style.transform = `translate(${T.joy.kx ?? 0}px, ${T.joy.ky ?? 0}px)`;
    }
    this.lookDX += T.look.dx;
    this.lookDY += T.look.dy;
    T.look.dx = T.look.dy = 0;
    if (T.look.id !== null) this.lookSensitivity = CONFIG.camera.dragSensitivity;
    for (const name of T.consume()) this.#press(name);
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
      gallop: this.enabled && (this.touch.held.has('gallop') || this.mouseGallop || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      attackPressed: this.enabled && this.attackQueued,
      dodgePressed: this.enabled && this.dodgeQueued,
      ability: this.enabled ? this.abilityQueued : null,
      debugGrantGems: this.enabled && this.debugQueued.grantGems,
      debugDamageHero: this.enabled && this.debugQueued.damageHero,
      debugTeleportArena: this.enabled && this.debugQueued.teleportArena,
      debugKillBoss: this.enabled && this.debugQueued.killBoss,
      debugCutscene: this.enabled && this.debugQueued.cutscene,
      debugDesert: this.enabled && this.debugQueued.desert,
      debugEnding: this.enabled && this.debugQueued.ending,
      debugPit: this.enabled && this.debugQueued.pit,
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
    // Touch: one handler for every finger, keyed by Touch.identifier.
    const opts = { passive: false };
    const touches = (e, fn) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) fn(t);
      // Anything we track that is no longer on the screen lost its end event: drop it.
      const active = new Set([...e.touches].map((t) => t.identifier));
      this.touch.sync(active);
      if (e.cancelable) e.preventDefault();
      this.#syncJoystickVisual();
    };
    window.addEventListener('touchstart', (e) => touches(e, (t) => this.touch.start(t.identifier, t.clientX, t.clientY)), opts);
    window.addEventListener('touchmove', (e) => touches(e, (t) => this.touch.move(t.identifier, t.clientX, t.clientY)), opts);
    window.addEventListener('touchend', (e) => touches(e, (t) => this.touch.end(t.identifier)), opts);
    window.addEventListener('touchcancel', (e) => touches(e, (t) => this.touch.end(t.identifier)), opts);

    // Mouse (desktop): drag on the canvas to look, click the buttons.
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      this.mouseLook = { lx: e.clientX, ly: e.clientY };
      this.lookSensitivity = CONFIG.camera.mouseSensitivity;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !this.mouseLook) return;
      this.lookDX += e.clientX - this.mouseLook.lx;
      this.lookDY += e.clientY - this.mouseLook.ly;
      this.mouseLook.lx = e.clientX;
      this.mouseLook.ly = e.clientY;
    });
    const mouseUp = (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouseLook = null;
      this.mouseGallop = false;
      this.gallopBtn.classList.remove('pressed');
    };
    window.addEventListener('pointerup', mouseUp);
    window.addEventListener('pointercancel', mouseUp);
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const [name, el] of Object.entries(this.#buttons())) {
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.pointerType !== 'mouse' || !this.enabled) return; // touches go through TouchRouter
        e.preventDefault();
        this.#press(name);
        if (name === 'gallop') {
          this.mouseGallop = true;
          el.classList.add('pressed');
        } else {
          el.classList.add('pressed');
          setTimeout(() => el.classList.remove('pressed'), 110);
        }
      });
    }

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
        if (e.code === I.debugKeys.cutscene) this.debugQueued.cutscene = true;
        if (e.code === I.debugKeys.desert) this.debugQueued.desert = true;
        if (e.code === I.debugKeys.ending) this.debugQueued.ending = true;
        if (e.code === I.debugKeys.pit) this.debugQueued.pit = true;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.jumpQueued = true;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.#releaseAll());
    document.addEventListener('visibilitychange', () => document.hidden && this.#releaseAll());
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
  /** `exhausted`: on his last heart (desert) — no combat or ability buttons at all. */
  setCombatButtons(mounted, ab, exhausted = false) {
    const show = (el, on) => {
      const d = on ? '' : 'none';
      if (el.style.display !== d) el.style.display = d;
    };
    // Riding: Dismount takes Dodge's (hidden) spot, clear of the gem counters.
    const mb = `calc(env(safe-area-inset-bottom, 0px) + ${mounted ? I.mountButtonBottomRiding : I.mountButtonBottom}px)`;
    if (this.mountBtn.style.bottom !== mb) this.mountBtn.style.bottom = mb;
    show(this.attackBtn, !mounted && !exhausted);
    show(this.dodgeBtn, !mounted && !exhausted);
    for (const [name, b] of Object.entries(this.abilityBtns)) {
      show(b, (!mounted || name === 'batarang') && !exhausted);
      const unlocked = ab.has(name);
      b.classList.toggle('locked', !unlocked);
      if (!unlocked) continue;
      const cd = ab.cooldownFraction(name);
      b.style.setProperty('--cd', cd.toFixed(3));
      b.classList.toggle('cooling', cd > 0);
      if (name === 'flashMode') {
        b.querySelector('.energy i').style.transform = `scaleX(${ab.energy.toFixed(3)})`;
        const why = ab.flashBlockReason();
        b.classList.toggle('ready', !why);
        b.classList.toggle('blocked', why === 'health' || why === 'gems'); // greyed: can't pay
        b.classList.toggle('reloading', why === 'reload');
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

  /** All on-screen buttons by name. */
  #buttons() {
    return {
      attack: this.attackBtn,
      jump: this.jumpBtn,
      dodge: this.dodgeBtn,
      mount: this.mountBtn,
      gallop: this.gallopBtn,
      ...this.abilityBtns,
    };
  }

  #buttonEl(name) {
    return this.#buttons()[name];
  }

  /** Visible buttons as screen circles (for touch hit-testing; hit areas are enlarged). */
  #buttonCircles() {
    const out = [];
    for (const [name, el] of Object.entries(this.#buttons())) {
      if (el.style.display === 'none' || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      out.push({ name, x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2, hold: name === 'gallop' });
    }
    return out;
  }

  /** A button was tapped (touch or mouse). */
  #press(name) {
    if (name === 'jump') this.jumpQueued = true;
    else if (name === 'attack') this.attackQueued = true;
    else if (name === 'dodge') this.dodgeQueued = true;
    else if (name === 'mount') this.mountQueued = true;
    else if (name in this.abilityBtns) this.abilityQueued = name;
  }

  #syncJoystickVisual() {
    const j = this.touch.joy;
    if (j.id !== null && !this.joyBase.classList.contains('active')) this.#showJoystick(j.ox, j.oy);
    else if (j.id === null && this.joyBase.classList.contains('active')) this.#hideJoystick();
  }

  #releaseAll() {
    this.keys.clear();
    this.touch?.endAll();
    this.mouseLook = null;
    this.mouseGallop = false;
    this.lookDX = this.lookDY = 0;
    this.jumpQueued = false;
    this.mountQueued = false;
    this.attackQueued = this.dodgeQueued = false;
    this.abilityQueued = null;
    for (const el of Object.values(this.#buttons())) el?.classList.remove('pressed');
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
