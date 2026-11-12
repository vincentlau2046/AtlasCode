# 步 0 零码盘点——内核/产品分域（f4，2026-11-12，@cf9c39e4）

> 纲要 charter §46 步 0 产出（零码，序 7 S3 归位波硬前置 + S1a 硬化波输入）。
> 方法：主线程 inline 实测（du/wc/grep 实数），粒度以「归位清单」为限（charter 注记 4：YAGNI，不做全景重构方案）。

## §1 tui 分域清单（422,047 行 / 1839 文件实数）

| 子域 | 行数 | 定性 | 归位判定 |
|---|---|---|---|
| tui/utils/ | **163,275** | 混合域（最大盘；0.1.95 已迁 swarm backends 9 对至 src/swarm） | **重点拆分面**：内部含 kernel 级（swarm 遗留、teammateMailbox 平行实现〔登记债〕、updateCheck、ripgrep resolver）与壳级（渲染/终端工具）——归位清单逐文件列 = S3 波输入（本表为顶层定位，逐文件清单 S3 波开工时细列） |
| tui/components/ | 75,179 | UI 组件 | 壳域（TUI 产品形态）——不归位 |
| tui/tools/ | 48,102 | 壳工具包装 | 与 engine 工具域对照后判：包装层壳域、可下沉逻辑归位（逐文件 S3 细列） |
| tui/services/ | 24,692 | 壳服务层 | 混合——归位候选（S3 细列） |
| tui/commands/ | 20,893 | cmd 域（32 命令基线） | 壳域（charter：HELP_SET/cmd 在壳域提取成本低 = S1a 面，不属 S3） |
| tui/ink/ | 19,954 | 渲染框架 | 壳域 |
| tui/hooks/ | 16,638 | UI hooks | 壳域（marketplace notification hooks 等 S1a 面除外） |
| 其余（screens/keybindings/skills/vim/…） | ~46k | 壳域 | 不归位 |

**S3 归位量级预判**：utils+services+tools 三域混合面合计 >20 归位项风险成立（charter 预判「>20 则超中波口径须拆」）——S3 波立项即按拆二波预案。

## §2 port 实现归属专项列（compose.ts 87 处 set*/注入实测）

组合根 = src/atlascode/compose.ts（全仓唯一跨 8 域 import 点，charter L4.7）。注入面分类：

