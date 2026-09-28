/**
 * engine/tools/lsp — LSPTool 本体（§8.67 D 波 S-E2c；旧仓
 * src/tools/LSPTool/LSPTool.ts 860L 裁剪随迁；依赖闭包 = LSP 域
 * `src/lsp/`（client 域 9 文件 2464L + 配置注入窗 + manager 单例）
 * 本波 S-E2c 域落盘，旧仓「LSP servers = plugins only」裁定保留 =
 * 真配置源经 setLspServerSource 注入窗由插件域 LSP 集成波注册）。
 *
 * 旧仓来源：LSPTool.ts 860L（call 4 接缝链 = 初始化等待 / manager 取
 * 10MB 守卫 + didOpen / 9 操作 method 映射 + 2 步 call-hierarchy /
 * git-ignore 过滤 / 9 支 formatResult + count 面）+ UI.tsx 字符串面 +
 * prompt.ts（DESCRIPTION 落 ./lspPrompt，LSP_TOOL_NAME seed 落
 * toolNames 块）。消费方 = `lsp/` 子门面 + `tools/` 门面 re-export +
 * 注册表 ⑬ 槽（ENABLE_LSP_TOOL 门裁 → isEnabled 自门控）组合根
 * baseTools 注入位（S-E2d 回填）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体
 * 逐字；复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema =
 *    纯 JSON schema 对象（LSP_TOOL_INPUT_SCHEMA，旧 zod regular
 *    strictObject 4 字段逐字段转写；zod 判别联合留 ./lspSchemas，
 *    唯一消费 = validateInput 码 3）；旧 zod outputSchema（z.infer 推
 *    Output 型）→ TS 型 LSPToolOutput 承载文档面（引擎侧无 wire
 *    outputSchema 消费者，S-B5 delta ① 先例）。
 *  ② 旧 vscode-languageserver-types wire 型 import（3-dep 违规面，新仓
 *    依赖面 = diff/openai/proper-lockfile/shell-quote/zod 五枚）→ lsp
 *    域本地转写型（lsp/types.ts delta ②，经 lsp 域门面引入）。
 *  ③ 旧 execFileNoThrowWithCwd（execa 3-dep 违规面）→ 本地
 *    gitCheckIgnore（node:child_process.execFile promisified；
 *    exit 0 = 至少一 ignored / 1 = 无 / 128 = 非 git 仓，仅 exit-0
 *    stdout 面消费 = 旧 preserveOutputOnError: false 语义逐字；
 *    batch 50 / timeout 5000 逐字；错误支全 no-op）。
 *  ④ 旧 uniq（utils/array lodash 族）→ 本地 [...new Set(...)]
 *    （3-dep 去 lodash 面，memory/paths 同例先例）。
 *  ⑤ 旧 ENABLE_LSP_TOOL 门（feature('ENABLE_LSP_TOOL')）裁 →
 *    isEnabled = isLspConnected() 自门控承载（断连态 = false，LSP 域
 *    manager 4 态面；⑨ HISTORY_SNIP 门裁先例同型 = 门裁登记非新增
 *    门，注册表 ⑬ 槽 materialize）；LSP server 配置源 = 插件域 LSP
 *    集成波经 setLspServerSource 注入窗注册（前向接缝，lsp 域
 *    lspConfig delta ①）。
 *  ⑥ 旧 prompt() 成员（与 description 重复）不在新 Tool 契约 → 裁
 *    （S-B5 delta ③ 先例，description 唯一 prompt 面 = LSP_DESCRIPTION
 *    旧 DESCRIPTION 逐字）。
 *  ⑦ 旧 (loc as any).uri 防御 cast → 本地 LocationLike 收窄 cast
 *    （新本地 wire 型 uri 必填更严，运行时缺 URI 观测面语义保留，
 *    零 any；countUniqueFiles 3 支 any cast 随之去）。
 *  ⑧ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/
 *    onProgress 旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；
 *    checkPermissions context duck = LspToolUseContext（窄 TPC 切片，
 *    SkillToolCheckContext 同型先例）。
 *  ⑨ renderToolUseMessage = 字符串面逐字随迁（旧 UI.tsx 非 React
 *    模板，位置 4 操作 symbol 上下文 + 非位置操作 file 面；
 *    renderToolUseErrorMessage / renderToolResultMessage React JSX →
 *    TUI 波裁）；userFacingName 'LSP'（旧 UI.tsx L160 逐字）；
 *    toAutoClassifierInput = input.operation（新契约面，auto-mode
 *    分类器族消费，S-B5 delta ④ 同型）。
 *  ⑩ getSymbolAtPosition → 同域 ./lspSymbolContext；getDisplayPath →
 *    ../files（跨工具子域 import house 先例 = files 叶子子域，
 *    S-C4 同型）；expandPath 旧 1 参（utils/cwd 模块态）→ 新 shared
 *    2 参 expandPath(path, getCwd())（S-C1 签名适配先例），getCwd →
 *    bootstrap 门面。
 *
 * 残留守（防「以为已全」）：UI React 渲染面 = 残留守（TUI 波）；
 * 组合根 baseTools 注册位 = S-E2d 回填；LSP server 真配置源 =
 * 插件域 LSP 集成波（setLspServerSource 注入窗，前向接缝登记）。
 */
