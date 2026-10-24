import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { fetchBuffers } from './mixamo.js';

// The model kits Gearhaven (and the castle at the end of Part 1) are built from
// (CONFIG.kits): Kenney's Factory, Coaster and Castle Kits (CC0) — small glb files that
// share one palette texture per kit (Textures/colormap.png) — and the gear props (Poly Pizza /
// Quaternius) in public/models/gearhaven/props/. Only the pieces a level uses are loaded, the
// first time it needs them (cached): each piece's meshes merged into one geometry (so it can be
// instanced), the kit's texture loaded once and shared, its blue / orange palette tinted to
// brass and copper in one cheap Lambert shader (kitMaterial). A piece that fails to load
// resolves to null — the caller keeps its placeholder.

const K = CONFIG.kits;

const pieces = new Map(); // `${kit}/${name}` → Promise<BufferGeometry | null>
const textures = new Map(); // `${kit}/${file}` → Texture
const materials = new Map(); // `${kit}/${tint}` → Material

/** Forget every loaded piece (tests: load again with other options). */
export function forgetKits() {
  pieces.clear();
  textures.clear();
  materials.clear();
}

/** A GLTFLoader that never loads the textures a kit file points at (the kit's one texture is shared). */
function geometryLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({ name: 'kitNoTextures', loadTexture: () => Promise.resolve(null) }));
}

/** All the meshes of a parsed glb merged into one geometry (position, normal, uv), node transforms baked in. */
function mergedGeometry(scene, { uv = true } = {}) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals(); // (flat: non-indexed)
    for (const name of Object.keys(g.attributes)) if (!(name === 'position' || name === 'normal' || (uv && name === 'uv'))) g.deleteAttribute(name);
    if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    parts.push(g);
  });
  return parts.length ? mergeGeometries(parts) : null;
}

/** The glb at `url` → its merged geometry (or null if it fails). */
async function loadGeometry(url, opts, merge) {
  try {
    const [buffer] = await fetchBuffers([url], { readFile: opts.readFile });
    const gltf = await geometryLoader().parseAsync(buffer, url.slice(0, url.lastIndexOf('/') + 1));
    return mergedGeometry(gltf.scene, merge);
  } catch (e) {
    if (!opts.quiet) console.warn(`[kits] ${url} failed — placeholder kept`, e?.message ?? e);
    return null;
  }
}

/**
 * A kit piece's geometry in the kit's own units (cached; null if it fails or `opts.placeholder`).
 * @param {'factory'|'rails'|'castle'} kit
 * @param {string} name  the file name without .glb (e.g. 'conveyor-long')
 * @param {{ readFile?, placeholder? }} [opts]
 */
export function loadKitPiece(kit, name, opts = {}) {
  if (opts.placeholder) return Promise.resolve(null);
  const key = `${kit}/${name}`;
  if (!pieces.has(key)) pieces.set(key, loadGeometry(`${K[kit].path}${name}.glb`, opts));
  return pieces.get(key);
}

/** Several pieces at once: { name → geometry | null }. */
export async function loadKitPieces(kit, names, opts = {}) {
  const geos = await Promise.all(names.map((n) => loadKitPiece(kit, n, opts)));
  return Object.fromEntries(names.map((n, i) => [n, geos[i]]));
}

/** Make a gear regular: centred, its axle along +Z (its thinnest side), radius 1 (so `scale` is its radius). */
export function regularGear(g) {
  g.computeBoundingBox();
  const size = g.boundingBox.getSize(new THREE.Vector3());
  const thin = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z';
  g.translate(...g.boundingBox.getCenter(new THREE.Vector3()).negate().toArray());
  if (thin === 'x') g.rotateY(Math.PI / 2);
  if (thin === 'y') g.rotateX(Math.PI / 2);
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE.Vector3());
  g.scale(...Array(3).fill(2 / Math.max(s.x, s.y)));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A gear prop (public/models/gearhaven/props/<name>.glb) made regular (regularGear). Cached;
 * null if it fails.
 */
