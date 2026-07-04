import { useEffect, useRef, useState, type JSX } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { selectFile } from '@shared/manifest';
import type { Gen3DAssetManifest } from '@shared/manifest';
import {
  scoreObjective,
  weightedTotal,
  DEFAULT_WEIGHTS,
  type ObjectiveScores,
} from '@shared/quality/heuristics';
import { extractObjectiveMetrics } from '@/lib/objectiveMetrics';
import { blobUrl } from '@/lib/blobUrl';
import { callTool } from '@/lib/toolClient';
import type { ScoreQualityResult } from '@/types';
import { EDITOR_ICON_MAP } from '@/ui-meta';
import { t } from '@/i18n';

const GaugeIcon = EDITOR_ICON_MAP.quality;
const DIMS = ['geometry', 'topology', 'texture', 'pbr', 'prompt_fidelity'] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = {
  geometry: 'quality.dim.geometry',
  topology: 'quality.dim.topology',
  texture: 'quality.dim.texture',
  pbr: 'quality.dim.pbr',
  prompt_fidelity: 'quality.dim.fidelity',
};

export function QualityInspector({
  selected,
  onScored,
}: {
  selected: Gen3DAssetManifest | null;
  onScored: (m: Gen3DAssetManifest) => void;
}): JSX.Element {
  const [objective, setObjective] = useState<ObjectiveScores | null>(null);
  const [phase, setPhase] = useState<'idle' | 'computing' | 'ready' | 'unparsable'>('idle');
  const [manual, setManual] = useState<Partial<Record<Dim, number | null>>>({});
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef(0);

  const meshFile = selected ? selectFile(selected.files, 'source_mesh', 'glb') : null;
  const url = blobUrl(meshFile);

  useEffect(() => {
    setManual({});
    setNotes('');
    setEditing(false);
    if (!selected || !url) {
      setObjective(null);
      setPhase('idle');
      return;
    }
    const token = ++tokenRef.current;
    setPhase('computing');
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (token !== tokenRef.current) return;
        const metrics = extractObjectiveMetrics(gltf.scene, selected.targetFaceCount ?? null);
        setObjective(scoreObjective(metrics));
        setPhase('ready');
      },
      undefined,
      () => {
        if (token !== tokenRef.current) return;
        setObjective(null);
        setPhase('unparsable');
      },
    );
  }, [selected, url]);

  const value = (dim: Dim): number | null => {
    if (dim in manual) return manual[dim] ?? null;
    if (dim === 'prompt_fidelity') return null;
    return objective ? objective[dim as keyof ObjectiveScores] : null;
  };
  const source = (dim: Dim): 'auto' | 'manual' | 'none' =>
    dim in manual ? 'manual' : dim === 'prompt_fidelity' ? 'none' : objective && value(dim) !== null ? 'auto' : 'none';

  const total = weightedTotal(DIMS.map((d) => ({ value: value(d), weight: DEFAULT_WEIGHTS[d] })));

  async function save() {
    if (!selected) return;
    setSaving(true);
    const r = await callTool<ScoreQualityResult>('gen3d:score-quality', {
      assetPath: selected.assetPath,
      objective: objective
        ? { geometry: objective.geometry, topology: objective.topology, texture: objective.texture, pbr: objective.pbr }
        : undefined,
      manual: { ...manual, notes },
    });
    setSaving(false);
    if (r.ok) {
      onScored(r.result.manifest);
      setEditing(false);
    }
  }

  if (!selected) {
    return (
      <section className="reserved-card">
        <div className="reserved-head">
          <GaugeIcon size={15} />
          <span className="reserved-title">{t('quality.title')}</span>
        </div>
        <p className="reserved-note">{t('quality.hint.select')}</p>
      </section>
    );
  }

  return (
    <section className="reserved-card">
      <div className="reserved-head">
        <GaugeIcon size={15} />
        <span className="reserved-title">{t('quality.title')}</span>
        {total !== null && <span className="reserved-badge">{t('quality.badge.total', { total })}</span>}
      </div>

      {phase === 'unparsable' ? (
        <p className="reserved-note">{t('quality.hint.unparsable')}</p>
      ) : (
        <div className="quality-dims">
          {DIMS.map((dim) => {
            const v = value(dim);
            const src = source(dim);
            return (
              <div className="q-row" key={dim}>
                <span className="q-label">{t(DIM_LABEL[dim])}</span>
                <div className="q-bar">
                  <div className="q-bar-fill" style={{ width: `${v ?? 0}%` }} />
                </div>
                <span className="q-val">{v ?? '—'}</span>
                <span className={`q-src q-src--${src}`}>
                  {src === 'auto' ? t('quality.src.auto') : src === 'manual' ? t('quality.src.manual') : '—'}
                </span>
                {editing && (
                  <input
                    className="q-edit"
                    type="number"
                    min={0}
                    max={100}
                    value={v ?? ''}
                    onChange={(e) =>
                      setManual((m) => ({ ...m, [dim]: e.target.value === '' ? null : Number(e.target.value) }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.targetFaceCount == null && phase === 'ready' && (
        <p className="reserved-note">{t('quality.hint.noTarget')}</p>
      )}
      <p className="reserved-note">{t('quality.hint.fidelity')}</p>

      {editing && (
        <textarea
          className="fx-textarea"
          rows={2}
          placeholder={t('quality.placeholder.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      )}

      <div className="q-actions">
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={phase === 'computing'}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? t('quality.btn.cancelManual') : t('quality.btn.manualOverride')}
        </button>
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled
          title={t('quality.btn.aiTitle')}
        >
          {t('quality.btn.ai')}
        </button>
        <button
          type="button"
          className="fx-btn fx-btn--sm fx-btn--primary"
          disabled={saving || phase === 'computing' || phase === 'unparsable'}
          onClick={save}
        >
          {saving ? t('quality.btn.saving') : t('quality.btn.save')}
        </button>
      </div>
    </section>
  );
}
