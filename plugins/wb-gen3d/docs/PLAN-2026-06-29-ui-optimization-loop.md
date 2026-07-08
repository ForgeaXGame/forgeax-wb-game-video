# PLAN 2026-06-29 — wb-character × wb-gen3d UI 优化自动 LOOP

> **状态**: PLAN · 2026-06-29 Asia/Hong_Kong · 未实现 — 待 P0 前提 + M0 baseline 后 arm LOOP
> **Owner**: laurenceelu
> **分支**: `laurenceelu/feat-20260629-character-gen3d-ui-agent-refactor`（studio + marketplace + wb-character 子仓同名，均未 push）
> **关联**: [`PLAN-2026-06-25-staged-character-gen3d-flow.md`](./PLAN-2026-06-25-staged-character-gen3d-flow.md)（2D→3D 分阶段体验修复，本 LOOP 的 Gate B 流程正确性来源）、[`PLAN-2026-06-25-migrate-to-forgeax-core.md`](./PLAN-2026-06-25-migrate-to-forgeax-core.md)（迁移 SSOT）
> **UI 规范 SSOT**: `forgeax-editor-ui-pattern` skill → `packages/interface/src/styles/{tokens.css,motion.css,DESIGN-SYSTEM.md}` + `.cursor/rules/ui-token-alignment.mdc`
> **验证设施**: `cursor-ide-browser` MCP（浏览器自动化 + 截图）+ `~/.claude/skills/playwright` + vitest；截图归 `.playwright-mcp/`（按 `docs/testing.md` 约定）

---

## 0 · 决策摘要

| 维度 | 选择 | 备注 |
|---|---|---|
| 达标 | 组合：机械对齐（Gate A）+ 流程正确性（Gate B）+ LLM 视觉评分（Gate C） | 三闸门全绿才算 pass |
| 机制 | `/loop` 定时调度，每 tick 一次 assess-fix，全绿即停 | 基础间隔 5min，`loop` skill dynamic pacing 按需调 |
| 范围 | wb-gen3d（React/Vite）+ wb-character（vanilla TS 子模块）全量 UI | 两架构不同，build 管线分别处理 |

---

## 1 · 架构现状与硬约束

| 项 | 现状 |
|---|---|
| wb-gen3d | React + Vite，已在 worktree，standalone `:15176` / 嵌入 Studio `:18920`，token-aligned `styles.css`（`src/styles/tokens.css`） |
| wb-character | vanilla TS Web Component（`src/shared/CharacterDesign.ts` ~1700 行类组件），**独立子模块** `forgeax-wb-character.git`，worktree 里**未 init**（marketplace gitlink 指向 `f3ba642`） |
| Stack | `bash start.sh` → server `:18900` / ui `:18920` / engine `:15173`；插件渲染在 iframe（sandbox） |
| 验证设施 | 无持久化 Playwright 套件；`cursor-ide-browser` MCP 可用；vitest 有单测；CI 不跑 Playwright |
| UI 规范 SSOT | `forgeax-editor-ui-pattern` skill（slot map + 状态 + icon 语义 + token 对齐） |

**硬约束（`docs/donts.md` + `forgeax-editor-ui-pattern` Hard Boundary）**：
- 不 `pkill` 服务；不 10s 内重启 server 5+ 次；HMR 不重启 server（改 server 代码才重启且 >10s 间隔）
- UI-only：禁动 prompt / 生成参数 / 模型路由 / pipeline 逻辑 / 存储 / API payload / domain schema / 用户内容
- 越界先停下问 owner，不擅自改插件目录外代码（`marketplace/src/system-prompt/` 等需单独授权）

---

## 2 · 达标三闸门（每轮全跑）

### Gate A · 机械对齐（零主观，可程序化）

| 编号 | 检查 | 工具 | 通过条件 |
|---|---|---|---|
| A1 | token 对齐：扫 `*.tsx/.ts/.css`（除 `tokens.css`）硬编码 `#hex`/`rgb()`/`rgba()` | ripgrep | 0 命中 |
| A2 | 状态覆盖：每个数据驱动组件含 `empty/loading/error/disabled` 四态 class 与渲染分支 | ripgrep + 人工 | 全覆盖 |
| A3 | focus 可达：键盘 tab 遍历所有交互件，focus ring 用 `--color-focus`，无 `outline:none` 裸奔 | ripgrep + 浏览器 tab | 全可达 |
| A4 | pattern slot 对齐：左 sidebar / preview / actions / history 四 slot 按 `forgeax-editor-ui-pattern` 落位 | skill 清单 | 全对齐 |

辅证：`tsc --noEmit` 干净 + `bun packages/types/test/validate-manifests.ts` 57/57 ok。

### Gate B · 流程正确性（浏览器自动化，`cursor-ide-browser` MCP）

| 编号 | 流程 | 通过条件 |
|---|---|---|
| B1 | wb-character：concept 候选 → 用户选 → final phase | final phase 有「生成 3D 四视图」+「送去 3D」按钮，存在且可点 |
| B2 | wb-gen3d：`views-to-3d` 完成后 | 默认只交付静态 3D，不自动 rig/animate |
| B3 | 确认门：`auto-rig`/`apply-motion` | 触发真实 `ConfirmDialog`，拒绝/超时不执行；`confirmId`/`token` 不漂移、不双弹（toast vs modal） |

