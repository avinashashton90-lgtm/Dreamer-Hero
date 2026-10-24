import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadMixamoGirl } from './girlModel.js';

const G = CONFIG.boss.girl;
const GLB = CONFIG.girlModel.glanceBack;
const CI = CONFIG.cinematic;

/**
 * The girl's model (origin at the feet, facing +Z): Amy, the Mixamo character, with her clips
 * (girlModel.js) — or, if anything fails to load, the code-built placeholder below.
 * @param {{ readFile?, onProgress?, placeholder? }} [opts]
 */
export async function loadGirlModel(opts = {}) {
  if (!opts.placeholder) {
    try {
      return await loadMixamoGirl(opts);
    } catch (e) {
      console.warn('Girl model failed to load; using the placeholder girl.', e);
    }
  }
  return buildPlaceholderGirl();
}

/**
 * Placeholder girl, used only if Amy fails to load (origin at the feet, facing +Z): long
 * dress, head with long dark hair, eyes (their material glows for the witch hint) and arms on
 * shoulder/elbow pivots (hands clasped when frightened), posed procedurally.
 */
function buildPlaceholderGirl() {
  const dressMat = new THREE.MeshLambertMaterial({ color: G.color, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: G.skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: G.hair, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const group = new THREE.Group();
  const body = new THREE.Group(); // trembles; sits lower when riding
  group.add(body);
  const H = G.height;
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.42, H * 0.62, 10, 1, true), dressMat);
  dress.position.y = H * 0.31;
  dressMat.side = THREE.DoubleSide;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, H * 0.28, 8), dressMat);
  torso.position.y = H * 0.7;
  const head = new THREE.Group();
  head.position.y = H * 0.9;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
  hair.position.y = 0.015;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.08), hairMat); // long hair down the back
  back.position.set(0, -0.17, -0.11);
  head.add(hair, back);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eyeMat);
    eye.position.set(side * 0.05, 0.01, 0.13);
    head.add(eye);
  }
  // Mouth: a small neutral line, or a gentle smile.
  const lips = new THREE.MeshBasicMaterial({ color: 0x8a3a3a });
  const neutral = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.01), lips);
  neutral.position.set(0, -0.06, 0.133);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI), lips);
  smile.position.set(0, -0.05, 0.133);
  smile.rotation.z = Math.PI; // curve up at the ends
  smile.visible = false;
  head.add(neutral, smile);
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.19, H * 0.8, 0);
    shoulder.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 6).translate(0, -0.13, 0), dressMat));
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    elbow.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.24, 6).translate(0, -0.12, 0), skin));
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), skin).translateY(-0.25));
    shoulder.add(elbow);
    body.add(shoulder);
    arms.push({ shoulder, elbow });
  }
  body.add(dress, torso, head);
  group.userData = { kind: 'placeholder', body, head, arms, eyeMat, dressMat, mouth: { neutral, smile } };
  return group;
}

/**
 * Placeholder shadow on the cave wall: two flat silhouettes — the girl's, and (shown only
 * during the witch hint) one with a pointed hat and a long staff. Faces west, out of the wall.
 */
