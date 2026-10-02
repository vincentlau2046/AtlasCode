# 第 1 轮闭环 · 定位定界报告（v0.1.7 @ 2d6bf8c，2026-10-02）

> 3 轮「测试（本 session）↔ 修复（main）」闭环 · 第 1 轮。
> 方法：**斗兽棋三车道对照**（TUI 用户主诉车道 / AtlasCode headless / Claude Code headless 基线）
> + 全量套件 + 干净树（worktree @ 2d6bf8c，不碰 main 脏工作树）交叉验证。
> 证据留痕：`artifacts/repro-20261002-dsq/`（laneA pty 日志 / laneB·C jsonl / session jsonl）。

## 0. 阻断项（main 需先处理，否则第 1 轮全量无效）

- **main 工作树 parse 损坏 → TUI 启动全崩**：`src/tui/services/mcp/auth.ts:151` JSDoc 块缺 `/**` 开头
  （` * Response has been stable in Node since 18...` 被当代码解析，bun 报
  `Expected ";" but found "has"`）。全量套件 `r-20261002-0830` 因此崩在 slash 第 4 个 pty session
  （仅覆盖 gate+core+slash 13 条）。**main 修复该编辑并提交后，本 session 在干净提交上重跑全量。**
- 本轮所有 TUI 面结论取自**干净的 0.1.7 提交态**（脏树崩前 08:37 复现 + 干净 worktree 交叉验证），
  不含 main 未提交改动的污染。

## 1. 用户主诉复现：斗兽棋 TUI 空回合（P0，确定性复现）

**症状**（用户 transcript 原样）：「开发一个斗兽棋游戏」→ ✻ Sautéed for 2m 3s → 无任何响应，
thinking 无任何渲染。

**复现**（TUI 车道，干净 0.1.7，prompt 原样）——**两种失败形态**：

**形态 1 · 空回合**（turn 完成后 0 内容）：

| 面 | 结果 | 证据 |
|---|---|---|
| 回合耗时 | turn_duration **33012ms** | session jsonl `system/turn_duration` |
| 回合内消息数 | **messageCount=1**（仅 user） | 同上 |
| assistant 事件 | **0 条**（无 thinking / 无 text / 无 tool_use） | session jsonl 全量 |
| 退出屏统计 | API 0s / Usage 0 in 0 out | pty 尾屏 |
| 输入面 | 探针 3s 无回显（**死**） | PROBE42 探针 |
| 磁盘产物 | 0 个 | 工作区扫描 |

**形态 2 · 回合挂起**（与用户 2m3s 症状签名一致）：user 消息落盘（01:11:29Z）后
**180s+ 无 turn_duration、无 assistant 事件**，session 存活、输入面活（探针回显），
屏幕只有 spinner 闪烁（✻×3）+ idle tips 轮换——**即用户所见「✻ Sautéed for 2m 3s 无任何响应」**。
证据：`artifacts/repro-20261002-dsq/`（laneA-tui-pty-*.log + session jsonl `48902675`）。

**「thinking 无渲染」定性**：TUI **有** thinking 渲染器（`AssistantThinkingMessage.tsx` /
`ThinkingToggle.tsx` / `HighlightedThinkingText.tsx`）——无渲染是**空回合的连带**（0 assistant 内容
可渲染），不是独立渲染 bug。但存在 UX 缺口：回合进行中 TUI 无「Thinking…/正在处理」过程态展示，
用户只能看 spinner 干等（Claude Code 有 thinking 折叠行）——建议 main 补过程态。

**代码级嫌疑链**（给 main 的打点建议，按嫌疑序）：

1. **TUI 预回合 autoCompact 误触发**（机制候选首选）：`agentLoopDeps.ts:100-130`
   TUI 装配面 `contextWindow = resolved?.contextWindow ?? HARD_DEFAULT_CONTEXT_WINDOW`——
   TUI 巨型系统提示词 + 全工具池的 token 计数若超过误解析的窗口 → **首回合即触发 pre-turn compact**
   （`loop.ts` while 顶 `autoCompact` 门）→ compact 的 `summarize` 走 `modelProvider.chat`
   （33s 量级与单轮生成时长吻合）→ 随后回合以空内容终止（`loop.ts:24` terminal 语义：
   assistant 无 tool_use = 纯文本回答终止，**空内容同样"正常"终止**，无错抛）。
   headless（`print.ts:757/785`）loopDeps 自装配、compact 配置不同 → 不触发 → 正常。
   **打点面**：`buildAgentLoopParams` 内 compact 触发条件（msgs token vs contextWindow）+
   `summarize` 调用前后 + `queryOneRound`（`loop.ts:221`）resp.message.content 块数。
2. **D-2a S8/S9 切端回归**（宿主端口接线）：TUI 消费链 `REPL onQueryImpl → queryEngineLoopStream`
   （`loopEvents.ts:58-97` 错误会重抛，观测到的是"正常结束"非抛错 → 排除消费层吞错，
   指向 provider.chat 返回空内容 或 loop terminal 语义提前终止）。
3. **L4 网关 0/0 空响应**（概率低）：同分钟级 headless 有完整内容返回；但 TUI 请求面
   （巨型 prompt）与 headless 不同，网关/模型对超长 prompt 空回不能 100% 排除——
   打点 ① 的 resp 原始返回即可一并定界。

**关键对照**（同机同网关同模型，分钟级先后）：

| 车道 | 斗兽棋结果 |
|---|---|
| A. AtlasCode **TUI** | 空回合：33s 后 0 assistant，输入面死 |
| B. AtlasCode **headless** | **正常**：2 thinking 块 + 4 text + 5 tool_use + result（laneB2 留痕） |
| C. **Claude Code** headless 基线 | （补跑中） |

