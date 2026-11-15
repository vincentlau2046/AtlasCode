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

## §7 root-cause 双源闭合采认（2026-11-14，e2e 定谳 r-20261114-wrc1-token-chain.md × Main 链图 b6c33846 互证）

1. **总判采认（排除式）**：主断点 = **环 3 写链从未存在**（setTurnOutputTokens all-time 零命中/snapshotOutputTokensForTurn no-op stub :208/getTurnOutputTokens ()=>0 :174）；provider usage 权威源已产出被下游首环丢弃（message_stop/round_end assistantMessage.usage，include_usage 已开）——断点在产品消费链首环，非网关/流层。face B 死因 = gate 关 + 写链缺双重（gate 开也恒 0）。
2. **勘 2 采认（7→6 文件）**：compact.ts = 常量名撞车零 feature('TOKEN_BUDGET') 假成员——消费面实 6 文件（格 3/4/6 对表口径同步）。
3. **face A 偏差直证采认**：us-tui2 注记 1 vs wire usage 52-83（欠计 ~50-80×，方向恒向下漏 reasoning+tool-JSON）；纯文本流式回合注记带整带替换零 ↓N = 渲染条件数据面分支——**face A 换源 usage 字段 = 唯一正解**（§6 勘误 1 换源小落码定性成立）。
4. **容差双上界预演采认**：round_end 逐回合累加对权威源天然 Δ=0（落账候选）；face A 路线工具回合 Δ 逾百倍必出界——容差数值 lock-face 冻结数据面齐备（采样账本 13 请求/12 回合/4 型 Σoutput=2466）。
5. **修形形态预览采认**：主修 = 环 3 round_end 消费 assistantMessage.usage.output_tokens 逐回合累加（零新增 wire 面）+ face B 点亮呈用户（「从未上生产」基座）+ gate 两档腿形（usage↔落账 Δ 双上界腿 + 注记渲染条件腿）。候 Main 正式 lock-face 一并呈批——届时 **face B 点亮 + face A 换源两裁定呈用户**。
6. 事故链三条全记录（v2 regex 嵌套/端口红鲱鱼/瞬态挂起 T1-T4 排除）。

## §8 段 D lock-face 批复（2026-11-15，f4：**通过，按批复形入段 I**；呈批书 docs/2026-11-15-wrc1-lockface-brief.md）

1. **呈批① 形 α 批准**：engine loop round_end 消费 assistant `message.usage.output_tokens` 终值（流式读 final message.usage / 非流式读 acc 聚合，零第二实现）→ 回合计数器逐回合累加 → round_end 加性字段 `outputTokens` → TUI loopEvents 转写新落 setter → bootstrapState :174/:209 双 stub 替真实现（REPL 调用点占位零触碰）。headless 同面受益；形 β 否决理由维持（headless 零受益 + 聚合面违单源）。
2. **呈批② 重置点批准 + 压缩续命不重置 = f4 终裁批准**：query() 入口单源（round 累加不重置）；autoCompact 在 query 内部 = 上下文操作非回合边界 → 续累加（压缩后生成 tokens 仍属同用户回合——链图裁决采认，禁预答条款闭环）。
3. **呈批③ 分账两项批准**：teammateTokens 分账禁合并（SpinnerAnimationRow:170 teammate 段零触碰，换源只替 leaderTokens）；KV 摘要三车道输入估算面禁混用（0.1.92 C-1 面不相通，落码不得借道）。
4. **呈批④ 面 A 换源 = 用户裁定批准（2026-11-15）**：leaderTokens 换读真计数器 getter，弃 Σchars/4。回归格三件采认：① stalled 检测/动画节律保留 chars 源双源分离（chars 专供 stalled/节律，token 专供数值注记）② teammate 合计零变 ③ ↓N 注记出现频率/时点变化为预期（e2e §3 直证在案）。屏显数值变真实量级 = 用户件 C 意图内。
5. **面 B = 用户裁定维持 off（2026-11-15）**：TOKEN_BUDGET 预算机制**不随本波点亮**（输入解析+模型注入+续命 backstop 三子系统从未上生产，点亮=新能力首发另行立项）——gate-off 档落码：6 消费点行为零变断言；gate-on 档 e2e wire 断言腿备用（e2e §7 已承诺）；**禁混档**。日后点亮 = 独立 lock-face 呈用户（「从未上生产」基座入档防误心智）。
6. **容差带冻结批准**：逐回合（turn-id 对齐）计数器终值 vs reqlog `usage.output_tokens`，Δ≤2% 且 Δ≤50 tokens 双上界同时满足（12 回合账本 Σ2466 落账候选面天然 Δ=0；face A 反例逾百倍必出界——数值即此冻结）。
7. **消费面改账批准**：7→6 文件（compact.ts 常量名撞车非消费点，e2e §4 直证）；0.1.70 遗留账 composing token 项由本链销项，403 fallback 项独立核不顺带。
8. **落码形批准**：两切片独立可验可 revert——切片 1 = 形 α 主链 + 判别格（格 2 终值单调非零/容差双上界 12 回合账本回放/gate-off 面 B 零变）；切片 2 = 面 A 换源（回归格三件逐格落测）。格 5 canon 逐切片恰合。**段 I 放行**（W-AB4b 两切片遵令排后）。

