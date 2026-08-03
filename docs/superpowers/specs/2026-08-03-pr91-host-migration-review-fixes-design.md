# PR #91 Host 迁移评论修复设计

## 目标

修复 PR #91 评论中仍成立的四项问题，同时确认已经完成的依赖发布与 release gate 不回退：

- 游戏身份只使用 Workbench handshake 接受的 `gameId`；
- 浏览器媒体资源、上传、重命名、删除全部走 Workbench extension host router；
- 镜头脚本保留公开契约中的 `dialogueLine` 与 `voiceover`；
- partial `styleAxes` 不再以 `undefined` 覆盖游戏级默认值。

本次不改变 wb-game-video 业务功能，不恢复旧 `/api/v1/kino` 或旧代理兼容路径。

## 当前事实与边界

`GameBootstrap` 已从 `WorkbenchSessionContext.gameId` 调用 `ensureBoot`，但多个子视图仍从 URL 或默认值读取游戏并再次 boot。Host router 已提供 `media/*` 路由，并以握手绑定的游戏上下文隔离文件；其上传协议是顺序分块 PUT，完成资源通过 `workbench-upload:<id>` 创建。

`@forgeax/workbench-host@0.2.0` 已发布到 npmjs.com，`bun.lock` 已锁定 npmjs tarball；当前 `bun run check:release` 已通过。该部分只增加防回归检查，不重新设计依赖。

## 设计

### 1. 游戏身份

`graphScenarioStore.game` 是接受 handshake 后的唯一运行时游戏身份。`GraphApp` 继续由 `GameBootstrap` 调用 `ensureBoot(gameId, demo)`；`GraphStudio`、`GraphConfigView`、`GraphPlaySurface`、`GraphAssetView`、`GraphVideoView` 删除 URL/default 读取和二次 `ensureBoot`，改为读取 store 中的 `game`。

`gameScope` 不再参与生产组件的身份选择。store 初始值不作为宿主身份 fallback；Workbench 内容只在 bootstrap 成功后挂载。测试直接 seed store 的 game，覆盖中文、单字符和带连字符的 id。

### 2. Host-bound media client

保留当前消费者使用的 `KinoVideoClient` 形状，替换其默认实现为 Host adapter，避免在业务组件中逐处重写资源操作：

- 通过 `getWorkbenchHost().extension.fetch()` 请求 `media/image-assets/upload`、`media/resources`、`media/resources/:id`、`media/resources/batch`；
- 通过 `getWorkbenchHost().extension.url()` 生成资源 content URL；
- 从浏览器请求体和查询中移除 `game_id`，由 Workbench extension endpoint 注入握手绑定的 game context；
- 将 `create/update/batch` 的现有 DTO 转换为 Host router schema，并把响应补回当前 game id 供现有缓存层使用；
- `DELETE` 接受 Host 的 `204` 空响应；其他成功响应继续读取 `{ code: 0, data }`；
- 上传 instruction 记录 `chunk_size/chunk_count`。上传 transport 按 index 顺序 PUT `media/uploads/:id?chunk_index=&chunk_count=`，每个分块要求成功 HTTP 响应并按分块进度回报；完成时以 `workbench-upload:<id>` 调用资源创建。

移除默认 `/api/v1/kino`、`game_id` 查询拼接、`__video-upload-proxy` transport 依赖及相应旧协议测试；不提供双路 fallback。

### 3. 生成契约与 style axes

`parseShotScript` 在保留现有字段的同时，仅在值为非空字符串时保留 `dialogueLine`、`voiceover`。新增测试验证对象数组和 `{ shots }` 两种返回形状。

`optionalStyleAxes` 使用只包含调用方实际传入字符串字段的对象；空字段不产生 key。新增 service 测试验证 partial override 与 registry 默认合并后，未覆盖轴仍存在。

### 4. Release 防回归

在 release contract 中加入旧媒体路由扫描，确保发布文本/编译产物不再出现 `/api/v1/kino` 或 `__video-upload-proxy`。增加 lockfile registry/integrity 检查，确保 `@forgeax/workbench-host@0.2.0` 指向 npmjs.com。

## 错误处理

- Host HTTP 非 2xx 转换为现有 `KinoClientError`，保留状态码；Host 成功但 envelope 非法仍报 `upstream_unavailable`；
- 分块缺失、顺序错误或冲突直接终止上传并保留现有重试状态；
- 没有 handshake game 时不发起媒体请求，组件显示现有 unavailable/loading 状态；
- 不在浏览器端解析或暴露宿主文件路径。

## 测试策略

1. 先为每个问题添加最小失败测试并确认失败；
2. 修复后运行对应单测：game bootstrap/store、media client/upload、orchestrate、wb-service、release contract；
3. 运行 lint、build、check:release；
4. 运行完整测试并区分本 PR 引入的失败与 main 分支既有失败；
5. 检查 `rg` 不再命中生产代码中的旧媒体路径，确认 lockfile 可 frozen install。

## 不在范围内

- 不修改 Host、Arrival/Kino 或 asset-canvas 仓库；
- 不恢复旧 `/api/v1/kino`、Vite proxy 或 standalone provider 兼容层；
- 不改变视频生成工具、能力声明和业务 prompt 语义；
- 不修复与本评论无关的 main 分支既有测试失败。
