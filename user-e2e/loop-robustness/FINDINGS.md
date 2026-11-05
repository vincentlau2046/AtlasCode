# loop 鲁棒性/稳定性 — 首轮发现（2026-10-03）

> 方法：`harness.ts`（R1 单点故障注入 + R3 断点续跑）+ `fault-proxy.ts`（网关前注障，真实产品路径）。
> 模型对齐 iff/deepseek-v4-pro。全部 I/O 落 `user-e2e/loop-robustness/`。
> 本轮 6 R1 场景 + R3 已跑（run `all-1791014925475-08tq`）。

## 有效结论（模型无关，可直接采信）

### ✅ 正面：LLM 请求层故障下 loop 不崩、不挂（I1/I3）
- **I1 不崩**：6 个故障场景（5xx 短暂 / 断连 / 空 0-0 / 慢 / 5xx 风暴）**全部** exit 非崩溃、stderr 无 uncaught/unhandled 崩栈。
- **I3 不挂**：全部在 wall-clock 内结束，无「某轮永不返回」。
- **5xx 风暴**（超 provider 3 次重试预算）→ **优雅快速失败**（exit 1、`is_error=true`、236ms），**非静默、非崩溃、非挂起**。

### 缺口 #2（CONFIRMED，代码铁证，建议提交 main，P1）
- **headless/CLI 车道缺全局崩溃兜底，与 TUI 不对称。**
- 证据链：`setupGracefulShutdown()`（注册 `process.on('uncaughtException')` `src/tui/utils/gracefulShutdown.ts:290` + `process.on('unhandledRejection')` :298）**仅在 TUI 入口** `src/tui/entrypoints/init.ts:79` 调用。
  headless `-p` 入口链 `atlascode/cli.ts`（:56 `-p` 走 cli 公共域）→ `cli/dispatch.ts` → `cli/entryInit.ts`（**未调用** setupGracefulShutdown）→ `cli/print.ts`。
- 影响：headless/CI/自动化长跑里，任何 uncaught exception / unhandled rejection 走 Node 默认行为 = **进程直接崩**（TUI 车道会 log + 存活）。「coding agent 长时间不中断」在 headless 车道无兜底。
- 状态：**代码确认**（路径铁证）；live 复现（构造 headless uncaught 崩）待补。建议 main 把 setupGracefulShutdown 装到 headless 入口（或抽到公共 entry 层）。

### 缺口 #1（真但当前是「优雅中断」非崩溃，建议提交 main，P1/P2）
- **loop 无回合级错误恢复（残留守 E-1b-full）**：`queryOneRound:270` / `queryAgentLoop` 对 `modelProvider.chat()` **无 try/catch**。
- 现象（R1-500-storm 实测）：LLM 故障超 3 次重试预算 → `chat()` 抛错穿透 loop → 整个任务被中断（headless exit 1 / REPL 回 prompt），**非「该回合失败→有界重试/续跑」**。当前行为是**优雅失败**（不崩），但**无韧性**（任务丢了，得用户重发）。
- 影响面：网关 5xx 抖动/风暴期间，长 coding 任务会被「回合级丢弃」，正好击穿「长时间不中断完成任务」。
- 建议 main：loop 加回合级有界错误恢复（该轮 LLM 失败 → 有限重试/跳过/降级续跑，而非整任务中断）。

## 环境阻塞（非 loop 产品 bug，需用户知悉）

### ⚠ 重大纠偏（2026-10-03 晚）：早前「模型 flaky」判定是误判，真因是 harness 漏了权限门 flag

**结论反转**：早前判定「deepseek-v4-pro 对多步 coding 任务不可靠（0 文件落盘 / 幻觉成功 / error_during_execution）」是**错的**。真因是 headless harness 的 spawn **漏传 `--dangerously-skip-permissions`**（`parse.ts:510` 该 flag 是 headless 也支持的 bypass 权限门），导致 Write/Bash 工具全被权限门拦、0 文件落盘。我把权限门拦截误读成模型幻觉。

