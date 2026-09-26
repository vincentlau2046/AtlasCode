/**
 * engine/tools/schedule — CronCreateTool 本体（§8.56 S-D4，任务工具本体
 * 子波 4，cron 三件套 ①；49 口径 11/49；注册表 ② AGENT_TRIGGERS 槽
 * materialize，isEnabled = isCronEnabled 自门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/ScheduleCronTool/CronCreateTool.ts 157L
 * 逐字随迁（input 4 字段 / output { id, humanSchedule, recurring,
 * durable? } / validateInput 4 支 / call = addCronTask + mapResult 双行）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema/outputSchema) → 新 shared Tool 契约：
 *    inputSchema = 纯 JSON schema 对象（S-B5 先例）；旧 zod outputSchema
 *    （z.infer 推断 CreateOutput）→ TS 型承载文档面（引擎侧无 wire
 *    outputSchema 消费者，D 波前向接缝）。
 *  ② 旧 recurring/durable 的 semanticBoolean 强转（"true"/"false" 字符串
 *    → bool）→ 不进 JSON schema（宽骨架面，S-C4 delta ② 先例；模型直出
 *    boolean，call 解构缺省 recurring=true / durable=false 逐字保留）。
 *  ③ 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（S-C5 delta ③ 先例）；旧短 description() 体
 *    buildCronCreateDescription 留 schedulePrompt.ts 导出不接线（TUI 波
 *    前向接缝，同 S-D3 DESCRIPTION 族）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    false / isReadOnly false / isDestructive false（def 无覆写取默认）/
 *    maxResultSizeChars 100_000（def 体）/ shouldDefer true / searchHint
 *    'schedule a recurring or one-shot prompt' / userFacingName ''（TOOL_
 *    DEFAULTS 缺省值，def 无 member）/ toAutoClassifierInput =
 *    `${cron}: ${prompt}`（def 体）。
 *  ⑤ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（def 无 member；S-D3
 *    delta ⑤ 同族先例，本工具无路径面）。
 *  ⑥ 旧 getPath()（getCronFilePath）→ 裁（新契约无 getPath 面，权限层
 *    经 checkPermissions 消费，路径面 = 权限波前向接缝）。
 *  ⑦ 旧 call 内 `setScheduledTasksEnabled(true)` → 裁：旧仓 bootstrap
 *    该面即 any-stub no-op（旧 state.ts:253，S-D1 §8.56.2 裁定随迁被
 *    S-7b cronEnv 头注「stub 面整砍」覆盖）；新仓 scheduler =
 *    createCronScheduler 组合根实例，无全局 enable 旗标（tick 循环接线
 *    归组合根/CLI 波，前向接缝）。零行为变化（旧调用即 no-op）。
 *  ⑧ 旧 durable:false session-only 路径 → 新仓 scheduler 域仅落
 *    durable file-backed 路径（E-7 S-7b 裁定，cronTasks 头注登记）：
 *    addCronTask 对 durable:false 抛前向接缝错误（CLI/teammate 波落
 *    session-cron store 后恢复）。call 逐字透传 effectiveDurable 不造
 *    session store（H6 不造假）——缺省 durable 缺省值 false 的调用
 *    将浮现该接缝错误（域行为锁定，func 面 probe）。
 *  ⑨ 旧 call 5 参声明 → 0 参声明（旧体不消费 context/canUseTool/
 *    parentMessage/onProgress，裁，零行为；S-B5 delta ⑩ 先例）。
 *  ⑩ 旧 import 重指：utils/cron → ../../scheduler（cron.ts 面）/
 *    utils/cronTasks → ../../scheduler（cronTasks.ts 面）/
 *    utils/teammateContext → ../../messaging（S-D2 已落）/ ./prompt →
 *    ./schedulePrompt（delta ④ 名引 toolNames）/ bootstrap
 *    setScheduledTasksEnabled 随 ⑦ 裁。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import {
  addCronTask,
  cronToHuman,
  listAllCronTasks,
  nextCronRunMs,
  parseCronExpression,
} from '../../scheduler'
import { getTeammateContext } from '../../messaging'
import { CRON_CREATE_TOOL_NAME } from '../toolNames'
import {
  buildCronCreatePrompt,
  DEFAULT_MAX_AGE_DAYS,
  isCronEnabled,
  isDurableCronEnabled,
} from './schedulePrompt'
import type { CronCreateToolInput } from './scheduleToolInput'

const MAX_JOBS = 50

/**
 * 输入 JSON schema（旧仓 zod inputSchema 4 字段逐字段转写，delta ①/②；
 * 与 CronCreateToolInput duck 型单一事实源逐字段对齐）。
 */
