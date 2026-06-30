// Precise-lowpoly composite pipeline (research §3.1 / 决策①③④, 2026-06-30).
//
// Decoupling "make the shape" from "control the face count": generate a clean
// STANDARD mesh first, then remesh it down to a low-poly TRIANGLE budget, then
// (optionally) retexture the decimated mesh for PBR. This is more reliable for
// "<2000 faces + clean topology" than asking lowpoly mode to one-shot it (lowpoly
// silently ignores target_polycount/topology).
//
//   [1] generate(standard, no PBR)   → clean base geometry (a chainable task id)
//   [2] remesh(target=1500, triangle) → low-poly geometry
//   [3] retexture(PBR, style)         → skin the FINAL low-poly UVs (only if PBR)
//
// The result is tagged with the ORIGINAL mode/prompt so it lists + caches like a
// normal generation but carries the low-poly geometry + full PBR set (captured by
// MeshyProvider.extractUrls/downloadFiles, Phase 1).
//
// ⚠️ Real-Meshy validation deferred (PLAN §9): whether a generate task id is a
// valid remesh input — and a remesh task id a valid retexture input — is only
// confirmed in the post-T2 e2e batch. The input_task_id chaining below is the
// SINGLE spot to switch to a COS model_url if live Meshy rejects task-id chaining.

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
  const generatedTaskId = generated.sourceJobId;
  // No chainable task id (e.g. a mock) → return the standard mesh as-is.
  if (!generatedTaskId) return tag(generated);

  // [2] Remesh down to the low-poly triangle budget.
  const remeshed = await provider.remesh({
    inputTaskId: generatedTaskId,
    targetPolycount: input.targetPolycount,
    topology: 'triangle',
  });
  const remeshedTaskId = remeshed.sourceJobId;

  // [3] Optional PBR retexture of the low-poly mesh. Style = the original prompt
  // (text) or reference image (image/views). Skipped when PBR is off or no style.
  if (input.enablePbr && remeshedTaskId) {
    const style =
      input.mode === 'text'
        ? { textStylePrompt: input.prompt }
        : { imageStyleUrl: input.imageUrl ?? input.imageUrls?.[0] };
    if (style.textStylePrompt || style.imageStyleUrl) {
      const retextured = await provider.retexture({
        inputTaskId: remeshedTaskId,
        ...style,
        enablePbr: true,
        aiModel: input.aiModel,
      });
      return tag(retextured);
    }
  }
  return tag(remeshed);
}
