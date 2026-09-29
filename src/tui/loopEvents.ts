/**
 * W3-3a（§8.74.2/§8.74.14）：engine loop 事件适配层（W3-(c) 类胶水）——
 * AgentLoopEvent → TUI onQueryEvent 事件族（轮粒度重放；per-token 流式面 =
 * W-opt 残留守，engine 不引入 chatStream，§8.74.2 裁定）。
 *
 * 桥语义（同步 emit 回调 → 异步生成器队列）：queryAgentLoop 的 Promise 终态
 * 与逐轮 emit 经通知队列重放为 `stream_request_start` + Message 族（shared
 * Message 形 = tui handleMessageFromStream 直接消费，零 tui 消息构造器）。
 *
 * 事件族映射裁定（H6 登记，复审勿当遗漏重提）：
 *  - loop_start / loop_end 不入流：request 启动 = 本生成器首 yield；终态 =
 *    generator return（AgentLoopResult，3b REPL 重接线映射 Terminal）。
 *  - compacted → 仅重放 messages[0]（压缩边界 marker，TUI
 *    isCompactBoundaryMessage 渲染面）；摘要消息 / messagesToKeep 不入流
 *    （内容已在上下文，3b 重接线时如需展示面再裁）。
 *  - round_end → assistantMessage + toolResultMessages（顺序 = toolResults 顺序；
 *    terminal 轮 = 仅 assistant）。
 *  - emit 同步观察者契约（engine loop.ts 头注：不 catch 不吞；本适配层入队
 *    不抛）。
 *
 * 消费方 = W3-3b REPL 重接线（onQueryImpl 的 `for await (event of query(...))`
 * 面替换为本生成器 + 3c orchestrator 删净）；本模块 3a 落盘时零活消费者
 * （前向接缝，判别单测 tests/unit/engine-loop-emit.test.ts 覆盖）。
 */
import {
  queryAgentLoop,
  type AgentLoopArgs,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentLoopResult,
} from 'src/engine'
import type { Message } from 'src/shared'

/**
 * TUI 流事件族（onQueryEvent 期望面子集：request 启动 + Message 族）。
 * Message = shared 宽形（timestamp string|number）——与 AgentLoopEvent 载荷
 * 同源（loop.ts 经 shared 构造）；engine 根门面 re-export 的 Message = session
 * 域窄形（timestamp string），非本面事实源（不混用，H6 登记）。
 */
export type EngineLoopStreamEvent = { type: 'stream_request_start' } | Message

export interface EngineLoopParams {
  deps: AgentLoopDeps
  args: AgentLoopArgs
}

/**
 * engine loop 的 TUI 流面包装：逐轮重放 assistant / tool result 消息，
 * 终态返回 AgentLoopResult（generator return）。
 */
export async function* queryEngineLoopStream(
  params: EngineLoopParams,
): AsyncGenerator<EngineLoopStreamEvent, AgentLoopResult, unknown> {
  const pending: EngineLoopStreamEvent[] = []
  let wake: (() => void) | null = null
  let finished = false
  let loopResult: AgentLoopResult | undefined
  let loopError: unknown

  const notify = () => {
    const w = wake
    wake = null
    w?.()
  }

  void queryAgentLoop(
    {
      ...params.deps,
      emit: (event: AgentLoopEvent) => {
        if (event.type === 'round_end') {
          pending.push(event.assistantMessage, ...event.toolResultMessages)
        } else if (event.type === 'compacted') {
          pending.push(event.messages[0])
        }
        notify()
      },
    },
    params.args,
  )
    .then(result => {
      finished = true
      loopResult = result
      notify()
    })
    .catch(error => {
      finished = true
      loopError = error
      notify()
    })

  yield { type: 'stream_request_start' }
  for (;;) {
    while (pending.length > 0) {
      yield pending.shift() as EngineLoopStreamEvent
    }
    if (finished) {
      if (loopError !== undefined) throw loopError
      return loopResult as AgentLoopResult
    }
    await new Promise<void>(resolve => {
      wake = resolve
    })
  }
}
