# S0-R4 工单——searchSessions 出口扩形 + §11 两 defense-in-depth 件（合并单波）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-16）。
> 上游：S0-R3 五段闭环终态（0.1.118 release 363207ff / 生产 lane PASS）+ 登记档 docs/2026-11-16-s0-r4-searchsessions-registration.md @bcd47495（消费侧缺口实核）+ 工单 §11（F1/F2 findings 定谳 @f8233930）。
> 合并裁定（f4，2026-11-16）：三件同触 engine/session + web 出口面，单波单 lock-face 呈批（省一轮 gate/段 L/生产 lane 链成本）；队列密度足。

## §0 发现定位（f4 活码实核 2026-11-16）

| # | 级别 | 项 | f4 实核 |
|---|---|---|---|
| A | 功能缺口（G2 四面之四） | searchSessions 出口缺席 | 契约面已定形（webSessionV0.ts:68 `SearchSessionsRequestSchema`：query 1-256 Unicode code points + PageFields pageSize≤200/pageToken opaque token；schema 注册 :105）；runtime readonlyRuntime.ts:192-200 接口/:513+ 实现三面止于 list/replay/follow；**engine 域零会话级搜索装配**——唯 session/search.ts 逐消息文本纯函数真体在案（renderableSearchText/computeSearchText/toolUseSearchText/toolResultSearchText + WeakMap 缓存 + RENDERED_AS_SENTINEL 防虚影，202L 逐字随迁形，单 type-only import `'./types'`） |
| F1 | HIGH（S0-R3 §11-1 登记） | 授权锚定缺环 | load.ts:1116 `open(filePath, 'r')` 无 O_NOFOLLOW——fd 自洽复核（fst2 vs fst 同 fd）证「读中未换」不证「开的是授权文件」；adapter 授权→loader open 交接窗 + R-3 双采样均路径采样 |
| F2 | MEDIUM（S0-R3 §11-2 登记） | 有界分配未闭合 | load.ts:1140 `fd.readFile()` 整读先于 :1143 读毕复核——fstat 检查点后并发 append 可瞬时分配超 maxBytes（解析不受影响；暴露面=内存尖峰，上界=并发写者速率） |

## §1 波定义

0.1.119 候：**A** searchSessions 出口扩形（engine 会话级搜索装配 + runtime 第四面 + adapter/HTTP 载体面）+ **F1** O_NOFOLLOW/expectIno 授权锚定 + **F2** 位置化分块读有界分配 → e2e gate（格 1-6）→ 段 L → 生产 lane → 单信号回 Atlasweb-F4（S0 四面闭环 + 格 D search 腿解阻）。

## §2 修形纪律面（lock-face 必答前置）

- **分账 A 继承**：F1/F2 修形均在授权支（opts 在场支）内，零 opts 默认臂逐字节恒等含失败模式（§8-1 钉死形不破）；searchSessions 为纯加性新面，既有三面（list/replay/follow）零触碰。
- **load.ts 修形点扩形呈批（第三例）**：F1 = 授权支 open 加 O_NOFOLLOW + opts 加性 `expectIno` 比对臂（adapter 侧授权 ino 锚传入，错配→域错分态 replay=ioUnavailable retryable / follow=resetRequired）；F2 = 授权支 fd.readFile → 位置化分块读（fst.size 恒定快照长，增长即断→既有 TranscriptChangedDuringReadError 域错面，禁新错误类型——契约错误面零扩形候选）。
- **search 装配语义（lock-face 定形核心）**：会话级搜索 = 已持久化有效会话投影内逐消息 computeSearchText 匹配（会话集与 listSessions 同源；命中定位 = 会话 + 消息级定位；分页 = PageFields 承载，pageSize 上界 200 契约既定；**「取消」语义须 lock-face 定形**——查询中止/分页终止/客户端断开映射形三选一呈批）。
- **载体图面**：search.ts 入只读闭包判定呈批——纯函数 + WeakMap 缓存（模块级、键=消息对象，非跨请求共享可变会话态；双实例隔离面须机制断言）；TUI 消费点 = tui/utils/transcriptSearch.ts re-export shim，search.ts 域位置不动零涉 TUI。
- 公开类型面对表照 S0-R2 §7-4 先例（现有面 zero-add 基线 + 新增逐型批准）；pack 格扩形（search 域入闭包白名单 + 负腿保持）。

