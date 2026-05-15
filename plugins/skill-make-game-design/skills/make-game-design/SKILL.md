---
id: make-game-design
trigger: /make-game-design
description:
  zh: 起一个游戏设计草稿（玩法 / 数值 / 角色 / 章节）
  en: Draft a game design (gameplay, numbers, characters, chapters)
allowedTools:
  - balance:resim
allowedAgents:
  - cc-coder
---

# /make-game-design

> 占位 · Phase 4+ 拆 plugin 时填实际指引。

## 触发场景

玩家想要从一个想法快速产出可玩 demo 的最小设计文档。

## 流程提纲

1. 问玩家一句话愿景 + 平台（web / 手机 / PC）。
2. 锁玩法：1–3 个核心动词。
3. 列 5–10 个角色草图（id / role / avatar / stat shape）。
4. 写章节大纲（3–5 章 · 各章目标 + 节奏关键词）。
5. 调用 `balance:resim` N=100 跑数值假设并写回备注。
6. 输出 `design/<slug>.md` 到 workspace。

## 后续

完整规范在 Phase 4 拆 plugin 时补 — 当前仅占位以满足 schemaValidation §530 与 spec §359-§384 的 SKILL.md 入口约定。
