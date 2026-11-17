# lock-face 呈批书——S0-R4（0.1.119 候）+ 0.1.120 两波合并呈批（Main 全文落档）

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

- 日期：2026-11-16；落档：Main lane（依 S0-R4 工单 §9-4「呈批书其余件候 Main 全文落档后统一批复」）
- 工单链：S0-R4 `docs/2026-11-16-s0-r4-searchsessions-ticket.md` @f0c4d19a（审计通过在案）+ §8 三选一具名 @48ce2002 + §9 取消语义项批复 @93c7425a；0.1.120 `docs/2026-11-16-headless-usage-result-ticket.md` @3a745078 + §7 审计闭环 @641beaaf；S0-R3 §11 @f8233930（F1/F2 候选形预钉）
- 已批项不重呈：取消语义 = 选项 A 终裁（§9-1）+ 零 partial payload 钉死（§9-2）+ 格 1 中止腿（§9-2）——本文仅引用。
- 流程：本文 → f4 统一批复 → 批复即落码放行（0.1.119 在前串行）。

## 第一部分 S0-R4（0.1.119 候）

### L1 件 A：searchSessions 装配语义定形

- **搜索定义**：会话级搜索 = 在**已持久化有效会话投影**内逐消息文本匹配——会话集与 listSessions **同源**（同一 session 目录扫描 + 同序 mtime desc）；每会话经 `loadTranscriptFile(filePath, opts)`（载体形，opts 在场支 = fd 链域）取投影后逐消息 `renderableSearchText`（search.ts 真体复用，含 WeakMap 缓存与 RENDERED_AS_SENTINEL 防虚影）匹配。
- **query 匹配语义细则（呈批）**：大小写不敏感子串匹配（双侧 `toLowerCase()` 码点折叠；CJK 不受影响，无 NFD 归一——诚实最小形）；query 1-256 Unicode code points 契约既定，越界 → 契约 query 界拒（非 error 码新面）。
- **命中定位**：会话锚（listSessions 同形 session 标识）+ 消息级定位（msg uuid）；同会话多命中按消息序，跨会话按会话集序（mtime desc）。
- **分页细则（呈批）**：PageFields 契约既定（pageSize≤200）；pageToken = **opaque offset cursor**（会话列表序内偏移编码，无持久化状态机、不跨进程有效、非法 token → 契约形拒绝）——与 §8 选项 B「分页终止」区隔：分页与取消正交，每页请求独立携带 AbortSignal（A 形）。
- **扫描界**：maxScanSessions × maxParseRecords 双界，落 `src/atlascode/web/limits.ts` 单源（§9-1 ③ 已批）；界触 → resourceLimit 既有映射面。
- **装配点**：readonlyRuntime 缝（§10 映射缝同域）；engine 域零触碰（§9-1 ② 已批：loader 调用零 signal、零 load.ts 触碰）。

### L2 取消语义（已批 §9，引用不重呈）

A 查询中止 = options 加性 AbortSignal + 检查点轮询（per-session × per-record）+ 中止弃半扫 → 'cancelled' 分态（零 partial payload、已扫零泄露、格 1 中止腿）。

### L3 件 F1：授权锚定定形（§11-1 候选形成文）

- **O_NOFOLLOW**：授权支（opts 在场支）`open(filePath, flags)` flags 加 `fs.constants.O_NOFOLLOW`；**平台注记（呈批）**：O_NOFOLLOW 为 POSIX 旗标，Windows `fs.constants.O_NOFOLLOW === undefined` → 守卫跳过旗标（授权支仍有 expectIno 锚兜底；平台差如实登记非静默）。
- **expectIno 加性臂**：`loadTranscriptFile` opts 加性 `expectIno?: number`（undefined = 不锚定，默认臂与未传授权支均恒等）；授权支 open 后 `fd.stat().ino !== expectIno` → **复用 `TranscriptChangedDuringReadError`**（身份不连续域：开的文件 ≠ 授权身份 ≈ 非稳定快照同族；message 安全化已钉；**零新错误类型**——契约错误面零扩形）→ replay=ioUnavailable retryable / follow=resetRequired 既有映射面不变。
- **adapter 授权锚来源**：复用既有双采样三元组之 pre-stat（stPre.ino）传入——零新采样点。
- **缺省恒等**：默认臂（零 opts）无 O_NOFOLLOW 无 expectIno，路径形逐字节恒等含失败模式（§8-1 钉死形不破）。

### L4 件 F2：有界分配定形（§11-2 候选形成文）

- 授权支 `fd.readFile()` → **位置化分块读**：目标长 = fst.size（恒定快照）；块长复用 `TRANSCRIPT_READ_CHUNK_SIZE`；累计分配 ≤ fst.size（≤ maxBytes 已在 fstat 检查点保证）；**增长即断** = 循环只读 [0, fst.size)，读毕既有 fst2 复核（size 增长 → 复核不等 → 既有 `TranscriptChangedDuringReadError`，**禁新错误类型**）。
- 默认臂整读形恒等（含失败模式）。

### L5 载体图 / 格面（lock-face 细化）

