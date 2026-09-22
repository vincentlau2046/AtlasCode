/**
 * ripgrep 搜索后端（裁剪版，C-Deep 切片 2）
 *
 * 旧仓来源（a8af45b）: src/utils/ripgrep.ts（673L，system/builtin/embedded
 * 三模式 + stream/fileCount/codesign/firstUseTest）。
 *
 * 裁剪裁定（2026-09-22 调研定稿，复审勿当遗漏重提）：
 * - 单模式 = system rg：新仓无 vendor/ripgrep 二进制、无 bun:bundle embedded
 *   模式（旧 builtin/embedded 两模式 + USE_BUILTIN_RIPGREP env 全裁）
 * - 安全语义保留：用命令名 "rg" 由 OS 经 $PATH 解析（旧仓注释：全路径会
 *   被恶意 ./rg 劫持）
 * - 超时源 = ATLAS_GLOB_TIMEOUT_SECONDS（与 config.ts globTimeoutSeconds
 *   同 env 同意图；未设默认 20s——旧仓 WSL 60s 特例裁，国内目标非 WSL）
 *
 * 残余清单（后续波次，复审勿当遗漏重提）：
 * ① ripGrepStream（交互增量刷行，engine 交互面）
 * ② ripGrepFileCount + countFilesRoundedRg（telemetry 消费，新仓遥测已删）
 * ③ codesignRipgrepIfNecessary（macOS 签名/隔离区）
 * ④ testRipgrepOnFirstUse + getRipgrepStatus（engine UI 状态面）
 * ⑤ 旧 findExecutable 依赖 → 裁剪为 checkRipgrep()（--version 试跑探测）
 */
import {
  execFile,
  execFileSync,
  type ChildProcess,
  type ExecFileException,
} from "child_process"
import { logForDebugging } from "../shared"

const MAX_BUFFER_SIZE = 20_000_000 // 20MB；大 monorepo 可 20 万+ 文件

/** ripgrep 配置（裁剪版单模式 = system）。 */
type RipgrepConfig = {
  mode: "system"
  command: string
  args: string[]
  argv0?: string
}

function getRipgrepConfig(): RipgrepConfig {
  // 无 builtin/embedded 可回退（旧仓 vendor 目录 + bun:bundle 均不存在于新仓）
  return { mode: "system", command: "rg", args: [] }
}

export function ripgrepCommand(): {
  rgPath: string
  rgArgs: string[]
  argv0?: string
} {
  const config = getRipgrepConfig()
  return {
    rgPath: config.command,
    rgArgs: config.args,
    argv0: config.argv0,
  }
}

/**
 * 探测系统 rg 可用性（--version 试跑，2s 超时）。
 * 功能 smoke 据此决定真查 or skip（rg 缺失按 unit 纪律 skip 不红）。
 */
export function checkRipgrep(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const out = execFileSync("rg", ["--version"], {
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      })
      resolve(out.toString().trim().startsWith("ripgrep "))
    } catch {
      resolve(false)
    }
  })
}

/**
 * 检查 stderr 是否 EAGAIN（资源临时不可用）。
 * 资源受限环境（Docker/CI）rg 线程过多时发生。
 */
function isEagainError(stderr: string): boolean {
  return (
    stderr.includes("os error 11") ||
    stderr.includes("Resource temporarily unavailable")
  )
}

/**
 * 自定义 ripgrep 超时错误——让调用方区分"无匹配"与"超时未完成"。
 */
export class RipgrepTimeoutError extends Error {
  constructor(
    message: string,
    public readonly partialResults: string[],
  ) {
    super(message)
    this.name = "RipgrepTimeoutError"
  }
}

/**
 * 原始执行（裁剪版：仅 execFile 分支；旧仓 argv0/embedded spawn 分支裁）。
 * SIGKILL 作 killSignal——SIGTERM 可能杀不掉阻塞在不可中断文件 I/O 的 rg。
 */
