/**
 * cli/hooksWiring — headless 车道 hooks 域三窗口接线（user-e2e 收口 ·
 * P0 headless「hooks bootstrap 未注入」回归修）。
 *
 * 根因：hooks 域（§8.14 注入序 permissions→task→hooks）三窗口
 * （bootstrap-env / shell-port / config-provider）此前仅 TUI 壳组合根
 * （atlascode/compose.ts createCoreDependencies ⑤ 步）注入；headless 车道
 * （cli 域 runHeadless）不经壳组合根 → 用户 HOME 存在 hooks 配置时
 * runHooks fail-fast 抛「hooks bootstrap 未注入」（空 hooks 配置的沙箱
 * HOME 走短路支不触达 → e2e 沙箱假 PASS，用户面真炸）。
 *
 * 本模块 = cli 域侧等价接线（与壳 ⑤ 步同一事实源 6 成员 + 同源适配器
 * 语义：executor 真 Shell → HookShellPort，壳侧 = atlascode/adapters/
 * hookShellAdapter.ts 逐字同形）。setter 幂等，runHeadless 入口调用。
 */
import {
  getCwdState,
  getIsNonInteractiveSession,
  getMainThreadAgentType,
  getTranscriptPathForSession,
  getSessionId,
  hasTrustAccepted,
} from '../bootstrap'
import { execShell } from '../executor'
import {
  captureHooksConfigSnapshot,
  createHooksConfigProvider,
} from '../engine'
import {
  setHookConfigProvider,
  setHooksBootstrapEnv,
  setHookShellPort,
  type HookShellExecution,
} from '../hooks'

/**
 * headless 车道 hooks 三窗口接线（幂等；§8.14 推荐序
 * setHooksBootstrapEnv → setHookShellPort → setHookConfigProvider →
 * captureHooksConfigSnapshot）。
 */
export function wireCliHooksDeps(): void {
  setHooksBootstrapEnv({
    getSessionId,
    getCwd: getCwdState,
    getTranscriptPath: getTranscriptPathForSession,
    getMainThreadAgentType,
    isNonInteractive: getIsNonInteractiveSession,
    hasTrustAccepted,
  })
  // executor 真 Shell → HookShellPort（壳 hookShellAdapter 逐字同形：
  // execShell(command, signal, { timeout, env }) → result 四元映射，
  // interrupted → aborted）
  setHookShellPort({
    runCommand: async (
      command: string,
      env: Record<string, string>,
      signal: AbortSignal,
      timeoutMs?: number,
    ): Promise<HookShellExecution> => {
      const shellCmd = await execShell(command, signal, {
        timeout: timeoutMs,
        env,
      })
      const result = await shellCmd.result
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        aborted: result.interrupted,
      }
    },
  })
  setHookConfigProvider(createHooksConfigProvider())
  captureHooksConfigSnapshot()
}
