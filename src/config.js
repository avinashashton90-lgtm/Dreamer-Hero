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

  world: {
    size: 300,            // terrain width/depth in world units
    segments: 120,        // terrain grid resolution
    hillHeight: 4,        // amplitude of the rolling hills
    hillScale: 0.035,     // frequency of the hills
    flatRadius: 12,       // flat area around spawn
    killY: -20,           // falling below this = gameover
    fogNear: 60,
    fogFar: 220,
    groundColor: 0x6bbf59,
    skyColor: 0x8fc8ff,
    treeCount: 60,
    treeMinDist: 20,
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
    airControl: 0.35,      // fraction of acceleration while airborne
    turnSpeed: 12,         // how quickly the model faces move direction
    jumpVelocity: 9,
    gravity: 25,
    maxFallSpeed: 40,
    coyoteTime: 0.12,      // seconds you can still jump after leaving ground
    jumpBuffer: 0.12,      // seconds a jump press is remembered before landing
    spawn: [0, 0, 0],
    shadowSize: 1.1,
    shadowOpacity: 0.3,
  },

  camera: {
    distance: 7,
    height: 1.6,           // look-at offset above hero feet
    minPitch: -0.2,
    maxPitch: 1.2,
    startPitch: 0.35,
    startYaw: 0,
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
    fadeMs: 350,
  },

  ui: {
    rotateCheckMs: 250,
  },
};

// All story text / dialogue lives here.
export const DIALOGUE = {
  title: 'Dreamer Hero',
  rotatePhone: 'Please rotate your phone to landscape',
  tapToContinue: 'Tap to continue',
  skip: 'Skip ▶▶',
  gameOver: 'You woke up with a jolt!',
  retry: 'Tap to dream again',
  toBeContinued: 'To be continued…',
  controlsHint: 'Left: move · Right: look · Jump button  —  Keys: WASD / Space / mouse drag',

  intro: [
    { scene: 'desk',   caption: 'An average schoolboy. Average grades. A very average Tuesday.' },
    { scene: 'drowsy', caption: '“...and the square of the hypotenuse is...” His eyelids grow heavy.' },
    { scene: 'dozing', caption: 'Zzz... The classroom fades away...' },
    { scene: 'dream',  caption: 'In another world, a masked hero opens his eyes.' },
  ],
};
