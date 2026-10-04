import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 800 }, // three.js alone is ~550 kB
  server: { host: true },
});
