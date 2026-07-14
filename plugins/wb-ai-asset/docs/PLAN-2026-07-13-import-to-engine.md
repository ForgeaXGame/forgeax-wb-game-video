# PLAN pointer — Import to Game

跨插件方案写在 wb-gen3d 文档（避免两份 PLAN 漂移）：

- 产品 / 技术 SSOT：[`../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md`](../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md)
- 审阅 / 闸门：[`../wb-gen3d/docs/HANDOFF-2026-07-13-import-to-engine-review.md`](../wb-gen3d/docs/HANDOFF-2026-07-13-import-to-engine-review.md)
- ADR：[`../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md`](../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md)
- 本插件接手摘要：[`../HANDOFF.md`](../HANDOFF.md)

对本插件：保留生成时自动 cook；补「导入到游戏 / 重新导入」UI；Draco 仅在手动导入时转换；cook 改为引用共享模块（S1）。
