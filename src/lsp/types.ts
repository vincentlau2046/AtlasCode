/**
 * lsp 域 — 类型单一事实源（§8.67 D 波 S-E2c）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧仓 services/lsp/types.ts = any stub（`export * from all-local-types` +
 *    LspServerState/ScopedLspServerConfig/LspServerConfig 三型 `= any` 占位，
 *    ambient any stub 无真型契约可保真）→ 本文件 LspServerState 五态字面量
 *    （LSPServerInstance 状态机消费面逐字）+ LspServerConfig = 旧仓
 *    LspServerConfigSchema（plugins/schemas.ts L745）字段面 TS 镜像（zod
 *    校验面 = 插件域 LSP 集成前向接缝，本型 = 消费方结构契约）；
 *    ScopedLspServerConfig 结构同形（旧 scope 处理 = server 名键前缀，
 *    不在结构上）→ 别名。
 *  ② 旧仓 LSPTool 族 vscode-languageserver(-protocol) 型 import（3-dep 违规
 *    面，新仓依赖面 = diff/openai/proper-lockfile/shell-quote/zod 五枚）→
 *    本文件 LSP 3.16 协议 wire 型本地转写（转写面 = LSPTool + formatters +
 *    client 域消费面；字段面取 LSP 3.16 spec 消费面最小集，非旧仓保真 —
 *    旧仓无保真目标〔①〕；ServerCapabilities 消费面 = 存储透传
 *    （LSPClient.capabilities 存取），字段级型零消费者 → Record 面）。
 *  ③ 旧仓 diagnosticTracking.ts Diagnostic/DiagnosticFile 接口逐字转写
 *    （LSPDiagnosticRegistry + passiveFeedback 消费面）。
 */

// ── 域自有状态/配置型 ──

/** LSP server 实例状态机五态（LSPServerInstance 消费面逐字）。 */
export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

/**
 * LSP server 配置（旧 LspServerConfigSchema 字段面 TS 镜像；restartOnCrash /
 * shutdownTimeout 两字段保留 = 消费方 createLSPServerInstance 入口 throw
 * "not yet implemented" 面逐字，非死字段）。
 */
export interface LspServerConfig {
  /** Command to execute the LSP server (e.g., "typescript-language-server") */
  command: string
  /** Command-line arguments to pass to the server */
  args?: string[]
  /** Mapping from file extension to LSP language ID（≥1 mapping，≥1 面 =
   * 消费方 manager.initialize 校验逐字） */
  extensionToLanguage: Record<string, string>
  /** Communication transport mechanism（'socket' 支消费方未落 = 残留守） */
  transport?: 'stdio' | 'socket'
  /** Environment variables to set when starting the server */
  env?: Record<string, string>
  /** Initialization options passed to the server during initialization */
  initializationOptions?: unknown
  /** Settings passed to the server via workspace/didChangeConfiguration */
  settings?: unknown
  /** Workspace folder path to use for the server */
  workspaceFolder?: string
  /** Maximum time to wait for server startup (milliseconds) */
  startupTimeout?: number
  /** Maximum time to wait for graceful shutdown (milliseconds)（消费方 throw 面，①） */
  shutdownTimeout?: number
  /** Whether to restart the server if it crashes（消费方 throw 面，①） */
  restartOnCrash?: boolean
  /** Maximum number of restart attempts before giving up */
  maxRestarts?: number
}

/** scoped 配置（旧 getPluginLspServers 的 scope 处理 = server 名键前缀；结构同形）。 */
export type ScopedLspServerConfig = LspServerConfig

// ── LSP 3.16 协议 wire 型（消费面最小集，delta ②）──

export type Position = { line: number; character: number }

export type Range = { start: Position; end: Position }

export type Location = { uri: string; range: Range }

/** targetSelectionRange 消费面容错（旧 formatters locationLinkToLocation
 * `targetSelectionRange || targetRange` 双兜底 → 可缺省）。 */
export type LocationLink = {
  targetUri: string
  targetRange: Range
  targetSelectionRange?: Range
  originSelectionRange?: Range
}

export type TextDocumentIdentifier = { uri: string }

export type TextDocumentItem = {
  uri: string
  languageId: string
  version: number
  text: string
}

export type TextDocumentContentChangeEvent = {
  range?: Range
  rangeLength?: number
  text: string
}

export type MarkedString = string | { value: string }

export type MarkupContent = { kind: 'plaintext' | 'markdown'; value: string }

/** LSP Hover（formatters formatHoverResult 消费面：contents 3 形 + 可选 range）。 */
export type Hover = {
  contents: MarkedString | MarkedString[] | MarkupContent
  range?: Range
}

/** LSP SymbolKind 枚举 1..26（formatters symbolKindToString 26 项 Record 键面）。 */
export type SymbolKind =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26

export type SymbolInformation = {
  name: string
  kind: SymbolKind
  tags?: number[]
  containerName?: string
  location: Location
}

export type DocumentSymbol = {
  name: string
  detail?: string
  kind: SymbolKind
  tags?: number[]
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

export type CallHierarchyItem = {
  name: string
  kind: SymbolKind
  tags?: number[]
  detail?: string
  uri: string
  range: Range
  selectionRange: Range
  data?: unknown
}

export type CallHierarchyIncomingCall = {
  from: CallHierarchyItem
  fromRanges?: Range[]
}

export type CallHierarchyOutgoingCall = {
  to: CallHierarchyItem
  fromRanges?: Range[]
}

/** 消费面 = 存储透传（LSPClient.capabilities 存取，零字段级消费者）→ Record 面（delta ②）。 */
export type ServerCapabilities = Record<string, unknown>

export type InitializeParams = {
  processId: number
  rootUri?: string | null
  rootPath?: string | null
  /** 客户端能力声明（LSPServerInstance 构造面；字段级型零消费者 → Record 面） */
  capabilities: Record<string, unknown>
  initializationOptions?: unknown
  workspaceFolders?: Array<{ uri: string; name: string }>
}

export type InitializeResult = {
  capabilities: ServerCapabilities
  serverInfo?: { name: string; version?: string }
}

/** LSP 诊断（severity 1=Error 2=Warning 3=Information 4=Hint）。 */
export type LSPDiagnostic = {
  range: Range
  message: string
  severity?: 1 | 2 | 3 | 4
  code?: string | number
  codeDescription?: { href: string }
  source?: string
  tags?: number[]
  relatedInformation?: Array<{ location: Location; message: string }>
  data?: unknown
}

export type PublishDiagnosticsParams = {
  uri: string
  diagnostics: LSPDiagnostic[]
  version?: number
}

// ── 诊断投递型（旧 diagnosticTracking 逐字，delta ③）──

export interface Diagnostic {
  message: string
  severity: 'Error' | 'Warning' | 'Info' | 'Hint'
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  source?: string
  code?: string
}

export interface DiagnosticFile {
  uri: string
  diagnostics: Diagnostic[]
}
