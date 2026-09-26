/**
 * engine/tools/bash 门面（§8.53 S-T1，工具本体波 C 桶 ① Bash 纵切 · checkPermissions 面）。
 *
 * bash 内核 8 文件（旧仓 src/utils/bash/ 闭包子集，逐字随迁）+ 4 本地小模块
 * （prefixStatic / memoize / json / log，delta 见各文件头注）。显式名块（STR-1
 * 先例；全引擎面 0 重名核验——CommandPrefixResult/CommandSubcommandPrefixResult
 * 两型经 commands 转出（单出口），prefixStatic 名块不重列）。
 *
 * S-T2a（§8.53）已落 checkPermissions 面 4 文件（旧仓 src/tools/BashTool/
 * bashSecurity / sedValidation / modeValidation / bashCommandHelpers 逐字随迁
 * + bashToolInput duck 型，delta 见各文件头注）→ 本门面扩块。
 *
 * S-T2b（§8.53）已落核心 3 文件（bashPermissions 2471L / pathValidation
 * 1303L / shouldUseSandbox 124L 逐字随迁）+ 6 本地辅助模块（bashReadOnly /
 * abortError / platform / arrayUtils / windowsPaths / pathHelpers，delta 见
 * 各文件头注）→ 本门面再扩块。
 *
 * S-B 子波（§8.54，Bash 本体纵切）S-B1~S-B5 随迁 9 文件 + 依赖闭包层——
 * 各切片文件头注 delta 自登记，本门面按切片扩块归集（门面归集统一在
 * S-B5 落，S-B1~S-B4 切片不预支扩块）。
 *
 * 门面裁量（复审勿当遗漏重提）：
 *  - stripWrappersFromArgv 只经 pathValidation 块转出（canonical 扩展版，
 *    PR #21503 round 3；bashPermissions 同名的窄版拷贝 = 旧仓登记死代码
 *    〔DCE cliff 不可删〕，门面不转出）
 *  - 残留守（D 波/TUI 波）：真 ToolUseContext 全字段面（BashToolUseContext
 *    duck 最小形 + D-7 options.cwd 成员）/ UI 渲染面（UI.tsx /
 *    BashToolResultMessage.tsx 域外，renderToolUseMessage = () => null）/
 *    归属后缀支（D-1）/ 图像 resize 调用点（D-3）。
 *  - 旧「inputSchema 真 zod 型」接缝改题：新 shared Tool 契约无 zod，
 *    BASH_TOOL_INPUT_SCHEMA = 纯 JSON schema 对象（bashTool.ts，S-B5），
 *    与 bashToolInput.ts duck 型逐字段对齐（类型位单一事实源）。
 */
