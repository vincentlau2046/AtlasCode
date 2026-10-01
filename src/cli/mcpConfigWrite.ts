/**
 * cli（CLI 公共域）S-C4 commit 4（§8.71.1.4）— mcp 配置写回面 + scope 辅助
 * （旧仓 services/mcp/config.ts 写回面 + utils.ts scope 辅助 + envExpansion.ts
 * 裁剪随迁；mcp 域 mcpConfig.ts 头注「写回面 = CLI mcp add/remove 面，归
 * CLI 波（域外登记）」本提交核销）。
 *
 * scope 值域映射裁定（旧 config store 双件 + .mcp.json → 新仓 settings 3 可
 * 编辑源，delta 登记）：
 *   - project = <cwd>/.mcp.json（writeMcpjsonFile 权限保持写，旧仓逐字：
 *     stat mode 保留 → temp 写 → datasync → chmod → rename → 失败 unlink）
 *   - user = userSettings 源（旧 global config store → 新仓 settings 文件，
 *     updateSettingsForSource('userSettings')）
 *   - local = localSettings 源（旧 current-project config store per-project
 *     slot → 新仓 per-project gitignored settings 文件，
 *     updateSettingsForSource('localSettings')）
 *
 * 读面裁定：
 *   - 旧 getMcpConfigsByScope 同步 fs（readFileSync 链）→ 新仓 mcp 域
 *     loadProjectMcpJson = 异步 readFile（域内无同步读面）→ 本面统一 Promise
 *     返回（user/local 支内部仍同步读 settings 缓存）
 *   - .mcp.json 父目录上溯 = 裁（mcp 域「3 子裁补登记 (a)」逐字：读写回面
 *     均 <cwd>/.mcp.json 单文件）
 *   - 单服务器解析 = mcp 域 parseMcpServerConfig（zod safeParse fail-soft：
 *     坏单台跳过不沉全果，旧 addScopeToServers 前校验同语义）
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - enterprise / managed / dynamic / claudeai scope 支（mcp 域 R2 2 源
 *     裁定，mcpConfig.ts 头注逐字）/ CHICAGO_MCP 保留名检查（feature 面
 *     域外）/ 企业策略 allowedMcpServers·deniedMcpServers 过滤（policy 波）
 *   - secure storage 清理（旧 remove 面 clearServerTokensFromLocalStorage /
 *     clearMcpClientConfig keychain 槽）= 新仓无 auth 存储面（OAuth 车道
 *     裁 前向缝登记（§8.74.28 ⑭，#200））
 *   - env 展开 missingVars 错误上报面：旧 ValidationError 聚合硬错误 →
 *     新仓解析面 fail-soft（坏台跳过），missingVars 仅 logForDebugging
 *     登记（delta 裁定：发现链不因缺变量崩面，与 mcp 域 fail-soft 同向）
 *   - logEvent tengu_mcp_* 遥测点（旧仓 879 点清核）/ getPlatform（handler
 *     无平台支）
 *
 * boundaries allow 面（eslint.config.mjs cli 规则既覆盖面，无新增）：engine
 * （settings 读 + 写回面 getSettingsForSource/updateSettingsForSource/
 * getSettingsFilePathForSource）+ mcp（型面 + 解析面 + loadProjectMcpJson）
 * + shared（logForDebugging）。
 */
import { chmod, open, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getSettingsFilePathForSource,
  getSettingsForSource,
  updateSettingsForSource,
} from '../engine'
import {
  ConfigScopeSchema,
  loadProjectMcpJson,
  McpServerConfigSchema,
  parseMcpJsonConfig,
  parseMcpServerConfig,
  type ConfigScope,
  type McpJsonConfig,
  type McpServerConfig,
  type ScopedMcpServerConfig,
} from '../mcp'
// N9-debug（user-e2e 1606 §7 项 6）：headless debug 面真 sink（shared no-op
// 换绑 cli 域 writer；charter C-4 不动）
import { logForDebugging } from './debugSink'

/** CLI 可写 scope 值域（parse 选项面 -s local/user/project；型面 7 值 enum
 * 逐字保留于 mcp 域，值域收窄 = R2 裁定同向）。 */
export type McpCliScope = 'local' | 'user' | 'project'

function scopeToSettingsSource(
  scope: 'local' | 'user',
): 'localSettings' | 'userSettings' {
  return scope === 'local' ? 'localSettings' : 'userSettings'
}

function getCwdMcpJsonPath(): string {
  return join(process.cwd(), '.mcp.json')
}