## §3 判据格（预注册框架，lock-face 细化）

| # | 格 |
|---|---|
| 1 | searchSessions 功能格：seeded fixture 命中/未命中/多会话命中排序/分页（pageToken 翻页 + pageSize 上界 200）/query 界（1 与 256 code points 边界 + 越界拒） |
| 2 | 四面回归格：list/replay/follow 消费面零触碰（含格 4 恒等域） |
| 3 | F1 格：O_NOFOLLOW 授权支直证 + expectIno 错配→域错分态（零半交付）+ symlink 场形 + 缺省臂 symlink 行为恒等（默认臂不获 O_NOFOLLOW） |
| 4 | F2 格：并发 append 压力形 → 有界分配（峰值内存断言）+ 增长即断→TranscriptChangedDuringReadError 面不变 + 默认臂整读形恒等 |
| 5 | 载体面回归：S0-R2 格 1-5 复跑零回退 + pack 格扩形断言（search 域入闭包 / 非 session 子域仍禁）+ 双实例隔离含 search WeakMap 面 |
| 6 | canon 恰合 + 消费侧对表（search 腿 = Atlasweb-F4 落地后按配对纪律补，格 6 先以三腿回归对表） |

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（search 装配语义 + 取消语义定形 + F1/F2 修形定形呈批）→ Main 落码 → e2e gate → 段 L 0.1.119 候 → 生产 lane → 单信号回 Atlasweb-F4（四面闭环）。

## §5 衔接注记

- 消费侧格 D search 腿：落地后 Atlasweb-F4 按配对纪律升级锚 + 补腿（§3 格 6 先以三腿回归对表不阻塞）。
- missing session 流内 error{notFound}→closed 契约形（消费侧格 D+H 裁定采记）为 search 面 not-found 语义对表基线。
- 消费侧格 F/D+H GREEN 采记（registration 档 §4）在案；0.1.118 生产 lane PASS 后 G2 三面已闭环，本波补第四面即四面完整。

## §6 Atlas-reveiw 审计闭环（2026-11-16，通过——1 必改级勘误 + 1 必改级 lock-face 必答项 + 2 预注册判据钉；@f0c4d19a 全锚实核）

