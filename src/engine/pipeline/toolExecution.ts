/**
 * engine/pipeline — 单 tool_use 执行链（§8.21 E-1 窄 spine T-2，旧仓 toolExecution 裁剪版真核心）
 *
 * 链路：find（注册表 + aliases）→ schema 浅校验 → validateInput 接缝 → pre-hook 接缝
 *   → 权限门接缝 → Tool.call → mapToolResultToToolResultBlockParam → post-hook 接缝
 *   （顺序 = 旧仓 checkPermissionsAndCallTool：safeParse→validateInput→pre-hooks→
 *     permission→call，review 2026-09-23 I-3 订正——pre-hook 可携带 hook 权限裁定，
 *     权限门必须最后、紧贴 call 前）。
 * 未知 tool → is_error block（不静默丢弃，LLM 仍收到该 tool_use 的回应）。
 *
 * 裁剪（旧仓 checkPermissionsAndCallTool 1511L 单体）+ 残留守头注释（防「以为已全」）：
 *   - 旧仓单体把 permission 规则树 + MCP 路由 + OTel 遥测 + tool.call + result map 混一处。
 *     本版只留最小执行链，其余按 §8.21 归后续纵切：
 *     · 权限门 → deps.checkPermission 接缝（E-4 规则求值树注入；窄 spine 默认放行）
 *     · MCP 路由 → 已按 E-2 裁定以注册表构建形态闭环（createMcpTools 预构建时把连接绑进
 *       call 闭包，MCP tool 经 getAllBaseTools 并入注册表，pipeline 当普通 Tool 执行，
 *       **无** pipeline 分支 / 无 PipelineDeps 字段；不预造无消费点接缝，登记 §8.22 残余 ⑧）。
 *       MCP 连接生命周期（connect/reconnect/cache）仍残留守（归连接层纵切，见 mcp.ts 头注）。
 *     · 钩子 → deps.hooks 接缝（E-5 toolHooks 注入；窄 spine 无操作）
 *     · OTel 遥测 → 旧仓已删（879 logEvent 点清零），无对应物
 *     · 旧仓 zod `inputSchema.safeParse` → E-1b T-4c 落 JSON-schema 浅校验替身
 *       （schemaValidation.validateInputBySchema + buildSchemaNotSentHint 纯函数）
 *   - 残留守：复合 schema 校验（anyOf/嵌套/enum/区间，见 schemaValidation 头注）/
 *     并发（E-1b，见 toolOrchestration）/ streaming executor（E-1b）/
 *     MCP 连接生命周期（连接层纵切，见 mcp.ts 头注；MCP 路由本身已闭环）/
 *     abort CANCEL 短路（deps.signal.aborted → 不调 tool.call 直返 cancel 结果；旧仓
 *     abort 语义在 loop 层收口，toolExecution 层短路行为未移植，E-1b-full 裁定，
 *     review 2026-09-23 M-4 登记）。
 */
import type {
  AssistantMessage,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
  Tools,
} from '../../shared'
import { classifyToolError } from './errorClassification'
import { buildSchemaNotSentHint, validateInputBySchema } from './schemaValidation'

/**
 * E-4 接缝：权限门。窄 spine 默认放行；E-4 注入规则求值树后在此做
 * allow/deny/ask 裁定（S-4d 3 值 verdict，§8.36）：
 *   - allowed=true → 执行
 *   - allowed=false（无 ask）→ 硬 deny → is_error `permission denied`
 *   - ask=true → 需用户确认（旧仓 TUI 弹窗面，新仓残留守）→ **fail-closed**
 *     is_error + 确认标记（静默执行 = 安全洞；映射支 message 分叉 = ask 字段
 *     消费点，E-5/UI prompt 面落时区分硬拒与待确认）。
 */
export type PermissionGate = (
  tool: Tool,
  input: unknown,
) => Promise<{ allowed: boolean; reason?: string; ask?: boolean }>

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
  checkPermission?: PermissionGate
  hooks?: ToolHooks
  /** 中止信号（T-4c）：透传给 tool.call 第 2 参 context = { signal }（不改 shared Tool.call 契约）。 */
  signal?: AbortSignal
  /**
   * schema 实际下发给模型的工具名集合（T-4c）：未注入 = 全注册工具均下发（窄 spine 语义，
   * buildSchemaNotSentHint 恒 null）；ToolSearch/deferred-tools 层注入真实 discovered 集后，
   * deferred 工具 schema 未下发时 schema 校验失败会回 not-sent 提示。
   */
  discoveredToolNames?: ReadonlySet<string>
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

  // 输入校验 ①：浅 JSON-schema 校验（T-4c，旧仓 zod safeParse 替身）+ schema-not-sent 提示
  const schemaResult = validateInputBySchema(tu.input, tool.inputSchema)
  if (schemaResult.valid === false) {
    const discovered =
      deps.discoveredToolNames ?? new Set(deps.tools.map((t) => t.name))
    const schemaHint = buildSchemaNotSentHint(tool, discovered)
    const errorContent = schemaHint
      ? `${schemaResult.message}${schemaHint}`
      : schemaResult.message
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `<tool_use_error>InputValidationError: ${errorContent}</tool_use_error>`,
        is_error: true,
      },
      isError: true,
    }
  }
  // 输入校验 ②：tool 自带 validateInput（真契约钩子，可选）；signal 经 context 透传
  const validation = await tool.validateInput?.(tu.input, { signal: deps.signal })
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

  // E-4 接缝：权限门（旧仓序：pre-hook 后、call 前——hook 权限裁定在此合流；
  // 窄 spine 默认放行）
  const verdict = deps.checkPermission
    ? await deps.checkPermission(tool, tu.input)
    : { allowed: true }
  if (!verdict.allowed) {
    // S-4d：ask 支 fail-closed（prompt 面残留守登记，§8.36）；deny 支 message 逐字
    // 不变（engine-pipeline.test.ts 既有断言兼容）
    const content = verdict.ask
      ? `<tool_use_error>permission confirmation required (prompt 面残留守): ${verdict.reason ?? tu.name}</tool_use_error>`
      : `<tool_use_error>permission denied: ${verdict.reason ?? tu.name}</tool_use_error>`
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content,
        is_error: true,
      },
      isError: true,
    }
  }

  let block: ToolResultBlockParam
  let isError = false
  try {
    // signal 经 call 第 2 参 context 透传（T-4c；shared Tool.call 契约 context: unknown 不变，
    // 传最小 context 对象 { signal }，工具实现按需取用）。
    const res = await tool.call(tu.input, { signal: deps.signal }, undefined, assistantMsg)
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
