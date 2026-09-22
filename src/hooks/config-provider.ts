/**
 * hooks 域 — 钩子配置源跨域注入端口（C-Deep 切片 3 T6）
 *
 * 旧仓 getHooksConfig 合并三源（snapshot / registered(SDK callback + plugin) /
 * session + session-function hooks）+ managed-only 策略过滤——全属配置加载体系
 * （engine 波）。薄骨架把「某事件有哪些 matcher」收敛为单一注入端口
 * getHookMatchersForEvent(event)，组合根按 §8.14 注入序接真实配置源；
 * getMatchingHooks 只做 matcher 串匹配（matchQuery 提取 + pattern 匹配），
 * 配置加载不进门面（L3：hooks 不 import 配置/插件域）。
 */
import type { HookEvent } from './hookEvents'
import type { HookMatcher } from './types'

/** 某事件的钩子 matcher 列表（未合并 managed-only 过滤；过滤归 engine 配置源）。 */
export type HookConfigProvider = {
  getHookMatchersForEvent: (event: HookEvent) => HookMatcher[]
}

let _provider: HookConfigProvider | null = null

/** 组合根注入配置源（未注入时 getMatchingHooks 返回空 = 无钩子配置）。 */
export function setHookConfigProvider(provider: HookConfigProvider): void {
  _provider = provider
}

/**
 * 读注入的配置源。未注入 = 返回空数组（无钩子配置，非 fail-fast——钩子未配置
 * 是常态，区别于 bootstrap 状态缺失的 fail-fast）。
 */
export function getHookConfigProvider(): HookConfigProvider | null {
  return _provider
}

/** 测试复位（teardown 用）。 */
export function resetHookConfigProvider(): void {
  _provider = null
}
