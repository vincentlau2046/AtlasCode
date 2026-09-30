# 安全模型与权限

> 内容事实源：`src/permissions/permissionMode.ts`（权限模式常量）、
> `src/permissions/filesystem.ts`（敏感文件/路径保护）、`src/tui/components/BypassPermissionsModeDialog.tsx`、
> `src/cli/handlers/autoMode.ts`（auto-mode 分类器 CLI）、`src/permissions/autoMode.ts`。

## 权限模式

会话权限模式由 `--permission-mode` / settings.json `permissions.defaultMode` 设定，5 个取值
（`EXTERNAL_PERMISSION_MODES` 单一事实源）：

| 模式 | 语义 |
|---|---|
| `default` | 默认：写操作/敏感命令逐次询问 |
| `acceptEdits` | 自动接受文件编辑，其他敏感操作仍询问 |
| `plan` | 计划模式：只读探索 + 出方案，不改文件 |
| `dontAsk` | 不再询问（按已授予规则放行，未授权仍拦） |
| `bypassPermissions` | 跳过全部权限检查 |

## 跳过权限（bypass）的正确用法

`--dangerously-skip-permissions` / `--allow-dangerously-skip-permissions`：

- **仅限无互联网访问的沙箱/容器/VM**（可丢弃、可快速恢复的环境）——产品文案
  明示：使用该模式即代表你接受期间所有操作的责任。
- 有互联网访问的环境不要 bypass：工具（Bash/MCP/网络）可能外传数据。
- `--allow-dangerously-skip-permissions` 只是把 bypass 变成「可选」而非默认，
  适合脚本里按需启用。

## 文件保护面

写操作路径会经过文件系统保护检查（`src/permissions/filesystem.ts`）：

- **敏感文件**（系统关键文件）：编辑/写入需手动批准
- **UNC 路径**（Windows 网络路径）：读取需批准（防网络资源访问）
- **可疑 Windows 路径模式**：写入需手动批准
- `--add-dir` 追加允许访问的目录；`allow-dangerously-skip-permissions` 面下这些检查全部旁路（沙箱语义）

## auto 模式分类器

auto 模式 = 分类器判定每步操作是否需询问（ON_BY_DEFAULT 恒开，`feature('TRANSCRIPT_CLASSIFIER')` 门）：

```bash
atlas auto-mode defaults   # 打印默认 environment/allow/deny 规则 JSON
atlas auto-mode config     # 打印生效配置（settings 覆盖默认）
atlas auto-mode critique   # AI 评审你的自定义规则
```

## 工作区信任

- 首次进入目录会弹工作区信任对话框；`-p` 模式跳过该对话框——**只在信任目录跑 headless**。
- `mcp list` / `mcp get` 同样跳过信任对话框并 spawn `.mcp.json` 的 stdio 服务器做健康检查。
