/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * engine/config — settings 加载/合并/写回核心（§8.27 E-3 S-3b，
 * 旧仓 utils/settings/settings.ts 1011L 裁剪版真核心）
 *
 * 真核心（旧仓逐字语义随迁）：
 *   - parseSettingsFile（parseFileCache 路径级缓存 + structuredClone 隔离）
 *   - loadManagedFileSettings（managed-settings.json 基座 + drop-in 字母序
 *     后文件赢，systemd 惯例）
 *   - getSettingsFilePathForSource / getSettingsForSource（perSourceCache）
 *   - loadSettingsFromDisk（plugin base + 级联 user→policy→flag，错误去重 +
 *     seenFiles 同路径去重）
 *   - updateSettingsForSource（删键=显式 undefined / 数组整替 / 坏 JSON 守卫 /
 *     写后 resetSettingsCache）
 *   - getInitialSettings / getSettingsWithErrors（sessionSettingsCache）
 *
 * 语义裁定（对照旧仓，残留守登记防「以为已全」）：
 *   - policySettings 单文件支：旧仓四链 remote > MDM(HKLM/plist) > file > HKCU
 *     （first-source-wins）裁为 managed-settings.json + drop-in 单支。
 *     remoteSettings 死通道（旧仓 const null）/ MDM registry+plist / HKCU
 *     均残留守（Linux 文件通道 = managed 层单一活通道）。
 *     getPolicySettingsOrigin 返回面裁为 'file' | null（旧五值）。
 *   - flagSettings = 死源（S-3a 裁定）：无 --settings CLI 面、无 SDK inline
 *     settings 面（旧仓 getFlagSettingsInline/getFlagSettingsPath 不随迁）→
 *     路径 undefined、加载恒 null。级联位保留（源层常量不动，死源短路）。
 *   - projectSettings/localSettings 不在合并级联（S-3a 裁定，旧仓语义逐字：
 *     仅 permissionsLoader/hooksSettings/sandbox 按源直读 + 写回面消费，
 *     S-3c/S-3b 写回）。
 *   - getSettingsRootPathForSource：旧仓 getOriginalCwd（bootstrap 面）裁为
 *     process.cwd()；policy 根旧仓返 cwd（UI 关联文件语义）→ 新仓返
 *     managed 目录（文件真实所在，更真）。
 *   - cowork 双文件名（cowork_settings.json / ATLAS_USE_COWORK_PLUGINS）
 *     裁剪：用户文件恒 settings.json。
 *   - 递归守卫 isLoadingSettings 裁剪：旧仓 MDM/remote 链可重入 loadSettings
 *     才需守卫，新仓单文件支无重入路径。
 *   - updateSettingsForSource 删键语义依赖 mergeWith 的 customizer 先于
 *     undefined 判定执行（merge.ts 头注）；markInternalWrite（旧仓变更检测
 *     热更面）裁剪——新仓无 settings 热更消费点（残留守）。
 *   - localSettings gitignore 联动（addFileGlobRuleToGitignore）裁剪：新仓无
 *     git 域（残留守）。
 *   - 写回 durability（旧仓 writeFileSyncAndFlush fsync 段）裁剪：settings
 *     非 durability 敏感数据（shared/fs-operations 加法原语头注）。
 *   - 不随迁整函数（消费面未落/死代码，登记防「以为已全」）：
 *     getSettingsWithSources（/status 逐源呈现）/ getSettings_DEPRECATED /
 *     getManagedFileSettingsPresence（UI）/ getManagedSettingsKeysForLogging
 *     （日志展开面）/ rawSettingsContainsKey / hasAutoModeOptIn /
 *     getUseAutoModeDuringPlan（残留守：CLI 面不消费，auto-mode 波按需
 *     回填）。getAutoModeConfig **S-C4 commit 5（CLI 波）已落**（本文件
 *     尾段；裁登记核销，消费点 = cli/handlers/autoMode.ts defaults/config/
 *     critique 3 handler）。hasSkipDangerousModePermissionPrompt
 *     **E-4 S-4c1 已落**（本文件，接缝⑥；trusted 4 源读 + RCE 排除注释逐字）。
 *   - 错误日志：旧仓 logError/logForDiagnosticsNoPII/profileCheckpoint →
 *     新仓 logForDebugging no-op 门面（charter C-4 logging port 定案前）。
 *
 * 预声明消费接缝登记（H6 防空洞：以下导出本版无消费点，消费面随后续切片
 * 落地，登记防「以为已全」亦防误删）：
 *   - getPolicySettingsOrigin（'file' | null）：消费面 = 诊断/组合根纵切
 *     （/status 呈现 = 残留守 UI 面）
 *   - updateSettingsForSource：S-4c1 消费实挂（engine/permissions/
 *     permissionRulesLoader addPermissionRulesToSettings /
 *     deletePermissionRuleFromSettings 写回路径）
 *   - hasSkipDangerousModePermissionPrompt：消费面 = bypass 模式确认 UI
 *     （残留守 UI 面，本版无消费点）
 *   - getSettingsWithErrors：S-3c 已消费（hooksConfig 门控链 + managedEnv
 *     apply 两面按源直读）；S-3d settings-adapter 经 getInitialSettings
 *     间接消费（本函数为其实现基座）
 *   - getInitialSettings：S-3d 已消费（atlascode settings-adapter
 *     getRoleSetting/getProviders 两方法，旧仓 getSettings_DEPRECATED 逐字
 *     等价面）
 */
