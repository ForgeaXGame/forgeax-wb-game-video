import type { Overlay } from '../../runtime/schema/graph-schema'

/** 覆盖物展示名：当前项目目录 title → id（title 与 id 相同时只显示 id）。 */
export function overlayDisplayLabel(
  id: string,
  overlays?: Record<string, Overlay>,
): string {
  const title = overlays?.[id]?.title?.trim()
  return !title || title === id ? id : `${title} (${id})`
}
