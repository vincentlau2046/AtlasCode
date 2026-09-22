/**
 * hooks 域 — runHooks 参数化分发核心 + 5 高频事件执行器（C-Deep 切片 3 T6 薄骨架）
 *
 * 旧仓来源（a8af45b）: src/utils/hooks.ts 18 个 execute* 事件执行器（各 ~40L，
 * 结构 = 造 hookInput → yield* executeHooks 核心）+ processHookJSONOutput（L485）+
 * exit-code-2 阻塞约定（L2625/L3283）。
 *
 * 薄骨架裁定（§8.14「折叠 18 execute* 参数化，先实 5 高频」）：
 *  - 18 个 execute* 折叠为单一参数化 runHooks(event, hookInput, options) + 5 高频
 *    薄包装（PreToolUse / PostToolUse / SessionStart / Stop / SessionEnd）。5 高频
 *    的差异仅在 hookInput 事件字段 + 结果解释，共享同一信任门 + 匹配 + 执行 + 聚合。
 *  - 命令钩子经注入 shell 端口 HookShellPort 执行（组合根接 executor 真 Shell，
 *    §8.16 D17 hooks→executor 边切端口）；hooks 域不 import executor 域（L3）。
 *  - 裁剪（engine 波）：prompt/agent/http/callback/function 型钩子、插件变量插值、
 *    异步唤醒钩子（registerPendingAsyncHook）、messageQueue 通知、MCP elicitation、
 *    streaming yield（薄骨架返回聚合 Promise 非 AsyncGenerator）、未知 decision /
 *    hookEventName 不匹配的抛错（薄骨架宽容，仅记结果）。
 */
import { createBaseHookInput } from './createBaseHookInput'
import { getMatchingHooks } from './getMatchingHooks'
import { getHookShellPort } from './shell-port'
import { shouldSkipHookDueToTrust } from './shouldSkipHookDueToTrust'
import type { HookEvent } from './hookEvents'
import type {
  AggregatedHookResult,
  HookInput,
  HookJSONOutput,
  HookResult,
} from './types'

/** 旧仓 TOOL_HOOK_EXECUTION_TIMEOUT_MS（src/utils/hooks.ts L162，10min）。 */
const HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000
/** 旧仓 SESSION_END_HOOK_TIMEOUT_MS_DEFAULT（L171，1500ms —— 会话收尾不挂起）。 */
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500

/** 读旧仓 SESSION_END 超时 env（ATLAS_SESSIONEND_HOOKS_TIMEOUT_MS，L173）。 */
function sessionEndHookTimeoutMs(): number {
  const raw = process.env.ATLAS_SESSIONEND_HOOKS_TIMEOUT_MS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SESSION_END_HOOK_TIMEOUT_MS_DEFAULT
}

/** 某事件执行选项（signal / 超时 / 会话上下文透传 / env 覆盖）。 */
export type HookRunOptions = {
  signal?: AbortSignal
  /** 覆盖单钩子默认超时（缺省 HOOK_EXECUTION_TIMEOUT_MS；SessionEnd 用 1500ms 档）。 */
  timeoutMs?: number
  /** 旧仓 toolUseID（钩子 JSON 输出 / 阻塞错误归因）。 */
  toolUseID?: string
  /** createBaseHookInput 会话上下文（permissionMode / sessionId / agentInfo）。 */
  permissionMode?: string
  sessionId?: string
  agentInfo?: { agentId?: string; agentType?: string }
  /** 钩子进程 env 覆盖（叠加在 process.env 上）。 */
  env?: Record<string, string>
}

/** 造钩子进程 env（process.env + 覆盖；剔除 undefined 值以匹配 Record<string,string>）。 */
function buildHookEnv(override?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  if (override) Object.assign(env, override)
  return env
}

/**
 * 解释单钩子输出（旧仓 processHookJSONOutput L485 主面 + exit-2 约定 L2625/L3283）。
 * JSON 主字段：continue / decision / systemMessage / hookSpecificOutput.permissionDecision
 * / additionalContext / updatedInput / suppressOutput。exit code 2（非 aborted）→
 * stderr 阻塞错误。非 JSON stdout 当 plain text（不阻塞）。
 */
function interpretHookOutput(p: {
  command: string
  stdout: string
  stderr: string
  code: number
  aborted?: boolean
}): HookResult {
  const result: HookResult = {
    command: p.command,
    stdout: p.stdout,
    stderr: p.stderr,
    status: p.code,
    succeeded: p.code === 0,
    aborted: p.aborted,
  }
  const trimmed = p.stdout.trim()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as HookJSONOutput
      if (json.continue === false) {
        result.preventContinuation = true
        if (json.stopReason) result.stopReason = json.stopReason
      }
      if (json.decision === 'approve') {
        result.permissionBehavior = 'allow'
      } else if (json.decision === 'block') {
        result.permissionBehavior = 'deny'
        result.blockingError = {
          blockingError: json.reason || 'Blocked by hook',
          command: p.command,
        }
      }
      // PreToolUse / Stop 特定：hookSpecificOutput.permissionDecision（旧仓 L546-571/L588-609）。
      const specific = json.hookSpecificOutput as
        | {
            permissionDecision?: 'allow' | 'deny' | 'ask'
            permissionDecisionReason?: string
            additionalContext?: string
          }
        | undefined
      if (specific?.permissionDecision === 'allow') {
        result.permissionBehavior = 'allow'
      } else if (specific?.permissionDecision === 'deny') {
        result.permissionBehavior = 'deny'
        result.blockingError = {
          blockingError:
            specific.permissionDecisionReason || json.reason || 'Blocked by hook',
          command: p.command,
        }
      } else if (specific?.permissionDecision === 'ask') {
        result.permissionBehavior = 'ask'
      }
      if (specific?.additionalContext) result.additionalContext = specific.additionalContext
      if (json.additionalContext) result.additionalContext = json.additionalContext
      if (json.updatedInput) result.updatedInput = json.updatedInput
      if (json.suppressOutput) result.output = ''
      if (json.systemMessage) result.systemMessage = json.systemMessage
    } catch {
      // 非 JSON / 解析失败 stdout 当 plain text（旧仓：不以 { 开头或 parse 失败 → plainText）。
    }
  }
  // exit code 2 阻塞约定（非 aborted 且未由 JSON 已判阻塞）：stderr 作阻塞错误。
  if (!p.aborted && p.code === 2 && !result.blockingError) {
    result.blockingError = {
      blockingError: `[${p.command}]: ${p.stderr || 'No stderr output'}`,
      command: p.command,
    }
  }
  return result
}

