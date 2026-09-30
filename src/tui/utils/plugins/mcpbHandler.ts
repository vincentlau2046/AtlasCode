// G-3（§8.74.28 R5-c）mcpb 切分面裁定：
// 裁除 = @anthropic-ai/mcpb 外部包面（vendor shim require 回落恒空 stub，包本地不安装）
//   + mcpb 安装流整链（下载/解压/缓存/needs-config：downloadMcpb/extractMcpbContents/
//     loadCacheMetadata/saveCacheMetadata/checkMcpbChanged/generateMcpConfig）
//   + dxt/helpers.ts（manifest zod 校验面，外部消费者已随本流裁除，零残留）
// 保留（通用面，无外部包依赖）= UserConfigValues / UserConfigSchema（选项形状本地化）
//   + loadMcpServerUserConfig / saveMcpServerUserConfig（settings.json 非敏感 +
//     secureStorage 敏感 双层分流，行为不变）+ validateUserConfig（纯逻辑）
//   + isMcpbSource（纯字符串判定）
// H6 前向接缝登记：loadMcpbFile = 抛错 stub。mcpb 插件安装流回流 = 自建 mcpb
//   解析/校验器（无排期）；此前 plugin mcpServers 面请用 JSON 文件（.mcp.json）
//   或内联配置。
import type { McpServerConfig } from '../../services/mcp/types.js'
import { logForDebugging } from '../debug.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import { getSecureStorage } from '../secureStorage/index.js'
import {
  getSettings_DEPRECATED,
  updateSettingsForSource,
} from '../settings/settings.js'

/**
 * User configuration values for MCPB
 */
export type UserConfigValues = Record<
  string,
  string | number | boolean | string[]
>

/**
 * User configuration option shape from the DXT manifest (R5-c localization:
 * the fields the generic surface below consumes; formerly re-exported from
 * @anthropic-ai/mcpb, which was removed).
 */
export type McpbUserConfigurationOption = {
  title?: string
  type?: string
  required?: boolean
  multiple?: boolean
  min?: number
  max?: number
  sensitive?: boolean
  [key: string]: unknown
}

/**
 * DXT/MCPB manifest shape (R5-c localization: the field subset the kept
 * generic surface consumes; the full manifest schema lived in
 * @anthropic-ai/mcpb and was removed with the install flow).
 */
export type McpbManifest = {
  name: string
  version?: string
  author?: { name: string; [key: string]: unknown }
  user_config?: Record<string, McpbUserConfigurationOption>
  [key: string]: unknown
}

/**
 * User configuration schema from DXT manifest
 */
export type UserConfigSchema = Record<string, McpbUserConfigurationOption>

/**
 * Result of loading an MCPB file (success case) — kept for the type surface of
 * the plugin-MCP integration and ManagePlugins; unreachable while the
 * install-flow seam is open (loadMcpbFile below throws).
 */
export type McpbLoadResult = {
  manifest: McpbManifest
  mcpConfig: McpServerConfig
  extractedPath: string
  contentHash: string
}

/**
 * Result when MCPB needs user configuration — kept for the type surface of
 * the plugin-MCP integration and ManagePlugins; unreachable while the
 * install-flow seam is open (loadMcpbFile below throws).
 */
export type McpbNeedsConfigResult = {
  status: 'needs-config'
  manifest: McpbManifest
  extractedPath: string
  contentHash: string
  configSchema: UserConfigSchema
  existingConfig: UserConfigValues
  validationErrors: string[]
}

/**
 * Check if a source string is an MCPB file reference
 */
export function isMcpbSource(source: string): boolean {
  return source.endsWith('.mcpb') || source.endsWith('.dxt')
}

/**
 * Compose the secureStorage key for a per-server secret bucket.
 * `pluginSecrets` is a flat map — per-server secrets share it with top-level
 * plugin options (pluginOptionsStorage.ts) using a `${pluginId}/${server}`
 * composite key. `/` can't appear in plugin IDs (`name@marketplace`) or
 * server names (MCP identifier constraints), so it's unambiguous. Keeps the
 * SecureStorageData schema unchanged and the single-keychain-entry size
 * budget (~2KB stdin-safe, see INC-3028) shared across all plugin secrets.
 */
