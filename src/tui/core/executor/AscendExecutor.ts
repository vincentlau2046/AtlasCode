/**
 * AscendExecutor — wraps the CANN toolchain (bisheng / npu-smi / msprof)
 * behind the unified Executor and NpuToolchain interfaces.
 *
 * P4-1 (2026-09-13): Inlined execa call — no longer delegates to cannRunner.ts.
 * Mock path is a fast return; real path shells out via execa with reject:false
 * to match the legacy runCannCommand behaviour (behavioural zero-change).
 *
 * Design baseline: docs/05-Executor模块设计.md §4.1 / §十二 P4-1
 */

import { execa } from 'execa'
import { ExecError } from './types.js'
import type {
  AscendConfig,
  ExecOptions,
  ExecResult,
  Executor,
} from './types.js'
import {
  DefaultAscendMockPort,
  type AscendMockPort,
} from './AscendMockPort.js'
import { argSigFromArgs, resolveFixture } from './ascendMockFixtures.js'
import type { NpuToolchain } from './toolchain.js'

// ============================================================================
// AscendExecutor
// ============================================================================

export class AscendExecutor implements Executor, NpuToolchain {
  /** Toolchain identifier — P3-5: NpuToolchain interface. */
  readonly name = 'cann' as const

  /**
   * Semantic-key → binary-name mapping.
   * Used by skill prompts via {{toolchain.commands.<key>}} placeholders.
   */
  readonly commands = {
    compile: 'bisheng',
    profile: 'msprof',
    info: 'npu-smi',
    collect: 'npucollect.sh',
    decode: 'msaicerr.py',
    profile_analysis: 'ada-pa',
    benchmark: 'ais_bench',
    profile_parse: 'msprof',
    convert: 'atc',
    optimize: 'auto_optimizer',
    infer: 'msame',
    data_prep: 'img2bin.py',
    accuracy: 'msquickcmp',
  } as const

  constructor(private readonly config: AscendConfig) {}

  // ----- Executor interface ------------------------------------------------

  async exec(
    command: string,
    args: string[],
    opts?: ExecOptions,
  ): Promise<ExecResult> {
    // mock gate: opts.mock has priority over the global config.mock.
    const shouldMock = opts?.mock ?? this.config.mock

    if (shouldMock) {
      return this.mockExec(command, args)
    }

    const startMs = Date.now()

    // Build reserved env — CANN_PKG_VER is not exposed in opts.env so
    // the caller cannot override it (strategy A: reserved env merged last).
    const reserved = this.reservedEnv()
    const mergedEnv = opts?.env
      ? { ...opts.env, ...reserved }
      : { ...reserved }

    // P4-1: Inline the execa call (was delegated to cannRunner.ts).
    // reject:false preserves the legacy behaviour — non-zero exit
    // resolves with exitCode/stderr instead of throwing.
    const execaOpts: Record<string, unknown> = {
      reject: false,
      timeout: opts?.timeoutMs ?? 120_000,
      env: Object.assign({}, process.env, mergedEnv),
    }
    if (opts?.cwd) execaOpts.cwd = opts.cwd
    if (opts?.signal) execaOpts.signal = opts.signal

    let raw: { exitCode?: number; stdout?: unknown; stderr?: unknown }
    try {
      raw = await execa(command, args, execaOpts as any)
    } catch (err: any) {
      // execa may throw on spawn failure (ENOENT) even with reject:false.
      const durationMs = Date.now() - startMs
      const result: ExecResult = {
        exitCode: err?.exitCode ?? null,
        signal: null,
        stdout: '',
        stderr: err?.shortMessage ?? String(err),
        durationMs,
        timedOut: false,
        ok: false,
      }
      throw new ExecError(
        'UNKNOWN',
        `CANN command failed [${command}]: ${err?.shortMessage ?? String(err)}`,
        result,
        err instanceof Error ? err : undefined,
      )
    }

    const durationMs = Date.now() - startMs
    const exitCode: number | null = raw.exitCode ?? null
    const result: ExecResult = {
      exitCode,
      signal: null,
      stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
      stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
      durationMs,
      timedOut: false,                 // P2 known gap: P4-1 preserves zero-change
      ok: (exitCode ?? 1) === 0,
    }

    if (!result.ok) {
      throw new ExecError(
        'NON_ZERO',
        `CANN command failed [${command}]: exit ${exitCode}`,
        result,
      )
    }

    return result
  }

