# Reia · 累积 lessons

这文件是 Reia 自己在每个 phase 收尾时手写的「下次别再犯」。AI 只 append 不重写。

## 2026-05-28 · 初始化
- 记忆系统就位
- 首版工具集对接的是 wb-reel 的 6 个 tool（list/get/save scenario + list-assets + generate/get video task）
- 注意：Seedance 任务异步，submit 后必须用 taskId 轮询 `reel:get-video-task`
