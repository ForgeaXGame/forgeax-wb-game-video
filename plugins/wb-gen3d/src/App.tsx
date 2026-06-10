import { useCallback, useEffect, useState } from 'react';
import { Boxes, Image as ImageIcon, Images, RefreshCw, ShieldAlert, ShieldCheck, Type } from 'lucide-react';
import type { Gen3DAssetManifest, ManifestFile } from '@shared/manifest';
import { selectFile } from '@shared/manifest';
import { callTool } from '@/lib/toolClient';
import { blobUrl } from '@/lib/blobUrl';
import { ModelViewer } from '@/components/ModelViewer';

interface AppProps {
  pane: 'left' | 'center' | 'standalone';
}

type Mode = 'text' | 'image' | 'views';

interface ProviderStatus {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
}

interface GenerateResult {
  ok: true;
  cacheKey: string;
  cacheHit: boolean;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

interface ListAssetsResult {
  ok: true;
  assets: Gen3DAssetManifest[];
}

const modeMeta: Record<Mode, { toolId: string; label: string; icon: typeof Type }> = {
  text: { toolId: 'gen3d:text-to-3d', label: '文生 3D', icon: Type },
  image: { toolId: 'gen3d:image-to-3d', label: '图生 3D', icon: ImageIcon },
  views: { toolId: 'gen3d:views-to-3d', label: '多视图生 3D', icon: Images },
};

export function App({ pane }: AppProps) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [assets, setAssets] = useState<Gen3DAssetManifest[]>([]);
  const [latest, setLatest] = useState<GenerateResult | null>(null);
  const [selected, setSelected] = useState<Gen3DAssetManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAssets = useCallback(async () => {
    const r = await callTool<ListAssetsResult>('gen3d:list-assets', {});
    if (r.ok) setAssets(r.result.assets);
  }, []);

  const refreshStatus = useCallback(async () => {
    const r = await callTool<ProviderStatus>('gen3d:provider-status', {});
    if (r.ok) setStatus(r.result);
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshAssets();
  }, [refreshStatus, refreshAssets]);

  const handleGenerate = useCallback(
    async (mode: Mode, args: unknown) => {
      setBusy(true);
      setError(null);
      const { toolId } = modeMeta[mode];
      const r = await callTool<GenerateResult>(toolId, args);
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLatest(r.result);
      setSelected(null);
      void refreshAssets();
    },
    [refreshAssets],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Boxes size={18} aria-hidden="true" />
          <span>3D 资产生成</span>
        </div>
        <StatusPill status={status} />
      </header>

      <aside className="left-pane">
        <GeneratePanel busy={busy} onGenerate={handleGenerate} />
      </aside>

      <main className="center-pane">
        <ResultArea latest={latest} selected={selected} error={error} />
      </main>

      <aside className="right-pane">
        <AssetLibrary assets={assets} selectedId={selected?.assetId ?? null} onRefresh={refreshAssets} onSelect={setSelected} />
      </aside>

      <footer className="footer">
        global asset library · {assets.length} assets · {status?.realProvidersEnabled ? 'real provider configured' : 'quota-safe mock'}
      </footer>
    </div>
  );
}

