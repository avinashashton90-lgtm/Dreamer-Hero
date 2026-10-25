// The five Elements' HUD icons, drawn in code (simple flat glyphs in a diamond frame; no image
// files): a flame, a bolt, a swirl, a magnet and a clock hand — Fire, Lightning, Steam, Magnet,
// Time. `elementIconSvg(id, color)` is the inline SVG markup (24 × 24, stroke / fill = `color`).

const FRAME = 'M12 1.2 L22.8 12 L12 22.8 L1.2 12 Z';

const GLYPHS = {
  fire: '<path d="M12 5.2c.9 2.6 3.7 3.9 3.7 7.3a3.7 3.7 0 0 1-7.4 0c0-1.5.6-2.5 1.5-3.4.2 1.1.7 1.7 1.3 1.9-.3-2.4.1-4.1.9-5.8z" fill="currentColor" stroke="none"/>',
  lightning: '<path d="M13.4 4.2 8.2 12.6h3.4l-1 7 5.2-8.6h-3.4z" fill="currentColor" stroke="none"/>',
  steam: '<path d="M12 12m0 0a1.4 1.4 0 1 1 2.8 0a3.2 3.2 0 1 1-6.4 0a5 5 0 1 1 10 0" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
  magnet: '<path d="M7.6 17.8v-6.4a4.4 4.4 0 0 1 8.8 0v6.4h-2.8v-6.4a1.6 1.6 0 0 0-3.2 0v6.4z" fill="currentColor" stroke="none"/><path d="M7.6 16.4h2.8M13.6 16.4h2.8" stroke="#10131a" stroke-width="1.1"/>',
  time: '<path d="M12 6.4V12l3.8 2.4" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
};

export function elementIconSvg(id) {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="${FRAME}" fill="rgba(10,12,20,0.55)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>${GLYPHS[id] ?? ''}</svg>`;
}
