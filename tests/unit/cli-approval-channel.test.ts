// -p 审批通道单测（0.1.129 呈批书 §1 C1-f，批复 @af5684e9 + C1-g 补注册）：
// ① digest 白名单 + 200 截断；② 决策三值映射（approved/denied/expired）；
// ③ wire 事件形断言；④ malformed/非 JSON 行 warn + 继续等待；⑤ 未知
// approval_id warn + 丢弃；⑥ EOF → ApprovalStreamClosedError（fail-closed）；
// ⑦ 跨请求持久缓冲（多行单块）。
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ApprovalStreamClosedError,
  DIGEST_VALUE_MAX_CHARS,
  StreamJsonApprovalChannel,
  buildInputDigest,
} from '../../src/cli/approvalChannel'
import { buildHeadlessOptions } from '../../src/cli/parse'

/** 可编程 stdin 替身：push 行 / end 触发 EOF。 */
class QueueInput implements AsyncIterable<string> {
  private queue: string[] = []
  private wake: (() => void) | null = null
  private ended = false

  push(line: string): void {
    // wire 分帧 = '\n' 终止（runner 侧写 JSON + '\n'）——替身自动补帧符。
    this.queue.push(line.endsWith('\n') ? line : line + '\n')
    this.wake?.()
  }

  end(): void {
    this.ended = true
    this.wake?.()
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        for (;;) {
          if (this.queue.length > 0) {
            return { done: false, value: this.queue.shift()! }
          }
          if (this.ended) return { done: true, value: undefined }
          await new Promise<void>(resolve => (this.wake = resolve))
          this.wake = null
        }
      },
    }
  }
}

function makeChannel(input: QueueInput, warns: string[] = []) {
  const written: Array<Record<string, unknown>> = []
  const channel = new StreamJsonApprovalChannel({
    write: async message => {
      written.push(message)
    },
    input,
    warn: line => warns.push(line),
  })
  return { channel, written }
}

describe('buildInputDigest 白名单摘要（C1-c）', () => {
  test('仅白名单键入摘要；非字符串/空值忽略', () => {
    const digest = buildInputDigest({
      file_path: '/tmp/a.ts',
      command: 'echo hi',
      description: 'desc',
      url: 'https://x',
      pattern: '*.ts',
      content: 'SECRET-BODY-NOT-IN-DIGEST', // 非白名单 → 剔除
      nested: { a: 1 }, // 非字符串 → 剔除
      empty: '', // 空串 → 剔除
    })
    expect(digest).toEqual({
      file_path: '/tmp/a.ts',
      command: 'echo hi',
      description: 'desc',
      url: 'https://x',
      pattern: '*.ts',
    })
  })

  test('值截断 200 字符（DIGEST_VALUE_MAX_CHARS）', () => {
    const long = 'x'.repeat(300)
    const digest = buildInputDigest({ command: long })
    expect(digest.command).toHaveLength(DIGEST_VALUE_MAX_CHARS)
    expect(digest.command).toBe('x'.repeat(200))
  })

  test('undefined 输入 → 空摘要', () => {
    expect(buildInputDigest(undefined)).toEqual({})
  })
})

