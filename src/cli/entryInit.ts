/**
 * CLI 入口初始化面（旧仓 main.tsx L194-516 随迁 + 裁登记）。
 *
 * 随迁：isBeingDebugged 守卫 / loadSettingsFromFlag / loadSettingSourcesFromFlag /
 * eagerLoadSettings / initializeEntrypoint。
 *
 * 裁登记（不随迁，复审勿当遗漏重提）：
 *   - logManagedSettings / logSessionTelemetry / getCertEnvVarTelemetry /
 *     logStartupTelemetry = 遥测死面（旧仓 analytics 后端已删，879 点 2026-09-18
 *     清核；无消费点不迁）。
 *   - runMigrations（5 迁移件 + migrationVersion 11）= 依赖旧仓全局 config store
 *     （getGlobalConfig/saveGlobalConfig 新仓缺席）→ 配置域前向接缝，本波不迁。
 *   - prefetchSystemContextIfSafe / startDeferredPrefetches = TUI 首渲染后预取
 *     （getSystemContext/getUserContext 新仓缺席）→ 壳波 #152 前向接缝。
 *   - _pendingConnect / _pendingSSH（feature('DIRECT_CONNECT')/'SSH_REMOTE'）=
 *     域外裁（§8.71.1.3：remote 族波 / IFF 网关波 [ATLAS-HOLD]）。
 */
import { writeFileSync, readFileSync } from 'fs'
import { createHash, randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  errorMessage,
  getFsImplementation,
  isENOENT,
  safeResolvePath,
} from '../shared'
import { resetSettingsCache } from '../engine'
import {
  type CliSettingSource,
  setAllowedSettingSources,
  setFlagSettingsPath,
} from '../bootstrap'

/** 本地转写（lodash-es 不入依赖纪律）：JSON.parse 安全版（旧仓 utils/json.js 同语义）。 */
export function safeParseJSON(input: string): unknown | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

/**
 * 旧仓 utils/tempfile.ts generateTempFilePath 逐字随迁：内容哈希 =
 * sha256 hex16（非随机 UUID）——settings 路径进 Bash 工具 denyWithinAllow
 * 列表（API 提示词缓存前缀），随机 UUID 逐次毁缓存（旧仓注释保真）；
 * 无内容哈希支 = randomUUID；路径根 = os.tmpdir()（旧仓逐字）。
 */
export function generateTempFilePath(
  prefix: string = 'atlas-prompt',
  extension: string = '.md',
  options?: { contentHash?: string },
): string {
  const id = options?.contentHash
    ? createHash('sha256')
        .update(options.contentHash)
        .digest('hex')
        .slice(0, 16)
    : randomUUID()
  return join(tmpdir(), `${prefix}-${id}${extension}`)
}

/**
 * 本地转写（旧仓 utils/settings/constants.js parseSettingSourcesFlag 同语义）：
 * 逗号分列 → 白名单校验（user/project/local）。
 */
const SETTING_SOURCE_WHITELIST: readonly CliSettingSource[] = [
  'user',
  'project',
  'local',
]

export function parseSettingSourcesFlag(arg: string): CliSettingSource[] {
  const sources = arg
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  for (const s of sources) {
    if (!SETTING_SOURCE_WHITELIST.includes(s as CliSettingSource)) {
      throw new Error(
        `Invalid setting source "${s}". Valid sources: ${SETTING_SOURCE_WHITELIST.join(', ')}`,
      )
    }
  }
  return sources as CliSettingSource[]
}

// Check if running in debug/inspection mode（旧仓 isBeingDebugged 逐字保真）。
function isBeingDebugged(): boolean {
  const isBun = process.execPath.includes('bun')

  // Check for inspect flags in process arguments (including all variants)
  const hasInspectArg = process.execArgv.some(arg => {
    if (isBun) {
      // Note: Bun has an issue with single-file executables where application
      // arguments from process.argv leak into process.execArgv. We're fine to
      // skip that check, because Bun doesn't support Node.js legacy --debug or
      // --debug-brk flags
      return /--inspect(-brk)?/.test(arg)
    } else {
      // In Node.js, check for both --inspect and legacy --debug flags
      return /--inspect(-brk)?|--debug(-brk)?/.test(arg)
    }
  })

  // Check if NODE_OPTIONS contains inspect flags
  const hasInspectEnv =
    process.env.NODE_OPTIONS &&
    /--inspect(-brk)?|--debug(-brk)?/.test(process.env.NODE_OPTIONS)

  // Check if inspector is available and active (indicates debugging)
  try {
    // Dynamic import would be better but is async - use global object instead
    const inspector = (globalThis as any).require?.('inspector')
    const hasInspectorUrl = !!inspector?.url()
    return hasInspectorUrl || hasInspectArg || hasInspectEnv
  } catch {
    // Ignore error and fall back to argument detection
    return hasInspectArg || hasInspectEnv
  }
}

