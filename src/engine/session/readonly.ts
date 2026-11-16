/**
 * engine/session 只读子门面（S0-R 工单 §4.1 / 呈批书 §7.3，f4 批复
 * @f1f1099d）。域内只读服务：web 只读 runtime 经本门面复用 load 族纯
 * 函数，零全局槽、零写面（禁调清单 = session/index.ts 头注写面黑名单：
 * 不触 getSessionMessages 缓存 Map、不触 project 写面、不触发 flush hook）。
 *
 * loadTranscriptFull = 呈批书 §7.3 唯一修形消费点：precompactSkip
 * 'force-full'（跳过 >5MB 尺寸门与 walkChainBeforeParse 两段剔除，全量
 * 读）——persisted-effective-conversation 定义（必改 5b）：
 * 全量读取（skip 禁用）+ terminal leaf 链 + preserved 段物理在盘自然并入
 * + compact 边界行/session 级元数据行不投影（进 summary 域）。不 mutate
 * env（ATLAS_DISABLE_PRECOMPACT_SKIP 禁触）。
 */

import { loadTranscriptFile } from './load'

// S0-R2 形 A（lock-face @25cb7454 §3-4，f4 批复工单 §7 @351c74c4）：只读
// 子门面扩形——runtimeDefault 窄化导入的唯一点（全门面不入载体加载图）。
// buildConversationChain = load.ts:317 纯函数（链重建 + 孤儿并行 tool result
// 回收，零写面）合本门面「load 族纯函数复用」章程；TranscriptMessage 仅
// 供 cast 焊接面（runtimeDefault `as unknown` 边界一次完成），不入 pack
// 出口 entry.ts 面（钉② d.ts 泄漏面零内部型）。
export {
  buildConversationChain,
  TranscriptChangedDuringReadError,
  TranscriptTooLargeError,
} from './load'
export type { TranscriptMessage } from './types'

export type ReadonlyTranscriptLoad = Awaited<
  ReturnType<typeof loadTranscriptFile>
>

/** 全量只读加载（force-full，零截断；只读 runtime 专用）。 */
export async function loadTranscriptFull(
  filePath: string,
  /**
   * S0-R3 加性透传（工单 §8-2）：maxBytes 预解析界（undefined = 不设界）；
   * force-full 恒传 → loader fd 链作用域（§8-1 opts 在场支）。
   */
  opts?: { maxBytes?: number },
): Promise<ReadonlyTranscriptLoad> {
  return loadTranscriptFile(filePath, {
    precompactSkip: 'force-full',
    maxBytes: opts?.maxBytes,
  })
}
