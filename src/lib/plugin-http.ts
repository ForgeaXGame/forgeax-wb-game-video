import { forgeaxHttp } from './forgeax-http'
import { getWorkbenchHost } from './workbench-host'

/** Resolves an extension-relative media path from the accepted handshake. */
export function pluginUrl(path: string): string {
  if (/^(?:https?:|blob:|data:)/.test(path)) return path
  const rewritten = forgeaxHttp.rewriteUrl(path)
  if (/^(?:https?:|blob:|data:)/.test(rewritten)) return rewritten
  return getWorkbenchHost().extension.url(rewritten)
}

/**
 * Rewrite the logical path once, then dispatch through the workbench host
 * (or raw fetch for absolute/opaque URLs).
 */
export function pluginFetch(input: string, init?: RequestInit): Promise<Response> {
  const rewritten = forgeaxHttp.rewriteUrl(input)
  if (/^(?:https?:|blob:|data:)/.test(rewritten)) return fetch(rewritten, init)
  return getWorkbenchHost().extension.fetch(rewritten, init)
}
