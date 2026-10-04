// All tunable numbers live here. Systems must not hard-code gameplay values.
export const CONFIG = {
  render: {
    maxPixelRatio: 2,
    antialias: true,
    clearColor: 0x8fc8ff,
    fov: 60,
    near: 0.1,
    far: 400,
  },

  // The map is a linear route along +X: town rooftops → tree canopy → sand bank & river
  // → forest → cave arena → desert (empty for now). X spans -width/2..width/2, Z -depth/2..depth/2.
  world: {
    seed: 20261004,
    width: 300,
    depth: 200,
    segmentsX: 150,
    segmentsZ: 100,
    killY: -20,              // safety net: below this the hero respawns at the last safe spot
    fogNear: 70,
    fogFar: 240,
    edgeHillStart: 78,       // |z| where the boundary hills start rising
    edgeHillHeight: 16,
    pathAmplitude: 7,        // the ground route (sand → cave) wiggles in z
    pathFrequency: 0.035,
    pathHalfWidth: 6,        // forest trees keep this far from the route
    colors: {
      street: 0x4a4d57,
      swamp: 0x2d4a3e,
      sand: 0xe4cf98,
      riverBed: 0x8a7350,
      grass: 0x63b553,
      rock: 0x8a8378,
      desert: 0xf0c27b,
    },
  },

  zones: {
    riverX: 0,               // river centre line
    riverHalfWidth: 6,
    riverMeander: 4,
    riverFrequency: 0.03,
    riverBedY: -1.6,
    waterY: -0.8,
    forestStart: 8,
    caveStart: 84,
    desertStart: 124,
    sandHeight: 0.4,
    forestHillHeight: 1.6,
    forestHillScale: 0.06,
    desertDuneHeight: 2.5,
    desertDuneScale: 0.05,
  },

  rooftops: {
    startX: -142,            // west edge of the first roof
    count: 8,
    widthMin: 5.5,           // along X
    widthMax: 8,
    depthMin: 7,             // along Z
    depthMax: 10,
    gapMin: 1.8,             // horizontal gap between roofs
    gapMax: 3.2,
    gapUpMax: 2.4,           // max gap when the next roof is higher
    startHeight: 9,
    stepMin: -1.6,           // height change between consecutive roofs
    stepMax: 1.0,
    minHeight: 6,
    maxHeight: 13,
    zWiggle: 2.5,
    ledge: 0.35,             // thickness of the roof cap slab
    fillerCount: 46,         // decorative buildings around the route
    fillerHeightMin: 5,
    fillerHeightMax: 22,
    fillerClearance: 9,      // filler buildings keep this far (in z) from the route
    colors: [0xc9b8a6, 0xa8b5c4, 0xd9a27a, 0x9aa88a, 0xc4a5c9, 0xb3a184],
    roofColor: 0x5b4a5e,
    routeRoofColor: 0xe8c547, // roofs on the jump route stand out
    windowColor: 0x2c3550,
  },

  treeRoute: {
    count: 7,
    padRadiusMin: 2.0,
    padRadiusMax: 2.6,
    gapMin: 1.8,             // edge-to-edge gap between pads
    gapMax: 2.8,
    endHeight: 1.6,          // last pad is low enough to hop down onto the sand
    zWiggle: 2.5,
    trunkRadius: 0.7,
    canopyRadius: 3.4,
    canopyLift: 5.5,         // canopy centre above the pad
    padThickness: 0.5,
    trunkColor: 0x6b4423,
    padColor: 0x8a5a2b,
    canopyColor: 0x2f8a3c,
  },

  forest: {
    count: 170,
    trunkRadius: 0.35,       // collider radius at scale 1
    scaleMin: 0.9,
    scaleMax: 1.8,
    edgeCount: 60,           // extra trees scattered along the map edges
  },

  cave: {
    center: [104, 0],
    radius: 17,
    rockCount: 34,
    rockSizeMin: 2.4,
    rockSizeMax: 4.2,
    openingHalfAngle: 0.45,  // radians; opening faces west toward the forest
    colliderScale: 0.8,
  },

  sky: {
    top: 0x4f8fe6,
    horizon: 0xcfe8ff,
    radius: 380,
    sunDirection: [0.4, 0.55, 0.3],
    sunColor: 0xfff2c4,
    cloudCount: 26,
    cloudHeight: [45, 75],
  },

  water: {
    color: 0x3b8fd9,
    opacity: 0.8,
    swampColor: 0x23402f,
    swampOpacity: 0.9,
    waveSpeed: 1.2,
    waveHeight: 0.06,
  },

  lights: {
    ambient: 0.55,
    hemiSky: 0xbfe3ff,
    hemiGround: 0x4a6b3a,
    hemiIntensity: 0.6,
    sunIntensity: 1.6,
    sunPosition: [40, 80, 30],
  },

  hero: {
    radius: 0.4,
    height: 1.8,           // total capsule height
    color: 0x2b4dff,
    maskColor: 0x111111,
    capeColor: 0xd62828,
    walkSpeed: 7,
    acceleration: 40,      // how quickly velocity reaches target
    airControl: 0.6,       // fraction of acceleration while airborne
    turnSpeed: 12,         // how quickly the model faces move direction
    jumpVelocity: 9,
    gravity: 25,
    maxFallSpeed: 40,
    // Jump assist so touch controls feel fair:
    coyoteTime: 0.15,      // seconds you can still jump after running off a ledge
    jumpBuffer: 0.15,      // seconds a jump press is remembered before landing
    ledgeAssist: 0.55,     // while falling, snap up onto a ledge this far above the feet
    edgeGrace: 0.25,       // platforms count as underfoot this far past their edge
    stepUp: 0.35,          // max height walked up without jumping
    respawnFadeMs: 350,
    shadowSize: 1.1,
    shadowOpacity: 0.3,
  },

  camera: {
    distance: 7,
    height: 1.6,           // look-at offset above hero feet
    minPitch: -0.2,
    maxPitch: 1.2,
    startPitch: 0.35,
    startYaw: -Math.PI / 2, // behind the hero, looking along the route (+X)
    followLerp: 10,        // higher = snappier follow
    dragSensitivity: 0.006, // radians per pixel (touch)
    mouseSensitivity: 0.005,
    groundClearance: 0.5,
  },

  input: {
    joystickRadius: 60,    // px, max knob travel
    joystickDeadZone: 0.12,
    jumpButtonSize: 84,    // px
  },

  cutscene: {
    fadeMs: 450,       // fade between slides
    swirlMs: 1600,     // swirl transition into the dream world
    nodSeconds: 3.2,   // one slow head-nod cycle on the drowsy slide
  },

  ui: {
    rotateCheckMs: 250,
    hintHideMs: 8000,      // controls hint fades after this long
    toastMs: 2200,
  },

  horse: {
    position: [-12, 6],    // on the sand bank by the river (x, z)
    facing: Math.PI / 2,
  },

  quests: {
    arrowHeight: 2.7,      // objective arrow height above the hero's feet
    arrowColor: 0xffd23f,
    beaconColor: 0xffe680,
    beaconHeight: 30,
    beaconRadius: 0.8,
    horseReach: 4,         // distance at which the horse counts as found
  },
};

// All story text / dialogue lives here.
export const DIALOGUE = {
  title: 'Dreamer Hero',
  rotatePhone: 'Please rotate your phone to landscape',
  skip: 'Skip ▶▶',
  gameOver: 'You woke up with a jolt!',
  retry: 'Tap to dream again',
  toBeContinued: 'To be continued…',
  quests: {
    rooftops: 'Jump across the rooftops',
    trees: 'Leap through the trees',
    horse: 'Find the horse',
    horseFound: 'You found the horse!',
  },
  objectiveComplete: 'Objective complete!',
  distanceUnit: 'm',
  controlsHint: 'Left: move · Right: look · Jump button  —  Keys: WASD / Space / mouse drag',

  // Intro is told through pictures only. Add `caption: '...'` to a slide for one short comic line.
  intro: [
    { scene: 'desk' },
    { scene: 'drowsy' },
    { scene: 'dozing' },
    { scene: 'dream', transition: 'swirl' },
  ],
};
