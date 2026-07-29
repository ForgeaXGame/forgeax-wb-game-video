import { getWorkbenchHost } from './workbench-host'

/** Legacy media callers keep their already-resolved source unchanged. */
export function pluginUrl(path: string): string {
  return path
}

export function pluginFetch(input: string, init?: RequestInit): Promise<Response> {
  if (/^(?:https?:|blob:|data:)/.test(input)) return fetch(input, init)
  return getWorkbenchHost().extension.fetch(input, init)
}
