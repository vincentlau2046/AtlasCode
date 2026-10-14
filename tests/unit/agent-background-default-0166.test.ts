/**
 * 0.1.66 Q3-2 a1 翻转波 判别单测（工单 §2 判据矩阵）
 *
 * on 面（env 缺省 = 后台默认）/ off 面（env=1 = 现行为恒等）双面同 gate 闭环。
 *
 * 判别项：
 *   ① 引擎侧翻默认（on 面）：缺省 → async_launched / 显式 false → completed
 *   ② 逃生舱 env（off 面）：env=1 → 缺省 = completed（现行为恒等）
 *   ③ 逃生舱 env（on 面 variant）：env=0 / 非法值 → 缺省 = async_launched（fail-safe）
 *   ④ 提示词默认句（engine + TUI）：新「background by default」在场 + 旧「foreground (default)」离场
 *   ⑤ 后台追踪器（R4 drain）：track → hasPending → drain → settled
 *   ⑥ 显式参数跨 on/off 恒等：true=后台 / false=前景 两面一致
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  AgentTool,
  setTaskNotificationHandler,
  resetTaskNotificationHandler,
  trackBackgroundAgent,
  drainPendingBackgroundAgents,
  hasPendingBackgroundAgents,
  resetBackgroundAgentTracker,
} from '../../src/engine'
import { setDiskOutputEnv, resetDiskOutputEnv } from '../../src/task'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── fake LLM（engine-agent-tool.test.ts 同款 ModelProvider 接口替身）──
function fakeProvider(content: unknown[]): ModelProvider {
  let i = 0
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被消费')
  }
  return {
    chat: async () => {
      const step = content[Math.min(i, content.length - 1)]
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-09-23T00:00:00Z',
        message: {
          id: 'm' + i,
          model: 'fake',
          role: 'assistant',
          content: Array.isArray(step) ? step : [step],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
  } as ModelProvider
}

const ENV_VAR = 'ATLAS_AGENT_DEFAULT_FOREGROUND'
const BG_TMP = mkdtempSync(join(tmpdir(), 'atlas-agent-bg-0166-'))

describe('0.1.66 ① 引擎侧翻默认（on 面：env 缺省 = 后台默认）', () => {
  let savedEnv: string | undefined
  let capturedNotifications: { value: string; mode: string }[]

  beforeEach(() => {
    savedEnv = process.env[ENV_VAR]
    delete process.env[ENV_VAR]
    capturedNotifications = []
    setTaskNotificationHandler(n => {
      capturedNotifications.push({ value: n.value, mode: n.mode })
    })
    setDiskOutputEnv({
      getProjectTempDir: () => BG_TMP,
      getSessionId: () => 'agent-bg-0166-sess',
    })
    resetBackgroundAgentTracker()
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_VAR]
    else process.env[ENV_VAR] = savedEnv
    resetTaskNotificationHandler()
    resetDiskOutputEnv()
    resetBackgroundAgentTracker()
  })

  test('缺省 run_in_background → async_launched（后台默认）', async () => {
    const provider = fakeProvider([{ type: 'text', text: 'bg-result' }])
    const res = await AgentTool.call(
      { description: 'bg default', prompt: 'do bg' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    const data = res.data as { status: string; agentId: string }
    expect(data.status).toBe('async_launched')
    expect(data.agentId).toBeDefined()
  })

  test('显式 run_in_background:false → completed（前景同步）', async () => {
    const provider = fakeProvider([{ type: 'text', text: 'sync-result' }])
    const res = await AgentTool.call(
      { description: 'fg explicit', prompt: 'do sync', run_in_background: false },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    const data = res.data as { status: string; content: { text: string }[] }
    expect(data.status).toBe('completed')
    expect(data.content).toEqual([{ type: 'text', text: 'sync-result' }])
  })
})

describe('0.1.66 ② 逃生舱 env（off 面：env=1 = 现行为恒等）', () => {
  let savedEnv: string | undefined
  let capturedNotifications: { value: string; mode: string }[]

  beforeEach(() => {
    savedEnv = process.env[ENV_VAR]
    process.env[ENV_VAR] = '1'
    capturedNotifications = []
    setTaskNotificationHandler(n => {
      capturedNotifications.push({ value: n.value, mode: n.mode })
    })
    setDiskOutputEnv({
      getProjectTempDir: () => BG_TMP,
      getSessionId: () => 'agent-bg-0166-sess',
    })
    resetBackgroundAgentTracker()
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_VAR]
    else process.env[ENV_VAR] = savedEnv
    resetTaskNotificationHandler()
    resetDiskOutputEnv()
    resetBackgroundAgentTracker()
  })

  test('env=1 + 缺省 run_in_background → completed（前景同步，现行为恒等）', async () => {
    const provider = fakeProvider([{ type: 'text', text: 'sync-result' }])
    const res = await AgentTool.call(
      { description: 'fg default', prompt: 'do sync' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    const data = res.data as { status: string; content: { text: string }[] }
    expect(data.status).toBe('completed')
    expect(data.content).toEqual([{ type: 'text', text: 'sync-result' }])
    // 同步路径无通知注入
    expect(capturedNotifications.length).toBe(0)
  })

  test('env=1 + 显式 run_in_background:true → async_launched（显式后台跨 on/off 恒等）', async () => {
    const provider = fakeProvider([{ type: 'text', text: 'bg-result' }])
    const res = await AgentTool.call(
      { description: 'bg explicit', prompt: 'do bg', run_in_background: true },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    const data = res.data as { status: string }
    expect(data.status).toBe('async_launched')
  })
})

describe('0.1.66 ③ 逃生舱 env（on 面 variant：env=0 / 非法值 = 后台默认 fail-safe）', () => {
  let savedEnv: string | undefined

  beforeEach(() => {
    savedEnv = process.env[ENV_VAR]
    setDiskOutputEnv({
      getProjectTempDir: () => BG_TMP,
      getSessionId: () => 'agent-bg-0166-sess',
    })
    resetBackgroundAgentTracker()
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_VAR]
    else process.env[ENV_VAR] = savedEnv
    resetDiskOutputEnv()
    resetBackgroundAgentTracker()
  })

  test('env=0 + 缺省 → async_launched（0 = 显式假 = 后台默认）', async () => {
    process.env[ENV_VAR] = '0'
    const provider = fakeProvider([{ type: 'text', text: 'bg' }])
    const res = await AgentTool.call(
      { description: 'env0', prompt: 'do' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    expect((res.data as { status: string }).status).toBe('async_launched')
  })

  test('env=garbage + 缺省 → async_launched（非法值 fail-safe = 后台默认）', async () => {
    process.env[ENV_VAR] = 'garbage'
    const provider = fakeProvider([{ type: 'text', text: 'bg' }])
    const res = await AgentTool.call(
      { description: 'env-garbage', prompt: 'do' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    expect((res.data as { status: string }).status).toBe('async_launched')
  })
})

// ── 提示词默认句翻转（静态 grep，0.1.55 先例通道）──

function readRepo(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
}

describe('0.1.66 ④ 提示词默认句翻转', () => {
  test('engine prompt：新「background by default」句在场', () => {
    const text = readRepo('src/engine/tools/agent/prompt.ts')
    expect(text.includes('background by default')).toBe(true)
  })

  test('engine prompt：旧「Set run_in_background to true to launch」句离场', () => {
    const text = readRepo('src/engine/tools/agent/prompt.ts')
    expect(
      text.includes('Set run_in_background to true to launch'),
      'engine prompt 旧默认句未裁（应翻转为 background by default）',
    ).toBe(false)
  })

  test('TUI prompt：新「background by default」句在场', () => {
    const text = readRepo('src/tui/tools/AgentTool/prompt.ts')
    expect(text.includes('background by default')).toBe(true)
  })

  test('TUI prompt：旧「foreground (default)」句离场', () => {
    const text = readRepo('src/tui/tools/AgentTool/prompt.ts')
    expect(
      text.includes('foreground (default)'),
      'TUI prompt 旧默认句未裁（应翻转为 background by default）',
    ).toBe(false)
  })

  test('TUI prompt + engine prompt：零 1P 引用（BR-8/1P 裁面延续）', () => {
    const tuiText = readRepo('src/tui/tools/AgentTool/prompt.ts')
    const engText = readRepo('src/engine/tools/agent/prompt.ts')
    for (const banned of ['claude.ai', 'Anthropic', 'Claude Code']) {
      expect(tuiText.includes(banned)).toBe(false)
      expect(engText.includes(banned)).toBe(false)
    }
  })
})

// ── 后台追踪器（R4 drain 面）──

describe('0.1.66 ⑤ 后台追踪器（R4 drain 面）', () => {
  beforeEach(() => {
    resetBackgroundAgentTracker()
  })
  afterEach(() => {
    resetBackgroundAgentTracker()
  })

  test('trackBackgroundAgent → hasPending=true；settle → hasPending=false', async () => {
    let resolveFn!: () => void
    const p = new Promise<void>(resolve => {
      resolveFn = resolve
    })
    trackBackgroundAgent(p)
    expect(hasPendingBackgroundAgents()).toBe(true)
    resolveFn()
    await p
    // finally 移除是 microtask
    await new Promise(r => setTimeout(r, 10))
    expect(hasPendingBackgroundAgents()).toBe(false)
  })

  test('drainPendingBackgroundAgents：await 全 pending 后返回', async () => {
    let resolveA!: () => void
    let resolveB!: () => void
    const pA = new Promise<void>(r => { resolveA = r })
    const pB = new Promise<void>(r => { resolveB = r })
    trackBackgroundAgent(pA)
    trackBackgroundAgent(pB)
    expect(hasPendingBackgroundAgents()).toBe(true)
    // 异步 resolve
    setTimeout(() => { resolveA(); resolveB() }, 10)
    await drainPendingBackgroundAgents()
    expect(hasPendingBackgroundAgents()).toBe(false)
  })

  test('drainPendingBackgroundAgents：空池即返回（零 pending）', async () => {
    expect(hasPendingBackgroundAgents()).toBe(false)
    await drainPendingBackgroundAgents()
  })

  test('drainPendingBackgroundAgents：单个 reject 不阻断（allSettled）', async () => {
    const pReject = Promise.reject(new Error('agent boom'))
    const pOK = Promise.resolve()
    trackBackgroundAgent(pReject)
    trackBackgroundAgent(pOK)
    // allSettled 不抛
    await drainPendingBackgroundAgents()
    expect(hasPendingBackgroundAgents()).toBe(false)
  })
})
