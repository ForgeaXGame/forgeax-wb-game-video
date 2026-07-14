// Single icon + label vocabulary for the wb-gen3d editor surface. One semantic
// glyph per action, reused across step / CTA / empty / toast / library so the
// same action always reads the same (EDITOR_UI_PATTERN §8). All glyphs are
// lucide-react linear icons; color comes from the parent via currentColor.
import {
  Type,
  Image as ImageIcon,
  Images,
  PersonStanding,
  WandSparkles,
  Brush,
  Library,
  RefreshCw,
  Gauge,
  Share2,
  Trash2,
  Upload,
  ShieldAlert,
  ShieldCheck,
  Bone,
  Play,
  Shrink,
  SlidersHorizontal,
  Search,
  PackageCheck,
} from 'lucide-react';
import type { GenProvider, Mode } from './types';
import type { AssetSlot, MotionType } from '@shared/manifest';

export const EDITOR_ICON_MAP = {
  text: Type,
  image: ImageIcon,
  views: Images,
  pose: PersonStanding,
  generate: WandSparkles,
  refine: Brush,
  library: Library,
  refresh: RefreshCw,
  quality: Gauge,
  handoff: Share2,
  delete: Trash2,
  upload: Upload,
  real: ShieldAlert,
  quota: ShieldCheck,
  rig: Bone,
  motion: Play,
  lowpoly: Shrink,
  params: SlidersHorizontal,
  search: Search,
  importGame: PackageCheck,
} as const;

export const modeMeta: Record<Mode, { toolId: string; label: string; icon: typeof Type }> = {
  text: { toolId: 'gen3d:text-to-3d', label: 'mode.text', icon: EDITOR_ICON_MAP.text },
  image: { toolId: 'gen3d:image-to-3d', label: 'mode.image', icon: EDITOR_ICON_MAP.image },
  views: { toolId: 'gen3d:views-to-3d', label: 'mode.views', icon: EDITOR_ICON_MAP.views },
};

export const providerMeta: Record<GenProvider, { label: string }> = {
  hunyuan_workflow: { label: 'provider.hunyuan' },
  meshy: { label: 'provider.meshy' },
  rodin: { label: 'provider.rodin' },
};

// Asset slot the generation writes into (assets/3d/<slot>/). characters can be
// auto-rigged + animated; meshes are static props/environment. The slot is part
// of the cacheKey, so switching it generates a fresh asset rather than a hit.
export const ASSET_SLOTS: AssetSlot[] = ['characters', 'meshes'];

export const assetSlotMeta: Record<AssetSlot, { label: string }> = {
  characters: { label: 'slot.characters' },
  meshes: { label: 'slot.meshes' },
};

// Polycount is exposed as three discrete tiers (low/mid/high) instead of a
// continuous number — Rodin's quality_override is effectively quantized anyway,
// and Meshy/Hunyuan's exact face counts are noise to most users. Each provider
// maps a tier to its own face count (the kept numbers are real targets; the
// Rodin numbers are display-reference values for its quality_override).
export type PolycountTier = 'low' | 'mid' | 'high';

export const POLYCOUNT_TIERS: PolycountTier[] = ['low', 'mid', 'high'];

export const polycountTierMeta: Record<PolycountTier, { label: string }> = {
  low: { label: 'tier.low' },
  mid: { label: 'tier.mid' },
  high: { label: 'tier.high' },
};

const TIER_FACE_COUNTS: Record<GenProvider, Record<PolycountTier, number>> = {
  meshy: { low: 8000, mid: 30000, high: 100000 },
  hunyuan_workflow: { low: 10000, mid: 40000, high: 120000 },
  rodin: { low: 8000, mid: 18000, high: 50000 },
};

export function tierToFaceCount(provider: GenProvider, tier: PolycountTier): number {
  return TIER_FACE_COUNTS[provider][tier];
}

// Hunyuan motion_retarget v1 fixed motions (int 9–16). Label = the action; hint =
// the game application example. Source: PLAN-2026-06-12 §③ motion mapping table.
// Order is the table order; this is the single source for the apply-motion UI.
export const MOTION_TYPES: readonly MotionType[] = [9, 10, 11, 12, 13, 14, 15, 16];

export const motionMeta: Record<MotionType, { label: string; hint: string }> = {
  9: { label: 'motion.9.label', hint: 'motion.9.hint' },
  10: { label: 'motion.10.label', hint: 'motion.10.hint' },
  11: { label: 'motion.11.label', hint: 'motion.11.hint' },
  12: { label: 'motion.12.label', hint: 'motion.12.hint' },
  13: { label: 'motion.13.label', hint: 'motion.13.hint' },
  14: { label: 'motion.14.label', hint: 'motion.14.hint' },
  15: { label: 'motion.15.label', hint: 'motion.15.hint' },
  16: { label: 'motion.16.label', hint: 'motion.16.hint' },
};
