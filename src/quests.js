import * as THREE from 'three';
import { CONFIG, DIALOGUE } from './config.js';

const Q = CONFIG.quests;

// Part 1 progression. Each stage maps to an area of the map; see CLAUDE.md "Part 1 flow".
export const STAGES = Object.freeze([
  'rooftops',
  'trees',
  'mount',
  'ride',
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
   * @param {import('./horse.js').Horse} horse
   */
  constructor(scene, world, ui, horse) {
    this.scene = scene;
    this.world = world;
    this.ui = ui;
    this.horse = horse;
    this.boss = null; // set by main (the cave monster)
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

    const target = this.#target(obj);
    this.beacon.position.copy(target);
    const dx = target.x - hero.position.x;
    const dz = target.z - hero.position.z;
    const dist = Math.hypot(dx, dz);
    this.ui.setQuest(obj.text, Math.round(obj.distance ? obj.distance(hero) : dist));

    this.arrow.position.set(
      hero.position.x,
      hero.position.y + Q.arrowHeight + Math.sin(this.time * 3) * 0.08,
      hero.position.z,
    );
    // Along a route (the ride) the arrow points a little way ahead on it, not straight at the goal.
    const aim = obj.arrowTarget ? obj.arrowTarget(hero) : target;
    this.arrow.rotation.y = Math.atan2(aim.x - hero.position.x, aim.z - hero.position.z);
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
    this.beacon.position.copy(this.#target(obj));
    this.ui.setQuest(obj.text, null);
  }

  /** Objective targets are points, or functions for moving targets (the horse). */
  #target(obj) {
    return typeof obj.target === 'function' ? obj.target() : obj.target;
  }

  /** Progress along the ride track for the hero (nearest point). */
  #trackS(h) {
    const { track } = this.world;
    return (track.nearest(h.position.x, h.position.z, Q.trackSearch) ?? track.nearestGlobal(h.position.x, h.position.z)).s;
  }

  #buildObjectives() {
    const { layout } = this.world;
    const lastRoof = layout.roofs[layout.roofs.length - 1];
    const lastBranch = layout.branches[layout.branches.length - 1];
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
        id: 'mount',
        text: DIALOGUE.quests.mount,
        target: () => this.horse.position,
        isDone: () => this.horse.mounted,
      },
      {
        id: 'ride',
        text: DIALOGUE.quests.ride,
        doneText: DIALOGUE.quests.caveReached,
        target: this.world.caveArch,
        // Distance left along the trail (plus the last bit to the cave mouth).
        distance: (h) => {
          const { track, caveArch } = this.world;
          const end = track.at(track.length);
          return track.length - this.#trackS(h) + Math.hypot(caveArch.x - end.x, caveArch.z - end.z);
        },
        arrowTarget: (h) => {
          const { track } = this.world;
          const s = this.#trackS(h) + Q.arrowLookahead;
          return s >= track.length ? this.world.caveArch : track.at(s);
        },
        // Done when the horse lets the hero off at the arena (or the hero reaches the mouth).
        isDone: (h) =>
          this.horse.arrivedAtCave || Math.hypot(h.position.x - this.world.caveArch.x, h.position.z - this.world.caveArch.z) < CONFIG.cave.reach,
      },
      {
        id: 'cave',
        text: DIALOGUE.quests.boss,
        doneText: DIALOGUE.quests.bossDone,
        target: () => this.boss?.position ?? this.world.caveArch,
        isDone: () => !!this.boss?.defeated,
      },
      {
        id: 'enterCave',
        text: DIALOGUE.quests.enterCave,
        target: this.world.caveArch,
        isDone: () => false, // the girl's cutscene comes next (Part 1 step 7)
      },
    ];
  }
}
