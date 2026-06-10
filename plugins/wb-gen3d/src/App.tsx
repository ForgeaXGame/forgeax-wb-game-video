import { useState } from 'react';
import { Activity, Ban, Box, Boxes, Gauge, ListFilter, ShieldCheck } from 'lucide-react';
import {
  CAPABILITIES,
  generateMeshyTextMockResult,
  type Exposure,
  type MeshyTextMockArgs,
  type ProviderCapability,
  type ProviderResult,
  type PromptCategory,
} from '@shared/catalog';
import { computeReadiness, type FileRole } from '@shared/manifest';

interface AppProps {
  pane: 'left' | 'center' | 'standalone';
}

const exposureLabels: Record<Exposure, string> = {
  planned: 'Planned',
  'mock-first': 'Mock first',
  experimental: 'Experimental',
  hidden: 'Hidden',
  blocked: 'Blocked',
};

const exposureOrder: Record<Exposure, number> = {
  'mock-first': 0,
  planned: 1,
  experimental: 2,
  hidden: 3,
  blocked: 4,
};

const sortedCapabilities = [...CAPABILITIES].sort((a, b) => {
  const exposureDiff = exposureOrder[a.exposure] - exposureOrder[b.exposure];
  if (exposureDiff !== 0) return exposureDiff;
  return `${a.providerName}${a.capability}`.localeCompare(`${b.providerName}${b.capability}`);
});

const providerCounts = CAPABILITIES.reduce<Record<string, number>>((acc, item) => {
  acc[item.providerName] = (acc[item.providerName] ?? 0) + 1;
  return acc;
}, {});

// Frontend-only manifest preview. The pure mock produces the same file roles a
// real generation would; durable persistence (blobs + manifest.json) happens in
// the backend tool gen3d:generate-meshy-text-mock, not here.
interface AssetPreview {
  cacheKey: string;
  provider: string;
  mode: string;
  prompt: string | null;
  files: { role: FileRole; format: string }[];
  readinessLabel: string;
}

function toPreview(args: MeshyTextMockArgs): AssetPreview {
  const { cacheKey, result } = generateMeshyTextMockResult(args);
  return summarize(cacheKey, result);
}

