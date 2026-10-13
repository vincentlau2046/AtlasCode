# /goal（CC 2.1.139）全面演化方案 · 深度分析（f4 规划面，决策前输入）

> **2026-10-13 f4 出卡**（0.1.61+ 波池排程面：0.1.61 首车已收口，/goal = 池内次项；用户裁定「全面演化方案是否成熟，做详细推演，不能大概了是」→ 本卡 = 全量深度版）。
> **素材三面全核**：① 上游双源全量（源 B `claude-code-upstream` CHANGELOG /goal 12 条演化条目 + 核心条目原文 / 源 A `claude-code-system-prompts` 3 份 prompt 资产全文：ProposeGoal 工具描述 2.1.227 + Session stop hook active 2.1.173 + Autonomous loop check 2.1.246）② live 码面 12 锚点锚定（@0.1.61 7ad450d，grep/Read 只核）③ harness 工程全量盘点（user-e2e 探针资产映射）。

## 0. 执行摘要（结论前置）

| 裁定项 | 结论 | 一句话依据 |
|---|---|---|
| **方案是否成熟** | **成熟（可落地）** | 概念面 = 上游 2.1.139→2.1.295 约 20 版本 12 条演化打磨完（每条行为边界明确可验收）；码面 = 12 锚点 11 在场（唯一重量级新增 = ProposeGoal 新工具）；harness = **零新基建**（mock judge 判据同 c4-mock-server 已证模式）；提示词 = 3 份上游资产全文在场可直接移植 |
| **落地策略建议** | **拆两波（0.1.62 核心+持久化 / 0.1.63 演化批），终态 = 全面演化对齐** | 终态相同，gate 各自 fail-closed，打回半径小（0.1.52/53/54 三连打回 = 大波风险实证）；单大波可执行但 gate 时长/打回面放大 |
| **最高风险** | 引擎回合边界改动（goal 续跑支触碰主循环终止语义） | 零回归约束 = 无 goal 面字节级恒等；缓解 = 判别单测修前红→绿 + loop-rob C1/C2/C3/R3 重跑 + A4F 三重 gate |
| **建议波序位置** | 0.1.62/0.1.63 = 波池第 2/3 车（0.1.61 已收口 ✅；④ SDK 零码件可并 0.1.63；**Q3 subagent 独占波仍在池末位**） | check-in 演化件等待「后台工作」= 既有 LocalShellTask 面即可（Q3 后台 subagent 不在依赖链）；Q3 启动门 = 用户界① 不变 |

## 1. 上游演化时序与概念成熟度

**核心（2.1.139，源 B L5059 原文）**：`/goal` 命令 = 设一个完成条件，Claude 跨回合持续工作直到达成；interactive + `-p` + Remote Control 全模式；活 overlay 面板（elapsed/turns/tokens）。

**架构发现（本分析关键）**：**/goal 上游实现底座 = Stop hook + 条件 + 独立评估器**，证据 = 源 A 2.1.173 system-reminder「Session stop hook active」原文：
> "A session-scoped Stop hook is now active with condition: … The hook will **block stopping until the condition holds**. It auto-clears once the condition is met — do not tell the user to run `/goal clear` after success; that's only for clearing a goal early."

即：goal armed 时 = 注册会话级 Stop hook（条件 = 完成条件），引擎 terminal 点（assistant 无 tool_use）Stop hook 支阻断停止 → 续跑；评估器（独立 LLM，**仅从对话验证、不跑命令不读文件**，ProposeGoal 描述明载）确认达成 → 自动清除。

**演化条目全量（源 B grep 12 命中，按主题归类）**：

