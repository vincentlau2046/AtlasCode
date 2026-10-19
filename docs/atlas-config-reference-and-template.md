# AtlasCode 配置参考 + 详细模板 — 2026-10-19 f4 零码

- 触发：用户 2026-10-19「需要一个比较详细的模板，模板中对配置做一个比较详细说明；当前 atlas 配置是否有 help？」
- 角色：f4 零码规划产物（规划/判据，不落码）
- 事实源：`src/tui/utils/settings/types.ts`（schema 权威 key 面）+ `src/tui/utils/settings/constants.ts`（5 源）+ `src/tui/utils/configDir.ts`（目录解析）+ `docs/env-defaults-triage.md` / `docs/env-defaults-decision.md`（env 三档既有底）@ master 413ea12（v0.1.77 后 docs 面）

## 0. 当前配置 help 现状（回答「有没有 help」）

| 面 | 在场 | 说明 |
|---|---|---|
| `/config`（alias `/settings`） | ✅ | TUI 交互式配置面板（local-jsx），改常用设定 |
| `/doctor` | ✅ | 诊断安装与配置（`Diagnose and verify your Atlas installation and settings`） |
| `/model` `/effort` `/sandbox` `/hooks` `/permissions` `/mcp` `/keybindings` 等 | ✅ | 各专项命令（cmd 32 清单内） |
| env 三档决策底 | ✅ | `docs/env-defaults-triage.md`（31 自建 / 22 死码池 / 145 继承核心）+ `docs/env-defaults-decision.md`（保持开/预设/保持关） |
| **静态配置参考 + 可填充模板** | ❌ 缺 | **本文档 = 补这块**（零码） |

## 1. 五源模型（配置从哪来、谁压谁）

| 源 | 文件/形态 | 场景 | 优先级（高→低） |
|---|---|---|---|
| `policySettings`（managed） | `managed-settings.json` + `.d/*.json`（Linux: `/etc/atlas/managed-settings.json`；平台 MDM 变体） | 企业/管理员统一下发 | 最高 |
| `flagSettings`（cli flag） | `--settings <file.json>` 命令行指定 | 单会话临时覆盖 | ↑ |
| `localSettings`（project, gitignored） | 项目内 `.atlas/settings.local.json`（本机私有，不入库） | 本机项目特例 | ↑ |
| `projectSettings`（project） | 项目内 `.atlas/settings.json`（入库，团队共享） | 团队统一 | ↑ |
| `userSettings`（user） | **`~/.atlas/settings.json`**（机器级持久默认 = 你要的"全局配置"，已有） | 个人默认 | 最低 |

- 配置目录 = `.atlas`（`ATLAS_CONFIG_DIR_NAME` 可覆盖；无 `~/.claude` 回退，可与其它 agent 平台同机共存）。
- 源内合并规则 = 高优先级源的值覆盖低优先级同名 key（`env` map 等按 key 合并）。
- **env 变量 vs settings 文件**：真 shell/CI 环境变量 = 部署级控制（最高信任面，0.1.74 D-2 先例：部署 env 压过 repo 可种面）；settings.json 的 `env` map = 配置提供的环境变量（启动时应用，仅可信源计数；MCP CIMD 类键有 settings 源剥离纪律 0.1.74）。

## 2. settings.json 详细模板（按用途分组，全 key 说明）

> 用法：复制 §2.1 模板到 `~/.atlas/settings.json`，按需取消注释/改值。JSON 不支持注释，正式文件里删掉 `//` 行。所有 key 均可选，缺省 = 产品默认行为。

### 2.1 核心模型/LLM（最常设）

```jsonc
{
  // ── 模型面 ──
  "model": "qwen38",                // 主模型名（对应网关侧模型 id）
  "modelRoles": {                    // 角色→模型映射（多角色编排用）
    "main": "qwen38",
    "haiku": "glm-5.1",
    "opus": "deepseek-v4-pro"
  },
  "defaultRole": "main",             // 默认角色
  "availableModels": [ "qwen38", "glm-5.1" ],  // 下拉可选模型池
  "alwaysThinkingEnabled": true,     // 恒开思考（关 = 按模型默认）
  "effortLevel": "high",             // 推理档位 low/medium/high/xhigh/max
  "effortByModel": { "qwen38": "high" },  // 按模型分档
  "llmTimeoutMs": 900000,            // 单请求超时（ms；0.1.67 缺省 900s + 单位误配提示）

  // ── 提供方/鉴权 ──
  "env": {                           // 配置提供的环境变量（启动应用；真 shell/CI env 优先）
    "OPENAI_BASE_URL": "http://127.0.0.1:8999/v1",   // 你的网关端点（不设 = 内置默认端点）
    "OPENAI_API_KEY": "sk-xxx"                // 或走 apiKeyHelper
  },
  "apiKeyHelper": "sh -c 'security find-generic-password ...'",  // 动态取 key 的命令（比 env 写死更安全）

  // ── 云厂商鉴权刷新（按需）──
  "awsAuthRefresh": "aws sso login",
  "awsCredentialExport": "aws sso get-token",
  "gcpAuthRefresh": "gcloud auth login"
}
```

