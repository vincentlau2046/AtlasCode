# AtlasCode 文档地图（reference 指导文件族）

> R4 升格裁定（2026-09-30）：本目录是 AtlasCode 的 **repo 内 reference 指导文件族**——
> 所有产品内文档链接（TUI 帮助、命令提示、guide agent 文档地图）一律指向这里的真实
> md 文件（GitHub blob 链接），不再指向虚构域 `code.atlas.ai/docs/*`。
> 内容以本仓真实功能为准，随代码演进更新。

## 索引

| 主题 | 文件 | 何时看 |
|---|---|---|
| CLI 全量参考（选项/子命令/示例） | [cli-reference.md](cli-reference.md) | 查任何命令行选项、headless 用法、mcp/auto-mode/update 子命令 |
| 产品概览与快速上手 | [overview.md](overview.md) | 首次使用、安装、第一会话 |
| 安全模型与权限 | [security.md](security.md) | 权限模式、敏感文件保护、bypass 语义、auto 模式 |
| MCP 服务器 | [mcp.md](mcp.md) | 配置/管理 MCP 服务器、传输类型、OAuth |
| 沙箱 | [sandboxing.md](sandboxing.md) | 沙箱后端、访问控制、违规处置 |
| 记忆文件 | [memory.md](memory.md) | ATLAS.md / ATLAS.local.md、项目记忆、auto-memory |
| Hooks | [hooks.md](hooks.md) | settings.json hooks 配置与事件面 |
| 快捷键 | [keybindings.md](keybindings.md) | 自定义键位（~/.atlas/keybindings.json） |
| 远程控制 / 会话消息 | [remote-control.md](remote-control.md) | UDS 会话消息面与现状说明 |
| 网络与模型配置 | [network-config.md](network-config.md) | 网关、OpenAI 静态键、modelRoles、代理 |
| IDE 集成 | [ide-integration.md](ide-integration.md) | --ide、JetBrains/VS Code 连接 |

## 使用约定

- 本目录文件是**产品内链接的唯一落点**：TUI 内所有 `Learn more` / `For more help`
  链接指向 `https://github.com/vincentlau2046/AtlasCode/blob/master/docs/reference/<file>.md`。
- guide agent（`atlas-code-guide`）的文档地图 URL = 本文件（替代原
  `claude_code_docs_map.md` 虚构域 URL）。
- 新增主题：在本索引加一行 + 新建 md；产品内新增链接一律指回本目录。
- 事实源纪律：每个 md 头部注明其内容对应的代码事实源（src/ 路径），内容变更须与
  代码面同步（H6 防空洞：不写不存在的功能）。
