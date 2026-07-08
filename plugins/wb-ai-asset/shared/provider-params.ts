// Meshy provider-param allowlist for wb-ai-asset. Only verified, mode-applicable
// fields pass through to the API payload; anything else is dropped so a typo or
// stale UI field can never reach Meshy. model_type defaults to `lowpoly` because
// this plugin's whole purpose is small low-poly props (see PLAN §架构).

import type { GenerationMode } from './manifest';

export type ProviderKey = 'meshy';

export type ParamType = 'enum' | 'bool' | 'int' | 'text';

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamField {
  key: string;
  label: string;
  type: ParamType;
  options?: ParamOption[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
  help?: string;
  appliesToModes: GenerationMode[];
  verified: boolean;
}

export const providerParamSpec: Record<ProviderKey, ParamField[]> = {
  meshy: [
    {
      key: 'model_type',
      label: '网格类型',
      type: 'enum',
      options: [
        { value: 'lowpoly', label: '低面数' },
        { value: 'standard', label: '标准' },
      ],
      default: 'lowpoly',
      help: 'lowpoly 直出低面数小物件，忽略 ai_model/topology/面数等设置',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'ai_model',
      label: '模型版本',
      type: 'enum',
      options: [
        { value: 'meshy-5', label: 'Meshy 5' },
        { value: 'meshy-6', label: 'Meshy 6' },
      ],
      default: 'meshy-6',
      help: '仅在「标准」网格类型下生效',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'topology',
      label: '拓扑',
      type: 'enum',
      options: [
        { value: 'triangle', label: '三角面' },
        { value: 'quad', label: '四边面' },
      ],
      help: '仅在「标准」网格类型下生效',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'symmetry_mode',
      label: '对称',
      type: 'enum',
      options: [
        { value: 'off', label: '关闭' },
        { value: 'auto', label: '自动' },
        { value: 'on', label: '强制' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
  ],
};

const clampInt = (n: number, min?: number, max?: number): number => {
  let v = Math.round(n);
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
};

export function filterProviderParams(
  provider: ProviderKey,
  mode: GenerationMode,
  raw: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw) return out;
  for (const f of providerParamSpec[provider] ?? []) {
    if (!f.verified) continue;
    if (!f.appliesToModes.includes(mode)) continue;
    const v = raw[f.key];
    if (v === undefined || v === null) continue;
    if (f.type === 'bool') {
      if (typeof v === 'boolean') out[f.key] = v;
    } else if (f.type === 'int') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[f.key] = clampInt(n, f.min, f.max);
    } else if (f.type === 'enum') {
      if (typeof v === 'string' && (f.options ?? []).some((o) => o.value === v)) out[f.key] = v;
    } else if (f.type === 'text') {
      if (typeof v === 'string' && v.trim()) out[f.key] = v.trim();
    }
  }
  return out;
}

// The declared default for an allowlisted param — single source of truth for
// "what we send when the user didn't pick one". The precise-lowpoly pipeline
// uses this to pin ai_model=meshy-6 (research §2.2: meshy-6 ships watertight
// meshes; older defaults can emit non-manifold geometry).
export function defaultParam(provider: ProviderKey, key: string): string | undefined {
  const field = providerParamSpec[provider]?.find((f) => f.key === key);
  return typeof field?.default === 'string' ? field.default : undefined;
}
