/**
 * permissions 域 — hasPermissionsToUseTool 决策主体（E-4 S-4b 规则支 +
 * E-6 S-6b 工具面分发回填，§8.33/§8.43）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissions.ts
 * hasPermissionsToUseToolInner。决策序（逐字移植 + 五处裁剪裁定）：
 *   forceDecision 优先 → 1a deny 规则 → 1b ask 规则（⑥ sandbox 自动放行
 *   半落：Bash + 窗口启用 + auto-allow + dangerouslyDisableSandbox≠true
 *   → 跳过落 1c）→ 1c 工具面鸭子分发（checkPermissions 存在才调）→
 *   1d 工具 deny 透传 → 1f 内容 ask（ruleBehavior==='ask'，bypass-immune）→
 *   1g safetyCheck（bypass-immune）→ 2a bypass（bypassPermissions ||
 *   plan+available）→ allow + getUpdatedInputOrFallback → 2b allow
 *   tool-wide → allow + getUpdatedInputOrFallback → 薄骨架兼容（未注入
 *   权限上下文 = 权限体系未接线 → allow，§8.33 矛盾 ④）→ 3 passthrough
 *   → ask（旧仓终端逐字；gate 3 值 verdict ask fail-closed，§8.36）。
 *
 * 裁剪裁定（复审勿当遗漏重提）：
 *   - 1e requiresUserInteraction 裁——新 Tool 契约无该字段；前向接缝 =
 *     工具本体波（49 本体延续；47 = 历史口径 §8.53 审计④）。
 *   - 1c inputSchema.parse 裁——新契约 inputJSONSchema（engine 波）；
 *     abort 重抛 **S-E1 已落**（catch 层 isAbortShapedError 双支形判别，
 *     §8.52 A3；context abortController 活态回填 = 工具本体波前向登记）；
 *     catch logError → logForDebugging（logging port no-op 占位，C-4）。
 *   - ⑥ shouldUseSandbox(input) 裁（124L 依赖面 = 工具本体波），以
 *     input.dangerouslyDisableSandbox !== true 守卫替代；delta 论证：
 *     新仓无 Bash 工具本体 → ⑥ 跳过后落 1c（passthrough）→ 3 → 非
 *     bypass 态仍 ask；delta 仅现于 bypass 态（恒 allow，sandbox 容器
 *     内）与 2b 显式 allow 规则（用户显式授权），无安全方向回归；
 *     工具本体波落 shouldUseSandbox 后单点收编。
 *   - BASH_TOOL_NAME 域内本地镜像——旧仓 import tools/BashTool/
 *     toolName.js，新仓域约束 permissions 域不 import engine 域；
 *     单一事实源 = engine/tools/toolNames.ts（漂移防 = 工具本体波
 *     统一收编）。
 *   - 旧仓 2a 二次 getAppState() 刷新裁——窄 context provider 顶部
 *     单次调用，无 appState 状态机。
 *
 * 已落（§8.65 C 桶 ② 本波）：
 *   ② dontAsk 模式 ask→deny 转换——applyDontAskMode 于 forceDecision / 1b /
 *      1f / 1g / 3 终端各 ask 产点套用（§8.31 裁定 ①；文案单一事实源
 *      ./denialMessages.ts）。
 *   ③ 自动模式 AI 分类器纯逻辑面——autoMode 子域（transcript/xml/usage/
 *      state/denials/approvals/allowlist/prompts 2 .txt 资产）已落；LLM 闭包
 *      （classifyYoloAction 族）留守 → provider 波（前向接缝，见 autoMode 门面）。
 * 残留守（复审勿当遗漏重提）：
 *   ① 工具面 checkPermissions 实现半——Bash / PowerShell 工具本体
 *      checkPermissions 实现（bashPermissions 2471L / BashTool
 *      pathValidation 1303L）归工具本体波；本文件落分发机制半（鸭子
 *      可选，当前零活工具面消费者 = 休眠接缝，H6 前向声明非静默遗漏）。
 *   ④ 连续拒绝跟踪（recordSuccess / persistDenialState）。
 *   ⑤ executePermissionRequestHooks —— hooks→permissions 反向边
 *      （§8.14 注入序 permissions 先于 hooks，E-wave-end 接回；当前 no-op）。
 *   ⑥ sandbox 自动放行半落（本切片）：guard = ⑥ 条件 + dangerouslyDisableSandbox
 *      守卫；窗口接线 = E-wave-end 组合根装配项，placeholder 态 = ⑥ 恒
 *      失活（零行为变化）。
 *
 * 签名（薄骨架起，S-4b 不变）：旧仓 CanUseToolFn 依赖完整 Tool /
 * ToolUseContext / AssistantMessage（engine 类型，未随迁）；此处以窄视图
 * PermissionTool + 泛型 context（可选 getToolPermissionContext）承载。
 * engine 波换回全量类型时本函数决策序不变。
 */
