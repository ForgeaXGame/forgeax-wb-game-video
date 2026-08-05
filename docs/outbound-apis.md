# wb-game-video 对外请求 API 清单

> 状态：当前实现 SSOT · 2026-08-05  
> 范围：`.worktrees/arrival-kino-video-capability/packages/marketplace/extensions/wb-game-video`  
> 相关历史：[请求方法梳理](d904a0e9-328e-498c-96f0-7944df28d2fa) · [CRUD 接口整理](c066a54f-c1af-448f-8817-de686c3844f8)  
> 旧文档 [`kino-resource-crud-api.md`](./kino-resource-crud-api.md) 仍描述 `/api/v1/kino` 与 `/__ce-api__`，**已过时**，以本文为准。

## 结论（先看这张）

扩展**不直连** Kino、LiteLLM、Azure、方舟/Seedance、MiniMax、COS/S3、forgeax-server 业务路由。  
所有对外 I/O 经嵌入宿主（Workbench Host）三条通道：

| 通道 | 浏览器怎么走 | 宿主最终可能打到 |
|:--|:--|:--|
| A. Host Media HTTP | `@forgeax/workbench-host` → `/games/:gameId/media…` | Kino / COS / S3 / local |
| B. Extension router | `extension.fetch` / `pluginFetch` → `{extensionApi}/…` | 扩展进程内逻辑；生成类再调宿主 broker |
| C. Host tool gateway | `tool.call(toolId, args)` → `{toolCall}` | 同 B 的 service 方法 |
| D. Server capability broker | `context.media` / `context.models` / `context.videoGeneration` | LiteLLM / Azure / Seedance / Kino（**宿主实现**） |

`src/editor/assets/kino-api.ts` 只是兼容 DTO 的 **Host media shim**，发布产物禁止出现 `/api/v1/kino`、`__video-upload-proxy`、`arrival-kino` 字符串。

---

## 1. Host Media（素材 CRUD + 可恢复上传）

**Base：** handshake `endpoints.gamePackage` 去掉 `/games/:gameId/package` 后，拼 `/games/:gameId/media`  
**客户端：** `host-media-client.ts` → `createWorkbenchBrowserClient().media`；UI 经 `kino-api.ts` / `video-upload.ts` / `assetLibraryClient.ts`

| Method | Path | 用途 | 调用方 |
|:--|:--|:--|:--|
| `GET` | `/games/:gameId/media?type=` | 列表（image/video/audio） | `media.list` |
| `GET` / `HEAD` | `/games/:gameId/media/:assetId` | 内容流 / 播放 | `contentUrl` / `playbackUrl` |
| `PUT` | `/games/:gameId/media` | 整包直传（小文件） | workbench-host `put`（扩展上传主流走 uploads） |
| `PATCH` | `/games/:gameId/media/:assetId` | 改 filename / metadata | `media.update` |
| `DELETE` | `/games/:gameId/media/:assetId` | 删除 | `media.delete` |
| `POST` | `/games/:gameId/media/uploads` | 创建可恢复上传会话 | `createUpload` / `prepareUpload` |
| `GET` | `/games/:gameId/media/uploads/:uploadId` | 查询上传进度 | `getUpload` |
| `PUT` | `/games/:gameId/media/uploads/:uploadId` | 分片写入（header `upload-offset`） | `writeUploadChunk` / XHR |
| `POST` | `/games/:gameId/media/uploads/:uploadId/complete` | 完成上传 → asset | `completeUpload` / `create` |

**上传流水线（视频库）：**

```text
prepareUpload → PUT uploads/:id（分片）→ completeUpload → PATCH metadata（可选 replace DELETE 旧 id）
```

**鉴权：** handshake 会话（nonce-bound）；扩展不持有 Kino/COS key。

服务端落盘生成物走同一语义：`context.media.list|put|read|delete`（`server/asset-registry.ts`），不另开 HTTP。

---

## 2. Host Package / Versions / Components

浏览器经 `getWorkbenchHost()`（`persist-client.ts`、`GameBootstrap.tsx`），HTTP 形状由 Host 提供：

| 能力 | 典型 Path | Method | 说明 |
|:--|:--|:--|:--|
| `gamePackage.load/save` | `/games/:gameId/package` | GET / PUT | 图数据 SSOT |
| `gamePackage.status` | `/games/:gameId/package/status` | GET | 空包检测 |
| `gamePackage.initialize` | `/games/:gameId/package/initialize?runtimeId=` | POST | 初始化 |
| `versions.*`（需 capability） | `/games/:gameId/versions` 等 | GET / POST | git 版本；`supported()` 为 false 则跳过 |
| `gameComponents` | `/games/:gameId/components/:path` | GET | 运行时组件模块 |

---

## 3. Extension HTTP Router（扩展自有路径）

