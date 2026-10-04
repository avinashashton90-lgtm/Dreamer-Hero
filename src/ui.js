import { CONFIG, DIALOGUE } from './config.js';

/** DOM overlays: HUD, rotate-phone message, gameover & ending screens. */
export class UI {
  constructor(root) {
    this.root = root;
    this.orientationListeners = [];

    this.hud = this.#el('div', 'hud');
    this.hud.innerHTML = `<div class="hud-title">${DIALOGUE.title}</div><div class="hud-hint">${DIALOGUE.controlsHint}</div>`;

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