import {
  logForDebugging,
  type PermissionDecision,
  type PermissionResult,
  type ToolPermissionContext,
} from '../shared'
import type { PermissionTool } from './filesystem'
import {
  createPermissionRequestMessage,
  getAskRuleForTool,
  getDenyRuleForTool,
  isAbortShapedError,
  toolAlwaysAllowedRule,
} from './ruleMatching'
import { getSandboxAccess } from './sandboxAccess'
import { DONT_ASK_REJECT_MESSAGE } from './denialMessages'

// 旧仓 BASH_TOOL_NAME（tools/BashTool/toolName.js）域内本地镜像：permissions
// 域不 import engine 域（L2 叶约束），单一事实源 = engine/tools/toolNames.ts
const BASH_TOOL_NAME = 'Bash'

/**
 * 规则支 + 工具面分发 CanUseToolFn 窄视图（旧仓全量 CanUseToolFn 的
 * name/mcpInfo/checkPermissions 子集 + 窄 context）。context 可选
 * getToolPermissionContext —— 未注入 = 权限体系未接线 → 末端 allow
 * （薄骨架默认兼容，非 fail-fast：区别于 bootstrap 窗口）。
 */
export type CanUseToolFn<
  Input extends Record<string, unknown> = Record<string, unknown>,
> = (
  tool: PermissionTool,
  input: Input,
  context: { getToolPermissionContext?(): ToolPermissionContext },
  assistantMessage?: unknown,
  toolUseID?: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>

/**
 * 决策主体（§8.33 规则支 + §8.43 工具面分发）：
 * forceDecision 优先 → 1a deny → 1b ask（⑥ 半落）→ 1c 鸭子分发 → 1d →
 * 1f → 1g → 2a bypass → 2b allow 规则 → 薄骨架兼容（无上下文 = allow）→
 * 3 passthrough → ask。判别信号（tests/unit/permissions.test.ts 工具面
 * 扩展）：1c deny 透传 / 1f 内容 ask bypass-immune / 1g safetyCheck /
 * 2a updatedInput 采纳 + 回落 / ⑥ 三态 / 3 落 ask（gate fail-closed）。
 */
export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  _assistantMessage,
  _toolUseID,
  forceDecision,
): Promise<PermissionDecision> => {
  const permissionContext = context.getToolPermissionContext?.()

  if (forceDecision !== undefined) {
    // ② dontAsk 转换覆盖 forceDecision 早退：旧仓转换置于 inner 末端（「so it
    // can't be bypassed by early returns」），forceDecision 为新仓独有早退产点，
    // 不套则 dontAsk 态下 forced 'ask' 会 bypass ② 不变式（零活调用方，纯闭合）。
    return applyDontAskMode(forceDecision, permissionContext, tool.name)
  }

  const sandbox = getSandboxAccess()

  // 1a. 整工具 deny 规则命中（含 mcp__server 前缀 / __* 通配，toolMatchesRule）
  const denyRule = permissionContext
    ? getDenyRuleForTool(permissionContext, tool)
    : null
  if (denyRule) {
    return {
      behavior: 'deny',
      message: `Permission to use ${tool.name} has been denied.`,
      decisionReason: {
        type: 'rule',
        rule: denyRule,
      },
    }
  }

  // 1b. 整工具 ask 规则命中（⑥ sandbox 自动放行半落：canSandboxAutoAllow
  // 时跳过 ask 规则落 1c 由 Bash 命令特规处理；非沙箱化命令
  // （dangerouslyDisableSandbox）仍尊重 ask 规则）
  const askRule = permissionContext
    ? getAskRuleForTool(permissionContext, tool)
    : null
  if (askRule) {
    const canSandboxAutoAllow =
      tool.name === BASH_TOOL_NAME &&
      sandbox.isSandboxingEnabled() &&
      sandbox.isAutoAllowBashIfSandboxedEnabled() &&
      input.dangerouslyDisableSandbox !== true

    if (!canSandboxAutoAllow) {
      return applyDontAskMode(
        {
          behavior: 'ask',
          message: createPermissionRequestMessage(tool.name),
          decisionReason: {
            type: 'rule',
            rule: askRule,
          },
        },
        permissionContext,
        tool.name,
      )
    }
    // Fall through to let Bash's checkPermissions handle command-specific rules
    //（Bash 工具本体 checkPermissions 实现 = 工具本体波残留守，当前落 1c 空分发）
  }

  // 1c. 问工具实现要权限结果（鸭子可选；旧仓 tool.inputSchema.parse 裁——
  // 新契约 inputJSONSchema 归 engine 波；abort 重抛裁——窄 context 无
  // abortController，E-wave-end 装配项回填）
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  }
  if (tool.checkPermissions) {
    try {
      toolPermissionResult = await tool.checkPermissions(input, context)
    } catch (e) {
      // F4（§8.52 A3）：abort 是控制流非工具错误 → 重抛（旧仓 catch 逐字；
      // 形判别 + delta 登记见 ruleMatching isAbortShapedError 头注）。
      if (isAbortShapedError(e)) throw e
      // 旧仓 logError(e) → logForDebugging（logging port no-op 占位，C-4）
      logForDebugging(`checkPermissions threw for ${tool.name}: ${String(e)}`)
    }
  }

  // 1d. 工具实现拒绝
  if (toolPermissionResult?.behavior === 'deny') {
    return toolPermissionResult
  }

  // 1e 裁（requiresUserInteraction 契约缺，前向接缝工具本体波）

  // 1f. 内容特规 ask（tool.checkPermissions 返回 ruleBehavior==='ask'）
  // 优先于 bypassPermissions——用户显式配置的内容 ask 规则（如
  // Bash(npm publish:*)）在 bypass 态仍须尊重，同 1d 对 deny 的处理。
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule' &&
    toolPermissionResult.decisionReason.rule.ruleBehavior === 'ask'
  ) {
    return applyDontAskMode(toolPermissionResult, permissionContext, tool.name)
  }

  // 1g. 安全检查（.git/ / 配置目录 / shell 配置等）bypass-immune——
  // bypassPermissions 态仍须弹框（checkPathSafetyForAutoEdit 产 safetyCheck）
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return applyDontAskMode(toolPermissionResult, permissionContext, tool.name)
  }

  // 2a. 模式允许工具执行：bypassPermissions 直放 / plan 态且用户以
  // bypass 起步（isBypassPermissionsModeAvailable）
  if (permissionContext) {
    const shouldBypassPermissions =
      permissionContext.mode === 'bypassPermissions' ||
      (permissionContext.mode === 'plan' &&
        permissionContext.isBypassPermissionsModeAvailable)
    if (shouldBypassPermissions) {
      return {
        behavior: 'allow',
        updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
        decisionReason: {
          type: 'mode',
          mode: permissionContext.mode,
        },
      }
    }
  }

  // 2b. 整工具 allow 规则命中
  const alwaysAllowedRule = permissionContext
    ? toolAlwaysAllowedRule(permissionContext, tool)
    : null
  if (alwaysAllowedRule) {
    return {
      behavior: 'allow',
      updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
      decisionReason: {
        type: 'rule',
        rule: alwaysAllowedRule,
      },
    }
  }

  // 薄骨架 no-op-allow 默认兼容（§8.33 矛盾 ④）：未注入权限上下文 =
  // 权限体系未接线 → allow（区别于完整上下文面的无规则落 3 ask）
  if (permissionContext === undefined) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'mode',
        mode: 'default',
      },
    }
  }

  // 3. 将 "passthrough" 转 "ask"（旧仓终端逐字；gate 3 值 verdict
  // ask fail-closed 映射，§8.36——prompt 面残留守）
  const result: PermissionDecision =
    toolPermissionResult.behavior === 'passthrough'
      ? {
          ...toolPermissionResult,
          behavior: 'ask' as const,
          message: createPermissionRequestMessage(
            tool.name,
            toolPermissionResult.decisionReason,
          ),
        }
      : toolPermissionResult

  if (result.behavior === 'ask' && result.suggestions) {
    logForDebugging(
      `Permission suggestions for ${tool.name}: ${JSON.stringify(
        result.suggestions,
        null,
        2,
      )}`,
    )
  }

  // ② dontAsk 转换（ask→deny，末段统一套用，allow 产点不受影响）
  return applyDontAskMode(result, permissionContext, tool.name)
}