| 主题 | 条目（版本） | 行为边界（= 可验收判据） |
|---|---|---|
| **错误恢复** | /goal 跑动中 API 错误/网络断/限流 → 重试退避或暂停并说明（含等配额恢复） | goal 跑动中注障 → 不静默挂起，退避/暂停+说明 |
| **自清除** | turn 死于不可恢复错误（auth 吊销/额度耗尽/上下文溢出）→ goal 自清除+通知（不再 armed） | 注不可恢复错误 → goal 状态 = cleared + 通知行 |
| **持久化** | `--continue`/`--resume` 恢复 active goal；compact 后 goal 不丢；`--resume` picker 恢复 goal（3 条） | goal 持久化 + resume/compact 两路径恢复判别 |
| **check-in** | 空闲会话 goal 被长后台工作阻塞 → 30min 后自动 check-in（1h/2h 退避）；每 goal 至多 3 次，用户下一消息 +3；`CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` 关；后台任务阻塞 30min+ 自动 check-in（4 条） | 定时器面 + 退避序列 + 预算 3 + env 关断 + 阻塞源判别 |
| **评估器时序** | 修复评估器在后台 shell/委派 subagent 仍运行时提前触发 | 评估器触发前 = 后台工作全终态守卫 |
| **hook 边缘** | `disableAllHooks`/`allowManagedHooksOnly` 时 /goal 静默挂起 → 显式报错 | hook 门控面 × goal 面交互显式面 |
| **性能** | goal 状态 chip 空闲时不再 5Hz 重渲染 | 空闲渲染面零重渲染（性能断言面） |
| **UI 对齐** | footer goal indicator 右对齐统一右边距 | footer 布局断言面 |

**概念成熟度判定 = 成熟**：20 版本内 12 条演化全部收敛为明确行为边界（每条可写成判据），无「上游还在变」的未定式面（2.1.295 = B 源顶，对齐区间末端）。

## 2. live 码面 12 锚点审计（@0.1.61 7ad450d）

| # | 锚点 | 上游映射 | AtlasCode 现状 | 判定 |
|---|---|---|---|---|
| 1 | **Stop hook 机制**（/goal 底座） | 2.1.173 reminder 语义 | `'Stop'` 事件在场（hookEvents.ts L17 + SDK coreSchemas L374/555 双源同步，0.1.56 先例）+ **引擎 terminal 支 stop hook 消费点已落**（loop.ts L737 `deps.hooks?.stopHooks`，E-5 S-5a preventContinuation 语义）+ TUI 执行器全家（hooks.ts Stop/StopFailure/SubagentStop） | ✅ **底座已在**（/goal = 条件化 Stop hook 的产品内建面） |
| 2 | **回合级恢复**（goal 跑动中错误恢复底座） | 演化「重试退避/暂停」 | `turnRecovery.ts` withTurnRecovery（0.1.58 退避 + 0.1.59 fallback 有序表 + 回合边界，0.1.52/53/54 三修复闭环） | ✅ 直接继承 |
| 3 | **反应式压缩**（「compact 而非 Prompt-too-long」演化项） | 2.1.2xx hook 会话 compact fix | loop.ts D1/D2 413/PTL 反应式压缩消费点（0.1.37，isReactiveCompactRecoverableError + reactiveCompact DI 槽） | ✅ 直接继承（goal 续跑面需验证不与压缩熔断冲突 = 判别项） |
| 4 | **会话持久化**（goal 状态入 jsonl + resume 恢复） | 3 条 resume/compact 持久化 fix | `engine/session/restore.ts` L150/167/176：metadata 恢复（/status 面）+ sessionFile 重指向 + mode 持久化；jsonl parseChunk（json.ts） | ✅ 挂面在场（goal 状态 = 新 metadata 字段） |
| 5 | **maxTurns / unboundedTurns 守卫**（maxGoalTurns 挂面） | goal 防不可终止 | loop.ts L547-551（unboundedTurns → MAX_SAFE_INTEGER；缺省 = DEFAULT 兜底） | ✅ 守卫模式在场（goal 续跑支加 maxGoalTurns 同模式） |
| 6 | **StatusLine + segment registry**（footer goal 指示器挂面） | 演化「footer goal indicator」 | `components/StatusLine.tsx` + **StatusLine/segments 段注册表**（segmentRegistry + densityStore + right-margin 对齐面） | ✅ 指示器 = 新段注册（registry 模式在场） |
| 7 | **token/elapsed 跟踪**（overlay panel 三要素） | 核心「live elapsed/turns/tokens」 | `cost-tracker.ts`（getTotalInputTokens/getTotalOutputTokens/getTotalAPIDuration/getTotalDuration）+ `utils/tokens.ts`（getCurrentUsage/context 百分比）+ loop `turns` 计数器 | ✅ 三要素全在场（panel = 组装面） |
| 8 | **后台任务 + 定时器**（check-in 挂面） | 演化「长后台工作 check-in」 | `src/tui/tasks/`（LocalShellTask/LocalMainSessionTask/stopTask + LocalAgentTask）+ `utils/cronScheduler.ts` + `utils/sessionActivity.ts` | ✅ 定时器 + 任务面在场（check-in = 新定时器逻辑） |
| 9 | **模型角色**（评估器 = small role judge） | ProposeGoal「separate evaluator」 | `roles.ts` ModelRole premium/fast/small + getRoleModels 池（0.1.59 有序表） | ✅ 评估器 = small 角色无 tools chat 调用（新但极薄） |
| 10 | **提示词注入面**（条件 directive reminder + check-in 提示词） | 2.1.173 + 2.1.246 两 reminder | `contextBodies/prompt.ts` + system-reminder 注入模式 + **0.1.55 提示词零码批先例**（11 提示词文件落码 + 断言单测全链走通） | ✅ 提示词落码通道已证 |
| 11 | **headless -p 面** | 核心「works in -p」 | `src/cli/print.ts` L1229 消费 queryAgentLoop（引擎路径与 TUI 共享）+ AD-45 defer 重评支（0.1.52/53/54 修复闭环） | ✅ 引擎共享 = -p 面零额外挂面 |
| 12 | **工具注册 + 审批弹窗**（ProposeGoal 新工具挂面） | 2.1.227 ProposeGoal 工具 | 工具注册框架在场（AgentTool 等 27 项 cmd 面 + 权限弹窗 AskUserQuestion 族）；**AgentTool 同步-only 残留守 = Q3 面（本波不触碰）** | ⚠️ **唯一重量级新增**（新工具 schema + ask_user 双支 + kickoff 消息面） |

