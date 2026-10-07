# 0.1.37 ③（P2 恢复层）gate V4/V7 探针设计（e2e，③ gate 执行中）

- **状态**：执行中（③ D1+D2 已落码 `worktree-0.1.36 @ 6079da9`，四件套 3724/0·266；f4 发 ③ gate 验收请求，e2e 起探；本设计 §1/§6 三待核项已由 ③ 落码定，据此对齐探针）
- **性质**：e2e 工作区交付物（探针设计 + fault-proxy 扩展 spec），Main 随 ③ 波收编；**零 src/ 产品改动**
- **口径来源**：f4 R5 裁定 P2 §7 六问（D1+D2 入 0.1.37 切片③；D3 spec 先行不实施）+ `docs/2026-10-07-p2-compaction-evaluation.md` §4/§6 + ③ gate 判据（V4 3 连败后 413 反应式恢复 + 断路器跳闸态在场 + 一次性门生效 / V7 headless 同判据）

---

## ① 已定因的机制（源级核过，探针据此写）

| 机制 | 源级事实 | 探针落点 |
|---|---|---|
| **PTL/413 触发** | engine `classifyAPIError`（`modelErrors.ts`）对 `error.message` 含 `"prompt is too long"`（小写匹配）→ 返回 `'prompt_too_long'` → `errorMessaging.ts:172` 造 assistant api-error 块 `content: "Prompt is too long"`（`PROMPT_TOO_LONG_ERROR_MESSAGE`）→ `isWithheldPromptTooLong`（`reactiveCompact.ts:30`，assistant + `isApiErrorMessage` + 文本块 `startsWith('Prompt is too long')`）命中 → ③ D1 消费点 fire | **fault-proxy 注 413/400，error body 的 `message` 必含 `Prompt is too long`**（判定是 message-based 非 status-based；status 用 413 对齐 P2 文档） |
| **断路器跳闸 + D2 store 更新点** | `autoCompact.ts:57` `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3`；`autoCompactIfNeeded`（:526）`consecutiveFailures>=3` → 直接 return（永久短路，仅成功复位）；失败 `nextFailures=(prev??0)+1`（:558-561）。**③ D2 store 单一事实源 = `autoCompactCircuit.ts`（`getAutoCompactCircuitFailures`/`isAutoCompactCircuitTripped(n>=3)`/`report`/`clear`/`subscribe`/`resetForTesting`，模块态 store 同 `compactWarningStore` 先例）**；**更新点 = loop pre-turn 支（`loop.ts`）：成功 `clearAutoCompactCircuitFailures()`（:498）/ 失败 `reportAutoCompactCircuitFailures(oc.consecutiveFailures)`（:540）** | 需 **3 连败 proactive auto-compact**（非 413 反应式）才跳闸（store=3）→ 触发 D2 TokenWarning 暂停态。**注：D1 反应式支独立于该 store（不 report/clear）→ 反应式成功不复位 store**；探针捕获 ① 时机 = 第 3 次 proactive 失败后、413/反应式恢复前（store=3 已 report，跳闸态在场即捕获，两口径均稳） |
| **断路器跳闸态（D2）** | `TokenWarning.tsx`（现状只显示 `Context low (X% remaining) · Run /compact`，无跳闸态）→ ③ D2 增**英文**跳闸态渲染 `TokenWarning.tsx:177` = `auto-compact paused after ${N} consecutive failures · run /compact, switch to a smaller model, or start a new session`（**f4 落码定 = 英文非初稿中文**）；仅当 `isAutoCompactEnabled()`（showAutoCompactWarning）+ 跳闸态（`isAutoCompactCircuitTripped(circuitFailures)`）时渲染。+ **模型侧告知**（`agentLoopDeps.ts:178`）：跳闸态（`circuitFailures>=3`）注入 `systemContext.autoCompactCircuit = "Auto-compact is paused after N consecutive failures: respond concisely and avoid requests that expand the context — manual /compact, switching to a smaller model, or starting a new session are the recovery paths."`（NEVER_SENTENCE 防 futile，纯加性仅跳闸态注入） | **V4 断言 ①**：TUI 抓**英文**正则 `auto-compact paused after \d+ consecutive failures`（渲染面，`showAutoCompactWarning` 须 ON=默认）；**辅助断言**：模型侧告知 `Auto-compact is paused after` 经 systemContext 注入（跳闸态在场时 LLM 请求 system 面在场，fault-proxy 日志可核） |
| **反应式压缩（D1）** | `tryReactiveCompact`（`tui/contextBodies/reactiveCompact.ts:91`）委托富 `compactConversation`（LLM 摘要）+ `hasAttempted` **一次性门** + abort 门 + querySource 门；成功 → `buildPostCompactMessages` 重建 + 本回合重试一次；失败 reason 词表 `too_few_groups/aborted/exhausted/error/media_unstrippable` → 回显原始 413（体 :130-135） | **V4 断言 ②/③**：② 413 后反应式压缩触发且**回合存活**（模型续行给终答，非 413 死）；③ **一次性门**（同回合二次 413 不重压 → 回显原始 413） |
| **env 可杀** | `ATLAS_DISABLE_REACTIVE_COMPACT=true`（`reactiveCompact.ts:22` `isReactiveCompactEnabled` 缺省 ON）；`ATLAS_REACTIVE_ONLY=true`（:67，主动全抑制仅 413 触发） | 探针对照组：`ATLAS_DISABLE_REACTIVE_COMPACT=true` 时 413 应**不**反应式恢复（回显 413），锁「门控真生效」非恒绿 |
| **窗口 cap 缓解**（断路器可触发性） | `autoCompactWindow.ts` `settings.autoCompactWindow={kind:'window',tokens:N}`（N≥1000）→ `contextWindow=min(contextWindow,N)`；阈值=`有效窗−min(maxOutput,20k)−13k`。deepseek-v4-pro 原生窗 1000k → 阈值≈967k **测试不可填**；**seed `autoCompactWindow:{kind:'window',tokens:50000}` → 阈值≈17k，可填** | 探针沙箱 settings.json（userSettings）seed 该档位；用 proxy 脚本化 tool_use 回合把对话填到 ~17k token 触发 proactive auto-compact |
| **compact 调用识别面**（fault-proxy 脚本 3 连败的关键，源级定因） | ③ 的 auto/reactive compact 摘要 LLM 调用经 `streamCompactSummary`（`tui/contextBodies/compact.ts:988`）双支：主支 `runForkedAgent`（cache 共享，`querySource:'compact'`/`forkLabel:'compact'`，`:1040`）+ 流式兜底支 `modelProvider.chatStream`（`:1161`）。**两支都用 `context.options.mainLoopModel`（兜底支 `:1129`）= 与主循环同模型 → model/role 字段不可判别**；兜底支 system prompt=`'You are a helpful AI assistant tasked with summarizing conversations.'`（`:1134`）仅兜底支在场。但**两支请求体都含 `summaryRequest`（= `getCompactPrompt`，`:419`/`:1120`）** | **fault-proxy `detectCompact(body)` = 请求体含 compact-prompt marker（`CRITICAL: Respond with TEXT ONLY`〔NO_TOOLS_PREAMBLE 首行〕或 `Your task is to create a detailed summary`〔BASE_COMPACT_PROMPT 首行〕）**——两支通用、主循环自然对话不会逐字含此串，识别稳；**非** model/role 判据（同模型）；兜底支 `'…summarizing conversations.'` system 可作二次确认，非必需 |

