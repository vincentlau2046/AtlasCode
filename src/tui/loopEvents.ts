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
import type { StreamDelta } from 'src/modelprovider'
import type { Message } from 'src/shared'

/**
 * TUI 流事件族（onQueryEvent 期望面子集：request 启动 + Message 族）。
 * Message = shared 宽形（timestamp string|number）——与 AgentLoopEvent 载荷
 * 同源（loop.ts 经 shared 构造）；engine 根门面 re-export 的 Message = session
 * 域窄形（timestamp string），非本面事实源（不混用，H6 登记）。
 *
 * 0.1.70 G-3（composing token 回归波）：stream_delta 事件扩型（定项① = 直接
 * 扩型不包装 Message——消费侧 switch 更清晰，不与 Message 语义混）。backpressure
 * 定项② = 本波不微批合并（pending 队列逐消费者轮次同步排空；Ink 16ms throttle
 * + React 18 自动批吸收渲染；per-token 状态更新 = D-2a 前 legacy 面复原，若
 * 生产 lane 显渲染风暴 = 0.1.71 text_delta 微批合并定参面）。
 */
export type EngineLoopStreamEvent =
  | { type: 'stream_request_start' }
  | { type: 'stream_delta'; delta: StreamDelta }
  // C4-3（0.1.79 W-C）：长工具进度心跳转发（inline 型——tui 不 import engine
  // pipeline 模块，同 stream_delta 不包装 Message 约定）。
  | { type: 'tool_heartbeat'; toolUseId: string; toolName: string; elapsedMs: number }
  | Message

// R1（P0 静默终止）：REPL 捕获终态 AgentLoopResult（emptyTerminated 面）经本
// tui 适配器 re-export（边界面：REPL 只依赖 tui 适配器，不直引 engine 根门面）。
export type { AgentLoopResult } from 'src/engine'

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
        } else if (event.type === 'stream_delta') {
          // 0.1.70 G-3：per-token 转发（修前落 else 被丢弃 = TUI 永不收
          // per-token 根因面；TUI for-await 消费，激活既有死代码接线）。
          pending.push(event)
        } else if (event.type === 'tool_heartbeat') {
          // C4-3（0.1.79 W-C）：长工具心跳转发（同 stream_delta 瞬态面；消费 =
          // REPL handleMessageFromStream → spinnerTip「仍在运行」）。
          pending.push(event)
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
