# Q3 subagent 独占波（0.1.61+ 波池末位）· 决策前分析卡（f4 规划面）

> **2026-10-14 f4 出卡**（用户裁定「Q3 详细分析核心诉求 + 会增加什么功能」= 界① 决策前输入；Q3 已裁 2026-10-13 = 排到最后版本作为独立波（池末位独占，不与他波混载，AD-45 先例 = 大波需用户界①，Main 不放宽启动门））。
> **PAC 依据**：`docs/2026-10-12-p0-pac-0155.md` V2-10（C3-1 subagent background-by-default，★★ 大·独占波）+ §3 C3 簇（C3-1…C3-6）+ `docs/2026-10-10-p0-pac-0148.md` C3 面。
> **live 锚定**（@0.1.63 c6c947d，grep/Read 只核 2026-10-14）：TUI 侧 `src/tui/tools/AgentTool/`（run_in_background 参数 L45 + isAsync 支 L160 + runAgent isAsync 异步执行 + finalizeAgentTool）+ 任务面板 `src/tui/tasks/LocalAgentTask/LocalAgentTask.tsx` 696 行（running/completed/failed + 进度 + failed: 通知构造 L252 + completeAgentTask L425）+ **组合根通知链已接线**（`src/atlascode/compose.ts` ⑪ S-E2 A9 L305：`setTaskNotificationHandler` → `enqueuePendingNotification` messaging 真队列）+ 引擎侧 `src/engine/tools/agent/AgentTool.ts` L17 **同步-only 残留守**（「本版仅同步路径，input schema 去掉 run_in_background」）+ `runAgent.ts` L26 异步生命周期残留守（∅）+ fork `forkSubagent.ts`（feature-gated 默认关）。

## 0. 执行摘要

| 裁定项 | 结论 | 一句话依据 |
|---|---|---|
| **核心诉求** | **编排主诉（PAC D7 = ★★）= 同步-only 委派阻塞主循环 → 异步并行编排** | 上游 CC 2.1.198 大转向：「Subagents now run in the background by default, so Claude keeps working while they run and is notified when they finish」；AtlasCode 现况 = TUI 侧异步路径已在场但**引擎侧（headless/-p/SDK）同步-only + 默认前景 + needs-input 信号 ∅** |
| **地基成色** | 比 PAC 旧锚点显示的**更完整**（锚点滞后） | TUI 异步支 + 任务状态机 + 组合根通知链（messaging 真队列）全在场 → **真缺口 = 引擎侧异步原语 + 默认语义 + 信号面 + 提示词批**，非「后台任务框架从零建」 |
| **波量** | 中–大独占波（12–20 文件 600–1200 行估） | 主落码面 = 引擎侧异步原语（新）+ 默认语义翻转（行为变更）+ needs-input 信号；提示词批 = 零码（0.1.55 先例） |
| **最高风险** | **Q3-2 background-by-default 语义翻转**（现默认前景同步 → 默认后台） | 既有 AgentTool 调用路径单测/探针需重锚 = 有意语义变更面（工单 §1 显式声明 + 双面探针）；**保守替代 = 不翻默认只开后台路径**（界① 裁定点 a） |

## 1. 核心诉求（解决什么问题）

**现状**：AtlasCode 子代理委派 = **同步阻塞为主**——主 agent 委托子代理后主循环等待其完成才推进（TUI 侧有 `run_in_background` 参数可显式后台，但**默认 = 前景同步**；headless/-p/SDK 侧 AgentTool **仅同步路径**（残留守 L17），无后台委派）。

**上游对标（2.1.198 大转向原文）**：
> "Subagents now run in the background by default, so **Claude keeps working while they run and is notified when they finish** (previously a gradual rollout)"
> "Added background agent notifications in `claude agents` — sessions that **need input** or **finish** now fire the `Notification` hook (`agent_needs_input` / `agent_completed`)"

