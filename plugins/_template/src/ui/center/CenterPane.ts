import type { GlobalState } from '../../state/GlobalState';
import type { Bridge } from '../../platform/Bridge';

export function mountCenter(root: HTMLElement, state: GlobalState, _bridge: Bridge) {
  root.innerHTML = `
    <div class="center-stage">
      <div class="placeholder" id="c-placeholder">
        <div style="font-size:14px;color:#bbb;margin-bottom:8px;">🧩 center viewport</div>
        <div id="c-prompt-echo" style="color:#666;">(no prompt yet)</div>
        <div id="c-result" style="margin-top:12px;color:#9c9;font-size:11px;"></div>
      </div>
    </div>
  `;

  const echo = root.querySelector('#c-prompt-echo') as HTMLElement;
  const result = root.querySelector('#c-result') as HTMLElement;

  state.subscribe((s) => {
    echo.textContent = s.prompt ? `prompt: "${s.prompt}"` : '(no prompt yet)';
    result.textContent = s.lastResult ? `last: ${s.lastResult.slice(0, 200)}` : '';
  });
}
