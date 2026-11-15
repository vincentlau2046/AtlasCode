# S0-P/U/R §7 lock-face 呈批书（Main → f4）

> Main 2026-11-15。输入 = 工单 docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md @7abc7b92
> （§7 七必答 + §5.2 审计 7 必改/4 自决）+ 两路只读代码侦查（本文件 §0 事实锚）。
> 主线锚 937ab3eb；0.1.113 在 gate（不阻不占）。批复后按 §9 切片落码；双信号②（开工）随批复在案。

## §0 代码事实锚（侦查结论，file:line 可复核）

- **持久化形**：JSONL 每会话一文件 `<projectsDir>/<sanitizePath(cwd)>/<sessionId>.jsonl`；
  projectsDir = `(ATLAS_CONFIG_DIR ?? homedir()/getConfigDirName())/projects`
  （src/engine/session/env.ts:55-63 + src/shared/configDir.ts:61-67）；sanitizePath =
  非字母数字→'-'，>200 字符追加 hash（src/shared/path.ts）。
- **读面纯度**：loadTranscriptFile（load.ts:1002-1238）/ buildConversationChain
  （load.ts:317-340）/ renderableSearchText（search.ts:48-54，WeakMap 缓存）/
  extractFirstPrompt（firstPrompt.ts）——显式传入 filePath 时零 cwd/HOME/env 触碰；
  唯一 env 读 = `ATLAS_DISABLE_PRECOMPACT_SKIP` kill-switch。getProjectDir 有模块级
  Map memoize（paths.ts:36-52）但零写盘。
- **precompact 跳过**（load.ts:1043-1063）：>5MB（scanner.ts:29）单趟分块读剥
  attribution 行 + 就地截断到最后 compact_boundary 之后；边界前 session 级元数据
  （summary/custom-title/tag/worktree-state/goal-state）经 scanPreBoundaryMetadata
  前扫恢复（load.ts:728-795）；第二段 walkChainBeforeParse 死 fork 分支剔除
  （load.ts:836-996），keepAllLeaves/hasPreservedSegment/kill-switch 可关（:1078-1083）。
- **写面黑名单**（只读入口禁调）：processResumedConversation（restore.ts:116-205）、
  projectInstance 全族 record*（record.ts:262-326）、restoreSessionMetadata/
  cacheSessionTitle/saveMode/saveGoalState、primeSessionMessages 族缓存写口
  （load.ts:1282-1303）。getSessionMessages/loadSessionFile 只读但写模块级缓存 Map
  （load.ts:1260-1272）= 同进程共享可变态，禁用。
- **映射现状**：productId 静态单产品 'atlascode'（src/shared/ProductDefinition.ts:21-60），
  仅经 configDirName 影响盘面；**scopeId 现仓无此概念**（等价物 = project 目录）；
  **无 sessionId→projectDir 反查映射**（paths.ts:70-79 注释明示），跨项目枚举 =
  sessionStoragePortable.resolveSessionFilePath 全 projectsDir 扫描（:480-500）。
- **schema/build**：coreSchemas 静态闭包 = zod/v4 + lazySchema（coreSchemas.ts:10-11）；
  zod ^4.5.4（bun.lock 解析 4.6.5）；**消息块全 z.unknown() 占位、类型生成脚本死链** =
  不可复用实证；无 envelope/SessionSummary 现成 schema。package.json 无 exports/types；
  build = 单 entry 内联命令 + 12 --external，dist 仅 cli.js；**全仓零 d.ts 发射管线**；
  tsconfig bundler resolution/strict false。tests/func 已存在（90 文件）且在 canon 口径内。

## §7.1 必答① P0 安全整合 + manifest v1/v2 绑定

- **整合方法**：P0 四提交（38b415b6→7cf41a6e→3be3c8af→317f4845）在 worktrees/
  atlas-family-p0；Main 从 master checkout 以 `git diff 937ab3eb..317f4845 -- <prep路径>`
  逐文件应用为 prep 提交（不 cherry-pick 整提交——避免带入非 prep 资产快照）；先
  `git merge-base` 记录差异基。冲突逐文件双方保留后报 f4；全程不 reset/clean/stash。
