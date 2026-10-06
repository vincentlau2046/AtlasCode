# 2026-10-06 TUI 权限链路 + 主/子循环 全链路跟踪分析（含业界/本地参照比较与处置推导）

> 本文件 = 本次 trace 的完整交付物：① 权限申请复合逻辑全链路（各路径可正常设置/选择、No 后不硬停止）② 主循环与子循环的 bug/stub 风险 ③ 业界与本地参照实现的同类处置比较 ④ 逐条「问题/根因/期望表现形式/处置方式/推导过程或参考来源」结构化处置建议。
>
> **方法**：2 个只读深读 agent（权限决策链路 / 循环与异常退出面）+ 本人对全部高危项与 No 路径的独立回源复核（非转述，标注 CONFIRMED）。
> **参照实现**（处置推导的事实源，均本地可查）：
> - **A. 业界标杆**：`~/projects/claude-code-sourcemap/restored-src/`（Claude Code 2.1.88 还原源码，= 旧仓同源，即 AtlasCode 的分叉母体）
> - **B. 本地 harness**：`~/projects/deepseek-harness/`（模块化 agent harness，guard/interaction/compaction/subagent 独立一等包）
> - **C. 用户视角基线**：长程工作用户的心智模型（见 §2 原则推导）
>
> **证据状态标注**：`[已核]` = 本人读码确认；`[agent]` = 深读 agent 报告（本人对高危项已抽验）；`[参照:路径:行]` = 参照实现证据。

---

## §1 架构总览（权限复合逻辑）

### 1.1 双决策体 + 一桥 + 一消费点

```
工具调用 → toolExecution.ts:329 deps.checkPermission(桥)
            └─ buildInteractiveGate (src/tui/loopPermissionBridge.ts:64-124)
               ├─ engine 门 createPermissionGate (src/engine/permissions/permissionGate.ts:56-85)
               │   └─ 决策体 A：src/permissions/permissions.ts（窄 TPC，确定性快路径）
               ├─ verdict 非 ask → 原样返回（allow/deny 快路径；#278 setAllowVerdict 已落 :94-105）
               └─ verdict.ask → canUseTool（TUI 交互权威，src/tui/hooks/useCanUseTool.tsx）
                   ├─ 决策体 B：src/tui/utils/permissions/permissions.ts（富上下文 + autoMode/dontAsk/headless）
                   └─ 弹窗队列（src/tui/components/permissions/*）
            → 消费：src/engine/pipeline/toolExecution.ts:336-351
               !allowed → tool_result{is_error}（回合继续）
               allowed  → 采纳 updatedInput → tool.call
```

### 1.2 决策体 A 分支序（engine，`src/permissions/permissions.ts`）[已核]

`0 forceDecision→dontAsk 早退(:130-135)` → `1a deny 规则 8 源(:140-152)` → `1b ask 规则 + sandbox 自动放行守卫(:157-183)` → `1c 工具自决 checkPermissions 鸭子分发（abort 形错误重抛，其余吞掉 :192-202）` → `1d 工具 deny(:205-207)` → `1f 内容 ask（bypass-immune）(:211-220)` → `1g safetyCheck（bypass-immune）(:222-229)` → `2a bypass/plan 放行(:233-248)` → `2b allow 规则(:250-263)` → **⚠ 无 TPC 上下文 → allow 薄骨架默认(:267-276)** → `3 passthrough→ask，终点 dontAsk→deny(:280-303,332-348)`

规则 8 源：userSettings/projectSettings/localSettings/flagSettings/policySettings/cliArg/command/session（`ruleMatching.ts:77-86`）。

### 1.3 决策体 B 附加（TUI lane，`src/tui/utils/permissions/permissions.ts`）[agent+已核关键项]

- **auto-mode 分类器门**(:505-796)：`TRANSCRIPT_CLASSIFIER` **默认开**（`src/shared/feature.ts:19-27`，2026-09-19 裁定翻转；env kill-switch `FEATURE_TRANSCRIPT_CLASSIFIER=false`）+ `isAutoModeGateEnabled`（未熔断 + settings + modelSupportsAutoMode）。
- **分类器不可用 = fail-closed 默认**：`atlas_iron_gate_closed` 默认 **true**（:697-721，本人核实）→ deny `buildClassifierUnavailableMessage`；显式置 false 才 fail-open 回弹窗。
- **dontAsk 模式**：所有 ask→deny（:490-502）。
- **headless 自动拒绝**：`shouldAvoidPermissionPrompts` → AUTO_REJECT（:799-822）。
- **拒绝限额**：maxConsecutive 3 / maxTotal 20（`denialTracking.ts:12-15`）。

### 1.4 hook 合流

`mergeHookPermission`（toolExecution.ts:146-158）：hook `deny`→deny；hook `ask` + 门 allow → **fail-closed ask**（hook 不能把门 allow 升级，但可降级）。

### 1.5 检查入口点全表

| # | 入口 | 触发 | 位置 |
|---|---|---|---|
| 1 | REPL 交互门 | agent loop 每次 tool_use | `src/tui/agentLoopDeps.ts:175`（buildInteractiveGate） |
| 2 | headless engine 门 | headless/SDK loop | `src/engine/loopDeps.ts:200-219` |
| 3 | CLI print | `verdict.ask && hasPromptRoute` → SDK control_request | `src/cli/print.ts:693-720` |
| 4 | stdio canUseTool | SDK control_request | `src/cli/structuredIO.ts:640+` |
| 5 | CLI PermissionPrompt 工具 | 模型调用 | `src/cli/permissionPrompt.ts:115-156` |
| 6 | swarm teammate 门（进程内） | teammate tool_use | `src/swarm/inProcessRunner.ts:439`（leader 队列 :476-579 / mailbox 兜底 :582+） |
| 7 | swarm worker（TUI） | COORDINATOR_MODE | `src/tui/hooks/toolPermission/handlers/swarmWorkerHandler.ts:52-157` |
| 8 | /permissions 规则 UI | 用户命令 | `src/tui/commands/permissions/index.ts` |
| 9 | CLI 模式选择 | 启动 | `src/engine/permissions/permissionSetup.ts:139-212` |

---

## §2 "No" 路径判定（用户核心问题，全链逐环核实 [已核]）

**判定：选 No 不硬停止任何东西——不 exit、不 abort、不 throw。No = 软拒绝，回合继续。这是设计正确的行为。**

| 环 | 位置 | 行为 |
|---|---|---|
| ① 弹窗选 No | `FallbackPermissionRequest.tsx:93-107` | `onReject(feedback)`+`onReject()`+`onDone()`（出队+还原输入栏，**不 resolve promise**） |
| ② canUseTool 决策 | `src/tui/hooks/toolPermission/PermissionContext.ts:197-202` | `buildReject` → `behavior:'ask'`（TUI 形）+ REJECT_MESSAGE 逐字文案 |
| ③ 桥 | `loopPermissionBridge.ts:117-122` | `behavior!=='allow'` → `{allowed:false, reason: message ?? 'permission denied'}` |
| ④ 消费 | `toolExecution.ts:336-351` | `tool_result` `is_error:true`，`<tool_use_error>permission denied: …</tool_use_error>` |
| ⑤ 循环 | `loop.ts:355-365` | 包成 user message；`queryAgentLoop` 只在某回合 0 个 tool_use 时终止 → 模型看到拒绝并继续 |

**三套停止语义严格分离（设计正确，须保持）**：
- **No/拒绝** → 软 `tool_use_error`，回合继续（上表全链）。
- **Esc / Ctrl+C（`app:interrupt`）** → `onAbort`→`cancelAndAbort`（`PermissionContext.ts:207-220`）= **abort 本回合**（A2 裁定：取消≠No，`FallbackPermissionRequest.tsx:130-134` 注释明示）。
- **进程级退出** 只发生在关停机（SIGHUP/SIGTERM/孤儿 TTY 30s 检测，有界清理 + failsafe forceExit）与 lane 错误（headless `exitCode=1` 自然退出；TUI 错误行存活）。

**弹窗选项面**（`FallbackPermissionRequest.tsx` 已核）：`Yes`（单次）/ `Yes, and don't ask again`（always，**A1 裁定落 session 域** `destination:'session'`，resume sidecar `session-rules.json` 恢复，MAX 1MB）/ `No` / Esc(=abort)。always 受 `shouldShowAlwaysAllowOptions()` 门控；Bash 危险前缀（rm/sudo/cd/单字符/通配）隐藏 always 变体。持久化链：disk 域（local/user/project）经 `persistPermissionUpdates` + 内存 TPC 经 `applyPermissionUpdates` 热更；失败 → 通知（非崩溃）。AutoModeConfirm（A3 门）：Confirm/Cancel 前置视图，Cancel 回原列表（请求仍 pending），不杀回合。

