/**
 * 0.1.63 P8 — ProposeGoal 工具本体（CC 2.1.227）。
 *
 * 上游语义（2.1.227 ProposeGoal 工具描述）：agent 主动 propose 可验证多回合
 * goal。ask_user=true（默认，单键批准，decline 不通知）/ ask_user=false（仅限
 * 用户原话明确要求）；评估器仅从对话验证（不跑命令不读文件）；条件 ≤500 字符
 * 单一可测终态；one goal at a time（新批准替换旧）。
 *
 * 落码面：
 *   - schema = condition（string, required, ≤500）+ ask_user（boolean, default true）
 *   - checkPermissions：ask_user=true → behavior='ask'（审批弹窗，AskUserQuestion
 *     族既有模式）；ask_user=false → behavior='allow'（直接 arm，工具描述提示词
 *     承载「仅用户原话」硬约束）
 *   - call → armGoal(condition)（one-goal-at-a-time 语义 = armGoal 新设替换旧；
 *     ≤500 / 空条件 = armGoal fail-closed 拒绝）
 *   - description() = PROPOSE_GOAL_PROMPT（2.1.227 全文移植 + 国产适配）
 *
 * 注册：loopDeps.ts baseTools 注入（恒注册 isEnabled=() => true，非门控工具）。
 * 零回归：未调用时 goal 状态机零变更（既有路径零漂移）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { jsonStringify } from '../../session/json'
import { PROPOSE_GOAL_TOOL_NAME } from '../toolNames'
export { PROPOSE_GOAL_TOOL_NAME }
import { PROPOSE_GOAL_PROMPT } from './proposeGoalPrompt'
import { armGoal, MAX_GOAL_CONDITION_CHARS } from '../../goal/goalState'

/** 输入面。 */
export const PROPOSE_GOAL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      description: `A single testable end-state condition (maximum ${MAX_GOAL_CONDITION_CHARS} characters). Describes a verifiable outcome, not a process.`,
    },
    ask_user: {
      type: 'boolean',
      description:
        'Whether to ask the user to approve the goal (default true). Set to false ONLY when the user explicitly requested this outcome.',
    },
  },
  required: ['condition'],
  additionalProperties: false,
}

/** 输入 duck。 */
export type ProposeGoalInput = {
  condition: string
  ask_user?: boolean
}

/** 输出面。 */
export type ProposeGoalOutput = {
  armed: boolean
  condition: string
  reason?: string
}

type ProposeGoalToolFace = Tool & {
  mapToolResultToToolResultBlockParam(
    data: ProposeGoalOutput,
    toolUseID: string,
  ): ToolResultBlockParam
}

export const ProposeGoalTool: ProposeGoalToolFace = {
  name: PROPOSE_GOAL_TOOL_NAME,
  inputSchema: PROPOSE_GOAL_INPUT_SCHEMA,
  inputJSONSchema: PROPOSE_GOAL_INPUT_SCHEMA,
  searchHint: 'propose a verifiable goal condition to pursue across multiple turns',
  maxResultSizeChars: 2_000,
  isEnabled: () => true,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => false,
  userFacingName: () => 'ProposeGoal',
  toAutoClassifierInput: () => '',

  async checkPermissions(input: unknown) {
    const { condition, ask_user = true } = input as ProposeGoalInput
    if (ask_user) {
      // ask_user=true（默认）→ 审批弹窗（AskUserQuestion 族既有模式）
      return {
        behavior: 'ask' as const,
        message: `Approve goal: "${condition}"?`,
        updatedInput: input,
      }
    }
    // ask_user=false → 直接执行（allow）；工具描述提示词承载
    // 「仅用户原话明确要求」硬约束（0.1.55 提示词断言先例）
    return {
      behavior: 'allow' as const,
      updatedInput: input,
    }
  },

  async description(): Promise<string> {
    return PROPOSE_GOAL_PROMPT
  },

  mapToolResultToToolResultBlockParam(
    data: ProposeGoalOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: jsonStringify(data),
    }
  },

  async call(
    args: unknown,
    _context: unknown,
  ): Promise<ToolResult<ProposeGoalOutput>> {
    const { condition } = (args as ProposeGoalInput) ?? { condition: '' }
    // armGoal：one-goal-at-a-time（新设替换旧）+ ≤500 fail-closed + 空条件拒绝
    const result = armGoal(condition)
    if (result.ok === true) {
      return {
        data: {
          armed: true,
          condition: condition.trim(),
        },
      }
    }
    // strict:false 判别联合 → === false 显式窄化（project 约定）
    return {
      data: {
        armed: false,
        condition: condition ?? '',
        reason: (result as { ok: false; reason: string }).reason,
      },
    }
  },

  renderToolUseMessage(): unknown {
    return null
  },
}
