import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

// 用 fileURLToPath 而非 .pathname：后者不会解码 URL，在含空格 / `~` 的路径
// （如 iCloud "Mobile Documents/com~apple~CloudDocs"）下会得到 %20 / %7E 编码
// 的目录，导致 `@/` 别名解析到不存在的编码路径、构建 ENOENT。
// No trailing slash: @rollup/plugin-alias matches a string key only when the
// importee is exactly the key or is followed by `/`. A `@/` key never matches
// `@/lib/...` (the char after `@/` is `l`, not `/`), so build resolution fails.
const SRC_DIR = fileURLToPath(new URL('./src', import.meta.url));
const SHARED_DIR = fileURLToPath(new URL('./shared', import.meta.url));
const devPort = Number(process.env.VITE_DEV_PORT ?? 15176);
// Standalone dev: proxy tool/blob calls to the running Studio server. When
// embedded in Studio the dist is served same-origin and this proxy is unused.
const serverOrigin = process.env.FORGEAX_SERVER_ORIGIN ?? 'http://localhost:18900';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@shared': SHARED_DIR,
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
