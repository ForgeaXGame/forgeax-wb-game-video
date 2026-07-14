// exportPlayableCharacter — merge + cook + write delivery trio (PLAN §5.5–§5.7).
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  cookExternalAssetMeta,
  type ExternalAssetMeta,
} from '@forgeax-extension/external-asset-meta';
import {
  effectiveSlots,
  gameProfileFromPreset,
  type GameMotionProfile,
  type MotionSlotDef,
  type RootMotionStrategy,
} from '../shared/playable-profile';
import { motionRefKey, type Gen3DAssetManifest } from '../shared/manifest';
import type { PerGameAssetStore } from './per-game-store';
import { mergePlayableCharacter, resolveExportSlots } from './merge-playable-character';
import { playableDeliveryLocalUrl } from '../shared/playable-preview-url';

export interface PlayableClipDelivery {
  guid: string;
  sourceIndex: number;
  loop: boolean;
  speed: number;
  rootMotion: RootMotionStrategy;
}

export interface PlayableDeliveryJson {
  schemaVersion: 1;
  kind: 'playable-character-delivery';
  sourceAssetPath: string;
  modelPath: string;
  profileId: string;
  profileVersion: number;
  sceneGuid: string;
  clips: Record<string, PlayableClipDelivery>;
}

export type ExportPlayableResult =
  | {
      ok: true;
      firstExport: boolean;
      modelPath: string;
      metaPath: string;
      playablePath: string;
      localUrl: string;
      clipCount: number;
      reusedGuidCount: number;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      missingSlots?: string[];
      retryable: boolean;
    };

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function mappingFingerprint(
  slots: readonly MotionSlotDef[],
  mappings: readonly { slotId: string; motionRefKey: string | null }[],
  profileId: string,
  profileVersion: number,
): string {
  const map = Object.fromEntries(mappings.map((m) => [m.slotId, m.motionRefKey]));
  const body = {
    profileId,
    profileVersion,
    slots: slots.map((s) => ({
      id: s.slotId,
      required: s.required,
      rootMotion: s.rootMotion,
      speed: s.speed,
      playbackMode: s.playbackMode,
      motion: map[s.slotId] ?? null,
    })),
  };
  return sha256Hex(new TextEncoder().encode(JSON.stringify(body)));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stemFromAssetPath(assetPath: string): string {
  const base = assetPath.split('/').pop() ?? 'character.glb';
  return base.replace(/\.glb$/i, '') || 'character';
}

export async function exportPlayableCharacter(
  store: PerGameAssetStore,
  args: { slug: string; assetPath: string; forceWizardConfirm?: boolean },
): Promise<ExportPlayableResult> {
  const { slug, assetPath } = args;
  const manifest = await store.getAsset(slug, assetPath);
  if (!manifest) {
    return { ok: false, code: 'asset_not_found', message: 'Character asset not found.', retryable: false };
  }
  if (manifest.assetSlot !== 'characters') {
    return {
      ok: false,
      code: 'not_a_character',
      message: 'Export Playable Character is only for characters (ROLE1).',
      retryable: false,
    };
  }
  if (!manifest.readiness.rigged) {
    return {
      ok: false,
      code: 'not_rigged',
      message: 'Character is not rigged yet — finish auto-rig before export.',
      retryable: false,
    };
  }

  const gameProfileStored = await store.getGameMotionProfile(slug);
  const gameProfile: GameMotionProfile =
    gameProfileStored ?? gameProfileFromPreset('basic-character-v1', new Date(0).toISOString());
  const state = await store.getCharacterPlayableState(slug, assetPath);
  const override = state?.override ?? null;
  const mapping = state?.mapping ?? null;
  if (!mapping || !mapping.confirmed) {
    return {
      ok: false,
      code: 'mapping_not_confirmed',
      message: 'Motion mapping is not confirmed yet — open the export wizard and confirm slots.',
      retryable: false,
    };
  }

  const slots = effectiveSlots(gameProfile, override);
  const resolved = resolveExportSlots({
    slots,
    mappings: mapping.mappings,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
      missingSlots: resolved.missingSlots,
      retryable: false,
    };
  }

  const rigged = await store.readAssetFile(slug, assetPath, 'rigged_model', 'glb');
  if (!rigged) {
    return {
      ok: false,
      code: 'missing_rigged_glb',
      message: 'No rigged_model.glb dependency found for this character.',
      retryable: false,
    };
  }

  // Index animated_model files by motionRefKey.
  const motionFiles = manifest.files.filter((f) => f.role === 'animated_model' && f.format === 'glb' && f.motionRef);
  const byKey = new Map<string, (typeof motionFiles)[number]>();
  for (const f of motionFiles) {
    if (f.motionRef) byKey.set(motionRefKey(f.motionRef), f);
  }

  const mergeSlots: { slotId: string; motionGlbBytes: Uint8Array; rootMotion: RootMotionStrategy }[] = [];
  for (const slotId of resolved.exportSlotIds) {
    const key = resolved.mappingBySlot.get(slotId)!;
    const file = byKey.get(key);
    if (!file) {
      return {
        ok: false,
        code: 'motion_file_missing',
        message: `Mapped motion ${key} for slot ${slotId} is not on disk.`,
        missingSlots: [slotId],
        retryable: false,
      };
    }
    const { data } = await readSpecificFile(store, slug, file.storageKey);
    if (!data) {
      return {
        ok: false,
        code: 'motion_file_missing',
        message: `Cannot read motion file for slot ${slotId} (${file.storageKey}).`,
        missingSlots: [slotId],
        retryable: true,
      };
    }
    const slotDef = slots.find((s) => s.slotId === slotId)!;
    mergeSlots.push({ slotId, motionGlbBytes: data, rootMotion: slotDef.rootMotion });
  }

  const merged = await mergePlayableCharacter({
    baseRiggedGlbBytes: rigged.data,
    slots: mergeSlots,
  });
  if (!merged.ok) {
    return { ok: false, code: merged.code, message: merged.message, retryable: true };
  }

  const stem = stemFromAssetPath(assetPath);
  const modelRel = `assets/characters/${stem}-merged.glb`;
  const metaRel = `${modelRel}.meta.json`;
  const playableRel = `${modelRel}.playable.json`;
  const glbAbs = store.resolveGameRelPath(slug, modelRel);
  const metaAbs = store.resolveGameRelPath(slug, metaRel);
  const playableAbs = store.resolveGameRelPath(slug, playableRel);

  let existingMeta: ExternalAssetMeta | null = null;
  let slotGuidRegistry: Record<string, string> = {};
  const sidecarState = await readDeliverySnapshot(store, slug, assetPath);
  if (sidecarState?.slotGuidRegistry) slotGuidRegistry = { ...sidecarState.slotGuidRegistry };
  if (await exists(metaAbs)) {
    try {
      existingMeta = JSON.parse(await readFile(metaAbs, 'utf8')) as ExternalAssetMeta;
      if (existingMeta.kind !== 'external-asset-package') existingMeta = null;
    } catch {
      existingMeta = null;
    }
  }
  const firstExport = !(await exists(glbAbs)) || !sidecarState;

  const contentHash = `sha256:${sha256Hex(merged.bytes)}`;
  const cooked = await cookExternalAssetMeta(merged.bytes, contentHash, `${stem}-merged.glb`, {
    existingMeta,
    animationSlotKeys: resolved.exportSlotIds,
    slotGuidRegistry,
  });
  if (!cooked.ok) {
    return { ok: false, code: cooked.code, message: cooked.message, retryable: true };
  }

  const scene = cooked.meta.subAssets.find((s) => s.kind === 'scene');
  const clipsMeta = cooked.meta.subAssets.filter((s) => s.kind === 'animation-clip');
  const clips: PlayableDeliveryJson['clips'] = {};
  const nextRegistry: Record<string, string> = { ...slotGuidRegistry };
  let reusedGuidCount = 0;
  for (let i = 0; i < resolved.exportSlotIds.length; i++) {
    const slotId = resolved.exportSlotIds[i]!;
    const slotDef = slots.find((s) => s.slotId === slotId)!;
    const clipSub = clipsMeta.find((c) => c.sourceIndex === i) ?? clipsMeta[i];
    if (!clipSub) {
      return {
        ok: false,
        code: 'cook_clip_mismatch',
        message: `Cooked meta missing animation-clip for slot ${slotId}`,
        retryable: true,
      };
    }
    if (slotGuidRegistry[slotId] && slotGuidRegistry[slotId] === clipSub.guid) reusedGuidCount += 1;
    nextRegistry[slotId] = clipSub.guid;
    clips[slotId] = {
      guid: clipSub.guid,
      sourceIndex: clipSub.sourceIndex,
      loop: slotDef.playbackMode === 'loop',
      speed: slotDef.speed,
      rootMotion: slotDef.rootMotion,
    };
  }

  const playable: PlayableDeliveryJson = {
    schemaVersion: 1,
    kind: 'playable-character-delivery',
    sourceAssetPath: assetPath,
    modelPath: modelRel,
    profileId: override?.basedOnProfileId ?? gameProfile.profileId,
    profileVersion: override?.basedOnProfileVersion ?? gameProfile.profileVersion,
    sceneGuid: scene?.guid ?? '',
    clips,
  };

  // Atomic write: temp → validate → rename (PLAN §5.7).
  await mkdir(dirname(glbAbs), { recursive: true });
  const tmpGlb = `${glbAbs}.__export_tmp`;
  const tmpMeta = `${metaAbs}.__export_tmp`;
  const tmpPlayable = `${playableAbs}.__export_tmp`;
  try {
    await writeFile(tmpGlb, merged.bytes);
    await writeFile(tmpMeta, `${JSON.stringify(cooked.meta, null, 2)}\n`, 'utf8');
    await writeFile(tmpPlayable, `${JSON.stringify(playable, null, 2)}\n`, 'utf8');
    // Basic validate temps exist + playable schema kind
    const check = JSON.parse(await readFile(tmpPlayable, 'utf8')) as PlayableDeliveryJson;
    if (check.kind !== 'playable-character-delivery') {
      throw new Error('playable.json kind mismatch');
    }
    await rename(tmpGlb, glbAbs);
    await rename(tmpMeta, metaAbs);
    await rename(tmpPlayable, playableAbs);
  } catch (err) {
    await rm(tmpGlb, { force: true }).catch(() => undefined);
    await rm(tmpMeta, { force: true }).catch(() => undefined);
    await rm(tmpPlayable, { force: true }).catch(() => undefined);
    return {
      ok: false,
      code: 'write_failed',
      message: err instanceof Error ? err.message : 'Failed to write playable delivery trio',
      retryable: true,
    };
  }

  const fp = mappingFingerprint(slots, mapping.mappings, playable.profileId, playable.profileVersion);
  await store.updatePlayableDeliverySnapshot(slug, assetPath, {
    modelPath: modelRel,
    playablePath: playableRel,
    profileId: playable.profileId,
    profileVersion: playable.profileVersion,
    clipSlotIds: resolved.exportSlotIds,
    slotGuidRegistry: nextRegistry,
    mappingFingerprint: fp,
    exportedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    firstExport,
    modelPath: modelRel,
    metaPath: metaRel,
    playablePath: playableRel,
    localUrl: playableDeliveryLocalUrl(slug, modelRel),
    clipCount: resolved.exportSlotIds.length,
    reusedGuidCount,
    message:
      'Playable character exported to Edit asset catalog. This does not auto-replace the game protagonist or modify gameplay code.',
  };
}

async function readSpecificFile(
  store: PerGameAssetStore,
  slug: string,
  storageKey: string,
): Promise<{ data: Uint8Array | null }> {
  // storageKey like assets/3d/characters/hero.animated_model.motion-meshy-1.glb
  const abs = store.resolveGameRelPath(slug, storageKey);
  try {
    const data = new Uint8Array(await readFile(abs));
    return { data };
  } catch {
    return { data: null };
  }
}

async function readDeliverySnapshot(
  store: PerGameAssetStore,
  slug: string,
  assetPath: string,
): Promise<NonNullable<Gen3DAssetManifest extends never ? never : import('../shared/manifest').AssetSidecar['custom']['playableDelivery']> | null> {
  // Re-read via getAsset is insufficient (snapshot not on manifest). Use sidecar through resolveAssetFiles.
  const resolved = store.resolveAssetFiles(slug, assetPath);
  if (!resolved) return null;
  try {
    const raw = await readFile(resolved.sidecarAbs, 'utf8');
    const sidecar = JSON.parse(raw) as { custom?: { playableDelivery?: { modelPath: string; playablePath: string; profileId: string; profileVersion: number; slotGuidRegistry: Record<string, string>; mappingFingerprint: string; exportedAt: string } } };
    return sidecar.custom?.playableDelivery ?? null;
  } catch {
    return null;
  }
}