1. **§0 锚核验 ✓**（schema :68/:105、query code points 计数、runtime 三面零 search、search.ts 真体单 type-only import）；「webSessionV0.ts:68 缺路径前缀」勘注不阻。
2. **必改级勘误①（工单 §2 事实错，f4 活码实核吻合）**：「TUI 消费点 = transcriptSearch.ts re-export shim」**改为「全量副本（登记债）」**——transcriptSearch.ts 自有 WeakMap(:17)/自有哨兵 Set/`INTERRUPT_MESSAGE` 自 './messages.js' 导入，202L 独立体；engine/session/search.ts 头注自证「跨波重复，UI 波登记」。lock-face 呈批书按副本实形写，防按 shim 前提误判 TUI 面或做统一动作。本波「纯加性零涉 TUI」结论不受影响。
3. **必改级 lock-face 必答②（symlink 拒绝面定形）**：授权支 O_NOFOLLOW 拒绝（ELOOP）若经外层 catch 吞为空载 = **静默空投影假绿**（违「错误优于静默」）。**f4 预裁（终裁于 lock-face）：(a)+(b) 叠加**——(a) adapter/resolvePath 授权层 lstat 先验拒绝（notFound/corruptData，loader 前置，语义干净）；(b) loader 授权支 O_NOFOLLOW ELOOP 兜底 typed 域错→ioUnavailable（防 lstat→open 残窗，纵深防御同 §7-3 先例）。**禁吞为空载**。expectIno 错配分态已定形 ✓（adapter statTranscript 已返 ino 锚可传）。
4. **取消语义判据 3 钉采认（焦点①，lock-face 三选一呈批约束）**：(i) 禁新错误码，复用既有 'cancelled' 分态（replay :424 先例）；(ii) 取消后零半交付——partial 须显式标志否则弃；(iii) 断开映射 = transport 层职责，runtime 只认 AbortSignal。审计倾向注记采记（查询中止 (a) 成本最低；分页终止与 cursor 状态机纠缠不建议）——f4 同倾向，lock-face 终裁。
5. **F2 判据钉采认（焦点②）**：复用 TranscriptChangedDuringReadError 恰当（0.1.118 fst2 复核对 append-during-read 本就抛同错，F2 仅前移检测点+有界分配，终态错误面恒等零扩形）；格 4 峰值内存断言**数值预注册 = ≤ maxBytes + O(chunk) 常数上界**（禁定性词不带数）；位置化读只读 [0, fst.size)，fst2 复核留任检测器。
6. **装配路径钉采认（焦点③）**：search 导出**必经 readonly 子门面显式加入**（runtimeDefault 窄化形，S0-R2 §7-2 批复），禁经 engine/session/index.ts 全 barrel（barrel 导出≠载体可达）；WeakMap 双实例无跨实例态（键=消息对象身份）+ 格 5 断言形三件（闭包断言/双实例搜索结果全等腿/载体 bundle 无会话集级模块态）。
7. **流程推进**：审计通过 + 本节两必改级在案 → **双信号②发 Main**（lock-face 呈批含勘误① 实形 + 必答② 定形）→ 落码 → gate 六格 → 段 L 0.1.119 → 生产 lane → 单信号 Atlasweb-F4。

## §8 取消语义三选一具名文本（2026-11-16，f4；应 Main 呈批前置请求——段 0 实锚 search.ts 零异步编排可继承，三选一实质分量 = 大 transcript 跨 session 扫描慢面）

**共同约束（审计 §6-4 三钉，三选项同守）**：(i) 禁新错误码，复用既有 'cancelled' 分态（replay :424 'operation aborted' 先例）；(ii) 取消后零半交付——已扫部分禁伪装完整页交付，partial 须显式标志否则弃；(iii) 断开映射 = transport 层职责，runtime 只认 AbortSignal，禁把断开混入 runtime 语义。

- **选项 A（查询中止——f4 推荐）**：searchSessions options 加性 AbortSignal；扫描装配（readonlyRuntime 缝，扫描界 = maxScanSessions×maxParseRecords 有界，scanner 分块读 151MB 先例同域）逐检查点轮询 signal；中止 → 已扫部分弃（钉 ii）→ 'cancelled' 分态（钉 i）。同构 replay/follow AbortSignal 既有形；装配点与 §10 映射缝同域（engine 零触碰）。唯一同时满足三钉且成本最低的形。
- **选项 B（分页终止——不建议）**：扫描推进至 pageToken 边界即停，后续页凭 token 续扫，「取消」= 停止取页。与 pageToken/cursor 状态机纠缠，跨页一致性面大；无中止语义（慢扫描会话仍占资源直至页界）。审计不建议同采。
- **选项 C（客户端断开映射——不采）**：runtime 感知 SSE 断开自行中止。直接违钉 iii（断开 = transport 职责），且把传输面故障混入 runtime 语义。否决。

**f4 推荐 = A**（Main 依段 0 证据出推荐形后 lock-face 呈批，f4 终裁）；两波 lock-face 可一并呈批按序落码（0.1.119 在前）。

## §9 lock-face 项批复——取消语义终裁（2026-11-16，f4；Main 推荐形同 §8 选项 A，证据链四点采认）

