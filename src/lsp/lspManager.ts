/**
 * lsp 域 — LSP server manager 模块级单例（§8.67 D 波 S-E2c；旧仓
 * services/lsp/manager.ts 289L 逐字转写）。
 *
 * 4 态初始化状态机（not-started / pending / success / failed）+
 * generation 防陈旧 promise + isLspConnected（LSPTool.isEnabled 消费面）
 * + bare-mode 短路 + reinitialize/shutdown 生命周期面。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 utils/envUtils isBareMode（isEnvTruthy(ATLAS_SIMPLE) ||
 *    process.argv.includes('--bare')，argv 直查 = cli.ts 顶层 keychain 预取
 *    前门控面）→ 本地等价（shared isEnvTruthy 复用；域内定义 + TODO PR
 *    to shared 纪律，同 shared 值缺口先例）。
 *  ② 旧 issue #15521 注释（loadAllPlugins memoize 陈旧空插件列表 →
 *    LSP 0 server 初始化）→ 语义保留（reinitialize 消费面 = 插件刷新波
 *    前向接缝，注释改写为新仓语境）。
 */

import {
  errorMessage,
  isEnvTruthy,
  logError,
  logForDebugging,
} from '../shared'
import { createLSPServerManager, type LSPServerManager } from './lspServerManager'
import { registerLSPNotificationHandlers } from './lspPassiveFeedback'

/** delta ①：旧 isBareMode 本地等价。 */
function isBareMode(): boolean {
  return (
    isEnvTruthy(process.env.ATLAS_SIMPLE) ||
    process.argv.includes('--bare')
  )
}

/**
 * Initialization state of the LSP server manager
 */
type InitializationState = 'not-started' | 'pending' | 'success' | 'failed'

/**
 * Global singleton instance of the LSP server manager.
 * Initialized during Atlas startup.
 */
let lspManagerInstance: LSPServerManager | undefined

/**
 * Current initialization state
 */
let initializationState: InitializationState = 'not-started'

/**
 * Error from last initialization attempt, if any
 */
let initializationError: Error | undefined

/**
 * Generation counter to prevent stale initialization promises from updating state
 */
let initializationGeneration = 0

/**
 * Promise that resolves when initialization completes (success or failure)
 */
let initializationPromise: Promise<void> | undefined

/**
 * Test-only sync reset. shutdownLspServerManager() is async and tears down
 * real connections; this only clears the module-scope singleton state so
 * reinitializeLspServerManager() early-returns on 'not-started' in downstream
 * tests on the same shard.
 */
export function _resetLspManagerForTesting(): void {
  initializationState = 'not-started'
  initializationError = undefined
  initializationPromise = undefined
  initializationGeneration++
}

/**
 * Get the singleton LSP server manager instance.
 * Returns undefined if not yet initialized, initialization failed, or still pending.
 *
 * Callers should check for undefined and handle gracefully, as initialization happens
 * asynchronously during Atlas startup. Use getInitializationStatus() to
 * distinguish between pending, failed, and not-started states.
 */
export function getLspServerManager(): LSPServerManager | undefined {
  // Don't return a broken instance if initialization failed
  if (initializationState === 'failed') {
    return undefined
  }
  return lspManagerInstance
}

/**
 * Get the current initialization status of the LSP server manager.
 *
 * @returns Status object with current state and error (if failed)
 */
export function getInitializationStatus():
  | { status: 'not-started' }
  | { status: 'pending' }
  | { status: 'success' }
  | { status: 'failed'; error: Error } {
  if (initializationState === 'failed') {
    return {
      status: 'failed',
      error: initializationError || new Error('Initialization failed'),
    }
  }
  if (initializationState === 'not-started') {
    return { status: 'not-started' }
  }
  if (initializationState === 'pending') {
    return { status: 'pending' }
  }
  return { status: 'success' }
}

/**
 * Check whether at least one language server is connected and healthy.
 * Backs LSPTool.isEnabled().
 */
export function isLspConnected(): boolean {
  if (initializationState === 'failed') return false
  const manager = getLspServerManager()
  if (!manager) return false
  const servers = manager.getAllServers()
  if (servers.size === 0) return false
  for (const server of servers.values()) {
    if (server.state !== 'error') return true
  }
  return false
}

/**
 * Wait for LSP server manager initialization to complete.
 *
 * Returns immediately if initialization has already completed (success or failure).
 * If initialization is pending, waits for it to complete.
 * If initialization hasn't started, returns immediately.
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function waitForInitialization(): Promise<void> {
  // If already initialized or failed, return immediately
  if (initializationState === 'success' || initializationState === 'failed') {
    return
  }

  // If pending and we have a promise, wait for it
  if (initializationState === 'pending' && initializationPromise) {
    await initializationPromise
  }

  // If not started, return immediately (nothing to wait for)
}

/**
 * Initialize the LSP server manager singleton.
 *
 * This function is called during Atlas startup. It synchronously creates
 * the manager instance, then starts async initialization (loading LSP configs)
 * in the background without blocking the startup process.
 *
 * Safe to call multiple times - will only initialize once (idempotent).
 * However, if initialization previously failed, calling again will retry.
 */
