# 0.1.104 lock-face（Main 段 D）——watchdog 缺省纠偏 + per-tool timeoutMs

> 工单：`docs/2026-11-13-p0-wave-01104-watchdog-default-off-ticket.md`（§7 审计 e76aaabe）。
> 码面基：master 9b79a635 之后（S3a 收口 4c27a8e6 + f4 工单 2 commit）。探锚全实锚，行号 @ 探锚时树。

## 必答 1 — env 三态终形（切片 1）

`src/engine/query/loopWatchdog.ts:37` `resolveLoopWatchdogTimeoutMs` 终形（现形见 §0.1 工单：fail-open 到 120000）：

| env `ATLAS_LOOP_WATCHDOG_MS` | 现 0.1.103 | **0.1.104 终形** |
|---|---|---|
| 未设 / 空串 | 120000（开） | **0（关）** |
| 非数字 / NaN / Infinity | 120000（开） | **0（关，fail-safe 同向）** |
| 负值 | 120000（开） | **0（关；负值归非法，禁「负值=无限期」新语义）** |
| 显式 `0` | 0（关） | 0（显式关，语义不变） |
| 显式正整数 | 该值 | 该值（opt-in 生效，不变） |

实现形：`raw === undefined || raw.trim() === ''` → 0；`Number(raw)` 非 finite 或 `<= 0` → 0；否则返回值。零窗实例走既有 `schedule()` 短路（loopWatchdog.ts:199 `timeoutMs <= 0`），`createLoopWatchdogFromEnv`（:242）与 loop.ts:827 接线零改动——缺省关 = 零窗实例恒不排 timer，格 1 的 spy 断言锚 = `new LoopWatchdog(0)` 任何 noteEvent 后 timer 恒 undefined + `resolveLoopWatchdogTimeoutMs({})` === 0（毫秒级结构格，无 120s 真时长，审计吸收 4）。

配套：`DEFAULT_LOOP_WATCHDOG_MS`（:32）删除（生产零消费；唯一引用 = `tests/unit/p0-loop-watchdog.test.ts` 旧缺省断言族——该套件格 1 三态表重写时随行删除，`120_000` 值留在三态表注释作历史锚）。`LoopWatchdogTimeoutError` 文案（:49-51）改 opt-in 提示语：「本看门狗缺省已关闭——当前为显式开启（`ATLAS_LOOP_WATCHDOG_MS=…`）；如误开启请移除该 env」。CHANGELOG 行为句按审计吸收 1 三态并一句：「0.1.102–0.1.103 缺省 120s 开启（未设/空/非法值均回缺省）→ 0.1.104 起缺省关闭（未设/空/非法/负值均不开启），显式正值 = opt-in」。

## 必答 2 — timeoutMs wrapper 三钉落点（切片 2）

**契约挂点**：`src/shared/types.ts:178` `interface Tool` 增可选字段 `readonly timeoutMs?: number`（与 `isMcp?`/`alwaysLoad?` 同级的 wrapper 层声明位；optional = 既有工具实现零改动）。

**钉 (a) arm 时点 = 权限门后实际执行开始**：挂点 = `src/engine/pipeline/toolExecution.ts` executeToolUse 的调用组合体（:601 `callTool` ↔ :602-613 `withHeartbeat` ↔ :615-646 mcpAutoBackground 组合）外再包 `runWithToolTimeout`。门链早退支全部在 arm 之前：浅校验（:479）/validateInput（:481）/pre-hook blockingError（:501 附近）/gateVerdict（:537）/deferred（:550）/!allowed（:556）——**预执行权限等待零预算**（结构性保证，无需计时暂停）。

**钉 (b) 交互等待同源单源**：探锚定谳——本仓 executeToolUse 链中 ask/defer 均**早退支**（defer :550 返回 deferredOutcome；ask :556 返回 is_error 块），即交互等待全部发生在 **arm 之前**，不存在「执行中」交互挂起点 → 不需要 deadline 暂停/重置机制；同源单源 = 结构性成立（defer/ask 判定与 watchdog 豁免 (b) 同在 mergeHookPermission 单源，toolExecution 无第二判定实现）。唯一执行中长等待 = AgentTool 子代理（权限等待发生在子 loop、父工具在途）→ **首批不给 AgentTool 声明**（钉在清单侧，不在机制侧）。

**钉 (c) AbortSignal 走既有工具 abort 通道**：wrapper 内自建 `AbortController`，`AbortSignal.any([deps.signal, timeoutController.signal])` 合成后经既有 `toolCallContext.signal` 槽透传（toolExecution.ts:455-459——`{...deps.toolContext, signal, checkPermission}`，T-4c 契约不变）；`AbortSignal.any` 仓内既有先例 = webFetchUtils.ts:414。工具按既有 abort 消费面收敛（bashTool interrupted 支 / abortError.ts / webFetch AbortSignal.any），**零新终止路径**。到期 = wrapper `timeoutController.abort(TOOL_TIMEOUT_ABORT_REASON)`。

## 必答 3 — 首批声明清单（逐项依据列，禁拍头）

