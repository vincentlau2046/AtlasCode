# A1 requestShutdown 段 D 契约设计 lock-face（Main → f4 报批）

> 工单 docs/2026-11-11-p0-wave-a1-requestshutdown-ticket.md §3 段 D 七点必答（§7 审计修订后）。
> 码面锚点全实锚 @ a1-0.1.96 worktree（HEAD eb9997ae）。零落码；批复后依序落码段 I。
> 勘码基座：成员 poll 循环 waitForNextPromptOrShutdown（inProcessRunner.ts:1002，500ms poll）；
> isShutdownRequest = zod literal 判别（engine/messaging/mailbox.ts:964-976，schema :816-818）；
> approve 链 handleShutdownApproval（sendMessageTool.ts:673，abort :757-759 + selfTerminatePort 兜底 :783-790）；
> mailbox 结构化 type 枚举 13 型（mailbox.ts:491-1117）；WaitForTeammatesOutput = {status, waited_ms, idle[], still_working[]}（waitForTeammatesTool.ts:89-96）；
> 成员工具保底 7 件（inProcessRunner.ts:358-371）；runner 单源（0.1.94 C-3）；
> mailbox.ts 与 tui/utils/teammateMailbox.ts 平行双实现（同 inbox 文件布局 ~/.atlas/teams/{team}/inboxes/{agent}.json、同 TeammateMessage 形、schema 重复定义）。

## 决定性事实（三点，约束全部候选）

- **F1（审计必改证实）lead 信箱读面 engine 车道缺席**：全仓唯一 lead inbox poll = TUI useInboxPoller（useInboxPoller.ts:955，1000ms，仅 TUI 车道且 shutdownRequests 分支仅 isTeammate() 生效 L666）；engine/headless 车道零消费点。lead 实际收信三途 = TUI poller / 内存 onIdleCallbacks（spawnInProcess.ts:297）/ WaitForTeammates。**「写 lead 信箱 = lead 可达」不成立**——发现面必须显式设计。
- **F2 成员侧零在途锁存**：InProcessTeammateTaskState.shutdownRequested 是 lead 向「已发过请求」锁存（写点唯一 requestTeammateShutdown，inProcessTeammateTask.ts:64-80）；成员 poll 与 handleShutdownApproval 均无成员侧在途/去重态。
- **F3 成员自发请求无现成面**：SendMessageTool 结构化分派（sendMessageTool.ts:941-959）仅 shutdown_request（发给他人）/shutdown_response 两支，语义均 lead→成员方向；成员若复用 {type:'shutdown_request', to:'team-lead'} 会与既有 isShutdownRequest 高优扫描自指（成员自己 poll 到自己引的请求类）——审计②自指循环面证实。

## 七点答

### ① 工具名/参数形

`RequestShutdown(reason?: string)`（工单候选维持）。工具描述（成员 LLM 指引）：任务自评完成或持续受阻且继续空转无产出时使用；调用 = 向 lead 提交退出请求，**批准权在 lead**（本工具不终止自身进程，仅投递请求）；deny 后勿立即重试（锁存至新输入）。

### ② 消息契约：新类型优先（审计②采纳）

两枚新 zod schema，单源落 engine/messaging/mailbox.ts（与既有 13 型同区）：

- `shutdown_request_from_member`：`{type, from: memberName, reason?: string, request_id: string}`。request_id = 成员生成（`rs-${timestamp}` 形），承载在途唯一性判别与 deny 关联。
- `shutdown_request_denied`：`{type, to: memberName, request_id, reason?: string}`——lead deny 的回执面（既有 shutdown_rejected 语义是成员回应 lead 下发的请求，方向相反不混用）。

approve 无新类型：lead 批准 = 发**既有** `shutdown_request`（成员既有高优扫描 + handleShutdownApproval 全链复用，两端 bookend 零新面）。`isStructuredProtocolMessage` 白名单（mailbox.ts:1169-1190）同步加两型。

