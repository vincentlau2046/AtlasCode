# AtlasCode CLI Reference

> 本文件是 AtlasCode 命令行参考（repo 内 reference 指导文件族，R4 升格裁定 2026-09-30：
> 替代原虚构域深链 `code.atlas.ai/docs/en/cli-reference`）。内容以本仓真实 CLI 面为准：
> 选项定义 `src/cli/parse.ts`（commander 单一事实源）+ 子命令注册 `parse.ts
> registerInDomainSubcommands` + bin 入口 `src/atlascode/cli.ts`。
> 版本口径：`0.1.x`（package.json 单一事实源；`atlascode update --check` 可查远端最新版）。

## 安装

```bash
# npm 全局安装（发布通道 @atlasharness/atlascode，bin = atlas）
npm install -g @atlasharness/atlascode

# git 安装（开发面 / 双通道升级的另一半）
git clone git@github.com:vincentlau2046/AtlasCode.git
cd AtlasCode && bun install && bun run build
```

安装后三个命令面均可启动交互式 TUI（G-1，v0.1.2+）：`atlas` / `atlascode` / `atlas code`。

## 主命令

```
atlas [prompt] [选项]
```

- 不带 `-p`：进入交互式 TUI（React + Ink）。
- 带 `-p`：headless 模式，输出后退出（管道场景；跳过工作区信任对话框——仅在信任目录使用）。

## 顶层选项

### 输出 / headless

| 选项 | 说明 |
|---|---|
| `-p, --print` | 输出响应后退出（管道友好） |
| `--output-format <text\|json\|stream-json>` | 输出格式（仅 `-p`）：text（默认）/ json（单结果）/ stream-json（实时流） |
| `--input-format <text\|stream-json>` | 输入格式（仅 `-p`） |
| `--json-schema <schema>` | 结构化输出校验 JSON Schema（仅 `-p`，配 `--output-format` 结构化输出） |
| `--max-turns <n>` | 非交互模式最大 agent 轮数，超限提前退出（仅 `-p`） |
| `--replay-user-messages` | stdin 用户消息回显 stdout 确认（仅 stream-json 双向） |
| `--include-hook-events` | 输出流含全部 hook 生命周期事件（仅 stream-json） |
| `--include-partial-messages` | 输出流含增量消息块（仅 `-p` + stream-json） |
| `--fallback-model <model>` | 主模型过载时自动回落到指定模型（仅 `-p`） |
| `--no-session-persistence` | 不落盘会话（不可 resume；仅 `-p`） |
| `--permission-prompt-tool <tool>` | 用 MCP 工具做权限询问（仅 `-p`） |

**headless 陷阱（变长选项贪吃位置参数）**：`--allowedTools` / `--tools` /
`--disallowedTools` / `--mcp-config` 是变长选项（`<tools...>`），会贪吃其后的位置参数
prompt——`atlas -p --allowedTools Read "fix the bug"` 会把 `"fix the bug"` 当成工具名。
prompt 必须经 stdin 传入（或放在变长选项之前）：

```bash
echo "fix the bug" | atlas -p --output-format stream-json --allowedTools Read
```

### 会话

| 选项 | 说明 |
|---|---|
| `-c, --continue` | 继续当前目录最近一次会话 |
| `-r, --resume [value]` | 按会话 ID 恢复，或开交互选择器（可带搜索词） |
| `--fork-session` | resume 时新建会话 ID 而非复用原会话 |
| `--session-id <uuid>` | 指定会话 ID（必须合法 UUID） |
| `-n, --name <name>` | 会话显示名（/resume 与终端标题展示） |
| `--rewind-files <user-message-id>` | 恢复文件到指定用户消息时刻后退出（需 `--resume`） |
| `--resume-session-at <message-id>` | resume 只取到该助手消息为止（`-p`） |
| `--from-pr [value]` | 按 PR 号/URL 恢复关联会话，或开选择器 |

### 模型

| 选项 | 说明 |
|---|---|
| `--model <model>` | 会话模型：角色别名（`small` / `premium` / `fast`…）或 `provider/model` 引用（如 `bailian/qwen38-27b`） |
| `--effort <low\|medium\|high\|xhigh\|max>` | 会话 effort 档位 |
| `--betas <betas...>` | API 请求附加 beta 头（API key 用户） |
| `--agent <agent>` | 会话 agent（覆盖 settings `agent`） |
| `--agents <json>` | 内联定义自定义 agents（JSON 对象） |

### 权限

