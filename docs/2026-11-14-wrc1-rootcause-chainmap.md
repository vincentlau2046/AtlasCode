# W-RC1 root-cause 链图——输出 token 聚合计数链四环 wire 直证（0.1.112 候）

> Main lane 采证（2026-11-14）。工单 docs/2026-11-14-p0-wave-01112-token-chain-ticket.md
> @755ed283 + 审计 §5 @507e6c3f。逐锚实核，排除式归因。**1 勘误**（对工单 §0 面 A 断言）。

## 一、四环链图（wire 直证）

### 环 1 · 事件源（✅ 活，权威源已 yield 但无人消费）

| 源 | 锚 | 形态 |
|---|---|---|
| **usage 终值（权威源）** | `src/modelprovider/modelprovider.ts:1129`（正常支）`:1056/1095`（interrupted 支） | 流式终值 `usage` 双路 yield：① `message_stop` 事件带 usage 字段；② final `assistant` 消息带 `message.usage`（`usage \|\| emptyUsage`，emptyUsage=mapOpenAIUsage(null) 归一 0） |
| usage 终值（非流式） | `modelprovider.ts:615-664` | acc 逐 ref 累加 `usage.output_tokens`（多 ref 池聚合） |
| per-token 估算流 | `engine/query/loop.ts:526` → `tui/loopEvents.ts:95` → `tui/utils/messages.ts:3037` | stream_delta 仅 text_delta 消费 → onUpdateLength(**chars**) |

### 环 2 · 消费点（✂️ **断点所在——engine 支零消费**）

- **engine loop 消费 usage = 零接线**：`src/engine/query/loop.ts` grep `usage` 仅注释命中（:544-544「不用 usage 0/0 作独立判据」）。provider yield 的 message_stop.usage 与 assistant.message.usage **落地即弃**。
- 面 A（spinner 注记，活但失真）：`messages.ts:3037` chars 累加 → `currentResponseLength` → `SpinnerAnimationRow.tsx:154` `leaderTokens = Math.round(displayedResponseLength / 4)` —— **chars/4 估算，且仅 text 面**（thinking/tool_use delta 不入 onUpdateLength）→ 量级失真实锚。
- 面 B（TOKEN_BUDGET 门控面，死）：7 文件消费全在 `feature('TOKEN_BUDGET')` 门后。门语义（`src/shared/feature.ts:35-54`）：TOKEN_BUDGET ∉ ON_BY_DEFAULT（仅 TRANSCRIPT_CLASSIFIER/COORDINATOR_MODE/AUTO_THEME）且 env 未设 → 恒 false。消费点对表：attachments.ts:3388/3396、Spinner.tsx:230-239、PromptInput.tsx:503、REPL.tsx:1965/2728/2792-2795、constants/prompts.ts:456、bootstrapState（环 4）、compact.ts（**分账注记**：compact.ts:122/1377/1472 的 POST_COMPACT_TOKEN_BUDGET 是压缩后 attachment 预算常量，**不读 turn 计数器**，非本链消费点）。

### 环 3 · 生命周期（❌ 从未存在）

- `setTurnOutputTokens` 全 src 零命中（复核审计 `git log -S` 全码史仅 docs）；计数器变量、重置点、累加点**三者全无**。
- 回合边界锚（重置点单源落点候选）：`engine/query/loop.ts:887` `round_start {turn: turns}` / `:1014` `round_end`。注意 round = query 内部工具循环轮；**用户可见回合 = 一次 query() 调用**（跨多轮 round）→ 重置点应在 query() 入口，非每 round。

### 环 4 · 读出面（❌ stub）

- `tui/bootstrapState.ts:174` `getTurnOutputTokens = () => 0`；`:209` `snapshotOutputTokensForTurn` no-op（注释自证「until that feature lands」——REPL 调用点签名占位保留）。

## 二、断点归因（排除式）

