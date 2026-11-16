/**
 * AtlasWeb S0-R2 默认 runtime 装配（形 A：engine 真体随 bundle）。
 *
 * S0-R2（lock-face @25cb7454 §1/§3-4，f4 批复工单 §7 @351c74c4）：本文件
 * **入 pack 加载图**（pack 格重形：engine/session 只读闭包允许）——import
 * 自 `src/engine` 全门面窄化为只读子门面 `src/engine/session/readonly`
 * （S0-R f4 批复 @f1f1099d 专用面；载体图 = readonly + load 族纯函数 +
 * 域内依赖，query/loopDeps/pipeline/tools 全纵切出图）。本文件是
 * 'src/engine' 与 web 只读域之间的唯一焊接点：注入 engine 真体
 * （loadTranscriptFull force-full + load.ts buildConversationChain），并在
 * 边界做结构类型 cast（engine TranscriptMessage → 投影源结构面）。相对
 * import（非 'src/' alias）：tsconfig.web-session-runtime 无 paths 映射 +
 * d.ts 面只认相对 specifier（rewrite 脚本钉死形）。
 */

import {
  buildConversationChain,
  loadTranscriptFull,
  type TranscriptMessage,
} from '../../engine/session/readonly'

import type { ProjectionSourceMessage } from './projection'
import {
  createReadonlySessionRuntime,
  type ReadonlySessionRuntime,
  type ReadonlySessionRuntimeOptions,
} from './readonlyRuntime'

/** 默认装配 options（engine 必填缝已由本模块填死）。 */
export type AtlasWebSessionRuntimeOptions = Omit<
  ReadonlySessionRuntimeOptions,
  'engine'
>

/** 引擎真体（cast 焊接：engine 类型 → 投影源结构面，边界一次完成）。 */
export function atlasWebSessionEngine(): ReadonlySessionRuntimeOptions['engine'] {
  return {
    loadTranscriptFull: async (filePath, opts) => {
      const loaded = await loadTranscriptFull(filePath, opts)
      return {
        messages: loaded.messages as unknown as Map<string, ProjectionSourceMessage>,
        leafUuids: loaded.leafUuids,
      }
    },
    buildConversationChain: (messages, leaf) =>
      buildConversationChain(
        messages as unknown as Map<string, TranscriptMessage>,
        leaf as unknown as TranscriptMessage,
      ) as unknown as ProjectionSourceMessage[],
  }
}

/**
 * 默认装配 factory（形 A 出口名，工单 §2/§6-3）：createReadonlySessionRuntime
 * + engine 注入。注入缝（options.engine）保留不动（预答不变量，工单 §6-2）——
 * 本 factory 仅把 engine 成员填死后委托注入缝。旧名 createAtlasWebSessionRuntime
 * 改名（grep 实证零调用点，零别名）。
 */
export function createDefaultReadonlySessionRuntime(
  options: AtlasWebSessionRuntimeOptions,
): ReadonlySessionRuntime {
  return createReadonlySessionRuntime({ ...options, engine: atlasWebSessionEngine() })
}
