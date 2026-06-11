import { useRef, useState } from 'react';
import { callTool } from '@/lib/toolClient';
import type { UploadImageResult } from '@/types';
import { EDITOR_ICON_MAP } from '@/ui-meta';

// A single image source field: pick a local file (→ gen3d:upload-image → COS
// presigned URL auto-filled) OR paste a URL directly. The hosted URL is what
// gets fed to URL-fetching providers (Hunyuan/Meshy). When COS is not
// configured the upload fails with a clear hint to paste a URL instead.

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// FileReader → raw base64 (strip the data: prefix the server tolerates anyway).
function fileToBase64(file: File): Promise<{ base64: string; mimetype: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve({ base64: comma === -1 ? result : result.slice(comma + 1), mimetype: file.type });
    };
    reader.readAsDataURL(file);
  });
}

export function ImageInputField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const UploadIcon = EDITOR_ICON_MAP.upload;

  async function pickFile(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB`);
      return;
    }
    setBusy(true);
    try {
      const { base64, mimetype } = await fileToBase64(file);
      const r = await callTool<UploadImageResult>('gen3d:upload-image', { base64, mimetype });
      if (!r.ok) {
        setError(r.error === 'cos_not_configured' ? '未配置 COS 上传，请改为手填图片 URL' : r.error);
        return;
      }
      onChange(r.result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="image-input-row">
        <input
          className="fx-input"
          type="url"
          value={value}
          placeholder={placeholder ?? 'https://…/image.png'}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="选择本地图片上传"
        >
          <UploadIcon size={14} aria-hidden="true" />
          {busy ? '上传中…' : '本地图片'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <span className="step-note step-note--warn">{error}</span>}
    </label>
  );
}
