import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 7820,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
