# 0.1.93 补闭环插入波工单（RED-F 修形 + O4 锚 + release 门禁前滚全验）

> 状态：`审计闭环（有修改通过）→ 双信号`。f4 工单（2026-11-09）。
> 上游：`docs/2026-11-08-p0-wave-0193-ticket.md` §7-§8（0.1.93 W-D-A 八轮 stop 收口 @4335693c）。
> 用户终裁（2026-11-09）：**A：RED-F 插入波优先**（W-D-B 与纲要 §10 序 4+ 顺延）。

---

## §0 波前审视（活码重核 @ master ad6e885a，f4 自决闭环）

### 0.1 RED-F 面全链实读（触发段 → 消费段逐跳）

**触发段**（engine SendMessageTool `src/engine/tools/team/sendMessageTool.ts:590-655`）：
`handleShutdownApproval` → `getSessionContextPort()`（模块级单例）→ `port.get().tasks` →
`findInProcessTeammateTaskByAgentId` → `isInProcessTeammateLive`（= status==='running'，`src/task/inProcessTeammate.ts:119`）
→ `memberTask.abortController.abort()` → `exitTriggered=true`。任何缺链（port null/条目缺失/谓词假/controller undefined）
= `exitTriggered=false` 静默缺席，catch 全吞（注释明示「触发段缺席 = 现行为保留」）——**静默误投族面**。

**消费段**（engine runner `src/swarm/inProcessRunner.ts`，compose 自 `../swarm` 接线实证为活副本）：
- 主循环 `while (!abortController.signal.aborted && !shouldExit)`（L1279，监听 `config.abortController`）；
- turn 后 lifecycle 检查 `if (abortController.signal.aborted) break`（L1447-1450；L1438-1443 为 currentWork Escape 检，行号勘误据审计）；
- 轮末收尾段（第三消费面，审计焦点①4 补）：isIdle 置位（L1490）→ `await sendIdleNotification`（L1500-1515，sendMessageToLeader 写链）→ `evaluateTerminationSpec`（L1522-1527，**读 `aborted: abortController.signal.aborted`**——若 spec 语义消费 aborted 则 turn 末即 graceful exit，既可能改变判读也是修形候选面）→ poll 入口（L1542）；
- 轮末 `waitForNextPromptOrShutdown`（L970-1146）同参轮询 500ms，`'aborted'` 支 → shouldExit → break（L1598-1604）；
- completed 收尾块（L1614-1651）：`isInProcessTeammateLive` 守卫 → status:'completed' + 通知，唯一终态写点。

**同源链静态实读（全成立）**：
- 单创建点：`spawnInProcess.ts:146` 唯一 `createAbortController()` → 同对象进 taskState（L170）+ 返回值（L188）；
- 接线：`InProcessBackend.ts:139` 同一 `result.abortController` 透传 runner config——**task 记录与 runner 监听同一对象**；
- spawn 后零换源：全仓 abortController 赋值仅终态尾置 `undefined`（runner L1635/1692、spawnInProcess L298）；无 per-turn 覆写
  （`currentWorkAbortController` 为局部变量不落任务记录，L1287/1312/1393）；
- store 单例：`SessionContextPort` = 模块级持有（`src/engine/session/sessionContextPort.ts:17`）；
  `EngineState.get()` 返回原引用无克隆（`src/engine/state/EngineState.ts:75-77`）；SessionSnapshot 型面含 `tasks`（ports/sessionContext.ts:32）。

### 0.2 矛盾面（RED-F 判读收紧；依审计焦点①修订 2026-11-09）

**硬证据集（gate-093 块 J，经审计勘误后口径）**：
**① exitTriggered=true 直证**（两腿 tool_result 文案）+ **② 不消费**（45-65s 长窗 status 恒 running、
completed 仅进程退出 cleanup 发）+ **③ 不取后续 mailbox 消息** + **④ WaitForTeammates「零运行成员」idle 面**
（live && 轮间 isIdle=true，块 J 第 4 点原文）。
~~轮询活（500ms 即达）~~ = **机制推断非观测直证**（audit 勘误：原表述系 poll 周期 500ms 故"应达"的推断）；
初版工单误将其作观测事实入硬证据——已降级，直证责任转 R-⑤ 补格。

