import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  SendMessageTool,
  resetNameRouterPort,
  setNameRouterPort,
  type SendMessageNameRouterPort,
} from '../../src/engine'

/**
 * 0.1.94 W-D-B 段 C-2 判别格（f4 §10④ 判据面冻结 + §11 承载形批复）：
 * SendMessageTool 双副本收敛——engine 副本为单源基座（round-3/6/7 修形
 * 活态），TUI 927L 副本裁除为薄 wrapper（TUI 契约胶水面）；名路由支收窄
 * 并集（裁 evicted 兜底支）+ handleShutdownApproval 并集（pane 富化 +
 * status 判补 + selfTerminate port）+ backfillObservableInput/targetColor
 * UX 观测面保留适配 + TaskOutput 缝修（AgentTool async spawn 补注册）。
 *
 * 结构断言（import 面/源形 regex 计数——§2.6 形锚纪律，禁子串 grep）：
 *   ① 逻辑实现体实例数 = 1（handleShutdownApproval/handleBroadcast 各唯一，
 *     修前 = 2，红）
 *   ② TUI wrapper 零逻辑实现体 + engine 门面消费形（修前 TUI 副本内联
 *     实现，红）
 *   ③ 旧 prompt.ts 已直删（feature() 编译门 prompt 面裁除，修前存在，红）
 *   ④ evicted 兜底支已裁（engine 源无 'resumed from transcript' 文案形，
 *     修前 TUI 副本在场；随 ② 副本裁除等价红）
 *   ⑤ AgentTool async spawn 补注册（registerAsyncAgent + runAsyncAgentLifecycle
 *     resume 链全形，修前缺席，红）
 * 行为恒等格：
 *   ⑥ 名路由 running 支 → queuePendingMessage（port 注入制）
 *   ⑦ 名路由 stopped 支 → resumeAgent
 *   ⑧ backfillObservableInput 观测回填（纯函数三形态）
 */

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

