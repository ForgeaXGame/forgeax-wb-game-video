/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import type { ConfigEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createViteWorkbenchPlugin } from '@forgeax/workbench-host/vite'
import { createGameComponentsSourcePlugin } from './server/dev-component-source'
import { createDevWorkbenchHost } from './server/dev-host'

export default defineConfig(({ command }: ConfigEnv) => ({
  base: process.env.VITE_PLUGIN_BASE
    ?? (process.env.WB_GAME_VIDEO_PLUGIN_BUILD === '1' ? '/extensions/wb-game-video/' : './'),
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
        createViteWorkbenchPlugin(createDevWorkbenchHost()),
        createGameComponentsSourcePlugin({ workspaceRoot: resolve(__dirname, '../../../..') }),
      ]
      : []),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    host: true,
    port: 15185,
    strictPort: true,
    allowedHosts: true as const,
    fs: { allow: [resolve(__dirname, '../../../..')] },
    // dev 下 `/api/*`（kino 直连 HTTP 路由 + ToolRegistry 调用）转发到 forgeax server，
    // 与 rebase 前行为一致；host-ssot 重写移除了该代理，standalone dev 的生成链路会双双 404。
    proxy: {
      '/api': process.env.FORGEAX_SERVER_URL
        ?? `http://localhost:${process.env.FORGEAX_SERVER_PORT ?? process.env.PORT_SERVER ?? 18900}`,
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.RS_NO_SOURCEMAP === '1' ? false : true,
  },
}))
