// core/orchestrator/tools/defaultPipeline.ts — 默认中间件链 (A4a)
// L4 resultNormalizeMiddleware 骨架 + 5 个中间件的组装点。
// 采用回调注入模式(与 A3 DefaultContextManager 一致):
//   中间件逻辑从 toolExecution.ts 提取为独立函数后注入。
// A4a-A4d 逐步将 checkPermissionsAndCallTool 的 1146 行拆为 5 个中间件。

import type { ToolMiddleware, ToolPipeline, ToolExecutionContext, ToolExecutionResult } from './pipeline.js'
import { compose } from './pipeline.js'

// ── L4: 结果规范化 + 遥测 (行1443-1749, 306 行) ──
// 包含: imagePasteId 生成 → result 消息构造 → MCP result → post-tool hooks →
//       hook timing display → analytics 事件 → error handling(PostToolUseFailure) → cleanup
// 与 loop.ts 局部变量深度耦合(resultingMessages, toolOutput, hookResults, decisionInfo 等),
// A4a 阶段用回调注入,A4d 组装完整管道时内联提取。
export type ResultNormalizeFn = (
  ctx: ToolExecutionContext,
  next: () => Promise<ToolExecutionResult>,
) => Promise<ToolExecutionResult>

// ── L1: 权限检查 (行610-842, 232 行) ──
export type PermissionCheckFn = ToolMiddleware

// ── L2: 工具查找 + MCP 路由 (行843-1083, 240 行) ──
export type McpRouteFn = ToolMiddleware

// ── L3: 工具调用 (行1083-1443, 360 行) ──
export type ToolInvokeFn = ToolMiddleware

// ── L4 前半: 遥测开始 ──
export type TelemetryStartFn = ToolMiddleware

export interface DefaultPipelineDeps {
  telemetryStart?: TelemetryStartFn
  permissionCheck?: PermissionCheckFn
  mcpRoute?: McpRouteFn
  toolInvoke?: ToolInvokeFn
  resultNormalize?: ResultNormalizeFn
}

/**
 * DefaultToolPipeline — ToolPipeline 的默认实现。
 *
 * 中间件顺序与原始 checkPermissionsAndCallTool 逐行对应:
 *   [telemetryStart] → [permissionCheck] → [mcpRoute] → [toolInvoke] → [resultNormalize]
 *
 * A4a: resultNormalize 骨架就位(L4 回调注入)
 * A4b: permissionCheck 骨架就位(L1 回调注入)
 * A4c: mcpRoute 骨架就位(L2 回调注入)
 * A4d: toolInvoke 骨架就位 + 组装完整管道 + 中间件单测
 *
 * L1 权限检查 (行610-842, 232 行) 包含:
 *   - safeParse 输入验证 (行619-684) → 失败 return error
 *   - validateInput 值验证 (行687-842) → 失败 return error
 *   - permissionDecision (allow/deny/ask) → ask 时 yield permission_request
 *   - 用户 allow/deny 响应处理
 * 与 toolExecution.ts 局部变量深度耦合(parsedInput, permissionDecision,
 *   allowContentBlocks, decisionInfo, messageId, requestId, mcpServerType 等),
 * 无法作为独立函数抽离。接口+回调注入已就位,
 * 实际 L1 逻辑在主循环改造为 ToolPipeline.execute() 时内联提取。
 *
 * L2 工具查找 + MCP 路由 (行843-1083, 240 行) 包含:
 *   - pre-tool hooks 执行 (行843-895): block→return, continue→skip, stopReason→return
 *   - toolAttributes 提取 (行897-917): file_path/command 等属性
 *   - resolveHookPermissionDecision (行925-935): 合并 hook 权限决策
 *   - permissionDecision 处理 (行936-1083): allow→继续, deny→return error,
 *     ask→yield permission_request → 用户 allow/deny
 *   - getAllBaseTools alias 回退 (O-CLEAN.3 已注入化)
 *   - MCP 工具路由 (isMcpTool → MCP server 调用)
 * 与 toolExecution.ts 局部变量深度耦合(processedInput, permissionDecision,
 *   resultingMessages, hookPermissionResult, preToolHookInfos, stopReason 等),
 * 无法作为独立函数抽离。接口+回调注入已就位,
 * 实际 L2 逻辑在主循环改造为 ToolPipeline.execute() 时内联提取。
 *
 * L3 工具调用 (行1083-1443, 360 行) 包含:
 *   - permissionDenied hooks (行1083-1108): retry 时注入 meta 消息
 *   - toolParameters 提取 (行1138-1173): bash_command/file_path/mcp_details/skill_name
 *   - callInput 收敛 (行1193-1209): hook/permission 修改后的输入 vs 原始输入
 *   - tool.call() 调用 (行1211-1226): 核心工具执行
 *   - result span 记录 (行1230-1292): content attributes + structured output + toolResultStr
 *   - mapToolResultToToolResultBlockParam (行1296-1322): 结果 → API 格式
 *   - fileExtension 提取 (行1308-1322): 文件类工具分析
 *   - toolUseResult + mcpMeta 构造 (行1323-1478): 结果消息打包
 * 与 toolExecution.ts 局部变量深度耦合(callInput, processedInput, result,
 *   resultingMessages, mappedToolResultBlock, toolOutput, toolUseResult 等),
 * 无法作为独立函数抽离。接口+回调注入已就位,
 * 实际 L3 逻辑在主循环改造为 ToolPipeline.execute() 时内联提取。
 *
 * A4d 完成后 5 个中间件全部骨架就位,组装为完整管道:
 *   [telemetryStart] → [permissionCheck] → [mcpRoute] → [toolInvoke] → [resultNormalize]
 * 实际逻辑提取在 Phase B(主循环改造为 Orchestrator.execute)时完成。
 *
 * 未注入的中间件用 passthrough(next 直接调用)。
 */
export class DefaultToolPipeline implements ToolPipeline {
  private readonly _middlewares: ToolMiddleware[]
  private readonly _execute: (ctx: ToolExecutionContext) => Promise<ToolExecutionResult>

  constructor(deps: DefaultPipelineDeps = {}) {
    const passthrough: ToolMiddleware = (_ctx, next) => next()
    this._middlewares = [
      deps.telemetryStart ?? passthrough,
      deps.permissionCheck ?? passthrough,
      deps.mcpRoute ?? passthrough,
      deps.toolInvoke ?? passthrough,
      deps.resultNormalize ?? passthrough,
    ]
    this._execute = compose(this._middlewares)
  }

  get middlewares(): readonly ToolMiddleware[] {
    return this._middlewares
  }

  execute(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    return this._execute(ctx)
  }
}
