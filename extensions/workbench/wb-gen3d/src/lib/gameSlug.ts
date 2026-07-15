// Active game slug — the host iframe (StandalonePluginIframe) injects
// ?slug=<gameSlug> into this plugin's URL. Per-game asset operations (ADR-0002)
// need it on every store-touching tool call. Read it once at module load; the
// iframe is recreated when the active game changes, so a constant is fine.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const slugParam = params.get('slug')?.trim();

// null when no game is active (e.g. the workbench opened without a game). The UI
// renders a disabled/empty state in that case instead of writing to a guessed
// path; the server also rejects store calls without a slug (code: missing_game).
export const activeSlug: string | null = slugParam && slugParam.length > 0 ? slugParam : null;

export function hasActiveGame(): boolean {
  return activeSlug !== null;
}
