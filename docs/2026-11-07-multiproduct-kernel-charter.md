# 统一内核多产品纲要（atlascode → atlasoffice/atlascomic 并行）— 2026-11-07 f4 纲要稿 v1

- 定性：**纲要性方向文档**（用户 2026-11-07 裁定「后面的动作沿着这个主线」）——统领后续排期与架构决策；细部设计归各激活波工单，本稿不预付实现细节
- 用户原语：统一内核 + 多产品（当前 atlascode；接下来 atlasoffice、atlascomic 等）；内核一样，品牌/系统提示词/WebUI 性态/甚至 app 形态不同；**atlascode 完成既定改造达到「可启动第二产品标准」时，并行开发两个甚至三个产品**
- 事实源：`architecture-charter.md`（L1 单包+目录边界+拆包触发器〔独立发版/外部消费〕/ L3 端口自治 / L4.7 组合根 / IDN-1 构建配方裁定）+ `src/atlasoffice/index.ts` 占位三面相（2026-09-28 裁定）+ `atlascode/compose.ts` 唯一组合根实查 + `docs/2026-11-06-full-diagnosis.md`（风险 #5 tui 体量）+ `docs/2026-11-07-wd-team-orchestration-design.md`（W-D 队列）

## 1. 总线（一条主线）

**「AtlasCode 既定改造 → 达第二产品标准 → 内核多产品并行」**。此主线为排序最高轴：一切后续波次按「是否推进主线」归类——① 主线改造波（AtlasCode 产品+内核债）② 主线基建波（内核边界/治理扩展，拆包可选）③ 主线能力波（W-D 等落在 kernel 的能力，全员受益）。主线外的登记面（PL-1/E-1b-full/长尾 1P）不变。

## 2. 内核/产品分野定义（f4-call，激活波细化）

| 面 | 内核（产品无关） | 产品（per-product） |
|---|---|---|
| 引擎 | engine 全域（loop/tools 执行/tasks/hooks/permissions/sandbox/mcp/swarm/scheduler/session） | — |
| 模型接入 | modelprovider（fallback 池/网关面） | 模型池配置/角色路由偏好 |
| 组合根 | **组合根模式与 port 注入框架**（各域 set*Port 面） | 每产品一个 compose.ts（atlascode 现形为第一实例） |
| 工具 | 工具执行框架 + 通用工具族 | **工具注册子集**（office/comic 各自的工具清单与专有工具） |
| UI | headless/SDK 车道（print.ts 同构面 = WebUI/app 接入面） | TUI（atlascode 壳）/ WebUI / app 壳 / **家族 portal 层**（用户 2026-11-07 裁定：atlaswork 统一 portal 复合主页对接全部产品——自建 TS 壳消费 S6 headless 合同；Open WebUI 深度参考不直接使用〔其 License 品牌条款：去品牌或 >50 用户须 Enterprise License，正中我们场景；且 Svelte+Python 栈错配+chat-centric 缺 agent 交互面〕；agent 交互面〔web 审批流/diff 审阅/终端〕= engine web 交互缺口，步 0 盘点） |
| 发布包 | — | **单包多 bin 形态为默认**（用户 2026-11-07 终裁）：一个 npm 包、每产品一个 bundle（IDN-1 构建配方独立编译）、bin 各自独立命令（atlas/atlas-office…）；产品边界在命令层完整保留；**家族调度器单命令派裁定不做**（cmd32/help55/上游对齐锚重基线成本不成比例；未来可加薄壳别名纯加性）；形态二（产品独立 npm 包）触发 = 独立节奏/外部消费者/体积需求（charter L1 机械操作，kernel 仍不发包以源码编译进各 bundle） |
| 品牌/文案 | — | identity.ts 品牌令牌 / text-assets 系统提示词 / HELP_SET / de-ant 锚 / cmd 面 |
| 持久化/配置 | 配置框架与 schema 机制 | **per-product 配置目录与数据分域**（~/.atlas 命名空间产品化：settings/session/teams/tasks 目录，Atlas-reveiw ①+Main 同点合流） |
| 遥测/实验配置 | FeatureConfigPort 框架（charter port 8） | analytics/GrowthBook A/B 面按产品分 or 共享（Atlas-reveiw ② 登记未答，步 0 定） |
| 更新通道 | updater/nudge 机制（0.1.71 先例） | 更新源/版本线 per-product（细化归拆包兑现时） |
| 插件/marketplace | marketplace 装载框架 | **市场清单归属**（agent-skills 源等——Atlas-reveiw ②：工具行「注册子集」未覆盖市场清单面，步 0 定） |
| 门禁锚 | 内核级锚（engine 判别/CI/tsc/build） | 产品级锚（cmd32/help55/prompt 字节锚/token 对账——**产品化实例化**） |