## ② fault-proxy 扩展 spec（`user-e2e/loop-robustness/fault-proxy.ts`，e2e 交付，Main 随 ③ 波收编）

现 proxy 支持 `500|drop|empty|delay` 故障 + 主循环 tool_use 脚本 + classify_result 注入。**③ 需加 3 件**：

1. **`ptl` 故障种**（FaultKind 增 `'ptl'`）：回 HTTP 413 + OpenAI error body `{error:{message:"Prompt is too long: request exceeds context window",type:"invalid_request_error",code:"prompt_too_long"}}`（message 必含 `Prompt is too long` = engine `classifyAPIError` 命中面）。
2. **compact 调用判别**（`detectCompact(body)`，仿 `detectClassifier`）：识别 compact LLM 摘要调用（vs 主循环）→ 用于「前 3 次 compact 失败、第 4 次成功」序列。**识别面已定因（§1 表「compact 调用识别面」行，源级核过 `tui/contextBodies/compact.ts:988`）**：compact 摘要双支（`runForkedAgent` cache 共享主支 + `modelProvider.chatStream` 流式兜底支）都用 `context.options.mainLoopModel`（**与主循环同模型，model/role 字段不可判别**），但两支请求体都含 `summaryRequest`（= `getCompactPrompt`）→ **`detectCompact(body)` = 请求体含 compact-prompt marker（`CRITICAL: Respond with TEXT ONLY` 或 `Your task is to create a detailed summary`）**，主循环自然对话不含此串 → 识别稳。**原最高风险项已解除**（残留小面：其他 summarizer〔sessionMemoryCompact 等〕用异 prompt，不撞 marker；兜底支 system `'…summarizing conversations.'` 可作二次确认，非必需）。
3. **序列态机**（`CompactPlan`）：`{ compactFailN: 3, thenSucceed: true, mainLoopPtlAt: <call> }`——前 3 次 compact 调用注 500（跳闸），第 4 次 compact 回有效摘要（回合存活），主循环在指定 call 注 `ptl`（413）测 D1 + 二次 413 测一次性门。现 `pickFault` 是 counter-based，需扩成「按调用类型 + 序号」的状态机。

