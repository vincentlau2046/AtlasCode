# 0.1.122 工单——文档规范化版（零产品码：下游-facing reference 补齐订正 + 内部治理规范）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-17）。
> 上游：① 用户 2026-11-17 scope 定稿裁定（A+B 合一版、③⑤ 并入、对齐业界基准）；② 下游（fusion-console 集成侧）issue #3 反馈「reference 面错误」直接触发；③ 登记 doc `docs/2026-11-16-0122-docs-normalization-registration.md`（scope 细则由本工单承接定稿）。

## §0 事实基线（f4 活码实核 2026-11-17）

| 面 | 现状 | 问题 |
|---|---|---|
| `docs/reference/`（12 件） | 全部冻结 @2026-09-30（df9356bd） | 跨 ~40 发布版零刷新；kernel 化（S3a/S3b）、config 域迁移、team 面、usage/计费面全未反映——下游反馈「错误的」直接来源 |
| `docs/atlas-config-reference-and-template.md` | @10-24 | schema 权威引用面陈旧（settings 域已部分迁 `src/engine/config/`）；S1a 分域（0.1.98-99）未反映 |
| slash commands 说明文档 | 缺失（cmd 32 只在源码/CHANGELOG 散见） | 对齐缺口 |
| settings.json / settings.local.json 模板 | 模板件缺、字段面陈旧 | 对齐缺口 |
| IDE 接入说明 | `ide-integration.md` @09-30 | 对齐缺口 |
| README / CHANGELOG | 维护中 | 基本健康，仅 issue #3-1 裸 id 注记待补 |

业界对表基准：Codex CLI repo `docs/`（install/getting-started/config/example-config/agents_md/slash_commands/skills/sandbox）+ Claude Code docs（overview/settings 全字段+优先级链/cli-reference/slash-commands/ide-integrations/hooks/mcp/sandboxing/security）。AtlasCode `docs/reference/` 骨架本按 CC 搭建——问题 = 09-30 后整架冻结失修，非缺骨架。

## §1 波定义（scope 定稿形，用户 2026-11-17 OK）

**零产品码规范性版本**：diff 零 `src/`、零 `tests/`、零构建链（gate 豁免先例 0.1.45-47 形）。

### A 段：下游-facing reference 补齐+订正（主体）

| # | 件 | 内容 |
|---|---|---|
| A1 | `docs/reference/` 12 件全量活码复核刷新 | 每件对表现版码面（kernel 化后真路径），逐件列勘误清单（陈旧断言→现形）；cli-reference 对表 `src/cli/parse.ts` 单一事实源重跑 |
| A2 | 新增 `docs/reference/slash-commands.md` | cmd 32 全清单 + 每件说明 + alias 面 |
| A3 | 新增 `docs/reference/settings.md` | settings.json / settings.local.json 全字段参考 + 可填充模板 + 五源优先级链（S1a 分域现形：ATLAS_CONFIG_DIR > NAME > product 默认 > .atlas）；`atlas-config-reference-and-template.md` 并入后归档指向 |
| A4 | `ide-integration.md` 重写 | 第三方 IDE 接入 CLI 的接入面（headless stream-json 驱动 / 配置目录 / 检测机制），对齐 CC 双平台粒度 |
| A5 | issue #3 docs 三件并入 | #2 baseURL `/v1` 要求注记（providers 示例旁）；#3 settings-vs-env 先经链（settings 命中即压 env，env 仅字段缺省时 SDK 级生效）；#1 README 裸 model id 注记（池内建议全 ref 形，归一化修形走代码版）。**对端 docs PR 到达则吸收合并（f4 diff 复核），未到达则 Main 侧补写**。吸收四钉（审计焦点③）：(i) diff 边界 = 对端 PR 只准触 A5 相关 docs 面，越界拒或拆分（越 src/tests/构建链 = 直接触发格 1 失格）；(ii) 对端断言同格 2 复核——吸收 ≠ 免检；(iii) 归属记账 = 作者 credit/commit 标注面 f4 复核时定形；(iv) 竞态规则 = PR 先于 Main 补写 → 以 PR 为基 rebase 择优，后于 → Main 形为准 PR rebase，禁双写分叉 |

### B 段：内部治理规范化（原五面全并入）

