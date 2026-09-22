# AtlasCode 顶层架构纲领 v0.11（草案）

> **状态：草案，架构层定稿（L0–L6）+ 全部 open question 裁定完毕（含 Tier 2 双跑/测试迁移），未实施。**
> 本文件记录截至 2026-09-21 的架构讨论结论（v0.7）。在细节讨论完成、用户明确点头前，**不 init git、不写任何代码**。
> 后续深化直接在本文件修订，版本号递增。
> 讨论源：AtlasHarness session（产品拆分规划，含 pi/openwork 理念对照、核心边界探查、壳可替换性评估、engine 独立与平铺推导、ascend 域包定义、identity/feature/lint/旧仓处置/modelprovider/analytics 六项 open question 裁定、执行器/注册机制深度推导 + 业界调研、四域自治模型推导、双跑等价机制 + 测试迁移策略 Tier 2 深化）。

> **v0.9 变更摘要（2026-09-21，C 层 8 项架构议题闭环——L4.9 新节）**：
> 1. **C-1 feature() 换前验真**：「零语义变化」押在仓内 F5 断言（生产 bundle 的 `bun:bundle` 经 imports 重映射到 env 桩）——断言未实证（A 层教训：6 个数字复现不了）。**A 波换前一次性验真**（`bun build` 产物 grep `FEATURE_`）：= 桩 env 语义 → 零变化；= 构建期常量 → 换后对齐 73631df/81521d0 ON_BY_DEFAULT 裁定本意（记语义差异非回归）。fixture env 固定：E 层2 fixture 清单加 `env:` 字段显式 pin 涉及 `FEATURE_*`。
> 2. **C-2 EngineState 并发模型**：旧仓 fileHistory 已是 updater 注入式（React functional-update 语义），新仓 EngineState 是**同构迁移非新发明**；**set(f) 串行 apply 队列**（每 f 看最新 committed prev；per-file map 不同键并发天然交换，无锁）；E fixture 矩阵 +2（并行 Edit fileHistory diff / rewind 链）。
> 3. **C-3 shared 准入判据（L8 新规则 STR-4）**：三硬判据（纯度/多域消费/扁平）防 C1 下沉 225 处变垃圾场；判据只约束 C1 新候选，charter 已裁定项（sanitizeToolName/tokenEstimation 等）祖传豁免。
> 4. **C-4 logging**：本期不加第 9 port；shared 开**有限 I/O 叶子例外名单**（feature.ts / identity.ts / log.ts，零项目内依赖不成耦合点）；远程日志 = Phase 3 演进 port（out-of-scope）。
> 5. **C-5 配置优先级（审视后修正，翻原序）**：**企业策略（MDM managed settings）> env（`ATLAS_*`）> settings.json（用户）> 代码默认**——MDM 是合规最高权威，env 不得压企业策略（原序反了）；每域 config.ts（AUT-2）内部固定 policy→env→settings→default 顺序。
> 6. **C-6 rollback（审视后修正：reset 非 revert）**：波次 = 回滚点（checkpoint tag `wave-a`/`wave-b`/…），回滚 = `git reset` 到上一波 tag（range revert 易冲突，单人本地仓 reset 干净）；旧仓 `a8af45b` 全绿基线 = 终极兜底。
> 7. **C-7 .tsx 491 编译产物**：原样搬不重编译三原则（原样搬/最小插入/新逻辑落干净文件）；C 波风险低（88 丝几乎全 .ts），主战场 D 波 UI。
> 8. **C-8 市场克隆依赖**：三层不变——E gate（gelu L1）纯 fixture 零市场克隆依赖；L4 evals 保留克隆门控（`ATLAS_ASCEND_KNOWLEDGE_DIR`，未物化 SKIP）；市场预装/验真链归 D 波壳层。
> 9. **开工前复审勘误 pass（2026-09-22，三路 agent 复审 + 全文自读，零决策风险纯机械修正，明细见 `docs/review-2026-09-22.md`）**：① feature() 调用点 586 复现不了（代码行 575/原始 598/含双引号 622，75 flag ✓）→ 不写死、迁移时重新推导；②「全从 bun:bundle import」错（127 内建 + 45 F5 shim）→ 换 import 覆盖两种形态；③ ON_BY_DEFAULT 2 项 {TRANSCRIPT_CLASSIFIER, COORDINATOR_MODE}（F 波行/附录 1 项系 73631df 前旧值）；④ 规则数 14→15（v0.9 增 STR-4，L2 指针/L8 头注未同步）；⑤ v0.6 摘要 30 目标 12/13 互换（L4.7 明细 13/12 权威）；⑥ 双跑「每波次」修正为「engine 在场波次 C/E/D」；⑦ B14「三柱」标题修正为「承重 5 规则」（三柱 ⊂ 5 规则）；⑧ [ATLAS-HOLD] ~10 处修正为 18/14（L8.1 权威）；⑨ NpuToolchain 5→7 成员（补 isAvailable/availableCommands）；⑩ L972 行号 :34→:35 + fileHistory curried 外层注。
>
> **v0.10 变更摘要（2026-09-22，执行弹性 + 双跑脱耦——不改架构裁定，改执行策略与验证接线）**：① **双跑等价基线脱耦 IFF 网关**（L5.1 新节）：14 种子测试分两层——层 1 确定性等价（fixture replay，**不依赖 IFF**，等价性必要条件/基线）+ 层 2 增量置信（live gateway，nice-to-have）；等价性以层 1 为准，解掉「验证机制循环依赖待定案网关」。② **执行弹性三件套**（L5 新节 + 独立文档 `docs/execution-strategy.md`）：并行地图（B 波可并行 2 session × 2 域，判据=**可检测 + 机械可恢复**；C 波纯串行=设计耦合不可机械恢复；A/E/D/F 串行）+ 共存路径（每波定义「最小可交付 + 暂停边界」，旧仓 a8af45b 始终全绿可共存）+ 可暂停协议（波次 tag checkpoint + 恢复重跑 test gate + C 波 >20 天超阈值评估拆波/缩范围）。③ **C 波前 spike**（L5 新节）：开 C 波前挑 memory 域（反向依赖最少）做 1-2 天单域 spike 校准 225/88 估算 + EngineState 并发模型，把最大不确定性从估算变实测。④ **工作量粗估**（独立文档）：A 2-3 天 / B 5-8 天（并行 3-5）/ C 10-20 天 / E 3-5 / D 8-15 / F 3-5，总 30-60 连续天，含精力周期实际 2-4 月。
>
> **v0.11 变更摘要（2026-09-22，脆弱点逐项深化分析——不改架构裁定，用旧仓 a8af45b 代码级实测把 v0.10 三个脆弱点从"估算/推演"变"实测/已验证"，明细见 `docs/execution-strategy.md` §5）**：用户要求"做更多准备工作再开工，逐个脆弱点分析"。三脆弱点逐个闭环：① **R1 工程量盲区**（C 波 10-20 天凭空粗估）→ 实测 313 反向 import **可 grep 复现**（实测 307，~2%），按目录分解 **85% 集中 engine**（orchestrator 261 处）/ 15% 四域（46 处）→ C 波拆 C1-engine（212 主体）+ C1-四域（41 前移 B 波）+ C2-engine（49 结构性端口化），估算收窄 **10-20→8-12 天**，总 30-60→29-48 天。② **R2 双跑循环依赖 IFF**（14 种子测试"能否跑起来"未实证）→ 实测 **12/14 已脱耦**（gateway.test.ts fixture replay 零 IFF，12 测试跑通）+ 仅 2 个待改（agent-loop + gateway-json-schema）有 line-level 范本（mock.module + activeStreamChunks + loadFixture），录制计划并入 A 波。③ **R3 纸上推演未验证**三子项：#2（225/88 不可验证）已被 R1 闭环；**R3a EngineState β 并发**→ 实测 `updateFileHistoryState`（QueryEngine.ts:375-383）= 嵌套 functional-update + `setAppState` 串行（React 批处理），旧仓 `MAX_TOOL_USE_CONCURRENCY=10` 并发全绿 → set(f) 队列是 **setAppState 串行性的同构迁移非新发明**，风险降级中→低；**R3b feature() 575 处分类**→ 实测 feature()（622 处 FEATURE_* env）vs GrowthBook（150 处 atlas_* SDK）**两套独立机制**（flag 命名规范不同天然区分）→ 分类 = 622 纯机械换 import + 21 挂载调整 + 150 端口化，非"逐处判三类"。**风险登记册 7 项中 4 项降级**（高→中 1 / 中→低 2 / 中→已闭环 2），C 波从"高风险盲区"变"中风险已知量级"。
>
> **v0.11 spike 执行结果（2026-09-22，C 波前 4 步探针全绿，明细见 `docs/execution-strategy.md` §4）**：① **分类偏差校准**：grep 口径已定位（import utils/types/constants 调用点），**4/5 域精确吻合**（engine 212 ✓ / sandbox 13 ✓ / executor 3 ✓ / modelprovider 22 ✓），唯独 **memory 错**（charter 3 → 实测 21，-85%）；总量 307→325（+7%，仍 <15% 可信）；memory 21 个叶子全多域共享（≥3 域）归 shared C1 大吸收。② **端口化原型 15/15 绿**（Port 8+5 契约 + compose 注入链 + DIP 斩断 growthbook + loop 1 轮），单域 <1 天偏保守。③ **EngineState 并发原型 9/9 绿**（M3a.3：100 并发零丢失 + 反例验安全来源 + rewind 串行化）。④ **双跑 fixture replay 6/6 绿**（mock.module + 旧仓真实 fixture 跨仓可分享 + 零 IFF + 确定性等价 + 非 tautology）。**决策：开 C 波**——4 项全绿，唯一修正项 memory 3→21 不阻塞（18 叶子机械下沉 <1 天增量）。spike 之前所有估算都是推演，spike 之后才有实测——"该不该全量走"的最终判断点已通过。
> **v0.8 变更摘要（2026-09-21，B 层① 规则编号统一——单一权威清单）**：
> 1. **规则合并**：旧 L2「依赖规则」8 条 + 旧 L8「约束规则」7 条（两套编号 1-5 撞号，DoD「规则 1-8」/ A 波「规则 1-5」引用各指不同编号系）合并为 **L8 单一权威清单 14 条 / 5 类**（DEP 依赖方向 / STR 结构 / AUT 状态配置自治 / PRT 端口与副作用 / IDN 身份与产品），ID = 类目前缀 + 编号（自解释、免疫重排，新增规则不影响旧 ID）。去重 15→14（旧 L8 规则 1「单向依赖」并入 DEP-1…5 作细则展开，不再独立计数；旧 L2-6/7/8 升 STR-3/AUT-1/AUT-2 归 L8）。
> 2. **L2 降指针**：L2「依赖规则」段不再单列 8 条条文（单一事实源 = L8），保留目录图 + 指向 L8 的映射说明。
> 3. **每条规则三标注**：判定桶（① lint 桶 eslint-plugin-boundaries / ② grep·CI 脚本桶 / ③ review 桶）+ CI 门（A 波 lint / B6 起 grep 门 / D·F 波 review）+ 承重标记（**DEP-2/3、AUT-1/2、PRT-1 五条 = B14「可独立 package」验收承重墙**）。规则层稳定，eslint 具体选项 A 波定（lint 配置层可演进）。关键澄清：STR-2 目录深度标准 eslint `max-depth` 表达不了（它管代码嵌套），A 波用目录深度 CI 脚本补；三柱 grep 门（AUT-1/2）域文件 A 波尚不存在，**B6 起才 CI 化**。
> 4. **B 层② A 波 test gate + feature() 迁移边界裁定 (a)**：feature() **规则 A 波定、机械换随各文件落地波应用**（A 波建 `shared/feature.ts` + 定 `bun:bundle` 废弃（import 双形态：127 文件 `bun:bundle` 内建 + 45 文件 F5 shim 相对路径，换 import 须覆盖两者）；≈575 处 import（2026-09-22 复测，迁移时重新推导）随 B/C/E/D 波各文件落地时换，纯机械零逻辑变更——非 A 波一次性全仓，文件尚未迁进；flag 语义分类——域级→domain-mount / 特性灰度→feature.ts / 远程实验→Port 8——仍 C2 细节）。A 波 test gate = **测试框架 smoke 绿 + shared 纯函数测试**（**引擎 14 集黄金参照 A 波只生成 JSON 参照物、不 diff**，首次 diff 在 C 波 B9）。效果：feature-gated 分支（HISTORY_SNIP/CONTEXT_COLLAPSE 等）自 B6 起（域 unit 层）可测，双跑（engine 在场波次 C/E/D）渐进 diff 无不可测盲区（旧仓 `bun:bundle feature()` 测试恒 false 不可测坑根除），中间波次不留等价性缺口（否决方案 b"延 F 波换、B6 只验 feature-off"）。
> 5. **B 层③ E 波挂载时点 + B9 载体裁定**：(a) **E = 包到位 + 四元组直调独立验证，D = 接线 + 全栈复验**——E 波 gate（gelu L1 全 16 PASSED）经 `ascendPackage` 四元组（tools/skills/promptSection/executor）+ AscendExecutor fixture mock **直调路径**跑，不经 mount.ts、不依赖壳（即 B14 可插拔性的实证样例：域包不接线也能自证）；D 波 mount.ts 接线（DEP-5 白名单边）后**经 launcher 真实路径 gelu 复验**（直调 gate 不覆盖接线面）。(b) **B9 = 8 port 契约 + in-memory 最小实现（test-only）**——compose.ts 注入链落地 + 循环契约测试（注入链通 + session-context 快照 get/set 语义 + loop 走 1 轮最小循环）；**agent-loop/gateway-json-schema 真身维持 L5.2 裁定归 E 波 fixture 矩阵**（C 波 B9 不迁这 2 文件、不为 B9 提前造壳级实现，行为等价由 E strict diff 兜）。
> 6. **B 层④ B14 波归属裁定**：B14（「可独立 package」验收，承重 5 规则 DEP-2/3+AUT-1/2+PRT-1 全绿判定）**执行时点 = C2 末**（B9 之后——此时 8 port 落地 + engine 端口化完成，承重 5 条首次全可验；若挂 B 末 PRT-1 未落地只能部分验收、C2 还得重验）。F 波 B13 只做回归复认（低成本）。
> 7. **B 层⑤ coordinator/AgentTool/fan-out 架构落位**（详见 L4.8）：coordinator mode → `engine/coordinator/`（engine 编排层子模块，**非顶层域、非壳**）+ AgentTool → `engine/tools/AgentTool/`（C 波随迁）+ spawnDepth/allowFanOut → engine 状态/工具参数链（**不寄生壳 AppState**，AUT-1 约束）+ 3 门控测试文件随 engine co-located C 波迁（门控语义不变）+ `COORDINATOR_MODE` ON_BY_DEFAULT 语义原样继承（旧仓已翻转，新仓不回退）。
>
> **v0.7 变更摘要（2026-09-21，Tier 2 双跑等价 + 测试迁移 + 基线锚点 + 品牌串预分类 + 冻结层重判——架构层全部闭环）**：
> 1. **E 双跑等价机制定案**：三层——层1 白盒主（`callModel`+`OrchestrationEvent` 严格相等）+ 黑盒边界（`SDKMessage` type 序列 + system prompt 段序列 + 工具注册列表）；层2 Mechanism A（纯 LLM SSE chunk，跨仓可分享，旧仓 `gateway.test.ts` 范本）；层3 **prompt 容忍消解**（strict diff，仅确定性噪声过滤，行为变更走独立 pass 不折进重构窗口）。fixture 风险驱动非覆盖率驱动：12-15 白盒（锚定迁移风险分支 compact/stopHook/token/abort/工具调度）+ 3-5 黑盒。旧仓 14 个 engine 测试即种子。双跑渐进 diff（仅 engine 在场波次 C/E/D；B 波无 engine 跑四域 unit 绿，v0.9 时序修正；非仅 B13）。
> 2. **F 测试迁移策略定案**：四层——unit co-located 随模块走；integration A/B（7）模板化迁（C 波后 L4 接验证）+ C/D（2）并入 E fixture 矩阵 + web-bridge（1）defer D 波；regression 行为型（12）迁为 E 种子 + 不变量型（3）转 eslint-plugin-boundaries；preload 弃（feature() 改 `shared/feature.ts` 普通模块，内建模块可测性坑根除）；e2e fixture-driven headless 改造。ascend 资产 vs L4 测试分波（E 波迁结构 / C 波后接验证）。
> 3. **Tier 2 闭环**：D（被 v0.6 自治模型吸收）+ E + F 全部裁定。架构层 + 迁移机制层无 open question，仅剩两项实施期待办（`CANN_PKG_VER` 归一 / `auto_optimizer` 文档同步）。
> 4. **Tier 3 第3项 留档三件套 + 基线锚点确认**：锚点 = 旧仓 HEAD `a8af45b`（2026-09-21 20:26，全量 99 文件 / 1109 pass / 0 fail / 0 skip，unit 82/1024 + integration 10/63 + regression 2/15）；三件套 = tag `atlascode-baseline-2026-09-21` + test-report.json + 黄金参照（14 engine 测试旧仓产出，A 波初始集 E 波补全）。
> 5. **Tier 3 第4项 品牌串预分类**：全量 379 处/123 文件（分类规则快照，F 波前全仓 grep 重跑为权威清单；修正原 145/62 仅 src scope），五类 + 五特判裁定，全量表落盘 `docs/brand-string-classification.md`。新仓 repo `github.com/vincentlau2046-sudo/AtlasCode`；vault 新开 `16-AtlasCode`（提取 latest 非拷贝）；ATLASHARNESS.md 迁移逻辑消解（A 波前用户清理 ~/.atlas/）。
> 6. **冻结层清单落盘（L8.1）**：旧仓四项冻结在新仓重判——WIRE 协议常量 + claude.ai URL 延续冻结（缩面：bridge 群 7 保留 carry [ATLAS-HOLD]，非 bridge 群 15 随 F 波死代码消解，待逐模块判）；MDM registry key **解冻改 `Policies\AtlasCode`**（D 波，新仓无已部署 profile 依赖）；物理路径已解冻（→ atlascode）。[ATLAS-HOLD] 18 处/14 文件延续 HOLD 姿态（L8.1 2026-09-21 实测，原记 ~10 处遗漏近半；IFF 网关域名是国内基础设施决策，超出架构层，不阻塞核心功能）。新仓零真冻结品牌串。

