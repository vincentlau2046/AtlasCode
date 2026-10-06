/**
 * swarm 域 P1（0.1.36 切片①）mailbox 兜底协作式 deadline func 层（真盘：
 * mkdtemp ATLAS_CONFIG_DIR stamp + team file seed + 真 mailbox 全路径，零模型）。
 *
 * 测面 = P1 第 4 终态（超时）真体判别：
 *   - 杀 leader 等价（leader UI 队列未注册 → mailbox 回退支；leader 永不写响应）
 *     → deadline 到期 → fail-closed deny（unavailable 语义，非 ask）+ 回合继续
 *     （promise 按 deadline 时长 resolve，不挂死）。
 *   - 注入小 deadlineMs（gate 第 6 参测试注入口）驱动，deadline 早于 500ms poll
 *     首拍 → 超时终态先于 mailbox 轮询生效（timeout-policy「仅本层 timer 先到期
 *     才替换结果」）。
 *
 * 与 e2e V3 探针同源（杀 leader → N 秒 unavailable deny + 进程可退）；本 func 层
 * 锁 timer 行为 + fail-closed 语义 + 不挂死；进程可退性（双 timer unref）由
 * 四件套 exit 0 兜证（若 unref 缺失，bun test 进程会挂起不退出）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Tool, Tools, ToolPermissionContext } from '../../src/shared'
import type { TeammateIdentity } from '../../src/task'
import {
  approvalUnavailableReason,
  createInProcessPermissionGate,
  createTeammateTpcBuilder,
  unregisterLeaderToolUseConfirmQueue,
  writeTeamFileAsync,
  type TeammateToolState,
} from '../../src/swarm'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'

let dir = ''
const TEAM = 't1'
const DEADLINE_MS = 300
/** 看门狗上限：远超 deadline（300ms），仅用于把「挂死」转成显式失败而非无限悬挂。 */
const WATCHDOG_MS = 4000

function fakeTool(name: string): Tool {
  return {
    name,
    description: async () => `fake ${name} desc`,
    userFacingName: () => name,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    prompt: async () => '',
    call: async () => ({ data: {} }),
  } as unknown as Tool
}

const TOOLS: Tools = [fakeTool('Bash')]

const IDENTITY: TeammateIdentity = {
  agentId: 'w1',
  agentName: 'worker-1',
  teamName: TEAM,
  planModeRequired: false,
  parentSessionId: 'parent-1',
}

function fakeAppState(): TeammateToolState {
  const toolPermissionContext: ToolPermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
  return { toolPermissionContext, tasks: {} } as TeammateToolState
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
  dir = mkdtempSync(join(tmpdir(), 'atlas-mailbox-deadline-'))
  process.env.ATLAS_CONFIG_DIR = dir
})

afterEach(() => {
  delete process.env.ATLAS_CONFIG_DIR
  clearDynamicTeamContext()
  unregisterLeaderToolUseConfirmQueue()
  rmSync(dir, { recursive: true, force: true })
})

describe('P1 mailbox 兜底协作式 deadline（func 真盘）', () => {
  test('leader 失响应 → deadline 到期 fail-closed deny（unavailable，非 ask）+ 回合继续', async () => {
    await seedTeamFile()
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'worker-1',
      teamName: TEAM,
      planModeRequired: false,
    })
    // 强制 mailbox 回退支（leader UI 队列不可用 = 杀 leader 等价）
    unregisterLeaderToolUseConfirmQueue()
    const buildTpc = createTeammateTpcBuilder(() => fakeAppState())

    const gate = createInProcessPermissionGate(
      IDENTITY,
      new AbortController(),
      TOOLS,
      () => fakeAppState(),
      buildTpc,
      DEADLINE_MS, // 注入小 deadline 驱动第 4 终态（超时）
    )

    const t0 = Date.now()
    const watchdog = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () =>
          reject(
            new Error(
              `gate 未在 ${WATCHDOG_MS}ms 内 settle（P1 deadline 未生效 / 挂死？）`,
            ),
          ),
        WATCHDOG_MS,
      )
      t.unref?.()
    })
    const res = await Promise.race([gate(TOOLS[0], { command: 'ls' }), watchdog])
    const elapsed = Date.now() - t0

    // 超时终态 = fail-closed deny（unavailable 语义）：allowed=false + reason 逐字 + 无 ask 字段
    expect(res.allowed).toBe(false)
    expect(res.reason).toBe(approvalUnavailableReason(DEADLINE_MS))
    expect(res).not.toHaveProperty('ask')
    // 回合继续（promise 按 deadline 时长 resolve，不挂死）：远早于看门狗上限
    expect(elapsed).toBeLessThan(3000)
    // deadline 真体生效（非即时早退支）：elapsed 落在 deadline 附近
    expect(elapsed).toBeGreaterThanOrEqual(250)
  })
})
