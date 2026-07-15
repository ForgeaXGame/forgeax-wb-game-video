import { useEffect, useState, type JSX } from 'react';
import { Box, AlertTriangle as AlertIcon } from 'lucide-react';
import { motionRefKey, selectFile, selectFiles } from '@shared/manifest';
import type { Gen3DAssetManifest, ManifestFile } from '@shared/manifest';
import type { ApplyMotionInput, EngineImportResult, EngineImportStatus, GenerateResult } from '@/types';
import { blobUrl } from '@/lib/blobUrl';
import { downloadBundle } from '@/lib/exportBundle';
import { callTool } from '@/lib/toolClient';
import { ModelViewer } from '@/components/ModelViewer';
import { MotionBrowser } from '@/components/MotionBrowser';
import { PlayableExportPanel } from '@/components/PlayableExportPanel';
import { EDITOR_ICON_MAP, motionMeta } from '@/ui-meta';
import { t } from '@/i18n';

// One semantic glyph per action, drawn from the shared editor icon vocabulary
// so the same action reads the same across step / CTA / empty / library.
const GenerateIcon = EDITOR_ICON_MAP.generate;
const RefreshIcon = EDITOR_ICON_MAP.refresh;
const RefineIcon = EDITOR_ICON_MAP.refine;
const RigIcon = EDITOR_ICON_MAP.rig;
const MotionIcon = EDITOR_ICON_MAP.motion;
const LowpolyIcon = EDITOR_ICON_MAP.lowpoly;
const ImgIcon = EDITOR_ICON_MAP.image;
const HandoffIcon = EDITOR_ICON_MAP.handoff;
const ImportIcon = EDITOR_ICON_MAP.importGame;

// Center pane: header + transient error/loading banners + the result workspace.
// Selection from the asset library takes precedence over the latest generation;
// neither path hides the loading banner while a new generation is in flight.
export function Workspace({
  latest,
  selected,
  busy,
  error,
  canRetry,
  onRetry,
  onDismissError,
  onRefine,
  onAutoRig,
  onApplyMotion,
  onRetopoLowpoly,
}: {
  latest: GenerateResult | null;
  selected: Gen3DAssetManifest | null;
  busy: boolean;
  error: string | null;
  canRetry: boolean;
  onRetry: () => void;
  onDismissError: () => void;
  onRefine: (previewTaskId: string) => void;
  onAutoRig: (assetPath: string) => void;
  onApplyMotion: (assetPath: string, motion: ApplyMotionInput) => void;
  onRetopoLowpoly: (assetPath: string) => void;
}): JSX.Element {
  return (
    <div className="gx-workspace">
      <div className="ws-header">
        <span className="ws-eyebrow">Hunyuan3D / Meshy / Rodin</span>
        <h1 className="ws-title">{t('ws.title')}</h1>
      </div>

      {error && (
        <div className="gx-error" role="alert">
          <div className="gx-error-head">
            <AlertIcon size={15} /> {t('ws.error.title')}
          </div>
          <p className="gx-error-msg">{error}</p>
          <div className="gx-error-actions">
            <button type="button" className="fx-btn fx-btn--sm" disabled={!canRetry} onClick={onRetry}>
              {t('ws.btn.retry')}
            </button>
            <button
              type="button"
              className="fx-btn fx-btn--sm"
              onClick={() => navigator.clipboard?.writeText(error)}
            >
              {t('ws.btn.copyDetails')}
            </button>
            <button type="button" className="fx-btn fx-btn--sm" onClick={onDismissError}>
              {t('ws.btn.close')}
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div className="gx-state">
          <RefreshIcon className="gx-spin" size={24} />
          <div className="gx-state-title">{t('ws.busy.title')}</div>
          <p className="gx-state-copy">{t('ws.busy.copy')}</p>
        </div>
      )}

      {selected ? (
        <ResultCard
          manifest={selected}
          busy={busy}
          onRefine={onRefine}
          onAutoRig={onAutoRig}
          onApplyMotion={onApplyMotion}
          onRetopoLowpoly={onRetopoLowpoly}
          badges={
            <div className="badge-row">
              <span className={`badge ${selected.providerMode === 'real' ? 'badge--real' : 'badge--mock'}`}>
                {selected.providerMode}
              </span>
            </div>
          }
        />
      ) : latest ? (
        <ResultCard
          manifest={latest.manifest}
          busy={busy}
          onRefine={onRefine}
          onAutoRig={onAutoRig}
          onApplyMotion={onApplyMotion}
          onRetopoLowpoly={onRetopoLowpoly}
          badges={
            <div className="badge-row">
              {latest.usedMock ? (
                <span className="badge badge--mock">mock</span>
              ) : (
                <span className="badge badge--real">real</span>
              )}
              {latest.cacheHit && <span className="badge badge--cache">cache hit</span>}
            </div>
          }
        />
      ) : (
        <div className="gx-state">
          <GenerateIcon size={26} />
          <div className="gx-state-title">{t('ws.empty.title')}</div>
          <p className="gx-state-copy">{t('ws.empty.copy')}</p>
        </div>
      )}
    </div>
  );
}

