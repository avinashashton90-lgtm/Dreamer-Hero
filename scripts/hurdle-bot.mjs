// A player's handling of the forest hurdles (hurdles.js), shared by the headless tests: jump the
// stones and thorn bushes so the apex comes over them, and for a giant wall gallop in from
// `wallGallop` out and power-jump so the apex comes over its face.
import { CONFIG } from '../src/config.js';

const HC = CONFIG.horse;
const HU = CONFIG.hurdles;
const W = HU.types.wall;
const wallGallop = 50; // (from the gallop to full speed takes ~30)

/**
 * @param {{ jumpSmall?: boolean }} opts  jumpSmall false: never jump stones / thorns (walls still)
 * @returns {{ jump: boolean, gallop: boolean }}  gallop true: hold it now (a wall is coming)
 */
export function hurdleControls(horse, hurdles, { jumpSmall = true } = {}) {
  let jump = false;
  let gallop = false;
  for (const h of hurdles.list) {
    const ds = (horse.trackS ?? 0) - h.s; // (along the trail: near this one only)
    if (ds > 0 || ds < -wallGallop) continue;
    const { along } = hurdles.frame(h, horse.position);
    if (along > 0) continue;
    if (h.type === 'wall') {
      gallop = true;
      const plane = -(W.depth / 2 + W.contact);
      const lead = horse.speed * ((HC.hopVelocity * HU.powerJump.boost) / HC.gravity);
      if (horse.grounded && horse.galloping && horse.powerJumpZone && plane - along > 0 && plane - along < lead + 0.3) jump = true;
    } else if (jumpSmall) {
      const lead = Math.max(1.2, horse.speed * (HC.hopVelocity / HC.gravity));
      if (horse.grounded && -along < lead + 0.5 && -along > 0.5) jump = true;
    }
  }
  return { jump, gallop };
}