import { dirname, join, resolve } from 'path'
import {
  errorMessage,
  feature,
  getErrnoCode,
  getFsImplementation,
  isENOENT,
  logForDebugging,
  getConfigDirName,
} from '../../shared'
import { z } from 'zod'
import { getAtlasConfigHomeDir } from './configRoot'
import {
  getEnabledSettingSources,
  SETTING_SOURCES,
  type EditableSettingSource,
  type SettingSource,
} from './constants'
import { mergeWith, settingsMergeCustomizer } from './merge'
import { getManagedSettingsDropInDir, getManagedSettingsDir } from './managedPath'
import {
  getCachedParsedFile,
  getCachedSettingsForSource,
  getPluginSettingsBase,
  getSessionSettingsCache,
  resetSettingsCache,
  setCachedParsedFile,
  setCachedSettingsForSource,
  setSessionSettingsCache,
} from './settingsCache'
import { type SettingsJson, SettingsSchema, type SettingsWithErrors, type ValidationError } from './types'
import { filterInvalidPermissionRules, formatZodError } from './validation'

/** Get the path to the managed settings file (Linux /etc/atlas 单支，S-3a 裁定) */
function getManagedSettingsFilePath(): string {
  return join(getManagedSettingsDir(), 'managed-settings.json')
}

/**
 * Load file-based managed settings: managed-settings.json + managed-settings.d/*.json.
 *
 * managed-settings.json 先合并（最低优先级/基座），drop-in 文件按字母序
 * 叠上（高优先级，后文件赢）。systemd/sudoers drop-in 惯例：基座给默认，
 * drop-in 定制（10-otel.json / 20-security.json 独立策略碎片互不协调编辑）。
 * Exported for testing.
 */
export function loadManagedFileSettings(): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  const errors: ValidationError[] = []
  let merged: SettingsJson = {}
  let found = false

  const { settings, errors: baseErrors } = parseSettingsFile(
    getManagedSettingsFilePath(),
  )
  errors.push(...baseErrors)
  if (settings && Object.keys(settings).length > 0) {
    merged = mergeWith(merged, settings, settingsMergeCustomizer)
    found = true
  }

  const dropInDir = getManagedSettingsDropInDir()
  try {
    const entries = getFsImplementation()
      .readdirSync(dropInDir)
      .filter(
        d =>
          (d.isFile() || d.isSymbolicLink()) &&
          d.name.endsWith('.json') &&
          !d.name.startsWith('.'),
      )
      .map(d => d.name)
      .sort()
    for (const name of entries) {
      const { settings, errors: fileErrors } = parseSettingsFile(
        join(dropInDir, name),
      )
      errors.push(...fileErrors)
      if (settings && Object.keys(settings).length > 0) {
        merged = mergeWith(merged, settings, settingsMergeCustomizer)
        found = true
      }
    }
  } catch (e) {
    const code = getErrnoCode(e)
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      logForDebugging(
        `Failed to read managed settings drop-in dir: ${code ?? String(e)}`,
      )
    }
  }

  return { settings: found ? merged : null, errors }
}

