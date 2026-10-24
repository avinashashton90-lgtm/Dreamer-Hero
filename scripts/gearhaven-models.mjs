// How Part 2's robot models were made (public/models/gearhaven/): Tick from the Quaternius
// Animated Robot (tick.fbx) and the four Quaternius Animated Mech Pack robots (George, Leela,
// Mike, Stan .gltf, ~3–5 MB each with 2048 px textures). The sources are kept in
// models-src/gearhaven/ (not deployed). The tools are not project dependencies; run it in a
// scratch folder:
//   npm i fbx2gltf@0.9.7-p1 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
//         @gltf-transform/functions@4.5.1 sharp meshoptimizer
//   node_modules/fbx2gltf/bin/Linux/FBX2glTF --binary --pbr-metallic-roughness \
//         --anim-framerate bake30 -i tick.fbx -o tick_raw
//   node gearhaven-models.mjs tick_raw.glb tick.glb
//   node gearhaven-models.mjs George.gltf george.glb      (and leela, mike, stan)
// Their animations are embedded (no external clips to match), so the skeleton keeps its own
// units and the game fits each model to its height in code (as the girl and the boss are fitted).
// Each: dedup, join the meshes that share a material and skin (fewer draw calls), weld,
// resample the clips, prune, textures → 1024 px WebP, quantize, meshopt (load with
// GLTFLoader.setMeshoptDecoder); materials made plain non-metals (the game tints them).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, resample, join, textureCompress, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst, size = '1024'] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
for (const mat of doc.getRoot().listMaterials()) {
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(1);
}
const px = Number(size);
await doc.transform(
  dedup(), join({ keepNamed: false }), weld(), resample(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: 85 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(dst, doc);
console.log('wrote', dst);
