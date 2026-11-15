# AtlasWeb S0 总约提案：需求—特性—分工—验收

日期：2026-11-15。状态：**上游核验、消费者七项反馈与持久稿差异复核均已通过；待用户批准，不是开工授权。**

atlas-mainline-f4 已复核本文指定差异与 §8 所列 arch-pin/roadmap/README 原文范围，未提出阻塞修改；不代表全文历史审计，也不替代 Atlas-reveiw 正式工单审计。

本文保存 AtlasCode f4 与 AtlasWeb-F4 的 S0 协商成果。仅新增规划文档，不改产品代码、门禁实现或发布状态。P0 Tasks 1–4 已完成不等于 foundation 已放行；当前仍遵守旧门，不创建 AtlasWeb 正式仓。

## 0. 依据与证据分级

- 上游只读核验快照：`937ab3ebe6066282e2cd4c2b33080737d5261ab0`；P0 准备资产：`317f4845`。
- S3b 历史锚：`v0.1.106` = `bd708cb5d2007e913ac2b5713f361203592b1b68`。此前误引的 `4c27a8e6` 属于 0.1.103，撤回。
- 无桥发布基线：`v0.1.110` = `8c30495d8a2f5e8a7113247d9b82470bccb1a08c`；`v0.1.112` = `b6e47788acead52220e967b9068f2fce15cce266`。**三版均不提供本提案中的新增桥。**
- 上游 f4 报告：`src/kernel` 自 S3b 后无 diff；S3b 专项 `FORCE_COLOR=3 CI=true bun test --isolate ./tests/unit/s3b-first-car-guard.test.ts` 为 5 pass / 0 fail / 134 expects。这是对方执行证据，本线程未重复运行；不能推导 runtime 可分发、导入纯净或多实例安全。
- 上游原始协商稿暂存于 `/home/vince/.claude/jobs/9d1c80df/tmp/2026-11-15-atlasweb-s0-upstream-negotiation.md`，同目录有 AST 脚本与 JSON；这些是临时溯源位置，**不是长期事实源或正式 gate 资产**。关键结论与源代码定位在本文持久化；正式工单须在选定快照重跑、归档脚本/输出和哈希。
- 下列活码行号均来自上游 f4 的上述快照，不指向本 P0 工作区的同名文件当前内容。静态 AST 图是过近似，不覆盖第三方传递闭包、非字面量动态加载或运行副作用。
- 既有设计：`docs/superpowers/specs/2026-11-13-atlas-family-platform-design.md`；既有总计划：`docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md`。本文提出修订，不自动替换已生效规则。

## 1. 需求与全局特性列表

| 需求 | 特性 | 状态 | 根因 | 处置与推导链 |
|---|---|---|---|---|
| 统一产品平台 | Web shell + 可替换 layout.main + Code/Office/Comic bundles | 设计满足，未实现 | 不能把 Chat 固化为平台主工作面 | 产品 bundle 注册工作面；S0 只提供共享会话消费基础，不实现 Office/Comic 内容 |
| 独立开发与隔离 | 独立 Git 仓 `~/projects/AtlasWeb` | 方案已定，未建仓 | 避免与 AtlasCode checkout、runner、发布操作混用 | G1 批准后建平行目录；项目级配置不等于操作系统级访问隔离 |
| 单源契约 | 受支持 contract 出口及生成 types | 缺口 | CLI 分发品无 library exports/types，coreSchemas 不是完整 v0 | 上游建立显式出口；消费者禁止复制 schema 或私引相邻源码 |
| 同进程接入 | 只读 session runtime/factory | 缺口 | 现 compose 依赖 UI bootstrap 与全局状态 | 新窄 factory，不启动完整 agent 执行系统；不暗改 CLI 子进程 |
| 真实只读四面 | list/search/replay/follow | 缺口 | 有读取原语，无完整可分发服务和 follow 恢复协议 | S0-U/S0-R 与 Web controller 配对实测；contract-only 不核销 |
| 多产品状态隔离 | 实例级授权范围、路径、缓存、订阅 | 缺口 | 现有全局 slot/provider/env 不满足双实例 | 显式 product adapter，无默认真 HOME 回落、无全局 env/chdir 切换 |
| 故障可恢复 | baseline + replacement + reset | 提案，待冻结 | compact/rewrite/rotation 不能当纯 append | 最终投影收敛；旧域拒绝、gap/reset、取消/释放入硬格 |
| 不误报实施就绪 | G0/G1/G2 分阶段门 | 提案，旧规则仍有效 | 原门把建仓后 controller 证据当建仓前置 | 用户批准后修文档/评估器并加真值表；G1 与 G2 输出不同 |
| 可复现跨仓版本切面 | commit/artifact/integrity/lock/协议配对 | 缺口 | 现 manifest 无 artifact integrity 与桥入口记录 | 扩展 manifest 或绑定不可变配对清单，并机器验证一致性 |
| 首个可真用 Code 产品 | prompt/queue/cancel、审批/权限、交付物等 | 后续必须兑现，未核销 | 原 arch-pin F2/F3 是首个可用产品必须项 | read-only foundation 是更早的技术里程碑，不冒称完整 Code Web |

