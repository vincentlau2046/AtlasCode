# 全貌波次计划（F-2 清理 + F-3 settings + 19 项清尾 + 多包暂挂）— 2026-10-19 f4 零码

- 日期：2026-10-19
- 触发：用户 2026-10-19 界① 对地基 8 类残面逐件裁定 +「我需要你梳理详细的计划，看到 full picture」
- 基线：**212a1e1 = v0.1.77**（归整收官，主链 0.1.55–0.1.77 三十波全五段终态，docs 面线性 212a1e1→f6b7571→413ea12 = origin ALIGNED）
- 事实源：本次代码实查（一方残面 grep / settings 5 源实况 / 19 项分组 @ P0 收官盘 `docs/2026-10-14-p0-closure-audit.md` §3）
- 角色：f4 = 规划/判据/排期（零码）；落码/gate/release = Main/e2e 车道

## 0. 用户 4 裁定 → 工作集

| 裁定 | 用户决定 | 翻译成的工作 |
|---|---|---|
| ① F-2 一方残面 | **清理**（零一方痕迹） | 波 W-A：清 ~20 处 Anthropic 活码残面（分「明切」+「产品决策」两档） |
| ② F-3 flag 配置 | **不同意登记不动**（要做） | 波 W-B：globalConfig 面 + settings 归位（先裁定「是否立 global config 面」） |
| ③ 19 项 | **不同意维持登记不排**（要做） | 波 W-C 小件清尾 + W-D 跨 session 独立波（SDK 阻塞 / 已裁不并 = 登记） |
| ④ 多包 | **现在单包、以后拆 AtlasCode+AtlasOffice** | 触发器暂挂（非当前波，office 域成熟时机械升级） |

**总盘**：4 个可起步波（W-A/W-B/W-C/W-D）+ 暂挂 3 面（SDK 阻塞 3 项 / 已裁不并 2 项 / 多包触发器）。节奏由用户定，本计划给「全貌 + 依赖序 + 体量」，不预跑不预占。

## 1. W-A · F-2 一方残面清理（零一方痕迹）

**实查：活码 ~20 处 Anthropic 痕迹，分三档**（判据 = 活码非注释；`grep -v` 注释行 + test）：

| 档 | 内容 | 文件（代表） | 定性 |
|---|---|---|---|
| **A1 明切（纯一方 wire，通用 agent 不该有）** | `anthropic_beta` 头处理 / `anthropic-ratelimit-unified-reset` 头 / 「claude.ai subscription」schema 描述 / `anthropic_cloud` 环境 kind | `services/api/metadata.ts` / `services/api/withRetry.ts` / `entrypoints/sdk/coreSchemas.ts:1376` / `utils/filePersistence/outputsScanner.ts` | **建议直接清**（对 OpenAI 协议无意义） |
| **A2 一方判定 F-5（可保留，去一方味）** | `isFirstPartyGatewayUrl()` = 「没设 OPENAI_BASE_URL 就当默认端点」启发式 + 3 活消费者（toolSearch / api eager_input_streaming / commands） | `utils/model/providers.ts` + 3 消费点 | **判定逻辑是通用特性（对任何端点工作），保留**；只去一方味：变量名 `anthropicBaseUrl`→`baseUrl`、注释「Gated to direct api.anthropic.com」改「默认端点直连」 |
| **A3 产品决策（要用户裁，非纯删）** | 官方插件市场 `anthropics/claude-plugins-official`（5 文件）+ MCP `claude.ai ` 前缀处理（mcp/normalization/mcpRuleNames/main.tsx 4 文件） | `engine/skill/pluginIdentifier.ts` / `utils/plugins/*` / `engine/tools/mcp.ts` 等 | **两个产品决策**（见 §1.1） |

