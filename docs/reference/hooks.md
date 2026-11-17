# Hooks

> 内容事实源：事件面 = `src/hooks/hookEvents.ts`（`HOOK_EVENTS` 单一事实源，
> 0.1.122 实核 31 事件 = 27 基础 + PreModelSwitch/PostModelSwitch/DirectoryAdded/
> MessageDisplay 4 增补）；数据契约 = `src/engine/config/hooksSchema.ts`
> （`HooksSchema`，四类判别联合，各变体 `.passthrough()`）；执行面 =
> `src/engine/config/hooksConfig.ts`（运行时仅执行 command 变体）。
> 刷新：0.1.122（A1）。

## 是什么

Hooks = 在会话生命周期关键节点执行外部命令的机制：settings.json `hooks` 配置
`事件 → matcher 列表 → 命令列表`，事件触发时按配置跑命令，命令 stdout/exit code
参与会话行为（拦截/注入上下文/通知）。

配置结构（`hooks[event] → ConfigHookMatcher[]`，matcher = `{matcher?, hooks: ConfigHookCommand[], source?}`）。
命令四类（`type` 判别）：`command`（`{command, shell?∈[bash|powershell], timeoutMs?,
statusMessage?, once?, async?, asyncRewake?, continueOnBlock?, if?}`）、`prompt` /
`agent`（`{prompt, timeoutMs?, model?, statusMessage?, once?, if?}`）、`http`
（`{url, timeoutMs?, headers?, allowedEnvVars?, ...}`）。**运行时仅执行 command 变体**
（prompt/agent/http 契约在案，执行面留缝）。

## 事件面（31 事件全列，`HOOK_EVENTS` 实形）

工具/权限：`PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PermissionRequest` / `PermissionDenied`
生命周期：`SessionStart`（source 区分 startup/resume/clear）/ `SessionEnd`（reason 入参）/ `Setup` / `Stop` / `StopFailure` / `UserPromptSubmit` / `Notification`
压缩：`PreCompact` / `PostCompact`
子代理/团队：`SubagentStart` / `SubagentStop` / `TeammateIdle` / `TaskCreated` / `TaskCompleted`
交互：`Elicitation` / `ElicitationResult` / `MessageDisplay` / `InstructionsLoaded`
环境：`ConfigChange` / `WorktreeCreate` / `WorktreeRemove` / `CwdChanged` / `DirectoryAdded` / `FileChanged`
模型：`PreModelSwitch` / `PostModelSwitch`

## 门控链（`getHooksFromAllowedSources` 四态）

`policy disableAllHooks` → 无 hooks；`policy allowManagedHooksOnly` → 仅 policy hooks；
非 managed 源 `disableAllHooks` → 仅 policy hooks；否则全源合并。
**非 managed 源不能禁 managed hooks**。settings 键：`disableAllHooks` / `allowManagedHooksOnly`。

## 配置示例（settings.json）

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash ./scripts/pre-tool-check.sh", "timeoutMs": 30000 }
        ]
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
