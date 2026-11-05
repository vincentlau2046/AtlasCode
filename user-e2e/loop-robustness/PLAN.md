# loop 鲁棒性/稳定性测试方案（v1，用户 2026-10-03 确认）

> 用户指令：「coding agent 持续长时间不中断是基本要求；针对这个特性开发测试方案，优先级排在 TUI 前，非常重要。」
> 定位：本方案是**测试**（找鲁棒性缺口），发现的确认缺口按 3-round 缺陷单形态**提交 main 开新优化闭环**（本轮排在 TUI 前）。
> 落点：`user-e2e/loop-robustness/`（全 I/O 隔离，真实 `~/.atlas` 零写）。
> 日期：2026-10-03。

## 0. 一句话

把「长时间不中断」拆成 **5 个可断言不变量**，用 **3 层测试**压，故障经**网关前注障代理**注入（真实产品路径，不 mock 引擎），确认的缺口提交 main。

## 1. 不变量（「不中断」= 全守住）

| # | 不变量 | 断言 | 主要测层 |
|---|---|---|---|
| I1 不崩 | 进程存活 | N 轮内 exitCode 非崩溃 + stderr 无 uncaught/unhandled 崩栈 | R1/R2 |
| I2 不提前终止 | 有效任务不静默丢 | 无故障时任务完成；注障下「恢复」或「显式错误」，**非静默空/非崩溃丢弃** | R1 |
| I3 不挂 | 有进展 | 单轮/总 wall-clock 有界，无「某轮永不返回」 | R1/R2 |
| I4 可恢复 | 断点续跑 | mid-run SIGKILL → `--resume` 接完 | R3 |
| I5 无退化 | 长跑不退化 | RSS/句柄/上下文有界、单轮延迟不爆炸增长 | R2(soak) |

## 2. 失败面分类（源自 `src/engine/query/loop.ts`，据此注障 + 断言）

| 失败面 | 代码落点 | 注障/压法 | 断言 |
|---|---|---|---|
| LLM 请求瞬时 5xx/ECONN | provider 3 次重试（`shouldRetryModelError`） | 注障代理 500/drop | 预算内恢复（R1 短暂故障） |
| LLM 请求 5xx 风暴（超重试预算） | **loop 无 try/catch（残留守 E-1b-full）** | 5xx 风暴 | 暴露「无回合级错误恢复」缺口（候选缺口 #1） |
| 空内容 0-0 | `queryOneRound` R1 有界 1 次重试 → `emptyTerminated` | 注空 0-0 | 不崩、非静默；连续 0-0 是否反复提前终止（候选缺口 #3） |
| 慢生成（>旧 120s） | #260 超时 600s + fail-fast 门 | 注 delay | post-#260 不提前 fail-fast（回归护底） |
| autoCompact 熔断 | 3 连败跳闸 | soak 长跑膨胀 | 跳闸后不无限膨胀/不停滞（候选缺口 #4） |
| 死转（unboundedTurns） | REPL 无 maxTurns | 病态任务 | 有界（候选缺口 #5） |
| 进程级 unhandled rejection | TUI 有 `gracefulShutdown` 全局兜底；**headless 未见** | 长跑 fire-and-forget | headless 不崩（候选缺口 #2，跑测确认） |

## 3. 三层（对齐现有 short/medium/long）

| 层 | 内容 | 时长 | 状态 |
|---|---|---|---|
| R1 单点鲁棒 | 一次注一类故障（5xx 短暂/断连/空 0-0/慢/5xx 风暴），各断 I1/I2/I3 | 每条分钟级 | **本批做**（harness.ts） |
| R2 长跑 soak | 名义 + 低概率随机注障，连续 30–120min，断 I1/I3/I5（RSS 采样） | 长（后台） | 后台跑（soak.ts） |
| R3 断点续跑 | 长任务 mid-run SIGKILL → `--resume` 接完，断 I4 | 分钟级 | **本批做**（harness.ts） |

## 4. 注入机制（用户已确认：网关前注障代理）

- `fault-proxy.ts`：`:8998` 转发到 `:8999`（路径透传），按 POST /chat/completions 计数注入
  `500 / drop / empty / delay`，PLAN 经 env/参数给（`firstN / at / always / flaky / storm`）。
- 沙箱 `settings.providers.iff.baseURL → http://127.0.0.1:8998/v1`，Atlas 走真实引擎 + 真实进程，
  只在「网关↔引擎」缝注障 → 测的是真产品路径（Atlas 与等价 TUI 同路径）。

## 5. 车道（用户已确认：headless 为主 + TUI 抽查）

- 主体 = headless（`-p --output-format stream-json`）：可程序化断言、无 PTY flakiness、易长跑/后台、
  顺带验「headless 缺全局兜底」缺口 #2。
- TUI 只做「人面向不中断」抽查（复用 `lib/pty.ts`），非主体。

## 6. 候选设计缺口（边跑边验证，确认即提交 main 开新闭环）

| # | 缺口 | 置信 | 验证方式 |
|---|---|---|---|
| 1 | loop 无回合级错误恢复（残留守 E-1b-full）：网关 5xx 风暴 → 回合级丢弃、任务中断 | 高 | R1-500-storm：预期任务不完成（非静默） |
| 2 | headless 车道缺全局 unhandledRejection 兜底（与 TUI gracefulShutdown 不对称） | 高（需跑测确认 headless 无 handler） | R1/R2：stderr 崩栈 + 进程是否崩 |
| 3 | R1 空响应仅重试 1 次：连续 0/0 反复 `emptyTerminated`（提前终止） | 中 | R1-empty 多次注空 |
| 4 | autoCompact 熔断后行为（膨胀 or 停滞） | 中 | R2 soak 膨胀 |
| 5 | REPL unboundedTurns 无死转防护 | 中 | 病态任务（病态 fixture） |

## 7. 交付物 + 闭环

- `fault-proxy.ts` / `harness.ts`（R1+R3）/ `soak.ts`（R2，后台）/ `PLAN.md` / `ticket.md` + `result.json`。
- 每轮出「鲁棒性验收单」（不变量逐条 + 证据截留 + 缺口单）。
- **确认的缺口 → 3-round 缺陷单形态提交 main 开新优化闭环**（本轮排在 TUI 前）。
- 复现：`bun run user-e2e/loop-robustness/harness.ts all`（R1+R3）。