- **文件清单**（prep 面）：docs/products/atlasweb/foundation-readiness.md、
  scripts/atlas-family-foundation-readiness.ts + tests/unit 同名测试、
  scripts/atlasweb-kernel-boundary-scan.ts + 单测、scripts/atlas-host-state-access-scan.ts、
  docs/products/atlas-family-manifest.schema.yaml（v1 兼容保留）+ 新
  docs/products/atlasweb/pairing.schema.yaml + 配对证据 JSON 模板；三文档（总约
  SHA256 860159ef…/roadmap/README）hash 复核后入位。
- **旧授权条款修订**：arch-pin/roadmap/README/总计划四文按 317f4845 原文定位，
  逐处改写为「S0 工单 + lock-face 生效规则」，保留历史依据引用，删除『立即可启动』
  『源树稳定零内核改动即可』授权语义。
- **G1 证据键**（六键，缺一拒）：user-authorization-quote（总约 §0 原话引用）、
  audit-pass-ref（工单 §5.2 + 本呈批书批复）、s3b-production-evidence
  （v0.1.106=bd708cb5 五项 5/0/134）、isolation-plan（平行目录+权限隔离方案文档）、
  contract-gap-review（§7.2 单源契约 + 缺口清单）、upstream-version-plan
  （工单 §1 排期 + 本呈批书 §7.7 版本确认）。
- **G2 判定面**：evaluateFoundationReadiness 原 hard-false 谓词全保留 + 增真实安装/
  闭包/生命周期隔离/恢复/安全/不可变配对/真实 controller 七证据；G1 走新
  evaluateImplementationAdmission（{implementationAdmitted,reasons,evidence}），
  两输出分离 fail-closed，同一 bool 改名复用 = 格 J 拒。
- **manifest v1/v2 绑定形**：manifest 增加 `pairingRef: {schemaVersion:1, sha256}`
  指向独立配对 JSON；v2 验证器显式拒绝未知字段（v1 additionalProperties 行为保留
  兼容）；配对 JSON 字段集按工单 §2.2（upstream 40 位 commit/packageName/version/
  contractEntry/runtimeEntry/integrity sha512/protocolVersion='v0'/envelopeVersion=0/
  consumerCommit/consumerLockDigest/evidenceDigest/products/rollback）；runtimeEntry
  未提供时 capabilities 不标 ready（格 I）；schema/types 从单源 zod 生成不手写双份。

## §7.2 必答② contract 映射 + API 签名 + 产物 + exports（必改 6 扩项）

- **单源**：新建 `src/kernel/protocol/webSessionV0.ts`（目录全新区）——**不**复用
  coreSchemas 消息块（z.unknown 占位 + 死链生成脚本 = §0 实证不可复用）；全部
  fresh 定义。**import 只准 `zod/v4`**（与 coreSchemas:10 同域，单 zod 版本域钉死：
  dependencies zod ^4.5.4，禁 classic 'zod' 导入）+ 禁仓库内任何其他 import
  （格 C 闭包：contract 文件 import 面 = zod 唯一）。
- **Code-neutral 词汇审计格**（必改 6）：webSessionV0.ts 源文件禁词 grep 审计——
  Code 词汇（`atlascode`/`tool_use`/`toolUseResult`/`Bash`/`sidechain`/`compact_boundary`/
  `jsonl`/品牌串）+ 上游 fork 词面；unit 测试源级扫描锁形（wab4 同范）；唯一通用
  活动面 = `{kind:'activity',label,status?}`；样例 fixture 用 office 会话验证中立。
- **API 签名表**（锁面冻结，undefined 语义零容）：

| 项 | 形 |
|---|---|
| request envelope | `{schemaVersion:0, kind, requestId:UUID, productId, scopeId}` + 各 command 专域；strict 拒未知 |
| listSessions | `({scopeId, pageSize?, pageToken?}) → {sessions: SessionSummary[], nextPageToken?: string}`；排序 updatedAt 降序 + sessionId 升序 |
| searchSessions | `({scopeId, query, pageSize?, pageToken?}) → {results: {sessionId,messageId,snippet(≤512 cp)}[], nextPageToken?}`；literal case-insensitive；空 query invalidRequest |
| replaySession | `({scopeId, sessionId}) → {projection}` |
| followSession | `({scopeId, sessionId, resumeCursor?}) → {subscription}`（AsyncIterable + renewLease/close 句柄，签名见 §7.5） |
| cancel/unsubscribe | `(requestId)` / `(subscriptionId)` 控制面，不执行 F2 回合取消 |
| SessionSummary | `{sessionId,title(string|null),createdAt(ISO UTC|null),updatedAt,messageCount(number|null),productId,scopeId}`——未知显式 null，禁 fabricate |
| projection | `{sessionId,productId,scopeId,semantics:'persisted-effective-conversation',messages:[{id,role,createdAt,blocks[]}],truncated:false}` |
| blocks | `{kind:'text',text}` \| `{kind:'activity',label,status?}`；未知内容 → activity(label='unsupported',status='skipped') 不静默丢；二进制附件只给安全 metadata（name/size/mime），不读路径不内嵌 |
| errors | `unsupportedSchema/invalidRequest/scopeDenied/notFound/corruptData/ioUnavailable{retryable}/cursorExpired/resourceLimit/cancelled/closed`；message 安全化（无盘路径/secret/stack） |
| events | `baseline/replacement{projection,generation,baselineId,revision,cursor}` / `resetRequired{generation,reason}` / `error{code,retryable}` / `closed`；revision 0..MAX_SAFE_INTEGER 边界换 generation+新 baseline |