// ── scope 辅助（旧 utils.ts L263-340 随迁；dynamic/enterprise/claudeai 支
//    值域收窄裁）────────────────────────────────────────────────────

/**
 * Describe the file path for a given MCP config scope（user/local 经新仓
 * settings 源路径面，delta 登记见头注）。
 */
export function describeMcpConfigFilePath(scope: ConfigScope): string {
  switch (scope) {
    case 'user':
      return getSettingsFilePathForSource('userSettings') ?? ''
    case 'project':
      return getCwdMcpJsonPath()
    case 'local':
      return getSettingsFilePathForSource('localSettings') ?? ''
    default:
      return scope
  }
}

export function getScopeLabel(scope: ConfigScope): string {
  switch (scope) {
    case 'local':
      return 'Local config (private to you in this project)'
    case 'project':
      return 'Project config (shared via .mcp.json)'
    case 'user':
      return 'User config (available in all your projects)'
    default:
      return scope
  }
}

export function ensureConfigScope(scope?: string): ConfigScope {
  if (!scope) return 'local'

  if (!ConfigScopeSchema().options.includes(scope as ConfigScope)) {
    throw new Error(
      `Invalid scope: ${scope}. Must be one of: ${ConfigScopeSchema().options.join(', ')}`,
    )
  }

  return scope as ConfigScope
}

export function ensureTransport(type?: string): 'stdio' | 'sse' | 'http' {
  if (!type) return 'stdio'

  if (type !== 'stdio' && type !== 'sse' && type !== 'http') {
    throw new Error(
      `Invalid transport type: ${type}. Must be one of: stdio, sse, http`,
    )
  }

  return type as 'stdio' | 'sse' | 'http'
}

/** 旧 utils.ts parseHeaders 逐字（"K: V" 冒号分割）。 */
export function parseHeaders(headerArray: string[]): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const header of headerArray) {
    const colonIndex = header.indexOf(':')
    if (colonIndex === -1) {
      throw new Error(
        `Invalid header format: "${header}". Expected format: "Header-Name: value"`,
      )
    }

    const key = header.substring(0, colonIndex).trim()
    const value = header.substring(colonIndex + 1).trim()

    if (!key) {
      throw new Error(
        `Invalid header format: "${header}". Header name cannot be empty.`,
      )
    }

    headers[key] = value
  }

  return headers
}

/** 旧 utils/envUtils.ts parseEnvVars 逐字（KEY=VALUE 列表；"KEY" 无值报错，
 * "KEY=" 空值合法）。 */
export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}

  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
        )
      }
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}

// ── env 展开（旧 envExpansion.ts 逐字 + 单服务器配置级展开）────────────

/**
 * Expand environment variables in a string value.
 * Handles ${VAR} and ${VAR:-default} syntax.
 */
export function expandEnvVarsInString(value: string): {
  expanded: string
  missingVars: string[]
} {
  const missingVars: string[] = []

  const expanded = value.replace(/\$\{([^}]+)\}/g, (match, varContent) => {
    // Split on :- to support default values (limit to 2 parts to preserve :- in defaults)
    const [varName, defaultValue] = varContent.split(':-', 2)
    const envValue = process.env[varName]

    if (envValue !== undefined) {
      return envValue
    }
    if (defaultValue !== undefined) {
      return defaultValue
    }

    // Track missing variable for error reporting
    missingVars.push(varName)
    // Return original if not found (allows debugging but will be reported as error)
    return match
  })

  return {
    expanded,
    missingVars,
  }
}

/**
 * 单服务器 raw 配置 env 展开（旧 config.ts expandEnvVars 8 型支值域收窄：
 * stdio 支 = command/args/env，sse/http/ws 支 = url/headers，ide/sdk/
 * claudeai-proxy 逐字不动。raw unknown 输入（settings 记录 / .mcp.json
 * 未 parse 值），shallow copy 后展开（不污染 settings 缓存对象）——旧
 * expandVars:true 语义（展开值进 schema 校验前）。
 */
