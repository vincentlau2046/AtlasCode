# 0.1.93 补闭环插入波工单（RED-F 修形 + O4 锚 + release 门禁前滚全验）

> 状态：`draft → 待 Atlas-reveiw 审计 → 双信号`。f4 工单（2026-11-09）。
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
- turn 后 lifecycle 检查 `if (abortController.signal.aborted) break`（L1439-1443）；
- 轮末 `waitForNextPromptOrShutdown`（L970-1146）同参轮询 500ms，`'aborted'` 支 → shouldExit → break（L1604-1608）；
- completed 收尾块（L1615-1650）：`isInProcessTeammateLive` 守卫 → status:'completed' + 通知，唯一终态写点。

**同源链静态实读（全成立）**：
- 单创建点：`spawnInProcess.ts:146` 唯一 `createAbortController()` → 同对象进 taskState（L170）+ 返回值（L188）；
- 接线：`InProcessBackend.ts:139` 同一 `result.abortController` 透传 runner config——**task 记录与 runner 监听同一对象**；
- spawn 后零换源：全仓 abortController 赋值仅终态尾置 `undefined`（runner L1635/1692、spawnInProcess L298）；无 per-turn 覆写
  （`currentWorkAbortController` 为局部变量不落任务记录，L1287/1312/1393）；
- store 单例：`SessionContextPort` = 模块级持有（`src/engine/session/sessionContextPort.ts:17`）；
  `EngineState.get()` 返回原引用无克隆（`src/engine/state/EngineState.ts:75-77`）；SessionSnapshot 型面含 `tasks`（ports/sessionContext.ts:32）。

### 0.2 矛盾面（RED-F 判读收紧）

e2e round-8 实证三元组（gate-093 块 J）：**① exitTriggered=true 直证**（两腿 tool_result 文案）+
**② 轮询活**（500ms 即达）+ **③ 不消费**（45-65s 长窗 status 恒 running、completed 仅进程退出 cleanup 发）+
**④ 不取后续 mailbox 消息**。若同源链如静态所读，②+③ 不可能并存（500ms 内 poll 必见 aborted）；④ 与
"poll 活"亦张力（活 poll 应取 new_message 起新轮）。⇒ **存在静态读不可见的运行时分裂**。

**主候选（按解释力排序）**：
- **RF-2（首选）：成员卡轮内**——approve 后 turn 不返回（runAgent 内悬挂），两个消费站（turn-end break / poll）
  皆不可达。④（不处理新消息）强支持此向：卡轮内则新消息不入。修形向 = lifecycle abort 的轮内可见性
  （abort listener 打断 currentWork / 轮内检查点），而非仅"同源化"（同源静态已成立，纯同源化修不动）。
- **RF-1：模块双实例族**——RED-E 同族教训（bundle 模块多实例）：若 `sessionContextPort.ts` 或 store 模块在
  bundle 成双实例，成员工具读的 port 单例与 runner 侧 store 分裂。但 exitTriggered=true 要求成员侧 store
  **有**该任务记录且有活 controller——双实例下难成立，除非 store 共享而 controller 对象在序列化边界分离。
  判别手法 = Q1 同款 bundle 结构断言（模块实例数=1）。
- RF-3：poll while-condition 与 sleep 竞态——500ms 上界排除（45-65s 窗口），仅列备档。

**f4 审视自决**：修形指令不预设单一根因——Main 落码前先以 R-①/②/③ 判别格定谳（见 §3 段 R），
Root-cause lock-face 报 f4 批复后修形（0.1.93 主波 round-6/7 先例：先根因锁面后修形）。

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

### 段 R：根因定谳（Main，先于修形）

| 格 | 内容 | 判据 |
|---|---|---|
| R-① | 三点 controller 同对象直证：spawn 创建点 / 触发段 abort 点 / poll 检查点，debug 日志带对象标识（hash/uuid），e2e 腿收证 | 三点同标识 = 同源实锤；异标识 = RF-1 分裂实锤 |
| R-② | approve 后成员执行态钉死：轮内（runAgent 未返）vs 轮间（poll 内），日志直证 | 轮内悬挂 = RF-2 实锤 |
| R-③ | store/port 单实例 bundle 结构断言（Q1 手法）：sessionContextPort 模块实例数=1、EngineState 实例数=1 | 实例>1 = RF-1 实锤 |
| R-④ | 根因 lock-face 报 f4 批复（含判别格证据），f4 出修形锁面 | f4 批复后方可修形 |

### 段 F：RED-F 修形（Main，按批复锁面）

- 候选修形向（按 §0.2 排序，以 R 段定谳为准，禁在定谳前落码）：
  - RF-2 向：lifecycle abort 轮内可见性——abort listener 桥接 currentWork / turn 内检查点，保证 approve 后
    有界窗内 turn 终止 → 既有双消费站可达；零新终态写点（completed 尾单点不变）。
  - RF-1 向：分裂单源化（RED-E 手法同款：双实例直删归一 / 边界对象传递修正）。
  - 兜底纪律：不改 TeamDelete fail-closed 守卫语义；不放宽 forced 阶梯；exitTriggered=false 静默面按
    「静默误投族」处置评估（文案两态不谎面维持）。
- func 判别格：修前复现 RED-F 症状的 func 格（先红后绿，Q4 先例）；wire 层断言直证（0.1.92 wire 断言先例）。

### 段 G：e2e scoped re-gate（round 9 形态，用户 A 裁定重启轮次计数）

- O4 名义形锚（硬判据⑤）：spawn → shutdown_request → 成员 approve → 有界窗内成员终态（status completed）→
  completed 通知达 lead → TeamDelete 无守卫拦截 → graceful 全链 GREEN。
- 前滚硬判据①：T8 全链复跑 GREEN。
- 前轮点名回归：round 1-8 各修形判别格 + 段 Q 四格（Q1 ALS=1 / Q2 贯通 / Q3 销项 / Q4 点火）全复验。
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