**本波价值链（用户得到什么）**：
1. **主 agent 并行编排**：委派长任务（跑测试套/多文件重构/深度搜索）→ 主循环立即空闲继续其他工作/响应用户 → 完成时 `<task-notification>` 注入下回合续接（prompt.ts:259 既有承诺「you will be automatically notified when it completes — do NOT sleep, poll」= **本波把该承诺在引擎侧/信号面真正做实**）。
2. **用户体验**：长子代理不再阻塞交互会话（任务面板看进度、可逐个停止——面板/stopTask 已在场）。
3. **已落波挂面回收**：/goal 0.1.63 P5 评估器时序守卫边界声明 =「LocalShellTask 族，**subagent 时序面归 Q3 波**」→ 本波回收（评估器不在后台 subagent 仍运行时提前触发）。
4. **编排主诉对齐**：与 0.1.62/0.1.63 /goal 全面演化协同 = 长任务（goal）× 并行编排（subagent 后台）= 上游 2.1.198→2.1.295 编排面终态。

## 2. 现状盘点（地基 vs 缺口，@0.1.63 c6c947d）

| 面 | 现状（live 取证） | 判定 |
|---|---|---|
| TUI 侧 AgentTool 异步路径 | `run_in_background` 参数（inputSchema L45）+ `isAsync` 支（L160）+ `runAgent` isAsync 异步生成器 + `finalizeAgentTool`（isAsync:true）+ `resumeAgent.ts`（resume 面） | ✅ 在场 |
| 任务状态机 + 面板 | `LocalAgentTask.tsx` 696 行：running/completed/failed 状态 + 进度追踪 + `failed:` 通知构造（L252）+ `completeAgentTask`（L425）+ evict/retain | ✅ 在场 |
| 通知投递链 | task-notification 注入窗口（S-7a，`engine/coordinator/tasks/notification.ts`）+ **组合根 ⑪ 已接线**（compose.ts L305 → `enqueuePendingNotification` messaging 真队列；`shell`/`swarm` 定向投递 agentId 路由 = 前向接缝字段已在） | ✅ 已接线（S-E2 A9） |
| swarm teammate 基建 | `src/swarm/` in-process teammate（spawn/permission bridge/poller/reconnection） | ✅ 在场 |
| fork 机制 | `forkSubagent.ts`（FORK_AGENT + buildForkedMessages，feature-gated **默认关**） | ✅ 在场（默认关 = C3-3 翻转面） |
| AgentTool 提示词 | `prompt.ts` L259-260 前景/后台选择指导在场（「Use foreground (default) when… Use background when… parallel」） | ✅ 在场（但默认 = 前景） |
| **引擎侧 AgentTool（headless/-p/SDK）** | **同步-only 残留守**（`engine/tools/agent/AgentTool.ts` L17「本版仅同步路径，input schema 去掉 run_in_background」+ `runAgent.ts` L26 异步生命周期 ∅） | ❌ **核心缺口**（PAC D1 锚点 = 本件） |
| **background-by-default 默认语义** | 现默认 = 前景同步（prompt.ts:260「foreground (default)」）；上游 2.1.198 = 默认后台 | ❌ 2.1.198 翻转面（有意语义变更） |
| **needs input 信号**（agent_needs_input） | `failed:` 信号在场（LocalAgentTask L252）；后台子代理**提问/请求权限 → needs input** 面 ∅ | ❌ 2.1.198 信号面缺口 |
| **C3-4 委派纪律提示词批** | contextBodies 委派指导 ∅（grep 已核）+「do NOT predict 未完成结果」（2.1.211 async 启动元数据）∅ + 成本感知委派（2.1.271 小任务已知目标倾向 inline）∅ | ❌ 零码缺口（0.1.55 先例通道） |
| **C3-3 fork-by-default**（2.1.232） | FORK 默认关（feature-gated） | ☆ 小（默认翻转 + 提示词，可选项） |
| /goal P5 时序守卫 subagent 面 | 0.1.63 `hasPendingBackgroundTasks`（LocalShellTask 族）已落；subagent 终态守卫 = 本波回收 | ❌ 挂面（本波回收项） |

**结论**：地基（任务框架/状态机/通知链/swarm/fork）= 0.1.4x–0.1.5x 波次已铺好（PAC D3「后台任务框架 0.1.4x 已在场，agent 侧接线」）；**本波 = agent 侧接线 + 引擎侧原语 + 语义/信号/提示词收口**，非从零建。

