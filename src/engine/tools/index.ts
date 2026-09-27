/**
 * 基础工具 Read/Edit/Bash/Glob/Grep + AgentTool + 注册表 getAllBaseTools
 *
 * 实现波次: E-2 已落 AgentTool 核心（T-5b）+ MCP 构建（T-5a）+ 注册表机制
 *   getAllBaseTools(deps)（T-5e）；49 基础工具本体（47 = 历史口径，§8.53 审计④）= 残留守（各本体纵切经 deps 注入）——§8.54 S-B5 已落 BashTool + §8.55 S-C4 已落 GlobTool + GrepTool + S-C5 已落 ReadTool + S-C6 已落 WriteTool + EditTool = 6/49（43 剩，高频族全闭环 → 长尾 43 本体纵切后续波）。
 *
 * T-5a（§8.25 E-2）已落 MCP 工具构建面 → 在此 re-export；port 类型面
 *   （McpToolResult/McpToolClient/McpToolDescriptor/MCPServerConnection）归
 *   ports/mcpClient，经 engine 门面（engine/index.ts）单独 re-export。
 * T-5b（§8.25 E-2）已落 AgentTool 核心面 → 在此 re-export（agent/ 子门面）。
 * T-5d（§8.25 E-2）已落工具名常量 seed（toolNames：ASYNC/INTERNAL 集 + 单工具名）。
 * T-5e（§8.25 E-2）已落注册表机制 toolRegistry（getAllBaseTools(deps) deps 注入 +
 *   ASCEND 门控 + 按名去重）+ toolNames 全量常量集（4 工具名集 + 14 单工具名）。
 * E-4 S-4a（§8.31/§8.32）已落 LEGACY 工具名 alias 表 legacyToolNameAliases
 *   （4 项 legacy → 正规名，正规名引用 toolNames/agent 常量；模块加载注册
 *   进 permissions 域解析函数组，re-export 触发 side-effect import）。
 * E-4 S-4c1（§8.34 裁定 ⑤）已落 getToolsForDefaultPreset(deps)（机制面默认
 *   预设工具名，engine/permissions permissionSetup 传递依赖提前；本体残留守不变）。
 * E-4 S-4d（§8.36）已落 filterToolsByDenyRules + getTools（deny 规则工具面
 *   过滤，域 getDenyRuleForTool 消费；模式过滤支裁出见 toolRegistry 头注）。
 * §8.53 S-T1（工具本体波 C 桶 ①）已落 bash 内核 8 文件（旧仓 utils/bash 闭包
 *   子集逐字随迁）+ 4 本地小模块 → 在此 re-export（bash/ 子门面）。
 * §8.53 S-T2a 已落 bash checkPermissions 面 4 文件（旧仓 tools/BashTool
 *   bashSecurity/sedValidation/modeValidation/bashCommandHelpers 逐字随迁）
 *   + bashToolInput duck 型 → bash/ 子门面 re-export 扩块；残留守 bashPermissions
 *   / pathValidation / shouldUseSandbox = S-T2b。
 * §8.53 S-T2b 已落核心 3 文件 + 6 本地辅助模块 → bash/ 子门面 re-export 再扩块。
 * §8.54 S-B 子波（Bash 本体纵切）S-B1~S-B5 已落 9 文件本体 + 依赖闭包层 →
 *   在此 re-export（bash/ 子门面）；S-B5 落 BashTool 对象 = 49 基础工具本体
 *   首个纵切落地（残留守「49 本体」登记随之缩 1）+ 首个非-passthrough
 *   checkPermissions 工具面实现（§8.43 裁定① 闭环）。
 * §8.55 S-C 子波（高频族本体纵切）S-C1~S-C4 已落 files/ 子域依赖闭包层
 *   1/2/3 + Glob/Grep 本体 → 在此 re-export（files/ 子门面）；S-C4 落
 *   GlobTool + GrepTool 对象（残留守「49 本体」登记再缩 2 → 3/49）+
 *   checkPermissions 一线接线 checkReadPermissionForTool（搜索工具面
 *   读权限决策体消费，§8.55 裁定）；S-C5 落 ReadTool 本体（4/49）+
 *   S-C6 落 WriteTool + EditTool 本体（fileWriteTool/fileEditTool/
 *   fileEditUtils/fileEditConstants/fileWritePrompt/fileEditPrompt）
 *   → 6/49 波终态（高频族全闭环，43 长尾本体纵切后续波）。
 * §8.56 S-D3（任务工具本体子波 4）已落 tasks/ 子域 Task 四件套本体
 *   （taskCreateTool/taskGetTool/taskListTool/taskUpdateTool 4 对象 +
 *   JSON schema 4 常量 + Output 型 4 + prompt 面 4 + taskToolInput duck
 *   5 型，旧仓 tools/Task*Tool 族 826L 逐字随迁）→ 在此 re-export
 *   （tasks/ 子门面）；残留守「49 本体」登记再缩 4 → 10/49（注册表
 *   ⑯ isTodoV2 槽随 Task 四件套 materialize，自门控 isEnabled =
 *   isTodoV2Enabled；cron 三件套 ② AGENT_TRIGGERS 槽 = S-D4 同子波）。
 * §8.56 S-D4（任务工具本体子波 4）已落 schedule/ 子域 cron 三件套本体
 *   （cronCreateTool/cronDeleteTool/cronListTool 3 对象 + JSON schema
 *   3 常量 + Output 型 3 + schedulePrompt 门面 + scheduleToolInput duck
 *   3 型，旧仓 tools/ScheduleCronTool 族 640L 逐字随迁）+ tasks/ 子域
 *   扩 2 件（TaskStopTool + TodoWriteTool 本体 + 2 prompt 面 + duck
 *   5 型扩块）→ 在此 re-export（schedule/ + tasks/ 子门面）；残留守
 *   「49 本体」登记再缩 5 → 15/49（注册表 ② AGENT_TRIGGERS 槽随 cron
 *   三件套 materialize，自门控 isEnabled = isCronEnabled（ATLAS_DISABLE_
 *   CRON kill-switch）；⑯ isTodoV2 槽补 TodoWrite 反向门控支
 *   isEnabled = !isTodoV2Enabled；TaskStop 无条件注册长尾；S-D5
 *   TaskOutput = 同子波最后 1 件 → 16/49）。
 * §8.56 S-D5（任务工具本体子波 4 末件）已落 tasks/ 子域 TaskOutputTool
 *   本体（1 对象 + JSON schema 1 常量 + TaskOutput/TaskOutputToolOutput
 *   型 + TaskOutputProgress 结构型 + taskOutputPrompt 面 + taskToolInput
 *   duck 2 型扩块，旧仓 tools/TaskOutputTool 583L buildTool 体逐字随迁
 *   多裁，见 taskOutputTool.ts 头注 delta ①-⑨）→ 在此 re-export
 *   （tasks/ 子门面）；残留守「49 本体」登记缩 1 → 16/49（高频族 +
 *   任务工具族全闭环，余 33 长尾本体纵切后续波）。
 * §8.57 S-D2b（worktree 工具本体子波）已落 worktree/ 子域 Enter/ExitWorktree
 *   两本体（2 对象 + JSON schema 2 常量 + Output 型 2 + worktreePrompt 面
 *   （2 PROMPT 逐字 sha256 核 + 2 DESCRIPTION + isWorktreeModeEnabled 门控）
 *   + worktreeToolInput duck 2 型，旧仓 tools/EnterWorktreeTool 123L +
 *   ExitWorktreeTool 318L + prompt 62L 逐字随迁多裁，见各文件头注
 *   delta ①-⑩/⑪）→ 在此 re-export（worktree/ 子门面）；残留守「49
 *   本体」登记再缩 2 → 18/49（注册表 ⑭ worktree mode 槽 materialize，
 *   自门控 isEnabled = isWorktreeModeEnabled（ATLAS_DISABLE_WORKTREE_MODE
 *   kill-switch，GA 缺省开）；worktree 域 E-7 S-7c + S-D2a 会话/tmux 族
 *   已落，域已闭环）。
 * §8.58 S-E2（plan 族子波）已落 plan/ 子域 EnterPlanModeTool /
 *   ExitPlanModeV2Tool 两本体（2 对象 + JSON schema 2 常量 + Output 型 2 +
 *   AllowedPrompt 型 + planPrompt 面（Enter interview 门双变体动态模板 +
 *   Exit 29L 静态模板 + 2 DESCRIPTION 短常量 +
 *   isPlanModeInterviewPhaseEnabled env-only 门）+ plan 域 7 函数
 *   （planDomain：getPlanSlug 域内缓存 + getPlansDirectory 闭包 memo +
 *   getPlanFilePath/getPlan + slug 管理 3 件，旧仓 utils/plans.ts 消费面
 *   随迁 + utils/words.ts 800L 词表逐字 = planWords）+ planToolInput duck
 *   8 型，旧仓 tools/EnterPlanModeTool 113L + prompt 103L +
 *   tools/ExitPlanModeTool 475L + prompt 29L 逐字随迁多裁，见各文件头注
 *   delta ①-⑨/⑩）→ 在此 re-export（plan/ 子门面）；残留守「49 本体」
 *   登记再缩 2 → 20/49（plan 族无专属门控槽 = 无条件注册面，同 Read/
 *   Write 族；裁面登记：team 支 → C 桶 ③ shell·swarm 波 / auto-mode gate
 *   族 + bootstrap 4 旗标 → C 桶 ② auto-mode 纵切波 /
 *   persistFileSnapshotIfRemote → remote 波 / _sdkInputSchema → D 波）。
 * §8.59 S-E2（web 族子波）已落 web/ 子域 WebFetchTool / WebSearchTool 两
 *   本体（2 对象 + JSON schema 2 常量 + 型面 11（webToolInput duck 族，
 *   S-E3 A-N6/B-N5 计数订正）
 *   + prompt 面 4（WebFetch auth-warning prompt / WebSearch 月年模板 +
 *   2 短 description 不接线）+ URL 管线（webFetchUtils：3 错误类 / 双 LRU
 *   缓存（本地 TtlLruCache，旧 lru-cache 裁）/ blocklist 预检（
 *   ATLAS_WEB_DOMAIN_CHECK_URL [ATLAS-HOLD] fail-open 逐字）/ 受限重定向
 *   （node fetch redirect:'manual'，旧 axios 裁）/ 二进制落盘（
 *   tool-results 临时目录面）/ 二级模型面（buildOpenAIParams 'fast' +
 *   modelProvider.chat））+ preapproved 双表 + rule-content 函数 2 +
 *   makeToolSchema（web_search wire 面 max_uses 8）+
 *   makeOutputFromSearchResponse 三块型流解析 + 测试缝
 *   setWebFetchTransportForTesting（func 层 HTTP fixture 面），旧仓
 *   tools/WebFetchTool（utils 537L + 本体 318L + prompt 46L + preapproved
 *   166L）+ tools/WebSearchTool（本体 354L + prompt 34L）逐字随迁多裁
 *   （axios→node fetch / lru-cache→本地 / turndown 裁 HTML raw 透传 /
 *   GrowthBook haiku 门裁恒 mainLoopModel 路径 / UI React 面 → TUI 波，
 *   见各文件头注 delta ①-⑩）→ 在此 re-export（web/ 子门面）；残留守
 *   「49 本体」登记再缩 2 → 22/49（web 族无专属门控槽 = 无条件注册面，
 *   同 Read/Write 族）。
 * §8.60 S-E2（config+ask-user 族子波）已落 config/ 子域 ConfigTool 本体 +
 *   askUser/ 子域 AskUserQuestionTool 本体（2 对象 + JSON schema 2 常量 +
 *   prompt 面 + 注册表 3 键裁剪面（supportedSettings 存活判据 = 新 SettingsJson
 *   声明 ∩ 活消费点）+ duck 型面 8），Skill 915L 重分类 D 波（skill 域依赖
 *   闭包未落，§8.60.1.1；裁面登记：global 11 键段 → C 桶 ③ shell·swarm 波 /
 *   HTML preview 支 = 旧 any stub 死码裁 / AppState 同步面裁 / UI JSX → TUI 波 /
 *   _sdk* → D 波，见各文件头注 delta ①-⑧）→ 在此 re-export（config/ askUser/
 *   子门面）；残留守「49 本体」登记再缩 2 → 24/49（config/askUser 族无专属
 *   门控槽 = 无条件注册面，同 web 族）。
 * §8.61 S-E2（notebook 族子波）已落 notebook/ 子域 NotebookEditTool 本体
 *   （1 对象 + JSON schema 1 常量 + prompt 面 + Input/Output duck 型 2；旧仓
 *   NotebookEditTool 490L + prompt 3L + UI 92L 裁剪随迁，LSP 860L + client
 *   域 2464L 重分类 D 波 LSP 域（§8.61.1.1：LSP servers = plugins only →
 *   依赖闭包 = client 域 + plugin 域 2 域落盘超子波范围，空心壳禁；
 *   LSP_TOOL_NAME seed 随 D 波）；裁面登记：fileHistory 支 → files 波
 *   delta ⑦ 先例 / safeParseJSON LRU memo → jsonParse 双站点 / UI JSX 4 函数
 *   + getToolUseSummary → TUI 波 / TRANSCRIPT_CLASSIFIER 门裁 = 本体无条件
 *   随迁，见各文件头注 delta ①-⑨）→ 在此 re-export（notebook/ 子门面）；
 *   残留守「49 本体」登记再缩 1 → 25/49（notebook 族无专属门控槽 = 无条件
 *   注册面，同 web/config 族；LSP 槽 = 残留守归属 D 波 LSP 域）。
 */