/**
 * Handles file system errors appropriately（ENOENT 静默 debug，其余 logForDebugging
 * —— 旧仓 logError 裁为 no-op 门面，见头注残留守）
 */
function handleFileSystemError(error: unknown, path: string): void {
  if (isENOENT(error)) {
    logForDebugging(
      `Broken symlink or missing file encountered for settings.json at path: ${path}`,
    )
  } else {
    logForDebugging(`settings file system error at ${path}: ${errorMessage(error)}`)
  }
}

/**
 * JSON.parse 安全包装（旧仓 safeParseJSON 裁剪）：
 *   - BOM 剥离（PowerShell 5.x 写 UTF-8 带 BOM；旧仓 jsonc 支的 stripBOM 语义）
 *   - shouldLogError=false 语义（旧仓 parseSettingsFile 调用点传 false：
 *     坏 JSON 经 zod 错误面呈现，不重复日志）
 *   - 内容寻址 parse 缓存（旧仓 memoize）不随迁：路径级 parseFileCache
 *     已去重，内容缓存收益不成立
 */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

/**
 * Parses a settings file into a structured format（parseFileCache 路径级缓存；
 * 返回 settings 经 structuredClone 隔离，调用方 mutate 不泄漏缓存条目）
 */
export function parseSettingsFile(path: string): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  const cached = getCachedParsedFile(path)
  if (cached) {
    // Clone so callers (e.g. mergeWith in loadSettingsFromDisk,
    // updateSettingsForSource) can't mutate the cached entry.
    return {
      settings: cached.settings ? structuredClone(cached.settings) : null,
      errors: cached.errors,
    }
  }
  const result = parseSettingsFileUncached(path)
  setCachedParsedFile(path, result)
  // Clone the first return too — the caller may mutate before
  // another caller reads the same cache entry.
  return {
    settings: result.settings ? structuredClone(result.settings) : null,
    errors: result.errors,
  }
}

function parseSettingsFileUncached(path: string): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  try {
    const fs = getFsImplementation()
    const resolvedPath = fs.realpathSync(path)
    const content = fs.readFileSync(resolvedPath, { encoding: 'utf-8' })

    if (content.trim() === '') {
      return { settings: {}, errors: [] }
    }

    const data = parseJson(content)

    // Filter invalid permission rules before schema validation so one bad
    // entry doesn't cause the entire settings file to be rejected.
    const ruleWarnings = filterInvalidPermissionRules(data, path)

    const result = SettingsSchema().safeParse(data)

    if (!result.success) {
      const errors = formatZodError(result.error, path)
      return { settings: null, errors: [...ruleWarnings, ...errors] }
    }

    return { settings: result.data, errors: ruleWarnings }
  } catch (error) {
    handleFileSystemError(error, path)
    return { settings: null, errors: [] }
  }
}

/**
 * Get the absolute path to the associated file root for a given settings source
 * （语义裁定见头注：project/local 根 = process.cwd()；policy 根 = managed 目录）
 */
export function getSettingsRootPathForSource(source: SettingSource): string {
  switch (source) {
    case 'userSettings':
      return resolve(getAtlasConfigHomeDir())
    case 'policySettings':
      return resolve(getManagedSettingsDir())
    case 'projectSettings':
    case 'localSettings':
      return resolve(process.cwd())
    case 'flagSettings':
      return resolve(process.cwd())
  }
}

/**
 * Get the user settings filename.
 * cowork 双文件名支裁剪（见头注）：恒 'settings.json'。
 */
function getUserSettingsFilePath(): string {
  return 'settings.json'
}

/**
 * 各源 settings 文件路径。flagSettings = 死源 → undefined（见头注）。
 */
