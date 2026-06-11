import type { JSX } from 'react';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { EDITOR_ICON_MAP } from '@/ui-meta';

const LibraryIcon = EDITOR_ICON_MAP.library;
const RefreshIcon = EDITOR_ICON_MAP.refresh;
const GaugeIcon = EDITOR_ICON_MAP.quality;

// Right column, card 1: the persisted asset library. Assets are the cross-pane
// source of truth, so selecting a row drives the center workspace via onSelect.
export function AssetLibrary(props: {
  assets: readonly Gen3DAssetManifest[];
  selectedId: string | null;
  onRefresh: () => void;
  onSelect: (asset: Gen3DAssetManifest) => void;
}): JSX.Element {
  const { assets, selectedId, onRefresh, onSelect } = props;
  return (
    <section className="gx-card">
      <div className="gx-card-title">
        <LibraryIcon size={15} />
        <span>资产库</span>
        <button type="button" className="fx-icon-btn" onClick={onRefresh} aria-label="刷新资产库">
          <RefreshIcon size={13} />
        </button>
      </div>
      {assets.length === 0 ? (
        <div className="gx-state">
          <LibraryIcon size={24} />
          <div className="gx-state-title">资产库为空</div>
          <p className="gx-state-copy">生成的 3D 资产会持久化到全局库；生成后点刷新即可在此查看与选择。</p>
        </div>
      ) : (
        <div className="lib-list">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.assetId}
              className={`lib-row motion-row ${selectedId === asset.assetId ? 'is-selected' : ''}`}
              onClick={() => onSelect(asset)}
            >
              <div className="lib-row-head">
                <strong>{asset.provider}</strong>
                <span
                  className={`lib-tag ${asset.providerMode === 'real' ? 'lib-tag--real' : 'lib-tag--mock'}`}
                >
                  {asset.providerMode}
                </span>
              </div>
              <p className="lib-row-prompt">{asset.prompt ?? asset.mode}</p>
              <small className="lib-row-id mono">{asset.assetId.slice(0, 12)}…</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// Right column, card 2: reserved placeholder for the future five-dimension
// quality scorer. QualityScore stays null per ADR-0001 (no generation-time
// scoring), so this renders disabled and is never wired to a scorer; `selected`
// is accepted for future use only.
export function InspectorReserved(props: {
  selected: Gen3DAssetManifest | null;
}): JSX.Element {
  return (
    <section className="reserved-card">
      <div className="reserved-head">
        <GaugeIcon size={15} />
        <span className="reserved-title">质量评分</span>
        <span className="reserved-badge">待评分运行时</span>
      </div>
      <div className="quality-dims">
        {['geometry', 'topology', 'texture', 'pbr', 'prompt_fidelity'].map((dim) => (
          <span className="quality-dim" key={dim}>
            {dim} · —
          </span>
        ))}
      </div>
      <p className="reserved-note">
        五维质量评分（geometry / topology / texture / pbr / prompt_fidelity）尚无运行时评分器，当前仅为占位。
      </p>
    </section>
  );
}
