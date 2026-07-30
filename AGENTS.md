# AGENTS.md — @forgeax/wb-game-video

这是独立的 `@forgeax/wb-game-video` 仓库。修改前先读本文件和 [`README.md`](./README.md)。

## 不可破坏的边界

- `src/runtime/schema/node-config-schema.ts`、`react-flow-schema.ts`、`graph-schema.ts` 是发布数据契约；增删字段必须取得专门同意。
- `src/runtime` 不得依赖 `src/graph` 或编辑器壳。状态机不接触 DOM/React，不使用 `Math.random`。
- 图中只有 `perf` 演出节点；路由判断放在边上，副作用放在 reaction 中，UI 放在 overlay/component 中。
- 运行入口是根 `graph`；子流程从 `manifest.packs` 解析。保存前保持根图与主 pack 同步。

## 持久化与启动

- 权威蓝图：`.forgeax/games/<slug>/blueprint.json`。
- 项目元信息：同目录 `project.json`，首次工具保存时按需创建。
- 共享生成素材：同目录 `assets/`；角色和场景引用从 `characters/`、`textures/` 只读导入。
- `save-graph` 的 `title` 是保留参数，当前不产生版本；成功结果的 `versions` 固定为空数组。
- 未保存草稿使用 localStorage。空项目使用空库，内置 demo 只在显式“重置”时载入。

AI 工具共 11 个，完整列表与生产闭环见 [`SKILL.md`](./SKILL.md)。不要声称镜头脚本、关键帧或视频生成能力已移除。

## 宿主上下文

后端只接受两种明确的宿主上下文：

- Arrival：`ctx.gameId` 是绑定 id，`ctx.cwd` 是当前游戏根，`ctx.extensionDir` 是扩展根。
- ForgeaX：`ctx.game` 是绑定 id，`ctx.projectRoot` 是项目根，`ctx.cwd` 是扩展根；当前
  游戏根为 `ctx.projectRoot/.forgeax/games/<ctx.game>`。

内部按需统一成 `boundGameId` / `gameRoot` / `extensionRoot`。`list-videos` 只要求
`extensionRoot`，允许在无游戏绑定的 ForgeaX 会话中调用；其余游戏读写、生成和共享素材
工具要求 `boundGameId + gameRoot`。不得读取全局 active-game，不得把 ForgeaX 的扩展
`cwd` 当成项目根。显式 `gameSlug` 必须与绑定 id 逐字一致。game id 支持中文与单字符；
只拒绝空值、`.`、`..` 和路径分隔符。

模型、媒体、版本和工作区都由 Workbench host capability 注入；扩展不得从环境或全局状态
推导服务地址或当前游戏。

扩展后端是宿主进程内加载的 fully-trusted 代码；manifest 的权限和 `requestedEnv`
是声明与审计信息，不构成进程隔离，也不限制进程已有的 Node 能力。

## 开发与验证

- 本仓库前端调试端口固定为 `15185`（已由 `vite.config.ts` 配置）；启动开发服务时不得用
  `--port` 覆盖为其它端口。

```bash
bun install
bun run dev
bun run test
bun run lint
bun run build
```

`bun test` 只跑 server/release-contract gate；需要浏览器环境的完整测试使用 `bun run test`。

发布前 `bun run build` 必须成功；它会依次生成前端、后端、standalone 产物并执行 release validator。

## 目录

| 领域 | 位置 |
|---|---|
| schema、状态机、组件宿主、校验 | `src/runtime/` |
| 蓝图画布与编辑纯函数 | `src/graph/` |
| 工坊壳、持久化、素材与显式 demo | `src/editor/` |
| AI 工具、生成编排、素材登记 | `server/` |
| JSON 工具契约 | `schemas/` |

历史设计稿可能记录已淘汰方案；发布行为以代码、manifest、schema、README 和 SKILL 为准。
