/**
 * engine/tools/config — ConfigTool 本体（S-E2 §8.60 config+ask-user 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ConfigTool/ConfigTool.ts 456L 裁剪随迁（tool 对象
 * 旧 buildTool 成员面 → 新 shared Tool 契约对象化，readTool/web face 先例）：
 * inputSchema 纯 JSON 化（旧 z.strictObject 双参面）/ checkPermissions 逐字
 * （GET 自动放行 + SET ask 文案）/ call GET（getInitialSettings path walk +
 * formatOnRead）/ SET（boolean coercion + options 校验 + updateSettingsForSource
 * 'userSettings' 写回）/ mapToolResult 逐字（get/set/error 三支）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema + zod outputSchema z.infer) → 新 shared Tool
 *    契约：inputSchema = 纯 JSON schema 对象（CONFIG_TOOL_INPUT_SCHEMA，旧
 *    z.strictObject 面 → strict: true + additionalProperties false 双字段，
 *    readTool delta ① 先例）；output → TS 型 ConfigOutput 承载（delta ① web 族
 *    webToolInput 先例）。
 *  ② 新契约 description 面 = 旧 prompt() 体（generatePrompt 注册表驱动，
 *    configPrompt.ts delta ①-③）；旧短 description() 体（DESCRIPTION 常量）
 *    不并入本体（本体 description() 唯一 prompt 面 = generatePrompt，web 族
 *    口径：webFetchTool/webSearchTool 本体不 import DESCRIPTION，短描述面经
 *    config/ 子门面 + tools/ 门面 CONFIG_DESCRIPTION 别名 re-export）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（readTool delta ④ 先例）：
 *    isConcurrencySafe true / isReadOnly（value undefined 支逐字）/
 *    isDestructive false（缺省值）/ shouldDefer true / maxResultSizeChars
 *    100_000（旧面逐字）/ searchHint 值更新 'get or set Atlas settings (model)'
 *    （旧 'theme, model' 之 theme 键随注册表 global 段裁除，delta ① supportedSettings）
 *    / userFacingName 'Config' 逐字。
 *  ④ 旧 call 的 voice pre-flight 整支（feature('VOICE_MODE') + 录音可用性/
 *    依赖/麦克风权限 4 查 + settingsChangeDetector.notifyChange）裁：新仓
 *    feature() 恒 false + voice 域未落 → 残留守（TUI/voice 波）。
 *  ⑤ 旧 remoteControlAtStartup 'default' 特例支（saveGlobalConfig 删键 +
 *    getRemoteControlAtStartup + setAppState replBridgeEnabled）裁：随 global
 *    段整裁（delta ① supportedSettings，归属 C 桶 ③ shell·swarm 波）；
 *    AppState 同步面（config.appStateKey）同裁（delta ⑥ supportedSettings）→
 *    新 call 不消费 context（duck 位保留契约位，零成员）。
 *  ⑥ 旧 write 面 source==='global' → saveGlobalConfig 支：globalConfig 面未落
 *    （delta ① supportedSettings）→ 本支不可达（注册表无 global 条目），防御性
 *    错误返回登记（空心分支，非假装通过的能力）。
 *  ⑦ 旧 write 面 else 支 updateSettingsForSource('userSettings', buildNestedObject)
 *    逐字随迁：新签名 (source, settings: SettingsJson) → {error: Error|null}
 *    （settings.ts:393）与旧 result.error.message 消费兼容；buildNestedObject
 *    返回 Record<string,unknown> → SettingsJson cast 单点（zod any 兜底族字段
 *    结构兼容，自足登记）。
 *  ⑧ 旧 mapToolResult 三支逐字（get `setting = json` / set `Set ${setting} to
 *    ${json}` / error `Error: ${msg}` + is_error:true）；jsonStringify = 新仓
 *    engine/session/json 单一事实源（files 族先例）。
 *  ⑨ 旧 UI.tsx renderToolUseMessage 纯字符串逻辑逐字（!setting → null /
 *    GET `Getting ${setting}` / SET `Setting ${setting} to ${json}`）；JSX
 *    dimColor 面 → TUI 波（web 族 delta ⑤ 纯逻辑面随迁先例）。
 *
 * 消费方 = `config/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径无条件
 * 注册位（§8.60.1.4；config 族无专属门控槽）。
 */
import {
  errorMessage,
  logError,
  type PermissionResult,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { jsonStringify } from '../../session/json'
import {
  getInitialSettings,
  updateSettingsForSource,
  type SettingsJson,
} from '../../config'
import { CONFIG_TOOL_NAME } from '../toolNames'
import { generatePrompt } from './configPrompt'
import {
  getConfig,
  getOptionsForSetting,
  getPath,
  isSupported,
} from './supportedSettings'

/** 输入 duck 型（旧 zod Input 型转写）。 */
export type ConfigToolInput = {
  setting: string
  value?: string | boolean | number
}

/** 输出型（旧 zod outputSchema z.infer 转写，delta ①）。 */
export type ConfigOutput = {
  success: boolean
  operation?: 'get' | 'set'
  setting?: string
  value?: unknown
  previousValue?: unknown
  newValue?: unknown
  error?: string
}

/** 输入 JSON schema（旧 z.strictObject 逐字段转写，delta ①；value 联合三型 = 旧 z.union 面）。 */
export const CONFIG_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    setting: {
      type: 'string',
      // 示例键随注册表裁剪更新（旧示例 "theme" 随 global 段裁除，delta ③）
      description: 'The setting key (e.g., "model", "permissions.defaultMode")',
    },
    value: {
      type: ['string', 'boolean', 'number'],
      description: 'The new value. Omit to get current value.',
    },
  },
  required: ['setting'],
  additionalProperties: false,
}

