# docs/archive 索引

> 0.1.122 B3 建立（工单 docs/2026-11-17-0122-docs-normalization-ticket.md @59b51175）。
> 归档判据（格 4 三条件合取式，零主观裁）：① 头注状态 ∈ {收口, 终态}（B2 状态机字段）∧ ② `git log -1 --format=%cs` 实质 commit 龄 ≥30 天（禁文件名前缀做龄）∧ ③ 非白名单（SRI/、release-governance.md、纲要/制度/spec 活文档）。
> 任何一条不满足 = 留置 docs/ 根目录。

## 2026-10/（21 件，2026-11-17 归档）

| 原路径（docs/） | 归档路径（docs/archive/2026-10/） | git 龄 | 状态 |
|---|---|---|---|
| 2026-10-04-brand-assets-audit.md | 同名 | 2026-10-04 | 收口 |
| 2026-10-05-p0-closure-status.md | 同名 | 2026-10-05 | 收口 |
| 2026-10-13-p0-goal-eval-card.md | 同名 | 2026-10-13 | 收口 |
| 2026-10-13-p0-wave-0156-ticket.md | 同名 | 2026-10-12 | 收口 |
| 2026-10-13-p0-wave-0157-ticket.md | 同名 | 2026-10-12 | 收口 |
| 2026-10-13-p0-wave-0158-ticket.md | 同名 | 2026-10-12 | 收口 |
| 2026-10-13-p0-wave-0159-ticket.md | 同名 | 2026-10-12 | 收口 |
| 2026-10-13-p0-wave-0160-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-13-p0-wave-0161-ticket.md | 同名 | 2026-10-13 | 收口 |
| 2026-10-13-p0-wave-0162-ticket.md | 同名 | 2026-10-13 | 收口 |
| 2026-10-13-p0-wave-0164-ticket.md | 同名 | 2026-10-13 | 收口 |
| 2026-10-14-p0-wave-0166-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-14-p0-wave-0167-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-14-p0-wave-0168-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-14-p0-wave-0169-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-14-p0-wave-0170-ticket.md | 同名 | 2026-10-14 | 收口 |
| 2026-10-15-p0-wave-0171-ticket.md | 同名 | 2026-10-15 | 收口 |
| 2026-10-15-p0-wave-0172-ticket.md | 同名 | 2026-10-15 | 收口 |
| 2026-10-15-p0-wave-0173-ticket.md | 同名 | 2026-10-15 | 收口 |
| 2026-10-18-mcp-remote-wave-0174-ticket.md | 同名 | 2026-10-15 | 收口 |
| 2026-10-18-p0-wave-0176-ticket.md | 同名 | 2026-10-18 | 收口 |
| atlas-config-reference-and-template.md | 同名 | 2026-10-19 | 已并入（0.1.122 A3：原路径留 stub 指向 reference/settings.md） |

## 引用面处置判读披露（格 4）

- **活文档引用已改指归档路径**（10 处 sed 精确替换）：docs/assets/wordmark.md、docs/superpowers/specs/2026-10-04-brand-system-design.md、docs/release-governance.md、docs/2026-10-05-live-gateway-classifier-e2e-wave.md、docs/2026-10-06-brand-e2e-collab-protocol.md、docs/2026-10-06-0.1.33-deferred-tracker.md、docs/2026-10-13-p0-wave-0163-ticket.md、docs/2026-10-14-p0-q3-subagent-eval-card.md、docs/2026-10-14-p0-closure-audit.md、docs/timeout-params-table.md。
- **历史冻结记录不回写**（判读披露，格 1/格 6 禁触面）：CHANGELOG.md、user-e2e/reports/*.md、user-e2e/*.ts 探针、tests/unit|func/*.test.ts 中的旧路径提及为**溯源文本非导航链接**——历史记录零回写纪律（0.1.105 零触碰先例同形）；旧路径解析以本索引为路由表。
- **归档件互引**（archive 内部旧路径提及）不回写（历史记录零回写）。
