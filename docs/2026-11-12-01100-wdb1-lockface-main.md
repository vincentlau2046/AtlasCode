# 0.1.100 W-D-B-1 段 D lock-face 终形（六点+七条，Main 落码前呈批）

> 工单 `docs/2026-11-12-p0-wave-01100-wdb1-persistence-ticket.md` @15382533；
> 活码实核 @ master 15382533（Main 2026-11-12）。row F：本文件呈 f4 批复后
> 方落码；判据面随本文件冻结。

## §0 活码实核锚（波前审视补全）

- Form A 门：`teamCreateTool.ts:261-267`——`writeTeamFileAsync` +
  `registerTeamForSessionCleanup` 两写入点门掉，组态唯一承载 = teamContext
  内存态（roster 名册含）。leadModel 裁除注释（260 行）注明 durable 回填。
- TeamFile 三副本现状：`src/swarm/teamHelpers.ts:107`（engine 门面源）/
  `src/tui/utils/swarm/teamHelpers.ts:65`（tui 副本）/ 
  `TeamServicesFile` 鸭子镜像（`engine/tools/team/teamServices.ts:38`，
  字段子集）。0.1.36 旧 TeamFile = 无版本字段全量形。
- inbox 文件面双车道：engine `messaging/mailbox.ts`（~/.atlas/teams/<t>/
  inboxes/<a>.json，8 型结构化协议 schema 单源）+ tui `utils/
  teammateMailbox.ts`（1260L tmux 车道同文件面副本）。
- task 面：teams tasks 文件面（resetTaskList/ensureTasksDir）已有；
  taskState（abort/isIdle/shutdownRequested）= 内存态。

## §1 D-① team file schema 形（含 0.1.36 遗产定谳）

**单源新文件 `src/shared/teamFileSchema.ts`**（shared = engine/tui/swarm
三方可达；zod schema + 版本常量 + 类型导出单点）：

```ts
TEAM_FILE_SCHEMA_VERSION = 2
TeamFileV2 = {
  schemaVersion: 2
  name: string; description?: string
  createdAt: number; leadAgentId: string; leadSessionId?: string
  leadModel?: string            // 0.1.93 裁除回填位（Form A 注记 260 行）
  persistence: 'durable'        // v2 恒 'durable'（写入即 durable 支）
  leadInstanceId: string        // 七条(b) 二次验证锚（boot 级 instance id）
  roster?: TeamRosterEntry[]    // 自 teamServices TeamRosterEntry 单源收编
  members: TeamMemberV2[]       // TeamServicesFile member 面全量 +
                                //   prompt/color/planModeRequired/sessionId/
                                //   backendType/mode（0.1.36 全量字段收编）
}
```

- **0.1.36 遗产 = 弃置定谳**：无 `schemaVersion` 文件 = foreign 拒读
  （fail-visible 错误面含测得版本/缺失与迁移指引），零迁移、零降级半解析
  （工单 §6 吸收③）。归一须另立迁移判据，本波不做。
- **副本收敛**：swarm/tui 两 TeamFile 副本与 TeamServicesFile 镜像改
  re-export / import shared 单源（双副本教训 §2.3 消解）；TeamServices
  接口签名不变（镜像类型面指向单源）。
- **演进策略 = 拒读 fail-visible 默认**：`schemaVersion !== 2`（缺失/更高/
  更低）→ 显式错误面（含版本值 + 指引），禁静默降级。

## §2 D-② durable 触发时机与崩溃窗口

- **写入时点 = 事件驱动（无定时器/无周期 flush）**：① TeamCreate 成功
  （durable 支）一次写 lead entry + roster；② registerSpawnedTeammate
  durable 支重写（成员追加）；③ 成员态迁移点（isActive 翻转 / TeamDelete
  清面前）重写。读路径 resume relink（§3）+ TeamDelete active-member 守卫。
- **崩溃窗口两定形**：
  - 原子写 tmp+rename（`config.json.tmp-<pid>` → rename）：写中 kill，
    reader 见旧全量态，零 partial；
  - tmp 孤儿清扫：读路径发现 tmp 残留 → fail-visible 告警行 + 清扫（不静默）；
  - **stale lock 恢复策略（必答，观察池两现项）**：lockfile
    `config.json.lock`，夺锁双门 = mtime 年龄 > `STALE_LOCK_MS`（10s）
    **且** lock 内容 PID 进程不存活（双条件与，任一不满足 = 等待重试，
    有界 3 次后 fail-visible 报错不夺锁）；夺锁成功记 fail-visible 告警
    （禁静默夺锁）。

## §3 D-③ member registry relink 形（三判据）

- **回读点**：lead 进程启动 + resume 时，durable 支下探测
  `getTeamFilePath(teamName)`（teamName 来自 lead 会话态；无会话态不探测）。
  v2 文件在场 → teamContext 回填（roster + members 全量）。
- **三判据**：
  1. **半挂接标记 fail-visible**：文件成员条目在 / 本进程无对应活跃 task
     → 条目标记 `halfAttached: true`（内存态标记，禁静默重建、禁静默当作
     活着；TeamDelete active-member 守卫跳过 halfAttached 条目并在输出
     面列出）；
  2. **PID/instance 二次验证前置**：回读先比对 `leadInstanceId` ≠ 本进程
     instance → 全员 halfAttached（含 lead 自身条目重挂接）；
  3. **kill→resume→标记可见判据格**：写文件（含成员）→ 新进程 relink →
     断言 halfAttached 标记可达且输出面可见。
- Form A in-process 成员无独立 PID：halfAttached 判据 = task registry
  查表（taskId 不在本进程 taskState = 半挂接），不引入伪 PID。

## §4 D-④ durable inbox 载体（单源 + tmux 同源）

