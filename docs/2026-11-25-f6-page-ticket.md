# F6-PAGE 正式工单——内容分页公开接口补洞（产品总放行阻格销项）

> 状态：`f4 波前方案+审视 → Atlas-reveiw 审计 → 双信号 Main 落码`。f4 起草（2026-11-25）。
> 用户授权：2026-11-25「继续完成遗留项的实施」（遗留项清盘中唯一实质阻格 = 本格）。
> 出典：原 F6 page 补洞义务（S0 agreement §3.2 明文保留：「S0 replacement 方案不自动核销；若要替代须用户明确裁定」）；A4 拆格（recovery plan §A4）；a5 verdict 钉格「F6-PAGE 缺接口格：无内容分页公开接口；阻产品总放行」（`AtlasWeb:docs/2026-11-21-first-wave-a5-verdict.md`）。本波 = **履行原义务**（非替代案，无需用户另裁替代）。

## §0 波定义与活码重核（@ 2026-11-25 双仓实核）

- **上位依据**：S0 agreement §3.2 F6 行 + §4「正式工单必须逐项冻结：页大小…cursor 是单调数值还是 opaque token 须在工单明确」+ recovery design §2.3「F6 原 page 补洞义务独立审视并保留；基线替换的测试不能代替缺页格」。
- **格定义（a5 verdict 措辞为准）**：补齐**内容分页公开接口**——长转录内容可分页读取，超帽内容不再不可达。
- **活码重核 F1（缺口面实证）**：
  - carrier `src/atlascode/web/readonlyRuntime.ts`：`ReplaySessionRequest = {scopeId, sessionId}` 零分页参（:158-161）；`replaySession` = 一次性全量 `loadProjection`（:814-822）；超帽（maxTranscriptBytes 64MiB / maxParseRecords 100k / maxProjectionBytes 4MiB）→ `resourceLimit` 抛错，**长转录内容不可达**。
  - `ListSessionsRequest = {scopeId}` 零分页参；全量返回，帽 = DEFAULT_MAX_SCAN_SESSIONS 4096 → 越界 resourceLimit（:645-660）。
  - **域内先例（复用形）**：search 面已落分页（`SearchSessionsRequest.pageToken` opaque offset cursor + `pageSize` 帽 DEFAULT_PAGE_SIZE=50；malformed token → invalidRequest；mtime 漂移容忍 = 越界空页；页粒度=会话边界）——:686-712 实读。
  - **非替代面**：follow 面 cursor/baseline = F1 域（断线续读），S0 §3.2 + recovery design §2.3 双明文**不得当 F6 验收替代**。
- **活码重核 F2（消费面）**：web-host 四路由 GET 形，list/replay 路由透传零分页参；web-code transport + react-virtual 全量占位读取。web-host 执行面 SSE cursor 透传先例（?cursor= opaque）在档。
- **活码重核 F3（bump 面）**：carrier 改动 → 0.1.128（版本契约默认 0.1.x）；AtlasWeb 载体 dep 行变更 → bump 判据 (a) 完整重验 + 段 L 呈批（L4 双 org 候用户亲署——流程内既定，非本波新增决策）。

## §1 任务分解（3 切片 + gate）

| 切片 | 内容 | 仓/主责 |
|---|---|---|
| S1 | carrier 契约+限额冻结+runtime 分页实现+单测（RED 先行）：`ReplaySessionRequest` 增 optional `pageToken`/`pageSize`（加性兼容，缺省 = 旧全量 replay 零变更）；`ReplaySessionResult` 增 optional `nextPageToken`/`hasMore`；token 形 = opaque 序数串（search pageToken 同族，**域 = scopeId+sessionId 绑定**）；页粒度 = 有效投影链记录序（消息边界）；漂移分态 = compact/replace/序数失效 → 显式 `cursorExpired` 分态（禁错页静默）；新限额单源 limits.ts | AtlasCode / Main |
| S2 | web-host 路由透传（GET /sessions/:id/replay `?pageToken=&pageSize=`）+ 404/403/400 fail-closed 对表 + fixture 测试；web-code transport optional 透传（UI 消费 = 登记项非本波格，见 §5 自决 4） | AtlasWeb / Main |
| S3 | e2e fetch 级判据腿（判据格 3 全表）+ gate + 生产 lane；段 L 0.1.128 双 org 发布（增列清单常规） | e2e lane / Main |

每片收口：RED 先行 → 实现绿 → 全仓回归绿 → commit。

## §2 判据格

