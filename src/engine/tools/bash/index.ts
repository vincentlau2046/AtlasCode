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
 * 残留守（S-T2b 随迁，本门面再扩块）：bashPermissions / pathValidation /
 * shouldUseSandbox（旧仓 3 指定文件 3898L）。
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
export { type BashToolInput } from './bashToolInput'
