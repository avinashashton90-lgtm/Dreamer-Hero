// Writes public/audio/README.md from the sound catalog (src/soundCatalog.js) and the dialogue
// lines (src/config.js DIALOGUE via soundscape.js LINE_IDS): every sound name, the file that
// replaces its synthesized fallback, and a one-line description.
// Usage: npm run audio:readme   (the audio test checks the file is up to date)
import { writeFileSync } from 'node:fs';
import { buildAudioReadme } from './audio-readme-text.mjs';

writeFileSync(new URL('../public/audio/README.md', import.meta.url), buildAudioReadme());
console.log('public/audio/README.md written');
