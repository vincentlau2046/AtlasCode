/**
 * engine/permissions — CLI 初始权限上下文装配（E-4 S-4c1，§8.34）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissionSetup.ts（1508L）
 * **9 函数保留面**（其余全裁，裁出面登记见下）:
 *   1. parseBaseToolsFromCLI（deps 注入面：preset → getToolsForDefaultPreset(deps)，
 *      §8.34 裁定 ⑤ 传递依赖提前自 S-4d ②）
 *   2. isSymlinkTo（私；PWD 符号链接 → 附加工作目录支，safeResolvePath 消费）
 *   3. initialPermissionModeFromCLI（CLI/settings 模式优先级序）
 *   4. parseToolListFromCLI（括号状态机：逗号/空格分隔仅限括号外）
 *   5. initializeToolPermissionContext（cliArg 规则 + baseTools 补拒 + addDirs +
 *      PWD symlink + 盘上规则装载 → 初始 context）
 *   6. shouldDisableBypassPermissions（GB 门裁 → settings 等价面，Promise 签名保留）
 *   7. isBypassPermissionsModeDisabled（GB 缓存裁 → settings 单源）
 *   8. createDisabledBypassPermissionsContext（bypass → default + available=false）
 *   9. prepareContextForPlanMode（plan 入口 prePlanMode 暂存）
 *
 * 裁定 ②③④⑤⑨ 裁出面登记（复审勿当遗漏重提）:
 *   - ② GB 门裁：新仓无 GrowthBook（analytics/growthbook 整族未落）→
 *     bypass 门 = settings.permissions.disableBypassPermissionsMode === 'disable'
 *     单源；checkStatsigFeatureGate / checkSecurityRestrictionGate /
 *     getDynamicConfig* / getFlagDualRead 全不随迁
 *   - ③ auto 支裁：TRANSCRIPT_CLASSIFIER 整族（autoModeState / 危险规则检测
 *     isDangerous*Permission / find·strip·restore·remove 危险规则族 /
 *     transitionPermissionMode / verifyAutoModeGateAccess / getAutoMode* /
 *     shouldPlanUseAutoMode / transitionPlanAutoMode / checkAndDisableBypassPermissions
 *     （gracefulShutdown 面）/ isDefaultPermissionModeAuto）→ auto-mode 纵切波；
 *     本文件 dangerousPermissions / overlyBroadBashPermissions 返回字段 ≡ []
 *     （旧仓契约字段保留，值恒空）；settings defaultMode 'auto' 降级 'default'
 *     红线支保留（2026-09-19 裁定逐字，feature 门去掉——降级语义与 auto 未落
 *     前一致：绝不 session 默认进 auto）
 *   - ④ validateDirectoryForWorkspace 裁（旧 commands/add-dir/validation →
 *     E-6 pathValidation 487L 纵切）：addDirs + settings.additionalDirectories
 *     直 apply cliArg（无校验/无 warnings 面，warnings ≡ []）
 *   - ⑤ 写回核销在 permissionRulesLoader（同目录，updateSettingsForSource 消费）
 *   - ⑨ hasSkipDangerousModePermissionPrompt 落 engine/config/settings.ts
 *     （接缝⑥；消费面 = bypass 确认 UI 残留守）
 *
 * 依赖改法（裁定 ⑦ 同口径）:
 *   - getSettings_DEPRECATED → getInitialSettings（engine/config settings 面）
 *   - getOriginalCwd（bootstrap 域）→ 直 import（engine 侧 L3 连接器，
 *     permissions 纯叶域经 bootstrap-env 注入窗口，本层不受叶域约束）
 *   - getToolsForDefaultPreset / parseToolPreset → engine/tools 注册表面
 *   - 规则 parse/serialize / legacy 归一 / apply 核心 → permissions 域门面
 *   - safeResolvePath → shared/fs-operations（本切片加法原语）
 *
 * 消费面登记（H6 实挂 / 预声明）:
 *   - initializeToolPermissionContext：组合根启动装配（D 波/组合根纵切）
 *   - initialPermissionModeFromCLI：CLI --permission-mode 解析（组合根）
 *   - isBypassPermissionsModeDisabled / createDisabledBypassPermissionsContext：
 *     bypass 门控 UI 面残留守（组合根装配时消费）
 *   - prepareContextForPlanMode：plan 模式入口（E-6 工具面 EnterPlanMode 纵切）
 */