| # | 件 | 内容 |
|---|---|---|
| B1 | docs/ 命名统一 | 日期前缀 `YYYY-MM-DD-` + 波名规范，存量批量校正（附改名映射表） |
| B2 | 工单头注状态机统一 | `draft → Atlas-reveiw 审计 → f4 双信号 → lock-face → 落码 → 段 I 采认 → gate → 段 L → 生产 lane → 收口` 格式拉齐（存量头注批量补齐或标注豁免） |
| B3 | 过期工单/报告归档 | docs/ 根目录减负（ ≥ 收口满 30 天的 ticket/report 移 `docs/archive/2026-XX/`；SRI/制度/活文档不动），留索引 |
| B4 | release-governance.md 制度对表 | 新纪律落档：可达性推演必答项（S0-R2 §6-1 审计沉淀）、docs-push 悬挂窗（0.1.119 后双方确认形）、巡检催办链订正条款（0.1.119）、锚预注册过估披露形（三例同族） |
| B5 | 制度一致性抽查 | docs 制度文与实际流程漂移面清点（输出漂移清单，可修即修、需裁定项登记） |

**语言面（f4 自决，审计可异议）**：中文为主（与现 docs 一致）；A2/A3 两新增件附英文速查节（下游对端英文交流）。

## §2 判据格（零码版）

| # | 格 |
|---|---|
| 1 | **零产品码格（豁免硬门）**：`git diff --stat` 零 `src/`、零 `tests/`、零构建链文件——违一项即豁免不成立转常规 gate；**扩（审计补注 a）：对端 PR 在途并入时，PR diff 亦须过本格零产品码检查（并入即本波 diff 的一部分）** |
| 2 | 事实性格（审计焦点①升级：二分判据）：(a) **机械可验面全量机器核零抽样**——刷新件每条文件路径/命令名/flag/字段名/符号名引用逐条脚本化 grep 对活码（A1+A2+A3 同法，格 3 即此法之特例）；(b) 语义断言（解释性文字）≥3/件抽样；(c) **刷新件禁行号引用**——行号是 rot 最快面，改钉符号名/导出名引用；A1 勘误清单逐件在档；「文档已刷新」声称以机器核验反证（S0-R4 教训同纪律） |
| 3 | 完整性格：A2 = cmd 32 对源码清单零缺漏零多余；A3 字段面对 `src/engine/config/types.ts` + `src/tui/utils/settings/` 权威面零缺漏（passthrough 透传族标注） |
| 4 | 归档格（审计焦点②升级：三条件合取式）：B3 归档候选 = ① 头注状态 ∈ {收口, 终态}（B2 状态机字段复用）∧ ② 文件最后实质 commit 日期 ≥30 天（`git log -1 --format=%cs`；禁用文件名日期前缀做龄——前缀≠收口时点）∧ ③ 非白名单（SRI/、release-governance.md、纲要/制度/spec 活文档按路径前缀枚举）；三条件任一不满足 = 留置；移档文件链接零断（grep 仓内引用面）+ 索引在档 |
| 5 | 制度格：B4 四纪律落档逐条对实际先例工单（可达性推演必答 = S0-R2 §6-1 审计沉淀；锚预注册过估披露形 = 三例同族） |
| 6 | 回归格：README/CHANGELOG 未在本波 scope 内的面零触碰（除 A5 README 注记） |

## §3 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main docs 落码（零码，无 lock-face 需求；A5 对端 PR 若在途则 f4 先复核吸收形）→ f4 抽核（§2 格 2-5）→ gate 豁免申请（格 1 实证）→ 段 L bump 0.1.122 → 生产 lane 轻形（SRI + 安装品对表）→ 收口。
与在途波串行不抢：issue #3-1 code 件（池臂 normalizeRef）走独立代码版（0.1.123 候），不并入本版。
**判据冻结先于落码**：审计焦点①③钉属判据面，已并入 §2（格 1 扩/格 2 升级/格 4 合取式）与 §1（A5 四钉），双信号即判据冻结形（S0-R3 流程变体先例同形）。

## §4 语言面（审计焦点④：维持自决 + 一项登记）

中文为主（与现 docs 一致）；A2/A3 英文速查节维持。登记评估池：「A1 十二件 + A4 的英文面」后续另裁（下游英文交流事实存在，但 issue #3 反馈性质 = 正确性非语言——本波正确性优先）。

## §5 Atlas-reveiw 审计闭环（2026-11-17，通过；@05155aec 全锚实核；f4 采记 + 判据面并入 §1/§2）

