import type { JSX } from 'react';
import { Box, AlertTriangle as AlertIcon } from 'lucide-react';
import { selectFile, selectFiles } from '@shared/manifest';
import type { Gen3DAssetManifest, ManifestFile, MotionType } from '@shared/manifest';
import type { GenerateResult } from '@/types';
import { blobUrl } from '@/lib/blobUrl';
import { ModelViewer } from '@/components/ModelViewer';
import { EDITOR_ICON_MAP, MOTION_TYPES, motionMeta } from '@/ui-meta';

// One semantic glyph per action, drawn from the shared editor icon vocabulary
// so the same action reads the same across step / CTA / empty / library.
const GenerateIcon = EDITOR_ICON_MAP.generate;
const RefreshIcon = EDITOR_ICON_MAP.refresh;
const RefineIcon = EDITOR_ICON_MAP.refine;
const RigIcon = EDITOR_ICON_MAP.rig;
const MotionIcon = EDITOR_ICON_MAP.motion;
const LowpolyIcon = EDITOR_ICON_MAP.lowpoly;
const ImgIcon = EDITOR_ICON_MAP.image;

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
  onApplyMotion: (assetPath: string, motionType: number) => void;
  onRetopoLowpoly: (assetPath: string) => void;
}): JSX.Element {
  return (
    <div className="gx-workspace">
      <div className="ws-header">
        <span className="ws-eyebrow">Hunyuan3D / Meshy</span>
        <h1 className="ws-title">生成结果</h1>
      </div>

      {error && (
        <div className="gx-error" role="alert">
          <div className="gx-error-head">
            <AlertIcon size={15} /> 生成失败
          </div>
          <p className="gx-error-msg">{error}</p>
          <div className="gx-error-actions">
            <button type="button" className="fx-btn fx-btn--sm" disabled={!canRetry} onClick={onRetry}>
              重试
            </button>
            <button
              type="button"
              className="fx-btn fx-btn--sm"
              onClick={() => navigator.clipboard?.writeText(error)}
            >
              复制详情
            </button>
            <button type="button" className="fx-btn fx-btn--sm" onClick={onDismissError}>
              关闭
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div className="gx-state">
          <RefreshIcon className="gx-spin" size={24} />
          <div className="gx-state-title">生成中…</div>
          <p className="gx-state-copy">混元真实生成可能需要数分钟，请保持页面打开。</p>
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
          <div className="gx-state-title">还没有结果</div>
          <p className="gx-state-copy">
            在左侧填写描述 / 图片 / 多视图并点击「生成 3D」，或从右侧资产库选择一个查看模型。
          </p>
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
  onApplyMotion: (assetPath: string, motionType: number) => void;
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
        <ModelViewer key={meshUrl} url={meshUrl} />
      ) : (
        <div className="model-viewer--empty">
          <Box size={28} />
          <span>无 GLB 模型</span>
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
            <RefineIcon size={14} /> {busy ? '处理中…' : '加贴图 (refine)'}
          </button>
        )}
      </div>

      <DownstreamPanel
        manifest={manifest}
        busy={busy}
        onAutoRig={onAutoRig}
        onApplyMotion={onApplyMotion}
        onRetopoLowpoly={onRetopoLowpoly}
      />
    </article>
  );
}

// M13 downstream actions: rig → motion (core pipeline) + low_poly (optional
// side-branch). Steps gate on readiness: auto-rig is offered for any mesh
// (humanoid characters only — soft-gated by a hint, not a hard block), motions
// unlock only once readiness.rigged. Applied motions render as a chip row with
// their structural motionType so re-applying one is a no-op. low_poly is always
// available as an explicit, separate derived-asset action.
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
  onApplyMotion: (assetPath: string, motionType: number) => void;
  onRetopoLowpoly: (assetPath: string) => void;
}): JSX.Element {
  const assetPath = manifest.assetPath;
  const rigged = manifest.readiness.rigged;
  const isCharacter = manifest.assetSlot === 'characters';
  const appliedMotions = new Set<MotionType>(
    selectFiles(manifest.files, 'animated_model')
      .map((f) => f.motionType)
      .filter((m): m is MotionType => m !== undefined),
  );

  return (
    <section className="downstream">
      <div className="downstream-head">
        <RigIcon size={14} />
        <span>下游：绑骨 → 动作</span>
      </div>

      {/* Step 1: auto-rig */}
      <div className="downstream-step">
        <span className="downstream-step-no">1</span>
        <div className="downstream-step-body">
          <div className="downstream-step-title">绑定骨架</div>
          {rigged ? (
            <small className="downstream-ok">已绑骨（humanoid）· 可应用动作</small>
          ) : (
            <small className="downstream-hint">
              {isCharacter
                ? '为带贴图的高模角色绑定人形骨架（保贴图）。'
                : '绑骨仅对人形角色有意义；此资产在「物件」槽，绑骨结果可能无效。'}
            </small>
          )}
        </div>
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={busy || rigged}
          onClick={() => onAutoRig(assetPath)}
        >
          <RigIcon size={14} /> {rigged ? '已绑骨' : busy ? '处理中…' : '自动绑骨'}
        </button>
      </div>

      {/* Step 2: apply motion (one of 8 fixed motions) */}
      <div className={`downstream-step ${rigged ? '' : 'is-disabled'}`}>
        <span className="downstream-step-no">2</span>
        <div className="downstream-step-body">
          <div className="downstream-step-title">
            <MotionIcon size={13} /> 应用动作
          </div>
          {rigged ? (
            <div className="motion-grid">
              {MOTION_TYPES.map((m) => {
                const applied = appliedMotions.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`fx-btn fx-btn--sm motion-btn ${applied ? 'is-applied' : ''}`}
                    disabled={busy || applied}
                    title={motionMeta[m].hint}
                    onClick={() => onApplyMotion(assetPath, m)}
                  >
                    {motionMeta[m].label}
                    {applied ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          ) : (
            <small className="downstream-hint">先完成绑骨，再选择动作（int 9–16，8 个固定动作）。</small>
          )}
        </div>
      </div>

      {/* Optional side-branch: low_poly (new derived asset, textures not kept) */}
      <div className="downstream-aside">
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={busy}
          title="可选：减面重拓扑，产出新的低模资产（高模保留，贴图不保留）"
          onClick={() => onRetopoLowpoly(assetPath)}
        >
          <LowpolyIcon size={14} /> 低模重拓扑（可选旁路）
        </button>
      </div>
    </section>
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
      <span>{file ? `${(file.bytes / 1024).toFixed(0)} KB` : 'no preview'}</span>
    </div>
  );
}
