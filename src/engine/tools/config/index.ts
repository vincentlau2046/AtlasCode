/**
 * engine/tools/config 子门面（S-E2 §8.60 config+ask-user 族子波，STR-1 显式名块纪律）。
 *
 * 覆盖 1 本体对象（ConfigTool）+ JSON schema 1 常量（CONFIG_TOOL_INPUT_SCHEMA）
 * + 注册表 1 面（SUPPORTED_SETTINGS + 5 查询函数）+ prompt 面 2（DESCRIPTION /
 * generatePrompt）+ 型面 3（ConfigToolInput / ConfigOutput / SettingConfig）。
 *
 * 纪律（tools/index.ts plan 块先例）：逐名显式 re-export，无 `export *`；
 * 各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 重名登记：无（DESCRIPTION 若与 files 块 seed 的 readPrompt DESCRIPTION
 * 冲突，tools 门面侧别名重出 = 重名登记先例，本门面不预占）。
 *
 * 消费方：tools/ 门面 S-E2 re-export 块 + 组合根 baseTools 注入位
 * （CLI 波前向接缝，同 plan/web 族；config 族无专属门控槽 = 无条件注册面，
 * 49 口径 22/49 → 23/49（+Config 1 槽），§8.60.1.4）。
 */
export {
  ConfigTool,
  CONFIG_TOOL_INPUT_SCHEMA,
  type ConfigOutput,
  type ConfigToolInput,
} from './configTool'
export { DESCRIPTION, generatePrompt } from './configPrompt'
export {
  getAllKeys,
  getConfig,
  getOptionsForSetting,
  getPath,
  isSupported,
  SUPPORTED_SETTINGS,
  type SettingConfig,
} from './supportedSettings'
