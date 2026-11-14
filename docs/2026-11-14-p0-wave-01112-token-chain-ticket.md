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

## §5 Atlas-reveiw 审计闭环（2026-11-14，通过 + git 考古决定性证据 + 1 勘误 + 4 吸收，@507e6c3f 全锚实核）

1. **焦点① git 考古定谳（呈报义务升级）**：stub 引入 = `78624e4e`「UI 闭包 C-7 原样搬」；`git log -S 'setTurnOutputTokens' --all` 全码史仅 docs 命中——**setter 本仓从未存在，面 B（TOKEN_BUDGET 预算 UI）从未活过 = 「壳波 import 即死链」**，非「有意保守」亦非「0.1.70 弄断」。**lock-face 呈用户时须写明「从未上过生产」基座**（防以「既有功能坏了」心智裁点亮）——面 B 点亮 = 新能力首次启用非修复恢复。门面语义：feature('TOKEN_BUDGET') 未知键回落 false，修链后不点亮则消费点行为零变自洽。
2. **勘误 1**：TOKEN_BUDGET 消费面 = **7 文件**（漏 REPL.tsx + constants/prompts.ts）——格 3/4/6 回归与销项对表按 7 文件口径（prompts.ts 文案面亦核）。
3. **吸收 2（生命周期）**：重置点单源钉死 = query turn 边界（禁多重重置点散布）；压缩续命回合计数归属 lock-face 定谳（预判「压缩 = 上下文操作非回合边界 → 不重置」禁预答，链图裁决）；teammateTokens 聚合与主回合计数器**分账禁合并**。
4. **吸收 3（口径单源）**：输出 token 唯一权威源 = **API usage 字段**（reqlog 直证先例）；聚合链优先消费 usage 终值事件（message_delta usage 形）非 stream_delta 逐 chunk 估算累加；KV 摘要三车道（0.1.92）= 输入估算面**分账禁混用**（禁第二输出计数实现——W-D-B 副本教训族）。
5. **吸收 4（量级数值化）**：格 2 钉死 = 逐回合（turn id 对齐）计数器终值 vs reqlog usage.output_tokens，**容差带双上界（Δ≤X% 且 Δ≤N tokens）lock-face 数值冻结**；CC 形态对表 = 次级参照，主判据 = 本仓 usage 直证。
6. **焦点③分档覆盖**：gate-off 档（7 消费点行为零变断言，面 A 格 2 唯一活面）vs gate-on 档（预算 UI 全回归格 + 五消费点逐点亮行为核）——lock-face 裁定书显式二选一生效禁混档。
7. 排序面确认（P1 > 件 F 让位条款）。

**审计结论：通过——吸收后发双信号。**

## §6 root-cause 链图采认（2026-11-14，Main b6c33846 docs/2026-11-14-wrc1-rootcause-chainmap.md）

1. **四环定谳采认**：环 1 活（usage 终值双路 yield modelprovider.ts:1129/:1095 + 非流式 :664）；**环 2 = 断点**（engine loop 消费 usage 零接线，provider yield 落地即弃；面 A 实喂 chars/4 估算 SpinnerAnimationRow:154；面 B 门恒 false feature.ts:24-28 复核）；环 3/4 从未存在（与审计考古互证）；回合边界锚订正 = query() 入口（loop.ts:887 round_start 为 round 非用户回合）。
2. **勘误 1 采认（工单 §0 订正）**：「面 A 修链后自然恢复」不成立——面 A 值源 = currentResponseLength chars/4 与死链零共享 wire，**修链后数值不变**；面 A 恢复真实量级 = 一次换源小落码（chars/4 → usage 权威源），且为 gate-off 下唯一行为变面（常显无门控）——lock-face 按此单独呈批。
3. lock-face 材料预览收讫（α 形 engine 权威链/压缩续命不重置建议呈裁/容差 Δ≤2% 且 Δ≤50 tokens/面 B 基座）；候 e2e usage 样本容差预演后正式 lock-face 一并呈批。
4. f4 预注记：面 A 换源面回归格 = 注记值 vs reqlog usage 同容差带对表 + 值域合理面（0 静默回合恒 0）；换源致屏显数值变化属用户件 C 意图内（真实量级），呈批时注明。
