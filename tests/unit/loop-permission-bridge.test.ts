/**
 * W3-3b（§8.74.15 ④）：TUI 交互权限桥判别测试（buildInteractiveGate）。
 *
 * 被测能力 = engine 权限门 × TUI canUseTool 弹窗面的桥接语义（非 tautology，
 * 断言接缝被消费）：
 *   B-1 allow 快路径：engine 门 verdict.allow（bypass 模式）→ 原样透传，
 *       不落 TUI canUseTool（非交互快路径保真）。
 *   B-2 deny 快路径：engine 门 verdict.deny（工具面 1d 拒绝）→ allowed:false
 *       + reason 逐字，不落 TUI canUseTool。
 *   B-3 ask → 用户允许：engine 门 verdict.ask（default 模式 passthrough→ask）
 *       → 转 canUseTool 弹窗（allow 决策）→ remap allowed:true + updatedInput
 *       透传（callContext tu.id/assistantMsg 键控面消费）。
 *   B-4 ask → 用户拒绝：同 ask 落 canUseTool（deny 决策）→ remap
 *       allowed:false + reason 逐字（fail-closed，engine 窄 spine 同语义）。
 *
 * 纯函数面（无 React 无 store 无网络）：engine 门经受控 TPC + 假工具驱动
 * （createPermissionGate 真体消费，非 fake 自证）；canUseTool 假实现记录调用
 * 面。运行口径 = 标准 `bun test --isolate`（unit 零磁盘零网络）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  buildInteractiveGate,
  type InteractiveGateParams,
} from '../../src/tui/loopPermissionBridge'
import { resetSandboxAccess } from '../../src/permissions'
import type { ToolPermissionContext } from '../../src/shared'
import type { Tool } from '../../src/shared'
import type { ToolUseContext } from '../../src/tui/Tool'
import type { CanUseToolFn } from '../../src/tui/hooks/useCanUseTool'

function makeContext(
  mode: ToolPermissionContext['mode'] = 'default',
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

/**
 * 假 canUseTool（记录调用面 + 返回受控决策，无 React）。decision 面 = 桥
 * remap 实际读取字段子集（behavior/message/updatedInput）；any = 判别单测
 * 不绑 TUI PermissionDecision 全 union（避免 decisionReason 必填面噪音）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeCanUseTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decision: any,
): { fn: CanUseToolFn; calls: Array<{ toolUseId?: string; assistantMessage?: unknown }> } {
  const calls: Array<{ toolUseId?: string; assistantMessage?: unknown }> = []
  const fn = ((
    _tool: unknown,
    _input: unknown,
    _ctx: unknown,
    assistantMessage: unknown,
    toolUseID: string,
  ) => {
    calls.push({ toolUseId: toolUseID, assistantMessage })
    return Promise.resolve(decision)
  }) as unknown as CanUseToolFn
  return { fn, calls }
}

const fakeToolUseContext = {} as ToolUseContext

describe('buildInteractiveGate（W3-3b §8.74.15 ④）', () => {
  beforeEach(() => {
    // 假 sandbox 窗口（placeholder 禁用态；非 bash 工具不触 ⑥ 沙箱支）
    resetSandboxAccess()
  })

  test('B-1 allow 快路径：bypass 模式 → 原样透传，不落 canUseTool', async () => {
    const tpc = makeContext('bypassPermissions')
    const { fn, calls } = fakeCanUseTool({ behavior: 'allow' })
    const gate = buildInteractiveGate({
      toolPermissionContext: tpc,
      canUseTool: fn,
      toolUseContext: fakeToolUseContext,
    } satisfies InteractiveGateParams)
    const verdict = await gate({ name: 'Read' } as Tool, { file_path: '/x' })
    expect(verdict.allowed).toBe(true)
    expect(calls.length).toBe(0) // 非交互快路径未落 TUI 弹窗
  })

  test('B-2 deny 快路径：工具面 1d 拒绝 → allowed:false + reason，不落 canUseTool', async () => {
    const tpc = makeContext('default')
    const { fn, calls } = fakeCanUseTool({ behavior: 'allow' })
    const gate = buildInteractiveGate({
      toolPermissionContext: tpc,
      canUseTool: fn,
      toolUseContext: fakeToolUseContext,
    } satisfies InteractiveGateParams)
    const denyTool = {
      name: 'DenyTool',
      checkPermissions: async () => ({
        behavior: 'deny',
        message: 'tool says no',
      }),
    } as unknown as Tool
    const verdict = await gate(denyTool, {})
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('tool says no')
    expect(calls.length).toBe(0) // deny 快路径未落 TUI 弹窗
  })

  test('B-3 ask → 用户允许：canUseTool 弹窗 allow → remap allowed:true + updatedInput + callContext 键控', async () => {
    const tpc = makeContext('default')
    const { fn, calls } = fakeCanUseTool({
      behavior: 'allow',
      updatedInput: { file_path: '/rewritten' },
    })
    const gate = buildInteractiveGate({
      toolPermissionContext: tpc,
      canUseTool: fn,
      toolUseContext: fakeToolUseContext,
    } satisfies InteractiveGateParams)
    // default 模式 + 无 checkPermissions 工具 → passthrough → ask（gate fail-closed 标记）
    const verdict = await gate(
      { name: 'AskTool' } as Tool,
      { file_path: '/x' },
      { toolUseId: 'tu-1', assistantMessage: { uuid: 'am-1' } },
    )
    expect(verdict.allowed).toBe(true)
    expect(verdict.updatedInput).toEqual({ file_path: '/rewritten' })
    // canUseTool 恰好一次，callContext 键控面（tu.id/assistantMsg）消费
    expect(calls.length).toBe(1)
    expect(calls[0].toolUseId).toBe('tu-1')
    expect(calls[0].assistantMessage).toEqual({ uuid: 'am-1' })
  })

  test('B-4 ask → 用户拒绝：canUseTool 弹窗 deny → remap allowed:false + reason 逐字', async () => {
    const tpc = makeContext('default')
    const { fn } = fakeCanUseTool({ behavior: 'deny', message: 'user declined' })
    const gate = buildInteractiveGate({
      toolPermissionContext: tpc,
      canUseTool: fn,
      toolUseContext: fakeToolUseContext,
    } satisfies InteractiveGateParams)
    const verdict = await gate({ name: 'AskTool' } as Tool, { file_path: '/x' })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('user declined')
  })
})
