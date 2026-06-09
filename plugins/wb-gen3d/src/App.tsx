import { useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  Box,
  FlaskConical,
  Gauge,
  ListFilter,
  ShieldCheck,
} from 'lucide-react';
import {
  CAPABILITIES,
  MOCK_RESULTS,
  QUALITY_RUBRIC,
  generateMeshyTextMock,
  type BenchmarkResultSummary,
  type Exposure,
  type MeshyTextMockArgs,
  type ProviderCapability,
  type PromptCategory,
} from '@shared/catalog';

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

function AppFrame({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">{children}</div>;
}

export function App({ pane }: AppProps) {
  const [generatedResults, setGeneratedResults] = useState<BenchmarkResultSummary[]>([]);
  const results = useMemo(() => [...generatedResults, ...MOCK_RESULTS], [generatedResults]);

  function handleGenerate(args: MeshyTextMockArgs) {
    const generated = generateMeshyTextMock(args).result;
    setGeneratedResults((current) => [generated, ...current.filter((item) => item.id !== generated.id)]);
  }

  return (
    <AppFrame>
      <header className="topbar">
        <div className="brand">
          <FlaskConical size={18} aria-hidden="true" />
          <span>3D 角色生成</span>
        </div>
        <div className="status-pill">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>M1 no-quota shell</span>
        </div>
      </header>

      <aside className="left-pane">
        <Sidebar onGenerate={handleGenerate} />
      </aside>

      <main className="center-pane">
        <Dashboard pane={pane} results={results} />
      </main>

      <aside className="right-pane">
        <RubricPanel />
      </aside>

      <footer className="footer">static capability catalog · no provider calls</footer>
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
          <FlaskConical size={15} aria-hidden="true" />
          <span>Meshy Text Mock</span>
        </div>
        <form className="mock-form" onSubmit={submitMock}>
          <label>
            <span>Prompt</span>
            <textarea
              value={prompt}
              rows={4}
              onChange={(event) => setPrompt(event.target.value)}
            />
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
            <FlaskConical size={14} aria-hidden="true" />
            Generate mock
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

function Dashboard({ pane, results }: { pane: AppProps['pane']; results: readonly BenchmarkResultSummary[] }) {
  return (
    <div className="dashboard" data-current-pane={pane}>
      <section className="hero-band">
        <div>
          <p className="eyebrow">Hunyuan3D / Meshy</p>
          <h1>Provider benchmark card</h1>
        </div>
        <div className="hero-stats" aria-label="M1 workbench status">
          <Stat label="Capabilities" value={CAPABILITIES.length} />
          <Stat label="Mock results" value={results.length} />
          <Stat label="Remote calls" value={0} />
        </div>
      </section>

      <section className="grid-two">
        <CapabilityTable items={sortedCapabilities} />
        <ResultList results={results} />
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

function ResultList({ results }: { results: readonly BenchmarkResultSummary[] }) {
  return (
    <section className="panel results-panel">
      <div className="panel-title">
        <Box size={15} aria-hidden="true" />
        <span>Result Queue</span>
      </div>
      <div className="result-list">
        {results.map((result) => (
          <article className="result-card" key={result.id}>
            <div className="result-card-head">
              <div>
                <strong>{result.providerName}</strong>
                <span>{result.mode} · {result.promptCategory}</span>
              </div>
              <span className="mock-badge">mock</span>
            </div>
            <p>{result.prompt}</p>
            <dl>
              <div>
                <dt>Artifact</dt>
                <dd>{result.artifactKind.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Quota</dt>
                <dd>{result.quotaConsumed ? 'used' : 'none'}</dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>{result.quality.total ?? 'pending'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function RubricPanel() {
  return (
    <section className="panel compact rubric-panel">
      <div className="panel-title">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>Rubric</span>
      </div>
      <div className="rubric-list">
        {QUALITY_RUBRIC.map((dimension) => (
          <span key={dimension}>{dimension}</span>
        ))}
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