**A3 两个产品决策（须用户裁，影响 W-A 体量）**：
- **A3-1 官方插件市场**：通用 agent 是否**默认携带 Anthropic 官方插件市场**作为默认插件源？
  - 选项 (a) **保留**（它是插件生态的「官方源」，任何 agent 可指向它，属通用能力）→ 判据面 = 不动；
  - 选项 (b) **改可配置 / 去掉默认**（默认不预置任何官方市场，完全中性）→ 删默认注册，留可配置入口。
- **A3-2 MCP `claude.ai` 前缀**：`claude.ai ` 前缀的 MCP server 名做特殊归一/规则处理，是 1P 专属面。
  - 选项 (a) **保留**（向后兼容既有 claude.ai MCP server 名）；
  - 选项 (b) **清**（通用 agent 不预置任何 1P MCP 前缀处理）。

**判据 6 项（W-A）**：① 一方活字面（A1 + A2 去一方味）grep 0 + A3 按裁定落 ② 四件套 + CI 顶层 ③ P0a+A4F ④ /help 55 + cmd 32 恒等 ⑤ 前 21 波探针族零回归 + 新活探针「零一方痕迹」（dist 一方活字面计数，A3 裁定项除外）⑥ 生产 lane SRI + PONG + 前 22 波零回归 + Δ8910B。

## 2. W-B · F-3 settings / globalConfig（**改型：2026-10-19 用户裁定 = 不做代码波，改零码配置模板**）

**用户裁定（2026-10-19）**：「能不能不做这个，我需要一个比较详细的模板，模板中对配置做一个比较详细说明」→ W-B 代码波（首启流 + env 归类）**取消**，改为：
- **已交付（零码）**：`docs/atlas-config-reference-and-template.md`（配置参考 + 详细模板：5 源模型/优先级 + settings.json 全 key 分组模板〔核心/行为/TUI/MCP/插件/权限 hooks 沙箱/高级〕+ 最小可用模板 + env 三层说明〔核心 ~12 / 高级按需 / 内部 ~160 勿设〕+ 使用路径）。
- **关键事实（实查）**：机器级持久配置**已有**（`~/.atlas/settings.json` 用户源 + 全 key schema 在场）；现有 help 面 = `/config`（TUI 面板，alias `/settings`）+ `/doctor` + env 三档决策底 2 件（`docs/env-defaults-triage.md` 31 自建/22 死码池/145 继承核心 + `docs/env-defaults-decision.md`）；**缺的 = 静态参考/模板 = 已补**。
- **登记（后续可选）**：首启引导流（first-run onboarding 写 §2.8 三项）= 体验增强非地基债务，**登记不排**。
- **B-1 globalConfig 面 / B-2 硬编码接面 / B-3 settings 归位 = 维持登记不动**（用户未裁定「立」，现行为「CLI override ?? 默认」恒等）。

## 3. W-C · 19 项分组（可现在做 vs 阻塞 vs 已裁）

按代码可达性 + 依赖拆 19 项（事实源 = P0 收官盘 §3）：

| 组 | 项（编号） | 数量 | 处置 |
|---|---|---|---|
| **可做小件（→ W-C 波）** | C4-3 长工具心跳 / C5-3 MCP >2min 自动后台 / C5-4 MCP 能力发现退避 / C6-2 memory 容量预警 / C8-2 DirectoryAdded / C8-3 MessageDisplay / C8-5 terminalSequence+continueOnBlock / C9-2 --restricted / C9-5 skillOverrides / D-5 压缩后 git status 现形 | 10 | **一波小件清尾**（各件小，合一个发布波，低行为风险） |
| **待核验（→ W-C 或独立小波）** | C4-5 /rewind before /clear / C10-6 /permissions 回合中可开 | 2 | 先活探针核验现状，再裁「补 or 已覆盖」 |
| **卡 SDK（登记等 SDK，做不了）** | C3-6 subagent 嵌套转发 stream-json / C4-4 interrupt cancel_queued / ④ SDK unstable_v2_resumeSession | 3 | **登记等 SDK 能力**（本仓单独做不了） |
| **用户已裁不并（登记，可重启裁定）** | C1-6 containment escape / C3-3 fork-by-default | 2 | 你上回终裁「不合入」→ 维持登记，要重启请明说 |
| **可并超时族** | D-3 摘要 fallback 模型重试（与超时族同域） | 1 | 并入下一个 loop 鲁棒性/超时族波（若近期开）或 W-C |
| **跨 session 独立波（→ W-D）** | C2 跨 session 全簇（Q1，中–大） | 1 | **独立中–大波**，先 D1–D5 裁定（门控默认 OFF）再开 |

