# HANDOFF — Import to Game / 导出可玩角色（审阅用）

> **状态**：🟢 DONE（PLAN §6 完成 · §8 已勾 · 2026-07-14）  
> **日期**：2026-07-13（收口 2026-07-14）  
> **执行 / 产品 SSOT**：[`PLAN-2026-07-13-import-to-engine.md`](./PLAN-2026-07-13-import-to-engine.md)  
> **长期决策**：[`adr/0008-game-default-motion-profile-and-playable-wiring.md`](./adr/0008-game-default-motion-profile-and-playable-wiring.md)  
> **插件**：wb-gen3d + wb-ai-asset  
> **分支**：`laurenceelu/feat-20260713-wb-gen3d-ai-asset`

---

## 1. 给下一位 reviewer 的 30 秒

用户要的是：工作台里点按钮 → 游戏 Edit 认得出资产。

- **道具**：办引擎身份证（`*.glb.meta.json`）。文案 = **导入到游戏**。ai-asset 生成时多半已办过；缺 UI / 重试；Draco 在**手动导入时**转成兼容 GLB。
- **角色**：首次 = 导出向导（游戏默认档案 + 角色覆盖 + 动作映射）→ 合并 → 写三件套（merged GLB + 引擎 meta + `*.playable.json`）；后续配置未变 = **一键更新**。

已拍板：见 PLAN §1（含 PROF*/ANIM2/DRACO1/ADOPT1/DELIV1 等；旧 PROFILE*/ANIM1/「导入引擎」已正式替换）。

---

## 2. 先读什么（按顺序）

1. PLAN §0–§1（目标 + 决策表 + §1.1 旧决策替换表）
2. PLAN §4（四层领域模型 + 四预设 + 向导流程）
3. PLAN §5–§6（技术约束 + 批次）
4. ADR-0008
5. 本文件 §3 审阅清单 → 意见写入 §5

可选对照：

- `wb-ai-asset/server/external-meta-cook.ts`
- `wb-gen3d/server/per-game-store.ts`（误删 `.meta.json`）
- `wb-gen3d/src/components/Workspace.tsx` / `ModelViewer.tsx`
- hellforge `merge-gen3d-motions.ts`（算法参考；逻辑要收进插件）

---

## 3. 审阅清单（每轮打勾）

### 产品

- [ ] 道具「导入到游戏」与角色「导出/更新可玩角色」是否分得清
- [ ] 四预设 + 游戏默认 + 角色覆盖是否可接受
- [ ] F1（只缺必需槽拒绝）与可选槽为空是否可接受
- [ ] 是否接受 v1 **不**改 `main.ts` / 只交付 `*.playable.json`
- [ ] Draco 手动导入时同路径转换是否可接受

### 技术

- [ ] 共享 cook（S1）+ Gate 0 是否 OK
- [ ] 语义 GUID（slotKey 注册表）+ `(kind,sourceIndex)` 是否讲清
- [ ] gen3d 修 list/write 是否足够避免扫崩 / 误删
- [ ] 合并进插件 + root motion 按槽处理是否越界可控
- [ ] 三件套原子写 / 回滚是否够用

### 文案 / UX

- [ ] T1 中英是否定稿
- [ ] 向导首次 / 一键后续是否清楚
- [ ] 失败提示是否够白话

---

## 4. Owner 闸门

- [x] Review 轮次足够，§1 决策不再改（或已写入 PLAN §10）
- [x] **可执行** — owner 勾选后，执行 agent 才允许按 PLAN §6 开工（2026-07-13 Owner 口头确认开工）
- [x] **DONE** — §6 步 1–12 已落地；§8 九条已勾（2026-07-14）
- [x] 执行期间若改决策：先改 PLAN §1 + §10，再改代码（本轮无决策回滚；仅修预览 URL / Assets 文案）

---

## 5. 审阅意见区（追加，不要删旧条）

### 轮次 0 — 2026-07-13（建档）

