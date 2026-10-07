# 2026-10-07 P2（压缩恢复层）完整评估报告——代码现状 + 参考源 + 明早裁定清单

> **用途**：用户 2026-10-07 夜间裁定 P2（"明早看到 P2 评估完整报告后裁定"）。
> **基线**：master @ `e39140c`（0.1.36 波单基线），全部 file:line 当日回源复核。
> **方法**：本 session 内代码复核（无 subagent）+ 本地参考源深读（CC 2.1.88 restored-src / deepseek-harness / vault 知识库）+ 严谨逻辑推导。**WebSearch 本 session 不可用**（本地模型代理无 web_search 工具 schema，诚实边界 §8）；参考源以本地三源 + vault 论文/评估笔记为准。

---

## §1 问题与严重度

**P2 = 压缩失败/断路器永久跳闸 + REPL 无界回合 → 长会话渐进失能**（严重度 HIGH）。故障链：

```
摘要 LLM/网关连续 3 次 compact 失败（断路器 autoCompact.ts:57）
  → pre-turn compact 永久短路（:532-535，仅成功时 :554 复位）
  → REPL unboundedTurns（replLoopDeps.ts:80）→ messages 无界增长
  → 每回合 400「Prompt is too long」（输入本身超窗口）= 非可重试
  → 其后每回合皆死（回合蒸发，无恢复、无用户面状态、无用户出口）
```

**期望行为（用户视角）**：系统自动恢复（反应式压缩/无模型剪枝）；恢复不了则用户**可见状态 + 可操作出口**（/compact、换小模型、新会话），模型侧同步告知（防 futile 请求）。静默永久短路 = 最坏失败形态（用户无感知，直到每回合 400 才暴雷）。

## §2 代码现状（9 面，全部当日 @ e39140c 回源）

