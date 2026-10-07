import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: '.pbi-validation-018/cache',
  build: {
    outDir: '.pbi-validation-018/build',
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
  preview: { host: '0.0.0.0', port: 5184, strictPort: true },
};
