import { randomUUID } from 'crypto'
import { autoCompactIfNeeded } from '../context/autoCompact.js'
import { microcompactMessages } from '../context/microCompact.js'
// B3 (docs/06 §十一): callModel 编排体吸收进 core/modelprovider/streamAssistant.js，
// 此处仅薄转发——QueryDeps['callModel'] 的 `typeof callModel` 契约与 spy 注入路径不变。
import {
  streamAssistant,
  type CallModelOptions as CoreCallModelOptions,
} from 'src/modelprovider'

// ── Options type (formerly GatewayOptions in gateway.ts) ────────────────────
// B3: 实体定义移至 core/modelprovider/streamAssistant.ts，此处 re-export 保持
// 存量 import { CallModelOptions } from './deps' 消费方不变。
export type CallModelOptions = CoreCallModelOptions

import type { AssistantMessage } from '../../../types/message.js'

// ── callModel: thin adapter (B3 后转发到 core streamAssistant) ──────────────
// B3 收敛后转发到 core streamAssistant: build OpenAI params, stream,
// filter to only yield the final AssistantMessage (with D4 summed usage).
// The main loop (query.ts) sees the same contract — exactly one `type:'assistant'`
// message per call.
//
// tui 类型边界（C-7，§8.72 Slice B）：新 modelprovider streamAssistant 的
// I/O 在新 shared 类型面（Message.message: unknown / Tools=Tool<JSONSchema>），
// 闭包消费体（loop.ts 等 C-7 逐字件）按旧消息类型（message?: any）与 tui
// Tool 面消费。本转发边界做双向 cast，运行契约不变（只 yield 最终
// assistant 消息，API error 向上抛）；类型去重归 E-wave-end 审计。
// yield 面收窄为单型 AssistantMessage（与旧仓 callModel 契约一致：每次
// 调用恰好一条 assistant 消息；error 事件向上抛不 yield）——loop.ts 的
// `message.type === 'assistant'` 分支窄化依赖此单型面。
export async function* callModel(args: {
  messages?: unknown
  systemPrompt?: unknown
  thinkingConfig?: unknown
  tools?: unknown
  signal: AbortSignal
  options: CoreCallModelOptions
}): AsyncGenerator<AssistantMessage, void> {
  for await (const ev of streamAssistant(
    args as unknown as Parameters<typeof streamAssistant>[0],
  )) {
    yield ev as unknown as AssistantMessage
  }
}

// ── deps ───────────────────────────────────────────────────────────────────
// I/O dependencies for query(). Passing a `deps` override into QueryParams
// lets tests inject fakes directly instead of spyOn-per-module — the most
// common mocks (callModel, autocompact) are each spied in 6-8 test files
// today with module-import-and-spy boilerplate.
//
// Using `typeof fn` keeps signatures in sync with the real implementations
// automatically. This file imports the real functions for both typing and
// the production factory — tests that import this file for typing are
// already importing query.ts (which imports everything), so there's no
// new module-graph cost.
//
// Scope is intentionally narrow (4 deps) to prove the pattern. Followup
// PRs can add runTools, handleStopHooks, logEvent, queue ops, etc.

export type QueryDeps = {
  // -- model
  callModel: typeof callModel

  // -- compaction
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded

  // -- platform
  uuid: () => string
}

export function productionDeps(): QueryDeps {
  return {
    callModel,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}