import type { GenerationMode } from './manifest';

export type ProviderKey = 'hunyuan_workflow' | 'meshy' | 'rodin';

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
      key: 'ai_model',
      label: '模型版本',
      type: 'enum',
      options: [
        { value: 'meshy-5', label: 'Meshy 5' },
        { value: 'meshy-6', label: 'Meshy 6' },
      ],
      default: 'meshy-6',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'model_type',
      label: '网格类型',
      type: 'enum',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'lowpoly', label: '低面数' },
      ],
      help: 'lowpoly 会忽略 ai_model/topology/面数等设置',
      appliesToModes: ['image'],
      verified: true,
    },
    {
      key: 'should_remesh',
      label: '重建网格',
      type: 'bool',
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
      help: '仅在「重建网格」开启时生效',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'decimation_mode',
      label: '自适应减面',
      type: 'enum',
      options: [
        { value: '1', label: '超高' },
        { value: '2', label: '高' },
        { value: '3', label: '中' },
        { value: '4', label: '低' },
      ],
      help: '设置后覆盖「目标面数」',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'pose_mode',
      label: '姿态模式',
      type: 'enum',
      options: [
        { value: 'a-pose', label: 'A-pose' },
        { value: 't-pose', label: 'T-pose' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
  ],
  rodin: [
    {
      key: 'tier',
      label: '模型档',
      type: 'enum',
      options: [
        { value: 'Regular', label: 'Regular' },
        { value: 'Gen-2', label: 'Gen-2' },
        { value: 'Detail', label: 'Detail' },
        { value: 'Smooth', label: 'Smooth' },
        { value: 'Sketch', label: 'Sketch' },
      ],
      default: 'Regular',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'quality',
      label: '面数档位',
      type: 'enum',
      options: [
        { value: 'high', label: '高' },
        { value: 'medium', label: '中' },
        { value: 'low', label: '低' },
        { value: 'extra-low', label: '极低' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'mesh_mode',
      label: '拓扑',
      type: 'enum',
      options: [
        { value: 'Quad', label: '四边面' },
        { value: 'Raw', label: 'Raw (三角)' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'material',
      label: '材质类型',
      type: 'enum',
      options: [
        { value: 'PBR', label: 'PBR' },
        { value: 'Shaded', label: 'Shaded' },
        { value: 'All', label: 'All' },
      ],
      default: 'PBR',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'quality_override',
      label: '自定义面数',
      type: 'int',
      min: 1000,
      max: 200000,
      help: '设置后覆盖「面数档位」与目标面数',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'TAPose',
      label: 'T/A 姿态',
      type: 'bool',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'use_original_alpha',
      label: '使用原始透明通道',
      type: 'bool',
      appliesToModes: ['image', 'views'],
      verified: true,
    },
  ],
  hunyuan_workflow: [],
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
