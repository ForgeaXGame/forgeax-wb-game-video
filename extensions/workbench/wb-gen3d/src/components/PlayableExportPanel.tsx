import { useEffect, useMemo, useState, type JSX } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { motionRefKey, selectFiles, type Gen3DAssetManifest } from '@shared/manifest';
import { autoMatchMotionMapping } from '@shared/playable-profile';
import type {
  AdoptPlayableResult,
  ExportPlayableResult,
  PlayableMotionSlot,
  PlayableProfileResult,
} from '@/types';
import { callTool } from '@/lib/toolClient';
import { ModelViewer, type ViewerClip } from '@/components/ModelViewer';
import { EDITOR_ICON_MAP } from '@/ui-meta';
import { t } from '@/i18n';

const PackageIcon = EDITOR_ICON_MAP.handoff;
const ImportIcon = EDITOR_ICON_MAP.importGame;

type WizardMode = 'export' | 'review' | 'adopt' | 'migrate';
type WizardStep = 1 | 2 | 3 | 4;

function motionCandidates(manifest: Gen3DAssetManifest) {
  return selectFiles(manifest.files, 'animated_model')
    .filter((f) => f.motionRef)
    .map((f) => ({
      motionRefKey: motionRefKey(f.motionRef!),
      label: f.motionRef!.label,
    }));
}

function defaultSlotsFromPreset(profile: PlayableProfileResult, presetId: string): PlayableMotionSlot[] {
  const preset = profile.presets.find((p) => p.profileId === presetId) ?? profile.presets[0];
  return (preset?.slots ?? []).map((s) => ({ ...s, matchKeywords: [...s.matchKeywords] }));
}