import { execFile } from 'child_process'
import { open } from 'fs/promises'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { promisify } from 'util'

import {
  getInitializationStatus,
  getLspServerManager,
  isLspConnected,
  waitForInitialization,
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type DocumentSymbol,
  type Hover,
  type Location,
  type LocationLink,
  type SymbolInformation,
} from '../../../lsp'
import type {
  PermissionDecision,
  Tool,
  ToolInputJSONSchema,
  ToolPermissionContext,
  ToolResult,
  ToolResultBlockParam,
  ValidationResult,
} from '../../../shared'
import {
  expandPath,
  getFsImplementation,
  isENOENT,
  logError,
  logForDebugging,
  toError,
} from '../../../shared'
import { checkReadPermissionForTool } from '../../../permissions'
import { getCwd } from '../../../bootstrap'
import { LSP_TOOL_NAME } from '../toolNames'
import { getDisplayPath } from '../files'
import {
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult,
} from './lspFormatters'
import { LSP_DESCRIPTION } from './lspPrompt'
import { lspToolInputSchema, type LSPToolInput } from './lspSchemas'
import { getSymbolAtPosition } from './lspSymbolContext'

const MAX_LSP_FILE_SIZE_BYTES = 10_000_000
const execFileAsync = promisify(execFile)

/**
 * 输入 JSON schema（旧仓 zod inputSchema regular strictObject 逐字段
 * 转写，delta ①；zod 判别联合 = validateInput 唯一消费面，见
 * ./lspSchemas）。
 */