**证据链**：
1. `stability-probe.ts` 连跑 2 次（无 flag）全 FAIL：probe#1 0-tool 错误、probe#2 19 次 tool_use（7 Write + 7 Bash + 5 Config）却 0 文件，result 自述「every file-writing ... blocked by a permission gate」。
2. 加 `--dangerously-skip-permissions` 后连跑 2 次 **全 PASS**（ALL TESTS PASSED 实跑，7/13 tools）。
3. turnrecover post-fix gate 早前「任务完成」也是假象（无 flag，0 落盘，log 里的 "ALL TESTS PASSED" 是模型自述非 node 实跑）；重跑（加 flag）后 **4 文件真落盘 + node 实跑 ALL TESTS PASSED**。

**受影响面**：`harness.ts` / `verify-fixes.ts` / `stability-probe.ts` 三个文件的 headless spawn 均漏 flag，已全部补 `--dangerously-skip-permissions`。**产品代码零问题**——是测试 harness 侧 bug（与早前 cleanEnv.HOME 同族）。

**恢复的结论**：deepseek-v4-pro 当前**稳定**（2/2 完成任务）。task #42 的前提「等模型稳定」已达成，可开跑（R1 对照 + R3 续跑 + R2 soak）。

## R3 断点续跑
- 本轮 R3 resume `completed=false`（模型 flaky 污染，非续跑机制本身缺陷）。I4（可恢复）需在模型稳定后单独复验：kill→`--resume` 是否接完。续跑**机制**（transcript crash-resumable，loop.ts 注释 + `--resume` 面）代码在，待模型稳定跑通验证。

## TUI 长程任务稳定性 — 深入探针（2026-10-03，模型无关）

> 用户主诉（本 session）：「之前超时 120s 问题在实际使用中经常中断且**没有任何提示**」。
> 建 `tui-longtask.ts` 探针，对准「中断时用户是否看到提示」+「中断后 session 是否还能用」——
> 这两点 headless harness 看不见，但正是长程任务稳定性的**信任面**。探针用注障代理把客户端
> 超时**确定性**触发（settings llmTimeoutMs 降档 / env ATLAS_LLM_TIMEOUT），隔离 flaky 模型。

### 探针结果（3 探针 2 PASS 1 有效 FAIL）
- **T-LT1 超时提示面（FAIL，暴露真实 bug）**：强制客户端超时后，本应见「本轮执行出错 + LLM 请求超时 remediation 提示」，但 **8s 超时根本没触发**（任务「Cogitated for 35s」正常完成），提示面自然也没出现。→ 挖出缺口 #3/#4（见下）。
- **T-LT2 超时后可用（PASS）**：超时错误后发 `/model fast`，信任线即时切 fast、session 存活 → 会话未死。
- **T-LT3 慢不误杀（PASS）**：5s delay < 600s 超时档，观察 30s 无「LLM 请求超时」提示、session 存活 → post-#260 不误杀慢模型。

### 缺口 #3（CONFIRMED，live 复现铁证，建议提交 main，P1）—— settings `llmTimeoutMs` 档是"死键"
- **`settings.json llmTimeoutMs` 键不生效**：沙箱 settings 写 `llmTimeoutMs=8000`，但 TUI/headless 实测 8s 超时不触发（15s 注障 delay 被完整等完，任务正常跑）。**决定性对照**：同场景 `env ATLAS_LLM_TIMEOUT=8000` 立即 `Request timed out`（proxy 只 1 call、8s 掐断）。
- 机制（两条独立缺陷，均已代码+live 定位）：
  1. **设置源缝注入晚于 provider 构造 / 或源返回 undefined** → `getModelProvider()`（`src/modelprovider/index.ts:25`）lazy `_provider ??= new OpenAIProvider(3, resolveLlmTimeoutMs(...))` **在构造时快照** `llmTimeoutSettingsSource`；`setLlmTimeoutSettingsSource` 由 `wireContextHostPorts()`（`src/tui/factory.ts:167`）注入，若首次 `getModelProvider()` 早于注入 → provider 固化为 600s 缺省。且 provider 的 `this.timeoutMs` 构造后**不再重读** settings 源（REPL 提示面 `getCurrentLlmTimeoutMs()` 反而是**每次现读**，两车道会不一致）。
  2. **headless `-p` 完全没跑 `wireContextHostPorts`**（它是 TUI-only `factory.ts`）→ headless 的 `llmTimeoutMs`/autoCompactWindow/timeBasedMCConfig 设置源缝**全死**。
