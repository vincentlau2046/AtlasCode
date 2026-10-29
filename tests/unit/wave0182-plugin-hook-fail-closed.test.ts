/**
 * 0.1.82 K3-A10 判别单测：插件 hook 输入不可达时 fail-closed（上游 300 对齐）。
 *
 * 上游语义（300）：插件 hook 无法接收/回传值时，其所门控的动作**可拒收**
 * 而非默认放行——工单裁定方向 = fail-closed（拒收优先）。
 *
 * 红基线 = 1badb09（含 A9）：输入投递失败面（深嵌套拒收 / 序列化失败——
 * hook 无法接收值，钩子根本没跑）对**插件** hook（pluginRoot 在场）于
 * **门事件**（PreToolUse / UserPromptSubmit / PermissionRequest——结果可
 * 阻塞动作的事件）上仍 fail-open（face-2 blocked:false / face-1
 * non_blocking_error 无 blockingError）→ 门控动作放行。
 *
 * 修后：shouldFailClosePluginHook(hookEvent, pluginRoot) 收口——
 *  - face-2（executeHooksOutsideREPL）两预检失败面（深嵌套 3159 / 序列化
 *    3173）：逐钩子结果 blocked 按插件门事件翻 true（拒收）；
 *  - face-1（executeHooks getJsonInput 失败面）：插件门事件 → outcome
 *    'blocking' + blockingError（消费面 yield {blockingError} 即门控信号）。
 *
 * 恒等锚（fail-open 保留面）：settings/session 面（无 pluginRoot）与非门
 * 事件（PostToolUse 等）的投递失败仍 fail-open——A5/A6/A7 判别测试
 * （wave0182-callback-hook-catch / -hook-input-depth / -getter-key-reject）
 * 的既有断言即此面的锁，本文件再补两条直接锚。
 *
 * ★域内发现（随波报告 surface，不在本件修）：插件 hook 注册/读取桥
 * `registerHookCallbacks` / `getRegisteredHooks`（src/tui/bootstrapState.ts）
 * 自 C-7 桥重建（78624e4）起为 no-op stub——plugin hooks 与
 * sessionFileAccessHooks 注册写入 void，TUI 车道从不执行。本件落位
 * fail-closed 语义于 pluginRoot 投递面（getMatchingHooks 提取管线在场），
 * store 复活（行为激活）交独立裁定。测试经 appState.sessionHooks 携
 * pluginRoot 字段的 matcher 走真实合并管线（getHooksConfig →
 * getMatchingHooks 'pluginRoot' in matcher 提取），不经 stub 注册面。
 */
import { describe, test, expect } from 'bun:test'
import { switchSession } from '../../src/bootstrap/state.js'

const SESSION_ID = 'wave0182-fail-closed-session'
switchSession(SESSION_ID)

/** 构造 N 层嵌套链（迭代构造，避免测试自身递归爆栈）。 */
function deepChain(levels: number): unknown {
  let v: unknown = 'WAVE0182-DEEP'
  for (let i = 0; i < levels; i++) v = { a: v }
  return v
}

/**
 * fake appState：sessionHooks 里塞带 pluginRoot 的 matcher——
 * getHooksConfig 对 session matcher 原样透传，getMatchingHooks 按
 * 'pluginRoot' in matcher 提取插件来源（真实合并管线，非 mock）。
 */
function makeAppState(opts?: { pluginRoot?: string; event?: string }) {
  const event = opts?.event ?? 'PreToolUse'
  const matcher: Record<string, unknown> = {
    matcher: '',
    hooks: [{ hook: { type: 'command', command: 'echo wave0182-guard' } }],
  }
  if (opts?.pluginRoot !== undefined) {
    matcher.pluginRoot = opts.pluginRoot
    matcher.pluginName = 'wave0182-plugin'
    matcher.pluginId = 'wave0182-plugin-id'
  }
  return {
    sessionHooks: new Map<string, unknown>([
      [SESSION_ID, { hooks: { [event]: [matcher] } }],
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

describe('K3-A10 face-2（executeHooksOutsideREPL）投递失败 fail-closed', () => {
  test('① 插件 PreToolUse hook + 深嵌套输入 → blocked:true 拒收（基线 false → 红）', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: () =>
        makeAppState({ pluginRoot: '/fake/plugin/wave0182' }),
      hookInput: preToolUseInput(deepChain(100000)),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(false)
    expect(String(results[0].output)).toContain('28000')
    // fail-closed：插件门事件 hook 输入不可达 → 动作拒收
    expect(results[0].blocked).toBe(true)
  })

  test('② 恒等锚：session 面（无 pluginRoot）同失败仍 fail-open', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: () => makeAppState(),
      hookInput: preToolUseInput(deepChain(100000)),
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(false)
    expect(results[0].blocked).toBe(false)
  })

  test('③ 恒等锚：插件 hook 非门事件（PostToolUse）同失败仍 fail-open', async () => {
    const { executeHooksOutsideREPL } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const results = await executeHooksOutsideREPL({
      getAppState: () =>
        makeAppState({ pluginRoot: '/fake/plugin/wave0182', event: 'PostToolUse' }),
      hookInput: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: deepChain(100000),
        tool_response: 'x',
        session_id: SESSION_ID,
      },
      timeoutMs: 5000,
    })
    expect(results.length).toBe(1)
    expect(results[0].succeeded).toBe(false)
    expect(results[0].blocked).toBe(false)
  })
})

describe('K3-A10 face-1（executePreToolHooks）投递失败 fail-closed', () => {
  /** 最小 ToolUseContext（command hook 输入预检失败即返，不触执行面）。 */
  function makeToolUseContext(appState: unknown) {
    return {
      getAppState: () => appState,
      messages: [],
      abortController: new AbortController(),
      options: {},
    } as any
  }

  async function collectPreToolHooks(appState: unknown, toolInput: unknown) {
    const { executePreToolHooks } = await import(
      '../../src/tui/utils/hooks.js'
    )
    const aggregated: Array<Record<string, unknown>> = []
    for await (const r of executePreToolHooks(
      'Bash',
      'wave0182-tool',
      toolInput,
      makeToolUseContext(appState),
      undefined,
      undefined,
      5000,
    )) {
      aggregated.push(r as Record<string, unknown>)
    }
    return aggregated
  }

  test('④ 插件 PreToolUse hook + 深嵌套输入 → blockingError 拒收（基线无 → 红）', async () => {
    const aggregated = await collectPreToolHooks(
      makeAppState({ pluginRoot: '/fake/plugin/wave0182' }),
      deepChain(100000),
    )
    // 基线：仅 message（non_blocking_error 放行）；修后：blockingError 在场
    const blocking = aggregated.find(r => r.blockingError !== undefined)
    expect(blocking).toBeDefined()
    expect(String((blocking!.blockingError as any).blockingError)).toContain(
      '28000',
    )
  })

  test('⑤ 恒等锚：session 面（无 pluginRoot）同失败仍非阻塞错误放行', async () => {
    const aggregated = await collectPreToolHooks(
      makeAppState(),
      deepChain(100000),
    )
    expect(aggregated.some(r => r.blockingError !== undefined)).toBe(false)
    // 可见失败消息仍在场（A6 fail-soft 面）
    expect(aggregated.length).toBeGreaterThan(0)
  })
})
