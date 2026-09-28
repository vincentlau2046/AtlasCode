/**
 * E-5 S-5a 三层断补齐 func 验真（§8.39 判别信号 ①：组合根接线）
 *
 * 第三断 = compose.ts 缺 setHooksBootstrapEnv（接线缺失前生产路径 runHooks 必
 * fail-fast 抛「hooks bootstrap 未注入」，hooks 域 bootstrap-env.ts 头注）。本文件
 * 绿 = 组合根装配后 hooks bootstrap-env 真注入 + 3 新成员源（bootstrap 域 ⑤ 族）
 * 真接线，runHooks 生产路径不再 fail-fast。
 *
 * 分层纪律：func 层真 I/O（--isolate 每文件独立进程，全局注入窗口不跨文件泄漏）；
 * 组合根全真装配（真 executor shell port / 真 config provider 快照），fake 零。
 * runStopHooks 结果只断言形状（results 为数组）——本机若配置了 Stop 钩子亦不
 * 破坏断言（不假「无钩子」内容断言）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { getCoreDependencies, resetCoreDependencies } from '../../src/atlascode'
import {
  getHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  resetHookConfigProvider,
  resetHookShellPort,
  runStopHooks,
} from '../../src/hooks'
import {
  getCwdState,
  getMainThreadAgentType,
  getSessionId,
  getIsNonInteractiveSession,
  getTranscriptPathForSession,
  hasTrustAccepted,
} from '../../src/bootstrap'
import {
  resetBackendModule,
  resetStartInProcessTeammate,
  resetTeammateToolRegistryDeps,
} from '../../src/swarm'
import {
  resetSchedulerEnv,
  resetSessionContextPort,
  resetSessionEnv,
  resetTaskNotificationHandler,
  resetTeamFileLoader,
  resetTeamServices,
  setSessionMemoryPort,
} from '../../src/engine'

describe('E-5 S-5a 组合根 hooks bootstrap-env 接线（三层断之第三断）', () => {
  beforeAll(() => {
    getCoreDependencies()
  })
  afterAll(() => {
    resetCoreDependencies()
    resetHooksBootstrapEnv()
    resetHookConfigProvider()
    resetHookShellPort()
    // compose ⑨⑩⑪⑫ 注入面对称复位（同 b6-func-smoke teardown 口径——
    // getCoreDependencies 同调用面，单进程连跑防串味）
    resetSessionEnv()
    setSessionMemoryPort(null)
    resetSessionContextPort()
    resetTaskNotificationHandler()
    resetSchedulerEnv()
    resetBackendModule()
    resetStartInProcessTeammate()
    resetTeammateToolRegistryDeps()
    resetTeamServices()
    resetTeamFileLoader()
  })

  test('① 装配后 getHooksBootstrapEnv 不 fail-fast（接线前 = 抛「未注入」）', () => {
    const env = getHooksBootstrapEnv()
    expect(env).toBeDefined()
  })

  test('② 6 成员源 = bootstrap 域真函数（3 既有 + 3 新，非空壳）', () => {
    const env = getHooksBootstrapEnv()
    // 既有 3 源（①②③ 族）
    expect(env.getSessionId()).toBe(getSessionId())
    expect(env.getCwd()).toBe(getCwdState())
    expect(env.isNonInteractive()).toBe(getIsNonInteractiveSession())
    // E-5 S-5a 新 3 源（⑤ 族）：真 bootstrap 域函数（形状对照，非自证）
    expect(env.getTranscriptPath('sess-x')).toBe(getTranscriptPathForSession('sess-x'))
    expect(env.getMainThreadAgentType()).toBe(getMainThreadAgentType()) // 缺省 undefined
    expect(env.hasTrustAccepted()).toBe(hasTrustAccepted()) // 缺省 true
  })

  test('③ 生产路径 runStopHooks 不再 fail-fast（全链：config provider + bootstrap env）', async () => {
    const res = await runStopHooks()
    expect(Array.isArray(res.results)).toBe(true)
  })
})