export const LSP_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: [
        'goToDefinition',
        'findReferences',
        'hover',
        'documentSymbol',
        'workspaceSymbol',
        'goToImplementation',
        'prepareCallHierarchy',
        'incomingCalls',
        'outgoingCalls',
      ],
      description: 'The LSP operation to perform',
    },
    filePath: {
      type: 'string',
      description: 'The absolute or relative path to the file',
    },
    line: {
      type: 'number',
      description: 'The line number (1-based, as shown in editors)',
    },
    character: {
      type: 'number',
      description: 'The character offset (1-based, as shown in editors)',
    },
  },
  required: ['operation', 'filePath', 'line', 'character'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type LSPToolOutput = {
  /** The LSP operation that was performed */
  operation: LSPToolInput['operation']
  /** The formatted result of the LSP operation */
  result: string
  /** The file path the operation was performed on */
  filePath: string
  /** Number of results (definitions, references, symbols) */
  resultCount?: number
  /** Number of files containing results */
  fileCount?: number
}

/**
 * checkPermissions 上下文 duck（旧 context.getAppState() 面；窄 TPC
 * 切片，SkillToolCheckContext 同型先例；真 ToolUseContext 全字段面 =
 * 残留守）。
 */
type LspToolUseContext = {
  getAppState: () => { toolPermissionContext: ToolPermissionContext }
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// S-B5 BashTool 先例）；face 扩型 = getPath（PermissionTool duck 成员，
// excess-property 面显式声明）+ checkPermissions 返回型收窄 Promise<
// PermissionDecision>（契约位 Promise<unknown> 不满足 PermissionTool
// 目标型 Promise<PermissionResult>，扩型收窄 = checkReadPermissionForTool
// 直接传值免 cast，GlobToolFace 先例）。
type LSPToolFace = Tool & {
  getPath(input: Record<string, unknown>): string
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision>
}

/**
 * 运行时缺 URI 防御面（delta ⑦：新本地 wire 型 uri 必填更严，旧
 * (loc as any).uri 语义经收窄 cast 保留，零 any）。
 */
type LocationLike = { uri?: string }

export const LSPTool: LSPToolFace = {
  name: LSP_TOOL_NAME,
  inputSchema: LSP_TOOL_INPUT_SCHEMA,
  inputJSONSchema: LSP_TOOL_INPUT_SCHEMA,
  searchHint: 'code intelligence (definitions, references, symbols, hover)',
  maxResultSizeChars: 100_000,
  isLsp: true,
  shouldDefer: true,
  // delta ⑤：旧 ENABLE_LSP_TOOL 门裁 → 自门控承载（断连态 = false）
  isEnabled: () => isLspConnected(),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  toAutoClassifierInput: (input: unknown) => (input as LSPToolInput).operation,
  // delta ⑨：旧 UI.tsx L160 逐字 'LSP'
  userFacingName: () => 'LSP',
  getPath(input: Record<string, unknown>): string {
    const { filePath } = input as unknown as LSPToolInput
    return expandPath(filePath, getCwd())
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const parsed = input as LSPToolInput
    // First validate against the discriminated union for better type safety
    const parseResult = lspToolInputSchema().safeParse(input)
    if (!parseResult.success) {
      return {
        result: false,
        message: `Invalid input: ${parseResult.error.message}`,
        errorCode: 3,
      }
    }

    // Validate file exists and is a regular file
    const fs = getFsImplementation()
    const absolutePath = expandPath(parsed.filePath, getCwd())

    // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
    if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
      return { result: true }
    }

    let stats
    try {
      stats = await fs.stat(absolutePath)
    } catch (error) {
      if (isENOENT(error)) {
        return {
          result: false,
          message: `File does not exist: ${parsed.filePath}`,
          errorCode: 1,
        }
      }
      const err = toError(error)
      // Log filesystem access errors for tracking
      logError(
        new Error(
          `Failed to access file stats for LSP operation on ${parsed.filePath}: ${err.message}`,
        ),
      )
      return {
        result: false,
        message: `Cannot access file: ${parsed.filePath}. ${err.message}`,
        errorCode: 4,
      }
    }

    if (!stats.isFile()) {
      return {
        result: false,
        message: `Path is not a file: ${parsed.filePath}`,
        errorCode: 2,
      }
    }

    return { result: true }
  },
  // delta ⑧：checkPermissions 2 参声明（context duck = LspToolUseContext）
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision> {
    const appState = (context as LspToolUseContext).getAppState()
    return checkReadPermissionForTool(
      LSPTool,
      input as Record<string, unknown>,
      appState.toolPermissionContext,
    )
  },
  // delta ⑥：description 唯一 prompt 面（旧 DESCRIPTION 逐字）
  description: async () => LSP_DESCRIPTION,
  // delta ⑨：字符串面逐字（旧 UI.tsx 非 React 模板；React 面 TUI 波）
  renderToolUseMessage(
    input: unknown,
    options: { verbose: boolean },
  ): unknown {
    const { operation, filePath, line, character } = input as Partial<
      LSPToolInput
    >
    if (!operation) {
      return null
    }
    const parts: string[] = []

    // For position-based operations (goToDefinition, findReferences, hover, goToImplementation),
    // show the symbol at the position for better context
    if (
      (operation === 'goToDefinition' ||
        operation === 'findReferences' ||
        operation === 'hover' ||
        operation === 'goToImplementation') &&
      filePath &&
      line !== undefined &&
      character !== undefined
    ) {
      // Convert from 1-based (user input) to 0-based (internal file reading)
      const symbol = getSymbolAtPosition(filePath, line - 1, character - 1)
      const displayPath = options.verbose ? filePath : getDisplayPath(filePath)
      if (symbol) {
        parts.push(`operation: "${operation}"`)
        parts.push(`symbol: "${symbol}"`)
        parts.push(`in: "${displayPath}"`)
      } else {
        parts.push(`operation: "${operation}"`)
        parts.push(`file: "${displayPath}"`)
        parts.push(`position: ${line}:${character}`)
      }
      return parts.join(', ')
    }

    // For other operations (documentSymbol, workspaceSymbol),
    // show operation and file without position details
    parts.push(`operation: "${operation}"`)
    if (filePath) {
      const displayPath = options.verbose ? filePath : getDisplayPath(filePath)
      parts.push(`file: "${displayPath}"`)
    }
    return parts.join(', ')
  },
  mapToolResultToToolResultBlockParam(
    output: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const c = output as LSPToolOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: c.result,
    }
  },
  // delta ⑧：call 2 参声明（旧 canUseTool/_parentMessage/onProgress 不消费）
  async call(args: unknown): Promise<ToolResult<LSPToolOutput>> {
    const input = (args ?? {}) as LSPToolInput
    const absolutePath = expandPath(input.filePath, getCwd())
    const cwd = getCwd()

    // Wait for initialization if it's still pending
    // This prevents returning "no server available" before init completes
    const status = getInitializationStatus()
    if (status.status === 'pending') {
      await waitForInitialization()
    }

    // Get the LSP server manager
    const manager = getLspServerManager()
    if (!manager) {
      // Log this system-level failure for tracking
      logError(
        new Error('LSP server manager not initialized when tool was called'),
      )

      const output: LSPToolOutput = {
        operation: input.operation,
        result:
          'LSP server manager not initialized. This may indicate a startup issue.',
        filePath: input.filePath,
      }
      return {
        data: output,
      }
    }

    // Map operation to LSP method and prepare params
    const { method, params } = getMethodAndParams(input, absolutePath)

    try {
      // Ensure file is open in LSP server before making requests
      // Most LSP servers require textDocument/didOpen before operations
      // Only read the file if it's not already open to avoid unnecessary I/O
      if (!manager.isFileOpen(absolutePath)) {
        const handle = await open(absolutePath, 'r')
        try {
          const stats = await handle.stat()
          if (stats.size > MAX_LSP_FILE_SIZE_BYTES) {
            const output: LSPToolOutput = {
              operation: input.operation,
              result: `File too large for LSP analysis (${Math.ceil(
                stats.size / 1_000_000,
              )}MB exceeds 10MB limit)`,
              filePath: input.filePath,
            }
            return { data: output }
          }
          const fileContent = await handle.readFile({ encoding: 'utf-8' })
          await manager.openFile(absolutePath, fileContent)
        } finally {
          await handle.close()
        }
      }

      // Send request to LSP server
      let result = await manager.sendRequest(absolutePath, method, params)

      if (result === undefined) {
        // Log for diagnostic purposes - helps track usage patterns and potential bugs
        logForDebugging(
          `No LSP server available for file type ${path.extname(absolutePath)} for operation ${input.operation} on file ${input.filePath}`,
        )

        const output: LSPToolOutput = {
          operation: input.operation,
          result: `No LSP server available for file type: ${path.extname(absolutePath)}`,
          filePath: input.filePath,
        }
        return {
          data: output,
        }
      }

      // For incomingCalls and outgoingCalls, we need a two-step process:
      // 1. First get CallHierarchyItem(s) from prepareCallHierarchy
      // 2. Then request the actual calls using that item
      if (
        input.operation === 'incomingCalls' ||
        input.operation === 'outgoingCalls'
      ) {
        const callItems = result as CallHierarchyItem[]
        if (!callItems || callItems.length === 0) {
          const output: LSPToolOutput = {
            operation: input.operation,
            result: 'No call hierarchy item found at this position',
            filePath: input.filePath,
            resultCount: 0,
            fileCount: 0,
          }
          return { data: output }
        }

        // Use the first call hierarchy item to request calls
        const callMethod =
          input.operation === 'incomingCalls'
            ? 'callHierarchy/incomingCalls'
            : 'callHierarchy/outgoingCalls'

        result = await manager.sendRequest(absolutePath, callMethod, {
          item: callItems[0],
        })

        if (result === undefined) {
          logForDebugging(
            `LSP server returned undefined for ${callMethod} on ${input.filePath}`,
          )
          // Continue to formatter which will handle empty/null gracefully
        }
      }

      // Filter out gitignored files from location-based results
      if (
        result &&
        Array.isArray(result) &&
        (input.operation === 'findReferences' ||
          input.operation === 'goToDefinition' ||
          input.operation === 'goToImplementation' ||
          input.operation === 'workspaceSymbol')
      ) {
        if (input.operation === 'workspaceSymbol') {
          // SymbolInformation has location.uri — filter by extracting locations
          const symbols = result as SymbolInformation[]
          const locations = symbols
            .filter(s => s?.location?.uri)
            .map(s => s.location)
          const filteredLocations = await filterGitIgnoredLocations(
            locations,
            cwd,
          )
          const filteredUris = new Set(filteredLocations.map(l => l.uri))
          result = symbols.filter(
            s => !s?.location?.uri || filteredUris.has(s.location.uri),
          )
        } else {
          // Location[] or (Location | LocationLink)[]
          const locations = (result as (Location | LocationLink)[]).map(
            toLocation,
          )
          const filteredLocations = await filterGitIgnoredLocations(
            locations,
            cwd,
          )
          const filteredUris = new Set(filteredLocations.map(l => l.uri))
          result = (result as (Location | LocationLink)[]).filter(item => {
            const loc = toLocation(item) as LocationLike
            return !loc.uri || filteredUris.has(loc.uri)
          })
        }
      }

      // Format the result based on operation type
      const { formatted, resultCount, fileCount } = formatResult(
        input.operation,
        result,
        cwd,
      )

      const output: LSPToolOutput = {
        operation: input.operation,
        result: formatted,
        filePath: input.filePath,
        resultCount,
        fileCount,
      }

      return {
        data: output,
      }
    } catch (error) {
      const err = toError(error)
      const errorMessage = err.message

      // Log error for tracking
      logError(
        new Error(
          `LSP tool request failed for ${input.operation} on ${input.filePath}: ${errorMessage}`,
        ),
      )

      const output: LSPToolOutput = {
        operation: input.operation,
        result: `Error performing ${input.operation}: ${errorMessage}`,
        filePath: input.filePath,
      }
      return {
        data: output,
      }
    }
  },
}

