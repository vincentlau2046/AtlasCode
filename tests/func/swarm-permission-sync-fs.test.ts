/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）func 层（真盘：mkdtemp
 * ATLAS_CONFIG_DIR stamp + teams/<t>/permissions/{pending,resolved}/
 * 目录流 + inboxes/ mailbox 变体断言，零模型）。
 *
 * 测面 = permissionSync 928L 全流：
 *  - 目录流（createPermissionRequest 参数回落/缺面 throw /
 *    writePermissionRequest 落盘 + .lock 面 / readPendingPermissions
 *    排序/垃圾文件跳过 / resolvePermission 迁移+删除/负例 2 支 /
 *    readResolvedPermission / pollForResponse 转形 /
 *    cleanupOldResolutions 3 态 / deleteResolvedPermission +
 *    removeWorkerResponse 别名）
 *  - mailbox 变体（getLeaderName 3 态 + sendPermissionRequest/
 *    ResponseViaMailbox 落 inbox 断言）
 *  - sandbox 变体（generateSandboxRequestId 前缀 +
 *    sendSandbox…ViaMailbox 身份/team 缺失负例 + 成功面）
 *  - 身份谓词（isTeamLeader 4 态 + isSwarmWorker 两态）
 *
 * 身份面经 setDynamicTeamContext 驱动（worker 身份支）；无身份缺省
 * （clearDynamicTeamContext）= leader 回落面。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  cleanupOldResolutions,
  createPermissionRequest,
  deleteResolvedPermission,
  generatePermissionRequestId,
  generateSandboxRequestId,
  getLeaderName,
  getPermissionDir,
  isSwarmWorker,
  isTeamLeader,
  pollForResponse,
  readPendingPermissions,
  readResolvedPermission,
  removeWorkerResponse,
  resolvePermission,
  sendPermissionRequestViaMailbox,
  sendPermissionResponseViaMailbox,
  sendSandboxPermissionRequestViaMailbox,
  sendSandboxPermissionResponseViaMailbox,
  writePermissionRequest,
  writeTeamFileAsync,
  type SwarmPermissionRequest,
} from '../../src/swarm'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'

let dir = ''

const TEAM = 't1'

function permDir(sub: 'pending' | 'resolved'): string {
  return join(getPermissionDir(TEAM), sub)
}

function writeResolvedFile(
  id: string,
  over: Partial<SwarmPermissionRequest> = {},
): void {
  mkdirSync(permDir('resolved'), { recursive: true })
  const req: SwarmPermissionRequest = {
    id,
    workerId: 'w1',
    workerName: 'w1',
    teamName: TEAM,
    toolName: 'Bash',
    toolUseId: 'tu-1',
    description: 'd',
    input: {},
    permissionSuggestions: [],
    status: 'approved',
    createdAt: Date.now(),
    ...over,
  }
  writeFileSync(join(permDir('resolved'), `${id}.json`), JSON.stringify(req))
}

function makeRequest(over: Partial<SwarmPermissionRequest> = {}): SwarmPermissionRequest {
  return createPermissionRequest({
    toolName: 'Bash',
    toolUseId: 'tu-1',
    input: { command: 'ls' },
    description: 'list files',
    teamName: TEAM,
    workerId: 'w1',
    workerName: 'w1',
    ...over,
  })
}

async function seedTeamFile(leadName = 'team-lead'): Promise<void> {
  // 字面量直赋 TeamFile（零 cast——S-E3 B 路 nit 核销：cast 会禁该站点
  // 类型检查，未来 TeamFile 加必填字段此 seed 不报）
  await writeTeamFileAsync(TEAM, {
    name: TEAM,
    createdAt: Date.now(),
    leadAgentId: 'team-lead@t1',
    members: [
      {
        agentId: 'team-lead@t1',
        name: leadName,
        joinedAt: Date.now(),
        tmuxPaneId: '',
        cwd: '/tmp',
        subscriptions: [],
      },
    ],
  })
}

