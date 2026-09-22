/**
 * sandbox/sandbox-events.ts — standardized violation event bus（B 波 S1 迁入）。
 *
 * 旧仓来源（a8af45b）: src/core/sandbox/sandbox-events.ts
 *
 * Decouples sandbox-violation notifications from the backend internals.
 * Web GUI and other subscribers import this port without touching
 * SandboxManager or the backend closure.
 *
 * Protocol:
 *   sandboxBackend ──emit()──▶ SandboxEventBus ──subscribe()──▶ WebGUI / analytics / ...
 *
 * SandboxManager.getSandboxViolationStore() is UNCHANGED — this is an
 * additive port for external subscribers.
 *
 * 自治：零 import（纯类型 + 自包含 ring-buffer 实现）。
 */

// ============================================================================
// ViolationEvent — standardized, strongly-typed (not the vendor's `any`)
// ============================================================================

export type ViolationCategory =
  | "fs:read"
  | "fs:write"
  | "network:connect"
  | "network:listen"
  | "command"
  | "other"

export interface ViolationEvent {
  /** Category for filtering/subscription. */
  category: ViolationCategory

  /** File path for fs violations. */
  path?: string

  /** Network hostname:port for network violations. */
  host?: string

  /** Command string for command violations. */
  command?: string

  /** Human-readable description (suitable for UI). */
  message: string

  /** Unix-ms timestamp of the violation. */
  timestamp: number
}

// ============================================================================
// SandboxEventBus — subscribe / emit / inspect
// ============================================================================

export interface SandboxEventBus {
  /**
   * Subscribe to all violation events.
   * @returns unsubscribe function.
   */
  onViolation(listener: (event: ViolationEvent) => void): () => void

  /**
   * Emit a violation event (called by the sandbox backend).
   * Listeners are called synchronously; exceptions are caught and swallowed
   * so one broken listener never breaks others.
   */
  emitViolation(event: ViolationEvent): void

  /** Total violation count since creation. */
  getTotalViolationCount(): number

  /** Clear the recent-violations buffer (does NOT reset the count). */
  clear(): void
}

// ============================================================================
// DefaultSandboxEventBus — ring-buffer implementation
// ============================================================================

export class DefaultSandboxEventBus implements SandboxEventBus {
  private readonly _listeners = new Set<(event: ViolationEvent) => void>()
  private _totalCount = 0
  private readonly _recent: ViolationEvent[] = []
  private readonly _maxRecent: number

  constructor(maxRecent = 256) {
    this._maxRecent = maxRecent
  }

  onViolation(listener: (event: ViolationEvent) => void): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  emitViolation(event: ViolationEvent): void {
    this._totalCount++
    this._recent.push(event)
    if (this._recent.length > this._maxRecent) {
      this._recent.splice(0, this._recent.length - this._maxRecent)
    }
    for (const listener of this._listeners) {
      try {
        listener(event)
      } catch {
        // Swallow — one broken listener must not break others
      }
    }
  }

  getTotalViolationCount(): number {
    return this._totalCount
  }

  clear(): void {
    this._recent.length = 0
  }
}
