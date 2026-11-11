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