## 3. 会增加的功能（逐项，含上游源 + 落点 + 码/零码）

| # | 功能 | 上游源 | 落码面 | 码量 | 性质 |
|---|---|---|---|---|---|
| **Q3-1** | **引擎侧异步 agent 原语**（headless/-p/SDK 后台子代理）：engine AgentTool input schema 加 `run_in_background` + 异步生命周期（引擎版 runAsyncAgentLifecycle）+ 完成/失败通知（复用既有通知链 compose ⑪） | 2.1.198 + 2.1.128 信号模型 | `src/engine/tools/agent/`（AgentTool/runAgent/agentToolUtils 引擎版）+ 通知面接线 | 中（主落码面） | 新原语（残留守核销） |
| **Q3-2** | **background-by-default 默认语义翻转**（2.1.198：默认后台 + 主循环续跑 + 完成通知）；**保守替代 = 不翻默认只开后台路径**（界① 裁定点 a） | 2.1.198 | AgentTool 默认支 + prompt.ts 默认语义句 + 既有单测/探针重锚 | 小（但行为变更面） | ★ 最高风险面（有意语义变更） |
| **Q3-3** | **needs input 信号**（agent_needs_input：后台子代理提问/请求权限 → 信号 + 通知；swarm permissionPoller/leaderPermissionBridge 挂面） | 2.1.198（agent_needs_input/agent_completed 双信号） | 任务状态机 needs_input 态 + 通知构造 + 权限面接线 | 中 | 新信号面 |
| **Q3-4** | **C3-4 委派纪律提示词批（零码，0.1.55 先例）**：成本感知委派（2.1.271「小任务已知目标倾向 inline」）+ usage notes（2.1.240 何时委派/fork/resume/worktree/并行/上下文限制）+ async 启动元数据（2.1.211「do NOT predict 未完成结果」） | 2.1.240/2.1.271/2.1.211 | contextBodies 委派指导（新提示词文件 + 断言单测锁文本，BR-8 + 1P 裁面） | 零码 | 提示词批 |
| **Q3-5** | **/goal P5 时序守卫回收**：`hasPendingBackgroundTasks` 扩展 = 后台 subagent 终态守卫（评估器不在后台 subagent 运行时提前触发；0.1.63 P5 边界声明回收面） | 上游「evaluator 后台工作运行中提前触发」fix 族 | `engine/goal` P5 守卫面扩展（0.1.63 既有 `hasPendingBackgroundTasks` 调用面） | 小 | 已落波挂面回收 |
| **Q3-6**（可选） | **C3-3 fork-by-default**（2.1.232：FORK 默认翻转 + 提示词） | 2.1.232 | forkSubagent 默认翻转 + 提示词 | 小 ☆ | 可选项 |
| **Q3-7**（可选） | **④ SDK `unstable_v2_resumeSession` 零码件（Q5）**verify 面并入（subagent resume 相关面，TUI resumeAgent.ts 已在场） | Q5 登记 | 既有 resume 链路在场断言 | 零码 | 可并/留登记（Main 裁量） |

**码量汇总**：Q3-1…Q3-5 核心 = **12–20 文件 600–1200 行**（引擎侧异步原语为主体 + 语义翻转 + needs-input；Q3-4 零码 + Q3-5 小）= **AD-45 类独占中–大波**（PAC D6 = 大，独占波先例）。

## 4. gate 判据面（PAC D4 + 既有先例）

- **三段 PTY 活探针（本波新活面，触发后起稿）**：后台 agent 启动 → 完成通知注入（`<task-notification>` 下回合在场）→ 续接（主循环拿到结果推进）= PAC D4 原样。
- **双面探针（Q3-2 语义面）**：后台开/关两态行为断言（on = 主循环不阻塞 + 通知在场；off = 同步行为字节级恒等）+ 既有 AgentTool 调用路径单测重锚（修前红→绿 = 语义翻转判别）。
- **needs input 探针**：后台子代理请求权限 → needs input 信号在场断言。
- **loop-rob C1/C2/C3/R3 重跑**（引擎主循环触碰面，0.1.58–0.1.63 先例延续）+ /help 55 + cmd 33 恒等（**无新 slash 命令**，本波 = 工具/默认语义/提示词面）+ P0a/A4F `--release-gate` + 四件套 + SRI。
- **零回归**：非后台路径（同步委派）行为恒等 + 前波 7 波特性面精确同值（0.1.56–0.1.63 累积基线，含 /goal 12 演化项面）。

