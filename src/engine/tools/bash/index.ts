/**
 * engine/tools/bash 门面（§8.53 S-T1，工具本体波 C 桶 ① Bash 纵切 · checkPermissions 面）。
 *
 * bash 内核 8 文件（旧仓 src/utils/bash/ 闭包子集，逐字随迁）+ 4 本地小模块
 * （prefixStatic / memoize / json / log，delta 见各文件头注）。显式名块（STR-1
 * 先例；全引擎面 0 重名核验——CommandPrefixResult/CommandSubcommandPrefixResult
 * 两型经 commands 转出（单出口），prefixStatic 名块不重列）。
 *
 * 面文件（bashPermissions / pathValidation / shouldUseSandbox / bashSecurity /
 * bashCommandHelpers / modeValidation / sedValidation）= S-T2 随迁（同子域，
 * 本门面 S-T2 扩块）。
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