function ripGrepRaw(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
  callback: (
    error: ExecFileException | null,
    stdout: string,
    stderr: string,
  ) => void,
  singleThread = false,
): ChildProcess {
  const { rgPath, rgArgs } = ripgrepCommand()

  // EAGAIN 重试专用单线程模式（仅本次调用，不全局持久化）
  const threadArgs = singleThread ? ["-j", "1"] : []
  const fullArgs = [...rgArgs, ...threadArgs, ...args, target]

  const parsedSeconds =
    parseInt(process.env.ATLAS_GLOB_TIMEOUT_SECONDS || "", 10) || 0
  const timeout = parsedSeconds > 0 ? parsedSeconds * 1000 : 20_000

  return execFile(
    rgPath,
    fullArgs,
    {
      maxBuffer: MAX_BUFFER_SIZE,
      signal: abortSignal,
      timeout,
      killSignal: process.platform === "win32" ? undefined : "SIGKILL",
    },
    callback,
  )
}

/**
 * ripgrep 查询（裁剪版核心：超时/EAGAIN 重试/部分结果回收口径照旧仓）。
 * 返回匹配行数组；code 1 = 无匹配（非错误）；超时且零结果 → 抛
 * RipgrepTimeoutError（防"以为没匹配"的空真）。
 */
export async function ripGrep(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const handleResult = (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
      isRetry: boolean,
    ): void => {
      if (!error) {
        resolve(
          stdout
            .trim()
            .split("\n")
            .map(line => line.replace(/\r$/, ""))
            .filter(Boolean),
        )
        return
      }

      // exit 1 = 正常"无匹配"
      if (error.code === 1) {
        resolve([])
        return
      }

      // rg 本体损坏（非"无匹配"）——显式上抛
      const CRITICAL_ERROR_CODES = ["ENOENT", "EACCES", "EPERM"]
      if (CRITICAL_ERROR_CODES.includes(error.code as string)) {
        reject(error)
        return
      }

      // EAGAIN 且未重试 → 单线程模式重试一次
      if (!isRetry && isEagainError(stderr)) {
        logForDebugging(
          "rg EAGAIN error detected, retrying with single-threaded mode (-j 1)",
        )
        ripGrepRaw(
          args,
          target,
          abortSignal,
          (retryError, retryStdout, retryStderr) => {
            handleResult(retryError, retryStdout, retryStderr, true)
          },
          true,
        )
        return
      }

      const hasOutput = stdout && stdout.trim().length > 0
      const isTimeout =
        error.signal === "SIGTERM" ||
        error.signal === "SIGKILL" ||
        error.code === "ABORT_ERR"
      const isBufferOverflow =
        error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"

      let lines: string[] = []
      if (hasOutput) {
        lines = stdout
          .trim()
          .split("\n")
          .map(line => line.replace(/\r$/, ""))
          .filter(Boolean)
        // 超时/缓冲溢出——末行可能残缺，丢弃
        if (lines.length > 0 && (isTimeout || isBufferOverflow)) {
          lines = lines.slice(0, -1)
        }
      }

      logForDebugging(
        `rg error (signal=${error.signal}, code=${error.code}, stderr: ${stderr}), ${lines.length} results`,
      )

      // code 2 = rg 用法错误（自身已处理）；ABORT_ERR = 调用方取消（非错误）
      if (error.code !== 2 && error.code !== "ABORT_ERR") {
        logForDebugging(
          `rg search error: ${error.code ?? error.signal ?? "unknown"}`,
        )
      }

      if (isTimeout && lines.length === 0) {
        reject(
          new RipgrepTimeoutError(
            "Ripgrep search timed out after 20 seconds. The search may have matched files but did not complete in time. Try searching a more specific path or pattern.",
            lines,
          ),
        )
        return
      }

      resolve(lines)
    }

    ripGrepRaw(args, target, abortSignal, (error, stdout, stderr) => {
      handleResult(error, stdout, stderr, false)
    })
  })
}
