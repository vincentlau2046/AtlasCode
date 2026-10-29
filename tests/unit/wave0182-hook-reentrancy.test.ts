/**
 * 0.1.82 K3-A8 判别单测：hook 重入死循环断根（上游 299 对齐）。
 *
 * 上游语义：mod hook 等待另一 mod 提供的名词（工具/事件）时，hook 执行子树
 * 内再次分派回**同一 hook** → 无限重跑。本仓活面 = in-process hook
 * （callback/function/prompt/agent/http）执行中触发工具/事件 → 同一 hook
 * 再次分派。
 *
 * 红基线 = 97fdf8f（含 A7）：分派面无重入门——
 *  - 纯函数面：无 isReentrantHook / runWithHookReentrancy 导出；
 *  - 行为面：callback 钩子内再触发同一 hook 事件（executeHooksOutsideREPL
 *    同钩子重分派）→ 递归无界（红例以 50 深度哨兵截断，断言 callCount===1
 *    基线必然 >1 → 红）。
 *
 * 修后：AsyncLocalStorage 键控重入守卫（先例 src/swarm/teammateContext.ts）
 * ——仅**嵌套调用链**内可见（hook 自身执行子树），并行兄弟分派（各自独立
 * 上下文）不受影响；重入分派返回 skip 结果（face-2 succeeded:true + 提示
 * 文本，face-1 outcome:'success' 无 message 不污染上下文）。
 */
import { describe, test, expect } from 'bun:test'
import { switchSession } from '../../src/bootstrap/state.js'

const SESSION_ID = 'wave0182-reentrant-session'
switchSession(SESSION_ID)

function preToolUseInput() {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    session_id: SESSION_ID,
  }
}

function makeAppState(callback: () => Promise<unknown>) {
  return {
    sessionHooks: new Map<string, unknown>([
      [
        SESSION_ID,
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '',
                hooks: [{ hook: { type: 'callback', callback } }],
              },
            ],
          },
        },
      ],
    ]),
    options: {},
  }
}

describe('K3-A8 纯函数矩阵（基线缺导出 → 红）', () => {
  test('① 身份键稳定：同 hook 对象两次取键同串', async () => {
    const { getHookReentrancyKey } = await import(
      '../../src/tui/utils/hooks/hookReentrancy.js'
    )
    const hook = { type: 'command', command: 'echo hi' }
    expect(getHookReentrancyKey('PreToolUse', hook)).toBe(
      getHookReentrancyKey('PreToolUse', hook),
    )
  })

  test('② 缺省非重入：无执行上下文时 false', async () => {
    const { isReentrantHook } = await import(
      '../../src/tui/utils/hooks/hookReentrancy.js'
    )
    expect(isReentrantHook('PreToolUse', { type: 'command', command: 'x' })).toBe(
      false,
    )
  })

  test('③ runWith 内重入 true、退出后 false', async () => {
    const { isReentrantHook, runWithHookReentrancy } = await import(
      '../../src/tui/utils/hooks/hookReentrancy.js'
    )
    const hook = { type: 'command', command: 'x' }
    let inside = false
    runWithHookReentrancy('PreToolUse', hook, undefined, async () => {
      inside = isReentrantHook('PreToolUse', hook)
    })
    expect(inside).toBe(true)
    expect(isReentrantHook('PreToolUse', hook)).toBe(false)
  })

  test('④ 并行兄弟不互斥：并发两个 runWith 各自只见自己', async () => {
    const { isReentrantHook, runWithHookReentrancy } = await import(
      '../../src/tui/utils/hooks/hookReentrancy.js'
    )
    const hookA = { type: 'command', command: 'a' }
    const hookB = { type: 'command', command: 'b' }
    const probe = async (self: object, other: object) => {
      // 各自执行子树内：自己在场、对方不在场（兄弟分派不受影响）
      return runWithHookReentrancy('PreToolUse', self, undefined, async () => {
        await Promise.resolve()
        return {
          selfIn: isReentrantHook('PreToolUse', self),
          otherIn: isReentrantHook('PreToolUse', other),
        }
      })
    }
    const [a, b] = await Promise.all([
      probe(hookA, hookB),
      probe(hookB, hookA),
    ])
    expect(a.selfIn).toBe(true)
    expect(a.otherIn).toBe(false)
    expect(b.selfIn).toBe(true)
    expect(b.otherIn).toBe(false)
  })

  test('⑤ 不同 hook 不互斥：runWith(A) 内检查 B 非重入', async () => {
    const { isReentrantHook, runWithHookReentrancy } = await import(
      '../../src/tui/utils/hooks/hookReentrancy.js'
    )
    const hookA = { type: 'command', command: 'a' }
    const hookB = { type: 'command', command: 'b' }
    let bReentrant = true
    await runWithHookReentrancy('PreToolUse', hookA, undefined, async () => {
      bReentrant = isReentrantHook('PreToolUse', hookB)
    })
    expect(bReentrant).toBe(false)
  })
})

describe('K3-A8 行为红例：hook 内再触发同事件不再重跑（基线递归无界 → 红）', () => {
  test('⑥ callback 钩子内重分派同 hook → 单次执行 + 内层 skip 结果', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    let callCount = 0
    let innerResults: Array<{ succeeded: boolean; output: string }> = []
    const callback = async () => {
      callCount++
      if (callCount > 50) throw new Error('WAVE0182-LOOP-DETECTED') // 深度哨兵（基线触发）
      // 模拟「等另一 mod 名词」：hook 执行子树内再次分派同一 hook 事件
      innerResults = (await executeHooksOutsideREPL({
        getAppState: () => makeAppState(callback),
        hookInput: preToolUseInput(),
        timeoutMs: 5000,
      })) as Array<{ succeeded: boolean; output: string }>
      return {}
    }
    const results = await executeHooksOutsideREPL({
      getAppState: () => makeAppState(callback),
      hookInput: preToolUseInput(),
      timeoutMs: 5000,
    })
    // 修后：外层跑 1 次，内层重入被跳过 → 总调用 1 次
    expect(callCount).toBe(1)
    expect(innerResults.length).toBe(1)
    expect(innerResults[0].succeeded).toBe(true)
    expect(String(innerResults[0].output)).toContain('re-entrant')
    // 外层照常成功
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(true)
  })

  test('⑦ 恒等锚：非重入正常路径钩子照常执行（守卫不误伤）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    let ran = 0
    const callback = async () => {
      ran++
      return { systemMessage: 'WAVE0182-RE-OK' }
    }
    const results = await executeHooksOutsideREPL({
      getAppState: () => makeAppState(callback),
      hookInput: preToolUseInput(),
      timeoutMs: 5000,
    })
    expect(ran).toBe(1)
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(true)
    expect(String(results[0].output)).toContain('WAVE0182-RE-OK')
  })
})
