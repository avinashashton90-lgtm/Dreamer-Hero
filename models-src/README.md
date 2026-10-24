# Model sources (not deployed)

The original files the game's optimised models were made from. Vite copies everything in
`public/` into the build, so the large sources live here instead.

- `gearhaven/tick/tick.fbx` — Quaternius, Animated Robot (CC0) → `public/models/gearhaven/tick/tick.glb`
- `gearhaven/robots/George|Leela|Mike|Stan.gltf` — Quaternius, Animated Mech Pack (CC0) →
  `public/models/gearhaven/robots/george|leela|mike|stan.glb`

How: `scripts/gearhaven-models.mjs` (meshopt, 1024 px WebP textures — 512 px for the small scout).
