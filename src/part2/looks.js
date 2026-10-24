import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { setKitTint, colorMerge, recolorMerge } from '../kits.js';

// Gearhaven's looks (CONFIG.part2.looks, the one in use `part2.gearhavenLook`): "Verdigris Dusk",
// "Midnight Clockwork" and "Sunrise Brass". Every part of Gearhaven takes its colours from the
// look by role — 'structure', 'steel', 'darkSteel', 'brass', 'copper', 'trim', 'stone' (a list:
// buildings), 'roof', 'towerStone', 'ground' — through roleMaterial / roleMerge / roleInstances /
// onLook, which remember what they painted so applyLook() repaints it all when the look changes
// (the ?debug "Look" button). The kit tints (factory, railSupports, skyline) switch with it.
// buildLookRig(): the sky (a gradient dome round the camera, no fog), the hemisphere light, the
// sun, and a few amber point lights put on the lamps nearest AJ each frame.

const P2 = CONFIG.part2;
const LK = P2.looks;

/** The look in use. */
export function look() {
  return LK[P2.gearhavenLook] ?? LK[LK.order[0]];
}

const painted = { mats: [], merged: [], instanced: [], hooks: [] };
const col = new THREE.Color();

/** The look's colour for a role (a list role → its `i`-th, wrapping). */
export function roleColor(role, i = 0) {
  const v = look().palette[role];
  return Array.isArray(v) ? v[i % v.length] : v;
}

/** A Lambert material in a role's colour (repainted with the look). */
export function roleMaterial(role, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ color: roleColor(role), ...extra });
  painted.mats.push({ m, role });
  return m;
}

/** colorMerge (one draw) with a role per part: `parts` = [[geometry, role]]. */
export function roleMerge(parts, extra = {}) {
  const mesh = colorMerge(parts.map(([g, role]) => [g, roleColor(role), role]), extra);
  painted.merged.push(mesh);
  return mesh;
}

/** Instance colours by role: `roles` = [[role, index?]] one per instance. */
export function roleInstances(mesh, roles) {
  const entry = { mesh, roles };
  paintInstances(entry);
  painted.instanced.push(entry);
  return mesh;
}

function paintInstances({ mesh, roles }) {
  roles.forEach(([role, i], k) => mesh.setColorAt(k, col.set(roleColor(role, i ?? 0))));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Anything else the look decides: `fn(look)` now and after every change. */
export function onLook(fn) {
  painted.hooks.push(fn);
  fn(look());
}

/** Switch to the look `name` (or re-apply the current one): kit tints, every role, every hook. */
export function applyLook(name = P2.gearhavenLook) {
  if (LK[name]) P2.gearhavenLook = name;
  const L = look();
  for (const [tint, T] of Object.entries(L.tints)) setKitTint(tint, T);
  for (const { m, role } of painted.mats) m.color.set(roleColor(role));
  for (const mesh of painted.merged) recolorMerge(mesh, (role) => roleColor(role));
  for (const e of painted.instanced) paintInstances(e);
  for (const fn of painted.hooks) fn(L);
  return L;
}

/** The next look in `looks.order` (cycling), applied. */
export function nextLook() {
  const i = LK.order.indexOf(P2.gearhavenLook);
  return applyLook(LK.order[(i + 1) % LK.order.length]);
}

/** Set the look's kit tints before any kit material is made (so they start right). */
export function primeLookTints() {
  for (const [tint, T] of Object.entries(look().tints)) setKitTint(tint, T);
}

/**
 * The sky and lights for Gearhaven's scene: a gradient dome (top → horizon → below; drawn first,
 * no fog, following the camera), the hemisphere light, the sun and `looks.lights` amber point
 * lights. `update(camera, target, spots)` moves the dome with the camera and the point lights
 * onto the lamp spots nearest `target`.
 */
export function buildLookRig(scene) {
  const D = LK.dome;
  const u = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() }, uBand: { value: D.horizon } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(D.radius, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir;\nvoid main() {\n  vDir = normalize( position );\n  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}',
      fragmentShader: `uniform vec3 uTop;\nuniform vec3 uHorizon;\nuniform vec3 uBelow;\nuniform float uBand;\nvarying vec3 vDir;
void main() {
  float y = vDir.y;
  vec3 c = y >= 0.0 ? mix( uHorizon, uTop, pow( smoothstep( 0.0, 1.0 - uBand, y ), 0.7 ) ) : mix( uHorizon, uBelow, smoothstep( 0.0, uBand, -y ) );
  gl_FragColor = vec4( c, 1.0 );
  #include <colorspace_fragment>
}`,
    }),
  );
  dome.name = 'skyDome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const points = Array.from({ length: LK.lights }, () => {
    const p = new THREE.PointLight(0xffffff, 0, 1, 2);
    p.position.set(0, -500, 0);
    return p;
  });
  scene.add(dome, hemi, sun, ...points);
  onLook((L) => {
    u.uTop.value.set(L.sky.top);
    u.uHorizon.value.set(L.sky.horizon);
    u.uBelow.value.set(L.sky.below);
    hemi.color.set(L.hemi.sky);
    hemi.groundColor.set(L.hemi.ground);
    hemi.intensity = L.hemi.intensity;
    sun.color.set(L.sun.color);
    sun.intensity = L.sun.intensity;
    sun.position.set(...L.sun.dir).normalize().multiplyScalar(50);
    for (const p of points) {
      p.color.set(L.lamps.color);
      p.intensity = L.lamps.intensity;
      p.distance = L.lamps.distance;
    }
    if (scene.fog) scene.fog.color.set(L.fog);
    if (scene.background?.isColor) scene.background.set(L.fog);
  });
  const update = (camera, target, spots = []) => {
    dome.position.copy(camera.position);
    // (the lamps nearest AJ get the lights; the rest of the pool waits far below)
    const near = target ? spots.map((s) => [s, s.distanceToSquared(target)]).sort((a, b) => a[1] - b[1]).slice(0, points.length) : [];
    points.forEach((p, i) => (near[i] ? p.position.copy(near[i][0]) : p.position.set(0, -500, 0)));
  };
  return { dome, hemi, sun, points, update };
}

/**
 * Steam puffs' material: a soft warm white, normal-blended and lit (so the underside shades a
 * little: a faint shadow that keeps them visible over the silver floor), from the look's `steam`.
 */
export function steamMaterial(extra = {}) {
  const m = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, ...extra });
  onLook((L) => {
    m.color.set(L.steam.color);
    m.emissive.set(L.steam.emissive);
    m.opacity = L.steam.opacity;
  });
  return m;
}

/** A glow (MeshBasic, additive when `additive`) whose colour / opacity follow `pick(look)` → [colour, opacity]. */
export function lookGlow(pick, { additive = false, fog = true } = {}) {
  const m = new THREE.MeshBasicMaterial({ transparent: additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog });
  onLook((L) => {
    const [c, o] = pick(L);
    m.color.set(c);
    if (o != null) m.opacity = o;
  });
  return m;
}
