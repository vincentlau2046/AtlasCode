# 序 7 S3 归位波工单（拆二波：S3a 0.1.103 整域搬移 + S3b 0.1.104 逐文件判定（2026-11-12 顺延勘误：0.1.102 让位 P0 插入波，账面见 P0 工单 §6.5））——tui 三混域 kernel/壳归位

> 状态：`draft → 波前审视 → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-12）。
> 上游：步 0 零码盘点 `docs/2026-11-12-step0-zero-code-inventory.md` @83f2f984（§1 三混合域 >20 项风险成立）；0.1.101 五段闭环终态（序 6 ✅）。
> 依据：charter L1「单包+目录即边界」+ L4.5 拆包触发器——归位 = 多产品拆包的结构前置，非行为变更。

## §0 波前审视（活码实核 @ master 6151e6dd，f4 2026-11-12）

### 0.1 关键定谳：import 层边界已净——归位性质 = 结构性搬移

f4 双轮 grep 实锚（basename 宽匹配 144 命中 → 严格跨域 specifier 匹配复核）：

- **非 tui 代码对 `tui/utils|services` 的真实 import = 0**；宽匹配命中全为 engine 内部同名相对导入误报（`./log`/`./json`）+ 注释引用（compactPorts/ripgrep 双实现漂移已修面）。
- 结论：**S3 不存在活的边界违例要修**；归位 = 把 kernel 语义模块从壳目录搬到 kernel 目录，为 L4.5 拆包（「目录即边界」）与产品分野（atlasoffice 不带 atlascode 壳逻辑）做结构前置。**全程零行为变更**（机械搬移 + import 路径重写），判据口径 = canon 零差 + 字面清单零漂移 + 双平台零差。

### 0.2 三混域子域卷积实数（wc 实测 @6151e6dd）

| 域 | 子域 | 行数 | 初判 | 依据 |
|---|---|---|---|---|
| utils | plugins/ | 22,799 | **拆分域**：loader/schemas/validatePlugin/installedPluginsManager/mcpPluginIntegration = kernel 框架；marketplaceManager/installCounts/officialMarketplaceStartupCheck/zipCache = 产品清单面（charter：marketplace 框架 kernel/清单产品参数化） | S3b 细判 |
| utils | bash/ | 12,288 | **kernel**（bashParser/ast/commands/heredoc/ShellSnapshot/treeSitterAnalysis——解析器无壳语义） | S3a 整域 |
| utils | permissions/ | 9,482 | **kernel**（yoloClassifier/bashClassifier/filesystem/PermissionRule——与 engine 门分类器同域，0.1.27 先例） | S3a 整域 |
| utils | hooks/ | 4,023 | **kernel**（hookEvents/fileChangedWatcher/execAgentHook——hook 机制非壳面） | S3a 整域 |
| utils | settings/ | 3,464 | **kernel**（settings.ts/mdm/changeDetector——configDir 已 shared 同族） | S3a 整域 |
| utils | shell/ | 3,027 | **kernel**（shellProvider/readOnlyCommandValidation/outputLimits——executor 消费面） | S3a 整域 |
| utils | swarm/ | 2,674 | **kernel**（swarm 遗留 + permissionSync/teamHelpers；teammateMailbox.ts 1,286 顶层同族——登记债面） | S3a 整域 |
| utils | telemetry/ | 2,550 | **kernel**（perfettoTracing/sessionTracing——零真实遥测基线，基建非壳） | S3a 整域 |
| utils | nativeInstaller/ | 2,445 | **kernel**（installer/pidLock——安装基建；更新通道产品参数化 = 后步，搬移不参数化） | S3a 整域 |
| utils | powershell/ | 2,305 | **kernel**（parser——shell 解析同族） | S3a 整域 |
| utils | computerUse/ | 1,717 | **疑**（executor/setup——ascend 工具域邻接，与 tools/ascend 同判） | S3b |
| utils | deepLink/ | 1,396 | 壳（terminalLauncher——桌面集成面） | 不归位 |
| utils | git/ 1,274 + git.ts 930 + gitDiff 573 + worktree.ts 1,609 | ~4,400 | **kernel**（git/worktree 逻辑，engine/worktree 同域） | S3a |
| utils | task/ 1,223 + tasks.ts 848 + cronScheduler 530 + cronTasks 455 + cron.ts | ~3,500 | **kernel 疑·双实现核对**（engine/scheduler/cronScheduler 并存——0.3 节） | S3b 核后判 |
| utils | model/ 1,091 + api.ts 667 + auth.ts 817 + proxy.ts 390 + effort.ts 376 | ~3,300 | **kernel**（modelprovider 邻接） | S3a |
| utils | processUserInput/ suggestions/ secureStorage/ messages/(345) skills/ dxt/ filePersistence/ ultraplan/ github/ memory/ todo/ | ~2,800 | 逐文件（secureStorage kernel 疑；余壳） | S3b |
| utils | 顶层单文件余量（messages 5,509 / hooks 5,311 / sessionStorage 5,048 / attachments 3,513 / config 1,708 / Cursor / theme / words / imageResizer / toolResultStorage / collapseReadSearch / analyzeContext / fileHistory / stats / ide / memoryFiles / markdownConfigLoader / fsOperations / file 等） | ~45,000 | **逐文件判**（messages/hooks/sessionStorage = TUI 核心逻辑疑 kernel 邻接但强壳耦合；attachments/toolResultStorage/analyzeContext = context 域疑 kernel；theme/Cursor/words/logo = 纯壳） | S3b 主盘 |
| services | mcp/ | 11,446 | **疑·双实现核对**（engine mcp 域并存？） | S3b 核后判 |
| services | lsp/ | 2,468 | kernel 疑（LSP 协议层） | S3b |
| services | api/ | 2,006 | kernel 疑（与 modelprovider 关系） | S3b |
| services | plugins/ | 1,488 | 随 utils/plugins 拆分域同判 | S3b |
| services | voice/PromptSuggestion/SessionMemory/extractMemories/autoDream/MagicDocs/analytics/AgentSummary/oauth/awaySummary/notifier/vcr/diagnosticTracking/preventSleep/tokenEstimation/… | ~7,000 | 壳（TUI 产品性态） | 不归位 |
| tools | BashTool 11,061 / PowerShellTool 8,862 / AgentTool 5,584 / ascend 2,883 / LSPTool 2,005 / FileEdit 1,797 / FileRead 1,523 / SkillTool 1,173 / … | ~48,000 | 包装层壳域 + **可下沉逻辑逐文件**（解析/校验/参数形下沉 kernel，UI 反馈壳留） | S3b |

### 0.3 双实现/并存疑点（波前必核，S3b 输入）

1. **cron**：tui/utils/cronScheduler+cronTasks vs engine/scheduler/cronScheduler+cronTasks——同名双体，判别（0.1.95 swarm 迁移同类）。
2. **mcp**：services/mcp 11,446 行 vs engine mcp 面——客户端归属。
3. **permissions**：tui/utils/permissions 9,482 vs engine 门分类器（classifierApprovals 族）——分野线。
4. **settings**：tui/utils/settings vs shared/configDir + getSettingsPaths——单源化余量。

### 0.4 体量与拆分裁定（承 step-0 预案）

- **S3a（本波 0.1.103，2026-11-12 顺延勘误——0.1.102 让位 P0 插入波）**：0.2 表初判 kernel 的**整目录/整文件机械搬移**（bash/permissions/hooks/settings/shell/swarm+teammateMailbox/telemetry/nativeInstaller/powershell/git 族/model 邻接族 ≈ **48,000 行 ≈ 11 子域**）——纯结构搬移零语义变更，逐文件清单随 lock-face 冻结。
- **S3b（0.1.103）**：plugins 拆分域 + tools/ 可下沉 + services 疑域（mcp/lsp/api）+ 顶层 45k 逐文件 + 0.3 双实现核对销项——判定密集需 per-file 审视，独立波。
- 归位判定标准（两波同规）：① 语义无壳依赖（无 React/Ink/终端渲染引用）；② 多产品同需（非 atlascode 性态面）；③ 拆包后 kernel 必带。三判据全过 = 归位；任一不过 = 留壳并在清单注记理由。

### 0.5 假 kernel 扫描结果（f4 实锚，三文件排除）

候选 11 子域 + 顶层 kernel 候选单文件全量 React/Ink/tui-state import 扫描，命中三：

1. `permissions/bypassPermissionsKillswitch.ts`——import react + tui/state/AppState + tui/Tool（活依赖）→ **排除出 S3a permissions 域**，留壳注记（killswitch 门 = 壳性态）。
2. `swarm/It2SetupPrompt.tsx`（378 行）——tsx UI 组件 → **排除出 S3a swarm 域**，留壳。
3. `swarm/leaderPermissionBridge.ts`（54 行）——type-only import tui components/Tool（编译期依赖，L4.5 拆包后 kernel 不可引壳类型）→ **排除出 S3a swarm 域**，S3b 判定（接口拆分 vs 留壳）。

**裁定**：S3a 整域搬移**须配排除清单机制**（三文件留壳原位，域内余量照搬）；排除断言入判据格（归位快照格覆盖：kernel 目标树内 react/ink/tui import = 0）。顶层单文件候选全净（teammateMailbox/git 族/model 邻接族/cron 族零壳依赖）。

## §1 波定义

- **波名**：S3a 整域机械归位。**版本**：0.1.103（顺延勘误 2026-11-12：原 0.1.102 让位 P0 插入波，S3b 随之 0.1.104，ENV 专项 0.1.105 候位）。
- **范围**：§0.4 S3a 清单 11 子域目录级搬移（tui/utils/{bash,permissions,hooks,settings,shell,swarm,telemetry,nativeInstaller,powershell,git→git 族,model 邻接族} → kernel 目标目录，目标树随 lock-face 定形）+ import 路径全量重写 + tui 内 re-export 兼容面裁定 + 判据格（归位快照格：定义点全域恰 1 + 反向依赖零回归格 + 字面清单零漂移格）。
- **非目标**：S3b 全部（plugins 拆分/tools 下沉/services 疑域/逐文件）；任何语义变更（函数签名/行为/文案零改）；0.3 双实现合并（仅核对登记，合并归 S3b 或独立波）。
- **性质**：⑤结构波（机械搬移，零行为变更——同 0.1.98 步 1 行为中性先例）。

## §2 Global Constraints

1. **零行为变更硬判据**：canon 净域零差（Δ=0 容许仅测试文件路径变更面）+ 前滚 standing 14 腿全绿 + atlascode 默认身份字节级不变。
2. **单源纪律**：搬移不产生新副本；tui 消费面 re-export 或直改 import 二选一（lock-face 裁定，禁长期双 import 形）。
3. **字面清单制**：搬移触发 literal-inventory.json 路径面更新 = row F 预注册（read-table 执行面）。
4. row F 全程；Atlas-reveiw 审计先于双信号；判据面随 lock-face 冻结先于落码。

## §3 工作段

- **段 D lock-face**：① 11 子域目标树定形（kernel 目录映射表逐域点名）；② re-export 兼容 vs 直改 import 全量二选一；③ 判据格终形（归位快照/反向依赖零回归/字面清单零漂移/canon 零差）；④ 逐文件清单冻结（§0.2 表 → 逐文件行项）。
- **段 I** → **段 G**（判据格 + 前滚 standing + canon 净域）→ **段 L**（标准链 + gitcode 双平台例行步；硬门条款生效——e2e GATE-PASS + f4 采认双在案）→ f4 收口。

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. **归位判定三判据完整性**：11 子域有无「假 kernel」（含壳依赖残留——React/Ink import 扫描实锚；bash/permissions/hooks 内若有 tsx 或 UI 引用即出局）。
2. **re-export 面风险**：tui 内大量消费面直改 vs re-export 的回归面（ IDE 路径别名/tsconfig paths 影响面）。
3. **搬移顺序**：11 子域一次搬 vs 分批（canon 中断面）；与 0.3 双实现疑点的隔离（S3a 只搬不并）。
4. **零行为变更判据充分性**：canon 零差是否足以证搬移无行为差（动态 import/路径字符串构造面扫描）。
5. **f4 §0 反向依赖零违例定谳复核**：grep 口径复核（tsx 面/动态 require 面）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D lock-face → 段 I → 段 G → 段 L → f4 收口。row F 全程。S3b 工单随 S3a 收口起（判定密集波，§0.2 表为输入）。

## §6 Atlas-reveiw 审计闭环（2026-11-12，有修改通过）+ f4 修订吸收

**焦点⑤ 反向定谳独立复核通过**（三面：静态 0 / 动态 0 / 唯一跨顶层命中 = atlascode/ui→tui/main 壳→壳非违例）。

**【必改 1·吸收】假 kernel 扫描口径漏相对逃逸面——137 条实量**（permissions 68/swarm 23/hooks 22/settings 10/telemetry 7/shell 4/model 2/nativeInstaller 1；bash/powershell/git 全净；高频靶点 growthbook/Tool.js/tools constants/types atlas；顶层单文件族 4/10 抽样中）。f4 裁处：

1. **全量逃逸扫描入段 D 硬前置**：口径 = 候选集每文件所有 import（静态+type+动态+字符串构造路径 `import(${...})`/路径 join 字面）解析落点 ∈ 移动集∪shared；137 条逐条处置表随 lock-face 呈。
2. **三分法资格规则（f4 裁定）**：S3a 定性 = 纯机械零语义变更，故——**排除留壳**（壳性态文件）/ **依赖随迁**（机械扩移动集）/ **type 重定位**（机械）三属实机械 = S3a 资格；**依赖改写类（接口新造，如 growthbook→FeatureConfigPort）一律归 S3b**（接口工作破 S3a 定性，禁混入）。随迁扩集失控（新增随迁面 >3k 行）→ 收缩至零逃逸子域整搬（预案 (b)）。lock-face 呈表定谳，f4 终裁。
3. **§1 范围修订**（触发审计条件②回审一次）：S3a 范围 = 「11 子域 ∩ 逃逸处置余集（随迁+type 重定位可机械闭合）」，非无条件整搬；排除/改写/失控三出口均使实际集 ≠ 11 子域全集。

**【必改 2·吸收】断言格升级**：「kernel 目标树内 react/ink/tui import = 0」废止，改**解析落点式**——kernel 树内每文件全部 import 解析落点 ∈ kernel 树∪shared，逃逸 = 0（逃逸扫描器入判据面 = 判据格本体，非字面 grep）；扫描器同时覆盖字符串构造路径面。

**建议吸收**：① **直改全量**（re-export 若锁面选用须带除役期限，禁长期双路）；② **处置表闭环先于直改**（防 kernel→tui 残边 + tui→kernel 消费 bundle 循环依赖）；③ **tsconfig paths 表全量核对**（baseUrl+paths 含 tui 路径须同步重映射）；④ **字面清单零漂移格增列**：路径面 diff 恰合搬移映射表断言（禁清单与实际落点漂移）；⑤ 搬移顺序 = 一次搬 + canon 中断面一次（前提 = 处置表先冻结）；⑥ 0.3 双实现 S3a 只核对登记不合并 ✓ 维持。

§6 修订落档后回 Atlas-reveiw 复核一次（§1 结构性修订条款），复核通过后发双信号。
