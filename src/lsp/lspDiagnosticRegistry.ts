/**
 * lsp 域 — LSP 诊断待投递登记簿（§8.67 D 波 S-E2c；旧仓
 * services/lsp/LSPDiagnosticRegistry.ts 386L 逐字转写）。
 *
 * LSP server 经 textDocument/publishDiagnostics 异步到达的诊断 →
 * register 待投递 → checkForLSPDiagnostics 批量取（去重 + 严重度排序 +
 * 限量 10/文件 · 30/总 + 跨轮 LRU 去重 500 文件）→ 投递消费方
 * （消息/TUI 波 attachment 投递面 = 前向接缝）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lru-cache 依赖（LRUCache max:500）→ 本地 LRU（Map 插入序 +
 *    刷新近用，消费面 = get/has/set/delete/clear/size 六枚逐字等价；
 *    3-dep 违规面本地转写）。
 *  ② 旧 utils/slowOperations jsonStringify（慢操作观测包装）→
 *    JSON.stringify（语义等价；观测包装面随依赖面裁）。
 *  ③ 旧 diagnosticTracking.ts DiagnosticFile → types.ts 转写（delta ③）。
 *  ④ 投递消费方（旧 getLSPDiagnosticAttachments → getAttachments
 *    自动投递）= 消息/TUI 波前向接缝（本波只落登记簿 + 取出面，
 *    消费侧 0 命中登记）。
 */

import { randomUUID } from 'crypto'

import { logError, logForDebugging, toError } from '../shared'
import type { DiagnosticFile } from './types'

/**
 * Pending LSP diagnostic notification
 */
export type PendingLSPDiagnostic = {
  /** Server that sent the diagnostic */
  serverName: string
  /** Diagnostic files */
  files: DiagnosticFile[]
  /** When diagnostic was received */
  timestamp: number
  /** Whether attachment was already sent to conversation */
  attachmentSent: boolean
}

/**
 * LSP Diagnostic Registry
 *
 * Stores LSP diagnostics received asynchronously from LSP servers via
 * textDocument/publishDiagnostics notifications. Follows the same pattern
 * as AsyncHookRegistry for consistent async attachment delivery.
 *
 * Pattern:
 * 1. LSP server sends publishDiagnostics notification
 * 2. registerPendingLSPDiagnostic() stores diagnostic
 * 3. checkForLSPDiagnostics() retrieves pending diagnostics
 * 4. getLSPDiagnosticAttachments() converts to Attachment[]（delta ④ 前向接缝）
 * 5. getAttachments() delivers to conversation automatically（delta ④）
 */

// delta ①：旧 lru-cache → 本地 LRU（Map 插入序 + 近用刷新）
class LocalLRU<K, V> {
  private map = new Map<K, V>()

  constructor(private max: number) {}

  get size(): number {
    return this.map.size
  }

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    // Refresh recency（Map 保插入序 → 删后重插 = 移到末尾）
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) {
        this.map.delete(oldest)
      }
    }
    this.map.set(key, value)
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

// delta ②：旧 jsonStringify 慢操作包装 → JSON.stringify 等价
function jsonStringify(value: unknown): string {
  return JSON.stringify(value)
}

// Volume limiting constants
const MAX_DIAGNOSTICS_PER_FILE = 10
const MAX_TOTAL_DIAGNOSTICS = 30

// Max files to track for deduplication - prevents unbounded memory growth
const MAX_DELIVERED_FILES = 500

// Global registry state
const pendingDiagnostics = new Map<string, PendingLSPDiagnostic>()

// Cross-turn deduplication: tracks diagnostics that have been delivered
// Maps file URI to a set of diagnostic keys (hash of message+severity+range)
// Using LRU to prevent unbounded growth in long sessions（delta ①）
const deliveredDiagnostics = new LocalLRU<string, Set<string>>(
  MAX_DELIVERED_FILES,
)

/**
 * Register LSP diagnostics received from a server.
 * These will be delivered as attachments in the next query.
 *
 * @param serverName - Name of LSP server that sent diagnostics
 * @param files - Diagnostic files to deliver
 */
export function registerPendingLSPDiagnostic({
  serverName,
  files,
}: {
  serverName: string
  files: DiagnosticFile[]
}): void {
  // Use UUID for guaranteed uniqueness (handles rapid registrations)
  const diagnosticId = randomUUID()

  logForDebugging(
    `LSP Diagnostics: Registering ${files.length} diagnostic file(s) from ${serverName} (ID: ${diagnosticId})`,
  )

  pendingDiagnostics.set(diagnosticId, {
    serverName,
    files,
    timestamp: Date.now(),
    attachmentSent: false,
  })
}

/**
 * Maps severity string to numeric value for sorting.
 * Error=1, Warning=2, Info=3, Hint=4
 */