| 工具 | timeoutMs | 依据（工具内既有实参） |
|---|---|---|
| WebFetchTool | **90_000** | webFetchUtils.ts:218 `FETCH_TIMEOUT_MS = 60_000`（per-fetch 内部已 AbortSignal.timeout）；wrapper = 60s + redirect 链上限余量（:221 注释 redirect-loop 界）作内部 timer 失效兜底 + 总执行界 |
| WebSearchTool | **30_000** | webSearchProvider.ts:49 `SEARCH_TIMEOUT_MS = 15_000`（per-request）；wrapper = 15s × 2 余量 |
| BashTool | **不声明** | bashTimeouts.ts:14-15 自带预算（DEFAULT 120s / MAX 600s）+ `input.timeout_ms` 声明面 + 内部 kill（bashTool.ts:299）——预算已在工具内，wrapper 再包 = 双超时嵌套（格 5 面），保持单源 |
| MCP 工具族 | **不声明** | isMcp 已有 mcpAutoBackground 转后台面（toolExecution.ts:590-591，结构性兜底），不叠加预算 |
| AgentTool | **不声明** | 子代理合法长跑（钉 (b) 结论）；子 loop 自身豁免面已覆盖 |
| 其余全部工具 | **不声明** | 无既有 timeout 实参数据（无据数值不拍头）——无声明 = 无限期，canon 零行为变更面保最大 |

首批 = 2 件（WebFetch 90s / WebSearch 30s），全部有工具内既有实参依据。登记池挂起面（工单 §5.3 诚实登记）：缺省关后未声明工具真挂起 = 恒挂回旧形态，缓解 = 首批覆盖 + 用户 opt-in watchdog + 该残余面留登记池。

## 必答 4 — TOOL_TIMEOUT 消息终形

isError tool_result 直接构造（**不经工具 mapToolResult**——wrapper 层替换），形与既有门错误支同惯例（toolExecution.ts:560-561 `<tool_use_error>permission denied: …`）：

```
content = `<tool_use_error>TOOL_TIMEOUT: ${tool.name} exceeded its ${timeoutMs}ms execution budget and was aborted. The tool's own cleanup (subprocess kill / connection close) runs via its abort path. You may retry with adjusted parameters (e.g. a shorter command or explicit timeout_ms for Bash) or a different approach.</tool_use_error>`
is_error: true
```

结构化路由标记 = content 前缀 `TOOL_TIMEOUT:`（模型可路由；DSH error.code 落点——ToolResultBlockParam 无独立 error.code 字段，`errorCode` 只存在于 validateInput 的 ValidationResult 面，wrapper 不经该面，故机器可读标记落 content 前缀）。

**嵌套消歧（格 5）**：wrapper 自身 controller 的 abort reason 打标（`TOOL_TIMEOUT_ABORT_REASON` 哨兵）；catch 支单点判定——`signal.reason === TOOL_TIMEOUT_ABORT_REASON` 才替换为 TOOL_TIMEOUT 块；外层（deps.signal / loop watchdog / 用户 Escape）先 abort 时 reason 为外层值 → 走既有 catch 支原样透传（不误记内层超时）。`isFired` 不二 firing 同理由 controller 一次性语义保证（aborted 后 abort() 幂等）。

**到期零孤儿**：abort 经既有通道到达工具；wrapper finally 面不清子进程（工具自身 abort 消费面负责——bashTool 已有 kill；webFetch AbortSignal.timeout 已有连接收敛）。

## 必答 5 — timeoutMs 不出 LLM schema：钉死确认

- `timeoutMs` 加在 shared Tool 接口（wrapper 层契约），**绝不进** `inputSchema` / `inputJSONSchema` / `description()` → tools 数组 wire 面零 diff（对全量工具含首批 2 件）。
- 格 10（审计吸收 5）判据：无声明工具 wire 字节零 diff + token manifest diffs=0；首批 2 件 schema 面亦零 diff（新增的是接口字段非 schema 字段）。
- 如未来欲入工具描述（token 面），另立 token 新锚登记——本波不做。

## 判据格落格映射（§4 六格 + 审计补 4 格 → tests/）

- 格 1 缺省关：`loop-watchdog-env.test.ts` 扩（三态表 + `LoopWatchdog(0)` 零 timer spy）+ 格 6 standing 化。
- 格 2 opt-in + 四豁免回归：既有 watchdog 套件 env 注入腿（现网已设值用户面零破坏——显式正值路径不变）。
- 格 3 timeoutMs 到期：新 `tool-timeout-wrapper.test.ts`（声明 5s 工具 + 10s 实执行假钟 → TOOL_TIMEOUT isError 块 + 回合继续）。
- 格 4 无声明永限：同套件（未声明工具 > deadline 长执行零干预）。
- 格 5 嵌套消歧：外层 abort reason 透传支 + 内层哨兵支判别。
- 补格：到期零孤儿（abort reason 到达工具消费面断言）；不二 firing（二次 abort 幂等）；格 10 无声明零 wire 差（tools schema 快照 diff）。
- canon 前滚：无声明工具链零行为变更 = 套件本体。

## 钉 ⑥（f4 批复新增，2026-11-13）——C5-3 后台面 disarm

工具转后台（toolExecution.ts:615-646 `callWithMcpAutoBackground` race，`raced.backgrounded === true` 分支）即 **disarm deadline**：后台 = 用户显式接管，脱离预算面，禁后台工具被到期 abort 杀死。实现形 = `runWithToolTimeout` 返回带 `disarm()` 的句柄，backgrounded 早返支（:635 前）先 disarm 再返；后台化后 race continuation 内的心跳包裹体不受 deadline 影响。落格：并入格 3 边界断言（转后台工具零 TOOL_TIMEOUT 块）。

## 段 I 落码序（预注册）

1. 切片 1：loopWatchdog.ts 解析翻转 + DEFAULT 常量删 + 错误文案 + 单测三态表。
2. 切片 2a：shared/types.ts Tool.timeoutMs 接口字段 + toolExecution.ts wrapper（`runWithToolTimeout` 新模块 engine/pipeline/toolTimeout.ts：arm/catch 替换/哨兵 reason/组合 signal）。
3. 切片 2b：WebFetch/WebSearch 声明 + 判据格套件。
4. CHANGELOG（三态并一句）→ 四件套 → 段 G。

—— Main 段 D 2026-11-13，呈 f4 批复后进段 I。