export {
  createMcpTools,
  findMcpServerConnection,
  buildMcpToolName,
  getMcpPrefix,
  mcpInfoFromString,
  normalizeNameForMCP,
} from './mcp'
export {
  getAllBaseTools,
  getToolsForDefaultPreset,
  filterToolsByDenyRules,
  getTools,
  isAscendToolsEnabled,
  TOOL_PRESETS,
  parseToolPreset,
  type ToolRegistryDeps,
  type ToolPreset,
} from './toolRegistry'
export {
  ASYNC_AGENT_ALLOWED_TOOLS,
  INTERNAL_WORKER_TOOLS,
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  TASK_OUTPUT_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  CONFIG_TOOL_NAME,
  WORKFLOW_TOOL_NAME,
  REPL_TOOL_NAME,
  BASH_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  SHELL_TOOL_NAMES,
} from './toolNames'
export { LEGACY_TOOL_NAME_ALIASES } from './legacyToolNameAliases'
export {
  AgentTool,
  runAgent,
  GENERAL_PURPOSE_AGENT,
  isBuiltInAgent,
  isCustomAgent,
  getBuiltInAgents,
  parseAgentFromMarkdown,
  getActiveAgentsFromList,
  loadAgentDefinitions,
  isForkSubagentEnabled,
  FORK_AGENT,
  buildForkedMessages,
  buildChildMessage,
  isInForkChild,
  buildWorktreeNotice,
  FORK_SUBAGENT_TYPE,
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
  computeChildSpawnDepth,
  filterToolsForAgent,
  resolveAgentTools,
  countToolUses,
  finalizeAgentTool,
  AGENT_TOOL_NAME,
  MAX_WORKER_SPAWN_DEPTH,
  getPrompt,
  formatAgentLine,
  type RunAgentArgs,
  type RunAgentResult,
  type AgentDefinition,
  type AgentToolResult,
  type ResolvedAgentTools,
  type InjectedAgentFile,
} from './agent'
export {
  type TsNode,
  ensureParserInitialized,
  getParserModule,
  SHELL_KEYWORDS,
  type Node,
  type ParsedCommandData,
  ensureInitialized,
  parseCommand,
  PARSE_ABORTED,
  parseCommandRaw,
  extractCommandArguments,
  type Redirect,
  type SimpleCommand,
  type ParseForSecurityResult,
  nodeTypeId,
  parseForSecurity,
  parseForSecurityFromAst,
  type SemanticCheckResult,
  checkSemantics,
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
  type HeredocInfo,
  type HeredocExtractionResult,
  extractHeredocs,
  restoreHeredocs,
  containsHeredoc,
  type QuoteContext,
  type CompoundStructure,
  type DangerousPatterns,
  type TreeSitterAnalysis,
  extractQuoteContext,
  extractCompoundStructure,
  hasActualOperatorNodes,
  extractDangerousPatterns,
  analyzeCommand,
  type OutputRedirection,
  type IParsedCommand,
  RegexParsedCommand_DEPRECATED,
  buildParsedCommandFromRoot,
  ParsedCommand,
  type ShellParseResult,
  type ShellQuoteResult,
  tryParseShellCommand,
  tryQuoteShellArgs,
  hasMalformedTokens,
  hasShellQuoteSingleQuoteBug,
  quote,
  type PrefixExtractorConfig,
  type CommandPrefixExtractor,
  type SubcommandPrefixExtractor,
  createCommandPrefixExtractor,
  createSubcommandPrefixExtractor,
  // ── S-T2a（§8.53）：checkPermissions 面 ──
  stripSafeHeredocSubstitutions,
  hasSafeHeredocSubstitution,
  bashCommandIsSafe_DEPRECATED,
  bashCommandIsSafeAsync_DEPRECATED,
  isLinePrintingCommand,
  isPrintCommand,
  sedCommandIsAllowedByAllowlist,
  hasFileArgs,
  extractSedExpressions,
  checkSedConstraints,
  checkPermissionMode,
  getAutoAllowedCommands,
  type CommandIdentityCheckers,
  checkCommandOperatorPermissions,
  type BashToolInput,
  // ── S-T2b（§8.53）：核心 3 文件 + 6 本地辅助模块 ──
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
  type PathCommand,
  PATH_EXTRACTORS,
  COMMAND_OPERATION_TYPE,
  createPathChecker,
  checkPathConstraints,
  stripWrappersFromArgv,
  shouldUseSandbox,
  isReadOnlyCommand,
  AbortError,
  type Platform,
  getPlatform,
  count,
  windowsPathToPosixPath,
  getDirectoryForPath,
  type BashToolUseContext,
  // ── S-B1（§8.54）：依赖闭包层 ──
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
  isCurrentDirectoryBareGitRepo,
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
  hasEmbeddedSearchTools,
  shouldMaintainProjectWorkingDir,
  shouldIncludeGitInstructions,
  prependBullets,
  // ── S-B2（§8.54）：纯叶子本体 ──
  extractBashCommentLabel,
  getDestructiveCommandWarning,
  type CommandSemantic,
  interpretCommandResult,
  type SedEditInfo,
  isSedInPlaceEdit,
  parseSedEditCommand,
  applySedSubstitution,
  stripEmptyLines,
  isImageOutput,
  parseDataUri,
  buildImageToolResult,
  resizeShellImageOutput,
  formatOutput,
  stdErrAppendShellResetMessage,
  resetCwdIfOutsideProject,
  createContentSummary,
  // ── S-B3（§8.54）：只读命令校验本体 ──
  isCommandSafeViaFlagParsing,
  checkReadOnlyConstraints,
  // ── S-B4（§8.54）：prompt 本体 ──
  getDefaultTimeoutMs,
  getMaxTimeoutMs,
  getSimplePrompt,
  // ── S-B5（§8.54）：BashTool 本体（首个非-passthrough checkPermissions 面）──
  BASH_TOOL_INPUT_SCHEMA,
  BashTool,
  getBackgroundTask,
  listBackgroundTasks,
  type Out,
  type BgTask,
} from './bash'
// ── S-C 子波（§8.55）：files 子域（S-C1~S-C3 依赖闭包层 + S-C4 Glob/Grep 本体）──
export {
  // S-C1：依赖闭包层 1
  PDF_TARGET_RAW_SIZE,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_EXTRACT_SIZE,
  PDF_MAX_PAGES_PER_READ,
  PDF_AT_MENTION_INLINE_THRESHOLD,
  CONTEXT_LINES,
  DIFF_TIMEOUT_MS,
  adjustHunkLineNumbers,
  countLinesChanged,
  getPatchFromContents,
  getPatchForDisplay,
  type FileEditInput,
  type EditInput,
  type FileEdit,
  fileReadCache,
  type LineEndingType,
  detectEncodingForResolvedPath,
  detectLineEndingsForString,
  readFileSyncWithMetadata,
  readFileSync,
  type File,
  pathExists,
  MAX_OUTPUT_SIZE,
  readFileSafe,
  getFileModificationTime,
  getFileModificationTimeAsync,
  writeTextContent,
  detectFileEncoding,
  detectLineEndings,
  convertLeadingTabsToSpaces,
  getAbsoluteAndRelativePaths,
  getDisplayPath,
  findSimilarFile,
  FILE_NOT_FOUND_CWD_NOTE,
  suggestPathUnderCwd,
  isCompactLinePrefixEnabled,
  addLineNumbers,
  stripLineNumberPrefix,
  isDirEmpty,
  readFileSyncCached,
  writeFileSyncAndFlush_DEPRECATED,
  getDesktopPath,
  isFileWithinReadSizeLimit,
  normalizePathForComparison,
  pathsEqual,
  semanticToNumber,
  semanticToBoolean,
  getMainLoopModelName,
  getCanonicalModelName,
  // S-C2：依赖闭包层 2
  normalizePatternsToPath,
  getFileReadIgnorePatterns,
  extractGlobBaseDirectory,
  glob,
  // S-C3：pdf/notebook 族
  execFileNoThrow,
  type PDFError,
  type PDFResult,
  type PDFExtractPagesResult,
  readPDF,
  getPDFPageCount,
  resetPdftoppmCache,
  isPdftoppmAvailable,
  extractPDFPages,
  DOCUMENT_EXTENSIONS,
  parsePDFPageRange,
  isPDFSupported,
  isPDFExtension,
  readNotebook,
  mapNotebookCellsToToolResult,
  parseCellId,
  type NotebookCellType,
  type NotebookCell,
  type NotebookDocument,
  NotebookCellKind,
  type NotebookContent,
  type NotebookCellSource,
  type NotebookCellSourceOutput,
  type NotebookOutputImage,
  type NotebookCellOutput,
  // S-C4：Glob/Grep 本体
  GLOB_DESCRIPTION,
  getGrepDescription,
  toRelativePath,
  type GlobToolInput,
  type GrepToolInput,
  type FilesToolUseContext,
  GLOB_TOOL_INPUT_SCHEMA,
  GlobTool,
  type GlobOutput,
  GREP_TOOL_INPUT_SCHEMA,
  GrepTool,
  type GrepOutput,
  // S-C5：Read 本体
  BINARY_EXTENSIONS,
  hasBinaryExtension,
  isBinaryContent,
  DEFAULT_MAX_OUTPUT_TOKENS,
  getDefaultFileReadingLimits,
  type FileReadingLimits,
  FILE_UNCHANGED_STUB,
  MAX_LINES_TO_READ,
  DESCRIPTION,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
  type InDomainUserMessage,
  createUserMessage,
  memoryAgeDays,
  memoryAge,
  memoryFreshnessText,
  memoryFreshnessNote,
  READ_TOOL_INPUT_SCHEMA,
  ReadTool,
  type ReadOutput,
  MaxFileReadTokenExceededError,
  registerFileReadListener,
  CYBER_RISK_MITIGATION_REMINDER,
  type ReadToolInput,
  type FileState,
  type ReadFileState,
  // S-C6：Write+Edit 本体
  ATLAS_FOLDER_PERMISSION_PATTERN,
  GLOBAL_ATLAS_FOLDER_PERMISSION_PATTERN,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  LEFT_DOUBLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
  normalizeQuotes,
  stripTrailingWhitespace,
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
  getPatchForEdit,
  getPatchForEdits,
  getSnippetForTwoFileDiff,
  getSnippetForPatch,
  getSnippet,
  getEditsForPatch,
  normalizeFileEditInput,
  areFileEditsEquivalent,
  areFileEditsInputsEquivalent,
  getEditToolDescription,
  getWriteToolDescription,
  WRITE_TOOL_INPUT_SCHEMA,
  WriteTool,
  type WriteOutput,
  EDIT_TOOL_INPUT_SCHEMA,
  EditTool,
  type EditOutput,
  type WriteToolInput,
} from './files'
// ── S-D4（§8.56）：schedule 子域（cron 三件套本体）──
export {
  CRON_CREATE_TOOL_INPUT_SCHEMA,
  CronCreateTool,
  type CronCreateOutput,
  CRON_DELETE_TOOL_INPUT_SCHEMA,
  CronDeleteTool,
  type CronDeleteOutput,
  CRON_LIST_TOOL_INPUT_SCHEMA,
  CronListTool,
  type CronListOutput,
  isCronEnabled,
  isDurableCronEnabled,
  DEFAULT_MAX_AGE_DAYS,
  buildCronCreateDescription,
  buildCronCreatePrompt,
  CRON_DELETE_DESCRIPTION,
  buildCronDeletePrompt,
  CRON_LIST_DESCRIPTION,
  buildCronListPrompt,
  type CronCreateToolInput,
  type CronDeleteToolInput,
  type CronListToolInput,
} from './schedule'
// ── S-D3（§8.56）：tasks 子域（Task 四件套本体）+ S-D4 扩 2 件 + S-D5
// 末件 TaskOutput ──
export {
  TASK_CREATE_TOOL_INPUT_SCHEMA,
  TaskCreateTool,
  type TaskCreateOutput,
  TASK_GET_TOOL_INPUT_SCHEMA,
  TaskGetTool,
  type TaskGetOutput,
  TASK_LIST_TOOL_INPUT_SCHEMA,
  TaskListTool,
  type TaskListOutput,
  TASK_UPDATE_TOOL_INPUT_SCHEMA,
  TaskUpdateTool,
  type TaskUpdateOutput,
  TASK_CREATE_DESCRIPTION,
  getTaskCreatePrompt,
  TASK_GET_DESCRIPTION,
  TASK_GET_PROMPT,
  TASK_LIST_DESCRIPTION,
  getTaskListPrompt,
  TASK_UPDATE_DESCRIPTION,
  TASK_UPDATE_PROMPT,
  type TaskCreateToolInput,
  type TaskGetToolInput,
  type TaskListToolInput,
  type TaskUpdateToolInput,
  type TaskToolUseContext,
  // S-D4：TaskStop + TodoWrite 扩 2 件
  TASK_STOP_TOOL_INPUT_SCHEMA,
  TaskStopTool,
  type TaskStopOutput,
  TODO_WRITE_TOOL_INPUT_SCHEMA,
  TodoWriteTool,
  type TodoWriteOutput,
  TASK_STOP_DESCRIPTION,
  TODO_WRITE_DESCRIPTION,
  TODO_WRITE_PROMPT,
  type TaskStopToolInput,
  type TaskStopToolUseContext,
  type TodoWriteToolInput,
  type TodoWriteAppState,
  type TodoWriteToolUseContext,
  // S-D5：TaskOutput 末件
  TASK_OUTPUT_TOOL_INPUT_SCHEMA,
  TaskOutputTool,
  type TaskOutput,
  type TaskOutputToolOutput,
  type TaskOutputProgress,
  TASK_OUTPUT_DESCRIPTION,
  TASK_OUTPUT_PROMPT,
  type TaskOutputToolInput,
  type TaskOutputToolUseContext,
} from './tasks'
// ── S-D2b（§8.57）：worktree 子域（Enter/ExitWorktree 两本体）──
export {
  ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  EnterWorktreeTool,
  type EnterWorktreeOutput,
  EXIT_WORKTREE_TOOL_INPUT_SCHEMA,
  ExitWorktreeTool,
  type ExitWorktreeOutput,
  ENTER_WORKTREE_PROMPT,
  EXIT_WORKTREE_PROMPT,
  ENTER_WORKTREE_DESCRIPTION,
  EXIT_WORKTREE_DESCRIPTION,
  isWorktreeModeEnabled,
  type EnterWorktreeToolInput,
  type ExitWorktreeToolInput,
} from './worktree'
// ── S-E2（§8.58）：plan 子域（EnterPlanMode/ExitPlanModeV2 两本体 +
// plan 域 7 函数 + 词表 800L）──
export {
  ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
  EnterPlanModeTool,
  type EnterPlanModeOutput,
  EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
  ExitPlanModeV2Tool,
  type AllowedPrompt,
  type ExitPlanModeV2Output,
  ENTER_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_V2_DESCRIPTION,
  EXIT_PLAN_MODE_V2_TOOL_PROMPT,
  getEnterPlanModeToolPrompt,
  isPlanModeInterviewPhaseEnabled,
  clearAllPlanSlugs,
  clearPlanSlug,
  getPlan,
  getPlanFilePath,
  getPlanSlug,
  getPlansDirectory,
  setPlanSlug,
  setPlanSlugGeneratorForTesting,
  generateShortWordSlug,
  generateWordSlug,
  type EnterPlanModeAppState,
  type EnterPlanModeToolContext,
  type EnterPlanModeToolInput,
  type ExitPlanModeV2AppState,
  type ExitPlanModeV2ToolContext,
  type ExitPlanModeV2ToolInput,
  type ExitPlanModeV2ValidateContext,
} from './plan'
// ── S-E2（§8.59）：web 子域（WebFetch/WebSearch 两本体 + URL 管线 +
// preapproved 双表；名字常量 WEB_FETCH/WEB_SEARCH_TOOL_NAME 由 toolNames
// 块 seed，同 plan 族口径不重出）──
export {
  PREAPPROVED_HOSTS,
  isPreapprovedHost,
  clearWebFetchCache,
  EgressBlockedError,
  extensionForMimeType,
  getURLMarkdownContent,
  getWithPermittedRedirects,
  isBinaryContentType,
  isPermittedRedirect,
  isPreapprovedUrl,
  MAX_MARKDOWN_LENGTH,
  persistBinaryContent,
  setWebFetchTransportForTesting,
  validateURL,
  applyPromptToMarkdown,
  type FetchedContent,
  type PersistBinaryResult,
  type RedirectInfo,
  type WebFetchHttpResponse,
  type WebFetchHttpResult,
  type WebFetchTransport,
  type WebFetchTransportInit,
  // 重名登记：files 块已 seed readPrompt DESCRIPTION（Read 面）→ web 面
  // 别名重出（tasks 族 TASK_*_DESCRIPTION 别名先例，S-E3 B-N6 归属订正）
  DESCRIPTION as WEB_FETCH_DESCRIPTION,
  getWebFetchToolPrompt,
  makeSecondaryModelPrompt,
  webFetchShortDescription,
  WEB_FETCH_TOOL_INPUT_SCHEMA,
  WebFetchTool,
  webFetchToolInputToPermissionRuleContent,
  makeOutputFromSearchResponse,
  makeToolSchema,
  WEB_SEARCH_TOOL_INPUT_SCHEMA,
  WebSearchTool,
  getLocalMonthYear,
  getWebSearchPrompt,
  webSearchShortDescription,
  TOOL_SUMMARY_MAX_LENGTH,
  truncateSummary,
  type WebFetchOutput,
  type WebFetchToolContext,
  type WebFetchToolInput,
  type WebSearchHit,
  type WebSearchOutput,
  type WebSearchProgress,
  type WebSearchResult,
  type WebSearchServerToolSchema,
  type WebSearchToolContext,
  type WebSearchToolInput,
  type SearchContentBlock,
} from './web'

