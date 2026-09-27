/**
 * engine/tools/config — ConfigTool 设置注册表（S-E2 §8.60 config+ask-user 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ConfigTool/supportedSettings.ts 180L 裁剪随迁。
 * 旧注册表 18 键（global 11 + settings 7，含 2 个 feature 门控键：voiceEnabled
 * （VOICE_MODE 门，source 'settings'）/ remoteControlAtStartup（BRIDGE_MODE 门，
 * source 'global'））；新仓仅留 3 条目（存活判据 = 新 SettingsJson 声明 ∩ 新仓活消费点，
 * §8.60.1.2 裁定，复审勿当遗漏重提）：
 *   - autoMemoryEnabled：src/memory/config.ts isAutoMemoryEnabled 优先级链消费
 *   - model：modelprovider roles 面（角色池）消费；formatOnRead null→'default' 逐字
 *   - 'permissions.defaultMode'：permissionSetup 消费 + 'auto' 降级裁定（2026-09-19 逐字）
 *
 * delta 登记（H6 逐条）：
 *  ① global 段 11 键（theme/editorMode/verbose/preferredNotifChannel/autoCompactEnabled/
 *    fileCheckpointingEnabled/showTurnDuration/terminalProgressBarEnabled/todoFeatureEnabled/
 *    teammateMode/remoteControlAtStartup）裁：新仓 globalConfig 面（getGlobalConfig/
 *    saveGlobalConfig + 配置文件 + freshness watcher，旧 utils/config.ts）未落，且 11 键
 *    全为 TUI/CLI 态 → 残留守，归属波 = C 桶 ③ shell·swarm 波（TUI 面族）。机制面
 *    （source 联合 + write/getValue 的 global 分支）保留型对称，运行时不可达（注册表
 *    无 global 条目 = 空心分支登记，非假装通过的能力）。
 *  ② settings 段 7 键：3 留（autoMemoryEnabled / model / 'permissions.defaultMode'，
 *    即新仓仅留 3 条目）4 裁：autoDreamEnabled（types.ts 砍字段族）/ language
 *    （UI/行为族裁，TUI 波）/ alwaysThinkingEnabled（types.ts 声明但无活消费点，
 *    thinking 控制 = effort B 方案）/ voiceEnabled（旧 feature('VOICE_MODE') 门，新仓
 *    feature() 恒 false + voice 面未落）→ 残留守（各键归属面见 types.ts 砍字段族头注）。
 *  ③ 'permissions.defaultMode' options = 5 值集：旧仓 feature('TRANSCRIPT_CLASSIFIER')
 *    5/4 分拆在新仓恒 false → 旧有效集 = 4，但新 permissionSetup:176-183 逐字裁定显式
 *    消费 'auto'（全局持久值 → session 降级 'default'）→ 恢复 5 值集（裁定依据 = 新仓
 *    既有消费面，非旧仓 feature-off 面逐字）。
 *  ④ model getOptions：旧 getModelOptions（角色池 + ATLAS_CUSTOM_MODEL_OPTION env +
 *    bootstrap cache + current/initial model 追加）裁（新 modelprovider 无 bootstrap
 *    cache 消费面）→ 新面 = settings.availableModels（types.ts 声明字段）→ 缺省回落
 *    角色池默认 ['small','premium','fast']（旧 catch 支逐字）。
 *  ⑤ model validateOnWrite 旧 validateModel（sideQuery 真 API 探活 max_tokens 1 +
 *    modelAllowlist + MODEL_ALIASES）裁：三面无一在新仓，模型活面 = modelprovider
 *    healthCheck 域 → 残留守；SettingConfig.validateOnWrite 字段随唯一消费面同裁
 *    （未来注册表补 validateOnWrite 条目须复活写侧分支，D 波前向接缝）。
 *  ⑥ appStateKey 同步（旧 'verbose'|'mainLoopModel'|'thinkingEnabled' →
 *    context.setAppState）裁：新 Tool 面 / ToolUseContext 无 setAppState（grep 0 命中）
 *    → 残留守。
 */
import { getInitialSettings } from '../../config'

/**
 * 设置注册表条目（旧 SettingConfig 裁剪：path/options/getOptions/formatOnRead 留
 * 活消费面；appStateKey ⑥ / validateOnWrite ⑤ 裁）。
 */
export type SettingConfig = {
  source: 'global' | 'settings'
  type: 'boolean' | 'string'
  description: string
  path?: string[]
  options?: readonly string[]
  getOptions?: () => string[]
  /** Format value when reading/getting for display */
  formatOnRead?: (v: unknown) => unknown
}

/**
 * model getOptions 新面（delta ④）：settings.availableModels（types.ts 声明字段）
 * → 缺省回落角色池默认（旧 catch 支逐字）。
 */
function getModelOptions(): string[] {
  const available = getInitialSettings().availableModels
  if (Array.isArray(available)) {
    const values = available.filter((m): m is string => typeof m === 'string')
    if (values.length > 0) return values
  }
  return ['small', 'premium', 'fast']
}

export const SUPPORTED_SETTINGS: Record<string, SettingConfig> = {
  autoMemoryEnabled: {
    source: 'settings',
    type: 'boolean',
    description: 'Enable auto-memory',
  },
  model: {
    source: 'settings',
    type: 'string',
    description: 'Override the default model',
    getOptions: () => getModelOptions(),
    formatOnRead: v => (v === null ? 'default' : v),
  },
  'permissions.defaultMode': {
    source: 'settings',
    type: 'string',
    description: 'Default permission mode for tool usage',
    // delta ③：5 值集（'auto' 恢复，新仓 permissionSetup 消费面裁定）
    options: ['default', 'plan', 'acceptEdits', 'dontAsk', 'auto'],
  },
}

export function isSupported(key: string): boolean {
  return key in SUPPORTED_SETTINGS
}

export function getConfig(key: string): SettingConfig | undefined {
  return SUPPORTED_SETTINGS[key]
}

export function getAllKeys(): string[] {
  return Object.keys(SUPPORTED_SETTINGS)
}

export function getOptionsForSetting(key: string): string[] | undefined {
  const config = SUPPORTED_SETTINGS[key]
  if (!config) return undefined
  if (config.options) return [...config.options]
  if (config.getOptions) return config.getOptions()
  return undefined
}

export function getPath(key: string): string[] {
  const config = SUPPORTED_SETTINGS[key]
  return config?.path ?? key.split('.')
}
