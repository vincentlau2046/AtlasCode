# W-D 推进：多 session 分组协作（组创建 + 角色分配 + 组内消息）方案调研 — 2026-11-07 f4

- 触发：用户 2026-11-07「W-D 需要考虑，希望更进一步：多 session 的分组统一创建能力 + 角色分配 + 组内较好的 message 交互能力；搜索 GitHub 优秀实践，方案可吸收或 copy」
- 性质：零码调研；落码归 Main；测试侧判据归 e2e（既有角色边界）
- 关联底稿：`docs/2026-10-09-cross-session-uds-research.md`（点对点 UDS F1–F11 盘点 + D1–D5 材料底座）

## 1. 需求定义（用户原语拆解）

| 需求原语 | 含义 |
|---|---|
| 分组统一创建 | 一次操作拉起一个多成员协作组（lead + 若干角色化成员），而非逐个手工起 session |
| 角色分配 | 成员有具名角色（规划/实施/测试…），角色决定 prompt/职责/权限 |
| 组内 message 交互 | 成员间可直接互发消息（非全部经用户中转），有排队/唤醒/收尾语义 |

## 2. 本仓现状盘点（全局特性列表，@ 418fe844 实查）

| # | 特性 | 状态 | 证据 |
|---|---|---|---|
| T1 | team 工具族 | **满足·门控** | `engine/tools/team/`：teamCreateTool 296L + teamDeleteTool 191L + sendMessageTool 941L + snipTool 149L + teamServices 153L；isEnabled = `isAgentSwarmsEnabled`（`ATLAS_EXPERIMENTAL_AGENT_TEAMS` env ∨ `--agent-teams` flag，toolRegistry.ts:66-67） |
| T2 | mailbox/队列面 | **满足·实码** | `engine/messaging/`：mailbox.ts 1281L + queueManager.ts 535L + queueTypes 178L + directMemberMessage/lockfile/agentId/collapseTeammateShutdowns（0.1.36 硬化波出品） |
| T3 | teammate 生命周期 | **满足·逐字迁移** | teammate.ts 313L（旧仓 L195-293 算法体逐字 + task 域适配）+ teammateContext 103L |
| T4 | 共享任务列表 | **满足·实码** | `engine/tasks/tasks.ts` 971L（TaskAppState/SetAppState） |
| T5 | 持久化 | **缺口** | teamServices.ts:18「全量面归 TUI 波 → 本模块**内存缺省 store**（真实闭包单元非 stub）」——组/成员态 crash 即失 |
| T6 | 跨 session（UDS inbox） | **缺口·stub** | 10-09 底稿 F6/F7/F8/F9/F10：UDS 服务器/客户端/ListPeers/收侧 enqueue/TUI 渲染组件全 stub 或缺 |
| T7 | TUI 组管理呈现面 | **缺口** | teamServices 注明「全量面归 TUI 波」未落 |
| T8 | 组创建→成员 spawn 链 | **待核** | teamCreateTool 在位，但成员 spawn（in-process activation vs 独立 session 进程）链路真伪待锁面直证 |

**判定：本需求 ≈ 非从零建**——6220L 骨架在位（门控实验态），缺口集中在 T5 持久化 / T6 跨 session / T7 TUI 呈现 / T8 spawn 链。

## 3. GitHub 优秀实践横评

### 3.1 上游 Claude Code agent teams（★ 首选吸收源，2.1.319 官方发布）