/**
 * Maps LSPTool operation to LSP method and params
 */
function getMethodAndParams(
  input: LSPToolInput,
  absolutePath: string,
): { method: string; params: unknown } {
  const uri = pathToFileURL(absolutePath).href
  // Convert from 1-based (user-friendly) to 0-based (LSP protocol)
  const position = {
    line: input.line - 1,
    character: input.character - 1,
  }

  switch (input.operation) {
    case 'goToDefinition':
      return {
        method: 'textDocument/definition',
        params: {
          textDocument: { uri },
          position,
        },
      }
    case 'findReferences':
      return {
        method: 'textDocument/references',
        params: {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true },
        },
      }
    case 'hover':
      return {
        method: 'textDocument/hover',
        params: {
          textDocument: { uri },
          position,
        },
      }
    case 'documentSymbol':
      return {
        method: 'textDocument/documentSymbol',
        params: {
          textDocument: { uri },
        },
      }
    case 'workspaceSymbol':
      return {
        method: 'workspace/symbol',
        params: {
          query: '', // Empty query returns all symbols
        },
      }
    case 'goToImplementation':
      return {
        method: 'textDocument/implementation',
        params: {
          textDocument: { uri },
          position,
        },
      }
    case 'prepareCallHierarchy':
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      }
    case 'incomingCalls':
      // For incoming/outgoing calls, we first need to prepare the call hierarchy
      // The LSP server will return CallHierarchyItem(s) that we pass to the calls request
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      }
    case 'outgoingCalls':
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      }
  }
}

