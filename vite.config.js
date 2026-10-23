import { defineConfig } from 'vite';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// The sound files present in public/audio/ (any depth: voice/ too), as `virtual:audio-files`:
// the game only fetches files that exist, so a missing one never makes a 404 — it just plays the
// synthesized fallback (src/audio.js). Re-scanned when a file is added or removed in dev.
const AUDIO_DIR = 'public/audio';
const AUDIO_EXT = /\.(ogg|mp3)$/i;
function listAudio(dir = AUDIO_DIR) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listAudio(p));
    else if (AUDIO_EXT.test(name)) out.push(relative(AUDIO_DIR, p).split('\\').join('/'));
  }
  return out.sort();
}
function audioFiles() {
  const id = 'virtual:audio-files';
  const resolved = '\0' + id;
  return {
    name: 'audio-files',
    resolveId: (s) => (s === id ? resolved : null),
    load: (s) => (s === resolved ? `export default ${JSON.stringify(listAudio())};` : null),
    configureServer(server) {
      const refresh = (file) => {
        if (!file.replace(/\\/g, '/').includes(AUDIO_DIR) || !AUDIO_EXT.test(file)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [audioFiles()],
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
