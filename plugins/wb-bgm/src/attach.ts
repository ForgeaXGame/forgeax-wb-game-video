import { showToast } from './utils.ts';

/** A BGM/SFX selection ready to be written into the current game. */
export interface AudioSelection {
  assetId: string;
  name: string;
  kind: 'bgm' | 'sfx';
  version: string;
  resUrl: string;
  filename: string;
}

/**
 * POST the selection to the host attach endpoint. The server downloads the
 * COS blob into <game>/audio/ and upserts audio/manifest.json. `slug` is the
 * required target game (no auto-detect). `btn` (when given) is disabled with a
 * transient label during the request.
 */
export async function attachToGame(sel: AudioSelection | null, btn: HTMLButtonElement | undefined, slug: string): Promise<void> {
  if (!sel) {
    showToast('请先选择一个 BGM/音效', 'warning');
    return;
  }
  if (!sel.assetId || !sel.resUrl) {
    showToast('该资产缺少 ID 或下载链接，无法配入游戏', 'error');
    return;
  }
  if (!slug || !slug.trim()) {
    showToast('请先选择目标游戏', 'warning');
    return;
  }
  const original = btn?.textContent ?? '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '配入中…';
  }
  try {
    const r = await fetch('/api/wb/bgm/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sel, slug: slug.trim(), addedBy: 'human' }),
    });
    const data = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok) throw new Error((data.message as string) || (data.error as string) || `HTTP ${r.status}`);
    showToast(`已配入游戏「${data.slug}」：${data.path}`, 'success');
  } catch (e) {
    showToast(`配入失败：${e instanceof Error ? e.message : String(e)}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
}