/**
 * Counts the total number of symbols including nested children
 */
function countSymbols(symbols: DocumentSymbol[]): number {
  let count = symbols.length
  for (const symbol of symbols) {
    if (symbol.children && symbol.children.length > 0) {
      count += countSymbols(symbol.children)
    }
  }
  return count
}

/**
 * Counts unique files from an array of locations
 */
function countUniqueFiles(locations: Location[]): number {
  // delta ⑦：旧 (loc as any).uri → 本地 wire 型直接取（uri 必填）
  return new Set(locations.map(loc => loc.uri)).size
}

/**
 * Extracts a file path from a file:// URI, decoding percent-encoded characters.
 */
function uriToFilePath(uri: string): string {
  let filePath = uri.replace(/^file:\/\//, '')
  // On Windows, file:///C:/path becomes /C:/path — strip the leading slash
  if (/^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1)
  }
  try {
    filePath = decodeURIComponent(filePath)
  } catch {
    // Use un-decoded path if malformed
  }
  return filePath
}

/**
 * 旧 execFileNoThrowWithCwd('git', ['check-ignore', ...paths], { cwd,
 * preserveOutputOnError: false, timeout: 5_000 }) 本地转写（delta ③：
 * 旧 execa 3-dep 违规面 → node:child_process.execFile；exit 0 = 至少
 * 一 path ignored / 1 = 无 / 128 = 非 git 仓，仅 exit-0 stdout 面消费
 * = 旧 preserveOutputOnError: false 语义逐字，错误支全 no-op 空集）。
 */