## 2. 架构与仓库边界

五层定位不变：载体（Web/TUI）→ 产品（Code/Office/Comic）→ 平台 shell → host/controller 服务面 → kernel/shared 及受支持产品服务。

首车运行拓扑：browser/WebView → HTTP/WS → AtlasWeb host → **同进程只读 product adapter/runtime**。

- AtlasCode 维护契约语义、可分发服务与实际产品存储 adapter；AtlasWeb 维护 HTTP/WS、鉴权、浏览器、host controller。
- AtlasWeb 不私引 `AtlasCode/src/**`，不自行读取 `~/.atlas*` 或任意请求路径。实际磁盘读取由上游受授权 adapter 执行。
- 上游 runtime 内部允许经过审核的 `engine/session` 窄读取与纯投影服务；不等于消费者可以 reach-in 私有 engine。
- 禁止 runtime 加载 TUI/Ink/React、CLI 执行入口或启动 provider/tools/hooks/shell/MCP 连接。只读 runtime 不宣称完整 agent engine 可嵌入。
- 若同进程方案不可实现，阻塞并呈报，不静默改成跨进程架构。
- `~/projects/AtlasWeb` 是独立仓，不是 AtlasCode 子目录/worktree/永久产品分支；产品先作为 AtlasWeb 内 packages/lanes，按独立发布治理成熟度另议拆仓。

### 2.1 分发选择（消费者建议，待正式工单冻结）

优先两个逻辑出口，不强制两个新 npm 包。候选为现包的 `@atlasharness/atlascode/web-contract` 与 `@atlasharness/atlascode/web-session-runtime`；名字尚非事实，不得写作已存在。

- contract：浏览器可编译、无 Node/UI 运行依赖；schema 与类型同源。
- runtime：Node-only、独立 ESM build/declarations/export map，显式 start/close；CLI bin 保持原行为。
- 消费者首车硬要求是**实际加载与声明闭包无 UI/CLI 副作用**，不要求安装依赖树零 React/Ink。现包 subpath 继承安装成本，必须披露，不能宣传“零 UI 包依赖”。若安装证据发现不可接受约束，再改独立最小包并另核构建/发布治理。
- 先本地 pack 与外仓纯安装验证，不用 npm link 或源码路径联结，不先 publish 试错。

## 3. 首期四面语义与完整产品里程碑

**本节为推荐范围，需用户认可；不是已获准缩小原始需求。**

| 能力 | 推荐首车语义 | 不承诺的范围 |
|---|---|---|
| list | 已授权 product/project scope 的会话摘要，稳定排序、有界分页、显式 I/O 错误 | 权限错不得变空列表，不能枚举未授权域 |
| search | 已持久化有效会话投影内搜索，可定位、取消、限额/分页 | 全部原始审计记录、全部历史分支 |
| replay | 已持久化的当前有效会话投影，JSON-safe typed projection | 完整原始档案、被省略 precompact 内容或所有历史分支 |
| follow | 先 baseline，后完整投影 replacement；断线后最终状态收敛 | 每次中间写、逐 token 实时流、exactly-once |