> **v0.6 变更摘要（2026-09-21，四域自治模型——从"ascend 域包可插拔"推到"四域地基自身可插拔"）**：
> 1. **自治三柱定义**：每域必须做到 ①**依赖洁净**（向下只依赖 shared，不向上 import utils/services/entrypoints）②**状态自治**（自己管自己的状态，不寄生壳 AppState/全局 let）③**配置自治**（每域一个 `config.ts` 收拢 env+settings，不散在全局）。验证：lint boundaries 禁向上 + 域内状态不跨边界 + 配置入口单一。
> 2. **诊断：四域全不自治**（grep 实证）。四域向上 import 共 30 个外部依赖目标：纯类型/常量 13 个（应下沉 shared）、带行为 utils 12 个（域自管 or shared 工具模块）（2026-09-22 勘误：v0.6 摘要 12/13 互换，L4.7 明细清单 13/12 为权威）、跨域污染 5 个（必须斩断——memory 直连 growthbook 碰网络违反 PRT-1、modelprovider 直连 entrypoints/settings-adapter、memory 依赖 memdir 实现细节暴露）。
> 3. **engine 状态模型裁定（D 议题升级，→(β) 不可变 store）**：fileHistory/attribution 从 AppState 挪入 engine 自管，与 mutableMessages/permissionDenials/readFileState/totalUsage 同级收进 **EngineState**（独立模块 + 不可变更新 `set(f)` 纯函数，与 AppState store 同构）。理由：会话执行态归 engine 内聚；fileHistory 的 undo 是 engine 行为不该依赖壳 store；寄生关系斩断后 engine 真正可拔。**SessionSnapshot 因此只剩 5 个壳→engine 配置投影字段**（toolPermissionContext/mcp/effortValue/advisorModel/tasks），view 语义天然够——高频写状态全在 EngineState 不经 port。
> 4. **modelprovider 自治**：types/atlas/message/effort/thinking/systemPromptType 下沉 shared；endpoint/role 配置从寄生 settings + roles.ts 全局 → `modelprovider/config.ts` 自管（ModelProviderConfig）；errorMessaging port 已定（Port 2）；替换开源模块时接口对接 + config.ts 改数据源，状态/配置/类型全在域内不动。
> 5. **sandbox 自治**：settings 5 处耦合 → settings 类型下沉 shared + 实现走 SandboxDependencies 注入（已有模式，仅 compat.ts 残留直连待清）；ripgrep/permissions 收进域内；状态自管（规则缓存不寄生）。
> 6. **memory 自治**：growthbook 直连 → Port 8（FeatureConfigPort）注入，memory 是消费方之一；memdir/paths/teamMemPaths 收进 memory 域内（实现细节不外暴露）；fs/readFileInRange 走 shared 工具模块。
> 7. **executor 自治**：Shell/ShellCommand/shellProvider 收进 executor 域内（shell 执行是 executor 核心行为非通用工具）；AscendMockPort/FreshnessPort 已是 port 模式范本。
> 8. **shared 边界裁定**：shared 保持**纯叶子**（类型 + 纯函数 + identity 常量 + feature()），**不含行为模块**。fs/path/debug/errors/format 等带行为 utils → 拆：纯函数部分下沉 shared，带副作用部分（如 fsOperations 的真实磁盘 I/O）归消费域 or 走 port。settings 类型下沉 shared，settings 实现走 port。shared 不成新耦合点。
> 9. **与 v0.5 决策的关系**：D（SessionSnapshot 语义）被本议题吸收——engine 状态模型定了，SessionSnapshot 自然只剩配置投影 5 字段 + view 语义。E（双跑 diff）/F（测试迁移）在 v0.7 裁定（见 v0.7 摘要 + L5.1/L5.2）。
> 10. **"可独立 package"真正成立**：四域全自治后，modelprovider 换开源模块 = 接口对接 + config.ts 改数据源，其余不动。地基可插拔，不只是域包可插拔。

> **v0.5 变更摘要（2026-09-21，四项深度推导裁定 + 执行器业界调研依据落盘）**：
> 1. **modelprovider DAG 位置裁定（问题1→c）**：engine 依赖四域（modelprovider/sandbox/memory/executor）是**向下依赖合法**——engine 是应用层，四域是库级地基，engine→四域天经地义。物理平铺（8 顶层目录 = 6 兄弟 + shared 纯叶子 + atlascode 壳）+ 逻辑分层（engine 在四域之上）。DEP-1 措辞修正：显式承认 engine→四域向下合法，仅四域→engine/ascend/atlascode 向上非法。
> 2. **PRT-2 零模块级副作用 · lazy-init 豁免裁定（问题2→a）**：`let _x ??= create()` 懒单例**允许**（首次访问才造、无模块加载副作用、可测）；模块加载时自注册语句（顶层 `registerXxx()` 调用）**禁止**。modelprovider 的 `lazyProxy(getModelProvider)` / `getCoreDependencies` 懒单例模式合规。
> 3. **ascend 5 skill 注册机制裁定（问题3→a）**：ascend 5 运行时 skill 经 `DomainPackage.skills`（domain-mount 挂载面）注册，**不走 `registerBundledSkill()`**。`registerBundledSkill()` 仅给**基础 skill**（非域包的通用 skill）。5 skill 是**平行业务面 skill**（算子开发/验证/调试/性能/部署，跨 4 业务面），共享 16 工具 + AscendExecutor 底座，无"ascend 总入口" foundation skill。v0.4 L4.5"5 skill 仍调 registerBundledSkill"措辞**勘误**。
> 4. **执行器/注册机制裁定（问题4，业界调研支撑）**：AscendExecutor 直走 execa **不经 sandbox**（两职责异质：sandbox 管通用命令权限门控，AscendExecutor 管 CANN env 编排）。`Executor` + `NpuToolchain` 接口是**内部标准**（行业标准不存在——调研证实 SYCL/Level Zero/PJRT/MLIR/Triton 均非工具 CLI 契约，MCP 是唯一 agent-工具协议但无厂商 wrap 硬件 CLI）。注册机制 v1 = **编译时 DomainPackage 注册**（单一挂载单元收敛四插桩点）；plugin 动态注册 + MCP 外挂列为**演进端口**（Executor 是执行策略层能 spawn 任意进程，比 skill 危险等级高，第三方动态注册需签名/白名单门控，留到真有第三方厂商贡献时）。Shape A/B 二分有全行业实证（NVIDIA/Cambricon/Intel/AMD 全如此）。
> 5. **两个勘误级待办**：① `CANN_PKG_VER` 非 CANN 官方变量（调研零命中），是 AtlasHarness 内部配置变量喂 `AscendConfig.cannVersion`，违反 `ATLAS_*` 单前缀规范，归一改名；② `auto_optimizer` 已从 tools 仓迁移到 gitee msadvisor，CLAUDE.md 描述需同步。
> 6. **调研依据落盘**：两份调研报告（CANN 工具链安装/调用形态 + NPU 厂商工具链集成模式）支撑执行器决策，源码级 + 四厂商交叉验真，见附录 §调研依据。

> **v0.4 变更摘要（2026-09-21，b–h 六项 open question 全部裁定 + analytics 分类修正 + port 7→8）**：
> 1. **b identity 注入裁定**：身份串是**静态常量非行为依赖**，DIP 不适用——**不引入 IdentityPort**。改用构建期 `--define` + `shared/identity.ts` 兜底。MACRO 本意是 build-time macro，旧仓退化成运行时 `globalThis` 赋值（`main.tsx:11`）是 bug，`PACKAGE_URL`/`FEEDBACK_CHANNEL` 运行时 undefined 是症状。产品差异靠构建配方（IDN-2），不靠运行期 port。
> 2. **d 测试框架搬迁裁定**：feature() 机制**保留**但实现**根除**。**域级 flag**（`ASCEND_TOOLS` 门控整域）→ port 化（domain-mount 替代）；**特性灰度 flag**（`HISTORY_SNIP`/`CONTEXT_COLLAPSE`）→ 保留。实现：从 `bun:bundle` 内建模块改为 `shared/feature.ts` 普通模块（根除可测性坑——内建模块 mock.module 无法真正覆写是旧仓坑根因）。`preload-bunbundle.ts` → **不需要**。F5 双轨桩合并进 `shared/feature.ts`。调用点分类是 C 波细节（v0.8 修正：import 换提前 A 波，见 v0.8 摘要第 4 条；语义分类仍 C2；2026-09-22 复测：v0.8 记 586 复现不了，代码行口径 ≈575 / 原始 598 / 含双引号 622，迁移时重新推导）。
> 3. **e 旧仓处置裁定**：迁移期旧仓冻结新功能（只 critical fix）作双跑参照源，用户日常不停；B13 绿后不立即归档；新仓日常稳定 4–8 周后旧仓 GitHub archive（只读保留不删——历史价值 + 双跑基线可复现性）。
> 4. **f lint 配置裁定**：工具 **eslint-plugin-boundaries**（+ @typescript-eslint）。element types = 8 类。rules 映射 DEP-1/STR-1：`element-types` 禁向上依赖 + `no-private` 门面收口；`atlascode→ascend` 白名单用 `allowed-types` pattern。STR-2/PRT-2 用目录深度脚本/`no-restricted-syntax` 补。CI A 波即上，**全 error 无存量豁免**。旧仓零 lint 配置，边界强制是新仓从零建的能力。
> 5. **g modelprovider 独立裁定**：四域平铺不独立包；singleton 保留（单消费者场景 DI 是预付复杂度）；统一 LLM API out-of-scope。未来触发器：第三方要接非 OpenAI 协议 provider 时再做。
> 6. **h analytics 裁定（修正 v0.3 L4.6 误分类）**：analytics 是**远程实验配置服务 + 工具名清洗**两套异质东西，**分类拆分**：`growthbook.ts`（远程 A/B，碰网络+磁盘缓存，12 处调用）→ **port 化**（`FeatureConfigPort`，Port 8）；`metadata.ts` 的 `sanitizeToolNameForAnalytics`（纯函数）→ 下沉 shared；`config.ts`（遥测已删）→ 核查死代码。
> 7. **port 数量 7→8**：新增 `FeatureConfigPort`。8 port = session-context / error-messaging / domain-mount / mcp-client / session-memory / lsp-status / prompt-suggestion / feature-config。
> 8. **PRT-1 连带收益细化**：扩展点机制替代**域级** feature() flag（domain-mount 承担域边界），特性灰度 flag 保留但改 `shared/feature.ts` 普通模块——解掉旧仓 `bun:bundle feature()` 测试恒 false 不可测的坑。
> 9. **IDN-1 identity 机制明确化**：`shared/identity.ts` 普通模块 export 身份常量，构建期 `--define` 注入实例值（atlascode 配方 vs atlasoffice 配方不同值），运行期所有模块 `import { VERSION } from 'shared/identity'`。配置目录名保持 env 覆盖不动。

> **v0.3 变更摘要（2026-09-21，从第一性原理重新逐层推导 + engine 独立 + 四域平铺 + ascend 域包定稿）**：
> 1. **engine 从 core 独立成根级模块**（`src/engine/`，平级于 sandbox/memory/executor/modelprovider）。依据：core→services 反向依赖 100% 集中在 orchestrator（12 文件），四域+factory 仅 memory→growthbook 一处反向（L4.7 已诊断→C 波 Port 8 斩断），其余零反向；engine 是宽扇出应用层，不该塞进库级 core。core 变纯地基，B6（独立编译）天然成立。
> 2. **取消 `core/` 容器层，四域平铺**（sandbox/memory/executor/modelprovider 直接挂 src/）。依据：四域是兄弟关系非父子（仅 executor→sandbox 一条 type 边，无环）；core 目录曾混 engine，名不副实；平铺反映真实依赖关系。
> 3. **组合根移壳侧**（`atlascode/compose.ts`）。依据：Composition Root 模式——"决定用哪些实现"必须在应用入口（最外层）；四域各自 `create()` 留域内，壳 wiring 实例 + 注入 port 实现。
> 4. **port 接口归消费方模块**（engine/ports/、modelprovider/ports/），非 shared grab-bag。依据：依赖倒置原则（DIP）——抽象归消费方拥有，实现归提供方；port 脱离消费方=低内聚。shared 回归纯叶子（类型+纯函数）。
> 5. **Executor 接口/实现分离**：`Executor` 接口留 `executor/`（通用契约），`AscendExecutor` 实现归 `ascend/executor/`（域包内）。依据：接口是通用契约非 ascend 私有；ascend 依赖接口（合法），executor/ 永不依赖 ascend（地基零反向）。
> 6. **ascend 域包定稿（方案 B）**：16 工具 + AscendExecutor + 5 运行时 skill + prompt 作为二进制内 `ascend/` 域包，经 `atlascode/mount.ts` 调 `registerDomainMount(ascendPackage)` 整体挂载；6 知识技能 + 18 策展 wrapper 留 `atlas-plugins` 市场仓。依据：开关粒度=产品级（编译期 mount）+ 市场级（知识装/卸）两层；强耦合单元（skill 调工具、工具调 executor）同进退；纯知识（SKILL.md 文本）进市场。用户面零变化（注册 API 不变、市场源不变）。
> 7. **port 数量 3→7**：session-context / error-messaging / domain-mount / mcp-client / session-memory / lsp-status / prompt-suggestion。多出的 4 个是 services 分流的直接产物（凡 engine 要用、实现碰壳的服务走 port）。
> 8. **services 全梳理**（21 子目录逐个定归属）：analytics/api(7)/mcp 运行时/SessionMemory/autoDream/contextCollapse/extractMemories → engine 内；tokenEstimation/mcp types+utils → shared；api/aiLimits+auth → modelprovider；lsp/PromptSuggestion/policyLimits/skillSearch/plugins/oauth/MagicDocs/AgentSummary/settingsSync/remoteManagedSettings/宿主能力散文件 → 壳。
> 9. **PI 式 external plugin 列为未来触发器**（非现在做）：方向正确但时机未到——port 契约未稳定（C 波未落地）、单一消费者（只做 atlascode）。触发器：第三方生态 / 独立发版 / port 契约稳定半年。
> 10. **事实同步**：Pre-Step 0 已满足（2026-09-21 旧仓全绿，锚点 SHA `a8af45b`：unit 82 文件 / 1024 pass + integration 10 / 63 + regression 2 / 15，全量 99 文件 / 1109 pass / 0 fail / 0 skip，tsc 0）；E 波 ascend skill 数 11→5（6 知识已移市场仓 `a256f33`）；双跑参照物具体化为 `a8af45b` 全绿基线。
> 11. **命名修正**：所有"atlascore"措辞改为"四域平铺"（无 atlascore 包，core 容器层已取消）。

---

## L0 · 产品本质与硬约束

AtlasCode 是从 AtlasHarness 演进、**不带历史包袱**的 coding agent。产品定位不变（通用 coding + Ascend 可插拔域），代码起点 = 新仓库 + 清理后代码 + 全新约定。资产保留（agent loop / 权限 / 沙箱 / NPU 域 / 测试），包袱清零（500+ 提交历史 / strangler shim / 75 继承 feature flag / CLAUDE_* 残留 / ~1.3 万行已判可删死代码）。

精力有限原则：**大概率只做 atlascode 一个产品**。atlasoffice 是远期可能，不为此预付命名/结构复杂度。若未来真做，同仓加 `src/atlasoffice/` 目录即可，不阻碍。

AtlasHarness 本质**首先是 coding agent**，通用能力是基座恒定项，Ascend 是可插拔叠加层（FDE 画像随客户业务漂移，一个产品形态覆盖不了一切，但产品逻辑同一套）。

## L1 · 仓库拓扑

**一个 git 仓库，一个 package.json，不用 workspaces，不做 per-module package.json，不独立发版。** 目录即边界，边界靠 lint 强制（见 L3）。

`~/projects/AtlasCode/`，全新 `git init`。

理由：三个产品逻辑一致 → 引擎共享；个人开发者无团队扩张/独立发版需求；workspaces 多包对单一产品是预付复杂度（internal 包标 private 永不发布 → "包"退化为"目录 + import 边界"，package.json 版本/exports 买不到收益）；worktree 场景有符号链接坑（旧仓已踩）。

未来触发器出现时（某模块要独立发版/外部消费），给该目录加 package.json 升级为包——机械操作，不在现在预付。

## L2 · 模块边界与依赖 DAG

### 顶层模块（扁平，8 目录 = 6 兄弟 + shared 纯叶子 + atlascode 壳）

engine 从 core 独立 + 四域平铺 + core 容器层取消：

```
                 shared
                 (纯叶子: 类型 + 纯函数 + identity 常量 + feature(), 不含行为/port)
                    ↑
        ┌───────────┼───────────┬──────────┐
        │           │           │          │
     sandbox    memory     executor   modelprovider
     (自治三柱)  (自治三柱)  (自治三柱)   (自治三柱, 含 error-messaging port)
        ↑           │           │
        └───────────┘
           (executor→sandbox type)
                    ↑
        ┌───────────┼───────────┬──────────┐
        │           │           │          │
        └───────────┴──── engine ──────────┘
                 (agent loop, 依赖四域向下合法)
                 (含 8 ports, 经 index re-export)
                    ↑                 ↑
                    │                 │ (mount 边, 仅 atlascode/mount.ts)
                 atlascode ───────────┘  ← ascend (域包) 经 mount 挂入
        (壳: 入口/UI/AppState/组合根/ports 实现/市场接线)
```
> v0.5 问题1c：engine 依赖四域（modelprovider/sandbox/memory/executor）向下合法——engine 是应用层，四域是库级地基。图中 engine 横跨四域上方表示此向下依赖。四域永不反向 import engine。

### 依赖规则（单向无环，只许向下）

> **v0.8：规则统一入 L8 单一权威清单**（15 条 / 5 类 DEP/STR/AUT/PRT/IDN，每条带「判定桶 + CI 门 + 承重标记」三标注，见 L8）。映射：依赖方向细则 = **DEP-1…5**（旧 1-5 条），状态/配置自治 = **AUT-1/AUT-2**（旧 7/8 条），组合根 = **STR-3**（旧 6 条）。此处不再单列条文（旧 L8 规则 1 已吸收依赖 1/2/4/5，L4.7 三柱实证化现挂 L8 DEP-3/AUT-1/AUT-2/PRT-1）——**单一事实源 = L8，避免两套编号撞号**。

### 为什么 engine 独立 + 四域平铺

- core→services 反向依赖 **100% 集中在 `core/orchestrator/`**（12 文件），四域+factory 仅 memory→growthbook 一处反向（L4.7 已诊断→C 波 Port 8 斩断），其余零反向。engine 和四域是两类东西（应用层 vs 库级），硬塞一起就是 v0.2 的"混装"。
- 四域是兄弟关系非父子（仅 executor→sandbox 一条 type 边，清掉 sandbox→factory 反向边后无环）。`core/` 容器层只担"混装"历史语义，取消后依赖关系显式反映。
- core 容器层担的两个职责（factory 组合根 + ports 接口定义）随容器取消分别归宿：组合根→壳侧（Composition Root 模式），port 接口→消费方模块（DIP）。

## L3 · 各模块职责与公共门面

