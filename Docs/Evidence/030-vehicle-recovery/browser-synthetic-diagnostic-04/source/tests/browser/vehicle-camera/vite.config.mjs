import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: '.vite-camera017',
  build: {
    outDir: '.camera-preview017',
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
    },
  },
  preview: { host: '0.0.0.0', port: 5177, strictPort: true },
};
