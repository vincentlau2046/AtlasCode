/**
 * session 域 — session memory 提取阈值状态机（E-7 S-7d d1，§8.49 详案
 * item 8；旧 services/SessionMemory/sessionMemoryUtils.ts 203L 逐字随迁）
 *
 * 留面（逐字核）：EXTRACTION_WAIT_TIMEOUT_MS=15000 / EXTRACTION_STALE_
 * THRESHOLD_MS=60000 / SessionMemoryConfig 三阈值（10000/5000/3）+
 * DEFAULT / 5 状态变量（sessionMemoryConfig / lastSummarizedMessageId /
 * extractionStartedAt / tokensAtLastExtraction / sessionMemoryInitialized）
 * + 全 getter/setter 族 + waitForSessionMemoryExtraction（stale 1min 短路 +
 * 15s 超时 + 1s 轮询）+ hasMetInitializationThreshold（>= 语义）+
 * hasMetUpdateThreshold（自上次提取增长 >= 语义）+ resetSessionMemoryState。
 *
 * 解耦/裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - getSessionMemoryContent 的 fs I/O（旧 getFsImplementation().readFile
 *    + getSessionMemoryPath + isFsInaccessible→null 语义）→ SessionMemoryPort
 *    注入窗口（ports/sessionMemory.ts，Port 5）：engine 拥有状态机，shell
 *    实现文件 I/O（路径解析 + isFsInaccessible→null + 原子写），compose
 *    注入。零消费者 = 前向登记（E-wave-end 接线）。
 *   - 未注 port 时 getSessionMemoryContent 诚实降级返回 null（非假通过：
 *    内容不可得即 null，调用方按「无 session memory」处理）。
 *   - sleep 域内小工具（旧 utils/sleep.ts，scheduler 先例）。
 */
import type { SessionMemoryPort } from '../ports/sessionMemory'

const EXTRACTION_WAIT_TIMEOUT_MS = 15000
const EXTRACTION_STALE_THRESHOLD_MS = 60000 // 1 minute

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Configuration for session memory extraction thresholds
 */
export type SessionMemoryConfig = {
  /** Minimum context window tokens before initializing session memory.
   * Uses the same token counting as autocompact (input + output + cache tokens)
   * to ensure consistent behavior between the two features. */
  minimumMessageTokensToInit: number
  /** Minimum context window growth (in tokens) between session memory updates.
   * Uses the same token counting as autocompact (tokenCountWithEstimation)
   * to measure actual context growth, not cumulative API usage. */
  minimumTokensBetweenUpdate: number
  /** Number of tool calls between session memory updates */
  toolCallsBetweenUpdates: number
}

// Default configuration values
export const DEFAULT_SESSION_MEMORY_CONFIG: SessionMemoryConfig = {
  minimumMessageTokensToInit: 10000,
  minimumTokensBetweenUpdate: 5000,
  toolCallsBetweenUpdates: 3,
}

// Current session memory configuration
let sessionMemoryConfig: SessionMemoryConfig = {
  ...DEFAULT_SESSION_MEMORY_CONFIG,
}

// Track the last summarized message ID (shared state)
let lastSummarizedMessageId: string | undefined

// Track extraction state with timestamp (set by sessionMemory.ts)
let extractionStartedAt: number | undefined

// Track context size at last memory extraction (for minimumTokensBetweenUpdate)
let tokensAtLastExtraction = 0

// Track whether session memory has been initialized (met minimumMessageTokensToInit)
let sessionMemoryInitialized = false

/**
 * Get the message ID up to which the session memory is current
 */
export function getLastSummarizedMessageId(): string | undefined {
  return lastSummarizedMessageId
}

/**
 * Set the last summarized message ID (called from sessionMemory.ts)
 */
export function setLastSummarizedMessageId(
  messageId: string | undefined,
): void {
  lastSummarizedMessageId = messageId
}

/**
 * Mark extraction as started (called from sessionMemory.ts)
 */
