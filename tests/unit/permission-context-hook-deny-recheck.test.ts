/**
 * FX-27（0.1.48 A-① 安全）：PermissionRequest hook `updatedInput` 未重查
 * `permissions.deny`（真实缺口，修前红）+ 零回归。
 *
 * 缺口：TUI 车道 createPermissionContext().handleHookAllow 直接 buildAllow
 * hook 改写入参，无 deny 规则重查 → hook 可把 allow 覆盖的入参改写到 deny 命中
 * 形态 = 权限绕过。engine 车道 toolExecution.ts:323-335 已在钩子改写后的
 * effective 入参上重判（门在钩子改写后重判，旧仓 checkRuleBasedPermissions
 * 语义；不变量「hook allow 不绕过 settings deny」），TUI 车道缺此重查。
 *
 * 修前红判据（工单 §2 FX-27）：
 * ① hook 返 allow + updatedInput 命中 deny → 终判必须 deny（decisionReason 指向
 *    deny 规则非 hook）—— 修前 handleHookAllow 直接 allow = 红，修后绿。
 * ② updatedInput 未命中 deny → allow 行为与现恒等（decisionReason=hook，
 *    updatedInput 透传）—— 零回归（首轮即绿，修前修后恒等）。
 * 分层纪律：纯上下文逻辑（无 React 渲染/无网络/无盘）→ unit 层。
 * fake 仅 tool.checkPermissions（输入级 deny 由 fake 控形，不依赖真实规则匹配）。
 */
import { describe, test, expect } from 'bun:test'
import { createPermissionContext } from '../../src/tui/hooks/toolPermission/PermissionContext'

/** 最小 TUI tool + toolUseContext（checkRuleBasedPermissions 消费字段：
 * name / inputSchema.parse / checkPermissions / getAppState().toolPermissionContext）。 */
function makeCtx(opts: {
  checkPermissions?: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
}) {
  const abortController = new AbortController()
  const tool = {
    name: 'Bash',
    userFacingName: () => 'Bash',
    inputSchema: { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true, data: x }) },
    ...(opts.checkPermissions
      ? {
          checkPermissions: (input: unknown) =>
            opts.checkPermissions!(input as Record<string, unknown>),
        }
      : {}),
  } as never
  const toolUseContext = {
    abortController,
    getAppState: () => ({
      toolPermissionContext: {
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
      },
    }),
  } as never
  const assistantMessage = { message: { id: 'm-1' } } as never
  const ctx = createPermissionContext(
    tool,
    { command: 'ls' },
    toolUseContext,
    assistantMessage,
    't-1',
    () => {},
  )
  return ctx
}

/** fake tool.checkPermissions：rm 形态入参落 deny（模拟 deny `Bash(rm:*)` 规则，
 * 输入级 deny 由 fake 控形——避免依赖真实 getDenyRuleForTool 规则匹配语义）。 */
function rmDenyCheckPermissions(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const cmd = String(input.command ?? '')
  if (cmd.startsWith('rm')) {
    return {
      behavior: 'deny',
      message: 'Permission to use Bash has been denied.',
      decisionReason: {
        type: 'rule',
        rule: {
          ruleValue: { tool_name: 'Bash', rule_content: 'rm:*' },
          source: 'session',
        },
      },
    }
  }
  return { behavior: 'passthrough' }
}

describe('FX-27 PermissionRequest hook updatedInput deny 重查（修前红）', () => {
  test('① hook 返 allow + updatedInput 命中 deny → 终判 deny（decisionReason 指向 deny 规则）', async () => {
    const ctx = makeCtx({ checkPermissions: rmDenyCheckPermissions })
    // hook 把 allow 覆盖的入参改写为 rm 形态（updatedInput）→ 命中 deny 规则
    const result = await ctx.handleHookAllow({ command: 'rm -rf /' }, [])
    expect(result.behavior).toBe('deny')
    // decisionReason 指向命中的 deny 规则（type:'rule'），非 hook
    expect((result as { decisionReason?: unknown }).decisionReason).toMatchObject({
      type: 'rule',
    })
  })

  test('② hook 返 allow + updatedInput 未命中 deny → allow 恒等（decisionReason=hook，零回归）', async () => {
    const ctx = makeCtx({ checkPermissions: rmDenyCheckPermissions })
    const result = await ctx.handleHookAllow({ command: 'ls -la' }, [])
    expect(result.behavior).toBe('allow')
    expect((result as { decisionReason?: unknown }).decisionReason).toMatchObject({
      type: 'hook',
    })
    expect((result as { updatedInput?: unknown }).updatedInput).toEqual({
      command: 'ls -la',
    })
  })
})
