// How public/models/girl/girl.glb (from the 28 MB girl.fbx) and public/models/boss/boss.glb
// (from the 12 MB boss.fbx) were made; neither FBX is in the repo.
// The tools are not project dependencies; run it in a scratch folder:
//   npm i fbx2gltf@0.9.7-p1 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
//         @gltf-transform/functions@4.5.1 sharp meshoptimizer
//   node_modules/fbx2gltf/bin/Linux/FBX2glTF --binary --pbr-metallic-roughness \
//         --anim-framerate bake30 -i girl.fbx -o girl_raw
//   node girl-to-glb.mjs girl_raw.glb girl.glb
// FBX2glTF bakes metres into the joint translations; the Mixamo animation FBX files move the
// hips in centimetres, so the skeleton goes back to the FBX's centimetres (joint and mesh
// positions, inverse bind matrices and animation translations ×100) under a 0.01 root node:
// same bone names, same rest pose, real-world size. Then textures → 1024 px WebP, weld,
// quantize, meshopt (load with GLTFLoader.setMeshoptDecoder).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, resample, textureCompress, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const K = 100; // metres → centimetres (the source FBX's units)
const sceneRoot = root.listNodes().find((n) => n.getName() === 'RootNode');
// 1) Joint translations ×100.
const skin = root.listSkins()[0];
const joints = new Set(skin.listJoints());
for (const n of root.listNodes()) {
  if (n === sceneRoot || n.getMesh()) continue;
  n.setTranslation(n.getTranslation().map((v) => v * K));
}
// 2) Mesh positions ×100 (bind-space vertices of the skinned mesh).
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION');
  const a = pos.getArray().slice();
  for (let i = 0; i < a.length; i++) a[i] *= K;
  pos.setArray(a);
  for (const t of prim.listTargets()) { const p = t.getAttribute('POSITION'); if (p) { const b = p.getArray().slice(); for (let i = 0; i < b.length; i++) b[i] *= K; p.setArray(b); } }
}
// 3) Inverse bind matrices: translation part ×100 (column-major, elements 12..14).
const ibm = skin.getInverseBindMatrices();
const m = ibm.getArray().slice();
for (let j = 0; j < m.length; j += 16) { m[j + 12] *= K; m[j + 13] *= K; m[j + 14] *= K; }
ibm.setArray(m);
// 4) Animation translations ×100.
for (const anim of root.listAnimations()) for (const ch of anim.listChannels()) {
  if (ch.getTargetPath() !== 'translation') continue;
  const out = ch.getSampler().getOutput();
  const v = out.getArray().slice();
  for (let i = 0; i < v.length; i++) v[i] *= K;
  out.setArray(v);
}
// 5) Show it at real size again: the root node scales cm → m.
sceneRoot.setScale([1 / K, 1 / K, 1 / K]);
// 6) The FBX material was a plain (Phong) non-metal.
for (const mat of root.listMaterials()) mat.setMetallicFactor(0);
await doc.transform(
  dedup(), weld(), resample(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(dst, doc);
console.log('wrote', dst);