- **投影映射表**（TranscriptMessage→中立，18 entry 类型全覆盖进 fixture 对表）：
  user/assistant message 文本→text 块；tool_use/toolUseResult/attachment/system→
  activity 块（label 从白名单字段派生：command/file_path/prompt/query 等）；isMeta/
  summary/custom-title/tag 等 session 级元数据行不投影（进 SessionSummary）；未知
  entry type → activity('unsupported')（loader 容错语义继承，load.ts:1166-1169）。
- **产物与 exports 条件序**（必改 6）：package.json 增
  `"./web-contract": {"types": "./dist/web-contract/index.d.ts", "import":
  "./dist/web-contract/index.js", "default": "./dist/web-contract/index.js"}`
  （types 在前）+ 保留 `"./package.json"`；**本波无 runtime 出口、无 library root**。
  build = `build:web-contract` npm script：`bun build src/kernel/protocol/webSessionV0.ts
  --outfile dist/web-contract/index.js --target browser --external zod`（CLI 原命令
  字节不动；两产物零共享 chunk）；prepublishOnly = `bun run build && bun run
  build:web-contract`。
- **d.ts 发射**（现仓零管线，新建）：`tsconfig.web-contract.json`——declaration +
  emitDeclarationOnly + include 仅 webSessionV0.ts 闭包图（import 面 = zod 唯一 →
  相对类型闭包 = 单文件 + node_modules zod d.ts）；接入 build:web-contract；不手抄。
- **truncated 语义**：readonly 读路径禁用 precompact 跳过（§7.3），投影恒全量 →
  truncated 恒如实 false；超资源界 → resourceLimit 错误，零隐式截断（工单 §3.2）。

## §7.3 必答③ readonlyReader 落点 + 旧 CLI 恒等（必改 5 扩项）

- **落点**：新建 `src/engine/session/readonly.ts`（域内只读服务，工单 §4.1 建议形）。
  复用纯函数族（显式 filePath）：loadTranscriptFile / buildConversationChain /
  renderableSearchText / extractFirstPrompt / extractLastJsonStringField（经
  engine/session 门面，零全局槽）。
- **load.ts 唯一修形**（加性，旧调用点零变）：loadTranscriptFile opts 增
  `precompactSkip?: 'auto' | 'force-full'`（缺省 'auto' = 逐字节现状恒等）；readonly
  传 `'force-full'` = 跳过 :1043 尺寸门与 :1078 walkChainBeforeParse 两段剔除，
  全量读。**不 mutate env**（ATLAS_DISABLE_PRECOMPACT_SKIP 是进程级全局，禁触）。
  旧 CLI 恒等证明：缺省臂逐字节不变 + fixture 回放对表（旧路径 vs 'auto' 零差）。
- **禁调清单**（§0 写面黑名单全量）+ **共享可变态处置**：不触 getSessionMessages
  缓存 Map，直接 loadTranscriptFile；实例内自持 cache/revision/cursor 账本。
- **必改 5a fixture 回放对表**：五形 fixture（compact_boundary / sidechain /
  fork 多 leaf / snip removedUuids / content-replacement）——同输入下旧 CLI 路径
  （现状 loadTranscriptFile）vs readonly 路径（'force-full' + 链重建 + leaf 选取按
  load.ts:1187-1226 同规则）投影逐字段 diff 零差；对表含 preservedSegment 边界不
  截断（scanner.ts:189-198）。
