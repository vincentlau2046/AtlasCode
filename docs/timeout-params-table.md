# 超时参数总表（timeout params table）

> **0.1.67 A-4（用户 bug 修插入波，零码文档件）**：全仓超时参数统一梳理登记。
> 用户两 PR 之一「模型超时参数统一梳理 + 需配置提示器/单位说明」的落地面。
> 本表 = 只登记不改（各子域行为零改动）；**模型超时族是唯一本波有意变更面**（缺省 600s→900s）。
> gate 仅在场核验（文档在场 + 内容准确），不跑行为探针。

## 单位纪律（关键认知）

- **模型超时族单位恒 = 毫秒（ms）**：`ATLAS_LLM_TIMEOUT` / `settings.json llmTimeoutMs` 一律按毫秒解析。
  用户「配 1800 极易超时」根因 = 把 1800 当**秒**（1800s=30min=cap）但系统按**毫秒**解析 = 1.8s。
  非代码 bug，单位误配。本波 A-2/A-3 补「单位=毫秒」误配提示（`<1min` 时提示，若按秒填请 ×1000）。
- **env 恒胜 settings**（显式 CLI/env > 持久化 settings）：模型超时族 + 其余子域均此纪律。
- **子域单位各异**：下表「单位」列逐一标注（`s` 秒 / `ms` 毫秒），勿跨子域套单位。

## 参数总表

| 参数 | 单位 | 缺省 | cap | 子域 | 锚定（@master） |
|---|---|---|---|---|---|
| `ATLAS_LLM_TIMEOUT` | **ms** | **900s（900000ms，0.1.67 用户裁 15min）** | 30min（1800000ms） | 模型请求超时 | `src/modelprovider/constants.ts`（`LLM_TIMEOUT_DEFAULT_MS`/`LLM_TIMEOUT_CAP_MS`） |
| `settings.json llmTimeoutMs` | **ms** | （缺省落 `LLM_TIMEOUT_DEFAULT_MS`） | 30min（同 cap） | 模型请求超时（settings 源缝，env 恒胜） | `src/modelprovider/index.ts`（`resolveLlmTimeoutMs`） |
| `ATLAS_GLOB_TIMEOUT_SECONDS` | s | 20s | — | Grep/Glob 工具超时 | `src/tui/tools/GrepTool/GrepTool.ts`（20s 缺省，0.1.44 统一） |
| `BASH_DEFAULT_TIMEOUT_MS` | ms | 2min（120000ms） | — | Bash 工具默认超时 | `src/engine/tools/bash/bashTimeouts.ts` |
| `BASH_MAX_TIMEOUT_MS` | ms | 10min（600000ms） | —（Bash 超时上限） | Bash 工具超时上限 | `src/engine/tools/bash/bashTimeouts.ts` |
| `MCP_TOOL_TIMEOUT` | ms | ~27.8h（100000000ms） | — | MCP 工具调用超时 | `src/tui/services/mcp/client.ts`（`DEFAULT_MCP_TOOL_TIMEOUT_MS`） |
| `ATLAS_SESSIONEND_HOOKS_TIMEOUT_MS` | ms | 1.5s（1500ms） | — | SessionEnd hooks 超时 | `src/tui/utils/hooks.ts` + `src/hooks/runHooks.ts` |
| `ATLAS_PLUGIN_GIT_TIMEOUT_MS` | ms | 120s（120000ms） | — | 插件 git clone/pull 超时 | `src/tui/utils/plugins/marketplaceManager.ts` |
| `ATLAS_PWSH_PARSE_TIMEOUT_MS` | ms | 5s（5000ms） | — | PowerShell 命令解析超时 | `src/tui/utils/powershell/parser.ts`（`DEFAULT_PARSE_TIMEOUT_MS`） |
| `ATLAS_STREAM_CLOSE_TIMEOUT` | s | 60s | — | SDK MCP 流关闭超时 | `src/tui/entrypoints/agentSdkTypes.ts`（SDK 提示） |

## 模型超时族（本波变更面 + 用户配置指引）

- **缺省**：900s（15min，0.1.67 用户裁；旧缺省 600s）。国产慢模型基线（27B xhigh 长生成）。
- **cap**：30min（1800000ms），防挂死/排队网关把整个 session 拖挂（本波不动）。
- **纪律**：env `ATLAS_LLM_TIMEOUT`（毫秒）恒胜 `settings.json llmTimeoutMs`（毫秒）恒胜缺省。
- **配置提示器（A-2/A-3）**：有效超时 `<1min（60000ms）` 时给一次性单位提示「单位=毫秒，若按秒填写请 ×1000」；
  超时错误行（A-3）补单位显形 + 上限换算 + 误配提示。**不阻断**（仅 stderr/debug + 错误行面）。
- **按秒误配指引**：想要 N 秒 → 填 `N × 1000`（如 15min → 900000，30min cap → 1800000）。

## 相关

- 判别单测：`tests/unit/modelprovider-llm-timeout*.test.ts`（resolver 三态 + 缺省 900s + 误配提示双面）。
- 本波工单：`docs/2026-10-14-p0-wave-0167-ticket.md`（块 A 超时族 4 件 A-1…A-4）。