## §9 段 I 终态采认（2026-11-15，Main 知会；切片 1 e7a20896 + 切片 2 27fe66f2）

批复七项逐项落位采认：① 形 α 落位 + **取用形勘锚补强采认**（实 wire = 嵌套 message.usage 形，modelprovider.ts:1125/:1075 yield；落码取嵌套为主/顶层 fallback，engine localAgentTask.ts:140 同形先例——链图语义直证）；② 重置点 queryAgentLoop 入口单源 + 压缩续命不重置终裁落地；③ 分账零触碰；④ 面 A 双锚换源（SpinnerAnimationRow leaderTokens + Spinner leaderTokenCount → getTurnOutputTokens）+ 回归格三件落位；⑤ **gate-off 档面 B 采认**（6 消费点零变；snapshot 真实现 = 快照存储半边不重置计数器——与重置点单源裁定自洽，reset 权归 query() 入口；budget 消费面留 gate-on 独立 lock-face；新增 getTurnTokenBudgetSnapshot/getTurnOutputTokensAtSnapshot 两内部 getter 在「替真实现」纬度内）；⑥ 容差双上界落地（判别格 + e2e 采集口径同步）；⑦ 6 文件改账在案。canon 5934/0/483（Δ=+11 测 +2 文件恰合）。e2e gate 采集已请求（容差账本回放 + 面 A 验证 + gate-off 零变 + 压缩续命腿）。候段 G gate → 段 L；W-AB4b 排后遵令。

## §10 GATE-RED 修形批复（2026-11-15，f4：**两项批准**；呈批书 docs/2026-11-15-wrc1-gatered-remediation-brief.md）

判定单 r-20261115-gate-112.md 格4 双面 RED（判定单详档 e2e 侧）。

1. **修形项 A（RED-2 真缺陷）批准**：`queryEngineLoopStream` 加性可选字段 `transcribeTurnTokens?: boolean`，缺省 **false = fail-closed**（0.1.92 C-6 先例同族）；loopEvents round_end 分支 `setTurnOutputTokens` 门控；**唯一置真点 = REPL.tsx:2666 主链**；引擎零改动（round_end.turnOutputTokens 照发，消费面收敛主车道）；面 A 两锚读出面不变（fork 期间 spinner 保持主查询最后累计值 = 覆写缺陷消除后的正确行为）。已批 lock-face 主体（形α/面A换源/面B off/容差双上界）零触碰，仅切片 1「loopEvents 无条件转写」子形修订——批复纬度内。
2. **项 A 三注记（入判别格/登记）**：① LocalMainSessionTask/hook 车道缺省不转写 = 预期（非前台 spinner 消费面）；② 批复①「headless 同面受益」收窄为「headless 消费面缺席故缺省 false 零损失」——日后 headless 需要转写 = lane 级 opt-in 独立 lock-face，**禁默开**（登记池）；③ runAgent.ts 直调不经 loopEvents 天然不转写，确认零回归。
3. **改判项 B（RED-1 整条撤销）批准采认**：g3e loop 账本 + Main 源图终判双源——全程 ONE 主查询 + 4 个 turn-1…4 摘要 fork（时序/messageCount 算术 8→9→10→10/maxTurns=1 纯文本形状三重证据）；「cum=788→38 清零」现象本体 = fork 与主查询交叉写同一 bootstrapState 单例（RED-2 普遍形）；**f4 终裁「压缩续命不重置」获正证兑现**（主查询内 4 次 pre-turn 压缩 cum 38→166→218→261 零重置）。零落码；e2e 判据补「query 身份 = loop_start/loop_end 事件定界」条款（g3e 基建已在），判定单由 e2e 补改判附注。
4. **复gate 判据批准**：同形压缩腿（window=30k）+ g1 无压缩回归腿；格4 = fork 前后 bootstrapState 读数不变（摘要不覆写）+ loop 定界 query 身份 + 主查询内压缩零重置；格1/2/3 回归零变。修形落码 → 四件套 → e2e 复gate → 段 L release 0.1.112。
5. 呈批书编号勘误级注记：§1.3 缺号（1.2 直跳 1.4），不阻批复。