```
atlascode/
  package.json            # name: atlascode, private, bin: atlascode
  tsconfig.json  bunfig.toml  eslint.config.mjs   # boundary lint (f 裁定)
  src/
    shared/               # 叶子: 类型 + 纯函数 + 常量 + identity + feature (不含 port)
      index.ts            # 唯一公共面
      types.ts            # Message / Tool / Tools / SystemPrompt / ThinkingConfig
      types-session.ts    # ToolPermissionContext / MCPServerConnection / TaskState (C1 下沉)
      identity.ts         # VERSION/PRODUCT_NAME/PRODUCT_BRAND/PACKAGE_URL/FEEDBACK_CHANNEL (b: 构建期 --define)
      feature.ts          # feature(name) 特性灰度 (d: 普通模块非 bun:bundle; 域级 flag 不在此)
      sanitizeToolName.ts # 纯函数 (h: 从 analytics/metadata.ts 下沉)
      tokenEstimation.ts  # 纯函数 (services 分流)
      ...
    sandbox/              # 能力域, 扁平 ≤2 层, 自治三柱
      types.ts  createSandboxManager.ts  index.ts
      ripgrep.ts          # 搜索后端 (从 utils 收进, sandbox 专属)
      config.ts           # 自治三柱③: sandbox 配置收拢 (env+settings)
    memory/               # 自治三柱
      types.ts  FileSystemMemoryStore.ts  RootedMemoryStore.ts  index.ts
      paths.ts            # memdir 路径 (从 memdir/ 收进, 实现细节不外暴露)
      config.ts           # 自治三柱③: memory 配置 (growthbook 改走 Port 8 注入)
    executor/             # 通用执行器域 (地基), 自治三柱
      types.ts            # Executor 接口 + ExecResult/ExecOptions/ExecError
      toolchain.ts        # NpuToolchain 接口 + applyToolchainPlaceholders (多厂商扩展点)
      ShellExecutor.ts    # 通用沙箱执行器 (实现 Executor, 用户命令走 sandbox)
      shell/              # shell 执行 (从 utils 收进, executor 核心行为)
        Shell.ts  ShellCommand.ts  shellProvider.ts
      config.ts           # 自治三柱③: executor 配置
      index.ts
    modelprovider/        # 自治三柱, 含 error-messaging port
      ports/errorMessaging.ts   # port 接口 (归消费方)
      constants.ts        # apiLimits/betas (从 constants/ 收进, modelprovider 专属)
      config.ts           # 自治三柱③: endpoint/role 配置 (从 settings+roles 全局收拢, ModelProviderConfig)
      index.ts
    engine/               # agent loop (原 orchestrator, 独立成根级模块)
      index.ts            # 唯一公共面: export query / QueryEngine / ask + ports re-export
      ports/              # 8 port 接口定义 (归消费方, 经 index re-export)
        sessionContext.ts  mcpClient.ts  sessionMemory.ts
        lspStatus.ts  promptSuggestion.ts  domainMount.ts
        featureConfig.ts  # h 裁定: 远程实验配置 (growthbook port 化)
      state/              # v0.6 EngineState (会话执行态自管, 从 AppState 挪入)
        EngineState.ts    # 不可变 store (set(f) 纯函数, 同 AppState 同构)
        fileHistory/      # types+逻辑+状态+配置 (从 utils+AppState 三处收拢)
          {types,fileHistory,config,index}.ts
        attribution/      # 同上 (从 commitAttribution+AppState+constants 收拢)
          {types,attribution,config,index}.ts
      pipeline/           # 原 orchestrator/tools/ (执行管线 7 文件) → 改名避撞
      query/  context/    # loop.ts / compact / stopHooks / toolExecution 等
      tools/              # 基础工具 Read/Edit/Bash/Glob/Grep + AgentTool（spawn 子代理，C 波随迁）+ 注册表 getAllBaseTools
      coordinator/        # v0.8 B 层⑤：多智能体编排层（coordinatorMode spawn/fan-out + spawnDepth 追踪，engine loop 编排语义；非顶层域、非壳，见 L4.8）
      # engine 内随迁的 services: api(7)/ mcp运行时/ SessionMemory/
      #   autoDream/ contextCollapse/ extractMemories/
      #   (analytics/growthbook 不进 engine —— 走 featureConfig port; sanitize 下沉 shared)
    ascend/               # 可插拔域包 (二进制内, 方案 B)
      index.ts            # 唯一公共面: export ascendPackage: DomainPackage
      tools/              # 16 工具 + KernelBackend 三后端 + constants/foldUtils
      skills/             # 5 运行时 skill (generate/validate/debug/optimize/modelAdapt)
      executor/           # ascend 专属执行器 (从 core/executor 平移出)
        AscendExecutor.ts  ascendMockFixtures.ts  AscendMockPort.ts  toolchain.ts  types.ts
      prompt.ts           # ASCEND_TOOL_USAGE_GUIDE (systemPromptSection 内容)
    atlascode/            # = atlascode 产品壳
      cli.ts  launcher.ts  identity.ts  mount.ts  compose.ts
      ui/                 # TUI (main.tsx/screens/components/ink)
      state/              # AppState 实现 (实现 engine/ports 的接口)
      marketplace/        # ascend 市场预装 + 验真链 (原 plugins/ascend/marketplace/)
        ascendMarketplace.ts  ascendMarketplaceStartupCheck.ts
        licenseInference.ts  officialVerify.ts
      featureConfig/      # h 裁定: FeatureConfigPort 实现 (远程实验配置加载+缓存)
      evals/              # L4 evals (原 plugins/ascend/evals/)
      index.ts
    # atlasoffice/        # (远期)同仓另一个壳, 复用四域+engine, 不引 ascend
  tests/  docs/  scripts/
```

### 门面规则（STR-1）

- 每个 `index.ts` 是该模块**唯一公共出口**。
- 域外代码 import 域内内部文件 = lint 红（`no-internal-import` / `boundaries/no-private`）。
- engine 外部只许 `import { ... } from '../engine'`，不许 reach `engine/ports/sessionContext.ts`（经门面 re-export 拿 port 类型）。
- 四域同理：外部只许从域门面进。

### 扁平优先（STR-2）

每个域内部最多两级目录。超过两层 = 职责该拆成兄弟，不是往下钻。

## L4 · 扩展点机制（ports 定稿，8 个）

整个方案能否成立的命脉（PRT-1）。port 拥有接口定义（归消费方模块），壳和 ascend 提供**实现**，在启动时注入。注入走 compose.ts 参数（PRT-2：零模块级副作用，不用全局 register 函数留 `let`）。

### Port 1 · session-context（命脉，解决 AppState 焊点）

engine 对 AppState 的真实消费面（grep 实证）= **5 个顶层字段**：`toolPermissionContext` / `mcp.{tools,clients}` / `effortValue` / `advisorModel` / `tasks`。engine 从不碰 AppState 的 UI/主题/输入态。

```ts
// engine/ports/sessionContext.ts
export interface SessionSnapshot {
  toolPermissionContext: ToolPermissionContext      // 子类型 C1 下沉 shared
  mcp: { tools: Tool[]; clients: MCPServerConnection[] }
  effortValue: EffortValue
  advisorModel: string | undefined
  tasks: Record<string, TaskState>
}
export interface SessionContextPort {
  get(): SessionSnapshot
  set(f: (prev: SessionSnapshot) => SessionSnapshot): void
}
```

`QueryEngineConfig` 的 `getAppState/setAppState` 硬字段（`QueryEngine.ts:135-136`）换成 `sessionContext: SessionContextPort`。壳侧 ~10 行适配器：完整 AppState → SessionSnapshot 映射，`set` 按字段写回。**快照字段是对象引用 = view 语义**（实现时唯一要小心的细节）。

engine 内真实消费面（grep 勘误，见 L4.7 + 附录 C）：`getAppState/setAppState` 硬字段集中在 `QueryEngine.ts`（1 读 + 4 set），set 字段 fileHistory/attribution **不经 port，进 EngineState**（L4.7 β 不可变 store）；SessionSnapshot 的 5 个配置投影字段（toolPermissionContext/mcp/effortValue/advisorModel/tasks）经 ToolUseContext 传给工具，读多写少，view 语义够。原 v0.5 记"loop/stopHooks/toolHooks/compact/toolExecution 10+ 消费点机械换"——**经 grep 核实这五文件零直接命中 getAppState**，迁移面比 v0.5 说的窄。

### Port 2 · error-messaging（解决自注册坑）

```ts
// modelprovider/ports/errorMessaging.ts
export interface ErrorMessagingPorts {
  /* 原 utils/apiErrors.ts:116 注册的形状, 接口化 */
}
```

注入走 compose.ts 参数：`createCoreDependencies({ ..., errorMessaging: impl })`。删 `utils/apiErrors.ts:116` 顶层自注册语句。core 内 `errorMessaging.ts:94` 守卫保留（防御性），正常路径 ports 由 compose 注入，不经模块级 `let`。

### Port 3 · domain-mount（ascend 四元挂载，方案 B 核心）

```ts
// engine/ports/domainMount.ts
export interface DomainPackage {
  id: 'ascend'                                      // 未来可扩展其它域
  tools?: Tool[]           // 16 工具
  skills?: Command[]       // 5 运行时 skill（域包自带，非 registerBundledSkill）
  systemPromptSection?: () => string | null         // prompt.ts 内容
  executor?: NpuToolchain   // AscendExecutor —— 关键: 进挂载面（NpuToolchain 非 bare Executor）
}
export function registerDomainMount(pkg: DomainPackage): void   // 仅 atlascode/mount.ts 调
```

**四元挂载收敛分散插桩点**：旧仓 ascend 的四个插桩点分散在 `tools.ts:122`（Tool面 feature flag）/ `bundledSkills.ts`（Skill面 registerBundledSkill）/ `plugins/ascend/prompt.ts`（Prompt面）/ `AscendExecutor`（Toolchain面 factory new）四处，无统一挂载点。新仓 `DomainPackage` 把四元收敛成**一个挂载单元**，`mount.ts` 一行 `registerDomainMount(ascendPackage)` 整体挂载/卸载。

**executor 进挂载面是关键决策**：旧仓 `factory.ts:121` 无条件 `new AscendExecutor()` → 新仓 compose.ts 不再认识 Ascend，executor 由 ascend 包提供、经 mount 注入。"不挂 ascend = AtlasOffice"才真正成立（executor 也不存在）。

**skill 注册机制裁定（v0.5 问题3a）**：ascend 5 运行时 skill 经 `DomainPackage.skills`（domain-mount 挂载面）注册，**不走 `registerBundledSkill()`**。`registerBundledSkill()` 仅给**基础 skill**（非域包的通用 skill，如 compact/init 等）。5 skill 是**平行业务面 skill**（ascend-generate/validate/debug/optimize/modelAdapt，跨算子开发/验证/调试/性能/部署 4 业务面），共享 16 工具 + AscendExecutor 底座，**无"ascend 总入口" foundation skill**——每个 skill 是一个独立业务面入口，不是层层调用的树。v0.4 L4.5"5 skill 仍调 registerBundledSkill"措辞**勘误**。

**注册机制形态裁定（v0.5 问题4）**：
- **v1 = 编译时 DomainPackage 注册**：当前只有 ascend 一个域包，`mount.ts` 写死 `registerDomainMount(ascendPackage)`，源码受控。加新厂商（如 Cambricon）= 写 `CambriconDomainPackage` + mount.ts 加一行注册。不引入动态注册的安全门控复杂度。
- **演进端口 1 = plugin 动态注册**：DomainPackage 作为 plugin 一部分，市场安装即注册。**但 Executor 是执行策略层能 spawn 任意进程 + 读 env，比 skill 危险等级高**——第三方动态注册需签名/白名单门控，留到真有第三方厂商贡献时再上。触发器同 L4.5 PI external plugin（port 契约稳定 + 第三方生态出现）。
- **演进端口 2 = MCP 外挂**：工具经 MCP server 暴露，进程外隔离自带，但失去 typed 证据/fixture 双轨能力。调研证实 MCP 是唯一 agent-工具标准协议，但当前无厂商把硬件 CLI（nvcc/bisheng/atc）wrap 成 MCP server（NVIDIA CUDA MCP 仅文档 RAG）。未来若厂商出硬件工具 MCP server 可对接。
- **与 skill/tool 注册的关系**：skill/tool 走 plugin 动态注册（已落地，相对安全）；Executor/DomainPackage 走编译时注册（v1）。两者风险等级不同，分开处理——skill 装即用相对安全；Executor 能 spawn 任意进程，不能装即用。

**domain-mount 替代域级 feature() flag**（d 裁定）：旧仓 `feature('ASCEND_TOOLS')`（`tools.ts:122`）门控 16 工具 → 新仓域边界由 domain-mount 承担，feature() 不再管域边界。feature() 调用点（≈575 代码行口径，2026-09-22 实测；v0.8 记 586 复现不了，迁移时重新推导）里域级的归 port，特性灰度的留 `shared/feature.ts`。

### Port 4 · mcp-client + Port 5 · session-memory + Port 6 · lsp-status + Port 7 · prompt-suggestion

services 分流的直接产物。凡 engine 要用、实现碰壳的服务走 port：

| Port | 接口归 | 实现归 | 解决 |
|---|---|---|---|
| mcp-client | engine/ports | atlascode | engine 经 port 用 mcp，传输/进程在壳 |
| session-memory | engine/ports | atlascode | 会话记忆存储在壳（对齐 MemoryStore 模式） |
| lsp-status | engine/ports | atlascode | engine 只读 `getInitializationStatus()`，进程管理在壳 |
| prompt-suggestion | engine/ports | atlascode | stopHook 的提示建议，碰 AppState 部分进壳 |

### Port 8 · feature-config（h 裁定，远程实验配置 port 化）

旧仓 `services/analytics/growthbook.ts` 的 `getFeatureValue_CACHED_MAY_BE_STALE` / `getDynamicConfig_BLOCKS_ON_INIT` 被 orchestrator 12 处调用（口径：排除 import/export/注释的纯调用点，2026-09-21 grep；原记 22 点已过期），碰网络 + 磁盘缓存。engine 不该直接碰网络 → port 化。

```ts
// engine/ports/featureConfig.ts
export interface FeatureConfigPort {
  getFeatureValue<T>(key: string, defaultValue: T): T              // 原 getFeatureValue_CACHED_MAY_BE_STALE
  getDynamicConfig<T>(key: string): T                              // 原 getDynamicConfig_BLOCKS_ON_INIT
}
```

实现归 `atlascode/featureConfig/`：壳启动时加载远程实验配置 + 缓存（CACHED_MAY_BE_STALE / BLOCKS_ON_INIT 语义在实现侧）。engine 22 个消费点机械换接口引用。

**注意区分三层 feature 机制**（d + h 裁定）：
- **域级 flag**（`ASCEND_TOOLS` 门控整域）→ domain-mount port（Port 3）
- **远程实验配置**（growthbook A/B，碰网络）→ feature-config port（Port 8，本 port）
- **本地特性灰度**（`HISTORY_SNIP`/`CONTEXT_COLLAPSE`，env 驱动纯本地）→ `shared/feature.ts` 普通模块（非 port，不碰网络）

三层各司其职，不再混在 `bun:bundle feature()` 一个机制里。

## L4.5 · ascend 域包定义（方案 B 定稿）

### 三层分离

ascend 不是单一东西，是三类异质内容的集合，平铺时分开：

| 层 | 内容 | 性质 | 归宿 |
|---|---|---|---|
| **A 工具层** | 16 工具 + KernelBackend/TileLangBackend/TritonBackend + constants/foldUtils | 引擎工具的 ascend 实现，经 Executor 跑 CANN | ascend/ 包 |
| **B 执行器层** | AscendExecutor + ascendMockFixtures + AscendMockPort + toolchain/types | NpuToolchain 接口的 ascend 实现（CANN env 编排 + execa，不经 sandbox） | ascend/executor/ |
| **C 市场+验真层** | plugins/ascend/（marketplace + evals + knowledge manifest + officialVerify） | 已融入现有 plugin 体系，壳的 marketplace 接线 + 验真链 | atlascode/marketplace/ + 市场仓 |

### ascend 包是运行时 + 工具 + 执行器的合一

- **运行时**：5 skill（goal+gates prompt 渲染，工具链占位符填充）+ systemPromptSection
- **工具**：16 Tool 实现（定义输入/输出契约，调 executor 执行）
- **执行器**：AscendExecutor（实现 `NpuToolchain` 接口，execa 跑 CANN 工具链）

三者必须同包：工具没有 executor 跑不了命令，executor 没有工具不知道做什么，skill/prompt 没有工具是空话。5 skill 的 `allowedTools` 硬引用 16 工具名 + 每个调 `getCoreDependencies().ascendExecutor`——强耦合单元，同进退。

### 执行器形态裁定（v0.5 问题4，业界调研支撑）

**AscendExecutor 直走 execa，不经 sandbox**——两职责异质：
- `ShellExecutor` + sandbox：用户发起的**通用命令**，做权限/目录安全门控（沙箱禁令、cwd 限制、危险命令拦截）
- `AscendExecutor`：工具发起的**厂商命令**，做 CANN env 编排（`set_env.sh` 变量装配 + 版本路径探测 8.5.0+ 路径变化）

sandbox 不懂 CANN env，硬塞进去只增复杂度不解决真问题。硬件访问（`/dev/davinci*` + 驱动库挂载）是容器 mount 层的事，不是代码层的事。

**抽象层标准 = `Executor` + `NpuToolchain` 接口（内部标准，非行业标准）**：
- `Executor`：通用执行契约（`exec`/`isAvailable`/`availableCommands`），ShellExecutor + AscendExecutor 共同实现
- `NpuToolchain`：NPU 工具链统一抽象（`name` + `commands` 语义键→二进制名映射 + `reservedEnv` + `shouldMock` + `isAvailable` + `availableCommands` + `exec`，共 7 成员），配套 `applyToolchainPlaceholders()` 做 skill prompt 注册时占位符替换（`{{toolchain.commands.compile}}` → `bisheng`/`cncc`/`icpx`）
- **行业标准不存在**——调研证实 SYCL/Level Zero/PJRT/MLIR/Triton 均非工具 CLI 契约（分别是编程模型/运行时 API/编译 IR/编译框架/算子 DSL），MCP 是唯一 agent-工具协议但无厂商 wrap 硬件 CLI。atc/bisheng/nvcc/cncc/icpx/hipcc 各有各的 CLI 形态，无共享契约。自建 typed Executor + NpuToolchain 是唯一可行路径，且比业界先例（NVIDIA/Intel/Cambricon 自家 agent 集成还在"skill 知识 + 通用 shell"阶段）更结构化。

**Shape A/B 二分有全行业实证**：所有厂商工具链自然分二形——Shape A（CLI 二进制：bisheng/atc/msame/msprof/npu-smi / nvcc/nvidia-smi/nsys / cncc/cnmon/cnperf / icpx/sycl-ls/xpu-smi / hipcc/rocm-smi）→ wrap 成 Tool 返证据；Shape B（Python 库：TorchNPU/torch_mlu/IPEX/habana_frameworks/MagicMind）→ 留基座 coding + skill 知识不包 shell Tool。

**多厂商扩展路径**：Cambricon NeuWare 与 CANN 1:1 结构对称（cnmon≡npu-smi / cncc≡bisheng / cnperf≡msprof / cngdb≡msdebug / torch_mlu≡TorchNPU / MagicMind≡atc+推理引擎）。加 Cambricon 域包 = 实现 `NpuToolchain`（commands 映射 cncc/cnmon/cnperf）+ 写 `CambriconDomainPackage` 经 mount 注册。skill prompt 的 `{{toolchain.commands.*}}` 占位符自动按后端解析。四插桩点 + Executor 接口可平移。

### 开关粒度：产品级 + 市场级两层

| 内容 | 归宿 | 用户怎么得到 | 能不能关 |
|---|---|---|---|
| 16 工具 + AscendExecutor + 5 运行时 skill + prompt | 二进制内 `ascend/` 包，经 mount 挂载 | 产品是 AtlasCode 就有（编译期决定） | 产品级开关（不挂=AtlasOffice） |
| 6 知识技能 + 18 策展 wrapper | 市场仓 `atlas-plugins` | `/plugin` 装 | 用户级卸装 |

### 用户面零变化

