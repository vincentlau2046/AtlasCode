/**
 * AtlasWeb S0-R CLI 默认 runtime 装配（R-3 引擎适配边界）。
 *
 * 本文件是 'src/engine' 与 web 只读域之间的**唯一**焊接点：注入 engine
 * 真体（loadTranscriptFull force-full + load.ts buildConversationChain），
 * 并在边界做结构类型 cast（engine TranscriptMessage → 投影源结构面）。
 * **不进 pack 加载图**——`./web-session-runtime` 出口（entry.ts）走本域
 * 注入缝，消费方自备 engine（§4.5 加载图审计：pack 图零 'src/engine'
 * 导入）。STR-1：engine 消费只许域门面（src/engine 门面导出面）。
 */

import {
  buildConversationChain,
  loadTranscriptFull,
  type TranscriptMessage,
} from 'src/engine'

import type { ProjectionSourceMessage } from './projection'
import {
  createReadonlySessionRuntime,
  type ReadonlySessionRuntime,
  type ReadonlySessionRuntimeOptions,
} from './readonlyRuntime'

/** CLI 装配 options（engine 必填缝已由本模块填死）。 */
export type AtlasWebSessionRuntimeOptions = Omit<
  ReadonlySessionRuntimeOptions,
  'engine'
>

/** 引擎真体（cast 焊接：engine 类型 → 投影源结构面，边界一次完成）。 */
export function atlasWebSessionEngine(): ReadonlySessionRuntimeOptions['engine'] {
  return {
    loadTranscriptFull: async filePath => {
      const loaded = await loadTranscriptFull(filePath)
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

/** CLI 真体装配：createReadonlySessionRuntime + engine 注入。 */
export function createAtlasWebSessionRuntime(
  options: AtlasWebSessionRuntimeOptions,
): ReadonlySessionRuntime {
  return createReadonlySessionRuntime({ ...options, engine: atlasWebSessionEngine() })
}
