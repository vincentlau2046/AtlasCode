/**
 * -p 审批通道（0.1.129 锁面呈批书 §1 C1，批复 @af5684e9 + C1-g 补注册
 * @adb4b497）：`--approval-channel=stream-json` opt-in flag 在场时，ask
 * 权限决断改走结构化 stdout 事件 + stdin 决策行（禁复用 SDK control_request
 * 面——structuredIO 控制协议不触）。
 *
 * wire 形（预注册 C1-c）：
 *   stdout: {"type":"approval_request","approval_id","tool_name",
 *            "input_digest":{...},"session_id"}
 *   stdin:  {"type":"approval_response","approval_id",
 *            "decision":"approved"|"denied"|"expired"}
 *
 * 纪律（预注册锚）：
 *   - pending-gated（C1-d）：stdin 读取仅在 approval_request 已发未决窗口内
 *     发生——无审批回合零 stdin 读取（r-20261122 防悬挂定谳兼容面）。
 *   - 超时唯一权威 = kernel（C1-e）：本通道零独立超时——终态完备性由
 *     runner↔kernel 契约保证（approved/denied/expired 行回写；voidedByCancel
 *     走 abort→kill，EOF 即 fail-closed deny）。
 *   - 七字段纪律：input_digest = 受控白名单摘要（C1-c），正文/令牌/待批内容
 *     禁入。
 *   - malformed / 未知 approval_id 决策行 → warn + 继续等待（fail-closed，
 *     不悬挂不误判——kernel 权威）。
 */
import { randomUUID } from 'node:crypto'

/** input_digest 受控白名单键（C1-c 预注册：file_path/command/description/url/pattern）。 */
const DIGEST_KEYS = [
  'file_path',
  'command',
  'description',
  'url',
  'pattern',
] as const

/** 摘要值截断上限（C1-c 预注册 200 字符）。 */
export const DIGEST_VALUE_MAX_CHARS = 200

/** 从工具输入提取白名单摘要（字符串值截断；非字符串键忽略）。 */
export function buildInputDigest(
  input: Record<string, unknown> | undefined,
): Record<string, string> {
  const digest: Record<string, string> = {}
  if (input === undefined || input === null) return digest
  for (const key of DIGEST_KEYS) {
    const value = input[key]
    if (typeof value !== 'string' || value.length === 0) continue
    digest[key] =
      value.length <= DIGEST_VALUE_MAX_CHARS
        ? value
        : value.slice(0, DIGEST_VALUE_MAX_CHARS)
  }
  return digest
}

/** 决策行 wire 决策值（C1-c 预注册三值；voidedByCancel 不走 wire——C1-e）。 */
export type StreamJsonApprovalDecision = 'approved' | 'denied' | 'expired'

/** stdin 决策流 EOF（管道闭/未接）：fail-closed 信号，调用方映射 deny。 */
export class ApprovalStreamClosedError extends Error {
  constructor() {
    super('approval stream closed before decision received')
    this.name = 'ApprovalStreamClosedError'
  }
}

interface StreamJsonApprovalChannelDeps {
  /** stdout 写入口（print.ts = structuredIO.write，单写者纪律随其出队泵）。 */
  write(message: Record<string, unknown>): Promise<void>
  /** 决策行源（print.ts = process.stdin；DI 注入便于单测）。 */
  input: AsyncIterable<string>
  /** warn 面（非致命异常行；缺省 stderr）。 */
  warn?(line: string): void
}

/**
 * stream-json 审批通道实例（每 -p 进程一个；顺序 await——-p 单回合串行，
 * 通道迭代器跨请求持久，pending-gated 语义 = 仅在 next() 挂起点消费 stdin）。
 */
export class StreamJsonApprovalChannel {
  private readonly lineIterator: AsyncIterator<string>
  private lineBuffer = ''

  constructor(private readonly deps: StreamJsonApprovalChannelDeps) {
    this.lineIterator = deps.input[Symbol.asyncIterator]()
  }

  /**
   * 发出 approval_request 并等待决策行。抛 ApprovalStreamClosedError =
   * stdin EOF（调用方映射 deny + reason）。
   */
  async requestApproval(req: {
    toolName: string
    input: Record<string, unknown> | undefined
    sessionId: string
  }): Promise<StreamJsonApprovalDecision> {
    const approvalId = randomUUID()
    await this.deps.write({
      type: 'approval_request',
      approval_id: approvalId,
      tool_name: req.toolName,
      input_digest: buildInputDigest(req.input),
      session_id: req.sessionId,
    })
    // pending-gated 消费窗：仅此处拉 stdin 行（C1-d）。
    for (;;) {
      const line = await this.nextLine()
      if (line === null) throw new ApprovalStreamClosedError()
      const trimmed = line.trim()
      if (trimmed === '') continue
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        this.warn(`[approval-channel] non-JSON decision line ignored`)
        continue
      }
      const rec = parsed as Record<string, unknown>
      if (rec.type !== 'approval_response') {
        this.warn(
          `[approval-channel] non-approval_response line ignored (type=${String(rec.type)})`,
        )
        continue
      }
      if (rec.approval_id !== approvalId) {
        this.warn(
          `[approval-channel] decision for unknown approval_id ignored`,
        )
        continue
      }
      if (
        rec.decision === 'approved' ||
        rec.decision === 'denied' ||
        rec.decision === 'expired'
      ) {
        return rec.decision
      }
      this.warn(
        `[approval-channel] malformed decision value ignored (${String(rec.decision)})`,
      )
    }
  }

  private warn(line: string): void {
    if (this.deps.warn !== undefined) {
      this.deps.warn(line)
      return
    }
    process.stderr.write(`${line}\n`)
  }

  /** 跨请求持久行缓冲读取（\n 分帧；EOF → null）。 */
  private async nextLine(): Promise<string | null> {
    for (;;) {
      const newline = this.lineBuffer.indexOf('\n')
      if (newline !== -1) {
        const line = this.lineBuffer.slice(0, newline)
        this.lineBuffer = this.lineBuffer.slice(newline + 1)
        return line
      }
      const next = await this.lineIterator.next()
      if (next.done === true) return null
      this.lineBuffer += next.value
    }
  }
}
