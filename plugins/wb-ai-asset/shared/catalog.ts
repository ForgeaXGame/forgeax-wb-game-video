// Provider capability catalog + ProviderResult contract (Meshy-only).
//
// catalog = static, source-derived planning data (which Meshy capability is safe
// to expose). Pure data + pure functions; no filesystem, no network. Persistence
// orchestration lives in server/. wb-ai-asset is a single-provider (Meshy)
// plugin focused on small low-poly props.

export type Exposure = 'planned' | 'mock-first' | 'experimental' | 'hidden' | 'blocked';

import type {
  FileFormat,
  FileRole,
  GenerationMode,
  ProviderId,
  TextureKind,
} from './manifest';

export interface ProviderCapability {
  providerId: ProviderId;
  providerName: string;
  capability: string;
  sourceStatus: string;
  exposure: Exposure;
  notes: string;
}

export type PromptCategory = 'character' | 'prop' | 'scene';

// ProviderResult — the pure output of a provider adapter. A provider knows
// nothing about cache or asset-store (decoupling). It returns the bytes (already
// downloaded from any provider URL) plus role/format so the handler can persist
// them. `sourceJobId` is audit-only, never a stored asset reference.
export interface ProviderResultFile {
  role: FileRole;
  format: FileFormat;
  data: Uint8Array;
  // For role='texture': which PBR map this is (base_color/metallic/…), so the
  // store can persist each map as a distinct sidefile. Undefined otherwise.
  textureKind?: TextureKind;
}

export interface ProviderResult {
  provider: ProviderId;
  mode: GenerationMode;
  providerMode: 'mock' | 'real';
  sourceJobId: string | null;
  prompt: string | null;
  files: ProviderResultFile[];
}

export interface MeshyTextMockArgs {
  prompt: string;
  promptCategory?: PromptCategory;
  enablePbr?: boolean;
  targetPolycount?: number;
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
    capability: 'text → 3D (low-poly)',
    sourceStatus: 'Meshy OpenAPI v2 text-to-3d, model_type=lowpoly',
    exposure: 'mock-first',
    notes: 'Two-stage preview→refine. Cache-first; real calls gated by AIASSET_ENABLE_REAL_PROVIDERS + MESHY_API_KEY.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'image → 3D (low-poly)',
    sourceStatus: 'Meshy OpenAPI v1 image-to-3d, model_type=lowpoly',
    exposure: 'mock-first',
    notes: 'Single reference image. Local images are COS-hosted first so Meshy can fetch them by URL.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'multi-image → 3D',
    sourceStatus: 'Meshy OpenAPI v1 multi-image-to-3d',
    exposure: 'mock-first',
    notes: 'Up to 4 view URLs. Better silhouette fidelity than a single image.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'refine (texture)',
    sourceStatus: 'Meshy OpenAPI v2 text-to-3d mode=refine',
    exposure: 'mock-first',
    notes: 'Second stage that textures a prior preview task. Optional PBR + texture prompt.',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'remesh (polycount / topology)',
    sourceStatus: 'Meshy OpenAPI v1 remesh',
    exposure: 'mock-first',
    notes: 'Post-process an existing mesh to a target polycount + topology (LOD / decimation).',
  },
  {
    providerId: 'meshy',
    providerName: 'Meshy',
    capability: 'retexture (PBR re-style)',
    sourceStatus: 'Meshy OpenAPI v1 retexture',
    exposure: 'mock-first',
    notes: 'Re-skin an existing mesh from a text/image style with optional PBR maps.',
  },
];

export function clampTargetPolycount(value: number): number {
  if (!Number.isFinite(value)) return 6000;
  return Math.min(300000, Math.max(100, Math.round(value)));
}

// Cache key = stable hash of (provider, mode, normalized inputs). "provider-mode
// + sorted non-empty payload" dedup. Same inputs → same key → cache hit (no
// re-burn of quota).
export function makeCacheKey(
  provider: ProviderId,
  mode: GenerationMode,
  payload: Record<string, string | number | boolean>,
): string {
  const normalized = Object.keys(payload)
    .filter((key) => payload[key] !== '' && payload[key] !== undefined)
    .sort()
    .map((key) => `${key}:${String(payload[key])}`)
    .join('|');
  return `${provider}-${mode}-${fnv1a(`${provider}|${mode}|${normalized}`)}`;
}

// Deterministic no-quota Meshy mock. Produces a ProviderResult with a small
// placeholder GLB byte buffer + a preview image so the handler can exercise the
// full persistence path (blob → manifest) without any remote call.
export function generateMeshyTextMockResult(args: MeshyTextMockArgs): {
  cacheKey: string;
  result: ProviderResult;
} {
  const prompt = args.prompt.trim();
  if (!prompt) {
    throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  }
  const promptCategory = args.promptCategory ?? 'prop';
  const enablePbr = args.enablePbr ?? true;
  const targetPolycount = clampTargetPolycount(args.targetPolycount ?? 6000);
  const cacheKey = makeCacheKey('meshy', 'text', {
    prompt,
    promptCategory,
    enablePbr,
    targetPolycount,
  });

  return {
    cacheKey,
    result: {
      provider: 'meshy',
      mode: 'text',
      providerMode: 'mock',
      sourceJobId: `mock-${cacheKey}`,
      prompt,
      files: [
        { role: 'source_mesh', format: 'glb', data: mockGlbBytes(cacheKey) },
        { role: 'preview_image', format: 'png', data: MOCK_PNG_BYTES },
      ],
    },
  };
}

// Minimal valid-ish GLB header (magic "glTF" + version 2) padded with a
// deterministic tail. Not a renderable model — a stand-in byte payload so the
// store/manifest path runs end-to-end without a provider call.
function mockGlbBytes(seed: string): Uint8Array {
  const header = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
  const tail = new TextEncoder().encode(`mock-glb:${seed}`);
  const out = new Uint8Array(header.length + tail.length);
  out.set(header, 0);
  out.set(tail, header.length);
  return out;
}

// 1x1 transparent PNG.
const MOCK_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