  isAvailable(_command: string): boolean {
    // Keeping the current stub (always true).  A real `which`-based probe
    // can be layered in later without changing the interface.
    return true
  }

  availableCommands(): string[] {
    // Derived from the commands map so the list never drifts from the keys.
    return Object.values(this.commands)
  }

  // ----- Public helpers ----------------------------------------------------

  // P3-2: Mock-decision port — replaces direct process.env reads.
  // Default adapter (assigned at class-load time) delegates to process.env.
  // Call AscendExecutor.setMockPort() at the composition root to swap.
  private static _mockPort: AscendMockPort = new DefaultAscendMockPort()

  static setMockPort(port: AscendMockPort): void {
    AscendExecutor._mockPort = port
  }

  /**
   * Shared mock-decision logic.
   * Extracted from the three Bridge tools (CompilerBridge, GoldenTest,
   * RealHWBridge) where it was duplicated inline.
   *
   * Rules (in precedence order):
   *   1. ATLAS_ASCEND_MOCK=1 → force mock
   *   2. Non-interactive session AND ATLAS_MOCK_ON_NONINTERACTIVE≠0 → auto-mock
   *   3. Otherwise → real execution
   */
  static shouldMock(opts?: {
    isNonInteractiveSession?: boolean
  }): boolean {
    if (AscendExecutor._mockPort.getAscendMockFlag() === '1') return true
    if (
      opts?.isNonInteractiveSession === true &&
      AscendExecutor._mockPort.getMockOnNonInteractiveFlag() !== '0'
    ) {
      return true
    }
    return false
  }

  /**
   * Instance shouldMock — delegates to the static method.
   * Satisfies the NpuToolchain interface (P3-5).
   */
  shouldMock(opts?: { isNonInteractiveSession?: boolean }): boolean {
    return AscendExecutor.shouldMock(opts)
  }

  // ----- NpuToolchain interface (P3-5) --------------------------------------

  /** Reserved CANN environment — not overwritable by callers (strategy A). */
  reservedEnv(): Record<string, string> {
    return {
      CANN_PKG_VER: this.config.cannVersion,
    }
  }

  // ----- Private -----------------------------------------------------------

  /**
   * Mock path — fixture replay for the fixture-backed tools (CompilerBridge
   * build, GoldenTest test, and the Phase 2a debug CLIs msaicerr/ada-pa/
   * npucollect), legacy [mock] placeholder for everything else (npu-smi/msprof).
   *
   * Fixture replay replaces the tautological "always exit 0" mock so L2
   * correctness tests can exercise error paths non-tautologically (the mock
   * now returns realistic non-zero exit + stderr for oom/mismatch scenarios).
   * Scenario is selected by ATLAS_ASCEND_MOCK_SCENARIO (default 'happy') via
   * the mock port; lookup falls back to <argSig>_happy then to the legacy
   * placeholder. See ascendMockFixtures.ts.
   */
  private async mockExec(command: string, args: string[]): Promise<ExecResult> {
    const scenario = AscendExecutor._mockPort.getMockScenario()
    const fx = resolveFixture(argSigFromArgs(args, command), scenario)
    if (fx) {
      return {
        exitCode: fx.exitCode,
        signal: null,
        stdout: fx.stdout,
        stderr: fx.stderr,
        durationMs: fx.durationMs,
        timedOut: false,
        ok: fx.exitCode === 0,
      }
    }
    // Legacy fallback: npu-smi / msprof / unmapped commands (always exit 0).
    return {
      exitCode: 0,
      signal: null,
      stdout: `[mock] ${command} ${args.join(' ')}`,
      stderr: '',
      durationMs: 0,
      timedOut: false,
      ok: true,
    }
  }
}