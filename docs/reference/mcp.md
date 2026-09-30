# MCP 服务器配置与管理

> 内容事实源：`src/cli/parse.ts`（`registerInDomainSubcommands` mcp 族选项面）、
> `src/cli/handlers/mcp.ts`（handler 面）、`src/cli/mcpConfigWrite.ts`（写回面）、
> `src/mcp/`（连接管理 / 配置解析 / OAuth）。
> 注意：MCP 服务器可以执行代码或访问系统资源，**所有工具调用都需批准**——
> 只添加你信任的服务器。

## CLI 命令

```bash
atlas mcp add <name> <commandOrUrl> [args...]   # 添加
atlas mcp add-json <name> <json>                # 以 JSON 串添加（stdio 或 SSE）
atlas mcp remove <name>                         # 移除
atlas mcp list                                  # 列出（信任目录内运行）
atlas mcp get <name>                            # 详情（信任目录内运行）
atlas mcp serve [-d] [--verbose]                # 把 AtlasCode 作为 MCP server 启动
```

### `mcp add` 选项

| 选项 | 说明 |
|---|---|
| `-s, --scope <local\|user\|project>` | 配置作用域（默认 `local`）：local = 当前用户本机 / user = 用户全局 / project = 入库的 `.mcp.json` |
| `-t, --transport <stdio\|sse\|http>` | 传输类型（缺省 stdio） |
| `-e KEY=value` | 给 stdio 服务器设环境变量（可重复） |
| `-H "K: v"` | 给 sse/http 服务器设请求头（可重复，如 `Authorization: Bearer ...`） |
| `--client-id <id>` | sse/http 服务器的 OAuth client ID |
| `--client-secret` | 提示输入 OAuth client secret（或设 `MCP_CLIENT_SECRET` 环境变量） |
| `--callback-port <port>` | 固定 OAuth 回调端口（需预注册 redirect URI 的服务器用） |

示例：

```bash
# stdio 服务器（带环境变量）
atlas mcp add -e API_KEY=xxx my-server -- npx my-mcp-server

# stdio 服务器（带子进程参数）
atlas mcp add my-server -- my-command --some-flag arg1

# HTTP 服务器
atlas mcp add --transport http sentry https://mcp.sentry.dev/mcp

# HTTP 服务器 + 鉴权头
atlas mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer ..."
```

## 配置文件

- 作用域文件：local/user 走用户配置目录，project 走 `<project>/.mcp.json`（入库共享）。
- `--mcp-config <configs...>`：从 JSON 文件/串加载服务器（headless 场景，可重复）。
- `--strict-mcp-config`：只用 `--mcp-config` 给的服务器，忽略其他来源。
- settings.json `mcpServers` 字段亦为配置来源之一。

## 传输类型说明

- **stdio**（默认）：AtlasCode 直接 spawn 子进程，经 stdin/stdout JSON-RPC 通信。
- **sse / http**：远程 MCP 端点（URL + 可选 OAuth / 请求头）。
- 服务器连接失败不会阻塞会话：单服务器故障按 fail-soft 跳过（其余服务器照常）。
