import { useEffect, useRef, useState, type JSX } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { selectFile, selectFiles } from '@shared/manifest';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { blobUrl } from '@/lib/blobUrl';
import { EDITOR_ICON_MAP } from '@/ui-meta';

const LibraryIcon = EDITOR_ICON_MAP.library;
const RefreshIcon = EDITOR_ICON_MAP.refresh;
const DeleteIcon = EDITOR_ICON_MAP.delete;
const ImgIcon = EDITOR_ICON_MAP.image;

const slotLabel: Record<string, string> = { characters: '角色', meshes: '物件' };

// Right column, card 1: the persisted per-game asset library, rendered as a
// dense thumbnail grid. Assets are the cross-pane source of truth, so selecting
// a card drives the center workspace via onSelect. Cards lead with the prompt's
// first line so auto-suffixed siblings (knight / knight-2 / knight-3) stay
// distinguishable. Delete is destructive (removes the file + tombstones its
// cacheKey), so it requires a per-card confirm.
export function AssetLibrary(props: {
  assets: readonly Gen3DAssetManifest[];
  selectedId: string | null;
  gameActive: boolean;
  onRefresh: () => void;
  onSelect: (asset: Gen3DAssetManifest) => void;
  onDelete: (assetPath: string) => void;
  onRename: (assetPath: string, label: string | null) => void;
}): JSX.Element {
  const { assets, selectedId, gameActive, onRefresh, onSelect, onDelete, onRename } = props;
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  return (
    <section className="gx-card">
      <div className="gx-card-title">
        <LibraryIcon size={15} />
        <span>资产库</span>
        <button type="button" className="fx-icon-btn" onClick={onRefresh} aria-label="刷新资产库">
          <RefreshIcon size={13} />
        </button>
      </div>
      {!gameActive ? (
        <div className="gx-state">
          <LibraryIcon size={24} />
          <div className="gx-state-title">未选择游戏</div>
          <p className="gx-state-copy">3D 资产按游戏存储。请先在 Studio 中打开一个游戏，再回到此工作台生成与管理资产。</p>
        </div>
      ) : assets.length === 0 ? (
        <div className="gx-state">
          <LibraryIcon size={24} />
          <div className="gx-state-title">资产库为空</div>
          <p className="gx-state-copy">生成的 3D 资产会持久化到当前游戏的资产库；生成后点刷新即可在此查看、选择与删除。</p>
        </div>
      ) : (
        <div className="lib-grid">
          {assets.map((asset) => (
            <LibCard
              key={asset.assetPath}
              asset={asset}
              selected={selectedId === asset.assetPath}
              confirming={confirmPath === asset.assetPath}
              onSelect={() => onSelect(asset)}
              onAskDelete={() => setConfirmPath(asset.assetPath)}
              onCancelDelete={() => setConfirmPath(null)}
              onConfirmDelete={() => {
                onDelete(asset.assetPath);
                setConfirmPath(null);
              }}
              onRename={(label) => onRename(asset.assetPath, label)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// A single library tile: preview thumbnail + prompt-led caption, with a hover
// delete button that swaps to an inline confirm before firing the destructive
// gen3d:delete-asset call. A pencil icon on hover opens an inline rename input.
function LibCard({
  asset,
  selected,
  confirming,
  onSelect,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onRename,
}: {
  asset: Gen3DAssetManifest;
  selected: boolean;
  confirming: boolean;
  onSelect: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRename: (label: string | null) => void;
}): JSX.Element {
  const previewUrl = blobUrl(selectFile(asset.files, 'preview_image'));
  // userLabel wins; fall back to prompt first line; last resort: file stem from assetPath.
  const autoCaption =
    asset.prompt
      ? asset.prompt.split('\n')[0]!.trim()
      : asset.assetPath.split('/').pop()?.replace(/\.glb$/, '') ?? asset.mode;
  const caption = asset.userLabel?.trim() || autoCaption;

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(asset.userLabel?.trim() ?? autoCaption);
    setRenaming(true);
  }
  function commitRename() {
    const trimmed = draft.trim();
    // null clears back to auto; empty string → clear; otherwise use value
    onRename(trimmed === autoCaption || trimmed === '' ? null : trimmed);
    setRenaming(false);
  }
  function cancelRename() {
    setRenaming(false);
  }
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);
  // Rig/motion is characters-only, so a rigged or animated asset is definitively
  // a character even when its slot field is stale (older flows defaulted unnamed
  // slots to `meshes`). Trust readiness over the persisted slot for the label.
  const effectiveSlot =
    asset.readiness.rigged || asset.readiness.animated ? 'characters' : asset.assetSlot;
  const slot = slotLabel[effectiveSlot] ?? effectiveSlot;
  // A preview <img> can transiently fail (request raced the just-written file,
  // dev-proxy hiccup, or a missing/corrupt sidefile). Without this the tile
  // renders a broken-image glyph with the full prompt spilling out as alt text.
  // Fall back to the same placeholder as a no-preview asset, and retry whenever
  // the URL changes (refresh / refine produces a new preview).
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [previewUrl]);
  const showImg = previewUrl !== null && !previewFailed;

  return (
    <div className={`lib-card motion-row ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="lib-card-main" onClick={onSelect} title={caption}>
        <div className="lib-card-thumb">
          {showImg ? (
            <img
              src={previewUrl}
              alt=""
              loading="lazy"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="lib-card-thumb--empty" aria-hidden="true">
              <ImgIcon size={20} />
            </div>
          )}
          <span className={`lib-tag ${asset.providerMode === 'real' ? 'lib-tag--real' : 'lib-tag--mock'}`}>
            {asset.providerMode}
          </span>
        </div>
        {renaming ? (
          <div className="lib-card-rename" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              className="lib-card-rename-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              maxLength={80}
              placeholder="资产名称"
            />
            <button type="button" className="fx-icon-btn" aria-label="确认" onClick={commitRename}>
              <Check size={12} />
            </button>
            <button type="button" className="fx-icon-btn" aria-label="取消" onClick={cancelRename}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <p className="lib-card-caption">
            {caption}
            <button
              type="button"
              className="fx-icon-btn lib-card-rename-btn"
              aria-label="重命名"
              onClick={startRename}
              title="重命名"
            >
              <Pencil size={10} />
            </button>
          </p>
        )}
        <small className="lib-card-meta">
          {asset.provider} · {slot}
        </small>
        {(asset.readiness.rigged || asset.readiness.animated) && (
          <div className="lib-card-readiness">
            {asset.readiness.rigged && <span className="lib-readiness-tag">绑骨</span>}
            {asset.readiness.animated && (
              <span className="lib-readiness-tag lib-readiness-tag--anim">
                动作 ×{selectFiles(asset.files, 'animated_model', 'glb').length}
              </span>
            )}
          </div>
        )}
      </button>

      {confirming ? (
        <div className="lib-card-confirm">
          <span>删除？</span>
          <button type="button" className="fx-btn fx-btn--sm fx-btn--danger" onClick={onConfirmDelete}>
            删除
          </button>
          <button type="button" className="fx-btn fx-btn--sm" onClick={onCancelDelete}>
            取消
          </button>
        </div>
      ) : (
        <button type="button" className="fx-icon-btn lib-card-del" aria-label="删除资产" onClick={onAskDelete}>
          <DeleteIcon size={13} />
        </button>
      )}
    </div>
  );
}
