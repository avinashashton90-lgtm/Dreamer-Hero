// Lets the headless tests load the real hero (public/models/hero/*.fbx) and horse
// (public/models/horse/horse.gltf) in Node: files are read
// from disk, embedded textures are skipped (nothing is rendered), and the few browser globals
// FBXLoader touches are stubbed.
import * as THREE from 'three';
import fs from 'node:fs';

globalThis.self ??= globalThis;
globalThis.window ??= { innerWidth: 1280, innerHeight: 720, dispatchEvent() {} };
// GLTFLoader fetches the horse's embedded (data: URI) buffer and reports progress events.
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    Object.assign(this, { lengthComputable: false, loaded: 0, total: 0, ...init });
  }
};
// No images in Node: textures stay empty but still report "loaded" (GLTFLoader waits for them),
// and WebP counts as supported (EXT_texture_webp in the girl's glb).
THREE.TextureLoader.prototype.load = function (url, onLoad) {
  const t = new THREE.Texture();
  if (onLoad) setTimeout(() => onLoad(t));
  return t;
};
globalThis.Image ??= class {
  set src(v) {
    setTimeout(() => {
      this.height = this.width = 1;
      this.onload?.();
    });
  }
};

const publicDir = new URL('../public/', import.meta.url);

/**
 * Options for `new Hero(scene, world, heroAssets)` and `new Horse(scene, world, heroAssets)`.
 * HERO_PLACEHOLDER=1 tests the fallback (placeholder) hero and horse.
 */
export const heroAssets = {
  placeholder: !!process.env.HERO_PLACEHOLDER,
  readFile: async (url) => {
    const b = fs.readFileSync(new URL(url, publicDir));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
};