| # | 格 |
|---|---|
| 1 | **冻结数值面（S0 §4 逐项）**：页大小默认 50 记录（DEFAULT_PAGE_SIZE 单源复用）、硬帽 200（新 limits 常量，validateBoundedInt 同形）；pageSize 超帽行为 = **clamp 至帽**（search 面同形 :706）；token malformed → `invalidRequest`；域外 token（跨 session/scope 重放）→ `invalidRequest`（域绑定校验）；序数失效（compact/replace/truncate 后）→ `cursorExpired` 显式分态；边界 ±1 腿（首页/末页/恰尽/越界空页） |
| 2 | **加性兼容**：无分页参 = 旧全量 replay 行为逐字节不变（既有套件零改动全绿为证）；旧消费者（0.1.127 web-host）对新 carrier 零破坏 |
| 3 | **e2e fetch 腿**：长转录（>1 页样本）分页走通、token 续页恰一无重无漏、append 后旧 token 前缀稳定、compact 后 token → cursorExpired、malformed/域外 → invalidRequest、全量路径回归不退 |
| 4 | **不动面**：follow/list/search 三面行为零变更（search 分页先例面只读不改）；G1/G2 admitted 保持；web-code 只读词表负腿保持（本波零新 UI 词汇面） |
| 5 | **收口**：e2e gate → 生产 lane → 段 L 0.1.128 双 org → **F6-PAGE 格销项呈报**（a5 verdict 挂账行翻转由 f4 落档） |

## §3 风险登记

R1 漂移语义复杂度（compact/replace 中间态 token 指向错页）→ S1 判据格 1 显式分态 + 负腿直证；R2 加性改契约占 contract v0 冻结面 → 加性 optional 字段不破 schemaVersion，契约测试随片；R3 载体 bump 连锁（AtlasWeb pin + 格 J 锚重出证）→ 段 L 既定链，不新设捷径；R4 UI 消费缺席被误读为格未销 → 格措辞 = 公开接口（a5 verdict 原文），UI 消费登记显性（§5 自决 4）。

## §4 审计焦点预钉（f4）

1. **token 域绑定与漂移分态**：域绑定校验形（scopeId+sessionId+序数三要素）与 cursorExpired 触发面是否逐分态独立判据腿（f4 预判：须，禁聚合单腿）。
2. **加性兼容证法**：零分页参路径「逐字节不变」的判据形（f4 预判：既有 replay 套件原样全绿 + 新增显式对表腿，禁「应该不变」口头断言）。
3. **页粒度定义**：有效投影链记录序（terminal leaf 同规则）与 search 面会话边界粒度的同异性须显性（f4 预判：内容页 = 记录序，与 search 页不同粒度，各自判据独立）。
4. **limits 冻结数值复核**：50/200 与 clamp 形是否合 S0 §4「数值、单位、默认/硬上限、超限错误或重置行为、边界±1」全项（f4 预判：合，帽值可由审计按实测调，调值入档）。

## §5 审视记录（逐点自决；无硬报裁项）

- **自决 1（履行 vs 替代）**：本波 = 履行原义务（补分页接口），不走 S0 §3.2 替代报裁路径——replacement 需用户明确裁定，本波不触。
- **自决 2（范围）**：核心格 = **replay 内容分页**（a5 verdict 措辞「内容分页」逐字）；list 面分页 = 登记候选（4096 帽为资源界非阅读断点，审计可提升入波，默认不并入——最小格面纪律）。
- **自决 3（token 形）**：复用 search 面 opaque offset cursor 同族形 + 升级域绑定（scopeId+sessionId）；不引入新 cursor 机制（S0 §4「比较只限同域」满足）；单调序数在工单显性（本条即）。
- **自决 4（UI 消费）**：本波格面 = 公开接口；web-code 翻页 UI（load-older 等）= 登记后续切片，**显性登记不静默**；产品总放行对 F6-PAGE 的核销以接口格 + e2e fetch 腿为准，UI 消费格不冒销。
- **自决 5（角色链）**：S1 carrier = Main 落码（AtlasCode 域）；S2/S3 = Main + e2e lane；本工单判据面冻结先于落码（波前审视新规）；每波工单送 Atlas-reveiw 审计（跨 session 沟通矩阵）。
- **报裁候选（软）**：无。审计若判 list 分页须并入（自决 2 翻转）或帽值调整（§4-4），均属判据面修形，采认定形后双信号。

## §B Atlas-reveiw 审计采记 + 必改修形定形（2026-11-25，**方向采认 + 3 必改**；本节在案 = 修形入档完成 → 送复判，复判 PASS 即双信号）

