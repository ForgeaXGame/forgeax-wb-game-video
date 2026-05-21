import { GlobalState } from './state/GlobalState';
import { Bridge } from './platform/Bridge';
import { mountLeft } from './ui/left/LeftPane';
import { mountCenter } from './ui/center/CenterPane';
import { mountRight } from './ui/shared/RightPane';

const PLUGIN_ID = '@forgeax-plugin/_template';
const SURFACE_ID = 'template';

type Pane = 'left' | 'center' | 'standalone';

function detectPane(): Pane {
  const q = new URLSearchParams(location.search).get('pane');
  if (q === 'left' || q === 'center') return q;
  return 'standalone';
}

function bootstrap() {
  const pane = detectPane();
  document.body.setAttribute('data-pane', pane);

  const state = new GlobalState({ pluginId: PLUGIN_ID, surfaceId: SURFACE_ID, pane });
  const bridge = new Bridge({ pluginId: PLUGIN_ID, surfaceId: SURFACE_ID, pane, state });

  state.bindBridge(bridge);

  // Mount panes that are visible in current mode. CSS handles display, but
  // we skip the JS entirely when irrelevant to save work.
  if (pane !== 'center') {
    const leftRoot = document.getElementById('left-root');
    if (leftRoot) mountLeft(leftRoot, state, bridge);
  }
  if (pane !== 'left') {
    const centerRoot = document.getElementById('center-root');
    if (centerRoot) mountCenter(centerRoot, state, bridge);
  }
  if (pane === 'standalone') {
    const rightRoot = document.getElementById('right-root');
    if (rightRoot) mountRight(rightRoot, state, bridge);
  }

  bridge.announceReady();
}

bootstrap();
