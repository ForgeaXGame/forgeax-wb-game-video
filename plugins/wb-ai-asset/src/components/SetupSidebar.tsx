import { useMemo, useState } from 'react';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { providerParamSpec } from '@shared/provider-params';
import { callTool } from '@/lib/toolClient';
import { StepCard } from '@/components/StepCard';
import { PRIMARY_MODES, primaryModeMeta } from '@/ui-meta';
import { t } from '@/i18n';
import type { GenerateResult, ProviderStatus, PrimaryMode, UploadImageResult } from '@/types';

// Advanced Meshy params shown under "高级"; model_type is promoted to its own
// top-level control (the plugin's core knob) so it is excluded here.
const ADVANCED_KEYS = ['ai_model', 'topology', 'symmetry_mode'] as const;

async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function SetupSidebar({
  status,
  gameActive,
  onGenerated,
  onOpenCredentials,
}: {
  status: ProviderStatus | null;
  gameActive: boolean;
  onGenerated: (m: Gen3DAssetManifest) => void;
  onOpenCredentials: () => void;
}) {
  const [mode, setMode] = useState<PrimaryMode>('text');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [viewUrls, setViewUrls] = useState<string[]>(['', '', '', '']);
  const [assetName, setAssetName] = useState('');
  const [targetPolycount, setTargetPolycount] = useState(1500);
  const [enablePbr, setEnablePbr] = useState(true);
  const [rawMode, setRawMode] = useState(false);
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const advancedFields = useMemo(
    () =>
      providerParamSpec.meshy.filter(
        (f) => ADVANCED_KEYS.includes(f.key as (typeof ADVANCED_KEYS)[number]) && f.appliesToModes.includes(mode),
      ),
    [mode],
  );

  const providerLine = (() => {
    if (!status) return t('status.detecting');
    if (!status.realProvidersEnabled) return t('status.mockDisabled');
    if (!status.litellmConfigured) return t('status.mockNoGateway');
    const bal = status.balance == null ? '' : t('status.balance', { n: status.balance });
    return t('status.realEnabled', { balance: bal });
  })();
  const providerReal = !!status?.realProvidersEnabled && !!status?.litellmConfigured;

  const uploadLocalImage = async (file: File, apply: (url: string) => void) => {
    setUploading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const r = await callTool<UploadImageResult>('aiasset:upload-image', { base64, mimetype: file.type });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      apply(r.result.url);
      setNote(t('note.uploaded'));
    } finally {
      setUploading(false);
    }
  };

  const buildArgs = (): { tool: string; args: Record<string, unknown> } | null => {
    const providerParams: Record<string, string> = {};
    for (const f of advancedFields) {
      const v = advanced[f.key];
      if (v) providerParams[f.key] = v;
    }
    const shared = {
      assetName: assetName.trim() || undefined,
      pipeline: rawMode ? 'raw' : 'precise-lowpoly',
      modelType: rawMode ? 'standard' : undefined,
      targetPolycount,
      enablePbr,
      providerParams,
    };
    if (mode === 'text') {
      if (!prompt.trim()) {
        setError(t('error.needPrompt'));
        return null;
      }
      return { tool: primaryModeMeta.text.toolId, args: { prompt: prompt.trim(), ...shared } };
    }
    if (mode === 'image') {
      if (!imageUrl.trim()) {
        setError(t('error.needImageUrl'));
        return null;
      }
      return { tool: primaryModeMeta.image.toolId, args: { imageUrl: imageUrl.trim(), ...shared } };
    }
    const urls = viewUrls.map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      setError(t('error.needViewUrl'));
      return null;
    }
    return { tool: primaryModeMeta.views.toolId, args: { imageUrls: urls, ...shared } };
  };

  const generate = async () => {
    setError(null);
    setNote(null);
    const built = buildArgs();
    if (!built) return;
    setBusy(true);
    const r = await callTool<GenerateResult>(built.tool, built.args);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const { manifest, usedMock, cacheHit } = r.result;
    setNote(
      t('note.result', {
        state: cacheHit ? t('note.cacheHit') : t('note.generated'),
        mock: usedMock ? t('note.mockTag') : '',
        path: manifest.assetPath,
      }),
    );
    onGenerated(manifest);
  };

  return (
    <div className="aa-sidebar">
      <div className={`aa-provider ${providerReal ? 'is-real' : 'is-mock'}`}>
        <span className="aa-provider-dot" />
        <span className="aa-provider-text">{providerLine}</span>
        <button type="button" className="aa-btn aa-btn--ghost aa-provider-cfg" onClick={onOpenCredentials}>
          {t('label.credentials')}
        </button>
      </div>

      <StepCard title={t('label.generateMode')} icon="✨">
        <div className="aa-modes">
          {PRIMARY_MODES.map((m) => {
            const meta = primaryModeMeta[m];
            return (
              <button
                key={m}
                type="button"
                className={`aa-mode ${mode === m ? 'is-on' : ''}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                <span className="aa-mode-icon">{meta.icon}</span>
                <span className="aa-mode-label">{t(meta.label)}</span>
              </button>
            );
          })}
        </div>
        <p className="aa-card-hint">{t(primaryModeMeta[mode].hint)}</p>
        <p className="aa-hint-small">{t('hint.meshyTip')}</p>

        {mode === 'text' && (
          <label className="aa-field">
            <span className="aa-field-label">{t('label.description')}</span>
            <textarea
              rows={3}
              value={prompt}
              placeholder="a small wooden barrel, game prop"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
        )}

        {mode === 'image' && (
          <div className="aa-field-group">
            <label className="aa-field">
              <span className="aa-field-label">{t('label.refImageUrl')}</span>
              <input
                type="text"
                value={imageUrl}
                placeholder={t('placeholder.refImage')}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </label>
            <label className="aa-upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLocalImage(f, setImageUrl);
                  e.target.value = '';
                }}
              />
              <span>{uploading ? t('btn.uploading') : t('btn.uploadLocal')}</span>
            </label>
          </div>
        )}

        {mode === 'views' && (
          <div className="aa-views">
            {viewUrls.map((u, i) => (
              <div className="aa-field-group" key={i}>
                <label className="aa-field">
                  <span className="aa-field-label">{t('label.viewN', { n: i + 1 })}</span>
                  <input
                    type="text"
                    value={u}
                    placeholder={i === 0 ? t('placeholder.viewFirst') : t('placeholder.viewOptional')}
                    onChange={(e) =>
                      setViewUrls((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                    }
                  />
                </label>
                <label className="aa-upload aa-upload--mini">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLocalImage(f, (url) => setViewUrls((prev) => prev.map((p, j) => (j === i ? url : p))));
                      e.target.value = '';
                    }}
                  />
                  <span>{uploading ? '…' : t('btn.upload')}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard title={t('label.outputSettings')} icon="⚙️">
        <label className="aa-field">
          <span className="aa-field-label">{t('label.assetName')}</span>
          <input
            type="text"
            value={assetName}
            placeholder={t('placeholder.assetName')}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </label>

        <label className="aa-field">
          <span className="aa-field-label">{t('label.targetPolyBudget', { count: targetPolycount.toLocaleString() })}</span>
          <input
            type="range"
            min={500}
            max={2000}
            step={100}
            value={targetPolycount}
            onChange={(e) => setTargetPolycount(Number(e.target.value))}
          />
        </label>

        <label className="aa-check">
          <input type="checkbox" checked={enablePbr} onChange={(e) => setEnablePbr(e.target.checked)} />
          <span>{t('label.generatePbr')}</span>
        </label>

        {advancedFields.length > 0 && (
          <div className="aa-advanced">
            <button type="button" className="aa-link" onClick={() => setShowAdvanced((v) => !v)}>
              {`${showAdvanced ? '▾' : '▸'} ${t('label.advancedParams')}`}
            </button>
            {showAdvanced && (
              <div className="aa-advanced-body">
                <p className="aa-hint-small">{t('hint.advancedExplain')}</p>
                <label className="aa-check">
                  <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)} />
                  <span>{t('hint.rawExplain')}</span>
                </label>
                {advancedFields.map((f) => (
                  <label className="aa-field" key={f.key}>
                    <span className="aa-field-label">{f.label}</span>
                    <select
                      value={advanced[f.key] ?? ''}
                      onChange={(e) => setAdvanced((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <option value="">{t('label.default')}</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </StepCard>

      {error ? <p className="aa-error">{error}</p> : null}
      {note ? <p className="aa-note">{note}</p> : null}

      <button
        type="button"
        className="aa-btn aa-btn--primary aa-generate"
        onClick={generate}
        disabled={busy || !gameActive}
        title={gameActive ? '' : t('btn.noGame')}
      >
        {busy ? t('btn.generating') : gameActive ? t('btn.generate') : t('btn.noGame')}
      </button>
    </div>
  );
}
