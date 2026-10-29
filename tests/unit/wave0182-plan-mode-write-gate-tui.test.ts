/**
 * 0.1.82 K3-B6 判别单测（TUI twin 面）：plan 模式写拦截 fail-closed——
 * TUI 层 hasPermissionsToUseTool（src/tui/utils/permissions/permissions.ts
 * 1444L 决策体）与 permissions 域同门对齐。
 *
 * 为何 twin 也要门（security review finding #3 实锤）：
 *  - twin 是活决策路径——promptShellExecution（skill 内联 !`shell` 执行，
 *    promptShellExecution.ts:96）/ swarm inProcessRunner / execAgentHook
 *    三消费面直调 twin；engine 门（loopPermissionBridge）只覆盖主 agent
 *    loop 工具面，skill 内联 shell 不经 engine gate；
 *  - 修前 twin 链首（1a 前）缺 plan 写门——plan 态下 skill 内联写命令可经
 *    tool.check allow / 2b allow 规则放行执行（上游 299 bug 在 TUI 车道
 *    同样在场）。
 *
 * 测试面（同 engine 侧 wave0182-plan-mode-write-gate.test.ts 口径，
 * 夹具同 tui-classifier-intercept-ask.test.ts 最小 ToolUseContext）：
 *  ① plan + tool.check allow 的写 + allow 规则 → deny（修前红：allow）
 *  ② plan + 无规则写（check passthrough）→ deny（修前红：ask）
 *  ③ 只读工具 → 零变更（原链落 ask 恒等锚）
 *  ④ bypass 起步（isBypassPermissionsModeAvailable）→ 2a 直放恒等锚
 *  ⑤ 豁免 ExitPlanMode（isReadOnly=false 写盘 plan 文件）→ 放行恒等锚
 *  ⑥ 缺 isReadOnly 声明 → fail-closed 拦（缺省=写）
 */
import { describe, test, expect } from 'bun:test'

const PERMS_PATH = '../../src/tui/utils/permissions/permissions.js'
const { hasPermissionsToUseTool } = await import(PERMS_PATH)
// 豁免名单一事实源 = TUI 工具常量（twin 域内可直 import，无 L2 叶约束）
const { ENTER_PLAN_MODE_TOOL_NAME } = await import(
  '../../src/tui/tools/EnterPlanModeTool/constants.js'
)
const { EXIT_PLAN_MODE_V2_TOOL_NAME } = await import(
  '../../src/tui/tools/ExitPlanModeTool/constants.js'
)

function makePlanCtx(overrides: Record<string, unknown> = {}) {
  const appState = {
    toolPermissionContext: {
      mode: 'plan',
      shouldAvoidPermissionPrompts: false,
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
      ...overrides,
    },
  }
  const ctx: any = {
    getAppState: () => appState,
    setAppState: () => {},
    abortController: new AbortController(),
    options: { tools: [], isNonInteractiveSession: false },
  }
  return { ctx, appState }
}

/** 写工具 duck：isReadOnly=false + checkPermissions allow（上游 299 放行形态）。 */
function writeToolWithCheckAllow(name = 'Write'): any {
  return {
    name,
    inputSchema: { parse: (v: unknown) => v },
    isReadOnly: () => false,
    checkPermissions: async () => ({ behavior: 'allow' }),
    userFacingName: () => name,
  }
}

