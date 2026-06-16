import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { callTool } from '@/lib/toolClient';
import { scratchPreviewUrl } from '@/lib/blobUrl';
import type { GenProvider, Mode, PoseResult, ProviderStatus } from '@/types';
import type { AssetSlot } from '@shared/manifest';
import { providerParamSpec, type ParamField } from '@shared/provider-params';
import {
  EDITOR_ICON_MAP,
  modeMeta,
  providerMeta,
  ASSET_SLOTS,
  assetSlotMeta,
  POLYCOUNT_TIERS,
  polycountTierMeta,
  tierToFaceCount,
  type PolycountTier,
} from '@/ui-meta';
import { StepCard } from '@/components/StepCard';
import { ImageInputField } from '@/components/ImageInputField';

type StepId = 'provider' | 'input' | 'pose' | 'params';

// Left pane: locked pane header + staged setup (provider → input → optional pose
// → params) + right-aligned Generate action. The tool-arg shapes and the
// pose→generate data flow are preserved exactly from the prior UI; only the
// presentation is restructured into the Workbench staged-sidebar pattern.
export function SetupSidebar({
  status,
  assetCount,
  busy,
  gameActive,
  onGenerate,
}: {
  status: ProviderStatus | null;
  assetCount: number;
  busy: boolean;
  gameActive: boolean;
  onGenerate: (mode: Mode, args: unknown) => void;
}) {
  const [openStep, setOpenStep] = useState<StepId | ''>('input');
  const [provider, setProvider] = useState<GenProvider>('hunyuan_workflow');
  const [assetSlot, setAssetSlot] = useState<AssetSlot>('characters');
  const [assetName, setAssetName] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('stylized low-poly treasure chest with brass trim');
  const [imageUrl, setImageUrl] = useState('');
  const [frontUrl, setFrontUrl] = useState('');
  const [backUrl, setBackUrl] = useState('');
  const [leftUrl, setLeftUrl] = useState('');
  const [rightUrl, setRightUrl] = useState('');
  const [showMoreViews, setShowMoreViews] = useState(false);
  const [enablePbr, setEnablePbr] = useState(true);
  const [polycountTier, setPolycountTier] = useState<PolycountTier>('mid');
  const [poseResult, setPoseResult] = useState<PoseResult | null>(null);

  type ParamValue = string | number | boolean;
  const [providerParams, setProviderParams] = useState<Record<string, ParamValue>>({});
  useEffect(() => setProviderParams({}), [provider]);

  const visibleParamFields: ParamField[] = providerParamSpec[provider].filter(
    (f) => f.verified && f.appliesToModes.includes(mode),
  );

  const usesImageInput = mode === 'image' || mode === 'views';
  const GenerateIcon = EDITOR_ICON_MAP.generate;
  const ParamsIcon = EDITOR_ICON_MAP.params;

  const filledViews = [frontUrl, backUrl, leftUrl, rightUrl].filter((u) => u.trim().length > 0).length;

  const inputSummary =
    mode === 'text'
      ? prompt.trim()
        ? `“${prompt.trim().slice(0, 16)}${prompt.trim().length > 16 ? '…' : ''}”`
        : '未填写描述'
      : mode === 'image'
        ? imageUrl.trim()
          ? '已填图片 URL'
          : '未填图片 URL'
        : `${filledViews} 张视图`;

  const canSubmit =
    !busy &&
    gameActive &&
    (mode === 'text'
      ? prompt.trim().length > 0
      : mode === 'image'
        ? imageUrl.trim().length > 0
        : frontUrl.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    const targetPolycount = tierToFaceCount(provider, polycountTier);
    const common: Record<string, unknown> = { provider, assetSlot, enablePbr, targetPolycount };
    const trimmedName = assetName.trim();
    if (trimmedName) common.assetName = trimmedName;
    if (Object.keys(providerParams).length > 0) common.providerParams = providerParams;
    if (mode === 'text') {
      onGenerate('text', { prompt: prompt.trim(), ...common });
    } else if (mode === 'image') {
      onGenerate('image', { imageUrl: imageUrl.trim(), ...common });
    } else {
      const views: Record<string, string> = { front_image_url: frontUrl.trim() };
      if (backUrl.trim()) views.back_image_url = backUrl.trim();
      if (leftUrl.trim()) views.left_image_url = leftUrl.trim();
      if (rightUrl.trim()) views.right_image_url = rightUrl.trim();
      onGenerate('views', { views, ...common });
    }
  }

  // Pose preprocessing feeds its standardized image into the active input.
  const handleUsePose = (url: string) => {
    if (mode === 'image') setImageUrl(url);
    else if (mode === 'views') setFrontUrl(url);
  };

  const toggle = (id: StepId) => setOpenStep((cur) => (cur === id ? '' : id));

  // Switching to a mode without the optional pose step (text) while that step is
  // open would otherwise leave every card collapsed; reopen the input step.
  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === 'text' && openStep === 'pose') setOpenStep('input');
  };

  return (
    <div className="gx-left">
      <PaneHeader status={status} assetCount={assetCount} />

      <div className="workbench-pane-scroll">
        <div className="gx-setup">
          <ProviderModeChip status={status} />

          <StepCard
            index={1}
            title="供应商"
            summary={providerMeta[provider].label}
            open={openStep === 'provider'}
            onToggle={() => toggle('provider')}
          >
            <div className="fx-segmented" role="tablist" aria-label="Provider">
              {(Object.keys(providerMeta) as GenProvider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={provider === p}
                  className={`fx-segmented-btn ${provider === p ? 'is-selected' : ''}`}
                  onClick={() => setProvider(p)}
                >
                  <span>{providerMeta[p].label}</span>
                </button>
              ))}
            </div>
            <p className="step-note">
              混元走 workflow 命名视图槽；Meshy 文生为白模，需在结果卡片二次加贴图。
            </p>
          </StepCard>

          {usesImageInput && (
            <StepCard
              index={2}
              title="姿态标准化（可选）"
              summary={poseResult ? '已生成标准化图' : '未使用'}
              open={openStep === 'pose'}
              onToggle={() => toggle('pose')}
            >
              <PosePreprocess
                mode={mode}
                result={poseResult}
                onResult={setPoseResult}
                onUse={handleUsePose}
              />
            </StepCard>
          )}

          <StepCard
            index={usesImageInput ? 3 : 2}
            title="输入方式"
            summary={`${modeMeta[mode].label} · ${inputSummary}`}
            open={openStep === 'input'}
            onToggle={() => toggle('input')}
          >
            <div className="fx-segmented" role="tablist" aria-label="生成模式">
              {(Object.keys(modeMeta) as Mode[]).map((m) => {
                const Icon = modeMeta[m].icon;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    className={`fx-segmented-btn ${mode === m ? 'is-selected' : ''}`}
                    onClick={() => changeMode(m)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{modeMeta[m].label}</span>
                  </button>
                );
              })}
            </div>

            <div className="field">
              <span className="field-label">资产类型</span>
              <div className="fx-segmented" role="radiogroup" aria-label="资产类型">
                {ASSET_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={assetSlot === s}
                    className={`fx-segmented-btn ${assetSlot === s ? 'is-selected' : ''}`}
                    onClick={() => setAssetSlot(s)}
                  >
                    <span>{assetSlotMeta[s].label}</span>
                  </button>
                ))}
              </div>
              <p className="step-note">
                角色可后续绑骨 / 加动作；物件为静态道具 / 场景。决定存放槽位，不可在生成后切换。
              </p>
            </div>

            <label className="field">
              <span className="field-label">资产名称（可选）</span>
              <input
                className="fx-input"
                type="text"
                value={assetName}
                placeholder="留空自动命名（如 views-meshy-3）"
                maxLength={60}
                onChange={(e) => setAssetName(e.target.value)}
              />
              <p className="step-note">
                用作文件名与导出 .zip 名（仅保留字母/数字，会转小写）。留空则按 prompt / 模式自动命名。
              </p>
            </label>

            {mode === 'text' && (
              <label className="field">
                <span className="field-label">
                  描述 Prompt <span className="field-count">{prompt.trim().length} 字</span>
                </span>
                <textarea
                  className="fx-textarea fx-textarea--lg"
                  value={prompt}
                  rows={6}
                  placeholder="描述你想生成的角色 / 物件，越具体越好。例：身披红色斗篷的卡通骑士，手持长剑，低多边形风格。"
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
            )}

            {usesImageInput && (
              <p className="step-note">
                可在「角色编辑器」生成三视图 / 立绘后导入，或本地上传图片自动托管。
              </p>
            )}

            {mode === 'image' && (
              <ImageInputField
                label="图片 URL"
                value={imageUrl}
                placeholder="https://…/character.png"
                onChange={setImageUrl}
              />
            )}

            {mode === 'views' && (
              <>
                <ImageInputField
                  label="正视图 URL（必填）"
                  value={frontUrl}
                  placeholder="https://…/front.png"
                  onChange={setFrontUrl}
                />
                <ImageInputField
                  label="背视图 URL（可选）"
                  value={backUrl}
                  placeholder="https://…/back.png"
                  onChange={setBackUrl}
                />
                {showMoreViews ? (
                  <>
                    <ImageInputField
                      label="左视图 URL（可选）"
                      value={leftUrl}
                      placeholder="https://…/left.png"
                      onChange={setLeftUrl}
                    />
                    <ImageInputField
                      label="右视图 URL（可选）"
                      value={rightUrl}
                      placeholder="https://…/right.png"
                      onChange={setRightUrl}
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    className="fx-btn fx-btn--sm"
                    onClick={() => setShowMoreViews(true)}
                  >
                    <Plus size={14} aria-hidden="true" />
                    添加左/右视图
                  </button>
                )}
              </>
            )}
          </StepCard>

          <StepCard
            index={usesImageInput ? 4 : 3}
            title="生成参数"
            summary={`${polycountTierMeta[polycountTier].label}面数 · PBR ${enablePbr ? '开' : '关'}`}
            open={openStep === 'params'}
            onToggle={() => toggle('params')}
          >
            <div className="field">
              <span className="field-label">
                目标面数{' '}
                <span className="field-count">
                  ≈ {tierToFaceCount(provider, polycountTier).toLocaleString()} 面
                </span>
              </span>
              <div className="fx-segmented" role="radiogroup" aria-label="目标面数">
                {POLYCOUNT_TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={polycountTier === t}
                    className={`fx-segmented-btn ${polycountTier === t ? 'is-selected' : ''}`}
                    onClick={() => setPolycountTier(t)}
                  >
                    <span>{polycountTierMeta[t].label}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="fx-check">
              <input type="checkbox" checked={enablePbr} onChange={(e) => setEnablePbr(e.target.checked)} />
              <span>启用 PBR 材质</span>
            </label>
            {visibleParamFields.length > 0 && (
              <details className="adv-params">
                <summary className="adv-params-summary">
                  <ParamsIcon size={13} /> 高级参数（{providerMeta[provider].label} 专属）
                </summary>
                <div className="adv-params-body">
                  {visibleParamFields.map((f) => (
                    <ProviderParamControl
                      key={f.key}
                      field={f}
                      value={providerParams[f.key]}
                      onChange={(v) =>
                        setProviderParams((p) => {
                          const next = { ...p };
                          if (v === undefined) delete next[f.key];
                          else next[f.key] = v;
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
                <p className="step-note">仅在该 provider 真机生成时生效；mock / 未配置时忽略。</p>
              </details>
            )}
            {provider === 'meshy' && mode === 'text' && (
              <p className="step-note">
                Meshy 文生先产出 preview 白模；生成后在结果卡片点「加贴图 (refine)」补纹理。
              </p>
            )}
            <p className="step-note">未配置真实 provider 时自动回退确定性 mock，不消耗配额。</p>
          </StepCard>
        </div>
      </div>

      <div className="gx-action-row">
        {!gameActive && <span className="step-note step-note--warn">未选择游戏，无法生成</span>}
        <button type="button" className="fx-btn fx-btn--primary" disabled={!canSubmit} onClick={submit}>
          <GenerateIcon size={15} aria-hidden="true" />
          {busy ? '生成中…' : '生成 3D'}
        </button>
      </div>
    </div>
  );
}

function ProviderParamControl({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
}) {
  if (field.type === 'bool') {
    return (
      <label className="fx-check">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === 'enum') {
    return (
      <label className="field">
        <span className="field-label">{field.label}</span>
        <select
          className="adv-select"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">（默认）</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help && <span className="step-note">{field.help}</span>}
      </label>
    );
  }
  if (field.type === 'int') {
    return (
      <label className="field">
        <span className="field-label">
          {field.label}
          {field.min !== undefined && field.max !== undefined ? ` (${field.min}–${field.max})` : ''}
        </span>
        <input
          className="fx-input"
          type="number"
          min={field.min}
          max={field.max}
          value={value === undefined ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {field.help && <span className="step-note">{field.help}</span>}
      </label>
    );
  }
  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      <input
        className="fx-input"
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </label>
  );
}

function PaneHeader({ status, assetCount }: { status: ProviderStatus | null; assetCount: number }) {
  const mode = status ? (status.realProvidersEnabled ? 'real' : 'quota-safe') : '…';
  return (
    <header className="workbench-pane-header">
      <span className="workbench-pane-title">3D 角色生成</span>
      <span className="workbench-pane-pill">
        {mode} · {assetCount} assets
      </span>
    </header>
  );
}

function ProviderModeChip({ status }: { status: ProviderStatus | null }) {
  if (!status) {
    const QuotaIcon = EDITOR_ICON_MAP.quota;
    return (
      <div className="status-chip">
        <QuotaIcon size={14} aria-hidden="true" />
        <span>检测供应商状态…</span>
      </div>
    );
  }
  const real = status.realProvidersEnabled;
  const Icon = real ? EDITOR_ICON_MAP.real : EDITOR_ICON_MAP.quota;
  return (
    <div className={`status-chip ${real ? 'status-chip--warn' : 'status-chip--ok'}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{real ? '真实 provider · 消耗配额' : '无配额安全 · mock 回退'}</span>
    </div>
  );
}

// Optional upstream preprocessing for image/views modes: standardize a simple
// cartoon full-body portrait to an A/T-pose via gen3d:pose-standardization,
// then feed the result into the generator input. Real generation must consume
// the provider-hosted sourceUrl (the remote server can fetch it); the local
// same-origin URL is only for in-page preview.
function PosePreprocess({
  mode,
  result,
  onResult,
  onUse,
}: {
  mode: Mode;
  result: PoseResult | null;
  onResult: (r: PoseResult | null) => void;
  onUse: (url: string) => void;
}) {
  const [srcUrl, setSrcUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const ImgIcon = EDITOR_ICON_MAP.image;
  const PoseIcon = EDITOR_ICON_MAP.pose;

  async function standardize() {
    const imageUrl = srcUrl.trim();
    if (!imageUrl) return;
    setBusy(true);
    setError(null);
    const r = await callTool<PoseResult>('gen3d:pose-standardization', { imageUrl });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      onResult(null);
      return;
    }
    onResult(r.result);
  }

  const previewUrl = result ? scratchPreviewUrl(result) : null;
  const feedUrl = result ? (result.sourceUrl ?? result.localUrl ?? previewUrl ?? '') : '';
  const targetLabel = mode === 'image' ? '图生输入' : '正视图输入';

  useEffect(() => setPreviewFailed(false), [previewUrl]);
  const showPreview = previewUrl !== null && !previewFailed;

  return (
    <>
      <p className="step-note">
        把简单卡通全身图标准化为 A/T-pose 再用作生成输入。仅适合简单卡通全身图。
      </p>
      <ImageInputField label="源图 URL" value={srcUrl} placeholder="https://…/character.png" onChange={setSrcUrl} />
      <button
        type="button"
        className="fx-btn fx-btn--sm"
        disabled={busy || srcUrl.trim().length === 0}
        onClick={standardize}
      >
        <PoseIcon size={14} aria-hidden="true" />
        {busy ? '标准化中…' : '标准化姿态'}
      </button>
      {error && <p className="step-note step-note--warn">{error}</p>}
      {result && (
        <div className="pose-result">
          {showPreview ? (
            <img
              className="preview-thumb"
              src={previewUrl}
              alt=""
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="preview-thumb preview-thumb--empty" aria-hidden="true">
              <ImgIcon size={18} />
            </div>
          )}
          <div className="pose-result-meta">
            <span className={`badge ${result.usedMock ? 'badge--mock' : 'badge--real'}`}>
              {result.usedMock ? 'mock' : 'real'}
            </span>
            <button type="button" className="fx-btn fx-btn--sm" onClick={() => onUse(feedUrl)}>
              用作{targetLabel} ↓
            </button>
            {!result.usedMock && !result.sourceUrl && (
              <p className="step-note step-note--warn">
                真实模式但缺 sourceUrl，已回退本地 URL（远端 provider 可能取不到）。
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
