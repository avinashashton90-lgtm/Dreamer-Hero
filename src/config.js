// All tunable numbers live here. Systems must not hard-code gameplay values.
export const CONFIG = {
  // The forest ride must be at least this long (river → cave, along the trail spline).
  trailLength: 1500,

  render: {
    maxPixelRatio: 2,
    // Adaptive resolution (main.js): if the frame rate stays below lowFps for `window` s the pixel
    // ratio steps down (not below minPixelRatio); above highFps for `window` s it steps back up to the cap.
    adaptive: { lowFps: 45, highFps: 57, window: 2, step: 0.25, minPixelRatio: 1 },
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
    // Draw zones (World.update): the forest side is drawn while the camera is west of forestMaxX,
    // the desert side east of desertMinX (both near the cave; the cliffs and the ridge hide the other side).
    zones: { forestMaxX: 185, desertMinX: 125 },
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
    // Kneeling at the Lazarus Pit (the drink, over the drink clip): hips `drop` lower, the left
    // thigh forward / shin down (`front`: thigh, knee), the right knee on the ground (`back`),
    // leaning `lean` (+ `reachLean` while reaching); during the scoop the right arm straightens
    // and reaches down to the water `reach` in front of him (`handY` above the ground), then the
    // cup comes up to his lips. Blended in over `blend` s.
    kneel: { drop: 0.46, front: [-1.45, 1.5], back: [-0.1, 1.6], lean: 0.2, reachLean: 1.0, reach: 0.65, handY: 0.1, blend: 0.35 },
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
      flashHeartCostPct: 0.3, // of max hearts (1.5 of 5); usable only with more hearts than this (outside the sealed arena)
      // In the sealed boss arena (arena.js): Flash costs these hearts and needs at least this many
      // (0 / 0: it never touches his hearts and works on his last heart; only the pink gems and the bar limit it).
      flashHeartCostInArena: 0,
      flashMinHeartsInArena: 0,
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
      // Behind the gate passage a walled courtyard (where Part 1 ends: the portal scene), its
      // ground levelled (a flat in heightAt: `flat` [r0, r1] round its centre); the keep behind it.
      // Its floor is desert sand (low drifts along the walls); the curtain wall's inner face is
      // lit stone round the passage, with the inner gate leaves (`userData.innerGates`: open as the
      // horse rides in, they swing shut behind it in the portal scene) and torches either side.
      courtyard: {
        depth: 24, halfWidth: 16, wall: 2, floorColor: 0xd9ad72, wallColor: 0x6a5470, flat: [22, 26],
        drifts: { count: 10, size: [1.6, 3.4], height: [0.25, 0.55], color: 0xe2b97e },
        innerFace: 0x7d6650, trim: 0x5a4636,
      },
      innerGate: { color: 0x5c3f27, bandColor: 0x2a2226, open: 1.45 }, // (Lambert: lit by the dusk)
      // Dressed in Kenney's Castle Kit when it loads (castleKit.js; its own sandstone and slate,
      // unfogged): wall tiles (`tile` × the wall's height wide) along the curtain wall and the
      // courtyard, a gatehouse tower either side of the passage (`width`, `height` × the wall's),
      // the corner towers hexagonal, the inner towers and keep square (base, `mids` middles,
      // roof), flags on every tower, banners beside the gate, and the gate leaves cut from the
      // kit's arched gate. Same sizes and places as the placeholder; it stays if the kit fails.
      kit: {
        wall: 'wall', gate: 'gate', banner: 'flag-banner-long', flag: 'flag',
        square: ['tower-square-base', 'tower-square-mid', 'tower-square-roof'],
        hexagon: ['tower-hexagon-base', 'tower-hexagon-base', 'tower-hexagon-roof'],
        mids: 2, tile: 1, gatehouse: { width: 6.5, height: 1.3 },
        flagScale: 5, flagSink: 0.2, banners: { x: 1.4, top: 0.9, scale: 2.6 }, leafThickness: 1,
      },
      // Torches on both faces of the curtain wall, either side of the passage (additive flames, no lights).
      torches: {
        x: 5.2, y: 4.6, out: 0.55,        // this far either side of the passage's centre, this high, standing out from the wall
        iron: 0x221c1a, bowl: 0x3a2c22,
        flame: 0xff9a3c, core: 0xffe2a0, halo: 0xff8a3a, haloSize: 1.5, haloOpacity: 0.32,
        flicker: { rate: [7, 13], amount: 0.18 },
      },
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
      aura: { show: false, height: 6, time: 2.2, color: 0x2f78ff, opacity: 0.16 }, // (off: over the sunset it read as a pink glow round Amy)
      pulse: { time: 1.1, size: 1.8, color: 0x5f9fff, opacity: 0.4 },
      walkSpeed: 2.4,        // the hero and girl walk to the pit
      drink: { scoop: 1.4, raise: 1.0, sip: 1.4 }, // the hero's cup: scoop, raise to the lips, sip (s)
      kneelTime: 0.8,        // the girl kneels before touching the water
      hum: 1.2,              // the water lights up; then "Drink it."
      smileHold: 2,          // she smiles silently (close-up)
      standOff: [0.15, 0.9], // hero / girl this far from the rim (AJ kneels right at the water's edge)
      // After "Look." the horse walks up to the pit (scripted): along the trail to the point level
      // with it, `lateral` off the centre line on the pit's side (inside the trail walls), its
      // right side (the dismount side) to the pit; at `speed`, easing in and out.
      horseWalk: { speed: 6, lateral: 6.4, ease: 1.3, rideOn: 2.5 }, // (back in the saddle it rides on from `rideOn` off the centre line)
      weakPace: 0.6,         // AJ's weak "I'm ok." types this much slower...
      coughLead: 0.45,       // ...after a small cough this long before it
      healStep: 0.35,        // seconds per heart refilled
      dimTime: 1.5,
      shots: {
        behind: { back: 7.5, up: 3.4, ahead: 6, duration: 1.4 },
        reveal: { side: -6, up: 3.2, back: 6, duration: 2.2 },
        sideOn: { dist: 8.5, up: 2.6, duration: 1.6 },
        // The drink: a clean wide side shot — `dist` from the group (AJ kneeling at the water's
        // edge, Amy and the pit), from the side (`angle`° round toward the trail so nobody is
        // hidden), low (`up`), looking at the pit (`look` above its water), AJ and Amy both in frame.
        drink: { dist: 4, angle: 25, up: 1.7, look: 0.3, duration: 1.0 },
        // "Who are you?" and her smile: a close-up on Amy's face from the front, slightly below
        // eye level (`eye` − `below`), `dist` from her body (≥ guard.minDist), `angle`° round from
        // the line to AJ (so the camera keeps clear of him), `eye` a fraction of her height, her yaw turned `cheat` of the way to
        // the camera; narrow `fov`; AJ only a soft edge.
        closeUp: { angle: 65, dist: 1.85, eye: 0.926, below: 0.12, cheat: 0.75, fov: 38, duration: 1.0 },
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
      // (lightened for phones: fewer streaks, fewer and smaller soft clouds = much less overdraw)
      streaks: { count: 110, area: 42, length: [2.5, 6.5], width: [0.04, 0.09], height: [0.3, 7], color: 0xf3d7a6, opacity: 0.55 },
      clouds: { count: 18, area: 48, band: 20, size: [8, 14], height: [1.5, 7], drift: 5, roll: 0.18, color: 0xd9a96b, opacity: 0.66 },
      sky: { radius: 420, color: 0xc89060, opacity: 0.6 }, // the sky veils over (drawn behind everything near)
      tint: { color: 0xd8944f, opacity: 0.1 },             // a light warm dusty tint over the view
      fog: { color: 0xcf9c66, near: 30, far: 150 },        // still ≥ 60 of visibility along the trail
      castleGlow: { color: 0xffb36b, up: 16, size: 46, opacity: 0.55 }, // the castle's warm glow reads through it
      // Small whirlwinds beside the path: `count` (2–4) at a time, each a tight spiral of sand
      // circling upward in a cone `height` tall (radius `radius` at the foot … the top), drifting
      // slowly with the wind, fading in and out over its `life`; always off the clear corridor
      // (`offTrail` beyond its soft edge) and `minCam` from the camera.
      whirlwinds: {
        count: [2, 4], particles: 34, height: [3, 5], radius: [0.35, 1.7], spin: 4.2, rise: 1.8,
        life: [7, 12], fade: 1.5, drift: 1.4, ahead: [8, 46], offTrail: [3, 16], gap: [0.2, 1], minCam: 7,
        size: [0.18, 0.4], color: 0xe8c48e, opacity: 0.6, debris: 2,
      },
      // Flying debris carried by the wind: small rocks, pebbles and dry grass tufts tumbling
      // sideways (bouncing along the sand), a few spinning in the whirlwinds. Low counts, one
      // InstancedMesh per kind; never in the clear corridor (it shrinks away at its edge) and
      // never within `minCam` of the camera.
      debris: {
        rocks: 3, pebbles: 6, tufts: 5, area: 40, speed: [6, 11], hop: [2, 4.5], gravity: 14, bounce: 0.45,
        spin: 9, minCam: 5, height: [0.2, 2.2],
        rockSize: [0.12, 0.22], pebbleSize: [0.05, 0.09], tuftSize: [0.18, 0.3],
        rockColor: 0x9a7a58, pebbleColor: 0xb59672, tuftColor: 0xb8a060,
      },
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
      innerShut: { time: 1.4, dust: 10, volume: 0.6 }, // the inner gates swing shut behind the horse in the courtyard (the portal scene)
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
    titleMs: 3200,           // ..."To be continued..." for this long, then the summary
  },

  // Part 2 — Gearhaven (src/part2/, loaded by levelManager.js as its own chapter; STORY.md).
  // `portal` is the bridge at the end of Part 1 (story.js + portal.js, in the Part 1 world).
  // The model kits (src/kits.js): Kenney Factory / Coaster / Castle Kits (CC0) and the gear
  // props (Poly Pizza / Quaternius) — loaded piece by piece when a level needs them, one shared
  // palette texture per kit, its colours re-tinted in one Lambert shader (`tints`: warm palette
  // colours → `warm`, cool ones → `cool`, greys mixed `greyK` toward `grey`). The Coaster Kit has
  // only the one colormap (no gold / copper variant), so the rails are tinted brass / copper; the Factory
  // Kit's variation-a is another cool palette, so the colormap is tinted too.
  kits: {
    factory: { path: 'models/gearhaven/factory/glb/', texture: 'colormap.png', tint: 'factory' },
    rails: { path: 'models/gearhaven/rails/glb/', texture: 'colormap.png', tint: 'rails' },
    castle: { path: 'models/castle/glb/', texture: 'colormap.png', tint: null }, // (Part 1's castle keeps the kit's own sandstone and slate)
    props: { path: 'models/gearhaven/props/' },
    tints: {
      factory: { warm: 0xe0aa3a, cool: 0xb8643a, grey: 0xa07440, greyK: 0.8, boost: 1.05, rim: 0xffe6c0, rimK: 0.18 }, // orange → brass, blue → copper, the slate greys → dark copper-bronze
      railBrass: { warm: 0xd89a2c, cool: 0xc88e2a, grey: 0xc08a2a, greyK: 0.9, boost: 1.1, rim: 0xfff0c8, rimK: 0.3 },     // the Monorail track: brass
      railCopper: { warm: 0xc8703a, cool: 0xb8643a, grey: 0xc06a3a, greyK: 0.9, boost: 1.1, rim: 0xffe0c8, rimK: 0.3 },    // the Steel track: copper
      railSupports: { warm: 0x7a5a30, cool: 0x6a4a2a, grey: 0x5e4428, greyK: 0.8, boost: 1.0, rim: 0xffe0c0, rimK: 0.12 }, // their supports: dark bronze
      conveyor: { warm: 0xd9a441, cool: 0x5a6873, grey: 0x46525c, greyK: 0.85, boost: 1.0, rim: 0xbfe8e0, rimK: 0.1 },       // conveyor belts: brass and steel (the look sets it)
      skyline: { warm: 0xc9a23a, cool: 0xa45a32, grey: 0x9a7a48, greyK: 0.75, boost: 0.9, rim: 0xffe6c0, rimK: 0.0 }, // the distant brass city
    },
    metals: {
      brass: { color: 0xd8a640, emissive: 0x1e1406 },
      copper: { color: 0xb8683a, emissive: 0x160a04 },
      darkBrass: { color: 0x8c6a32 },
      steel: { color: 0x9aa0a8, emissive: 0x0a0a0c },
      gold: { color: 0xf0c048, emissive: 0x4a3008 },
    },
  },
  part2: {
    // After the castle gates slam shut: the horse walks on into the courtyard and the inner gates
    // swing shut behind it — the gate wall, the closed gates and the torches are the backdrop,
    // the sand underfoot, the dusk sky above. A wide shot from in front; Amy gets down beside the
    // horse and turns to AJ; a cut to her face, her eyes glowing white-violet through "Thank you
    // for bringing me home."; back to wide for "Amy?", the portal opening beside AJ and pulling
    // him and the horse in; the camera flies on into its light; white.
    portal: {
      hold: 0.8,               // s after the slam; then the horse walks on into the courtyard...
      walkIn: { speed: 2.6, depth: 8, shutAt: 5.6 }, // ...at this speed, stopping this far in from the inner gates (they swing shut once it is `shutAt` in)
      dismount: { ahead: 1.0, side: 3.0, walkSpeed: 1.5 }, // she gets down on the horse's left and stands this far to its side (a little ahead), then turns to AJ
      eyeColor: 0x9a4dff, eyeHalo: 0xe0d4ff, // (girl.awaken's colours — a violet core in a white-violet halo; unused for now: nothing about Amy is revealed in this scene, her eyes never glow)
      // The lines' timing (typewriter `pace`; `auto`: seconds after a line is typed before the next
      // starts by itself — the portal interrupts them, so they run straight on): AJ's "Whoa..." (the
      // portal tears open mid-line, at DIALOGUE's `whoaCue`) → at once "What's happening?!" (the pull
      // already under way) → Amy's long, trailing "No......" as they vanish into the light.
      lines: { whoa: { pace: 0.85, auto: 0 }, happening: { pace: 1.2, auto: 0.45 }, no: { pace: 0.12, auto: 0.5 } }, // ("No......": typed slowly, trailing on until they are gone into the light)
      side: 3.4, up: 2.3,      // the portal: in the air this far to the horse's right, this high
      radius: 1.9, openTime: 1.1, spin: 2.2, // grows over openTime, its swirl turning at `spin` rad/s
      ring: { tube: 0.16, color: 0xfff1c8, opacity: 0.95 },
      core: { color: 0xffffff, glow: 0xc9b8ff, opacity: 0.9 },
      swirl: { count: 48, size: [0.08, 0.2], speed: 2.8, color: 0xffe6a8, opacity: 0.85 },
      gears: { count: 12, size: [0.16, 0.36], from: [4, 8], time: [0.9, 1.6], spin: 6, color: 0xc9a23a },
      shake: 0.1, shakeTime: 1.2,
      gearWhooshes: 4,         // small gears whooshing past into it as it opens (gear_whoosh)
      reachDelay: 0.25,        // Amy reaches for him this long after the pull begins
      pullTime: 2.4,           // the portal pulls AJ and the horse in (accelerating, a little spiral)
      spiral: 0.8, shrink: 0.35, // radians of spiral; their size at the core
      shots: {
        // Wide shots inside the courtyard, looking back at the gate: the camera `ahead` of where the
        // horse stops and `side` to its left (Amy's side), `up` high, looking `back` past the horse
        // and `lookSide` to its left at `look` high — close enough that AJ, Amy and the horse fill
        // the frame between the letterbox and the dialogue box, the closed gates and torches behind.
        // The first from the front-left (the horse walking in, Amy behind AJ and getting down in view)...
        wide: { ahead: 6, side: 6, up: 1.4, back: 2.5, lookSide: 1.0, look: 0.6, fov: null, duration: 1.4 },
        // Her face for "Thank you for bringing me home.": `angle`° round from the line to AJ (to
        // the open side), `dist` from her, just below eye level; she turns `cheat` of the way to it.
        // (looking `lookBelow` under her eyes: her face in the upper half, clear of the dialogue box)
        closeUp: { angle: 50, dist: 1.9, eye: 0.93, below: 0.05, lookBelow: 0.32, cheat: 0.35, fov: 40, duration: 0.2 },
        // ...then from in front, for "Amy?" and the portal (it opens to the horse's right: screen left).
        wideBack: { ahead: 9, side: -0.2, up: 1.4, back: 1.0, lookSide: -0.1, look: 1.3, fov: null, duration: 1.1 },
        light: { duration: 1.1, into: 0.6 },                     // then on into its light
      },
      whiteOutMs: 650,         // fade to white, then Part 2 loads...
      whiteInMs: 1200,         // ...and the white clears in Gearhaven
    },
    // Gearhaven's look (part2/looks.js): one of `looks` — the sky (a gradient dome), the fog, the
    // lights, the far land, the floor, the path marks and the colours every part takes by role.
    // The ?debug menu's "Look" button cycles them while playing.
    gearhavenLook: 'verdigris',
    looks: {
      order: ['verdigris', 'midnight', 'sunrise'],
      // A) A deep teal-to-navy dusk; verdigris structures and dark steel; brass and copper only on
      // gears, rails, trim and Tick; warm amber lamps as point lights.
      verdigris: {
        name: 'Verdigris Dusk',
        sky: { top: 0x1b2a41, horizon: 0x3b6e8f, below: 0x24384a },
        fog: 0x24384a,
        ground: 0x2e3b45,     // the far land beyond the city floor (and the path's dark mark in the far distance)
        hemi: { sky: 0xa9c8d8, ground: 0x2e3b45, intensity: 0.95 },
        sun: { color: 0xffd6a8, intensity: 0.95, dir: [0.4, 0.75, 0.5] },
        lamps: { color: 0xffb347, intensity: 26, distance: 20, head: 0xffc56a, halo: 0.4 },
        floor: { base: 0xc9d1d6, centre: 0xaab4bb, lift: 0.3, engrave: 0x9faab2, engraveK: 0.55, specular: 0x2c3236, shininess: 36, sheen: 0x3b6e8f, sheenK: 0.22 },
        path: { edge: 0xd9a441, glow: 0.18 },
        palette: {
          structure: 0x3fa796, steel: 0x4a5863, darkSteel: 0x26303a, brass: 0xd9a441, copper: 0xb8693d, trim: 0xd9a441,
          towerStone: 0x34424c, ground: 0x2e3b45,
          stone: [0x34424d, 0x3b4a55, 0x2e3b45, 0x435260], roof: [0x3fa796, 0x2f8577],
          window: 0xffb347, windowGlow: 0.5,
        },
        tints: {
          factory: { warm: 0xd9a441, cool: 0x3fa796, grey: 0x3a4650, greyK: 0.85, boost: 1.0, rim: 0xbfe8e0, rimK: 0.15 },
          railSupports: { warm: 0x4a5863, cool: 0x3a4650, grey: 0x2e3a44, greyK: 0.85, boost: 1.0, rim: 0xbfe8e0, rimK: 0.1 },
          conveyor: { warm: 0xd9a441, cool: 0x5a6873, grey: 0x46525c, greyK: 0.85, boost: 1.0, rim: 0xbfe8e0, rimK: 0.1 }, // (the belts: brass and steel, never white)
          skyline: { warm: 0x3fa796, cool: 0x2f7f72, grey: 0x2a3a46, greyK: 0.85, boost: 0.9, rim: 0, rimK: 0 },
        },
        clock: { face: 0xf3e6c4, rim: 0xd9a441, hand: 0x1b2a41, glow: 0xffd88a, glowK: 0.3 },
        steam: { color: 0xfff1e0, emissive: 0x2b2722, opacity: 0.55 },
        gears: { halo: 0xffd27a, haloK: 0.3, emissive: 0x4a3008 },
      },
      // B) An indigo-purple night lit by the huge golden clock face; dark blue-grey structures,
      // a glowing gold path edge, brass props, amber windows; deep violet fog.
      midnight: {
        name: 'Midnight Clockwork',
        sky: { top: 0x0e0a26, horizon: 0x3a2466, below: 0x1e1438 },
        fog: 0x2a1840,
        ground: 0x1e2438,
        hemi: { sky: 0x5a4a9a, ground: 0x141830, intensity: 0.85 },
        sun: { color: 0xffc860, intensity: 1.05, dir: [0.15, 0.55, -1] }, // (from the clock face's side: the courtyard's clock stands at −z)
        lamps: { color: 0xffb347, intensity: 22, distance: 18, head: 0xffc56a, halo: 0.45 },
        floor: { base: 0xcdd4da, centre: 0xadb6be, lift: 0.36, engrave: 0x9faab2, engraveK: 0.5, specular: 0x30302c, shininess: 40, sheen: 0x5a3c8c, sheenK: 0.25 },
        path: { edge: 0xf2c040, glow: 0.9 },
        palette: {
          structure: 0x34405a, steel: 0x3a4466, darkSteel: 0x1e2236, brass: 0xe0b04a, copper: 0xb8693d, trim: 0xe0b04a,
          towerStone: 0x2a2e48, ground: 0x1e2438,
          stone: [0x2a3050, 0x323a5c, 0x262b47, 0x383f63], roof: [0x4a3f7a, 0x6a5428],
          window: 0xffb347, windowGlow: 0.7,
        },
        tints: {
          factory: { warm: 0xe0b04a, cool: 0xb08a3a, grey: 0x2e3654, greyK: 0.85, boost: 1.0, rim: 0xffd48a, rimK: 0.2 },
          railSupports: { warm: 0x3a4466, cool: 0x2e3654, grey: 0x262c46, greyK: 0.85, boost: 1.0, rim: 0xffd48a, rimK: 0.12 },
          conveyor: { warm: 0xe0b04a, cool: 0x4a5272, grey: 0x3a4262, greyK: 0.85, boost: 1.0, rim: 0xffd48a, rimK: 0.12 },
          skyline: { warm: 0x3a3466, cool: 0x2a2550, grey: 0x1e2238, greyK: 0.9, boost: 0.9, rim: 0, rimK: 0 },
        },
        clock: { face: 0xffcf4a, rim: 0xffe08a, hand: 0x3a2466, glow: 0xffc040, glowK: 0.7 },
        steam: { color: 0xffeacc, emissive: 0x3a3022, opacity: 0.55 },
        gears: { halo: 0xffd060, haloK: 0.5, emissive: 0x6a4410 },
      },
      // C) A pale cream-to-peach morning with teal shadows; light stone, a teal-edged path, brass
      // and copper props, a soft warm sun; pale warm-grey fog.
      sunrise: {
        name: 'Sunrise Brass',
        sky: { top: 0xf3e7cf, horizon: 0xf6c9a2, below: 0xcfc6ba },
        fog: 0xcfc6ba,
        ground: 0xd6cab4,
        hemi: { sky: 0xfff1dc, ground: 0x4e8c8a, intensity: 0.95 }, // (teal from below: teal shadows)
        sun: { color: 0xffe2b8, intensity: 1.05, dir: [0.6, 0.85, 0.3] },
        lamps: { color: 0xffb347, intensity: 0, distance: 18, head: 0xffd9a0, halo: 0.12 }, // (daylight: the lamps unlit)
        floor: { base: 0xdbe1e5, centre: 0xbac4ca, lift: 0.2, engrave: 0x9faab2, engraveK: 0.45, specular: 0x262829, shininess: 30, sheen: 0xf2c9a0, sheenK: 0.1 },
        path: { edge: 0x2f9c94, glow: 0.05 },
        palette: {
          structure: 0x4e8c8a, steel: 0x7a868e, darkSteel: 0x4b5660, brass: 0xd9a441, copper: 0xc27548, trim: 0xd9a441,
          towerStone: 0xd8cdb8, ground: 0xd6cab4,
          stone: [0xe2d6c2, 0xd8cab4, 0xe8dcc8, 0xcfc0a8], roof: [0x3f8e8a, 0xc27548],
          window: 0x3e6e73, windowGlow: 0.0,
        },
        tints: {
          factory: { warm: 0xe0aa3a, cool: 0xb8693d, grey: 0x7f8a8c, greyK: 0.75, boost: 1.0, rim: 0xfff0d8, rimK: 0.12 },
          railSupports: { warm: 0x7a5a30, cool: 0x6a4a2a, grey: 0x5e4428, greyK: 0.8, boost: 1.0, rim: 0xffe0c0, rimK: 0.12 },
          conveyor: { warm: 0xd9a441, cool: 0x6e7a82, grey: 0x5e6a72, greyK: 0.85, boost: 1.0, rim: 0xfff0d8, rimK: 0.1 },
          skyline: { warm: 0x4e8c8a, cool: 0x3f7a78, grey: 0x5f7a7c, greyK: 0.85, boost: 0.95, rim: 0, rimK: 0 },
        },
        clock: { face: 0xf6eedc, rim: 0xc27548, hand: 0x2f4f55, glow: 0xffe6b8, glowK: 0.18 },
        steam: { color: 0xfff4e8, emissive: 0x000000, opacity: 0.6 },
        gears: { halo: 0xffe7a0, haloK: 0.22, emissive: 0x3a2404 },
      },
      lights: 3,              // amber point lights, put on the lamps nearest AJ each frame (a fixed number: no shader rebuilds)
      dome: { radius: 600, horizon: 0.18 }, // the sky dome round the camera; the horizon band's height (of the up direction)
    },
    // The silver floor (part2/floor.js; every look): polished silver-white (never pure white, kept
    // below full brightness against glare; each look's floor `lift` is a little self-light so it
    // reads silver-white at dusk and midnight too) with a faint sheen and faint engravings in a slightly
    // darker silver — fine seams every `seam`, concentric clock rings round a centre every
    // `ringCell` (and on the courtyard's middle), big gear outlines every `gearCell` — faded out
    // with distance (`fade`) so they never shimmer. On the ride the city floor runs `plaza` either
    // side of the trail, the path's darker centre strip is ±`centre` and its edge lines run `edge`
    // out from the centre line.
    floor: {
      seam: 8, seamWidth: 0.05, ringCell: 96, ringStep: 4, ringMax: 34, ringWidth: 0.08, ticks: 12,
      gearCell: 64, gearRadius: 13, gearTeeth: 18, gearTooth: 1.3, gearWidth: 0.1, fade: [22, 80],
      plaza: 42, centre: 1.4, edge: [6.3, 6.75],
    },
    // Gearhaven: a brass courtyard under a sky of huge slow-turning gears, cogs and steam, the
    // Dream Clock's face far away, warm lights (placeholders: loadGearhavenModel()).
    gearhaven: {
      fog: { near: 35, far: 190 },  // (its colour, the sky, the lights and every colour here: the look's — gearhavenLook)
      floor: { radius: 24, wall: 23 },
      wallRing: { height: 1.4 },
      pillars: { count: 10, radius: 0.55, height: 6 },
      skyGears: { count: 7, radius: [14, 32], height: [38, 62], spread: 70, speed: [0.03, 0.08], depth: 1.6, shapes: ['gear01', 'cluster'] }, // (depth: a little thicker, they're huge)
      cogs: { count: 9, radius: [0.9, 2.2], speed: 0.6, shapes: ['cogA', 'cogC'], metals: ['brass', 'copper'] }, // (few shapes: one draw each)
      clock: { at: [0, 46, -140], radius: 26, slow: 0.02 },
      steam: { vents: 5, puffs: 36, life: 2.6, rise: 2.2, size: [0.5, 1.3], every: 4, hiss: 0.25 },
      doors: { radius: 20.5, height: 4.4, width: 2.8, reach: 1.8 }, // the element doors round the courtyard
    },
    // Tick: a small floating brass robot guide (loadTickModel(): the Quaternius Animated Robot,
    // public/models/gearhaven/tick/tick.glb — its yellow body tinted brass and copper, the goggles
    // kept dark — fitted to `height`, centred on its middle, playing its idle; else placeholder shapes).
    tick: {
      file: 'models/gearhaven/tick/tick.glb', height: 1.4, // (1.5× his first size: he reads from across the courtyard)
      tint: { Main: 0xf5c832, Grey: 0xc27a3a, Black: 0x141210 }, // material name → colour (bright brass-yellow body, copper limbs, dark goggles)
      eyes: { color: 0x6ec6ff, size: 0.055, depth: 0.35, out: 0.006 }, // two sky-blue eyes, one on each goggle lens: flat colour (unlit), no glow / emissive / halo (size: radius × his height)
      glow: { color: 0xffc94a, size: 2.2, opacity: 0.3 }, // a soft golden light round him — only once every gear of a level is found (gear rewards; an additive sprite × his height, no light)
      clips: { idle: ['Robot_Idle', 'Idle'], wave: ['Robot_Wave'], yes: ['Robot_Yes'], no: ['Robot_No'] },
      crossfade: 0.3,
      size: 0.6, color: 0xf0c03a, dark: 0x6b4a22, eye: 0x7ff3ff, // (the placeholder; its eyes use `eyes`)
      float: 1.9, bob: 0.12, bobRate: 1.6, follow: { side: 1.6, back: -0.4, rate: 6 }, // (at AJ's head height, beside him)
      prop: 14,                // propeller spin (rad/s)
      nervous: { yaw: 1.6, rate: 9, time: 1.8 }, // "I cannot say." — he looks over his shoulder, jittery
    },
    // The robots (robots.js loadRobotModel(kind); Quaternius Animated Mech Pack, CC0, in
    // public/models/gearhaven/robots/ — meshopt glb, 1024 px textures, 512 for the scout).
    // Picked by size: Leela (the smallest) the scout, Mike and Stan (the middle two) the sword
    // robots, George (the biggest) the armoured mech boss. Each is fitted to `height` and keeps
    // its own texture colours (Leela white and orange, Mike blue-grey, Stan teal-green, George
    // sage-green) in a cheap Lambert material (accentMaterial()) that only adds Gearhaven metal:
    // the texture's orange paint → `trim` (brass or copper), its dark joints → `joints`, and for
    // the boss its light panels → brass `plates`; a soft `rim` light so they stand out from the
    // brown ground. Optional glowing `eye` on the head bone (core + additive halo). Clips by role
    // (first name found wins). A file that fails → a code-built placeholder robot.
    robots: {
      path: 'models/gearhaven/robots/',
      crossfade: 0.2,
      kinds: {
        scout: {
          file: 'leela.glb', name: 'Leela', role: 'scout', height: 1.55,
          accents: { trim: [0xe0b040, 0.9], joints: [0x9a7430, 0.45], plates: null, rim: [0xfff0c8, 0.3], boost: 1.08 },
          eye: null,
        },
        swordA: {
          file: 'mike.glb', name: 'Mike', role: 'sword robot', height: 2.7,
          accents: { trim: [0xc8703a, 0.9], joints: [0x8c4a28, 0.45], plates: null, rim: [0xffe6cc, 0.28], boost: 1.08 },
          eye: { color: 0xff8a1a, halo: 0xffb060, size: 0.022 },
        },
        swordB: {
          file: 'stan.glb', name: 'Stan', role: 'sword robot', height: 2.7,
          accents: { trim: [0xc8703a, 0.9], joints: [0x8c4a28, 0.45], plates: null, rim: [0xffe6cc, 0.28], boost: 1.08 },
          eye: { color: 0xff8a1a, halo: 0xffb060, size: 0.022 },
        },
        boss: {
          file: 'george.glb', name: 'George', role: 'armoured mech boss', height: 6.5,
          accents: { trim: [0xd8a93c, 0.95], joints: [0x8a6a2a, 0.4], plates: [0xd4a640, 0.8], rim: [0xfff0c8, 0.25], boost: 1.05 },
          eye: { color: 0xff2a14, halo: 0xff6040, size: 0.02 },
        },
      },
      eye: { coreOpacity: 0.95, halo: 2.6, haloOpacity: 0.45, out: 0.35 }, // (the halo `halo` × the core; the eye stands `out` × its size from the face)
      clips: {
        idle: ['Idle'], walk: ['Walk', 'Walk_Tall', 'Run'], run: ['Run', 'Run_Tall'],
        attack: ['SwordSlash', 'Punch', 'Kick', 'Shoot'], hit: ['HitRecieve_1', 'HitRecieve_2'], death: ['Death'],
      },
      attackFor: { scout: ['Kick', 'Punch'], swordA: ['SwordSlash'], swordB: ['SwordSlash'], boss: ['Punch', 'Shoot', 'SwordSlash'] },
      placeholder: { brass: 0xc9a23a, copper: 0xa45a32, rust: 0x6e3a1e, eye: 0xffb050 },
    },
    // "Props test" (?debug; part2/propsTest.js): every kind of kit prop in a row on a brass strip
    // floating at `z`, `gap` apart, with a label each; the camera slides along the row and back (a swipe
    // moves it). Gears: [label, shape, radius, metal].
    propsTest: {
      z: 90, gap: 2.4, floor: { depth: 14 }, // (on its own strip of silver floor, away from the courtyard)
      gears: [['Gear (gear_01)', 'gear01', 1.2, 'brass'], ['Gear cluster', 'cluster', 1.4, 'copper'], ['Cog (Factory Kit)', 'cogA', 1, 'brass'], ['Collectible gear', 'collectible', 0.6, 'gold']],
      items: { scale: 1.8, width: 2.4, chestScale: 1.2 }, // the item system's types, one slot each (chests open and shut)
      spin: 0.8, sawScale: 0.8, kitScale: 1.6, railGap: 2.2, slats: 10, puffs: 8, towerScale: 0.3, castleScale: 0.25, gatePeriod: 6,
      camera: { dist: 12, height: 3.6, look: 1.8, speed: 3, ahead: 2, swipe: 40 },
    },
    // "Robots test" (?debug): all five in a row in the courtyard, each going through its clips.
    showcase: { z: -8, gap: 1.6, clipTime: 2.6, roleOrder: ['idle', 'walk', 'run', 'attack', 'hit', 'wave', 'yes', 'no', 'death'], orbit: { radius: 17, height: 5.5, speed: 0.12, look: 2.6 }, labelScale: 0.85 }, // (each robot's slot is as wide as its label or its body, whichever is wider, plus `gap`)
    // The horse in Gearhaven: a small brass key on its back and brass armour plates (loadGearhavenHorseUpgrade()).
    horseUpgrade: { brass: 0xc9a23a, copper: 0xb0643a, key: { at: [0, 1.95, -0.72], size: 0.34, spin: 1.2 } }, // (the key from the arrival; the plates are the gear reward `armour`)
    // Brass gears → rewards (part2/gearRewards.js). Each Gearhaven level has `gearsInLevel`
    // gears; reaching a tier's share of the level's total (`at`, a fraction, so it scales —
    // rounded up: 14 / 28 / 42 of 42) unlocks its reward for the rest of Part 2, kept between
    // sections and applied in every Part 2 level (once each; missing gears never blocks anything).
    // A banner, a chime (`gear_reward`), and tick marks at the tiers on the gear counter.
    // Part 2's sounds (soundCatalog.js names; files in public/audio/ replace the synthesized ones).
    // Ambience: very quiet loops per section (`ambience[section]`: name → level, × `ambienceVolume`),
    // faded in / out over `ambienceFade` s between sections. The music: Gearhaven's theme, the
    // faster "chase" one while grinding a rail (lingering `chaseLinger` s after), the Part 2
    // ending's; a stub level reuses Gearhaven's (`music.phases.stub`).
    sound: {
      ambience: {
        courtyard: { clock_tick: 0.6, gear_turn: 0.5, steam_hiss: 0.3 },
        ride: { factory_hum: 0.5, gear_turn: 0.35, clock_tick: 0.25 },
        stub: { clock_tick: 0.4, gear_turn: 0.3 },
        fire: { factory_hum: 0.5, burn_loop: 0.3, gear_turn: 0.3 },
      },
      ambienceVolume: 0.35, ambienceFade: 1.5,
      // The Furnace Guardian's plaza: a steam loop at half its old level (`volume` × `scale`), ducked to `duck` for `duckTime` s after any effect so hits, impacts and shots are never masked.
      plazaSteam: { volume: 0.3, scale: 0.5, duck: 0.35, duckTime: 0.7, ease: 8 },
      chaseLinger: 3,
      grind: { volume: [0.32, 0.55], pitch: [0.85, 1.2] }, // the rail grind: from grind.speed to its maxSpeed
      sawRange: 40, sawVolume: 0.5, conveyorRange: 35, conveyorVolume: 0.6, hammerRange: 45, ventIdleVolume: 0.35, // (3D: quieter with distance)
      streak: { gap: 1.2, max: 8, step: 1, spinVolume: 0.5 }, // gears in a quick row (within `gap` s): each `step` semitones higher, up to `max`
      tickHover: 0.35,         // Tick's propeller hum (from where he floats)
      clank: { minSpeed: 6, ref: 15, volume: 0.5 }, // the armoured horse's plates clinking (above a walk; rate by speed)
      robotStep: { small: 0.45, boss: 0.7 }, // s between a walking robot's / the mech boss's steps (the Robots test)
    },
    // AJ levels up with each Element (Lv 1 at the start of Part 2, Lv 2 with the Fire Element, ...). `levelUpBonuses[level]` is what reaching that
    // level adds; they stack (the cumulative sum is applied), and are capped (`levelUpCaps`: 10 hearts in all, 16 Batarangs carried).
    // `horseEnergyPct` raises the horse's energy maximum (the Fire level's blue potions fill to it), `damagePct` the Batarang's and Gear Wheel's damage.
    // Later levels read the same table (`Part2.level`, `levelBonus()`); a fresh game starts at Lv 1 again.
    levelUp: { bannerDelay: 2.6, bannerMs: 3400 },
    levelUpCaps: { hearts: 10, batarangCap: 16 },
    levelUpBonuses: {
      2: { hearts: 1, horseEnergyPct: 10, batarangCap: 1, damagePct: 10 },
      3: { hearts: 1, horseEnergyPct: 10, batarangCap: 1, damagePct: 10 },
      4: { hearts: 1, horseEnergyPct: 10, batarangCap: 1, damagePct: 10 },
      5: { hearts: 1, horseEnergyPct: 10, batarangCap: 1, damagePct: 10 },
      6: { hearts: 1, horseEnergyPct: 10, batarangCap: 1, damagePct: 10 },
    },
    gearsInLevel: { ride: 42 },
    gearRewardTiers: [
      { at: 1 / 3, reward: 'heart' },  // +1 max heart and a full heal
      { at: 2 / 3, reward: 'armour' }, // the brass plates on the horse: 30% less damage, stumbles half as long
      { at: 1, reward: 'charge' },     // a bonus ability charge for the element level, a soft golden glow round Tick
    ],
    gearRewards: {
      heart: 1,                // extra max hearts
      armourDamage: 0.7,       // the armoured horse takes this share of any damage
      armourStumble: 0.5,      // and stumbles / staggers this share of the time
      charges: 1,              // bonus ability charges for the level's element
      bannerMs: 2400,
    },
    // The arrival scene: AJ and the horse drop out of the light into the courtyard.
    arrival: {
      start: [0, 0, 8], heading: Math.PI, // where they land (facing into the courtyard)
      drop: 5, fallTime: 0.9,  // from this high
      tickFrom: [6, 5, -6],    // Tick floats in from here
      shots: {
        sky: { pos: [10, 3, 18], look: [0, 22, -40], duration: 0.1 },        // the gear sky and the clock first
        land: { pos: [6, 2.6, 14], look: [0, 1.2, 8], duration: 1.6 },       // then them landing
        // The talk, from in front (see `stage`): the two-shot — the camera `dist` toward them from
        // the middle of AJ and Tick, `up` high, looking at `look` high (a little down: their feet
        // above the dialogue box, the horse behind them).
        talk: { dist: 5.6, up: 1.9, look: 0.65, duration: 1.2 },
        // Each line frames its speaker (both kept in the shot): the camera eases `toward` × the way
        // over to the speaker and `closer` in, looking straight at them (`look` high) — AJ's lines
        // AJ, Tick's lines Tick in the middle of the screen.
        aj: { toward: 0.25, closer: 0.5, look: 0.75, duration: 0.7 },
        tick: { toward: 0.15, closer: 0.5, look: 0.8, duration: 0.7 },
        // "Am I inside a clock?": AJ looks up (`lookUp` rad of head pitch, turned to the clock) and the
        // camera tilts up past his shoulder to the Dream Clock's face and the gears turning in the sky:
        // `back` behind him (away from the clock), `side` to the side away from Tick and the horse (far enough out that Tick shows clear of AJ's head), `up` high.
        clock: { back: 2.6, side: 2.4, up: 1.15, lookUp: 0.45, duration: 1.3 },
      },
      // Where they stand for the talk, in the frame of the two-shot: the camera is `angle`° round
      // from the horse's nose toward its right (the horse three-quarter on, behind them). AJ gets
      // down on its right and steps to `aj` = [across the screen (− = left), toward the camera]
      // from the horse; Tick floats in to `tick` = [across (+ = right), toward the camera, height]
      // — AJ on the left, Tick on the right at head height, the horse behind them.
      stage: { angle: 40, aj: [-1.1, 3.6], tick: [1.1, 4.6, 1.9], walkSpeed: 1.4 },
      landHold: 0.6,
    },
    // After the arrival: the courtyard; walk into the Fire door (the first level, a stub for now).
    courtyard: { spawn: [0, 0, 6], first: 'fire' },
    // The levels (each a stub "coming soon" platform until built), and Amy's final fight.
    levels: {
      order: ['fire', 'lightning', 'steam', 'magnet', 'time'],
      // Each level's accent colours [main, second] (its door's glow, its crystal; the levels to
      // come will build on them): Fire red-orange, Lightning blue-violet, Steam white-teal,
      // Magnet steel and magenta, Time gold on deep blue.
      fire: { accent: [0xff4a1c, 0xffa040], angle: -0.7 },
      lightning: { accent: [0x6f6bff, 0xb48cff], angle: -0.35 },
      steam: { accent: [0xeef8f5, 0x3fb8a8], angle: 0 },
      magnet: { accent: [0xd63fa8, 0x8c98a4], angle: 0.35 },
      time: { accent: [0xf0c048, 0x14204a], angle: 0.7 },
      final: { accent: [0x9a6bff, 0xe0d4ff] },
      stub: { radius: 9, gap: 120, crystal: 0.8, back: 6.5 }, // a platform per level this far apart; a crystal; the door back
    },
    // The reusable items (part2/items.js; every type a swappable loadItemModel(name) with a code-built
    // placeholder in brass / copper / glow colours): floating pickups (they bob, spin and glow),
    // chests (small: 1 cog key, big: 2) and what is inside them. Used by the Fire level; later
    // levels reuse them (rune stones and wand pieces are for later: three wand pieces form Amy's wand).
    items: {
      bob: 0.16, bobRate: 2.4, spin: 1.5, halo: { size: 1.7, opacity: 0.32 },
      // No pickup pulls itself to AJ: the largest pickup radius anywhere is `pickupMagnetRadius` (the ride, from the saddle); on foot (the plaza)
      // a pickup is taken only by walking into it, within `walkPickupRadius`. Gems stay where they are, bobbing and glowing.
      pickupMagnetRadius: 2, walkPickupRadius: 1.5,
      // The cog key is a beacon: a gold-white ring pulsing out along the ground, a thin light beam straight up (unfogged: seen from far away) and
      // a bigger halo; the cog is 1.5× a gear (`types.cogKey.size` 0.8 vs a gear's ~0.52), turning slowly and bobbing.
      cogKeyBeacon: { beamHeight: 16, beamRadius: 0.09, beamColor: 0xfff0b0, beamOpacity: 0.4, ringColor: 0xffe58a, ringInner: 0.8, ringOuter: 1.0, ringGrow: 3.2, pulse: 1.2, haloScale: 1.7, sparkle: 14 },
      colors: { brass: 0xd8a640, copper: 0xb8683a, gold: 0xf0c048, dark: 0x3a2a1c, stone: 0x7c7468, violet: 0x9a6bff },
      // A pickup: `size` its radius, `reach` the pickup distance from the rider's collect point, `height` it floats at.
      types: {
        cogKey: { size: 0.8, height: 1.5, reach: 2, color: 0xf0c048, glow: 0xffd870, spin: 1.1, sound: 'cog_key_collect', label: 'cog key' },
        elixirHeal: { size: 0.46, height: 1.3, reach: 2, color: 0x44d86a, glow: 0x9dffb4, cork: 0x2e9c48, sound: 'elixir_drink', label: 'green potion' }, // GREEN potion: a round flask with a green cork; heals AJ (`fire.greenPotionHearts`)
        elixirEnergy: { size: 0.46, height: 1.3, reach: 2, color: 0x3f9bff, glow: 0x9ccfff, crystal: 0x7fd0ff, sound: 'elixir_drink', label: 'blue potion' }, // BLUE potion: a tall flask with a blue crystal stopper; rests the horse (`fire.bluePotionEnergy`)
        gem: { size: 0.4, height: 1.2, reach: 2, color: 0x2f86ff, color2: 0x9fd4ff, glow: 0xbfe0ff, ammo: 5, sound: 'gem_collect', label: 'gem' }, // a blue diamond (two blues): 1 gem = 5 Batarang throws
        heartContainer: { size: 0.5, height: 1.4, reach: 2, color: 0xff3a52, glow: 0xff9aa8, sound: 'element_collect', label: 'heart container' },
        shield: { size: 0.6, height: 1.4, reach: 2, color: 0x6ec6ff, glow: 0xbfe6ff, rim: 0xd8a640, sound: 'element_collect', label: 'shield' },
        gearBundle: { size: 0.55, height: 1.4, reach: 2, color: 0xe2b23c, glow: 0xffe8a0, gears: 10, sound: 'gear_collect', label: 'gear bundle' },
        runeStone: { size: 0.7, height: 1.2, reach: 2, color: 0x7c7468, glow: 0xff7a2a, sound: 'element_collect', label: 'rune stone' }, // (for later levels)
        wandPiece: { size: 0.6, height: 1.4, reach: 2, color: 0x9a6bff, glow: 0xd8c4ff, sound: 'element_collect', label: 'wand piece' }, // (three form Amy's wand)
      },
      // Chests: `size` [w, h, d]; `cost` cog keys; they open on their own when the rider has the keys.
      chests: {
        small: { size: [1.4, 0.85, 1.0], cost: 1 },
        big: { size: [2.3, 1.2, 1.5], cost: 2 },
      },
      chest: {
        reach: 3.4,            // the rider within this opens it (or is told what it needs)
        openTime: 0.9, lidAngle: 1.85, beam: { height: 5, opacity: 0.4, color: 0xfff0b0 },
        riseHeight: 2.6, riseTime: 1.0, hold: 0.35, // the item floats up, then is collected
        redTime: 0.9, redColor: 0xff2a1c, hintGap: 2.0, // too few keys: it glows red this long; the hint repeats at most this often
      },
    },
    // The Fire Element's level (part2/fire.js): the furnace city ride (the Gearhaven ride's own
    // machinery on a new layout: conveyors, steam vents, rails, gears), scout robots, a chest plaza,
    // sword robots and the Furnace Guardian in a sealed circular plaza; then the Fire Element.
    // Hearts at zero in Part 2 (Part2.down): `time` s on the floor (the fall plays once, controls and buttons locked, nothing can hurt him), then the
    // revive (hearts full, the revival point), `getUp` s getting up (the fall backwards), then alive with `protection` s of protection. If anything
    // fails to clear, `safety` s after the fall he is forced alive; protection never lasts longer than `invincibleMax` s (a watchdog wipes a stuck flag).
    down: { time: 2.0, getUp: 0.8, safety: 4, protection: 3, invincibleMax: 4 },
    fire: {
      accent: 0xff4a1c, accent2: 0xffa040, ember: 0x4a1608, // red-orange; the fog warms toward `ember` (`fogMix`)
      fogMix: 0.38, lightColor: 0xff7a2a,
      startAmmo: 8,           // Batarang ammo when the level starts (1 throw each; a blue gem gives 5)
      // The Furnace Guardian's HP. Tuned for auto-aim Batarangs (damage 1, capped ammo, ~100 throws a fight from the pillar gems and drops),
      // the free Gear Wheel (3 every 12 s), Fire Ball reflects (8%) and the ×1.5 stagger: a competent player needs about 2 to 3 minutes.
      fireBossHealth: 90,
      maxBatarangs: 12,       // the most Batarangs AJ can carry: blue gems are the only way to get more (nothing else ever refills them)
      // Overrides of CONFIG.part2.ride for this layout (merged in fire.js). The first 780 of the trail is
      // the first ride's shape (only one of them is ever drawn), then it carries on east and turns south
      // — all inside the map's bounds (the horse is clamped to CONFIG.world) — so section 1 reuses its
      // rails, vents and deck. Plaza on the straight (s 700–860), sword robots on the last leg.
      ride: {
        counts: { smallRobots: 6 }, // scout robots built for the ride (the pool the groups are called from)
        points: [[260, 110], [260, 300], [360, 380], [360, 540], [500, 600], [660, 600], [800, 600], [800, 140]],
        checkpoints: [0, 205, 335, 495, 625, 700, 960, 1130],
        ground: { size: [1400, 1200] },
        clock: { at: [790, 70, -260], radius: 46, slow: 0.015 },
        vents: [{ s: 50, lat: 0 }, { s: 350, lat: 0 }, { s: 580, lat: -3 }],
        hammers: [{ s: 225, phase: 0 }, { s: 250, phase: 1.6 }],
        cogPlatforms: [{ s: 388, lat: -3, dir: 1 }],
        conveyors: [{ s: [265, 281], dir: 1 }],
        saws: [{ s: 304, phase: 0 }, { s: 318, phase: Math.PI }],
        rails: [
          { group: 'a', s: [148, 204], lat: -4, h: 1.1 }, { group: 'a', s: [148, 204], lat: 0, h: 1.1 }, { group: 'a', s: [148, 204], lat: 4, h: 1.1 },
          { group: 'u', s: [355, 436], lat: 0, h: 3.2, upper: true },
        ],
        grind: { upperSnap: 2 }, // the second steam vent lands on the upper rail within 2 vertical units
        gears: {
          // (scarce on purpose: a Gear Wheel costs 6, so about every 6th gear collected is one shot — about 33 gears in all)
          rows: [[28, 44, 0, 3], [660, 676, 0, 2], [740, 850, 0, 4], [1000, 1060, 0, 3], [1140, 1200, 0, 3]],
          railRows: [['a', 0, 156, 170, 2], ['a', 1, 172, 184, 2], ['a', 2, 186, 200, 2], ['u', 0, 372, 428, 4]],
          deckRows: [[0, 72, 120, 2]],
          ventArc: [3, 8],
        },
        door: { s: 1318, scale: 2.4, reach: 4.5 },
        quest: 'fire',
      },
      // The Shield (found in a chest in the plaza, never at the start): tap it and he holds it up for `duration` s; a hit from the front
      // that lands while it is up is blocked (no damage); one that lands in the first `perfectWindow` s is a PERFECT block — the Guardian
      // is staggered `staggerTime` s (and takes `boss.staggerDamage`× while he is). `blocks` lists the attack sources it stops: the
      // Stomp is not one of them (it is jumped). Then `cooldown` s before it comes up again.
      // Cog keys missed on a rail, the belt deck or a conveyor belt fly to AJ when he leaves it: within `cogKeyRecallRadius` of him, at `cogKeyRecallSpeed`
      // a second (cog keys only; every other pickup keeps the small pickup radius).
      cogKeyRecallRadius: 25, cogKeyRecallSpeed: 38,
      shield: {
        color: 0x6ec6ff, duration: 1.3, perfectWindow: 0.3, cooldown: 2.2, frontDot: 0.1, staggerTime: 2.0,
        blocks: ['steam', 'fireball', 'charge', 'sword', 'scout'],
        disc: { radius: 1.05, height: 1.0, ahead: 1.1, opacity: 0.45, perfect: 0xfff2c0, pulse: 0.25 },
      },
      // Seven cog keys; two lie on the main line and five sit close enough to collect from the saddle.
      // [s, lat, height above the street]. The gate and all four chests (one holds the Shield) cost six keys in total.
      // (a key never lies under a rail or the belt deck: the one at s 120 is on the deck's top, the one at s 412 on the upper rail's line)
      keys: [[120, 0, 4], [212, 0, 0], [412, 0, 3.2], [730, -2.0, 0], [775, 2.0, 0], [835, -2.0, 0], [900, 2.2, 0]],
      // Chest rewards: a small one gives 2 elixirs (a list: healing + energy) or 3 gems, the big one +1 max heart or a gear bundle (10 gears).
      chests: [
        { size: 'small', s: 735, lat: -5.2, cost: 1, contents: [{ type: 'elixirHeal', n: 1 }, { type: 'elixirEnergy', n: 1 }], popup: 'elixirs' },
        { size: 'small', s: 780, lat: 5.2, cost: 1, contents: [{ type: 'gem', n: 3 }], popup: 'gems' },
        { size: 'big', s: 830, lat: -4.8, cost: 1, contents: [{ type: 'heartContainer', n: 1 }], popup: 'heart' },
        { size: 'small', s: 808, lat: -5.2, cost: 1, contents: [{ type: 'shield', n: 1 }], popup: 'shield' }, // the Shield chest
      ],
      // Gems for the Batarang along the whole ride: `fireGemCount` in all, spread evenly along the path (about 1 every
      // 40), on the safe line, plus on the steam-jump landings and extra in the plaza.
      // Potions: green heals AJ (+greenPotionHearts hearts, a chime and a green sparkle on him), blue rests the horse
      // (+bluePotionEnergy of its energy — out of 100 —, heals its health if it has been hurt, a splash and a blue sparkle on it).
      greenPotionHearts: 1, bluePotionEnergy: 40,
      sparkle: { count: 18, speed: 3.2, life: 0.8, size: 0.14 },
      fireGemCount: 32,          // (blue diamond gems, 5 Batarang ammo each — `items.types.gem.ammo`)
      gemLandings: [[84, 0, 4.0], [366, 0, 3.2], [610, -2, 0]], // [s, lat, height]: the belt deck, the upper rail, the street after the last vent
      plazaGems: [[704, 2.5], [722, -2.5], [752, 2.5], [768, -2.5], [800, 2.5], [815, -2.5], [845, 2.5], [858, -2.5]],
      // The cog gate across the road at the end of section 1: opens with 2 cog keys (a solid barrier till then).
      gate: { s: 440, keys: 2, openTime: 1.2, reach: 7, width: 15, height: 6, color: 0xb8803a, red: 0xff2a1c },
      // Cog Shot (a spinning cog thrown in an arc, 2 damage, spends 1 cog key) and Gear Wheel (a fast spinning wheel rolling along
      // the ground, 3 damage, spends 4 brass gears): the level's two extra weapons; Fire Blast is not: it comes with the Fire Element.
      weapons: {
        cogShot: { damage: 2, cooldown: 1.2, speed: 26, arc: 3, range: 26, forward: 14, size: 0.5, keys: 1, color: 0xf0c048, roll: { flySpin: 0.6, speed: 11, decel: 4.5, fallSpeed: 2.5, gravity: 18, landBounce: 2.2, wobble: 0.6, wobbleRate: 22, wobbleAmp: 0.4, fall: 0.35, fade: 0.5 } }, // (an upright coin: thrown in an arc, one bounce, rolls on its edge slowing down, wobbles and falls flat, fades)
        gearWheel: { damage: 3, cooldown: 2.0, speed: 30, range: 34, radius: 1.5, height: 0.9, gears: 6, color: 0xd8a640, roll: 'gear_roll', maxBounces: 4, wheelSpeedKeepOnHit: 0.25, wheelWallBounceKeep: 0.6, hitPop: 2.6, wallPop: 1.6, gravity: 18, stopSpeed: 3, fade: 0.5, throwArc: { time: 0.32, height: 0.9, landBounce: 2.2 }, lean: { max: 0.3, rate: 1.5, ease: 8 } }, // (an upright wheel: thrown in a small arc, a little bounce, rolls spinning round its axle; a robot hit keeps `wheelSpeedKeepOnHit` of its speed and pops it up — it rolls on the same way; a wall keeps `wheelWallBounceKeep`; the Guardian stops it)
      },
      weaponImpact: { life: 0.28, flashRadius: 0.72, ringInner: 0.14, ringOuter: 0.24, sparks: 12, sparkRadius: 0.42, sparkSpeed: 3.6, sparkUp: 1.1, shake: 0.08, shakeTime: 0.18, push: 0.28, popupMargin: 32 },
      // Potions along the road: 3 green and 3 blue on the ride, 2 green in the plaza. [s, lat] — off the gem line (±1.6).
      elixirs: [
        { type: 'elixirHeal', s: 95, lat: 3.2 }, { type: 'elixirHeal', s: 520, lat: -3.2 }, { type: 'elixirHeal', s: 1090, lat: 3.2 },
        { type: 'elixirEnergy', s: 175, lat: -3.2 }, { type: 'elixirEnergy', s: 640, lat: 3.2 }, { type: 'elixirEnergy', s: 1170, lat: -3.2 },
        { type: 'elixirHeal', s: 712, lat: 0 }, { type: 'elixirHeal', s: 852, lat: 0 },
      ],
      plaza: { from: 700, to: 860, braziers: 5 },
      // Section 2: scout robots (Leela) in groups of 2 run at the horse from the front and wide.
      scouts: {
        groupSize: 2,                    // scouts called together
        triggers: [452, 508, 562, 616],  // s at which a group is called
        ahead: [42, 54], lat: 6.0,       // they start this far along the trail ahead, wide (±lat)
        speed: 14.5, hp: 2, radius: 0.5, height: 1.55, reach: 2.4, lunge: 0.35, damage: 0.25, // 2 Batarang hits
        rise: 0.9, fall: 14, despawnBehind: 26, gemChance: 0.35, grace: 1.0,
      },
      // Section 4: sword robots (Mike and Stan) patrol; at the horse they alert, sidestep, charge, wind up (a red ring) and swing.
      swords: {
        spots: [{ kind: 'swordA', s: 1000, lat: -3 }, { kind: 'swordB', s: 1060, lat: 3 }, { kind: 'swordA', s: 1135, lat: -2 }, { kind: 'swordB', s: 1200, lat: 2.5 }],
        hp: 4, radius: 0.8, height: 2.7, patrol: { range: 4.5, along: 7, speed: 1.6 },
        aggro: 24, alert: 0.55, sidestep: 0.45, sidestepDist: 3.2, chargeSpeed: 11, chargeMax: 3.2, swingRange: 3.8, windup: 0.6, recover: 1.3,
        damage: 0.5, gemChance: 0.5, ringColor: 0xff3a1c, fade: 0.9, despawnBehind: 40,
      },
      hit: {
        pad: 0.5, robotRadius: 1.5, robotFlash: 0.15,
        guardianLegs: { side: 0.85, height: 1.15, radius: 0.6 },
      }, // torso sphere for cog weapons; the Batarang / fire ball keep their padded body capsule
      // The Batarang in Part 2: 1 Batarang a throw (blue gems add them, up to `maxBatarangs`), auto-aimed at the nearest foe in front, out and back.
      batarang: { damage: 1, cooldown: 0.8, speed: 38, returnSpeed: 40, range: 25, above: 1.6, forward: 16, release: 0.24, turn: 600, color: 0xffd23f, size: 0.4, prefer: 1.6,
        coneDeg: 70, homeTurn: 2.6 }, // AUTO-AIM: the nearest foe (or the Guardian) inside a forward cone of `coneDeg` within `range` — the Batarang curves toward it at `homeTurn` rad/s; nothing in the cone: straight on
      // Fire Blast (the Fire Element's ability, not before it): a ball of fire in an arc, burns for 3 s.
      fireBlast: {
        damage: 3, burn: { time: 3, dps: 1 }, cooldown: 10, speed: 24, arc: 2.6, range: 28, forward: 14, release: 0.24, size: 0.55,
        color: 0xff6a1c, core: 0xffe08a, splash: 2.2, trail: 14, hint: true,
      },
      // The Furnace Guardian (George, the big armoured mech): `fireBossHealth`, four attacks, a sealed plaza.
      arena: {
        at: [300, 0, -60], radius: 24, wall: 23, pillars: { count: 4, ring: 13, radius: 1.3, height: 7 }, entryHearts: 1,
        spawn: [0, 17], horse: [0, 21], boss: [0, -7],   // [x, z] from the centre: AJ's entrance, the horse's place, the Guardian's
        entryProtection: 1,                              // entering the plaza clears every protection flag, then protects him this long at most (s)
        stayIn: 1.4,                                     // while the Guardian stands nobody leaves: AJ is kept this far inside the wall
        gate: { width: 9, close: 1.4, steam: 40 },       // the steam barrier at the entrance (z+): closes when the Guardian notices AJ
        notice: 22,                                      // the Guardian notices AJ within this
        // AJ has no melee, so he never runs dry: 3 blue gems (+`arenaGemAmmo` Batarangs each) lie by the pillars at the start and a new one
        // appears at a random pillar every `arenaGemRespawn` s (at most `arenaGems` on the floor at once); the Gear Wheel recharges for free
        // in the plaza (`arenaGearWheelCooldown` s, no gears); a perfect block drops one more gem (`staggerDrop`, up to 4 a fight) and
        // at `potionMark` of the Guardian's health a green potion appears.
        arenaGems: 3, arenaGemRespawn: 12, arenaGemAmmo: 5, arenaGemOffset: 2.2,
        arenaGearWheelCooldown: 12,
        staggerDrop: { max: 4, ahead: 4 },
        potionMark: 0.5,
        ammoMin: 6, ammoMax: 10,                         // entering the plaza: the ammo kept from the ride, topped up to at least 6 and held to at most 10
        protection: 3, reviveRecover: 0.5, reviveAmmo: 6, retreat: { speed: 7, far: 0.8 },
        openTime: 1.6, pedestalTime: 2.2,
      },
      boss: {
        staggerDamage: 1.5, staggerDuration: 1.5, // damage ×1.5 while a perfect block has staggered him, and for how long by default
        radius: 2.6, height: 6.5, walk: 3.4, walkEnraged: 4.6, enrageAt: 0.5, turn: 2.2,
        glow: { color: 0xff5a1c, tint: 0.5, furnace: { size: 0.9, up: 0.64, out: 0.7 } },
        recover: 1.4, recoverEnraged: 0.8,
        // Stomp: rears up, slams; a shockwave ring spreads — AJ must be off the ground when it passes (jump).
        stomp: { range: 15, windup: 1.5, speed: 10, width: 1.5, maxRadius: 18, fireWaveMaxRadius: 13, fireWaveInterval: 4.2, damage: 0.5, jumpClear: 0.55, shake: 0.35 }, // (a 1.5 s telegraph ring + a rising warning sound; a jump clears the ring; half a heart)
        // Steam Burst: a cone of steam from the furnace (telegraphed on the floor), half a heart (once per burst).
        steam: { min: 3, max: 13, windup: 1.1, duration: 1.4, length: 12, angle: 0.8, damage: 0.5, cooldown: 4 },
        // Furnace Charge: head down, a pause, a straight rush; into a pillar it stuns itself (taking extra damage).
        // Fire Ball (longer range): he fires a ball of fire from the furnace at where AJ stands; a jump clears it; 1 heart.
        fireball: { min: 9, max: 26, windup: 0.9, speed: 15, damage: 1, radius: 1.1, clearHeight: 1.0, life: 3, cooldown: 5, size: 0.7,
          splashRadius: 2.0, pillarPad: 0.25,     // bursts on a pillar or wall; AJ is only hurt inside the splash with a clear line to him
          shieldReflectDamage: 0.08, reflectSpeed: 1.4 }, // a PERFECT block sends it back at the Guardian: 8% of his max health, then he is staggered
        charge: { min: 6, windup: 1.2, speed: 17, max: 30, stun: 3, stunDamage: 1.5, hitRadius: 2.6, damage: 1, knock: 6, cooldown: 5 },
        wheelAvoid: { range: 6, lateral: 4.2, cooldown: 4, duration: 0.55, height: 1.3 },
        hurtFlash: 0.12, deathTime: 2.4,
      },
      // Tick calls out each attack's windup with small chirps.
      // The Fire Element: a swirling orb of flame on a pedestal that rises when the Guardian falls.
      element: {
        orb: { radius: 0.85, particles: 36, swirl: 1.8, height: 1.7, glow: 3.2 },
        pedestal: { radius: 1.5, height: 1.0, rise: 2.0 },
        scene: { pull: 1.6, flash: 0.5, eyes: 0.9, tower: { at: [-26, 14, -30], scale: 2.4, vanish: 0.9 } }, // the hooded figure on a distant tower
        shots: {
          orb: { dist: 5.2, up: 1.6, look: 1.2, duration: 1.4 },
          circle: { dist: 4.6, up: 1.5, look: 1.3, turns: 0.55, duration: 3.0 },
          tower: { dist: 9, up: 2.4, duration: 1.4 },
        },
        bannerMs: 2800,
      },
      debug: { plazaKeys: 2, plazaCheckpoint: 5, bossAmmo: 10, startKeys: 3, startGems: 20, startGears: 30 }, // ("Fire level (start)": 3 cog keys, 20 gems, 30 brass gears)
      // ("Fire plaza chests": at the plaza with `plazaKeys` keys; "Fire boss": `bossAmmo` gems)
    },
    music: 'gearhaven',
    // The gear props (part2/props.js): each a regular shape (centred, axle along +Z, radius 1)
    // from the props folder or the Factory Kit's cogs; brass / copper by instance colour.
    props: {
      shapes: {
        gear01: ['props', 'gear_01'], cluster: ['props', 'gear_cluster'], spiky: ['props', 'gear_spiky'], collectible: ['props', 'gear_collectible'],
        cogA: ['factory', 'cog-a'], cogB: ['factory', 'cog-b'], cogC: ['factory', 'cog-c'], cogD: ['factory', 'cog-d'], cogE: ['factory', 'cog-e'],
      },
      metals: { brass: 0xd8a640, copper: 0xb8683a, darkBrass: 0x8c6a32, gold: 0xf0c048 },
      emissive: 0x140c04,
    },
    // The clock tower (part2/clockTower.js; built in code): on the skyline of the courtyard
    // (toward the Time door) and the ride, and at the Time Element's place.
    clockTower: {
      base: { steps: [[16, 1.2], [13.5, 1.0], [11.5, 0.8]] },  // [width, height] of each step
      shaft: { width: 9, height: 38, pilaster: 1.1, bands: 3, windows: 4 },
      stage: { width: 11, height: 11, face: 4.4 },               // the clock stage, a face on each side
      roof: { height: 15, spire: 6 },                             // the pointed brass roof and its spire
      gears: { count: 6, ring: 9.6, radius: 3.4, up: 0.7, speed: 0.25, shapes: ['cogA', 'cogC'], metals: ['brass', 'copper'] }, // turning round the base
      minutesPerSecond: 3, startMinute: 130,
      courtyard: { dist: 112, scale: 1 }, // toward the Time door, this far from the courtyard's centre
      ride: { at: [470, 0, 405], scale: 1.1 },
      time: { back: 26, scale: 0.55 },    // behind the Time Element's platform
    },
    // The distant brass city (part2/skyline.js): Castle Kit towers and walls tinted brass, pipes
    // and chimneys with slow steam; no collision. A cluster per spot: towers `scale` big, stacked
    // from the kit's pieces (`mids` middle pieces), a wall, a chimney and a pipe.
    skyline: {
      seed: 21, scale: [7, 11], hexShare: 0.3, twinShare: 0.55,
      towers: { square: ['tower-square-base', 'tower-square-mid', 'tower-square-roof'], hexagon: ['tower-hexagon-base', 'tower-hexagon-base', 'tower-hexagon-roof'], mids: [1, 3] },
      wall: 'wall', pipe: 'pipe-large-long',
      chimney: { height: [3.5, 5.5], radius: 0.35 },
      steam: { perChimney: 3, life: 7, every: 7, grow: 2.2, rise: 9, drift: [4, 1.5], color: 0xfff1e0, opacity: 0.32 },
      courtyard: { count: 14, radius: [108, 140], clearOfLevels: 0.55, clearOfTower: 40 }, // (none toward the level platforms at +x, nor at the clock tower)
      ride: { every: 66, lat: [72, 110], minClear: 55 },
    },
    // The first playable section (part2/ride.js; behind the courtyard's Fire door): a ride
    // through a brass city on the trail / spline system — copper rooftops, turning cogs on the
    // building fronts, steam vents, gears floating in a warm gold sky, the Dream Clock far off —
    // with rails to grind, steam vents that launch the horse, swinging hammers, turning cog
    // platforms and conveyor belts (a hit staggers the horse: no hearts — hearts are only lost to
    // enemies), brass gears to collect (the currency, like gems in Part 1), checkpoints, and the
    // Fire Element's door at the end (its stub: "coming soon"). Positions along the trail are
    // `s` (from its start) and `lat` (signed, + = right of travel).
    ride: {
      points: [[260, 110], [260, 300], [360, 380], [360, 540], [500, 600], [660, 600]], // the trail (~779 long), corners rounded at track.cornerRadius
      wall: { offset: 7.3, height: 7 }, // invisible side walls along the whole ride (the horse rails along them)
      checkpoints: [0, 205, 335, 495, 625], // s of each (the first is the start)
      checkpointSide: 8.6, // the flag stands this far right of the centre
      sky: { fog: { near: 45, far: 260 } }, // the fog's reach on the ride (its colour, the sky, the lights: the look's)
      ground: { size: [900, 760] },   // the far land (the look's ground colour; the city floor is silver: part2.floor)
      street: { curbHeight: 0.35 },
      city: {
        step: 9, rows: [[12, 22], [26, 40]], height: [6, 20], depth: [7, 11], width: [6, 9], // buildings either side, outside the corridor
        patinaShare: 0.3, seed: 7, // (their stone, roofs and windows: the look's palette)
      },
      // Turning gears (part2/props.js shapes, brass or copper): on the building fronts facing the
      // trail, lying beside the curbs, and floating in the sky.
      cogs: { every: 26, lat: 11.6, radius: [1.6, 3], height: [3, 9], speed: [0.4, 1.1], shapes: ['cogA', 'cogC', 'cluster'], metals: ['brass', 'copper'] }, // (few shapes: one draw each; gear_01 is 1.7k triangles: only in the sky)
      floorGears: { every: 34, lat: 8.6, y: 0.08, radius: [1.1, 1.8], speed: 0.5, shapes: ['cogC', 'cogA'], metals: ['copper', 'brass'] },
      skyGears: { count: 9, radius: [10, 26], height: [45, 75], spread: 140, speed: [0.03, 0.09], shapes: ['gear01', 'cluster'], metals: ['darkBrass', 'brass', 'copper'] },
      clock: { at: [720, 70, 900], radius: 46, slow: 0.015 }, // the Dream Clock, far off past the end
      // Rails: grind along automatically (`grind.speed`, faster than the street) with sparks and a
      // steel scrape; steer to hop to the next rail of the group; Jump to leave; off the end the
      // horse hops down. Low rails rise from the street on a short ramp (ride or jump onto them);
      // the upper rail is reached only from a steam vent. Low rails are fences on the street.
      rails: [
        { group: 'a', s: [148, 204], lat: -4, h: 1.1 }, { group: 'a', s: [148, 204], lat: 0, h: 1.1 }, { group: 'a', s: [148, 204], lat: 4, h: 1.1 }, // (just past the belt deck: dropping off its end, the street then the ramps)
        { group: 'u', s: [362, 436], lat: 0, h: 4.2, upper: true },
        { group: 'b', s: [642, 735], lat: -2.6, h: 1.1 }, { group: 'b', s: [642, 735], lat: 2.6, h: 1.1 },
      ],
      grind: {
        speed: 22, maxSpeed: 30,  // grinding speed (at least this, at most maxSpeed)
        ramp: 6,                  // low rails rise from the street over this length
        capture: 2.2, above: 0.7, // landing on a rail: within this of its line
        switchTime: 0.32, switchArc: 0.9, switchStick: 0.55, // hopping across to the next rail
        hopOff: 7,                // the hop when leaving a rail (Jump or its end)
        radius: 0.11, color: 0xd8dde2, post: 0x5a4a3a, postEvery: 6, gantryEvery: 12, gantryHalf: 8.6,
      },
      // The rails' look (loadRailModel): the Coaster Kit's Monorail and Steel track styles (not
      // Wood or Flume) — each group of rails one style (`groups`), Monorail tinted brass, Steel
      // copper — on dark bronze supports. Per style: its pieces (`straight`, the hill beginning +
      // end as each low rail's `slope`), the kit's piece `length` 4, laid `span` long each along
      // the trail (Steel stretched to 8: half the triangles), its top `drop` under the piece's
      // origin, `depth` deep. The track's top lies `lift` over the grind line. Tubes if it fails.
      railKit: {
        styles: {
          monorail: { straight: 'coaster-monorail-straight', slope: ['coaster-monorail-straight-hill-beginning', 'coaster-monorail-straight-hill-end'], length: 4, span: 4, drop: 0.8, depth: 0.23, tint: 'railBrass' },
          steel: { straight: 'coaster-steel-straight', slope: ['coaster-steel-straight-hill-beginning', 'coaster-steel-straight-hill-end'], length: 4, span: 8, drop: 0.7, depth: 0.3, tint: 'railCopper' },
        },
        groups: { a: 'monorail', b: 'steel', u: 'steel' }, // (the three low rails Monorail; the pair and the upper rail Steel)
        support: 'support-small', post: 'support-large', beam: 'support-large-horizontal', supportTint: 'railSupports',
        lift: 0.06,
      },
      // The Factory Kit along the street (loadFactoryDecorModel; tinted brass and copper): side
      // decoration outside the walls ([piece, scale]), each steam vent's pipes, the conveyor belts
      // (`belt` sections `beltLength` long laid across the trail, `beltRow` deep, let in `beltSink`)
      // and the gear deck's catwalk (along its x, `catwalkWidth` wide); a belt deck's belt sections
      // are `beltDeckRow` deep (`beltDeckAcross` across it), on a dark frame `beltFrame` thick, the belt's top `beltTop` over a
      // section's origin (so the top is at the deck's height).
      factory: {
        decor: [['machine', 2.2], ['machine-fortified', 2.1], ['box-large', 2.4], ['box-long', 2.4], ['hopper-high-round', 2.2], ['hopper-high-square', 2.2], ['crane', 1.7], ['robot-arm-a', 1.5], ['machine-window', 2.2]],
        decorStart: 12, decorEnd: 30, decorEvery: 11, decorLat: [9.2, 10.6], decorClear: 7, seed: 11, chunk: 200,
        pipe: 'pipe-large', pipeLong: 'pipe-large-long', valve: 'pipe-large-valve', pipeLat: 8.4, pipeScale: 0.9, runSections: 5, stackHeight: 6,
        belt: 'conveyor-long-stripe-sides', beltLength: 2, beltCount: 4, beltRow: 8, beltSink: -0.34,
        catwalk: 'catwalk-straight', catwalkLength: 3, catwalkWidth: 1.26, catwalkHeight: 1.3,
        beltDeckRow: 14, beltDeckAcross: 3, beltFrame: 0.5, beltTop: 0.3,
      },
      sparks: { max: 90, perSecond: 70, life: 0.35, speed: 4, size: 0.09, color: 0xffc24a, hot: 0xfff2c0 },
      // Lamp posts along the street, just outside the curbs (their heads glow; the look's point lights sit on the nearest).
      lamps: { every: 30, lat: 8.1, height: 4.2, head: 0.28, halo: 1.1, clear: 4 },
      // Steam vents on the street: stepping on one launches the horse high (a puff, a whoosh).
      vents: [{ s: 50, lat: 0 }, { s: 350, lat: 0 }, { s: 580, lat: -3 }], // (the first on the centre line, 8 before the belt deck)
      // The ride's steering feel (the horse's `steering` override, only on this ride): a stick mostly pushed up never steers
      // (`steerAngleDeadzone`: sideways must exceed this × the forward push, and `steerDeadzone` 0.15), past it steering eases in with a low
      // `turnGain` and `steerSmoothing`, and with the stick centred it straightens back to the track at once (`straighten`, `assistBoost`× path assist).
      steering: { steerDeadzone: 0.15, steerAngleDeadzone: 0.45, steerSmoothing: 5, straighten: 10, turnGain: 0.8, assistBoost: 2.5 },
      // Pickups on the ride: collected within `rideMagnetRadius` of the rider; one lying within that of his lane (and up to `rideMagnetAhead` ahead,
      // `rideMagnetBehind` back) drifts toward the lane at `rideMagnetPull` a second, so he never needs to turn round for it.
      rideMagnetRadius: 3, rideMagnetAhead: 9, rideMagnetBehind: 1.5, rideMagnetPull: 4,
      vent: { radius: 2.6, align: { range: 3.4, rate: 4, look: 130 }, launch: 16, cooldown: 1, catchHeight: 2.2, glow: 0xfff0d0, puff: 14, stackPuff: 5 }, // (catchHeight: a horse hopping over it up to this high is launched too; stackPuff: puffs from each of its pipe stacks)
      steam: { puffs: 70, life: 1.6, rise: 3.2, size: [0.6, 1.6], idleEvery: 1.3 }, // (warm white, lit: the look's `steam`)
      // The belt deck: a conveyor belt hanging 4 up, wall to wall (`width`), 8 past the first
      // steam vent — reached from it at any speed (a launch lands at ~66 riding, ~83 galloping,
      // ~90 with a jump into the steam), 82 long (~4 s of riding on it at the normal top speed, ~3 s
      // easing off from a gallop).
      // Its top is solid at its height; the belt (`belt`: its direction, − = to the left) carries
      // the horse sideways at `conveyor.speed`, up against the side wall and a railing on that
      // edge — never off it. Its gears on top.
      decks: [{ s: [58, 140], lat: 0, width: 13.8, top: 4.0, belt: -1 }],
      // Landing on a deck: its top is solid — a horse coming down through it lands on it from up
      // to `catch` below its top (so a fast fall never steps through it in one frame); coming down
      // within `snap` of its edge it is snapped onto it (pulled `inset` inside); riding off its
      // end it holds `coyote` s before dropping.
      deckAssist: { catch: 0.75, snap: 1.5, inset: 0.6, coyote: 0.2, coyoteReach: 8 },
      deckFade: { opacity: 0.18, above: 1.2, rate: 6 }, // the deck fades while the camera is under it (or within `above` over its top)
      // Hazards (a hit staggers the horse, never costs a heart).
      hammers: [{ s: 225, phase: 0 }, { s: 250, phase: 1.6 }, { s: 540, phase: 0.8 }],
      hammer: { pivot: 7.6, arm: 6, amp: 1.05, period: 3.0, head: [1.6, 1.3, 1.6], reach: 1.6, push: 7, gantryHalf: 8.6 },
      cogPlatforms: [{ s: 388, lat: -3, dir: 1 }, { s: 412, lat: 3, dir: -1 }, { s: 565, lat: 0, dir: 1 }],
      cogPlatform: { radius: 3.6, speed: 0.9, height: 0.12, teeth: 14 },
      conveyors: [{ s: [265, 281], dir: 1 }, { s: [505, 521], dir: -1 }],
      conveyor: { speed: 6, slat: 0.9 },
      // Spinning saws (the spiky gear): a blade standing in a slot across the street, sliding from
      // side to side (`travel` either way, one round trip every `period` s), spinning; touching it
      // staggers the horse and knocks it aside (never a heart); a jump clears it.
      saws: [{ s: 304, phase: 0 }, { s: 318, phase: Math.PI }, { s: 468, phase: 1.2 }],
      saw: { radius: 1.25, sink: 0.3, thickness: 0.22, travel: 4.4, period: 3.6, spin: 10, reach: 1.0, push: 6, slotWidth: 0.4, color: 0xb9c0c8, emissive: 0x141418 },
      stagger: 0.9,               // seconds of stagger (slower) after a hit
      hitCooldown: 1,             // a hazard can hit again after 1 s (its own timer — nothing else can hold a hit off)
      hazard: { step: 0.5, maxSweep: 8, bodyHalfLength: 0.8 }, // the horse's whole body is tested along its swept path (sub-steps of `step`; a teleport longer than `maxSweep` isn't swept)
      // Brass gears: the currency (like Part 1's gems), on the rails, the deck and above the vents.
      gears: {
        size: 0.42, fit: 1.25, color: 0xe2b23c, spin: 1.6, // (its glow and halo: the look's `gears`)
        bob: 0.12, reach: 1.7, pop: 0.35, // (fit: the collectible model's radius × size)
        sparkle: { max: 48, count: 10, life: 0.55, speed: 3.2, size: 0.09, color: 0xfff2b0 }, // a sparkle burst on pickup
        rows: [[28, 44, 0, 4]], // street rows: [s0, s1, lat, count]
        railRows: [['a', 0, 156, 170, 3], ['a', 1, 172, 184, 3], ['a', 2, 186, 200, 3], ['u', 0, 372, 428, 6], ['b', 0, 652, 676, 3], ['b', 1, 684, 708, 3], ['b', 0, 714, 730, 2]], // [group, index in the group, s0, s1, count]
        deckRows: [[0, 72, 120, 3]], // [deck, s0, s1, count]
        ventArc: [2, 5, 8, 11],     // above each vent: gears along the launch arc this far ahead
      },
      // The end: the Fire Element's door across the trail (its stub: "coming soon").
      door: { s: 765, scale: 2.4, reach: 4.5 },
      quest: 'fire',
    },
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
        file: 'skeleton.fbx', hp: 12, fit: ['y', 1.85], radius: 0.45, height: 1.85,
        damageTaken: { batarang: 12 }, // one Batarang hit kills a skeleton (it shatters: minions.shatter)
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
      horseEnergy: 5,        // a bite costs the horse this much energy (horse.drainEnergy, energy.js)
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
      // Every group rises AHEAD of the horse (never beside or behind it), this far along the trail
      // from it, spread across the trail (±`spread` of the centre line), and charges straight at
      // it — always in front of the camera.
      skeletonSpawnDistance: [30, 45],
      spread: 4.5,
      skeletonDamage: 0.25,  // hearts per skeleton hit (one lunge per skeleton; the chase's 1 s grace and half-heart floor still apply)
      lungeReach: 2.6,       // within this of the horse's body it lunges once (hit or miss), then falls away behind (no gem)
      lungeTime: 0.35,
      passBehind: 1.5,       // one that got past the horse (this far behind it) falls away too — never alongside
      passAhead: 6,          // one still rising off to the side when the horse comes within this (a gallop) sinks back
      fallSpeed: 6,          // falling away: tumbling back at this (and up at half)
      rise: 1.6,             // seconds rising from the sand
      sink: 1.2,             // seconds sinking back into it (the chase is over)
      speedFactor: 0.9,      // running at this × the horse's normal (non-gallop) top speed: a steady ride keeps them close...
      footSpeed: 7.5,        // ...and at this after a hero on foot
      attackReach: 1.4, windup: 0.45,
      gallopKnock: 1.2,      // galloping into one (this close to the horse) knocks it aside: defeated
      knockSpeed: 9,
      despawnBehind: 40,
    },
    // A skeleton killed by the Batarang or the Flash breaks apart (shatter.js): bones burst out
    // in all directions (a small physics burst, bouncing, gone after `life` s), a white-yellow
    // hit flash, sparks, and a short screen kick.
    shatter: {
      bones: 9, size: [0.22, 0.42], speed: [3, 7], up: [2.5, 5.5], gravity: 18, bounce: 0.35, spin: 12,
      life: 2, shrink: 0.5, maxBursts: 6, color: 0xe9e2cf,
      flash: { time: 0.18, size: [0.4, 1.5], color: 0xfff1b0, opacity: 0.9 },
      sparks: { count: 10, speed: 7, life: 0.4, size: 0.07, color: 0xffe28a },
      kick: 0.12,            // the screen kick (camera shake amplitude)
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
    retreat: { speed: 1.6, arrive: 0.6 }, // AJ revived in the sealed arena: backs off to the far side at walkSpeed × speed
    arenaRadius: 16.5,
    drawRange: 100,          // on guard and the hero further than this from the arena: not drawn (out of sight behind the cliffs)       // leashed: its centre never gets further than this from the arena's centre (the boulders, the barrier, the cave stay out of reach)
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
    paralysis: {
      duration: 4, bonus: 1.2, resist: 20,
      // Dazed while paralyzed: idle at half speed, the body swaying side to side, the head hung
      // low, stars circling over it; then it snaps out of it with a short roar (`wakeRoar` s,
      // inside its usual recovery — the duration and damage are unchanged).
      dazed: { idleRate: 0.5, sway: 0.12, swayRate: 1.6, headDown: 0.45, starsBob: 0.12, wakeRoar: 0.6 },
    },
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
      wakeRoar: [1.75, 2.45],       // roar: a short roar as it snaps out of the paralysis
      smokedAt: 0.35,               // hit, flinching while it coughs in the smoke
      dying: [0, 3.1],              // death: staggers, falls on its back (over stumble + fall)
      dizzyAbove: 1.0,              // dizzy stars this far above the head bone
    },
    warningColor: 0xff2020,
    girl: {
      position: [116.5, -16.5], // at the cave mouth, by the left wall of the arch
      facing: -0.65,         // looking out toward the arena centre (radians, 0 = +Z)
      color: 0x8a4fd0, hair: 0x1c1026, skin: 0xf3d2b0, get height() { return CONFIG.girlModel.height; }, radius: 0.32, appearTime: 1.2,
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
    // A desert skeleton group charging the horse: the riding camera pulls back and rises a little
    // (smoothly, and back after) so every skeleton stays in view as it comes.
    camChasePullBack: 1.6,    // extra distance
    camChaseRaise: 0.6,       // the look-at point (and so the camera) this much higher
    camChaseBlend: 1.2,       // how quickly it eases in / out (1/s)
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
      // Part 2's fighting levels (the Fire level): only the buttons they have — Jump / Gallop, the
      // Batarang and Fire Blast (in the spots Smoke Bomb and Flash have in Part 1).
      foot2: { jump: [166, 60, 62], mount: [100, 135, 62], batarang: [230, 104, 58], fireBlast: [204, 190, 58], shield: [233, 24, 58], cogShot: [136, 208, 58], gearWheel: [60, 215, 58] },
      ride2: { gallop: [66, 66, 80], jump: [166, 60, 62], batarang: [222, 130, 58], fireBlast: [140, 160, 58], shield: [233, 24, 58], cogShot: [60, 170, 58], gearWheel: [200, 214, 58] },
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
    infoMs: 250,             // the panel's live lines ("Invulnerable: no", "Hero state: alive") refresh this often
    param: 'debug',
    holdSeconds: 3,          // holding the HUD speaker button this long switches the test menu on / off...
    storageKey: 'dreamerHero.testMenu', // ...remembered here (localStorage, try/catch)
    vibrate: 60,             // ms buzz confirming the switch (where the phone supports it)
    abilityUses: 5,
    caveApproach: 45,        // "Cave entrance": on the horse this far from the arena centre (it auto-dismounts at boss.dismountRange)
    hurdleApproach: 30,      // "Forest hurdles": on the horse this far before the first hurdle (it's right there, in view)
    giveKeys: 3,             // "Give 3 cog keys": the Fire level's chests
    giveGears: 14,           // "Give 14 gears": collects this many of the Gearhaven ride's gears (the first reward tier of 42)
  },

  cutscene: {
    fadeMs: 450,       // fade between slides
    swirlMs: 1600,     // swirl transition into the dream world
    nodSeconds: 3.2,   // one slow head-nod cycle on the drowsy slide
  },

  // Sound (audio.js AudioManager, sfx.js / music.js synthesized fallbacks, soundscape.js wiring).
  audio: {
    volumes: { master: 1, music: 0.5, effects: 0.8, voices: 0.85 }, // defaults (the speaker panel saves the player's own)
    storageKey: 'dreamerHero.audio', // localStorage (try/catch: private modes may refuse)
    extensions: ['ogg', 'mp3'],      // looked for in this order in public/audio/ (only files the build saw)
    maxVoices: 24,           // one-shots at once; when full, the quietest one goes first
    voiceStealFade: 0.04,    // s: a dropped one-shot fades out this fast
    throttle: {              // min seconds between two plays of the same name (repeats like footsteps)
      default: 0.03, aj_land: 0.25, river_splash: 0.6, skel_walk: 0.14, boss_step: 0.2, melee_hit: 0.05,
      gem_collect: 0.04, heart_lost: 0.15, heart_gained: 0.18, horse_neigh: 1.5, horse_scream: 1.5, horse_snort: 1, horse_eat: 2.5,
      skel_rattle: 0.6, slime_squelch: 0.25, bat_hit: 0.08, skel_hit: 0.08, boss_hurt: 0.12, ability_empty: 0.25,
      amy_gasp: 4, aj_hup: 0.3, aj_hya: 0.25, aj_ugh: 0.4, boss_roar: 1.5, thunder_soft: 2, rock_rumble: 0.5,
      gear_collect: 0.03, gear_whoosh: 0.12, steam_vent: 0.25, hammer_swing: 0.3, robot_walk: 0.12, boss_mech_step: 0.25, rail_land: 0.1, rail_leave: 0.2, horse_stumble: 0.4,
    },
    // 3D feel for effects with a position: quieter with distance from the camera, panned left / right.
    distance: { ref: 5, rolloff: 1.1, max: 90, pan: 0.85 },
    music: {
      fade: 2,               // s crossfade between sections (and layers in / out)
      duck: 0.4,             // the music drops by this much during voice lines and cutscenes...
      duckIn: 0.25, duckOut: 0.9, // ...ramping down / back up over these (s)
      lookahead: 0.25,       // s of notes scheduled ahead (the synthesized tracks)
      bossIntenseBelow: 0.5, // the boss track's stronger layer below this share of its health
      sandstormAt: 0.45,     // storm strength from which the chase becomes the "sandstorm" section
      batRange: 40,          // a bat this close and attacking / waiting → the bat-attack music
      bossRange: 45,         // within this of the arena (boss alive) → the boss music
      // The section for each part of the story (see soundscape.js).
      phases: {
        title: null, town: 'forest', forest: 'forest', bats: 'bats', boss: 'boss', afterBoss: 'pit', girlScene: 'pit', desertTired: 'pit', pit: 'pit', chase: 'chase', sandstorm: 'sandstorm', gate: 'gate', ending: 'ending', gameover: null,
        // Part 2 (the portal scene ends Part 1; the rest is set by the Part 2 chapter: soundscape.musicPhase)
        part2Portal: 'part2Portal', gearhaven: 'gearhaven', gearhavenChase: 'gearhavenChase', part2End: 'part2End',
        elementFire: 'elementFire', elementLightning: 'elementLightning', elementSteam: 'elementSteam', elementMagnet: 'elementMagnet', elementTime: 'elementTime',
        amyTheme: 'amyTheme', finalFight: 'finalFight',
        stub: 'gearhaven', // (a level that is still a stub reuses the Gearhaven theme)
      },
    },
    loops: {                 // pulse loops: one hit every `period` s (÷ rate)
      hoof_walk: { period: 0.42, volume: 0.45 }, hoof_trot: { period: 0.3, volume: 0.55 }, hoof_gallop: { period: 0.36, volume: 0.7 },
      bat_flap: { period: 0.13, volume: 0.35 }, low_health_beat: { period: 1.15, volume: 0.5 },
      horse_breath: { period: 0.75, volume: 0.6 },
      // Part 2: the slow two-note tick-tock (one tick + one tock a period), the horse's brass plates clinking at a trot
      clock_tick: { period: 1.0, volume: 1 }, horse_clank: { period: 0.32, volume: 0.6 },
    },
    // The river: a soft splash as the horse first enters the water (at most one per
    // throttle.river_splash 0.6 s) and a very quiet wash while it stays in (river_flow), both
    // at this volume.
    riverSoundVolume: 0.35,
    // The sandstorm's wind loop: only a soft low breeze (× the storm's strength), well below the music.
    sandstormVolume: 0.15,
    // The horse's voice: while galloping a call (horse_neigh or horse_scream, never the same
    // twice in a row) every horseCallMin…horseCallMax s, never during dialogue; calls at moments
    // (a bat attacking, a stumble, the boss's roar, a big landing, a skeleton group rising, riding
    // into the sandstorm); heavy breathing (horse_breath) while its energy is below `lowEnergy`.
    horseCallMin: 8,
    horseCallMax: 15,
    horse: { callGap: 1.2, volume: 0.8, lowEnergy: 0.25, bigLanding: 0.45, groupGap: 3, stormAt: 0.5, bossRange: 45 },
    gait: { walkMax: 4.5, trotMax: 19, gallopMin: 19, rateRef: { hoof_walk: 3, hoof_trot: 12, hoof_gallop: 26 }, rateClamp: [0.6, 1.7] },
    voice: {
      charsPerBlip: 2,       // one blip every this many typed letters (spaces and punctuation skipped)
      pan: 0.8,              // a speaker whose place is known (Part 2: Tick, AJ) is panned toward where they stand, this much of the full pan
      characters: {          // the synthesized "talking" blip per character
        aj: { freq: 330, jitter: 0.12, type: 'square', volume: 0.22, length: 0.06, formant: 1400 },
        amy: { freq: 440, jitter: 0.08, type: 'sine', volume: 0.2, length: 0.075, formant: 2200 },
        boss: { freq: 85, jitter: 0.1, type: 'sawtooth', volume: 0.35, length: 0.11, formant: 500 },
        // AJ weak and grunting (the Lazarus Pit's "I'm ok."): lower, slower, longer blips (own charsPerBlip).
        ajWeak: { freq: 175, jitter: 0.05, type: 'square', volume: 0.2, length: 0.14, formant: 650, charsPerBlip: 3 },
        // Tick: a high, cute, quick chirp-blip per letter — the tick_beep sound (its file if there is one)
        tick: { sound: 'tick_beep', freq: 1400, jitter: 0.08, type: 'square', volume: 0.14, length: 0.045, formant: 3600, charsPerBlip: 1 },
        // Amy in Part 2: softer and cooler than in Part 1 — lower, slower, longer, hushed (a breathy low-pass)
        amy2: { freq: 330, jitter: 0.05, type: 'sine', volume: 0.13, length: 0.11, formant: 1300, charsPerBlip: 3 },
      },
      speakers: { hero: 'aj', aj: 'aj', girl: 'amy', boss: 'boss', tick: 'tick', hooded: 'amy' }, // cinematic speaker key → character
    },
    gemPitch: { yellow: 1, blue: 1.26, pink: 1.5 },
    bossStepShake: 0.05,     // the camera shake linked to each heavy boss step (units)
    bossStepEvery: 0.62,     // s between boss steps while it walks (÷ speed factor)
    regenEvery: 2.5,         // s between the soft regen shimmers
    eatEvery: 3,             // s between munches while grazing
    skelRattleEvery: [3, 6], // s between rattles of a running skeleton (random)
    slimeEvery: 1.2,         // s between squelches of a hopping slime
    testLoopSeconds: 2.5,    // ?debug audio test panel: a loop plays this long
  },

  ui: {
    rotateCheckMs: 250,
    bossBarRecheck: 30,      // frames between checks that the boss bar fits the top row (else a second row)
    hintHideMs: 8000,      // controls hint fades after this long
    toastMs: 2000,
  },

  // The girl is Amy (Mixamo Ch46, public/models/girl/: girlModel.js), as she comes. Her
  // skeleton is in centimetres under a 0.01 root (scripts/girl-to-glb.mjs), like the animation
  // FBX files, so they retarget onto it unchanged.
  girlModel: {
    path: 'models/girl/',
    file: 'girl.glb',        // meshopt-compressed; its embedded clip is the idle
    // Drawn at girlHeightRatio × AJ's drawn height (heroModel.height): riding, at the cave, the
    // Lazarus Pit and the castle gate alike.
    get height() { return CONFIG.heroModel.height * CONFIG.girlHeightRatio; },
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
    eyes: { up: 0.091, apart: 0.042, back: 0.0, size: 0.018, color: 0xb04dff, opacity: 0.75, coreOpacity: 0.95, halo: 2.3, haloOpacity: 0.4, refHeight: 1.62 }, // (offsets measured with her 1.62 tall; scaled to her height)
  },
  girlHeightRatio: 0.9,      // Amy is 90% of AJ's height (girlModel.height, the placeholder girl too)
  girlWitchForm: false,      // hook for her later transformation: eyes glow and the wall shadow keeps the hat and staff
  girlEyeGlow: false,        // Amy's purple-pink eye glow: off everywhere (the cave hint keeps its wall shadow and sound); on brings it back

  // The horse model (public/models/horse/horse.gltf: horseModel.js), animated by speed.
  // Collision, steering, hop, gallop and stamina stay in `horse` below.
  horseModel: {
    file: 'models/horse/horse.gltf',
    backHeight: 1.65,        // top of the back at the saddle, above the hooves (AJ is 1.8 tall)
    textureMax: 1024,        // any embedded textures are downsized to this (this horse has none: flat colours)
    crossfade: 0.25,         // seconds to blend between gaits
    seatBone: 'Torso2',      // the saddle rides on this back bone (follows the gallop's rocking)
    saddleOffset: [0, 0.02, 0.05],     // AJ's hips relative to the top of the back over seatBone (x, y, z; +z forward)
    passengerOffset: [0, 0.04, -0.56], // the girl's hips, same frame, behind him (a little further back: she is 90% of AJ's height)
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
    drinkBlend: 0.85,        // drinking at an oasis: this much of the graze clip (head down) over the slow walk
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
    at: [],                  // target positions (fraction of the track) — none now: the forest hurdles (hurdles.js) replaced the logs and the rock wall
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

  // Forest hurdles (hurdles.js): an obstacle director places giant walls, sliding thorn bushes
  // and stones along the forest trail, mixed with the bat attacks (never at the same time).
  // The sealed boss arena (arena.js): when the boss notices AJ, the entrance closes behind him
  // with a rock barrier until the boss is dead. Only AJ fights; Amy watches from her corner at
  // the cave mouth (beyond the boss's leash); the horse waits inside by the entrance.
  arena: {
    barrierCloseDelay: 2,    // seconds after the boss notices him (the horse walks in meanwhile)
    closeTime: 0.9,          // the rocks rise this long...
    openTime: 1.2,           // ...and sink again this long when the boss dies
    barrier: { rocks: 5, radius: 1.75, height: 5.2, span: 5.9, color: 0x6d6560 }, // across the opening (between the entrance pillars)
    clearIn: 3.5,            // closing: anything standing in the gateway is moved this far inside
    shake: { amp: 0.35, time: 0.7 },
    dust: { count: 26, size: [0.8, 1.8], speed: 3, life: 1.3, color: 0xa89a88, opacity: 0.55 },
    respawn: [-14, 3],       // AJ revives here inside the arena (offset from its centre), facing the cave
    // A revive in the sealed fight (after a death; a respawn is still used): full hearts, a refill
    // of every ability (reviveUses uses each, the Flash bar full), protected for
    // arenaReviveProtection s while the boss backs off to the far side, and the boss gets back
    // only bossReviveRecoverFraction of the damage he dealt it (no full reset).
    arenaReviveProtection: 3,
    // The boss regenerates in the sealed fight once AJ hasn't hurt it for bossRegenDelay s (any
    // hit stops it and restarts the wait): bossRegenPercentPerSec % of its max health a second
    // (1.5 → ~67 s from empty to full), paused while paralysed / coughing in the Smoke, dying,
    // or in a cutscene, never above max. Its health bar pulses green with a "+" meanwhile.
    bossRegenDelay: 4,
    bossRegenPercentPerSec: 1.5,
    bossReviveRecoverFraction: 0.5,
    reviveUses: 5,           // Batarang 5, Smoke Bomb 5, Flash 5 (more on hand is kept)
    farSide: 0.85,           // the boss backs off to this fraction of its leash, opposite AJ
    reviveGlow: { intensity: 0.45, pulse: 0.3, rate: 1.2, fadeOut: 0.5 }, // his soft golden glow while protected
    amyGlow: { time: 1, arc: 2.2, size: 1.1, color: 0xffd36a, opacity: 0.6, trail: 6, from: 1.4, to: 1.1 }, // a faint golden glow from Amy to him (heights above the feet)
    horseSpot: [-17.8, -4.5], // the horse waits here (offset from the centre): inside, by the entrance, at the edge of the boss's reach
    horseFacing: 0,          // ...side on to the arena, along the barrier (heading 0 = +z)
    horseWalk: 9,            // speed it walks in at / comes back at
    horseMaxHealth: 10,
    horseFireDamage: 2,      // per burn tick (the boss's fire, every boss.fire.tick) while it stands in the cone
    flee: { speed: 18, time: 1.6, fade: 0.6 }, // at 0 health it bolts away and fades out of sight
    comeBack: { from: -27, stop: 3, maxTime: 15 }, // after the fight: back in from outside the entrance (offset x) to `stop` from AJ
    healthBar: { width: 1.4, height: 0.16, up: 3.1, color: 0x5fe07a, low: 0xff4a3a, back: 0x1d1a2c },
  },

  // Horse energy (energy.js): separate from AJ's hearts, a thin bar under them. Galloping drains
  // it, trotting / cantering drains it very slowly, walking or standing (or waiting dismounted)
  // lets it recover; nothing changes in cutscenes. At 0 the horse can't gallop and slows to a
  // tired walk until `recoverAt` — a tired horse still walks, so progress is never blocked.
  energy: {
    horseEnergyMax: 100,
    gallopDrain: 3.5,        // per second while galloping (~29 s of gallop from full)
    trotDrain: 0.35,         // per second above a walk (trot, canter, the normal top speed)
    regenRate: 3,            // per second while walking, standing or waiting dismounted
    walkMax: 4.5,            // up to this speed counts as walking (between the walk and trot gait anchors)
    tiredSpeed: 3,           // tired: a walk at most...
    recoverAt: 0.3,          // ...until energy is back to this share of the max
    // Potions on the forest trail (on the safe line; never on a gem, a hurdle or a high wall).
    potions: { start: 0.15, every: 300, end: 0.9, search: 60, refill: 0.4, height: 1.2, reach: 1.9, gemClear: 6, hurdleClear: 30, wallClear: 6, color: 0x46e0ff, capColor: 0xc8a060, glow: 0x7af0ff },
    // Grass patches beside the trail line: riding over one slowly (a trot or a walk) the horse
    // eats and refills `rate` per second; galloping gives nothing. Standing still it grazes.
    grass: { at: [0.2, 0.47, 0.72], search: 60, lateral: 3.6, radius: 2.8, rate: 12, eatSpeed: 1.5, hurdleClear: 35, wallClear: 40, color: 0x4fa83a, tuftColor: 0x6cc24a },
    // Desert oases (a small pond with palm trees): before the Lazarus Pit, so never on the
    // skeleton chase or in the sandstorm's clear corridor. Riding through the pond refills 60%.
    // An oasis: riding into the pond the horse slows to a walk (`oasisDrinkSpeed`, still
    // steerable — out of the pond or a gallop ends it early) and drinks for `oasisDrinkTime` s,
    // head down (the graze clip), sipping (`horse_sip` every `sipEvery` s, small ripples at its
    // mouth), its energy refilling gradually by oases.refill over the drink; then it goes on.
    oasisDrinkTime: 2.5,
    oasisDrinkSpeed: 1.6,
    oasisDrink: { sipEvery: 0.8, rippleEvery: 0.45, ripples: 5, mouth: 1.45, leave: 2.5 }, // leave: this far past the pond ends it early
    oases: { at: [0.22, 0.45], lateral: 3.8, radius: 2.6, refill: 0.6, palms: [[8.2, -3], [9.4, 2.5]], waterColor: 0x2f8fc4, rimColor: 0xd6b07a, trunkColor: 0x8a6a42, leafColor: 0x3f8a3a },
    splash: { count: 14, speed: 3.5, up: 4, life: 0.6, size: 0.12, color: 0xbff4ff },
  },

  hurdles: {
    obstacleSpacingMin: 90,  // trail distance between two hurdles...
    obstacleSpacingMax: 150, // ...at least / at most (plus `search` when a spot isn't fair)
    edgeClear: 0.1,          // none in the first 10% of the trail or the last 10% before the cave
    search: 60,              // from each spacing step, look this far on for a fair spot (else skip it)
    step: 2,
    straightBefore: 20, straightAfter: 10, maxCurvature: 0.006, // never on a trail bend (straight run-up and run-out)
    maxSlope: 0.06, slopeSpan: 10,
    itemClear: 8,            // the run-up / run-out keeps this clear of the high walls' approach, funnel and exit
    checkpointClear: 25,     // checkpoints keep this far past a hurdle (and its whole run-up before it)
    pattern: ['stones', 'wall', 'wall', 'thorns', 'stones', 'thorns'], // types in turn (where a fair spot is found)
    // Bats never start an attack (or come in) within this of a hurdle: scheduleBats windows.
    batClear: { before: 60, after: 15 },
    contactReach: 0.6,       // judged when the horse's centre is this close to the hurdle
    near: 70,                // (only within this distance along the trail: hint, power-jump zone, contact)
    hintRange: 60,           // the first giant wall ahead: a short hint ("Gallop and jump!")
    // A jump while galloping in the `zone` before a giant wall is a power jump (~2.5 high).
    powerJump: { boost: 1.25, zone: 40 },
    wallLayers: 4,           // the giant wall's layers of stones (× types.wall.layerHeight 0.38 = 1.52 high): gallop + jump clears it comfortably
    // Hearts AJ loses hitting any forest obstacle (wall, thorns, stones). 0: none — the horse only
    // stumbles / slows; hearts are lost only to enemies and fire.
    obstacleHeartDamage: 0,
    types: {
      // Layers of stacked stones across the whole trail (`wallLayers`). Gallop + jump (a power
      // jump) clears it; hit without one, the horse stops, stumbles for `stop` s (moved `recoil`
      // back off it), then goes on; the wall shakes.
      wall: {
        layerHeight: 0.38, depth: 1.2, halfWidth: 7.8, stone: [1.1, 1.7],
        colors: [0x8d8a83, 0x6f6c66, 0xa49e93], runUp: 40, recoil: 1.5, stop: 1,
        contact: 1.0, clearMargin: 0.15, shake: { time: 0.45, amp: 0.12, rate: 40 },
      },
      // Low thorn bushes sliding slowly left and right across the trail: a short slow-down and a
      // stumble on touch (no hearts, see obstacleHeartDamage); a normal jump clears them.
      thorns: {
        halfWidth: 2.2, height: 0.7, depth: 1.4, travel: 4.2, period: 4.5, slow: 0.55, stumble: 0.6,
        clearMargin: 0.15, color: 0x2f5a2a, thornColor: 0x9a2a2a,
      },
      // Small rocks across the trail: jump them; hit one and the horse stumbles for a second (no damage).
      stones: { lateral: [-4.6, 0, 4.6], radius: 0.65, height: 0.6, stumble: 1, clearMargin: 0.15, color: 0x8a847a },
    },
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
      // (the four low brick walls were replaced by the forest hurdles, hurdles.js)
      { at: 0.052, kind: 'high', gap: 'centre' },
      { at: 0.36, kind: 'high', gap: 'left' },   // (on the hill climb: high walls needn't be level)
      { at: 0.479, kind: 'high', gap: 'right' },
      { at: 0.635, kind: 'high', gap: 'left' },  // (on the descent)
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
    airGemKinds: ['stones', 'thorns'], // ...(the forest hurdles you jump; a giant wall's power jump carries none)
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
  hurdles: { wallHint: 'Gallop and jump!' },
  energy: { tired: 'Horse is tired', label: 'Horse' },
  testMenu: {
    open: 'TEST', close: 'Close', hurdles: 'Forest hurdles',
    forest: 'Forest start', cave: 'Cave entrance', boss: 'Boss fight', afterBoss: 'After boss (Amy rescued)',
    pit: 'Lazarus Pit scene', chase: 'Desert chase', storm: 'Sandstorm', gate: 'Castle gate cinematic',
    audio: 'Audio test',
    part1: 'Part 1', part2: 'Part 2',
    invulnerable: (on) => `Invulnerable: ${on ? 'yes' : 'no'}`, heroState: (s) => `Hero state: ${s}`,
    portal: 'Portal scene', arrival: 'Gearhaven arrival', fire: 'Fire level (start)', fireBoss: 'Fire boss', firePlaza: 'Fire plaza chests', giveKeys: (n) => `Give ${n} cog keys`, giveShield: 'Toggle Shield', giveAllElements: 'Toggle all Elements', giveFireOnly: 'Toggle Fire Element only', lightning: 'Lightning level', steam: 'Steam level',
    magnet: 'Magnet level', time: 'Time level', final: "Amy's final fight", part2Ending: 'Part 2 ending', robots: 'Robots test', ride: 'Gearhaven ride', props: 'Props test', look: (name) => `Look: ${name}`, giveGears: (n) => `Give ${n} gears`,
    on: 'Test menu on', off: 'Test menu off',
  },
  skip: 'Skip ▶▶',
  gameOver: 'You woke up with a jolt!',
  retry: 'Tap to dream again',
  toBeContinued: 'To be continued... Part 2',
  // Part 2 — Gearhaven (src/part2/; the portal scene at the end of Part 1).
  part2: {
    portal: {
      thanks: 'Thank you for bringing me home.', // (Amy, in the close-up)
      whoa: "Whoa... what's this place?",        // (AJ, looking round — the portal tears open mid-line)
      whoaCue: "what's this place",              // (the portal opens as the typewriter reaches this)
      happening: "What's happening?!",            // (AJ, as the portal already pulls him and the horse in)
      no: 'No......',                            // (Amy, long and trailing, reaching out to him as they vanish into the light)
    },
    arrival: {
      where: 'Where am I?',
      welcome: 'Welcome to Gearhaven.',
      clock: 'Am I inside a clock?',              // (AJ looks up: the camera tilts up to the Dream Clock and the gears)
      dreamClock: "It's the Dream Clock. And it's slowing down.",
      stops: 'If it stops, your dream ends. Five elements can restart it.',
      took: "But someone took them. It's her doing.",
      amy: 'Amy?',
      cannot: "I can't say.",                    // (Tick, nervously, looking over his shoulder)
    },
    objectives: {
      fire: 'Find the Fire Element', lightning: 'Find the Lightning Element', steam: 'Find the Steam Element',
      magnet: 'Find the Magnet Element', time: 'Find the Time Element', final: 'Face Amy',
    },
    levelNames: { fire: 'Fire Element', lightning: 'Lightning Element', steam: 'Steam Element', magnet: 'Magnet Element', time: 'Time Element', final: "Amy's final fight" },
    comingSoon: (name) => `${name} — coming soon`,
    back: 'Back to Gearhaven',
    robotsTest: 'Robots test — Tick, Leela, Mike, Stan, George',
    propsTest: 'Props test — gears, saw, factory, rail, clock tower, castle gate',
    ride: { quest: 'Ride to the Fire Element', start: 'Grind the rails, ride the steam!', gears: '⚙' }, // the Gearhaven ride (ride.js)
    levelUp: { banner: (n) => `LEVEL UP!  Lv ${n}`, tag: (n) => `Lv ${n}`, hearts: '+1 max heart', horseEnergyPct: '+10% horse energy', batarangCap: '+1 Batarang carried', damagePct: '+10% Batarang and Gear Wheel damage' },
    gearReward: {
      banner: (what) => `Gear reward unlocked: ${what}!`,
      heart: '+1 heart', armour: 'horse armour', charge: 'bonus ability charge',
    },
    // The Fire Element's level (part2/fire.js, items.js).
    fire: {
      quest: 'Ride to the furnace gate', start: 'Furnace city! Keep to the road.', gears: '⚙',
      questBoss: 'Defeat the Furnace Guardian', questElement: 'Take the Fire Element', bossName: 'Furnace Guardian',
      needs: (n) => `Needs ${n} cog key${n > 1 ? 's' : ''}`,
      shieldCooldown: 'Shield locked',
      got: { shield: 'Shield unlocked!', cogKey: 'Cog key!', elixirHeal: (n) => `Green potion: +${n} heart${n > 1 ? 's' : ''}`, elixirEnergy: 'Blue potion: the horse is rested', gem: (n) => `+${n} gem${n > 1 ? 's' : ''}`, heartContainer: 'Heart container: +1 max heart!', gearBundle: (n) => `+${n} gears`, runeStone: 'Rune stone', wandPiece: 'Wand piece' },
      keysLabel: 'Cog keys', keyIcon: '🗝',
      blastUnlocked: 'Fire Blast unlocked!', blastHint: 'Tap Fire to throw a fireball — it burns!', // (only after the Fire Element is his)
      potionAppears: 'A green potion appeared by a pillar!',
      shieldHint: 'Tap Shield just before a hit lands — a perfect block staggers the Guardian!', shieldChestHint: 'Something is locked in the chests… keep an eye out for a shield.',
      ammoOut: 'Out of gems!',
      gateSealed: 'The furnace gate is sealed!', gateOpen: 'The way out is open.',
      banner: 'Fire Element recovered',
      tick: { stomp: 'Stomp coming!', steam: 'Steam! Get clear!', charge: 'It is charging!', fireball: 'Fire ball!' },
      gate: { locked: (n) => `The cog gate needs ${n} cog keys`, open: 'The cog gate opens!' },
      chest: { elixirs: 'Chest: 2 potions! (a green one and a blue one)', gems: (n) => `Chest: ${n} gems!`, heart: 'Chest: +1 max heart!', shield: 'Chest: the Shield! Block with it, jump the Stomp.', gears: (n) => `Chest: a gear bundle, ${n} gears!` },
      weapons: { hint: (n) => `Cog Shot spends a cog key; Gear Wheel spends ${n} gears`, needGears: (n) => `Needs ${n} gears`, needKey: 'Needs 1 cog key' },
      scene: {
        one: 'That is one of five.',            // (Tick)
        others: 'Where are the others?',         // (AJ)
        taken: 'Wherever she has not taken them yet.', // (Tick)
        watching: 'Someone is watching us.',     // (Tick, noticing the hooded figure on the distant tower)
        amy: 'Amy?',                             // (AJ)
        cannot: 'I cannot say.',                 // (Tick)
      },
    },
    elements: { fire: 'Fire', lightning: 'Lightning', steam: 'Steam', magnet: 'Magnet', time: 'Time', label: 'Elements' },
    toBeContinued: 'To be continued... Part 3',
    summaryTitle: 'Part 2 complete',
    nextPart: 'Part 3 (Coming soon)',
  },
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
  abilityNames: { batarang: 'Batarang', smokeBomb: 'Smoke Bomb', flashMode: 'Flash Mode', fireBlast: 'Fire Blast', shield: 'Shield', cogShot: 'Cog Shot', gearWheel: 'Gear Wheel' },
  unlocked: (ability) => `${ability} Unlocked!`,
  smokeResisted: 'It shrugs off the smoke!',
  arenaGems: 'Gems at the arena edge!',
  bossRegenIcon: '+', // beside the boss's health bar while it regenerates
  audio: {
    title: 'Sound', on: '🔊', off: '🔇', mute: 'Mute', unmute: 'Sound on',
    music: 'Music', effects: 'Effects', voices: 'Voices',
    sections: 'Music sections', stopMusic: 'Stop music', voicesTest: 'Voice blips', sounds: 'Sounds',
  },
  arena: {
    sealed: 'The way out is sealed!',
    open: 'The way out is open.',
    horseFled: 'Your horse bolted!',
    horseBack: 'Your horse is back.',
  },
  gallop: 'Gallop',
  objectiveComplete: 'Objective complete!',
  distanceUnit: 'm',
  controlsHint: 'Left: move · Right: look · Attack / Jump / Dodge / ability buttons  —  Keys: WASD / Space jump / J attack / K dodge / 1 2 3 abilities / E mount / Shift gallop',
  attack: 'Attack',
  dodge: 'Dodge',
  jump: 'Jump',
  abilityShort: { batarang: '★', smokeBomb: '☁', flashMode: '⚡', fireBlast: '🔥', shield: '🛡', cogShot: '⚙', gearWheel: '◎' },
  gameOverTitle: 'Game Over',
  retryRide: 'Retry',
  bossName: 'Cave Monster',
  // The girl's scene at the cave mouth (she is secretly a witch — only hinted).
  speakers: { hero: 'Hero', aj: 'AJ', girl: 'Girl', tick: 'Tick', hooded: 'Hooded figure' }, // (Part 2's lines name AJ: speaker `aj`)
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
    keepGoing: 'We should keep going.',
    notWell: 'You are not well.',
    ok: "I'm ok.",            // (weak, grunted: a cough first, AJ's low slow voice — voice.characters.ajWeak)
    water: 'At least you should have some water. Look.',
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

  // The Credits screen (a small button on the intro and the ending screens): every pack used and
  // its licence. `text` is shown as it is (the exact attribution a licence asks for).
  credits: {
    button: 'Credits', title: 'Credits', close: 'Close',
    entries: [
      { what: 'AJ, Amy and Warrok — characters and animations', who: 'Mixamo (Adobe)', licence: 'Adobe General Terms of Use' },
      { what: 'Horse — Ultimate Animated Animal Pack', who: 'Quaternius', licence: 'CC0' },
      { what: 'Bat, skeleton, slime — Animated Monster Pack', who: 'Quaternius', licence: 'CC0' },
      { what: 'Tick — Animated Robot', who: 'Quaternius', licence: 'CC0' },
      { what: 'Gearhaven robots — Animated Mech Pack', who: 'Quaternius', licence: 'CC0' },
      { what: 'Brass gear to collect — Collectible Gear', who: 'Quaternius', licence: 'CC0' },
      { what: 'Factory Kit — conveyors, pipes, cogs, catwalks, machines', who: 'Kenney (kenney.nl)', licence: 'CC0' },
      { what: 'Coaster Kit — rails and supports', who: 'Kenney (kenney.nl)', licence: 'CC0' },
      { what: 'Castle Kit — towers, walls, gates, flags', who: 'Kenney (kenney.nl)', licence: 'CC0' },
      { what: 'Gear', text: 'Gear by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/0icYC-GPiro)' },
      { what: 'Gear cluster, spiky gear', who: 'via Poly Pizza (poly.pizza)' },
      { what: 'Sound and music', who: 'Synthesized in code' },
      { what: 'Engine', who: 'three.js, Vite', licence: 'MIT' },
    ],
  },

  // Intro is told through pictures only. Add `caption: '...'` to a slide for one short comic line.
  intro: [
    { scene: 'desk' },
    { scene: 'drowsy' },
    { scene: 'dozing' },
    { scene: 'dream', transition: 'swirl' },
  ],
};