function serverSecretsKey(pluginId: string, serverName: string): string {
  return `${pluginId}/${serverName}`
}

/**
 * Load user configuration for an MCP server, merging non-sensitive values
 * (from settings.json) with sensitive values (from secureStorage keychain).
 * secureStorage wins on collision — schema determines destination so
 * collision shouldn't happen, but if a user hand-edits settings.json we
 * trust the more secure source.
 *
 * Returns null only if NEITHER source has anything — callers skip
 * ${user_config.X} substitution in that case.
 *
 * @param pluginId - Plugin identifier in "plugin@marketplace" format
 * @param serverName - MCP server name from DXT manifest
 */
export function loadMcpServerUserConfig(
  pluginId: string,
  serverName: string,
): UserConfigValues | null {
  try {
    const settings = getSettings_DEPRECATED()
    const nonSensitive =
      settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName]

    const sensitive =
      getSecureStorage().read()?.pluginSecrets?.[
        serverSecretsKey(pluginId, serverName)
      ]

    if (!nonSensitive && !sensitive) {
      return null
    }

    logForDebugging(
      `Loaded user config for ${pluginId}/${serverName} (settings + secureStorage)`,
    )
    return { ...nonSensitive, ...sensitive }
  } catch (error) {
    const errorObj = toError(error)
    logError(errorObj)
    logForDebugging(
      `Failed to load user config for ${pluginId}/${serverName}: ${error}`,
      { level: 'error' },
    )
    return null
  }
}

/**
 * Save user configuration for an MCP server, splitting by `schema[key].sensitive`.
 * Mirrors savePluginOptions (pluginOptionsStorage.ts:90) for top-level options:
 *   - `sensitive: true` → secureStorage (keychain on macOS, .credentials.json 0600 elsewhere)
 *   - everything else   → settings.json pluginConfigs[pluginId].mcpServers[serverName]
 *
 * Without this split, per-channel `sensitive: true` was a false sense of
 * security — the dialog masked the input but the save went to plaintext
 * settings.json anyway. H1 #3617646 (Telegram/Discord bot tokens in
 * world-readable .env) surfaced this as the gap to close.
 *
 * Writes are skipped if nothing in that category is present.
 *
 * @param pluginId - Plugin identifier in "plugin@marketplace" format
 * @param serverName - MCP server name from DXT manifest
 * @param config - User configuration values
 * @param schema - The userConfig schema for this server (manifest.user_config
 *   or channels[].userConfig) — drives the sensitive/non-sensitive split
 */