**权限模式表**（`src/permissions/permissionMode.ts` 已核）：

| 模式 | 选择途径 | 可设 | 备注 |
|---|---|---|---|
| default/plan/acceptEdits | settings/`--permission-mode`/Shift+Tab 循环 | ✅ | 序 default→acceptEdits→plan→(bypass∣auto)→default |
| bypassPermissions | `--dangerously-skip-permissions`；Shift+Tab 需 `isBypassPermissionsModeAvailable` | 门控 | settings `disableBypassPermissionsMode` + Statsig 双闸；1f/1g bypass-immune |
| dontAsk | settings/setMode | ✅ | **不在 Shift+Tab 循环**（映射回 default）；ask 全转 deny |
| auto | TUI 内部：TRANSCRIPT_CLASSIFIER 默认开 + `isAutoModeGateEnabled`；**engine 校验集裁掉 auto**（CLI lane settings `auto` 降 default） | 门控 | `transitionPermissionMode` 门未开时 throw（调用方 `isAutoModeOptionVisible` 守卫） |
| bubble | 类型并集残员 | ❌ 不可达 | 运行时映射 default（死类型成员） |

---

## §3 参照比较：同类情况业界/本地如何处置

> 本章是 §5 处置推导的事实基础。每条标注参照实现内的证据位置。

### 3.1 压缩失败/断路器（对应 P2）