### 2.2 行为开关（重要设定，一次设好就不用每次命令行传）

```jsonc
{
  "autoMode": true,                  // 自动模式（auto-mode 安全分类器链；关 = 逐项询问）
  "voiceEnabled": false,             // 语音面
  "autoMemoryEnabled": true,         // 自动记忆
  "autoMemoryDirectory": "~/.atlas/memory",   // 记忆目录
  "includeGitInstructions": true,    // 读 .git 目录内指令面
  "respectGitignore": true,          // 尊重 .gitignore
  "claudeMdExcludes": [ "**/node_modules/**" ],  // 上下文文件排除
  "skipWebFetchPreflight": false,    // WebFetch 预检跳过
  "autoUpdatesChannel": "stable",    // 自动更新通道 stable/latest（0.1.71 块 B：版本检查 + nudge，默认零自动动作）
  "cleanupPeriodDays": 30,           // 会话清理周期
  "terminalTitleFromRename": true,   // 会话改名同步终端标题
  "includeCoAuthoredBy": true,       // commit 尾 Co-Authored-By 行
  "plansDirectory": "~/.atlas/plans" // 计划文件目录
}
```

### 2.3 TUI 外观

```jsonc
{
  "theme": "dark",
  "language": "zh",
  "outputStyle": "default",
  "prefersReducedMotion": false,
  "syntaxHighlightingDisabled": false,
  "spinnerTipsEnabled": true,
  "statusLine": { "type": "custom", "command": "sh -c '...'" },  // 自定义状态行
  "defaultShell": "bash"            // bash | powershell
}
```

### 2.4 MCP（模型上下文协议）

```jsonc
{
  "mcpServers": {                   // 本项目/本机的 MCP server 定义（通用，与 LLM 端点解耦）
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "my-remote": { "type": "http", "url": "https://mcp.example.com/mcp" }
  },
  "allowedMcpServers": [ "playwright" ],   // 企业面：允许集
  "deniedMcpServers": [ "dangerous" ],     // 企业面：拒绝集
  "enabledMcpjsonServers": [ "playwright" ],   // .mcp.json 里启用的
  "disabledMcpjsonServers": [ ]
  // 安全面（0.1.74/0.1.76）：per-server oauth 块整体 scope-gating——
  // project/plugin 来源的 oauth 块默认不生效，操作者 allowlist：
  //   env ATLAS_MCP_OAUTH_TRUSTED_SERVERS="a,b"（逗号分隔，settings 源不可种）
}
```

### 2.5 插件/市场

```jsonc
{
  "enabledPlugins": { "formatter@anthropic-tools": true },  // 启用的插件
  "pluginConfigs": { },               // 插件级配置
  "extraKnownMarketplaces": [ "https://github.com/anthropics/claude-plugins-official" ],  // 默认官方市场（用户 2026-10-19 裁定「带」）
  "strictKnownMarketplaces": [ ],     // 严格限定市场集（企业面）
  "blockedMarketplaces": [ ],         // 封禁市场（企业面）
  "allowedChannelPlugins": [ ],       // 渠道插件允许集
  "pluginTrustMessage": ""
}
```

### 2.6 权限 / hooks / 沙箱

```jsonc
{
  "permissions": {                    // 权限规则（allow/deny/ask，按工具+模式）
    "allow": [ "Bash(git status)", "Read(//home/vince/**)" ],
    "deny": [ "Bash(rm -rf *)" ]
  },
  "hooks": {                          // 生命周期钩子（PreToolUse/PostToolUse/PreCompact...）
    "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo audit >> ~/log" } ] } ]
  },
  "disableAllHooks": false,
  "allowedHttpHookUrls": [ "https://hooks.internal.example.com" ],  // HTTP hook 白名单
  "httpHookAllowedEnvVars": [ ],
  "sandbox": { "network": { "deniedDomains": [ "*.internal" ] } }  // 沙箱面
}
```

### 2.7 高级/企业/实验面（一般不动）

```jsonc
{
  "search": { "tavilyApiKey": "" },  // Web 搜索 provider key
  "attribution": { },                 // 品牌归属面
  "xaaIdp": { },                      // 企业 IdP
  "agent": { }, "local": { }, "worktree": { }, "remote": { },   // 各域扩展面
  "forceLoginMethod": "oauth", "forceLoginOrgUUID": "",   // 登录强制面（企业）
  "companyAnnouncements": [ ],        // 企业公告
  "minimumVersion": "", "tui": { }, "autoCompactWindow": { }, "spinnerTipsOverride": null, "spinnerVerbs": null, "fileSuggestion": null, "showClearContextOnPlanAccept": true
}
```

### 2.8 最小可用模板（通用 agent 首装，只填 3 项）