- **必改 5b persisted-effective-conversation 显式定义**：= 全量读取（skip 禁用）+
  terminal leaf 链（CLI 同规则）重建的有效会话 + preserved 段并入 + compact 边界行
  /session 级元数据行不投影（进 summary 域）。与 CLI『最后边界后有效链』的差异 =
  CLI 对 >5MB 文件截断读、readonly 全量读——此差异是**故意修形**（工单禁隐式截断），
  fixture 对表在 <5MB 域证明恒等，>5MB 域断言 readonly 全量 + CLI 截断各自如实。
- **loader 权限错吞空纠正**（工单 §5.1-5）：新服务权限错→scopeDenied/ioUnavailable，
  目录不存在→notFound，禁伪空列表；旧 CLI 行为不顺手改。
- **scopeId 钉死**：scopeId ↔ 一个已授权存储根目录（sanitized project dir），由
  adapter options 显式映射 `{scopeId → storageDir}`；不做全 projectsDir 扫描反查
  （resolveSessionFilePath 全扫面不复用）；productId = 'atlascode' 静态校验
  （ProductDefinition.ts:21-60）。

## §7.4 必答④ adapter 安全读取（必改 2 扩项）

- **同 fd 校验读取链**（禁 path 两段式）：`fs.open(path, 'r', O_NOFOLLOW)` → fstat(fd)
  → S_ISREG 白名单（非 regular file：FIFO/设备/目录 → ioUnavailable{retryable:false}
  拒，防挂死）→ size 对资源界（64MiB/256MiB）→ **同一 fd** 流式读（chunk ≤64KiB）→
  读毕 fstat(fd) 复核 ino/size 与开读时同值；变更面：follow 下不连续 → resetRequired，
  replay 下 deadline 内重试一次取稳定快照，仍不稳 → ioUnavailable{retryable:true}。
- **路径安全**：授权根 containment（resolve 后前缀断言）+ 逐段 lstat 拒 symlink +
  O_NOFOLLOW 末段 + open 后 fstat(fd).ino vs 开前 lstat(path).ino 对比收 TOCTOU 窗；
  非法 ID（含 `..`/路径形）→ invalidRequest；指向未授权根 → scopeDenied；未验证
  文件不先读后鉴权。
- **hardlink 面**（必改 2）：授权根内 hardlink = 同 inode 合法文件（无路径逃逸，
  realpath 落根内）；逃逸测试面 = 持 fd 期间路径被 rename/替换（写方 atomic
  replace）→ fd 读到旧 inode 完整数据 → 读毕身份复核报不连续 → resetRequired——
  不静默交付半旧半新。
- **取消/批次**：AbortSignal 在每 64KiB chunk 与每 256 条解析批次边界检查；deadline
  经 signal 组合；终态恰一（§7.5 优先序）；deadline 释放 fd/内存缓冲。常量单源
  src/atlascode/web/limits.ts。

## §7.5 必答⑤ follow/epoch/cursor/lease/终态优先序

- **采样序**：follow = 先起实例 poll 采样（mtime+size+ino 三元组守卫）→ 再取
  baseline → 竞态窗口内重试一致 snapshot；半行不当完整记录等下一采样；非法完整
  行 corruptData 不无限等待。
- **cursor**：opaque 随机 token，实例 issued-token 账本绑定
  {product,scope,session,subscription,baselineId,generation,revision,expiry}；
  伪造/跨域 → 拒（scopeDenied/invalidRequest）；过期/restart 未知 → resetRequired+
  新 baseline。
- **LRU × 活跃订阅交互**（必改 1 钉死）：淘汰序 = 无活跃 subscription 绑定的 token
  先淘；ledger 满且全活跃 → 淘最旧活跃 token，该 subscription 显式收 resetRequired+
  新 baseline，**禁静默失效**；场景入格 E。
- **lease 续租签名**：subscription 句柄 = `{[Symbol.asyncIterator], renewLease():
  Promise<boolean>, close(): Promise<void>}`；next() 取事件自动续租；idle lease
  120s 超时 → closed + 释放（工单 §4.4）。
- **终态优先序表**（钉死）：同请求/订阅窗口内多终态竞争只出**恰一**，序 =
  `closed > cancelled > resourceLimit/error > 数据事件`；resetRequired 非终态走新
  baseline 链；终态后无事件/句柄留存。
