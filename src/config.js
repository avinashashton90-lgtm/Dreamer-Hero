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
    // Winding ground route (sand bank → river → forest → cave), z as a function of x:
    // two sine waves, straightening out to z=0 as it reaches the cave opening.
    pathAmplitude: 12,
    pathFrequency: 0.05,
    pathAmplitude2: 5,
    pathFrequency2: 0.11,
    pathStraightenX: [68, 86], // blend from winding to straight (z=0) between these x
    pathHalfWidth: 5.5,      // forest trees keep at least this far from the path centre line
    pathDirtWidth: 3.2,      // half width of the visible dirt track
    colors: {
      street: 0x4a4d57,
      swamp: 0x2d4a3e,
      sand: 0xe4cf98,
      riverBed: 0x8a7350,
      grass: 0x63b553,
      rock: 0x8a8378,
      desert: 0xf0c27b,
      dirt: 0x9c7a4f,
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
    widthMin: 5,             // along X
    widthMax: 7,
    depthMin: 7,             // along Z
    depthMax: 10,
    // Gaps scale with the hero's reach (~6.05 level, ~5.1 jumping up 1) so jumps stay a
    // challenge without being punishing on a phone; skipping a roof is never possible.
    gapMin: 2.2,             // horizontal gap between roofs
    gapMax: 3.8,
    gapUpMax: 2.9,           // max gap when the next roof is higher
    startHeight: 9,
    stepMin: -1.6,           // height change between consecutive roofs
    stepMax: 1.2,
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

  // Giant trees in the swamp. Each route platform is a thick horizontal branch that grows
  // sideways out of a trunk and then runs along the route (an L-shaped limb).
  treeRoute: {
    count: 7,
    halfLengthMin: 1.9,      // half length of the walkable limb along the route
    halfLengthMax: 2.4,
    gapMin: 2.2,             // tip-to-base gap between consecutive limbs
    gapMax: 3.3,
    endHeight: 1.6,          // last branch is low enough to hop down onto the sand
    zWiggle: 2.5,
    baseHalfWidth: 0.95,     // walkable half width where the limb meets the elbow
    tipHalfWidth: 0.6,       // ... and at the tip
    trunkOffset: 1.9,        // trunk axis sits this far to the side of the limb
    trunkRadius: 0.95,       // trunk radius at branch height (it flares to ~2x at the roots)
    trunkBend: 0.55,         // sideways bow of the trunk, in trunk radii
    trunkAbove: 8,           // trunk continues this far above the branch into the crown
    crownRadius: [1.8, 2.4],
    crownShift: 1.6,         // crown leans away from the walking line
    twigsPerBranch: 3,
    leafBlobs: 9,            // leaf clusters per tree (around and above the branch)
    leafLiftMin: 3.9,        // leaf blobs stay at least this far above the walkable top (above jump apex)
    pathLeafRadius: [1.1, 1.6], // leaf clusters over the limb are kept small...
    pathLeafLateral: [1.6, 3.0], // ...and pushed out to the sides of the walking line
    backgroundCount: 14,     // non-route giant trees in the swamp
    barkColor: 0x6b4a2f,
    barkDark: 0x3f2a19,
    leafColors: [0x2f7a35, 0x3f9a3f, 0x5bb04a],
  },

  // Forest and background trees: three species with per-instance size and tint.
  forest: {
    count: 340,              // dense forest, mostly hugging the winding path
    nearPathBand: 34,        // most trees sit within this distance of the path
    farCount: 70,            // plus a scattering farther out
    trunkRadius: 0.35,       // collider radius at scale 1
    scaleMin: 0.8,
    scaleMax: 1.9,
    edgeCount: 60,           // extra trees scattered along the map edges
    // Relative share of each species: conifer, broadleaf (oak), birch.
    speciesWeights: [0.45, 0.35, 0.2],
    tintVariation: 0.12,     // +/- brightness per tree
  },

  cave: {
    center: [104, 0],
    radius: 17,
    rockCount: 34,
    rockSizeMin: 2.4,
    rockSizeMax: 4.2,
    openingHalfAngle: 0.45,  // radians; opening faces west toward the forest
    colliderScale: 0.8,
    archPosition: [117, 0], // dark cave mouth at the far (east) side of the arena, facing west
    archRadius: 4.4,
    archTube: 1.2,
    archColor: 0x4a4540,
    reach: 9,                // "Ride to the cave" completes within this distance
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
    // Jump: ~1.94 high and ~6 units long on level ground (both +20% over the original
    // 9 / 25 / walk 7). Gravity is unchanged so the arc doesn't feel floaty; the extra
    // distance comes from a small horizontal boost while airborne.
    jumpVelocity: 9.86,
    gravity: 25,
    airSpeedBoost: 1.095,  // horizontal speed multiplier while airborne (applied at take-off)
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
    // Tree-leaping zone: pull back a little and look down more so branches read clearly.
    // Blended in/out smoothly around the zone's edges.
    treeZoneDistanceScale: 1.2,
    treeZonePitchBoost: 0.14,   // radians added to the pitch (looks further down)
    treeZoneBlend: 6,           // units over which the zone settings fade in/out
    // Collision: the camera is pulled in front of trunks and pushed out of leaf clusters.
    collisionPadding: 0.4,
    minDistance: 0.6,           // only reached when the hero stands right against a trunk
    leafMinDistance: 1.8,       // leaf clusters closer than this to the hero fade instead of blocking
    releaseLerp: 3,
    // Riding: pull back and widen the view with speed; back to normal when dismounted.
    mountedDistanceScale: 1.2,
    speedDistanceScale: 0.25, // extra distance at full gallop
    speedFov: 10,             // extra degrees of FOV at full gallop
    rideBlend: 3,             // how quickly ride/speed effects follow             // ease back out slowly once the view is clear (snaps in instantly)
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
    bannerMs: 2600,
  },

  horse: {
    position: [-12, 6],    // on the sand bank by the river (x, z)
    facing: Math.PI / 2,
    radius: 0.9,           // collision radius
    height: 2.6,
    stepUp: 0.6,
    mountRange: 3,         // Mount button appears within this distance
    mountTime: 0.5,        // seconds for the mount / dismount transition
    mountArc: 1.1,         // hop height of the rider during the transition
    dismountSide: 1.7,     // rider lands this far to the horse's left
    seatHeight: 1.45,      // rider's feet above the horse's hooves
    riderSquash: 0.72,     // rider capsule height scale while seated (reads as sitting)
    maxSpeed: 17.5,        // 2.5 × hero walk speed
    acceleration: 9,       // units/s² toward the joystick speed
    braking: 16,
    turnRateSlow: 3.2,     // rad/s when slow...
    turnRateFast: 1.7,     // ...and at full gallop (gradual turns)
    hopVelocity: 6.5,      // small hop on jump
    gravity: 25,
    gallopStride: 0.42,    // leg cycles per unit travelled
    bobHeight: 0.2,        // gallop bob at full speed
    legSwing: 0.75,        // radians at full speed
    shadowSize: 2.6,
    dust: {
      max: 48,
      perSecond: 22,       // puffs per second at full speed
      minSpeed: 3,
      life: 0.75,
      sizeMin: 0.5,
      sizeMax: 1.4,
      rise: 0.9,
      color: 0xe8d6a8,
      opacity: 0.55,
    },
  },

  // Ride checkpoints (x along the path; z follows the path). Falls/deaths after the first
  // mount respawn the hero on the horse at the last checkpoint reached.
  checkpoints: {
    xs: [-12, 12, 34, 56, 78],
    radius: 7,
    poleHeight: 3.2,
    flagColor: 0xd62828,
    reachedColor: 0x3fd96b,
  },

  gems: {
    colors: { yellow: 0xffd23f, blue: 0x3fa9ff, pink: 0xff5fc8 },
    perColor: 6,           // placed per colour (5 needed to unlock)
    needed: 5,
    abilities: { yellow: 'batarang', blue: 'smokeBomb', pink: 'flashMode' },
    startX: -8,            // first gem (sand bank) ...
    endX: 98,              // ... last gem (inside the cave arena)
    height: 1.4,           // above the ground (or water surface)
    lateral: 2.2,          // gentle side-to-side weave around the path centre
    lateralPeriod: 5,      // gems per weave
    collectRadius: 1.9,
    size: 0.45,
    haloSize: 2.4,
    spinSpeed: 2.2,
    bobHeight: 0.22,
    bobSpeed: 2.5,
    popTime: 0.3,          // collect animation
  },


  // Foliage fade: giant-tree leaf clusters between the camera and the hero, or close to
  // the hero, fade out smoothly so jumps stay visible.
  foliage: {
    fadeOpacity: 0.15,
    fadeRadius: 6,           // clusters whose centre is this close to the hero fade
    blockScale: 0.9,         // fraction of a cluster's radius that counts as blocking the view
    fadeSpeed: 7,            // per second (exponential)
    activeRange: 45,         // clusters farther than this from the hero are skipped
  },

  // Jump readability in the tree zone.
  guides: {
    ringRadius: 0.85,
    ringWidth: 0.2,
    ringColor: 0xfff3a0,     // over a branch/roof
    ringHazardColor: 0xff6a5a, // over the swamp/street (you'd fall)
    ringOpacity: 0.9,
    ringFadeSpeed: 10,
    highlightColor: 0xfff3a0,
    highlightOpacity: 0.5,
    highlightPulse: 3,       // pulses per ~2 seconds
  },

  quests: {
    arrowHeight: 2.7,      // objective arrow height above the hero's feet
    arrowColor: 0xffd23f,
    beaconColor: 0xffe680,
    beaconHeight: 30,
    beaconRadius: 0.8,
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
    mount: 'Mount the horse',
    ride: 'Ride to the cave',
    caveReached: 'You reached the cave!',
  },
  mount: 'Mount',
  dismount: 'Dismount',
  checkpoint: 'Checkpoint!',
  gemNames: { yellow: 'Yellow', blue: 'Blue', pink: 'Pink' },
  abilityNames: { batarang: 'Batarang', smokeBomb: 'Smoke Bomb', flashMode: 'Flash Mode' },
  unlocked: (ability) => `${ability} Unlocked!`,
  objectiveComplete: 'Objective complete!',
  distanceUnit: 'm',
  controlsHint: 'Left: move · Right: look · Jump / Mount buttons  —  Keys: WASD / Space / E / mouse drag',

  // Intro is told through pictures only. Add `caption: '...'` to a slide for one short comic line.
  intro: [
    { scene: 'desk' },
    { scene: 'drowsy' },
    { scene: 'dozing' },
    { scene: 'dream', transition: 'swirl' },
  ],
};
