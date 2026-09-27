/**
 * execFileNoThrow（no-cwd 变体；S-E2a 叶子 helper）。
 *
 * 源 = 旧仓 a8af45b src/utils/execFileNoThrow.ts:26-40 逐字适配：
 *   useCwd=true 固定 → cwd = bootstrap 域门面 getCwd()（bootstrap 域 cwd 状态，
 *   §8.14 注入序；目录消失回落 getOriginalCwd 语义由 bootstrap 域内承担）；
 *   WithCwd 核心 = engine 根门面 worktree 子门面 execFileNoThrowWithCwd
 *   （S-7c §8.48，旧仓核心逐字迁，非零退出/信号杀死皆 resolve 绝不 reject）。
 * Delta ① input/useCwd 选项裁：grep 验旧仓 swarm 树全部调用点
 *（detection 2 + it2Setup 6 + TmuxBackend 4+，S-E2b/c 其余点同形）均为
 *   (cmd, args) 二元裸调，零 options 实参 → 选项面收窄登记。
 * 消费面 = S-E2c backends 族（TmuxBackend runTmux 两变体 / ITermBackend runIt2 /
 * detection / it2Setup）+ S-E2b teamHelpers（git 命令面）。
 */
import { getCwd } from '../bootstrap'
import { execFileNoThrowWithCwd } from '../engine'

export function execFileNoThrow(
  file: string,
  args: string[],
  options: {
    abortSignal?: AbortSignal
    timeout?: number
    preserveOutputOnError?: boolean
    maxBuffer?: number
    env?: NodeJS.ProcessEnv
    stdin?: 'ignore' | 'inherit' | 'pipe'
  } = {},
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return execFileNoThrowWithCwd(file, args, {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: getCwd(),
    env: options.env,
    maxBuffer: options.maxBuffer,
    stdin: options.stdin,
  })
}
