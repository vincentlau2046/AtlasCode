# AtlasWeb S0 上游交付工单与总排期——S0-P → S0-U 0.1.115候 → S0-R 0.1.116候

> f4 2026-11-15。状态：**详细方案待 Atlas-reveiw 审计；未发落码双信号**。
> 用户授权（本轮原话）：『OK，你整体排期，完成后只会atlasweb f4可以并实施的通知就可以了。』据此采纳双方 S0 总约推荐范围/阶段门进入执行治理，不再逐项向用户索裁；不视作 gate PASS、不跳过工单审计/锁面/段L。
> f4 只做核验/工单/采认；Main 落码/版本/发布；e2e gate/生产；AtlasWeb-F4 消费者规划核验。**AtlasWeb 仍等待本工单 §8 的单一『可以并行实施』信号，不提前建仓。**

## §0 活码重核与既有约定

### 0.1 锚与证据

- 主线核验锚：`937ab3ebe6066282e2cd4c2b33080737d5261ab0`；Main 确认0.1.112已发布、W-AB4b 0.1.113两切片在gate未发布、件F 0.1.114候未落码。**现有队列不得被本工单抢占。**
- P0基线 `317f4845`（此前四提交依次38b415b6/7cf41a6e/3be3c8af/317f4845），尚未合并；P0目录 `worktrees/atlas-family-p0`；不创建新worktree，不reset/clean别人checkout。
- 总约来源：P0 `docs/products/atlasweb/2026-11-15-s0-agreement.md`，2026-11-15 SHA256 `860159ef2e0d3810c30a2409d1a9ab49fdb69b11cc5af9d8417afaf7ae0f3faf`。附带两索引：roadmap `39b78840f86bf2c40aa691f6e58d428d6200db4017fa190df4189683e6514611`、Web README `9e9a62f3c66f661937f6bbed718faaa44c39d43e6e2367eb76c7f7e42fcaf6d9`。Main 接入前复核；源若变先报差异，禁覆盖未提交文档。
- S3b历史有效锚 `v0.1.106=bd708cb5d2007e913ac2b5713f361203592b1b68`；本次专项5/0/134 expects；不冒充整个runtime就绪。v0.1.110/112均无本工单新增库出口。
- 当前package.json:6-12/23只有CLI bin和build，无exports/types。coreSchemas:10-11静态源码闭包2文件（zod/v4+lazySchema）但不是完整v0；compose:83-86仍接tui/bootstrapStatePort；kernel/state/injection:16-21、SessionEnv:69-76、configDir:39-45为全局槽。不能re-export compose当Web factory。
- loader:1043-1058跳precompact，project全局写面/paths顶层VERSION探测均不得引入只读入口。现原语可复用，不能继承静默I/O错误为空、默认真HOME或全局cache隔离假象。

### 0.2 范围冻结（用户已认可总约）

本交付 = 单源 contract + 同进程**只读会话**runtime（list/search/replay/follow）及可安装产物。replay/search = 已持久化当前有效会话投影，非完整审计/所有分支；follow = baseline+完整replacement最终收敛，非逐token/逐次写/exactly-once。UI/API/docs须保留限制。

不启动agent执行引擎，不新增prompt/queue/执行回合cancel、审批、diff/交付物。原F2/F3及F6 page补洞属于后续首个真可用Code必须项，**本工单不销项**。只读cancel只取消读取/订阅。

保留拓扑 browser/WebView → HTTP/WS host → 同进程产品只读adapter/runtime；消费者禁止跨仓私有src/直接读产品目录；允许上游runtime内部engine/session窄服务。不可实现即报差异，不暗改CLI子进程。

## §1 总排期（按依赖，不承诺虚构日历工时）

| 次序 | 工位/版本 | 主责 | 进入/退出 |
|---|---|---|---|
| 现有1 | W-AB4b 0.1.113 | Main/e2e | 按原gate/段L/生产收口，本工单不介入判据 |
| 现有2 | 件F 0.1.114候 | f4/Main/e2e | 先核↑替位输入token可用性；无数据则按既定scope零码登记，禁为占版本造链；占号/跳号单独记账 |
| Prep | S0-P，**非npm发布波** | Main | 可与现有gate并行做独立prep资产，但不得污染其候选build；修订G1/G2、整合P0准备资产、文档/测试/不可变配对模型，单独可回退 |
| 第1新波 | S0-U **0.1.115候** | Main/e2e | contract单出口可安装、浏览器/Node/types真实消费PASS；不导出未实现runtime，不发Web开工通知 |
| 第2新波 | S0-R **0.1.116候** | Main/e2e | 加runtime第二出口、真实seeded四面、生命周期/恢复/隔离、pack/install及发布品一致性PASS |
| 消费者 | AtlasWeb并行实施 | AtlasWeb-F4/实施lane | S0-P生效+G1全部前置成立+S0-R可消费交付达标后，f4只发一次 §8明确通知；G2在Web真实集成后才可能PASS |

版本号为候选，若件F零码仍保留工位号与发布号分账，不自动挪S0版本。Main确认准确版本后落账，不擅自占现有波号。S0-U/ R各走详细锁面→落码→gate→段L→生产面，不将prep脚本绿灯冒充生产gate。无需先npm publish才验证可行性，但最终通知按 §8采用已经完成生产验真的可消费配对，减少消费者换锚。

## §2 S0-P：准备资产整合与阶段门修订

### 2.1 文件与执行纪律

Main只整合P0四提交的准备资产+上述三份文档，不带入旧代码快照覆盖当前master；当前共享脏文件不属于本工单。先记录P0差异/提交与主线merge-base；可逐提交选择性整合或应用文件diff，但不得reset/clean、不得自动stash他人资产。冲突逐文件保留双方后报f4。文档/脚本单独prep提交，不混产品runtime提交。

必改面：
- `docs/products/atlasweb/foundation-readiness.md`、`scripts/atlas-family-foundation-readiness.ts`及tests/unit同名测试。
- 总约§8列举arch-pin/roadmap/README/总计划旧授权条款，按317f4845原文定位修订，保留历史依据而明确新生效规则；不能放任『立即可启动』『源树稳定零内核改动即可』继续当授权。
- `scripts/atlasweb-kernel-boundary-scan.ts`与单测：消费者禁私有src reach-in；上游runtime内部允许审计过engine/session，禁UI加载。补.js→.ts/.tsx、alias/re-export/字面动态边；外部bare包不能靠跳过当实际闭包通过。实际产物闭包另举证。
- `scripts/atlas-host-state-access-scan.ts`：候选根缺失显式fail（不再跳过绿灯）；正则仅辅助，非授权读写证明。
- `docs/products/atlas-family-manifest.schema.yaml`或独立schema：**推荐配对证据独立JSON+schema，manifest版本化绑定其sha256**，不得未知字段被additionalProperties:false静默丢弃；保留原manifest v1验证兼容，新增v2接受immutable pairingRef。

