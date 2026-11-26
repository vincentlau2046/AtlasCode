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
