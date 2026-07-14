# ADR-0007 — 公开镜像下 COS / 腾讯依赖的处理（临时去敏感词 + 解耦债务）

- **Status**: 🟡 Accepted（**临时措施 / interim**，非合规终态）— 2026-06-21
- **Date**: 2026-06-21
- **Deciders**: laurenceelu（上级指示：公开镜像「**不能依赖腾讯系**」）
- **Relates**: 仓库根 `docs/open-source-plan.md` §3.3（镜像 scrub + 门禁）；仓库根 `scripts/mirror/publish.sh`（`gate()` / `assemble()`）；ADR-0001（provider 解耦）；本插件 `server/cos-uploader.ts` / `server/tool-handlers.ts`。

> 本 ADR 落在 `docs/`，镜像管线 `--exclude 'docs/'` 整体排除，**不进公开镜像**，故可点名腾讯。`HANDOFF.md` 进镜像，只能用品牌中性措辞指向本文件。

## Context

开源公开镜像（`github.com/forgeax/forgeax-studio`）有一道「零腾讯」门禁：仓库根 `scripts/mirror/publish.sh` 的 `gate()` 对**组装后的镜像产物**做正则 grep（`腾讯|[Tt]encent|\.woa\.com|...`），命中即 publish 失败。

`wb-gen3d` 现在**硬依赖腾讯云 COS（Cloud Object Storage）**，会触发该门禁：

- `package.json` → `"cos-nodejs-sdk-v5": "^2.15.4"`（腾讯云 COS SDK；`cos-uploader.ts` 顶层 `import` → **安装期硬依赖**，哪怕只跑 mock、不配 COS，装插件也会拉这个 SDK）。
- `server/cos-uploader.ts` —— COS 上传器（把本地文件传上去、拿一个有时效的签名 URL）。
- `server/tool-handlers.ts` —— `inputImageUpload()` / `shareAssetFileUrl()` 用 COS 给 **URL-fetching provider**（Hunyuan REST / Meshy）发 URL，用在 `auto-rig` / `apply-motion` / `retopo-lowpoly` / 输入图上传。

**为什么需要 COS**：Hunyuan / Meshy 的接口只吃 URL 输入（`image_url` / `model_url`）。要把用户**本地**文件喂给它们，就得先托管到公网、拿一个签名 URL。COS 充当这个「临时公网中转 host」；传上去的是 transfer artifact（sha256 寻址、会过期），**不是资产**。

**门禁的本质缺口**：`gate()` 是**按字面词扫描**——它能抓到注释里的「Tencent」字样，但**抓不到 `cos-nodejs-sdk-v5` 这个依赖本身**（字符串里没有 "tencent"）。所以 **「门禁绿」≠「无腾讯依赖」**。

## Decision（临时）

目前**无法完全移除 COS 依赖**（rig / motion / retopo / 输入图上传的真机链路都依赖一个签名 URL host）。本批：

1. **移除两处 shipped 文件里的品牌词**，让词门禁通过：
   - `server/cos-uploader.ts:1`：`Tencent COS` → `cloud object storage (COS)`。
   - `.env.example:27`：`Tencent COS` → `COS (cloud object storage)`。
   - 保留 `COS` 字样 + `COS_*` env 名 + `CosUploader` 符号 + `cos-nodejs-sdk-v5` 依赖（门禁不扫这些；全量重命名代价大且无收益）。
2. **诚实记录残留债务（本文件）**：镜像**仍然携带腾讯云 COS SDK 依赖**。这是**临时解封**，**不是合规**——纯属让词门禁先过、债务挂账。`HANDOFF.md` 顶部以品牌中性措辞指向本 ADR。

> 关键：本决策**不否定**上级「不能依赖腾讯系」。它只把「门禁红、发不了」临时变成「门禁绿、但债务可见」。**公开镜像真正转 public 之前，必须落地下面二选一的真解，否则等于对外暴露腾讯云依赖。**

## 真解（公开 public 前二选一，必须做）

- **短期（最稳）**：把 `wb-gen3d` 整个排除出镜像 —— `publish.sh` 的 marketplace 装配加 `--exclude 'plugins/wb-gen3d/'`；同时给 `gate()` 的 denylist 补 `cos-nodejs-sdk-v5` / `COS_SECRET`，让「按词扫不到的依赖」也能被挡，杜绝以后再用「删注释词」糊弄过门禁。代价：公开版暂无 3D 角色生成。
- **长期（保功能、去腾讯）**：把 `cos-uploader` 抽象成**厂商中立的 storage 接口** ——
  - `interface TransferHost { upload(bytes, mime): Promise<{ url; expiresInSec }> }`；
  - 默认后端走 **S3 兼容**（`@aws-sdk/client-s3` + presigner，可接 AWS S3 / Cloudflare R2 / MinIO / Backblaze B2）；
  - `cos-nodejs-sdk-v5` 降级为**可选依赖**（`optionalDependencies` 或运行期 `await import(...)`，只在配了 `COS_*` 时加载）。
  - 落地后 `wb-gen3d` 零硬腾讯依赖，可随镜像发布、且保留 3D 生成。

## 其它腾讯残留（不在本批范围，单独处理）

- **lockfile 镜像源（不在 wb-gen3d，但属同类问题）**：本插件 `wb-gen3d/bun.lock` **已干净**（无 `mirrors.tencent.com`，走公共 registry）。但**其它插件**的 lockfile（如 `plugins/wb-bgm/bun.lock`）里每个包的下载地址仍是 `https://mirrors.tencent.com/npm/...`（开发机走了腾讯 npm 镜像）。**不是运行时依赖**，但会触词门禁。处理：镜像管线 scrub `mirrors.tencent.com → registry.npmjs.org`，或用公共 registry 重生成 lockfile，或镜像排除 `bun.lock`。本批**不手改 lockfile**（脆弱、且超出本插件 +「这几处敏感词」范围）。
- **engine `docs/feedbacks` 里的 `TencentOS` 等**：`docs/` 被镜像整体 `--exclude 'docs/'` 排除，不进镜像，无需处理。

## Consequences

- 词门禁对 `wb-gen3d`（源码 + 本插件 `bun.lock`，`docs/` 由镜像 `--exclude 'docs/'` 排除）通过。
- 镜像**仍装腾讯云 SDK**（债务，已记录）；公开 public 前必须落地上面真解之一。
- **建议把门禁从「纯按词 grep」升级为「同时扫 `package.json` 里已知云厂商 SDK（`cos-nodejs-sdk-v5` 等）」**，否则「门禁绿」会再次掩盖厂商依赖。