### 2.2 两个不同评估输出

新增 `evaluateImplementationAdmission(input)` → `{implementationAdmitted:boolean,reasons:string[],evidence:Record<string,string>}`；保持 `evaluateFoundationReadiness` → `{releasable,...}`为G2，缺controller仍false。两者都fail-closed，禁把同一bool改名复用。

G1必需：用户授权引用、本工单审计通过、准确S3b生产证据、独立平行目录/权限隔离方案、单源契约及缺口审阅、Main承接的上游依赖/版本计划；证据键缺失/空/失败均拒绝。G1不要求实际Web controller已PASS。

G2保留原所有谓词，并加真实安装/闭包/生命周期隔离/恢复/安全/不可变配对及真实controller的证据；不得删原hard-false项。生产域的报告需可追溯到准确candidate，不以bool输入测试本身证明报告真实。干净要求针对隔离候选，不是清空多人checkout。

配对JSON至少：schemaVersion=1、upstream完整40位commit、packageName/version、contractEntry/runtimeEntry（S0-U阶段runtimeEntry未提供，capabilities中不能标ready）、artifact sha512 integrity、protocolVersion='v0'/envelopeVersion=0、consumerCommit（未集成显式null）、consumerLockDigest（未集成null）、evidenceDigest、products [{id,registered,enabled,accepted}]、rollback {kind:'disabled'|'verified-pair',pairDigest?}。registered≠enabled≠accepted；占位Office/Comic不得accepted。未集成项null使G2false，不阻G1。引用用内容摘要绑定，禁可变URL裸指针。schema/types从单源生成，不手写双份。

Prep测试：G0准备≠G1；G1全正/G2缺controller合法true/false；逐项缺失拒绝；v1/v2兼容拒绝未知字段；digest不符、缺runtime却宣告ready、占位产品accepted均拒；scanner缺目录/私有相对逃逸/bare外部包无闭包证据不能绿灯。Main提交前附明确tests计数、git diff --check；不用npm版本发布脚本跑prep。

## §3 S0-U（0.1.115候）：公共contract与第一个库出口

### 3.1 文件与依赖

- 新单源 `src/kernel/protocol/webSessionV0.ts`：Zod codecs及z.infer types；依赖只准zod与已审纯叶，禁Node/TUI/engine反向导入。已有coreSchemas中能逐义匹配的基础类型复用，不能复制SDK大schema或把Code词汇漏进产品中立声明。
- `package.json`新增公开subpath `./web-contract`（types/import），可保留`./package.json`用于版本读取；**本波不导出runtime空壳**。CLI bin保持；无默认指向CLI的library root。
- 独立contract build到 `dist/web-contract/index.js`（browser-compatible ESM），同源生成 `dist/web-contract/index.d.ts`及其完整相对类型闭包；不手工抄.d.ts、不留src alias/私有TSX/Node内建类型。
- 新focused declaration config/build script（文件名Main在lock-face列明），接入原prepublish build，确保后续发布不会只重建CLI漏库品；外部依赖必须在dependencies显式声明（Main已登记--external旧坑）；两build产物不能共享会拉入Node runtime的chunk。
- tests至少 `tests/unit/web-session-v0-contract.test.ts`、`tests/func/web-contract-pack.test.ts`；fixture无上游源树可见，Node>=20纯安装、TypeScript解析、browser build均只按公开subpath消费。

### 3.2 公共数据与方法契约（准确TS签名在Main锁面中逐项对表，不得留undefined语义）

统一envelope字段：`schemaVersion:0`、`kind`判别、`requestId`、`productId`、`scopeId`；有sessionId/subscriptionId的类型逐件required，strict schema拒未知版本/不合法字段。ID为非空长度<=128的opaque字符串，不作为盘路径；requestId为每操作UUID；generation为runtime生成的不透明UUID epoch。

公共summary：sessionId、title、createdAt/updatedAt（ISO UTC）、messageCount、productId/scopeId；排序updatedAt降序、sessionId升序消同值歧义。时间与计数未知需显式null/错误，禁fabricate mtime成created时间。list/search分页基于固定result snapshot+opaque pageToken，不能对变动目录使用offset伪稳定；过期token返回cursorExpired。

公共projection：`{sessionId,productId,scopeId,semantics:'persisted-effective-conversation',messages:[{id,role,createdAt,blocks:[...]}],truncated:false}`。role='user'|'assistant'|'system'；blocks最小text `{kind:'text',text}` 与产品中立activity `{kind:'activity',label,status?}`。Code-only结构由AtlasCode adapter映射，不把裸tool/Bash/schema复制到kernel；未知无法投影的内容必须标明unsupported activity，不能静默丢用户/助手文本。不得把部分投影标truncated:false；超预算返回resourceLimit，首车不做隐式截断。二进制附件只给安全metadata，不读外部附件路径、不内嵌base64；首车不渲染/下载原附件。

commands：listSessions({scopeId,pageSize?,pageToken?})；searchSessions({scopeId,query,pageSize?,pageToken?})；replaySession({scopeId,sessionId})；followSession({scopeId,sessionId,resumeCursor?})。public request须带envelope域，不接受storageRoot/filePath。search只做literal case-insensitive文本搜索（非用户regex），结果带sessionId/messageId/text snippet（<=512 Unicode code points）供定位。空query invalidRequest。只读cancel(requestId)/unsubscribe(subscriptionId)为控制面，不执行F2回合取消。

错误联合：unsupportedSchema/invalidRequest/scopeDenied/notFound/corruptData/ioUnavailable/cursorExpired/resourceLimit/cancelled/closed；只暴露安全message与retryable，不泄露本机盘路径/secret/stack。缺省目录不存在→notFound/明确不存在域，权限错→scopeDenied或ioUnavailable，不返回伪空列表。空的已授权有效存储目录可以[]。

事件：baseline/replacement/resetRequired/error/closed；baseline/replacement带完整projection、generation、baselineId（baseline生成UUID）、revision（0..Number.MAX_SAFE_INTEGER）、cursor（opaque、绑定域、不能解析当文件路径）。同域revision递增，generation不比大小；epoch切换只能经当前请求/连接确认的新baseline，不接受旧连接迟到baseline。resetRequired不带假projection。revision到边界换generation+新baseline；不溢出。

contract可用非Code fixture（office样例会话，不启动office产品）验证产品中立；只算schema消费者不把office标enabled/accepted。

### 3.3 U验收与发布

