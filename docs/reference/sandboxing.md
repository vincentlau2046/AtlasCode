# 沙箱（Sandbox）

> 内容事实源：`src/sandbox/`（config.ts / createSandboxManager.ts / sandbox-backend.ts /
> sandbox-events.ts / violationText.ts / types.ts / runtime.ts）、
> `src/permissions/sandboxAccess.ts`、`src/tui/utils/settings/types.ts`（`sandbox` 字段）。

## 是什么

AtlasCode 的工具执行面（Bash / 文件操作 / Glob-Grep 等）可运行在沙箱内：
命令在受限环境中执行，越界行为被拦截并产出结构化违规事件（`sandbox-events.ts`），
违规文案由 `violationText.ts` 统一生成（用户可读的拦截说明）。

## 配置

- **settings.json**：`sandbox` 字段（`z.any()` 透传，深层嵌套逐项细化中）——
  通过 `SandboxDependencies` 注入 sandbox 域，与 env 解耦。
- **env 面**（`src/sandbox/config.ts` 单一事实源）：

| env | 说明 |
|---|---|
| `ATLAS_GLOB_TIMEOUT_SECONDS` | Glob 超时（0 = 不限时，默认 0；上限 30 min 防误设挂起） |
| `ATLAS_GLOB_HIDDEN` | Glob 是否含隐藏文件（默认关） |
| `ATLAS_GLOB_NO_IGNORE` | Glob 是否忽略 .gitignore 规则（默认关） |

## 与权限模式的关系

- 沙箱 ≠ 权限模式：沙箱约束**执行环境**（进程/文件可见面），权限模式
  （见 [security.md](security.md)）约束**操作审批面**。
- `bypassPermissions` 跳过的是审批面，不改变沙箱执行面。
- 推荐组合：无互联网沙箱容器 + `--dangerously-skip-permissions`（产品文案
  明示该组合的责任语义）。

## 违规处置

工具命令触发沙箱越界时：命令被拦（非静默放行），违规事件进入会话事件流，
UI 展示 `violationText` 文案说明被拦原因；用户可放宽 settings `sandbox` 配置
或在非沙箱环境重跑。