**声明 SSOT：** `server/host/http-routes.ts`  
**解析：** `{handshake.endpoints.extensionApi}/{path}`，由 Host 转发到扩展 router。

| Method | Path | 是否出站到云 | 下游 |
|:--|:--|:--|:--|
| `GET` | `assets` | 否 | 本地 manifest + media 列表 |
| `GET` | `assets/:id` | 否 | 本地 registry |
| `GET` | `media/bundled/:name` | 否 | 扩展内置 demo 媒体（本地 FS） |
| `GET`/`POST` | `style-axes` | 否 | 风格三轴 manifest |
| `POST` | `references/characters/import` | 间接 | Host `files` 读图 → `media.put` |
| `POST` | `references/scenes/import` | 间接 | 同上 |
| `POST` | `generation/shot-script` | **是（经 Host）** | `context.models.generateText` |
| `POST` | `generation/keyframe` | **是（经 Host）** | `context.models.generateImage` + `media.put` |
| `POST` | `generation/video` | **是（经 Host）** | `videoGeneration.generateVideo` 或 `models.generateVideo` |
| `POST` | `generation/node-video` | **是（经 Host）** | 同上（分段） |

已退役（故意 404）：`media/resources`、`media/assets/:id`。

---

## 4. Host Tool Gateway

**浏览器：** `getWorkbenchHost().tool.call(toolId, args)`  
**HTTP：** `POST {handshake.endpoints.toolCall}`，body `{ caller, gameId, toolId, args }`  
**实现：** `server/tool-handlers.ts` → `wb-service.ts`（与 §3 共用 service）

| Tool ID | 对外依赖 |
|:--|:--|
| `wb-game-video:author-guide` | 无（静态） |
| `wb-game-video:get-graph` | 无（files） |
| `wb-game-video:save-graph` | 无（files） |
| `wb-game-video:list-videos` | 无（内置清单） |
| `wb-game-video:list-assets` | 无 / Host media 列表 |
| `wb-game-video:get-asset` | 无 |
| `wb-game-video:import-character-refs` | Host `media.put` |
| `wb-game-video:import-scene-refs` | Host `media.put` |
| `wb-game-video:generate-shot-script` | Host `models.generateText` |
| `wb-game-video:generate-keyframe` | Host `models.generateImage` + `media.put` |
| `wb-game-video:generate-video` | Host `videoGeneration`（capability `media.video.generate` v1） |
| `wb-game-video:generate-node-video` | 同上 |

---

## 5. 宿主必须提供的 Capability Broker（真正的云 API 落点）

扩展只调用这些接口；**具体 URL / key 在宿主（as-mate / EA）**，不在本包。

| Capability | 扩展调用点 | 典型宿主下游 | 配置提示（扩展侧仅文档） |
|:--|:--|:--|:--|
| `context.models.generateText` | `orchestrate.ts` shot-script | Azure Claude / LiteLLM chat | `.env.example` → `llm_key.json` key `azure-claude`（本地 vite/mock 说明，生产由 Host 注入） |
| `context.models.generateImage` | keyframe / storyboard | Azure OpenAI image / LiteLLM image | `azure-openai-image` |
| `context.videoGeneration.generateVideo`（优先） | video / node-video | `media.video.generate` → Kino → Seedance/方舟（`doubao-seedance-*` / `ep-*`） | Host + Kino 凭证 |
| `context.models.generateVideo` | 无 `videoGeneration` 时 fallback | 同上 | Host |
| `context.media.*` | 生成物落库、引用导入、回收 | Kino / COS / S3 / local | Host media adapter |
| `context.files.*` | graph / manifest / intake 读盘 | 本地游戏目录 | Host files |

**视频模型配置枚举（schema only，扩展不直连）：** `seedance | jimeng | mock`（`server/engine/scenario/types.ts`）。`seedance-local` Flask 已于 2026-06 退役。

**MiniMax Music / BGM 生成：** skill 文案有提及，**本扩展无代码调用**；运行时只播已上传 / Host media 的 audio ref。

---

## 6. 调用链速查

### 上传视频

```text
UI → kino-api (shim) → host-media-client
  → POST  .../media/uploads
  → PUT   .../media/uploads/:id
  → POST  .../media/uploads/:id/complete
  → PATCH .../media/:assetId
Host media adapter → Kino / COS / S3 / local
```

### 生成视频（按钮或 Agent tool）

```text
tool.call('wb-game-video:generate-video')
  或 POST {extensionApi}/generation/video
→ wb-service → orchestrate.ts
→ context.videoGeneration.generateVideo
→ [Host: LiteLLM / Seedance / Kino job]
→ context.media.put + assets/manifest.json
```

### 分镜文案

```text
POST generation/shot-script 或 tool generate-shot-script
→ context.models.generateText
→ [Host: Azure Claude / LiteLLM]
```

