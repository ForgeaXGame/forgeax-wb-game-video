import { S, assetCache } from './state.ts';
import type { AssetMeta } from './state.ts';
import { ASSET_TYPES } from './config.ts';

export async function apiBackend(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/wb/bgm/backend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env: S.env, endpoint, payload }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}

export async function fetchPage(assetType: number, page: number, pageSize: number, searchText = ''): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = { depot_name: S.depotName, asset_type: assetType };
  if (searchText) query.tag = searchText;
  return apiBackend('FindAssetMeta', {
    query,
    pagination: { page_num: page, page_size: pageSize, is_need_total_num: true },
  });
}

async function fetchAllOfType(assetType: number): Promise<AssetMeta[]> {
  const all: AssetMeta[] = [];
  const pageSize = 500;
  let page = 1;
  for (;;) {
    const d = await apiBackend('FindAssetMeta', {
      query: { depot_name: S.depotName, asset_type: assetType },
      pagination: { page_num: page, page_size: pageSize, is_need_total_num: true },
    });
    const items = (d.asset_meta_info_list || []) as AssetMeta[];
    all.push(...items);
    const total = (d.total as number) || items.length;
    if (all.length >= total || !items.length) break;
    page++;
  }
  return all;
}

interface StreamCallbacks {
  forceRefresh?: boolean;
  onChunk?: (assets: AssetMeta[], progress: number, totalTypes: number) => void;
  onDone?: (allAssets: AssetMeta[]) => void;
  onError?: (error: Error) => void;
}

export function fetchAllAssetsStream({ forceRefresh = false, onChunk, onDone, onError }: StreamCallbacks): () => void {
  if (!forceRefresh && assetCache.data && assetCache.env === S.env
      && Date.now() - assetCache.ts < assetCache.TTL) {
    onChunk?.(assetCache.data, ASSET_TYPES.length, ASSET_TYPES.length);
    onDone?.(assetCache.data);
    return () => {};
  }

  const typeNums = ASSET_TYPES.map(t => t.type);
  const totalTypes = typeNums.length;
  const collected: AssetMeta[] = [];
  let completed = 0;
  let aborted = false;
  let hasError = false;

  for (const type of typeNums) {
    fetchAllOfType(type).then(assets => {
      if (aborted) return;
      collected.push(...assets);
      completed++;
      onChunk?.(assets, completed, totalTypes);
      if (completed === totalTypes) {
        assetCache.data = collected;
        assetCache.env = S.env;
        assetCache.ts = Date.now();
        onDone?.(collected);
      }
    }).catch(err => {
      if (aborted) return;
      completed++;
      console.warn(`[Fetch] type ${type} failed:`, err);
      if (completed === totalTypes) {
        if (collected.length > 0) {
          assetCache.data = collected;
          assetCache.env = S.env;
          assetCache.ts = Date.now();
          onDone?.(collected);
        } else if (!hasError) {
          hasError = true;
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  return () => { aborted = true; };
}
