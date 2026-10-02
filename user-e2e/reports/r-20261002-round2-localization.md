# 第 2 轮闭环 · 核销 + 定位报告（v0.1.8 @ 4be921a，2026-10-02）

> 3 轮闭环第 2 轮：main 修复 P0-1（d3259e2 hooks bootstrap 接线，release 4be921a）后，
> 本 session 在干净 v0.1.8 上做斗兽棋定向复测 + core 段回归 + 全量（r-20261002-1016 跑中）。
> 证据：`artifacts/repro-20261002-dsq/`（laneA-tui-pty-1790907776678.log + session jsonl）
> + `artifacts/r-20261002-1016/`（core-3 pty + session）。

## 1. P0-1 核销：**已修** ✅

斗兽棋 TUI 车道（v0.1.8，`code --dangerously-skip-permissions` 形态）：
- agent loop **活了**：THINK 块生成 + Bash tool_use/tool_result 两轮真实执行落盘
  （session jsonl：assistant×2 + tool_result×2，thinking 块存在）；
- turn 完成事件落盘（turn_duration 97411ms，02:24:34Z）——对比 0.1.7 空回合（33s /
  messageCount=1 / 0 assistant）彻底改变。
- 与 main 自述取证一致（修复后 8 assistant + tool_result 落盘）。

## 2. 残留/新发现（按优先级）

### R1（P0）静默终止：回合活着但"无声收场"——用户主诉的最后 1 英里

斗兽棋 v0.1.8 实测（自动放行，完整回合面）：
- 第 1-2 轮 = **环境探测**（`ls -la`、`node --version`），无文件写入；
- 第 3 轮（02:23:04 → 02:24:34，90s）**无任何 assistant 事件**，turn 以
  turn_duration 收场 → **无最终文本、磁盘 0 产物**（用户视角：spinner 停，没有回答）。
- core-3（hello.txt 工具任务）同族：session **0 assistant 事件**、pty 面仅
  spinner 帧 → idle tips、无响应渲染、无权限 dialog、磁盘 false → FAIL。

**代码级定位**（两条静默路径，均无错误面）：
1. `src/engine/query/loop.ts:442`：`toolResults.length===0 → terminated=true, break`——
   **空内容响应（网关 0/0 或模型空输出）被当"正常终止"**：无 assistant 落盘、
   无错误展示，用户只见 spinner 停。与第 1 轮报告嫌疑 ③（L4 0/0）合流：
   P0-1 修掉了确定性根因（hooks 未 wire），**间歇性根因（空响应静默终止）仍在**。
2. 第 3 轮异常路径：`loopEvents.ts:58-97` 重抛 → REPL catch 后无屏幕错误行
   （core-3 pty 尾屏零错误字样）。

**修复建议**：
- queryOneRound 对 0 内容响应区分「网关 0/0 可重试」与「模型正常 end_turn」：
  0/0 走重试（1-2 次）或显式错误行；
- REPL 层 turn 异常/空终止出**用户可见错误/提示面**（"本轮无响应（网关空响应/异常）"
  + 可重试入口）；
- L4 网关 0/0 监控与 IFF 侧联查（同分钟级 headless 有内容 = 负载相关，非恒坏）。

### R2（P1）thinking 块实时轮不渲染

session jsonl 有 THINK 块（模型在思考），但 pty 屏 0 thinking 标记——
`AssistantThinkingMessage.tsx` 渲染器存在但未在活回合面出屏（或默认折叠未展开）。
= 用户「thinking 信息没有任何渲染」主诉的渲染侧缺口（与 R1 叠加：空终止时连 thinking
都不可见，用户完全无过程感知）。建议：活回合面渲染 thinking 折叠行（对齐 Claude Code
「Thinking…」交互）+ 回合进行中的工具进度行。

### R3（P2）session jsonl 事件行重复落盘

core-3/斗兽棋 session 每条事件**写两遍**（同字节双行）→ 转录膨胀 + resume/回放
重复消费风险。定位面：transcript record 队列双触发（round_end emit + 轮末全量 record
两处对同一序列各 record 一次，dedup 未生效？）。

### R4（P2）TUI 入口带 flag 落交互前向缝 exit 1（F7）

bin cli.ts 分派：`argv.length===0 || argv[0]==='code'` 才走 TUI 支；**任何 flag**
（`--model` / `--continue` / `--dangerously-skip-permissions`…）落入 cli 公共域
→ 交互入口 = `parse.ts:392`「壳波 #152 前向接缝（launchRepl 未落盘）」exit 1。
实测 `bun run cli.ts --dangerously-skip-permissions` → 该缝消息 + exit 1；
`code --dangerously-skip-permissions` 才起 TUI 且 TUI main 自读 argv。
= 用户带 flag 启动 TUI（`atlascode --model x`）直接死缝，属 TUI 启动面缺口。

### R5（P2）模型行为面：探测轮浪费预算

Qwen38 在写文件前先 `ls -la` / `node --version` 探测环境（斗兽棋 2 轮全探测）。
单轮无害，与 R1 静默终止叠加 = 任务零产物。建议 main 面：系统提示词加
「工作区为空可直接创建，无需先探测」纪律行（与 0.1.7 工具纪律行同族）。

## 3. 全量套件（r-20261002-1016，v0.1.8，跑中）

提交时进度 8/127：gate PASS / core-1 PASS / core-2 PASS / **core-3 FAIL**（= R1 同族，
见 §2）/ core-4 PASS / slash 段 STUCK 若干（渲染滞后签名，0.1.7 已知面）。
全量 127 case 跑完补发核销数字（含 T9 conv 磁盘 ground truth）。

## 4. 第 2 轮给 main 的修复清单

| # | 级 | 项 | 层 | 验证面（第 3 轮） |
|---|---|---|---|---|
| 1 | **P0** | R1 静默终止：空内容响应重试/错误面 + turn 异常用户可见提示 | L2/L4 | 斗兽棋 TUI 出最终文本 + 磁盘产物；core-3 PASS |
| 2 | **P1** | R2 thinking 活回合渲染（折叠行）+ 工具进度行 | L1 UX | 斗兽棋 pty 日志出现 thinking 标记 |
| 3 | P2 | R3 session jsonl 去重 | 产品 | session jsonl 每事件单行 |
| 4 | P2 | R4 TUI flag 启动面（flag 形态起 TUI 而非死缝） | L1/L3 | `--model x` 形态 TUI 正常起 |
| 5 | P2 | R5 探测轮纪律（提示词面） | 提示词 | 斗兽棋首轮直接写文件 |

**P0-1 核销 ✅**；P0-2（TUI 工具车道）实质由 P0-1 修复 + R1 承接：loop 已活，
剩余 = R1 静默终止（P0）+ R2 渲染（P1）。
