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

/**
 * Objectives with a target position and a completion test. The current objective is shown
 * in the HUD quest panel (top left) with its distance. There is no 3D marker or pointer in
 * the world: no arrow over the hero, no beacon at the target.
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
    this.story = null; // set by main (the girl's scene, the desert ride)
    this.index = 0;
    this.objectives = this.#buildObjectives();
  }

  async init() {
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

  /** Jump to an objective by id (debug keys). */
  goTo(id) {
    const i = this.objectives.findIndex((o) => o.id === id);
    if (i >= 0) {
      this.index = i;
      this.#show();
    }
  }

  /** @param {import('./hero.js').Hero} hero */
  update(dt, hero) {
    const obj = this.current;
    if (!obj) return;

    if (obj.isDone(hero)) {
      this.index++;
      this.ui.toast(obj.doneText ?? DIALOGUE.objectiveComplete);
      this.#show();
      return;
    }

    const target = this.#target(obj);
    const dist = Math.hypot(target.x - hero.position.x, target.z - hero.position.z);
    this.ui.setQuest(obj.text, Math.round(obj.distance ? obj.distance(hero) : dist));
  }

  #show() {
    const obj = this.current;
    this.ui.setQuest(obj ? obj.text : null, null);
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
        target: () => this.boss?.girl?.position ?? this.world.caveArch, // the girl at the cave mouth
        isDone: () => !!this.story?.girlJoined,
      },
      {
        id: 'castle',
        text: DIALOGUE.quests.castle,
        doneText: DIALOGUE.quests.castleReached,
        target: () => this.world.castlePosition,
        // Distance left along the desert trail (plus the last bit to the castle).
        distance: (h) => {
          const t = this.world.desertTrack;
          const c = this.world.castlePosition;
          const end = t.at(t.length);
          const s = (t.nearest(h.position.x, h.position.z, Q.trackSearch) ?? t.nearestGlobal(h.position.x, h.position.z)).s;
          return t.length - s + Math.hypot(c.x - end.x, c.z - end.z);
        },
        isDone: () => this.story?.phase === 'ending' || this.story?.phase === 'done',
      },
    ];
  }
}
