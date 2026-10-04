import { CONFIG, DIALOGUE } from './config.js';

/** DOM overlays: HUD, rotate-phone message, gameover & ending screens. */
export class UI {
  constructor(root) {
    this.root = root;
    this.orientationListeners = [];

    this.hud = this.#el('div', 'hud');
    this.hud.innerHTML = `
      <div class="quest" style="display:none"><span class="quest-text"></span><span class="quest-dist"></span></div>
      <div class="hud-hint">${DIALOGUE.controlsHint}</div>
      <div class="gems" style="display:none"></div>
      <div class="toast"></div>`;
    this.questEl = this.hud.querySelector('.quest');
    this.questText = this.hud.querySelector('.quest-text');
    this.questDist = this.hud.querySelector('.quest-dist');
    this.hintEl = this.hud.querySelector('.hud-hint');
    this.toastEl = this.hud.querySelector('.toast');
    this.gemsEl = this.hud.querySelector('.gems');
    this.gemPills = {};
    for (const [color, hex] of Object.entries(CONFIG.gems.colors)) {
      const pill = document.createElement('div');
      pill.className = 'gem-pill';
      pill.style.color = `#${hex.toString(16).padStart(6, '0')}`;
      pill.innerHTML = `<i style="background:currentColor"></i><span></span>`;
      this.gemsEl.appendChild(pill);
      this.gemPills[color] = pill;
    }

    this.fade = this.#el('div', 'fade');

    this.rotate = this.#el('div', 'overlay rotate');
    this.rotate.innerHTML = `<div class="rotate-icon">📱</div><p>${DIALOGUE.rotatePhone}</p>`;

    this.gameover = this.#el('div', 'overlay screen');
    this.gameover.innerHTML = `<h1>${DIALOGUE.gameOver}</h1><p class="blink">${DIALOGUE.retry}</p>`;

    this.ending = this.#el('div', 'overlay screen ending');
    this.ending.innerHTML = `<h1>${DIALOGUE.toBeContinued}</h1>`;

    this.showHud(false);
    this.showGameOver(false);
    this.showEnding(false);

    this.portrait = null;
    this.#checkOrientation();
    window.addEventListener('resize', () => this.#checkOrientation());
    window.addEventListener('orientationchange', () => this.#checkOrientation());
    // Some mobile browsers report the new size late; poll cheaply as a backup.
    setInterval(() => this.#checkOrientation(), CONFIG.ui.rotateCheckMs);
  }

  /** fn(isPortrait) is called whenever orientation flips. */
  onOrientationChange(fn) {
    this.orientationListeners.push(fn);
  }

  isPortrait() {
    return this.portrait;
  }

  showHud(on) {
    this.hud.style.display = on ? '' : 'none';
    if (on && !this.hintTimer) {
      this.hintTimer = setTimeout(() => this.hintEl.classList.add('hidden'), CONFIG.ui.hintHideMs);
    }
  }

  /** Current objective text and distance in metres (null text hides the panel). */
  setQuest(text, distance = null) {
    this.questEl.style.display = text ? '' : 'none';
    if (!text) return;
    if (this.questText.textContent !== text) this.questText.textContent = text;
    const d = distance == null ? '' : `${distance} ${DIALOGUE.distanceUnit}`;
    if (this.questDist.textContent !== d) this.questDist.textContent = d;
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), CONFIG.ui.toastMs);
  }

  /** Gem counters, e.g. "Yellow 3/5" (✓ once that colour's ability is unlocked). */
  setGems(counts, needed) {
    for (const [color, pill] of Object.entries(this.gemPills)) {
      const n = counts[color] ?? 0;
      const text = `${DIALOGUE.gemNames[color]} ${Math.min(n, needed)}/${needed}${n >= needed ? ' ✓' : ''}`;
      const span = pill.lastElementChild;
      if (span.textContent !== text) span.textContent = text;
      pill.classList.toggle('done', n >= needed);
    }
  }

  showGems(on) {
    const display = on ? '' : 'none';
    if (this.gemsEl.style.display !== display) this.gemsEl.style.display = display;
  }

  /** Briefly pulses a gem counter (used when a colour's set completes). */
  pulseGem(color) {
    const pill = this.gemPills[color];
    if (!pill) return;
    pill.classList.remove('pulse');
    void pill.offsetWidth;
    pill.classList.add('pulse');
  }

  /** Quick dip to black, used when the hero respawns after a fall. */
  flash() {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = '1';
    void this.fade.offsetWidth;
    this.fade.style.transition = `opacity ${CONFIG.hero.respawnFadeMs}ms ease-out`;
    this.fade.style.opacity = '0';
  }

  showGameOver(on, onRetry) {
    this.gameover.style.display = on ? '' : 'none';
    this.gameover.onclick = on && onRetry ? onRetry : null;
  }

  showEnding(on, onTap) {
    this.ending.style.display = on ? '' : 'none';
    this.ending.onclick = on && onTap ? onTap : null;
  }

  #checkOrientation() {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const portrait = isTouch && window.innerHeight > window.innerWidth;
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.rotate.style.display = portrait ? '' : 'none';
    this.orientationListeners.forEach((fn) => fn(portrait));
  }

  #el(tag, cls) {
    const el = document.createElement(tag);
    el.className = cls;
    this.root.appendChild(el);
    return el;
  }
}
