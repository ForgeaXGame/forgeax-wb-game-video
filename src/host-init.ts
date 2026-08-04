import {
  acquireHostInit,
  releaseHostInit as releaseRewrite,
  type RewriteRule,
} from './lib/forgeax-http'
import {
  clearWorkbenchHost,
  setWorkbenchHost,
  type WorkbenchHostClient,
} from './lib/workbench-host'

export type WorkbenchInitOptions = {
  rewrite?: RewriteRule[]
  pane?: 'left' | 'center' | null
  slug?: string | null
  /**
   * A ready workbench client for in-process mounts. Without it the extension
   * falls back to the iframe handshake, which has no parent to answer it.
   */
  host?: WorkbenchHostClient
}

/** Refcount so nested in-process mounts do not tear each other's host down. */
let hostCount = 0

export function applyHostInit(options: WorkbenchInitOptions = {}): void {
  acquireHostInit(options.rewrite)
  if (!options.host) return
  setWorkbenchHost(options.host)
  hostCount += 1
}

export function releaseHostInit(): void {
  releaseRewrite()
  if (hostCount <= 0) return
  hostCount -= 1
  if (hostCount === 0) clearWorkbenchHost()
}

export function resetHostInjectionForTests(): void {
  hostCount = 0
  clearWorkbenchHost()
}
