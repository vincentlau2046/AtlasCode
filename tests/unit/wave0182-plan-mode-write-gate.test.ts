/**
 * 0.1.82 K3-B6 判别单测：plan 模式写拦截 fail-closed 收紧（上游 299——
 * 「plan 模式跑了 PreToolUse/mod tool.check 放行的写」）。
 *
 * 判别结论（修前缺口，红基线 = 53bdc7e）：
 *  - hasPermissionsToUseTool 决策链（1a deny → 1b ask → 1c tool.check →
 *    1d → 1f → 1g → 2a bypass → 2b allow 规则 → 薄骨架 → 3 passthrough→ask）
 *    **无任何 plan 写拦截支**——plan 态下写工具可经 tool.check allow /
 *    2b allow 规则 / PreToolUse hook allow 放行执行（上游 299 bug 前提
 *    面在本仓完全在场且更宽）；
 *  - 修法（§5 自决裁定：P11 状态机不重构只收紧）：链首加 plan 写门——
 *    mode='plan' 且非 bypass 起步且工具非只读（isReadOnly ?? false
 *    fail-closed 缺省=写）→ deny（decisionReason mode:plan）；
 *  - 豁免：EnterPlanMode / ExitPlanMode（**ExitPlanModeV2 isReadOnly=false
 *    （写盘 plan 文件）但必须放行**——否则 plan 模式无法退出死锁）。
 *    豁免名域内本地镜像（L2 叶约束，permissions 不 import engine），
 *    单一事实源 = engine/tools/toolNames.ts，本测试直接用 engine 常量
 *    锁一致性（⑥）。
 *
 * 测试面（checkPermissions 直测，同 permissions.test.ts 口径）：
 *  ① tool.check allow 的写 → deny（修前红：allow）
 *  ② 整工具 allow 规则命中的写 → deny（修前红：allow）
 *  ③ 只读工具 → 零变更（原链恒等锚）
 *  ④ bypass 起步（isBypassPermissionsModeAvailable）→ 2a 直放不变（恒等锚）
 *  ⑤ 未声明 isReadOnly 的工具 → fail-closed 拦（缺省=写）
 *  ⑥ ExitPlanModeV2 / EnterPlanMode（engine 常量名）→ 豁免放行 + 只读例外
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  hasPermissionsToUseTool,
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  resetSandboxAccess,
  type PermissionTool,
} from '../../src/permissions'
import {
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
} from '../../src/engine/tools/toolNames'
import type {
  ToolPermissionContext,
  PermissionResult,
} from '../../src/shared'

function planContext(
  overrides: Partial<ToolPermissionContext> = {},
): ToolPermissionContext {
  return {
    mode: 'plan',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
    ...overrides,
  }
}

/** 写工具 duck：isReadOnly=false + tool.check allow（上游 299 放行形态）。 */
const writeToolWithCheckAllow: PermissionTool = {
  name: 'Write',
  isReadOnly: () => false,
  checkPermissions: async () =>
    ({ behavior: 'allow' }) as unknown as PermissionResult,
}

const readTool: PermissionTool = {
  name: 'Read',
  isReadOnly: () => true,
}

function ctxOf(tpc: ToolPermissionContext) {
  return { getToolPermissionContext: () => tpc }
}

beforeEach(() => {
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => '/tmp/proj',
    getCwd: () => '/tmp/proj',
  })
  resetSandboxAccess()
})
afterEach(() => {
  resetPermissionsBootstrapEnv()
  resetSandboxAccess()
})

describe('K3-B6 plan 模式写拦截 fail-closed（上游 299 收紧）', () => {
  test('① tool.checkPermissions 放行的写在 plan 态被拦（deny）', async () => {
    const decision = await hasPermissionsToUseTool(
      writeToolWithCheckAllow,
      { file_path: '/tmp/proj/a.txt' },
      ctxOf(planContext()),
    )
    expect(decision.behavior).toBe('deny')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'plan' })
    expect(decision.message).toContain('Plan mode')
  })

  test('② 整工具 allow 规则命中的写在 plan 态被拦（deny，2b 不再放行）', async () => {
    const tpc = planContext({
      alwaysAllowRules: { session: ['Write'] },
    })
    const decision = await hasPermissionsToUseTool(
      { name: 'Write', isReadOnly: () => false },
      { file_path: '/tmp/proj/a.txt' },
      ctxOf(tpc),
    )
    expect(decision.behavior).toBe('deny')
    expect(decision.decisionReason?.type).toBe('mode')
  })

  test('③ 只读工具在 plan 态零变更（原链落 ask 恒等锚）', async () => {
    const decision = await hasPermissionsToUseTool(
      readTool,
      { file_path: '/tmp/proj/a.txt' },
      ctxOf(planContext()),
    )
    // 无规则只读工具走原链 3 passthrough→ask（门不触碰只读面）
    expect(decision.behavior).toBe('ask')
  })

  test('④ bypass 起步（isBypassPermissionsModeAvailable）→ 2a 直放不变', async () => {
    const decision = await hasPermissionsToUseTool(
      writeToolWithCheckAllow,
      { file_path: '/tmp/proj/a.txt' },
      ctxOf(planContext({ isBypassPermissionsModeAvailable: true })),
    )
    expect(decision.behavior).toBe('allow')
    expect(decision.decisionReason).toEqual({ type: 'mode', mode: 'plan' })
  })

  test('⑤ 未声明 isReadOnly 的工具 → fail-closed 缺省=写，plan 态被拦', async () => {
    const decision = await hasPermissionsToUseTool(
      { name: 'MysteryTool' },
      {},
      ctxOf(planContext()),
    )
    expect(decision.behavior).toBe('deny')
  })

  test('⑥ plan 逃生口豁免：ExitPlanModeV2（isReadOnly=false 写盘）与 EnterPlanMode 不被门拦', async () => {
    // ExitPlanModeV2 isReadOnly=false（写 plan 文件）——必须经豁免集放行，
    // 否则 plan 模式无法退出（死锁）。豁免名与 engine 单一事实源一致性
    // 由本断言直接用 engine 常量锁死。
    const exitTool: PermissionTool = {
      name: EXIT_PLAN_MODE_V2_TOOL_NAME,
      isReadOnly: () => false, // 逐字复刻真实工具：Now writes to disk
      checkPermissions: async () =>
        ({ behavior: 'allow' }) as unknown as PermissionResult,
    }
    const d1 = await hasPermissionsToUseTool(
      exitTool,
      { plan: 'do the thing' },
      ctxOf(planContext()),
    )
    expect(d1.behavior).toBe('allow')

    const enterTool: PermissionTool = {
      name: ENTER_PLAN_MODE_TOOL_NAME,
      isReadOnly: () => true,
    }
    const d2 = await hasPermissionsToUseTool(
      enterTool,
      {},
      ctxOf(planContext()),
    )
    // EnterPlanMode isReadOnly=true：只读例外天然放行（原链落 ask 恒等锚）
    expect(d2.behavior).toBe('ask')
  })
})
