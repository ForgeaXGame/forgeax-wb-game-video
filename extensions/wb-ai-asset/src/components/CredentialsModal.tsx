import { useEffect, useState } from 'react';
import { callTool } from '@/lib/toolClient';
import { t } from '@/i18n';
import type { CredentialsState } from '@/types';

type FieldKey = 'COS_SECRET_ID' | 'COS_SECRET_KEY' | 'COS_BUCKET' | 'COS_REGION';

const FIELDS: { key: FieldKey; label: string; secret: boolean; placeholder: string }[] = [
  { key: 'COS_SECRET_ID', label: 'cred.field.secretId', secret: true, placeholder: 'AKID...' },
  { key: 'COS_SECRET_KEY', label: 'cred.field.secretKey', secret: true, placeholder: '...' },
  { key: 'COS_BUCKET', label: 'cred.field.bucket', secret: false, placeholder: 'my-bucket-1250000000' },
  { key: 'COS_REGION', label: 'cred.field.region', secret: false, placeholder: 'ap-guangzhou' },
];

// Plugin-local .env: COS keys + master switch. LiteLLM gateway key is read-only
// from Studio Settings → API Keys.
export function CredentialsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState<CredentialsState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [enableReal, setEnableReal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await callTool<CredentialsState>('aiasset:get-credentials', {});
      if (r.ok) {
        setState(r.result);
        setEnableReal(r.result.realProvidersEnabled);
      } else {
        setError(r.error);
      }
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    const patch: Record<string, string> = { AIASSET_ENABLE_REAL_PROVIDERS: enableReal ? '1' : '0' };
    for (const f of FIELDS) {
      const v = drafts[f.key];
      if (v === undefined) continue;
      if (v === '-') patch[f.key] = '';
      else if (v.trim()) patch[f.key] = v.trim();
    }
    const r = await callTool<CredentialsState>('aiasset:set-credentials', patch);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setState(r.result);
    setDrafts({});
    onSaved();
    onClose();
  };

  return (
    <div className="aa-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="aa-modal" onClick={(e) => e.stopPropagation()}>
        <header className="aa-modal-head">
          <h3>{t('cred.title')}</h3>
          <button type="button" className="aa-btn aa-btn--ghost" onClick={onClose}>✕</button>
        </header>

        <label className="aa-switch">
          <input type="checkbox" checked={enableReal} onChange={(e) => setEnableReal(e.target.checked)} />
          <span>{t('cred.enableReal')}</span>
        </label>

        <section className="aa-litellm-readonly">
          <span className={`aa-litellm-badge ${state?.litellmConfigured ? 'is-on' : 'is-off'}`}>
            {t('cred.gatewayStatus', {
              state: state?.litellmConfigured ? t('cred.gatewayConfigured') : t('cred.gatewayNotConfigured'),
            })}
          </span>
          <p className="aa-hint-small">
            {t('cred.gatewayHint', {
              current: state?.litellmProxyKey ? t('cred.gatewayCurrent', { key: state.litellmProxyKey }) : '',
            })}
          </p>
        </section>

        <div className="aa-fields">
          {FIELDS.map((f) => {
            const masked = state?.credentials?.[f.key] ?? null;
            return (
              <label key={f.key} className="aa-field">
                <span className="aa-field-label">{t(f.label)}</span>
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={drafts[f.key] ?? ''}
                  placeholder={masked ? t('cred.placeholderSet', { masked }) : f.placeholder}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            );
          })}
        </div>

        {error ? <p className="aa-error">{error}</p> : null}

        <footer className="aa-modal-foot">
          <button type="button" className="aa-btn aa-btn--ghost" onClick={onClose}>{t('btn.cancel')}</button>
          <button type="button" className="aa-btn aa-btn--primary" onClick={save} disabled={busy}>
            {busy ? t('btn.saving') : t('btn.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
