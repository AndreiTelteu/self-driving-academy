import { defineConfig } from 'vite';

/**
 * PBI 160 — build de producție pentru livrare statică.
 *
 * `base: './'` face toate referințele din `dist/index.html` relative, deci artefactul poate fi
 * servit dintr-un director static oarecare (rădăcină de site sau subdirector), fără server de
 * dezvoltare și fără rescrierea căilor. `sourcemap: false` ține sursele în afara livrării, iar
 * `emptyOutDir` garantează că un build nu păstrează artefacte vechi.
 *
 * Contractul complet (artefacte, mărimi, WASM, verificarea HTTP statică, buget) este produs de
 * `scripts/build-report.mjs`; acest fișier configurează doar buildul și nu definește bugete.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    // Mărimile reale (inclusiv gzip) sunt raportate de scriptul de build, nu de logger-ul Vite.
    reportCompressedSize: false,
  },
});