// ── S-E2（§8.60）：config 子域（ConfigTool 本体 + 注册表 3 键裁剪面 +
// prompt 面；名字常量 CONFIG_TOOL_NAME 由 toolNames 块 seed 不重出）──
export {
  ConfigTool,
  CONFIG_TOOL_INPUT_SCHEMA,
  generatePrompt,
  // 重名登记：files 块已 seed readPrompt DESCRIPTION（Read 面）→ config 面
  // 别名重出（web 块 WEB_FETCH_DESCRIPTION 别名先例）
  DESCRIPTION as CONFIG_DESCRIPTION,
  type ConfigOutput,
  type ConfigToolInput,
  type SettingConfig,
} from './config'

// ── S-E2（§8.60）：askUser 子域（AskUserQuestionTool 本体 + JSON schema +
// prompt 面；名字常量 ASK_USER_QUESTION_TOOL_NAME 由 toolNames 块 seed
// 不重出）──
export {
  AskUserQuestionTool,
  ASK_USER_QUESTION_TOOL_INPUT_SCHEMA,
  ASK_USER_QUESTION_TOOL_CHIP_WIDTH,
  ASK_USER_QUESTION_TOOL_PROMPT,
  PREVIEW_FEATURE_PROMPT,
  // 重名登记：同 config 面 DESCRIPTION 别名重出
  DESCRIPTION as ASK_USER_QUESTION_DESCRIPTION,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type AskUserQuestionOutput,
  type AskUserQuestionToolInput,
  type QuestionAnnotation,
} from './askUser'

// ── S-E2（§8.61）：notebook 子域（NotebookEditTool 本体 + JSON schema +
// prompt 面；名字常量 NOTEBOOK_EDIT_TOOL_NAME 由 toolNames 块 seed 不重出；
// LSP 重分类 D 波 LSP 域，§8.61.1.1）──
export {
  NotebookEditTool,
  NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA,
  // 重名登记：同 config/askUser 面 DESCRIPTION 别名重出（web 块
  // WEB_FETCH_DESCRIPTION 别名先例）
  DESCRIPTION as NOTEBOOK_EDIT_DESCRIPTION,
  PROMPT as NOTEBOOK_EDIT_PROMPT,
  type NotebookEditInput,
  type NotebookEditOutput,
} from './notebook'
