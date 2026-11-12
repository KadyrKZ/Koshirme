import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
export default defineConfig({
  main: { build: { externalizeDeps: { exclude: ['@koshirme/protocol'] } } },
  preload: { build: { externalizeDeps: { exclude: ['@koshirme/protocol'] } } },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    server: { port: 5174, strictPort: true },
  },
});