## 5. 风险面（Top 4）

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| **Q3-2 默认语义翻转破既有行为**（同步委派单测/探针/用户预期） | 中/高 | 工单 §1「有意语义变更」显式声明 + 双面探针（翻转前后两态）+ 保守替代选项（不翻默认只开后台路径 = 界① 裁定点 a） |
| 引擎侧异步原语（headless 主循环新面） | 中/中 | 复用既有通知链（compose ⑪ 已接线）+ 判别单测红→绿 + loop-rob 重跑（0.1.62 goal terminal 支同族先例降概率） |
| needs input × 权限弹窗交互（swarm permission 面） | 中/中 | 权限面既有（permissionPoller/leaderPermissionBridge 在场）= 接线非新建；判别单测承载 |
| 波量 = 独占大波打回半径 | 低–中/中 | AD-45 先例（0.1.52/53/54 三连打回后二次修复闭环）= 大波可闭环实证；gate fail-closed 不变 |

## 6. 界① 裁定点（交用户）

1. **裁定点 a（scope 核心）= Q3-2 background-by-default**：
   - **a1 翻默认**（对齐上游 2.1.198 终态：默认后台 + 主循环续跑 + 完成通知；行为语义变更，既有同步预期重锚）
   - **a2 保守**（不翻默认，只把后台路径 + 引擎侧原语 + 信号面做实；默认仍前景同步，用户显式 `run_in_background` 才后台 = 零既有行为变更，风险最低）
2. **裁定点 b（可选件）**：Q3-6 fork-by-default（☆ 小）入/不入 + Q3-7 ④ SDK 零码件并入 verify 面/留登记。
3. **裁定点 c（启动门）**：本 sign-off = Q3 独占波启动（AD-45 先例大波界①；波量 12–20 文件 600–1200 行中–大独占波）。

## 7. 裁定记录（2026-10-14 用户）

- **裁定点 a = ✅ a1 翻默认**（用户 2026-10-14：「Q3-2 翻默认后的方案会更合理，不影响主 session 需要继续做别的事或者等 subagent 结果，根据实际情况走」→ 对齐上游 2.1.198 终态：委派默认后台 + 主循环不阻塞 + 完成时 `<task-notification>` 注入续接；**澄清 = 后台 ≠ 不可见**（监控面两条通道恒在场：任务面板 LocalAgentTask 进度/状态/逐个停止 + 完成/失败通知，变化仅 = 子代理实时进度从内联流改独立轨道 + 面板/通知））。
- **f4 波次建议（待用户最终拍板）= 两波**（沿 /goal 0.1.62/0.63 同款拆法，风险隔离）：
  - **0.1.64 = Q3 地基波**：Q3-1 引擎侧异步原语（residual 核销）+ Q3-3 needs-input 信号 + Q3-5 /goal P5 时序守卫回收 + Q3-4 委派纪律提示词批（零码）；**默认仍前景（后台 = opt-in），零既有行为变更**。
  - **0.1.65 = Q3 默认翻转波（a1）**：Q3-2 翻默认（TUI+引擎侧默认后台 + 主循环续跑 + 完成通知）+ 既有同步单测/探针重锚 + 可选并入 Q3-6 fork-by-default / Q3-7 ④ SDK 零码 verify；**独立成波 = 有意语义变更面隔离，打回半径小**。
  - **拆两波依据**：① 风险隔离（翻默认 = 全波最高风险面，不与新原语混 gate，AD-45 三连打回教训）② 依赖顺序（引擎侧翻默认依赖 Q3-1 原语先在）③ 中间态自洽（0.1.64 = 后台 opt-in 可用，独立可发布）④ 独占波裁定合规（两波均池末位·均只装 Q3·不与他波混载）。
  - **单波替代**：Q3 全量（Q3-1…Q3-5 含 a1）一个 AD-45 类独占大波（gate 面放大 + 打回半径大，可接受但 churn 高）。
