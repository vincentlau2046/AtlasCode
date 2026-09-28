/**
 * engine/skill — 技能域子门面（§8.67 D 波 S-E2a；STR-1 显式命名
 * re-export，零 `export *`）。
 *
 * 域内文件归属：
 *   - types.ts              命令/技能类型面（Command 判别单形 + 上下文 duck）
 *   - constants.ts          命令消息 XML tag 常量 + 空内容哨兵
 *   - frontmatterFields.ts  frontmatter 字段解析族（布尔/描述/shell/paths）
 *   - argumentSubstitution.ts  $ARGUMENTS 参数解析/替换族
 *   - skillModel.ts         model 解析族（role 别名身份映射）
 *   - skillCommand.ts       技能命令工厂 + frontmatter 全字段解析
 *   - markdownLoader.ts     markdown 配置目录装载器（三源优先级 + dev:ino 去重）
 *   - loadSkillsDir.ts      /skills/ + legacy /commands/ 装载 + 动态发现 +
 *                           条件技能激活
 *   - bundledSkills.ts      内置技能注册 + 引用文件提取
 *   - commands.ts           命令池装配 + 可用性门 + 模型可调用视图
 *   - forkedAgent.ts        forked 技能执行准备核层
 *   - processPromptSlashCommand.ts  prompt 型 slash 命令处理核层
 *   - promptShellExecution.ts 技能提示词内嵌 shell 执行
 *   - patternMatch.ts       gitignore 风格最小 matcher（`ignore` 库裁面）
 *   - usageTracking.ts      技能使用频次追踪（内存态）
 *   - gitignore.ts          git 忽略判定面（动态发现守卫）
 *   - pluginIdentifier.ts   插件标识解析 + 官方市场名族
 *   - errors.ts             MalformedCommandError
 *   - memoize.ts            本地最小 memoize（lodash 裁面）
 *
 * 裁面登记（复审勿当遗漏重提）：plugin 池族 / workflow 命令族 /
 * REMOTE_SAFE·BRIDGE_SAFE 安全过滤族 / MCP skill 注册窗 /
 * registerMCPSkillBuilders / skill hooks 注册 / invoked-skill 态 ——
 * 各前向接缝归属见 commands.ts / loadSkillsDir.ts /
 * processPromptSlashCommand.ts 头注。
 */

// --- 类型面 ---
export type {
  Command,
  CommandAvailability,
  CommandBase,
  LoadedFrom,
  PromptCommand,
  SkillCommandContext,
} from './types'
export { getCommandName, isCommandEnabled } from './types'

// --- 常量面 ---
export {
  COMMAND_ARGS_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  NO_CONTENT_MESSAGE,
} from './constants'

// --- frontmatter 解析族 ---
export type { FrontmatterShell } from './frontmatterFields'
export {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseShellFrontmatter,
  splitPathInFrontmatter,
} from './frontmatterFields'

// --- 参数解析/替换族 ---
export {
  generateProgressiveArgumentHint,
  parseArgumentNames,
  parseArguments,
  substituteArguments,
} from './argumentSubstitution'

// --- model 解析族 ---
export { parseUserSpecifiedModel, resolveSkillModelOverride } from './skillModel'

// --- 技能命令工厂 ---
export {
  createSkillCommand,
  estimateSkillFrontmatterTokens,
  getSkillsPath,
  parseSkillFrontmatterFields,
  parseSkillPaths,
} from './skillCommand'

// --- markdown 装载器 ---
export type { ConfigSubDir, MarkdownFile } from './markdownLoader'
export {
  CONFIG_SUBDIRS,
  extractDescriptionFromMarkdown,
  getProjectDirsUpToHome,
  loadMarkdownFilesForSubdir,
  parseAgentToolsFromFrontmatter,
  parseSlashCommandToolsFromFrontmatter,
} from './markdownLoader'

// --- 技能目录装载 + 动态发现 + 条件技能 ---
export {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  clearDynamicSkills,
  clearSkillCaches,
  discoverSkillDirsForPaths,
  getConditionalSkillCount,
  getDynamicSkills,
  getSkillDirCommands,
  onDynamicSkillsLoaded,
} from './loadSkillsDir'

// --- 内置技能 ---
export type { BundledSkillDefinition } from './bundledSkills'
export {
  clearBundledSkills,
  getBundledSkillExtractDir,
  getBundledSkills,
  getBundledSkillsRoot,
  registerBundledSkill,
} from './bundledSkills'

// --- 命令池装配 + 模型可调用视图 ---
export {
  builtInCommandNames,
  clearCommandsCache,
  clearCommandMemoizationCaches,
  findCommand,
  formatDescriptionWithSource,
  getCommand,
  getCommands,
  getMcpSkillCommands,
  getSkillToolCommands,
  getSlashCommandToolSkills,
  hasCommand,
  meetsAvailabilityRequirement,
  // S-E2d（§8.68 remote 波）：MCP skill 注册窗（⑥ 核销；组合根 ⑭ 供给面）
  resetMcpSkillCommandSource,
  setMcpSkillCommandSource,
} from './commands'
export type { McpSkillCommandSource } from './commands'

// --- forked 执行准备核层 ---
export type { PreparedForkedContext } from './forkedAgent'
export {
  createGetAppStateWithAllowedTools,
  extractResultText,
  prepareForkedCommandContext,
} from './forkedAgent'

// --- prompt 型 slash 命令处理核层 ---
export type { SlashCommandResult } from './processPromptSlashCommand'
export {
  formatCommandLoadingMetadata,
  formatSkillLoadingMetadata,
  processPromptSlashCommand,
} from './processPromptSlashCommand'

// --- 提示词内嵌 shell 执行 ---
export { executeShellCommandsInPrompt } from './promptShellExecution'

// --- gitignore 风格 matcher + git 忽略判定 ---
export { gitignoreMatch } from './patternMatch'
export { getGlobalGitignorePath, isPathGitignored } from './gitignore'

// --- 技能使用频次追踪 ---
export {
  clearSkillUsageState,
  getSkillUsageScore,
  recordSkillUsage,
} from './usageTracking'

// --- 插件标识解析 ---
export type { ParsedPluginIdentifier } from './pluginIdentifier'
export {
  ALLOWED_OFFICIAL_MARKETPLACE_NAMES,
  buildPluginId,
  isOfficialMarketplaceName,
  parsePluginIdentifier,
} from './pluginIdentifier'

// --- 错误面 ---
export { MalformedCommandError } from './errors'

// --- memoize（域内消费面，子门面自持供 clear* 缓存族） ---
export { memoize } from './memoize'