**主候选（按解释力排序；审计后重排）**：
- **RF-12（首选，审计新增）：轮末收尾段悬挂（第三执行态）**——runAgent 返回 → lifecycle break 检（L1447）→
  isIdle 置位（L1490）→ `await sendIdleNotification`（L1500-1515，sendMessageToLeader 写链）→
  evaluateTerminationSpec（L1522）→ poll 入口（L1542）之间卡死：poll 永不入、abort 永不消费、**isIdle 已 true**
  → 与全部四项硬证据相容且**唯一同时解释 idle 面（④）**。mailbox lock 有界（10 retries×≤100ms）+ writeToMailbox
  吞错削弱了 lock 分支，但 sendMessageToLeader/team-file 面未逐界，且 .lock 残留在 round 证据中多次出现。
  修形向 = 收尾段 await 有界化 / fail-visible。
- **RF-4A（次选，审计新增）：触发段命中异对象——陈旧/重复任务记录**——`findInProcessTeammateTaskByAgentId`
  （src/task/inProcessTeammate.ts:157-166）按 identity.agentId **首个命中**，无 status/teamName 过滤、无唯一性前提；
  多记录时 abort 落在非 runner 持有对象 → exitTriggered=true 而真 controller 活而不消费。与 idle 面相容。
  修形向 = 记录唯一性/谓词收紧。
- **RF-2（第三，初版首选被审计削弱）**：成员卡轮内（runAgent 不返回）——③ 支持但 **④ idle 面与之张力**
  （卡轮内则 isIdle=false，与「零运行成员」矛盾）；RF-2 修形向（currentWork 桥接）对 RF-12/RF-4A 无效
  （够不着收尾段/异对象）。保留为候选，判别定谳前不排码。
- **RF-1：模块双实例族**——RED-E 同族教训（bundle 模块多实例）：若 `sessionContextPort.ts` 或 store 模块在
  bundle 成双实例，成员工具读的 port 单例与 runner 侧 store 分裂。但 exitTriggered=true 要求成员侧 store
  **有**该任务记录且有活 controller——双实例下难成立，除非 store 共享而 controller 对象在序列化边界分离。
  判别手法 = Q1 同款 bundle 结构断言（模块实例数=1）；R-① 加记录唯一性断言与 RF-4A 分型。
- RF-3：poll while-condition 与 sleep 竞态——45-65s 窗口排除，仅列备档。

**f4 审视自决（修订版）**：修形指令不预设单一根因——Main 落码前先以 R-①/②/③/⑤ 判别格定谳（见 §3 段 R），
Root-cause lock-face 报 f4 批复后修形（0.1.93 主波 round-6/7 先例：先根因锁面后修形）。
**R-② 判读纪律（审计焦点③1）**：执行态三分 = 轮内 / **轮末收尾段** / 轮间——二分会把收尾段悬挂两头不靠误归
RF-2 实锤，禁二分判读。

### 0.3 附带发现（登记，不入本波修形范围）

- **runInProcessTeammate 双物理副本**：`src/swarm/inProcessRunner.ts`（活，compose 接线实证）+
  `src/tui/utils/swarm/inProcessRunner.ts`（927L 级第二副本；唯一引用 = inProcessRunnerPort.ts 注释）。
  归 W-D-B 工具契约统一波（teammate.ts 双副本同单）。
- **SendMessageTool 双物理副本**：engine（活，round-7 修形单触 engine 副本而 e2e wire 直证生效 = 成员执行
  engine 副本实证）+ TUI `src/tui/tools/SendMessageTool/SendMessageTool.ts`（927L 独立实现，含异构
  handleShutdownApproval：teamFile 磁盘查 ownBackendType + gracefulShutdown 兜底）。运行时活面未钉死，
  归 W-D-B「TUI/print 收敛形差异」既有登记项扩格。
- 判读依据登记：round-7 修形（2f891082）只动 engine 副本、e2e wire 直证生效 → e2e lane 成员执行
  engine SendMessageTool/runner 副本。此判读若在 R-① 直证中被推翻，按 row F 预注册纪律报 f4 裁定。

---

## §1 波定义

