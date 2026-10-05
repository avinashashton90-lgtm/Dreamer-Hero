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
      <div class="vitals"><div class="hearts"></div><div class="lives"></div></div>
      <div class="gems" style="display:none"></div>
      <div class="boss-bar" style="display:none"><span class="boss-name"></span><div class="boss-hp"><i></i></div></div>
      <div class="banner"></div>
      <div class="toast"></div>`;
    this.heartsEl = this.hud.querySelector('.hearts');
    this.livesEl = this.hud.querySelector('.lives');
    this.bossBar = this.hud.querySelector('.boss-bar');
    this.bossFill = this.hud.querySelector('.boss-hp i');
    this.bannerEl = this.hud.querySelector('.banner');
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
    this.gameover.innerHTML = `<h1>${DIALOGUE.gameOverTitle}</h1><p>${DIALOGUE.gameOver}</p><button class="retry-btn">${DIALOGUE.retryRide}</button>`;
    this.retryBtn = this.gameover.querySelector('.retry-btn');
    this.numbers = this.#el('div', 'hud numbers');

    // Cinematic cutscenes: letterbox bars, a dialogue box at the bottom, Skip top right.
    this.cine = this.#el('div', 'overlay cine');
    this.cine.innerHTML = `
      <div class="bar top"></div><div class="bar bottom"></div>
      <button class="skip-btn cine-skip">${DIALOGUE.skip}</button>
      <div class="dialogue" style="display:none"><div class="speaker"></div><p class="line"></p><span class="more">${DIALOGUE.tapToContinue}</span></div>`;
    this.cineSkip = this.cine.querySelector('.cine-skip');
    this.dlg = this.cine.querySelector('.dialogue');
    this.dlgSpeaker = this.cine.querySelector('.speaker');
    this.dlgLine = this.cine.querySelector('.line');
    this.cine.style.display = 'none';

    // Ending: the title, then the summary with Play Again / Part 2 (coming soon).
    this.ending = this.#el('div', 'overlay screen ending');
    this.ending.innerHTML = `
      <h1 class="end-title">${DIALOGUE.toBeContinued}</h1>
      <div class="summary" style="display:none">
        <h2>${DIALOGUE.summary.title}</h2>
        <dl>
          <dt>${DIALOGUE.summary.gems}</dt><dd class="s-gems"></dd>
          <dt>${DIALOGUE.summary.time}</dt><dd class="s-time"></dd>
          <dt>${DIALOGUE.summary.deaths}</dt><dd class="s-deaths"></dd>
        </dl>
        <div class="end-buttons">
          <button class="retry-btn play-again">${DIALOGUE.summary.playAgain}</button>
          <button class="retry-btn part2" disabled>${DIALOGUE.summary.part2}</button>
        </div>
      </div>`;
    this.endTitle = this.ending.querySelector('.end-title');
    this.summary = this.ending.querySelector('.summary');
    this.playAgainBtn = this.ending.querySelector('.play-again');

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

  /** Game Over screen with a Retry button (restarts the ride). */
  showGameOver(on, onRetry) {
    this.gameover.style.display = on ? '' : 'none';
    this.retryBtn.onclick = on && onRetry ? onRetry : null;
  }

  /** Hearts (filled / empty) and remaining respawns as life icons. */
  setLives(hearts, maxHearts, respawns, maxRespawns) {
    const key = `${hearts}/${maxHearts}/${respawns}`;
    if (this.livesKey === key) return;
    const lost = this.livesKey && hearts < Number(this.livesKey.split('/')[0]);
    this.livesKey = key;
    // Whole, half and empty hearts.
    this.heartsEl.innerHTML = Array.from({ length: maxHearts }, (_, i) => `<i class="${hearts >= i + 1 ? '' : hearts >= i + 0.5 ? 'half' : 'empty'}">♥</i>`).join('');
    this.livesEl.innerHTML = Array.from({ length: maxRespawns }, (_, i) => `<i class="${i < respawns ? '' : 'used'}"></i>`).join('');
    if (lost) {
      this.heartsEl.classList.remove('hit');
      void this.heartsEl.offsetWidth;
      this.heartsEl.classList.add('hit');
    }
  }

  /** Boss health bar (top centre). */
  setBossBar(visible, fraction = 1, name = '') {
    const d = visible ? '' : 'none';
    if (this.bossBar.style.display !== d) this.bossBar.style.display = d;
    if (!visible) return;
    const nameEl = this.bossBar.firstElementChild;
    if (nameEl.textContent !== name) nameEl.textContent = name;
    this.bossFill.style.transform = `scaleX(${Math.max(0, fraction).toFixed(3)})`;
    this.bossBar.classList.toggle('low', fraction <= CONFIG.boss.enrageAt);
  }

  /** Big story banner (e.g. "Victory!"), shown briefly near the top. */
  banner(text, ms = CONFIG.boss.victoryMs) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  /** Floating damage number at screen position (px). kind: '' | 'heavy' | 'flash'. */
  damageNumber(x, y, text, kind = '') {
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--ms', `${CONFIG.combat.damageNumberMs}ms`);
    this.numbers.appendChild(el);
    setTimeout(() => el.remove(), CONFIG.combat.damageNumberMs + 50);
  }

  /** Fade to black (death), then call back; `fadeIn()` brings the picture back. */
  fadeOut(ms, then) {
    this.fade.style.transition = `opacity ${ms}ms ease-in`;
    this.fade.style.opacity = '1';
    setTimeout(then, ms);
  }

  fadeIn(ms) {
    this.fade.style.transition = `opacity ${ms}ms ease-out`;
    this.fade.style.opacity = '0';
  }

  /**
   * Ending: the "To be continued" title for `titleMs`, then the summary
   * (stats: { gems, gemsTotal, time, deaths }) with Play Again.
   */
  showEnding(on, stats = null, onPlayAgain = null) {
    clearTimeout(this.endingTimer);
    this.ending.style.display = on ? '' : 'none';
    this.playAgainBtn.onclick = null;
    if (!on) return;
    this.endTitle.classList.remove('show');
    this.summary.style.display = 'none';
    void this.endTitle.offsetWidth;
    this.endTitle.classList.add('show');
    this.endingTimer = setTimeout(() => {
      const t = Math.round(stats.time);
      this.summary.querySelector('.s-gems').textContent = `${stats.gems} / ${stats.gemsTotal}`;
      this.summary.querySelector('.s-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.summary.querySelector('.s-deaths').textContent = String(stats.deaths);
      this.summary.style.display = '';
      this.playAgainBtn.onclick = onPlayAgain;
    }, CONFIG.ending.titleMs);
  }

  /** The DOM side of cinematic.js (the "view"): tap anywhere to continue, Skip top right. */
  cinematicView(onTap, onSkip) {
    this.cine.addEventListener('pointerdown', (e) => {
      if (e.target === this.cineSkip) return;
      e.preventDefault();
      onTap();
    });
    this.cineSkip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    });
    return {
      show: () => (this.cine.style.display = ''),
      hide: () => (this.cine.style.display = 'none'),
      dialogue: (speaker, text, complete) => {
        this.dlg.style.display = '';
        if (this.dlgSpeaker.textContent !== speaker) this.dlgSpeaker.textContent = speaker;
        if (this.dlgLine.textContent !== text) this.dlgLine.textContent = text;
        this.dlg.classList.toggle('complete', complete);
      },
      clearDialogue: () => (this.dlg.style.display = 'none'),
    };
  }

  /** Fade to black and resolve when it's black (awaitable). */
  fadeOutAsync(ms) {
    return new Promise((resolve) => this.fadeOut(ms, resolve));
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
