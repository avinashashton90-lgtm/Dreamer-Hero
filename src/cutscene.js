import { CONFIG, DIALOGUE } from './config.js';

// Cartoon placeholder art for each slide, drawn as inline SVG.
// Swap these for real images later: return an <img> or any element from loadSlideArt().
const ART = {
  desk: `
    <svg viewBox="0 0 320 180">
      <rect width="320" height="180" fill="#d9d2c3"/>
      <rect x="20" y="20" width="120" height="70" rx="4" fill="#2f4f3a" stroke="#7a5a3a" stroke-width="6"/>
      <text x="80" y="50" fill="#fff" font-size="12" text-anchor="middle" font-family="Comic Sans MS, cursive">a² + b² = c²</text>
      <text x="80" y="72" fill="#fff" font-size="10" text-anchor="middle" font-family="Comic Sans MS, cursive">x = ?</text>
      <rect x="150" y="120" width="140" height="12" fill="#8b5a2b"/>
      <rect x="160" y="132" width="8" height="40" fill="#6b4220"/><rect x="272" y="132" width="8" height="40" fill="#6b4220"/>
      <rect x="200" y="112" width="40" height="8" fill="#fff" stroke="#999"/>
      <rect x="195" y="78" width="40" height="44" rx="10" fill="#4a7bd0"/>
      <circle cx="215" cy="62" r="20" fill="#f2c79b"/>
      <path d="M196 54 q19 -22 38 0" fill="#3b2a1a"/>
      <circle cx="208" cy="62" r="3" fill="#222"/><circle cx="222" cy="62" r="3" fill="#222"/>
      <line x1="208" y1="72" x2="222" y2="72" stroke="#7a3b2b" stroke-width="2"/>
    </svg>`,
  drowsy: `
    <svg viewBox="0 0 320 180">
      <rect width="320" height="180" fill="#cfc6b4"/>
      <rect x="150" y="120" width="140" height="12" fill="#8b5a2b"/>
      <rect x="160" y="132" width="8" height="40" fill="#6b4220"/><rect x="272" y="132" width="8" height="40" fill="#6b4220"/>
      <rect x="195" y="80" width="40" height="44" rx="10" fill="#4a7bd0"/>
      <g transform="rotate(12 215 66)">
        <circle cx="215" cy="66" r="20" fill="#f2c79b"/>
        <path d="M196 58 q19 -22 38 0" fill="#3b2a1a"/>
        <path d="M203 66 q5 3 10 0" stroke="#222" stroke-width="2" fill="none"/>
        <path d="M217 66 q5 3 10 0" stroke="#222" stroke-width="2" fill="none"/>
        <ellipse cx="215" cy="77" rx="3" ry="4" fill="#7a3b2b"/>
      </g>
      <text x="60" y="70" font-size="22" fill="#666" font-family="Comic Sans MS, cursive">blah blah…</text>
    </svg>`,
  dozing: `
    <svg viewBox="0 0 320 180">
      <rect width="320" height="180" fill="#9c9486"/>
      <rect x="150" y="120" width="140" height="12" fill="#8b5a2b"/>
      <rect x="160" y="132" width="8" height="40" fill="#6b4220"/><rect x="272" y="132" width="8" height="40" fill="#6b4220"/>
      <rect x="195" y="88" width="40" height="36" rx="10" fill="#4a7bd0"/>
      <circle cx="225" cy="106" r="20" fill="#f2c79b"/>
      <path d="M206 98 q19 -22 38 0" fill="#3b2a1a"/>
      <path d="M215 108 q5 3 10 0" stroke="#222" stroke-width="2" fill="none"/>
      <text x="245" y="70" font-size="18" fill="#fff" font-family="Comic Sans MS, cursive">Z</text>
      <text x="262" y="50" font-size="24" fill="#fff" font-family="Comic Sans MS, cursive">Z</text>
      <text x="282" y="28" font-size="30" fill="#fff" font-family="Comic Sans MS, cursive">Z</text>
    </svg>`,
  dream: `
    <svg viewBox="0 0 320 180">
      <defs><radialGradient id="g" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#5b3fa8"/></radialGradient></defs>
      <rect width="320" height="180" fill="url(#g)"/>
      <circle cx="40" cy="30" r="2" fill="#fff"/><circle cx="280" cy="40" r="2" fill="#fff"/><circle cx="250" cy="150" r="2" fill="#fff"/><circle cx="70" cy="140" r="2" fill="#fff"/>
      <path d="M140 80 L120 150 L200 150 L180 80 Z" fill="#d62828"/>
      <rect x="140" y="80" width="40" height="60" rx="12" fill="#2b4dff"/>
      <circle cx="160" cy="62" r="20" fill="#f2c79b"/>
      <path d="M141 54 q19 -22 38 0" fill="#3b2a1a"/>
      <rect x="140" y="56" width="40" height="10" fill="#111"/>
      <circle cx="152" cy="61" r="3" fill="#fff"/><circle cx="168" cy="61" r="3" fill="#fff"/>
    </svg>`,
};

export async function loadSlideArt(scene) {
  const div = document.createElement('div');
  div.className = 'slide-art';
  div.innerHTML = ART[scene] ?? '';
  return div;
}

/** Slide-based cutscene player with tap-to-advance and Skip. */
export class Cutscene {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'overlay cutscene';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="slide"></div>
      <p class="caption"></p>
      <p class="tap-hint blink">${DIALOGUE.tapToContinue}</p>
      <button class="skip-btn">${DIALOGUE.skip}</button>`;
    root.appendChild(this.el);
    this.slideEl = this.el.querySelector('.slide');
    this.captionEl = this.el.querySelector('.caption');
    this.skipBtn = this.el.querySelector('.skip-btn');

    this.el.addEventListener('click', () => this.next());
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
  }

  /** Plays slides [{scene, caption}]; resolves when finished or skipped. */
  play(slides) {
    this.slides = slides;
    this.index = -1;
    this.el.style.display = '';
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.next();
    });
  }

  async next() {
    if (!this.slides || this.busy) return;
    this.index++;
    if (this.index >= this.slides.length) return this.finish();
    this.busy = true;
    const { scene, caption } = this.slides[this.index];
    const art = await loadSlideArt(scene);
    this.slideEl.classList.remove('in');
    this.slideEl.replaceChildren(art);
    this.captionEl.textContent = caption;
    void this.slideEl.offsetWidth; // restart CSS fade
    this.slideEl.style.transitionDuration = `${CONFIG.cutscene.fadeMs}ms`;
    this.slideEl.classList.add('in');
    this.busy = false;
  }

  finish() {
    if (!this.slides) return;
    this.slides = null;
    this.el.style.display = 'none';
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
