import { CONFIG, DIALOGUE } from './config.js';

// Animated cartoon placeholder art for each slide, drawn as inline SVG and animated with
// CSS (classes prefixed `ca-`, see style.css). Swap for real art later by returning any
// element from loadSlideArt().

const CLASSROOM_BG = `
  <rect width="320" height="180" fill="#e9dcc0"/>
  <rect y="140" width="320" height="40" fill="#c9a77c"/>
  <rect x="250" y="18" width="44" height="58" rx="4" fill="#9fd3f5" stroke="#7a5a3a" stroke-width="4"/>
  <line x1="272" y1="18" x2="272" y2="76" stroke="#7a5a3a" stroke-width="3"/>
  <line x1="250" y1="47" x2="294" y2="47" stroke="#7a5a3a" stroke-width="3"/>`;

const CHALKBOARD = `
  <rect x="18" y="16" width="130" height="78" rx="5" fill="#2f5a40" stroke="#8a5a2b" stroke-width="6"/>
  <g class="ca-chalk" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round">
    <g class="ca-eq ca-eq1"><path d="M30 34 q4 -8 8 0 q4 8 8 0"/><path d="M52 30 v8 M48 34 h8"/><path d="M62 34 q4 -8 8 0 q4 8 8 0"/><path d="M84 31 h8 M84 37 h8"/><path d="M98 34 q4 -8 8 0 q4 8 8 0"/></g>
    <g class="ca-eq ca-eq2"><path d="M30 54 l8 8 M38 54 l-8 8"/><path d="M46 55 h8 M46 61 h8"/><path d="M62 54 q6 -4 8 2 q-2 6 -8 6 h8"/><path d="M78 52 l-4 12 M84 52 l-4 12"/><path d="M92 58 h10"/></g>
    <g class="ca-eq ca-eq3"><circle cx="36" cy="80" r="6"/><path d="M33 72 l6 16"/><path d="M50 80 h8 M54 76 v8"/><path d="M66 74 q8 0 8 6 q0 6 -8 6"/><path d="M84 77 h8 M84 83 h8"/><path d="M100 74 v12 M100 74 q6 0 6 3 q0 3 -6 3"/></g>
  </g>`;

const DESK = `
  <rect x="150" y="122" width="140" height="12" rx="3" fill="#8b5a2b" stroke="#222" stroke-width="2.5"/>
  <rect x="160" y="134" width="9" height="40" fill="#6b4220" stroke="#222" stroke-width="2"/>
  <rect x="271" y="134" width="9" height="40" fill="#6b4220" stroke="#222" stroke-width="2"/>
  <path d="M232 114 l26 -4 l2 12 l-26 4 z" fill="#fff" stroke="#222" stroke-width="2"/>`;

// The boy: body + a head group (class hook so each slide can animate it differently).
const boy = (headClass, eyes, mouth) => `
  <rect x="193" y="82" width="44" height="46" rx="14" fill="#4a7bd0" stroke="#222" stroke-width="2.5"/>
  <g class="${headClass}">
    <circle cx="215" cy="62" r="22" fill="#f6cfa3" stroke="#222" stroke-width="2.5"/>
    <path d="M193 58 q4 -26 22 -24 q20 -2 22 24 q-6 -10 -12 -10 q-4 6 -10 0 q-6 6 -10 0 q-6 0 -12 10z" fill="#3b2a1a" stroke="#222" stroke-width="2"/>
    <circle cx="194" cy="66" r="4" fill="#f6cfa3" stroke="#222" stroke-width="2"/>
    ${eyes}
    ${mouth}
  </g>`;

const OPEN_EYES = `
  <g class="ca-blink"><ellipse cx="207" cy="63" rx="4" ry="5" fill="#fff" stroke="#222" stroke-width="1.5"/><circle cx="208" cy="64" r="2.2" fill="#222"/>
  <ellipse cx="223" cy="63" rx="4" ry="5" fill="#fff" stroke="#222" stroke-width="1.5"/><circle cx="224" cy="64" r="2.2" fill="#222"/></g>`;