function expandServerConfig(raw: unknown): {
  config: unknown
  missingVars: string[]
} {
  const missingVars: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: raw, missingVars }
  }
  const r: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  const expandOne = (s: string): string => {
    const { expanded, missingVars: mv } = expandEnvVarsInString(s)
    missingVars.push(...mv)
    return expanded
  }
  const expandRecord = (rec: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(rec).map(([k, v]) => [
        k,
        typeof v === 'string' ? expandOne(v) : v,
      ]),
    )

  const t = r.type
  if (t === undefined || t === 'stdio') {
    if (typeof r.command === 'string') r.command = expandOne(r.command)
    if (Array.isArray(r.args)) {
      r.args = r.args.map(a => (typeof a === 'string' ? expandOne(a) : a))
    }
    if (r.env && typeof r.env === 'object' && !Array.isArray(r.env)) {
      r.env = expandRecord(r.env as Record<string, unknown>)
    }
  } else if (t === 'sse' || t === 'http' || t === 'ws') {
    if (typeof r.url === 'string') r.url = expandOne(r.url)
    if (r.headers && typeof r.headers === 'object' && !Array.isArray(r.headers)) {
      r.headers = expandRecord(r.headers as Record<string, unknown>)
    }
  }
  // sse-ide / ws-ide / sdk / claudeai-proxy = 旧 switch 逐字不动支
  return { config: r, missingVars }
}

// ── .mcp.json 权限保持写（旧 config.ts writeMcpjsonFile 逐字）──────────

