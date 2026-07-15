# HANDOFF 2026-06-29 — UI Optimization Auto-LOOP 接手

> **状态**: HANDOFF · 2026-06-29 Asia/Hong_Kong · P0a/P0b 已完成，P0c/P0d 待跑，LOOP 未 arm
> **主计划（SSOT）**: [`PLAN-2026-06-29-ui-optimization-loop.md`](./PLAN-2026-06-29-ui-optimization-loop.md)
> **分支**: `laurenceelu/feat-20260629-character-gen3d-ui-agent-refactor`（studio + marketplace + wb-character 三仓同名，**均未 push**）
> **worktree**: `forgeax-studio/.worktrees/laurenceelu-feat-20260629-character-gen3d-ui-agent-refactor/`
> **目的**: 给接手 agent 一个能直接续跑的入口——读完本文件 + 主计划即可跑 P0c/P0d 并 arm LOOP。

---

## 1 · 接手先读顺序

1. 本文件（现状 + 已知坑）
2. [`PLAN-2026-06-29-ui-optimization-loop.md`](./PLAN-2026-06-29-ui-optimization-loop.md) 全文（SSOT，三闸门 + LOOP 机制 + 里程碑）
3. [`PLAN-2026-06-25-staged-character-gen3d-flow.md`](./PLAN-2026-06-25-staged-character-gen3d-flow.md) §0–§4 + §7 v3 修正（Gate B 流程正确性的来源）
4. `forgeax-editor-ui-pattern` skill（Gate A 机械对齐 + slot map 的参照）
5. 两插件 UI 入口：
   - wb-gen3d：`src/App.tsx` + `src/components/{SetupSidebar,Workspace,ModelViewer,MotionBrowser,AssetLibrary,CredentialsModal,QualityInspector}.tsx` + `src/styles.css`
   - wb-character：`src/shared/CharacterDesign.ts`（~1700 行 vanilla TS Web Component，final phase 在 `renderFinalCenter()`）

---

## 2 · 当前进度

| 步骤 | 状态 | 证据 |
|---|---|---|
| 计划落档 | ✅ | `PLAN-2026-06-29-ui-optimization-loop.md`（marketplace `2eab4a3`）+ studio gitlink bump（`139e42f`） |
| P0a init 子模块 | ✅ | studio 级 `cli/editor/engine/kernel` + `marketplace/server/interface` 全 init；wb-character 子模块已 init |
| P0b 三仓分支 | ✅ | studio / marketplace / wb-character 均在 `laurenceelu/feat-20260629-character-gen3d-ui-agent-refactor` |
| wb-character base | ✅ | `440cf6d` = wb-character main tip（migration 已经 PR #1 合入 main）；feature 分支从 main 切出，ready for 新 UI 工作 |
| P0c 起 stack | ⏳ | 未跑 `bash start.sh`；未验证 `curl localhost:18900/api/cli/health` |
| P0d baseline 扫描 | ⏳ | 未产出 `issues.json` + 基线截图 |
| arm LOOP | ⏳ | 待 owner 签字 baseline 后再 arm |

**未提交**：marketplace 有 `M plugins/wb-character`（gitlink `f3ba642`→`440cf6d`，追赶 wb-character 已合并的 main）——本 handoff commit 会一并 bump。

---

## 3 · 三仓分支与提交链

```
studio (worktree)        ── records ──> marketplace gitlink
  └─ packages/marketplace ── records ──> wb-character gitlink
       └─ plugins/wb-character (own repo, own branch)
```

- **改 wb-character** → wb-character 子仓 commit → marketplace bump wb-character gitlink → studio bump marketplace gitlink（三仓提交链）
- **改 wb-gen3d**（marketplace 内普通目录）→ marketplace commit → studio bump marketplace gitlink（两仓）
- 同名分支 `laurenceelu/feat-20260629-character-gen3d-ui-agent-refactor` 贯穿三仓
- 主目录 `forgeax-studio/` 留在 `main`（worktree 纪律），分支工作只在 worktree
- Conventional Commits + 真人 author（git config = `laurenceelu <laurenceelu@tencent.com>`）+ `Co-authored-by: Cursor <cursoragent@cursor.com>`
- 不 rebase（用 `git merge origin/main`）；不直接 push main；不 push 未确认的本地补丁