依据：上游 `engine/session/load.ts:1043–1058` 大文件路径跳 precompact；当前 loader 构建有效链，不是原始审计档案。UI/API/docs 必须明确“有效会话投影”“持久化更新”，不得标称“完整历史”或“逐 token”。若用户要求全审计/逐事件，必须扩大契约并重新估量首车，不能改名冒充。

里程碑分账：

1. S0-U：contract-only，可独立验证 schema/codec/导出/版本拒绝；mock PASS 不等于四面可用。
2. S0-R：真实只读 runtime，可对 seeded adapter 实跑；未对接 Web 不等于 foundation 可发布。
3. read-only foundation：壳、host/security、真实四面、安装配对及 G2 全 PASS，版本仅为候选 `0.1.0`，未授权 tag。
4. 可真用 Code Web：仍须兑现原 F2 prompt/queue/cancel、F3 审批权限及其依赖；不能用里程碑 3 核销原首期必须项。
5. Office/Comic bundles 后续验证；预留 package/configDirName 不等于产品可用或兼容已验。

### 3.1 只读 foundation 验收表

| 项 | 放行要求 |
|---|---|
| 平台壳与安全 | boot/required-plugin 审计、品牌/模式骨架、layout.main、loopback HTTP/WS 与鉴权实测 |
| 会话能力 | 本节限定语义的真实 list/search/replay/follow，非 mock |
| 可分发与可靠性 | 下文 A–J 全 PASS、准确安装配对及干净候选；满足 G2 |
| 对外声明 | 只读技术 foundation；不宣称已支持发起回合或审批 |

### 3.2 首个可真用 Code Web 验收表（后续独立工单）

| 原特性 | 原优先级 | 放行要求 |
|---|---|---|
| F1/F6/F7 | 必须 | 只读四面、恢复与 loopback 安全继续 standing；F6 原有 page 补洞义务保留，S0 replacement 方案不自动核销；若要替代须用户明确裁定 |
| F2 | 必须 | Web prompt/queue/cancel 发起真回合、取消闭环，有实际引擎 wire 证据 |
| F3 | 必须 | Web 审批/权限可批可拒，kernel event/decision 与 UI 交互分账、真实闭环 |
| F4/F5 | 必须 | Atlas-X 机制与独立 Atlas 品牌实装；Code 工作面由 bundle 注册 |
| F8/F9 | 应有 | 交付物卡与设置骨架按原优先级交付或显式登记差异，不提升或默删 |
| F10 | 可延 | 文件树/工作区浏览可后排；延期不写成已实现 |

本表保留需求，不是完整交互链详细验收工单；其准确协议、执行 runtime 与权限判据须另立波冻结。只读 runtime 不能自动承担 F2/F3。

## 4. 协议与 runtime 必须冻结的约束

建议 commands：listSessions/searchSessions/replaySession/followSession，加 cancel/unsubscribe 控制面。这里的 cancel 只取消只读请求，unsubscribe 只释放订阅，**不代表 F2 的 agent 真回合取消能力**。字段名及准确方法签名在审计工单中冻结，本文不是既有 API 声明。

- envelope 最小语义：schemaVersion、requestId、productId/scopeId、generation/kind；按消息类型有 sessionId、subscriptionId、cursor、baselineId。协议 `v0`、envelope schemaVersion 与 manifest schemaVersion 分域，不能混作 npm 版本。
- generation 是 epoch 身份，不默认可比较大小；cursor 只在对应实例/scope/session/subscription 域内解释。客户端只采纳当前连接/订阅握手确认的 baseline 域，旧连接 baseline 及事件不得倒灌。
- 重复幂等、乱序拒绝；gap/reconnect/过期 cursor 显式 resetRequired 后新 baseline，不静默续接。
- baseline 读取与订阅注册无丢更新竞态；半行 JSONL 不作为完整消息；truncate/replace/compact 有明确 generation/replacement 规则。
- 正式工单必须逐项冻结：页大小、搜索扫描与返回上限、文件/记录大小、订阅数、pending bytes/events、采样间隔、请求/空闲超时、cursor 保留期限、close 收敛期限。每项给数值、单位、默认/硬上限、超限错误或重置行为，覆盖边界±1；缺任一不得放行。此刻不临时填数字冒充已实测支持。
- contract 浏览器独立产物不能通过共享 chunk 间接加载 Node runtime；cursor 是单调数值还是 opaque token 须在工单明确，比较只限同域。
- unsupportedSchema/invalidRequest/scopeDenied/notFound/corruptData/ioUnavailable/cursorExpired/resourceLimit/cancelled/closed 等错误分态，不以空结果掩盖错误。
- cancel/close 幂等；完成与取消竞态只允许一个终态；释放后无回调；关 A 不伤 B，资源回收可等待。
- factory 候选形为 createReadonlySessionRuntime(explicitProductAdapter, limits)，准确签名由工单冻结；对象持实例路径/授权范围/cache/revision/subscription/timer。缺配置 fail-closed，无真实 HOME 默认值，无全局槽重置或 env/chdir 切换。
- “导入无 I/O 副作用”排除 Node 模块装载必需的文件读取，禁止的是应用初始化的配置/产品目录探测、写盘、stdout、计时器、连接、进程钩子和 CLI 执行等；正式探针必须清晰区分。