→ 同模型（small→iff/Qwen38-27B-TXT，两车道解析一致，角色池假设已排除）、同网关（IFF 200/1ms、
headless 有完整内容返回）**TUI 车道单独空回合** → 断点在 **TUI 回合消费链**（L1/L2 交界）：
D-2a 切端波（S8 engine 宿主端口接线 / S9 删 tui-local orchestrator）重构了 TUI turn 路径
（`REPL onQueryImpl → queryEngineLoopStream`，`src/tui/replLoopDeps.ts` + `src/engine/query/loop.ts`），
为 0.1.6 引入的**回归嫌疑第一候选**；次候选 IFF 网关 0/0 空响应（L4，但 headless 同时段正常，
L4 概率低）。**给 main 的定位建议**：在 `queryOneRound`（`loop.ts:221`，`deps.modelProvider.chat`）
前后 + `REPL onQueryImpl` 消费面加 --debug 打点（0.1.7 已落 debugSink，cli 面可用；TUI 面确认接线），
跑 TUI 斗兽棋回合抓一次即定界。

**与旧缺陷关系**：= r-1606 §7 P0-1「TUI 0-tool_use」同一根因面（TUI 车道模型回合产出缺失）的
用户可感知形态（空回合 vs 纯文本 fabrication 是同一断点的两种表现）。

## 2. 全量套件（r-20261002-0830，部分有效——脏树崩前段）

| case | verdict | 核销/信号 |
|---|---|---|
| gate | PASS | 网关 200/1ms，LLM 单轮 OK |
| core-1 | PASS | 基本多轮通 |
| core-2 | PASS | headless --resume 修复保持（0.1.6 核销不回退） |
| **core-3** | **FAIL** | **TUI 工具回合断：渲染=false（marker 1/2）磁盘=false** → **P0-1（TUI 工具车道）0.1.7 未修**（main c65eafb/d985d55 提示词纪律未解决 TUI 执行路径） |
| core-4 | PASS | 流式中排队正常 |
| slash ×13 | STUCK/NAVFAIL 若干 | 脏树崩前段，**不采信**（main 编辑中途破坏树） |

全量重跑计划：main 修复 auth.ts 并提交后，干净提交 `--tier all` 全量（本 session 执行）。

## 3. 其他发现

- **F4 headless 车道不稳（L3/L4，非确定缺陷）**：stdin 管道 prompt 形态两次零事件
  （脏树 B1 20.5s、干净树 laneB 300s 超时 0 事件），同形态单独复跑 **正常**（B3a：21 事件 +
  3 thinking + 20 tool_use）。= 负载/瞬态相关，建议 main 在 headless 入口加网关失败可观测性
  （0 事件退出码 + stderr 原因，现静默 0 输出）。
- **F5 headless 无权限旗标时行为失序（新，P2）**：B3a（无 `--dangerously-skip-permissions`）
  300s 烧完 20 轮：模型自我探测 fs（pwd/whoami/`echo $HOME`）、**`Config` 工具改
  `permissions.defaultMode`**、`EnterPlanMode`（TUI 工具泄漏进 headless 工具池）、
  绝对路径越出工作区 mkdir、python 绕行写文件——**零磁盘产物 + `error_max_turns`**。
  对照 B2（skip-permissions）：20.5s 5 工具完成。headless 默认权限面 + 工具池裁剪需 main 处理。
- **F6 claude 基线对照**（用户指定输出类参照）：本机 `claude -p`（同走 Qwen38-27B 网关，
  非独立模型基线——stderr 见 `unrecognized_model Qwen38-27B-TXT`）300s 未完成：
  8 assistant / 3 thinking / 3 tool_use / 事件流完整但慢（模型 bound）。
  **差距定性**：输出类差距不在"有没有事件流"（headless 有），而在 **TUI 车道事件流全断**
  （形态 1/2）+ headless 无 skip 时失序（F5）——TUI 车道是主要差距。

## 4. 给 main 的第 1 轮修复清单（按优先级）

| # | 级 | 项 | 层 | 验证面（本 session 第 2 轮复测） |
|---|---|---|---|---|
| 1 | **P0** | 修复 `src/tui/services/mcp/auth.ts:151` JSDoc 破损并提交（阻断项） | 工作树 | `bun build` 过 + TUI 可启动 |
| 2 | **P0** | TUI 斗兽棋空回合（33s/0 assistant/输入面死）：定位 TUI 回合消费链（queryEngineLoopStream / onQueryImpl / modelProvider.chat 打点） | L1/L2 | TUI 斗兽棋出实质响应 + 磁盘产物；core-3 转 PASS |
| 3 | **P1** | TUI 过程态 UX：回合进行中展示 thinking/进度（现仅 spinner），对齐 Claude Code「Thinking…」折叠 | L1 UX | 斗兽棋回合可见过程 |
| 4 | P2 | headless 无 skip-permissions 时行为失序（F5：Config 自改权限/工具池泄漏/turn 预算烧空） | L2/L3 | headless 无旗标跑斗兽棋：不烧 20 轮、不改 Config、有磁盘产物 |
| 5 | P2 | headless 网关失败可观测性（F4：0 事件静默退出） | L3 | 0 事件时 stderr 出原因 + 非零退出码 |

**第 1 轮闭环协议**：main 完成上表 → 发新版本号 → 本 session 全量复测 + 斗兽棋 TUI/headless 定向复测
→ 核销表 + 新发现 → 第 2 轮提交（3 轮闭环的中间轮）。
