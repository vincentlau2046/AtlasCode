/**
 * engine/tools/plan — ExitPlanModeV2Tool 本体（S-E2 §8.58 plan 族子波；
 * 49 口径 18/49 → 20/49 末件；注册表无 plan 专属门控槽 → 无条件注册面，
 * isEnabled 恒 true）。
 *
 * 旧仓来源（a8af45b）：src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts 475L
 * 逐字随迁多裁（input allowedPrompts 嵌套 enum + passthrough / output 7 字段
 * 全集 / validateInput mode 判别 ec1 / checkPermissions 非 teammate ask /
 * call = plan 盘读 + CCR 覆写同步支 + prePlanMode 恢复链 / mapResult 4 变体
 * + planLabel）+ prompt.ts 29L 逐字随迁（planPrompt.ts 门面）+ UI.tsx 纯
 * null 体面（renderToolUseMessage 保留，JSX 两面裁 TUI 波）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约：inputSchema 纯 JSON schema
 *    逐字段转写（allowedPrompts 嵌套 { tool: enum ['Bash'], prompt: string }
 *    + 数组 description；旧 z.object 非 strict 内层 + 外层 strictObject()
 *    .passthrough() → JSON schema 面 properties + 无 additionalProperties
 *    声明 = 默认放行，passthrough 等价——SDK normalizeToolInput 注入的
 *    plan/planFilePath 键经此面放行，call 收窄 `'plan' in input` 判别支
 *    依赖不变）；旧 zod outputSchema（z.infer 推断 Output 7 字段）→ TS 型
 *    承载（D 波前向接缝，S-D2b delta ① 同面；awaitingLeaderApproval/
 *    requestId/hasTaskTool 3 可选字段运行时生产者随 delta ⑩⑫ 裁 = 恒
 *    undefined，型面保留待 C 桶 ③ 恢复）。
 *  ② 旧 _sdkInputSchema 导出成员（inputSchema.extend(plan/planFilePath)
 *    SDK 面）→ 裁 + 登记（D 波 SDK 壳接线前向接缝，S-B5 族先例；duck
 *    型 ExitPlanModeV2ToolInput 保留两键供收窄支）。
 *  ③ 旧 requiresUserInteraction 成员（teammate 判 isTeammate() false /
 *    非 teammate true，旧 L173-182）→ 裁 + 登记（新仓 shared Tool 契约
 *    无该成员；消费面 = loop 确认弹框机制（TUI/loop 波）+ teammate 面
 *    （C 桶 ③ shell·swarm 波域））。
 *  ④ 旧 auto-mode gate 面整族裁（feature('TRANSCRIPT_CLASSIFIER') 新仓无
 *    GB 整砍 + autoModeState/permissionSetup auto-mode 门族：gate-off
 *    fallback 通知支（context.addNotification TUI 面）/ restoring-to-auto
 *    判别支 / strip·restoreDangerousPermissions / setAutoModeActive）→
 *    裁 + 登记归属 C 桶 ② auto-mode 纵切波（~3030L 分类器族消费位；
 *    S-D1 裁定重指）。prePlanMode 恢复链主体保留 = delta ⑤。
 *  ⑤ 旧 4 个 plan-mode bootstrap 状态旗标（setHasExitedPlanMode /
 *    setNeedsPlanModeExitAttachment / setNeedsAutoModeExitAttachment /
 *    hasExitedPlanModeInSession，旧 bootstrap/state.ts:237/248/249/308
 *    全 any-stub `: any = (() => ({})) as any`）→ 裁 + 登记（H6 纪律：
 *    stub 不当真行为，旧仓即 no-op 裁零行为差；TUI/attachment 波消费位）。
 *  ⑥ 旧 teammate leader 审批支（call 内 isTeammate && isPlanModeRequired：
 *    plan 缺失 throw / generateRequestId plan_approval / approvalRequest
 *    构造 / writeToMailbox('team-lead') / findInProcessTeammateTaskId +
 *    setAwaitingPlanApproval / awaitingLeaderApproval 输出变体）→ 裁 +
 *    登记归属 C 桶 ③ shell·swarm 波（team/mailbox/swarm 面，S-D1 裁定
 *    重指；validateInput teammate 直通支 + checkPermissions teammate
 *    allow 支同裁）。
 *  ⑦ 旧 persistFileSnapshotIfRemote 同步支（call 内 CCR 覆写后
 *    `void persistFileSnapshotIfRemote()`，plans.ts:360 remote 面）→ 裁
 *    + 登记（remote 波，planDomain delta ④ 同源；writeFile 盘同步主体
 *    保留）。
 *  ⑧ 旧 hasTaskTool = isAgentSwarmsEnabled() && context.options.tools
 *    Agent 工具面 → 裁 + 登记归属 C 桶 ③（team 面；输出 hasTaskTool
 *    字段恒 undefined（delta ① 型面保留），mapResult teamHint 随支裁 =
 *    旧 GA 缺省（swarm 关）teamHint ≡ '' 字节等价）。
 *  ⑨ 旧 call 2 参保留（input + context duck）；旧 5 参 harness 尾参
 *    （canUseTool/parentMessage/onProgress）不随迁（S-B5 delta ⑩ 先例，
 *    旧体不消费）。
 *  ⑩ 旧 UI 面：renderToolUseMessage 纯 null 体保留（旧 UI.tsx:14-16 逐字）；
 *    renderToolResultMessage / renderToolUseRejectedMessage JSX 面
 *    （'Exited plan mode' / 'Plan submitted for team lead approval' /
 *    'User approved …' 3 变体 + RejectedPlanMessage getPlan 回落面）→ 裁
 *    TUI 波（前向接缝登记）。
 *
 * 注册面：tools/index.ts re-export 块 + 组合根 baseTools 注入位（CLI 波
 * 前向接缝，同 S-D2b worktree 面）；49 口径 18/49 → 20/49。
 */
