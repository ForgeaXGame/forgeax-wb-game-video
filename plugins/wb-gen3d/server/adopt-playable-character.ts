// ADOPT1 — take over an existing hand-made merged.glb + engine meta that is not
// yet bound to this gen3d source asset (PLAN §4.4 / §5.3).
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExternalAssetMeta } from '@forgeax-plugin/external-asset-meta';
import {
  effectiveSlots,
  gameProfileFromPreset,
  type GameMotionProfile,
  type RootMotionStrategy,
} from '../shared/playable-profile';
import type { PlayableDeliverySnapshot } from '../shared/manifest';
import type { PerGameAssetStore } from './per-game-store';
import {
  mappingFingerprint,
  type PlayableClipDelivery,
  type PlayableDeliveryJson,
} from './export-playable-character';
import { playableDeliveryLocalUrl } from '../shared/playable-preview-url';

export interface AdoptClipInfo {
  name: string;
  guid: string;
  sourceIndex: number;
}

export interface AdoptCandidate {
  modelPath: string;
  metaPath: string;
  playablePath: string;
  localUrl: string;
  clips: AdoptClipInfo[];
}

export type AdoptPlayableResult =
  | {
      ok: true;
      modelPath: string;
      playablePath: string;
      localUrl: string;
      reusedGuidCount: number;
      clipCount: number;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    };

export interface AdoptSlotMapping {
  slotId: string;
  /** Prefer matching by clip name (animation-clip.name in engine meta). */
  clipName?: string | null;
  /** Fallback: engine meta sourceIndex. */
  sourceIndex?: number | null;
  guid?: string | null;
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

function localUrlFor(slug: string, modelRel: string): string {
  return playableDeliveryLocalUrl(slug, modelRel);
}

export async function inspectAdoptCandidate(
  store: PerGameAssetStore,
  slug: string,
  assetPath: string,
): Promise<AdoptCandidate | null> {
  const state = await store.getCharacterPlayableState(slug, assetPath);
  if (state?.delivery) return null;

  const stem = stemFromAssetPath(assetPath);
  const modelRel = `assets/characters/${stem}-merged.glb`;
  const metaRel = `${modelRel}.meta.json`;
  const playableRel = `${modelRel}.playable.json`;
  const glbAbs = store.resolveGameRelPath(slug, modelRel);
  const metaAbs = store.resolveGameRelPath(slug, metaRel);
  if (!(await exists(glbAbs)) || !(await exists(metaAbs))) return null;

  let meta: ExternalAssetMeta;
  try {
    meta = JSON.parse(await readFile(metaAbs, 'utf8')) as ExternalAssetMeta;
  } catch {
    return null;
  }
  if (meta.kind !== 'external-asset-package') return null;

  const clips = meta.subAssets
    .filter((s) => s.kind === 'animation-clip')
    .map((s) => ({
      name: s.name?.trim() || `clip_${s.sourceIndex}`,
      guid: s.guid,
      sourceIndex: s.sourceIndex,
    }))
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
  if (clips.length === 0) return null;

  return {
    modelPath: modelRel,
    metaPath: metaRel,
    playablePath: playableRel,
    localUrl: localUrlFor(slug, modelRel),
    clips,
  };
}

function resolveClip(
  clips: AdoptClipInfo[],
  mapping: AdoptSlotMapping,
): AdoptClipInfo | null {
  if (mapping.guid) {
    const byGuid = clips.find((c) => c.guid === mapping.guid);
    if (byGuid) return byGuid;
  }
  if (mapping.clipName) {
    const want = mapping.clipName.toLowerCase();
    const byName = clips.find((c) => c.name.toLowerCase() === want);
    if (byName) return byName;
  }
  if (typeof mapping.sourceIndex === 'number') {
    return clips.find((c) => c.sourceIndex === mapping.sourceIndex) ?? null;
  }
  return null;
}

export async function adoptPlayableCharacter(
  store: PerGameAssetStore,
  args: {
    slug: string;
    assetPath: string;
    slotMappings: AdoptSlotMapping[];
    confirmed?: boolean;
  },
): Promise<AdoptPlayableResult> {
  const { slug, assetPath } = args;
  if (!args.confirmed) {
    return {
      ok: false,
      code: 'not_confirmed',
      message: 'Confirm slot → clip mappings before adopting (ADOPT1).',
      retryable: false,
    };
  }

  const manifest = await store.getAsset(slug, assetPath);
  if (!manifest) {
    return { ok: false, code: 'asset_not_found', message: 'Character asset not found.', retryable: false };
  }
  if (manifest.assetSlot !== 'characters') {
    return {
      ok: false,
      code: 'not_a_character',
      message: 'Adopt Playable Character is only for characters (ROLE1).',
      retryable: false,
    };
  }

  const candidate = await inspectAdoptCandidate(store, slug, assetPath);
  if (!candidate) {
    return {
      ok: false,
      code: 'nothing_to_adopt',
      message:
        'No orphan merged.glb + engine meta found (or this source already has a delivery snapshot).',
      retryable: false,
    };
  }

  const gameProfileStored = await store.getGameMotionProfile(slug);
  const gameProfile: GameMotionProfile =
    gameProfileStored ?? gameProfileFromPreset('basic-character-v1', new Date(0).toISOString());
  const state = await store.getCharacterPlayableState(slug, assetPath);
  const override = state?.override ?? null;
  const slots = effectiveSlots(gameProfile, override);
  const required = slots.filter((s) => s.required);
  if (required.length === 0) {
    return {
      ok: false,
      code: 'no_required_slots',
      message: 'Effective profile has no required slots — set a playable profile first.',
      retryable: false,
    };
  }

  const mappingBySlot = new Map(args.slotMappings.map((m) => [m.slotId, m]));
  const clips: PlayableDeliveryJson['clips'] = {};
  const nextRegistry: Record<string, string> = {};
  let reusedGuidCount = 0;
  const missing: string[] = [];

  for (const slot of slots) {
    const m = mappingBySlot.get(slot.slotId);
    if (!m) {
      if (slot.required) missing.push(slot.slotId);
      continue;
    }
    const clip = resolveClip(candidate.clips, m);
    if (!clip) {
      if (slot.required) missing.push(slot.slotId);
      continue;
    }
    nextRegistry[slot.slotId] = clip.guid;
    reusedGuidCount += 1;
    const deliveryClip: PlayableClipDelivery = {
      guid: clip.guid,
      sourceIndex: clip.sourceIndex,
      loop: slot.playbackMode === 'loop',
      speed: slot.speed,
      rootMotion: slot.rootMotion as RootMotionStrategy,
    };
    clips[slot.slotId] = deliveryClip;
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'missing_required_slots',
      message: `Required slots not mapped to existing clips: ${missing.join(', ')}`,
      retryable: false,
    };
  }

