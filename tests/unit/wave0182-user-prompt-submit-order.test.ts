/**
 * 0.1.82 K3-A3+A4 判别单测：UserPromptSubmit 钩子先于 slash/skill 展开（上游 300 对齐）。
 *
 * 红基线 = 8404fd0：processUserInput 流程 = processUserInputBase（slash/skill
 * 展开）先行 → !shouldQuery 早退 → 钩子后置执行。三处红点：
 *  - ① 顺序：基线 slash 先于钩子跑 → 修后钩子先于展开
 *  - ② 拦截即停：基线 blocking 钩子在 slash 命令**已执行后**才拦截（本地命令
 *    面根本不跑钩子）→ 修后 blocking 时命令不执行
 *  - ③（K3-A4）skill frontmatter 时机：基线 skill 展开注册的 UserPromptSubmit
 *    钩子**当轮即触发** → 修后首跑 = 调用该 skill 的下一条提示
 *
 * 恒等锚（基线绿锁定，防修坏既有语义）：
 *  - ④ 普通提示 + additionalContext 消息序不变（用户提示在前，钩子上下文追加在后）
 *  - ⑤ preventContinuation 停止但保留原提示 + 停止消息
 *
 * 测试面：真 API（executeUserPromptSubmitHooks + appState.sessionHooks 的
 * callback 钩子，内存执行无 shell）；仅 mock ./processSlashCommand.js（4 导出
 * 面补齐——mock.module 同进程泄漏坑，见 memory mock-module-export-surface）。
 */
import { describe, test, expect, mock } from 'bun:test'

const SESSION_ID = 'wave0182-ups-session'

// ---- mock ./processSlashCommand.js：记录展开事件 + 可选展开期副作用 ----
type SlashScenario = {
  events: string[]
  shouldQuery: boolean
  onExpand?: () => void
}
let slashScenario: SlashScenario | null = null

mock.module(
  '../../src/tui/utils/processUserInput/processSlashCommand.js',
  () => ({
    looksLikeCommand: (_commandName: string) => true,
    processSlashCommand: async () => {
      if (!slashScenario) throw new Error('slashScenario not set')
      slashScenario.events.push('slash-ran')
      slashScenario.onExpand?.()
      return {
        messages: [
          {
            type: 'user',
            message: { role: 'user', content: 'expanded-prompt' },
          },
        ],
        shouldQuery: slashScenario.shouldQuery,
        allowedTools: [],
      }
    },
    formatSkillLoadingMetadata: () => '',
    processPromptSlashCommand: async () => ({
      messages: [],
      shouldQuery: true,
    }),
  }),
)

const { processUserInput } = await import(
  '../../src/tui/utils/processUserInput/processUserInput.js'
)

type UpsHarness = {
  events: string[]
  sessionHooks: Map<string, unknown>
  context: Parameters<typeof processUserInput>[0]['context']
}

/** callback 钩子（内存执行）+ fake appState.sessionHooks。 */
function makeHarness(hookJson: (() => unknown) | null): UpsHarness {
  const events: string[] = []
  const sessionHooks = new Map<string, unknown>()
  if (hookJson) {
    sessionHooks.set(SESSION_ID, {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                hook: {
                  type: 'callback',
                  callback: async () => {
                    events.push('hook-ran')
                    return hookJson()
                  },
                },
              },
            ],
          },
        ],
      },
    })
  }
  const appState = {
    sessionHooks,
    toolPermissionContext: { mode: 'default' },
    options: {},
  }
  const context = {
    getAppState: () => appState,
    abortController: new AbortController(),
    agentId: SESSION_ID,
    options: {},
  } as unknown as Parameters<typeof processUserInput>[0]['context']
  return { events, sessionHooks, context }
}

async function run(
  context: Parameters<typeof processUserInput>[0]['context'],
  input: string,
) {
  return await processUserInput({
    input,
    mode: 'prompt',
    setToolJSX: () => {},
    context,
    skipAttachments: true,
  })
}