async function gitCheckIgnore(
  cwd: string,
  paths: string[],
): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['check-ignore', ...paths],
      { cwd, timeout: 5_000 },
    )
    const ignored = new Set<string>()
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) {
        ignored.add(trimmed)
      }
    }
    return ignored
  } catch {
    // exit 1（无 ignore）/ 128（非 git 仓）/ git 缺失 / 超时 → no-op
    return new Set()
  }
}

/**
 * Filters out locations whose file paths are gitignored.
 * Uses `git check-ignore` with batched path arguments for efficiency.
 */
async function filterGitIgnoredLocations<T extends Location>(
  locations: T[],
  cwd: string,
): Promise<T[]> {
  if (locations.length === 0) {
    return locations
  }

  // Collect unique file paths from URIs（delta ⑦：LocationLike 收窄 cast
  // 保留运行时缺 URI 观测面）
  const uriToPath = new Map<string, string>()
  for (const loc of locations) {
    const uri = (loc as LocationLike).uri
    if (uri && !uriToPath.has(uri)) {
      uriToPath.set(uri, uriToFilePath(uri))
    }
  }

  // delta ④：旧 uniq → 本地 Set 去重
  const uniquePaths = [...new Set(uriToPath.values())]
  if (uniquePaths.length === 0) {
    return locations
  }

  // Batch check paths with git check-ignore
  // Exit code 0 = at least one path is ignored, 1 = none ignored, 128 = not a git repo
  const ignoredPaths = new Set<string>()
  const BATCH_SIZE = 50
  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE)
    const batchIgnored = await gitCheckIgnore(cwd, batch)
    for (const p of batchIgnored) {
      ignoredPaths.add(p)
    }
  }

  if (ignoredPaths.size === 0) {
    return locations
  }

  return locations.filter(loc => {
    const filePath = uriToPath.get((loc as LocationLike).uri ?? '')
    return !filePath || !ignoredPaths.has(filePath)
  })
}

/**
 * Checks if item is LocationLink (has targetUri) vs Location (has uri)
 */
function isLocationLink(item: Location | LocationLink): item is LocationLink {
  return 'targetUri' in item
}

/**
 * Converts LocationLink to Location format for uniform handling
 */
function toLocation(item: Location | LocationLink): Location {
  if (isLocationLink(item)) {
    return {
      uri: item.targetUri,
      range: item.targetSelectionRange || item.targetRange,
    }
  }
  return item
}

/**
 * Formats LSP result based on operation type and extracts summary counts
 */
