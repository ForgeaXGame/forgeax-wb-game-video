/**
 * wb-narrative host — MainArea wrapper (center pane).
 *
 * Renders the wb-narrative viz app at `?pane=center`, showing only
 * the mode-bar + content area (TextViewPanel / NarrativeCanvas).
 * The sidebar (TierModeSelector) is hidden by CSS.
 *
 * Pair file: `sidebar.tsx` renders the same dist at `?pane=left` for
 * the Sidebar slot. Both iframes share state through BroadcastChannel.
 */

const IFRAME_SRC = '/plugins/wb-narrative/index.html';

export function WbNarrativeHostPanel(): JSX.Element {
  return (
    <div className="wbn-host">
      <style>{CSS}</style>
      <iframe
        className="wbn-host-frame"
        src={`${IFRAME_SRC}?pane=center&embedded=1`}
        title="Narrative Studio (main)"
      />
    </div>
  );
}

export default WbNarrativeHostPanel;

const CSS = `
.wbn-host { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; background: #060a04; }
.wbn-host-frame { width: 100%; height: 100%; border: 0; display: block; background: #060a04; }
`;