export function markExtractionStarted(): void {
  extractionStartedAt = Date.now()
}

/**
 * Mark extraction as completed (called from sessionMemory.ts)
 */
export function markExtractionCompleted(): void {
  extractionStartedAt = undefined
}

/**
 * Wait for any in-progress session memory extraction to complete (with 15s
 * timeout). Returns immediately if no extraction is in progress or if
 * extraction is stale (>1min old).
 */
export async function waitForSessionMemoryExtraction(): Promise<void> {
  const startTime = Date.now()
  while (extractionStartedAt) {
    const extractionAge = Date.now() - extractionStartedAt
    if (extractionAge > EXTRACTION_STALE_THRESHOLD_MS) {
      // Extraction is stale, don't wait
      return
    }

    if (Date.now() - startTime > EXTRACTION_WAIT_TIMEOUT_MS) {
      // Timeout - continue anyway
      return
    }

    await sleep(1000)
  }
}

// ── SessionMemoryPort 注入窗口（Port 5；compose 注入 shell 实现）──────────
let _sessionMemoryPort: SessionMemoryPort | null = null

export function setSessionMemoryPort(port: SessionMemoryPort): void {
  _sessionMemoryPort = port
}

export function getSessionMemoryPort(): SessionMemoryPort | null {
  return _sessionMemoryPort
}

/**
 * Get the current session memory content（旧 getSessionMemoryContent 语义：
 * 文件不可得（不存在/不可访问）→ null；经 port 委托，I/O 面归 shell）
 */
export async function getSessionMemoryContent(): Promise<string | null> {
  if (!_sessionMemoryPort) return null
  return _sessionMemoryPort.load()
}

/**
 * Set the session memory configuration
 */
export function setSessionMemoryConfig(
  config: Partial<SessionMemoryConfig>,
): void {
  sessionMemoryConfig = {
    ...sessionMemoryConfig,
    ...config,
  }
}

/**
 * Get the current session memory configuration
 */
export function getSessionMemoryConfig(): SessionMemoryConfig {
  return { ...sessionMemoryConfig }
}

/**
 * Record the context size at the time of extraction.
 * Used to measure context growth for minimumTokensBetweenUpdate threshold.
 */
export function recordExtractionTokenCount(currentTokenCount: number): void {
  tokensAtLastExtraction = currentTokenCount
}

/**
 * Check if session memory has been initialized (met minimumMessageTokensToInit threshold)
 */
export function isSessionMemoryInitialized(): boolean {
  return sessionMemoryInitialized
}

/**
 * Mark session memory as initialized
 */
export function markSessionMemoryInitialized(): void {
  sessionMemoryInitialized = true
}

/**
 * Check if we've met the threshold to initialize session memory.
 * Uses total context window tokens (same as autocompact) for consistent behavior.
 */
export function hasMetInitializationThreshold(
  currentTokenCount: number,
): boolean {
  return currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit
}

/**
 * Check if we've met the threshold for the next update.
 * Measures actual context window growth since last extraction
 * (same metric as autocompact and initialization threshold).
 */
export function hasMetUpdateThreshold(currentTokenCount: number): boolean {
  const tokensSinceLastExtraction = currentTokenCount - tokensAtLastExtraction
  return (
    tokensSinceLastExtraction >= sessionMemoryConfig.minimumTokensBetweenUpdate
  )
}

/**
 * Get the configured number of tool calls between updates
 */
export function getToolCallsBetweenUpdates(): number {
  return sessionMemoryConfig.toolCallsBetweenUpdates
}

/**
 * Reset session memory state (useful for testing)
 */
export function resetSessionMemoryState(): void {
  sessionMemoryConfig = { ...DEFAULT_SESSION_MEMORY_CONFIG }
  tokensAtLastExtraction = 0
  sessionMemoryInitialized = false
  lastSummarizedMessageId = undefined
  extractionStartedAt = undefined
}
