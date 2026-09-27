/**
 * engine/tools/team S-E2（§8.62）call 成功面 func 层（真盘：mkdtemp
 * ATLAS_CONFIG_DIR stamp + 真 writeToMailbox inbox 文件断言，零模型——
 * plan/web func 先例）。
 *
 * unit 层不可 mock 的原因（unit 头注同源）：writeToMailbox = 裸 fs +
 * proper-lockfile（写 $ATLAS_CONFIG_DIR/teams/<team>/inboxes/<agent>.json，
 * FsOperations 不可覆写）→ 4 handler 的 mailbox 写成功面全落本文件；
 * getAtlasConfigHomeDir（engine/config/configRoot）无 memo 直读 env
 * （§8.62.1：config-home no memo → ATLAS_CONFIG_DIR stamp 天然 fresh）。
 *
 *  - F-S1 string message 面（handleMessage：t1/inboxes/w1.json 1 条
 *    from/text/summary + read false 条目面 + data routing target @w1 +
 *    targetColor undefined（delta ⑥ findTeammateColor 裁面））。
 *  - F-S2 broadcast 成功面（setTeamFileLoader 真 TeamFile：self 排除 +
 *    2 收件人 mailbox 写 + recipients/message 面 + 自己 inbox 零文件）。
 *  - F-S3 shutdown_request 面（request_id 格式 shutdown-<ts>@<target> +
 *    text = createShutdownRequestMessage JSON 5 字段面）。
 *  - F-S4 shutdown_response 批准面（getTeamName() 无参无 dynamic →
 *    'default' team 面 + paneId/backendType 缺省（delta ④ in-process 支
 *    裁）+ 终文案逐字）。
 *  - F-S5 plan 批准面（isTeamLead = getAgentId() dynamic === leadAgentId
 *    + mode 继承 plan → default 面 + approved true JSON）。
 *  - F-S6 plan 拒绝面（feedback + approved false + 非 lead throw 文案逐字）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  SendMessageTool,
  resetTeamFileLoader,
  setTeamFileLoader,
  type SendMessageToolOutput,
  type TeamFile,
} from '../../src/engine/tools'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'

let dir = ''

function inboxPath(team: string, agent: string): string {
  return join(process.env.ATLAS_CONFIG_DIR!, 'teams', team, 'inboxes', `${agent}.json`)
}

function readInbox(team: string, agent: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(inboxPath(team, agent), 'utf8'))
}

function ctx(teamName?: string, mode = 'default'): unknown {
  return {
    getAppState: () => ({
      teamContext: teamName ? { teamName, leadAgentId: 'lead-1' } : undefined,
      toolPermissionContext: { mode },
    }),
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sendmsg-se2-'))
  process.env.ATLAS_CONFIG_DIR = dir
})

afterEach(() => {
  delete process.env.ATLAS_CONFIG_DIR
  clearDynamicTeamContext()
  resetTeamFileLoader()
  rmSync(dir, { recursive: true, force: true })
})

// ── F-S1 string message 面 ────────────────────────────────────────────

describe('F-S1 call string message 面（真盘 mailbox 写）', () => {
  test('w1 inbox 1 条消息面 + data routing 面（sender 回落 team-lead）', async () => {
    const r = await SendMessageTool.call(
      { to: 'w1', message: 'hello worker', summary: 'greet' },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe("Message sent to w1's inbox")

    const box = readInbox('t1', 'w1')
    expect(box).toHaveLength(1)
    // 无 ALS/dynamic 身份 → senderName 回落 TEAM_LEAD_NAME
    expect(box[0].from).toBe('team-lead')
    expect(box[0].text).toBe('hello worker')
    expect(box[0].summary).toBe('greet')
    expect(box[0].read).toBe(false)
    expect(typeof box[0].timestamp).toBe('string')

    const routing = (data as { routing?: Record<string, unknown> }).routing
    expect(routing).toMatchObject({
      sender: 'team-lead',
      target: '@w1',
      summary: 'greet',
      content: 'hello worker',
    })
    // delta ⑥：findTeammateColor 裁面 = 旧 teammates 缺面 undefined
    expect(routing!.targetColor).toBeUndefined()
  })
})

// ── F-S2 broadcast 成功面 ─────────────────────────────────────────────

describe('F-S2 call broadcast 成功面（真 TeamFile 接缝）', () => {
  test('self 排除 + 2 收件人 mailbox 写 + 自己 inbox 零文件', async () => {
    const teamFile: TeamFile = {
      members: [{ name: 'team-lead' }, { name: 'w1' }, { name: 'w2' }],
    }
    setTeamFileLoader(async () => teamFile)

    const r = await SendMessageTool.call(
      { to: '*', message: 'all hands', summary: 'broadcast' },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe('Message broadcast to 2 teammate(s): w1, w2')
    expect((data as { recipients: string[] }).recipients).toEqual(['w1', 'w2'])

    expect(readInbox('t1', 'w1')[0].text).toBe('all hands')
    expect(readInbox('t1', 'w2')[0].text).toBe('all hands')
    expect(existsSync(inboxPath('t1', 'team-lead'))).toBe(false)
  })
})

// ── F-S3 shutdown_request 面 ──────────────────────────────────────────

describe('F-S3 call shutdown_request 面', () => {
  test('request_id 格式 + createShutdownRequestMessage JSON 5 字段面', async () => {
    const r = await SendMessageTool.call(
      { to: 'w1', message: { type: 'shutdown_request', reason: 'done' } },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    const requestId = (data as { request_id: string }).request_id
    expect(data.success).toBe(true)
    expect(requestId).toMatch(/^shutdown-\d+@w1$/)
    expect(data.message).toBe(
      `Shutdown request sent to w1. Request ID: ${requestId}`,
    )

    const inner = JSON.parse(readInbox('t1', 'w1')[0].text as string)
    expect(inner).toMatchObject({
      type: 'shutdown_request',
      requestId,
      from: 'team-lead',
      reason: 'done',
    })
    expect(typeof inner.timestamp).toBe('string')
  })
})

// ── F-S4 shutdown_response 批准面 ─────────────────────────────────────

describe('F-S4 call shutdown_response 批准面', () => {
  test("team-lead mailbox 'default' team 面 + paneId/backendType 缺省", async () => {
    const r = await SendMessageTool.call(
      {
        to: 'team-lead',
        message: {
          type: 'shutdown_response',
          request_id: 'shutdown-1@w9',
          approve: true,
        },
      },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe(
      'Shutdown approved. Sent confirmation to team-lead. Agent teammate is now exiting.',
    )
    expect((data as { request_id?: string }).request_id).toBe('shutdown-1@w9')

    // getTeamName() 无参（无 ALS/dynamic）→ undefined → 'default' team 面
    const inner = JSON.parse(readInbox('default', 'team-lead')[0].text as string)
    expect(inner).toMatchObject({
      type: 'shutdown_approved',
      requestId: 'shutdown-1@w9',
      from: 'teammate',
    })
    // delta ④：in-process 支裁 = paneId/backendType 旧 team-file-missing 面
    expect(inner.paneId).toBeUndefined()
    expect(inner.backendType).toBeUndefined()
  })
})

// ── F-S5 plan 批准面 ──────────────────────────────────────────────────

describe('F-S5 call plan 批准面（isTeamLead + mode 继承）', () => {
  test('dynamic lead 身份 + plan → default 继承 + approved true JSON', async () => {
    setDynamicTeamContext({
      agentId: 'lead-1',
      agentName: 'leader',
      teamName: 't1',
      planModeRequired: false,
    })

    const r = await SendMessageTool.call(
      {
        to: 'w1',
        message: {
          type: 'plan_approval_response',
          request_id: 'plan-1@w1',
          approve: true,
        },
      },
      ctx('t1', 'plan'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe(
      'Plan approved for w1. They will receive the approval and can proceed with implementation.',
    )

    const box = readInbox('t1', 'w1')
    expect(box[0].from).toBe('team-lead')
    const inner = JSON.parse(box[0].text as string)
    expect(inner).toMatchObject({
      type: 'plan_approval_response',
      requestId: 'plan-1@w1',
      approved: true,
      permissionMode: 'default',
    })
  })
})

// ── F-S6 plan 拒绝面 ──────────────────────────────────────────────────

describe('F-S6 call plan 拒绝面', () => {
  test('feedback + approved false + 非 lead throw 文案逐字', async () => {
    setDynamicTeamContext({
      agentId: 'lead-1',
      agentName: 'leader',
      teamName: 't1',
      planModeRequired: false,
    })

    const r = await SendMessageTool.call(
      {
        to: 'w1',
        message: {
          type: 'plan_approval_response',
          request_id: 'plan-2@w1',
          approve: false,
          feedback: 'fix the race',
        },
      },
      ctx('t1'),
    )
    const data = r.data as SendMessageToolOutput
    expect(data.success).toBe(true)
    expect(data.message).toBe(
      'Plan rejected for w1 with feedback: "fix the race"',
    )
    const inner = JSON.parse(readInbox('t1', 'w1')[0].text as string)
    expect(inner).toMatchObject({
      type: 'plan_approval_response',
      approved: false,
      feedback: 'fix the race',
    })

    // 非 lead（teammate 身份 w9 ≠ leadAgentId lead-1 → isTeamLead false；
    // 无身份回落支 = 旧 backwards-compat「建团原会话即 lead」面不触发 throw）
    setDynamicTeamContext({
      agentId: 'w9',
      agentName: 'worker-9',
      teamName: 't1',
      planModeRequired: false,
    })
    await expect(
      SendMessageTool.call(
        {
          to: 'w1',
          message: {
            type: 'plan_approval_response',
            request_id: 'plan-3@w1',
            approve: false,
          },
        },
        ctx('t1'),
      ),
    ).rejects.toThrow(
      'Only the team lead can reject plans. Teammates cannot reject their own or other plans.',
    )
  })
})
