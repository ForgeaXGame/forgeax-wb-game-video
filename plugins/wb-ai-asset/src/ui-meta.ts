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
    label: '文生',
    icon: '✏️',
    hint: '用一句描述生成低模小物件，例如「a wooden barrel」。',
  },
  image: {
    toolId: 'aiasset:image-to-3d',
    label: '图生',
    icon: '🖼️',
    hint: '从一张参考图生成低模。本地图请先上传换取可访问 URL。',
  },
  views: {
    toolId: 'aiasset:multi-image-to-3d',
    label: '多视角',
    icon: '🎞️',
    hint: '用 1–4 张不同角度的同一物体图，轮廓更准。',
  },
};

export const PRIMARY_MODES: PrimaryMode[] = ['text', 'image', 'views'];
