import { forgeaxHttp } from './forgeax-http'

const RAW_BASE = import.meta.env.BASE_URL ?? '/'

function basePrefix(rawBase: string): string {
  if (!rawBase || rawBase === './') return ''
  return rawBase.replace(/\/$/, '')
}

/** Resolves an extension-relative media path from the accepted handshake. */
export function pluginUrl(path: string, rawBase = RAW_BASE): string {
  if (/^(?:https?:|blob:|data:)/.test(path)) return path
  if (!path.startsWith('/')) return path
  if (/^\/api(?:\/|$|\?)/.test(path)) return path
  const prefix = basePrefix(rawBase)
  if (!prefix || path === prefix || path.startsWith(`${prefix}/`)) return path
  return `${prefix}${path}`
}

export function pluginFetch(
  input: string,
  init?: RequestInit,
  rawBase = RAW_BASE,
): Promise<Response> {
  return forgeaxHttp.fetch(pluginUrl(forgeaxHttp.rewriteUrl(input), rawBase), init)
}
