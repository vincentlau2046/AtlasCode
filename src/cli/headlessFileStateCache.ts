/**
 * headless 文件态域缓存（0.1.109 W-AB3 ②支，f4 §8 批复 @8ab690ca +
 * §8b 改形批复 @feced92a）。
 *
 * 根因面：headless makeCtx 窄视图缺 readFileState 槽（makeCtx 家族第五例，
 * 0.1.93 RED-F 同族）→ engine 四文件工具可选链静默降级（Read `?.set`
 * no-op 落键蒸发 + Edit/Write 恒「未读」支死循环，T01 wire 直证）。
 *
 * 改形裁定（§8b）：cli→tui 依赖被 boundaries 拦截（DEP-3 域洁净）→
 * 消费 engine `ReadFileState` duck（filesToolInput.ts:116 接口 + :28 头注
 * 「Map 即满足 duck」自证）+ 本文件 = cli 域内 bounded duck cache。
 *
 * 容量语义：Map 插入序 LRU（get 刷新 recency + set 超限逐最旧），上限
 * READ_FILE_STATE_CACHE_SIZE = 100 条（TUI FileStateCache 同参先例
 * mcp.ts:43；字节面 25MB 驱逐不随迁——engine delta ⑭ 同口径，headless
 * 会话级生命周期 + 容量上限双界驻留）。路径归一面：engine 四工具键 =
 * expandPath 归一绝对路径（readTool/fileEditTool 双侧同源），本 cache
 * 键透传零归一（TUI FileStateCache 的 normalize 在该 lane 无可观察差，
 * §8b 语义等价论证）。
 */
import type { FileState, ReadFileState } from '../engine'

/** 与 TUI FileStateCache 同参先例（tui/entrypoints/mcp.ts:43）同源常量。 */
export const HEADLESS_FILE_STATE_CACHE_SIZE = 100

export function createHeadlessFileStateCache(
  maxEntries: number = HEADLESS_FILE_STATE_CACHE_SIZE,
): ReadFileState {
  const map = new Map<string, FileState>()
  return {
    get(key: string): FileState | undefined {
      const value = map.get(key)
      if (value !== undefined) {
        // 插入序 LRU：命中刷新 recency（删后重插 = 移到最旧淘汰端之外）
        map.delete(key)
        map.set(key, value)
      }
      return value
    },
    set(key: string, value: FileState): unknown {
      map.delete(key)
      map.set(key, value)
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
      return value
    },
  }
}