function severityToNumber(severity: string | undefined): number {
  switch (severity) {
    case 'Error':
      return 1
    case 'Warning':
      return 2
    case 'Info':
      return 3
    case 'Hint':
      return 4
    default:
      return 4
  }
}

/**
 * Creates a unique key for a diagnostic based on its content.
 * Used for both within-batch and cross-turn deduplication.
 */
function createDiagnosticKey(diag: {
  message: string
  severity?: string
  range?: unknown
  source?: string
  code?: unknown
}): string {
  return jsonStringify({
    message: diag.message,
    severity: diag.severity,
    range: diag.range,
    source: diag.source || null,
    code: diag.code || null,
  })
}

/**
 * Deduplicates diagnostics by file URI and diagnostic content.
 * Also filters out diagnostics that were already delivered in previous turns.
 * Two diagnostics are considered duplicates if they have the same:
 * - File URI
 * - Range (start/end line and character)
 * - Message
 * - Severity
 * - Source and code (if present)
 */
function deduplicateDiagnosticFiles(
  allFiles: DiagnosticFile[],
): DiagnosticFile[] {
  // Group diagnostics by file URI
  const fileMap = new Map<string, Set<string>>()
  const dedupedFiles: DiagnosticFile[] = []

  for (const file of allFiles) {
    if (!fileMap.has(file.uri)) {
      fileMap.set(file.uri, new Set())
      dedupedFiles.push({ uri: file.uri, diagnostics: [] })
    }

    const seenDiagnostics = fileMap.get(file.uri)!
    const dedupedFile = dedupedFiles.find(f => f.uri === file.uri)!

    // Get previously delivered diagnostics for this file (for cross-turn dedup)
    const previouslyDelivered = deliveredDiagnostics.get(file.uri) || new Set()

    for (const diag of file.diagnostics) {
      try {
        const key = createDiagnosticKey(diag)

        // Skip if already seen in this batch OR already delivered in previous turns
        if (seenDiagnostics.has(key) || previouslyDelivered.has(key)) {
          continue
        }

        seenDiagnostics.add(key)
        dedupedFile.diagnostics.push(diag)
      } catch (error: unknown) {
        const err = toError(error)
        const truncatedMessage =
          diag.message?.substring(0, 100) || '<no message>'
        logError(
          new Error(
            `Failed to deduplicate diagnostic in ${file.uri}: ${err.message}. ` +
              `Diagnostic message: ${truncatedMessage}`,
          ),
        )
        // Include the diagnostic anyway to avoid losing information
        dedupedFile.diagnostics.push(diag)
      }
    }
  }

  // Filter out files with no diagnostics after deduplication
  return dedupedFiles.filter(f => f.diagnostics.length > 0)
}

/**
 * Get all pending LSP diagnostics that haven't been delivered yet.
 * Deduplicates diagnostics to prevent sending the same diagnostic multiple times.
 * Marks diagnostics as sent to prevent duplicate delivery.
 *
 * @returns Array of pending diagnostics ready for delivery (deduplicated)
 */
