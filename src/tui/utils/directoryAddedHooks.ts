/**
 * C8-2（0.1.79 W-C）· /add-dir 后置钩子 fire-and-forget 触发助手。
 *
 * 定位：/add-dir 命令面（add-dir.tsx handleAddDirectory）成功加入工作目录
 * 后触发 DirectoryAdded 钩子（CC 2.1.x 对齐；SDK register_repo_root 面本仓
 * 未迁移）。触发 = fire-and-forget（void 消费 generator，不阻塞目录加入
 * 主路径 / 不阻塞 UI）；无钩子配置时 executeHooks 内 getMatchingHooks 返回
 * 空 → 零执行（热路径零开销）。
 *
 * 异常吞并（logForDebugging）：钩子执行失败不向 UI 冒泡（目录加入主路径
 * fail-safe，同 modelSwitchHooks 语义）。
 */
import { logForDebugging } from './debug.js'
import { executeDirectoryAddedHooks } from './hooks.js'

/** 目录加入钩子专用超时（同 modelSwitchHooks 档——命令主路径不挂起）。 */
const DIRECTORY_ADDED_HOOK_TIMEOUT_MS = 15_000

/**
 * 工作目录加入后触发 DirectoryAdded 钩子（fire-and-forget）。
 * @param directory 加入的目录路径（matcher 过滤面）
 * @param source 持久化目的地（'session' | 'localSettings'，同
 *   PermissionUpdateDestination 词汇）
 */
export function fireDirectoryAddedHooks(directory: string, source: string): void {
  void (async () => {
    try {
      for await (const _hookResult of executeDirectoryAddedHooks(
        directory,
        source,
        undefined,
        DIRECTORY_ADDED_HOOK_TIMEOUT_MS,
      )) {
        // 消费 generator（进度/阻塞消息不渲染到 /add-dir UI——生命周期观察钩子）。
      }
    } catch (e) {
      logForDebugging(
        `DirectoryAdded hook execution failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })()
}