describe('K3-B6 plan 模式写拦截 fail-closed（TUI twin 面，上游 299 收紧）', () => {
  test('① tool.checkPermissions 放行的写在 plan 态被拦（deny，含 allow 规则不回绕）', async () => {
    const { ctx } = makePlanCtx({
      alwaysAllowRules: { session: ['Write'] },
    })
    const d = await hasPermissionsToUseTool(
      writeToolWithCheckAllow(),
      { file_path: '/tmp/proj/a.txt' },
      ctx,
      undefined as never,
      'tu-t1',
    )
    expect(d.behavior).toBe('deny')
    expect(d.decisionReason).toEqual({ type: 'mode', mode: 'plan' })
    expect(d.message).toContain('Plan mode')
  })

  test('② 无规则写（check passthrough）plan 态被拦（deny 非ask）', async () => {
    const tool: any = {
      name: 'Write',
      inputSchema: { parse: (v: unknown) => v },
      isReadOnly: () => false,
      checkPermissions: async () => ({ behavior: 'passthrough' }),
      userFacingName: () => 'Write',
    }
    const { ctx } = makePlanCtx()
    const d = await hasPermissionsToUseTool(
      tool,
      { file_path: '/tmp/proj/a.txt' },
      ctx,
      undefined as never,
      'tu-t2',
    )
    expect(d.behavior).toBe('deny')
  })

  test('③ 只读工具在 plan 态零变更（原链落 ask 恒等锚）', async () => {
    const tool: any = {
      name: 'Read',
      inputSchema: { parse: (v: unknown) => v },
      isReadOnly: () => true,
      checkPermissions: async () => ({ behavior: 'passthrough' }),
      userFacingName: () => 'Read',
    }
    const { ctx } = makePlanCtx()
    const d = await hasPermissionsToUseTool(
      tool,
      { file_path: '/tmp/proj/a.txt' },
      ctx,
      undefined as never,
      'tu-t3',
    )
    expect(d.behavior).toBe('ask')
  })

  test('④ bypass 起步（isBypassPermissionsModeAvailable）→ 2a 直放不变', async () => {
    const { ctx } = makePlanCtx({ isBypassPermissionsModeAvailable: true })
    const d = await hasPermissionsToUseTool(
      writeToolWithCheckAllow(),
      { file_path: '/tmp/proj/a.txt' },
      ctx,
      undefined as never,
      'tu-t4',
    )
    expect(d.behavior).toBe('allow')
  })

  test('⑤ plan 逃生口豁免：ExitPlanMode（isReadOnly=false 写盘）不被门拦', async () => {
    const tool: any = {
      name: EXIT_PLAN_MODE_V2_TOOL_NAME,
      inputSchema: { parse: (v: unknown) => v },
      isReadOnly: () => false, // 逐字复刻真实工具：Now writes to disk
      checkPermissions: async () => ({ behavior: 'allow' }),
      userFacingName: () => 'ExitPlanMode',
    }
    const { ctx } = makePlanCtx()
    const d = await hasPermissionsToUseTool(
      tool,
      { plan: 'do the thing' },
      ctx,
      undefined as never,
      'tu-t5',
    )
    expect(d.behavior).toBe('allow')

    // EnterPlanMode isReadOnly=true：只读例外天然放行（原链落 ask 恒等锚）；
    // 豁免名与 TUI 工具常量一致性由本断言直接锁死。
    const enterTool: any = {
      name: ENTER_PLAN_MODE_TOOL_NAME,
      inputSchema: { parse: (v: unknown) => v },
      isReadOnly: () => true,
      checkPermissions: async () => ({ behavior: 'passthrough' }),
      userFacingName: () => 'EnterPlanMode',
    }
    const d2 = await hasPermissionsToUseTool(
      enterTool,
      {},
      ctx,
      undefined as never,
      'tu-t5b',
    )
    expect(d2.behavior).toBe('ask')
  })

  test('⑥ 缺 isReadOnly 声明 → fail-closed 缺省=写，plan 态被拦', async () => {
    const tool: any = {
      name: 'MysteryTool',
      inputSchema: { parse: (v: unknown) => v },
      checkPermissions: async () => ({ behavior: 'allow' }),
      userFacingName: () => 'MysteryTool',
    }
    const { ctx } = makePlanCtx()
    const d = await hasPermissionsToUseTool(
      tool,
      {},
      ctx,
      undefined as never,
      'tu-t6',
    )
    expect(d.behavior).toBe('deny')
  })
})
