/**
 * engine/tools/plan — EnterPlanModeTool 本体（S-E2 §8.58 plan 族子波；
 * 49 口径 18/49 → 20/49（本批落 2 件后态）；注册表无 plan 专属门控槽 →
 * 无条件注册面（旧 tools.ts plan 族无 feature 门，同 Read/Write 族），
 * isEnabled 恒 true）。
 *
 * 旧仓来源（a8af45b）：src/tools/EnterPlanModeTool/EnterPlanModeTool.ts 113L
 * 逐字随迁多裁（input 无参 strictObject / output { message } / call =
 * agentId 守卫 + setAppState 权限迁移链 / mapResult interview 双变体门）+
 * prompt.ts 103L 逐字随迁（planPrompt.ts 门面）+ UI.tsx 纯 null 体面
 * （renderToolUseMessage 保留，JSX 两面裁 TUI 波）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema/outputSchema) → 新 shared Tool 契约：
 *    inputSchema = 纯 JSON schema 对象（z.strictObject({}) 无参宽骨架转写，
 *    无 additionalProperties 槽位随迁 S-C5 ① 同面：额外键经 duck cast
 *    静默忽略 = 登记行为差非疏漏，N-A4 同族）；旧 zod outputSchema
 *    （z.infer 推断 Output）→ TS 型承载（引擎侧无 wire outputSchema
 *    消费者，D 波前向接缝，S-D2b delta ① 同面）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（getEnterPlanModeToolPrompt，interview 门双变体，planPrompt 门面）；
 *    旧短 description() 体 → ENTER_PLAN_MODE_DESCRIPTION 导出不接线
 *    （TUI 波前向接缝，S-D3 DESCRIPTION 族先例）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true / isReadOnly true（def 显式面，非缺省）/ isDestructive 缺省
 *    false（def 无覆写）/ maxResultSizeChars 100_000（def 体）/
 *    shouldDefer true / searchHint 'switch to plan mode to design an
 *    approach before coding'（def 体）/ userFacingName ''（def 显式
 *    空串成员，非 S-D6 name-wins 场景）/ 无 toAutoClassifierInput
 *    成员 → 旧 buildTool 缺省位（新仓 TOOL 契约必选成员 = 恒 '' 占位，
 *    零发明——plan 工具无分类器输入语义；登记）。
 *  ④ 旧 handlePlanModeTransition（bootstrap/state.ts:201 = any-stub
 *    `: any = (() => ({})) as any`，旧仓即 no-op）→ 裁 + 登记（H6 纪律：
 *    stub 不当真行为）；其唯一消费输入 `const appState =
 *    context.getAppState()` 随裁（duck 无 getAppState 面，planToolInput
 *    登记）。真状态迁移链保留 = prepareContextForPlanMode +
 *    applyPermissionUpdate（新仓 permissions 域已落：permissionSetup.ts:458
 *    / src/permissions/permissionUpdate.ts:53，E-4 面）。
 *  ⑤ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（def 无 member，
 *    S-D3 delta ⑤ 同族先例；plan 工具无路径面）。
 *  ⑥ 旧 call 2 参（_input, context）→ 新 2 参声明保留（context duck
 *    消费：agentId 守卫 + setAppState；input 无参面不消费 args，
 *    S-B5 delta ⑩ 同族先例）。
 *  ⑦ 旧 UI 面：renderToolUseMessage 纯 null 体保留（旧 UI.tsx:9-11
 *    逐字，非 JSX）；renderToolResultMessage / renderToolUseRejectedMessage
 *    JSX 面（getModeColor/BLACK_CIRCLE 'Entered plan mode' /
 *    'User declined to enter plan mode'）→ 裁 TUI 波（前向接缝登记）。
 *
 * 注册面：tools/index.ts re-export 块 + 组合根 baseTools 注入位（CLI 波
 * 前向接缝，同 S-D2b worktree 面）；注册表残留守无 plan 槽（20 槽裁定表
 * 无 plan 条目，无条件注册面）——49 口径 18/49 → 20/49。
 */
import { applyPermissionUpdate } from '../../../permissions'
import { prepareContextForPlanMode } from '../../permissions'
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../toolNames'
import {
  getEnterPlanModeToolPrompt,
  isPlanModeInterviewPhaseEnabled,
} from './planPrompt'
import type {
  EnterPlanModeAppState,
  EnterPlanModeToolContext,
} from './planToolInput'

/** 旧仓 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type EnterPlanModeOutput = {
  message: string
}

/** 旧仓 zod inputSchema 逐字段转写（delta ① 纯 JSON schema，无参面）。 */
export const ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {},
}

export const EnterPlanModeTool: Tool = {
  name: ENTER_PLAN_MODE_TOOL_NAME,
  inputSchema: ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
  searchHint: 'switch to plan mode to design an approach before coding',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  // delta ③ 登记位：旧 def 无 toAutoClassifierInput 成员 → 缺省位恒 ''
  toAutoClassifierInput: () => '',
  userFacingName: () => '',
  // delta ⑤：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体（interview 门双变体）
  description: async () => getEnterPlanModeToolPrompt(),
  // delta ⑥：2 参声明（context duck：agentId 守卫 + setAppState 迁移链）
  async call(_args: unknown, context: unknown): Promise<ToolResult<EnterPlanModeOutput>> {
    const ctx = context as EnterPlanModeToolContext | undefined
    if (ctx?.agentId) {
      throw new Error('EnterPlanMode tool cannot be used in agent contexts')
    }

    // delta ④：旧 handlePlanModeTransition(appState.mode, 'plan') 裁（any-stub
    // no-op）+ 其消费输入 getAppState() 读随裁。
    //
    // Update the permission mode to 'plan'. prepareContextForPlanMode runs
    // the classifier activation side effects when the user's defaultMode is
    // 'auto' — see permissionSetup.ts for the full lifecycle.
    ctx?.setAppState(prev => {
      const prev_ = prev as EnterPlanModeAppState
      return {
        ...prev_,
        toolPermissionContext: applyPermissionUpdate(
          prepareContextForPlanMode(prev_.toolPermissionContext),
          { type: 'setMode', mode: 'plan', destination: 'session' },
        ),
      }
    })

    return {
      data: {
        message:
          'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    { message }: EnterPlanModeOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const instructions = isPlanModeInterviewPhaseEnabled()
      ? `${message}

DO NOT write or edit any files except the plan file. Detailed workflow instructions will follow.`
      : `${message}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`

    return {
      type: 'tool_result',
      content: instructions,
      tool_use_id: toolUseID,
    }
  },
  // delta ⑦：旧 UI.tsx 纯 null 体逐字保留（非 JSX 面）
  renderToolUseMessage: () => null,
}