- 5 运行时 skill 注册方式**变更**（v0.5 问题3a 勘误）：从 `registerBundledSkill()` 改为 `DomainPackage.skills`（domain-mount 挂载面注册）。调用点从 `skills/bundled/ascend*.ts` 换到 `ascend/skills/*.ts`，skill 定义内容不变。`registerBundledSkill()` 保留给基础 skill（非域包的通用 skill）。
- `commands.ts:321` 合并逻辑需适配：原四路（getPluginSkills + getBundledSkills + skillDirCommands + builtinPluginSkills）→ 新增 domain-mount skills 路。用户 `/` 菜单看到的 ascend skill 数量/名字/触发方式全不变。
- 3 个市场预装源（claude-plugins-official / agent-skills / atlas-plugins）接线随壳迁 `atlascode/marketplace/`，用户面 `/plugin` 看到的源、安装流程、品牌标签全不变

### PI 式 external plugin：未来触发器（非现在做）

方向正确（PI 的 extension point 理念已借鉴），但时机未到：
- port 契约未稳定（C 波未落地，8 port 形状是 grep 推断的草案）
- 单一消费者（只做 atlascode，无第三方生态）

**触发器**（出现任一才升级 external）：
- 第三方要开发 ascend 兼容插件（external 生态真出现）
- ascend 要独立发版/独立更新（不随 host）
- host 的 port 契约稳定（C 波落地 + 验证半年）

**升级路径**（单向平滑）：把 `src/ascend/` 拆独立 repo + package.json + peerDependency + 把 `engine/ports/domainMount.ts` 接口固化为 public stable API。机械操作，不在现在预付。

## L4.6 · services 全梳理（21 子目录归属）

判据三问：① 通用 agent 能力还是宿主/UI concern？② 被 engine 消费还是只被壳消费？③ 自身是否反向依赖 core 或壳类型？

```
engine 内（agent 通用能力，随 engine 迁）:
  api/(7 文件)      ← LLM 调用面（client/logging/metadata/promptCacheBreakDetection/withRetry/dumpPrompts/tokenUsage），先清 8 处反向 core
  mcp/ 运行时部分   ← client + normalization（types/utils 下沉 shared）
  SessionMemory/    ← 会话记忆，存储走 port
  autoDream/        ← stopHook 执行体
  contextCollapse/  ← 上下文折叠
  extractMemories/  ← 记忆抽取，存储走 port

shared（叶子下沉）:
  tokenEstimation   ← 纯函数
  mcp/types, utils  ← 类型 + 纯函数
  analytics/metadata 的 sanitizeToolNameForAnalytics  ← 纯函数 (h 裁定)

port 化（engine 经 port 用, 实现归壳）:
  analytics/growthbook  ← 远程实验配置, FeatureConfigPort (h 裁定, Port 8)
  analytics/config     ← 遥测配置, 核查死代码 (遥测已删, 是则不迁)

modelprovider（归域）:
  api/aiLimits, api/auth  ← 限额与鉴权

壳 atlascode/（宿主 concern）:
  lsp/              ← 进程管理，engine 经 port 读 init status
  PromptSuggestion/ ← 碰 AppState，抽 port
  policyLimits/     ← 企业策略
  skillSearch/      ← 远程加载（纯函数部分下沉 shared）
  plugins/          ← 插件管理
  oauth/            ← OAuth 流程
  MagicDocs/        ← 文档
  AgentSummary/     ← 摘要 UI
  settingsSync/     ← 设置同步
  remoteManagedSettings/
  notifier, preventSleep, voice*, vcr, awaySummary, diagnosticTracking  ← 宿主能力
```

## L4.7 · 四域自治模型（v0.6 核心——地基可插拔）

### 缘起：从"域包可插拔"到"地基可插拔"

v0.5 定了 ascend 域包可插拔（DomainPackage 四插桩点），但 grep 实证发现**四域地基自身全不自治**——每个域向上寄生一堆 utils/types/services/entrypoints。域包做得再干净，地基焊死，整个产品还是换不动。modelprovider 要换成开源模块，得先拽出它依赖的 12 个跨域文件，这些又链式依赖别的——一拔带出一串。"可独立 package"是空话。

本节把自治从域包推广到四域地基。**四域全做自治（用户裁定 A，一次到位）**——"这次不处理干净，未来很难再次重构"。

### 自治三柱（每域必须做到）

| 柱 | 含义 | 验证手段 |
|---|---|---|
| **① 依赖洁净** | 向下只依赖 shared（类型+纯函数），不向上 import utils/services/entrypoints/constants（域自管的除外） | lint boundaries `element-types` 禁向上 |
| **② 状态自治** | 自己的状态自己管（域内 store / 实例字段 / 不可变更新），不寄生壳 AppState / 全局 `let` / 跨域单例 | 域内状态不跨边界——grep 域内无 `setAppState`/`getAppState`/域外 store 引用 |
| **③ 配置自治** | 每域一个 `config.ts`，收拢自己的 env + settings 读取，不散在全局 `getGlobalConfig()` / `getSettingsForSource()` 直连 | 配置入口单一——域外不直接读该域配置，域内配置只从 `config.ts` 出 |

三柱做到 = 域可拔出独立成包。换实现 = 接口对接 + config.ts 改数据源，状态/类型/逻辑全在域内不动。

### 诊断：四域现状（grep 实证，2026-09-21）

四域向上 import 共 **30 个外部依赖目标**，分三类：

**① 纯类型/常量（13 个，应下沉 shared）**：
`types/atlas.js`、`types/message.js`、`Tool.js`（类型部分）、`constants/apiLimits.js`、`constants/betas.js`、`utils/systemPromptType.js`、`utils/thinking.js`、`utils/effort.js`、`utils/envValidation.js`、`utils/envUtils.js`、`utils/platform.js`、`utils/format.js`、`utils/permissions/PermissionRule.js`（纯类型）

**② 带行为 utils（12 个，域自管 or shared 工具）**：
- `utils/Shell.js`、`utils/ShellCommand.js`、`utils/shell/shellProvider.js` → **executor 自管**（shell 执行是 executor 核心行为）
- `utils/fsOperations.js`、`utils/readFileInRange.js`、`utils/path.js` → **shared 工具**（多域共用 fs/path，纯函数部分下沉，真实 I/O 部分归消费域 or port）
- `utils/ripgrep.js` → **sandbox 自管**（ripgrep 是 sandbox 搜索后端）
- `utils/debug.js`、`utils/errors.js` → **shared**（通用纯函数）
- `utils/settings/*`（constants/types/settings 3 个）→ **类型下沉 shared + 实现走 port/注入**

**③ 跨域污染（5 个，必须斩断）**：
- `services/analytics/growthbook.js` → memory 直连（**碰网络，违反 PRT-1**）→ Port 8 注入
- `memdir/paths.js`、`memdir/teamMemPaths.js` → memory 依赖 memdir（**实现细节外暴露**）→ 收进 memory 域内
- `config/settings-adapter.js` → modelprovider/roles 直连 → 走 port
- `entrypoints/agentSdkTypes.js` → modelprovider 依赖入口点类型 → 类型下沉 shared

### 每域自治方案

#### engine 状态模型（D 议题升级 → β 不可变 store）

**现状**：engine 状态三种方式混用——实例字段（mutableMessages/permissionDenials/readFileState/totalUsage）+ 寄生壳 store（fileHistory/attribution 经 setAppState）+ utils 纯函数（fileHistory 逻辑在 utils/fileHistory.ts，状态在 AppStateStore，调用在 QueryEngine——三处分散）。charter v0.5 Port 1 写的"10+ 消费点机械替换"不准——实际 grep：loop/stopHooks/toolHooks/compact/toolExecution **零直接命中** getAppState，真实消费集中在 QueryEngine.ts（1 读 + 4 set，set 的字段是 fileHistory/attribution，**不在 charter 说的 5 字段里**）+ 经 ToolUseContext 传给工具。

**自治目标（β）**：fileHistory/attribution 从 AppState 挪入 engine 自管，与现有实例字段同级收进 **EngineState**（独立模块 + 不可变更新 `set(f)` 纯函数，与 AppState store 同构）：

```ts
// engine/state/EngineState.ts
class EngineState {
  messages: Message[]
  fileHistory: FileHistoryState      // 从 AppState 挪入，engine 自管
  attribution: AttributionState      // 同上
  readFileState: FileStateCache
  permissionDenials: PermissionDenial[]
  totalUsage: Usage
  // set(f) 不可变更新（同 AppState store 模式）
  set(f: (prev: EngineState) => EngineState): void
  get(): EngineState
}
```

fileHistory/attribution 各自成为 engine 下内聚子模块（类型+逻辑+状态+配置同包）：
```
engine/state/fileHistory/{types,fileHistory,config,index}.ts
engine/state/attribution/{types,attribution,config,index}.ts
```

**SessionSnapshot 因此只剩 5 个壳→engine 配置投影字段**（toolPermissionContext/mcp/effortValue/advisorModel/tasks），全是读多写少、壳侧用户操作驱动——view 语义天然够（engine 要稳定快照自行 copy，port 不保证返回 copy）。高频写状态（fileHistory/attribution）全在 EngineState 不经 port。

**选 β 不选 α 的理由**：用户裁定——"这次不处理干净，未来很难再次重构"。α（实例字段聚合）只是把寄生换散落，没解决状态变更可追踪/可测/与 AppState 同构。β 一步到位，engine 状态模型和壳 AppState 同构，未来 engine 若要支持多订阅（如 WebGUI 观察 engine 状态）天然适配。

**并发模型（v0.9 C-2 裁定）**：旧仓 fileHistory 已是 updater 注入式（`fileHistoryTrackEdit(updateFileHistoryState: (fn) => void)`，fn = functional updater `(prev) => next`，外层 curried 层是「接收 updater 返回 void」的函数，部分调用点注入 no-op stub `()=>{}`）= React functional-update 语义，新仓 EngineState 是**同构迁移非新发明**。并发场景（并行 tool call、多 Edit 并行）= per-file map 不同键天然交换；**set(f) 串行 apply 队列**（异步队列，每次 f 看最新 committed prev，无锁）。E fixture 矩阵 +2：并行 Edit（不同文件）fileHistory diff + rewind（undo）链。

#### modelprovider 自治

**现状**：12+ 跨域 import（types/atlas/message、entrypoints/agentSdkTypes、constants/apiLimits/betas、utils/format/debug/systemPromptType/effort/thinking/envValidation、Tool.js、config/settings-adapter）。endpoint/role 配置寄生 settings + roles.ts 全局。

**自治目标**：
- 类型下沉 shared（atlas/message/effort/thinking/systemPromptType）
- `entrypoints/agentSdkTypes` 类型下沉 shared
- constants/apiLimits/betas → modelprovider 自管（`modelprovider/constants.ts`，这是 LLM 调用限制+beta header，是 modelprovider 专属）
- errorMessaging 走 Port 2（已定）
- endpoint/role 配置 → `modelprovider/config.ts`（ModelProviderConfig），从 settings 读取收拢在域内，替换开源模块时只改 config.ts 数据源
- Tool.js 类型部分下沉 shared（params.ts/streamAssistant.ts 只需类型）

#### sandbox 自治

**现状**：settings 5 处耦合（createSandboxManager/types/pathResolve/compat），utils/ripgrep/permissions/errors/debug/platform 依赖。

**自治目标**：
- settings 类型下沉 shared + 实现走 SandboxDependencies 注入（**已有模式**——createSandboxManager 已用 `deps.getSettingsForSource`，仅 `compat.ts:12` 残留直连 `getSettingsForSource` 待清）
- ripgrep 收进 sandbox 域内（`sandbox/ripgrep.ts`，搜索后端是 sandbox 专属）
- permissions/PermissionRule 类型下沉 shared，权限逻辑收进 sandbox
- platform 纯函数下沉 shared
- 状态自管（规则缓存不寄生，已在域内）

#### memory 自治

**现状**：growthbook 直连（碰网络，**违反 PRT-1**）+ memdir 依赖（paths/teamMemPaths 实现细节外暴露）+ fs/readFileInRange/envUtils 依赖。

**自治目标**：
- growthbook → Port 8（FeatureConfigPort）注入，memory 是消费方之一（`MemoryConfig` 改接 port 不直连 growthbook）
- memdir/paths/teamMemPaths 收进 memory 域内（`memory/paths.ts`，实现细节不外暴露）
- fs/readFileInRange → shared 工具（纯函数部分）or port（真实 I/O）
- envUtils 纯函数下沉 shared

#### executor 自治

**现状**：3 处 utils 依赖（Shell/ShellCommand/shellProvider），AscendMockPort/FreshnessPort 已是 port 模式。

**自治目标**：
- Shell/ShellCommand/shellProvider 收进 executor 域内（`executor/shell/`，shell 执行是 executor 核心行为非通用工具）
- AscendMockPort/FreshnessPort 保持 port 模式（已是范本）
- **自治度最高**——依赖最少，改动最小

### shared 边界裁定（防 shared 成新耦合点）

四域自治后都向下依赖 shared，shared 会变胖。裁定：**shared 保持纯叶子**（类型 + 纯函数 + identity 常量 + feature()），**不含行为模块**。

- 纯类型/纯函数（types/message、systemPromptType、thinking、effort、envUtils、envValidation、platform、format、errors、debug）→ 下沉 shared
- 带副作用 utils（fsOperations 真实磁盘 I/O、ripgrep 进程调用）→ **归消费域**（executor/sandbox 自管），纯函数部分（path 拼接）下沉 shared
- settings → 类型下沉 shared，实现走 port/注入
- Tool.js → 类型部分下沉 shared，行为部分（tool 注册表）归 engine

shared 不成新耦合点：它只有纯叶子，任何域替换不影响 shared，shared 变动只动类型/纯函数（全域受益但不强制耦合）。

### 与 v0.5 决策的关系

- **D（SessionSnapshot 语义）被吸收**：engine 状态模型（β EngineState）定了，SessionSnapshot 自然只剩配置投影 5 字段 + view 语义。D 的 view/copy 之争消失——高频写状态不经 port，port 只传配置投影，view 语义天然够。
- **DEP-1/STR-1/PRT-1/PRT-2 强化**：自治三柱给 DEP-1（单向依赖）、STR-1（门面收口）、PRT-1（端口分离）、PRT-2（零副作用）提供了**可验证的实证标准**——不是抽象"要分离"，是 grep 可判定的"域内无向上 import / 无寄生 store / 配置入口单一"。
- **迁移波次影响**：自治化是 B/C 波的重头（四域依赖洁净 + 状态挪入），不是额外波次——融入现有 B（四域平铺）+ C（services 分流 + 叶子下沉）。

## L4.8 · 多智能体编排落位（coordinator / AgentTool / fan-out，v0.8 B 层⑤）

旧仓 `COORDINATOR_MODE` 已翻转 ON_BY_DEFAULT（master `73631df`，env 门控 + kill-switch 保留），3 门控测试文件（agent-tool-depth 4 / agent-tool-fanout 8 / coordinator-worker-agent 5，全在基线 1024 内）。charter 原文无落位，v0.8 一次定清。

**落位（5 条）**：

1. **coordinator mode → `engine/coordinator/`**（engine 下新子模块，与 ports/state/pipeline/query 平级）：agent loop 层的多智能体编排（主循环 spawn workers、fan-out、深度追踪）= **loop 自身的编排语义**，归应用层 engine。**不是顶层域**（非库级地基，不满足自治三柱，塞进四域违反依赖分层——它依赖 engine loop，反向不成环但分层违和），**不是壳**（非 UI/CLI 入口 concern，壳只接线不承载编排逻辑）。
2. **AgentTool**（spawn 子代理的工具）→ `engine/tools/AgentTool/`，C 波（C1/C2）随 engine/tools/ 迁，是 engine 工具注册表项。
3. **spawnDepth/allowFanOut**（runAgent + AgentTool 的 harness 侧深度追踪穿透）→ engine 状态 / 工具参数链（EngineState 或 per-call 参数），**不进壳 AppState**（AUT-1：域/引擎状态不寄生壳）。
4. **3 门控测试文件**（agent-tool-depth / agent-tool-fanout / coordinator-worker-agent）→ unit co-located 随 engine/ 迁（F 裁定），C 波 unit 迁移批次；门控语义不变——feature.ts 为普通模块（v0.8 B 层②），feature() 门控依旧可控，测试随模块走即可。
5. **ON_BY_DEFAULT 继承**：`COORDINATOR_MODE` 默认开（env 门控 + kill-switch 保留）语义在新仓原样继承，不回退、不另裁。

## L4.9 · C 层架构裁定（v0.9，8 项）

C 层 = 不阻塞 A/B 波、但 C 波前必须定的架构级议题（C-1/C-3/C-5/C-7）。8 项一次裁定完毕（2026-09-21 用户拍板；审视后修正 C-4/C-5，补丁 C-1/C-3/C-6）。机械触点散在对应章节：C-1→A 波行 / C-2→L4.7 β / C-3→L8 STR-4 / C-4→shared 节+L6 out-of-scope / C-5→AUT-2 / C-6→防烂机制 / C-7→已知坑 .tsx 行 / C-8→E 波行。

### C-1 · feature() 换前验真（A 波，换前一次性验真）

「零语义变化」判定押在仓内 F5 断言上——「生产 bundle 里 `bun:bundle` 经 package.json imports 解析到 `native-ts/bunBundle.ts` 桩（运行时 env 求值：`FEATURE_<NAME>` 'true' 优先 / 'false' 显式盖 ON_BY_DEFAULT / ON_BY_DEFAULT={TRANSCRIPT_CLASSIFIER, COORDINATOR_MODE} / ATLAS_DEV_FEATURES 仅 source-direct 生效）」——**断言未实证**（A 层教训：charter 6 个实证数字复现不了）。**A 波换 import 前一次性验真**：`bun build` 后 grep 产物找 `FEATURE_`（或查 package.json imports 字段映射 + 产物内桩代码），确认换前生产语义。
- **= 桩 env 语义** → 换 import 零语义变化，直接执行（≈575 处纯机械，迁移时重新推导）。
- **= 构建期常量**（真 `bun:bundle` DCE 内联）→ 换后 = ON_BY_DEFAULT 2 flag 默认开 + `FEATURE_*` env 可控制 = **73631df/81521d0 裁定本意**（TRANSCRIPT_CLASSIFIER/COORDINATOR_MODE 翻转裁定意图），记为语义差异对齐裁定意图，非回归。
- **fixture env 固定**：E 层2 fixture 清单加 `env:` 字段，涉及的 `FEATURE_*` 显式给值（ON_BY_DEFAULT 2 flag 不 set 即双 ON，双跑等价保持）。

### C-2 · EngineState 并发模型（串行 apply）

实证：旧仓 fileHistory 已是 updater 注入式（`updateFileHistoryState: (prev: FileHistoryState) => FileHistoryState` 依赖注入，部分调用点注入 no-op stub）= React functional-update 语义——**新仓 EngineState 是同构迁移，非新发明**（不存在「mutable→immutable 语义改写」风险）。并发场景（并行 tool call、多 Edit 并行）= per-file map 不同键天然交换；**set(f) 串行 apply 队列**（异步队列，每次 f 看最新 committed prev，无锁）。E fixture 矩阵 +2：并行 Edit（不同文件）fileHistory diff + rewind（undo）链。

### C-3 · shared 准入判据（防 grab-bag，C1 前置）