## 3. 「可启动第二产品标准」（用户点名 gate，本稿给可测初稿，激活波终定）

| # | 标准 | 判据形态 |
|---|---|---|
| S1a | 产品特有面接口提取（接口面） | **六面**（Atlas-reveiw ① 补第六面）——品牌/提示词/工具子集/HELP_SET/锚/**配置与数据目录分域**（~/.atlas 命名空间产品化：per-product 配置目录或键命名空间 + settings schema/session 存储/teams/tasks 目录分域，env 覆盖 + 构建配方注入；与 S2 ④ 判据同一问题两面）——均 per-product 配置接口；**实现锚 = charter IDN-1 构建配方裁定**（Atlas-reveiw ①：产品差异靠 `--define` 构建配方 + shared/identity.ts，不靠运行期 port——已裁机制勿另起；Main 的 ProductDefinition 运行时注册清单与 IDN-1 的归一〔品牌串走配方、工具子集运行时清单是否独立成面〕= S1 硬化波锁面必答）；**字面清单制**（六类字面单一事实源清单，grep 对清单执行，禁探针散落——http-useragent-brand 先例）+ 白名单 fail-visible（合法共字显式表逐项注释，禁静默豁免——A3-1 分账先例）；判别 = **src 域级 grep + 注释排除策略先行裁定**（Main 实锤：engine 域注释含 "AtlasCode" 10+ 文件〔多为迁移注释合法引用〕——判据正则剥注释或注释统一改措辞，二选一锁面，否则 S1 永假红）；**已知焊点清单（Main 实读 @ master）**：① `engine/coordinator/coordinatorMode.ts:323` 提示词字面含 repo URL（engine 域产品串，提取为产品注入参数）② 系统提示词已是 per-product 接口形（tui/constants/prompts.ts 壳域 + AgentLoopDeps 注入，S1 亮点）③ **工具子集 = 唯一需新接口形状**：现编译期 feature() 门撑不起 per-product 运行时差异（Ascend DomainPackage 插挂先例为模板）④ headless 车道物理归位（print.ts 现 src/cli/ → kernel 可引位，S1/S3 交界）⑤ HELP_SET/cmd 均在壳域，提取成本低 ⑥ autoMode prompts（permissions/）归属待步 0 盘点 |
| S1b | 产品字面实证（dist 面，S4 后才可测） | 拆包后 dist 级 kernel/产品字面分账 grep（S4 前单 bundle 混编无法分账——e2e 依赖倒挂预警） |
| S2 | 组合根可复制 | atlasoffice compose.ts 装配同一组域至 headless 一轮；**四支判别**（e2e 三支 + Main 补一支）：① office PONG（prodlane-pong 通用化复用）② S2×S1 交叉——office wire 零 atlascode 系统提示词字面（k5-bridge-proxy 落盘直证）③ 工具子集判别——office wire tools 含 office 工具、不含 atlascode 专有 schema ④ **配置目录隔离**（Main 补强：`~/.atlas` 单一命名空间同机双产品必撞〔settings/模型池/marketplaces/teams/tasks 全共享〕——S2 最小探针不触配置面会假绿，per-product 配置目录〔如 `~/.atlas-office`〕或键命名空间须先裁定，**否则 S2 通过 ≠ 可启动**）；+ **ProductDefinition 配置对象**（Main：identity/提示词源/工具子集/锚集现内联硬选在 atlascode/compose.ts 各装配语句——先收敛为产品配置参数集，S2 判据含「office compose 与 atlascode compose diff 仅限产品配置对象」，防复制 509L 手改 N 处漂移）；+静态面「零 atlascode 壳 import」；双产品对照同窗跑（fam ×2 时长）；**port 实现归属 = 步 0 盘点专项列**（sessionContextPort/teammatePoolSync/TeamServices 真实现现居 atlascode/state 与 swarm——下沉 kernel 或 office 自带，盘点定）；进程单例（bootstrapState/modelprovider）一产品一进程无害，登记即可 |
| S3 | TUI 分域盘点完成且耦合面清零 | 盘点清单落盘 + 盘点标「应在 kernel」的耦合项归位/登记（诊断风险 #5 收口） |
| S4 | 目录边界+组合根复制达标（**拆包降级为可选**，Atlas-reveiw ④ 裁定采倾向案） | **charter L1 实核**（2026-11-07）：L1 理由段明写「三个产品逻辑一致→引擎共享」正是单包理由，拆包触发器 = 「独立发版/外部消费」（L1，非 L4.5——纲要初稿引用勘误已修）；**达标必要面 = 目录边界（atlasoffice/、atlascomic/ 兄弟位 + lint 强制）+ 每产品 compose.ts 复制装配**（office 占位三面相本就是兄弟位设计）；monorepo/packages 拆包 = 独立发版需求出现时的机械操作，不预付；S1b（dist 字面分账）随之降为**条件面**（拆包兑现时启用） |
| S5 | 治理扩展完成 | release-governance 多产品 lane：kernel gate（≈现 gate ②③ 子集，e2e 量级约一半弱）+ 产品 gate（各跑各全保）；**kernel gate 须含跨产品消费面判别**（Atlas-reveiw ③：kernel 波回归=全产品同时受影响，kernel gate 至少 = S6 headless 合同面探针 × 各产品配置，防 office/comic 面裸奔）；**锚实例表结构化先行 = S5 第一工单件**（e2e 裁定：现探针硬编码 HELP_SET=062/cmd 32 常量 → 表化 JSON/YAML per-product〔cmd/help/prompt 锚哈希/token 基线/品牌 UA/de-ant 锚/网关模型〕，探针读表执行，表化先于第二产品 gate）；继承 vs 实例化显式分账（每锚标继承 kernel〔CI/tsc/build〕或实例化〔per-product 独立取证，禁套 atlascode 值假绿——084「不套常数」教训；de-ant/A3-1 判定逻辑可参数化复用但判定值 per-product 重定义〕）；漂移检测 = 每次 release 三方对账（实测==表登记==上版 diff 可解释，token-regress 34 波方法学推广）；**npm 发布/registry 面点名**（Atlas-reveiw ①：多包发布新包名 + SRI 四值口径产品化 + `--registry npmjs.org` 纪律——0.1.43 npmmirror 坑先例）；**kernel 版本兼容矩阵登记**（Atlas-reveiw ①：产品版本 ↔ kernel 版本兼容口径 + updater/nudge 产品化〔0.1.71 先例〕——细化归拆包兑现时） |
| S6 | headless 车道成熟 | SDK/headless 面支撑非 TUI 前端接入；**判据形态 = headless ≡ TUI 车道行为对齐表**（e2e 裁定：逐行为面〔autoCompact/resume/attachment 投影/工具面/token 计数〕双车道判别，l1-tui-090/att-089/resume 链资产双车道化）；**C-6 = 对齐表第一行已知红行**（0.1.90 直证 -p 车道 autoCompact 结构性禁用，修后翻绿——C-6 修不修决定 S6 首行红绿） |

**达标即可并行**：S1a/S2/S3/S4/S5/S6 全绿（S1b 为条件面，拆包兑现时启用）= 启动第二产品；S4 前置 S1a/S3；S5 可与 S4 并行；S6 与 S3 并行。

## 4. 三步路径（激活波制，禁 big-bang）

| 步 | 波形态 | 内容 |
|---|---|---|
| **步 0（零码，立即可并行）** | f4 盘点 | **内核/产品分域盘点**：tui 427k 行分域清单（哪些该下沉 kernel）+ 产品特有面提取清单 + L1 拆包触发器核验（引用勘误后口径）+ office/comic 工具链差异面调研（工具注册子集接口形状）+ **port 实现归属专项列**（Main 补：sessionContextPort/teammatePoolSync/TeamServices 等真实现现居 atlascode/state 与 swarm，office 复用时下沉 kernel 还是自带）+ autoMode prompts（permissions/）kernel/产品归属 + 遥测/市场清单归属两行（Atlas-reveiw ②）+ **task #154 状态核对**（Atlas-reveiw ④：office 激活前置「AtlasCode 全功能复刻审视优化」是否仍活/已完成）→ 产出归入主线排序 |
| **步 1 边界硬化** | **拆二波（Main 裁定）**：「S1 硬化波」先行（≈1 中波 10-15 文件，多数移位/注入化非新逻辑：coordinator 字面提取 + headless 归位 + 注释策略 + 工具子集运行时清单接口）＋「S3 归位波」等步 0 盘点产出（31MB/1851 文件，归位项 >20 则超中波口径须拆）；**S1 可与 C 族/W-D 交叉**（移位活不压引擎语义面——Main 排序意见），S3 归位必须等盘点；S2/dogfood 硬序在 S1+S3 后 |
| **步 2 治理扩展（+拆包可选）** | 治理波（+机械波） | S5 治理面（锚实例表先行/双 gate/发布 registry 面）；S4 达标面 = 目录边界+组合根复制（**随步 1 兑现，非独立拆包波**）；monorepo 拆包仅当独立发版/外部消费需求出现（charter L1 触发器，机械操作不预付，包名/版本策略届时定） |
| **步 3 第二产品 dogfood** | 探索波 | atlasoffice 三面相激活（命令注册表/UI 壳/入口）+ S2 验收 = **内核边界的最终测试**；atlascomic 循环同径 |

## 5. 与既有队列的合并（§9 修订候补，待团队头脑风暴后呈终稿）

- W-opt compaction 收尾（C-6/C-1/C-3）与 W-D 团队协作（A→B-1→B-2）**均落 kernel**（主线③能力波，全员受益）——排序不变的前提下，步 0 盘点并行、步 1 边界硬化视盘点结果插入 C 族与 W-D 之间或之后。
- **W-D-A 基座定谳步增补**：spawn 触发点工具面落位时顺手核「落 kernel 还是落产品壳」（防新能力落错层——W-D 本是 kernel 面，预期无冲突，登记核对项）。
- 卷 4（2.1.304–319 drift，含 agent teams 2.1.319 契约插桩）= atlascode 产品面+kernel 双受益，位置不变。
- **新增登记**：comic 产品面零调研（现无任何输入，登记待用户给方向）；office 工具链评估（2026-09-28 裁定的激活前置）并入步 0。

## 6. 风险面（纲要级预登记）

1. **并行产品 × 串行纪律张力**：多产品并行开发 vs 本仓严格串行五段闭环——治理须先答「并行 = 多 lane 并行 session（Main/f4/e2e 各组）还是 lane 内串行多产品轮转」；本稿不预答，S5 治理波敲定。
2. **kernel 抽象漏/焊死**：第二产品接入时才暴露的边界错误——dogfood 步 3 是验收而非保险，步 1 硬化时判据须含「双消费者推演」（每提一个接口问 office 用不用得上）。
3. **锚产品化漂移**：cmd32/help55/token 对账是 atlascode 口径，office 复刻时锚面错用 = 假绿——S5 实例表防。
4. **tui 427k 盘点体量**：盘点本身零码但量不小；产出粒度以「归位清单」为限，不做全景重构方案（YAGNI）。
5. **gate 资源量级**（e2e 量级口径）：第二产品稳态 = 1×kernel + 2×产品 ≈ **1.5× 现 gate 资源，波次时长 +50%**——本机单网关串行纪律下可行，波速预期须在 S5 治理波向用户明示（并行产品的真实成本面）。
6. **kernel 单点回归放大**（Atlas-reveiw ③，实质）：kernel 波回归 = 全产品同时受影响；kernel gate 若只跑 atlascode 锚则 office/comic 面裸奔——防线 = S5「kernel gate 含跨产品消费面判别」（S6 探针 × 各产品配置）。
7. **沟通矩阵带宽倍增**（Atlas-reveiw ③，轻候补）：并行产品 × 每波必送审计等跨 session 矩阵 → 审计/收口带宽倍增——S5 治理波一并答。

## 7. 头脑风暴分发面

- Atlas-reveiw：纲要审计（S1–S6 标准完备性/分野表漏项/风险 4 条）
- Main：步 1 硬化体量口径 + S2 可复制性现障碍清单
- e2e：S 标准判据化可行面 + 双 gate（kernel/产品）的资源模型
- 收敛后 v1.x → 呈用户终裁 → 并入排序终稿

## 10. 技术债全景排序终稿（2026-11-07 用户终裁采纳，主线合并路线）

| 序 | 项 | 债性质 | 主线归属 | 备注 |
|---|---|---|---|---|
| 1 | **C-6 headless -p autoCompact 激活**（scoped 小波） | 功能债（-p 长会话不压缩，0.1.90 登记） | ③能力波 + **S6 对齐表首行翻绿** | 趁热先行；压缩风暴风险重估为波内前置 |
| 2 | **C-1 KV-cache 摘要**（tools/system 奇偶直证先行）+ **C-3 overflow 触发** | 功能债（compaction 域收尾） | ③能力波 | 用户裁定优先面收尾 |
| 3 | **W-D-A 临时小组**（基座定谳步先行） | 能力债（骨架零调用方） | ③能力波 | 设计稿 v1.2 就绪 |
| 4 | **S1a 硬化波**（六面提取，≈1 中波） | 架构债（产品面焊在 kernel） | ②基建波 | **可与 2/3 交叉**（移位活不压语义面）；IDN-1 归一锁面必答 |
| 5 | **Gap B sharp/image-processor-napi 未随包**（PDF 页图断链，0.1.84 登记） | 供应链债（用户可感） | ①改造波 | 候补插入位：C 族收尾后视体量插波 |
| 6 | **W-D-B-1 持久化面** | 能力债 | ③能力波 | — |
| 7 | **S3 归位波**（等步 0 盘点产出） | 架构债（tui 427k 耦合） | ②基建波 | 归位项 >20 则再拆 |
| 8 | **W-D-B-2 UDS+TUI** | 能力债 | ③能力波 | 硬前置 = 卷 4 契约插桩（2.1.319） |
| 9 | **卷 4 分析卡**（2.1.304–319，15 版 + agent teams 契约插桩） | 对齐债（drift 窗口） | ②基建波 | 分析卡可提前做；落码随各波 |
| 10 | 登记债（不排，按机缘） | — | — | 500-storm E-1b-full（须用户裁默认语义）/@ant×2/K6-2/7 活面+K6-9/10/11 锚/R1-delay loop 回合级错误恢复/iff 前缀剥离/C4-5 /rewind/compact 残留守（sessionMemoryCompact/promptCacheBreakDetection/cache 面）/E-1P+OOS 长尾 |

**步 0 f4 零码盘点**并行不占序（port 归属/遥测/市场清单/task#154/portal 需求面 + engine web 交互缺口）。

**达标线**：序 1–4 + 7 完成后，S1a/S2/S3/S4/S5/S6 达标评估 → 第二产品（atlasoffice）启动决策点呈用户。