const HEAVY_EYES = `
  <g><ellipse cx="207" cy="64" rx="4" ry="4" fill="#fff" stroke="#222" stroke-width="1.5"/><circle cx="207" cy="66" r="2" fill="#222"/>
  <ellipse cx="223" cy="64" rx="4" ry="4" fill="#fff" stroke="#222" stroke-width="1.5"/><circle cx="223" cy="66" r="2" fill="#222"/>
  <g class="ca-lids" fill="#f6cfa3" stroke="#222" stroke-width="1.5"><path d="M202 64 a5 5 0 0 1 10 0 z"/><path d="M218 64 a5 5 0 0 1 10 0 z"/></g></g>`;

const SHUT_EYES = `
  <path d="M202 65 q5 4 10 0 M218 65 q5 4 10 0" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/>`;

const ART = {
  // 1. Dull student at desk — equations keep appearing, he stares blankly.
  desk: `
    <svg viewBox="0 0 320 180">
      ${CLASSROOM_BG}${CHALKBOARD}
      <g class="ca-clock"><circle cx="190" cy="26" r="12" fill="#fff" stroke="#222" stroke-width="2.5"/><line class="ca-hand" x1="190" y1="26" x2="190" y2="17" stroke="#d62828" stroke-width="2"/></g>
      ${DESK}
      ${boy('ca-head ca-bob', OPEN_EYES, '<path d="M209 75 h12" stroke="#222" stroke-width="2.2" stroke-linecap="round"/>')}
    </svg>`,

  // 2. Drowsy — head slowly nods, chalkboard fades, room dims.
  drowsy: `
    <svg viewBox="0 0 320 180">
      ${CLASSROOM_BG}
      <g class="ca-fade-board">${CHALKBOARD}</g>
      ${DESK}
      ${boy('ca-head ca-nod', HEAVY_EYES, '<ellipse cx="215" cy="77" rx="3" ry="4" fill="#7a3b2b" stroke="#222" stroke-width="1.5"/>')}
      <rect class="ca-dim" width="320" height="180" fill="#1b1638"/>
    </svg>`,

  // 3. Dozing off — head down on the desk, Zzz float up, a swirl starts to form.
  dozing: `
    <svg viewBox="0 0 320 180">
      ${CLASSROOM_BG}${DESK}
      <rect x="193" y="92" width="44" height="36" rx="14" fill="#4a7bd0" stroke="#222" stroke-width="2.5"/>
      <g class="ca-breathe">
        <circle cx="222" cy="104" r="21" fill="#f6cfa3" stroke="#222" stroke-width="2.5"/>
        <path d="M201 100 q4 -24 22 -22 q20 -2 20 22 q-6 -8 -12 -8 q-4 6 -10 0 q-6 6 -10 0 q-6 0 -10 8z" fill="#3b2a1a" stroke="#222" stroke-width="2"/>
        <path d="M209 108 q5 4 10 0 M224 108 q5 4 10 0" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/>
        <ellipse class="ca-bubble" cx="238" cy="116" rx="4" ry="4" fill="#bfe6ff" stroke="#222" stroke-width="1"/>
      </g>
      <g font-family="Comic Sans MS, Chalkboard SE, cursive" font-weight="bold" fill="#fff" stroke="#222" stroke-width="1.5">
        <text class="ca-z ca-z1" x="246" y="84" font-size="16">Z</text>
        <text class="ca-z ca-z2" x="246" y="84" font-size="22">Z</text>
        <text class="ca-z ca-z3" x="246" y="84" font-size="28">Z</text>
      </g>
      <rect width="320" height="180" fill="#1b1638" opacity="0.55"/>
      <g transform="translate(160 90)"><g class="ca-swirl-start">
        <path d="M0 0 c10 -2 14 10 4 16 c-14 8 -30 -6 -24 -22 c8 -20 38 -18 46 4 c10 26 -16 48 -42 40" fill="none" stroke="#c9a7ff" stroke-width="5" stroke-linecap="round"/>
      </g></g>
    </svg>`,

  // 4. The dream begins — a purple swirl opens into another world; the masked hero appears.
  dream: `
    <svg viewBox="0 0 320 180">
      <defs>
        <radialGradient id="dreamSky" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.45" stop-color="#b07bf0"/><stop offset="1" stop-color="#3b1f78"/></radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#dreamSky)"/>
      <g transform="translate(160 90)"><g class="ca-swirl">
        <path d="M0 0 c12 -3 18 12 5 20 c-18 10 -38 -8 -30 -28 c10 -26 48 -22 58 6 c12 34 -22 60 -54 50 c-40 -12 -50 -62 -16 -88 c40 -30 102 -6 104 46" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>
      </g></g>
      <g class="ca-stars" fill="#fff">
        <path class="ca-star" d="M40 30 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z"/>
        <path class="ca-star" style="animation-delay:.5s" d="M280 40 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z"/>
        <path class="ca-star" style="animation-delay:1s" d="M260 150 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z"/>
        <path class="ca-star" style="animation-delay:1.5s" d="M60 140 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z"/>
      </g>
      <path d="M0 160 q40 -20 80 -6 q50 -26 100 -4 q60 -24 140 0 v30 h-320z" fill="#2a1659"/>
      <g class="ca-hero">
        <path class="ca-cape" d="M142 84 L118 150 Q160 140 202 150 L178 84 Z" fill="#d62828" stroke="#222" stroke-width="2.5"/>
        <rect x="140" y="80" width="40" height="62" rx="13" fill="#2b4dff" stroke="#222" stroke-width="2.5"/>
        <path d="M152 100 l8 -6 l8 6 l-8 10z" fill="#ffd23f" stroke="#222" stroke-width="1.5"/>
        <circle cx="160" cy="60" r="21" fill="#f6cfa3" stroke="#222" stroke-width="2.5"/>
        <path d="M139 56 q4 -26 21 -24 q19 -2 21 24 q-6 -10 -12 -10 q-4 6 -9 0 q-6 6 -9 0 q-6 0 -12 10z" fill="#3b2a1a" stroke="#222" stroke-width="2"/>
        <path d="M138 58 h44 v10 h-44z M182 60 l12 -4 l-2 8z" fill="#111" stroke="#222" stroke-width="1.5"/>
        <ellipse cx="152" cy="63" rx="4" ry="3" fill="#fff"/><ellipse cx="168" cy="63" rx="4" ry="3" fill="#fff"/>
        <path d="M153 72 q7 5 14 0" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`,
};

