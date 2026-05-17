/**
 * wb-character-forge — Sidebar panel (React).
 *
 * Two collapsible sections share the same sidebar real estate:
 *   1. Forge — prompt + style + view checkboxes → POST /portrait,
 *      then "generate walk sheet" → POST /sprite-sheet.
 *   2. Playground — picks one character from the gallery, plays its walk
 *      sprite sheet on a CSS-driven canvas with direction selector.
 *
 * Dual-modality (DUAL-MODALITY-UI.md): the panel registers
 * `character-forge.editor` surface so AI can drive the same flow via
 * /api/bus/ui/surfaces/character-forge.editor/action — actions resolve to
 * the same handlers the DOM uses, single source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = '/api/wb/character-forge';

// Inline-and-tiny `useSurface` clone — keeps panel.tsx as a self-contained
// plugin file with zero cross-package imports.  Mirrors
// packages/interface/src/lib/surface.ts § dual-modality contract: register on
// mount, PUT snapshot on change, long-poll /pending, dispatch routes through
// the same `run` closure as DOM handlers.  When the host's loader matures
// (Phase 6+), swap this for a `bus.ui.register()` call without changing the
// rest of the panel.
interface MiniActionDef<A = unknown> {
  id: string;
  run: (args: A) => unknown | Promise<unknown>;
  exposedToAI?: boolean;
  argsSchema?: Record<string, unknown>;
}
interface MiniSurfaceHandle<S> {
  snapshot: S;
  setSnapshot: (next: S | ((prev: S) => S)) => void;
  dispatch: (action: string, args?: unknown) => Promise<unknown>;
}
function useMiniSurface<S>(opts: {
  id: string;
  layer?: 'host' | 'plugin' | 'iframe';
  schema: Record<string, unknown>;
  initialSnapshot: S;
  actions: Record<string, MiniActionDef>;
  pollIntervalMs?: number;
}): MiniSurfaceHandle<S> {
  const [snapshot, setSnapshotState] = useState<S>(opts.initialSnapshot);
  const actionsRef = useRef(opts.actions);
  actionsRef.current = opts.actions;
  const mountedRef = useRef(false);

  // mount: POST /surfaces
  useEffect(() => {
    let cancelled = false;
    const body = {
      id: opts.id,
      layer: opts.layer ?? 'plugin',
      schema: opts.schema,
      actions: Object.values(opts.actions).map(({ id, argsSchema, exposedToAI }) => ({
        id, argsSchema, exposedToAI: exposedToAI !== false,
      })),
      initialSnapshot: opts.initialSnapshot,
    };
    fetch('/api/bus/ui/surfaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      if (!cancelled) mountedRef.current = true;
    }).catch(() => { /* ai-path熄火, dom仍可玩 */ });
    return () => {
      cancelled = true;
      // best-effort unregister; sendBeacon would suit but fetch is enough here
      fetch(`/api/bus/ui/surfaces/${opts.id}`, { method: 'DELETE' }).catch(() => { /* */ });
    };
    // intentionally omit opts.* — re-register only on id change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.id]);

  const setSnapshot = useCallback((next: S | ((prev: S) => S)) => {
    setSnapshotState((prev) => {
      const v = typeof next === 'function' ? (next as (p: S) => S)(prev) : next;
      // best-effort PUT; race conditions OK because next setSnapshot will fix
      fetch(`/api/bus/ui/surfaces/${opts.id}/snapshot`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snapshot: v }),
      }).catch(() => { /* */ });
      return v;
    });
  }, [opts.id]);

  const dispatch = useCallback(async (action: string, args?: unknown) => {
    const def = actionsRef.current[action];
    if (!def) return undefined;
    return await def.run((args ?? {}) as never);
  }, []);

  // long-poll /pending for AI-enqueued actions
  useEffect(() => {
    if ((opts.pollIntervalMs ?? 1000) <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      try {
        const r = await fetch(`/api/bus/ui/surfaces/${opts.id}/pending`);
        if (!r.ok) return;
        const j = (await r.json()) as { actions?: Array<{ seq: number; action: string; args: unknown; token: string }>; items?: Array<{ seq: number; action: string; args: unknown; token: string }> };
        // Server may emit either {actions} or {items}; tolerate both shapes.
        const pending = j.actions ?? j.items ?? [];
        if (pending.length) console.info('[wb-cf] dispatch ai pending', pending.length, pending.map((a) => a.action));
        for (const a of pending) {
          let ok = true; let error: string | undefined; let result: unknown;
          try {
            const def = actionsRef.current[a.action];
            if (!def) console.warn('[wb-cf] no action def for', a.action, 'keys=', Object.keys(actionsRef.current));
            result = def ? await def.run((a.args ?? {}) as never) : undefined;
          } catch (e) { ok = false; error = (e as Error).message; console.warn('[wb-cf] run error', a.action, error); }
          await fetch(`/api/bus/ui/surfaces/${opts.id}/ack`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: a.token, ok, error, result }),
          }).catch(() => { /* */ });
        }
      } catch (e) { console.warn('[wb-cf] poll failed', (e as Error).message); }
    };
    timer = setInterval(tick, opts.pollIntervalMs ?? 1000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [opts.id, opts.pollIntervalMs]);

  return { snapshot, setSnapshot, dispatch };
}