### ③ lead 发现路径（审计必改·核心裁定）

三候选裁 **B（WaitForTeammates 返回面扩格）**：

- (a) task_notification 扩面 **否**：TaskNotification = 预拼 XML 字符串（notification.ts:20-28），agentId 定向路由是未接线的 forward seam（compose.ts:315）；承载任意结构化消息 = 面错配。
- (b) **WaitForTeammates 扩格 ✓**：输出面加 `pending_requests?: Array<{from, reason, request_id}>`（实现 = 工具 call 时读 lead inbox 过滤 unread 的 shutdown_request_from_member；读后不 mark read——裁定权留 lead，消息 read 态由 lead 处置动作推进）。理由：①成员请求退出恰发生在 idle 临界，lead 调 WaitForTeammates 正是收队时点，发现面与会合点天然重合；②工具面是 engine 单源，双 lane（headless/TUI）零增量同达（F1 缺口整面解决）；③无新轮次税（lead 本来就要等成员）。
- (c) lead 查箱独立工具面 **否**：新工具面 + lead 需自主记得调用 = 发现无保证（审计原文「lead 自主查箱无保证发现」），且面大于 B。

**时窗观测格**（审计要求）：e2e 探针腿计 `RequestShutdown 投递 → lead 侧 WaitForTeammates 输出 pending_requests` 时窗，上界 = WaitForTeammates 单次 poll 周期；格 = 探针腿断言 pending_requests 在 lead 下一次 WaitForTeammates 调用即在场（不滞留）。

### ④ lead 消费形态：候选 A 维持（f4 预判，零修正）

pending_requests 经 ③ 面呈 lead 模型 → lead 模型裁定（SendMessage 发既有 shutdown_request = 批准；发 shutdown_request_denied = 拒绝）；批准权链路 = lead 模型工具调用，**runner 层零新终态写点**，§2.2 天然满足，B 终裁前置条款不触发。

### ⑤ 防环四补强（审计③全采）

1. **锁存载体 + 持久性**：deny 回执（shutdown_request_denied）被成员 poll 感知后落**模块级 runner 态锁存**（member 进程内 per-member Map<request_id, 'denied'>，跨轮不 reset）；解锁判定义枚举 = poll 循环 WaitResult **`new_message` 或 `shutdown_request` 事件**（inProcessRunner.ts:970-985 三型中两型）——即 lead/用户有新输入才允许再次请求；`aborted` 不涉。锁存期 RequestShutdown 调用 = fail-visible 文案「已被拒，待新输入后可再请求」，零 mailbox 写。
2. **在途唯一性**：RequestShutdown call 前查双态——模块级 pending 标记 + lead inbox 内本成员未决 request_id（own from + type 过滤）；命中任一 = fail-visible「在途请求待裁」，不重写。
3. **双向并发竞态定谳**：lead shutdown_request 与成员在途请求并发 → 成员既有高优扫描（L1088-1118）优先返回 lead 请求 → 成员走既有 approve/deny；其自发在途请求**自动失效**（lead 已直接下发 = 意图覆盖），pending 标记随 approve 分支清理；无双 ack 面（成员自发请求从不触发 abort，竞态无终态写冲突）。
4. **deny 两态均 fail-visible 到成员模型**：显式拒绝 = shutdown_request_denied 回执（poll 感知 → 模型收文案）；不作为 = 在途唯一性格让重复请求返回「在途待裁」而非假成功。两态成员模型均有可见信号。

多成员并发风暴：A 形态天然有界于成员数 + 在途唯一性即足（审计判定维持）。

### ⑥ 工具注入点

