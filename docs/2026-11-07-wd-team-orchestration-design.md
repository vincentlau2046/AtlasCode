# W-D 团队协作设计文档：临时小组 + 固定工作小组双形态 — 2026-11-07 f4 内部头脑风暴稿

- 状态：**设计敲定稿 v1（内部头脑风暴产出），未实施**；按用户指令下一步 = 与团队（Atlas-reveiw/Main/e2e）平衡优先级后呈用户终裁
- 用户裁定（2026-11-07）：**方案一（临时小组）与方案二（固定工作小组）并不冲突，两个都有必要实施**——一个临时、一个固定；主路线 = 对齐上游 agent teams（用户默认接受 f4 推荐，此为本稿前提）
- 事实源：`docs/2026-11-07-wd-team-orchestration-research.md`（GitHub 横评）+ `docs/2026-10-09-cross-session-uds-research.md`（UDS F1–F11）+ 本仓实查 @ d29d36aa（team/messaging/tasks 6220L 骨架）

## 1. 意图与 Why

用户要的不是单一能力，而是**两种协作形态**：
- **形态 A·临时小组**：一个任务拉起一个组（lead + 角色化成员），任务完成组即散——对应日常「这活拉个小组干了」的短周期协作，in-process 为主，秒级拉起、零持久负担。
- **形态 B·固定工作小组**：跨 session 存续的具名团队（固定角色、固定成员、可 resume）——对应像 Main/f4/e2e 这样的常设分工，成员是独立 session 进程，靠消息与共享任务板协作，组态持久化、可重连。

**Why now**：上游 2.1.319 官方 agent teams 落地（卷 4 drift 区间内）；本仓 6220L 同源骨架已在；用户显式激活。

## 2. 统一模型：一套原语，两种生命周期

**核心设计决策（本稿自决，标 f4-call）**：不做两套系统。TeamCreate/角色/消息/任务板四原语统一，**生命周期与持久化分档**：

| 维度 | 形态 A 临时小组 | 形态 B 固定工作小组 |
|---|---|---|
| 创建 | lead 在会话内 TeamCreate（in-process spawn） | 具名团队落盘（team file + 成员注册表），成员 = 独立 session |
| 成员载体 | 进程内 activation（同进程、独立上下文） | 独立 OS 进程 session（PID 注册表发现 + UDS inbox） |
| 角色 | role/goal/backstory → prompt 模板（任务级临时角色） | 固定具名角色（如 planner/implementer/tester），角色定义持久化于 team file |
| 消息 | 进程内 mailbox 队列（既有 queueManager 面） | UDS socket 跨进程 + `<cross-session-message>` 入队消费（10-09 底稿语义） |
| 任务板 | 进程内 TaskAppState（既有 tasks.ts） | 持久化任务板（同源 schema 落盘，跨 session 可见可改） |
| 生命周期 | 随 lead 会话/task 结束即散（graceful shutdown + 摘要回收） | 显式 TeamDelete 才散；成员可离线/重连/接续（durable inbox 离线消息保留） |
| 失败语义 | 成员崩溃 = lead 感知重分派 | 成员崩溃 = 组态标记 + 重连恢复（DSH S-2 continuable 语义合流点） |
| 持久化 | 无（内存） | team file + member registry + durable inbox + task store 落盘 |

**f4-call 依据**：本仓骨架本就是同源一套（teammate.ts 逐字迁移 + tasks.ts 共享），分两套必造重复；上游 agent teams 亦为统一原语（teammate = 后台任务不同档）。DSH S-2（durable continuable children：一条 Session 一 Activation）正是形态 B 成员载体的参照语义——S-2 从「W-opt 中期候补」升格为 W-D-B 构件。

## 3. Goals / Non-goals / Anti-goals

- **Goals**：① 一次操作拉起双形态组；② 角色化成员（role/goal/backstory）；③ 组内直接互发消息（direct + broadcast）+ 排队/唤醒/收尾；④ 共享任务板协作；⑤ 形态 B 跨 session 存续可 resume。
- **Non-goals**：跨机 bridge（10-09 裁定不要）；组间嵌套（组 A 成员查询组 B——claude-flow issue 面登记不做）；图形化编排器。
- **Anti-goals（做了即败）**：① 权限放大（成员继承超 lead 权限面）；② 静默丢消息（UDS 门开着但 no-op——F7 现状反例，红线）；③ 组态静默漂移（成员重启后角色/模式变化无留痕）。

## 4. 架构落点（对齐既有骨架，标 f4-call）

