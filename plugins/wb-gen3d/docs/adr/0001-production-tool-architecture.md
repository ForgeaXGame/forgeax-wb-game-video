# ADR-0001 — 生产工具架构（非 benchmark）

- **Status**: Accepted
- **Date**: 2026-06-09
- **Deciders**: laurenceelu

## Context

`wb-gen3d` 从 `hunyuan3d-lab`（多 provider 对比沙盒）迁移而来。Lab 的核心是 benchmark/对比——同 prompt 跨 provider 横向打分。迁移初期（M0-M2）沿用了 benchmark 思路（`BenchmarkResultSummary`、`QUALITY_RUBRIC`、对比集）。

2026-06-09 明确产品方向：**wb-gen3d 是生产工具，不是 benchmark 工具**。目标是用户选 provider + 输入 → 产出持久的游戏可用 3D 资产。Provider 对比结论作为背景知识保留在文档里，不进运行时。

## Decision

### 产品方向

- wb-gen3d = 3D 资产生成入口（生产工具）。
- 不做 provider 横向对比报告、质量评分排行、对比集聚合。
- Lab 的 benchmark 结论只作文档背景，不进代码或 UI。

### 模块拆分

- `wb-gen3d`：生成（text/image/views → mesh）+ `pose_standardization`（图片预处理）。
- `wb-3d-pipeline`（未来）：后处理流水线（拓扑 + 绑骨 + 动画）。
- 两者通过 `Gen3DAssetManifest` 契约传递。

### 内部架构（6 个解耦关注点）

```
server/
  providers/   ← 跟远端 API 说话，返回 ProviderResult
  cache.ts     ← hash→assetId 映射（去重）
  rate-guard.ts
  audit.ts
  asset-store.ts ← blob 写入 + manifest 读写
  tool-handlers.ts ← 编排入口
```

关键解耦规则：
- Provider 不知道 cache 和 asset-store 的存在。
- Cache 不存 provider 响应，只存 hash→assetId 映射。
- Asset-store 不知道哪个 provider 产出了它。

### 核心设计选择

| 决策 | 选择 | 理由 |
|---|---|---|
| assetId | 随机 UUID | 3D 生成非确定性，去重由 cache 负责 |
| 资产存储 | 全局库（不绑 game） | 先生成后决定用在哪 |
| Cache 存储 | hash→assetId 映射 | 避免 URL 过期问题 |
| Tool 表面 | 按 mode 分 tool，provider 是参数 | 用户思维是"从什么输入出发" |
| 异步 job | handler 内部阻塞 poll | 简单，AI 一次调用 = 一个资产 |
| Env 注入 | 插件 .env（gitignored） | 最简方案，不改全局 Studio |

### 存储路径

```
.forgeax/assets/gen3d/
  <assetId>/manifest.json
  blobs/<sha256-prefix>/<sha256>.<ext>
```

## Alternatives considered

- **继续 benchmark 方向**：保留评分 rubric 和对比集作为运行时功能。被否：用户需要的是"帮我生成一个能用的模型"，不是"帮我对比三家 provider 哪个好"。
- **资产绑定 game**：manifest 存在 per-game 目录。被否：生成时可能还没建游戏，强制选 game 是摩擦。
- **Cache 存 ProviderResult**：被否：provider URL 会过期，cache hit 时可能返回死链。
- **按 provider 拆 tool**：9+ 个 tool 太多；按 mode 分（3 个）+ provider 参数更自然。
- **异步 job + 独立 poll tool**：增加 AI 认知负担，ForgeaX 场景下不需要并发。

## Consequences

**正面**：
- M1-M2 的 benchmark 代码直接删除，不带技术债进后续里程碑。
- 6 个解耦模块各自可独立测试和替换。
- 下游 `wb-3d-pipeline` 从第一天就有稳定的 manifest 契约可以对接。

**负面**：
- M3 需要重写（而非增量修改）现有 tool-handlers 和 catalog.ts。
- 放弃 benchmark 意味着"哪个 provider 更好"的判断变成纯文档/人工经验，没有运行时数据支撑。
