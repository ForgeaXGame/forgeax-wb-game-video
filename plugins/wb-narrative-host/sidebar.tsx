/**
 * wb-narrative host — Sidebar wrapper (left pane).
 *
 * Renders the wb-narrative viz app at `?pane=left`, so its built-in
 * TierModeSelector (INPUT / ROUTING / HISTORY / PIPELINE STATUS) fills
 * the Sidebar slot, while the right content panel is hidden by CSS.
 *
 * Pair file: `panel.tsx` renders the same dist at `?pane=center` for
 * MainArea. Both iframes are same-origin and share state through
 * BroadcastChannel(`forgeax-plugin.@forgeax-plugin/wb-narrative`).
 */

const IFRAME_SRC = '/plugins/wb-narrative/index.html';

export function WbNarrativeHostSidebar(): JSX.Element {
  return (
    <div className="wbn-sb-host">
      <style>{CSS}</style>
      <iframe
        className="wbn-sb-frame"
        src={`${IFRAME_SRC}?pane=left&embedded=1`}
        title="Narrative Studio (sidebar)"
      />
    </div>
  );
}

export default WbNarrativeHostSidebar;

const CSS = `
.wbn-sb-host { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; background: #060a04; }
.wbn-sb-frame { width: 100%; height: 100%; border: 0; display: block; background: #060a04; }
`;