`RequestShutdown` 实现体落 **engine**（新 engine/tools/team/requestShutdownTool.ts 或并入 sendMessageTool 域——落码段定，倾向独立文件对齐一工具一文件惯例），**零 port 面**：工具体 = mailbox 写（engine/messaging/mailbox.ts 同源）+ 返回文案，不触 tui 域符号（selfTerminatePort 是批准后动作，本工具不触达）。注入位 = resolveTeammateAgentFace 保底 7 件集扩为 8 件（inProcessRunner.ts:358-371 team-essential 增 REQUEST_SHUTDOWN）。双 lane 可达性：runner 单源（runInProcessTeammate 唯一实现）⇒ headless/TUI 同源同达；成员 SendMessage 既有可达性证明工具注册管道通。

### ⑦ tmux 车道覆盖定谳

**覆盖成立，登记一处双写债**：

- 写面：mailbox.ts 与 teammateMailbox.ts 同 inbox 文件布局 + proper-lockfile 同文件互斥 ⇒ tmux 成员（独立进程）RequestShutdown 写 lead inbox 与 in-process 同构，零新机制。
- lead 发现面：WaitForTeammates 是 engine 工具读 lead inbox 文件 ⇒ tmux 车道 lead（TUI 进程）同样经 ③ 面发现，零增量。
- 成员 deny 感知面：tmux 成员读信经 useInboxPoller（teammateMailbox.ts 平行实现）⇒ 新两型 schema 须**双站点同步加**（mailbox.ts + teammateMailbox.ts）+ poller 结构化分派支增量——此为登记债（schema 字面重复定义，0.1.94 C-1 未收敛面），本波双写、收敛登记后续波。
- lead deny/批准动作面：lead 经 SendMessage 发 shutdown_request/denied——tmux 车道 lead SendMessage 既有可达，零增量。

## 工具体副作用白名单（§7④，随判据格冻结）

RequestShutdown call 面 = **仅** writeToMailbox（shutdown_request_from_member）+ 返回文案。钉死：零 abortController 触达 / 零 taskState 终态写（shutdownRequested/isIdle 不可触）/ 零 selfTerminatePort 调用 / 零 gracefulShutdown 触达。判别格 = static 断言（工具体源不含 abort/graceful/selfTerminate/terminate 符号）+ func 测试（call 后进程存活 + taskState 无终态变化 + 信箱恰一写）。

## 落码清单预注册（段 I，批复后执行）

1. mailbox.ts：两新 schema + isStructuredProtocolMessage 白名单扩两型。
2. teammateMailbox.ts：同两 schema 双写（⑦ 登记债）。
3. requestShutdownTool.ts（engine 新）：工具体 + 在途唯一性 + deny 锁存查询面。
4. inProcessRunner.ts：runner 态锁存 Map + poll 对 shutdown_request_denied 的感知支 + new_message/shutdown_request 解锁；team-essential 8 件。
5. waitForTeammatesTool.ts：输出面 pending_requests 扩格 + lead inbox 过滤读。
6. SendMessageTool 结构化分派（sendMessageTool.ts:941-959）：shutdown_request_denied 支（lead 发起向）。
7. useInboxPoller shutdownRequests 族旁支：新类型透传（tmux 车道成员侧感知）。
8. 判别格：契约两态 func 面（新类型解析正反例）/ 防环有界格（deny 锁存跨轮 + 解锁枚举 + 在途唯一性）/ 副作用白名单 static+func / WaitForTeammates 扩格 func；bundle 结构断言按例。

## 判据面前滚确认

照工单 §3 段 G：T8 全链 + O4 名义形锚 + wdb 四套 + wdc r1/r3 + round 1-8 点名 + 新腿（RequestShutdown → lead WaitForTeammates 呈 pending → lead 批准 → 成员既有 approve 链退出 → TEAM-DELETE-OK）+ deny 支有界格 + 时窗观测格 + glm-5 row-F + canon `./tests/` 净域 + test() 直数。

## 处置

f4 批复 → 段 I 落码（本 worktree）→ 判别格 RED→GREEN → 四件套 → 段 G gate（signal e2e）→ 段 L release 0.1.96。