describe('K3-A3 UserPromptSubmit 钩子先于 slash/skill 展开（红基线 8404fd0）', () => {
  test('① 顺序：钩子先于展开执行（基线 = slash 先 → 红）', async () => {
    const h = makeHarness(() => ({}))
    slashScenario = { events: h.events, shouldQuery: true }
    await run(h.context, '/fake-cmd arg')
    expect(h.events).toEqual(['hook-ran', 'slash-ran'])
  })

  test('② 拦截即停：blocking 钩子时 slash 命令不执行 + 系统消息（基线 = 命令已执行 → 红）', async () => {
    const h = makeHarness(() => ({
      decision: 'block',
      reason: 'WAVE0182-BLOCK',
    }))
    slashScenario = { events: h.events, shouldQuery: true }
    const result = await run(h.context, '/fake-cmd arg')
    expect(h.events).not.toContain('slash-ran')
    expect(result.shouldQuery).toBe(false)
    const sys = result.messages[0] as unknown as {
      type: string
      content: string
    }
    expect(sys.type).toBe('system')
    expect(sys.content).toContain('WAVE0182-BLOCK')
    expect(sys.content).toContain('Original prompt: /fake-cmd arg')
  })

  test('②b 拦截即停（本地命令面）：blocking 时本地命令不执行（基线 = 钩子根本不跑 → 红）', async () => {
    const h = makeHarness(() => ({
      decision: 'block',
      reason: 'WAVE0182-BLOCK-LOCAL',
    }))
    slashScenario = { events: h.events, shouldQuery: false }
    const result = await run(h.context, '/help')
    expect(h.events).not.toContain('slash-ran')
    expect(result.shouldQuery).toBe(false)
    const sys = result.messages[0] as unknown as {
      type: string
      content: string
    }
    expect(sys.type).toBe('system')
    expect(sys.content).toContain('WAVE0182-BLOCK-LOCAL')
  })

  test('⑥ 新语义锁：本地命令也先跑钩子（非阻塞输出丢弃；基线 = 钩子不跑 → 红）', async () => {
    const h = makeHarness(() => ({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'WAVE0182-DISCARDED-CTX',
      },
    }))
    slashScenario = { events: h.events, shouldQuery: false }
    const result = await run(h.context, '/help')
    // 钩子先行执行
    expect(h.events).toEqual(['hook-ran', 'slash-ran'])
    // 本地命令结果原样（无查询 → additionalContext 丢弃）
    expect(result.shouldQuery).toBe(false)
    expect(JSON.stringify(result.messages)).not.toContain(
      'WAVE0182-DISCARDED-CTX',
    )
  })
})

describe('K3-A4 skill frontmatter UserPromptSubmit 钩子首跑时机（红基线 8404fd0）', () => {
  test('③ 首跑 = 调用该 skill 的下一条提示，非当轮（基线 = 当轮即触发 → 红）', async () => {
    const h = makeHarness(null) // 初始无钩子
    const skillHook = {
      type: 'callback',
      callback: async () => {
        h.events.push('skill-hook-ran')
        return {}
      },
    }
    slashScenario = {
      events: h.events,
      shouldQuery: true,
      onExpand: () => {
        // 模拟 skill frontmatter 注册：展开期写入 sessionHooks
        h.sessionHooks.set(SESSION_ID, {
          hooks: {
            UserPromptSubmit: [
              { matcher: '', hooks: [{ hook: skillHook }] },
            ],
          },
        })
      },
    }
    // 调用当轮：skill 展开注册钩子，但钩子不触发（基线 = 当轮触发 → 红）
    await run(h.context, '/my-skill do stuff')
    expect(h.events).toEqual(['slash-ran'])
    // 下一条提示：frontmatter 钩子首跑（先于本轮展开）
    await run(h.context, '/my-skill again')
    expect(h.events).toEqual(['slash-ran', 'skill-hook-ran', 'slash-ran'])
  })
})

describe('K3-A3 恒等锚（基线绿锁定，防移序修坏既有语义）', () => {
  test('④ 普通提示 + additionalContext：消息序不变（用户提示在前，钩子上下文追加在后）', async () => {
    const h = makeHarness(() => ({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'WAVE0182-CTX',
      },
    }))
    slashScenario = null // 纯文本路径，不走 slash
    const result = await run(h.context, 'hello world')
    expect(result.shouldQuery).toBe(true)
    const serialized = result.messages.map(m => JSON.stringify(m))
    const userIdx = serialized.findIndex(s => s.includes('hello world'))
    const ctxIdx = serialized.findIndex(s => s.includes('WAVE0182-CTX'))
    expect(userIdx).toBeGreaterThanOrEqual(0)
    expect(ctxIdx).toBeGreaterThan(userIdx)
  })

  test('⑤ preventContinuation：停止查询但保留原提示 + 停止消息', async () => {
    const h = makeHarness(() => ({
      continue: false,
      stopReason: 'WAVE0182-STOP',
    }))
    slashScenario = { events: h.events, shouldQuery: true }
    const result = await run(h.context, '/fake-cmd arg')
    expect(result.shouldQuery).toBe(false)
    const serialized = JSON.stringify(result.messages)
    expect(serialized).toContain('Operation stopped by hook: WAVE0182-STOP')
    // 原提示（展开产物）保留在上下文
    expect(serialized).toContain('expanded-prompt')
  })
})
