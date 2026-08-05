# Kino Resource CRUD API

> 状态：**SUPERSEDED · 2026-08-05**  
> 当前对外请求 SSOT 见 [`outbound-apis.md`](./outbound-apis.md)。  
> 下文仍描述旧 `/api/v1/kino` 与 `/__ce-api__` 形状，仅作迁移对照；生产代码已改为 Host `/games/:gameId/media` + capability broker。

> 源码入口：[`src/editor/assets/kino-api.ts`](../src/editor/assets/kino-api.ts)（现为 Host media shim）  
> 上传编排：[`src/editor/assets/video-upload.ts`](../src/editor/assets/video-upload.ts)  
> 视频库 Hook：[`src/editor/assets/useVideoAssets.ts`](../src/editor/assets/useVideoAssets.ts)  
> 图/音/字体库：[`src/editor/assets/assetLibraryClient.ts`](../src/editor/assets/assetLibraryClient.ts)

~~插件内资源 CRUD 的 HTTP 契约集中在 `createKinoVideoClient`。默认 base：`/api/v1/kino`。~~  
**现行：** `createKinoVideoClient` 只适配 Host media；默认 base 来自 handshake `gamePackage` → `/games/:gameId/media`。

> [!IMPORTANT]
> 不要再对接 `/api/v1/kino/*`。宿主应实现 Workbench Host media 契约（见 `outbound-apis.md` §1）。

## 目录