function summarize(cacheKey: string, result: ProviderResult): AssetPreview {
  const readiness = computeReadiness(
    result.files.map((file) => ({
      fileId: '',
      role: file.role,
      format: file.format,
      storageKey: '',
      bytes: file.data.byteLength,
      sha256: '',
      localUrl: null,
      hasSkeleton: false,
      skeletonProfile: 'unknown' as const,
      animationInputReady: false,
    })),
  );
  const readinessLabel = [
    readiness.hasSourceMesh ? 'mesh' : null,
    readiness.rigged ? 'rigged' : null,
    readiness.animated ? 'animated' : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'pending';
  return {
    cacheKey,
    provider: result.provider,
    mode: result.mode,
    prompt: result.prompt,
    files: result.files.map((file) => ({ role: file.role, format: file.format })),
    readinessLabel,
  };
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">{children}</div>;
}

export function App({ pane }: AppProps) {
  const [previews, setPreviews] = useState<AssetPreview[]>([]);

  function handleGenerate(args: MeshyTextMockArgs) {
    const preview = toPreview(args);
    setPreviews((current) => [
      preview,
      ...current.filter((item) => item.cacheKey !== preview.cacheKey),
    ]);
  }

  return (
    <AppFrame>
      <header className="topbar">
        <div className="brand">
          <Boxes size={18} aria-hidden="true" />
          <span>3D 资产生成</span>
        </div>
        <div className="status-pill">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>M3 manifest contract · no-quota</span>
        </div>
      </header>

      <aside className="left-pane">
        <Sidebar onGenerate={handleGenerate} />
      </aside>

      <main className="center-pane">
        <Dashboard pane={pane} previews={previews} />
      </main>

      <aside className="right-pane">
        <ContractPanel />
      </aside>

      <footer className="footer">global asset library · durable manifest contract · no provider calls</footer>
    </AppFrame>
  );
}

function Sidebar({ onGenerate }: { onGenerate: (args: MeshyTextMockArgs) => void }) {
  const [prompt, setPrompt] = useState('stylized low-poly treasure chest with brass trim');
  const [promptCategory, setPromptCategory] = useState<PromptCategory>('prop');
  const [enablePbr, setEnablePbr] = useState(true);
  const [targetPolycount, setTargetPolycount] = useState(30000);

  function submitMock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate({ prompt, promptCategory, enablePbr, targetPolycount });
  }

  return (
    <div className="stack">
      <section className="panel compact">
        <div className="panel-title">
          <Box size={15} aria-hidden="true" />
          <span>Generate (mock)</span>
        </div>
        <form className="mock-form" onSubmit={submitMock}>
          <label>
            <span>Prompt</span>
            <textarea value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <label>
            <span>Category</span>
            <select
              value={promptCategory}
              onChange={(event) => setPromptCategory(event.target.value as PromptCategory)}
            >
              <option value="character">character</option>
              <option value="prop">prop</option>
              <option value="scene">scene</option>
            </select>
          </label>
          <label>
            <span>Target polycount</span>
            <input
              type="number"
              min={1000}
              max={300000}
              step={1000}
              value={targetPolycount}
              onChange={(event) => setTargetPolycount(Number(event.target.value))}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={enablePbr}
              onChange={(event) => setEnablePbr(event.target.checked)}
            />
            <span>PBR</span>
          </label>
          <button type="submit" disabled={!prompt.trim()}>
            <Box size={14} aria-hidden="true" />
            Preview manifest
          </button>
        </form>
      </section>

      <section className="panel compact">
        <div className="panel-title">
          <Gauge size={15} aria-hidden="true" />
          <span>Provider Scope</span>
        </div>
        <div className="provider-list">
          {Object.entries(providerCounts).map(([provider, count]) => (
            <div className="provider-row" key={provider}>
              <span>{provider}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel compact">
        <div className="panel-title">
          <ListFilter size={15} aria-hidden="true" />
          <span>Exposure Gates</span>
        </div>
        <div className="gate-list">
          <Gate label="Mock first" count={countExposure('mock-first')} />
          <Gate label="Planned" count={countExposure('planned')} />
          <Gate label="Experimental" count={countExposure('experimental')} muted />
          <Gate label="Hidden" count={countExposure('hidden')} muted />
          <Gate label="Blocked" count={countExposure('blocked')} blocked />
        </div>
      </section>

      <section className="panel compact">
        <div className="panel-title">
          <Ban size={15} aria-hidden="true" />
          <span>Blocked</span>
        </div>
        <p className="small-copy">motion_retarget_v2 remains hidden until literal motion types are proven.</p>
      </section>
    </div>
  );
}

function Dashboard({ pane, previews }: { pane: AppProps['pane']; previews: readonly AssetPreview[] }) {
  return (
    <div className="dashboard" data-current-pane={pane}>
      <section className="hero-band">
        <div>
          <p className="eyebrow">Hunyuan3D / Meshy</p>
          <h1>3D asset generation</h1>
        </div>
        <div className="hero-stats" aria-label="M3 workbench status">
          <Stat label="Capabilities" value={CAPABILITIES.length} />
          <Stat label="Manifest previews" value={previews.length} />
          <Stat label="Remote calls" value={0} />
        </div>
      </section>

      <section className="grid-two">
        <CapabilityTable items={sortedCapabilities} />
        <AssetList previews={previews} />
      </section>
    </div>
  );
}

function CapabilityTable({ items }: { items: readonly ProviderCapability[] }) {
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <Activity size={15} aria-hidden="true" />
        <span>Capability Matrix</span>
      </div>
      <div className="capability-table" role="table" aria-label="Provider capability matrix">
        <div className="table-head" role="row">
          <span role="columnheader">Provider</span>
          <span role="columnheader">Capability</span>
          <span role="columnheader">Exposure</span>
        </div>
        {items.map((item) => (
          <div className="table-row" role="row" key={`${item.providerId}-${item.capability}`}>
            <span role="cell" className="provider-cell">{item.providerName}</span>
            <span role="cell">
              <strong>{item.capability}</strong>
              <small>{item.sourceStatus}</small>
            </span>
            <span role="cell">
              <ExposureBadge exposure={item.exposure} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssetList({ previews }: { previews: readonly AssetPreview[] }) {
  return (
    <section className="panel results-panel">
      <div className="panel-title">
        <Boxes size={15} aria-hidden="true" />
        <span>Manifest Preview</span>
      </div>
      <div className="result-list">
        {previews.length === 0 ? (
          <p className="small-copy">Preview a mock generation to see its durable manifest shape.</p>
        ) : (
          previews.map((preview) => (
            <article className="result-card" key={preview.cacheKey}>
              <div className="result-card-head">
                <div>
                  <strong>{preview.provider}</strong>
                  <span>{preview.mode}</span>
                </div>
                <span className="mock-badge">mock</span>
              </div>
              <p>{preview.prompt}</p>
              <dl>
                <div>
                  <dt>Files</dt>
                  <dd>{preview.files.map((file) => `${file.role}.${file.format}`).join(', ')}</dd>
                </div>
                <div>
                  <dt>Readiness</dt>
                  <dd>{preview.readinessLabel}</dd>
                </div>
                <div>
                  <dt>Cache key</dt>
                  <dd>{preview.cacheKey}</dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ContractPanel() {
  return (
    <section className="panel compact rubric-panel">
      <div className="panel-title">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>File Roles</span>
      </div>
      <div className="rubric-list">
        <span>source_mesh</span>
        <span>preview_image</span>
        <span>texture</span>
        <span>rigged_model</span>
        <span>animation_clip</span>
        <span>animated_model</span>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Gate({ label, count, muted, blocked }: { label: string; count: number; muted?: boolean; blocked?: boolean }) {
  return (
    <div className={`gate ${muted ? 'muted' : ''} ${blocked ? 'blocked' : ''}`}>
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function ExposureBadge({ exposure }: { exposure: Exposure }) {
  return <span className={`exposure exposure-${exposure}`}>{exposureLabels[exposure]}</span>;
}

function countExposure(exposure: Exposure) {
  return CAPABILITIES.filter((item) => item.exposure === exposure).length;
}
