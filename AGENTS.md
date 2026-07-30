# AGENTS.md — @forgeax/wb-game-video

这是独立的 `@forgeax/wb-game-video` 仓库。修改前先读本文件和 [`README.md`](./README.md)。

## 不可破坏的边界

- `src/runtime/schema/node-config-schema.ts`、`react-flow-schema.ts`、`graph-schema.ts` 是发布数据契约；增删字段必须取得专门同意。
- `src/runtime` 不得依赖 `src/graph` 或编辑器壳。状态机不接触 DOM/React，不使用 `Math.random`。
- 图中只有 `perf` 演出节点；路由判断放在边上，副作用放在 reaction 中，UI 放在 overlay/component 中。
- 运行入口是根 `graph`；子流程从 `manifest.packs` 解析。保存前保持根图与主 pack 同步。

## 持久化与启动

- 权威蓝图是宿主绑定游戏工作区内的逻辑路径 `blueprint.json`。
- 项目元信息是同一工作区内的 `project.json`，首次工具保存时按需创建。
- 共享生成素材位于逻辑目录 `assets/`；角色和场景引用从 `characters/`、`textures/`
  只读导入。所有路径都通过 `WorkbenchExtensionContext.files` 访问，物理布局由宿主决定。
- `save-graph` 的 `title` 是保留参数，当前不产生版本；成功结果的 `versions` 固定为空数组。
- 未保存草稿使用 localStorage。未初始化项目只允许经 `GameBootstrap` 引导调用宿主初始化；
  已初始化 package 读取失败必须显示错误，不得在前端自动保存空库覆盖原蓝图。

AI 工具共 11 个，完整列表与生产闭环见 [`SKILL.md`](./SKILL.md)。不要声称镜头脚本、关键帧或视频生成能力已移除。

## 宿主上下文

后端只接受宿主构造的 `WorkbenchExtensionContext`：

- `gameId` 是唯一游戏身份，必须原样使用，不做 slug 归一化；
- `gameRoot` 已由宿主解析，扩展不得再解释产品级路径字段；
- `files` 是限定游戏根的文件能力，复合写事务必须使用 `withLocks`；
- `media` 与 `models` 是唯一媒体和模型服务入口。

11 个 AI 工具的公开 args schema 都不得包含 `gameSlug` 或其它可由调用者选择的游戏字段。
不得读取全局 active-game、进程环境或当前目录来推导游戏与服务地址。

浏览器只接受 nonce-bound handshake 的 `ExtensionClient.ready()` 结果。`gameId`、`runtimeId`
和所有 endpoint 都来自该结果；不得从 query、location 或默认 slug 推导。版本功能必须先检查
`versions.supported()`；游戏组件只允许使用 `gameComponents.moduleUrl()`，缺 capability
时隐藏或明确报不支持，不得拼备用地址。

扩展后端是宿主进程内加载的 fully-trusted 代码；manifest 的权限和 `requestedEnv`
是声明与审计信息，不构成进程隔离，也不限制进程已有的 Node 能力。

## 开发与验证

- 本仓库前端调试端口固定为 `15185`（已由 `vite.config.ts` 配置）；启动开发服务时不得用
  `--port` 覆盖为其它端口。

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run lint
bun run build
```

`bun test` 只跑 server/release-contract gate；需要浏览器环境的完整测试使用 `bun run test`。

发布前 `bun run build` 必须成功；它会依次生成前端、后端产物并执行 release validator。Vite
只作为本地开发适配器，不再生成或发布 standalone host。

## 目录

| 领域 | 位置 |
|---|---|
| schema、状态机、组件宿主、校验 | `src/runtime/` |
| 蓝图画布与编辑纯函数 | `src/graph/` |
| 工坊壳、持久化、素材与显式 demo | `src/editor/` |
| AI 工具、生成编排、素材登记 | `server/` |
| JSON 工具契约 | `schemas/` |

历史设计稿可能记录已淘汰方案；发布行为以代码、manifest、schema、README 和 SKILL 为准。
