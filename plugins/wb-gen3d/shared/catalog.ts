export type Exposure = 'planned' | 'mock-first' | 'experimental' | 'hidden' | 'blocked';

export type ProviderId = 'meshy' | 'hunyuan_workflow' | 'hunyuan_rest' | 'future';

export interface ProviderCapability {
  providerId: ProviderId;
  providerName: string;
  capability: string;
  sourceStatus: string;
  exposure: Exposure;
  notes: string;
}

export interface ProviderStatusResult {
  ok: true;
  mode: 'static-m1';
  quotaSafe: true;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: readonly ProviderCapability[];
}

export type PromptCategory = 'character' | 'prop' | 'scene';

export interface BenchmarkResultSummary {
  id: string;
  providerId: ProviderId;
  providerName: string;
  mode: string;
  prompt: string;
  promptCategory: PromptCategory;
  status: 'mock' | 'cached' | 'succeeded' | 'failed';
  artifactKind: 'glb' | 'fbx' | 'image' | 'none';
  quotaConsumed: boolean;
  quality: {
    geometry: number | null;
    topology: number | null;
    texture: number | null;
    pbr: number | null;
    prompt_fidelity: number | null;
    total: number | null;
  };
  notes: string;
}

export interface MeshyTextMockArgs {
  prompt: string;
  promptCategory?: PromptCategory;
  enablePbr?: boolean;
  targetPolycount?: number;
}

export interface MeshyTextMockResult {
  ok: true;
  mode: 'static-m2';
  quotaSafe: true;
  cacheKey: string;
  providerId: 'meshy';
  result: BenchmarkResultSummary;
  artifact: {
    mocked: true;
    format: 'glb';
    uri: null;
  };
}

export interface ListResultsArgs {
  provider?: ProviderId | 'all';
  promptCategory?: PromptCategory | 'all';
}

export interface ListResultsResult {
  ok: true;
  mode: 'static-m1';
  quotaSafe: true;
  results: readonly BenchmarkResultSummary[];
}

export const QUALITY_RUBRIC = [
  'geometry',
  'topology',
  'texture',
  'pbr',
  'prompt_fidelity',
] as const;

export const CAPABILITIES: readonly ProviderCapability[] = [
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'text / text-to-3D preview',
    sourceStatus: 'Implemented in lab',
    exposure: 'mock-first',
    notes: 'Good M2 candidate. Preserve cache-first behavior before enabling real calls.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'image / image-to-3D',
    sourceStatus: 'Implemented in lab',
    exposure: 'planned',
    notes: 'Requires image input handling and artifact display.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'views / multi-image-to-3D',
    sourceStatus: 'Implemented in lab',
    exposure: 'planned',
    notes: 'Meshy accepts image URL arrays rather than Hunyuan named view slots.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'refine',
    sourceStatus: 'Implemented in lab',
    exposure: 'planned',
    notes: 'Meshy-only second stage; keep provider-specific.',
  },
  {
    providerId: 'hunyuan_workflow',
    providerName: 'Hunyuan workflow',
    capability: 'text',
    sourceStatus: 'Verified main mode',
    exposure: 'planned',
    notes: 'Use hunyuan-3d-v3.1-text2gen-wf with async submit and poll.',
  },
  {
    providerId: 'hunyuan_workflow',
    providerName: 'Hunyuan workflow',
    capability: 'image',
    sourceStatus: 'Verified main mode',
    exposure: 'planned',
    notes: 'Use hunyuan-3d-v3.1-image2gen-wf with async submit and poll.',
  },
  {
    providerId: 'hunyuan_workflow',
    providerName: 'Hunyuan workflow',
    capability: 'views',
    sourceStatus: 'Verified main mode',
    exposure: 'planned',
    notes: 'Use hunyuan-3d-v3.1-views2gen-wf and Hunyuan named view slots.',
  },
  {
    providerId: 'hunyuan_workflow',
    providerName: 'Hunyuan workflow',
    capability: 'geometry and world workflow modes',
    sourceStatus: 'Endpoint reachable, field sanity incomplete',
    exposure: 'hidden',
    notes: 'Keep out of UI and schemas until output shape is verified.',
  },
  {
    providerId: 'hunyuan_rest',
    providerName: 'Hunyuan REST',
    capability: 'pose_standardization',
    sourceStatus: 'Verified end-to-end',
    exposure: 'planned',
    notes: 'Image to A/T-pose standardization. Separate REST subtool.',
  },
  {
    providerId: 'hunyuan_rest',
    providerName: 'Hunyuan REST',
    capability: 'motion_retarget v1',
    sourceStatus: 'Verified end-to-end',
    exposure: 'planned',
    notes: 'Built-in integer motion types 9-16; input requires rigged humanoid FBX.',
  },
  {
    providerId: 'hunyuan_rest',
    providerName: 'Hunyuan REST',
    capability: 'auto_rigging',
    sourceStatus: 'Endpoint reachable, not fully verified',
    exposure: 'experimental',
    notes: 'Do not expose as a default mode until end-to-end output is verified.',
  },
  {
    providerId: 'hunyuan_rest',
    providerName: 'Hunyuan REST',
    capability: 'motion_retarget_v2',
    sourceStatus: 'Blocked by unknown literal list',
    exposure: 'blocked',
    notes: 'Endpoint may return 200 while falling back to default motion.',
  },
];