- **波名**：0.1.93 补闭环插入波（W-D-A closure / RED-F）。
- **版本**：仍为 **0.1.93**（版本=收口契约；0.1.93 未发布，本波闭环后以 0.1.93 发布，含 W-D-A 全绿能力面）。
- **范围（scoped）**：仅 RED-F 修形 + O4 名义形锚取得 + 前滚判据面全验 → gate 闭 → release 0.1.93 → 生产 lane。
- **非目标**：W-D-B 全项（工具契约统一/TUI-print 收敛形/requestShutdown 工具化/teammate.ts·inProcessRunner·
  SendMessageTool 三双副本收敛）、收敛原语扩展、权限 dialog 案 A/B、纲要 §10 序 4+。零新能力面。

## §2 Global Constraints（硬约束）

1. 前滚判据（0.1.93 主波 §8 条款，fail-closed）：本波 release gate **必须**含 ①T8 全链 + ⑤ O4 名义形锚，
   两面为硬判据；未过不发。
2. round-1-8 全部点名回归面随 gate 复跑（前轮修形链不回退：spawn 扩参/双向互发/角色三元组/终止条件组/
   WaitForTeammates/tolerant dispatch/teammateContext 单源化）。
3. canon = `FORCE_COLOR=3 CI=true bun test --isolate tests/`；挂死 15min wall 护栏 + 降级阶梯（0.1.83 先例）；
   139/hang blot 三连处置纪律。
4. 探针 marker 严禁入 prompt 字面（自回声假阳性防线）；探针 designated-only seeded HOME/provider；零写真实
   ~/.atlas/~/.claude。
5. 判读三纪律：点火面/消费面分开断言；func 单副本绿 ≠ e2e 双副本真环境绿（方法论勘误）；状态面分叉=判读分叉。
6. 角色矩阵：f4 工单/判据/核验；Main 落码/发布/单点报用户；e2e gate/生产 lane；Atlas-reveiw 波前审计（本工单必送）。

## §3 工作段（预注册判别格）

### 段 R：根因定谳（Main，先于修形；依审计焦点③补强 2026-11-09）

| 格 | 内容 | 判据 |
|---|---|---|
| R-① | 三点 controller 同对象直证：spawn 创建点 / 触发段 abort 点 / poll 检查点，debug 日志带对象标识（hash/uuid），e2e 腿收证；**附任务记录唯一性断言**（同 agentId 在 port.get().tasks 条目数=1，含陈旧记录扫描） | 三点同标识+记录唯一 = 同源实锤；异标识 → **分型**：模块双实例 = RF-1；记录多杀 = RF-4A（两亚型修形向不同，禁混判） |
| R-② | approve 后成员执行态**三态**钉死：轮内（runAgent 未返）/ **轮末收尾段**（isIdle 已置位、poll 未入——三锚：runAgent 返回点 / sendIdleNotification 进入+返回点 / poll 首条日志）/ 轮间（poll 内）；l 腿 wire 附「approve 后成员请求有无」面 | 收尾段卡死 = RF-12 实锤；轮内 = RF-2（受 idle 面④约束弱先验）；轮间不消费 = RF-1/RF-4A |
| R-③ | store/port 单实例 bundle 结构断言（Q1 手法）：sessionContextPort 模块实例数=1、EngineState 实例数=1 | 实例>1 = RF-1 实锤 |
| R-⑤ | **poll 活性直证格**（审计补）：长窗内 `[inProcessRunner] ... poll #N` debug 行计数 | 计数增长 = poll 活直证（兼作 §0.2 ② 勘误闭环）；零增长 = poll 未入（支持 RF-12） |
| R-④ | 根因 lock-face 报 f4 批复（含判别格证据），f4 出修形锁面 | f4 批复后方可修形 |

### 段 R-aux：最小 debug sink 接线（f4 裁定 2026-11-09，e2e 缺口回执触发）

**缺口（e2e 实核成立，f4 复核确认）**：R-①/②/⑤ 依赖的 swarm 域 `[inProcessRunner]` debug 行
（~30 处）import 自 `src/shared/debug.ts` = charter C-4 纯 no-op 占位（空体）；`cli/debugSink.ts`
完整 sink（`--debug-file` 落盘 + ISO 时间戳）仅绑 cli 域三文件 → 任何 lane 零输出，判别格空转。