- **search.ts 入只读闭包**：boundary scan `allowedTargetSubroots` 维持 `['src/engine/session']`（search.ts 已在域内，零改）；pack 格扩形 = search 域入闭包白名单 + 非 session 子域负腿保持；WeakMap 缓存双实例隔离 = 机制断言（缓存键 = 消息对象实例，非跨请求共享可变会话态）。
- **TUI 面**：search.ts 域位置不动；`tui/utils/transcriptSearch.ts` re-export shim 零语义变化。
- **公开类型面**：照 S0-R2 §7-4 code-form 先例——现有面 zero-add 基线 + searchSessions 新增型逐型随契约（SearchSessionsRequest/Result 面入 entry 可达公开类型面）。
- **判据格**：工单 §3 格 1-6 预注册 + §9-2 格 1 中止腿；格 2 四面回归 + 格 4 默认臂双恒等（输出+失败模式）；§10-3(a) append-during-read 防误判注记沿承。
- **锚披露预注册**：search.ts + F1/F2 入 CLI 图与 web-session-runtime 闭包 → cli.js / web-session-runtime 双锚必然变更，段 L 预记披露（补充钉①纪律）。

## 第二部分 0.1.120（issue #2）

### L6 件 1：usage 纯聚合（落点终裁 (a) 已批，细则成文）

- **聚合落点**：`buildResultMessage`（src/cli/print.ts:1369，success/error_max_turns）+ deferred（:1428）站点处从 `loopResult.messages` 内 assistant message.usage 聚合（API 权威字段，§7-2 终裁 (a)）；**零 engine 触碰**（(b) engine→cost state 写链不采）。
- **跳过细则（呈批）**：单谓词 = `type === 'assistant' && usage 在场` 才累加——synthetic/压缩边界/进度/attachment 消息天然无 usage 字段即自然跳过，零类型枚举外推、零白名单维护面。
- **wire 形**：result 事件加性 `usage` 四 token 字段 snake_case（input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens）；跨模型求和；SDKMessage 加性（num_turns 先例形），既有字段零删改。
- **error_during_execution 站点**（print.ts:1712 手拼字面量，§7-1 勘注）：usage = **缺席字段**（钉 iv 终裁）；**呈批细则候批：该站点 total_cost_usd 同缺席**——usage 缺席则成本无累加基础，诚实语义一致（与「显式 0 = 合法 0」异质：无消耗既非 0 也非未知 pricing，是无事件）。
- **三站点一致性断言**：同一聚合函数（print.ts 域内单一 helper，禁三处各算）+ 四 subtype wire 加性 diff（error 站点断言 usage/cost 双缺席）。
- **格 1 对账**：与 reqlog usage 逐回合对账（messages 求和 = 精确累加，Δ=0 应然；0.1.112 容差先例形）。

### L7 件 2：total_cost_usd——USD 计费面「首建（解除 D1）」

- **D1 翻转呈批（证据边界如实标注）**：D1 原决策文档不在仓；语境回溯唯 messages.ts:4313 + capabilities.ts:8 两码面注记 + git 考古 78624e4e 壳波随迁链（§7-3(a) 采认）。心智钉死 = **首建非重建**。
- **翻转范围分账（§7-3(b) 采认）**：解禁面仅 USD 成本计算（静态 pricing 表 + settings override，零 services/api 依赖——D1 实质理由「运行期去 services/api」不破）；modelCost 其余面（能力元数据/路由）禁顺手复活；budget_usd legacy attachment 维持 legacy。
- **pricing 模块（呈批放置位）**：**`src/cost/pricing.ts` 新独立单文件域**——禁入 modelprovider/capabilities 域（钉 i）；仅 import `capabilities.ts` K1-B① `prefix/model` 归一单源函数（钉 ii 强制复用，禁第二归一实现）；零 provider 运行期状态依赖。
- **内置表**：静态已知模型表 `{ [modelPattern]: { inputPerMTok, outputPerMTok } }`（freshness 注记：随版本发，无运行期拉取；覆盖面如实标注有限集）。
- **settings override（呈批放置位）**：settings.json 新顶层键 **`cost.pricingOverrides`**（值形 `Record<modelPattern, { inputPerMTok, outputPerMTok }>`；additive schema；缺省 = 无 override）。优先序：内置表 < override（钉 iii）；**半字段缺席**（如缺 outputPerMTok）→ 该模型 total_cost_usd 缺席（半价禁算）；**显式 0 = 合法 0**（与缺席异质，gate 判据写明）。
- **cache token 计价细则（呈批）**：pricing 表仅两价（input/output）——cache_read/cache_creation token **不计入 USD（零计入），呈批书如实注记低估面**。诚实缺席家族裁决：两价表下不伪造 cache 单价（低估可注记、伪造不可接受）；呈批候 f4 改判（若 f4 裁「cache 并入 input 价」则改表语义，实现随批复）。
- **聚合**：与件 1 同站点同 helper 累计（usage×pricing）；unknown 模型（归一后不匹配内置表且无 override）→ 字段**缺席**（禁伪造 0，fail-closed）。
- **wire 形**：result 事件加性 `total_cost_usd: number`（缺席 = 字段不出现，非 null）。

### L8 判据格（工单 §3 + §7 终裁对表）

格 1 usage 三站点（error 站点双缺席断言）+ reqlog 对账 Δ=0；格 2 total_cost_usd 三分形（known 精算 / override 覆盖 / unknown 缺席零伪造 0）+ 显式 0 = 合法 0 判据 + 半字段缺席判据；格 3 兼容（既有 result wire 零破坏加性 diff + TUI/print 文本零变化 + drain 序零变化）；格 4 canon 恰合。

## 流程与串行

0.1.119（S0-R4：L1-L5）段 I → gate（格 1-6）→ 段 L → 生产 lane → 单信号 Atlasweb-F4（四面闭环 + 格 D search 腿解阻）→ 0.1.120（L6-L8）同链串行 → issue #2 回执销项。本文批复即两波落码放行（0.1.119 在前）。
