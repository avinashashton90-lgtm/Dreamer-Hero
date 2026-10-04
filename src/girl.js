import * as THREE from 'three';
import { CONFIG } from './config.js';

const G = CONFIG.boss.girl;
const CI = CONFIG.cinematic;

/**
 * Placeholder girl (origin at the feet, facing +Z): long dress, head with long dark hair, eyes
 * (their material glows for the witch hint) and arms on shoulder/elbow pivots (hands clasped
 * when frightened). Swap for a glTF later; keep the userData pivots.
 */
export async function loadGirlModel() {
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
  group.userData = { body, head, arms, eyeMat, dressMat };
  return group;
}

/**
 * Placeholder shadow on the cave wall: two flat silhouettes — the girl's, and (shown only
 * during the witch hint) one with a pointed hat and a long staff. Faces west, out of the wall.
 */
export async function loadWitchShadowModel() {
  const S = G.shadow;
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: S.opacity, depthWrite: false, side: THREE.DoubleSide });
  const girl = new THREE.Shape();
  girl.moveTo(-0.38, 0).lineTo(0.38, 0).lineTo(0.16, 0.62).lineTo(0.1, 0.8).lineTo(-0.1, 0.8).lineTo(-0.16, 0.62).closePath();
  const head = new THREE.Shape();
  head.absarc(0, 0.9, 0.1, 0, Math.PI * 2, false);
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
 * The girl from the cave: frightened (hands clasped, trembling) until rescued, then rides
 * behind the hero. `hint()` plays the witch hint: her eyes flicker purple and her shadow on
 * the cave wall shows a pointed hat and a long staff, then all is normal again.
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
    this.hintT = 0;
    this.hints = 0;
    this.shadow.visible = false;
  }

  /** The witch hint (eyes + shadow) for `seconds`. */
  hint(seconds = CI.hintTime) {
    this.hintT = seconds;
    this.hints++;
  }

  get hinting() {
    return this.hintT > 0;
  }

  update(dt, groundY = 0) {
    this.time += dt;
    this.hintT = Math.max(0, this.hintT - dt);
    const { body, head, arms, eyeMat } = this.model.userData;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    for (const a of arms) {
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
    }
    if (this.riding) {
      // Sitting behind the hero, holding on.
      body.position.y = -0.55;
      arms.forEach((a, i) => {
        a.shoulder.rotation.set(-1.1, 0, (i ? -1 : 1) * 0.25);
        a.elbow.rotation.x = -0.6;
      });
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
    // Witch hint: eyes flicker purple; the wall shadow flickers to the hat-and-staff shape.
    const flick = this.hinting && Math.sin(this.time * 47) > -0.3;
    eyeMat.color.setHex(flick ? CI.hintColor : 0x222222);
    if (this.shadow) {
      this.shadow.visible = this.model.visible && !this.riding;
      this.shadow.position.y = groundY;
      this.shadow.userData.hint.visible = flick;
      this.shadow.userData.normal.visible = !flick;
    }
  }
}