export function PlayableExportPanel({
  manifest,
  busy,
}: {
  manifest: Gen3DAssetManifest;
  busy: boolean;
}): JSX.Element {
  const assetPath = manifest.assetPath;
  const [profile, setProfile] = useState<PlayableProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('export');
  const [step, setStep] = useState<WizardStep>(1);

  const [presetId, setPresetId] = useState('basic-character-v1');
  const [slots, setSlots] = useState<PlayableMotionSlot[]>([]);
  const [saveAsGameDefault, setSaveAsGameDefault] = useState(false);
  const [mappings, setMappings] = useState<
    Array<{ slotId: string; motionRefKey: string | null; autoMatched: boolean }>
  >([]);
  const [adoptMaps, setAdoptMaps] = useState<Array<{ slotId: string; clipName: string | null }>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSlots, setPreviewSlots] = useState<string[]>([]);

  const candidates = useMemo(() => motionCandidates(manifest), [manifest]);
  const canExport = manifest.readiness.rigged && manifest.readiness.animated;

  const refresh = async () => {
    const r = await callTool<PlayableProfileResult>('gen3d:get-playable-profile', { assetPath });
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setProfile(r.result);
    if (r.result.delivery?.localUrl) {
      setPreviewUrl(r.result.delivery.localUrl);
      setPreviewSlots(r.result.delivery.clipSlotIds ?? Object.keys(r.result.delivery.slotGuidRegistry));
    }
    return r.result;
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNote(null);
    void (async () => {
      const r = await callTool<PlayableProfileResult>('gen3d:get-playable-profile', { assetPath });
      if (cancelled) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setProfile(r.result);
      if (r.result.delivery?.localUrl) {
        setPreviewUrl(r.result.delivery.localUrl);
        setPreviewSlots(r.result.delivery.clipSlotIds ?? Object.keys(r.result.delivery.slotGuidRegistry));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetPath]);

  const openWizard = (mode: WizardMode) => {
    if (!profile) return;
    setWizardMode(mode);
    setError(null);
    setNote(null);
    setStep(1);
    const pid =
      profile.override?.basedOnProfileId ??
      profile.gameProfile?.profileId ??
      profile.presets[0]?.profileId ??
      'basic-character-v1';
    setPresetId(pid);
    const nextSlots =
      profile.effectiveSlots.length > 0
        ? profile.effectiveSlots.map((s) => ({ ...s, matchKeywords: [...s.matchKeywords] }))
        : defaultSlotsFromPreset(profile, pid);
    setSlots(nextSlots);
    setSaveAsGameDefault(false);

    if (mode === 'adopt' && profile.adoptCandidate) {
      const clips = profile.adoptCandidate.clips;
      setAdoptMaps(
        nextSlots.map((s) => {
          const hit =
            clips.find((c) => c.name.toLowerCase() === s.slotId.toLowerCase()) ??
            clips.find((c) => s.matchKeywords.some((k) => c.name.toLowerCase().includes(k.toLowerCase()))) ??
            null;
          return { slotId: s.slotId, clipName: hit?.name ?? clips[0]?.name ?? null };
        }),
      );
    } else {
      const auto = autoMatchMotionMapping(nextSlots, candidates);
      const existing = profile.mapping?.mappings ?? [];
      setMappings(
        nextSlots.map((s) => {
          const prev = existing.find((m) => m.slotId === s.slotId);
          const suggested = auto.find((m) => m.slotId === s.slotId);
          return {
            slotId: s.slotId,
            motionRefKey: prev?.motionRefKey ?? suggested?.motionRefKey ?? candidates[0]?.motionRefKey ?? null,
            autoMatched: prev ? prev.autoMatched : true,
          };
        }),
      );
    }
    setWizardOpen(true);
  };

  const runExport = async () => {
    setExporting(true);
    setError(null);
    setNote(null);
    try {
      if (!canExport) {
        setError(!manifest.readiness.rigged ? t('ws.playable.needRig') : t('ws.playable.needMotion'));
        return;
      }
      const r = await callTool<ExportPlayableResult>('gen3d:export-playable-character', { assetPath });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (!r.result.ok) {
        const missing = r.result.missingSlots?.length
          ? t('ws.playable.missing', { slots: r.result.missingSlots.join(', ') })
          : null;
        setError(missing ?? t('ws.playable.failed', { message: r.result.message }));
        return;
      }
      setNote(t('ws.playable.success', { path: r.result.modelPath }));
      setPreviewUrl(r.result.localUrl);
      const refreshed = await refresh();
      if (refreshed?.delivery) {
        setPreviewSlots(refreshed.delivery.clipSlotIds ?? Object.keys(refreshed.delivery.slotGuidRegistry));
      }
      setWizardOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const onOneClick = async () => {
    await runExport();
  };

  const onWizardNext = async () => {
    setError(null);
    if (wizardMode === 'adopt') {
      if (step === 1) {
        setStep(2);
        return;
      }
      // step 2: confirm adopt
      setExporting(true);
      try {
        const r = await callTool<AdoptPlayableResult>('gen3d:adopt-playable-character', {
          assetPath,
          confirmed: true,
          slotMappings: adoptMaps.map((m) => ({ slotId: m.slotId, clipName: m.clipName })),
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (!r.result.ok) {
          setError(t('ws.playable.adoptFailed', { message: r.result.message }));
          return;
        }
        setNote(t('ws.playable.adoptSuccess', { path: r.result.modelPath }));
        setPreviewUrl(r.result.localUrl);
        const refreshed = await refresh();
        if (refreshed?.delivery) {
          setPreviewSlots(refreshed.delivery.clipSlotIds ?? Object.keys(refreshed.delivery.slotGuidRegistry));
        }
        setWizardOpen(false);
      } finally {
        setExporting(false);
      }
      return;
    }

    if (step === 1) {
      // Apply preset slot list if user changed preset and slots empty / mismatched
      if (slots.length === 0 && profile) {
        setSlots(defaultSlotsFromPreset(profile, presetId));
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (slots.length === 0 || !slots.some((s) => s.required)) {
        setError(t('ws.playable.needRequiredSlot'));
        return;
      }
      setExporting(true);
      try {
        const setProf = await callTool('gen3d:set-playable-profile', {
          assetPath,
          profileId: presetId,
          slots,
          saveAsGameDefault,
        });
        if (!setProf.ok) {
          setError(setProf.error);
          return;
        }
        const auto = autoMatchMotionMapping(slots, candidates);
        setMappings(
          slots.map((s) => {
            const prev = mappings.find((m) => m.slotId === s.slotId);
            const suggested = auto.find((m) => m.slotId === s.slotId);
            return {
              slotId: s.slotId,
              motionRefKey: prev?.motionRefKey ?? suggested?.motionRefKey ?? candidates[0]?.motionRefKey ?? null,
              autoMatched: prev?.motionRefKey ? false : true,
            };
          }),
        );
        setStep(3);
      } finally {
        setExporting(false);
      }
      return;
    }
    if (step === 3) {
      setExporting(true);
      try {
        const setMap = await callTool('gen3d:set-playable-motion-mapping', {
          assetPath,
          mappings,
          confirmed: true,
        });
        if (!setMap.ok) {
          setError(setMap.error);
          return;
        }
        setStep(4);
      } finally {
        setExporting(false);
      }
      return;
    }
    // step 4: export
    await runExport();
  };

  const statusLine = (() => {
    if (!profile) return t('ws.playable.status.loading');
    if (profile.migrationNeeded) return t('ws.playable.status.migration');
    if (profile.adoptCandidate) return t('ws.playable.status.adoptable');
    if (profile.oneClickReady) return t('ws.playable.status.oneClick');
    if (profile.delivery) return t('ws.playable.status.exists');
    if (!profile.mapping?.confirmed) return t('ws.playable.status.needWizard');
    return t('ws.playable.status.ready');
  })();

  const previewClips: ViewerClip[] | undefined =
    previewUrl && previewSlots.length > 0
      ? previewSlots.map((slotId) => ({
          url: previewUrl,
          label: slots.find((s) => s.slotId === slotId)?.displayName ?? slotId,
          key: `playable:${slotId}`,
          animationName: slotId,
        }))
      : previewUrl
        ? [{ url: previewUrl, label: t('ws.playable.previewMerged'), key: 'playable:merged' }]
        : undefined;

  return (
    <section className="downstream" style={{ marginTop: 12 }}>
      <div className="downstream-head">
        <PackageIcon size={14} />
        <span>{t('ws.playable.title')}</span>
      </div>
      <small className="downstream-hint">{t('ws.playable.hint')}</small>
      {profile?.delivery && (
        <small className="downstream-hint" style={{ display: 'block', marginTop: 4 }}>
          {t('ws.playable.assetsHint')}
        </small>
      )}
      <small className="downstream-hint" style={{ display: 'block', marginTop: 4 }}>
        {statusLine}
      </small>
      {profile?.migrationNeeded && (
        <small className="downstream-hint" role="status" style={{ display: 'block', marginTop: 4 }}>
          <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          {t('ws.playable.migrationHint')}
        </small>
      )}

      <div className="badge-row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
        {profile?.adoptCandidate && (
          <button
            type="button"
            className="fx-btn fx-btn--sm"
            disabled={busy || exporting}
            onClick={() => openWizard('adopt')}
          >
            <ImportIcon size={14} /> {t('ws.playable.adoptBtn')}
          </button>
        )}
        {profile?.oneClickReady && !profile.migrationNeeded && (
          <button
            type="button"
            className="fx-btn fx-btn--sm"
            disabled={busy || exporting || !canExport}
            onClick={() => void onOneClick()}
          >
            <RefreshCw size={14} /> {exporting ? t('ws.playable.busy') : t('ws.playable.updateBtn')}
          </button>
        )}
        {(!profile?.oneClickReady || profile.migrationNeeded) && !profile?.adoptCandidate && (
          <button
            type="button"
            className="fx-btn fx-btn--sm"
            disabled={busy || exporting || !canExport || !profile}
            onClick={() => openWizard(profile?.migrationNeeded ? 'migrate' : 'export')}
          >
            <PackageIcon size={14} />{' '}
            {exporting
              ? t('ws.playable.busy')
              : profile?.delivery
                ? t('ws.playable.updateBtn')
                : t('ws.playable.exportBtn')}
          </button>
        )}
        {(profile?.delivery || profile?.mapping?.confirmed) && (
          <button
            type="button"
            className="fx-btn fx-btn--sm fx-btn--ghost"
            disabled={busy || exporting || !profile}
            onClick={() => openWizard(profile?.migrationNeeded ? 'migrate' : 'review')}
          >
            {t('ws.playable.reviewBtn')}
          </button>
        )}
      </div>

      {note && !error && (
        <small className="downstream-ok" style={{ display: 'block', marginTop: 6 }}>
          {note}
        </small>
      )}
      {error && (
        <small className="downstream-hint" role="alert" style={{ display: 'block', marginTop: 6 }}>
          {error}
        </small>
      )}

      {previewUrl && (
        <div style={{ marginTop: 10 }}>
          <small className="downstream-hint" style={{ display: 'block', marginBottom: 6 }}>
            {t('ws.playable.previewHint')}
          </small>
          <ModelViewer key={previewUrl} url={previewUrl} clips={previewClips} />
        </div>
      )}

      {wizardOpen && profile && (
        <div
          className="gx-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('ws.playable.wizardTitle')}
          onClick={() => !exporting && setWizardOpen(false)}
        >
          <div className="gx-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="gx-modal-head">
              <div className="gx-modal-title">
                <PackageIcon size={16} />
                <span>
                  {wizardMode === 'adopt'
                    ? t('ws.playable.adoptTitle')
                    : wizardMode === 'migrate'
                      ? t('ws.playable.migrateTitle')
                      : wizardMode === 'review'
                        ? t('ws.playable.reviewTitle')
                        : t('ws.playable.wizardTitle')}
                </span>
              </div>
              <button
                type="button"
                className="fx-btn fx-btn--ghost fx-btn--sm gx-modal-close"
                aria-label={t('cred.aria.close')}
                disabled={exporting}
                onClick={() => setWizardOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="gx-modal-body">
              {wizardMode === 'migrate' && (
                <p className="downstream-hint" style={{ marginBottom: 8 }}>
                  {t('ws.playable.migrationBody', {
                    from: `${profile.delivery?.profileId ?? '?'}@v${profile.delivery?.profileVersion ?? '?'}`,
                    to: `${profile.gameProfile?.profileId ?? presetId}@v${profile.gameProfile?.profileVersion ?? '?'}`,
                  })}
                </p>
              )}

              {wizardMode === 'adopt' ? (
                <>
                  {step === 1 && (
                    <>
                      <p className="downstream-hint">{t('ws.playable.adoptStep1')}</p>
                      <code className="mono" style={{ fontSize: 11 }}>
                        {profile.adoptCandidate?.modelPath}
                      </code>
                      <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 12 }}>
                        {profile.adoptCandidate?.clips.map((c) => (
                          <li key={c.guid}>
                            {c.name} · idx {c.sourceIndex}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <p className="downstream-hint">{t('ws.playable.adoptStep2')}</p>
                      {adoptMaps.map((m) => (
                        <label
                          key={m.slotId}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12 }}
                        >
                          <span style={{ minWidth: 72 }}>{m.slotId}</span>
                          <select
                            value={m.clipName ?? ''}
                            onChange={(e) =>
                              setAdoptMaps((prev) =>
                                prev.map((x) =>
                                  x.slotId === m.slotId ? { ...x, clipName: e.target.value || null } : x,
                                ),
                              )
                            }
                          >
                            <option value="">{t('ws.playable.unmapped')}</option>
                            {profile.adoptCandidate?.clips.map((c) => (
                              <option key={c.guid} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {step === 1 && (
                    <>
                      <p className="downstream-hint">{t('ws.playable.step1')}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {profile.presets.map((p) => (
                          <label key={p.profileId} style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                            <input
                              type="radio"
                              name="playable-preset"
                              checked={presetId === p.profileId}
                              onChange={() => {
                                setPresetId(p.profileId);
                                setSlots(defaultSlotsFromPreset(profile, p.profileId));
                              }}
                            />
                            {p.displayName}{' '}
                            <span className="downstream-hint">({p.slots.length} slots)</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <p className="downstream-hint">{t('ws.playable.step2')}</p>
                      <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 12 }}>
                        {slots.map((s) => (
                          <li key={s.slotId}>
                            {s.displayName} ({s.slotId}){s.required ? ` · ${t('ws.playable.required')}` : ''}
                          </li>
                        ))}
                      </ul>
                      <label style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={saveAsGameDefault}
                          onChange={(e) => setSaveAsGameDefault(e.target.checked)}
                        />
                        {t('ws.playable.saveAsGameDefault')}
                      </label>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <p className="downstream-hint">{t('ws.playable.step3')}</p>
                      {mappings.map((m) => (
                        <label
                          key={m.slotId}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12 }}
                        >
                          <span style={{ minWidth: 72 }}>{m.slotId}</span>
                          <select
                            value={m.motionRefKey ?? ''}
                            onChange={(e) =>
                              setMappings((prev) =>
                                prev.map((x) =>
                                  x.slotId === m.slotId
                                    ? {
                                        ...x,
                                        motionRefKey: e.target.value || null,
                                        autoMatched: false,
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="">{t('ws.playable.unmapped')}</option>
                            {candidates.map((c) => (
                              <option key={c.motionRefKey} value={c.motionRefKey}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </>
                  )}
                  {step === 4 && (
                    <p className="downstream-hint">{t('ws.playable.step4')}</p>
                  )}
                </>
              )}
              {error && (
                <p className="gx-modal-msg gx-modal-msg--err" role="alert" style={{ marginTop: 10 }}>
                  {error}
                </p>
              )}
            </div>
            <div className="gx-modal-foot">
              <button
                type="button"
                className="fx-btn fx-btn--ghost fx-btn--sm"
                disabled={exporting || step === 1}
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
              >
                {t('ws.playable.back')}
              </button>
              <button
                type="button"
                className="fx-btn fx-btn--sm"
                disabled={exporting}
                onClick={() => void onWizardNext()}
              >
                {exporting
                  ? t('ws.playable.busy')
                  : wizardMode === 'adopt'
                    ? step === 2
                      ? t('ws.playable.adoptConfirm')
                      : t('ws.playable.next')
                    : step === 4
                      ? t('ws.playable.exportBtn')
                      : t('ws.playable.next')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