// Tool 契约非参数化（readTool face 先例）；face 扩型 = checkPermissions
// 返回型收窄 Promise<PermissionResult<ConfigToolInput>>（web face 先例）。
type ConfigToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<ConfigToolInput>>
}

export const ConfigTool: ConfigToolFace = {
  name: CONFIG_TOOL_NAME,
  inputSchema: CONFIG_TOOL_INPUT_SCHEMA,
  inputJSONSchema: CONFIG_TOOL_INPUT_SCHEMA,
  searchHint: 'get or set Atlas settings (model)',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ①：旧 z.strictObject 面
  strict: true,
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: (input: unknown) =>
    (input as ConfigToolInput).value === undefined,
  isDestructive: () => false,
  userFacingName: () => 'Config',
  toAutoClassifierInput(input: unknown) {
    const { setting, value } = input as ConfigToolInput
    return value === undefined ? setting : `${setting} = ${value}`
  },
  async description() {
    // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体
    return generatePrompt()
  },
  // delta ⑨：旧 UI.tsx renderToolUseMessage 纯字符串逻辑逐字（JSX dimColor
  // 面 → TUI 波）：!setting → null / GET `Getting ${setting}` / SET
  // `Setting ${setting} to ${json}`
  renderToolUseMessage(
    input: unknown,
    _options: { theme: unknown; verbose: boolean; commands?: unknown[] },
  ) {
    const { setting, value } = input as Partial<ConfigToolInput>
    if (!setting) return null
    if (value === undefined) {
      return `Getting ${setting}`
    }
    return `Setting ${setting} to ${jsonStringify(value)}`
  },
  async checkPermissions(
    input: unknown,
    _context: unknown,
  ): Promise<PermissionResult<ConfigToolInput>> {
    // 逐字（旧 L94-102）：GET 自动放行
    const { setting, value } = input as ConfigToolInput
    if (value === undefined) {
      return { behavior: 'allow', updatedInput: input as ConfigToolInput }
    }
    return {
      behavior: 'ask',
      message: `Set ${setting} to ${jsonStringify(value)}`,
    }
  },
  // delta ⑤：新 call 不消费 context（appStateKey / remoteControl 特例支裁）
  async call(args: unknown, _context: unknown): Promise<ToolResult<ConfigOutput>> {
    const { setting, value } = args as ConfigToolInput

    // 1. Check if setting is supported
    if (!isSupported(setting)) {
      return { data: { success: false, error: `Unknown setting: "${setting}"` } }
    }

    const config = getConfig(setting)!
    const path = getPath(setting)

    // 2. GET operation
    if (value === undefined) {
      const currentValue = getValue(config.source, path)
      const displayValue = config.formatOnRead
        ? config.formatOnRead(currentValue)
        : currentValue
      return {
        data: { success: true, operation: 'get', setting, value: displayValue },
      }
    }

    // 3. SET operation
    let finalValue: unknown = value

    // Coerce and validate boolean values
    if (config.type === 'boolean') {
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim()
        if (lower === 'true') finalValue = true
        else if (lower === 'false') finalValue = false
      }
      if (typeof finalValue !== 'boolean') {
        return {
          data: {
            success: false,
            operation: 'set',
            setting,
            error: `${setting} requires true or false.`,
          },
        }
      }
    }

    // Check options
    const options = getOptionsForSetting(setting)
    if (options && !options.includes(String(finalValue))) {
      return {
        data: {
          success: false,
          operation: 'set',
          setting,
          error: `Invalid value "${value}". Options: ${options.join(', ')}`,
        },
      }
    }

    const previousValue = getValue(config.source, path)

    // 4. Write to storage
    try {
      if (config.source === 'global') {
        // delta ⑥：globalConfig 面未落（delta ① supportedSettings）→ 本支不可达
        // （注册表无 global 条目），防御性错误返回
        return {
          data: {
            success: false,
            operation: 'set',
            setting,
            error: 'Global settings are not available in this build.',
          },
        }
      }
      const update = buildNestedObject(path, finalValue)
      const result = updateSettingsForSource(
        'userSettings',
        // delta ⑦：Record → SettingsJson 单点 cast（any 兜底族字段结构兼容）
        update as SettingsJson,
      )
      if (result.error) {
        return {
          data: {
            success: false,
            operation: 'set',
            setting,
            error: result.error.message,
          },
        }
      }
      return {
        data: {
          success: true,
          operation: 'set',
          setting,
          previousValue,
          newValue: finalValue,
        },
      }
    } catch (error) {
      logError(error)
      return {
        data: {
          success: false,
          operation: 'set',
          setting,
          error: errorMessage(error),
        },
      }
    }
  },
  // delta ⑧：旧 mapToolResult 三支逐字
  mapToolResultToToolResultBlockParam(
    content: ConfigOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.success) {
      if (content.operation === 'get') {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result' as const,
          content: `${content.setting} = ${jsonStringify(content.value)}`,
        }
      }
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: `Set ${content.setting} to ${jsonStringify(content.newValue)}`,
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: `Error: ${content.error}`,
      is_error: true,
    }
  },
}

/**
 * 旧 getValue 逐字（settings 支 path walk）；global 支（getGlobalConfig）裁，
 * delta ① supportedSettings → 不可达返回 undefined（空心分支登记）。
 */
function getValue(source: 'global' | 'settings', path: string[]): unknown {
  if (source === 'global') {
    return undefined
  }
  const settings = getInitialSettings()
  let current: unknown = settings
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

function buildNestedObject(
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    return {}
  }
  const key = path[0]!
  if (path.length === 1) {
    return { [key]: value }
  }
  return { [key]: buildNestedObject(path.slice(1), value) }
}
