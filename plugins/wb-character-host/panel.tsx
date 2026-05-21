/**
 * wb-character host wrapper — Sidebar panel (React).
 *
 * 这是 studio 主仓里给 wb-character iframe 用的接线层。本身不属于
 * `@forgeax-plugin/wb-character` 仓 (那个 vite app 独立可跑), 我们这里只负责:
 *
 *   1. 检测当前 pinnedSlug, 注入到 iframe URL (?slug=)
 *   2. iframe src = /plugins/wb-character/ (server.ts serveStatic 服 dist/)
 *   3. postMessage 双向桥: STUDIO_INIT 下发 ctx, 监听 SURFACE_DISPATCH/SURFACE_EVENT
 *   4. 注册 'wb-character.host' surface → AI 走 surface action 转 postMessage 到
 *      iframe, 让 forgeax-cli 跟人类共用同一个面板 (DUAL-MODALITY-UI.md §iframe)
 *
 * 后续 Phase 5 之后, 当 plugin loader 成熟 (entry.frontend 自动加载), 这个
 * wrapper 可以替换成 generic <PluginIframeHost manifestId=…/>; 现在先专一对
 * wb-character 接线, 跟 wb-character-forge 一样 (后者直接渲染 React, 不走 iframe)
 * 走 hardcoded 路径, 待三个插件落地后再抽公共层 (CLAUDE.md "三相似行 > 过早抽象").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const IFRAME_SRC = '/plugins/wb-character/';
const SURFACE_ID = 'wb-character.host';

// Inline tiny useSurface clone — same pattern as wb-character-forge/src/panel.tsx.
// Once `packages/interface/src/lib/surface.ts` is exported from a stable entry
// these one-shot impls collapse into a single import.
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
    }).then(() => { if (!cancelled) mountedRef.current = true; })
      .catch(() => { /* AI 路径熄火; DOM 仍可用 */ });
    return () => {
      cancelled = true;
      fetch(`/api/bus/ui/surfaces/${opts.id}`, { method: 'DELETE' }).catch(() => { /* */ });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.id]);

  const setSnapshot = useCallback((next: S | ((prev: S) => S)) => {
    setSnapshotState((prev) => {
      const v = typeof next === 'function' ? (next as (p: S) => S)(prev) : next;
      if (mountedRef.current) {
        fetch(`/api/bus/ui/surfaces/${opts.id}/snapshot`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ snapshot: v }),
        }).catch(() => { /* */ });
      }
      return v;
    });
  }, [opts.id]);

  const dispatch = useCallback(async (action: string, args?: unknown) => {
    const def = actionsRef.current[action];
    if (!def) return undefined;
    return await def.run((args ?? {}) as never);
  }, []);

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
        const pending = j.actions ?? j.items ?? [];
        for (const a of pending) {
          let ok = true; let error: string | undefined; let result: unknown;
          try {
            const def = actionsRef.current[a.action];
            result = def ? await def.run((a.args ?? {}) as never) : undefined;
          } catch (e) { ok = false; error = (e as Error).message; }
          await fetch(`/api/bus/ui/surfaces/${opts.id}/ack`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: a.token, ok, error, result }),
          }).catch(() => { /* */ });
        }
      } catch { /* */ }
    };
    timer = setInterval(tick, opts.pollIntervalMs ?? 1000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [opts.id, opts.pollIntervalMs]);

  return { snapshot, setSnapshot, dispatch };
}

interface PanelSnapshot {
  slug: string | null;
  iframeReady: boolean;
  lastEvent: { type: string; ts: number; payload?: unknown } | null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: ['string', 'null'] },
    iframeReady: { type: 'boolean' },
    lastEvent: { type: ['object', 'null'] },
  },
} as const;