  const profileId = override?.basedOnProfileId ?? gameProfile.profileId;
  const profileVersion = override?.basedOnProfileVersion ?? gameProfile.profileVersion;
  const playable: PlayableDeliveryJson = {
    schemaVersion: 1,
    kind: 'playable-character-delivery',
    sourceAssetPath: assetPath,
    modelPath: candidate.modelPath,
    profileId,
    profileVersion,
    sceneGuid:
      (
        JSON.parse(
          await readFile(store.resolveGameRelPath(slug, candidate.metaPath), 'utf8'),
        ) as ExternalAssetMeta
      ).subAssets.find((s) => s.kind === 'scene')?.guid ?? '',
    clips,
  };

  const playableAbs = store.resolveGameRelPath(slug, candidate.playablePath);
  await mkdir(dirname(playableAbs), { recursive: true });
  await writeFile(playableAbs, `${JSON.stringify(playable, null, 2)}\n`, 'utf8');

  const exportSlotIds = Object.keys(clips);
  // Adopted delivery has no source motion mapping yet — fingerprint uses null
  // motion refs so one-click stays off until the user confirms a real mapping.
  const fp = mappingFingerprint(
    slots,
    slots.map((s) => ({ slotId: s.slotId, motionRefKey: null })),
    profileId,
    profileVersion,
  );
  const snapshot: PlayableDeliverySnapshot = {
    modelPath: candidate.modelPath,
    playablePath: candidate.playablePath,
    profileId,
    profileVersion,
    clipSlotIds: exportSlotIds,
    slotGuidRegistry: nextRegistry,
    mappingFingerprint: fp,
    exportedAt: new Date().toISOString(),
  };
  await store.updatePlayableDeliverySnapshot(slug, assetPath, snapshot);

  return {
    ok: true,
    modelPath: candidate.modelPath,
    playablePath: candidate.playablePath,
    localUrl: candidate.localUrl,
    reusedGuidCount,
    clipCount: exportSlotIds.length,
    message:
      'Adopted existing playable character into Edit asset catalog. Gameplay code was not changed.',
  };
}
