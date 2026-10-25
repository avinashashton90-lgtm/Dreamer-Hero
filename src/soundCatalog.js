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
  horse_sip: { group: 'effects', desc: 'The horse sipping at an oasis (soft, every ~0.8 s while it drinks)' },
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
  // --- Part 2: the portal (the end of Part 1) ---
  portal_open: { group: 'effects', desc: 'The portal tears open beside AJ: a rising shimmer and a whoosh over a soft low rumble' },
  portal_pull: { group: 'effects', desc: 'The portal pulls AJ and the horse in: a swirling suck, rising' },
  gear_whoosh: { group: 'effects', desc: 'Small brass gears flying past into the portal (a light airy whoosh with a tiny tick)' },
  portal_whoosh: { group: 'effects', desc: 'Gearhaven: the quick white flash between places (a soft whoosh)' },
  // --- Gearhaven ambience (very quiet loops, faded in and out between sections) ---
  clock_tick: { group: 'effects', loop: true, desc: 'Gearhaven ambience: a slow, soft two-note tick-tock (loop; never a drum)' },
  gear_turn: { group: 'effects', loop: true, desc: 'Gearhaven ambience: big gears turning — a low gentle grind (loop)' },
  steam_hiss: { group: 'effects', loop: true, desc: 'Gearhaven: steam hissing (a quiet ambience loop; also one soft hiss per courtyard vent puff)' },
  factory_hum: { group: 'effects', loop: true, desc: 'Gearhaven ambience: the brass city’s machines — a soft low hum (loop, the ride)' },
  clock_chime: { group: 'effects', desc: 'The Dream Clock’s big, deep bell (far away in the arrival; when the clock restarts)' },
  clock_stop_warning: { group: 'effects', desc: 'The Dream Clock is slowing: a slow, soft, dissonant tone (Tick: “…it’s slowing down.”)' },
  // --- Gearhaven ride ---
  rail_land: { group: 'effects', desc: 'Gearhaven ride: landing on a rail (or hopping across to the next one) — a metallic clink' },
  rail_grind: { group: 'effects', loop: true, desc: 'Gearhaven ride: grinding along a rail — a continuous steel scrape with sparks (loop; louder and higher with speed)' },
  rail_leave: { group: 'effects', desc: 'Gearhaven ride: leaving a rail (a jump off, or its end) — a light ringing scrape-off' },
  steam_vent: { group: 'effects', desc: 'Gearhaven ride: a steam vent puffs — a puff and a hiss (idle puffs soft and far)' },
  steam_launch: { group: 'effects', desc: 'Gearhaven ride: a steam vent launches the horse — a rising whoosh' },
  hammer_swing: { group: 'effects', desc: 'Gearhaven ride: a swinging hammer passes the bottom of its swing — a heavy whoosh (3D)' },
  hammer_hit: { group: 'effects', desc: 'Gearhaven ride: a swinging hammer knocks the horse — a metal clang (3D)' },
  saw_spin: { group: 'effects', loop: true, desc: 'Gearhaven ride: a spinning saw — a thin whirring loop (3D, the nearest saw)' },
  saw_hit: { group: 'effects', desc: 'Gearhaven ride: a spinning saw blade catches the horse — a sharp metal screech and sparks (3D)' },
  conveyor_belt: { group: 'effects', loop: true, desc: 'Gearhaven ride: a conveyor belt — a soft rolling hum (loop, 3D, the nearest belt)' },
  gear_collect: { group: 'effects', desc: 'A brass gear collected — a bright metallic ting with a tiny sparkle (its pitch rises on a streak)' },
  gear_spin_pickup: { group: 'effects', desc: 'A collected gear spins up and pops away — a soft quick whirr' },
  gear_reward: { group: 'effects', desc: 'Gearhaven: a gear reward unlocked (a third, two thirds, all of a level’s gears) — a short rising brass chime' },
  horse_clank: { group: 'effects', loop: true, desc: 'Gearhaven: gentle metal clinks of the horse’s brass armour while it trots or gallops (loop; with the armour reward)' },
  horse_stumble: { group: 'effects', desc: 'Gearhaven: the horse staggers (a hammer, a saw) — a scuff and a soft clatter' },
  // --- Tick, the brass robot guide ---
  tick_whir: { group: 'voices', desc: 'Tick whirs as he floats in' },
  tick_beep: { group: 'voices', desc: 'Tick talking: a cute short chirp per letter of his lines (his voice blip; 3D from where he floats)' },
  tick_hover: { group: 'effects', loop: true, desc: 'Tick’s little propeller — a very soft hum (loop, from where he floats)' },
  // --- Robots (the mech robots and the armoured mech boss; 3D) ---
  robot_walk: { group: 'effects', desc: 'A robot’s heavy metal step (softened)' },
  robot_swing: { group: 'effects', desc: 'A robot swings its sword / punches — a metal whoosh' },
  robot_hit: { group: 'effects', desc: 'A robot is hit — a hollow metal clank' },
  robot_die: { group: 'effects', desc: 'A robot collapses — a clatter of metal parts' },
  robot_alert: { group: 'effects', desc: 'A sword robot sees AJ — a short alarm chirp' },
  boss_mech_step: { group: 'effects', desc: 'The armoured mech boss steps — a deep heavy metal thud (soft, no drum)' },
  boss_mech_roar: { group: 'effects', desc: 'The armoured mech boss bellows — a metallic, grinding roar' },
  boss_mech_death: { group: 'effects', desc: 'The armoured mech boss falls — a long collapse of plates and gears' },
  // --- The elements ---
  element_collect: { group: 'effects', desc: 'An element collected — a magical shimmer over a deep chime' },
  element_power_up: { group: 'effects', desc: 'An element’s power gained — a rising swell into a bright chord' },
  // --- Amy (Part 2) ---
  amy_magic_cast: { group: 'effects', desc: 'Amy casts her magic — a whooshing violet shimmer' },
  amy_hit_reflect: { group: 'effects', desc: 'AJ reflects Amy’s magic — a bright crystalline clash' },
  amy_eyes_glow: { group: 'effects', desc: 'Amy’s eyes glow — a soft, rising, eerie hum' },
  // --- The Fire Element level (being built next) ---
  chest_open: { group: 'effects', desc: 'Fire level: a chest opens — a creak and a bright little sparkle' },
  chest_locked: { group: 'effects', desc: 'Fire level: a locked chest — a dull clunk' },
  cog_key_collect: { group: 'effects', desc: 'Fire level: a cog key picked up — a clockwork click and a bell' },
  elixir_drink: { group: 'effects', desc: 'Fire level: drinking an elixir — soft gulps and a warm shimmer' },
  fire_blast_cast: { group: 'effects', desc: 'Fire level: AJ casts the fire blast — a whooshing flare' },
  fire_blast_hit: { group: 'effects', desc: 'Fire level: the fire blast hits — a crackling burst' },
  burn_loop: { group: 'effects', loop: true, desc: 'Fire level: something burning — a soft crackle (loop)' },
  furnace_guardian_stomp: { group: 'effects', desc: 'Fire level: the Furnace Guardian stomps — a heavy thud with a low rumble' },
  furnace_guardian_steam_burst: { group: 'effects', desc: 'Fire level: the Furnace Guardian vents steam — a big hissing burst' },
  furnace_guardian_charge: { group: 'effects', desc: 'Fire level: the Furnace Guardian charges — a rising mechanical roar' },
  furnace_guardian_roar: { group: 'effects', desc: 'Fire level: the Furnace Guardian roars — a furnace bellow' },
  steam_barrier_close: { group: 'effects', desc: 'Fire level: a steam barrier closes — a hiss rising to a seal' },
  steam_barrier_open: { group: 'effects', desc: 'Fire level: a steam barrier opens — a hiss falling away' },
  element_orb_hum: { group: 'effects', loop: true, desc: 'Fire level: the element orb — a soft rising hum (loop)' },
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
  aj_cough: { group: 'voices', desc: 'AJ’s small weak cough (the Lazarus Pit, before “I’m ok.”)' },
  amy_gasp: { group: 'voices', desc: 'Amy’s small gasp (the boss roars; shocked moments in Part 2)' },
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
  // Part 2 (file music_<track>.ogg)
  part2Portal: { track: 'part2_portal', desc: 'The portal cutscene (the end of Part 1): short, mysterious and rising' },
  gearhaven: { track: 'gearhaven', desc: 'Gearhaven: a gentle clockwork theme — soft ticking, a music-box melody, a warm pad (the arrival, the courtyard, the rides, the level stubs)' },
  gearhavenChase: { track: 'gearhaven_chase', desc: 'Gearhaven, faster and tenser: grinding the rails (lingering a moment after), any chase' },
  elementFire: { track: 'element_fire', layers: [], desc: 'The Fire Element level: slow, warm, glowing clockwork (+ the “boss” layer: it builds in the boss fight)' },
  elementLightning: { track: 'element_lightning', desc: 'The Lightning Element level: bright and electric (for when the level exists)' },
  elementSteam: { track: 'element_steam', desc: 'The Steam Element level: airy and drifting (for when the level exists)' },
  elementMagnet: { track: 'element_magnet', desc: 'The Magnet Element level: pulsing and heavy (for when the level exists)' },
  elementTime: { track: 'element_time', desc: 'The Time Element level: stately, clock-like (for when the level exists)' },
  amyTheme: { track: 'amy_theme', desc: 'Amy’s theme: a quiet, sad, slightly eerie melody (her appearances in Part 2)' },
  finalFight: { track: 'final_fight', desc: 'The final fight with Amy: heavy and dramatic, with a choir-like pad' },
  part2End: { track: 'part2_end', desc: 'The Part 2 ending: gentle and hopeful' },
};

/** Music layers: on top of a track (file music_<track>_<layer>.ogg, else synthesized). */
export const MUSIC_LAYERS = {
  intense: { desc: 'Boss under half health: a stronger drum / bass layer (music_boss_intense.ogg)' },
  wind: { desc: 'Sandstorm wind over the chase (music_chase_wind.ogg)' },
  boss: { desc: 'The Fire level’s boss fight: the theme builds — a deeper pulse and a brighter line (music_element_fire_boss.ogg)' },
};

/** Voice characters: a synthesized blip per typed character (or voice/<id>_<lineId>.ogg). */
export const VOICES = {
  aj: { desc: 'AJ (higher)' },
  amy: { desc: 'Amy (softer)' },
  boss: { desc: 'The boss (deep)' },
  tick: { desc: 'Tick, the brass robot guide: a high, cute, quick chirp per letter (the tick_beep sound)' },
  amy2: { desc: 'Amy in Part 2: softer and cooler, lower and slower than in Part 1, hushed' },
};
