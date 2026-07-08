import { type Gen3DAssetManifest, selectFile } from '@shared/manifest';
import { blobUrl } from '@/lib/blobUrl';
import { t } from '@/i18n';

function caption(m: Gen3DAssetManifest): string {
  if (m.userLabel?.trim()) return m.userLabel.trim();
  if (m.prompt?.trim()) return m.prompt.trim().split('\n')[0]!.slice(0, 48);
  return m.assetPath.split('/').pop() ?? m.mode;
}

// Disk-backed library of this game's generated props. In split mode this is the
// cross-pane source of truth (the other iframe's generations land here on
// refresh).
export function AssetLibrary({
  assets,
  selectedId,
  gameActive,
  onRefresh,
  onSelect,
}: {
  assets: Gen3DAssetManifest[];
  selectedId: string | null;
  gameActive: boolean;
  onRefresh: () => void;
  onSelect: (m: Gen3DAssetManifest) => void;
}) {
  return (
    <section className="aa-card aa-library">
      <header className="aa-card-head">
        <h3 className="aa-card-title">
          <span className="aa-card-icon">🗂️</span>
          {t('asset.title')}
          <span className="aa-count">{assets.length}</span>
        </h3>
        <div className="aa-card-actions">
          <button type="button" className="aa-btn aa-btn--ghost" onClick={onRefresh} disabled={!gameActive}>
            {t('btn.refresh')}
          </button>
        </div>
      </header>

      {!gameActive ? (
        <p className="aa-empty">{t('asset.emptyNoGame')}</p>
      ) : assets.length === 0 ? (
        <p className="aa-empty">{t('asset.emptyNoAssets')}</p>
      ) : (
        <ul className="aa-asset-grid">
          {assets.map((m) => {
            const preview = blobUrl(selectFile(m.files, 'preview_image'));
            const isSel = m.assetPath === selectedId;
            return (
              <li key={m.assetPath}>
                <button
                  type="button"
                  className={`aa-asset ${isSel ? 'is-sel' : ''}`}
                  onClick={() => onSelect(m)}
                  title={m.assetPath}
                >
                  <span className="aa-asset-thumb">
                    {preview ? <img src={preview} alt="" loading="lazy" /> : <span className="aa-asset-noimg">📦</span>}
                  </span>
                  <span className="aa-asset-cap">{caption(m)}</span>
                  <span className="aa-asset-meta">
                    <span className={`aa-tag aa-tag--${m.providerMode}`}>{m.providerMode}</span>
                    <span className="aa-tag">{m.mode}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
