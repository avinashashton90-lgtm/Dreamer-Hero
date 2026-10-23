import { CONFIG, DIALOGUE } from './config.js';
import { SOUNDS, MUSIC, MUSIC_LAYERS } from './soundCatalog.js';

// The sound settings in the HUD: a small speaker button in the top-right corner (away from the
// jump and ability buttons, left of nothing but the screen edge — the gem counters sit just left
// of it) that opens a tiny panel with Mute and the Music / Effects / Voices sliders (saved by the
// AudioManager). And, with ?debug, the audio test panel: a button per sound name, the music
// sections and layers, the voice blips. Both are `.audio-ui`: the touch router leaves them alone
// (input.js), so taps arrive as plain clicks.

const T = () => DIALOGUE.audio;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class AudioPanel {
  /**
   * @param {HTMLElement} overlay
   * @param {import('./audio.js').AudioManager} audio
   * @param {{ onTap?: Function, onLongPress?: Function }} [events]  onLongPress: the button held
   *   `CONFIG.testMenu.holdSeconds` (switches the hidden test menu on / off)
   */
  constructor(overlay, audio, events = {}) {
    this.audio = audio;
    this.events = events;
    this.root = el('div', 'audio-ui audio-hud');
    this.button = el('button', 'audio-speaker');
    this.button.setAttribute('aria-label', T().title);
    this.panel = el('div', 'audio-panel');
    this.panel.style.display = 'none';
    this.panel.append(el('div', 'audio-title', T().title));
    this.mute = el('button', 'audio-mute');
    this.mute.addEventListener('click', () => {
      audio.setMuted(!audio.settings.muted);
      this.#refresh();
    });
    this.panel.append(this.mute);
    this.sliders = {};
    for (const group of ['music', 'effects', 'voices']) {
      const row = el('label', 'audio-row');
      row.append(el('span', '', T()[group]));
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.addEventListener('input', () => audio.setVolume(group, Number(input.value) / 100));
      row.append(input);
      this.sliders[group] = input;
      this.panel.append(row);
    }
    // Held for holdSeconds: the long press (no panel toggle on that release).
    let holdTimer = 0;
    let held = false;
    const cancel = () => {
      clearTimeout(holdTimer);
      this.button.classList.remove('holding');
    };
    this.button.addEventListener('pointerdown', () => {
      held = false;
      cancel();
      this.button.classList.add('holding');
      holdTimer = setTimeout(() => {
        held = true;
        this.button.classList.remove('holding');
        this.events.onLongPress?.();
      }, CONFIG.testMenu.holdSeconds * 1000);
    });
    for (const e of ['pointerup', 'pointercancel', 'pointerleave']) this.button.addEventListener(e, cancel);
    this.button.addEventListener('contextmenu', (e) => e.preventDefault()); // (no phone long-press menu)
    this.button.addEventListener('click', () => {
      if (held) {
        held = false;
        return;
      }
      this.events.onTap?.();
      this.toggle();
    });
    this.root.append(this.button, this.panel);
    overlay.append(this.root);
    // (a tap anywhere else closes the panel, so it never sits over the controls)
    window.addEventListener('pointerdown', (e) => {
      if (this.panel.style.display !== 'none' && !this.root.contains(e.target)) this.toggle(false);
    }, true);
    this.#refresh();
  }

  /** Shown in play only (cutscenes and the intro have their Skip button in that corner). */
  setVisible(on) {
    const d = on ? '' : 'none';
    if (this.root.style.display === d) return;
    this.root.style.display = d;
    if (!on) this.panel.style.display = 'none';
  }

  toggle(open = this.panel.style.display === 'none') {
    this.panel.style.display = open ? '' : 'none';
    this.#refresh();
  }

  #refresh() {
    const s = this.audio.settings;
    this.button.textContent = s.muted ? T().off : T().on;
    this.button.classList.toggle('muted', s.muted);
    this.mute.textContent = s.muted ? T().unmute : T().mute;
    for (const [g, input] of Object.entries(this.sliders)) input.value = String(Math.round(s[g] * 100));
  }
}

/** ?debug: a panel with a button per sound, the music sections and layers, the voice blips. */
export class AudioTestPanel {
  /**
   * @param {HTMLElement} overlay
   * @param {import('./audio.js').AudioManager} audio
   */
  constructor(overlay, audio) {
    this.audio = audio;
    this.root = el('div', 'audio-ui audio-test');
    this.root.style.display = 'none';
    const close = el('button', 'audio-test-close', DIALOGUE.testMenu.close);
    close.addEventListener('click', () => this.close());
    this.root.append(close);
    const section = (title) => {
      this.root.append(el('div', 'audio-test-head', title));
      const grid = el('div', 'audio-test-grid');
      this.root.append(grid);
      return grid;
    };
    const add = (grid, label, fn, cls = '') => {
      const b = el('button', cls, label);
      b.addEventListener('click', fn);
      grid.append(b);
      return b;
    };
    // Music sections + layers.
    const music = section(T().sections);
    for (const name of Object.keys(MUSIC)) add(music, name, () => audio.setMusic(name), 'music');
    add(music, T().stopMusic, () => audio.setMusic(null), 'music');
    for (const layer of Object.keys(MUSIC_LAYERS)) {
      const b = add(music, `+ ${layer}`, () => {
        const on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        audio.setMusicLayer(layer, on);
      }, 'layer');
    }
    // Voice blips.
    const voices = section(T().voicesTest);
    for (const id of Object.keys(CONFIG.audio.voice.characters)) {
      add(voices, id, () => {
        for (let i = 0; i < 8; i++) setTimeout(() => audio.voiceBlip(id), i * 70);
      });
    }
    // Every sound (loops play for a couple of seconds).
    const sounds = section(T().sounds);
    for (const [name, info] of Object.entries(SOUNDS)) {
      add(sounds, info.loop ? `${name} ↻` : name, () => (info.loop ? this.#loopFor(name) : audio.playSound(name, {})));
    }
    overlay.append(this.root);
  }

  /** Keep a loop alive for `testLoopSeconds` (the manager stops loops nobody refreshes). */
  #loopFor(name) {
    const end = performance.now() + CONFIG.audio.testLoopSeconds * 1000;
    const tick = () => {
      this.audio.setLoop(`test:${name}`, name, { rate: 1 });
      if (performance.now() < end) setTimeout(tick, 100);
    };
    tick();
  }

  open() {
    this.root.style.display = '';
  }

  close() {
    this.root.style.display = 'none';
  }
}