1. **采记（审计核真面）**：§3.2 F6 行/ a5 verdict 格 / 缺口活码四点（:158-161/:814-822/:645-660/search 先例 :706）/ web-host 透传现状（httpHost.ts:479/:489、?cursor= 先例 :505）全数逐字核真；§4-2/3/4 预判成立；§5 自决 1/3/5 采认。
2. **必改①（格闭合核心）采认定形——分页装窗读路径**：S1 实现形显性 = **range/窗口加载或等价形，零全量驻留**（禁全量 loadProjection 后切片——否则超帽转录仍 resourceLimit，格不闭）；帽语义分态：全量路径帽逐项不变（加性兼容）/ 分页路径以页界为界。e2e 判据增：**≥1 超旧帽样本**（投影 >4MiB 可行样本优先；transcript >64MiB 视 e2e 资源可做）——「>1 页样本」不足以证格。判据格 3 相应增第 6 腿。
3. **必改②采认定形——token 漂移锚三分态**：token 冻结含**链级漂移锚**（投影链前缀指纹/链代际摘要——自决 3 原形纯序数+域绑定无漂移锚，界内错页不可检测；纯 stat 三元组锚误杀 append 与格 3 冲突）。三分态独立判据腿：append（锚前缀稳定 → 续页合法）/ rewrite·compact（→ `cursorExpired` **含界内序数**，禁错页静默）/ 域外（→ `invalidRequest`）。
4. **必改③采认定形——页级资源双界**：页响应冻结序列化字节界（≤4MiB 或新值入 limits 单源），records × bytes 双界收页；判据补超界收页 leg（200 记录 × 1MiB 单记录帽 = 200MiB 级响应不得成立）。
5. **勘正两条（f4 实核后采记）**：① 50/200 = **已冻值复用**非新常量（limits.ts:28-29 `DEFAULT_PAGE_SIZE=50`/`HARD_MAX_PAGE_SIZE=200`，S0-R limits 表在档）；clamp 形写明 = 至 `L.pageSize` 配置值（≤HARD 200，search :706 同形——默认 50 下请求 100 → 50，非 100 非 200）。② §0 F1 帽归因勘正：`maxParseRecords=100k` = search 面单会话核验（:762），replay/loadProjection 不施加；replay 实帽 = 64MiB 字节（:527-531 stat 预检）+ 4MiB 投影序列化。样本设计依此。
6. **登记三条采记**：① 自决 2 保持（list 分页 = 登记候选不并入）；② 自决 4 销项措辞钉死——F6-PAGE 销项呈报须写明「**接口格 + e2e fetch 腿达成；UI 消费登记未销**」，防冒销；③ 页粒度同异性成立（内容页=记录序 vs search 页=会话边界，各自判据独立），S1 契约随 RED 冻结分页结果形（envelope 保留 + 窗口 messages 恰一无重无漏）。
7. **复判程序**：本节落档 @ master → 回执示下送复判 → 复判 PASS 即双信号 Main（S1 开工）。

## §C 复判采记 + 双信号开工（2026-11-25）

复判（Atlas-reveiw）= **PASS**：必改①②③定形逐项核验落足、勘正两条实核值准确、登记三条无偏差。执行面注记采记：落码对照 §B 定形（判据格 3 第 6 腿 / §3 R1 分态腿以 §B 为准）；S1 RED 时随片显性化结果形与锚具体形（前缀指纹/代际摘要二选一冻结）；S1/S2/S3 按片送审计。**双信号已发：Main S1 开工 + e2e lane 预登记。**

## §C-1 双信号补达（2026-11-26）

2026-11-25 双信号送达后，主机磁盘满事件后全 peer session 重启（Main [8cbbd2]/审计 [2de2a7]/e2e [ed2cad] 均为新实例，2026-11-26 起），原消息未达新实例；共享任务列表亦清空（e2e #274 预登记随之失效）。实核：AtlasCode master tip 仍 @c268698b、零 carrier 改动（S1 未开工坐实）；AtlasWeb 两条 2026-11-25 晚 docs(e2e) 归档提交与本波无关。2026-11-26 f4 补达双信号：**Main S1 开工令**（§A-§C 判据面/修形/勘正原文重申，零裁定变化）+ **e2e S3 预登记**（格 3 六腿 + 勘正②样本设计注意）。判据面仍以 §B/§C 为准。

**勘正（2026-11-26，e2e 事实核对回执采记）**：本节两条前提有误——① e2e 侧 2026-11-25 原预登记**已达原实例并已处理**（收讫回执 msg_id 73cf4fa3 @ 11-25 在案，工单全档核读），#274 现仍在列（pending，八腿全档），预登记从未失效；e2e 侧重发为冗余（判据比对零偏差，其登记为 §B 全形超集，以 #274 为准，无双登记）。② 「共享任务列表清空」系 f4 误判——f4 本 session TaskList 视图为空 = 本 session 零自建任务，非共享库清空（教训采记：session 视图空 ≠ 库空）。**Main 侧开工令达否无回执证实、master 零 S1 动静——S1 补达令（msg_id 0482a981）维持有效必要。**

## §D S1 采认判词（f4 独立活码复核，2026-11-26，**PASS**）