export function saveMcpServerUserConfig(
  pluginId: string,
  serverName: string,
  config: UserConfigValues,
  schema: UserConfigSchema,
): void {
  try {
    const nonSensitive: UserConfigValues = {}
    const sensitive: Record<string, string> = {}

    for (const [key, value] of Object.entries(config)) {
      if (schema[key]?.sensitive === true) {
        sensitive[key] = String(value)
      } else {
        nonSensitive[key] = value
      }
    }

    // Scrub ONLY keys we're writing in this call. Covers both directions
    // across schema-version flips:
    //  - sensitive→secureStorage ⇒ remove stale plaintext from settings.json
    //  - nonSensitive→settings.json ⇒ remove stale entry from secureStorage
    //    (otherwise loadMcpServerUserConfig's {...nonSensitive, ...sensitive}
    //    would let the stale secureStorage value win on next read)
    // Partial `config` (user only re-enters one field) leaves other fields
    // untouched in BOTH stores — defense-in-depth against future callers.
    const sensitiveKeysInThisSave = new Set(Object.keys(sensitive))
    const nonSensitiveKeysInThisSave = new Set(Object.keys(nonSensitive))

    // Sensitive → secureStorage FIRST. If this fails (keychain locked,
    // .credentials.json perms), throw before touching settings.json — the
    // old plaintext stays as a fallback instead of losing BOTH copies.
    //
    // Also scrub non-sensitive keys from secureStorage — schema flipped
    // sensitive→false and they're being written to settings.json now. Without
    // this, loadMcpServerUserConfig's merge would let the stale secureStorage
    // value win on next read.
    const storage = getSecureStorage()
    const k = serverSecretsKey(pluginId, serverName)
    const existingInSecureStorage =
      storage.read()?.pluginSecrets?.[k] ?? undefined
    const secureScrubbed = existingInSecureStorage
      ? Object.fromEntries(
          Object.entries(existingInSecureStorage).filter(
            ([key]) => !nonSensitiveKeysInThisSave.has(key),
          ),
        )
      : undefined
    const needSecureScrub =
      secureScrubbed &&
      existingInSecureStorage &&
      Object.keys(secureScrubbed).length !==
        Object.keys(existingInSecureStorage).length
    if (Object.keys(sensitive).length > 0 || needSecureScrub) {
      const existing = storage.read() ?? {}
      if (!existing.pluginSecrets) {
        existing.pluginSecrets = {}
      }
      // secureStorage keyvault is a flat object — direct replace, no merge
      // semantics to worry about (unlike settings.json's mergeWith).
      existing.pluginSecrets[k] = {
        ...secureScrubbed,
        ...sensitive,
      }
      const result = storage.update(existing)
      if (!result.success) {
        throw new Error(
          `Failed to save sensitive config to secure storage for ${k}`,
        )
      }
      if (result.warning) {
        logForDebugging(`Server secrets save warning: ${result.warning}`, {
          level: 'warn',
        })
      }
      if (needSecureScrub) {
        logForDebugging(
          `saveMcpServerUserConfig: scrubbed ${
            Object.keys(existingInSecureStorage!).length -
            Object.keys(secureScrubbed!).length
          } stale non-sensitive key(s) from secureStorage for ${k}`,
        )
      }
    }

    // Non-sensitive → settings.json. Write whenever there are new non-sensitive
    // values OR existing plaintext sensitive values to scrub — so reconfiguring
    // a sensitive-only schema still cleans up the old settings.json. Runs
    // AFTER the secureStorage write succeeded, so the scrub can't leave you
    // with zero copies of the secret.
    //
    // updateSettingsForSource does mergeWith(diskSettings, ourSettings, ...)
    // which PRESERVES destination keys absent from source — so simply omitting
    // sensitive keys doesn't scrub them, the disk copy merges back in. Instead:
    // set each sensitive key to explicit `undefined` — mergeWith (with the
    // customizer at settings.ts:349) treats explicit undefined as a delete.
    const settings = getSettings_DEPRECATED()
    const existingInSettings =
      settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName] ?? {}
    const keysToScrubFromSettings = Object.keys(existingInSettings).filter(k =>
      sensitiveKeysInThisSave.has(k),
    )
    if (
      Object.keys(nonSensitive).length > 0 ||
      keysToScrubFromSettings.length > 0
    ) {
      if (!settings.pluginConfigs) {
        settings.pluginConfigs = {}
      }
      if (!settings.pluginConfigs[pluginId]) {
        settings.pluginConfigs[pluginId] = {}
      }
      if (!settings.pluginConfigs[pluginId].mcpServers) {
        settings.pluginConfigs[pluginId].mcpServers = {}
      }
      // Build the scrub-via-undefined map. The UserConfigValues type doesn't
      // include undefined, but updateSettingsForSource's mergeWith customizer
      // needs explicit undefined to delete — cast is deliberate internal
      // plumbing (same rationale as deletePluginOptions in
      // pluginOptionsStorage.ts:184, see ATLAS.md's 10% case).
      const scrubbed = Object.fromEntries(
        keysToScrubFromSettings.map(k => [k, undefined]),
      ) as Record<string, undefined>
      settings.pluginConfigs[pluginId].mcpServers![serverName] = {
        ...nonSensitive,
        ...scrubbed,
      } as UserConfigValues
      const result = updateSettingsForSource('userSettings', settings)
      if (result.error) {
        throw result.error
      }
      if (keysToScrubFromSettings.length > 0) {
        logForDebugging(
          `saveMcpServerUserConfig: scrubbed ${keysToScrubFromSettings.length} plaintext sensitive key(s) from settings.json for ${pluginId}/${serverName}`,
        )
      }
    }

    logForDebugging(
      `Saved user config for ${pluginId}/${serverName} (${Object.keys(nonSensitive).length} non-sensitive, ${Object.keys(sensitive).length} sensitive)`,
    )
  } catch (error) {
    const errorObj = toError(error)
    logError(errorObj)
    throw new Error(
      `Failed to save user configuration for ${pluginId}/${serverName}: ${errorObj.message}`,
    )
  }
}

