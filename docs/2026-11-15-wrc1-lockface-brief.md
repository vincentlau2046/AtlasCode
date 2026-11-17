# W-RC1 lock-face 呈批书——输出 token 聚合计数链根修（0.1.112）

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

> Main lane 2026-11-15。链图 b6c33846（f4 采认 §6 @9b577e22）+ e2e 定谳
> r-20261114-wrc1-token-chain.md 双侧互证基座。工单 @755ed283 + 审计 §5 @507e6c3f。
> 呈批项按 f4 开工令四点：修形形态 / 重置点 / 分账 / 面 B 两档 + 容差冻结。

## 0. 定谳基座（双侧互证，不再展开）

断点 = 环 3 写链从未存在（`setTurnOutputTokens` 全码史零命中）叠加环 2 engine 支零消费（provider usage 终值双路 yield `modelprovider.ts:1054/1129` 落地即弃）。**修链 = 新落 wire，非修回归**。面 A = Σtext_chars/4 与死链零共享 wire（勘误 1 双侧采认）；e2e 偏差样本 face A=1 vs wire 52-83（欠计 50-80×，方向恒向下）。

## 1. 修形形态呈批：**形 α（呈请批准）**

- engine loop 消费每轮 assistant `message.usage.output_tokens`（**终值非 chunk 累加，零第二实现**——流式读 final assistant message.usage，非流式读 acc 聚合 `:615-664`）→ 回合计数器逐回合累加（round_end 消费点，与 e2e §7 建议一致）→ round_end 加性字段 `outputTokens`（e2e 定谳报告载体建议）→ TUI loopEvents 转写 bootstrapState setter（新落 `setTurnOutputTokens`）→ `bootstrapState.ts:174/:209` 两 stub 替真实现（REPL 调用点签名已占位零触碰）。
- headless 同面受益；teammate/subagent 独立 loop 实例天然分账。
- 形 β（TUI 直采）对照否决理由维持链图 §四：headless 零受益 + 聚合面留 UI 层违聚合链单源纪律。

## 2. 重置点呈批：query() 入口单源；**压缩续命不重置（呈裁项）**

- 重置点 = query() 入口（用户可见回合 = 一次 query() 调用，跨多 round）；round 累加不重置（round ≠ 回合边界，loop.ts:887/:1014 直证）。
- 压缩续命：autoCompact 发生在 query 内部（上下文操作非回合边界）→ 链图裁决建议**不重置续累加**（压缩后生成 tokens 仍属同用户回合）。禁预答条款下此为呈裁项，f4 终裁。

## 3. 分账呈批（禁合并两项）

- **teammateTokens 分账禁合并**：SpinnerAnimationRow:170 `totalTokens = leaderTokens + teammateTokens`——teammate 段来自 progress.tokenCount 独立源零触碰；换源只替 leaderTokens 段。
- **KV 摘要三车道输入估算面分账禁混用**：本链 = 输出 token 聚合（0.1.92 C-1 三车道输入估算面不相通，落码时不得借道）。

## 4. 面 A 换源裁定呈批（gate-off 下唯一行为变面）

呈请批准换源：`leaderTokens` 换读真计数器 getter（`getTurnOutputTokens`），弃 Σchars/4。换源回归格三件（f4 预注记采认）：

1. **stalled 检测面保留 chars 源**：`currentResponseLength>0` 守卫与增量动画（gap<70→3）按 chars 调参——换源后两源分离（chars 源专供 stalled/动画节律，token 源专供数值注记）。
2. **teammateTokens 合计面零变**：分账见 §3。
3. **注记渲染条件面**：e2e §3 直证 ↓N 注记仅在工具混合回合偶现且值滞后瞬态（纯文本回合被流式视图整带替换零注记）——换源后注记出现频率/时点变化为预期行为，gate 判别清单列入防误判。

## 5. 面 B 两档裁定书（呈用户二选一，禁混档）

- **gate-off 档**（FEATURE_TOKEN_BUDGET 不设，默认）：面 B 6 消费点行为零变断言；唯一活面 = 面 A（若 §4 批准则其为该档唯一行为变面）。用户表述基座 =「**从未上过生产**」（setter 全码史零存在，stub 78624e4e 引入时即死链）——后续点亮 = 新能力首次启用非修复恢复。
- **gate-on 档**（FEATURE_TOKEN_BUDGET=true）：预算 UI 5 消费点逐点亮行为核 + 格 2 单调非零 + 回归格全开。
- **呈请默认 gate-off 档落码 + gate-on 档 e2e wire 断言腿备用**（e2e §7 已承诺提供 usage↔落账对表腿）。

## 6. 容差带数值冻结（呈请冻结）

逐回合（turn-id 对齐）计数器终值 vs reqlog `usage.output_tokens`：**Δ≤2% 且 Δ≤50 tokens 双上界同时满足**。e2e 12 回合采样账本（Σoutput=2466）落账候选面天然 Δ=0；face A 路线反例在案（Δ 逾百倍必出界）——判据可区分两路线，数值即此冻结。

## 7. 消费面对表（7→6 文件，compact.ts 勘 2 采认）

e2e §4 勘误采认：compact.ts 仅 POST_COMPACT_TOKEN_BUDGET 常量名撞车、`feature('TOKEN_BUDGET')` 零命中，非本链消费点。实 6 文件 = bootstrapState / Spinner / PromptInput / REPL / attachments / constants(prompts.ts:456)。提请 f4 改账。

## 8. 0.1.70 遗留账对表

composing token 计数器项 = 本链销项；autocompact 403 fallback 残留项独立核（不在本链 wire 内，不顺带）。

## 9. 落码形（批复后段 I）

切片 1 = 形 α 主链（engine loop 消费 + 计数器 + round_end 字段 + loopEvents 转写 + 双 stub 替换）+ 判别格（格 2 终值单调非零 / 容差双上界回放 12 回合账本 / gate-off 面 B 零变）。切片 2 = 面 A 换源（若 §4 批准；§4 回归格三件逐格落测）。两切片独立可验可 revert，格 5 canon 逐切片恰合。