function inboxPath(team: string, agent: string): string {
  return join(process.env.ATLAS_CONFIG_DIR!, 'teams', team, 'inboxes', `${agent}.json`)
}

function readInbox(team: string, agent: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(inboxPath(team, agent), 'utf8'))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-perm-sync-'))
  process.env.ATLAS_CONFIG_DIR = dir
})

afterEach(() => {
  delete process.env.ATLAS_CONFIG_DIR
  clearDynamicTeamContext()
  rmSync(dir, { recursive: true, force: true })
})

// ── P-S1 createPermissionRequest 参数面 ───────────────────────────────

describe('P-S1 createPermissionRequest', () => {
  test('显式参数 → 字段面（id perm- 前缀 + status pending + createdAt 数值）', () => {
    const r = makeRequest()
    expect(r.id).toMatch(/^perm-\d+-/)
    expect(r.status).toBe('pending')
    expect(typeof r.createdAt).toBe('number')
    expect(r.workerId).toBe('w1')
    expect(r.workerColor).toBeUndefined()
    expect(r.permissionSuggestions).toEqual([])
  })

  test('workerColor 透传支', () => {
    expect(makeRequest({ workerColor: 'red' }).workerColor).toBe('red')
  })

  test('缺 teamName（无 env 无参）→ throw 逐字', () => {
    expect(() =>
      createPermissionRequest({
        toolName: 'Bash',
        toolUseId: 'tu',
        input: {},
        description: 'd',
        workerId: 'w1',
        workerName: 'w1',
      }),
    ).toThrow('Team name is required for permission requests')
  })

  test('缺 workerId / workerName → throw 逐字（2 支）', () => {
    expect(() =>
      createPermissionRequest({
        toolName: 'Bash',
        toolUseId: 'tu',
        input: {},
        description: 'd',
        teamName: TEAM,
        workerName: 'w1',
      }),
    ).toThrow('Worker ID is required for permission requests')
    expect(() =>
      createPermissionRequest({
        toolName: 'Bash',
        toolUseId: 'tu',
        input: {},
        description: 'd',
        teamName: TEAM,
        workerId: 'w1',
      }),
    ).toThrow('Worker name is required for permission requests')
  })

  test('generatePermissionRequestId 前缀面 + 唯一性（消歧导出名）', () => {
    const a = generatePermissionRequestId()
    const b = generatePermissionRequestId()
    expect(a).toMatch(/^perm-\d+-.{7}$/)
    expect(a).not.toBe(b)
    expect(generateSandboxRequestId()).toMatch(/^sandbox-\d+-.{7}$/)
  })
})

// ── P-S2 目录流（pending/ → resolved/ 迁移）───────────────────────────