/**
 * Validate user configuration values against DXT user_config schema
 */
export function validateUserConfig(
  values: UserConfigValues,
  schema: UserConfigSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check each field in the schema
  for (const [key, fieldSchema] of Object.entries(schema)) {
    const value = values[key]

    // Check required fields
    if (fieldSchema.required && (value === undefined || value === '')) {
      errors.push(`${fieldSchema.title || key} is required but not provided`)
      continue
    }

    // Skip validation for optional fields that aren't provided
    if (value === undefined || value === '') {
      continue
    }

    // Type validation
    if (fieldSchema.type === 'string') {
      if (Array.isArray(value)) {
        // String arrays are allowed if multiple: true
        if (!fieldSchema.multiple) {
          errors.push(
            `${fieldSchema.title || key} must be a string, not an array`,
          )
        } else if (!value.every(v => typeof v === 'string')) {
          errors.push(`${fieldSchema.title || key} must be an array of strings`)
        }
      } else if (typeof value !== 'string') {
        errors.push(`${fieldSchema.title || key} must be a string`)
      }
    } else if (fieldSchema.type === 'number' && typeof value !== 'number') {
      errors.push(`${fieldSchema.title || key} must be a number`)
    } else if (fieldSchema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${fieldSchema.title || key} must be a boolean`)
    } else if (
      (fieldSchema.type === 'file' || fieldSchema.type === 'directory') &&
      typeof value !== 'string'
    ) {
      errors.push(`${fieldSchema.title || key} must be a path string`)
    }

    // Number range validation
    if (fieldSchema.type === 'number' && typeof value === 'number') {
      if (fieldSchema.min !== undefined && value < fieldSchema.min) {
        errors.push(
          `${fieldSchema.title || key} must be at least ${fieldSchema.min}`,
        )
      }
      if (fieldSchema.max !== undefined && value > fieldSchema.max) {
        errors.push(
          `${fieldSchema.title || key} must be at most ${fieldSchema.max}`,
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * H6 forward seam (G-3 §8.74.28 R5-c): the mcpb install flow (download →
 * extract → cache → needs-config → generateMcpConfig) was removed — the
 * @anthropic-ai/mcpb package is not installed locally (the vendor shim's
 * require fallback was a permanent empty stub, so this flow was dead at
 * runtime). Re-landing it = a first-party mcpb parser/validator (unscheduled).
 * Until then, plugin `mcpServers` entries must be JSON files (.mcp.json) or
 * inline configs; .mcpb/.dxt sources surface this error honestly.
 */
export async function loadMcpbFile(
  source: string,
  pluginPath: string,
  pluginId: string,
  _onProgress?: (status: string) => void,
  _providedUserConfig?: UserConfigValues,
  _forceConfigDialog?: boolean,
): Promise<McpbLoadResult | McpbNeedsConfigResult> {
  logForDebugging(`MCPB install flow unavailable (forward seam): ${source}`)
  throw new Error(
    `MCPB install flow is not available (G-3 forward seam, §8.74.28 R5-c): cannot load "${source}" for plugin "${pluginId}" (source: ${pluginPath}). Use a .mcp.json file or inline server configs instead.`,
  )
}
