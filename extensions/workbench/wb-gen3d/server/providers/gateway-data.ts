// gateway-data.ts — SSOT for parsing the LiteLLM 3D gateway `data[]` output.
//
// Every provider (meshy, hunyuan-workflow, hunyuan-rest) polls the same gateway
// task endpoint, which returns outputs as a `data[]` array of
// { url, type, format } entries. Two shared quirks live here so the three
// providers can't drift:
//
//   1. Meshes are tagged type:'mesh'; the concrete kind is in `format`
//      (glb/fbx/obj/usdz/stl). We key mesh urls by format.
//   2. Every *other* PNG — the rendered thumbnail AND all PBR texture maps —
//      is tagged type:'preview'. Keying the thumbnail off `type` alone let the
//      LAST type:'preview' entry (texture_0_emission.png, a near-black map)
//      overwrite the real render (preview.png), so saved previews came out
//      black (the marketplace #16 gateway regression). Real Meshy filenames:
//        output/preview.png                          → the render (thumbnail)
//        output/texture_0.png                        → base_color
//        output/texture_0_{metallic,roughness,normal,emission}.png → PBR maps
//      So non-mesh images are classified by filename, not the gateway `type`.

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// Flatten a gateway task response's `data[]` into a flat url map:
//   out[<format>]         mesh urls keyed by format (glb/fbx/obj/usdz/stl)
//   out.__thumbnail       the rendered preview image
//   out.__texture_<kind>  texture maps (base_color/metallic/roughness/…)
export function extractGatewayUrls(resp: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const data = resp.data;
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (typeof raw !== 'object' || !raw) continue;
    const item = raw as Record<string, unknown>;
    const url = item.url;
    if (typeof url !== 'string' || !url) continue;
    const type = String(item.type ?? '');
    const format = String(item.format ?? '');

    if (type === 'mesh') {
      if (format) out[format] = url;
      continue;
    }

    // Non-mesh entry: classify by output filename, because the gateway tags the
    // render and every texture map alike as type:'preview'.
    const name = gatewayFileName(url);
    if (/^preview\./i.test(name)) {
      // The real render. Wins over any earlier fallback thumbnail.
      out.__thumbnail = url;
    } else if (/^texture_/i.test(name)) {
      // A PBR texture map — never the thumbnail. base_color feeds the optional
      // texture sidefile; the rest are kept but currently unused downstream.
      out[`__texture_${textureKindFromName(name)}`] = url;
    } else if (type === 'texture') {
      // Defensive: a future gateway that tags textures correctly.
      const kind = String(item.texture_kind ?? format) || 'base_color';
      out[`__texture_${kind}`] = url;
    } else if (!out.__thumbnail && IMAGE_EXT.test(name)) {
      // Fallback for gateways that name the render differently: take the first
      // rendered image. Non-image outputs (e.g. .mtl) are ignored.
      out.__thumbnail = url;
    }
  }
  return out;
}

// Rig-specific URL extraction. The Meshy auto-rig gateway response carries
// FIVE mesh entries per format, and `extractGatewayUrls`' `out[format] = url`
// (last-wins) lets the final `Animation_*_withSkin_armature.glb` (a
// skeleton-only 288-face proxy, no mesh) overwrite `Character_output.glb` (the
// full rigged mesh). That made wb-gen3d store a skeleton-only rigged_model.glb
// → viewport showed 288 faces, mesh invisible. Classify by Meshy output
// filename instead:
//   Character_output.{glb,fbx}                 → the rigged model (mesh+skeleton)
//   Animation_Walking_withSkin.{glb,fbx}       → free walk clip (full mesh+anim)
//   Animation_Running_withSkin.{glb,fbx}       → free run clip (full mesh+anim)
//   *_armature.{glb,fbx}                       → skeleton-only proxies (skipped)
// `extractGatewayUrls` is left untouched for generate/animate, whose responses
// carry one mesh per format and don't need this disambiguation.
export interface RigUrls {
  glb: string | undefined;
  fbx: string | undefined;
  walkGlb: string | undefined;
  walkFbx: string | undefined;
  runGlb: string | undefined;
  runFbx: string | undefined;
}

export function extractRigUrls(resp: Record<string, unknown>): RigUrls {
  const out: RigUrls = {
    glb: undefined,
    fbx: undefined,
    walkGlb: undefined,
    walkFbx: undefined,
    runGlb: undefined,
    runFbx: undefined,
  };
  const data = resp.data;
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (typeof raw !== 'object' || !raw) continue;
    const item = raw as Record<string, unknown>;
    const url = item.url;
    if (typeof url !== 'string' || !url) continue;
    if (String(item.type ?? '') !== 'mesh') continue;
    const format = String(item.format ?? '');
    if (format !== 'glb' && format !== 'fbx') continue;
    const name = gatewayFileName(url);
    const isGlb = format === 'glb';
    if (/^Character_output\./i.test(name)) {
      if (isGlb) out.glb = url;
      else out.fbx = url;
    } else if (/^Animation_Walking_withSkin\./i.test(name)) {
      if (isGlb) out.walkGlb = url;
      else out.walkFbx = url;
    } else if (/^Animation_Running_withSkin\./i.test(name)) {
      if (isGlb) out.runGlb = url;
      else out.runFbx = url;
    }
    // _armature variants and anything else: ignored (skeleton-only, no mesh).
  }
  return out;
}

function gatewayFileName(url: string): string {
  const path = url.split('?', 1)[0] ?? url;
  return path.split('/').pop() ?? '';
}

// texture_0.png → base_color ; texture_0_metallic.png → metallic
function textureKindFromName(name: string): string {
  const stem = name.replace(IMAGE_EXT, '');
  const m = /^texture_\d+(?:_(.+))?$/i.exec(stem);
  if (!m) return 'base_color';
  return m[1] ? m[1].toLowerCase() : 'base_color';
}