export async function loadSlideArt(scene) {
  const div = document.createElement('div');
  div.className = `slide-art art-${scene}`;
  div.innerHTML = ART[scene] ?? '';
  return div;
}

/**
 * Slide-based cutscene player: tap anywhere to advance, Skip to end, dots show progress.
 * Slides are [{scene, caption?}] — the optional caption is shown as one short comic line.
 */
export class Cutscene {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'overlay cutscene';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="slide"></div>
      <p class="caption"></p>
      <div class="progress"><div class="dots"></div><span class="next-arrow">▶</span></div>
      <button class="skip-btn">${DIALOGUE.skip}</button>`;
    root.appendChild(this.el);
    this.slideEl = this.el.querySelector('.slide');
    this.captionEl = this.el.querySelector('.caption');
    this.dotsEl = this.el.querySelector('.dots');
    this.skipBtn = this.el.querySelector('.skip-btn');

    const C = CONFIG.cutscene;
    this.el.style.setProperty('--fade-ms', `${C.fadeMs}ms`);
    this.el.style.setProperty('--swirl-ms', `${C.swirlMs}ms`);
    this.el.style.setProperty('--nod-s', `${C.nodSeconds}s`);

    this.el.addEventListener('click', () => this.next());
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
  }

  /** Plays slides; resolves when finished or skipped. */
  play(slides) {
    this.slides = slides;
    this.index = -1;
    this.dotsEl.replaceChildren(...slides.map(() => document.createElement('i')));
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
    const { scene, caption, transition } = this.slides[this.index];
    const art = await loadSlideArt(scene);
    this.slideEl.className = 'slide';
    this.slideEl.replaceChildren(art);
    this.captionEl.textContent = caption ?? '';
    this.captionEl.style.display = caption ? '' : 'none';
    [...this.dotsEl.children].forEach((d, i) => d.classList.toggle('on', i <= this.index));
    void this.slideEl.offsetWidth; // restart the entry animation
    this.slideEl.classList.add(transition === 'swirl' ? 'in-swirl' : 'in');
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
