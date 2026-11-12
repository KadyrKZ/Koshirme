import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', bundle: true, format: 'esm', target: 'chrome120' }),
  build({ entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', target: 'chrome120' }),
  build({ entryPoints: ['src/popup/index.ts'], outfile: 'dist/popup.js', bundle: true, format: 'iife', target: 'chrome120' }),
]);
await cp('public', 'dist', { recursive: true });
console.log('Load apps/chrome-extension/dist in chrome://extensions');
