/**
 * messaging 域单测（E-7 S-7e d1，§8.50）：纯函数/纯判定层——agentId 面 /
 * signal / objectGroupBy / extractTextContent / 队友身份无状态层（dynamic ctx
 * + ALStorage 隔离 + isTeamLead/isPlanModeRequired 优先级链）/ 结构化协议
 * 消息 schema 族 8 型 + 谓词 / formatTeammateMessages / collapse 折叠 /
 * directMemberMessage 解析 / isHumanTurn / 控制消息键名 shim / 常量值面 /
 * lockfile 惰性接线面。零磁盘 / 零网络 → unit 层。
 *
 * 真盘面（mailbox 文件读写 / 写锁并发 / mark-read 族 / clear）归
 * tests/func/engine-messaging-fs.test.ts。
 *
 * 探针锚点（§8.50 d1 详案，突变须恰好 1 red）：
 *   P-M3 parseAgentId 字段映射支（agentName/teamName slice 对调）→ 本文件
 *    'P-M3 parseAgentId round-trip：字段映射' 恰 1 红。
 *   （P-M1/P-M2 锚点在 func 层，见 engine-messaging-fs.test.ts 头注。）
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  // agentId 面
  formatAgentId,
  parseAgentId,
  generateRequestId,
  parseRequestId,
  // signal 原语
  createSignal,
  // Object.groupBy polyfill
  objectGroupBy,
  // content block 文本提取
  extractTextContent,
  // 队友身份无状态层
  setDynamicTeamContext,
  clearDynamicTeamContext,
  getDynamicTeamContext,
  getAgentId,
  getAgentName,
  getTeamName,
  isTeammate,
  getTeammateColor,
  isPlanModeRequired,
  isTeamLead,
  getParentSessionId,
  createTeammateContext,
  getTeammateContext,
  isInProcessTeammate,
  runWithTeammateContext,
  // mailbox 纯面（schema 族 + 谓词 + 格式化 + DM 摘要）
  formatTeammateMessages,
  createIdleNotification,
  isIdleNotification,
  createPermissionRequestMessage,
  createPermissionResponseMessage,
  isPermissionRequest,
  isPermissionResponse,
  createSandboxPermissionRequestMessage,
  createSandboxPermissionResponseMessage,
  isSandboxPermissionRequest,
  isSandboxPermissionResponse,
  PlanApprovalRequestMessageSchema,
  PlanApprovalResponseMessageSchema,
  ShutdownRequestMessageSchema,
  ShutdownApprovedMessageSchema,
  ShutdownRejectedMessageSchema,
  createShutdownRequestMessage,
  createShutdownApprovedMessage,
  createShutdownRejectedMessage,
  isShutdownRequest,
  isShutdownApproved,
  isShutdownRejected,
  isPlanApprovalRequest,
  isPlanApprovalResponse,
  isTaskAssignment,
  isTeamPermissionUpdate,
  ModeSetRequestMessageSchema,
  createModeSetRequestMessage,
  isModeSetRequest,
  isStructuredProtocolMessage,
  getLastPeerDmSummary,
  // 谓词面
  isHumanTurn,
  // 控制消息键名 shim
  normalizeControlMessageKeys,
  // shutdown 附件折叠
  collapseTeammateShutdowns,
  // 直接成员消息
  parseDirectMemberMessage,
  sendDirectMemberMessage,
  // 常量值面
  TEAMMATE_MESSAGE_TAG,
  TEAM_LEAD_NAME,
  PermissionModeSchema,
  // lockfile 惰性接线面（真行为 func 层 mailbox 并发测覆盖）
  lock,
  lockSync,
  unlock,
  check,
  type TeammateContext,
  type Message,
} from '../../src/engine'

// 模块态清理（dynamicTeamContext 是模块级单例，防跨测试污染）
afterEach(() => {
  clearDynamicTeamContext()
  delete process.env.ATLAS_PLAN_MODE_REQUIRED
})

// ── agentId 面 ─────────────────────────────────────────────────────────────
describe('agentId 面', () => {
  test('P-M3 parseAgentId round-trip：字段映射', () => {
    // P-M3 探针锚点（slice 对调突变 → 恰 1 红）
    const id = formatAgentId('worker-1', 'my-team')
    expect(id).toBe('worker-1@my-team')
    expect(parseAgentId(id)).toEqual({ agentName: 'worker-1', teamName: 'my-team' })
  })

  test('parseAgentId 无 @ 分隔符 → null', () => {
    expect(parseAgentId('no-separator')).toBeNull()
  })

  test('generateRequestId 格式 + parseRequestId round-trip', () => {
    const rid = generateRequestId('shutdown', 'lead@team-a')
    expect(rid).toMatch(/^shutdown-\d+@lead@team-a$/)
    const parsed = parseRequestId(rid)
    expect(parsed).not.toBeNull()
    expect(parsed!.requestType).toBe('shutdown')
    expect(typeof parsed!.timestamp).toBe('number')
    expect(parsed!.agentId).toBe('lead@team-a')
  })

  test('parseRequestId 缺件 → null', () => {
    expect(parseRequestId('no-at-separator')).toBeNull()
    // 前缀无 '-'（lastDashIndex = -1）
    expect(parseRequestId('abc@x')).toBeNull()
    // 时间戳非数字
    expect(parseRequestId('shutdown-notanumber@x')).toBeNull()
  })
})

// ── objectGroupBy ──────────────────────────────────────────────────────────
describe('objectGroupBy', () => {
  test('按 key selector 分组（含 index 参数）', () => {
    const groups = objectGroupBy(['a', 'bb', 'ccc'], (item, i) =>
      i === 0 ? 'first' : item.length,
    )
    expect(groups).toEqual({ first: ['a'], 2: ['bb'], 3: ['ccc'] })
  })

  test('空可迭代 → 空对象', () => {
    expect(objectGroupBy([], () => 'k')).toEqual({})
  })
})

// ── extractTextContent ─────────────────────────────────────────────────────
describe('extractTextContent', () => {
  test('仅 text 块拼接，非 text 块过滤', () => {
    const blocks = [
      { type: 'text', text: 'a' },
      { type: 'tool_use', id: 't1' },
      { type: 'text', text: 'b' },
    ]
    expect(extractTextContent(blocks)).toBe('ab')
  })

  test('自定义分隔符', () => {
    const blocks = [
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]
    expect(extractTextContent(blocks, ' | ')).toBe('a | b')
  })

  test('空块数组 → 空串', () => {
    expect(extractTextContent([])).toBe('')
  })
})

// ── signal 原语 ────────────────────────────────────────────────────────────
describe('createSignal', () => {
  test('subscribe → emit 投递参数；unsubscribe 停止投递', () => {
    const sig = createSignal<[string, number]>()
    const got: Array<string | number> = []
    const unsub = sig.subscribe((a, b) => {
      got.push(a, b)
    })
    sig.emit('x', 1)
    expect(got).toEqual(['x', 1])
    unsub()
    sig.emit('y', 2)
    expect(got).toEqual(['x', 1])
  })

  test('clear 清空全部订阅者', () => {
    const sig = createSignal<[]>()
    let calls = 0
    sig.subscribe(() => calls++)
    sig.subscribe(() => calls++)
    sig.clear()
    sig.emit()
    expect(calls).toBe(0)
  })
})

// ── 队友身份无状态层（teammate 动态上下文 + ALStorage）──────────────────
describe('teammate 动态上下文', () => {
  test('clean 态：非队友（无 ctx 无 env）', () => {
    expect(getAgentId()).toBeUndefined()
    expect(getAgentName()).toBeUndefined()
    expect(getTeamName()).toBeUndefined()
    expect(getTeammateColor()).toBeUndefined()
    expect(getParentSessionId()).toBeUndefined()
    expect(isTeammate()).toBe(false)
  })

  test('setDynamicTeamContext 覆盖层 + clear 复位', () => {
    setDynamicTeamContext({
      agentId: 'w1@t',
      agentName: 'w1',
      teamName: 't',
      color: 'red',
      planModeRequired: true,
      parentSessionId: 'sess-1',
    })
    expect(getAgentId()).toBe('w1@t')
    expect(getAgentName()).toBe('w1')
    expect(getTeamName()).toBe('t')
    expect(getTeammateColor()).toBe('red')
    expect(getParentSessionId()).toBe('sess-1')
    expect(isTeammate()).toBe(true)
    // 动态 ctx 短路 env 层
    delete process.env.ATLAS_PLAN_MODE_REQUIRED
    expect(isPlanModeRequired()).toBe(true)
    clearDynamicTeamContext()
    expect(getDynamicTeamContext()).toBeNull()
    expect(getAgentId()).toBeUndefined()
    expect(isTeammate()).toBe(false)
  })

  test('getTeamName 回落传入 teamContext（leader 面）', () => {
    expect(getTeamName({ teamName: 'leader-team' })).toBe('leader-team')
  })

  test('isTeammate（tmux 动态 ctx）要求 agentId + teamName 双非空', () => {
    setDynamicTeamContext({
      agentId: 'w',
      agentName: 'w',
      teamName: '',
      planModeRequired: false,
    })
    expect(isTeammate()).toBe(false)
  })

  test('isPlanModeRequired env 回落（无 ctx 时 isEnvTruthy 语义）', () => {
    expect(isPlanModeRequired()).toBe(false)
    process.env.ATLAS_PLAN_MODE_REQUIRED = '1'
    expect(isPlanModeRequired()).toBe(true)
    process.env.ATLAS_PLAN_MODE_REQUIRED = '0'
    expect(isPlanModeRequired()).toBe(false)
  })

  test('isTeamLead 三态（无 ctx / agentId 匹配 / 不匹配）', () => {
    // 无 teamContext → false
    expect(isTeamLead(undefined)).toBe(false)
    expect(isTeamLead(null as unknown as { leadAgentId: string })).toBe(false)
    // 无 agentId（后向兼容：建队原始会话 = lead）
    expect(isTeamLead({ leadAgentId: 'lead-1' })).toBe(true)
    // agentId 匹配
    setDynamicTeamContext({
      agentId: 'lead-1',
      agentName: 'lead',
      teamName: 't',
      planModeRequired: false,
    })
    expect(isTeamLead({ leadAgentId: 'lead-1' })).toBe(true)
    // agentId 不匹配（worker 不是 lead）
    setDynamicTeamContext({
      agentId: 'worker-1',
      agentName: 'worker',
      teamName: 't',
      planModeRequired: false,
    })
    expect(isTeamLead({ leadAgentId: 'lead-1' })).toBe(false)
  })

  test('ALStorage：runWithTeammateContext 内隔离、外不可见、优先于动态 ctx', () => {
    setDynamicTeamContext({
      agentId: 'tmux@t',
      agentName: 'tmux',
      teamName: 't',
      planModeRequired: false,
    })
    const ctx = createTeammateContext({
      agentId: 'in-proc@t',
      agentName: 'ip',
      teamName: 't',
      color: 'green',
      planModeRequired: false,
      parentSessionId: 'parent-1',
      abortController: new AbortController(),
    })
    expect(ctx.isInProcess).toBe(true)
    let inside: TeammateContext | undefined
    runWithTeammateContext(ctx, () => {
      inside = getTeammateContext()
      // ALStorage 优先于动态 ctx
      expect(getAgentId()).toBe('in-proc@t')
      expect(getAgentName()).toBe('ip')
      expect(getTeammateColor()).toBe('green')
      expect(isInProcessTeammate()).toBe(true)
      expect(isTeammate()).toBe(true)
    })
    expect(inside).toBe(ctx)
    // run 外不可见，回落动态 ctx
    expect(getTeammateContext()).toBeUndefined()
    expect(isInProcessTeammate()).toBe(false)
    expect(getAgentId()).toBe('tmux@t')
  })
})

// ── isHumanTurn 谓词 ───────────────────────────────────────────────────────
describe('isHumanTurn', () => {
  test('user 消息（无 toolUseResult 非 meta）→ true', () => {
    expect(isHumanTurn({ type: 'user' } as Message)).toBe(true)
  })

  test('meta user 消息 → false', () => {
    expect(isHumanTurn({ type: 'user', isMeta: true } as Message)).toBe(false)
  })

  test('tool_result user 消息（toolUseResult 存在）→ false', () => {
    expect(
      isHumanTurn({ type: 'user', toolUseResult: { ok: true } } as Message),
    ).toBe(false)
  })

  test('assistant 消息 → false', () => {
    expect(isHumanTurn({ type: 'assistant' } as Message)).toBe(false)
  })
})

// ── 控制消息键名 shim ──────────────────────────────────────────────────────
describe('normalizeControlMessageKeys', () => {
  test('camel requestId → snake request_id（原地改写）', () => {
    const obj = { requestId: 'r1' }
    const out = normalizeControlMessageKeys(obj) as Record<string, unknown>
    expect(out.request_id).toBe('r1')
    expect('requestId' in out).toBe(false)
  })

  test('两键共存：snake 优先（不覆写、不删 camel）', () => {
    const out = normalizeControlMessageKeys({
      request_id: 'a',
      requestId: 'b',
    }) as Record<string, unknown>
    expect(out.request_id).toBe('a')
    expect(out.requestId).toBe('b')
  })

  test('嵌套 response 同样归一', () => {
    const out = normalizeControlMessageKeys({
      requestId: 'r',
      response: { requestId: 'r' },
    }) as { request_id: string; response: Record<string, unknown> }
    expect(out.request_id).toBe('r')
    expect(out.response.request_id).toBe('r')
    expect('requestId' in out.response).toBe(false)
  })

  test('非对象透传（null / 标量）', () => {
    expect(normalizeControlMessageKeys(null)).toBeNull()
    expect(normalizeControlMessageKeys('str')).toBe('str')
  })
})

// ── shutdown 附件折叠 ──────────────────────────────────────────────────────
const shutdownAttachment = (uuid: string) => ({
  type: 'attachment',
  uuid,
  timestamp: `t-${uuid}`,
  attachment: {
    type: 'task_status',
    taskType: 'in_process_teammate',
    status: 'completed',
  },
})

describe('collapseTeammateShutdowns', () => {
  test('单个 shutdown 附件原样透传（count=1 不折叠）', () => {
    const s1 = shutdownAttachment('u1')
    const out = collapseTeammateShutdowns([s1] as never[])
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(s1)
  })

  test('连续 shutdown 折叠为 batch（count + 首条 uuid/timestamp）', () => {
    const out = collapseTeammateShutdowns([
      shutdownAttachment('u1'),
      shutdownAttachment('u2'),
      shutdownAttachment('u3'),
    ] as never[])
    expect(out).toHaveLength(1)
    const batch = out[0]!
    expect(batch.type).toBe('attachment')
    expect(batch.attachment).toEqual({
      type: 'teammate_shutdown_batch',
      count: 3,
    })
    expect(batch.uuid).toBe('u1')
    expect(batch.timestamp).toBe('t-u1')
  })

  test('非 shutdown 消息分隔两个 batch', () => {
    const s1 = shutdownAttachment('u1')
    const s2 = shutdownAttachment('u2')
    const other = { type: 'user' }
    const out = collapseTeammateShutdowns([s1, other, s2] as never[])
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(s1)
    expect(out[1]).toBe(other)
    expect(out[2]).toBe(s2)
  })
})

// ── 直接成员消息（@agent 语法）────────────────────────────────────────────
describe('parseDirectMemberMessage', () => {
  test('@name message → 解析收件人 + 消息体', () => {
    expect(parseDirectMemberMessage('@worker-1 fix the bug')).toEqual({
      recipientName: 'worker-1',
      message: 'fix the bug',
    })
  })

  test('下划线/连字符名', () => {
    expect(parseDirectMemberMessage('@my_worker-2 hi')).toEqual({
      recipientName: 'my_worker-2',
      message: 'hi',
    })
  })

  test('多行消息体保留（/s 标志）', () => {
    expect(parseDirectMemberMessage('@w one\ntwo')).toEqual({
      recipientName: 'w',
      message: 'one\ntwo',
    })
  })

  test('无 @ → null', () => {
    expect(parseDirectMemberMessage('hello there')).toBeNull()
  })

  test('仅 @name 无消息体 → null', () => {
    expect(parseDirectMemberMessage('@worker-1')).toBeNull()
  })

  test('消息体全空白 → null（trim 后空）', () => {
    expect(parseDirectMemberMessage('@worker-1   ')).toBeNull()
  })
})

describe('sendDirectMemberMessage', () => {
  test('无 team context → no_team_context', async () => {
    const r = await sendDirectMemberMessage('a', 'hi', undefined)
    expect(r).toEqual({ success: false, error: 'no_team_context' })
  })

  test('team context 无 writeToMailbox 注入 → no_team_context', async () => {
    const r = await sendDirectMemberMessage(
      'a',
      'hi',
      { teamName: 't' },
      undefined,
    )
    expect(r).toEqual({ success: false, error: 'no_team_context' })
  })

  test('未知收件人 → unknown_recipient（带 recipientName）', async () => {
    // writeToMailbox 守卫先于收件人查找（!teamContext || !writeToMailbox
    // 短路 no_team_context），故本测须注入 stub 函数才能到达收件人面
    const r = await sendDirectMemberMessage(
      'beta',
      'hi',
      { teamName: 't', teammates: { a: { name: 'alpha' } } },
      async () => {},
    )
    expect(r).toEqual({
      success: false,
      error: 'unknown_recipient',
      recipientName: 'beta',
    })
  })

  test('成功路径：注入函数收到 (recipient, {from:user}, teamName)', async () => {
    const calls: Array<
      [string, { from: string; text: string; timestamp: string }, string]
    > = []
    const r = await sendDirectMemberMessage('alpha', 'go', {
      teamName: 't',
      teammates: { a: { name: 'alpha' } },
    }, (recipientName, message, teamName) => {
      calls.push([recipientName, message, teamName])
    })
    expect(r).toEqual({ success: true, recipientName: 'alpha' })
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toBe('alpha')
    expect(calls[0]![1].from).toBe('user')
    expect(calls[0]![1].text).toBe('go')
    expect(typeof calls[0]![1].timestamp).toBe('string')
    expect(calls[0]![2]).toBe('t')
  })
})

// ── formatTeammateMessages（XML 面）────────────────────────────────────────
describe('formatTeammateMessages', () => {
  test('完整属性（color + summary）', () => {
    const out = formatTeammateMessages([
      { from: 'w1', text: 'hi', timestamp: 't', color: 'red', summary: 'greeting' },
    ])
    expect(out).toBe(
      '<teammate-message teammate_id="w1" color="red" summary="greeting">\nhi\n</teammate-message>',
    )
  })

  test('缺省 color/summary 不出属性', () => {
    const out = formatTeammateMessages([{ from: 'w1', text: 'hi', timestamp: 't' }])
    expect(out).toBe(
      '<teammate-message teammate_id="w1">\nhi\n</teammate-message>',
    )
  })

  test('多消息空行连接 + 使用 TEAMMATE_MESSAGE_TAG 常量', () => {
    const out = formatTeammateMessages([
      { from: 'a', text: '1', timestamp: 't' },
      { from: 'b', text: '2', timestamp: 't' },
    ])
    expect(out).toBe(
      `<${TEAMMATE_MESSAGE_TAG} teammate_id="a">\n1\n</${TEAMMATE_MESSAGE_TAG}>\n\n` +
        `<${TEAMMATE_MESSAGE_TAG} teammate_id="b">\n2\n</${TEAMMATE_MESSAGE_TAG}>`,
    )
  })
})

// ── 结构化协议消息 schema 族 + 谓词 ────────────────────────────────────────
describe('IdleNotification 面', () => {
  test('create + isIdleNotification JSON round-trip', () => {
    const n = createIdleNotification('w1', {
      idleReason: 'available',
      summary: 'done',
    })
    expect(n.type).toBe('idle_notification')
    expect(n.from).toBe('w1')
    expect(isIdleNotification(JSON.stringify(n))).toEqual(n)
  })

  test('垃圾文本 / 异型 → null', () => {
    expect(isIdleNotification('not json')).toBeNull()
    expect(isIdleNotification(JSON.stringify({ type: 'other' }))).toBeNull()
  })
})

describe('Permission 消息族', () => {
  test('createPermissionRequestMessage suggestions 缺省 []', () => {
    const r = createPermissionRequestMessage({
      request_id: 'r1',
      agent_id: 'w1',
      tool_name: 'Bash',
      tool_use_id: 'tu1',
      description: 'run cmd',
      input: { command: 'ls' },
    })
    expect(r.permission_suggestions).toEqual([])
  })

  test('isPermissionRequest JSON round-trip', () => {
    const r = createPermissionRequestMessage({
      request_id: 'r1',
      agent_id: 'w1',
      tool_name: 'Bash',
      tool_use_id: 'tu1',
      description: 'run cmd',
      input: {},
      permission_suggestions: [{ x: 1 }],
    })
    expect(isPermissionRequest(JSON.stringify(r))).toEqual(r)
  })

  test('createPermissionResponseMessage success 支（response 嵌套）', () => {
    const r = createPermissionResponseMessage({
      request_id: 'r1',
      subtype: 'success',
      updated_input: { a: 1 },
    })
    expect(r.subtype).toBe('success')
    if (r.subtype === 'success') {
      expect(r.response?.updated_input).toEqual({ a: 1 })
    }
  })

  test('createPermissionResponseMessage error 支缺省文案', () => {
    const r = createPermissionResponseMessage({ request_id: 'r1', subtype: 'error' })
    expect(r).toEqual({
      type: 'permission_response',
      request_id: 'r1',
      subtype: 'error',
      error: 'Permission denied',
    })
  })

  test('isPermissionResponse JSON round-trip（error 支）', () => {
    const r = createPermissionResponseMessage({
      request_id: 'r1',
      subtype: 'error',
      error: 'nope',
    })
    expect(isPermissionResponse(JSON.stringify(r))?.error).toBe('nope')
  })
})

describe('SandboxPermission 消息族', () => {
  test('createSandboxPermissionRequestMessage hostPattern 包装 + 时间戳', () => {
    const r = createSandboxPermissionRequestMessage({
      requestId: 'r',
      workerId: 'w',
      workerName: 'wn',
      host: 'example.com',
    })
    expect(r.hostPattern).toEqual({ host: 'example.com' })
    expect(typeof r.createdAt).toBe('number')
  })

  test('isSandboxPermissionRequest JSON round-trip', () => {
    const r = createSandboxPermissionRequestMessage({
      requestId: 'r',
      workerId: 'w',
      workerName: 'wn',
      host: 'h',
    })
    expect(isSandboxPermissionRequest(JSON.stringify(r))).toEqual(r)
  })

  test('createSandboxPermissionResponseMessage + round-trip', () => {
    const r = createSandboxPermissionResponseMessage({
      requestId: 'r',
      host: 'h',
      allow: true,
    })
    expect(isSandboxPermissionResponse(JSON.stringify(r))).toEqual(r)
  })
})

describe('PlanApproval schema 族（zod 面）', () => {
  const validReq = {
    type: 'plan_approval_request',
    from: 'w1',
    timestamp: 't',
    planFilePath: '/p.md',
    planContent: 'content',
    requestId: 'r1',
  }

  test('schema 收合法、拒缺字段', () => {
    expect(PlanApprovalRequestMessageSchema().safeParse(validReq).success).toBe(
      true,
    )
    const missing = { ...validReq }
    delete missing.planContent
    expect(
      PlanApprovalRequestMessageSchema().safeParse(missing).success,
    ).toBe(false)
  })

  test('isPlanApprovalRequest JSON round-trip', () => {
    expect(isPlanApprovalRequest(JSON.stringify(validReq))).toEqual(validReq)
  })

  test('PlanApprovalResponse permissionMode 枚举校验', () => {
    const base = {
      type: 'plan_approval_response',
      requestId: 'r1',
      approved: true,
      timestamp: 't',
    }
    expect(
      PlanApprovalResponseMessageSchema()
        .safeParse({ ...base, permissionMode: 'acceptEdits' })
        .success,
    ).toBe(true)
    expect(
      PlanApprovalResponseMessageSchema()
        .safeParse({ ...base, permissionMode: 'bogus-mode' })
        .success,
    ).toBe(false)
  })

  test('isPlanApprovalResponse JSON round-trip', () => {
    const msg = {
      type: 'plan_approval_response',
      requestId: 'r1',
      approved: false,
      feedback: 'tighten scope',
      timestamp: 't',
    }
    expect(isPlanApprovalResponse(JSON.stringify(msg))).toEqual(msg)
  })
})

describe('Shutdown schema 族（zod 面）', () => {
  test('shutdown request create + isShutdownRequest round-trip', () => {
    const m = createShutdownRequestMessage({
      requestId: 'r1',
      from: 'team-lead',
      reason: 'scale down',
    })
    expect(m.type).toBe('shutdown_request')
    expect(isShutdownRequest(JSON.stringify(m))).toEqual(m)
  })

  test('schema 拒非法 type', () => {
    expect(
      ShutdownRequestMessageSchema()
        .safeParse({
          type: 'shutdown_approved',
          requestId: 'r',
          from: 'f',
          timestamp: 't',
        })
        .success,
    ).toBe(false)
  })

  test('shutdown approved create（paneId/backendType 可选）+ round-trip', () => {
    const m = createShutdownApprovedMessage({
      requestId: 'r1',
      from: 'w1',
      paneId: 'pane-9',
    })
    expect(isShutdownApproved(JSON.stringify(m))).toEqual(m)
    const bare = createShutdownApprovedMessage({ requestId: 'r1', from: 'w1' })
    expect(bare.paneId).toBeUndefined()
  })

  test('shutdown rejected create + round-trip', () => {
    const m = createShutdownRejectedMessage({
      requestId: 'r1',
      from: 'w1',
      reason: 'busy',
    })
    expect(isShutdownRejected(JSON.stringify(m))).toEqual(m)
  })
})

describe('TaskAssignment / TeamPermissionUpdate / ModeSet 面', () => {
  test('isTaskAssignment JSON round-trip', () => {
    const m = {
      type: 'task_assignment',
      taskId: 't1',
      subject: 's',
      description: 'd',
      assignedBy: 'lead',
      timestamp: 'ts',
    }
    expect(isTaskAssignment(JSON.stringify(m))).toEqual(m)
  })

  test('isTeamPermissionUpdate JSON round-trip', () => {
    const m = {
      type: 'team_permission_update',
      permissionUpdate: {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'ls' }],
        behavior: 'allow',
        destination: 'session',
      },
      directoryPath: '/tmp/x',
      toolName: 'Bash',
    }
    expect(isTeamPermissionUpdate(JSON.stringify(m))).toEqual(m)
  })

  test('createModeSetRequestMessage + isModeSetRequest round-trip', () => {
    const m = createModeSetRequestMessage({ mode: 'plan', from: 'lead' })
    expect(isModeSetRequest(JSON.stringify(m))).toEqual(m)
  })

  test('非法 mode 被 schema 枚举拒绝', () => {
    expect(
      isModeSetRequest(
        JSON.stringify({ type: 'mode_set_request', mode: 'bogus', from: 'l' }),
      ),
    ).toBeNull()
  })
})

describe('isStructuredProtocolMessage（10 型路由集）', () => {
  test('10 种协议类型全识别', () => {
    const samples: string[] = [
      JSON.stringify(
        createPermissionRequestMessage({
          request_id: 'r',
          agent_id: 'w',
          tool_name: 'B',
          tool_use_id: 't',
          description: 'd',
          input: {},
        }),
      ),
      JSON.stringify(
        createPermissionResponseMessage({ request_id: 'r', subtype: 'success' }),
      ),
      JSON.stringify(
        createSandboxPermissionRequestMessage({
          requestId: 'r',
          workerId: 'w',
          workerName: 'wn',
          host: 'h',
        }),
      ),
      JSON.stringify(
        createSandboxPermissionResponseMessage({
          requestId: 'r',
          host: 'h',
          allow: true,
        }),
      ),
      JSON.stringify(
        createShutdownRequestMessage({ requestId: 'r', from: 'f' }),
      ),
      JSON.stringify(createShutdownApprovedMessage({ requestId: 'r', from: 'f' })),
      JSON.stringify({
        type: 'team_permission_update',
        permissionUpdate: {
          type: 'addRules',
          rules: [],
          behavior: 'allow',
          destination: 'session',
        },
        directoryPath: '/d',
        toolName: 'B',
      }),
      JSON.stringify(createModeSetRequestMessage({ mode: 'plan', from: 'f' })),
      JSON.stringify({
        type: 'plan_approval_request',
        from: 'f',
        timestamp: 't',
        planFilePath: 'p',
        planContent: 'c',
        requestId: 'r',
      }),
      JSON.stringify({
        type: 'plan_approval_response',
        requestId: 'r',
        approved: true,
        timestamp: 't',
      }),
    ]
    for (const s of samples) {
      expect(isStructuredProtocolMessage(s)).toBe(true)
    }
  })

  test('集外类型 / 非 JSON / 空 → false', () => {
    // idle_notification 不在 10 型路由集
    expect(
      isStructuredProtocolMessage(
        JSON.stringify(createIdleNotification('w1')),
      ),
    ).toBe(false)
    // shutdown_rejected 亦不在 10 型路由集（旧仓逐字 10 型：终止信号无
    // useInboxPoller 路由处理器；逐字裁面登记于 mailbox.ts 头注，非移植遗漏）
    expect(
      isStructuredProtocolMessage(
        JSON.stringify(
          createShutdownRejectedMessage({ requestId: 'r', from: 'f', reason: 'x' }),
        ),
      ),
    ).toBe(false)
    expect(isStructuredProtocolMessage('garbage')).toBe(false)
    expect(isStructuredProtocolMessage('null')).toBe(false)
  })
})

// ── getLastPeerDmSummary（DM 摘要提取）─────────────────────────────────────
const dmAssistantMsg = (input: Record<string, unknown>): Message =>
  ({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', name: 'SendMessage', input }],
    },
  }) as Message

describe('getLastPeerDmSummary', () => {
  test('末尾 SendMessage tool_use → [to X] 摘要', () => {
    const msgs = [dmAssistantMsg({ to: 'worker-1', message: 'short msg' })]
    expect(getLastPeerDmSummary(msgs)).toBe('[to worker-1] short msg')
  })

  test('显式 summary 字段优先于截断', () => {
    const msgs = [
      dmAssistantMsg({
        to: 'w',
        message: 'x'.repeat(200),
        summary: 'S',
      }),
    ]
    expect(getLastPeerDmSummary(msgs)).toBe('[to w] S')
  })

  test('无 summary 时消息体截断 80 字符', () => {
    const long = 'x'.repeat(100)
    const msgs = [dmAssistantMsg({ to: 'w', message: long })]
    expect(getLastPeerDmSummary(msgs)).toBe(`[to w] ${'x'.repeat(80)}`)
  })

  test('team-lead 收件人排除 → undefined', () => {
    expect(
      getLastPeerDmSummary([dmAssistantMsg({ to: TEAM_LEAD_NAME, message: 'm' })]),
    ).toBeUndefined()
  })

  test('广播 * 排除 → undefined', () => {
    expect(
      getLastPeerDmSummary([dmAssistantMsg({ to: '*', message: 'm' })]),
    ).toBeUndefined()
  })

  test('user 字符串提示边界（wake-up boundary）截断扫描 → undefined', () => {
    const msgs = [
      dmAssistantMsg({ to: 'w', message: 'm' }),
      { type: 'user', message: { content: 'new prompt' } } as Message,
    ]
    expect(getLastPeerDmSummary(msgs)).toBeUndefined()
  })

  test('无 SendMessage 块的 assistant 消息跳过', () => {
    const msgs = [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'plain' }] },
      } as Message,
    ]
    expect(getLastPeerDmSummary(msgs)).toBeUndefined()
  })
})

// ── 常量值面 + lockfile 接线面 ─────────────────────────────────────────────
describe('常量值面（旧仓逐字）', () => {
  test('TEAMMATE_MESSAGE_TAG / TEAM_LEAD_NAME 值', () => {
    expect(TEAMMATE_MESSAGE_TAG).toBe('teammate-message')
    expect(TEAM_LEAD_NAME).toBe('team-lead')
  })

  test('PermissionModeSchema 5 值枚举全收、未知拒', () => {
    for (const m of [
      'default',
      'acceptEdits',
      'bypassPermissions',
      'plan',
      'dontAsk',
    ]) {
      expect(PermissionModeSchema().safeParse(m).success).toBe(true)
    }
    expect(PermissionModeSchema().safeParse('bogus').success).toBe(false)
  })
})

describe('lockfile 惰性接线面（真行为 func 层并发测覆盖）', () => {
  test('四导出为函数（proper-lockfile 惰性访问器接线）', () => {
    expect(typeof lock).toBe('function')
    expect(typeof lockSync).toBe('function')
    expect(typeof unlock).toBe('function')
    expect(typeof check).toBe('function')
  })
})

// 防未用导入告警（ModeSetRequestMessageSchema 经 isModeSetRequest 间接面已覆盖；
// ShutdownApprovedMessageSchema / ShutdownRejectedMessageSchema 经 is* 谓词覆盖；
// 显式断言 schema 可调用以钉死门面导出面）
test('门面 schema 导出面可调（门面一致性钉死）', () => {
  expect(ModeSetRequestMessageSchema()).toBeDefined()
  expect(ShutdownApprovedMessageSchema()).toBeDefined()
  expect(ShutdownRejectedMessageSchema()).toBeDefined()
})
