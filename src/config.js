// All tunable numbers live here. Systems must not hard-code gameplay values.
export const CONFIG = {
  // The forest ride must be at least this long (river → cave, along the trail spline).
  trailLength: 1500,

  render: {
    maxPixelRatio: 2,
    antialias: true,
    clearColor: 0x8fc8ff,
    fov: 60,
    near: 0.1,
    far: 950,                // far enough for the castle silhouette across the desert
  },

  // The map is a linear route along +X: town rooftops → tree canopy → sand bank & river
  // → forest → cave arena → desert (empty for now). X spans -width/2..width/2, Z -depth/2..depth/2.
  world: {
    seed: 20261004,
    width: 300,
    depth: 200,              // the original map (town, swamp, cave region): z -100…100
    // The map extends north for the long ride: z from zMin to zMax.
    zMin: -100,
    zMax: 680,
    // The main grid covers x -width/2…width/2; the desert (beyond the cave cliffs) runs east to xMax.
    xMin: -150,
    xMax: 820,
    segmentsX: 125,
    segmentsZ: 312,
    killY: -20,              // safety net: below this the hero respawns at the last safe spot
    fogNear: 70,
    fogFar: 240,
    edgeHillStart: 78,       // boundary hills rise over the last 22 units of each map edge
    edgeHillHeight: 16,
    ridge: { x: -30, z: [78, 112] }, // hills closing the swamp/town off from the north meadows
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

  // The forest ride: a long, flowing dirt trail (see track.js). Straights joined by wide
  // rounded corners (radius `cornerRadius`, or a point's 3rd value). From the horse on the
  // west river bank: north along the bank, a sweep west, the hill climb and descent up the
  // west side, east along the north edge across the river ford (~50%), the long descent down
  // the east side, a sweep back west, south past the cliffs and into the cave arena. ~1540 long (at least `trailLength`).
  track: {
    points: [
      [-20, 6], [-20, 320], [-122, 390], [-122, 630], [50, 630], [112, 570], [112, 340],
      [40, 280], [40, 40], [60, 0], [96, 0],
    ],
    cornerRadius: 40,
    halfWidth: 7,            // 14 wide
    // Tree-free corridor: nothing but the trail, grass and the edge line within this distance
    // of the centre line (22 wide in total). Trees only grow outside it.
    corridorHalfWidth: 11,
    // Invisible walls just outside the trail edge: the hero and horse can't leave the trail
    // (the horse slides along them). Not at the very start (the horse's spot) or in the arena.
    wall: { offset: 7.3, band: 3, height: 7, startS: 10, endMargin: 25, slideTurn: 6, slideDrag: 0.5 },
    sampleSpacing: 1,
    gridCell: 8,
    dirtColor: 0x9c7a4f,
    rimColor: 0x7a6040,      // slightly darker trail edge
    // A continuous, dense line of bushes and boulders along both corridor edges (sampled
    // along the spline; outside the corridor, so the trail stays clear).
    edge: { spacing: 2.1, jitter: 0.4, boulderShare: 0.3, bushSize: [1.0, 1.6], boulderSize: [0.6, 1.0], bushRadius: 1.2, boulderRadius: 1.3 },
    // Riding: a gentle push back toward the trail near the edges (never a wall).
    softEdge: { start: 4.6, strength: 4, turn: 1.2, band: 11 },
    // Gentle path assist: with the stick near neutral, nudge the heading along the trail.
    assist: { rate: 0.45, maxAngle: 0.7, deadzone: 0.3 },
    // A hill climb then a long descent on each side of the ford.
    hills: [
      { x: -122, z: 470, height: 12, radius: 46 }, // west side: a climb, then down the far side
      { x: 104, z: 575, height: 11, radius: 56 },  // north-east: a long descent down the east side
    ],
    uphillDrag: 2.2,         // top speed × (1 − slope × this): slower uphill, quicker downhill
    hillSpeed: [0.78, 1.12], // ...clamped to this range
    fordReach: 9,            // ford (shallow bed) within this distance of the trail
  },

  zones: {
    riverX: 0,               // river centre line
    riverHalfWidth: 6,
    riverMeander: 4,
    riverFrequency: 0.03,
    riverBedY: -1.25,        // shallow: the horse never sinks (water ~0.45 deep)
    fordBedY: -1.05,         // the ford where the path crosses (water ~0.25 deep)
    fordHalfWidth: 7,        // ford width either side of the trail
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
    // Placed only by sampling the trail spline: rows of trees either side, outside the corridor.
    nearStep: 3.4,           // along the trail, per side, in the dense band...
    nearRows: 3,             // ...rows deep
    nearBand: 20,            // ...spread over this width outside the corridor
    farStep: 12,             // a sparser outer band...
    farBand: [20, 60],       // ...this far outside the corridor
    jitter: 1.2,             // along-trail jitter
    corridorMargin: 0.6,     // whole tree (crown included) at least this far outside the corridor
    maxStretch: 1.2,         // random height stretch per tree
    chunkSize: 100,          // instanced per chunk so off-screen chunks are culled
    trunkRadius: 0.35,       // collider radius at scale 1
    scaleMin: 0.8,
    scaleMax: 1.9,
    // Relative share of each species: conifer, broadleaf (oak), birch.
    speciesWeights: [0.45, 0.35, 0.2],
    tintVariation: 0.12,     // +/- brightness per tree
  },

  // Hero outfit (placeholder primitives in loadHeroModel) and animation.
  outfit: {
    skin: 0xf1c27d,
    suit: 0x2b4dff,        // torso / arms
    mask: 0x111111,
    cloak: 0xf2b705,       // golden cloak
    pants: 0xc0262d,
    boots: 0x6b3f1f,
    belt: 0x3b2614,
    pouch: 0x8a6a3a,
    buckle: 0xffd23f,
    blade: 0xd8dde6,
    chain: 0x9aa0a8,
    hair: 0x2a1a10,
    cloakSegments: [4, 8], // width × height segments (animated cloth)
    cloakFlutter: 0.12,    // ripple amplitude at full speed
    cloakLift: 0.9,        // radians the cloak swings back at full speed
    walkCycle: 1.6,        // leg cycles per unit... per second at walk speed scale
    legSwing: 0.7,
    armSwing: 0.55,
    ridingDrop: 0.95,      // seated: the rig sits this much lower (hips on the saddle)
  },

  // The hero is AJ exactly as Mixamo ships him (cap, glasses, grey hoodie, black jeans,
  // sneakers, backpack). true puts the old code-built costume back on: golden cloak (with its
  // cloth animation), eye mask, utility belt and pouches, chained dagger (drawn for the combo),
  // red-jeans / brown-shoe tint, and AJ's backpack removed. Off, none of it is built or run.
  heroCostume: false,

  // The Mixamo hero (AJ, public/models/hero/: heroModel.js). Clip windows are times in the
  // source clip (seconds); game timings (combat, dodge, throw, jump, drink) are unchanged —
  // each clip is scrubbed so its key frame (hit, release, take-off, apex) lands on the game's.
  heroModel: {
    path: 'models/hero/',
    character: 'hero.fbx',   // the skinned character; its embedded clip is the idle
    height: 2.07,            // AJ is drawn 15% taller than the hero's 1.8 capsule (feet at the origin; physics unchanged)
    textureMax: 1024,        // embedded textures are downsized to this (phones)
    loadShares: { hero: 0.42, horse: 0.1, girl: 0.31, boss: 0.17 }, // loading bar split (by download size)
    crossfade: 0.15,         // seconds to blend between clips
    clips: {
      run: { file: 'run', root: 'xz' },                         // root motion stripped; speed-matched
      jump: { file: 'jump', root: 'xyz', window: [0.56, 0.8, 1.11] },   // take-off, apex, landing
      runjump: { file: 'runjump', root: 'xyz', window: [0.02, 0.3, 0.62] },
      punch1: { file: 'punch1', root: 'xz', window: [0.4, 0.68, 0.95] }, // start, hit, end
      punch2: { file: 'punch2', root: 'xz', window: [1.1, 1.38, 1.6] },
      kick: { file: 'kick', root: 'xz', window: [0.5, 0.98, 1.45] },
      roll: { file: 'roll', root: 'xz', window: [0.35, 1.9] },
      throw: { file: 'throw', root: 'xz', window: [0.3, 0.5, 0.75, 1.05], armOnly: true }, // start, wound back, release, end
      hit: { file: 'hit', root: 'xz', window: [0, 1.1], time: 0.6 },
      death: { file: 'death', root: 'xz', window: [0, 2.0], time: 1.6 },
      drink: { file: 'drink', root: 'xz', window: [2.2, 8.7], faceAt: 2.2 },   // faceAt: undo the turn baked in at this time
      ride: { file: 'ride', root: 'xz' },
      flying: { file: 'flying', root: 'xz' },                   // loaded for a later upgrade, not used yet
    },
    catchAt: 0.82,           // throw clip time used for the catch pose (arm out in front)
    armLayerWeight: 20,      // the throw arm overrides the body clip on the right arm
    runJumpSpeed: 4,         // take-off speed above which a jump uses the running jump
    runBlend: [0.3, 2.2],    // idle → run blend over this speed range
    ride: { lift: 0.1, thighPitch: 1.05, spread: 0.45, knee: -0.25 },  // seated on the horse: hips up a little, thighs down and apart round its body, shins hanging
    hideBones: ['Backpack', 'RHoodieString2'], // costume only: AJ's backpack (skinned mostly to RHoodieString2), straps and pins are removed
    // Costume only (heroCostume): tint, cloak, mask, belt.
    tint: { pants: 0xc0262d, shoes: 0x6b3f1f, amount: 0.85 },
    cloak: { width: 0.5, length: 0.92, drop: 0.07, gap: 0.025 },  // hangs from the upper back
    mask: { height: 0.05, arc: 1.75, eyeWidth: 0.026, eyeHeight: 0.017, lift: 0.004, gap: 0.004 },
    belt: { height: 0.06, tube: 0.022, above: 0.06 },             // round the hips, above the hip joint
    deathAnimMs: 1100,       // the death clip plays this long before the respawn fade
  },

  // Melee, dodge, lock-on and hit feedback (see combat.js).
  combat: {
    combo: [
      // kind, damage, reach, active-hit time, duration, knockback
      // (reach is measured from the target's edge — its collision body — not its centre)
      { kind: 'punch', damage: 10, reach: 2.2, hitAt: 0.1, duration: 0.3, knockback: 1.5 },
      { kind: 'punch', damage: 10, reach: 2.2, hitAt: 0.1, duration: 0.3, knockback: 1.5 },
      { kind: 'kick', damage: 22, reach: 2.2, hitAt: 0.16, duration: 0.45, knockback: 7, heavy: true },
    ],
    comboWindow: 0.5,      // tap again within this long after a hit to continue the combo
    frontDot: 0.45,        // hits land only on targets roughly in front (cos of the half-angle)
    attackMoveScale: 0.25, // movement while attacking
    lunge: 1.5,            // each attack lunges up to this far toward the lock-on target...
    lungeTime: 0.08,       // ...over this long (done before the hit frame)...
    lungeStop: 0.5,        // ...stopping this far from its edge
    lockRange: 12,         // soft lock-on: nearest target within this range...
    lockDot: -0.2,         // ...not behind the hero
    lockRingColor: 0xffd23f,
    hitFlash: 0.12,        // seconds a hit target flashes white
    shake: { light: 0.06, heavy: 0.2, flash: 0.45, time: 0.25 },
    hitStop: 0.05,         // heavy hits freeze the action this long
    flashHitStop: 0.18,
    dodge: { duration: 0.4, distance: 6, invincible: 0.4, cooldown: 1 },
    hurtInvincible: 1.0,   // after taking damage (a soft blink shows it; the hero is never hidden)
    hurtBlink: { rate: 6, depth: 0.55 }, // blinks per second, how far the opacity dips
    hurtRed: { time: 0.3, color: 0xff2a2a, intensity: 0.9 }, // a red flash that fades back to normal
    riderFlinch: { time: 0.28, pitch: 0.14 }, // hit while mounted: a short jolt, seated (no hit clip, no knockback)
    hurtKnockback: 6,
    damageNumberMs: 900,
  },

  // Abilities (unlocked by gems; see abilities.js).
  abilities: {
    // Throw pose (Batarang, Smoke Bomb): the arm winds back, swings forward and the item leaves
    // the hand at `release`; a short catch pose when the Batarang comes back.
    throw: { windup: 0.14, release: 0.24, duration: 0.42, catchTime: 0.32 },
    batarangGemCost: 1,      // yellow gems spent per Batarang throw (Smoke Bomb / Flash: their own gemCost)
    batarang: {
      damage: 8, range: 14, speed: 20, returnSpeed: 24, arc: 3, // sideways bulge of the flight
      radius: 0.5, catchRadius: 1.2, maxTime: 3, cooldown: 1.5, chaseFactor: 2, // returns faster than the hero (even galloping)
      hitPad: 0.3,           // slack above / below an enemy's hit body (`hit` per minion type); it also strikes on the way back...
      returnReach: 0.8,      // ...with this much more reach above a body (it flies back at the rider's hand height)
      size: 0.35, spin: 22, height: 1.2,
      color: 0xffd23f,
      // Mounted: a tap throws it at the nearest bat (flying target) within autoAimRange in front of
      // or beside the horse (a bracket marks it while the Batarang is ready), homing in at
      // turnRate°/s; with none it flies straight ahead `forwardRange`. It never goes beyond
      // maxRange from the rider, comes straight back if its target dies, and returns on a tight
      // curve to the rider (caught however far the horse has gone).
      mounted: {
        autoAimRange: 25,    // the nearest living enemy of any kind within this, in any direction...
        preferFront: 1.6,    // ...preferring ones in front (one right behind counts as this × as far)
        overhead: 4,         // closer than this (flat) counts as in front: a bat circling overhead
        aimLift: 0.6,        // aim at least this far above the ground (a skeleton still rising from the sand)
        homingSpeed: 30,     // on top of the rider's own speed
        turnRate: 540,       // degrees per second
        maxRange: 30,
        forwardRange: 14,
        directHoming: 6,     // this close to the rider it flies straight to the hand...
        screenMargin: 0.05,  // (near the screen edge it heads straight for the bat / the hand, so it never stays off screen)
        riderSmoothing: 10,  // (the rider's speed, measured from the hand, smoothed at this rate)
        orbitGuard: 1.2,     // ...or within this × its turning radius (speed / turn rate) of the point, so it never orbits
      },
      trail: { count: 26, life: 0.32, size: 0.11, color: 0xffe680, opacity: 0.85 }, // so it can be followed
      bracket: { size: 0.75, thickness: 0.05, arm: 0.28, color: 0xffd23f, opacity: 0.9, pulse: 0.08, pulseRate: 0.01 /* per ms */ }, // on the auto-aim target
    },
    // Smoke Bomb: a green powder cloud with twinkling crystal sparks (additive particles, no lights).
    smokeBomb: {
      // Lands on the lock-on target when it's within throwRange (else this far ahead).
      throwRange: 12, flightTime: 0.6, arcHeight: 2.5, radius: 6, duration: 8,
      smokeExposureSeconds: 0.5, paralyze: 10, cooldown: 15, // in the cloud this long → paralyzed
      gemCost: 5,            // blue gems spent per bomb
      puffs: 16,             // powder puffs per layer...
      layers: [              // ...soft layered powder: [radius scale, puff size, opacity, colour]
        [0.55, 1.5, 0.13, 0x2c9a46],
        [0.85, 1.25, 0.1, 0x45bf62],
        [1.05, 0.9, 0.07, 0x7fe394],
      ],
      powderGlow: 0x1d5e2c,  // the powder's own faint green glow
      sparks: 22,            // glittering crystal sparks floating in each cloud
      sparkSize: 0.09,
      sparkColor: 0xe8ffe8,
      sparkTwinkle: 9,       // twinkle speed
      maxClouds: 2,
      // A beast inside: powder streams into its mouth, chest heaves, a green glow builds.
      stream: { rate: 45, life: 0.7, size: 0.16, max: 70, color: 0x7cf08e },
      glow: { color: 0x3fdc66, size: 1.35, opacity: 0.32, fade: 0.6 },
      burst: { count: 26, speed: 6, life: 0.7 }, // crystal sparks popping off at paralysis
      tint: [0.04, 0.24, 0.08], // emissive green tint while paralyzed
      ring: { radius: 1.25, width: 0.14, color: 0x6dff8a, opacity: 0.8 }, // timer ring under it
      heave: 0.07,           // chest heave while inhaling
    },
    // Flash Mode: a lightning blast. Costs 5 pink gems and 30% of the hero's hearts (never
    // lethal), needs a full bar (it reloads over flashReloadSeconds) and a target in range.
    // Charge-up: sparks crackle up from his feet and energy streams into his hands; then a
    // bolt strikes the target (flash, shockwave, screen shake).
    flashMode: {
      gemCost: 5,            // pink gems spent per use
      flashHeartCostPct: 0.3, // of max hearts (1.5 of 5); usable only with more hearts than this
      flashReloadSeconds: 45, // the bar refills over this long after use
      hurtFlicker: 0.45,     // red flicker on the hero when he pays the cost
      hurtColor: 0xff2a2a,
      chargeTime: 0.6,       // charge-up (gold glow, sparks, energy into the hands) before the bolt
      range: 15,             // a living target must be this close (from its edge); the boss is picked first
      // Super-armor through the charge and the strike: no damage, no knockback, no interruption,
      // shown as a gold-white lightning shield round him (additive shell + crackling arcs).
      shield: { radius: 1.25, height: 1.05, color: 0xfff2c0, opacity: 0.22, arcColor: 0xfffbe8, arcs: 5, arcSegments: 5, arcWidth: 0.05, flicker: 22 },
      minionPush: 7,         // the strike's shockwave pushes minions within shockwave.radius this far out
      damageFraction: 0.4,   // of the target's max HP
      knockback: 12,
      glowColor: 0xffc400,
      // Charge-up: electric sparks crackling up round his feet...
      feetSparks: { rate: 80, life: 0.5, rise: 3.4, radius: 0.6, jitter: 5, size: 0.075, color: 0xc8ecff },
      // ...and energy streaming in from round him into both hands, which glow brighter and brighter.
      channel: { rate: 55, life: 0.4, radius: 1.5, size: 0.06, color: 0xfff0a0, orb: 0.17, orbColor: 0xd8eeff },
      maxParticles: 160,
      // The bolt: a jagged line from the sky onto the target (white core + blue glow, flickering)
      // and a thinner arc from his hands to it.
      bolt: {
        time: 0.4, height: 24, segments: 16, jitter: 1.1, core: 0.09, glow: 0.5,
        color: 0xffffff, glowColor: 0x86c4ff, glowOpacity: 0.4, flicker: 28,
        armSegments: 9, armJitter: 0.35, armScale: 0.55, // the arc from his hands
      },
      impact: { time: 0.3, size: 2.6, color: 0xbfe0ff, opacity: 0.55 },   // white flash at the target
      shockwave: { time: 0.65, radius: 7.5, width: 0.6, color: 0x9fd4ff, opacity: 0.85 },
      screenFlash: { ms: 220, opacity: 0.75 },
    },
  },

  // Hearts and respawns (see lives.js).
  lives: {
    hearts: 5,
    respawns: 3,
    deathFadeMs: 600,
    bossResetsOnRespawn: true, // used by the boss fight
    debugDamage: 1,            // hearts lost per debug-damage key press
  },

  // The desert beyond the cave (Part 1 finale): its own trail spline, rolling dunes, cacti,
  // rocks, a sunset sky and the castle on the horizon. Same trail system as the forest
  // (halfWidth, corridor, invisible walls from CONFIG.track).
  desert: {
    startX: 168,             // dunes begin beyond the cliff ridge
    points: [
      [192, 0], [420, 0], [560, 90], [600, 260], [480, 400], [520, 560], [720, 600],
    ],
    minLength: 1000,         // the route test fails if the desert trail is shorter
    castle: {
      distance: 35, height: 44, color: 0x2c2238, glow: 0xffb36b, // castle this far past the trail end
      // The gate passage through the curtain wall and its two leaves (loadCastleModel → userData.gates).
      gate: { width: 7, height: 8.5, thickness: 0.45, color: 0x4a3423, bandColor: 0x1d1a1f, passageColor: 0x0c0a10, insideStop: 3 },
    },
    checkpoints: [0, 0.33, 0.66],
    // Rolling dunes: value noise (octaves of [wavelength, height]); gentle rolls on the trail.
    dunes: [[140, 7], [55, 2.6], [22, 0.7]],
    trailDunes: [[140, 2.2]],
    trailBlend: [9, 22],     // full trail profile within 9 of the centre line, dunes beyond 22
    ridge: { from: 140, top: 152, to: 176 }, // the ridge between the forest/cliffs and the desert
    terrainStep: 4.5,        // grid spacing of the desert terrain
    colors: { sand: 0xeec27c, dune: 0xd9a35e, shade: 0xc98d4f, trail: 0xc89b62, rim: 0xb7864f },
    cacti: { step: 7, band: [2, 46], scale: [0.65, 1.3], color: 0x4f8a3b }, // (smaller than they were: they dwarfed the riders)
    rocks: { step: 9, band: [1, 55], scale: [0.5, 1.9], color: 0xb98a5a },
    edge: { step: 3.2, scale: [0.35, 0.7], tuftShare: 0.45, tuftColor: 0x9c9550, rockColor: 0xc49a68 },
    prints: { max: 180, life: 7, size: 0.22, color: 0x7a5a36, opacity: 0.45, minSpeed: 2 },
    gems: { groups: 3, startS: 120, endMargin: 140 },
    // Exhausted after the boss: one heart for the whole ride to the pit, getting worse.
    desertArrivalHearts: 1,
    exhaustion: {
      start: 0.35,           // tiredness at the start of the desert (0..1), worst (1) at the pit
      speedLoss: 0.25,       // top speed −25% at worst...
      staminaLoss: 0.25,     // ...gallop stamina capped 25% lower...
      drainGain: 0.6,        // ...and draining 60% faster
      horseFloor: 0.7,       // the horse feels ≥70% of those losses from the first moment of tiredness
      slump: 0.38,           // the hero slumps forward in the saddle (radians at worst)
      breathe: 0.55,         // heavy breathing (cycles per second)...
      breatheBob: 0.045,     // ...and how much it lifts him
      vignette: 0.8,         // red screen-edge vignette opacity at worst
      recover: 1.5,          // seconds for it all to fade after drinking
    },
    // The Lazarus Pit, just off the desert trail, revealed only by the girl.
    pit: {
      at: 0.575,             // "Stop." at this fraction of the desert trail
      ahead: 26,             // the pit lies this far further along...
      lateral: 13.5,         // ...and this far right of the centre line (just past the trail's soft edge)
      flat: 3.5,             // the dunes level out this far past the rim
      radius: 2.3,
      clearance: 1.6,        // no desert scenery this close to its rim
      rimColor: 0x6b5a48, waterColor: 0x0d3b3a, faintGlow: 0x3fd8c0, activeColor: 0x3fa0ff,
      faintOpacity: 0.25, activeOpacity: 0.85,
      vapor: { max: 30, rate: 8, life: 2.4, rise: 1.6, size: [0.18, 0.4], color: 0x3fb8a8, opacity: 0.1 },
      ripple: { time: 1.6, color: 0x9fd8ff },
      aura: { height: 6, time: 2.2, color: 0x2f78ff, opacity: 0.16 },
      pulse: { time: 1.1, size: 1.8, color: 0x5f9fff, opacity: 0.4 },
      walkSpeed: 2.4,        // the hero and girl walk to the pit
      drink: { scoop: 1.4, raise: 1.0, sip: 1.4 }, // the hero's cup: scoop, raise to the lips, sip (s)
      kneelTime: 0.8,        // the girl kneels before touching the water
      hum: 1.2,              // the water lights up; then "Drink it."
      smileHold: 2,          // she smiles silently (close-up)
      standOff: [1.6, 0.9],  // hero / girl stand this far from the rim
      healStep: 0.35,        // seconds per heart refilled
      dimTime: 1.5,
      shots: {
        behind: { back: 7.5, up: 3.4, ahead: 6, duration: 1.4 },
        reveal: { side: -6, up: 3.2, back: 6, duration: 2.2 },
        sideOn: { dist: 8.5, up: 2.6, duration: 1.6 },
        // The drink: a simple wide side shot — `dist` from the group (AJ, Amy and the pit), from
        // the side (`angle`° round toward the trail so the two don't overlap), at chest height
        // (`up`), looking at the pit (`look` above its water) with AJ and Amy both in frame.
        drink: { dist: 4, angle: 25, up: 1.3, look: 0.4, duration: 1.0 },
        // "Who are you?" and her smile: a close-up on Amy's face from the front, slightly below
        // eye level (`eye` − `below`), `dist` from her body (≥ guard.minDist), `angle`° round from
        // the line to AJ (so the camera keeps clear of him), her yaw turned `cheat` of the way to
        // the camera; narrow `fov`; AJ only a soft edge. Her eyes glow faintly for `glow` s.
        closeUp: { angle: 65, dist: 1.85, eye: 1.5, below: 0.12, cheat: 0.75, fov: 38, glow: 1.6, duration: 1.0 },
        pullBack: { dist: 11, up: 5, duration: 1.6 },
      },
    },
    // The sandstorm chase after the Lazarus Pit (story.desertChaseActive, set when the pit scene
    // ends — also when it is skipped; skeleton spawning: minions.skeletons).
    chase: {
      stormDelay: 2,         // the storm starts building this long after the ride resumes...
      stormBuild: 3,         // ...and is at full strength this long after that
      minHearts: 0.5,        // a skeleton hit never takes the hero below half a heart during the chase...
      grace: 1,              // ...and after each hit there is this long before the next can land
    },
    // The sandstorm (sandstorm.js): particles and cheap fog, a clear corridor along the trail.
    storm: {
      seed: 7,
      ease: 1.6,             // strength follows the story's target this quickly (1/s)
      shake: 0.035,          // gentle camera shake at full strength (units; grows with the wind)
      wind: { across: 1, along: -0.35, speed: 26 }, // blowing across the trail (and a little back)
      gust: { every: [5, 9], time: [1, 2], gain: 0.8 }, // the sides thicken for 1–2 s now and then
      // Kept clear of sand: ±halfWidth of the trail (soft over `soft`), from `behind` to `ahead` of the camera.
      clear: { halfWidth: 12, soft: 6, ahead: 70, behind: 20, step: 10 },
      streaks: { count: 150, area: 42, length: [2.5, 6.5], width: [0.04, 0.09], height: [0.3, 7], color: 0xf3d7a6, opacity: 0.55 },
      clouds: { count: 28, area: 48, band: 20, size: [9, 18], height: [1.5, 7], drift: 5, roll: 0.18, color: 0xd9a96b, opacity: 0.6 },
      sky: { radius: 420, color: 0xc89060, opacity: 0.6 }, // the sky veils over (drawn behind everything near)
      tint: { color: 0xd8944f, opacity: 0.1 },             // a light warm dusty tint over the view
      fog: { color: 0xcf9c66, near: 30, far: 150 },        // still ≥ 60 of visibility along the trail
      castleGlow: { color: 0xffb36b, up: 16, size: 46, opacity: 0.55 }, // the castle's warm glow reads through it
    },
    // The castle-gate cinematic (not a fight): 70 from the castle, control is taken, the storm
    // clears, the horse gallops through a line of 4 skeletons (thrown aside) and into the castle.
    gate: {
      trigger: 70,           // from the castle's gate
      stormClear: 3,         // the storm clears over this long
      line: { before: 24, lateral: [-7, -3.4, 3.4, 7] }, // the skeleton line this far before the gate (a clear lane in the middle)
      speed: 24, accel: 12,  // the horse's scripted gallop through it...
      brake: 14,             // ...braking to a stop inside the passage
      level: 8,              // the path levels onto the castle floor over the last 8 before the gate
      approach: 32,          // the path lines up with the gate this far out
      launch: { reach: 3.5, up: 6.5, out: 5.5, back: 1, spin: 8, gravity: 20, life: 2.2 }, // thrown aside as the horse passes (an arc that stays in the shot)
      bones: { count: 8, speed: 6, up: 5.5, size: 0.13, life: 1.5, gravity: 18, color: 0xe9e1cb },
      dust: { count: 10, size: [0.7, 1.6], speed: 3, life: 1.1, color: 0xd9b07c, opacity: 0.5 },
      open: { angle: 1.5, time: 1.3, at: 28 }, // the gates swing open when the horse is this far from them
      slam: { time: 0.32, shake: 0.55, shakeTime: 0.6, dust: 18 },
      glance: 1.5,           // Amy glances back over her shoulder this long, as the gates shut
      hold: 1.2,             // then the "To be continued" title
      // Shots: a low chase camera behind the horse; then from outside the gate as they pass in.
      shots: {
        chase: { back: 6.5, up: 0.9, side: 2.4, ahead: 9, look: 1.5, duration: 0.8 },
        gate: { out: 13, up: 1.6, side: 4.5, look: 3, duration: 0.05, after: 5 }, // (a cut, once the horse is `after` past the line)
      },
    },
    // Sunset: sky, fog and light colours blend in as the camera moves east into the desert.
    sunset: {
      blend: [150, 260],     // camera x range over which the sunset takes over
      top: 0x3a3b7a, horizon: 0xff9a5c, sunColor: 0xffc27a, sunDirection: [0.85, 0.1, 0.5],
      fog: 0xf0a070, hemiSky: 0xffc08a, hemiGround: 0x8a5a3a, sunLight: 0xffb070, sunIntensity: 1.2,
    },
  },

  // Cinematic cutscenes (cinematic.js): camera moves, dialogue boxes, waits, callbacks.
  cinematic: {
    charsPerSecond: 38,      // typewriter speed
    defaultMove: 1.2,        // seconds for a camera move without its own duration
    trigger: 4,              // walk this close to the girl (after the boss) to start her scene
    heroStand: 3.2,          // the hero stands this far in front of her
    tremble: 0.035,          // frightened shiver (radians)
    hintTime: 1.5,           // witch hint: eyes flicker purple, the shadow shows a hat and staff
    hintColor: 0xb84dff,
    mountFadeMs: 450,        // short fade while the girl climbs on behind the hero
    // Every cutscene camera (cinematic.js), with the cave camera's rules: at least `minDist`
    // from every character's body surface (AJ, Amy, the horse — vertical capsules of `radius`),
    // pushed out if a move would come closer, and any character still closer fades to
    // `nearOpacity`; never below the ground (`groundClear`) or inside a solid (pulled toward the
    // look point); a character between the camera and the shot's `subject` (if it names one) fades to
    // `occludeOpacity`; one a shot asks to soften (`soften`) is drawn at `softOpacity` while on
    // screen (a soft shoulder at the edge). Opacities ease at `fadeRate`.
    guard: {
      minDist: 1.5,
      radius: { hero: 0.35, girl: 0.3, horse: 0.9, horseHeight: 2.4 },
      nearOpacity: 0.12, occludeOpacity: 0.25, softOpacity: 0.45, fadeRate: 10,
      groundClear: 0.3, pushPasses: 3,
    },
    // Camera shots in the girl's frame: offset [side, up, forward], look-at height, seconds.
    shots: {
      establish: { offset: [2.6, 2.3, 6.8], look: 1.2, duration: 1.4 },
      twoShot: { offset: [4.4, 2.5, 4.6], look: 1.25, duration: 1.0 },
      pushIn: { offset: [0.55, 1.6, 2.3], look: 1.4, duration: 2.6 },
    },
  },

  // The end of Part 1.
  ending: {
    brake: 10,               // the horse slows to a stop (cutscenes: the Lazarus Pit)
    titleMs: 3200,           // ..."To be continued... Part 2" for this long, then the summary
  },

  // Small enemies (minions.js / minionModels.js): Quaternius Animated Monster Pack FBX files
  // (public/models/monsters/, CC0), each type loaded lazily the first time one spawns. Clips are
  // mapped by role (first name found wins; a missing role falls back to the next list).
  minions: {
    path: 'models/monsters/',
    textureMax: 1024,
    crossfade: 0.18,
    touchDamageHearts: 0.5,  // every hit on the hero: half a heart...
    hitCooldown: 1,          // ...at most once a second per enemy
    damage: { melee: 4, batarang: 6 }, // the hero's hits on a minion (Flash kills it)
    flashKillRadius: 6,      // Flash kills every minion this close to its bolt
    flinch: 0.3,             // hit reaction
    fade: 0.8,               // after the death clip it fades out this long, then drops its gem
    hitFlash: 0.12,
    separation: 0.9,         // minions keep a little apart from each other
    cough: { rate: 3.2, bob: 0.08 },       // smoked / paralyzed: coughing...
    sway: { rate: 1.6, angle: 0.22 },      // ...and swaying (not frozen); dizzy stars above
    types: {
      bat: {
        file: 'bat.fbx', hp: 8, fit: ['x', 0.9], radius: 0.4, height: 0.45, flying: true, // (60% of the first size)
        damageTaken: { batarang: 8 }, // a Batarang kills a bat outright
        roles: { idle: ['Bat_Flying'], move: ['Bat_Flying'], attack: ['Bat_Attack', 'Bat_Attack2'], hit: ['Bat_Hit'], death: ['Bat_Death'], spawn: [] },
        fallback: { idle: 'move', hit: 'idle', spawn: 'move' },
        color: 0x3a2f4a,
      },
      skeleton: {
        file: 'skeleton.fbx', hp: 12, fit: ['y', 1.85], radius: 0.45, height: 1.85, // (12 HP: 2 Batarang hits)
        hit: { radius: 0.6, height: 2.1 }, // a generous hit body (1.2 wide, the whole skeleton), counted while it rises
        roles: { idle: ['Skeleton_Idle'], move: ['Skeleton_Running'], attack: ['Skeleton_Attack'], hit: [], death: ['Skeleton_Death'], spawn: ['Skeleton_Spawn'] },
        fallback: { hit: 'idle', spawn: 'idle', move: 'idle' },
        color: 0xe9e2cf,
      },
      slime: {
        file: 'slime.fbx', hp: 10, fit: ['y', 0.95], radius: 0.6, height: 0.95,
        roles: { idle: ['Slime_Idle'], move: ['Slime_Walk'], attack: ['Slime_Attack'], hit: [], death: ['Slime_Death'], spawn: [] },
        fallback: { hit: 'idle', spawn: 'idle', move: 'idle' },
        color: 0x5fd06a,
      },
    },
    // Forest: bats come in from the tree line while riding (scheduleBats(windows) limits when),
    // wait in view ahead of and above the rider, and only the nearest attacks: it circles
    // overhead with a screech and a red marker (the telegraph), dives once, bites and flees.
    bats: {
      interval: [20, 30],    // seconds of riding between swarms...
      group: [1, 3],         // ...of this many...
      max: 3,                // ...with at most this many at once
      caveClear: 120,        // never within this of the cave
      checkpointQuiet: 5,    // never in the first seconds after a checkpoint
      spawnAhead: [16, 28], spawnSide: 13, spawnHeight: [4, 7], // from the tree line ahead
      approachSpeed: 24,     // flying in to a waiting spot (on top of keeping up with the rider)
      approachTimeout: 7,    // can't get there: it gives up and flies off
      hold: { ahead: 9, side: 4.5, up: 4.2, spacing: 2.4, follow: 6, bob: 0.25, bobRate: 3 }, // waiting spots ahead of / above the rider
      holdMin: 1,            // waits this long in its spot before it may attack (time to aim)
      telegraph: 1.2,        // circling overhead before the dive (screech, red marker)...
      circleRadius: 1.8, circleUp: 1.6, circleAhead: 5, circleFollow: 8, // (round a point just ahead of and above the rider, in plain view)
      diveTimeout: 2,        // (a dive that hasn't reached him by then flees: safety)
      groundClear: 0.4,      // never lower than this above the ground
      batDiveSpeed: 21,      // ...then one dive at ~60% of the gallop (35)
      attackGap: 2,          // no two bats attack within this many seconds; only the nearest attacks
      biteReach: 1.1,        // from the rider's body
      flee: { time: 1.4, speed: 20, up: 0.7 }, // one bite, then it flees for good
      viewFollow: 15,        // (only while the camera is this close to the hero, not mid teleport)
      viewMargin: 0.2,       // while coming in, waiting and attacking it stays this far inside the screen edge (NDC)...
      minDepth: 3,           // ...and at least this far in front of the camera
      spotMargin: 0.04,      // its waiting spot is kept a little further inside still (so it arrives there)
      marker: { size: 0.2, up: 0.35, color: 0xff2a2a }, // the red telegraph marker over it
      despawnFar: 70,
      horseEnergy: 5,        // a bite costs the horse this much energy (if it has an energy system)
    },
    // Cave: every boss slam opens a crack and slimes emerge from it, hopping at the hero.
    slimes: {
      perSlam: 2, perSlamEnraged: 3, max: 3,
      spread: 1.4,           // emerge round the crack
      emerge: 0.7,           // seconds rising out of it
      speed: 3.4, hop: 0.35, hopRate: 2.2, // hopping along
      attackReach: 1.0, windup: 0.35,
      hopAway: { time: 0.6, speed: 7 }, // after every hit on it: hops away (never blocks the way)
      edge: 1,               // stays this far inside the arena radius
    },
    // The sandstorm chase after the Lazarus Pit (story.desertChaseActive; nothing before it).
    skeletons: {
      firstDelay: 2,         // the first group rises this long after the ride resumes...
      interval: [6, 9], group: 2, max: 5, // ...then a group every 6–9 s, 5 alive at most
      castleClear: 120,      // the chase ends this far from the castle: the rest sink back into the sand
      firstAlong: [-8, 1],   // the first group close behind / beside the horse (along the trail from it)...
      along: [-16, 2],       // ...later ones from behind and the sides
      side: [3.5, 6.5],      // this far left / right of the trail's centre line
      rise: 1.6,             // seconds rising from the sand
      sink: 1.2,             // seconds sinking back into it (the chase is over)
      speedFactor: 0.9,      // running at this × the horse's normal (non-gallop) top speed: a steady ride keeps them close...
      footSpeed: 7.5,        // ...and at this after a hero on foot
      attackReach: 1.4, windup: 0.45,
      gallopKnock: 1.2,      // galloping into one (this close to the horse) knocks it aside: defeated
      knockSpeed: 9,
      despawnBehind: 40,
    },
  },

  // A cornered hero always has a way out (rescue.js, hero.dodge, minions).
  corner: {
    // Pinned: within `pinGap` of a rock / wall surface with an enemy's body within `enemyRange`
    // for `pinTime` s → a rescue pulse: enemies within `pushRadius` pushed back (minions
    // `minionPush`, the boss `bossPush` and into its recovery), then `cornerRescueCooldown` s.
    pinGap: 0.35,
    enemyRange: 3,
    pinTime: 1.5,
    cornerRescueCooldown: 15,
    pushRadius: 6,
    minionPush: 3.5,
    bossPush: 2.5,
    // The pulse: a ring expanding to `radius` on the ground and a bright shell round him ([w0, wGrow, h0, hGrow]).
    pulse: { time: 0.7, radius: 6, ringStart: 0.5, lift: 0.08, shell: [0.9, 1.4, 1.2, 1.2], shellOpacity: 0.6, color: 0x9fe8ff, glow: 0xffffff, opacity: 0.9 },
    // The dodge roll: never into a rock / wall within `wallReach`; it bends away (`wallPush`) and
    // gets a short push (`pushSpeed` for `pushTime` s). It passes through slimes.
    dodge: { wallReach: 0.9, wallPush: 0.8, pushSpeed: 6, pushTime: 0.15 },
    // Slimes stay out of `exclusion` round the hero: pushed out at `push` (a dodge shoves them at
    // `dodgeShove`), never inside longer than `maxInside` s.
    slimes: { exclusion: 1.5, maxInside: 0.5, push: 5, dodgeShove: 12 },
    // Riding and surrounded — `count` or more ground enemies within `range` of the horse for more
    // than `time` s: the horse rears up (`rear`: nose-up pitch over `time`) with a shockwave that
    // knocks enemies within `knockRadius` back `knock` and defeats skeletons within `defeatRadius`;
    // then `mountedRescueCooldown` s.
    mounted: { count: 2, range: 3, time: 2, knockRadius: 6, knock: 4, defeatRadius: 3.5, mountedRescueCooldown: 10, rear: { time: 0.7, pitch: 0.45 } },
  },

  // The cave monster (boss.js). Arena = CONFIG.cave.center / radius.
  boss: {
    hp: 100,
    height: 5.0,             // ~2.4x AJ (heroModel.height)
    radius: 1.6,             // body (hit / push) radius — the hero's melee reach is measured from its edge
    guard: [114, 0],         // waits here, in front of the cave mouth, until the hero enters the arena
    walkSpeed: 3.4,
    turnRate: 2.6,           // rad/s
    keepInside: 3.5,         // stays this far inside the arena edge (boulders are its boundary)
    // Slam: rears up with both fists overhead (0.8 s, red circle on the ground), then smashes
    // them into the ground in front — damage inside the circle, a shockwave ring, screen shake.
    slam: { range: 4.6, windup: 0.8, reach: 2.4, radius: 3.6, damage: 1, impact: 0.4, smash: 0.1, shake: 0.5, shockTime: 0.35, impactShoulder: -0.62, impactInward: 0.34, crouch: 0 },
    // Fire Breath: head back with a glowing mouth and a red cone on the ground (1 s), then a
    // 2 s cone of fire. Damage over time inside it (a heart every `tick`); dodge sideways out.
    fire: {
      minRange: 4.6, maxRange: 10, chaseBefore: 0.8, cooldown: 6,
      windup: 1, duration: 2, range: 11, halfAngle: 0.42, trackRate: 0.9,
      tick: 0.8, flameDamageHearts: 0.5, firstTick: 0.2, // half a heart every 0.8 s while the hero stands in the cone
      particles: 160, rate: 95, speed: 11, life: 0.85, size: [0.35, 1.1],
      colors: [0xffe14d, 0xff8a1c, 0xff3a14], coneColor: 0xff2020, mouthColor: 0xff7b1c,
    },
    // Close-range melee: within `range` it swipes or punches (at random) instead of slamming —
    // a 0.6 s wind-up you can see (and dodge-roll out of), one heart if it lands in front of it,
    // then a 2 s recovery. The jump-attack slam is for mid range only (range … slam.range).
    melee: { range: 4, reach: 4.6, frontDot: 0.3, windup: 0.6, strike: 0.4, damage: 1, recover: 2, kinds: ['swipe', 'punch'] },
    charge: { minRange: 7, chaseBefore: 1.6, windup: 1, speed: 17, maxTime: 1.8, damage: 1, hitPad: 0.5, stun: 2, knockback: 9 },
    recover: 1.3,            // pause after every attack (the hero's chance to hit back)
    hpMarks: [0.75, 0.5, 0.25], // falling below each fires onHpMark(i) (a ring of arena gems)
    // Damage it takes, as a fraction of its max HP per hit, whatever the hit's own number:
    // each combo hit (punches and the kick) 3%, a Batarang 2%, the Flash bolt 40%.
    hitPct: { melee: 0.03, batarang: 0.02, flash: 0.4 },
    // Phase 2 below 50% HP: faster wind-ups, shorter recoveries, a faster walk, and it slams
    // more often — each phase-2 slam cracks the ground open (`onCrack`: slimes come out of the
    // cracks once they're added).
    enrageAt: 0.5,           // below this fraction of HP...
    enrageTime: 0.65,        // ...wind-ups take this fraction of the time...
    enrageRecover: 0.5,      // ...recoveries this fraction...
    enrageWalk: 1.35,        // ...it walks faster...
    enrageSlamChance: 0.4,   // ...and up close it slams instead of swiping/punching this often
    crack: { arms: 7, length: [2.4, 4.2], width: 0.22, color: 0x140a06, glow: 0xff5a14, glowOpacity: 0.55, life: 9, fade: 1.5, max: 6 },
    // Smoke Bomb on the boss: paralyzed only 4 s (other monsters: smokeBomb.paralyze), taking
    // +20% damage meanwhile, then it resists paralysis for 20 s.
    paralysis: { duration: 4, bonus: 1.2, resist: 20 },
    // The moment its body touches a Smoke Bomb cloud it is interrupted (chase, recovery, any
    // wind-up cancelled) and coughs, staggering; inside it moves at 15% and can't leave the cloud
    // until smokeExposureSeconds have passed, then paralysis. Never during a slam landing or a
    // charge rush: the frame after those end. (Not while it resists paralysis.)
    smoke: { slow: 0.85, coughBob: 0.06 },
    flashStagger: 1.5,       // the Flash bolt staggers it this long (not while dying / paralyzed)
    stunnedBonus: 1.5,       // damage multiplier while stunned (charged into a boulder)
    dying: { stumble: 0.7, fall: 0.9, fade: 1.2 },
    dismountRange: 30,       // riding this close to the arena: the horse slows and the hero gets off
    autoBrake: 26,           // how hard the horse stops there
    dismountSpeed: 1.5,      // ...and the hero dismounts once it is this slow
    colors: { skin: 0x5b3f78, belly: 0x9c7fb5, horn: 0xe8dcc0, eye: 0xff2a2a },
    // The boss model: Warrok (Mixamo, public/models/boss/: monsterModel.js). boss.glb was
    // converted from the 12 MB boss.fbx like the girl's (skeleton in centimetres under a 0.01
    // root), so the animation FBX files beside it retarget by bone name unchanged. The fight's
    // timings are the game's: timed clips are scrubbed so their key frames land on them.
    model: {
      path: 'models/boss/',
      file: 'boss.glb',
      crossfade: 0.2,
      mouthSize: 0.16,        // fire-breath glow in the mouth (on the jaw bone)
      jawOpen: { inhale: 0.35, fireWindup: 0.45, fire: 0.6 }, // radians
      clips: ['idle', 'walk', 'run', 'jumpattack', 'swipe', 'punch', 'roar', 'hit', 'death'],
      walkRef: 2.86,          // m/s the walk clip covers at this scale (speed-matched to walkSpeed)
      runRef: 8.6,            // ...and the run clip (speed-matched to the charge)
      // Clip times (seconds in the source clip):
      slamWindup: [0.2, 1.68],      // crouch, leap … the fists hit the ground at 1.68
      slamImpact: [1.68, 2.3],      // landed, fists on the ground (damage at 1.68 = SLAM start)
      fireWindup: [0.3, 1.3],       // roar: rears up, head thrown back
      fire: [1.75, 3.3],            // roar: head thrust forward and low, roaring (fire from the mouth)
      swipe: { windup: [0.3, 1.25], strike: [1.25, 1.75] },  // arm drawn back … the claw sweep (peaks ~1.3)
      punch: { windup: [0, 0.22], strike: [0.22, 0.6] },     // fist drawn back … the punch (peaks ~0.3)
      chargeWindup: [0.6, 1.9],     // roar: rears back, then head down ready to rush
      stunned: { xs: [0, 0.2, 0.75, 1], ts: [0, 0.55, 0.6, 1.33] }, // hit: doubles over, holds, recovers
      paralyzedAt: 0.55,            // hit, frozen doubled over (Smoke Bomb)
      smokedAt: 0.35,               // hit, flinching while it coughs in the smoke
      dying: [0, 3.1],              // death: staggers, falls on its back (over stumble + fall)
      dizzyAbove: 1.0,              // dizzy stars this far above the head bone
    },
    warningColor: 0xff2020,
    girl: {
      position: [116.5, -16.5], // at the cave mouth, by the left wall of the arch
      facing: -0.65,         // looking out toward the arena centre (radians, 0 = +Z)
      color: 0x8a4fd0, hair: 0x1c1026, skin: 0xf3d2b0, height: 1.6, radius: 0.32, appearTime: 1.2,
      shadow: { x: 120.8, z: -23, width: 3.6, height: 5.2, opacity: 0.5 }, // on the cave wall behind her
      seatBack: 0.62,        // riding: sits this far behind the hero's seat
    },
    victoryMs: 3200,
  },

  cave: {
    center: [104, 0],
    radius: 20,              // monster arena (ring of boulders, opening west)
    rockCount: 42,
    rockSizeMin: 3.2,
    rockSizeMax: 5.6,
    openingHalfAngle: 0.45,  // radians; opening faces west toward the forest
    colliderScale: 0.8,
    // Rocks with a collider (arena boulders, pillars, cliff bases) fade while between the camera and the hero.
    fade: { opacity: 0.3, radiusScale: 0.8, heightScale: 0.8, blockScale: 0.95 }, // (a vertical capsule ≈ the collider)
    // Giant cave mouth in a towering cliff at the far (east) side of the arena, facing west.
    // ~10x the horse's height (2.6) → 26 tall.
    archPosition: [126, 0],
    archRadius: 26,
    archTube: 5,
    archColor: 0x3f3a36,
    tunnelDepth: 22,
    reach: 16,               // "Ride to the cave" also completes within this distance of the mouth
    cliff: {
      faceX: 128,            // the main wall runs north-south here
      height: [82, 104],
      rockSize: [12, 22],
      count: 46,             // rocks in the main wall
      sideCount: 30,         // rocks in the side cliffs wrapping the arena
      sideZ: 42,             // side cliffs at about |z| = this
      color: 0x5e5751,
    },
    pillars: [[92, -34, 50], [111, -40, 66], [97, 37, 58], [116, 44, 72], [84, -48, 44]], // x, z, height
    pillarRadius: 4,
    mist: {
      count: 46,
      size: 32,
      opacity: 0.26,
      color: 0xdfe6ee,
      drift: 0.6,
    },
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
    // On foot: close enough that AJ fills ~35–40% of the screen height (35% closer than the
    // old 7), the look-at point at his chest and a slightly lower angle.
    camOnFootDistance: 4.55,
    camOnFootHeight: 1.45,   // look-at offset above hero feet
    minPitch: -0.2,
    maxPitch: 1.2,
    startPitch: 0.27,
    startYaw: -Math.PI / 2, // behind the hero, looking along the route (+X)
    followLerp: 10,        // higher = snappier follow
    dragSensitivity: 0.006, // radians per pixel (touch)
    mouseSensitivity: 0.005,
    groundClearance: 0.5,
    // Tree-leaping zone: pull back a little and look down more so branches read clearly.
    // Blended in/out smoothly around the zone's edges.
    treeZoneDistanceScale: 1.45, // (6.6: the branches ahead still read clearly)
    treeZonePitchBoost: 0.14,   // radians added to the pitch (looks further down)
    treeZoneBlend: 6,           // units over which the zone settings fade in/out
    // Collision: the camera is pulled in front of trunks and pushed out of leaf clusters.
    collisionPadding: 0.4,
    minDistance: 0.6,           // only reached when the hero stands right against a trunk
    leafMinDistance: 1.8,       // leaf clusters closer than this to the hero fade instead of blocking
    releaseLerp: 3,
    wallStep: 0.5,              // ray march step against the invisible trail walls
    // Riding: close over-the-shoulder view behind and slightly above the rider (~57% of the
    // old 4.2), so the horse and both riders fill the lower middle of the screen.
    camRideDistance: 2.5,     // from the look-at point (60% of the old 4.2)
    camRideHeight: 1.35,      // look-at point above the rider's seat
    camRideFov: 60,           // base field of view while riding (widens subtly with speed / gallop)
    rideShoulder: 0.6,        // look-at point shifted right of the rider
    ridePitchOffset: 0.12,    // a little higher than on foot: looks down onto the horse and both riders
    speedDistanceScale: 0.08, // subtle extra distance at full speed
    speedFov: 3,              // subtle extra FOV at full speed...
    gallopFov: 2,             // ...and a bit more while galloping
    rideBlend: 3,             // how quickly ride/speed effects follow
    rideFollow: 2.2,          // riding: camera swings back behind the horse (1/s)...
    rideFollowDelay: 1.2,     // ...this long after the player last dragged to look
    // A wall, rock or cliff right behind the hero: the camera slides in along the hero's line;
    // with less than `minFree` of room it also rises (up to `maxRaise` radians of extra pitch,
    // searched in `steps`) to look over it, easing back down when there is room again. It is
    // never inside a solid (`clear` from every collider) and never closer than `floor`.
    // Still boxed in at the full raise (a tall rock right behind him) and not being dragged for
    // `swingDelay` s: it swings round (up to `maxSwing` rad, searched in `swingSteps` each way)
    // to where there is room, at `swingRate` — a swipe always overrides it.
    blocked: { minFree: 2.2, maxRaise: 0.7, steps: 7, maxPitch: 1.35, raiseLerp: 5, clear: 0.15, floor: 0.25, guardStep: 0.08, heroFade: { near: 0.5, far: 1.1, min: 0.2 }, swingBelow: 1.6, swingDelay: 0.6, maxSwing: 2.2, swingSteps: 11, swingRate: 3 },
  },

  input: {
    joystickRadius: 60,    // px, max knob travel
    joystickDeadZone: 0.12,
    buttonHitScale: 1.3,   // touch hit circles are this much larger than the drawn buttons
    // Two-thumb layout: every action button in the bottom-right corner, nothing mid-screen.
    // [right, bottom, size] in px: button centre from the bottom-right corner (inside the safe
    // area plus `edgePad`), and diameter (≥ minButton). The most-used button sits in the corner
    // (Attack on foot, Gallop riding); the rest arc above and to the left of it within reach of
    // the right thumb. Buttons missing from a layout are hidden in that mode.
    layout: {
      edgePad: 14,
      minButton: 56,
      foot: {
        attack: [66, 66, 80],
        jump: [166, 60, 62],
        dodge: [142, 140, 62],
        mount: [66, 166, 62],      // (only shown near the horse)
        batarang: [230, 104, 58],
        smokeBomb: [204, 190, 58],
        flashMode: [128, 224, 58],
      },
      // Riding: the three abilities in a small arc above Gallop and Jump (only Attack and Dodge
      // are hidden). (Dismount is not in the corner: see `dismount`.)
      ride: {
        gallop: [66, 66, 80],
        jump: [166, 60, 62],
        batarang: [222, 130, 58],
        smokeBomb: [140, 160, 58],
        flashMode: [60, 170, 58],
      },
      minGap: 12,                // px of clear space kept between the corner buttons
    },
    // Ability buttons: a badge with the uses left (gems on hand ÷ cost, rounded down), capped
    // at this on screen. No badge at 0 uses (greyed) or while locked; the costs are never shown.
    usesBadgeMax: 99,
    // Dismount: a small plain button (no glow, pulse or highlight) just below the Pink gem
    // counter at the top right — not in the corner cluster. It works only while the horse is
    // slower than `maxSpeed` (greyed out while it moves) and after a `holdSeconds` press-and-hold,
    // a ring filling as you hold. `fallback`: its top / right edge (px from the safe-area corner)
    // when the gem counter can't be measured. Keyboard E dismounts under the same speed limit.
    dismount: { size: 44, gap: 6, holdSeconds: 0.4, maxSpeed: 3, fallback: { top: 42, right: 26 } },
    // Landscape phone viewports (CSS px) the layout is checked on: 20:9, 18:9, 16:9.
    checkSizes: [[915, 412], [760, 360], [640, 360]],
    // With Alt (K, S and G alone are dodge, move back and grant gems): a skeleton group, the storm on/off, the castle-gate cinematic.
    altDebugKeys: { skeletons: 'KeyK', storm: 'KeyS', gate: 'KeyG' },
    debugKeys: { grantGems: 'KeyG', damageHero: 'KeyH', teleportArena: 'KeyT', killBoss: 'KeyX', spawnBat: 'KeyB', cutscene: 'KeyP', desert: 'KeyO', ending: 'KeyU', pit: 'KeyL' },
  },

  // Hidden test menu (testMenu.js): only with ?debug in the URL. Every jump starts with full
  // hearts and this many uses of each ability (gems = uses × the ability's gem cost).
  testMenu: {
    param: 'debug',
    abilityUses: 5,
    caveApproach: 45,        // "Cave entrance": on the horse this far from the arena centre (it auto-dismounts at boss.dismountRange)
  },

  cutscene: {
    fadeMs: 450,       // fade between slides
    swirlMs: 1600,     // swirl transition into the dream world
    nodSeconds: 3.2,   // one slow head-nod cycle on the drowsy slide
  },

  ui: {
    rotateCheckMs: 250,
    hintHideMs: 8000,      // controls hint fades after this long
    toastMs: 2000,
  },

  // The girl is Amy (Mixamo Ch46, public/models/girl/: girlModel.js), as she comes. Her
  // skeleton is in centimetres under a 0.01 root (scripts/girl-to-glb.mjs), like the animation
  // FBX files, so they retarget onto it unchanged.
  girlModel: {
    path: 'models/girl/',
    file: 'girl.glb',        // meshopt-compressed; its embedded clip is the idle
    height: 1.62,            // a little shorter than AJ (1.8)
    textureMax: 1024,
    crossfade: 0.25,
    // Animation-only FBX files in the same folder (all loaded; the last ones are unused for now).
    clips: {
      scared: { file: 'scared' },   // the cave, before and during her cutscene
      talk: { file: 'talk' },       // while one of her lines is up (upper body)
      point: { file: 'point', hold: 1.2 }, // "Look." — held with the arm out (upper body)
      walk: { file: 'walk' },       // to the Lazarus Pit (speed-matched)
      kneel: { file: 'kneel' },     // at the pit, a hand to the water
      happy: { file: 'happy' },     // the silent smile (close-up)
      ride: { file: 'ride' },       // behind AJ on the horse
      magic1: { file: 'magic1' }, magic2: { file: 'magic2' }, magic3: { file: 'magic3' },
      magic_big1: { file: 'magic_big1' }, magic_big2: { file: 'magic_big2' },
      cast: { file: 'cast' }, float: { file: 'float' }, fly: { file: 'fly' },
      dodge: { file: 'dodge' }, hit: { file: 'hit' }, death: { file: 'death' },
    },
    upperBones: ['Spine', 'Neck', 'Head', 'Shoulder', 'Arm', 'ForeArm', 'Hand'], // talk / point layers
    layerWeight: 20,         // the upper-body layer overrides the base clip on those bones
    // Seated behind AJ: the ride clip is a chair pose, so the hips go onto the horse's back and
    // the legs hang down its sides (clear of the rump).
    ride: { lift: 0.06, thighPitch: 1.1, spread: 0.5, knee: -0.3 },
    lookAtHero: { yaw: 0.5, pitch: 0.12 }, // riding, turning to look at him (head + upper spine)
    glanceBack: { yaw: -1.7, rate: 7 },    // a nervous glance back over her shoulder (the castle gates)
    // Witch hint: a faint purple glow over each eye (on the head bone), flickering.
    eyes: { up: 0.072, apart: 0.032, back: 0.018, size: 0.028, color: 0xb04dff, opacity: 0.75 },
  },
  girlWitchForm: false,      // hook for her later transformation: eyes glow and the wall shadow keeps the hat and staff

  // The horse model (public/models/horse/horse.gltf: horseModel.js), animated by speed.
  // Collision, steering, hop, gallop and stamina stay in `horse` below.
  horseModel: {
    file: 'models/horse/horse.gltf',
    backHeight: 1.65,        // top of the back at the saddle, above the hooves (AJ is 1.8 tall)
    textureMax: 1024,        // any embedded textures are downsized to this (this horse has none: flat colours)
    crossfade: 0.25,         // seconds to blend between gaits
    seatBone: 'Torso2',      // the saddle rides on this back bone (follows the gallop's rocking)
    saddleOffset: [0, 0.02, 0.05],     // AJ's hips relative to the top of the back over seatBone (x, y, z; +z forward)
    passengerOffset: [0, 0.04, -0.5],  // the girl's hips, same frame, behind him
    // Clip roles → clip names, first one found wins (a missing gait falls back to the nearest).
    roles: {
      idle: ['Idle', 'Idle_2', 'Idle_Headlow'],     // standing, ridden
      graze: ['Eating', 'Idle_Headlow', 'Idle'],    // waiting for the rider
      walk: ['Walk', 'Trot', 'Gallop'],
      trot: ['Trot', 'Canter', 'Gallop', 'Walk'],   // no trot in this file: the gallop, played slower
      gallop: ['Gallop', 'Canter', 'Trot', 'Walk'],
      jump: ['Gallop_Jump', 'Jump_toIdle'],         // the hop (scrubbed: take-off, apex, landing)
    },
    // Gaits blend by horse speed between these anchors; each plays at speed / ref (clamped).
    gaits: [
      { role: 'idle', speed: 0 },
      { role: 'walk', speed: 2.5, ref: 2.2, min: 0.6, max: 1.6 },
      { role: 'trot', speed: 7, ref: 10, min: 0.55, max: 1.2 },
      { role: 'gallop', speed: 13, ref: 11, min: 0.8, max: 1.7 },
    ],
    gallopRate: 1.35,        // Gallop button: the gallop clip plays this much faster again
    jumpWindow: [0.37, 0.73, 1.1],
    rootBone: 'Body',        // held level in the jump clip (the hop does the height)
  },

  horse: {
    position: [-15, 6],    // on the sand bank by the river (x, z), at the start of the trail
    facing: 0,             // north, along the trail
    radius: 0.9,           // collision radius
    height: 2.6,
    stepUp: 0.6,
    mountRange: 3,         // Mount button appears within this distance
    mountTime: 0.5,        // seconds for the mount / dismount transition
    mountArc: 1.1,         // hop height of the rider during the transition
    dismountSide: 1.7,     // rider lands this far to the horse's left
    seatHeight: 1.45,      // rider's feet above the horse's hooves
    maxSpeed: 17.5,        // 2.5 × hero walk speed
    acceleration: 9,       // units/s² toward the joystick speed
    braking: 16,
    // Steering (horse-relative: stick left/right turns, up = go, down = brake).
    turnRateSlow: 2.2,     // rad/s when slow...
    turnRateFast: 1.0,     // ...at full speed...
    gallopTurnFactor: 0.9, // ...and less again while galloping
    steerSmoothing: 7,     // how quickly steering follows the stick (1/s)
    straighten: 5,         // with the stick centred, residual steering dies away (1/s)
    leanFactor: 0.22,      // lean into turns (radians per rad/s of turning, at full speed)
    maxLean: 0.22,
    leanSmoothing: 6,
    brakeStick: -0.45,     // pulling the stick back past this brakes
    turnSlowdown: 0.25,    // eases off this much (fraction of speed) at full steer
    steerDeadzone: 0.06,   // stick values below this count as centred
    hopVelocity: 9,        // hop on jump: ~1.6 high, clears every obstacle
    gravity: 25,
    gallopStride: 0.2,     // leg cycles per unit travelled (faster legs at higher speed)
    bobHeight: 0.2,        // gallop bob at full speed
    legSwing: 0.75,        // radians at full speed
    shadowSize: 2.6,
    substep: 0.5,          // max distance per physics step (no tunnelling at full gallop)
    // Gallop (hold the Gallop button / Shift): ~2x speed while stamina lasts.
    gallop: {
      speedMultiplier: 2,
      acceleration: 16,
      staminaDrain: 0.075, // per second while galloping (~13 s from full)
      staminaRefill: 0.5,  // per second when not galloping (~2 s to refill)
      refillDelay: 0.5,    // seconds after galloping before stamina refills
      minToStart: 0.2,     // need at least this much to start a gallop
      dustMultiplier: 2.2,
    },
    waterSpeed: 0.72,      // speed multiplier while in the river
    waterBraking: 40,      // the water slows the horse quickly to that speed
    splash: {
      maxDrops: 90,
      maxRipples: 24,
      dropsPerStep: 4,     // per hoof landing in water
      dropsOnEnter: 16,    // burst when stepping in or out
      dropSpeed: 3.2,
      dropSize: 0.09,
      dropLife: 0.55,
      dropColor: 0xe6f6ff,
      rippleLife: 0.9,
      rippleSize: 1.6,     // final radius
      rippleColor: 0xffffff,
      rippleOpacity: 0.55,
    },
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

  // Obstacles on the ride path (jump them on the horse). Each spans the path across its
  // direction; groups give a clear line of approach.
  // Obstacles: few and fair — each alone on a straight, with a long clear run-up.
  obstacles: {
    at: [0.1, 0.27, 0.42, 0.67, 0.78, 0.89], // target positions (fraction of the track)
    wallIndex: 3,            // which one is the low rock wall (the rest are logs)
    search: 0.04,            // look this far (fraction) either side for a straight spot
    runUp: 40,               // clear (no other obstacle, no water) before...
    runOut: 20,              // ...and after
    straightBefore: 25,      // the obstacle sits on a straight: at least this much before it...
    straightAfter: 10,       // ...and after
    maxCurvature: 0.004,     // "straight": heading changes less than this per unit
    halfLength: 6.9,         // across the trail (within its 14 width)
    caveClear: 120,          // no obstacle within this distance of the cave mouth
    maxSlope: 0.025,         // only on level ground (rise per unit over ±slopeSpan)
    slopeSpan: 15,
    types: {
      log: { height: 0.6, depth: 0.55, color: 0x6b4423 },
      wall: { height: 0.7, depth: 0.6, color: 0x8a8378 },
    },
    stumbleTime: 0.6,        // seconds slowed after hitting one without jumping
    stumbleSpeed: 0.7,       // speed multiplier while stumbling (slows a little)
    clearMargin: 0.15,       // hooves must be this close to the top (or above) to clear it
    contactReach: 0.35,      // judged when the horse is this close to being over the obstacle
  },

  // Walls on the forest ride (world.js placeObstacles / loadForestWallModels): ~8 sets, each on
  // a straight with at least `runUp` of straight, clear trail before it, none on a curve, none
  // within obstacles.caveClear of the cave. Low brick walls (knee high, light) are jumped like
  // the logs (a stumble without a jump), so like them only on level ground. High stone walls (dark, taller than horse and riders)
  // can't be jumped: they span the corridor except a `gapWidth` gap left / centre / right; the
  // trail's invisible side walls narrow smoothly into the gap over `leadIn` (a funnel the horse
  // rails along — never caught) and the path assist / safe line lead into it.
  forestWalls: {
    sets: [
      { at: 0.052, kind: 'high', gap: 'centre' },
      { at: 0.146, kind: 'low' },
      { at: 0.326, kind: 'low' },
      { at: 0.36, kind: 'high', gap: 'left' },   // (on the hill climb: high walls needn't be level)
      { at: 0.479, kind: 'high', gap: 'right' },
      { at: 0.635, kind: 'high', gap: 'left' },  // (on the descent)
      { at: 0.709, kind: 'low' },
      { at: 0.842, kind: 'low' },
    ],
    search: 0.04,            // look this far (fraction of the trail) either side for a fair spot
    runUp: 40,               // straight, clear trail before each set...
    runOut: 10,              // ...and clear after it (other items keep runUp + runOut away)
    straightAfter: 10,
    gapWidth: 6,             // the gap through a high wall (horse + both riders fit easily)
    gapOffsets: { left: -3.8, centre: 0, right: 3.8 }, // gap centre off the centre line (+ = right of travel; gems on it stay in the lane)
    leadIn: 30,              // the side walls narrow into the gap over this distance before it...
    leadOut: 5,              // ...and open out again over this much after it
    safeApproach: 22,        // the safe line (path assist, gems) moves over to the gap this far before the funnel
    safeExit: 15,            // ...and back to the centre over this much after the wall
    assistLook: 12,          // the path assist aims this far ahead on the safe line
    low: { height: 0.55, depth: 0.45, halfLength: 6.9, color: 0xe9c6a0, brick: [0.5, 0.18], mortar: 0.03 },
    high: { height: 3.6, depth: 1.1, span: 11, color: 0x5a544d, block: [1.1, 0.6] }, // span: out to the corridor edge
    lanterns: { perSide: 4, from: 30, to: 12, lateral: 7.9, post: 1.3, color: 0xffc04d, glow: 0xffa020, glowSize: 0.55, postColor: 0x2b2420 },
  },

  // Ride checkpoints every 25% of the track (the first is the horse). Falls/deaths after the
  // first mount respawn the hero on the horse at the last checkpoint reached.
  checkpoints: {
    fractions: [0, 0.25, 0.5, 0.75], // along the track (the first is the horse's spot)
    dryStep: 4,              // moved forward this far at a time while in the river (or an obstacle run-up)
    edgeOffset: 0.4,         // flag pole beyond the trail's right edge
    radius: 9,
    poleHeight: 3.2,
    flagColor: 0xd62828,
    reachedColor: 0x3fd96b,
  },

  gems: {
    colors: { yellow: 0xffd23f, blue: 0x3fa9ff, pink: 0xff5fc8 },
    // Layout: 18 groups of 5 along the trail's centre lane — yellow, blue, pink, repeated
    // (30 of each): rows on the safe line (through the high walls' gaps too) and arcs in the
    // air above the logs and the rock wall (a jump collects them). Unlocks still trigger at 5.
    needed: 5,
    groups: 18,              // in total, air arcs included (30 of each colour)
    laneMax: 4,              // every gem within this distance of the centre line
    groupSize: 5,
    spacing: 3.2,            // between gems in a group
    startS: 45,              // first group (after the horse) ...
    endMargin: 40,           // ... last group ends this far before the arena
    arcLateral: [0, 1.0, 1.5, 1.0, 0], // arc groups bow this far off the centre line
    obstacleClear: 16,       // ground groups keep this far (along the trail) from obstacles
    landingClear: 20,        // ...and this much further after one (the hop's landing)
    maxCurvature: 0.01,      // ground groups sit where the trail is fairly straight (rad/unit)
    leadIn: 15,              // ...with this much straight trail before the group
    searchStep: 4,           // ...searching this far at a time for such a spot
    airGemObstacles: 'all',  // a gem arc above every obstacle of these kinds (or a list of indices)...
    airGemKinds: ['log', 'wall'], // ...(the low brick walls carry none)
    // Ground groups: one row on the safe line through each high wall's gap, the rest spread out.
    airOffsets: [-3.5, -1.75, 0, 1.75, 3.5], // along the trail, around the obstacle
    airLift: 0.6,            // above the hop's own arc, so only a jump reaches them
    riderReach: 1.4,         // collect point above the horse's hooves (body centre)
    abilities: { yellow: 'batarang', blue: 'smokeBomb', pink: 'flashMode' },
    // Using a respawn (zero hearts): every trail gem from the checkpoint to the cave comes back
    // and the stock is topped up to at least this many of each colour. Retry after Game Over
    // starts the gems afresh (0 of each, unlocks cleared).
    respawnMinGems: 10,
    // Arena gems: when the boss drops below each of boss.hpMarks a ring of gems appears at the
    // arena's edge (perColor of each colour), collected by walking over them. Reset with the boss.
    arena: { perColor: 2, inset: 4, turn: 20 },  // inset from the arena edge; each ring turned `turn`°
    // Minions drop one gem of a random colour when defeated (a small pool per colour).
    drops: { perColor: 4, height: 1.0 },
    height: 1.4,             // ground gems: above the ground (or water surface)
    collectHeight: 1.3,      // vertical reach from the collector's body centre
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

  // Quests: text panel only (top left) — no 3D arrow, beacon or other pointer in the world.
  quests: {
    trackSearch: 30,       // how far off the trail the ride progress is still measured locally
  },
};

// All story text / dialogue lives here.
/** Gems one use of an ability costs (the Batarang's is `abilities.batarangGemCost`). */
export const abilityGemCost = (name) => (name === 'batarang' ? CONFIG.abilities.batarangGemCost : CONFIG.abilities[name].gemCost);

export const DIALOGUE = {
  loading: 'Loading the hero…',
  title: 'Dreamer Hero',
  rotatePhone: 'Please rotate your phone to landscape',
  testMenu: {
    open: 'TEST', close: 'Close',
    forest: 'Forest start', cave: 'Cave entrance', boss: 'Boss fight', afterBoss: 'After boss (Amy rescued)',
    pit: 'Lazarus Pit scene', chase: 'Desert chase', storm: 'Sandstorm', gate: 'Castle gate cinematic', ending: 'Ending screen',
  },
  skip: 'Skip ▶▶',
  gameOver: 'You woke up with a jolt!',
  retry: 'Tap to dream again',
  toBeContinued: 'To be continued... Part 2',
  quests: {
    rooftops: 'Jump across the rooftops',
    trees: 'Leap through the trees',
    mount: 'Mount the horse',
    ride: 'Ride to the cave',
    caveReached: 'You reached the cave!',
    boss: 'Defeat the monster',
    bossDone: 'The monster is defeated!',
    enterCave: 'Enter the cave',
    castle: 'Ride to the castle',
    castleReached: 'The castle!',
  },
  mount: 'Mount',
  dismount: 'Dismount',
  checkpoint: 'Checkpoint!',
  gemNames: { yellow: 'Yellow', blue: 'Blue', pink: 'Pink' },
  abilityNames: { batarang: 'Batarang', smokeBomb: 'Smoke Bomb', flashMode: 'Flash Mode' },
  unlocked: (ability) => `${ability} Unlocked!`,
  smokeResisted: 'It shrugs off the smoke!',
  arenaGems: 'Gems at the arena edge!',
  gallop: 'Gallop',
  objectiveComplete: 'Objective complete!',
  distanceUnit: 'm',
  controlsHint: 'Left: move · Right: look · Attack / Jump / Dodge / ability buttons  —  Keys: WASD / Space jump / J attack / K dodge / 1 2 3 abilities / E mount / Shift gallop',
  attack: 'Attack',
  dodge: 'Dodge',
  jump: 'Jump',
  abilityShort: { batarang: '★', smokeBomb: '☁', flashMode: '⚡' },
  gameOverTitle: 'Game Over',
  retryRide: 'Retry',
  bossName: 'Cave Monster',
  // The girl's scene at the cave mouth (she is secretly a witch — only hinted).
  speakers: { hero: 'Hero', girl: 'Girl' },
  girlScene: {
    safe: "You're safe now. The monster is gone.",
    thanks: 'My saviour, you have come at last! I am so thankful to you. My life is yours. Take me.',
    hintCue: 'Take me.', // the witch hint plays as she says this
    safety: 'Come, I will take you to safety.',
    castle: 'My castle lies beyond the desert dunes. Let us go together!',
  },
  // The Lazarus Pit, half way across the desert.
  pitScene: {
    stop: 'Stop.',
    fine: "I'm fine... we should keep going.",
    look: "You're not. Look.",
    drink: 'Drink it.',
    who: 'Thank you. But... who are you?',
  },
  tapToContinue: '▼',
  summary: {
    title: 'Part 1 complete',
    gems: 'Gems collected',
    time: 'Time',
    deaths: 'Deaths',
    playAgain: 'Play Again',
    part2: 'Part 2 (Coming soon)',
  },
  victory: 'Victory!',

  // Intro is told through pictures only. Add `caption: '...'` to a slide for one short comic line.
  intro: [
    { scene: 'desk' },
    { scene: 'drowsy' },
    { scene: 'dozing' },
    { scene: 'dream', transition: 'swirl' },
  ],
};