- **发布**：v2.1.319（2026-03 前后）官方 agent teams——lead 拉起并协调多个 teammates 作为后台任务；核心工具 = TeamCreate / AgentCreate / SendMessage / TaskCreate / TaskUpdate / TaskList / TaskGet；**共享任务列表 = 协作主干**；成员经消息队列通信 + idle wakeup 唤醒 + graceful shutdown（不发 kill）。
- **官方面**：`/agent-teams` 命令、`CLAUDE_CODE_ENABLE_AGENT_TEAMS=1`、`teammateMode` settings、session 名持久化；CLI = `/team` `/teammate` `/teammates` `/messages`；SDK 工具面 = TeamCreate/SendMessage/Task 族。
- **battle-tested 模式**（官方内用沉淀）：lead 只做读库/拆解/写 spec/分派/验收；每成员 scope 窄 + 显式验收判据；subagent 保主上下文（干粗活回摘要）；reviewer 成员验另一成员产出；CLAUDE.md 给全员共享约定。
- **对本仓意义**：AtlasCode 对齐哲学 = 跟上游（对齐区间 2.1.89→2.1.303 已闭环，**agent teams 落在 2.1.319 = 卷 4 drift 区间**——本次需求与卷 4 分析天然合流）。且**本仓 team 骨架本就是旧仓同源逐字迁移**（teammate.ts 注释自证），补齐对齐 = 成本最低路径。**活参照 = 本协作本身**：本会话即运行于 agent teams 语义中（Main/f4/e2e 跨 session SendMessage + UDS socket + 任务工具），行为面可插桩直证。

### 3.2 AutoGen（Microsoft，~40k★）——组内路由/终止语义最丰富

- **Team 三型**：RoundRobinGroupChat（环序轮流，全员广播）/ SelectorGroupChat（**LLM selector 动态选下一发言者**，可配 selector_prompt + allow_repeated_speaker + candidate_func）/ MagenticOneGroupChat（orchestrator 持 **Task Ledger + Progress Ledger** 规划-执行-反思循环，`max_stalls` 3 次重复失败即重规划/停——对策打转）。
- **终止条件可组合**：MaxMessage / TextMention / TokenUsage / Timeout / StopMessage / Handoff / External × `|`(OR) `&`(AND) 组合；终止后 StopMessage + team 可 reset/restart/pause。
- **v0.4+ 架构**：事件驱动 actor 模型（agent identity + subscriptions + 显式 message types）——消息订阅语义对本仓 queueManager 有直接借鉴。
- **吸收点**：① 终止条件组合词汇；② Magentic-One stall 计数（与 0.1.90 G-1 连击守同族思想，组面可复用）；③ Selector 式路由 = lead 分派的候选模式（但本仓倾向 lead 显式分派，与上游 battle-tested 一致）。

### 3.3 CrewAI（~30k★）——角色定义词汇最简洁

- **角色三元组**：`role / goal / backstory` 显式字段塑造成员行为；**hierarchical process** = 自动 manager agent 只做分派/验证/重分派不干活；`allow_delegation` 门（默认 False）。
- **吸收点**：role/goal/backstory 三元组 = AtlasCode teammate prompt 模板面的现成词汇（映射到 teamCreateTool 的成员定义参数）；manager 不执行只协调 = 本仓 Main/f4/e2e 分工同构。

### 3.4 claude-flow（ruvnet，Claude Code 社区最活跃编排层）

- swarm 编排 + 共享记忆（SQLite/JSON 记忆层）+ GitHub Projects v2 作跨 agent 任务板；Agent Teams wiki：shared goals + coordinated task distribution + 层级/swarm/workflow 三模式。
- **吸收点**：共享记忆层设计（本仓 tasks.ts 971L 已是同 backbone）；跨 agent 任务板 = 共享任务列表的外化形态。风险面：社区项目工程纪律不及本仓 gate 体系，只吸收语义不 vendor。

### 3.5 其他

- **Magentic-One 论文**（arXiv:2411.04468）：Task Ledger（已知事实/推测/任务清单）+ Progress Ledger（进度/自问/stall 计数）双账本内循环——组 lead 的规划面参考。
- **Anthropic 多 agent 研究系统博文**：orchestrator-worker + 子代理摘要回收 + 多 agent 耗 token ~15×（成本面警惕：组面判据须含 token 预算锚）。

## 4. 吸收结论 → AtlasCode 方案（推荐主路线）