export function WbCharacterHostPanel(): JSX.Element {
  // pinnedSlug 取自 FilesPanel 的 localStorage 共享 key, 与 wb-character-forge 一致
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(() => {
    try { return localStorage.getItem('forgeax.pinnedSlug'); } catch { return null; }
  });
  useEffect(() => {
    const onStorage = () => {
      try { setPinnedSlug(localStorage.getItem('forgeax.pinnedSlug')); } catch { /* */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const [allSlugs, setAllSlugs] = useState<Array<{ slug: string; name: string }>>([]);
  const [autoSlug, setAutoSlug] = useState<string | null>(null);
  const slug = pinnedSlug ?? autoSlug;

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
      .catch(() => { /* leave empty; UI 仍可手填 */ });
    return () => { cancelled = true; };
  }, [pinnedSlug]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [lastEvent, setLastEvent] = useState<PanelSnapshot['lastEvent']>(null);

  // PostMessage 双向桥:
  //   下行 (host → iframe): STUDIO_INIT { ctx } + SURFACE_DISPATCH { toolId, args }
  //   上行 (iframe → host): STUDIO_READY · SURFACE_EVENT { type, payload }
  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try { w.postMessage(msg, '*'); } catch { /* */ }
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string; payload?: unknown };
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'STUDIO_READY') {
        setIframeReady(true);
        // 下发 ctx; iframe 内部 Bridge.ts 处理 STUDIO_INIT 时切到 STUDIO_HOST_MODE
        postToIframe({
          type: 'STUDIO_INIT',
          ctx: {
            slug,
            apiBase: '/api/wb/character',
            assetBase: '/api/wb/character/asset',
            host: 'forgeax-studio',
          },
        });
      } else if (data.type === 'SURFACE_EVENT' || data.type === 'CHARACTER_EVENT') {
        setLastEvent({ type: (data as { type: string }).type, ts: Date.now(), payload: data.payload });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [postToIframe, slug]);

  // 当 slug 切换时, 重新下发 ctx 给 iframe (它会自己 reload character list)
  useEffect(() => {
    if (!iframeReady) return;
    postToIframe({ type: 'STUDIO_CTX', ctx: { slug } });
  }, [iframeReady, slug, postToIframe]);

  // Surface 注册 (AI 通路)
  const snapshot: PanelSnapshot = useMemo(
    () => ({ slug, iframeReady, lastEvent }),
    [slug, iframeReady, lastEvent],
  );

  const surface = useMiniSurface<PanelSnapshot>({
    id: SURFACE_ID,
    layer: 'host',
    schema: SCHEMA as unknown as Record<string, unknown>,
    initialSnapshot: snapshot,
    actions: {
      setSlug: {
        id: 'setSlug',
        argsSchema: { type: 'object', properties: { slug: { type: 'string' } } },
        run: (raw) => {
          const a = (raw ?? {}) as { slug?: unknown };
          if (typeof a.slug === 'string') setAutoSlug(a.slug);
        },
      },
      invokePipeline: {
        id: 'invokePipeline',
        exposedToAI: true,
        argsSchema: { type: 'object', required: ['pipelineId'], properties: { pipelineId: { type: 'string' }, args: {} } },
        run: (raw) => {
          const a = (raw ?? {}) as { pipelineId?: string; args?: unknown };
          if (typeof a.pipelineId !== 'string') return;
          postToIframe({ type: 'SURFACE_DISPATCH', toolId: a.pipelineId, args: a.args ?? {} });
        },
      },
      reload: {
        id: 'reload',
        exposedToAI: true,
        run: () => {
          // iframe 内部约定: STUDIO_RELOAD = 重新拉 manifest 并刷新视图
          postToIframe({ type: 'STUDIO_RELOAD' });
        },
      },
    },
  });

  useEffect(() => { surface.setSnapshot(snapshot); /* eslint-disable-next-line */ }, [snapshot]);

  // iframe URL 带 slug query, 给 wb-character app 第一时间能用
  const iframeSrc = useMemo(() => {
    const u = new URL(IFRAME_SRC, window.location.origin);
    if (slug) u.searchParams.set('slug', slug);
    u.searchParams.set('embedded', '1');
    return u.pathname + u.search;
  }, [slug]);

  return (
    <div className="wbc-host">
      <style>{CSS}</style>
      <div className="wbc-host-bar">
        <span className="wbc-host-title">⚒️ 角色编辑器</span>
        <span className="wbc-host-slug">
          <label>slug</label>
          {allSlugs.length === 0 ? (
            <input
              className="wbc-host-input"
              value={slug ?? ''}
              onChange={(e) => setAutoSlug(e.target.value || null)}
              placeholder="(无游戏)"
            />
          ) : (
            <select
              className="wbc-host-input"
              value={slug ?? ''}
              onChange={(e) => setAutoSlug(e.target.value || null)}
            >
              <option value="">-- 选 --</option>
              {allSlugs.map((g) => (
                <option key={g.slug} value={g.slug}>{g.slug} · {g.name}</option>
              ))}
            </select>
          )}
        </span>
        <span className={`wbc-host-status ${iframeReady ? 'on' : 'off'}`}>
          {iframeReady ? '● iframe 就绪' : '○ iframe 加载中'}
        </span>
      </div>
      <div className="wbc-host-frame-wrap">
        {!slug ? (
          <div className="wbc-host-empty">
            <strong>未选定 game slug</strong>
            <p>在 Files / Projects pin 一个游戏后再回到这里; 或者在上方手动填一个。</p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="wbc-host-frame"
            src={iframeSrc}
            allow="clipboard-read; clipboard-write"
            title="wb-character editor"
          />
        )}
      </div>
      {lastEvent && (
        <div className="wbc-host-event" title="最近一次 iframe → host 消息">
          {new Date(lastEvent.ts).toLocaleTimeString()} · {lastEvent.type}
        </div>
      )}
    </div>
  );
}

export default WbCharacterHostPanel;

const CSS = `
.wbc-host { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #0b0c0a; color: #d8dde7; }
.wbc-host-bar {
  display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  background: #11141b; border-bottom: 1px solid #232a38; font-size: 12px;
}
.wbc-host-title { font-weight: 600; }
.wbc-host-slug { display: flex; align-items: center; gap: 4px; }
.wbc-host-slug label {
  font-size: 10px; text-transform: uppercase; color: #6a7383; letter-spacing: 0.5px;
}
.wbc-host-input {
  background: #0d1019; border: 1px solid #232a38; border-radius: 6px;
  color: #e6e9ef; padding: 3px 6px; font-size: 11px;
}
.wbc-host-status { margin-left: auto; font-size: 11px; }
.wbc-host-status.on { color: #34d399; }
.wbc-host-status.off { color: #6a7383; }
.wbc-host-frame-wrap { flex: 1; min-height: 0; position: relative; }
.wbc-host-frame { width: 100%; height: 100%; border: 0; display: block; }
.wbc-host-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; color: #8a93a6;
  text-align: center; padding: 24px;
}
.wbc-host-empty strong { color: #d8dde7; font-size: 14px; }
.wbc-host-empty p { font-size: 12px; max-width: 280px; line-height: 1.5; }
.wbc-host-event {
  font-size: 10px; color: #6a7383; padding: 2px 10px;
  background: #0d1019; border-top: 1px solid #232a38; font-family: monospace;
}
`;
