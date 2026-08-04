import {
  acquireHostInit,
  releaseHostInit,
  type RewriteRule,
} from './lib/forgeax-http'

export type WorkbenchInitOptions = {
  rewrite?: RewriteRule[]
  pane?: 'left' | 'center' | null
  slug?: string | null
}

export function applyHostInit(options: WorkbenchInitOptions = {}): void {
  acquireHostInit(options.rewrite)
}

export { releaseHostInit }