## ③ V4（TUI 面）探针流程

前置：沙箱 seed `autoCompactWindow:{kind:'window',tokens:50000}` + 三角色/顶层 model 对齐 `iff/deepseek-v4-pro`；fault-proxy 挂 8998（settings providers.iff.baseURL 指它，主循环前 count 次脚本化 tool_use 填 context）。

| 步 | 动作 | proxy 脚本 | 断言（f4 判据） |
|---|---|---|---|
| 1 | 填 context 到 ~17k token（脚本化 tool_use 多回合） | 主循环前 K 次脚本化 Write tool_use（大 content） | context 达阈值（context-bar token 计数爬升） |
| 2 | 触发 proactive auto-compact ×3 失败（跳闸） | compact 调用 1-3 → 500 | **① TokenWarning `auto-compact paused after 3 consecutive failures · run /compact…` 英文跳闸态在场**（D2，`TokenWarning.tsx:177`） |
| 3 | 主循环请求 → 413（PTL） | 主循环 call=N → `ptl`（413 + "Prompt is too long"） | **② 反应式压缩触发且回合存活**：`buildPostCompactMessages` 重建 + 本回合重试一次 → 模型续行给终答（非 413 死、非挂死） |
| 4 | 同回合再触发一次 413 | 主循环再 call → `ptl` | **③ 一次性门生效**：`hasAttempted` 已置 → **不重压**，回显原始 413（`Prompt is too long` 现形，无二次压缩） |
| 5（对照） | `ATLAS_DISABLE_REACTIVE_COMPACT=true` 重跑 3 | 同 | 413 **不**反应式恢复（回显 413）= 门控真生效（防恒绿假 PASS） |

**流程定因注**：
- **413 是 fault-proxy 脚本注入，非自然模型限 413**：window cap 50k 只压 auto-compact 阈值（17k），不压真实模型窗（1000k）；~17k 对话对 deepseek-v4-pro 真实窗远未达 413，故 PTL 必由 proxy 在指定主循环 call 注 413 + "Prompt is too long"。
- **捕获顺序（避复位 race）**：① 跳闸态在**第 3 次 proactive auto-compact 失败后、413/反应式恢复前**即断（跳闸态在场即捕获）；即便 ③ D1 反应式成功复位 `consecutiveFailures`（§6 待核项②），① 已捕获，不受影响。proactive 3 连败 → 断路器 trip（`consecutiveFailures>=3` 短路 proactive auto-compact）→ 主循环 call 脚本注 413 → D1 反应式支（独立一次性门 `hasAttempted`，不受 proactive 断路器短路）fire → 第 4 次 compact 注成功摘要 → `buildPostCompactMessages` 重建 + 本回合重试存活。
- **为何 3 连败可发生**：window cap 使阈值 17k；每回合 proactive auto-compact 各注 500 → 3 回合 = 3 连败 = trip（真实窗 1000k 下阈值 967k 不可达，故 cap 是 3 连败可触发的先决条件）。