**主路线 = 补齐对齐上游 agent teams（2.1.319 语义），非自建框架**。理由：① 本仓骨架同源（旧仓逐字迁移），补齐成本远低于引入 AutoGen/CrewAI 形态重写；② 对齐哲学一致且与卷 4 合流；③ 活参照（本协作本身）可插桩直证；④ 外部框架只吸收三个语义点（§4.2）。

### 4.1 分波建议（W-D 落地路线，工单化前呈用户敲定）

| 波 | 内容 | 前提 |
|---|---|---|
| **W-D-1（候选 0.1.91+）组内最小闭环** | TeamCreate 角色化成员（role/goal/backstory → prompt 模板）+ 组内 SendMessage（mailbox/queueManager 活面）+ 共享任务列表协作 + lead 分派/验收循环 + T8 spawn 链真伪锁面直证先行 + graceful shutdown | 骨架已在，激活门 + 补缺口；in-process teammates 为主 |
| **W-D-2 跨 session + 持久化** | UDS inbox 本体落码（10-09 底稿 §5 A1–A5：服务器/客户端/ListPeers/enqueue/TUI 渲染）+ team/成员态 durable store（T5）+ TUI 组管理呈现（T7） | W-D-1 闭环后 |
| **合流点** | S-2 durable continuable children（DSH 研读中期件）与 W-D-2 同域——durable 组成员 = continuable child 语义面，届时并波评估 | — |

### 4.2 外部框架三吸收点（不 vendor，语义引入）

1. **终止条件组合词汇**（AutoGen）：W-D-1 组运行面配 max-turns/文本确认/外部终止 + OR/AND 组合——判据化易 gate。
2. **stall 计数**（Magentic-One）：组级打转对策，与 G-1 连击守同族，可复用其阈值/注入机制。
3. **role/goal/backstory 三元组**（CrewAI）：成员定义参数词汇，落 teamCreateTool prompt 模板。

### 4.3 风险面（预先登记）

- **token 成本**：多 agent ~15×（Anthropic 实测）——组面判据须含 token 预算锚 + 成员摘要回收纪律。
- **权限边界**：组内成员权限 = 继承 lead 或独立 seeded 面，须 fail-closed（不放大权限；跨 session 消息 = 纯文本禁结构化，10-09 底稿语义 3 沿用）。
- **门控纪律**：`ATLAS_EXPERIMENTAL_AGENT_TEAMS` 默认 OFF 维持至 gate 闭环（C7 同型先例）。
- **上游对齐面**：2.1.319 具体工具契约（TeamCreate 参数/消息格式）须卷 4 插桩直证后锁面，不得凭搜索摘要落码。

## 5. 待用户裁定

| # | 裁定点 | f4 建议 |
|---|---|---|
| 1 | 主路线确认：对齐上游 agent teams（推荐） vs 引入外部框架形态 | **对齐上游**（§4 理由） |
| 2 | 范围：W-D-1 in-process 先行 vs 直接上跨 session | **W-D-1 先行**（跨 session 依赖 UDS 本体 + durable store，体量翻倍） |
| 3 | 排期：W-D-1 插入 0.1.91 vs W-opt 候补池排后 | 建议 **0.1.91 = W-opt 候补池 compaction 续件**（C-1/C-3/C-6 已排队）+ **W-D-1 = 0.1.92**（用户本指令已激活 W-D，排次波）——或按用户意向调整 |

## 6. 来源

- [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow) · [Agent Teams wiki](https://github.com/ruvnet/claude-flow/wiki/Agent-Teams) · [Swarm Orchestration wiki](https://github.com/ruvnet/claude-flow/wiki/Swarm-Orchestration)
- [AutoGen Teams 文档](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html) · [SelectorGroupChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html) · [Magentic-One arXiv:2411.04468](https://arxiv.org/abs/2411.04468)
- [CrewAI Processes 文档](https://docs.crewai.com/concepts/processes)
- Claude Code agent teams 官方：[docs.claude.com/en/docs/claude-code/agent-teams](https://docs.claude.com/en/docs/claude-code/agent-teams)（CLI/SDK/battle-test 三子页）
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
