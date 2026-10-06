/**
 * P9（0.1.37 ④）键位模态隔离不变量单测（历史 P0 面防回归，trace doc
 * §3.6/§5 P9 [验证项]）。
 *
 * 固化原理（参照 A：CC 2.1.88 单一全局 ChordInterceptor + 集中优先级）：
 * 任何**已注册 handler 的 context**（如弹窗 'Confirmation'）自动高于
 * activeContexts/Global 进入匹配栈——模态拥有键位，背景组件 cede（handler
 * 透传 / 解析 'none' 事件继续传播）。ChordInterceptor 以
 * contexts = [...handlerContexts, ...activeContexts, 'Global'] 装配后交
 * resolveKeyWithChordState（KeybindingProviderSetup ChordInterceptor，
 * 本测按该装配形传 contexts 参数）；本测固化下游解析层不变量（resolver
 * 纯函数：无 React 渲染/无网络/无盘，unit 层）。
 *
 * P9 spec 原目标 = 侧栏（P1a SidePanel）context 解析优先级 < Confirmation
 * + 侧栏注册模态门（可选加固）——SidePanel 整族（15 文件 + 双 cede 0f8de6b
 * 判别 3 例）已随 0.1.24（626e378 C 波 P1a 全量回退）删除 → 侧栏专属面无
 * 活载体，前向接缝登记：P1a 波复活时须随重实施复原 0f8de6b 判别 3 例族
 * （模态激活 1-5 全透传 / 已开 close·←→·sbs 透传且状态未动 / 无模态
 * 1-5 一键开页）+ 注册模态门（SidePanelKeybindings useRegisterKeybinding-
 * Context 门控）。本测 = 模态隔离原理的泛化不变量（弹窗 context 同键压
 * 背景 context = P0 口径「选选项而非侧栏动作」）。
 */
import { describe, test, expect } from 'bun:test'
import { parseBindings } from '../../src/tui/keybindings/parser'
import { resolveKeyWithChordState } from '../../src/tui/keybindings/resolver'
import type { Key } from '../../src/tui/ink'

/** 裸字符键的最小 Ink Key（modifier 旗标全 false；resolver 只消费
 * ctrl/shift/meta/super/escape + input 字符，余旗标不读）。 */
const PLAIN_KEY = {
  ctrl: false,
  shift: false,
  meta: false,
  super: false,
  escape: false,
} as unknown as Key

/** P0 回归口径 fixture：背景 context（侧栏页键）先声明，模态 context
 * （Confirmation 选项键）后声明——resolver last-wins（同键后声明者胜；
 * 用户覆盖亦同规则）。 */
const SIDEBAR_THEN_MODAL = parseBindings([
  { context: 'SidePanel', bindings: { '1': 'sidebar:pageDecisions' } },
  { context: 'Confirmation', bindings: { '1': 'confirm:selectOption' } },
])

describe('P9（0.1.37 ④）键位模态隔离不变量（解析层）', () => {
  test('① P0 口径：模态 context 在场（handler 已注册）→ 同键解析到模态动作（选选项，非侧栏动作）', () => {
    const r = resolveKeyWithChordState(
      '1',
      PLAIN_KEY,
      // ChordInterceptor 装配形：[...handlerContexts, ...activeContexts, 'Global']
      ['Confirmation', 'SidePanel', 'Global'],
      SIDEBAR_THEN_MODAL,
      null,
    )
    expect(r).toEqual({ type: 'match', action: 'confirm:selectOption' })
  })

  test('② 成员门对照：模态未开（无 handler 注册、非 active）→ 模态绑定不入栈，背景动作胜出', () => {
    const r = resolveKeyWithChordState(
      '1',
      PLAIN_KEY,
      // 模态未开：'Confirmation' 既不在 handlerContexts 也不在 activeContexts
      ['SidePanel', 'Global'],
      SIDEBAR_THEN_MODAL,
      null,
    )
    expect(r).toEqual({ type: 'match', action: 'sidebar:pageDecisions' })
  })

  test('③ 模态显式解绑（null）遮蔽背景绑定——已开模态可压制背景键', () => {
    const bindings = parseBindings([
      { context: 'SidePanel', bindings: { '1': 'sidebar:pageDecisions' } },
      { context: 'Confirmation', bindings: { '1': null } },
    ])
    const r = resolveKeyWithChordState(
      '1',
      PLAIN_KEY,
      ['Confirmation', 'SidePanel', 'Global'],
      bindings,
      null,
    )
    expect(r.type).toBe('unbound')
  })

  test('④ cede 兜底：栈内无 context 绑定的键 → none（事件传播至各组件 handler）', () => {
    const r = resolveKeyWithChordState(
      '2',
      PLAIN_KEY,
      ['Confirmation', 'SidePanel', 'Global'],
      SIDEBAR_THEN_MODAL,
      null,
    )
    expect(r.type).toBe('none')
  })
})
