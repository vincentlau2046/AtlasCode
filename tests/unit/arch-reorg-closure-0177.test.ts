/**
 * 0.1.77 P-1~P-7 架构归整终态验收核波（归整波切片③·归整收官）验收测试。
 *
 * f4 工单 `docs/2026-10-18-p0-wave-0177-ticket.md`；基线 = 6ca23aa (v0.1.76)。
 * 本波 = test-only 固化波（src diff 空 = 零行为变更），唯一落盘面 = 本文件。
 * 断言族 G-1~G-7 对应工单 P-1~P-7；五域 = engine / modelprovider / memory /
 * sandbox / executor。
 *
 * 三处口径定案（工单裁定项④「如与实测有出入以 gate 探针实测为准」覆盖；
 * f4 知会随 gate 信号）：
 *  1. G-3a 闭集 = 5 文件：工单 3 文件集 + tui/contextHostWiring.ts（D-2a S8
 *     M5 切端，engine context 簇宿主侧端口接线，文件头注自登记窄窗口）+
 *     tui/main.tsx（#203 ModelSetup 首启引导 eager setEndpointConfigSource
 *     注册）；factory 窄窗口 scope 扩含 setEndpointConfigSource（组合根注册
 *     注入窗口 R5）。
 *  2. G-7 计数下限用 Main 实测（engine 95 / modelprovider 10 / memory 6 /
 *     sandbox 5 / executor 7；工单 memory 7 / sandbox 7 / executor 8 →
 *     下调为实测锚，只涨不缩）。
 *  3. G-3a 调用点排除规则：错误信息字符串字面量（'...须先 setX()...'）、
 *     定义行、import/export 行不计；setMockPort = APP-local 静态（工单
 *     明言不计入）。
 *
 * 分层纪律：unit 层——源级扫描（读仓库自身 = 确定性，零网络 / 零盘写）+
 * G-4 字面 required-set（单向子集）+ G-3b 单一运行时 import（组合根
 * compose.ts 直 import = 工单点名面，模块图实测 4ms 零副作用；env
 * 快照/复原按工单裁定项②）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  getCoreDependencies,
  resetCoreDependencies,
} from '../../src/atlascode/compose.js'

const ROOT = join(import.meta.dir, '..', '..')

const DOMAINS = ['engine', 'modelprovider', 'memory', 'sandbox', 'executor'] as const
type Domain = (typeof DOMAINS)[number]

// ── 仓库快照（模块级单次装载；--isolate 隔离进程 = 无跨文件泄漏）──
function walkSrc(): string[] {
  const out: string[] = []
  const base = join(ROOT, 'src')
  const stack: string[] = [base]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') {
        continue
      }
      const abs = join(cur, e.name)
      if (e.isDirectory()) {
        stack.push(abs)
      } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
        out.push(relative(ROOT, abs))
      }
    }
  }
  return out
}
const SRC_FILES: readonly string[] = walkSrc()
const SRC_TEXT: Record<string, string> = Object.fromEntries(
  SRC_FILES.map((rel): [string, string] => [
    rel,
    readFileSync(join(ROOT, rel), 'utf8'),
  ]),
)

function domainOf(rel: string): Domain | null {
  for (const d of DOMAINS) {
    if (rel === `src/${d}` || rel.startsWith(`src/${d}/`)) return d
  }
  return null
}

/** 相对 specifier 从 fromRel 所在目录解析（.js→.ts / .jsx→.tsx 映射）。 */
function resolveSpec(spec: string, fromRel: string): string {
  let p = normalize(join(dirname(fromRel), spec))
  if (p.endsWith('.js') && existsSync(join(ROOT, `${p.slice(0, -3)}.ts`))) {
    p = `${p.slice(0, -3)}.ts`
  } else if (p.endsWith('.jsx') && existsSync(join(ROOT, `${p.slice(0, -4)}.tsx`))) {
    p = `${p.slice(0, -4)}.tsx`
  }
  return p
}
function isDir(rel: string): boolean {
  try {
    return statSync(join(ROOT, rel)).isDirectory()
  } catch {
    return false
  }
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
function importSpecs(rel: string): { spec: string; line: number }[] {
  const out: { spec: string; line: number }[] = []
  const lines = SRC_TEXT[rel].split('\n')
  lines.forEach((line, i) => {
    IMPORT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(line)) !== null) {
      out.push({ spec: m[1], line: i + 1 })
    }
  })
  return out
}

// ================= G-1 门面唯一（P-1）=================
describe('G-1 门面唯一（P-1）', () => {
  test('五域门面文件在场（5/5）', () => {
    for (const d of DOMAINS) {
      expect(
        existsSync(join(ROOT, 'src', d, 'index.ts')),
        `src/${d}/index.ts`,
      ).toBe(true)
    }
  })
  test('非域代码 → 域深文件 import = 0（目录/index import = 门面 = 合法）', () => {
    const violations: string[] = []
    for (const rel of SRC_FILES) {
      if (domainOf(rel) !== null) continue
      for (const { spec, line } of importSpecs(rel)) {
        if (!spec.startsWith('.')) continue
        const resolved = resolveSpec(spec, rel)
        const d = domainOf(resolved)
        if (d === null) continue
        if (isDir(resolved)) continue // 目录 import 解析至 index（门面）
        if (resolved === `src/${d}/index.ts`) continue // 显式 index import（门面）
        violations.push(`${rel}:${line} -> ${resolved}`)
      }
    }
    expect(violations, `deep-file 违规:\n${violations.join('\n')}`).toEqual([])
  })
})

