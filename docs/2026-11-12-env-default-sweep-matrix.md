# ENV 配置全量梳理——缺省反转评估矩阵 v1（f4 零码 2026-11-12，用户指令专项）

> 需求定性（用户 2026-11-12）：ENV 开关 = 开发者功能预留/不成熟功能翻转面，普通用户不设 env；凡缺省反转为更强/更友好/更 positive 的统一梳理处理。本矩阵 = 0.1.105 专项波工单 §0 底稿。
> 基数：`process.env` 全量唯一变量名 352（grep 实测 @4f6dc0bb）；产品自有（ATLAS_*/FEATURE_*）= **194**；其余 158 = 上游透传/系统（OPENAI_*/NODE_*/TERM 族等，F 类禁动）。

## §1 方法

六类分型 → 逐变量四维评估（正向价值 / 成熟度〔活面 validated?〕/ 风险〔回退面/兼容面〕/ 判据可行）→ 三裁：**翻转缺省**（入 0.1.105 波，逐项判据格 + row F）/ **退役**（删面 + literal-inventory 同步）/ **维持**（注记理由归档）。

## §2 类 A：FEATURE_* 门（3 项）

| 变量 | 现状 | 裁定 |
|---|---|---|
| FEATURE_TRANSCRIPT_CLASSIFIER | ON_BY_DEFAULT（2026-09-19 裁定翻转） | 维持 |
| FEATURE_COORDINATOR_MODE | ON_BY_DEFAULT（2026-09-21） | 维持 |
| FEATURE_AUTO_THEME | 关（watcher stub） | **0.1.102 切片 1 已处理**（真实现+翻缺省），本波不重复 |

## §3 类 B：ATLAS_DISABLE_*（~28 项）——缺省已 positive（未设 = 能力开），裁定焦点 = 死变量退役

- **退役候选（f4 实锚：src 活代码 0 命中）**：`ATLAS_DISABLE_VIRTUAL_SCROLL`、`ATLAS_DISABLE_MESSAGE_ACTIONS`（managedEnv 清单面残留否，0.1.105 波内全量死变量扫描定谳后删）。
- **维持（安全面，禁动）**：DISABLE_COMMAND_INJECTION_CHECK（缺省 = 注入检查开，fail-safe 正确）、DISABLE_REACTIVE_COMPACT、DISABLE_BACKGROUND_TASKS、DISABLE_CRON、DISABLE_FILE_CHECKPOINTING、DISABLE_MOUSE/DISABLE_MOUSE_CLICKS（fullscreen.ts:165 文档化理由：捕获鼠标破原生 select-copy，显式 opt-in 正确）、DISABLE_TERMINAL_TITLE 等。
- **评估注记**：DISABLE_EXPERIMENTAL_BETAS、DISABLE_NONESSENTIAL_TRAFFIC（上游对齐面，随 0.1.105 逐项四维核）。

## §4 类 C：ATLAS_ENABLE_*（10 项）——反转候选主盘

| 变量 | 用途 | 初裁 | 依据/条件 |
|---|---|---|---|
| ATLAS_ENABLE_TASKS | tasks 子系统总门（engine/tasks/tasks.ts:256 + tui/tasks.ts:135） | **翻转缺省=开（强候选）** | tasks 域成熟（TEAMS-TASKS-ZERO-DIFF 判据族在 e2e 活面）；0.1.105 波内回归核后翻 |
| ATLAS_ENABLE_TOOL_SEARCH | 工具搜索（toolRegistry.ts:54 大工具集过滤） | **翻转缺省=开（强候选）** | 上游对齐面（CC tool_search 同形）；engine 4 函数族在位；gate 回归核 |
| ATLAS_ENABLE_PROMPT_SUGGESTION | 输入建议（PromptSuggestion 服务） | 候选（中） | 友好性强；噪音风险 → 判据格（建议频率/关断路径）定后翻 |
| ATLAS_ENABLE_TOKEN_USAGE_ATTACHMENT | token 用量附件（attachments.ts:3370） | 候选（中） | 上游同形（token 计数器可见性）；网关 usage 面核后定 |
| ATLAS_ENABLE_FINE_GRAINED_TOOL_STREAMING | 细粒度工具流（api.ts:185） | 候选（中） | provider 侧支持面未证（IFF 网关）→ 波内 wire 探测定 |
| ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF | marketplace 启动检查退避 | 维持倾向 | 改启动时序行为，网络面风险；波内评估 |
| ATLAS_ENABLE_SDK_FILE_CHECKPOINTING | SDK 车道 checkpoint | 维持 | SDK lane 专用（TUI 面 DISABLE_FILE_CHECKPOINTING 已缺省开） |
| ATLAS_ENABLE_XAA | XAA OAuth 扩展 | 维持 | 显式不成熟（addCommand.ts:102 硬性 env 门自证） |
| ATLAS_ENABLE_MOUSE | 鼠标捕获 opt-in | 维持 | fullscreen.ts 文档化理由（破原生选择/右键），显式 opt-in 正确 |

## §5 类 D：MOCK/TEST/DEV/调试（~30 项）

MOCK_ON_NONINTERACTIVE / ASCEND_MOCK* / TEST_CRASH_BACKSTOP / TEST_FIXTURES_ROOT / OVERRIDE_DATE / DEV / DEBUG* / PROFILE_* / EXIT_AFTER_* 等——**维持**（e2e/harness 依赖面，[[user-e2e-suite]] 活用）；0.1.105 波内做「生产误设防护」注记扫描（MOCK 类在非测试态误设的行为面）。

## §6 类 E：值配置（timeout/路径/模型等）——light pass

LLM_TIMEOUT / MAX_RETRIES / SLOW_OPERATION_THRESHOLD_MS / PWSH_PARSE_TIMEOUT_MS 等——缺省值合理性逐项核（对齐上游缺省 + 实测分布）；仅标记离群项，非开关不属「反转」面。

## §7 类 F：上游透传/系统（~158 项）——禁动

OPENAI_*/NODE_*/TERM/TMUX/SHELL/PATH/SSH_* 等——环境面非产品开关，零处置。

## §8 裁定汇总与处置

- **翻转缺省（入 0.1.105 波）**：ATLAS_ENABLE_TASKS、ATLAS_ENABLE_TOOL_SEARCH（强候选）；PROMPT_SUGGESTION / TOKEN_USAGE_ATTACHMENT / FINE_GRAINED_TOOL_STREAMING（中候选，波内判据定）。
- **退役**：DISABLE_VIRTUAL_SCROLL、DISABLE_MESSAGE_ACTIONS（+波内全量死变量扫描补全）。
- **维持**：余量（理由已注记，归档本矩阵）。
- **波定义建议**：0.1.105 = ENV 缺省反转波（翻转 2-5 项逐项判据格 + 退役面 + 全量死变量扫描 + literal-inventory 同步）；row F 全程；判据面 = 翻转后 canon/前滚 standing 零回归 + 各能力激活格。
- **前置**：0.1.102/0.1.103/0.1.104 链序不插队；矩阵 v1 即 0.1.105 工单 §0 底稿，波前审视时活码复核（变量面随波演进漂移）。
