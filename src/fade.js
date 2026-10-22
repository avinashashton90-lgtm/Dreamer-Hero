import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Fades a whole model (each material keeps its own base opacity; additive glows — eye glow,
 * auras — are left as they are). 1 = back to normal.
 */
export function setObjectOpacity(obj, opacity) {
  if (!obj || obj.userData.fadeOpacity === opacity) return;
  obj.userData.fadeOpacity = opacity;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.blending === THREE.AdditiveBlending) continue;
      const base = (m.userData.fadeBase ??= { opacity: m.opacity, transparent: m.transparent });
      const want = opacity < 1 || base.transparent;
      if (m.transparent !== want) {
        m.transparent = want;
        m.needsUpdate = true;
      }
      m.opacity = base.opacity * opacity;
    }
  });
}

/**
 * The characters a cutscene camera keeps its distance from (and fades): AJ, Amy and the horse.
 * Each: { name, shape() → { feet, height, radius } | null (not in the scene), fade(opacity) }.
 */
export function characterBodies({ hero, girlModel, horse }) {
  const R = CONFIG.cinematic.guard.radius;
  return [
    { name: 'hero', shape: () => (hero.model?.visible === false ? null : { feet: hero.position, height: CONFIG.heroModel.height, radius: R.hero }), fade: (o) => { hero.cameraOpacity = o; } },
    { name: 'girl', shape: () => (girlModel?.visible ? { feet: girlModel.position, height: CONFIG.girlModel.height, radius: R.girl } : null), fade: (o) => setObjectOpacity(girlModel, o) },
    { name: 'horse', shape: () => (horse?.model?.visible === false ? null : { feet: horse.position, height: R.horseHeight, radius: R.horse }), fade: (o) => setObjectOpacity(horse.model, o) },
  ];
}
