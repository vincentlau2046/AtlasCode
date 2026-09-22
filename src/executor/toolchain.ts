/**
 * NpuToolchain — NPU 工具链统一抽象接口。
 *
 * 旧仓来源（a8af45b）: src/core/executor/toolchain.ts
 *
 * Extends the Executor interface with toolchain-specific metadata
 * (toolchain name, semantic command map) so that Skill prompts can
 * be written once with {{toolchain.commands.*}} placeholders and
 * resolved at registration time for any NPU backend.
 *
 * 设计: docs/05-Executor模块设计.md §11.4 (P3-5)
 * R3.3: commands is an open mapping — not locked to compile/profile/info keys.
 * R3.1: Skill layer uses registration-time token replacement (no runtime template engine).
 *
 * 自治：仅依赖 ./types（ExecOptions/ExecResult），零 cross-domain 耦合。
 * 消费方：ascend 域包（E 波 AscendExecutor 实现 NpuToolchain）。
 */

import type { ExecOptions, ExecResult } from "./types"

export interface NpuToolchain {
  /** Toolchain identifier for skill-placeholder resolution. */
  readonly name: string

  /** Semantic-key → binary-name mapping (e.g. { compile: 'bisheng', profile: 'msprof' }). */
  readonly commands: Readonly<Record<string, string>>

  /** Toolchain-specific reserved environment (strategy A: merged last, caller cannot override). */
  reservedEnv(): Record<string, string>

  /** Mock-decision logic (may be port-replaced via AscendMockPort, P3-2). */
  shouldMock(opts?: { isNonInteractiveSession?: boolean }): boolean

  /** Execute a command via this toolchain. */
  exec(command: string, args: string[], opts?: ExecOptions): Promise<ExecResult>

  /** Whether a binary from this toolchain is available. */
  isAvailable(command: string): boolean

  /** List of known toolchain commands. */
  availableCommands(): string[]
}

// ============================================================================
// Skill-prompt token replacement helper (R3.1, registration-time)
// ============================================================================

/**
 * Replace {{toolchain.commands.<key>}} placeholders in a skill prompt
 * string with actual binary names from the toolchain.
 *
 * Usage in bundled skill files:
 *   const resolved = applyToolchainPlaceholders(SKILL_MD, toolchain)
 *
 * This is a registration-time helper (~10 lines).  A runtime
 * template engine is deferred to P4-4 if needed.
 */
export function applyToolchainPlaceholders(
  text: string,
  toolchain: NpuToolchain,
): string {
  let result = text
  for (const [key, value] of Object.entries(toolchain.commands)) {
    result = result.replaceAll(`{{toolchain.commands.${key}}}`, value)
  }
  return result
}