// ================= G-2 依赖方向（P-2）=================
describe('G-2 依赖方向（P-2）', () => {
  test('五域 → APP（src/tui / src/cli）import = 0（依赖方向单向）', () => {
    const violations: string[] = []
    for (const rel of SRC_FILES) {
      if (domainOf(rel) === null) continue
      for (const { spec, line } of importSpecs(rel)) {
        if (!spec.startsWith('.')) continue
        const resolved = resolveSpec(spec, rel)
        if (
          resolved.startsWith('src/tui/') ||
          resolved.startsWith('src/cli/')
        ) {
          violations.push(`${rel}:${line} -> ${resolved}`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})

// ================= G-3 组合根唯一（P-3）=================
const PORT_SETTER_UNIVERSE = [
  'setSessionContextPort',
  'setHookShellPort',
  'setCompactPorts',
  'setBootstrapStatePort',
  'setTaskOutputPort',
  'setExecutorSandboxPort',
  'setSessionMemoryPort',
  'setEndpointConfigSource',
  'setReactiveCompactPort',
  'setSessionMemoryCompactPort',
  'setHooksBootstrapEnv',
  'setHookConfigProvider',
] as const
// setMockPort 不计入 = APP-local 静态（AscendExecutor mock 端口，工单 G-3a 明言）。

interface CallHit {
  file: string
  name: string
  line: number
}
/**
 * 调用点探测：行内含 `name(` 且非注释 / 非字符串字面量行（错误信息串
 * '...须先 setX()...'）/ 非 import·export 行 / 非定义行。
 */
function findCalls(rel: string, names: readonly string[]): CallHit[] {
  const hits: CallHit[] = []
  const lines = SRC_TEXT[rel].split('\n')
  lines.forEach((raw, i) => {
    const t = raw.trim()
    if (
      t === '' ||
      t.startsWith('*') ||
      t.startsWith('//') ||
      t.startsWith('/*')
    ) {
      return
    }
    if (t.startsWith("'") || t.startsWith('"') || t.startsWith('`')) return
    if (/^(import|export)\b/.test(t)) return
    for (const n of names) {
      if (!new RegExp(`\\b${n}\\s*\\(`).test(raw)) continue
      if (new RegExp(`(?:function|const|let|var)\\s+${n}\\s*[(=]`).test(raw)) {
        return // 定义行
      }
      hits.push({ file: rel, name: n, line: i + 1 })
    }
  })
  return hits
}

const ASSEMBLY_CLOSED_SET = [
  'src/atlascode/compose.ts',
  'src/cli/hooksWiring.ts',
  'src/tui/contextHostWiring.ts',
  'src/tui/factory.ts',
  'src/tui/main.tsx',
] as const
const APP_ROOTS = ['src/tui/', 'src/cli/', 'src/atlascode/'] as const

describe('G-3 组合根唯一（P-3）', () => {
  test('跨域装配调用点文件全集 = 5 文件闭集（新增第 6 件 = 红）', () => {
    const callers = new Set<string>()
    for (const rel of SRC_FILES) {
      if (!APP_ROOTS.some((r) => rel.startsWith(r))) continue
      for (const h of findCalls(rel, PORT_SETTER_UNIVERSE)) {
        callers.add(h.file)
      }
    }
    expect([...callers].sort()).toEqual([...ASSEMBLY_CLOSED_SET].sort())
  })
  test('factory 窄窗口 scope ⊆ {setExecutorSandboxPort, setBootstrapStatePort, setEndpointConfigSource}', () => {
    const scope = new Set([
      'setExecutorSandboxPort',
      'setBootstrapStatePort',
      'setEndpointConfigSource',
    ])
    const called = new Set(
      findCalls('src/tui/factory.ts', PORT_SETTER_UNIVERSE).map((h) => h.name),
    )
    for (const n of called) {
      expect(scope.has(n), `factory.ts 调出窗口 ${n}`).toBe(true)
    }
    expect(called.has('setExecutorSandboxPort')).toBe(true)
    expect(called.has('setBootstrapStatePort')).toBe(true)
  })
  test('hooksWiring ⊆ 3 hooks 窗口（全 3 在场）', () => {
    const scope = new Set([
      'setHooksBootstrapEnv',
      'setHookShellPort',
      'setHookConfigProvider',
    ])
    const called = new Set(
      findCalls('src/cli/hooksWiring.ts', PORT_SETTER_UNIVERSE).map(
        (h) => h.name,
      ),
    )
    for (const n of called) {
      expect(scope.has(n), `hooksWiring.ts 调出窗口 ${n}`).toBe(true)
    }
    for (const n of scope) {
      expect(called.has(n), `hooksWiring.ts 缺 ${n}`).toBe(true)
    }
  })
  test('contextHostWiring ⊆ engine context 3 窗口（全 3 在场）', () => {
    const scope = new Set([
      'setCompactPorts',
      'setReactiveCompactPort',
      'setSessionMemoryCompactPort',
    ])
    const called = new Set(
      findCalls('src/tui/contextHostWiring.ts', PORT_SETTER_UNIVERSE).map(
        (h) => h.name,
      ),
    )
    for (const n of called) {
      expect(
        scope.has(n),
        `contextHostWiring.ts 调出窗口 ${n}`,
      ).toBe(true)
    }
    for (const n of scope) {
      expect(called.has(n), `contextHostWiring.ts 缺 ${n}`).toBe(true)
    }
  })
  test('main.tsx ⊆ {setEndpointConfigSource}（在场）', () => {
    const called = new Set(
      findCalls('src/tui/main.tsx', PORT_SETTER_UNIVERSE).map((h) => h.name),
    )
    expect([...called].sort()).toEqual(['setEndpointConfigSource'])
  })
  test('compose.ts（组合根）五域核心端口接线 ⊇ 5 件套', () => {
    const called = new Set(
      findCalls('src/atlascode/compose.ts', PORT_SETTER_UNIVERSE).map(
        (h) => h.name,
      ),
    )
    for (const n of [
      'setSessionContextPort',
      'setSessionMemoryPort',
      'setTaskOutputPort',
      'setExecutorSandboxPort',
      'setBootstrapStatePort',
    ]) {
      expect(called.has(n), `compose.ts 缺 ${n}`).toBe(true)
    }
  })
  test('运行时单实例不变式：getCoreDependencies 连调同实例 → resetCoreDependencies → 新实例（env 快照/复原）', () => {
    // 组合根 4 槽面（6ca23aa 实测 = sandboxManager / modelProvider /
    // memoryStore / appState；只记不锁，工单裁定② = 同一性不变式）。
    const envSnapshot = { ...process.env }
    try {
      const a = getCoreDependencies()
      expect(getCoreDependencies()).toBe(a)
      resetCoreDependencies()
      const c = getCoreDependencies()
      expect(c).not.toBe(a)
    } finally {
      resetCoreDependencies()
      process.env = envSnapshot
    }
  })
})

// ================= G-4 五域契约单向子集（P-4）=================
// required-set = 各门面基线日（6ca23aa）export 名全量（字面冻结；单向
// 子集：删除/改名 = 红，新增 = 绿；工单裁定①）。
const REQUIRED_ENGINE: readonly string[] = [
      'AGENT_TOOL_NAME', 'ALL_AGENT_DISALLOWED_TOOLS', 'ASK_USER_QUESTION_TOOL_NAME', 'ASYNC_AGENT_ALLOWED_TOOLS', 'AUTOCOMPACT_BUFFER_TOKENS', 'AUTOCOMPACT_KEEP_RECENT',
      'AUTOCOMPACT_PRESET_WINDOW_TIERS', 'AbortError', 'ActivityDescriptionResolver', 'AgentColorMessage', 'AgentDefinition', 'AgentHookCommand',
      'AgentId', 'AgentLoopArgs', 'AgentLoopContextConfig', 'AgentLoopDeps', 'AgentLoopDepsBundle', 'AgentLoopDepsConfig',
      'AgentLoopEvent', 'AgentLoopResult', 'AgentNameMessage', 'AgentProgress', 'AgentRoundResult', 'AgentSettingMessage',
      'AgentStatus', 'AgentTool', 'AgentToolResult', 'AiTitleMessage', 'AppState', 'AskArgs',
      'AskUserQuestionTool', 'AttachmentMessage', 'AutoCompactCompactOptions', 'AutoCompactDeps', 'AutoCompactEnvOverrides', 'AutoCompactOutcome',
      'AutoCompactTrackingState', 'AutoCompactWindowPerModel', 'AutoCompactWindowResolution', 'AutoCompactWindowSetting', 'AutoCompactWindowSettingLike', 'BACKGROUND_BASH_SUMMARY_PREFIX',
      'BASH_TOOL_NAME', 'BING_DEFAULT_ENDPOINT', 'BackendType', 'BashTaskKind', 'BashTool', 'CHECKIN_REFRESH_AMOUNT',
      'COMMAND_NAME_TAG', 'COMPACT_MAX_OUTPUT_TOKENS', 'CONFIG_TOOL_NAME', 'COORDINATOR_MODE_ALLOWED_TOOLS', 'CRON_CREATE_TOOL_NAME', 'CRON_DELETE_TOOL_NAME',
      'CRON_LIST_TOOL_NAME', 'CUSTOM_AGENT_DISALLOWED_TOOLS', 'CacheSafeParams', 'CachedMCModulePort', 'ClaimTaskOptions', 'ClaimTaskResult',
      'Command', 'CommandHookCommand', 'CompactContext', 'CompactDeps', 'CompactOptions', 'CompactPorts',
      'CompactProgressEvent', 'CompactionResult', 'ConfigHookCommand', 'ConfigHookMatcher', 'ConfigTool', 'ContentReplacementEntry',
      'ContentReplacementRecord', 'CronCreateTool', 'CronDeleteTool', 'CronFields', 'CronJitterConfig', 'CronListTool',
      'CronScheduler', 'CronTask', 'CustomTitleMessage', 'DEFAULT_AGENT_LOOP_MAX_TURNS', 'DEFAULT_CRON_JITTER_CONFIG', 'DEFAULT_GOAL_CHECKIN_MINUTES',
      'DEFAULT_MAX_GOAL_TURNS', 'DEFAULT_SESSION_MEMORY_CONFIG', 'DEFAULT_TASKS_MODE_TASK_LIST_ID', 'DangerousPermissionInfo', 'DeferredToolUsePayload', 'DirectMessageResult',
      'DomainPackage', 'ENTER_PLAN_MODE_TOOL_NAME', 'ENTER_WORKTREE_TOOL_NAME', 'ERROR_MESSAGE_INCOMPLETE_RESPONSE', 'ERROR_MESSAGE_NOT_ENOUGH_MESSAGES', 'ERROR_MESSAGE_PROMPT_TOO_LONG',
      'ERROR_MESSAGE_USER_ABORT', 'ERROR_THRESHOLD_BUFFER_TOKENS', 'EXIT_PLAN_MODE_V2_TOOL_NAME', 'EXIT_WORKTREE_TOOL_NAME', 'EditTool', 'EditablePromptInputMode',
      'EditableSettingSource', 'EngineState', 'EnterPlanModeTool', 'EnterWorktreeTool', 'Entry', 'ExitPlanModeV2Tool',
      'ExitWorktreeTool', 'FILE_EDIT_TOOL_NAME', 'FILE_READ_TOOL_NAME', 'FILE_WRITE_TOOL_NAME', 'FORK_AGENT', 'FORK_BOILERPLATE_TAG',
      'FORK_DIRECTIVE_PREFIX', 'FORK_SUBAGENT_TYPE', 'FieldPath', 'GENERAL_PURPOSE_AGENT', 'GIT_NO_PROMPT_ENV', 'GLOB_TOOL_NAME',
      'GOAL_CHECKIN_BACKOFF_MULTIPLIERS', 'GREP_TOOL_NAME', 'GateVerdict', 'GlobTool', 'GoalErrorClass', 'GoalEvaluationResult',
      'GoalStateSnapshot', 'GrepTool', 'HookCommandSchema', 'HookMatcherSchema', 'HookPermissionBehavior', 'HookResultMessage',
      'HookStreamYield', 'HooksSchema', 'HooksSettings', 'HttpHookCommand', 'INTERNAL_WORKER_TOOLS', 'INTERRUPT_MESSAGE',
      'INTERRUPT_MESSAGE_FOR_TOOL_USE', 'IN_PROCESS_TEAMMATE_ALLOWED_TOOLS', 'IdleNotificationMessage', 'ImageDimensions', 'InjectedAgentFile', 'LEGACY_TOOL_NAME_ALIASES',
      'LITE_READ_BUF_SIZE', 'LSPTool', 'LSP_TOOL_NAME', 'LastPromptMessage', 'LegacyProgressEntry', 'ListMcpResourcesTool',
      'LocalAgentTask', 'LocalAgentTaskState', 'LocalShellTask', 'LocalShellTaskState', 'LogOption', 'LoopHooks',
      'MANUAL_COMPACT_BUFFER_TOKENS', 'MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES', 'MAX_GOAL_CHECKINS', 'MAX_GOAL_CONDITION_CHARS', 'MAX_PTL_RETRIES', 'MAX_TRANSCRIPT_READ_BYTES',
      'MAX_WORKER_SPAWN_DEPTH', 'MCPServerConnection', 'McpClientEntry', 'McpClientRegistry', 'McpResourceContent', 'McpResourceItem',
      'McpSkillCommandSource', 'McpToolClient', 'McpToolDescriptor', 'McpToolResult', 'MergeCustomizer', 'Message',
      'MessageOrigin', 'MicrocompactDeps', 'MicrocompactOutcome', 'MicrocompactResult', 'ModeEntry', 'ModeSetRequestMessage',
      'ModeSetRequestMessageSchema', 'NOTEBOOK_EDIT_TOOL_NAME', 'NotebookEditTool', 'OrphanedPermission', 'PANEL_GRACE_MS', 'POLL_INTERVAL_MS',
      'PRLinkMessage', 'PTL_RETRY_MARKER', 'PartialCompactDirection', 'PartialCompactPort', 'PastedContent', 'PendingCacheEdits',
      'PermissionCallContext', 'PermissionGate', 'PermissionModeSchema', 'PermissionRequestMessage', 'PermissionResponseMessage', 'PermissionRuleFromEditableSettings',
      'PersistedWorktreeSession', 'PipelineDeps', 'PlanApprovalRequestMessage', 'PlanApprovalRequestMessageSchema', 'PlanApprovalResponseMessage', 'PlanApprovalResponseMessageSchema',
      'PopAllEditableResult', 'PostCompactHookResult', 'PostCompactReset', 'PostToolUseHookOutcome', 'PreCompactHookResult', 'PreToolUseHookOutcome',
      'ProcessedResume', 'ProgressTracker', 'PromptHookCommand', 'PromptInputMode', 'QueuePriority', 'QueuedCommand',
      'REPL_TOOL_NAME', 'ReactiveCompactOutcome', 'ReactiveCompactPort', 'ReadMcpResourceTool', 'ReadTool', 'RecompactionInfo',
      'RenderableMessage', 'ResolvedAgentTools', 'ResumeLoadResult', 'RunAgentArgs', 'RunAgentResult', 'SAFE_ENV_VARS',
      'SEND_MESSAGE_TOOL_NAME', 'SETTING_SOURCES', 'SHELL_TOOL_NAMES', 'SKILL_TOOL_NAME', 'SKIP_PRECOMPACT_THRESHOLD', 'SNIP_NUDGE_TEXT',
      'SNIP_TOOL_NAME', 'STOPPED_DISPLAY_MS', 'SYNTHETIC_OUTPUT_TOOL_NAME', 'SandboxPermissionRequestMessage', 'SandboxPermissionResponseMessage', 'SchedulerEnv',
      'SchedulerLockOptions', 'SchemaValidationResult', 'SdkEvent', 'SearchProviderError', 'SendMessageTool', 'SerializedMessage',
      'SessionContextPort', 'SessionEnv', 'SessionId', 'SessionMemoryCompactPort', 'SessionMemoryConfig', 'SessionMemoryPort',
      'SessionSnapshot', 'SetAppState', 'SettingSource', 'SettingsJson', 'SettingsSchema', 'SettingsWithErrors',
      'ShutdownApprovedMessage', 'ShutdownApprovedMessageSchema', 'ShutdownRejectedMessage', 'ShutdownRejectedMessageSchema', 'ShutdownRequestMessage', 'ShutdownRequestMessageSchema',
      'Signal', 'SkillCommandContext', 'SkillTool', 'SnipTool', 'StateUpdater', 'StopTaskError',
      'SummaryMessage', 'SystemCompactBoundaryMessage', 'TASK_CREATE_TOOL_NAME', 'TASK_GET_TOOL_NAME', 'TASK_LIST_TOOL_NAME', 'TASK_OUTPUT_TOOL_NAME',
      'TASK_STATUSES', 'TASK_STOP_TOOL_NAME', 'TASK_UPDATE_TOOL_NAME', 'TAVILY_DEFAULT_ENDPOINT', 'TEAMMATE_MESSAGE_TAG', 'TEAM_CREATE_TOOL_NAME',
      'TEAM_DELETE_TOOL_NAME', 'TEAM_LEAD_NAME', 'TIME_BASED_MC_CLEARED_MESSAGE', 'TIME_BASED_MC_CONFIG_DEFAULTS', 'TODO_WRITE_TOOL_NAME', 'TOOL_PRESETS',
      'TOOL_SEARCH_TOOL_NAME', 'TagMessage', 'Task', 'TaskAssignmentMessage', 'TaskAttachment', 'TaskCreateTool',
      'TaskGetTool', 'TaskListTool', 'TaskNotification', 'TaskOutputTool', 'TaskState', 'TaskStatus',
      'TaskStopTool', 'TaskSummaryMessage', 'TaskUpdateTool', 'TeamCreateTool', 'TeamDeleteTool', 'TeamInfo',
      'TeamMember', 'TeamPermissionUpdateMessage', 'TeammateContext', 'TeammateMessage', 'TimeBasedMCConfig', 'TodoItem',
      'TodoList', 'TodoStatus', 'TodoWriteTool', 'TokenWarningParams', 'TokenWarningState', 'ToolActivity',
      'ToolBatch', 'ToolBatchOutcome', 'ToolExecutionOutcome', 'ToolHooks', 'ToolHooksAdapterOptions', 'ToolPreset',
      'ToolRegistryDeps', 'ToolSearchTool', 'Transcript', 'TranscriptMessage', 'TryReactiveCompactParams', 'UUID',
      'UnassignTasksResult', 'ValidationError', 'WARNING_THRESHOLD_BUFFER_TOKENS', 'WEB_FETCH_TOOL_NAME', 'WEB_SEARCH_TOOL_NAME', 'WORKER_AGENT',
      'WORKFLOW_TOOL_NAME', 'WebFetchTool', 'WebSearchExecutionContext', 'WebSearchHttpResponse', 'WebSearchProvider', 'WebSearchTool',
      'WebSearchTransport', 'WebSearchTransportInit', 'WorktreeListEntry', 'WorktreeSession', 'WorktreeStateEntry', 'WriteTool',
      'addCronTask', 'addPermissionRulesToSettings', 'adoptResumedSessionFile', 'appendMessageToLocalAgent', 'applyConfigEnvironmentVariables', 'applySafeConfigEnvironmentVariables',
      'applyTaskOffsetsAndEvictions', 'armGoal', 'ask', 'autoCompactCircuitStore', 'autoCompactIfNeeded', 'backgroundAgentTask',
      'backgroundAll', 'backgroundExistingForegroundTask', 'bashToolHasPermission', 'blockTask', 'buildChildMessage', 'buildConversationChain',
      'buildForkedMessages', 'buildMcpToolName', 'buildMissedTaskNotification', 'buildPostCompactMessages', 'buildSchemaNotSentHint', 'buildWorktreeNotice',
      'builtInCommandNames', 'cacheSessionTitle', 'calculateTokenWarningState', 'canCheckIn', 'captureHooksConfigSnapshot', 'check',
      'claimTask', 'classifyGoalError', 'classifyToolError', 'cleanMessagesForLogging', 'cleanupStaleAgentWorktrees', 'cleanupWorktree',
      'clearAgentTranscriptSubdir', 'clearAutoCompactCircuitFailures', 'clearCommandQueue', 'clearCommandsCache', 'clearCompactWarningSuppression', 'clearDynamicTeamContext',
      'clearGoal', 'clearLeaderTeamName', 'clearMailbox', 'clearPendingNotifications', 'clearPluginSettingsBase', 'clearPostCompactResetsForTesting',
      'clearSessionMessagesCache', 'clearSessionMetadata', 'collapseTeammateShutdowns', 'compactConversation', 'compactWarningStore', 'completeAgentTask',
      'computeChildSpawnDepth', 'computeNextCronRun', 'countToolUses', 'createAbortController', 'createActivityDescriptionResolver', 'createAgentLoopDeps',
      'createAgentWorktree', 'createAutoCompactCompact', 'createChildAbortController', 'createCompactBoundaryMessage', 'createCronScheduler', 'createDefaultTeamContextStore',
      'createDisabledBypassPermissionsContext', 'createDontAskTpc', 'createHooksConfigProvider', 'createIdleNotification', 'createLoopHooks', 'createMcpTools',
      'createModeSetRequestMessage', 'createPermissionGate', 'createPermissionRequestMessage', 'createPermissionResponseMessage', 'createProgressTracker', 'createReadRuleSuggestion',
      'createSandboxPermissionRequestMessage', 'createSandboxPermissionResponseMessage', 'createShutdownApprovedMessage', 'createShutdownRejectedMessage', 'createShutdownRequestMessage', 'createSignal',
      'createTask', 'createTeammateContext', 'createTmuxSessionForWorktree', 'createToolHooks', 'createUserMessage', 'createWorktreeForSession',
      'cronToHuman', 'deletePermissionRule', 'deletePermissionRuleFromSettings', 'deleteTask', 'dequeue', 'dequeueAll',
      'dequeueAllMatching', 'dequeuePendingNotification', 'doesMessageExistInSession', 'drainPendingBackgroundAgents', 'drainPendingMessages', 'drainSdkEvents',
      'emitTaskTerminatedSdk', 'enqueue', 'enqueueAgentNotification', 'enqueuePendingNotification', 'enqueueSdkEvent', 'enqueueTaskNotification',
      'enterExistingWorktreeForSession', 'estimateMessageTokens', 'evaluateGoal', 'evaluateTimeBasedTrigger', 'evictTerminalTask', 'execFileNoThrowWithCwd',
      'executeToolUse', 'extractDiscoveredToolNames', 'extractFirstPrompt', 'extractLastJsonStringField', 'extractTextContent', 'failAgentTask',
      'filterHitsByDomains', 'filterInvalidPermissionRules', 'filterToolsByDenyRules', 'filterToolsForAgent', 'finalizeAgentTool', 'findCanonicalGitRoot',
      'findGitRoot', 'findMcpServerConnection', 'findMissedTasks', 'findTool', 'flushSessionStorage', 'formatAgentId',
      'formatAgentLine', 'formatCompactSummary', 'formatTeammateMessages', 'formatZodError', 'generateRequestId', 'generateTaskAttachments',
      'generateTmuxSessionName', 'getActiveAgentsFromList', 'getAgentId', 'getAgentName', 'getAgentStatuses', 'getAgentTranscriptPath',
      'getAllBaseTools', 'getAllTasks', 'getAssistantMessageText', 'getAtlasConfigHomeDir', 'getAutoCompactCircuitFailures', 'getAutoCompactEnvOverrides',
      'getAutoCompactThreshold', 'getAutoModeConfig', 'getAutoModeUnavailableReason', 'getBaseToolEntities', 'getBranch', 'getBuiltInAgents',
      'getBundledSkills', 'getCachedMCConfig', 'getCachedMCModulePort', 'getCachedParsedFile', 'getCachedSettingsForSource', 'getCheckInDelayMs',
      'getCheckInStateForTesting', 'getCommandQueue', 'getCommandQueueLength', 'getCommandQueueSnapshot', 'getCommands', 'getCommandsByMaxPriority',
      'getCommonDir', 'getCompactPorts', 'getCompactPrompt', 'getCompactUserSummaryMessage', 'getCoordinatorAgents', 'getCoordinatorSystemPrompt',
      'getCoordinatorUserContext', 'getCoordinatorWorkerSystemPrompt', 'getCronFilePath', 'getCronJitterConfig', 'getCurrentWorktreeSession', 'getDefaultBranch',
      'getDomainMount', 'getDynamicTeamContext', 'getEffectiveContextWindowSize', 'getEnabledSettingSources', 'getEntrypoint', 'getFirstMeaningfulUserMessageTextContent',
      'getGitBranch', 'getGoalCheckInMinutes', 'getGoalCondition', 'getGoalPausedReason', 'getGoalStateForPersistence', 'getHooksConfigFromSnapshot',
      'getInboxPath', 'getInitialSettings', 'getLastPeerDmSummary', 'getLastSummarizedMessageId', 'getManagedSettingsDir', 'getManagedSettingsDropInDir',
      'getMcpClientRegistry', 'getMcpPrefix', 'getMcpSkillCommands', 'getParentSessionId', 'getPendingNotificationsCount', 'getPendingNotificationsSnapshot',
      'getPermissionRulesForSource', 'getPluginSettingsBase', 'getPolicySettingsOrigin', 'getProgressUpdate', 'getProjectDir', 'getProjectsDir',
      'getPrompt', 'getPromptTooLongTokenGap', 'getRelativeSettingsFilePathForSource', 'getRemainingCheckIns', 'getRunningTasks', 'getSchedulerEnv',
      'getSessionContextPort', 'getSessionEnv', 'getSessionMemoryConfig', 'getSessionMemoryContent', 'getSessionMemoryPort', 'getSessionMessages',
      'getSessionSettingsCache', 'getSettingsFilePathForSource', 'getSettingsForSource', 'getSettingsPaths', 'getSettingsRootPathForSource', 'getSettingsWithErrors',
      'getSkillToolCommands', 'getSlashCommandToolSkills', 'getTask', 'getTaskByType', 'getTaskListId', 'getTaskPath',
      'getTasksDir', 'getTeamName', 'getTeammateColor', 'getTeammateContext', 'getTimeBasedMCConfig', 'getTmuxInstallInstructions',
      'getTokenCountFromTracker', 'getTokenCountFromUsage', 'getTokenUsage', 'getToolCallsBetweenUpdates', 'getTools', 'getToolsForDefaultPreset',
      'getTranscriptPath', 'getTranscriptPathForSession', 'getUseAutoModeDuringPlan', 'getUserType', 'getVersion', 'gitExe',
      'goalCheckInPrompt', 'goalClearedNotification', 'goalContinuationReminder', 'goalHookGateNotification', 'goalMetNotification', 'goalPausedNotification',
      'goalUnrecoverableNotification', 'groupMessagesByApiRound', 'hasActiveInProcessTeammates', 'hasAutoModeOptIn', 'hasCommandsInQueue', 'hasCronTasksSync',
      'hasForegroundTasks', 'hasMetInitializationThreshold', 'hasMetUpdateThreshold', 'hasPendingBackgroundAgents', 'hasPendingNotifications', 'hasSessionMessagesCache',
      'hasWorkingInProcessTeammates', 'initialPermissionModeFromCLI', 'initializeToolPermissionContext', 'isAgentSwarmsEnabled', 'isAscendToolsEnabled', 'isAutoCompactCircuitTripped',
      'isAutoCompactEnabled', 'isAutoCompactEnabledForModel', 'isAutoCompactThresholdPositive', 'isAutoCompactWindowSetting', 'isAutoModeGateEnabled', 'isBuiltInAgent',
      'isBypassPermissionsModeDisabled', 'isCachedMicrocompactEnabled', 'isChainParticipant', 'isCompactBoundaryMessage', 'isCoordinatorMode', 'isCustomAgent',
      'isEphemeralToolProgress', 'isForkSubagentEnabled', 'isGoalArmed', 'isGoalPaused', 'isHumanTurn', 'isIdleNotification',
      'isInForkChild', 'isInProcessTeammate', 'isLegacyProgressEntry', 'isLocalAgentTask', 'isLocalShellTask', 'isLoggableMessage',
      'isMainThreadSource', 'isModeSetRequest', 'isPanelAgentTask', 'isPermissionRequest', 'isPermissionResponse', 'isPlanApprovalRequest',
      'isPlanApprovalResponse', 'isPlanModeRequired', 'isProcessRunning', 'isPromptInputModeEditable', 'isPromptTooLongMessage', 'isQueuedCommandEditable',
      'isQueuedCommandVisible', 'isReactiveCompactEnabled', 'isReactiveCompactRecoverableError', 'isReactiveOnlyMode', 'isRecurringTaskAged', 'isSafeRefName',
      'isSandboxPermissionRequest', 'isSandboxPermissionResponse', 'isSessionMemoryInitialized', 'isSettingSourceEnabled', 'isShutdownApproved', 'isShutdownRejected',
      'isShutdownRequest', 'isSlashCommand', 'isSnipBoundaryMessage', 'isSnipMarkerMessage', 'isSnipRuntimeEnabled', 'isStructuredProtocolMessage',
      'isTaskAssignment', 'isTaskStatus', 'isTeamLead', 'isTeamPermissionUpdate', 'isTeammate', 'isTmuxAvailable',
      'isTodoV2Enabled', 'isTranscriptMessage', 'isValidGitSha', 'isWithheldMediaSizeError', 'isWithheldPromptTooLong', 'jitteredNextCronRunMs',
      'jsonParse', 'jsonStringify', 'keepWorktree', 'killAllRunningAgentTasks', 'killAsyncAgent', 'killShellTasksForAgent',
      'killTask', 'killTmuxSession', 'listAllCronTasks', 'listTasks', 'listWorktrees', 'loadAgentDefinitions',
      'loadAllPermissionRulesFromDisk', 'loadManagedFileSettings', 'loadTranscriptFile', 'loadTranscriptFromFile', 'lock', 'lockSync',
      'looksLikePrompt', 'makeDeferredToolUseMarker', 'markAgentsNotified', 'markCronTasksFired', 'markExtractionCompleted', 'markExtractionStarted',
      'markMessageAsReadByIndex', 'markMessagesAsRead', 'markMessagesAsReadByPredicate', 'markSessionMemoryInitialized', 'markTaskNotified', 'matchReadOnlyPrefix',
      'matchSessionMode', 'mcpInfoFromString', 'mergeAutoCompactOverrides', 'mergeHookInstructions', 'mergeHookPermission', 'mergeWith',
      'microcompactMessages', 'nextCronRunMs', 'normalizeAutoCompactWindowSetting', 'normalizeControlMessageKeys', 'normalizeNameForMCP', 'notifyTasksUpdated',
      'objectGroupBy', 'onTasksUpdated', 'oneShotJitteredNextCronRunMs', 'parseAgentFromMarkdown', 'parseAgentId', 'parseAutoCompactTierArg',
      'parseAutoCompactTierInput', 'parseBaseToolsFromCLI', 'parseBingResults', 'parseConfigString', 'parseCronExpression', 'parseDirectMemberMessage',
      'parseGitConfigValue', 'parseJSONL', 'parsePRReference', 'parsePromptTooLongTokenCounts', 'parseRequestId', 'parseSettingsFile',
      'parseToolListFromCLI', 'parseToolPreset', 'parseWorktreeListPorcelain', 'partialCompactConversation', 'partitionToolCalls', 'pauseGoal',
      'peek', 'persistPermissionUpdate', 'persistPermissionUpdates', 'pollTasks', 'popAllEditable', 'prepareContextForPlanMode',
      'primeSessionMessages', 'processResumedConversation', 'projectInstance', 'projectSnippedView', 'queryAgentLoop', 'queryOneRound',
      'queuePendingMessage', 'reAppendSessionMetadata', 'reactiveCompactOnPromptTooLong', 'readCronTasks', 'readGitHead', 'readMailbox',
      'readRawSymref', 'readTranscriptForLoad', 'readUnreadMessages', 'readWorktreeHeadSha', 'recheckCommandQueue', 'recheckPendingNotifications',
      'recordCheckIn', 'recordContentReplacement', 'recordExtractionTokenCount', 'recordSidechainTranscript', 'recordTranscript', 'refreshOnUserMessage',
      'registerAgentForeground', 'registerAsyncAgent', 'registerCleanup', 'registerDomainMount', 'registerForeground', 'registerPostCompactReset',
      'registerTask', 'releaseSchedulerLock', 'remove', 'removeAgentWorktree', 'removeByFilter', 'removeCronTasks',
      'removeExtraFields', 'renderableSearchText', 'reportAutoCompactCircuitFailures', 'resetAutoCompactCircuitForTesting', 'resetBackgroundAgentTracker', 'resetBuiltinCommandNamesSourceForTesting',
      'resetCheckInState', 'resetCommandQueue', 'resetDomainMountForTests', 'resetGoalStateForTesting', 'resetHooksConfigSnapshot', 'resetMcpClientRegistry',
      'resetMcpSkillCommandSource', 'resetMicrocompactState', 'resetPendingNotifications', 'resetProjectFlushStateForTesting', 'resetProjectForTesting', 'resetSchedulerEnv',
      'resetSdkEventQueueForTesting', 'resetSessionContextPort', 'resetSessionEnv', 'resetSessionFilePointer', 'resetSessionMemoryState', 'resetSettingsCache',
      'resetTaskList', 'resetTaskNotificationHandler', 'resetTeamFileLoader', 'resetTeamServices', 'resetWorktreeGitCaches', 'resolveAgentTools',
      'resolveAutoCompactWindow', 'resolveGitDir', 'resolveRef', 'resolveWebSearchApiKey', 'resolveWebSearchProvider', 'restoreDangerousPermissions',
      'restoreGoalState', 'restoreSessionMetadata', 'restoreWorktreeSession', 'resumeGoal', 'roughTokenCountEstimation', 'roughTokenCountEstimationForContent',
      'roughTokenCountEstimationForMessages', 'runAgent', 'runAsyncAgentLifecycle', 'runCleanupFunctions', 'runHooksStream', 'runPostCompactCleanup',
      'runToolBatch', 'runWebSearch', 'runWithTeammateContext', 'sanitizePathComponent', 'saveGoalState', 'saveMode',
      'sendDirectMemberMessage', 'sendShutdownRequestToMailbox', 'setAgentLoopDepsMcpConnectionsProvider', 'setAgentLoopDepsTeammatePoolSync', 'setAgentTranscriptSubdir', 'setAutoCompactSettingsSource',
      'setAutoCompactWindowSettingsSource', 'setBuiltinCommandNamesSource', 'setCachedMCModulePort', 'setCachedParsedFile', 'setCachedSettingsForSource', 'setCompactPorts',
      'setCronJitterConfigProvider', 'setDynamicTeamContext', 'setLastSummarizedMessageId', 'setLeaderTeamName', 'setMcpClientRegistry', 'setMcpSkillCommandSource',
      'setPartialCompactPort', 'setPluginSettingsBase', 'setReactiveCompactPort', 'setSchedulerEnv', 'setSessionContextPort', 'setSessionEnv',
      'setSessionFileForTesting', 'setSessionMemoryCompactPort', 'setSessionMemoryConfig', 'setSessionMemoryPort', 'setSessionSettingsCache', 'setTaskNotificationHandler',
      'setTeamFileLoader', 'setTeamServices', 'setTimeBasedMCConfigSource', 'setWebSearchSettingsKeyProvider', 'setWebSearchTransportForTesting', 'settingsMergeCustomizer',
      'shouldAllowManagedHooksOnly', 'shouldAllowManagedPermissionRulesOnly', 'shouldAutoCompact', 'shouldDisableAllHooksIncludingManaged', 'shouldDisableBypassPermissions', 'shouldNudgeForSnips',
      'shouldPlanUseAutoMode', 'shouldUseSandbox', 'snipProjection', 'sortLogs', 'spawnShellTask', 'stopTask',
      'stripDangerousPermissionsForAutoMode', 'stripImagesFromMessages', 'subscribeToCommandQueue', 'subscribeToPendingNotifications', 'supportsPersistence', 'suppressCompactWarning',
      'syncPermissionRulesFromDisk', 'tokenCountFromLastAPIResponse', 'tokenCountWithEstimation', 'toolResultSearchText', 'toolUseSearchText', 'trackBackgroundAgent',
      'truncateHeadForPTLRetry', 'tryAcquireSchedulerLock', 'tryReactiveCompact', 'trySessionMemoryCompaction', 'unassignTeammateTasks', 'unescapeJsonString',
      'unlock', 'unregisterAgentForeground', 'unregisterForeground', 'updateAgentProgress', 'updateAgentSummary', 'updateHooksConfigSnapshot',
      'updateProgressFromMessage', 'updateSettingsForSource', 'updateTask', 'updateTaskState', 'validateInputBySchema', 'validateWorktreeSlug',
      'waitForSessionMemoryExtraction', 'waitForTeammatesToBecomeIdle', 'worktreeBranchName', 'wrapPermissionGateForBackground', 'writeCronTasks', 'writeToMailbox',]
const REQUIRED_MODELPROVIDER: readonly string[] = [
      'APIConnectionError', 'APIConnectionTimeoutError', 'APIError', 'APIUserAbortError', 'API_ERROR_MESSAGE_PREFIX', 'API_TIMEOUT_ERROR_MESSAGE',
      'CCR_AUTH_ERROR_MESSAGE', 'CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE', 'EFFORT_LEVELS', 'EndpointConfigSource', 'HARD_DEFAULT_CONTEXT_WINDOW', 'INVALID_API_KEY_ERROR_MESSAGE',
      'INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL', 'JsonSchema7Type', 'LLM_TIMEOUT_CAP_MS', 'LLM_TIMEOUT_DEFAULT_MS', 'LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS', 'MODEL_RETRY_BACKOFF_BASE_MS',
      'MODEL_RETRY_BACKOFF_CAP_MS', 'MODEL_ROLES', 'ModelPoolExhaustedError', 'ModelPoolRefFailure', 'ModelProvider', 'ModelRetryBackoffOptions',
      'ModelRole', 'ORG_DISABLED_ERROR_MESSAGE_ENV_KEY', 'ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH', 'OpenAIProvider', 'PROMPT_TOO_LONG_ERROR_MESSAGE', 'PROVIDER_EMPTY_CONTENT_PLACEHOLDER',
      'ProviderStreamEvent', 'QueryWithRoleFallbackResult', 'REPEATED_529_ERROR_MESSAGE', 'RoleFallbackRecord', 'RoleQueryOptions', 'StreamDelta',
      'StreamEvent', 'TOKEN_REVOKED_ERROR_MESSAGE', 'buildOpenAIParams', 'categorizeRetryableAPIError', 'classifyAPIError', 'classifyRefFailure',
      'clearRoleFallback', 'convertEffortValueToLevel', 'describeEndpointFailure', 'extractConnectionErrorDetails', 'formatAPIError', 'gatewayUnreachableRemediationHint',
      'getAssistantMessageFromError', 'getCurrentEndpointLabel', 'getCurrentLlmTimeoutMs', 'getDefaultEffortForModel', 'getEffortEnvOverride', 'getErrorMessageIfRefusal',
      'getImageTooLargeErrorMessage', 'getLastRoleFallback', 'getModelMeta', 'getModelProvider', 'getOauthOrgNotAllowedErrorMessage', 'getPdfInvalidErrorMessage',
      'getPdfPasswordProtectedErrorMessage', 'getPdfTooLargeErrorMessage', 'getProviderContextWindow', 'getRequestTooLargeErrorMessage', 'getRoleConfig', 'getRoleModel',
      'getRoleModels', 'getSSLErrorHint', 'getTokenRevokedErrorMessage', 'isClientRequestTimeout', 'isEffortLevel', 'isQuotaExhaustedMessage',
      'isValidAPIMessage', 'llmTimeoutRemediationHint', 'llmTimeoutUnitHint', 'modelProvider', 'modelRetryBackoffMs', 'modelSupportsEffort',
      'modelToRole', 'normalizeModelStringForAPI', 'parseEffortValue', 'queryWithRoleFallback', 'recordRoleFallback', 'registerErrorMessagingPorts',
      'resetEndpointConfigSource', 'resetErrorMessagingPorts', 'resetModelProviderForTesting', 'resolveAppliedEffort', 'resolveLlmTimeoutMs', 'resolveModel',
      'sanitizeAPIError', 'setEffortByModelSource', 'setEndpointConfigSource', 'setLlmTimeoutSettingsSource', 'setModelProviderForTesting', 'shouldRetryModelError',
      'startsWithApiErrorPrefix', 'toResponseFormat', 'zodToJsonSchema',]
const REQUIRED_MEMORY: readonly string[] = [
      'CompositeMemoryStore', 'FRONTMATTER_REGEX', 'FileReadResult', 'FileSystemMemoryStore', 'FileTooLargeError', 'FrontmatterData',
      'InMemoryStore', 'MEMORY_DRIFT_CAVEAT', 'MEMORY_FRONTMATTER_EXAMPLE', 'MEMORY_TYPES', 'MemoryConfig', 'MemoryScope',
      'MemoryStore', 'MemoryType', 'ParsedMarkdown', 'ReadFileRangeResult', 'RootedMemoryStore', 'StoreDirent',
      'TRUSTING_RECALL_SECTION', 'TYPES_SECTION_COMBINED', 'TYPES_SECTION_INDIVIDUAL', 'WHAT_NOT_TO_SAVE_SECTION', 'WHEN_TO_ACCESS_SECTION', 'autoMemoryEnabledFromEnv',
      'createMemoryConfig', 'detectSessionFileType', 'detectSessionPatternType', 'getAtlasConfigHomeDir', 'getAutoMemEntrypoint', 'getAutoMemPath',
      'getCoworkMemoryPathOverride', 'getMemoryBaseDir', 'hasAutoMemPathOverride', 'isAutoManagedMemoryFile', 'isAutoManagedMemoryPattern', 'isAutoMemFile',
      'isAutoMemPath', 'isAutoMemoryEnabled', 'isExtractModeActive', 'isMemoryDirectory', 'isShellCommandTargetingMemory', 'isUnderMemoryDir',
      'memoryAge', 'memoryAgeDays', 'memoryFreshnessNote', 'memoryFreshnessText', 'memoryScopeForPath', 'parseFrontmatter',
      'parseMemoryType', 'readFileInRange', 'validateMemoryFrontmatter', 'validateMemoryPath',]
const REQUIRED_SANDBOX: readonly string[] = [
      'AtlasSandboxBackend', 'BaseSandboxManagerStatic', 'DefaultSandboxEventBus', 'FsReadRestrictionConfig', 'FsWriteRestrictionConfig', 'IgnoreViolationsConfig',
      'NetworkHostPattern', 'NetworkRestrictionConfig', 'Platform', 'ResolvedRg', 'RgSource', 'RipgrepMissingError',
      'RipgrepStatusMode', 'RipgrepTimeoutError', 'SandboxAskCallback', 'SandboxBackend', 'SandboxBackendConfig', 'SandboxConfig',
      'SandboxDependencies', 'SandboxDependencyCheck', 'SandboxEventBus', 'SandboxHostNetworkDecision', 'SandboxManager', 'SandboxRuntimeConfig',
      'SandboxViolationEvent', 'SandboxViolationStore', 'SettingSource', 'SettingsJson', 'ViolationCategory', 'ViolationEvent',
      'checkRipgrep', 'countFilesRoundedRg', 'createSandboxBackend', 'createSandboxConfig', 'createSandboxManager', 'decideHostNetwork',
      'domainPatternMatches', 'extractSandboxViolationsBlock', 'getRipgrepStatus', 'getSandboxRuntimeModule', 'registerSandboxBackend', 'removeSandboxViolationTags',
      'resetSandboxRuntimeModule', 'ripGrep', 'ripGrepStream', 'ripgrepCommand', 'setRipgrepResolutionForTest', 'setSandboxRuntimeModule',]
const REQUIRED_EXECUTOR: readonly string[] = [
      'AscendConfig', 'BackgroundExecutor', 'BackgroundHandle', 'BootstrapStatePort', 'BuildExecCommandOptions', 'DEFAULT_HOOK_SHELL',
      'ExecCommandBuild', 'ExecError', 'ExecOptions', 'ExecResult', 'Executor', 'ExecutorSandboxPort',
      'NpuToolchain', 'SHELL_TYPES', 'ShellCommand', 'ShellExecOptions', 'ShellExecResult', 'ShellExecutor',
      'ShellExecutorConfig', 'ShellProvider', 'ShellType', 'TaskOutputHandle', 'TaskOutputPort', 'TaskOutputProgressCallback',
      'applyToolchainPlaceholders', 'createAbortedCommand', 'createBashShellProvider', 'createFailedCommand', 'createShellExecutorConfig', 'execShell',
      'findSuitableShell', 'generateLocalTaskId', 'getBootstrapStatePort', 'getExecutorSandboxPort', 'getTaskOutputPort', 'resetBootstrapStatePort',
      'resetExecutorSandboxPort', 'resetTaskOutputPort', 'setBootstrapStatePort', 'setCwd', 'setExecutorSandboxPort', 'setTaskOutputPort',
      'wrapSpawn',]

/** 门面源级 export 名提取（块级 `export { }`（含内联 type 前缀 / as 改名）
 *  + 单语句 `export function/const/type/...`；注释剥离）。 */
function extractExportNames(raw: string): Set<string> {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const names = new Set<string>()
  for (const m of stripped.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part0 of m[1].split(',')) {
      let part = part0.trim()
      if (part === '') continue
      if (part.includes(' as ')) part = part.split(' as ')[1].trim()
      if (part.startsWith('type ')) part = part.slice(5).trim()
      if (part !== '') names.add(part)
    }
  }
  for (const line of stripped.split('\n')) {
    const m = line
      .trim()
      .match(
        /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|const|let|var|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/,
      )
    if (m) names.add(m[1])
  }
  return names
}

describe('G-4 五域契约单向子集（P-4）', () => {
  test('required(6ca23aa) ⊆ actual（门面 export 面，936/99/52/48/43）', () => {
    const domains: [Domain, readonly string[]][] = [
      ['engine', REQUIRED_ENGINE],
      ['modelprovider', REQUIRED_MODELPROVIDER],
      ['memory', REQUIRED_MEMORY],
      ['sandbox', REQUIRED_SANDBOX],
      ['executor', REQUIRED_EXECUTOR],
    ]
    for (const [d, required] of domains) {
      const actual = extractExportNames(SRC_TEXT[`src/${d}/index.ts`])
      const missing = required.filter((n) => !actual.has(n))
      expect(
        missing,
        `src/${d}/index.ts 缺 required 名 (${missing.length}/${required.length}): ${missing
          .slice(0, 20)
          .join(', ')}`,
      ).toEqual([])
    }
  })
})

// ================= G-5 旧路径清零（P-5）=================
describe('G-5 旧路径清零（P-5）', () => {
  test('sandbox-adapter / runCannCommand 非注释活码行 = 0', () => {
    const hits: string[] = []
    for (const rel of SRC_FILES) {
      const lines = SRC_TEXT[rel].split('\n')
      lines.forEach((raw, i) => {
        const t = raw.trim()
        if (
          t.startsWith('*') ||
          t.startsWith('//') ||
          t.startsWith('/*')
        ) {
          return
        }
        if (t.includes('sandbox-adapter') || t.includes('runCannCommand')) {
          hits.push(`${rel}:${i + 1}`)
        }
      })
    }
    expect(hits, hits.join('\n')).toEqual([])
  })
})

// ================= G-6 换实现接缝（P-6）=================
const REQUIRED_SEAMS: { domain: Domain; names: readonly string[] }[] = [
  {
    domain: 'modelprovider',
    names: ['setModelProviderForTesting', 'setEndpointConfigSource'],
  },
  { domain: 'memory', names: ['setSessionMemoryPort'] },
  { domain: 'sandbox', names: ['setExecutorSandboxPort'] },
  { domain: 'executor', names: ['setTaskOutputPort'] },
  { domain: 'engine', names: ['setCompactPorts', 'setReactiveCompactPort'] },
]
// 基线定义位（6ca23aa 实测）：setModelProviderForTesting=modelprovider/index.ts /
// setEndpointConfigSource=modelprovider/roles.ts /
// setSessionMemoryPort=engine/session/sessionMemory.ts /
// setExecutorSandboxPort=executor/ports/sandbox.ts /
// setTaskOutputPort=executor/ports/taskOutput.ts /
// setCompactPorts=engine/context/compactPorts.ts /
// setReactiveCompactPort=engine/context/highGapPorts.ts。

describe('G-6 换实现接缝（P-6）', () => {
  test('五域 required 接缝集全在场（定义行在场）', () => {
    for (const { domain, names } of REQUIRED_SEAMS) {
      for (const n of names) {
        const re = new RegExp(`export\\s+function\\s+${n}\\s*\\(`)
        const found = SRC_FILES.some((rel) => re.test(SRC_TEXT[rel]))
        expect(
          found,
          `${domain} 接缝 ${n} 定义行整仓缺席`,
        ).toBe(true)
      }
    }
  })
})

// ================= G-7 五域直测在场（P-7）=================
const G7_ANCHORS = [
  'tests/unit/engine-coordinator.test.ts',
  'tests/unit/modelprovider-llm-timeout-retry.test.ts',
  'tests/unit/memory-fs-store.test.ts',
  'tests/unit/sandbox-manager.test.ts',
  'tests/unit/executor-config.test.ts',
] as const
const G7_FLOORS: { prefix: string; floor: number; note: string }[] = [
  { prefix: 'engine-', floor: 95, note: '与工单 95 一致' },
  { prefix: 'modelprovider-', floor: 10, note: '与工单 10 一致' },
  {
    prefix: 'memory-',
    floor: 6,
    note: '工单 7 → 实测 6（裁定④下调实测锚，只涨不缩）',
  },
  {
    prefix: 'sandbox-',
    floor: 5,
    note: '工单 7 → 实测 5（裁定④下调实测锚，只涨不缩）',
  },
  {
    prefix: 'executor-',
    floor: 7,
    note: '工单 8 → 实测 7（裁定④窄口径 ^executor-，只涨不缩）',
  },
]

describe('G-7 五域直测在场（P-7）', () => {
  test('五域锚测试文件在场（5/5）', () => {
    for (const rel of G7_ANCHORS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true)
    }
  })
  test('五域直测文件计数下限（tests/unit；只涨不缩）', () => {
    const files = readdirSync(join(ROOT, 'tests', 'unit'))
    for (const { prefix, floor, note } of G7_FLOORS) {
      const n = files.filter(
        (f) => f.startsWith(prefix) && f.endsWith('.test.ts'),
      ).length
      expect(
        n,
        `${prefix} 直测文件 ${n} < 下限 ${floor}（${note}）`,
      ).toBeGreaterThanOrEqual(floor)
    }
  })
})