**缺口面（真新增）**：goal 状态机（armed/met/cleared/paused + check-in 预算 3，新小模块）+ 评估器 judge 调用（新但极薄）+ `/goal` 命令 + overlay panel + footer chip（TUI 新，0.1.60 三命令先例 = 完整模板）+ check-in 定时器（新逻辑）+ ProposeGoal 工具（最重）。

## 3. 全面演化逐项推演（12 演化项 + 核心 → AtlasCode 落点 + 判据 + 波归）

| # | 上游项 | 行为边界 | AtlasCode 落点 | 判别判据（harness） | 波归 |
|---|---|---|---|---|---|
| C0-1 | /goal set [condition] | 设条件 → armed；one goal at a time（新设替换旧） | 新 `/goal` 命令（0.1.60 模板：parseArgs+case 注册）+ goal 状态模块 | 命令行为探针（0160 探针模式）+ 状态机单测 | 0.1.62 |
| C0-2 | 跨回合续跑（核心） | terminal 点评估器判未达成 → 阻断停止续跑；达成 → 终止 | **loop.ts terminal 支新增 goal 支**（stop hook 消费点 L737 邻位）：goal armed → evaluator（small 角色无 tools chat，条件+对话摘要）→ 未达成 = 注入续跑 system 消息（2.1.173 reminder 语义）+ 续跑；达成 = 清 goal + 终止事件；maxGoalTurns 守卫 | 判别单测（修前红→绿）+ **mock judge 活探针**（c4-mock-server 同族：canned 未达成/达成两态，零模型非定式）+ loop-rob C1/C2/C3/R3 重跑 | 0.1.62 |
| C0-3 | overlay 面板（elapsed/turns/tokens） | 活面板三要素 | cost-tracker 三 getter 组装 + 面板组件 | PTY 探针面板在场断言（tui-longtask 模式） | 0.1.62 |
| C0-4 | footer goal 指示器 | 右对齐 footer chip | StatusLine segment registry 新段 | /help 恒等 + PTY footer 断言 | 0.1.62 |
| C0-5 | headless -p | -p 模式 goal 同语义 | print.ts L1229 共享引擎（零额外挂面） | 生产 lane headless 面（stdin < /dev/null 先例） | 0.1.62 |
| C0-6 | /goal clear + 达成自清除通知 | clear = 提前清；达成 = 自清除+通知（勿提示用户 run clear，2.1.173 原文） | 命令 + 状态机 | 命令探针 + 自清除断言 | 0.1.62 |
| P1 | 持久化 + resume 恢复 | goal 入 session metadata；--resume/--continue 恢复；compact 后不丢（3 条上游 fix 合一面） | session jsonl metadata 新字段 + restore.ts 恢复支 + 压缩路径不丢验证 | **resume stage 探针（0.1.52 AD-45 先例：stage 序 + 断言面）** + compact×goal 判别单测 | 0.1.62 |
| P2 | 错误恢复（跑动中 API 错误/断流/限流） | 不静默挂起；退避或暂停+说明（含等配额恢复） | 继承 turnRecovery（0.1.58/59）；goal 面增量 = 暂停说明行 + 配额恢复后 resume | **fault-proxy 注障（既有 5 类 fault 族直接复用）** + goal 状态断言 | 0.1.63 |
| P3 | 不可恢复自清除 | auth 吊销/额度耗尽/上下文溢出 → goal cleared + 通知 | 状态机新支（错误分类面 × goal 面交叉） | fault-proxy 不可恢复类注障 + cleared 断言 | 0.1.63 |
| P4 | check-in 定时器（30min/1h/2h 退避，预算 3，+3 刷新，env 关断） | 空闲会话 goal 被长后台工作阻塞 → 自动 check-in | cronScheduler 新定时器 + check-in = 定时器触发的续跑回合（**注入 2.1.246 Autonomous loop check 提示词**）+ `ATLAS_GOAL_CHECKIN_MINUTES` env（上游 =0 关断同构，测试用短常数） | 短常数 override 定时器探针 + 退避序列断言 + 预算 3 断言 | 0.1.63 |
| P5 | 评估器时序守卫（后台 shell/subagent 运行中不提前判） | 评估器触发前 = 后台工作全终态 | 评估器调用点前置守卫（tasks 面查询） | 后台任务在场 × 评估器时序单测 | 0.1.63 |
| P6 | hook 门控交互（disableAllHooks 等 → 显式报错非挂起） | 显式消息 | goal 支 hook 门控面检查 | 门控面 × goal 单测 | 0.1.63 |
| P7 | 空闲 5Hz 性能 | goal chip 空闲零重渲染 | 渲染面 memo/节流 | 渲染调用计数断言（性能面） | 0.1.63 |
| P8 | **ProposeGoal 工具（2.1.227）** | agent 主动 propose：ask_user=true（默认，单键批准）/ false（仅用户原话明确要求）；评估器仅对话验证；≤500 字符；one goal at a time | 新工具（schema + 审批弹窗 ask_user 双支 + kickoff 消息面）+ 工具描述提示词（2.1.227 全文移植） | 工具注册面 + 审批弹窗 PTY 探针 + 工具描述断言单测（0.1.55 先例） | 0.1.63 |

