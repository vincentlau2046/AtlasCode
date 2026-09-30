# Hooks

> 内容事实源：`src/hooks/`（hookEvents.ts 事件面 / types.ts 钩子形 / config-provider.ts /
> bootstrap-env.ts）、settings.json `hooks` 字段（`z.any()` 透传）、
> `--include-hook-events`（cli/parse.ts，stream-json 输出面）。

## 是什么

Hooks = 在会话生命周期关键节点执行外部命令的机制：settings.json `hooks` 配置
`事件 → 命令列表`，事件触发时按配置跑命令（`HookCommand`：`command` / `shell` /
`timeoutMs`），命令 stdout/exit code 参与会话行为（拦截/注入上下文/通知）。

## 事件面（`src/hooks/hookEvents.ts` 单一事实源）

| 事件 | 触发点 |
|---|---|
| `SessionStart` | 会话启动（source 区分 startup/resume/clear） |
| `UserPromptSubmit` | 用户提交 prompt 后 |
| `PreToolUse` | 工具调用前（可拦截，tool_name/tool_input 入参） |
| `PostToolUse` | 工具调用后（tool 结果入参） |
| `PreCompact` | 上下文压缩前 |
| `Stop` | 助手回合结束 |
| `TeammateIdle` | 队友 agent 空闲（多智能体场景） |
| `Notification` | 通知类事件 |
| `SessionEnd` | 会话结束（reason 入参） |

## 配置示例（settings.json）

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash ./scripts/pre-tool-check.sh",
        "timeoutMs": 30000
      }
    ]
  }
}
```

- 钩子输入 = 基础形（`session_id` / `transcript_path` / `cwd` / `permission_mode` /
  `agent_id` / `agent_type`）+ 按事件的扩展字段（JSON stdin 传入）。
- `--bare` 模式跳过 hooks。
- headless（`-p --output-format stream-json`）加 `--include-hook-events` 可在输出流里
  看到全部钩子生命周期事件。
- Setup / SessionStart 触发器：`--init`（Setup hooks，init 触发后继续）/
  `--init-only`（Setup + SessionStart:startup 后退出）/ `--maintenance`
  （maintenance 触发），见 cli-reference.md。
