import { CONFIG, DIALOGUE } from './config.js';
import { elementIconSvg } from './part2/elementIcons.js';

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
      <div class="horse-energy" style="display:none"><span>${DIALOGUE.energy.label}</span><b><i></i></b></div>
      <div class="gems" style="display:none"></div>
      <div class="boss-bar" style="display:none"><span class="boss-name"></span><div class="boss-hp"><i></i><b class="boss-regen"></b></div></div>
      <div class="banner"></div>
      <div class="toast"></div>`;
    this.heartsEl = this.hud.querySelector('.hearts');
    this.livesEl = this.hud.querySelector('.lives');
    this.energyEl = this.hud.querySelector('.horse-energy');
    this.energyFill = this.energyEl.querySelector('i');
    this.bossBar = this.hud.querySelector('.boss-bar');
    this.bossFill = this.hud.querySelector('.boss-hp i');
    this.bossRegen = this.hud.querySelector('.boss-regen');
    this.bossRegen.textContent = DIALOGUE.bossRegenIcon;
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

    // Gearhaven's brass gears (the ride's currency): a pill where the gems sit in Part 1.
    this.gearsEl = this.#el('div', 'gear-pill');
    this.gearsEl.style.display = 'none';
    this.gearsEl.innerHTML = `<b>${DIALOGUE.part2.ride.gears}</b><span></span><span class="gear-bar"><i class="fill"></i></span>`;
    this.hud.appendChild(this.gearsEl);

    // Part 2: the cog-key counter just under the gear counter, and the Elements row (five diamond
    // slots: the unlocked ones glow in their colour, the others are grey outlines).
    this.keysEl = this.#el('div', 'key-pill');
    this.keysEl.style.display = 'none';
    this.keysEl.title = DIALOGUE.part2.fire.keysLabel;
    this.keysEl.innerHTML = `<b>${DIALOGUE.part2.fire.keyIcon}</b><span></span>`;
    this.hud.appendChild(this.keysEl);
    this.elementsEl = this.#el('div', 'elements-row');
    this.elementsEl.style.display = 'none';
    this.elementsEl.title = DIALOGUE.part2.elements.label;
    this.elementSlots = {};
    for (const id of CONFIG.part2.levels.order) {
      const slot = document.createElement('i');
      slot.className = 'element-slot';
      slot.title = DIALOGUE.part2.elements[id];
      slot.style.setProperty('--el', `#${CONFIG.part2.levels[id].accent[0].toString(16).padStart(6, '0')}`);
      slot.innerHTML = elementIconSvg(id);
      this.elementsEl.appendChild(slot);
      this.elementSlots[id] = slot;
    }
    this.hud.appendChild(this.elementsEl);

    // Exhaustion: a faint red vignette that breathes (strength set by setExhaustion).
    this.vignette = this.#el('div', 'vignette');
    this.exhaustion = 0;

    this.screenFlashEl = this.#el('div', 'screen-flash');
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

    // Credits: every pack and its licence (a small button on the intro and the ending screens).
    this.credits = this.#el('div', 'overlay screen credits');
    const C = DIALOGUE.credits;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    this.credits.innerHTML = `
      <div class="credits-box">
        <h2>${esc(C.title)}</h2>
        <ul>${C.entries.map((e) => `<li><b>${esc(e.what)}</b>${e.text ? `<span class="attribution">${esc(e.text)}</span>` : `<span>${esc(e.who ?? '')}${e.licence ? ` — ${esc(e.licence)}` : ''}</span>`}</li>`).join('')}</ul>
        <button class="retry-btn credits-close">${esc(C.close)}</button>
      </div>`;
    this.credits.style.display = 'none';
    this.credits.addEventListener('click', (e) => e.stopPropagation());
    this.credits.querySelector('.credits-close').addEventListener('click', () => this.showCredits(false));
    this.ending.appendChild(this.creditsButton());

    this.showHud(false);
    this.showGameOver(false);
    this.showEnding(false);

    this.portrait = null;
    this.#checkOrientation();
    window.addEventListener('resize', () => {
      this.#checkOrientation();
      this.bossBarPlaced = 0; // (re-checked against the quest panel / gem counters on the next update)
    });
    window.addEventListener('orientationchange', () => this.#checkOrientation());
    // Some mobile browsers report the new size late; poll cheaply as a backup.
    setInterval(() => this.#checkOrientation(), CONFIG.ui.rotateCheckMs);
  }

  /** fn(isPortrait) is called whenever orientation flips. */
  onOrientationChange(fn) {
    this.orientationListeners.push(fn);
  }

  /** Loading bar (the hero model download): f in 0..1; `null` hides it. */
  setLoading(f) {
    if (!this.loadingEl) {
      this.loadingEl = this.#el('div', 'loading');
      this.loadingEl.innerHTML = `<p>${DIALOGUE.loading}</p><div class="loading-bar"><i></i></div>`;
      this.loadingFill = this.loadingEl.querySelector('i');
    }
    this.loadingEl.style.display = f === null ? 'none' : '';
    if (f !== null) this.loadingFill.style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
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
    if (this.questText.textContent !== text) {
      this.questText.textContent = text;
      this.bossBarPlaced = 0; // (the panel's width changed: re-check the boss bar's room)
    }
    const d = distance == null ? '' : `${distance} ${DIALOGUE.distanceUnit}`;
    if (this.questDist.textContent !== d) {
      if (this.questDist.textContent.length !== d.length) this.bossBarPlaced = 0;
      this.questDist.textContent = d;
    }
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
  /** Gem counters: the current count of each colour (spent on abilities), e.g. "Yellow 12". */
  setGems(counts) {
    for (const [color, pill] of Object.entries(this.gemPills)) {
      const text = `${DIALOGUE.gemNames[color]} ${counts[color] ?? 0}`;
      const span = pill.lastElementChild;
      if (span.textContent !== text) span.textContent = text;
    }
  }

  /** A quick white flash over the whole screen (the Flash lightning strike). */
  screenFlash() {
    const F = CONFIG.abilities.flashMode.screenFlash;
    const el = this.screenFlashEl;
    el.style.transition = 'none';
    el.style.opacity = String(F.opacity);
    void el.offsetWidth;
    el.style.transition = `opacity ${F.ms}ms ease-out`;
    el.style.opacity = '0';
  }

  /** A gem counter's screen rect (the Dismount button sits below the Pink one), or null if hidden. */
  gemPillRect(color) {
    const pill = this.gemPills[color];
    if (!pill || this.gemsEl.style.display === 'none') return null;
    const r = pill.getBoundingClientRect();
    return r.width ? r : null;
  }

  showGems(on) {
    const display = on ? '' : 'none';
    if (this.gemsEl.style.display !== display) this.gemsEl.style.display = display;
  }

  /**
   * The brass gear counter ("⚙ 12 / 42"), shown on the Gearhaven ride; `pulse` on a pickup. Under
   * it a thin progress bar with a small tick mark at each reward tier (`tiers`: [{ at (0..1),
   * reached }], part2/gearRewards.js).
   */
  setGears(count, total, show = true, pulse = false, tiers = []) {
    const el = this.gearsEl;
    const display = show ? '' : 'none';
    if (el.style.display !== display) el.style.display = display;
    const text = `${count} / ${total}`;
    const span = el.children[1];
    if (span.textContent !== text) span.textContent = text;
    const bar = el.children[2];
    bar.firstElementChild.style.width = `${total ? Math.min(100, (count / total) * 100) : 0}%`;
    const key = tiers.map((t) => `${t.at}:${t.reached ? 1 : 0}`).join(',');
    if (bar.dataset.tiers !== key) {
      bar.dataset.tiers = key;
      bar.querySelectorAll('.mark').forEach((m) => m.remove());
      for (const t of tiers) {
        const m = document.createElement('i');
        m.className = `mark${t.reached ? ' reached' : ''}`;
        m.style.left = `${t.at * 100}%`;
        bar.appendChild(m);
      }
    }
    if (pulse) {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }
  }

  /** The Elements row's rectangle (the Part 2 Dismount button sits under it), or null while it is hidden. */
  elementsRect() {
    if (this.elementsEl.style.display === 'none') return null;
    const r = this.elementsEl.getBoundingClientRect();
    return r.width ? r : null;
  }

  /** The cog-key counter (Part 2's chests); `show` false hides it. */
  setCogKeys(count, show = true, pulse = false) {
    const el = this.keysEl;
    const display = show ? '' : 'none';
    if (el.style.display !== display) el.style.display = display;
    const span = el.children[1];
    if (span.textContent !== String(count)) span.textContent = String(count);
    if (pulse) {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }
  }

  /** The Elements row: `unlocked` = the element ids recovered so far; `show` false hides the row; `pulse` an id that was just gained. */
  setElements(unlocked, show = true, pulse = null) {
    const display = show ? '' : 'none';
    if (this.elementsEl.style.display !== display) this.elementsEl.style.display = display;
    for (const [id, slot] of Object.entries(this.elementSlots)) {
      slot.classList.toggle('on', unlocked.includes(id));
      if (id === pulse) {
        slot.classList.remove('pulse');
        void slot.offsetWidth;
        slot.classList.add('pulse');
      }
    }
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

  /** The horse's energy (0..1) as a thin bar under the hearts; red and pulsing while it is tired. */
  setHorseEnergy(frac, visible, tired = false) {
    const d = visible ? '' : 'none';
    if (this.energyEl.style.display !== d) this.energyEl.style.display = d;
    if (!visible) return;
    this.energyFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`;
    this.energyEl.classList.toggle('tired', tired);
  }

  /** Hearts (filled / empty) and remaining respawns as life icons. */
  setLives(hearts, maxHearts, respawns, maxRespawns) {
    const key = `${hearts}/${maxHearts}/${respawns}`;
    if (this.livesKey === key) return;
    const prev = this.livesKey ? Number(this.livesKey.split('/')[0]) : hearts;
    const lost = hearts < prev;
    const healed = hearts > prev;
    this.livesKey = key;
    // Whole, half and empty hearts.
    this.heartsEl.innerHTML = Array.from({ length: maxHearts }, (_, i) => `<i class="${hearts >= i + 1 ? '' : hearts >= i + 0.5 ? 'half' : 'empty'}">♥</i>`).join('');
    this.livesEl.innerHTML = Array.from({ length: maxRespawns }, (_, i) => `<i class="${i < respawns ? '' : 'used'}"></i>`).join('');
    if (lost) {
      this.heartsEl.classList.remove('hit');
      void this.heartsEl.offsetWidth;
      this.heartsEl.classList.add('hit');
    }
    if (healed) {
      // The heart just refilled pops with a blue-white glow.
      const el = this.heartsEl.children[Math.ceil(hearts) - 1];
      el?.classList.add('heal');
    }
  }

  /**
   * Exhaustion 0..1: a breathing red screen-edge vignette, and the last heart dims and pulses
   * slowly. 0 hides both.
   */
  setExhaustion(f) {
    const v = Math.round(f * 100) / 100;
    if (v === this.exhaustion) return;
    this.exhaustion = v;
    this.vignette.style.opacity = (CONFIG.desert.exhaustion.vignette * (0.4 + 0.6 * v)).toFixed(2);
    this.vignette.style.display = v > 0 ? 'block' : 'none';
    this.heartsEl.classList.toggle('weary', v > 0);
  }

  /** Boss health bar (top centre). */
  /** regen: the boss is regenerating (the sealed arena) — the bar pulses green with a small "+". */
  setBossBar(visible, fraction = 1, name = '', regen = false) {
    const d = visible ? '' : 'none';
    if (this.bossBar.style.display !== d) {
      this.bossBar.style.display = d;
      this.bossBarPlaced = 0;
    }
    if (!visible) return;
    // Narrow screens: drop to a second row if the top row has no room between the quest panel
    // and the gem counters (checked when shown, on resize and now and then as the text changes).
    if ((this.bossBarPlaced = (this.bossBarPlaced ?? 0) - 1) < 0) {
      this.bossBarPlaced = CONFIG.ui.bossBarRecheck;
      this.#placeBossBar();
    }
    const nameEl = this.bossBar.firstElementChild;
    if (nameEl.textContent !== name) nameEl.textContent = name;
    this.bossFill.style.transform = `scaleX(${Math.max(0, fraction).toFixed(3)})`;
    this.bossBar.classList.toggle('low', fraction <= CONFIG.boss.enrageAt);
    this.bossBar.classList.toggle('regen', regen);
  }

  #placeBossBar() {
    this.bossBar.classList.remove('lower');
    const b = this.bossBar.getBoundingClientRect();
    const others = [this.questEl, ...Object.values(this.gemPills), document.querySelector('.test-toggle'), document.querySelector('.audio-speaker')];
    const hit = others.some((el) => {
      const r = el?.getBoundingClientRect();
      return r && r.width && r.left < b.right + 4 && r.right > b.left - 4 && r.top < b.bottom && r.bottom > b.top;
    });
    this.bossBar.classList.toggle('lower', hit);
  }

  /** Big story banner (e.g. "Victory!"), shown briefly near the top (`small`: a one-line one, the gear rewards). */
  banner(text, ms = CONFIG.boss.victoryMs, { small = false } = {}) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.toggle('small', small);
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

  /** Fade to black (death) — or `color` (the portal's white) — then call back; `fadeIn()` brings the picture back. */
  fadeOut(ms, then, color = '#000') {
    this.fade.style.background = color;
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
  showEnding(on, stats = null, onPlayAgain = null, { title = DIALOGUE.toBeContinued, heading = DIALOGUE.summary.title, next = DIALOGUE.summary.part2 } = {}) {
    clearTimeout(this.endingTimer);
    this.ending.style.display = on ? '' : 'none';
    this.playAgainBtn.onclick = null;
    if (!on) return;
    this.endTitle.textContent = title; // (Part 1's "…Part 2", or Part 2's "…Part 3")
    this.summary.querySelector('h2').textContent = heading;
    this.ending.querySelector('.part2').textContent = next;
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

  /** Show / hide the Credits screen. */
  showCredits(on) {
    this.credits.style.display = on ? '' : 'none';
    this.creditsOpen = on;
  }

  /** A small "Credits" button (put it on a screen: the intro, the ending) that opens the Credits screen. */
  creditsButton() {
    const b = document.createElement('button');
    b.className = 'credits-btn';
    b.textContent = DIALOGUE.credits.button;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); // (never advances the slide behind it)
      this.showCredits(true);
    });
    return b;
  }

  #el(tag, cls) {
    const el = document.createElement(tag);
    el.className = cls;
    this.root.appendChild(el);
    return el;
  }
}