---

## 4 · 下一步动作（接手 agent 执行）

### P0c 起 stack
```bash
cd /Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/.worktrees/laurenceelu-feat-20260629-character-gen3d-ui-agent-refactor
bash start.sh   # server :18900 / ui :18920 / engine :15173
# 另一终端验通：
curl http://localhost:18900/api/cli/health   # 期望 claude-code: ok=true
```
端口被占：`bash scripts/stop.sh --force` 后再起。**不要 `pkill`**。

### P0d baseline 扫描
1. **Gate A 机械**：ripgrep 扫两插件 `*.tsx/.ts/.css`（除 `tokens.css`）硬编码 `#hex`/`rgb()`；扫 `outline:none` 裸奔；核对每组件 empty/loading/error/disabled 四态
2. **Gate B 流程**：用 `cursor-ide-browser` MCP 走 wb-character concept→final→「生成 3D 四视图」+ wb-gen3d `views-to-3d` 静态交付 + `auto-rig`/`apply-motion` ConfirmDialog
3. **Gate C 视觉**：`browser_take_screenshot` 截 8 屏（empty/loading/result/error/final-phase/motion-browser/credentials-modal/asset-library）→ agent 读图打分
4. 产出 `.ui-loop/issues.json`（backlog + 状态）+ `.playwright-mcp/baseline-*.png`（基线截图）
5. **owner 过一眼 baseline** → 认可方向后再 arm LOOP

### arm LOOP（baseline 签字后）
- 用 `loop` skill arm 背景 sentinel `AGENT_LOOP_TICK_ui-opt`，基础间隔 5min（dynamic pacing）
- 每 tick：读 issues.json → build → 跑三闸门 → 修最 cheap/critical 一处 → tsc+vitest → commit → 更新 issues.json → 全绿停
- 停止条件：三闸门全 pass ／ 60 轮上限 ／ owner 喊停 ／ 预算耗尽
- 每 5 轮 push 一次留 review 链

---

## 5 · 已知坑（避雷）

| 坑 | 现象 | 规避 |
|---|---|---|
| worktree 根 `ls` 卡死 | `ls` worktree 根 60–135s 无输出后 abort（疑似未 init 子模块 gitlink 让 stat 卡） | **别 `ls` 根目录**；用 `git submodule status <path>` 或 `git ls-files` 定点查 |
| server watch 烤坏 | <10s 连续 reload 5+ 次会让 bun watch 丢端口 | HMR 不重启 server；改 server 代码才重启且 >10s 间隔 |
| 双弹确认 | toast（`useConfirmToast`，token）今天能弹；modal（`ConfirmDialog`，confirmId）断 | 只修 modal，别同时保留 toast，否则双弹（PLAN-2026-06-25 §7-B1） |
| wb-character 是子模块 | `plugins/wb-character` 是 `forgeax-wb-character.git` 子仓，不是普通目录 | 改它要在子仓内 commit，再 marketplace bump gitlink |
| UI-only 越界 | Hard Boundary 禁动 prompt/生成/路由/schema/storage/API payload | 越界先停下问 owner，不擅自改 `marketplace/src/system-prompt/` 等插件目录外代码 |
| 主目录不切分支 | 主目录 `main` 是 worktree 纪律 | 分支工作只在 `.worktrees/` 里 |

---

## 6 · LOOP 运行指引摘要（详见主计划 §2/§3）

- **Gate A（机械）**：A1 token 对齐 0 硬编码 / A2 四态覆盖 / A3 focus 可达 / A4 pattern slot 对齐
- **Gate B（流程）**：B1 wb-character 四视图按钮 / B2 wb-gen3d 静态优先 / B3 确认门不双弹
- **Gate C（视觉）**：8 屏每屏 ≥4/5 且无 critical
- 三闸门全绿才算 pass；每轮一 commit；每 issue 最多修 3 次，3 次不过标 `manual` 升级 owner

---

## 7 · 开放决策（M0 baseline 后定）

- 迭代上限默认 60 轮，可调
- `/loop` 间隔默认 5min dynamic
- LLM 视觉评分阈值默认 ≥4/5 且无 critical
- 是否把 wb-character 拆成独立子 LOOP（取决于 baseline 时 wb-character 的 issue 量）
