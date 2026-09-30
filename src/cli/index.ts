/**
 * cli（CLI 公共域）模块唯一公共出口（STR-1 门面规则：根门面显式名，子门面
 * export *）。
 *
 * 落位裁定（§8.71.1.2，用户裁定 2026-09-28）：CLI = 跨壳公共层，不属于任何
 * 壳——新 L3 顶层公共域，engine/task/bootstrap/mcp/remote 兄弟位；壳
 * （atlascode/）降消费方（ui/ TUI 壳 + launcher 薄壳归 #152 壳波）。不塞
 * src/shared/（叶子域纪律：CLI 面需消费 engine 根门面，shared 只许纯叶子）。
 * 跨域消费走根门面（swarm/mcp/remote 同型先例）。
 *
 * 切片计划（§8.71.1.4，实现波逐步填实 + 门面逐切片补显式名块）：
 *   - S-C2: parse.ts（commander option 面 + 子命令路由）/ dispatch.ts
 *     （main() 模式分派 + getInputPrompt）/ entryInit.ts（settings 加载 /
 *     migrations / prefetch / entrypoint 初始化）/ dev.ts（dev 面
 *     --tools/--skills/--check/--e2e/--auth-help）
 *   - S-C3: print.ts（headless 本体）/ structuredIO.ts /
 *     ndjsonSafeStringify.ts / exit.ts + drainSdkEvents 4 站点接线
 *     （analytics 波前向接缝核销）+ initMcpConnections 启动消费
 *   - S-C4: commands.ts（内建命令注册表）/ setup.ts（Setup hooks /
 *     entrypoint）/ handlers/*（子命令惰性 handlers）+ firstPrompt
 *     builtInCommandNames 注入口回填 + session 4 站点 + cron 消费点 +
 *     skill 命令索引接线
 *
 * 域外裁登记（不随迁，归属波；详见 docs §8.71.1.3 逐件归属表）：
 *   - update.ts（424L 自更新 → 版本管理方案波）/ remoteIO.ts（255L →
 *     remote 族波）/ transports/*（4535L 云传输 → IFF 网关波 前向缝登记（§8.74.28 ⑭，#200））
 *   - main.tsx server/ssh/open 子命令（→ remote 族波）/ auth login（订阅裁
 *     前向缝登记（§8.74.28 ⑭，#200）；status/logout 入域）
 *   - bg/up/rollback/ant/templateJobs（旧仓 de-ANT no-op 存根，不迁——
 *     H6 防空洞：存根不迁不伪装能力）
 *
 * 状态: S-C2 落盘（parse 面 + 分派面 + dev 面 + entryInit/exit 随迁）+
 * S-C3 落盘（print headless 本体〔queryAgentLoop 驱动 remap + 选项校验 +
 * 输出三态 + drainSdkEvents 4 站点 + MCP 启动消费〕/ structuredIO 8 面 /
 * sdkTypes 本地型面 / permissionPrompt wire schema / stream / ndjson /
 * streamJsonStdoutGuard；TUI 默认启动支归壳波 #152，非本域）+
 * S-C4 commit 4 落盘（mcp 子命令 handler 6 面 + mcp 配置写回面
 * mcpConfigWrite〔scope 映射 local→localSettings / user→userSettings /
 * project→.mcp.json 权限保持写〕；mcp 域 mcpConfig.ts 头注域外登记核销）+
 * S-C4 commit 5 落盘（auto-mode 子命令 handler 3 面〔defaults/config/
 * critique〕+ engine/config getAutoModeConfig；critique = sideQuery →
 * ModelProvider.chat remap，裁登记见 handlers/autoMode.ts 头注；
 * parse.ts sC4SeamAction 残留守随全 9 接缝核销整删）+
 * S-C4 commit 6 落盘（-p/--print → runHeadless 真接线〔parse 主面 print 支：
 * buildHeadlessOptions 契约映射 + getInputPrompt stdin peek + 格式兼容校验
 * 3 支 + 惰性动态 import〕+ commands/sessionList/setup 门面显式名块补全；
 * 交互入口留壳波 #152 前向接缝）。
 */