| 参照 | 做法 | 证据 |
|---|---|---|
| A. CC 2.1.88 | **同样的 3 次断路器**（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3`，注释明言防"每回合拿注定失败的压缩锤 API"）→ 断路器本身是共识设计，**不是 AtlasCode 的偏差** | [参照:restored-src/src/services/compact/autoCompact.ts:70,262,343] |
| A. CC 2.1.88 | **四层防御**：① 主动 auto-compact ② 断路器 ③ **`reactiveCompact`（feature REACTIVE_COMPACT）：query loop 内 `isWithheldPromptTooLong` 拦截 413/prompt-too-long（withheld=先拦截再压缩，回合不死），支持 "reactive-only 模式"（抑制主动压缩全靠反应式）** ④ **用户可见 `TokenWarning` 上下文条**（"Context low (X% remaining) · Run /compact to compact & continue"）+ `compactWarningHook` 抑制 + 手动 `/compact` 兜底 | [参照:restored-src/src/query.ts:15,811,1119；src/components/TokenWarning.tsx:166-169；src/services/compact/compactWarningHook.ts] |
| B. deepseek-harness | **两层压缩**：LLM 摘要层（compaction-basic，checkpoint 化、KV-cache 感知、replay-aware）+ **`compaction-tool-result-pruner` 无模型确定性剪枝层**（replay-safe、零模型成本、marker 化）——**当 LLM 层坏掉时（恰是断路器跳闸场景），无模型层是唯一可用恢复手段**；目标压力模型（压到 X% 窗口而非单一硬阈值） | [参照:packages/compaction/compaction-basic/src/index.ts（header）；packages/compaction/compaction-tool-result-pruner/src/index.ts:1-3] |
| C. 用户视角 | 长会话用户的心智模型："上下文满了系统会自己处理；处理不了会告诉我、并给我一个能操作的出口"。**静默永久短路 = 最坏的失败形态**（用户无感知，直到每回合 400 才暴雷） | 推导见 §2 原则 4 |

**AtlasCode 现状**：①② 已落（与参照一致）；③ **端口与体已存在但 engine loop 无消费者**（`src/engine/context/highGapPorts.ts:152-164` 端口 + `src/tui/contextBodies/reactiveCompact.ts` 体 + `contextHostWiring.ts:191-199` TUI 接线，唯一消费方是**手动** `/compact` 命令 `src/tui/commands/compact/compact.ts:173`）→ 413 在回合内直接杀回合（headless lane 全无恢复）；④ `TokenWarning.tsx` 已继承（"Context low … Run /compact"），但断路器跳闸后无专门状态面。

### 3.2 权限请求挂死/无应答（对应 P1/P6）

| 参照 | 做法 | 证据 |
|---|---|---|
| A. CC 2.1.88 | **与 AtlasCode 结构逐行一致**：同 `PERMISSION_POLL_INTERVAL_MS=500`、同 `setInterval`、同 cleanup-only-on-allow/reject/abort、**同无超时** → HIGH-1 属**继承特征**（母体同样存在），非回归 | [参照:restored-src/src/utils/swarm/inProcessRunner.ts:114,386-452] |
| B. deepseek-harness | **① 超时一等包**：`guard/timeout-policy` —— 工具声明 `timeoutMs` 并承诺协作式尊重 `exec.signal`；包装器武装 deadline，**仅当本层 timer 先到期时**把结果替换为**结构化 `TOOL_TIMEOUT` isError tool-result**（模型可见、回合继续），且 signal swap/restore 防竞态、scoped code 防嵌套误判 | [参照:packages/guard/timeout-policy/src/index.ts:1-80] |
| B. deepseek-harness | **② 闭合结果词表 + fail-closed**：`user-approval` 的 `ApprovalOutcome = 'allowed-once' \| 'rejected' \| 'cancelled' \| 'unavailable'`——**"无应答者"是一等结果且 fail-closed**；**③ 审计配对**：`approval/asked` ↔ `approval/decided` 以 id 配对，"exactly one per ask, appended when the outcome is known: a decision, a cancellation, or the fail-closed 'unavailable'"——**孤儿 pending 在该词表下不可表示** | [参照:packages/interaction/user-approval/src/types.ts:24；src/index.ts（events 注释）] |
| B. deepseek-harness | **④ 策略显式告知模型**：`'never'` 策略注入模型可见语句（"Approval prompts are disabled … do not request sandbox escalation"）——**模型被告知策略，避免 futile 请求浪费回合** | [参照:packages/interaction/user-approval/src/index.ts（NEVER_SENTENCE/ASK_SENTENCE）] |

**AtlasCode 现状**：teammate 门 mailbox 兜底无超时（`inProcessRunner.ts:583-703`，本人核实：`setInterval` 只在 cleanup 清、未 unref）；响应 drop 静默（`permissionPoller.ts:111-143` 无回调即丢、`/clear` 清注册表、无重试、无审计事件）。

### 3.3 工具链 throw（对应 P3）

| 参照 | 做法 | 证据 |
|---|---|---|
| B. deepseek-harness | **guard 包装器模式**：错误 = **结构化结果**（`error: {message, info: {name, code}}`）而非进程级事件；包装器"只替换本层 timer 到期时的结果"——错误被归因、被路由（retry/sandbox 插件可按 code 路由），模型可见、会话存活 | [参照:packages/guard/timeout-policy/src/index.ts（toolTimeoutResult）] |
| B. deepseek-harness | `guard/repeat-tool-reminder`：**doom-loop 检测**作为独立 guard（工具重复调用提醒）——把"模型空转"从循环层下沉为 guard 包 | [参照:packages/guard/repeat-tool-reminder/src/index.ts] |
| C. 用户视角 | 用户心智模型："某个 hook/扩展坏了，**那一次工具调用**降级报错，工作继续；不要整个回合蒸发"。**配置错误 ≠ 会话死亡** | 推导见 §2 原则 2/5 |

**AtlasCode 现状**：toolExecution 4 个无守卫缝（`validateInput` throw :279 / pre-hook :293 / 权限门 :330-333 / post-hook :401 在 try 外）——任一 throw 杀回合；`src/atlascode/cli.ts:70-78` P0-1 注释已记录同类实例（hook bootstrap 未注入曾 reject 整个 loop）。

### 3.4 无应答者的默认方向（对应 P4）

| 参照 | 做法 | 证据 |
|---|---|---|
| B. deepseek-harness | **无应答者 → fail-closed `'unavailable'`**（"Callers fail closed on `unavailable`"；`'never'` 策略 = 头less 严格态，确定性拒绝且结果可预知） | [参照:packages/interaction/user-approval/src/types.ts:24；index.ts（ApprovalPolicy）] |
| A. CC 2.1.88 | engine 门在 lane 启动即构造 TPC（loopDeps），"无 TPC"仅在未接线时出现；安全方向 = 头less lane 无交互应答者时 fail-closed（与 AtlasCode 自家 iron-gate 哲学一致：`atlas_iron_gate_closed` 默认 true） | [参照:restored-src/src/query/deps.ts；AtlasCode src/tui/utils/permissions/permissions.ts:697-721] |

**AtlasCode 现状**：engine 决策体 A "无 TPC = allow"（`permissions.ts:267-276`，§8.33 矛盾④ 薄骨架兼容）——当前两个调用点都供 TPC（loopDeps/bridge），**未来新增调用方漏供 = 静默全放行**。

### 3.5 进程退出/关停机（对应 P5）

| 参照 | 做法 | 证据 |
|---|---|---|
| A. CC 2.1.88 | `uncaughtException`/`unhandledRejection` **log-only 存活**（与 AtlasCode 同策略——继承特征）；但参照**同时**做 `logForDiagnosticsNoPII` + `logEvent('tengu_*')` 双写（持久诊断 + 遥测），存活策略配观测 | [参照:restored-src/src/utils/gracefulShutdown.ts:295-330] |
| B. deepseek-harness | **进程监督一等化**：`subprocess` 包含 `process-inspector`（子进程巡检）+ `jobs` 取消语义——长驻 lane 的存活/清理由独立监督面负责，而非散在入口 | [参照:packages/subprocess/subprocess-local/src/process-inspector.ts；packages/jobs/…/brand.ts] |

**AtlasCode 现状**：`dispatch.ts:82-92` 非 print 模式 SIGINT → **raw `exit(0)` 无清理**（残留守注释明示旧 gracefulShutdown(0) 族未迁）——长驻 `--sdk-url`/bridge 会话 Ctrl+C 无 session 冲刷、无 hook。

### 3.6 键位模态隔离（对应 P9，历史 P0 面）

| 参照 | 做法 | 证据 |
|---|---|---|
| A. CC 2.1.88 | **单一全局 `ChordInterceptor`（useInput FIRST，先于所有子组件注册）+ 集中优先级** `[...handlerContexts, ...activeContexts, "Global"]`：任何**已注册 handler 的 context**（如弹窗的 "Confirmation"）自动高于 activeContexts/Global，弹窗键胜出靠 `stopImmediatePropagation`——**模态隔离靠"单拦截器 + 集中优先级"，不靠各组件竞速**。'Confirmation' 同样不经 `useRegisterKeybindingContext` 注册（与 AtlasCode 一致，只有 ThemePicker/Autocomplete 注册） | [参照:restored-src/src/keybindings/KeybindingProviderSetup.tsx:198-260（ChordInterceptor）；src/keybindings/useKeybinding.ts] |
| 历史 P0（本仓） | 侧栏 1-5 键抢吃弹窗 '1'，root = **SidePanel 本地 context 恒入匹配栈 + open\* 无模态门**（0.1.23 双 cede 修法已落）——SidePanel 是 AtlasCode 特有增量（参照无此组件），故 P0 = **本仓增量引入**而非继承 | 记忆 tui-optimization-division；gate 0f8de6b 回归修 |

**AtlasCode 现状**：`'Confirmation'` 从未注册为 active context（全仓仅 `'Autocomplete'` 调用 `useRegisterKeybindingContext`）；隔离实际依赖 ChordInterceptor 的 handlerContexts 优先级 + 各 handler `isActive` 门（如 `ScrollKeybindingHandler` 在 `focusedInputDialog==='tool-permission'` 时停用，`REPL.tsx:4271`）。静态看门已接，**"按 1 不被抢吃"需 PTY 探针复证**（见 §6 V1）。

### 3.7 max_tokens 截断（对应 P8）

| 参照 | 做法 | 证据 |
|---|---|---|
| A. CC 2.1.88 | `tengu_max_tokens_escalate` 事件 + `stop_reason === 'max_tokens'` 处理（升级/续写路径） | [参照:restored-src/src/query.ts:1204；src/services/api/claude.ts:2266] |
| AtlasCode | 登记残留守：`loop.ts:27-28`"本版无 tool_use 即终止，不误续"——**截断末答被当终结（长输出静默截断）**，与参照的续写/升级行为相反（已知设计取舍） | [已核：loop.ts:27-28 注释] |

---

## §4 通用处置原则（从参照推导，§5 各条的公共依据）

> 用户要求：不直接给方案，从优秀实现/用户视角推导。以下 6 条原则均出自上表参照的具体实现，处置时逐条引用。

1. **闭合结果词表 + 无应答 fail-closed**（来源：deepseek-harness `user-approval` 四态词表 + `'unavailable'` 一等结果）。**推导**：任何交互请求必须存在**有界的终态**；"永远 pending"在词表层面不可表示，挂死就从"可能"变"不可能"。凡新增异步请求面，先定结果词表，再定超时。
2. **结构化错误结果，而非进程级事件**（来源：deepseek-harness `timeout-policy` 的 `TOOL_TIMEOUT` isError tool-result；AtlasCode 自家 toolExecution 的 `tool_use_error` 模式）。**推导**：降级不崩溃——错误进 transcript 给模型看（模型可换路），会话存活；错误带 `code` 可被下游（retry/审计/UI）路由。
3. **分层恢复 + 最底层无模型**（来源：CC reactiveCompact 拦截 413；deepseek 无模型 tool-result-pruner 独立于 LLM 摘要层）。**推导**：LLM 依赖层（摘要/分类器）会坏；**最后一道防线不得依赖正在坏的那个东西**。断路器跳闸场景（摘要模型坏 ≥3 次）恰好只剩无模型层可用。
4. **用户可见状态 + 用户可操作出口**（来源：CC `TokenWarning` 上下文条 + "Run /compact" 行动建议；deepseek 策略语句告知模型）。**推导**：静默短路是最坏失败形态；任何"系统放弃自动恢复"的决定，必须伴随用户面状态 + 一个用户能执行的恢复动作（/compact、换小模型、开新会话），且模型侧同步告知（防 futile 请求）。
5. **审计配对**（来源：deepseek `approval/asked`↔`approval/decided`，id 配对、exactly-one 不变量）。**推导**：每个请求有记录在案的结局；drop/clear/超时 都产生 `decided` 审计事件（含 `unavailable`），使"孤儿 pending"可观测、可核销。
6. **存活不崩 + 持久观测**（来源：CC/AtlasCode 同策略 log-only；参照配套 `logForDiagnosticsNoPII` + 遥测双写）。**推导**：保持存活策略（继承特征，不动），但 log-only 必须配持久落盘（stderr 会随终端死），否则长会话反复 uncaught = 静默退化且不可诊断。

---

## §5 结构化处置清单（问题/根因/期望表现形式/处置方式/推导过程或参考来源）

### P1 [HIGH] teammate 权限门 mailbox 兜底挂死 + 活定时器阻塞退出

- **问题**：leader UI 队列不可用 + leader 永不响应 + 未 abort 时，teammate 的权限 promise 永不 settle，回合挂死；500ms `setInterval` 未 unref → 阻塞进程干净退出；`pendingCallbacks` 泄漏。
- **根因**：门 promise 的 settle 面只有 3 个（allow/reject/abort），**无第 4 个终态（超时）**；继承自 CC 2.1.88 同构实现（非回归）。[已核 inProcessRunner.ts:583-703]
- **期望表现形式（用户视角）**：leader 失响应后约 N 秒，用户/模型看到 "approval unavailable（leader 未响应），tool 已拒绝"，teammate 回合**继续**；进程可干净退出；无 pending 增长。
- **处置方式**：
  1. 给 mailbox 兜底加**协作式 deadline**（参考 `timeout-policy` 包装器：仅本层 timer 先到期才替换结果；到期 → fail-closed deny，消息 = `unavailable` 语义（"approval not delivered: leader not responding"），按原则 2 以**结构化 tool_result(is_error + code)** 返回（模型可见、回合继续）；
  2. poller timer `unref()` + 到期/abort 时清理（原则 1 的有界终态）；
  3. `pendingCallbacks` 条目随 deadline 失效自动清理。
- **推导过程/参考来源**：原则 1（闭合词表，deepseek `ApprovalOutcome` 的 `unavailable`）+ 原则 2（结构化结果，deepseek `timeout-policy`）；参照 A 证实"无超时"是母体继承特征（[参照:restored-src/…/inProcessRunner.ts:386-452]），故处置 = **增强而非回归修复**，不改既有 allow/reject/abort 三路径语义。
- **验收**：杀 leader 后 teammate 问权 → N 秒内出现 unavailable deny 行 + 回合继续 + 进程 `node -e` 可退出（timer 无残留）+ `pendingCallbacks` 计数回落。

### P2 [HIGH] 压缩断路器永久跳闸 + 无限回合 → 长会话渐进失能

- **问题**：摘要模型/网关连续 3 次 compact 失败后，pre-turn compact **永久短路**（仅成功时复位）；REPL `unboundedTurns` → messages 无界增长 → 非可重试 400（prompt-too-long）→ **其后每回合皆死**。[已核 autoCompact.ts:57,532-535,554]
- **根因**：断路器本身是共识设计（防锤 API，参照 A 同注释）；**缺口在恢复层**：③（loop 内 413 拦截的反应式压缩）与④（断路器跳闸的用户面状态）缺失，且 LLM 恢复层与故障源同源（摘要坏 → LLM 恢复不可用）。[已核：highGapPorts.ts:152-164 端口存在但 engine loop 无消费者；唯一消费方=手动 /compact（compact.ts:173）；headless 无恢复]
- **期望表现形式（用户视角）**：断路器跳闸后，上下文条显示 "auto-compact 已暂停（N 次失败）· 可手动 /compact 或开新会话"；413 出现时系统**自动**做反应式压缩（LLM 层坏则用无模型剪枝层）再重试，回合不死；用户始终知道状态、始终有出口。
- **处置方式**：
  1. **wire ③**：engine loop 的 provider 错误路径对 prompt-too-long/413 调 `reactiveCompactOnPromptTooLong`（体已在 `contextBodies/reactiveCompact.ts`，TUI 端口已接线 `contextHostWiring.ts:191-199`）——delta 小：loop 内新增一个 413 消费点 + 压缩成功后本回合重试一次；
  2. **新增无模型剪枝层**（原则 3）：参照 deepseek `compaction-tool-result-pruner`（replay-safe、marker 化、零模型成本），作为断路器跳闸后的兜底恢复层——**最后一道防线不依赖摘要模型**；
  3. **断路器跳闸 = 用户面状态**（原则 4）：TokenWarning 增 "auto-compact 已暂停" 态 + 行动建议（/compact / 换小模型 / 新会话）；模型侧同步告知（deepseek NEVER_SENTENCE 模式，防 futile 请求）；
  4. 断路器复位策略：成功 compact 已复位（现状保持）；另加"距上次成功 compact ≥ M 回合"的软复位，防长会话永久锁死。
- **推导过程/参考来源**：参照 A 四层防御（[参照:restored-src/src/query.ts:811,1119 reactive 拦截；TokenWarning.tsx:168 用户面]）+ 参照 B 无模型剪枝层（[参照:packages/compaction/compaction-tool-result-pruner]）；原则 3/4。
- **验收**：制造 3 次连续 compact 失败 → 断言：① TokenWarning 出现暂停态 ② 413 时反应式压缩触发且回合存活 ③ 剪枝层在无 LLM 时仍可压 ④ 长 soak（N 回合）无 prompt-too-long 级联。

### P3 [HIGH] 工具链 4 个无守卫 throw 缝杀回合

- **问题**：`validateInput` throw（toolExecution.ts:279）/ pre-hook throw（:293）/ 权限门 throw（:330-333）/ post-hook throw（:401，在 call try 外）——任一实现 throw 即杀回合，在途工作丢失。`cli.ts:70-78` P0-1 已记录实例（hook bootstrap 未注入曾 reject 整个 loop）。
- **根因**：窄 spine 端口注入缝，调用方未做"配置/实现错误 vs 控制流（abort）"的区分。
- **期望表现形式（用户视角）**：某个 hook/门实现坏了 → **那一次工具调用**报 "hook/permission check failed: {原因}（降级继续）"，模型换路，会话存活；配置错误被日志 + 诊断面记一笔（用户可发现），而不是整个回合蒸发。
- **处置方式**：4 个缝各包 try/catch，**区分 abort 形错误重抛（控制流，照旧）vs 配置/bug 类错误 → 转结构化 tool_result(is_error + code)**（`validateInputFailed` / `hookError` / `permissionGateError` / `postHookError`），回合继续；post-hook 移入与 call 同级的 try；启动时对未注入的 hook 端口做 fail-fast 断言（P0-1 教训：未注入应 boot 期炸，不该在 loop 里炸）。
- **推导过程/参考来源**：原则 2（结构化结果，deepseek `timeout-policy` 的"包装器归因 + code 路由"模式 [参照:packages/guard/timeout-policy/src/index.ts:30-56]）+ 原则 5（配置错误可诊断）；abort 形重抛保留（参照 A engine 门 1c 支同语义，permissions.ts:196-198）。
- **验收**：单测 4 缝各注一个 throw → 断言 tool_result is_error 文案 + 回合继续 + abort 形仍重抛。

### P4 [MED] engine "无 TPC = allow" 薄骨架默认（静默全放行风险）

- **问题**：`permissions.ts:267-276` 未注入权限上下文 → allow（§8.33 矛盾④ 兼容默认）。当前两调用点均供 TPC；**未来新增 gate 调用方漏供 = 静默全放行**（安全相关默认方向反了）。
- **根因**：薄骨架期的"未接线 = 放行"兼容设计，安全默认未随接线完成而翻转。
- **期望表现形式（用户视角/安全基线）**：gate 构造期若 TPC 缺失，**启动日志/断言**报 "permission gate 未接 TPC，该 lane 以 fail-closed 运行"；headless lane 实际行为 = deny（无交互应答者），TUI 交互 lane 可保留 allow（弹窗是安全网）。
- **处置方式**：① gate 构造点（`createPermissionGate`）对 TPC 缺失打 **warn 级启动日志**（可观测化，不改共享默认）；② **headless lane 构造 gate 时显式注入 dontAsk 语义 TPC**（fail-closed，deepseek `'never'` 策略模式）；③ 单测锁"无 TPC headless 构造 = deny"。
- **推导过程/参考来源**：原则 1（无应答者 fail-closed，deepseek [参照:packages/interaction/user-approval/src/types.ts:24]）+ 本仓自家 iron-gate 哲学（`atlas_iron_gate_closed` 默认 true，permissions.ts:697-721）——安全默认方向已有先例，P4 只是把先例贯彻到 lane 构造层。
- **验收**：单测 + headless soak 断言 gate 缺失 TPC 时行为 = deny 且启动日志存在。

### P5 [MED] 非 print CLI lane SIGINT → raw exit(0) 无清理

- **问题**：`dispatch.ts:82-92` 非 `-p` 模式（含长驻 `--sdk-url`/bridge 会话）Ctrl+C → `process.exit(0)`，无 session 冲刷、无 hook、无清理（残留守注释明示）。
- **根因**：旧 `gracefulShutdown(0)` 族未迁移；`-p` lane 有自家 SIGINT-abort（print.ts:672-676）但 bridge lane 没有。
- **期望表现形式（用户视角）**：长驻 bridge 会话 Ctrl+C = **优雅停止**（冲刷 session、跑 SessionEnd 钩子、有界 failsafe）后退出，与 TUI 行为一致；而不是进程蒸发。
- **处置方式**：bridge/sdk lane 复用 TUI 的 `gracefulShutdown` 装配（机械已存在 `src/tui/utils/gracefulShutdown.ts`）；最小步 = 仿 `-p` 的 abort 处理器把 SIGINT 映射为 "abort 在途 turn + 清理 + exit(0)"，并补 SessionEnd 冲刷。
- **推导过程/参考来源**：原则 6（存活/退出配观测，参照 B 进程监督一等化 [参照:packages/subprocess/subprocess-local/src/process-inspector.ts]）+ 参照 A：`-p` lane 已有 abort 先例（print.ts 注释 S-C5 修波 B1），P5 = 把同一先例扩到其余长驻 lane。
- **验收**：bridge lane Ctrl+C → 断言 session 文件冲刷 + hook 执行 + exit code 0 + 无半写文件。

### P6 [MED] swarm mailbox 响应静默 drop

- **问题**：`permissionPoller.ts:111-143` 无回调注册即 drop 响应（无重试）；`/clear` 清注册表后在途响应全丢；worker 侧只能等 abort。
- **根因**：drop 无审计、无重试边界——"请求-结局"不变量未被维护。
- **期望表现形式（用户视角）**：drop 不是静默事件：审计面出现 "approval response dropped (no pending callback, request_id=…)"，asker 侧在有限重试后 fail-closed（与 P1 同 deadline）。
- **处置方式**：① drop 路径发审计事件（原则 5，`approval/decided: unavailable` 语义）+ debug 日志；② asker 侧**有界重试**（deadline 内 N 次重发，超 deadline 走 P1 的 unavailable deny）；③ `/clear` 对"在途请求"保留 pending 到 deadline（仅清 UI 队列，不杀 pending 判定）。
- **推导过程/参考来源**：原则 5（deepseek asked/decided 配对，[参照:packages/interaction/user-approval/src/index.ts events]）+ P1 的 deadline（原则 1 有界终态）。
- **验收**：注入"响应晚到 / clear 后到达"两场景 → 断言审计事件 + asker 终态 = unavailable deny（不挂死）。

### P7 [MED] `mcp serve` 是 no-op stub（静默错误结果）

- **问题**：`src/cli/handlers/mcp.ts:169-172` 打印"前向接缝登记"后返回——用户跑 `atlascode mcp serve` 期望长驻 MCP 服务，得到**静默 no-op**（最坏类错误：看起来成功、实际没起）。
- **根因**：前向接缝未配用户面信号。
- **期望表现形式（用户视角）**：命令**显式失败**（非零码 + "not yet available (forward seam, wave X)"），用户立刻知道没起，而不是等客户端连不上才排查。
- **处置方式**：no-op 打印改为 **显式错误/notice + 非零退出**（一行改动）；登记项挂到 release-tracker 待 mcp 波回填。
- **推导过程/参考来源**：原则 4（静默失败 = 最坏形态）；参照 A 的 `mcp serve` 为真实现（[参照:restored-src 有完整 mcp server]），AtlasCode 属裁剪残留守——裁剪可以，**静默不可以**。
- **验收**：`atlascode mcp serve` → 非零退出 + stderr 明示未实现 + 退出码断言。

### P8 [LOW] max_tokens 截断无续写（已知设计取舍）

- **问题**：`loop.ts:27-28` 登记残留守：截断末答当终结——长输出静默截断。参照 A 有 `max_tokens_escalate` + 续写路径。
- **根因**：窄 spine 期裁掉（"不误续"保守取舍）。
- **期望表现形式（用户视角）**：长输出被截断时，用户/模型看到 "输出因 token 上限截断" 的**显式标记**（而非把半截答案当完整答案）；是否自动续写作为后续选项。
- **处置方式**：最小步 = 截断时在 transcript 打显式标记（`<output_truncated max_tokens>`），防"半截当全量"被下游（压缩/记忆/验收）当完整内容消费；续写/升级路径（参照 A 行为）挂 mcp/工具波之后单独立项。
- **推导过程/参考来源**：原则 4（静默截断 = 用户不可见的信息损失）；参照 A（[参照:restored-src/src/query.ts:1204]）为对照而非强制对齐——本仓取舍已登记，处置 = **先补可见性，续写另立项**。
- **验收**：构造小 max_tokens 场景 → 断言截断标记出现在 tool_result/transcript。

### P9 [验证项] 键位模态隔离（历史 P0 面的防回归）

- **问题**：`'Confirmation'` 从未经 `useRegisterKeybindingContext` 注册为 active context（全仓仅 `'Autocomplete'` 一处）；弹窗对侧栏 1-5 键的胜出依赖 ChordInterceptor 的 handlerContexts 优先级 + 各 handler `isActive` 门（`REPL.tsx:4271` 等）。历史 P0（0.1.23 双 cede 修法）= **本仓 SidePanel 增量引入**（参照 A 无 SidePanel 组件，隔离靠单拦截器集中优先级，模态 context 自动胜出——[参照:restored-src/src/keybindings/KeybindingProviderSetup.tsx:200-260]）。
- **期望表现形式（用户视角）**：权限弹窗打开期间，侧栏数字键**永不**触发侧栏动作；弹窗键（1/2/3/Esc/Ctrl+C）行为确定。
- **处置方式**：① 静态不变量测试：`focusedInputDialog==='tool-permission'` 时断言侧栏 context 不在 handlerContexts/activeContexts 的解析栈（或解析优先级低于 Confirmation）；② PTY 探针：弹窗打开按 '1' 断言 = 选选项 1 而非侧栏动作（见 §6 V2）；③ 结构加固（可选）：侧栏 context 注册加模态门（`isActive = 无模态弹窗`，参照 A 的 ThemePicker 先例 `useRegisterKeybindingContext("ThemePicker")` 是 mount 期注册，本仓可加 modal-suppress 条件）。
- **推导过程/参考来源**：参照 A 的隔离原理（**单一全局拦截器 + 集中优先级 > 各组件竞速**，[参照:KeybindingProviderSetup.tsx ChordInterceptor 注释 "registers useInput FIRST … stops propagation before other handlers"]）；P9 = 把该原理的不变量固化为本仓测试。
- **验收**：§6 V2 探针全绿 + 不变量单测通过。

### P10 [LOW] 文档漂移：分类器 "feature gate 未开" 注释过时

- **问题**：`permissions.ts:697` 注释"auto 整条链当前惰性(feature gate 未开)"与 `feature.ts:19-27`（TRANSCRIPT_CLASSIFIER **默认开**，2026-09-19 裁定）矛盾；实际门 = `isAutoModeGateEnabled`（未熔断 + settings + 模型支持）。
- **根因**：feature 翻转后注释未随动。
- **处置方式**：订正注释（行为不动）；顺带在 `isAutoModeGateEnabled` 三条件处补单测锁。
- **推导过程/参考来源**：事实核对（feature.ts 注释 2026-09-19 翻转裁定 vs permissions.ts 旧注释）——纯文档一致性，防后来者误判 auto 链未启用。

### P11 [MED] plan×auto 状态机半落地（entry 侧裁、exit 侧仍消费）

- **问题**：`EnterPlanModeTool`（engine 本体 delta ④）裁掉 plan×auto 语义支（`shouldPlanUseAutoMode` / `setAutoModeActive` / `strip·restoreDangerousPermissions` → 登记 C 桶 ② auto 纵切波），但 **`ExitPlanModePermissionRequest` 弹框 exit 侧仍消费** `autoModeStateModule.setAutoModeActive(true)` + `stripDangerousPermissionsForAutoMode`（:339-342 auto-clear-context 支 / :383-404 resume-auto 支，TRANSCRIPT_CLASSIFIER 门）→ **半落地**：plan 入口不设 auto active，plan 出口却能恢复 auto → opt-in auto 用户 plan 内分类器不会自动激活（除非进 plan 前已 active），与参照 CC 行为相反（CC `permissionSetup:619-625` plan 迁移保留 auto 语义 + `:1233-1248` plan 退出 auto kick-out 通知）。
- **根因**：纵切波裁分不对称——engine 本体裁 auto 支归 C 桶 ②，TUI 弹框消费面未随裁（消费面在 TUI 波域，裁分账时未对齐）。
- **期望表现形式（用户视角）**：auto 用户进 plan = plan 内 classifier 活跃（auto 动作分类继续）；plan 退出 = 恢复 auto（参照 CC 语义）。当前半落地下：进 plan 后 auto 静默失活（用户无提示），弹框 resume-auto 支却可恢复 → 状态不自洽。
- **处置方式**（二选一，不新发明）：① 补 `prepareContextForPlanMode` 的 auto 语义支（恢复 C 桶 ② 的 `shouldPlanUseAutoMode`/`setAutoModeActive`/strip·restore 族，对齐参照 CC :619-641/:1233-1248）；② 若 0.x 序列不排 C 桶 ②，则把弹框 auto 消费支一并裁（登记残留守），不留"看似可用、实为 no-op"的半落地消费者（最坏类 stub：行为差静默）。
- **推导过程/参考来源**：参照 CC plan 迁移 auto 保留支（[参照:restored-src/src/utils/permissions/permissionSetup.ts:602-641,1233-1248]）+ 原则 4（静默失活 = 用户不可见状态漂移）；本仓 delta ④ 裁登记（enterPlanModeTool.ts 头注）为事实源。
- **验收**：opt-in auto 用户 EnterPlanMode 后断言 `isAutoModeActive()==true`（处置①）或弹框 auto 支不渲染（处置②）；plan 退出后 auto 恢复。

### P12 [LOW-MED] engine coordinator shell 监视 timer 未 unref（进程退出卫生，P1 同族）

- **问题**：`src/engine/coordinator/tasks/localShellTask.ts:111` monitor 支 `setInterval`（output stat 增长检测 + stall 尾读 + prompt 检测自动应答面）无 `unref`；对照 TUI 版本 `src/tui/tasks/LocalShellTask/LocalShellTask.tsx:99` **有** `timer.unref()` + 卸载清理 → 未显式 kill 的 monitor 任务在 engine lane 持续 stat 轮询，进程无法干净退出 + 轮询空转。
- **根因**：TUI/engine 双体迁移时 unref 卫生只在 TUI 版本落了，engine 版本漏（双体不同步，与 P1 的"继承特征未同步增强"同族）。
- **期望表现形式（用户视角）**：后台 shell 任务结束/kill 后，无残留轮询进程面；宿主进程可自然退出。
- **处置方式**：`localShellTask.ts:111` timer 加 `unref()`（一行）；kill/cancel 路径确认 `cancelled` 闩后 clearInterval（现清理函数面 :100 `(): void` 已存在，补 unref 即可）；归入 P1 的 timer 卫生批次统一核销。
- **推导过程/参考来源**：同仓 TUI 双体先例（LocalShellTask.tsx:99 unref 为正例）+ 原则 1（有界终态：轮询面不得成为进程退出的无界持有者）。
- **验收**：engine lane 起 monitor 任务后 `node -e` 宿主可退出（timer 无残留）+ kill 后轮询停。

### P13 [MED] SDK structuredIO 畸形 control_request → exitWithMessage 进程死亡

- **问题**：`src/cli/structuredIO.ts:552` SDK host 发来 `control_request` 但缺 `request` 字段 → `exitWithMessage(...)` = **协议错误直接进程退出**（无 session 冲刷、无结构化错误事件）；长驻 SDK/bridge 会话被 host 的一个畸形帧杀死。
- **根因**：SDK lane 的"协议错误 = 进程死亡"语义（旧仓逐字随迁残留守，同 P5 的 dispatch SIGINT 家族）——把"该帧拒绝"与"会话终止"混为一谈。
- **期望表现形式（用户视角/SDK 宿主视角）**：畸形帧 = 该帧被拒（stdout 一条结构化错误事件 `type:'error', code:'invalid_control_request'`）+ 连接继续或**干净关停**（session 冲刷 + hook），而不是进程蒸发。
- **处置方式**：`exitWithMessage` 支替换为：① 结构化错误事件（供宿主协议消费）② 若宿主协议无错误帧语义则走干净关停（复用 P5 的 `gracefulShutdown` 装配，而非 raw exit）；最小步 = 先加结构化错误事件 + session 冲刷，关停语义随 P5 批次。
- **推导过程/参考来源**：原则 5（每个请求有记录在案的结局——drop/畸形 都是 `decided` 类审计事件，参照 deepseek `approval/asked↔decided` 不变量推广到 SDK 帧层）+ 原则 6（退出配观测，参照 A `gracefulShutdown` log-only 存活 + 双写）；参照 CC SDK 面（structuredIO 同源逐字随迁）证实这是继承语义，处置 = 增强非回归修复。
- **验收**：SDK 宿主注一帧畸形 control_request → 断言 stdout 结构化错误事件在场 + 会话存活（或 exit 前 session 文件已冲刷）+ 非 0 退出码仅在显式关停时。

---

## §6 e2e 验收探针清单（交 e2e lane 的口径，继承前份报告）

| 探针 | 场景 | 断言 | 对应 |
|---|---|---|---|
| V1 | 权限弹窗打开，侧栏存在 | 按 '1'/'5' | 选选项而非侧栏动作（P0 回归口径） | P9 |
| V2 | No / Esc / Ctrl+C 三语义 | No 后回合继续（tool_use_error 可见）；Esc 后回合 abort 且进程存活；Ctrl+C = 取消非 No | §2 三语义 | §2 |
| V3 | teammate 问权时杀 leader | N 秒后 unavailable deny + 回合继续 + 进程可退出 | P1 | P1 |
| V4 | 制造 3 次连续 compact 失败 | TokenWarning 暂停态 + 413 反应式压缩 + 无级联 400 | P2 | P2 |
| V5 | hook bootstrap 未注入（注故障） | 工具调用降级报错 + 回合继续 + boot 断言 | P3 | P3 |
| V6 | bridge lane Ctrl+C | session 冲刷 + hook + exit 0 | P5 | P5 |
| V7 | 413/prompt-too-long（headless） | 反应式压缩触发（若 P2-① 已落）或显式错误行 | P2 | P2 |
| V8 | plan 三路径：① EnterPlanMode→ExitPlanMode keep-context 批准 ② clear-context 选项 ③ 'no'+feedback | ① 恢复 prePlanMode + 同上下文继续实施 ② 上下文清 + initialMessage 注入 plan（"Implement the following plan"）+ 新 query 不丢 plan ③ 软拒留 plan 态可重规划 | §8 plan 状态机 | §8 |
| V9 | plan 态（非 bypass 起步）调 Write/Bash | 走正常 ask 弹窗/规则（**plan 不特判拦截**——plan 非只读沙箱，权限层无 plan 专属 deny 支） | §8.1 期望行为基线 | §8 |
| V10 | SDK 宿主注一帧畸形 control_request（缺 request 字段） | 结构化错误事件在场 + 会话存活或干净关停（P13 处置后：非 raw exit） | P13 | P13 |

---

## §7 附录：本次 trace 的证据边界

- **[已核]（本人回源）**：No 路径 5 环、engine 决策体 A 全分支序、`buildReject` 形（PermissionContext.ts:197-202）、iron-gate 默认 true（permissions.ts:697-721）、弹窗选项面 + session 域持久化（FallbackPermissionRequest.tsx）、mailbox 挂死结构（inProcessRunner.ts:583-703）、断路器（autoCompact.ts:57,532-535,554）、无 TPC=allow（permissions.ts:267-276）、dispatch SIGINT（dispatch.ts:82-92）、reactive compact 无 loop 消费者（highGapPorts/compact.ts）、TokenWarning 已继承、TRANSCRIPT_CLASSIFIER 默认开（feature.ts:19-27）。
- **[agent]（深读 agent 报告，高危项已抽验）**：process.exit 普查 16 项、子循环终止表、gracefulShutdown 信号面、crashBackstop 盲区（TUI boot 窗口）、MCP stub / control_request 残留守 / `checkRuleBasedPermissions` 孤儿死码 / engine updatedInput 休眠 等 MEDIUM/LOW 项。
- **未覆盖（诚实边界）**：swarm tmux（非 in-process）teammate 路径；computerUse 审批面（ComputerUseApproval.tsx 未深读）；hook 生态全量（PreToolUse 各 hook 实现体未逐一审计，P3 只覆盖调用缝）；React-compiler 编译产物的 sourcemap 与源偏差（FallbackPermissionRequest 旧 sourcemap 残留 localSettings，运行体为 session，已按运行体判定）；MCP checkInterval（mcp/client.ts:1367）unref 状态未核（登记 LOW，P1/P12 timer 卫生同族）；subagent MCP 工具 fetch 失败面（runAgent connectToServer 支）未深读。
- **[已核] 补遗（2026-10-06 全 loop 普查，§8/§9）**：plan 状态机全路径（EnterPlanMode 双体 + ExitPlanModeV2 validateInput ec1/checkPermissions ask/call prePlanMode 恢复链 + ExitPlanModePermissionRequest 8 选项面含双拒 clear-context 支）；功能 loop 矩阵 L1–L19（subagent while(!step.done)+maxTurns 终态 / MCP 错误计数重连+reject-pending / cron unref / drainRunLoop 引计数 / preventSleep unref / withRetry 10 次+persistent 三闸 / modelprovider 有界+#260 fail-fast / structuredIO exitWithMessage / localShellTask 双体 unref 差异）；**P3 口径订正：tool.call 本体有守卫（toolExecution.ts:366-382 catch → 结构化 `<tool_use_error>` is_error，EnterPlanMode agent-context throw 亦被此 catch 接住 = 软错误非硬停），P3 四无守卫缝 = validateInput/pre-hook/gate/post-hook（不含 call 本体）**。

---

## §8 plan loop（plan 模式状态机）专项 trace（补遗 2026-10-06）

> 前份 §1–§5 聚焦主 agent loop + 权限桥；plan loop 未单独建档案。本章补：**plan 不是独立 loop，是权限模式状态机 + 两工具门（Enter/Exit）**，状态机全路径 + 终止/失败面 + 参照比较。

### 8.1 状态机全路径（已核）

```
default/auto/… ──EnterPlanMode 工具──▶ plan（prePlanMode 暂存，session 域；
  engine 体 + TUI 体双注册〔engine/tools/plan + tui/tools/EnterPlanModeTool〕，
  call 体 = agentId 守卫 throw + prepareContextForPlanMode + setMode 'plan'）

