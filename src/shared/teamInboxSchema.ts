/**
 * team inbox schema 单源（0.1.100 W-D-B-1 S4，lock-face §4 D-④）。
 *
 * 载体 = 文件面基座（`~/.atlas/teams/<t>/inboxes/<a>.json`，mailbox 内存
 * store 定位 = 缓存/队列层，非第二事实源）。本模块 = inbox 文件信封
 * （消息数组 + schemaVersion + 满载上界常量）+ 读写原子原语（tmp+rename
 * 同 §2 / teamFileSchema.writeTeamFileV2Atomic 先形）单点。
 *
 * 双车道同源约束（§9 格 8）：engine `messaging/mailbox.ts` 与 tui
 * `utils/teammateMailbox.ts`（tmux 车道）双双改消费本模块——禁第三副本。
 *
 * 信封演进（§9 格 5 域）：本波起写面为 envelope
 * `{ schemaVersion: 1, messages: [...] }`；读面兼容 pre-envelope 裸数组
 * （升级路径 in-flight team 不可 brick——读面刻意识别旧形并按信封语义
 * 回填，属显式 legacy 识别，非半解析；异 schemaVersion / 非法记录 →
 * fail-visible 拒读禁半解析）。
 *
 * 七条(d)：消息记录 `source` 字段白名单（'lead' | 'teammate'，缺省 =
 * legacy 无来源）+ 消费前置校验助手 isInboxSourceAllowed（方向性白名单：
 * 指令形协议消息只认 lead 来源、汇报形只认 teammate 来源；legacy 缺省
 * 放行 = 不伪造判别面）。
 *
 * 七条(e)：MAX_INBOX_MESSAGES 满载拒收上界（写入面拒收 + fail-visible
 * 告警，禁静默丢最旧——工单 §6 必改 2(e)）。
 */

import { z } from 'zod'

export const INBOX_SCHEMA_VERSION = 1

/** 满载拒收上界（七条(e)：拒收 fail-visible，禁静默丢最旧）。 */
export const MAX_INBOX_MESSAGES = 200

/** 消息来源白名单（七条(d)：信封消息 source 字段仅此二值）。 */
export type InboxMessageSource = 'lead' | 'teammate'

/**
 * inbox 消息记录（两车道 TeammateMessage 的共享形）。未知字段在 schema
 * 层剥除（七条(a)：落盘文件 = 不可信输入，白名单校验）。
 */
export type SharedInboxMessage = {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string
  summary?: string
  /** 来源白名单标注（七条(d)）；legacy 记录无此字段。 */
  source?: InboxMessageSource
}

/** 记录 schema（白名单 + 未知字段剥除；zod strip 缺省行为）。 */
export const inboxMessageSchema = z.object({
  from: z.string(),
  text: z.string(),
  timestamp: z.string(),
  read: z.boolean(),
  color: z.string().optional(),
  summary: z.string().optional(),
  source: z.enum(['lead', 'teammate']).optional(),
})

/** inbox 文件信封（schemaVersion + 消息数组）。 */
export const inboxEnvelopeSchema = z.object({
  schemaVersion: z.literal(INBOX_SCHEMA_VERSION),
  messages: z.array(inboxMessageSchema),
})

export type InboxEnvelope = z.infer<typeof inboxEnvelopeSchema>

/** 读原语结果（fail-visible 面：error 文案可判读，禁静默半解析）。 */
export type ReadInboxResult =
  | { ok: true; messages: SharedInboxMessage[] }
  | { ok: false; error: string }

/**
 * 读 inbox 文件（fail-visible 拒读形）：
 * - ENOENT → 空信箱（现网行为逐字）；
 * - envelope 且 schemaVersion === 1 → 白名单校验回填；
 * - envelope 且异 schemaVersion → 拒读（禁半解析，§9 格 5 域）；
 * - pre-envelope 裸数组 → 显式 legacy 识别（逐记录白名单校验剥未知字段；
 *   任一记录非法 → 整体拒读，禁半解析）；
 * - 其余（非 JSON / 非数组非信封 / 记录非法）→ 拒读 + 可判读 error。
 */
export async function readInboxFile(
  filePath: string,
): Promise<ReadInboxResult> {
  const { readFile } = await import('fs/promises')
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ENOENT') {
      return { ok: true, messages: [] }
    }
    return { ok: false, error: `inbox read failed: ${String(e)}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return {
      ok: false,
      error: `inbox file is not valid JSON — refusing half-parse: ${filePath}`,
    }
  }

  // envelope 形（本波写面形态）
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'schemaVersion' in parsed
  ) {
    const version = (parsed as { schemaVersion: unknown }).schemaVersion
    if (version !== INBOX_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `inbox file schemaVersion ${String(version)} != ${INBOX_SCHEMA_VERSION} — refusing to read (schema evolution): ${filePath}`,
      }
    }
    const result = inboxEnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      return {
        ok: false,
        error: `inbox envelope failed schema validation — refusing half-parse: ${filePath} (${result.error.message})`,
      }
    }
    return { ok: true, messages: result.data.messages }
  }

  // pre-envelope 裸数组（legacy 显式识别：逐记录白名单校验）
  if (Array.isArray(parsed)) {
    const result = z.array(inboxMessageSchema).safeParse(parsed)
    if (!result.success) {
      return {
        ok: false,
        error: `legacy inbox records failed schema validation — refusing half-parse: ${filePath} (${result.error.message})`,
      }
    }
    return { ok: true, messages: result.data }
  }

  return {
    ok: false,
    error: `inbox file is neither envelope nor legacy message array — refusing half-parse: ${filePath}`,
  }
}

/**
 * 写 inbox 文件（原子原语 tmp+rename：写中 kill reader 见旧全量态零
 * partial；ack 持久化 F7 回归防 = mark-read 走本原语，写中 kill 不撕
 * ack 态）。目录由调用方保证（两车道 ensureInboxDir 先行）。
 */
export async function writeInboxFileAtomic(
  filePath: string,
  messages: SharedInboxMessage[],
): Promise<void> {
  const { rename, writeFile } = await import('fs/promises')
  const envelope: InboxEnvelope = {
    schemaVersion: INBOX_SCHEMA_VERSION,
    messages,
  }
  const tmpPath = `${filePath}.tmp-${process.pid}`
  await writeFile(tmpPath, JSON.stringify(envelope, null, 2), 'utf-8')
  await rename(tmpPath, filePath)
}

/**
 * 消费前置校验（七条(d)）：方向性来源白名单。legacy 记录（source 缺省）
 * 放行 = 不伪造判别面；显式白名单外来源 → 拒收该协议消息（fail-visible，
 * 由调用方日志呈面）。用于 permission/shutdown 类协议消息消费点。
 */
export function isInboxSourceAllowed(
  message: Pick<SharedInboxMessage, 'source'>,
  allowed: ReadonlyArray<InboxMessageSource>,
): boolean {
  if (message.source === undefined) return true // legacy 无来源 → 不伪造判别
  return allowed.includes(message.source)
}

/** 满载拒收 fail-visible 文案（含当前长度/上界，§4）。 */
export function inboxFullWarning(
  recipient: string,
  length: number,
): string {
  return (
    `Inbox for "${recipient}" is full (${length}/${MAX_INBOX_MESSAGES} ` +
    `messages) — message REJECTED, not delivered (oldest messages are ` +
    `never dropped silently). Ask the recipient to consume/mark-read ` +
    `messages or run TeamDelete-style cleanup.`
  )
}