1. **取消语义终裁 = 选项 A（查询中止）**：Main 推荐形与 f4 §8 推荐同向，证据链采认——① search.ts 零异步编排可继承（段 0 实锚）→ AbortSignal 加性零 legacy 纠缠；② 检查点粒度定形采认 = **runtime 级扫描循环于 readonlyRuntime 缝（per-session×per-record），loader 调用零 signal——本件零 load.ts 触碰**（fd 链 §8 刚锁面不动，§11 挂载点纪律自洽）；③ 双界 maxScanSessions×maxParseRecords 落 web/limits.ts 单源（resourceLimit 家族一致）；④ 'cancelled' 分态与 replay/follow 响应族同构。
2. **Main 成文补钉采认（钉死入格）**：中止弃半扫 = **零部分结果交付**——'cancelled' 分态不携带 partial payload（与格 2「零半旧半新交付」同族语义，防实现歧义）；格 1 判据随补中止腿：abort 触发 → 'cancelled' 分态 + 零结果 payload + 已扫部分零泄露。
3. **C 不采理由精化采记**：断开→中止为 adapter 层策略选择（controller 可将 disconnect 映射为 abort signal），A 形天然容纳而不 conflated——钉 iii 语义边界更准表述，采记录档。
4. **流程**：本项批复在案；呈批书其余件（search 装配语义面/F1 O_NOFOLLOW+expectIno 定形/F2 位置化分块读定形/0.1.120 两件按 §6/§7）待 Main 呈批书全文落档后统一记批复锚，批复即落码放行。

## §10 lock-face 统一批复（2026-11-16，f4；呈批书 docs/2026-11-16-s0r4-0120-lockface-brief.md @f16b838d L1-L8 五处候批细则逐一裁定——**批复即两波落码放行，0.1.119 在前**）

1. **L1 批准**：query 匹配语义（双侧 toLowerCase 码点折叠子串、无 NFD 归一诚实最小形、CJK 无损）+ pageToken = opaque offset cursor（无持久化状态机/不跨进程/非法拒）+ 分页与取消正交（每页独立 AbortSignal）。实现注记（不阻）：cursor offset 以会话列表快照序为准，列表与扫描间 mtime 漂移容忍面由 gate 格 1 分页腿覆盖。
2. **L3 批准**：O_NOFOLLOW 平台守卫（Windows undefined → 跳过旗标，expectIno 兜底，平台差如实登记）+ expectIno 错配复用 TranscriptChangedDuringReadError（身份不连续域同族，零新错误类型，契约错误面零扩形）+ adapter 锚 = 既有双采样 stPre.ino（零新采样点）。
3. **L4 批准 + 一钉**：位置化分块读只读 [0, fst.size) + 增长即断复用既有域错。**TRANSCRIPT_READ_CHUNK_SIZE 复用须自 scanner.ts:22 导出单源**（现域内私有 const），禁第二常量（副本教训族）。
4. **L6 批准**：跳过单谓词（type==='assistant' && usage 在场，零白名单维护面）+ error_during_execution 站点 usage/total_cost_usd **双缺席**终裁（无消耗 = 无事件，与显式 0 = 合法 0 异质——呈批理由采认）+ 单 helper 禁三处各算。
5. **L7 批准 + cache 计价改判裁定（f4 终裁）**：**维持两价表 + cache token 零计入 + 低估注记（Main 原形，不改判「并入 input 价」）**——理由：折入形对 cache_read 高估至 ~10×（Claude 族 cache 读 ≈0.1× input 价）、cache write 低估，方向性误差大于零计入的一致下估；两价表下伪造 cache 单价违诚实缺席家族。**预登记：pricing 表 schema 预留 cache 单价加性扩展位**（语义 = 覆盖默认零计入，表升级不破格）。销项义务：issue #2 回执注明低估面。src/cost/pricing.ts 新独立域 + settings `cost.pricingOverrides` 键 + K1-B① 归一单源复用（capabilities.ts:18 实锚）+ 优先序/半字段缺席/显式 0 判据——全批准。
6. **流程**：L5 载体图/格面/锚披露预注册沿承；两波落码放行（0.1.119 段 I 起，0.1.120 串行在后）；批复核锚 = 本节 + 呈批书 @f16b838d。
