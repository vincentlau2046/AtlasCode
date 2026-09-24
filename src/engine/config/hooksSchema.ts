/**
 * engine/config — hooks 字段族数据契约（§8.27 E-3 S-3c 四类判别联合 +
 * §8.41 E-5 S-5c 严格编辑面：4 变体全字段面 + 事件名集校验 + SettingsSchema
 * 收紧）
 *
 * 四类变体（全字段面 ground truth = 旧仓 src/schemas/hooks.ts 校验 leaf，
 * 2026-09-24 S-5c 补全；S-3c 初版 = isHookEqual 比较面子集）：
 *   - command { command, shell?∈[bash|powershell], timeoutMs?, statusMessage?,
 *               once?, async?, asyncRewake?, if? }
 *   - prompt  { prompt, timeoutMs?, model?, statusMessage?, once?, if? }
 *   - agent   { prompt, timeoutMs?, model?, statusMessage?, once?, if? }
 *   - http    { url, timeoutMs?, headers?, allowedEnvVars?, statusMessage?,
 *               once?, if? }
 * `if` 条件字段为四类共享身份字段（同 command 不同 if = 不同钩子，旧仓
 * isHookEqual 注释语义）。旧仓第五类 function/callback = 进程内回调、不可
 * JSON 表达 → 不入配置面（§8.27 四类裁定）。
 *
 * 命名裁定（§8.41 R3）：timeoutMs 保留新仓命名（S-3c = 旧仓 isHookEqual
 * 比较面字段；旧仓 config leaf 的 timeout（秒）不取——运行时域 HookCommand
 * = timeoutMs 单一事实源，config→runtime 零转换接缝）。shell 枚举内联
 * （同 types.ts defaultShell 先例；E-6 全 shell 面若落 SHELL_TYPES 常量再收拢）。
 *
 * 单一事实源：HOOK_EVENTS/HookEvent 经 hooks 域（hookEvents.ts，27 事件）
 * import，不复制（§8.27 裁定；S-5c 起 = 值 import，事件名集校验用）。
 *
 * 语义裁定（§8.41）：
 *   - R4 passthrough 保留（偏离旧仓 leaf strict）：变体/matcher .passthrough()
 *     未知字段透传不丢（新仓前向兼容，同 SettingsSchema 顶层；未来非 command
 *     执行面消费这些字段）。既有测试已锁 extra 字段存活。
 *   - R5 旧仓 .describe() 文档串不迁（新仓风格 = schema 旁注释语义）。
 *
 * 残留守登记（防「以为已全」）：
 *   - 非 command 变体执行面（prompt/agent/http LLM/HTTP 执行支，旧仓
 *     hooks.ts L1743-1817 分路执行）→ 未来 hooks-runner 全量波（新仓 C-Deep
 *     薄骨架 command-only，provider 过滤非 command 变体已落；R6 重登记，
 *     不挂 E-7 leaves）。
 *   - 坏条目预过滤（仿 filterInvalidPermissionRules 保文件，R7 B 案 UX
 *     纵切）——本切片严格路 = 整文件拒绝 + 错误显式呈现。
 */
import { z } from 'zod'
// L3 域边界：hooks 域经域根门面 import（值 = HOOK_EVENTS 事件名集校验，
// 型 = HookEvent/HookConfigProvider，不深入域内文件，eslint boundaries/entry-point）
import { HOOK_EVENTS, type HookEvent } from '../../hooks'

/** shell 枚举（旧仓 SHELL_TYPES 内联；defaultShell 同族面）。 */
const HOOK_SHELL_TYPES = ['bash', 'powershell'] as const

/** command 变体（shell 缺省 'bash'；timeoutMs 新仓命名单一事实源，§8.41 R3）。 */
export type CommandHookCommand = {
  type: 'command'
  command: string
  shell?: (typeof HOOK_SHELL_TYPES)[number]
  timeoutMs?: number
  statusMessage?: string
  once?: boolean
  async?: boolean
  asyncRewake?: boolean
  if?: string
  [key: string]: unknown
}

/** prompt 变体（LLM 提示型钩子；执行面 = 未来 hooks-runner 全量波，R6）。 */
export type PromptHookCommand = {
  type: 'prompt'
  prompt: string
  timeoutMs?: number
  model?: string
  statusMessage?: string
  once?: boolean
  if?: string
  [key: string]: unknown
}

/** agent 变体（子代理型钩子；执行面 = 未来 hooks-runner 全量波，R6）。 */
export type AgentHookCommand = {
  type: 'agent'
  prompt: string
  timeoutMs?: number
  model?: string
  statusMessage?: string
  once?: boolean
  if?: string
  [key: string]: unknown
}

/** http 变体（HTTP 型钩子；执行面 = 未来 hooks-runner 全量波，R6）。 */
export type HttpHookCommand = {
  type: 'http'
  url: string
  timeoutMs?: number
  headers?: Record<string, string>
  allowedEnvVars?: string[]
  statusMessage?: string
  once?: boolean
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

// 全字段面（§8.41 R3，旧仓 schemas/hooks.ts 字段面 + 新仓 timeoutMs 命名）；
// .passthrough() = R4 前向兼容裁定（未知字段透传不丢，偏离旧仓 strict）。
const CommandHookSchema = z
  .object({
    type: z.literal('command'),
    command: z.string(),
    shell: z.enum(HOOK_SHELL_TYPES).optional(),
    timeoutMs: z.number().positive().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional(),
    async: z.boolean().optional(),
    asyncRewake: z.boolean().optional(),
    if: z.string().optional(),
  })
  .passthrough()

const PromptHookSchema = z
  .object({
    type: z.literal('prompt'),
    prompt: z.string(),
    timeoutMs: z.number().positive().optional(),
    model: z.string().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional(),
    if: z.string().optional(),
  })
  .passthrough()

const AgentHookSchema = z
  .object({
    type: z.literal('agent'),
    prompt: z.string(),
    timeoutMs: z.number().positive().optional(),
    model: z.string().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional(),
    if: z.string().optional(),
  })
  .passthrough()

const HttpHookSchema = z
  .object({
    type: z.literal('http'),
    url: z.url(),
    timeoutMs: z.number().positive().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    allowedEnvVars: z.array(z.string()).optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional(),
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
 * hooks 字段族 record 面（§8.41 R1 事件名集校验，旧仓 leaf 逐字）：
 * record key ∈ HOOK_EVENTS 27 事件名集（z.partialRecord + z.enum；partial =
 * 未配置事件缺省），未知事件名 → parse 期拒（error 路径含键）。输出类型 =
 * Partial<Record<HookEvent, ConfigHookMatcher[]>>，数据契约类型用 HooksSettings。
 */
export const HooksSchema = z.partialRecord(
  z.enum(HOOK_EVENTS),
  z.array(HookMatcherSchema),
)
