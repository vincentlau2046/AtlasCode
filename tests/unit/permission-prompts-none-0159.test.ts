/**
 * 0.1.59 C9-3 --permission-prompts none（CC 2.1.259）判别单测。
 *
 * 语义：--permission-prompts none = 无人值守，ask 全自动 deny。落点 = 既有
 * dontAsk mode 折入（ask→deny choke point applyDontAskMode，零新决策代码）；
 * 显式 --permission-mode 优先（?? 链），flag 缺省 = 零变更。勿混
 * /less-permission-prompts skill（本项 = CLI flag，非 skill）。
 *
 * 判别面（buildHeadlessOptions 映射层，RED→GREEN）：
 *   修前：--permission-prompts none → options.permissionPrompts 无消费，
 *     buildHeadlessOptions.permissionMode 恒 undefined（flag 空转）→ 本测试
 *     'none 折入 dontAsk' 分支 RED。
 *   修后：'none' → 'dontAsk'（下游 TPC.mode='dontAsk' → 每个 ask 产点经
 *     applyDontAskMode 转 deny，DONT_ASK_REJECT_MESSAGE + decisionReason
 *     {type:'mode',mode:'dontAsk'}）。
 *
 * 纪律：零模型 / 零网络 / 零磁盘（buildHeadlessOptions 纯映射面）。
 */
import { describe, test, expect } from 'bun:test'
import { buildHeadlessOptions } from '../../src/cli'

describe('0.1.59 C9-3 · --permission-prompts none 折入 dontAsk（buildHeadlessOptions）', () => {
  test('flag 开（--permission-prompts none）→ permissionMode 折为 dontAsk', () => {
    const opts = buildHeadlessOptions({ permissionPrompts: 'none' })
    expect(opts.permissionMode).toBe('dontAsk')
  })

  test('flag 关（缺省）→ permissionMode undefined（零变更，不泄漏 dontAsk）', () => {
    const opts = buildHeadlessOptions({})
    expect(opts.permissionMode).toBeUndefined()
  })

  test('显式 --permission-mode 优先于 --permission-prompts（?? 链，plan 保留）', () => {
    const opts = buildHeadlessOptions({
      permissionMode: 'plan',
      permissionPrompts: 'none',
    })
    expect(opts.permissionMode).toBe('plan')
  })

  test('显式 --permission-mode default 亦优先（非 undefined 均不回落 dontAsk）', () => {
    const opts = buildHeadlessOptions({
      permissionMode: 'default',
      permissionPrompts: 'none',
    })
    expect(opts.permissionMode).toBe('default')
  })

  test('flag 显式 undefined（非 none）→ 不折入（permissionMode undefined）', () => {
    const opts = buildHeadlessOptions({ permissionPrompts: undefined })
    expect(opts.permissionMode).toBeUndefined()
  })
})
