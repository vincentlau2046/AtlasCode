/**
 * ripgrep 搜索后端（A+S3 单一事实源，0.1.44 Grep ENOENT 根修）
 *
 * 沿革：
 * - 旧仓来源（a8af45b）: src/utils/ripgrep.ts（673L，system/builtin/embedded
 *   三模式 + stream/fileCount/codesign/firstUseTest）。
 * - C-Deep 裁剪裁定（2026-09-22，c4a3ef5）：单模式 = system rg（新仓无 vendor/ripgrep
 *   二进制、无 bun:bundle embedded 模式；旧 builtin/embedded 两模式 + USE_BUILTIN_RIPGREP
 *   env 全裁）。但 TUI 侧（src/tui/utils/ripgrep.ts 三模式 resolver）漏迁移，默认落
 *   builtin 路径 vendor/ripgrep/<arch>/rg = npm 通道从未发布的二进制（files=["dist"]、
 *   git 历史无 vendor/、0.1.7~0.1.42 四版 tarball 实测 0 条目）→ npm 通道 Grep 工具/
 *   文件补全/全局搜索/文件计数/Bash shell 集成/doctor 恒 ENOENT（2026-10-08 用户报）。
 * - 0.1.44（本波，工单 docs/2026-10-08-grep-enent-rootfix.md）：完成 C-Deep 迁移 +
 *   S3 二进制供给——本文件为 rg 解析单一事实源；TUI 6 消费方全走 sandbox 门面
 *   （src/tui/sandboxCompat），src/tui/utils/ripgrep.ts 已删（双实现漂移类结构消除）。
 *
 * A+S3 三级 resolver（resolveRg，进程级 memo）：
 *   1. system rg：`rg --version` 探测（2s 超时）→ 用命令名 "rg" 由 OS 经 $PATH 解析
 *      （C-Deep 安全语义保留：全路径会被恶意 ./rg 劫持，命令名经 PATH 解析安全）
 *   2. @vscode/ripgrep 平台二进制（S3 兜底）：依赖由 wrapper 包拉入（其 optionalDependencies
 *      12 平台包 npm/bun install 时自动只装当前平台、无 postinstall）；本侧不 import 该
 *      wrapper 的 ESM（其顶层 throw 会拖垮 CLI 启动 + require(esm) 有 node 版本差），
 *      改用 require.resolve 直接解析 bin/rg（同步、只解析路径不加载模块）：
 *      @vscode/ripgrep-<platform>-<arch>/bin/rg（支持 npm_config_arch 覆盖，与 wrapper 对齐）
 *   3. 皆缺失 → source='none'，ripGrep/ripGrepStream/ripGrepFileCount 抛
 *      RipgrepMissingError（可操作错误面：明说原因 + 两条修复路径，非裸 ENOENT）
 *
 * 语义保留（C-Deep 版照旧）：EAGAIN 单线程重试 / code 1=无匹配 / 超时部分结果回收
 * （末行丢弃）/ RipgrepTimeoutError（20s 默认，ATLAS_GLOB_TIMEOUT_SECONDS 可调）/
 * maxBuffer 20MB / SIGKILL killSignal（rg 阻塞不可中断文件 I/O 时 SIGTERM 杀不掉）。
 *
 * 残余登记（in-code，复审勿当遗漏重提）：
 * ① USE_BUILTIN_RIPGREP = 死键（managedEnv 白名单项保留、不再消费；三模式 resolver 已裁）
 * ② embedded/ant-native(bun) 的 argv0 shell-function 分支（ShellSnapshot）+
 *    hasEmbeddedSearchTools bfs/ugrep 面 = dead 分支（产品 npm-node 不触发；留置不裁）
 * ③ macOS codesign 面裁除（签名对象 = 从未发布的 builtin vendor 二进制，无对象可签）
 * ④ TUI WSL 60s 超时特例裁除（C-Deep 已裁：国内目标非 WSL，统一 20s）
 */
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import * as path from "node:path"
import { createRequire } from "node:module"
import {
  execFile,
  execFileSync,
  spawn,
  type ChildProcess,
  type ExecFileException,
} from "child_process"
import { countCharInString, logForDebugging } from "../shared"

