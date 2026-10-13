// Lets the headless tests load the real hero (public/models/hero/*.fbx) in Node: files are read
// from disk, embedded textures are skipped (nothing is rendered), and the few browser globals
// FBXLoader touches are stubbed.
import * as THREE from 'three';
import fs from 'node:fs';

globalThis.self ??= globalThis;
globalThis.window ??= { innerWidth: 1280, innerHeight: 720, dispatchEvent() {} };
THREE.TextureLoader.prototype.load = function () {
  return new THREE.Texture();
};

const publicDir = new URL('../public/', import.meta.url);

/** Options for `new Hero(scene, world, heroAssets)`. HERO_PLACEHOLDER=1 tests the fallback hero. */
export const heroAssets = {
  placeholder: !!process.env.HERO_PLACEHOLDER,
  readFile: async (url) => {
    const b = fs.readFileSync(new URL(url, publicDir));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
};
