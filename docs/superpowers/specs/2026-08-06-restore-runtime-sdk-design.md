# Restore `src/runtime/sdk` (Approach A)

**Status:** IMPLEMENTED — 2026-08-06  
**Date:** 2026-08-06  
**Branch:** `codex/kino-video-capability`  
**Related:** `docs/outbound-apis.md` 附录 C（已恢复）· 附录 D（映射资料，本轮不做）

## Goal

把 `084662a` 删除的 `src/runtime/sdk` **原样**接回当前 host 迁移后的树，恢复 standalone 构建脚本，并让发布包再次产出可被消费的 standalone 产物。本轮**不**实现附录 D 的 URL 映射 / SDK init 拦截机制。

## Non-goals

- 不做接口映射表补全、不改 `rewriteUrl` / forgeaxHttp 映射语义（附录 D / B）
- 不用 `PlayerBootstrap` 替代 `src/runtime/sdk`
- 不回退 Workbench Host / `./host` 导出；host 轨与 SDK/standalone 轨并存
- 不修改 `loadGameComponents` 签名去迁就旧调用（恢复代码保持删除前写法；缺 `moduleUrl` 时现有 API 会 soft no-op，与附录 C「原样」一致，映射轮再处理）

## Current state

- 分支 HEAD 无 `src/runtime/sdk/**`（删于 `084662a`；main 经 revert 仍保留）
- `package.json` `build` 不含 `build:standalone`；无 `start:standalone`
- `exports`: `.` / `./host` / `./styles.css`
- `forgeax-extension.json` `entry.standalone` 仍指向 `bun run dev` @ `:15185`（与删除前 manifest 形状一致，但缺少 `dist/standalone` 产物链）
- `server/check-release.test.ts` 仍以 `src/runtime/sdk/standalone/wb-game-video.html` 为合法 identity fixture

## Design

### 1. Source restore

从 `084662a^` checkout 附录 C 列出的 11 个路径（一字不改）：

- `src/runtime/sdk/client/{asset-resolver,game-package-client}.ts` + test
- `src/runtime/sdk/react/RuntimeGameApp.tsx`
- `src/runtime/sdk/server/{game-media-middleware.ts,vite.config.ts}` + test
- `src/runtime/sdk/standalone/{main.tsx,styles.css,wb-game-video.html}`
- `src/runtime/sdk/tsconfig.json`

### 2. Build scripts

恢复删除前脚本，并重新挂进 `build`：

```json
"build:standalone": "tsc -p src/runtime/sdk/tsconfig.json && vite build --config src/runtime/sdk/server/vite.config.ts",
"start:standalone": "bun run build:standalone && vite preview --config src/runtime/sdk/server/vite.config.ts",
"build": "bun run build:frontend && bun run build:backend && bun run build:standalone && bun run check:release"
```

Standalone Vite 仍输出到 `dist/standalone/`（既有 `files: ["dist", …]` 会打进 npm pack）。

### 3. Package exports（最小对外调整）

在保留现有 `.` / `./host` / `./styles.css` 前提下增加：

| Export | Target | 用途 |
|--------|--------|------|
| `./standalone` | `./dist/standalone/wb-game-video.html` | 独立播放页入口（构建产物） |

**实现备注（2026-08-06）：** 未导出 `./runtime/sdk/client` 源码路径——`game-package-client` 依赖整棵 `src/runtime/schema`，半截导出不可用；程序化 SDK 导出留给附录 D 映射轮（bundled dist entry）。Standalone 产物经 `files: ["dist", …]` 进入 npm pack。

### 4. Docs touch

- `docs/outbound-apis.md` 附录 C：标记为已恢复，指向本 spec + 恢复提交
- 附录 D.4：明确「源码恢复已完成；映射实现仍未开始」
- `AGENTS.md` / `README.md`：补一句 `build:standalone` / `start:standalone`（英文 UI 字符串规则不适用文档中文说明）

### 5. Verification

1. `bun test src/runtime/sdk`（或 vitest 覆盖 sdk client + middleware tests）——先红后绿仅当恢复不完整
2. `bun run build:standalone` 产出 `dist/standalone/wb-game-video.html`
3. `bun run build`（含 standalone）与 `bun run check:release` 通过
4. 不回归：`bun test server/release-contract.test.ts` / 现有 host 相关测试

## Risks

| Risk | Mitigation |
|------|------------|
| `RuntimeGameApp` → `loadGameComponents(gameId)` 无 `moduleUrl` → 组件加载 no-op | 接受为 A 边界；记入 outbound-apis 待映射/适配轮 |
| standalone 仍硬编码 `/api/game-host`、`/__gva__` | 与删除前一致；EA 原样可用；其他宿主等附录 D |
| `tsc -p src/runtime/sdk/tsconfig.json` 与当前 `src/runtime` 类型漂移 | 恢复后修编译错误时只做类型适配，不改 SDK 行为语义 |

## Approval

User approved **Approach A** in chat (2026-08-06). This written spec is the review gate before plan + implementation.