import { writeFile } from 'fs/promises'
import {
  getPlan,
  getPlanFilePath,
} from './planDomain'
import {
  EXIT_PLAN_MODE_V2_TOOL_PROMPT,
} from './planPrompt'
import type {
  ExitPlanModeV2ToolInput,
  ExitPlanModeV2ToolContext,
  ExitPlanModeV2AppState,
  ExitPlanModeV2ValidateContext,
} from './planToolInput'
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { logError } from '../../../shared'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../toolNames'

export type { AllowedPrompt } from './planToolInput'

/** 旧仓 zod allowedPromptSchema 逐字段转写（delta ① 内层对象，非 strict）。 */
const EXIT_ALLOWED_PROMPT_ITEMS: ToolInputJSONSchema['properties'] = {
  tool: {
    type: 'string',
    enum: ['Bash'],
    description: 'The tool this prompt applies to',
  },
  prompt: {
    type: 'string',
    description:
      'Semantic description of the action, e.g. "run tests", "install dependencies"',
  },
}

/** 旧仓 zod inputSchema 逐字段转写（delta ① 纯 JSON schema，passthrough 面）。 */
export const EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    // Prompt-based permissions requested by the plan
    allowedPrompts: {
      type: 'array',
      description:
        'Prompt-based permissions needed to implement the plan. These describe categories of actions rather than specific commands.',
      items: {
        type: 'object',
        properties: EXIT_ALLOWED_PROMPT_ITEMS,
      },
    },
    // 旧 z.strictObject().passthrough() → 无 additionalProperties 声明
    // （默认放行）= passthrough 等价（delta ① 注）
  },
}

/** 旧仓 zod outputSchema z.infer 型（delta ① TS 型承载，7 字段全集）。 */
export type ExitPlanModeV2Output = {
  /** The plan that was presented to the user */
  plan: string | null
  isAgent: boolean
  /** The file path where the plan was saved */
  filePath?: string
  /** Whether the Agent tool is available in the current context（delta ⑧ 运行时恒 undefined，C 桶 ③ 恢复） */
  hasTaskTool?: boolean
  /** True when the user edited the plan (CCR web UI or Ctrl+G) */
  planWasEdited?: boolean
  /** When true, the teammate has sent a plan approval request to the team leader（delta ⑥ 运行时恒 undefined，C 桶 ③ 恢复） */
  awaitingLeaderApproval?: boolean
  /** Unique identifier for the plan approval request（delta ⑥ 运行时恒 undefined，C 桶 ③ 恢复） */
  requestId?: string
}

