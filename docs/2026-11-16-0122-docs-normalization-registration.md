# 0.1.122 候登记——零功能文档规范化梳理版本（用户 2026-11-16 指示）

> 状态：终态（0.1.122 段 L 完结：release f6988c88 + tag v0.1.122 + npm publish + SRI docs/sri/v0.1.122.md；生产 lane 候 e2e 轻形回执）（0.1.122 执行中——f4 双信号 2026-11-17 已放行，Main 段 I 落码）

> f4 登记（2026-11-16）。**单独无功能版本**：docs/ 全域规范化梳理，零产品码零行为变更。
> 排期：0.1.122 候（0.1.121 S0-R5 之后）；**scope 细则候用户 2026-11-17 讨论后定稿工单**。

## §1 版本定性

- 零产品代码、零 src/ 行为变更——**纯 docs/ 面版本**（先例：0.1.45-47 简化流程裁定「纯文本级零行为变更可跳 gate」）。
- 流程形（预登记）：工单（scope 清单化）→ Main 落码（docs-only）→ **gate 豁免申请（f4 核对 diff 零 src/tests 触碰即批）** → 段 L bump release → 生产 lane 轻形（SRI 四值 + npm 翻号核验，零行为腿免跑）→ 单信号。

## §2 候选 scope（候明日讨论定稿，禁预答终清单）

- docs/ 命名规范统一（日期前缀/主题后缀/序列命名现状审计）
- 工单/报告/登记档头注与状态字段规范化（状态机字段统一：draft→审计→双信号→lock-face→落码→gate→段 L→生产 lane→终态）
- 过期文档归档面（已完成波工单/报告的索引与归档分区）
- docs/release-governance.md 矩阵与既有制度文档对表（含本周期新沉淀：巡检催办链/docs 直推挂起窗口/可达性推演必答候选）
- MEMORY/制度文档与活码一致性抽查

## §3 纪律

- docs-only diff 断言 = `git diff --stat` 零 src/ 零 tests/ 零 package.json 版本外字段（gate 豁免判据）；
- 归档移动（git mv）不删内容；删除面（若有）逐件呈批；
- 版本号翻号 + CHANGELOG 注记「docs-only」。

## Scope 定稿（2026-11-17，用户 OK）

- 定性升级：对齐业界的规范性补齐版（用户增补需求 = reference 业界对表 / IDE 接入说明 / slash command 说明 / settings 模板；下游 issue #3 反馈「错误」直接触发）。
- A+B 合一版 0.1.122；③过期归档/⑤一致性抽查并入 B 段；语言面 = 中文为主 + A2/A3 英文速查节。
- 工单：`docs/2026-11-17-0122-docs-normalization-ticket.md`（本登记 doc 由其承接）。
