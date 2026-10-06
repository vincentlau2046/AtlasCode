/**
 * 0.1.37 ⑧ TUI pane-worker 用户面封口 func 层（真盘：mkdtemp ATLAS_CONFIG_DIR
 * stamp + team file seed + TUI 侧身份注入 + 真 handler 全路径，零模型）。
 *
 * 测面 = ⑧ 第 4 终态（超时）真体判别（engine 侧 0.1.36 切片① 的同型用户面）：
 *   - 杀 leader 等价（leader 永不写响应；本层不挂 poller loop → mailbox/磁盘
 *     响应不可达）→ deadline（env 注入 300ms）早于 500ms poll 首拍到期 →
 *     worker 侧 promise fail-closed deny（buildReject 形：behavior 'ask' +
 *     unavailable 措辞，回合继续不 abort）+ 注册表释放（不泄漏）+ pending
 *     指示清除。
 *   - 与 e2e V3-⑧ 探针同源（pane-worker 杀 leader 真面）；本 func 层锁 timer
 *     行为 + fail-closed 语义 + 不挂死 + 注册表释放。进程可退性（interval
 *     unref）由四件套 exit 0 兜证（若 unref 缺失，bun test 进程会挂起不退出）。
 *
 * 注意：TUI 侧 teammate.ts 有独立模块态 dynamicTeamContext（engine
 * messaging/teammate.ts 为逐字拷贝、模块态独立）→ 身份注入用 TUI 侧
 * setDynamicTeamContext，非 engine 侧。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { handleSwarmWorkerPermission } from '../../src/tui/hooks/toolPermission/handlers/swarmWorkerHandler.js'
import type { PermissionContext } from '../../src/tui/hooks/toolPermission/PermissionContext.js'
import {
  clearAllPendingCallbacks,
  pendingPermissionCallbackCount,
} from '../../src/tui/hooks/useSwarmPermissionPoller.js'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/tui/utils/teammate.js'
import type { PermissionDecision } from '../../src/tui/utils/permissions/PermissionResult.js'
import { writeTeamFileAsync } from '../../src/swarm'

let dir = ''
const TEAM = 't1'
/** 小 deadline 驱动第 4 终态（早于 500ms poll 首拍，timeout-policy「仅本层 timer 先到期才替换结果」）。 */
const DEADLINE_MS = 300
/** 看门狗上限：远超 deadline（300ms），仅用于把「挂死」转成显式失败而非无限悬挂。 */
const WATCHDOG_MS = 4000

type FakeAppState = { pendingWorkerRequest: unknown }

/**
 * 最小 fake PermissionContext（结构面 cast）：仅实现 handler 消费的方法面
 * （setAppState / abortController / buildReject / cancelAndAbort / logDecision /
 * logCancelled / handleUserAllow）；buildReject 按真体语义透传 feedback 作
 * message（真体经 rejectMessage 拼 SUBAGENT 前缀，本层断言 unavailable 措辞
 * 子串，前缀差异不影响判别）。
 */
function makeFakeCtx(): {
  ctx: PermissionContext
  appState: () => FakeAppState
} {
  let appState: FakeAppState = { pendingWorkerRequest: null }
  const ctx = {
    tool: { name: 'Bash' },
    toolUseID: 'tu-1',
    input: { command: 'echo hi' },
    toolUseContext: {
      setAppState(updater: unknown) {
        appState =
          typeof updater === 'function'
            ? (updater as (p: FakeAppState) => FakeAppState)(appState)
            : (updater as FakeAppState)
      },
      getAppState: () => appState,
      abortController: new AbortController(),
      agentId: 'w1',
      options: { isNonInteractiveSession: true },
    },
    logDecision(): void {},
    logCancelled(): void {},
    handleUserAllow: async (finalInput: Record<string, unknown>) => ({
      behavior: 'allow' as const,
      updatedInput: finalInput,
    }),
    buildReject(feedback?: string, contentBlocks?: unknown) {
      return {
        behavior: 'ask' as const,
        message: feedback ?? '(reject)',
        contentBlocks,
      }
    },
    cancelAndAbort(feedback?: string) {
      return { behavior: 'ask' as const, message: feedback ?? '(abort)' }
    },
  }
  return { ctx: ctx as unknown as PermissionContext, appState: () => appState }
}

async function seedTeamFile(): Promise<void> {
  await writeTeamFileAsync(TEAM, {
    name: TEAM,
    createdAt: Date.now(),
    leadAgentId: 'team-lead@t1',
    members: [
      {
        agentId: 'team-lead@t1',
        name: 'team-lead',
        joinedAt: Date.now(),
        tmuxPaneId: '',
        cwd: '/tmp',
        subscriptions: [],
      },
    ],
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-tui-swarm-deadline-'))
  process.env.ATLAS_CONFIG_DIR = dir
  // ⑧ gate：isAgentSwarmsEnabled（opt-in env；GB gate 本地缓存缺 → 缺省 true）
  process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
  process.env.ATLAS_PERM_MAILBOX_DEADLINE_MS = String(DEADLINE_MS)
})

afterEach(() => {
  delete process.env.ATLAS_CONFIG_DIR
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  delete process.env.ATLAS_PERM_MAILBOX_DEADLINE_MS
  clearDynamicTeamContext()
  clearAllPendingCallbacks()
  rmSync(dir, { recursive: true, force: true })
})

describe('⑧ pane-worker 用户面封口（func 真盘，TUI 侧身份）', () => {
  test('杀 leader 等价 → deadline fail-closed deny + 回合继续 + 注册表释放', async () => {
    await seedTeamFile()
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'worker-1',
      teamName: TEAM,
      planModeRequired: false,
    })

    const { ctx, appState } = makeFakeCtx()
    const t0 = Date.now()
    const watchdog = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () =>
          reject(
            new Error(
              `handler 未在 ${WATCHDOG_MS}ms 内 settle（⑧ deadline 未生效 / 挂死？）`,
            ),
          ),
        WATCHDOG_MS,
      )
      t.unref?.()
    })

    const res = await Promise.race([
      handleSwarmWorkerPermission({
        ctx,
        description: 'fake worker request',
        updatedInput: undefined,
        suggestions: undefined,
      }),
      watchdog,
    ])
    const elapsed = Date.now() - t0

    // ⑧ 第 4 终态生效：fail-closed deny（buildReject 形 = 消息送回 agent，
    // 回合继续不 abort，A2 语义；unavailable 措辞含 Nms 可审计）
    expect(res).not.toBeNull()
    const decision = res as PermissionDecision
    expect(decision.behavior).toBe('ask')
    expect((decision as { message?: string }).message).toContain(
      `did not respond within ${DEADLINE_MS}ms`,
    )
    expect((decision as { message?: string }).message).toContain('fail-closed')
    // 回合继续：按 deadline settle（早于 500ms poll 首拍，不挂死）
    expect(elapsed).toBeGreaterThanOrEqual(250)
    expect(elapsed).toBeLessThan(500)
    // 注册表释放（deadline 终态 unregister，不泄漏）+ pending 指示清除
    expect(pendingPermissionCallbackCount()).toBe(0)
    expect(appState().pendingWorkerRequest).toBeNull()
  })
})
