import { defineConfig } from 'vite';

/**
 * Local-only Vite config for the 230 playtest page. The repository has no root `vite.config`, so the
 * default dependency scanner crawls every archived `index.html` under `Docs/Evidence`. This config
 * keeps the scan to the single playtest entry and never changes the game build.
 */
export default defineConfig({
  root: process.cwd(),
  optimizeDeps: {
    entries: ['tests/browser/style-sliders/index.html'],
  },
  server: {
    port: 5230,
    strictPort: true,
  },
});
