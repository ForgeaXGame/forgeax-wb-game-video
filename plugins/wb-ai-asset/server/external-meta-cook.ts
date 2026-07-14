// Re-export shared cook (PLAN S1). Call sites keep importing from this path.
export {
  cookExternalAssetFields,
  cookExternalAssetMeta,
  normalizeGlbForEngine,
  type CookOptions,
  type CookResult,
  type ExternalAssetMeta,
  type ExternalAssetSubAsset,
  type NormalizeResult,
} from '@forgeax-plugin/external-asset-meta';