export function loadPropGear(name, opts = {}) {
  if (opts.placeholder) return Promise.resolve(null);
  const key = `props/${name}`;
  if (!pieces.has(key)) pieces.set(key, loadGeometry(`${K.props.path}${name}.glb`, opts, { uv: false }).then((g) => g && regularGear(g)));
  return pieces.get(key);
}

/** A kit's cog (e.g. the Factory Kit's cog-a) made regular like the props (its uv dropped). */
export function loadKitGear(kit, name, opts = {}) {
  const key = `${kit}/${name}#gear`;
  if (!pieces.has(key)) {
    pieces.set(key, loadKitPiece(kit, name, opts).then((g) => {
      if (!g) return null;
      const c = g.clone();
      c.deleteAttribute('uv');
      return regularGear(c);
    }));
  }
  return pieces.get(key);
}

/** The kit's palette texture (loaded once; empty in Node). */
export function kitTexture(kit, file = 'colormap.png') {
  const key = `${kit}/${file}`;
  if (!textures.has(key)) {
    const t = new THREE.TextureLoader().load(`${K[kit].path}Textures/${file}`);
    t.flipY = false; // (glTF UVs)
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, t);
  }
  return textures.get(key);
}

/**
 * A kit's Lambert material with its palette re-tinted for Gearhaven (`K.tints[tint]`): the warm
 * colours (red, orange, yellow) → `warm`, the cool ones (green, blue, purple) → `cool`, the
 * greys mixed `greyK` toward `grey` — each shaded by the texel's own brightness, so the kit's
 * details stay — × `boost`, plus a soft `rim` light. Shared per kit and tint (one shader program).
 */
export function kitMaterial(kit, tint = K[kit].tint, extra = {}) {
  const key = `${kit}/${tint}/${JSON.stringify(extra)}`;
  if (materials.has(key)) return materials.get(key);
  const T = K.tints[tint];
  const mat = new THREE.MeshLambertMaterial({ map: kitTexture(kit, K[kit].texture), color: 0xffffff, ...extra });
  materials.set(key, mat);
  if (!T) return mat; // (no tint: the kit's own colours)
  // (the uniforms live on the material, so setKitTint can change them after it compiles)
  const u = {
    uWarm: { value: new THREE.Color() }, uCool: { value: new THREE.Color() }, uGrey: { value: new THREE.Color() }, uGreyK: { value: 0 },
    uRim: { value: new THREE.Color() }, uBoost: { value: 1 },
  };
  mat.userData.uniforms = u;
  setTintUniforms(u, T);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWarm;\nuniform vec3 uCool;\nuniform vec3 uGrey;\nuniform float uGreyK;\nuniform vec3 uRim;\nuniform float uBoost;')
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  vec3 c = texel.rgb;
  float mx = max( c.r, max( c.g, c.b ) );
  float mn = min( c.r, min( c.g, c.b ) );
  float sat = mx > 1e-4 ? ( mx - mn ) / mx : 0.0;
  float hue = 0.0;
  if ( mx > mn ) {
    float d = mx - mn;
    hue = mx == c.r ? mod( ( c.g - c.b ) / d, 6.0 ) : mx == c.g ? ( c.b - c.r ) / d + 2.0 : ( c.r - c.g ) / d + 4.0;
    hue /= 6.0;
  }
  float warm = 1.0 - smoothstep( 0.17, 0.24, hue ) * ( 1.0 - smoothstep( 0.88, 0.95, hue ) );
  // (the kits' slate greys count as grey: only clearly coloured texels become brass / copper)
  // (capped: the kits' near-white texels never blow out to white in Gearhaven's warm sun)
  vec3 metal = mix( uCool, uWarm, warm ) * clamp( mx * 1.5 + 0.2, 0.3, 1.0 );
  vec3 g = mix( c, uGrey * clamp( mx * 2.2 + 0.08, 0.12, 0.9 ), uGreyK );
  c = mix( g, metal, smoothstep( 0.4, 0.58, sat ) );
  diffuseColor.rgb *= c * uBoost;
  diffuseColor.a *= texel.a;
#endif`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 2.5 );\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'gearhavenKit';
  mat.userData.tint = tint;
  return mat;
}