C1 下沉 225 处叶子，shared 是最大膨胀风险点。三硬判据（L8 新规则 STR-4，C1 每批下沉前过 checklist，review 桶）：
1. **纯度**：无副作用；域配置 env 读归该域 `config.ts`（AUT-2）；**有限例外名单 = feature.ts / identity.ts / log.ts**（I/O 叶子例外，见 C-4，零项目内依赖不成耦合点）
2. **多域消费**：被 ≥2 域（或 domain+engine）消费的单一面才进 shared；单域私有留域内（防「放 shared 最省事」）。**判据只约束 C1 新候选，charter 已裁定项（sanitizeToolName/tokenEstimation/ripgrep 归属等）祖传豁免**
3. **扁平**：shared 内部零子目录（STR-2 目录深度 ≤1）——要分子目录 = 不是叶子，退回去

### C-4 · logging：本期不加第 9 port；shared 开「I/O 叶子例外」

实证：P6 删的是 telemetry 孤儿链；活 logging = `src/utils/log.ts`（console 包装，8 文件在用）；错误文案面已有 **Port 2**（errorMessaging）。**不加 logging port**（远程日志是 Web GUI Phase 3 需求）。裁定：shared 开**有限 I/O 叶子例外名单**（feature.ts / identity.ts / log.ts，零项目内依赖，不构成耦合点）——log.ts 写 console/debug 文件有副作用，不属「纯叶子」主体，进例外名单而非违反纯度判据。**远程日志（Phase 3）= 演进 port**（对齐既有 MCP 动态注册 / Executor 签名门控的演进 port 模式），显式 out-of-scope（L6 §8）。

### C-5 · 配置优先级（审视后修正，翻原序）

单一优先级链：**企业策略（MDM managed settings）> env（`ATLAS_*`）> settings.json（用户）> 代码默认**。翻序理由：MDM 的存在意义是合规最高权威，env 能压过企业策略违背 MDM 设计（原「env > 策略」是反的）。每域 `config.ts`（AUT-2）只实现自己那一片，内部解析顺序统一 policy→env→settings→default，域外不直读。**默认层（链底）单一事实源 = `docs/env-defaults-decision.md`**（103 行：①保持开 6 / ②预设值 28 / ③保持关 69；上游输入 = `docs/env-defaults-triage.md` 202 变量来源初筛，T2 22 个全进 F 池，2026-09-21 用户裁定）。⚠️ **不做「启动注入默认值进 process.env」的 seed 脚本**（把代码默认抬进 env 层、冒充用户设置，违反本链）；要有效配置可见性 → 只读 `--env-dump` 命令。

### C-6 · rollback 策略（审视后修正：reset 非 revert）

**波次 = 回滚点**——每波完成打 checkpoint tag（`wave-a` / `wave-b` / …）。回滚 = **`git reset` 到上一波 tag**（波次 range 的 revert 易冲突；单人本地仓 reset 干净，已 push 场景走分支不走 force-push）。运行时无产品级回滚（单二进制，SemVer 按既有版本管理方案）。旧仓 `a8af45b` 全绿基线 = **终极兜底**（archive 窗口 4-8 周内随时可 checkout 对照/回退）。

### C-7 · .tsx 491 编译产物：原样搬，不重编译

三原则（L5 已知坑对齐）：① **原样搬**（编译态 .tsx 随模块平移，不反编译、不重编译）② **最小插入**（`grep -c "_c("` 判态后只许最小改动）③ **新逻辑落干净文件**（新逻辑一律干净 .ts/.tsx）。风险面：C 波 88 处结构性丝几乎全 .ts（engine pipeline/services 是 .ts），C 波风险低；**.tsx 主战场 = D 波 UI**（D 波条目显式三原则）。

### C-8 · ascend 市场克隆依赖：三层不变

① **E 波 gate（gelu L1 16 工具）纯 fixture，零市场克隆依赖**（CI 零外部依赖）；② L4 evals（6 知识技能）保留克隆门控（`ATLAS_ASCEND_KNOWLEDGE_DIR` 门控，未物化 SKIP，既有语义），C 波后 L4 接验证时落实；③ 市场预装/验真链归 D 波壳层（预装三件套）。E 波行补 gate 依赖声明。

## L5 · 迁移波次

三层无损定义（每层独立判绿）：
- **编译级**：`tsc --noEmit` + 目标模块独立编译
- **行为级**：测试墙 all-pass，**参照物 = 旧仓 `a8af45b` 全绿基线**（unit 82 / 1024 + integration 10 / 63 + regression 2 / 15，全量 99 文件 / 1109 pass / 0 skip，tsc 0）
- **功能级**：gelu e2e（16 工具 L1）+ 双跑比对（同 fixture-replay prompt 喂旧 master 与新仓 headless `-p --output-format stream-json`，diff=0）

### 六波（A→B→C→E→D→F，ascend 提前到壳前）

| 波 | 内容 | 关口 |
|---|---|---|
| **A 骨架** | **前置（用户手动）**：备份 `~/.atlas/` settings json → 清理 `~/.atlas/` 及相关文件 → archive（特判1：新仓不带 ATLASHARNESS.md 迁移逻辑，启动即用干净 `~/.atlas/` + `ATLAS.md`）；旧仓打 baseline tag + 留档三件套（详见下文「A 波留档三件套」）；新仓 `git init` + 目录结构（L3）+ **边界 lint 先上**（DEP-1…5 + STR-1…2 + PRT-2，f 裁定：eslint-plugin-boundaries 全 error，A 波 lint 桶）+ 测试框架搬迁（d 裁定：`shared/feature.ts` 普通模块替代 bun:bundle，**不需要 preload-bunbundle.ts**）+ **feature() 规则 A 波定、逐波换**（v0.8 B 层②(a)：A 波建 `shared/feature.ts` + 定 `bun:bundle` 废弃规则；**feature() 调用点（≈575，迁移时重新推导）import 机械换随各文件在其落地波（B/C/E/D）应用**——文件尚未迁进新仓，A 波无法一次性换全仓；flag 语义分类仍 C2） | CI 四件套绿（lint+tsc+test+build）；**test gate = 测试框架 smoke 绿 + shared 纯函数测试（若有）**（**引擎 14 集黄金参照 A 波只生成 JSON 参照物**（留档三件套第 3 项，旧仓 tag 产出），**A 波无 engine 不 diff**；首次可 diff 在 **C 波（B9，engine 落地）**）+ **C-1 验真（v0.9）**：换 import 前一次性验真 `bun:bundle` 生产语义（`bun build` 产物 grep `FEATURE_`；= env 桩则零变化，= 构建期常量则对齐 ON_BY_DEFAULT 裁定意图，见 L4.9 C-1） |
| **B 叶子+四域** | `shared/`（含 identity.ts；feature.ts 已 A 波就位）+ 四域 + 各域 `create()`。**v0.10：B 波四域可并行**（2 session × 2 域，判据=可检测+机械可恢复，详见 L5 执行弹性节）；`shared/` 为并行争用点 → 前置契约冻结步（A 波末锁 shared 类型骨架 + 四域 config.ts 契约，分叉前定死）。**前置**：清 `sandbox/compat.ts:9`→`../factory.js` 反向边。modelprovider type-only 泄漏下沉 shared（见附录 C 逐文件清单）。errorMessaging 改 compose 注入（Port 2）。6 处散落 `new FileSystemMemoryStore` 收成各域 create 出口。各域 `config.ts` 默认层按 `docs/env-defaults-decision.md` 取对应行（② 档 IFF 占位值网关定案后另 pass 填实） | **B6**：四域各自独立编译 + 域单测全绿 |
| **C 重活（两段式）** | **v0.10：纯串行**（设计耦合不可机械恢复——shared/ + engine 是设计决策面，不可并行）。**前置 spike**（开 C 波前挑 memory 域 1-2 天校准 225/88 + EngineState 并发，详见 L5 执行弹性节）。**C1 叶子下沉**：225 处叶子丝（utils 155 + types 44 + constants 13 + 杂项 13）经 shared 大吸收。**v0.11 拆分**：C1-四域（41 处，B 波前移顺带下沉）+ C1-engine（212 处，C 波主体）；**85% 集中 engine**（orchestrator 261 处反向 import，实测 307/313 可 grep 验证）。**C2 端口化**：engine（orchestrator 改名，`tools/`→`pipeline/`）+ 8 port 落地，88 处结构性丝按目标面分批：services 33（分流，含 analytics 拆分：growthbook→Port 8 / sanitize→shared）→ tools 26 → Tool.ts 16 → hooks 8 → memdir 3 → state 2。**C1 必须先于 C2**。feature() 调用点分类（≈575 迁移时重新推导；import 换规则 A 波定、随各文件落地波应用，C2 只做 flag 语义分类）：域级→domain-mount，特性灰度→`shared/feature.ts`，远程实验→Port 8 | **B9**：8 port 契约 + in-memory 最小实现（test-only）经 compose.ts 注入链落地 + 循环契约测试绿（注入链通 + session-context 快照 get/set 语义 + loop 走 1 轮最小循环；**agent-loop/gateway-json-schema 真身归 E fixture 矩阵，B9 不迁**）；**B14**：承重 5 规则全绿验收（C2 末执行，v0.8 B 层④） |
| **E ascend 块** | 16 工具 + **5 运行时 skill**（非 v0.2 的 11；6 知识技能已移市场仓，新仓只带验真链：`ascendKnowledge.ts` helper + `ATLAS_ASCEND_KNOWLEDGE_DIR` + L4 evals + 市场预装接线）+ prompt + AscendExecutor 平移 `ascend/`，经 domain-mount 注册（Port 3），**不动 engine** | **gelu L1 全 16 PASSED（经四元组直调路径**：`ascend/index.ts` 的 `ascendPackage` 四元组 + AscendExecutor fixture mock 直调，**不经 mount.ts、不依赖壳** = B14 可插拔性实证样例；全栈接线 + gelu 复验在 D 波；**依赖声明（v0.9 C-8）：gate 纯 fixture，零市场克隆依赖**（L4 evals 克隆门控另项，C 波后接））
| **D 壳** | atlascode 壳（UI/CLI/AppState 实现/identity.ts/`mount.ts`/`compose.ts`，`.atlascode` 目录名、bin `atlascode`）；identity 构建期 `--define` 注入（b 裁定）；FeatureConfigPort 实现（h 裁定）；**`mount.ts` 接线（DEP-5 白名单边）后 gelu 全栈复验**（E 波直调 gate 不覆盖接线面，D 波经 launcher 真实路径再跑 gelu L1）；"剩下没抽走的全是壳" | 全量测试墙绿（基座+ascend） |
| **F 清尾** | 删所有 shim；~1.3 万行死代码；75 flag 审计（含桩新语义：`ON_BY_DEFAULT=[TRANSCRIPT_CLASSIFIER, COORDINATOR_MODE]`（2 项，73631df 翻转）、`ATLAS_DEV_FEATURES`、`'false'` 优先）；CLAUDE_* 残留（切硬政策）；品牌串分类（对外层→AtlasCode，内部层保持 atlas）；ENV T2 22 个全进 F 池（`docs/env-defaults-triage.md` Tier 2：订阅/账号残留 7 + CCR/remote 10 + cowork 4 + mobile 1）；旧仓 GitHub archive（e 裁定：新仓稳定 4–8 周后）；新基线文档落盘 | **B13**：all-pass + gelu e2e + 双跑 diff=0 |

每波内部步：**一个模块一个 commit**（既有提交粒度约定），每步 `tsc` + 对应测试层绿。

### A 波留档三件套（v0.7 Tier 3 第3项裁定）

**要解决的问题**：旧仓 master 持续在动（2026-09-21 当天 f79dcbe 之后又落 coordinator 8 commit + 3 测试文件），charter v0.6 写的基线数字（unit 79/1007）对应 `f79dcbe`，已漂移。"09-21 全绿基线"不是固定点。差集判定（新仓 fail - 旧仓 fail）和双跑渐进 diff（E layer2，每波次 diff=0）都要求一个**冻结可复现**的参照点。

**锚点 = 旧仓 HEAD `a8af45b`**（2026-09-21 20:26，用户单独 session 确认全量 99 文件 / 1109 pass / 0 fail / 0 skip 归零）。旧仓在该 SHA 上打 tag `atlascode-baseline-2026-09-21` 冻结，旧仓 master 可继续动，双跑/差集判定一律 checkout tag。分层分解：unit 82 文件 / 1024 pass（含 3 coordinator 门控文件：agent-tool-depth 4 / agent-tool-fanout 8 / coordinator-worker-agent 5）+ integration 10 / 63 + regression 2 / 15 + tui probes 2 + full-feature probes 1 + e2e 2，tsc 0。

**三件套**：

1. **tag（旧仓侧）**：旧仓 `git tag atlascode-baseline-<date>` 锚定确认全绿的 HEAD；SHA 同步记进新仓 `docs/baseline/baseline-<date>.md`（含生成说明 + 基线数字 + 旧仓 commit subject）。
2. **test-report.json（新仓 `docs/baseline/`）**：`bun test --reporter=json` 产出全量 pass/fail 清单（每测试 name + pass/fail + duration）。差集判定逐个比 name，不只比"1109"数字——数字掩盖不了单个测试 name 漂移。
3. **黄金参照（新仓 `tests/fixtures/baseline/`）**：14 个 engine 测试（regression gateway 12 + integration agent-loop 1 + gateway-json-schema 1，见 L5.1）在旧仓 tag 上跑 `callModel()` 的完整产出，存为 `<fixture>.json`。**engine 在场波次（C/E/D）双跑** = 新仓跑同 fixture → 和黄金参照 strict diff（A 波只生成 JSON 不 diff，B 波无 engine 不跑双跑）。

**两类 JSON 必须区分**（易混淆）：
- `tests/fixtures/gateway/*.json` = **fixture 输入**（LLM SSE chunk，喂给引擎的原料）
- `tests/fixtures/baseline/*.json` = **黄金参照**（引擎产出，比 diff 用的对照端）

**时序**：锚点已确认 `a8af45b`（用户 session 验证全量 99/1109 归零）；黄金参照 A 波**生成初始 14 个 JSON 参照物**（旧仓 tag 产出，仅生成不 diff——A 波无 engine）；**首次双跑 diff 在 C 波（B9，engine 落地后用黄金参照）**；E 波 layer2 fixture 清单定全后补齐迁移风险分支（compact/stopHook/token/abort/工具调度）。

### 防烂机制（比迁移顺序更重要）

1. **边界封顶前置**：A 波即焊 DEP-1…5 + STR-1…2 + PRT-2 的 lint（A 波 lint 桶）。骨架立起后新代码不可能再长反向依赖——迁移变成纯"降耦合"单向过程。
2. **C 波是最大单点风险**：占全部工程量一半以上，唯一真红。C1/C2 顺序不可倒（先叶子后端口）；C2 按目标面切小步，每小步有独立可验中间态。
3. **回滚策略（v0.9 C-6 + v0.10 可暂停协议）**：波次 = 回滚点——每波完成打 checkpoint tag（`wave-a`/`wave-b`/…），回滚 = `git reset` 到上一波 tag（range revert 易冲突，单人本地仓 reset 干净）；运行时无产品级回滚（单二进制，SemVer 按既有方案）；旧仓 `a8af45b` 全绿基线 = 终极兜底（archive 窗口 4-8 周内随时 checkout 对照/回退）。**可暂停协议（v0.10）**：每波「最小可交付」完成即可暂停（见下文执行弹性表）；恢复 = 从最近 tag checkout → 重跑该波 test gate 确认状态 → 继续；C 波 >20 天触发超阈值评估（拆 C1 为分域渐进 C1a/C1b，或缩范围——部分域保持旧仓形态共存）。

### 执行弹性（v0.10——单人 + 双 session 并行，不改架构只改节奏）

> **目的**：strangler 增量迁移已设计在代码层；本节把同款弹性延伸到**执行节奏层**——单人项目最大风险不是做错（可回滚保底），是中途精力跟不上、半成品悬空。详见独立文档 `docs/execution-strategy.md`。

**并行地图**（判据 = **可检测 + 机械可恢复**，非「零风险」；零风险能并行的只有 F 波边角料，买了等于没买）：

| 波 | 判定 | 理由 | 红利 |
|---|---|---|---|
| **B** | **可并行**（2 session × 2 域） | 四域自治模型本意=域间独立；冲突=shared/ 类型争用 + cherry-pick 竞态，**可检测**（tsc/lint 即时拦 import 违规）+ **机械可恢复**（类型定义冲突是机械合并非设计返工） | 5-8 天 → 3-5 天 |
| **C** | **纯串行** | shared/ + engine = 设计决策耦合（EngineState 形态/shared 类型契约），设计冲突**不可机械恢复** | 无（咽喉） |
| A/E/D/F | 串行 | 红利小或集成胶水（D mount/compose） | 无 |

**并行前置——契约冻结步**（B 波分叉前，A 波末做）：锁死 shared 类型骨架 + 四域 `config.ts` 契约 + 文件归属矩阵（CLAUDE.md 已有文件归属纪律，操作化）。分叉前不定死 → 两 session 产出不兼容，合并时才发现。合并协议：串行 cherry-pick + 每次后 `git push origin master` 对齐 + `merge-base --is-ancestor` 验祖先链（既有纪律，防 `9d06722` 被冲竞态）。

**共存路径**（每波结束=可暂停点，旧仓 a8af45b 始终全绿可共存）：

| 波末 | 最小可交付（该波硬核） | 暂停时新仓状态 | 旧仓状态 |
|---|---|---|---|
| A | 骨架 + feature.ts + lint + 14 集 JSON 参照物 | smoke 绿空壳 | 不受影响 |
| B | 四域 config.ts + 域单测（B6） | 四域独立编译绿 | 不受影响 |
| C | engine + 8 port + B9/B14 | engine 可跑双跑 diff | 不受影响 |
| E | ascend 块直调（gelu L1） | ascend 可独立验证 | 不受影响 |
| D | 壳接线全栈 | 新仓全功能 | 可 archive |
| F | 清尾 + B13 | 新仓全绿独立 | archived |

**C 波前 spike**（开 C 波前必做，1-2 天）：挑 **memory 域**（反向依赖最少：仅 growthbook→Port 8 一处跨域污染）真跑「叶子下沉 + 端口化 + 双跑 diff」→ 实测校准 225/88 估算 + 单域耗时 + 验证 EngineState 并发模型（若涉及 fileHistory）。spike 产出：① 实测单域耗时 → 校准工作量粗估 ② 225/88 分类准确性 ③ EngineState set(f) 队列并发正确性原型。**spike 跑完才决定**：节奏可控 → 正式开 C 波；C 波远比预估复杂 → 回头缩范围（先只迁 engine + memory，其余域保持旧仓形态共存）。

### 已知坑（迁移时提前标好）

- **`.tsx` 编译产物**（src/ 491 个含 `_c` memoization）：平移时 `grep -c "_c(" <file>` 判态，编译态只最小改动，新逻辑落干净 `.ts`；**原样搬不重编译**（v0.9 C-7：不反编译、不重编译；C 波风险低——88 丝几乎全 .ts——主战场 D 波 UI）
- **双跑比对基线**：参照物 = 旧仓 `a8af45b` 全绿基线（非记录在案的 550/1/4，该记录 predates 9-17 env 硬切 + 9-18 瘦身，已失效；亦非 f79dcbe 的 79/1007，那是 v0.6 数字已漂移）
- **旧基线里的 fail 不要在新仓"顺手修"**：Pre-Step 0 已在旧仓清零；新仓目标 = all-pass，差集判定才干净
- **feature() 调用点分类（≈575，迁移时重新推导；v0.8 记 586 复现不了）**（d 裁定 + v0.8 B 层②(a) + v0.9 时序修正）：import 换规则 A 波定（`bun:bundle` 废弃、`shared/feature.ts` 就位），**机械换 import 随各文件在其落地波（B/C/E/D）应用**（零逻辑变更，非 A 波一次性全仓）；C2 时逐点判定域级（→domain-mount）/ 特性灰度（→`shared/feature.ts`）/ 远程实验（→Port 8），不可一刀切