function StatusPill({ status }: { status: ProviderStatus | null }) {
  if (!status) {
    return (
      <div className="status-pill">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>checking provider…</span>
      </div>
    );
  }
  const real = status.realProvidersEnabled;
  return (
    <div className={`status-pill ${real ? 'status-real' : ''}`}>
      {real ? <ShieldAlert size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
      <span>{real ? 'real provider · consumes quota' : 'quota-safe · mock fallback'}</span>
    </div>
  );
}

function GeneratePanel({
  busy,
  onGenerate,
}: {
  busy: boolean;
  onGenerate: (mode: Mode, args: unknown) => void;
}) {
  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('stylized low-poly treasure chest with brass trim');
  const [imageUrl, setImageUrl] = useState('');
  const [frontUrl, setFrontUrl] = useState('');
  const [backUrl, setBackUrl] = useState('');
  const [enablePbr, setEnablePbr] = useState(true);
  const [targetPolycount, setTargetPolycount] = useState(30000);

  const common = { enablePbr, targetPolycount };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'text') {
      onGenerate('text', { prompt: prompt.trim(), ...common });
    } else if (mode === 'image') {
      onGenerate('image', { imageUrl: imageUrl.trim(), ...common });
    } else {
      const views: Record<string, string> = { front_image_url: frontUrl.trim() };
      if (backUrl.trim()) views.back_image_url = backUrl.trim();
      onGenerate('views', { views, ...common });
    }
  }

  const canSubmit =
    !busy &&
    (mode === 'text' ? prompt.trim().length > 0 : mode === 'image' ? imageUrl.trim().length > 0 : frontUrl.trim().length > 0);

  return (
    <div className="stack">
      <section className="panel compact">
        <div className="mode-tabs" role="tablist" aria-label="Generation mode">
          {(Object.keys(modeMeta) as Mode[]).map((m) => {
            const Icon = modeMeta[m].icon;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`mode-tab ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{modeMeta[m].label}</span>
              </button>
            );
          })}
        </div>

        <form className="mock-form" onSubmit={submit}>
          {mode === 'text' && (
            <label>
              <span>Prompt</span>
              <textarea value={prompt} rows={4} onChange={(e) => setPrompt(e.target.value)} />
            </label>
          )}
          {mode === 'image' && (
            <label>
              <span>Image URL</span>
              <input type="url" value={imageUrl} placeholder="https://…/character.png" onChange={(e) => setImageUrl(e.target.value)} />
            </label>
          )}
          {mode === 'views' && (
            <>
              <label>
                <span>Front view URL (required)</span>
                <input type="url" value={frontUrl} placeholder="https://…/front.png" onChange={(e) => setFrontUrl(e.target.value)} />
              </label>
              <label>
                <span>Back view URL (optional)</span>
                <input type="url" value={backUrl} placeholder="https://…/back.png" onChange={(e) => setBackUrl(e.target.value)} />
              </label>
            </>
          )}

          <label>
            <span>Target polycount</span>
            <input
              type="number"
              min={1000}
              max={300000}
              step={1000}
              value={targetPolycount}
              onChange={(e) => setTargetPolycount(Number(e.target.value))}
            />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={enablePbr} onChange={(e) => setEnablePbr(e.target.checked)} />
            <span>PBR</span>
          </label>
          <button type="submit" disabled={!canSubmit}>
            <Boxes size={14} aria-hidden="true" />
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </form>
        <p className="small-copy">
          未配置真实 provider 时自动回退确定性 mock，不消耗配额。生成结果落盘为持久 manifest。
        </p>
      </section>
    </div>
  );
}

function ResultArea({
  latest,
  selected,
  error,
}: {
  latest: GenerateResult | null;
  selected: Gen3DAssetManifest | null;
  error: string | null;
}) {
  return (
    <div className="dashboard">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Hunyuan3D / Meshy</p>
          <h1>3D asset generation</h1>
        </div>
      </section>

      {error && (
        <section className="panel compact error-panel" role="alert">
          <strong>生成失败</strong>
          <p className="small-copy">{error}</p>
        </section>
      )}

      <section className="panel results-panel">
        <div className="panel-title">
          <Boxes size={15} aria-hidden="true" />
          <span>{selected ? 'Library asset' : 'Latest generation'}</span>
        </div>
        {selected ? (
          <article className="result-card">
            <div className="result-card-head">
              <div>
                <strong>{selected.provider}</strong>
                <span>{selected.mode}</span>
              </div>
              <div className="badge-row">
                <span className={`mock-badge ${selected.providerMode === 'real' ? 'real-badge' : ''}`}>
                  {selected.providerMode}
                </span>
              </div>
            </div>
            <ManifestPreview manifest={selected} />
          </article>
        ) : latest ? (
          <ResultCard result={latest} />
        ) : (
          <p className="small-copy">输入 prompt / 图片 / 多视图并点击 Generate，或从右侧资产库选择一个查看模型。</p>
        )}
      </section>
    </div>
  );
}

function ResultCard({ result }: { result: GenerateResult }) {
  const { manifest } = result;
  return (
    <article className="result-card">
      <div className="result-card-head">
        <div>
          <strong>{manifest.provider}</strong>
          <span>{manifest.mode}</span>
        </div>
        <div className="badge-row">
          <span className={`mock-badge ${result.usedMock ? '' : 'real-badge'}`}>
            {result.usedMock ? 'mock' : 'real'}
          </span>
          {result.cacheHit && <span className="cache-badge">cache hit</span>}
        </div>
      </div>
      <ManifestPreview manifest={manifest} />
    </article>
  );
}

// Shared preview body: a three.js GLB viewer (source_mesh) when present, the
// preview_image thumbnail, plus the durable manifest facts. Used for both the
// latest result and a selected library asset.
function ManifestPreview({ manifest }: { manifest: Gen3DAssetManifest }) {
  const meshFile = selectFile(manifest.files, 'source_mesh', 'glb');
  const previewFile = manifest.files.find((f) => f.role === 'preview_image') ?? null;
  const meshUrl = blobUrl(meshFile);

  const readinessLabel =
    [
      manifest.readiness.hasSourceMesh ? 'mesh' : null,
      manifest.readiness.rigged ? 'rigged' : null,
      manifest.readiness.animated ? 'animated' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'pending';

  return (
    <>
      {meshUrl ? (
        <ModelViewer key={meshUrl} url={meshUrl} />
      ) : (
        <div className="model-viewer model-viewer--empty">
          <Boxes size={22} aria-hidden="true" />
          <span>无 GLB 模型</span>
        </div>
      )}
      <div className="result-body">
        <PreviewThumb file={previewFile} />
        <dl>
          <div>
            <dt>Asset id</dt>
            <dd className="mono">{manifest.assetId}</dd>
          </div>
          <div>
            <dt>Files</dt>
            <dd>{manifest.files.map((f) => `${f.role}.${f.format}`).join(', ')}</dd>
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
    </>
  );
}

function PreviewThumb({ file }: { file: ManifestFile | null }) {
  const url = blobUrl(file);
  if (url) {
    return <img className="preview-thumb" src={url} alt="generated preview" />;
  }
  return (
    <div className="preview-thumb preview-thumb--empty" aria-hidden="true">
      <ImageIcon size={20} />
      <span>{file ? `${(file.bytes / 1024).toFixed(0)} KB` : 'no preview'}</span>
    </div>
  );
}

function AssetLibrary({
  assets,
  selectedId,
  onRefresh,
  onSelect,
}: {
  assets: readonly Gen3DAssetManifest[];
  selectedId: string | null;
  onRefresh: () => void;
  onSelect: (asset: Gen3DAssetManifest) => void;
}) {
  return (
    <section className="panel compact library-panel">
      <div className="panel-title library-title">
        <Boxes size={15} aria-hidden="true" />
        <span>Asset library</span>
        <button type="button" className="icon-button" onClick={onRefresh} aria-label="Refresh assets">
          <RefreshCw size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="library-list">
        {assets.length === 0 ? (
          <p className="small-copy">还没有生成的资产。</p>
        ) : (
          assets.map((asset) => (
            <button
              type="button"
              className={`library-row ${selectedId === asset.assetId ? 'selected' : ''}`}
              key={asset.assetId}
              onClick={() => onSelect(asset)}
            >
              <div className="library-row-head">
                <strong>{asset.provider}</strong>
                <span className={`tag tag-${asset.providerMode}`}>{asset.providerMode}</span>
              </div>
              <p className="library-prompt">{asset.prompt ?? asset.mode}</p>
              <small className="mono">{asset.assetId.slice(0, 12)}…</small>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
