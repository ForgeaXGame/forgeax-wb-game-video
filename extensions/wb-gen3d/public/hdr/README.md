# HDR 环境贴图预设目录

这是视图器（`ModelViewer` / `viewer/environment.ts`，见
`docs/PLAN-2026-06-13-viewer-quality-provider-params.md` §A.2）加载 HDR 环境光照
（IBL）的**占位目录**。把 `.hdr` 文件放进来即可被预设选择器引用。

## 路径与服务方式

- 源路径（你放文件的地方）：`packages/marketplace/extensions/wb-gen3d/public/hdr/`
- vite 会把 `public/` 原样拷进构建产物 `dist/` 根，插件 `base: './'`，因此运行时
  视图器以相对路径 `./hdr/<file>.hdr` 加载（Studio 内嵌走 same-origin，standalone
  dev :15175 走 vite）。
- **本目录纳入 git**（插件 `.gitignore` 只忽略 `dist/`，不忽略 `public/` 与 `.hdr`），
  所以放进来的文件会随仓库走、**换机不丢**。⚠️ `.hdr` 是二进制，体积偏大时考虑 git-lfs。

## 文件要求（建议）

- 格式：**equirectangular（等距柱状）`.hdr`（RGBE）**。
- 分辨率：**1k（2048×1024 左右）**，单个约 1–3MB；不建议 2k/4k（懒加载也会显著增重）。
- 命名：小写中划线，语义化，例如 `studio-soft.hdr` / `studio-outdoor.hdr` / `sunset.hdr`。

## 登记方式：`presets.json`

视图器从本目录的 `presets.json` 读取可选预设清单（懒加载：选中某项时才下载对应
`.hdr`）。`builtin-neutral`（three.js `RoomEnvironment`，零文件中性影棚）恒为默认项、
无需文件。新增 HDR = 放文件 + 在 `presets.json` 的 `custom[]` 里加一条。

当前为占位：`custom[]` 为空，仅 `builtin-neutral` 可用，直到你固化真实 `.hdr`。
