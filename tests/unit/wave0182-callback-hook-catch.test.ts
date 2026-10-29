/**
 * 0.1.82 K3-A5 判别单测：callback 钩子 reject（抛错/超时中止）fail-soft。
 *
 * 红基线 = 8404fd0：executeHooks 的 `type:'callback'` 分支
 * `yield executeHookCallback({...}).finally(cleanup)` **无 catch**——callback
 * 钩子抛错穿透 async generator，崩掉消费方 for-await（processUserInput 整条
 * prompt 提交流 reject）。对照面：function 钩子有内部 try/catch（安全）、
 * command 族在 try 块内 yield hook_non_blocking_error（fail-soft）。
 *
 * 修后：callback 分支加 `.catch`（仅 reject 路径跑）转 hook_non_blocking_error
 * 结果（镜像 command 分支 catch 形状），prompt 流继续；成功路径零变更。
 *
 * 测试面：真 API（executeUserPromptSubmitHooks + appState.sessionHooks 的
 * callback 钩子，内存执行无 shell）；仅 mock ./processSlashCommand.js（4 导出
 * 面补齐——mock.module 同进程泄漏坑，见 memory mock-module-export-surface）。
 */
import { describe, test, expect, mock } from 'bun:test'

const SESSION_ID = 'wave0182-cbcatch-session'

let slashRan: string[] = []
let slashShouldQuery = true

mock.module(
  '../../src/tui/utils/processUserInput/processSlashCommand.js',
  () => ({
    looksLikeCommand: (_commandName: string) => true,
    processSlashCommand: async () => {
      slashRan.push('slash-ran')
      return {
        messages: [
          {
            type: 'user',
            message: { role: 'user', content: 'expanded-prompt' },
          },
        ],
        shouldQuery: slashShouldQuery,
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

/** callback 钩子（内存执行）+ fake appState.sessionHooks。 */
function makeHarness(hookCallback: () => Promise<unknown>) {
  const sessionHooks = new Map<string, unknown>()
  sessionHooks.set(SESSION_ID, {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [{ hook: { type: 'callback', callback: hookCallback } }],
        },
      ],
    },
  })
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
  return { context }
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

describe('K3-A5 callback 钩子 reject fail-soft（红基线 8404fd0 reject 穿透）', () => {
  test('① 行为红例：钩子抛错 → prompt 流不崩 + hook_non_blocking_error 入上下文（基线 = processUserInput reject → 红）', async () => {
    slashRan = []
    const h = makeHarness(async () => {
      throw new Error('WAVE0182-CB-THROW')
    })
    const result = await run(h.context, '/fake-cmd arg')
    // 展开照常执行（fail-soft：钩子错误不拦截 prompt）
    expect(slashRan).toEqual(['slash-ran'])
    expect(result.shouldQuery).toBe(true)
    // 错误转 hook_non_blocking_error attachment（非 blocking、非 crash）
    const serialized = JSON.stringify(result.messages)
    expect(serialized).toContain('hook_non_blocking_error')
    expect(serialized).toContain('WAVE0182-CB-THROW')
  })

  test('② 本地命令面恒等：钩子抛错 → 本地命令照常返回（基线 = reject → 红）', async () => {
    slashRan = []
    slashShouldQuery = false
    const h = makeHarness(async () => {
      throw new Error('WAVE0182-CB-THROW-LOCAL')
    })
    const result = await run(h.context, '/help')
    slashShouldQuery = true
    expect(slashRan).toEqual(['slash-ran'])
    expect(result.shouldQuery).toBe(false)
  })

  test('③ 成功路径恒等锚：正常钩子 → 无错误 attachment（catch 不跑）', async () => {
    slashRan = []
    const h = makeHarness(async () => ({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'WAVE0182-CB-OK-CTX',
      },
    }))
    const result = await run(h.context, '/fake-cmd arg')
    expect(result.shouldQuery).toBe(true)
    const serialized = JSON.stringify(result.messages)
    expect(serialized).toContain('WAVE0182-CB-OK-CTX')
    expect(serialized).not.toContain('hook_non_blocking_error')
    expect(serialized).not.toContain('Failed to run')
  })
})