export { cliError, cliOk } from './exit'
export {
  enforceNoDebugGuard,
  eagerLoadSettings,
  eagerParseCliFlag,
  generateTempFilePath,
  initializeEntrypoint,
  parseSettingSourcesFlag,
  safeParseJSON,
} from './entryInit'
export {
  buildHeadlessOptions,
  buildProgram,
  registerInDomainSubcommands,
  resolveCliVersion,
  runCli,
} from './parse'
export { getInputPrompt, main } from './dispatch'
export { hasDevFlag, runDevCli } from './dev'

// ── S-C3: headless 本体 + structuredIO 模块 ────────────────────────
export { ndjsonSafeStringify } from './ndjsonSafeStringify'
export {
  permissionToolInputSchema,
  permissionToolOutputSchema,
  permissionPromptToolResultToPermissionDecision,
  type DecisionClassification,
  type PermissionToolOutput,
} from './permissionPrompt'
export {
  getCanUseToolFn,
  runHeadless,
  type HeadlessOptions,
} from './print'
export {
  sdkElicitationResponseSchema,
  sdkHookJSONOutputSchema,
  type CanUseToolFn,
  type ElicitResult,
  type HookCallback,
  type JsonRpcMessage,
  type SDKControlRequest,
  type SDKControlRequestInner,
  type SDKControlResponse,
  type SDKMessage,
  type SdkAssistantMessage,
  type SdkCanUseToolRequest,
  type SdkControlCancelRequest,
  type SdkElicitationRequest,
  type SdkHookCallbackRequest,
  type SdkKeepAliveMessage,
  type SdkMcpMessageRequest,
  type SdkResultMessage,
  type SdkSystemMessage,
  type SdkToolUseContext,
  type SdkToolView,
  type SdkUpdateEnvironmentVariables,
  type SdkUserMessage,
  type StdinMessage,
  type StdoutMessage,
} from './sdkTypes'
export { Stream } from './stream'
export {
  STDOUT_GUARD_MARKER,
  installStreamJsonStdoutGuard,
  _resetStreamJsonStdoutGuardForTesting,
} from './streamJsonStdoutGuard'
export {
  normalizeControlMessageKeys,
  SANDBOX_NETWORK_ACCESS_TOOL_NAME,
  StructuredIO,
  type RequiresActionDetails,
} from './structuredIO'

// ── S-C4 commit 4: mcp 子命令 handler + 配置写回面 ─────────────────
export {
  mcpAddHandler,
  mcpAddJsonHandler,
  mcpGetHandler,
  mcpListHandler,
  mcpRemoveHandler,
  mcpServeHandler,
  type McpAddJsonOptions,
  type McpAddOptions,
  type McpRemoveOptions,
  type McpServeOptions,
} from './handlers/mcp'
export {
  addMcpConfig,
  describeMcpConfigFilePath,
  ensureConfigScope,
  ensureTransport,
  expandEnvVarsInString,
  getAllMcpConfigs,
  getMcpConfigByName,
  getMcpConfigsByScope,
  getScopeLabel,
  parseEnvVars,
  parseHeaders,
  removeMcpConfig,
  type McpCliScope,
} from './mcpConfigWrite'

// ── S-C4 commit 5: auto-mode 子命令 handler（3 面）────────────────
export {
  autoModeConfigHandler,
  autoModeCritiqueHandler,
  autoModeDefaultsHandler,
  type AutoModeCritiqueOptions,
} from './handlers/autoMode'

// ── S-C4 commit 6: commands/sessionList/setup 门面显式名块 ────────
export {
  getCommands,
  getSkillCommandIndex,
  registerBuiltinCommandNames,
} from './commands'
export {
  findLatestSessionId,
  listSessionLogs,
  type SessionLogEntry,
} from './sessionList'
export {
  runCliSetup,
  type CliSetupOptions,
} from './setup'