- **★ 终裁（2026-10-14 用户三项拍板，f4 记录）**：
  1. **波次 = 两波确认**（0.1.65 地基 / 0.1.66 翻转，§8 方案生效）
  2. **0.1.66 可选件 = 不合入，保持干净**（Q3-6 fork-by-default + Q3-7 ④ SDK 零码件均留登记，不入 0.1.66 scope）
  3. **逃生舱 env = 加**（`ATLAS_AGENT_DEFAULT_FOREGROUND=1` 回退前景默认，0.1.66 落码面，0.1.63 ATLAS_GOAL_CHECKIN_MINUTES 同构先例）
  → **f4 出 0.1.65 工单 `docs/2026-10-14-p0-wave-0165-ticket.md`（4 件 Q3-1/Q3-3/Q3-4/Q3-5，8–14 文件，零行为变更）+ 双信号**；0.1.66 工单 = 0.1.65 五段终态后出单（scope 已定 = Q3-2 a1 翻默认 + 逃生舱 env + 重锚清单，无可选件）。

## 8. ★ 版本重排 + 两波详细方案（2026-10-14 用户订正：0.1.64 已被临时 PR 波占用）

### 8.1 版本事实核（@2026-10-14）

- **0.1.64 = 临时双 PR 合一波已占用**（用户 10-13 晚 22:18 提交）：`c9c3133` feat(spinner+modelprovider) 慢模型流式显示对齐（G1 TTFT 状态指示 + G2 stall 守卫 + G3 省略号）+ 去 IFF 硬编码（describeEndpointFailure 复合三路分类 + gatewayUnreachableRemediationHint 参数化，IFF 字面量移除）→ release **26d989e** + tag v0.1.64 + npm live 0.1.64（工单 `docs/2026-10-13-p0-wave-0164-ticket.md` + gate `r-20261013-gate-064.md` + 生产 lane `r-20261014-prodlane-064.md` 全五段在场）。
- **→ 版本重排**：**0.1.65 = Q3 地基波 / 0.1.66 = Q3 默认翻转波**（两波均 = 0.1.61+ 波池末位 Q3 独占波，不与他波混载裁定不变）。
- **基线链**：0.1.65 落码基线 = **26d989e（v0.1.64，master HEAD，无在途波）**；0.1.66 落码基线 = 0.1.65 release。
- **零回归基线延长**：前波特性面精确同值清单 **0.1.56–0.1.63（既有 7 波累积）→ +0.1.64**（spinner-gates 面 computeStallState/wantsStatusIndicator + modelprovider 面 describeEndpointFailure/gatewayUnreachableRemediationHint token 族，e2e 生产 lane 面由 e2e 定 token 集）。

### 8.2 0.1.65 = Q3 地基波（后台能力做实，默认语义零变更）

**波内项（4 件，中 8–14 文件 400–700 行估）**：

