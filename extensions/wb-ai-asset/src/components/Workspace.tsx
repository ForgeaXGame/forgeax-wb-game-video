import { useEffect, useState } from 'react';
import { AlertTriangle, PackageCheck, RefreshCw } from 'lucide-react';
import { type Gen3DAssetManifest, selectFile } from '@shared/manifest';
import { callTool } from '@/lib/toolClient';
import { blobUrl } from '@/lib/blobUrl';
import { downloadBundle } from '@/lib/exportBundle';
import { ModelViewer } from '@/components/ModelViewer';
import { StepCard } from '@/components/StepCard';
import { t } from '@/i18n';
import type { EngineImportResult, EngineImportStatus, GenerateResult } from '@/types';

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

  const [importStatus, setImportStatus] = useState<EngineImportStatus | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const assetPathForImport = selected?.assetPath ?? null;

  useEffect(() => {
    let cancelled = false;
    setImportStatus(null);
    setImportError(null);
    if (!assetPathForImport) return;
    void (async () => {
      const r = await callTool<EngineImportStatus>('aiasset:engine-import-status', { assetPath: assetPathForImport });
      if (cancelled) return;
      if (!r.ok) {
        setImportError(r.error);
        return;
      }
      setImportStatus(r.result);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetPathForImport]);

  const importToGame = async () => {
    if (!assetPathForImport) return;
    setImporting(true);
    setImportError(null);
    const r = await callTool<EngineImportResult>('aiasset:import-to-engine', { assetPath: assetPathForImport });
    setImporting(false);
    if (!r.ok) {
      setImportError(r.error);
      return;
    }
    if (!r.result.ok) {
      setImportError(t('import.failed', { message: r.result.message }));
      return;
    }
    setNote(t('import.successNote'));
    const refreshed = await callTool<EngineImportStatus>('aiasset:engine-import-status', { assetPath: assetPathForImport });
    if (refreshed.ok) setImportStatus(refreshed.result);
  };

  if (!selected) {
    return (
      <div className="aa-workspace aa-workspace--empty">
        <div className="aa-empty-hero">
          <span className="aa-empty-emoji">📦</span>
          <p>{t('ws.emptyHero')}</p>
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
      setNote(t('note.exported'));
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
    setNote(
      t('note.result', {
        state: cacheHit ? t('note.cacheHit') : t('note.done'),
        mock: usedMock ? t('note.mockTag') : '',
        path: manifest.assetPath,
      }),
    );
    onGenerated(manifest);
  };

  return (
    <div className="aa-workspace">
      <div className="aa-viewer-wrap">
        {glbUrl ? (
          <ModelViewer url={glbUrl} />
        ) : (
          <div className="aa-viewer aa-viewer--empty">{t('ws.noGlb')}</div>
        )}
      </div>

      <div className="aa-stage-head">
        <h2 className="aa-stage-title">{selected.userLabel?.trim() || selected.prompt?.trim() || selected.assetPath.split('/').pop()}</h2>
        <div className="aa-stage-tags">
          <span className={`aa-tag aa-tag--${selected.providerMode}`}>{selected.providerMode}</span>
          <span className="aa-tag">{selected.mode}</span>
          {selected.targetFaceCount ? (
            <span className="aa-tag">{t('stat.faces', { count: selected.targetFaceCount.toLocaleString() })}</span>
          ) : null}
        </div>
        <button type="button" className="aa-btn aa-btn--ghost" onClick={exportZip} disabled={busy !== null || !glbUrl}>
          {busy === 'export' ? t('btn.exporting') : t('btn.exportZip')}
        </button>
        <button
          type="button"
          className="aa-btn aa-btn--ghost"
          onClick={importToGame}
          disabled={importing || !glbUrl || importStatus === null}
          title={importStatus?.needsDracoNormalize ? t('import.needsDraco') : undefined}
        >
          {importing ? (
            <>
              <RefreshCw size={13} className="aa-spin" /> {t('btn.importing')}
            </>
          ) : importError ? (
            <>
              <AlertTriangle size={13} /> {t('btn.retryImport')}
            </>
          ) : importStatus?.imported ? (
            <>
              <RefreshCw size={13} /> {t('btn.reimportToGame')}
            </>
          ) : importStatus?.needsDracoNormalize ? (
            <>
              <AlertTriangle size={13} /> {t('btn.importToGame')}
            </>
          ) : (
            <>
              <PackageCheck size={13} /> {t('btn.importToGame')}
            </>
          )}
        </button>
      </div>

      {error ? <p className="aa-error">{error}</p> : null}
      {note ? <p className="aa-note">{note}</p> : null}
      {importError ? <p className="aa-error">{importError}</p> : null}

      <div className="aa-stages">
        <StepCard title={t('step.refine')} icon="🎨" hint={canRefine ? t('hint.refineCan') : t('hint.refineCannot')}>
          <label className="aa-field">
            <span className="aa-field-label">{t('label.texturePrompt')}</span>
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
            {busy === 'refine' ? t('btn.processing') : t('btn.refine')}
          </button>
        </StepCard>

        <StepCard title={t('step.retexture')} icon="🖌️" hint={t('hint.retexture')}>
          <label className="aa-field">
            <span className="aa-field-label">{t('label.stylePrompt')}</span>
            <input type="text" value={stylePrompt} placeholder="rusty iron, fantasy gold…" onChange={(e) => setStylePrompt(e.target.value)} />
          </label>
          <label className="aa-field">
            <span className="aa-field-label">{t('label.styleUrl')}</span>
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
            {busy === 'retexture' ? t('btn.processing') : t('btn.retexture')}
          </button>
        </StepCard>

        <StepCard title={t('step.remesh')} icon="🔻" hint={t('hint.remesh')}>
          <label className="aa-field">
            <span className="aa-field-label">{t('label.targetPoly', { count: remeshPoly.toLocaleString() })}</span>
            <input type="range" min={300} max={50000} step={100} value={remeshPoly} onChange={(e) => setRemeshPoly(Number(e.target.value))} />
          </label>
          <label className="aa-field">
            <span className="aa-field-label">{t('label.topology')}</span>
            <select value={remeshTopology} onChange={(e) => setRemeshTopology(e.target.value as 'triangle' | 'quad')}>
              <option value="triangle">{t('opt.triangle')}</option>
              <option value="quad">{t('opt.quad')}</option>
            </select>
          </label>
          <button
            type="button"
            className="aa-btn aa-btn--primary"
            disabled={busy !== null}
            onClick={() => run('remesh', 'aiasset:remesh', { targetPolycount: remeshPoly, topology: remeshTopology })}
          >
            {busy === 'remesh' ? t('btn.processing') : t('btn.remesh')}
          </button>
        </StepCard>
      </div>
    </div>
  );
}