## 5. 上游现状：可复用不等于已可用

以下由上游 f4 在 §0 快照核验，正式落码前重核：

| 部位 | 证据与限制 |
|---|---|
| package.json:6–12,23 | bin/files/build 面仅 CLI，无受支持 exports/types 库面；cli.ts:99–104 自动执行且可 exit，不能导入 CLI 代替库 |
| kernel/entrypoints/sdk/coreSchemas.ts:10–11 | zod/v4 + lazySchema，静态源码运行闭包 2 文件、UI 边 0；仅为可复用原料，不等于完整 Code-neutral v0 |
| cli/sessionList.ts:72–116,30–36 | 列表原语可复用，但缺目录与权限错混为空；经 engine 根门面的源码闭包约 522 文件，不当实际 bundle 体积 |
| engine/session/search.ts:48 | renderableSearchText 纯投影；不是完整搜索 controller |
| engine/session/load.ts:317,462,1002 | 链构建/读取可复用；Map/Set/Date/internal transcript 需投影 |
| engine/session/load.ts 依赖图 | 静态源码闭包 41 文件、UI 边 0；paths.ts:161–180 有顶层 VERSION fs 探测，env.ts:42–69 有默认环境/HOME，paths.ts:36 与 load.ts:1260 有全局 cache，不能原样承诺导入纯净/实例安全 |
| atlascode/compose.ts:83–86,234–249,577–585 | TUI bootstrap、全局注入与 singleton；静态闭包约 618 文件、含 TUI 16，不能 re-export 作 Web factory |
| kernel/state/injection.ts:16–21 等 | 全局状态槽；SessionEnv:69–76 全局合并，shared/configDir.ts:39–45 单 provider，ProductDefinition.ts:49–58 静态 active product，不满足双实例 |

## 6. 分阶段门提案（须用户批准后才生效）

| 门 | 可做 | 必须具备 | 不可推导 |
|---|---|---|---|
| G0 prepare（当前） | 调研、定约、工单、只读准备资产 | 不变更产品行为；维持旧门约束 | 不能建正式仓或标 foundation 可用 |
| G1 implementationAdmitted | 建平行仓、host/adapter/shell 开发，本地 pack 消费 | 用户批准修订、准确 S3b 证据、隔离方案、契约/缺口审阅、经审计上游工单与依赖计划 | 不要求 controller 已 PASS；不能 tag 或宣传完整产品 |
| G2 foundationReleasable | 正式 foundation 交付/tag，发布仍遵守授权流程 | 真实四面、闭包/隔离/恢复/security/兼容与配对等全部硬门 PASS、干净候选 checkout | 任何缺证据均 false；本地可行性 PASS 不等于 npm 已发布 |

保留 evaluateFoundationReadiness 的 G2 硬门，不降低已有 false；另用不同输出名评估 G1。G1=true/G2=false 是合法状态。干净要求针对隔离候选，不要求清理多人 master 无关 untracked。旧规则尚未修订，不能直接套用新门开工。

## 7. 双方任务、依赖与验收

