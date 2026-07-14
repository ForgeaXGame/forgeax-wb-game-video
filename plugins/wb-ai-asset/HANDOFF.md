# Handoff — wb-ai-asset（Import to Game 相关）

> **2026-07-13 — Import to Game 方案 Review 2 已重写（未编码）。**  
> 跨插件 SSOT = [`../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md`](../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md)  
> 审阅入口 = [`../wb-gen3d/docs/HANDOFF-2026-07-13-import-to-engine-review.md`](../wb-gen3d/docs/HANDOFF-2026-07-13-import-to-engine-review.md)  
> ADR = [`../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md`](../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md)
>
> **对本插件的含义（已拍板）**：  
> - 生成时已有的引擎 `*.glb.meta.json` cook **保留**。  
> - 缺口主要是显式「导入到游戏 / 重新导入到游戏」按钮 + 失败说明 + 旧资产补洞。  
> - Draco：生成时不自动转换；用户点导入时再解码并同路径覆盖为兼容 GLB（AI2/DRACO1）。  
> - 办证代码将抽到共享模块（S1），本插件改为引用共享，不重复造 cook。  
> - **不要**在 owner 勾选「可执行」前改代码。

> 历史方案（管线/路径有漂移，读时注意）：[`docs/PLAN-2026-06-29-wb-ai-asset.md`](./docs/PLAN-2026-06-29-wb-ai-asset.md)
