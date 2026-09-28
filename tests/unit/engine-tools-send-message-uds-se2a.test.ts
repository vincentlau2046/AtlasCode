/**
 * engine/tools/team S-E2a（§8.68 R1 UDS 5 站点族复活）unit 层（零盘零模型）：
 * SendMessage 工具 5 站点族门双向判别——gate OFF = 旧 gate-off 落盘面逐字
 * 不变量（checkPermissions 纯 allow / validate 无 UDS 分支 / call 无 UDS
 * 支 / schema to 描述 gate-off 支 / prompt = PROMPT 锚点）；gate ON =
 * 5 站点判别（checkPermissions bridge ask safetyCheck 支 / validate 4 块
 * 〔address target 空 = 非门控恒运行 + bridge structured 拒绝优先 + 连接
 * 检查 / uds string 早放行 / structured cross-session 拒绝〕/ call 2 支
 * stub 面〔bridge = postInterClaudeMessage {} → success false 'unknown'
 * 面 / uds = sendToUdsSocket no-op → success true preview 面〕/ prompt
 * 门双态 U-P5〔PROMPT gate-off 锚点 vs getSendMessagePrompt 门 face〕）。
 *
 * 门 = ATLAS_EXPERIMENTAL_UDS_INBOX env opt-in（isUdsInboxEnabled，每次
 * 访问重读 env-live）；用例内存取还原。stub 面经 remote 门面（postInter
 * ClaudeMessage 恒 {} / isReplBridgeActive 恒 true / handle 指针 set 面
 * 可达判别）。ATLAS_CONFIG_DIR=/mock-home 防御戳（gate-off 落盘支回归
 * 时 EISDIR/ENOENT 而非静默写真实目录，se2 先例）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  SEND_MESSAGE_TOOL_INPUT_SCHEMA,
  SendMessageTool,
  type SendMessageInput,
} from '../../src/engine/tools'
import {
  PROMPT as SEND_MESSAGE_PROMPT,
  getSendMessagePrompt,
} from '../../src/engine/tools/team'
import {
  getReplBridgeHandle,
  setReplBridgeHandle,
} from '../../src/remote'

function ctx(teamName?: string, mode = 'default'): unknown {
  return {
    getAppState: () => ({
      teamContext: teamName ? { teamName, leadAgentId: 'lead-1' } : undefined,
      toolPermissionContext: { mode },
    }),
  }
}

let saved: string | undefined

beforeEach(() => {
  saved = process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
  delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
  process.env.ATLAS_CONFIG_DIR = '/mock-home'
  setReplBridgeHandle(null)
})

afterEach(() => {
  if (saved === undefined) {
    delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
  } else {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = saved
  }
  delete process.env.ATLAS_CONFIG_DIR
  setReplBridgeHandle(null)
})

// ── U-P1 schema to 描述门 face（getter env-live）──────────────────────

describe('U-P1 schema to 描述门 face', () => {
  const props = () =>
    (SEND_MESSAGE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { description: string }
    >).to

  test('gate-off = 旧非 UDS 支逐字', () => {
    expect(props().description).toBe(
      'Recipient: teammate name, or "*" for broadcast to all teammates',
    )
  })

  test('gate-on = 旧 UDS 支逐字（getter 每次访问重读 env-live）', () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(props().description).toBe(
      'Recipient: teammate name, "*" for broadcast, "uds:<socket-path>" for a local peer, or "bridge:<session-id>" for a Remote Control peer (use ListPeers to discover)',
    )
    // 序列化面（JSON.stringify invoke getter）
    expect(JSON.stringify(SEND_MESSAGE_TOOL_INPUT_SCHEMA)).toContain(
      'uds:<socket-path>',
    )
  })
})

// ── U-P2 checkPermissions bridge ask 支 ────────────────────────────────

describe('U-P2 checkPermissions', () => {
  test('gate-off：bridge 目标纯 allow 单支（旧 gate-off 保真）', async () => {
    const input = { to: 'bridge:session_1', message: 'hi', summary: 's' }
    const d = await SendMessageTool.checkPermissions(input, ctx())
    expect(d).toEqual({ behavior: 'allow', updatedInput: input })
  })

  test('gate-on：bridge 目标 → ask + safetyCheck decisionReason 逐字', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const input = { to: 'bridge:session_1', message: 'hi', summary: 's' }
    const d = await SendMessageTool.checkPermissions(input, ctx())
    expect(d).toEqual({
      behavior: 'ask',
      message:
        'Send a message to Remote Control session bridge:session_1? It arrives as a user prompt on the receiving Claude (possibly another machine) via AtlasHarness servers.',
      decisionReason: {
        type: 'safetyCheck',
        reason: 'Cross-machine bridge message requires explicit user consent',
        classifierApprovable: false,
      },
    })
  })

  test('gate-on：非 bridge 目标回落 allow + updatedInput', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const input = { to: 'w1', message: 'hi', summary: 's' }
    const d = await SendMessageTool.checkPermissions(input, ctx())
    expect(d).toEqual({ behavior: 'allow', updatedInput: input })
  })
})

// ── U-P3 validate 4 块 ────────────────────────────────────────────────

describe('U-P3 validate UDS 4 块', () => {
  test('address target 空 = 非门控恒运行（gate-off 旧 L617 保真）', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'bridge:', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'address target must not be empty',
      errorCode: 9,
    })
    expect(
      await SendMessageTool.validateInput(
        { to: 'uds:', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'address target must not be empty',
      errorCode: 9,
    })
  })

  test('gate-off：bridge 目标走普通 string 支（summary 必填，无 UDS 分支）', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'bridge:session_1', message: 'hi' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'summary is required when message is a string',
      errorCode: 9,
    })
  })

  test('gate-on：bridge structured → 永久约束优先拒绝（文案逐字）', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(
      await SendMessageTool.validateInput(
        { to: 'bridge:session_1', message: { type: 'shutdown_request' } },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'structured messages cannot be sent cross-session — only plain text',
      errorCode: 9,
    })
  })

  test('gate-on：bridge string + handle 缺省 null → not connected 文案逐字', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(getReplBridgeHandle()).toBeNull()
    expect(
      await SendMessageTool.validateInput(
        { to: 'bridge:session_1', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message:
        'Remote Control is not connected — cannot send to a bridge: target. Reconnect with /remote-control first.',
      errorCode: 9,
    })
  })

  test('gate-on：bridge string + handle 在位 → pass', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    setReplBridgeHandle({ bridgeSessionId: 'session_1' })
    expect(
      await SendMessageTool.validateInput(
        { to: 'bridge:session_1', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({ result: true })
  })

  test('gate-on：uds string 缺 summary 早放行（summary 不渲染面）', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(
      await SendMessageTool.validateInput(
        { to: 'uds:/tmp/x.sock', message: 'hi' },
        ctx('t1'),
      ),
    ).toEqual({ result: true })
  })

  test('gate-off：uds string 缺 summary 走普通支（summary 必填）', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'uds:/tmp/x.sock', message: 'hi' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'summary is required when message is a string',
      errorCode: 9,
    })
  })

  test('gate-on：uds structured → cross-session 拒绝（fall-through 支）', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(
      await SendMessageTool.validateInput(
        { to: 'uds:/tmp/x.sock', message: { type: 'shutdown_request' } },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'structured messages cannot be sent cross-session — only plain text',
      errorCode: 9,
    })
  })
})

// ── U-P4 call 2 支 stub 面 ─────────────────────────────────────────────

describe('U-P4 call UDS 2 支', () => {
  test('gate-off：uds 目标无 UDS 支（落 mailbox 写支，防御戳下 throw）', async () => {
    // 防御戳升级：ATLAS_CONFIG_DIR 指进程可执行文件（恒存在常规文件）→
    // ensureInboxDir mkdir 必 ENOTDIR（root/非 root 场景均 throw，零真实写）
    process.env.ATLAS_CONFIG_DIR = process.execPath
    await expect(
      SendMessageTool.call(
        { to: 'uds:/tmp/x.sock', message: 'hi', summary: 's' } as SendMessageInput,
        ctx('t1'),
      ),
    ).rejects.toThrow()
  })

  test('gate-on：bridge + handle 缺省 → disconnected 文案逐字', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const r = await SendMessageTool.call(
      { to: 'bridge:session_1', message: 'hello', summary: 's' } as SendMessageInput,
      ctx('t1'),
    )
    expect(r.data).toEqual({
      success: false,
      message:
        'Remote Control disconnected before send — cannot deliver to bridge:session_1',
    })
  })

  test('gate-on：bridge + handle 在位 = postInterClaudeMessage stub {} → success false + unknown 面逐字', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    setReplBridgeHandle({ bridgeSessionId: 'session_1' })
    const r = await SendMessageTool.call(
      { to: 'bridge:session_1', message: 'hello', summary: 's' } as SendMessageInput,
      ctx('t1'),
    )
    // 旧 any stub {} → result.ok undefined → success ?? false 归一；
    // result.error ?? 'unknown' 文案逐字
    expect(r.data).toEqual({
      success: false,
      message: 'Failed to send to bridge:session_1: unknown',
    })
  })

  test('gate-on：uds = sendToUdsSocket no-op → success true + 弯引号 preview 面逐字', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const r = await SendMessageTool.call(
      { to: 'uds:/tmp/x.sock', message: 'hello', summary: 's' } as SendMessageInput,
      ctx('t1'),
    )
    // preview = input.summary（'s'）；“ ” = U+201C/201D 逐字
    expect(r.data).toEqual({
      success: true,
      message: '“s” → uds:/tmp/x.sock',
    })
  })

  test('gate-on：uds 长消息缺 summary → truncatePreview 本地面（49 字符 + … 尾标）', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const long = 'x'.repeat(60)
    const r = await SendMessageTool.call(
      { to: 'uds:/tmp/x.sock', message: long } as SendMessageInput,
      ctx('t1'),
    )
    expect(r.data).toEqual({
      success: true,
      message: `“${'x'.repeat(49)}…” → uds:/tmp/x.sock`,
    })
  })
})

// ── U-P5 prompt 门双态（getSendMessagePrompt；remote 测试文件 R-P5 移入，
// 提交切分保 bisect 面：prompt 面属 team 模块）────────────────────────

describe('U-P5 getSendMessagePrompt 门双态', () => {
  test('gate-off = PROMPT 逐字锚点（单一事实源模板空臂）', () => {
    expect(getSendMessagePrompt()).toBe(SEND_MESSAGE_PROMPT)
    expect(getSendMessagePrompt()).not.toContain('uds:')
    // tool description() 面同锚点（门 face 每次访问重读）
    expect(SendMessageTool.description()).resolves.toBe(SEND_MESSAGE_PROMPT)
  })

  test('gate-on = 全模板（uds/bridge 2 行 + Cross-session 段旧仓位置逐字）', async () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    const p = getSendMessagePrompt()
    expect(p).toContain(
      '| `"uds:/path/to.sock"` | Local Claude session\'s socket (same machine; use `ListPeers`) |',
    )
    expect(p).toContain(
      '| `"bridge:session_..."` | Remote Control peer session (cross-machine; use `ListPeers`) |',
    )
    expect(p).toContain('## Cross-session')
    expect(p).toContain('"to": "uds:/tmp/cc-socks/1234.sock"')
    // 门-on 面插在 "*" 行尾、Protocol responses 段前（旧仓位置保真）
    expect(p.indexOf('| `*`')).toBeLessThan(p.indexOf('uds:/path/to.sock'))
    expect(p.indexOf('uds:/path/to.sock')).toBeLessThan(
      p.indexOf('## Protocol responses (legacy)'),
    )
    // tool description() 门 face env-live 同判别
    expect(await SendMessageTool.description()).toBe(p)
  })

  test('env-live：同一进程内翻转（无重 import）', () => {
    expect(getSendMessagePrompt()).toBe(SEND_MESSAGE_PROMPT)
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(getSendMessagePrompt()).not.toBe(SEND_MESSAGE_PROMPT)
  })
})