| 工作项 | 主责 | 依赖 | 可检查交付 |
|---|---|---|---|
| S0 总约/消费者反馈 | AtlasWeb-F4（本线程） | 上游核验 | 本文及差异清单，用户认可范围与门禁 |
| 上游工单与锁面 | atlas-mainline-f4 | 用户认可；Main 确认排程 | §0 活码重核、明确 API/数值界限/文件面、§5 审视、Atlas-reveiw 审计 |
| S0-U 契约与分发 | AtlasCode Main | 工单/锁面 | 同源 schema/codec/types、显式 exports、build、pack、浏览器/TS 消费 |
| S0-R 只读 runtime | AtlasCode Main | 冻结契约与授权 adapter | 真实四面 factory、生命周期、实例隔离、可安装产物 |
| P0 阶段门修订 | P0 owner，规划与落码按角色分开 | 用户批准新门 | 文档、G1/G2 真值表、scanner 职责修订；不重写 P0 历史 |
| 外仓消费者与 host | AtlasWeb 实施 lane；本线程规划/核验 | G1 与可消费 tgz | 纯安装编译/运行、HTTP/WS/auth、真实 controller 与 browser |
| 审计与 gate | Atlas-reveiw / e2e | 工单与候选产物 | A–J 逐格证据，主线回归与安装品复验 |
| 版本与发布 | Main（AtlasCode）；Web 发布另明确 owner/授权 | gate/发布门 | 不占用已排 0.1.113/114，不预分配新桥版本；发布与生产验真闭环 |

上游 contract-only 与 runtime 可分切片/分车，但先后交付不等于 foundation 提前放行。壳可在 G1 后并行做，真实四面合流必须等 runtime。不上游 publish 也可先用准确 tgz 验证；禁止 npm link 私引源码。

### 验收 A–J

| 格 | 必须验证 |
|---|---|
| A 契约范围 | 四面范围公开，已有/适配/新增分列，非 Code fixture，原 F2/F3 未冒销 |
| B 可安装出口 | 外仓仅装 tgz、无上游源树可见，Node 导入/TS 与浏览器 contract 编译；私有/未知 subpath 拒绝；不执行 CLI |
| C 同源与闭包 | 实际构建产物/metafile/声明闭包检查，无 src alias/私有 TSX；schema 单源；bare 包不跳审 |
| D 四面 | seeded adapter 真 list/search/replay/follow，空/坏/权限错/大文件/compact/分支冻结语义，无错误伪空 |
| E 恢复与竞态 | baseline 注册、旧连接、重复/乱序/gap/过期/半行/truncate/replace、慢消费者、取消单终态及释放 |
| F 生命周期隔离 | 导入无应用副作用，start/close，双实例同 sessionId 不同域交错、A 更新不入 B、关 A 不伤 B，资源归零 |
| G 授权与真环境 | 非授权域拒读；受控 HOME/sandbox 加真实 HOME 前后写 hash/运行观测，不把 hash 不变当零读取证明；无全局 env 切域，无执行服务启动 |
| H 主线与安全回归 | canon/S3b/CLI/help/入口回归及 loopback token-cookie、Host/Origin、未授权访问拒绝；e2e gate 与发布后安装品复验 |
| I 配对回退 | 上游完整 commit/tgz integrity/入口/协议与消费者 commit/lock 配对实测；无前桥时 disabled 回退 |
| J 阶段门 | G1/G2 真值表、缺项负腿；controller 缺失时 G2 必 false，G1 也须满足自身全部前置 |

## 8. 现有文档/门禁必须修订的清单

本节只登记修订，不在协商期间改动生效规则。下表行号固定针对 P0 `317f4845`，本次新增索引链接会使工作区部分行号后移；以该 commit 原文定位。表中旧文由本线程核对，不冒称上游 f4 已独立核验全部旧文：