**裁定：批准最小接线，随段 R 判别格落码同步实施**，约束锁面：
1. **单一事实源维持（C1）**：接线点 = `shared/debug.ts` 本体（加可注入 sink 窗，set/get 双函数 +
   模块级持有缺省 no-op——Port 5/Port 1 窗口先例同型），**禁每域复制**；cli/debugSink 启动期注册注入。
   与 charter C-4 自注「logging port 定案后整文件替换为 port 实现（签名不变，调用点零改动）」前向兼容。
2. **缺省零行为变更**：sink 仅经既有 `--debug-file`/`--debug`/env DEBUG 任一启用；缺省 lane 零输出零 I/O。
3. **charter C-4 扩格登记**：占位部分激活须在 charter 登记面落格（非静默），注记「swarm 判别格收证驱动，
   logging port 定案时整换」。
4. 范围纪律：仅此最小窗，logging port 全量落地不属本波（仍属 charter C-4 待案）。

### 段 F：RED-F 修形（Main，按批复锁面；依审计焦点②补强 2026-11-09）

- 候选修形向（按 §0.2 排序，以 R 段定谳为准，禁在定谳前落码）：
  - **RF-12 向（首选对应）**：轮末收尾段 await 有界化 / fail-visible——sendIdleNotification→sendMessageToLeader
    写链逐界核（mailbox lock 之外的 team-file 面未逐界），悬挂面转显式失败或有限等待；零新终态写点
    （completed 尾单点不变）。
  - **RF-4A 向**：任务记录唯一性/谓词收紧——findInProcessTeammateTaskByAgentId 加 status/teamName 过滤或
    唯一性前提 fail-loud。
  - **RF-2 向**：lifecycle abort 轮内可见性——**实现形态锁面（审计预注册）：listener 形**（lifecycle signal 挂
    一次性 listener abort currentWork，per-turn 注册/解除防泄漏），**禁轮询形**（busy-wait 红线）；
    **单向性锁面：lifecycle ⇒ currentWork 单向**，禁反向（反向 = Escape 误杀成员，破 0.1.93 主波锁面
    L1383「Escape stops this turn only, not the teammate」）；**Escape 回归判别格必配**：Escape 中断单轮后
    成员仍 isIdle/poll 续活/不进终态。副作用批注：桥接后 turn-end currentWork 检会以「(Escape pressed)」
    文案记录 lifecycle abort（log 语义漂移，分流或批注）；workWasAborted=true 插 ERROR_MESSAGE_USER_ABORT
    属 teardown 噪声面（completed 收尾 messages:[last] 覆盖）。
  - **RF-1 向**：分裂单源化（RED-E 手法同款：双实例直删归一 / 边界对象传递修正）。
  - 兜底纪律：不改 TeamDelete fail-closed 守卫语义；不放宽 forced 阶梯；exitTriggered=false 静默面按
    「静默误投族」处置评估（文案两态不谎面维持）。
- func 判别格：修前复现 RED-F 症状的 func 格（先红后绿，Q4 先例）；wire 层断言直证（0.1.92 wire 断言先例）。

### 段 G：e2e scoped re-gate（round 9 形态，用户 A 裁定重启轮次计数）

- O4 名义形锚（硬判据⑤）：spawn → shutdown_request → 成员 approve → 有界窗内成员终态（status completed）→
  completed 通知达 lead → TeamDelete 无守卫拦截 → graceful 全链 GREEN。
- 前滚硬判据①：T8 全链复跑 GREEN。
- 前轮点名回归（审计焦点④扩格）：round 1-8 **各轮判别格全量复跑**（兜底句式，防「修形判别格」解释窄化）；
  点名补：⑤ 进程退出升级阶梯/exit guard（round 1-2）、RED-B TaskOutput(teammate) 判别格、RED-C inbox
  分裂判别格、RED-D 指引悬空、段 N 56/56 与段 P、A6 收敛+spawn 防伪（round 1）+ 段 Q 四格（Q1 ALS=1 /
  Q2 贯通 / Q3 销项 / Q4 点火）。TUI A2 由负断言覆盖；round-4 修测面随 canon 覆盖。
- 负断言维持（TUI engine-only 钉探针）；canon 判据②护栏内绿；SRI/npm 面按 release 链标准。

### 段 L：release 0.1.93 + 生产 lane