type StyleId = 'anime-hd-flat' | 'semi-realistic' | 'pixel-32' | 'cell-shaded' | 'watercolor' | 'cyberpunk';
type ViewId = 'front' | 'side' | 'back';
type SpriteDir = 'down' | 'left' | 'right' | 'up';
type SpriteAction = 'walk' | 'idle' | 'attack';

interface CharacterListItem {
  charId: string;
  name: string;
  portraitUrl: string | null;
  createdAt: string;
  hasSprites: boolean;
}

interface CharacterManifest {
  schemaVersion: 1;
  charId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  prompt: { user: string; style: StyleId; refImage?: string | null };
  portrait: Partial<Record<ViewId, string>>;
  sprites: Partial<
    Record<
      SpriteAction,
      { sheet: string; framesPerDir: number; directions: SpriteDir[]; frameSize: { w: number; h: number } }
    >
  >;
}

interface PanelSnapshot {
  slug: string | null;
  characters: CharacterListItem[];
  selectedCharId: string | null;
  currentManifest: CharacterManifest | null;
  forgeForm: {
    prompt: string;
    name: string;
    style: StyleId;
    views: ViewId[];
    size: '1k' | '2k' | '4k';
  };
  busy: boolean;
  lastError: string | null;
  vendors: { ready: string[]; missing: string[] };
}

const STYLES: Array<{ id: StyleId; label: string }> = [
  { id: 'anime-hd-flat', label: '动漫扁平' },
  { id: 'semi-realistic', label: '半写实' },
  { id: 'pixel-32', label: '像素 32×32' },
  { id: 'cell-shaded', label: '赛璐璐' },
  { id: 'watercolor', label: '水彩' },
  { id: 'cyberpunk', label: '赛博朋克' },
];

const VIEWS: ViewId[] = ['front', 'side', 'back'];
const SPRITE_DIRS: SpriteDir[] = ['down', 'left', 'right', 'up'];

const SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: ['string', 'null'] },
    characters: { type: 'array' },
    selectedCharId: { type: ['string', 'null'] },
    forgeForm: { type: 'object' },
    busy: { type: 'boolean' },
    vendors: { type: 'object' },
  },
} as const;