export async function loadWitchShadowModel() {
  const S = G.shadow;
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: S.opacity, depthWrite: false, side: THREE.DoubleSide });
  // Her own shadow: legs, shorts, top, a bob of hair.
  const girl = new THREE.Shape();
  girl.moveTo(-0.14, 0).lineTo(-0.07, 0).lineTo(-0.03, 0.36).lineTo(0.03, 0.36).lineTo(0.07, 0).lineTo(0.14, 0)
    .lineTo(0.13, 0.42).lineTo(0.15, 0.48).lineTo(0.16, 0.72).lineTo(0.08, 0.8).lineTo(-0.08, 0.8).lineTo(-0.16, 0.72)
    .lineTo(-0.15, 0.48).lineTo(-0.13, 0.42).closePath();
  const head = new THREE.Shape();
  head.moveTo(-0.13, 0.78).lineTo(0.13, 0.78).lineTo(0.13, 0.9).quadraticCurveTo(0.13, 1.02, 0, 1.02).quadraticCurveTo(-0.13, 1.02, -0.13, 0.9).closePath();
  const witch = new THREE.Shape();
  witch.moveTo(-0.42, 0).lineTo(0.42, 0).lineTo(0.17, 0.62).lineTo(0.1, 0.8).lineTo(0.3, 0.86).lineTo(0.02, 1.32).lineTo(-0.3, 0.86).lineTo(-0.1, 0.8).lineTo(-0.17, 0.62).closePath();
  const staff = new THREE.Shape();
  staff.moveTo(0.46, 0).lineTo(0.5, 0).lineTo(0.62, 1.15).lineTo(0.7, 1.22).lineTo(0.6, 1.25).lineTo(0.56, 1.16).closePath();
  const make = (shapes) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shapes), mat);
    m.scale.set(S.width, S.height / 1.32, 1);
    return m;
  };
  const group = new THREE.Group();
  const normal = make([girl, head]);
  const hint = make([witch, staff]);
  hint.visible = false;
  group.add(normal, hint);
  group.rotation.y = -Math.PI / 2; // face west, out of the wall
  group.userData = { normal, hint, mat };
  group.visible = false;
  return group;
}

/**
 * The girl from the cave: frightened (scared) until rescued, then rides behind the hero.
 * `hint()` plays the witch hint: a faint purple glow flickers over her eyes and her shadow on
 * the cave wall shows a pointed hat and a long staff, then all is normal again (with
 * CONFIG.girlWitchForm both stay — the hook for her later transformation). The story sets the
 * flags (frightened, riding, talking, lookAtHero, pointing, walking, kneeling, smiling);
 * `pose` is the resulting base pose and drives Amy's clips (or the placeholder's pivots).
 */
