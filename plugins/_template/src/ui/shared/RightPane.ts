import type { GlobalState } from '../../state/GlobalState';
import type { Bridge } from '../../platform/Bridge';

/* Right pane is only visible in standalone mode. Inside Studio host,
 * the right region is taken over by the global ChatPanel, so this
 * file is unused there. */
export function mountRight(root: HTMLElement, state: GlobalState, _bridge: Bridge) {
  root.innerHTML = `
    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
      standalone-only diagnostics
    </div>
    <div id="r-state" style="font-family:monospace;font-size:11px;background:#111;padding:8px;border-radius:3px;color:#888;"></div>
  `;
  const out = root.querySelector('#r-state') as HTMLElement;
  state.subscribe((s) => {
    out.textContent = JSON.stringify(s, null, 2);
  });
}
