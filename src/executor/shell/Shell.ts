/**
 * Shell — bash-only 裁剪版真核心（C-Deep 切片 1 纵切）
 *
 * 旧仓来源（a8af45b）: src/utils/Shell.ts（463 行 / 31 imports → 裁剪纵切）
 * 纵切 = spawn + 输出限 + cwd 恢复（bootstrap port）+ sandbox 包装（sandbox port）
 * + TaskOutput（task port）+ bash provider。§8.7：port 之上可 fake，port 之下
 * （spawn/fs）全真——tests/func/ smoke 验真执行链。
 *
 * 裁剪裁定（2026-09-22 调研定稿，复审勿当遗漏重提）：
 * - PowerShell provider / windows 双路径（posixPathToWindowsPath/windowsHide 语义）
 *   → 残余（国内目标 POSIX）
 * - findSuitableShell：ATLAS_SHELL 覆盖 + /bin/bash|/usr/bin/bash 探针；
 *   旧 which 多目录探测依赖 bun:bundle bunWhich（不可测）→ 裁剪，SHELL env 探测归残余
 * - subprocessEnv 安全 scrub（GHA 密钥剥离 / CCR 代理注入）→ 残余（env 直用 process.env）
 * - ShellSnapshot / session env / tmux 隔离 / hooks cwd-changed watcher /
 *   invalidateSessionEnvCache → 残余（hooks 域切片 3）
 * - getAtlasTempDirName（permissions 域切片 3）→ 临时用 tmpdir()/atlas-sandbox-<uid>
 * - memoize getShellConfig → 每次 exec 现查（accessSync 廉价；memoize 归残余）
 * - pwd() 初值（旧仓 ALS 覆盖 ?? _cwdState）→ bootstrap port getCwd()
 *   （ALS 并发覆盖层归 engine 域，不进端口，C2-F3 裁定）
 * - CLAUDECODE 标记 env → ATLAS_CODE（内部命名规范：机器标识 atlas 系）
 */
import { execFileSync, spawn } from 'child_process'
import type { FileHandle } from 'fs/promises'
import { accessSync, constants as fsConstants } from 'fs'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join, resolve } from 'path'

import {
  errorMessage,
  getFsImplementation,
  isENOENT,
  logForDebugging,
} from '../../shared'
import { getBootstrapStatePort } from '../ports/bootstrapState'
import { getExecutorSandboxPort } from '../ports/sandbox'
import { getTaskOutputPort } from '../ports/taskOutput'
import {
  createAbortedCommand,
  createFailedCommand,
  generateLocalTaskId,
  wrapSpawn,
  type ExecResult,
  type ShellCommand,
} from './ShellCommand'
import { createBashShellProvider } from './shellProvider'

const DEFAULT_TIMEOUT = 30 * 60 * 1000 // 30 分钟

export type { ExecResult, ShellCommand } from './ShellCommand'

function isExecutable(shellPath: string): boolean {
  try {
    accessSync(shellPath, fsConstants.X_OK)
    return true
  } catch (_err) {
    // Nix 等环境 X_OK 检查可能失败的兜底：--version 试跑（1s 超时）
    try {
      execFileSync(shellPath, ['--version'], {
        timeout: 1000,
        stdio: 'ignore',
      })
      return true
    } catch {
      return false
    }
  }
}

/**
 * 决定可用的 shell（裁剪版：ATLAS_SHELL 覆盖 + 固定候选探针）。
 * 残余：SHELL env 偏好排序 + which 多目录探测（bun:bundle 不可测）。
 */
export function findSuitableShell(): string {
  const shellOverride = process.env.ATLAS_SHELL
  if (
    shellOverride &&
    (shellOverride.includes('bash') || shellOverride.includes('zsh'))
  ) {
    if (isExecutable(shellOverride)) {
      logForDebugging(`Using shell override: ${shellOverride}`)
      return shellOverride
    }
    logForDebugging(
      `ATLAS_SHELL="${shellOverride}" is not a valid bash/zsh path, falling back to detection`,
    )
  }

  for (const candidate of ['/bin/bash', '/usr/bin/bash']) {
    if (isExecutable(candidate)) {
      return candidate
    }
  }

  const errorMsg =
    'No suitable shell found. AtlasCode CLI requires a Posix shell environment. ' +
    'Please ensure you have a valid shell installed.'
  logForDebugging(errorMsg)
  throw new Error(errorMsg)
}

