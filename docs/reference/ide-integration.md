# IDE 集成

> 代码事实源：检测/连接 = `src/tui/utils/ide.ts`（`findAvailableIDE`/`detectIDEs`/
> `getSortedIdeLockfiles`/`readIdeLockfile`/`cleanupStaleIdeLockfiles`）；lockfile 路径 =
> `getIdeLockfilesPaths()`；消费方 = `src/tui/hooks/useIDEIntegration.tsx`；`/ide` 命令 =
> `src/tui/commands/ide/`；headless 选项面 = `src/cli/parse.ts`（`buildHeadlessOptions`）。
> 刷新：0.1.122（A4 重写，工单 docs/2026-11-17-0122-docs-normalization-ticket.md）。
> 本文件引用符号名而非行号。

## 集成模型

AtlasCode ↔ IDE 走 **MCP 载体**：IDE 扩展（id `EXTENSION_ID='atlas-code'`）在本机起
服务，AtlasCode 作为 MCP client 连接（服务名 `'ide'`，transport 类型
`'sse-ide'` / `'ws-ide'`，`src/tui/services/mcp/types.ts`）。连接建立后 IDE 内选中
代码/文件可注入会话上下文；诊断信息回流。

## 发现机制（lockfile + 端口）

1. IDE 扩展启动时在 **`~/.atlas/ide/`**（`getIdeLockfilesPaths()`；WSL 下另扫 Windows
   侧 `<USERPROFILE>/.atlas/ide` 与 `/mnt/c/Users/*/.atlas/ide`）写 lockfile。
2. lockfile 名 = `<port>.lock`；内容 JSON = `LockfileJsonContent`：
   `workspaceFolders` / `pid` / `ideName` / `transport: 'ws'|'sse'` / `runningInWindows` /
   `authToken`（旧格式为路径行列表）。
3. AtlasCode 枚举 = `getSortedIdeLockfiles()`（mtime 新→旧）；有效性 =
   `cleanupStaleIdeLockfiles()`：pid 存活（`isProcessRunning`）+ 端口探活
   （`checkIdeConnection`，500ms timeout）；workspaceFolders 须包含当前 cwd
   （NFC 归一 + WSL/Windows 路径转换 `idePathConversion.ts`）。
4. 连接 URL：`ws://host:port` 或 `http://host:port/sse`；host 由 `detectHostIP`
   决定（env `ATLAS_IDE_HOST_OVERRIDE` 覆写；WSL2 → Windows 场景走默认网关探测）。

## 连接方式

- **`/ide` 命令**（交互）：探测本机已安装（available）与正在运行（running）的 IDE，
  选择目标连接，或选 `None` 断开。
- **`--ide` 启动选项**：自动发现（`findAvailableIDE()` 轮询 1s × 30s）——**恰好一个**
  有效 IDE 时自动连；零个/多个不自动连，走 `/ide` 手选。自动安装扩展可用
  env `ATLAS_IDE_SKIP_AUTO_INSTALL` 关；有效性检查可用 `ATLAS_IDE_SKIP_VALID_CHECK`
  直通；`ATLAS_SSE_PORT` 与 lockfile 端口相等亦判有效。

## 未检测到 IDE 时

`/ide` 提示：

- **JetBrains 终端**（`isSupportedJetBrainsTerminal()`）：安装对应 JetBrains 插件后
  重启 IDE 再选。
- **其他终端**：确认 IDE 已装 Atlas 扩展且正在运行（扩展未起服务 = 探测不到）。

## Headless / 第三方 IDE 驱动（stream-json）

无 IDE 扩展的集成方（编辑器插件、CI、自建 console）驱动 AtlasCode 的接入面：

```bash
# prompt 走 stdin（推荐）；输出 NDJSON 流
echo "explain this repo" | atlas -p --output-format stream-json --verbose \
  --input-format stream-json --allowedTools Read
```

- **选项约束**（`src/cli/parse.ts` 校验三支 + `src/cli/print.ts` 断言）：
  `--input-format stream-json` 要求 `--output-format stream-json`；
  `--replay-user-messages` 要求双 stream-json；`--output-format stream-json`
  要求 `--verbose`。
- **stdin gotcha**：variadic 选项（`--allowedTools`/`--tools`/`--disallowedTools`/
  `--mcp-config`/`--add-dir`/`--file`/`--betas`/`--fallback-models`）会吞尾随
  positional prompt——prompt 一律放 stdin 或放在这些选项**之前**。
- **stdout 协议**：NDJSON（`src/cli/ndjsonSafeStringify.ts` 恒产合法行）。运行时守卫
  `installStreamJsonStdoutGuard()`（`src/cli/streamJsonStdoutGuard.ts`）把非 JSON
  输出改道 stderr 并加 sentinel `[stdout-guard]`——消费者见此标记 = 有非协议输出
  混入，应报告而非吞掉。
- **entrypoint 标识**：env `ATLAS_ENTRYPOINT`（`src/cli/entryInit.ts`
  `initializeEntrypoint` 写入；值域 `'mcp'`/`'sdk-cli'`/`'cli'`/GitHub Action 透传）。
- 无 `-p` 的第三方嵌入可用 UDS 消息面（`--messaging-socket-path`，门
  `FEATURE_UDS_INBOX=true`，默认关）——见 [remote-control.md](remote-control.md)。

## Chrome 集成

`--chrome` / `--no-chrome`（`src/cli/parse.ts`）：Chrome 浏览器集成面开/关。