反例：未知schema、错误ID/类型/长字段、跨域cursor、Node-only导入/私有subpath、缺types、shared chunk含runtime均拒。type/schema推导一致；Node/browser分别真实编译运行。schemaVersion=0与protocol='v0'及manifest版本分域。

四件套/canon恰合+CLI/help/bin回归后e2e GATE-PASS与f4采认双在案，再Main段L。生产面安装品public contract导入/codec/types及CLI锚复验、SRI同构。**U结束不通知AtlasWeb开工**（runtime尚缺）。

## §4 S0-R（0.1.116候）：窄只读runtime与第二个库出口

### 4.1 边界/文件与工序

建议文件：`src/engine/session/readonly.ts`（域内只读服务/必要纯解析提取）、`src/atlascode/web/readonlyRuntime.ts`（公共factory/产品装配）、`src/atlascode/web/sessionStoreAdapter.ts`（受授权真实读取）、`src/atlascode/web/projection.ts`（Code→中立投影）、`src/atlascode/web/limits.ts`（单一资源常量）、`src/atlascode/web/index.ts`（公共入口）；Main lock-face如需再拆文件列职责，不得扩到UI/整引擎。

不直接改全仓kernel注入槽为大规模多实例框架；新factory不调用compose/mountDomains/全局setSessionEnv/getActiveProductDefinition，不加载project写面、paths顶层VERSION扫描，不借set/reset全局槽假装隔离。复用load/buildConversationChain/renderableSearchText需要窄门面或纯解析提取；旧CLI原wrapper行为恒等。与现eslint STR-1冲突时，通过engine显式只读子门面注册allowlist，**不全局关边界规则、不允许消费者reach-in**。精准落点Main先呈锁面再码。

先红后绿：两独立实例同sessionId/different scope读写隔离反例，forked global env污染反例；再实现实例状态。第二切片实现poll/follow与恢复、最后pack出口；每切片可独立revert且canon计数恰合。

### 4.2 Factory与生命周期

公开 `createReadonlySessionRuntime(options)`，options包含显式`productId`、授权`scopes`及只读storage adapter、limits（可缺省资源值，**授权配置不可缺省**）；返回start/listSessions/searchSessions/replaySession/followSession/close。具体Promise/AsyncIterable句柄签名在锁面冻结，必须有AbortSignal支持与唯一terminal结果；new对象持有cache/revision/issued cursors/subscriptions/timers。

创建/模块import不做应用配置/产品目录探测、写盘、stdout、timer/连接/进程钩子。排除Node自身模块解析读取；测试用source allowlist区别二者。start才验证授权配置/起需要的timer，不能启provider/tools/hooks/shell/MCP；未start调用返回closed（安全message='not started'），close幂等可await，close后无事件/句柄留存。start后close的实例不可restart；重建新实例换epoch。

产品adapter由上游负责，host只能调用公开factory服务，不从HTTP请求接受路径或自行fs读产品目录。允许显式部署授权去读真实产品目录，但测试始终seeded；**不默认回落HOME**。路径/项目集合在adapter启动授权，文件枚举/读前canonical containment+symlink/TOCTOU校验，非法ID/../和链接指向未授权根必拒，未验证文件不能先读后鉴权。不得写session/配置/元数据，也不得因读取而启动flush hook。

### 4.3 一致性/恢复

follow使用实例串行采样和完整replacement，先注册采样再获取baseline，变化期间重试获取一致snapshot；半行不当完整记录，等待下一采样；非法完整行corruptData，不能无限静默等待。支持writer append、truncate、atomic rename/replace、compact；发生不连续时resetRequired+新generation/baseline，旧消息不再采纳。

cursor opaque随机token，由实例issued-token账本绑定product/scope/session/subscription/baseline/generation/revision/expiry，不接受伪造/跨域；跨scope拒scopeDenied，过期或restart未知token→resetRequired+新baseline，不声称重放所有遗漏中间态。reconnect建立新subscription/handshake域，旧connectionId的事件/迟到baseline拒绝由消费者契约测试固定，host实施时standing。resume不是绕过scope授权的能力。

只在投影变化时发replacement；目录时间/文件身份作为变更提示而非唯一一致性判据；同size快速改写/时戳碰撞/atomic rename均有测试。读不到稳定状态在request deadline内返回ioUnavailable（retryable），不能卡住其他实例或全局event loop。

慢消费者采用最新完整replacement合并（不合并error/closed/resetRequired顺序），达到pending界值主动reset/释放；超大的单projection返回resourceLimit，不能无限分配。所有取消/释放通过AbortSignal+句柄，在可取消的有界读取/解析批次检查，完成/取消只出一个终态。同步大文件全读全解析阻塞到deadline之后再判断不算实现取消。

### 4.4 资源值冻结（f4提案，供审计；Main如不可满足须锁面修订，禁自行放宽）

| 参数 | 默认 | 硬上限/下限 | 到界行为 |
|---|---:|---:|---|
| pageSize（条） | 50 | 1..200 | 非法invalidRequest；result按稳定snapshot分页 |
| 每scope最多扫描session（个） | 4096 | 16384 | 预检/扫描到上限+1即resourceLimit，不伪完整 |
| search query（Unicode code points） | — | 1..256 | 越界invalidRequest；literal无regex |
| 单transcript原始字节 | 64 MiB | 256 MiB | 读前/增长中超界resourceLimit，零隐式截断 |
| 单JSONL记录字节 | 1 MiB | 8 MiB | 流式边界检测超界resourceLimit，不能先无限buffer |
| 每transcript解析记录（条） | 100000 | 500000 | 超界resourceLimit |
| 单完整projection/事件序列化字节 | 4 MiB | 16 MiB | 超界resourceLimit；明确不返回半投影 |
| 每runtime scopes（个） | 32 | 128 | start拒不合法配置 |
| 每runtime subscriptions（个） | 16 | 64 | 第N+1个resourceLimit |
| 每runtime并发读操作（个） | 4 | 16 | 超额resourceLimit（不无限排队） |
| 每subscription pending事件（个） | 8 | 32 | 最新replacement合并；仍超限reset并释放 |
| 每subscription pending序列化字节 | 8 MiB | 32 MiB | 同上；终态控制槽独立保留1条 |
| polling interval（ms） | 1000 | 100..60000 | 非法配置start拒绝，无busy loop |
| 单请求deadline（ms） | 10000 | 1..60000 | cancelled（reason=deadline）；释放读资源 |
| subscription idle lease（ms，自最后消费者取事件/显式续租） | 120000 | 1000..600000 | 超时closed+释放；取事件/续租API在锁面定签名 |
| cursor/result snapshot TTL（ms） | 600000 | 1000..3600000 | 过期cursorExpired或follow reset，不猜续接 |
| 每runtime cursor/result snapshot ledger（项） | 128 | 1024 | LRU淘汰最旧，旧token显式过期 |
| ledger聚合payload（字节） | 16 MiB | 64 MiB | LRU淘汰；不靠项数上限假装内存有界 |
| close收敛deadline（ms） | 2000 | 1..10000 | 超时close拒ioUnavailable，不报告资源归零 |

