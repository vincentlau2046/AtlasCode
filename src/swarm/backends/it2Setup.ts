/**
 * iTerm2 it2 CLI 安装/验真（C 桶 ③ shell·swarm 波 S-E2c backends 族；§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/backends/it2Setup.ts（245L）逐字迁移。
 *
 * import 面重映射：
 *   - execFileNoThrow → 域内 exec（no-cwd 变体）
 *   - execFileNoThrowWithCwd → engine 根门面（worktree 子门面，cwd 显式面；
 *     域内 exec 无 cwd 选项，install 支安全语义需要 homedir() 显式 cwd）
 *   - logForDebugging / logError → shared
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - getGlobalConfig/saveGlobalConfig（旧 utils/config.js 全局配置持久化面）
 *     未落新仓（config 持久化面 = 未落/TUI 波）→ 两标志改模块内进程态
 *     （preferTmuxOverIterm2 / iterm2It2SetupComplete，进程生命周期内有效，
 *     语义 = 旧「未持久化前的运行时态」子集）：
 *       getPreferTmuxOverIterm2 = registry detectAndGetBackend 优先级 2
 *         消费（默认 false = 旧「config 缺省」逐字行为）；
 *       markIt2SetupComplete = 仅置进程内标志（持久化支裁除）。
 *     消费端 = 本进程内 setup 提示流（TUI 波）；跨进程持久化随 config 面
 *     落位后回填（登记，勿当遗漏重提）。
 */
import { homedir } from 'os'

import { execFileNoThrowWithCwd } from '../../engine'
import { logForDebugging, logError } from '../../shared'
import { execFileNoThrow } from '../exec'

/**
 * Package manager types for installing it2.
 * Listed in order of preference.
 */
export type PythonPackageManager = 'uvx' | 'pipx' | 'pip'

/**
 * Result of attempting to install it2.
 */
export type It2InstallResult = {
  success: boolean
  error?: string
  packageManager?: PythonPackageManager
}

/**
 * Result of verifying it2 setup.
 */
export type It2VerifyResult = {
  success: boolean
  error?: string
  needsPythonApiEnabled?: boolean
}

/**
 * 进程内标志（全局配置持久化面裁除登记见头注）：
 * 用户偏好 tmux over iTerm2 split panes（registry 优先级 2 消费）。
 */
let preferTmuxOverIterm2 = false

/** 进程内标志：it2 setup 已完成（防重复弹 setup 提示）。 */
let iterm2It2SetupComplete = false

/**
 * Detects which Python package manager is available on the system.
 * Checks in order of preference: uvx, pipx, pip.
 *
 * @returns The detected package manager, or null if none found
 */
export async function detectPythonPackageManager(): Promise<PythonPackageManager | null> {
  // Check uv first (preferred for isolated environments)
  // We check for 'uv' since 'uv tool install' is the install command
  const uvResult = await execFileNoThrow('which', ['uv'])
  if (uvResult.code === 0) {
    logForDebugging('[it2Setup] Found uv (will use uv tool install)')
    return 'uvx' // Keep the type name for compatibility
  }

  // Check pipx (good for isolated environments)
  const pipxResult = await execFileNoThrow('which', ['pipx'])
  if (pipxResult.code === 0) {
    logForDebugging('[it2Setup] Found pipx package manager')
    return 'pipx'
  }

  // Check pip (fallback)
  const pipResult = await execFileNoThrow('which', ['pip'])
  if (pipResult.code === 0) {
    logForDebugging('[it2Setup] Found pip package manager')
    return 'pip'
  }

  // Also check pip3
  const pip3Result = await execFileNoThrow('which', ['pip3'])
  if (pip3Result.code === 0) {
    logForDebugging('[it2Setup] Found pip3 package manager')
    return 'pip'
  }

  logForDebugging('[it2Setup] No Python package manager found')
  return null
}

/**
 * Checks if the it2 CLI tool is installed and accessible.
 *
 * 与 detection.ts isIt2CliAvailable（it2 session list 探活 + Python API
 * 可达性判定）区分：本函数 = which it2 安装性探测（旧仓两函数同名不同体，
 * 门面层 it2Setup 侧改导出名 isIt2CliInstalled 消歧，见 swarm/index.ts）。
 *
 * @returns true if it2 is available
 */
export async function isIt2CliAvailable(): Promise<boolean> {
  const result = await execFileNoThrow('which', ['it2'])
  return result.code === 0
}

/**
 * Installs the it2 CLI tool using the detected package manager.
 *
 * @param packageManager - The package manager to use for installation
 * @returns Result indicating success or failure
 */
