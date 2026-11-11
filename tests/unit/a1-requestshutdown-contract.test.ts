import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  isShutdownRequestFromMember,
  isShutdownRequestDenied,
  createShutdownRequestFromMemberMessage,
  isStructuredProtocolMessage,
  getInboxPath,
  readMailbox,
  writeToMailbox,
} from '../../src/engine/messaging/mailbox'
import {
  RequestShutdownTool,
  recordMemberShutdownRequestDenied,
  clearMemberShutdownRequestState,
  resetRequestShutdownStateForTest,
  isMemberShutdownRequestPending,
} from '../../src/engine/tools/team/requestShutdownTool'
import { collectPendingMemberRequests } from '../../src/engine/tools/team/waitForTeammatesTool'
import {
  REQUEST_SHUTDOWN_TOOL_NAME,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
} from '../../src/engine/tools/toolNames'
import { setDynamicTeamContext } from '../../src/engine/messaging/teammate'

/**
 * 0.1.96 A1 requestShutdown 段 I 判别格（lock-face
 * docs/2026-11-11-a1-requestshutdown-lockface.md f4 批复 2026-11-11 +
 * §8 两硬条件）：
 *
 *   ① 契约两态：shutdown_request_from_member / shutdown_request_denied
 *     schema 正反例 + isStructuredProtocolMessage 白名单扩两型。
 *   ② 工具体副作用白名单（lock-face 冻结）：call 面 = 仅 mailbox 写；
 *     static 断言源无 abort/graceful/selfTerminate/terminate 符号。
 *   ③ 防环有界：deny 锁存跨轮（新输入解锁面在 runner 判别格）/ 在途
 *     唯一性 fail-visible（重复请求零第二次 mailbox 写）。
 *   ④ WaitForTeammates 扩格：pending_requests 读面（lead inbox 过滤
 *     unread 新类型，不 mark read——裁定后 pending 不再现 = 处置动作
 *     mark read 推进，read 态推进点在 sendMessageTool 侧格）。
 *   ⑤ 注入面：team-essential 保底 + IN_PROCESS_TEAMMATE_ALLOWED_TOOLS
 *     窗口含 RequestShutdown。
 */

let tmpDir: string
let prevConfigDir: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'a1-requestshutdown-'))
  prevConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = tmpDir
  resetRequestShutdownStateForTest()
})