MiB=1048576 bytes。禁止NaN/Infinity/小数/负值，跨参数合法性在start核：单event<=pending bytes，最少1个事件可交付；终态控制槽不能携大projection。所有默认是可配置安全上限而非性能承诺；硬上限不能被host请求调高。解析批次最多256条后yield并查abort/deadline；每次read chunk最多64KiB，超长record须在累积时拦截。每一参数测试默认/边界/±1/配置不合法，不能只测常量存在。

### 4.5 R验收/产物与声明

package再新增 `./web-session-runtime` → `dist/web-session-runtime/index.js/.d.ts`（Node>=20）；声明只依赖contract公开类型，不泄露内部engine/tui/private TSX。contract与runtime真实加载图均审；禁止入口导入就跑CLI。build/pack必须包含两者及类型闭包。

tests建议：unit/web-session-runtime-lifecycle、web-session-runtime-limits；func/web-session-runtime-fs、web-session-runtime-follow、web-session-runtime-pack；所有fixture指定seeded HOME/config roots，用同sessionId两目录反证实例串扰。新测试不能全量扫描worktrees。主线canon仍 `FORCE_COLOR=3 CI=true bun test --isolate ./tests/`，按既有独占纪律调度，不与e2e runner抢资源。

S0-R gate按 §6逐格；发布后fresh install同形复验contract/runtime导入、真实seeded四面/双实例/close；SRI绑定gate银行与npm tgz。headless产品CLI锚standing，不能因为Web只读而跳主线行为回归。

## §5 波前审视与Atlas-reveiw审计记录

### 5.1 f4自审（2026-11-15）

1. **分发已有件检查**：现只有CLI，确需出口；不立两新npm包，双subpath减少发布治理；不导出未实现runtime，U/R分车与两逻辑入口一致。
2. **可运行性**：只读无需整agent引擎，仍需真实storage adapter；不以kernel零diff/AST源码闭包假证runtime就绪。纯解析提取/取消/安全读取有实现风险，Main锁面必须说明实际方法；不因参考不足悄悄绕回全局槽。
3. **scope缩形**：用户已OK总约，只读里程碑获规划认可，但F2/F3/F6未冒销，后续真可用产品单独排；不重新问用户已决项。
4. **门禁循环**：G1/G2分输出且G2硬门不降；当前通知额外等R生产验真，避免消费者频换临时产物；不把G1 true误报foundation release。
5. **资源与错误**：所有“有界”均数值化，包含全局ledger/并发而非只单队列；loader原权限错吞空必须纠正于新服务，旧CLI行为不顺手改。真实HOME hash不变只证零写，零越权读另取运行证据。
6. **状态/拓扑**：严禁globalenv切换、全仓状态重构/旁路CLI子进程；若无法实例化，按lock-face报f4，不擅改拓扑。后续需要用户决策的新方向才上报，其他技术修形f4自决。
7. **发布面**：S0-P零npm；U/R各候选gate/生产形一致且SRI、build紧贴publish。单独prep不污染0.1.113已测候选；Main指定同步窗口。
8. **共享checkout**：P0四提交非快照覆盖，三文档带hash移交，任何冲突不reset；f4不提交产品代码，Main持发布权限。

### 5.2 Atlas-reveiw 审计闭环（2026-11-15，**通过——7 必改 + 4 可自决**；吸收后发双信号）

锚核验全合（937ab3eb/P0 317f4845/总约 SHA256 860159ef…逐字/bin-only 无 exports/compose:83-86 TUI 边/v0.1.106=bd708cb5）；范围定性诚实；排期不抢队列合纪律。**7 必改（均 lock-face/判据面钉死，零产品码）逐项采认入格：**

1. **cursor ledger LRU × 活跃 subscription 交互面**（资源表隐藏冲突）：LRU 淘汰优先非活跃 token；活跃 token 被淘汰（ledger 被活跃订阅挤满）→ **显式 resetRequired+新 baseline 禁静默失效**；场景入格 E（活跃订阅挤爆 ledger 终态唯一）。
2. **授权读取 check-read 竞态收口**（§4.2 加严）：禁 path 两段式（校验-open 窗口 symlink swap）——**open 时 resolve（O_NOFOLLOW/openat+dirfd 风格）+open 后 fstat 复核，校验与读取同一 fd**；**非 regular file 拒**（S_ISREG 白名单，FIFO/设备文件禁读防挂死）；hardlink 逃逸入测试面。
3. **变更判定效率判据**（§4.3 补）：无变更 poll **零重解析**（增量 offset/字节游标+尾部增量解析）；性能判据格 = 稳定文件 repeat poll IO/CPU ≈0 可测断言（禁只测正确性不测代价）。
4. **终态优先序 + close 超时后语义**：① 终态优先表 lock-face 钉死（建议 closed > cancelled > error 类；resetRequired 非终态走新 baseline 链）；② close 2000ms 超时后**实例仍 open 可重试 close，禁半关闭态**；重试语义与资源账面（泄漏面）入格 E。
5. **纯解析提取语义恒等对表**（§4.1/§7 必答③补判据）：提取走窄门面/纯函数须附**同输入同输出 fixture 回放对表**（旧路径 vs 新路径 diff 零差）——旧 CLI wrapper 恒等 AND 新路径语义=旧语义双面钉（防提取顺手修 bug 语义漂移）；提取依赖闭包纯度静态+运行双面（格 C 对表判据补入）。**「persisted-effective-conversation」投影定义须显式涵盖 precompact 跳过面（loader:1043-1058 语义继承与否）与 compact 边界消息取舍，fixture 覆盖**——§7 必答②扩项。
6. **Code-neutral 词汇审计入格 A**：contract 源禁品牌串（BR 轴延伸）+ Code 词汇 grep 审计（atlascode/session/tool/Bash 词面）格面化；zod 依赖版本域钉死 + exports 条件序/engines 一致（lock-face 列）。
7. **lease×pending×deadline 三方同窗终态唯一性测试**：slow consumer pending 满 + lease 超时 + request deadline 同窗——终态恰一（closed/cancelled/resourceLimit 归属表）+ 资源释放完整；入格 E/F。

**4 可自决采认**：① U/R 切缝合理，R 内两切片（隔离反例先红→实例状态→poll/follow/恢复→pack）**判据格按切片分列 gate 报告、段 L 一次**；② G1「用户授权引用」真实性由本审计环节承担；③ scanner 修订引 S3a 0.1.103 先例对表；④ prep 测试不冒充生产 gate、Main 同步窗口自决。