const MAX_BUFFER_SIZE = 20_000_000 // 20MB；大 monorepo 可 20 万+ 文件

// ── A+S3 三级 rg 解析（单一事实源）──

export type RgSource = "path" | "vscode-ripgrep" | "none"

export interface ResolvedRg {
  command: string
  args: string[]
  source: RgSource
}

/**
 * @vscode/ripgrep 平台二进制路径（S3 兜底）。
 * 用 require.resolve 解析（同步、不加载 wrapper 的 ESM 模块——其顶层 throw 只在
 * 平台包缺失时发生，直接解析路径即可判在场）；平台不匹配/依赖缺失 → null（落第 3 级）。
 */
function getBundledRgPath(): string | null {
  try {
    const arch = process.env.npm_config_arch || process.arch
    const platformPkg = `@vscode/ripgrep-${process.platform}-${arch}`
    const binaryName = process.platform === "win32" ? "rg.exe" : "rg"
    const p = createRequire(import.meta.url).resolve(
      `${platformPkg}/bin/${binaryName}`,
    )
    return existsSync(p) ? p : null
  } catch {
    return null
  }
}

let systemRgProbe: boolean | null = null
/** 系统 rg 探测（rg --version，2s 超时；进程级缓存结果）。 */
function probeSystemRg(): boolean {
  if (systemRgProbe !== null) return systemRgProbe
  try {
    const out = execFileSync("rg", ["--version"], {
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    systemRgProbe = out.toString().trim().startsWith("ripgrep ")
  } catch {
    systemRgProbe = false
  }
  return systemRgProbe
}

let cachedResolved: ResolvedRg | null = null

/**
 * 测试钩子（仅单测用，勿在运行时消费）：传 null = 清缓存（下次调用重解析，
 * 含系统探测缓存）；传值 = 强制该解析结果（如 { source:'none' } 模拟双缺场景）。
 */
export function setRipgrepResolutionForTest(value: ResolvedRg | null): void {
  cachedResolved = value
  if (value === null) systemRgProbe = null
}

function resolveRg(): ResolvedRg {
  if (cachedResolved) return cachedResolved
  if (probeSystemRg()) {
    // SECURITY: 用命令名 "rg" 而非探测到的全路径——PATH 解析由 OS 完成，
    // 避免恶意 ./rg 劫持（C-Deep 安全语义保留）。
    cachedResolved = { command: "rg", args: [], source: "path" }
  } else {
    const bundled = getBundledRgPath()
    cachedResolved = bundled
      ? { command: bundled, args: [], source: "vscode-ripgrep" }
      : { command: "rg", args: [], source: "none" }
  }
  return cachedResolved
}

/**
 * rg 可执行 + 参数（ShellSnapshot shell 集成消费面）。
 * A+S3 后 argv0 恒 undefined（embedded 面已裁，见头注残余②）→ ShellSnapshot
 * 恒走 alias 分支；返回 source 供诊断面展示。
 */
export function ripgrepCommand(): {
  rgPath: string
  rgArgs: string[]
  argv0?: string
  source: RgSource
} {
  const r = resolveRg()
  return { rgPath: r.command, rgArgs: r.args, source: r.source }
}

/**
 * 系统 rg 与 @vscode/ripgrep 平台二进制皆缺失——可操作错误面
 * （取代旧「裸 ENOENT」面：明说原因 + 两条修复路径，用户无需读堆栈）。
 */
export class RipgrepMissingError extends Error {
  constructor() {
    super(
      "ripgrep not found: rg is not in PATH and the @vscode/ripgrep platform binary is missing. " +
        "Install ripgrep (apt/brew/scoop/winget) or re-run the package install (npm install / bun install) so the platform optional dependency is fetched.",
    )
    this.name = "RipgrepMissingError"
  }
}

/**
 * 探测任一可用 rg（A+S3 任一级，2s 超时）。
 * 功能 smoke 据此决定真查 or skip（无可用 rg 按 unit 纪律 skip 不红）。
 */
export function checkRipgrep(): Promise<boolean> {
  const { rgPath, source } = ripgrepCommand()
  if (source === "none") return Promise.resolve(false)
  try {
    const out = execFileSync(rgPath, ["--version"], {
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    return Promise.resolve(out.toString().trim().startsWith("ripgrep "))
  } catch {
    return Promise.resolve(false)
  }
}

export type RipgrepStatusMode = "system" | "bundled" | "missing"

/**
 * ripgrep 状态（doctor 面板消费面）。working = 真探测（--version 实跑，非仅在场判断）。
 * C-Deep 残余④：getRipgrepStatus 自 TUI 移植（去 embedded Bun 分支 + 三模式）。
 */
export function getRipgrepStatus(): {
  mode: RipgrepStatusMode
  path: string
  working: boolean | null
} {
  const { rgPath, source } = ripgrepCommand()
  if (source === "none") {
    return { mode: "missing", path: rgPath, working: false }
  }
  try {
    const out = execFileSync(rgPath, ["--version"], {
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    return {
      mode: source === "path" ? "system" : "bundled",
      path: rgPath,
      working: out.toString().trim().startsWith("ripgrep "),
    }
  } catch {
    return {
      mode: source === "path" ? "system" : "bundled",
      path: rgPath,
      working: false,
    }
  }
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
 * 原始执行（C-Deep 版：仅 execFile 分支；argv0/embedded spawn 分支已裁）。
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
 * ripgrep 查询（C-Deep 核心：超时/EAGAIN 重试/部分结果回收口径照旧仓）。
 * 返回匹配行数组；code 1 = 无匹配（非错误）；超时且零结果 → 抛
 * RipgrepTimeoutError（防"以为没匹配"的空真）。
 * A+S3：双缺（source='none'）→ 抛 RipgrepMissingError（可操作错误面）。
 */
export async function ripGrep(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
): Promise<string[]> {
  const { source } = ripgrepCommand()
  if (source === "none") throw new RipgrepMissingError()

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

/**
 * 流式逐块回调 ripgrep 输出行（C-Deep 残余①：自 TUI 交互增量刷行面移植）。
 * 与 ripGrep 的差异：不等全量 stdout，每到一个 chunk 即 flush 完整行
 * （首结果先上屏，fzf change:reload 模式）；跨 chunk 残留行 carry。
 * 提前停止由调用方 abort signal（spawn signal 杀 rg）；无 EAGAIN 重试、
 * 无内部超时、stderr 忽略——交互调用方自管恢复。
 * A+S3：双缺 → 抛 RipgrepMissingError。
 */
export async function ripGrepStream(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
  onLines: (lines: string[]) => void,
): Promise<void> {
  const { rgPath, rgArgs, source } = ripgrepCommand()
  if (source === "none") throw new RipgrepMissingError()

  return new Promise<void>((resolve, reject) => {
    const child = spawn(rgPath, [...rgArgs, ...args, target], {
      signal: abortSignal,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })

    const stripCR = (l: string) => (l.endsWith("\r") ? l.slice(0, -1) : l)
    let remainder = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      const data = remainder + chunk.toString()
      const lines = data.split("\n")
      remainder = lines.pop() ?? ""
      if (lines.length) onLines(lines.map(stripCR))
    })

    // On Windows, both 'close' and 'error' can fire for the same process.
    let settled = false
    child.on("close", code => {
      if (settled) return
      // Abort races close — don't flush a torn tail from a killed process.
      // Promise still settles: spawn's signal option fires 'error' with
      // AbortError → reject below.
      if (abortSignal.aborted) return
      settled = true
      if (code === 0 || code === 1) {
        if (remainder) onLines([stripCR(remainder)])
        resolve()
      } else {
        reject(new Error(`ripgrep exited with code ${code}`))
      }
    })
    child.on("error", err => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

/**
 * 流式计数 `rg --files` 行数（不缓冲 stdout；峰值内存 = 一个 stream chunk）。
 * C-Deep 残余②（私有）：大仓（24 万+ 文件、16MB 路径）下 ripGrep 只为取 .length
 * 会把全量 stdout 实体化；此处逐 chunk 数换行符。
 * 仅 countFilesRoundedRg 消费（吞所有错误）；无 EAGAIN 重试/无内部超时
 * （调用方传 AbortSignal.timeout；spawn signal 杀 rg）。
 */
async function ripGrepFileCount(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
): Promise<number> {
  const { rgPath, rgArgs, source } = ripgrepCommand()
  if (source === "none") throw new RipgrepMissingError()

  return new Promise<number>((resolve, reject) => {
    const child = spawn(rgPath, [...rgArgs, ...args, target], {
      signal: abortSignal,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })

    let lines = 0
    child.stdout?.on("data", (chunk: Buffer) => {
      lines += countCharInString(chunk, "\n")
    })

    // On Windows, both 'close' and 'error' can fire for the same process.
    let settled = false
    child.on("close", code => {
      if (settled) return
      settled = true
      if (code === 0 || code === 1) resolve(lines)
      else reject(new Error(`rg --files exited ${code}`))
    })
    child.on("error", err => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

/**
 * 用 ripgrep 递归计数目录文件，按 10 的幂次舍入（隐私口径）。
 * C-Deep 残余②：自 TUI main.tsx 遥测消费面移植。
 * 新仓无 lodash——keyed memo 本地闭包（语义对齐旧 lodash memoize：缓存键 =
 * dirPath + ignorePatterns；abortSignal 刻意不入键——不影响计数结果）。
 * 家目录跳过（macOS TCC 权限弹框面）；异常全吞（调用方 fire-and-forget）。
 */
const countFilesMemo = new Map<string, Promise<number | undefined>>()

export function countFilesRoundedRg(
  dirPath: string,
  abortSignal: AbortSignal,
  ignorePatterns: string[] = [],
): Promise<number | undefined> {
  const key = `${dirPath}|${ignorePatterns.join(",")}`
  let cached = countFilesMemo.get(key)
  if (!cached) {
    cached = countFilesRoundedRgImpl(dirPath, abortSignal, ignorePatterns)
    countFilesMemo.set(key, cached)
  }
  return cached
}

async function countFilesRoundedRgImpl(
  dirPath: string,
  abortSignal: AbortSignal,
  ignorePatterns: string[] = [],
): Promise<number | undefined> {
  // Skip file counting if we're in the home directory to avoid triggering
  // macOS TCC permission dialogs for Desktop, Downloads, Documents, etc.
  if (path.resolve(dirPath) === path.resolve(homedir())) {
    return undefined
  }

  try {
    // --files: 列出可搜索文件（非搜索内容）；--hidden: 含隐藏文件
    const args = ["--files", "--hidden"]
    ignorePatterns.forEach(pattern => {
      args.push("--glob", `!${pattern}`)
    })

    const count = await ripGrepFileCount(args, dirPath, abortSignal)

    if (count === 0) return 0

    const magnitude = Math.floor(Math.log10(count))
    const power = Math.pow(10, magnitude)

    // 按最近 10 的幂舍入，e.g. 8 → 10, 42 → 100, 350 → 100, 750 → 1000
    return Math.round(count / power) * power
  } catch (error) {
    // AbortSignal.timeout firing is expected on large/slow repos, not an error.
    if ((error as Error)?.name !== "AbortError") {
      logForDebugging(
        `countFilesRoundedRg failed: ${(error as Error)?.message ?? String(error)}`,
      )
    }
  }
  return undefined
}