- 初稿落地；决策已与 owner 口头确认：A / S1 / N / M1 / P1 / T1 / F1。

### 轮次 0.5 — 2026-07-13（neat-freak 文档对齐）

- 同步 CONTEXT / ai-asset 旧 PLAN 警告 / CURSOR_HANDOFF / 记忆。产品决策未改。

### 轮次 1 — 2026-07-13 / GPT-5.6 Sol

**结论：有条件建议，暂不要勾「可执行」。**  
补齐动画 subAssets、GUID 复用、resolver、Gate 0、事务写等。

### Grill 轮次 1–13 + 多轮 code-check — 2026-07-13

- 逐步补 MAP/ID/UX/HIST/ROLE/AI/LIFE/PROFILE*/TEX1 等。
- 其中多条（尤其 PROFILE* / ANIM1 / Draco 永拒）在 Review 2 被正式替换。
- 执行 Agent **以 PLAN §1 新表为准**，不要按本段历史意见实现旧口径。

### 轮次 2 — 2026-07-13 / Grill-with-docs 重写

**结论：文档已按新领域模型整页重写；仍不要勾「可执行」，等 Owner 审阅新 §1。**

#### 本轮拍板并写回 PLAN 的关键变更

1. **可玩角色必须适配不同游戏** → 游戏默认动作档案 + 角色覆盖（PROF1/6）。
2. **四个内置预设**（基础角色 / 动作冒险 / 平台跳跃 / 空白自定义）。
3. **必需 vs 可选槽**；空白预设至少 1 个必需槽。
4. **首次向导 / 后续一键更新**；档案变化强制迁移审阅。
5. **高级槽字段** + **合并时按槽处理 root motion**（ANIM2 替换 ANIM1）。
6. **交付 `*.playable.json`**，不改游戏代码（DELIV1）。
7. **同一源动作可填多槽**（复制独立 clip）。
8. **道具文案改为「导入到游戏」**；Draco 在显式导入时转换覆盖（DRACO1/AI2）。
9. **已有手工 merged 可确认接管**（ADOPT1）。
10. **导出后必须能预览最终 merged 的逐槽动画**（PREV1）。

#### 文档同步

- PLAN 全文重写（含 §1.1 旧决策替换表、§6 新批次）。
- CONTEXT 术语改为四层模型 + 接线清单。
- 新增 ADR-0008。
- 本 handoff §1/§3 改为新口径；Owner 闸门仍未勾选。

#### 下一轮 Owner 只需确认

1. PLAN §1 新决策表是否签字。
2. 四预设默认槽表（PLAN §4.2）是否接受。
3. 勾选本文件 §4「可执行」后，执行 Agent 才可按 §6 开工。

---

## 6. 执行时提醒（开工后才相关）

- 只动 `packages/marketplace/extensions/**`（含拟议的 `_shared`）。
- 改 `src/**` → 插件目录 `bun run build` → Studio 硬刷。
- gen3d `bun test` 必须覆盖 `src server shared`（PLAN §6 要求改 package.json）。
- 不主动 commit；owner 要求再提。
- 验证以 hellforge + ✎ Edit 资产面板为准；成功 ≠ 已改主角代码。

---

## 7. 收口记录（2026-07-14）

**结论：PLAN 标 DONE；§8 九条已勾（详见 PLAN §8 证据注）。**

Marketplace tip（收口时）：

- `5640093` fix(wb-gen3d): 可玩预览改走 `/preview` + Assets 找子资产说明
- 此前：`e1a1d96`…`e81f1c9`（Gate0 → 步 12）

眼验要点：

- Edit → Assets → `assets/characters/` 可见 `char1` + `idle/move/attack/hit/death`（= `gta-01-merged` 子资产）
- 工作台预览须用 `/preview/.forgeax/games/<slug>/assets/characters/…`（旧 `/api/game-assets/.../characters` 会 404）
- 不改 `main.ts` / 不自动进 Scene Hierarchy
