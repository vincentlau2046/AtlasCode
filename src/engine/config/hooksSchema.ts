/**
 * engine/config — hooks 字段族数据契约（§8.27 E-3 S-3c：HookCommand 四类判别
 * 联合 + HooksSchema）
 *
 * 四类变体（旧仓 ground truth 可验真面 = hooksSettings.ts isHookEqual 比较面）：
 *   - command { command, shell?, timeoutMs?, if? }（shell 缺省 'bash'，身份字段）
 *   - prompt  { prompt, if? }
 *   - agent   { prompt, if? }
 *   - http    { url, if? }
 * `if` 条件字段为四类共享身份字段（同 command 不同 if = 不同钩子，旧仓
 * isHookEqual 注释语义）。旧仓第五类 function/callback = 进程内回调、不可
 * JSON 表达 → 不入配置面（§8.27 四类裁定；旧仓 HookCommand/HooksSettings
 * 均 = any，无权威类型面）。
 *
 * 单一事实源：HOOK_EVENTS/HookEvent 经 hooks 域（hookEvents.ts，27 事件）
 * import，不复制（§8.27 裁定）。
 *
 * 语义裁定：SettingsSchema 维持 hooks 字段 z.any() 透传（S-3a）——旧仓无
 * hooks 校验面，逐字一致；z.lazy(HooksSchema) 收紧归 E-5 严格编辑面
 * （残留守，本切片无行为变更）。
 *
 * 残留守登记（防「以为已全」）：
 *   - 变体 per-field 全字段面（http headers/method/timeoutMs、agent model 等）
 *     → E-5 hooks-runner（旧仓 HookCommand = any 无可验真权威面，本切片仅落
 *     isHookEqual 比较面字段）。
 *   - HooksSchema record key ∈ HOOK_EVENTS 27 事件名集校验 → E-5（旧仓无
 *     事件名校验面；record key 运行时经 z.string() 承载不做名集检查）。
 */
import { z } from 'zod'
// L3 域边界：hooks 域类型经域根门面 import（不深入域内文件，eslint boundaries/entry-point）
import type { HookEvent } from '../../hooks'

/** command 变体（shell 缺省 'bash'；timeoutMs 旧仓比较面字段）。 */
export type CommandHookCommand = {
  type: 'command'
  command: string
  shell?: string
  timeoutMs?: number
  if?: string
  [key: string]: unknown
}

/** prompt 变体（LLM 提示型钩子；执行面归 E-5）。 */
export type PromptHookCommand = {
  type: 'prompt'
  prompt: string
  if?: string
  [key: string]: unknown
}

/** agent 变体（子代理型钩子；执行面归 E-5）。 */
export type AgentHookCommand = {
  type: 'agent'
  prompt: string
  if?: string
  [key: string]: unknown
}

/** http 变体（HTTP 型钩子；执行面归 E-5）。 */
export type HttpHookCommand = {
  type: 'http'
  url: string
  if?: string
  [key: string]: unknown
}

/** 配置面钩子命令四类判别联合（settings.hooks[event][n].hooks[] 条目）。 */
export type ConfigHookCommand =
  | CommandHookCommand
  | PromptHookCommand
  | AgentHookCommand
  | HttpHookCommand

/** 配置面钩子匹配器（settings.hooks[event][n]）。 */
export type ConfigHookMatcher = {
  matcher?: string
  hooks: ConfigHookCommand[]
  source?: string
  [key: string]: unknown
}

/** hooks 设置数据契约（事件名 → matcher 列表；Partial = 未配置事件缺省）。 */
export type HooksSettings = Partial<Record<HookEvent, ConfigHookMatcher[]>>

const CommandHookSchema = z
  .object({
    type: z.literal('command'),
    command: z.string(),
    shell: z.string().optional(),
    timeoutMs: z.number().optional(),
    if: z.string().optional(),
  })
  .passthrough()

const PromptHookSchema = z
  .object({
    type: z.literal('prompt'),
    prompt: z.string(),
    if: z.string().optional(),
  })
  .passthrough()

const AgentHookSchema = z
  .object({
    type: z.literal('agent'),
    prompt: z.string(),
    if: z.string().optional(),
  })
  .passthrough()

const HttpHookSchema = z
  .object({
    type: z.literal('http'),
    url: z.string(),
    if: z.string().optional(),
  })
  .passthrough()

/** 四类判别联合（type 字面量判别；各变体 .passthrough() 未知字段透传）。 */
export const HookCommandSchema = z.discriminatedUnion('type', [
  CommandHookSchema,
  PromptHookSchema,
  AgentHookSchema,
  HttpHookSchema,
])

/** matcher schema（matcher 串 + 钩子列表 + 来源标记；未知字段透传）。 */
export const HookMatcherSchema = z
  .object({
    matcher: z.string().optional(),
    hooks: z.array(HookCommandSchema),
    source: z.string().optional(),
  })
  .passthrough()

/**
 * hooks 字段族 record 面：事件名（string key）→ matcher 列表。
 * record key 不做 27 事件名集校验（残留守，见头注）；输出类型 =
 * Record<string, ConfigHookMatcher[]>，数据契约类型用 HooksSettings。
 */
export const HooksSchema = z.record(
  z.string(),
  z.array(HookMatcherSchema),
)