**码量汇总**：0.1.62 = C0-1…C0-6 + P1 ≈ **10–14 文件 500–800 行（中–大单列波）**；0.1.63 = P2–P8 ≈ **8–12 文件 400–600 行（中大，含 1 新工具）**。

## 4. harness 成熟度盘点（判据面全部映射既有资产，零新基建）

| 既有资产 | 成熟度证据 | /goal 判据映射 |
|---|---|---|
| `c4-mock-server.py`（0.1.58） | 双模式确定性 mock（midstream RST / backoff drop-2），零 8999 竞争零模型非定式，5/5 hard 先例 | **mock judge 判据同族**：新增 judge 模式（canned「未达成+原因」/「达成」两态响应，按请求序判别）= 评估器路径活面确定性判据 |
| `harness.ts` 多步 coding 任务（R1/R3） | 任务 = 「建 3 文件 + 测试文件断言 + 输出 exactly ALL TESTS PASSED」= **goal 形任务（可验证终态，同上游 "bun test exits 0"）**；I1–I5 五不变量 + SIGKILL→--resume 断点续跑 | **goal 活面任务模板直接复用**（任务条件 = "ALL TESTS PASSED 已输出"；R3 = goal×resume 恢复面先例） |
| `fault-proxy.ts`（5 类 fault 族） | 500/drop/empty/delay/storm 全活面，0.1.58/0.1.59 双波复用 | P2/P3 错误恢复演化项注障面（goal 跑动中注障 + 不可恢复类自清除断言） |
| `tui-longtask.ts` | PTY TUI 事件路径长任务（模型无关，注障延迟确定性触发） | overlay 面板/footer 指示器 TUI 面可见性探针 |
| `tui-small-wave-0160.ts`（0.1.60） | 3 命令行为探针（gate 8/8 ↔ 基线 7红+1INC 双面闭环） | /goal 命令行为探针模板（set/clear/status + 非法条件报错面） |
| `accept.ts` P0a/A4F | `--release-gate` 7 场景 + result.json.releasable（fail-closed 支柱③载体） | 发布门禁同族（`--release-gate 0.1.62/0.1.63`） |
| loop-rob C1/C2/C3/R3 | 0.1.17 收口链 + 0.1.58/0.1.59 双波重跑先例 | **引擎回合边界触碰面回归重跑（goal 续跑支引入后必跑）** |
| 四件套 + CI 顶层 CI=1 | 0.1.58 起固化口径（不扫 worktrees/） | 同 |

