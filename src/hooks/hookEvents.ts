/**
 * hooks 域 — HOOK_EVENTS 单一事实源（C-Deep 切片 3 T6 薄骨架）
 *
 * 旧仓来源（a8af45b）: src/entrypoints/sdk/coreSchemas.ts HOOK_EVENTS（27 事件）。
 * 纯数据常量，零依赖 → 薄骨架全量随迁（跨 ≥2 域消费：hooks 域 runHooks 分发 +
 * engine 波事件面）。新仓旧入口（agentSdkTypes/coreTypes 的 re-export 链）不随迁，
 * 本文件为 hooks 域内单一事实源，engine 波建 SDK 类型面时经 index 门面 re-export。
 */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]