| 项 | 内容 | 落码面（@26d989e 锚定） | 判别判据 |
|---|---|---|---|
| **Q3-1 引擎侧异步 agent 原语** | headless/-p/SDK 路径后台委派（现 `src/engine/tools/agent/AgentTool.ts` L17「本版仅同步路径，input schema 去掉 run_in_background」残留守核销）：① engine AgentTool inputSchema 加 `run_in_background` 参数（TUI 侧 L45 已有，引擎侧对齐）② 引擎版异步生命周期（`engine/tools/agent/runAgent.ts` L26 残留守 = runAsyncAgentLifecycle 引擎侧落位，TUI 侧 `agentToolUtils.ts:470` 已有可参照移植）③ 完成/失败通知走既有通知链（`engine/coordinator/tasks/localAgentTask.ts:305` enqueueAgentNotification + compose ⑪ 组合根已接线 messaging 真队列，零新建） | `src/engine/tools/agent/`（AgentTool/runAgent/agentToolUtils 引擎版）+ 通知面接线（既有面消费） | 修前红：engine AgentTool 无 run_in_background 参数（schema 断言红）↔ 修后绿：-p 模式后台委派 → 完成通知注入下回合（三段探针）+ 同步路径行为恒等守卫 |
| **Q3-3 needs-input 信号** | 后台子代理**提问/请求权限** = `agent_needs_input` 信号（上游 2.1.198 双信号 agent_needs_input/agent_completed 之缺失件；现 `failed:` 信号在场 LocalAgentTask L252，needs-input ∅）：任务状态机加 needs_input 态 + 通知构造（「Agent "X" needs input: …」）+ 权限面接线（swarm permissionPoller/leaderPermissionBridge 既有面，后台子代理权限请求 → 信号而非静默/自动拒绝） | `src/tui/tasks/LocalAgentTask/`（状态机 needs_input 态）+ swarm 权限面接线 + 通知构造 | needs-input 探针：后台子代理触发权限请求 → agent_needs_input 通知在场断言 + 状态机三态（needs_input→resolved→completed/failed）判别单测 |
| **Q3-4 委派纪律提示词批（零码，0.1.55 先例）** | ① 成本感知委派（2.1.271「小任务已知目标倾向 inline，勿为小活起后台代理」）② usage notes（2.1.240：何时委派/何时 fork/何时 resume/并行/上下文限制）③ async 启动元数据（2.1.211「do NOT predict 未完成 subagent 结果」）；落码 = contextBodies 委派指导新提示词文件 + **断言单测锁裁剪后文本**（BR-8 无字面+号 + 1P 裁面） | `src/tui/contextBodies/`（新提示词文件）+ 提示词断言单测 | 提示词在场断言（0.1.55 先例通道）+ 裁剪面核验（1P 裁除 + ATLAS_ 前缀） |
| **Q3-5 /goal P5 时序守卫回收** | 0.1.63 P5 `hasPendingBackgroundTasks` 现边界 = LocalShellTask 族（工单显式登记「subagent 时序面归 Q3 波」）→ 本波扩展 = **后台 subagent（LocalAgentTask）终态守卫**：评估器（/goal 续跑支）在后台 subagent 仍运行时不提前判达成 | `src/engine/goal/` P5 守卫面扩展（0.1.63 既有调用面加 subagent 终态查询） | 后台 subagent 在场 × 评估器时序单测（运行中 → 评估器零调用；终态 → 触发） |

**0.1.65 零回归约束**：默认 = 前景同步**零变更**（run_in_background 保持 opt-in 语义，TUI 侧现状行为字节级恒等）；/help 55 + cmd 33 恒等（Agent 工具 ≠ slash 命令，本波 slash ∅）；前波 **8 波**（0.1.56–0.1.64）特性面精确同值；loop-rob C1/C2/C3/R3 重跑（引擎 AgentTool 触碰面）。
**gate 判据**：四件套 + P0a/A4F `--release-gate 0.1.65` + /help 55 + cmd 33 + 三段 PTY 活探针（后台启动→完成通知→续接，本波新活面）+ needs-input 探针 + loop-rob + SRI。

### 8.3 0.1.66 = Q3 默认翻转波（a1：background-by-default）

**波内项（1 核心 + 重锚 + 2 可选）**：

