import type { GlobalState } from '../../state/GlobalState';
import type { Bridge } from '../../platform/Bridge';

export function mountLeft(root: HTMLElement, state: GlobalState, bridge: Bridge) {
  root.innerHTML = `
    <div class="field">
      <label>Prompt</label>
      <textarea id="t-prompt" rows="4" placeholder="describe what you want..."></textarea>
    </div>
    <div class="field">
      <button class="btn" id="t-submit">Run echo tool</button>
    </div>
    <div class="field">
      <label>Last result</label>
      <pre id="t-last" style="background:#111;padding:8px;border-radius:3px;font-size:11px;white-space:pre-wrap;word-break:break-all;color:#9c9;margin:0;">—</pre>
    </div>
  `;

  const ta = root.querySelector('#t-prompt') as HTMLTextAreaElement;
  const btn = root.querySelector('#t-submit') as HTMLButtonElement;
  const last = root.querySelector('#t-last') as HTMLPreElement;

  ta.addEventListener('input', () => state.setLocal({ prompt: ta.value }));

  btn.addEventListener('click', async () => {
    state.setBusiness({ busy: true });
    try {
      const result = await bridge.callTool('template:echo', { text: ta.value });
      state.setBusiness({ lastResult: JSON.stringify(result), busy: false });
    } catch (e: any) {
      state.setBusiness({ lastResult: `error: ${e?.message ?? e}`, busy: false });
    }
  });

  state.subscribe((s) => {
    if (ta.value !== s.prompt) ta.value = s.prompt;
    last.textContent = s.lastResult ?? '—';
    btn.disabled = s.busy;
  });
}
