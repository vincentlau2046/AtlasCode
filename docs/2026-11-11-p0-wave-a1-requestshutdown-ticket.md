# A1 requestShutdown 工具化插入波工单（0.1.96，W-D-C 后下一位）

> 状态：`draft → 待 Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-11）。
> 上游：0.1.95 W-D-C 五段闭环终态（§11 @8f611688）；用户 2026-11-11 裁 A1「做」，排 W-D-C 后下一位。
> 性质：**新能力设计波**（非债务收敛）——新工具契约面。

---

## §0 波前审视（活码盘点 @ master 8f611688，f4 实核 2026-11-11）

### 0.1 现状机制（shutdown 面全景）

| 面 | 现状 | 依据 |
|---|---|---|
| lead→member 退出请求 | **已有**：lead 经 SendMessage 触发段发 `shutdown_request` 结构化 mailbox 消息；成员 runner poll 高优先扫描（unread 之上）；**成员模型自主 approve/deny（不自动批准）**；approve → handleShutdownApproval（port 读面 + abort + 两态诚实文案，0.1.93b/0.1.94 修形族） | inProcessRunner.ts:972/1075-1119/1646；sendMessageTool 触发段 |
| member→lead 主动退出请求 | **缺席**：成员完成任务后只能 idle 于 poll 循环等 lead 发 shutdown_request 或 TeamDelete；无工具可主动请求退出 | 全仓 grep `requestShutdown` 零命中（工具名不存在） |
| 成员自终止 seam | **部分在位**：C-2 selfTerminatePort（TUI SendMessageTool gracefulShutdown 动作经 port）——member 侧终止动作承载已有先例，但无「请求-批准」契约 | 0.1.94 §11 |
| tmux 成员车道 | shutdown_request 经 teammateMailbox 同构面（tui/utils/teammateMailbox.ts） | 文件在案 |

### 0.2 缺口定性

成员生命周期被动：**成员知道自己该退而 lead 不知道**——成员 idle 空转（poll 循环烧轮）或谎报完成；lead 须人工/轮询判断何时收队。工具化 = 成员 LLM 获得主动请求退出的一等契约，lead 保留批准权（对称于现 approve/deny 面）。

### 0.3 f4 审视自决

1. 本波 = 契约设计 + 落码 + 探针；**lead 侧消费形态（自动 vs 模型裁定）为设计核心裁定点**，lock-face 必答。
2. 复用优先：成员→lead 请求经既有 mailbox 结构化消息面（禁另起 IPC）；lead 批准后走既有 shutdown_request → 成员既有 approve 路径（两端 bookend 复用，最小新面）。
3. 防环面预注册：成员请求被拒后的重试须有界（锁存/限额），防 request-deny 循环烧轮。

## §1 波定义

- **波名**：A1 requestShutdown 工具化插入波。
- **版本**：0.1.96。
- **范围（scoped）**：成员侧新工具（候选名 `RequestShutdown`）+ lead 侧消费形态 + mailbox 契约扩面 + e2e 探针。
- **非目标**：lead 自动批准语义（批准权恒在 lead 模型/用户）、TeamDelete 语义变更、tmux 车道新机制（若 lock-face 论证 mailbox 同构面已覆盖则顺带，否则登记后续）。

## §2 Global Constraints（硬约束）

1. 新契约面 = 新工具描述/参数/mailbox 消息形，全部 lock-face 预注册报批，禁临码定形。
2. lead 批准权不弱化：成员请求**永不直接自终止**（selfTerminatePort 仅承既有 gracefulShutdown 面）；批准路径必经 lead。
3. fail-visible：请求投递失败/批准链路断 = 显式错误面，禁静默。
4. 防环有界：deny 后重试策略 lock-face 定谳（候选：锁存至新输入 / N 次限额），禁无界循环。
5. row F 预注册；判据面随 lock-face 冻结先于落码；Atlas-reveiw 波前审计。
6. canon 口径 = `--isolate ./tests/` 净域 + test() 直数（0.1.95 §10 冻结）。

## §3 工作段（预注册）

### 段 D：契约设计 lock-face（Main 报批，本波第一段）

lock-face 必答六点：
1. **工具名/参数形**：候选 `RequestShutdown(reason?: string)`；工具描述（成员 LLM 何时该用——任务自评完成/持续受阻）。
2. **消息契约**：成员→lead 请求形（候选：复用 shutdown_request 解析面加方向判 / 新消息类型 `shutdown_request_from_member`）——须与既有 isShutdownRequest 解析（lead 发起向）无歧义共存在。
3. **lead 消费形态**（核心裁定）：候选 A = 结构化消息入 lead 信箱由 lead 模型下轮裁定（批准 = lead 发既有 shutdown_request 回）；候选 B = runner 层结构化扫描 + 提示注入加速。**f4 预判：候选 A（最小面 + 批准权语义天然对称 + 零新自动语义）；B 的提速面 lock-face 用轮经济数据论证再裁**。
4. **防环有界形**：deny 后成员侧重试锁存/限额。
5. **工具注入点**：成员工具清单接线位（engine 成员 spawn 工具集；headless/TUI 双 lane 可达性）。
6. **tmux 车道覆盖**：mailbox 同构面是否零增量覆盖；否则登记后续波。

### 段 I：落码（lock-face 批复后）

工具 + mailbox 契约 + lead 消费 + 防环 + 判别格（单元：契约解析两态/防环有界/批准链路端到端 func 面；bundle 结构断言按例）。

### 段 G：gate

- 前滚复跑（硬）：①T8 全链 + ⑤ O4 名义形锚（standing）+ 0.1.94 wdb 四套 + 0.1.95 wdc 两套（r1/r3）+ round 1-8 判别格点名复跑。
- 本波判别格：契约两态 func 面 + 防环有界格 + **e2e 探针腿：成员主动 RequestShutdown → lead 批准 → TEAM-DELETE-OK 全链**（新腿，glm-5 基面 row-F 纪律）+ deny 支有界格。
- canon `./tests/` 净域 + test() 直数。

### 段 L：release 0.1.96 + 生产 lane（标准链；新工具随 CHANGELOG 呈用户-visible）

## §4 Review Focus（Atlas-reveiw 审计建议焦点）

1. 候选 A/B 取舍：结构化信箱轮裁定 vs runner 扫描注入——轮经济与批准权语义的权衡是否论证充分。
2. 消息契约与既有 isShutdownRequest 解析的歧义共存面（方向判）。
3. 防环有界形是否足够（deny 循环 / 多成员并发请求风暴面）。
4. 批准权不弱化条款（§2.2）是否可被实现形绕过（如 runner 层捷径）。
5. 版本 0.1.96 口径与前滚判据面（新增 wdc 两套）合规性。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D lock-face → 段 I 落码 → 段 G gate → 段 L。row F 全程。

## §6 D 项随呈：纲要 §10 序 4+ 具体条目（用户裁定用，随本波双信号一并列）

charter §10 排序现状（序 1-3 已闭环）：**序 4 S1a 硬化波**（六面产品面提取 ≈1 中波，可与能力波交叉）｜**序 5 Gap B sharp/image-processor-napi 未随包**（PDF 页图断链，候补插入）｜**序 6 W-D-B-1 持久化面**｜**序 7 S3 归位波**（硬前置 = 步 0 f4 零码盘点产出——盘点状态本波呈报时核）｜**序 8 W-D-B-2 UDS+TUI**（硬前置 = 卷 4 契约插桩）｜**序 9 卷 4 分析卡**（2.1.304-319 drift 窗口，分析卡可提前）｜序 10 登记债不排。达标线注记：序 4+7 完成后 = 第二产品启动决策点。

## §7 Atlas-reveiw 审计闭环（2026-11-11，有修改通过）+ f4 修订

审计锚点全实锚（requestShutdown 全仓零命中 / selfTerminatePort 双副本 / teammateMailbox 33KB / poll 高优扫描 L1035+）。**必改 1 + 吸收 4，均设计/判据面修订不动波定义，吸收后直接双信号**：

1. **【必改】段 D 六点扩七点——lead 发现路径必答**：sendMessageToLeader = 纯 mailbox 写，lead 无 poll 机械 → 候选 A 隐含未答前提「lead 经哪个既有读面发现请求」（task_notification 不承载任意 mailbox 消息 / WaitForTeammates 返回面不含 pending / lead 自主查箱无保证发现）——不答则请求无界滞留（看似已送达，比 fail-silent 更坏）。三候选：task_notification 扩面 / WaitForTeammates 返回面扩格（顺带回包 pending_requests）/ lead 查箱工具面；lock-face 须配「请求入箱→lead 裁定」时窗观测格。
2. **【吸收】消息契约预注册「新类型优先」**：新类型 `shutdown_request_from_member` 优于方向判复用——(a) 成员 poll 对 shutdown_request 高优扫描，回声/broadcast 路径回成员信箱 = 自指循环面，新类型整类消灭；(b) 方向判要求每个解析点记得查方向（§2.7 隐式约定教训同族），举证负担在复用方。
3. **【吸收】防环四补强入 lock-face**：锁存载体+持久性写死（deny 落成员 taskState 跨轮不 reset，新输入判定义枚举）/ 在途唯一性（pending 期重复请求 fail-visible）/ 双向并发态（lead shutdown_request 在途 + 成员同时请求的竞态定谳）/ deny 面形态（显式拒绝 vs 不作为两态均 fail-visible 到成员模型）。多成员并发风暴：A 形态天然有界于成员数 + 在途唯一性即足。
4. **【吸收】工具体副作用白名单判别（§2.2 技术载体）**：RequestShutdown 执行 = 仅 mailbox 写 + 返回文案；零 abortController 触达 / 零 taskState 终态写 / 零 selfTerminatePort 调用——static 断言 + func 测试双面钉死。
5. **【吸收】候选 B 终裁前置条款**：B 自带批准权弱化倾向——若终裁 B，批准权判据加「runner 扫描仅注入提示、批准动作恒经 lead 模型工具调用」结构断言；A 形态批准链零新终态写点天然满足 §2.2。

判据面前滚面确认齐备（T8/O4 standing + wdb 四套 + wdc r1/r3 + round 1-8 点名 + 新腿 RequestShutdown→批准→TEAM-DELETE-OK 复用 O4 骨架 + deny 有界格 + glm-5 row-F + canon 净域）。审计明示无需二审。→ f4 发双信号（Main=段 D lock-face 七点，e2e=探针面预告）。

## §8 f4 批复：段 D 契约 lock-face 七点（2026-11-11，@worktree 75633b36）

七点全批准，两附带条件（硬）：

1. **工具形/消息契约（①②）批准**：两新 schema 单源 mailbox.ts + isStructuredProtocolMessage 白名单同步；approve 复用既有 shutdown_request（两端 bookend 零新面）✓；deny 回执新类型与既有 shutdown_rejected 方向区分清晰 ✓。
2. **lead 发现路径 = WaitForTeammates 扩格（③）批准**——F1 勘码坐实审计必改前提（engine 车道 lead inbox 零 poll，候选 A 纯信箱写 = headless 不可达）；发现面与会合点天然重合 + engine 单源双 lane 零增量 + 不 mark read 非破坏读 ✓。时窗观测格（lead 下次 WaitForTeammates 即在场）入 e2e 腿 ✓。
3. **消费形态候选 A 维持（④）批准**：pending 经 ③ 面呈 lead 模型裁定，runner 零新终态写点，批准链 = lead 发既有 shutdown_request → 成员既有 approve 链，§2.2 天然满足。
4. **防环四补强落形（⑤）批准**：模块级 Map 按 request_id（跨成员键唯一）跨轮持久 / 在途唯一性双查 / 双向竞态「lead 请求覆盖自发在途自动失效」定谳清晰 / deny 两态均 fail-visible。
5. **注入点（⑥）批准**：engine 独立 requestShutdownTool.ts（一工具一文件惯例）零 port 面；team-essential 7→8。
6. **tmux 覆盖（⑦）批准**：同 inbox 文件 + lockfile 互斥 + engine 读面双车道同源；schema 双写 + poller 透传支登记债采纳（C-1 未收敛面延续，后续波）。

**附带条件两条（硬，入落码清单）**：
1. **lead 行为指引面同步**：WaitForTeammates 工具描述扩格（pending_requests 语义 + 批准/拒绝动作指引）+ SendMessage prompt 面新类型文档（lead 模型处置知识全依工具/prompt 描述，缺指引 = pending 呈现后不知如何裁定）——落码清单补 2 项。
2. **read 态推进点显式定谳**：pending_requests 不 mark read ⇒ 处置动作须推进 read 态（deny = 发 denied 时 mark read；approve = 发 shutdown_request 时以 request_id 关联核销）——禁 pending 永久重现噪声面（每次 WaitForTeammates 重复呈报已裁定请求）；定谳形入判别格（裁定后 pending 不再现格）。

判据面随本批复冻结：lock-face 判据面前滚确认节全项 + 工具体副作用白名单 static+func 双面 + 两附带条件判别格（指引面在场格 + 裁定后 pending 不再现格）。批复后依序落码段 I。

## §9 f4 批复：段 I 安全审查三修形（2026-11-11，row F 改形报批）

三 finding f4 源码核实成立（deny 感知支无 envelope 认证 + from 硬编码回退 / plan handler L944/L991 双 isTeamLead 门先例坐实 deny/approve handler sibling parity 违例 / body.from 盖过 envelope 三站点）。**三修形全批准，裁定 = 0.1.96 发布前必改（非后随波）**：

1. **【HIGH】deny 回执双验**：`m.from === TEAM_LEAD_NAME && parsed.to === identity.agentName`（大小写不敏感）验讫才 mark read + 锁存；return from 用验证值。防环补强 1 的认证前提修复。
2. **【MEDIUM】deny/approve handler 补 isTeamLead fail-closed 门**：与 plan handler 同款文案形（sibling parity 归位）。
3. **【MEDIUM】三站点 envelope 绑定**：collect/ownUnread 加 `req.from === m.from` 前置；两核销谓词改按 envelope m.from 匹配弃 body 字段——**方法论注记：mailbox 契约面身份字段一律以 envelope 为准，body 身份字段仅展示用途**（§2.7 隐式约定教训同族第五例，入纪律）。

加性防御不触契约形状 ✓；判别测试补 3 支（伪造 envelope 不锁存 / 非 lead deny/approve throw / body.from ≠ envelope 不呈不核销）批准入判据面。

**gate 裁定：现行在途 gate 作废重跑全套**——三修动 inProcessRunner/sendMessageTool/waitForTeammatesTool 活域（wdb-c2/c3 + wdc-r1/r3 同域 = 活回归面），「测的=发布的」禁 pre-fix gate PASS 直放 post-fix release；重跑面 = 全判据面（前滚 standing + 六套回归 + 新腿两格 + 时窗格 + 本三格）。落码 → 判别格 RED→GREEN → 四件套 → gate 重跑 → 段 L。