/**
 * 从权限结果提取 updatedInput，缺省回落原 input（旧仓 L1317 逐字）。
 * 处理部分 PermissionResult 变体无 updatedInput 字段的情形。
 */
function getUpdatedInputOrFallback(
  permissionResult: PermissionResult,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  return (
    ('updatedInput' in permissionResult
      ? permissionResult.updatedInput
      : undefined) ?? fallback
  )
}

/**
 * ② dontAsk 模式 ask→deny 转换（§8.31 裁定 ① / §8.65 C 桶 ②，旧仓
 * permissions.ts:490-504 逐字语义）：dontAsk 态下任何 'ask' 决策转 'deny'
 * （message = DONT_ASK_REJECT_MESSAGE 逐字，decisionReason = { mode: 'dontAsk' }）。
 * 旧仓在决策主体（inner）末端统一转换（「at the end so it can't be bypassed by
 * early returns」）；新仓决策主体含 forceDecision 早退 + 1b/1f/1g 早退 ask 产点
 * + 3 终端 ask 产点，故在各 ask 产点（含 forceDecision 早退）统一套用本转换
 * （语义 = 所有 ask 产点在 dontAsk 态均转 deny；allow 产点 2a/2b/薄骨架不受
 * 影响，同旧仓仅转换 behavior==='ask'）。forceDecision 早退套转换 = 闭合新仓
 * 独有早退产点（零活调用方传 forceDecision，纯闭合，非行为改动）。
 */
function applyDontAskMode(
  decision: PermissionDecision,
  permissionContext: ToolPermissionContext | undefined,
  toolName: string,
): PermissionDecision {
  if (decision.behavior === 'ask' && permissionContext?.mode === 'dontAsk') {
    return {
      behavior: 'deny',
      message: DONT_ASK_REJECT_MESSAGE(toolName),
      decisionReason: {
        type: 'mode',
        mode: 'dontAsk',
      },
    }
  }
  return decision
}