export const ExitPlanModeV2Tool: Tool = {
  name: EXIT_PLAN_MODE_V2_TOOL_NAME,
  inputSchema: EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
  inputJSONSchema: EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
  searchHint: 'present plan for approval and start coding (plan mode only)',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值；delta ① 族）
  isConcurrencySafe: () => true,
  isReadOnly: () => false, // Now writes to disk
  isDestructive: () => false,
  // 旧 def 无 toAutoClassifierInput 成员 → 缺省位恒 ''（Enter 同族登记）
  toAutoClassifierInput: () => '',
  userFacingName: () => '',
  // delta ⑥ 族：旧 checkPermissions teammate allow 支裁（team 面 C 桶 ③）；
  // 非 teammate = 旧 buildTool 语义显式固化（ask 'Exit plan mode?'）
  checkPermissions: async (input: unknown) => ({
    behavior: 'ask',
    message: 'Exit plan mode?',
    updatedInput: input,
  }),
  // delta ② 族：新契约唯一 prompt 面 = 旧 prompt() 体（静态模板）
  description: async () => EXIT_PLAN_MODE_V2_TOOL_PROMPT,
  async validateInput(
    _input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    // delta ⑥ 族：旧 isTeammate() 直通支裁（team 面，C 桶 ③）；
    // AppState leader-mode 注释随支裁（isPlanModeRequired 源真面同裁）
    const ctx = context as ExitPlanModeV2ValidateContext | undefined
    // The deferred-tool list announces this tool regardless of mode, so the
    // model can call it after plan approval (fresh delta on compact/clear).
    // Reject before checkPermissions to avoid showing the approval dialog.
    const mode = ctx?.getAppState().toolPermissionContext.mode
    if (mode !== 'plan') {
      return {
        result: false,
        message:
          'You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ExitPlanModeV2Output>> {
    const input = args as ExitPlanModeV2ToolInput
    const ctx = context as ExitPlanModeV2ToolContext | undefined
    const isAgent = !!ctx?.agentId

    const filePath = getPlanFilePath(ctx?.agentId)
    // CCR web UI may send an edited plan via permissionResult.updatedInput.
    // queryHelpers.ts full-replaces finalInput, so when CCR sends {} (no edit)
    // input.plan is undefined -> disk fallback. The internal inputSchema omits
    // `plan` (normally injected by normalizeToolInput), hence the narrowing.
    const inputPlan =
      'plan' in input && typeof input.plan === 'string' ? input.plan : undefined
    const plan = inputPlan ?? getPlan(ctx?.agentId)

    // Sync disk so VerifyPlanExecution / Read see the edit.（delta ⑦：旧
    // 「Re-snapshot after: persistFileSnapshotIfRemote」句随裁面登记）
    if (inputPlan !== undefined && filePath) {
      await writeFile(filePath, inputPlan, 'utf-8').catch(e => logError(e))
    }

    // delta ⑥：旧 teammate leader 审批支（isTeammate && isPlanModeRequired
    // 全支）裁（team/mailbox/swarm 面，C 桶 ③ shell·swarm 波；S-D1 裁定
    // 重指）——plan 缺失 throw / generateRequestId / writeToMailbox
    // team-lead plan_approval_request / setAwaitingPlanApproval /
    // awaitingLeaderApproval 输出变体全随支。

    // Note: Background verification hook is registered in REPL.tsx AFTER context clear
    // via registerPlanVerificationHook(). Registering here would be cleared during context clear.
    //（旧注释逐字保留；hook 注册面 = TUI 波残留守）

    // Ensure mode is changed when exiting plan mode.
    // This handles cases where permission flow didn't set the mode
    // (e.g., when PermissionRequest hook auto-approves without providing updatedPermissions).
    // delta ④⑤⑧：旧 gate-off fallback 通知支 / auto-mode 判别支 /
    // bootstrap 4 旗标 / 危险权限 strip·restore 族全裁（登记见头注，C 桶 ②）。
    // delta ⑤ 保留主体 = prePlanMode 恢复链：
    ctx?.setAppState(prev => {
      const prev_ = prev as ExitPlanModeV2AppState
      if (prev_.toolPermissionContext.mode !== 'plan') return prev_
      const restoreMode = prev_.toolPermissionContext.prePlanMode ?? 'default'
      const baseContext = prev_.toolPermissionContext
      return {
        ...prev_,
        toolPermissionContext: {
          ...baseContext,
          mode: restoreMode,
          prePlanMode: undefined,
        },
      }
    })

    // delta ⑧：旧 hasTaskTool 计算支（isAgentSwarmsEnabled + options.tools
    // Agent 面）裁（team 面，C 桶 ③）——输出面 hasTaskTool 恒 undefined。

    return {
      data: {
        plan,
        isAgent,
        filePath,
        planWasEdited: inputPlan !== undefined || undefined,
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    {
      isAgent,
      plan,
      filePath,
      planWasEdited,
    }: ExitPlanModeV2Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    // delta ⑥：旧 awaitingLeaderApproval 变体（team lead 审批提交文案 +
    // Request ID）裁（team 面，C 桶 ③；运行时生产者随支裁）

    if (isAgent) {
      return {
        type: 'tool_result',
        content:
          'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"',
        tool_use_id: toolUseID,
      }
    }

    // Handle empty plan
    if (!plan || plan.trim() === '') {
      return {
        type: 'tool_result',
        content: 'User has approved exiting plan mode. You can now proceed.',
        tool_use_id: toolUseID,
      }
    }

    // delta ⑧：旧 teamHint（TEAM_CREATE_TOOL_NAME 并行提示段）随
    // hasTaskTool 计算支裁 → 旧 GA 缺省（swarm 关）teamHint ≡ '' 字节等价。

    // Always include the plan — extractApprovedPlan() in the Ultraplan CCR
    // flow parses the tool_result to retrieve the plan text for the local CLI.
    // Label edited plans so the model knows the user changed something.
    const planLabel = planWasEdited
      ? 'Approved Plan (edited by user)'
      : 'Approved Plan'

    return {
      type: 'tool_result',
      content: `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${filePath}
You can refer back to it if needed during implementation.

## ${planLabel}:
${plan}`,
      tool_use_id: toolUseID,
    }
  },
  // delta ⑩：旧 UI.tsx 纯 null 体逐字保留（非 JSX 面）
  renderToolUseMessage: () => null,
}
