import { useMemo, useState } from 'react';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { providerParamSpec } from '@shared/provider-params';
import { callTool } from '@/lib/toolClient';
import { StepCard } from '@/components/StepCard';
import { PRIMARY_MODES, primaryModeMeta } from '@/ui-meta';
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
  const [modelType, setModelType] = useState<'lowpoly' | 'standard'>('lowpoly');
  const [targetPolycount, setTargetPolycount] = useState(6000);
  const [enablePbr, setEnablePbr] = useState(true);
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

  const isStandard = modelType === 'standard';

  const providerLine = (() => {
    if (!status) return '检测中…';
    if (!status.realProvidersEnabled) return 'Mock 模式（未启用真实调用，不消耗额度）';
    if (!status.meshyConfigured) return 'Mock 模式（缺少 MESHY_API_KEY）';
    const bal = status.balance == null ? '' : ` · 余额 ${status.balance}`;
    return `真实 Meshy 调用已启用${bal}`;
  })();
  const providerReal = !!status?.realProvidersEnabled && !!status?.meshyConfigured;

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
      setNote('图片已上传，可访问 URL 已填入。');
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
      modelType,
      targetPolycount: isStandard ? targetPolycount : undefined,
      enablePbr,
      providerParams,
    };
    if (mode === 'text') {
      if (!prompt.trim()) {
        setError('请填写描述提示词。');
        return null;
      }
      return { tool: primaryModeMeta.text.toolId, args: { prompt: prompt.trim(), ...shared } };
    }
    if (mode === 'image') {
      if (!imageUrl.trim()) {
        setError('请填写参考图 URL，或上传本地图。');
        return null;
      }
      return { tool: primaryModeMeta.image.toolId, args: { imageUrl: imageUrl.trim(), ...shared } };
    }
    const urls = viewUrls.map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      setError('请至少填写一张视角图 URL。');
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
    setNote(`${cacheHit ? '命中缓存' : '生成完成'}${usedMock ? '（mock）' : ''}：${manifest.assetPath}`);
    onGenerated(manifest);
  };

  return (
    <div className="aa-sidebar">
      <div className={`aa-provider ${providerReal ? 'is-real' : 'is-mock'}`}>
        <span className="aa-provider-dot" />
        <span className="aa-provider-text">{providerLine}</span>
        <button type="button" className="aa-btn aa-btn--ghost aa-provider-cfg" onClick={onOpenCredentials}>
          凭证
        </button>
      </div>

      <StepCard title="生成方式" icon="✨">
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
                <span className="aa-mode-label">{meta.label}</span>
              </button>
            );
          })}
        </div>
        <p className="aa-card-hint">{primaryModeMeta[mode].hint}</p>

        {mode === 'text' && (
          <label className="aa-field">
            <span className="aa-field-label">描述</span>
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
              <span className="aa-field-label">参考图 URL</span>
              <input
                type="text"
                value={imageUrl}
                placeholder="https://… 或上传本地图"
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
              <span>{uploading ? '上传中…' : '上传本地图'}</span>
            </label>
          </div>
        )}

        {mode === 'views' && (
          <div className="aa-views">
            {viewUrls.map((u, i) => (
              <div className="aa-field-group" key={i}>
                <label className="aa-field">
                  <span className="aa-field-label">视角 {i + 1}</span>
                  <input
                    type="text"
                    value={u}
                    placeholder={i === 0 ? '至少一张' : '可选'}
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
                  <span>{uploading ? '…' : '上传'}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard title="输出设置" icon="⚙️">
        <label className="aa-field">
          <span className="aa-field-label">资产名（可选）</span>
          <input
            type="text"
            value={assetName}
            placeholder="留空则用提示词/默认名"
            onChange={(e) => setAssetName(e.target.value)}
          />
        </label>

        <label className="aa-field">
          <span className="aa-field-label">网格类型</span>
          <select value={modelType} onChange={(e) => setModelType(e.target.value as 'lowpoly' | 'standard')}>
            <option value="lowpoly">低面数（小物件直出）</option>
            <option value="standard">标准</option>
          </select>
        </label>

        {isStandard && (
          <label className="aa-field">
            <span className="aa-field-label">目标面数：{targetPolycount.toLocaleString()}</span>
            <input
              type="range"
              min={300}
              max={50000}
              step={100}
              value={targetPolycount}
              onChange={(e) => setTargetPolycount(Number(e.target.value))}
            />
          </label>
        )}

        <label className="aa-check">
          <input type="checkbox" checked={enablePbr} onChange={(e) => setEnablePbr(e.target.checked)} />
          <span>生成 PBR 贴图</span>
        </label>

        {advancedFields.length > 0 && (
          <div className="aa-advanced">
            <button type="button" className="aa-link" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? '▾ 高级参数' : '▸ 高级参数'}
            </button>
            {showAdvanced && (
              <div className="aa-advanced-body">
                {isStandard ? null : <p className="aa-hint-small">低面数模式下，模型版本/拓扑会被 Meshy 忽略。</p>}
                {advancedFields.map((f) => (
                  <label className="aa-field" key={f.key}>
                    <span className="aa-field-label">{f.label}</span>
                    <select
                      value={advanced[f.key] ?? ''}
                      onChange={(e) => setAdvanced((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <option value="">默认</option>
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
        title={gameActive ? '' : '未选择游戏'}
      >
        {busy ? '生成中…' : gameActive ? '生成低模' : '未选择游戏'}
      </button>
    </div>
  );
}