- **双跑 fixture 锚定原则**（v0.7 E 裁定）：每个 fixture 必须显式标注对应哪个迁移风险分支（compact/stopHook/token/abort/工具调度），happy-path 凑数的不算。风险驱动非覆盖率驱动——白盒 12-15（锚定迁移风险分支）+ 黑盒 3-5（system prompt 段序列 + 工具注册列表）。
- **双跑频率**（v0.7 E 裁定 + v0.9 时序修正）：**engine 在场波次（C/E/D）跑渐进双跑 diff**（抓渐进回归），非仅 B13 跑一次（B 波无 engine，跑的是四域 unit 绿非双跑；双跑 callModel diff 需 engine，C 波（B9）起才有）。支持白盒方案（快，可每波跑）。
- **ascend 资产 vs L4 测试分波**（v0.7 F 裁定）：ascend 工具/技能 E 波迁（结构搬到位），L4 skill-eval 测试 C 波后迁（等 engine 主循环就位再接验证）。资产迁移和测试迁移分波。

## L5.1 · 双跑等价机制（E 裁定，v0.7）

### 三层定案

- **层1（diff 维度）**：白盒主 + 黑盒边界。
  - **白盒**：`callModel()` 入参/出参 + `OrchestrationEvent` 结构（discriminated union：StreamEvent | RequestStartEvent | Message | TombstoneMessage | ToolUseSummaryMessage）→ 严格相等。
  - **黑盒**：`launcher -p --output-format stream-json` 的 `SDKMessage` type 序列 + system prompt 段序列 + 工具注册列表 → 严格相等。`SDKMessage = any`（无结构），只验 type 序列。
- **层2（fixture 驱动机制）**：**Mechanism A**（跨仓可分享）——纯 LLM SSE chunk（如 `[{id, choices:[{delta:{content:"Hel"}}]}, ...]`），`mock.module` stub 9 个 modelprovider 模块，`loadFixture() → callModel() → 断言`。旧仓 `tests/regression/gateway.test.ts` 的 `activeStreamChunks` 模式即此范本。**不用 Mechanism B**（VCR `withVCR`，context-bound hash，不可跨仓分享——`src/services/vcr.ts`）。
- **层3（prompt 变化容忍）**：**消解，不要**。双跑前提是行为等价，开"预期差异清单"口子 = 给回归蒙混逃生阀。charter v0.6 是结构性重构（模块路径/状态归属/注册方式），非行为变更——prompt 变了说明重构泄漏行为变更，恰是红信号。唯一过滤 = 确定性噪声（时间戳类，与行为无关）；fixture replay 已冻 LLM 非确定性，噪声面极窄。行为变更（`CANN_PKG_VER` 改名等）走独立 pass 验证，不折进重构窗口。

### fixture 数量——风险驱动非覆盖率驱动

实证风险面（2026-09-21 grep）：`loop.ts` 1641 行 / 17 个 return/transition 分支（终态 10：completed×2/max_turns/prompt_too_long/image_error/model_error/stop_hook_prevented/blocking_limit/aborted_streaming/aborted_tools/hook_stopped；过渡 7：collapse_drain_retry/reactive_compact_retry/max_output_tokens_escalate/max_output_tokens_recovery/stop_hook_blocking/token_budget_continuation/next_turn）；`toolExecution.ts` 116 分支；`compact.ts` 117 分支。

**判断**：10-15 fixture 够不够的答案不是数字，是两个条件同时满足——①每个 fixture 锚定一个迁移风险分支（compact 链 2 / stop hook 链 2 / token 链 2 / abort 链 2 / 工具调度 3 / gelu 多轮 1 ≈ 12 白盒），happy-path 凑数不算；②黑盒覆盖 system prompt 段序列 + 工具注册列表。满足则 12-15 白盒 + 3-5 黑盒够；不满足（只覆盖 happy path）50 个也不够。非迁移高风险分支（model_error/image_error 等纯错误终态）不验。

### fixture 来源——旧仓测试即种子

E 白盒 fixture 矩阵 = 旧仓已有测试迁过来当种子，非新造：
- `tests/regression/gateway.test.ts` 12 个（streaming 7 + 非流式 2 + usage 映射 2 + healthCheck 1）
- `tests/integration/agent-loop.test.ts` 1 个（engine 主循环多轮工具调度）
- `tests/integration/gateway-json-schema.test.ts` 1 个（JSON schema 形状）
= **14 个 engine 行为等价 fixture**。E 和 F 在 engine 面上收敛——双跑机制是迁移这批测试时顺带做，非额外负担。

### 等价性基线脱耦 IFF 网关（v0.10 M3）

**问题**：旧仓 14 个 engine 种子测试中多个是 **live-gateway 门控**（`modelProvider.healthCheck` 可达才跑、不可达 skip）。若双跑等价性押在 live gateway 上，IFF 网关不可达时双跑跑不起来 = 等价性盲区。而 IFF 网关本身是 [ATLAS-HOLD] 待定案外部依赖——验证机制循环依赖待定案网关。

**解法**：14 种子测试的等价性判定分两层，**以层 1 为准**：

| 层 | 驱动 | 依赖 IFF？ | 角色 |
|---|---|---|---|
| **层 1 确定性等价** | fixture replay（旧仓录制 LLM 响应 fixture 喂新旧 engine，Mechanism A） | **否** | 等价性**基线**（必要条件） |
| 层 2 增量置信 | live gateway 真实响应 | 是 | 额外置信（nice-to-have） |

**Mechanism A 升格**：原 L5.1 层2 的 Mechanism A（纯 LLM SSE chunk，跨仓可分享）从「跨仓可分享范本」升格为**等价性层 1 基线**——双跑 diff 以 fixture replay 为准，IFF 不可达不影响等价性判定。live gateway 只作增量置信（网关可达时额外跑一轮真实响应比对，不可达时跳过不阻塞）。

**改动量小**：旧仓 `gateway.test.ts` 已有 `activeStreamChunks` fixture replay 范本；14 种子测试加 fixture-recorded 输入即可（接线工作非重新设计）。E 波 layer2 fixture 清单定全时，每个种子测试必须同时具备 fixture-recorded 输入（层 1）+ live-gateway 可选路径（层 2）。

> **v0.11 实测**：14 种子测试中 **12 个已脱耦**（gateway.test.ts 全用 `mock.module` + `activeStreamChunks` fixture replay，零 IFF 依赖，10 fixture 文件在 `tests/fixtures/gateway/`），仅 **agent-loop + gateway-json-schema 2 个** live-gateway 门控（`healthCheck` gate → skip）。脱耦工作量 = 2 个仿 gateway.test.ts L10-60 范本改 + A 波留档三件套时顺带录制 fixture。等价性基线已成立 86%。详见 `docs/execution-strategy.md` §5 R2。

## L5.2 · 测试迁移策略（F 裁定，v0.7）

旧仓基线（2026-09-21 全绿，锚点 `a8af45b`）：unit 82 文件 / 1024 pass / 0 skip；integration 10 文件 / 63 pass；regression 2 文件 / 15 pass；全量 99 文件 / 1109 pass；tsc 0。

### 四层处置

| 层 | 文件数 | 迁移方式 | 机制 |
|---|---|---|---|
| **unit** | 82 / 1024 | **co-located 随模块走**：测模块的文件跟模块同目录树，模块路径变测试跟着搬，一对一映射 | 机械（量大） |
| **integration A/B** | 7 | 策展契约（1）+ 知识层 L4（6）：路径串改 + skill 注册机制换（`registerBundledSkill`→`DomainPackage.skills`），断言不动，6 个同构模板化 | 模板化 |
| **integration C/D** | 2 | agent-loop（1）+ gateway-json-schema（1）：**并入 L5.1 E 白盒 fixture 矩阵**（和 gateway 回归 12 个同质，共验 engine 行为等价；v0.8 B 层③：C 波 B9 只落 port 契约 + in-memory 最小实现，**不迁这 2 文件**，真身维持本行裁定归 E） | 落入 E 机制 |
| **integration E** | 1 | web-bridge：**defer 到 D 波**（壳层，Phase 3 Web GUI 未决） | 本期不动 |
| **regression 行为型** | 12 | gateway 12 个：**迁移 + 兼作 E 白盒 fixture 种子**（改路径，断言不动） | 低 |
| **regression 不变量型** | 3 | import-gate 3 个：**文件死，职责转 eslint-plugin-boundaries**（f 裁定 A 波已 mand） | 消解 |
| **preload** | 1 | `preload-bunbundle.ts`：**弃**（d 裁定 + v0.8(a)：feature() 改 `shared/feature.ts` 普通模块且 A 波就位，内建模块可测性坑根除） | 消解 |
| **e2e** | 2 | 2 文件 hang in CI（需 PTY）：**fixture-driven headless 改造**（E 黑盒边界 diff 载体） | 中 |

### regression 三类细分（盘点实证，2026-09-21）

- **gateway.test.ts 12 个 = 行为型**：stream→message 映射、usage 不漏 NaN（锁 autocompact NaN 根因）、healthCheck 能用。新仓走同协议网关，必须照样 uphold。迁移 = 改 `mock.module` 路径串 + import 路径，**断言不动**。
- **orchestrator-import-gate.test.ts 3 个 = 结构不变量型**：守"import 落门面"边界纪律。charter v0.6 拓扑换了（orchestrator→engine、四域平铺、门面路径全变），且**已另选执法机制**（eslint-plugin-boundaries 全 error，f 裁定）。文件死，职责被 lint 层接管。
- **纯路径型 = 0 个**：15 个 regression 里无"守废弃代码路径"的。两类都有新仓落点。

### 三层无损定义补强（v0.7）

L5 三层无损定义里，"行为级 = 测试墙 all-pass"细化为：
- **unit**：co-located 随模块，B6 域单测全绿即验
- **integration**：A/B 模板化迁（C 波后 L4 接验证）；C/D 并入 E fixture 矩阵；web-bridge D 波
- **regression**：行为型迁为 E fixture 种子；不变量型转 lint
- **功能级**（gelu e2e + 双跑 diff=0）：双跑 fixture 锚定迁移风险分支，strict diff（仅噪声过滤，无 prompt 容忍）

## L6 · 验收、DoD 与剩余 open questions

### 三个硬验收点（质量门）

- **B6**：四域各自独立编译 + 域单测全绿（地基没拆坏）。feature() 自 A 波起为可测普通模块，feature-gated 分支（HISTORY_SNIP/CONTEXT_COLLAPSE 等）B6 起（域 unit 层）可测；双跑（engine 在场波次 C/E/D）渐进 diff 无不可测盲区
- **B9**：8 port 契约 + in-memory 最小实现（test-only）经 compose.ts 注入链落地 + 循环契约测试绿（88 处结构性丝理对了；agent-loop 真身行为等价归 E fixture 矩阵 strict diff 兜，B9 只证"注入链没接错"，v0.8 B 层③）
- **B13**：新仓 all-pass + gelu e2e（16 工具 L1）+ 双跑 diff=0（参照 = 旧仓 `a8af45b` 全绿基线）
- **B14（v0.6 新增）**：承重 5 规则（DEP-2/3、AUT-1/2、PRT-1）全绿验证（即四域自治三柱 ⊂ 5 规则：依赖洁净 + 状态自治 + 配置自治）——每域 grep 零向上 import（依赖洁净）+ 零寄生 store（状态自治）+ 配置入口单一（config.ts 存在且域外不直读该域配置）。lint boundaries 禁向上全 error。**执行时点（v0.8 B 层④）= C2 末**（B9 之后：8 port 落地 + 端口化完成，承重 5 条首次全可验；F 波 B13 只做回归复认）。

### Definition of Done（项目终点）

1. B13 绿
2. **B14 绿**（v0.6：承重 5 规则 DEP-2/3+AUT-1/2+PRT-1 全绿，即四域自治三柱 ⊂ 5 规则验证通过）
3. 新基线文档落盘（`docs/测试基线-v1.md`），与旧仓基线差集为空
4. 旧仓处置裁定执行（e 裁定：新仓稳定 4–8 周后 GitHub archive，只读不删）
5. 新仓 CI 四件套绿：lint 边界（DEP/STR/AUT/PRT/IDN 全 15，f+v0.6 裁定：lint 桶 A 波、grep 桶 B6 起、review 桶 D/F 波；v0.9 增 STR-4 shared 准入判据）+ tsc + test + build（含 bin/build 错配修复：`--compile` 出真二进制）
6. 边界回归为零：313 处反向 import 全清零或重定向到 ports/叶子（lint 可判定）
7. **四域可拔出验证**（v0.6）：modelprovider 可替换——接口对接 + config.ts 改数据源，状态/类型/逻辑不动，编译通过 + 测试绿
8. out-of-scope 显式：atlasoffice / Web GUI / TileLang/Triton 真实实现 / modelprovider 统一 LLM API / PI 式 external plugin / 远程日志 port（Phase 3，v0.9 C-4：本期不加第 9 port，shared I/O 叶子例外 = feature/identity/log）

### 已解决的 open questions（v0.3–v0.4 全部裁定）

- **a. ports 接口形状** → L4 定稿（8 port，窄字段 + compose 注入 + 四元 ascend-mount）
- **b. identity 注入机制** → 构建期 `--define` + `shared/identity.ts` 兜底，**不引入 IdentityPort**（身份串是静态常量非行为依赖，DIP 不适用）
- **c. 313 处丝分批** → L5 C1/C2 两段式，C1 叶子 225 先行，C2 按目标面 services→tools→Tool.ts→hooks→memdir→state
- **d. 测试框架搬迁** → feature() 保留但改 `shared/feature.ts` 普通模块（**import 换提前 A 波**，v0.8 B 层②(a)），**不需要 preload-bunbundle.ts**；域级 flag port 化，特性灰度保留，远程实验走 Port 8
- **e. 旧 AtlasHarness 仓库处置** → 迁移期冻结作参照，B13 绿后不立即归档，新仓稳定 4–8 周后 GitHub archive（只读不删）
- **f. lint 规则配置** → eslint-plugin-boundaries，8 element types，A 波全 error 无存量豁免
- **g. modelprovider 独立程度** → 四域平铺不独立包，singleton 保留，统一 LLM API out-of-scope
- **h. analytics/growthbook** → 分类拆分：growthbook port 化（Port 8）/ sanitize 下沉 shared / config 核查死代码
- **engine 归属** → 独立成根级模块（非 v0.2 的 core/engine/）
- **core 容器层** → 取消，四域平铺
- **组合根归宿** → 壳侧 compose.ts
- **port 归属** → 消费方模块（engine/ports/、modelprovider/ports/），非 shared
- **Executor 接口/实现** → 接口留 executor/，AscendExecutor 实现归 ascend/executor/
- **ascend 域包形态** → 方案 B（二进制内域包 + mount 挂载，知识/策展留市场）
- **PI external plugin** → 未来触发器（非现在做）
- **v0.5 问题1 modelprovider DAG 位置** → (c) engine 依赖四域向下合法，物理平铺 + 逻辑分层，DEP-1 措辞修正
- **v0.5 问题2 PRT-2 零模块级副作用** → (a) `let _x ??= create()` 懒单例允许，模块加载自注册禁止
- **v0.5 问题3 ascend skill 注册** → (a) DomainPackage.skills 挂载面注册，registerBundledSkill 仅给基础 skill，5 平行业务面 skill 非 foundation
- **v0.5 问题4 执行器/注册机制** → AscendExecutor 直走 execa 不经 sandbox；Executor+NpuToolchain 内部标准（行业标准不存在）；编译时 DomainPackage 注册 v1 + plugin/MCP 演进端口；Shape A/B 二分全行业实证
- **v0.6 四域自治模型** → 全四域+engine 做自治三柱（依赖洁净+状态自治+配置自治，用户裁定 A 一次到位）；engine 状态 β 不可变 EngineState store（fileHistory/attribution 从 AppState 挪入）；shared 保持纯叶子不含行为；四域全自治后"可独立 package"真正成立
- **v0.6 D SessionSnapshot 语义（被自治模型吸收）** → engine 状态模型定了，SessionSnapshot 只剩 5 配置投影字段 + view 语义，高频写状态全在 EngineState 不经 port；D 的 view/copy 之争消失
- **v0.7 E 双跑等价机制** → 三层定案：层1 白盒主（callModel+OrchestrationEvent 严格相等）+ 黑盒边界（SDKMessage type 序列 + system prompt 段序列 + 工具注册列表）；层2 Mechanism A（纯 LLM chunk 跨仓可分享，旧仓 gateway.test.ts 范本）；层3 prompt 容忍**消解**（strict diff，仅噪声过滤，行为变更走独立 pass）。fixture 风险驱动非覆盖率驱动（12-15 白盒锚定迁移风险分支 + 3-5 黑盒），旧仓 14 个 engine 测试即种子。双跑渐进 diff（仅 engine 在场波次 C/E/D；B 波跑四域 unit 绿非双跑——v0.9 时序修正）
- **v0.7 F 测试迁移策略** → 四层处置：unit co-located 随模块走；integration A/B 模板化迁（C 波后 L4 接验证）+ C/D 并入 E fixture 矩阵 + web-bridge defer D 波；regression 行为型迁为 E 种子（12）+ 不变量型转 lint（3）；preload 弃；e2e fixture-driven headless 改造。ascend 资产 vs L4 测试分波（E 波迁结构 / C 波后接验证）

### 剩余 open questions

**架构层无。Tier 2 全部裁定完毕。** Tier 3 五项中第3项（留档形式）已裁定（见 L5「A 波留档三件套」），余四项 + 两项实施期待办（均非架构 open question，实施时处理）：

