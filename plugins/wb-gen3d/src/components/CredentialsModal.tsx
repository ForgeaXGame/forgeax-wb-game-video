import { useCallback, useEffect, useState } from 'react';
import { Eraser, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { callTool } from '@/lib/toolClient';
import type { CredentialsPatch, CredentialsState, Gen3DCredentials } from '@/types';

// In-UI replacement for hand-editing the plugin .env: configure the three real
// 3D providers' keys + the master real/mock switch. Secrets are write-only —
// the server only ever returns a MASK (or null), and a mask must never be sent
// back as a real value. We track each secret as an explicit edit buffer so the
// save patch contains ONLY fields the user actually changed (see buildPatch).

type Phase = 'loading' | 'ready' | 'error';

type SecretKey = 'HUNYUAN_API_KEY' | 'MESHY_API_KEY' | 'RODIN_API_KEY' | 'COS_SECRET_ID' | 'COS_SECRET_KEY';

// value !== '' → user typed a new secret; cleared → user pressed 清除; neither
// → untouched (omitted from the patch, so the mask is never written back).
interface SecretEdit {
  value: string;
  cleared: boolean;
}

const UNTOUCHED: SecretEdit = { value: '', cleared: false };

const emptySecrets = (): Record<SecretKey, SecretEdit> => ({
  HUNYUAN_API_KEY: UNTOUCHED,
  MESHY_API_KEY: UNTOUCHED,
  RODIN_API_KEY: UNTOUCHED,
  COS_SECRET_ID: UNTOUCHED,
  COS_SECRET_KEY: UNTOUCHED,
});

export function CredentialsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  // Called after a successful save; the parent uses it to re-pull provider-status
  // so the pane-header pill / mode chip reflect the new real/mock state.
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [masked, setMasked] = useState<Gen3DCredentials | null>(null);
  const [secrets, setSecrets] = useState<Record<SecretKey, SecretEdit>>(emptySecrets);
  // HUNYUAN_BASE_URL + COS_BUCKET + COS_REGION are plaintext (not secrets):
  // prefill + edit freely. Compare against the loaded value to decide whether
  // each belongs in the patch.
  const [baseUrl, setBaseUrl] = useState('');
  const [initialBaseUrl, setInitialBaseUrl] = useState('');
  const [cosBucket, setCosBucket] = useState('');
  const [initialCosBucket, setInitialCosBucket] = useState('');
  const [cosRegion, setCosRegion] = useState('');
  const [initialCosRegion, setInitialCosRegion] = useState('');

  const applyState = useCallback((s: CredentialsState) => {
    setEnabled(s.realProvidersEnabled);
    setMasked(s.credentials);
    const url = s.credentials.HUNYUAN_BASE_URL ?? '';
    setBaseUrl(url);
    setInitialBaseUrl(url);
    const bucket = s.credentials.COS_BUCKET ?? '';
    setCosBucket(bucket);
    setInitialCosBucket(bucket);
    const region = s.credentials.COS_REGION ?? '';
    setCosRegion(region);
    setInitialCosRegion(region);
    // Drop edit buffers: typed secrets were consumed by the save (their fresh
    // masks now arrive via s.credentials), and on initial load they start clean.
    setSecrets(emptySecrets());
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    setSaveError(null);
    setJustSaved(false);
    const r = await callTool<CredentialsState>('gen3d:get-credentials', {});
    if (!r.ok) {
      setLoadError(r.error);
      setPhase('error');
      return;
    }
    applyState(r.result);
    setPhase('ready');
  }, [applyState]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const markDirty = () => {
    setJustSaved(false);
    setSaveError(null);
  };
  const changeEnabled = (v: boolean) => {
    setEnabled(v);
    markDirty();
  };
  const changeSecret = (k: SecretKey, v: string) => {
    setSecrets((s) => ({ ...s, [k]: { value: v, cleared: false } }));
    markDirty();
  };
  const clearSecret = (k: SecretKey) => {
    setSecrets((s) => ({ ...s, [k]: { value: '', cleared: true } }));
    markDirty();
  };
  const changeBaseUrl = (v: string) => {
    setBaseUrl(v);
    markDirty();
  };
  const changeCosBucket = (v: string) => {
    setCosBucket(v);
    markDirty();
  };
  const changeCosRegion = (v: string) => {
    setCosRegion(v);
    markDirty();
  };

  // Untouched secrets resolve to undefined → never serialized, so a returned mask
  // can't leak back as a real key.
  const secretToPatch = (edit: SecretEdit): string | undefined => {
    const v = edit.value.trim();
    if (v !== '') return v;
    if (edit.cleared) return '';
    return undefined;
  };

  const buildPatch = (): CredentialsPatch => {
    const patch: CredentialsPatch = { GEN3D_ENABLE_REAL_PROVIDERS: enabled ? '1' : '0' };
    const hy = secretToPatch(secrets.HUNYUAN_API_KEY);
    if (hy !== undefined) patch.HUNYUAN_API_KEY = hy;
    const me = secretToPatch(secrets.MESHY_API_KEY);
    if (me !== undefined) patch.MESHY_API_KEY = me;
    const ro = secretToPatch(secrets.RODIN_API_KEY);
    if (ro !== undefined) patch.RODIN_API_KEY = ro;
    const csi = secretToPatch(secrets.COS_SECRET_ID);
    if (csi !== undefined) patch.COS_SECRET_ID = csi;
    const csk = secretToPatch(secrets.COS_SECRET_KEY);
    if (csk !== undefined) patch.COS_SECRET_KEY = csk;
    const url = baseUrl.trim();
    if (url !== initialBaseUrl.trim()) patch.HUNYUAN_BASE_URL = url;
    const bucket = cosBucket.trim();
    if (bucket !== initialCosBucket.trim()) patch.COS_BUCKET = bucket;
    const region = cosRegion.trim();
    if (region !== initialCosRegion.trim()) patch.COS_REGION = region;
    return patch;
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    const r = await callTool<CredentialsState>('gen3d:set-credentials', buildPatch());
    setBusy(false);
    if (!r.ok) {
      setSaveError(r.error);
      return;
    }
    // Refresh masks (typed inputs clear, placeholders update) as the success cue,
    // then let the parent re-pull provider status. Keep the modal open.
    applyState(r.result);
    setJustSaved(true);
    onSaved();
  };

  return (
    <div
      className="gx-modal-overlay"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="gx-modal motion-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="3D 供应商密钥配置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="gx-modal-head">
          <span className="gx-modal-title">
            <KeyRound size={15} aria-hidden="true" />
            供应商密钥配置
          </span>
          <button
            type="button"
            className="fx-icon-btn gx-modal-close"
            aria-label="关闭"
            onClick={onClose}
            disabled={busy}
          >
            <X size={15} />
          </button>
        </header>

        <div className="gx-modal-body">
          {phase === 'loading' && (
            <div className="gx-modal-state">
              <RefreshCw size={20} className="gx-spin" aria-hidden="true" />
              <span>读取密钥配置…</span>
            </div>
          )}

          {phase === 'error' && (
            <div className="gx-modal-state">
              <ShieldAlert size={22} aria-hidden="true" />
              <span className="gx-state-title">读取密钥配置失败</span>
              <p className="gx-state-copy">{loadError}</p>
              <button type="button" className="fx-btn fx-btn--sm" onClick={() => void load()}>
                重试
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <section className="cred-section">
                <div className="cred-section-head">
                  <span className="cred-section-title">真实供应商总开关</span>
                </div>
                <div className="fx-segmented" role="radiogroup" aria-label="真实供应商总开关">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={enabled}
                    className={`fx-segmented-btn ${enabled ? 'is-selected' : ''}`}
                    onClick={() => changeEnabled(true)}
                  >
                    <ShieldAlert size={15} aria-hidden="true" />
                    <span>真实供应商</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!enabled}
                    className={`fx-segmented-btn ${!enabled ? 'is-selected' : ''}`}
                    onClick={() => changeEnabled(false)}
                  >
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>全部 mock</span>
                  </button>
                </div>
                <p className="step-note">关闭时全部回退 mock，不消耗配额。</p>
              </section>

              <section className="cred-section">
                <div className="cred-section-head">
                  <span className="cred-section-title">混元 Hunyuan</span>
                  <span className="cred-tag">公网</span>
                  <StatusBadge configured={masked?.HUNYUAN_API_KEY != null} />
                </div>
                <SecretField
                  label="HUNYUAN_API_KEY"
                  mask={masked?.HUNYUAN_API_KEY ?? null}
                  edit={secrets.HUNYUAN_API_KEY}
                  onChange={(v) => changeSecret('HUNYUAN_API_KEY', v)}
                  onClear={() => clearSecret('HUNYUAN_API_KEY')}
                />
                <label className="field">
                  <span className="field-label">HUNYUAN_BASE_URL</span>
                  <input
                    className="fx-input"
                    type="text"
                    autoComplete="off"
                    value={baseUrl}
                    placeholder="https://…/v1（可留空用默认端点）"
                    onChange={(e) => changeBaseUrl(e.target.value)}
                  />
                  <p className="step-note">非密钥，明文可见；留空使用默认端点。</p>
                </label>
              </section>

              <section className="cred-section">
                <div className="cred-section-head">
                  <span className="cred-section-title">Meshy</span>
                  <span className="cred-tag">公网</span>
                  <StatusBadge configured={masked?.MESHY_API_KEY != null} />
                </div>
                <SecretField
                  label="MESHY_API_KEY"
                  mask={masked?.MESHY_API_KEY ?? null}
                  edit={secrets.MESHY_API_KEY}
                  onChange={(v) => changeSecret('MESHY_API_KEY', v)}
                  onClear={() => clearSecret('MESHY_API_KEY')}
                />
              </section>

              <section className="cred-section">
                <div className="cred-section-head">
                  <span className="cred-section-title">Rodin</span>
                  <span className="cred-tag">公网</span>
                  <StatusBadge configured={masked?.RODIN_API_KEY != null} />
                </div>
                <SecretField
                  label="RODIN_API_KEY"
                  mask={masked?.RODIN_API_KEY ?? null}
                  edit={secrets.RODIN_API_KEY}
                  onChange={(v) => changeSecret('RODIN_API_KEY', v)}
                  onClear={() => clearSecret('RODIN_API_KEY')}
                />
              </section>

              <section className="cred-section">
                <div className="cred-section-head">
                  <span className="cred-section-title">对象存储 COS</span>
                  <span className="cred-tag">传输</span>
                  <StatusBadge configured={masked?.COS_SECRET_ID != null && masked?.COS_SECRET_KEY != null} />
                </div>
                <SecretField
                  label="COS_SECRET_ID"
                  mask={masked?.COS_SECRET_ID ?? null}
                  edit={secrets.COS_SECRET_ID}
                  onChange={(v) => changeSecret('COS_SECRET_ID', v)}
                  onClear={() => clearSecret('COS_SECRET_ID')}
                />
                <SecretField
                  label="COS_SECRET_KEY"
                  mask={masked?.COS_SECRET_KEY ?? null}
                  edit={secrets.COS_SECRET_KEY}
                  onChange={(v) => changeSecret('COS_SECRET_KEY', v)}
                  onClear={() => clearSecret('COS_SECRET_KEY')}
                />
                <label className="field">
                  <span className="field-label">COS_BUCKET</span>
                  <input
                    className="fx-input"
                    type="text"
                    autoComplete="off"
                    value={cosBucket}
                    placeholder="bucket-name-1234567890"
                    onChange={(e) => changeCosBucket(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">COS_REGION</span>
                  <input
                    className="fx-input"
                    type="text"
                    autoComplete="off"
                    value={cosRegion}
                    placeholder="ap-guangzhou"
                    onChange={(e) => changeCosRegion(e.target.value)}
                  />
                </label>
                <p className="step-note">
                  绑非 Meshy 源（混元/Rodin 生成的 mesh → Meshy 绑骨架）或上传本地图时需要
                  COS 公网 URL，此时必须配置；纯 Meshy 端到端可不配。详见插件 .env。
                </p>
              </section>
            </>
          )}
        </div>

        {phase === 'ready' && (
          <footer className="gx-modal-foot">
            <span
              className={`gx-modal-msg ${saveError ? 'gx-modal-msg--err' : justSaved ? 'gx-modal-msg--ok' : ''}`}
            >
              {saveError ?? (justSaved ? '已保存 ✓' : '')}
            </span>
            <button type="button" className="fx-btn fx-btn--sm" onClick={onClose} disabled={busy}>
              关闭
            </button>
            <button type="button" className="fx-btn fx-btn--primary" onClick={() => void save()} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span className={`cred-badge ${configured ? 'cred-badge--on' : 'cred-badge--off'}`}>
      {configured ? '已配置' : '未配置'}
    </span>
  );
}

function SecretField({
  label,
  mask,
  edit,
  onChange,
  onClear,
}: {
  label: string;
  mask: string | null;
  edit: SecretEdit;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const configured = mask != null;
  const placeholder = edit.cleared
    ? '将清除该密钥（保存后生效）'
    : configured
      ? `已配置 ${mask}`
      : '未配置 — 粘贴 API Key';
  const pending = edit.value.trim() !== '' ? '将保存新密钥' : edit.cleared ? '将清除该密钥' : null;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="cred-secret-row">
        <input
          className="fx-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={edit.value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {configured && (
          <button type="button" className="fx-btn fx-btn--sm" onClick={onClear} title="清除已保存的密钥">
            <Eraser size={13} aria-hidden="true" />
            清除
          </button>
        )}
      </div>
      {pending && (
        <span className={`step-note ${edit.cleared ? 'step-note--warn' : ''}`}>{pending}</span>
      )}
    </label>
  );
}
