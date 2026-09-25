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
 * 门面裁量（复审勿当遗漏重提）：
 *  - stripWrappersFromArgv 只经 pathValidation 块转出（canonical 扩展版，
 *    PR #21503 round 3；bashPermissions 同名的窄版拷贝 = 旧仓登记死代码
 *    〔DCE cliff 不可删〕，门面不转出）
 *  - 残留守（Bash 本体子波）：BashTool 3310L 本体 / inputSchema 真 zod 型 /
 *    真 ToolUseContext / prompt.ts / BashTool 值位（本波 BASH_RULE_TOOL 窄
 *    视图占位）。
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
