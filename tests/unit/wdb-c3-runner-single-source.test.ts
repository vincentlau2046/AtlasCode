/**
 * 0.1.94 W-D-B 段 C-3 判别格（f4 §13 批复判据面 E 节五项冻结，@master
 * fdbd15dd 工单 §13）：runInProcessTeammate 双副本收敛——TUI twin 副本
 * （tui/utils/swarm/inProcessRunner.ts）直删，InProcessBackend 换道
 * src/swarm 单源（requireStartInProcessTeammate seam 端口 + tui/factory
 * 组合根装配）。
 *
 * 结构断言（import 面计数 + 形锚 regex，§2.6 纪律）：
 *   E① runInProcessTeammate / waitForNextPromptOrShutdown 实现体实例数 = 1
 *      且在 src/swarm；T 副本路径存在性 = false（修前红：双副本）。
 *   E② 修形形锚（0.1.93 全族在单源在场：isInProcessTeammateLive 守卫 /
 *      mailbox deadline settle 首胜闩 / R-⑥ probe）+ 换道 import 形锚
 *     （InProcessBackend requireStartInProcessTeammate + tui/factory
 *      setStartInProcessTeammate / setTeammateToolRegistryDeps 装配 +
 *      eslint tui allow "swarm"）。
 *   E③ A6 有界终止形锚（resolveTerminationSpec(config.termination) +
 *      DEFAULT_TEAMMATE_TERMINATION_SPEC fail-closed 缺省在单源在场；
 *      TUI lane 可达性由 E② 换道 import 直证承载）。
 *   E④ 行为锚：buildTeammateSystemPrompt mainSystemPrompt 两态（不传 =
 *      ADDENDUM-only 缺省恒等 / 传入 = 头部插入拼装序
 *      main→ADDENDUM→custom→append）+ gate onPermissionWaitMs 钩子行为
 *      （leader 队列支 settle 点调用；settleWithWait 站点数 = 5 形锚）。
 *   E⑤ canon Δ 恰合 + 四件套（随收尾报执行，不在本文件）。
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { Tool, Tools, ToolPermissionContext } from '../../src/shared'
import type { TeammateIdentity } from '../../src/task'
import {
  buildTeammateSystemPrompt,
  createInProcessPermissionGate,
  TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
} from '../../src/swarm'
import {
  registerLeaderToolUseConfirmQueue,
  unregisterLeaderToolUseConfirmQueue,
  type ToolUseConfirm,
} from '../../src/swarm/leaderPermissionBridge'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walkTsFiles(p))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

// ── E① 结构断言：双副本收敛单源 ────────────────────────────────────────

describe('W-D-B 段 C-3 判别格 E①：单源结构断言', () => {
  test('runInProcessTeammate 实现体实例数 = 1 且在 src/swarm', () => {
    const files = walkTsFiles(SRC_ROOT)
    const implFiles = files.filter((f) =>
      readFileSync(f, 'utf8').includes(
        'export async function runInProcessTeammate(',
      ),
    )
    expect(implFiles).toHaveLength(1)
    expect(implFiles[0]!.endsWith('src/swarm/inProcessRunner.ts')).toBe(true)
  })

  test('waitForNextPromptOrShutdown 实现体实例数 = 1 且在 src/swarm', () => {
    const files = walkTsFiles(SRC_ROOT)
    const implFiles = files.filter((f) =>
      readFileSync(f, 'utf8').includes(
        'export async function waitForNextPromptOrShutdown(',
      ),
    )
    expect(implFiles).toHaveLength(1)
    expect(implFiles[0]!.endsWith('src/swarm/inProcessRunner.ts')).toBe(true)
  })

  test('T 副本路径存在性 = false（双副本纪律终态）', () => {
    expect(
      existsSync(join(SRC_ROOT, 'tui', 'utils', 'swarm', 'inProcessRunner.ts')),
    ).toBe(false)
  })
})

// ── E② 修形形锚 + 换道 import 形锚 ─────────────────────────────────────

describe('W-D-B 段 C-3 判别格 E②：修形族在单源在场 + 换道形锚', () => {
  test('0.1.93 修形族形锚（isInProcessTeammateLive 守卫 / settle 首胜闩 / R-⑥ probe）', () => {
    const runner = readSrc('swarm/inProcessRunner.ts')
    // R-⑥ 修形：completed 写点守卫（替代 T 副本字面 status !== 'running' 判）
    expect(runner).toMatch(/isInProcessTeammateLive\(/)
    // P1（0.1.36）mailbox deadline settle 首胜闩
    expect(runner).toMatch(/let settled = false/)
    // 0.1.93b R-⑥ task record probe
    expect(runner).toMatch(/probeReadTaskRecordId\(/)
  })

  test('InProcessBackend 换道 import 形锚（requireStartInProcessTeammate seam 端口）', () => {
    // 0.1.95 W-D-C 段 R1（f4 批复 2026-11-11）：backends 双目录全收敛——
    // tui/utils/swarm/backends/ 副本整裁，单源 = src/swarm/backends/。
    // 本形锚自 tui 副本改锚单源（seam 同目录 port import 形不变）。
    const backend = readSrc('swarm/backends/InProcessBackend.ts')
    expect(backend).toMatch(
      /import\s*\{\s*requireStartInProcessTeammate\s*\}\s*from\s*'\.\/inProcessRunnerPort(\.js)?'/,
    )
    expect(backend).toMatch(/requireStartInProcessTeammate\(\)\(\{/)
    // 旧 TUI 副本已整裁（双目录收敛后 tui 侧无 backends 目录）
    expect(existsSync(join(SRC_ROOT, 'tui', 'utils', 'swarm', 'backends'))).toBe(
      false,
    )
  })

  test('tui/factory 组合根装配形锚（setStartInProcessTeammate + setTeammateToolRegistryDeps）', () => {
    const factory = readSrc('tui/factory.ts')
    expect(factory).toContain('setStartInProcessTeammate(startInProcessTeammate)')
    expect(factory).toMatch(
      /setTeammateToolRegistryDeps\(\{\s*baseTools:\s*\[SnipTool,\s*TeamCreateTool,\s*TeamDeleteTool\],?\s*\}\)/,
    )
  })

  test('eslint boundaries tui allow 扩 "swarm"（换道边登记）', () => {
    const cfg = readFileSync(
      join(SRC_ROOT, '..', 'eslint.config.mjs'),
      'utf8',
    )
    expect(cfg).toMatch(/from:\s*"tui"[\s\S]*?allow:\s*\[[\s\S]*?"swarm"/)
  })
})

// ── E③ A6 有界终止形锚 ────────────────────────────────────────────────

describe('W-D-B 段 C-3 判别格 E③：A6 有界终止（TUI lane 换道可达）', () => {
  test('resolveTerminationSpec(config.termination) + fail-closed 缺省在单源在场', () => {
    const runner = readSrc('swarm/inProcessRunner.ts')
    expect(runner).toMatch(/resolveTerminationSpec\(config\.termination\)/)
    expect(runner).toMatch(/DEFAULT_TEAMMATE_TERMINATION_SPEC/)
    // 单一评估点（轮末统一评估）+ per-member stall 循环态
    expect(runner).toMatch(/advanceTerminationLoopState\(/)
  })
})

// ── E④ 行为锚：buildTeammateSystemPrompt 两态 + gate 钩子行为 ──────────

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

const IDENTITY: TeammateIdentity = {
  agentId: 'agent-1',
  agentName: 'worker-1',
  teamName: 'team-1',
  planModeRequired: false,
  parentSessionId: 'parent-1',
}

describe('W-D-B 段 C-3 判别格 E④：buildTeammateSystemPrompt mainSystemPrompt 两态', () => {
  test('不传 = ADDENDUM-only 缺省恒等（engine/compose lane 零变更）', async () => {
    expect(await buildTeammateSystemPrompt({})).toBe(
      TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
    )
  })

  test('传入 = 头部插入，拼装序 main→ADDENDUM→custom→append', async () => {
    const out = await buildTeammateSystemPrompt({
      mainSystemPrompt: 'MAIN',
      systemPrompt: 'APPEND-PART',
      systemPromptMode: 'append',
      agentDefinition: {
        agentType: 'w',
        whenToUse: 'w',
        getSystemPrompt: async () => 'CUSTOM',
      } as never,
    })
    expect(out).toBe(
      ['MAIN', TEAMMATE_SYSTEM_PROMPT_ADDENDUM, '\n# Custom Agent Instructions\nCUSTOM', 'APPEND-PART'].join('\n'),
    )
  })

  test('replace 支不消费 mainSystemPrompt（systemPrompt 直返恒等）', async () => {
    const out = await buildTeammateSystemPrompt({
      mainSystemPrompt: 'MAIN',
      systemPrompt: 'REPLACED',
      systemPromptMode: 'replace',
    })
    expect(out).toBe('REPLACED')
  })
})

describe('W-D-B 段 C-3 判别格 E④：gate onPermissionWaitMs 钩子（leader 队列支）', () => {
  const tools: Tools = [fakeTool('FakeTool')]

  const askTpc = (): ToolPermissionContext => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: { session: ['FakeTool'] },
    isBypassPermissionsModeAvailable: false,
  })

  test('onAllow settle 点回调 waitMs（≥0）且 gate 放行', async () => {
    let queue: ToolUseConfirm[] = []
    registerLeaderToolUseConfirmQueue((updater) => {
      queue = updater(queue)
      return queue
    })
    try {
      const waits: number[] = []
      const gate = createInProcessPermissionGate(
        IDENTITY,
        new AbortController(),
        tools,
        () =>
          ({
            toolPermissionContext: askTpc(),
          }) as never,
        () => askTpc(),
        undefined,
        (waitMs) => waits.push(waitMs),
      )
      const pending = gate(fakeTool('FakeTool'), { arg: 1 })
      // ask → 队列入列（gate 前段决策体/description await 后才入列——
      // 让微任务先行）
      await new Promise((r) => setTimeout(r, 0))
      expect(queue).toHaveLength(1)
      queue[0]!.onAllow?.()
      const res = await pending
      expect(res.allowed).toBe(true)
      expect(waits).toHaveLength(1)
      expect(waits[0]!).toBeGreaterThanOrEqual(0)
    } finally {
      unregisterLeaderToolUseConfirmQueue()
    }
  })

  test('settleWithWait 站点数 = 5（onAbortListener/onAbort/onAllow/onReject/recheck-allow）', () => {
    const runner = readSrc('swarm/inProcessRunner.ts')
    // 5 处调用（+1 处定义）——形锚计数
    expect(runner.match(/settleWithWait\(\)/g)?.length).toBe(5)
    // mailbox 回退支不调用（第 7 参只进 leader 队列支；mailbox 支 settle
    // 链 settled/settle( 不经 settleWithWait）
    const mailboxBranch = runner.slice(
      runner.indexOf('Fallback: use mailbox system'),
    )
    expect(mailboxBranch).not.toContain('settleWithWait()')
  })
})
