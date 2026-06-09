import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SRC_DIR = new URL('./src/', import.meta.url).pathname;
const SHARED_DIR = new URL('./shared/', import.meta.url).pathname;

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
    port: 15175,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
