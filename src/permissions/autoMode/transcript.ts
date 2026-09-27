/**
 * autoMode 子域 — 分类器 transcript 构造（§8.65，旧仓 yoloClassifier.ts:241-392 逐字语义）。
 *
 * 旧仓来源：buildTranscriptEntries / buildToolLookup / toCompactBlock / toCompact /
 * buildTranscriptForClassifier / formatActionForClassifier。
 *
 * 类型映射 delta（复审勿当遗漏重提）：
 * ① 旧强类型 Message 联合（msg.message.content 强类型 content 块数组）→ 新 shared Message
 *    松接口（message?: unknown）→ 经窄视图 accessor（narrowMessage / narrowContentBlock）
 *    类型守卫适配，判别逻辑逐字不变（user 文本 / assistant tool_use / queued_command
 *    attachment 三支 + assistant 文本排除，防模型自撰文本影响分类器）。
 * ② 旧 `jsonStringify`（slowOperations，slowLogging 包装）→ 子域本地 jsonStringify
 *    （= JSON.stringify，剥离 slowLogging 包装——新仓无 slow-op 日志消费点）。
 * ③ 旧 `isJsonlTranscriptEnabled()` 读 growthbook `atlas_auto_mode_config.jsonlTranscript`
 *    （前向接缝，config/growthbook 波）→ 新仓模块级标志（默认 false = 旧 text-prefix 缺省态），
 *    setJsonlTranscriptEnabled 供 config 波接线；两态（jsonl / text-prefix）均可单测。
 * ④ 工具 toAutoClassifierInput 投影：新 Tool 契约已含 toAutoClassifierInput（§8.61 无条件随迁），
 *    契约 '' = 「无安全相关性」（跳过该块），throw/undefined 回落原始 input（单次编码不双重）。
 */
import { logForDebugging } from '../../shared'
import type { Message, Tool, Tools } from '../../shared'
import type { TranscriptBlock, TranscriptEntry } from './types'

/** 本地 jsonStringify（delta ②）：安全 JSON.stringify，BigInt 降级 undefined。 */
export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? undefined : v,
  )
}

/** queued_command attachment 窄视图（delta ①）。 */
type QueuedCommandAttachment = {
  type: 'queued_command'
  prompt: string | Array<{ type?: string; text?: string }>
}

/** Message.message.content 窄视图（delta ①）：content 块数组的元素形状。 */
type NarrowContentBlock = {
  type?: string
  text?: string
  name?: string
  input?: unknown
}

function narrowMessage(
  msg: Message,
): {
  attachment?: QueuedCommandAttachment
  content?: unknown
} {
  const anyMsg = msg as {
    attachment?: QueuedCommandAttachment
    message?: { content?: unknown }
  }
  return {
    attachment: anyMsg.attachment,
    content: anyMsg.message?.content,
  }
}

/** JSONL transcript 态标志（delta ③）：true = {"Bash":"ls"} JSONL，false（缺省）= `Bash ls` text-prefix。 */
let jsonlTranscriptEnabled = false

export function setJsonlTranscriptEnabled(enabled: boolean): void {
  jsonlTranscriptEnabled = enabled
}

export function isJsonlTranscriptEnabled(): boolean {
  return jsonlTranscriptEnabled
}

/**
 * Build transcript entries from messages.
 * Includes user text messages and assistant tool_use blocks (excluding assistant text).
 * Queued user messages (attachment messages with queued_command type) are extracted
 * and emitted as user turns.
 */
