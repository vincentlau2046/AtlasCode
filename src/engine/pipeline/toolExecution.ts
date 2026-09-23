/**
 * engine/pipeline — 单 tool_use 执行链（§8.21 E-1 窄 spine T-2，旧仓 toolExecution 裁剪版真核心）
 *
 * 链路：find（注册表 + aliases）→ 权限门接缝 → validateInput 接缝 → pre-hook 接缝
 *   → Tool.call → mapToolResultToToolResultBlockParam → post-hook 接缝。
 * 未知 tool → is_error block（不静默丢弃，LLM 仍收到该 tool_use 的回应）。
 *
 * 裁剪（旧仓 checkPermissionsAndCallTool 1511L 单体）+ 残留守头注释（防「以为已全」）：
 *   - 旧仓单体把 permission 规则树 + MCP 路由 + OTel 遥测 + tool.call + result map 混一处。
 *     本版只留最小执行链，其余按 §8.21 归后续纵切：
 *     · 权限门 → deps.checkPermission 接缝（E-4 规则求值树注入；窄 spine 默认放行）
 *     · MCP 路由 → deps.mcpClients 接缝（E-2；窄 spine 未注入 → MCP tool 未注册 → unknown-tool is_error）
 *     · 钩子 → deps.hooks 接缝（E-5 toolHooks 注入；窄 spine 无操作）
 *     · OTel 遥测 → 旧仓已删（879 logEvent 点清零），无对应物
 *     · 旧仓 zod `inputSchema.safeParse` + buildSchemaNotSentHint（ToolSearch 特性族）→ E-1b/工具面
 *       （新仓 inputSchema 是 JSON schema 非 zod，ToolSearch 未移植，现搬会造假依赖，故留接缝不预造）
 *   - 残留守：并发（E-1b，见 toolOrchestration）/ streaming executor（E-1b）/ MCP 路由（E-2）。
 */
import type {
  AssistantMessage,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
  Tools,
} from '../../shared'
import { classifyToolError } from './errorClassification'

/** E-4 接缝：权限门。窄 spine 默认放行；E-4 注入规则求值树后在此做 allow/deny 裁定。 */
export type PermissionGate = (
  tool: Tool,
  input: unknown,
) => Promise<{ allowed: boolean; reason?: string }>

/** E-5 接缝：工具钩子。窄 spine 无操作；E-5 注入 toolHooks（pre/post 生命周期）。 */
export interface ToolHooks {
  preToolUse?: (tool: Tool, input: unknown, toolUseId: string) => unknown
  postToolUse?: (
    tool: Tool,
    input: unknown,
    block: ToolResultBlockParam,
    toolUseId: string,
  ) => unknown
}

export interface PipelineDeps {
  tools: Tools
  /** E-2 接缝：MCP 客户端注册表。窄 spine 为 undefined（MCP tool 未注册）；E-2 注入路由。 */
  mcpClients?: unknown
  checkPermission?: PermissionGate
  hooks?: ToolHooks
}

export interface ToolExecutionOutcome {
  block: ToolResultBlockParam
  isError: boolean
}

/** 注册表按 name/aliases 查工具（旧仓 findToolByName 的窄 spine 等价物）。 */
export function findTool(tools: Tools, name: string): Tool | undefined {
  return tools.find((t) => t.name === name || (t.aliases?.includes(name) ?? false))
}

/**
 * 单 tool_use 执行链。port 之下全真：Tool.call / mapResult 走 shared Tool 契约（非 fake），
 * 权限/钩子/MCP 为显式接缝（未注入时窄 spine 语义：放行 / 无操作 / 未注册）。
 */
export async function executeToolUse(
  tu: ToolUseBlock,
  assistantMsg: AssistantMessage,
  deps: PipelineDeps,
): Promise<ToolExecutionOutcome> {
  const tool = findTool(deps.tools, tu.name)
  if (!tool) {
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `unknown tool: ${tu.name}`,
        is_error: true,
      },
      isError: true,
    }
  }

  // E-4 接缝：权限门（窄 spine 默认放行）
  const verdict = deps.checkPermission
    ? await deps.checkPermission(tool, tu.input)
    : { allowed: true }
  if (!verdict.allowed) {
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `<tool_use_error>permission denied: ${verdict.reason ?? tu.name}</tool_use_error>`,
        is_error: true,
      },
      isError: true,
    }
  }

  // 输入校验接缝：tool 自带 validateInput（真契约钩子）；旧仓 zod schema safeParse 归 E-1b
  const validation = await tool.validateInput?.(tu.input, undefined)
  if (validation && validation.result === false) {
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `<tool_use_error>InputValidationError: ${validation.message}</tool_use_error>`,
        is_error: true,
      },
      isError: true,
    }
  }

  // E-5 接缝：pre-hook
  await deps.hooks?.preToolUse?.(tool, tu.input, tu.id)

  let block: ToolResultBlockParam
  let isError = false
  try {
    const res = await tool.call(tu.input, undefined, undefined, assistantMsg)
    block = tool.mapToolResultToToolResultBlockParam(res.data, tu.id)
  } catch (error) {
    block = {
      type: 'tool_result',
      tool_use_id: tu.id,
      content: `<tool_use_error>tool error [${classifyToolError(
        error,
      )}]: ${String((error as Error)?.message ?? error)}</tool_use_error>`,
      is_error: true,
    }
    isError = true
  }

  // E-5 接缝：post-hook
  await deps.hooks?.postToolUse?.(tool, tu.input, block, tu.id)

  return { block, isError }
}
