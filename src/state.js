// Game state machine: intro → play ⇄ cutscene, play → gameover → play, any → ending.
export const STATES = Object.freeze({
  INTRO: 'intro',
  PLAY: 'play',
  CUTSCENE: 'cutscene',
  GAMEOVER: 'gameover',
  ENDING: 'ending',
});

const TRANSITIONS = {
  [STATES.INTRO]: [STATES.PLAY, STATES.CUTSCENE],
  [STATES.PLAY]: [STATES.CUTSCENE, STATES.GAMEOVER, STATES.ENDING],
  [STATES.CUTSCENE]: [STATES.PLAY, STATES.ENDING],
  [STATES.GAMEOVER]: [STATES.PLAY, STATES.INTRO],
  [STATES.ENDING]: [STATES.INTRO],
};

export class GameState {
  constructor(initial = STATES.INTRO) {
    this.current = initial;
    this.paused = false;
    this.listeners = new Map(); // state -> { enter: [], exit: [] }
  }

  is(state) {
    return this.current === state;
  }

  onEnter(state, fn) {
    this.#bucket(state).enter.push(fn);
  }

  onExit(state, fn) {
    this.#bucket(state).exit.push(fn);
  }

  set(next, data) {
    if (next === this.current) return true;
    if (!TRANSITIONS[this.current]?.includes(next)) {
      console.warn(`Invalid state transition ${this.current} → ${next}`);
      return false;
    }
    const prev = this.current;
    this.#bucket(prev).exit.forEach((fn) => fn(next, data));
    this.current = next;
    this.#bucket(next).enter.forEach((fn) => fn(prev, data));
    return true;
  }

  /** Fires enter listeners for the initial state. Call once after wiring. */
  start(data) {
    this.#bucket(this.current).enter.forEach((fn) => fn(null, data));
  }

  #bucket(state) {
    if (!this.listeners.has(state)) this.listeners.set(state, { enter: [], exit: [] });
    return this.listeners.get(state);
  }
}