**W-C 波 = 10 小件 + 2 核验 +（D-3 可选）≈ 13 项**，一个发布波（中体量，低行为风险）。**W-D = 跨 session 簇**（独立，需先裁定 D1–D5）。

## 4. F-4 APIError 双族（小件，可并 W-C）

`class APIError` 定义两处（`modelprovider/types.ts:18` + `tui/types/atlas.ts:12`）= 跨模块 instanceof 风险。修法 = 归一到一处（TUI 侧 re-export modelprovider 的，或反之）。**小件（2–3 文件），并入 W-C 小件清尾波**，不单开。

## 5. 最终排期（2026-10-19 决策已收敛，锁定）

**版本波号**（基线 = 212a1e1 = v0.1.77，主链 0.1.55–0.1.77 已收官）：W-A = **0.1.78** / W-C = **0.1.79** / W-D = **0.1.80**。

| 序 | 波 | 版本 | 内容 | 体量 | 状态 |
|---|---|---|---|---|---|
| **1** | **W-A** | **0.1.78** | F-2 一方残面清理（零一方痕迹）：A1 明切删（anthropic_beta / anthropic-ratelimit / claude.ai 描述 / anthropic_cloud kind）+ A2 去一方味（isFirstPartyGatewayUrl 保留逻辑、变量名/注释去 anthropic 字样）+ A3-1 官方市场**保留**（用户裁定「带」）+ A3-2 MCP `claude.ai` 前缀**改通用守卫**（对全部 server 名折叠连续下划线，`claude.ai` 字面量清零，功能不丢更中性） | 中（~12 文件） | **终态（2026-10-22 五段闭环：落码 bd70ef9 → gate GATE-PASS r-20261020-gate-078 → release 569aed7/tag v0.1.78/npm latest=0.1.78 → 生产 lane PASS r-20261022-prodlane-078，SRI D-8 + 前 22 波零回归 + Δ8910B；f4 三证核过）** |
| **2** | **W-C** | **0.1.79** | 20 项小件清尾：19 项（10 可做小件 C4-3/C5-3/C5-4/C6-2/C8-2/C8-3/C8-5/C9-2/C9-5/D-5 + 2 待核验 C4-5/C10-6 先活探针 + F-4 APIError 双族合并 + D-3 摘要 fallback 可并）+ **1 候补（2026-10-20 Main 裁定+f4 核收：MCP 归一空名 guard**〔A3-2 通用化后纯标点 server 名（`'...'`）归一空串 → `mcp____` 前缀互串（同配置作者内非授权面，f4 机检坐实行为差+消费逻辑），三副本加 1 行 guard（归一空时回落折叠前值）+ 判别断言锁 `'...'→'___'` 与旧行为逐字一致〕 | 中 | **在途（2026-10-23 用户持续授权「已规划版本自动完成」触发；工单 `docs/2026-10-23-p0-wave-0179-ticket.md` §0 重核勘误：D-3/D-5 已 0.1.69 落地移出新做，实做 = 11 新做 + 2 核验 + 2 已落地核销；§5 审视无报裁项，双信号已发）** |
| **3** | **W-D** | **0.1.80** | 跨 session 簇（C2/Q1，中–大）：先 D1–D5 裁定（门控默认 OFF）再落码 | 中–大 | 挂（W-C 后，需 D1–D5） |