**审计结论：通过——本审计 = §8/§2.2 G1 前置之一在案。**必改 1/3/4/7 落 §6 格 E/F 判据面；必改 2/5/6 落 §7 lock-face 必答面（②③扩项）。§7 七必答面 + 本节 7 必改 = Main lock-face 呈批书完整输入。

### 5.3 段 D lock-face 批复（2026-11-15，f4：**通过，四组全钉死放行**；呈批书 docs/2026-11-15-s0-ur-lockface-brief.md @91b8324f）

1. **呈批①（§7.2/必改6）批准**：单源 fresh 定义成立——工单 §3.1「coreSchemas 能逐义匹配可复用」前提由呈批书 §0 证据修正（消息块 z.unknown 占位 + 类型生成脚本死链 = 不可复用实证），按证据收窄为全新定义；import 面 = zod/v4 唯一零仓库内 import；exports 条件序 types→import→default；`build:web-contract --target browser --external zod`；`tsconfig.web-contract.json` emitDeclarationOnly 文件名在此列明。CLI build 命令字节不动；prepublishOnly 串入第二 build = build 紧贴 publish 纪律延伸。
2. **呈批②（§7.3/必改5）批准**：load.ts 唯一修形 = 加性 opts `precompactSkip:'auto'|'force-full'`（缺省逐字节恒等、不 mutate env kill-switch）；**persisted-effective-conversation 定义采认** = 全量读 + terminal leaf 链（CLI 同规则）+ preserved 段并入 + 元数据行不投影；>5MB 域 readonly 全量 vs CLI 截断 = **故意修形**（工单禁隐式截断的正面兑现），fixture 对表 <5MB 域恒等 + >5MB 域各自如实断言。注记：'force-full' 跳过 walkChainBeforeParse 后死 fork 分支由 buildConversationChain 链重建排除——<5MB 对表零差即补偿逻辑实证，**fixture diff 非零 = RED 打回 lock-face 禁静默语义漂移**。renderableSearchText WeakMap 缓存键 = 调用方自有对象，无跨实例泄漏面，知悉复用。scopeId↔storageDir 显式映射、禁全 projectsDir 扫描反查批准。
3. **呈批③（§7.5/必改1/4/7）批准**：终态优先序 `closed > cancelled > resourceLimit/error > 数据` 钉死；LRU 淘非活跃先、活跃被挤满淘最旧 = 显式 resetRequired 禁静默；lease 句柄签名 `{[Symbol.asyncIterator], renewLease(): Promise<boolean>, close(): Promise<void>}`；close 2000ms 超时拒 ioUnavailable 保持 open 可重试禁半关闭；三方同窗归属表（closed(lease) > cancelled(deadline) > resourceLimit(pending)）预注册 RED→GREEN。
4. **呈批④（§7.7）批准**：S0-U = **0.1.115** / S0-R = **0.1.116** 确认；五切片 U-1/U-2/R-1/R-2/R-3 Δ 预注册表在案（判据格按切片分列 gate 报告、段 L 一次）；S0-P prep 提交窗 = 0.1.113 段 L 收口后立即执行、gate 等待期只读预研零提交。§7.4 同 fd 校验链（O_NOFOLLOW+fstat 双核+S_ISREG 白名单+hardlink 面逃逸测试）与 §7.6 资源表零修订（两知会项：poll 1000ms 时延基线非性能承诺、pageToken 与 cursor 同账本家族 TTL 600s）一并采认。
5. **§7.1 P0 整合形批准**：逐文件 diff 应用（不 cherry-pick 整提交）+ G1 六证据键 + manifest v1/v2 pairingRef 绑定形。**本批复 = 双信号②在案——Main 开工 U-1（webSessionV0 单源 + unit 格）**；0.1.113 W-AB4b 链照常不阻。

### 5.4 U-1 落位采认 + U-2 退避裁定（2026-11-15，f4）

1. **U-1 采认（0293cb06，原地不退）**：纯加性零既有文件 diff（src/kernel/protocol/ + tests/unit/ 各一新文件），canon 5962/0/485 Δ=+13+1 恰合预注册表，tsc/eslint/build 0——对 0.1.113 W-AB4b 判据面零影响，**无需 revert**。U-1 先行披露形与呈批书 §9「独立可 revert」一致。
2. **U-2 退避裁定：批准 Main 提案**——U-2 触 package.json exports/build 面正属 §7.7 prep 窗纪律防的候选污染面（func 测试亦入 gate canon 扫描域），**U-2 开工门 = 0.1.113 段 L 收口（与 S0-P prep 同窗）**。R-1/R-2/R-3 顺延同门（R 切片同触 build/出口面）；R-1 域内 readonly.ts 纯码是否提前由 Main 按 §7.7 prep 纪律自判（触面即退避，不触可预研零提交）。
3. **S0-P 预研采认**：P0 净资产 19 文件 +1402/-2 盘点在案；两注意面采认——① 三文档 hash 源在 P0 worktree 工作树（未提交态），整合时以 §0.1 三 hash 逐一复核工作树内容为准，AtlasWeb-F4 侧不另行 commit；② P0 四提交含 package.json +1 行，整合时逐行核、build face 遵 prep 窗。

### 5.5 U-2 采认 + prep 首车采认 + 事项 A 裁定（2026-11-15，f4；双平台 c964a1e9..cee4f477）

1. **S0-P prep 首车采认（fdb4e569，20 文件 +1614/-2，非 npm 波）**：P0 四提交资产逐文件整合 + 三文档 hash 验真移交 + 总约 untracked 落盘，与 §5.3-5 批准形一致。
2. **U-2 采认（cee4f477）**：`./web-contract` 出口 = exports 条件序（types→import→default + ./package.json 保留 + bin 不变）+ `build:web-contract`（browser --external zod + emitDeclarationOnly 单文件闭包）+ prepublishOnly 双 build（CLI build 字节不动——cli.js 18,211,564B 与 0.1.113 SRI 同值直证 CLI 零影响）。格 B 5 件全绿。四件套 tsc/eslint 0 + canon 5981/0/491，Δ=+19 测试/+6 文件恰合预注册（勘误采认：prep 测试实数 14 非误记 28；U-2 func +5）。**U 波（0.1.115 候）码面至此收口，候 R 波合流后一并 gate/段 L**。
3. **事项 A 裁定（自动安全审查 8 findings，#391）**：findings 全落 prep 必改面（fail-open readiness 授权判定/host-state-scan 缺 root 静默 continue/boundary-scan bare import+symlink 未 canonicalize/manifest commit 正则 provenance/configDirName pattern 过宽）= 工单 §2.1 计划内 prep 切片②，**R-1/R-2/R-3 按原序先行批准**——R 码面不消费 prep scanner/评估器，时序耦合不成立。**硬条件钉死：G1 判定与『可以并行实施』通知的前置 = #391 prep 切片② 修形落地且 prep gate（G1 六证据键 + 真值表）在 f4 采认在案**——findings 未修前 G1 不得判 true、通知不得发。
4. 下一步批准：R-1（readonlyReader + adapter 安全读，隔离反例先红）→ R-2（poll/follow/资源界/终态唯一）→ R-3（./web-session-runtime 出口）→ e2e gate（判据格按切片分列）→ 段 L 0.1.115/0.1.116（候 f4 采认 hash 方走，时序纪律遵行）。

