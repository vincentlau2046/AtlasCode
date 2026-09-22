/**
 * hooks 域 — getMatchingHooks 匹配核心（C-Deep 切片 3 T6 薄骨架）
 *
 * 旧仓来源（a8af45b）: src/utils/hooks.ts getMatchingHooks（L1604）+
 * matchesPattern（L1347）+ hookDedupKey（L1454）。
 *
 * 薄骨架裁剪（复审勿当遗漏重提）：
 *  - matcher 源经注入配置端口 getHookConfigProvider（旧仓 getHooksConfig 三源合并
 *    + managed-only 策略 = 配置加载体系，engine 波；L3：hooks 不 import 配置/插件域）。
 *  - 保留 27 事件 matchQuery 提取 switch（hookInput 的纯函数，engine 波原样复用）。
 *  - 仅保 command 钩子去重（薄骨架 5 高频命令钩子主路径）；prompt/agent/http/
 *    callback/function 型去重、`if` 条件 matcher（prepareIfConditionMatcher 依赖
 *    Tools 域）、legacy 工具名映射（AtlasCode 无 legacy 工具名）全归 engine 波。
 *  - DEFAULT_HOOK_SHELL 本地固定 'bash'（旧仓 shell/shellProvider 动态默认 shell
 *    属 executor/engine 关注）。
 */
import { getHookConfigProvider } from './config-provider'
import type { HookEvent } from './hookEvents'
import type { HookCommand, HookInput, MatchedHook } from './types'

/** 旧仓 shell/shellProvider DEFAULT_HOOK_SHELL（薄骨架固定 bash）。 */
const DEFAULT_HOOK_SHELL = 'bash'

/** FileChanged matchQuery = basename（旧仓 node:path basename；本地最小实现，免拉 node:path 进薄骨架）。 */
function basenameOf(p: unknown): string | undefined {
  if (typeof p !== 'string' || p.length === 0) return undefined
  const norm = p.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(idx + 1) : norm
}

/**
 * matcher 串匹配（旧仓 matchesPattern L1347 主逻辑）。
 * 砍 legacy 工具名映射循环 —— AtlasCode 无 legacy 工具名（normalizeLegacyToolName
 * 恒等、getLegacyToolNames 空），故 simple/pipe/regex 三态照抄、legacy 循环省略。
 */
function matchesPattern(matchQuery: string, matcher: string): boolean {
  if (!matcher || matcher === '*') return true
  // 简单串或 pipe 分隔列表（除 | 外无 regex 特殊字符）
  if (/^[a-zA-Z0-9_|]+$/.test(matcher)) {
    if (matcher.includes('|')) {
      const patterns = matcher.split('|').map(p => p.trim())
      return patterns.includes(matchQuery)
    }
    return matchQuery === matcher
  }
  // 否则按 regex 处理
  try {
    return new RegExp(matcher).test(matchQuery)
  } catch {
    // 无效 regex：旧仓 logForDebugging 后返回 false（薄骨架无 debug 依赖，静默 false）
    return false
  }
}

/** 去重键（旧仓 hookDedupKey L1454）：以 plugin/skill root 命名空间隔离跨插件模板碰撞。 */
function hookDedupKey(m: MatchedHook, payload: string): string {
  return `${m.pluginRoot ?? m.skillRoot ?? ''}\0${payload}`
}

/** 窄视图：PluginHookMatcher / SkillHookMatcher 上下文（旧仓 `'pluginRoot' in matcher` 判别）。 */
type MatcherContextView = {
  pluginRoot?: string
  pluginId?: string
  pluginName?: string
  skillRoot?: string
  skillName?: string
}

/**
 * 取某事件下匹配 hookInput 的 command 钩子列表。
 * 未注入配置源 = 返回空数组（无钩子配置是常态，非 fail-fast）。
 */
