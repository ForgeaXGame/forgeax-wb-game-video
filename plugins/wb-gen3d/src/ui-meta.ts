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
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { GenProvider, Mode } from './types';

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
  real: ShieldAlert,
  quota: ShieldCheck,
} as const;

export const modeMeta: Record<Mode, { toolId: string; label: string; icon: typeof Type }> = {
  text: { toolId: 'gen3d:text-to-3d', label: '文生', icon: EDITOR_ICON_MAP.text },
  image: { toolId: 'gen3d:image-to-3d', label: '图生', icon: EDITOR_ICON_MAP.image },
  views: { toolId: 'gen3d:views-to-3d', label: '多视图', icon: EDITOR_ICON_MAP.views },
};

export const providerMeta: Record<GenProvider, { label: string }> = {
  hunyuan_workflow: { label: '混元 Hunyuan' },
  meshy: { label: 'Meshy' },
};