export type ExecOptions = {
  timeout?: number
  onProgress?: (
    lastLines: string,
    allLines: string,
    totalLines: number,
    totalBytes: number,
    isIncomplete: boolean,
  ) => void
  preventCwdChanges?: boolean
  shouldUseSandbox?: boolean
  /** 提供时 stdout 走 pipe（不落文件），每个 data chunk 触发此回调 */
  onStdout?: (data: string) => void
}

/**
 * 执行 shell 命令（bash-only 裁剪版）。
 * 每条命令新建一个 shell 进程。三端口 fail-fast（未注入即抛，C2 裁定）。
 */
export async function exec(
  command: string,
  abortSignal: AbortSignal,
  options?: ExecOptions,
): Promise<ShellCommand> {
  const {
    timeout,
    onProgress,
    preventCwdChanges,
    shouldUseSandbox,
    onStdout,
  } = options ?? {}
  const commandTimeout = timeout || DEFAULT_TIMEOUT

  const bootstrap = getBootstrapStatePort()
  const sandboxPort = getExecutorSandboxPort()
  const provider = createBashShellProvider(findSuitableShell())
  const binShell = provider.shellPath

  const id = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0')
  const useSandbox = shouldUseSandbox === true && sandboxPort.isSandboxingEnabled()

  // 沙箱临时目录（残余：getAtlasTempDirName per-user 目录属 permissions 域切片 3，
  // 此处按 uid 命名防多用户权限冲突）
  const sandboxTmpDir = useSandbox
    ? join(process.env.ATLAS_TMPDIR || tmpdir(), `atlas-sandbox-${process.getuid?.() ?? 'agent'}`)
    : undefined

  const { commandString: builtCommand, cwdFilePath } =
    await provider.buildExecCommand(command, {
      id,
      sandboxTmpDir,
      useSandbox,
    })
  let commandString = builtCommand

  // 初值 cwd（旧仓 pwd() = ALS 覆盖 ?? _cwdState；ALS 层归 engine 域不进门面）
  let cwd = bootstrap.getCwd()

  // cwd 已从磁盘消失时的恢复（命令删了自己所在目录，如临时目录清理）
  const fsOps = getFsImplementation()
  try {
    fsOps.realpathSync(cwd)
  } catch {
    const fallback = bootstrap.getOriginalCwd()
    logForDebugging(
      `Shell CWD "${cwd}" no longer exists, recovering to "${fallback}"`,
    )
    try {
      fsOps.realpathSync(fallback)
      bootstrap.setCwdState(fallback)
      cwd = fallback
    } catch {
      return createFailedCommand(
        `Working directory "${cwd}" no longer exists. Please restart AtlasCode from an existing directory.`,
      )
    }
  }

  // 已中止则根本不 spawn
  if (abortSignal.aborted) {
    return createAbortedCommand()
  }

  if (useSandbox) {
    commandString = await sandboxPort.wrapWithSandbox(
      commandString,
      binShell,
      abortSignal,
    )
    // port 之下 fs 必须真（§8.7）：沙箱临时目录 0o700
    try {
      await fsOps.mkdir(sandboxTmpDir!, { mode: 0o700 })
    } catch (error) {
      logForDebugging(`Failed to create ${sandboxTmpDir} directory: ${error}`)
    }
  }

  const envOverrides = await provider.getEnvironmentOverrides(command)

  // 提供 onStdout 时走 pipe 模式：stdout 经 StreamWrapper → TaskOutput 内存缓冲
  const usePipeMode = !!onStdout
  const taskId = generateLocalTaskId()
  const taskOutput = getTaskOutputPort().createTaskOutput(
    taskId,
    onProgress ?? null,
    !usePipeMode,
  )

  // file 模式：stdout/stderr 同落一个文件 fd。
  // POSIX 下 O_APPEND 每次写原子（seek-to-end + write），两流按时间交织无撕裂。
  // SECURITY: O_NOFOLLOW 防沙箱内符号链接跟随攻击。
  // （win32 'w' 模式分支裁剪——残余）
  let outputHandle: FileHandle | undefined
  if (!usePipeMode) {
    // port 之下 fs 必须真：输出目录就绪（旧仓 getTaskOutputDir mkdir 等价）
    await fsOps.mkdir(dirname(taskOutput.path))
    const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
    outputHandle = await fsOps.open(
      taskOutput.path,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_APPEND |
        O_NOFOLLOW,
    )
  }

  try {
    const childProcess = spawn(binShell, provider.getSpawnArgs(commandString), {
      env: {
        // 残余：subprocessEnv 安全 scrub（GHA 密钥剥离 / CCR 代理注入）
        ...process.env,
        SHELL: binShell,
        GIT_EDITOR: 'true',
        ATLAS_CODE: '1',
        ...envOverrides,
      },
      cwd,
      stdio: usePipeMode
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', outputHandle?.fd, outputHandle?.fd],
      // 不传 signal——终止由 ShellCommand 进程组 kill 自行处理
      detached: provider.detached,
      // 防 Windows 可见控制台窗口（其他平台 no-op，保留参数位）
      windowsHide: true,
    })

    const shellCommand = wrapSpawn(
      childProcess,
      abortSignal,
      commandTimeout,
      taskOutput,
    )

    // 关闭我们这份 fd——子进程有自己 dup 的。
    // 必须在 wrapSpawn 挂上 error 监听之后：await 让出窗口内子进程 ENOENT
    // 'error' 事件可能触发。独立 try/catch 防 close 失败（EIO）落到 spawn 失败
    // 的 catch 块孤儿化子进程。
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // fd 可能已被子进程关闭；安全忽略
      }
    }

    // pipe 模式：调用方回调与 StreamWrapper 并存（Node Readable 支持多个 data 监听）。
    // StreamWrapper 喂 TaskOutput 做持久化；此回调给调用方实时访问。
    if (childProcess.stdout && onStdout) {
      childProcess.stdout.on('data', (chunk: string | Buffer) => {
        onStdout(typeof chunk === 'string' ? chunk : chunk.toString())
      })
    }

    // 挂到命令 result 上的清理。
    // NOTE: readFileSync/unlinkSync 故意同步——必须在 .then() 微任务内完成，
    // 调用方 `await shellCommand.result` 后立即看到更新后的 cwd。
    // 换异步 readFile 会引入微任务边界，产生 "cwd 尚未更新" 竞态。
    void shellCommand.result.then(async result => {
      if (useSandbox) {
        sandboxPort.cleanupAfterCommand()
      }
      // 只有前台任务更新 cwd
      if (result && !preventCwdChanges && !result.backgroundTaskId) {
        try {
          const newCwd = fsOps
            .readFileSync(cwdFilePath, { encoding: 'utf8' })
            .trim()
          // cwd 为 NFC 归一（setCwdState）；`pwd -P` 在 macOS APFS 上可能 NFD。
          // 比较前归一，防 Unicode 路径每命令误判 "changed"。
          if (newCwd.normalize('NFC') !== cwd) {
            setCwd(newCwd, cwd)
            // 残余：invalidateSessionEnvCache + onCwdChangedForHooks（hooks 域切片 3）
          }
        } catch {
          // pwd 文件可能未写（命令在 pwd -P 前就失败）
        }
      }
      // 清理 cwd 跟踪用临时文件
      try {
        fsOps.unlinkSync(cwdFilePath)
      } catch {
        // 命令失败时文件可能不存在
      }
    })

    return shellCommand
  } catch (error) {
    // spawn 失败时关闭 fd（子进程从未拿到 dup）
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // 可能已关闭
      }
    }
    taskOutput.clear()

    logForDebugging(`Shell exec error: ${errorMessage(error)}`)

    return createAbortedCommand(undefined, {
      code: 126, // Unix 执行错误标准码
      stderr: errorMessage(error),
    })
  }
}

/**
 * 设置当前工作目录（经 bootstrap port 落 cwdState）。
 */
export function setCwd(path: string, relativeTo?: string): void {
  const bootstrap = getBootstrapStatePort()
  const fsOps = getFsImplementation()
  const resolved = isAbsolute(path)
    ? path
    : resolve(relativeTo || bootstrap.getCwd(), path)
  // 解析符号链接以对齐 pwd -P 行为。realpathSync 对不存在路径抛 ENOENT——
  // 转友好错误而非另做 existsSync 预检（TOCTOU）。
  let physicalPath: string
  try {
    physicalPath = fsOps.realpathSync(resolved)
  } catch (e) {
    if (isENOENT(e)) {
      throw new Error(`Path "${resolved}" does not exist`)
    }
    throw e
  }

  bootstrap.setCwdState(physicalPath)
}
