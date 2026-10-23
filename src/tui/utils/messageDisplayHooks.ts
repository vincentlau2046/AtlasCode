/**
 * C8-3（0.1.79 W-C）· assistant 完整消息显示钩子 fire-and-forget 触发助手。
 *
 * 定位：messages.ts handleMessageFromStream 的 assistant 完整消息显示
 * chokepoint——非空文本提取后触发 MessageDisplay 钩子（观察钩子，不改写
 * 显示内容）。触发 = fire-and-forget（void 消费 generator，不阻塞消息
 * 显示主路径 / 不阻塞 UI）；无钩子配置时 executeHooks 内 getMatchingHooks
 * 返回空 → 零执行（热路径零开销）。
 *
 * 异常吞并（logForDebugging）：钩子执行失败不向 UI 冒泡（显示主路径
 * fail-safe，同 directoryAddedHooks / modelSwitchHooks 语义）。
 */
import { logForDebugging } from './debug.js'
import { executeMessageDisplayHooks } from './hooks.js'

/** 消息显示钩子专用超时（同 directoryAddedHooks 档——显示主路径不挂起）。 */
const MESSAGE_DISPLAY_HOOK_TIMEOUT_MS = 15_000

/**
 * assistant 完整消息进显示面前触发 MessageDisplay 钩子（fire-and-forget）。
 * @param message 提取后的消息文本面（空文本在调用点短路，不进本函数）
 */
export function fireMessageDisplayHooks(message: string): void {
  void (async () => {
    try {
      for await (const _hookResult of executeMessageDisplayHooks(
        message,
        undefined,
        MESSAGE_DISPLAY_HOOK_TIMEOUT_MS,
      )) {
        // 消费 generator（进度/阻塞消息不渲染到消息显示主路径——观察钩子）。
      }
    } catch (e) {
      logForDebugging(
        `MessageDisplay hook execution failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })()
}
