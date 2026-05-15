// P4.2 前驱 placeholder entry shim — @kubeela-plugin/cli-codex (kind=cli-provider)
// modules/02 §530 schemaValidation step #3 requires entry.backend file to exist.
// Phase 6+ will replace this with the actual ChatRequest runner shim that spawns
// `codex exec --json` (subprocess-jsonl adapter via server-side CodexProvider)
// and bridges its ChatEvent streams onto the Bus. Until then: import is
// side-effect free; calling activate()/createCliProvider() throws.

export interface CliProviderHandle {
  deactivate(): void;
}

const PHASE_6_PLUS_MESSAGE =
  "[Phase 6+ shim] @kubeela-plugin/cli-codex · CliProvider runner 未实现。" +
  "当前为 marketplace placeholder · Phase 6+ 拆 plugin 时填实际 codex exec --json subprocess 适配";

export function activate(_ctx: unknown): CliProviderHandle {
  throw new Error(PHASE_6_PLUS_MESSAGE);
}

export function createCliProvider(): never {
  throw new Error(PHASE_6_PLUS_MESSAGE);
}

export const __placeholder = true as const;