1. **§0 锚核验 ✓**：12 件/冻结时点/权威面/定性全吻合。
2. **焦点① 判据升级采认（已入格 2）**：抽核 ≥3/件对「产品即 docs」本波不足——升级二分（机械面全量机器核零抽样 + 语义面抽样）+ 新钉禁行号引用（rot 最快面，改符号名/导出名引用）。
3. **焦点② 合取式采认（已入格 4）**：状态机字段 ∧ git 实质 commit 龄（禁文件名前缀做龄，0.1.104/105 同日多波先例）∧ 白名单枚举——零主观裁。
4. **焦点③ 四钉采认（已入 A5）**：diff 边界 / 对端断言免检豁免否决 / 归属记账 / 竞态规则。
5. **焦点④ 维持自决 + 评估池登记（已入 §4）**。
6. **补注 3 条采记**：(a) 格 1 扩对端 PR diff 同检（已入）；(b) B4 落档逐条对实际先例工单写法（格 5 已含）；(c) 判据面先于落码声明（§3 已含）。
7. **总判：通过**——本节在案即双信号放行。

## §6 f4 抽核采认 + 格 1 豁免批复（2026-11-17，@9a1aabd1 活码独立复跑）

1. **格 1 独立实证 PASS（豁免批复）**：`git diff --stat 2c94f90f..9a1aabd1 -- src tests package.json bun.lock bunfig.toml scripts tsconfig.json` f4 独立复跑 = 空；160 文件全 docs/README/CHANGELOG 面（Main 报 159，差 1 = 波报告自身，记账注记）。**gate 豁免成立，段 L 放行**。
2. **格 2 机器核 PASS**：docs/reference+README 41 条 src 路径引用逐条实存零缺失；零行号引用（审计焦点②钉兑现）；cli-reference 31 flag 抽样全可解（8 件 parse.ts 外源 flag 落 subcommand/handler 文件逐一实锚）；ide-integration `getIdeLockfilesPaths()` 实锚 src/tui/utils/ide.ts:461。
3. **格 3 PASS**：A2 = 61 默认名 + 条件注册（fork/peers/workflows/voice）+ INTERNAL_ONLY 五件 + install 未注册注记，对源码注册表零缺漏零多余（"suggestions" = insights 内部 prompt 子项，排除正确）；A3 = settings.md 字段面覆盖 types.ts 顶层 key 全集（多键行格式实核：ttsModel/asrModel/advisorModel、allowed/deniedMcpServers、teams.persistence 均在档）。
4. **格 4 PASS（判读注记 1）**：归档 21 件三条件合取式抽查吻合（B2 状态补记 + git 龄 + 白名单全在）；stub 指向形使既有引用全解析（atlas-config-reference-and-template.md 原路径 stub）；CHANGELOG 反引号路径提及 = 历史记录面非活链接，不作断链判。注记：归档本件头注残留归档前「活文档/豁免」状态行——非阻断，下波 B2 顺手改。
5. **格 5 PASS + f4 批复订正 1 件（Main 落档注记邀约形兑现）**：纪律 2 原文仅覆盖 Main→消费侧确认窗，**缺 f4 侧 docs 直推挂起窗**（0.1.119/0.1.120 两次 master fork 事故定形：Main 段 L 进行中→生产 lane 信号止，f4-staged-docs 暂存）——f4 已补钉「条款 2b」入 release-governance.md（本 commit）。纪律 1/3/4 逐字对先例吻合。
6. **判读披露 1-6 裁定**：①工单口径订正两处（32→61 / ATLAS_CONFIG_DIR_NAME）采认，记 f4 工单勘误（f4 活码核前口径失准，Main 订正正确）；②B3 历史冻结零回写采认；③README 示例裸 id 语境保留 + 0.1.123 代码版后统一改全 ref 形采认；④纪律 2/3 ——纪律 3 采认、纪律 2 按本节 5 补钉；⑤A5 README 旧断言订正采认；⑥B5 两项裁定 = **快照标注豁免**（brand-string-classification.md / architecture-charter.md 均为决策记录快照档，头注已加标注，缺引用面不修）。
7. **执行面披露核毕**：终态 commit 零 user-e2e/wab1 扫入（格 1 独立 diff 全 docs 面即证）；`git commit -- <pathspec>` 工作树内容坑记录采记。
8. **段 L 放行**：格 1-5 全 PASS + 本节在案 → Main 走段 L（bump 0.1.122 + CHANGELOG docs-only 注记）→ 生产 lane 轻形。
