# 0.1.112 候 W-RC1 工单——输出 token 计数链根修（0.1.70 遗留账；W-AB5 修链波候选兑现）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-14）。
> 上游：① 用户件 C 裁定拆步形「token 注记断则挂起待修链波」；② W-AB5 修链波候选三重断单列节（报告 r-20261114-wab5-slice1.md §4）；③ 0.1.70 插入波遗留账（composing token 计数器回归：D-2a 切端断 per-token 事件流 + autocompact 403 fallback 残留）。
> 排序：P1 > 件 F（P2）——0.1.112 归本波，件 F 让位 0.1.113 候（W-AB6 §5 让位条款预授权）。

## §0 波前审视（f4 2026-11-14，三重断实锚）

| 断点 | 锚 | 自证 |
|---|---|---|
| ① stub 恒 0 | `src/tui/bootstrapState.ts:174` | `getTurnOutputTokens : any = () => 0; // TOKEN_BUDGET feature off by default` |
| ② setter 不存在 | 全 src grep | `setTurnOutputTokens` **零命中**——无任何写入路径 |
| ③ 门面死链 | TOKEN_BUDGET 五文件消费（bootstrapState/attachments/Spinner/PromptInput/compact.ts） | Spinner budgetText 分支永不渲染（token 值恒 0 < 任何预算）；W-AB5 面 B 定谳 |

**已活面（不重复修）**：loopEvents stream_delta 转发（0.1.70 块 G）已修活（W-AB5 G-3 直证）——per-token 事件流在位，缺的是**聚合计数写入链**（事件流 → 回合计数器 → getTurnOutputTokens 读出）。

**双面分账（W-AB5 §4 勘误定位注记继承）**：
- **面 A（spinner 注记）**：已活——`(43s · ↓14 tokens)` 形在；但 **14 = 计数链死的残值**（量级失真），修链后注记值自然恢复真实量级（面 A 无需落码，消费修链结果）。
- **面 B（TOKEN_BUDGET 预算制 UI）**：门 default-off + budgetText 永不渲染——**点亮与否 = 产品裁定非纯修复**（门当初 default-off 或有意），lock-face/用户裁。

## §1 波定义

root-cause 腿先行（聚合计数链图：stream_delta 事件 → 各消费点 → 回合计数生命周期 → bootstrapState 读出面，逐环 wire 直证）→ lock-face 呈修形形态 + 面 B 点亮裁定 → 落码 → gate → 段 L。**禁顺手修**：attachments/PromptInput/compact 三消费点若链修后自然复活则一并回归格覆盖，不单独扩面。

## §2 判据格（预注册）

| # | 格 |
|---|---|
| 1 | root-cause 链图格：聚合链逐环 wire 直证（事件源/消费点/生命周期/读出面四环），断点归因排除式 |
| 2 | 修链格：修链后 getTurnOutputTokens 回合内单调非零（流式回合 reqlog usage 对表量级一致——CC ↓1.1k 形同源对表）；面 A 注记量级复验 |
| 3 | 面 B 裁定格：点亮（预算 UI 回归格全开）或维持 off（budgetText 面零触碰断言）——随 lock-face 裁定二选一 |
| 4 | 回归零触碰格：stalled/timer/TTFT 面（W-AB5 矩阵已活态）零变；kV 摘要/compact 消费点行为核 |
| 5 | canon 恰合 |
| 6 | 0.1.70 遗留账销项格：composing token 计数器回归面（memory composing-token-counter-0170 块 G/H 残账）逐项对表销项或显式转登记 |

## §3 Review Focus

1. 面 B 点亮的裁定面（default-off 是有意保守还是遗留未接——lock-face 须给出当年设门语境证据，防误翻案）。
2. 计数生命周期跨压缩/续回合边界（B6 型压缩续命回合计数语义——重置点定谳）。
3. 三消费点（attachments/PromptInput/compact）复活面回归覆盖完备性。
4. 与 KV-cache 摘要三车道同源面（0.1.92 先例）的计数口径关系。
5. 「量级一致」对表判据的可证伪形（reqlog usage 字段为权威源）。

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → root-cause 腿（e2e + Main 协同）→ lock-face（修形形态 + 面 B 裁定呈用户）→ 落码 → gate → 段 L 0.1.112（若段 L 时件 F 未起）。件 F 顺延 0.1.113 候。