**已交付（非波，零码）**：W-B 配置面 → **`docs/atlas-config-reference-and-template.md` 配置参考 + 详细模板已落盘**（5 源模型 / settings.json 全 key 模板 / 最小模板 / env 三层 / 使用路径）。首启引导流 + globalConfig 面 = 登记不排。

**暂挂面（不排当前，触发器/外部依赖）**：① SDK 阻塞 3 项（C3-6/C4-4/④resumeSession，等 SDK 能力）② 已裁不并 2 项（C3-3 fork-by-default / C1-6 containment escape，重启需明说）③ 多包 AtlasCode+AtlasOffice（office 域成熟时机械升包，L1 单包不变）④ 前向缝 ⑭ #200 域换 gateway（IFF 端点定案后清）⑤ 首启流 / globalConfig。

**新流程规矩（用户 2026-10-20 裁定，全波适用）**：每波开工前 f4 先出**详细方案 + 审视环节**（工单 §0 活码重核 @ 当前 master + §5 审视记录：逐点自决/报裁 + 依据）——默认 f4 自决闭环，**仅参考不足或有险面**才报用户审核决策；审视闭环后才发双信号进标准流程（先例 = 0.1.78 工单 §5「审视环节记录」）。

**执行机制（每波怎么用 = 标准三 lane 五段闭环，严格串行）**：
```
f4 出工单 + 双信号（Main 落码触发 / e2e 预审登记 6 判据）
   → Main 落码合 master（单信号）
   → e2e gate（判据 6 项 fail-closed，任一红 = GATE-OPEN 打回不跳段）
   → Main release（chore <ver> + tag v<ver> + npm --registry npmjs.org + SRI 四值 D-8）
   → 生产 lane PASS（SRI 三方独立复算 + PONG + 前 N 波 token 零回归 + Δ8910B）
   → e2e 报 Main PASS 收口 → Main 单点报用户 = 五段闭环终态
   + f4 盘核三证（master=tag + npm live + SRI 交叉）
```
- **严格串行**：前波未落地（五段闭环终态）不启后波。
- **可插波**：任一主诉 bug 可随时插入（如 0.1.71 先例），插波走完后续波顺延。
- **每波触发**：f4 收到「开 W-x」信号 → 出工单 + 双信号 → 链自治推进到收口。

## 6. 决策收敛记录（2026-10-19 界①，全部已裁）

| 面 | 裁定 | 落点 |
|---|---|---|
| F-2 一方残面 | **清理**（零一方痕迹） | W-A 0.1.78 |
| A3-1 官方插件市场 | **带**（保留，通用能力） | W-A（不动） |
| A3-2 MCP `claude.ai` 前缀 | **去掉**（改通用守卫，字面清零功能不丢） | W-A |
| F-3 配置面 | **不做代码波**，改零码详细模板 | 已交付 `docs/atlas-config-reference-and-template.md` |
| 19 项 | **要做**（非维持登记） | W-C 0.1.79 |
| 跨 session | **独立波** | W-D 0.1.80（先 D1–D5） |
| 多包 | 现在单包，AtlasCode+AtlasOffice 成熟时拆 | 触发器暂挂 |
| 节奏 | **W-A 先走**（收「通用 agent」主诉面），W-C/W-D 挂后 | f4 建议，待用户确认启动 |

> 排期已锁。**W-A 0.1.78 五段闭环终态（2026-10-22）**。**2026-10-23 用户持续授权：已规划版本全部自动完成（W-C 0.1.79 → V3-1…V3-9 0.1.80–0.1.88 严格串行，不再逐波要「开 W-x」触发；W-D 跨 session 仍记录不排；每波前 f4 详细方案 + 审视环节新规不变，仅参考不足/有险面报用户）**。

---
*f4 零码全貌规划产物（规划/判据/排期，不落码）。裁定 = 用户界①；落码/gate/release = Main/e2e 车道。*
