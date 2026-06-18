import JSZip from 'jszip';

export type UrlResolver = (filename: string) => string;

interface CacheEntry {
  files: Map<string, Blob>;
  urls: Map<string, string>;
}

const cache = new Map<string, CacheEntry>();

export function getCached(cacheKey: string): { files: string[]; getUrl: UrlResolver } | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  return {
    files: [...entry.files.keys()],
    getUrl: (f) => entry.urls.get(f) || '',
  };
}

export async function downloadAndExtract(
  zipUrl: string,
  cacheKey: string,
  onProgress?: (percent: number, msg: string) => void,
): Promise<{ files: string[]; getUrl: UrlResolver }> {
  const hit = getCached(cacheKey);
  if (hit) return hit;

  onProgress?.(5, '连接服务器...');

  // 先尝试直接下载，如果 CORS 被拦截则走代理
  let resp: Response;
  try {
    resp = await fetch(zipUrl);
  } catch {
    resp = await fetch(`/api/wb/bgm/cos-proxy?url=${encodeURIComponent(zipUrl)}`);
  }
  if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);

  const totalSize = parseInt(resp.headers.get('content-length') || '0');
  const reader = resp.body!.getReader();
  const chunks: BlobPart[] = [];
  let downloaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    if (totalSize > 0) {
      const pct = Math.round(10 + (downloaded / totalSize) * 60);
      onProgress?.(pct, `下载中... ${(downloaded / 1048576).toFixed(1)}MB / ${(totalSize / 1048576).toFixed(1)}MB`);
    }
  }

  const blob = new Blob(chunks);

  onProgress?.(72, '解压中...');
  const zip = await JSZip.loadAsync(blob);

  const entry: CacheEntry = { files: new Map(), urls: new Map() };
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const flatName = name.split('/').pop()!;
    const fileBlob = await zip.files[name].async('blob');
    entry.files.set(flatName, fileBlob);
    entry.urls.set(flatName, URL.createObjectURL(fileBlob));
    onProgress?.(72 + Math.round((i / names.length) * 25), `解压中... (${i + 1}/${names.length})`);
  }

  cache.set(cacheKey, entry);
  onProgress?.(100, '完成');

  return {
    files: [...entry.files.keys()],
    getUrl: (f) => entry.urls.get(f) || '',
  };
}

export function clearAll(): void {
  for (const entry of cache.values()) {
    for (const url of entry.urls.values()) URL.revokeObjectURL(url);
  }
  cache.clear();
}