- gate GATE-PASS → Main release 0.1.93（CHANGELOG 累积 W-D-A 五行为变更面 + 单源化结构收口登记 + RED-F 修形）→
  e2e 生产 lane → e2e 报 Main → Main 单点报用户。release 链解冻仅以本波 gate 闭为条件（前滚条款）。

## §4 Review Focus（Atlas-reveiw 审计建议焦点）

1. §0.2 矛盾面判读：e2e 三元组与静态同源的矛盾是否还有第四解释（f4 仅列三候选）。
2. RF-2 修形向的副作用面：abort listener 桥接 currentWork 是否误伤 Escape 语义（currentWork 独立性为 0.1.93
   主波锁面）；轮内检查点是否引入长轮 busy-wait。
3. 段 R 判别格充分性：R-①②③ 是否足以定谳，是否需补格。
4. 前滚判据面复跑清单是否漏项（round 1-8 修形面全点名核对）。
5. 版本口径：0.1.93 复用（版本=收口契约）是否与 release 治理制度一致。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号（Main 工单 + e2e gate 工单）→ Main 段 R 定谳 → f4 批复 → 段 F 落码 →
段 G gate → 段 L release/生产 lane。全程 row F 预注册纪律：偏离预注册范围须先报 f4 裁定。

## §6 Atlas-reveiw 审计闭环（2026-11-09，有修改通过）

审计结论：工单结构合规，**可进双信号，附 1 条实质判读修正 + 判别格/清单补强**；§0 锚点三方活码复核全 ✓
（触发段 L590-657 / spawn 单创建点+同对象 / 全仓无非 undefined 赋值 / port 模块单例 / InProcessBackend:139）。
f4 逐条吸收（本文件已修订）：

1. **判读依据勘误（实质，已采）**：「轮询活 500ms」降级为机制推断非观测直证（§0.2 ② 勘误）；
   硬证据集改四元组（+WaitForTeammates 零运行成员 idle 面）；候选重排 **RF-12 首选**（唯一全证据相容）
   > RF-4A > RF-2（被 idle 面削弱）；R-② 二分判读禁令（三态）。
2. **RF-4A/RF-12 双新候选（已采）**：异对象命中（首个命中无过滤）/ 轮末收尾段悬挂；对应修形向两格入段 F。
3. **判别格补强（已采）**：R-① 记录唯一性断言+分型；R-② 三态三锚；R-⑤ poll 活性直证格。
4. **段 F 预注册补强（已采）**：listener 形禁轮询形；lifecycle⇒currentWork 单向性锁面；Escape 回归判别格；
   log 语义漂移/teardown 噪声两条副作用批注。
5. **段 G 复跑清单（已采）**：round 1-8 判别格全量复跑兜底句 + 6 项点名补。
6. **§0.1 消费站三面（已采）**：evaluateTerminationSpec aborted 消费面入轮末收尾段；行号三处勘误
   （L1447-1450 / L1598-1604 / L1614-1651）。
7. **焦点⑤ 版本口径**：一致无意见（0.1.93 复用 = 版本收口契约，0.1.91 scoped re-gate 先例背书）。
   审计明示无需二审（改动均在判据面非波定义面）。

## §7 Main 执行记录：段 R 探针 + 段 R-aux 落码（2026-11-09）

**范围纪律**：本节仅登记判别 instrumentation + R-aux 最小接线（f4 裁定锁面），零修形码（修形仍禁至 R-④ f4 批复）。

### 段 R-aux（f4 裁定 2026-11-09 四条锁面逐条执行）

1. **①单一事实源接线**：`src/shared/debug.ts` 加可注入 sink 窗（`setDebugSink`/`getDebugSink` + 模块级持有缺省 `null` = 纯 no-op，Port 5/1 set/get 窗先例同型）；`src/cli/debugSink.ts` `initDebugSink()` 启动期无条件注册（窗口仅转发；输出仍经本文件 `enabled`/filter/level 门控）；`resetDebugSinkForTesting()` 同步清窗（跨用例泄漏守卫，mock.module 教训）。禁每域复制维持。charter C-4 前向兼容注记入 shared/debug.ts 头注（port 定案整文件替换、窗口随替换面删除）。
2. **②缺省零行为变更**：sink 仅经既有 `--debug-file`/`--debug`/env DEBUG 启用链激活；未启用 lane 输出经 `if (!enabled) return` 早退，零输出零 I/O。判别单测：`tests/unit/cli-debug-sink.test.ts` 新 describe「段 R-aux」3 格（注册后 shared 行落 --debug-file / 复位清窗零输出 / 未启用 lane 零文件）。
3. **③charter C-4 扩格登记**：`docs/architecture-charter.md` C-4 节加扩格批注（非静默；注记 swarm 判别格收证驱动 + logging port 定案整换）。
4. **④范围纪律**：仅此最小窗，logging port 全量落地不属本波。