---

## 7. 已移除 / 禁止（不要再对接）

| 旧路径 / 机制 | 状态 |
|:--|:--|
| `/api/v1/kino/**`（capabilities / resources / content / image-assets/upload…） | 代码已迁走；release 扫描禁止 |
| `__video-upload-proxy` | 禁止 |
| `/__ce-api__/{chat,gemini-text,generate-image,generate-video,video-status}` | `gateway-client.ts` 已删 |
| `/__gva__/media/:id` | 发布禁止；`refreshPlaybackUrl` 仅保留兼容正则 |
| Extension `media/resources` 生命周期 | 404 by design |
| 直连 Azure / 方舟 / COS / LiteLLM / forgeax `:18900` | 生产代码无 |

---

## 8. 源码入口索引

| 主题 | 文件 |
|:--|:--|
| Media HTTP 契约 | `src/editor/assets/host-media-client.ts` |
| Kino DTO shim | `src/editor/assets/kino-api.ts` |
| 上传编排 | `src/editor/assets/video-upload.ts` |
| Extension 路由声明 | `server/host/http-routes.ts` |
| 生成编排 | `server/generation/orchestrate.ts` |
| Tool 表 | `server/tool-handlers.ts` · `forgeax-extension.json` |
| Package / versions | `src/editor/persist/persist-client.ts` |
| 发布禁词 | `scripts/check-release.mjs` · `server/release-contract.test.ts` |
| 本地 key 说明 | `.env.example` |

---

## 9. 宿主对接检查清单

实现宿主时至少保证：

1. Handshake 提供 `gameId`、`endpoints.gamePackage`、`extensionApi`、`toolCall`
2. Media 完整实现 §1（含 resumable uploads）
3. 注入 `context.media` + `context.models`；视频工具还需 `media.video.generate` 与 `videoGeneration`（或可用的 `models.generateVideo`）
4. 不要再给扩展配 `/api/v1/kino` 或 CE gateway；也不要在扩展内放生产 LLM key

---

## 附录 A · 全部相关路径一览

路径相对 Workbench mount（常见为 `/__workbench__/v1`）；`extensionApi` / `toolCall` 以 handshake 为准。  
`:gameId` / `:assetId` / `:uploadId` / `:runtimeId` / `:tag` / `:path` 为路径参数。

### A.1 Host Workbench（`@forgeax/workbench-host`）

| Method | Path | 功能 |
|:--|:--|:--|
| `GET` | `/catalog?gameId=` | 返回该游戏的 Workbench 公共目录（能力 / 端点摘要） |
| `GET` | `/tools?gameId=` | 列出当前游戏可用的 Agent tools |
| `POST` | `/tools/call` | 调用指定 tool（body 含 `toolId` + `args`） |
| `GET`/`HEAD` | `/runtime/:runtimeId/...` | 拉取 runtime 静态资源文件 |
| `GET`/`HEAD` | `/games/:gameId/components/:path` | 拉取游戏组件模块文件 |
| `GET` | `/games/:gameId/package` | 读取游戏包（含图 / blueprint） |
| `PUT` | `/games/:gameId/package` | 保存游戏包 |
| `GET` | `/games/:gameId/package/status` | 查询包状态（是否已初始化 / 空包等） |
| `POST` | `/games/:gameId/package/initialize?runtimeId=` | 用指定 runtime 初始化空包 |
| `GET` | `/games/:gameId/versions` | 列出 git 版本标签 |
| `POST` | `/games/:gameId/versions` | 创建新版本（commit/tag） |
| `GET` | `/games/:gameId/versions/current` | 查询当前版本与 dirty 状态 |
| `GET` | `/games/:gameId/versions/:tag/package` | 按版本标签读取历史包 |
| `GET` | `/games/:gameId/media?type=` | 列出媒体资产（可按 image/video/audio 过滤） |
| `PUT` | `/games/:gameId/media` | 整包直传小文件并登记为媒体资产 |
| `GET`/`HEAD` | `/games/:gameId/media/:assetId` | 读取 / 探测媒体内容流（播放） |
| `PATCH` | `/games/:gameId/media/:assetId` | 更新媒体元数据（filename / metadata） |
| `DELETE` | `/games/:gameId/media/:assetId` | 删除媒体资产 |
| `POST` | `/games/:gameId/media/uploads` | 创建可恢复上传会话 |
| `GET` | `/games/:gameId/media/uploads/:uploadId` | 查询上传会话进度 |
| `PUT` | `/games/:gameId/media/uploads/:uploadId` | 写入上传分片（`upload-offset`） |
| `POST` | `/games/:gameId/media/uploads/:uploadId/complete` | 完成上传并落成媒体资产 |
| `*` | `/extension/:runtimeId/{extensionPath}?gameId=` | 转发到扩展自有 HTTP 路由（见 A.2） |