### 5.6 R-1 采认（2026-11-15，f4；251d08c2）

1. **码面采认**：src/atlascode/web/ 四件（errors/limits/sessionStoreAdapter/readonlyRuntime）+ engine/session/readonly.ts 只读子门面 + load.ts 加性 `precompactSkip:'auto'|'force-full'`（缺省逐字节恒等/不 mutate env）——与 §5.3 批复形逐项吻合。
2. **判据兑现采认**：双实例隔离反例（同 sessionId 不同 scope + env 污染）先红后绿；adapter §7.4 同 fd 校验链全落（O_NOFOLLOW/S_ISREG/ino TOCTOU/读毕复核/containment/错误映射）；factory 生命周期（start/close/epoch/不可重启/closed('not started')）；scopeId↔storageDir 显式映射 + productId 静态校验。
3. **Δ 采认**：canon 5999/0/492，Δ+18 测试/+1 文件——预注册「~10」为估计形，实数超出方向 = **加严非放宽**（恰合锚 = 文件数与码面，非测试数下界）；adapter 真实 fs 测试（tmpdir seeded）收进预注册 unit 文件 = 本仓 unit 层 tmpdir 先例（atlas-host-state-access 同族）批准，R-3 func 文件仍按预注册开。cli.js 字节变化（18,211,980B）= R 码面入 CLI 图预期面，SRI 对照留段 L。
4. R-2 继续批准（预注册 +2 文件 ~16 测试——**本切片起实数落账时如偏离预注册须随披露给理由**，方向加严仍须声明防口径松弛惯例化）。

### 5.7 R-2 采认（2026-11-15，f4；c03f8b60，11 文件 +1982/−52）

1. **码面采认**：follow.ts（poll 订阅机：stat 三元组锚定 + 增量尾读 + 半行 pendingPartial 不当完整记录 + corruptData 终态 + 不连续 resetRequired 换 generation/baseline + 终态恰一 rank 制）/ cursorLedger.ts（verify 三态拒 + LRU 未 pin 先淘 + onActiveEvict 显式 resetRequired 禁静默失效 = §5.3 必改1 形兑现 + payload 界）/ projection.ts 中立投影 + computeLeafUuids 按 load.ts:1187-1226 同规则 / limits.ts §4.4 全表 DEFAULT/HARD 逐值对 / adapter 扩 statTranscript/readTranscriptTail/resolveTranscriptPath 三方法（安全链同 §7.4）/ readonlyRuntime replay 尺寸界先于 loadFull + 订阅槽 + closeDeadline——与 §5.3/呈批书 §7.5 判定形逐项吻合。
2. **裁定 2 条采认**：① abort 终态 = `error{code:'cancelled'}`（contract 事件 kind 无独立 cancelled；rank 3 语义保留）——**补充钉死：closed 恒为唯一 terminal 事件 kind，cancel/abort 路径 = error{code:'cancelled'} → closed 且终态后零数据事件；三方同窗归属表判读以终态 kind（closed）+ 伴随 error code 定归属，测试断言覆盖该映射**；② limits 跨参校验时点 = factory 构造时（纯内存一致性，R-1 fs adapter 先例），start 面验授权/scope 配置（§4.2 原义指 scope 面）——两分界采认，与 §7.6「跨参数 start 核」字面以 face 分账解读在案。
3. **Δ 披露采认（§5.6-4 纪律首例兑现）**：+21 测试/+2 文件 vs 预注册 ~16，+5 加严向已披露理由（lease 超时/订阅槽释放/close 幂等独立成件 + limits 逐值断言，非拆分虚胖）——批准。canon 6020/0/494 恰合（基线 5999/0/492，Δ+21+2 恰合实数）；R-1 全量回归绿。
4. **登记 2 条**：① projection.computeLeafUuids 为 load.ts:1187-1226 同规则镜像——漂移守卫 = 必改5a fixture 对表 standing，load.ts 链/leaf 规则日后变更时镜像同步义务在案（W-AB4 diffRegion 单源化先例为更优形，届时可置换登记）；② `bun run check` 无 stdin exit 1 = 旧已知形态，非本波 RED，零处置。
5. **R-3 继续批准**：./web-session-runtime 出口 + fs/pack 双测试文件按预注册开；R 波码面收口后合流 U 波一并 e2e gate（判据格 A-J 按切片分列）→ 段 L 0.1.115/0.1.116（候本节采认 commit hash 方走，时序纪律遵行）。

### 5.8 R-3 采认（2026-11-15，f4；33989459 + 4427df15，f4 抽验码面）