**结论 = harness 成熟、零新基建**：唯一新增 = c4-mock-server 加 judge 模式（canned 两态响应，~40 行 Python，同文件同族扩展）。

## 5. 系统提示词 / 提示词工程内容（3 资产全文在场，可直接移植）

| 资产（源 A） | 内容要点 | AtlasCode 落点 |
|---|---|---|
| **Session stop hook active（2.1.173）** | 条件 directive 语义：「treat the condition itself as your directive and do not pause to ask the user what to do」+ hook 阻断停止 + 达成自动清除（**勿提示用户 run /goal clear after success**） | goal 续跑支注入的 system 消息（模板化，条件 = goal 条件变量） |
| **Autonomous loop check（2.1.246）** | 定时器 check-in 调用提示词全文：steward-not-initiator 张力 + 三层行动面（会话内未完工 > PR 维护 > 分支扫查）+ repeated invocations 收敛（3 次 no-op 降级） | P4 check-in 定时器触发的回合注入（**P4 的提示词主体 = 本文**） |
| **ProposeGoal 工具描述（2.1.227）** | ask_user 双支语义 + 「仅用户原话明确要求时 ask_user=false」+ 评估器仅对话验证 + ≤500 字符 + one goal at a time | P8 工具描述（0.1.55 提示词零码批先例 = 落码 + 断言单测通道已证） |

**移植适配面**（国产化）：上游文案内 1P 引用（claude.ai/Remote Control 等）裁除；命令名/环境变量名换 ATLAS_ 前缀（env 名 Main 定，0.1.46 先例）；模型族引用不出现（BR-8 标准：无字面+号）。

## 6. 成熟度裁定（全局特性列表）

| # | 裁定项 | 状态 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|---|
| 1 | 概念成熟度（上游演化收敛） | 满足 | — | 12 条演化条目全收敛为可验收行为边界（§1 表）；对齐区间末端 2.1.295 无未定式面 | 源 B 全量 grep + 条目归类 |
| 2 | 码面锚定（12 锚点） | 满足（11✅ + 1⚠️） | ProposeGoal 新工具 = 唯一重量级新增 | ⚠️ 面归 0.1.63 演化批（与 P2–P7 拆离），0.1.62 核心波 = 11 锚点全在场面 | §2 逐锚点 grep/Read 证据 |
| 3 | harness 成熟度 | 满足 | 零新基建 | 8 项既有资产全映射（§4）；唯一增量 = c4-mock-server judge 模式 ~40 行 | 资产×判据映射表 |
| 4 | 提示词工程面 | 满足 | 3 资产全文在场 | 直接移植 + 国产适配裁面（§5）；落码通道 = 0.1.55 先例 | 源 A 全文 × 0.1.55 先例 |
| 5 | **全面演化方案 = 成熟，可落地** | **满足** | — | **建议拆两波**：0.1.62 = 核心+持久化（C0 全 + P1，10–14 文件，功能闭环可独立使用）；0.1.63 = 演化批（P2–P8，含 ProposeGoal 新工具 + check-in 定时器 + 错误恢复/自清除/时序守卫/性能）；**终态 = 全面演化对齐（12 演化项全落）** | §3 逐项波归 + 大波打回半径（0.1.52/53/54 三连打回实证）+ gate fail-closed 独立 |
| 6 | 风险面 | 条件满足 | 引擎回合边界改动 = 最高风险 | 零回归约束 = 无 goal 面字节级恒等（工单 §1 固化）+ 三重 gate（判别单测红→绿 / loop-rob 重跑 / A4F）；评估器非定式 = mock judge 承载判别力（活面真 judge 仅生产观察面）；check-in 实时常数 = env 短常数 override | §3/§4 判据映射 |