describe('StreamJsonApprovalChannel 决策流（C1-b/C1-d/C1-e）', () => {
  test('approved：事件形断言 + 决策返回', async () => {
    const input = new QueueInput()
    const { channel, written } = makeChannel(input)
    const pending = channel.requestApproval({
      toolName: 'Write',
      input: { file_path: '/tmp/a.ts' },
      sessionId: 'sess-1',
    })
    // 等事件写出
    await Bun.sleep(5)
    expect(written).toHaveLength(1)
    const event = written[0]!
    expect(event.type).toBe('approval_request')
    expect(event.tool_name).toBe('Write')
    expect(event.session_id).toBe('sess-1')
    expect(event.input_digest).toEqual({ file_path: '/tmp/a.ts' })
    expect(typeof event.approval_id).toBe('string')
    // 回决策行
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: event.approval_id, decision: 'approved' }),
    )
    expect(await pending).toBe('approved')
  })

  test('denied 决策行 → deny', async () => {
    const input = new QueueInput()
    const { channel, written } = makeChannel(input)
    const pending = channel.requestApproval({ toolName: 'Bash', input: undefined, sessionId: 's' })
    await Bun.sleep(5)
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'denied' }),
    )
    expect(await pending).toBe('denied')
  })

  test('expired 决策行 → expired（调用方映射 deny reason=expired）', async () => {
    const input = new QueueInput()
    const { channel, written } = makeChannel(input)
    const pending = channel.requestApproval({ toolName: 'Bash', input: undefined, sessionId: 's' })
    await Bun.sleep(5)
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'expired' }),
    )
    expect(await pending).toBe('expired')
  })

  test('malformed 非 JSON 行 → warn + 继续等待（不悬挂不误判）', async () => {
    const input = new QueueInput()
    const warns: string[] = []
    const { channel, written } = makeChannel(input, warns)
    const pending = channel.requestApproval({ toolName: 'Write', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    input.push('not json at all')
    await Bun.sleep(5)
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'approved' }),
    )
    expect(await pending).toBe('approved')
    expect(warns.some(l => l.includes('non-JSON'))).toBe(true)
  })

  test('未知 approval_id 决策行 → warn + 丢弃，继续等待', async () => {
    const input = new QueueInput()
    const warns: string[] = []
    const { channel, written } = makeChannel(input, warns)
    const pending = channel.requestApproval({ toolName: 'Write', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    input.push(JSON.stringify({ type: 'approval_response', approval_id: 'other-uuid', decision: 'approved' }))
    await Bun.sleep(5)
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'denied' }),
    )
    expect(await pending).toBe('denied')
    expect(warns.some(l => l.includes('unknown approval_id'))).toBe(true)
  })

  test('非 approval_response 类型行 → warn + 丢弃', async () => {
    const input = new QueueInput()
    const warns: string[] = []
    const { channel, written } = makeChannel(input, warns)
    const pending = channel.requestApproval({ toolName: 'Write', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    input.push(JSON.stringify({ type: 'other_event', data: 1 }))
    await Bun.sleep(5)
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'approved' }),
    )
    expect(await pending).toBe('approved')
    expect(warns.some(l => l.includes('non-approval_response'))).toBe(true)
  })

  test('EOF（stdin 闭/未接）→ ApprovalStreamClosedError（fail-closed）', async () => {
    const input = new QueueInput()
    const { channel } = makeChannel(input)
    const pending = channel.requestApproval({ toolName: 'Write', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    input.end()
    await expect(pending).rejects.toBeInstanceOf(ApprovalStreamClosedError)
  })

  test('跨请求持久缓冲：多行单块到达按序消费', async () => {
    const input = new QueueInput()
    const { channel, written } = makeChannel(input)
    const first = channel.requestApproval({ toolName: 'A', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    // 单块推入两行：第一行匹配本请求，第二行缓冲给下一请求
    input.push(
      JSON.stringify({ type: 'approval_response', approval_id: written[0]!.approval_id, decision: 'approved' }) +
        '\n' +
        JSON.stringify({ type: 'approval_response', approval_id: 'will-not-match', decision: 'denied' }),
    )
    expect(await first).toBe('approved')
    const second = channel.requestApproval({ toolName: 'B', input: {}, sessionId: 's' })
    await Bun.sleep(5)
    // 第二请求收到的是缓冲中 stale 行（unknown id → 丢弃）后 EOF → closed
    input.end()
    await expect(second).rejects.toBeInstanceOf(ApprovalStreamClosedError)
  })
})

// ── C1-f 补腿件（0.1.129 呈批书 §11 注记 1，f4 裁定；tests-only 零制品影响）──
describe('C1-f 补腿：flag 缺席回归 + 决策→verdict 映射契约', () => {
  test('① flag 缺席 → HeadlessOptions.approvalChannel = undefined（通道不构造 ⇒ 零 approval_request 写出面）', () => {
    // opt-in 门：buildHeadlessOptions 不补默认值，flag 缺席即 undefined
    expect(buildHeadlessOptions({}).approvalChannel).toBeUndefined()
    // 显式 opt-in 透传
    expect(buildHeadlessOptions({ approvalChannel: 'stream-json' }).approvalChannel).toBe(
      'stream-json',
    )
    // 通道创建 gate 形契约钉：print.ts 仅在 flag === 'stream-json' 时构造
    // StreamJsonApprovalChannel（否则 undefined——非 stream-json 值同样不构造）
    const printSrc = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'cli', 'print.ts'),
      'utf8',
    )
    expect(printSrc).toContain("options.approvalChannel === 'stream-json'")
  })

  test('③ 决策→verdict 映射契约（print.ts checkPermission 审批分支）：approved→allow / denied→deny / expired→deny(reason=expired) / closed→deny(fail-closed)', () => {
    // 映射 inline 于 print.ts checkPermission（~1301-1330）——tests-only
    // 约束下采契约钉形（锁文本先例）：四支 reason 字面 + fail-closed 分支
    // 逐字在场。行为面由 channel 层三决策值腿（上 describe）+ pw 审批腿
    //（AtlasWeb e2e 20 approve / 21 deny）端到端覆盖采认（⑤ 免单测）。
    const printSrc = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'cli', 'print.ts'),
      'utf8',
    )
    // approved → allow
    expect(printSrc).toContain("if (decision === 'approved')")
    expect(printSrc).toContain('{ allowed: true }')
    // denied / expired → deny + reason 区分（expired 独立 reason）
    expect(printSrc).toContain("'approval expired'")
    expect(printSrc).toContain("'approval denied'")
    expect(printSrc).toContain("decision === 'expired'")
    // closed（EOF）→ ApprovalStreamClosedError → deny reason（fail-closed 零悬挂）
    expect(printSrc).toContain('error instanceof ApprovalStreamClosedError')
    expect(printSrc).toContain("'approval stream closed before decision'")
    // C1-g 优先序：审批通道分支先于 SDK prompt 路由（hasPromptRoute）
    const approvalIdx = printSrc.indexOf('if (verdict.ask && approvalChannel)')
    const promptIdx = printSrc.indexOf('if (verdict.ask && hasPromptRoute)')
    expect(approvalIdx).toBeGreaterThan(-1)
    expect(promptIdx).toBeGreaterThan(approvalIdx)
  })
})
