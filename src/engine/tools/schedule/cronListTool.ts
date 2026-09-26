/**
 * engine/tools/schedule — CronListTool 本体（§8.56 S-D4，任务工具本体
 * 子波 4，cron 三件套 ③；49 口径 13/49；注册表 ② AGENT_TRIGGERS 槽
 * materialize，isEnabled = isCronEnabled 自门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/ScheduleCronTool/CronListTool.ts 97L
 * 逐字随迁（空 input / output { jobs } / call = listAllCronTasks +
 * teammate 过滤 + jobs 投影 / mapResult 行格式 + 空集行）。
 *
 * delta 登记（函数体逐字；复审勿当遗漏重提，同族 delta ①-⑤/⑧-⑩ 见
 * cronCreateTool 头注，本文件仅列差异项）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约：input 空对象（旧
 *    z.strictObject({}) → { type:'object' }，S-D3 TaskList 先例）/
 *    ListOutput TS 型 / description() = 旧 prompt() 体
 *    buildCronListPrompt(isDurableCronEnabled()) / 旧短
 *    CRON_LIST_DESCRIPTION 留 schedulePrompt.ts 导出不接线（TUI 波
 *    前向接缝）。
 *  ② TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe true /
 *    isReadOnly true（def 显式覆写，只读列表面）/ isDestructive false
 *    （默认）/ maxResultSizeChars 100_000（def 体）/ shouldDefer true /
 *    searchHint 'list active cron jobs' / userFacingName ''（TOOL_
 *    DEFAULTS 缺省值，def 无 member）/ toAutoClassifierInput ''
 *    （TOOL_DEFAULTS 缺省值逐值固化，def 无覆写；S-D3 TaskList 先例）。
 *  ③ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }）显式固化（def 无 member，S-D3 delta ⑤ 同族先例）。
 *  ④ 旧 mapResult 显示面 `truncate(j.prompt, 80, true)`（utils/truncate
 *    = ink/stringWidth 列宽感知 + grapheme 分段 + '…' 尾标）→ 域内本地
 *    字符数等价物（本文件 truncateToWidth/truncatePrompt，新仓无 ink
 *    依赖，TUI 波前向接缝；ASCII prompt 行为等价，CJK/emoji 宽度差
 *    ≤ 列宽 1 的显示接缝）。
 *  ⑤ 旧 call 5 参声明 → 0 参声明（旧体不消费 context 族参数，裁，
 *    零行为）。
 *  ⑥ 旧 import 重指：utils/cron（cronToHuman）+ utils/cronTasks
 *    （listAllCronTasks）→ ../../scheduler / utils/format（truncate）
 *    → 本文件本地实现（delta ④）/ utils/teammateContext →
 *    ../../messaging（S-D2 已落）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { cronToHuman, listAllCronTasks } from '../../scheduler'
import { getTeammateContext } from '../../messaging'
import { CRON_LIST_TOOL_NAME } from '../toolNames'
import {
  buildCronListPrompt,
  isCronEnabled,
  isDurableCronEnabled,
} from './schedulePrompt'

/**
 * 旧 utils/truncate.truncateToWidth 的字符数等价物（delta ④）：取头部
 * maxWidth-1 字符 + '…' 尾标（旧 = stringWidth 列宽感知 + grapheme
 * 分段，新仓无 ink 依赖 → 字符数近似，TUI 波前向接缝）。
 */
function truncateToWidth(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  if (maxWidth <= 1) return '…'
  return text.slice(0, maxWidth - 1) + '…'
}

/** 旧 utils/truncate.truncate(str, maxWidth, singleLine) 结构逐字（宽度面换字符数，delta ④）。 */
function truncatePrompt(
  str: string,
  maxWidth: number,
  singleLine: boolean,
): string {
  let result = str
  if (singleLine) {
    const firstNewline = str.indexOf('\n')
    if (firstNewline !== -1) {
      result = str.substring(0, firstNewline)
      if (result.length + 1 > maxWidth) {
        return truncateToWidth(result, maxWidth)
      }
      return `${result}…`
    }
  }
  if (result.length <= maxWidth) return result
  return truncateToWidth(result, maxWidth)
}

/** 输入 JSON schema（空对象，S-D3 TaskList 先例；delta ①）。 */
export const CRON_LIST_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type CronListOutput = {
  jobs: {
    id: string
    cron: string
    humanSchedule: string
    prompt: string
    recurring?: boolean
    durable?: boolean
  }[]
}

export const CronListTool: Tool = {
  name: CRON_LIST_TOOL_NAME,
  inputSchema: CRON_LIST_TOOL_INPUT_SCHEMA,
  inputJSONSchema: CRON_LIST_TOOL_INPUT_SCHEMA,
  searchHint: 'list active cron jobs',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isCronEnabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ②，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => '',
  // delta ③：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ①：新契约唯一 prompt 面 = 旧 prompt() 体
  description: async () => buildCronListPrompt(isDurableCronEnabled()),
  // delta ⑤：0 参声明
  async call(): Promise<ToolResult<CronListOutput>> {
    const allTasks = await listAllCronTasks()
    // Teammates only see their own crons; team lead (no ctx) sees all.
    const ctx = getTeammateContext()
    const tasks = ctx
      ? allTasks.filter(t => t.agentId === ctx.agentId)
      : allTasks
    const jobs = tasks.map(t => ({
      id: t.id,
      cron: t.cron,
      humanSchedule: cronToHuman(t.cron),
      prompt: t.prompt,
      ...(t.recurring ? { recurring: true } : {}),
      ...(t.durable === false ? { durable: false } : {}),
    }))
    return { data: { jobs } }
  },
  // delta ②：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const output = content as CronListOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        output.jobs.length > 0
          ? output.jobs
              .map(
                j =>
                  `${j.id} — ${j.humanSchedule}${j.recurring ? ' (recurring)' : ' (one-shot)'}${j.durable === false ? ' [session-only]' : ''}: ${truncatePrompt(j.prompt, 80, true)}`,
              )
              .join('\n')
          : 'No scheduled jobs.',
    }
  },
}