- **对象**：worktree-f6-page-s1 @ff55d2e9（基座 c268698b 正确；13 文件 +1225/−6；分支未推 origin，审计走本地 worktree 路径）。
- **五点判据逐点实核成立**：
  1. **契约加性**：webSessionV0 `ReplaySessionRequest` += `PageFields`（复用 search 面同族定义 ：52，pageSize wire 校验 0/201 拒）、`Success` += optional hasMore/nextPageToken（nextPageToken 仅 hasMore=true 条件在场）；schemaVersion=0 不破版；readonlyRuntime 派发 `'pageSize' in req || 'pageToken' in req`（显式 undefined 键亦入分页路径，fail-closed），双缺省 = 旧全量 `loadProjection` 零触碰。
  2. **装窗读路径零全量驻留（必改①）**：replayScan pass1 流式逐行 skeleton（内容剥除空性守恒 `'\u0000'`，峰值驻留 ∝ 记录数与内容体量无关）+ uuid→字节范围 side map（last-wins 镜像 loadTranscriptFile 语义）+ legacy progress 链桥镜像；relink/snip 装载期变换复用 load.ts 真体（加性导出零复刻）；replayPaging pass2 仅页内记录按字节范围随机读渲染。全量路径帽逐项不变；分页路径扫描界 = HARD_MAX_TRANSCRIPT_BYTES 256MiB 单源复用（limits.ts:15 既有常量）、`L.maxTranscriptBytes` 帽分态不施加（E2 直证：全量 resourceLimit / 分页可达）；路径解析不经 openValidated（避 adapter 侧帽静默施加，expectIno 授权锚闭环）。
  3. **token（必改②）**：opaque base64url `{v:1,scopeId,sessionId,offset,anchor}` 三层校验（b64url→JSON→字段域）；锚 = 链 uuid 前缀 SHA-256 截断 16 hex（§C 二选一冻结 = **前缀指纹**）；域绑定校验先于 stat（域外与文件存在性正交）；三分态独立判定：malformed/域外 → invalidRequest（C1 七形/C2 跨 session+跨 scope）、rewrite 漂移含界内序数/越新链界 → cursorExpired（C3/C4，禁错页静默）、append 前缀稳定 → 合法续页（C5）。
  4. **页双界（必改③）**：records ≤ clamp(pageSize, L.pageSize)（B1：请求 100 → 50 直证；B2 下界 1；B3 缺省 50）× bytes ≤ L.maxReplayPageBytes（新对常量 DEFAULT 4MiB/HARD 16MiB 单源入 limits.ts；精确增量口径 `2+bytesSum+b+count`）；单记录独超 → resourceLimit 零隐式截断（F2）；超界收页下一页（F1，序列化字节断言 ≤ 界）。
  5. **RED 先行 22 测**：A 加性对表 2（A1 零新键/A2 分页拼接 ≡ 全量投影逐元素相等）/ B clamp 3 / C 三分态 5 / D 边界 ±1 4（含 D3 零渲染性空窗、D4 notFound 同形）/ E 帽分态+超旧帽样本 3（E3 投影 >4MiB 样本直证格 3 第 6 腿）/ F 双界 3 / G wire 2（strictObject 未知键仍拒）——判据格 1/2/3 全腿预演。
- **独立复跑证据**：全量 512 文件 **6246 pass / 8 skip / 1 fail** 逐字吻合呈报；唯一红身份坐实 = `tests/func/atlascode-tui-pty-probe.test.ts` live 腿（marker 'pty-live-alpha' 1<2 = live LLM 网关未 seed，环境期基线红；S1 diff 零 TUI 触碰 + 既有测试零改动 → 非本波引入）；typecheck 0；既有套件零改动（tests/ diff 仅新文件）。
- **修形 A/B 采认定形（不需回改预注册形）**：A = 真 latent（ca761a91 引入 directTarget/indexTarget/resolved fail-closed 判定但 return 恒写 `'${spec}.js'`，barrel 案形同虚设；修 = return 改用 resolved，barrel 重写 `<spec>/index.js`，fail-closed 语义不变）；B = pack d.ts 消费闭包 557→61（`'../../shared'`→`'../../shared/types'`；ContentBlock :20/Usage :30/Message :71 同源零变化）。两件非行为变更、S1 闭环必要，**批复通过**。
- **不动面核验**：follow/list/search 三面零 diff；search 先例面只读未动；STR-1 豁免集零改动（`session/readonly.ts` = S0-R @f1f1099d 既有具名允许项，eslint.config.mjs 零 diff）；readonly 子门面挂载 = S0-R2 形（全门面试挂回退记采：modelprovider 纵切实证拉入 pack 闭包）。
- **采认结论**：**S1 PASS**。按片送 Atlas-reveiw 审计（进行中）；S2 开工令已另发。

## §E S1 按片审计采记 + 必改定形（2026-11-26，Atlas-reveiw：**1 必改 + 其余全数采认**；本节落档 = 修形令随发 Main，改形复判 PASS 即 S1 收口）