**产物**：`artifacts/C413-<ts>-<rand>/{ticket.md,result.json,leader.log,proxy.log}`；verdict = hardFail=0 且 ②③ hard 判据 PASS（① D2 态 = hard，措辞漂移则 INCONCLUSIVE 定因登记）。

## ④ V7（headless lane）探针

同 V4 判据，走 headless（`atlas -p`/print lane，非 TUI）：proxy 序列同上，断言 ①（headless 无 TokenWarning UI 面 → 改断言 **断路器跳闸态经模型侧告知/日志面在场**，或降级为源级在场 + V4 TUI 面实证）② 413 后反应式恢复 + 回合存活（headless 进程给终答 exit 0，非 413 死）③ 一次性门（二次 413 回显原始 413）。**headless 无 TUI 渲染 → ① 在 V7 = 条件满足/定因登记（非缺口）**，TUI 面由 V4 实证。

## ⑤ 回归同口径（③ gate 必含）

- 既有 **413/maxTokens 自修语义单测零回归**：`withRetry` `maxTokensOverride` A 类 400（`parseMaxTokensContextOverflowError`，input+maxTokens 超窗）行为不变（B 类 PTL 才走 ③ 新通道，A 类不得被 ③ 改坏）。
- **A4F 6 句**（`accept.ts A4F`）+ **S-A**（`accept.ts P0a`）+ **P0a 隔离重跑**（串行防网关 8999 竞争）。
- **四件套**：tsc 0 / eslint（③ 变更文件）/ build / 全量（3709/0·265 基线 + ③ 增量单测）。

## ⑥ 就绪度 / 待办 / 风险（③ 落码后）

- **已定因**（本文件 §1）：PTL 触发面（413 + "Prompt is too long" message）、断路器 3 连败机制、窗口 cap 缓解（`autoCompactWindow` window 档填 50k→阈值 17k 可触发）、一次性门 `hasAttempted`、env 门控、D2 措辞基线、**compact 调用识别面（请求体 compact-prompt marker，非 model/role）**。
- **原最高风险（compact 调用识别面）已解除**（§1/§2.2 源级定因）。**3 待核项已由 ③ 落码定（f4 2026-10-07 ③ code-complete 单信号，据此对齐探针）**：① **D2 实际渲染措辞 = 英文 `auto-compact paused after N consecutive failures · run /compact, switch to a smaller model, or start a new session`（`TokenWarning.tsx:177`，非初稿中文）→ V4① 正则对齐英文 `auto-compact paused after \d+ consecutive failures`**；② **断路器计数器 = `autoCompactCircuit` store（`getAutoCompactCircuitFailures`/`isAutoCompactCircuitTripped`/`report`/`clear`），更新点 = loop pre-turn 成功支 `clearAutoCompactCircuitFailures`（loop.ts:498）/ 失败支 `reportAutoCompactCircuitFailures`（:540）；D1 反应式支独立于该 store（不 report/clear）→ 反应式成功不复位 store（跳闸态保持，直到下一 proactive 成功才 clear）；探针捕获 ① 时机 = 第 3 次 proactive 失败后、413/反应式恢复前，两口径均稳**；③ **③ 增量单测文件 = `tests/unit/engine-reactive-compact-circuit.test.ts`（14 测：判形/store/loop 反应式重试+一次性门/kill-switch/窄 spine）+ `tests/unit/loop-deps-compose.test.ts` T-5 headless 消费者装配在场（1 测）= 15，全量 3724/0·266（基线 3709/0·265 + ③ 增量 15）**。
- **③ 未落码期间**：V4/V7 的 ②③① 判据在 baseline（无 ③）= **预期红/INCONCLUSIVE**（③ 缺 = 413 死、无跳闸态、无一票门），非产品缺陷——baseline-expected-red 口径（`accept.ts --baseline` 同纪律）。
- **执行时机**：③ code-complete（Main）→ f4 发 ③ gate 验收请求 → e2e 依本设计实现 `compact413-v47.ts` 探针 + fault-proxy 3 扩展 → 跑 V4/V7 + 回归 → verdict 回 f4。
- **交付物**：本设计 + `user-e2e/tui-diff/compact413-v47.ts`（③ 落码后实现）+ fault-proxy 扩展，留 e2e 工作区，Main 随 ③ 波收编。