| # | 面 | 现状 | 位置 |
|---|---|---|---|
| C1 | 主动 auto-compact（pre-turn） | 阈值 = contextWindow − 20k（COMPACT_MAX_OUTPUT_TOKENS）− 13k（AUTOCOMPACT_BUFFER_TOKENS）；**3 连败断路器**（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3`），跳闸后 `autoCompactIfNeeded` 直接 return（永久短路，仅成功复位） | `src/engine/context/autoCompact.ts:54-57,532-535,554,558-561`；loop 消费 `loop.ts:455-457,501` |
| C2 | 断路器用户面 | **无**。`TokenWarning` 只显示 "Context low (X% remaining) · Run /compact"（继承面），**无断路器跳闸态** | `src/tui/components/TokenWarning.tsx:169` |
| C3 | reactive compact 基建 | **体 + 端口 + 接线全在，但 loop 无自动消费者**：谓词层（withholding）`engine/context/reactiveCompact.ts`；端口 `highGapPorts.ts:67-101,140`（`reactiveCompactOnPromptToo` + null 守卫）；TUI 体 `contextBodies/reactiveCompact.ts`（`tryReactiveCompact` = 全量 compactConversation 委托 + `hasAttempted` 一次性门 + abort 门 + querySource 门；`reactiveCompactOnPromptTooLong` = manual/auto 双触发，失败 reason 词表 `too_few_groups/aborted/exhausted/error/media_unstrippable`）；接线 `contextHostWiring.ts:107-109,192-199`；**唯一消费者 = 手动 `/compact`（`compact.ts:173`，trigger:'manual'）** | 旧仓 loop.ts:15 的 lazy-load 消费者 = 被裁掉的缺口（vault §2 门控点表） |
| C4 | PTL 重试族（last-resort） | `truncateHeadForPTLRetry` + `MAX_PTL_RETRIES=3` + `PTL_RETRY_MARKER` + `groupMessagesByApiRound`（API-round 分组）——**只存在于 compactConversation 体内部**（摘要调用自身 413 时的截头重试），**非 loop 级 413 恢复** | `src/engine/context/compactPtl.ts:1-70`；caller = `engine/context/compact.ts:644` / `tui/contextBodies/compact.ts:446,771` |
| C5 | withRetry 400 自修 | **只覆盖「input length + max_tokens exceed context limit」类 400**：`parseMaxTokensContextOverflowError` 解析 → `maxTokensOverride`（压低 maxTokens 重试，floor 3000）；**不覆盖「Prompt is too long」类 400（输入本身超窗，压 maxTokens 无效 → 非可重试 CannotRetryError → 回合死）** | `src/tui/services/api/withRetry.ts`（parseMaxTokensContextOverflowError / retryContext.maxTokensOverride / CannotRetryError:115,362） |
| C6 | REPL 无界 | `unboundedTurns: true`（消息无界增长，无轮次上限） | `src/tui/replLoopDeps.ts:80`；`engine/query/loop.ts:189,426-428` |
| C7 | context-collapse（TUI） | **全 stub**：`applyCollapsesIfNeeded / recoverFromOverflow / resetContextCollapse / initContextCollapse / subscribe` 全 `(() => ({})) as any`——**413 恢复面（recoverFromOverflow）即 stub** | `src/tui/services/contextCollapse/index.ts:1-12` |
| C8 | snip 策略 | `snipRuntime.ts` 已迁 engine，但 **loop pre-turn 序残留守**（"pre-turn microcompact 未接线（旧仓 pre-turn 序 budget→snip→microcompact→…）"）→ snip 未进 pre-turn 主链 | `src/engine/query/loop.ts:418` |
| C9 | 413 谓词消费面 | `isWithheldPromptTooLong`（"Prompt is too long" 前缀匹配 assistant isApiErrorMessage）在 engine 谓词层 + TUI 体双份，**无任何 loop 调用点**（仅 re-export + 谓词定义） | `engine/context/reactiveCompact.ts:30` / `tui/contextBodies/reactiveCompact.ts:33` |

**结论**：恢复层缺口 = **C3（loop 无 413 消费者）+ C5（PTL 类 400 无自修）+ C2（断路器无用户面）+ C7（recoverFromOverflow stub）组合**；C1 断路器本身是共识设计（参照 A 同注释），**缺口全在恢复/可观测层，不在断路器**。

## §3 参考源（本地三源 + vault，全部可回源）

### A. CC 2.1.88（`~/projects/claude-code-sourcemap/restored-src/`，分叉母体）
- **四层防御**：① 主动 auto-compact ② 断路器（`autoCompact.ts:70`，注释明言防 doomed 压缩锤 API）③ **reactiveCompact：query loop 内 `isWithheld413 || isWithheldMedia` → `reactiveCompact.tryReactiveCompact({hasAttempted: hasAttemptedReactiveCompact, ...})`（`query.ts:1119+`，一次性门防反应式死循环）**④ 用户面 TokenWarning "Context low · Run /compact" + 手动 /compact 兜底。
- **reactive-only 模式**（`autoCompact.ts:189-207`）：`feature('REACTIVE_COMPACT')`（**ant-only，外部 build 裁掉**）+ GrowthBook `atlas_cobalt_raccoon` A/B 实验——抑制主动压缩、全靠 413 反应式恢复。**门控保留，毕业判据 = 实验结论 + 413 恢复成功率 telemetry + 一个 release cycle 稳定**（vault 评估 §2 逐条列出）。
- **max_tokens 面**：`tengu_max_tokens_escalate`（query.ts:1204）+ `stopReason==='max_tokens'` 处理（claude.ts:2266）——续写/升级路径（对应本仓 P8）。

### B. deepseek-harness（`~/projects/deepseek-harness/packages/compaction/`，4 包架构）
| 包 | 关键设计（P2 处置的事实源） |
|---|---|
| `compaction`（核心 seam） | `CompactionTrigger = 'pressure' \| 'context-overflow'`（**context-overflow = 正是 P2 的 413 恢复触发**）；**tool-pairing 平衡不变量**（`toolPairingBalancedBefore/After` = 选压缩范围时**不断开 tool_use/tool_result 对**，replay-safety 核心）；checkpoint source（`<compacted-summary>` 持久节点）；shadow-price 事件（`compaction/summary` 记录 shadowedTokenCount，替换与计量事件相邻可配对 = 可审计） |
| `compaction-basic` | replay-aware LLM 摘要后端；**目标压力模型**（`resolveTargetPolicy` → `TargetPressureConfigError`：压到窗口 X% 而非单一硬阈值）；KV-cache 感知（摘要指令作最终 user message 保前缀缓存）；KV 坏时 = 断路器场景，**LLM 层失效** |
| `compaction-tool-result-pruner` | **无模型、确定性、replay-safe 剪枝**：`DEFAULTS = {thresholdChars:8192, headChars:4096, tailChars:1024}`（超 8k 字符的工具结果保头 4k + 尾 1k + `PRUNE_MARKER`）；操作在**发送面 surface**（`freezeMessage` 快照，不改存储）；`PrunedEntry` 审计（originalSeq/replacementSeq/callId/charsBefore/After）；shadow-price 事件复用核心 compaction 协议 → **LLM 摘要层坏掉时的唯一不依赖 LLM 的恢复层** |
| `command-compact` | `/compact` 命令 + 预期失败码（`busy/cancelled/…`）——失败也是结构化结果，不裸崩 |

### C. vault 知识库（`/home/vince/文档/Obsidian vault/01-项目/15-AtlasHarness/`）
- **`15-功能门控评估-Compact模块.md`（2026-09-17，本仓历史评估）**：① REACTIVE_COMPACT 4 门控点（autoCompact.ts:195 / analyzeContext.ts:1116 / **loop.ts:15 = loop 消费者** / compact.ts:35），裁定 = **保留门控**（实验未结 + 行为变更风险）；毕业判据 = 实验结论 + **413 恢复成功率 telemetry** + 1 release cycle 无 bug。② HISTORY_SNIP（snipCompact）= 轻量可逆（保留最近 N 轮原文 + 旧消息摘要），**与 full compact 互补（snip 先触发可延缓 LLM 全量压缩）**，阈值 12k tokens；风险 = 与 context-collapse 竞态未验证。
- `09-记忆恢复体系分析.md` / `05-OpenHarness/05-记忆与上下文.md`：session memory 文件（goal/verified_state/next_step）+ auto-extract/auto-dream = **记忆侧恢复通道**（与压缩正交，用户"换 session 不丢关键状态"的配套出口）。
- **学术来源**：本 session WebSearch 不可用（边界 §8）；上列本地三源已覆盖 P2 全部处置的参照需求（参照实现级证据 > 论文泛述），以"参照实现 + 严谨推导"满足用户"参考源"要求。

## §4 关键推导（严谨逻辑链，裁定依据）

1. **两类 400 必须分开**（C5 的精确边界）：
   - **A 类「input+maxTokens > 窗口」**：withRetry 已自修（`maxTokensOverride` 压低 maxTokens 重试）→ **健康面，不动**。
   - **B 类「Prompt is too long（输入本身超窗）」**：压 maxTokens 无效（输入才是超长项）→ 非可重试 → **唯一恢复 = 缩减消息**（LLM 摘要或无模型剪枝）。**P2 的缺口精确定义 = B 类无恢复通道**（C3 loop 无消费者 + C7 stub + 断路器场景下摘要 LLM 本身坏）。
2. **断路器场景为何必须无模型层**：断路器跳闸的**定义**就是"摘要 LLM 连续失败"。反应式压缩（C3）委托 `compactConversation`（LLM 摘要）→ 摘要坏时反应式也坏（`tryReactiveCompact` 返回 null → 回显原始 413，体 :130-135 已登记此回落）→ **最后一道防线不得依赖正在坏的那个东西**（原则 3）。deepseek pruner = 唯一不依赖 LLM 的恢复层（确定性字符预算，模型免费）。
3. **KV-cache 代价（诚实披露，裁定需知情）**：剪枝/压缩都改写旧消息 → 前缀缓存失效。pruner 在 deepseek 语义里操作**发送面**（不改存储、`freezeMessage` 快照），且**最后防线 = 低频触发**（只在 LLM 层失效后）→ 缓存代价可接受；**若改造成热路径（每回合剪）则不成立**——裁定 ② 实施范围时须锁"最后防线、非热路径"。
4. **③（断路器用户面）为何低风险必须做**：纯加性渲染（TokenWarning 增态 + 行动建议）+ 模型侧告知（deepseek NEVER_SENTENCE 模式防 futile 请求）；无行为面变更；**把"静默失能"变"可见 + 有出口"**（原则 4）——即使 ② 缓做，③ 也把最坏形态（用户无感知）消除。
5. **④（软复位）为何砍**：A/B 两参照**均无**时间软复位（CC 仅成功复位、同本仓；deepseek 无断路器概念）；且 ①+③ 落地 + ② 研究后，"恢复路径 + 用户出口"已齐——软复位是**冗余的第三个恢复点**，M 取值无参照锚点（任意值 = 无出处参数），砍掉（待 soak 数据再议，登记）。
6. **①（wire 413 消费者）风险为何 MEDIUM 不是 HIGH**：加性（新 413 消费点，既有 413 语义不动）+ **一次性/回合**（`hasAttempted` 门，参照 CC query.ts:1119 同门，防反应式死循环）+ 失败回显原始 413（体已登记）+ env 可杀（`ATLAS_DISABLE_REACTIVE_COMPACT=true` 已存在）+ 既有 413 语义单测锁。
7. **reactive-only 模式（D5）为何不进波**：vault 裁定 = 保留门控（`atlas_cobalt_raccoon` 实验未结）+ 行为变更（全用户抑制主动压缩，413 前窗口更长）→ 进波 = 在实验结论前强制全量，违反 vault 裁定。**只登记，不实施**。

## §5 决策表（D1–D6，裁定对象）

| D | 内容 | 实施要点 | 风险 | 验证 | 参照出处 | 排期建议 |
|---|---|---|---|---|---|---|
| **D1** | ① engine loop 补 413 反应式消费者（C3 缺口） | loop 的 provider 错误路径：`isWithheldPromptTooLong \|\| isWithheldMediaSizeError` 且 `isReactiveCompactEnabled()` → `tryReactiveCompact({hasAttempted, ...})` 一次性 → 成功 `buildPostCompactMessages` 重建 + 本回合重试一次；失败回显原始 413。**delta = 一个消费点 + 一次性门**（CC query.ts:1119 同构） | **MEDIUM**（加性+一次性+env 可杀，见推导 6） | V4（3 连败后 413 恢复）/ V7（headless 413）+ 既有 413 语义单测 | A query.ts:1119 / C loop.ts:15 缺口 | **0.1.36 切片③（R3 已裁定做）** |
| **D2** | ③ 断路器跳闸 = 用户面状态 | TokenWarning 增 "auto-compact 已暂停（N 次失败）· 可手动 /compact 或开新会话" 态 + 模型侧告知（防 futile） | **LOW**（纯加性） | V4 断言暂停态在场 | A TokenWarning.tsx:166-169 / B NEVER_SENTENCE | 随 D1 同切片 |
| **D3** | ② 无模型剪枝层（0.1.37 候选） | 参照 deepseek pruner：DEFAULTS 8192/4096/1024 + PRUNE_MARKER + 发送面操作（不改存储）+ **tool-pairing 平衡不变量**（剪枝不断开 tool_use/result 对）+ PrunedEntry 审计 + shadow-price 事件；**范围锁定 = 断路器跳闸后的兜底恢复层（非热路径，见推导 3）** | **HIGH**（消息变异，replay-safety 验证成本高） | replay 等价测试（剪枝前后 API 请求面等价性）+ 无 LLM 场景 413 恢复 + soak | B pruner 全架构（含 tool-pairing 不变量来自 compaction 核心） | **0.1.37 spec 先行**（R3 已裁定缓）；spec 含：不变量表 + DEFAULTS 值 + KV-cache 代价披露 |
| **D4** | ④ 软复位（距上次成功 ≥M 回合） | — | — | — | **无参照**（推导 5） | **砍（登记待 soak）** |
| **D5** | reactive-only 模式（ATLAS_REACTIVE_ONLY） | 抑制主动压缩、全靠 413 反应式 | 行为变更（413 前窗口更长） | — | A autoCompact.ts:189-207 / **vault 裁定 = 保留门控（实验未结）** | **不进波（登记 0.1.37+，实验结论后议）** |
| **D6** | snip/microcompact pre-turn 序接线（C8 残留守） | snip 先触发延缓 LLM 全量压缩（互补策略） | 与 context-collapse 竞态未验证（vault 评估） | — | C vault HISTORY_SNIP 评估 | **登记 0.1.37+（不预启）** |

**附：C7（context-collapse stub，`recoverFromOverflow` 等 6 函数全 stub）+ C8（pre-turn 序残留守）= 登记项**，均 0.1.37+ 范围，本波不动（版本=收口契约）。

## §6 验收判据（gate 口径）

- **D1+D2 前 gate（0.1.36 切片③）**：V4（制造 3 连败 → ① TokenWarning 暂停态在场 ② 413 时反应式压缩触发且回合存活 ③ 一次性门生效（同回合二次 413 不重压，回显原始错误））+ V7（headless lane 413 同判据）+ 既有 413/maxTokens 自修语义单测零回归 + A4F 6 句 + S-A。
- **D3（0.1.37 spec 后实施）**：replay 等价 + 无 LLM 413 恢复 + **413 恢复成功率 telemetry**（对齐 vault 毕业判据："reactive compact 的 413 恢复成功率 ≥ 阈值（telemetry 确认）"——本仓无 atlas_* 遥测面，需登记最小事件）+ 一个 release cycle 稳定期。
- **断路器场景完整核销 = D1+D2+D3 全落地**（D1/D2 覆盖"摘要健康但 413 竞态/media 错误"场景；D3 覆盖"摘要 LLM 坏"场景——推导 2）。

## §7 明早裁定清单（请逐项拍板）

1. **D1+D2 入 0.1.36 切片③**（R3 已定"做"，此确认排期与 Main 切片序）？
2. **D3 = 0.1.37 spec 先行**（spec 含 tool-pairing 不变量表 + DEFAULTS + KV-cache 代价披露 + 范围锁"最后防线非热路径"）？
3. **D4 软复位 = 砍**（登记待 soak 数据）？
4. **D5 reactive-only = 不进波**（vault 裁定门控保留，实验结论后议）？
5. **413 恢复成功率 telemetry 登记**（最小事件，进 D3 spec 前置）？
6. **C7 context-collapse stub / C8 pre-turn 序残留守 = 登记 0.1.37+**（本波不动）？

## §8 证据边界（诚实声明）

- **全部 C1–C9 与 §3 参照条目 = 本 session 回源复核**（非转述；行号 @ e39140c）。
- **WebSearch 本 session 不可用**（本地模型代理缺 web_search 工具 schema，4 次调用 400）→ 学术来源未在线检索；以本地参照实现（A/B 两仓为一线工程实现，证据等级高于论文泛述）+ vault 2026-09-17 Compact 模块评估（含毕业判据）满足"参考源"要求。若裁定后需要论文级引用（如 LLMLingua 提示压缩 / KV-cache 压缩文献），明早裁定时告知，我补在线检索。
- **未核**：`compactConversation` 体全量（1698 行单体，只核了 PTL 重试调用点与委托关系）；snipRuntime.ts 体（仅核 loop 残留守登记）；deepseek pruner 的 shadow-price 事件全协议（核了 PrunedEntry/事件契约面，未逐行）。
- **关联**：P8（max_tokens 截断无续写）与 D1 正交（D1 只处理 413/PTL 输入超窗，不处理 max_tokens 输出截断）；P8 维持独立裁定。

---

## §9 裁定记录（用户 2026-10-07 上午，§7 六问逐项拍板）

| Q | 裁定 | 实施映射 |
|---|---|---|
| **Q1（D1+D2）** | **做，入 0.1.37 切片③** | ① engine loop 413 反应式消费者（C3 缺口：`isWithheldPromptTooLong \|\| isWithheldMediaSizeError` → `tryReactiveCompact` 一次性门 + 重建 + 本回合重试一次，失败回显原始 413）+ ② TokenWarning 断路器跳闸态（"auto-compact 已暂停（N 次失败）· 可手动 /compact·换小模型·新会话"）+ 模型侧告知（防 futile）；feature 门（ON_BY_DEFAULT 族，env 可杀）+ 既有 413/maxTokens 自修语义单测零回归。**口径订正：本报告「0.1.36 切片③」落盘时 0.1.36 未发，现已过期（0.1.36 收口为仅切片①，release `a540e49`）→ D1+D2 归属 = 0.1.37 切片③（R4 规则③顺延）** |
| **Q2（D3 无模型剪枝层）** | **0.1.37 spec 先行（实施 0.1.37+）** | spec 内容 = deepseek pruner 参照：无模型确定性剪枝层（DEFAULTS 8192/4096/1024 + PRUNE_MARKER + 发送面操作不改存储 + **tool-pairing 平衡不变量表**（剪枝不断开 tool_use/result 对）+ PrunedEntry 审计 + shadow-price 事件 + **KV-cache 代价披露** + 范围锁「最后防线非热路径」）——**本波只落 spec 文档，不实施** |
| **Q3（D4 软复位）** | **砍（登记待 soak 数据）** | 不实施；两参照（CC/deepseek）均无时间软复位 + ①③② 已给恢复路径，登记项 |
| **Q4（D5 reactive-only）** | **不进波（登记 0.1.37+，实验结论后议）** | vault 2026-09-17 裁定保留门控（`atlas_cobalt_raccoon` 实验未结），登记项 |
| **Q5（413 恢复成功率 telemetry）** | **登记（D3 spec 前置）** | 最小事件登记（本仓无 atlas_* 遥测面；D3 毕业判据「413 恢复成功率 ≥ 阈值」依赖此数据源） |
| **Q6（C7 context-collapse stub + C8 pre-turn 残留守）** | **登记 0.1.37+（本波不动）** | 版本=收口契约，登记项（C7 `recoverFromOverflow` 等 6 函数全 stub / C8 pre-turn 序 budget→snip→microcompact 未接线） |

**③ 解锁（用户裁定 → Main，2026-10-07 上午）**：0.1.37 切片③ = **D1+D2 代码落地 + D3 spec 文档 + D4/D5/telemetry/C7+C8 登记（登记项零码）**；③ gate = **V4**（3 连败后：413 反应式恢复 + 断路器跳闸态在场 + 一次性门生效）+ **V7**（headless 413 同判据）+ 既有 413/maxTokens 自修语义单测零回归；③ 落码后 → **0.1.37 全量 gate**（⑧ rebase 重验 + ②/④ 已绿〔r-0730〕+ ③ V4/V7 + 回归 S-A/A4F/P0a + 四件套）→ 发布序列（f4 T3 → Main）。收益/风险裁定依据 = f4 两轴分析（Q2 spec 先行/Q5/Q6 = 低风险项；Q1 高收益 MEDIUM 风险单独拍板=做；Q3/Q4 = 不做）。

---

## §10 登记项清单（0.1.37 切片③ 零码登记，实施排期各异）

> 本节 = ③ 落码范围中「登记项零码」的**单一事实源**（Q3/Q4/Q5/Q6 裁定落盘）。每项：裁定 + 排期 + 触发/重开条件。本波**零代码**，仅登记。

| 登记项 | 裁定（§9） | 排期 | 触发 / 重开条件 | 落点 |
|---|---|---|---|---|
| **D4 软复位**（距上次成功 ≥M 回合） | **砍**（Q3） | 不实施（待 soak 数据再议） | 两参照（CC/deepseek）均无时间软复位 + ①③② 已给恢复路径；M 取值无参照锚点。重开条件 = soak 数据证明「断路器跳闸后需时间性自动复活」 | 本节 |
| **D5 reactive-only 模式**（`ATLAS_REACTIVE_ONLY`） | **不进波**（Q4） | 0.1.37+（实验结论后议） | vault 2026-09-17 裁定保留门控（`atlas_cobalt_raccoon` A/B 实验未结）；行为变更（全用户抑制主动压缩，413 前窗口更长）。重开条件 = 实验结论 + 用户拍板翻 default | vault `15-功能门控评估-Compact模块.md` + 本节 |
| **413 恢复成功率 telemetry** | **登记最小事件**（Q5） | D3 实施（0.1.37+）前置 | 本仓无 `atlas_*` 遥测面（遥测死代码 879 点 2026-09-18 已删，无后端）；D3 毕业判据「413 恢复成功率 ≥ 阈值（telemetry 确认）」依赖此数据源。最小事件 = 剪枝/反应式 触发·成功·回显 413 三类计数 | D3 spec §7（`docs/2026-10-07-d3-model-free-pruner-spec.md`） |
| **C7 context-collapse stub**（`recoverFromOverflow` 等 6 函数全 `as any`） | **登记 0.1.37+**（Q6） | 0.1.37+（本波不动） | 版本=收口契约；`src/tui/services/contextCollapse/index.ts` 全 stub（413 恢复面 `recoverFromOverflow` 即 stub）。重开条件 = context-collapse 域独立排期 | 本节 |
| **C8 pre-turn 序残留守**（budget→snip→microcompact 未接线） | **登记 0.1.37+**（Q6） | 0.1.37+（本波不动，D6 不预启） | snip 先触发可延缓 LLM 全量压缩（互补策略），但与 context-collapse 竞态未验证（vault 评估）。重开条件 = C7 落地后竞态验证通过 | `src/engine/query/loop.ts:418` 残留守 + 本节 |

**零码声明**：本切片③ 对上述 5 项**仅登记、不落任何代码**；D1+D2 代码 + D3 spec 文档 = ③ 全部代码/文档交付面。
