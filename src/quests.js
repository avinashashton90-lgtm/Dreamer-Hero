import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';

const Q = CONFIG.quests;

// Part 1 progression. Each stage maps to an area of the map; see CLAUDE.md "Part 1 flow".
export const STAGES = Object.freeze([
  'rooftops',
  'trees',
  'horse',
  'forestRide',
  'cave',
  'girlCutscene',
  'desertRide',
  'toBeContinued',
]);

/** Placeholder objective arrow (points along +Z). Swap for a glTF later. */
export async function loadArrowModel() {
  const mat = new THREE.MeshBasicMaterial({ color: Q.arrowColor });
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.55;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), mat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.05;
  group.add(head, shaft);
  return group;
}

/** Placeholder light pillar marking the objective. */
export async function loadBeaconModel() {
  const geo = new THREE.CylinderGeometry(Q.beaconRadius, Q.beaconRadius * 1.6, Q.beaconHeight, 16, 1, true);
  geo.translate(0, Q.beaconHeight / 2, 0);
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: Q.beaconColor,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
}

/**
 * Objectives with a target position and a completion test. The current objective is shown
 * in the HUD with its distance, an arrow above the hero points at it and a beacon marks it.
 */
export class Quests {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {import('./ui.js').UI} ui
   */
  constructor(scene, world, ui) {
    this.scene = scene;
    this.world = world;
    this.ui = ui;
    this.index = 0;
    this.time = 0;
    this.objectives = this.#buildObjectives();
  }

  async init() {
    this.arrow = await loadArrowModel();
    this.beacon = await loadBeaconModel();
    this.scene.add(this.arrow, this.beacon);
    this.reset();
  }

  get current() {
    return this.objectives[this.index] ?? null;
  }

  get stage() {
    return this.current?.id ?? STAGES[STAGES.length - 1];
  }

  reset() {
    this.index = 0;
    this.#show();
  }

  /** @param {import('./hero.js').Hero} hero */
  update(dt, hero) {
    this.time += dt;
    const obj = this.current;
    if (!obj) return;

    if (obj.isDone(hero)) {
      this.index++;
      this.ui.toast(obj.doneText ?? DIALOGUE.objectiveComplete);
      this.#show();
      return;
    }

    const dx = obj.target.x - hero.position.x;
    const dz = obj.target.z - hero.position.z;
    const dist = Math.hypot(dx, dz);
    this.ui.setQuest(obj.text, Math.round(dist));

    this.arrow.position.set(
      hero.position.x,
      hero.position.y + Q.arrowHeight + Math.sin(this.time * 3) * 0.08,
      hero.position.z,
    );
    this.arrow.rotation.y = Math.atan2(dx, dz);
    this.arrow.visible = dist > 3;
    this.beacon.material.opacity = 0.25 + 0.1 * Math.sin(this.time * 2.5);
  }

  #show() {
    const obj = this.current;
    this.arrow.visible = this.beacon.visible = !!obj;
    if (!obj) {
      this.ui.setQuest(null);
      return;
    }
    this.beacon.position.copy(obj.target);
    this.ui.setQuest(obj.text, null);
  }

  #buildObjectives() {
    const { layout } = this.world;
    const lastRoof = layout.roofs[layout.roofs.length - 1];
    const lastBranch = layout.branches[layout.branches.length - 1];
    const [hx, hz] = CONFIG.horse.position;
    const landing = lastBranch.x1 + 4;
    return [
      {
        id: 'rooftops',
        text: DIALOGUE.quests.rooftops,
        target: new THREE.Vector3((lastRoof.minX + lastRoof.maxX) / 2, lastRoof.top, (lastRoof.minZ + lastRoof.maxZ) / 2),
        // Done once the hero stands on the first tree pad (or anything past the town).
        isDone: (h) => h.grounded && h.position.x > layout.townEndX,
      },
      {
        id: 'trees',
        text: DIALOGUE.quests.trees,
        target: new THREE.Vector3(landing, this.world.heightAt(landing, lastBranch.z1), lastBranch.z1),
        isDone: (h) => h.grounded && !h.platform && h.position.x >= layout.hazardEndX,
      },
      {
        id: 'horse',
        text: DIALOGUE.quests.horse,
        doneText: DIALOGUE.quests.horseFound,
        target: new THREE.Vector3(hx, this.world.heightAt(hx, hz), hz),
        isDone: (h) => Math.hypot(h.position.x - hx, h.position.z - hz) < Q.horseReach,
      },
    ];
  }
}