/**
 * 顶层守卫（旧仓 L244 逐字保真）：检出 node 调试/inspection 即退出。
 * de-ANT delta：旧 `("external" as any) !== 'ant'` 构建变体判据新仓恒真
 * （新仓无 ant 构建），守卫无条件生效。
 */
export function enforceNoDebugGuard(): void {
  if (isBeingDebugged()) {
    // Use process.exit directly here since we're in the top-level code before
    // imports and gracefulShutdown is not yet available
    process.exit(1)
  }
}

function loadSettingsFromFlag(settingsFile: string): void {
  try {
    const trimmedSettings = settingsFile.trim()
    const looksLikeJson =
      trimmedSettings.startsWith('{') && trimmedSettings.endsWith('}')
    let settingsPath: string
    if (looksLikeJson) {
      // It's a JSON string - validate and create temp file
      const parsedJson = safeParseJSON(trimmedSettings)
      if (!parsedJson) {
        process.stderr.write('Error: Invalid JSON provided to --settings\n')
        process.exit(1)
      }

      // Create a temporary file and write the JSON to it.
      // Use a content-hash-based path instead of random UUID to avoid
      // busting the API prompt cache（旧仓注释逐字保真）。
      settingsPath = generateTempFilePath('atlas-settings', '.json', {
        contentHash: trimmedSettings,
      })
      writeFileSync(settingsPath, trimmedSettings, 'utf8')
    } else {
      // It's a file path - resolve and validate by attempting to read
      const { resolvedPath: resolvedSettingsPath } = safeResolvePath(
        getFsImplementation(),
        settingsFile,
      )
      try {
        readFileSync(resolvedSettingsPath, 'utf8')
      } catch (e) {
        if (isENOENT(e)) {
          process.stderr.write(
            `Error: Settings file not found: ${resolvedSettingsPath}\n`,
          )
          process.exit(1)
        }
        throw e
      }
      settingsPath = resolvedSettingsPath
    }
    setFlagSettingsPath(settingsPath)
    resetSettingsCache()
  } catch (error) {
    if (error instanceof Error) {
      console.error(errorMessage(error))
    }
    process.stderr.write(`Error processing settings: ${errorMessage(error)}\n`)
    process.exit(1)
  }
}

function loadSettingSourcesFromFlag(settingSourcesArg: string): void {
  try {
    const sources = parseSettingSourcesFlag(settingSourcesArg)
    setAllowedSettingSources(sources)
    resetSettingsCache()
  } catch (error) {
    if (error instanceof Error) {
      console.error(errorMessage(error))
    }
    process.stderr.write(
      `Error processing --setting-sources: ${errorMessage(error)}\n`,
    )
    process.exit(1)
  }
}

/**
 * Parse and load settings flags early, before init()
 * This ensures settings are filtered from the start of initialization
 */
export function eagerLoadSettings(): void {
  // Parse --settings flag early to ensure settings are loaded before init()
  const settingsFile = eagerParseCliFlag('--settings')
  if (settingsFile) {
    loadSettingsFromFlag(settingsFile)
  }

  // Parse --setting-sources flag early to control which sources are loaded
  const settingSourcesArg = eagerParseCliFlag('--setting-sources')
  if (settingSourcesArg !== undefined) {
    loadSettingSourcesFromFlag(settingSourcesArg)
  }
}

/** 本地转写（旧仓 utils/cliArgs.js eagerParseCliFlag 同语义）：argv 早解析单值 flag。 */
export function eagerParseCliFlag(flag: string): string | undefined {
  const cliArgs = process.argv.slice(2)
  const idx = cliArgs.indexOf(flag)
  if (idx !== -1 && idx + 1 < cliArgs.length) {
    return cliArgs[idx + 1]
  }
  const eqIdx = cliArgs.findIndex(a => a.startsWith(`${flag}=`))
  if (eqIdx !== -1) {
    return cliArgs[eqIdx]!.slice(flag.length + 1)
  }
  return undefined
}

export function initializeEntrypoint(isNonInteractive: boolean): void {
  // Skip if already set (e.g., by SDK or other entrypoints)
  if (process.env.ATLAS_ENTRYPOINT) {
    return
  }
  const cliArgs = process.argv.slice(2)

  // Check for MCP serve command (handle flags before mcp serve, e.g., --debug mcp serve)
  const mcpIndex = cliArgs.indexOf('mcp')
  if (mcpIndex !== -1 && cliArgs[mcpIndex + 1] === 'serve') {
    process.env.ATLAS_ENTRYPOINT = 'mcp'
    return
  }
  if (process.env.ATLAS_ACTION) {
    process.env.ATLAS_ENTRYPOINT = 'claude-code-github-action'
    return
  }

  // Note: 'local-agent' entrypoint is set by the local agent mode launcher
  // via ATLAS_ENTRYPOINT env var (handled by early return above)

  // Set based on interactive status
  process.env.ATLAS_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli'
}
