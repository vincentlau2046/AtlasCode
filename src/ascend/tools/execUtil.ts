/**
 * ascend 工具共享 CANN exec 包裹 + 工具上下文 duck 型（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 旧仓各工具（CompilerBridge / GoldenTest / RealHWBridge / FaultCollector /
 * ErrorClassifier / ProfileAnalyzer / BenchmarkRunner / ProfileReportParser /
 * ModelConverter / OnnxOptimizer / DataPrepTool / InferValidator）内联的
 * doExec / try-catch ExecError 解包收敛到此单一事实源（行为逐字：ExecError →
 * 解包 e.result 四元组；非 ExecError → 重抛）。
 *
 * mock 决策 = AscendExecutor.shouldMock()（env 驱动，各工具 call 内计算后显式
 * 传 exec，保旧仓"工具级 mock 决策覆写 config.mock"语义）。
 */
import { getAscendExecutor } from '../executor/instance'
import { ExecError } from 'src/executor'

/** exec 结果四元组（旧仓各工具 doExec 返回形态）。 */
export interface CannedExecOutcome {
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

/**
 * engine 工具 call 第 2 参 context 的 duck 型。engine toolExecution.ts:333 传
 * 最小 context { signal, checkPermission }（signal = 会话 abort 信号）；本 duck
 * 只取 signal 面。旧仓的 options.isNonInteractiveSession 不在最小 context 里
 * （forward seam：非交互 auto-mock 经 env ATLAS_ASCEND_MOCK=1 / S5 mount 注入）。
 */
export interface AscendToolUseContext {
  signal?: AbortSignal
}

/** 共享 CANN exec 包裹：ExecError 捕获 + 结果四元组解包。 */
export async function runCannExec(
  command: string,
  args: string[],
  opts: { signal?: AbortSignal; mock: boolean; cwd?: string },
): Promise<CannedExecOutcome> {
  try {
    const r = await getAscendExecutor().exec(command, args, opts)
    return {
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      durationMs: r.durationMs,
    }
  } catch (e) {
    if (e instanceof ExecError) {
      return {
        exitCode: e.result.exitCode,
        stdout: e.result.stdout,
        stderr: e.result.stderr,
        durationMs: e.result.durationMs,
      }
    }
    throw e
  }
}
