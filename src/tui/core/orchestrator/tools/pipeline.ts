// core/orchestrator/tools/pipeline.ts — ToolPipeline 接口定义 (A1.2)
// 洋葱模型中间件链,镜像 toolExecution.ts 的 4 层嵌套结构。
// A4a-A4d 逐步将 checkPermissionsAndCallTool 的 1146 行拆为 5 个中间件。

import type { Tool, ToolUseContext, ToolResult, ToolProgress } from '../../../Tool.js'
import type { Message, AssistantMessage } from '../../../types/message.js'
import type { MessageUpdateLazy, McpServerType } from './toolExecution.js'

// ── 工具执行上下文 ──
// 镜像 checkPermissionsAndCallTool 的 12 个参数 (toolExecution.ts:603-617),
// 打包为单个对象以便中间件链传递。
export interface ToolExecutionContext {
  tool: Tool
  toolUseID: string
  input: { [key: string]: boolean | string | number }
  toolUseContext: ToolUseContext
  canUseTool: (toolName: string, input: object, options: { canUseTool?: boolean }) => Promise<boolean>
  assistantMessage: AssistantMessage
  messageId: string
  requestId: string | undefined
  mcpServerType: McpServerType
  mcpServerBaseUrl: ReturnType<typeof import('../../../services/mcp/utils.js').getLoggingSafeMcpBaseUrl>
  onToolProgress: (progress: ToolProgress<any> | any) => void
  // yield 通道:中间件通过此函数发出 yield 事件(如 permission_request)
  yield: (event: MessageUpdateLazy) => void
}

// ── 工具执行结果 ──
export type ToolExecutionResult = MessageUpdateLazy[]

// ── 中间件签名(洋葱模型,类似 Koa) ──
// 每个中间件可以:
//   1. 前置处理(在 await next() 之前)
//   2. 调用 next() 将控制权传递给下一个中间件
//   3. 后置处理(在 await next() 之后)
// 不调用 next() 则短路(对应原代码中的 early return)。
export type ToolMiddleware = (
  ctx: ToolExecutionContext,
  next: () => Promise<ToolExecutionResult>,
) => Promise<ToolExecutionResult>

// ── ToolPipeline 接口 ──
export interface ToolPipeline {
  execute(ctx: ToolExecutionContext): Promise<ToolExecutionResult>
  readonly middlewares: readonly ToolMiddleware[]
}

// ── compose 辅助类型(标准洋葱模型) ──
export function compose(middlewares: ToolMiddleware[]): (ctx: ToolExecutionContext) => Promise<ToolExecutionResult> {
  return function (ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    let index = -1
    function dispatch(i: number): Promise<ToolExecutionResult> {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i
      const fn = middlewares[i]
      if (!fn) return Promise.resolve([] as ToolExecutionResult)
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)))
      } catch (err) {
        return Promise.reject(err)
      }
    }
    return dispatch(0)
  }
}