export async function installIt2(
  packageManager: PythonPackageManager,
): Promise<It2InstallResult> {
  logForDebugging(`[it2Setup] Installing it2 using ${packageManager}`)

  // Run from home directory to avoid reading project-level pip.conf/uv.toml
  // which could be maliciously crafted to redirect to an attacker's PyPI server
  let result
  switch (packageManager) {
    case 'uvx':
      // uv tool install it2 installs it globally in isolated env
      // (uvx is for running, uv tool install is for installing)
      result = await execFileNoThrowWithCwd('uv', ['tool', 'install', 'it2'], {
        cwd: homedir(),
      })
      break
    case 'pipx':
      result = await execFileNoThrowWithCwd('pipx', ['install', 'it2'], {
        cwd: homedir(),
      })
      break
    case 'pip':
      // Use --user to install without sudo
      result = await execFileNoThrowWithCwd(
        'pip',
        ['install', '--user', 'it2'],
        { cwd: homedir() },
      )
      if (result.code !== 0) {
        // Try pip3 if pip fails
        result = await execFileNoThrowWithCwd(
          'pip3',
          ['install', '--user', 'it2'],
          { cwd: homedir() },
        )
      }
      break
  }

  if (result.code !== 0) {
    const error = result.stderr || 'Unknown installation error'
    logError(new Error(`[it2Setup] Failed to install it2: ${error}`))
    return {
      success: false,
      error,
      packageManager,
    }
  }

  logForDebugging('[it2Setup] it2 installed successfully')
  return {
    success: true,
    packageManager,
  }
}

/**
 * Verifies that it2 is properly configured and can communicate with iTerm2.
 * This tests the Python API connection by running a simple it2 command.
 *
 * @returns Result indicating success or the specific failure reason
 */
export async function verifyIt2Setup(): Promise<It2VerifyResult> {
  logForDebugging('[it2Setup] Verifying it2 setup...')

  // First check if it2 is installed
  const installed = await isIt2CliAvailable()
  if (!installed) {
    return {
      success: false,
      error: 'it2 CLI is not installed or not in PATH',
    }
  }

  // Try to list sessions - this tests the Python API connection
  const result = await execFileNoThrow('it2', ['session', 'list'])

  if (result.code !== 0) {
    const stderr = result.stderr.toLowerCase()

    // Check for common Python API errors
    if (
      stderr.includes('api') ||
      stderr.includes('python') ||
      stderr.includes('connection refused') ||
      stderr.includes('not enabled')
    ) {
      logForDebugging('[it2Setup] Python API not enabled in iTerm2')
      return {
        success: false,
        error: 'Python API not enabled in iTerm2 preferences',
        needsPythonApiEnabled: true,
      }
    }

    return {
      success: false,
      error: result.stderr || 'Failed to communicate with iTerm2',
    }
  }

  logForDebugging('[it2Setup] it2 setup verified successfully')
  return {
    success: true,
  }
}

/**
 * Returns instructions for enabling the Python API in iTerm2.
 */
export function getPythonApiInstructions(): string[] {
  return [
    'Almost done! Enable the Python API in iTerm2:',
    '',
    '  iTerm2 → Settings → General → Magic → Enable Python API',
    '',
    'After enabling, you may need to restart iTerm2.',
  ]
}

/**
 * Marks that it2 setup has been completed successfully.
 * This prevents showing the setup prompt again.
 * （持久化支裁除：仅进程内标志，登记见头注。）
 */
export function markIt2SetupComplete(): void {
  if (iterm2It2SetupComplete !== true) {
    iterm2It2SetupComplete = true
    logForDebugging('[it2Setup] Marked it2 setup as complete')
  }
}

/**
 * Marks that the user prefers to use tmux over iTerm2 split panes.
 * This prevents showing the setup prompt when in iTerm2.
 * （持久化支裁除：仅进程内标志，登记见头注。）
 */
export function setPreferTmuxOverIterm2(prefer: boolean): void {
  if (preferTmuxOverIterm2 !== prefer) {
    preferTmuxOverIterm2 = prefer
    logForDebugging(`[it2Setup] Set preferTmuxOverIterm2 = ${prefer}`)
  }
}

/**
 * Checks if the user prefers tmux over iTerm2 split panes.
 * （registry detectAndGetBackend 优先级 2 消费；默认 false = 旧 config 缺省逐字。）
 */
export function getPreferTmuxOverIterm2(): boolean {
  return preferTmuxOverIterm2 === true
}
