import { injectStyleOnce } from '../../styles/injectStyle'
import { AssetLibraryPanel } from '../assets/AssetLibraryPanel'
import { type AssetLibraryClient, useAssetLibrary } from '../assets/assetLibraryClient'
import { getGameSlug } from '../persist/gameScope'

const CSS = `
.alp-root { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: column; }
.alp-root > .gc-tab { flex: 1; }
.alp-unavailable,.alp-error,.alp-loading { margin: 12px 12px 0; padding: 8px 10px; border: 1px solid var(--color-border-default); border-radius: 8px; font-size: 12px; color: var(--color-text-secondary); background: var(--color-background-elevated); }
.alp-error { color: var(--color-text-danger); }
.alp-head-actions { display: inline-flex; align-items: center; gap: 4px; }
.alp-upload,.alp-refresh { position: relative; display: inline-flex; min-height: 26px; align-items: center; justify-content: center; padding: 0 7px; border: 1px solid var(--color-border-default); border-radius: 6px; color: var(--color-text-secondary); background: var(--color-background-elevated); font-size: 10px; cursor: pointer; }
.alp-upload input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
.alp-upload[aria-disabled="true"],.alp-refresh:disabled { opacity: .45; cursor: not-allowed; }
.alp-upload[aria-disabled="true"] input { cursor: not-allowed; }
.alp-stage { align-items: flex-start; overflow: auto; }
.alp-stage h2 { margin: 0; color: var(--color-text-primary); font-size: 18px; }
.alp-image { width: min(100%, 640px); max-height: 58dvh; object-fit: contain; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-background-canvas); }
.alp-audio { width: min(100%, 640px); }
.alp-preview-icon,.alp-empty { display: grid; min-height: 160px; width: min(100%, 640px); place-items: center; border: 1px dashed var(--color-border-default); border-radius: 8px; color: var(--color-text-tertiary); }
.alp-dialog-backdrop { position: fixed; inset: 0; z-index: var(--z-app-modal); display: grid; place-items: center; background: var(--color-overlay-modal); }
.alp-dialog { display: flex; width: min(400px, calc(100% - 32px)); flex-direction: column; gap: 14px; padding: 16px; border: 1px solid var(--color-border-default); border-radius: 10px; color: var(--color-text-primary); background: var(--color-background-base); }
.alp-dialog label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.alp-dialog input { padding: 8px; border: 1px solid var(--color-border-default); border-radius: 6px; color: var(--color-text-primary); background: var(--color-background-elevated); }
.alp-dialog > div { display: flex; justify-content: flex-end; gap: 8px; }
.alp-dialog button { padding: 6px 10px; border: 1px solid var(--color-border-default); border-radius: 6px; color: var(--color-text-primary); background: var(--color-background-elevated); cursor: pointer; }
.alp-dialog button:last-child { color: var(--color-text-on-bright-primary); border-color: var(--primary); background: var(--primary); }
.alp-dialog button:disabled { opacity: .45; cursor: not-allowed; }
`

export function GraphAssetView({ client }: { client?: AssetLibraryClient }): JSX.Element {
  injectStyleOnce('graph-asset-view', CSS)
  const controller = useAssetLibrary(getGameSlug() ?? 'game-nodia-fighting', client)
  return <AssetLibraryPanel controller={controller} />
}
