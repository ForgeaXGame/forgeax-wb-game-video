import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

type Pane = 'left' | 'center' | 'standalone';

// The split workbench host loads two iframes (?pane=left | ?pane=center). The
// standalone dev server (no param) renders both panes side by side.
function detectPane(): Pane {
  const pane = new URLSearchParams(window.location.search).get('pane');
  if (pane === 'left' || pane === 'center') return pane;
  return 'standalone';
}

const pane = detectPane();
document.body.dataset.pane = pane;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App pane={pane} />
    </StrictMode>,
  );
}