```json
{
  "env": {
    "OPENAI_BASE_URL": "http://<你的网关>/v1",
    "OPENAI_API_KEY": "<key>"
  },
  "model": "<主模型>"
}
```

## 3. 环境变量说明（核心 vs 高级，回答"能否简化"）

**总盘**：活码实读 **186 个 `ATLAS_*` + 13 个外部族**（`OPENAI_*`/`ENABLE_*`）。三档底见 `docs/env-defaults-triage.md`（31 自建 / 22 死码池 / 145 继承核心）。绝大多数**不是给用户设的**：

| 层 | 内容 | 用户是否要管 |
|---|---|---|
| **核心（~12 个，建议了解）** | 见 §3.1 | ✅ 要 |
| **高级覆盖（按需）** | `ATLAS_DISABLE_*` 族（关某功能）、`ATLAS_ENABLE_*` 族（开实验面） | 按需查 §3.2 |
| **内部面（~160 个，不要设）** | 测试缝（`ATLAS_TEST_*`/`ATLAS_MOCK_*`）/ 调试（`ATLAS_PROFILE_*`/`ATLAS_PERFETTO_*`/`ATLAS_DEBUG_*`）/ dev 基础设施（`ATLAS_BUN_BIN`/`ATLAS_CONFIG_DIR`/`ATLAS_JOB_DIR`...）/ TUI 外观细调 / SDK 内部 | ❌ 不要设（设了 = 内部行为漂移） |

### 3.1 核心环境变量（~12）

| 变量 | 作用 | 与 settings.json 关系 |
|---|---|---|
| `OPENAI_BASE_URL` | 网关端点（**不设 = 内置默认端点**；设了 = 你的端点，通用 agent 任何 OpenAI 兼容端点） | 可写 `env` map |
| `OPENAI_API_KEY` | 网关 key | 可写 `env` map / `apiKeyHelper` |
| `OPENAI_AUTH_TOKEN` | Bearer 型 token（部分网关） | 同上 |
| `ATLAS_MODEL` | 主模型（命令行级覆盖） | 对应 `model` 字段（env 优先于文件） |
| `ATLAS_FAST_MODEL` / `ATLAS_SMALL_MODEL` / `ATLAS_SUBAGENT_MODEL` | 快/小/子 agent 角色模型 | 对应 `modelRoles` |
| `ATLAS_EFFORT_LEVEL` | 推理档位 | 对应 `effortLevel` |
| `ATLAS_LLM_TIMEOUT` | 单请求超时 | 对应 `llmTimeoutMs` |
| `ATLAS_MAX_RETRIES` | 重试次数 | （暂仅 env） |
| `ATLAS_SHELL` | 执行 shell | 对应 `defaultShell` |
| `ATLAS_CONFIG_DIR_NAME` | 配置目录改名（默认 `.atlas`） | 无文件面对应 |
| `ENABLE_TOOL_SEARCH` | 工具搜索面（代理不透传 tool_reference 时显式开/关） | 无文件面对应 |
| `ATLAS_UPDATE_CHECK` | 版本检查（0.1.71 块 B；nudge 带升级指引，默认零自动动作） | 无 |

**优先级**：真 shell/CI env > settings.json `env` map（可信源）> settings.json 一等字段（如 `model`）。命令行 flag > 用户文件（5 源优先级见 §1）。

### 3.2 常用高级开关（按需）

- `ATLAS_ENABLE_MOUSE` / `ATLAS_DISABLE_MOUSE` — 鼠标面
- `ATLAS_DISABLE_AUTO_MEMORY` — 关自动记忆
- `ATLAS_DISABLE_BACKGROUND_TASKS` — 关后台任务
- `ATLAS_DISABLE_CRON` — 关掉任务
- `ATLAS_AGENT_DEFAULT_FOREGROUND` — 子 agent 前台逃生舱（0.1.66 翻转面）
- `ATLAS_DEBUG` / `ATLAS_DEBUG_LOG_LEVEL` — 调试（排障用，勿常开）

## 4. 使用路径（对应"重要设定该有初始化"）

1. **首装**：`~/.atlas/settings.json` 填 §2.8 最小模板（3 项）→ 完成。
2. **常用设定**：TUI 内 `/config`（面板）或 `/model` `/effort` `/hooks` 等专项命令改，落文件持久化。
3. **排障**：`/doctor`。
4. **团队统一**：项目内 `.atlas/settings.json`（入库共享）/ 本机特例 `.atlas/settings.local.json`（gitignore）。
5. **企业**：`managed-settings.json`（policy 源最高优先级）+ MCP/插件允许集。

> **登记（后续可选，非本次）**：首启引导流（first-run onboarding：首启自动弹 §2.8 三项设定写入用户文件）= 用户体验增强，非地基债务，用户 2026-10-19 裁定暂不做代码波，登记待排。

---
*f4 零码产物（参考/模板，不落码）。key 面以 `src/tui/utils/settings/types.ts` 为唯一事实源；新增 schema key 时同步本文档。*