### 段 R 探针落码（判别格，非修形）

- **R-① 三点 controller 同对象直证**：探针 helpers `probeStampAbortController`/`probeReadAbortControllerId`（`src/task/inProcessTeammate.ts`，WeakMap 模块级持有——**模块双实例时跨实例 read 落 'untagged'，探针自身兼作 RF-1 分型直证信号**）。三点插桩：
  - spawn 创建点（`src/swarm/spawnInProcess.ts`）：`[probe-R1][spawn] agent= taskId= controller=ac-N`（stamp）；
  - 触发段（`src/engine/tools/team/sendMessageTool.ts` handleShutdownApproval）：`[probe-R1][trigger]` 带 **任务记录唯一性断言面**（同 agentId 全条目枚举含陈旧记录：`taskEntries=N sameAgentId=key:status|... firstHit= controller= live=`；条目>1 = RF-4A 分型直证）；
  - poll 检查点（`src/swarm/inProcessRunner.ts`）：runner 入口 `[probe-R1][runner]`（read）+ poll 起始行 `[probe-R2][anchor3-poll-start] ... controller=ac-N`（read）。
- **R-② 三态三锚**：anchor1 = runAgent 返回点（`[probe-R2][anchor1-runagent-returned]`，含 lifecycleAborted 面）；anchor2 = sendIdleNotification 进入+返回点（`[probe-R2][anchor2-idle-in]`/`[probe-R2][anchor2-idle-out]`）；anchor3 = poll 首条日志（anchor3-poll-start）。三态判读：anchor1→anchor2-in 之间卡死 = 轮内/收尾段分界；anchor2-in 后无 out 且 poll 未入 = RF-12 收尾段悬挂实锤；anchor3 后不消费 = RF-1/RF-4A。
- **R-⑤ poll 活性直证**：既有 `[inProcessRunner] ... poll #N: checking mailbox` 行（500ms 周期）为计数面，零行为变更。
- **R-③ store/port 单实例结构断言**（Q1 手法）：新 `tests/unit/wave0193b-r3-port-singleton.test.ts` 6 格——sessionContextPort.ts 恰 1 份 / EngineState.ts 恰 1 份 / 触发段+waitForTeammates import 车道收敛同一 port 模块 / setSessionContextPort 声明唯一 / 探针 helpers 声明面唯一 / stamp 幂等 + read 'none'/'untagged' 语义运行时抽验。bundle 期真双实例 func 层不可复现（0.1.93 方法论勘误）——e2e 腿由 probe-R1 'untagged' 信号兜底。

### 四件套

- `npx tsc --noEmit` = 0
- `eslint src/` = 0e 0w
- `bun run build` = 0（dist/cli.js 18110722B）
- canon `FORCE_COLOR=3 CI=true bun test --isolate tests/` = **5730 pass / 0 fail / 457 files / 120.5s，exit 0**（基线 5721/0/456 → Δ+9 测试 = 段 R-③ 6 格 + 段 R-aux 3 格，Δ+1 文件 = wave0193b-r3-port-singleton.test.ts，恰合）

### 探针 marker 清单（e2e 腿 grep 面，--debug-file 收证）

`[probe-R1][spawn]` / `[probe-R1][runner]` / `[probe-R1][trigger]` / `[probe-R2][anchor1-runagent-returned]` / `[probe-R2][anchor2-idle-in]` / `[probe-R2][anchor2-idle-out]` / `[probe-R2][anchor3-poll-start]` / `[inProcessRunner] ... poll #N: checking mailbox`（R-⑤ 计数）。marker 均为代码侧 debug 行，不入 prompt 字面（§2 硬约束 4）。
