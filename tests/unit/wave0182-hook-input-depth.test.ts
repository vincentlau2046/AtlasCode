/**
 * 0.1.82 K3-A6 判别单测：hook 输入深嵌套防护（上游 299/300 对齐）。
 *
 * 红基线 = 8404fd0：两面缺口——
 *  - executeHooksOutsideREPL（:3099）`jsonStringify(hookInput)` throw →
 *    `logError + return []` = 全部钩子**静默跳过**（299「极深嵌套工具输入被
 *    跳过」；本机实测 JSC stringify ~30000 层内不炸、100000 层 RangeError）。
 *  - 主 executeHooks getJsonInput（:2140） stringify throw → 泛化 RangeError
 *    错误，无上限名（300「拒收嵌套 >28000 层值（报上限名）」）。
 *
 * 修后：共享纯函数 exceedsMaxNestingDepth（迭代显式栈，防递归自爆栈）+
 * 命名上限 MAX_HOOK_INPUT_NESTING_DEPTH = 28000，两面接线——
 *  - face-2：超限 → 逐钩子失败结果（succeeded:false + output 报上限名，
 *    blocked:false 不拦截），不再静默跳过；stringify 仍失败（如 circular）
 *    同样转可见失败结果。
 *  - face-1：getJsonInput 超限 → {ok:false, error 报上限名} → 既有
 *    hook_error_during_execution 面（fail-soft 可见）。
 *
 * 边界裁定（工单自决项）：28000 层收纳、>28000 层拒收（含 28001）。
 */
import { describe, test, expect } from 'bun:test'
import { switchSession } from '../../src/bootstrap/state.js'

/**
 * 构造 N 层嵌套链（迭代构造，避免测试自身递归爆栈）。最内层为标量
 * （深度 = N）：N=28000 → 最深节点深度 28000 = 收纳边界；28001 → 拒收。
 */
function deepChain(levels: number): unknown {
  let v: unknown = 'WAVE0182-DEEP'
  for (let i = 0; i < levels; i++) v = { a: v }
  return v
}

const SESSION_ID = 'wave0182-depth-session'
switchSession(SESSION_ID)

/** PreToolUse session 钩子（command 型）+ fake appState.sessionHooks。 */
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
                hooks: [
                  { hook: { type: 'command', command: 'echo wave0182-ok' } },
                ],
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

describe('K3-A6 exceedsMaxNestingDepth 纯函数矩阵（基线无此导出 → 红）', () => {
  test('① 边界收纳：28000 层链不拒收', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    expect(exceedsMaxNestingDepth(deepChain(28000))).toBe(false)
  })

  test('② 边界拒收：28001 层链拒收', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    expect(exceedsMaxNestingDepth(deepChain(28001))).toBe(true)
  })

  test('③ 数组嵌套计入深度', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    let v: unknown = 'x'
    for (let i = 0; i < 28001; i++) v = [v]
    expect(exceedsMaxNestingDepth(v)).toBe(true)
  })

  test('④ 环安全：cyclic 对象终止且不误报（circular 由 stringify 兜底）', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    const a: Record<string, unknown> = {}
    const b: Record<string, unknown> = { a }
    a.b = b
    expect(exceedsMaxNestingDepth(a)).toBe(false)
  })

  test('⑤ 平凡面：标量/null/浅对象不拒收', async () => {
    const { exceedsMaxNestingDepth } = await import(
      '../../src/tui/utils/hooks/hookInputDepth.js'
    )
    expect(exceedsMaxNestingDepth('scalar')).toBe(false)
    expect(exceedsMaxNestingDepth(null)).toBe(false)
    expect(exceedsMaxNestingDepth({ a: 1, b: [1, 2, { c: 'd' }] })).toBe(false)
  })
})

describe('K3-A6 executeHooksOutsideREPL 深嵌套拒收（299 静默跳过 → 红）', () => {
  test('⑥ 行为红例：100000 层 → 逐钩子失败结果报上限名（基线 = 静默 [] → 红）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: makeAppState,
      hookInput: preToolUseInput(deepChain(100000)),
      timeoutMs: 5000,
    })
    // 不再静默跳过：每个匹配钩子一个失败结果
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(false)
    expect(results[0].blocked).toBe(false)
    expect(String(results[0].output)).toContain('28000')
  })

  test('⑦ 边界拒收：28001 层 → 失败结果（基线 = stringify 不炸、钩子照跑 → 红）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: makeAppState,
      hookInput: preToolUseInput(deepChain(28001)),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(false)
    expect(String(results[0].output)).toContain('28000')
  })

  test('⑧ 恒等锚：浅输入 → 钩子照常执行（guard 不误伤正常面）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: makeAppState,
      hookInput: preToolUseInput({ command: 'ls' }),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(true)
    expect(String(results[0].output)).toContain('wave0182-ok')
  })
})
