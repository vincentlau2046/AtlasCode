# IDE 集成

> 内容事实源：`src/tui/commands/ide/ide.tsx`（/ide 命令）、`src/tui/utils/ide.ts`
> （detectIDEs / detectRunningIDEs / isSupportedJetBrainsTerminal）、
> `src/cli/parse.ts`（`--ide` 选项）、Chrome 集成（`--chrome` 选项面）。

## 连接方式

AtlasCode 与 IDE 的集成走 **MCP 服务器**面（IDE 插件起本地 MCP server，
AtlasCode 连接其端口）：

1. 在 IDE 里安装 Atlas IDE 扩展（JetBrains 系 / VS Code），插件在本机起 MCP 服务。
2. 终端里 `/ide` 命令：探测本机**已安装**（available）与**正在运行**
   （running）的 IDE 列表，选择目标建立连接（或选 `None` 断开）。
3. `--ide` 启动选项：恰好一个可用 IDE 时自动连接（多个/零个不自动，走 /ide 手选）。

## 未检测到 IDE 时

`/ide` 提示：

- **JetBrains 终端**（`isSupportedJetBrainsTerminal()`）：安装对应 JetBrains
  插件后重启 IDE，再回来选。
- **其他终端**：确认 IDE 已安装 Atlas 扩展/插件且正在运行，插件需监听 MCP 端口
  （插件未起服务 = 探测不到）。
- 连接建立后，IDE 内选中代码/文件可作为会话上下文；断开 = `/ide` 选 `None`。
- 自动连接行为可用 /ide 内对话框开关（auto-connect / disable-auto-connect
  两个对话框面，`IdeAutoConnectDialog`）。

## Chrome 集成

`--chrome` / `--no-chrome`（cli-reference.md）：控制 Chrome 集成面开/关
（浏览器会话上下文）。
