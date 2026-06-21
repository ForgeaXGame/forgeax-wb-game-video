import { useEffect, useMemo, useState, type JSX } from 'react';
import { motionRefFromLegacy, motionRefKey, selectFiles, type Gen3DAssetManifest } from '@shared/manifest';
import type { ApplyMotionInput, ListMotionsResult, MotionOption } from '@/types';
import { callTool } from '@/lib/toolClient';
import { EDITOR_ICON_MAP } from '@/ui-meta';

const SearchIcon = EDITOR_ICON_MAP.search;
const MotionIcon = EDITOR_ICON_MAP.motion;

// Searchable motion browser (ADR-0006 §8-Q1) — replaces the fixed 8-button grid.
// Loads the asset's motion catalog via gen3d:list-motions (a Hunyuan-rigged asset
// returns the v1 fixed 8; a Meshy-rigged asset returns its catalog, or a
// deterministic mock sample when Meshy is unconfigured). Filtering is client-side
// for snappy typing. Already-applied motions are disabled with a ✓, computed from
// animated_model files by motionRefKey (legacy bare motionType upgraded via
// motionRefFromLegacy). The catalog never includes the reserved free walk/run
// ids (-1/-2), so the bundled free clips only surface as applied, never offered.
export function MotionBrowser({
  manifest,
  busy,
  onApplyMotion,
}: {
  manifest: Gen3DAssetManifest;
  busy: boolean;
  onApplyMotion: (assetPath: string, motion: ApplyMotionInput) => void;
}): JSX.Element {
  const assetPath = manifest.assetPath;
  const [motions, setMotions] = useState<MotionOption[]>([]);
  const [usedMock, setUsedMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [rigType, setRigType] = useState('');

  // Load the catalog once per asset (the rig system is fixed once rigged, so the
  // catalog does not change as motions are applied).
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const r = await callTool<ListMotionsResult>('gen3d:list-motions', { assetPath });
      if (ignore) return;
      if (!r.ok) {
        setLoadError(r.error);
        setMotions([]);
      } else {
        setMotions(r.result.motions);
        setUsedMock(r.result.usedMock);
      }
      setLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [assetPath]);

  // Already-applied motions, keyed structurally (legacy motionType upgraded so a
  // hunyuan_v1 clip dedupes against its catalog id).
  const appliedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of selectFiles(manifest.files, 'animated_model')) {
      if (f.motionRef) set.add(motionRefKey(f.motionRef));
      else if (f.motionType !== undefined) set.add(motionRefKey(motionRefFromLegacy(f.motionType)));
    }
    return set;
  }, [manifest.files]);

  const categories = useMemo(
    () => Array.from(new Set(motions.map((m) => m.category).filter((c): c is string => !!c))).sort(),
    [motions],
  );
  const rigTypes = useMemo(
    () => Array.from(new Set(motions.map((m) => m.rigType).filter((t): t is string => !!t))).sort(),
    [motions],
  );

  const q = query.trim().toLowerCase();
  const filtered = motions.filter(
    (m) =>
      (!q || m.label.toLowerCase().includes(q) || String(m.id).includes(q)) &&
      (!category || m.category === category) &&
      // rigType is degenerate today (vendored catalog has no rig-type column →
      // all null); match loosely so a requested rigType never empties the list.
      (!rigType || m.rigType === null || m.rigType === rigType),
  );

  if (loading) {
    return <small className="downstream-hint">动作目录加载中…</small>;
  }
  if (loadError) {
    return (
      <small className="downstream-hint" role="alert">
        动作目录加载失败：{loadError}
      </small>
    );
  }

  return (
    <div className="motion-browser">
      <div className="motion-browser-filters">
        <label className="motion-search">
          <SearchIcon size={13} />
          <input
            type="text"
            className="motion-search-input"
            placeholder="搜索动作…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {categories.length > 1 && (
          <select
            className="adv-select motion-filter-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="按分类过滤"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {rigTypes.length > 1 && (
          <select
            className="adv-select motion-filter-select"
            value={rigType}
            onChange={(e) => setRigType(e.target.value)}
            aria-label="按骨架类型过滤"
          >
            <option value="">全部骨架</option>
            {rigTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {usedMock && <small className="motion-browser-note">示例目录（未配置 Meshy）</small>}

      {filtered.length === 0 ? (
        <small className="downstream-hint">没有匹配的动作。</small>
      ) : (
        <div className="motion-list">
          {filtered.map((m) => {
            const key = `${m.system}:${m.id}`;
            const applied = appliedKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                className={`motion-item ${applied ? 'is-applied' : ''}`}
                disabled={busy || applied}
                title={m.category ?? undefined}
                onClick={() =>
                  onApplyMotion(assetPath, { system: m.system, id: Number(m.id), label: m.label })
                }
              >
                {m.previewGifUrl ? (
                  <img
                    className="motion-item-thumb"
                    src={m.previewGifUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="motion-item-thumb motion-item-thumb--empty" aria-hidden="true">
                    <MotionIcon size={16} />
                  </span>
                )}
                <span className="motion-item-label">{m.label}</span>
                <span className="motion-item-meta">
                  {m.isFree && <span className="motion-free-badge">免费</span>}
                  {m.category && <span className="motion-item-cat">{m.category}</span>}
                  {applied && <span className="motion-item-applied">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