- **Tier 3 第3项 留档形式**（已裁定，锚点已确认 `a8af45b`）：留档三件套（tag `atlascode-baseline-2026-09-21` + test-report.json + 黄金参照）定案，锚点 = 旧仓 HEAD `a8af45b`（2026-09-21 20:26，全量 99 文件 / 1109 pass / 0 fail / 0 skip）。
- **Tier 3 第1项 MACRO `--define` Bun 语法**（D 波）：方向已定（b 裁定 + IDN-1/IDN-2），细节（Bun `--define` 语法、配方文件组织、5 身份字段注入值）D 波实施时定。
- **Tier 3 第2项 gelu fixture 归属**（E 波）：gelu.ts 迁新仓后放 `ascend/e2e/` 还是 `atlascode/e2e/`，E 波实施时定。
- **Tier 3 第4项 品牌串预分类**（已裁定，v0.7）：全量预分类表落盘 `docs/brand-string-classification.md`（379 处/123 文件 = 分类规则快照，F 波前全仓 grep 重跑为权威清单；五类 + 五特判裁定）。特判1 ATLASHARNESS.md 迁移逻辑消解（删 memoryFileMigration.ts + 15 测试，A 波前用户手动清理 ~/.atlas/ 备份 settings json 后 archive）；特判2 代码 URL→AtlasCode repo / 注释 issue URL 保留旧仓 archive；特判3 atlasDesktop.ts 路径→AtlasCode Desktop（D 波核查死代码）；特判4 vault 新开 `16-AtlasCode` 目录（提取 latest 非拷贝，15-AtlasHarness 保留归档）；特判5 coordinatorMode.ts prompt 示例→AtlasCode repo。F 波按表机械替换。
- **Tier 3 第5项 C1 叶子分类**（C 波）：225 处叶子丝逐个分类（纯函数→shared / 带副作用→消费域 / 走 port），附录 C 的 30 个是样本非全量。C1 前置。
- **`CANN_PKG_VER` 归一**（实施期待办）：调研证实非 CANN 官方变量（所有官方文档/仓零命中），是 AtlasHarness 内部配置变量喂 `AscendConfig.cannVersion`，违反 `ATLAS_*` 单前缀规范。新仓归一改名（如 `ATLAS_CANN_VERSION`），或改探测 `ASCEND_HOME_PATH` / 读 `version.cfg`。
- **`auto_optimizer` 文档同步**（实施期待办）：已从 tools 仓迁移到 gitee msadvisor，旧仓 CLAUDE.md / ascend skill 描述需同步新路径。

后续如实施过程中暴露新问题，新增 open question 入议程。

## L7 · 命名三层

| 层 | 名 | 出现在哪 |
|---|---|---|
| 仓库/项目 | `AtlasCode` | `~/projects/AtlasCode/`、GitHub repo 名 |
| 对外品牌 | `AtlasCode` | TUI 启动横幅、`--version`、README 标题、二进制名、Release 名 |
| 内部机器标识 | `atlas`（短名） | env 前缀 `ATLAS_*`、类名 `Atlas*`、变量 `atlas*`、配置目录 `.atlascode` |

三层同词根。与 AtlasHarness 旧项目的"对外 AtlasHarness"区分——新项目对外品牌是 AtlasCode，内部机器标识仍用短名 atlas。

## L8 · 约束与规则（15 条权威 / 5 类，不可违反）

> **v0.8 统一裁定（B 层①）**：旧 L2「依赖规则」8 条 + 旧 L8「约束规则」7 条合并为单一权威清单——v0.8：8+7=15 条去重 = 14 条；v0.9 C-3 增 STR-4 → **15 条**（旧 L8 规则 1「单向依赖」并入 DEP-1…5 作细则展开、不再独立计数；旧 L2-6/7/8 升 STR-3/AUT-1/AUT-2 归入 L8）。全 charter 的 `规则 N` 引用统一改 **类目前缀 + 编号** ID（自解释、免疫重排：新增规则不影响旧 ID）。**单一事实源 = 本节**，L2/L3 不再另列规则条文。
>
> **三判定桶**（规则层稳定；lint 配置层 A 波定具体 eslint 选项，可演进）：
> - **① lint 桶**：eslint-plugin-boundaries + @typescript-eslint（f 裁定：CI A 波即上、全 error 无存量豁免；8 element types 配置 + `allowed-types` pattern 等具体选项 A 波定）。
> - **② grep / CI 脚本桶**：自定义 grep / 目录深度脚本（v0.6 三柱实证裁定；**域文件 A 波尚不存在，本桶门 B6 起才 CI 化**——B6 = 域绿门，三柱 grep 门必须此时进门，否则 B14 验收时三柱无机器判定）。
> - **③ review 桶**：人工 checklist（D/F 波 review；不造伪机器门）。
>
> **承重规则**（支撑 B14「可独立 package」验收，5 条须全绿）：**DEP-2、DEP-3、AUT-1、AUT-2、PRT-1**——四域全自治后"可独立 package"成立（modelprovider 可替换 = 接口对接 + config.ts 改数据源）。

### DEP · 依赖方向（lint 桶）

**DEP-1 · 单向无环**
`shared ← {sandbox, memory, executor, modelprovider, engine, ascend}`，shared 是唯一叶子（不 import 任何东西）。**engine 依赖四域（modelprovider/sandbox/memory/executor）向下合法**——engine 是应用层，四域是库级地基，engine→四域天经地义（v0.5 问题1c 裁定）。反向一次，lint 拦 + CI 红。
> 物理平铺（8 顶层目录：6 兄弟 sandbox/memory/executor/modelprovider/engine/ascend + shared 纯叶子 + atlascode 壳）+ 逻辑分层（engine 在四域之上）：物理结构反映"无父子容器"，逻辑依赖方向反映"应用层依赖库级"。两者不矛盾——平铺是目录组织，分层是依赖方向。
> 判定：lint 桶（`element-types`）· CI 门：A 波

**DEP-2 · 四域零向上**
四域（sandbox/memory/executor/modelprovider）**永不** import engine/ascend/atlascode（向上非法 → 地基零反向，每域可独立编译验证）。
> 判定：lint 桶 · CI 门：A 波 · **承重**

**DEP-3 · 域依赖洁净（三柱①依赖洁净）**
四域**只依赖 shared**（类型+纯函数+常量），不向上 import utils/services/entrypoints/constants（域自管的除外）。已知待斩断污染（L4.7 诊断）：memory → growthbook（碰网络）、modelprovider → entrypoints/settings-adapter、memory → memdir 实现细节暴露。
> 判定：lint 桶（`element-types` 禁向上）+ grep 桶（"只依赖 shared" grep 面）· CI 门：A 波（lint）+ B6（grep）· **承重**

**DEP-4 · engine 隔离**
engine **永不** import atlascode/ascend；碰宿主 concern（AppState、mcp 传输、lsp 进程、SessionMemory 存储、远程实验配置）**只经 port 接口**，不直接 import 壳类型。
> 判定：lint 桶 · CI 门：A 波

**DEP-5 · 挂载边（窄白名单）**
`atlascode → ascend` 仅 `mount.ts` 白名单（挂载边）；其余任何文件 reach ascend = lint 红（`allowed-types` pattern，A 波接线）。
> 判定：lint 桶 · CI 门：A 波

### STR · 结构（lint 桶 + 脚本）

**STR-1 · 门面收口**
每个 `index.ts` 是该模块**唯一公共出口**。域外代码 import 域内内部文件 = lint 红（`boundaries/no-private`）；port 接口经门面 re-export，外部从门面拿类型（如 engine 外部只许 `import { ... } from 'engine'`，不许 reach `engine/ports/sessionContext.ts`）。
> 判定：lint 桶 · CI 门：A 波

**STR-2 · 扁平优先**
每个域内部最多两级目录。要超过两层 = 职责该拆成兄弟，不是再往下钻。
> 判定：脚本桶——标准 eslint `max-depth` 管代码嵌套深度、非目录树深度，**A 波补一个目录深度 CI 脚本**（数每域路径段数）· CI 门：A 波（脚本）

**STR-3 · 组合根（唯一接线点）**
组合根在 `atlascode/compose.ts`（壳 import 四域门面造实例 + 启动 engine loop），全仓唯一接线点，所有 port 实现在此注入。
> 判定：review 桶（壳层结构约定）· CI 门：D 波 review

**STR-4 · shared 准入判据（防 grab-bag，v0.9 C-3）**
三硬判据（C1 每批下沉前过 checklist，review 桶）：① **纯度**——无副作用、不读域配置 env（域 env 归该域 config.ts，AUT-2）；有限例外名单 = feature.ts / identity.ts / log.ts（I/O 叶子例外，C-4，零项目内依赖不成耦合点）② **多域消费**——被 ≥2 域（或 domain+engine）消费的单一面才进 shared，单域私有留域内（判据只约束 C1 新候选，charter 已裁定项祖传豁免）③ **扁平**——shared 内部零子目录（STR-2 目录深度 ≤1），要分子目录 = 不是叶子，退回去。
> 判定：review 桶（C 波 C1 批次 review）· CI 门：C 波

### AUT · 状态/配置自治（grep 桶）

**AUT-1 · 状态自治（三柱②状态自治）**
域内状态自管（域内 store/实例字段/不可变更新），**不寄生壳 AppState/全局 let**（grep：域内无 `setAppState`/`getAppState`/域外 store 引用）。fileHistory/attribution 从 AppState 挪入 EngineState（不可变 set(f) 纯函数 store，同 AppState 同构，L4.7 β）。
> 判定：grep 桶（域文件 A 波尚不存在，**B6 起 CI 化**）· CI 门：B6 · **承重**

**AUT-2 · 配置自治（三柱③配置自治）**
每域一个 `config.ts` 收拢 env+settings 读取，域外不直接读该域配置（配置入口单一）。**配置优先级链（v0.9 C-5，审视后修正翻序）**：企业策略（MDM managed settings）> env（`ATLAS_*`）> settings.json（用户）> 代码默认——MDM 是合规最高权威，env 不得压企业策略；每域 config.ts 内部固定 policy→env→settings→default 解析顺序。
> 判定：grep 桶（配置入口单点检查）· CI 门：B6 起 · **承重**

### PRT · 端口与副作用（命脉）

**PRT-1 · 端口/实现分离（命脉）**
port 接口定义归消费方模块（engine/ports/、modelprovider/ports/），实现归提供方（壳/ascend），启动时经 compose.ts 参数注入。这是整个方案能否成立的命脉——它把 313 处反向依赖的目标状态定死：engine 不许直接碰壳的 AppState，只许碰 port 接口。
> **连带收益（d 裁定，三层分离）**：扩展点机制替代**域级** feature() flag（domain-mount 承担域边界）；特性灰度 flag 保留但实现改 `shared/feature.ts` 普通模块（非 bun:bundle 内建）——顺带解掉旧仓 `bun:bundle feature()` 测试中恒 false 不可测的坑。远程实验配置（growthbook）走 Port 8。三层 feature 机制各司其职，不再混在 `bun:bundle feature()` 一个机制里。
> **v0.6 自治三柱实证化**：port 分离不再只是抽象原则，有 grep 可判定的验证标准——见 L4.7 + L8 DEP-3/AUT-1/AUT-2（依赖洁净/状态自治/配置入口单一）。
> 判定：lint 桶（engine→壳只经 port）+ grep 桶 · CI 门：A 波（lint）+ B6（grep）· **承重**

**PRT-2 · 零模块级副作用**
顶层禁止模块加载时自注册语句（顶层 `registerXxx()` 调用）。所有状态、所有 port 注册，经 compose.ts 显式注入。
> **lazy-init 豁免（v0.5 问题2a 裁定）**：`let _x ??= create()` 懒单例**允许**——首次访问才造实例、模块加载时无副作用、可在测试中替换。modelprovider 的 `lazyProxy(getModelProvider)` / `getCoreDependencies` 懒单例模式合规。判定标准：模块 import 时是否**执行了注册/赋值动作**。`let _x: T | undefined`（仅声明）= 合规；`let _x = create()`（加载即造）= 违规；`_x ??= create()`（访问才造）= 合规。
> 直接预防旧仓库 `errorMessaging` 自注册坑：现机制为 `core/modelprovider/errorMessaging.ts` 顶层 `let ports` 注册表 + 守卫 `p()`（未注册即调 resolver 才 throw）+ `utils/apiErrors.ts:116` 顶层语句注册。新仓库从纲领层不让长这丝。
> 判定：lint 桶（`no-restricted-syntax`）· CI 门：A 波

### IDN · 身份与产品（build `--define` + review）

**IDN-1 · 身份注入，不硬编码**
配置目录名（`.atlascode`）、bin 名、产品名、User-Agent 等身份串，经 `shared/identity.ts` **构建期 `--define` 注入**（VERSION/PRODUCT_NAME/PRODUCT_BRAND/PACKAGE_URL/FEEDBACK_CHANNEL，atlascode 配方 vs atlasoffice 配方不同值），不写死在 engine/四域——否则 atlasoffice 拿到的 engine 还写着 `.atlascode`。
> **b 裁定方案**：`shared/identity.ts` 普通模块 export 身份常量，构建期 `--define` 注入实例值，运行期所有模块 `import { VERSION } from 'shared/identity'`。MACRO 本意是 build-time macro，旧仓退化成运行时 `globalThis` 赋值（`main.tsx:11`）是 bug，`PACKAGE_URL`/`FEEDBACK_CHANNEL` 运行时 undefined 是症状——新仓一次性根治回设计意图。配置目录名保持 env 覆盖（`ATLAS_CONFIG_DIR`/`ATLAS_CONFIG_DIR_NAME`，已实现不动）。
> 判定：review 桶（硬编码身份串检查）· CI 门：D 波（壳层）+ F 波

**IDN-2 · 一个进程一个产品**
不预埋运行时产品开关（不要 `if (product === 'office')`）。产品差异靠**不同目录 + 不同构建配方**，不靠 flag 污染共享代码。AtlasCode 和 AtlasOffice 是两份构建，不是一份代码里的两个分支。
> 判定：review 桶（产品分支扫描）· CI 门：D/F 波 review

## L8.1 · 冻结层清单（v0.7 裁定——旧仓"冻结"概念在新仓重判）

旧仓 CLAUDE.md 列四项"冻结层"（WIRE / URL / MDM / 物理路径）——"冻结"在旧仓指**不能改**（有外部依赖/协同未定）。新仓是全新产品，每项重新判定：**解冻（改）/ 消解（删）/ 延续冻结（carry HOLD）**。不重判则机械迁过去，该解的没解、该换的没换，冻结概念被错误继承。

### 四项重判

| 旧仓冻结项 | 旧仓冻结原因 | 新仓重判 | 处置 |
|---|---|---|---|
| **WIRE 协议常量**（`src/constants/wire.ts`：WIRE_API_VERSION / WIRE_CCR_BYOC_BETA / WIRE_ENVIRONMENTS_BETA / WIRE_OAUTH_BETA / WIRE_FILES_API_BETA + CLAUDE_AI_INFERENCE_SCOPE / USER_PROFILE_SCOPE） | 主链路已走 OpenAI 协议 IFF 网关；WIRE 标识符只存于 remote/cloud 子系统（teleport/CCR/bridge/filesApi/云会话，默认 feature 关闭），服务端协议未与国内网关协同定案 | **延续冻结（缩面）**：22 消费文件分两群——bridge 群 7（Web GUI Phase 3，D 波壳层，在 charter 范围）保留，WIRE 常量 carry 为 [ATLAS-HOLD]；非 bridge 群 15（teleport/CCR/remote sessions/filesApi/mobile/managedMcp/policyLimits，不在资产保留清单）随 F 波死代码清理消解。WIRE 常量不删（bridge 还用），消费面 22→7 |
| **claude.ai URL endpoints**（`constants/oauth.ts`：BASE_API_URL=api.anthropic.com / CLAUDE_AI_ORIGIN=claude.ai） | 同 WIRE——OAuth/1P-REST 服务 URL，服务于同一批 remote/cloud 子系统；主 LLM 链路走 IFF 网关不碰 | **延续冻结（随 WIRE）**：bridge 群保留为 [ATLAS-HOLD]（bridge 的 claude.ai 服务 URL 待 IFF 网关域名定案），非 bridge 群消解。oauth.ts 两常量不删（bridge 还引用），消费面缩 |
| **MDM registry key**（`mdm/constants.ts`：`HKLM/HKCU\SOFTWARE\Policies\AtlasHarness`） | 旧仓有已部署 MDM profile 依赖键名，改名 profile 失效 | **解冻（改）**：新仓是全新产品，无已部署 profile 依赖（个人开发者项目，MDM 是 Claude Code fork 继承的企业代码）；macOS 域已是 `com.atlas.atlas`，Windows key 仍 `AtlasHarness` 不一致。→ `Policies\AtlasCode`（D 波壳层，和 atlasDesktop.ts 特判3 同批） |
| **物理路径**（`/home/vince/projects/AtlasHarness`） | 旧仓 checkout 就在此路径 | **已解冻**：品牌串分类③已定 → `/home/vince/projects/AtlasCode`（~73 处随 tests 迁移波次机械换） |

### [ATLAS-HOLD] 标记全貌（18 处 / 14 文件，v0.7 裁定：延续 HOLD 姿态）

grep [ATLAS-HOLD] = **18 处 / 14 文件**（2026-09-21 实测，原记 ~10 处遗漏近半）。分三群：

- **群① 四项重判源头常量（4 处 / 2 文件）**——WIRE/URL 常量定义本身，已被上文四项重判表覆盖，不另作单独决策。
- **群② carry HOLD（5 处 / 5 文件）**——在 charter 范围内，待 IFF 网关/国内端点定案。
- **群③ 决策2 非Bridge 子系统（9 处 / 7 文件）**——疑似死代码消解池，F 波逐模块判。

决策3 裁定：**延续 HOLD**——IFF 网关域名是国内基础设施决策，超出 charter 架构层范围，且旧仓主链路已走 IFF 网关证明 HOLD 不阻塞核心功能。群②五处 carry HOLD，标注"待 IFF 网关/国内端点定案"，不急着解。

| 群 | 文件 | HOLD 内容 | 处置 |
|---|---|---|---|
| ① 源头 | `constants/wire.ts:9` | WIRE 常量改法说明 | **四项重判表已覆盖**（WIRE 项，缩面 bridge 群 carry） |
| ① 源头 | `constants/oauth.ts:20,30,52` | BASE_API_URL / CLAUDE_AI_ORIGIN domain swap | **四项重判表已覆盖**（URL 项，缩面 bridge 群 carry） |
| ② carry | `model/providers.ts:6` | IFF 网关国内域名 | **carry HOLD**（modelprovider 在范围，网关域名待定） |
| ② carry | `components/Feedback.tsx:523` | 反馈收集端点 `ATLAS_FEEDBACK_URL` | **carry HOLD**（Feedback 在范围，国内端点就绪后配） |
| ② carry | `tools/WebFetchTool/utils.ts:181` | 域黑名单端点 `ATLAS_WEB_DOMAIN_CHECK_URL` | **carry HOLD**（WebFetch 在范围） |
| ② carry | `bridge/codeSessionApi.ts:15` | WIRE version 头 | **carry HOLD**（随 bridge 群） |
| ② carry | `bridge/remoteBridgeCore.ts:72` | anthropic-version 头 | **carry HOLD**（随 bridge 群） |
| ③ 决策2 | `upstreamproxy.ts:47,114` | api.anthropic.com 兜底 | **F 波逐模块判**（可能死代码；归决策2 消解池） |
| ③ 决策2 | `commands/mobile/mobile.tsx:15` | 移动应用商店链接 | **F 波逐模块判**（mobile 不在范围，归决策2） |
| ③ 决策2 | `services/api/filesApi.ts:23,33` | WIRE beta 指向 + api.anthropic.com 兜底 | **F 波逐模块判**（filesApi 归决策2 消解池） |
| ③ 决策2 | `vendor/atlas-agent-sdk.ts:5` + `missing-deps.d.ts:155` | `@anthropic-ai/claude-agent-sdk` 包名 | **F 波逐模块判**（SDK vendor 归决策2） |
| ③ 决策2 | `vendor/atlas-mcpb.ts:4` | `@anthropic-ai/mcpb` 包名 | **F 波逐模块判**（vendor 归决策2） |
| ③ 决策2 | `vendor/atlas-sandbox-runtime.ts:6` | `@anthropic-ai/sandbox-runtime` 包名 | **F 波逐模块判**（vendor 归决策2） |

### 决策2 裁定（非 bridge 远程子系统）

