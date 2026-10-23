// Every sound in the game, by name: its volume group, whether it loops, and what it is for.
// A file public/audio/<name>.ogg (or .mp3) replaces the synthesized fallback (sfx.js); voice
// lines live in public/audio/voice/. `scripts/audio-readme.mjs` writes public/audio/README.md
// from this list, and the audio test checks every name has a fallback.

/** @typedef {{ group: 'effects' | 'voices', loop?: boolean, desc: string }} SoundInfo */

/** @type {Record<string, SoundInfo>} */
export const SOUNDS = {
  // Horse
  hoof_walk: { group: 'effects', loop: true, desc: 'Hooves at a walk (loop; its rate follows the horse’s speed)' },
  hoof_trot: { group: 'effects', loop: true, desc: 'Hooves at a trot / canter (loop; rate follows the speed)' },
  hoof_gallop: { group: 'effects', loop: true, desc: 'Hooves at a gallop (loop; rate follows the speed)' },
  horse_neigh: { group: 'effects', desc: 'The horse neighs (now and then while galloping; a bat attacking, the boss roaring, a skeleton group)' },
  horse_scream: { group: 'effects', desc: 'A loud rearing whinny (galloping, rearing up, bolting, riding into the sandstorm)' },
  horse_snort: { group: 'effects', desc: 'A snort (mount, a stumble, a big landing)' },
  horse_breath: { group: 'effects', loop: true, desc: 'Heavy panting while the horse’s energy is low (loop)' },
  horse_hurt: { group: 'effects', desc: 'The horse is burnt by the boss’s fire or bitten by a bat' },
  horse_eat: { group: 'effects', desc: 'Grazing / munching on a grass patch or while it waits' },
  // Water
  river_splash: { group: 'effects', desc: 'Soft water as the horse first enters the river / an oasis (at most one per 0.6 s)' },
  river_flow: { group: 'effects', loop: true, desc: 'A very quiet water wash while the horse stays in the river (loop)' },
  potion_drink: { group: 'effects', desc: 'Drinking (an energy potion, the oasis)' },
  // AJ
  aj_jump: { group: 'effects', desc: 'AJ jumps (cloth whoosh)' },
  aj_land: { group: 'effects', desc: 'AJ lands from a jump' },
  aj_hurt: { group: 'effects', desc: 'AJ is hit' },
  aj_death: { group: 'effects', desc: 'AJ is out of hearts' },
  aj_revive: { group: 'effects', desc: 'AJ comes back (a respawn / the arena revive)' },
  aj_dismount: { group: 'effects', desc: 'AJ gets off the horse' },
  aj_mount: { group: 'effects', desc: 'AJ swings up onto the horse' },
  // Weapons
  batarang_throw: { group: 'effects', desc: 'The Batarang leaves the hand (whirr)' },
  batarang_hit: { group: 'effects', desc: 'The Batarang strikes something' },
  batarang_return: { group: 'effects', desc: 'The Batarang is caught again' },
  smoke_throw: { group: 'effects', desc: 'The Smoke Bomb is lobbed' },
  smoke_burst: { group: 'effects', desc: 'The Smoke Bomb bursts into its green cloud' },
  flash_charge: { group: 'effects', desc: 'Flash Mode charging up (rising hum)' },
  flash_release: { group: 'effects', desc: 'The Flash lightning bolt strikes (crackle)' },
  melee_swing: { group: 'effects', desc: 'A punch / kick swing (whoosh)' },
  melee_hit: { group: 'effects', desc: 'A punch / kick lands' },
  // Gems and items
  gem_collect: { group: 'effects', desc: 'A gem picked up (higher for blue, highest for pink)' },
  potion_pickup: { group: 'effects', desc: 'An energy potion picked up' },
  ability_ready: { group: 'effects', desc: 'An ability unlocked / the Flash bar full again' },
  ability_empty: { group: 'effects', desc: 'An ability tapped with no uses left / reloading' },
  ui_tap: { group: 'effects', desc: 'A menu / panel button tapped' },
  // Bats
  bat_screech: { group: 'effects', desc: 'A bat telegraphs its dive' },
  bat_flap: { group: 'effects', loop: true, desc: 'Wings flapping (loop, at the nearest bat)' },
  bat_hit: { group: 'effects', desc: 'A bat is hit' },
  bat_die: { group: 'effects', desc: 'A bat is defeated' },
  // Skeletons
  skel_rattle: { group: 'effects', desc: 'A skeleton rises from the sand / rattles' },
  skel_walk: { group: 'effects', desc: 'Skeleton footsteps (bony clacks)' },
  skel_hit: { group: 'effects', desc: 'A skeleton is hit' },
  skel_die: { group: 'effects', desc: 'A skeleton collapses' },
  skel_thrown_aside: { group: 'effects', desc: 'A skeleton knocked aside by the galloping horse / at the gate' },
  // Slimes
  slime_squelch: { group: 'effects', desc: 'A slime rises / hops / is hit' },
  slime_burst: { group: 'effects', desc: 'A slime pops' },
  // Boss
  boss_roar: { group: 'effects', desc: 'The boss roars (noticing AJ, waking from the Smoke, before fire)' },
  boss_step: { group: 'effects', desc: 'A heavy boss footstep (with a small camera shake)' },
  boss_slam: { group: 'effects', desc: 'The boss smashes both fists into the ground' },
  boss_charge: { group: 'effects', desc: 'The boss starts its charge' },
  boss_fire_breath: { group: 'effects', loop: true, desc: 'The boss breathing fire (loop while it lasts)' },
  boss_hurt: { group: 'effects', desc: 'The boss is hit' },
  boss_dazed: { group: 'effects', desc: 'The boss is paralysed by the Smoke' },
  boss_death: { group: 'effects', desc: 'The boss falls' },
  boss_regen: { group: 'effects', desc: 'The boss regenerating (soft shimmer every few seconds)' },
  // Arena
  barrier_close: { group: 'effects', desc: 'The rock barrier rises and seals the arena' },
  barrier_open: { group: 'effects', desc: 'The rock barrier sinks' },
  rock_rumble: { group: 'effects', desc: 'A deep rumble (the barrier, a giant forest wall hit)' },
  // Scenes
  pit_water_glow: { group: 'effects', desc: 'The Lazarus Pit wakes and glows' },
  pit_heal: { group: 'effects', desc: 'AJ drinks and is healed' },
  gate_open: { group: 'effects', desc: 'The castle gates swing open' },
  gate_slam: { group: 'effects', desc: 'The castle gates slam shut' },
  sandstorm_wind: { group: 'effects', loop: true, desc: 'The sandstorm’s wind (loop, follows its strength)' },
  thunder_soft: { group: 'effects', desc: 'Distant soft thunder (the witch hint)' },
  // Hearts
  heart_lost: { group: 'effects', desc: 'A heart lost' },
  heart_gained: { group: 'effects', desc: 'A heart gained' },
  low_health_beat: { group: 'effects', loop: true, desc: 'A slow heartbeat while AJ has 1 heart or less (loop)' },
  // Extras for events the list doesn't name
  rescue_pulse: { group: 'effects', desc: 'The corner-rescue pulse' },
  stumble: { group: 'effects', desc: 'The horse stumbles over stones' },
  // Voice efforts and blips (voices group; files in public/audio/voice/)
  aj_hup: { group: 'voices', desc: 'AJ’s effort as he jumps' },
  aj_hya: { group: 'voices', desc: 'AJ’s effort as he throws / attacks' },
  aj_ugh: { group: 'voices', desc: 'AJ hurt' },
  amy_gasp: { group: 'voices', desc: 'Amy’s small gasp when the boss roars' },
};