- 影响：用户按 #260 的 remediation 提示改 `settings.json llmTimeoutMs` **毫无效果**（仍是 600s）；headless/CI 更彻底无此档。→ 直接击穿「超时了但用户能自己调大」这条闭环。
- 建议 main：把 `llmTimeoutMs` settings 源缝（连同 autoCompactWindow 等同类缝）抽到 provider 构造期就绪的公共层，或让 provider 每次读（懒读）而非构造快照；headless 入口补 wire 或等价注入。

### 正面采信（TUI 侧）
- R1（P0 静默终止）修正确认在代码：`REPL.tsx:2693-2700` turn 异常已 catch 出「本轮执行出错…请重试」+ #260 remediation 提示面（`llmTimeoutRemediationHint` `modelprovider.ts:89`）。**提示面本身在**——只要超时真触发，用户就能看到方向。缺口 #3 使「超时真触发」在 settings 档失效，但 env 档 + 缺省 600s 档仍真触发并出提示。

## 提交 main 的闭环项
1. **缺口 #2**（headless 缺全局崩溃兜底，P1，代码铁证）— 本轮主提交项。
2. **缺口 #1**（loop 无回合级错误恢复，P1/P2，优雅中断→加韧性）。
3. **缺口 #3**（settings `llmTimeoutMs` 死键 + headless 设置源缝未接，P1，live 复现铁证）— TUI 长程探针挖出，直接命中用户「超时了但改设置没用」主诉。
（模型可靠性 #3 报用户，非 main 产品项。）

> 编号对照：Main 侧记 **①** = 本 FINDINGS **缺口 #2**（headless 兜底）；Main **②** = 本 **缺口 #1**（回合级恢复）。**缺口 #3 为新发现，需 Main 单独立项。**

## 修后 gate + pre-fix 基线（2026-10-03，模型无关）

`verify-fixes.ts`（本目录）= 一枪验 gate，**纯看 loop 生命周期 + 代码接线，不碰任务完成质量**（隔离 flaky 的模型）。两项各给一个可判 PASS/FAIL 的模型无关信号：

| gate | 缺口 | pre-fix 基线（已锁，master） | post-fix 判据 | 复现 |
|---|---|---|---|---|
| `headless` | ①/#2 | ❌ 0 命中（src/cli/** + atlascode/cli.ts 无 handler 注册，扫 26 文件） | 命中 ≥1（headless 链出现注册） | `verify-fixes.ts headless` |
| `turnrecover` | ②/#1 | proxyCalls=**3**≪40，`isError=true crashed=false`（风暴内优雅中断，743ms） | proxyCalls **≥40**（穿越风暴窗口 N=40） | `verify-fixes.ts turnrecover --expect post` |
| `timeoutlane` | ③/#3 | `ms=16231≥15000 proxyCalls=1 timedout=false`（settings 档死：proxy 等完 15s delay 后模型正常答） | `ms<15000` 8s 窗内掐断（settings 档活，timedout=true） | `verify-fixes.ts timeoutlane --expect post` |

- **headless gate 自测**：REGEX 负例核验——能命中 TUI 侧真实注册点（`init.ts:79`、`gracefulShutdown.ts:226/:290`），故 headless 链 FAIL 是真阴性非漏判。
- **turnrecover 模型无关性**：500 由 proxy 注入（非模型态），pre-fix 中断在风暴内（第 3 次 chat 后 abort，未触发 after-storm 转发）；信号 = proxy chat 调用数 vs 风暴窗口，与模型任务能力无关。
- 指向 Main worktree：`ATLAS_E2E_REPO=<worktree-path> bun run user-e2e/loop-robustness/verify-fixes.ts <headless|turnrecover|timeoutlane|all> --expect post`。
- 状态：三 gate 就绪，pre-fix 基线已锁。

### ✅ 修后 gate 判据（2026-10-03，Main worktree loop-robustness tip 10f0b4d，三缺口全 PASS）

