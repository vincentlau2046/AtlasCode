/**
 * lsp 域唯一公共出口（STR-1 门面规则；§8.67 D 波 S-E2c）。
 *
 * 域 = 旧仓 services/lsp 9 文件 2464L client 域 + 配置注入窗（lspConfig）
 * + manager 单例（lspManager）。外部模块只许经本 index 引入（entry-point
 * lint 拦截）。消费方：
 *   - engine/tools/lsp（LSPTool 本体）：manager 单例 4 函数族
 *     （getInitializationStatus/getLspServerManager/isLspConnected/
 *     waitForInitialization）+ wire 型（LSPTool + formatters +
 *     symbolContext 消费面）
 *   - CLI / 插件域 LSP 集成波（前向接缝，B 路 M-1 措辞订正：组合根
 *     S-E2d 三提交未接 LSP 面，compose.ts 零 LSP 引用，原「组合根
 *     （S-E2d 回填）」完成态措辞夸大）：initializeLspServerManager /
 *     shutdownLspServerManager / reinitializeLspServerManager 生命周期
 *     + setLspServerSource（插件域 LSP 集成波注册真源）导出待消费波接线
 *   - 消息/TUI 波（前向接缝登记）：checkForLSPDiagnostics 诊断取出面 +
 *     clearDeliveredDiagnosticsForFile 编辑清除面
 */

// ── wire 型 + 配置/状态型（types 单一事实源）──
export type {
  LspServerState,
  LspServerConfig,
  ScopedLspServerConfig,
  Position,
  Range,
  Location,
  LocationLink,
  TextDocumentIdentifier,
  TextDocumentItem,
  TextDocumentContentChangeEvent,
  MarkedString,
  MarkupContent,
  Hover,
  SymbolKind,
  SymbolInformation,
  DocumentSymbol,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  ServerCapabilities,
  InitializeParams,
  InitializeResult,
  LSPDiagnostic,
  PublishDiagnosticsParams,
  Diagnostic,
  DiagnosticFile,
} from './types'

// ── 本地 JSON-RPC 2.0 stdio 客户端（3-dep 违规面本地转写，delta ①）──
export { JsonRpcError, createJsonRpcClient } from './lspJsonRpc'
export type { JsonRpcClient } from './lspJsonRpc'

// ── LSP client（spawn + initialize + 请求/通知面）──
export { createLSPClient } from './lspClient'
export type { LSPClient } from './lspClient'

// ── server 实例状态机（start/stop/健康/-32801 重试）──
export { createLSPServerInstance } from './lspServerInstance'
export type { LSPServerInstance } from './lspServerInstance'

// ── 多实例路由 manager（扩展名路由 + didOpen/didChange/didSave/didClose）──
export { createLSPServerManager } from './lspServerManager'
export type { LSPServerManager } from './lspServerManager'

// ── 配置注入窗（插件域 LSP 集成 = 前向接缝）──
export {
  setLspServerSource,
  clearLspServerSource,
  getAllLspServers,
} from './lspConfig'
export type { LspServerSource } from './lspConfig'

// ── manager 模块单例（4 态初始化 + generation 防陈旧 + bare-mode 短路）──
export {
  _resetLspManagerForTesting,
  getLspServerManager,
  getInitializationStatus,
  isLspConnected,
  waitForInitialization,
  initializeLspServerManager,
  reinitializeLspServerManager,
  shutdownLspServerManager,
} from './lspManager'

// ── 诊断待投递登记簿（LRU 跨轮去重 + 限量）──
export {
  registerPendingLSPDiagnostic,
  checkForLSPDiagnostics,
  clearAllLSPDiagnostics,
  resetAllLSPDiagnosticState,
  clearDeliveredDiagnosticsForFile,
  getPendingLSPDiagnosticCount,
} from './lspDiagnosticRegistry'
export type { PendingLSPDiagnostic } from './lspDiagnosticRegistry'

// ── 被动诊断 handler 注册（逐 server 错误隔离）──
export {
  formatDiagnosticsForAttachment,
  registerLSPNotificationHandlers,
} from './lspPassiveFeedback'
export type { HandlerRegistrationResult } from './lspPassiveFeedback'
