/**
 * 0.1.82 K3-A7 判别单测：hook 输入 getter 抛错只拒该键（上游 299 对齐）。
 *
 * 红基线 = 8404fd0（含本波 A6 后状态）：hook 输入序列化面对抛错 getter
 * **整值被拒**——
 *  - exceedsMaxNestingDepth 的 Object.values 枚举自身触发 getter → RangeError
 *    穿透 executeHooksOutsideREPL（整调用 reject）；
 *  - jsonStringify 读 getter 抛错 → 整个 hookInput 拒收（face-2 失败结果/
 *    face-1 错误结果），好键一并丢失。
 *
 * 修后：只拒该键——
 *  - 深度检查 getter 安全（枚举抛错容器跳过，不可判定 ≠ 拒收）；
 *  - 序列化失败 → materializeHookInput 逐键物化（抛错键丢弃并记名，
 *    cyclic 以 '[Circular]' 占位终止），克隆再序列化成功则照常跑钩子。
 *
 * 行为面经 executeHooksOutsideREPL（A6 起已 export）+ session command 钩子
 * `cat`（回显 stdin = 钩子实际收到的 JSON）。
 */
import { describe, test, expect } from 'bun:test'
import { switchSession } from '../../src/bootstrap/state.js'

const SESSION_ID = 'wave0182-getter-session'
switchSession(SESSION_ID)

/** PreToolUse session command 钩子：`cat` 回显 stdin（钩子收到的输入）。 */
function makeAppState() {
  return {
    sessionHooks: new Map<string, unknown>([
      [
        SESSION_ID,
        {
          hooks: {
            PreToolUse: [
              {
                matcher: '',
                hooks: [{ hook: { type: 'command', command: 'cat' } }],
              },
            ],
          },
        },
      ],
    ]),
    options: {},
  }
}

function preToolUseInput(toolInput: unknown) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: toolInput,
    session_id: SESSION_ID,
  }
}

function getterToolInput() {
  return {
    ok: 'WAVE0182-GOOD-VALUE',
    get evil() {
      throw new RangeError('WAVE0182-GETTER-BOOM')
    },
  }
}

describe('K3-A7 纯函数矩阵（基线缺导出/缺守卫 → 红）', () => {
  test('① 深度检查 getter 安全：枚举抛错容器不崩、不误报深嵌套', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    // 基线：Object.values 触发 getter → RangeError 穿透（红）
    expect(exceedsMaxNestingDepth(getterToolInput())).toBe(false)
  })

  test('② materialize：抛错 getter 只丢该键，好键保留', async () => {
    const { materializeHookInput } = await import(
      '../../src/tui/utils/hooks/hookInputMaterialize.js'
    )
    const r = materializeHookInput(getterToolInput())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({ ok: 'WAVE0182-GOOD-VALUE' })
    expect(r.droppedKeys).toEqual(['evil'])
  })

  test('③ materialize：cyclic 输入以 [Circular] 占位终止', async () => {
    const { materializeHookInput } = await import(
      '../../src/tui/utils/hooks/hookInputMaterialize.js'
    )
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { name: 'b', a }
    a.b = b
    const r = materializeHookInput(a)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const json = JSON.stringify(r.value)
    expect(json).toContain('"name":"a"') // 物化成功可序列化（好键保留）
    expect(json).toContain('[Circular]')
  })

  test('④ stringify 回退：getter 输入序列化成功、evil 键被丢并记名', async () => {
    const { stringifyWithGetterFallback } = await import(
      '../../src/tui/utils/hooks/hookInputMaterialize.js'
    )
    const r = stringifyWithGetterFallback(getterToolInput())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('WAVE0182-GOOD-VALUE')
    expect(r.value).not.toContain('evil')
    expect(r.droppedKeys).toEqual(['evil'])
  })

  test('⑤ 恒等锚：plain 输入走快路径，JSON 恒等、零丢弃', async () => {
    const { stringifyWithGetterFallback } = await import(
      '../../src/tui/utils/hooks/hookInputMaterialize.js'
    )
    const r = stringifyWithGetterFallback({ a: 1, b: ['x', { c: true }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(JSON.parse(r.value)).toEqual({ a: 1, b: ['x', { c: true }] })
    expect(r.droppedKeys).toEqual([])
  })
})

describe('K3-A7 executeHooksOutsideREPL getter 单键拒（基线整值被拒 → 红）', () => {
  test('⑥ 行为红例：getter 抛错的 tool_input → 钩子照跑且只丢 evil 键（基线 = 整调用 reject → 红）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: makeAppState,
      hookInput: preToolUseInput(getterToolInput()),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(true)
    // 钩子收到的 stdin JSON：好键在、抛错键被丢
    const output = String(results[0].output)
    expect(output).toContain('WAVE0182-GOOD-VALUE')
    expect(output).not.toContain('evil')
  })

  test('⑦ cyclic tool_input → [Circular] 占位、钩子照跑（基线 = 序列化失败结果 → 红）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const a: Record<string, unknown> = { name: 'WAVE0182-CYCLE-A' }
    const b: Record<string, unknown> = { a }
    a.b = b
    const results = await executeHooksOutsideREPL({
      getAppState: makeAppState,
      hookInput: preToolUseInput(a),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(true)
    expect(String(results[0].output)).toContain('[Circular]')
  })
})
