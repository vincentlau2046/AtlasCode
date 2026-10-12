/**
 * 0.1.56 A · 模型切换钩子 fire-and-forget 触发助手（CC 2.1.251）。
 *
 * 定位：TUI model.tsx 两处切换点（/model [name] 命令支 source='command' +
 * 模型选择器支 source='picker'）在 setAppState 前后各触发一次 Pre/Post
 * ModelSwitch 钩子。触发 = fire-and-forget（void 消费 generator，不阻塞模型
 * 切换主路径 / 不阻塞 UI）；无钩子配置时 executeHooks 内 getMatchingHooks 返回
 * 空 → 零执行（热路径零开销）。
 *
 * 异常吞并（logForDebugging）：钩子执行失败不向 UI 冒泡（模型切换主路径
 * fail-safe，同 executeSessionStartHooks 消费面语义）。
 */
import { logForDebugging } from './debug.js'
import {
  executePostModelSwitchHooks,
  executePreModelSwitchHooks,
} from './hooks.js'

/** 模型切换钩子专用超时（短于工具钩子 10min 档——切换主路径不挂起）。 */
const MODEL_SWITCH_HOOK_TIMEOUT_MS = 15_000

/**
 * 模型切换前触发 PreModelSwitch 钩子（fire-and-forget）。
 * @param oldModel 切换前模型（可缺省——命令支 best-effort 未必知当前模型）
 * @param newModel 切换目标模型
 * @param source 切换来源（'command' | 'picker'）
 */
export function firePreModelSwitch(
  oldModel: string | undefined,
  newModel: string,
  source: string,
): void {
  void (async () => {
    try {
      for await (const _hookResult of executePreModelSwitchHooks(
        oldModel,
        newModel,
        source,
        undefined,
        MODEL_SWITCH_HOOK_TIMEOUT_MS,
      )) {
        // 消费 generator（进度/阻塞消息不渲染到模型切换 UI——生命周期观察钩子）。
      }
    } catch (e) {
      logForDebugging(
        `PreModelSwitch hook execution failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })()
}

/**
 * 模型切换后触发 PostModelSwitch 钩子（fire-and-forget）。
 * @param oldModel 切换前模型（可缺省）
 * @param newModel 切换目标模型（已生效）
 * @param source 切换来源（'command' | 'picker'）
 */
export function firePostModelSwitch(
  oldModel: string | undefined,
  newModel: string,
  source: string,
): void {
  void (async () => {
    try {
      for await (const _hookResult of executePostModelSwitchHooks(
        oldModel,
        newModel,
        source,
        undefined,
        MODEL_SWITCH_HOOK_TIMEOUT_MS,
      )) {
        // 消费 generator（进度/阻塞消息不渲染到模型切换 UI——生命周期观察钩子）。
      }
    } catch (e) {
      logForDebugging(
        `PostModelSwitch hook execution failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })()
}
