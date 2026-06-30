import { useEffect, useState } from 'react';
import { callTool } from '@/lib/toolClient';
import type { CredentialsState } from '@/types';

type FieldKey =
  | 'MESHY_API_KEY'
  | 'MESHY_BASE_URL'
  | 'COS_SECRET_ID'
  | 'COS_SECRET_KEY'
  | 'COS_BUCKET'
  | 'COS_REGION';

const FIELDS: { key: FieldKey; label: string; secret: boolean; placeholder: string }[] = [
  { key: 'MESHY_API_KEY', label: 'Meshy API Key', secret: true, placeholder: 'msy_...' },
  { key: 'MESHY_BASE_URL', label: 'Meshy Base URL（可选）', secret: false, placeholder: 'https://api.meshy.ai' },
  { key: 'COS_SECRET_ID', label: 'COS SecretId（可选，本地图中转用）', secret: true, placeholder: 'AKID...' },
  { key: 'COS_SECRET_KEY', label: 'COS SecretKey（可选）', secret: true, placeholder: '...' },
  { key: 'COS_BUCKET', label: 'COS Bucket（可选）', secret: false, placeholder: 'my-bucket-1250000000' },
  { key: 'COS_REGION', label: 'COS Region（可选）', secret: false, placeholder: 'ap-guangzhou' },
];

// Read + write the plugin-local .env (Meshy key + COS + master switch). Masked
// values render as placeholders; an empty field is left unchanged, while typing
// a new value (or the literal "-" to clear) patches it live, no restart.
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
      // A lone "-" clears the field; any other non-empty value sets it. An empty
      // draft is skipped (keeps the existing value).
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
          <h3>Meshy / COS 凭证</h3>
          <button type="button" className="aa-btn aa-btn--ghost" onClick={onClose}>✕</button>
        </header>

        <label className="aa-switch">
          <input type="checkbox" checked={enableReal} onChange={(e) => setEnableReal(e.target.checked)} />
          <span>启用真实 Meshy 调用（关闭则走确定性 mock，不消耗额度）</span>
        </label>

        <div className="aa-fields">
          {FIELDS.map((f) => {
            const masked = state?.credentials?.[f.key] ?? null;
            return (
              <label key={f.key} className="aa-field">
                <span className="aa-field-label">{f.label}</span>
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={drafts[f.key] ?? ''}
                  placeholder={masked ? `已设置：${masked}（留空保持，输入 - 清除）` : f.placeholder}
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
          <button type="button" className="aa-btn aa-btn--ghost" onClick={onClose}>取消</button>
          <button type="button" className="aa-btn aa-btn--primary" onClick={save} disabled={busy}>
            {busy ? '保存中…' : '保存并即时生效'}
          </button>
        </footer>
      </div>
    </div>
  );
}