| 项 | 内容 | 落码面 | 判别判据 |
|---|---|---|---|
| **Q3-2 a1 翻默认** | 主 session 委派 subagent **默认走后台**（上游 2.1.198 终态）：① TUI AgentTool `isAsync` 语义翻转（`AgentTool.ts` L160 `!!args.run_in_background` → 默认 true 支，显式 `run_in_background:false` 才前景）② 引擎侧 AgentTool 同翻转（依赖 0.1.65 Q3-1 原语）③ 提示词句翻转（prompt.ts L260「foreground (default)」→ 2.1.240 usage notes 语义「background by default; foreground 仅当后续步骤依赖其结果」）④ **逃生舱（f4 建议加件）**：`ATLAS_AGENT_DEFAULT_FOREGROUND=1` env 回退前景默认（0.1.63 ATLAS_GOAL_CHECKIN_MINUTES 同构先例）——翻默认期任何打回/意外 = 一 env 回退，风险有界 | `src/tui/tools/AgentTool/AgentTool.ts` + `src/engine/tools/agent/AgentTool.ts` + prompt.ts + env 门 | **双面探针**：on 面（默认后台：主循环不阻塞 + 完成通知在场 + 显式 false 前景行为）↔ off 面（env 逃生舱 = 现行为字节级恒等 = 零回归锚）；既有同步断言单测/探针**重锚**（e2e 预审显式列清单） |
| Q3-6 可选 | fork-by-default（2.1.232：FORK 默认翻转 + 提示词，☆ 小） | forkSubagent 默认位 | 默认翻转断言 + fork 行为探针 |
| Q3-7 可选 | ④ SDK `unstable_v2_resumeSession` 零码件（Q5）verify 面并入 | 既有 resume 链路在场断言（TUI resumeAgent.ts 已在场） | 零码在场断言（0.1.55 先例） |

**0.1.66 零回归约束**：off 面（逃生舱）= 现行为字节级恒等；/help 55 + cmd 33 恒等；前波 **9 波**（0.1.56–0.1.65，含 Q3 地基面 token）特性面精确同值；loop-rob 重跑。
**gate 判据**：四件套 + P0a/A4F `--release-gate 0.1.66` + 双面探针 + 重锚清单全绿 + loop-rob + SRI。

**两波关系**：0.1.65 收口 = 后台能力全链路在场（opt-in，零行为变更，可独立发布）；0.1.66 收口 = **Q3 独占波终态 = P0 波池全清**（池末位收官 → P0 对齐轨道 = ④ SDK 核销/留登记收尾面）。

## 9. 最高风险项详细拆解（Q3-2 a1 翻默认，@26d989e 码面锚定）

### 9.1 翻转的精确语义面（改动点 = 3 处 + 1 提示词）

1. **TUI 侧**（`src/tui/tools/AgentTool/AgentTool.ts` L160）：`const isAsync = !!args.run_in_background` → 翻默认后 = `args.run_in_background !== false`（缺省 = 后台；显式 false = 前景）。TUI 侧后台执行支（L202+ runInBackground + finalize isAsync:true + 完成通知链）**全部已在场** = 翻转只动**语义位 + 提示词**，不动执行面。
2. **引擎侧**（`src/engine/tools/agent/AgentTool.ts` L17 残留守）：0.1.65 Q3-1 落异步原语后同位翻转（引擎侧同步路径 = headless/-p 现状，翻转 = -p 模式也默认后台）。
3. **提示词面**（`src/tui/tools/AgentTool/prompt.ts` L259-260）：「Use foreground (default) when… Use background when…」→ 翻转为「background by default… foreground 仅当后续步骤依赖其结果」（2.1.240 usage notes 语，Q3-4 批已含，翻默认 = 该句的默认位同步翻）。
4. **逃生舱**：env 门（f4 加件，上游无 = 国产化加固；0.1.63 env 门先例同构）。

### 9.2 风险维度逐一拆解（6 项，概率/影响/定因/缓解）

