/**
 * engine/tools/schedule — CronDeleteTool 本体（§8.56 S-D4，任务工具本体
 * 子波 4，cron 三件套 ②；49 口径 12/49；注册表 ② AGENT_TRIGGERS 槽
 * materialize，isEnabled = isCronEnabled 自门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/ScheduleCronTool/CronDeleteTool.ts 95L
 * 逐字随迁（input 1 字段 / output { id } / validateInput 2 支（not-found +
 * teammate 归属）/ call = removeCronTasks / mapResult 单行）。
 *
 * delta 登记（函数体逐字；复审勿当遗漏重提，同族 delta ①-⑤/⑧-⑩ 见
 * cronCreateTool 头注，本文件仅列差异项）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约（input 纯 JSON schema /
 *    DeleteOutput TS 型 / description() = 旧 prompt() 体
 *    buildCronDeletePrompt(isDurableCronEnabled()) / 旧短
 *    CRON_DELETE_DESCRIPTION 留 schedulePrompt.ts 导出不接线，TUI 波
 *    前向接缝）。
 *  ② TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe false /
 *    isReadOnly false / isDestructive false（def 无覆写取默认）/
 *    maxResultSizeChars 100_000（def 体）/ shouldDefer true / searchHint
 *    'cancel a scheduled cron job' / userFacingName 'CronDelete'（def
 *    无 member → 旧 buildTool name-wins 插入 userFacingName: () =>
 *    def.name 生效位 = 工具名，非 TOOL_DEFAULTS 缺省 ''；S-D6 审视 A
 *    订正）/ toAutoClassifierInput = input.id（def 体）。
 *  ③ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }）显式固化（def 无 member，S-D3 delta ⑤ 同族先例）。
 *  ④ 旧 getPath()（getCronFilePath）→ 裁（新契约无 getPath 面，权限波
 *    前向接缝，同 cronCreateTool delta ⑥）。
 *  ⑤ 旧 call 5 参声明 → 0 参声明（旧体不消费 context 族参数，裁，
 *    零行为）。
 *  ⑥ 旧 import 重指：utils/cronTasks → ../../scheduler（cronTasks.ts
 *    面）/ utils/teammateContext → ../../messaging（S-D2 已落）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { listAllCronTasks, removeCronTasks } from '../../scheduler'
import { getTeammateContext } from '../../messaging'
import { CRON_DELETE_TOOL_NAME } from '../toolNames'
import {
  buildCronDeletePrompt,
  isCronEnabled,
  isDurableCronEnabled,
} from './schedulePrompt'
import type { CronDeleteToolInput } from './scheduleToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 1 字段逐字段转写，delta ①）。 */
export const CRON_DELETE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Job ID returned by CronCreate.',
    },
  },
  required: ['id'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type CronDeleteOutput = {
  id: string
}

export const CronDeleteTool: Tool = {
  name: CRON_DELETE_TOOL_NAME,
  inputSchema: CRON_DELETE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: CRON_DELETE_TOOL_INPUT_SCHEMA,
  searchHint: 'cancel a scheduled cron job',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isCronEnabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ②，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as CronDeleteToolInput).id,
  userFacingName: () => 'CronDelete', // S-D6 审视 A 订正：旧 buildTool name-wins 生效位
  // delta ③：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ①：新契约唯一 prompt 面 = 旧 prompt() 体
  description: async () => buildCronDeletePrompt(isDurableCronEnabled()),
  // 2 支校验：not-found / teammate 归属互斥（队友仅可删自己的 cron）
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { id } = input as CronDeleteToolInput
    const tasks = await listAllCronTasks()
    const task = tasks.find(t => t.id === id)
    if (!task) {
      return {
        result: false,
        message: `No scheduled job with id '${id}'`,
        errorCode: 1,
      }
    }
    // Teammates may only delete their own crons.
    const ctx = getTeammateContext()
    if (ctx && task.agentId !== ctx.agentId) {
      return {
        result: false,
        message: `Cannot delete cron job '${id}': owned by another agent`,
        errorCode: 2,
      }
    }
    return { result: true }
  },
  // delta ⑤：0 参声明
  async call(args: unknown): Promise<ToolResult<CronDeleteOutput>> {
    const { id } = args as CronDeleteToolInput
    await removeCronTasks([id])
    return { data: { id } }
  },
  // delta ②：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { id } = content as CronDeleteOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Cancelled job ${id}.`,
    }
  },
}