export function initializeLspServerManager(): void {
  // --bare / SIMPLE: no LSP. LSP is for editor integration (diagnostics,
  // hover, go-to-def in the REPL). Scripted -p calls have no use for it.
  if (isBareMode()) {
    return
  }
  logForDebugging('[LSP MANAGER] initializeLspServerManager() called')

  // Skip if already initialized or currently initializing
  if (lspManagerInstance !== undefined && initializationState !== 'failed') {
    logForDebugging(
      '[LSP MANAGER] Already initialized or initializing, skipping',
    )
    return
  }

  // Reset state for retry if previous initialization failed
  if (initializationState === 'failed') {
    lspManagerInstance = undefined
    initializationError = undefined
  }

  // Create the manager instance and mark as pending
  lspManagerInstance = createLSPServerManager()
  initializationState = 'pending'
  logForDebugging('[LSP MANAGER] Created manager instance, state=pending')

  // Increment generation to invalidate any pending initializations
  const currentGeneration = ++initializationGeneration
  logForDebugging(
    `[LSP MANAGER] Starting async initialization (generation ${currentGeneration})`,
  )

  // Start initialization asynchronously without blocking
  // Store the promise so callers can await it via waitForInitialization()
  initializationPromise = lspManagerInstance
    .initialize()
    .then(() => {
      // Only update state if this is still the current initialization
      if (currentGeneration === initializationGeneration) {
        initializationState = 'success'
        logForDebugging('LSP server manager initialized successfully')

        // Register passive notification handlers for diagnostics
        if (lspManagerInstance) {
          registerLSPNotificationHandlers(lspManagerInstance)
        }
      }
    })
    .catch((error: unknown) => {
      // Only update state if this is still the current initialization
      if (currentGeneration === initializationGeneration) {
        initializationState = 'failed'
        initializationError = error as Error
        // Clear the instance since it's not usable
        lspManagerInstance = undefined

        logError(error as Error)
        logForDebugging(
          `Failed to initialize LSP server manager: ${errorMessage(error)}`,
        )
      }
    })
}

/**
 * Force re-initialization of the LSP server manager, even after a prior
 * successful init. Called after plugin caches are cleared, so newly-loaded
 * plugin LSP servers are picked up（delta ②：旧 issue #15521 语境 —
 * loadAllPlugins memoize 可早于市场调和缓存空插件列表，LSP 曾因此以 0
 * server 初始化；插件刷新波注册调用位 = 前向接缝）。
 *
 * Safe to call when no LSP plugins changed: initialize() is just config
 * parsing (servers are lazy-started on first use). Also safe during pending
 * init: the generation counter invalidates the in-flight promise.
 */
export function reinitializeLspServerManager(): void {
  if (initializationState === 'not-started') {
    // initializeLspServerManager() was never called (e.g. headless subcommand
    // path). Don't start it now.
    return
  }

  logForDebugging('[LSP MANAGER] reinitializeLspServerManager() called')

  // Best-effort shutdown of any running servers on the old instance so
  // /reload-plugins doesn't leak child processes. Fire-and-forget: the
  // primary use case has 0 servers so this is usually a no-op.
  if (lspManagerInstance) {
    void lspManagerInstance.shutdown().catch(err => {
      logForDebugging(
        `[LSP MANAGER] old instance shutdown during reinit failed: ${errorMessage(err)}`,
      )
    })
  }

  // Force the idempotence check in initializeLspServerManager() to fall
  // through. Generation counter handles invalidating any in-flight init.
  lspManagerInstance = undefined
  initializationState = 'not-started'
  initializationError = undefined

  initializeLspServerManager()
}

/**
 * Shutdown the LSP server manager and clean up resources.
 *
 * This should be called during Atlas shutdown. Stops all running LSP servers
 * and clears internal state. Safe to call when not initialized (no-op).
 *
 * NOTE: Errors during shutdown are logged for monitoring but NOT propagated to the caller.
 * State is always cleared even if shutdown fails, to prevent resource accumulation.
 * This is acceptable during application exit when recovery is not possible.
 *
 * @returns Promise that resolves when shutdown completes (errors are swallowed)
 */
export async function shutdownLspServerManager(): Promise<void> {
  if (lspManagerInstance === undefined) {
    return
  }

  try {
    await lspManagerInstance.shutdown()
    logForDebugging('LSP server manager shut down successfully')
  } catch (error: unknown) {
    logError(error as Error)
    logForDebugging(
      `Failed to shutdown LSP server manager: ${errorMessage(error)}`,
    )
  } finally {
    // Always clear state even if shutdown failed
    lspManagerInstance = undefined
    initializationState = 'not-started'
    initializationError = undefined
    initializationPromise = undefined
    // Increment generation to invalidate any pending initializations
    initializationGeneration++
  }
}