/** Music sections (each loops; 2 s crossfades). A file music_<track>.ogg replaces the synthesized track. */
export const MUSIC = {
  forest: { track: 'forest', desc: 'Forest ride: calm, adventurous' },
  bats: { track: 'bats', desc: 'Bat attack: tense and faster' },
  boss: { track: 'boss', layers: [], desc: 'Cave and boss fight: heavy and dramatic (+ the “intense” layer below half health)' },
  pit: { track: 'pit', desc: 'Lazarus Pit (and the quiet scenes): soft and magical' },
  chase: { track: 'chase', desc: 'Desert chase: fast and driving' },
  sandstorm: { track: 'chase', layers: ['wind'], desc: 'Sandstorm: the chase with a wind layer' },
  gate: { track: 'gate', desc: 'Castle gate: triumphant' },
  ending: { track: 'ending', desc: 'Ending screen: gentle' },
};

/** Music layers: on top of a track (file music_<track>_<layer>.ogg, else synthesized). */
export const MUSIC_LAYERS = {
  intense: { desc: 'Boss under half health: a stronger drum / bass layer (music_boss_intense.ogg)' },
  wind: { desc: 'Sandstorm wind over the chase (music_chase_wind.ogg)' },
};

/** Voice characters: a synthesized blip per typed character (or voice/<id>_<lineId>.ogg). */
export const VOICES = {
  aj: { desc: 'AJ (higher)' },
  amy: { desc: 'Amy (softer)' },
  boss: { desc: 'The boss (deep)' },
};
