# 统一内核多产品纲要（atlascode → atlasoffice/atlascomic 并行）— 2026-11-07 f4 纲要稿 v1

- 定性：**纲要性方向文档**（用户 2026-11-07 裁定「后面的动作沿着这个主线」）——统领后续排期与架构决策；细部设计归各激活波工单，本稿不预付实现细节
- 用户原语：统一内核 + 多产品（当前 atlascode；接下来 atlasoffice、atlascomic 等）；内核一样，品牌/系统提示词/WebUI 性态/甚至 app 形态不同；**atlascode 完成既定改造达到「可启动第二产品标准」时，并行开发两个甚至三个产品**
- 事实源：`architecture-charter.md`（L1 单包+目录边界+L4.5 拆包触发器 / L3 端口自治 / L4.7 组合根）+ `src/atlasoffice/index.ts` 占位三面相（2026-09-28 裁定）+ `atlascode/compose.ts` 唯一组合根实查 + `docs/2026-11-06-full-diagnosis.md`（风险 #5 tui 体量）+ `docs/2026-11-07-wd-team-orchestration-design.md`（W-D 队列）

## 1. 总线（一条主线）

**「AtlasCode 既定改造 → 达第二产品标准 → 内核多产品并行」**。此主线为排序最高轴：一切后续波次按「是否推进主线」归类——① 主线改造波（AtlasCode 产品+内核债）② 主线基建波（内核边界/拆包/治理扩展）③ 主线能力波（W-D 等落在 kernel 的能力，全员受益）。主线外的登记面（PL-1/E-1b-full/长尾 1P）不变。

## 2. 内核/产品分野定义（f4-call，激活波细化）

| 面 | 内核（产品无关） | 产品（per-product） |
|---|---|---|
| 引擎 | engine 全域（loop/tools 执行/tasks/hooks/permissions/sandbox/mcp/swarm/scheduler/session） | — |
| 模型接入 | modelprovider（fallback 池/网关面） | 模型池配置/角色路由偏好 |
| 组合根 | **组合根模式与 port 注入框架**（各域 set*Port 面） | 每产品一个 compose.ts（atlascode 现形为第一实例） |
| 工具 | 工具执行框架 + 通用工具族 | **工具注册子集**（office/comic 各自的工具清单与专有工具） |
| UI | headless/SDK 车道（print.ts 同构面 = WebUI/app 接入面） | TUI（atlascode 壳）/ WebUI / app 壳 |
| 品牌/文案 | — | identity.ts 品牌令牌 / text-assets 系统提示词 / HELP_SET / de-ant 锚 / cmd 面 |
| 门禁锚 | 内核级锚（engine 判别/CI/tsc/build） | 产品级锚（cmd32/help55/prompt 字节锚/token 对账——**产品化实例化**） |

## 3. 「可启动第二产品标准」（用户点名 gate，本稿给可测初稿，激活波终定）

| # | 标准 | 判据形态 |
|---|---|---|
| S1a | 产品特有面接口提取（接口面） | 品牌/提示词/工具子集/HELP_SET/锚五面 per-product 配置接口 + **字面清单制**（五类字面单一事实源清单，grep 对清单执行，禁探针散落——http-useragent-brand 先例）+ 白名单 fail-visible（合法共字显式表逐项注释，禁静默豁免——A3-1 分账先例）；判别 = **src 域级 grep**（S4 前可测，e2e 判据化裁定） |
| S1b | 产品字面实证（dist 面，S4 后才可测） | 拆包后 dist 级 kernel/产品字面分账 grep（S4 前单 bundle 混编无法分账——e2e 依赖倒挂预警） |
| S2 | 组合根可复制 | atlasoffice compose.ts 装配同一组域至 headless 一轮；**三支判别**（e2e 裁定）：① office PONG（prodlane-pong 通用化复用：换入口+marker+office seeded settings）② **S2×S1 交叉**——office wire 零 atlascode 系统提示词字面（k5-bridge-proxy 落盘直证）③ 工具子集判别——office wire tools 含 office 工具、不含 atlascode 专有 schema；+静态面「零 atlascode 壳 import」（S4 lint 边界先例）；双产品对照同窗跑（fam 预算 ×2 时长，网关串行纪律） |
| S3 | TUI 分域盘点完成且耦合面清零 | 盘点清单落盘 + 盘点标「应在 kernel」的耦合项归位/登记（诊断风险 #5 收口） |
| S4 | 拆包完成（L4.5 触发器兑现） | packages/ monorepo：kernel + atlascode（+atlasoffice 壳）；kernel 独立版本线；lint 边界照旧强制 |
| S5 | 治理扩展完成 | release-governance 多产品 lane：kernel gate（≈现 gate ②③ 子集，e2e 量级约一半弱）+ 产品 gate（各跑各全保）；**锚实例表结构化先行 = S5 第一工单件**（e2e 裁定：现探针硬编码 HELP_SET=062/cmd 32 常量 → 表化 JSON/YAML per-product〔cmd/help/prompt 锚哈希/token 基线/品牌 UA/de-ant 锚/网关模型〕，探针读表执行，表化先于第二产品 gate）；继承 vs 实例化显式分账（每锚标继承 kernel〔CI/tsc/build〕或实例化〔per-product 独立取证，禁套 atlascode 值假绿——084「不套常数」教训；de-ant/A3-1 判定逻辑可参数化复用但判定值 per-product 重定义〕）；漂移检测 = 每次 release 三方对账（实测==表登记==上版 diff 可解释，token-regress 34 波方法学推广） |
| S6 | headless 车道成熟 | SDK/headless 面支撑非 TUI 前端接入；**判据形态 = headless ≡ TUI 车道行为对齐表**（e2e 裁定：逐行为面〔autoCompact/resume/attachment 投影/工具面/token 计数〕双车道判别，l1-tui-090/att-089/resume 链资产双车道化）；**C-6 = 对齐表第一行已知红行**（0.1.90 直证 -p 车道 autoCompact 结构性禁用，修后翻绿——C-6 修不修决定 S6 首行红绿） |

**达标即可并行**：S1–S6 全绿 = 启动第二产品；S4 前置 S1/S3；S5 可与 S4 并行；S6 与 S3 并行。

## 4. 三步路径（激活波制，禁 big-bang）

| 步 | 波形态 | 内容 |
|---|---|---|
| **步 0（零码，立即可并行）** | f4 盘点 | **内核/产品分域盘点**：tui 427k 行分域清单（哪些该下沉 kernel）+ 产品特有面提取清单 + L4.5 触发器核验 + office/comic 工具链差异面调研（工具注册子集接口形状）→ 产出归入主线排序 |
| **步 1 边界硬化** | 中波×1–2 | S1/S3 落码（产品面提取 + TUI 耦合归位）——**与 AtlasCode 既定改造（C 族/W-D）串行或交叉，盘点后定** |
| **步 2 拆包+治理** | 机械波+治理波 | S4/S5（charter 纪律：拆包 = 机械操作不预付；包名/版本策略届时定） |
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

## 7. 头脑风暴分发面

- Atlas-reveiw：纲要审计（S1–S6 标准完备性/分野表漏项/风险 4 条）
- Main：步 1 硬化体量口径 + S2 可复制性现障碍清单
- e2e：S 标准判据化可行面 + 双 gate（kernel/产品）的资源模型
- 收敛后 v1.x → 呈用户终裁 → 并入排序终稿
