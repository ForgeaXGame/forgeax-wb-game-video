import type { EnvName } from './config.ts';

export interface TreeNode {
  _type: 'root' | 'folder' | 'asset';
  _asset: AssetMeta | null;
  _cosKey: string | null;
  _name?: string;
  children: Record<string, TreeNode>;
}

export interface VersionInfo {
  version_name?: string;
  display_version_name?: string;
  res_url?: string;
  thumbnail_url?: string;
  state?: number;
  create_time?: number | string;
  update_time?: number | string;
}

export interface AssetMeta {
  id?: string;
  asset_id?: string;
  name?: string;
  display_name?: string;
  type?: number;
  state?: number;
  description?: string;
  current_version?: string;
  versions?: VersionInfo[];
  custom_tags?: string[];
  gen_tags?: string[];
  ai_meta?: unknown;
  extra?: unknown;
  create_time?: number | string;
  update_time?: number | string;
  score?: number;
}

export interface AppState {
  env: EnvName;
  depotName: string;
  viewMode: 'filemanager' | 'filter';
  activeType: number | null;
  search: string;
  page: number;
  pageSize: number;
  total: number;
  assets: AssetMeta[];
  fileTree: TreeNode | null;
}

export const S: AppState = {
  env:         'local',
  depotName:   'aw',
  viewMode:    'filemanager',
  activeType:  null,
  search:      '',
  page:        1,
  pageSize:    20,
  total:       0,
  assets:      [],
  fileTree:    null,
};

export interface AssetCacheState {
  data: AssetMeta[] | null;
  env: string | null;
  ts: number;
  TTL: number;
}

export const assetCache: AssetCacheState = {
  data: null,
  env: null,
  ts: 0,
  TTL: 120000,
};
