// Precise-lowpoly composite pipeline (research §3.1 / 决策①③④, 2026-06-30).
//
// Decoupling "make the shape" from "control the face count": generate a clean
// STANDARD mesh first, then remesh it down to a low-poly TRIANGLE budget, then
// (optionally) retexture the decimated mesh for PBR. This is more reliable for
// "<2000 faces + clean topology" than asking lowpoly mode to one-shot it (lowpoly
// silently ignores target_polycount/topology).
//
//   [1] generate(standard, no PBR)   → clean base geometry (a chainable model url)
//   [2] remesh(target=1500, triangle) → low-poly geometry
//   [3] retexture(PBR, style)         → skin the FINAL low-poly UVs (only if PBR)
//
// The result is tagged with the ORIGINAL mode/prompt so it lists + caches like a
// normal generation but carries the low-poly geometry + full PBR set (captured by
// MeshyProvider.extractGatewayUrls/downloadFiles, Phase 1).
//
// Chaining is by model_url, NOT task id (validated on the live gateway
// 2026-07-03): the gateway's meshy-3d-remesh/retexture routes reject input_task_id
// with "Missing required parameter(s): ['model_url']" (HTTP 500). Each stage's
// ProviderResult.sourceModelUrl is the prior stage's Meshy CDN GLB url, which the
// gateway re-fetches directly (no COS round-trip needed).

import type { ProviderResult } from '../shared/catalog';
import type { MeshyProvider } from './providers/meshy';

// Generation strategy. `precise-lowpoly` runs the 3-stage composite (default);
// `raw` keeps the single-shot generate (lowpoly/standard as requested) for
// callers who want Meshy's direct output without the remesh/retexture chain.
export type Pipeline = 'precise-lowpoly' | 'raw';

export function resolvePipeline(value: string | undefined): Pipeline {
  return value === 'raw' ? 'raw' : 'precise-lowpoly';
}

export interface PreciseLowpolyInput {
  mode: 'text' | 'image' | 'views';
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  // When true, stage [3] retextures the low-poly mesh for PBR.
  enablePbr: boolean;
  // Low-poly triangle budget for stage [2] remesh (default decision: 1500).
  targetPolycount: number;
  // Meshy model version for the standard generate + retexture (e.g. meshy-6).
  aiModel?: string;
  // Allowlisted geometry params for stage [1] (symmetry only; model_type is
  // forced to standard and topology is owned by stage [2] remesh).
  stageOneParams?: Record<string, string | number | boolean>;
}

export async function producePreciseLowpoly(
  provider: MeshyProvider,
  input: PreciseLowpolyInput,
): Promise<ProviderResult> {
  const tag = (r: ProviderResult): ProviderResult => ({
    ...r,
    mode: input.mode,
    prompt: input.prompt ?? null,
  });

  // [1] Clean STANDARD geometry — no PBR yet (the final low-poly mesh is skinned
  // in [3] so textures map to the decimated UVs, not the dense ones).
  const generated = await provider.generate({
    mode: input.mode,
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
    modelType: 'standard',
    aiModel: input.aiModel,
    enablePbr: false,
    params: input.stageOneParams,
  });
  const generatedUrl = generated.sourceModelUrl;
  // No chainable model url (e.g. a mock) → return the standard mesh as-is.
  if (!generatedUrl) return tag(generated);

  // [2] Remesh down to the low-poly triangle budget.
  const remeshed = await provider.remesh({
    modelUrl: generatedUrl,
    targetPolycount: input.targetPolycount,
    topology: 'triangle',
  });
  const remeshedUrl = remeshed.sourceModelUrl;

  // [3] Optional PBR retexture of the low-poly mesh. Style = the original prompt
  // (text) or reference image (image/views). Skipped when PBR is off or no style.
  if (input.enablePbr && remeshedUrl) {
    const style =
      input.mode === 'text'
        ? { textStylePrompt: input.prompt }
        : { imageStyleUrl: input.imageUrl ?? input.imageUrls?.[0] };
    if (style.textStylePrompt || style.imageStyleUrl) {
      const retextured = await provider.retexture({
        modelUrl: remeshedUrl,
        ...style,
        enablePbr: true,
        aiModel: input.aiModel,
      });
      return tag(retextured);
    }
  }
  return tag(remeshed);
}