describe('P-S2 目录流', () => {
  test('writePermissionRequest 落盘（2 空格 JSON + .lock 面 + 原样返回）', async () => {
    const req = makeRequest()
    const r = await writePermissionRequest(req)
    expect(r).toBe(req) // 原样返回（Promise 面）
    expect(r.id).toMatch(/^perm-/)
    const raw = readFileSync(join(permDir('pending'), `${r.id}.json`), 'utf8')
    expect(raw.startsWith('{\n  "id"')).toBe(true) // space=2 落盘面
    expect(existsSync(join(permDir('pending'), '.lock'))).toBe(true)
  })

  test('readPendingPermissions 排序面（createdAt 升序）+ 垃圾文件跳过', async () => {
    const r1 = makeRequest()
    const r2 = makeRequest()
    const t = Date.now()
    await writePermissionRequest({ ...r1, createdAt: t + 1000 })
    await writePermissionRequest({ ...r2, createdAt: t })
    writeFileSync(join(permDir('pending'), 'garbage.json'), '{not json')
    writeFileSync(join(permDir('pending'), 'schemaless.json'), JSON.stringify({}))

    const pending = await readPendingPermissions(TEAM)
    expect(pending).toHaveLength(2)
    expect(pending[0].createdAt).toBe(t) // 旧者在前
    expect(pending[1].createdAt).toBe(t + 1000)
    // 垃圾文件保留原样（只读不清扫）
    expect(existsSync(join(permDir('pending'), 'garbage.json'))).toBe(true)
  })

  test('readPendingPermissions 目录缺席 → []（ENOENT 保守面）', async () => {
    expect(await readPendingPermissions('no-such-team')).toEqual([])
  })

  test('resolvePermission 批准面（pending 删 + resolved 写 + 字段并集）', async () => {
    const r = await writePermissionRequest(makeRequest())
    expect(
      await resolvePermission(
        r.id,
        { decision: 'approved', resolvedBy: 'leader', feedback: 'ok' },
        TEAM,
      ),
    ).toBe(true)
    expect(existsSync(join(permDir('pending'), `${r.id}.json`))).toBe(false)
    const resolved = await readResolvedPermission(r.id, TEAM)
    expect(resolved!.status).toBe('approved')
    expect(resolved!.resolvedBy).toBe('leader')
    expect(resolved!.feedback).toBe('ok')
    expect(typeof resolved!.resolvedAt).toBe('number')
  })

  test('resolvePermission 拒绝面（status rejected）', async () => {
    const r = await writePermissionRequest(makeRequest())
    await resolvePermission(
      r.id,
      { decision: 'rejected', resolvedBy: 'leader', feedback: 'nope' },
      TEAM,
    )
    const resolved = await readResolvedPermission(r.id, TEAM)
    expect(resolved!.status).toBe('rejected')
  })

  test('resolvePermission 未知 id → false（ENOENT 支）', async () => {
    mkdirSync(permDir('pending'), { recursive: true })
    expect(
      await resolvePermission('ghost', { decision: 'approved', resolvedBy: 'leader' }, TEAM),
    ).toBe(false)
  })

  test('resolvePermission 垃圾 pending 文件 → false（schema 校验支，原文件保留）', async () => {
    mkdirSync(permDir('pending'), { recursive: true })
    writeFileSync(join(permDir('pending'), 'bad.json'), '{oops')
    expect(
      await resolvePermission('bad', { decision: 'approved', resolvedBy: 'leader' }, TEAM),
    ).toBe(false)
    expect(existsSync(join(permDir('pending'), 'bad.json'))).toBe(true)
  })

  test('resolvePermission 缺 teamName（无 env）→ false', async () => {
    expect(
      await resolvePermission('x', { decision: 'approved', resolvedBy: 'leader' }),
    ).toBe(false)
  })

  test('pollForResponse 批准转形（decision approved + ISO timestamp）', async () => {
    const r = await writePermissionRequest(makeRequest())
    await resolvePermission(
      r.id,
      { decision: 'approved', resolvedBy: 'leader', updatedInput: { command: 'ls -la' } },
      TEAM,
    )
    const resp = await pollForResponse(r.id, undefined, TEAM)
    expect(resp!.requestId).toBe(r.id)
    expect(resp!.decision).toBe('approved')
    expect(new Date(resp!.timestamp).toISOString()).toBe(resp!.timestamp)
    expect(resp!.updatedInput).toEqual({ command: 'ls -la' })
  })

  test('pollForResponse 拒绝 → decision denied（approved/rejected 映射面）', async () => {
    const r = await writePermissionRequest(makeRequest())
    await resolvePermission(
      r.id,
      { decision: 'rejected', resolvedBy: 'leader' },
      TEAM,
    )
    expect((await pollForResponse(r.id, undefined, TEAM))!.decision).toBe('denied')
  })

  test('pollForResponse 未解决 → null', async () => {
    expect(await pollForResponse('ghost', undefined, TEAM)).toBeNull()
  })

  test('cleanupOldResolutions 3 态（默认 1h 阈值 / maxAgeMs 0 全清 / 目录缺席 0）', async () => {
    const now = Date.now()
    writeResolvedFile('old', { status: 'approved', resolvedAt: now - 7200_000, createdAt: now - 7200_000 })
    writeResolvedFile('fresh', { status: 'approved', resolvedAt: now, createdAt: now })
    expect(await cleanupOldResolutions(TEAM)).toBe(1) // 仅 old
    expect(existsSync(join(permDir('resolved'), 'fresh.json'))).toBe(true)
    expect(await cleanupOldResolutions(TEAM, 0)).toBe(1) // maxAge 0 全清（>= 边界）
    expect(await cleanupOldResolutions('no-such-team')).toBe(0)
  })

  test('cleanupOldResolutions 垃圾 resolved 文件亦清扫（parse 失败支）', async () => {
    writeResolvedFile('good', { status: 'approved', resolvedAt: Date.now() - 7200_000 })
    mkdirSync(permDir('resolved'), { recursive: true })
    writeFileSync(join(permDir('resolved'), 'junk.json'), '{bad')
    expect(await cleanupOldResolutions(TEAM)).toBe(2)
  })

  test('deleteResolvedPermission / removeWorkerResponse 别名双态', async () => {
    writeResolvedFile('r1')
    expect(await deleteResolvedPermission('r1', TEAM)).toBe(true)
    expect(await deleteResolvedPermission('r1', TEAM)).toBe(false) // ENOENT 支
    writeResolvedFile('r2')
    await removeWorkerResponse('r2', undefined, TEAM)
    expect(existsSync(join(permDir('resolved'), 'r2.json'))).toBe(false)
  })
})

