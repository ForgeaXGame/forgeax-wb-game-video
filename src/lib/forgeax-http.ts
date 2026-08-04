export type RewriteRule = {
  from: RegExp
  to: string
}

export type ForgeaxHttpDefaults = {
  rewrite: RewriteRule[]
}

export type ForgeaxHttp = {
  defaults: ForgeaxHttpDefaults
  fetch: typeof fetch
  rewriteUrl: (url: string) => string
}

export function assertRewriteRules(rules: RewriteRule[]): void {
  if (!Array.isArray(rules)) {
    throw new Error('[forgeaxHttp] rewrite must be an array')
  }
  for (const [i, rule] of rules.entries()) {
    if (!(rule?.from instanceof RegExp) || typeof rule?.to !== 'string') {
      throw new Error(`[forgeaxHttp] invalid rewrite rule at index ${i}`)
    }
  }
}

/**
 * Rules match a *path*, so only URLs that own one can be rewritten: http(s)
 * absolutes and root-relative paths. Opaque schemes (`blob:`, `data:`) and
 * document-relative paths carry no stable path to match, and round-tripping
 * them through `new URL` would corrupt them.
 */
function splitUrl(
  url: string,
): { origin: string; path: string; search: string; hash: string; absolute: boolean } | null {
  const absolute = /^https?:\/\//i.test(url)
  if (!absolute && !url.startsWith('/')) return null
  if (url.startsWith('//')) return null
  let u: URL
  try {
    u = new URL(url, 'http://forgeax.local')
  } catch {
    return null
  }
  return {
    origin: absolute ? u.origin : '',
    path: u.pathname,
    search: u.search,
    hash: u.hash,
    absolute,
  }
}

export function rewriteUrlWithRules(url: string, rules: RewriteRule[]): string {
  const parts = splitUrl(url)
  if (!parts) return url
  let path = parts.path
  for (const rule of rules) {
    if (!rule.from.test(path)) continue
    path = path.replace(rule.from, rule.to)
    break
  }
  const rest = `${path}${parts.search}${parts.hash}`
  return parts.absolute ? `${parts.origin}${rest}` : rest
}

export function createForgeaxHttp(
  defaults?: Partial<ForgeaxHttpDefaults>,
): ForgeaxHttp {
  const state: ForgeaxHttpDefaults = {
    rewrite: defaults?.rewrite ? [...defaults.rewrite] : [],
  }
  assertRewriteRules(state.rewrite)

  const rewriteUrl = (url: string) => rewriteUrlWithRules(url, state.rewrite)

  const wrappedFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string') {
      return globalThis.fetch(rewriteUrl(input), init)
    }
    if (input instanceof URL) {
      return globalThis.fetch(rewriteUrl(input.href), init)
    }
    const next = rewriteUrl(input.url)
    if (next === input.url) return globalThis.fetch(input, init)
    return globalThis.fetch(new Request(next, input), init)
  }

  return {
    defaults: state,
    fetch: wrappedFetch,
    rewriteUrl,
  }
}

export const forgeaxHttp = createForgeaxHttp()

/** Host-init refcount: clear rewrite only when last consumer releases. */
let hostInitCount = 0

export function acquireHostInit(rules: RewriteRule[] | undefined): void {
  const next = rules ?? []
  assertRewriteRules(next)
  forgeaxHttp.defaults.rewrite = [...next]
  hostInitCount += 1
}

export function releaseHostInit(): void {
  if (hostInitCount <= 0) return
  hostInitCount -= 1
  if (hostInitCount === 0) {
    forgeaxHttp.defaults.rewrite = []
  }
}

export function resetHostInitForTests(): void {
  hostInitCount = 0
  forgeaxHttp.defaults.rewrite = []
}