plan ──ExitPlanMode V2──▶ 三层门：
  ① validateInput：mode!=='plan' → {result:false, errorCode:1} 结构化拒（不进弹窗）
  ② checkPermissions：'ask' "Exit plan mode?"（teammate allow 支已裁，C 桶 ③）
  ③ 弹窗 ExitPlanModePermissionRequest（8 选项）：
     ├─ keep-context 组（yes-accept-edits-keep-context / yes-default-keep-context / yes-resume-auto-mode）
     │    → onAllow → ExitPlanMode call 恢复 prePlanMode ?? 'default'（clear prePlanMode）
     │    → tool_result "Approved Plan( edited)" → 同上下文继续实施
     ├─ clear-context 组（yes-bypass-permissions / yes-accept-edits / yes-auto-clear-context）
     │    → **有意双拒**（onReject + toolUseConfirm.onReject = "Reject the tool use to unblock
     │       the query loop"）+ initialMessage{content: "Implement the following plan: …"
     │       + planContent + transcriptHint + teamHint + feedbackSuffix, clearContext:true, mode}
     │    → REPL processInitialMessage：清上下文 + 新 query（session ID 再生）
     │    → **plan 不丢**（经 initialMessage 注入新上下文；transcriptHint 指全量转写盘路）
     ├─ ultraplan → 本地拒 + 计划经 CCR teleport 精化（onReject "refining via Ultraplan"）
     └─ no（+feedback 可注记，如 "also update the README" 免 reject+re-plan 往返）
          → **软拒**（tool error，留 plan 态，模型可重规划；与 §2 主 No 判定一致，无硬停止）