export const MOCK_RESULTS: readonly BenchmarkResultSummary[] = [
  {
    id: 'm1-meshy-text-prop',
    providerId: 'meshy',
    providerName: 'Meshy',
    mode: 'text',
    prompt: 'stylized low-poly treasure chest with brass trim',
    promptCategory: 'prop',
    status: 'mock',
    artifactKind: 'glb',
    quotaConsumed: false,
    quality: {
      geometry: null,
      topology: null,
      texture: null,
      pbr: null,
      prompt_fidelity: null,
      total: null,
    },
    notes: 'Placeholder row for M1 shell. No cache file or provider response is read.',
  },
  {
    id: 'm1-hunyuan-workflow-views-character',
    providerId: 'hunyuan_workflow',
    providerName: 'Hunyuan workflow',
    mode: 'views',
    prompt: 'humanoid game character generated from front, side, and back references',
    promptCategory: 'character',
    status: 'mock',
    artifactKind: 'glb',
    quotaConsumed: false,
    quality: {
      geometry: null,
      topology: null,
      texture: null,
      pbr: null,
      prompt_fidelity: null,
      total: null,
    },
    notes: 'Placeholder row to reserve Hunyuan named-view semantics for later milestones.',
  },
];

export function getProviderStatus(now = new Date()): ProviderStatusResult {
  return {
    ok: true,
    mode: 'static-m1',
    quotaSafe: true,
    generatedAt: now.toISOString(),
    rubric: QUALITY_RUBRIC,
    capabilities: CAPABILITIES,
  };
}

export function listResults(args: ListResultsArgs = {}): ListResultsResult {
  const provider = args.provider ?? 'all';
  const promptCategory = args.promptCategory ?? 'all';
  const results = MOCK_RESULTS.filter((result) => {
    if (provider !== 'all' && result.providerId !== provider) return false;
    if (promptCategory !== 'all' && result.promptCategory !== promptCategory) return false;
    return true;
  });

  return {
    ok: true,
    mode: 'static-m1',
    quotaSafe: true,
    results,
  };
}

export function generateMeshyTextMock(args: MeshyTextMockArgs): MeshyTextMockResult {
  const prompt = args.prompt.trim();
  if (!prompt) {
    throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  }

  const promptCategory = args.promptCategory ?? 'prop';
  const enablePbr = args.enablePbr ?? true;
  const targetPolycount = clampTargetPolycount(args.targetPolycount ?? 30000);
  const cacheKey = makeStableKey({ prompt, promptCategory, enablePbr, targetPolycount });

  return {
    ok: true,
    mode: 'static-m2',
    quotaSafe: true,
    cacheKey,
    providerId: 'meshy',
    artifact: {
      mocked: true,
      format: 'glb',
      uri: null,
    },
    result: {
      id: cacheKey,
      providerId: 'meshy',
      providerName: 'Meshy',
      mode: 'text',
      prompt,
      promptCategory,
      status: 'mock',
      artifactKind: 'glb',
      quotaConsumed: false,
      quality: {
        geometry: null,
        topology: null,
        texture: null,
        pbr: enablePbr ? null : null,
        prompt_fidelity: null,
        total: null,
      },
      notes: `Deterministic M2 Meshy text mock; target_polycount=${targetPolycount}; pbr=${enablePbr ? 'on' : 'off'}.`,
    },
  };
}

function clampTargetPolycount(value: number): number {
  if (!Number.isFinite(value)) return 30000;
  return Math.min(300000, Math.max(1000, Math.round(value)));
}

function makeStableKey(input: Record<string, string | number | boolean>): string {
  const normalized = Object.keys(input)
    .sort()
    .map((key) => `${key}:${String(input[key])}`)
    .join('|');
  return `mock-meshy-text-${fnv1a(normalized)}`;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