1. **必改 1（P0 parity 缺口，阻 S1 收口；f4 活码复核实证成立）**：skeleton 字段保真 vs 装载期变换依赖面分歧——全量路径 loadTranscriptFile(force-full) **无条件施加** relink+snip 两变换（load.ts:1343-1344）；relink 边界判别 = `isCompactBoundaryMessage` = `{type==='system' && subtype==='compact_boundary'}`（predicates.ts:98-100），snip 依赖 `entry.snipMetadata.removedUuids`（load.ts:249-253）；而 stripToSkeleton（replayScan.ts:102-125）**subtype 与 snipMetadata 均剥除** ⇒ 分页路径两变换恒空转（relink lastSeg undefined 早退 / snip toDelete 空早退；f4 实核谓词体与 snip 依赖面逐字吻合——compactMetadata 虽在 skeleton 保留但非 relink 消费面）。后果：compact/preserved-segment/snip 会话分页有效链 = 未剪枝未重连历史 ≠ 全量面剪枝+重连链，A2 拼接恒等在这些会话不成立、phantom 历史外泄——恰为长转录（最可能 compact）格目标样本面。22 测全绿因 fixture 无 compact/snip（覆盖缺口坐实）。
2. **修形定形（采审计两件）**：① stripToSkeleton 补 `subtype`（string 在场才留）+ `snipMetadata`（存在才留），ReplaySkeletonRecord 扩型；两变换仍真体复用零复刻。② 判据补三腿：**A2-Compact**（preservedSegment 绝对末边界 + preservedUuids 剪枝/重连 ≡ paged 拼接）、**A2-Snip**（removedUuids 中段删除 + 跨 gap relink ≡ paged 拼接）、**compacted 链 C 态腿**（anchor 于剪枝链计算；compact 后旧 token → cursorExpired——C3/C4 补此链域形）。
3. **采认面七项全数采记**（逐项独立核真）：① 可渲染性/链 parity 其余面（projectBlocks 单源纯加性导出、'\u0000'/'' 空性守恒对 text.length>0 严格等价、tool_use 恒 1 activity 块、孤儿并行 tool_result 回收依赖面 skeleton 全保、leaf `>=` 规则逐字同、effective 过滤+envelope 同形）✓；② token 三层解码逐形拒/域绑定先于 stat 正交/三分态序/锚形与 §B 冻结前缀指纹一致 ✓；③ 页双界增量口径 `2+bytesSum+b+count` 与 JSON.stringify 逐字节恒等/单记录独超零截断/超界收页无死循环/新对常量单源 + validateBoundedInt ✓；④ 帽分态 256MiB 单源/L 帽不施加/listSessionFiles 避 openValidated/expectIno+statPost 三元组闭环/acquireRead 槽 ✓；⑤ 加性兼容派发（显式 undefined 亦 fail-closed 入分页）/双缺省旧全量零触碰/wire PageFields 复用+Success 条件在场/A1A2 腿形成立 ✓；⑥ 修形 A 真 latent（resolved 已算而 return 恒写）+ B 三符号同源零语义 ✓（§D 批复维持）；⑦ 不动面零 diff（follow/search/contract/adapter/eslint）/测试仅新文件/readonly 子门面 S0-R2 形 ✓。
4. **程序**：S2 并行不受影响（审计裁定 wire 形不受本必改波及）；Main 改形呈报 → f4 采认复核 → Atlas-reveiw 复判 PASS → S1 收口采认。

## §F S1 必改正形采认复核（f4，2026-11-26，**采认成立 → 送复判**）

- **对象**：worktree-f6-page-s1 @**ea3b3ea8**（基座 ff55d2e9 正确；2 文件 +111/−2：replayScan.ts +13 / 分页单测 +100；零产品面外溢）。
- **修形①逐字实核**：`stripToSkeleton` 补 `subtype`（`typeof entry.subtype === 'string'` 在场才留）+ `snipMetadata`（存在才留）；`ReplaySkeletonRecord` 扩型带成因注释（subtype 缺失 → `isCompactBoundaryMessage` 恒 false → relink 空转；snipMetadata 缺失 → `applySnipRemovals` 空转）——与 §E 定形①逐项吻合；两变换仍真体复用零复刻（diff 未触 load.ts/变换本体）；内容剥除与 `\u0000` 空性守恒未动；驻留面不变（subtype 短串 / snipMetadata 随 removedUuids 有界，仍与内容体量无关）。
- **修形②三腿在格并 GREEN**：H1 A2-Compact（preservedSegment 绝对末边界剪枝/重链 ≡ paged 拼接，phantom 历史不在场）/ H2 A2-Snip（removedUuids 中段删除+跨 gap relink ≡ 拼接）/ H3 compacted 链 C 态（compact 后旧 token → cursorExpired，anchor 于剪枝链含界内序数）。f4 独立实跑分页套件 **25/25（22+3）0 fail**；typecheck 0（tsc --noEmit 静默）；变换/装载域相关三套件 **50/50 0 fail**（paging+lifecycle+s0-r4-load-hardening，Main 报称 49/49 为三件套取集口径差，零红事实一致）。
- **RED 先行采记**：commit 报称修形前分页侧含 phantom m2 / compact 后假续页合法——机制与 §E 审计活码实证闭合（剥除态下 relink/snip 恒空转 ⇒ H1/H2 拼接恒等断言必败、H3 cursorExpired 断言必败），RED 由审计实证 + 断言构造共同保证；复判如需 mutation 直证可按 §E 同法。
- **复核结论**：**S1 必改正形采认成立，无新增登记**。按 §E 程序送 Atlas-reveiw 复判，PASS 即 S1 收口采认（随后 S3 e2e fetch 腿 + 0.1.128 段 L）。S2 并行状态候 Main 回执（AtlasWeb main 自 11-25 后零新提交，S2 开工令在案）。