function formatResult(
  operation: LSPToolInput['operation'],
  result: unknown,
  cwd: string,
): { formatted: string; resultCount: number; fileCount: number } {
  switch (operation) {
    case 'goToDefinition': {
      // Handle both Location and LocationLink formats
      const rawResults = Array.isArray(result)
        ? result
        : result
          ? [result as Location | LocationLink]
          : []

      // Convert LocationLinks to Locations for uniform handling
      const locations = rawResults.map(toLocation)

      // Log and filter out locations with undefined uris（delta ⑦）
      const invalidLocations = locations.filter(
        loc => !loc || !(loc as LocationLike).uri,
      )
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToDefinition on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        )
      }

      const validLocations = locations.filter(
        loc => loc && (loc as LocationLike).uri,
      )
      return {
        formatted: formatGoToDefinitionResult(
          result as
            | Location
            | Location[]
            | LocationLink
            | LocationLink[]
            | null,
          cwd,
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      }
    }
    case 'findReferences': {
      const locations = (result as Location[]) || []

      // Log and filter out locations with undefined uris（delta ⑦）
      const invalidLocations = locations.filter(
        loc => !loc || !(loc as LocationLike).uri,
      )
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for findReferences on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        )
      }

      const validLocations = locations.filter(
        loc => loc && (loc as LocationLike).uri,
      )
      return {
        formatted: formatFindReferencesResult(
          result as Location[] | null,
          cwd,
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      }
    }
    case 'hover': {
      return {
        formatted: formatHoverResult(result as Hover | null, cwd),
        resultCount: result ? 1 : 0,
        fileCount: result ? 1 : 0,
      }
    }
    case 'documentSymbol': {
      // LSP allows documentSymbol to return either DocumentSymbol[] or SymbolInformation[]
      const symbols =
        (result as (DocumentSymbol | SymbolInformation)[]) || []
      // Detect format: DocumentSymbol has 'range', SymbolInformation has 'location'
      const isDocumentSymbol =
        symbols.length > 0 && symbols[0] && 'range' in symbols[0]
      // Count symbols - DocumentSymbol can have nested children, SymbolInformation is flat
      const count = isDocumentSymbol
        ? countSymbols(symbols as DocumentSymbol[])
        : symbols.length
      return {
        formatted: formatDocumentSymbolResult(
          result as (DocumentSymbol[] | SymbolInformation[]) | null,
          cwd,
        ),
        resultCount: count,
        fileCount: symbols.length > 0 ? 1 : 0,
      }
    }
    case 'workspaceSymbol': {
      const symbols = (result as SymbolInformation[]) || []

      // Log and filter out symbols with undefined location.uri（delta ⑦）
      const invalidSymbols = symbols.filter(
        sym => !sym || !sym.location || !sym.location.uri,
      )
      if (invalidSymbols.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidSymbols.length} symbol(s) with undefined location URI for workspaceSymbol on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        )
      }

      const validSymbols = symbols.filter(
        sym => sym && sym.location && sym.location.uri,
      )
      const locations = validSymbols.map(s => s.location)
      return {
        formatted: formatWorkspaceSymbolResult(
          result as SymbolInformation[] | null,
          cwd,
        ),
        resultCount: validSymbols.length,
        fileCount: countUniqueFiles(locations),
      }
    }
    case 'goToImplementation': {
      // Handle both Location and LocationLink formats (same as goToDefinition)
      const rawResults = Array.isArray(result)
        ? result
        : result
          ? [result as Location | LocationLink]
          : []

      // Convert LocationLinks to Locations for uniform handling
      const locations = rawResults.map(toLocation)

      // Log and filter out locations with undefined uris（delta ⑦）
      const invalidLocations = locations.filter(
        loc => !loc || !(loc as LocationLike).uri,
      )
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToImplementation on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        )
      }

      const validLocations = locations.filter(
        loc => loc && (loc as LocationLike).uri,
      )
      return {
        // Reuse goToDefinition formatter since the result format is identical
        formatted: formatGoToDefinitionResult(
          result as
            | Location
            | Location[]
            | LocationLink
            | LocationLink[]
            | null,
          cwd,
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      }
    }
    case 'prepareCallHierarchy': {
      const items = (result as CallHierarchyItem[]) || []
      return {
        formatted: formatPrepareCallHierarchyResult(
          result as CallHierarchyItem[] | null,
          cwd,
        ),
        resultCount: items.length,
        fileCount: items.length > 0 ? countUniqueFilesFromCallItems(items) : 0,
      }
    }
    case 'incomingCalls': {
      const calls = (result as CallHierarchyIncomingCall[]) || []
      return {
        formatted: formatIncomingCallsResult(
          result as CallHierarchyIncomingCall[] | null,
          cwd,
        ),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromIncomingCalls(calls) : 0,
      }
    }
    case 'outgoingCalls': {
      const calls = (result as CallHierarchyOutgoingCall[]) || []
      return {
        formatted: formatOutgoingCallsResult(
          result as CallHierarchyOutgoingCall[] | null,
          cwd,
        ),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromOutgoingCalls(calls) : 0,
      }
    }
  }
}

/**
 * Counts unique files from CallHierarchyItem array
 * Filters out items with undefined URIs
 */
function countUniqueFilesFromCallItems(items: CallHierarchyItem[]): number {
  // delta ⑦：本地 wire 型 uri 必填，any cast 去（.filter(uri => uri)
  // 运行时防御面保留）
  const validUris = items.map(item => item.uri).filter(uri => uri)
  return new Set(validUris).size
}

/**
 * Counts unique files from CallHierarchyIncomingCall array
 * Filters out calls with undefined URIs
 */
function countUniqueFilesFromIncomingCalls(
  calls: CallHierarchyIncomingCall[],
): number {
  const validUris = calls.map(call => call.from?.uri).filter(uri => uri)
  return new Set(validUris).size
}

/**
 * Counts unique files from CallHierarchyOutgoingCall array
 * Filters out calls with undefined URIs
 */
function countUniqueFilesFromOutgoingCalls(
  calls: CallHierarchyOutgoingCall[],
): number {
  const validUris = calls.map(call => call.to?.uri).filter(uri => uri)
  return new Set(validUris).size
}
