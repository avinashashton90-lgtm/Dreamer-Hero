import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { onLook } from './looks.js';

// Gearhaven's floor (CONFIG.part2.floor; colours from the look's `floor`): polished silver-white
// — never pure white, kept under full brightness — a faint Phong highlight and a sky-coloured
// sheen at grazing angles (no reflections rendered), and faint engravings in a slightly darker
// silver drawn in world space: fine seams, concentric clock rings with hour marks, big gear
// outlines; faded out with distance so they never shimmer. One shader program for every floor:
// the courtyard, the level platforms, the ride's city floor and its path's centre strip
// (`kind` 'centre': the look's darker centre silver).

const FL = CONFIG.part2.floor;

/** A floor material (`kind` 'floor' or 'centre'), repainted with the look. */
export function makeFloorMaterial(kind = 'floor', extra = {}) {
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, ...extra });
  const u = {
    uEngrave: { value: new THREE.Color() }, uEngraveK: { value: 0 }, uSheen: { value: new THREE.Color() },
  };
  mat.userData.uniforms = u;
  mat.userData.kind = kind;
  onLook((L) => {
    const F = L.floor;
    mat.color.set(kind === 'centre' ? F.centre : F.base);
    mat.emissive.set(kind === 'centre' ? F.centre : F.base).multiplyScalar(F.lift); // (a little self-light: silver even at night)
    mat.specular.set(F.specular);
    mat.shininess = F.shininess;
    u.uEngrave.value.set(F.engrave);
    u.uEngraveK.value = F.engraveK;
    u.uSheen.value.set(F.sheen).multiplyScalar(F.sheenK);
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    const f = (v) => v.toFixed(4);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uEngrave;
uniform float uEngraveK;
uniform vec3 uSheen;
varying vec3 vFloorW;
float engLine( float d, float w ) { return 1.0 - smoothstep( w * 0.5, w, abs( d ) ); }
float engraving( vec2 p ) {
  // fine seams
  vec2 g = abs( fract( p / ${f(FL.seam)} ) - 0.5 ) * ${f(FL.seam)};
  float e = max( engLine( g.x - ${f(FL.seam / 2)}, ${f(FL.seamWidth)} ), engLine( g.y - ${f(FL.seam / 2)}, ${f(FL.seamWidth)} ) ) * 0.6;
  // concentric clock rings with hour marks (one centre per cell, one on the origin)
  vec2 c = p - floor( p / ${f(FL.ringCell)} + 0.5 ) * ${f(FL.ringCell)};
  float r = length( c );
  if ( r < ${f(FL.ringMax)} ) {
    e = max( e, engLine( fract( r / ${f(FL.ringStep)} + 0.5 ) * ${f(FL.ringStep)} - ${f(FL.ringStep / 2)}, ${f(FL.ringWidth)} ) );
    float a = atan( c.y, c.x ) / 6.2831853 * ${f(FL.ticks)};
    float tick = engLine( ( fract( a + 0.5 ) - 0.5 ) * r * 6.2831853 / ${f(FL.ticks)}, ${f(FL.ringWidth * 1.6)} );
    e = max( e, tick * step( ${f(FL.ringMax - FL.ringStep)}, r ) );
  }
  // big gear outlines (offset half a cell)
  vec2 q = p + ${f(FL.gearCell / 2)};
  vec2 gc = q - floor( q / ${f(FL.gearCell)} + 0.5 ) * ${f(FL.gearCell)};
  float gr = length( gc );
  float ga = fract( atan( gc.y, gc.x ) / 6.2831853 * ${f(FL.gearTeeth)} );
  float rim = ${f(FL.gearRadius)} + ${f(FL.gearTooth)} * smoothstep( 0.3, 0.38, ga ) * ( 1.0 - smoothstep( 0.62, 0.7, ga ) );
  e = max( e, engLine( gr - rim, ${f(FL.gearWidth)} ) );
  e = max( e, engLine( gr - ${f(FL.gearRadius * 0.35)}, ${f(FL.gearWidth)} ) );
  return e;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float engFade = 1.0 - smoothstep( ${f(FL.fade[0])}, ${f(FL.fade[1])}, length( vViewPosition ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, uEngrave, engraving( vFloorW.xz ) * uEngraveK * engFade );`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uSheen * pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 4.0 );\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'gearhavenFloor';
  return mat;
}