非 bridge 远程子系统（teleport / CCR / remote sessions / filesApi / mobile / upstreamproxy / SDK vendor）疑似死代码消解池。**暂不确定**——未深入调查代码，F 波逐模块决策清理。本清单标"F 波逐模块判"，不在架构层强行消解/保留。

### 修正：品牌串分类表 MDM 判定

品牌串分类表（`docs/brand-string-classification.md`）原标 MDM key 2 处"④ 真冻结→不动"——**修正**：旧仓视角"不动"对新仓不成立（新仓无已部署 profile 依赖）。MDM key → **解冻改 `Policies\AtlasCode`**（D 波，特判3 同批）。品牌串分类表"④ 真冻结"从 2 处 → 0 处（新仓无真冻结品牌串）。

## L9 · 跨平台与一键安装

- **开发**：`bun dev --watch`，Windows/Ubuntu/macOS 一致
- **分发**：`bun build --compile --target=bun-{windows-x64,linux-x64,darwin-arm64}` 各出**单文件二进制**——用户下载即用，不需装 Bun/Node
- **跨平台要点**（代码层）：`path.join()` 不拼 `/`、shell 走 PowerShellTool、配置目录用 `envPaths`、临时目录 `os.tmpdir()`——旧代码已做（`cachePaths.ts:6` 已为 `envPaths('atlas')`；临时目录名已动态化 `${getConfigDirName()}-${uid}`），新仓继承
- **修旧 gap**：旧仓 bin 声明 `dist/cli.js` 但 build 只产 `main.js`（2026-09-20 复核确认仍未修）——新仓直接 `--compile` 出真二进制，一步到位
- **CI**（后期）：GitHub Actions 矩阵出三平台二进制，挂 GitHub Release（对齐"仅 GitHub 渠道"）

## L10 · 参考项目理念对照（仅理念，功能无损于 AtlasHarness）

- **pi (earendil-works, TS)**：扁平按关注点拆包；可变部分（provider/sandbox/session-backend）走 extension point 不焊 loop；modelprovider 独立成包。**借鉴点**：扁平 + extension point + 壳/库分层。**不借鉴**：workspaces 多包、独立发版、external plugin（时机未到，见 L4.5 触发器）。
- **openwork (powered by opencode)**：`apps/`（壳）vs `packages/`（库）物理分层；`ee/` 产品变体。**借鉴点**：壳/库分层。**不借鉴**：多包。

## 附录：关键事实依据（2026-09-21 复核快照）

**核心边界**：
- `src/core/` = 四域（sandbox/memory/executor/modelprovider）+ `factory.ts` + `orchestrator/`（36 个 .ts + README）；`QueryEngine.ts` / `query.ts` 已在 `core/orchestrator/` 内
- core→services 反向依赖 **100% 集中在 orchestrator**（12 文件）：analytics/growthbook（12 处调用）、api/*（client/logging/metadata/promptCacheBreakDetection/withRetry/dumpPrompts/tokenUsage）、mcp/*（client/utils/normalization/mcpStringUtils/types）、SessionMemory、tokenEstimation、autoDream、PromptSuggestion、lsp/manager。**四域+factory 仅 memory→growthbook 一处反向**（L4.7 已诊断→C 波 Port 8 斩断，其余零反向）。
- 反向 import 全量 **313**（点名 88 + 叶子 225）；**v0.11 实测**：grep 复现 307（~2% 差，口径微调可对齐，非估算），**85% 集中 engine（orchestrator 261 处），四域仅 46 处（15%）**——C 波本质是 engine 单模块重构非均匀大工程，详见 `docs/execution-strategy.md` §5 R1
- AppState 焊点：`QueryEngine.ts:135-136`（`getAppState/setAppState` 为 `QueryEngineConfig` 硬字段）+ 10+ 消费点；**engine 只消费 5 个顶层字段**（toolPermissionContext / mcp.{tools,clients} / effortValue / advisorModel / tasks）
- errorMessaging：`core/modelprovider/errorMessaging.ts`；注册点 `utils/apiErrors.ts:116`；throw 语义 = 未注册即调 resolver 才 throw
- `sandbox/compat.ts:9` → `../factory.js` 静态反向边（B 波前置清掉）
- 散落 `new FileSystemMemoryStore` = 3 文件 × 2 处 = 6 处
- modelprovider type-only 泄漏（全部 import type，运行时零耦合；逐文件清单见附录 C，计数口径随 import 形式而异不单列硬数）
- `factory.ts:120 createCoreDependencies` 唯一组合根；`modelProvider` 构造在 `modelprovider/index.ts:55` 懒单例

**identity / feature / analytics（b/d/h 裁定依据）**：
- MACRO 赋值点 `main.tsx:11`：`(globalThis as any).MACRO = { VERSION: '0.0.1' }`——运行时退化赋值，只赋 VERSION
- `PACKAGE_URL`/`FEEDBACK_CHANNEL` 被引用（117 处消费，39 文件）但**从未赋值** → 运行时 undefined（`doctorDiagnostic.ts:220` 有 `!== 'atlas'` 守卫）
- build 脚本 `bun build src/main.tsx --outdir dist --target node`——**没有 `--define`**，MACRO 全靠运行时 globalThis
- 配置目录名 `configDir.ts:4` `.atlas`（已有 `ATLAS_CONFIG_DIR`/`ATLAS_CONFIG_DIR_NAME` 双 env 覆盖）
- User-Agent 集中在 `userAgent.ts`，但 `marketplaceManager.ts:1283` 硬编码 `'Atlas-Plugin-Manager'`
- feature() 调用点 **≈575 代码行处**（75 个 unique flag；2026-09-22 复测：单引号原始 598 / 代码行 575 / 含双引号 622；v0.8 记 586 复现不了 → **迁移时重新推导、不写死**）。import 拆分：**172 文件** import feature——127 经 `bun:bundle` 内建 + 45 经 F5 shim 相对路径（`./native-ts/bunBundle.js`），**换 import 须覆盖两种形态**
- `preload-bunbundle.ts` = `mock.module('bun:bundle', ...)` stub，存在理由就是 stub 掉内建模块（内建模块 mock.module 无法真正覆写，旧仓可测性坑根因）
- `native-ts/bunBundle.ts` 是 F5 源码直跑模式另一套桩，双轨制
- analytics 三文件：`growthbook.ts`（远程 A/B 实验配置，碰网络+磁盘缓存，12 处调用）、`metadata.ts`（`sanitizeToolNameForAnalytics` 纯函数但 import feature()）、`config.ts`（遥测配置，遥测已删疑死代码）

**ascend 域**：
- 16 工具 + 5 运行时 skill（generate/validate/debug/optimize/modelAdapt）+ prompt + AscendExecutor
- 5 skill 的 `allowedTools` 硬引用 16 工具名 + 每个调 `getCoreDependencies().ascendExecutor`（强耦合单元）
- 6 知识技能 + 18 策展 wrapper 已在 `atlas-plugins` 市场仓（`a256f33`，2026-09-20 移出二进制）
- AscendExecutor 实现 `Executor` + `NpuToolchain`，`commands` 映射全是 CANN 工具链（bisheng/atc/msprof/...），ascend 专属非通用
- 16 工具 import：`Tool.js`×16、`utils/lazySchema.js`×16、`utils/permissions/PermissionResult.js`×13、`core/factory.js`×12、`core/executor/types.js`×12、`core/executor/AscendExecutor.js`×12

**外围机制**：
- feature() 桩 = `native-ts/bunBundle.ts:35` 运行时 env 桩（34 行是注释、声明在 35 行）；75 flag；3 条解析路径（`ON_BY_DEFAULT=[TRANSCRIPT_CLASSIFIER, COORDINATOR_MODE]`（2 项，73631df 翻转）、`ATLAS_DEV_FEATURES`、`'false'` 优先）
- `feature('ASCEND_TOOLS')`（`tools.ts:122`）门控 16 工具
- 配置目录：`ATLAS_CONFIG_DIR`（全路径）+ `ATLAS_CONFIG_DIR_NAME`（仅名），默认 `.atlas`；legacy 回退已删
- bin= `dist/cli.js` vs build 产 `main.js` 错配仍在
- `MACRO` = `main.tsx:11` 运行时赋值（退化）；`PACKAGE_URL`/`FEEDBACK_CHANNEL` 未赋值 = 运行时 undefined
- 缓存 `envPaths('atlas')` 已完成；临时目录动态 `${getConfigDirName()}-${uid}`
- **lint**：旧仓零 eslint 配置（无依赖、无配置文件），边界强制是新仓从零建的能力

**测试基线**（2026-09-21，全绿，Pre-Step 0 已满足，锚点 SHA `a8af45b`）：
- unit 82 文件 / 1024 pass / 0 fail / 0 skip（含 3 coordinator 门控文件：agent-tool-depth 4 / agent-tool-fanout 8 / coordinator-worker-agent 5）
- integration 10 文件 / 63 pass / 0 skip（含 18 策展 wrapper 离线契约 + 4 业务面 L4 A/B）
- regression 2 文件 / 15 pass
- 全量 isolated-process run = 99 文件 / 1109 pass / 0 fail / 0 skip（unit 82 + integration 10 + regression 2 + tui probes 2 + full-feature probes 1 + e2e 2）
- `npx tsc --noEmit` 0
- 双跑参照物 = 本基线（checkout tag `atlascode-baseline-2026-09-21`）

**品牌串**：`AtlasHarness`（case-sensitive）/ `atlasharness`（case-insensitive）。**数字口径警示**：预分类表记 379 处/123 文件（v0.7 快照），但 raw grep（`grep -rl 'AtlasHarness'` 排除 node_modules/dist/.git/ascend-official/tests/fixtures，2026-09-21 实测）≈ **235 文件**，高于表内 123——**预分类表是分类规则快照，非完整文件枚举**（未枚举全部命中文件）。**F 波执行前必须以全仓 `grep -rl 'AtlasHarness'` 重跑为权威清单，预分类表仅作五类 + 五特判的分类规则参照，不是文件枚举基线**。原记 145/62 仅覆盖 src/ .ts/.tsx/.js 代码 scope = 146/63。预分类表见 `docs/brand-string-classification.md`——五类：①对外品牌文本→AtlasCode（~108）②文档/注释→AtlasCode（~172）③物理路径→换 `/home/vince/projects/AtlasCode`（~73）④MDM key→D 波改 `Policies\AtlasCode`（2，冻结层重判后非真冻结）⑤特判点（5 项已裁定）。新仓零真冻结品牌串。

## 附录 B：执行器/注册机制调研依据（v0.5 问题4 支撑）

两份调研报告支撑决策4，源码级 + 四厂商交叉验真（调研日期 2026-09-21）。

### 调研一：CANN 工具链安装与调用形态

**来源**：本地官方克隆仓源码级证据（`ascend-official/` = github.com/Ascend 镜像 + `ascend-skills-gitcode/` = gitcode.com/Ascend/agent-skills）。无臆造。

**关键发现**：
1. **安装**：从 OBS 下载 `.run` 自解压包执行（非 apt/rpm），`source set_env.sh` 注入 `ASCEND_HOME_PATH`/`LD_LIBRARY_PATH`/`PATH`/`PYTHONPATH`。8.5.0+ 路径从 `ascend-toolkit/` 变 `cann/`。
2. **调用形态高度统一——全是子进程**：16 工具无一需要进程内库嵌入。CLI 二进制（bisheng/atc/msame/msprof/npu-smi）+ Python 模块/脚本（ais_bench/img2bin/msquickcmp/msaicerr）+ pip entry_points（ada/ada-pa）+ shell 脚本（npucollect.sh）。连 ais_bench 有 Python API(`InferSession`)也有 `python3 -m ais_bench` CLI 等价物。→ execa 子进程 spawn 是正确抽象。
3. **复杂性在 env 编排不在调用**：工具能跑的前提是 set_env.sh 变量装配 + 版本路径探测——这正是 AscendExecutor 的职责。
4. **硬件依赖逐工具二分**：atc/bisheng/msprof-op-simulator/img2bin/cycle_search 无硬件可跑；msame/ais_bench/msprof(非simulator)/npu-smi/npucollect/msquickcmp 需 NPU。硬件访问走 `/dev/davinci*` + 驱动库挂载（容器 mount 层，非代码层）。
5. **npu-smi 属驱动包非 CANN**：容器里从宿主机 `-v` 挂载，在 `/usr/local/sbin`。
6. **勘误**：`CANN_PKG_VER` 零命中（非官方变量）；`auto_optimizer` 已迁 gitee msadvisor。

### 调研二：NPU 厂商工具链集成模式（业界对照）

**来源**：4 路并行子代理 + 主线 curl 独立验真（github API / PyPI JSON API / 厂商官方 docs / gitcode / modelcontextprotocol.io / openxla xla 仓源码）。覆盖 NVIDIA / Cambricon / Intel+Gaudi / AMD 四厂商 + 6 个标准规范。

**关键发现**：
1. **所有厂商工具链统一二分为 Shape A（CLI）/ Shape B（Python 库）**——非 Ascend 独有，全行业通用形态。AtlasHarness 的 Shape A/B 二分有全行业实证支撑。
2. **无任何厂商定义"标准工具接口"（工具 CLI 契约）**——只有编程模型标准（SYCL）、运行时 API 标准（Level Zero）、编译 IR 标准（PJRT/MLIR/Triton）。atc/bisheng/nvcc/cncc/icpx/hipcc 各有各的 CLI 形态，无共享契约。
3. **业界 agent 集成硬件工具的统一模式 = Skills 送知识 + 通用 Bash 做执行**。NVIDIA DeepStream Coding Agent / TensorRT 5 官方 `.agents/skills/` / CUDA-Agent 全走此路。**无任何 agent 框架有 typed 的 CUDA/NPU Tool wrapper**。
4. **Cambricon NeuWare 与 CANN 1:1 结构对称**（cnmon≡npu-smi / cncc≡bisheng / cnperf≡msprof / cngdb≡msdebug / torch_mlu≡TorchNPU / MagicMind≡atc+推理引擎）。同为私有垂直整合栈，逐层对应。→ 加 Cambricon 域包可平移 Shape A/B + NpuToolchain + 四插桩点。
5. **MCP 是唯一 agent-工具标准协议**，但当前无厂商把硬件 CLI wrap 成 MCP server（NVIDIA CUDA MCP 仅文档 RAG）。PJRT 是"硬件后端注册进 ML 框架"的标准（非 agent 工具层），注册模式（plugin_names.h + 动态/静态注册）可借鉴。
6. **AtlasHarness 当前设计比业界先例更结构化**——业界还在"skill 知识 + 通用 shell"阶段，AtlasHarness 已做到 typed executor 返证据 + fixture 双轨 + L4 eval。

### 调研结论对架构的含义

- **AscendExecutor 直走 execa 不经 sandbox = 正确**（调研一证实全子进程 + env 编排是核心职责）。
- **Executor + NpuToolchain 内部标准 = 唯一可行路径**（调研二证实行业标准不存在）。
- **编译时 DomainPackage 注册 v1 = 合理**（当前单域包，不引入动态注册安全门控复杂度）。
- **plugin 动态注册 + MCP 演进端口 = 正确占位**（调研二证实 MCP 是值得关注的协议，PJRT 注册模式可借鉴，但当前均无硬件工具实例）。
- **多厂商扩展可平移**（调研二证实 Cambricon 结构对称，NpuToolchain 接口 + 四插桩点可复用）。

## 附录 C：四域自治诊断快照（v0.6 L4.7 依据）

**诊断方法**：grep 四域向上 import（`from '../...'` 跳两层以上），2026-09-21 实证。

### 四域外部依赖目标全量（30 个，去重）

**① 纯类型/常量（13，应下沉 shared）**：
`types/atlas.js`、`types/message.js`、`Tool.js`（类型部分）、`constants/apiLimits.js`、`constants/betas.js`、`utils/systemPromptType.js`、`utils/thinking.js`、`utils/effort.js`、`utils/envValidation.js`、`utils/envUtils.js`、`utils/platform.js`、`utils/format.js`、`utils/permissions/PermissionRule.js`

**② 带行为 utils（12，域自管 or shared 工具）**：
- executor 自管：`utils/Shell.js`、`utils/ShellCommand.js`、`utils/shell/shellProvider.js`
- shared 工具（纯函数部分）：`utils/fsOperations.js`、`utils/readFileInRange.js`、`utils/path.js`、`utils/debug.js`、`utils/errors.js`
- sandbox 自管：`utils/ripgrep.js`
- shared 类型 + port 实现：`utils/settings/{constants,types,settings}.js`（3 个）

**③ 跨域污染（5，必须斩断）**：
- `services/analytics/growthbook.js` → memory 直连（碰网络，违反 PRT-1）→ Port 8
- `memdir/paths.js`、`memdir/teamMemPaths.js` → memory 实现细节外暴露 → 收进域内
- `config/settings-adapter.js` → modelprovider/roles 直连 → 走 port
- `entrypoints/agentSdkTypes.js` → modelprovider 依赖入口点类型 → 下沉 shared

### 各域依赖面（逐域）

- **modelprovider**（12+ 跨域）：errorMessaging（apiLimits/betas/agentSdkTypes/atlas/message/format）、errorUtils（atlas）、index（envValidation）、modelErrors（agentSdkTypes/atlas）、modelprovider（message/debug/systemPromptType）、params（Tool/message/effort/systemPromptType/thinking）、queryWithRoleFallback（message/systemPromptType/thinking）、roles（settings-adapter）、streamAssistant（Tool/message/systemPromptType/thinking）
- **sandbox**（5 文件）：createSandboxManager（debug/errors/permissions/platform/ripgrep/settings×3）、compat（settings 直连，待清）、pathResolve（path/settings）、types（platform/settings×2）
- **memory**（2 文件）：FileSystemMemoryStore（fsOperations/readFileInRange）、MemoryConfig（**growthbook 直连**/envUtils/memdir×2）
- **executor**（1 文件）：ShellExecutor（Shell/ShellCommand/shellProvider）——自治度最高

### engine 状态三处分散（fileHistory 为例）

- 类型+逻辑：`utils/fileHistory.ts`（fileHistoryTrackEdit/fileHistoryMakeSnapshot/MAX_SNAPSHOTS=100 硬编码）
- 状态存储：`state/AppStateStore.ts` 的 `fileHistory` 字段
- 调用：`QueryEngine.ts` import utils 函数 + `setAppState` 改状态（378/387/476/641 四处 set，字段是 fileHistory/attribution，**不在 charter v0.5 说的 SessionSnapshot 5 字段里**）
- 配置：`fileHistoryEnabled()` 读 `getGlobalConfig().fileCheckpointingEnabled` + 3 env（ATLAS_DISABLE_FILE_CHECKPOINTING/ATLAS_ENABLE_SDK_FILE_CHECKPOINTING，非交互分叉）

### charter v0.5 Port 1 消费点勘误

v0.5 写"engine 内 10+ 消费点（loop.ts:538/638/657、stopHooks.ts:171、toolHooks.ts:48/175/402、compact.ts:390、toolExecution.ts:610/783）机械替换"——**实际 grep 这五文件零命中** getAppState/setAppState。真实消费：QueryEngine.ts（1 读 272 + 4 set）+ 经 ToolUseContext 传工具。迁移面比 v0.5 说的窄。v0.6 L4.7 EngineState 模型已吸收此勘误。
