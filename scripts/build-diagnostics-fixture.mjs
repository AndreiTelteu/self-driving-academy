import { build } from 'vite';
import { resolve } from 'node:path';
const stage = process.argv[2] ?? 'final';
if (!['before', 'final', 'development'].includes(stage))
  throw new Error('Unknown diagnostic fixture stage');
await build({
  configFile: false,
  root: resolve('tests/browser/diagnostics'),
  base: './',
  mode: stage === 'development' ? 'development' : 'production',
  cacheDir: resolve('.pbi-validation-019/cache'),
  define:
    stage === 'development'
      ? { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' }
      : {},
  build: {
    outDir: resolve(`.pbi-validation-019/${stage}`),
    emptyOutDir: true,
    sourcemap: true,
    minify: stage === 'development' ? false : 'oxc',
  },
});
