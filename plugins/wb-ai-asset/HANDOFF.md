# Handoff — wb-ai-asset（Import to Game 相关）

> **2026-07-14 — Import to Game（🟢 DONE · 已合 main `#55` / pin `#397`）。**  
> 跨插件 SSOT = [`../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md`](../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md)  
> ADR = [`../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md`](../wb-gen3d/docs/adr/0008-game-default-motion-profile-and-playable-wiring.md)
>
> **对本插件已落地**：  
> - 生成时引擎 `*.glb.meta.json` cook **保留**。  
> - 显式「导入到游戏 / 重新导入到游戏」+ status；Draco 仅手动导入时规范化。  
> - 共享 cook：`plugins/_shared/external-asset-meta`（S1）。

> 历史方案（管线/路径有漂移，读时注意）：[`docs/PLAN-2026-06-29-wb-ai-asset.md`](./docs/PLAN-2026-06-29-wb-ai-asset.md)
