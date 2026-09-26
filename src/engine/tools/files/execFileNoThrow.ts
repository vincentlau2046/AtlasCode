/**
 * files 域 — execFileNoThrow 域内最小形（§8.55 S-C3，旧仓
 * src/utils/execFileNoThrow.ts execa 包装族裁面随迁）。
 *
 * 消费面：pdf.ts 3 调用点（pdfinfo 页数探测 / pdftoppm -v 可用性 /
 * pdftoppm 页面渲染），均 useCwd:false + timeout。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - execa 依赖裁：新仓依赖面 5 包（diff/openai/proper-lockfile/
 *    shell-quote/zod）无 execa → 实现改 node:child_process execFile
 *    （worktree git.ts 域内 exec 层先例：arg-array 免注入）。
 *    旧 execa 的 Windows .bat/.cmd shell-escape 面为 execa 内禀，
 *    本消费面 = pdfinfo/pdftoppm 非 shell 二进制，行为不触。
 *  - 零本波消费者面裁：execFileNoThrowWithCwd（旧仓消费 = git.ts /
 *    autoUpdater / commitAttribution exec 族，非本波）+
 *    execSyncWithDefaults_DEPRECATED re-export → 随 exec 族落盘波重补。
 *  - stdin 模式支 + input 支（execa 内禀）不接线：本仓 @types/node
 *    execFile 选项面两字段均不收 → 公开型保留（保真面）仅声明，
 *    本波零消费者（见调用点注释）。
 *  - error 文案面：旧 execa shortMessage（含 signal 信息）→ 新 node
 *    execFile error.message（非零退出 = 'Command failed: …' + stderr）；
 *    error 字段本波零消费者（pdf.ts 仅读 code/stdout/stderr）。
 *  - 语义映射保真：非零退出 → code 保留 + 输出保留（preserveOutputOnError
 *    缺省 true，旧 .then result.failed 支逐字）；spawn 层失败
 *    （ENOENT/ETIMEDOUT/abort，error.code 为字符串 errno 或缺失）→
 *    logError + {stdout:'', stderr:'', code:1}（旧 .catch 支逐字）。
 */
import { execFile } from 'child_process'
import { getCwd } from '../../../bootstrap'
import { logError } from '../../../shared'

const MS_IN_SECOND = 1000
const SECONDS_IN_MINUTE = 60

type ExecFileOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  // Setting useCwd=false avoids circular dependencies during initialization
  // (getCwd() can re-enter exec paths before process state is ready)
  useCwd?: boolean
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
  input?: string
}

/**
 * execFile, but always resolves (never throws)
 */
export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  const cwd = options.useCwd ? getCwd() : undefined
  return new Promise(resolve => {
    // delta（S-C3）：旧 execa({ reject:false, signal, timeout, maxBuffer,
    // shell, stdin, input }) → node execFile（signal/timeout/maxBuffer/
    // env/cwd 同名选项面；shell 支本消费面不触，见头注）。
    // stdin 模式支 + input 支（execa 内禀，本仓 @types/node execFile
    // 选项面两字段均不收）→ 公开型保留（保真面）但不接线，本波零
    // 消费者（pdf.ts 3 调用点均不传 stdin/input）。
    execFile(
      file,
      args,
      {
        timeout: options.timeout ?? 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
        maxBuffer: 1_000_000,
        cwd,
        env: options.env,
        signal: options.abortSignal,
      },
      (error, stdout, stderr) => {
        if (error) {
          // 双支判别：非零退出（error.code = 数字退出码）→ 输出保留支；
          // spawn 层失败（ENOENT/ETIMEDOUT/abort = 字符串 errno 或缺失）
          // → 旧 .catch 支（logError + code 1 恒解析，永不抛）。
          const code = (error as NodeJS.ErrnoException).code
          if (typeof code === 'number') {
            if (options.preserveOutputOnError ?? true) {
              void resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                code,
                error: error.message,
              })
            } else {
              void resolve({ stdout: '', stderr: '', code })
            }
          } else {
            logError(error)
            void resolve({ stdout: '', stderr: '', code: 1 })
          }
        } else {
          void resolve({ stdout, stderr, code: 0 })
        }
      },
    )
  })
}
