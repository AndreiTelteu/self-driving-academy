import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: '.pbi-validation-020/cache',
  build: {
    outDir: '.pbi-validation-020/dist',
    rollupOptions: {
      input: {
        recovery: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('../../../index.html', import.meta.url)),
        bootstrap: fileURLToPath(new URL('./bootstrap.html', import.meta.url)),
      },
    },
  },
  preview: { host: '0.0.0.0', port: 5179, strictPort: true },
};
