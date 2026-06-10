import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SRC_DIR = new URL('./src/', import.meta.url).pathname;
const SHARED_DIR = new URL('./shared/', import.meta.url).pathname;
const devPort = Number(process.env.VITE_DEV_PORT ?? 15175);
// Standalone dev: proxy tool/blob calls to the running Studio server. When
// embedded in Studio the dist is served same-origin and this proxy is unused.
const serverOrigin = process.env.FORGEAX_SERVER_ORIGIN ?? 'http://localhost:18900';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@/': SRC_DIR,
      '@shared/': SHARED_DIR,
    },
  },
  server: {
    port: devPort,
    host: true,
    strictPort: true,
    proxy: {
      '/api': { target: serverOrigin, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