export function checkForLSPDiagnostics(): Array<{
  serverName: string
  files: DiagnosticFile[]
}> {
  logForDebugging(
    `LSP Diagnostics: Checking registry - ${pendingDiagnostics.size} pending`,
  )

  // Collect all diagnostic files from all pending notifications
  const allFiles: DiagnosticFile[] = []
  const serverNames = new Set<string>()
  const diagnosticsToMark: PendingLSPDiagnostic[] = []

  for (const diagnostic of pendingDiagnostics.values()) {
    if (!diagnostic.attachmentSent) {
      allFiles.push(...diagnostic.files)
      serverNames.add(diagnostic.serverName)
      diagnosticsToMark.push(diagnostic)
    }
  }

  if (allFiles.length === 0) {
    return []
  }

  // Deduplicate diagnostics across all files
  let dedupedFiles: DiagnosticFile[]
  try {
    dedupedFiles = deduplicateDiagnosticFiles(allFiles)
  } catch (error: unknown) {
    const err = toError(error)
    logError(
      new Error(`Failed to deduplicate LSP diagnostics: ${err.message}`),
    )
    // Fall back to undedup'd files to avoid losing diagnostics
    dedupedFiles = allFiles
  }

  // Only mark as sent AFTER successful deduplication, then delete from map.
  // Entries are tracked in deliveredDiagnostics LRU for dedup, so we don't
  // need to keep them in pendingDiagnostics after delivery.
  for (const diagnostic of diagnosticsToMark) {
    diagnostic.attachmentSent = true
  }
  for (const [id, diagnostic] of pendingDiagnostics) {
    if (diagnostic.attachmentSent) {
      pendingDiagnostics.delete(id)
    }
  }

  const originalCount = allFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0,
  )
  const dedupedCount = dedupedFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0,
  )

  if (originalCount > dedupedCount) {
    logForDebugging(
      `LSP Diagnostics: Deduplication removed ${originalCount - dedupedCount} duplicate diagnostic(s)`,
    )
  }

  // Apply volume limiting: cap per file and total
  let totalDiagnostics = 0
  let truncatedCount = 0
  for (const file of dedupedFiles) {
    // Sort by severity (Error=1 < Warning=2 < Info=3 < Hint=4) to prioritize errors
    file.diagnostics.sort(
      (a, b) => severityToNumber(a.severity) - severityToNumber(b.severity),
    )

    // Cap per file
    if (file.diagnostics.length > MAX_DIAGNOSTICS_PER_FILE) {
      truncatedCount += file.diagnostics.length - MAX_DIAGNOSTICS_PER_FILE
      file.diagnostics = file.diagnostics.slice(0, MAX_DIAGNOSTICS_PER_FILE)
    }

    // Cap total
    const remainingCapacity = MAX_TOTAL_DIAGNOSTICS - totalDiagnostics
    if (file.diagnostics.length > remainingCapacity) {
      truncatedCount += file.diagnostics.length - remainingCapacity
      file.diagnostics = file.diagnostics.slice(0, remainingCapacity)
    }

    totalDiagnostics += file.diagnostics.length
  }

  // Filter out files that ended up with no diagnostics after limiting
  dedupedFiles = dedupedFiles.filter(f => f.diagnostics.length > 0)

  if (truncatedCount > 0) {
    logForDebugging(
      `LSP Diagnostics: Volume limiting removed ${truncatedCount} diagnostic(s) (max ${MAX_DIAGNOSTICS_PER_FILE}/file, ${MAX_TOTAL_DIAGNOSTICS} total)`,
    )
  }

  // Track delivered diagnostics for cross-turn deduplication
  for (const file of dedupedFiles) {
    if (!deliveredDiagnostics.has(file.uri)) {
      deliveredDiagnostics.set(file.uri, new Set())
    }
    const delivered = deliveredDiagnostics.get(file.uri)!
    for (const diag of file.diagnostics) {
      try {
        delivered.add(createDiagnosticKey(diag))
      } catch (error: unknown) {
        // Log but continue - failure to track shouldn't prevent delivery
        const err = toError(error)
        const truncatedMessage =
          diag.message?.substring(0, 100) || '<no message>'
        logError(
          new Error(
            `Failed to track delivered diagnostic in ${file.uri}: ${err.message}. ` +
              `Diagnostic message: ${truncatedMessage}`,
          ),
        )
      }
    }
  }

  const finalCount = dedupedFiles.reduce(
    (sum, f) => sum + f.diagnostics.length,
    0,
  )

  // Return empty if no diagnostics to deliver (all filtered by deduplication)
  if (finalCount === 0) {
    logForDebugging(
      `LSP Diagnostics: No new diagnostics to deliver (all filtered by deduplication)`,
    )
    return []
  }

  logForDebugging(
    `LSP Diagnostics: Delivering ${dedupedFiles.length} file(s) with ${finalCount} diagnostic(s) from ${serverNames.size} server(s)`,
  )

  // Return single result with all deduplicated diagnostics
  return [
    {
      serverName: Array.from(serverNames).join(', '),
      files: dedupedFiles,
    },
  ]
}

/**
 * Clear all pending diagnostics.
 * Used during cleanup/shutdown or for testing.
 * Note: Does NOT clear deliveredDiagnostics - that's for cross-turn deduplication
 * and should only be cleared when files are edited or on session reset.
 */
export function clearAllLSPDiagnostics(): void {
  logForDebugging(
    `LSP Diagnostics: Clearing ${pendingDiagnostics.size} pending diagnostic(s)`,
  )
  pendingDiagnostics.clear()
}

/**
 * Reset all diagnostic state including cross-turn tracking.
 * Used on session reset or for testing.
 */
export function resetAllLSPDiagnosticState(): void {
  logForDebugging(
    `LSP Diagnostics: Resetting all state (${pendingDiagnostics.size} pending, ${deliveredDiagnostics.size} files tracked)`,
  )
  pendingDiagnostics.clear()
  deliveredDiagnostics.clear()
}

/**
 * Clear delivered diagnostics for a specific file.
 * Should be called when a file is edited so that new diagnostics for that file
 * will be shown even if they match previously delivered ones.
 *
 * @param fileUri - URI of the file that was edited
 */
export function clearDeliveredDiagnosticsForFile(fileUri: string): void {
  if (deliveredDiagnostics.has(fileUri)) {
    logForDebugging(
      `LSP Diagnostics: Clearing delivered diagnostics for ${fileUri}`,
    )
    deliveredDiagnostics.delete(fileUri)
  }
}

/**
 * Get count of pending diagnostics (for monitoring)
 */
export function getPendingLSPDiagnosticCount(): number {
  return pendingDiagnostics.size
}
