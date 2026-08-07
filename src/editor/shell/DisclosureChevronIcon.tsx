/**
 * 树目录统一展开箭头：默认朝下（展开），折叠态由调用方旋转 -90° 后朝右。
 * NewSidebar 与递归 UiTreeView 共用，避免不同层级的 SVG 方向漂移。
 */
export const DisclosureChevronIcon = (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M5 7.5L10 12.5L15 7.5"
      stroke="currentColor"
      strokeWidth="1.66667"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
