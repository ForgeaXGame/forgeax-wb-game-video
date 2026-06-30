import { useState } from 'react';
import { type Gen3DAssetManifest, selectFile } from '@shared/manifest';
import { callTool } from '@/lib/toolClient';
import { blobUrl } from '@/lib/blobUrl';
import { downloadBundle } from '@/lib/exportBundle';
import { ModelViewer } from '@/components/ModelViewer';
import { StepCard } from '@/components/StepCard';
import type { GenerateResult } from '@/types';

// Build the model-input args for a secondary stage. Prefer the upstream Meshy
// task id (no COS needed); fall back to the stored asset path (COS-shared by the
// backend on a real cache miss).
function modelInput(asset: Gen3DAssetManifest): Record<string, unknown> {
  if (asset.sourceJobId) return { inputTaskId: asset.sourceJobId };
  return { sourceAssetPath: asset.assetPath };
}

export function Workspace({
  selected,
  onGenerated,
}: {
  selected: Gen3DAssetManifest | null;
  onGenerated: (m: Gen3DAssetManifest) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [texturePrompt, setTexturePrompt] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [styleImageUrl, setStyleImageUrl] = useState('');
  const [remeshPoly, setRemeshPoly] = useState(4000);
  const [remeshTopology, setRemeshTopology] = useState<'triangle' | 'quad'>('triangle');

  if (!selected) {
    return (
      <div className="aa-workspace aa-workspace--empty">
        <div className="aa-empty-hero">
          <span className="aa-empty-emoji">📦</span>
          <p>左侧生成或从资产库选择一个低模，在此预览并做二次加工（贴图 / 重拓扑 / 换肤）。</p>
        </div>
      </div>
    );
  }

  const glb = selectFile(selected.files, 'source_mesh', 'glb');
  const glbUrl = blobUrl(glb);
  const canRefine = selected.mode === 'text' && !!selected.sourceJobId;

  const exportZip = async () => {
    setError(null);
    setNote(null);
    setBusy('export');
    try {
      await downloadBundle(selected);
      setNote('已打包下载 .zip（GLB + 纹理 + manifest）。');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const run = async (label: string, tool: string, args: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    const r = await callTool<GenerateResult>(tool, { ...modelInput(selected), assetSlot: selected.assetSlot, ...args });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const { manifest, usedMock, cacheHit } = r.result;
    setNote(`${cacheHit ? '命中缓存' : '完成'}${usedMock ? '（mock）' : ''}：${manifest.assetPath}`);
    onGenerated(manifest);
  };

  return (
    <div className="aa-workspace">
      <div className="aa-viewer-wrap">
        {glbUrl ? (
          <ModelViewer url={glbUrl} />
        ) : (
          <div className="aa-viewer aa-viewer--empty">无可预览的 GLB</div>
        )}
      </div>

      <div className="aa-stage-head">
        <h2 className="aa-stage-title">{selected.userLabel?.trim() || selected.prompt?.trim() || selected.assetPath.split('/').pop()}</h2>
        <div className="aa-stage-tags">
          <span className={`aa-tag aa-tag--${selected.providerMode}`}>{selected.providerMode}</span>
          <span className="aa-tag">{selected.mode}</span>
          {selected.targetFaceCount ? <span className="aa-tag">{selected.targetFaceCount.toLocaleString()} 面</span> : null}
        </div>
        <button type="button" className="aa-btn aa-btn--ghost" onClick={exportZip} disabled={busy !== null || !glbUrl}>
          {busy === 'export' ? '打包中…' : '导出 .zip'}
        </button>
      </div>

      {error ? <p className="aa-error">{error}</p> : null}
      {note ? <p className="aa-note">{note}</p> : null}

      <div className="aa-stages">
        <StepCard title="补贴图（refine）" icon="🎨" hint={canRefine ? '为该预览模型补 PBR 贴图。' : '仅文生预览（未贴图）可补贴图。'}>
          <label className="aa-field">
            <span className="aa-field-label">贴图提示词（可选）</span>
            <input type="text" value={texturePrompt} placeholder="worn metal, painted wood…" onChange={(e) => setTexturePrompt(e.target.value)} />
          </label>
          <button
            type="button"
            className="aa-btn aa-btn--primary"
            disabled={!canRefine || busy !== null}
            onClick={() =>
              run('refine', 'aiasset:refine', {
                previewTaskId: selected.sourceJobId,
                texturePrompt: texturePrompt.trim() || undefined,
              })
            }
          >
            {busy === 'refine' ? '处理中…' : '补贴图'}
          </button>
        </StepCard>

        <StepCard title="换肤（retexture）" icon="🖌️" hint="用文字或图片风格为模型重新生成贴图，产出新资产。">
          <label className="aa-field">
            <span className="aa-field-label">风格提示词</span>
            <input type="text" value={stylePrompt} placeholder="rusty iron, fantasy gold…" onChange={(e) => setStylePrompt(e.target.value)} />
          </label>
          <label className="aa-field">
            <span className="aa-field-label">或风格图 URL</span>
            <input type="text" value={styleImageUrl} placeholder="https://…" onChange={(e) => setStyleImageUrl(e.target.value)} />
          </label>
          <button
            type="button"
            className="aa-btn aa-btn--primary"
            disabled={busy !== null || (!stylePrompt.trim() && !styleImageUrl.trim())}
            onClick={() =>
              run('retexture', 'aiasset:retexture', {
                textStylePrompt: stylePrompt.trim() || undefined,
                imageStyleUrl: styleImageUrl.trim() || undefined,
              })
            }
          >
            {busy === 'retexture' ? '处理中…' : '换肤'}
          </button>
        </StepCard>

        <StepCard title="重拓扑（remesh）" icon="🔻" hint="把模型重新网格化到目标面数，做 LOD / 减面。">
          <label className="aa-field">
            <span className="aa-field-label">目标面数：{remeshPoly.toLocaleString()}</span>
            <input type="range" min={300} max={50000} step={100} value={remeshPoly} onChange={(e) => setRemeshPoly(Number(e.target.value))} />
          </label>
          <label className="aa-field">
            <span className="aa-field-label">拓扑</span>
            <select value={remeshTopology} onChange={(e) => setRemeshTopology(e.target.value as 'triangle' | 'quad')}>
              <option value="triangle">三角面</option>
              <option value="quad">四边面</option>
            </select>
          </label>
          <button
            type="button"
            className="aa-btn aa-btn--primary"
            disabled={busy !== null}
            onClick={() => run('remesh', 'aiasset:remesh', { targetPolycount: remeshPoly, topology: remeshTopology })}
          >
            {busy === 'remesh' ? '处理中…' : '重拓扑'}
          </button>
        </StepCard>
      </div>
    </div>
  );
}