| gate | pre-fix 基线 | post-fix 实测 | 判定 |
|---|---|---|---|
| `headless` | 0 命中 | 命中 5 处（crashBackstop.ts:41/45 process.on + cli.ts:90 调用） | ✅ PASS |
| `turnrecover` | proxyCalls=3，is_error=true | proxyCalls=**48**（40×500 风暴 + 8×nominal 穿越），`is_error=false`，**任务真完成**（4 lib 文件落盘 + node 实跑 "ALL TESTS PASSED"） | ✅ PASS（穿越且完成任务） |
| `timeoutlane` | ms=16231，timedout=false | ms=**8159**<15000，proxyCalls=1，timedout=true | ✅ PASS（settings 档 8s 掐断） |

- ② 关键深挖（修正版）：不只穿越风暴，循环还**骑完 40 次 5xx 后完成多步 coding 任务**——`lib/math.js`/`stats.js`/`app.js`/`run.test.js` **4 文件全部真实落盘**，`node lib/run.test.js` 实跑输出 "ALL TESTS PASSED"。是真韧性非仅不崩。**（早前记录的 proxyCalls=59/"任务完成"是一次权限门假象——当时 harness 漏 `--dangerously-skip-permissions`，0 文件落盘，log 里的 "ALL TESTS PASSED" 是模型自述非 node 实跑；补齐 flag 重跑后得真值 48 + 真完成。）**
- 自检注意（三条 harness-side 教训，全已修）：
  1. timeoutlane gate 的 HOME 须合进 spawn env（曾踩 `{env, ...{HOME}}` 把 HOME 散到 spawn options → 跑进真实 settings/provider、proxyCalls=0 假基线）；
  2. **headless spawn 须带 `--dangerously-skip-permissions`**（曾漏 → Write/Bash 被权限门拦 → 0 文件落盘被误判模型 flaky）；
  3. 任务完成类断言必须 diskCheck 实跑 node 测试，不能信 log 里的 PASS 文本（模型会复述任务描述里的 "ALL TESTS PASSED" 字样）。

## 2026-10-04 重跑（模型稳定 + harness 权限门已修）—— task #42 收口 + 2 新缺口

> 前提：headless spawn 补 `--dangerously-skip-permissions`（早前「0 文件落盘误判模型 flaky」已纠偏），
> 模型当前稳定。R1 6 场景、R3 断点续跑全跑（`R1-1791101886328-ig8t` / `R3-1791101561294-zx4o`，
> 均对 master post-fix）。R2 soak 另跑（soak.ts）。

### ✅ 任务完成对照（R1 场景结果）
| 场景 | 结果 | 说明 |
|---|---|---|
| R1-nominal | ✅ completed（19 tools, 90s） | 完成基线 |
| R1-500-transient | ✅ completed（18 tools, 70s） | 前 2 次 500 重试预算内恢复 |
| R1-drop-transient | ❌ FAIL（227ms, 0 tools, zeroContent） | **缺口 #4**（见下） |
| R1-empty-bounded | ❌ FAIL（exit0, 2.9s, 1 tool, 假 success） | **缺口 #5**（见下） |
| R1-delay | ✅ completed（17 tools, 118s） | 慢模型不误杀（post-#260 fail-fast 不提前触发） |
| R1-500-storm | ✅ completed（14 tools, 58s） | ② 回合级恢复穿越 40×500 并完成任务（真韧性，与 turnrecover gate 互证） |

### ✅ R3 断点续跑（I4 可恢复，铁证）
- harness 修两处：① headless spawn 补 `--debug-to-stderr`（让 `[headless] session start: id=<uuid>` 启动即落 stderr——stream-json 的 result/assistant 只在 loop 结束后上流，mid-run SIGKILL 前此乃唯一 sessionId 通道）；② resume 段 prompt 改为极简 continue（不复述 TASK，避免重头做）。
- 实跑：kill@25s 捕获 sessionId → `--resume` → `resumeMs=69.8s`、`resumeToolUses=22`、续跑段载入 14 条被杀上下文、diskCheck 实跑 ALL TESTS PASSED、`I4_recoverable=true`。