function setTintUniforms(u, T) {
  u.uWarm.value.set(T.warm);
  u.uCool.value.set(T.cool);
  u.uGrey.value.set(T.grey);
  u.uGreyK.value = T.greyK;
  u.uRim.value.set(T.rim ?? 0).multiplyScalar(T.rimK ?? 0);
  u.uBoost.value = T.boost ?? 1;
}

/** Change a tint (`K.tints[tint]` ← T) on every kit material already made with it (a Gearhaven look). */
export function setKitTint(tint, T) {
  K.tints[tint] = { ...K.tints[tint], ...T };
  for (const mat of materials.values()) if (mat.userData.tint === tint && mat.userData.uniforms) setTintUniforms(mat.userData.uniforms, K.tints[tint]);
}

/** Plain brass / copper / iron Lambert for the gear props (shared; `name` from `K.metals`). */
export function metalMaterial(name) {
  const key = `metal/${name}`;
  if (!materials.has(key)) {
    const M = K.metals[name];
    materials.set(key, new THREE.MeshLambertMaterial({ color: M.color, emissive: M.emissive ?? 0x000000 }));
  }
  return materials.get(key);
}

/**
 * Instanced copies of one piece: `items` = [{ pos, yaw?, pitch?, roll?, scale (number or
 * [x, y, z]) }] (or a Matrix4 each). Its bounds cover them all (so it culls as a whole).
 */
export function instancePiece(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  const m = new THREE.Matrix4();
  items.forEach((it, i) => mesh.setMatrixAt(i, it.isMatrix4 ? it : placeMatrix(it, m)));
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox?.();
  return mesh;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** A matrix from { pos, yaw, pitch, roll, scale } (YXZ: turned to `yaw`, then tilted). */
export function placeMatrix(it, m = new THREE.Matrix4()) {
  _e.set(it.pitch ?? 0, it.yaw ?? 0, it.roll ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  const s = it.scale ?? 1;
  if (Array.isArray(s)) _s.set(...s);
  else _s.setScalar(s);
  return m.compose(it.pos, _q, _s);
}

/**
 * Static pieces merged into as few meshes as possible: `items` = [{ geometry, matrix, chunk? }]
 * (geometry null → skipped); one Mesh per chunk key, all sharing `material`. Returns a Group.
 */
export function mergeStatic(items, material, name = 'kitStatic') {
  const chunks = new Map();
  for (const it of items) {
    if (!it.geometry) continue;
    const key = it.chunk ?? 0;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(it.geometry.clone().applyMatrix4(it.matrix));
  }
  const group = new THREE.Group();
  group.name = name;
  for (const parts of chunks.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.geometry.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/**
 * Parts of one model in different flat colours merged into a single mesh (one draw): `parts` =
 * [[geometry, colour, role?]] → a Mesh with vertex colours on a Lambert material (`extra` its
 * options). `userData.colorParts` = [{ start, count, role }] (vertex ranges: recolorMerge).
 */
export function colorMerge(parts, extra = {}) {
  const col = new THREE.Color();
  const ranges = [];
  let start = 0;
  const geos = parts.map(([geo, color, role]) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    col.set(color);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) c.set([col.r, col.g, col.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    ranges.push({ start, count: g.attributes.position.count, role });
    start += g.attributes.position.count;
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }));
  mesh.userData.colorParts = ranges;
  return mesh;
}

/** Repaint a colorMerge mesh: each part with a role gets `colorOf(role)` (a colour value). */
export function recolorMerge(mesh, colorOf) {
  const attr = mesh.geometry.attributes.color;
  const col = new THREE.Color();
  for (const r of mesh.userData.colorParts ?? []) {
    if (!r.role) continue;
    col.set(colorOf(r.role));
    for (let i = r.start; i < r.start + r.count; i++) attr.setXYZ(i, col.r, col.g, col.b);
  }
  attr.needsUpdate = true;
}