- **close 语义**（必改 4）：幂等可 await；close 收敛 deadline 2000ms 超时 → close()
  拒 ioUnavailable，**实例保持 open 可重试 close，禁半关闭态**；失败 close 资源
  账面不变（泄漏面入格 E）；close 后 start 不可重启（重建新实例换 epoch）。
- **三方同窗唯一性测试**（必改 7，预注册 RED→GREEN）：pending 满 × lease 超时 ×
  deadline 同 tick——归属表：closed(lease) > cancelled(reason=deadline) >
  resourceLimit(pending 超)，断言恰一终态 + 资源释放完整（fd/timer/账本）。
- **零重解析判据格**（必改 3）：稳定文件 repeat poll N tick → 断言零 read/零 parse/
  零事件（三元组未变走 O(1) stat 通道）；增量尾读 = 上次 offset 起步，只解析新增
  字节；性能格 = IO/CPU 计数可测断言（非只测正确性）。

## §7.6 必答⑥ 资源值全表兑现

工单 §4.4 全表逐项**可满足，零修订**：全部为纯内存/timer/fs 结构界，bun/node 无
实现障碍；跨参数 start 校验清单（单 event ≤ pending bytes、≥1 事件可交付、终态控制
槽不携大 projection、NaN/Infinity/小数/负值拒、硬上限不可被 host 调高）入 unit；
解析批次 256 条 yield / chunk 64KiB 与表注一致。唯二知会：① polling interval 默认
1000ms 为 follow 时延基线（可配 100..60000），非性能承诺；② pageSize 分页基于固定
result snapshot + opaque pageToken（cursor ledger 同账本家族，TTL 600s）。

## §7.7 必答⑦ build/版本/切片 Δ 预注册

- **版本确认**：S0-U = **0.1.115**（0.1.114 = 件F 工位在案）；S0-R = **0.1.116**。
- **独立 build**：CLI build 命令字节不动 + 新 `build:web-contract`；external 清单 =
  zod 唯一（dependencies 已显式声明——旧 --external 坑对表）；declaration 配置 =
  tsconfig.web-contract.json（文件名依工单 §3.1 要求在此列明）。
- **切片 Δ 预注册**（canon 全量口径恰合逐切片）：

| 切片 | 内容 | 新测试文件 | 预注册 Δ |
|---|---|---|---|
| U-1 | webSessionV0 单源（codec/envelope/错误联合/事件/中立审计） | tests/unit/web-session-v0-contract.test.ts | +1 文件，~14 测试 |
| U-2 | exports + build:web-contract + d.ts 发射 | tests/func/web-contract-pack.test.ts | +1 文件，~6 测试 |
| R-1 | readonly.ts reader + adapter 安全读 + 双实例隔离反例（先红） | tests/unit/web-session-runtime-lifecycle.test.ts | +1 文件，~10 测试 |
| R-2 | poll/follow/恢复/资源界/终态唯一/零重解析 | tests/func/web-session-runtime-follow.test.ts + tests/unit/web-session-runtime-limits.test.ts | +2 文件，~16 测试 |
| R-3 | ./web-session-runtime 出口 + pack 一致性 | tests/func/web-session-runtime-fs.test.ts + web-session-runtime-pack.test.ts | +2 文件，~10 测试 |

- **段 G/段 L 输入**（审计自决①采认）：U/R 判据格 A-J 按切片分列 gate 报告、段 L
  一次；prep 测试绿灯不冒充生产 gate（自决④）。
- **S0-P prep 窗**（自决⑤采认）：prep 提交安排在 0.1.113 段 L 收口（release commit+
  tgz 落盘）之后立即执行，不与 tgz 打包窗口重叠；gate 等待期只做只读预研（P0 资产
  差异盘点，零提交）——0.1.113 候选 build 与 canon 基线零污染。

## §9 切片序与回退

U-1 → U-2（独立可 revert；U-2 含 package.json exports，单独回退即摘 subpath）；
R-1（隔离反例先红后绿）→ R-2 → R-3。每切片四件套 + canon 恰合独立收口；R 波内
scanner/STR-1 冲突处置 = engine 只读子门面 allowlist 注册（不全局关边界规则，
工单 §4.1）。

---
Main 呈批完毕。请 f4 批复：① 本呈批书七必答 + 审计必改吸收是否全数成立；
② §7.2 exports 条件序/build 形、§7.3 load.ts 加性 opts 修形、§7.5 终态优先序表/
lease 签名、§7.7 版本与 Δ 表是否钉死放行。批复即开工 U-1（双信号②在案）。