afterEach(() => {
  if (prevConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = prevConfigDir
  rmSync(tmpDir, { recursive: true, force: true })
  resetRequestShutdownStateForTest()
  setDynamicTeamContext(null)
})

describe('A1 ① 契约两态 schema', () => {
  test('shutdown_request_from_member 正例解析 + 反例拒判', () => {
    const msg = createShutdownRequestFromMemberMessage({
      requestId: 'rs-1',
      from: 'worker-a',
      reason: 'task complete',
    })
    const parsed = isShutdownRequestFromMember(JSON.stringify(msg))
    expect(parsed).not.toBeNull()
    expect(parsed!.type).toBe('shutdown_request_from_member')
    expect(parsed!.requestId).toBe('rs-1')
    expect(parsed!.from).toBe('worker-a')
    // 反例：缺 requestId / 错 type / 非 JSON
    expect(
      isShutdownRequestFromMember(
        JSON.stringify({ type: 'shutdown_request_from_member', from: 'x' }),
      ),
    ).toBeNull()
    expect(
      isShutdownRequestFromMember(JSON.stringify({ type: 'shutdown_request' })),
    ).toBeNull()
    expect(isShutdownRequestFromMember('not json')).toBeNull()
  })

  test('shutdown_request_denied 正例解析 + 反例拒判', () => {
    const parsed = isShutdownRequestDenied(
      JSON.stringify({
        type: 'shutdown_request_denied',
        requestId: 'rs-1',
        to: 'worker-a',
        from: 'team-lead',
        timestamp: new Date().toISOString(),
        reason: 'still needed',
      }),
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.requestId).toBe('rs-1')
    expect(
      isShutdownRequestDenied(JSON.stringify({ type: 'shutdown_request_denied' })),
    ).toBeNull()
  })

  test('isStructuredProtocolMessage 白名单扩两型', () => {
    expect(
      isStructuredProtocolMessage(
        JSON.stringify({ type: 'shutdown_request_from_member' }),
      ),
    ).toBe(true)
    expect(
      isStructuredProtocolMessage(
        JSON.stringify({ type: 'shutdown_request_denied' }),
      ),
    ).toBe(true)
    expect(
      isStructuredProtocolMessage(JSON.stringify({ type: 'chat' })),
    ).toBe(false)
  })
})

describe('A1 ② 工具体副作用白名单', () => {
  const toolSrc = readFileSync(
    join(import.meta.dir, '..', '..', 'src', 'engine', 'tools', 'team', 'requestShutdownTool.ts'),
    'utf8',
  )

  test('static：源面零 abort/graceful/selfTerminate/terminate 符号', () => {
    expect(/abortController|abort\(/.test(toolSrc)).toBe(false)
    expect(/gracefulShutdown|selfTerminatePort|terminate/i.test(toolSrc)).toBe(
      false,
    )
    // 工具体恰一 mailbox 写点（writeToMailbox）
    expect(toolSrc.match(/writeToMailbox\(/g)).toHaveLength(1)
  })
})

describe('A1 ③ 防环有界（成员态机）', () => {
  test('在途唯一性：pending 期重复请求 fail-visible 不重写', async () => {
    setDynamicTeamContext({
      agentId: 'a1',
      agentName: 'worker-a',
      teamName: 't1',
      planModeRequired: false,
    })
    const leadInbox = getInboxPath('team-lead', 't1')
    mkdirSync(join(leadInbox, '..'), { recursive: true })
    writeFileSync(leadInbox, '[]')

    const first = await RequestShutdownTool.call(
      { reason: 'done' },
      {} as never,
    )
    expect(first.data.success).toBe(true)
    expect(isMemberShutdownRequestPending('worker-a')).toBe(true)

    const second = await RequestShutdownTool.call({ reason: 'again' }, {} as never)
    expect(second.data.success).toBe(false)
    // 在途唯一性 = 不重写（lead inbox 恰一条成员请求）
    const messages = await readMailbox('team-lead', 't1')
    const memberReqs = messages.filter(m =>
      isShutdownRequestFromMember(m.text),
    )
    expect(memberReqs).toHaveLength(1)
  })

  test('deny 锁存：denied 后请求被拒 + clear 解锁', async () => {
    setDynamicTeamContext({
      agentId: 'a1',
      agentName: 'worker-b',
      teamName: 't1',
      planModeRequired: false,
    })
    const leadInbox = getInboxPath('team-lead', 't1')
    mkdirSync(join(leadInbox, '..'), { recursive: true })
    writeFileSync(leadInbox, '[]')

    recordMemberShutdownRequestDenied('worker-b', 'rs-9')
    const blocked = await RequestShutdownTool.call({ reason: 'retry' }, {} as never)
    expect(blocked.data.success).toBe(false)
    // 锁存期零 mailbox 写
    expect((await readMailbox('team-lead', 't1'))).toHaveLength(0)

    // 新输入解锁（runner 在 new_message/shutdown_request 事件调用 clear）
    clearMemberShutdownRequestState('worker-b')
    const allowed = await RequestShutdownTool.call({ reason: 'after input' }, {} as never)
    expect(allowed.data.success).toBe(true)
  })
})

describe('A1 ④ WaitForTeammates 扩格 pending_requests 读面', () => {
  test('lead inbox unread 成员请求呈 pending；read 后不再现', async () => {
    setDynamicTeamContext({
      agentId: 'a1',
      agentName: 'worker-c',
      teamName: 't2',
      planModeRequired: false,
    })
    const leadInbox = getInboxPath('team-lead', 't2')
    mkdirSync(join(leadInbox, '..'), { recursive: true })
    writeFileSync(leadInbox, '[]')

    // 成员 RequestShutdown 写入（真盘链路）
    await RequestShutdownTool.call({ reason: 'blocked' }, {} as never)

    const pending = await collectPendingMemberRequests('t2')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.from).toBe('worker-c')
    expect(pending[0]!.reason).toBe('blocked')
    expect(pending[0]!.request_id).toBe(isMemberPendingRequestId('worker-c'))

    // 处置动作 mark read 后（deny/approve 核销路径写 read 态）不再现
    const messages = await readMailbox('team-lead', 't2')
    const idx = messages.findIndex(m => isShutdownRequestFromMember(m.text))
    const { markMessageAsReadByIndex } = await import(
      '../../src/engine/messaging/mailbox'
    )
    await markMessageAsReadByIndex('team-lead', 't2', idx)
    expect(await collectPendingMemberRequests('t2')).toHaveLength(0)
  })

  test('WaitForTeammates 源面 pending 扫描零 mark read（裁定权留 lead）', () => {
    const src = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'engine', 'tools', 'team', 'waitForTeammatesTool.ts'),
      'utf8',
    )
    const scanBody = src.slice(src.indexOf('collectPendingMemberRequests'))
    expect(/markMessage|markMessages/.test(scanBody)).toBe(false)
  })
})

