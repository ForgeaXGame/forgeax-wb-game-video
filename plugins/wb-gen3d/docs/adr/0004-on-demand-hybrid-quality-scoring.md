# ADR-0004 — 按需混合质量评分（on-demand hybrid quality scoring）

- **Status**: 混合评分方向 Accepted（2026-06-14）；**Phase A（客观启发式 + 人工覆盖）本期落地**，**Phase B（AI 视觉评）Deferred** — operator 2026-06-14 暂不授权动 `packages/server`，先以 mock 桩交付，真实 AI 接线（授权 server 路由 + 网关多模态 + vision 模型 id）待后续单独授权。
- **Date**: 2026-06-13
- **Deciders**: laurenceelu
- **Extends/Amends**: 演进 ADR-0001 关于质量评分的立场（"手动/带外、不在生成时产出"）。ADR-0001 的生产工具方向、模块解耦、"只暴露已验证"仍成立。ADR-0002/0003 不受影响。

## Context

`wb-gen3d` 的五维质量评分（`geometry / topology / texture / pbr / prompt_fidelity`）
自 M3 起仅作占位：`shared/manifest.ts` 的 `QualityScore` 恒为 `null`，UI
`InspectorReserved` 渲染 disabled 文案，`gen3d:provider-status` 只回传维度名
（`QUALITY_RUBRIC`）。ADR-0001 当时的立场是评分"手动/带外、不在生成时产出"，以
保持生成路径纯净、配额安全，并把 provider 对比留在文档而非运行时。

现 operator 要求把评分真正落地。复盘五个维度的可计算性后发现它们天然分两类：

- **客观可算**（从 GLB/材质即可确定性得出，无需配额）：`geometry`、`topology`
  （受限）、`pbr`、`texture` 的分辨率/存在性部分。
- **主观需视觉**（需"渲染→视觉模型"或人眼）：`prompt_fidelity`、`texture` 的
  接缝/溢色质量。

ADR-0001 的"完全不评分"已不满足需求；但"生成时强制评分 + 远程调用"又会破坏生成纯净与
配额安全。`CAPABILITY_MATRIX` 的 Benchmark Data Requirements 已要求每条评分带
rater/timestamp/notes，指向一个可记录来源的评分模型。

## Decision

采用**按需（on-demand）混合评分**，三来源融合，刻度内部 0–100：

1. **客观启发式（auto）**：在**选中资产时**按需计算（非生成时），纯函数
   `shared/quality/heuristics.ts`，从前端已加载的 three.js 场景与 glTF 材质得出
   `geometry/topology/pbr/texture`。**计算/落库时机（2026-06-14 grill 修订）= lazy**：每次选中即时在
   客户端算 + 即显、**不单独写盘**；仅当人工覆盖或（未来 P4）AI 评分发生时才经 `gen3d:score-quality`
   落库（落库时带上重算的客观维）。原「首次算即落库、之后读缓存」作废——避免浏览资产库即写 sidecar。
2. **AI 视觉评（ai，可选）**：用视图器离屏多角度截图 + prompt，**复用 Studio 已配置模型**
   （经一条授权 server 路由走 `llm-gateway`，见 PLAN §8）评 `prompt_fidelity` 与
   `texture` 质量。**mock-first**：模型未配置则回退（该两维 null + `usedMock`），不报错、不阻塞。
3. **人工覆盖（manual）**：UI 可手动改任意维 + 写 notes。

每维记 `source: 'auto'|'ai'|'manual'`，报告记 `method/rater/notes/scoredAt`，持久化到
sidecar `custom.quality`（新 `QualityReport`），并同步派生回 `manifest.quality` 的数值
字段以兼容跨插件契约。

约束：
- **生成路径不触发评分**（保持纯净/配额安全的 ADR-0001 精神）。
- **GLB 恒三角化** ⇒ `topology` 维只能以"面数预算贴合 + 密度均匀"为主，并引用生成时
  请求的 `topology` 参数；文档诚实标注该局限，不伪装四边拓扑评估。
- AI 评分为**可选、非默认触发**；`gen3d:score-quality` 初期 `exposedToAI:false`。

## Consequences

**正面**
- 评分从死占位变为可用：客观项即时、零配额、确定性、可单测。
- 主观项复用 operator 现成模型，无需另配 VLM key；缺失时优雅降级。
- 来源可追溯（auto/ai/manual + rater/notes），契合基准对比初衷。

**负面/成本**
- 引入一处插件外授权改动（server 视觉路由，PLAN §8），需 operator 授权。
- AI 评分非确定性、消耗配额 ⇒ 以可选触发 + 人工覆盖 + 来源标注缓解。
- `topology` 维受 GLB 三角化限制，信息量有限。
- 新增 `QualityReport` 数据结构与 sidecar 读写路径，`per-game-store` 需带上。

**回退**
- 不配模型 → 仅客观 + 人工，功能仍可用。
- 视觉路由未授权 → Phase B 整体延后，Phase A（客观 + 人工）独立可发。