// Shared mesh-preview body for both a library selection and the latest result.
// Only the badge row differs between the two, so it is injected by the caller.
function ResultCard({
  manifest,
  badges,
  busy,
  onRefine,
  onAutoRig,
  onApplyMotion,
  onRetopoLowpoly,
}: {
  manifest: Gen3DAssetManifest;
  badges: JSX.Element;
  busy: boolean;
  onRefine: (previewTaskId: string) => void;
  onAutoRig: (assetPath: string) => void;
  onApplyMotion: (assetPath: string, motion: ApplyMotionInput) => void;
  onRetopoLowpoly: (assetPath: string) => void;
}): JSX.Element {
  const meshFile = selectFile(manifest.files, 'source_mesh', 'glb');
  const previewFile = manifest.files.find((f) => f.role === 'preview_image') ?? null;
  // Prefer the animated GLB (so the viewer can play the clip), then the rigged
  // GLB, then the plain source mesh. All are self-contained GLBs (ADR-0003).
  const animatedGlb = selectFile(manifest.files, 'animated_model', 'glb');
  const riggedGlb = selectFile(manifest.files, 'rigged_model', 'glb');
  const viewerFile = animatedGlb ?? riggedGlb ?? meshFile;
  const meshUrl = blobUrl(viewerFile);
  // Build the viewer's selectable clip list: a static base pose (rigged or raw
  // mesh, no animation) followed by every applied motion as its own clip. Each
  // animated_model GLB carries the clip for exactly one motion, so the chip row
  // lets the user switch which motion plays (one GLB reload per switch). Prefer
  // the generalized motionRef (any system); fall back to the legacy motionType
  // label for older sidecars that only stored a bare int.
  const motionClips = selectFiles(manifest.files, 'animated_model', 'glb')
    .map((f) => {
      const url = blobUrl(f);
      if (!url) return null;
      if (f.motionRef) return { url, label: f.motionRef.label, key: motionRefKey(f.motionRef) };
      if (f.motionType !== undefined) {
        const meta = motionMeta[f.motionType];
        return {
          url,
          label: meta ? t(meta.label) : t('ws.motionFallback', { n: f.motionType }),
          key: `m${f.motionType}`,
        };
      }
      return null;
    })
    .filter((c): c is { url: string; label: string; key: string } => c !== null);
  const baseFile = riggedGlb ?? meshFile;
  const baseUrl = blobUrl(baseFile);
  const viewerClips =
    motionClips.length > 0
      ? [...(baseUrl ? [{ url: baseUrl, label: t('ws.clip.base'), key: 'base' }] : []), ...motionClips]
      : undefined;
  // Refine is Meshy-only second stage texturing a white-mesh text preview. Only
  // real previews carry a usable sourceJobId.
  const refineTaskId = manifest.provider === 'meshy' && manifest.mode === 'text' ? manifest.sourceJobId : null;
  const readinessLabel =
    [
      manifest.readiness.hasSourceMesh ? 'mesh' : null,
      manifest.readiness.rigged ? 'rigged' : null,
      manifest.readiness.animated ? 'animated' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'pending';

  return (
    <article className="result-card">
      <div className="result-card-head">
        <div className="result-card-id">
          <strong>{manifest.provider}</strong>
          <span>{manifest.mode}</span>
        </div>
        {badges}
      </div>

      {meshUrl ? (
        <ModelViewer key={manifest.assetPath} url={meshUrl} clips={viewerClips} />
      ) : (
        <div className="model-viewer--empty">
          <Box size={28} />
          <span>{t('ws.noGlb')}</span>
        </div>
      )}

      <div className="manifest-facts">
        <PreviewThumb file={previewFile} />
        <dl>
          <div>
            <dt>Asset path</dt>
            <dd className="mono">{manifest.assetPath}</dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd>{readinessLabel}</dd>
          </div>
          <div>
            <dt>Source job</dt>
            <dd className="mono">{manifest.sourceJobId ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="badge-row">
        {refineTaskId && (
          <button
            type="button"
            className="fx-btn fx-btn--sm"
            disabled={busy}
            onClick={() => onRefine(refineTaskId)}
          >
            <RefineIcon size={14} /> {busy ? t('ws.btn.busy') : t('ws.refine.btn')}
          </button>
        )}
        <ExportBundleButton manifest={manifest} />
        {manifest.assetSlot !== 'characters' && <ImportToGameButton manifest={manifest} />}
      </div>

      <DownstreamPanel
        manifest={manifest}
        busy={busy}
        onAutoRig={onAutoRig}
        onApplyMotion={onApplyMotion}
        onRetopoLowpoly={onRetopoLowpoly}
      />
      {manifest.assetSlot === 'characters' && <PlayableExportPanel manifest={manifest} busy={busy} />}
    </article>
  );
}

// M13 downstream actions: rig → motion (core pipeline) + low_poly (optional
// side-branch). Steps gate on readiness: auto-rig is offered for any mesh
// (humanoid characters only — soft-gated by a hint, not a hard block), motions
// unlock only once readiness.rigged. Step 2 is a searchable MotionBrowser that
// consumes gen3d:list-motions for the asset's rig system; already-applied
// motions are marked there. low_poly is always available as an explicit,
// separate derived-asset action.
function DownstreamPanel({
  manifest,
  busy,
  onAutoRig,
  onApplyMotion,
  onRetopoLowpoly,
}: {
  manifest: Gen3DAssetManifest;
  busy: boolean;
  onAutoRig: (assetPath: string) => void;
  onApplyMotion: (assetPath: string, motion: ApplyMotionInput) => void;
  onRetopoLowpoly: (assetPath: string) => void;
}): JSX.Element {
  const assetPath = manifest.assetPath;
  const rigged = manifest.readiness.rigged;
  const isCharacter = manifest.assetSlot === 'characters';

  return (
    <section className="downstream">
      <div className="downstream-head">
        <RigIcon size={14} />
        <span>{t('ws.downstream.title')}</span>
      </div>

      {/* Step 1: auto-rig */}
      <div className="downstream-step">
        <span className="downstream-step-no">1</span>
        <div className="downstream-step-body">
          <div className="downstream-step-title">{t('ws.rig.title')}</div>
          {rigged ? (
            <small className="downstream-ok">{t('ws.rig.done')}</small>
          ) : (
            <small className="downstream-hint">
              {isCharacter ? t('ws.rig.hint.char') : t('ws.rig.hint.mesh')}
            </small>
          )}
        </div>
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={busy || rigged}
          onClick={() => onAutoRig(assetPath)}
        >
          <RigIcon size={14} /> {rigged ? t('ws.rig.btn.done') : busy ? t('ws.btn.busy') : t('ws.rig.btn.action')}
        </button>
      </div>

      {/* Step 2: apply motion — searchable catalog (gen3d:list-motions) */}
      <div className={`downstream-step ${rigged ? '' : 'is-disabled'}`}>
        <span className="downstream-step-no">2</span>
        <div className="downstream-step-body">
          <div className="downstream-step-title">
            <MotionIcon size={13} /> {t('ws.motion.title')}
          </div>
          {rigged ? (
            <MotionBrowser manifest={manifest} busy={busy} onApplyMotion={onApplyMotion} />
          ) : (
            <small className="downstream-hint">{t('ws.motion.hint.prereq')}</small>
          )}
        </div>
      </div>

      {/* Optional side-branch: low_poly (new derived asset, textures not kept) */}
      <div className="downstream-aside">
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={busy}
          title={t('ws.lowpoly.title')}
          onClick={() => onRetopoLowpoly(assetPath)}
        >
          <LowpolyIcon size={14} /> {t('ws.lowpoly.btn')}
        </button>
      </div>
    </section>
  );
}

// Export the whole asset (main GLB + rig/motion GLB+FBX + textures + preview +
// manifest.json) as one .zip for handoff. Pure front-end (lib/exportBundle):
// fetches each file from /api/game-assets and zips in-browser — no server route,
// tool, or dependency. Local busy/error state so it never touches the global
// generation spinner.
function ExportBundleButton({ manifest }: { manifest: Gen3DAssetManifest }): JSX.Element {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadBundle(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="fx-btn fx-btn--sm"
        disabled={exporting}
        title={t('ws.export.title')}
        onClick={onExport}
      >
        <HandoffIcon size={14} /> {exporting ? t('ws.export.busy') : t('ws.export.btn')}
      </button>
      {error && (
        <small className="downstream-hint" role="alert" style={{ flexBasis: '100%' }}>
          {t('ws.export.fail', { error })}
        </small>
      )}
    </>
  );
}


// Import to Game (props/mesh only — ROLE1 hides this button for characters,
// gated by the caller on manifest.assetSlot). Cooks/re-cooks the engine
// identity meta (*.glb.meta.json) so the Edit asset panel recognizes the GLB;
// normalizes Draco if needed. Local state only, mirrors ExportBundleButton's
// self-contained pattern but also polls status on mount since import can have
// already happened in a prior session.
function ImportToGameButton({ manifest }: { manifest: Gen3DAssetManifest }): JSX.Element {
  const assetPath = manifest.assetPath;
  const [status, setStatus] = useState<EngineImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setError(null);
    setNote(null);
    void (async () => {
      const r = await callTool<EngineImportStatus>('gen3d:engine-import-status', { assetPath });
      if (cancelled) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatus(r.result);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetPath]);

  const onImport = async () => {
    setImporting(true);
    setError(null);
    setNote(null);
    const r = await callTool<EngineImportResult>('gen3d:import-to-engine', { assetPath });
    setImporting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!r.result.ok) {
      setError(t('ws.import.failed', { message: r.result.message }));
      return;
    }
    setNote(t('ws.import.successNote'));
    const refreshed = await callTool<EngineImportStatus>('gen3d:engine-import-status', { assetPath });
    if (refreshed.ok) setStatus(refreshed.result);
  };

  return (
    <>
      <button
        type="button"
        className="fx-btn fx-btn--sm"
        disabled={importing || status === null}
        title={status?.needsDracoNormalize ? t('ws.import.needsDraco') : undefined}
        onClick={onImport}
      >
        <ImportIcon size={14} />{' '}
        {importing
          ? t('ws.import.busy')
          : error
            ? t('ws.import.retryBtn')
            : status?.imported
              ? t('ws.import.reimportBtn')
              : t('ws.import.btn')}
      </button>
      {note && !error && (
        <small className="downstream-ok" style={{ flexBasis: '100%' }}>
          {note}
        </small>
      )}
      {error && (
        <small className="downstream-hint" role="alert" style={{ flexBasis: '100%' }}>
          {error}
        </small>
      )}
    </>
  );
}

// Generated preview image with a graceful empty fallback (shows file weight when
// a blob exists but no streamable URL, otherwise a neutral "no preview").
function PreviewThumb({ file }: { file: ManifestFile | null }): JSX.Element {
  const url = blobUrl(file);
  if (url) return <img className="preview-thumb" src={url} alt="generated preview" />;
  return (
    <div className="preview-thumb preview-thumb--empty" aria-hidden="true">
      <ImgIcon size={20} />
      <span>{file ? `${(file.bytes / 1024).toFixed(0)} KB` : t('ws.noPreview')}</span>
    </div>
  );
}