import { resolve } from 'path'
import {
  getFsImplementation,
  safeResolvePath,
  isEnvTruthy,
  logForDebugging,
  type AdditionalWorkingDirectory,
  type PermissionMode,
  type PermissionRuleSource,
  type PermissionRuleValue,
  type ToolPermissionContext,
} from '../../shared'
import { getOriginalCwd } from '../../bootstrap'
import { getInitialSettings } from '../config'
import {
  getToolsForDefaultPreset,
  parseToolPreset,
  type ToolRegistryDeps,
} from '../tools'
import {
  applyPermissionRulesToPermissionContext,
  applyPermissionUpdate,
  normalizeLegacyToolName,
  permissionModeFromString,
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../../permissions'
import { loadAllPermissionRulesFromDisk } from './permissionRulesLoader'

/** 危险/过宽规则展示信息（旧仓契约类型保留；检测面 ③ 裁归 auto-mode 波）。 */
export type DangerousPermissionInfo = {
  ruleValue: PermissionRuleValue
  source: PermissionRuleSource
  /** The permission rule formatted for display, e.g. "Bash(*)" or "Bash(python:*)" */
  ruleDisplay: string
  /** The source formatted for display, e.g. a file path or "--allowed-tools" */
  sourceDisplay: string
}

/**
 * Parse base tools specification from CLI
 * Handles both preset names (default, none) and custom tool lists.
 * deps = 工具注册表注入面（preset 支经 getToolsForDefaultPreset(deps) 出工具名；
 * 自定义列表支不触注册表，deps 透传不影响解析）。
 */
export function parseBaseToolsFromCLI(
  baseTools: string[],
  deps: ToolRegistryDeps = {},
): string[] {
  // Join all array elements and check if it's a single preset name
  const joinedInput = baseTools.join(' ').trim()
  const preset = parseToolPreset(joinedInput)

  if (preset) {
    return getToolsForDefaultPreset(deps)
  }

  // Parse as a custom tool list using the same parsing logic as allowedTools/disallowedTools
  return parseToolListFromCLI(baseTools)
}

/**
 * Check if processPwd is a symlink that resolves to originalCwd
 */
function isSymlinkTo({
  processPwd,
  originalCwd,
}: {
  processPwd: string
  originalCwd: string
}): boolean {
  // Use safeResolvePath to check if processPwd is a symlink and get its resolved path
  const { resolvedPath: resolvedProcessPwd, isSymlink: isProcessPwdSymlink } =
    safeResolvePath(getFsImplementation(), processPwd)

  return isProcessPwdSymlink
    ? resolvedProcessPwd === resolve(originalCwd)
    : false
}

/**
 * Safely convert CLI flags to a PermissionMode
 * （② GB 门裁 + ③ auto 支裁：bypass 门 = settings 单源；auto 不可用户寻址
 * ——permissionModeFromString 对 'auto' 回落 'default'，settings 侧降级红线支保留）
 */
export function initialPermissionModeFromCLI({
  permissionModeCli,
  dangerouslySkipPermissions,
}: {
  permissionModeCli: string | undefined
  dangerouslySkipPermissions: boolean | undefined
}): { mode: PermissionMode; notification?: string } {
  const settings = getInitialSettings()

  // ② GB 门裁：新仓无 GrowthBook，bypass 门 = settings 单源
  const disableBypassPermissionsMode = isBypassPermissionsModeDisabled()

  // Modes in order of priority
  const orderedModes: PermissionMode[] = []
  let notification: string | undefined

  if (dangerouslySkipPermissions) {
    orderedModes.push('bypassPermissions')
  }
  if (permissionModeCli) {
    // ③ auto 支裁：fromString('auto') → 'default'（auto-mode 波前不可寻址）
    orderedModes.push(permissionModeFromString(permissionModeCli))
  }
  if (settings.permissions?.defaultMode) {
    const settingsMode = settings.permissions.defaultMode as PermissionMode
    // CCR only supports acceptEdits and plan — ignore other defaultModes from
    // settings (e.g. bypassPermissions would otherwise silently grant full
    // access in a remote environment).
    if (
      isEnvTruthy(process.env.ATLAS_REMOTE) &&
      !['acceptEdits', 'plan', 'default'].includes(settingsMode)
    ) {
      logForDebugging(
        `settings defaultMode "${settingsMode}" is not supported in ATLAS_REMOTE — only acceptEdits and plan are allowed`,
        { level: 'warn' },
      )
    }
    // 裁定(2026-09-19 逐字):settings.permissions.defaultMode:"auto" 是全局持久值,
    // 会让所有 session 默认进 auto——红线("绝不能让所有 session 同时启动
    // enable")。settings 来源的 auto 一律降级为 default:本 session 不自动进
    // auto。显式进 auto 只能走 CLI --permission-mode auto(per-session)。
    // ③ TRANSCRIPT_CLASSIFIER 门去掉:降级语义不变（auto 未落前 fromString 已不可寻址）。
    else if (settingsMode === 'auto') {
      logForDebugging(
        'settings defaultMode "auto" downgraded to "default" — no session auto-starts into auto',
        { level: 'warn' },
      )
      orderedModes.push('default')
    } else {
      orderedModes.push(settingsMode)
    }
  }

  let result: { mode: PermissionMode; notification?: string } | undefined

  for (const mode of orderedModes) {
    if (mode === 'bypassPermissions' && disableBypassPermissionsMode) {
      logForDebugging('bypassPermissions mode is disabled by settings', {
        level: 'warn',
      })
      notification = 'Bypass permissions mode was disabled by settings'
      continue // Skip this mode if it's disabled
    }

    result = { mode, notification } // Use the first valid mode
    break
  }

  if (!result) {
    result = { mode: 'default', notification }
  }

  return result
}

/**
 * Parse a CLI tool list respecting parentheses（旧仓逐字括号状态机：
 * 逗号/空格分隔仅限括号外，`Bash(npm install)` / `Bash(a, b)` 内部保留）
 */
export function parseToolListFromCLI(tools: string[]): string[] {
  if (tools.length === 0) {
    return []
  }

  const result: string[] = []

  // Process each string in the array
  for (const toolString of tools) {
    if (!toolString) continue

    let current = ''
    let isInParens = false

    // Parse each character in the string
    for (const char of toolString) {
      switch (char) {
        case '(':
          isInParens = true
          current += char
          break
        case ')':
          isInParens = false
          current += char
          break
        case ',':
          if (isInParens) {
            current += char
          } else {
            // Comma separator - push current tool and start new one
            if (current.trim()) {
              result.push(current.trim())
            }
            current = ''
          }
          break
        case ' ':
          if (isInParens) {
            current += char
          } else if (current.trim()) {
            // Space separator - push current tool and start new one
            result.push(current.trim())
            current = ''
          }
          break
        default:
          current += char
      }
    }

    // Push any remaining tool
    if (current.trim()) {
      result.push(current.trim())
    }
  }

  return result
}

/**
 * 启动装配初始权限上下文（旧仓 initializeToolPermissionContext 裁剪版）。
 * ② GB 裁（bypass 可用性 = settings 单源）/ ③ 危险规则检测 ≡ []（auto 波）/
 * ④ addDirs 直 apply（validateDirectoryForWorkspace → E-6）。
 */
export async function initializeToolPermissionContext({
  allowedToolsCli,
  disallowedToolsCli,
  baseToolsCli,
  permissionMode,
  allowDangerouslySkipPermissions,
  addDirs,
  shouldAvoidPermissionPrompts,
  deps = {},
}: {
  allowedToolsCli: string[]
  disallowedToolsCli: string[]
  baseToolsCli?: string[]
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions: boolean
  addDirs: string[]
  /**
   * True when this is a headless main session that cannot surface a permission
   * prompt. When set, an `'ask'` decision is converted to a clean auto-deny
   * (permissions.ts headless branch) instead of awaiting an unanswerable prompt.
   */
  shouldAvoidPermissionPrompts?: boolean
  /**
   * 工具注册表注入（preset 工具名池 + baseTools 补拒池）。本函数 deps 消费点
   * 仅 getToolsForDefaultPreset / parseBaseToolsFromCLI 两支；getTools /
   * filterToolsByDenyRules 族 E-4 S-4d ② 已落 toolRegistry 机制层（模型可见
   * 池装配面），不经本函数。
   */
  deps?: ToolRegistryDeps
}): Promise<{
  toolPermissionContext: ToolPermissionContext
  warnings: string[]
  dangerousPermissions: DangerousPermissionInfo[]
  overlyBroadBashPermissions: DangerousPermissionInfo[]
}> {
  // Parse comma-separated allowed and disallowed tools if provided
  // Normalize legacy tool names (e.g., 'Task' → 'Agent') so that in-memory
  // rule removal matches canonical forms.
  const parsedAllowedToolsCli = parseToolListFromCLI(allowedToolsCli).map(
    rule => permissionRuleValueToString(permissionRuleValueFromString(rule)),
  )
  let parsedDisallowedToolsCli = parseToolListFromCLI(disallowedToolsCli)

  // If base tools are specified, automatically deny all tools NOT in the base set
  // We need to check if base tools were explicitly provided (not just empty default)
  if (baseToolsCli && baseToolsCli.length > 0) {
    const baseToolsResult = parseBaseToolsFromCLI(baseToolsCli, deps)
    // Normalize legacy tool names so user-provided base tool lists using old
    // names still match canonical names.
    const baseToolsSet = new Set(baseToolsResult.map(normalizeLegacyToolName))
    const allToolNames = getToolsForDefaultPreset(deps)
    const toolsToDisallow = allToolNames.filter(tool => !baseToolsSet.has(tool))
    parsedDisallowedToolsCli = [...parsedDisallowedToolsCli, ...toolsToDisallow]
  }

  // ④ validateDirectoryForWorkspace 裁（E-6 pathValidation）→ warnings ≡ []
  const warnings: string[] = []
  const additionalWorkingDirectories = new Map<
    string,
    AdditionalWorkingDirectory
  >()
  // process.env.PWD may be a symlink, while getOriginalCwd() uses the real path
  const processPwd = process.env.PWD
  if (
    processPwd &&
    processPwd !== getOriginalCwd() &&
    isSymlinkTo({ originalCwd: getOriginalCwd(), processPwd })
  ) {
    additionalWorkingDirectories.set(processPwd, {
      path: processPwd,
      source: 'session',
    })
  }

  // Check if bypassPermissions mode is available (② GB 裁：settings 单源)
  const settings = getInitialSettings()
  const settingsDisableBypassPermissionsMode =
    settings.permissions?.disableBypassPermissionsMode === 'disable'
  const isBypassPermissionsModeAvailable =
    (permissionMode === 'bypassPermissions' ||
      allowDangerouslySkipPermissions) &&
    !settingsDisableBypassPermissionsMode

  // Load all permission rules from disk
  const rulesFromDisk = loadAllPermissionRulesFromDisk()

  // de-ANT: the ant-only "overly broad shell allow" detection was removed; the
  // field stays empty for all users (kept for return-field compat, 旧仓注释逐字).
  const overlyBroadBashPermissions: DangerousPermissionInfo[] = []

  // ③ 危险规则检测 = TRANSCRIPT_CLASSIFIER 面 → auto-mode 纵切波；
  // 未落前 ≡ []（返回字段契约保留）。
  const dangerousPermissions: DangerousPermissionInfo[] = []

  let toolPermissionContext = applyPermissionRulesToPermissionContext(
    {
      mode: permissionMode,
      additionalWorkingDirectories,
      alwaysAllowRules: { cliArg: parsedAllowedToolsCli },
      alwaysDenyRules: { cliArg: parsedDisallowedToolsCli },
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable,
      ...(shouldAvoidPermissionPrompts
        ? { shouldAvoidPermissionPrompts: true }
        : {}),
    },
    rulesFromDisk,
  )

  // ④ addDirs + settings.additionalDirectories → 直 apply cliArg
  // （目录校验/已覆盖判定/绝对化 = E-6 pathValidation 残留守）
  const allAdditionalDirectories = [
    ...(settings.permissions?.additionalDirectories || []),
    ...addDirs,
  ]
  for (const dir of allAdditionalDirectories) {
    toolPermissionContext = applyPermissionUpdate(toolPermissionContext, {
      type: 'addDirectories',
      directories: [dir],
      destination: 'cliArg',
    })
  }

  return {
    toolPermissionContext,
    warnings,
    dangerousPermissions,
    overlyBroadBashPermissions,
  }
}

/**
 * 旧仓 = Statsig 门异步检查。② 裁：新仓无 GrowthBook → 等价 settings 基
 * isBypassPermissionsModeDisabled；Promise 签名保留（UI 异步检查面残留守）。
 */
export function shouldDisableBypassPermissions(): Promise<boolean> {
  return Promise.resolve(isBypassPermissionsModeDisabled())
}

/**
 * Checks if bypassPermissions mode is currently disabled.
 * ② GB 缓存裁：settings.permissions.disableBypassPermissionsMode === 'disable'
 * 单源（旧仓 = GB 缓存 || settings 双源）。
 */
export function isBypassPermissionsModeDisabled(): boolean {
  const settings = getInitialSettings()
  return settings.permissions?.disableBypassPermissionsMode === 'disable'
}

/**
 * Creates an updated context with bypassPermissions disabled（旧仓逐字）
 */
export function createDisabledBypassPermissionsContext(
  currentContext: ToolPermissionContext,
): ToolPermissionContext {
  let updatedContext = currentContext
  if (currentContext.mode === 'bypassPermissions') {
    updatedContext = applyPermissionUpdate(currentContext, {
      type: 'setMode',
      mode: 'default',
      destination: 'session',
    })
  }

  return {
    ...updatedContext,
    isBypassPermissionsModeAvailable: false,
  }
}

/**
 * Centralized plan-mode entry. Stashes the current mode as prePlanMode so
 * ExitPlanMode can restore it.
 * ③ auto 语义支裁（shouldPlanUseAutoMode / strip·restoreDangerousPermissions /
 * setAutoModeActive）→ auto-mode 纵切波；本切片 = plain plan 入口逐字面。
 */
export function prepareContextForPlanMode(
  context: ToolPermissionContext,
): ToolPermissionContext {
  const currentMode = context.mode
  if (currentMode === 'plan') return context
  logForDebugging(
    `[prepareContextForPlanMode] plain plan entry, prePlanMode=${currentMode}`,
  )
  return { ...context, prePlanMode: currentMode }
}
