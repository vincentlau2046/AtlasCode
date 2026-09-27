/**
 * engine/tools/team S-E2（§8.62）unit 层（零盘零模型）：SendMessage 工具
 * 对象面 + schema 面 + 门控面 + validate 6 检查面 + call 错误面 + 接缝早退
 * 面 + mapToolResult / renderToolUseMessage / prompt / classifier /
 * checkPermissions 面。
 *
 * call 成功面为何 func 层（tests/func/engine-tools-send-message-se2-fs.
 * test.ts，真盘）：writeToMailbox = 裸 fs + proper-lockfile（写
 * $ATLAS_CONFIG_DIR/teams/<team>/inboxes/<agent>.json，FsOperations 不可
 * 覆写）→ 4 handler 的 mailbox 写成功面全落 func（plan/web func 先例）。
 *
 * env 面：门控 ATLAS_EXPERIMENTAL_AGENT_TEAMS（用例内存取还原）；身份面
 * = 无 ALS / dynamic（getAgentName/getTeamName 无参全 undefined，senderName
 * 回落 TEAM_LEAD_NAME）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  SEND_MESSAGE_DESCRIPTION,
  SEND_MESSAGE_PROMPT,
  SEND_MESSAGE_TOOL_INPUT_SCHEMA,
  SendMessageTool,
  resetTeamFileLoader,
  setTeamFileLoader,
  type SendMessageToolOutput,
  type TeamFile,
} from '../../src/engine/tools'

function ctx(teamName?: string, mode = 'default'): unknown {
  return {
    getAppState: () => ({
      teamContext: teamName ? { teamName, leadAgentId: 'lead-1' } : undefined,
      toolPermissionContext: { mode },
    }),
  }
}

afterEach(() => {
  resetTeamFileLoader()
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
})

// ── P-S1 对象面 ────────────────────────────────────────────────────────

describe('P-S1 对象面（静态成员 + face 收窄）', () => {
  test('name/schema 别名/门控静态成员逐字', () => {
    expect(SendMessageTool.name).toBe('SendMessage')
    expect(SendMessageTool.inputSchema).toBe(SEND_MESSAGE_TOOL_INPUT_SCHEMA)
    expect(SendMessageTool.inputJSONSchema).toBe(SEND_MESSAGE_TOOL_INPUT_SCHEMA)
    expect(SendMessageTool.strict).toBe(true)
    expect(SendMessageTool.shouldDefer).toBe(true)
    expect(SendMessageTool.maxResultSizeChars).toBe(100_000)
    expect(SendMessageTool.searchHint).toBe(
      'send messages to agent teammates (swarm protocol)',
    )
    expect(SendMessageTool.userFacingName({})).toBe('SendMessage')
    expect(SendMessageTool.isDestructive({})).toBe(false)
    expect(SendMessageTool.isConcurrencySafe({})).toBe(false)
  })
})

// ── P-S2 schema 面 ─────────────────────────────────────────────────────

describe('P-S2 schema 面（3 属性 + required + anyOf 4 臂 + gate-off 描述）', () => {
  test('shape 逐字（delta ① 纯 JSON 化 + delta ② gate-off to 描述）', () => {
    const s = SEND_MESSAGE_TOOL_INPUT_SCHEMA
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['to', 'message'])
    const props = s.properties as Record<string, Record<string, unknown>>
    expect(Object.keys(props).sort()).toEqual(['message', 'summary', 'to'])
    expect(props.to).toEqual({
      type: 'string',
      description:
        'Recipient: teammate name, or "*" for broadcast to all teammates',
    })
    expect(typeof props.summary.type).toBe('string')
    const arms = props.message.anyOf as Array<Record<string, unknown>>
    expect(arms).toHaveLength(4)
    expect(arms[0]).toEqual({ type: 'string' })
    expect(arms[1].required).toEqual(['type'])
    expect((arms[1].properties as Record<string, unknown>).type).toEqual({
      const: 'shutdown_request',
    })
    expect(arms[2].required).toEqual(['type', 'request_id', 'approve'])
    expect(arms[3].required).toEqual(['type', 'request_id', 'approve'])
    expect((arms[3].properties as Record<string, unknown>).type).toEqual({
      const: 'plan_approval_response',
    })
  })
})

// ── P-S3 门控面（49 口径 26/49 首个专属门控槽）────────────────────────

describe('P-S3 isEnabled 门控面（isAgentSwarmsEnabled）', () => {
  test('缺省关（无 env 无 --agent-teams flag）', () => {
    delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
    expect(SendMessageTool.isEnabled()).toBe(false)
  })

  test('ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 开', () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    expect(SendMessageTool.isEnabled()).toBe(true)
  })
})

// ── P-S4 isReadOnly 双态 ───────────────────────────────────────────────

describe('P-S4 isReadOnly（string = 只读面，delta ⑩ 逐字）', () => {
  test('string message true / structured false', () => {
    expect(
      SendMessageTool.isReadOnly({ to: 'w1', message: 'hi', summary: 's' }),
    ).toBe(true)
    expect(
      SendMessageTool.isReadOnly({
        to: 'team-lead',
        message: { type: 'shutdown_request' },
      }),
    ).toBe(false)
  })
})

// ── P-S5 validateInput 6 检查面（UDS 3 检查面裁，delta ②）────────────

describe('P-S5 validateInput 检查面', () => {
  test('to 空（whitespace-only）→ ec9', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: '   ', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'to must not be empty',
      errorCode: 9,
    })
  })

  test('to 含 @ → ec9 逐字文案', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'team@x', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message:
        'to must be a bare teammate name or "*" — there is only one team per session',
      errorCode: 9,
    })
  })

  test('string 缺 summary → ec9 逐字文案', async () => {
    expect(
      await SendMessageTool.validateInput({ to: 'w1', message: 'hi' }, ctx()),
    ).toEqual({
      result: false,
      message: 'summary is required when message is a string',
      errorCode: 9,
    })
  })

  test('string summary whitespace-only → ec9', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'w1', message: 'hi', summary: '   ' },
        ctx(),
      ),
    ).toEqual({
      result: false,
      message: 'summary is required when message is a string',
      errorCode: 9,
    })
  })

  test('string + summary 齐 → pass', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'w1', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).toEqual({ result: true })
  })

  test('* + structured → ec9 逐字文案', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: '*', message: { type: 'shutdown_request' } },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'structured messages cannot be broadcast (to: "*")',
      errorCode: 9,
    })
  })

  test('shutdown_response to 非 team-lead → ec9 逐字文案', async () => {
    expect(
      await SendMessageTool.validateInput(
        {
          to: 'w1',
          message: { type: 'shutdown_response', request_id: 'r', approve: true },
        },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'shutdown_response must be sent to "team-lead"',
      errorCode: 9,
    })
  })

  test('shutdown_response reject 缺 reason → ec9 逐字文案', async () => {
    expect(
      await SendMessageTool.validateInput(
        {
          to: 'team-lead',
          message: { type: 'shutdown_response', request_id: 'r', approve: false },
        },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'reason is required when rejecting a shutdown request',
      errorCode: 9,
    })
  })

  test('shutdown_response reject reason whitespace-only → ec9', async () => {
    expect(
      await SendMessageTool.validateInput(
        {
          to: 'team-lead',
          message: {
            type: 'shutdown_response',
            request_id: 'r',
            approve: false,
            reason: '   ',
          },
        },
        ctx('t1'),
      ),
    ).toEqual({
      result: false,
      message: 'reason is required when rejecting a shutdown request',
      errorCode: 9,
    })
  })

  test('shutdown_request structured → pass', async () => {
    expect(
      await SendMessageTool.validateInput(
        { to: 'w1', message: { type: 'shutdown_request', reason: 'done' } },
        ctx('t1'),
      ),
    ).toEqual({ result: true })
  })

  test('shutdown_response reject 带 reason → pass', async () => {
    expect(
      await SendMessageTool.validateInput(
        {
          to: 'team-lead',
          message: {
            type: 'shutdown_response',
            request_id: 'r',
            approve: false,
            reason: 'busy',
          },
        },
        ctx('t1'),
      ),
    ).toEqual({ result: true })
  })
})

// ── P-S6 call 分发 guard 面 ────────────────────────────────────────────

describe('P-S6 call structured 广播 guard（throw 逐字）', () => {
  test('* + structured → throw', async () => {
    await expect(
      SendMessageTool.call(
        { to: '*', message: { type: 'shutdown_request' } },
        ctx('t1'),
      ),
    ).rejects.toThrow('structured messages cannot be broadcast')
  })
})

// ── P-S7 call broadcast 错误面（mailbox 写前 throw，零盘可达）─────────

describe('P-S7 call broadcast 错误面', () => {
  test('无 team context → throw 逐字', async () => {
    await expect(
      SendMessageTool.call({ to: '*', message: 'hi', summary: 's' }, ctx()),
    ).rejects.toThrow(
      'Not in a team context. Create a team with Teammate spawnTeam first, or set ATLAS_TEAM_NAME.',
    )
  })

  test('默认接缝（team-file-missing）→ throw 逐字（delta ⑤）', async () => {
    await expect(
      SendMessageTool.call(
        { to: '*', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).rejects.toThrow('Team "t1" does not exist')
  })
})

// ── P-S8 TeamFileLoader 接缝面（早退支零盘可达）────────────────────────

describe('P-S8 TeamFileLoader 接缝面', () => {
  test('set 后成员全 self → 早退文案逐字（recipients 空）', async () => {
    const teamFile: TeamFile = { members: [{ name: 'team-lead' }] }
    setTeamFileLoader(async () => teamFile)
    const r = await SendMessageTool.call(
      { to: '*', message: 'solo', summary: 's' },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe(
      'No teammates to broadcast to (you are the only team member)',
    )
    expect((data as { recipients: string[] }).recipients).toEqual([])
  })

  test('reset 恢复默认 null 面（team-file-missing 错误面回归）', async () => {
    setTeamFileLoader(async () => ({
      members: [{ name: 'w1' }],
    }))
    resetTeamFileLoader()
    await expect(
      SendMessageTool.call(
        { to: '*', message: 'hi', summary: 's' },
        ctx('t1'),
      ),
    ).rejects.toThrow('Team "t1" does not exist')
  })
})

// ── P-S9 mapToolResult jsonStringify 面 ────────────────────────────────

describe('P-S9 mapToolResultToToolResultBlockParam', () => {
  test('jsonStringify 面 + tool_use_id 透传', () => {
    const data = { success: true, message: 'ok', request_id: 'r1' }
    const r = SendMessageTool.mapToolResultToToolResultBlockParam(
      data as SendMessageToolOutput,
      'tu_1',
    )
    expect(r).toEqual({
      tool_use_id: 'tu_1',
      type: 'tool_result',
      content: [{ type: 'text', text: JSON.stringify(data) }],
    })
  })
})

// ── P-S10 renderToolUseMessage 3 面（delta ⑦ 字符串面逐字）────────────

describe('P-S10 renderToolUseMessage', () => {
  test('string message → null', () => {
    expect(
      SendMessageTool.renderToolUseMessage({ to: 'w1', message: 'hi' }),
    ).toBeNull()
  })

  test('plan_approval_response approve → 逐字文案', () => {
    expect(
      SendMessageTool.renderToolUseMessage({
        to: 'w1',
        message: { type: 'plan_approval_response', request_id: 'r', approve: true },
      }),
    ).toBe('approve plan from: w1')
  })

  test('plan_approval_response reject → 逐字文案', () => {
    expect(
      SendMessageTool.renderToolUseMessage({
        to: 'w1',
        message: {
          type: 'plan_approval_response',
          request_id: 'r',
          approve: false,
        },
      }),
    ).toBe('reject plan from: w1')
  })

  test('其他 structured（shutdown_request）→ null', () => {
    expect(
      SendMessageTool.renderToolUseMessage({
        to: 'w1',
        message: { type: 'shutdown_request' },
      }),
    ).toBeNull()
  })
})

// ── P-S11 prompt 面（delta ⑧ gate-off 锚点）───────────────────────────

describe('P-S11 prompt 面', () => {
  test('description() = PROMPT（gate-off 模板锚点）', async () => {
    const p = await SendMessageTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })
    expect(p).toBe(SEND_MESSAGE_PROMPT)
    expect(p).toContain('## Protocol responses (legacy)')
    expect(p).toContain('Broadcast to all teammates — expensive')
    // UDS gate-off 裁面锚点（delta ②/⑧：remote 波恢复前不得复活）
    expect(p).not.toContain('uds:')
    expect(p).not.toContain('ListPeers')
    expect(p).not.toContain('Cross-session')
  })

  test('DESCRIPTION 短面逐字', () => {
    expect(SEND_MESSAGE_DESCRIPTION).toBe('Send a message to another agent')
  })
})

// ── P-S12 toAutoClassifierInput 4 模板 ─────────────────────────────────

describe('P-S12 toAutoClassifierInput', () => {
  test('string + shutdown_request 2 模板逐字', () => {
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: 'w1',
        message: 'hello',
        summary: 's',
      }),
    ).toBe('to w1: hello')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: 'w1',
        message: { type: 'shutdown_request' },
      }),
    ).toBe('shutdown_request to w1')
  })

  test('shutdown_response 双态 + plan_approval 模板逐字', () => {
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: 'team-lead',
        message: { type: 'shutdown_response', request_id: 'r1', approve: true },
      }),
    ).toBe('shutdown_response approve r1')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: 'team-lead',
        message: { type: 'shutdown_response', request_id: 'r1', approve: false },
      }),
    ).toBe('shutdown_response reject r1')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: 'w1',
        message: {
          type: 'plan_approval_response',
          request_id: 'p1',
          approve: true,
        },
      }),
    ).toBe('plan_approval approve to w1')
  })
})

// ── P-S13 checkPermissions 面（delta ② UDS ask 支裁后纯 allow 单支）──

describe('P-S13 checkPermissions', () => {
  test('allow + updatedInput 透传', async () => {
    const input = { to: 'w1', message: 'hi', summary: 's' }
    const d = await SendMessageTool.checkPermissions(input, ctx())
    expect(d).toEqual({ behavior: 'allow', updatedInput: input })
  })
})