export function getSettingsFilePathForSource(
  source: SettingSource,
): string | undefined {
  switch (source) {
    case 'userSettings':
      return join(getSettingsRootPathForSource(source), getUserSettingsFilePath())
    case 'projectSettings':
    case 'localSettings':
      return join(
        getSettingsRootPathForSource(source),
        getRelativeSettingsFilePathForSource(source),
      )
    case 'policySettings':
      return getManagedSettingsFilePath()
    case 'flagSettings':
      return undefined
  }
}

/**
 * 全源 settings 文件路径列表（旧仓 getSettingsPaths 逐字：SETTING_SOURCES.map
 * + 死源 flagSettings undefined 过滤）。permissions 域桩① 真实现（S-3c 消费
 * 点接线，经 L3 注入窗口 permissions/settingsPaths.ts 供 compose.ts 装配）。
 */
export function getSettingsPaths(): string[] {
  return SETTING_SOURCES.map(getSettingsFilePathForSource).filter(
    (path): path is string => path !== undefined,
  )
}

export function getRelativeSettingsFilePathForSource(
  source: 'projectSettings' | 'localSettings',
): string {
  switch (source) {
    case 'projectSettings':
      return join(getConfigDirName(), 'settings.json')
    case 'localSettings':
      return join(getConfigDirName(), 'settings.local.json')
  }
}

export function getSettingsForSource(
  source: SettingSource,
): SettingsJson | null {
  const cached = getCachedSettingsForSource(source)
  if (cached !== undefined) return cached
  const result = getSettingsForSourceUncached(source)
  setCachedSettingsForSource(source, result)
  return result
}

function getSettingsForSourceUncached(
  source: SettingSource,
): SettingsJson | null {
  // For policySettings: single file branch (managed-settings.json + drop-in).
  // 旧仓 first-source-wins 四链（remote > MDM > file > HKCU）裁剪，见头注。
  if (source === 'policySettings') {
    return loadManagedFileSettings().settings
  }

  const settingsFilePath = getSettingsFilePathForSource(source)
  const { settings: fileSettings } = settingsFilePath
    ? parseSettingsFile(settingsFilePath)
    : { settings: null }

  // flagSettings inline settings（旧仓 SDK getFlagSettingsInline）裁剪：
  // 新仓无 SDK inline 配置面，死源恒返回文件结果（undefined → null）。
  return fileSettings
}

/**
 * Get the origin of the active policy settings source.
 * 旧仓五值 'remote'|'plist'|'hklm'|'file'|'hkcu' 裁为 'file' | null
 * （单文件支，见头注残留守）。
 */
export function getPolicySettingsOrigin(): 'file' | null {
  const { settings } = loadManagedFileSettings()
  return settings ? 'file' : null
}

/**
 * 任一 trusted 源（user/local/flag/policy）接受过 dangerous 模式确认弹窗
 * （E-4 S-4c1 接缝⑥，§8.34 裁定 ⑨；旧仓 settings.ts:880 逐字）。
 *
 * projectSettings 刻意排除（旧仓 RCE 注释逐字）：恶意项目可借仓库内
 * settings 自授 dangerous 模式确认，绕过弹窗。
 *
 * 类型契约：skipDangerousModePermissionPrompt 未入 SettingsSchema
 * （passthrough 透传不丢数据）→ Record 断言读（值 = boolean | undefined）。
 *
 * H6 预声明消费接缝：消费面 = bypass 模式确认 UI（残留守 UI 面，本版无
 * 消费点——登记防「以为已全」亦防误删）。
 */
export function hasSkipDangerousModePermissionPrompt(): boolean {
  const read = (source: SettingSource): unknown =>
    (getSettingsForSource(source) ?? {}) as Record<string, unknown>
  return !!(
    read('userSettings')['skipDangerousModePermissionPrompt'] ||
    read('localSettings')['skipDangerousModePermissionPrompt'] ||
    read('flagSettings')['skipDangerousModePermissionPrompt'] ||
    read('policySettings')['skipDangerousModePermissionPrompt']
  )
}