export class Girl {
  /** @param {THREE.Object3D} model  (loadGirlModel) */
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.frightened = true;
    this.riding = false;
    this.hintT = 0;
    this.hints = 0;
    this.time = 0;
    this.lookAtHero = false; // riding: turns to look at him
    this.pointing = false; // right arm points ahead
    this.kneeling = false; // at the pit, a hand in the water
    this.walking = false;
    this.smiling = false;
    this.talking = false; // one of her lines is up
    this.glanceBack = false; // a nervous glance back (the castle gates)
    this.awakenT = 0; // her eyes glow white-violet (the castle courtyard, her memory returning)
    model.userData.onMount = () => (this.riding = true);
    model.userData.onDismount = () => (this.riding = false);
  }

  async init() {
    this.shadow = await loadWitchShadowModel();
    const S = G.shadow;
    this.shadow.position.set(S.x, 0, S.z);
    this.scene.add(this.shadow);
  }

  reset() {
    this.frightened = true;
    this.riding = false;
    this.lookAtHero = this.pointing = this.kneeling = this.walking = this.smiling = this.talking = this.glanceBack = false;
    this.hintT = 0;
    this.hints = 0;
    this.awakenT = 0;
    this.shadow.visible = false;
  }

  /** Her eyes glow white-violet for `seconds` (the end of Part 1: her memory and magic return). */
  awaken(seconds) {
    this.awakenT = seconds;
  }

  /** The witch hint (eyes + shadow) for `seconds`. */
  hint(seconds = CI.hintTime) {
    this.hintT = seconds;
    this.hints++;
  }

  get hinting() {
    return this.hintT > 0;
  }

  /** Base pose: ride → kneel → happy (the smile) → walk → scared → idle. */
  get pose() {
    if (this.riding) return 'ride';
    if (this.kneeling) return 'kneel';
    if (this.smiling) return 'happy';
    if (this.walking) return 'walk';
    if (this.frightened) return 'scared';
    return 'idle';
  }

  /** The witch hint's flicker: during the hint, steady in her witch form (the wall shadow). */
  get #flicker() {
    return CONFIG.girlWitchForm || (this.hinting && Math.sin(this.time * 47) > -0.3);
  }

  /** The eye glow: the white-violet awakening, or the witch's (only with CONFIG.girlEyeGlow — off). */
  get eyesGlowing() {
    return this.awakenT > 0 || (CONFIG.girlEyeGlow && this.#flicker);
  }

  /** The glow's colour: white-violet while awakening, else the witch hint's. */
  get eyeColor() {
    return this.awakenT > 0 ? CONFIG.part2.portal.eyeColor : CI.hintColor;
  }

  update(dt, groundY = 0) {
    this.time += dt;
    this.hintT = Math.max(0, this.hintT - dt);
    this.awakenT = Math.max(0, this.awakenT - dt);
    const u = this.model.userData;
    if (u.animator) u.animator.update(dt, this);
    else this.#posePlaceholder();
    // Witch hint on the cave wall: her shadow flickers to the hat-and-staff shape.
    const flick = this.#flicker;
    if (this.shadow) {
      // (her shadow on the cave wall only exists while she stands at the cave mouth)
      const atCave = Math.hypot(this.model.position.x - G.shadow.x, this.model.position.z - G.shadow.z) < 15;
      this.shadow.visible = this.model.visible && !this.riding && atCave;
      this.shadow.position.y = groundY;
      this.shadow.userData.hint.visible = flick;
      this.shadow.userData.normal.visible = !flick;
    }
  }

  /** The placeholder's pivots (the fallback model). */
  #posePlaceholder() {
    const { body, head, arms, eyeMat } = this.model.userData;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    for (const a of arms) {
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
    }
    if (this.riding) {
      // Sitting behind the hero, holding on (or looking round at him, or pointing ahead).
      body.position.y = -0.55;
      arms.forEach((a, i) => {
        a.shoulder.rotation.set(-1.1, 0, (i ? -1 : 1) * 0.25);
        a.elbow.rotation.x = -0.6;
      });
      if (this.lookAtHero) {
        head.rotation.set(0.3, 0.45, 0); // leaning round to see his face
        body.rotation.y = 0.2;
      }
      if (this.glanceBack) {
        head.rotation.y = GLB.yaw * 0.6; // a nervous glance back over her shoulder
        body.rotation.y = GLB.yaw * 0.3;
      }
    } else if (this.kneeling) {
      // Kneeling at the pit, right hand in the water.
      body.position.y = -0.62;
      body.rotation.x = 0.35;
      head.rotation.x = 0.3;
      arms[1].shoulder.rotation.set(-1.25, 0, -0.1);
      arms[1].elbow.rotation.x = -0.2;
      arms[0].shoulder.rotation.set(-0.3, 0, 0.2);
    } else if (this.walking) {
      body.position.y = Math.abs(Math.sin(this.time * 7)) * 0.04;
      arms.forEach((a, i) => (a.shoulder.rotation.x = Math.sin(this.time * 7 + i * Math.PI) * 0.35));
    } else if (this.frightened) {
      // Hands clasped at the chest, shoulders hunched, a nervous shiver.
      body.rotation.z = Math.sin(this.time * 31) * CI.tremble;
      body.rotation.x = 0.08;
      head.rotation.x = 0.15 + Math.sin(this.time * 23) * CI.tremble;
      arms.forEach((a, i) => {
        a.shoulder.rotation.set(-0.55, 0, (i ? -1 : 1) * 0.45); // arms in toward the chest...
        a.elbow.rotation.set(-1.5, 0, (i ? -1 : 1) * 0.35); // ...hands meeting in front
      });
    }
    if (this.pointing) {
      // Right arm out, pointing ahead.
      arms[1].shoulder.rotation.set(-1.55, 0, -0.15);
      arms[1].elbow.rotation.x = 0;
    }
    const { neutral, smile } = this.model.userData.mouth;
    smile.visible = this.smiling;
    neutral.visible = !this.smiling;
    eyeMat.color.setHex(this.eyesGlowing ? this.eyeColor : 0x222222);
  }
}
