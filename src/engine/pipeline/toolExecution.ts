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
 *     · 钩子 → deps.hooks 接缝（E-5 S-5a 落：ToolHooks 返回值类型化 + 消费支
 *       （pre：blockingError 短路 / updatedInput 回写 / hookBehavior 合权限门
 *       mergeHookPermission；post：additionalContext 捕获，回灌 = 消息面残留守
 *       前向接缝登记）；窄 spine（未注入）无操作。settings.hooks 生产接线的
 *       适配器 = engine/hooks L3 连接器（createToolHooks，§8.39 C-1））
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

/**
 * E-5 S-5a：pre-hook 结果（§8.39 C-6：消费 AggregatedHookResult，非 fire-and-forget）。
 * 字段 = hooks 域聚合面的 pipeline 可见子集（engine/hooks createToolHooks 适配器产出）：
 *  - blockingError：钩子阻塞（JSON block / exit-2 / permissionDecision deny 域聚合）
 *    → executeToolUse 短路 tool_result is_error（工具不执行）。
 *  - updatedInput：钩子改写输入（多钩子 last wins，域聚合语义）→ effective 入参
 *    （权限门在 effective 入参上重判 + tool.call 消费，旧仓 toolHooks.ts:270 语义）。
 *  - hookBehavior：钩子权限裁定（域最严优先聚合 deny>ask>allow>passthrough）
 *    → mergeHookPermission 合 E-4 权限门（不变量：hook 'allow' 不绕过 settings deny/ask）。
 */
export interface PreToolUseHookOutcome {
  blockingError?: string
  updatedInput?: unknown
  hookBehavior?: HookPermissionBehavior
}

/** E-5 S-5a：post-hook 结果（additionalContext 回灌 = 消息面残留守，见下前向接缝登记）。 */
export interface PostToolUseHookOutcome {
  /** 钩子附加上下文（回灌 LLM 上下文 = message/REPL 波残留守，本版仅透传不硬填）。 */
  additionalContext?: string
}

/** 钩子权限裁定四值（hooks 域 AggregatedHookResult.permissionBehavior 值集）。 */
export type HookPermissionBehavior = 'allow' | 'deny' | 'ask' | 'passthrough'

/** 权限门 verdict 形态（PermissionGate 返回值，mergeHookPermission 参数/返回）。 */
export type GateVerdict = { allowed: boolean; reason?: string; ask?: boolean }

/**
 * E-5 S-5a：钩子权限裁定 × E-4 权限门合流（§8.39 C-6，旧仓 toolHooks.ts:270
 * resolveHookPermissionDecision 逐字语义裁剪版）。落 pipeline（纯函数，防
 * engine/hooks↔pipeline 循环 import）：
 *  - hook 'deny' = 最严：直接拒（不参考门；域聚合 blockingError 先行短路，此为兜底支）。
 *  - 门 verdict 优先于 hook 'allow'（**不变量：hook allow 不绕过 settings deny/ask**——
 *    门 allowed=false（硬 deny / ask fail-closed）原样返回，hook allow 不翻案）。
 *  - hook 'ask'：门放行但钩子要求确认 → fail-closed 确认标记（prompt 面残留守，
 *    同 E-4 ask 裁定 §8.36；门已拒时门优先，ask 不覆盖 deny）。
 *  - 'allow' / 'passthrough' / 缺省：门 verdict（门 allowed=true → 放行）。
 */
export function mergeHookPermission(
  hookBehavior: HookPermissionBehavior | undefined,
  gate: GateVerdict,
): GateVerdict {
  if (hookBehavior === 'deny') {
    return { allowed: false, reason: 'blocked by hook' }
  }
  if (!gate.allowed) return gate
  if (hookBehavior === 'ask') {
    return { allowed: false, ask: true, reason: 'hook requested confirmation' }
  }
  return gate
}

/**
 * E-5 接缝：工具钩子。窄 spine 无操作（未注入）；E-5 S-5a 起返回值类型化
 * （C-6 消费支，§8.39）——pre 返 PreToolUseHookOutcome（executeToolUse 消费：
 * blockingError 短路 / updatedInput 回写 / hookBehavior 合权限门），post 返
 * PostToolUseHookOutcome（additionalContext 回灌 = 消息面残留守，前向接缝登记
 * 于本文件头注，本版仅消费不硬填）。同步 void 回调（测试替身）经 void-return
 * 回调豁免仍类型合法，await 得 undefined = 窄 spine 语义不变。
 */
export interface ToolHooks {
  preToolUse?: (
    tool: Tool,
    input: unknown,
    toolUseId: string,
  ) => Promise<PreToolUseHookOutcome>
  postToolUse?: (
    tool: Tool,
    input: unknown,
    block: ToolResultBlockParam,
    toolUseId: string,
  ) => Promise<PostToolUseHookOutcome>
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

  // E-5 S-5a 接缝：pre-hook（C-6 消费支：非 fire-and-forget，§8.39）
  const preOutcome = await deps.hooks?.preToolUse?.(tool, tu.input, tu.id)
  // 钩子阻塞（exit-2 / JSON block / permissionDecision deny，域聚合 blockingError）
  // → 短路 is_error（工具不执行，LLM 仍收到该 tool_use 的回应）。
  if (preOutcome?.blockingError) {
    return {
      block: {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `<tool_use_error>hook blocked: ${preOutcome.blockingError}</tool_use_error>`,
        is_error: true,
      },
      isError: true,
    }
  }
  // 钩子改写输入（last wins）→ effective 入参（权限门 + tool.call 均消费）
  const effectiveInput = preOutcome?.updatedInput ?? tu.input

  // E-4 接缝：权限门（旧仓序：pre-hook 后、call 前——hook 权限裁定在此合流；
  // 门在钩子改写后的 effective 入参上重判，旧仓 checkRuleBasedPermissions 语义）。
  // 不变量（mergeHookPermission）：hook 'allow' 不绕过 settings deny/ask。
  // 窄 spine（门未注入）= 默认放行。
  const gateVerdict = deps.checkPermission
    ? await deps.checkPermission(tool, effectiveInput)
    : { allowed: true }
  const verdict = mergeHookPermission(preOutcome?.hookBehavior, gateVerdict)
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
    const res = await tool.call(effectiveInput, { signal: deps.signal }, undefined, assistantMsg)
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

  // E-5 S-5a 接缝：post-hook（C-6 消费支：执行 + 捕获，非 fire-and-forget；
  // 钩子本体命令真经 shell 端口执行——本版的真效果）。
  const postOutcome = await deps.hooks?.postToolUse?.(tool, effectiveInput, block, tu.id)
  // additionalContext 上下文回灌 = message/REPL 波前向接缝（§8.39 C-6 登记）：
  // 本版捕获结果不硬填回灌（新仓无消息面）；回灌消费点 = 消息/REPL 波，
  // 登记于 engine/hooks 子门面头注（防 H6 死接缝：接缝有登记 + 有执行效果，非空置）。
  void postOutcome

  return { block, isError }
}
