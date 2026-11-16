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