export function buildTranscriptEntries(messages: Message[]): TranscriptEntry[] {
  const transcript: TranscriptEntry[] = []
  for (const msg of messages) {
    const narrow = narrowMessage(msg)
    if (msg.type === 'attachment' && narrow.attachment?.type === 'queued_command') {
      const prompt = narrow.attachment.prompt
      let text: string | null = null
      if (typeof prompt === 'string') {
        text = prompt
      } else if (Array.isArray(prompt)) {
        text =
          prompt
            .filter(
              (block): block is { type: string; text: string } =>
                block.type === 'text' && typeof block.text === 'string',
            )
            .map(block => block.text)
            .join('\n') || null
      }
      if (text !== null) {
        transcript.push({
          role: 'user',
          content: [{ type: 'text', text }],
        })
      }
    } else if (msg.type === 'user') {
      const content = narrow.content
      const textBlocks: TranscriptBlock[] = []
      if (typeof content === 'string') {
        textBlocks.push({ type: 'text', text: content })
      } else if (Array.isArray(content)) {
        for (const raw of content as NarrowContentBlock[]) {
          if (raw.type === 'text' && typeof raw.text === 'string') {
            textBlocks.push({ type: 'text', text: raw.text })
          }
        }
      }
      if (textBlocks.length > 0) {
        transcript.push({ role: 'user', content: textBlocks })
      }
    } else if (msg.type === 'assistant') {
      const content = narrow.content
      const blocks: TranscriptBlock[] = []
      if (Array.isArray(content)) {
        // Only include tool_use blocks — assistant text is model-authored
        // and could be crafted to influence the classifier's decision.
        for (const raw of content as NarrowContentBlock[]) {
          if (raw.type === 'tool_use') {
            blocks.push({
              type: 'tool_use',
              name: raw.name ?? '',
              input: raw.input,
            })
          }
        }
      }
      if (blocks.length > 0) {
        transcript.push({ role: 'assistant', content: blocks })
      }
    }
  }
  return transcript
}

type ToolLookup = ReadonlyMap<string, Tool>

function buildToolLookup(tools: Tools): ToolLookup {
  const map = new Map<string, Tool>()
  for (const tool of tools) {
    map.set(tool.name, tool)
    for (const alias of tool.aliases ?? []) {
      map.set(alias, tool)
    }
  }
  return map
}

/**
 * Serialize a single transcript block as a JSONL dict line: `{"Bash":"ls"}`
 * for tool calls, `{"user":"text"}` for user text. The tool value is the
 * per-tool `toAutoClassifierInput` projection. JSON escaping means hostile
 * content can't break out of its string context to forge a `{"user":...}`
 * line — newlines become `\n` inside the value.
 *
 * Returns '' for tool_use blocks whose tool encodes to ''.
 */
function toCompactBlock(
  block: TranscriptBlock,
  role: TranscriptEntry['role'],
  lookup: ToolLookup,
): string {
  if (block.type === 'tool_use') {
    const tool = lookup.get(block.name)
    if (!tool) return ''
    const input = (block.input ?? {}) as Record<string, unknown>
    // block.input is unvalidated model output from history — a tool_use rejected
    // for bad params (e.g. array emitted as JSON string) still lands in the
    // transcript and would crash toAutoClassifierInput when it assumes z.infer<Input>.
    // On throw or undefined, fall back to the raw input object — it gets
    // single-encoded in the jsonStringify wrap below (no double-encode).
    let encoded: unknown
    try {
      encoded = tool.toAutoClassifierInput(input) ?? input
    } catch (e) {
      logForDebugging(
        `toAutoClassifierInput failed for ${block.name}: ${String(e)}`,
      )
      encoded = input
    }
    if (encoded === '') return ''
    if (isJsonlTranscriptEnabled()) {
      return jsonStringify({ [block.name]: encoded }) + '\n'
    }
    const s = typeof encoded === 'string' ? encoded : jsonStringify(encoded)
    return `${block.name} ${s}\n`
  }
  if (block.type === 'text' && role === 'user') {
    return isJsonlTranscriptEnabled()
      ? jsonStringify({ user: block.text }) + '\n'
      : `User: ${block.text}\n`
  }
  return ''
}

function toCompact(entry: TranscriptEntry, lookup: ToolLookup): string {
  return entry.content.map(b => toCompactBlock(b, entry.role, lookup)).join('')
}

/**
 * Build a compact transcript string including user messages and assistant tool_use blocks.
 * Used by AgentTool for handoff classification.
 */
export function buildTranscriptForClassifier(
  messages: Message[],
  tools: Tools,
): string {
  const lookup = buildToolLookup(tools)
  return buildTranscriptEntries(messages)
    .map(e => toCompact(e, lookup))
    .join('')
}

/**
 * Format an action for the classifier from tool name and input.
 * Returns a TranscriptEntry with the tool_use block. Each tool controls which
 * fields get exposed via its `toAutoClassifierInput` implementation.
 */
export function formatActionForClassifier(
  toolName: string,
  toolInput: unknown,
): TranscriptEntry {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', name: toolName, input: toolInput }],
  }
}