export function CharacterForgePanel(): JSX.Element {
  // Read pinnedSlug straight from localStorage (FilesPanel keeps it there).
  // We watch the 'storage' event so cross-component pinning is reactive.
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(() => {
    try { return localStorage.getItem('kubeela.pinnedSlug'); } catch { return null; }
  });
  useEffect(() => {
    const onStorage = () => {
      try { setPinnedSlug(localStorage.getItem('kubeela.pinnedSlug')); } catch { /* */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const [autoSlug, setAutoSlug] = useState<string | null>(null);
  const slug = pinnedSlug ?? autoSlug;

  const [tab, setTab] = useState<'forge' | 'playground'>('forge');
  const [characters, setCharacters] = useState<CharacterListItem[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<CharacterManifest | null>(null);
  const [vendors, setVendors] = useState<{ ready: string[]; missing: string[] }>({ ready: [], missing: [] });

  const [forgePrompt, setForgePrompt] = useState('极光甲胄骑士,蓝色长发,白银锁子甲,腰挂青冰大剑');
  const [forgeName, setForgeName] = useState('');
  const [forgeStyle, setForgeStyle] = useState<StyleId>('anime-hd-flat');
  const [forgeViews, setForgeViews] = useState<ViewId[]>(['front']);
  const [forgeSize, setForgeSize] = useState<'1k' | '2k' | '4k'>('2k');

  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);

  // Slug auto-detect: fall back to most-recently-modified game via
  // /api/workbench/games when nothing is pinned (matches FilesPanel auto-pick
  // behaviour without coupling to its private state).
  const [allSlugs, setAllSlugs] = useState<Array<{ slug: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/workbench/games')
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((j: { games?: Array<{ slug: string; name: string }> }) => {
        if (cancelled) return;
        const list = j.games ?? [];
        setAllSlugs(list);
        if (!pinnedSlug && list[0]) setAutoSlug(list[0].slug);
      })
      .catch(() => { /* keep empty list, UI shows manual slug picker */ });
    return () => { cancelled = true; };
  }, [pinnedSlug]);

  // ── load vendor readiness once on mount ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/status`).then((r) => r.json()).then((j: { vendors?: typeof vendors }) => {
      if (!cancelled && j?.vendors) setVendors(j.vendors);
    }).catch(() => {/* status surface optional */});
    return () => { cancelled = true; };
  }, []);

  // ── load character list when slug ready ───────────────────────────────
  const reloadCharacters = useCallback(async () => {
    if (!slug) return;
    try {
      const r = await fetch(`${API_BASE}/characters?slug=${encodeURIComponent(slug)}`);
      if (!r.ok) {
        setLastError(`list-characters: ${r.status}`);
        return;
      }
      const j = (await r.json()) as { items: CharacterListItem[] };
      setCharacters(j.items);
      // Auto-select most-recent if nothing chosen yet
      if (!selectedCharId && j.items[0]) setSelectedCharId(j.items[0].charId);
    } catch (e) {
      setLastError(`list-characters: ${(e as Error).message}`);
    }
  }, [slug, selectedCharId]);

  useEffect(() => { reloadCharacters(); }, [reloadCharacters]);

  // ── load manifest of the selected character ───────────────────────────
  useEffect(() => {
    if (!slug || !selectedCharId) {
      setManifest(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/characters/${encodeURIComponent(selectedCharId)}?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { manifest?: CharacterManifest } | null) => {
        if (!cancelled && j?.manifest) setManifest(j.manifest);
      })
      .catch(() => {/* selection may race; ignore */});
    return () => { cancelled = true; };
  }, [slug, selectedCharId]);

  // ── core actions ──────────────────────────────────────────────────────
  const generatePortrait = useCallback(async () => {
    if (!slug) { setLastError('未选定游戏 slug — 先在 Files / Projects 选一个游戏'); return; }
    if (!forgePrompt.trim()) { setLastError('prompt 不能为空'); return; }
    setBusy(true);
    setLastError(null);
    setProgressLog((l) => [...l, `[${tsNow()}] 立绘开始 · style=${forgeStyle} · views=${forgeViews.join(',')}`]);
    try {
      const r = await fetch(`${API_BASE}/portrait`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          prompt: forgePrompt,
          style: forgeStyle,
          views: forgeViews,
          size: forgeSize,
          name: forgeName || undefined,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status} ${t.slice(0, 200)}`);
      }
      const j = (await r.json()) as { charId: string; name: string; model: string };
      setSelectedCharId(j.charId);
      setProgressLog((l) => [...l, `[${tsNow()}] 立绘完成 · ${j.charId} · ${j.model}`]);
      await reloadCharacters();
    } catch (e) {
      const msg = (e as Error).message;
      setLastError(msg);
      setProgressLog((l) => [...l, `[${tsNow()}] 立绘失败 · ${msg}`]);
    } finally {
      setBusy(false);
    }
  }, [slug, forgePrompt, forgeStyle, forgeViews, forgeSize, forgeName, reloadCharacters]);

  const generateSpriteSheet = useCallback(async (action: SpriteAction = 'walk') => {
    if (!slug || !selectedCharId) { setLastError('未选定角色'); return; }
    setBusy(true);
    setLastError(null);
    setProgressLog((l) => [...l, `[${tsNow()}] sprite ${action} 开始`]);
    try {
      const r = await fetch(`${API_BASE}/sprite-sheet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          charId: selectedCharId,
          action,
          directions: SPRITE_DIRS,
          framesPerDir: 4,
          frameSize: 96,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status} ${t.slice(0, 200)}`);
      }
      const j = (await r.json()) as { atlas?: Array<{ dir: SpriteDir; framesPerDir: number; frameSize: number }> };
      setProgressLog((l) => [...l, `[${tsNow()}] sprite ${action} 完成 · ${j.atlas?.length ?? 0} 方向`]);
      // reload manifest to pick up sprites entry
      const m = await fetch(`${API_BASE}/characters/${encodeURIComponent(selectedCharId)}?slug=${encodeURIComponent(slug)}`).then((r) => r.json()).catch(() => null);
      if (m?.manifest) setManifest(m.manifest as CharacterManifest);
      await reloadCharacters();
    } catch (e) {
      const msg = (e as Error).message;
      setLastError(msg);
      setProgressLog((l) => [...l, `[${tsNow()}] sprite 失败 · ${msg}`]);
    } finally {
      setBusy(false);
    }
  }, [slug, selectedCharId, reloadCharacters]);

  // ── surface registration (dual-modality) ──────────────────────────────
  const snapshot: PanelSnapshot = useMemo(() => ({
    slug,
    characters,
    selectedCharId,
    currentManifest: manifest,
    forgeForm: { prompt: forgePrompt, name: forgeName, style: forgeStyle, views: forgeViews, size: forgeSize },
    busy,
    lastError,
    vendors,
  }), [slug, characters, selectedCharId, manifest, forgePrompt, forgeName, forgeStyle, forgeViews, forgeSize, busy, lastError, vendors]);

  const surface = useMiniSurface<PanelSnapshot>({
    id: 'character-forge.editor',
    layer: 'plugin',
    schema: SCHEMA as unknown as Record<string, unknown>,
    initialSnapshot: snapshot,
    actions: {
      setPrompt: {
        id: 'setPrompt',
        argsSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
        run: (raw) => {
          const a = (raw ?? {}) as { prompt?: unknown };
          if (typeof a.prompt === 'string') setForgePrompt(a.prompt);
        },
      },
      setStyle: {
        id: 'setStyle',
        run: (raw) => {
          const a = (raw ?? {}) as { style?: StyleId };
          if (a.style && STYLES.some((s) => s.id === a.style)) setForgeStyle(a.style);
        },
      },
      setViews: {
        id: 'setViews',
        run: (raw) => {
          const a = (raw ?? {}) as { views?: ViewId[] };
          if (Array.isArray(a.views)) setForgeViews(a.views.filter((v): v is ViewId => VIEWS.includes(v)));
        },
      },
      generatePortrait: {
        id: 'generatePortrait',
        exposedToAI: true,
        run: () => generatePortrait(),
      },
      generateSpriteSheet: {
        id: 'generateSpriteSheet',
        exposedToAI: true,
        run: (raw) => {
          const a = (raw ?? {}) as { action?: SpriteAction };
          return generateSpriteSheet((a.action ?? 'walk') as SpriteAction);
        },
      },
      selectCharacter: {
        id: 'selectCharacter',
        run: (raw) => {
          const a = (raw ?? {}) as { charId?: string };
          if (typeof a.charId === 'string') setSelectedCharId(a.charId);
        },
      },
      setTab: {
        id: 'setTab',
        run: (raw) => {
          const a = (raw ?? {}) as { tab?: string };
          if (a.tab === 'forge' || a.tab === 'playground') setTab(a.tab);
        },
      },
    },
  });

  useEffect(() => { surface.setSnapshot(snapshot); /* eslint-disable-next-line */ }, [snapshot]);

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className="cf-panel" data-cf-mounted="1">
      <style>{CSS}</style>

      {!slug ? (
        <div className="cf-empty">
          <strong>未选定游戏 slug</strong>
          <p>在左侧 Files / Projects 里 pin 一个游戏后再回到这里。</p>
        </div>
      ) : (
        <>
          <div className="cf-header">
            <span className="cf-slug" title="当前游戏 / 切换 slug">
              ⚒️
              <select
                className="cf-input cf-input-small"
                value={slug}
                onChange={(e) => setAutoSlug(e.target.value)}
                data-cf-input="slug"
                title="切换 game slug"
              >
                {allSlugs.length === 0
                  ? <option value={slug}>{slug}</option>
                  : allSlugs.map((g) => <option key={g.slug} value={g.slug}>{g.slug} · {g.name}</option>)}
              </select>
            </span>
            <span className={`cf-vendor-strip${vendors.missing.length ? ' has-missing' : ''}`} title="多模态供应商就绪状态">
              {vendors.ready.map((v) => <span key={v} className="cf-vendor-chip ready">{v}</span>)}
              {vendors.missing.map((v) => <span key={v} className="cf-vendor-chip missing">{v}</span>)}
            </span>
          </div>

          <div className="cf-tabs" role="tablist">
            <button className={`cf-tab ${tab === 'forge' ? 'active' : ''}`} onClick={() => void surface.dispatch('setTab', { tab: 'forge' })}>⚒️ 锻造</button>
            <button className={`cf-tab ${tab === 'playground' ? 'active' : ''}`} onClick={() => void surface.dispatch('setTab', { tab: 'playground' })}>🎮 游乐场</button>
          </div>

          {tab === 'forge' ? (
            <div className="cf-section">
              <label className="cf-label">prompt</label>
              <textarea
                className="cf-textarea"
                rows={4}
                value={forgePrompt}
                onChange={(e) => setForgePrompt(e.target.value)}
                placeholder="描述角色 · 自然语言 · 可中文 / 英文"
                data-cf-input="prompt"
              />
              <div className="cf-row">
                <label className="cf-label" title="可选 · 不填自动取 prompt 前 14 字">name</label>
                <input className="cf-input" value={forgeName} onChange={(e) => setForgeName(e.target.value)} placeholder="(自动)" data-cf-input="name" />
              </div>
              <div className="cf-row">
                <label className="cf-label">style</label>
                <select className="cf-input" value={forgeStyle} onChange={(e) => setForgeStyle(e.target.value as StyleId)} data-cf-input="style">
                  {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="cf-row">
                <label className="cf-label">views</label>
                <div className="cf-checkrow">
                  {VIEWS.map((v) => (
                    <label key={v} className={`cf-chip ${forgeViews.includes(v) ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={forgeViews.includes(v)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...forgeViews, v]
                            : forgeViews.filter((x) => x !== v);
                          setForgeViews(next.length > 0 ? next : ['front']);
                        }}
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
              <div className="cf-row">
                <label className="cf-label">size</label>
                <div className="cf-checkrow">
                  {(['1k', '2k', '4k'] as const).map((s) => (
                    <label key={s} className={`cf-chip ${forgeSize === s ? 'on' : ''}`}>
                      <input type="radio" name="cf-size" checked={forgeSize === s} onChange={() => setForgeSize(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <button
                className="cf-cta"
                disabled={busy || !forgePrompt.trim()}
                onClick={() => void surface.dispatch('generatePortrait', {})}
                data-cf-btn="generate-portrait"
              >
                {busy ? '生成中…' : '生成立绘'}
              </button>

              {lastError && <div className="cf-error">{lastError}</div>}
              {progressLog.length > 0 && (
                <details className="cf-progress" open>
                  <summary>事件流 ({progressLog.length})</summary>
                  <ol>
                    {progressLog.slice(-12).map((line, i) => <li key={i}>{line}</li>)}
                  </ol>
                </details>
              )}

              <div className="cf-gallery">
                <div className="cf-label cf-label-sub">画廊 · {characters.length}</div>
                <div className="cf-grid">
                  {characters.length === 0 && <div className="cf-empty-thin">还没有角色 · 先生成一个立绘</div>}
                  {characters.map((c) => (
                    <button
                      key={c.charId}
                      className={`cf-card ${selectedCharId === c.charId ? 'selected' : ''}`}
                      onClick={() => void surface.dispatch('selectCharacter', { charId: c.charId })}
                      title={`${c.charId} · ${new Date(c.createdAt).toLocaleString()}`}
                      data-cf-char={c.charId}
                    >
                      {c.portraitUrl ? (
                        <img src={c.portraitUrl} alt={c.name} loading="lazy" />
                      ) : (
                        <div className="cf-card-placeholder">no img</div>
                      )}
                      <div className="cf-card-name">{c.name}</div>
                      {c.hasSprites && <span className="cf-card-badge">sprites</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <PlaygroundView
              slug={slug}
              manifest={manifest}
              busy={busy}
              onGenerateSheet={(a) => void surface.dispatch('generateSpriteSheet', { action: a })}
              onSelect={(id) => void surface.dispatch('selectCharacter', { charId: id })}
              characters={characters}
              selectedCharId={selectedCharId}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Playground: pick character, generate sheet, animate frames on canvas.
// ─────────────────────────────────────────────────────────────────────────

interface PlaygroundProps {
  slug: string;
  manifest: CharacterManifest | null;
  busy: boolean;
  onGenerateSheet: (action: SpriteAction) => void;
  onSelect: (charId: string) => void;
  characters: CharacterListItem[];
  selectedCharId: string | null;
}

function PlaygroundView(p: PlaygroundProps): JSX.Element {
  const { slug, manifest, busy, onGenerateSheet, onSelect, characters, selectedCharId } = p;
  const walk = manifest?.sprites?.walk ?? null;
  const sheetUrl = walk ? `${API_BASE}/asset?path=${encodeURIComponent(`.kubeela/games/${slug}/characters/${manifest!.charId}/${walk.sheet}`)}` : null;
  const [dirIdx, setDirIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);

  const directions = walk?.directions ?? SPRITE_DIRS;
  const framesPerDir = walk?.framesPerDir ?? 4;
  const cellW = walk?.frameSize?.w ?? 96;
  const cellH = walk?.frameSize?.h ?? 96;

  useEffect(() => {
    if (!walk || !playing) return;
    const id = window.setInterval(() => setFrameIdx((x) => (x + 1) % framesPerDir), 120);
    return () => window.clearInterval(id);
  }, [walk, playing, framesPerDir]);

  const offsetX = -(frameIdx * cellW);
  const offsetY = -(dirIdx * cellH);
  const portraitUrl = manifest?.portrait?.front
    ? `${API_BASE}/asset?path=${encodeURIComponent(`.kubeela/games/${slug}/characters/${manifest.charId}/${manifest.portrait.front}`)}`
    : null;

  return (
    <div className="cf-section">
      <div className="cf-row">
        <label className="cf-label">角色</label>
        <select
          className="cf-input"
          value={selectedCharId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          data-cf-input="playground-char"
        >
          <option value="">-- 选 --</option>
          {characters.map((c) => <option key={c.charId} value={c.charId}>{c.name}</option>)}
        </select>
      </div>

      {!manifest ? (
        <div className="cf-empty-thin">没选角色 · 上方下拉选或者去锻造 tab 先生成一个</div>
      ) : (
        <>
          <div className="cf-playground-grid">
            <div className="cf-playground-portrait">
              {portraitUrl && <img src={portraitUrl} alt="portrait" />}
              <div className="cf-playground-name">{manifest.name}</div>
            </div>
            <div className="cf-playground-stage" data-cf-stage>
              {walk ? (
                <div
                  className="cf-sprite-cell"
                  style={{
                    width: cellW + 'px',
                    height: cellH + 'px',
                    backgroundImage: `url(${sheetUrl})`,
                    backgroundPosition: `${offsetX}px ${offsetY}px`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${framesPerDir * cellW}px ${directions.length * cellH}px`,
                    imageRendering: 'pixelated',
                  }}
                />
              ) : (
                <div className="cf-empty-thin" style={{ width: cellW, height: cellH }}>无 sprite</div>
              )}
              <div className="cf-playground-controls">
                <button onClick={() => setPlaying((x) => !x)} className="cf-btn-mini" data-cf-btn="play-toggle">{playing ? '⏸' : '▶'}</button>
                <span className="cf-frame">f{frameIdx + 1}/{framesPerDir}</span>
                <select className="cf-input cf-input-small" value={directions[dirIdx]} onChange={(e) => setDirIdx(directions.indexOf(e.target.value as SpriteDir))}>
                  {directions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button
            className="cf-cta"
            disabled={busy}
            onClick={() => onGenerateSheet('walk')}
            data-cf-btn="generate-sprite-walk"
          >
            {busy ? '生成中…' : walk ? '重新生成 walk sheet' : '生成 walk 行动小人'}
          </button>
        </>
      )}
    </div>
  );
}

function tsNow(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

const CSS = `
.cf-panel { display: flex; flex-direction: column; gap: 8px; padding: 10px; color: var(--text, #d8dde7); font-size: 13px; }
.cf-empty { padding: 16px; text-align: center; color: #8a93a6; }
.cf-empty-thin { padding: 8px 4px; color: #6a7383; font-size: 12px; text-align: center; }
.cf-header { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.cf-slug { font-weight: 600; }
.cf-vendor-strip { display: flex; gap: 4px; flex-wrap: wrap; }
.cf-vendor-chip { font-size: 10px; padding: 2px 6px; border-radius: 999px; }
.cf-vendor-chip.ready { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.4); }
.cf-vendor-chip.missing { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.4); }
.cf-tabs { display: flex; gap: 4px; }
.cf-tab { flex: 1; padding: 6px 8px; background: transparent; border: 1px solid #2a3142; border-radius: 8px; color: #aab2c2; cursor: pointer; font-size: 12px; }
.cf-tab.active { background: rgba(124,92,255,0.18); color: #fff; border-color: rgba(124,92,255,0.5); }
.cf-section { display: flex; flex-direction: column; gap: 8px; }
.cf-row { display: flex; gap: 8px; align-items: center; }
.cf-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #6a7383; min-width: 48px; }
.cf-label-sub { color: #8a93a6; }
.cf-textarea, .cf-input { background: #0d1019; border: 1px solid #232a38; border-radius: 8px; color: #e6e9ef; padding: 6px 8px; font-family: inherit; font-size: 13px; width: 100%; }
.cf-textarea { resize: vertical; }
.cf-input-small { width: auto; padding: 4px 6px; font-size: 11px; }
.cf-checkrow { display: flex; gap: 4px; flex-wrap: wrap; }
.cf-chip { font-size: 11px; padding: 4px 8px; border: 1px solid #232a38; border-radius: 999px; cursor: pointer; color: #8a93a6; }
.cf-chip.on { background: rgba(34,211,238,0.15); border-color: rgba(34,211,238,0.5); color: #22d3ee; }
.cf-chip input { display: none; }
.cf-cta { background: linear-gradient(135deg, rgba(124,92,255,0.4), rgba(34,211,238,0.3)); border: 1px solid rgba(124,92,255,0.6); color: #fff; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; }
.cf-cta:disabled { opacity: 0.4; cursor: not-allowed; }
.cf-error { color: #f87171; font-size: 12px; padding: 6px 8px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; }
.cf-progress { font-size: 11px; color: #8a93a6; font-family: monospace; }
.cf-progress ol { margin: 4px 0 0 14px; padding: 0; }
.cf-progress li { line-height: 1.4; }
.cf-gallery { margin-top: 8px; }
.cf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; }
.cf-card { background: #11141b; border: 1px solid #232a38; border-radius: 8px; padding: 4px; cursor: pointer; position: relative; overflow: hidden; min-height: 110px; }
.cf-card.selected { border-color: rgba(124,92,255,0.7); box-shadow: 0 0 0 1px rgba(124,92,255,0.5); }
.cf-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px; display: block; background: #1a1f2c; }
.cf-card-placeholder { width: 100%; aspect-ratio: 2/3; display: flex; align-items: center; justify-content: center; color: #6a7383; font-size: 10px; }
.cf-card-name { font-size: 11px; padding: 4px 2px 2px; color: #d8dde7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-card-badge { position: absolute; top: 4px; right: 4px; background: rgba(52,211,153,0.2); color: #34d399; font-size: 9px; padding: 1px 5px; border-radius: 999px; }
.cf-playground-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cf-playground-portrait img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; background: #11141b; }
.cf-playground-name { font-size: 12px; text-align: center; margin-top: 4px; color: #d8dde7; }
.cf-playground-stage { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; background: linear-gradient(135deg, #1a1f2c, #0d1019); border: 1px dashed #2a3142; border-radius: 8px; }
.cf-sprite-cell { background-color: #11141b; }
.cf-playground-controls { display: flex; align-items: center; gap: 4px; font-size: 11px; }
.cf-btn-mini { background: #232a38; border: none; color: #e6e9ef; padding: 2px 8px; border-radius: 6px; cursor: pointer; }
.cf-frame { font-family: monospace; color: #8a93a6; }
`;

export default CharacterForgePanel;
