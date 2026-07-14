# ADR-0008 — 游戏默认动作档案 + 角色覆盖 + 可玩接线清单

- **Status**: 🟡 Proposed（随 PLAN-2026-07-13 Import to Game Review 2；Owner 勾选可执行前未编码）
- **Date**: 2026-07-13
- **Deciders**: laurenceelu
- **Extends**: ADR-0002（per-game 文件资产）、ADR-0003（rig/motion 产物契约）、ADR-0006（Meshy 公网动作体系）
- **执行计划**: [`../PLAN-2026-07-13-import-to-engine.md`](../PLAN-2026-07-13-import-to-engine.md)

## Context

把 gen3d 角色送进游戏时，Hellforge 今天靠手工合并脚本 + 在 `main.ts` 里抄 GUID。不同游戏需要的动作槽不同（基础角色只要待机/移动；动作冒险要攻击/受击/死亡；平台跳跃要跳跃/下落）。若把契约写死成「全局五槽」或「只属于单个角色、游戏无默认」，会出现：

1. 新游戏无法复用合理默认；
2. 同一游戏内 NPC/主角又确实需要差异；
3. 循环、速度、root motion 等高级设置写不进引擎 `*.meta.json`（schema 不允许私有字段），写进 GLB 也不等于游戏已接线。

## Decision

1. **四层模型**：内置动作预设 → 游戏默认动作档案 → 角色动作覆盖 → 动作映射。
2. **v1 内置四个预设**：基础角色 / 动作冒险 / 平台跳跃 / 空白自定义；空白至少 1 个必需槽才能导出。
3. **默认编辑范围**：向导里改槽默认只写当前角色覆盖；另设明确按钮「保存为游戏默认」。
4. **交付三件套**：`*-merged.glb` + 引擎 `*.glb.meta.json` + `*.glb.playable.json` 接线清单。接线清单供游戏 Agent/人工接线，**本次不自动改游戏代码**。
5. **语义身份**：clip GUID 按稳定 `slotKey` 记在私有注册表；引擎 meta 仍用 `(kind, sourceIndex)`，但 sourceIndex 不假装是跨游戏永恒五槽序号。
6. **Root motion**：按槽在合并时处理（保留 / 去 XZ / 去 XYZ），并写入接线清单。

## Alternatives considered

- **全局固定五槽**：被否——不能适配不同游戏。
- **只做每角色模板、无游戏默认**：被否——每个新角色都要从头选，缺少稳妥默认。
- **从游戏代码自动反推槽**：被否——当前游戏没有可读契约；Hellforge 是硬编码 GUID。
- **只交付 GLB+引擎 meta，不写 playable.json**：被否——高级字段会丢失，后续仍只能手工抄 GUID。
- **自动改 `main.ts`**：被否——超出 marketplace 插件边界与本任务范围。

## Consequences

**正面**：同一套插件能力可服务多种游戏；单角色仍可微调；交付物自带接线说明书；引擎 scanner 不被私有字段污染。

**负面 / 风险**：状态机比「一键五槽」复杂（向导、迁移审阅、接管）；执行 Agent 必须严格按 PLAN §1 新代号，不能回退到旧 PROFILE*/ANIM1 口径。