async function writeMcpjsonFile(config: McpJsonConfig): Promise<void> {
  const mcpJsonPath = getCwdMcpJsonPath()

  // Read existing file permissions to preserve them
  let existingMode: number | undefined
  try {
    const stats = await stat(mcpJsonPath)
    existingMode = stats.mode
  } catch (e: unknown) {
    const code = (e as { code?: string }).code
    if (code !== 'ENOENT') {
      throw e
    }
    // File doesn't exist yet -- no permissions to preserve
  }

  // Write to temp file, flush to disk, then atomic rename
  const tempPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`
  const handle = await open(tempPath, 'w', existingMode ?? 0o644)
  try {
    await handle.writeFile(JSON.stringify(config, null, 2), {
      encoding: 'utf8',
    })
    await handle.datasync()
  } finally {
    await handle.close()
  }

  try {
    // Restore original file permissions on the temp file before rename
    if (existingMode !== undefined) {
      await chmod(tempPath, existingMode)
    }
    await rename(tempPath, mcpJsonPath)
  } catch (e: unknown) {
    // Clean up temp file on failure
    try {
      await unlink(tempPath)
    } catch {
      // Best-effort cleanup
    }
    throw e
  }
}

// ── 读面（3 scope；读面裁定 + 裁登记见头注）──────────────────────────

function readSettingsMcpServers(
  scope: 'local' | 'user',
): Record<string, unknown> {
  const record = getSettingsForSource(
    scopeToSettingsSource(scope),
  )?.mcpServers
  return record && typeof record === 'object' && !Array.isArray(record)
    ? (record as Record<string, unknown>)
    : {}
}

async function readProjectMcpServers(): Promise<Record<string, McpServerConfig>> {
  const raw = await loadProjectMcpJson(getCwdMcpJsonPath())
  const config = raw ? parseMcpJsonConfig(raw) : null
  return config?.mcpServers ?? {}
}

function parseScopedServers(
  rawServers: Record<string, unknown>,
  scope: McpCliScope,
): Record<string, ScopedMcpServerConfig> {
  const out: Record<string, ScopedMcpServerConfig> = {}
  const missing: string[] = []
  for (const [name, raw] of Object.entries(rawServers)) {
    const { config, missingVars } = expandServerConfig(raw)
    missing.push(...missingVars)
    const parsed = parseMcpServerConfig(config)
    if (parsed) {
      out[name] = { ...(parsed as object), scope } as ScopedMcpServerConfig
    }
  }
  if (missing.length > 0) {
    // 裁登记见头注：missingVars 仅登记不硬错误（mcp 域 fail-soft 同向）
    logForDebugging(
      `MCP config missing env vars in ${scope} scope: ${[...new Set(missing)].join(', ')}`,
    )
  }
  return out
}

/**
 * Get MCP configs from a specific scope（读面裁定：旧同步 fs → 新统一
 * Promise，delta 登记见头注）。
 */
export async function getMcpConfigsByScope(
  scope: McpCliScope,
): Promise<Record<string, ScopedMcpServerConfig>> {
  const rawServers =
    scope === 'project'
      ? await readProjectMcpServers()
      : readSettingsMcpServers(scope)
  return parseScopedServers(rawServers, scope)
}

/**
 * Get an MCP server configuration by name.
 * 支序 = 旧 enterprise > local > project > user，enterprise 槽裁（R2）。
 */
export async function getMcpConfigByName(
  name: string,
): Promise<ScopedMcpServerConfig | null> {
  const [localServers, projectServers, userServers] = await Promise.all([
    getMcpConfigsByScope('local'),
    getMcpConfigsByScope('project'),
    getMcpConfigsByScope('user'),
  ])
  return (
    localServers[name] ?? projectServers[name] ?? userServers[name] ?? null
  )
}

/**
 * 全量合并（同名遮蔽支序 local > project > user，旧就近优先同向；旧
 * plugin/claudeai 源随面裁）。
 */
export async function getAllMcpConfigs(): Promise<
  Record<string, ScopedMcpServerConfig>
> {
  const [localServers, projectServers, userServers] = await Promise.all([
    getMcpConfigsByScope('local'),
    getMcpConfigsByScope('project'),
    getMcpConfigsByScope('user'),
  ])
  return { ...userServers, ...projectServers, ...localServers }
}

// ── 写回面（add / remove；裁登记见头注）──────────────────────────────

function writeSettingsMcpServers(
  source: 'userSettings' | 'localSettings',
  current: Record<string, unknown>,
  name: string,
  config: McpServerConfig,
): void {
  const { error } = updateSettingsForSource(source, {
    mcpServers: { ...current, [name]: config },
  })
  if (error) {
    throw error
  }
}

/**
 * Add a new MCP server configuration.
 * @throws Error if name is invalid or server already exists, or if the
 * config is invalid
 */
export async function addMcpConfig(
  name: string,
  config: unknown,
  scope: ConfigScope,
): Promise<void> {
  if (name.match(/[^a-zA-Z0-9_-]/)) {
    throw new Error(
      `Invalid name ${name}. Names can only contain letters, numbers, hyphens, and underscores.`,
    )
  }

  // Validate config（CHICAGO_MCP 保留名 + 企业策略 allow/deny 支裁登记见
  // 头注）
  const result = McpServerConfigSchema().safeParse(config)
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join(', ')
    throw new Error(`Invalid configuration: ${formattedErrors}`)
  }
  const validatedConfig = result.data

  // Check if server already exists in the target scope + write per scope
  switch (scope) {
    case 'project': {
      const existing = await readProjectMcpServers()
      if (existing[name]) {
        throw new Error(`MCP server ${name} already exists in .mcp.json`)
      }
      const mcpConfig: McpJsonConfig = {
        mcpServers: { ...existing, [name]: validatedConfig },
      }
      try {
        await writeMcpjsonFile(mcpConfig)
      } catch (error) {
        throw new Error(`Failed to write to .mcp.json: ${error}`)
      }
      break
    }
    case 'user': {
      const current = readSettingsMcpServers('user')
      if (current[name]) {
        throw new Error(`MCP server ${name} already exists in user config`)
      }
      writeSettingsMcpServers('userSettings', current, name, validatedConfig)
      break
    }
    case 'local': {
      const current = readSettingsMcpServers('local')
      if (current[name]) {
        throw new Error(`MCP server ${name} already exists in local config`)
      }
      writeSettingsMcpServers('localSettings', current, name, validatedConfig)
      break
    }
    default:
      throw new Error(`Cannot add MCP server to scope: ${scope}`)
  }
}

/**
 * Remove an MCP server configuration.
 * @throws Error if server not found in specified scope
 */
export async function removeMcpConfig(
  name: string,
  scope: ConfigScope,
): Promise<void> {
  switch (scope) {
    case 'project': {
      const existing = await readProjectMcpServers()
      if (!existing[name]) {
        throw new Error(`No MCP server found with name: ${name} in .mcp.json`)
      }
      const mcpServers: McpJsonConfig['mcpServers'] = {}
      for (const [serverName, serverConfig] of Object.entries(existing)) {
        if (serverName !== name) {
          mcpServers[serverName] = serverConfig
        }
      }
      try {
        await writeMcpjsonFile({ mcpServers })
      } catch (error) {
        throw new Error(`Failed to remove from .mcp.json: ${error}`)
      }
      break
    }
    case 'user': {
      const current = readSettingsMcpServers('user')
      if (!current[name]) {
        throw new Error(`No user-scoped MCP server found with name: ${name}`)
      }
      // updateSettingsForSource 删键语义：显式 undefined 键 = 删除（merge.ts
      // 头注；其余键保留）
      const { error } = updateSettingsForSource('userSettings', {
        mcpServers: { [name]: undefined },
      })
      if (error) {
        throw error
      }
      break
    }
    case 'local': {
      const current = readSettingsMcpServers('local')
      if (!current[name]) {
        throw new Error(
          `No project-local MCP server found with name: ${name}`,
        )
      }
      const { error } = updateSettingsForSource('localSettings', {
        mcpServers: { [name]: undefined },
      })
      if (error) {
        throw error
      }
      break
    }
    default:
      throw new Error(`Cannot remove MCP server from scope: ${scope}`)
  }
}