| 真实路径:行 | 原条款/问题 | 待批准的替代条款 |
|---|---|---|
| docs/2026-11-13-atlasweb-arch-pin.md:15 | A4 monorepo 内起步 | 独立 AtlasWeb 平行目录，G1 后建仓 |
| docs/2026-11-13-atlasweb-arch-pin.md:18 | coreSchemas 作为既有 wire 单源 | 复用匹配原料，上游新增受支持 v0 出口；不是现成服务 |
| docs/2026-11-13-atlasweb-arch-pin.md:27–35 | F1–F7 首期必须 | 保留首个真可用产品判据；独立只读技术里程碑见 §3 双表 |
| docs/2026-11-13-atlasweb-arch-pin.md:43–45,52–65 | 可立即开工、只读零内核改动 | 撤回就绪推断，先上游桥与阶段门；G1 后开发，G2 后交付 |
| docs/products/atlas-family-roadmap.md:9–13,54–60,86–89 | 历史阶段/锚、包形式及阻塞状态 | 历史基座与未来桥分账，实际 commit/artifact 配对 |
| docs/products/atlasweb/README.md:9,27 | 历史准入及一概禁止 engine | G1/G2 分层；消费者禁私引，上游可用已审窄服务 |
| docs/products/atlasweb/foundation-readiness.md:27–29 | 所有谓词同时限制建仓与 tag | G1 建仓开发，G2 保留全部发布硬门 |
| scripts/atlas-family-foundation-readiness.ts:7,39 | controllerEvidence 单门 | 保留 G2，另设 G1 输出与独立前置 |
| docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md:232–246,336 | Task5 建仓前即要求 controller readiness | 分阶段计划与依赖无环，未经修订不执行 |
| scripts/atlasweb-kernel-boundary-scan.ts:23–27,44–62,123–126 | engine 全禁与外包跳过/有限 resolver | 消费者 reach-in 守卫；新增实际包闭包举证 |
| scripts/atlas-host-state-access-scan.ts:39 | 缺目录跳过 | 不能当运行隔离，通过真实授权/读写探针补证 |
| docs/products/atlas-family-manifest.schema.yaml:17–24,33–40,49–55 | 无 integrity/入口/状态且禁止额外属性 | 版本化扩型或不可变证据绑定；registered/enabled/accepted 分开 |


- arch-pin v1 A4 monorepo 起步，与后来独立仓方案不一致；§3–5“立即可启动/零内核改动/源树稳定即足够”的结论需按此次证据撤回。A7 coreSchemas 是原料，不能写作现成 v0。
- arch-pin F2/F3 必须项仍属于可真用 Code 产品；foundation 必须与该里程碑分开，不能无声删需求。
- family roadmap、Web lane README、foundation-readiness 的旧锚、单门建仓措辞与消费者禁止 engine 的表述需对齐。
- boundary scanner 目前整体禁 engine、bare external 跳过、resolver 不完整；仅可作消费者私有源码访问守卫，不能证明 upstream runtime 实际闭包无 UI。
- host-state 正则扫描器缺目录跳过，不能作为运行时读写隔离；G2 必须有产物与运行证据。
- manifest 当前仅 package 字符串，无入口/tgz integrity/实际产品启用状态。需扩展 schema 或绑定经过验证的不可变配对清单；未实现 Office/Comic 不得记为已验兼容。
- 老总计划 Task5 仍按旧 gate 执行。新门未批准、文档与真值表未修好前，不能以本文绕开 Task5。

## 9. 回退、权限与开工边界

- 锁上游完整 source commit、build 命令/环境/工具链、tgz sha512、exports/schema 版本、consumer commit/lock、gate 与配对清单；正式 npm 品再核同一性。
- 有已验桥时只退已验配对；首次无前版桥时退 host disabled/能力不可用，不能说退 v0.1.105/110 就仍可用 Web。产品行为回退与桥兼容回退分账。
- 独立项目权限不意味着不同 HOME/系统用户；不修改全局配置，不扩大权限，不把两个目录当安全沙箱。真实产品目录仅由受授权 adapter 访问，测试 seeded sandbox。
- 本文新增与索引链接只属规划资产，不合并、不 commit/push、不创建远程仓、不 publish/tag、不通知 Main 开工。

**下一步：上游确认消费者反馈 → 向用户呈交门禁/范围/分发选择及总约 → 用户认可后 f4 出详细工单并审计 → 修订阶段门、满足 G1 → 上游/外仓按依赖实施 → G2 真证据全 PASS 后再走发布链。**
