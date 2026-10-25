import { CONFIG, DIALOGUE } from './config.js';

/**
 * True when the hidden test menu is wanted: ?debug in the page URL, or switched on by holding
 * the HUD speaker button (saved in localStorage; `saved` overrides for tests).
 */
export function testMenuWanted(search = typeof location === 'undefined' ? '' : location.search, saved = testMenuSaved()) {
  return new URLSearchParams(search).has(CONFIG.testMenu.param) || saved;
}

/** The saved switch (holding the speaker button): true / false; false if storage refuses. */
export function testMenuSaved() {
  try {
    return globalThis.localStorage?.getItem(CONFIG.testMenu.storageKey) === '1';
  } catch {
    return false;
  }
}

export function saveTestMenu(on) {
  try {
    if (on) globalThis.localStorage?.setItem(CONFIG.testMenu.storageKey, '1');
    else globalThis.localStorage?.removeItem(CONFIG.testMenu.storageKey);
  } catch {
    /* (storage refused: it just isn't remembered) */
  }
}

/**
 * The hidden test menu (only with ?debug): a small "TEST" button in the top-left corner opens a
 * panel of big buttons, one per part of the game, plus Close. DOM only; touch works because the
 * touch router leaves taps on `.test-menu` alone (input.js), so they arrive as plain clicks.
 * @param {HTMLElement} overlay
 * @param {({ label: string | (() => string), run: () => any, keepOpen?: boolean } | { header: string })[]} items
 */
export class TestMenu {
  constructor(overlay, items) {
    this.enabled = true;
    document.body.classList.add('test-mode');
    this.el = document.createElement('div');
    this.el.className = 'test-menu';
    this.toggle = document.createElement('button');
    this.toggle.className = 'test-toggle';
    this.toggle.textContent = DIALOGUE.testMenu.open;
    this.panel = document.createElement('div');
    this.panel.className = 'test-panel';
    this.panel.style.display = 'none';
    this.infos = [];
    this.infoTimer = setInterval(() => {
      if (this.panel.style.display !== 'none') for (const [el, fn] of this.infos) el.textContent = fn();
    }, CONFIG.testMenu.infoMs);
    for (const item of items) {
      if (item.info) {
        // (a live read-out line, refreshed while the panel is open: "Invulnerable: no", "Hero state: alive")
        const line = document.createElement('div');
        line.className = 'test-info';
        line.textContent = item.info();
        this.infos.push([line, item.info]);
        this.panel.append(line);
        continue;
      }
      if (item.header) {
        // (a section heading: "Part 1", "Part 2")
        const h = document.createElement('div');
        h.className = 'test-head';
        h.textContent = item.header;
        this.panel.append(h);
        continue;
      }
      const b = document.createElement('button');
      const label = () => (typeof item.label === 'function' ? item.label() : item.label);
      b.textContent = label();
      b.addEventListener('click', async () => {
        if (!item.keepOpen) this.close();
        await item.run();
        b.textContent = label(); // (a switch shows its new state: the Look button)
      });
      this.panel.append(b);
    }
    const close = document.createElement('button');
    close.className = 'test-close';
    close.textContent = DIALOGUE.testMenu.close;
    close.addEventListener('click', () => this.close());
    this.panel.append(close);
    this.toggle.addEventListener('click', () => (this.panel.style.display === 'none' ? this.open() : this.close()));
    this.el.append(this.toggle, this.panel);
    overlay.append(this.el);
  }

  /** Shown / hidden (switched off by holding the speaker button again). */
  setEnabled(on) {
    this.enabled = on;
    this.el.style.display = on ? '' : 'none';
    document.body.classList.toggle('test-mode', on);
    if (!on) this.close();
  }

  open() {
    this.panel.style.display = '';
  }

  close() {
    this.panel.style.display = 'none';
  }
}