### ✅ R2 soak（I5 无退化，首跑）
- `soak.ts`（本目录新增）：单 session 连续 N 模块 coding 任务，每 5s 采 CLI leader 进程 RSS（另走树 RSS）。
- 首跑（N=20，`soak-1791102680280-nq12`）：**completed=true 51.4s、11 采样、diskCheck 实跑 ALL TESTS PASSED**；leader RSS first=86.4MB → peak=90.98MB（+5.5% 平稳，无泄漏）；`I5_noDegradation=true`。
- 边界：51s 属「有限长任务」非「多时 soak」——真多时 soak（hours级、多 compact 周期）另立，不属本轮关键路径（本轮关键 = 任务完成对照 + 断点续跑 + 2 新缺口）。

### 缺口 #4（CONFIRMED，P1，模型无关铁证）—— 连接重置断连不重试，瞬时断连整任务死
- 现象：`firstN 1 drop`（fault-proxy `res.destroy()` ⇒ ECONNRESET）→ 227ms 内 `result=error_during_execution, num_turns=0, errors=["Error: Connection error."]`；stderr `run error: Error: Connection error. at openai/client.mjs:843 makeRequest`。
- 机制（代码 + live 隔离复现双证）：
  1. OpenAI SDK `makeRequest` 把 fetch 拒因包成 `APIConnectionError({ message: getConnectionErrorMessage(cause), cause })`；`getConnectionErrorMessage` 对非 undici-dispatcher 错返 `undefined` → 落缺省 `'Connection error.'`，且 `super(undefined, undefined, msg, undefined)` → **`this.code=undefined`**，真 `ECONNRESET` 塞进 `err.cause.code`（隔离复现 dump：`{message:"Connection error.", code:undefined, cause:{code:"ECONNRESET"}}`）。
  2. `isRetryableError`（`src/modelprovider/modelprovider.ts:47-54`）：`String(err.message || err.code)` message 真值 → **短路从不看 code**；正则 `/timeout|ECONN|EPIPE|fetch failed|socket|aborted/i` 不匹配 `'Connection error.'` → 判不可重试。
  3. → `shouldRetryModelError` 返 false → provider 重试循环 break → `chat()` 抛 → 且 `withTurnRecovery`（turnRecovery.ts:152 同判 `shouldRetryModelError` 单点）也立即穿透 → 整任务 `error_during_execution`。
- 影响：网关重启 / LB 重置 / 网络闪断（单次瞬时）即杀死整个长 coding 任务，零恢复。直接击穿「持续长时间不中断」。
- 建议 main：`isRetryableError` 认 `APIConnectionError`（或 message `"Connection error"`）+ 沿 `err.cause` 链取 `ECONNRESET`/`ECONNREFUSED`/`EPIPE`/`UND_ERR_*`/`socket` 码判可重试（瞬时网络类）；保留 400/401/404 不可重试。

### 缺口 #5（CONFIRMED，P1/P2，模型无关铁证）—— 空 0-0 被 provider 占位符掩盖，绕过 loop 空检测 + 有界重试
- 现象：`at 2 empty`（第 2 次 chat 返回空 content）→ 2 次调用后会话以 `subtype:success result:"(provider: empty response)"` 假成功终止（num_turns=2, tools=[Bash], 任务未完成磁盘无文件）。
- 机制（纯函数层，无模型依赖）：
  1. provider 层（modelprovider.ts:308）空响应 `content.length===0` → 塞 `{type:'text', text:'(provider: empty response)'}` 占位文本，把「空」改写成「非空文本」。
  2. loop 层 `isEmptyContent`（loop.ts:285-293）判「非空 text / tool_use」——占位文本是非空 text → 判非空。
  3. → 有界 1 次重试（loop.ts:294-305 注释「首次空响应再试 1 次」）**从不触发**；`emptyTerminated`（lastRound.empty）恒 false → 无用户可见提示。
  4. 会话以 normal end_turn 提前终止（no tool_use ⇒ terminal），非静默假成功。
- 影响：网关瞬时 0/0（单次空输出）本应 1 次重试即恢复，现却让任务「假成功」中途停——比缺口 #3 更隐蔽（无 error 面，用户只见任务停了却无提示）。
- 建议 main：provider 层别塞 `"(provider: empty response)"` 占位文本（或改塞空 content 让 loop 层空检测 / 有界重试 / emptyTerminated 提示按设计生效）；空响应是「零产出」不是「合法文本答复」。