| 选项 | 说明 |
|---|---|
| `--permission-mode <default\|acceptEdits\|plan\|dontAsk\|bypassPermissions>` | 会话权限模式 |
| `--dangerously-skip-permissions` | 跳过全部权限检查（仅限无互联网沙箱） |
| `--allow-dangerously-skip-permissions` | 允许（但不默认）使用上述跳过 |
| `--allowedTools <tools...>` | 允许工具白名单（如 `Bash(git:*) Edit`） |
| `--disallowedTools <tools...>` | 拒绝工具黑名单 |
| `--tools <tools...>` | 基础工具池（`""`=全禁 / `default`=全量 / 具名列表） |
| `--add-dir <dirs...>` | 追加允许工具访问的目录 |

### 上下文 / 系统提示

| 选项 | 说明 |
|---|---|
| `--system-prompt <prompt>` / `--system-prompt-file <file>` | 整体替换系统提示（同设 inline+file → 报错退出） |
| `--append-system-prompt <prompt>` / `--append-system-prompt-file <file>` | 追加到默认系统提示 |
| `--settings <file-or-json>` | 附加 settings（JSON 文件或 JSON 串） |
| `--setting-sources <user,project,local>` | 限定加载的 settings 来源 |
| `--mcp-config <configs...>` | 从 JSON 文件/串加载 MCP 服务器 |
| `--strict-mcp-config` | 仅用 `--mcp-config` 的服务器，忽略其他 MCP 配置 |
| `--plugin-dir <path>` | 本会话加载插件目录（可重复） |
| `--bare` | 最小模式：跳过 hooks/LSP/插件同步/attribution/auto-memory/预取/ATLAS.md 自动发现，置 `ATLAS_SIMPLE=1` |
| `--disable-slash-commands` | 禁用全部 skills |
| `--chrome` / `--no-chrome` | Chrome 集成开/关 |

### 工作树 / 环境

| 选项 | 说明 |
|---|---|
| `-w, --worktree [name]` | 本会话创建 git worktree |
| `--tmux` | 为 worktree 建 tmux 会话（需 `--worktree`） |
| `--ide` | 启动时自动连接唯一可用 IDE |
| `-d, --debug [filter]` | debug 模式（类别过滤如 `api,hooks`） |
| `--debug-file <path>` | debug 日志写指定文件（隐式开 debug） |
| `--verbose` | 覆盖 settings verbose |
| `--init` / `--init-only` / `--maintenance` | 运行 Setup hooks（init 触发后继续 / SessionStart:startup 后退出 / maintenance 触发后继续） |
| `-v, --version` | 输出版本号 |

## 子命令

### `atlascode update`

远端升级（双通道）：git 安装根 → pull + bun + build；npm 全局安装 →
`install -g @atlasharness/atlascode@latest`。

```bash
atlas update            # 原地升级
atlas update --check    # 仅查最新版不安装
```

### `atlascode mcp <子命令>`

| 子命令 | 说明 |
|---|---|
| `mcp serve` | 启动 AtlasCode MCP server（`-d` debug / `--verbose`） |
| `mcp add <name> <commandOrUrl> [args...]` | 添加服务器。`-t <stdio\|sse\|http>` 选传输（默认 stdio）；`-s <local\|user\|project>` 作用域；`-e KEY=value` 环境；`-H "K: v"` 头；`--client-id` / `--client-secret` / `--callback-port` OAuth 面 |
| `mcp add-json <name> <json>` | 以 JSON 串添加（stdio 或 SSE） |
| `mcp remove <name>` | 移除（`-s` 可省，省则从存在的作用域移除） |
| `mcp list` | 列出已配服务器（注意：跳过信任对话框并 spawn .mcp.json stdio 服务器做健康检查——仅在信任目录运行） |
| `mcp get <name>` | 查看单个服务器详情 |

### `atlascode auto-mode <子命令>`

auto 模式分类器配置检视：

```bash
atlas auto-mode defaults    # 打印默认 environment/allow/deny 规则 JSON
atlas auto-mode config      # 打印生效配置（settings 覆盖默认）
atlas auto-mode critique    # AI 反馈你的自定义规则（--model 可换模型）
```

## 模型配置（headless 跑通前提）

模型车道 = OpenAI 协议静态键（无账号/订阅面）。配置来源优先级：
`settings.json`（`providers` + `modelRoles.<role>.models`）→ 环境变量
`ATLAS_<ROLE>_MODEL` / `OPENAI_AUTH_TOKEN` / `OPENAI_API_KEY`。
详见 [network-config.md](network-config.md)。
