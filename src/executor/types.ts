/**
 * Executor types — unified execution abstraction for Shell and CANN backends.
 *
 * 旧仓来源（a8af45b）: src/core/executor/types.ts
 * 设计基线: docs/05-Executor模块设计.md
 * All exec methods are async (even mock implementations).
 * Errors go through ExecError with structured `code` fields — no status-code checks.
 *
 * 自治：无 cross-domain import（纯类型 + Error 子类，executor 域自管）。
 */

// ============================================================================
// ExecResult / ExecOptions / ExecError
// ============================================================================

/** Structured execution result. */
export interface ExecResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly timedOut: boolean
  readonly ok: boolean // exitCode === 0 && !timedOut
}

/** Execution options — all fields readonly. */
export interface ExecOptions {
  readonly cwd?: string
  readonly env?: Record<string, string>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
  readonly input?: string
  readonly onStdout?: (chunk: string) => void
  readonly onStderr?: (chunk: string) => void
  /** Mock mode: true → executor returns a fake result. */
  readonly mock?: boolean
}

/**
 * Structured execution error.
 * Uses a `code` field rather than subclassing, per the design spec.
 */
export class ExecError extends Error {
  readonly code: 'NOT_FOUND' | 'TIMEOUT' | 'SIGNAL' | 'NON_ZERO' | 'UNKNOWN'

  constructor(
    code: ExecError['code'],
    message: string,
    readonly result: ExecResult,
    readonly cause?: Error,
  ) {
    super(message)
    this.name = 'ExecError'
    this.code = code
  }
}

// ============================================================================
// Executor / BackgroundExecutor
// ============================================================================

/** Background process handle. */
export interface BackgroundHandle {
  readonly pid: number
  readonly status: 'running' | 'exited' | 'killed'
  kill(signal?: string): Promise<void>
  wait(): Promise<ExecResult>
}

/**
 * Core executor interface.
 * All command execution flows through this single abstraction.
 */
export interface Executor {
  /** Execute a command with arguments. Returns result or throws ExecError. */
  exec(command: string, args: string[], opts?: ExecOptions): Promise<ExecResult>

  /** Whether a command binary is available on $PATH. */
  isAvailable(command: string): boolean

  /** List of known-available commands (best-effort, not exhaustive). */
  availableCommands(): string[]
}

/**
 * Background executor — supports spawn + process management.
 * Only ShellExecutor implements this.
 */
export interface BackgroundExecutor extends Executor {
  spawn(
    command: string,
    args: string[],
    opts?: ExecOptions,
  ): Promise<BackgroundHandle>

  listProcesses(): BackgroundHandle[]
}

// ============================================================================
// AscendConfig
// ============================================================================

/**
 * Ascend toolchain configuration — read once at startup, immutable thereafter.
 * 旧仓在 executor/types.ts 定义但属 ascend 域包（E 波消费）；
 * 此处保留类型定义供 ascend 域 import（type-only，零运行时耦合）。
 */
export interface AscendConfig {
  readonly mock: boolean
  readonly cannVersion: string
  readonly templateVersion: string
  readonly deviceId: number
  readonly timeoutMs: number
  readonly promptEnabled: boolean
}
