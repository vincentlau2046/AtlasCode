/**
 * 跨 backend 派生 teammate 的共享工具（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/spawnUtils.ts（133L）。
 *
 * import 面重映射：
 *   - TEAMMATE_COMMAND_ENV_VAR → 域内 constants
 *   - isInBundledMode → 域内 bundledMode（旧 utils/bundledMode 逐字镜像）
 *   - getTeammateModeFromSnapshot → 域内 teammateModeSnapshot
 *     （切片偏差：原排 S-E2c，本模块硬依赖随 S-E2b 提前，登记见该文件头注）
 *   - quote → shell-quote 直用（旧 utils/bash/shellQuote 严格校验包装 →
 *     直接消费 shell-quote quote；调用点 args 面全 string，lenient 支等价；
 *     3 依赖纪律内既列依赖）
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - getFlagSettingsPath（--settings 继承支）裁除：新仓 settings 旗标面
 *     未落（engine/config/settings.ts:23「getFlagSettingsPath 不随迁」）。
 *   - getInlinePlugins（--plugin-dir 继承支）裁除：新仓 inlinePlugins 面未落。
 *   - getMainLoopModelOverride（--model 继承支）裁除：新仓主循环模型覆写
 *     面未落。
 *   - getSessionBypassPermissionsMode（会话级 bypass 判定支）裁除：新仓
 *     会话 bypass 态面未落 → 继承支仅认调用方显式传入的
 *     options.permissionMode === 'bypassPermissions'（plan mode 优先语义
 *     逐字保留）。
 */
import { quote as shellQuoteQuote } from 'shell-quote'
import { getTeammateModeFromSnapshot } from './teammateModeSnapshot'
import { TEAMMATE_COMMAND_ENV_VAR } from './constants'
import { isInBundledMode } from './bundledMode'
import { type PermissionMode } from '../shared'

/** 域内本地 quote（旧 shellQuote 包装面，登记见头注）。 */
function quote(args: ReadonlyArray<unknown>): string {
  return shellQuoteQuote([...args.map(String)])
}

/**
 * Gets the command to use for spawning teammate processes.
 * Uses TEAMMATE_COMMAND_ENV_VAR if set, otherwise falls back to the
 * current process executable path.
 */
export function getTeammateCommand(): string {
  if (process.env[TEAMMATE_COMMAND_ENV_VAR]) {
    return process.env[TEAMMATE_COMMAND_ENV_VAR]
  }
  return isInBundledMode() ? process.execPath : process.argv[1]!
}

/**
 * Builds CLI flags to propagate from the current session to spawned teammates.
 * This ensures teammates inherit important settings like permission mode,
 * model selection, and plugin configuration from their parent.
 *（裁面：model/settings/plugin-dir 继承支随新仓对应面未落裁除，登记见头注。）
 *
 * @param options.planModeRequired - If true, don't inherit bypass permissions (plan mode takes precedence)
 * @param options.permissionMode - Permission mode to propagate
 */
export function buildInheritedCliFlags(options?: {
  planModeRequired?: boolean
  permissionMode?: PermissionMode
}): string {
  const flags: string[] = []
  const { planModeRequired, permissionMode } = options || {}

  // Propagate permission mode to teammates, but NOT if plan mode is required
  // Plan mode takes precedence over bypass permissions for safety
  if (planModeRequired) {
    // Don't inherit bypass permissions when plan mode is required
  } else if (permissionMode === 'bypassPermissions') {
    flags.push('--dangerously-skip-permissions')
  } else if (permissionMode === 'acceptEdits') {
    flags.push('--permission-mode acceptEdits')
  }

  // Propagate --teammate-mode so tmux teammates use the same mode as leader
  const sessionMode = getTeammateModeFromSnapshot()
  flags.push(`--teammate-mode ${sessionMode}`)

  return flags.join(' ')
}

/**
 * Environment variables that must be explicitly forwarded to tmux-spawned
 * teammates. Tmux may start a new login shell that doesn't inherit the
 * parent's env, so we forward any that are set in the current process.
 */
const TEAMMATE_ENV_VARS = [
  // (3P provider env vars removed — Vertex/Foundry no longer supported)
  // Custom API endpoint (de-Anthropic: OPENAI_BASE_URL is the new name)
  'OPENAI_BASE_URL',
  // Config directory override
  'ATLAS_CONFIG_DIR',
  // CCR marker — teammates need this for CCR-aware code paths. Auth finds
  // its own way via ~/.atlas/remote/.oauth_token regardless;
  // the FD env var wouldn't help (pipe FDs don't cross tmux).
  'ATLAS_REMOTE',
  // Auto-memory gate (memdir/paths.ts) checks REMOTE && !MEMORY_DIR to
  // disable memory on ephemeral CCR filesystems. Forwarding REMOTE alone
  // would flip teammates to memory-off when the parent has it on.
  'ATLAS_REMOTE_MEMORY_DIR',
  // Upstream proxy — the parent's MITM relay is reachable from teammates
  // (same container network). Forward the proxy vars so teammates route
  // customer-configured upstream traffic through the relay for credential
  // injection. Without these, teammates bypass the proxy entirely.
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
] as const

/**
 * Builds the `env KEY=VALUE ...` string for teammate spawn commands.
 * Always includes ATLAS_CODE=1, ATLAS_EXPERIMENTAL_AGENT_TEAMS=1,
 * plus any provider/config env vars that are set in the current process.
 * Delta ① de-Claude 硬切：旧 CLAUDECODE 标记 env → ATLAS_CODE（新仓
 * executor/shell/Shell.ts 头注同型改名：机器标识一律 atlas 系）。
 */
export function buildInheritedEnvVars(): string {
  const envVars = ['ATLAS_CODE=1', 'ATLAS_EXPERIMENTAL_AGENT_TEAMS=1']

  for (const key of TEAMMATE_ENV_VARS) {
    const value = process.env[key]
    if (value !== undefined && value !== '') {
      envVars.push(`${key}=${quote([value])}`)
    }
  }

  return envVars.join(' ')
}
