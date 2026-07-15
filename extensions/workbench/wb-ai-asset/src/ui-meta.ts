import type { PrimaryMode } from '@/types';

export interface ModeMeta {
  toolId: string;
  label: string;
  icon: string;
  hint: string;
}

export const primaryModeMeta: Record<PrimaryMode, ModeMeta> = {
  text: {
    toolId: 'aiasset:text-to-3d',
    label: 'meta.text.label',
    icon: '✏️',
    hint: 'meta.text.hint',
  },
  image: {
    toolId: 'aiasset:image-to-3d',
    label: 'meta.image.label',
    icon: '🖼️',
    hint: 'meta.image.hint',
  },
  views: {
    toolId: 'aiasset:multi-image-to-3d',
    label: 'meta.views.label',
    icon: '🎞️',
    hint: 'meta.views.hint',
  },
};

export const PRIMARY_MODES: PrimaryMode[] = ['text', 'image', 'views'];