// ── P-S3 mailbox 变体（inbox 落盘面）──────────────────────────────────

describe('P-S3 mailbox 变体', () => {
  test('getLeaderName 3 态（lead 成员名 / lead 缺位 team-lead 回落 / 文件缺席 null）', async () => {
    await seedTeamFile('lead-alpha')
    expect(await getLeaderName(TEAM)).toBe('lead-alpha')

    await writeTeamFileAsync('t2', {
      name: 't2',
      createdAt: Date.now(),
      leadAgentId: 'ghost@t2',
      members: [{ agentId: 'w9@t2', name: 'w9', joinedAt: Date.now(), tmuxPaneId: '', cwd: '/tmp', subscriptions: [] }],
    })
    expect(await getLeaderName('t2')).toBe('team-lead') // lead 成员缺位回落

    expect(await getLeaderName('t3')).toBeNull()
  })

  test('sendPermissionRequestViaMailbox 成功面（leader inbox + 内层 5 字段）', async () => {
    await seedTeamFile()
    const r = makeRequest()
    expect(await sendPermissionRequestViaMailbox(r)).toBe(true)

    const box = readInbox(TEAM, 'team-lead')
    expect(box).toHaveLength(1)
    expect(box[0].from).toBe('w1')
    const inner = JSON.parse(box[0].text as string)
    expect(inner.type).toBe('permission_request')
    expect(inner.request_id).toBe(r.id)
    expect(inner.agent_id).toBe('w1')
    expect(inner.tool_name).toBe('Bash')
    expect(inner.tool_use_id).toBe('tu-1')
  })

  test('sendPermissionRequestViaMailbox leader 缺位 → false', async () => {
    expect(await sendPermissionRequestViaMailbox(makeRequest())).toBe(false)
  })

  test('sendPermissionResponseViaMailbox 批准/拒绝 subtype 面 + sender 回落 team-lead', async () => {
    expect(
      await sendPermissionResponseViaMailbox(
        'w1',
        { decision: 'approved', resolvedBy: 'leader' },
        'req-1',
        TEAM,
      ),
    ).toBe(true)
    expect(
      await sendPermissionResponseViaMailbox(
        'w1',
        { decision: 'rejected', resolvedBy: 'leader', feedback: 'denied-by-lead' },
        'req-2',
        TEAM,
      ),
    ).toBe(true)

    const box = readInbox(TEAM, 'w1')
    expect(box).toHaveLength(2)
    expect(box[0].from).toBe('team-lead') // 无身份 sender 回落
    const ok = JSON.parse(box[0].text as string)
    expect(ok.type).toBe('permission_response')
    expect(ok.subtype).toBe('success')
    expect(ok.request_id).toBe('req-1')
    const err = JSON.parse(box[1].text as string)
    expect(err.subtype).toBe('error')
    expect(err.error).toBe('denied-by-lead')
  })

  test('sendPermissionResponseViaMailbox 缺 teamName → false', async () => {
    expect(
      await sendPermissionResponseViaMailbox(
        'w1',
        { decision: 'approved', resolvedBy: 'leader' },
        'req-1',
      ),
    ).toBe(false)
  })
})