```

- **plan 内决策行为**（engine 2a / TUI 2a 同构）：`plan && isBypassPermissionsModeAvailable`（bypass 起步）→ allow；`plan && autoModeState active` → 分类器支（TUI :508）；否则正常流。**权限层无 plan 专属只读 deny 支**——参照 CC 同型（plan 约束 = prompt 层引导 + ExitPlanMode 硬门，非权限层只读沙箱）→ **期望行为基线：plan 态写工具（Write/Bash）走正常 ask 弹窗/规则，不被 plan 本身拦截**（用户面认知项，非缺陷；V9 锁此基线防未来误加）。
- **plan 无超时**：模型不调 ExitPlanMode 可无限留 plan（prompt 层引导，机制层无时限；参照 CC 同型）→ 用户出口 = 手动切模式（Shift+Tab 循环含 plan）/ Ctrl+C abort（A2 语义）。
- **EnterPlanMode agent-context 守卫**：`ctx.agentId → throw`，被 toolExecution :366 try 接住 → 结构化 `tool_use_error`，回合继续（子代理面不可进 plan，软错误非硬停）。
- **plan 盘面**：getPlan/getPlanFilePath 落盘 + Ctrl+G 外编（`planWasEdited` → "Approved Plan (edited by user)" 标记）+ CCR 编辑 inputPlan 盘同步（logError 吞写失败，不杀回合）。

### 8.2 半落地缺口与登记支（P11 + 登记项）

| 项 | 状态 |
|---|---|
| plan×auto 语义（shouldPlanUseAutoMode / setAutoModeActive / strip·restoreDangerousPermissions / 退出 kick-out 通知） | **engine entry 侧裁**（EnterPlanModeTool delta ④ → C 桶 ②）但 **exit 侧弹框仍消费**（:339-342 / :383-404，TRANSCRIPT_CLASSIFIER 门）→ 半落地消费者 → **P11** |
| teammate leader plan 审批（awaitingLeaderApproval / requestId / hasTaskTool 输出 3 字段） | 裁（C 桶 ③），运行时恒 undefined → teammate ExitPlanMode = 直批（无 leader 门；登记，swarm 波回填） |
| CCR remote 快照同步（persistFileSnapshotIfRemote） | 裁（remote 波），盘同步主体保留 |
| 4 个 plan bootstrap 状态旗标（setHasExitedPlanMode 族） | 旧仓即 any-stub no-op，H6 零行为差裁 |
| 后台验证 hook（registerPlanVerificationHook，REPL 清上下文后注册；ATLAS_VERIFY_PLAN verificationInstruction 死代码消除支） | TUI 波残留守（登记，plan 验证面未落） |

---

## §9 全功能 loop 矩阵（补遗 2026-10-06，全仓普查）

> 每 loop：本体 / 终止条件 / 有界性 / 失败面 / 判定。判定：✅ 健康 / ⚠ 有界残留（登记） / ✗ 缺陷（→ §5 P 项）。**主 loop（L1/L2/L7/L8）见 §5 P2，swarm mailbox（L6）见 P1；本章补其余 15 条**。

| # | loop | 本体 | 终止条件 | 有界性 | 失败面 | 判定 |
|---|---|---|---|---|---|---|
| L1 | 主 agent loop | engine/query/loop.ts queryAgentLoop | 0-tool_use 回合终止；abort | 回合级无界（消息无界，unboundedTurns） | 非可重试 400 级联（P2） | ✗ →P2 |
| L2 | REPL lane | replLoopDeps unboundedTurns | 用户退出 | 无界 | 同上 | ✗ →P2 |
| L3 | headless/SDK lane | structuredIO `for await (input)` 长驻 control 流 | host 关流 | 长驻（内存有界：entry 驱逐 :238） | **畸形 control_request → exitWithMessage 进程死亡**（:552） | ✗ →P13 |
| L4 | subagent（AgentTool） | runAgent `while(!step.done)` 于 queryEngineLoopStream（同 engine loop 体） | `maxTurns ?? agentDefinition.maxTurns` + `max_turns_reached` 终态信号 + AbortError | **有界** | MCP 子代理工具 fetch 失败面未深读（登记）；system-prompt 构建 catch → DEFAULT_AGENT_PROMPT 回落（非缺陷） | ✅ |
| L5 | coordinator 任务 | localAgentTask（MAX_RECENT_ACTIVITIES 有界活动窗）/ localShellTask monitor（stat 增长 + stall 尾读 + prompt 检测自动应答面） | 任务结束 / kill / cancelled 闩 | 活动窗有界 | **engine 版 shell monitor timer 未 unref**（:111；TUI 版 unref） | ⚠ →P12 |
| L6 | swarm mailbox 权限 | inProcessRunner 500ms setInterval poll | allow/reject/abort 3 终态 | **无界**（无超时、无第 4 终态） | 挂死 + 进程不可退 + pendingCallbacks 泄漏 | ✗ →P1 |
| L7 | auto-compact pre-turn | autoCompact 断路器 | 3 连败 → 永久短路（仅成功复位） | 无界（断路器锁 + REPL 无界） | 长会话渐进失能 | ✗ →P2 |
| L8 | reactive compact | contextBodies/reactiveCompact（TUI 端口已接线） | 413 拦截（**TUI only**；engine loop 无消费者，唯一消费方 = 手动 /compact compact.ts:173） | — | headless lane 413 = 回合死 | ✗ →P2-③ |
| L9 | provider 重试 | withRetry.ts | 10 次（DEFAULT_MAX_RETRIES；529 仅前景源集——背景源 bail = 容量级联防护设计）；**persistent 模式（UNATTENDED_RETRY，feature+env 双门）= 429/529 设计内无限重试**（30s 心跳分片 sleep 防宿主 idle 标记 + 5min backoff 帽 + 6hr reset 帽） | 设计内无界 = 三闸（feature 门 + abort signal + 6hr 帽） | **400 context overflow → parseMaxTokensContextOverflowError → maxTokensOverride 自修重试（非 400 杀）**（与 P2 方向相反的健康面） | ✅（设计内无界，与 P2 缺陷无界相区别） |
| L10 | model provider 重试 | modelprovider `for attempt < maxRetriesPerModel` | 重试上限 + #260 超时 fail-fast（aborted 不重试） | 有界 | LLM 等待心跳（log 面，非缺陷） | ✅ |
| L11 | MCP client 连接 | mcp/client.ts | 连续错误 3 计数（MAX_ERRORS_BEFORE_RECONNECT）→ close + 清 memo 缓存 + 下次操作重连；SSE "Maximum reconnection attempts"（SDK 内 maxRetries:2）→ closeTransportAndRejectPending（**pending 请求被拒 = 有界终态**）；404 session-not-found → 重置 session 重连 | 错误计数 + reject-pending | checkInterval（:1367）unref 未核（登记 LOW，P1/P12 同族） | ⚠ |
| L12 | cron 调度 | tui/engine 双 cronScheduler | stop → clearInterval + **unref**（:403/:427） | 有界 | 无 | ✅ |
| L13 | computerUse CFRunLoop pump | drainRunLoop 1ms setInterval（引计数 retain/release 共享单泵） | release（pending=0）停泵 | **由 Swift call 决议有界** | Swift promise 挂死 → pending 永 >0 → 1ms 泵永续（macOS opt-in 面；Swift call 无独立超时，登记 LOW） | ⚠（LOW） |
| L14 | TUI 渲染（Ink） | ink.tsx | React 状态驱动（**无轮询泵**） | n/a | 无 | ✅ |
| L15 | preventSleep（caffeinate） | restartInterval 周期重启 caffeinate | refcount 0 → stop | **unref + 已清** | 无 | ✅ |
| L16 | sessionIngress 分页 | `while pages<maxPages` | maxPages | 有界 | 无 | ✅ |
| L17 | voice 集成 | useVoiceIntegration | 键事件驱动（无轮询；auto-repeat 120ms 抖动窗） | n/a | 无 | ✅ |
| L18 | LSP/MCP JSON-RPC stdio | mcpJsonRpc / lspJsonRpc 管道 | 连接关（进程/管道生命周期） | 由连接生命周期有界 | 管道僵尸 = 连接泄漏（登记 LOW，随 P1 timer 卫生批） | ⚠（LOW） |
| L19 | TUI 任务监视 | LocalShellTask.tsx / LocalAgentTask tail | 任务结束 | **unref + 卸载清**（:99/:102） | 无 | ✅ |

**矩阵结论**：19 条 loop 中 10 条健康（✅）、3 条有界残留（⚠，timer/管道卫生同族，P1/P12 批次可并）、4 条缺陷面（✗，全部已挂 §5 P1/P2/P13 既有处置）、2 条属主 loop 既有档案。**无新增硬停止面**：所有 loop 的"无应答"面要么有界终态（L11 reject-pending / L4 max_turns_reached / L9 abort），要么已入 P1/P13 处置（L3/L6）；L9 的"设计内无限"（persistent 重试）经三闸核销为健康，与 L1/L7 的"缺陷性无界"严格区分（前者 = 有帽有闸可 abort，后者 = 无恢复层无用户面）。

---

## §10 裁定记录（2026-10-07，用户拍板，f4 落盘）

### R1（P11 方向）= ① 补 plan×auto 支（对齐参照 CC）

`prepareContextForPlanMode` 补 auto 语义支（`shouldPlanUseAutoMode` / `setAutoModeActive` / `strip·restoreDangerousPermissions`）+ plan 退出 kick-out 通知——**逐行对照 CC `permissionSetup.ts:602-641`（plan 迁移保留 auto 语义）+ `:1233-1248`（plan 退出 auto kick-out + 通知）**。C 桶 ② 的 plan×auto 子集提前入 0.1.36 波（auto 完整纵切仍在 C 桶 ②，本波只取状态机自洽所需子集）；弹框 exit 侧消费支（ExitPlanModePermissionRequest.tsx:339-342 / :383-404）**保留不动**（补支后消费方与入口对齐，半落地消除）。

### R2（第二类"无参考"项）= 保留，但**处置实施前先补参照调研**（调研后重裁定，调研完成前不排版本）

| 项 | 调研对象 | 调研产出 |
|---|---|---|
| P6-c `/clear` 在途 pending 语义 | CC 全量源码（restored-src）/clear 与 pending approval 交互 | 行为对照表（参照行为/本仓现状/delta） |
| P13 SDK 错误帧语义 | CC SDK control 协议错误帧 + host 侧可消费性确认 | 协议对照表 + 宿主兼容结论 |
| P6-b 有界重试策略 | deepseek-harness retry/backoff 面（若有）+ CC 重试策略 | 重试曲线/退避有出处版本 |
| P7 no-op 显式失败 | CC mcp 子命令错误面 + 通用 CLI 惯例 | 错误码/文案/退出码基线 |
| P8 截断标记 | CC `max_tokens_escalate`（query.ts:1204）标记/续写边界 | 标记形态有出处版本 |
| P3 缝粒度/code 表 | deepseek-harness guard 包 code 体系 | code 命名对照表 |
| P2-④ 软复位 | —（**不调研**：R3 裁定砍，登记待 soak 数据） | — |

每项调研产出 = 对照表（参照行为 / 本仓现状 / delta），**调研通过后**方进 0.1.37 版本规划。

### R3（P2 风险评估重出 + 重新决策）

| 子项 | 改动面 | 回归风险 | 决策 |
|---|---|---|---|
| ① 反应式压缩 wire 进 engine loop 413 路径 | 热路径（TUI/headless/SDK 共用 loop 错误路径） | **MEDIUM**：加性（新增 413 消费点，不动既有错误语义）+ 一次性/回合（防反应式死循环，仍 413 → 结构化错误行 + 用户面状态）+ feature 门 env 可杀（若本仓无 REACTIVE_COMPACT flag 则新增入 feature.ts ON_BY_DEFAULT，同 TRANSCRIPT_CLASSIFIER 族）+ 既有 413 语义单测锁 | **做**（0.1.36 切片③，V4/V7） |
| ② 无模型剪枝层 | 新子系统（replay-safety / KV-cache 不变量 / 分类器消费 messages） | **HIGH**（剪枝错误 = 静默上下文损坏；验证成本 = replay 等价 + soak） | **缓**：spec + 参照调研先行，0.1.37 候选，不进今晚波 |
| ③ 断路器跳闸用户面状态（TokenWarning 暂停态 + 模型侧告知） | TUI 渲染 + prompt 注入（纯加性） | **LOW** | **做**（随①同切片） |
| ④ 软复位（距上次成功 ≥M 回合） | 改动断路器共识语义（**A 仅成功复位 / B 无时间复位，两参照均无此设计**）+ M 取值任意 | MEDIUM-HIGH | **砍（登记）**：①③ 落地 + ② 研究后已有恢复路径与用户出口，软复位冗余；待 soak 数据再议 |

**P2 终判**：严重度维持 HIGH（长会话渐进失能）；波内范围收敛为 ①+③（加性、有门、V4/V7 可验）后实施风险降为 MEDIUM；真正 HIGH 的 ② 剥离 spec 先行。

### R4（波次与闭环）

- **0.1.36 = 权限/harness 硬化波**（排 0.1.35 Brand 封口波之后，非 Brand scope，不入 0.1.35——版本=收口契约规则①）。
- **切片序**：① P1 mailbox 硬化（deadline + unref + pendingCallbacks 清理 + P6-a drop 审计）【**今晚必达**】② P11-① plan×auto 支 ③ P2-①③ ④ 廉价同族批（P4 TPC 缺失 warn + headless fail-closed / P5 bridge SIGINT 优雅停 / P9 不变量测试 / P12 unref）⑤ 调研后 0.1.37 候选（R2 清单 + P2-② spec）。
- **今晚必达 = 切片① 5 段闭环**（实施 → e2e 前 gate → 发布 tag+npm → 生产 lane → 闭环）。**若 0.1.35 未闭环**：0.1.36 发布/生产 lane 按列车序顺延，但切片① code-complete + gate PASS 仍为今晚必达。
- **封口版规则**：波内最后一个发布版本必须全闭环（e2e gate + 生产 lane 全绿、无未闭环项）方可发布（release-governance 规则② fail-closed；未闭环项顺延下一版 = 规则③）。
- **e2e 原有定位**：只做测试侧（gate/生产 lane/回归/报告/verdict）；版本/发布/master 操作一律归 Main。

**同步机制**：工单 `docs/2026-10-07-0136-permission-harness-wave-order.md`（housekeeping 入 master = 单信号知会 Main，Main ACK 接手）。
