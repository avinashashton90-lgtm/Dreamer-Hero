import { CONFIG, DIALOGUE } from './config.js';

/** True when the page URL asks for the hidden test menu (…?debug). */
export function testMenuWanted(search = typeof location === 'undefined' ? '' : location.search) {
  return new URLSearchParams(search).has(CONFIG.testMenu.param);
}

/**
 * The hidden test menu (only with ?debug): a small "TEST" button in the top-left corner opens a
 * panel of big buttons, one per part of the game, plus Close. DOM only; touch works because the
 * touch router leaves taps on `.test-menu` alone (input.js), so they arrive as plain clicks.
 * @param {HTMLElement} overlay
 * @param {{ label: string, run: () => any }[]} items
 */
export class TestMenu {
  constructor(overlay, items) {
    document.body.classList.add('test-mode'); // (the quest panel makes room for the button)
    this.el = document.createElement('div');
    this.el.className = 'test-menu';
    this.toggle = document.createElement('button');
    this.toggle.className = 'test-toggle';
    this.toggle.textContent = DIALOGUE.testMenu.open;
    this.panel = document.createElement('div');
    this.panel.className = 'test-panel';
    this.panel.style.display = 'none';
    for (const item of items) {
      const b = document.createElement('button');
      b.textContent = item.label;
      b.addEventListener('click', () => {
        this.close();
        item.run();
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

  open() {
    this.panel.style.display = '';
  }

  close() {
    this.panel.style.display = 'none';
  }
}
