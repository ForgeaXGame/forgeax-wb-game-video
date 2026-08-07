/**
 * component-host —— 「组件基建」SSOT（注册表宿主 + 每游戏组件加载器 + 宿主 API）。
 * 归属 runtime：来源/依赖/使用都在 runtime 层（只消费 registry / skins；被 editor+runtime 消费）。
 *
 * 分层（对齐 2026-07-22 game-package-storage-design D2/D5/D6/D10）：
 *   · **平台内建集**（`runtime/component-host/components` 的默认表现/交互/overlay 组件）——
 *     作为 built-in / fallback，永远先注册，保证运行时可用。
 *   · **公共组件** `runtime/component-host/components/`（真正跨游戏共享；现可空）。
 *   · **游戏专属组件** 住各游戏仓 `components/` → 构建产物 `dist/components/index.js`，
 *     运行时经 `loadGameComponents(slug)` 动态加载并注册（失败静默回落内建集）。
 *
 * 游戏组件包契约：`dist/components/index.js` 导出 `register(host)`，用宿主注入的
 * `ComponentHostApi`（含共享 React / 注册函数）挂组件与渲染器——游戏产物不自带 React
 * 副本，也不重复实现注册表。
 */
import * as React from 'react'
import {
  ComponentRegistry,
  registerComponent,
  type ComponentDef,
} from '../registry/component-registry'
import type { ComponentManifest } from '../schema/node-config-schema'
import {
  registerOverlayRenderer,
  SkinRegistry,
} from './rendererRegistry'
import components from './components'
import { getWorkbenchHost } from '../../lib/workbench-host'

export interface ComponentHostApi {
  /** 共享 React（游戏产物 externalize react → 用这份，避免双实例）。 */
  React: typeof React
  registerComponent: (id: string, def: ComponentDef) => void
  registerOverlayRenderer: typeof registerOverlayRenderer
}

export interface GameComponentModule {
  register?: (host: ComponentHostApi) => void
  default?: { register?: (host: ComponentHostApi) => void } | ((host: ComponentHostApi) => void)
}

function hostApi(): ComponentHostApi {
  return {
    React,
    registerComponent,
    registerOverlayRenderer,
  }
}

/** 新建一份只安装内建组件契约的隔离表。 */
export function createDefaultComponentRegistry(): ComponentRegistry {
  const registry = new ComponentRegistry()
  for (const { manifest } of components) {
    registry.registerComponent(manifest.id, manifest as ComponentDef)
  }
  return registry
}

/** 新建一份只安装内建组件渲染器的隔离表。 */
export function createCoreSkinRegistry(): SkinRegistry {
  const registry = new SkinRegistry()
  for (const { component, manifest } of components) {
    registry.registerOverlayRenderer(manifest.id, component, manifest as ComponentManifest)
  }
  return registry
}

let coreRegistered = false
/** 注册内建组件到默认契约表与渲染表（幂等）。 */
export function registerCoreSkins(): void {
  if (coreRegistered) return
  coreRegistered = true
  for (const { component, manifest } of components) {
    registerComponent(manifest.id, manifest as ComponentDef)
    registerOverlayRenderer(manifest.id, component, manifest as ComponentManifest)
  }
}

let builtinsBooted = false
/** 注册平台内建组件集（幂等，永远先跑）。 */
export function registerBuiltins(): void {
  if (builtinsBooted) return
  builtinsBooted = true
  registerCoreSkins()
}

const loadedGames = new Set<string>()

function pickRegister(mod: GameComponentModule): ((host: ComponentHostApi) => void) | null {
  if (typeof mod.register === 'function') return mod.register
  if (typeof mod.default === 'function') return mod.default
  if (typeof mod.default === 'object' && typeof mod.default?.register === 'function') return mod.default.register
  return null
}

/**
 * 加载并注册某游戏仓的专属组件。模块来源由 Workbench Host 决定；
 * 开发期可转译源码，生产环境提供构建产物。
 * 都拿不到 / 无 `register` → 静默 false，运行时继续用内建集（fail-soft）。
 */
export async function loadGameComponents(slug: string | undefined): Promise<boolean> {
  if (!slug || loadedGames.has(slug)) return false
  loadedGames.add(slug)
  const url = (() => {
    try {
      return getWorkbenchHost().gameComponents.moduleUrl('index.js')
    } catch {
      return null
    }
  })()
  if (url) {
    try {
      const mod = (await import(/* @vite-ignore */ url)) as GameComponentModule
      const reg = pickRegister(mod)
      if (reg) {
        reg(hostApi())
        return true
      }
    } catch {
      /* 模块不可用 → 回落内建集 */
    }
  }
  loadedGames.delete(slug)
  return false
}

/** Boot：先内建集（必成），再尽力加载游戏专属组件（可失败）。 */
export async function bootComponents(slug?: string): Promise<void> {
  registerBuiltins()
  await loadGameComponents(slug)
}