## 7. 落地策略对比（两波 vs 单大波）

| 维度 | 两波（建议） | 单大波（全面演化一波） |
|---|---|---|
| 终态 | 相同（12 演化项全落） | 相同 |
| 波量 | 0.1.62 ≈10–14 文件 / 0.1.63 ≈8–12 文件 | ≈20–26 文件 |
| gate 时长 | 各自 ~半天–1 天（既有先例） | check-in 定时器 + ProposeGoal 弹窗 PTY + 性能断言同 gate，放大 |
| 打回半径 | 单波打回 = 单切片（0.1.62 核心不阻 0.1.63 排程，反之亦然） | 大波打回 = 全演化面重走（AD-45 先例 0.1.52/53/54 三连打回实证风险） |
| 用户价值到达 | **0.1.62 收口即核心可用**（goal set/clear/续跑/持久化/resume） | 全量一次到 |
| Q3 关系 | 0.1.63 收口后 Q3 独占波启动（池末位不变，界① 门不变） | 同 |
| **f4 建议** | **两波** | 可执行但需接受放大风险 |

## 8. 风险与缓解（Top 5）

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| 引擎 terminal 支改动破零回归（无 goal 面行为漂移） | 中/高 | 零回归恒等约束入工单 §1；判别单测守卫项（无 goal 恒等绿）；loop-rob C1/C2/C3/R3 重跑；A4F 7 场景 |
| 评估器 LLM judge 误判（提前判达成/永不达成 → 无限续跑或提前停） | 中/中 | maxGoalTurns 硬守卫（loop.ts 既有 maxTurns 同模式）+ 不可恢复自清除（P3）+ **gate 判别力 = mock judge（零模型依赖）**，活面真 judge 仅生产观察面 |
| goal×压缩交互（续跑中 413/PTL 反应式压缩 × goal 状态） | 中/中 | P1 持久化面含「compact 后 goal 不丢」判别（上游同 fix 面）+ 判别单测 compact×goal 矩阵 |
| check-in 定时器长常数不可测 | 低/中 | `ATLAS_GOAL_CHECKIN_MINUTES` env 短常数 override（上游 =0 关断同构）；测试用秒级 |
| ProposeGoal ask_user=false 误用（agent 擅自设 goal） | 中/中 | 工具描述提示词硬约束（「ONLY when the user's own words stated this outcome」）+ 判别断言单测 + 审批弹窗默认 ask_user=true |

## 9. 决策点（交用户裁定）

1. **波拆**：两波（0.1.62 核心+持久化 / 0.1.63 演化批，f4 建议）vs 单大波（全面演化一波）
2. **启动门口径**：0.1.62 按标准 lane 直接启动（中–大单列波，同 0.1.61 口径）vs 按 AD-45 大波先例走界①（若选单大波 = 建议界①）
3. **Q3 顺序确认**：/goal 两波（或单波）收口后 = ④ SDK 零码件（可并演化批或留登记）→ **Q3 subagent 独占波池末位（界① 门不变）**

## 10. 裁定记录（2026-10-13 用户）

- **用户裁定 =「好的，可以实施了」（2026-10-13）→ 按 f4 建议执行**：
  1. **波拆 = 两波**（0.1.62 = 核心+持久化 C0-1…C0-6+P1 / 0.1.63 = 演化批 P2–P8；单大波不采用）
  2. **启动门口径 = 0.1.62 标准三 lane 直接启动**（用户直接授权 = 最强启动形态，0.1.60 kickoff 先例同族）
  3. **Q3 顺序 = 确认**（/goal 两波收口后 ④ SDK 零码件可并 0.1.63 → Q3 subagent 独占波池末位，界① 门不变）
- **落盘**：工单 `docs/2026-10-13-p0-wave-0162-ticket.md`（7 项 = C0×6 + P1，10–14 文件 500–800 行；/help 54→55 + cmd 32→33〔+goal〕；mock judge 承载 gate 判别力；loop-rob C1/C2/C3/R3 重跑必做）+ 双信号（Main 落码+发布链 / e2e gate 判据预审）。