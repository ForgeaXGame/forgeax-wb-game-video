/**
 * 将外部 URL 转为可在浏览器中访问的 URL。
 * - 开发模式：走 /api/wb/bgm/cos-proxy 避免 CORS
 * - 生产模式（Workbench 嵌入）：直接使用原始 URL（网关处理 CORS）
 *
 * 可通过 setDirectMode(true) 切换为直连模式。
 */

let directMode = false;

export function setDirectMode(enabled: boolean): void {
  directMode = enabled;
}

export function proxyUrl(url: string): string {
  if (!url) return url;
  if (directMode) return url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  return `/api/wb/bgm/cos-proxy?url=${encodeURIComponent(url)}`;
}