- **载体 = 文件面基座**（现有 `~/.atlas/teams/<t>/inboxes/<a>.json` 即
  持久载体；mailbox 内存 store 定位 = 缓存/队列层，非第二事实源）。
- **schema 单源 shared 新模块 `src/shared/teamInboxSchema.ts`**：inbox
  文件信封（消息数组 + `schemaVersion` + 满载上界常量）+ 读写原子原语
  （tmp+rename 同 §2）单点。engine `messaging/mailbox.ts` 与 tui
  `utils/teammateMailbox.ts`（tmux 车道）双双改消费单源——**禁第三副本**
  （两车道消费同一 schema 模块 = 同源约束落地）。
- **满载策略**：`MAX_INBOX_MESSAGES`（200）满载 → 拒收 + fail-visible
  告警面（含当前长度/上界），**禁静默丢最旧**（工单 §6 必改 2(e)）。
- **ack 完整性口径**：mark-read 持久化写回（原子写同上）；F7 durable 形
  回归防 = ack 后进程 kill，重读 ack 态保持。

## §5 D-⑤ task store 范围裁定

**裁定 = task store 不 durable（零持久维持）**。理由：taskState
（abort/isIdle/shutdownRequested）语义绑本进程 task registry；resume 后
无对应进程，落盘无消费 = 孤儿破口（§2.2 禁令逆用）；teams tasks 文件面
（taskList 目录）已是持久面，维持现状。落盘只做 team file + inbox 两面
（写入回读者齐备域）。

## §6 D-⑥ TeamDelete/TeamCreate 与持久面交互

- **TeamCreate（durable 支）**：写 v2 schema + `registerTeamForSessionCleanup`
  恢复注册（两写入点解门，仍受 durable 门控）；**OFF 支**：现行为逐字不变
  （零写盘 standing 断言）。
- **TeamDelete**：清面语义扩展 = `cleanupTeamDirectories`（现有，durable
  支）+ inbox 文件清面（现有 TeamDelete rm inboxes 行为保持）+ durable
  支下先读文件走 active-member 守卫（halfAttached 条目跳过 + 输出面列出）。
- **门 OFF 残留态 fail-visible**：durable 门 OFF 但 team file v2 在场
  （用户切档/残留）→ TeamCreate 输出面 fail-visible 提示残留文件路径与
  处置指引（禁静默覆盖/禁静默无视）。

## §7 七条（schema 审计四条 + 三定形，全入实现面）

| # | 条目 | 实现锚 |
|---|---|---|
| a | 落盘文件 = 不可信输入 | 回读走 zod schema 白名单校验（§1），未知字段剥除；roster role/goal/backstory 渲染前纯文本校验（禁指令形字段直通 prompt 前置面——prompt 渲染层已有转义，本条 = 结构面白名单） |
| b | PID/instance 二次验证 | `leadInstanceId`（§1/§3）+ halfAttached 判据前置 |
| c | lockfile + 原子写 | §2（tmp+rename + stale lock 双门夺锁） |
| d | 跨进程消息来源标注防伪 | inbox 信封消息 `source` 字段白名单（'lead'\|'teammate'）+ 非 lead 来源的 permission/shutdown 类协议消息消费前置校验（非用户批准不可执行面维持 0.1.96 requestShutdown 语义） |
| e | 满载策略 | §4（fail-visible 拒收，禁静默丢最旧） |
| f | 门 OFF 残留态 | §6（fail-visible 提示面） |
| g | ack 完整性 | §4（mark-read 持久化 + F7 回归防格） |

## §8 durable 档门（F1 分档形，禁 product-conditional 旁路）

- **门 = settings.json `teams.persistence`**：`'memory'`（缺省，Form A
  零持久现网逐字不变）| `'durable'`（本波新档）。
- **产品差异经 ProductDefinition 字段消费**（与 toolSubset/configDirName
  同构）：可选 `teamPersistenceDefault?: 'memory' | 'durable'` 只作
  settings 缺省回落，读写点禁 product id 条件旁路（工单 §6 吸收①）。
- **判别源双源化域级纪律**（§2.4）：门读点 = engine/tui 各经注入面读
  settings，禁裸单源 lane 判据。
- **OFF 恒等判据**：门 OFF（含缺省）→ 全部持久代码路径不可达，Form A
  「全程零写盘」standing 断言原样保留（e2e 面零变更）。

## §9 段 G 判据面（冻结，先于落码）

1. Form A 零写盘 standing 断言不变（OFF 全路径零写盘，门 ON 亦零写盘）。
2. durable 档 OFF 缺省探针格 + atlascode config 域默认恒等格。
3. durable 往返格：写（TeamCreate durable 支）→ 读（relink）→ teamContext
   回填逐字段。
4. 孤儿清理格：TeamDelete 清面 + tmp 孤儿清扫 fail-visible。
5. schema 演进格：无版本/异版本文件 → 拒读 fail-visible（禁半解析）。
6. 半挂接标记格：kill→resume→halfAttached 可见（三判据③）。
7. 崩溃窗口格：原子写（写中 reader 见旧态）+ stale lock 双门夺锁
   （双条件与 + 有界重试 + fail-visible）。
8. tmux 双车道同源格：engine/tui 两车道消费同一 shared schema 模块
   （import 面断言）。
9. 满载拒收格 + ack 持久化格（F7 防）。
10. 前滚 standing 0.1.99 面 + canon 净域。

## §10 落码切片序（段 I 预告）

S1 `src/shared/teamFileSchema.ts` + 副本收敛 → S2 durable 门 + TeamCreate/
TeamDelete 支路 → S3 relink + halfAttached → S4 `src/shared/
teamInboxSchema.ts` + 双车道收敛 + 满载/ack → S5 判据格族（§9 全单）→
四件套 → 段 G。