export const CRON_CREATE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    cron: {
      type: 'string',
      description:
        'Standard 5-field cron expression in local time: "M H DoM Mon DoW" (e.g. "*/5 * * * *" = every 5 minutes, "30 14 28 2 *" = Feb 28 at 2:30pm local once).',
    },
    prompt: {
      type: 'string',
      description: 'The prompt to enqueue at each fire time.',
    },
    recurring: {
      type: 'boolean',
      description: `true (default) = fire on every cron match until deleted or auto-expired after ${DEFAULT_MAX_AGE_DAYS} days. false = fire once at the next match, then auto-delete. Use false for "remind me at X" one-shot requests with pinned minute/hour/dom/month.`,
    },
    durable: {
      type: 'boolean',
      description:
        'true = persist to .atlas/scheduled_tasks.json and survive restarts. false (default) = in-memory only, dies when this Claude session ends. Use true only when the user asks the task to survive across sessions.',
    },
  },
  required: ['cron', 'prompt'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type CronCreateOutput = {
  id: string
  humanSchedule: string
  recurring: boolean
  durable?: boolean
}

export const CronCreateTool: Tool = {
  name: CRON_CREATE_TOOL_NAME,
  inputSchema: CRON_CREATE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: CRON_CREATE_TOOL_INPUT_SCHEMA,
  searchHint: 'schedule a recurring or one-shot prompt',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isCronEnabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { cron, prompt } = input as CronCreateToolInput
    return `${cron}: ${prompt}`
  },
  userFacingName: () => '',
  // delta ⑤：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ③：新契约唯一 prompt 面 = 旧 prompt() 体
  description: async () => buildCronCreatePrompt(isDurableCronEnabled()),
  // P-D3 探针锚点：4 支校验（非法 cron / 年内无匹配 / MAX_JOBS / durable
  // teammate 互斥），突变去任一支 → 恰 1 红
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { cron, durable } = input as CronCreateToolInput
    if (!parseCronExpression(cron)) {
      return {
        result: false,
        message: `Invalid cron expression '${cron}'. Expected 5 fields: M H DoM Mon DoW.`,
        errorCode: 1,
      }
    }
    if (nextCronRunMs(cron, Date.now()) === null) {
      return {
        result: false,
        message: `Cron expression '${cron}' does not match any calendar date in the next year.`,
        errorCode: 2,
      }
    }
    const tasks = await listAllCronTasks()
    if (tasks.length >= MAX_JOBS) {
      return {
        result: false,
        message: `Too many scheduled jobs (max ${MAX_JOBS}). Cancel one first.`,
        errorCode: 3,
      }
    }
    // Teammates don't persist across sessions, so a durable teammate cron
    // would orphan on restart (agentId would point to a nonexistent teammate).
    if (durable && getTeammateContext()) {
      return {
        result: false,
        message:
          'durable crons are not supported for teammates (teammates do not persist across sessions)',
        errorCode: 4,
      }
    }
    return { result: true }
  },
  // delta ⑦/⑧/⑨：setScheduledTasksEnabled 裁 + durable:false 接缝透传 +
  // 0 参声明
  async call(args: unknown): Promise<ToolResult<CronCreateOutput>> {
    const { cron, prompt, recurring = true, durable = false } =
      args as CronCreateToolInput
    // Kill switch forces session-only; schema stays stable so the model sees
    // no validation errors when the gate flips mid-session.
    const effectiveDurable = durable && isDurableCronEnabled()
    const id = await addCronTask(
      cron,
      prompt,
      recurring,
      effectiveDurable,
      getTeammateContext()?.agentId,
    )
    return {
      data: {
        id,
        humanSchedule: cronToHuman(cron),
        recurring,
        durable: effectiveDurable,
      },
    }
  },
  // delta ④：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const output = content as CronCreateOutput
    const where = output.durable
      ? 'Persisted to .atlas/scheduled_tasks.json'
      : 'Session-only (not written to disk, dies when Claude exits)'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.recurring
        ? `Scheduled recurring job ${output.id} (${output.humanSchedule}). ${where}. Auto-expires after ${DEFAULT_MAX_AGE_DAYS} days. Use CronDelete to cancel sooner.`
        : `Scheduled one-shot task ${output.id} (${output.humanSchedule}). ${where}. It will fire once then auto-delete.`,
    }
  },
}