export async function getMatchingHooks(
  hookEvent: HookEvent,
  hookInput: HookInput,
): Promise<MatchedHook[]> {
  const provider = getHookConfigProvider()
  const hookMatchers = provider?.getHookMatchersForEvent(hookEvent) ?? []

  // matchQuery 提取（保留旧仓 27 事件 switch；hookInput 通配字段承载 per-event 扩展）。
  let matchQuery: string | undefined
  switch (hookInput.hook_event_name) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionRequest':
    case 'PermissionDenied':
      matchQuery = hookInput.tool_name as string | undefined
      break
    case 'SessionStart':
      matchQuery = hookInput.source as string | undefined
      break
    case 'Setup':
      matchQuery = hookInput.trigger as string | undefined
      break
    case 'PreCompact':
    case 'PostCompact':
      matchQuery = hookInput.trigger as string | undefined
      break
    case 'Notification':
      matchQuery = hookInput.notification_type as string | undefined
      break
    case 'SessionEnd':
      matchQuery = hookInput.reason as string | undefined
      break
    case 'StopFailure':
      matchQuery = hookInput.error as string | undefined
      break
    case 'SubagentStart':
    case 'SubagentStop':
      matchQuery = hookInput.agent_type as string | undefined
      break
    case 'TeammateIdle':
    case 'TaskCreated':
    case 'TaskCompleted':
      break
    case 'Elicitation':
    case 'ElicitationResult':
      matchQuery = hookInput.mcp_server_name as string | undefined
      break
    case 'ConfigChange':
      matchQuery = hookInput.source as string | undefined
      break
    case 'InstructionsLoaded':
      matchQuery = hookInput.load_reason as string | undefined
      break
    case 'FileChanged':
      matchQuery = basenameOf(hookInput.file_path)
      break
    // Stop / UserPromptSubmit / CwdChanged / WorktreeCreate / WorktreeRemove
    // 无 matchQuery（旧仓 default 分支）。
    default:
      break
  }

  // matcher 串过滤（matcher 缺省 = 通配全事件）。
  const filteredMatchers = matchQuery
    ? hookMatchers.filter(
        matcher => !matcher.matcher || matchesPattern(matchQuery!, matcher.matcher),
      )
    : hookMatchers

  // 展开为 MatchedHook（携带 plugin/skill 来源上下文，旧仓 L1689-1711 照抄）。
  const matchedHooks: MatchedHook[] = filteredMatchers.flatMap(matcher => {
    const view = matcher as MatcherContextView
    const pluginRoot = view.pluginRoot
    const pluginId = view.pluginId
    const skillRoot = view.skillRoot
    const source = pluginRoot
      ? view.pluginName
        ? `plugin:${view.pluginName}`
        : 'plugin'
      : skillRoot
        ? view.skillName
          ? `skill:${view.skillName}`
          : 'skill'
        : 'settings'
    return matcher.hooks.map(hook => ({
      hook,
      matcher: matcher.matcher ?? '',
      source,
      pluginRoot,
      pluginId,
      skillRoot,
    }))
  })

  // 薄骨架仅执行 command 钩子 → 只保 command 去重（旧仓 L1736-1757 主逻辑照抄，
  // 键 = shell\0command\0if；shell 缺省归一 DEFAULT_HOOK_SHELL 以兼容 legacy 配置）。
  // 注：HookPayload === HookCommand（types.ts），m.hook 即 command 形，无需再 cast。
  const commandHooks = matchedHooks.filter(m => m.hook.type === 'command')
  // HookCommand 通配字段 `if` 类型为 unknown（去重键需 string），取 string 值否则空。
  const getIfCondition = (ifVal: unknown): string =>
    typeof ifVal === 'string' ? ifVal : ''
  const uniqueCommandHooks = Array.from(
    new Map(
      commandHooks.map(m => [
        hookDedupKey(
          m,
          `${m.hook.shell ?? DEFAULT_HOOK_SHELL}\0${m.hook.command}\0${getIfCondition(m.hook.if)}`,
        ),
        m,
      ]),
    ).values(),
  )
  return uniqueCommandHooks
}