| # | 风险面 | 概率/影响 | 定因（码面锚） | 缓解 |
|---|---|---|---|---|
| **R1** | **既有同步断言重锚**（单测/e2e 探针假定 Agent 结果内联返回；翻默认后 tool_result = 「[agent launched in background] agentId=…」而非完整结果） | **高/中** | TUI AgentTool 同步支（L136-142 后台支 ack 串 vs L143-147 同步 JSON.stringify 结果）——所有「委派后主 agent 立即拿到结果继续推理」的既有断言/探针面全部语义翻转 | **重锚清单前置**（e2e 预审显式盘点：单测 × N + e2e 探针 × N，逐项标「重锚为后台语义/改显式 false」）+ **双面探针**（off 面 = 现行为恒等锚，打回时可证旧语义完好）+ 逃生舱 env 一退即回 |
| **R2** | **主 agent 行为漂移**（默认后台后主 agent 可能「结果没拿到就推进」——依赖 subagent 结果的场景误走后台） | 中/中 | 提示词面（prompt.ts 默认句翻转 = 行为引导主面）+ C3-4 成本感知委派批（0.1.65 已落，含「何时用前景」指导） | Q3-4 批先行（0.1.65）= 提示词纪律在翻默认**之前**就位；显式 false 路径恒在（LLM 可降级）；生产观察面登记（委派质量 = 上游同款残余） |
| **R3** | **后台子代理权限请求 × 交互面**（默认后台 → 后台子代理提权限请求频次上升；TUI 主回合续跑中弹窗交互时序） | 中/中 | swarm permissionPoller/leaderPermissionBridge（既有）+ Q3-3 needs-input（0.1.65 已落 = 后台权限请求 → 信号非静默） | **依赖顺序保证**：0.1.66 翻转时 Q3-3 已在场（0.1.65）= 后台权限请求有显式信号承接，不出现静默挂起；needs-input 探针重跑 |
| **R4** | **headless -p 退出语义边缘**（-p 模式主回合结束后后台子代理仍在跑 → 进程退出时序：等待 vs 清理） | 中/低 | 引擎侧翻转（Q3-1 原语 + 0.1.66 引擎侧翻默认）× -p 退出面（任务 cleanupRegistry unregister 既有） | **Main 落码裁定点**（工单 §0 显式列）：-p 模式后台子代理 = 主回合结束前等待 vs 登记后清理（上游 -p 语义对标）；判别单测承载（-p + 后台委派 → 退出码/通知面断言） |
| **R5** | **网关并发 + token 经济面**（默认后台 → 峰值并发 = 主会话 + N 后台子代理同走 IFF 8999；Qwen38 27B 本地单卡 = 吞吐竞争（TTFT 拉高 = 恰是 0.1.64 spinner stall 守卫面交互）+ token 用量上升（并行会话 + 通知驱动续跑回合）） | 中/中（经济面低） | IFF gateway 8999（现模型面 Qwen38-27B-TXT）+ 上游 200 cap 已于 2.1.224 移除（C3-2 本仓无 cap 同口径 = 不引入 cap） | 不引入 cap（对齐上游终态）；**生产观察面登记**（并发/TTFT 面 = 0.1.64 stall 守卫已缓解感知面；token 经济 = 本地免费面影响小，云面成本项登记）；Q3-4 成本感知委派批 = 软约束（小任务 inline 不并发起后台） |
| **R6** | **prompt 缓存破 + coordinator 面交互**（提示词默认句翻转 = 首波缓存键变更；coordinator 模式 fan-out（MAX_WORKER_SPAWN_DEPTH）默认后台化后 worker 编排语义变化） | 低/低 | 0.1.55 提示词批先例（提示词变更 = 预期缓存破，一次性）；coordinator 面（isCoordinatorMode + allowFanOut 既有） | 缓存破 = 预期成本（非门禁）；coordinator 面判别单测（fan-out 后 worker 结果回收面断言）；gate 面 = 双面探针覆盖 |

### 9.3 风险收敛设计（为什么拆 0.1.66 独立波可控）

1. **执行面零新建**：翻转波只动「语义位 ×2（TUI/引擎）+ 提示词句 + env 门 + 重锚」——后台执行支/任务状态机/通知链/needs-input **全部 0.1.65 已落并 gate 过**，0.1.66 打回半径 = 语义位 + 重锚清单，不拖新原语（AD-45 教训应用）。
2. **逃生舱 = 失败有界**：`ATLAS_AGENT_DEFAULT_FOREGROUND=1` 一 env 回退现行为；off 面探针 = 回退面可证（打回时生产侧可立即降级）。
3. **双面探针 = 零回归锚**：on 面证新语义（主循环续跑 + 通知），off 面证旧语义恒等（字节级）——**两面都在 gate 面**，语义翻转的判别力 + 零回归证明同 gate 闭环。
4. **依赖前置全绿**：0.1.66 启动条件 = 0.1.65 五段终态（Q3-1 原语 + Q3-3 信号 + Q3-4 提示词纪律 + Q3-5 守卫全在场）= 翻转时所有承接面已 gate 验证。