1. **码面采认（f4 抽验）**：engine 解耦注入缝兑现——projection.ts 零 engine 导入（ProjectionSourceMessage 结构面 + ProjectionEngineDeps 注入缝），engine 真体 cast 焊接边界收在 runtimeDefault.ts 不进 pack 图；entry.ts 纯 re-export 零副作用零 engine/TUI/TSX 泄漏；exports `./web-session-runtime` 条件序 types→import→default 正确；contract.ts 相对闭包 shim；prepublishOnly 扩链同步。pack 判别格 5 件（零 zod/contract 依赖 + 零 src/ specifier + bundle 加载图零 engine 泄漏 + node ESM 真导入）= 格 B/C e2e 前置证据在案。
2. **§5.7-2① 终态对钉死兑现采认**：error → error+closed 成对、stripTerminalFromQueue 高优先覆写、终态后零数据事件，follow 测试 untilTerminal 改形消费到 closed 断言该映射——本节钉死形落码直证。
3. **安全审查处置表全采认**：① TOCTOU 交付侧修（replay/follow 前后双采样三元组全等 + 3 次有界重试 → ioUnavailable retryable；validated-fd 单次打开链不动 = 呈批书 §7.4 钉死形保持）；② 投影交付界（serializedProjectionBytes ≤ maxProjectionBytes 超界 resourceLimit 零半投影）；③ 生命周期竞态全修（releaseOnce 移 run() finally worker 实停才释 + close() 加盟 workerDone 2s + interrupted() 每 await 复检 + maxSubscriptions:1 回归件）。
4. **呈报裁定（loader 级 bounded parser）：本波不加严，现状两防线采认为 S0 充分**——loader 逐行字节界不在预注册形内，落入即 load.ts 第二修形点违反 §7.3 钉死形；transcript 尺寸门（64/256MiB）先于 loadFull + 投影字节交付界两道防线构成 defense-in-depth。**§4.4 record 行判定面分账注记：adapter/tail 车道 = 累积时拦截（已实现）+ loader 全量车道 = 尺寸门 + 交付界两防线**，按此分账兑现。残余面（≤64MiB 文件内单行全量驻留内存）登记为 G2 格 D/E 观测项——若观测/消费实测暴露风险，届时以独立 lock-face 扩预注册形（readonly.ts 侧 post-parse 校验形，不动 load.ts）再裁，禁本波先行。
5. **Δ 披露采认**：+3 文件 +12 件 vs 预注册 +2 文件 ~10（加严向已披露：follow 两安全回归件独立成件 + contract-pack 断言改形随扩链连带非新增）——批准。canon 6032/0/496 恰合（Δ+12/+2 与披露逐件对账吻合）。zod-external 偏差修正采认：contract shim 纯 type re-export → bundle 零 zod 依赖（强于预期形），--external 保留防御性。
6. **R 波码面收口**：U-1/U-2/R-1/R-2/R-3 五切片全落。下一步 = U+R 合流 e2e gate（判据格 A-J 按切片分列，prep 测试不冒充生产 gate）→ 段 L 0.1.115/0.1.116（候本节采认 commit hash 方走）→ 发布后安装品生产复验 → #391 prep 切片② 修形 + prep gate（G1 六证据键 + 真值表）f4 采认 → 硬条件解锁。
7. **登记（Main 转呈，非阻塞）**：e2e gate 运行面 bun 测试进程段错误 ×2（运行时崩非产品码红，与 node 24 tsc flaky 段错误同族）→ **「bun 升级评估」入 f4 评估池**：bun 1.4.2（现役）→ 最新 stable 收益/风险（段错误频率随版本消长、对 canon 口径 `--isolate ./tests/` runner 与 CI 环境同步面影响）。属环境面非产品码；f4 有裁方排工单，Main 不先行。
8. **采认后修形追认（2026-11-15，f82c3967，f4 抽验）**：push 触发安全审查 [HIGH] follow run() 无 catch——issueBaseline 双采样 stat 拒绝逃逸 void run() = unhandled rejection 且违反 §5.7 终态对钉死形。修形 = run() catch-all 统一翻译 error→closed 成对（非形变，对齐既有钉死形；锁面不动），finally 释放序保持。f4 抽验码面吻合（catch-all + WebSessionError code 翻译 + 未知异常 ioUnavailable retryable 兜底）。TDD RED→GREEN 在案（statTranscript 拒绝注入：RED 静默挂死 → GREEN error{ioUnavailable}+closed 成对紧邻）；canon 6033/0/496 Δ+1 恰合回归件。**gate 候选锚更新 f82c3967**（e2e 另行知会）。
9. **GATE-RED 腿 6 修形批复（2026-11-15，f4）**：根因采认——runtime d.ts 树相对 specifier 无扩展名（沿源码 bundler resolution 风格），node16/nodenext 严格 ESM 消费者 TS2834 拒编译；bundler 消费全净（e2e BUNDLER_FULL_OK 在案）；U 出口单文件闭包无此面。**批准拟修形**：build 链尾 post-emit 重写步，仅触 dist/web-session-runtime 树内 .d.ts，无扩展名相对 specifier → './x.js' 形——**钉死四条**：① 仅相对 specifier（'./' '../' 起始）且无扩展名者改写，bare specifier 与已带 .js/.d.ts 者零触碰；② 脚本 fail-closed——遇不可改写/歧义形报错退出非静默跳过，重写幂等（重跑零差）；③ node16 消费编译 smoke（--module node16 --moduleResolution nodenext）入 build 链或 pack 测试为 GREEN 判据，TS2834 直判别；④ pack leg 2 加 RED 断言（d.ts 相对 specifier 必以 .js 结尾）先红后绿。零源码触碰、零源码 specifier 面——锁面不动。Δ 预注册采认：+1 scripts 文件 + pack 断言段（1-2 件），实数偏离随披露。
10. **腿 6 修形采认（2026-11-15，22949a84，f4 抽验）**：四条钉死逐条兑现直证——① 改写面仅相对无扩展名；② scripts/rewrite-web-session-runtime-dts.ts fail-closed（歧义形/重写目标不在 → throw/exit 1，存在性守卫）+ 幂等（pack 件断言重跑 `rewrote 0`）；③ node16/nodenext 消费编译 smoke 入 pack 件（skipLibCheck 刻意 false 保 TS2834 判别力）= GREEN 判据；④ pack leg 2 断言 RED 实录在案（contract.d.ts 红 + 真 TS2834×5）后绿。挂 build:web-session-runtime 链尾第四段，prepublishOnly 面不变，零源码触碰。canon 6034/0/496 Δ+1 恰合 smoke 件。**gate 候选锚更新 22949a84**；e2e 腿 6 re-gate 进行中。
11. **段 L 收口采认（2026-11-15，双版连发；f4 时序双在案核验）**：
    - **时序纪律兑现**：e2e gate-s0ur §0.1 窄 re-gate **GATE-PASS** @22949a84（canon 6034/0/496 e2e 独占跑逐字一致 + 工厂生命周期 smoke 全绿）+ f4 采认 ca88dba7（21:35）先于 release c8d8be47（21:49）/59324b86（21:52）——**0.1.113 §8-6 注记后段 L 硬门首例全程合规**（GATE-PASS 判定单 + f4 采认 commit hash 双在案方 bump/publish）。
    - **车 1 = 0.1.115**（release c8d8be47/tag v0.1.115/npm publish；shasum 005bdbc1…；cli.js 18,211,980B sha256 282b0085… 与 gate-s0ur 恒等；0.1.114 跳号留件 F 预注册兑现）；**车 2 = 0.1.116**（release 59324b86/tag v0.1.116/npm publish；shasum 02184aed…；cli.js 与 115 恒等；双出口 web-contract 7,975B / web-session-runtime 38,652B 与 e2e hash 复核恒等）；SRI v0.1.115.md/v0.1.116.md 留档（055a4b13），master=055a4b13 双平台齐平。
    - **候 e2e 生产复验腿**（双出口安装品 contract/runtime 消费 + SRI 四点）呈报后方记本波五段全链收口；硬条件（G1 判定 + 『可以并行实施』单信号）前置仍含 #391 prep 切片② + prep gate 采认。

