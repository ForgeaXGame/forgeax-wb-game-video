import { useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
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
import { CredentialsModal } from '@/components/CredentialsModal';
import { t } from '@/i18n';

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
  onCredentialsSaved,
}: {
  status: ProviderStatus | null;
  assetCount: number;
  busy: boolean;
  gameActive: boolean;
  onGenerate: (mode: Mode, args: unknown) => void;
  // Refresh provider-status after keys change so the header pill / mode chip
  // re-read real/quota-safe. App passes its refreshStatus here.
  onCredentialsSaved: () => void;
}) {
  const [keysOpen, setKeysOpen] = useState(false);
  const [openStep, setOpenStep] = useState<StepId | ''>('input');
  const [provider, setProvider] = useState<GenProvider>('meshy');
  const [assetSlot, setAssetSlot] = useState<AssetSlot>('characters');
  const [assetName, setAssetName] = useState('');
  const [mode, setMode] = useState<Mode>('views');
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

  // Cross-workbench handoff from wb-character「送去生成 3D 模型」: the Studio host
  // writes the view URLs to a shared same-origin localStorage key (see
  // StandalonePluginIframe.doNavigate) then flips to this workbench. Prefill the
  // views-mode inputs from it. We read on mount (fresh iframe — value already
  // written) AND on the 'storage' event (keep-alive iframe already mounted; the
  // parent's write fires storage in this same-origin child document). Only
  // consume payloads addressed to us so a wb-anim handoff isn't swallowed.
  useEffect(() => {
    const HANDOFF_KEY = 'forgeax:anim-handoff';
    const SELF_PLUGIN_ID = '@forgeax-extension/wb-gen3d';
    function applyHandoff() {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(HANDOFF_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      let data: {
        targetPluginId?: string;
        views?: { front?: string; back?: string; left?: string; right?: string };
        name?: string;
      } | null = null;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (!data || data.targetPluginId !== SELF_PLUGIN_ID) return;
      const views = data.views;
      if (!views || !views.front) return;
      setMode('views');
      setAssetSlot('characters');
      setFrontUrl(views.front);
      setBackUrl(views.back ?? '');
      setLeftUrl(views.left ?? '');
      setRightUrl(views.right ?? '');
      if (views.left || views.right) setShowMoreViews(true);
      if (data.name) setAssetName(data.name.slice(0, 60));
      setOpenStep('input');
      try {
        window.localStorage.removeItem(HANDOFF_KEY);
      } catch {
        /* best-effort: stale key just means a no-op re-apply on next mount */
      }
    }
    applyHandoff();
    const onStorage = (e: StorageEvent) => {
      if (e.key === HANDOFF_KEY && e.newValue) applyHandoff();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
        ? t('setup.summary.prompt', {
            text: prompt.trim().slice(0, 16) + (prompt.trim().length > 16 ? '…' : ''),
          })
        : t('setup.summary.noPrompt')
      : mode === 'image'
        ? imageUrl.trim()
          ? t('setup.summary.imageUrl')
          : t('setup.summary.noImageUrl')
        : t('setup.summary.views', { n: filledViews });

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
      <PaneHeader status={status} assetCount={assetCount} onConfigureKeys={() => setKeysOpen(true)} />

      <div className="workbench-pane-scroll">
        <div className="gx-setup">
          <ProviderModeChip status={status} onConfigureKeys={() => setKeysOpen(true)} />

          <StepCard
            index={1}
            title={t('setup.provider.title')}
            summary={t(providerMeta[provider].label)}
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
                  <span>{t(providerMeta[p].label)}</span>
                </button>
              ))}
            </div>
            <p className="step-note">{t('setup.provider.hint')}</p>
          </StepCard>

          {usesImageInput && (
            <StepCard
              index={2}
              title={t('setup.pose.title')}
              summary={poseResult ? t('setup.pose.summary.done') : t('setup.pose.summary.idle')}
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
            title={t('setup.input.title')}
            summary={`${t(modeMeta[mode].label)} · ${inputSummary}`}
            open={openStep === 'input'}
            onToggle={() => toggle('input')}
          >
            <div className="fx-segmented" role="tablist" aria-label={t('setup.input.aria.mode')}>
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
                    <span>{t(modeMeta[m].label)}</span>
                  </button>
                );
              })}
            </div>

            <div className="field">
              <span className="field-label">{t('setup.assetType.label')}</span>
              <div className="fx-segmented" role="radiogroup" aria-label={t('setup.assetType.aria')}>
                {ASSET_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={assetSlot === s}
                    className={`fx-segmented-btn ${assetSlot === s ? 'is-selected' : ''}`}
                    onClick={() => setAssetSlot(s)}
                  >
                    <span>{t(assetSlotMeta[s].label)}</span>
                  </button>
                ))}
              </div>
              <p className="step-note">{t('setup.assetType.hint')}</p>
            </div>

            <label className="field">
              <span className="field-label">{t('setup.assetName.label')}</span>
              <input
                className="fx-input"
                type="text"
                value={assetName}
                placeholder={t('setup.assetName.placeholder')}
                maxLength={60}
                onChange={(e) => setAssetName(e.target.value)}
              />
              <p className="step-note">{t('setup.assetName.hint')}</p>
            </label>

            {mode === 'text' && (
              <label className="field">
                <span className="field-label">
                  {t('setup.prompt.label')} <span className="field-count">{t('setup.prompt.count', { n: prompt.trim().length })}</span>
                </span>
                <textarea
                  className="fx-textarea fx-textarea--lg"
                  value={prompt}
                  rows={6}
                  placeholder={t('setup.prompt.placeholder')}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
            )}

            {usesImageInput && (
              <p className="step-note">{t('setup.input.hint.views')}</p>
            )}

            {mode === 'image' && (
              <ImageInputField
                label={t('setup.input.imageUrl')}
                value={imageUrl}
                placeholder="https://…/character.png"
                onChange={setImageUrl}
              />
            )}

            {mode === 'views' && (
              <>
                <ImageInputField
                  label={t('setup.input.frontUrl')}
                  value={frontUrl}
                  placeholder="https://…/front.png"
                  onChange={setFrontUrl}
                />
                <ImageInputField
                  label={t('setup.input.backUrl')}
                  value={backUrl}
                  placeholder="https://…/back.png"
                  onChange={setBackUrl}
                />
                {showMoreViews ? (
                  <>
                    <ImageInputField
                      label={t('setup.input.leftUrl')}
                      value={leftUrl}
                      placeholder="https://…/left.png"
                      onChange={setLeftUrl}
                    />
                    <ImageInputField
                      label={t('setup.input.rightUrl')}
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
                    {t('setup.input.addMoreViews')}
                  </button>
                )}
              </>
            )}
          </StepCard>

          <StepCard
            index={usesImageInput ? 4 : 3}
            title={t('setup.params.title')}
            summary={t('setup.params.summary', {
              tier: t(polycountTierMeta[polycountTier].label),
              pbr: enablePbr ? t('common.on') : t('common.off'),
            })}
            open={openStep === 'params'}
            onToggle={() => toggle('params')}
          >
            <div className="field">
              <span className="field-label">
                {t('setup.polycount.label')}{' '}
                <span className="field-count">
                  {t('setup.polycount.approx', { n: tierToFaceCount(provider, polycountTier).toLocaleString() })}
                </span>
              </span>
              <div className="fx-segmented" role="radiogroup" aria-label={t('setup.polycount.aria')}>
                {POLYCOUNT_TIERS.map((tt) => (
                  <button
                    key={tt}
                    type="button"
                    role="radio"
                    aria-checked={polycountTier === tt}
                    className={`fx-segmented-btn ${polycountTier === tt ? 'is-selected' : ''}`}
                    onClick={() => setPolycountTier(tt)}
                  >
                    <span>{t(polycountTierMeta[tt].label)}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="fx-check">
              <input type="checkbox" checked={enablePbr} onChange={(e) => setEnablePbr(e.target.checked)} />
              <span>{t('setup.pbr.label')}</span>
            </label>
            {visibleParamFields.length > 0 && (
              <details className="adv-params">
                <summary className="adv-params-summary">
                  <ParamsIcon size={13} /> {t('setup.advParams.summary', { provider: t(providerMeta[provider].label) })}
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
                <p className="step-note">{t('setup.advParams.hint')}</p>
              </details>
            )}
            {provider === 'meshy' && mode === 'text' && (
              <p className="step-note">{t('setup.params.meshyHint')}</p>
            )}
            <p className="step-note">{t('setup.params.mockFallback')}</p>
          </StepCard>
        </div>
      </div>

      <div className="gx-action-row">
        {!gameActive && <span className="step-note step-note--warn">{t('setup.action.noGame')}</span>}
        <button type="button" className="fx-btn fx-btn--primary" disabled={!canSubmit} onClick={submit}>
          <GenerateIcon size={15} aria-hidden="true" />
          {busy ? t('setup.action.busy') : t('setup.action.generate')}
        </button>
      </div>

      <CredentialsModal open={keysOpen} onClose={() => setKeysOpen(false)} onSaved={onCredentialsSaved} />
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
          <option value="">{t('setup.advParams.enumDefault')}</option>
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

// The status pill doubles as the entry point to the credentials modal (clicking
// it opens the in-UI key config that replaces hand-editing the plugin .env).
function PaneHeader({
  status,
  assetCount,
  onConfigureKeys,
}: {
  status: ProviderStatus | null;
  assetCount: number;
  onConfigureKeys: () => void;
}) {
  const mode = status ? (status.realProvidersEnabled ? 'real' : 'quota-safe') : '…';
  return (
    <header className="workbench-pane-header">
      <span className="workbench-pane-title">{t('setup.header.title')}</span>
      <button
        type="button"
        className="workbench-pane-pill"
        onClick={onConfigureKeys}
        title={t('setup.header.pillTitle')}
      >
        <KeyRound size={11} aria-hidden="true" />
        <span>
          {mode} · {assetCount} assets
        </span>
      </button>
    </header>
  );
}

// Secondary entry point: the provider-mode chip is also clickable → opens the
// same credentials modal, since "configure keys" is the natural next action.
function ProviderModeChip({ status, onConfigureKeys }: { status: ProviderStatus | null; onConfigureKeys: () => void }) {
  if (!status) {
    const QuotaIcon = EDITOR_ICON_MAP.quota;
    return (
      <button type="button" className="status-chip" onClick={onConfigureKeys} title={t('setup.chip.title')}>
        <QuotaIcon size={14} aria-hidden="true" />
        <span>{t('setup.chip.detecting')}</span>
        <KeyRound size={13} aria-hidden="true" className="status-chip-key" />
      </button>
    );
  }
  const real = status.realProvidersEnabled;
  const Icon = real ? EDITOR_ICON_MAP.real : EDITOR_ICON_MAP.quota;
  return (
    <button
      type="button"
      className={`status-chip ${real ? 'status-chip--warn' : 'status-chip--ok'}`}
      onClick={onConfigureKeys}
      title={t('setup.chip.title')}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{real ? t('setup.chip.real') : t('setup.chip.mock')}</span>
      <KeyRound size={13} aria-hidden="true" className="status-chip-key" />
    </button>
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
  const targetLabel = mode === 'image' ? t('setup.pose.target.image') : t('setup.pose.target.front');

  useEffect(() => setPreviewFailed(false), [previewUrl]);
  const showPreview = previewUrl !== null && !previewFailed;

  return (
    <>
      <p className="step-note">{t('setup.pose.hint')}</p>
      <ImageInputField label={t('setup.pose.srcLabel')} value={srcUrl} placeholder="https://…/character.png" onChange={setSrcUrl} />
      <button
        type="button"
        className="fx-btn fx-btn--sm"
        disabled={busy || srcUrl.trim().length === 0}
        onClick={standardize}
      >
        <PoseIcon size={14} aria-hidden="true" />
        {busy ? t('setup.pose.busy') : t('setup.pose.btn')}
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
              {t('setup.pose.useAs', { target: targetLabel })}
            </button>
            {!result.usedMock && !result.sourceUrl && (
              <p className="step-note step-note--warn">{t('setup.pose.fallbackWarn')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