export {
  type TsNode,
  ensureParserInitialized,
  getParserModule,
  SHELL_KEYWORDS,
} from './bashParser'
export {
  type Node,
  type ParsedCommandData,
  ensureInitialized,
  parseCommand,
  PARSE_ABORTED,
  parseCommandRaw,
  extractCommandArguments,
} from './parser'
export {
  type Redirect,
  type SimpleCommand,
  type ParseForSecurityResult,
  nodeTypeId,
  parseForSecurity,
  parseForSecurityFromAst,
  type SemanticCheckResult,
  checkSemantics,
} from './ast'
export {
  type CommandPrefixResult,
  type CommandSubcommandPrefixResult,
  splitCommandWithOperators,
  filterControlOperators,
  splitCommand_DEPRECATED,
  isHelpCommand,
  getCommandSubcommandPrefix,
  clearCommandPrefixCaches,
  isUnsafeCompoundCommand_DEPRECATED,
  extractOutputRedirections,
} from './commands'
export {
  type HeredocInfo,
  type HeredocExtractionResult,
  extractHeredocs,
  restoreHeredocs,
  containsHeredoc,
} from './heredoc'
export {
  type QuoteContext,
  type CompoundStructure,
  type DangerousPatterns,
  type TreeSitterAnalysis,
  extractQuoteContext,
  extractCompoundStructure,
  hasActualOperatorNodes,
  extractDangerousPatterns,
  analyzeCommand,
} from './treeSitterAnalysis'
export {
  type OutputRedirection,
  type IParsedCommand,
  RegexParsedCommand_DEPRECATED,
  buildParsedCommandFromRoot,
  ParsedCommand,
} from './ParsedCommand'
export {
  type ShellParseResult,
  type ShellQuoteResult,
  tryParseShellCommand,
  tryQuoteShellArgs,
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  quote,
} from './shellQuote'
export {
  type PrefixExtractorConfig,
  type CommandPrefixExtractor,
  type SubcommandPrefixExtractor,
  createCommandPrefixExtractor,
  createSubcommandPrefixExtractor,
} from './prefixStatic'
// ── S-T2a（§8.53）：checkPermissions 面 4 文件 + duck 型 ──
export {
  stripSafeHeredocSubstitutions,
  hasSafeHeredocSubstitution,
  bashCommandIsSafe_DEPRECATED,
  bashCommandIsSafeAsync_DEPRECATED,
} from './bashSecurity'
export {
  isLinePrintingCommand,
  isPrintCommand,
  sedCommandIsAllowedByAllowlist,
  hasFileArgs,
  extractSedExpressions,
  checkSedConstraints,
} from './sedValidation'
export { checkPermissionMode, getAutoAllowedCommands } from './modeValidation'
export {
  type CommandIdentityCheckers,
  checkCommandOperatorPermissions,
} from './bashCommandHelpers'
export { type BashToolInput, type BashToolUseContext } from './bashToolInput'
// ── S-T2b（§8.53）：核心 3 文件 + 6 本地辅助模块 ──
export {
  MAX_SUBCOMMANDS_FOR_SECURITY_CHECK,
  MAX_SUGGESTED_RULES_FOR_COMPOUND,
  BINARY_HIJACK_VARS,
  bashPermissionRule,
  bashToolCheckExactMatchPermission,
  bashToolCheckPermission,
  bashToolHasPermission,
  checkCommandAndSuggestRules,
  commandHasAnyCd,
  clearSpeculativeChecks,
  consumeSpeculativeClassifierCheck,
  awaitClassifierAutoApproval,
  executeAsyncClassifierCheck,
  getFirstWordPrefix,
  getSimpleCommandPrefix,
  isNormalizedCdCommand,
  isNormalizedGitCommand,
  matchWildcardPattern,
  peekSpeculativeClassifierCheck,
  startSpeculativeClassifierCheck,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
} from './bashPermissions'
export {
  type PathCommand,
  PATH_EXTRACTORS,
  COMMAND_OPERATION_TYPE,
  createPathChecker,
  checkPathConstraints,
  stripWrappersFromArgv,
} from './pathValidation'
export { shouldUseSandbox } from './shouldUseSandbox'
export { isReadOnlyCommand } from './bashReadOnly'
export { AbortError } from './abortError'
export { type Platform, getPlatform } from './platform'
export { count } from './arrayUtils'
export { windowsPathToPosixPath } from './windowsPaths'
export { getDirectoryForPath } from './pathHelpers'
// ── S-B1（§8.54）：依赖闭包层 ──
export {
  type FlagArgType,
  type ExternalCommandConfig,
  GIT_READ_ONLY_COMMANDS,
  GH_READ_ONLY_COMMANDS,
  DOCKER_READ_ONLY_COMMANDS,
  RIPGREP_READ_ONLY_COMMANDS,
  PYRIGHT_READ_ONLY_COMMANDS,
  EXTERNAL_READONLY_COMMANDS,
  containsVulnerableUncPath,
  FLAG_PATTERN,
  validateFlagArgument,
  validateFlags,
} from './readOnlyCommandValidation'
export { isCurrentDirectoryBareGitRepo } from './gitBareRepo'
export { getDefaultBashTimeoutMs, getMaxBashTimeoutMs } from './bashTimeouts'
export {
  hasEmbeddedSearchTools,
  shouldMaintainProjectWorkingDir,
  shouldIncludeGitInstructions,
  prependBullets,
} from './bashHelpers'
// ── S-B2（§8.54）：纯叶子本体 ──
export { extractBashCommentLabel } from './commentLabel'
export { getDestructiveCommandWarning } from './destructiveCommandWarning'
export { type CommandSemantic, interpretCommandResult } from './commandSemantics'
export {
  type SedEditInfo,
  isSedInPlaceEdit,
  parseSedEditCommand,
  applySedSubstitution,
} from './sedEditParser'
export {
  stripEmptyLines,
  isImageOutput,
  parseDataUri,
  buildImageToolResult,
  resizeShellImageOutput,
  formatOutput,
  stdErrAppendShellResetMessage,
  resetCwdIfOutsideProject,
  createContentSummary,
} from './bashUtils'
// ── S-B3（§8.54）：只读命令校验本体 ──
export {
  isCommandSafeViaFlagParsing,
  checkReadOnlyConstraints,
} from './readOnlyValidation'
// ── S-B4（§8.54）：prompt 本体 ──
export {
  getDefaultTimeoutMs,
  getMaxTimeoutMs,
  getSimplePrompt,
} from './bashPrompt'
// ── S-B5（§8.54）：BashTool 本体（首个非-passthrough checkPermissions 面）──
export {
  BASH_TOOL_INPUT_SCHEMA,
  BashTool,
  getBackgroundTask,
  listBackgroundTasks,
  type Out,
  type BgTask,
} from './bashTool'