## §G S1 复判 PASS + 收口采认（2026-11-26，Atlas-reveiw；本节落档 = S1 终态）

- **复判终判：PASS → S1 收口采认**。逐项核验：修形①逐字成立（subtype/snipMetadata 保留形、真体复用零复刻、内容剥除/空性守恒/驻留形未动）；三腿 fixture 设计与断言逐行核真（H1 全量剪枝直断 ['m3','m4','m5']、H2 removedUuids 中段删除跨 gap 重链 ['m1','m3','m4']、H3 旧 token offset 界内 anchor 漂移 → cursorExpired）；**H1/H2 含 phantom 守卫直断全文（非仅双侧比对）防 fixture 双侧同错假绿——设计采记表彰**；独立实跑 25/25 + 三套件 50/50 与呈报逐字一致；RED 采记可接受（mutation 直证可选不另设门）；2 文件限域零波及。
- **S1 终态锚**：worktree-f6-page-s1 @ea3b3ea8（判据链 §D PASS + §E 必改正形 + §F 采认复核 + §G 复判 PASS 四环闭合）；合并 master 与后续 master 操作归 Main（角色边界既定）。
- **后链**：S2 并行在途（候 Main 回执）→ S3 e2e fetch 六腿 + gate + 段 L 0.1.128 双 org（L4 候用户亲署）→ F6-PAGE 销项呈报（措辞 §B 登记②钉死）→ a5 挂账行翻转落档 → 产品总放行阻格清零。

## §H S2 采认判词（f4 独立活码复核，2026-11-26，**PASS**）

- **对象**：AtlasWeb main @**6b75219**（本地领先 origin/main 12 提交，push 归段 L 惯例；4 文件 +239/−4：httpHost +27 / replayPaging.test +204 / web-connection +8 / sessionHost +4；web-code 零动 = 格 4 自决 4 保持）。
- **判据逐点实核成立**：
  1. **键在场语义（加性核心）**：无分页参时 request 构造仅 `{scopeId, sessionId}` 零分页键（A 腿直断 `'pageSize' in req === false`）——与 carrier S1「`'pageSize' in req || 'pageToken' in req` 显式 undefined 键亦入分页路径」的 fail-closed 判定面精确咬合，host 不注入默认值（sessionHost 注释钉死）。
  2. **host 预验 fail-closed**：`?pageSize=` `/^\d{1,9}$/` 畸形即 400 invalidRequest 且零 runtime 触达（D 腿八形逐个 + `calls` 长度直断）；值域 clamp 留 carrier 域（分层正确）。
  3. **opaque 透传**：pageToken 原样透传含特殊字符（C 腿）；URL 拼接 `encodeURIComponent`（web-connection listSessions 先例形）。
  4. **错误映射对表**：invalidRequest→400 / cursorExpired→400（body.error.code 区分双态，禁错页静默的显性 400 面）/ resourceLimit→429（沿 search/list 先例）/ scopeDenied→403 / notFound→404（E 腿逐一实射）。
  5. **加性兼容**：envelope 旧形零破坏（A）+ hasMore/nextPageToken 加性透传零剥离（F）。
  6. **联调机制自决采认**（开工令⑤域内）：runtimeOverride 注入缝过 pin 0.1.127 无分页契约（真连候 S3/段 L pin bump）；ephemeral 端口 listen(0)。
- **独立复跑证据**：S2 六腿 **6/6 / 0 fail**（55 expect）；AtlasWeb 全量 **517 pass / 1 skip / 0 fail**（68 files，1873 expect，exit 0）——与呈报逐字一致；格 J gate truth table clean-candidate 行 commit 后自愈全绿（树净实证采记）。
- **采认结论**：**S2 PASS**。按片送 Atlas-reveiw 审计（与 S1 复判同链惯例）；**S3 开工令随发 e2e**（判据面以 §B/§C + 勘正②样本设计为准，#274 预登记为 e2e 侧权威档；S3 真连前提 = S1 合并 master + carrier pin bump 0.1.128 + 段 L 呈批候选制品，Main 链内衔接）。
- **附记**：Main 补达 S1 修形后 AtlasCode 全量复跑 6248/8/2——两红均 live 环境探针（pty-live-alpha TUI live / S5-4 NL live 网关未 seed），与分页改动无涉，采记与 §D 唯一红判读同法。

