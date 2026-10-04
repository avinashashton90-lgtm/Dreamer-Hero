// STUB — Part 1 progression. Each stage maps to a level/area; see CLAUDE.md "Part 1 flow".
export const STAGES = Object.freeze([
  'rooftops',
  'trees',
  'river',
  'forestRide',
  'cave',
  'girlCutscene',
  'desertRide',
  'toBeContinued',
]);

export class Quests {
  constructor() {
    this.stageIndex = 0;
  }
  get stage() {
    return STAGES[this.stageIndex];
  }
  advance() {
    this.stageIndex = Math.min(this.stageIndex + 1, STAGES.length - 1);
    return this.stage;
  }
  reset() {
    this.stageIndex = 0;
  }
  update(_dt) {}
}