### 5.12 #391 prep 切片② 采认（2026-11-15，f4；9953388d + 0c4e5771，f4 抽验）

1. **码面采认（f4 抽验）**：① readiness G1/G2 拆分——evaluateImplementationAdmission（scripts/atlas-family-foundation-readiness.ts:81-92）六证据键缺/空/空白均拒（fail-closed，implementationAdmitted = reasons.length===0），不要求 controller；G2 原谓词零动——两输出分离 = 审计必改形兑现；② host-state 缺 root → 显式 candidate-root-missing violation（never silently skipped 注记在案）；③ boundary scanner（.js→.ts 映射/@atlas alias 仓库边/bare 包闭包证据三态/symlink canonicalize+源扫描）；④ manifest **v1/v2 双文件分账实证**（v1 兼容保留旧 configDirName pattern；v2 收窄 `^~/\.[A-Za-z0-9][A-Za-z0-9._-]*$` + pairingRef sha256 + 40-hex provenance）+ docs/products/atlas-family-pairing.schema.yaml 独立 v1（placeholder 不得 accepted/runtimeEntry null 不得 ready/verified-pair 须 pairDigest）；⑤ 总约 §8 五文档修订（317f4845 原文定位，『立即可启动』『零内核改动即可』授权措辞撤回）。
2. **披露 4 项裁定**：① §2.2 外加 ready/placeholder 两 optional 字段（支撑两条 if/then 加严规则）——加严向批准；② bare 包未证即 violation（较「记录不拦」更严 fail-closed 直读）——批准；③ v1 schema 移除 ajv-strict 非标 name/version 元键（验证面无损）——批准；④ **worktrees/atlas-family-p0 处置登记待用户裁定**——删除被 classifier 拒属共享 checkout 纪律正常面，P0 内容已被 master 覆盖（prep 提交入位），留置零风险；日后处置走 `git worktree remove` 正径，**f4 不代裁，登记候用户**。
3. **Δ 采认**：canon 6070/0/497（基线 6034/0/496，Δ+36/+1 恰合）；TDD RED(21/11/4err)→GREEN + 定向 46/0 + tsc/eslint 0。8 findings（#391）逐条修形在案——**审计硬条件第一前置（#391 落地）兑现**。
4. **prep gate 批准执行**：Main 跑 G1 六证据键真值表 + evaluateImplementationAdmission 判定（缺一拒形），结果呈 f4 采认在案方算 prep gate 闭环。**硬条件全局账**：G1=true 判定 + 『可以并行实施』单信号前置 = ①#391 落地✅（本节）+ ②prep gate f4 采认（候）+ ③R 生产验证（0.1.115/116 生产复验腿，候 e2e）——三者在案方发单信号，缺一不发。

## §6 总判据（每波分格生效，禁止互相冒充）

| 格 | P | U | R | 证据 |
|---|---|---|---|---|
| A范围/单源 | 文档限制/F2F3F6 standing | schema非Code fixture | 真投影语义 | 类型推导/codec/样本 |
| B出口/安装 | 不适用 | contract Node/browser/TS | 两出口安装 | 无上游源树fixture、private subpath拒 |
| C副作用/闭包 | scanner职责修订 | contract无Node/UI | 实际runtime无UI/CLI/顶层应用探测 | build图+声明图+运行观测，第三方不跳审 |
| D四面 | G2缺controller仍false | mock不算 | 真实seeded四面 | 空/坏/大文件/compact/branch/IO错误 |
| E恢复 | 文档/negative fixtures | schema事件 | baseline竞态、旧连接、乱序/gap、半行/replace/慢端/取消 | 完整事件账本+资源终态 |
| F隔离 | 计划 | 无状态contract | 双实例+同ID+close A不伤B | 不改env/chdir/全局slot |
| G授权 | 计划 | 无磁盘API | 授权根/链接逃逸拒、真HOME零写/越权读拒 | seeded syscall或受控fs观测，hash非零读证明 |
| H回归/发布 | prep tests | canon恰合+CLI/S3b | 同上+四面 | e2e gate/f4双在案/生产品复验 |
| I配对/回退 | manifest版本/negative | U配对runtime未ready | 精确完整双出口配对 | artifact/commit/integrity/lock/disabled |
| J阶段门 | G1/G2 truth table | 不触G2controller | 仍无Webcontroller不假绿 | G1可达/G2待真实Web集成 |

资源数值运行测试归R格E/F，不能U contract常量断言替代。Web loopback auth/Host/Origin/cookie真实安全腿归Web实施后G2，不让尚未建仓的当前上游波伪报PASS。

## §7 Main lock-face 必答面（审计通过后呈f4，无新增产品问题不再向用户索裁）

1. P0安全整合文件清单/冲突与生效G1/G2证据键，v1/v2 manifest绑定形。
2. contract数据映射（未知content/时间/attachment/compact）与实际API签名/codec、browser/types产物及exports表。
3. readonlyReader纯解析提取落点、旧CLI不变证明；不引paths/version全局探测/写面的方法。
4. adapter授权路径、symlink/读前一致性校验、取消分块/parse批次及request deadline收敛。
5. baseline采样/follow注册、connection/epoch/cursor scope、lease续租准确签名与终态优先队列。
6. 默认/硬资源值全表逐项兑现；不能满足的值在落码前写原因与替代数值回f4，禁post-hoc迁就数据。
7. 独立构建和声明发射/外部包清单/安装测试，版本号确认，切片/测试Δ预注册、段G与段L输入。

## §8 单信号交接与收口

满足以下全部条件，f4才向AtlasWeb-F4发一条『可以并行实施』通知：
- 用户授权已入案、总约持久稿+旧文修订已由Main安全整合，S0-P审计/真值表PASS，G1全部前置证据真实成立；
- S0-U/R按审计锁面交付，R gate + f4采认 + Main段L发布 + e2e安装品生产复验（准确artifact/integrity）完成；
- 可消费配对清单含两公开入口、准确完整commit/version/tgz integrity/协议版本/声明与能力范围；首次失败回退disabled明示；
- AtlasWeb实施范围仍为批准总约，真实Webcontroller/security未完成时G2保持false。

通知体必须含：『可以并行实施』、准确包/版本/subpath及integrity、source锚/报告/配对清单、G1证据、消费者只能做的范围、G2剩余硬门、责任窗口。收件人AtlasWeb-F4负责随后建仓/实施lane衔接；不把这一通知写成foundation已发布。用户要求仅最终知会，期间例行推进不逐项索裁；新的实质产品/权限/跨进程方向分歧才升级用户。