## §I S2 按片审计收口（2026-11-26，Atlas-reveiw：**PASS，0 必改**；本节落档 = S2 终态）

- **逐点核真**：键在场语义（httpHost:492-503 `!== null` 判、零默认注入、与 carrier fail-closed 面精确咬合）/ host 预验早退零触达（值域 clamp 留 carrier 分层正确；**登记备注**：pageToken 不预判形（空串/畸形→carrier invalidRequest→400）、前导零形 ∈ 声明域无处置——均分层正确）/ opaque 透传+编码 / 错误映射五码+body code 断言+500 兜底保持 / 加性全 optional 扩面 / 联调自决 + web-code 零动 + 12 提交段 L 集中 push 治理相容。
- **独立实跑**：六腿 6/6 + 全量 517/1/0/1873/68 files/28.98s 与 §H 呈报逐字一致。
- **终判：S2 收口采认。** S1 §G + S2 §I 双终态；余 S3（e2e fetch 腿+gate+段 L，L4 候用户亲署）。**当前关键路径 = Main 真连前提链（S1 合并 master → carrier pin bump 0.1.128 → 段 L 呈批候选制品）**。

## §J S1 合并采记 + 序修形批复（f4，2026-11-26）

- **S1 合并采记**：cherry-pick 落 master = 2a353f7e（S1 feat）+ b5a2dfd7（修形①）；f4 实核 master 链序（§H → 2a353f7e → b5a2dfd7 → §I cfee67eb）+ `merge-base --is-ancestor` origin ALIGNED + worktree-f6-page-s1 已撤；Main 侧复验三件套 128/128 + typecheck 0 采记。
- **序修形批复：采认**（预注册形偏离，域内实证强制）。工单 §1 F3 原序「pin bump → 段 L 呈批」不可行——格 I 背书为三元版本硬耦合（f4 实核：AtlasWeb `gateTruthTable.ts:94` `upgradeVersion: '0.1.127'` 硬编码 + `:102` `upgradeSha256Prefix` + `docs/attestations/gezi-i.json:9-10` 同值；verifier 三方对表 pin ↔ attestation ↔ EXPECTED），且 sha 前缀须取 **registry 实发制品**（registry gzip-repack 致本地 pack sha ≠ 直下 tarball，SRI 为准——0.1.127 先例在档）；0.1.128 未发布则 sha 不可知，pin 先行必 3 红（真值表 pin 断言 + 格 I verifier + G2 级联）。**定形序 = 段 L 0.1.128 发布（GATE-PASS → release commit → tag → push → npm 双 org）→ sha 回填 → AtlasWeb pin bump + 格 I 背书三元同步一 commit**——与 #404 波（0.1.127）实际执行序相同（cf4ec4d 先例）。Main 已 reset 越序 commit（f665b1f 未推），AtlasWeb main 复绿 @6b75219 0 fail 采记。
- **S3 制品锚转发（③）**：AtlasCode master **cfee67eb**（含 S1 分页契约，origin ALIGNED）+ AtlasWeb main **6b75219**（S2 透传，本地领先 origin 12 提交，push 归段 L）——e2e 局部 build/pack/install 真连双锚；版本串非 fetch 腿依赖，npm 0.1.128 正式制品候段 L 发布后替换。

## §K S3 e2e fetch 腿采认判词（f4 独立活码复核，2026-11-26，**PASS**）+ 值域登记裁定

- **对象**：e2e 判定单 `user-e2e/reports/r-20261126-f6page-s3-gate.md`（#274 九面预注册执行；真连双锚 AtlasCode cfee67eb × AtlasWeb 6b75219，零注入真 carrier 局部 pack 覆 pin @§J 授权）。
- **独立核真（f4 实测，非采信性）**：
  1. **双锚实核**：AtlasCode master @f44749d1（cfee67eb + S1 双 commit 2a353f7e/b5a2dfd7 在史）× AtlasWeb @6b75219 树净——与 §J 转发一致。
  2. **制品覆 pin 直证**：tgz sha256 `6ff7040f…571e` f4 重算**逐字节吻合**（4,030,169 B）；AtlasWeb `node_modules/@atlaswork/atlascode/dist/web-session-runtime/index.js` **pageToken×11 + cursorExpired×2 f4 逐计数吻合**（呈报口径 = S1 触及子路径面；f4 另核全 dist .js 计 23/7 含 execution/contract/cli 同 token 面，不冲突）；包名 @atlaswork/atlascode 0.1.127 镜像改名形核实。
  3. **探针形读码**：零注入（真 createSessionHost/createHttpHost 直 import AtlasWeb 源 + 真 jsonl 种子每跑自再生 + listen(0) ephemeral；真实 `~/.atlas`/`~/.claude` 零触碰）与判定单 §1 一致。
  4. **钳制公式同形直读**：`replayPaging.ts:180` ≡ `readonlyRuntime.ts:739`（`Math.max(1, Math.min(req.pageSize ?? L.pageSize, L.pageSize))` 逐字节同形）——G8 wire0/wire201 钳制断言代码面成立。
  5. **域绑定先于 stat 直读**：replayPaging.ts:172-184 域校验抛 invalidRequest 先于 statPre notFound——G5「域外打不存在 session 仍 400 非 404」腿代码面成立。
  6. **f4 独立复跑 = 39/39 GREEN / 0 RED**（bun probe-f6.ts 直跑，与 run-final.log 逐腿一致）。