```
engine/tools/team/         TeamCreate/Delete/AgentCreate(拟增)/SendMessage/Snip（T1 面，扩形态 B 参数）
engine/messaging/          mailbox/queueManager/teammate（T2/T3 面）+ 形态 B：UDS inbox 真
                           实现（F6/F7 换 stub）+ durable inbox + member registry
engine/tasks/              tasks.ts 双档：in-process store（现）/ durable store（新，同 schema）
remote/                    UDS 服务器/客户端（F6/F7）+ PID 注册表（F3 补 env 导出）
tui/                       组管理呈现（T7：/team /teammates /messages 面）+ cross-session 消息组件（F10 换 null stub）
shared/                    team-file schema + 角色模板注册（单一事实源，禁散落）
```

- **门控**：`ATLAS_EXPERIMENTAL_AGENT_TEAMS` 维持默认 OFF 至 gate 闭环；形态 B 另需 `ATLAS_EXPERIMENTAL_UDS_INBOX`（F1/F2 双门激活时统一为单门——10-09 底稿 §4 裁定）。
- **角色面**：role/goal/backstory 三元组（CrewAI 词汇吸收）→ `shared/` 角色模板注册表；固定角色支持项目级定义文件（`.atlas/teams/*.md` 类，锁面定形）。
- **消息语义**（沿用上游可证语义 + AutoGen 吸收点）：排队不插队（收方下一工具回合消费）；回信 = from 拷 to；纯文本跨进程（禁结构化）；broadcast = 直发多份非共享总线（f4-call：与 mailbox 现形一致）；终止条件组合词汇（max-turns/文本确认/外部终止 OR/AND）落形态 A 组运行参数；stall 计数（Magentic-One）复用 G-1 连击守机制做组级打转对策。
- **权限 fail-closed**：成员权限 ≤ lead；跨进程消息纯文本；seeded 探针纪律适用于组面 e2e。

## 5. 备选取舍记录（头脑风暴弃案，留档防复活无据）

| 弃案 | 弃因 |
|---|---|
| 引入 AutoGen/CrewAI 作为组运行时 | 重写 6220L 同源骨架；供应链+对齐哲学双违 |
| 两套系统（临时组独立轻实现 + 固定组独立重实现） | 原语重复，消息/角色面双倍维护 |
| broadcast 共享总线（聊天室模型） | 偏离 mailbox 现形 + 消息洪泛（DSH every-batch framing 教训同族） |
| 组间嵌套 | 上游亦未做；体量失控，登记不做 |
| 形态 B 成员用子进程内嵌引擎（非独立 session） | 丢跨 session 隔离（上下文/权限独立面），与「固定工作小组」语义不符 |

## 6. 分波（优先级平衡待团队输入）

| 波 | 内容 | 依赖 |
|---|---|---|
| **W-D-A 临时小组** | TeamCreate 角色化成员 + in-process spawn 链真伪锁面直证 + mailbox 组内闭环 + 共享任务板 + graceful shutdown + 终止条件组 + stall 计数 | 骨架已在；T8 直证先行 |
| **W-D-B 固定工作小组** | team file/member registry 落盘 + UDS inbox 本体（F6/F7/F8/F9/F10 五 stub 换真）+ durable 任务板 + 重连/resume + TUI 组管理面 | W-D-A 原语闭环；S-2 语义合流；与卷 4（2.1.319 契约插桩）合流 |

体量预估：W-D-A 中（0.1.9x 一波）；W-D-B 大（或拆两波：持久化面 / UDS+TUI 面）。

## 7. 判据面预告（e2e 输入用，工单化时细化）

- 形态 A：组创建→成员 spawn→消息往返→任务板协作→shutdown 摘要回收，全链 RED↔GREEN（基线 = 门 OFF 时工具不可见）；token 预算锚；权限不放大判别。
- 形态 B：跨 session 消息直证（真双进程 seeded）；durable 面三证（kill 成员 → resume → 离线消息达 + 组态/角色不漂移）；禁静默（F7 反例探针常驻）；cmd/help 恒等 + token 对账照旧。

## 8. 本稿遗留（锁面必答候补）

① T8 spawn 链真伪直证（teamCreateTool 现形态 spawn 什么）；② team file schema 与 0.1.36 swarm TeamFile 遗产的关系；③ 上游 2.1.319 工具契约插桩直证（卷 4 范围，落码前必做——禁凭搜索摘要锁契约）；④ 形态 B 成员 session 的权限面来源。
