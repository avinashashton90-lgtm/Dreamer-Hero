import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    // three.js in its own chunk (~700 kB): the game's code stays small and the engine is cached
    // by the browser across game updates.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } } },
  },
  server: { host: true },
});