- **值域两路径语义差——登记裁定（判定单 §3-2 呈裁件，f4 裁）**：
  - **e2e 校准采认**：首轮按 §D「pageSize wire 校验 0/201 拒」判 400 系过判（该句 = webSessionV0 zod schema 声明属性描述，非真实路径行为）；按 B2 复验校准先例校准为钳制断言，透明注记在案——采认。
  - **候选 (a) 采认**：webSessionV0 schema 注释钉明「zod min(1)/max(200) = 声明域属性；真实路径消费面 = carrier 钳制（replayPaging:180 ≡ search readonlyRuntime:739 同形公式）」——纯注释零行为变更，**折入下次 carrier 触碰自然带入**（纯文本零行为变更跳 gate 先例），本波零改动、不阻段 L、不设复判门。
  - **候选 (b) 否决**：AtlasWeb host 补值域 400 与判据格 1 冻结「超帽 = clamp 至帽」直接抵触、破 S2 §H/§I「值域 clamp 留 carrier 域」分层裁定，且属行为变更需重判——零收益不为。
  - zod 零消费面 f4 独立证实：`WebSessionRequestSchema` src 全仓仅 webSessionV0.ts :106（声明）+ :307（infer）两点，零消费点。
- **采认结论**：**S3 fetch 级判据腿 PASS**。判据格 1（冻结数值/clamp/三分态/域绑定）、格 2（加性零键零破坏）、格 3 六腿 + §B 第 6 腿（超旧帽窗口形钉格：同会话全量 429 resourceLimit / 分页 4 页全链可达、页字节和 5.73MiB > 4MiB = L 帽不施加直证）+ 必改① e2e 复证（真 jsonl 真变换链 phantom 不在场：compact=[m3,m4,m5] / snip=[m1,m3,m4]）+ 必改②三分态三腿（compact 界内序数/rewrite 越界/snip 锚漂移全 cursorExpired 禁错页静默）+ 必改③双界（F1 字节界先收页 n=41<50、F2 单记录 4.5MiB → 429 零隐式截断）+ G3 append 前缀稳定（token 形恰合 §D 冻结）+ 快照一致性面（stat 三元组 + expectIno 对合法并发写零误杀）——全数 e2e 直证成立。
- **后链**：本节落档 → 按片送 Atlas-reveiw 审计 → 审计 PASS 后 S3 gate 采认链闭合（硬门条款 GATE-PASS 支达成，Main 补录呈批书）→ f4 段 L 呈批复另节落档（F3 重验计数厘清中）→ Main L1-L3 → L4 候用户亲署 → 生产 lane → F6-PAGE 销项呈报（措辞 §B 登记②钉死）。

### §K 审计闭环补记（2026-11-26，Atlas-reveiw：**PASS，0 必改，注记 1 采记**；本节落档 = S3 采认链终态）

- **终判：PASS → S3 采认链闭合**。e2e 首跑 → f4 复跑 → 审计第三独立复跑，三方 39/39 GREEN 逐腿 diff 零；四焦点（判据层零注入形/九面覆盖完备/值域裁定一致性/三重直证可复现）全数独立实核成立（merge-base 直验双锚、sha 逐字节、×11/×2 子路径计数、公式 :180≡:739 逐字节同形、域校验先于 statPre 实读）。审计确认 Main 可补录呈批书 GATE-PASS 支。
- **注记 1（G7 帽名口径勘正，采记不阻链）**：G7 样本判别帽 = **maxProjectionBytes**（4MiB 全量投影序列化帽，全量 429 由它触发）；transcript ~6.3MiB < 64MiB 从未在扣——maxTranscriptBytes 不施加面为**代码面事实**（replayPaging.ts:185-186 注释 + HARD 256MiB 扫描界，S1 §D/§E 在案），本样本不可直证（>64MiB 直证腿 = §B「视 e2e 资源可做」，非格义务）。页帽与投影帽同值 4MiB，措辞须以帽名区分：G7「页字节和 5.73MiB > 4MiB」实际直证 = **全量投影帽（4MiB）不施加于分页路径 + 页帽按页计不跨页累计**。§K 正文「L 帽不施加直证」句依此勘正（帽名精度修正，判读不变）；校正句随 Main 补录呈批书/GATE-PASS 文本触碰折入。
- **登记（审计/e2e 同认）**：正式 0.1.128 gate = 以 **registry 实发制品**重跑 S3 腿（判定单 §4 自述判据腿层），随 L6 生产 lane 链执行。