| 假设 | 判 |
|---|---|
| 事件流断（0.1.70 D-2a 切端弄断） | **排除**——stream_delta 转发活（W-AB5 G-3 直证）；且审计考古 setter 全码史零存在，早于 0.1.70 |
| 消费面缺失（UI 没人读） | **排除**——面 A 活（喂估算源）；面 B 7 文件消费面全在场 |
| feature 门把活链关掉 | **排除**——门 off 只遮面 B；面 A 无门仍失真，链根本不通 |
| **定谳** | **断点 = 环 2 engine 支（usage 终值零消费）+ 环 3（计数器生命周期从未存在）**。provider 权威 usage 已 yield 双路，engine→TUI 写入链从未落线。修链 = 新落 wire，非修回归 |

## 三、勘误 1（工单 §0 面 A 断言订正）

工单称「面 A 无需落码，消费修链结果，修链后注记值自然恢复真实量级」——**wire 直证不成立**：面 A 值源 = `currentResponseLength`（chars）/4，与死链（环 2-4）**无任何共享 wire**；修链不改 currentResponseLength，面 A 数值不会变。

面 A 恢复真实量级需**一次换源小落码**（候选：leaderTokens 换读真计数器 getter + stalled 检测面保留 chars 源——`currentResponseLength>0` 守卫与增量动画（gap<70→3）按 chars 调参，换源须保双源分离）。lock-face 须按此呈批：面 A = gate-off 下唯一行为变面（常显无门控），换源与否单独裁定。

## 四、lock-face 呈批项输入（f4 裁定材料）

1. **修形形态**（倾向 α）：
   - **形 α·engine 权威链**：engine loop 消费每轮 assistant `message.usage.output_tokens`（终值非 chunk 累加，零第二实现）→ 回合计数器（engine 侧，重置点 = query() 入口单源）→ 经 emit 加性事件（或 round_end 加性字段）→ TUI loopEvents 转写 bootstrapState setter（新落）→ getter 替 stub。headless 同面受益；teammate/subagent 独立 loop 实例天然分账。
   - 形 β·TUI 直采：loopEvents 收 assistant 消息直读 message.usage 累加 bootstrapState。改动面小但 headless 零受益、聚合面留在 UI 层（与「聚合链单源」纪律摩擦）。
2. **重置点**：query() 入口（用户回合）单源；round 累加不重置。压缩续命：autoCompact 发生在 query 内部（上下文操作非回合边界）→ 链图证据支持**不重置续累加**（压缩后生成 tokens 仍属同用户回合）——禁预答条款下此为链图裁决建议，lock-face 终裁。
3. **teammateTokens 分账**：SpinnerAnimationRow:170 `totalTokens = leaderTokens + teammateTokens`——teammate 计数来自 progress.tokenCount 独立源，保持分账；主计数器换源后 leaderTokens 段替为真计数器，teammate 段零触碰。
4. **面 B 两档裁定书骨架**（gate-off/on 显式二选一禁混档）：
   - gate-off 档（FEATURE_TOKEN_BUDGET 不设）：面 B 7 消费点行为零变断言（唯一活面=面 A，若裁定面 A 换源则其为该档唯一行为变面须显式列出）；面向用户表述基座 =「**从未上过生产**」(setter 全码史零存在，stub 78624e4e 引入时即死链)——面 B 点亮 = 新能力首次启用非修复恢复。
   - gate-on 档（FEATURE_TOKEN_BUDGET=true）：预算 UI 五消费点逐点亮行为核 + 格 2 单调非零 + 回归格全开。
5. **容差带双上界候选**（lock-face 数值冻结）：逐回合（turn id 对齐）计数器终值 vs reqlog usage.output_tokens，**Δ≤2% 且 Δ≤50 tokens**（双上界同时满足）。CC ↓1.1k 形态对表 = 次级参照。
6. **0.1.70 遗留账对表**（格 6）：块 G/H 残账中 composing token 计数器项 = 本链销项；autocompact 403 fallback 残留项独立核（不在本链 wire 内）。

## 五、e2e 协同请求

reqlog usage 权威源直证在 e2e 侧：请对 17 腿任一流式回合采 reqlog usage.output_tokens 终值样本（turn id 对齐），供容差带数值冻结预演 + 格 2 对表基线。