### A.2 Extension router（挂在 A.1 的 `/extension/:runtimeId/…` 下）

相对 path（完整形如 `/extension/:runtimeId/assets`）：

| Method | Path | 功能 |
|:--|:--|:--|
| `GET` | `assets` | 列出扩展素材层资产（manifest + 过滤） |
| `GET` | `assets/:id` | 按 id 取单个素材层资产 |
| `GET` | `media/bundled/:name` | 读取扩展内置 demo 媒体文件 |
| `GET` | `style-axes` | 读取风格三轴配置 |
| `POST` | `style-axes` | 写入 / 覆盖风格三轴配置 |
| `POST` | `references/characters/import` | 从游戏角色目录导入角色参考图到媒体层 |
| `POST` | `references/scenes/import` | 从场景纹理目录导入场景参考图到媒体层 |
| `POST` | `generation/shot-script` | 生成节点分镜文案（经 Host LLM） |
| `POST` | `generation/keyframe` | 生成关键帧 / 分镜图（经 Host 图像模型） |
| `POST` | `generation/video` | 生成单段视频 ≤15s（经 Host 视频生成） |
| `POST` | `generation/node-video` | 生成超长节点视频（自动分段续接） |

退役（应 404，勿对接）：

| Method | Path | 功能 |
|:--|:--|:--|
| `*` | `media/resources` | 旧扩展自有媒体列表（已迁 Host media） |
| `*` | `media/resources/:id` | 旧扩展自有媒体详情 |
| `*` | `media/resources/:id/content` | 旧扩展自有媒体内容流 |
| `*` | `media/assets/:id` | 旧扩展媒体资产路由 |

### A.3 Tool gateway（`POST /tools/call` 的 `toolId`）

| toolId | 功能 |
|:--|:--|
| `wb-game-video:author-guide` | 返回作者指南 / 编排说明（静态） |
| `wb-game-video:get-graph` | 读取当前游戏图数据 |
| `wb-game-video:save-graph` | 保存当前游戏图数据 |
| `wb-game-video:list-videos` | 列出内置演出视频库可用 `media.ref` |
| `wb-game-video:list-assets` | 列出共享素材层资产 |
| `wb-game-video:get-asset` | 按 id 获取单个素材层资产 |
| `wb-game-video:import-character-refs` | 导入角色参考图（同 HTTP import） |
| `wb-game-video:import-scene-refs` | 导入场景参考图（同 HTTP import） |
| `wb-game-video:generate-shot-script` | 生成分镜文案（同 `generation/shot-script`） |
| `wb-game-video:generate-keyframe` | 生成关键帧（同 `generation/keyframe`） |
| `wb-game-video:generate-video` | 生成单段视频（同 `generation/video`） |
| `wb-game-video:generate-node-video` | 生成超长节点视频（同 `generation/node-video`） |

### A.4 宿主 Capability（无固定 HTTP path；由 Host 实现）

| API | 功能 |
|:--|:--|
| `context.media.list` | 服务端列出媒体资产 |
| `context.media.put` | 服务端写入媒体字节并登记 |
| `context.media.read` | 服务端读取媒体内容 |
| `context.media.update` | 服务端更新媒体元数据 |
| `context.media.delete` | 服务端删除媒体资产 |
| `context.media.createUpload` / `getUpload` / `writeUploadChunk` / `completeUpload` | 服务端可恢复上传（与 A.1 uploads 同语义） |
| `context.models.generateText` | 文本生成（分镜文案等） |
| `context.models.generateImage` | 图像生成（关键帧 / 分镜图） |
| `context.models.generateVideo` | 视频生成 fallback |
| `context.videoGeneration.generateVideo` | 视频生成优先入口（`media.video.generate` v1） |
| `context.files.*` | 读写游戏目录文件（graph / manifest / intake） |

### A.5 已禁止路径（历史对照，勿实现）

| Method | Path | 功能（历史） |
|:--|:--|:--|
| `*` | `/api/v1/kino/**` | 旧直连 Kino 媒体 CRUD / 播放 |
| `*` | `/__video-upload-proxy/**` | 旧开发态上传代理改写 |
| `*` | `/__ce-api__/chat` | 旧 CE 文本 chat 网关 |
| `*` | `/__ce-api__/gemini-text` | 旧 CE 多模态文本网关 |
| `*` | `/__ce-api__/generate-image` | 旧 CE 图像生成网关 |
| `*` | `/__ce-api__/generate-video` | 旧 CE 视频任务提交 |
| `*` | `/__ce-api__/video-status` | 旧 CE 视频任务轮询 |
| `*` | `/__gva__/media/:id` | 旧本地 registry 媒体流 |