// 测试辅助：pending request_id 直读（③/④ 关联断言面）
import { peekPendingMemberShutdownRequest } from '../../src/engine/tools/team/requestShutdownTool'
function isMemberPendingRequestId(memberName: string): string | undefined {
  return peekPendingMemberShutdownRequest(memberName)
}

describe('A1 ⑤ 注入面', () => {
  test('team-essential 保底 + IN_PROCESS_TEAMMATE_ALLOWED_TOOLS 窗口含 RequestShutdown', () => {
    const runnerSrc = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'swarm', 'inProcessRunner.ts'),
      'utf8',
    )
    // team-essential 8 件（保底集含 REQUEST_SHUTDOWN_TOOL_NAME）
    expect(runnerSrc).toContain('REQUEST_SHUTDOWN_TOOL_NAME')
    expect(IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(REQUEST_SHUTDOWN_TOOL_NAME)).toBe(
      true,
    )
  })

  test('runner poll 感知 shutdown_request_denied（WaitResult 新型 + mark read + 锁存接线）', () => {
    const runnerSrc = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'swarm', 'inProcessRunner.ts'),
      'utf8',
    )
    expect(runnerSrc).toMatch(/type:\s*'shutdown_request_denied'/)
    expect(runnerSrc).toContain('recordMemberShutdownRequestDenied')
    expect(runnerSrc).toContain('clearMemberShutdownRequestState')
  })

  test('SendMessage 分派面：shutdown_request_denied 支 + 处置 read 态推进（f4 §8 硬条件 2）', () => {
    const src = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'engine', 'tools', 'team', 'sendMessageTool.ts'),
      'utf8',
    )
    expect(src).toMatch(/case\s+'shutdown_request_denied'/)
    // deny = 发 denied 时 mark read（成员请求核销）；approve = shutdown_request
    // 分派时成员请求核销（member-name 关联）
    expect(src).toMatch(/markMessagesAsReadByPredicate/)
    // lead 行为指引面（f4 §8 硬条件 1）：prompt 面新类型文档
    expect(src).toContain('shutdown_request_denied')
  })
})

/**
 * A1 §9 安全硬化三修判别格（f4 批复 23588bfc，0.1.96 发布前必改）：
 *   修① HIGH deny 回执发送方双验（envelope from = lead && parsed.to = 本成员）
 *   修② MEDIUM approve/deny handler isTeamLead fail-closed 门（sibling parity）
 *   修③ MEDIUM 三站点 envelope 身份绑定（body 身份字段仅展示用途）
 */