/**
 * Merges `settings` into the existing settings for `source`（写回面）。
 *
 * 删键语义：record 字段删键设 `undefined`（**不要** `delete`）——mergeWith
 * 仅在 key 显式存在且值 undefined 时检测删除（customizer 先于 undefined
 * 判定执行，merge.ts 头注）。数组 = 整替（责任在调用方算出最终态）。
 */
export function updateSettingsForSource(
  source: EditableSettingSource,
  settings: SettingsJson,
): { error: Error | null } {
  if (
    (source as unknown) === 'policySettings' ||
    (source as unknown) === 'flagSettings'
  ) {
    return { error: null }
  }

  // Create the folder if needed
  const filePath = getSettingsFilePathForSource(source)
  if (!filePath) {
    return { error: null }
  }

  try {
    const fs = getFsImplementation()
    fs.mkdirSync(dirname(filePath))

    // Try to get existing settings with validation. Bypass the per-source
    // cache — mergeWith below mutates its target (including nested refs),
    // and mutating the cached object would leak unpersisted state if the
    // write fails before resetSettingsCache().
    let existingSettings = getSettingsForSourceUncached(source)

    // If validation failed, check if file exists with a JSON syntax error
    if (!existingSettings) {
      let content: string | null = null
      try {
        content = fs.readFileSync(filePath, { encoding: 'utf-8' })
      } catch (e) {
        if (!isENOENT(e)) {
          throw e
        }
        // File doesn't exist — fall through to merge with empty settings
      }
      if (content !== null) {
        const rawData = parseJson(content)
        if (rawData === null) {
          // JSON syntax error - return validation error instead of overwriting
          return {
            error: new Error(
              `Invalid JSON syntax in settings file at ${filePath}`,
            ),
          }
        }
        if (rawData && typeof rawData === 'object') {
          existingSettings = rawData as SettingsJson
          logForDebugging(
            `Using raw settings from ${filePath} due to validation failure`,
          )
        }
      }
    }

    const updatedSettings = mergeWith(
      existingSettings || {},
      settings,
      (
        _objValue: unknown,
        srcValue: unknown,
        key: string,
        object: Record<string, unknown>,
      ) => {
        // Handle undefined as deletion
        if (srcValue === undefined && typeof key === 'string') {
          delete object[key]
          return undefined
        }
        // For arrays, always replace with the provided array
        // This puts the responsibility on the caller to compute the desired
        // final state
        if (Array.isArray(srcValue)) {
          return srcValue
        }
        // For non-arrays, let default merge handle the behavior
        return undefined
      },
    )

    fs.writeFileSync(
      filePath,
      JSON.stringify(updatedSettings, null, 2) + '\n',
    )

    // Invalidate the session cache since settings have been updated
    resetSettingsCache()
    // localSettings gitignore 联动（旧仓 addFileGlobRuleToGitignore）裁剪：
    // 新仓无 git 域（残留守，见头注）。
  } catch (e) {
    const error = new Error(
      `Failed to read raw settings from ${filePath}: ${e}`,
    )
    logForDebugging(error.message)
    return { error }
  }

  return { error: null }
}

/**
 * Load settings from disk without using cache（级联真核心）。
 *
 * 合并序（低→高）：pluginSettingsBase（最低，S-3a 预声明接缝）→ 启用源
 * 级联（userSettings → policySettings → flagSettings，S-3a 裁定）。
 * project/local 不在级联（按源直读/写回面消费，见头注）。
 */