describe('W-D-B 段 C-2 SendMessageTool 单源化判别格', () => {
  test('① 逻辑实现体实例数 = 1（engine/tools/team 单源）', () => {
    const files = walkTsFiles(SRC_ROOT)
    for (const marker of [
      'async function handleShutdownApproval(',
      'async function handleBroadcast(',
      'async function handleMessage(',
    ]) {
      const implFiles = files.filter((f) =>
        readFileSync(f, 'utf8').includes(marker),
      )
      expect(marker).toBeTruthy()
      expect(implFiles).toHaveLength(1)
      expect(implFiles[0]!.replaceAll('\\', '/')).toContain(
        'src/engine/tools/team/sendMessageTool.ts',
      )
    }
  })

  test('② TUI wrapper 零逻辑实现体 + engine 门面消费形', () => {
    const p = join(
      SRC_ROOT,
      'tui',
      'tools',
      'SendMessageTool',
      'SendMessageTool.ts',
    )
    expect(existsSync(p)).toBe(true)
    const src = readFileSync(p, 'utf8')
    // wrapper 不携带任何 handler 实现体（regex 形锚；agentNameRegistry/
    // gracefulShutdown 等 tui 符号经 port 原语在位 = 承载对象本体，不禁）
    expect(/async function handle\w+\(/.test(src)).toBe(false)
    expect(/const appState = context\.getAppState\(\)\s*\n\s*const registered/.test(src)).toBe(false)
    // engine 门面消费（boundaries entry-point 纪律）
    expect(/from 'src\/engine'/.test(src)).toBe(true)
    // port 注入形在位（f4 §11①②）
    expect(/setNameRouterPort\(/.test(src)).toBe(true)
    expect(/setSelfTerminatePort\(/.test(src)).toBe(true)
  })

  test('③ 旧 prompt.ts 已直删（feature() 编译门 prompt 面）', () => {
    expect(
      existsSync(join(SRC_ROOT, 'tui', 'tools', 'SendMessageTool', 'prompt.ts')),
    ).toBe(false)
  })

  test('④ evicted-transcript-resume 兜底支已裁（收窄形，f4 §10①）', () => {
    const files = walkTsFiles(SRC_ROOT)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      // regex 形锚：evicted 兜底文案形（旧 TUI 副本 'had no active task;
      // resumed from transcript' 消息字面）全仓 0
      expect(/had no active task; resumed from transcript/.test(src)).toBe(false)
    }
  })

  test('⑤ AgentTool async spawn 补注册（resume 链全形）', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'tui', 'tools', 'AgentTool', 'AgentTool.ts'),
      'utf8',
    )
    expect(/registerAsyncAgent\(\{/.test(src)).toBe(true)
    expect(/runAsyncAgentLifecycle\(\{/.test(src)).toBe(true)
  })

  test('⑥ 名路由 running 支 → queuePendingMessage（port 注入制）', async () => {
    const queued: Array<{ agentId: string; message: string }> = []
    const port: SendMessageNameRouterPort = {
      resolveAgentId: (name) => (name === 'worker-a' ? 'a1234567890abcdef' : undefined),
      getTaskState: () => ({ status: 'running' }),
      isRoutableAgentTask: () => true,
      queuePendingMessage: (agentId, message) => {
        queued.push({ agentId, message })
      },
      resumeAgent: async () => {
        throw new Error('not expected on running leg')
      },
    }
    setNameRouterPort(port)
    try {
      const result = (await SendMessageTool.call(
        { to: 'worker-a', summary: 's', message: 'hello' },
        {
          getAppState: () =>
            ({
              teamContext: { teamName: 't', leadAgentId: 'lead' },
              toolPermissionContext: { mode: 'default' },
            }) as never,
        },
      )) as { data: { success: boolean; message: string } }
      expect(result.data.success).toBe(true)
      expect(result.data.message).toBe(
        'Message queued for delivery to worker-a at its next tool round.',
      )
      expect(queued).toEqual([
        { agentId: 'a1234567890abcdef', message: 'hello' },
      ])
    } finally {
      resetNameRouterPort()
    }
  })

  test('⑦ 名路由 stopped 支 → resumeAgent', async () => {
    const port: SendMessageNameRouterPort = {
      resolveAgentId: (name) => (name === 'worker-b' ? 'a1234567890abcdef' : undefined),
      getTaskState: () => ({ status: 'stopped' }),
      isRoutableAgentTask: () => true,
      queuePendingMessage: () => {
        throw new Error('not expected on stopped leg')
      },
      resumeAgent: async (args) => {
        expect(args.agentId).toBe('a1234567890abcdef')
        expect(args.prompt).toBe('wake up')
        return { outputFile: '/tmp/out.jsonl' }
      },
    }
    setNameRouterPort(port)
    try {
      const result = (await SendMessageTool.call(
        { to: 'worker-b', summary: 's', message: 'wake up' },
        {
          getAppState: () =>
            ({
              teamContext: { teamName: 't', leadAgentId: 'lead' },
              toolPermissionContext: { mode: 'default' },
            }) as never,
        },
      )) as { data: { success: boolean; message: string } }
      expect(result.data.success).toBe(true)
      expect(result.data.message).toBe(
        'Agent "worker-b" was stopped (stopped); resumed it in the background with your message. You\'ll be notified when it finishes. Output: /tmp/out.jsonl',
      )
    } finally {
      resetNameRouterPort()
    }
  })

  test('⑧ backfillObservableInput 观测回填三形态', () => {
    const plain: Record<string, unknown> = { to: 'a', message: 'x' }
    SendMessageTool.backfillObservableInput?.(plain)
    expect(plain.type).toBe('message')
    expect(plain.recipient).toBe('a')
    expect(plain.content).toBe('x')

    const broadcast: Record<string, unknown> = { to: '*', message: 'y' }
    SendMessageTool.backfillObservableInput?.(broadcast)
    expect(broadcast.type).toBe('broadcast')
    expect(broadcast.content).toBe('y')

    const structured: Record<string, unknown> = {
      to: 'a',
      message: { type: 'shutdown_response', request_id: 'r1', approve: true },
    }
    SendMessageTool.backfillObservableInput?.(structured)
    expect(structured.type).toBe('shutdown_response')
    expect(structured.recipient).toBe('a')
    expect(structured.request_id).toBe('r1')
    expect(structured.approve).toBe(true)
  })
})