/** permissionBehavior 最严优先聚合（deny > ask > allow > passthrough）。 */
const PERMISSION_RANK: Record<string, number> = {
  deny: 3,
  ask: 2,
  allow: 1,
  passthrough: 0,
}

/** 折叠单钩子结果进聚合（旧仓 AggregatedHookResult 主面：首阻塞 / 任续停 / 最严权限）。 */
function mergeAggregated(acc: AggregatedHookResult, r: HookResult): void {
  if (r.blockingError && !acc.blockingError) acc.blockingError = r.blockingError
  if (r.preventContinuation) acc.preventContinuation = true
  if (r.stopReason && !acc.stopReason) acc.stopReason = r.stopReason
  if (r.additionalContext) {
    acc.additionalContext = acc.additionalContext
      ? `${acc.additionalContext}\n${r.additionalContext}`
      : r.additionalContext
  }
  if (r.updatedInput) acc.updatedInput = r.updatedInput // last wins
  if (r.permissionBehavior) {
    if (
      !acc.permissionBehavior ||
      PERMISSION_RANK[r.permissionBehavior] > PERMISSION_RANK[acc.permissionBehavior]
    ) {
      acc.permissionBehavior = r.permissionBehavior
    }
  }
}

/**
 * 参数化钩子分发核心（18 execute* 折叠点）。信任门 → 匹配 → 命令钩子经注入
 * shell 端口逐条执行 → 解释 + 聚合 → 返回 AggregatedHookResult。
 *
 * 信任门：非交互恒执行；交互式缺信任全跳过（返回空 results，不执行任何钩子）。
 * 无匹配（未注入配置源 / 无 matcher / 无 command 钩子）→ 空 results 正常返回，
 * 不触碰 shell 端口（端口未注入不误伤常态）。
 */
export async function runHooks(
  hookEvent: HookEvent,
  hookInput: HookInput,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  if (shouldSkipHookDueToTrust()) {
    return { results: [] }
  }
  const matched = await getMatchingHooks(hookEvent, hookInput)
  const results: HookResult[] = []
  const aggregated: AggregatedHookResult = { results }
  if (matched.length === 0) return aggregated

  const port = getHookShellPort()
  const env = buildHookEnv(options.env)
  const signal = options.signal ?? new AbortController().signal
  for (const m of matched) {
    const cmd = m.hook
    const timeoutMs = cmd.timeoutMs ?? options.timeoutMs ?? HOOK_EXECUTION_TIMEOUT_MS
    let exec
    try {
      exec = await port.runCommand(cmd.command, env, signal, timeoutMs)
    } catch (e) {
      // spawn/执行抛错 → 非阻塞错误结果（旧仓 non-blocking error 面）。
      results.push({
        command: cmd.command,
        status: -1,
        succeeded: false,
        stderr: e instanceof Error ? e.message : String(e),
      })
      continue
    }
    const result = interpretHookOutput({
      command: cmd.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
      code: exec.code,
      aborted: exec.aborted,
    })
    results.push(result)
    mergeAggregated(aggregated, result)
  }
  return aggregated
}

/** PreToolUse：工具调用前（tool_name 匹配；decision/permissionDecision 可阻塞/放行）。 */
export async function runPreToolUseHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseID: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = {
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseID,
  }
  return runHooks('PreToolUse', hookInput, options)
}

/** PostToolUse：工具调用后（tool_name 匹配；additionalContext 回灌上下文）。 */
export async function runPostToolUseHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: unknown,
  toolUseID: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = {
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
    tool_use_id: toolUseID,
  }
  return runHooks('PostToolUse', hookInput, options)
}

/** SessionStart：会话开始（source 匹配；additionalContext 注入启动上下文）。 */
export async function runSessionStartHooks(
  source: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = { ...base, hook_event_name: 'SessionStart', source }
  return runHooks('SessionStart', hookInput, options)
}

/** Stop：主循环停止（无 matchQuery；continue===false 可阻止停止 + stopReason）。 */
export async function runStopHooks(options: HookRunOptions = {}): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = { ...base, hook_event_name: 'Stop' }
  return runHooks('Stop', hookInput, options)
}

/** SessionEnd：会话结束（reason 匹配；短超时 1500ms 档，收尾不挂起）。 */
export async function runSessionEndHooks(
  reason: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = { ...base, hook_event_name: 'SessionEnd', reason }
  return runHooks('SessionEnd', hookInput, {
    ...options,
    timeoutMs: options.timeoutMs ?? sessionEndHookTimeoutMs(),
  })
}