| 归属类 | 实例（compose.ts 行号） | 归属裁定建议 |
|---|---|---|
| **kernel 可下沉**（纯逻辑，无壳依赖） | setSessionMemoryPort:309 / setDiskOutputEnv:227 / setEndpointConfigSource:257 / setTaskOutputPort:214 / setBootstrapStatePort:215 / setExecutorSandboxPort:216 / setHookShellPort:246 / setHookConfigProvider:247 | adapters/ 已是独立适配器文件（compose/adapters/*）——office compose 可直引复用，**无需移动**（复用现况良好） |
| **atlascode/state 依赖**（office 复用须裁决） | **setSessionContextPort:311（appState.port）/ setTeamServices:343 / setTeammateToolRegistryDeps:361 / setTeammateSpawnTrigger:382 / setAgentLoopDepsTeammatePoolSync:415** | Main 专项列所指五件——真实现居 atlascode/state（createAppState）+ swarm。裁定建议：**接口（ports 定义）已在 engine/ports + teamServices.ts**，office 复用缺的是实现体——按「office 自带实现、接口 kernel 共享」起步（S2 最小路径），下沉 kernel 仅当双产品实现趋同时（YAGNI） |
| **settings 源类**（壳配置读取） | setWebSearchSettingsKeyProvider:425 / setLlmTimeoutSettingsSource:444 / setEffortByModelSource:457 / setSettingsPathsProvider:224 | 壳域配置源——office 版自带（配置目录分域 = S1a 第六面），接口共享 |
| **swarm/team 语义类** | setStartInProcessTeammate:342 / setTeamFileLoader:355 | W-D 主线落 kernel 的面（0.1.94/95/96 收敛红利）——TeamServices/mailbox 单源已 engine 化，此两件为壳触发点，office 自带 |

## §3 产品特有面提取清单（S1a 六面核补，Main 焊点清单实核）

- engine 域产品串足迹实测：`AtlasCode` 7 文件 / `atlascode`（含 import 路径）12 文件——Main 实锤 10+ 注释合法引用量级吻合；**注释策略先行裁定项仍在 S1a lock-face**（剥注释正则 vs 注释改措辞，二选一）。
- coordinatorMode.ts:323 repo URL 字面 / 系统提示词 per-product 接口形（亮点）/ 工具子集 = 唯一新接口形状（feature() 编译门撑不起运行时差异；**现成模板 = Ascend DomainPackage 插挂 + compose.ts 工具清单参数化**——工具组合根现 35 件全量装配，产品差异 = 清单参数而非新机制）。
- headless 车道：src/cli/print.ts 在位（27 文件/388KB 独立域）——归位成本低。
- autoMode prompts 归属：**src/permissions/autoMode（8 文件）+ src/engine/permissions（5 文件）**——permissions 域双居；判定建议 = 权限语义 kernel 共享、分类器提示词字面走产品注入（与 S1a 提示词面同一机制，不另起）。
- atlasoffice 现况：**占位单文件**（src/atlasoffice/index.ts 三面相，2026-09-28 裁定）——S1a/S2 开工时展开。

## §4 遥测/实验配置归属（Atlas-reveiw ②）

- 现状实测：**全仓零真实遥测调用**（analytics/telemetry/GrowthBook/posthog 命中均为注释/命名巧合级，无出网遥测面）；FeatureConfigPort 框架在位（charter port 8）。
- 归属裁定建议：**框架 kernel 共享 + 按 FeatureConfigPort 产品实例分域**（未来 analytics 引入时 per-product config 源 = S1a 配置分域自然延伸）；登记「零遥测」为基线事实，office/comic 继承同基线。

## §5 市场清单归属（Atlas-reveiw ②）

- 实测分布：src/atlascode/marketplace（ascendMarketplace + startup check，产品层）+ tui/hooks/use*MarketplaceNotification ×3（壳通知）+ tui/plugins/ascend/marketplace + tui/utils/plugins/marketplacePublish.ts。
- 归属裁定建议：**marketplace 装载框架 = kernel 共享；清单源（agent-skills 源/ascend 清单）= 产品层参数**——与工具子集同一形状（清单参数化，非新机制）。

## §6 task #154 状态核对（Atlas-reveiw ④）

- e2e 回执（2026-11-12）：其 task store 查无 #154（TaskList 空，近期编号段 225-228 系 0.1.96 波临时项已收口）——「未在本 lane 登记」口径。
- f4 侧 task store 同查无 #154。源头核对已发 Atlas-reveiw（登记出处侧），回执后本节终记；若三侧均无账面 = #154 登记失效定谳（office 激活前置以 charter 现行登记面为准，#154 不作阻塞项）。

## §7 portal 需求面 + engine web 交互缺口

- 事实源：docs/2026-11-11-web-team-console-analysis.md（需求池在档）——候选 A 嵌入式 web 服务复用 TeamServices/mailbox/task services 同源；P0 只读/P1 操作/P2 多 team。
- engine web 缺口定性（盘定）：**engine 域零 web 交互面**（无 HTTP/WS 服务、无审批流 API）；portal 复合主页（atlaswork）消费 S6 headless 合同 + web 审批流/diff 审阅/终端 = Web Console 波范围，非 S1-S4 阻塞项——归需求池不排主线序。

## §8 L1 拆包触发器核验（引用勘误后口径）

charter §36 已实核（2026-11-07）：L1 理由段明写单包多 bin 为默认，拆包触发器 = **独立发版/外部消费**（非 L4.5 引用勘误已修）；S4 达标 = 目录边界 + 组合根复制，拆包 = 需求出现时机械操作。本盘点确认口径无残留误引。

## §9 office/comic 工具链差异面（工具注册子集接口形状）

- 现状：compose.ts 组合根 35 件全量装配 + feature() 编译期门（撑不起 per-product 运行时差异，Main 实锤）。
- 接口形状裁定建议：**工具子集 = ProductDefinition 运行时清单参数**（品牌串走 IDN-1 构建配方、工具子集走运行时清单——S1a lock-face 必答两问的分界）；office 差异面调研 = office 激活时按域逐件裁（现 office 零工具定义，comic 零输入〔charter 登记待用户方向〕）。

## §10 归入主线排序的盘点结论

1. **S3 归位波**：归位项 >20 风险成立（§1 三混合域）——立项按拆二波预案，清单细列 = S3 波开工第一步。
2. **S1a 硬化波**：输入齐备（§3 焊点实核 + §9 接口形状 + §4/§5 归属建议）——10-15 文件口径不变，可与能力波交叉（Main 排序意见维持）。
3. **port 五件专项**（§2 行 2）：office 复用走「接口 kernel / 实现自带」最小路径，无前置移动波。
4. 零遥测基线 + marketplace 参数化 + headless 低成本归位 = S1a 判据面直接可引用。