工具链：`browser_navigate` → `browser_snapshot` → `browser_click` 走流程 → `browser_take_screenshot` 存证。
参照：[`PLAN-2026-06-25-staged-character-gen3d-flow.md`](./PLAN-2026-06-25-staged-character-gen3d-flow.md) §2 目标体验 + §7 v3 修正（toast 已能弹、只修 modal）。

### Gate C · LLM 视觉评分（主观，截图 agent 判）

| 编号 | 项 | 内容 |
|---|---|---|
| C1 | 截图清单 | empty / loading / result / error / final-phase / motion-browser / credentials-modal / asset-library |
| C2 | 评分维度 | 视觉层级 / 间距一致 / 状态清晰 / 与主仓 design system 一致 / 无错位溢出 |
| C3 | 阈值 | 每屏 ≥ 4/5 且无 critical 项；不达标 → 记 issue 入 backlog |

工具：`browser_take_screenshot` → agent 读图打分；证据存 `.playwright-mcp/ui-loop-<N>-<screen>.png`。

---

## 3 · LOOP 机制（`/loop` 定时调度）

**调度**：背景 shell sentinel `AGENT_LOOP_TICK_ui-opt`，基础间隔 5min。`loop` skill 原生支持 dynamic pacing——build 慢则拉长、fix 快则缩短，不硬绑 5min。

**每 tick 一次 assess-fix cycle**：

1. 读 `.ui-loop/issues.json` 当前未达标 backlog
2. build 受影响插件（wb-gen3d HMR 多数免 build；wb-character 改 `.ts` 跑其 build）
3. 跑 Gate A（ripgrep）→ Gate B（浏览器走流程）→ Gate C（截图判分）
4. 选当前**最 cheap / 最 critical** 的 issue 修**一处**（surgical change，见 Karpathy §3）
5. `tsc --noEmit` + 相关 vitest → Conventional Commits（真人 author + `Co-Authored-By: Claude`）
6. 更新 `issues.json`；**三闸门全绿 → 停 loop**

**停止条件**：三闸门全 pass ／ 迭代上限到 ／ owner 喊停 ／ 预算耗尽。

**提交纪律**：每轮一 commit（`feat(wb-gen3d):` / `fix(wb-character):` / `style(wb-gen3d):` 等 scope）；每 5 轮 push 一次留 review 链；wb-character 改完 → marketplace bump gitlink → studio bump marketplace。

---

## 4 · 前提步骤（blocker，LOOP 前先做）

- **P0a** worktree init wb-character 子模块：
  `git -C packages/marketplace submodule update --init plugins/wb-character`
- **P0b** wb-character 子仓建同名分支，确认 base（migration 分支 `f3ba642` 是否已合 wb-character main；未合则以 `f3ba642` 为 base）
- **P0c** 起 Stack：`bash start.sh`，`curl localhost:18900/api/cli/health` 验 `claude-code: ok=true`
- **P0d** 首轮 baseline 全量扫描三闸门 → 产出 `issues.json` backlog + 截图基线（`.playwright-mcp/baseline-*.png`）→ owner 过一眼再 arm LOOP

---

## 5 · 里程碑

| M | 内容 | 验证 |
|---|---|---|
| M0 | 前提 + baseline 扫描 | `issues.json` + 基线截图齐全，owner 确认方向 |
| M1 | Gate A 机械对齐全绿 | ripgrep 0 命中 + tsc 干净 + manifest 57/57 |
| M2 | Gate B 流程正确性 | 浏览器走完 2D→3D 分阶段 + 确认门不双弹 |
| M3 | Gate C 视觉评分达阈值 | 每屏 ≥4/5 无 critical |
| M4 | 收尾：push → PR → self-merge | CI 绿 + 真机目视签字 |

---

## 6 · 风险与护栏

| 风险 | 护栏 |
|---|---|
| 无限循环 | 每 issue 最多修 3 次，3 次不过 → 标 `manual` 升级给 owner |
| server 烤坏 | HMR 不重启 server；仅改 server 代码才重启且 >10s 间隔（`donts.md` 末条） |
| 子模块指针漂移 | wb-character 改完 → marketplace bump gitlink → studio bump marketplace（三仓提交链） |
| 预算失控 | 迭代上限默认 60 轮，到顶停 + 报告剩余 backlog |
| 越界改业务 | UI-only，禁动 prompt/生成/路由/schema（Hard Boundary），越界先停下问 owner |
| 隔夜裸跑 | 每 5 轮 push 一次留 review 链；`issues.json` 可随时查进度；baseline 先 owner 签字再 arm |

---

## 7 · 产物

- `plugins/wb-gen3d/docs/PLAN-2026-06-29-ui-optimization-loop.md`（本计划，SSOT）
- `.ui-loop/issues.json`（backlog + 状态，gitignored）
- `.playwright-mcp/ui-loop-*.png` + `baseline-*.png`（截图证据，按 `docs/testing.md` 约定）
- 每轮 Conventional Commits + 最终 PR

---

## 8 · 开放决策（待 M0 baseline 后定）

- 迭代上限默认 60 轮，可调
- `/loop` 间隔默认 5min dynamic
- LLM 视觉评分阈值默认 ≥4/5 且无 critical
- 是否把 wb-character 拆成独立子 LOOP（取决于 baseline 时 wb-character 子模块 init 后的 issue 量）
