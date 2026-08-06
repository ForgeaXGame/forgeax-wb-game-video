import { getWorkbenchHost } from '../../lib/workbench-host'

export interface GameComponentModule {
  // Game-owned modules are untyped ESM at this boundary. Consumers recover the
  // concrete host shape through gameComponentRegister<Host>().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register?: (host: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: { register?: (host: any) => void } | ((host: any) => void)
}

export function gameComponentRegister<Host>(
  module: GameComponentModule,
): ((host: Host) => void) | null {
  if (typeof module.register === 'function') return module.register as (host: Host) => void
  if (typeof module.default === 'function') return module.default as (host: Host) => void
  if (typeof module.default === 'object' && typeof module.default?.register === 'function') {
    return module.default.register as (host: Host) => void
  }
  return null
}

function moduleUrls(gameId: string, base: string): string[] {
  const urls: string[] = []
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  // The source adapter is authoritative during Vite development. Trying the
  // Workbench build-artifact endpoint first produces an expected 404 for
  // source-only game controls, which browsers still report as a console error.
  if (isDev) urls.push(`${base}/@game-components/${encodeURIComponent(gameId)}/index.js`)
  try {
    const url = getWorkbenchHost().gameComponents.moduleUrl('index.js')
    if (url) urls.push(url)
  } catch {
    // The standalone development page has no accepted workbench context.
  }
  return [...new Set(urls)]
}

/**
 * Resolves a game-owned component module from the accepted host context, then
 * falls back to this extension's development-only source adapter.
 */
export async function importGameComponentModule(
  gameId: string,
  base = '',
): Promise<GameComponentModule | null> {
  for (const url of moduleUrls(gameId, base)) {
    try {
      const module = (await import(/* @vite-ignore */ url)) as GameComponentModule
      if (gameComponentRegister(module)) return module
    } catch {
      // A missing build artifact can fall through to the local development source.
    }
  }
  return null
}