- [统一信封](#统一信封)
- [公共类型](#公共类型)
- [端点一览](#端点一览)
- [Capabilities](#capabilities)
- [Prepare Upload](#prepare-upload)
- [List](#list)
- [Get](#get)
- [Create](#create)
- [Batch Create](#batch-create)
- [Update](#update)
- [Delete](#delete)
- [Playback Content](#playback-content)
- [上传流水线](#上传流水线)
- [业务层封装](#业务层封装)
- [本地 fs Registry（对照）](#本地-fs-registry对照)
- [生成网关（非 CRUD）](#生成网关非-crud)

## 统一信封

所有 JSON 接口响应形如：

```ts
interface KinoEnvelope<T> {
  code: number
  message: string
  data: T
  error_code?: string
}
```

| 条件 | 行为 |
|:--|:--|
| HTTP ok 且 `code === 0` | 客户端返回 `data` |
| HTTP 401 | 抛 `KinoClientError`（`status=401`, `errorCode` 默认 `unauthorized`） |
| HTTP 非 ok 或 `code !== 0` | 抛 `KinoClientError`（`status` / `errorCode` / 截断后的 `message`） |
| 空 body / 非 JSON / 缺 `code` | 抛 `KinoClientError`（`502`, `upstream_unavailable`） |
| 网络失败 | 抛 `KinoClientError`（`502`, `network_error`） |

请求默认：`credentials: 'include'`，`Content-Type: application/json`。

## 公共类型

```ts
type KinoMediaType = 'image' | 'video' | 'audio' | 'font'
type KinoProviderKind = 'local' | 's3' | 'cos' | 'kino'

type KinoResourceType =
  | 'KEYFRAME'
  | 'SHOT_VIDEO'
  | 'CHARACTER_IMAGE'
  | 'CHARACTER_TURNAROUND'
  | 'LOCATION_IMAGE'
  | 'PROJECT_COVER_IMAGE'
  | 'UPLOAD'
  | 'OTHER'
  | 'GENERATION'

interface KinoResourceSourceMeta {
  task_id?: string
  prompt?: string
  model?: string
  seed?: number
  width?: number
  height?: number
  duration_ms?: number
  mime_type?: string
  extra?: Record<string, unknown>
}

interface KinoResourceDTO {
  resource_id: string
  game_id: string
  media_type: KinoMediaType
  name?: string
  type?: KinoResourceType
  url: string
  remark?: string
  source?: string
  source_meta?: KinoResourceSourceMeta
  created_at: number
  updated_at: number
}
```

`page_size` 服务端分页上限：`MAX_KINO_RESOURCE_PAGE_SIZE = 100`。

## 端点一览

| 语义 | Method | Path | 客户端方法 |
|:--|:--|:--|:--|
| 能力探测 | `GET` | `/capabilities` | `capabilities()` |
| 准备上传 | `POST` | `/image-assets/upload` | `prepareUpload(input)` |
| 列表 | `GET` | `/resources` | `list(query)` |
| 单条 | `GET` | `/resources/:id?game_id=` | `get(id, gameId)` |
| 创建 | `POST` | `/resources` | `create(input)` |
| 批量创建 | `POST` | `/resources/batch` | `batch(input)` |
| 更新 | `PUT` | `/resources/:id?game_id=` | `update(id, input)` |
| 删除 | `DELETE` | `/resources/:id?game_id=` | `delete(id, gameId)` |
| 内容流 | `GET` | `/resources/:id/content?game_id=` | `playbackUrl(id, gameId)`（仅拼 URL） |

`:id` 与 `game_id` 均做 `encodeURIComponent`。

---

## Capabilities

**`GET /api/v1/kino/capabilities`**

### 入参

无。

### 出参 `data`

```ts
interface KinoProviderCapabilities {
  provider: KinoProviderKind
  media_types: KinoMediaType[]
  upload_mimes: KinoUploadMime[]
}
```

`KinoUploadMime` 覆盖视频/图/音/字体常见 MIME（如 `video/mp4`、`image/png`、`audio/mpeg`、`font/woff2` 等）。上传前用它校验 `media_types` 与 `upload_mimes`。

---

## Prepare Upload

**`POST /api/v1/kino/image-assets/upload`**

准备直传指令；**不**创建资源记录。随后对 `upload.url` 做 `PUT` 二进制，再用 `object_url` 调 [Create](#create)。

### 入参 body

```ts
interface PrepareUploadInput {
  game_id: string
  mime_type: KinoUploadMime
  bytes: number
  file_name?: string
  extension?: string
  /** 替换已有资源时传入原 resource_id */
  client_resource_id?: string
  replace_existing?: boolean
}
```

### 出参 `data`

```ts
interface DirectUploadResponse {
  upload: {
    method: 'PUT'
    url: string
    headers: Record<string, string>
    expires_at: string
  }
  object_url: string
  upload_token: string
}
```

---

## List

**`GET /api/v1/kino/resources`**

### 入参 query

```ts
interface ListKinoResourcesQuery {
  game_id: string
  media_type?: KinoMediaType  // 客户端默认 'video'
  page?: number
  page_size?: number          // 建议 ≤ 100
  type?: KinoResourceType
}
```

### 出参 `data`

```ts
interface KinoResourcePage {
  items: KinoResourceDTO[]
  total: number
  page: number
  page_size: number
}
```

---

## Get

**`GET /api/v1/kino/resources/:resourceId?game_id=`**

### 入参

| 位置 | 字段 | 类型 |
|:--|:--|:--|
| path | `resourceId` | `string` |
| query | `game_id` | `string` |

### 出参 `data`

`KinoResourceDTO`

---

## Create

**`POST /api/v1/kino/resources`**

### 入参 body

```ts
interface CreateKinoResourceInput {
  game_id: string
  media_type: KinoMediaType
  url: string                 // 通常为 prepareUpload 返回的 object_url
  name?: string
  type?: KinoResourceType     // 上传流水线默认 'UPLOAD'
  remark?: string
  source?: string             // 上传流水线默认 'upload'
  source_meta?: KinoResourceSourceMeta
}
```

### 出参 `data`

`KinoResourceDTO`

---

## Batch Create

**`POST /api/v1/kino/resources/batch`**

### 入参 body

```ts
interface BatchCreateKinoResourcesInput {
  game_id: string
  resources: Array<Omit<CreateKinoResourceInput, 'game_id'>>
}
```

### 出参 `data`

```ts
interface BatchCreateKinoResourcesResult {
  created_count: number
  skipped_count: number
  items: KinoResourceDTO[]
}
```

---

## Update

**`PUT /api/v1/kino/resources/:resourceId?game_id=`**

重命名等场景：先 `get`，再带齐字段 `update`（至少保留 `media_type` / `url`）。

### 入参

| 位置 | 字段 |
|:--|:--|
| path | `resourceId` |
| query | `game_id`（取自 body 的 `game_id`） |
| body | `UpdateKinoResourceInput` |

```ts
interface UpdateKinoResourceInput {
  resource_id: string
  game_id: string
  media_type: KinoMediaType
  url: string
  name?: string
  type?: KinoResourceType
  remark?: string
  source?: string
  source_meta?: KinoResourceSourceMeta
}
```

### 出参 `data`

`KinoResourceDTO`

---

## Delete

**`DELETE /api/v1/kino/resources/:resourceId?game_id=`**

### 入参

| 位置 | 字段 | 类型 |
|:--|:--|:--|
| path | `resourceId` | `string` |
| query | `game_id` | `string` |

### 出参 `data`

`null`（客户端方法返回 `void`）

---

## Playback Content

**`GET /api/v1/kino/resources/:resourceId/content?game_id=`**

鉴权内容流，返回媒体二进制（非 JSON 信封）。  
`playbackUrl(resourceId, gameId)` 只拼相对 URL，不发请求。视频库列表会在 URL 上附加 `v=<updated_at>` 作缓存破坏。

---

## 上传流水线

标准新建（`uploadProviderResource` / `uploadVideoResource`）：

```text
assertMediaUploadFile
  → prepareUpload({ game_id, file_name, mime_type, bytes, extension })
  → PUT upload.url（XHR；开发态可能改写到同源或 /__video-upload-proxy）
  → create({ game_id, media_type, url: object_url, name, type: 'UPLOAD', source, source_meta })
```

替换（`replaceVideoResource`）在 `prepareUpload` 额外带：

```ts
{ client_resource_id: resourceId, replace_existing: true }
```

浏览器侧大小上限（`BROWSER_UPLOAD_POLICIES`）：

| media_type | MIME | maxBytes |
|:--|:--|:--|
| `video` | `video/mp4` | 100 MB |
| `image` | png/jpeg/webp/gif | 20 MB |
| `audio` | mpeg/wav/ogg/mp4/aac | 100 MB |
| `font` | woff2/woff/ttf/otf | 20 MB |

---

## 业务层封装

这些模块**不新增 HTTP 路径**，只组合上述端点：

| 模块 | 职责 | 底层调用 |
|:--|:--|:--|
| `video-upload.ts` | prepare → PUT → create / replace / retry | `prepareUpload` + transport + `create`/`update` |
| `useVideoAssets` | 视频资产 UI 控制器 | `list` / upload / replace / rename(`update`) / `delete` |
| `assetLibraryClient` | 图 / 音 / 字体资产库 | `list` / upload / rename(`update`) / `delete` |

`AssetLibraryClient` 表面类型：

```ts
interface AssetLibraryClient {
  capabilities(options?): Promise<KinoProviderCapabilities>
  list(gameId, kind: 'image'|'audio'|'font', options?): Promise<ManagedAsset[]>
  upload(gameId, kind, file, options?): Promise<ManagedAsset>
  rename(gameId, id, name, options?): Promise<ManagedAsset>
  remove(gameId, id, options?): Promise<void>
}
```

`ManagedAsset` 预览 URL 一律走 `playbackUrl`，不直接暴露存储 `url`。

---

## 本地 fs Registry（对照）

`server/asset-registry.ts` 维护 `.forgeax/games/<slug>/assets/manifest.json`，是**进程内磁盘 CRUD**，不是 `/api/v1/kino`：

| 函数 | 入参 | 出参 |
|:--|:--|:--|
| `listAssets(dir, filter?)` | 可选 `{ kind, productionType, sceneNodeId }` | `MediaAsset[]` |
| `getAsset(dir, id)` | | `MediaAsset \| null` |
| `upsertAsset(dir, asset)` | 完整 `MediaAsset` | 落盘后的 `MediaAsset` |
| `updateAsset(dir, id, patch)` | `Partial<MediaAsset>` 浅合并 | `MediaAsset \| null` |
| `deleteAsset(dir, id)` | | `boolean` |

前端播放本地自产文件走 `/__gva__/media/:id`。provider 托管资源以 Kino content API 为准。

类型 SSOT：[`src/editor/assets/registry-types.ts`](../src/editor/assets/registry-types.ts)。

---

## 生成网关（非 CRUD）

`server/generation/gateway-client.ts` 调用宿主 `/__ce-api__` 任务接口，不维护资源表：

| 端点 | 入参要点 | 出参要点 |
|:--|:--|:--|
| `POST /chat` | `system?`, `messages`, `maxTokens?` | `{ success, text }` |
| `POST /gemini-text` | `system?`, `prompt`, `inputImages?` | `{ success, text }` |
| `POST /generate-image` | `prompt`, `inputImages?` | `{ success, imageBase64, mimeType }` |
| `POST /generate-video` | `prompt`, `seconds`, `imageWithRoles?`, … | `{ success, taskId }` |
| `GET /video-status?taskId=` | | `{ success, status, videoUrl? }` |

成片落库仍回到 Kino create / 本地 registry upsert，不在本表。
