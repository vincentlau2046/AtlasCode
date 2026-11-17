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
| A5 | issue #3 docs 三件并入 | #2 baseURL `/v1` 要求注记（providers 示例旁）；#3 settings-vs-env 先经链（settings 命中即压 env，env 仅字段缺省时 SDK 级生效）；#1 README 裸 model id 注记（池内建议全 ref 形，归一化修形走代码版）。**对端 docs PR 到达则吸收合并（f4 diff 复核），未到达则 Main 侧补写** |

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
| 1 | **零产品码格（豁免硬门）**：`git diff --stat` 零 `src/`、零 `tests/`、零构建链文件——违一项即豁免不成立转常规 gate |
| 2 | 事实性格：A1-A5 每件抽核 ≥3 个断言对活码（引用文件/行/命令/字段名逐真）；A1 勘误清单逐件在档 |
| 3 | 完整性格：A2 = cmd 32 对源码清单零缺漏零多余；A3 字段面对 `src/engine/config/types.ts` + `src/tui/utils/settings/` 权威面零缺漏（passthrough 透传族标注） |
| 4 | 归档格：B3 移档文件链接零断（grep 仓内引用面）；索引在档 |
| 5 | 制度格：B4 四纪律落档逐条对实际先例工单 |
| 6 | 回归格：README/CHANGELOG 未在本波 scope 内的面零触碰（除 A5 README 注记） |

## §3 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main docs 落码（零码，无 lock-face 需求；A5 对端 PR 若在途则 f4 先复核吸收形）→ f4 抽核（§2 格 2-5）→ gate 豁免申请（格 1 实证）→ 段 L bump 0.1.122 → 生产 lane 轻形（SRI + 安装品对表）→ 收口。
与在途波串行不抢：issue #3-1 code 件（池臂 normalizeRef）走独立代码版（0.1.123 候），不并入本版。

## §4 审计焦点预钉（呈 Atlas-reveiw）

1. A 段「全量刷新」的判据充分性：抽核 ≥3/件是否足以防「刷新了但刷错」（对照 S0-R4 教训：「单测已断言 X」须 grep 验证——引用面断言同纪律）。
2. B3 归档边界：30 天阈值与「活文档」判定面是否可机械执行（禁主观裁）。
3. A5 对端 PR 吸收的流程形：外部 docs PR 与本波合并的复核链（f4 diff 复核 + 归属记账）。
4. 语言面自决是否维持。