describe('A1 §9 安全硬化三修', () => {
  test('修① deny poll 发送方双验在场 + from 不再硬编码 TEAM_LEAD_NAME（static）', () => {
    const runnerSrc = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'swarm', 'inProcessRunner.ts'),
      'utf8',
    )
    // 双验谓词：envelope = lead 且回执 to = 本成员，验讫才 mark read + 锁存
    expect(runnerSrc).toMatch(
      /m\.from\.toLowerCase\(\)\s*===\s*TEAM_LEAD_NAME\.toLowerCase\(\)/,
    )
    expect(runnerSrc).toMatch(
      /parsed\.to\.toLowerCase\(\)\s*===\s*identity\.agentName\.toLowerCase\(\)/,
    )
    // return 面用验证过的 envelope 值（deniedFrom），deny 支不再硬编码
    expect(runnerSrc).toContain('deniedFrom')
  })

  test('修② 成员（非 lead）分派 deny → fail-closed throw；静态双门在场', async () => {
    const src = readFileSync(
      join(import.meta.dir, '..', '..', 'src', 'engine', 'tools', 'team', 'sendMessageTool.ts'),
      'utf8',
    )
    expect(src).toContain(
      'Only the team lead can deny member shutdown requests.',
    )
    expect(src).toContain(
      'Only the team lead can approve member shutdown requests.',
    )
    // 行为面：成员身份（agentId ≠ leadAgentId）直接分派 deny → throw
    const { SendMessageTool } = await import(
      '../../src/engine/tools/team/sendMessageTool'
    )
    setDynamicTeamContext({
      agentId: 'member-a9',
      agentName: 'worker-a9',
      teamName: 't9',
      planModeRequired: false,
    })
    const memberCtx = {
      getAppState: () => ({
        teamContext: {
          teamName: 't9',
          leadAgentId: 'lead-9',
          agentId: 'member-a9',
        },
        toolPermissionContext: { mode: 'default' },
      }),
    }
    await expect(
      SendMessageTool.call(
        {
          to: 'worker-other',
          message: { type: 'shutdown_request_denied', request_id: 'rs-x' },
        },
        memberCtx as never,
      ),
    ).rejects.toThrow(
      'Only the team lead can deny member shutdown requests.',
    )
    await expect(
      SendMessageTool.call(
        {
          to: 'worker-other',
          message: { type: 'shutdown_request', reason: 'nope' },
        },
        memberCtx as never,
      ),
    ).rejects.toThrow(
      'Only the team lead can approve member shutdown requests.',
    )
  })

  test('修③ envelope 绑定：body.from ≠ envelope 不呈 pending + 不占 ownUnread 名额', async () => {
    setDynamicTeamContext({
      agentId: 'a10',
      agentName: 'worker-true',
      teamName: 't10',
      planModeRequired: false,
    })
    const leadInbox = getInboxPath('team-lead', 't10')
    mkdirSync(join(leadInbox, '..'), { recursive: true })
    // 伪造：envelope from = attacker，body.from = worker-true（旧码会把
    // 伪请求呈给 lead 并占 victim 的在途唯一性名额）
    writeFileSync(
      leadInbox,
      JSON.stringify([
        {
          from: 'attacker',
          text: JSON.stringify(
            createShutdownRequestFromMemberMessage({
              requestId: 'rs-spoof-1',
              from: 'worker-true',
              reason: 'spoofed',
            }),
          ),
          timestamp: new Date().toISOString(),
          color: 'red',
        },
      ]),
    )

    // collect 面：伪造消息不呈（envelope ≠ body）
    expect(await collectPendingMemberRequests('t10')).toHaveLength(0)

    // ownUnread 面：victim 再调 RequestShutdown 不被伪造消息挡（唯一在途
    // 名额不被占用）——真投递成功
    const result = await RequestShutdownTool.call({ reason: 'real' }, {} as never)
    expect(result.data.success).toBe(true)

    // 真 envelope = body 的请求正常呈（正例不误伤）
    const pending = await collectPendingMemberRequests('t10')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.from).toBe('worker-true')
    expect(pending[0]!.request_id).not.toBe('rs-spoof-1')
  })
})