function loadSettingsFromDisk(): SettingsWithErrors {
  // Start with plugin settings as the lowest priority base.
  // All file-based sources override these.
  const pluginSettings = getPluginSettingsBase()
  let mergedSettings: SettingsJson = {}
  if (pluginSettings) {
    mergedSettings = mergeWith(
      mergedSettings,
      pluginSettings,
      settingsMergeCustomizer,
    )
  }
  const allErrors: ValidationError[] = []
  const seenErrors = new Set<string>()
  const seenFiles = new Set<string>()

  // Merge settings from each source in priority order with deep merging
  for (const source of getEnabledSettingSources()) {
    // policySettings: 单文件支（见头注语义裁定）
    if (source === 'policySettings') {
      const { settings, errors } = loadManagedFileSettings()
      if (settings) {
        mergedSettings = mergeWith(
          mergedSettings,
          settings,
          settingsMergeCustomizer,
        )
      }
      for (const error of errors) {
        const errorKey = `${error.file}:${error.path}:${error.message}`
        if (!seenErrors.has(errorKey)) {
          seenErrors.add(errorKey)
          allErrors.push(error)
        }
      }
      continue
    }

    const filePath = getSettingsFilePathForSource(source)
    if (filePath) {
      const resolvedPath = resolve(filePath)

      // Skip if we've already loaded this file from another source
      if (!seenFiles.has(resolvedPath)) {
        seenFiles.add(resolvedPath)

        const { settings, errors } = parseSettingsFile(filePath)

        // Add unique errors (deduplication)
        for (const error of errors) {
          const errorKey = `${error.file}:${error.path}:${error.message}`
          if (!seenErrors.has(errorKey)) {
            seenErrors.add(errorKey)
            allErrors.push(error)
          }
        }

        if (settings) {
          mergedSettings = mergeWith(
            mergedSettings,
            settings,
            settingsMergeCustomizer,
          )
        }
      }
    }
    // flagSettings = 死源（路径 undefined 短路；SDK inline 面裁剪，见头注）
  }

  return { settings: mergedSettings, errors: allErrors }
}

/**
 * Get merged settings from all sources in priority order.
 * Uses session-level caching; cache invalidated via resetSettingsCache().
 * @returns Merged settings (always returns at least empty object)
 */
export function getInitialSettings(): SettingsJson {
  const { settings } = getSettingsWithErrors()
  return settings || {}
}

/**
 * Get merged settings and validation errors from all sources.
 * Session-level caching — settings changes require restart, cache valid
 * for entire session; resetSettingsCache() on write-back.
 * @returns Merged settings and all validation errors encountered
 */
export function getSettingsWithErrors(): SettingsWithErrors {
  // Use cached result if available
  const cached = getSessionSettingsCache()
  if (cached !== null) {
    return cached
  }

  // Load from disk and cache the result
  const result = loadSettingsFromDisk()
  setSessionSettingsCache(result)
  return result
}

/**
 * Returns the merged autoMode config from trusted settings sources.
 * Only available when TRANSCRIPT_CLASSIFIER is active; returns undefined
 * otherwise.
 * projectSettings is intentionally excluded — a malicious project could
 * otherwise inject classifier allow/deny rules (RCE risk).（旧仓注释逐字）
 *
 * S-C4 commit 5（CLI 波）随迁：旧仓 utils/settings/settings.ts getAutoModeConfig
 * 逐字（4 源循环 userSettings/localSettings/flagSettings/policySettings；
 * flagSettings 新仓死源短路同义；deny 键解析支保留 = de-ANT 注释逐字，
 * 值不消费）。消费点 = cli/handlers/autoMode.ts。
 */
export function getAutoModeConfig():
  | { allow?: string[]; soft_deny?: string[]; environment?: string[] }
  | undefined {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const schema = z.object({
      allow: z.array(z.string()).optional(),
      soft_deny: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      environment: z.array(z.string()).optional(),
    })

    const allow: string[] = []
    const soft_deny: string[] = []
    const environment: string[] = []

    for (const source of [
      'userSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ] as const) {
      const settings = getSettingsForSource(source)
      if (!settings) continue
      const result = schema.safeParse(
        (settings as Record<string, unknown>).autoMode,
      )
      if (result.success) {
        if (result.data.allow) allow.push(...result.data.allow)
        if (result.data.soft_deny) soft_deny.push(...result.data.soft_deny)
        // de-ANT: the ant-only "deny → soft_deny" permission hardening was
        // removed.
        if (result.data.environment) {
          environment.push(...result.data.environment)
        }
      }
    }

    if (allow.length > 0 || soft_deny.length > 0 || environment.length > 0) {
      return {
        ...(allow.length > 0 && { allow }),
        ...(soft_deny.length > 0 && { soft_deny }),
        ...(environment.length > 0 && { environment }),
      }
    }
  }
  return undefined
}
