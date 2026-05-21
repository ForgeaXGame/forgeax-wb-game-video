/**
 * wb-character host — Sidebar wrapper (left pane).
 *
 * Renders the wb-character app at `?pane=left`, so its built-in
 * `.editor-left` form fills the Sidebar slot, while CSS hides every
 * other region (topbar / center viewport / right panel / bottom).
 *
 * Pair file: `panel.tsx` renders the same html at `?pane=center` for
 * MainArea. Both iframes are same-origin and share state through
 * BroadcastChannel(`forgeax-plugin.@forgeax-plugin/wb-character`) plus
 * the bus surface (Module 16 §5–6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const IFRAME_SRC = '/plugins/wb-character/';

export function WbCharacterHostSidebar(): JSX.Element {
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
      .catch(() => { /* leave empty */ });
    return () => { cancelled = true; };
  }, [pinnedSlug]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try { w.postMessage(msg, '*'); } catch { /* */ }
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string };
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'STUDIO_READY' || data.type === 'PANEL_READY') {
        setIframeReady(true);
        postToIframe({
          type: 'STUDIO_INIT',
          pane: 'left',
          ctx: {
            slug,
            apiBase: '/api/wb/character',
            assetBase: '/api/wb/character/asset',
            host: 'forgeax-studio',
          },
        });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [postToIframe, slug]);

  useEffect(() => {
    if (!iframeReady) return;
    postToIframe({ type: 'STUDIO_CTX', ctx: { slug } });
  }, [iframeReady, slug, postToIframe]);

  const iframeSrc = useMemo(() => {
    const u = new URL(IFRAME_SRC, window.location.origin);
    if (slug) u.searchParams.set('slug', slug);
    u.searchParams.set('embedded', '1');
    u.searchParams.set('pane', 'left');
    return u.pathname + u.search;
  }, [slug]);

  return (
    <div className="wbc-sb-host">
      <style>{CSS}</style>
      <div className="wbc-sb-bar">
        <span className="wbc-sb-title">⚒️ 角色编辑器</span>
      </div>
      <div className="wbc-sb-slug">
        <label>slug</label>
        {allSlugs.length === 0 ? (
          <input
            className="wbc-sb-input"
            value={slug ?? ''}
            onChange={(e) => setAutoSlug(e.target.value || null)}
            placeholder="(无游戏)"
          />
        ) : (
          <select
            className="wbc-sb-input"
            value={slug ?? ''}
            onChange={(e) => setAutoSlug(e.target.value || null)}
          >
            <option value="">-- 选 --</option>
            {allSlugs.map((g) => (
              <option key={g.slug} value={g.slug}>{g.slug} · {g.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="wbc-sb-frame-wrap">
        {!slug ? (
          <div className="wbc-sb-empty">
            <strong>未选定 game slug</strong>
            <p>在 Files / Projects pin 一个游戏后再回到这里。</p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="wbc-sb-frame"
            src={iframeSrc}
            allow="clipboard-read; clipboard-write"
            title="wb-character (left pane)"
          />
        )}
      </div>
    </div>
  );
}

export default WbCharacterHostSidebar;

const CSS = `
.wbc-sb-host { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; background: #0b0c0a; color: #d8dde7; }
.wbc-sb-bar {
  display: flex; align-items: center; padding: 8px 10px;
  background: #11141b; border-bottom: 1px solid #232a38; font-size: 12px;
}
.wbc-sb-title { font-weight: 600; }
.wbc-sb-slug {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  background: #0d1019; border-bottom: 1px solid #232a38;
}
.wbc-sb-slug label {
  font-size: 10px; text-transform: uppercase; color: #6a7383; letter-spacing: 0.5px;
}
.wbc-sb-input {
  background: #0d1019; border: 1px solid #232a38; border-radius: 4px;
  color: #e6e9ef; padding: 3px 6px; font-size: 11px; flex: 1; min-width: 0;
}
.wbc-sb-frame-wrap { flex: 1; min-height: 0; position: relative; }
.wbc-sb-frame { width: 100%; height: 100%; border: 0; display: block; background: #0b0c0a; }
.wbc-sb-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; color: #8a93a6;
  text-align: center; padding: 24px;
}
.wbc-sb-empty strong { color: #d8dde7; font-size: 13px; }
.wbc-sb-empty p { font-size: 11px; max-width: 240px; line-height: 1.5; }
`;