// ── P-S4 sandbox 变体 ─────────────────────────────────────────────────

describe('P-S4 sandbox 变体', () => {
  test('sendSandboxPermissionRequestViaMailbox worker 身份支（dynamic 驱动）', async () => {
    await seedTeamFile()
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'w1',
      teamName: TEAM,
      planModeRequired: false,
    })
    expect(
      await sendSandboxPermissionRequestViaMailbox('api.example.com', 'sb-1', TEAM),
    ).toBe(true)

    const box = readInbox(TEAM, 'team-lead')
    const inner = JSON.parse(box[0].text as string)
    expect(inner.type).toBe('sandbox_permission_request')
    expect(inner.requestId).toBe('sb-1')
    // 内层字段面 = hostPattern 嵌套（mailbox SandboxPermissionRequestMessage）
    expect(inner.hostPattern.host).toBe('api.example.com')
    expect(inner.workerId).toBe('w1')
  })

  test('sendSandboxPermissionRequestViaMailbox 负例 2 支（team 缺 / 身份缺）', async () => {
    await seedTeamFile()
    // 无 team（无参无 dynamic）
    expect(
      await sendSandboxPermissionRequestViaMailbox('h', 'sb-1'),
    ).toBe(false)
    // team 有但 worker 身份缺（无 dynamic 身份）
    expect(
      await sendSandboxPermissionRequestViaMailbox('h', 'sb-1', TEAM),
    ).toBe(false)
  })

  test('sendSandboxPermissionResponseViaMailbox 双态（allow true/false）', async () => {
    expect(
      await sendSandboxPermissionResponseViaMailbox('w1', 'sb-1', 'h', true, TEAM),
    ).toBe(true)
    expect(
      await sendSandboxPermissionResponseViaMailbox('w1', 'sb-2', 'h', false, TEAM),
    ).toBe(true)
    const box = readInbox(TEAM, 'w1')
    expect(JSON.parse(box[0].text as string).allow).toBe(true)
    expect(JSON.parse(box[1].text as string).allow).toBe(false)
  })

  test('sendSandboxPermissionResponseViaMailbox 缺 teamName → false', async () => {
    expect(
      await sendSandboxPermissionResponseViaMailbox('w1', 'sb-1', 'h', true),
    ).toBe(false)
  })
})

// ── P-S5 身份谓词（isTeamLeader / isSwarmWorker）──────────────────────

describe('P-S5 身份谓词', () => {
  test('isTeamLeader 无 team → false', () => {
    expect(isTeamLeader()).toBe(false)
  })

  test('isTeamLeader team + 无 agentId → true（leader 缺省面）', () => {
    expect(isTeamLeader(TEAM)).toBe(true)
  })

  test('isTeamLeader team + agentId=team-lead → true（显式 lead 面）', () => {
    setDynamicTeamContext({
      agentId: 'team-lead',
      agentName: 'lead',
      teamName: TEAM,
      planModeRequired: false,
    })
    expect(isTeamLeader(TEAM)).toBe(true)
  })

  test('isTeamLeader team + worker agentId → false', () => {
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'w1',
      teamName: TEAM,
      planModeRequired: false,
    })
    expect(isTeamLeader(TEAM)).toBe(false)
  })

  test('isSwarmWorker worker 身份 → true（team + agentId + 非 leader 三条件）', () => {
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'w1',
      teamName: TEAM,
      planModeRequired: false,
    })
    expect(isSwarmWorker()).toBe(true)
  })

  test('isSwarmWorker 无身份 → false', () => {
    expect(isSwarmWorker()).toBe(false)
  })
})
