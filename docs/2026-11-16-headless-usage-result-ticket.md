# 工单——headless result 事件 usage/total_cost_usd 加性扩形（issue #2；Claude stream-json wire 兼容）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-16）。
> 来源：issue #2（用户提交，fusion-console 消费方视角）；f4 triage 回复已发 issue（锚点核实 + 采纳 + 排期本波）。
> 排期：**0.1.120 候，串行于 0.1.119（S0-R4）之后**。

## §0 定位（f4 活码实核 2026-11-16）

| 项 | 实核 |
|---|---|
| result 三站点 | buildResultMessage src/cli/print.ts:1369（success/error_max_turns :1376）+ deferred :1428 + error_during_execution :1621——三站点均在案，现形零 usage/零 cost 字段 |
| 聚合源 | getModelUsage()/getUsageForModel() src/bootstrap/state.ts:289/:293；CostModelUsage 已含四 token 字段（inputTokens/outputTokens/cacheReadInputTokens/cacheCreationInputTokens + webSearchRequests/contextWindow/maxOutputTokens） |
| SDKMessage 加性 | src/cli/sdkTypes.ts（num_turns :77 先例形） |
| **usage = 纯聚合** | 数据已全量在账，加性上流低风险——**直接可行** |
| **total_cost_usd ≠ 纯聚合（关键发现）** | **仓内零 USD 成本计算面**：formatTotalCost（src/tui/cost-tracker.ts:182）仅时长/行数/token；messages.ts:4313 注记「计费/USD 删除（D1），budget_usd 保留 legacy 兼容旧 --resume」——**total_cost_usd = USD 计费面重建（pricing 表 + settings override）+ D1 决策显式翻转**，非 issue 正文所述「built-in table」现成 |

## §1 波定义

0.1.120 候，两件分账：
- **件 1（usage，纯聚合）**：result 三站点加性 `usage`（四 token 字段，Claude 形 snake_case wire 面：input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens）——跨模型求和上流。
- **件 2（total_cost_usd，计费面重建）**：pricing 表（内置已知模型表 + settings per-provider/per-model override `{inputPerMTok, outputPerMTok}`）+ 累计 USD 上流；**诚实缺席语义钉死 = pricing 未知端点省略字段，禁伪造 0**（fail-closed）；件 2 前置 = D1 翻转裁定（lock-face 呈批含 D1 原决策语境回溯）。

## §2 纪律面（lock-face 必答前置）

- SDKMessage 加性扩形（零删改既有字段）；既有契约测试零触碰（加性面）。
- pricing override 放置位呈批（settings 结构内位置 + 优先序：内置表 < override；模型名匹配语义含 alias 面定形）。
- 三站点一致断言（同一聚合函数，禁三处各算）。
- wire 面对表基线 = Claude stream-json result 事件 usage/total_cost_usd 现形（消费方容忍双形已由 issue 论证）。

## §3 判据格（预注册框架，lock-face 细化）

| # | 格 |
|---|---|
| 1 | usage 格：三站点（success/error_max_turns/deferred/error_during_execution 全出口路径）四字段在位 + 数值与 cost state 对账 |
| 2 | total_cost_usd 格：known-model 精算 / override 覆盖 / unknown 端点**字段缺席**（零伪造 0）三分形 |
| 3 | 兼容格：既有 result wire 消费面零破坏（加性 diff 断言）+ TUI/print 文本输出零变化 + drain 序零变化 |
| 4 | canon 恰合 |

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（件 2 D1 翻转 + pricing 表源/override 放置位定形；件 1 可先行批准）→ Main 落码 → e2e gate → 段 L 0.1.120 → 生产 lane → issue #2 回执销项。

## §5 衔接注记

- 消费方 = fusion-console（Go 本地 agent console）+ Claude stream-json 族任意消费者；issue 作者已声明可出实施 PR（遵用户既定 PR 路线先例，S0-R3 同形）。
- 0.1.119（S0-R4）串行在前；本波不抢。

## §7 Atlas-reveiw 审计闭环（2026-11-16，有条件通过——2 必改级 + 4 判据钉；@3a745078 全锚实核 + 写链考古）

1. **勘注采认**：error_during_execution result 落点实为 print.ts:1712 手拼字面量（工单写 :1621 系文本打印 switch 行）；「仓内零 USD 计算面」审计独立扫描确认（唯 modelOptions.ts:27 PAYG 显示后缀注记）。
2. **必改级① 采认 + 件 1 修形终裁（f4；活码实核吻合）**：「usage=纯聚合直接可行」**不成立**——cost state 写链 addToTotalSessionCost 唯一活调用 = vcr.ts:171 缓存回放支，withVCR/withStreamingVCR 零活调用方（仅 withTokenCountVCR ← tokenEstimation:141 估算支），活路径 cost state 恒空（W-RC1「provider usage 产出、消费链首环丢弃」同构）。**聚合落点终裁 = (a)**：buildResultMessage/deferred 站点处从 loopResult.messages 内 assistant message.usage 聚合（API 权威字段，W-RC1 §7 同源直证；跳过 synthetic/压缩边界消息细则 lock-face 定形）——零 engine 触碰、加性最小；(b) engine→cost state 写链不采（触共享状态生命周期面大）。格 1 对账判据随改：~~与 cost state 对账~~ → **与 reqlog usage 逐回合对账**（0.1.112 容差先例；messages 求和=精确累加应 Δ=0）。
3. **必改级② 采认 + 件 2 措辞/范围定形（f4）**：(a) 证据边界诚实——D1 原决策文档不在仓（语境回溯唯 messages.ts:4313 + capabilities.ts:8 两码面注记 + git 考古 78624e4e 壳波随迁链），呈批书如实标注；心智钉死 = **件 2 = USD 计费面「首建（解除 D1）」非「重建」**（工单措辞随改；0.1.70 面 B「从未上生产」基座先例同族）；(b) 翻转范围分账——解禁面仅 USD 成本计算（静态 pricing 表 + settings override，零 services/api 依赖不违 D1 实质理由「运行期去 services/api」）；modelCost 其余面（能力元数据/路由）禁顺手复活；budget_usd legacy attachment 维持 legacy。
4. **判据钉采认**：(i) pricing 模块独立新面（禁入 modelprovider/capabilities 域半复活面）；(ii) 模型名匹配复用 0.1.80 K1-B① prefix/model 归一单源，禁第二归一实现；(iii) 优先序内置表 < settings override；override 半字段（缺 outputPerMTok 等）→ 该模型 total_cost_usd 缺席（半价禁算）；**显式 0 = 合法 0**（与缺席异质，gate 判据写明）；(iv) error_during_execution 站点 usage 面**终裁 = 缺席字段**（执行失败无消耗，诚实语义一致；audit 推荐采认）——三站点一致性断言 = 同一聚合函数 + 四 subtype wire 加性 diff（error 站点断言 usage 缺席）。
5. **缺席矩阵独立判定采认（焦点④）**：usage 恒在（件 1）/total_cost_usd 条件在（件 2）两字段独立矩阵；unknown pricing 省略禁伪造 0 ✓。
6. **流程推进**：审计通过 + 本节定形在案 → 双信号②发 Main（lock-face 呈批含件 1 (a) 落点细则 + 件 2 首建呈批书）；0.1.119 串行在前 ✓。issue #2 公开 triage 补正注记随发（「data already tracked」结论修正为真源 = assistant message.usage，cost state 写链死链披露）。
